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
//     da secção ou do passo "Scout" de um jogo, na secção Jogos (jogos.js).
//
// Tudo o que se vê no ecrã de jogo deriva da sequência de ações
// (`scout-engine.js`). A gravação é silenciosa e com cópia no dispositivo: o
// pavilhão é onde a rede é pior, e um toque não pode ficar à espera dela.

import {
  state, loadScouts, loadScoutData, createScout, saveScoutData, deleteScout, notifyScouts,
  claimScout, releaseScout, scoutHeartbeat, loadScoutStamp, subscribeScout,
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
  activeCols, usedCols, OPTIONAL_COLS,
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

// --- Quem está a marcar -----------------------------------------------------
// Um jogo é marcado por UM dispositivo de cada vez (ver supabase/scout.sql). O
// dono é o DISPOSITIVO e não a pessoa: o mesmo treinador com o telemóvel e o
// tablet abertos são dois a gravar por cima um do outro.
const DEVICE_KEY = 'rumia-device-id';
let deviceMem = null;
function deviceId() {
  if (deviceMem) return deviceMem;
  let id = LS.get(DEVICE_KEY);
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    LS.set(DEVICE_KEY, id); // sem localStorage (janela privada) vale para esta sessão
  }
  deviceMem = id;
  return id;
}
// `profiles` não guarda nome: o nome é o da ficha de treinador ligada à conta.
function myName() {
  const c = (state.coaches || []).find((x) => x.user_id && x.user_id === state.profile?.id);
  if (c?.name) return c.name;
  const em = state.profile?.email || '';
  return em ? em.split('@')[0] : 'Equipa técnica';
}
// Sem sinal de vida há mais de um minuto, o dispositivo provavelmente ficou sem
// rede ou fechou a app sem sair. Não se assume: diz-se, e quem chega decide.
const STALE_MS = 60_000;
function ago(iso) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso || 0)) / 1000));
  if (s < 10) return 'agora mesmo';
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${Math.round(s / 3600)} h`;
}
// Outro dispositivo tem este jogo? → { name, fresh, at } ou null.
function otherWriter(row) {
  if (!row?.writer_device || row.writer_device === deviceId() || row.status !== 'em_curso') return null;
  const at = row.writer_at ? Date.parse(row.writer_at) : 0;
  return { name: row.writer_name || 'Outra pessoa', fresh: Date.now() - at < STALE_MS, at: row.writer_at };
}

// Quem chega a um jogo que outro dispositivo está a marcar: ver ou ficar com
// ele. Devolve 'view' | 'take' | null (fechou).
function askTakeover(other, { viewLabel = 'Ver ao vivo' } = {}) {
  return new Promise((resolve) => {
    let result = null;
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal card modal--confirm" role="alertdialog" aria-modal="true" aria-labelledby="sc-tk-title">
        <h2 class="section-title" id="sc-tk-title" style="font-size:1.1rem;margin:0 0 0.5rem">${other.fresh ? 'Este jogo está a ser marcado' : 'Este jogo ficou aberto noutro dispositivo'}</h2>
        <p class="modal__confirm-text">${other.fresh
          ? `<strong>${esc(other.name)}</strong> está a marcá-lo noutro dispositivo (último sinal ${esc(ago(other.at))}).`
          : `<strong>${esc(other.name)}</strong> estava a marcá-lo, mas o último sinal foi ${esc(ago(other.at))} — pode ter ficado sem rede ou fechado a app sem sair.`}</p>
        <p class="modal__confirm-text muted" style="font-size:0.88rem">Só um dispositivo marca de cada vez. Se passares a marcar aqui, o outro passa a só ver, e o que ele tiver marcado sem conseguir enviar${other.fresh ? ' (os últimos segundos)' : ' (se ficou sem rede)'} perde-se.</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-take>Passar a marcar aqui</button>
          <button type="button" class="btn btn--primary" data-view>${esc(viewLabel)}</button>
        </div>
      </div>`;
    const close = wireDialog(ov, { initialFocus: '[data-view]', onClose: () => resolve(result) });
    ov.querySelector('[data-view]').addEventListener('click', () => { result = 'view'; close(); });
    ov.querySelector('[data-take]').addEventListener('click', () => { result = 'take'; close(); });
  });
}

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
                  <span class="muted">${esc([r.competition, parc || 'sem pontos', liveLabel(r)].filter(Boolean).join(' · '))}</span></span>
                ${r.status === 'terminado'
                  ? `<span class="scout-res scout-res--${res.res}">${res.label}</span>`
                  : '<span class="badge badge--warn">em curso</span>'}
              </button>
              <div class="cell-actions">
                ${r.status === 'em_curso' ? `<button class="btn btn--ghost btn--sm" type="button" data-watch="${esc(r.id)}">Ver ao vivo</button>` : ''}
                ${r.status === 'em_curso' && editable ? `<button class="btn btn--primary btn--sm" type="button" data-open="${esc(r.id)}">Continuar</button>` : ''}
                <button class="btn btn--ghost btn--sm" type="button" data-sheet="${esc(r.id)}">Folha A4</button>
                <button class="btn btn--ghost btn--sm" type="button" data-xlsx="${esc(r.id)}">Excel</button>
              </div>
            </li>`;
          }).join('')}
        </ul>
      </section>`
      : emptyHTML('Ainda não há jogos scoutados nesta equipa. No separador Jogos, carrega em "Fazer scout" no jogo, ou cria um aqui.', {
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
  container.querySelectorAll('[data-watch]').forEach((b) => b.addEventListener('click', () => openScoutById(b.dataset.watch, { view: true })));
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

// "a marcar: Diogo" na lista — do que se sabia quando a lista carregou.
function liveLabel(r) {
  if (r.status !== 'em_curso' || !r.writer_device) return '';
  if (r.writer_device === deviceId()) return 'a marcar neste dispositivo';
  const o = otherWriter(r);
  return o?.fresh ? `a marcar: ${o.name}` : '';
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
  // As ações escolhidas vão na base: o jogo seguinte da equipa começa com as mesmas.
  return { ...summarize(data), base: { lineup: s1.lineup, libero: s1.libero, liberoDef: s1.liberoDef || null, liberoFor: s1.liberoFor, cols: data.cols || null } };
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

// Abrir um jogo para marcar passa sempre por aqui: é onde se pergunta, a quem
// chega, se outro dispositivo já o está a marcar.
async function openScoutById(id, { view = false } = {}) {
  try {
    const [row] = await loadScoutData(id);
    if (!row) throw new Error('Este jogo já não existe.');
    if (view || !canEdit('game_scouts')) { openScoutLive(row, { view: true }); return; }
    const other = otherWriter(row);
    if (other) {
      const choice = await askTakeover(other);
      if (!choice) return;
      if (choice === 'view') { openScoutLive(row, { view: true }); return; }
    }
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
            ${g.status === 'em_curso' ? '<button class="btn btn--ghost" type="button" data-watch>Ver ao vivo</button>' : ''}
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
    overlay.querySelector('[data-resume]')?.addEventListener('click', () => { close(); openScoutById(g.id); });
    overlay.querySelector('[data-watch]')?.addEventListener('click', () => { close(); openScoutById(g.id, { view: true }); });
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

// Grupos da tabela por ação — só entram os das ações que se marcaram.
const STAT_GROUPS = [
  ['SERVICE', 'Serviço', (s) => [s.srv, s.ace, fmtPct(s.effS)], ['Tot', 'Ace', 'Ef.']],
  ['RECEPTION', 'Receção', (s) => [s.rec, fmtPct(s.posR), fmtPct(s.perfR)], ['Tot', 'Pos', 'Perf']],
  ['ATTACK', 'Ataque', (s) => [s.atk, s.kill, fmtPct(s.effA)], ['Tot', 'Pto', 'Ef.']],
  ['BLOCK', 'Bloco', (s) => [s.blkT, s.blk], ['Tot', 'Pto']],
  ['DEFENSE', 'Defesa', (s) => [s.def, fmtPct(s.posD)], ['Tot', 'Pos']],
  ['SETTING', 'Passe', (s) => [s.pas, fmtPct(s.posP)], ['Tot', 'Pos']],
];

function statsBlock(datas, f, { multi = false, played = {} } = {}) {
  const ts = teamSummary(datas, f);
  const rows = playerRows(datas, f);
  const used = usedCols(datas);
  const groups = STAT_GROUPS.filter(([k]) => used.has(k));
  const min = multi ? 10 : 3;
  const bar = (parts) => {
    const s = parts.reduce((a, p) => a + p[0], 0) || 1;
    return `<div class="scout-bar">${parts.map(([v, c]) => `<span style="width:${(v / s) * 100}%;background:${c}"></span>`).join('')}</div>`;
  };
  const rank = (title, key, kind, minKey, col) => {
    if (col && !used.has(col)) return '';
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
      ${rank('Pontos', 'pts', 'n')}${rank('Eficácia de ataque', 'effA', 'p', 'atk', 'ATTACK')}${rank('Ases', 'ace', 'n', null, 'SERVICE')}
      ${rank('Receção positiva', 'posR', 'p', 'rec', 'RECEPTION')}${rank('Pontos de bloco', 'blk', 'n', null, 'BLOCK')}${rank('Defesa positiva', 'posD', 'p', 'def', 'DEFENSE')}
    </div>
    ${rows.length ? `<div class="table-wrap"><table class="no-stack scout-table">
      <thead><tr><th rowspan="2">Atleta</th>${multi ? '<th rowspan="2">Jogos</th>' : ''}<th rowspan="2" title="Pontos em que esteve em campo">Pts jog.</th><th rowspan="2">Pts</th><th rowspan="2">Erros</th>
        ${groups.map(([, l, , h]) => `<th colspan="${h.length}" class="scout-table__grp">${l}</th>`).join('')}</tr>
        <tr>${groups.map(([, , , h]) => h.map((x, i) => `<th${i ? '' : ' class="scout-table__gl"'}>${x}</th>`).join('')).join('')}</tr></thead>
      <tbody>${rows.map(({ id, p, s, j }) => `<tr>
        <td>${esc(`${p.num} · ${p.name}`)}</td>${multi ? `<td>${j}</td>` : ''}<td>${played[id] || 0}</td><td><strong>${s.pts}</strong></td><td>${s.errs}</td>
        ${groups.map(([, , cells]) => cells(s).map((v, i) => `<td${i ? '' : ' class="scout-table__gl"'}>${v}</td>`).join('')).join('')}</tr>`).join('')}</tbody></table></div>`
      : `<p class="muted">Sem ações registadas${f === 'all' ? '' : ' neste set'}.</p>`}
    <p class="muted scout-footnote">Pts jog. = pontos em que a atleta estava em campo · Ef. serviço = (ases − erros) ÷ total · Ef. ataque = (pontos − erros − bloqueados) ÷ total · Pos. = (# + +) ÷ total${multi ? ' · rankings de percentagem com pelo menos 10 ações' : ''}</p>`;
}

// =============================================================================
// Ecrã de jogo
// =============================================================================

let live = null;

// Dois modos no mesmo ecrã: MARCAR (o dono do jogo) e VER AO VIVO (só
// leitura, atualiza sozinho). Um dispositivo pode passar de um a outro sem
// sair: o adjunto que estava a ver fica com a marcação quando a bateria do
// outro telemóvel morre, e quem marcava passa a ver quando lha tiram.
export function openScoutLive(row, { view = false } = {}) {
  if (live) live.close();
  const g = toGame(row);
  const DEV = deviceId();
  let mode = view ? 'view' : 'write';
  // A cópia do dispositivo ganha se for mais recente: é a que tem os toques
  // que não chegaram a sair (rede no pavilhão). Só para quem marca — quem vê
  // quer o que está na nuvem.
  const backup = view ? null : LS.get(backupKey(g.id));
  let pendingFromBackup = false;
  if (backup && backup.data && backup.at > Date.parse(row.updated_at || 0)) {
    g.data = normalize(backup.data, row);
    g.status = backup.status || g.status;
    pendingFromBackup = true;
  }
  if (!view && g.status === 'em_curso') LS.set(ACTIVE_KEY, g.id);
  // Quem tem o jogo, tal como se sabe agora. `prevWriter` é o dono que quem
  // abriu aceitou substituir: a marcação só se tira a ESSE (ou a ninguém) — se
  // entretanto um terceiro a tiver, quem volta da falta de rede não lha rouba.
  let writer = { device: row.writer_device || null, name: row.writer_name || '', at: row.writer_at || null };
  let prevWriter = writer.device;
  let owner = false;
  let claiming = null;
  let closed = false;
  let closing = false;
  let unsub = null;
  let pollTimer = null;
  let tickTimer = null;
  let beatTimer = null;

  const ui = {
    sel: null, tab: 'jogo', statSet: 'all', logOpen: window.matchMedia('(min-width: 700px)').matches,
    sync: 'ok', hit: null,
  };
  let saveTimer = null;
  let retryTimer = null;
  let saving = false;
  let again = false;
  // Há alterações que ainda não chegaram à nuvem? É ESTA a pergunta que decide
  // se se grava ao sair — e não o estado da última gravação: um toque feito
  // menos de um segundo antes de "Sair" encontrava a última gravação "ok" e o
  // temporizador cancelado, e a ação ficava só no dispositivo.
  let dirty = false;
  let wakeLock = null;
  const team = teamById(g.team_id);
  let canWrite = !view && canEdit('game_scouts');

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
    dirty = true;
    LS.set(backupKey(g.id), { at: Date.now(), data: g.data, status: g.status });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  async function flush() {
    clearTimeout(saveTimer); saveTimer = null;
    clearTimeout(retryTimer); retryTimer = null;
    if (mode !== 'write') return;
    if (saving) { again = true; return; }
    if (!dirty) return;
    saving = true; dirty = false; ui.sync = 'saving'; paintSync();
    const snap = JSON.parse(JSON.stringify(g.data));
    let lost = false;
    try {
      if (!(await ensureOwner())) lost = true;
      else {
        const saved = await saveScoutData(g.id, { data: snap, summary: summaryOf(snap), status: g.status }, DEV);
        if (saved.lost) lost = true;
        else { g.updated_at = saved.updated_at; ui.sync = 'ok'; }
      }
    } catch (err) {
      // O que não subiu continua por subir: volta a marcar-se e tenta-se outra
      // vez daqui a pouco. O evento `online` não chega sozinho — no pavilhão a
      // rede "existe" e não responde, e o browser nunca dá pela falha.
      dirty = true;
      ui.sync = 'err';
      retryTimer = setTimeout(flush, 15000);
    }
    saving = false;
    if (lost) { dirty = true; lose(await loadScoutStamp(g.id).catch(() => null)); return; }
    paintSync();
    if (again) { again = false; flush(); }
    else if (closing && !dirty && ui.sync === 'ok') releaseScout(g.id, DEV).catch(() => {});
  }

  // --- Dono do jogo e ver ao vivo ---------------------------------------------
  function ensureOwner() {
    if (owner) return Promise.resolve(true);
    if (!claiming) {
      claiming = claimScout(g.id, DEV, myName(), prevWriter)
        .then((r) => {
          claiming = null;
          if (!r) return false;
          owner = true;
          writer = { device: DEV, name: r.writer_name, at: r.writer_at };
          return true;
        })
        .catch((err) => { claiming = null; throw err; });
    }
    return claiming;
  }

  // Outro dispositivo ficou com o jogo: este passa a ver. O que estava por
  // enviar já não pode subir (gravava por cima do que o outro marcou), e a
  // cópia do dispositivo sai também — senão, ao reabrir, ganhava à nuvem.
  function lose(st) {
    if (mode !== 'write') return;
    const hadPending = dirty;
    mode = 'view'; canWrite = false; owner = false; dirty = false;
    clearTimeout(saveTimer); clearTimeout(retryTimer); clearInterval(beatTimer);
    LS.del(backupKey(g.id));
    if (LS.get(ACTIVE_KEY) === g.id) LS.del(ACTIVE_KEY);
    if (st) writer = { device: st.writer_device || null, name: st.writer_name || '', at: st.writer_at || null };
    const who = writer.name || 'Outra pessoa';
    const msg = `${who} passou a marcar este jogo noutro dispositivo.${hadPending ? ' As últimas ações marcadas aqui não chegaram a ser guardadas.' : ''}`;
    if (closed) { toastInfo(msg); return; }
    toastInfo(`${msg} Aqui ficas a ver ao vivo.`);
    lineupDlg?.close();
    ui.sel = null; ui.sync = 'ok';
    startViewing();
    paint();
    refresh();
  }

  // Um jogo que chega de fora (Realtime ou a pergunta periódica).
  function apply(r) {
    if (!r) return;
    writer = { device: r.writer_device || null, name: r.writer_name || '', at: r.writer_at || null };
    if (r.status) g.status = r.status;
    if (r.data && r.updated_at !== g.updated_at) {
      g.data = normalize(r.data, g);
      g.updated_at = r.updated_at;
      ui.sel = null;
      paint();
      lineupDlg?.render();
    } else paintSync();
  }

  async function refresh() {
    if (closed || mode !== 'view') return;
    try {
      const st = await loadScoutStamp(g.id);
      if (!st) { gone(); return; }
      if (st.updated_at !== g.updated_at) {
        const [full] = await loadScoutData(g.id);
        if (full) apply(full); else gone();
      } else apply(st);
      ui.sync = 'ok';
    } catch {
      ui.sync = 'err';
    }
    paintSync();
  }

  function gone() {
    if (closed) return;
    toastInfo('Este jogo foi apagado.');
    LS.del(backupKey(g.id));
    close();
  }

  function onRemote(type, r) {
    if (closed) return;
    if (type === 'DELETE') { gone(); return; }
    if (mode === 'write') {
      if (r?.writer_device && r.writer_device !== DEV) lose(r);
      return;
    }
    // O aviso pode chegar sem as ações (registo grande demais para o Realtime):
    // aí vai-se buscar o jogo inteiro.
    if (r && !r.data && r.updated_at !== g.updated_at) refresh();
    else apply(r);
  }

  // Quem vê: Realtime para o que acontece já, e uma pergunta leve a cada 10 s
  // para quando o Realtime não chega (rede que cai e volta, separador que
  // adormeceu). Só descarrega as ações quando o carimbo mudou.
  function startViewing() {
    clearInterval(pollTimer); clearInterval(tickTimer);
    pollTimer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 10000);
    tickTimer = setInterval(paintSync, 5000); // o "há N s" anda
  }
  // Quem marca: um sinal de vida a cada 20 s mesmo sem toques (intervalo,
  // time-out). Se o servidor disser que o jogo já não é dele, passa a ver.
  function startWriting() {
    clearInterval(pollTimer); clearInterval(tickTimer); clearInterval(beatTimer);
    beatTimer = setInterval(async () => {
      if (mode !== 'write' || saving || !owner || document.visibilityState !== 'visible') return;
      try {
        if (!(await scoutHeartbeat(g.id, DEV))) lose(await loadScoutStamp(g.id).catch(() => null));
      } catch { /* sem rede: a gravação seguinte trata disso */ }
    }, 20000);
  }

  async function takeHere() {
    if (!canEdit('game_scouts') || g.status !== 'em_curso') return;
    const o = otherWriter({ ...g, writer_device: writer.device, writer_name: writer.name, writer_at: writer.at });
    if (o) {
      const choice = await askTakeover(o, { viewLabel: 'Continuar a ver' });
      if (choice !== 'take') return;
    }
    prevWriter = writer.device;
    try {
      // Antes de marcar, o jogo mais recente: quem estava a ver pode ter ficado
      // uns segundos atrás.
      const [full] = await loadScoutData(g.id);
      if (!full) { gone(); return; }
      if (full.writer_device && full.writer_device !== prevWriter && full.writer_device !== DEV) { toastInfo('Entretanto outra pessoa ficou com o jogo.'); apply(full); return; }
      apply(full);
      mode = 'write';
      if (!(await ensureOwner())) { mode = 'view'; toastInfo('Entretanto outra pessoa ficou com o jogo.'); refresh(); return; }
    } catch (err) {
      mode = 'view';
      toastError(`Não foi possível ficar com o jogo: ${dbErrorMessage(err)}`);
      return;
    }
    canWrite = true;
    LS.set(ACTIVE_KEY, g.id);
    startWriting();
    toastOk('Estás a marcar este jogo neste dispositivo.');
    paint();
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
  const onVisible = () => {
    if (document.visibilityState === 'visible') { keepAwake(); if (mode === 'view') refresh(); } else if (dirty) flush();
  };
  // Fechar o separador ou a app: última tentativa (a cópia do dispositivo já está gravada).
  const onPageHide = () => { if (dirty) flush(); };
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisible);
  keepAwake();

  // --- Ações -----------------------------------------------------------------
  const curSet = () => D().sets[D().cur];

  function act(t, q) {
    if (!canWrite) return;
    const set = curSet();
    if (!set.firstServer) { toastInfo('Indica primeiro quem começa a servir.'); return; }
    if (derive(D(), D().cur).lineup.some((x) => !x)) { toastInfo('Completa a formação (6 atletas) antes de marcar.'); openLineup(); return; }
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
    D().sets.push({ lineup: d.lineup.slice(), libero: prev.libero, liberoDef: prev.liberoDef || null, liberoFor: prev.liberoFor.slice(), firstServer: null });
    D().cur = D().sets.length - 1;
    ui.sel = null; touch(); paint(); openLineup();
  }

  function changeSlot(slot, pid) {
    const set = curSet();
    const d = derive(D(), D().cur);
    if (pid && d.lineup.includes(pid) && d.lineup[slot] !== pid) { toastInfo(`${pname(pid)} já está na formação.`); lineupDlg?.render(); return; }
    if (pid && (pid === set.libero || pid === set.liberoDef)) { toastInfo('Uma líbero não entra na formação base: escolhe-a nos campos de líbero.'); lineupDlg?.render(); return; }
    if (!hasPoints(D(), D().cur)) set.lineup[slot] = pid;
    else {
      if (!pid) { lineupDlg?.render(); return; }
      D().events.push({ set: D().cur, t: 'SUB', out: d.lineup[slot], in: pid, ts: Date.now() });
      toastInfo(`Substituição: sai ${pname(d.lineup[slot])}, entra ${pname(pid)}.`);
      if (ui.sel === d.lineup[slot]) ui.sel = null;
    }
    changed();
  }

  // Depois de mudar a formação: grava, redesenha o ecrã de jogo e o modal.
  function changed() {
    touch(); paint(); lineupDlg?.render();
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
    dirty = true;
    LS.set(backupKey(g.id), { at: Date.now(), data: g.data, status: g.status });
    await flush();
    if (mode !== 'write') return; // outro dispositivo ficou com o jogo entretanto
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
    if (closed) return;
    closed = true;
    closing = true;
    lineupDlg?.close();
    unsub?.();
    clearInterval(pollTimer); clearInterval(tickTimer); clearInterval(beatTimer);
    // Sai SEMPRE com tudo enviado (ou a caminho): o que estiver por subir
    // grava-se agora, e se falhar a nova tentativa continua a correr mesmo com
    // o ecrã fechado, enquanto a app estiver aberta. Só depois de subir larga a
    // marcação — largá-la antes deixava outro ficar com um jogo a meio de gravar.
    if (mode === 'write') {
      if (dirty || saving) flush();
      else if (owner) releaseScout(g.id, DEV).catch(() => {});
    }
    window.removeEventListener('online', onOnline);
    window.removeEventListener('pagehide', onPageHide);
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
    if (mode === 'view') {
      const take = canEdit('game_scouts') && g.status === 'em_curso' ? ' <button type="button" class="scout-linkbtn" data-take>Marcar aqui</button>' : '';
      if (g.status === 'terminado') return '<span class="scout-sync">Jogo terminado</span>';
      if (ui.sync === 'err') return `<span class="scout-sync scout-sync--warn">Sem rede: a tentar de novo</span>${take}`;
      const fresh = writer.device && writer.at && Date.now() - Date.parse(writer.at) < STALE_MS;
      if (fresh) return `<span class="scout-sync scout-sync--live">Ao vivo · ${esc(writer.name || 'a marcar')}</span>${take}`;
      if (writer.device) return `<span class="scout-sync scout-sync--warn">Sem sinal de ${esc(writer.name || 'quem marca')} ${esc(ago(writer.at))}</span>${take}`;
      return `<span class="scout-sync">Ninguém a marcar</span>${take}`;
    }
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
    overlay.querySelector('#scout-sync [data-take]')?.addEventListener('click', takeHere);
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
    const subsN = D().events.filter((e) => e.set === si && e.t === 'SUB').length;
    const needsSetup = !set.firstServer || d.lineup.some((x) => !x);

    let banner = '';
    if (needsSetup) {
      banner = `<div class="scout-banner scout-banner--warn o-banner"><span>${d.lineup.some((x) => !x) ? `Define a formação e quem serve no ${si + 1}º set.` : `Quem começa a servir no ${si + 1}º set?`}</span>
        ${canWrite ? '<button class="btn btn--primary btn--sm" type="button" data-lineup>Definir formação</button>' : ''}</div>`;
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

    // Só as colunas escolhidas para este jogo, e só as linhas que ainda têm
    // algum botão (sem Ataque, a linha "/ bloqueado" fica vazia e sai).
    const act = activeCols(D());
    const cols = COLS.filter(([k]) => act.includes(k));
    const has = (k, r) => (k === 'OPPONENT' ? r === 'PERFECT' || r === 'ERROR' : r in ACT[k].q);
    const rows = ROWS.filter((r) => cols.some(([k]) => has(k, r)));
    const head = cols.map(([, l, s]) => `<div class="scout-ch"><span class="scout-ch__l">${l}</span><span class="scout-ch__s">${s}</span></div>`).join('');
    const body = rows.map((r) => cols.map(([k]) => {
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

    return `<div class="scout-grid">
      <div class="scout-col">
        ${banner}
        <section class="card scout-court-card o-court" aria-label="Campo">
          <div class="scout-net"><span>REDE</span></div>
          <div class="scout-court">${order.map((n) => `<div class="scout-spot${[1, 5, 6].includes(n) ? ' scout-spot--back' : ''}">${tile(pos[n - 1], n, n === 1 && d.srv === 'OUR')}</div>`).join('')}</div>
          <div class="scout-status"><span>Rotação <strong>${d.rot + 1}</strong></span><span>Serviço: <strong>${set.firstServer ? (d.srv === 'OUR' ? our : their) : '—'}</strong></span><span class="muted scout-kbd">Teclas 1–6 · Z anula</span></div>
          <button class="btn btn--ghost scout-lineup-btn" type="button" data-lineup>${pts ? 'Formação · substituições' : 'Formação e líberos'}${subsN ? ` <span class="badge badge--info">${subsN} subst.</span>` : ''}</button>
        </section>
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
            <span class="cell-actions">
              ${canWrite && pts && ui.sel && d.lineup.includes(ui.sel) ? `<button class="btn btn--ghost" type="button" data-subout="${esc(ui.sel)}">Substituir</button>` : ''}
              <button class="btn btn--ghost" type="button" data-undo ${canWrite ? '' : 'disabled'}>Anular última</button>
              ${canWrite ? `<button class="btn btn--ghost" type="button" data-cols title="Escolher que ações marcar neste jogo">Ações (${cols.length - 1})</button>` : ''}
            </span>
          </div>
          <div class="scout-agrid" style="grid-template-columns:repeat(${cols.length}, minmax(0, 1fr))">${head}${body}</div>
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
    on('[data-take]', 'click', takeHere);
    on('[data-tab]', 'click', (e) => { ui.tab = e.currentTarget.dataset.tab; paint(); });
    on('[data-pos]', 'click', (e) => selectPos(Number(e.currentTarget.dataset.pos)));
    on('[data-t]', 'click', (e) => act(e.currentTarget.dataset.t, e.currentTarget.dataset.q));
    on('[data-undo]', 'click', undo);
    on('[data-newset]', 'click', newSet);
    on('[data-finish]', 'click', finish);
    on('[data-goset]', 'click', (e) => { D().cur = Number(e.currentTarget.dataset.goset); ui.sel = null; if (canWrite) touch(); paint(); });
    on('[data-lineup]', 'click', () => openLineup());
    on('[data-cols]', 'click', openCols);
    on('[data-subout]', 'click', (e) => openLineup({ out: e.currentTarget.dataset.subout }));
    on('details[data-toggle]', 'toggle', (e) => { ui.logOpen = e.currentTarget.open; });
    on('[data-set]', 'click', (e) => { ui.statSet = e.currentTarget.dataset.set; paint(); });
    on('[data-sheet]', 'click', () => import('../scout-export.js').then((ex) => ex.openGameSheet(g)).catch((err) => toastError(err.message)));
    on('[data-xlsx]', 'click', () => import('../scout-export.js').then((ex) => ex.exportGameXlsx(g)).catch((err) => toastError(err.message)));
    on('[data-copy]', 'click', copySummary);
  }


  // --- Que ações marcar -------------------------------------------------------
  // Escolhe-se por JOGO (`data.cols`) e o jogo seguinte da equipa herda a
  // escolha. Desligar uma ação a meio não apaga o que já se marcou nela: os
  // botões saem, os registos ficam nas estatísticas.
  function colsHTML() {
    const on = activeCols(D());
    const dis = canWrite ? '' : 'disabled';
    return `<fieldset class="scout-cols">
      <legend>Ações a marcar neste jogo</legend>
      <div class="scout-cols__list">
        ${OPTIONAL_COLS.map((k) => `<label class="scout-cols__opt"><input type="checkbox" data-col="${k}" ${on.includes(k) ? 'checked' : ''} ${dis}> ${esc(ACT[k].l)}</label>`).join('')}
        <label class="scout-cols__opt scout-cols__opt--fixed"><input type="checkbox" checked disabled> Adversário <span class="muted">(sempre)</span></label>
      </div>
      <p class="muted scout-footnote">Menos ações, menos botões no ecrã — dá para marcar sozinho no banco. Os próximos jogos desta equipa começam com esta escolha.</p>
    </fieldset>`;
  }
  function wireCols(root, rerender) {
    root.querySelectorAll('[data-col]').forEach((el) => el.addEventListener('change', () => {
      if (!canWrite) return;
      const picked = [...root.querySelectorAll('[data-col]:checked')].map((x) => x.dataset.col);
      if (!picked.length) { toastInfo('Escolhe pelo menos uma ação.'); rerender(); return; }
      D().cols = OPTIONAL_COLS.filter((k) => picked.includes(k));
      touch(); paint(); rerender();
    }));
  }
  function openCols() {
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="sc-cols-title">
        <div class="modal__head">
          <h2 class="section-title" id="sc-cols-title">Ações a marcar</h2>
          <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
        </div>
        <div class="scout-cols-body"></div>
        <div class="modal__actions"><button class="btn btn--primary" type="button" data-done>Feito</button></div>
      </div>`;
    const body = ov.querySelector('.scout-cols-body');
    const render = () => { body.innerHTML = colsHTML().replace('<legend>Ações a marcar neste jogo</legend>', ''); wireCols(body, render); };
    render();
    const closeDlg = wireDialog(ov, { initialFocus: '[data-done]' });
    ov.querySelector('[data-done]').addEventListener('click', closeDlg);
  }

  // --- Formação (modal) -------------------------------------------------------
  // A formação vive num modal e não no ecrã de jogo: acerta-se no aquecimento e
  // entre sets, e durante o rally o ecrã é do campo e das ações. Antes do 1.º
  // ponto do set mudam-se as posições à vontade; depois disso, trocar uma
  // atleta é uma SUBSTITUIÇÃO (sai/entra), que fica na sequência de ações — é
  // assim que os pontos jogados e o "anular" continuam certos.
  let lineupDlg = null;
  let subOut = null; // atleta pré-escolhida para sair (botão "Substituir")

  function lineupHTML() {
    const si = D().cur;
    const set = curSet();
    const d = derive(D(), si);
    const pts = hasPoints(D(), si);
    const our = esc(team ? teamName(team) : 'Nós');
    const their = esc(g.opponent || 'Adversário');
    const roster = D().roster.slice().sort((a, b) => numOf(a) - numOf(b));
    const opts = (selId, allowEmpty, list = roster) => `${allowEmpty ? '<option value="">—</option>' : ''}${list.map((p) => `<option value="${esc(p.id)}" ${p.id === selId ? 'selected' : ''}>${esc(`${p.num} · ${p.name}`)}</option>`).join('')}`;
    const dis = canWrite ? '' : 'disabled';
    const libBox = (pid, slot) => `<input type="checkbox" id="sc-lib-${slot}" data-libfor="${esc(pid || '')}" ${pid && set.liberoFor.includes(pid) ? 'checked' : ''} ${!pid || !(set.libero || set.liberoDef) || !canWrite ? 'disabled' : ''} aria-label="Troca com a líbero">`;

    const rows = d.lineup.map((pid, slot) => pts
      ? `<span class="scout-lineup__p">${slot + 1}</span><span class="scout-lineup__name">${esc(pname(pid))}</span>${libBox(pid, slot)}`
      : `<span class="scout-lineup__p">${slot + 1}</span>
         <select id="sc-slot-${slot}" data-slot="${slot}" aria-label="Posição inicial ${slot + 1}" ${dis}>${opts(pid, true)}</select>${libBox(pid, slot)}`).join('');

    let subs = '';
    if (pts) {
      const onCourt = d.lineup.filter(Boolean).map((id) => findPlayer(D(), id) || { id, num: '', name: pname(id) });
      const bench = roster.filter((p) => !d.lineup.includes(p.id) && p.id !== set.libero && p.id !== set.liberoDef);
      const done = D().events.filter((e) => e.set === si && e.t === 'SUB');
      const outSel = subOut && d.lineup.includes(subOut) ? subOut : '';
      subs = `<section class="scout-subs">
        <h3>Substituição</h3>
        <div class="scout-subs__form">
          <label class="field"><span>Sai</span><select id="sc-sub-out" ${dis}><option value="">—</option>${onCourt.map((p) => `<option value="${esc(p.id)}" ${p.id === outSel ? 'selected' : ''}>${esc(`${p.num} · ${p.name}`)}</option>`).join('')}</select></label>
          <label class="field"><span>Entra</span><select id="sc-sub-in" ${dis}><option value="">—</option>${bench.map((p) => `<option value="${esc(p.id)}">${esc(`${p.num} · ${p.name}`)}</option>`).join('')}</select></label>
          <button class="btn btn--primary" type="button" data-dosub ${dis}>Substituir</button>
        </div>
        <p class="muted scout-footnote">${done.length} de 6 substituições neste set${done.length > 6 ? ' — acima do limite regulamentar' : ''}.${done.length ? ` ${done.map((e) => `${esc(pname(e.out))} → ${esc(pname(e.in))}`).join(' · ')}` : ''} A líbero não conta: troca-se sozinha.</p>
      </section>`;
    }

    return `
      <div class="scout-lineup">
        <span class="scout-lineup__h">Pos.</span><span class="scout-lineup__h">${pts ? 'Em campo (posição de partida)' : 'Atleta'}</span><span class="scout-lineup__h">Líbero</span>
        ${rows}
        <span class="scout-lineup__p" title="Líbero de receção">L</span>
        <label class="scout-lineup__lib"><span class="muted">Líbero de receção${set.liberoDef ? '' : ' (ou única)'}</span>
          <select id="sc-libero" data-libero="libero" ${dis}>${opts(set.libero, true)}</select></label><span></span>
        <span class="scout-lineup__p" title="Líbero de defesa">L2</span>
        <label class="scout-lineup__lib"><span class="muted">Líbero de defesa (opcional)</span>
          <select id="sc-libero-def" data-libero="liberoDef" ${dis}>${opts(set.liberoDef, true)}</select></label><span></span>
      </div>
      ${!pts ? `<div class="cell-actions scout-firstserve"><span class="muted">Começa a servir:</span>
        <span class="cal-toggle"><button class="cal-toggle__btn ${set.firstServer === 'OUR' ? 'cal-toggle__btn--active' : ''}" type="button" data-fs="OUR" aria-pressed="${set.firstServer === 'OUR'}" ${dis}>${our}</button>
        <button class="cal-toggle__btn ${set.firstServer === 'THEIR' ? 'cal-toggle__btn--active' : ''}" type="button" data-fs="THEIR" aria-pressed="${set.firstServer === 'THEIR'}" ${dis}>${their}</button></span></div>` : ''}
      ${subs}
      ${si === 0 && !pts ? colsHTML() : ''}
      <p class="muted scout-footnote">${pts
        ? 'As posições de partida já não mudam: o set começou. Para trocar uma atleta usa a substituição.'
        : 'Posição 1 = zona de serviço. A líbero entra nas zonas 5, 6 e 1 no lugar das atletas marcadas (nunca a servir). Com duas, a de receção joga quando o adversário serve e a de defesa quando servimos nós.'}</p>`;
  }

  function wireLineup(root) {
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    wireCols(root, () => lineupDlg?.render());
    on('[data-fs]', 'click', (e) => {
      if (!canWrite) return;
      if (hasPoints(D(), D().cur)) { toastInfo('Este set já tem pontos.'); return; }
      curSet().firstServer = e.currentTarget.dataset.fs;
      ui.sel = curSet().firstServer === 'OUR' ? court(D(), D().cur).pos[0].pid : null;
      changed();
    });
    on('[data-slot]', 'change', (e) => changeSlot(Number(e.currentTarget.dataset.slot), e.currentTarget.value || null));
    on('[data-libero]', 'change', (e) => {
      const field = e.currentTarget.dataset.libero; // 'libero' (receção) | 'liberoDef' (defesa)
      const other = field === 'libero' ? 'liberoDef' : 'libero';
      const id = e.currentTarget.value || null;
      if (id && derive(D(), D().cur).lineup.includes(id)) { toastInfo('Essa atleta já está na formação.'); lineupDlg?.render(); return; }
      if (id && curSet()[other] === id) { toastInfo('Essa atleta já é a outra líbero.'); lineupDlg?.render(); return; }
      curSet()[field] = id;
      // Só a de defesa, sem a de receção, é a mesma coisa que uma líbero única.
      if (!curSet().libero && curSet().liberoDef) { curSet().libero = curSet().liberoDef; curSet().liberoDef = null; }
      changed();
    });
    on('[data-libfor]', 'change', (e) => {
      const id = e.currentTarget.dataset.libfor;
      if (!id) return;
      const st = curSet();
      st.liberoFor = e.currentTarget.checked ? [...new Set([...st.liberoFor, id])] : st.liberoFor.filter((x) => x !== id);
      changed();
    });
    on('[data-dosub]', 'click', () => {
      const out = root.querySelector('#sc-sub-out')?.value;
      const inn = root.querySelector('#sc-sub-in')?.value;
      if (!out || !inn) { toastInfo('Escolhe quem sai e quem entra.'); return; }
      const slot = derive(D(), D().cur).lineup.indexOf(out);
      if (slot < 0) { toastInfo('Essa atleta já não está em campo.'); lineupDlg?.render(); return; }
      subOut = null;
      changeSlot(slot, inn);
    });
  }

  function openLineup({ out = null } = {}) {
    subOut = out;
    if (lineupDlg) { lineupDlg.render(); return; }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML = `
      <div class="modal card modal--wide scout-lineup-modal" role="dialog" aria-modal="true" aria-labelledby="sc-lu-title">
        <div class="modal__head">
          <h2 class="section-title" id="sc-lu-title"></h2>
          <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
        </div>
        <div class="scout-lineup-body"></div>
        <div class="modal__actions"><button class="btn btn--primary" type="button" data-done>Feito</button></div>
      </div>`;
    const body = ov.querySelector('.scout-lineup-body');
    const render = () => {
      ov.querySelector('#sc-lu-title').textContent = `${hasPoints(D(), D().cur) ? 'Formação e substituições' : 'Formação'} · ${D().cur + 1}º set`;
      body.innerHTML = lineupHTML();
      wireLineup(body);
    };
    render();
    const closeDlg = wireDialog(ov, {
      initialFocus: out ? '#sc-sub-in' : '[data-done]',
      onClose: () => { lineupDlg = null; subOut = null; },
    });
    ov.querySelector('[data-done]').addEventListener('click', closeDlg);
    lineupDlg = { render, close: closeDlg };
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
  try { unsub = subscribeScout(g.id, onRemote); } catch { unsub = null; /* a pergunta periódica chega */ }
  paint();
  if (mode === 'view') { startViewing(); return; }
  {
    const st = curSet();
    if (canWrite && !hasPoints(D(), D().cur) && (!st.firstServer || derive(D(), D().cur).lineup.some((x) => !x))) openLineup();
  }
  startWriting();
  // Fica com o jogo logo ao abrir — é isso que diz aos outros que está a ser
  // marcado. Sem rede tenta-se outra vez na primeira gravação.
  ensureOwner()
    .then(async (ok) => { if (!ok) lose(await loadScoutStamp(g.id).catch(() => null)); })
    .catch(() => { /* sem rede */ });
  if (pendingFromBackup && canWrite) { dirty = true; flush(); }
}
