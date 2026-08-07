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

-- O mesmo para os INDICADORES (os cartões de números no topo do Painel). Um
-- clube que não trabalha patrocínios não quer "Angariado 0 €" a ocupar espaço
-- ao lado do que interessa. Coluna separada porque são duas listas distintas
-- com catálogos distintos — juntá-las num só campo obrigava a prefixos.
alter table profiles add column if not exists hidden_metrics jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 3. Cada utilizador guarda as SUAS preferências
-- ---------------------------------------------------------------------
-- Limpa uma lista de chaves vinda do cliente: só texto curto, sem repetidos.
-- A coluna é jsonb e não deve virar um sítio para guardar o que apetecer.
create or replace function public.clean_pref_keys(p_keys jsonb)
returns jsonb
language sql
immutable
as $$
  select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
    from jsonb_array_elements_text(p_keys) as t(value)
   where length(value) between 1 and 40;
$$;

-- Guarda as DUAS listas de preferências do Painel de quem chama. Os
-- parâmetros são opcionais: passar só um deixa o outro como está.
create or replace function public.set_painel_prefs(
  p_hidden_alerts  jsonb default null,
  p_hidden_metrics jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sem sessão.';
  end if;
  if p_hidden_alerts is not null and jsonb_typeof(p_hidden_alerts) <> 'array' then
    raise exception 'Preferências inválidas.';
  end if;
  if p_hidden_metrics is not null and jsonb_typeof(p_hidden_metrics) <> 'array' then
    raise exception 'Preferências inválidas.';
  end if;

  -- As ÚNICAS colunas que esta função escreve, e só na linha de quem chama.
  -- É por isso que existe: `profiles` não pode ter auto-edição por política,
  -- senão qualquer utilizador mudava o seu próprio `role`.
  update public.profiles
     set hidden_alerts  = case when p_hidden_alerts  is null then hidden_alerts
                               else clean_pref_keys(p_hidden_alerts) end,
         hidden_metrics = case when p_hidden_metrics is null then hidden_metrics
                               else clean_pref_keys(p_hidden_metrics) end
   where id = auth.uid()
   returning * into v_row;

  return jsonb_build_object(
    'hidden_alerts',  v_row.hidden_alerts,
    'hidden_metrics', v_row.hidden_metrics
  );
end;
$$;

-- Mantida por compatibilidade: a versão anterior só tratava dos avisos.
create or replace function public.set_hidden_alerts(p_hidden jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.set_painel_prefs(p_hidden, null) -> 'hidden_alerts';
$$;

revoke all on function public.set_hidden_alerts(jsonb)  from public, anon;
revoke all on function public.set_painel_prefs(jsonb, jsonb) from public, anon;
grant execute on function public.set_hidden_alerts(jsonb)  to authenticated;
grant execute on function public.set_painel_prefs(jsonb, jsonb) to authenticated;
