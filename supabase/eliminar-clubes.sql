-- =====================================================================
-- Rumia — ELIMINAR clubes e contas (admin da plataforma)
-- =====================================================================
-- Corre DEPOIS de multitenant.sql (usa organizations/platform_admins e as
-- funções is_platform_admin() / current_org_id()). É seguro re-executar.
--
-- Porquê: um clube que experimentou a demonstração e não ficou fica para
-- sempre na lista do painel, a contar como cliente e a ocupar a base de
-- dados. Suspender esconde o problema — não devolve nada. Eliminar é uma
-- decisão comercial normal e tem de existir na app; se só existir no SQL
-- Editor, ou não se faz, ou faz-se à mão (que é onde se apaga o clube errado).
--
-- Duas operações, deliberadamente separadas:
--   admin_delete_org(...)  — apaga o CLUBE e tudo o que é dele.
--   admin_delete_user(...) — apaga UMA CONTA (ex.: quem se registou e nunca
--                            criou clube nenhum).
--
-- Isto é IRREVERSÍVEL: não é o soft-delete (`archived_at`) das entidades do
-- clube, que existe para se poder repor. Aqui as linhas desaparecem mesmo.
-- Por isso fica registo do que foi apagado (`platform_deletions`) — apagar sem
-- deixar rasto é a única forma de nunca se saber o que aconteceu a um cliente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Registo do que foi eliminado (histórico do admin da plataforma)
-- ---------------------------------------------------------------------
create table if not exists platform_deletions (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('org','user')),
  ref_id     uuid,               -- id do clube/conta (já não existe)
  label      text,               -- nome do clube / email da conta
  details    jsonb not null default '{}'::jsonb,  -- contagens do que caiu junto
  deleted_by uuid references auth.users(id) on delete set null,
  deleted_at timestamptz not null default now()
);
create index if not exists idx_platform_deletions_at on platform_deletions (deleted_at desc);

alter table platform_deletions enable row level security;
drop policy if exists "pdel_read" on platform_deletions;
-- Só o admin da plataforma lê. Escrita nenhuma: quem escreve são as funções
-- abaixo (security definer) — assim o histórico não é editável pela app.
create policy "pdel_read" on platform_deletions for select to authenticated
  using (is_platform_admin());

-- ---------------------------------------------------------------------
-- 2. Garantir que TODA a tabela com org_id cai com o clube
-- ---------------------------------------------------------------------
-- A eliminação assenta no ON DELETE CASCADE de organizations. Uma tabela
-- acrescentada depois com um org_id sem essa FK deixaria linhas órfãs a
-- apontar para um clube que já não existe — dados de um cliente apagado a
-- sobreviver à eliminação. Este bloco fecha essa porta e é idempotente.
do $$
declare
  r record;
begin
  for r in
    select c.table_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.column_name  = 'org_id'
       and exists (select 1 from information_schema.tables t
                    where t.table_schema = 'public' and t.table_name = c.table_name
                      and t.table_type = 'BASE TABLE')
       and not exists (
         select 1
           from information_schema.table_constraints tc
           join information_schema.key_column_usage kcu
             on kcu.constraint_name = tc.constraint_name
            and kcu.table_schema = tc.table_schema
          where tc.table_schema = 'public'
            and tc.table_name = c.table_name
            and tc.constraint_type = 'FOREIGN KEY'
            and kcu.column_name = 'org_id')
  loop
    begin
      execute format(
        'alter table public.%I add constraint %I foreign key (org_id) '
        'references public.organizations(id) on delete cascade',
        r.table_name, r.table_name || '_org_id_fkey');
    exception when others then
      -- Uma tabela com org_id órfão (de antes do multi-tenant) não pode ganhar
      -- a FK. Avisa e segue: o resto do guião tem de ficar instalado na mesma.
      raise notice 'org_id sem FK em %: % (resolver à mão)', r.table_name, sqlerrm;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Eliminar um clube
-- ---------------------------------------------------------------------
-- Apaga a organização; o ON DELETE CASCADE leva atrás atletas, equipas,
-- eventos, presenças, quotas, dados clínicos e físicos, exercícios, cenários,
-- resultados, notificações, convites e definições desse clube.
--
-- p_delete_users decide o que acontece a QUEM lá trabalhava, e são dois casos
-- diferentes: um clube de demonstração que nunca arrancou não deixa contas
-- úteis (true, o normal); um clube que fechou mas cujo coordenador vai abrir
-- outro deve manter a conta (false — `profiles.org_id` fica nulo por causa do
-- ON DELETE SET NULL, ou seja, a pessoa volta ao onboarding e pode criar clube).
--
-- Nunca apaga a própria conta de quem chama nem a de outro admin da
-- plataforma: eliminar um clube não pode ser forma de perder o acesso ao
-- painel.
create or replace function public.admin_delete_org(
  p_org uuid,
  p_delete_users boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     organizations%rowtype;
  v_members uuid[];
  v_details jsonb;
  v_users   int := 0;
begin
  if not is_platform_admin() then
    raise exception 'Sem permissão.';
  end if;

  select * into v_org from organizations where id = p_org;
  if not found then
    raise exception 'Clube não encontrado.';
  end if;

  -- Salvaguarda: o admin não elimina o clube onde ele próprio trabalha. É o
  -- único engano desta lista que o deixa sem app E sem forma de a repor.
  if p_org = current_org_id() then
    raise exception 'Não podes eliminar o clube a que a tua conta pertence.';
  end if;

  -- O que vai cair junto — guardado ANTES do delete, senão já não há o que contar.
  v_details := jsonb_build_object(
    'plan',    v_org.plan,
    'status',  v_org.status,
    'created_at', v_org.created_at,
    'users',   (select count(*) from profiles p  where p.org_id = p_org),
    'players', (select count(*) from players  pl where pl.org_id = p_org),
    'teams',   (select count(*) from teams    t  where t.org_id  = p_org),
    'events',  (select count(*) from events   e  where e.org_id  = p_org)
  );

  -- Membros a eliminar (menos eu e menos outros admins da plataforma).
  select coalesce(array_agg(p.id), '{}')
    into v_members
    from profiles p
   where p.org_id = p_org
     and p.id <> auth.uid()
     and not exists (select 1 from platform_admins pa where pa.user_id = p.id);

  delete from organizations where id = p_org;

  if p_delete_users and array_length(v_members, 1) is not null then
    -- Apagar a conta leva o perfil, as notificações e as subscrições de push
    -- (ON DELETE CASCADE); as fichas de atleta/treinador já caíram com o clube.
    delete from auth.users where id = any(v_members);
    get diagnostics v_users = row_count;
  end if;

  insert into platform_deletions (kind, ref_id, label, details, deleted_by)
  values ('org', p_org, v_org.name,
          v_details || jsonb_build_object('deleted_users', v_users), auth.uid());

  return jsonb_build_object('org', v_org.name, 'deleted_users', v_users, 'details', v_details);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Eliminar uma conta
-- ---------------------------------------------------------------------
-- Para quem se registou, espreitou e nunca mais voltou (fica com o perfil
-- pendente, sem clube), e para contas soltas de clubes já eliminados.
-- Recusa-se a apagar a própria conta e a de outro admin da plataforma.
create or replace function public.admin_delete_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_org   uuid;
begin
  if not is_platform_admin() then
    raise exception 'Sem permissão.';
  end if;
  if p_user = auth.uid() then
    raise exception 'Não podes eliminar a tua própria conta.';
  end if;
  if exists (select 1 from platform_admins where user_id = p_user) then
    raise exception 'Esta conta é administradora da plataforma.';
  end if;

  select u.email into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    raise exception 'Conta não encontrada.';
  end if;
  select p.org_id into v_org from profiles p where p.id = p_user;

  -- O dono da organização é `on delete set null`: o clube fica sem dono, não é
  -- apagado por arrasto. Quem quer apagar o clube usa admin_delete_org.
  delete from auth.users where id = p_user;

  insert into platform_deletions (kind, ref_id, label, details, deleted_by)
  values ('user', p_user, v_email, jsonb_build_object('org_id', v_org), auth.uid());

  return jsonb_build_object('email', v_email);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Listas do painel: dormência
-- ---------------------------------------------------------------------
-- Sem "última atividade" o painel não distingue o clube que trabalha todos os
-- dias do que entrou uma vez em março — e é essa diferença que decide o que se
-- elimina. Vem do último início de sessão dos membros (auth.users).
drop function if exists public.admin_list_orgs();
create or replace function public.admin_list_orgs()
returns table (
  id uuid, name text, plan text, status text, trial_ends_at timestamptz,
  created_at timestamptz, owner_email text, users_count bigint,
  players_count bigint, teams_count bigint, last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.name, o.plan, o.status, o.trial_ends_at, o.created_at,
         u.email as owner_email,
         (select count(*) from profiles p  where p.org_id = o.id) as users_count,
         (select count(*) from players  pl where pl.org_id = o.id) as players_count,
         (select count(*) from teams    t  where t.org_id  = o.id) as teams_count,
         (select max(au.last_sign_in_at)
            from profiles p join auth.users au on au.id = p.id
           where p.org_id = o.id) as last_activity
  from organizations o
  left join auth.users u on u.id = o.owner_id
  where is_platform_admin()
  order by o.created_at desc;
$$;

-- Contas da plataforma (todas), para o admin ver quem ficou sem clube ou sem
-- voltar. `profiles` não guarda nome — o email é o que identifica a pessoa.
create or replace function public.admin_list_accounts()
returns table (
  id uuid, email text, created_at timestamptz, last_sign_in_at timestamptz,
  role text, org_id uuid, org_name text, is_owner boolean, is_admin boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.created_at, u.last_sign_in_at,
         p.role, p.org_id, o.name as org_name,
         (o.owner_id = u.id) as is_owner,
         exists (select 1 from platform_admins pa where pa.user_id = u.id) as is_admin
  from auth.users u
  left join profiles p      on p.id = u.id
  left join organizations o on o.id = p.org_id
  where is_platform_admin()
  order by u.created_at desc;
$$;
