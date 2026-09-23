-- =====================================================================
-- Rumia — A atleta responde ao atendimento de fisioterapia
-- =====================================================================
-- Corre DEPOIS de atendimentos-atleta.sql (dá `my_physio_appointments`),
-- qrcode-presencas.sql (dá `club_now`) e multitenant.sql. Pode ser corrido
-- várias vezes sem problema.
--
-- Porquê: a fisio marca o atendimento e a atleta é avisada — mas o aviso só
-- ia num sentido. Se a hora não lhe dava (um teste, o transporte, outro
-- treino), a única saída era "avisa o teu treinador", que avisava a fisio
-- por WhatsApp, se se lembrasse. O resultado era a fisio à espera de uma
-- atleta que nunca vinha, e uma falta registada a quem avisou.
--
-- O que cria:
--   1. Colunas da resposta em `physio_appointments`
--   2. Guarda: a resposta é DELA, e cai quando o atendimento muda de hora
--   3. RPC `respond_to_appointment` — a única porta de escrita
--   4. `my_physio_appointments` passa a devolver a resposta
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. A resposta vive na linha do atendimento
-- ---------------------------------------------------------------------
-- Duas respostas, como nos eventos: "vou" e "não posso". Ficar por responder
-- já diz "ainda não sei", e diz a verdade.
--
-- É uma coluna e não uma tabela à parte porque um atendimento é de UMA
-- atleta: não há vinte respostas a guardar, há uma.
alter table physio_appointments
  add column if not exists athlete_response text
    check (athlete_response in ('vou','nao_posso')),
  add column if not exists athlete_note text,
  add column if not exists athlete_responded_at timestamptz;

-- ---------------------------------------------------------------------
-- 2. Guarda
-- ---------------------------------------------------------------------
-- A. A resposta é dela. O `med_rw` deixa a fisio escrever a linha inteira, e
--    é isso que a deixava — sem querer, num formulário que reenvia tudo —
--    apagar ou inventar a resposta da atleta. Aqui as colunas da resposta só
--    mudam pela RPC (que se anuncia por `rumia.appt_response`); qualquer
--    outra escrita fica com o valor que lá estava. Reverter em silêncio, e
--    não recusar: a fisio não tentou mexer na resposta, só gravou o resto.
--
-- B. Mudar o DIA ou a HORA limpa a resposta. "Não posso" era sobre aquela
--    hora; manter o aviso depois de a fisio remarcar dizia que a atleta
--    também não pode a nova, que é o contrário do que se quer saber — e um
--    "vou" antigo confirmava uma hora que ela nunca viu. A notificação de
--    alteração (atendimentos-atleta.sql) pede-lhe que responda outra vez.
create or replace function public.guard_appointment_response()
returns trigger language plpgsql
as $$
begin
  if coalesce(current_setting('rumia.appt_response', true), '') <> 'on' then
    NEW.athlete_response     := OLD.athlete_response;
    NEW.athlete_note         := OLD.athlete_note;
    NEW.athlete_responded_at := OLD.athlete_responded_at;
  end if;

  if (NEW.date is distinct from OLD.date) or (NEW.time is distinct from OLD.time) then
    NEW.athlete_response     := null;
    NEW.athlete_note         := null;
    NEW.athlete_responded_at := null;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_guard_appointment_response on physio_appointments;
create trigger trg_guard_appointment_response
  before update on physio_appointments
  for each row execute function public.guard_appointment_response();

-- Num atendimento NOVO não há resposta nenhuma, venha o que vier no INSERT.
create or replace function public.clear_appointment_response_on_insert()
returns trigger language plpgsql
as $$
begin
  NEW.athlete_response     := null;
  NEW.athlete_note         := null;
  NEW.athlete_responded_at := null;
  return NEW;
end;
$$;

drop trigger if exists trg_clear_appointment_response_on_insert on physio_appointments;
create trigger trg_clear_appointment_response_on_insert
  before insert on physio_appointments
  for each row execute function public.clear_appointment_response_on_insert();

-- ---------------------------------------------------------------------
-- 3. A atleta responde
-- ---------------------------------------------------------------------
-- `security definer` porque a atleta não tem `physio_appointments` (o
-- `med_rw` fecha-lho, e abrir-lho entregava as notas da fisio). Por isso o
-- `org_id` é filtrado à MÃO — a regra do `check_in_by_qr`.
--
-- Aceita até à hora do atendimento, como o jogo: saber tarde é melhor do que
-- a fisio ficar à espera. (O treino fecha 6 h antes porque o treinador monta
-- o treino para o plantel; aqui do outro lado está uma pessoa só, que ganha
-- sempre com o aviso.)
--
-- Quem é avisado: o "não posso" pede uma ação (remarcar), e por isso notifica.
-- O "vou" NÃO notifica — ao contrário dos eventos, onde o "vou" avisa para
-- distinguir "ninguém respondeu" de "não está a chegar nada": aqui é UMA
-- atleta, e o ✓ fica à vista na agenda sem gastar o sino da fisio. A exceção
-- é voltar atrás ("afinal posso"), que desfaz um aviso que pode estar a
-- meio de ser tratado.
--
-- Vai à fisioterapeuta e, num clube SEM fisio com conta, ao coordenador — a
-- mesma regra do `clubHasFisio` na fila dos pedidos.
create or replace function public.respond_to_appointment(
  p_appointment_id uuid,
  p_response       text,
  p_note           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org     uuid := current_org_id();
  v_player  players%rowtype;
  v_appt    physio_appointments%rowtype;
  v_before  text;
  v_note    text := nullif(trim(coalesce(p_note, '')), '');
  v_start   timestamp;
  v_roles   text[];
  v_title   text;
  v_body    text;
begin
  if p_response not in ('vou','nao_posso') then
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

  select * into v_appt from physio_appointments
   where id = p_appointment_id
     and player_id = v_player.id
     and (v_org is null or org_id = v_org);
  if not found then
    raise exception 'Atendimento não encontrado.';
  end if;
  if v_appt.status <> 'agendado' then
    raise exception 'Este atendimento já não está agendado.';
  end if;

  v_start := v_appt.date + coalesce(nullif(trim(v_appt.time), ''), '23:59')::time;
  if v_start < club_now() then
    raise exception 'Este atendimento já passou.';
  end if;

  v_before := v_appt.athlete_response;

  perform set_config('rumia.appt_response', 'on', true);
  update physio_appointments
     set athlete_response     = p_response,
         athlete_note         = case when p_response = 'nao_posso' then v_note end,
         athlete_responded_at = now()
   where id = v_appt.id
  returning * into v_appt;
  perform set_config('rumia.appt_response', '', true);

  if p_response = 'nao_posso'
     or (p_response = 'vou' and v_before = 'nao_posso') then
    v_roles := case
      when exists (select 1 from profiles
                    where role = 'fisioterapeuta'
                      and org_id is not distinct from v_appt.org_id)
      then array['fisioterapeuta']
      else array['coordenador']
    end;

    if p_response = 'nao_posso' then
      v_title := 'Não pode ir à fisioterapia';
      v_body  := v_player.name || ' não pode a '
              || appointment_when(v_appt.date, v_appt.time)
              || coalesce(' — ' || v_note, '') || '.';
    else
      v_title := 'Afinal pode ir à fisioterapia';
      v_body  := v_player.name || ' confirmou a fisioterapia de '
              || appointment_when(v_appt.date, v_appt.time) || '.';
    end if;

    insert into notifications (type, title, body, data, target_role, org_id)
    select 'physio_appointment_response', v_title, v_body,
           jsonb_build_object('appointment_id', v_appt.id,
                              'player_id', v_player.id,
                              'response', p_response),
           r, v_appt.org_id
      from unnest(v_roles) as r;
  end if;

  return jsonb_build_object(
    'id',                   v_appt.id,
    'athlete_response',     v_appt.athlete_response,
    'athlete_note',         v_appt.athlete_note,
    'athlete_responded_at', v_appt.athlete_responded_at
  );
end;
$$;

revoke all on function public.respond_to_appointment(uuid, text, text) from public;
grant execute on function public.respond_to_appointment(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Ela vê o que respondeu
-- ---------------------------------------------------------------------
-- A mesma função de atendimentos-atleta.sql, com a resposta. O tipo de
-- retorno muda, e o Postgres não deixa mudá-lo com `create or replace`.
drop function if exists public.my_physio_appointments();
create function public.my_physio_appointments()
returns table (
  id               uuid,
  ap_date          date,
  ap_time          text,
  end_time         text,
  location         text,
  status           text,
  type             text,
  athlete_response text,
  athlete_note     text
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.date, a.time, a.end_time, a.location, a.status, a.type,
         a.athlete_response, a.athlete_note
  from physio_appointments a
  where a.player_id = athlete_player_id()
    and a.org_id is not distinct from current_org_id()
  order by a.date, a.time;
$$;

revoke all on function public.my_physio_appointments() from public;
grant execute on function public.my_physio_appointments() to authenticated;
