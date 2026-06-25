-- =====================================================================
-- Central RCS — Notificações para Treinadores
-- =====================================================================
-- Corre DEPOIS de ter corrido notifications.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- O que faz:
--   1. Adiciona `target_user_id` à tabela notifications (para notificações
--      dirigidas a um utilizador específico, em vez de um papel genérico)
--   2. Atualiza as políticas RLS para que cada utilizador veja as suas
--   3. Cria 6 triggers que notificam os treinadores:
--       A. Novo evento (treino/jogo) agendado para a sua equipa
--       B. Evento alterado (data/hora/local)
--       C. Evento cancelado (arquivado)
--       D. Novo atleta adicionado à sua equipa
--       E. Disponibilidade de atleta alterada (disponível ↔ indisponível)
--       F. Alta clínica — atleta apto a treinar novamente
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. Coluna target_user_id (notificação para utilizador específico)
-- -----------------------------------------------------------------------
alter table notifications
  add column if not exists target_user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_notif_user on notifications (target_user_id);

-- -----------------------------------------------------------------------
-- 2. Atualizar RLS: utilizador vê as notificações dirigidas a si próprio
--    OU as dirigidas ao seu papel (coordenador).
-- -----------------------------------------------------------------------
drop policy if exists "notif_read"   on notifications;
drop policy if exists "notif_update" on notifications;
drop policy if exists "notif_delete" on notifications;

create policy "notif_read" on notifications for select to authenticated
  using (
    (target_user_id is null and target_role = app_role())
    OR target_user_id = auth.uid()
  );

create policy "notif_update" on notifications for update to authenticated
  using (
    (target_user_id is null and app_role() = 'coordenador')
    OR target_user_id = auth.uid()
  )
  with check (
    (target_user_id is null and app_role() = 'coordenador')
    OR target_user_id = auth.uid()
  );

create policy "notif_delete" on notifications for delete to authenticated
  using (
    (target_user_id is null and app_role() = 'coordenador')
    OR target_user_id = auth.uid()
  );

-- -----------------------------------------------------------------------
-- Função auxiliar: devolve os user_id dos treinadores de uma equipa.
-- -----------------------------------------------------------------------
create or replace function team_trainer_user_ids(p_team_id uuid)
returns setof uuid language sql security definer stable as $$
  select c.user_id
  from   team_coaches tc
  join   coaches c on c.id = tc.coach_id
  where  tc.team_id = p_team_id
  and    c.user_id is not null;
$$;

-- -----------------------------------------------------------------------
-- A. Trigger: novo evento adicionado à equipa do treinador
-- -----------------------------------------------------------------------
create or replace function notify_trainers_event_added()
returns trigger language plpgsql security definer as $$
declare
  uid   uuid;
  label text;
begin
  if NEW.team_id is null then return NEW; end if;
  if NEW.archived_at is not null then return NEW; end if;

  label := coalesce(NEW.title, case NEW.type
    when 'treino' then 'Treino'
    when 'jogo'   then 'Jogo'
    else initcap(NEW.type)
  end);

  for uid in select team_trainer_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id)
    values (
      'event_added',
      'Novo evento na agenda',
      label || ' marcado para ' || to_char(NEW.date, 'DD/MM/YYYY')
        || coalesce(' às ' || NEW.time, '') || '.',
      jsonb_build_object(
        'event_id', NEW.id,
        'type',     NEW.type,
        'date',     NEW.date,
        'time',     NEW.time
      ),
      uid
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_trainers_event_added on events;
create trigger trg_notify_trainers_event_added
  after insert on events
  for each row
  execute function notify_trainers_event_added();

-- -----------------------------------------------------------------------
-- B. Trigger: evento alterado (data, hora, local ou título)
--    Ignora atualizações que sejam arquivamentos (tratados em C).
-- -----------------------------------------------------------------------
create or replace function notify_trainers_event_updated()
returns trigger language plpgsql security definer as $$
declare
  uid     uuid;
  label   text;
  changes text := '';
begin
  if NEW.team_id is null then return NEW; end if;

  label := coalesce(NEW.title, case NEW.type
    when 'treino' then 'Treino'
    when 'jogo'   then 'Jogo'
    else initcap(NEW.type)
  end);

  if OLD.date is distinct from NEW.date then
    changes := changes || 'nova data: ' || to_char(NEW.date, 'DD/MM/YYYY') || '. ';
  end if;
  if OLD.time is distinct from NEW.time then
    changes := changes || 'nova hora: ' || coalesce(NEW.time, '—') || '. ';
  end if;
  if OLD.end_time is distinct from NEW.end_time and NEW.end_time is not null then
    changes := changes || 'fim: ' || NEW.end_time || '. ';
  end if;
  if OLD.location is distinct from NEW.location and NEW.location is not null then
    changes := changes || 'local: ' || NEW.location || '. ';
  end if;

  if changes = '' then return NEW; end if;

  for uid in select team_trainer_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id)
    values (
      'event_updated',
      'Evento alterado',
      label || ' de ' || to_char(NEW.date, 'DD/MM/YYYY') || ': ' || changes,
      jsonb_build_object(
        'event_id', NEW.id,
        'type',     NEW.type,
        'date',     NEW.date,
        'time',     NEW.time
      ),
      uid
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_trainers_event_updated on events;
create trigger trg_notify_trainers_event_updated
  after update on events
  for each row
  when (
    OLD.archived_at is null
    and NEW.archived_at is null
    and (
      OLD.date     is distinct from NEW.date
      or OLD.time     is distinct from NEW.time
      or OLD.end_time is distinct from NEW.end_time
      or OLD.location is distinct from NEW.location
      or OLD.title    is distinct from NEW.title
    )
  )
  execute function notify_trainers_event_updated();

-- -----------------------------------------------------------------------
-- C. Trigger: evento cancelado (arquivado)
-- -----------------------------------------------------------------------
create or replace function notify_trainers_event_cancelled()
returns trigger language plpgsql security definer as $$
declare
  uid   uuid;
  label text;
begin
  if NEW.team_id is null then return NEW; end if;

  label := coalesce(NEW.title, case NEW.type
    when 'treino' then 'Treino'
    when 'jogo'   then 'Jogo'
    else initcap(NEW.type)
  end);

  for uid in select team_trainer_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id)
    values (
      'event_cancelled',
      'Evento cancelado',
      label || ' de ' || to_char(NEW.date, 'DD/MM/YYYY') || ' foi cancelado.',
      jsonb_build_object('event_id', NEW.id, 'type', NEW.type, 'date', NEW.date),
      uid
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_trainers_event_cancelled on events;
create trigger trg_notify_trainers_event_cancelled
  after update on events
  for each row
  when (OLD.archived_at is null and NEW.archived_at is not null)
  execute function notify_trainers_event_cancelled();

-- -----------------------------------------------------------------------
-- D. Trigger: novo atleta adicionado à equipa
-- -----------------------------------------------------------------------
create or replace function notify_trainers_player_added()
returns trigger language plpgsql security definer as $$
declare
  uid uuid;
begin
  for uid in select team_trainer_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id)
    values (
      'player_added',
      'Novo atleta na equipa',
      NEW.name || ' foi adicionado ao teu plantel.',
      jsonb_build_object('player_id', NEW.id, 'name', NEW.name, 'team_id', NEW.team_id),
      uid
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_trainers_player_added on players;
create trigger trg_notify_trainers_player_added
  after insert on players
  for each row
  execute function notify_trainers_player_added();

-- -----------------------------------------------------------------------
-- E. Trigger: disponibilidade do atleta alterada
--    Notifica quando passa de apto → indisponível/limitado/recuperação
--    e quando volta a apto.
-- -----------------------------------------------------------------------
create or replace function notify_trainers_availability_changed()
returns trigger language plpgsql security definer as $$
declare
  uid         uuid;
  player_name text;
  player_team uuid;
  was_out     bool;
  is_out      bool;
  status_lbl  text;
begin
  was_out := OLD.status in ('limitado', 'recuperacao', 'indisponivel');
  is_out  := NEW.status in ('limitado', 'recuperacao', 'indisponivel');

  if was_out = is_out then return NEW; end if;

  select name, team_id into player_name, player_team
  from players where id = NEW.player_id;

  if player_team is null then return NEW; end if;

  if is_out then
    status_lbl := case NEW.status
      when 'limitado'    then 'limitado ao treino'
      when 'recuperacao' then 'em recuperação'
      else 'indisponível'
    end;

    for uid in select team_trainer_user_ids(player_team) loop
      insert into notifications (type, title, body, data, target_user_id)
      values (
        'player_unavailable',
        'Atleta indisponível',
        player_name || ' está ' || status_lbl || '.',
        jsonb_build_object('player_id', NEW.player_id, 'name', player_name, 'status', NEW.status),
        uid
      );
    end loop;
  else
    for uid in select team_trainer_user_ids(player_team) loop
      insert into notifications (type, title, body, data, target_user_id)
      values (
        'player_available',
        'Atleta disponível',
        player_name || ' voltou a estar apto para treinar.',
        jsonb_build_object('player_id', NEW.player_id, 'name', player_name, 'status', NEW.status),
        uid
      );
    end loop;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_notify_trainers_availability on athlete_availability;
create trigger trg_notify_trainers_availability
  after update on athlete_availability
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function notify_trainers_availability_changed();

-- -----------------------------------------------------------------------
-- F. Trigger: alta clínica — atleta apto a treinar
-- -----------------------------------------------------------------------
create or replace function notify_trainers_clinical_alta()
returns trigger language plpgsql security definer as $$
declare
  uid         uuid;
  player_name text;
  player_team uuid;
begin
  select name, team_id into player_name, player_team
  from players where id = NEW.player_id;

  if player_team is null then return NEW; end if;

  for uid in select team_trainer_user_ids(player_team) loop
    insert into notifications (type, title, body, data, target_user_id)
    values (
      'clinical_alta',
      'Alta clínica',
      player_name || ' recebeu alta e está apto a treinar.',
      jsonb_build_object(
        'player_id',  NEW.player_id,
        'name',       player_name,
        'episode_id', NEW.id,
        'title',      NEW.title
      ),
      uid
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_trainers_clinical_alta on clinical_episodes;
create trigger trg_notify_trainers_clinical_alta
  after update on clinical_episodes
  for each row
  when (OLD.status is distinct from NEW.status and NEW.status = 'alta')
  execute function notify_trainers_clinical_alta();
