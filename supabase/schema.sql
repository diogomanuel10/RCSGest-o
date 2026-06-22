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
                 check (status in ('observado','contactado','negociacao','confirmado','inscrito','dispensado')),
  notes          text,
  created_at     timestamptz default now()
);
-- Atualiza a constraint em bases já existentes (inclui 'dispensado' — "não fica").
alter table prospects drop constraint if exists prospects_status_check;
alter table prospects add constraint prospects_status_check
  check (status in ('observado','contactado','negociacao','confirmado','inscrito','dispensado'));

-- ---------------------------------------------------------------------
-- Arquivo (soft-delete): nada é apagado, fica inativo para manter histórico
-- ---------------------------------------------------------------------
-- As entidades principais (e os eventos) ganham uma marca de arquivo
-- (archived_at). Quando preenchida, o registo está "arquivado" (inativo): a
-- aplicação esconde-o dos ecrãs normais mas mantém-no na base de dados. Só o
-- coordenador pode arquivar ou repor (ver guard_archive + área "Arquivados").
alter table teams     add column if not exists archived_at timestamptz;
alter table players   add column if not exists archived_at timestamptz;
alter table coaches   add column if not exists archived_at timestamptz;
alter table sponsors  add column if not exists archived_at timestamptz;
alter table events    add column if not exists archived_at timestamptz;
alter table prospects add column if not exists archived_at timestamptz;

create index if not exists idx_teams_archived     on teams     (archived_at);
create index if not exists idx_players_archived    on players    (archived_at);
create index if not exists idx_coaches_archived    on coaches    (archived_at);
create index if not exists idx_sponsors_archived   on sponsors   (archived_at);
create index if not exists idx_events_archived     on events     (archived_at);
create index if not exists idx_prospects_archived  on prospects  (archived_at);

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
             check (role in ('coordenador','treinador','leitura','atleta','fisioterapeuta','preparador')),
  created_at timestamptz default now()
);

-- Acrescenta os papéis 'atleta', 'fisioterapeuta' e 'preparador' (preparador
-- físico) à restrição para tabelas profiles já criadas.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('coordenador','treinador','leitura','atleta','fisioterapeuta','preparador'));

-- Acessos por secção configuráveis pelo coordenador (treinador/leitura).
-- Lista de chaves de secção que o utilizador pode VER (ex.: ["planteis",
-- "calendario"]). Vazio = sem acesso (à espera de o coordenador configurar).
-- O coordenador vê tudo e o atleta vê só o seu portal, independentemente disto.
alter table profiles add column if not exists permissions jsonb not null default '[]'::jsonb;

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

-- Arquivar/repor é uma DECISÃO: só o coordenador a pode tomar. Para atletas e
-- recrutamentos o treinador tem escrita (edita/cria), por isso não basta o RLS
-- da tabela — este trigger bloqueia qualquer alteração de archived_at feita por
-- quem não é coordenador (impede arquivar e repor).
create or replace function public.guard_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.archived_at is distinct from old.archived_at)
     and coalesce(app_role(), '') <> 'coordenador' then
    raise exception 'Apenas o coordenador pode arquivar ou repor registos.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_archive_players   on players;
drop trigger if exists guard_archive_prospects on prospects;
create trigger guard_archive_players  before update on players
  for each row execute function public.guard_archive();
create trigger guard_archive_prospects before update on prospects
  for each row execute function public.guard_archive();

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

-- Equipas: coordenador, leitura, fisioterapeuta e preparador físico veem
-- todas; treinador as suas; atleta a sua.
create policy "read_all" on teams for select to authenticated using (
  app_role() in ('coordenador', 'leitura', 'fisioterapeuta', 'preparador')
  OR id in (select trainer_team_ids())
  OR id = athlete_team_id()
);

-- Atletas: coordenador, leitura, fisioterapeuta e preparador físico todos (o
-- departamento médico e a preparação física precisam da lista completa);
-- treinador os das suas equipas; atleta só o seu próprio registo.
create policy "read_all" on players for select to authenticated using (
  app_role() in ('coordenador', 'leitura', 'fisioterapeuta', 'preparador')
  OR team_id in (select trainer_team_ids())
  OR id = athlete_player_id()
);

-- Eventos: coordenador, leitura, fisioterapeuta e preparador físico todos (o
-- preparador vê o calendário/mapa de jogos para a periodização); treinador e
-- atleta os da(s) sua(s) equipa(s); eventos sem equipa (clube) visíveis a todos.
create policy "read_all" on events for select to authenticated using (
  app_role() in ('coordenador', 'leitura', 'fisioterapeuta', 'preparador')
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

-- EVENTOS: só o coordenador cria/edita/apaga eventos (treinos e jogos). O
-- treinador continua a ver o calendário e a marcar presenças (ver attendances).
create policy "write_editor" on events for all to authenticated
  using (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');

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

-- =====================================================================
-- Departamento Médico / Fisioterapia
-- =====================================================================
-- Processo clínico digital do atleta. Cada atleta pode ter vários episódios
-- clínicos (ex.: lesões); cada episódio reúne avaliação, diagnóstico, plano,
-- evolução, restrições, previsão de retorno e alta, e contém as sessões
-- realizadas. Os atendimentos (avaliações/tratamentos/reavaliações) são
-- marcados numa agenda própria do departamento, cruzada com os treinos.
--
-- Confidencialidade: estes dados são reservados ao departamento médico. O RLS
-- só dá leitura e escrita ao coordenador e ao fisioterapeuta.

-- Episódio clínico (ex.: uma lesão e todo o seu percurso de recuperação).
create table if not exists clinical_episodes (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references players(id) on delete cascade,
  title               text not null,             -- ex.: "Entorse tornozelo direito"
  body_area           text,                       -- zona do corpo
  status              text not null default 'ativo'
                      check (status in ('ativo','recuperacao','alta')),
  injury_date         date,                       -- data da lesão / início
  initial_assessment  text,                       -- avaliação inicial
  functional_diagnosis text,                      -- diagnóstico funcional
  treatment_plan      text,                       -- plano de tratamento
  evolution           text,                       -- evolução (notas gerais)
  restrictions        text,                       -- restrições ao treino/jogo
  expected_return     date,                       -- previsão de retorno
  discharge_date      date,                       -- data de alta
  created_at          timestamptz default now()
);

-- Sessão realizada dentro de um episódio (registo do que foi feito).
create table if not exists clinical_sessions (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references clinical_episodes(id) on delete cascade,
  date        date not null,
  notes       text,
  created_at  timestamptz default now()
);

-- Atendimento de fisioterapia (agenda do departamento médico).
create table if not exists physio_appointments (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references players(id) on delete cascade,
  episode_id  uuid references clinical_episodes(id) on delete set null,
  type        text not null default 'tratamento'
              check (type in ('avaliacao','tratamento','reavaliacao')),
  date        date not null,
  time        text,
  end_time    text,
  location    text,
  status      text not null default 'agendado'
              check (status in ('agendado','realizado','faltou','cancelado')),
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists idx_episodes_player    on clinical_episodes   (player_id);
create index if not exists idx_episodes_status     on clinical_episodes   (status);
create index if not exists idx_sessions_episode    on clinical_sessions   (episode_id);
create index if not exists idx_appointments_player on physio_appointments (player_id);
create index if not exists idx_appointments_date   on physio_appointments (date);

alter table clinical_episodes   enable row level security;
alter table clinical_sessions   enable row level security;
alter table physio_appointments enable row level security;

drop policy if exists "med_rw" on clinical_episodes;
drop policy if exists "med_rw" on clinical_sessions;
drop policy if exists "med_rw" on physio_appointments;

-- Reservado ao departamento médico: ler e escrever só coordenador e
-- fisioterapeuta.
create policy "med_rw" on clinical_episodes for all to authenticated
  using (app_role() in ('coordenador','fisioterapeuta'))
  with check (app_role() in ('coordenador','fisioterapeuta'));
create policy "med_rw" on clinical_sessions for all to authenticated
  using (app_role() in ('coordenador','fisioterapeuta'))
  with check (app_role() in ('coordenador','fisioterapeuta'));
create policy "med_rw" on physio_appointments for all to authenticated
  using (app_role() in ('coordenador','fisioterapeuta'))
  with check (app_role() in ('coordenador','fisioterapeuta'));

-- =====================================================================
-- Preparação Física
-- =====================================================================
-- Perfil físico do atleta, história clínica resumida, avaliações físicas
-- (antropometria + testes) e periodização (macrociclo -> mesociclos ->
-- treinos -> exercícios), além do controlo de treino e minutos de jogo.

-- Perfil físico (1 linha por atleta): altura, peso e mão dominante.
create table if not exists physical_profiles (
  player_id     uuid primary key references players(id) on delete cascade,
  height_cm     numeric(5,1),
  weight_kg     numeric(5,1),
  dominant_hand text check (dominant_hand in ('direita','esquerda','ambidestra')),
  updated_at    timestamptz default now()
);

-- História clínica resumida (1 linha por atleta). Sensível: editada pela fisio
-- e pelo coordenador; o preparador físico tem leitura (limitações ao treino).
create table if not exists medical_history (
  player_id          uuid primary key references players(id) on delete cascade,
  past_injuries      text,   -- lesões (resumo)
  surgeries          text,   -- cirurgias
  chronic_diseases   text,   -- doenças crónicas
  medication         text,   -- medicação
  limitations        text,   -- limitações médicas / ao treino
  updated_at         timestamptz default now()
);

-- Avaliações físicas / testes (antropometria e performance), por atleta e data.
create table if not exists physical_tests (
  id         uuid primary key default gen_random_uuid(),
  player_id  uuid not null references players(id) on delete cascade,
  date       date not null,
  type       text not null,          -- chave do teste (ver constants.js)
  label      text,                    -- etiqueta livre quando type = 'outro'
  value      numeric(8,2),
  unit       text,
  notes      text,
  created_at timestamptz default now()
);

-- Macrociclo: fases da época, configuráveis pelo clube (Pré-época, fases,
-- paragens, off-season). team_id nulo = aplica-se ao clube.
create table if not exists training_phases (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references teams(id) on delete cascade,
  name       text not null,
  type       text not null default 'fase'
             check (type in ('pre_epoca','competitiva','transicao','paragem','off_season','fase','outro')),
  start_date date,
  end_date   date,
  notes      text,
  created_at timestamptz default now()
);

-- Mesociclos (tipicamente mensais), com objetivo dominante.
create table if not exists mesocycles (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references teams(id) on delete cascade,
  name       text not null,
  objective  text,                    -- chave do objetivo (ver constants.js)
  start_date date,
  end_date   date,
  notes      text,
  created_at timestamptz default now()
);

-- Treinos (sessões de preparação física), dentro de um mesociclo / equipa.
create table if not exists gym_sessions (
  id           uuid primary key default gen_random_uuid(),
  mesocycle_id uuid references mesocycles(id) on delete set null,
  team_id      uuid references teams(id) on delete cascade,
  date         date not null,
  title        text,
  objective    text,                  -- chave do objetivo
  duration_min integer,               -- duração prevista (min)
  notes        text,
  created_at   timestamptz default now()
);

-- Exercícios de um treino (séries, carga, repetições, observações).
create table if not exists gym_exercises (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references gym_sessions(id) on delete cascade,
  name       text not null,
  sets       text,    -- séries (texto livre: "4")
  load       text,    -- carga ("70 kg", "70% 1RM")
  reps       text,    -- repetições ("8-10")
  notes      text,    -- OBS
  position   integer not null default 0,
  created_at timestamptz default now()
);

-- Presenças nos treinos de preparação física (controlo por atleta).
create table if not exists gym_attendance (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references gym_sessions(id) on delete cascade,
  player_id  uuid not null references players(id)      on delete cascade,
  present    boolean not null default true,
  minutes    integer,
  notes      text,
  created_at timestamptz default now(),
  unique (session_id, player_id)
);

-- Minutos de jogo por atleta e por jogo (evento). Para o controlo do
-- preparador físico (carga competitiva).
create table if not exists game_minutes (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id)  on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  minutes    integer not null default 0,
  created_at timestamptz default now(),
  unique (event_id, player_id)
);

create index if not exists idx_phys_tests_player on physical_tests (player_id);
create index if not exists idx_phys_tests_date   on physical_tests (date);
create index if not exists idx_phases_team       on training_phases (team_id);
create index if not exists idx_meso_team         on mesocycles      (team_id);
create index if not exists idx_gym_sessions_meso on gym_sessions    (mesocycle_id);
create index if not exists idx_gym_sessions_team on gym_sessions    (team_id);
create index if not exists idx_gym_exercises_sess on gym_exercises  (session_id);
create index if not exists idx_gym_attend_session on gym_attendance (session_id);
create index if not exists idx_gym_attend_player  on gym_attendance (player_id);
create index if not exists idx_game_minutes_player on game_minutes  (player_id);

alter table physical_profiles enable row level security;
alter table medical_history   enable row level security;
alter table physical_tests    enable row level security;
alter table training_phases   enable row level security;
alter table mesocycles        enable row level security;
alter table gym_sessions      enable row level security;
alter table gym_exercises     enable row level security;
alter table gym_attendance    enable row level security;
alter table game_minutes      enable row level security;

drop policy if exists "phys_read"  on physical_profiles;
drop policy if exists "phys_write" on physical_profiles;
drop policy if exists "mh_read"    on medical_history;
drop policy if exists "mh_write"   on medical_history;
drop policy if exists "phys_read"  on physical_tests;
drop policy if exists "phys_write" on physical_tests;
drop policy if exists "prep_read"  on training_phases;
drop policy if exists "prep_write" on training_phases;
drop policy if exists "prep_read"  on mesocycles;
drop policy if exists "prep_write" on mesocycles;
drop policy if exists "prep_read"  on gym_sessions;
drop policy if exists "prep_write" on gym_sessions;
drop policy if exists "prep_read"  on gym_exercises;
drop policy if exists "prep_write" on gym_exercises;
drop policy if exists "prep_rw"    on gym_attendance;
drop policy if exists "prep_rw"    on game_minutes;

-- Perfil físico: visível à equipa técnica (não ao atleta); escrita coordenador
-- e preparador físico.
create policy "phys_read" on physical_profiles for select to authenticated
  using (app_role() <> 'atleta');
create policy "phys_write" on physical_profiles for all to authenticated
  using (app_role() in ('coordenador','preparador'))
  with check (app_role() in ('coordenador','preparador'));

-- História clínica: leitura ao coordenador, fisioterapeuta e preparador
-- (este só consulta); escrita só coordenador e fisioterapeuta.
create policy "mh_read" on medical_history for select to authenticated
  using (app_role() in ('coordenador','fisioterapeuta','preparador'));
create policy "mh_write" on medical_history for all to authenticated
  using (app_role() in ('coordenador','fisioterapeuta'))
  with check (app_role() in ('coordenador','fisioterapeuta'));

-- Avaliações físicas: leitura de toda a equipa técnica (não do atleta) — o
-- treinador vê a última avaliação no perfil do atleta; escrita (criar/alterar/
-- remover) só do coordenador e preparador.
create policy "phys_read" on physical_tests for select to authenticated
  using (app_role() <> 'atleta');
create policy "phys_write" on physical_tests for all to authenticated
  using (app_role() in ('coordenador','preparador'))
  with check (app_role() in ('coordenador','preparador'));

-- Disponibilidade do atleta: resumo partilhável (estado + limitações ao
-- treino + previsão de retorno) que a fisio/coordenador mantêm e que a equipa
-- técnica (incl. treinador) pode consultar no perfil do atleta. Não expõe o
-- detalhe clínico (diagnósticos, sessões, história), que continua reservado.
create table if not exists athlete_availability (
  player_id       uuid primary key references players(id) on delete cascade,
  status          text not null default 'apto'
                  check (status in ('apto','limitado','recuperacao','indisponivel')),
  limitations     text,
  expected_return date,
  updated_at      timestamptz default now()
);
alter table athlete_availability enable row level security;
drop policy if exists "avail_read"  on athlete_availability;
drop policy if exists "avail_write" on athlete_availability;
create policy "avail_read" on athlete_availability for select to authenticated
  using (app_role() <> 'atleta');
create policy "avail_write" on athlete_availability for all to authenticated
  using (app_role() in ('coordenador','fisioterapeuta'))
  with check (app_role() in ('coordenador','fisioterapeuta'));

-- Periodização (fases, mesociclos, treinos, exercícios): leitura à equipa
-- técnica (não ao atleta); escrita coordenador e preparador físico.
do $$
declare t text;
begin
  foreach t in array array['training_phases','mesocycles','gym_sessions','gym_exercises']
  loop
    execute format('create policy "prep_read" on %I for select to authenticated using (app_role() <> ''atleta'')', t);
    execute format('create policy "prep_write" on %I for all to authenticated using (app_role() in (''coordenador'',''preparador'')) with check (app_role() in (''coordenador'',''preparador''))', t);
  end loop;
end $$;

-- Controlo (presenças no ginásio e minutos de jogo): leitura/escrita do
-- coordenador e preparador físico.
create policy "prep_rw" on gym_attendance for all to authenticated
  using (app_role() in ('coordenador','preparador'))
  with check (app_role() in ('coordenador','preparador'));
create policy "prep_rw" on game_minutes for all to authenticated
  using (app_role() in ('coordenador','preparador'))
  with check (app_role() in ('coordenador','preparador'));

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

-- =====================================================================
-- Planos de treino e avaliações pós treino
-- =====================================================================
-- O plano de treino está associado 1:1 a um evento de tipo 'treino'.
-- Contém o objetivo, notas gerais e uma lista ordenada de tarefas/blocos.
-- A avaliação pós treino (também 1:1 com o evento) guarda a nota global
-- do treinador e, opcionalmente, avaliações individuais por atleta.

-- Plano de treino (1:1 com um evento treino).
create table if not exists training_plans (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  objective  text,
  notes      text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint training_plans_event_id_key unique (event_id)
);

-- Tarefas/blocos de trabalho de um plano de treino.
create table if not exists training_plan_items (
  id           uuid primary key default gen_random_uuid(),
  plan_id      uuid not null references training_plans(id) on delete cascade,
  position     integer not null default 0,
  category     text not null default 'outro'
               check (category in ('aquecimento','tecnica','tatica','fisico','retorno','outro')),
  name         text not null,
  duration_min integer,
  description  text,
  created_at   timestamptz default now()
);

-- Avaliação geral pós treino (1:1 com o evento).
create table if not exists training_evaluations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  overall_rating integer check (overall_rating between 1 and 5),
  notes          text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  constraint training_evaluations_event_id_key unique (event_id)
);

-- Avaliação individual por atleta (dentro de uma avaliação de treino).
create table if not exists training_player_evals (
  id            uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references training_evaluations(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  effort_rating integer check (effort_rating between 1 and 5),
  notes         text,
  constraint training_player_evals_uq unique (evaluation_id, player_id)
);

create index if not exists idx_training_plans_event   on training_plans        (event_id);
create index if not exists idx_training_items_plan    on training_plan_items   (plan_id);
create index if not exists idx_training_evals_event   on training_evaluations  (event_id);
create index if not exists idx_training_pevals_eval   on training_player_evals (evaluation_id);
create index if not exists idx_training_pevals_player on training_player_evals (player_id);

alter table training_plans        enable row level security;
alter table training_plan_items   enable row level security;
alter table training_evaluations  enable row level security;
alter table training_player_evals enable row level security;

drop policy if exists "tp_read"   on training_plans;
drop policy if exists "tp_write"  on training_plans;
drop policy if exists "tpi_read"  on training_plan_items;
drop policy if exists "tpi_write" on training_plan_items;
drop policy if exists "te_read"   on training_evaluations;
drop policy if exists "te_write"  on training_evaluations;
drop policy if exists "tpe_read"  on training_player_evals;
drop policy if exists "tpe_write" on training_player_evals;

-- LEITURA: todos exceto atleta.
create policy "tp_read" on training_plans for select to authenticated
  using (app_role() <> 'atleta');
create policy "tpi_read" on training_plan_items for select to authenticated
  using (app_role() <> 'atleta');
create policy "te_read" on training_evaluations for select to authenticated
  using (app_role() <> 'atleta');
create policy "tpe_read" on training_player_evals for select to authenticated
  using (app_role() <> 'atleta');

-- ESCRITA: coordenador (todos os treinos) ou treinador (treinos das suas equipas).
create policy "tp_write" on training_plans for all to authenticated
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

create policy "tpi_write" on training_plan_items for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND plan_id in (
      select tp.id from training_plans tp
      join events e on e.id = tp.event_id
      where e.team_id in (select trainer_team_ids())
    ))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND plan_id in (
      select tp.id from training_plans tp
      join events e on e.id = tp.event_id
      where e.team_id in (select trainer_team_ids())
    ))
  );

create policy "te_write" on training_evaluations for all to authenticated
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

-- Avaliação por atleta: escrita para coordenador e treinador (o RLS das
-- training_evaluations já garante que o treinador só avalia os seus treinos).
create policy "tpe_write" on training_player_evals for all to authenticated
  using (app_role() in ('coordenador','treinador'))
  with check (app_role() in ('coordenador','treinador'));

-- Colunas adicionadas à reformulação dos planos de treino (idempotent).
alter table training_plans
  add column if not exists material text;

alter table training_plan_items
  add column if not exists organization text,
  add column if not exists objective     text,
  add column if not exists reps          text;

-- Atualiza a constraint de categoria: substitui 'fisico' por 'situacao'.
alter table training_plan_items
  drop constraint if exists training_plan_items_category_check;
alter table training_plan_items
  add constraint training_plan_items_category_check
  check (category in ('aquecimento','tecnica','tatica','situacao','retorno','outro'));

-- =====================================================================
-- Tamanhos de equipamento por atleta
-- =====================================================================
-- Uma linha por atleta com os tamanhos de cada artigo de equipamento.
-- Só o coordenador edita; a equipa técnica pode consultar.

create table if not exists player_sizes (
  player_id       uuid primary key references players(id) on delete cascade,
  camisola        text,   -- principal: XS/S/M/L/XL/XXL
  camisola_alt    text,   -- alternativa: XS/S/M/L/XL/XXL
  calcoes         text,   -- XS/S/M/L/XL/XXL
  meias           text,   -- numérico (ex.: 35-38)
  casaco_treino   text,   -- XS/S/M/L/XL/XXL
  calca_treino    text,   -- XS/S/M/L/XL/XXL
  mochila         text,   -- XS/S/M/L/XL/XXL ou "Única"
  blusao          text,   -- XS/S/M/L/XL/XXL
  camisola_treino text,   -- XS/S/M/L/XL/XXL
  notes           text,
  updated_at      timestamptz default now()
);

create index if not exists idx_player_sizes_player on player_sizes (player_id);
alter table player_sizes enable row level security;

drop policy if exists "sizes_read"  on player_sizes;
drop policy if exists "sizes_write" on player_sizes;

-- Leitura: toda a equipa técnica (não ao atleta, que não precisa de ver isto).
create policy "sizes_read" on player_sizes for select to authenticated
  using (app_role() <> 'atleta');

-- Escrita: só o coordenador.
create policy "sizes_write" on player_sizes for all to authenticated
  using (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');
-- =====================================================================
-- Lista de atletas convocados para um jogo. A convocatória está ligada
-- 1:1 a um evento do tipo 'jogo'. Cada atleta pode estar convocado,
-- ser titular ou suplente.

create table if not exists squads (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references events(id) on delete cascade,
  notes      text,
  created_at timestamptz default now(),
  unique (event_id)
);

create table if not exists squad_players (
  id         uuid primary key default gen_random_uuid(),
  squad_id   uuid not null references squads(id)   on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  status     text not null default 'convocado'
             check (status in ('convocado','titular','suplente')),
  created_at timestamptz default now(),
  unique (squad_id, player_id)
);

create index if not exists idx_squads_event         on squads        (event_id);
create index if not exists idx_squad_players_squad  on squad_players (squad_id);
create index if not exists idx_squad_players_player on squad_players (player_id);

alter table squads        enable row level security;
alter table squad_players enable row level security;

drop policy if exists "squads_read"  on squads;
drop policy if exists "squads_write" on squads;
drop policy if exists "sp_read"      on squad_players;
drop policy if exists "sp_write"     on squad_players;

-- Leitura: todos exceto atleta (o atleta vê via squad_players abaixo).
create policy "squads_read" on squads for select to authenticated
  using (
    app_role() <> 'atleta'
    OR event_id in (select id from events where team_id = athlete_team_id())
  );

-- Leitura dos atletas da convocatória: equipa técnica vê tudo; atleta só
-- verifica se está convocado (para o seu portal pessoal).
create policy "sp_read" on squad_players for select to authenticated
  using (
    app_role() <> 'atleta'
    OR player_id = athlete_player_id()
  );

-- Escrita: coordenador (todos os jogos) ou treinador (jogos das suas equipas).
create policy "squads_write" on squads for all to authenticated
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

create policy "sp_write" on squad_players for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND squad_id in (
      select s.id from squads s
      join events e on e.id = s.event_id
      where e.team_id in (select trainer_team_ids())
    ))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND squad_id in (
      select s.id from squads s
      join events e on e.id = s.event_id
      where e.team_id in (select trainer_team_ids())
    ))
  );

-- =====================================================================
-- Gestão Financeira
-- =====================================================================
-- Registo de receitas e despesas do clube (além dos patrocínios).
-- Só o coordenador cria/edita; o papel 'leitura' pode consultar.

create table if not exists financial_entries (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('receita','despesa')),
  category    text not null,
  description text not null,
  amount      numeric(10,2) not null default 0,
  date        date not null,
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists idx_fin_entries_date on financial_entries (date);
create index if not exists idx_fin_entries_type on financial_entries (type);

alter table financial_entries enable row level security;

drop policy if exists "fin_read"  on financial_entries;
drop policy if exists "fin_write" on financial_entries;

-- Leitura: todos exceto atleta.
create policy "fin_read" on financial_entries for select to authenticated
  using (app_role() <> 'atleta');

-- Escrita: só coordenador.
create policy "fin_write" on financial_entries for all to authenticated
  using (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');
