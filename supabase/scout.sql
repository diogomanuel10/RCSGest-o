-- =====================================================================
-- Rumia — Scout ao vivo: as ações de cada atleta, ponto a ponto
-- =====================================================================
-- O resultado diz COMO acabou o jogo; o scout diz PORQUÊ. Durante o jogo o
-- treinador (ou um adjunto no banco) toca na atleta e na ação — receção,
-- passe, ataque, serviço, bloco, defesa — com a qualidade (# + − / =). A app
-- conta o marcador, roda a equipa e põe a líbero em campo sozinha.
--
-- Até aqui isto vivia numa folha de Google Sheets com Apps Script, uma por
-- jogo, arquivada numa pasta do Drive com link público. Cada escalão tinha a
-- sua cópia, os planteis escreviam-se à mão e os dados nunca se cruzavam com
-- o resto do clube.
--
-- Uma linha por jogo scoutado, com as ações num `jsonb`:
--
--   • O jogo é uma SEQUÊNCIA de ações e tudo o resto (marcador, rotação,
--     quem estava em campo, estatísticas) deriva dela. Guardar a sequência e
--     não os totais é o que torna o "anular última" trivial e impede que o
--     marcador e as estatísticas divirjam. Uma tabela com uma linha por ação
--     eram ~600 escritas por jogo, cada uma a pedir rede no pavilhão.
--   • `summary` é uma cópia pequena do que a LISTA precisa (parciais e sets)
--     para não descarregar todas as ações de todos os jogos ao abrir a secção.
--     Escreve-a a app a cada gravação; nunca é fonte de verdade.
--   • `event_id` é opcional: o normal é scoutar um jogo do calendário (e aí,
--     ao terminar, os parciais e os pontos jogados vão para `game_sets` e
--     `game_minutes`), mas um particular combinado na véspera não está no
--     calendário — e o treinador não cria eventos.
--
-- Como usar:
--   1. Corre primeiro schema.sql, multitenant.sql e resultados.sql.
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar.
-- =====================================================================

create table if not exists game_scouts (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null references teams(id) on delete cascade,
  -- Um jogo do calendário tem no máximo um scout. Apagar o evento não apaga o
  -- scout: as ações continuam a ser o registo do que se jogou.
  event_id    uuid references events(id) on delete set null,
  opponent    text not null default '',
  game_date   date not null default current_date,
  competition text,
  status      text not null default 'em_curso'
              check (status in ('em_curso', 'terminado')),
  data        jsonb not null default '{}'::jsonb,
  summary     jsonb not null default '{}'::jsonb,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists uq_game_scouts_event on game_scouts (event_id) where event_id is not null;
create index if not exists idx_game_scouts_team on game_scouts (team_id, game_date desc);

-- ---------------------------------------------------------------------
-- Isolamento por clube
-- ---------------------------------------------------------------------
alter table game_scouts add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table game_scouts alter column org_id set default current_org_id();
create index if not exists idx_game_scouts_org on game_scouts (org_id);

alter table game_scouts enable row level security;

drop policy if exists tenant_isolation on game_scouts;
create policy tenant_isolation on game_scouts as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- Quem lê e quem escreve
-- ---------------------------------------------------------------------
-- LEITURA: coordenador e direção (supervisão de todo o clube) e o treinador
-- das equipas que treina. O scout é material de trabalho da equipa técnica:
-- o atleta não o lê (ainda) — "3 erros de receção" sem o contexto do jogo é
-- uma nota, não uma informação, e quem a explica é o treinador.
drop policy if exists "gsc_read" on game_scouts;
create policy "gsc_read" on game_scouts for select to authenticated
  using (
    app_role() in ('coordenador', 'direcao')
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  );

-- ESCRITA: coordenador, ou treinador nas SUAS equipas — o mesmo recorte do
-- registo do resultado (`game_results`), que é onde o scout desagua.
drop policy if exists "gsc_write" on game_scouts;
create policy "gsc_write" on game_scouts for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND team_id in (select trainer_team_ids()))
  );
