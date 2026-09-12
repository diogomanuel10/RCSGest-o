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

create policy "equip_photos_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment-photos' and app_role() = 'coordenador');

-- O UPDATE é preciso para o `upsert` do cliente: substituir a foto de um
-- artigo sem ele é apagar-e-voltar-a-criar, e no meio disso o artigo fica
-- sem imagem se a segunda metade falhar.
create policy "equip_photos_update" on storage.objects for update to authenticated
  using      (bucket_id = 'equipment-photos' and app_role() = 'coordenador')
  with check (bucket_id = 'equipment-photos' and app_role() = 'coordenador');

create policy "equip_photos_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'equipment-photos' and app_role() = 'coordenador');
