// Vista: Pedidos de Equipamento (separador de Equipamentos).
//
// O inventário diz o que o clube TEM; as encomendas dizem o tamanho de cada
// atleta. Nenhum dos dois responde à pergunta que aparece mesmo — "a Ana
// rasgou as meias, arranjas-lhe umas?". Isso vivia em mensagens de telemóvel:
// quem pede não sabe se foi tratado e quem trata não tem lista para trabalhar.
//
// Quem PEDE é o treinador ou a própria atleta (é quem veste o material); quem
// DECIDE é o coordenador/direção (é quem paga). A separação não é de UI — o
// trigger `guard_request_decision` recusa a decisão a quem pediu.
//
// Depois de confirmado, o pedido percorre o circuito real do material —
// encomendado ao fornecedor, chegou ao clube, entregue ao atleta — e cada
// paragem avisa quem pediu. O ecrã é o mesmo: o botão que se vê é sempre o
// passo SEGUINTE (`REQUEST_NEXT_STEPS`), e não uma lista de estados por onde
// escolher.

import {
  state, createEquipmentRequest, decideEquipmentRequest, setRequestPaid, setRequestsPaid,
  updateRow, deleteRow, dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML, euros, paginate, paginationHTML, wirePagination, wireEmptyAction, PAGE_SIZE } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit, canDecideRequests, isClubWide, canManageSettings } from '../permissions.js';
import {
  teamName, myTeams, equipmentArticles, playerSizes,
  articleLabel as configuredArticleLabel,
  allEquipmentArticles, articleVariant, sortSizes, kitVariantReady,
  requestCost,
} from '../compute.js';
import {
  REQUEST_REASONS,
  REQUEST_REASON_LABEL,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_BADGE,
  REQUEST_NEXT_STEPS,
  REQUEST_IN_FLIGHT,
} from '../constants.js';

// Filtros e paginação são estado de UI: vivem no módulo, não na base de dados.
let statusFilter = 'abertos'; // 'abertos' | chave de estado | 'todos'
let teamFilter = '';
let page = 1;
// Três leituras dos MESMOS pedidos, porque são três momentos do mesmo
// trabalho e nenhuma serve para o outro: decidir (Lista, pedido a pedido),
// comprar (Resumo, "quantas M no total") e ENTREGAR (Por atleta, "o que é que
// eu dou à Ana e quanto é que ela paga"). Estado de UI, como os filtros.
let mode = 'lista';

// Corpo do separador "Pedidos" (renderizado pelo orquestrador Equipamentos).
export function renderPedidosBody(container) {
  const canRequest = canEdit('equipment_requests');
  const canDecide = canDecideRequests();

  // Sem a migração a lista fica vazia — e uma lista vazia diz "ainda não há
  // pedidos", que é mentira. Avisa-se quem pode resolver.
  if (!state.equipmentRequestsReady) {
    container.innerHTML = `
      <div class="alert alert--warn">
        Falta correr a migração <code>supabase/pedidos-equipamento.sql</code> no Supabase.
        Até lá não é possível registar pedidos de equipamento.
      </div>`;
    return;
  }

  const teams = myTeams().slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const teamIds = new Set(teams.map((t) => t.id));
  const playerById = Object.fromEntries(state.players.map((p) => [p.id, p]));

  // O RLS já recorta os pedidos das equipas do treinador; aqui recorta-se
  // também a cache, para o mesmo ecrã ser coerente com o resto da app.
  const all = state.equipmentRequests
    .filter((r) => {
      const p = playerById[r.player_id];
      return p && (isClubWide() || teamIds.has(p.team_id));
    })
    .sort(byUrgency);

  const counts = { pendente: 0, aprovado: 0, encomendado: 0, pronto: 0, entregue: 0, recusado: 0 };
  all.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });
  // A caminho: confirmado ou já no fornecedor. São uma coisa só a quem olha
  // para o quadro — material decidido que ainda não está no clube.
  const aCaminho = counts.aprovado + counts.encomendado;

  // Quanto está em cima da mesa por decidir. É o número que falta a quem
  // aprova: hoje decide-se pedido a pedido sem nunca ver a soma, e sete
  // "sins" pequenos são uma despesa que ninguém chegou a aprovar. Os
  // pedidos sem preço contam-se à parte — somá-los como zero dizia que o
  // orçamento está fechado quando não está.
  const pendingCost = { total: 0, missing: 0 };
  all.filter((r) => r.status === 'pendente').forEach((r) => {
    const c = requestCost(r);
    if (c == null) pendingCost.missing++;
    else pendingCost.total += c;
  });

  // O que está por cobrar: tudo o que o clube já confirmou e ainda não
  // recebeu. Andava numa folha de cálculo à parte, que ninguém cruzava com os
  // pedidos — e daí saía o material entregue sem cobrar e o cobrado duas
  // vezes. Conta também o que já foi entregue: entregar não é receber.
  const unpaid = { count: 0, total: 0, missing: 0 };
  all.filter(isBillable).forEach((r) => {
    unpaid.count++;
    const c = requestCost(r);
    if (c == null) unpaid.missing++;
    else unpaid.total += c;
  });

  const rows = all.filter((r) => {
    if (teamFilter && playerById[r.player_id]?.team_id !== teamFilter) return false;
    if (statusFilter === 'todos') return true;
    // "Por resolver" é tudo o que ainda não chegou ao fim: por decidir e a
    // percorrer o circuito. É o filtro de origem porque é a única lista em
    // que alguém tem de fazer alguma coisa.
    if (statusFilter === 'abertos') return r.status === 'pendente' || REQUEST_IN_FLIGHT.includes(r.status);
    if (statusFilter === 'por_pagar') return isBillable(r);
    return r.status === statusFilter;
  });
  const pg = paginate(rows, page, PAGE_SIZE);

  container.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="filters" style="margin:0;padding:0;background:none;border:none;align-items:flex-end">
        ${teams.length > 1 ? `
          <div>
            <label for="req-team">Equipa</label>
            <select id="req-team">
              <option value="">Todas</option>
              ${teams.map((t) => `<option value="${t.id}" ${t.id === teamFilter ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
            </select>
          </div>` : ''}
        <div>
          <label for="req-status">Estado</label>
          <select id="req-status">
            <option value="abertos" ${statusFilter === 'abertos' ? 'selected' : ''}>Por resolver</option>
            ${REQUEST_STATUSES.map((s) => `<option value="${s.key}" ${statusFilter === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
            <option value="por_pagar" ${statusFilter === 'por_pagar' ? 'selected' : ''}>Por pagar</option>
            <option value="todos" ${statusFilter === 'todos' ? 'selected' : ''}>Todos</option>
          </select>
        </div>
        <div>
          <label for="req-mode">Ver</label>
          <select id="req-mode">
            <option value="lista" ${mode === 'lista' ? 'selected' : ''}>Lista de pedidos</option>
            <option value="resumo" ${mode === 'resumo' ? 'selected' : ''}>Resumo para encomendar</option>
            <option value="atleta" ${mode === 'atleta' ? 'selected' : ''}>Por atleta (entregas)</option>
          </select>
        </div>
        ${canRequest ? '<button class="btn btn--accent" id="add-req" type="button" style="margin-left:auto">+ Pedido</button>' : ''}
      </div>
    </div>

    <section class="cards-grid aval-summary" style="margin-bottom:1.2rem">
      <div class="card metric metric--warn aval-metric">
        <span class="metric__label">Por decidir</span>
        <strong class="metric__value">${counts.pendente}</strong>
        ${pendingCost.total
          ? `<span class="muted" style="font-size:0.8rem">${esc(euros(pendingCost.total))}${
              pendingCost.missing ? ` · ${pendingCost.missing} sem preço` : ''}</span>`
          : ''}
      </div>
      <div class="card metric metric--info aval-metric">
        <span class="metric__label">A caminho</span>
        <strong class="metric__value">${aCaminho}</strong>
        ${aCaminho
          ? `<span class="muted" style="font-size:0.8rem">${counts.aprovado} por encomendar · ${counts.encomendado} no fornecedor</span>`
          : ''}
      </div>
      <div class="card metric metric--gold aval-metric">
        <span class="metric__label">Prontos a levantar</span>
        <strong class="metric__value">${counts.pronto}</strong>
        ${counts.pronto
          ? '<span class="muted" style="font-size:0.8rem">À espera de quem os pediu</span>'
          : ''}
      </div>
      ${canDecide ? `
      <div class="card metric metric--red aval-metric">
        <span class="metric__label">Por cobrar</span>
        <strong class="metric__value">${unpaid.count}</strong>
        ${unpaid.total || unpaid.missing
          ? `<span class="muted" style="font-size:0.8rem">${
              unpaid.total ? esc(euros(unpaid.total)) : 'Sem preços'}${
              unpaid.missing ? ` · ${unpaid.missing} sem preço` : ''}</span>`
          : ''}
      </div>` : ''}
      <div class="card metric metric--green aval-metric">
        <span class="metric__label">Entregues</span>
        <strong class="metric__value">${counts.entregue}</strong>
      </div>
    </section>

    ${mode === 'resumo' ? summaryHTML(rows, playerById) : ''}
    ${mode === 'atleta' ? byPlayerHTML(rows, playerById) : ''}

    ${mode === 'lista' && rows.length
      ? `<div class="card" style="padding:0;overflow-x:auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Atleta</th>
                <th>Artigo</th>
                <th>Tam.</th>
                <th>Qt.</th>
                <th>Motivo</th>
                <th>Pedido por</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${pg.items.map((r) => rowHTML(r, playerById[r.player_id], canDecide)).join('')}
            </tbody>
          </table>
         </div>
         ${paginationHTML({ ...pg, id: 'req' })}`
      : mode !== 'lista' ? '' : emptyHTML(
          all.length
            ? 'Nenhum pedido neste filtro.'
            : 'Ainda não há pedidos de equipamento.',
          {
            icone: '🧦',
            action: canRequest && !all.length ? { key: 'add-req', label: '+ Fazer um pedido' } : null,
          }
        )
    }
  `;

  container.querySelector('#req-team')?.addEventListener('change', (e) => {
    teamFilter = e.target.value;
    page = 1;
    renderPedidosBody(container);
  });
  container.querySelector('#req-mode')?.addEventListener('change', (e) => {
    mode = e.target.value;
    page = 1;
    renderPedidosBody(container);
  });
  container.querySelector('#req-status')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    page = 1;
    renderPedidosBody(container);
  });
  container.querySelector('#add-req')?.addEventListener('click', () => openForm());
  wireEmptyAction(container, 'add-req', () => openForm());
  container.querySelectorAll('[data-edit-req]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.editReq))
  );
  container.querySelectorAll('[data-cancel-req]').forEach((b) =>
    b.addEventListener('click', () => cancelRequest(b.dataset.cancelReq))
  );
  container.querySelectorAll('[data-decide]').forEach((b) =>
    b.addEventListener('click', () => decide(b.dataset.decide, b.dataset.status))
  );
  container.querySelectorAll('[data-pay-player]').forEach((b) =>
    b.addEventListener('click', () => payAllOf(b.dataset.payPlayer.split(',')))
  );
  container.querySelectorAll('[data-paid]').forEach((b) =>
    b.addEventListener('click', () => markPaid(b.dataset.paid, !!b.dataset.paidTo))
  );
  wirePagination(container, 'req', pg.page, pg.totalPages, (np) => {
    page = np;
    renderPedidosBody(container);
  });
}

// --- Resumo para encomendar ----------------------------------------------
//
// A lista responde "o que decido a seguir", uma linha de cada vez. Não
// responde à pergunta que se leva ao fornecedor — "quantas camisolas de
// treino M, ao todo?" — e somar quarenta linhas à mão numa folha à parte é
// onde as encomendas se perdem (foi por isso que as Encomendas existem).
//
// Conta EXATAMENTE o que está no filtro em cima: mudar o estado para
// "Aprovados" dá o que já foi decidido e há mesmo que comprar; "Por resolver"
// dá o cenário completo se tudo for aprovado. Um resumo com um âmbito próprio,
// diferente do da lista ao lado, seria dois números a discordar no mesmo ecrã.
//
// A quantidade de cada pedido conta (`quantity`): três camisolas são três.
function summaryGroups(rows, playerById) {
  const groups = new Map();
  rows.forEach((r) => {
    const player = playerById[r.player_id];
    const variant = articleVariant(r.article, player?.team_id);
    const key = `${r.article}|${r.article_other || ''}|${variant}`;
    if (!groups.has(key)) {
      groups.set(key, {
        article: r.article,
        label: articleLabel(r),
        variant,
        sizes: {},
        total: 0,
        cost: 0,
        missing: 0,
      });
    }
    const g = groups.get(key);
    const qty = r.quantity || 1;
    // Um pedido sem tamanho continua a ser uma unidade a encomendar: dizer
    // "—" é pior do que deixá-lo de fora da contagem e dar um total curto.
    const size = (r.size || '').trim() || '—';
    g.sizes[size] = (g.sizes[size] || 0) + qty;
    g.total += qty;
    const c = requestCost(r);
    if (c == null) g.missing += qty;
    else g.cost += c;
  });
  // Pelo artigo (ordem da lista do clube) e, dentro dele, pela variante.
  const order = allEquipmentArticles().map((a) => a.key);
  return [...groups.values()].sort((a, b) => {
    const ia = order.indexOf(a.article);
    const ib = order.indexOf(b.article);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.variant.localeCompare(b.variant, 'pt');
  });
}

function summaryHTML(rows, playerById) {
  if (!rows.length) {
    return emptyHTML('Nenhum pedido neste filtro para somar.', { icone: '🧮' });
  }
  const groups = summaryGroups(rows, playerById);
  const units = groups.reduce((n, g) => n + g.total, 0);
  const cost = groups.reduce((n, g) => n + g.cost, 0);
  const missing = groups.reduce((n, g) => n + g.missing, 0);

  // Sem NENHUMA variante configurada, um total é só um total — e quem olha
  // para "Camisola de Treino: 15" não tem como saber que faltam ali duas
  // cores, nem que a app as sabe separar. A dica aparece exatamente nesse
  // caso, e só a quem pode ir configurá-lo: passa a ser ruído a partir do
  // momento em que o clube o fez.
  const semVariantes = canManageSettings() && groups.every((g) => !g.variant);

  // O filtro de origem ("Por resolver") junta agora o que ainda está por
  // encomendar com o que já foi encomendado e o que já chegou ao clube — e
  // esse total, levado ao fornecedor, compra tudo outra vez. O resumo conta o
  // que está no filtro, como sempre contou; o que não pode é deixar de dizer
  // o que lá está dentro.
  const jaTratados = rows.filter((r) => r.status === 'encomendado' || r.status === 'pronto').length;

  return `
    <div class="card enc-budget" style="margin-bottom:1rem">
      <div>
        <span class="enc-budget__label">A encomendar neste filtro</span>
        <strong class="enc-budget__value">${units} unidade${units !== 1 ? 's' : ''}</strong>
      </div>
      <span class="muted enc-budget__note">
        ${cost ? `${esc(euros(cost))} em artigos com preço` : 'Sem preços definidos'}
        ${missing ? ` · <strong>${missing} por orçamentar</strong>` : ''}
      </span>
    </div>

    ${jaTratados ? `
      <p class="muted" style="margin:-0.4rem 0 1rem;font-size:0.85rem">
        Neste filtro há <strong>${jaTratados}</strong> pedido${jaTratados === 1 ? '' : 's'}
        já encomendado${jaTratados === 1 ? '' : 's'} ao fornecedor ou já no clube, e
        ${jaTratados === 1 ? 'entra' : 'entram'} nestas contas. Para veres só o que falta
        encomendar, escolhe o estado <strong>Confirmado</strong>.
      </p>` : ''}

    ${semVariantes ? `
      <p class="muted" style="margin:-0.4rem 0 1rem;font-size:0.85rem">
        Estas contagens juntam todas as equipas. Se um artigo for de cores
        diferentes conforme o escalão — a camisola de treino azul nos sub-21 e
        branca nos restantes —, escreve a cor de origem do artigo em
        <strong>Definições → Estrutura</strong> e a da equipa que foge à regra
        na ficha da equipa, nos Plantéis${kitVariantReady() ? '' : ' (falta correr <code>supabase/variante-equipamento.sql</code>)'}.
        O resumo passa a contá-las em separado.
      </p>` : ''}

    <div class="enc-resumo-grid">
      ${groups.map((g) => {
        const article = allEquipmentArticles().find((a) => a.key === g.article);
        const entries = sortSizes(Object.keys(g.sizes), article).map((k) => [k, g.sizes[k]]);
        return `
          <div class="card enc-resumo-card">
            <h3 class="enc-resumo-title">
              ${esc(g.label)}
              ${g.variant ? `<span class="badge badge--muted">${esc(g.variant)}</span>` : ''}
            </h3>
            <ul class="enc-resumo-list">
              ${entries.map(([size, count]) => `
                <li class="enc-resumo-row">
                  <span class="badge badge--info enc-resumo-size">${esc(size)}</span>
                  <span class="enc-resumo-count">${count}×</span>
                  <div class="enc-resumo-bar-wrap">
                    <div class="enc-resumo-bar" style="width:${Math.round((count / g.total) * 100)}%"></div>
                  </div>
                </li>
              `).join('')}
            </ul>
            <p class="muted enc-resumo-total">
              Total: ${g.total} unidade${g.total !== 1 ? 's' : ''}
              ${g.cost ? `· <strong>${esc(euros(g.cost))}</strong>` : ''}
              ${g.missing ? `· <span class="enc-resumo-unit">${g.missing} sem preço</span>` : ''}
            </p>
          </div>`;
      }).join('')}
    </div>
  `;
}

// --- Por atleta (entregas) -----------------------------------------------
//
// O resumo diz o que se COMPRA; esta vista diz o que se ENTREGA, que é o
// momento a seguir e uma pergunta diferente: chegou a caixa, e agora é preciso
// saber o que leva cada uma e quanto é que fica a dever. Na lista, os pedidos
// da Ana estão espalhados por três páginas entre os das outras vinte — e a
// entrega faz-se atleta a atleta, com ela à frente.
//
// **Agrupa-se por EQUIPA e cada equipa abre-se** (`<details class="group">`, a
// mesma forma dos utilizadores e dos convites): sessenta cartões de atleta em
// coluna eram um scroll sem fim, e a entrega nunca é do clube inteiro — é do
// escalão que está no pavilhão naquela tarde. Os grupos nascem FECHADOS, com o
// que interessa já no cabeçalho (quantas atletas, quanto há a cobrar), para a
// primeira coisa que se vê ser a escolha do escalão e não o conteúdo de todos.
// Com uma equipa só — porque o clube só tem uma, ou porque o filtro em cima já
// escolheu — abre, que não há nada para escolher.
//
// O valor é o do artigo ao preço de HOJE (`requestCost`, o mesmo do resto do
// ecrã); os artigos sem preço contam-se à parte, nunca como zero.
function byPlayerHTML(rows, playerById) {
  if (!rows.length) {
    return emptyHTML('Nenhum pedido neste filtro.', { icone: '🎽' });
  }

  const byPlayer = new Map();
  rows.forEach((r) => {
    const player = playerById[r.player_id];
    const key = r.player_id || 'sem-atleta';
    if (!byPlayer.has(key)) {
      byPlayer.set(key, {
        name: player?.name || 'Atleta removido',
        number: player?.number || null,
        teamId: player?.team_id || '',
        team: player ? teamName(state.teams.find((t) => t.id === player.team_id)) : 'Sem equipa',
        items: [],
        units: 0,
        owed: 0,   // ainda por cobrar
        paid: 0,   // já entregue em dinheiro
        missing: 0,
        unpaidIds: [],
      });
    }
    const g = byPlayer.get(key);
    const c = requestCost(r);
    g.items.push({ req: r, cost: c });
    g.units += r.quantity || 1;
    if (c == null) g.missing += r.quantity || 1;
    else if (r.paid_at) g.paid += c;
    else g.owed += c;
    // Só entra no "marcar tudo como pago" o que já é cobrável (`isBillable`):
    // um pedido que ainda pode ser recusado não se cobra.
    if (isBillable(r)) g.unpaidIds.push(r.id);
  });

  // Equipas por nome; dentro de cada uma, as atletas por nome.
  const teams = new Map();
  [...byPlayer.values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
    .forEach((p) => {
      if (!teams.has(p.teamId)) teams.set(p.teamId, { label: p.team, players: [] });
      teams.get(p.teamId).players.push(p);
    });
  const teamList = [...teams.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt'));

  const owed = [...byPlayer.values()].reduce((n, g) => n + g.owed, 0);
  const paid = [...byPlayer.values()].reduce((n, g) => n + g.paid, 0);
  const canPay = canDecideRequests() && state.requestFlowReady;

  return `
    <div class="card enc-budget" style="margin-bottom:1rem">
      <div>
        <span class="enc-budget__label">Por cobrar neste filtro</span>
        <strong class="enc-budget__value">${owed ? esc(euros(owed)) : '—'}</strong>
      </div>
      <span class="muted enc-budget__note">
        ${byPlayer.size} atleta${byPlayer.size !== 1 ? 's' : ''}
        em ${teamList.length} equipa${teamList.length !== 1 ? 's' : ''}
        ${paid ? ` · ${esc(euros(paid))} já pagos` : ''}
      </span>
    </div>

    ${teamList.map((t) => {
      const tOwed = t.players.reduce((n, p) => n + p.owed, 0);
      const tIds = t.players.flatMap((p) => p.unpaidIds);
      return `
        <details class="group" ${teamList.length === 1 ? 'open' : ''}>
          <summary class="group__head">
            <span class="group__title">${esc(t.label)}</span>
            <span class="group__count">${t.players.length}</span>
            <span class="muted" style="margin-left:auto;font-size:0.85rem">
              ${tOwed ? `${esc(euros(tOwed))} por cobrar` : 'tudo pago'}
            </span>
          </summary>
          <div style="padding:0.9rem">
            ${canPay && tIds.length > 1 ? `
              <button class="btn btn--ghost btn--sm" data-pay-player="${esc(tIds.join(','))}" type="button"
                      style="margin-bottom:0.8rem">
                Marcar a equipa toda como paga (${tIds.length})
              </button>` : ''}
            <div class="enc-resumo-grid enc-resumo-grid--wide">
              ${t.players.map((g) => playerCardHTML(g, playerById, canPay)).join('')}
            </div>
          </div>
        </details>`;
    }).join('')}
  `;
}

// O cartão de UMA atleta: o que leva, o que já pagou e o que fica a dever.
function playerCardHTML(g, playerById, canPay) {
  return `
    <div class="card enc-resumo-card">
      <h3 class="enc-resumo-title" style="text-transform:none;letter-spacing:0">
        ${g.number ? `<span class="muted">${esc(String(g.number))}</span> ` : ''}${esc(g.name)}
      </h3>
      <ul class="portal-req-list">
        ${g.items.map(({ req, cost }) => `
          <li class="portal-req">
            <div class="portal-req__main">
              <span class="portal-req__art">
                ${esc(articleLabel(req))}
                ${(() => {
                  const v = articleVariant(req.article, playerById[req.player_id]?.team_id);
                  return v ? `<span class="badge badge--muted">${esc(v)}</span>` : '';
                })()}
              </span>
              <span class="badge badge--${REQUEST_STATUS_BADGE[req.status] || 'muted'}">
                ${esc(REQUEST_STATUS_LABEL[req.status] || req.status)}
              </span>
            </div>
            <p class="portal-req__meta muted">
              ${req.size ? `Tamanho ${esc(req.size)}` : 'Sem tamanho'}
              ${req.quantity > 1 ? ` · ×${req.quantity}` : ''}
              ${cost != null ? ` · ${esc(euros(cost))}` : ' · sem preço'}
              ${req.paid_at ? ' · <strong>pago</strong>' : ''}
            </p>
            ${canPay && isBillable(req) ? `
              <button class="btn btn--ghost btn--sm" data-paid="${req.id}" data-paid-to="1" type="button">Marcar pago</button>` : ''}
          </li>
        `).join('')}
      </ul>
      <p class="muted enc-resumo-total">
        ${g.units} artigo${g.units !== 1 ? 's' : ''}
        ${g.owed
          ? `· <strong>${esc(euros(g.owed))}</strong> a pagar`
          : (g.paid ? '· <strong>tudo pago</strong>' : '')}
        ${g.paid && g.owed ? `· ${esc(euros(g.paid))} já pagos` : ''}
        ${g.missing ? `· <span class="enc-resumo-unit">${g.missing} sem preço</span>` : ''}
      </p>
      ${canPay && g.unpaidIds.length > 1 ? `
        <button class="btn btn--ghost btn--sm" data-pay-player="${esc(g.unpaidIds.join(','))}" type="button">
          Marcar tudo como pago (${g.unpaidIds.length})
        </button>` : ''}
    </div>`;
}

// Ordem: primeiro o que está por resolver (mais antigo à frente — é o que já
// espera há mais tempo), depois o histórico do mais recente para trás. As
// paragens do circuito ordenam-se pelo circuito: o que está pronto a levantar
// está mais perto de acabar do que o que ainda nem foi encomendado, mas é o
// que tem alguém à espera do outro lado — por isso sobe.
const OPEN_ORDER = { pendente: 0, pronto: 1, aprovado: 2, encomendado: 2, entregue: 3, recusado: 3 };
const DONE_FROM = 3;
function byUrgency(a, b) {
  const oa = OPEN_ORDER[a.status] ?? DONE_FROM;
  const ob = OPEN_ORDER[b.status] ?? DONE_FROM;
  if (oa !== ob) return oa - ob;
  const da = a.created_at || '';
  const db = b.created_at || '';
  return oa < DONE_FROM ? da.localeCompare(db) : db.localeCompare(da);
}

// Um pedido por cobrar: o clube confirmou-o (logo, comprometeu a verba) e
// ainda não recebeu o dinheiro. Um pedido recusado não se cobra; um pedido
// entregue cobra-se na mesma — entregar não é receber, e foi por confundir as
// duas coisas que houve material entregue que ninguém cobrou.
function isBillable(r) {
  return !r.paid_at && (REQUEST_IN_FLIGHT.includes(r.status) || r.status === 'entregue');
}

function articleLabel(req) {
  if (req.article === 'outro') return req.article_other?.trim() || 'Outro artigo';
  // Passa pela lista configurada do clube, e essa também traduz os artigos
  // já desativados: um pedido de dezembro tem de continuar a dizer "Blusão".
  return configuredArticleLabel(req.article);
}

// Quem pediu. O nome do treinador vem da ficha (coaches.user_id); só o
// coordenador tem a lista de perfis, por isso o email é recurso, não regra.
function requesterLabel(uid) {
  if (!uid) return '—';
  if (uid === state.profile?.id) return 'Tu';
  const coach = state.coaches.find((c) => c.user_id === uid);
  if (coach) return coach.name;
  // Pedido feito pela PRÓPRIA atleta, do portal. Distingui-lo importa para
  // quem decide: um pedido do treinador já passou por um adulto que viu o
  // material, e este não — e a resposta vai ser lida por ela.
  const player = state.players.find((p) => p.user_id === uid);
  if (player) return `${player.name} (a própria)`;
  const profile = state.profiles?.find((p) => p.id === uid);
  return profile?.email || '—';
}

function rowHTML(req, player, canDecide) {
  const badge = REQUEST_STATUS_BADGE[req.status] || 'muted';
  const label = REQUEST_STATUS_LABEL[req.status] || req.status;
  // Editar/cancelar é de quem pediu, e só enquanto ninguém decidiu — depois
  // disso o pedido é histórico (espelha as políticas de UPDATE/DELETE).
  const mine = req.requested_by && req.requested_by === state.profile?.id;
  const canAmend = mine && req.status === 'pendente';
  // O botão que se vê é o passo SEGUINTE e mais nenhum: uma lista de estados
  // por onde escolher é a forma de um pedido saltar do "confirmado" para o
  // "entregue" sem nunca ter passado pelo fornecedor. Sem a migração do
  // circuito, só se pode confirmar, recusar e entregar — o servidor recusa as
  // paragens novas, e um botão que dá erro é pior do que não existir.
  const steps = canDecide
    ? (REQUEST_NEXT_STEPS[req.status] || [])
        .filter((st) => state.requestFlowReady || st.status === 'aprovado' || st.status === 'entregue')
    : [];
  const fallbackEntrega = canDecide && !state.requestFlowReady && req.status === 'aprovado'
    ? [{ status: 'entregue', label: 'Entregue ao atleta' }] : [];

  return `
    <tr>
      <td>
        <span class="enc-player-name">${esc(player?.name || 'Atleta removido')}</span>
        ${player ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(teamName(state.teams.find((t) => t.id === player.team_id)) || '')}</span>` : ''}
      </td>
      <td>${esc(articleLabel(req))}</td>
      <td>${req.size ? `<span class="badge badge--info">${esc(req.size)}</span>` : '<span class="muted">—</span>'}</td>
      <td>
        ${req.quantity}
        ${(() => { const c = requestCost(req); return c != null
          ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(euros(c))}</span>`
          : ''; })()}
      </td>
      <td>
        ${esc(REQUEST_REASON_LABEL[req.reason] || req.reason)}
        ${req.notes ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(req.notes)}</span>` : ''}
      </td>
      <td>
        ${esc(requesterLabel(req.requested_by))}
        <span class="muted" style="display:block;font-size:0.8rem">${esc(shortDate(req.created_at))}</span>
      </td>
      <td>
        <span class="badge badge--${badge}">${esc(label)}</span>
        ${req.paid_at
          ? '<span class="badge badge--ok">Pago</span>'
          : isBillable(req) ? '<span class="badge badge--warn">Por pagar</span>' : ''}
        ${req.decision_note ? `<span class="muted" style="display:block;font-size:0.8rem">${esc(req.decision_note)}</span>` : ''}
      </td>
      <td class="cell-actions">
        ${[...steps, ...fallbackEntrega].map((st) => `
          <button class="btn btn--ghost btn--sm" data-decide="${req.id}" data-status="${st.status}" type="button">${esc(st.label)}</button>`).join('')}
        ${canDecide && req.status === 'pendente' ? `
          <button class="btn btn--danger btn--sm" data-decide="${req.id}" data-status="recusado" type="button">Recusar</button>` : ''}
        ${canDecide && state.requestFlowReady && isBillable(req) ? `
          <button class="btn btn--ghost btn--sm" data-paid="${req.id}" data-paid-to="1" type="button">Marcar pago</button>` : ''}
        ${canDecide && state.requestFlowReady && req.paid_at ? `
          <button class="btn btn--ghost btn--sm" data-paid="${req.id}" data-paid-to="" type="button">Desmarcar pago</button>` : ''}
        ${canAmend ? `
          <button class="btn btn--ghost btn--sm" data-edit-req="${req.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-cancel-req="${req.id}" type="button">Cancelar</button>` : ''}
      </td>
    </tr>
  `;
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('pt-PT');
}

// --- Decidir --------------------------------------------------------------

async function decide(id, status) {
  const req = state.equipmentRequests.find((r) => r.id === id);
  if (!req) return;

  // A recusa PEDE motivo: uma recusa sem explicação volta como o mesmo pedido
  // na semana seguinte, e o treinador fica sem saber se pode resolver de outra
  // maneira. Aprovar e entregar não precisam de conversa.
  if (status === 'recusado') {
    openModal({
      title: 'Recusar pedido',
      submitLabel: 'Recusar',
      fields: [{
        name: 'decision_note', label: 'Motivo', type: 'textarea', required: true, full: true,
        placeholder: 'ex.: sem stock até janeiro — usar as do ano passado',
        hint: 'Chega a quem pediu, por notificação.',
      }],
      onSubmit: async (v) => {
        try {
          await decideEquipmentRequest(id, 'recusado', v.decision_note);
        } catch (err) {
          throw new Error(dbErrorMessage(err));
        }
      },
    });
    return;
  }

  try {
    await decideEquipmentRequest(id, status);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// Dar (ou tirar) a quitação. Não pede confirmação: é reversível no botão ao
// lado, e um diálogo por linha numa lista de quarenta é o que faz ninguém
// marcar nada.
// Tudo o que uma atleta tem por pagar, de uma vez: é assim que o dinheiro
// muda de mãos ao balcão — ela não paga as meias e depois o blusão. Uma
// escrita por linha, um só toast e um só re-desenho, na lógica do
// `closeAttendanceSessions`.
async function payAllOf(ids) {
  try {
    await setRequestsPaid(ids.filter(Boolean), true);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function markPaid(id, paid) {
  try {
    await setRequestPaid(id, paid);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function cancelRequest(id) {
  const req = state.equipmentRequests.find((r) => r.id === id);
  const player = state.players.find((p) => p.id === req?.player_id);
  const ok = await confirmDialog(
    `Cancelar o pedido de ${articleLabel(req || {})} para ${player?.name || 'este atleta'}?`
  );
  if (!ok) return;
  try {
    await deleteRow('equipment_requests', 'equipmentRequests', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// --- Formulário -----------------------------------------------------------

// Opções de artigo: a lista da encomenda mais "outro". O "outro" existe porque
// o material que se pede a meio da época é muitas vezes o que não está na
// lista de equipamento oficial (joelheiras, uma bola para levar para casa).
function articleOptions() {
  return [
    ...equipmentArticles().map((a) => ({ key: a.key, label: a.label })),
    { key: 'outro', label: 'Outro artigo…' },
  ];
}

// Tamanho já registado na ficha do atleta para aquele artigo.
function sizeFromFile(playerId, article) {
  if (!playerId || !article || article === 'outro') return '';
  return playerSizes(playerId)[article] || '';
}

function openForm(id, draft) {
  const existing = id ? state.equipmentRequests.find((r) => r.id === id) : null;
  const teams = myTeams().slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  const base = existing
    ? { ...existing, team_id: state.players.find((p) => p.id === existing.player_id)?.team_id || '' }
    : { quantity: '1', reason: 'novo', team_id: teamFilter || teams[0]?.id || '' };
  const values = draft || base;

  const teamId = values.team_id || '';
  const article = values.article || '';
  const articles = equipmentArticles();
  // Os tamanhos possíveis são os que o clube definiu PARA ESTE ARTIGO. Sem
  // nenhum definido (as meias, o "outro"), o campo é texto livre.
  const articleSizes = articles.find((a) => a.key === article)?.sizes || [];

  const players = state.players
    .filter((p) => !teamId || p.team_id === teamId)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // Se o atleta escolhido já não é da equipa filtrada, o campo fica vazio em
  // vez de guardar em silêncio um atleta que já não está na lista.
  if (values.player_id && !players.some((p) => p.id === values.player_id)) {
    values.player_id = '';
  }

  const suggested = sizeFromFile(values.player_id, article);

  const fields = [
    ...(teams.length > 1 ? [{
      name: 'team_id', label: 'Equipa', type: 'select', required: true, reactive: true,
      placeholder: 'Escolher equipa…',
      options: teams.map((t) => ({ key: t.id, label: teamName(t) })),
    }] : []),
    {
      name: 'player_id', label: 'Atleta', type: 'select', required: true, reactive: true,
      placeholder: players.length ? 'Escolher atleta…' : 'Esta equipa não tem atletas',
      options: players.map((p) => ({ key: p.id, label: p.number ? `${p.number} · ${p.name}` : p.name })),
    },
    {
      name: 'article', label: 'Artigo', type: 'select', required: true, reactive: true,
      placeholder: 'Escolher artigo…',
      options: articleOptions(),
    },
  ];

  if (article === 'outro') {
    fields.push({
      name: 'article_other', label: 'Qual?', required: true,
      placeholder: 'ex.: joelheiras',
    });
  }

  // O tamanho vem pré-preenchido da ficha, mas é editável: um pedido acontece
  // muitas vezes porque o tamanho registado deixou de servir.
  fields.push(
    articleSizes.length
      ? {
          name: 'size', label: 'Tamanho', type: 'select',
          placeholder: '— Não definido —',
          options: articleSizes.map((s) => ({ key: s, label: s })),
          hint: suggested ? `Da ficha do atleta: ${suggested}.` : 'A ficha do atleta ainda não tem este tamanho.',
        }
      : {
          name: 'size', label: 'Tamanho', type: 'text',
          placeholder: 'ex.: 38',
          hint: suggested ? `Da ficha do atleta: ${suggested}.` : undefined,
        }
  );

  fields.push(
    { name: 'quantity', label: 'Quantidade', type: 'number', required: true, default: '1' },
    {
      name: 'reason', label: 'Motivo', type: 'select', required: true,
      options: REQUEST_REASONS.map((r) => ({ key: r.key, label: r.label })),
      hint: 'É o que decide entre aprovar e recusar.',
    },
    { name: 'notes', label: 'Notas', type: 'textarea', full: true, placeholder: 'Opcional…' },
  );

  let close;
  close = openModal({
    title: existing ? 'Editar pedido' : 'Novo pedido de equipamento',
    submitLabel: existing ? 'Guardar' : 'Pedir',
    values: { ...values, size: values.size ?? suggested },
    fields,
    // Trocar de equipa, de atleta ou de artigo reconstrói o formulário. O
    // tamanho é recalculado da ficha nessas três mudanças — deixar lá o "M" do
    // artigo anterior é pior do que não sugerir nada.
    onFieldChange: (name, current) => {
      close?.();
      const next = { ...values, ...current };
      if (name === 'team_id' || name === 'player_id' || name === 'article') delete next.size;
      openForm(id, next);
    },
    onSubmit: async (v) => {
      const qty = parseInt(v.quantity, 10) || 1;
      const payload = {
        player_id: v.player_id,
        article: v.article,
        article_other: v.article === 'outro' ? v.article_other?.trim() || null : null,
        size: v.size?.trim() || null,
        quantity: Math.min(Math.max(qty, 1), 50),
        reason: v.reason || 'novo',
        notes: v.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('equipment_requests', 'equipmentRequests', id, payload);
        else await createEquipmentRequest(payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}
