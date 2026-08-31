-- =====================================================================
-- Rumia — Ligações no plano de treino e na biblioteca de exercícios
-- =====================================================================
-- Correr DEPOIS de schema.sql, multitenant.sql e exercicios.sql.
-- É seguro re-executar.
--
-- PORQUÊ:
-- Nem todo o trabalho do treinador nasce dentro da Rumia. O plano da sessão
-- é muitas vezes montado noutra app (um quadro tático, uma folha partilhada,
-- um vídeo do exercício no YouTube) e o que faltava aqui era o caminho de
-- volta: sem sítio para o endereço, ou se copiava o plano todo à mão para
-- dentro da app, ou o plano da Rumia ficava vazio e o treino real vivia
-- noutro lado — que é a forma mais rápida de a app deixar de dizer a verdade
-- sobre o que se treinou.
--
-- São DUAS ligações, e não uma:
--   • `training_plans.link_url`      — a sessão inteira feita noutra app.
--   • `training_plan_items.link_url` — o vídeo/ficha de UM exercício.
-- Guardar as duas no mesmo sítio obrigava a escolher entre apontar para o
-- plano ou para o exercício, e são coisas diferentes.
--
-- `exercises.link_url` existe pelo mesmo motivo dos restantes campos da
-- biblioteca: os campos espelham os de `training_plan_items` para "puxar da
-- biblioteca" continuar a ser uma cópia direta. O vídeo de um exercício é
-- do exercício, e sem esta coluna perdia-se em cada cópia para um plano.
--
-- SEM VALIDAÇÃO DE ESQUEMA NA BASE DE DADOS: é texto. A app só constrói o
-- href quando o endereço é mesmo http(s) (`safeUrl` em `src/ui.js`) — um
-- CHECK aqui rejeitaria a gravação em vez de simplesmente não desenhar o
-- link, e o treinador ficava sem perceber porquê.
-- ---------------------------------------------------------------------

alter table training_plans      add column if not exists link_url text;
alter table training_plan_items add column if not exists link_url text;
alter table exercises           add column if not exists link_url text;
