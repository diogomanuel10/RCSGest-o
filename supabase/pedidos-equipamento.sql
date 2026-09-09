-- =====================================================================
-- Rumia — Pedidos de Equipamento (treinador -> clube)
-- =====================================================================
-- Corre DEPOIS de schema.sql, notifications.sql, trainer-notifications.sql
-- (dá o `target_user_id`) e multitenant.sql (dá o `org_id`).
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: o inventário diz o que o clube TEM e as encomendas dizem os
-- tamanhos de cada atleta. Nenhum dos dois responde à pergunta que aparece
-- mesmo no pavilhão — "a Ana rasgou as meias, arranjas-lhe umas?". Isso
-- vivia em mensagens de telemóvel: quem pediu não sabe se foi tratado, e
-- quem trata não tem lista nenhuma para trabalhar.
--
-- O que cria:
--   1. Tabela `equipment_requests` (um pedido = um artigo para um atleta)
--   2. RLS: o treinador pede nas SUAS equipas; decide o coordenador/seccionista
--   3. Trigger `guard_request_decision` — o treinador não decide o seu pedido
--   4. Notificações: pedido novo -> quem decide; decisão -> quem pediu
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
-- O pedido é sempre de UM artigo para UM atleta: é assim que é entregue e é
-- assim que se decide (aprovar as meias da Ana e recusar o blusão do irmão
-- não pode obrigar a decidir os dois de uma vez).
--
-- Não há coluna `team_id`: a equipa lê-se do atleta. Guardá-la aqui seria um
-- segundo dono do mesmo dado — um atleta que muda de escalão passaria a ter o
-- pedido preso à equipa antiga.
create table if not exists equipment_requests (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references players(id) on delete cascade,
  -- Chave de EQUIPMENT_ARTICLES (constants.js) ou 'outro'.
  article       text not null,
  -- Etiqueta livre quando article = 'outro' (ex.: "joelheiras").
  article_other text,
  -- Tamanho pedido. Pré-preenchido a partir de player_sizes na app, mas
  -- editável: um pedido acontece muitas vezes porque o tamanho registado
  -- deixou de servir.
  size          text,
  quantity      int  not null default 1 check (quantity between 1 and 50),
  reason        text not null default 'novo'
                check (reason in ('novo','danificado','tamanho','perdido','outro')),
  notes         text,
  status        text not null default 'pendente'
                check (status in ('pendente','aprovado','entregue','recusado')),
  -- Resposta de quem decide (sobretudo para o 'recusado': uma recusa sem
  -- motivo volta como o mesmo pedido na semana seguinte).
  decision_note text,
  requested_by  uuid references auth.users(id) on delete set null,
  decided_by    uuid references auth.users(id) on delete set null,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists idx_eqreq_player  on equipment_requests (player_id);
create index if not exists idx_eqreq_status  on equipment_requests (status);
create index if not exists idx_eqreq_created on equipment_requests (created_at desc);

-- ---------------------------------------------------------------------
-- 2. Multi-tenant (org_id + isolamento por clube)
-- ---------------------------------------------------------------------
alter table equipment_requests add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table equipment_requests alter column org_id set default current_org_id();
create index if not exists idx_equipment_requests_org on equipment_requests (org_id);

alter table equipment_requests enable row level security;

drop policy if exists tenant_isolation on equipment_requests;
create policy tenant_isolation on equipment_requests as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 3. Políticas por papel
-- ---------------------------------------------------------------------
drop policy if exists "eqreq_read"   on equipment_requests;
drop policy if exists "eqreq_insert" on equipment_requests;
drop policy if exists "eqreq_update" on equipment_requests;
drop policy if exists "eqreq_delete" on equipment_requests;

-- Leitura: o treinador vê os pedidos das SUAS equipas; os papéis de âmbito de
-- clube veem todos. O ATLETA não vê nada disto — um pedido é uma conversa
-- entre o treinador e o clube, e mostrá-lo ao atleta cria a expectativa de
-- que o material está a caminho antes de alguém o ter decidido.
create policy "eqreq_read" on equipment_requests for select to authenticated
using (
  (app_role() = 'treinador'
    and player_id in (select id from players where team_id in (select trainer_team_ids())))
  or app_role() in ('coordenador','seccionista','direcao','leitura','fisioterapeuta','preparador')
);

-- Criação: o treinador só pede para atletas das suas equipas; coordenador e
-- seccionista pedem para qualquer atleta do clube (é quem trata do material).
create policy "eqreq_insert" on equipment_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and (
    app_role() in ('coordenador','seccionista')
    or (app_role() = 'treinador'
        and player_id in (select id from players where team_id in (select trainer_team_ids())))
  )
);

-- Alteração: quem decide (coordenador/seccionista) mexe em tudo; o treinador
-- só corrige o SEU pedido enquanto está pendente (tamanho errado, quantidade).
-- O estado em si fica fechado ao treinador pelo trigger abaixo.
create policy "eqreq_update" on equipment_requests for update to authenticated
using (
  app_role() in ('coordenador','seccionista')
  or (app_role() = 'treinador' and requested_by = auth.uid() and status = 'pendente')
)
with check (
  app_role() in ('coordenador','seccionista')
  or (app_role() = 'treinador' and requested_by = auth.uid())
);

-- Remoção: o treinador cancela o que pediu enquanto ninguém decidiu; depois
-- de decidido é histórico e só o coordenador/seccionista o apaga.
create policy "eqreq_delete" on equipment_requests for delete to authenticated
using (
  app_role() in ('coordenador','seccionista')
  or (app_role() = 'treinador' and requested_by = auth.uid() and status = 'pendente')
);

-- ---------------------------------------------------------------------
-- 4. O pedido não se aprova a si próprio
-- ---------------------------------------------------------------------
-- A política de UPDATE deixa o treinador corrigir o pedido enquanto está
-- pendente — e isso, sozinho, deixava-o também escrever status='aprovado'.
-- Quem decide o que o clube compra é quem paga o material.
create or replace function public.guard_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     and coalesce(app_role(), '') not in ('coordenador','seccionista') then
    raise exception 'Só o coordenador ou o seccionista podem decidir um pedido de equipamento.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_request_decision on equipment_requests;
create trigger trg_guard_request_decision before update on equipment_requests
  for each row execute function public.guard_request_decision();

-- ---------------------------------------------------------------------
-- 5. Etiqueta legível de um artigo
-- ---------------------------------------------------------------------
-- Manter alinhada com EQUIPMENT_ARTICLES em src/constants.js. Só serve para
-- escrever o texto das notificações — a app desenha sempre a partir das suas
-- próprias etiquetas.
create or replace function public.equipment_article_label(p_article text, p_other text)
returns text
language sql
immutable
as $$
  select case p_article
    when 'camisola'        then 'Camisola'
    when 'camisola_alt'    then 'Camisola alternativa'
    when 'calcoes'         then 'Calções'
    when 'meias'           then 'Meias'
    when 'casaco_treino'   then 'Casaco fato de treino'
    when 'calca_treino'    then 'Calça fato de treino'
    when 'mochila'         then 'Mochila'
    when 'blusao'          then 'Blusão'
    when 'camisola_treino' then 'Camisola de treino'
    when 'outro'           then coalesce(nullif(trim(p_other), ''), 'Outro artigo')
    else p_article
  end;
$$;

-- ---------------------------------------------------------------------
-- 6. Notificações
-- ---------------------------------------------------------------------
-- A. Pedido novo -> quem decide (coordenador e seccionista).
--    Sem isto o pedido ficava a marinar num separador que o coordenador só
--    abre quando se lembra — que é exatamente o problema das mensagens de
--    telemóvel que isto vem substituir.
create or replace function notify_equipment_request_created()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_player text;
  v_label  text;
  v_role   text;
begin
  select name into v_player from players where id = NEW.player_id;
  select role into v_role  from profiles where id = NEW.requested_by;
  v_label := equipment_article_label(NEW.article, NEW.article_other);

  -- Uma notificação POR PAPEL que decide. O inbox é filtrado por
  -- `target_role = app_role()`: uma só linha dirigida ao coordenador nunca
  -- chegaria ao seccionista, que é muitas vezes quem trata do material.
  insert into notifications (type, title, body, data, target_role, org_id)
  select
    'equipment_request',
    'Novo pedido de equipamento',
    coalesce(v_player, 'Atleta') || ' — ' || v_label
      || coalesce(' (tam. ' || NEW.size || ')', '')
      || case when NEW.quantity > 1 then ' ×' || NEW.quantity else '' end || '.',
    jsonb_build_object('request_id', NEW.id, 'player_id', NEW.player_id, 'article', NEW.article),
    r,
    NEW.org_id
  from unnest(array['coordenador','seccionista']) as r
  -- Quem pediu não precisa de ser avisado do seu próprio pedido.
  where r is distinct from coalesce(v_role, '');

  return NEW;
end;
$$;

drop trigger if exists trg_notify_equipment_request_created on equipment_requests;
create trigger trg_notify_equipment_request_created
  after insert on equipment_requests
  for each row execute function notify_equipment_request_created();

-- B. Decisão -> quem pediu.
--    Um pedido a que ninguém responde ensina o treinador a não voltar a pedir.
create or replace function notify_equipment_request_decided()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_player text;
  v_label  text;
  v_title  text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.requested_by is null then return NEW; end if;
  -- Quem decidiu o seu próprio pedido já sabe o que decidiu.
  if NEW.requested_by = NEW.decided_by then return NEW; end if;

  select name into v_player from players where id = NEW.player_id;
  v_label := equipment_article_label(NEW.article, NEW.article_other);
  v_title := case NEW.status
    when 'aprovado' then 'Pedido de equipamento aprovado'
    when 'entregue' then 'Equipamento entregue'
    when 'recusado' then 'Pedido de equipamento recusado'
    else 'Pedido de equipamento reaberto'
  end;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'equipment_request_decided',
    v_title,
    coalesce(v_player, 'Atleta') || ' — ' || v_label
      || coalesce('. ' || nullif(trim(NEW.decision_note), ''), '.'),
    jsonb_build_object('request_id', NEW.id, 'player_id', NEW.player_id, 'status', NEW.status),
    NEW.requested_by,
    NEW.org_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_equipment_request_decided on equipment_requests;
create trigger trg_notify_equipment_request_decided
  after update on equipment_requests
  for each row execute function notify_equipment_request_decided();
