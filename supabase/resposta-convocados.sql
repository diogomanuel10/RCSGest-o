-- =====================================================================
-- Ao jogo só responde quem está CONVOCADO
-- =====================================================================
-- Correr DEPOIS de comunicacao.sql, musculacao.sql e
-- notificacoes-atleta.sql. Seguro de re-executar.
--
-- A atleta podia responder "vou"/"não vou" a qualquer jogo da equipa, dias
-- antes de haver convocatória. Era uma resposta a uma pergunta que ninguém
-- fez: "vou ao jogo" não quer dizer nada antes de ela ser chamada, e um "não
-- vou" de terça aparecia ao treinador como ausência de quem nem estava na
-- lista. A resposta ao jogo passa a ser a resposta À CONVOCATÓRIA: foste
-- chamada, confirmas ou avisas que não podes.
--
--   1. `respond_to_event` recusa o jogo a quem não está convocado (como já
--      recusava a musculação a quem não está no grupo).
--   2. Sair da convocatória apaga a resposta desse jogo: era sobre uma
--      convocatória que deixou de existir para ela.
--   3. As respostas a jogos de HOJE em diante dadas por quem não está
--      convocado são apagadas. Os jogos que já passaram ficam como estão —
--      são histórico.
--   4. O aviso "Foste convocado" passa a dizer que se responde no portal.
--
-- Os treinos não mudam: um treino é da equipa toda, e avisar que se falta
-- continua a fazer-se até 6 horas antes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Responder
-- ---------------------------------------------------------------------
create or replace function public.respond_to_event(
  p_event_id uuid,
  p_response text,
  p_note     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org    uuid := current_org_id();
  v_player players%rowtype;
  v_event  events%rowtype;
  v_row    event_responses%rowtype;
  v_before text;
  v_start  timestamp;
  v_limit  timestamp;
  v_label  text;
  v_title  text;
  uid      uuid;
begin
  if p_response not in ('vou','nao_vou') then
    raise exception 'Resposta inválida.';
  end if;

  select * into v_player from players
   where user_id = auth.uid()
     and archived_at is null
     and (v_org is null or org_id = v_org)
   limit 1;
  if not found then
    raise exception 'A tua conta não está associada a nenhum atleta.';
  end if;

  select * into v_event from events
   where id = p_event_id
     and archived_at is null
     and (v_org is null or org_id = v_org);
  if not found then
    raise exception 'Evento não encontrado.';
  end if;

  if v_event.team_id is distinct from v_player.team_id then
    raise exception 'Este evento não é da tua equipa.';
  end if;

  if v_event.type = 'musculacao'
     and not exists (
       select 1 from event_players
        where event_id = v_event.id and player_id = v_player.id
     ) then
    raise exception 'Não estás nesta sessão de musculação.';
  end if;

  -- O jogo responde-se à CONVOCATÓRIA: sem estar convocado não há pergunta.
  if v_event.type = 'jogo'
     and not exists (
       select 1 from squads s
         join squad_players sp on sp.squad_id = s.id
        where s.event_id = v_event.id and sp.player_id = v_player.id
     ) then
    raise exception 'Ainda não estás convocado para este jogo. Respondes quando fores.';
  end if;

  v_start := v_event.date + coalesce(nullif(v_event.time,''), '23:59')::time;
  v_limit := case when v_event.type in ('treino','musculacao')
                  then v_start - interval '6 hours'
                  else v_start
             end;

  if v_start < club_now() then
    raise exception 'Este evento já passou.';
  end if;
  if v_limit < club_now() then
    raise exception 'As respostas a este treino fecharam às % (6 horas antes). Avisa o teu treinador diretamente.',
      to_char(v_limit, 'HH24:MI" de "DD/MM');
  end if;

  select response into v_before from event_responses
   where event_id = p_event_id and player_id = v_player.id;

  insert into event_responses (event_id, player_id, response, note, responded_at)
  values (p_event_id, v_player.id, p_response, nullif(trim(coalesce(p_note,'')), ''), now())
  on conflict (event_id, player_id) do update
    set response     = excluded.response,
        note         = excluded.note,
        responded_at = excluded.responded_at
  returning * into v_row;

  if coalesce(v_before,'') is distinct from p_response then
    v_label := case v_event.type
                 when 'jogo'       then 'jogo'
                 when 'musculacao' then 'treino de musculação'
                 else 'treino'
               end;
    v_title := case when p_response = 'nao_vou'
                    then 'Falta avisada'
                    else 'Presença confirmada' end;

    for uid in select event_response_audience(v_event.team_id, v_event.org_id, v_event.type) loop
      insert into notifications (type, title, body, data, target_user_id, org_id)
      values (
        'event_response',
        v_title,
        v_player.name ||
          case when p_response = 'nao_vou' then ' não vai ao ' else ' vai ao ' end ||
          v_label ||
          ' de ' || to_char(v_event.date, 'DD/MM') ||
          coalesce(' às ' || v_event.time, '') ||
          coalesce(' — ' || v_row.note, '') || '.',
        jsonb_build_object(
          'event_id',  v_event.id,
          'player_id', v_player.id,
          'response',  p_response
        ),
        uid,
        v_event.org_id
      );
    end loop;
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.respond_to_event(uuid, text, text) from public, anon;
grant execute on function public.respond_to_event(uuid, text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 2. Sair da convocatória apaga a resposta a esse jogo
-- ---------------------------------------------------------------------
-- `security definer`: quem retira é o treinador, e `event_responses` não tem
-- política de escrita (só a RPC escreve). Não atravessa clubes: o evento e o
-- atleta saem da própria linha apagada, e os dois ids são de um clube só.
create or replace function public.clear_response_on_uncall()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from event_responses er
   using squads s
   where s.id = OLD.squad_id
     and er.event_id = s.event_id
     and er.player_id = OLD.player_id;
  return OLD;
end;
$$;

drop trigger if exists trg_clear_response_on_uncall on squad_players;
create trigger trg_clear_response_on_uncall
  after delete on squad_players
  for each row
  execute function clear_response_on_uncall();


-- ---------------------------------------------------------------------
-- 3. Respostas a jogos futuros de quem não está convocado
-- ---------------------------------------------------------------------
delete from event_responses er
 using events e
 where e.id = er.event_id
   and e.type = 'jogo'
   and e.date >= current_date
   and not exists (
     select 1 from squads s
       join squad_players sp on sp.squad_id = s.id
      where s.event_id = e.id and sp.player_id = er.player_id
   );


-- ---------------------------------------------------------------------
-- 4. "Foste convocado" diz onde se responde
-- ---------------------------------------------------------------------
-- É a única porta para a resposta ao jogo, por isso o aviso tem de a apontar.
create or replace function public.notify_athlete_squad_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  called  boolean := (TG_OP = 'INSERT');
  row_    squad_players%rowtype;
  ev      events%rowtype;
  uid     uuid;
begin
  -- Num AFTER DELETE não há NEW: a linha que interessa é a OLD.
  if called then row_ := NEW; else row_ := OLD; end if;

  select e.* into ev
    from squads s
    join events e on e.id = s.event_id
   where s.id = row_.squad_id;

  if not found or ev.date < current_date or ev.archived_at is not null then
    return row_;
  end if;

  select p.user_id into uid
    from players p
   where p.id = row_.player_id
     and p.user_id is not null
     and p.archived_at is null;

  if uid is null then return row_; end if;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    case when called then 'squad_called' else 'squad_uncalled' end,
    case when called then 'Foste convocado' else 'Já não estás convocado' end,
    case when called
      then 'Estás na convocatória do jogo de ' || to_char(ev.date, 'DD/MM')
           || coalesce(' às ' || ev.time, '') || '. Diz na app se vais.'
      else 'Deixaste de estar na convocatória do jogo de '
           || to_char(ev.date, 'DD/MM') || '.'
    end,
    jsonb_build_object('event_id', ev.id, 'date', ev.date, 'called', called),
    uid,
    ev.org_id
  );
  return row_;
end;
$$;
