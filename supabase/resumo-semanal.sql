-- =====================================================================
-- Rumia — Resumo semanal + limiares de queda de comparência
-- =====================================================================
-- Corre este ficheiro no SQL Editor do Supabase, DEPOIS de:
--   schema.sql, notifications.sql, trainer-notifications.sql e multitenant.sql
-- É seguro re-executar.
--
-- O problema que resolve:
--   A app já calcula documentos a caducar, quotas em dívida e atletas em
--   risco — mas só quem ABRE o Painel os vê. Um exame médico caducado é um
--   risco legal, não um cartão bonito: precisa de sair da app e chegar a
--   quem decide, mesmo que essa pessoa não entre na app nessa semana.
--
-- O que cria:
--   1. Limiares da queda de comparência (definições do clube)
--   2. Função send_weekly_digest() — uma notificação por coordenador,
--      por clube, com o que está pendente
--   3. Agendamento semanal (segunda-feira de manhã)
-- =====================================================================

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------
-- 1. Limiares da queda de comparência (por clube)
-- ---------------------------------------------------------------------
-- Os valores por omissão são os mesmos que estão no código (compute.js),
-- para o comportamento não mudar só por se ter corrido a migração.
alter table settings add column if not exists drop_recentes        integer not null default 5;
alter table settings add column if not exists drop_base_min        integer not null default 60;
alter table settings add column if not exists drop_pontos          integer not null default 30;
alter table settings add column if not exists drop_faltas_seguidas integer not null default 3;

-- ---------------------------------------------------------------------
-- 2. Resumo semanal
-- ---------------------------------------------------------------------
-- Corre com `security definer` (o cron não tem `auth.uid()`), por isso NÃO
-- passa pelo RLS: cada consulta filtra `org_id` à mão, como a check_in_by_qr.
-- Sem isso, um clube receberia no resumo os números de outro — que num SaaS
-- não é um bug, é um incidente.
create or replace function send_weekly_digest()
returns integer language plpgsql security definer as $$
declare
  org             record;
  dest            uuid;
  docs_expirados  integer;
  docs_a_expirar  integer;
  docs_sem_data   integer;
  quotas_n        integer;
  quotas_total    numeric;
  lesionados      integer;
  aval_pendentes  integer;
  dias            integer;
  linhas          text[];
  corpo           text;
  enviadas        integer := 0;
begin
  for org in
    -- Clubes ativos: um clube suspenso ou cancelado não deve receber avisos.
    select o.id
    from   organizations o
    where  o.status in ('trial', 'ativa')
  loop
    -- Janela de aviso dos documentos, definida por cada clube.
    --
    -- O `dias := null` não é decorativo: um SELECT ... INTO que não devolve
    -- linhas deixa a variável COMO ESTAVA. Sem o limpar, um clube sem linha de
    -- definições herdava silenciosamente a janela do clube anterior do ciclo.
    dias := null;
    select s.doc_alert_days into dias
    from   settings s where s.org_id = org.id limit 1;
    dias := coalesce(dias, 30);

    -- Documentos: expirados, a expirar dentro da janela, e sem data numa
    -- categoria que a devia ter (exame médico e seguro).
    select
      count(*) filter (where d.expires_at is not null and d.expires_at < current_date),
      count(*) filter (where d.expires_at is not null
                         and d.expires_at >= current_date
                         and d.expires_at <= current_date + dias),
      count(*) filter (where d.expires_at is null and d.doc_type in ('exame_medico','seguro'))
    into docs_expirados, docs_a_expirar, docs_sem_data
    from   player_documents d
    join   players p on p.id = d.player_id and p.archived_at is null
    where  d.org_id = org.id;

    -- Quotas por pagar (todas as que ficaram para trás, não só as do mês).
    select count(*), coalesce(sum(q.valor), 0)
    into   quotas_n, quotas_total
    from   quotas q
    join   players p on p.id = q.player_id and p.archived_at is null
    where  q.org_id = org.id and q.pago = false;

    -- Atletas com episódio clínico em curso.
    select count(distinct e.player_id) into lesionados
    from   clinical_episodes e
    join   players p on p.id = e.player_id and p.archived_at is null
    where  e.org_id = org.id and e.status in ('ativo','recuperacao');

    -- Avaliações de plantel por decidir.
    select count(*) into aval_pendentes
    from   players p
    where  p.org_id = org.id
      and  p.archived_at is null
      and  coalesce(p.review_status, 'pendente') = 'pendente';

    linhas := array[]::text[];

    if coalesce(docs_expirados, 0) > 0 then
      linhas := linhas || format('%s documento(s) caducado(s)', docs_expirados);
    end if;
    if coalesce(docs_a_expirar, 0) > 0 then
      linhas := linhas || format('%s a caducar nos próximos %s dias', docs_a_expirar, dias);
    end if;
    if coalesce(docs_sem_data, 0) > 0 then
      linhas := linhas || format('%s sem data de validade', docs_sem_data);
    end if;
    if coalesce(quotas_n, 0) > 0 then
      -- Euros arredondados, sem `to_char` com separadores: o formato de
      -- milhares/decimais depende do lc_numeric do servidor, e um resumo não
      -- precisa dos cêntimos para dizer o que está por cobrar.
      linhas := linhas || format('%s quota(s) por pagar (%s €)',
                                 quotas_n, round(quotas_total)::text);
    end if;
    if coalesce(lesionados, 0) > 0 then
      linhas := linhas || format('%s atleta(s) em tratamento', lesionados);
    end if;
    if coalesce(aval_pendentes, 0) > 0 then
      linhas := linhas || format('%s avaliação(ões) de plantel por decidir', aval_pendentes);
    end if;

    -- Semana sem nada pendente não gera notificação. Um resumo que chega
    -- todas as semanas a dizer "está tudo bem" deixa de ser lido — e, quando
    -- houver mesmo alguma coisa, passa despercebido no meio do hábito.
    if array_length(linhas, 1) is null then
      continue;
    end if;

    corpo := array_to_string(linhas, ' · ');

    -- Um resumo por coordenador e por membro da direção do clube.
    for dest in
      select pr.id
      from   profiles pr
      where  pr.org_id = org.id
        and  pr.role in ('coordenador', 'direcao')
    loop
      insert into notifications (type, title, body, data, target_user_id, org_id)
      values (
        'weekly_digest',
        'Resumo da semana',
        corpo,
        jsonb_build_object(
          'docs_expirados', coalesce(docs_expirados, 0),
          'docs_a_expirar', coalesce(docs_a_expirar, 0),
          'docs_sem_data',  coalesce(docs_sem_data, 0),
          'quotas',         coalesce(quotas_n, 0),
          'quotas_total',   coalesce(quotas_total, 0),
          'lesionados',     coalesce(lesionados, 0),
          'avaliacoes',     coalesce(aval_pendentes, 0),
          'semana',         to_char(current_date, 'IYYY-"W"IW')
        ),
        dest,
        org.id
      );
      enviadas := enviadas + 1;
    end loop;
  end loop;

  return enviadas;
end;
$$;

revoke all on function send_weekly_digest() from public, anon;

-- ---------------------------------------------------------------------
-- 3. Agendamento: segunda-feira às 08:00 UTC
-- ---------------------------------------------------------------------
-- Segunda de manhã e não sexta à tarde: a lista é de coisas para tratar, e
-- convém chegar quando ainda há semana para as tratar.
select cron.unschedule('weekly-digest') where exists (
  select 1 from cron.job where jobname = 'weekly-digest'
);

select cron.schedule(
  'weekly-digest',
  '0 8 * * 1',
  'select send_weekly_digest();'
);
