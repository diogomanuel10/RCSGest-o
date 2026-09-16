-- =====================================================================
-- Rumia — Marcar um pedido de equipamento como PAGO
-- =====================================================================
-- Correr DEPOIS de `pedidos-equipamento.sql` e `pedidos-atleta.sql`.
-- Pode ser corrido várias vezes sem problema.
--
-- Porquê: o ecrã dos Pedidos já diz o que cada atleta leva e quanto custa,
-- mas não dizia quem já entregou o dinheiro — e isso vivia num caderno ou na
-- cabeça de quem está ao balcão no dia da entrega. Um número "a pagar" que
-- nunca fecha deixa de ser lido ao fim de duas semanas.
--
-- É uma marca, não um livro de contas: quem paga o quê é decisão do clube (há
-- material que o clube dá) e o registo da RECEITA é do Financeiro. Aqui só se
-- guarda se aquele pedido já foi pago, quando e por quem foi marcado.
alter table equipment_requests add column if not exists paid_at timestamptz;
alter table equipment_requests add column if not exists paid_by uuid references auth.users(id) on delete set null;

create index if not exists idx_eqreq_paid on equipment_requests (paid_at);

-- ---------------------------------------------------------------------
-- Quem marca é quem recebe o dinheiro
-- ---------------------------------------------------------------------
-- A política de UPDATE continua a deixar o treinador e a atleta corrigirem o
-- SEU pedido enquanto está pendente — e isso, sozinho, deixava-os também
-- escrever `paid_at`, ou seja, dar-se por pagos a si próprios. É exatamente o
-- buraco que o `guard_request_decision` fechou para o `status`, por isso a
-- guarda é a MESMA função: uma segunda ficava a divergir desta à primeira
-- correção.
create or replace function public.guard_request_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     and coalesce(app_role(), '') not in ('coordenador','direcao') then
    raise exception 'Só o coordenador ou a direção podem decidir um pedido de equipamento.';
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

-- Sem notificação: receber o dinheiro à frente da pessoa não precisa de um
-- aviso a dizer-lhe que o entregou. Notificações servem para o que acontece
-- longe de quem as recebe.
