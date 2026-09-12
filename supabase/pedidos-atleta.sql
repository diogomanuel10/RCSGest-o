-- =====================================================================
-- Rumia — A atleta pede o seu equipamento (e quem decide muda)
-- =====================================================================
-- Corre DEPOIS de pedidos-equipamento.sql e artigos-configuraveis.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: o pedido nascia sempre no treinador. Mas quem sabe que a camisola
-- de treino já não serve é quem a veste — e nos escalões com conta ligada ao
-- portal essa pessoa já está na app. O caminho "digo ao treinador, o
-- treinador lança" é uma mensagem de telemóvel a mais no meio, com a mesma
-- perda que o módulo veio resolver.
--
-- O que muda:
--   1. `settings.athlete_requests_enabled` — o clube liga/desliga isto
--   2. RLS: a atleta cria e vê os SEUS pedidos
--   3. Quem VÊ o quadro todo e quem DECIDE passa a ser coordenador + direção
--      (sai o seccionista, o leitura, a fisio e o preparador)
--   4. `equipment_article_label` deixa de ter os artigos escritos à mão
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Interruptor do clube
-- ---------------------------------------------------------------------
-- Desligado seria mais seguro, mas um interruptor que ninguém sabe que
-- existe é uma funcionalidade que não existe. Fica LIGADO: o que trava o
-- volume é a lista de artigos que a atleta pode pedir (`requestable` em
-- settings.equipment_articles), que é escolha artigo a artigo e não um
-- tudo-ou-nada.
alter table settings add column if not exists athlete_requests_enabled boolean not null default true;

-- ---------------------------------------------------------------------
-- 2. Quem vê
-- ---------------------------------------------------------------------
drop policy if exists "eqreq_read"   on equipment_requests;
drop policy if exists "eqreq_insert" on equipment_requests;
drop policy if exists "eqreq_update" on equipment_requests;
drop policy if exists "eqreq_delete" on equipment_requests;

-- O quadro TODO do clube é de quem paga o material: coordenador e direção.
-- Saíram o seccionista, o leitura, a fisio e o preparador — nenhum deles tem
-- nada a fazer com um pedido de equipamento, e uma lista que toda a gente vê
-- deixa de ser um sítio onde se escreve "a Ana rasgou as meias".
--
-- Ao lado disso, duas leituras próprias e recortadas:
--   • o treinador vê os das SUAS equipas (é ele que pede por quem não tem
--     conta ligada, e um pedido que quem pediu não pode acompanhar é a
--     mensagem de telemóvel outra vez);
--   • a atleta vê os SEUS. A regra antiga era que o atleta não via nada
--     disto, "porque criava a expectativa de que o material está a caminho
--     antes de alguém o ter decidido" — isso vale para o pedido que OUTRO
--     fez por ela, não para o que ela própria escreveu. Quem pede sabe que
--     pediu; o que lhe faltava era saber em que ficou.
create policy "eqreq_read" on equipment_requests for select to authenticated
using (
  app_role() in ('coordenador','direcao')
  or (app_role() = 'treinador'
      and player_id in (select id from players where team_id in (select trainer_team_ids())))
  or (app_role() = 'atleta'
      and player_id in (select id from players where user_id = auth.uid()))
);

-- ---------------------------------------------------------------------
-- 3. Quem cria
-- ---------------------------------------------------------------------
-- A atleta só pede para a SUA ficha, e só se o clube tiver isto ligado. O
-- `player_id in (... user_id = auth.uid())` é o mesmo vínculo do portal: uma
-- conta liga-se a uma ficha e é essa, e não a que vier no pedido.
create policy "eqreq_insert" on equipment_requests for insert to authenticated
with check (
  requested_by = auth.uid()
  and (
    app_role() in ('coordenador','direcao')
    or (app_role() = 'treinador'
        and player_id in (select id from players where team_id in (select trainer_team_ids())))
    or (app_role() = 'atleta'
        and status = 'pendente'
        and player_id in (select id from players where user_id = auth.uid())
        and coalesce((select athlete_requests_enabled from settings limit 1), true))
  )
);

-- ---------------------------------------------------------------------
-- 4. Quem altera e quem cancela
-- ---------------------------------------------------------------------
-- Quem pediu corrige o SEU pedido enquanto ninguém lhe tocou — o tamanho
-- errado, a quantidade. Vale para o treinador e para a atleta, pela mesma
-- razão. O ESTADO fica fechado aos dois pelo trigger abaixo: a política de
-- UPDATE, sozinha, deixava-os escrever `status='aprovado'`.
create policy "eqreq_update" on equipment_requests for update to authenticated
using (
  app_role() in ('coordenador','direcao')
  or (app_role() in ('treinador','atleta') and requested_by = auth.uid() and status = 'pendente')
)
with check (
  app_role() in ('coordenador','direcao')
  or (app_role() in ('treinador','atleta') and requested_by = auth.uid())
);

-- Cancelar o que se pediu, enquanto ninguém decidiu. Depois de decidido é
-- histórico — e o histórico não se apaga para desfazer uma recusa.
create policy "eqreq_delete" on equipment_requests for delete to authenticated
using (
  app_role() in ('coordenador','direcao')
  or (app_role() in ('treinador','atleta') and requested_by = auth.uid() and status = 'pendente')
);

-- ---------------------------------------------------------------------
-- 5. Quem decide
-- ---------------------------------------------------------------------
-- Coordenador e direção. O seccionista sai: decidir um pedido é comprometer
-- verba, e isso ficou do lado de quem responde por ela.
create or replace function public.guard_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     and coalesce(app_role(), '') not in ('coordenador','direcao') then
    raise exception 'Só o coordenador ou a direção podem decidir um pedido de equipamento.';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. A etiqueta do artigo deixa de estar escrita à mão
-- ---------------------------------------------------------------------
-- Esta função escreve o texto das notificações. Tinha os nove artigos de
-- origem num CASE, por isso um artigo criado pelo clube nas Definições
-- chegava ao telemóvel como `joelheiras` em vez de "Joelheiras" — e com a
-- atleta a receber estas notificações isso passa a ser lido por quem não faz
-- ideia do que é uma chave. Lê agora a lista do clube, com o CASE de origem
-- como recurso para quem ainda não configurou nada.
create or replace function public.equipment_article_label(p_article text, p_other text)
returns text
language sql
stable
as $$
  select coalesce(
    -- 1. "Outro artigo" traz a etiqueta escrita no próprio pedido.
    case when p_article = 'outro'
         then nullif(trim(coalesce(p_other, '')), '') end,
    -- 2. A lista configurada pelo clube (inclui os artigos desativados: um
    --    pedido de dezembro tem de continuar legível depois de o artigo sair
    --    de circulação).
    (select a.value ->> 'label'
       from settings s,
            lateral jsonb_array_elements(coalesce(s.equipment_articles, '[]'::jsonb)) a
      where a.value ->> 'key' = p_article
        and nullif(trim(coalesce(a.value ->> 'label', '')), '') is not null
      limit 1),
    -- 3. A lista de origem, para os clubes que nunca configuraram artigos.
    case p_article
      when 'camisola'        then 'Camisola'
      when 'camisola_alt'    then 'Camisola alternativa'
      when 'calcoes'         then 'Calções'
      when 'meias'           then 'Meias'
      when 'casaco_treino'   then 'Casaco fato de treino'
      when 'calca_treino'    then 'Calça fato de treino'
      when 'mochila'         then 'Mochila'
      when 'blusao'          then 'Blusão'
      when 'camisola_treino' then 'Camisola de treino'
      when 'outro'           then 'Outro artigo'
    end,
    -- 4. Último recurso: a própria chave. Feio, mas nunca nulo.
    p_article
  );
$$;

-- ---------------------------------------------------------------------
-- 7. O aviso de pedido novo vai a quem decide
-- ---------------------------------------------------------------------
-- Era `coordenador` + `seccionista`; segue agora quem decide. Sem isto, o
-- seccionista continuava a receber avisos de uma lista que já não pode abrir
-- e a direção não recebia nenhum.
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

  insert into notifications (type, title, body, data, target_role, org_id)
  select
    'equipment_request',
    case when v_role = 'atleta'
         then 'Pedido de equipamento de uma atleta'
         else 'Novo pedido de equipamento' end,
    coalesce(v_player, 'Atleta') || ' — ' || v_label
      || coalesce(' (tam. ' || NEW.size || ')', '')
      || case when NEW.quantity > 1 then ' ×' || NEW.quantity else '' end || '.',
    jsonb_build_object('request_id', NEW.id, 'player_id', NEW.player_id, 'article', NEW.article),
    r,
    NEW.org_id
  from unnest(array['coordenador','direcao']) as r
  -- Quem pediu não precisa de ser avisado do seu próprio pedido.
  where r is distinct from coalesce(v_role, '');

  return NEW;
end;
$$;
