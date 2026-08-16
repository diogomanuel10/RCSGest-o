-- =====================================================================
-- Rumia — Decisão Tática: cenários de leitura de jogo e respostas do atleta
-- =====================================================================
-- Treino de DECISÃO, não de execução, para TODAS as posições — não só para
-- distribuidoras. Todas as decisões de voleibol têm a mesma forma: um campo,
-- qualquer coisa que se move e congela, um conjunto de opções classificadas, e
-- um token que a atleta arrasta. O que muda de posição para posição é só o que
-- é o token e o que são as opções:
--
--   • para onde vai a bola  (distribuidora, atacante, serviço) — arrasta a BOLA
--     até uma colega ou até uma zona do campo;
--   • onde me coloco        (bloco, defesa, receção) — arrasta a SUA PRÓPRIA
--     peça até um dos sítios candidatos.
--
-- Em ambos os casos as opções são MARCADAS pelo treinador e classificadas. Não
-- se mede a distância a um sítio "certo": isso reintroduzia uma resposta única
-- com tolerância, e uma central 40 cm ao lado não errou nada.
--
-- Duas escolhas de desenho que atravessam o esquema todo:
--
--   1. Cada peça tem posição INICIAL e FINAL. O cenário anima de uma para a
--      outra e congela. É o movimento que se lê em jogo, não a posição final:
--      uma central que já arrancou a fechar e uma que ainda está parada podem
--      ocupar o mesmo sítio numa fotografia e significar coisas opostas. Sem as
--      duas posições, o cenário perderia exatamente a informação que treina.
--
--   2. NÃO há resposta certa. Cada opção é classificada `otima|aceitavel|ma`
--      com uma razão escrita, e a atleta vê-as todas depois de responder. Uma
--      resposta única só ensinaria a preferência do treinador; o que se quer é
--      que ela saiba defender a escolha. Por isso também não há pontuação
--      acumulada nem ranking — nada nestas tabelas soma acertos por atleta.
--
-- As peças guardam-se em METROS do campo real (largura 0–9; a rede em y=3, o
-- nosso campo a crescer para y maior) e não em píxeis, para o mesmo cenário
-- desenhar bem num telemóvel e num projetor.
--
-- Como usar:
--   1. Corre primeiro schema.sql e multitenant.sql.
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cenários
-- ---------------------------------------------------------------------
-- `role` diz que POSIÇÃO o cenário treina (ver TACTICAL_ROLES em
-- constants.js). É a única coluna que muda o gesto da atleta, e por isso a
-- única razão para esta tabela não ser específica de distribuidoras.
--
-- `team_id` nulo = cenário do clube (visível a toda a equipa técnica). Com
-- equipa, é dela — e o RLS abaixo limita o treinador às suas.
--
-- As peças vivem em JSONB e não em tabelas-filhas de propósito: um cenário é
-- editado e lido sempre INTEIRO (nunca se pergunta "todas as opções de todos
-- os cenários"), e reparti-lo em três tabelas só acrescentava junções e
-- escritas parciais a uma coisa que é conceptualmente um objeto só.
--
--   actor   : quem decide — {"label":"D","x":6.5,"y":6.0,"player_id":null}
--   options : as escolhas, cada uma classificada e com uma razão escrita
--             [{"id":"o2","kind":"jogadora|zona|posicao","label":"Z3",
--               "player_id":uuid|null,"x":4.5,"y":3.9,
--               "verdict":"otima","reason":"…"}, …]
--   pieces  : o resto do cenário; QUALQUER peça pode ter posição final
--             [{"id":"p2","kind":"jogadora|bola","side":"nos|adv","label":"B2",
--               "x":4.5,"y":2.3,"x2":5.9,"y2":2.4}, …]
--
-- Note-se que o que se move NÃO é uma lista de "blocadoras": numa jogada de
-- central quem se desloca é o distribuidor adversário, num ataque é o bloco a
-- formar-se, numa receção é a própria bola. Uma lista com nome de posição
-- fixava a ferramenta numa só pergunta.
--
-- `player_id` liga uma peça a uma ficha REAL do plantel: é o que faz o matchup
-- deixar de ser abstrato (a altura de quem ataca e de quem bloqueia muda a
-- decisão). Fica opcional — um cenário genérico continua a valer.
create table if not exists tactical_scenarios (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references teams(id) on delete cascade,
  role        text not null default 'distribuidora'
              check (role in ('distribuidora','atacante','servico','bloco','defesa','rececao')),
  title       text not null default 'Cenário sem título',
  note        text,
  actor       jsonb not null default '{"label":"D","x":6.5,"y":6.0}'::jsonb,
  options     jsonb not null default '[]'::jsonb,
  pieces      jsonb not null default '[]'::jsonb,
  -- Enquanto não estiver publicado é rascunho do treinador: não chega ao
  -- portal. Um cenário meio feito que aparecesse à atleta ensinaria o erro.
  published   boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Colunas do modelo generalizado, para quem já tenha corrido uma versão
-- anterior deste ficheiro (só de distribuidoras).
alter table tactical_scenarios add column if not exists role    text  not null default 'distribuidora';
alter table tactical_scenarios add column if not exists actor   jsonb not null default '{"label":"D","x":6.5,"y":6.0}'::jsonb;
alter table tactical_scenarios add column if not exists options jsonb not null default '[]'::jsonb;
alter table tactical_scenarios add column if not exists pieces  jsonb not null default '[]'::jsonb;

create index if not exists idx_tactical_scenarios_role on tactical_scenarios (role);
create index if not exists idx_tactical_scenarios_team on tactical_scenarios (team_id);

-- ---------------------------------------------------------------------
-- 2. Respostas do atleta
-- ---------------------------------------------------------------------
-- Guarda-se a resposta para o treinador ver o PADRÃO COLETIVO — se metade do
-- plantel jogou na ponta quando a central estava livre, o problema é do treino
-- e não das atletas. O que NÃO se guarda é uma nota: não há coluna de
-- pontuação, nem acumulado, nem ranking. Uma percentagem por atleta trocaria
-- exploração por decorar, que mata o exercício.
--
-- Uma resposta por atleta e por cenário, e sem política de UPDATE: a primeira
-- é a única que é mesmo uma leitura. Repetir depois de ver a correção é treino
-- (bem-vindo, e a app deixa), mas já não é dado.
create table if not exists tactical_answers (
  id           uuid primary key default gen_random_uuid(),
  scenario_id  uuid not null references tactical_scenarios(id) on delete cascade,
  player_id    uuid not null references players(id) on delete cascade,
  -- id da opção dentro de `options` (ex.: "o2") + o veredicto que essa opção
  -- tinha NO MOMENTO da resposta. Copia-se o veredicto de propósito: se o
  -- treinador reclassificar a jogada amanhã, o que ela leu hoje não muda.
  chosen       text not null,
  verdict      text not null check (verdict in ('otima','aceitavel','ma')),
  answered_at  timestamptz not null default now(),
  unique (scenario_id, player_id)
);

create index if not exists idx_tactical_answers_scenario on tactical_answers (scenario_id);
create index if not exists idx_tactical_answers_player   on tactical_answers (player_id);

-- ---------------------------------------------------------------------
-- 3. Multi-tenant (org_id + isolamento por clube)
-- ---------------------------------------------------------------------
alter table tactical_scenarios add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table tactical_scenarios alter column org_id set default current_org_id();
create index if not exists idx_tactical_scenarios_org on tactical_scenarios (org_id);

alter table tactical_answers add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table tactical_answers alter column org_id set default current_org_id();
create index if not exists idx_tactical_answers_org on tactical_answers (org_id);

alter table tactical_scenarios enable row level security;
alter table tactical_answers   enable row level security;

drop policy if exists tenant_isolation on tactical_scenarios;
create policy tenant_isolation on tactical_scenarios as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

drop policy if exists tenant_isolation on tactical_answers;
create policy tenant_isolation on tactical_answers as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 4. Políticas por papel
-- ---------------------------------------------------------------------

-- As equipas do treinador autenticado (mesma forma usada em game_plans).
create or replace function my_coach_team_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = public
as $$
  select tc.team_id
  from team_coaches tc
  join coaches c on c.id = tc.coach_id
  where c.user_id = auth.uid();
$$;

-- A equipa da atleta autenticada (nula se a conta não estiver vinculada).
create or replace function my_player_team_id()
returns uuid
language sql
stable
security invoker
set search_path = public
as $$
  select team_id from players where user_id = auth.uid() limit 1;
$$;

drop policy if exists "tsc_read"  on tactical_scenarios;
drop policy if exists "tsc_write" on tactical_scenarios;

-- Leitura:
--   • papéis de âmbito de clube — tudo;
--   • treinador — os do clube (team_id nulo) e os das SUAS equipas;
--   • atleta — só os PUBLICADOS da sua equipa (nunca rascunhos, nunca de
--     outro escalão). Um cenário do clube (team_id nulo) chega a toda a gente.
create policy "tsc_read" on tactical_scenarios for select to authenticated
  using (
    app_role() in ('coordenador','direcao','seccionista','leitura')
    or (
      app_role() = 'treinador'
      and (team_id is null or team_id in (select my_coach_team_ids()))
    )
    or (
      app_role() = 'atleta'
      and published
      and (team_id is null or team_id = my_player_team_id())
    )
  );

-- Escrita: coordenador (tudo, incluindo cenários de clube) e treinador
-- APENAS nas suas equipas. O atleta responde, não constrói.
--
-- Repara na diferença para a leitura: ali o treinador vê `team_id is null`,
-- aqui não o pode escrever. Um cenário de clube chega a TODOS os atletas de
-- TODOS os escalões — publicar para o clube inteiro é decisão do coordenador,
-- não de quem treina um escalão. Sem esta assimetria, qualquer treinador podia
-- mandar um cenário de séniores para os infantis.
create policy "tsc_write" on tactical_scenarios for all to authenticated
  using (
    app_role() = 'coordenador'
    or (
      app_role() = 'treinador'
      and team_id in (select my_coach_team_ids())
    )
  )
  with check (
    app_role() = 'coordenador'
    or (
      app_role() = 'treinador'
      and team_id in (select my_coach_team_ids())
    )
  );

drop policy if exists "tan_read"   on tactical_answers;
drop policy if exists "tan_insert" on tactical_answers;
drop policy if exists "tan_delete" on tactical_answers;

-- Leitura das respostas: equipa técnica (o treinador só das suas equipas) e a
-- própria atleta. Uma atleta nunca vê a resposta de outra — a comparação entre
-- colegas é precisamente o que se quer evitar.
create policy "tan_read" on tactical_answers for select to authenticated
  using (
    app_role() in ('coordenador','direcao')
    or (
      app_role() = 'treinador'
      and scenario_id in (
        select id from tactical_scenarios
        where team_id is null or team_id in (select my_coach_team_ids())
      )
    )
    or player_id in (select id from players where user_id = auth.uid())
  );

-- Inserção: só a própria atleta, só na sua ficha, e só em cenários que ela
-- pode mesmo ver (publicados, da sua equipa).
create policy "tan_insert" on tactical_answers for insert to authenticated
  with check (
    player_id in (select id from players where user_id = auth.uid())
    and scenario_id in (
      select id from tactical_scenarios
      where published and (team_id is null or team_id = my_player_team_id())
    )
  );

-- Sem UPDATE para ninguém: a primeira resposta é a que conta. Apagar fica
-- reservado ao coordenador (ex.: limpar um cenário mal classificado).
create policy "tan_delete" on tactical_answers for delete to authenticated
  using (app_role() = 'coordenador');

-- ---------------------------------------------------------------------
-- 5. updated_at
-- ---------------------------------------------------------------------
create or replace function touch_tactical_scenario()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_tactical_scenario on tactical_scenarios;
create trigger trg_touch_tactical_scenario
  before update on tactical_scenarios
  for each row execute function touch_tactical_scenario();
