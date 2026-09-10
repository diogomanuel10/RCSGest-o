-- =====================================================================
-- Convocatória: só convocado e não convocado
-- =====================================================================
-- Correr DEPOIS de schema.sql, uma vez.
--
-- `squad_players.status` aceitava 'titular' e 'suplente'. Era a decisão errada
-- no sítio errado: o 6 inicial decide-se no pavilhão, muda no aquecimento e
-- muda outra vez a meio do primeiro set, mas o portal do atleta mostrava-o
-- como um facto dias antes do jogo. Quem jogou mesmo mede-se em pontos, no
-- registo do resultado (`game_minutes`), que é onde isso é verdade.
--
-- A coluna mantém-se (com um só valor) para não mexer nos índices nem na
-- chave única: estar convocado passa a ser ter linha, e nada mais.

update squad_players set status = 'convocado' where status <> 'convocado';

alter table squad_players drop constraint if exists squad_players_status_check;

alter table squad_players
  add constraint squad_players_status_check check (status = 'convocado');
