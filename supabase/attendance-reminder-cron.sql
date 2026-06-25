-- =====================================================================
-- Central RCS — Lembrete de presenças (pg_cron, sem Edge Function)
-- =====================================================================
-- Corre este ficheiro no SQL Editor do Supabase.
-- Pode ser corrido várias vezes sem problema.
--
-- O que faz:
--   1. Ativa a extensão pg_cron (caso ainda não esteja ativa)
--   2. Cria a função SQL send_attendance_reminders() que:
--        - Procura eventos que começam nos próximos 10 minutos
--        - Para cada um, verifica se já foi enviado lembrete
--        - Insere notificações para os treinadores da equipa
--   3. Agenda a função para correr de 5 em 5 minutos
-- =====================================================================

-- Ativar pg_cron (só é necessário uma vez; sem efeito se já estiver ativo)
create extension if not exists pg_cron;

-- -----------------------------------------------------------------------
-- Função: procurar treinos/jogos a começar em ~10 minutos e notificar
-- -----------------------------------------------------------------------
create or replace function send_attendance_reminders()
returns void language plpgsql security definer as $$
declare
  ev          record;
  trainer_uid uuid;
  win_start   text;
  win_end     text;
  ev_label    text;
begin
  -- Janela de 5 a 15 minutos a partir de agora.
  -- Com o cron a cada 5 min, cada evento é apanhado exatamente uma vez.
  win_start := to_char(now() + interval '5 minutes',  'HH24:MI');
  win_end   := to_char(now() + interval '15 minutes', 'HH24:MI');

  for ev in
    select e.id, e.type, e.title, e.date, e.time, e.team_id
    from   events e
    where  e.archived_at is null
      and  e.date = current_date
      and  e.time >= win_start
      and  e.time <= win_end
      and  e.team_id is not null
  loop
    -- Não repetir: se já existe uma notificação deste tipo para este evento, salta.
    if exists (
      select 1 from notifications n
      where  n.type = 'attendance_reminder'
        and  (n.data->>'event_id') = ev.id::text
    ) then
      continue;
    end if;

    ev_label := coalesce(ev.title, case ev.type
      when 'treino' then 'Treino'
      when 'jogo'   then 'Jogo'
      else initcap(ev.type)
    end);

    -- Inserir notificação para cada treinador da equipa.
    for trainer_uid in
      select c.user_id
      from   team_coaches tc
      join   coaches c on c.id = tc.coach_id
      where  tc.team_id = ev.team_id
        and  c.user_id is not null
    loop
      insert into notifications (type, title, body, data, target_user_id)
      values (
        'attendance_reminder',
        'Lembrete: marcar presenças',
        ev_label || ' começa às ' || ev.time
          || '. Não te esqueças de marcar as presenças.',
        jsonb_build_object(
          'event_id', ev.id,
          'type',     ev.type,
          'date',     ev.date,
          'time',     ev.time
        ),
        trainer_uid
      );
    end loop;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------
-- Agendar: correr de 5 em 5 minutos
-- Se já existir um job com este nome, remove-o primeiro.
-- -----------------------------------------------------------------------
select cron.unschedule('attendance-reminder') where exists (
  select 1 from cron.job where jobname = 'attendance-reminder'
);

select cron.schedule(
  'attendance-reminder',    -- nome do job (único)
  '*/5 * * * *',            -- a cada 5 minutos
  'select send_attendance_reminders();'
);
