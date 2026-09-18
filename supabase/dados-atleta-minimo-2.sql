-- Rumia — dados-atleta.sql, versão curta (2 de 2): a porta para a ficha.
-- Cola isto DEPOIS de dados-atleta-minimo.sql, numa execução à parte: vai
-- separado porque é a parte que estava a ser cortada a meio na cópia, e uma
-- função cortada dá "unterminated dollar-quoted string".
-- O porquê está em supabase/dados-atleta.sql.

create or replace function update_my_player_data(
  p_birth_date date default null,
  p_photo_path text default null
)
returns players
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player players;
begin
  select * into v_player from players where user_id = auth.uid() limit 1;
  if v_player.id is null then
    raise exception 'A tua conta não está ligada a nenhuma ficha de atleta.';
  end if;

  if p_birth_date is not null then
    if v_player.birth_date is not null then
      raise exception 'A data de nascimento já está preenchida. Pede ao clube para a corrigir.';
    end if;
    if p_birth_date > current_date or p_birth_date < date '1920-01-01' then
      raise exception 'Data de nascimento inválida.';
    end if;
  end if;

  update players
     set birth_date = coalesce(p_birth_date, birth_date),
         photo_path = coalesce(p_photo_path, photo_path)
   where id = v_player.id
   returning * into v_player;

  return v_player;
end;
$$;

grant execute on function update_my_player_data(date, text) to authenticated;

-- Confirmação: o esperado é ok · ok · 3 de 3 · 2 de 2 · 2 de 2 · 4 de 4.
select
  case when exists (select 1 from information_schema.columns
        where table_name = 'players' and column_name = 'photo_path')
       then 'ok' else 'FALTA' end as coluna,
  case when exists (select 1 from storage.buckets where id = 'player-photos')
       then 'ok' else 'FALTA' end as bucket,
  (select count(*) from pg_proc where proname in
    ('is_my_player_folder','can_write_player_file','update_my_player_data'))
    || ' de 3' as funcoes,
  (select count(*) from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname like 'player_photos%')
    || ' de 2' as politicas_fotos,
  (select count(*) from pg_policies where schemaname = 'storage'
    and tablename = 'objects' and policyname like 'player_docs%')
    || ' de 2' as politicas_docs,
  (select count(*) from pg_policies where tablename = 'player_documents')
    || ' de 4' as politicas_ficheiros;
