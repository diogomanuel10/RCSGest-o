-- =====================================================================
-- Rumia — Conteúdos do site público (galeria, notícias, loja, plantéis,
-- história e logótipos dos patrocinadores)
-- =====================================================================
-- Correr DEPOIS de site-publico.sql. É seguro re-executar.
--
-- PORQUÊ:
-- O site da primeira versão era uma lista de jogos com contactos: dizia a
-- verdade, mas não dava vontade a ninguém de lá voltar nem de o partilhar. O
-- que um clube publica no Instagram — as fotos do jogo de sábado, a notícia da
-- subida de divisão, a camisola nova à venda, a história do clube — vivia
-- noutro lado, e o site ficava a parecer um horário de autocarro. Isto dá ao
-- site os conteúdos que o fazem ser o sítio do clube, escritos UMA vez na app.
--
-- O QUE MUDA NA REGRA "NENHUM ATLETA SAI DA APP":
-- Mantém-se como regra por omissão, com UMA exceção que é gesto explícito do
-- coordenador e escalão a escalão: o plantel de uma equipa só aparece se ela
-- estiver em `settings.site.roster_teams` (nasce vazio). E mesmo aí sai o
-- mínimo que um plantel é — número, posição e o nome ABREVIADO ("Ana S."),
-- cortado AQUI no servidor e não no browser: o nome completo nunca chega à
-- rede. Nem foto da ficha, nem data de nascimento, nem estatística.
--
-- As fotos da galeria são as que o clube ESCOLHE carregar (é o que já faz no
-- Instagram), não as fotos de perfil das fichas — essas continuam no bucket
-- privado `player-photos` e não são lidas por nada daqui.
--
-- ONDE VIVE CADA COISA:
--   site_photos      galeria (o carrossel), cada foto opcionalmente ligada a
--                    um jogo do calendário — é isso que lhe dá a legenda
--                    "vs Adversário · 3–1" sem a escrever à mão.
--   site_posts       notícias. `published` decide o que sai; um rascunho não.
--   site_products    loja do clube (merch). Preço, tamanhos e foto.
--   site_orders      pedidos feitos pelo site. Não há pagamento online: o
--                    pedido chega ao coordenador, que combina pagamento e
--                    entrega — é o que um clube consegue mesmo gerir.
--   settings.site    história, marcos, plantéis publicados e logótipos/links
--                    dos patrocinadores (jsonb: lê-se sempre inteiro).
--   bucket site-media  imagens públicas de tudo isto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bucket público das imagens do site
-- ---------------------------------------------------------------------
-- Público pela razão do `equipment-photos`: isto é para ser visto por toda a
-- gente, e um URL assinado expira. O caminho começa pelo `org_id`, verificado
-- na política de escrita.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public             = true,
  file_size_limit    = 3145728,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "site_media_write"  on storage.objects;
drop policy if exists "site_media_update" on storage.objects;
drop policy if exists "site_media_delete" on storage.objects;

create policy "site_media_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and app_role() = 'coordenador'
              and (storage.foldername(name))[1] = current_org_id()::text);
create policy "site_media_update" on storage.objects for update to authenticated
  using      (bucket_id = 'site-media' and app_role() = 'coordenador'
              and (storage.foldername(name))[1] = current_org_id()::text)
  with check (bucket_id = 'site-media' and app_role() = 'coordenador'
              and (storage.foldername(name))[1] = current_org_id()::text);
create policy "site_media_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and app_role() = 'coordenador'
         and (storage.foldername(name))[1] = current_org_id()::text);

-- ---------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------
create table if not exists site_photos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references organizations(id) on delete cascade default current_org_id(),
  path       text not null,
  caption    text,
  event_id   uuid references events(id) on delete set null,
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_site_photos_org on site_photos (org_id, sort, created_at desc);

create table if not exists site_posts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id) on delete cascade default current_org_id(),
  title        text not null check (length(btrim(title)) between 2 and 160),
  summary      text,
  body         text,
  cover_path   text,
  team_id      uuid references teams(id) on delete set null,
  published    boolean not null default false,
  published_at timestamptz,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_site_posts_org on site_posts (org_id, published_at desc);

-- A data de publicação carimba-se no servidor, na primeira vez que a notícia
-- sai: é ela que ordena a lista, e um rascunho editado durante uma semana não
-- pode aparecer como "publicado há uma semana".
create or replace function public.site_posts_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.published and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_site_posts_stamp on site_posts;
create trigger trg_site_posts_stamp before insert or update on site_posts
  for each row execute function public.site_posts_stamp();

create table if not exists site_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references organizations(id) on delete cascade default current_org_id(),
  name        text not null check (length(btrim(name)) between 2 and 120),
  description text,
  price       numeric(8,2) check (price is null or price >= 0),
  photo_path  text,
  sizes       text[] not null default '{}',
  active      boolean not null default true,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_site_products_org on site_products (org_id, sort);

create table if not exists site_orders (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid references organizations(id) on delete cascade default current_org_id(),
  product_id   uuid references site_products(id) on delete set null,
  -- Cópia do nome e do preço no momento do pedido: o produto pode mudar de
  -- preço ou sair da loja, e o pedido tem de continuar a dizer o que se pediu.
  product_name text not null,
  unit_price   numeric(8,2),
  size         text,
  quantity     int  not null default 1 check (quantity between 1 and 20),
  name         text not null,
  contact      text not null,
  message      text,
  status       text not null default 'nova' check (status in ('nova','tratada','cancelada')),
  created_at   timestamptz not null default now()
);
create index if not exists idx_site_orders_org on site_orders (org_id, created_at desc);

-- ---------------------------------------------------------------------
-- 3. RLS — isolamento por clube + só o coordenador
-- ---------------------------------------------------------------------
-- É o mesmo dono das Definições → Site: publicar é falar em nome do clube.
do $$
declare t text;
begin
  foreach t in array array['site_photos','site_posts','site_products','site_orders'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I as restrictive for all to authenticated
                      using (org_id = current_org_id()) with check (org_id = current_org_id())', t);
    execute format('drop policy if exists site_coord on %I', t);
    execute format('create policy site_coord on %I for all to authenticated
                      using (app_role() = ''coordenador'') with check (app_role() = ''coordenador'')', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Nome abreviado de um atleta: "Ana Sofia Martins" → "Ana M."
-- ---------------------------------------------------------------------
-- O corte é no SERVIDOR: o que não sai daqui não se pode mostrar por engano.
create or replace function public.site_short_name(p_name text)
returns text language sql immutable as $$
  select case
    when array_length(w, 1) is null then ''
    when array_length(w, 1) = 1 then w[1]
    else w[1] || ' ' || upper(left(w[array_length(w, 1)], 1)) || '.'
  end
  from (select regexp_split_to_array(btrim(coalesce(p_name, '')), '\s+') w) x;
$$;

-- ---------------------------------------------------------------------
-- 5. A página inteira, com os conteúdos novos
-- ---------------------------------------------------------------------
-- Substitui a versão de site-publico.sql. Continua a ser UMA chamada por
-- visita, e o `org_id` continua escrito à mão em todas as consultas.
create or replace function public.public_club_site(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org     uuid := site_org_id(p_slug);
  s         settings%rowtype;
  v_site    jsonb;
  v_sec     jsonb;
  v_hidden  uuid[];
  v_roster  uuid[];
  v_today   date := (now() at time zone 'Europe/Lisbon')::date;
  v_teams   jsonb;
  v_next    jsonb := '[]'::jsonb;
  v_res     jsonb := '[]'::jsonb;
  v_spons   jsonb := '[]'::jsonb;
  v_photos  jsonb := '[]'::jsonb;
  v_posts   jsonb := '[]'::jsonb;
  v_prods   jsonb := '[]'::jsonb;
begin
  if v_org is null then
    return null;
  end if;

  select * into s from settings where org_id = v_org limit 1;
  v_site := coalesce(s.site, '{}'::jsonb);
  v_sec  := coalesce(v_site->'sections', '{}'::jsonb);
  select coalesce(array_agg(x::uuid), '{}') into v_hidden
    from jsonb_array_elements_text(coalesce(v_site->'hidden_teams', '[]'::jsonb)) x
   where x ~ '^[0-9a-f-]{36}$';
  select coalesce(array_agg(x::uuid), '{}') into v_roster
    from jsonb_array_elements_text(coalesce(v_site->'roster_teams', '[]'::jsonb)) x
   where x ~ '^[0-9a-f-]{36}$';

  -- Equipas visíveis. Os treinadores (adultos, a cara pública do escalão)
  -- entram sempre; o plantel só nas equipas publicadas.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'escalao', t.escalao, 'gender', t.gender,
           'coaches', coalesce((
             select jsonb_agg(jsonb_build_object('name', c.name, 'role', tc.role)
                              order by (tc.role = 'principal') desc, c.name)
               from team_coaches tc
               join coaches c on c.id = tc.coach_id and c.org_id = v_org and c.archived_at is null
              where tc.team_id = t.id), '[]'::jsonb),
           'roster', case when coalesce((v_sec->>'equipas')::boolean, true) and t.id = any(v_roster) then
             coalesce((
               select jsonb_agg(jsonb_build_object(
                        'name', site_short_name(p.name), 'number', p.number, 'position', p.position)
                      order by nullif(regexp_replace(coalesce(p.number, ''), '\D', '', 'g'), '')::int nulls last, p.name)
                 from players p
                where p.team_id = t.id and p.org_id = v_org and p.archived_at is null), '[]'::jsonb)
             else null end)
         order by t.escalao, t.gender), '[]'::jsonb)
    into v_teams
    from teams t
   where t.org_id = v_org
     and t.archived_at is null
     and not (t.id = any(v_hidden));

  if coalesce((v_sec->>'agenda')::boolean, true) then
    select coalesce(jsonb_agg(g order by g->>'date', g->>'time'), '[]'::jsonb)
      into v_next
      from (
        select jsonb_build_object(
                 'id', e.id, 'date', e.date, 'time', e.time, 'team_id', e.team_id,
                 'opponent', e.opponent, 'location', e.location, 'title', e.title) g
          from events e
          join teams t on t.id = e.team_id and t.org_id = v_org
                      and t.archived_at is null and not (t.id = any(v_hidden))
         where e.org_id = v_org
           and e.type = 'jogo'
           and e.archived_at is null
           and e.date >= v_today
           and not exists (select 1 from game_results r where r.event_id = e.id)
         order by e.date, e.time nulls last
         limit 120
      ) q;
  end if;

  if coalesce((v_sec->>'resultados')::boolean, true) then
    select coalesce(jsonb_agg(g order by g->>'date' desc, g->>'time' desc), '[]'::jsonb)
      into v_res
      from (
        select jsonb_build_object(
                 'id', e.id, 'date', e.date, 'time', e.time, 'team_id', e.team_id,
                 'opponent', e.opponent, 'location', e.location, 'title', e.title,
                 'sets_for', r.sets_for, 'sets_against', r.sets_against,
                 'sets', coalesce((
                   select jsonb_agg(jsonb_build_array(gs.points_for, gs.points_against)
                                    order by gs.set_number)
                     from game_sets gs where gs.event_id = e.id), '[]'::jsonb)) g
          from events e
          join game_results r on r.event_id = e.id
          join teams t on t.id = e.team_id and t.org_id = v_org
                      and t.archived_at is null and not (t.id = any(v_hidden))
         where e.org_id = v_org
           and e.type = 'jogo'
           and e.archived_at is null
         order by e.date desc, e.time desc nulls last
         limit 200
      ) q;
  end if;

  -- Patrocinadores confirmados, com o logótipo e o site que o clube lhes
  -- associou nas Definições (settings.site.sponsors[<id>]).
  if coalesce((v_sec->>'patrocinadores')::boolean, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', sp.id, 'name', sp.name, 'tier', sp.tier, 'category', sp.category,
             'logo', v_site->'sponsors'->(sp.id::text)->>'logo',
             'url',  v_site->'sponsors'->(sp.id::text)->>'url')
           order by case sp.tier when 'ouro' then 1 when 'prata' then 2
                                 when 'bronze' then 3 else 4 end, sp.name), '[]'::jsonb)
      into v_spons
      from sponsors sp
     where sp.org_id = v_org
       and sp.status = 'confirmado'
       and sp.archived_at is null;
  end if;

  -- Galeria. A legenda de um jogo lê-se do próprio jogo — mas só se o jogo for
  -- de uma equipa visível; senão a foto sai sem ele.
  if coalesce((v_sec->>'galeria')::boolean, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', ph.id, 'path', ph.path, 'caption', ph.caption,
             'game', case when e.id is not null then jsonb_build_object(
               'date', e.date, 'team_id', e.team_id, 'opponent', e.opponent,
               'sets_for', r.sets_for, 'sets_against', r.sets_against) end)
           order by ph.sort, ph.created_at desc), '[]'::jsonb)
      into v_photos
      from (select * from site_photos where org_id = v_org
             order by sort, created_at desc limit 40) ph
      left join events e on e.id = ph.event_id and e.org_id = v_org and e.archived_at is null
                        and e.team_id is not null and not (e.team_id = any(v_hidden))
      left join game_results r on r.event_id = e.id;
  end if;

  if coalesce((v_sec->>'noticias')::boolean, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'title', p.title, 'summary', p.summary, 'body', p.body,
             'cover', p.cover_path, 'team_id',
             case when p.team_id = any(v_hidden) then null else p.team_id end,
             'published_at', p.published_at)
           order by p.published_at desc), '[]'::jsonb)
      into v_posts
      from (select * from site_posts where org_id = v_org and published
             order by published_at desc limit 30) p;
  end if;

  if coalesce((v_sec->>'loja')::boolean, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', pr.id, 'name', pr.name, 'description', pr.description,
             'price', pr.price, 'photo', pr.photo_path, 'sizes', to_jsonb(pr.sizes))
           order by pr.sort, pr.name), '[]'::jsonb)
      into v_prods
      from site_products pr
     where pr.org_id = v_org and pr.active;
  end if;

  return jsonb_build_object(
    'published', (select site_enabled from organizations where id = v_org),
    'club', jsonb_build_object(
      'name',    coalesce(nullif(s.club_name, 'Rumia'), (select name from organizations where id = v_org)),
      'motto',   s.motto,
      'logo',    s.logo,
      'primary', s.brand_primary,
      'accent',  s.brand_accent,
      'sport',   s.sport,
      'season',  s.season,
      'escaloes', s.escaloes),
    'about',     v_site->>'about',
    'history',   case when coalesce((v_sec->>'historia')::boolean, true) then jsonb_build_object(
                   'founded',    v_site->>'founded',
                   'text',       v_site->>'history',
                   'milestones', coalesce(v_site->'milestones', '[]'::jsonb)) end,
    'contacts',  jsonb_build_object(
      'email',     v_site->>'email',
      'phone',     v_site->>'phone',
      'address',   v_site->>'address',
      'instagram', v_site->>'instagram',
      'facebook',  v_site->>'facebook'),
    'sections',  jsonb_build_object(
      'agenda',         coalesce((v_sec->>'agenda')::boolean, true),
      'resultados',     coalesce((v_sec->>'resultados')::boolean, true),
      'patrocinadores', coalesce((v_sec->>'patrocinadores')::boolean, true),
      'inscricoes',     coalesce((v_sec->>'inscricoes')::boolean, true),
      'galeria',        coalesce((v_sec->>'galeria')::boolean, true),
      'noticias',       coalesce((v_sec->>'noticias')::boolean, true),
      'loja',           coalesce((v_sec->>'loja')::boolean, true),
      'equipas',        coalesce((v_sec->>'equipas')::boolean, true),
      'historia',       coalesce((v_sec->>'historia')::boolean, true)),
    'teams',     v_teams,
    'upcoming',  v_next,
    'results',   v_res,
    'sponsors',  v_spons,
    'photos',    v_photos,
    'posts',     v_posts,
    'products',  v_prods
  );
end;
$$;

revoke all on function public.public_club_site(text) from public;
grant execute on function public.public_club_site(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Pedido da loja pelo site
-- ---------------------------------------------------------------------
-- As mesmas defesas do `public_site_signup`: consentimento obrigatório, teto
-- de 20 pedidos por hora por clube, e o mesmo contacto+produto+tamanho no
-- mesmo dia não duplica (devolve sucesso: quem carregou duas vezes não fez
-- nada de errado). O produto tem de estar ATIVO e ser deste clube.
create or replace function public.public_shop_order(
  p_slug       text,
  p_product_id uuid,
  p_size       text,
  p_quantity   int,
  p_name       text,
  p_contact    text,
  p_message    text,
  p_consent    boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := site_org_id(p_slug);
  v_site    jsonb;
  v_prod    site_products%rowtype;
  v_name    text := trim(coalesce(p_name, ''));
  v_contact text := trim(coalesce(p_contact, ''));
  v_size    text := nullif(trim(coalesce(p_size, '')), '');
  v_msg     text := nullif(trim(coalesce(p_message, '')), '');
  v_qty     int  := coalesce(p_quantity, 1);
  v_id      uuid;
begin
  if v_org is null then
    raise exception 'Esta loja não está a receber pedidos.';
  end if;
  select coalesce(site, '{}'::jsonb) into v_site from settings where org_id = v_org limit 1;
  if not coalesce((v_site->'sections'->>'loja')::boolean, true) then
    raise exception 'Esta loja não está a receber pedidos.';
  end if;

  select * into v_prod from site_products
   where id = p_product_id and org_id = v_org and active;
  if v_prod.id is null then
    raise exception 'Este artigo já não está disponível.';
  end if;

  if not coalesce(p_consent, false) then
    raise exception 'É preciso autorizar o tratamento dos dados para o clube te poder contactar.';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Escreve o teu nome.';
  end if;
  if length(v_contact) < 6 or length(v_contact) > 160 then
    raise exception 'Deixa um telefone ou um email para o clube te contactar.';
  end if;
  if v_qty < 1 or v_qty > 20 then
    raise exception 'A quantidade tem de estar entre 1 e 20.';
  end if;
  if coalesce(array_length(v_prod.sizes, 1), 0) > 0 and (v_size is null or not (v_size = any(v_prod.sizes))) then
    raise exception 'Escolhe o tamanho.';
  end if;
  if coalesce(array_length(v_prod.sizes, 1), 0) = 0 then
    v_size := null;
  end if;
  if v_msg is not null then v_msg := left(v_msg, 1000); end if;

  if (select count(*) from site_orders
       where org_id = v_org and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'A loja recebeu muitos pedidos na última hora. Tenta de novo mais tarde.';
  end if;

  if exists (select 1 from site_orders
              where org_id = v_org and product_id = v_prod.id
                and coalesce(size, '') = coalesce(v_size, '')
                and lower(contact) = lower(v_contact)
                and created_at > now() - interval '1 day') then
    return true;
  end if;

  insert into site_orders (org_id, product_id, product_name, unit_price, size, quantity, name, contact, message)
  values (v_org, v_prod.id, v_prod.name, v_prod.price, v_size, v_qty, v_name, v_contact, v_msg)
  returning id into v_id;

  begin
    insert into notifications (type, title, body, data, target_role, org_id)
    values (
      'site_order',
      'Pedido na loja do site',
      v_name || ' — ' || v_qty || '× ' || v_prod.name || coalesce(' (' || v_size || ')', '') || '.',
      jsonb_build_object('order_id', v_id),
      'coordenador',
      v_org
    );
  exception when others then
    null;
  end;

  return true;
end;
$$;

revoke all on function public.public_shop_order(text, uuid, text, int, text, text, text, boolean) from public;
grant execute on function public.public_shop_order(text, uuid, text, int, text, text, text, boolean) to anon, authenticated;
