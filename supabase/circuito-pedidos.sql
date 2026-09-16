-- =====================================================================
-- Rumia — O circuito de um pedido de equipamento (e o que há a pagar)
-- =====================================================================
-- Corre DEPOIS de pedidos-equipamento.sql e pedidos-atleta.sql.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: o pedido tinha quatro estados — por decidir, aprovado, entregue,
-- recusado — e entre "aprovado" e "entregue" passavam-se semanas em que
-- ninguém sabia dizer o que estava a acontecer. A camisola estava por
-- encomendar? Já tinha chegado e estava à espera dela no gabinete? A atleta
-- perguntava ao treinador, o treinador perguntava ao clube, e a resposta era
-- a mesma que a app já dava: "aprovado". Um estado que dura semanas e não
-- distingue nada não é um estado, é uma sala de espera.
--
-- O circuito real do material tem quatro paragens e cada uma muda o que a
-- atleta tem de fazer:
--   pendente     — o clube ainda não decidiu           (ela espera)
--   aprovado     — confirmado pelo clube               (ela espera)
--   encomendado  — pedido ao fornecedor                (ela espera, mas sabe porquê)
--   pronto       — chegou, está no clube               (ela vai levantar)
--   entregue     — está com ela                        (acabou)
-- (`recusado` continua a ser o fim da linha do outro lado.)
--
-- A regra do módulo — "um estado a mais é mais um sítio onde um pedido fica
-- parado sem ninguém reparar" — continua a valer: o que faz um estado ganhar
-- lugar é haver alguém do outro lado cuja ação muda. `pronto` é o único
-- estado do circuito que pede alguma coisa à ATLETA (ir buscar), e
-- `encomendado` é o que responde à única pergunta que se faz durante a
-- espera. Nenhum dos dois é uma gaveta administrativa.
--
-- O que cria:
--   1. Dois estados novos no `check` de `equipment_requests.status`
--   2. `paid_at` / `paid_by` — o que está por cobrar a cada atleta
--   3. O trigger de decisão passa a guardar também o pagamento
--   4. Notificações para "encomendado" e "pronto a levantar"
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estados novos
-- ---------------------------------------------------------------------
-- A chave `aprovado` fica como está — é a que está guardada nos pedidos
-- todos e o que muda é só a etiqueta ("Confirmado"), a mesma regra dos
-- artigos: a chave é imutável, a etiqueta é que se lê.
alter table equipment_requests drop constraint if exists equipment_requests_status_check;
alter table equipment_requests add constraint equipment_requests_status_check
  check (status in ('pendente','aprovado','encomendado','pronto','entregue','recusado'));

-- ---------------------------------------------------------------------
-- 2. O que está por pagar
-- ---------------------------------------------------------------------
-- O material aprovado é quase sempre cobrado à família, e isso vivia fora da
-- app: uma folha de cálculo com os nomes e os valores, que ninguém cruzava
-- com os pedidos. O resultado era o material entregue sem ninguém cobrar, ou
-- cobrado duas vezes.
--
-- Não é uma tabela de pagamentos nem entra no Financeiro: é uma MARCA no
-- pedido — está pago ou está por pagar. Ligar isto ao livro-razão é uma
-- decisão à parte, como já acontece com o preço dos artigos (uma estimativa
-- ao preço de hoje, e não um registo de despesa).
alter table equipment_requests add column if not exists paid_at timestamptz;
alter table equipment_requests add column if not exists paid_by uuid references auth.users(id) on delete set null;

create index if not exists idx_eqreq_unpaid on equipment_requests (paid_at)
  where paid_at is null;

-- ---------------------------------------------------------------------
-- 3. Quem decide e quem cobra
-- ---------------------------------------------------------------------
-- A política de UPDATE deixa quem pediu corrigir o SEU pedido enquanto está
-- pendente — e isso, sozinho, deixava-o escrever `status='aprovado'`. O mesmo
-- valeria agora para o `paid_at`: uma atleta a marcar como pago o que não
-- pagou. Quem decide e quem dá a quitação é quem responde pela verba.
create or replace function public.guard_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     and coalesce(app_role(), '') not in ('coordenador','direcao') then
    raise exception 'Só o coordenador ou a direção podem mover um pedido de equipamento.';
  end if;
  if (new.paid_at is distinct from old.paid_at)
     and coalesce(app_role(), '') not in ('coordenador','direcao') then
    raise exception 'Só o coordenador ou a direção podem marcar um pedido como pago.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_request_decision on equipment_requests;
create trigger trg_guard_request_decision before update on equipment_requests
  for each row execute function public.guard_request_decision();

-- ---------------------------------------------------------------------
-- 4. Avisar em cada paragem
-- ---------------------------------------------------------------------
-- Um circuito com cinco paragens que só avisa em duas é o mesmo silêncio de
-- antes com mais ecrãs. A paragem que MAIS importa é a `pronto`: é a única
-- que pede alguma coisa à atleta, e um material que fica no gabinete à espera
-- de quem não sabe que já chegou é o mesmo que não ter chegado.
create or replace function notify_equipment_request_decided()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  v_player text;
  v_label  text;
  v_title  text;
  v_role   text;
begin
  if NEW.status is not distinct from OLD.status then return NEW; end if;
  if NEW.requested_by is null then return NEW; end if;
  -- Quem moveu o seu próprio pedido já sabe o que fez.
  if NEW.requested_by = NEW.decided_by then return NEW; end if;

  select name into v_player from players where id = NEW.player_id;
  select role into v_role  from profiles where id = NEW.requested_by;
  v_label := equipment_article_label(NEW.article, NEW.article_other, NEW.org_id);

  v_title := case NEW.status
    when 'aprovado'    then case when v_role = 'atleta'
                                then 'O clube confirmou o teu pedido'
                                else 'Pedido de equipamento confirmado' end
    when 'encomendado' then case when v_role = 'atleta'
                                then 'O teu material já foi encomendado'
                                else 'Equipamento encomendado ao fornecedor' end
    when 'pronto'      then case when v_role = 'atleta'
                                then 'Já podes levantar o teu material'
                                else 'Equipamento pronto a levantar' end
    when 'entregue'    then case when v_role = 'atleta'
                                then 'Material entregue'
                                else 'Equipamento entregue' end
    when 'recusado'    then case when v_role = 'atleta'
                                then 'O clube respondeu ao teu pedido'
                                else 'Pedido de equipamento recusado' end
    else 'Pedido de equipamento reaberto'
  end;

  insert into notifications (type, title, body, data, target_user_id, org_id)
  values (
    'equipment_request_decided',
    v_title,
    -- À atleta não se repete o nome dela: ela sabe de quem é o pedido.
    case when v_role = 'atleta' then '' else coalesce(v_player, 'Atleta') || ' — ' end
      || v_label
      || coalesce('. ' || nullif(trim(NEW.decision_note), ''), '.'),
    jsonb_build_object('request_id', NEW.id, 'player_id', NEW.player_id, 'status', NEW.status),
    NEW.requested_by,
    NEW.org_id
  );
  return NEW;
end;
$$;

drop trigger if exists trg_notify_equipment_request_decided on equipment_requests;
create trigger trg_notify_equipment_request_decided
  after update on equipment_requests
  for each row execute function notify_equipment_request_decided();
