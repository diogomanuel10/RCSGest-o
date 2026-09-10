-- =====================================================================
-- Rumia — Notificações para o ATLETA
-- =====================================================================
-- Corre DEPOIS de notifications.sql, trainer-notifications.sql e
-- comunicacao.sql (é de lá que vem `team_athlete_user_ids`). Pode ser
-- corrido várias vezes.
--
-- Porque existe: o clube tinha notificações para tudo — evento novo,
-- alterado, cancelado, atleta adicionado, disponibilidade, alta clínica,
-- pedidos de equipamento, resumo semanal. Do lado do ATLETA havia UMA: o
-- aviso que o treinador escreve à mão (`send_team_announcement`). Ser
-- convocado não avisava, um jogo novo não avisava, uma mudança de hora não
-- avisava, um treino cancelado não avisava — e é precisamente quem não está
-- na conversa do balneário que precisa de saber. O sino e o Web Push já
-- funcionavam do lado dela; não chegava lá nada para tocar.
--
-- O que cria:
--   A. Evento novo na sua equipa
--   B. Evento alterado (data, hora ou local)
--   C. Evento cancelado (arquivado)
--   D. Convocado para um jogo
--   E. Retirado da convocatória
--
-- Três regras que valem para todos:
--   * Só chega a quem TEM CONTA ligada à ficha (`players.user_id`). Sem
--     conta não há a quem notificar — é o que o convite ao portal resolve.
--   * Só eventos que ainda não aconteceram. Um treino lançado (ou corrigido)
--     à posteriori é trabalho de secretaria: notificá-lo é ruído, e ruído
--     ensina a ignorar o sino.
--   * Um evento sem equipa (`team_id` nulo, evento do clube) não notifica:
--     não há plantel de onde tirar os destinatários. É a mesma limitação que
--     as notificações do treinador já tinham.
--
-- O `org_id` é preenchido À MÃO a partir do evento: estas funções são
-- `security definer` e não passam pelo RLS — num caminho destes, o
-- isolamento entre clubes é escrito à mão ou não existe.
-- =====================================================================

-- -----------------------------------------------------------------------
-- Etiqueta legível de um evento ("Jogo", "Treino", ou o título escrito).
-- -----------------------------------------------------------------------
create or replace function public.event_label(p_event events)
returns text language sql immutable as $$
  select coalesce(p_event.title, case p_event.type
    when 'treino' then 'Treino'
    when 'jogo'   then 'Jogo'
    else initcap(p_event.type)
  end);
$$;

-- -----------------------------------------------------------------------
-- A. Evento novo na equipa do atleta
-- -----------------------------------------------------------------------
create or replace function public.notify_athletes_event_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if NEW.team_id is null or NEW.archived_at is not null then return NEW; end if;
  if NEW.date < current_date then return NEW; end if;

  for uid in select team_athlete_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id, org_id)
    values (
      'event_added',
      'Novo evento na tua agenda',
      event_label(NEW) || ' a ' || to_char(NEW.date, 'DD/MM')
        || coalesce(' às ' || NEW.time, '') || '.',
      jsonb_build_object('event_id', NEW.id, 'type', NEW.type,
                         'date', NEW.date, 'time', NEW.time),
      uid,
      NEW.org_id
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athletes_event_added on events;
create trigger trg_notify_athletes_event_added
  after insert on events
  for each row
  execute function notify_athletes_event_added();

-- -----------------------------------------------------------------------
-- B. Evento alterado — data, hora ou local
--    O TÍTULO não conta: corrigir uma gralha no nome do treino não muda
--    nada para quem lá vai, e uma notificação que não pede nada a ninguém
--    gasta a atenção que a próxima vai precisar.
-- -----------------------------------------------------------------------
create or replace function public.notify_athletes_event_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid     uuid;
  changes text := '';
begin
  if NEW.team_id is null then return NEW; end if;
  if NEW.date < current_date then return NEW; end if;

  if OLD.date is distinct from NEW.date then
    changes := changes || 'passa para ' || to_char(NEW.date, 'DD/MM') || '. ';
  end if;
  if OLD.time is distinct from NEW.time then
    changes := changes || 'nova hora: ' || coalesce(NEW.time, '—') || '. ';
  end if;
  if OLD.location is distinct from NEW.location and NEW.location is not null then
    changes := changes || 'novo local: ' || NEW.location || '. ';
  end if;

  if changes = '' then return NEW; end if;

  for uid in select team_athlete_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id, org_id)
    values (
      'event_updated',
      'Alteração na tua agenda',
      event_label(NEW) || ' de ' || to_char(NEW.date, 'DD/MM') || ': ' || changes,
      jsonb_build_object('event_id', NEW.id, 'type', NEW.type,
                         'date', NEW.date, 'time', NEW.time),
      uid,
      NEW.org_id
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athletes_event_updated on events;
create trigger trg_notify_athletes_event_updated
  after update on events
  for each row
  when (
    OLD.archived_at is null
    and NEW.archived_at is null
    and (
      OLD.date     is distinct from NEW.date
      or OLD.time     is distinct from NEW.time
      or OLD.location is distinct from NEW.location
    )
  )
  execute function notify_athletes_event_updated();

-- -----------------------------------------------------------------------
-- C. Evento cancelado (arquivado)
--    É a notificação que mais vale a pena existir: sem ela, alguém aparece
--    ao pavilhão para um treino que já não há.
-- -----------------------------------------------------------------------
create or replace function public.notify_athletes_event_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if NEW.team_id is null then return NEW; end if;
  if NEW.date < current_date then return NEW; end if;

  for uid in select team_athlete_user_ids(NEW.team_id) loop
    insert into notifications (type, title, body, data, target_user_id, org_id)
    values (
      'event_cancelled',
      'Evento cancelado',
      event_label(NEW) || ' de ' || to_char(NEW.date, 'DD/MM') || ' foi cancelado.',
      jsonb_build_object('event_id', NEW.id, 'type', NEW.type, 'date', NEW.date),
      uid,
      NEW.org_id
    );
  end loop;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athletes_event_cancelled on events;
create trigger trg_notify_athletes_event_cancelled
  after update on events
  for each row
  when (OLD.archived_at is null and NEW.archived_at is not null)
  execute function notify_athletes_event_cancelled();

-- -----------------------------------------------------------------------
-- D/E. Convocatória
--    Convocar e retirar avisam AMBOS. Avisar só a convocatória deixava a
--    atleta a contar com um jogo de que já tinha sido retirada — e é para
--    isso que ela lê o portal. A troca conhecida: "Limpar convocatória" para
--    refazer a lista manda um aviso por atleta.
-- -----------------------------------------------------------------------
create or replace function public.notify_athlete_squad_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  called  boolean := (TG_OP = 'INSERT');
  row_    squad_players%rowtype;
  ev      events%rowtype;
  uid     uuid;
begin
  -- Num AFTER DELETE não há NEW: a linha que interessa é a OLD.
  if called then row_ := NEW; else row_ := OLD; end if;

  select e.* into ev
    from squads s
    join events e on e.id = s.event_id
   where s.id = row_.squad_id;

  if not found or ev.date < current_date or ev.archived_at is not null then
    return row_;
  end if;

  select p.user_id into uid
    from players p
   where p.id = row_.player_id
     and p.user_id is not null
     and p.archived_at is null;

  if uid is null then return row_; end if;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    case when called then 'squad_called' else 'squad_uncalled' end,
    case when called then 'Foste convocado' else 'Já não estás convocado' end,
    case when called
      then 'Estás na convocatória do jogo de ' || to_char(ev.date, 'DD/MM')
           || coalesce(' às ' || ev.time, '') || '.'
      else 'Deixaste de estar na convocatória do jogo de '
           || to_char(ev.date, 'DD/MM') || '.'
    end,
    jsonb_build_object('event_id', ev.id, 'date', ev.date, 'called', called),
    uid,
    ev.org_id
  );
  return row_;
end;
$$;

drop trigger if exists trg_notify_athlete_squad_called on squad_players;
create trigger trg_notify_athlete_squad_called
  after insert on squad_players
  for each row
  execute function notify_athlete_squad_change();

drop trigger if exists trg_notify_athlete_squad_uncalled on squad_players;
create trigger trg_notify_athlete_squad_uncalled
  after delete on squad_players
  for each row
  execute function notify_athlete_squad_change();
