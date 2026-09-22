-- =====================================================================
-- Rumia — Plano de recuperação: os exercícios que a atleta leva para casa
-- =====================================================================
-- Corre DEPOIS de schema.sql, notifications.sql, trainer-notifications.sql
-- (dá o `target_user_id`), portal-atleta.sql e multitenant.sql (dá o
-- `org_id`). Pode ser corrido várias vezes sem problema.
--
-- Porquê: o trabalho de reabilitação é o que decide se a atleta volta a
-- jogar, e é quase todo feito FORA do pavilhão — em casa, sozinha, entre as
-- sessões. Na app isso vivia num campo de texto livre do episódio ("plano de
-- tratamento"), escrito pela fisio para a fisio: a atleta nunca o leu, porque
-- nunca teve acesso ao episódio. O que ela levava eram três exercícios
-- explicados de viva voz no fim da sessão, e no dia seguinte já era "era três
-- séries ou duas?".
--
-- A Preparação Física já tinha a estrutura toda para isto — séries, carga,
-- repetições (`gym_exercises`) — e a fisioterapia não tinha nada.
--
-- O que cria:
--   1. Tabela `rehab_exercises` (exercícios de um episódio clínico)
--   2. RLS: escreve a fisio; LÊ TAMBÉM A ATLETA (é para ela que é escrito)
--   3. Notificação ao receber o primeiro exercício do plano
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabela
-- ---------------------------------------------------------------------
-- Pendura no EPISÓDIO e não no atleta: um plano de recuperação é de uma
-- lesão concreta e acaba com ela. Pendurado no atleta, os exercícios do
-- tornozelo de outubro continuavam a aparecer em março, no ombro, e a lista
-- só crescia — que é a forma de deixar de ser lida.
--
-- Não há `player_id`: lê-se do episódio. Guardá-lo aqui seria um segundo dono
-- do mesmo dado, a regra do `team_id` dos pedidos de equipamento.
create table if not exists rehab_exercises (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references clinical_episodes(id) on delete cascade,
  name        text not null,
  -- As séries são um número; as REPETIÇÕES são texto, de propósito. Metade do
  -- trabalho de reabilitação não se conta em repetições — "30 segundos",
  -- "10 de cada lado", "até sentir" — e um campo numérico obrigava a fisio a
  -- escrever a verdade nas observações e um número inventado aqui.
  sets        int check (sets is null or sets between 1 and 20),
  reps        text,
  -- Com que frequência: "todos os dias", "3x por semana", "antes do treino".
  -- Texto livre pela mesma razão — é a instrução, e cada lesão tem a sua.
  frequency   text,
  -- Como se faz e ao que se deve prestar atenção. É o que ela lê em casa,
  -- três dias depois de lhe terem explicado.
  notes       text,
  -- Vídeo do exercício. Passa por `safeUrl` na app, como as ligações do plano
  -- de treino: um endereço escrito à mão num campo de texto não vira href sem
  -- ser validado.
  link_url    text,
  -- A ordem é a do plano, e é ela que diz o que se faz primeiro.
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists idx_rehab_episode on rehab_exercises (episode_id, position);

-- ---------------------------------------------------------------------
-- 2. Multi-tenant (org_id + isolamento por clube)
-- ---------------------------------------------------------------------
alter table rehab_exercises add column if not exists org_id uuid references organizations(id) on delete cascade;
alter table rehab_exercises alter column org_id set default current_org_id();
create index if not exists idx_rehab_exercises_org on rehab_exercises (org_id);

alter table rehab_exercises enable row level security;

drop policy if exists tenant_isolation on rehab_exercises;
create policy tenant_isolation on rehab_exercises as restrictive for all to authenticated
  using (org_id = current_org_id()) with check (org_id = current_org_id());

-- ---------------------------------------------------------------------
-- 3. Os episódios EM CURSO da própria atleta
-- ---------------------------------------------------------------------
-- A política de leitura dela tem de cruzar `clinical_episodes`, que é uma
-- tabela onde ela não tem leitura nenhuma — e uma subconsulta dentro de uma
-- política corre com os privilégios de quem pergunta, por isso passaria pelo
-- RLS do episódio e não devolvia nada. Um `security definer` resolve-o, e é a
-- mesma saída do `athlete_player_id()` e do `trainer_team_ids()`.
--
-- Devolve IDS e mais nada: não abre uma linha de episódio a ninguém.
--
-- E devolve só os episódios SEM ALTA, que é o que faz o plano desaparecer do
-- portal dela no dia em que ela fica apta — sem ninguém ter de o ir apagar.
-- Um plano é de uma lesão concreta: continuar a pedir os exercícios do
-- tornozelo a quem já voltou a jogar é a forma de a lista deixar de ser
-- levada a sério, e apagá-lo à mão perdia o registo do que foi prescrito.
create or replace function public.athlete_open_episode_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id
  from clinical_episodes e
  join players p on p.id = e.player_id
  where p.user_id = auth.uid()
    and e.status <> 'alta';
$$;

revoke all on function public.athlete_open_episode_ids() from public;
grant execute on function public.athlete_open_episode_ids() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Políticas
-- ---------------------------------------------------------------------
drop policy if exists "rehab_read"  on rehab_exercises;
drop policy if exists "rehab_write" on rehab_exercises;

-- Leitura: o departamento médico e a PRÓPRIA ATLETA.
--
-- Aqui abre-se a linha inteira, ao contrário do atendimento — e a diferença é
-- toda: o atendimento tem `notes` que a fisio escreve para si própria, e este
-- registo é escrito DE PROPÓSITO para ser lido por ela. Não há coluna neste
-- quadro que ela não deva ver: o nome do exercício, as séries, as
-- repetições, a frequência e as observações são a instrução. Por isso é uma
-- política e não uma RPC.
--
-- O treinador fica de fora. O que ele precisa de saber é o que ela pode e não
-- pode fazer no treino, e isso já lhe chega pelas limitações da
-- disponibilidade (`athlete_availability`) — o plano de exercícios é trabalho
-- clínico, e pô-lo à frente de quem treina convida a que se treine por cima
-- dele.
create policy "rehab_read" on rehab_exercises for select to authenticated
using (
  app_role() in ('coordenador','fisioterapeuta')
  or episode_id in (select athlete_open_episode_ids())
);

-- Escrita: só quem trata. A atleta LÊ e não escreve — o plano é uma
-- prescrição, não uma lista de tarefas partilhada.
create policy "rehab_write" on rehab_exercises for all to authenticated
  using (app_role() in ('coordenador','fisioterapeuta'))
  with check (app_role() in ('coordenador','fisioterapeuta'));

-- ---------------------------------------------------------------------
-- 5. O plano avisa UMA vez
-- ---------------------------------------------------------------------
-- Quando chega o PRIMEIRO exercício de um episódio, a atleta é avisada de que
-- tem plano. Os seguintes não avisam: um plano monta-se de uma vez, exercício
-- a exercício, em dois minutos — e cinco avisos seguidos sobre a mesma coisa
-- ensinam-na a ignorar o sino, que é o que faz o SEXTO aviso (o que importa)
-- não ser lido.
--
-- O corpo diz que o plano existe e onde está, e não o que lá está dentro:
-- "3 séries de 15 de elástico" numa notificação de ecrã bloqueado não serve
-- para nada a ninguém, e o que ela tem a fazer é abrir e ler o plano todo.
create or replace function notify_athlete_rehab_plan()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  -- "É o primeiro?" não se responde contando as linhas do episódio: num
  -- INSERT de várias linhas (um plano colado de uma vez, um modelo) os
  -- gatilhos AFTER ROW correm todos no FIM da instrução, com as três linhas
  -- já lá — a contagem dá 3 em todos e não saía aviso NENHUM. Pergunta-se
  -- antes se existe alguma linha ANTERIOR a esta, que num lote empata pelo
  -- `id` e elege exatamente uma.
  if exists (
    select 1 from rehab_exercises r
    where r.episode_id = NEW.episode_id
      and (r.created_at, r.id) < (NEW.created_at, NEW.id)
  ) then
    return NEW;
  end if;

  select p.user_id into v_user
  from clinical_episodes e join players p on p.id = e.player_id
  where e.id = NEW.episode_id;
  if v_user is null then return NEW; end if;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'rehab_plan',
    'Tens plano de recuperação',
    'A fisioterapia deixou-te exercícios para fazeres. Abre a app para os veres.',
    jsonb_build_object('episode_id', NEW.episode_id),
    v_user, NEW.org_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_athlete_rehab_plan on rehab_exercises;
create trigger trg_notify_athlete_rehab_plan
  after insert on rehab_exercises
  for each row execute function notify_athlete_rehab_plan();
