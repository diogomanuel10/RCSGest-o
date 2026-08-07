-- =====================================================================
-- Rumia — Avisos do Painel: limiares do clube + preferências por pessoa
-- =====================================================================
-- Duas coisas que estavam fixas no código e não deviam estar:
--
--   1. OS LIMIARES do aviso "treina muito, joga pouco" (a partir de que
--      percentagem de presenças se considera que alguém "vem sempre", e
--      abaixo de que participação se considera que "quase não joga"). Isso
--      depende da realidade de cada clube e do escalão — passa para as
--      Definições, com o coordenador a decidir.
--
--   2. QUE AVISOS cada pessoa quer ver no Painel. Um coordenador que não
--      trata de equipamento não quer o aviso de equipamento a competir com
--      o resto; um treinador quer os das suas equipas e mais nada. Uma lista
--      que mostra tudo a toda a gente acaba ignorada por toda a gente.
--
-- Porque é que as preferências NÃO vão para `settings`: `settings` é do
-- clube e só o coordenador lá mexe. Estas são de cada utilizador — vivem no
-- perfil dele.
--
-- Porque é que se escreve por FUNÇÃO e não por política: a tabela `profiles`
-- só é editável pelo coordenador, e com boa razão — abrir a auto-edição
-- deixaria qualquer utilizador mudar o SEU PRÓPRIO `role` e promover-se a
-- coordenador. A função abaixo escreve exclusivamente a coluna das
-- preferências, e só na linha de quem a chama.
--
-- Como usar:
--   1. Corre primeiro schema.sql, multitenant.sql e resultados.sql.
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Limiares do cruzamento treino × jogo (definição do clube)
-- ---------------------------------------------------------------------
-- Os valores por omissão são os que estavam no código.
alter table settings add column if not exists gap_presenca_min integer not null default 80;
alter table settings add column if not exists gap_jogo_max     integer not null default 25;
alter table settings add column if not exists gap_min_treinos  integer not null default 5;
alter table settings add column if not exists gap_min_jogos    integer not null default 3;

-- ---------------------------------------------------------------------
-- 2. Avisos escondidos por cada utilizador
-- ---------------------------------------------------------------------
-- Guardam-se os avisos ESCONDIDOS (e não os visíveis) de propósito: assim um
-- aviso novo, acrescentado numa versão futura, aparece a toda a gente por
-- omissão em vez de ficar invisível a quem já tinha preferências gravadas.
alter table profiles add column if not exists hidden_alerts jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 3. Cada utilizador guarda as SUAS preferências
-- ---------------------------------------------------------------------
create or replace function public.set_hidden_alerts(p_hidden jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;
  if p_hidden is null or jsonb_typeof(p_hidden) <> 'array' then
    raise exception 'Preferências inválidas.';
  end if;

  -- Só se aceitam chaves de texto curtas: a coluna é jsonb e não deve virar
  -- um sítio para guardar o que apetecer.
  select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    into v_clean
    from jsonb_array_elements_text(p_hidden) as t(value)
   where length(value) between 1 and 40;

  -- A ÚNICA coluna que esta função escreve, e só na linha de quem chama.
  update public.profiles
     set hidden_alerts = v_clean
   where id = auth.uid();

  return v_clean;
end;
$$;

revoke all on function public.set_hidden_alerts(jsonb) from public, anon;
grant execute on function public.set_hidden_alerts(jsonb) to authenticated;
