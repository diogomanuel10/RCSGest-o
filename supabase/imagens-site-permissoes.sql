-- =====================================================================
-- Rumia — Corrige o envio de imagens do site e das fotos dos artigos
-- =====================================================================
-- Correr no SQL Editor se já correste `site-conteudo.sql` (ou
-- `fotos-artigos.sql`) e carregar uma foto dá "Sem permissão para esta
-- operação". É seguro re-executar. As duas migrações já trazem isto para
-- quem as correr a partir de agora.
--
-- Porquê: os buckets `site-media` e `equipment-photos` são públicos, mas
-- "público" só abre o ENDEREÇO do ficheiro — a linha em `storage.objects`
-- continua a passar pelo RLS. O Storage lê a linha que acabou de escrever (e
-- a que vai apagar), e sem política de leitura o envio era recusado. A
-- leitura fica-se pela pasta do próprio clube.
-- =====================================================================

drop policy if exists "site_media_read" on storage.objects;
create policy "site_media_read" on storage.objects for select to authenticated
  using (bucket_id = 'site-media' and (storage.foldername(name))[1] = current_org_id()::text);

drop policy if exists "equip_photos_read" on storage.objects;
create policy "equip_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'equipment-photos' and (storage.foldername(name))[1] = current_org_id()::text);
