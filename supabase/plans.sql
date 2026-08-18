-- =====================================================================
-- Rumia — Planos de subscrição (editáveis pelo admin da plataforma)
-- =====================================================================
-- Corre DEPOIS de multitenant.sql (usa is_platform_admin()).
-- É seguro re-executar: o seed usa "on conflict do nothing", por isso NÃO
-- sobrepõe planos que já tenhas personalizado no painel.
--
-- Os planos passam a viver aqui (em vez de fixos no código). A app lê-os no
-- arranque e o admin da plataforma edita módulos/limites em Plataforma → Planos.
-- =====================================================================

create table if not exists plans (
  key          text primary key,          -- 'solo', 'clube', ... (estável)
  name         text not null,             -- nome mostrado
  sort         int  not null default 0,   -- ordem de apresentação
  description  text,                       -- descrição curta
  features     jsonb not null default '[]'::jsonb,  -- módulos premium incluídos
  max_escaloes int,                        -- limite de escalões (null = ilimitado)
  max_users    int,                        -- limite de utilizadores (null = ilimitado)
  updated_at   timestamptz default now()
);

alter table plans enable row level security;

drop policy if exists "plans_read"  on plans;
drop policy if exists "plans_write" on plans;

-- Leitura: todos os autenticados (a app precisa dos planos para o gating).
create policy "plans_read" on plans for select to authenticated using (true);
-- Escrita: só o admin da plataforma (o vendedor).
create policy "plans_write" on plans for all to authenticated
  using (is_platform_admin()) with check (is_platform_admin());

-- Seed inicial (só insere o que faltar; não mexe no que já personalizaste).
insert into plans (key, name, sort, description, features, max_escaloes, max_users) values
  ('treinador',  'Treinador', 1, 'Um treinador e os seus escalões: plantéis, calendário, presenças e treino.',
     '[]'::jsonb, 3, 2),
  ('clube',      'Clube',     2, 'O clube completo: ficha de sócio, material, documentos, fisioterapia e preparação física.',
     '["quotas","equipamentos","encomendas","documentos","medico","fisica"]'::jsonb, null, 15),
  ('clube_plus', 'Clube+',    3, 'Tudo, mais visão de direção (financeiro) e análise/IA.',
     '["quotas","equipamentos","encomendas","documentos","medico","fisica","financeiro","ia"]'::jsonb, null, null)
on conflict (key) do nothing;

-- Se já correste a versão de CINCO planos (Solo, Treinador+, Essencial), corre
-- também `plans-consolidacao.sql`: move os clubes desses planos para os novos e
-- remove-os da tabela. Este ficheiro sozinho não lhes toca, de propósito — o
-- seed nunca mexe em dados existentes.
