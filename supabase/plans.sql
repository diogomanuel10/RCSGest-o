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
  ('solo',           'Solo',       1, 'Um treinador, um escalão.',
     '[]'::jsonb, 1, 1),
  ('treinador_plus', 'Treinador+', 2, 'Um treinador com vários escalões e coordenação técnica.',
     '[]'::jsonb, 3, 2),
  ('essencial',      'Essencial',  3, 'Gestão do clube com ficha de sócio, material e documentos.',
     '["quotas","equipamentos","encomendas","documentos"]'::jsonb, null, 5),
  ('clube',          'Clube',      4, 'Clube completo: médico, preparação física, material e documentos.',
     '["quotas","equipamentos","encomendas","documentos","medico","fisica"]'::jsonb, null, 15),
  ('clube_plus',     'Clube+',     5, 'Tudo, mais visão de direção (financeiro) e análise/IA.',
     '["quotas","equipamentos","encomendas","documentos","medico","fisica","financeiro","ia"]'::jsonb, null, null)
on conflict (key) do nothing;
