-- =====================================================================
-- Rumia — Migração para MULTI-TENANT (SaaS)
-- =====================================================================
-- Transforma a Rumia de "clube único partilhado" em plataforma multi-clube:
-- cada clube (organização) tem os seus dados totalmente isolados dos outros.
--
-- Como usar:
--   1. Corre PRIMEIRO o schema.sql (e notifications.sql) como até aqui.
--   2. Depois cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar (idempotente): usa "if not exists", "drop ... if
--      exists" e faz o backfill só onde ainda faltar.
--
-- Estratégia de isolamento (importante):
--   - Cada tabela de dados ganha uma coluna `org_id` (o clube a que pertence),
--     com DEFAULT current_org_id() — os INSERT do cliente auto-atribuem o clube.
--   - Mantêm-se INTACTAS todas as políticas de PAPEL já existentes (permissivas)
--     e ACRESCENTA-SE a cada tabela uma política RESTRICTIVE de isolamento por
--     org. Como as restritivas são combinadas com AND, a lógica de papéis passa
--     a agir SEMPRE dentro do clube, sem reescrever dezenas de políticas.
--   - O RLS é a fonte de verdade: um clube nunca vê linhas de outro.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabelas de plataforma
-- ---------------------------------------------------------------------

-- Organização = clube (tenant). É a raiz do isolamento e o registo que o
-- painel de admin gere (plano, estado, período de demonstração).
create table if not exists organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  owner_id       uuid references auth.users(id) on delete set null,
  -- Plano comercial. Livre para já; o painel de admin escolhe.
  plan           text not null default 'trial',
  -- Estado da subscrição:
  --   'trial'     -> período de demonstração (limitado por trial_ends_at)
  --   'ativa'     -> subscrição paga/ativa
  --   'suspensa'  -> acesso bloqueado (falta de pagamento, decisão do admin)
  --   'cancelada' -> conta encerrada
  status         text not null default 'trial'
                 check (status in ('trial','ativa','suspensa','cancelada')),
  trial_ends_at  timestamptz,
  notes          text,             -- notas internas do admin da plataforma
  created_at     timestamptz not null default now()
);

-- Admins da plataforma (o vendedor). Estão ACIMA do coordenador: gerem
-- organizações e subscrições. Não é um "role" de perfil (esses são por-clube).
-- Gerido por SQL / chave de serviço — nunca escrito pela app cliente.
create table if not exists platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Convites de treinadores/colaboradores para um clube (fluxo por link/código).
-- O coordenador cria um convite; o convidado abre ?invite=<token>, regista-se e
-- o convite liga a sua conta ao clube com o papel definido.
create table if not exists org_invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text,                         -- opcional (só informativo)
  role        text not null default 'leitura',
  permissions jsonb not null default '[]'::jsonb,
  token       text not null unique default encode(gen_random_bytes(16), 'hex'),
  created_by  uuid references auth.users(id) on delete set null,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null,
  expires_at  timestamptz not null default (now() + interval '14 days'),
  created_at  timestamptz not null default now()
);
create index if not exists idx_org_invitations_org   on org_invitations (org_id);
create index if not exists idx_org_invitations_token on org_invitations (token);

-- ---------------------------------------------------------------------
-- 2. Perfil: a que organização pertence cada utilizador
-- ---------------------------------------------------------------------
-- Um utilizador pertence a UM clube. Nulo = ainda não fez onboarding (tem de
-- criar clube ou aceitar um convite antes de usar a app).
alter table profiles add column if not exists org_id uuid references organizations(id) on delete set null;
create index if not exists idx_profiles_org on profiles (org_id);

-- ---------------------------------------------------------------------
-- 3. Funções de apoio (SECURITY DEFINER para uso dentro do RLS)
-- ---------------------------------------------------------------------

-- Organização do utilizador atual (do seu perfil). Base de todo o isolamento.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- O utilizador atual é admin da plataforma (o vendedor)?
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- A organização de um utilizador está ativa (pode usar a app)?
-- 'ativa' sempre; 'trial' enquanto não expirar. Suspensa/cancelada = não.
create or replace function public.org_is_active(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when o.status = 'ativa' then true
      when o.status = 'trial' then (o.trial_ends_at is null or o.trial_ends_at > now())
      else false
    end
    from public.organizations o where o.id = p_org
  ), false);
$$;

-- ---------------------------------------------------------------------
-- 4. Isolamento por org em TODAS as tabelas de dados
-- ---------------------------------------------------------------------
-- Acrescenta org_id (com default current_org_id()), índice e a política
-- RESTRICTIVE de isolamento a cada tabela. Mantém as políticas de papel.
do $$
declare
  t text;
  tables text[] := array[
    'coaches','equipment','teams','players','team_coaches','sponsors','events',
    'attendances','quotas','prospects','clinical_episodes','clinical_sessions',
    'physio_appointments','physical_profiles','medical_history','physical_tests',
    'training_phases','mesocycles','gym_sessions','gym_exercises','gym_attendance',
    'game_minutes','athlete_availability','training_plans','training_plan_items',
    'training_evaluations','training_player_evals','player_documents','player_sizes',
    'squads','squad_players','financial_entries','game_plans','objectives',
    'notifications','push_subscriptions'
  ];
begin
  foreach t in array tables loop
    -- Só age em tabelas que existam (notifications/push podem não estar criadas).
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('alter table public.%I add column if not exists org_id uuid references public.organizations(id) on delete cascade', t);
    execute format('alter table public.%I alter column org_id set default current_org_id()', t);
    execute format('create index if not exists %I on public.%I (org_id)', 'idx_'||t||'_org', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I as restrictive for all to authenticated '
      'using (org_id = current_org_id()) with check (org_id = current_org_id())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Definições (settings): de linha única para uma linha por clube
-- ---------------------------------------------------------------------
-- Deixa de ser id=1 fixo. Cada organização tem a sua linha (época, meta,
-- escalões, marca white-label).
alter table settings drop constraint if exists settings_id_check;
create sequence if not exists settings_id_seq owned by settings.id;
alter table settings alter column id set default nextval('settings_id_seq');
alter table settings add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table settings alter column org_id set default current_org_id();
create unique index if not exists idx_settings_org on settings (org_id);

drop policy if exists tenant_isolation on settings;
create policy tenant_isolation on settings as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 6. Políticas das tabelas de plataforma
-- ---------------------------------------------------------------------
alter table organizations   enable row level security;
alter table platform_admins enable row level security;
alter table org_invitations enable row level security;

drop policy if exists "org_read"   on organizations;
drop policy if exists "org_manage" on organizations;
-- Cada utilizador vê a SUA organização; o admin da plataforma vê todas.
create policy "org_read" on organizations for select to authenticated
  using (id = current_org_id() or is_platform_admin());
-- Só o admin da plataforma altera plano/estado/trial (billing manual).
create policy "org_manage" on organizations for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists "padmin_read" on platform_admins;
-- Um admin vê a lista de admins; mais ninguém. Escrita só por chave de serviço.
create policy "padmin_read" on platform_admins for select to authenticated
  using (is_platform_admin());

drop policy if exists "inv_read"   on org_invitations;
drop policy if exists "inv_manage" on org_invitations;
-- O coordenador do clube vê e gere os convites do seu clube (o resgate é feito
-- por RPC SECURITY DEFINER, por isso o convidado não precisa de ler a tabela).
create policy "inv_read" on org_invitations for select to authenticated
  using ((org_id = current_org_id() and app_role() = 'coordenador') or is_platform_admin());
create policy "inv_manage" on org_invitations for all to authenticated
  using (org_id = current_org_id() and app_role() = 'coordenador')
  with check (org_id = current_org_id() and app_role() = 'coordenador');

-- ---------------------------------------------------------------------
-- 7. Perfis: reescrever para ficarem por-clube
-- ---------------------------------------------------------------------
-- Antes: o coordenador via TODOS os perfis. Agora só os do SEU clube.
drop policy if exists "profiles_read"   on profiles;
drop policy if exists "profiles_manage" on profiles;
create policy "profiles_read" on profiles for select to authenticated
  using (
    id = auth.uid()
    or (app_role() = 'coordenador' and org_id = current_org_id())
    or is_platform_admin()
  );
create policy "profiles_manage" on profiles for all to authenticated
  using (
    (app_role() = 'coordenador' and org_id = current_org_id())
    or is_platform_admin()
  )
  with check (
    (app_role() = 'coordenador' and org_id = current_org_id())
    or is_platform_admin()
  );

-- ---------------------------------------------------------------------
-- 8. Registo de novos utilizadores: começam SEM clube (pendentes)
-- ---------------------------------------------------------------------
-- Cria o perfil (papel 'leitura', org_id nulo). A partir daqui o utilizador
-- ou cria um clube (create_club) ou aceita um convite (redeem_invitation).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'leitura')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. RPCs de onboarding e convites
-- ---------------------------------------------------------------------

-- Cria um clube novo e torna o utilizador atual o seu coordenador. Usado no
-- onboarding de quem se regista sem convite. Arranca em período de demonstração.
create or replace function public.create_club(p_name text, p_trial_days int default 14)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;
  -- Impede criar um segundo clube se já pertences a um.
  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Já pertences a um clube.';
  end if;

  insert into public.organizations (name, owner_id, plan, status, trial_ends_at)
  values (coalesce(nullif(trim(p_name), ''), 'O meu clube'), auth.uid(),
          'trial', 'trial', now() + make_interval(days => greatest(p_trial_days, 0)))
  returning id into v_org;

  update public.profiles
     set org_id = v_org, role = 'coordenador'
   where id = auth.uid();
  if not found then
    insert into public.profiles (id, org_id, role)
    values (auth.uid(), v_org, 'coordenador')
    on conflict (id) do update set org_id = excluded.org_id, role = excluded.role;
  end if;

  -- Linha de definições própria do clube (marca/época por omissão).
  insert into public.settings (org_id) values (v_org)
  on conflict (org_id) do nothing;

  return v_org;
end;
$$;

-- Aceita um convite: liga a conta atual ao clube do convite, com o papel e
-- acessos definidos. Marca o convite como usado.
create or replace function public.redeem_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv org_invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;

  select * into v_inv from public.org_invitations
   where token = p_token
   for update;

  if not found then
    raise exception 'Convite inválido.';
  end if;
  if v_inv.used_at is not null then
    raise exception 'Este convite já foi usado.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Este convite expirou.';
  end if;
  if (select org_id from public.profiles where id = auth.uid()) is not null then
    raise exception 'Já pertences a um clube.';
  end if;

  update public.profiles
     set org_id = v_inv.org_id, role = v_inv.role, permissions = v_inv.permissions
   where id = auth.uid();
  if not found then
    insert into public.profiles (id, org_id, role, permissions)
    values (auth.uid(), v_inv.org_id, v_inv.role, v_inv.permissions)
    on conflict (id) do update
      set org_id = excluded.org_id, role = excluded.role, permissions = excluded.permissions;
  end if;

  update public.org_invitations
     set used_at = now(), used_by = auth.uid()
   where id = v_inv.id;

  return v_inv.org_id;
end;
$$;

-- Cria um convite para o clube do coordenador atual e devolve o token.
create or replace function public.create_invitation(
  p_role text default 'leitura',
  p_permissions jsonb default '[]'::jsonb,
  p_email text default null
)
returns org_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid := current_org_id();
  v_row org_invitations%rowtype;
begin
  if v_org is null or app_role() <> 'coordenador' then
    raise exception 'Apenas o coordenador do clube pode convidar.';
  end if;
  insert into public.org_invitations (org_id, email, role, permissions, created_by)
  values (v_org, p_email, coalesce(p_role, 'leitura'), coalesce(p_permissions, '[]'::jsonb), auth.uid())
  returning * into v_row;
  return v_row;
end;
$$;

-- Lista as organizações com estatísticas, para o painel de admin da plataforma.
create or replace function public.admin_list_orgs()
returns table (
  id uuid, name text, plan text, status text, trial_ends_at timestamptz,
  created_at timestamptz, owner_email text, users_count bigint,
  players_count bigint, teams_count bigint
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
         (select count(*) from teams    t  where t.org_id  = o.id) as teams_count
  from organizations o
  left join auth.users u on u.id = o.owner_id
  where is_platform_admin()
  order by o.created_at desc;
$$;

-- Ações do painel de admin (billing manual): mudar estado/plano, estender trial.
create or replace function public.admin_set_org_status(
  p_org uuid, p_status text, p_plan text default null, p_trial_ends_at timestamptz default null
)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare v_row organizations%rowtype;
begin
  if not is_platform_admin() then
    raise exception 'Sem permissão.';
  end if;
  update organizations
     set status = coalesce(p_status, status),
         plan   = coalesce(p_plan, plan),
         trial_ends_at = coalesce(p_trial_ends_at, trial_ends_at)
   where id = p_org
   returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. Backfill: mover os dados atuais para a primeira organização
-- ---------------------------------------------------------------------
-- Cria a organização inicial (o teu clube atual) se ainda não existir nenhuma,
-- usando o nome de marca das definições. Depois atribui-lhe todos os dados e
-- perfis existentes. Idempotente (só preenche onde org_id está nulo).
do $$
declare
  -- Nome do clube inicial: recebe TODOS os dados atuais (nada se perde).
  v_initial_name constant text := 'Real Clube Senhorense';
  v_org uuid;
  v_owner uuid;
  t text;
  tables text[] := array[
    'coaches','equipment','teams','players','team_coaches','sponsors','events',
    'attendances','quotas','prospects','clinical_episodes','clinical_sessions',
    'physio_appointments','physical_profiles','medical_history','physical_tests',
    'training_phases','mesocycles','gym_sessions','gym_exercises','gym_attendance',
    'game_minutes','athlete_availability','training_plans','training_plan_items',
    'training_evaluations','training_player_evals','player_documents','player_sizes',
    'squads','squad_players','financial_entries','game_plans','objectives',
    'notifications','push_subscriptions'
  ];
begin
  -- Já existe pelo menos uma organização? Então o backfill inicial já correu.
  select id into v_org from organizations order by created_at limit 1;

  if v_org is null then
    -- Dono = coordenador atual (se houver) ou o primeiro utilizador.
    select id into v_owner from profiles where role = 'coordenador' order by created_at limit 1;
    if v_owner is null then
      select id into v_owner from auth.users order by created_at limit 1;
    end if;

    insert into organizations (name, owner_id, plan, status)
    values (v_initial_name, v_owner, 'pro', 'ativa')
    returning id into v_org;
  end if;

  -- Garante o nome do clube inicial mesmo que a migração já tenha corrido antes
  -- (é o clube que detém todos os dados existentes — não se perde nada).
  update organizations set name = v_initial_name where id = v_org;

  -- Perfis sem clube -> clube inicial.
  update profiles set org_id = v_org where org_id is null;

  -- Definições sem clube -> clube inicial.
  update settings set org_id = v_org where org_id is null;
  perform setval('settings_id_seq', greatest((select coalesce(max(id),1) from settings), 1));

  -- Todas as tabelas de dados.
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('update public.%I set org_id = %L where org_id is null', t, v_org);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 11. Admin da plataforma inicial (TU, o vendedor)
-- ---------------------------------------------------------------------
-- Promove a tua conta a admin da plataforma. Ajusta o email se necessário.
insert into platform_admins (user_id)
select id from auth.users where email = 'diomanuel10@gmail.com'
on conflict (user_id) do nothing;
