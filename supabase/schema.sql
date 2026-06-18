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

-- Dados de credenciação do treinador (adicionados por ALTER para tabelas já criadas).
alter table coaches add column if not exists license_number text;
alter table coaches add column if not exists tptd           text;

-- Inventário de equipamentos desportivos.
create table if not exists equipment (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text,
  quantity   integer not null default 1,
  condition  text not null default 'bom'
             check (condition in ('bom','razoavel','mau')),
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

-- Estado de avaliação do atleta para a próxima época (gestão de plantel).
--   'pendente' -> ainda não decidido (omissão)
--   'mantem'   -> continua no plantel
--   'sai'      -> não continua
alter table players add column if not exists review_status text not null default 'pendente'
  check (review_status in ('pendente','mantem','sai'));

-- Dados adicionais do atleta (adicionados por ALTER para tabelas já criadas).
alter table players add column if not exists guardian_contact  text;
alter table players add column if not exists federation_number text;
alter table players add column if not exists notes             text;

-- Treinadores de uma equipa (N-para-N, com papel principal/adjunto).
-- Uma equipa pode ter vários treinadores; cada treinador pode estar em várias
-- equipas. A coluna teams.coach_id mantém-se por compatibilidade (espelha o
-- treinador principal), mas esta tabela é a fonte de verdade.
create table if not exists team_coaches (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references teams(id)   on delete cascade,
  coach_id   uuid not null references coaches(id) on delete cascade,
  role       text not null default 'adjunto'
             check (role in ('principal','adjunto')),
  created_at timestamptz default now(),
  unique (team_id, coach_id)
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

-- Hora de fim do evento (opcional; útil sobretudo para treinos).
alter table events add column if not exists end_time text;

-- Presenças nos treinos.
create table if not exists attendances (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events(id)  on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  status        text not null default 'falta'
                check (status in ('presente','falta','justificado','atraso')),
  justification text,
  minutes_late  integer,
  created_at    timestamptz default now(),
  unique (event_id, player_id)
);

-- Quotas / mensalidades dos atletas.
create table if not exists quotas (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  mes        integer not null check (mes between 1 and 12),
  ano        integer not null,
  valor      numeric(8,2) not null default 0,
  pago       boolean not null default false,
  pago_em    timestamptz,
  notes      text,
  created_at timestamptz default now(),
  unique (player_id, mes, ano)
);

-- Prospetos/recrutamento. Funil de novos atletas antes de entrarem no plantel.
--   observado  -> visto em jogo/treino
--   contactado -> primeiro contacto feito
--   negociacao -> a negociar condições
--   confirmado -> acordo verbal/escrito
--   inscrito   -> convertido em atleta do plantel
create table if not exists prospects (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  birth_year     text,
  position       text,
  contact        text,
  target_team_id uuid references teams(id) on delete set null,
  status         text not null default 'observado'
                 check (status in ('observado','contactado','negociacao','confirmado','inscrito')),
  notes          text,
  created_at     timestamptz default now()
);

-- ---------------------------------------------------------------------
-- Índices úteis (consultas por equipa e ordenação por data)
-- ---------------------------------------------------------------------
create index if not exists idx_players_team     on players     (team_id);
create index if not exists idx_events_date      on events      (date);
create index if not exists idx_events_team      on events      (team_id);
create index if not exists idx_teams_coach      on teams       (coach_id);
create index if not exists idx_attend_event     on attendances  (event_id);
create index if not exists idx_attend_player    on attendances  (player_id);
create index if not exists idx_quotas_player    on quotas       (player_id);
create index if not exists idx_quotas_mes_ano   on quotas       (mes, ano);
create index if not exists idx_team_coaches_team  on team_coaches (team_id);
create index if not exists idx_team_coaches_coach on team_coaches (coach_id);
create index if not exists idx_prospects_status   on prospects    (status);
create index if not exists idx_prospects_team     on prospects    (target_team_id);

-- Ligação entre conta de utilizador e registo de treinador.
-- Permite ao RLS filtrar dados por equipa do treinador autenticado.
alter table coaches add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_coaches_user_id on coaches (user_id);

-- Devolve os IDs das equipas do treinador atual (via coaches.user_id).
-- SECURITY DEFINER para poder ser usada dentro das políticas RLS.
create or replace function public.trainer_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tc.team_id
  from team_coaches tc
  join coaches c on c.id = tc.coach_id
  where c.user_id = auth.uid();
$$;

-- Ligação entre conta de utilizador e registo de atleta (portal do atleta).
-- Permite ao RLS dar a cada atleta acesso só aos seus próprios dados.
alter table players add column if not exists user_id uuid references auth.users(id) on delete set null;
create index if not exists idx_players_user_id on players (user_id);

-- ID do registo de atleta da conta atual (via players.user_id).
create or replace function public.athlete_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.players where user_id = auth.uid() limit 1;
$$;

-- ID da equipa do atleta da conta atual.
create or replace function public.athlete_team_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select team_id from public.players where user_id = auth.uid() limit 1;
$$;

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
             check (role in ('coordenador','treinador','leitura','atleta')),
  created_at timestamptz default now()
);

-- Acrescenta o papel 'atleta' à restrição para tabelas profiles já criadas.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('coordenador','treinador','leitura','atleta'));

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

-- Novas tabelas (seguras para re-executar)
alter table attendances  enable row level security;
alter table quotas       enable row level security;
alter table equipment    enable row level security;
alter table team_coaches enable row level security;
alter table prospects    enable row level security;

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
drop policy if exists "read_all"        on attendances;
drop policy if exists "write_editor"    on attendances;
drop policy if exists "read_all"        on quotas;
drop policy if exists "write_coord"     on quotas;
drop policy if exists "read_all"        on equipment;
drop policy if exists "write_coord"     on equipment;
drop policy if exists "read_all"        on team_coaches;
drop policy if exists "write_editor"    on team_coaches;
drop policy if exists "read_all"        on prospects;
drop policy if exists "write_editor"    on prospects;

-- LEITURA: settings e coaches para todos os autenticados (incl. atleta, que
-- precisa da época e dos nomes da equipa técnica). Patrocínios ficam ocultos
-- ao atleta.
create policy "read_all" on settings for select to authenticated using (true);
create policy "read_all" on coaches  for select to authenticated using (true);
create policy "read_all" on sponsors for select to authenticated using (
  app_role() <> 'atleta'
);

-- Equipas: coordenador e leitura veem todas; treinador as suas; atleta a sua.
create policy "read_all" on teams for select to authenticated using (
  app_role() in ('coordenador', 'leitura')
  OR id in (select trainer_team_ids())
  OR id = athlete_team_id()
);

-- Atletas: coordenador e leitura todos; treinador os das suas equipas;
-- atleta só o seu próprio registo.
create policy "read_all" on players for select to authenticated using (
  app_role() in ('coordenador', 'leitura')
  OR team_id in (select trainer_team_ids())
  OR id = athlete_player_id()
);

-- Eventos: coordenador e leitura todos; treinador e atleta os da(s) sua(s)
-- equipa(s); eventos sem equipa (clube) visíveis a todos.
create policy "read_all" on events for select to authenticated using (
  app_role() in ('coordenador', 'leitura')
  OR team_id is null
  OR team_id in (select trainer_team_ids())
  OR team_id = athlete_team_id()
);

-- ESCRITA só coordenador: definições, treinadores e patrocínios.
create policy "write_coord" on settings for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');
create policy "write_coord" on coaches for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');
create policy "write_coord" on sponsors for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');

-- EQUIPAS: gestão de equipas é só do coordenador (criar/editar/remover).
create policy "write_editor" on teams for all to authenticated
  using (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');

-- ATLETAS: coordenador em todos; treinador só nos das SUAS equipas.
create policy "write_editor" on players for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  );

-- EVENTOS: coordenador em todos; treinador só nos das SUAS equipas.
create policy "write_editor" on events for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  );

-- PRESENÇAS: coordenador/treinador/leitura veem todas; atleta só as suas.
-- Escrever: coordenador, ou treinador nas presenças de eventos das suas equipas.
create policy "read_all" on attendances for select to authenticated using (
  app_role() <> 'atleta' OR player_id = athlete_player_id()
);
create policy "write_editor" on attendances for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  );

-- QUOTAS: coordenador/treinador/leitura veem todas; atleta só as suas.
-- Escrever: só coordenador.
create policy "read_all" on quotas for select to authenticated using (
  app_role() <> 'atleta' OR player_id = athlete_player_id()
);
create policy "write_coord" on quotas for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');

-- EQUIPAMENTOS: ocultos ao atleta; escrever só coordenador.
create policy "read_all" on equipment for select to authenticated using (
  app_role() <> 'atleta'
);
create policy "write_coord" on equipment for all to authenticated
  using (app_role() = 'coordenador') with check (app_role() = 'coordenador');

-- TREINADORES POR EQUIPA: ler todos; atribuir treinadores a equipas é só do
-- coordenador (faz parte da gestão de equipas).
create policy "read_all" on team_coaches for select to authenticated using (true);
create policy "write_editor" on team_coaches for all to authenticated
  using (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');

-- RECRUTAMENTO: oculto ao atleta; escrever coordenador ou treinador.
create policy "read_all" on prospects for select to authenticated using (
  app_role() <> 'atleta'
);
create policy "write_editor" on prospects for all to authenticated
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

-- Migra o treinador único de cada equipa (teams.coach_id) para a nova tabela
-- de ligação, marcando-o como principal. Seguro de re-executar.
insert into team_coaches (team_id, coach_id, role)
select id, coach_id, 'principal' from teams where coach_id is not null
  on conflict (team_id, coach_id) do nothing;

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
