-- =====================================================================
-- Rumia — A atleta vê o SEU atendimento de fisioterapia
-- =====================================================================
-- Corre DEPOIS de schema.sql, notifications.sql, trainer-notifications.sql
-- (dá o `target_user_id`), portal-atleta.sql e multitenant.sql (dá o
-- `org_id`). Pode ser corrido várias vezes sem problema.
--
-- Porquê: no circuito da fisioterapia toda a gente sabia de tudo menos a
-- pessoa de quem se estava a falar. O treinador via o pedido e a data
-- marcada, a fisio via a fila — e a atleta, que é quem tem de aparecer no
-- pavilhão a uma hora certa, não via nada: no portal dela havia um crachá a
-- dizer "Em recuperação" e mais nada. O dia da consulta chegava-lhe por
-- alguém lho dizer no balneário, e é por isso que há faltas.
--
-- O que cria:
--   1. RPC `my_physio_appointments()` — ela lê os SEUS atendimentos
--   2. Notificações: atendimento marcado / alterado / cancelado
--   3. Notificação de ALTA para a própria atleta
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ela lê os seus atendimentos — e só as colunas que são dela
-- ---------------------------------------------------------------------
-- NÃO se abre uma política de SELECT em `physio_appointments` ao atleta, e a
-- razão é a mesma que impediu o UPDATE de `players` pela ficha: uma política
-- é por LINHA e não por COLUNA. A linha do atendimento leva as `notes` da
-- fisio — o que ela observou, o que suspeita, o que vai fazer — e isso é
-- material clínico dela, escrito para ela, não uma mensagem para a atleta.
-- Abrir a linha para dar a hora entregava também o resto.
--
-- Por isso lê-se por uma função que devolve APENAS o compromisso: quando,
-- onde, que tipo e em que estado. É a decisão do `update_my_player_data` e do
-- `set_painel_prefs`, ao contrário.
--
-- `security definer` não passa pelo RLS, por isso o `org_id` é filtrado à
-- MÃO — a mesma regra do `check_in_by_qr`.
create or replace function public.my_physio_appointments()
returns table (
  id       uuid,
  ap_date  date,
  ap_time  text,
  end_time text,
  location text,
  status   text,
  type     text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.date, a.time, a.end_time, a.location, a.status, a.type
  from physio_appointments a
  where a.player_id = athlete_player_id()
    and a.org_id is not distinct from current_org_id()
  order by a.date, a.time;
$$;

revoke all on function public.my_physio_appointments() from public;
grant execute on function public.my_physio_appointments() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Notificações do atendimento
-- ---------------------------------------------------------------------
-- Uma frase por notificação, com o que ela precisa de saber para lá estar:
-- o dia, a hora e o sítio. E NADA de clínico — o tipo de atendimento é o
-- mais longe que isto vai. Uma notificação lê-se num ecrã bloqueado, muitas
-- vezes à frente de outras pessoas, e o que a Rita tem no ombro não é para
-- ali. O detalhe vive na app, atrás de uma sessão iniciada.
create or replace function public.appointment_when(p_date date, p_time text)
returns text
language sql
immutable
as $$
  select to_char(p_date, 'DD/MM')
      || coalesce(' às ' || left(nullif(trim(p_time), ''), 5), '');
$$;

-- A. Atendimento marcado.
create or replace function notify_athlete_appointment_created()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  -- Nada do passado notifica: um atendimento lançado à posteriori é trabalho
  -- de secretaria, e um aviso que não pede nada a ninguém gasta a atenção de
  -- que o próximo precisa. É a mesma regra das notificações de evento.
  if NEW.date < current_date then return NEW; end if;
  if NEW.status <> 'agendado' then return NEW; end if;

  select user_id into v_user from players where id = NEW.player_id;
  -- Sem conta ligada à ficha não há a quem notificar — é o que o convite ao
  -- portal resolve.
  if v_user is null then return NEW; end if;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'physio_appointment',
    'Fisioterapia marcada',
    'Tens fisioterapia a ' || appointment_when(NEW.date, NEW.time)
      || coalesce(', em ' || nullif(trim(NEW.location), ''), '') || '.',
    jsonb_build_object('appointment_id', NEW.id, 'date', NEW.date),
    v_user, NEW.org_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athlete_appointment_created on physio_appointments;
create trigger trg_notify_athlete_appointment_created
  after insert on physio_appointments
  for each row execute function notify_athlete_appointment_created();

-- B. Atendimento alterado ou cancelado.
--    Só a DATA, a HORA e o LOCAL avisam — e o cancelamento. Mudar a nota
--    clínica ou marcar como realizado não muda nada do lado dela, e um aviso
--    por cada gravação da fisio ensina-a a ignorar o sino.
create or replace function notify_athlete_appointment_changed()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_moveu boolean;
begin
  select user_id into v_user from players where id = NEW.player_id;
  if v_user is null then return NEW; end if;

  v_moveu := (NEW.date     is distinct from OLD.date)
          or (NEW.time     is distinct from OLD.time)
          or (NEW.location is distinct from OLD.location);

  if NEW.status = 'cancelado' and OLD.status is distinct from 'cancelado' then
    -- Um cancelamento avisa mesmo em cima da hora: é para ela NÃO aparecer.
    if NEW.date < current_date then return NEW; end if;
    insert into notifications (type, title, body, data, target_user_id, org_id)
    values (
      'physio_appointment',
      'Fisioterapia cancelada',
      'A fisioterapia de ' || appointment_when(NEW.date, NEW.time)
        || ' foi cancelada. O clube volta a marcar.',
      jsonb_build_object('appointment_id', NEW.id, 'date', NEW.date),
      v_user, NEW.org_id
    );
    return NEW;
  end if;

  if v_moveu and NEW.status = 'agendado' and NEW.date >= current_date then
    insert into notifications (type, title, body, data, target_user_id, org_id)
    values (
      'physio_appointment',
      'Fisioterapia alterada',
      'Passou para ' || appointment_when(NEW.date, NEW.time)
        || coalesce(', em ' || nullif(trim(NEW.location), ''), '') || '.',
      jsonb_build_object('appointment_id', NEW.id, 'date', NEW.date),
      v_user, NEW.org_id
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athlete_appointment_changed on physio_appointments;
create trigger trg_notify_athlete_appointment_changed
  after update on physio_appointments
  for each row execute function notify_athlete_appointment_changed();

-- ---------------------------------------------------------------------
-- 3. A alta é dela primeiro
-- ---------------------------------------------------------------------
-- O treinador já era avisado da alta (`notify_trainers_clinical_alta`); a
-- atleta não. É a melhor notícia que esta secção tem para dar, e era a única
-- pessoa do circuito a quem ela não chegava — ficava a saber que podia voltar
-- a jogar quando alguém se lembrasse de lho dizer.
--
-- Vai o FACTO e mais nada: está apta. O diagnóstico, a evolução e o plano
-- ficam onde estão (`med_rw`) — são a leitura clínica que a fisio faz dela, e
-- no telemóvel, sem ninguém ao lado para as explicar, uma alta lida como um
-- relatório assusta mais do que informa.
create or replace function notify_athlete_clinical_alta()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from players where id = NEW.player_id;
  if v_user is null then return NEW; end if;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'clinical_alta',
    'Tens alta 🎉',
    'A fisioterapia deu-te alta'
      || coalesce(' a ' || to_char(NEW.discharge_date, 'DD/MM'), '')
      || '. Estás apta a treinar — fala com o teu treinador.',
    jsonb_build_object('episode_id', NEW.id),
    v_user, NEW.org_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athlete_clinical_alta on clinical_episodes;
create trigger trg_notify_athlete_clinical_alta
  after update on clinical_episodes
  for each row
  when (OLD.status is distinct from NEW.status and NEW.status = 'alta')
  execute function notify_athlete_clinical_alta();
