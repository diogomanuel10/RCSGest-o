-- =====================================================================
-- Rumia — Consolidação dos planos: 5 níveis -> 3
-- =====================================================================
-- Corre DEPOIS de plans.sql. É seguro re-executar.
--
-- Porquê: cinco planos (Solo, Treinador+, Essencial, Clube, Clube+) obrigavam
-- quem compra a decidir demasiado cedo — e o nível de entrada mais barato
-- ancorava o preço em baixo para todos os outros. Ficam três: Treinador (um
-- treinador e os seus escalões), Clube (o clube todo) e Clube+ (com direção).
--
-- Os clubes existentes movem-se sempre PARA CIMA, nunca para baixo: tirar a
-- alguém um módulo que já usava é a forma mais rápida de o perder, e são
-- poucos os clubes afetados. O mesmo mapeamento existe no código
-- (PLAN_ALIASES em src/plans.js), para uma app antiga em cache não ficar sem
-- plano enquanto esta migração não corre.
-- =====================================================================

-- 1. Garante que os três planos novos existem (idempotente).
insert into plans (key, name, sort, description, features, max_escaloes, max_users) values
  ('treinador',  'Treinador', 1, 'Um treinador e os seus escalões: plantéis, calendário, presenças e treino.',
     '[]'::jsonb, 3, 2),
  ('clube',      'Clube',     2, 'O clube completo: ficha de sócio, material, documentos, fisioterapia e preparação física.',
     '["quotas","equipamentos","encomendas","documentos","medico","fisica"]'::jsonb, null, 15),
  ('clube_plus', 'Clube+',    3, 'Tudo, mais visão de direção (financeiro) e análise/IA.',
     '["quotas","equipamentos","encomendas","documentos","medico","fisica","financeiro","ia"]'::jsonb, null, null)
on conflict (key) do nothing;

-- 2. Move os clubes dos planos antigos.
--    solo / treinador_plus -> treinador     (mesma ideia, limites do maior)
--    essencial             -> clube         (ganha médico e prep. física)
update organizations set plan = 'treinador' where plan in ('solo', 'treinador_plus');
update organizations set plan = 'clube'     where plan = 'essencial';

-- 3. Reordena e remove os planos que deixaram de existir. Só apaga depois de
--    o passo 2 os esvaziar — se ainda houver um clube lá, o delete não corre e
--    fica um plano órfão visível no editor (melhor do que um clube sem plano).
update plans set sort = 1 where key = 'treinador';
update plans set sort = 2 where key = 'clube';
update plans set sort = 3 where key = 'clube_plus';

delete from plans p
 where p.key in ('solo', 'treinador_plus', 'essencial')
   and not exists (select 1 from organizations o where o.plan = p.key);
