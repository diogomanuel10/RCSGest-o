-- =====================================================================
-- Rumia — A ficha do atleta completa-se do lado do atleta
-- =====================================================================
-- Corre DEPOIS de schema.sql, multitenant.sql e aniversarios.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: três dados faltam em quase todas as fichas — a FOTOGRAFIA, a DATA
-- DE NASCIMENTO e a FOTOCÓPIA DO CC. São os três que o clube precisa de ter
-- para inscrever uma atleta na federação, e os três que o coordenador não
-- consegue preencher sozinho: a foto está no telemóvel da família, o dia do
-- aniversário está no cartão dela e a fotocópia é um ficheiro que alguém tem
-- de digitalizar. Pedi-los pessoa a pessoa, por mensagem, é o trabalho que
-- nunca acaba — e as fichas ficam a meio durante a época inteira.
--
-- O que muda: quem tem conta ligada à ficha passa a poder preencher os três
-- do PORTAL, e o portal insiste (um cartão fixo no topo) enquanto faltar
-- algum. O clube continua a poder preencher tudo pela ficha do atleta, como
-- até aqui.
--
--   1. `players.photo_path`  — a foto de perfil (caminho no Storage)
--   2. bucket `player-photos` — privado, ao contrário do dos artigos
--   3. o atleta lê e escreve a SUA fotocópia do CC (`player_documents`)
--   4. RPC `update_my_player_data` — a única porta para o atleta escrever
--      na sua ficha (nada de política de UPDATE em `players`)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A foto de perfil
-- ---------------------------------------------------------------------
-- Guarda-se o CAMINHO e não a imagem: é a mesma decisão das fotos dos
-- artigos de equipamento. Uma data URL por atleta seriam megabytes lidos em
-- cada `loadAll()`, por toda a gente e em cada arranque — num plantel de 120
-- isso é a app a demorar a abrir para mostrar 38 píxeis de cara.
alter table players add column if not exists photo_path text;

-- ---------------------------------------------------------------------
-- 2. O bucket
-- ---------------------------------------------------------------------
-- PRIVADO, ao contrário do `equipment-photos`. A foto de um casaco de treino
-- não é dado pessoal; a cara de uma atleta de catorze anos é — e um bucket
-- público é um endereço que, uma vez descoberto, não tem dono nem expira.
-- O custo é conhecido e aceita-se: os endereços têm de ser assinados a cada
-- utilização (ver `photoUrls` no store.js, que os pede em lote e os guarda em
-- memória enquanto forem válidos).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos',
  'player-photos',
  false,
  5242880,  -- 5 MB: a app reduz a imagem antes de subir, isto é só o teto
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- A pasta de topo do caminho é o id da ficha (`<player_id>/<aleatório>.jpg`),
-- e é isso que as políticas leem. Esta função responde à pergunta "esta
-- pasta é a da ficha ligada a quem está a chamar?" — é `security definer`
-- de propósito: uma política de Storage que dependesse do RLS de `players`
-- ficava com duas camadas a decidir a mesma coisa, e a segunda é
-- configurável. O filtro por `auth.uid()` está escrito aqui dentro, que é a
-- mesma regra do `check_in_by_qr`.
create or replace function is_my_player_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from players
     where user_id = auth.uid()
       and id::text = (storage.foldername(p_name))[1]
  );
$$;

grant execute on function is_my_player_folder(text) to authenticated;

-- A foto é de quem a pode ver na app: o plantel é partilhado, e uma foto de
-- perfil que só o coordenador visse não seria uma foto de perfil. O
-- isolamento entre clubes vem do `exists` sobre `players` — essa consulta
-- passa pelo RLS de `players`, que já é RESTRICTIVE por `org_id`, por isso um
-- utilizador de outro clube não encontra a linha e a leitura é recusada mesmo
-- sabendo o caminho.
drop policy if exists "player_photos_read"   on storage.objects;
drop policy if exists "player_photos_write"  on storage.objects;
drop policy if exists "player_photos_update" on storage.objects;
drop policy if exists "player_photos_delete" on storage.objects;

create policy "player_photos_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'player-photos'
    and exists (
      select 1 from players p
       where p.id::text = (storage.foldername(name))[1]
    )
  );

-- Escrever é de quem edita fichas — e da PRÓPRIA, que é a razão de isto
-- existir. A atleta escreve só dentro da sua pasta.
create policy "player_photos_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-photos'
    and (
      is_my_player_folder(name)
      or (
        app_role() in ('coordenador','direcao','seccionista','treinador')
        and exists (select 1 from players p where p.id::text = (storage.foldername(name))[1])
      )
    )
  );

create policy "player_photos_update" on storage.objects for update to authenticated
  using (
    bucket_id = 'player-photos'
    and (
      is_my_player_folder(name)
      or (
        app_role() in ('coordenador','direcao','seccionista','treinador')
        and exists (select 1 from players p where p.id::text = (storage.foldername(name))[1])
      )
    )
  );

create policy "player_photos_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'player-photos'
    and (
      is_my_player_folder(name)
      or (
        app_role() in ('coordenador','direcao','seccionista','treinador')
        and exists (select 1 from players p where p.id::text = (storage.foldername(name))[1])
      )
    )
  );

-- ---------------------------------------------------------------------
-- 3. A fotocópia do CC, entregue pela própria
-- ---------------------------------------------------------------------
-- `player_documents` era leitura e escrita só do coordenador, da fisio e do
-- preparador. Passa a haver uma segunda porta, estreita: a atleta vê os SEUS
-- documentos e entrega o SEU cartão de cidadão.
--
-- Vê todos os seus (o exame médico e o seguro também são dela, e saber que o
-- exame caduca em março é exatamente o tipo de coisa que ela tem de saber),
-- mas só ESCREVE o `cc` — o exame médico e o seguro são documentos que o
-- clube emite ou recebe, e deixá-la substituí-los era deixá-la substituir a
-- prova de que está apta a jogar.
drop policy if exists "pdocs_read"   on player_documents;
drop policy if exists "pdocs_write"  on player_documents;
drop policy if exists "pdocs_mine_insert" on player_documents;
drop policy if exists "pdocs_mine_delete" on player_documents;

create policy "pdocs_read" on player_documents for select to authenticated
  using (
    app_role() in ('coordenador','fisioterapeuta','preparador')
    or player_id in (select id from players where user_id = auth.uid())
  );

create policy "pdocs_write" on player_documents for all to authenticated
  using  (app_role() in ('coordenador','fisioterapeuta','preparador'))
  with check (app_role() in ('coordenador','fisioterapeuta','preparador'));

create policy "pdocs_mine_insert" on player_documents for insert to authenticated
  with check (
    doc_type = 'cc'
    and player_id in (select id from players where user_id = auth.uid())
  );

-- Apagar o próprio CC é o que permite SUBSTITUIR uma fotocópia ilegível —
-- que é metade das fotocópias tiradas com um telemóvel. Sem isto, a primeira
-- tentativa ficava lá para sempre e a segunda nascia como um segundo
-- documento do mesmo tipo.
create policy "pdocs_mine_delete" on player_documents for delete to authenticated
  using (
    doc_type = 'cc'
    and player_id in (select id from players where user_id = auth.uid())
  );

-- As mesmas duas portas no Storage. O caminho é `<player_id>/<tipo>/<ts>.<ext>`,
-- por isso a pasta 2 é o tipo de documento: a atleta lê a sua pasta inteira e
-- escreve só dentro de `cc`.
drop policy if exists "player_docs_read"   on storage.objects;
drop policy if exists "player_docs_write"  on storage.objects;
drop policy if exists "player_docs_delete" on storage.objects;

create policy "player_docs_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'player-docs'
    and (
      app_role() in ('coordenador','fisioterapeuta','preparador')
      or is_my_player_folder(name)
    )
  );

create policy "player_docs_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-docs'
    and (
      app_role() in ('coordenador','fisioterapeuta','preparador')
      or (is_my_player_folder(name) and (storage.foldername(name))[2] = 'cc')
    )
  );

create policy "player_docs_delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'player-docs'
    and (
      app_role() in ('coordenador','fisioterapeuta','preparador')
      or (is_my_player_folder(name) and (storage.foldername(name))[2] = 'cc')
    )
  );

-- ---------------------------------------------------------------------
-- 4. A porta para a ficha
-- ---------------------------------------------------------------------
-- `players` NÃO ganha política de UPDATE para o atleta. Uma política de
-- update é por LINHA e não por coluna: abrir a linha dela para a foto abria-a
-- também para a equipa, o número, a posição e o `review_status` — ou seja,
-- uma atleta podia mudar-se de escalão ou declarar-se "mantém". É a mesma
-- razão por que as preferências do painel se escrevem pelo `set_painel_prefs`
-- e não por um update direto em `profiles`.
--
-- A data de nascimento só se PREENCHE, não se corrige: uma data já escrita
-- decide o escalão em que ela joga, e mudá-la é decisão do clube (na ficha,
-- onde se vê o que se está a gravar). Preencher o que está vazio não tira
-- nada a ninguém; reescrever o que lá está mudava o escalão pelas costas de
-- quem o definiu.
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

-- ---------------------------------------------------------------------
-- Confirmação
-- ---------------------------------------------------------------------
-- select count(*) filter (where photo_path is not null) as com_foto,
--        count(*) filter (where birth_date is not null) as com_data,
--        count(*) as total
--   from players where archived_at is null;
