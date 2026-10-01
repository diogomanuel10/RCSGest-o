-- =====================================================================
-- Rumia — Datas & iniciativas (marketing do clube)
-- =====================================================================
-- Correr DEPOIS de schema.sql e multitenant.sql. É seguro re-executar.
--
-- PORQUÊ:
-- As redes sociais de um clube vivem de datas — o Outubro Rosa, o Dia da Mãe,
-- o São Martinho, o aniversário da invenção do voleibol — e quem trata delas
-- é quase sempre o coordenador, entre tudo o resto. A data passa e só se dá
-- por ela quando outro clube já publicou. As datas em si vivem no CÓDIGO
-- (src/marketing-dates.js), porque são as mesmas para todos os clubes e
-- algumas mudam todos os anos (Carnaval, Páscoa, Dia da Mãe). Aqui guarda-se
-- só o que é DO CLUBE:
--
--   kind = 'iniciativa'  o que o clube vai fazer (ideia → planeada →
--                        publicada), com notas. Pode estar ligada a uma data
--                        do catálogo (`date_key`) ou ser solta.
--   kind = 'data'        uma data do próprio clube (aniversário do clube,
--                        apresentação dos plantéis) que se repete todos os
--                        anos no mesmo dia.
--   kind = 'oculta'      uma data do catálogo que o clube não quer ver (o
--                        Halloween num clube que não o faz). Ocultar e não
--                        apagar: o catálogo é do código, e a escolha é do
--                        clube.
--
-- É UMA tabela e não três: as três coisas são lidas sempre juntas, pelo mesmo
-- ecrã e pela mesma pessoa, e três tabelas eram três migrações, três RLS e
-- três sítios para alguém se esquecer de um.
--
-- SÓ O COORDENADOR. É o plano de comunicação do clube a meio de ser escrito
-- (ideias por decidir, notas soltas) — não é trabalho de mais ninguém, e uma
-- lista que toda a gente vê deixa de ser um sítio onde se escrevem ideias.
-- =====================================================================

create table if not exists marketing_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null default 'iniciativa'
             check (kind in ('iniciativa','data','oculta')),
  title      text,
  -- Data da iniciativa (quando se publica / acontece) ou dia da data do clube.
  -- Nula só numa linha 'oculta', que não acontece em dia nenhum.
  date       date,
  -- Data do catálogo (src/marketing-dates.js) ou de uma data do clube
  -- ('club:<id>') a que a iniciativa pertence. Nula = iniciativa solta.
  date_key   text,
  status     text not null default 'ideia'
             check (status in ('ideia','planeada','feita')),
  notes      text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_items_shape check (
    (kind = 'oculta' and date_key is not null)
    or (kind <> 'oculta' and date is not null and coalesce(btrim(title), '') <> '')
  )
);

create index if not exists idx_marketing_items_date on marketing_items (date);

-- ---------------------------------------------------------------------
-- Multi-tenant (org_id + isolamento por clube)
-- ---------------------------------------------------------------------
alter table marketing_items add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table marketing_items alter column org_id set default current_org_id();
create index if not exists idx_marketing_items_org on marketing_items (org_id);

alter table marketing_items enable row level security;

drop policy if exists tenant_isolation on marketing_items;
create policy tenant_isolation on marketing_items as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- Políticas por papel: leitura e escrita só do coordenador
-- ---------------------------------------------------------------------
drop policy if exists "mk_coord" on marketing_items;
create policy "mk_coord" on marketing_items for all to authenticated
  using (app_role() = 'coordenador')
  with check (app_role() = 'coordenador');
