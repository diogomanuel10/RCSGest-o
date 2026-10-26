// Vista: Jogos — tudo o que acontece à volta de UM jogo, num sítio só.
//
//   • Jogos — a lista dos jogos, cada um com o seu percurso: plano →
//     convocatória → scout → resultado → resumo;
//   • Scout — a época scoutada da equipa (scout.js): totais, folhas, Excel.
//
// Isto vivia no Calendário, como botões na linha de cada jogo. Com o Scout,
// um jogo chegava a ter sete (preparar plano, convocar, scout, registar
// resultado, resumo, editar, remover) ao lado de linhas de treino com um ou
// dois — e o calendário, que serve para ver QUANDO é o quê, passou a ser o
// ecrã onde se trabalhava cada jogo. Os passos são uma ordem, não uma fila
// de botões iguais: por isso aqui cada jogo diz o que já está feito (✓) e
// destaca o passo SEGUINTE, e o Calendário ficou com "Abrir jogo".
//
// A rota antiga (#/scout) continua a funcionar — ver LEGACY_ROUTES no
// app-shell.

import { state, loadScouts, notifyScouts } from '../store.js';
import { esc, emptyHTML, wireEmptyAction } from '../ui.js';
import { toastError } from '../toast.js';
import { canAccess, canEdit, canEditEvent } from '../permissions.js';
import {
  eventDateTime, eventTimeRange, teamById, teamName, escalaoColor, gameResult, gameSetsOf,
  myTeams, isMyEvent,
} from '../compute.js';
import { renderScout, openScoutForEvent } from './scout.js';
import { openSquadModal } from './convocatoria.js';
import { openResultModal } from './resultado.js';
import { findPlanForEvent, openGamePlanForEvent } from './plano-jogo.js';
import { openEventForm } from './calendario.js';

// --- Separadores ------------------------------------------------------------

let jogosTab = 'jogos';

// Permite a outra vista (ou o redireccionamento das rotas antigas) abrir esta
// secção já na área certa.
export function openJogosTab(key) {
  jogosTab = key;
}

// Do Calendário ("Abrir jogo"): a lista abre com aquele jogo à vista.
let focusId = null;
export function openGame(eventId) {
  focusId = eventId;
  jogosTab = 'jogos';
}

const JOGOS_TABS = [
  { key: 'jogos', label: 'Jogos', can: () => canAccess('calendario'), render: renderJogosList },
  { key: 'scout', label: 'Scout', can: () => canAccess('scout'),      render: renderScout },
];

export function renderJogos(container) {
  const tabs = JOGOS_TABS.filter((t) => t.can());
  if (!tabs.length) {
    container.innerHTML = emptyHTML('Não tens acesso a esta área.');
    return;
  }
  if (!tabs.some((t) => t.key === jogosTab)) jogosTab = tabs[0].key;

  container.innerHTML = `
    ${tabs.length > 1 ? `
      <div class="cal-toggle section-tabs" role="tablist" aria-label="Áreas dos jogos">
        ${tabs.map((t) => `
          <button class="cal-toggle__btn ${jogosTab === t.key ? 'cal-toggle__btn--active' : ''}"
                  data-jogos-tab="${t.key}" type="button" role="tab"
                  aria-selected="${jogosTab === t.key}">${esc(t.label)}</button>
        `).join('')}
      </div>` : ''}
    <div id="jogos-body"></div>
  `;

  container.querySelectorAll('[data-jogos-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      jogosTab = b.dataset.jogosTab;
      renderJogos(container);
    })
  );

  const active = tabs.find((t) => t.key === jogosTab) || tabs[0];
  active.render(container.querySelector('#jogos-body'));
}

// --- Lista de jogos ---------------------------------------------------------

let teamFilter = '';
let showAllDone = false;
let scoutsLoading = false;

// Quantos jogos terminados se mostram antes do "Mostrar os restantes": a
// lista cresce a época toda, e o que se procura quase sempre é o último.
const DONE_LIMIT = 10;

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Navega para outra secção reaproveitando o botão da barra lateral.
function navTo(route) {
  const btn = document.querySelector(`[data-route="${route}"]`);
  if (btn) btn.click();
  else location.hash = `#/${route}`;
}

// O estado do scout de cada jogo vem de `state.scouts`, que só carrega quando
// alguém abre o Scout. Sem ele a lista não sabia dizer "scout a decorrer";
// carrega-se aqui em segundo plano (a notificação do store re-desenha).
function ensureScouts() {
  if (!canAccess('scout') || state.scouts !== null || scoutsLoading) return;
  scoutsLoading = true;
  loadScouts()
    .catch(() => { state.scouts = []; notifyScouts(); })
    .finally(() => { scoutsLoading = false; });
}
const scoutOf = (ev) => (state.scouts || []).find((r) => r.event_id === ev.id) || null;

// A convocatória é um diálogo deste ecrã (`convocatoria.js`), e já não vive
// nas Presenças: basta poder convocar.
const canSquad = (ev) => canEdit('squads') && !!ev.team_id;
const canResult = (ev) => canEdit('squads') && !!ev.team_id && eventDateTime(ev) <= new Date();
// Scout ao vivo: no DIA do jogo e não só depois da hora marcada (é durante o
// aquecimento que se acerta a formação), e só nas equipas de quem marca — o
// RLS recusaria a gravação de um jogo de outra equipa.
const canScout = (ev) => canEdit('game_scouts') && state.scoutsReady && !!ev.team_id
  && isMyEvent(ev) && ev.date <= todayISO();

function nConvocados(ev) {
  const squad = state.squads.find((s) => s.event_id === ev.id);
  return squad ? state.squadPlayers.filter((sp) => sp.squad_id === squad.id).length : 0;
}

// Os passos de um jogo, pela ordem em que se fazem. Cada um diz se já está
// feito; o que falta fazer só aparece enquanto ainda faz sentido — um plano ou
// uma convocatória depois do jogo já não são nem uma coisa nem outra.
function gameSteps(ev) {
  const today = todayISO();
  const past = ev.date < today;
  const res = gameResult(ev.id);
  const steps = [];

  if (canAccess('plano-jogo') && ev.team_id) {
    const done = !!findPlanForEvent(ev);
    if (done || !past) steps.push({ key: 'plan', done, label: done ? 'Plano' : 'Preparar plano' });
  }
  if (canSquad(ev)) {
    const n = nConvocados(ev);
    if (n || !past) steps.push({ key: 'squad', done: n > 0, label: n ? `Convocatória · ${n}` : 'Convocar' });
  }
  const sc = canAccess('scout') ? scoutOf(ev) : null;
  if (sc) {
    const live = sc.status === 'em_curso';
    steps.push({ key: 'scout', done: !live, live, label: live ? 'Scout a decorrer' : 'Scout' });
  } else if (canScout(ev) && !res) {
    steps.push({ key: 'scout', done: false, label: 'Fazer scout' });
  }
  if (canResult(ev)) {
    steps.push({ key: 'result', done: !!res, label: res ? 'Resultado' : 'Registar resultado' });
  }
  if (res) steps.push({ key: 'report', done: true, label: 'Resumo', plain: true });
  return steps;
}

function stepsHTML(ev) {
  const steps = gameSteps(ev);
  // O passo seguinte é o primeiro por fazer — ou o scout que está a decorrer,
  // que é para onde se volta.
  const next = steps.find((s) => s.live) || steps.find((s) => !s.done);
  return steps.map((s) => {
    const cls = s === next ? 'btn--accent' : 'btn--ghost';
    const mark = s.done && !s.plain ? '<span class="game-step__ok" aria-hidden="true">✓</span>' : '';
    return `<button class="btn ${cls} btn--sm game-step${s.done && !s.plain ? ' game-step--done' : ''}" type="button"
      data-step="${s.key}" data-id="${esc(ev.id)}"${s.done && !s.plain ? ' title="Feito"' : ''}>${mark}${esc(s.label)}</button>`;
  }).join('');
}

function scoreHTML(ev) {
  const r = gameResult(ev.id);
  if (!r) return '';
  const tone = r.sets_for > r.sets_against ? 'ok' : r.sets_for === r.sets_against ? 'muted' : 'danger';
  const parciais = gameSetsOf(ev.id).map((s) => `${s.points_for}-${s.points_against}`).join(' · ');
  return `<div class="game-card__score">
    <strong class="badge badge--${tone}">${r.sets_for}–${r.sets_against}</strong>
    ${parciais ? `<span class="muted">${esc(parciais)}</span>` : ''}
  </div>`;
}

function gameCard(ev, { past = false, focus = false } = {}) {
  const team = teamById(ev.team_id);
  const color = team ? escalaoColor(team.escalao) : 'var(--border)';
  const dt = eventDateTime(ev);
  const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const meta = [ev.title && ev.title !== 'Jogo' ? ev.title : '', ev.location].filter(Boolean).join(' · ');
  return `
    <article class="game-card${past ? ' game-card--past' : ''}${focus ? ' game-card--focus' : ''}" id="game-${esc(ev.id)}"
             style="--game-color:${color}">
      <div class="game-card__when">
        <span class="game-card__date">${esc(dateStr)}</span>
        <span class="muted">${esc(eventTimeRange(ev) || '—')}</span>
      </div>
      <div class="game-card__main">
        <div class="game-card__title">${esc(team ? teamName(team) : (ev.title || 'Jogo'))}
          <span class="game-card__vs">vs</span> ${esc(ev.opponent || 'adversário por definir')}</div>
        ${meta ? `<span class="game-card__meta">${esc(meta)}</span>` : ''}
      </div>
      ${scoreHTML(ev)}
      <div class="game-steps">
        ${stepsHTML(ev)}
        ${canEditEvent(ev) ? `<button class="btn btn--ghost btn--sm game-steps__edit" type="button" data-edit-game="${esc(ev.id)}">Editar</button>` : ''}
      </div>
    </article>`;
}

function renderJogosList(container) {
  ensureScouts();
  const teams = myTeams();
  if (teamFilter && !teams.some((t) => t.id === teamFilter)) teamFilter = '';
  const mine = new Set(teams.map((t) => t.id));
  const all = state.events.filter((e) => e.type === 'jogo' && (!e.team_id || mine.has(e.team_id)));

  // O jogo pedido do Calendário tem de estar à vista: um filtro de equipa ou
  // o corte dos terminados não o podem esconder.
  const focus = focusId ? all.find((e) => e.id === focusId) : null;
  focusId = null;
  if (focus && teamFilter && focus.team_id !== teamFilter) teamFilter = '';

  const games = all.filter((e) => !teamFilter || e.team_id === teamFilter);
  const today = todayISO();
  const asc = (a, b) => eventDateTime(a) - eventDateTime(b);
  const desc = (a, b) => eventDateTime(b) - eventDateTime(a);
  const hoje = games.filter((e) => e.date === today).sort(asc);
  const proximos = games.filter((e) => e.date > today).sort(asc);
  const passados = games.filter((e) => e.date < today);
  // Um jogo que passou sem resultado é trabalho por fazer, e não histórico:
  // fica à frente dos próximos, onde se vê.
  const porFechar = passados.filter((e) => e.team_id && !gameResult(e.id)).sort(desc);
  const terminados = passados.filter((e) => !porFechar.includes(e)).sort(desc);
  if (focus && terminados.indexOf(focus) >= DONE_LIMIT) showAllDone = true;
  const doneShown = showAllDone ? terminados : terminados.slice(0, DONE_LIMIT);

  const results = terminados.map((e) => gameResult(e.id)).filter(Boolean);
  const v = results.filter((r) => r.sets_for > r.sets_against).length;
  const d = results.filter((r) => r.sets_for < r.sets_against).length;

  const card = (e, past) => gameCard(e, { past, focus: focus && e.id === focus.id });
  const group = (title, list, past = false, extra = '') => (list.length
    ? `<h3 class="cal-group${past ? ' cal-group--past' : ''}">${esc(title)} <span class="muted">${list.length}</span></h3>
       <div class="game-list">${list.map((e) => card(e, past)).join('')}</div>${extra}`
    : '');

  const editable = canEdit('events');
  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Jogos</h1>
      ${editable ? '<button class="btn btn--accent" id="game-new" type="button">+ Jogo</button>' : ''}
    </header>

    <div class="filter-bar">
      ${teams.length > 1 ? `
        <div class="field">
          <label for="jogos-team">Equipa</label>
          <select id="jogos-team">
            <option value="">Todas</option>
            ${teams.map((t) => `<option value="${esc(t.id)}" ${t.id === teamFilter ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>` : ''}
      <div class="scout-chips" style="align-self:flex-end">
        <span class="badge badge--info">${games.length} jogo${games.length === 1 ? '' : 's'}</span>
        ${results.length ? `<span class="badge badge--ok">${v} V</span><span class="badge badge--danger">${d} D</span>` : ''}
      </div>
    </div>

    ${games.length ? `
      <section class="card">
        ${group('Hoje', hoje)}
        ${group('Por fechar', porFechar)}
        ${group('Próximos', proximos)}
        ${group('Terminados', doneShown, true, terminados.length > doneShown.length
          ? `<button class="btn btn--ghost btn--sm" id="jogos-more" type="button" style="margin-top:0.6rem">Mostrar os restantes ${terminados.length - doneShown.length}</button>`
          : '')}
      </section>`
      : all.length
        ? emptyHTML('Sem jogos nesta equipa.', { icone: '🔍' })
        : emptyHTML('Ainda não há jogos marcados. Cada jogo do calendário aparece aqui, com o plano, a convocatória, o scout e o resultado.', {
          icone: '🏐', action: editable ? { key: 'game-new', label: '+ Marcar o primeiro jogo' } : null,
        })}
  `;

  const newGame = () => openEventForm(null, { type: 'jogo' });
  container.querySelector('#game-new')?.addEventListener('click', newGame);
  wireEmptyAction(container, 'game-new', newGame);
  container.querySelector('#jogos-team')?.addEventListener('change', (e) => {
    teamFilter = e.target.value; showAllDone = false; renderJogosList(container);
  });
  container.querySelector('#jogos-more')?.addEventListener('click', () => { showAllDone = true; renderJogosList(container); });
  container.querySelectorAll('[data-edit-game]').forEach((b) =>
    b.addEventListener('click', () => openEventForm(b.dataset.editGame)));
  container.querySelectorAll('[data-step]').forEach((b) =>
    b.addEventListener('click', () => runStep(b.dataset.step, b.dataset.id)));

  if (focus) container.querySelector(`#game-${CSS.escape(focus.id)}`)?.scrollIntoView({ block: 'center' });
}

async function runStep(step, eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return;
  if (step === 'plan') { openGamePlanForEvent(ev); navTo('plano-jogo'); return; }
  if (step === 'squad') { openSquadModal(ev.id); return; }
  if (step === 'scout') { openScoutForEvent(ev.id); return; }
  if (step === 'result') { openResultModal(ev.id); return; }
  if (step === 'report') {
    // Resumo pós-jogo: folha imprimível (chunk à parte, só quando se pede).
    try {
      const { openGameReport } = await import('../game-report.js');
      openGameReport(ev.id);
    } catch (err) {
      toastError(err.message || 'Não foi possível gerar o resumo.');
    }
  }
}
