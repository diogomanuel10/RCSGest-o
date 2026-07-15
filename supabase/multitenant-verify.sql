-- =====================================================================
-- Rumia — Verificação da migração multi-tenant
-- =====================================================================
-- Corre ESTE ficheiro no SQL Editor do Supabase DEPOIS de multitenant.sql e
-- ANTES de publicar a app. Confirma que todos os dados ficaram com org_id e que
-- nada ficou por atribuir. Não altera dados — só lê.
--
-- O que procurar nos resultados:
--   • Consulta 1: deve existir 1 organização "Real Clube Senhorense".
--   • Consulta 2: a coluna "sem_org_id" tem de ser 0 em TODAS as linhas.
--   • Consulta 3: o teu perfil tem de estar ligado ao clube, como coordenador.
--   • Consulta 4: a tua conta tem de aparecer como admin da plataforma.
-- Se algo falhar, NÃO publiques — volta a correr multitenant.sql e verifica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. As organizações existentes (deve haver o "Real Clube Senhorense")
-- ---------------------------------------------------------------------
select id, name, status, plan, trial_ends_at, created_at
from organizations
order by created_at;

-- ---------------------------------------------------------------------
-- 2. Linhas sem org_id em cada tabela de dados (tem de ser tudo 0)
-- ---------------------------------------------------------------------
-- Função auxiliar que percorre todas as tabelas e conta as linhas totais e as
-- que ficaram sem clube atribuído (org_id nulo).
create or replace function public.verify_multitenant()
returns table (tabela text, total bigint, sem_org_id bigint)
language plpgsql
as $$
declare
  t text;
  tables text[] := array[
    'settings','coaches','equipment','teams','players','team_coaches','sponsors',
    'events','attendances','quotas','prospects','clinical_episodes',
    'clinical_sessions','physio_appointments','physical_profiles','medical_history',
    'physical_tests','training_phases','mesocycles','gym_sessions','gym_exercises',
    'gym_attendance','game_minutes','athlete_availability','training_plans',
    'training_plan_items','training_evaluations','training_player_evals',
    'player_documents','player_sizes','squads','squad_players','financial_entries',
    'game_plans','objectives','notifications','push_subscriptions','profiles'
  ];
  v_total bigint;
  v_missing bigint;
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('select count(*), count(*) filter (where org_id is null) from public.%I', t)
      into v_total, v_missing;
    tabela := t; total := v_total; sem_org_id := v_missing;
    return next;
  end loop;
end;
$$;

-- Mostra primeiro as tabelas problemáticas (sem_org_id > 0), se existirem.
select * from public.verify_multitenant() order by sem_org_id desc, tabela;

-- Resumo rápido: total de linhas ainda sem clube (tem de dar 0).
select coalesce(sum(sem_org_id), 0) as total_sem_org_id
from public.verify_multitenant();

-- ---------------------------------------------------------------------
-- 3. Os perfis e a que clube pertencem (todos devem ter clube)
-- ---------------------------------------------------------------------
select p.email, p.role, o.name as clube
from profiles p
left join organizations o on o.id = p.org_id
order by p.role, p.email;

-- ---------------------------------------------------------------------
-- 4. Admins da plataforma (a tua conta de vendedor tem de aparecer)
-- ---------------------------------------------------------------------
select u.email, pa.created_at
from platform_admins pa
join auth.users u on u.id = pa.user_id;

-- ---------------------------------------------------------------------
-- 5. (Opcional) Amostra: confirma que os teus atletas estão no clube certo
-- ---------------------------------------------------------------------
select o.name as clube, count(pl.id) as atletas
from players pl
join organizations o on o.id = pl.org_id
group by o.name;

-- Limpeza: remove a função de verificação (opcional).
-- drop function if exists public.verify_multitenant();
