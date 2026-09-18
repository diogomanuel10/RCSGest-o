-- Rumia — dados-atleta.sql, versão curta (só os comandos)
-- O PORQUÊ de cada decisão está em supabase/dados-atleta.sql, que é o
-- ficheiro a ler e a manter. Este existe por uma razão prática: o ficheiro
-- comentado tem ~270 linhas e a cópia para o SQL Editor vinha a ser cortada a
-- meio (o erro era "unterminated dollar-quoted string", ou seja, o texto
-- acabava dentro de uma função). Isto cabe num ecrã. Seguro de repetir.

alter table players add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos','player-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function is_my_player_folder(p_name text)
returns boolean language sql stable security definer set search_path = public
as 'select exists (select 1 from players where user_id = auth.uid()
      and id::text = (storage.foldername(p_name))[1])';

create or replace function can_write_player_file(p_name text)
returns boolean language sql stable set search_path = public
as 'select is_my_player_folder(p_name) or (app_role() in
      (''coordenador'',''direcao'',''seccionista'',''treinador'')
      and exists (select 1 from players p
        where p.id::text = (storage.foldername(p_name))[1]))';

grant execute on function is_my_player_folder(text) to authenticated;
grant execute on function can_write_player_file(text) to authenticated;

drop policy if exists "player_photos_read"   on storage.objects;
drop policy if exists "player_photos_write"  on storage.objects;
drop policy if exists "player_photos_update" on storage.objects;
drop policy if exists "player_photos_delete" on storage.objects;

create policy "player_photos_read" on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and exists
    (select 1 from players p where p.id::text = (storage.foldername(name))[1]));

create policy "player_photos_write" on storage.objects for all to authenticated
  using      (bucket_id = 'player-photos' and can_write_player_file(name))
  with check (bucket_id = 'player-photos' and can_write_player_file(name));

drop policy if exists "pdocs_read"        on player_documents;
drop policy if exists "pdocs_write"       on player_documents;
drop policy if exists "pdocs_mine_insert" on player_documents;
drop policy if exists "pdocs_mine_delete" on player_documents;

create policy "pdocs_read" on player_documents for select to authenticated
  using (app_role() in ('coordenador','fisioterapeuta','preparador')
     or player_id in (select id from players where user_id = auth.uid()));

create policy "pdocs_write" on player_documents for all to authenticated
  using      (app_role() in ('coordenador','fisioterapeuta','preparador'))
  with check (app_role() in ('coordenador','fisioterapeuta','preparador'));

create policy "pdocs_mine_insert" on player_documents for insert to authenticated
  with check (doc_type = 'cc'
    and player_id in (select id from players where user_id = auth.uid()));

create policy "pdocs_mine_delete" on player_documents for delete to authenticated
  using (doc_type = 'cc'
    and player_id in (select id from players where user_id = auth.uid()));

drop policy if exists "player_docs_read"   on storage.objects;
drop policy if exists "player_docs_write"  on storage.objects;
drop policy if exists "player_docs_delete" on storage.objects;

create policy "player_docs_read" on storage.objects for select to authenticated
  using (bucket_id = 'player-docs' and (
    app_role() in ('coordenador','fisioterapeuta','preparador')
    or is_my_player_folder(name)));

create policy "player_docs_write" on storage.objects for all to authenticated
  using (bucket_id = 'player-docs' and (
    app_role() in ('coordenador','fisioterapeuta','preparador')
    or (is_my_player_folder(name) and (storage.foldername(name))[2] = 'cc')))
  with check (bucket_id = 'player-docs' and (
    app_role() in ('coordenador','fisioterapeuta','preparador')
    or (is_my_player_folder(name) and (storage.foldername(name))[2] = 'cc')));
