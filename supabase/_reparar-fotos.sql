-- =====================================================================
-- Rumia — Reparar o envio de fotos de artigos
-- =====================================================================
-- Sintoma: ao escolher uma foto num artigo, a app diz
--   "Sem permissão para esta operação. Confirma que tens sessão iniciada."
--
-- Essa mensagem sai quando o erro do servidor fala em row-level security —
-- ou seja, o bucket EXISTE e é a política que está a recusar.
--
-- Corre a PARTE 1 e olha para o resultado. Depois corre a PARTE 2, que
-- repara. Ambas são seguras de repetir.
-- =====================================================================


-- =====================================================================
-- PARTE 1 — DIAGNÓSTICO (corre e lê o resultado)
-- =====================================================================
-- Nota: no SQL Editor tu és o `postgres`, não a tua conta da app, por isso
-- `auth.uid()` aqui é nulo — daí olharmos para o teu perfil pelo email em
-- vez de chamar `app_role()`.

select 'bucket existe' as verificacao,
       coalesce((select public::text from storage.buckets where id = 'equipment-photos'),
                'NÃO EXISTE — falta correr fotos-artigos.sql') as resultado
union all
select 'políticas no bucket (esperado: 4)',
       coalesce((select count(*)::text from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname like 'equip_photos%'), '0')
union all
select 'quais',
       coalesce((select string_agg(policyname || ' [' || cmd || ']', ', ' order by policyname)
                   from pg_policies
                  where schemaname = 'storage' and tablename = 'objects'
                    and policyname like 'equip_photos%'), '—')
union all
-- ↓↓↓ TROCA o email pelo da tua conta ↓↓↓
select 'o teu papel',
       coalesce((select role from public.profiles
                  where id = (select id from auth.users where email = 'diomanuel10@gmail.com')),
                'perfil não encontrado')
union all
select 'o teu clube (org_id)',
       coalesce((select org_id::text from public.profiles
                  where id = (select id from auth.users where email = 'diomanuel10@gmail.com')),
                'SEM CLUBE — é isto que falha a política');


-- =====================================================================
-- PARTE 2 — REPARAÇÃO
-- =====================================================================
-- Duas coisas em falta na versão anterior:
--
--   1. Não havia política de SELECT. O `public = true` só abre o endereço
--      de DESCARGA; tudo o que passe pela API autenticada continua sujeito
--      ao RLS de `storage.objects`.
--   2. A app enviava com `upsert`, o que obriga o Storage a exigir também
--      UPDATE e a verificar se o ficheiro já existe. Isso já foi corrigido
--      do lado da app (o nome leva um sufixo aleatório, por isso o objeto é
--      sempre novo) — mas as políticas ficam completas à mesma.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipment-photos', 'equipment-photos', true, 2097152,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = true,
  file_size_limit    = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "equip_photos_read"   on storage.objects;
drop policy if exists "equip_photos_write"  on storage.objects;
drop policy if exists "equip_photos_update" on storage.objects;
drop policy if exists "equip_photos_delete" on storage.objects;

create policy "equip_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'equipment-photos');

create policy "equip_photos_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'equipment-photos'
    and app_role() = 'coordenador'
    and (storage.foldername(name))[1] = current_org_id()::text
  );

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
-- SE AINDA ASSIM FALHAR
-- =====================================================================
-- A condição que sobra é a da pasta: a app grava em `<org_id>/ficheiro.jpg`
-- e a política exige que essa pasta seja o teu clube. Para confirmar que é
-- essa a que recusa, corre isto — tira a verificação da pasta e deixa só o
-- papel. Se passar a funcionar, o problema é o `org_id`, e diz-me.
--
-- drop policy if exists "equip_photos_write" on storage.objects;
-- create policy "equip_photos_write" on storage.objects for insert to authenticated
--   with check (bucket_id = 'equipment-photos' and app_role() = 'coordenador');
