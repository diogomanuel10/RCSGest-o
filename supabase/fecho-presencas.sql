-- =====================================================================
-- Rumia — Fecho automático das sessões de presenças
-- =====================================================================
-- Corre este ficheiro no SQL Editor do Supabase, DEPOIS de
-- `qrcode-presencas.sql` e `musculacao.sql` (usa a coluna `source` e a
-- função `event_roster_ids`). Pode ser corrido várias vezes.
--
-- O que faz:
--   1. `settings.attendance_auto_close_days` (3 por omissão): ao fim de
--      quantos dias uma sessão fecha sozinha. Vive nas definições do clube
--      para a app saber que o fecho existe — é por esta coluna que ela
--      decide se mostra "Fecha automaticamente a …" (sem a migração, a frase
--      seria uma promessa que ninguém cumpre).
--   2. A função `auto_close_attendance_sessions()`: em cada treino ou
--      sessão de musculação com N dias, quem ficou SEM registo passa a
--      `falta` — o mesmo que o botão "Fechar sessão" faz à mão.
--   3. Agenda-a uma vez por dia (pg_cron).
--
-- Porquê:
--   Um treino que fica por fechar não conta as faltas de quem não veio, e a
--   comparência do plantel sobe sozinha. O botão existia; o que faltava era
--   alguém lembrar-se de carregar nele, treino a treino.
--
-- Só fecha sessões com PELO MENOS UM registo. Um treino sem registo nenhum
-- quase nunca é um treino a que ninguém foi — é um treino que ninguém marcou.
-- Fechá-lo dava falta ao plantel inteiro, e a comparência da equipa, as
-- quedas individuais e o "treina muito, joga pouco" passavam a dizer coisas
-- falsas. Esses ficam por marcar e continuam a aparecer como trabalho.
--
-- Fechar NÃO bloqueia: o treinador continua a poder corrigir uma falta para
-- justificada depois do fecho. O fecho preenche os buracos; não decide por
-- cima de ninguém.
--
-- Corre com a chave de serviço (pg_cron), por isso NÃO passa pelo RLS: o
-- `org_id` de cada presença é escrito à mão a partir do evento, a mesma regra
-- do `check_in_by_qr` e do `send_weekly_digest`.
-- =====================================================================

create extension if not exists pg_cron;

alter table settings
  add column if not exists attendance_auto_close_days integer default 3;
update settings set attendance_auto_close_days = 3
 where attendance_auto_close_days is null;

alter table settings drop constraint if exists settings_auto_close_days_check;
alter table settings add constraint settings_auto_close_days_check
  check (attendance_auto_close_days between 1 and 30);

create or replace function public.auto_close_attendance_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- O dia conta-se em Portugal e não em UTC: às 00:30 de verão o UTC ainda
  -- está no dia anterior, e o fecho chegava um dia mais tarde.
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
  ev      events%rowtype;
  v_n     integer;
  v_total integer := 0;
begin
  for ev in
    select e.*
      from events e
      join settings s on s.org_id = e.org_id
     where e.archived_at is null
       and e.type in ('treino', 'musculacao')
       and e.date <= v_today - coalesce(s.attendance_auto_close_days, 3)
       and exists (select 1 from attendances a where a.event_id = e.id)
  loop
    insert into attendances (org_id, event_id, player_id, status, source)
    select ev.org_id, ev.id, p.id, 'falta', 'manual'
      from players p
     where p.id = any(event_roster_ids(ev))
       and p.archived_at is null
       and p.org_id = ev.org_id
       and not exists (
         select 1 from attendances a
          where a.event_id = ev.id and a.player_id = p.id
       )
    on conflict (event_id, player_id) do nothing;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;
  return v_total;
end;
$$;

-- Só o pg_cron (e quem corre o SQL Editor) a chama: não é uma ação da app.
revoke all on function public.auto_close_attendance_sessions() from public, anon, authenticated;

-- Uma vez por dia, de madrugada (03:17 UTC = 03:17/04:17 em Portugal).
select cron.unschedule('attendance-auto-close') where exists (
  select 1 from cron.job where jobname = 'attendance-auto-close'
);
select cron.schedule(
  'attendance-auto-close',
  '17 3 * * *',
  'select public.auto_close_attendance_sessions();'
);
