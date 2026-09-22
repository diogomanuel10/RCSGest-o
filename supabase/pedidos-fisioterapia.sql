-- =====================================================================
-- Rumia — Pedidos de Fisioterapia (treinador -> fisioterapeuta)
-- =====================================================================
-- Corre DEPOIS de schema.sql, notifications.sql, trainer-notifications.sql
-- (dá o `target_user_id`) e multitenant.sql (dá o `org_id`).
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: o canal fisio -> treinador já existe (`athlete_availability`: o
-- estado do atleta e as limitações ao treino, que o treinador lê no perfil).
-- O canal contrário não existia de todo. "A Rita queixa-se do ombro" saía da
-- app para o WhatsApp: quem avisou não sabe se foi visto, e quem trata não
-- tem lista nenhuma para trabalhar. É o mesmo buraco que os Pedidos de
-- Equipamento vieram tapar do outro lado do clube, e o desenho é o mesmo.
--
-- O que cria:
--   1. Tabela `physio_requests` (um pedido = uma queixa sobre um atleta)
--   2. RLS: o treinador pede nas SUAS equipas; triage a fisio/coordenador
--   3. Trigger `guard_physio_triage` — quem pede não se agenda a si próprio
--   4. Fecho automático quando o atendimento marcado fica "realizado"
--   5. Notificações: pedido novo -> fisio; triagem -> quem pediu
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
-- O pedido NÃO é dado clínico: é o que o treinador viu no pavilhão, escrito
-- por quem não é clínico. O que nasce dele — episódio, diagnóstico, plano —
-- continua reservado ao `med_rw`, e é a fisio que decide se existe. Por isso
-- o treinador escreve aqui e não escreve em mais lado nenhum do módulo.
--
-- Não há coluna de PRIORIDADE. A prioridade real é a data que a fisio marca,
-- e um campo à parte seria um segundo dono do mesmo dado. O que o treinador
-- declara é um FACTO observável — se a atleta está a treinar, a treinar
-- limitada ou parada — e é isso que ordena a fila da triagem.
--
-- Também não há `team_id`: a equipa lê-se do atleta, como nos pedidos de
-- equipamento. Um atleta que muda de escalão ficaria com o pedido preso ao
-- escalão antigo.
create table if not exists physio_requests (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  -- O que o treinador viu / o que a atleta diz. Texto livre e obrigatório:
  -- é a única coisa que este pedido tem para dizer.
  complaint     text not null,
  -- Desde quando (opcional). "Há duas semanas" e "ontem" são queixas
  -- diferentes, e é o treinador quem sabe.
  since         date,
  -- Como está a treinar AGORA. É o facto que ordena a fila.
  training      text not null default 'normal'
                check (training in ('normal','limitada','parada')),
  status        text not null default 'novo'
                check (status in ('novo','agendado','fechado','dispensado')),
  -- O atendimento que a triagem marcou. `set null`: apagar o atendimento não
  -- pode apagar o pedido que lhe deu origem.
  appointment_id uuid references physio_appointments(id) on delete set null,
  -- O episódio clínico, quando a fisio decidir que há um. Nasce sempre nulo:
  -- quem decide que uma queixa é um episódio é quem a avalia.
  episode_id    uuid references clinical_episodes(id) on delete set null,
  -- Resposta da fisio. Obrigatória ao dispensar (ver a app): um pedido
  -- devolvido sem explicação volta como o mesmo pedido na semana seguinte.
  triage_note   text,
  requested_by  uuid references auth.users(id) on delete set null,
  triaged_by    uuid references auth.users(id) on delete set null,
  triaged_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_physreq_player  on physio_requests (player_id);
create index if not exists idx_physreq_status  on physio_requests (status);
create index if not exists idx_physreq_created on physio_requests (created_at desc);

-- ---------------------------------------------------------------------
-- 2. Multi-tenant (org_id + isolamento por clube)
-- ---------------------------------------------------------------------
alter table physio_requests add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table physio_requests alter column org_id set default current_org_id();
create index if not exists idx_physio_requests_org on physio_requests (org_id);

alter table physio_requests enable row level security;

drop policy if exists tenant_isolation on physio_requests;
create policy tenant_isolation on physio_requests as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 3. Políticas por papel
-- ---------------------------------------------------------------------
drop policy if exists "physreq_read"   on physio_requests;
drop policy if exists "physreq_insert" on physio_requests;
drop policy if exists "physreq_update" on physio_requests;
drop policy if exists "physreq_delete" on physio_requests;

-- Leitura: o treinador vê os pedidos das SUAS equipas (um pedido que quem
-- pediu não pode acompanhar é a mensagem de telemóvel outra vez), e a fisio e
-- o coordenador veem todos.
--
-- Mais ninguém. A direção, o seccionista e o leitura ficam de fora de
-- propósito: isto é queixa de saúde de uma menor escrita num campo de texto,
-- e o Departamento Médico já é exclusivo destes dois papéis (`med_rw`). Uma
-- lista que toda a gente vê deixa de ser um sítio onde se escreve o que a
-- Rita tem no ombro. O ATLETA também não entra — quem pede é sempre o
-- treinador, e o portal não tem porta nenhuma para aqui.
create policy "physreq_read" on physio_requests for select to authenticated
using (
  app_role() in ('coordenador','fisioterapeuta')
  or (app_role() = 'treinador'
      and player_id in (select id from players where team_id in (select trainer_team_ids())))
);

-- Criação: o treinador só pede para atletas das suas equipas; o coordenador
-- pede para qualquer atleta do clube (em metade dos clubes é ele quem trata
-- do plantel). A fisio não precisa de pedir a si própria — marca.
create policy "physreq_insert" on physio_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and (
    app_role() = 'coordenador'
    or (app_role() = 'treinador'
        and player_id in (select id from players where team_id in (select trainer_team_ids())))
  )
);

-- Alteração: a fisio e o coordenador triam; o treinador só corrige o SEU
-- pedido enquanto ninguém lhe pegou (uma queixa mal escrita, uma data). O
-- estado e a marcação ficam-lhe fechados pelo trigger abaixo.
create policy "physreq_update" on physio_requests for update to authenticated
using (
  app_role() in ('coordenador','fisioterapeuta')
  or (app_role() = 'treinador' and requested_by = auth.uid() and status = 'novo')
)
with check (
  app_role() in ('coordenador','fisioterapeuta')
  or (app_role() = 'treinador' and requested_by = auth.uid())
);

-- Remoção: o treinador retira o que pediu enquanto ninguém lhe pegou (a
-- atleta apareceu no dia seguinte sem queixa nenhuma); depois de triado é
-- histórico clínico e só a fisio/coordenador o apagam.
create policy "physreq_delete" on physio_requests for delete to authenticated
using (
  app_role() in ('coordenador','fisioterapeuta')
  or (app_role() = 'treinador' and requested_by = auth.uid() and status = 'novo')
);

-- ---------------------------------------------------------------------
-- 4. Quem pede não se agenda a si próprio
-- ---------------------------------------------------------------------
-- A política de UPDATE deixa o treinador corrigir o pedido enquanto está por
-- triar — e isso, sozinho, deixava-o também escrever status='agendado' e
-- apontar para um atendimento. A agenda é de quem trata: um treinador que
-- marque atendimentos sozinho é a agenda da fisio decidida por dez pessoas.
-- É o mesmo trigger do `guard_request_decision` dos equipamentos.
create or replace function public.guard_physio_triage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(app_role(), '') not in ('coordenador','fisioterapeuta')
     and (new.status         is distinct from old.status
       or new.appointment_id is distinct from old.appointment_id
       or new.episode_id     is distinct from old.episode_id
       or new.triage_note    is distinct from old.triage_note) then
    raise exception 'Só o fisioterapeuta ou o coordenador podem triar um pedido de fisioterapia.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_physio_triage on physio_requests;
create trigger trg_guard_physio_triage before update on physio_requests
  for each row execute function public.guard_physio_triage();

-- ---------------------------------------------------------------------
-- 5. O pedido fecha-se sozinho quando o atendimento se realiza
-- ---------------------------------------------------------------------
-- Quem acabou de registar que o atendimento aconteceu não devia ter de ir
-- fechar também o pedido que lhe deu origem: um segundo passo manual para
-- dizer a mesma coisa é um passo que se esquece, e a fila de triagem enche-se
-- de pedidos já resolvidos até deixar de ser lida.
create or replace function public.close_physio_request_on_appointment()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if NEW.status = 'realizado' and NEW.status is distinct from OLD.status then
    update physio_requests
       set status = 'fechado'
     where appointment_id = NEW.id
       and status = 'agendado';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_close_physio_request on physio_appointments;
create trigger trg_close_physio_request after update on physio_appointments
  for each row execute function public.close_physio_request_on_appointment();

-- ---------------------------------------------------------------------
-- 6. Notificações
-- ---------------------------------------------------------------------
-- A. Pedido novo -> quem tria (fisioterapeuta e coordenador).
--    Sem isto o pedido fica a marinar num separador que a fisio só abre
--    quando se lembra — que é exatamente o problema das mensagens de
--    telemóvel que isto vem substituir.
--
--    O corpo leva o NOME e como está a treinar, e nunca o texto da queixa:
--    uma notificação aparece no ecrã bloqueado de um telemóvel, muitas vezes
--    à frente de outras pessoas, e o que a atleta tem no ombro não é para ali.
--    Quem a abre está na app, autenticado, e lê o pedido inteiro.
create or replace function notify_physio_request_created()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_player text;
  v_role   text;
  v_state  text;
begin
  select name into v_player from players where id = NEW.player_id;
  select role into v_role   from profiles where id = NEW.requested_by;
  v_state := case NEW.training
    when 'parada'   then 'Não está a treinar'
    when 'limitada' then 'A treinar com limitações'
    else 'A treinar normalmente'
  end;

  -- Uma notificação POR PAPEL que tria: o inbox é filtrado por
  -- `target_role = app_role()`, por isso uma linha dirigida ao
  -- fisioterapeuta nunca chegaria ao coordenador, que num clube sem fisio é
  -- quem trata disto.
  insert into notifications (type, title, body, data, target_role, org_id)
  select
    'physio_request',
    'Novo pedido de fisioterapia',
    coalesce(v_player, 'Atleta') || ' — ' || v_state || '.',
    jsonb_build_object('request_id', NEW.id, 'player_id', NEW.player_id),
    r,
    NEW.org_id
  from unnest(array['fisioterapeuta','coordenador']) as r
  -- Quem pediu não precisa de ser avisado do seu próprio pedido.
  where r is distinct from coalesce(v_role, '');

  return NEW;
end;
$$;

drop trigger if exists trg_notify_physio_request_created on physio_requests;
create trigger trg_notify_physio_request_created
  after insert on physio_requests
  for each row execute function notify_physio_request_created();

-- B. Triagem -> quem pediu.
--    Um pedido a que ninguém responde ensina o treinador a não voltar a
--    pedir, e volta tudo para o telemóvel. Aqui o corpo leva a data marcada
--    ou o motivo escrito pela fisio: é ela a responder a quem perguntou.
create or replace function notify_physio_request_triaged()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_player text;
  v_title  text;
  v_body   text;
  v_appt   physio_appointments%rowtype;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.requested_by is null then return NEW; end if;
  -- Quem triou o seu próprio pedido já sabe o que decidiu.
  if NEW.requested_by = NEW.triaged_by then return NEW; end if;
  -- O fecho automático (o atendimento realizou-se) não avisa: quem pediu já
  -- foi avisado da marcação, e o que aconteceu na sessão não é para aqui.
  if NEW.status = 'fechado' then return NEW; end if;

  select name into v_player from players where id = NEW.player_id;

  if NEW.status = 'agendado' then
    select * into v_appt from physio_appointments where id = NEW.appointment_id;
    v_title := 'Pedido de fisioterapia agendado';
    v_body  := coalesce(v_player, 'Atleta') || ' — '
      || coalesce(to_char(v_appt.date, 'DD/MM')
                  || coalesce(' às ' || left(v_appt.time::text, 5), ''),
                  'marcado')
      || coalesce('. ' || nullif(trim(NEW.triage_note), ''), '.');
  elsif NEW.status = 'dispensado' then
    v_title := 'Pedido de fisioterapia dispensado';
    v_body  := coalesce(v_player, 'Atleta')
      || coalesce(' — ' || nullif(trim(NEW.triage_note), ''), ' — sem motivo indicado') || '.';
  else
    v_title := 'Pedido de fisioterapia reaberto';
    v_body  := coalesce(v_player, 'Atleta') || ' — voltou à fila de triagem.';
  end if;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'physio_request_triaged', v_title, v_body,
    jsonb_build_object('request_id', NEW.id, 'player_id', NEW.player_id, 'status', NEW.status),
    NEW.requested_by, NEW.org_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_physio_request_triaged on physio_requests;
create trigger trg_notify_physio_request_triaged
  after update on physio_requests
  for each row execute function notify_physio_request_triaged();
