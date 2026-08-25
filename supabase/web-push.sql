-- =====================================================================
-- Rumia — Web Push (notificações no telemóvel, com a app fechada)
-- =====================================================================
-- O sino dentro da app já existia, mas só toca a quem tem a app aberta: um
-- treino cancelado às 8h da manhã só era visto por quem calhasse de abrir a
-- Rumia nesse dia. Isto liga a última perna do caminho — a notificação sai
-- para o telemóvel como a de qualquer outra app.
--
-- Nada muda no resto do código: quem quer avisar alguém continua a inserir
-- uma linha em `notifications`. É o trigger daqui que a empurra para os
-- dispositivos. Um sítio só a decidir o que é uma notificação.
--
-- Como usar:
--   1. Gera o par de chaves VAPID (uma vez, na tua máquina):
--        npx web-push generate-vapid-keys
--   2. Põe a PÚBLICA no site (.env / Vercel):  VITE_VAPID_PUBLIC_KEY=...
--   3. Publica a Edge Function e dá-lhe os segredos:
--        supabase functions deploy send-push
--        supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=... \
--                             VAPID_SUBJECT=mailto:o-teu@email
--   4. Preenche a configuração no fim deste ficheiro (URL + service_role key)
--      e corre tudo no SQL Editor do Supabase.
--   5. É seguro re-executar.
-- =====================================================================

-- pg_net: pedidos HTTP a partir da base de dados, ASSÍNCRONOS. É o que
-- permite avisar a Edge Function sem pôr o INSERT à espera da rede — uma
-- notificação que demora não pode atrasar (nem falhar) a operação que a
-- originou.
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1. Configuração (fora do alcance do cliente)
-- ---------------------------------------------------------------------
-- Guarda o URL da função e a chave de serviço. Fica num schema à parte, com
-- RLS ligado e SEM políticas: mesmo que a anon key chegue aqui, não há
-- política que autorize uma única linha. Só o trigger (security definer) lê.
create schema if not exists private;

create table if not exists private.push_config (
  id           integer primary key default 1 check (id = 1),
  function_url text,
  service_key  text
);

alter table private.push_config enable row level security;
revoke all on private.push_config from anon, authenticated;

insert into private.push_config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Trigger: cada notificação nova sai para os dispositivos
-- ---------------------------------------------------------------------
create or replace function public.push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_key text;
begin
  select function_url, service_key into v_url, v_key
  from   private.push_config where id = 1;

  if coalesce(v_url, '') = '' then
    return NEW;  -- push por configurar: a app continua a funcionar na mesma
  end if;

  -- O push é um EXTRA. Se a chamada rebentar (função em baixo, URL errado),
  -- a notificação fica na mesma na tabela e aparece no sino — nunca se perde
  -- o aviso por causa do canal de entrega.
  begin
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || coalesce(v_key, '')
      ),
      body    := jsonb_build_object('record', to_jsonb(NEW))
    );
  exception when others then
    raise warning 'push_on_notification: %', sqlerrm;
  end;

  return NEW;
end;
$$;

drop trigger if exists trg_push_on_notification on notifications;
create trigger trg_push_on_notification
  after insert on notifications
  for each row
  execute function public.push_on_notification();

-- ---------------------------------------------------------------------
-- 3. Preencher a configuração
-- ---------------------------------------------------------------------
-- Substitui os dois valores e corre. O <ref> é o do teu projeto e a chave é
-- a `service_role` (Project Settings -> API). Ela NUNCA sai daqui: fica no
-- schema `private`, e é a Edge Function que a valida.
--
-- update private.push_config set
--   function_url = 'https://<ref>.supabase.co/functions/v1/send-push',
--   service_key  = '<service_role key>'
-- where id = 1;

-- Confirmar que ficou ligado:
--   select function_url is not null as configurado from private.push_config;
