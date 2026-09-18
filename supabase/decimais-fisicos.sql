-- =====================================================================
-- Rumia — Duas casas decimais nos dados físicos
-- =====================================================================
-- Correr DEPOIS de schema.sql. Pode correr várias vezes.
--
-- Porque existe: `physical_tests.value` já era `numeric(8,2)`, mas o campo do
-- formulário era um `type="number"` sem `step` — e sem `step` o browser assume
-- 1 e RECUSA qualquer decimal. Na prática não se conseguia escrever 28,5 numa
-- preensão nem 3,05 num sprint, que é precisamente onde a casa decimal É a
-- medição. Isso corrigiu-se na app.
--
-- O que falta é a base de dados: a altura e o peso estavam em `numeric(5,1)`,
-- por isso um peso de 63,45 kg — o que uma balança de bioimpedância dá — era
-- gravado como 63,5 SEM ninguém ver. Um campo que aceita mais casas do que a
-- coluna guarda é um campo que arredonda pelas costas de quem mediu, e a
-- medição é o trabalho todo do preparador físico.
--
-- Alargar uma coluna `numeric` não perde nada: os valores já gravados continuam
-- iguais (63,5 passa a ler-se 63,50), e o que muda é só o que se pode gravar a
-- partir daqui. O sentido contrário — apertar — é que arredondava o histórico.
-- =====================================================================

alter table physical_profiles alter column height_cm type numeric(5,2);
alter table physical_profiles alter column weight_kg type numeric(5,2);

-- `physical_tests.value` fica como está: já era numeric(8,2), que é a precisão
-- que a app passa a oferecer. Fica aqui escrito para quem vier a seguir não ter
-- de ir confirmar ao schema.
