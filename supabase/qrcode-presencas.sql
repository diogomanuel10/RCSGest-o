-- =====================================================================
-- Rumia — Presenças por QR code (modo quiosque)
-- =====================================================================
-- Cada atleta passa a ter um código QR próprio. Um tablet/telemóvel à
-- entrada do pavilhão fica em "modo quiosque" com a câmara ligada: o
-- atleta passa o cartão (ou o QR do seu portal) e a presença é registada
-- sozinha, com o estado (presente/atraso) decidido pela hora do treino.
--
-- Como usar:
--   1. Corre PRIMEIRO o schema.sql, o notifications.sql e o multitenant.sql
--      (este ficheiro conta com `org_id` e `current_org_id()` já criados).
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar (idempotente).
--
-- Notas de desenho:
--   - O QR NÃO leva o id do atleta: leva um `qr_token` dedicado, que se
--     pode regenerar quando um cartão se perde (sem mexer no registo).
--   - O registo passa por uma função SECURITY DEFINER: o quiosque nunca
--     escreve diretamente na tabela e as regras (janela do treino,
--     tolerância, equipa certa, clube certo) ficam no servidor.
--   - A marcação manual continua a existir. O QR só ACRESCENTA.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Colunas novas
-- ---------------------------------------------------------------------

-- Token do cartão QR do atleta. Regenerável (revoga o cartão anterior).
alter table players add column if not exists qr_token text;
update players set qr_token = encode(gen_random_bytes(12), 'hex') where qr_token is null;
alter table players alter column qr_token set default encode(gen_random_bytes(12), 'hex');
create unique index if not exists idx_players_qr_token on players (qr_token);

-- Origem do registo de presença e instante da passagem no quiosque.
-- 'manual' = marcado pelo treinador na lista; 'qr' = leitura do cartão.
alter table attendances add column if not exists source text not null default 'manual';
alter table attendances add column if not exists checked_in_at timestamptz;
do $$
begin
  alter table attendances add constraint attendances_source_check
    check (source in ('manual','qr'));
exception
  when duplicate_object then null;
end $$;

-- Definições do check-in por QR (linha única de settings).
--   qr_checkin_enabled -> liga/desliga o modo quiosque no clube
--   qr_tolerance_min   -> minutos de tolerância antes de contar como atraso
--   qr_window_before_min / qr_window_after_min -> janela em que o quiosque
--     aceita leituras para um treino (antes de começar / depois de começar)
--   timezone -> fuso do clube, para o cálculo do atraso bater certo
alter table settings add column if not exists qr_checkin_enabled   boolean not null default true;
alter table settings add column if not exists qr_tolerance_min     integer not null default 5;
alter table settings add column if not exists qr_window_before_min integer not null default 60;
alter table settings add column if not exists qr_window_after_min  integer not null default 90;
alter table settings add column if not exists timezone             text    not null default 'Europe/Lisbon';

-- ---------------------------------------------------------------------
-- 2. Apoio: hora local do clube
-- ---------------------------------------------------------------------
-- Os eventos guardam `date` (data) e `time` (texto 'HH:MM') na hora local do
-- clube, mas `now()` no servidor é UTC. Sem converter, o atraso vinha errado
-- por uma hora em cada mudança de horário.
--
-- Atenção: sendo SECURITY DEFINER, esta função NÃO passa pelo RLS — daí o
-- filtro explícito por `current_org_id()`, senão apanhava as definições de
-- outro clube qualquer.
create or replace function public.club_now()
returns timestamp
language sql
stable
security definer
set search_path = public
as $$
  select (now() at time zone coalesce(
    (select nullif(trim(s.timezone), '')
       from public.settings s
      where s.org_id is not distinct from current_org_id()
      limit 1),
    'Europe/Lisbon'
  ))::timestamp;
$$;

-- ---------------------------------------------------------------------
-- 3. Registo de presença por QR
-- ---------------------------------------------------------------------
-- Recebe o token lido pela câmara e (opcionalmente) o treino escolhido no
-- quiosque. Sem treino explícito, procura o treino da equipa do atleta mais
-- próximo do momento atual, dentro da janela configurada — é o que permite
-- ter UM quiosque à entrada a servir vários escalões ao mesmo tempo.
--
-- Devolve sempre um objeto JSON (nunca lança erro por "não encontrei"), para
-- o quiosque poder mostrar uma mensagem grande e continuar a ler:
--   { ok, reason, status, already, minutes_late, player: {...}, event: {...} }
create or replace function public.check_in_by_qr(
  p_token    text,
  p_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role      text := app_role();
  v_org       uuid := current_org_id();
  v_player    players%rowtype;
  v_event     events%rowtype;
  v_now       timestamp := club_now();
  v_start     timestamp;
  v_tol       integer;
  v_before    integer;
  v_after     integer;
  v_enabled   boolean;
  v_late      integer;
  v_status    text;
  v_existing  attendances%rowtype;
  v_result    jsonb;
begin
  -- Quem pode operar o quiosque: os mesmos papéis que marcam presenças à mão.
  if v_role is null or v_role not in ('coordenador','treinador') then
    return jsonb_build_object('ok', false, 'reason', 'sem_permissao');
  end if;

  -- SECURITY DEFINER não passa pelo RLS: as definições têm de ser pedidas ao
  -- clube certo à mão, ou o quiosque herdava a tolerância de outro clube.
  select coalesce(s.qr_checkin_enabled, true),
         coalesce(s.qr_tolerance_min, 5),
         coalesce(s.qr_window_before_min, 60),
         coalesce(s.qr_window_after_min, 90)
    into v_enabled, v_tol, v_before, v_after
    from settings s
   where s.org_id is not distinct from v_org
   limit 1;

  -- Sem linha de definições (clube acabado de criar) ficam os valores base.
  v_tol    := coalesce(v_tol, 5);
  v_before := coalesce(v_before, 60);
  v_after  := coalesce(v_after, 90);

  if not coalesce(v_enabled, true) then
    return jsonb_build_object('ok', false, 'reason', 'desativado');
  end if;

  -- O atleta do cartão. O filtro por org_id impede que um cartão de outro
  -- clube (ou de um atleta arquivado) registe presença aqui.
  select * into v_player
    from players
   where qr_token = p_token
     and archived_at is null
     and (v_org is null or org_id = v_org)
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'cartao_desconhecido');
  end if;

  if v_player.team_id is null then
    return jsonb_build_object('ok', false, 'reason', 'sem_equipa',
                              'player', jsonb_build_object('id', v_player.id, 'name', v_player.name));
  end if;

  -- O treino: o escolhido no quiosque, ou o da equipa do atleta mais próximo
  -- de agora dentro da janela configurada.
  if p_event_id is not null then
    select * into v_event from events
     where id = p_event_id and archived_at is null
       and (v_org is null or org_id = v_org)
     limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'treino_desconhecido');
    end if;
    if v_event.team_id is distinct from v_player.team_id then
      return jsonb_build_object('ok', false, 'reason', 'equipa_errada',
                                'player', jsonb_build_object('id', v_player.id, 'name', v_player.name));
    end if;
  else
    select * into v_event from events e
     where e.archived_at is null
       and e.type = 'treino'
       and e.team_id = v_player.team_id
       and (v_org is null or e.org_id = v_org)
       and (e.date + coalesce(nullif(e.time,''), '00:00')::time)
             between v_now - make_interval(mins => v_after)
                 and v_now + make_interval(mins => v_before)
     order by abs(extract(epoch from
       (e.date + coalesce(nullif(e.time,''), '00:00')::time) - v_now))
     limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'reason', 'sem_treino',
                                'player', jsonb_build_object('id', v_player.id, 'name', v_player.name));
    end if;
  end if;

  -- Um treinador só regista nos treinos das SUAS equipas (espelha o RLS).
  if v_role = 'treinador'
     and v_event.team_id not in (select trainer_team_ids()) then
    return jsonb_build_object('ok', false, 'reason', 'sem_permissao_equipa');
  end if;

  -- Estado: presente dentro da tolerância, atraso a seguir.
  v_start := v_event.date + coalesce(nullif(v_event.time, ''), '00:00')::time;
  v_late  := greatest(0, floor(extract(epoch from (v_now - v_start)) / 60)::int);
  if v_late <= v_tol then
    v_status := 'presente';
    v_late   := null;
  else
    v_status := 'atraso';
  end if;

  select * into v_existing from attendances
   where event_id = v_event.id and player_id = v_player.id;

  -- Já comparecia (ou o treinador justificou a falta à mão): não mexe. Uma
  -- decisão humana ganha sempre à câmara, e passar o cartão duas vezes não
  -- transforma um presente em atraso.
  if found and v_existing.status in ('presente','atraso','justificado') then
    return jsonb_build_object(
      'ok', true, 'already', true,
      'status', v_existing.status,
      'minutes_late', v_existing.minutes_late,
      'player', jsonb_build_object('id', v_player.id, 'name', v_player.name,
                                   'number', v_player.number, 'team_id', v_player.team_id),
      'event', jsonb_build_object('id', v_event.id, 'date', v_event.date,
                                  'time', v_event.time, 'team_id', v_event.team_id)
    );
  end if;

  -- `org_id` fica ao cuidado do DEFAULT current_org_id() (ver multitenant.sql).
  insert into attendances (event_id, player_id, status, minutes_late, source, checked_in_at)
  values (v_event.id, v_player.id, v_status, v_late, 'qr', now())
  on conflict (event_id, player_id) do update
    set status        = excluded.status,
        minutes_late  = excluded.minutes_late,
        justification = null,
        source        = 'qr',
        checked_in_at = excluded.checked_in_at;

  v_result := jsonb_build_object(
    'ok', true, 'already', false,
    'status', v_status,
    'minutes_late', v_late,
    'player', jsonb_build_object('id', v_player.id, 'name', v_player.name,
                                 'number', v_player.number, 'team_id', v_player.team_id),
    'event', jsonb_build_object('id', v_event.id, 'date', v_event.date,
                                'time', v_event.time, 'team_id', v_event.team_id)
  );
  return v_result;
end;
$$;

revoke all on function public.check_in_by_qr(text, uuid) from public, anon;
grant execute on function public.check_in_by_qr(text, uuid) to authenticated;
grant execute on function public.club_now() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Fechar a sessão: quem não passou o cartão fica em falta
-- ---------------------------------------------------------------------
-- Chamado pelo botão "Fechar sessão" no fim do treino. Marca `falta` a todos
-- os atletas da equipa que ficaram sem registo nenhum. Não toca em quem já
-- tem estado — nem nas justificações.
create or replace function public.close_attendance_session(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  text := app_role();
  v_org   uuid := current_org_id();
  v_event events%rowtype;
  v_count integer;
begin
  if v_role is null or v_role not in ('coordenador','treinador') then
    raise exception 'Sem permissão para fechar a sessão.';
  end if;

  select * into v_event from events
   where id = p_event_id and (v_org is null or org_id = v_org);
  if not found then
    raise exception 'Treino não encontrado.';
  end if;

  if v_role = 'treinador'
     and v_event.team_id not in (select trainer_team_ids()) then
    raise exception 'Sem permissão para fechar a sessão desta equipa.';
  end if;

  insert into attendances (event_id, player_id, status, source)
  select v_event.id, p.id, 'falta', 'manual'
    from players p
   where p.team_id = v_event.team_id
     and p.archived_at is null
     and (v_org is null or p.org_id = v_org)
     and not exists (
       select 1 from attendances a
        where a.event_id = v_event.id and a.player_id = p.id
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.close_attendance_session(uuid) from public, anon;
grant execute on function public.close_attendance_session(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Isolamento por clube das colunas novas
-- ---------------------------------------------------------------------
-- Nada a acrescentar: `attendances` e `players` já têm `org_id` e a política
-- RESTRICTIVE de isolamento (ver multitenant.sql). As funções acima são
-- SECURITY DEFINER e filtram explicitamente por `current_org_id()`.
