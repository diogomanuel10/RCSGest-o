-- =====================================================================
-- Rumia — Biblioteca de exercícios
-- =====================================================================
-- Correr DEPOIS de schema.sql e multitenant.sql. É seguro re-executar.
--
-- PORQUÊ:
-- Um plano de treino era escrito de raiz de cada vez. O mesmo exercício de
-- side-out que o treinador monta em setembro é reescrito, palavra por palavra,
-- em outubro — e o que ele afinou na terceira repetição (a variante que
-- resultou, a progressão que não resultou) perdia-se no plano dessa semana.
-- A biblioteca guarda o exercício UMA vez e o plano passa a ser uma escolha.
--
-- A biblioteca é DO CLUBE e não de cada treinador. Dois motivos: o exercício
-- que o treinador de séniores afinou serve aos juvenis, e um clube que muda de
-- treinador não perde o trabalho de anos. Quem o escreveu fica em `created_by`
-- para se saber a quem perguntar, mas qualquer treinador o pode editar.
--
-- COPIA-SE PARA O PLANO, não se referencia.
-- Ao adicionar um exercício a um treino, os campos são COPIADOS para
-- `training_plan_items`. O plano de um treino que já aconteceu é um registo
-- histórico: se apontasse para a biblioteca, editar o exercício amanhã
-- reescrevia o que se treinou no mês passado. `exercise_id` fica guardado, mas
-- só para saber quais são os exercícios que se usam mesmo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
-- Os campos espelham os de `training_plan_items` de propósito: é o que torna
-- "puxar da biblioteca" uma cópia direta, sem tradução pelo meio.
--
-- `min_players`/`max_players` existem porque a pergunta real do treinador não
-- é "que exercícios de receção tenho?", é "que exercícios de receção tenho que
-- funcionem com os 9 que apareceram hoje?".
create table if not exists exercises (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text not null default 'outro'
               check (category in ('aquecimento','tecnica','tatica','situacao','fisico','retorno','outro')),
  objective    text,          -- foco técnico/tático (side-out, receção, bloco…)
  organization text,          -- pares, grupos de 3, 6×6, equipa completa…
  reps         text,          -- 3×10, 5 min, 2 séries…
  duration_min integer,
  material     text,
  description  text,          -- desenvolvimento, variantes, progressões
  min_players  integer,
  max_players  integer,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_exercises_category on exercises (category);
create index if not exists idx_exercises_name     on exercises (name);

-- ---------------------------------------------------------------------
-- 2. Ligação ao plano de treino
-- ---------------------------------------------------------------------
-- Nullable e `on delete set null`: um bloco escrito à mão nunca teve origem na
-- biblioteca, e apagar um exercício da biblioteca não pode apagar o registo do
-- treino em que ele foi usado.
alter table training_plan_items
  add column if not exists exercise_id uuid references exercises(id) on delete set null;
create index if not exists idx_training_items_exercise on training_plan_items (exercise_id);

-- Colunas que a app já usa nos blocos do plano, para quem tenha uma base de
-- dados criada antes delas existirem.
alter table training_plan_items add column if not exists organization text;
alter table training_plan_items add column if not exists objective    text;
alter table training_plan_items add column if not exists reps         text;
alter table training_plans      add column if not exists material     text;

-- A app oferece a categoria "Situação de jogo" (PLAN_CATEGORIES em
-- constants.js) mas o CHECK original do schema.sql aceitava 'fisico' e não
-- 'situacao': gravar um bloco de situação de jogo rebentava. Aceitam-se as
-- duas — 'fisico' fica para não invalidar blocos já gravados.
alter table training_plan_items drop constraint if exists training_plan_items_category_check;
alter table training_plan_items add  constraint training_plan_items_category_check
  check (category in ('aquecimento','tecnica','tatica','situacao','fisico','retorno','outro'));

-- ---------------------------------------------------------------------
-- 3. Multi-tenant (org_id + isolamento por clube)
-- ---------------------------------------------------------------------
alter table exercises add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table exercises alter column org_id set default current_org_id();
create index if not exists idx_exercises_org on exercises (org_id);

alter table exercises enable row level security;

drop policy if exists tenant_isolation on exercises;
create policy tenant_isolation on exercises as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 4. Políticas por papel
-- ---------------------------------------------------------------------
drop policy if exists "ex_read"  on exercises;
drop policy if exists "ex_write" on exercises;

-- Leitura: toda a equipa técnica. O atleta não entra — a biblioteca é
-- material de trabalho do treinador, não conteúdo do portal.
create policy "ex_read" on exercises for select to authenticated
  using (app_role() <> 'atleta');

-- Escrita: coordenador e treinador. Sem recorte por equipa, ao contrário dos
-- planos de treino: um exercício não pertence a um escalão.
create policy "ex_write" on exercises for all to authenticated
  using (app_role() in ('coordenador','treinador'))
  with check (app_role() in ('coordenador','treinador'));
