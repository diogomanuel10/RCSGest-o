-- =====================================================================
-- Rumia — Valores de referência das avaliações físicas
-- =====================================================================
-- Correr DEPOIS de schema.sql e multitenant.sql. Pode correr várias vezes.
--
-- Porque existe: a app já mostra "Baixo / Normal / Forte" ao lado do valor que
-- se está a escrever, mas a única tabela que conhecia vinha escrita no código
-- (preensão manual, feminino). O preparador físico tem as outras — a
-- masculina, o CMJ, o sprint — em PDFs e livros que são dele, e não há forma
-- de as pôr na app sem um programador pelo meio. Uma referência que exige uma
-- alteração de código para existir é uma referência que nunca chega.
--
-- Quem as escreve é o PREPARADOR (e o coordenador): é ele que tem a fonte e é
-- ele que responde por ela. Mesma regra das restantes tabelas da área física
-- (`phys_*`/`prep_*`) — não passa pelas Definições, que são do coordenador.
--
-- As faixas vivem num `jsonb` e não numa tabela filha pela mesma razão dos
-- tamanhos de equipamento (`player_sizes.sizes`): isto lê-se sempre INTEIRO —
-- dá-se a idade e procura-se a faixa que a contém — e nunca uma faixa isolada.
-- Uma tabela filha era uma junção e sete linhas para responder a uma pergunta
-- que é uma só.
-- =====================================================================

create table if not exists test_references (
  id         uuid primary key default gen_random_uuid(),
  -- Chave do teste (ver PHYSICAL_TEST_TYPES em constants.js).
  type       text not null,
  gender     text not null check (gender in ('M','F')),
  -- A FONTE não é decoração: uma referência sem origem é um número sem
  -- autoridade, e quem a lê na ficha de uma atleta tem direito a saber de onde
  -- vem. É mostrada ao lado do valor.
  source     text,
  note       text,
  -- [{ "from": 15, "to": 19, "min": 22, "max": 30 }, …]
  -- `to` nulo = faixa aberta no topo ("70 anos ou mais").
  bands      jsonb not null default '[]'::jsonb,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

-- Uma tabela por teste e sexo, por clube. Sem isto, duas tabelas para o mesmo
-- caso deixavam a app a escolher uma à sorte — e a atleta a ser lida por uma
-- referência diferente conforme o dia.
alter table test_references add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table test_references alter column org_id set default current_org_id();
create index if not exists idx_test_references_org on test_references (org_id);

create unique index if not exists idx_test_references_unique
  on test_references (org_id, type, gender);

alter table test_references enable row level security;

drop policy if exists tenant_isolation on test_references;
create policy tenant_isolation on test_references as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- LEITURA: toda a equipa técnica. O crachá de referência aparece na ficha do
-- atleta, que o treinador também abre — sem leitura, a app mostrava-lhe o
-- valor sem o contexto e era como se a tabela não existisse.
--
-- O ATLETA não lê. Não é dado dele: é a tabela populacional contra a qual o
-- clube o lê, e no portal apareceria como uma nota sobre o corpo dela sem
-- ninguém por perto para a explicar.
drop policy if exists "ref_read" on test_references;
create policy "ref_read" on test_references for select to authenticated
  using (app_role() <> 'atleta');

-- ESCRITA: coordenador e preparador físico — a mesma regra do `phys_write`.
drop policy if exists "ref_write" on test_references;
create policy "ref_write" on test_references for all to authenticated
  using (app_role() in ('coordenador','preparador'))
  with check (app_role() in ('coordenador','preparador'));

-- Nada é semeado aqui de propósito. A tabela de preensão feminina continua a
-- viver no código (`TEST_REFERENCES` em constants.js) e serve de recurso a
-- quem não tiver nada gravado — é o mesmo padrão dos escalões, das posições e
-- dos artigos de equipamento. Semeá-la em cada clube fazia uma cópia por
-- clube de uma coisa que ninguém pediu, e um clube que a apagasse ficava sem
-- referência nenhuma em vez de voltar à de origem.
