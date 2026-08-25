-- =====================================================================
-- Rumia — Comunicação entre o clube e o atleta
-- =====================================================================
-- Até aqui o portal do atleta era um poster: mostrava, não deixava dizer
-- nada. Tudo o que era avisar, confirmar e justificar acontecia no WhatsApp
-- e nunca chegava à app — e a justificação que o treinador não transcrevia
-- virava falta.
--
-- Este guião abre os dois sentidos:
--
--   1. ATLETA -> CLUBE  (`event_responses`)
--      O atleta responde a um evento: "vou" ou "não vou", com um motivo
--      opcional. Serve para CONFIRMAR uma convocatória e para AVISAR que
--      falta a um treino — o mesmo mecanismo, porque para o treinador o
--      problema é o mesmo: saber com quem conta.
--
--      São só duas respostas. Havia um "ainda não sei", e um "ainda não sei"
--      responde-se exatamente como o silêncio: o treinador continua sem saber
--      com quem conta, mas passa a ver a linha como respondida e deixa de
--      insistir. Ficar por responder já diz o mesmo, e diz a verdade.
--
--      Um treino fecha às respostas 6 HORAS antes de começar
--      (`RESPONSE_LEAD_HOURS`). Um aviso à hora do treino não é um aviso: já
--      não dá para chamar ninguém nem refazer o que estava planeado. O jogo
--      aceita até começar — uma convocatória confirma-se até ao último
--      momento, e o treinador prefere saber tarde a não saber.
--
--   2. CLUBE -> ATLETA  (`send_team_announcement`)
--      O treinador manda um aviso à equipa, que chega como notificação (a
--      tabela `notifications` e o Web Push já existem).
--
-- Fronteira importante: uma resposta NÃO é uma presença. O atleta diz o que
-- tenciona fazer; quem regista o que aconteceu continua a ser o treinador
-- (ou o cartão QR). Se um "não vou" marcasse falta justificada sozinho, o
-- atleta passava a justificar-se a si próprio — e isso é decisão de quem
-- treina, não de quem falta.
--
-- Como usar:
--   1. Corre primeiro schema.sql, notifications.sql, trainer-notifications.sql
--      (dá o `target_user_id`), multitenant.sql (dá o `org_id`) e
--      qrcode-presencas.sql (dá o `club_now()`, usado para saber se o evento
--      já passou na hora local do clube).
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Respostas do atleta a eventos
-- ---------------------------------------------------------------------
create table if not exists event_responses (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events(id)  on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  response     text not null
               check (response in ('vou','nao_vou')),
  note         text,
  responded_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (event_id, player_id)
);
create index if not exists idx_event_responses_event  on event_responses (event_id);
create index if not exists idx_event_responses_player on event_responses (player_id);

-- O "ainda não sei" foi retirado. As linhas antigas são APAGADAS e não
-- convertidas: quem respondeu "não sei" não disse que vai nem que não vai —
-- convertê-lo para qualquer um dos dois seria inventar uma resposta que o
-- atleta não deu. Sem linha, volta a aparecer como "sem resposta", que é
-- exatamente o que ele disse.
delete from event_responses where response = 'duvida';

alter table event_responses drop constraint if exists event_responses_response_check;
alter table event_responses add constraint event_responses_response_check
  check (response in ('vou','nao_vou'));

-- Isolamento por clube: mesmo padrão das restantes tabelas (ver multitenant.sql).
alter table event_responses
  add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table event_responses alter column org_id set default current_org_id();
create index if not exists idx_event_responses_org on event_responses (org_id);

alter table event_responses enable row level security;

drop policy if exists tenant_isolation on event_responses;
create policy tenant_isolation on event_responses as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- LEITURA: a equipa técnica vê as respostas; o atleta vê só as suas.
drop policy if exists "er_read" on event_responses;
create policy "er_read" on event_responses for select to authenticated
  using (
    app_role() <> 'atleta'
    OR player_id = athlete_player_id()
  );

-- ESCRITA: nenhuma política. Só se escreve pela função abaixo, que valida o
-- evento, a equipa e o prazo. Assim o cliente não consegue responder por
-- outro atleta nem reescrever o passado.

-- ---------------------------------------------------------------------
-- 2. Atletas de uma equipa com conta na app
-- ---------------------------------------------------------------------
-- Espelho do `team_trainer_user_ids` (ver trainer-notifications.sql), para
-- poder notificar os atletas de uma equipa.
create or replace function public.team_athlete_user_ids(p_team_id uuid)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.user_id
  from   players p
  where  p.team_id = p_team_id
  and    p.user_id is not null
  and    p.archived_at is null;
$$;

-- ---------------------------------------------------------------------
-- 2b. Quem é avisado quando um atleta responde
-- ---------------------------------------------------------------------
-- O treinador da equipa E o coordenador do clube.
--
-- Só o treinador não chegava: `team_trainer_user_ids` sai de `team_coaches`
-- -> `coaches.user_id`, por isso um clube onde ninguém ligou a ficha de
-- treinador a uma conta (ou onde quem trata do plantel é o próprio
-- coordenador, que não tem ficha de treinador) não recebia nada — a resposta
-- do atleta ficava a acontecer em silêncio, e ninguém percebia porquê.
create or replace function public.event_response_audience(
  p_team_id uuid,
  p_org_id  uuid
)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select distinct uid from (
    select team_trainer_user_ids(p_team_id) as uid
    union
    select pr.id
    from   profiles pr
    where  pr.role = 'coordenador'
    and    (p_org_id is null or pr.org_id = p_org_id)
  ) t
  where uid is not null;
$$;

-- ---------------------------------------------------------------------
-- 3. O atleta responde a um evento
-- ---------------------------------------------------------------------
-- Devolve a linha gravada em JSON. Lança erro em PT quando não pode responder.
create or replace function public.respond_to_event(
  p_event_id uuid,
  p_response text,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := current_org_id();
  v_player players%rowtype;
  v_event  events%rowtype;
  v_row    event_responses%rowtype;
  v_before text;
  v_start  timestamp;
  v_limit  timestamp;
  v_label  text;
  v_title  text;
  uid      uuid;
begin
  if p_response not in ('vou','nao_vou') then
    raise exception 'Resposta inválida.';
  end if;

  -- Quem responde é sempre o próprio: o atleta ligado à conta atual.
  select * into v_player from players
   where user_id = auth.uid()
     and archived_at is null
     and (v_org is null or org_id = v_org)
   limit 1;
  if not found then
    raise exception 'A tua conta não está associada a nenhum atleta.';
  end if;

  select * into v_event from events
   where id = p_event_id
     and archived_at is null
     and (v_org is null or org_id = v_org);
  if not found then
    raise exception 'Evento não encontrado.';
  end if;

  if v_event.team_id is distinct from v_player.team_id then
    raise exception 'Este evento não é da tua equipa.';
  end if;

  -- O PRAZO. Um treino fecha 6 horas antes de começar: uma falta avisada à
  -- hora do treino não é um aviso — o treinador já saiu de casa com o plano
  -- feito e já não chama ninguém. Fechar cedo obriga a decidir a tempo, que é
  -- a única coisa que torna a resposta útil a quem treina.
  --
  -- O jogo aceita até começar: uma convocatória confirma-se até ao último
  -- momento e, aí, saber tarde é sempre melhor do que não saber.
  v_start := v_event.date + coalesce(nullif(v_event.time,''), '23:59')::time;
  v_limit := case when v_event.type = 'treino'
                  then v_start - interval '6 hours'
                  else v_start
             end;

  if v_start < club_now() then
    raise exception 'Este evento já passou.';
  end if;
  if v_limit < club_now() then
    raise exception 'As respostas a este treino fecharam às % (6 horas antes). Avisa o teu treinador diretamente.',
      to_char(v_limit, 'HH24:MI" de "DD/MM');
  end if;

  select response into v_before from event_responses
   where event_id = p_event_id and player_id = v_player.id;

  insert into event_responses (event_id, player_id, response, note, responded_at)
  values (p_event_id, v_player.id, p_response, nullif(trim(coalesce(p_note,'')), ''), now())
  on conflict (event_id, player_id) do update
    set response     = excluded.response,
        note         = excluded.note,
        responded_at = excluded.responded_at
  returning * into v_row;

  -- Avisar a equipa técnica e o coordenador. Notifica-se cada resposta NOVA
  -- (ou mudada) e nunca a repetição da mesma: quem carrega duas vezes em "Vou"
  -- não aconteceu nada de novo.
  --
  -- O "vou" também avisa. A regra antiga era só notificar o "não vou" para
  -- poupar ruído, mas isso deixava quem está do outro lado sem forma de
  -- distinguir "ainda ninguém respondeu" de "não está a chegar nada" — e foi
  -- exatamente esse o sintoma. Quem quiser só as faltas tem o painel do
  -- evento (Presenças), que já mostra o quadro completo.
  if coalesce(v_before,'') is distinct from p_response then
    v_label := case when v_event.type = 'jogo' then 'jogo' else 'treino' end;
    v_title := case when p_response = 'nao_vou'
                    then 'Falta avisada'
                    else 'Presença confirmada' end;

    for uid in select event_response_audience(v_event.team_id, v_event.org_id) loop
      insert into notifications (type, title, body, data, target_user_id, org_id)
      values (
        'event_response',
        v_title,
        v_player.name ||
          case when p_response = 'nao_vou' then ' não vai ao ' else ' vai ao ' end ||
          v_label ||
          ' de ' || to_char(v_event.date, 'DD/MM') ||
          coalesce(' às ' || v_event.time, '') ||
          coalesce(' — ' || v_row.note, '') || '.',
        jsonb_build_object(
          'event_id',  v_event.id,
          'player_id', v_player.id,
          'response',  p_response
        ),
        uid,
        v_event.org_id
      );
    end loop;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.respond_to_event(uuid, text, text) from public, anon;
grant execute on function public.respond_to_event(uuid, text, text) to authenticated;
grant execute on function public.team_athlete_user_ids(uuid) to authenticated;
grant execute on function public.event_response_audience(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. O clube avisa a equipa
-- ---------------------------------------------------------------------
-- Cria uma notificação por atleta com conta. Devolve quantos foram avisados
-- (é o número que a interface mostra: "avisados 14 atletas").
create or replace function public.send_team_announcement(
  p_team_id uuid,
  p_title   text,
  p_body    text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org   uuid := current_org_id();
  v_role  text := app_role();
  v_count integer := 0;
  uid     uuid;
begin
  if v_role is null or v_role not in ('coordenador','treinador') then
    raise exception 'Sem permissão para enviar avisos.';
  end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body), '') = '' then
    raise exception 'O aviso precisa de título e mensagem.';
  end if;

  if not exists (
    select 1 from teams
     where id = p_team_id
       and archived_at is null
       and (v_org is null or org_id = v_org)
  ) then
    raise exception 'Equipa não encontrada.';
  end if;

  -- Um treinador só avisa as SUAS equipas (espelha o RLS dos eventos).
  if v_role = 'treinador' and p_team_id not in (select trainer_team_ids()) then
    raise exception 'Só podes avisar as tuas equipas.';
  end if;

  for uid in select team_athlete_user_ids(p_team_id) loop
    insert into notifications (type, title, body, data, target_user_id, org_id)
    values (
      'club_announcement',
      trim(p_title),
      trim(p_body),
      jsonb_build_object('team_id', p_team_id),
      uid,
      v_org
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.send_team_announcement(uuid, text, text) from public, anon;
grant execute on function public.send_team_announcement(uuid, text, text) to authenticated;
