-- =====================================================================
-- Central RCS — Web Push: subscrições + trigger pg_net
-- =====================================================================
-- Corre este ficheiro no SQL Editor do Supabase APÓS:
--   1. Fazer deploy da Edge Function "send-push"
--      (supabase/functions/send-push/index.ts)
--   2. Adicionar os segredos em Supabase → Edge Functions →
--      send-push → Secrets:
--        VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET
--   3. Substituir <PROJECT-REF> nas linhas ALTER DATABASE no fim deste
--      ficheiro pelo ID do teu projeto Supabase e descomentar.
-- =====================================================================

-- Ativar pg_net (chama Edge Functions a partir de triggers)
create extension if not exists pg_net;

-- -----------------------------------------------------------------------
-- Tabela: push_subscriptions
-- -----------------------------------------------------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "push_sub_select" on push_subscriptions
  for select using (auth.uid() = user_id);

create policy "push_sub_insert" on push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "push_sub_delete" on push_subscriptions
  for delete using (auth.uid() = user_id);

-- -----------------------------------------------------------------------
-- Função trigger: ao inserir uma notificação, chamar a Edge Function
-- -----------------------------------------------------------------------
create or replace function notify_send_push()
returns trigger language plpgsql security definer as $$
declare
  push_url    text := current_setting('app.push_function_url', true);
  push_secret text := current_setting('app.push_secret',       true);
begin
  -- Se a URL não estiver configurada, salta (modo sem Web Push).
  if push_url is null or push_url = '' then
    return new;
  end if;

  perform net.http_post(
    url     := push_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-push-secret', push_secret
    ),
    body    := jsonb_build_object(
      'id',             new.id,
      'title',          new.title,
      'body',           new.body,
      'type',           new.type,
      'data',           coalesce(new.data, '{}'::jsonb),
      'target_user_id', new.target_user_id,
      'target_role',    new.target_role
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_send_push on notifications;
create trigger trg_notify_send_push
  after insert on notifications
  for each row execute function notify_send_push();

-- -----------------------------------------------------------------------
-- Configuração: URL da Edge Function e segredo.
-- Descomentar e ajustar após fazer deploy da Edge Function.
-- -----------------------------------------------------------------------
-- alter database postgres set app.push_function_url =
--   'https://<PROJECT-REF>.supabase.co/functions/v1/send-push';
-- alter database postgres set app.push_secret =
--   'f543b521b0a5711fe4289984e9bdf0609a3853a336aeda7557f7f465c8828e00';
