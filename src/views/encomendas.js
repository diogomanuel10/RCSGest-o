// Vista: Encomendas de Equipamento.
// Dois separadores:
//   1. Tamanhos por atleta — tabela por equipa, editável pelo coordenador.
//   2. Resumo para encomenda — agrega os tamanhos de cada artigo da equipa.
//
// O que está nesta tabela não foi confirmado por ninguém: o número, o nome a
// estampar e os tamanhos foram escritos de memória ou saíram de uma medição
// da época passada, e o erro só aparece quando a caixa chega — uma camisola
// estampada não se troca. Por isso cada linha tem a mensagem pronta a enviar
// à família (`sizes-message.js`) e o pisco de "confirmado" para quem
// respondeu: a confirmação já se fazia por WhatsApp, o que faltava era saber,
// olhando para a lista, em qual das vinte famílias é que se ia.
//
// A terceira marca da linha é o PAGAMENTO. O material é cobrado à família, e
// isso vivia numa folha à parte que ninguém cruzava com esta lista — daí
// saía a encomenda entregue que ninguém cobrou e a família que pagou duas
// vezes. A mesma decisão do `paid_at` dos Pedidos: uma marca, não uma tabela
// de pagamentos nem um lançamento no Financeiro. Quem falta pagar responde-se
// pelo filtro "Por pagar" e pelo que está por cobrar no topo.

import { state, upsertPlayerSizes, setSizesConfirmed, setSizesPaid, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, euros } from '../ui.js';
import { teamName, equipmentArticles, playerSizes, sortSizes } from '../compute.js';
import { openModal } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import { canEdit } from '../permissions.js';
import { exportEncomendaXLSX } from '../encomendas-xlsx.js';
import { branding } from '../branding.js';
import { sizesMessage, contactChannel, sendVia } from '../sizes-message.js';

let selectedTeam = '';
let tab = 'tamanhos'; // 'tamanhos' | 'resumo'
// Que linhas mostrar na tabela de tamanhos. "Por pagar" é a razão por que
// este filtro existe: numa equipa de vinte, saber quem falta cobrar é
// percorrer vinte linhas à procura de um crachá — e é um trabalho que se faz
// com a família à frente, ao balcão. O filtro nunca toca no separador
// Resumo: essa é a lista que vai ao fornecedor, e o fornecedor entrega a
// encomenda toda, tenha ou não sido paga.
let filtro = 'todos'; // 'todos' | 'por_pagar' | 'por_confirmar' | 'sem_tamanhos'

// Corpo do separador "Encomendas" (renderizado pelo orquestrador Equipamentos).
export function renderEncomendasBody(container) {
  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  if (!teams.length) {
    container.innerHTML = emptyHTML('Ainda não há equipas registadas. Começa pelos Plantéis.');
    return;
  }

  if (!selectedTeam || !teams.some((t) => t.id === selectedTeam)) {
    selectedTeam = teams[0].id;
  }

  const team = teams.find((t) => t.id === selectedTeam);
  const players = state.players
    .filter((p) => p.team_id === selectedTeam)
    .sort((a, b) => {
      const na = parseInt(a.number, 10);
      const nb = parseInt(b.number, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  const editable = canEdit('sizes');

  container.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="filters" style="margin:0;padding:0;background:none;border:none;align-items:flex-end">
        <div>
          <label for="enc-team">Equipa</label>
          <select id="enc-team">
            ${teams.map((t) => `
              <option value="${t.id}" ${t.id === selectedTeam ? 'selected' : ''}>${esc(teamName(t))}</option>
            `).join('')}
          </select>
        </div>
        <div class="pres-tabs">
          <button class="pres-tab${tab === 'tamanhos' ? ' pres-tab--active' : ''}" data-tab="tamanhos" type="button">Tamanhos</button>
          <button class="pres-tab${tab === 'resumo' ? ' pres-tab--active' : ''}" data-tab="resumo" type="button">Resumo encomenda</button>
        </div>
        ${tab === 'tamanhos' ? `
          <div>
            <label for="enc-filtro">Mostrar</label>
            <select id="enc-filtro">
              <option value="todos" ${filtro === 'todos' ? 'selected' : ''}>Todos</option>
              ${state.sizesPaidReady ? `<option value="por_pagar" ${filtro === 'por_pagar' ? 'selected' : ''}>Por pagar</option>` : ''}
              ${state.sizesConfirmReady ? `<option value="por_confirmar" ${filtro === 'por_confirmar' ? 'selected' : ''}>Por confirmar</option>` : ''}
              <option value="sem_tamanhos" ${filtro === 'sem_tamanhos' ? 'selected' : ''}>Sem tamanhos</option>
            </select>
          </div>` : ''}
        <button class="btn btn--ghost btn--sm" id="enc-export" type="button" style="margin-left:auto" title="Exportar a encomenda desta equipa">⬇ Exportar Excel</button>
      </div>
    </div>

    ${tab === 'tamanhos'
      ? renderTamanhos(players, team, editable)
      : renderResumo(players, team)}
  `;

  container.querySelector('#enc-team').addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    renderEncomendasBody(container);
  });
  container.querySelector('#enc-export').addEventListener('click', (e) => {
    handleExport(e.currentTarget, team, players);
  });
  container.querySelector('#enc-filtro')?.addEventListener('change', (e) => {
    filtro = e.target.value;
    renderEncomendasBody(container);
  });
  container.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => { tab = btn.dataset.tab; renderEncomendasBody(container); });
  });
  container.querySelectorAll('[data-edit-sizes]').forEach((btn) => {
    btn.addEventListener('click', () => openSizesModal(btn.dataset.editSizes, container));
  });
  container.querySelectorAll('[data-send-sizes]').forEach((btn) => {
    btn.addEventListener('click', () => sendSizesMessage(btn.dataset.sendSizes, team));
  });
  container.querySelectorAll('[data-copy-sizes]').forEach((btn) => {
    btn.addEventListener('click', () => copySizesMessage(btn.dataset.copySizes, team));
  });
  container.querySelectorAll('[data-confirm-sizes]').forEach((btn) => {
    btn.addEventListener('click', () => confirmSizes(btn.dataset.confirmSizes, !!btn.dataset.to));
  });
  container.querySelectorAll('[data-paid-sizes]').forEach((btn) => {
    btn.addEventListener('click', () => payOrder(btn.dataset.paidSizes, !!btn.dataset.to));
  });
}

// ---------------------------------------------------------------------------
// A mensagem de confirmação, atleta a atleta
// ---------------------------------------------------------------------------

function messageFor(playerId, team) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return null;
  const row = sizesRow(playerId);
  return sizesMessage({
    player,
    team: team ? teamName(team) : '',
    // `playerSizes()` já resolve o formato antigo (uma coluna por artigo) e o
    // novo (`sizes` jsonb): a mensagem não pode depender de a migração dos
    // artigos ter corrido.
    row: { ...row, sizes: playerSizes(playerId) },
    // Os artigos que o clube marcou como "fora da mensagem" (o ✉ nas
    // Definições) não entram: há peças que o clube trata sozinho e sobre as
    // quais não faz pergunta nenhuma à família. Continuam na encomenda, no
    // resumo e no `.xlsx` — o que sai é só a pergunta.
    articles: equipmentArticles().filter((a) => !a.no_confirm),
    clubName: branding().club_name || '',
  });
}

function sendSizesMessage(playerId, team) {
  const player = state.players.find((p) => p.id === playerId);
  const ch = contactChannel(player?.guardian_contact);
  const text = messageFor(playerId, team);
  if (!ch || !text) return;
  sendVia(ch, { subject: `Equipamento — confirmar dados de ${player.name}`, text });
}

function copySizesMessage(playerId, team) {
  const text = messageFor(playerId, team);
  if (!text) return;
  navigator.clipboard?.writeText(text).then(
    () => toastOk('Mensagem copiada.'),
    () => toastError('O browser não deixou copiar. Abre a ficha e copia à mão.')
  );
}

// Carimbar a resposta da família. Não pede confirmação: é reversível no botão
// ao lado, e um diálogo por linha numa lista de vinte é o que faz ninguém
// marcar nada.
async function confirmSizes(playerId, confirmed) {
  try {
    await setSizesConfirmed(playerId, confirmed);
    toastOk(confirmed ? 'Dados confirmados.' : 'Confirmação retirada.');
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// Dar a quitação de uma encomenda. Como o carimbo da confirmação, não pede
// diálogo: desfaz-se no mesmo botão, e um diálogo por linha num sábado de
// entregas é o que faz ninguém marcar nada.
async function payOrder(playerId, paid) {
  try {
    await setSizesPaid([playerId], paid);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// ---------------------------------------------------------------------------
// Separador 1: tamanhos por atleta
// ---------------------------------------------------------------------------

function renderTamanhos(players, team, editable) {
  if (!players.length) return emptyHTML('Esta equipa não tem atletas registadas.');

  const articles = equipmentArticles();
  if (!articles.length) {
    return emptyHTML(
      'O clube não tem artigos de equipamento definidos. Configura-os nas Definições → Estrutura.'
    );
  }

  const filled = players.filter((p) => Object.keys(playerSizes(p.id)).length).length;
  const pct = Math.round((filled / players.length) * 100);
  // "Preenchido" e "confirmado" são duas perguntas diferentes, e a segunda é
  // a que decide se se pode encomendar: uma tabela cheia de tamanhos que
  // ninguém validou parece pronta e não está. "Pago" é a terceira, e é a
  // única que continua a contar depois de a caixa chegar.
  const confirmed = players.filter((p) => sizesRow(p.id).confirmed_at).length;
  const cobranca = teamBilling(players, articles);
  // A pergunta "quem falta pagar" quase nunca é de uma equipa só: quem trata
  // da cobrança tem dez escalões e não abre dez separadores para saber quanto
  // lhe falta receber. A linha do clube custa uma soma e responde de uma vez —
  // a lista continua a ser por equipa, porque é assim que se cobra (com o
  // escalão à frente, no pavilhão daquela tarde).
  const clube = state.teams.length > 1 ? teamBilling(state.players, articles) : null;

  const shown = players.filter((p) => matchesFilter(p, articles));

  return `
    <div class="card" style="margin-bottom:0.8rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      <span class="muted" style="font-size:0.88rem">
        ${filled} de ${players.length} atleta${players.length !== 1 ? 's' : ''} com tamanhos preenchidos
      </span>
      <div class="enc-progress">
        <div class="enc-progress__bar" style="width:${pct}%"></div>
      </div>
      <span class="muted" style="font-size:0.88rem">${pct}%</span>
      ${state.sizesConfirmReady ? `
        <span class="badge badge--${confirmed === players.length ? 'ok' : 'warn'}" style="margin-left:auto">
          ${confirmed} de ${players.length} confirmado${confirmed === 1 ? '' : 's'} pela família
        </span>` : ''}
    </div>

    ${state.sizesPaidReady && cobranca.billable ? `
      <div class="card enc-budget" style="margin-bottom:0.8rem">
        <div>
          <span class="enc-budget__label">Por cobrar nesta equipa</span>
          <strong class="enc-budget__value">${esc(euros(cobranca.owed))}</strong>
        </div>
        <span class="muted enc-budget__note">
          ${cobranca.paid} de ${cobranca.billable} encomenda${cobranca.billable !== 1 ? 's' : ''} paga${cobranca.paid === 1 ? '' : 's'}
          ${cobranca.received ? `· ${esc(euros(cobranca.received))} já recebidos` : ''}
          ${cobranca.missing
            ? `· <strong>${cobranca.missing} artigo${cobranca.missing !== 1 ? 's' : ''} por orçamentar</strong> (${esc(cobranca.missingLabels)})`
            : ''}
          ${clube && clube.billable > cobranca.billable ? `
            <br>No clube inteiro: ${esc(euros(clube.owed))} por cobrar em
            ${clube.billable - clube.paid} de ${clube.billable} encomendas` : ''}
        </span>
      </div>` : ''}

    ${filtro !== 'todos' ? `
      <p class="muted" style="margin:0 0 0.6rem;font-size:0.88rem">
        A mostrar ${shown.length} de ${players.length} atleta${players.length !== 1 ? 's' : ''} · ${esc(FILTER_LABELS[filtro] || '')}
      </p>` : ''}

    ${!shown.length ? emptyHTML(EMPTY_BY_FILTER[filtro] || 'Nenhum atleta corresponde a este filtro.') : `

    <!-- Tabela (desktop) -->
    <div class="enc-table-wrap card">
      <table class="data-table enc-table">
        <thead>
          <tr>
            <th class="enc-col-num">Nº</th>
            <th class="enc-col-player">Atleta</th>
            ${articles.map((a) => `<th class="enc-col-art">${esc(a.label)}</th>`).join('')}
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${shown.map((p) => {
            const sizes = playerSizes(p.id);
            const row = state.playerSizes.find((s) => s.player_id === p.id) || {};
            const hasAny = articles.some((a) => sizes[a.key]);
            return `
              <tr class="${hasAny ? '' : 'enc-row--empty'}">
                <td class="enc-col-num">${p.number ? `<span class="badge badge--num">${esc(p.number)}</span>` : '<span class="muted">—</span>'}</td>
                <td class="enc-col-player">
                  <span class="enc-player-name">${esc(p.name)}</span>
                  ${confirmBadgeHTML(row)}
                  ${paidBadgeHTML(row, p, articles)}
                  ${jerseyNameHTML(row)}
                </td>
                ${articles.map((a) => `
                  <td class="enc-col-art enc-col-art--val">
                    ${sizes[a.key]
                      ? `<span class="badge badge--info">${esc(sizes[a.key])}</span>`
                      : '<span class="muted enc-empty">—</span>'}
                  </td>
                `).join('')}
                <td class="row-actions cell-actions">${rowActionsHTML(p, row, editable)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Cards (mobile) -->
    <div class="enc-cards">
      ${shown.map((p) => {
        const sizes = playerSizes(p.id);
        const row = state.playerSizes.find((s) => s.player_id === p.id) || {};
        const hasAny = articles.some((a) => sizes[a.key]);
        return `
          <div class="card enc-card${hasAny ? '' : ' enc-card--empty'}">
            <div class="enc-card-head">
              ${p.number ? `<span class="badge badge--num">${esc(p.number)}</span>` : ''}
              <span class="enc-player-name">${esc(p.name)}</span>
              ${confirmBadgeHTML(row)}
              ${paidBadgeHTML(row, p, articles)}
            </div>
            ${jerseyNameHTML(row)}
            <div class="enc-card-actions">${rowActionsHTML(p, row, editable)}</div>
            <dl class="enc-card-dl">
              ${articles.map((a) => `
                <div class="enc-card-dl-row">
                  <dt>${esc(a.label)}</dt>
                  <dd>${sizes[a.key] ? `<span class="badge badge--info">${esc(sizes[a.key])}</span>` : '<span class="muted">—</span>'}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
        `;
      }).join('')}
    </div>
  `}
  `;
}

// A linha de `player_sizes` de um atleta (ou um objeto vazio). É onde vivem
// os nomes a estampar e a marca de confirmação — `playerSizes()` só devolve
// os TAMANHOS.
function sizesRow(playerId) {
  return state.playerSizes.find((s) => s.player_id === playerId) || {};
}

// ---------------------------------------------------------------------------
// O que há a cobrar
// ---------------------------------------------------------------------------

// O que a encomenda de UM atleta custa, aos preços de HOJE: a soma dos
// artigos que ele tem preenchidos.
//
// É a mesma estimativa do resumo da equipa e do custo dos pedidos, e não um
// registo de dívida: mudar o preço de um artigo nas Definições muda este
// número, de propósito. Por isso o valor não se guarda na linha — um número
// gravado ao carimbar o pagamento passava a discordar do resumo no dia
// seguinte.
//
// Os artigos SEM preço não somam zero: contam-se à parte e dizem-se pelo
// nome. Aqui do outro lado está uma família a preparar o dinheiro, e um
// total que engole em silêncio o blusão é um valor que ela leva ao clube a
// pensar que está fechado.
function orderCost(playerId, articles) {
  const sizes = playerSizes(playerId);
  let total = 0;
  let units = 0;
  const missingLabels = [];
  articles.forEach((a) => {
    if (!sizes[a.key]) return;
    units++;
    if (a.price != null) total += a.price;
    else missingLabels.push(a.label);
  });
  return { total, units, missing: missingLabels.length, missingLabels };
}

// Tem encomenda quem tem alguma coisa preenchida. Uma ficha em branco não
// está "por pagar" — não tem nada encomendado.
const hasOrder = (playerId) => Object.keys(playerSizes(playerId)).length > 0;

// Quem falta pagar nesta equipa, e quanto.
function teamBilling(players, articles) {
  const out = { billable: 0, paid: 0, owed: 0, received: 0, missing: 0, missingLabels: '' };
  const labels = new Set();
  players.forEach((p) => {
    if (!hasOrder(p.id)) return;
    out.billable++;
    const cost = orderCost(p.id, articles);
    if (sizesRow(p.id).paid_at) {
      out.paid++;
      out.received += cost.total;
    } else {
      out.owed += cost.total;
      out.missing += cost.missing;
      cost.missingLabels.forEach((l) => labels.add(l));
    }
  });
  out.missingLabels = [...labels].join(', ');
  return out;
}

const FILTER_LABELS = {
  por_pagar: 'só quem falta pagar',
  por_confirmar: 'só quem a família ainda não confirmou',
  sem_tamanhos: 'só quem ainda não tem tamanhos',
};

const EMPTY_BY_FILTER = {
  por_pagar: 'Está tudo cobrado nesta equipa.',
  por_confirmar: 'Todas as famílias desta equipa já confirmaram.',
  sem_tamanhos: 'Todos os atletas desta equipa já têm tamanhos preenchidos.',
};

function matchesFilter(player, articles) {
  const row = sizesRow(player.id);
  if (filtro === 'por_pagar') return hasOrder(player.id) && !row.paid_at;
  if (filtro === 'por_confirmar') return !row.confirmed_at;
  if (filtro === 'sem_tamanhos') return !hasOrder(player.id);
  return true;
}

// O pisco. Sem a migração não se mostra nada: uma marca que não grava é pior
// do que marca nenhuma — é a mesma linha do `birthDateReady()`.
function confirmBadgeHTML(row) {
  if (!state.sizesConfirmReady) return '';
  return row.confirmed_at
    ? `<span class="badge badge--ok enc-confirm" title="Confirmado a ${esc(fmtDate(row.confirmed_at))}">✓ Confirmado</span>`
    : '<span class="badge badge--warn enc-confirm">Por confirmar</span>';
}

// O crachá do pagamento. Só aparece a quem tem encomenda: numa ficha em
// branco "Por pagar" seria uma dívida inventada.
//
// Por pagar leva o VALOR — é isso que se diz à família ao balcão, e um
// crachá que só diga "Por pagar" obriga a somar quatro artigos de cabeça.
function paidBadgeHTML(row, player, articles) {
  if (!state.sizesPaidReady || !hasOrder(player.id)) return '';
  if (row.paid_at) {
    return `<span class="badge badge--ok enc-confirm" title="Pago a ${esc(fmtDate(row.paid_at))}">✓ Pago</span>`;
  }
  const cost = orderCost(player.id, articles);
  const valor = cost.total ? ` · ${euros(cost.total)}` : '';
  // Um valor a menos que o real diz-se: o "+" é o artigo por orçamentar.
  const mais = cost.missing ? '+' : '';
  return `<span class="badge badge--warn enc-confirm"${
    cost.missing ? ` title="${esc(cost.missingLabels.join(', '))} ainda sem preço nas Definições"` : ''
  }>Por pagar${esc(valor)}${mais}</span>`;
}

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// Botões da linha: enviar a mensagem à família, copiá-la e carimbar a
// resposta. O envio abre o WhatsApp/email com o texto escrito — nada sai
// pelas costas de ninguém, e quem carrega vê a mensagem antes de a mandar.
function rowActionsHTML(player, row, editable) {
  const ch = contactChannel(player.guardian_contact);
  return `
    ${editable ? `<button class="btn btn--ghost btn--sm" data-edit-sizes="${player.id}" type="button">${
      Object.keys(playerSizes(player.id)).length ? 'Editar' : 'Preencher'}</button>` : ''}
    ${ch
      ? `<button class="btn btn--ghost btn--sm" data-send-sizes="${player.id}" type="button">${
          ch.kind === 'email' ? '✉ Enviar' : '💬 Enviar'}</button>`
      : `<button class="btn btn--ghost btn--sm" data-copy-sizes="${player.id}" type="button" title="Esta ficha não tem contacto do encarregado">Copiar msg.</button>`}
    ${editable && state.sizesConfirmReady ? `
      <button class="btn btn--ghost btn--sm" data-confirm-sizes="${player.id}" data-to="${row.confirmed_at ? '' : '1'}" type="button">
        ${row.confirmed_at ? 'Desmarcar' : '✓ Confirmar'}
      </button>` : ''}
    ${editable && state.sizesPaidReady && hasOrder(player.id) ? `
      <button class="btn btn--ghost btn--sm" data-paid-sizes="${player.id}" data-to="${row.paid_at ? '' : '1'}" type="button">
        ${row.paid_at ? 'Desmarcar pago' : '€ Marcar pago'}
      </button>` : ''}
  `;
}

// Linha com o(s) nome(s) a estampar na camisola. Mostra a alternativa só
// quando difere da principal.
function jerseyNameHTML(sizes) {
  const main = (sizes.nome_camisola || '').trim();
  const alt = (sizes.nome_camisola_alt || '').trim();
  if (!main && !alt) return '';
  const parts = [];
  if (main) parts.push(`👕 ${esc(main)}`);
  if (alt && alt !== main) parts.push(`alt: ${esc(alt)}`);
  return `<span class="enc-jersey-name muted">${parts.join(' · ')}</span>`;
}

// ---------------------------------------------------------------------------
// Separador 2: resumo para encomenda
// ---------------------------------------------------------------------------

function renderResumo(players, team) {
  if (!players.length) return emptyHTML('Esta equipa não tem atletas registadas.');

  const articles = equipmentArticles();
  if (!articles.length) {
    return emptyHTML(
      'O clube não tem artigos de equipamento definidos. Configura-os nas Definições → Estrutura.'
    );
  }

  const sizesMap = {};
  players.forEach((p) => { sizesMap[p.id] = playerSizes(p.id); });

  const sem = players.filter((p) => !Object.keys(sizesMap[p.id]).length).length;

  const orcamento = orderBudget(players, articles, sizesMap);

  return `
    ${sem > 0 ? `
      <div class="alert alert--warn" style="margin-bottom:0.9rem">
        ⚠️ ${sem} atleta${sem !== 1 ? 's' : ''} ainda não tem tamanhos preenchidos — o resumo pode estar incompleto.
      </div>
    ` : ''}

    ${orcamento.units ? `
      <div class="card enc-budget">
        <div>
          <span class="enc-budget__label">Custo desta encomenda</span>
          <strong class="enc-budget__value">${esc(euros(orcamento.total))}</strong>
        </div>
        <span class="muted enc-budget__note">
          ${orcamento.priced} de ${orcamento.units} unidade${orcamento.units !== 1 ? 's' : ''} com preço
          ${orcamento.missing
            ? `· <strong>${orcamento.missing} por orçamentar</strong> (${esc(orcamento.missingLabels)})`
            : ''}
        </span>
      </div>
    ` : ''}

    <div class="enc-resumo-grid">
      ${articles.map((article) => {
        const counts = {};
        players.forEach((p) => {
          const v = sizesMap[p.id]?.[article.key];
          if (v) counts[v] = (counts[v] || 0) + 1;
        });
        const entries = sortSizes(Object.keys(counts), article).map((k) => [k, counts[k]]);
        const total = entries.reduce((s, [, n]) => s + n, 0);
        const custo = article.price != null ? article.price * total : null;

        return `
          <div class="card enc-resumo-card">
            <h3 class="enc-resumo-title">${esc(article.label)}</h3>
            ${entries.length
              ? `<ul class="enc-resumo-list">
                  ${entries.map(([size, count]) => `
                    <li class="enc-resumo-row">
                      <span class="badge badge--info enc-resumo-size">${esc(size)}</span>
                      <span class="enc-resumo-count">${count}×</span>
                      <div class="enc-resumo-bar-wrap">
                        <div class="enc-resumo-bar" style="width:${Math.round((count / total) * 100)}%"></div>
                      </div>
                    </li>
                  `).join('')}
                </ul>
                <p class="muted enc-resumo-total">
                   Total: ${total} unidade${total !== 1 ? 's' : ''}
                   ${custo != null
                     ? `· <strong>${esc(euros(custo))}</strong>
                        <span class="enc-resumo-unit">(${esc(euros(article.price))}/un.)</span>`
                     : '· <span class="enc-resumo-unit">preço por definir</span>'}
                 </p>`
              : `<p class="muted" style="margin:0.4rem 0 0;font-size:0.85rem">Sem tamanhos registados.</p>`}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Custo da encomenda desta equipa, aos preços de HOJE.
//
// Não é um registo de despesa — é uma estimativa do que custa encomendar
// isto agora. Mudar o preço de um artigo nas Definições muda este número,
// de propósito: a pergunta que se faz aqui é "quanto vou gastar", não
// "quanto gastei". O que se gastou é do Financeiro.
//
// Os artigos SEM preço não somam zero: contam-se à parte e dizem-se pelo
// nome. Um orçamento que engole em silêncio três artigos por orçamentar é
// um número que alguém leva à direção a pensar que está fechado.
function orderBudget(players, articles, sizesMap) {
  let total = 0;
  let units = 0;
  let priced = 0;
  const missingLabels = [];

  articles.forEach((a) => {
    const n = players.filter((p) => sizesMap[p.id]?.[a.key]).length;
    if (!n) return;
    units += n;
    if (a.price != null) {
      total += a.price * n;
      priced += n;
    } else {
      missingLabels.push(a.label);
    }
  });

  return {
    total,
    units,
    priced,
    missing: units - priced,
    missingLabels: missingLabels.join(', '),
  };
}

// ---------------------------------------------------------------------------
// Exportar a encomenda (.xlsx)
// ---------------------------------------------------------------------------

async function handleExport(btn, team, players) {
  if (!players.length) {
    alert('Esta equipa não tem atletas para exportar.');
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'A exportar…';
  try {
    const sizesById = {};
    players.forEach((p) => {
      const row = state.playerSizes.find((s) => s.player_id === p.id) || {};
      sizesById[p.id] = {
        nome_camisola: row.nome_camisola,
        nome_camisola_alt: row.nome_camisola_alt,
        confirmed_at: row.confirmed_at,
        paid_at: row.paid_at,
        sizes: playerSizes(p.id),
      };
    });
    await exportEncomendaXLSX({
      teamLabel: teamName(team), players, sizesById, articles: equipmentArticles(),
    });
  } catch (err) {
    alert(dbErrorMessage(err) || 'Não foi possível gerar o ficheiro.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------------------------------------------------------------------
// Modal de edição de tamanhos de um atleta
// ---------------------------------------------------------------------------

function openSizesModal(playerId, container) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const existing = state.playerSizes.find((s) => s.player_id === playerId) || {};
  const articles = equipmentArticles();
  const current = playerSizes(playerId);

  // Nome a estampar: por omissão o nome do atleta (pode ser alterado).
  const values = {
    nome_camisola: existing.nome_camisola ?? player.name ?? '',
    nome_camisola_alt: existing.nome_camisola_alt ?? player.name ?? '',
  };
  articles.forEach((a) => { values[`art__${a.key}`] = current[a.key] || ''; });

  openModal({
    title: `Tamanhos — ${player.name}`,
    submitLabel: 'Guardar',
    values,
    fields: [
      { name: 'nome_camisola', label: 'Nome na camisola', type: 'text', placeholder: 'Nome a estampar' },
      { name: 'nome_camisola_alt', label: 'Nome na camisola alternativa', type: 'text', placeholder: 'Nome a estampar' },
      // Um artigo sem tamanhos definidos é texto livre: é o caso das meias,
      // que se medem em números e mudam com a marca. Não se inventa um
      // select vazio para ele.
      ...articles.map((a) => ({
        name: `art__${a.key}`,
        label: a.label,
        ...(a.sizes.length
          ? {
              type: 'select',
              placeholder: '— Não definido —',
              options: a.sizes.map((s) => ({ key: s, label: s })),
            }
          : {
              type: 'text',
              placeholder: 'ex.: 36-38',
            }),
      })),
    ],
    // O prefixo `art__` isola as chaves dos artigos das colunas próprias da
    // tabela: um clube que criasse um artigo com a chave `notes` reescrevia
    // as notas do atleta ao gravar o tamanho.
    onSubmit: async (formValues) => {
      const sizes = {};
      articles.forEach((a) => {
        const v = (formValues[`art__${a.key}`] || '').trim();
        if (v) sizes[a.key] = v;
      });
      await upsertPlayerSizes(playerId, {
        nome_camisola: formValues.nome_camisola?.trim() || null,
        nome_camisola_alt: formValues.nome_camisola_alt?.trim() || null,
        sizes,
      });
    },
  });
}
