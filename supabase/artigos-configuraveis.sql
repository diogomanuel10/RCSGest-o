-- =====================================================================
-- Rumia — Artigos de equipamento e tamanhos configuráveis pelo clube
-- =====================================================================
-- Corre DEPOIS de schema.sql e multitenant.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: a lista de artigos vivia cravada no código (EQUIPMENT_ARTICLES em
-- constants.js) e os tamanhos eram XS–XXL para todos. Um clube que dá
-- joelheiras, ou que compra camisolas em tamanhos de criança (6/8/10/12),
-- não tinha onde o dizer — e o que a app não sabe registar acaba registado
-- numa folha de Excel à parte, que é onde as encomendas se perdem.
--
-- O obstáculo era o formato: `player_sizes` tinha UMA COLUNA POR ARTIGO, por
-- isso criar um artigo novo exigia um ALTER TABLE. Um coordenador não corre
-- ALTER TABLE. Os tamanhos passam a viver todos numa só coluna `sizes`
-- (jsonb), com a chave do artigo como chave do objeto.
--
-- O que faz:
--   1. Acrescenta `settings.equipment_articles jsonb` (a lista do clube)
--   2. Acrescenta `player_sizes.sizes jsonb`
--   3. Copia para lá o que já estava nas 9 colunas fixas
--   4. NÃO apaga as colunas antigas (ver nota no fim)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A lista de artigos do clube
-- ---------------------------------------------------------------------
-- Vazio = usar a lista por omissão do código (DEFAULT_EQUIPMENT_ARTICLES),
-- exatamente como `settings.positions`: um clube que não configura nada
-- continua a ver os nove artigos de sempre, sem seed nenhum.
--
-- Cada entrada é { key, label, sizes: [], active }. A `key` é imutável — é
-- ela que está guardada em player_sizes.sizes e em equipment_requests.article.
-- `sizes` vazio = tamanho em texto livre (as meias). `active: false` tira o
-- artigo de circulação SEM apagar a definição: os pedidos e tamanhos já
-- registados continuam a saber traduzir a chave.
alter table settings add column if not exists equipment_articles jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 2. Os tamanhos numa coluna só
-- ---------------------------------------------------------------------
-- Um objeto { "<chave do artigo>": "<tamanho>" }. A chave é a mesma que o
-- clube configura em settings.equipment_articles e a mesma que
-- equipment_requests.article já guardava — sem isso o pedido de um artigo e
-- o tamanho desse artigo na ficha ficavam a falar línguas diferentes.
--
-- É jsonb e não uma tabela chave/valor por atleta porque isto lê-se sempre
-- inteiro (a tabela das Encomendas é uma linha por atleta com todas as
-- colunas) e nunca se consulta por artigo isolado. Uma tabela filha só
-- acrescentava uma junção a cada leitura.
alter table player_sizes add column if not exists sizes jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 3. Trazer o que já está preenchido
-- ---------------------------------------------------------------------
-- Sem isto, a migração apagava do ecrã todos os tamanhos já registados: eles
-- continuavam na base de dados, mas a app deixava de os ir buscar ali. O
-- `||` mantém o que já estiver em `sizes` por cima do valor antigo (correr o
-- ficheiro duas vezes não desfaz uma edição feita entretanto).
update player_sizes set sizes =
  (
    jsonb_strip_nulls(jsonb_build_object(
      'camisola',        camisola,
      'camisola_alt',    camisola_alt,
      'calcoes',         calcoes,
      'meias',           meias,
      'casaco_treino',   casaco_treino,
      'calca_treino',    calca_treino,
      'mochila',         mochila,
      'blusao',          blusao,
      'camisola_treino', camisola_treino
    ))
    || coalesce(sizes, '{}'::jsonb)
  )
where sizes is null or sizes = '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 4. As colunas antigas ficam
-- ---------------------------------------------------------------------
-- De propósito, e é a mesma regra do ano de nascimento quando entrou a data
-- completa: uma migração que apaga a coluna de origem no mesmo passo em que
-- copia os dados não tem volta se a cópia correr mal. Ficam como estão (a
-- app deixa de as escrever) e apagam-se num ficheiro à parte, depois de a
-- coluna nova ter uma época de uso.
--
-- Quando for altura, é isto:
--   alter table player_sizes
--     drop column camisola,      drop column camisola_alt,
--     drop column calcoes,       drop column meias,
--     drop column casaco_treino, drop column calca_treino,
--     drop column mochila,       drop column blusao,
--     drop column camisola_treino;
