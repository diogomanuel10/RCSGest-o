-- =====================================================================
-- Central RCS — Sistema de Notificações
-- =====================================================================
-- Corre este ficheiro no SQL Editor do Supabase.
-- Pode ser corrido várias vezes sem problema (usa IF NOT EXISTS / OR REPLACE).
--
-- O que cria:
--   1. Tabela `notifications`       — inbox do coordenador
--   2. Tabela `push_subscriptions`  — subscrições Web Push por dispositivo
--   3. Trigger: novo prospeto       → notificação automática
--   4. Trigger: estado do prospeto  → notificação ao mudar de coluna
--   5. Trigger: avaliação de atleta → notificação ao decidir Mantém/Sai
--
-- As presenças em falta são verificadas no frontend (ver notifications.js).
-- =====================================================================

-- -----------------------------------------------------------------------
-- 1. Tabela de notificações
-- -----------------------------------------------------------------------
create table if not exists notifications (
  id          uuid        primary key default gen_random_uuid(),
  type        text        not null,
  title       text        not null,
  body        text        not null,
  data        jsonb,
  target_role text        not null default 'coordenador',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_notif_created on notifications (created_at desc);
create index if not exists idx_notif_role    on notifications (target_role);
create index if not exists idx_notif_unread  on notifications (read_at) where read_at is null;

-- -----------------------------------------------------------------------
-- 2. Tabela de subscrições Web Push
-- -----------------------------------------------------------------------
create table if not exists push_subscriptions (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth_key    text        not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

create index if not exists idx_push_subs_user on push_subscriptions (user_id);

-- -----------------------------------------------------------------------
-- RLS: Notificações
-- -----------------------------------------------------------------------
alter table notifications enable row level security;

drop policy if exists "notif_read"   on notifications;
drop policy if exists "notif_insert" on notifications;
drop policy if exists "notif_update" on notifications;
drop policy if exists "notif_delete" on notifications;

-- Leitura: só o coordenador (os triggers escrevem com target_role = 'coordenador').
create policy "notif_read" on notifications for select to authenticated
  using (app_role() = 'coordenador');

-- Inserção: coordenador pode inserir (check de presenças em falta vem do frontend).
create policy "notif_insert" on notifications for insert to authenticated
  with check (app_role() = 'coordenador');

-- Atualização: coordenador marca como lida.
create policy "notif_update" on notifications for update to authenticated
  using  (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');

-- Remoção: coordenador pode limpar notificações antigas.
create policy "notif_delete" on notifications for delete to authenticated
  using (app_role() = 'coordenador');

-- -----------------------------------------------------------------------
-- RLS: Subscrições Web Push
-- -----------------------------------------------------------------------
alter table push_subscriptions enable row level security;

drop policy if exists "push_subs_own" on push_subscriptions;

-- Cada utilizador gere as suas próprias subscrições.
create policy "push_subs_own" on push_subscriptions for all to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- Ativar Realtime para a tabela notifications
-- (necessário para o frontend receber novos registos em tempo real)
-- -----------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end;
$$;

-- -----------------------------------------------------------------------
-- 3. Trigger: novo prospeto adicionado ao funil
-- -----------------------------------------------------------------------
create or replace function notify_prospect_inserted()
returns trigger language plpgsql security definer as $$
begin
  -- Não notificar prospetos que já nascem arquivados (ex.: conversão de atleta).
  if NEW.archived_at is not null then
    return NEW;
  end if;

  insert into notifications (type, title, body, data)
  values (
    'prospect_added',
    'Novo prospeto no recrutamento',
    NEW.name || ' foi adicionado ao funil de recrutamento.',
    jsonb_build_object(
      'prospect_id', NEW.id,
      'name',        NEW.name,
      'status',      NEW.status
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_prospect_added on prospects;
create trigger trg_notify_prospect_added
  after insert on prospects
  for each row
  execute function notify_prospect_inserted();

-- -----------------------------------------------------------------------
-- 4. Trigger: estado do prospeto alterado (movimento de coluna no Kanban)
-- -----------------------------------------------------------------------
create or replace function notify_prospect_status_changed()
returns trigger language plpgsql security definer as $$
declare
  label text;
begin
  label := case NEW.status
    when 'observado'  then 'Observado'
    when 'contactado' then 'Contactado'
    when 'negociacao' then 'Em Negociação'
    when 'confirmado' then 'Confirmado'
    when 'inscrito'   then 'Inscrito'
    when 'dispensado' then 'Dispensado'
    else NEW.status
  end;

  insert into notifications (type, title, body, data)
  values (
    'prospect_status',
    'Recrutamento: estado atualizado',
    NEW.name || ' passou para ' || label || '.',
    jsonb_build_object(
      'prospect_id', NEW.id,
      'name',        NEW.name,
      'old_status',  OLD.status,
      'new_status',  NEW.status
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_prospect_status on prospects;
create trigger trg_notify_prospect_status
  after update on prospects
  for each row
  when (OLD.status is distinct from NEW.status)
  execute function notify_prospect_status_changed();

-- -----------------------------------------------------------------------
-- 5. Trigger: avaliação de plantel alterada (Mantém / Sai / Pendente)
-- -----------------------------------------------------------------------
create or replace function notify_review_status_changed()
returns trigger language plpgsql security definer as $$
declare
  label text;
begin
  label := case NEW.review_status
    when 'mantem'   then 'Mantém'
    when 'sai'      then 'Sai'
    when 'pendente' then 'Pendente'
    else NEW.review_status
  end;

  insert into notifications (type, title, body, data)
  values (
    'review_status',
    'Avaliação de plantel atualizada',
    NEW.name || ' → ' || label || '.',
    jsonb_build_object(
      'player_id',     NEW.id,
      'name',          NEW.name,
      'review_status', NEW.review_status
    )
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_review_status on players;
create trigger trg_notify_review_status
  after update on players
  for each row
  when (OLD.review_status is distinct from NEW.review_status and NEW.review_status is not null)
  execute function notify_review_status_changed();
