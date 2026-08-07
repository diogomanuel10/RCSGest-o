-- =====================================================================
-- Rumia — Resultados de jogo (final + parciais) e participação por pontos
-- =====================================================================
-- O clube tinha planos de jogo completos — sistema de receção, bloco,
-- side-out, scout do adversário — e no fim ninguém registava se aquilo tinha
-- resultado. `events` guardava o adversário e a data, mas nenhum marcador.
-- Sem resultado não há forma recente, não há balanço, e o ciclo
-- plano -> jogo -> aprendizagem nunca fecha.
--
-- Três peças:
--
--   1. `game_results` — o resultado final em sets (na perspetiva do clube).
--   2. `game_sets`    — os parciais de cada set (25-20, 23-25, …).
--   3. `game_minutes.points` — quantos PONTOS cada atleta jogou.
--
-- Porque é que os parciais não são um extra: no voleibol não há relógio, e
-- por isso a participação de um atleta mede-se em pontos, não em minutos.
-- "Jogou 40 pontos" não diz nada sozinho — só ganha sentido contra o total de
-- pontos do jogo, que é exatamente a soma dos parciais. São os parciais que
-- dão o DENOMINADOR.
--
-- Quem regista: o TREINADOR, depois do jogo. Como `events` só é editável pelo
-- coordenador, o resultado vive em tabelas próprias com a sua política — em
-- vez de abrir a edição de eventos a quem não deve mexer em datas e locais.
--
-- Como usar:
--   1. Corre primeiro schema.sql e multitenant.sql.
--   2. Cola TODO este ficheiro no SQL Editor do Supabase e "Run".
--   3. É seguro re-executar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Resultado final
-- ---------------------------------------------------------------------
-- Uma linha por jogo. "for"/"against" são sempre na perspetiva do clube —
-- mais claro do que casa/fora, que obrigaria a saber de que lado se está.
create table if not exists game_results (
  event_id     uuid primary key references events(id) on delete cascade,
  sets_for     integer not null default 0 check (sets_for     between 0 and 5),
  sets_against integer not null default 0 check (sets_against between 0 and 5),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. Parciais por set
-- ---------------------------------------------------------------------
create table if not exists game_sets (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references events(id) on delete cascade,
  set_number     integer not null check (set_number between 1 and 5),
  points_for     integer not null default 0 check (points_for     >= 0),
  points_against integer not null default 0 check (points_against >= 0),
  unique (event_id, set_number)
);
create index if not exists idx_game_sets_event on game_sets (event_id);

-- ---------------------------------------------------------------------
-- 3. Pontos jogados por atleta
-- ---------------------------------------------------------------------
-- A tabela chama-se `game_minutes` por ter nascido para desportos com
-- relógio. Mantém-se o nome (e a coluna `minutes`, que continua correta para
-- futebol/futsal/andebol/basquetebol — a app é multi-modalidade) e
-- acrescenta-se `points`, que é o que conta no voleibol. A interface mostra
-- uma ou outra conforme `settings.sport`.
alter table game_minutes add column if not exists points integer check (points >= 0);

-- ---------------------------------------------------------------------
-- 4. Os parciais mandam no resultado final
-- ---------------------------------------------------------------------
-- Um valor com dois donos acaba sempre em divergência. Quando há parciais,
-- são eles a fonte de verdade: o final é recontado a partir deles. Sem
-- parciais (o treinador que só teve tempo de meter "3-1"), fica o que foi
-- escrito à mão.
create or replace function public.sync_game_result()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event uuid := coalesce(NEW.event_id, OLD.event_id);
  v_for   integer;
  v_ag    integer;
begin
  select count(*) filter (where points_for > points_against),
         count(*) filter (where points_against > points_for)
    into v_for, v_ag
    from game_sets where event_id = v_event;

  -- Sem parciais não se mexe no que o treinador escreveu.
  if coalesce(v_for, 0) + coalesce(v_ag, 0) = 0 then
    return null;
  end if;

  insert into game_results (event_id, sets_for, sets_against, updated_at)
  values (v_event, v_for, v_ag, now())
  on conflict (event_id) do update
    set sets_for = excluded.sets_for,
        sets_against = excluded.sets_against,
        updated_at = now();
  return null;
end;
$$;

drop trigger if exists trg_sync_game_result on game_sets;
create trigger trg_sync_game_result
  after insert or update or delete on game_sets
  for each row execute function public.sync_game_result();

-- ---------------------------------------------------------------------
-- 5. Isolamento por clube
-- ---------------------------------------------------------------------
alter table game_results add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table game_results alter column org_id set default current_org_id();
create index if not exists idx_game_results_org on game_results (org_id);

alter table game_sets add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table game_sets alter column org_id set default current_org_id();
create index if not exists idx_game_sets_org on game_sets (org_id);

alter table game_results enable row level security;
alter table game_sets    enable row level security;

drop policy if exists tenant_isolation on game_results;
create policy tenant_isolation on game_results as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());
drop policy if exists tenant_isolation on game_sets;
create policy tenant_isolation on game_sets as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 6. Quem lê e quem escreve
-- ---------------------------------------------------------------------
-- LEITURA: toda a gente do clube, incluindo o atleta. Um resultado não é
-- confidencial — e o atleta querer saber como correu o jogo da equipa é o
-- comportamento normal, não uma exceção.
drop policy if exists "gr_read" on game_results;
create policy "gr_read" on game_results for select to authenticated using (true);
drop policy if exists "gs_read" on game_sets;
create policy "gs_read" on game_sets for select to authenticated using (true);

-- ESCRITA: coordenador, ou treinador nos jogos das SUAS equipas. É quem esteve
-- lá — e é a razão de o resultado não viver em `events`, que só o coordenador
-- pode editar.
drop policy if exists "gr_write" on game_results;
create policy "gr_write" on game_results for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  );

drop policy if exists "gs_write" on game_sets;
create policy "gs_write" on game_sets for all to authenticated
  using (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  )
  with check (
    app_role() = 'coordenador'
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  );

-- ---------------------------------------------------------------------
-- 7. Pontos jogados: abrir ao treinador e ao próprio atleta
-- ---------------------------------------------------------------------
-- Até aqui `game_minutes` era exclusivo do coordenador e do preparador
-- físico. Mas quem sabe quantos pontos cada atleta jogou é o treinador que
-- esteve no banco — e é ele que vai preencher isto a seguir ao jogo.
-- O atleta passa a ler os SEUS (é sobre ele, e é o que dá sentido ao portal).
drop policy if exists "prep_rw" on game_minutes;
drop policy if exists "gm_read" on game_minutes;
drop policy if exists "gm_write" on game_minutes;

create policy "gm_read" on game_minutes for select to authenticated
  using (
    app_role() in ('coordenador','preparador')
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
    OR player_id = athlete_player_id()
  );

create policy "gm_write" on game_minutes for all to authenticated
  using (
    app_role() in ('coordenador','preparador')
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  )
  with check (
    app_role() in ('coordenador','preparador')
    OR (app_role() = 'treinador' AND event_id in (
      select id from events where team_id in (select trainer_team_ids())
    ))
  );
