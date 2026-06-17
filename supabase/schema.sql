-- =====================================================================
-- Central RCS — Esquema da base de dados (Supabase / PostgreSQL)
-- =====================================================================
-- Como usar:
--   1. Abre o teu projeto Supabase -> SQL Editor -> New query.
--   2. Cola TODO este ficheiro e carrega em "Run".
--   3. Confirma que não há erros (podes correr de novo sem problema:
--      usa "if not exists" / "on conflict" onde faz sentido).
--
-- Modelo de acesso: clube único, dados partilhados. Qualquer utilizador
-- autenticado vê e edita os mesmos dados. O Row Level Security (RLS) garante
-- que utilizadores ANÓNIMOS (sem login) não acedem a nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

-- Definições globais (uma única linha, id = 1).
create table if not exists settings (
  id     int primary key default 1 check (id = 1),
  season text    not null default '2026/2027',
  goal   integer not null default 15000
);

-- Escalões configuráveis (lista ordenada). Guardados como JSON na linha única
-- de definições. Adicionado por ALTER para quem já tinha a tabela criada.
alter table settings add column if not exists escaloes jsonb not null default
  '["Minis","Infantis","Iniciados","Juvenis","Juniores","Seniores"]'::jsonb;

-- Treinadores.
create table if not exists coaches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       text,
  contact    text,
  notes      text,
  created_at timestamptz default now()
);

-- Equipas (plantéis). Género 'M' ou 'F'.
create table if not exists teams (
  id         uuid primary key default gen_random_uuid(),
  escalao    text not null,
  gender     text not null check (gender in ('M','F')),
  coach_id   uuid references coaches(id) on delete set null,
  created_at timestamptz default now()
);

-- Atletas. Pertencem a uma equipa; se a equipa for apagada, os atletas vão com ela.
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id) on delete cascade,
  name       text not null,
  number     text,
  birth_year text,
  position   text,
  created_at timestamptz default now()
);

-- Patrocínios. tier: '' (sem nível), 'ouro', 'prata' ou 'bronze'.
-- Nota: a regra "nível obrigatório quando confirmado" é validada na aplicação.
create table if not exists sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text,
  tier       text default '',
  contact    text,
  status     text not null default 'acontactar',
  notes      text,
  created_at timestamptz default now()
);

-- Eventos do calendário. type: 'jogo' | 'treino' | 'evento'.
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  title      text,
  date       date not null,
  time       text,
  team_id    uuid references teams(id) on delete set null,
  opponent   text,
  location   text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Índices úteis (consultas por equipa e ordenação por data)
-- ---------------------------------------------------------------------
create index if not exists idx_players_team  on players (team_id);
create index if not exists idx_events_date   on events  (date);
create index if not exists idx_events_team   on events  (team_id);
create index if not exists idx_teams_coach   on teams   (coach_id);

-- ---------------------------------------------------------------------
-- Perfis e papéis (permissões)
-- ---------------------------------------------------------------------
-- Cada utilizador tem um perfil com um papel:
--   'coordenador' -> faz tudo (inclui gerir utilizadores e definições)
--   'treinador'   -> edita Plantéis e Calendário; vê o resto
--   'leitura'     -> só vê
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  role       text not null default 'leitura'
             check (role in ('coordenador','treinador','leitura')),
  created_at timestamptz default now()
);

-- Devolve o papel do utilizador atual. SECURITY DEFINER para poder ser usado
-- dentro das políticas sem entrar em recursão de RLS.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- Cria automaticamente um perfil (papel 'leitura') quando alguém se regista.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Row Level Security (RLS)
-- ---------------------------------------------------------------------
alter table profiles enable row level security;
alter table settings enable row level security;
alter table coaches  enable row level security;
alter table teams    enable row level security;
alter table players  enable row level security;
alter table sponsors enable row level security;
alter table events   enable row level security;

-- Limpa políticas anteriores para o script poder correr mais do que uma vez.
drop policy if exists "auth_all"        on settings;
drop policy if exists "auth_all"        on coaches;
drop policy if exists "auth_all"        on teams;
drop policy if exists "auth_all"        on players;
drop policy if exists "auth_all"        on sponsors;
drop policy if exists "auth_all"        on events;
drop policy if exists "read_all"        on settings;
drop policy if exists "write_coord"     on settings;
drop policy if exists "read_all"        on coaches;
drop policy if exists "write_coord"     on coaches;
drop policy if exists "read_all"        on sponsors;
drop policy if exists "write_coord"     on sponsors;
drop policy if exists "read_all"        on teams;
drop policy if exists "write_editor"    on teams;
drop policy if exists "read_all"        on players;
drop policy if exists "write_editor"    on players;
drop policy if exists "read_all"        on events;
drop policy if exists "write_editor"    on events;
drop policy if exists "profiles_read"   on profiles;
drop policy if exists "profiles_manage" on profiles;

-- LEITURA: qualquer utilizador autenticado vê os dados do clube.
create policy "read_all" on settings for select to authenticated using (true);
create policy "read_all" on coaches  for select to authenticated using (true);
create policy "read_all" on sponsors for select to authenticated using (true);
create policy "read_all" on teams    for select to authenticated using (true);
create policy "read_all" on players  for select to authenticated using (true);
create policy "read_all" on events   for select to authenticated using (true);

-- ESCRITA só coordenador: definições, treinadores e patrocínios.
create policy "write_coord" on settings for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');
create policy "write_coord" on coaches for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');
create policy "write_coord" on sponsors for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');

-- ESCRITA coordenador OU treinador: plantéis e calendário.
create policy "write_editor" on teams for all to authenticated
  using (app_role() in ('coordenador','treinador'))
  with check (app_role() in ('coordenador','treinador'));
create policy "write_editor" on players for all to authenticated
  using (app_role() in ('coordenador','treinador'))
  with check (app_role() in ('coordenador','treinador'));
create policy "write_editor" on events for all to authenticated
  using (app_role() in ('coordenador','treinador'))
  with check (app_role() in ('coordenador','treinador'));

-- PERFIS: cada um vê o seu; o coordenador vê e gere todos.
create policy "profiles_read" on profiles for select to authenticated
  using (id = auth.uid() or app_role() = 'coordenador');
create policy "profiles_manage" on profiles for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');

-- ---------------------------------------------------------------------
-- Dados iniciais
-- ---------------------------------------------------------------------

-- Definições (época + meta). Só insere se ainda não existir.
insert into settings (id, season, goal) values (1, '2026/2027', 15000)
  on conflict (id) do nothing;

-- Lista inicial de empresas a contactar (sem nível atribuído ainda).
-- status: 'email' = email enviado; 'telefone' = contactar por telefone.
-- Só insere se a tabela estiver vazia, para não duplicar em execuções repetidas.
insert into sponsors (name, category, tier, status, notes)
select * from (values
  ('Farmácia Azevedo','Farmácias','','email','Email personalizado enviado.'),
  ('Farmácia Barranha','Farmácias','','email','Email personalizado enviado.'),
  ('Prime Smile','Clínicas dentárias','','email','Email personalizado enviado.'),
  ('Dental Hora','Clínicas dentárias','','email','Email personalizado enviado.'),
  ('Restaurante Singular','Restaurantes/Cafés','','email','Email personalizado enviado.'),
  ('Mousse Coffee Bar','Restaurantes/Cafés','','email','Email personalizado enviado.'),
  ('Tecnifeira','Construção/Imobiliário','','email','Email personalizado enviado.'),
  ('Santos Barbosa','Construção/Imobiliário','','email','Email personalizado enviado.'),
  ('Car Vaz','Stands automóveis','','email','Email personalizado enviado.'),
  ('Café na Hora','Restaurantes/Cafés','','telefone','Sem email público — contactar por telefone.')
) as seed(name, category, tier, status, notes)
where not exists (select 1 from sponsors);

-- ---------------------------------------------------------------------
-- Perfis: backfill e coordenador inicial
-- ---------------------------------------------------------------------
-- Cria perfis (papel 'leitura') para utilizadores que já existam mas ainda
-- não tenham perfil (ex.: contas criadas antes deste esquema).
insert into profiles (id, email, role)
select u.id, u.email, 'leitura'
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- Promove o coordenador inicial. Só tem efeito DEPOIS de esse email se
-- registar (o perfil é criado no registo). Se ainda não existir, não faz nada;
-- basta voltar a correr esta linha após o registo, ou registar primeiro.
update profiles set role = 'coordenador'
where email = 'diomanuel10@gmail.com';
