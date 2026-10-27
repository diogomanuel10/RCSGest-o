-- =====================================================================
-- Rumia — Site público do clube (<clube>.rumia.pt)
-- =====================================================================
-- Correr DEPOIS de schema.sql, multitenant.sql e resultados.sql. É seguro
-- re-executar.
--
-- PORQUÊ:
-- Os pais, os adeptos e os patrocinadores perguntam todas as semanas as
-- mesmas coisas — a que horas é o jogo, onde é, quanto ficou — e a resposta
-- já está na Rumia. Um site feito à parte (WordPress, Wix) obrigava a
-- escrever tudo duas vezes, e ao fim de um mês estava desatualizado. Aqui o
-- resultado de sábado aparece no site no momento em que o treinador o regista.
--
-- O QUE PODE SAIR DA APP:
-- Um site público é o contrário de tudo o resto: toda a gente vê, sem sessão,
-- para sempre e indexado pelo Google. A maior parte de quem joga são menores.
-- Por isso:
--   * NENHUM atleta sai daqui — nem nome, nem número, nem foto, nem
--     estatística. As funções abaixo não leem `players` de todo.
--   * Só JOGOS. Os treinos ficam de fora: dizer onde estão crianças a horas
--     fixas todas as semanas não é informação pública. Os "eventos" também:
--     uma reunião de direção não é para o site.
--   * As tabelas NÃO ganham política para o `anon`. Uma política é por LINHA e
--     não por coluna (a razão do `update_my_player_data`): abrir `events` ao
--     público entregava as colunas todas, de todos os tipos. O site lê por
--     RPCs `security definer` que devolvem só os campos públicos e filtram o
--     `org_id` à mão — a regra do `check_in_by_qr`.
--   * Publicar é um gesto EXPLÍCITO: `site_enabled` nasce falso, e um clube que
--     não o liga não tem página nenhuma (o endereço responde como se não
--     existisse).
--
-- ONDE VIVE CADA COISA:
--   organizations.slug / site_enabled  o endereço e o interruptor. Ficam no
--                                      clube e não nas definições porque o
--                                      endereço é ÚNICO entre clubes — só se
--                                      escreve pela RPC `set_club_site`
--                                      (`organizations` só é editável pelo
--                                      admin da plataforma).
--   settings.site (jsonb)              o resto: secções, escalões escondidos,
--                                      texto "sobre" e contactos. É jsonb pela
--                                      razão dos artigos de equipamento: lê-se
--                                      sempre inteiro e cada campo novo não
--                                      precisa de migração.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Endereço e interruptor
-- ---------------------------------------------------------------------
alter table organizations add column if not exists slug         text;
alter table organizations add column if not exists site_enabled boolean not null default false;

-- Um subdomínio: minúsculas, algarismos e hífen, 3 a 40 caracteres, sem
-- hífen nas pontas.
alter table organizations drop constraint if exists organizations_slug_check;
alter table organizations add constraint organizations_slug_check
  check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

create unique index if not exists idx_org_slug on organizations (slug) where slug is not null;

-- ---------------------------------------------------------------------
-- 2. O resto das definições do site
-- ---------------------------------------------------------------------
-- Forma (tudo opcional):
--   { "sections": { "agenda": true, "resultados": true,
--                   "patrocinadores": true, "inscricoes": true },
--     "hidden_teams": ["<team uuid>", ...],
--     "about": "...", "email": "...", "phone": "...", "address": "...",
--     "instagram": "...", "facebook": "..." }
-- Uma secção sem chave conta como ligada: o interruptor que decide se há site
-- é o `site_enabled`, e o coordenador vê as secções antes de o ligar.
alter table settings add column if not exists site jsonb not null default '{}'::jsonb;

-- De onde veio um prospeto. `site` marca os pedidos de inscrição do site
-- público — é por ela que se limita o volume (ver public_site_signup).
alter table prospects add column if not exists source text;

-- ---------------------------------------------------------------------
-- 3. O coordenador escolhe o endereço e liga/desliga o site
-- ---------------------------------------------------------------------
create or replace function public.set_club_site(p_slug text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid := current_org_id();
  v_slug text := nullif(lower(trim(coalesce(p_slug, ''))), '');
begin
  if v_org is null or coalesce(app_role(), '') <> 'coordenador' then
    raise exception 'Só o coordenador pode publicar o site do clube.';
  end if;

  if v_slug is not null and v_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'O endereço só pode ter letras minúsculas, algarismos e hífen (3 a 40 caracteres, sem hífen nas pontas).';
  end if;

  -- Subdomínios que são da plataforma e não de um clube.
  if v_slug in ('www','app','admin','api','mail','email','rumia','site','sites',
                'blog','static','cdn','docs','ajuda','suporte','status','login',
                'portal','demo','teste','dev','staging') then
    raise exception 'Esse endereço está reservado. Escolhe outro.';
  end if;

  if p_enabled and v_slug is null then
    raise exception 'Escolhe um endereço antes de publicar o site.';
  end if;

  if v_slug is not null and exists (
    select 1 from organizations where slug = v_slug and id <> v_org
  ) then
    raise exception 'Esse endereço já está a ser usado por outro clube.';
  end if;

  update organizations
     set slug = v_slug,
         site_enabled = coalesce(p_enabled, false)
   where id = v_org;

  return jsonb_build_object('slug', v_slug, 'site_enabled', coalesce(p_enabled, false));
end;
$$;

revoke all on function public.set_club_site(text, boolean) from public, anon;
grant execute on function public.set_club_site(text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Que clube responde a este endereço?
-- ---------------------------------------------------------------------
-- Só um clube com o site LIGADO e com a subscrição em dia. Um clube suspenso
-- não fica com o site no ar: o site é parte do produto, não um extra grátis.
--
-- A exceção é o próprio clube: quem tem sessão num clube vê o site desse
-- clube mesmo desligado. É a PRÉ-VISUALIZAÇÃO das Definições — publicar sem
-- ver primeiro o que vai ficar à vista de toda a gente é publicar às cegas.
-- Um visitante anónimo não tem `current_org_id()`, por isso continua a
-- receber "não existe".
create or replace function public.site_org_id(p_slug text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select o.id
    from organizations o
   where o.slug = lower(trim(p_slug))
     and (o.site_enabled or o.id = current_org_id())
     and (o.status = 'ativa'
          or (o.status = 'trial' and (o.trial_ends_at is null or o.trial_ends_at > now())))
   limit 1;
$$;

revoke all on function public.site_org_id(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. A página inteira, numa chamada
-- ---------------------------------------------------------------------
-- Uma só ida à base de dados por visita: o site abre-se no telemóvel de quem
-- chegou por um link do Instagram, muitas vezes com dados móveis.
--
-- O `org_id` é escrito à mão em TODAS as consultas: isto é `security definer`
-- e não passa pelo RLS.
create or replace function public.public_club_site(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org    uuid := site_org_id(p_slug);
  s        settings%rowtype;
  v_site   jsonb;
  v_hidden uuid[];
  v_today  date := (now() at time zone 'Europe/Lisbon')::date;
  v_teams  jsonb;
  v_next   jsonb := '[]'::jsonb;
  v_res    jsonb := '[]'::jsonb;
  v_spons  jsonb := '[]'::jsonb;
begin
  if v_org is null then
    return null;
  end if;

  select * into s from settings where org_id = v_org limit 1;
  v_site := coalesce(s.site, '{}'::jsonb);
  select coalesce(array_agg(x::uuid), '{}')
    into v_hidden
    from jsonb_array_elements_text(coalesce(v_site->'hidden_teams', '[]'::jsonb)) x
   where x ~ '^[0-9a-f-]{36}$';

  -- Equipas visíveis: só o escalão e o género. Nem treinador, nem plantel.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'escalao', t.escalao, 'gender', t.gender)
         order by t.escalao, t.gender), '[]'::jsonb)
    into v_teams
    from teams t
   where t.org_id = v_org
     and t.archived_at is null
     and not (t.id = any(v_hidden));

  if coalesce((v_site->'sections'->>'agenda')::boolean, true) then
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
         limit 60
      ) q;
  end if;

  if coalesce((v_site->'sections'->>'resultados')::boolean, true) then
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
         limit 60
      ) q;
  end if;

  -- Só os patrocínios CONFIRMADOS: um contacto em curso é uma negociação, e
  -- pô-lo no site antes de assinado é anunciar o que ainda não existe.
  if coalesce((v_site->'sections'->>'patrocinadores')::boolean, true) then
    select coalesce(jsonb_agg(jsonb_build_object(
             'name', sp.name, 'tier', sp.tier, 'category', sp.category)
           order by case sp.tier when 'ouro' then 1 when 'prata' then 2
                                 when 'bronze' then 3 else 4 end, sp.name), '[]'::jsonb)
      into v_spons
      from sponsors sp
     where sp.org_id = v_org
       and sp.status = 'confirmado'
       and sp.archived_at is null;
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
    'contacts',  jsonb_build_object(
      'email',     v_site->>'email',
      'phone',     v_site->>'phone',
      'address',   v_site->>'address',
      'instagram', v_site->>'instagram',
      'facebook',  v_site->>'facebook'),
    'sections',  jsonb_build_object(
      'agenda',         coalesce((v_site->'sections'->>'agenda')::boolean, true),
      'resultados',     coalesce((v_site->'sections'->>'resultados')::boolean, true),
      'patrocinadores', coalesce((v_site->'sections'->>'patrocinadores')::boolean, true),
      'inscricoes',     coalesce((v_site->'sections'->>'inscricoes')::boolean, true)),
    'teams',     v_teams,
    'upcoming',  v_next,
    'results',   v_res,
    'sponsors',  v_spons
  );
end;
$$;

revoke all on function public.public_club_site(text) from public;
grant execute on function public.public_club_site(text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Pedido de inscrição pelo site
-- ---------------------------------------------------------------------
-- O site é a porta de entrada: "quero inscrever a minha filha" passa a cair
-- no funil do Recrutamento (um `prospect` observado), com aviso ao
-- coordenador, em vez de numa caixa de mensagens do Facebook que ninguém abre.
--
-- Quem escreve é um desconhecido sem conta, por isso:
--   * O consentimento é OBRIGATÓRIO e fica escrito na ficha: são dados de um
--     menor, dados pelo encarregado.
--   * Há um TETO por clube (20 por hora) e o mesmo contacto não abre dois
--     pedidos no mesmo dia — devolve sucesso sem duplicar, porque quem carregou
--     duas vezes não fez nada de errado. Sem isto, um formulário público é um
--     sítio onde qualquer script enche o Recrutamento de lixo.
--   * A equipa de interesse só é aceite se for uma equipa VISÍVEL deste clube.
create or replace function public.public_site_signup(
  p_slug       text,
  p_name       text,
  p_birth_year text,
  p_contact    text,
  p_team_id    uuid,
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
  v_name    text := trim(coalesce(p_name, ''));
  v_contact text := trim(coalesce(p_contact, ''));
  v_msg     text := nullif(trim(coalesce(p_message, '')), '');
  v_year    text := nullif(trim(coalesce(p_birth_year, '')), '');
  v_team    uuid;
  v_label   text;
  v_id      uuid;
begin
  if v_org is null then
    raise exception 'Este clube não está a receber pedidos pelo site.';
  end if;

  select coalesce(site, '{}'::jsonb) into v_site from settings where org_id = v_org limit 1;
  if not coalesce((v_site->'sections'->>'inscricoes')::boolean, true) then
    raise exception 'Este clube não está a receber pedidos pelo site.';
  end if;

  if not coalesce(p_consent, false) then
    raise exception 'É preciso autorizar o tratamento dos dados para o clube te poder contactar.';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Escreve o nome do atleta.';
  end if;
  if length(v_contact) < 6 or length(v_contact) > 160 then
    raise exception 'Deixa um telefone ou um email para o clube te contactar.';
  end if;
  if v_year is not null and v_year !~ '^(19|20)[0-9]{2}$' then
    raise exception 'O ano de nascimento tem de ter quatro algarismos (ex.: 2014).';
  end if;
  if v_msg is not null and length(v_msg) > 1000 then
    v_msg := left(v_msg, 1000);
  end if;

  if (select count(*) from prospects
       where org_id = v_org and source = 'site'
         and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'O clube recebeu muitos pedidos na última hora. Tenta de novo mais tarde.';
  end if;

  if exists (select 1 from prospects
              where org_id = v_org and source = 'site'
                and lower(contact) = lower(v_contact)
                and lower(name) = lower(v_name)
                and created_at > now() - interval '1 day') then
    return true;
  end if;

  select t.id, t.escalao into v_team, v_label
    from teams t
   where t.id = p_team_id and t.org_id = v_org and t.archived_at is null
     and not (t.id::text in (select jsonb_array_elements_text(coalesce(v_site->'hidden_teams', '[]'::jsonb))));

  insert into prospects (org_id, name, birth_year, contact, target_team_id, status, notes, source)
  values (
    v_org, v_name, v_year, v_contact, v_team, 'observado',
    'Pedido feito pelo site público a '
      || to_char(now() at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI')
      || '. Autorizou o tratamento dos dados para o clube entrar em contacto.'
      || coalesce(E'\n\n' || v_msg, ''),
    'site'
  )
  returning id into v_id;

  -- O aviso é desejável, não pode ser o que faz falhar o pedido.
  begin
    insert into notifications (type, title, body, data, target_role, org_id)
    values (
      'site_signup',
      'Pedido de inscrição pelo site',
      v_name || coalesce(' (' || v_year || ')', '') || coalesce(' — ' || v_label, '') || '.',
      jsonb_build_object('prospect_id', v_id),
      'coordenador',
      v_org
    );
  exception when others then
    null;
  end;

  return true;
end;
$$;

revoke all on function public.public_site_signup(text, text, text, text, uuid, text, boolean) from public;
grant execute on function public.public_site_signup(text, text, text, text, uuid, text, boolean) to anon, authenticated;
