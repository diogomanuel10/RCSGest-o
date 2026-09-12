-- =====================================================================
-- Rumia — A ÉPOCA passa a ser uma DIMENSÃO dos dados (não uma etiqueta)
-- =====================================================================
-- Correr DEPOIS de schema.sql, notifications.sql e multitenant.sql.
-- É seguro re-executar (idempotente).
--
-- O PROBLEMA que isto resolve
-- ---------------------------
-- Até aqui `settings.season` era só um texto no cabeçalho das Definições:
-- NENHUMA tabela sabia a que época pertencia. O assistente de viragem de
-- época arquivava atletas e gravava a época nova — mas os eventos, as
-- presenças, as quotas, os resultados e o livro-razão da época anterior
-- continuavam no mesmo saco. Consequência, no Painel que o coordenador abre
-- todos os dias:
--
--   • a "taxa de comparência" era a média de TODAS as épocas já registadas;
--   • o balanço V-D era o de SEMPRE, apresentado como o da época;
--   • o resumo financeiro somava o livro-razão inteiro desde o primeiro dia.
--
-- Ou seja: os números em que a app se apoia para vender — comparência,
-- quedas individuais, "treina muito, joga pouco" — ficavam errados a partir
-- do segundo ano de uso, que é exatamente quando o clube começa a confiar
-- neles. Um número errado que ninguém consegue verificar é pior do que
-- número nenhum.
--
-- A DECISÃO: uma coluna `season` (texto), não uma tabela `seasons`
-- ---------------------------------------------------------------------
-- A época já é um texto livre escrito pelo coordenador ("2026/2027") e é
-- assim que ela aparece em todo o lado. Uma tabela de épocas com ids
-- obrigaria a uma FK em oito tabelas, a um ecrã de gestão de épocas e a uma
-- migração com resolução de nomes — para guardar exatamente a mesma
-- informação. Segue o padrão já usado nos escalões e nas posições: o valor
-- em vigor vive em `settings`, o histórico deriva-se do que existe.
--
-- QUE TABELAS levam época (e quais NÃO levam)
-- ---------------------------------------------------------------------
-- Levam: o que ACONTECE dentro de uma época e é contado por época —
--   events, quotas, financial_entries, objectives,
--   training_phases, mesocycles, gym_sessions, game_plans.
--
-- NÃO levam, de propósito:
--   • players/teams/coaches/sponsors — PERSISTEM entre épocas; quem sai é
--     arquivado (archived_at), que é o mecanismo que já existe para isso.
--   • attendances, squads, game_results, game_sets, event_responses,
--     training_plans, game_minutes — pendem de um EVENTO, que já tem época.
--     Uma segunda cópia da época aqui seria um dado com dois donos, e um
--     evento corrigido para outra época deixava os filhos na antiga.
--   • clinical_episodes, physical_tests, medical_history — HISTÓRICO
--     clínico e físico do atleta. Uma lesão de janeiro não deixa de contar
--     em setembro: é precisamente o cruzamento entre épocas que responde a
--     "esta zona volta sempre".
--   • exercises, tactical_scenarios — biblioteca do clube, património que
--     não caduca com a época (é a razão por que a biblioteca existe).
--   • prospects — o funil de recrutamento ATRAVESSA a viragem: observa-se
--     em março para inscrever em setembro. Recortá-lo por época escondia o
--     funil no dia exato em que ele é mais usado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. A época em vigor do clube de quem está a escrever
-- ---------------------------------------------------------------------
-- Serve de DEFAULT às colunas novas: um INSERT que não diga nada fica na
-- época corrente, que é o que se quer em 99% das escritas. A app só carimba
-- a época à mão quando o utilizador está a consultar uma época anterior.
--
-- `security definer` porque é lida de dentro de defaults e de triggers, onde
-- o RLS de settings não deve poder transformar a ausência de leitura num
-- NULL silencioso.
create or replace function public.current_season()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select season from public.settings where org_id = public.current_org_id() limit 1;
$$;

grant execute on function public.current_season() to authenticated;


-- ---------------------------------------------------------------------
-- 2. A coluna `season` nas tabelas que são contadas por época
-- ---------------------------------------------------------------------
-- O backfill dá a TODAS as linhas existentes a época atual do respetivo
-- clube. É a leitura verdadeira: a app nunca soube separar épocas, por isso
-- tudo o que lá está foi registado dentro da época que o clube tem agora.
-- Para quem já virou a época à mão, os números ficam como já estavam — não
-- se inventa uma separação que nunca existiu (é a mesma regra do ano de
-- nascimento: de um ano não se inventa um dia).
do $$
declare
  t text;
  tables text[] := array[
    'events', 'quotas', 'financial_entries', 'objectives',
    'training_phases', 'mesocycles', 'gym_sessions', 'game_plans'
  ];
begin
  foreach t in array tables loop
    -- A tabela pode não existir (migração opcional ainda por correr).
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I add column if not exists season text', t);

    -- Backfill por clube, a partir das definições de cada um.
    execute format($f$
      update public.%I d
         set season = s.season
        from public.settings s
       where d.season is null
         and d.org_id = s.org_id
    $f$, t);

    -- Rede de segurança: linhas sem org_id (instalação de clube único que
    -- nunca correu o multitenant.sql) ficam com a época da única linha de
    -- definições que existe.
    execute format($f$
      update public.%I
         set season = (select season from public.settings order by id limit 1)
       where season is null
    $f$, t);

    execute format('alter table public.%I alter column season set default public.current_season()', t);

    -- O índice é (org_id, season): TODA a leitura da app filtra pelos dois,
    -- por essa ordem — o isolamento por clube é restritivo e aplica-se
    -- sempre, a época é o filtro que o utilizador escolhe.
    execute format(
      'create index if not exists %I on public.%I (org_id, season)',
      'idx_' || t || '_org_season', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 3. Que épocas existem neste clube?
-- ---------------------------------------------------------------------
-- Deriva-se do que está REGISTADO, em vez de se manter uma lista à parte em
-- `settings`. Uma lista mantida à mão diverge do conteúdo no primeiro
-- import, na primeira correção feita no SQL Editor e em qualquer clube que
-- já tivesse dados antes desta migração — e uma época que existe nos dados
-- mas não na lista é uma época que o coordenador não consegue voltar a ver.
--
-- A época CORRENTE entra sempre, mesmo sem uma única linha registada: é a
-- época em que se está a trabalhar, e o seletor não pode abrir vazio no
-- primeiro dia de um clube novo.
create or replace function public.list_seasons()
returns table (season text, is_current boolean)
language sql
stable
security definer
set search_path = public
as $$
  with org as (
    select public.current_org_id() as id
  ),
  atual as (
    select s.season from public.settings s, org where s.org_id = org.id limit 1
  ),
  todas as (
    select e.season from public.events e, org where e.org_id = org.id and e.season is not null
    union
    select q.season from public.quotas q, org where q.org_id = org.id and q.season is not null
    union
    select f.season from public.financial_entries f, org where f.org_id = org.id and f.season is not null
    union
    select o.season from public.objectives o, org where o.org_id = org.id and o.season is not null
    union
    select season from atual
  )
  select t.season,
         t.season is not distinct from (select season from atual) as is_current
    from todas t
   where t.season is not null
   order by t.season desc;
$$;

grant execute on function public.list_seasons() to authenticated;


-- ---------------------------------------------------------------------
-- 4. Verificação
-- ---------------------------------------------------------------------
-- Deve devolver 0 linhas por tabela. Uma linha sem época é uma linha que
-- desaparece de todos os ecrãs: a app filtra sempre por época.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['events','quotas','financial_entries','objectives',
                           'training_phases','mesocycles','gym_sessions','game_plans'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('select count(*) from public.%I where season is null', t) into n;
    if n > 0 then
      raise warning 'epocas.sql: % linhas sem época em %  (confirma que settings tem season preenchida)', n, t;
    end if;
  end loop;
end $$;
