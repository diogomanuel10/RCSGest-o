-- =====================================================================
-- Rumia — TUDO O QUE FALTA CORRER (gerado a 2026-09-12)
-- =====================================================================
-- Cola isto INTEIRO no SQL Editor do Supabase e corre uma vez.
--
-- São três migrações, nesta ordem (a ordem importa: a segunda e a terceira
-- dependem das colunas e do vocabulário que a primeira cria):
--
--   1. artigos-configuraveis.sql  o clube define os seus artigos e tamanhos
--   2. pedidos-atleta.sql         a atleta pede do portal; decide coord./direção
--   3. fotos-artigos.sql          bucket com a foto de cada artigo
--
-- Todas são seguras de re-executar: se já correste alguma, correr outra vez
-- não desfaz nada nem duplica seja o que for.
--
-- O SQL Editor corre isto como um bloco só. Se alguma linha falhar, NADA é
-- aplicado — ficas no estado anterior, sem meio caminho andado.
--
-- Depois de correr, confirma com a consulta que está no FIM do ficheiro.
-- =====================================================================



-- ####################################################################
-- ##  artigos-configuraveis.sql
-- ####################################################################

-- =====================================================================
-- Rumia — Artigos de equipamento e tamanhos configuráveis pelo clube
-- =====================================================================
-- Corre DEPOIS de schema.sql e multitenant.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: a lista de artigos vivia cravada no código (EQUIPMENT_ARTICLES em
-- constants.js) e os tamanhos eram XS–XXL para todos. Um clube que dá
-- joelheiras, ou que compra camisolas em tamanhos de criança (6/8/10/12),
-- não tinha onde o dizer — e o que a app não sabe registar acaba registado
-- numa folha de Excel à parte, que é onde as encomendas se perdem.
--
-- O obstáculo era o formato: `player_sizes` tinha UMA COLUNA POR ARTIGO, por
-- isso criar um artigo novo exigia um ALTER TABLE. Um coordenador não corre
-- ALTER TABLE. Os tamanhos passam a viver todos numa só coluna `sizes`
-- (jsonb), com a chave do artigo como chave do objeto.
--
-- O que faz:
--   1. Acrescenta `settings.equipment_articles jsonb` (a lista do clube)
--   2. Acrescenta `player_sizes.sizes jsonb`
--   3. Copia para lá o que já estava nas 9 colunas fixas
--   4. NÃO apaga as colunas antigas (ver nota no fim)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A lista de artigos do clube
-- ---------------------------------------------------------------------
-- Vazio = usar a lista por omissão do código (DEFAULT_EQUIPMENT_ARTICLES),
-- exatamente como `settings.positions`: um clube que não configura nada
-- continua a ver os nove artigos de sempre, sem seed nenhum.
--
-- Cada entrada é { key, label, sizes: [], active }. A `key` é imutável — é
-- ela que está guardada em player_sizes.sizes e em equipment_requests.article.
-- `sizes` vazio = tamanho em texto livre (as meias). `active: false` tira o
-- artigo de circulação SEM apagar a definição: os pedidos e tamanhos já
-- registados continuam a saber traduzir a chave.
alter table settings add column if not exists equipment_articles jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- 2. Os tamanhos numa coluna só
-- ---------------------------------------------------------------------
-- Um objeto { "<chave do artigo>": "<tamanho>" }. A chave é a mesma que o
-- clube configura em settings.equipment_articles e a mesma que
-- equipment_requests.article já guardava — sem isso o pedido de um artigo e
-- o tamanho desse artigo na ficha ficavam a falar línguas diferentes.
--
-- É jsonb e não uma tabela chave/valor por atleta porque isto lê-se sempre
-- inteiro (a tabela das Encomendas é uma linha por atleta com todas as
-- colunas) e nunca se consulta por artigo isolado. Uma tabela filha só
-- acrescentava uma junção a cada leitura.
alter table player_sizes add column if not exists sizes jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 3. Trazer o que já está preenchido
-- ---------------------------------------------------------------------
-- Sem isto, a migração apagava do ecrã todos os tamanhos já registados: eles
-- continuavam na base de dados, mas a app deixava de os ir buscar ali. O
-- `||` mantém o que já estiver em `sizes` por cima do valor antigo (correr o
-- ficheiro duas vezes não desfaz uma edição feita entretanto).
update player_sizes set sizes =
  (
    jsonb_strip_nulls(jsonb_build_object(
      'camisola',        camisola,
      'camisola_alt',    camisola_alt,
      'calcoes',         calcoes,
      'meias',           meias,
      'casaco_treino',   casaco_treino,
      'calca_treino',    calca_treino,
      'mochila',         mochila,
      'blusao',          blusao,
      'camisola_treino', camisola_treino
    ))
    || coalesce(sizes, '{}'::jsonb)
  )
where sizes is null or sizes = '{}'::jsonb;

-- ---------------------------------------------------------------------
-- 4. As colunas antigas ficam
-- ---------------------------------------------------------------------
-- De propósito, e é a mesma regra do ano de nascimento quando entrou a data
-- completa: uma migração que apaga a coluna de origem no mesmo passo em que
-- copia os dados não tem volta se a cópia correr mal. Ficam como estão (a
-- app deixa de as escrever) e apagam-se num ficheiro à parte, depois de a
-- coluna nova ter uma época de uso.
--
-- Quando for altura, é isto:
--   alter table player_sizes
--     drop column camisola,      drop column camisola_alt,
--     drop column calcoes,       drop column meias,
--     drop column casaco_treino, drop column calca_treino,
--     drop column mochila,       drop column blusao,
--     drop column camisola_treino;


-- ####################################################################
-- ##  pedidos-atleta.sql
-- ####################################################################

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
        -- `settings` é UMA LINHA POR CLUBE desde o multitenant.sql. O
        -- `limit 1` funcionava por acidente (a política de isolamento já
        -- filtra o que este utilizador vê), mas escrever o clube à mão é o
        -- que torna isso verdade em vez de sorte.
        and coalesce(
          (select athlete_requests_enabled from settings where org_id = current_org_id()),
          true))
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
-- **Recebe o CLUBE**, e isto não é decoração. A função é chamada de dentro
-- dos triggers de notificação, que são `security definer` e por isso NÃO
-- passam pelo RLS: sem o `p_org`, o `select ... from settings` varria as
-- definições de TODOS os clubes e a etiqueta de um artigo podia vir da lista
-- de outro. É a mesma regra do `check_in_by_qr` — num contexto sem
-- `auth.uid()`, o isolamento entre clubes é escrito à mão ou não existe.
drop function if exists public.equipment_article_label(text, text);
create or replace function public.equipment_article_label(
  p_article text, p_other text, p_org uuid
)
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
      where s.org_id = p_org
        and a.value ->> 'key' = p_article
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
  v_label := equipment_article_label(NEW.article, NEW.article_other, NEW.org_id);

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

-- ---------------------------------------------------------------------
-- 8. O aviso de DECISÃO acompanha a assinatura nova
-- ---------------------------------------------------------------------
-- Obrigatório, não opcional: o ponto 6 apagou a versão de dois argumentos de
-- `equipment_article_label`, e esta função continuava a chamá-la. Sem isto,
-- decidir um pedido rebentava com "function does not exist" — e o INSERT da
-- notificação leva o UPDATE do pedido atrás.
--
-- Aproveita para dizer à atleta o que lhe respondeu o clube numa linguagem
-- que ela leia: o corpo é o mesmo, o título é que deixa de falar de
-- "pedido de equipamento" quando quem o recebe é quem o vestiu.
create or replace function notify_equipment_request_decided()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_player text;
  v_label  text;
  v_title  text;
  v_role   text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.requested_by is null then return NEW; end if;
  -- Quem decidiu o seu próprio pedido já sabe o que decidiu.
  if NEW.requested_by = NEW.decided_by then return NEW; end if;

  select name into v_player from players where id = NEW.player_id;
  select role into v_role  from profiles where id = NEW.requested_by;
  v_label := equipment_article_label(NEW.article, NEW.article_other, NEW.org_id);

  v_title := case NEW.status
    when 'aprovado' then case when v_role = 'atleta'
                              then 'O clube aprovou o teu pedido'
                              else 'Pedido de equipamento aprovado' end
    when 'entregue' then case when v_role = 'atleta'
                              then 'O teu material está pronto a levantar'
                              else 'Equipamento entregue' end
    when 'recusado' then case when v_role = 'atleta'
                              then 'O clube respondeu ao teu pedido'
                              else 'Pedido de equipamento recusado' end
    else 'Pedido de equipamento reaberto'
  end;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'equipment_request_decided',
    v_title,
    -- À atleta não se repete o nome dela: ela sabe de quem é o pedido.
    case when v_role = 'atleta' then '' else coalesce(v_player, 'Atleta') || ' — ' end
      || v_label
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


-- ####################################################################
-- ##  fotos-artigos.sql
-- ####################################################################

-- =====================================================================
-- Rumia — Foto de cada artigo de equipamento
-- =====================================================================
-- Corre DEPOIS de artigos-configuraveis.sql e pedidos-atleta.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: "Casaco Fato de Treino", "Blusão" e "Camisola de Treino" são três
-- etiquetas que só distinguem o material a quem já o conhece. Quem tem de
-- escolher entre elas no portal é uma atleta de doze anos que entrou em
-- setembro — e escolher o artigo errado gasta um pedido, uma decisão tua e
-- uma entrega, para depois recomeçar. A foto responde à pergunta que o nome
-- não responde: é ISTO que eu quero?
--
-- O que cria: o bucket `equipment-photos`. O CAMINHO do ficheiro vai em
-- `settings.equipment_articles[].photo`, ao lado do resto da definição do
-- artigo — é parte do artigo, não uma tabela nova.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O bucket
-- ---------------------------------------------------------------------
-- **Público de propósito**, ao contrário do `player-docs`. Duas razões:
--   • um URL assinado expira numa hora, e estas imagens desenham-se numa
--     lista que se re-desenha a cada notificação do store — seria assinar
--     nove endereços a toda a hora para mostrar uma camisola;
--   • quem mais precisa de as ver é a ATLETA, e a leitura do `player-docs`
--     está fechada ao coordenador/fisio/preparador. Abrir esse bucket a
--     toda a gente para caber aqui uma foto de um casaco seria pôr as
--     fotocópias do cartão de cidadão do lado errado da porta.
--
-- A foto de um casaco de treino de um clube não é dado pessoal: é a mesma
-- imagem que está no site da marca. Ainda assim o caminho leva o `org_id` e
-- um sufixo aleatório, para não ser adivinhável a partir do nome do artigo.
--
-- 2 MB por ficheiro é folgado — a app reduz para ~600px antes de enviar, e
-- o limite existe para o caso de alguém lá chegar por outro caminho.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-photos',
  'equipment-photos',
  true,
  2097152,  -- 2 MB por ficheiro
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public             = true,
  file_size_limit    = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- ---------------------------------------------------------------------
-- 2. Quem escreve
-- ---------------------------------------------------------------------
-- A leitura é pública (é o que `public = true` faz) — não há política de
-- SELECT a escrever. Escrever e apagar é só do coordenador, pela mesma razão
-- que o resto do editor de artigos: é estrutura do clube.
drop policy if exists "equip_photos_write"  on storage.objects;
drop policy if exists "equip_photos_update" on storage.objects;
drop policy if exists "equip_photos_delete" on storage.objects;

-- A primeira pasta do caminho é o `org_id`, e é verificada: sem isso um
-- coordenador podia escrever dentro da pasta de outro clube. A app só
-- escreve na sua, mas uma política que confia na app não é uma política.
create policy "equip_photos_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'equipment-photos'
    and app_role() = 'coordenador'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

-- O UPDATE é preciso para o `upsert` do cliente: substituir a foto de um
-- artigo sem ele é apagar-e-voltar-a-criar, e no meio disso o artigo fica
-- sem imagem se a segunda metade falhar.
create policy "equip_photos_update" on storage.objects for update to authenticated
  using      (bucket_id = 'equipment-photos' and app_role() = 'coordenador'
              and (storage.foldername(name))[1] = current_org_id()::text)
  with check (bucket_id = 'equipment-photos' and app_role() = 'coordenador'
              and (storage.foldername(name))[1] = current_org_id()::text);

create policy "equip_photos_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'equipment-photos'
    and app_role() = 'coordenador'
    and (storage.foldername(name))[1] = current_org_id()::text
  );


-- =====================================================================
-- VERIFICAÇÃO — corre isto a seguir, numa consulta à parte
-- =====================================================================
-- Devem sair cinco linhas, todas com ok = true. Qualquer false diz
-- exatamente o que ficou por aplicar.
--
-- select 'settings.equipment_articles' as o_que,
--        exists (select 1 from information_schema.columns
--                 where table_name='settings' and column_name='equipment_articles') as ok
-- union all
-- select 'settings.athlete_requests_enabled',
--        exists (select 1 from information_schema.columns
--                 where table_name='settings' and column_name='athlete_requests_enabled')
-- union all
-- select 'player_sizes.sizes',
--        exists (select 1 from information_schema.columns
--                 where table_name='player_sizes' and column_name='sizes')
-- union all
-- select 'bucket equipment-photos',
--        exists (select 1 from storage.buckets where id='equipment-photos')
-- union all
-- select 'tamanhos antigos copiados',
--        not exists (select 1 from player_sizes
--                     where sizes = '{}'::jsonb
--                       and coalesce(camisola, calcoes, meias, blusao) is not null);
