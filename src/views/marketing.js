// Vista: Datas & iniciativas (marketing do clube — só o coordenador).
//
// Quem trata das redes sociais de um clube é quase sempre o coordenador, entre
// tudo o resto, e as datas que dão uma boa publicação passam sem se dar por
// elas: o Outubro Rosa começa e só se repara quando outro clube já publicou.
// Este ecrã junta as duas coisas que faltavam no mesmo sítio — QUANDO (o
// catálogo de datas, em `marketing-dates.js`, mais as datas do próprio clube)
// e O QUE se vai fazer (as iniciativas, com notas e um estado).
//
// Uma iniciativa liga-se a uma data ("+ Iniciativa" na linha dela) ou fica
// solta (o post da subida de divisão não tem dia no calendário de ninguém).
// O Painel do coordenador avisa das datas da semana que ainda não têm nada.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import {
  MARKETING_CATEGORIES, MARKETING_CATEGORY, INITIATIVE_STATUSES, INITIATIVE_STATUS,
  dateOccurrences, occurrenceFor, dateKeyLabel, isoDay, parseDay,
} from '../marketing-dates.js';

// Estado local de UI (persiste entre re-desenhos, como nas outras vistas).
let months = 3;            // janela: a partir do mês corrente
let categoryFilter = '';
let onlyStars = false;
let showHidden = false;
// Meses abertos à mão. O `innerHTML` refaz os `<details>` a cada gravação, e
// fechar o mês onde se acabou de escrever uma nota obrigava a reabri-lo.
const openMonths = new Set();

const MONTH_FMT = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });
const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' });

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function windowRange() {
  const t = today();
  const from = new Date(t.getFullYear(), t.getMonth(), 1);
  const to = new Date(t.getFullYear(), t.getMonth() + months, 0);
  return { from, to };
}

const initiatives = () => state.marketingItems.filter((i) => i.kind === 'iniciativa');

// "hoje", "amanhã", "daqui a 5 dias", "há 3 dias" — o que decide se ainda
// há tempo para preparar alguma coisa.
function relative(occ) {
  const t = today().getTime();
  const day = 86400000;
  if (occ.end && occ.start.getTime() <= t && occ.end.getTime() >= t) return 'a decorrer';
  const n = Math.round((occ.start.getTime() - t) / day);
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n > 1) return `daqui a ${n} dias`;
  return n === -1 ? 'ontem' : `há ${-n} dias`;
}

function dayLabel(occ) {
  if (!occ.end) return DAY_FMT.format(occ.start);
  return `${DAY_FMT.format(occ.start)} – ${DAY_FMT.format(occ.end)}`;
}

function isPast(occ) {
  return (occ.end || occ.start) < today();
}

// Linhas do ecrã: as datas (com as iniciativas ligadas) e as iniciativas
// soltas — e as ligadas a uma data que já saiu da janela, que não podem
// desaparecer só porque a data é de outro mês.
function buildRows(from, to) {
  const occs = dateOccurrences(from, to, state.marketingItems, { withHidden: showHidden });
  const byOcc = new Map();
  const loose = [];
  // Para ligar uma iniciativa à ocorrência certa olha-se um ano à volta, para
  // o post de Ano Novo de 31 de dezembro cair no Ano Novo seguinte.
  const wide = dateOccurrences(
    new Date(from.getFullYear() - 1, 0, 1), new Date(to.getFullYear() + 1, 11, 31),
    state.marketingItems, { withHidden: true },
  );
  initiatives().forEach((it) => {
    const occ = occurrenceFor(it, wide);
    const shown = occ && occs.find((o) => o.key === occ.key && o.start.getTime() === occ.start.getTime());
    if (shown) {
      const k = `${shown.key}|${shown.start.getTime()}`;
      if (!byOcc.has(k)) byOcc.set(k, []);
      byOcc.get(k).push(it);
      return;
    }
    const d = parseDay(it.date);
    if (d >= from && d <= to) loose.push(it);
  });

  const rows = occs
    .filter((o) => !categoryFilter || o.category === categoryFilter)
    .filter((o) => !onlyStars || o.star || byOcc.has(`${o.key}|${o.start.getTime()}`))
    .map((o) => ({ type: 'date', at: o.start, occ: o, items: byOcc.get(`${o.key}|${o.start.getTime()}`) || [] }));
  // As soltas mostram-se sempre (não têm categoria): são trabalho do clube.
  if (!categoryFilter) {
    loose.forEach((it) => rows.push({ type: 'loose', at: parseDay(it.date), item: it }));
  }
  return rows.sort((a, b) => a.at - b.at);
}

export function renderMarketing(container) {
  const ready = state.marketingReady;
  const { from, to } = windowRange();
  const rows = buildRows(from, to);
  const hiddenCount = state.marketingItems.filter((i) => i.kind === 'oculta').length;

  // Agrupar por mês (o do início da data/iniciativa).
  const groups = [];
  for (let i = 0; i < months; i++) {
    const m = new Date(from.getFullYear(), from.getMonth() + i, 1);
    groups.push({ key: `${m.getFullYear()}-${m.getMonth()}`, date: m, rows: [] });
  }
  rows.forEach((r) => {
    const g = groups.find((x) => x.key === `${r.at.getFullYear()}-${r.at.getMonth()}`)
      // Um período que começou antes da janela (raro) cai no primeiro mês.
      || groups[0];
    g.rows.push(r);
  });
  // O mês corrente e o seguinte nascem abertos: é onde está o que ainda dá
  // para preparar. Os outros abrem-se quando se quiser planear com tempo.
  if (!openMonths.size) groups.slice(0, 2).forEach((g) => openMonths.add(g.key));

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Datas &amp; iniciativas</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          Datas para as redes sociais e o que o clube vai fazer em cada uma — só o coordenador vê isto
        </p>
      </div>
      ${ready ? `
        <div class="cell-actions">
          <button class="btn btn--ghost" id="mk-add-date" type="button">+ Data do clube</button>
          <button class="btn btn--accent" id="mk-add" type="button">+ Iniciativa</button>
        </div>` : ''}
    </header>

    ${ready ? '' : `
      <div class="card" style="border-left:4px solid var(--warn);margin-bottom:1rem">
        <p style="margin:0">
          Falta correr <code>supabase/marketing.sql</code> no Supabase. Até lá vês as datas,
          mas ainda não dá para gravar iniciativas nem notas.
        </p>
      </div>`}

    <div class="filter-bar">
      <div class="field">
        <label for="mk-months">Período</label>
        <select id="mk-months">
          ${[3, 6, 12].map((n) => `<option value="${n}" ${n === months ? 'selected' : ''}>Próximos ${n} meses</option>`).join('')}
        </select>
      </div>
      <label class="mk-toggle">
        <input type="checkbox" id="mk-stars" ${onlyStars ? 'checked' : ''} />
        Só os destaques ⭐
      </label>
      ${hiddenCount ? `
        <label class="mk-toggle">
          <input type="checkbox" id="mk-hidden" ${showHidden ? 'checked' : ''} />
          Mostrar ocultas (${hiddenCount})
        </label>` : ''}
    </div>
    <div class="ex-chips" role="group" aria-label="Filtrar por tipo de data">
      ${MARKETING_CATEGORIES.map((c) => `
        <button class="ex-chip${categoryFilter === c.key ? ' ex-chip--active' : ''}"
                data-mk-cat="${esc(c.key)}" type="button" aria-pressed="${categoryFilter === c.key}">
          ${esc(c.label)}
        </button>`).join('')}
    </div>

    ${groups.map((g) => monthHTML(g, ready)).join('')}
  `;

  container.querySelector('#mk-months')?.addEventListener('change', (e) => {
    months = Number(e.target.value) || 3;
    renderMarketing(container);
  });
  container.querySelector('#mk-stars')?.addEventListener('change', (e) => {
    onlyStars = e.target.checked;
    renderMarketing(container);
  });
  container.querySelector('#mk-hidden')?.addEventListener('change', (e) => {
    showHidden = e.target.checked;
    renderMarketing(container);
  });
  container.querySelectorAll('[data-mk-cat]').forEach((b) =>
    b.addEventListener('click', () => {
      categoryFilter = b.dataset.mkCat === categoryFilter ? '' : b.dataset.mkCat;
      renderMarketing(container);
    })
  );
  container.querySelectorAll('details[data-month]').forEach((d) =>
    d.addEventListener('toggle', () => {
      if (d.open) openMonths.add(d.dataset.month);
      else openMonths.delete(d.dataset.month);
    })
  );

  container.querySelector('#mk-add')?.addEventListener('click', () => openInitiativeForm());
  container.querySelector('#mk-add-date')?.addEventListener('click', () => openClubDateForm());
  container.querySelectorAll('[data-mk-new]').forEach((b) =>
    b.addEventListener('click', () => openInitiativeForm(null, { key: b.dataset.mkNew, date: b.dataset.mkDate }))
  );
  container.querySelectorAll('[data-mk-edit]').forEach((b) =>
    b.addEventListener('click', () => openInitiativeForm(b.dataset.mkEdit))
  );
  container.querySelectorAll('[data-mk-del]').forEach((b) =>
    b.addEventListener('click', () => removeItem(b.dataset.mkDel, 'Remover esta iniciativa e as notas dela?'))
  );
  container.querySelectorAll('[data-mk-status]').forEach((b) =>
    b.addEventListener('click', () => advanceStatus(b.dataset.mkStatus))
  );
  container.querySelectorAll('[data-mk-edit-date]').forEach((b) =>
    b.addEventListener('click', () => openClubDateForm(b.dataset.mkEditDate))
  );
  container.querySelectorAll('[data-mk-del-date]').forEach((b) =>
    b.addEventListener('click', () => removeItem(
      b.dataset.mkDelDate,
      'Remover esta data do clube? As iniciativas ligadas a ela ficam, soltas.',
    ))
  );
  container.querySelectorAll('[data-mk-hide]').forEach((b) =>
    b.addEventListener('click', () => hideDate(b.dataset.mkHide))
  );
  container.querySelectorAll('[data-mk-unhide]').forEach((b) =>
    b.addEventListener('click', () => unhideDate(b.dataset.mkUnhide))
  );
}

function monthHTML(g, ready) {
  const title = MONTH_FMT.format(g.date);
  const n = g.rows.length;
  return `
    <details class="group" data-month="${g.key}" ${openMonths.has(g.key) ? 'open' : ''}>
      <summary class="group__head">
        <span class="group__title">${esc(title.charAt(0).toUpperCase() + title.slice(1))}</span>
        <span class="group__count">${n}</span>
      </summary>
      ${n
        ? `<ul class="mk-list">${g.rows.map((r) => (r.type === 'date' ? dateRowHTML(r, ready) : looseRowHTML(r.item, ready))).join('')}</ul>`
        : `<p class="muted" style="margin:0;padding:0.75rem 0.9rem">Nada neste mês com os filtros escolhidos.</p>`}
    </details>
  `;
}

function dateRowHTML({ occ, items }, ready) {
  const cat = MARKETING_CATEGORY[occ.category];
  const past = isPast(occ);
  const rel = relative(occ);
  // O mesmo critério do aviso do Painel: só os destaques e as datas do clube
  // — um crachá em todas as datas da semana era ruído.
  const soon = !past && !occ.hidden && (occ.star || occ.club) && !items.length
    && (occ.start - today()) / 86400000 <= 7;
  return `
    <li class="mk-row${past ? ' mk-row--past' : ''}${occ.hidden ? ' mk-row--hidden' : ''}">
      <div class="mk-row__when">
        <strong>${esc(dayLabel(occ))}</strong>
        <span class="muted">${esc(rel)}</span>
      </div>
      <div class="mk-row__body">
        <div class="mk-row__head">
          <strong class="mk-row__title">${occ.star ? '⭐ ' : ''}${esc(occ.label)}</strong>
          <span class="badge badge--${cat?.badge || 'muted'}">${esc(cat?.label || '')}</span>
          ${soon ? '<span class="badge badge--warn">Sem iniciativa</span>' : ''}
        </div>
        ${occ.idea ? `<p class="muted mk-row__idea">${esc(occ.idea)}</p>` : ''}
        ${items.length ? `<ul class="mk-items">${items.map((it) => itemHTML(it, ready)).join('')}</ul>` : ''}
        ${ready ? `
          <div class="cell-actions mk-row__actions">
            ${occ.hidden
              ? `<button class="btn btn--ghost btn--sm" data-mk-unhide="${esc(occ.key)}" type="button">Voltar a mostrar</button>`
              : `<button class="btn btn--ghost btn--sm" data-mk-new="${esc(occ.key)}" data-mk-date="${isoDay(occ.start)}" type="button">+ Iniciativa</button>
                 ${occ.club
                   ? `<button class="btn btn--ghost btn--sm" data-mk-edit-date="${occ.row.id}" type="button">Editar data</button>
                      <button class="btn btn--danger btn--sm" data-mk-del-date="${occ.row.id}" type="button">Remover data</button>`
                   : `<button class="btn btn--ghost btn--sm" data-mk-hide="${esc(occ.key)}" type="button"
                              title="Não mostrar esta data (pode voltar a mostrar-se)">Ocultar</button>`}`}
          </div>` : ''}
      </div>
    </li>
  `;
}

function looseRowHTML(it, ready) {
  const d = parseDay(it.date);
  const linked = dateKeyLabel(it.date_key, state.marketingItems);
  return `
    <li class="mk-row">
      <div class="mk-row__when">
        <strong>${esc(DAY_FMT.format(d))}</strong>
        <span class="muted">${esc(relative({ start: d, end: null }))}</span>
      </div>
      <div class="mk-row__body">
        <div class="mk-row__head">
          <strong class="mk-row__title">Iniciativa do clube</strong>
          ${linked ? `<span class="muted">· ${esc(linked)}</span>` : ''}
        </div>
        <ul class="mk-items">${itemHTML(it, ready, { showDate: false })}</ul>
      </div>
    </li>
  `;
}

function itemHTML(it, ready, { showDate = true } = {}) {
  const st = INITIATIVE_STATUS[it.status] || INITIATIVE_STATUS.ideia;
  const next = nextStatus(it.status);
  return `
    <li class="mk-item">
      <div class="mk-item__head">
        <span class="badge badge--${st.badge}">${esc(st.label)}</span>
        <strong>${esc(it.title)}</strong>
        ${showDate ? `<span class="muted">· ${esc(DAY_FMT.format(parseDay(it.date)))}</span>` : ''}
      </div>
      ${it.notes ? `<p class="mk-item__notes">${esc(it.notes)}</p>` : ''}
      ${ready ? `
        <div class="cell-actions">
          ${next ? `<button class="btn btn--ghost btn--sm" data-mk-status="${it.id}" type="button">Marcar como ${esc(INITIATIVE_STATUS[next].label.toLowerCase())}</button>` : ''}
          <button class="btn btn--ghost btn--sm" data-mk-edit="${it.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-mk-del="${it.id}" type="button">Remover</button>
        </div>` : ''}
    </li>
  `;
}

function nextStatus(status) {
  const i = INITIATIVE_STATUSES.findIndex((s) => s.key === status);
  return INITIATIVE_STATUSES[i + 1]?.key || null;
}

// --- Formulários ----------------------------------------------------------

function openInitiativeForm(id, link = null) {
  const existing = id ? state.marketingItems.find((i) => i.id === id) : null;
  const dateKey = existing ? existing.date_key : link?.key || null;
  const linked = dateKeyLabel(dateKey, state.marketingItems);
  openModal({
    title: existing ? 'Editar iniciativa' : 'Nova iniciativa',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    intro: linked ? `Para: ${linked}.` : '',
    fields: [
      {
        name: 'title', label: 'O que vamos fazer', type: 'text', required: true, full: true,
        placeholder: 'Ex.: Foto do plantel sénior com o laço rosa',
      },
      {
        name: 'date', label: 'Data', type: 'date', required: true,
        hint: 'Quando se publica ou acontece. Pode ser antes da data, para a preparar.',
      },
      { name: 'status', label: 'Estado', type: 'select', required: true, options: INITIATIVE_STATUSES, default: 'ideia' },
      {
        name: 'notes', label: 'Notas', type: 'textarea', full: true,
        placeholder: 'Ideias, texto do post, quem tira as fotos, material a comprar…',
      },
    ],
    values: existing
      ? { title: existing.title, date: existing.date, status: existing.status, notes: existing.notes || '' }
      : { date: link?.date || isoDay(today()) },
    async onSubmit(vals) {
      const payload = {
        kind: 'iniciativa',
        title: (vals.title || '').trim(),
        date: vals.date,
        status: vals.status || 'ideia',
        notes: vals.notes?.trim() || null,
        date_key: dateKey,
      };
      if (!payload.title) throw new Error('Escreve o que se vai fazer.');
      await save(existing, payload, existing ? 'Iniciativa guardada.' : 'Iniciativa criada.');
    },
  });
}

function openClubDateForm(id) {
  const existing = id ? state.marketingItems.find((i) => i.id === id) : null;
  openModal({
    title: existing ? 'Editar data do clube' : 'Nova data do clube',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    intro: 'Uma data que se repete todos os anos no mesmo dia — o aniversário do clube, a apresentação dos plantéis, o torneio de verão.',
    fields: [
      { name: 'title', label: 'Nome', type: 'text', required: true, full: true, placeholder: 'Ex.: Aniversário do clube' },
      {
        name: 'date', label: 'Dia', type: 'date', required: true,
        hint: 'O ano conta como o primeiro em que a data aparece.',
      },
      { name: 'notes', label: 'Ideia / notas', type: 'textarea', full: true, placeholder: 'Ex.: Vídeo com fotos antigas do clube' },
    ],
    values: existing
      ? { title: existing.title, date: existing.date, notes: existing.notes || '' }
      : {},
    async onSubmit(vals) {
      const payload = {
        kind: 'data',
        title: (vals.title || '').trim(),
        date: vals.date,
        notes: vals.notes?.trim() || null,
      };
      if (!payload.title) throw new Error('Dá um nome à data.');
      await save(existing, payload, existing ? 'Data guardada.' : 'Data do clube criada.');
    },
  });
}

// As linhas desta tabela são de três tipos e o toast genérico do store diria
// "Iniciativa criada" ao ocultar uma data — por isso a mensagem é daqui.
async function save(existing, payload, message) {
  try {
    if (existing) {
      await updateRow('marketing_items', 'marketingItems', existing.id, { ...payload, updated_at: new Date().toISOString() });
    } else {
      await createRow('marketing_items', 'marketingItems', payload);
    }
    toastOk(message);
  } catch (err) {
    throw new Error(dbErrorMessage(err));
  }
}

async function advanceStatus(id) {
  const it = state.marketingItems.find((i) => i.id === id);
  const next = it && nextStatus(it.status);
  if (!next) return;
  try {
    await updateRow('marketing_items', 'marketingItems', id, { status: next, updated_at: new Date().toISOString() });
    toastOk(`Iniciativa marcada como ${INITIATIVE_STATUS[next].label.toLowerCase()}.`);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

async function removeItem(id, message) {
  if (!(await confirmDialog(message))) return;
  try {
    await deleteRow('marketing_items', 'marketingItems', id);
    toastOk('Removido.');
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

async function hideDate(key) {
  try {
    await createRow('marketing_items', 'marketingItems', { kind: 'oculta', date_key: key });
    toastOk('Data ocultada. Podes voltar a mostrá-la em "Mostrar ocultas".');
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

async function unhideDate(key) {
  const rows = state.marketingItems.filter((i) => i.kind === 'oculta' && i.date_key === key);
  try {
    for (const r of rows) await deleteRow('marketing_items', 'marketingItems', r.id);
    toastOk('A data volta a aparecer.');
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// --- Painel ---------------------------------------------------------------

// O que o Painel do coordenador assinala: as datas dos próximos 7 dias sem
// nenhuma iniciativa (ainda dá para fazer alguma coisa) e as iniciativas cujo
// dia já chegou e não estão publicadas. Uma data sem iniciativa que já passou
// não se assinala — já não há nada a fazer por ela, e um aviso que não se pode
// resolver só ensina a ignorar a lista.
export function marketingPending() {
  const t = today();
  const in7 = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 7);
  const occs = dateOccurrences(t, in7, state.marketingItems)
    // Um período a decorrer (Outubro Rosa) só conta no dia em que começa:
    // passados três dias, ou já se fez alguma coisa, ou o aviso é ruído.
    .filter((o) => o.start >= t);
  const wide = dateOccurrences(
    new Date(t.getFullYear() - 1, 0, 1), new Date(t.getFullYear() + 1, 11, 31),
    state.marketingItems, { withHidden: true },
  );
  const items = initiatives();
  const covered = new Set(items.map((it) => {
    const o = occurrenceFor(it, wide);
    return o ? `${o.key}|${o.start.getTime()}` : null;
  }).filter(Boolean));

  const semIniciativa = occs.filter((o) => (o.star || o.club) && !covered.has(`${o.key}|${o.start.getTime()}`));
  const porPublicar = items.filter((it) => it.status !== 'feita' && parseDay(it.date) <= t);
  return { semIniciativa, porPublicar, relative };
}
