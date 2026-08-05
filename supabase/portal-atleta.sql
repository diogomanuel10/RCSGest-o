-- =====================================================================
-- Rumia — Portal do atleta: ver a própria disponibilidade
-- =====================================================================
-- O portal desenha um destaque com a disponibilidade do atleta (estado,
-- limitações ao treino, retorno previsto), mas a política de leitura era:
--
--   create policy "avail_read" on athlete_availability for select
--     using (app_role() <> 'atleta');
--
-- ...e o portal SÓ é visível ao papel `atleta`. Ou seja, aquele bloco nunca
-- chegou a aparecer a ninguém: o atleta recebia zero linhas. Era código morto.
--
-- Aqui abre-se a leitura da PRÓPRIA linha. O atleta passa a ver o seu estado
-- (apto, condicionado, indisponível), as limitações ao treino e a previsão de
-- retorno — informação que é sobre ele e que ele tem de saber para se
-- apresentar ao treino em condições.
--
-- O que continua fechado: o detalhe clínico (`clinical_episodes`,
-- `clinical_sessions`, `physio_appointments`), que tem o seu próprio RLS
-- (`med_rw`, coordenador + fisioterapeuta). O que se abre é o RESUMO
-- operacional, não o processo clínico.
--
-- Escrever continua reservado ao coordenador e ao fisioterapeuta: o atleta lê
-- o seu estado, não o declara.
--
-- Como usar:
--   1. Corre primeiro schema.sql (e as restantes migrações).
--   2. Cola este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar.
-- =====================================================================

drop policy if exists "avail_read" on athlete_availability;
create policy "avail_read" on athlete_availability for select to authenticated
  using (
    app_role() <> 'atleta'
    OR player_id = athlete_player_id()
  );
