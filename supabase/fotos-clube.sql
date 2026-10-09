-- =====================================================================
-- Rumia — Álbum do clube (fotos de toda a gente → Drive do coordenador)
-- =====================================================================
-- Corre no SQL Editor do Supabase. Seguro de re-executar.
--
-- Num evento (a apresentação do clube, um torneio) as fotos são tiradas por
-- atletas, treinadores e pais — e têm de acabar todas no MESMO sítio, o Drive
-- do clube. O Google só deixa a app escrever no Drive de quem está ligado, por
-- isso as fotos fazem uma paragem pelo meio:
--
--   quem tira a foto  →  bucket `club-photos` (este ficheiro)
--   coordenador       →  "Enviar para o meu Drive" → apaga do bucket
--
-- O bucket é uma CAIXA DE PASSAGEM e não uma galeria: cada foto sai daqui
-- assim que chega ao Drive, para não encher o Storage do clube.
--
-- Caminho: `<org_id>/<ficheiro>`. A pasta de topo é o clube, e é isso que as
-- políticas leem — um clube nunca vê nem apaga as fotos de outro.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values (
  'club-photos',
  'club-photos',
  false,     -- privado: são caras de atletas, muitas delas menores
  52428800   -- 50 MB (um vídeo curto cabe)
)
on conflict (id) do nothing;

drop policy if exists "club_photos_insert" on storage.objects;
drop policy if exists "club_photos_read"   on storage.objects;
drop policy if exists "club_photos_delete" on storage.objects;

-- Enviar: qualquer membro do clube (atletas incluídos), só para a pasta do
-- SEU clube. Não há UPDATE: uma foto enviada não se substitui.
create policy "club_photos_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'club-photos'
    and (storage.foldername(name))[1] = public.current_org_id()::text
  );

-- Ver e apagar: só o coordenador, que é quem passa as fotos para o Drive.
-- Quem envia não precisa de ler o álbum — e um atleta não deve ver as fotos
-- que os outros tiraram antes de alguém as escolher.
create policy "club_photos_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'club-photos'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.app_role() = 'coordenador'
  );

create policy "club_photos_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'club-photos'
    and (storage.foldername(name))[1] = public.current_org_id()::text
    and public.app_role() = 'coordenador'
  );
