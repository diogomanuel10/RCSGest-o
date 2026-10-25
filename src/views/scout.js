// Vista: Scout ao vivo.
//
// O treinador marca, durante o jogo, cada ação de cada atleta (receção, passe,
// ataque, serviço, bloco, defesa) com a qualidade — e a app conta o marcador,
// roda a equipa e põe a líbero em campo sozinha. Substitui a folha de Google
// Sheets com Apps Script que cada escalão copiava por jogo.
//
// Duas partes:
//   • a SECÇÃO (lista de jogos scoutados por equipa, totais da época,
//     exportação) — `renderScout`;
//   • o ECRÃ DE JOGO, em ecrã inteiro por cima da app — `openScoutLive`. Abre
//     da secção ou do botão "Scout" de um jogo no Calendário.
//
// Tudo o que se vê no ecrã de jogo deriva da sequência de ações
// (`scout-engine.js`). A gravação é silenciosa e com cópia no dispositivo: o
// pavilhão é onde a rede é pior, e um toque não pode ficar à espera dela.

import {
  state, loadScouts, loadScoutData, createScout, saveScoutData, deleteScout, notifyScouts,
  saveGameResult, saveGameParticipation, dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML, wireEmptyAction, loadingHTML, errorHTML } from '../ui.js';
import { openModal, confirmDialog, wireDialog } from '../modal.js';
import { canEdit, isCoordenador } from '../permissions.js';
import { myTeams, teamById, teamName, gameResult } from '../compute.js';
import { toastOk, toastError, toastInfo } from '../toast.js';
import {
  ACT, COLS, ROWS, SYM, QN, MAX_SETS, emptyData, derive, court, setWinner, setsWon, hasPoints,
  partials, summarize, pointsPlayed, teamSummary, playerRows, findPlayer, numOf, fmtPct,
} from '../scout-engine.js';

// --- Estado local da secção -------------------------------------------------
let teamFilter = '';
let loading = false;
let loadError = '';
const seasonCache = new Map(); // teamId -> { at, games }
let seasonOpen = false;

const ACTIVE_KEY = 'rumia-scout-active';
const backupKey = (id) => `rumia-scout:${id}`;
const LS = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço: a nuvem chega */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

const fmtDate = (s) => (s ? s.split('-').reverse().join('/') : '—');
const shortName = (n) => {
  const a = String(n || '').trim().split(/\s+/);
  return a.length > 1 ? `${a[0]} ${a[a.length - 1][0]}.` : a[0] || '';
};
const resultOf = (row) => {
  const s = row.summary || {};
  const o = s.setsFor || 0;
  const t = s.setsAgainst || 0;
  return { o, t, label: `${o}–${t}`, res: o > t ? 'V' : o < t ? 'D' : 'E' };
};
const teamLabelOf = (teamId) => teamName(teamById(teamId)) || 'Equipa';

// =============================================================================
// Secção
// =============================================================================

export function renderScout(container) {
  if (state.scouts === null) {
    container.innerHTML = loadingHTML('A carregar os jogos scoutados…');
    if (!loading) {
      loading = true;
      loadScouts()
        .catch((err) => { loadError = dbErrorMessage(err); state.scouts = []; notifyScouts(); })
        .finally(() => { loading = false; });
    }
    return;
  }
  if (loadError) {
    container.innerHTML = errorHTML(loadError);
    loadError = '';
    return;
  }

  const teams = myTeams();
  const editable = canEdit('game_scouts');

  if (!state.scoutsReady) {
    container.innerHTML = `
      <header class="page-head"><h1 class="section-title">Scout</h1></header>
      <section class="card">${isCoordenador()
        ? '<p style="margin:0">Falta preparar a base de dados para o Scout: corre o ficheiro <code>supabase/scout.sql</code> no SQL Editor do Supabase.</p>'
        : '<p style="margin:0">O Scout ainda não está ativo neste clube. Pede ao coordenador para o ativar.</p>'}</section>`;
    return;
  }

  if (!teamFilter || !teams.some((t) => t.id === teamFilter)) {
    // Abre na equipa com o jogo mais recente scoutado (ou na primeira).
    const recent = state.scouts.find((r) => teams.some((t) => t.id === r.team_id));
    teamFilter = recent ? recent.team_id : teams[0]?.id || '';
  }
  const team = teamById(teamFilter);
  const rows = state.scouts.filter((r) => r.team_id === teamFilter);
  const fin = rows.filter((r) => r.status === 'terminado');
  const v = fin.filter((r) => resultOf(r).res === 'V').length;
  const activeId = LS.get(ACTIVE_KEY);
  const active = activeId && state.scouts.find((r) => r.id === activeId && r.status === 'em_curso');

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Scout</h1>
      ${editable && teams.length ? '<button class="btn btn--accent" id="scout-new" type="button">+ Scout de um jogo</button>' : ''}
    </header>

    ${active ? `
      <section class="card scout-resume">
        <div><strong>Tens um jogo a decorrer neste dispositivo</strong>
          <p class="muted" style="margin:0.15rem 0 0">${esc(teamLabelOf(active.team_id))} vs ${esc(active.opponent || 'Adversário')} · ${esc(fmtDate(active.game_date))}</p></div>
        <button class="btn btn--primary" type="button" data-open="${esc(active.id)}">Retomar</button>
      </section>` : ''}

    ${teams.length > 1 ? `
      <div class="filter-bar">
        <div class="field">
          <label for="scout-team">Equipa</label>
          <select id="scout-team">
            ${teams.map((t) => `<option value="${esc(t.id)}" ${t.id === teamFilter ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
      </div>` : ''}

    ${!teams.length ? emptyHTML('Ainda não tens equipas atribuídas. O coordenador liga-te às tuas equipas em Treinadores.', { icone: '🏐' }) : `
    <section class="card">
      <div class="scout-season">
        <div>
          <h2 class="section-title" style="font-size:1.05rem;margin:0">Época · ${esc(teamName(team))}</h2>
          <div class="scout-chips">
            <span class="badge badge--info">${fin.length} jogo${fin.length === 1 ? '' : 's'}</span>
            <span class="badge badge--ok">${v} V</span>
            <span class="badge badge--danger">${fin.length - v} D</span>
          </div>
        </div>
        <div class="cell-actions">
          <button class="btn btn--ghost btn--sm" type="button" id="season-toggle" ${fin.length ? '' : 'disabled'} aria-expanded="${seasonOpen}">${seasonOpen ? 'Esconder totais' : 'Totais por atleta'}</button>
          <button class="btn btn--ghost btn--sm" type="button" id="season-sheet" ${fin.length ? '' : 'disabled'}>Folha da época</button>
          <button class="btn btn--ghost btn--sm" type="button" id="season-xlsx" ${rows.length ? '' : 'disabled'}>Excel com todos os dados</button>
        </div>
      </div>
      <div id="season-body"></div>
    </section>

    ${rows.length ? `
      <section class="card">
        <ul class="scout-list">
          ${rows.map((r) => {
            const res = resultOf(r);
            const parc = (r.summary?.sets || []).map(([a, b]) => `${a}-${b}`).join(', ');
            return `<li>
              <button class="scout-item" type="button" data-detail="${esc(r.id)}">
                <span class="scout-item__date">${esc(fmtDate(r.game_date))}</span>
                <span class="scout-item__main"><strong>${esc(r.opponent || 'Adversário')}</strong>
                  <span class="muted">${esc([r.competition, parc || 'sem pontos'].filter(Boolean).join(' · '))}</span></span>
                ${r.status === 'terminado'
                  ? `<span class="scout-res scout-res--${res.res}">${res.label}</span>`
                  : '<span class="badge badge--warn">em curso</span>'}
              </button>
              <div class="cell-actions">
                ${r.status === 'em_curso' && editable ? `<button class="btn btn--primary btn--sm" type="button" data-open="${esc(r.id)}">Continuar</button>` : ''}
                <button class="btn btn--ghost btn--sm" type="button" data-sheet="${esc(r.id)}">Folha A4</button>
                <button class="btn btn--ghost btn--sm" type="button" data-xlsx="${esc(r.id)}">Excel</button>
              </div>
            </li>`;
          }).join('')}
        </ul>
      </section>`
      : emptyHTML('Ainda não há jogos scoutados nesta equipa. Abre um jogo do calendário e carrega em "Scout", ou cria um aqui.', {
        icone: '🏐', action: editable ? { key: 'scout-new', label: '+ Scout de um jogo' } : null,
      })}
    `}
  `;

  container.querySelector('#scout-team')?.addEventListener('change', (e) => {
    teamFilter = e.target.value; seasonOpen = false; renderScout(container);
  });
  container.querySelector('#scout-new')?.addEventListener('click', () => openNewScout());
  wireEmptyAction(container, 'scout-new', () => openNewScout());
  container.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openScoutById(b.dataset.open)));
  container.querySelectorAll('[data-detail]').forEach((b) => b.addEventListener('click', () => openDetail(b.dataset.detail)));
  container.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => exportOne(b.dataset.sheet, 'sheet')));
  container.querySelectorAll('[data-xlsx]').forEach((b) => b.addEventListener('click', () => exportOne(b.dataset.xlsx, 'xlsx')));
  container.querySelector('#season-toggle')?.addEventListener('click', () => { seasonOpen = !seasonOpen; renderScout(container); });
  container.querySelector('#season-sheet')?.addEventListener('click', () => exportSeason('sheet'));
  container.querySelector('#season-xlsx')?.addEventListener('click', () => exportSeason('xlsx'));

  if (seasonOpen && fin.length) {
    const body = container.querySelector('#season-body');
    body.innerHTML = loadingHTML('A juntar os jogos da época…');
    seasonGames(teamFilter).then((games) => {
      const done = games.filter((g) => g.status === 'terminado');
      body.innerHTML = `<div class="scout-season__body">${statsBlock(done.map((g) => g.data), 'all', { multi: true, played: sumPlayed(done) })}</div>`;
    }).catch((err) => { body.innerHTML = errorHTML(dbErrorMessage(err)); });
  }
}

// Todos os jogos (com as ações) de uma equipa. Guarda-se em cache enquanto a
// lista não mudar — abrir e fechar os totais não volta a descarregar a época.
async function seasonGames(teamId) {
  const rows = state.scouts.filter((r) => r.team_id === teamId);
  const stamp = rows.map((r) => `${r.id}:${r.updated_at}`).join('|');
  const hit = seasonCache.get(teamId);
  if (hit && hit.stamp === stamp) return hit.games;
  const full = await loadScoutData(rows.map((r) => r.id));
  const games = full.map(toGame);
  seasonCache.set(teamId, { stamp, games });
  return games;
}

const toGame = (row) => ({
  ...row,
  teamLabel: teamLabelOf(row.team_id),
  data: normalize(row.data, row),
});

// Um registo acabado de criar (ou de uma versão anterior) pode vir sem algum
// campo: completa-se em vez de rebentar no ecrã de jogo.
function normalize(data, row) {
  const d = data && data.sets ? data : emptyData(rosterOf(row.team_id));
  d.roster = d.roster || rosterOf(row.team_id);
  d.events = d.events || [];
  d.cur = Math.min(d.cur || 0, d.sets.length - 1);
  return d;
}

function rosterOf(teamId) {
  return state.players
    .filter((p) => p.team_id === teamId)
    .map((p) => ({ id: p.id, num: p.number || '', name: p.name }))
    .sort((a, b) => numOf(a) - numOf(b));
}

function sumPlayed(games) {
  const m = {};
  for (const g of games) {
    const p = pointsPlayed(g.data);
    for (const k of Object.keys(p)) m[k] = (m[k] || 0) + p[k];
  }
  return m;
}

async function exportOne(id, kind) {
  try {
    const [row] = await loadScoutData(id);
    if (!row) throw new Error('Jogo não encontrado.');
    const g = toGame(row);
    const ex = await import('../scout-export.js');
    if (kind === 'sheet') ex.openGameSheet(g);
    else { await ex.exportGameXlsx(g); toastOk('Excel do jogo descarregado.'); }
  } catch (err) {
    toastError(err.message || dbErrorMessage(err));
  }
}

async function exportSeason(kind) {
  try {
    const games = await seasonGames(teamFilter);
    const ex = await import('../scout-export.js');
    const label = teamLabelOf(teamFilter);
    if (kind === 'sheet') ex.openSeasonSheet(label, games);
    else { await ex.exportSeasonXlsx(label, games); toastOk('Excel da época descarregado.'); }
  } catch (err) {
    toastError(err.message || dbErrorMessage(err));
  }
}

// --- Novo scout -------------------------------------------------------------

// Jogos do calendário que fazem sentido scoutar agora: das minhas equipas,
// de há duas semanas até daqui a três dias, ainda sem scout.
function candidateGames() {
  const mine = new Set(myTeams().map((t) => t.id));
  const taken = new Set((state.scouts || []).map((r) => r.event_id).filter(Boolean));
  const now = new Date();
  const from = new Date(now.getTime() - 14 * 864e5).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 3 * 864e5).toISOString().slice(0, 10);
  return state.events
    .filter((e) => e.type === 'jogo' && mine.has(e.team_id) && !taken.has(e.id) && e.date >= from && e.date <= to)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function openNewScout() {
  const games = candidateGames();
  const OUTRO = '__outro';
  openModal({
    title: 'Scout de um jogo',
    intro: 'Escolhe o jogo do calendário. No fim, os parciais e os pontos jogados de cada atleta vão para o resultado desse jogo.',
    fields: [{
      name: 'game', label: 'Jogo', type: 'select', required: true,
      options: [
        ...games.map((e) => ({ key: e.id, label: `${teamLabelOf(e.team_id)} · ${fmtDate(e.date)} · vs ${e.opponent || 'adversário'}` })),
        { key: OUTRO, label: 'Outro jogo (fora do calendário)' },
      ],
      default: games[0]?.id || OUTRO,
    }],
    submitLabel: 'Continuar',
    onSubmit: async ({ game }) => {
      if (game !== OUTRO) {
        setTimeout(() => openScoutForEvent(game), 0);
        return;
      }
      setTimeout(openNewFreeScout, 0);
    },
  });
}

function openNewFreeScout() {
  const teams = myTeams();
  openModal({
    title: 'Jogo fora do calendário',
    intro: 'Para um particular ou torneio que não esteja no calendário. Fica no histórico da equipa, mas não preenche o resultado de nenhum jogo.',
    fields: [
      { name: 'team_id', label: 'Equipa', type: 'select', required: true,
        options: teams.map((t) => ({ key: t.id, label: teamName(t) })), default: teamFilter || teams[0]?.id },
      { name: 'opponent', label: 'Adversário', required: true },
      { name: 'game_date', label: 'Data', type: 'date', required: true, default: new Date().toISOString().slice(0, 10) },
      { name: 'competition', label: 'Competição (opcional)', placeholder: 'Torneio de Natal' },
    ],
    submitLabel: 'Começar scout',
    onSubmit: async (v) => {
      const row = await startScout({ team_id: v.team_id, opponent: v.opponent.trim(), game_date: v.game_date, competition: v.competition?.trim() || null });
      setTimeout(() => openScoutLive(row), 0);
    },
  });
}

async function startScout(values) {
  const roster = rosterOf(values.team_id);
  if (roster.length < 6) throw new Error('A equipa precisa de pelo menos 6 atletas no plantel para começar.');
  // A formação inicial do último jogo da equipa é o melhor ponto de partida.
  const last = (state.scouts || []).find((r) => r.team_id === values.team_id && r.summary?.base);
  const data = emptyData(roster, last?.summary?.base || {});
  return createScout({ ...values, data, summary: summaryOf(data) });
}

function summaryOf(data) {
  const s1 = data.sets[0];
  return { ...summarize(data), base: { lineup: s1.lineup, libero: s1.libero, liberoFor: s1.liberoFor } };
}

// Do botão "Scout" de um jogo no Calendário: abre o scout desse jogo ou cria-o.
export async function openScoutForEvent(eventId) {
  try {
    if (state.scouts === null) await loadScouts();
    if (!state.scoutsReady) throw new Error('O Scout ainda não está ativo neste clube (falta correr supabase/scout.sql).');
    const existing = state.scouts.find((r) => r.event_id === eventId);
    if (existing) { await openScoutById(existing.id); return; }
    const ev = state.events.find((e) => e.id === eventId);
    if (!ev) throw new Error('Jogo não encontrado.');
    const row = await startScout({
      team_id: ev.team_id, event_id: ev.id, opponent: ev.opponent || '', game_date: ev.date, competition: null,
    });
    openScoutLive(row);
  } catch (err) {
    toastError(err.message || dbErrorMessage(err));
  }
}

async function openScoutById(id) {
  try {
    const [row] = await loadScoutData(id);
    if (!row) throw new Error('Este jogo já não existe.');
    openScoutLive(row);
  } catch (err) {
    toastError(err.message || dbErrorMessage(err));
  }
}

// --- Detalhe de um jogo (estatísticas, só leitura) --------------------------

async function openDetail(id) {
  let g;
  try {
    const [row] = await loadScoutData(id);
    if (!row) throw new Error('Este jogo já não existe.');
    g = toGame(row);
  } catch (err) {
    toastError(err.message || dbErrorMessage(err));
    return;
  }
  let filter = 'all';
  const editable = canEdit('game_scouts');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const paint = () => {
    const r = setsWon(g.data);
    overlay.innerHTML = `
      <div class="modal card modal--wide scout-detail" role="dialog" aria-modal="true" aria-labelledby="scd-title">
        <div class="modal__head">
          <div>
            <h2 class="section-title" id="scd-title">${esc(g.teamLabel)} ${r.o}–${r.t} ${esc(g.opponent || 'Adversário')}</h2>
            <p class="muted" style="margin:0;font-size:0.85rem">${esc([fmtDate(g.game_date), g.competition, g.status === 'terminado' ? '' : 'em curso'].filter(Boolean).join(' · '))}</p>
          </div>
          <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
        </div>
        <div class="scout-detail__body">
          <div class="cell-actions">
            ${setFilterHTML(g.data, filter)}
          </div>
          ${statsBlock([g.data], filter, { played: pointsPlayed(filter === 'all' ? g.data : { ...g.data, events: g.data.events.filter((e) => e.set === Number(filter)) }) })}
          <div class="modal__actions">
            ${editable ? '<button class="btn btn--danger btn--sm" type="button" data-del>Apagar scout</button>' : ''}
            <span style="flex:1"></span>
            ${editable ? `<button class="btn btn--ghost" type="button" data-resume>${g.status === 'terminado' ? 'Corrigir' : 'Continuar'}</button>` : ''}
            <button class="btn btn--ghost" type="button" data-sheet>Folha A4</button>
            <button class="btn btn--primary" type="button" data-xlsx>Excel</button>
          </div>
        </div>
      </div>`;
    overlay.querySelector('.modal__close').addEventListener('click', close);
    overlay.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.set; paint(); }));
    overlay.querySelector('[data-sheet]').addEventListener('click', () => import('../scout-export.js').then((ex) => ex.openGameSheet(g)).catch((e) => toastError(e.message)));
    overlay.querySelector('[data-xlsx]').addEventListener('click', () => import('../scout-export.js').then((ex) => ex.exportGameXlsx(g)).catch((e) => toastError(e.message)));
    overlay.querySelector('[data-resume]')?.addEventListener('click', () => { close(); openScoutLive(g); });
    overlay.querySelector('[data-del]')?.addEventListener('click', async () => {
      const ok = await confirmDialog('Apagar este scout? As ações marcadas deixam de existir para toda a equipa técnica. O resultado do jogo no calendário fica como está.', { confirmLabel: 'Apagar scout' });
      if (!ok) return;
      try {
        await deleteScout(g.id);
        LS.del(backupKey(g.id));
        if (LS.get(ACTIVE_KEY) === g.id) LS.del(ACTIVE_KEY);
        close();
      } catch (err) { toastError(dbErrorMessage(err)); }
    });
  };
  paint();
  const close = wireDialog(overlay, {});
}

// --- Blocos de estatística (secção, detalhe e ecrã de jogo) -----------------

function setFilterHTML(data, cur) {
  return `<div class="cal-toggle" role="group" aria-label="Filtro de set">
    <button class="cal-toggle__btn ${cur === 'all' ? 'cal-toggle__btn--active' : ''}" type="button" data-set="all" aria-pressed="${cur === 'all'}">Total</button>
    ${data.sets.map((_, i) => `<button class="cal-toggle__btn ${cur === String(i) ? 'cal-toggle__btn--active' : ''}" type="button" data-set="${i}" aria-pressed="${cur === String(i)}">${i + 1}º set</button>`).join('')}
  </div>`;
}

function statsBlock(datas, f, { multi = false, played = {} } = {}) {
  const ts = teamSummary(datas, f);
  const rows = playerRows(datas, f);
  const min = multi ? 10 : 3;
  const bar = (parts) => {
    const s = parts.reduce((a, p) => a + p[0], 0) || 1;
    return `<div class="scout-bar">${parts.map(([v, c]) => `<span style="width:${(v / s) * 100}%;background:${c}"></span>`).join('')}</div>`;
  };
  const rank = (title, key, kind, minKey) => {
    const list = rows
      .filter((r) => r.s[key] != null && (kind === 'n' ? r.s[key] > 0 : r.s[minKey] >= min))
      .sort((a, b) => b.s[key] - a.s[key]).slice(0, 3);
    return `<div class="scout-rank"><h3>${title}</h3>${list.length
      ? `<ol>${list.map((r) => `<li><span>${esc(`${r.p.num} · ${shortName(r.p.name)}`)}</span><span>${kind === 'n' ? r.s[key] : fmtPct(r.s[key])}</span></li>`).join('')}</ol>`
      : '<p class="muted">Dados insuficientes</p>'}</div>`;
  };
  const meritPct = ts.our ? Math.round(((ts.our - ts.oppErr) / ts.our) * 100) : 0;
  return `
    <div class="scout-kpis">
      <div class="scout-kpi"><span class="muted">Pontos nossos</span><strong>${ts.our}</strong>
        ${bar([[ts.kill, 'var(--ok)'], [ts.ace, 'var(--info)'], [ts.blk, 'var(--navy-300)'], [ts.oppErr, 'var(--border)']])}
        <span class="muted scout-kpi__legend">${ts.kill} ataque · ${ts.ace} serviço · ${ts.blk} bloco · ${ts.oppErr} erros adv.</span></div>
      <div class="scout-kpi"><span class="muted">Pontos do adversário</span><strong>${ts.their}</strong>
        ${bar([[ts.ourErr, 'var(--danger)'], [ts.oppPt, 'var(--border)']])}
        <span class="muted scout-kpi__legend">${ts.ourErr} erros nossos · ${ts.oppPt} mérito do adversário</span></div>
      <div class="scout-kpi"><span class="muted">Pontos por mérito próprio</span><strong>${meritPct}%</strong>
        <span class="muted scout-kpi__legend">dos pontos ganhos vieram de ações nossas</span></div>
    </div>
    <div class="scout-ranks">
      ${rank('Pontos', 'pts', 'n')}${rank('Eficácia de ataque', 'effA', 'p', 'atk')}${rank('Ases', 'ace', 'n')}
      ${rank('Receção positiva', 'posR', 'p', 'rec')}${rank('Pontos de bloco', 'blk', 'n')}${rank('Defesa positiva', 'posD', 'p', 'def')}
    </div>
    ${rows.length ? `<div class="table-wrap"><table class="no-stack scout-table">
      <thead><tr><th rowspan="2">Atleta</th>${multi ? '<th rowspan="2">Jogos</th>' : ''}<th rowspan="2" title="Pontos em que esteve em campo">Pts jog.</th><th rowspan="2">Pts</th><th rowspan="2">Erros</th>
        <th colspan="3" class="scout-table__grp">Serviço</th><th colspan="3" class="scout-table__grp">Receção</th><th colspan="3" class="scout-table__grp">Ataque</th>
        <th colspan="2" class="scout-table__grp">Bloco</th><th colspan="2" class="scout-table__grp">Defesa</th><th colspan="2" class="scout-table__grp">Passe</th></tr>
        <tr><th class="scout-table__gl">Tot</th><th>Ace</th><th>Ef.</th><th class="scout-table__gl">Tot</th><th>Pos</th><th>Perf</th><th class="scout-table__gl">Tot</th><th>Pto</th><th>Ef.</th>
        <th class="scout-table__gl">Tot</th><th>Pto</th><th class="scout-table__gl">Tot</th><th>Pos</th><th class="scout-table__gl">Tot</th><th>Pos</th></tr></thead>
      <tbody>${rows.map(({ id, p, s, j }) => `<tr>
        <td>${esc(`${p.num} · ${p.name}`)}</td>${multi ? `<td>${j}</td>` : ''}<td>${played[id] || 0}</td><td><strong>${s.pts}</strong></td><td>${s.errs}</td>
        <td class="scout-table__gl">${s.srv}</td><td>${s.ace}</td><td>${fmtPct(s.effS)}</td>
        <td class="scout-table__gl">${s.rec}</td><td>${fmtPct(s.posR)}</td><td>${fmtPct(s.perfR)}</td>
        <td class="scout-table__gl">${s.atk}</td><td>${s.kill}</td><td>${fmtPct(s.effA)}</td>
        <td class="scout-table__gl">${s.blkT}</td><td>${s.blk}</td><td class="scout-table__gl">${s.def}</td><td>${fmtPct(s.posD)}</td>
        <td class="scout-table__gl">${s.pas}</td><td>${fmtPct(s.posP)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">Sem ações registadas${f === 'all' ? '' : ' neste set'}.</p>`}
    <p class="muted scout-footnote">Pts jog. = pontos em que a atleta estava em campo · Ef. serviço = (ases − erros) ÷ total · Ef. ataque = (pontos − erros − bloqueados) ÷ total · Pos. = (# + +) ÷ total${multi ? ' · rankings de percentagem com pelo menos 10 ações' : ''}</p>`;
}

// =============================================================================
// Ecrã de jogo
// =============================================================================

let live = null;

export function openScoutLive(row) {
  if (live) live.close();
  const g = toGame(row);
  // A cópia do dispositivo ganha se for mais recente: é a que tem os toques
  // que não chegaram a sair (rede no pavilhão).
  const backup = LS.get(backupKey(g.id));
  let pendingFromBackup = false;
  if (backup && backup.data && backup.at > Date.parse(row.updated_at || 0)) {
    g.data = normalize(backup.data, row);
    g.status = backup.status || g.status;
    pendingFromBackup = true;
  }
  if (g.status === 'em_curso') LS.set(ACTIVE_KEY, g.id);

  const ui = {
    sel: null, tab: 'jogo', statSet: 'all', lineupOpen: null, logOpen: window.matchMedia('(min-width: 700px)').matches,
    sync: 'ok', hit: null,
  };
  let saveTimer = null;
  let saving = false;
  let again = false;
  let wakeLock = null;
  const team = teamById(g.team_id);
  const canWrite = canEdit('game_scouts');

  const overlay = document.createElement('div');
  overlay.className = 'scout-live';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Scout ao vivo');
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const D = () => g.data;
  const P = (id) => findPlayer(g.data, id) || (() => { const p = state.players.find((x) => x.id === id); return p ? { id, num: p.number || '', name: p.name } : null; })();
  const pname = (id) => { const p = P(id); return p ? `${p.num} · ${p.name}` : '—'; };

  // --- Gravação ---------------------------------------------------------------
  function touch() {
    LS.set(backupKey(g.id), { at: Date.now(), data: g.data, status: g.status });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    if (saving) { again = true; return; }
    saving = true; ui.sync = 'saving'; paintSync();
    const snap = JSON.parse(JSON.stringify(g.data));
    try {
      const saved = await saveScoutData(g.id, { data: snap, summary: summaryOf(snap), status: g.status });
      g.updated_at = saved.updated_at;
      ui.sync = 'ok';
    } catch (err) {
      ui.sync = 'err';
    }
    saving = false; paintSync();
    if (again) { again = false; flush(); }
  }
  const onOnline = () => { if (ui.sync === 'err') flush(); };
  window.addEventListener('online', onOnline);

  async function keepAwake() {
    try {
      if (wakeLock || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch { wakeLock = null; }
  }
  const onVisible = () => { if (document.visibilityState === 'visible') keepAwake(); else if (saveTimer) flush(); };
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();

  // --- Ações -----------------------------------------------------------------
  const curSet = () => D().sets[D().cur];

  function act(t, q) {
    if (!canWrite) return;
    const set = curSet();
    if (!set.firstServer) { toastInfo('Indica primeiro quem começa a servir.'); return; }
    if (derive(D(), D().cur).lineup.some((x) => !x)) { toastInfo('Completa a formação (6 atletas) antes de marcar.'); ui.lineupOpen = true; paint(); return; }
    if (t !== 'OPPONENT' && !ui.sel) {
      toastInfo('Toca primeiro na atleta (ou usa as teclas 1–6).');
      const c = overlay.querySelector('.scout-court');
      if (c) { c.classList.remove('scout-court--flash'); void c.offsetWidth; c.classList.add('scout-court--flash'); }
      return;
    }
    const before = derive(D(), D().cur);
    D().events.push({ set: D().cur, t, q, pid: t === 'OPPONENT' ? null : ui.sel, ts: Date.now() });
    ui.hit = `${t}.${q}`;
    try { navigator.vibrate?.(15); } catch { /* sem vibração */ }
    const after = derive(D(), D().cur);
    // Fim do rally a servir nós: a servidora fica já escolhida.
    const rallyEnded = after.our + after.their !== before.our + before.their;
    ui.sel = rallyEnded && after.srv === 'OUR' ? court(D(), D().cur).pos[0].pid : null;
    touch(); paint();
  }

  function undo() {
    for (let i = D().events.length - 1; i >= 0; i--) {
      if (D().events[i].set === D().cur) {
        const [e] = D().events.splice(i, 1);
        ui.sel = null; touch(); paint();
        toastInfo(`Anulado: ${describe(e)}`);
        return;
      }
    }
    toastInfo('Nada para anular neste set.');
  }

  function describe(e) {
    if (e.t === 'SUB') return `substituição (${pname(e.out)} ⇄ ${pname(e.in)})`;
    if (e.t === 'OPPONENT') return e.q === 'ERROR' ? 'erro do adversário' : 'mérito do adversário';
    return `${ACT[e.t].l} ${SYM[e.q]} · ${pname(e.pid)}`;
  }

  function selectPos(n) {
    const c = court(D(), D().cur).pos[n - 1];
    if (c && c.pid) { ui.sel = ui.sel === c.pid ? null : c.pid; paint(); }
  }

  async function newSet() {
    if (D().sets.length >= MAX_SETS) { toastInfo('Um jogo tem no máximo 5 sets.'); return; }
    if (!setWinner(D(), D().cur) && hasPoints(D(), D().cur)) {
      const d = derive(D(), D().cur);
      const ok = await confirmDialog(`O ${D().cur + 1}º set ainda não terminou (${d.our}–${d.their}). Passar ao set seguinte mesmo assim?`, { confirmLabel: 'Novo set', danger: false });
      if (!ok) return;
    }
    const prev = curSet();
    const d = derive(D(), D().cur);
    D().sets.push({ lineup: d.lineup.slice(), libero: prev.libero, liberoFor: prev.liberoFor.slice(), firstServer: null });
    D().cur = D().sets.length - 1;
    ui.sel = null; ui.lineupOpen = true; touch(); paint();
  }

  function changeSlot(slot, pid) {
    const set = curSet();
    const d = derive(D(), D().cur);
    if (pid && d.lineup.includes(pid) && d.lineup[slot] !== pid) { toastInfo(`${pname(pid)} já está na formação.`); paint(); return; }
    if (pid && pid === set.libero) { toastInfo('A líbero não entra na formação base: escolhe-a no campo "Líbero".'); paint(); return; }
    if (!hasPoints(D(), D().cur)) set.lineup[slot] = pid;
    else {
      if (!pid) { paint(); return; }
      D().events.push({ set: D().cur, t: 'SUB', out: d.lineup[slot], in: pid, ts: Date.now() });
      toastInfo('Substituição registada.');
    }
    touch(); paint();
  }

  async function finish() {
    const linked = g.event_id && state.events.some((e) => e.id === g.event_id);
    const canResult = linked && canEdit('game_results');
    const prior = canResult && gameResult(g.event_id);
    const msg = canResult
      ? `Terminar o jogo? Os parciais (${partials(D()).map((s) => `${s.our}-${s.their}`).join(', ') || 'sem pontos'}) e os pontos jogados de cada atleta vão para o resultado do jogo no calendário${prior ? ', substituindo o que lá está' : ''}.`
      : 'Terminar o jogo? Fica guardado no histórico da equipa, onde podes ver as estatísticas e exportar.';
    const ok = await confirmDialog(msg, { confirmLabel: 'Terminar jogo', danger: false });
    if (!ok) return;
    g.status = 'terminado';
    clearTimeout(saveTimer);
    LS.set(backupKey(g.id), { at: Date.now(), data: g.data, status: g.status });
    await flush();
    if (ui.sync !== 'ok') {
      toastError('Sem ligação: o jogo ficou guardado neste dispositivo e sobe quando houver rede. O resultado é registado depois, ao terminar de novo.');
      return;
    }
    LS.del(ACTIVE_KEY);
    LS.del(backupKey(g.id));
    if (canResult) {
      try {
        const ps = partials(D());
        const w = setsWon(D());
        await saveGameResult(g.event_id, {
          setsFor: w.o, setsAgainst: w.t, notes: prior?.notes || null,
          sets: ps.map((s) => ({ points_for: s.our, points_against: s.their })),
        });
        const played = pointsPlayed(D());
        const teamPlayers = state.players.filter((p) => p.team_id === g.team_id).map((p) => p.id);
        const ids = new Set([...teamPlayers, ...Object.keys(played).filter((id) => state.players.some((p) => p.id === id))]);
        await saveGameParticipation(g.event_id, [...ids].map((id) => ({ playerId: id, field: 'points', value: played[id] ? played[id] : '' })));
      } catch (err) {
        toastError(`O scout ficou guardado, mas não foi possível registar o resultado: ${dbErrorMessage(err)}`);
      }
    } else {
      toastOk('Jogo terminado e guardado.');
    }
    close();
  }

  function close() {
    clearTimeout(saveTimer);
    if (ui.sync !== 'ok' || saving) flush();
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('keydown', onKey);
    try { wakeLock?.release(); } catch { /* já libertado */ }
    overlay.remove();
    document.body.classList.remove('no-scroll');
    live = null;
    notifyScouts();
  }

  // --- Desenho ---------------------------------------------------------------
  function syncHTML() {
    if (!canWrite) return '<span class="scout-sync">Só leitura</span>';
    return {
      ok: '<span class="scout-sync scout-sync--ok">Guardado</span>',
      saving: '<span class="scout-sync">A guardar…</span>',
      err: '<span class="scout-sync scout-sync--warn">Sem rede: guardado no dispositivo <button type="button" class="scout-linkbtn" data-retry>Tentar</button></span>',
    }[ui.sync];
  }
  function paintSync() {
    const el = overlay.querySelector('#scout-sync');
    if (el) el.innerHTML = syncHTML();
    overlay.querySelector('[data-retry]')?.addEventListener('click', flush);
  }

  function tile(c, n, srv) {
    if (!c || !c.pid) return `<button class="scout-tile scout-tile--empty" type="button" data-pos="${n}" aria-label="Posição ${n} vazia"><span class="scout-tile__pos">P${n}</span><span class="scout-tile__nm">vazia</span></button>`;
    const p = P(c.pid) || { num: '?', name: '' };
    const sel = ui.sel === c.pid;
    return `<button class="scout-tile${c.lib ? ' scout-tile--lib' : ''}${sel ? ' scout-tile--sel' : ''}" type="button" data-pos="${n}" aria-pressed="${sel}" aria-label="Posição ${n}: ${esc(`${p.num} ${p.name}`)}${c.lib ? ' (líbero)' : ''}">
      <span class="scout-tile__pos">P${n}</span>${srv ? '<span class="scout-tile__srv" title="A servir"></span>' : ''}
      <span class="scout-tile__n">${esc(p.num)}</span><span class="scout-tile__nm">${esc(shortName(p.name))}</span></button>`;
  }

  function gameHTML() {
    const si = D().cur;
    const set = curSet();
    const { d, pos } = court(D(), si);
    const w = setWinner(D(), si);
    const pts = hasPoints(D(), si);
    const our = esc(team ? teamName(team) : 'Nós');
    const their = esc(g.opponent || 'Adversário');
    const roster = D().roster.slice().sort((a, b) => numOf(a) - numOf(b));
    const opts = (selId, allowEmpty) => `${allowEmpty ? '<option value="">—</option>' : ''}${roster.map((p) => `<option value="${esc(p.id)}" ${p.id === selId ? 'selected' : ''}>${esc(`${p.num} · ${p.name}`)}</option>`).join('')}`;
    const open = ui.lineupOpen ?? (!set.firstServer || set.lineup.some((x) => !x));

    let banner = '';
    if (!set.firstServer) {
      banner = `<div class="scout-banner scout-banner--warn o-banner"><span>Quem começa a servir no ${si + 1}º set?</span>
        <span class="cal-toggle"><button class="cal-toggle__btn" type="button" data-fs="OUR">${our}</button><button class="cal-toggle__btn" type="button" data-fs="THEIR">${their}</button></span></div>`;
    } else if (w) {
      banner = `<div class="scout-banner scout-banner--${w === 'OUR' ? 'win' : 'lose'} o-banner"><span>${w === 'OUR' ? 'Set ganho' : 'Set perdido'} ${d.our}–${d.their}</span>
        <span class="cell-actions">${D().sets.length < MAX_SETS ? '<button class="btn btn--primary btn--sm" type="button" data-newset>Novo set</button>' : ''}<button class="btn btn--ghost btn--sm" type="button" data-finish>Fim de jogo</button></span></div>`;
    }

    let o = 0; let t = 0;
    const evs = [];
    for (const e of D().events) {
      if (e.set !== si) continue;
      if (e.t !== 'SUB') { const inc = ACT[e.t].q[e.q]; if (inc === 'OUR') o++; else if (inc === 'THEIR') t++; }
      evs.push({ e, sc: `${o}–${t}` });
    }
    const log = evs.slice(-10).reverse().map(({ e, sc }) => {
      if (e.t === 'SUB') return `<li><span class="scout-q">⇄</span><span class="scout-log__wh">Sai ${esc(pname(e.out))}, entra ${esc(pname(e.in))}</span><span class="scout-log__sc">${sc}</span></li>`;
      const q = e.t === 'OPPONENT' ? (e.q === 'ERROR' ? 'PERFECT' : 'ERROR') : e.q;
      const who = e.t === 'OPPONENT' ? (e.q === 'ERROR' ? 'Erro do adversário' : 'Mérito do adversário') : `${ACT[e.t].l} · ${esc(pname(e.pid))}`;
      return `<li><span class="scout-q scout-q--${q}">${e.t === 'OPPONENT' ? '◦' : SYM[e.q]}</span><span class="scout-log__wh">${who}</span><span class="scout-log__sc">${sc}</span></li>`;
    }).join('') || '<li><span></span><span class="muted">Ainda sem ações neste set.</span><span></span></li>';

    const head = COLS.map(([, l, s]) => `<div class="scout-ch"><span class="scout-ch__l">${l}</span><span class="scout-ch__s">${s}</span></div>`).join('');
    const body = ROWS.map((r) => COLS.map(([k]) => {
      let q = r;
      let txt = '';
      if (k === 'OPPONENT') {
        if (r === 'PERFECT') { q = 'ERROR'; txt = 'Erro'; } else if (r === 'ERROR') { q = 'POINT'; txt = 'Mérito'; } else return '<div class="scout-blank"></div>';
      }
      if (!(q in ACT[k].q)) return '<div class="scout-blank"></div>';
      const inc = ACT[k].q[q];
      return `<button class="scout-ab scout-ab--${r}${inc === 'OUR' ? ' scout-ab--our' : inc === 'THEIR' ? ' scout-ab--their' : ''}" type="button" data-t="${k}" data-q="${q}" ${canWrite ? '' : 'disabled'}
        aria-label="${ACT[k].l} – ${k === 'OPPONENT' ? txt : QN[r]}"><span class="scout-ab__sym">${k === 'OPPONENT' ? (q === 'ERROR' ? '+1' : '−1') : SYM[r]}</span>${txt ? `<span class="scout-ab__tx">${txt}</span>` : ''}</button>`;
    }).join('')).join('');

    const order = [4, 3, 2, 5, 6, 1];
    const selP = ui.sel ? P(ui.sel) : null;
    const lineupRows = d.lineup.map((pid, slot) => `
      <span class="scout-lineup__p">${slot + 1}</span>
      <select id="sc-slot-${slot}" data-slot="${slot}" aria-label="Posição inicial ${slot + 1}" ${canWrite ? '' : 'disabled'}>${opts(pid, !pts || !pid)}</select>
      <input type="checkbox" id="sc-lib-${slot}" data-libfor="${esc(pid || '')}" ${pid && set.liberoFor.includes(pid) ? 'checked' : ''} ${!pid || !set.libero || !canWrite ? 'disabled' : ''} aria-label="Troca com a líbero">`).join('');

    return `<div class="scout-grid">
      <div class="scout-col">
        ${banner}
        <section class="card scout-court-card o-court" aria-label="Campo">
          <div class="scout-net"><span>REDE</span></div>
          <div class="scout-court">${order.map((n) => `<div class="scout-spot${[1, 5, 6].includes(n) ? ' scout-spot--back' : ''}">${tile(pos[n - 1], n, n === 1 && d.srv === 'OUR')}</div>`).join('')}</div>
          <div class="scout-status"><span>Rotação <strong>${d.rot + 1}</strong></span><span>Serviço: <strong>${set.firstServer ? (d.srv === 'OUR' ? our : their) : '—'}</strong></span><span class="muted scout-kbd">Teclas 1–6 · Z anula</span></div>
        </section>
        <details class="card o-lineup" ${open ? 'open' : ''} data-toggle="lineup">
          <summary class="scout-summary">Formação do ${si + 1}º set${pts ? ' · substituições' : ''}</summary>
          <div class="scout-lineup">
            <span class="scout-lineup__h">Pos.</span><span class="scout-lineup__h">Atleta</span><span class="scout-lineup__h">Líbero</span>
            ${lineupRows}
            <span class="scout-lineup__p">L</span>
            <select id="sc-libero" data-libero aria-label="Líbero" ${canWrite ? '' : 'disabled'}>${opts(set.libero, true)}</select><span></span>
          </div>
          ${set.firstServer && !pts ? `<div class="cell-actions" style="margin-top:0.7rem"><span class="muted">Começa a servir:</span>
            <span class="cal-toggle"><button class="cal-toggle__btn ${set.firstServer === 'OUR' ? 'cal-toggle__btn--active' : ''}" type="button" data-fs="OUR" aria-pressed="${set.firstServer === 'OUR'}">${our}</button>
            <button class="cal-toggle__btn ${set.firstServer === 'THEIR' ? 'cal-toggle__btn--active' : ''}" type="button" data-fs="THEIR" aria-pressed="${set.firstServer === 'THEIR'}">${their}</button></span></div>` : ''}
          <p class="muted scout-footnote">${pts ? 'Com o set em curso, mudar uma posição regista uma substituição.' : 'Posição inicial 1 = zona de serviço. A líbero entra nas zonas 5, 6 e 1 no lugar das atletas marcadas (nunca a servir).'}</p>
        </details>
        <div class="cell-actions o-buttons">
          <button class="btn btn--ghost" type="button" data-newset ${D().sets.length >= MAX_SETS || !canWrite ? 'disabled' : ''}>Novo set</button>
          <button class="btn btn--primary" type="button" data-finish ${canWrite ? '' : 'disabled'}>Fim de jogo</button>
        </div>
        ${D().sets.length > 1 ? `<div class="cell-actions o-sets"><span class="muted">Set ativo:</span>${D().sets.map((_, i) => {
          const x = derive(D(), i);
          return `<button class="btn btn--sm ${i === si ? 'btn--primary' : 'btn--ghost'}" type="button" data-goset="${i}">${i + 1}º ${x.our}–${x.their}</button>`;
        }).join('')}</div>` : ''}
      </div>
      <div class="scout-col">
        <section class="card o-actions">
          <div class="scout-selline">
            <div><span class="muted">Atleta selecionada</span><div class="scout-selname">${selP ? esc(`${selP.num} · ${selP.name}`) : '<span class="muted">Toca numa atleta</span>'}</div></div>
            <button class="btn btn--ghost" type="button" data-undo ${canWrite ? '' : 'disabled'}>Anular última</button>
          </div>
          <div class="scout-agrid">${head}${body}</div>
          <div class="scout-legend">
            <span><code>#</code> perfeito</span><span><code>+</code> bom</span><span><code>−</code> fraco</span><span><code>/</code> bloqueado</span><span><code>=</code> erro</span>
            <span><i class="scout-dot" style="background:var(--ok)"></i>ponto nosso</span><span><i class="scout-dot" style="background:var(--danger)"></i>ponto do adversário</span>
          </div>
        </section>
        <details class="card o-log" ${ui.logOpen ? 'open' : ''} data-toggle="log">
          <summary class="scout-summary">Últimas ações</summary>
          <ul class="scout-log">${log}</ul>
        </details>
      </div>
    </div>`;
  }

  function statsHTML() {
    const f = ui.statSet;
    const one = f === 'all' ? D() : { ...D(), events: D().events.filter((e) => e.set === Number(f)) };
    return `<div class="scout-stats">
      <div class="cell-actions">${setFilterHTML(D(), f)}
        <span style="flex:1"></span>
        <button class="btn btn--ghost btn--sm" type="button" data-copy>Copiar resumo</button>
        <button class="btn btn--ghost btn--sm" type="button" data-sheet>Folha A4</button>
        <button class="btn btn--ghost btn--sm" type="button" data-xlsx>Excel</button></div>
      ${statsBlock([D()], f, { played: pointsPlayed(one) })}
    </div>`;
  }

  function paint() {
    const si = D().cur;
    const d = derive(D(), si);
    const w = setsWon(D());
    const our = esc(team ? teamName(team) : 'Nós');
    const their = esc(g.opponent || 'Adversário');
    overlay.innerHTML = `
      <header class="scout-board">
        <div class="scout-board__top">
          <button class="scout-board__close" type="button" data-close aria-label="Sair do scout">← Sair</button>
          <span id="scout-sync">${syncHTML()}</span>
        </div>
        <div class="scout-score">
          <span class="scout-score__team">${our}</span>
          <span class="scout-score__pts"><i class="scout-ball${d.srv === 'OUR' ? ' scout-ball--on' : ''}"></i>${d.our}</span>
          <span class="scout-score__mid"><strong>${si + 1}º SET</strong><span>sets ${w.o}–${w.t}</span></span>
          <span class="scout-score__pts">${d.their}<i class="scout-ball${d.srv === 'THEIR' ? ' scout-ball--on' : ''}"></i></span>
          <span class="scout-score__team scout-score__team--r">${their}</span>
        </div>
        <nav class="scout-tabs" role="tablist">
          <button class="scout-tab" role="tab" type="button" data-tab="jogo" aria-selected="${ui.tab === 'jogo'}">Jogo</button>
          <button class="scout-tab" role="tab" type="button" data-tab="stats" aria-selected="${ui.tab === 'stats'}">Estatísticas</button>
        </nav>
      </header>
      <main class="scout-main">${ui.tab === 'jogo' ? gameHTML() : statsHTML()}</main>`;
    wire();
    if (ui.hit) {
      const [t, q] = ui.hit.split('.');
      overlay.querySelector(`.scout-ab[data-t="${t}"][data-q="${q}"]`)?.classList.add('scout-ab--hit');
      ui.hit = null;
    }
  }

  function wire() {
    const on = (sel, ev, fn) => overlay.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    on('[data-close]', 'click', close);
    on('[data-retry]', 'click', flush);
    on('[data-tab]', 'click', (e) => { ui.tab = e.currentTarget.dataset.tab; paint(); });
    on('[data-pos]', 'click', (e) => selectPos(Number(e.currentTarget.dataset.pos)));
    on('[data-t]', 'click', (e) => act(e.currentTarget.dataset.t, e.currentTarget.dataset.q));
    on('[data-undo]', 'click', undo);
    on('[data-newset]', 'click', newSet);
    on('[data-finish]', 'click', finish);
    on('[data-goset]', 'click', (e) => { D().cur = Number(e.currentTarget.dataset.goset); ui.sel = null; ui.lineupOpen = null; touch(); paint(); });
    on('[data-fs]', 'click', (e) => {
      if (!canWrite) return;
      if (hasPoints(D(), D().cur)) { toastInfo('Este set já tem pontos.'); return; }
      curSet().firstServer = e.currentTarget.dataset.fs;
      ui.sel = curSet().firstServer === 'OUR' ? court(D(), D().cur).pos[0].pid : null;
      touch(); paint();
    });
    on('[data-slot]', 'change', (e) => changeSlot(Number(e.currentTarget.dataset.slot), e.currentTarget.value || null));
    on('[data-libero]', 'change', (e) => {
      const id = e.currentTarget.value || null;
      if (id && derive(D(), D().cur).lineup.includes(id)) { toastInfo('Essa atleta já está na formação.'); paint(); return; }
      curSet().libero = id; touch(); paint();
    });
    on('[data-libfor]', 'change', (e) => {
      const id = e.currentTarget.dataset.libfor;
      if (!id) return;
      const s = curSet();
      s.liberoFor = e.currentTarget.checked ? [...new Set([...s.liberoFor, id])] : s.liberoFor.filter((x) => x !== id);
      touch(); paint();
    });
    on('details[data-toggle]', 'toggle', (e) => {
      if (e.currentTarget.dataset.toggle === 'lineup') ui.lineupOpen = e.currentTarget.open;
      else ui.logOpen = e.currentTarget.open;
    });
    on('[data-set]', 'click', (e) => { ui.statSet = e.currentTarget.dataset.set; paint(); });
    on('[data-sheet]', 'click', () => import('../scout-export.js').then((ex) => ex.openGameSheet(g)).catch((err) => toastError(err.message)));
    on('[data-xlsx]', 'click', () => import('../scout-export.js').then((ex) => ex.exportGameXlsx(g)).catch((err) => toastError(err.message)));
    on('[data-copy]', 'click', copySummary);
  }

  function copySummary() {
    const w = setsWon(D());
    const ts = teamSummary([D()]);
    const played = pointsPlayed(D());
    const txt = [
      `${team ? teamName(team) : 'Nós'} ${w.o}–${w.t} ${g.opponent || 'Adversário'} (${fmtDate(g.game_date)})`,
      `Sets: ${partials(D()).map((s) => `${s.our}-${s.their}`).join(', ')}`, '',
      `Pontos nossos: ${ts.our} (${ts.kill} ataque, ${ts.ace} serviço, ${ts.blk} bloco, ${ts.oppErr} erros adv.)`,
      `Pontos do adversário: ${ts.their} (${ts.ourErr} erros nossos, ${ts.oppPt} mérito)`, '',
      ...playerRows([D()]).map(({ id, p, s }) => `${p.num} ${p.name}: ${s.pts} pts · ${s.errs} erros · ataque ${s.kill}/${s.atk} (${fmtPct(s.effA)}) · receção ${fmtPct(s.posR)} · ${played[id] || 0} pontos jogados`),
    ].join('\n');
    navigator.clipboard?.writeText(txt).then(() => toastOk('Resumo copiado.'), () => toastError('Não foi possível copiar neste browser.'));
  }

  function onKey(ev) {
    if (ui.tab !== 'jogo' || !canWrite) return;
    if (ev.target.closest?.('input, select, textarea')) return;
    if (document.querySelector('.modal-overlay')) return;
    if (/^[1-6]$/.test(ev.key)) { selectPos(Number(ev.key)); ev.preventDefault(); }
    else if (ev.key === 'Escape') { ui.sel = null; paint(); }
    else if ((ev.key === 'z' || ev.key === 'Z') && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { undo(); ev.preventDefault(); }
  }
  document.addEventListener('keydown', onKey);

  live = { close };
  paint();
  if (pendingFromBackup && canWrite) flush();
}
