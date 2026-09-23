-- =====================================================================
-- Rumia — Agenda da fisioterapia no Google Calendar (link de subscrição)
-- =====================================================================
-- Corre DEPOIS de schema.sql e multitenant.sql. Pode ser corrido várias
-- vezes sem problema. Precisa da Edge Function `calendar-feed` publicada
-- SEM verificação de JWT (o Google não inicia sessão na Rumia):
--
--   supabase functions deploy calendar-feed --no-verify-jwt
--
-- Porquê: a fisio vive no calendário do telemóvel, e a agenda dela na Rumia
-- era um sítio que tinha de se lembrar de abrir. Copiar à mão cada
-- atendimento para o Google é trabalho que se deixa de fazer à terceira
-- semana — e uma cópia não sabe quando o atendimento muda ou é cancelado.
-- Um link de SUBSCRIÇÃO resolve as duas coisas: cola-se uma vez, e o Google
-- vai buscar a agenda sozinho.
--
-- O preço conhecido: o Google refresca estes calendários quando quer (na
-- prática, de 8 em 8 a 24 em 24 horas). Serve para ter a semana no
-- telemóvel; para a mudança de última hora continua a haver a notificação.
--
-- O que cria:
--   1. `calendar_feeds` — um token secreto por utilizador
--   2. RPCs: ver, (re)gerar e desligar o link
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O token
-- ---------------------------------------------------------------------
-- O link não pode levar sessão (quem o abre é o servidor do Google), por
-- isso o TOKEN é a credencial: quem tem o link lê a agenda. É longo e
-- aleatório, é de UMA pessoa, e regenera-se num clique — a mesma decisão do
-- `qr_token` do cartão do atleta.
--
-- Sem políticas de RLS de propósito: ninguém lê esta tabela diretamente. As
-- RPCs abaixo só tocam na linha de quem chama, e a Edge Function usa a chave
-- de serviço.
create table if not exists calendar_feeds (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

alter table calendar_feeds enable row level security;

-- ---------------------------------------------------------------------
-- 2. RPCs
-- ---------------------------------------------------------------------
-- Só quem tem a agenda clínica: o fisioterapeuta e o coordenador — o
-- `med_rw`. A Edge Function volta a verificar o papel a CADA pedido, porque o
-- link sobrevive a uma mudança de papel e tem de deixar de funcionar com ela.

-- O link atual, ou nulo se ainda não foi gerado. Abrir o ecrã não cria nada:
-- um token que ninguém pediu é uma porta aberta que ninguém sabe que existe.
create or replace function public.my_calendar_feed()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select token from calendar_feeds where user_id = auth.uid();
$$;

-- Gera o link, ou troca-o por um novo. Trocar é o que se faz quando o link
-- foi parar onde não devia: o antigo deixa de funcionar no momento.
create or replace function public.rotate_calendar_feed()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if coalesce(app_role(), '') not in ('coordenador','fisioterapeuta') then
    raise exception 'Só a fisioterapia e o coordenador podem sincronizar a agenda clínica.';
  end if;

  insert into calendar_feeds (user_id)
  values (auth.uid())
  on conflict (user_id) do update
    set token = encode(gen_random_bytes(24), 'hex'),
        created_at = now()
  returning token into v_token;
  return v_token;
end;
$$;

-- Desliga: o link deixa de dar agenda nenhuma.
create or replace function public.revoke_calendar_feed()
returns void
language sql
security definer
set search_path = public
as $$
  delete from calendar_feeds where user_id = auth.uid();
$$;

revoke all on function public.my_calendar_feed()     from public;
revoke all on function public.rotate_calendar_feed() from public;
revoke all on function public.revoke_calendar_feed() from public;
grant execute on function public.my_calendar_feed()     to authenticated;
grant execute on function public.rotate_calendar_feed() to authenticated;
grant execute on function public.revoke_calendar_feed() to authenticated;
