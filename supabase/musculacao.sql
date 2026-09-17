-- =====================================================================
-- Rumia — Musculação: sessões com o plantel ESCOLHIDO
-- =====================================================================
-- Correr DEPOIS de schema.sql, multitenant.sql, comunicacao.sql,
-- qrcode-presencas.sql e notificacoes-atleta.sql. Pode correr várias vezes.
--
-- Porque existe: a preparação física já tinha periodização, avaliações e
-- perfis, mas o trabalho que as atletas fazem mesmo — a sessão de ginásio das
-- 19h de terça — não estava em lado nenhum que elas vissem. Vivia num papel
-- colado à porta do ginásio e num grupo de WhatsApp: quem não estava lá na
-- terça não sabia se lhe tinha calhado a sessão, e o calendário do clube dizia
-- que naquela hora não havia nada.
--
-- A sessão passa a ser um EVENTO (`events`, tipo `musculacao`) e não uma
-- tabela nova. É essa decisão que a faz aparecer no calendário, na página de
-- cada atleta, nas presenças e nas notificações — tudo isso já existe e já
-- funciona para eventos. Uma tabela à parte obrigava a reescrever cada um
-- desses caminhos, e o que se ganhava era zero.
--
-- O que muda em relação a um treino é UMA coisa, e é a que interessa: o
-- plantel. Um treino é da equipa toda; uma sessão de musculação é dos atletas
-- escolhidos para aquele horário. O ginásio tem seis bancos e não vinte, e o
-- horário faz-se por grupos — escrever a sessão para a equipa inteira era
-- dizer a doze atletas que têm ginásio à mesma hora no mesmo sítio.
--
-- O que cria:
--   1. `event_players` — quem entra em cada sessão (+ isolamento por clube)
--   2. `event_roster_ids` / `event_athlete_user_ids` — o plantel de um evento
--   3. Escrita de eventos e presenças para o PREPARADOR FÍSICO (só musculação)
--   4. Notificações: as do atleta passam a respeitar o grupo escolhido, e
--      entrar/sair de um grupo avisa
--   5. `respond_to_event` e `close_attendance_session` a olhar para o grupo
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem entra em cada sessão
-- ---------------------------------------------------------------------
-- É uma linha por ATLETA e por EVENTO, como a convocatória de um jogo — e pela
-- mesma razão: estar no grupo é ter linha, não estar é não ter. Sem coluna de
-- estado, porque não há um segundo estado que signifique alguma coisa.
create table if not exists event_players (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id)  on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  created_at timestamptz default now(),
  unique (event_id, player_id)
);

create index if not exists idx_event_players_event  on event_players (event_id);
create index if not exists idx_event_players_player on event_players (player_id);

-- Multi-tenant: `org_id` + política RESTRICTIVE de isolamento, como todas as
-- outras tabelas de dados (ver multitenant.sql).
alter table event_players add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table event_players alter column org_id set default current_org_id();
create index if not exists idx_event_players_org on event_players (org_id);

-- Linhas criadas antes desta coluna existir (não deve haver, mas é barato):
update event_players ep
   set org_id = e.org_id
  from events e
 where e.id = ep.event_id and ep.org_id is null;

alter table event_players enable row level security;

drop policy if exists tenant_isolation on event_players;
create policy tenant_isolation on event_players as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- LEITURA: a equipa técnica vê os grupos todos; o treinador os das SUAS
-- equipas; a atleta os SEUS. Uma atleta que não veja a sua própria linha não
-- consegue saber que tem ginásio — que é o problema de origem.
drop policy if exists "evp_read" on event_players;
create policy "evp_read" on event_players for select to authenticated using (
  app_role() in ('coordenador','direcao','seccionista','leitura','fisioterapeuta','preparador')
  OR player_id = athlete_player_id()
  OR event_id in (select id from events where team_id in (select trainer_team_ids()))
);

-- ESCRITA: quem monta o horário — o coordenador e o preparador físico. O
-- treinador fica de fora de propósito: a musculação é da preparação física, e
-- dois donos do mesmo horário é a forma de ninguém saber quem o mudou.
drop policy if exists "evp_write" on event_players;
create policy "evp_write" on event_players for all to authenticated
  using (app_role() in ('coordenador','preparador'))
  with check (app_role() in ('coordenador','preparador'));

-- ---------------------------------------------------------------------
-- 2. O plantel de um evento
-- ---------------------------------------------------------------------
-- A regra escrita UMA vez: na musculação são os atletas escolhidos; em tudo o
-- resto é a equipa. Com a regra repetida em cada função, bastava uma ficar
-- para trás para uma atleta ser notificada de uma sessão que não é dela (ou,
-- pior, não ser notificada da que é).
create or replace function public.event_roster_ids(p_event events)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(case when p_event.type = 'musculacao' then
    (select array_agg(ep.player_id)
       from event_players ep
       join players p on p.id = ep.player_id
      where ep.event_id = p_event.id
        and p.archived_at is null)
  else
    (select array_agg(p.id)
       from players p
      where p.team_id = p_event.team_id
        and p.archived_at is null
        and (p_event.org_id is null or p.org_id = p_event.org_id))
  end, '{}'::uuid[]);
$$;

-- Os utilizadores (contas) desse plantel. Só chega a quem tem conta ligada à
-- ficha — sem conta não há a quem notificar, que é o que o convite ao portal
-- resolve.
create or replace function public.event_athlete_user_ids(p_event events)
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.user_id
    from players p
   where p.id = any(event_roster_ids(p_event))
     and p.user_id is not null
     and p.archived_at is null;
$$;

grant execute on function public.event_roster_ids(events) to authenticated;
grant execute on function public.event_athlete_user_ids(events) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Quem escreve uma sessão de musculação
-- ---------------------------------------------------------------------
-- O calendário continua a ser do coordenador. A musculação é a exceção, e é
-- uma exceção de domínio: quem monta os grupos do ginásio é o preparador
-- físico — obrigá-lo a pedir ao coordenador que lance cada sessão devolvia o
-- horário ao papel colado à porta.
--
-- O `with check` prende o TIPO nos dois sentidos: sem ele, o preparador criava
-- uma sessão de musculação e logo a seguir editava-a para "jogo", ficando com
-- escrita no calendário inteiro por uma porta lateral.
drop policy if exists "events_musculacao" on events;
create policy "events_musculacao" on events for all to authenticated
  using (app_role() = 'preparador' and type = 'musculacao')
  with check (app_role() = 'preparador' and type = 'musculacao');

-- PRESENÇAS: quem dá a sessão é quem a regista. Sem isto, o preparador marcava
-- o horário e não podia dizer quem apareceu — e uma sessão que não se regista
-- volta para o caderno.
drop policy if exists "att_musculacao" on attendances;
create policy "att_musculacao" on attendances for all to authenticated
  using (
    app_role() = 'preparador'
    and event_id in (select id from events where type = 'musculacao')
  )
  with check (
    app_role() = 'preparador'
    and event_id in (select id from events where type = 'musculacao')
  );

-- ---------------------------------------------------------------------
-- 4. Notificações
-- ---------------------------------------------------------------------
-- A etiqueta legível de um evento. Sem este `case`, uma sessão chegava ao
-- telemóvel como "Musculacao" (o `initcap` do tipo, sem cedilha) — que é o
-- mesmo problema do `equipment_article_label` a mandar `joelheiras` para o
-- telemóvel de uma família.
create or replace function public.event_label(p_event events)
returns text language sql immutable as $$
  select coalesce(p_event.title, case p_event.type
    when 'treino'     then 'Treino'
    when 'jogo'       then 'Jogo'
    when 'musculacao' then 'Musculação'
    else initcap(p_event.type)
  end);
$$;

-- A. Evento novo — agora só para quem ele abrange.
create or replace function public.notify_athletes_event_added()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if NEW.team_id is null or NEW.archived_at is not null then return NEW; end if;
  if NEW.date < current_date then return NEW; end if;

  -- Uma sessão de musculação nasce SEM ninguém (os participantes são linhas à
  -- parte, escritas logo a seguir): quem avisa é o trigger de `event_players`.
  -- Notificar aqui seria notificar um grupo vazio.
  if NEW.type = 'musculacao' then return NEW; end if;

  for uid in select event_athlete_user_ids(NEW) loop
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

-- B. Evento alterado (data, hora ou local).
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

  for uid in select event_athlete_user_ids(NEW) loop
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

-- C. Evento cancelado (arquivado).
create or replace function public.notify_athletes_event_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
begin
  if NEW.team_id is null then return NEW; end if;
  if NEW.date < current_date then return NEW; end if;

  for uid in select event_athlete_user_ids(NEW) loop
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

-- D/E. Entrar e sair de um grupo avisam AMBOS — a mesma regra da convocatória.
-- Avisar só a entrada deixava a atleta a contar com uma sessão de que já tinha
-- sido tirada; e é precisamente quem foi tirada que não tem como saber.
create or replace function public.notify_athlete_event_player_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  added boolean := (TG_OP = 'INSERT');
  row_  event_players%rowtype;
  ev    events%rowtype;
  uid   uuid;
begin
  if added then row_ := NEW; else row_ := OLD; end if;

  select * into ev from events where id = row_.event_id;
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
    case when added then 'event_joined' else 'event_left' end,
    case when added then 'Tens sessão de musculação' else 'Sessão de musculação retirada' end,
    case when added
      then event_label(ev) || ' a ' || to_char(ev.date, 'DD/MM')
           || coalesce(' às ' || ev.time, '')
           || coalesce(' — ' || ev.location, '') || '.'
      else 'Já não estás na sessão de ' || to_char(ev.date, 'DD/MM')
           || coalesce(' às ' || ev.time, '') || '.'
    end,
    jsonb_build_object('event_id', ev.id, 'type', ev.type, 'date', ev.date, 'joined', added),
    uid,
    ev.org_id
  );
  return row_;
end;
$$;

drop trigger if exists trg_notify_event_player_added on event_players;
create trigger trg_notify_event_player_added
  after insert on event_players
  for each row
  execute function notify_athlete_event_player_change();

drop trigger if exists trg_notify_event_player_removed on event_players;
create trigger trg_notify_event_player_removed
  after delete on event_players
  for each row
  execute function notify_athlete_event_player_change();

-- Quem é avisado quando uma atleta responde. Numa sessão de musculação quem
-- precisa de saber é o PREPARADOR FÍSICO — é ele que conta os bancos. Mandar
-- isso ao treinador da equipa era mandar-lhe respostas sobre um treino que ele
-- não dá; o coordenador entra pela mesma salvaguarda de sempre (quando não há
-- ninguém do outro lado, a resposta não pode cair no vazio).
create or replace function public.event_response_audience(
  p_team_id    uuid,
  p_org_id     uuid,
  p_event_type text
)
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  with staff as (
    select t.uid
      from (select team_trainer_user_ids(p_team_id) as uid) t
     where p_event_type <> 'musculacao'
    union
    select pr.id as uid
      from profiles pr
     where p_event_type = 'musculacao'
       and pr.role = 'preparador'
       and (p_org_id is null or pr.org_id = p_org_id)
  ),
  coords as (
    select pr.id as uid
    from   profiles pr
    where  pr.role = 'coordenador'
    and    (p_org_id is null or pr.org_id = p_org_id)
  )
  select distinct uid from (
    select uid from staff
    union
    select uid from coords
     where p_event_type = 'jogo'
        or not exists (select 1 from staff where uid is not null)
  ) t
  where uid is not null;
$$;

-- ---------------------------------------------------------------------
-- 5. Responder e fechar a sessão
-- ---------------------------------------------------------------------
-- A atleta responde à sessão como responde a um treino (o prazo é o mesmo: 6
-- horas antes), com uma condição a mais — tem de estar no grupo. Ser da equipa
-- não chega: responder "vou" a uma sessão que não é sua era aparecer a um
-- horário onde não há banco para ela.
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

  if v_event.type = 'musculacao'
     and not exists (
       select 1 from event_players
        where event_id = v_event.id and player_id = v_player.id
     ) then
    raise exception 'Não estás nesta sessão de musculação.';
  end if;

  v_start := v_event.date + coalesce(nullif(v_event.time,''), '23:59')::time;
  v_limit := case when v_event.type in ('treino','musculacao')
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

  if coalesce(v_before,'') is distinct from p_response then
    v_label := case v_event.type
                 when 'jogo'       then 'jogo'
                 when 'musculacao' then 'treino de musculação'
                 else 'treino'
               end;
    v_title := case when p_response = 'nao_vou'
                    then 'Falta avisada'
                    else 'Presença confirmada' end;

    for uid in select event_response_audience(v_event.team_id, v_event.org_id, v_event.type) loop
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

-- Fechar a sessão marca falta a quem ficou sem registo NENHUM — e "quem" é o
-- plantel do evento, não a equipa. Numa sessão de musculação de oito atletas,
-- a versão antiga marcava falta às doze que nem estavam convocadas.
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
  if v_role is null or v_role not in ('coordenador','treinador','preparador') then
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

  -- O preparador físico fecha as sessões de musculação e mais nenhuma: é o
  -- mesmo recorte da política de escrita das presenças.
  if v_role = 'preparador' and v_event.type <> 'musculacao' then
    raise exception 'Sem permissão para fechar esta sessão.';
  end if;

  insert into attendances (event_id, player_id, status, source)
  select v_event.id, p.id, 'falta', 'manual'
    from players p
   where p.id = any(event_roster_ids(v_event))
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
-- 6. Nota sobre o QR
-- ---------------------------------------------------------------------
-- O `check_in_by_qr` continua a procurar TREINOS e só treinos, de propósito: o
-- quiosque está à porta do pavilhão e escolhe o treino da equipa do atleta
-- mais perto de agora. Numa sessão de musculação o plantel é outro, e um
-- quiosque que "adivinhasse" o grupo marcava presença a quem passou pela porta
-- sem estar escalado. A app também não oferece o quiosque nestas sessões.
