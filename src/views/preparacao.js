// Vista: Preparação Física.
//
// Três separadores:
//   • Atletas      — lista de atletas com dados físicos; abre a ficha física.
//   • Periodização — macrociclo (fases), mesociclos, treinos e exercícios de
//                    uma equipa, com presenças (controlo).
//   • Mapa de jogos — carga competitiva mensal (jogos por equipa).

import {
  state,
  createRow,
  updateRow,
  deleteRow,
  upsertGymAttendance,
  dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import {
  teamById,
  teamName,
  escalaoColor,
  bmi,
  playerTests,
  teamPhases,
  teamMesocycles,
  mesocycleSessions,
  teamSessions,
  sessionExercises,
  sessionAttendance,
  gamesInMonth,
  eventTimeRange,
} from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  TRAINING_OBJECTIVES,
  TRAINING_OBJECTIVE_LABEL,
  PHASE_TYPES,
  PHASE_TYPE_LABEL,
  PHASE_TYPE_BADGE,
} from '../constants.js';
import { canEdit } from '../permissions.js';
import { openAthleteProfile } from './athlete-profile.js';

let tab = 'atletas'; // 'atletas' | 'periodizacao' | 'jogos'
let search = '';
let page = 1;
let selectedTeam = '';
let jogosMonth = new Date();
const openMeso = new Set();   // mesociclos expandidos
const openSession = new Set(); // treinos expandidos

const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtShort = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }) : '—';

function ensureTeam() {
  if (!selectedTeam || !state.teams.some((t) => t.id === selectedTeam)) {
    selectedTeam = state.teams[0]?.id || '';
  }
}

export function renderPreparacao(container) {
  ensureTeam();
  const editable = canEdit('physical');

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Preparação Física</h1>
      <div class="cal-toggle" role="group" aria-label="Separador">
        <button class="cal-toggle__btn ${tab === 'atletas' ? 'cal-toggle__btn--active' : ''}" data-tab="atletas" type="button">Atletas</button>
        <button class="cal-toggle__btn ${tab === 'periodizacao' ? 'cal-toggle__btn--active' : ''}" data-tab="periodizacao" type="button">Periodização</button>
        <button class="cal-toggle__btn ${tab === 'jogos' ? 'cal-toggle__btn--active' : ''}" data-tab="jogos" type="button">Mapa de jogos</button>
      </div>
    </header>
    ${tab === 'atletas' ? renderAtletas() : tab === 'periodizacao' ? renderPeriodizacao(editable) : renderJogos()}
  `;

  container.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { tab = b.dataset.tab; renderPreparacao(container); })
  );

  // --- Atletas ---
  const searchEl = container.querySelector('#pf-search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      search = e.target.value;
      page = 1;
      const list = container.querySelector('#pf-list');
      if (list) list.innerHTML = athleteListHTML();
      wireAthletes(container);
    });
  }
  wireAthletes(container);

  // --- Seletor de equipa (periodização + jogos) ---
  container.querySelector('#pf-team')?.addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    renderPreparacao(container);
  });

  // --- Mapa de jogos ---
  container.querySelector('#jogos-prev')?.addEventListener('click', () => { jogosMonth = new Date(jogosMonth.getFullYear(), jogosMonth.getMonth() - 1, 1); renderPreparacao(container); });
  container.querySelector('#jogos-next')?.addEventListener('click', () => { jogosMonth = new Date(jogosMonth.getFullYear(), jogosMonth.getMonth() + 1, 1); renderPreparacao(container); });
  container.querySelector('#jogos-today')?.addEventListener('click', () => { jogosMonth = new Date(); renderPreparacao(container); });

  // --- Periodização (fases, mesociclos, treinos, exercícios, presenças) ---
  container.querySelector('[data-add-phase]')?.addEventListener('click', () => openPhaseForm(container));
  container.querySelectorAll('[data-phase-edit]').forEach((b) =>
    b.addEventListener('click', () => openPhaseForm(container, b.dataset.phaseEdit)));
  container.querySelectorAll('[data-phase-del]').forEach((b) =>
    b.addEventListener('click', () => removeRow('training_phases', 'phases', b.dataset.phaseDel, 'Remover esta fase do macrociclo?')));

  container.querySelector('[data-add-meso]')?.addEventListener('click', () => openMesoForm(container));
  container.querySelectorAll('[data-meso-edit]').forEach((b) =>
    b.addEventListener('click', () => openMesoForm(container, b.dataset.mesoEdit)));
  container.querySelectorAll('[data-meso-del]').forEach((b) =>
    b.addEventListener('click', () => removeRow('mesocycles', 'mesocycles', b.dataset.mesoDel, 'Remover este mesociclo? Os treinos associados ficam sem mesociclo.')));
  container.querySelectorAll('[data-meso-toggle]').forEach((b) =>
    b.addEventListener('click', () => { toggle(openMeso, b.dataset.mesoToggle); renderPreparacao(container); }));

  container.querySelectorAll('[data-add-session]').forEach((b) =>
    b.addEventListener('click', () => openSessionForm(container, { mesocycleId: b.dataset.addSession || null })));
  container.querySelectorAll('[data-session-toggle]').forEach((b) =>
    b.addEventListener('click', () => { toggle(openSession, b.dataset.sessionToggle); renderPreparacao(container); }));
  container.querySelectorAll('[data-session-edit]').forEach((b) =>
    b.addEventListener('click', () => openSessionForm(container, { sessionId: b.dataset.sessionEdit })));
  container.querySelectorAll('[data-session-del]').forEach((b) =>
    b.addEventListener('click', () => removeRow('gym_sessions', 'gymSessions', b.dataset.sessionDel, 'Remover este treino?')));
  container.querySelectorAll('[data-attend]').forEach((b) =>
    b.addEventListener('click', () => openAttendanceModal(b.dataset.attend)));

  container.querySelectorAll('[data-add-ex]').forEach((b) =>
    b.addEventListener('click', () => openExerciseForm(b.dataset.addEx)));
  container.querySelectorAll('[data-ex-edit]').forEach((b) =>
    b.addEventListener('click', () => openExerciseForm(b.dataset.session, b.dataset.exEdit)));
  container.querySelectorAll('[data-ex-del]').forEach((b) =>
    b.addEventListener('click', () => removeRow('gym_exercises', 'gymExercises', b.dataset.exDel, 'Remover este exercício?')));
}

function toggle(set, id) { if (set.has(id)) set.delete(id); else set.add(id); }

function wireAthletes(container) {
  container.querySelectorAll('[data-pf-file]').forEach((b) =>
    b.addEventListener('click', () => openAthleteProfile(b.dataset.pfFile, { tab: 'fisica' }))
  );
  const pg = paginate(filteredAthletes(), page, PAGE_SIZE);
  wirePagination(container, 'pf', pg.page, pg.totalPages, (np) => {
    page = np;
    const list = container.querySelector('#pf-list');
    if (list) list.innerHTML = athleteListHTML();
    wireAthletes(container);
  });
}

// --- Separador Atletas ----------------------------------------------------

function renderAtletas() {
  return `
    <section class="card">
      <div class="filters">
        <div style="flex:1">
          <label for="pf-search">Pesquisar atleta</label>
          <input type="search" id="pf-search" placeholder="Nome do atleta…" value="${esc(search)}" />
        </div>
      </div>
      <div id="pf-list">${athleteListHTML()}</div>
    </section>
  `;
}

function filteredAthletes() {
  const q = search.trim().toLowerCase();
  return state.players
    .filter((p) => !q || (p.name || '').toLowerCase().includes(q))
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function athleteListHTML() {
  const players = filteredAthletes();
  if (!players.length) return emptyHTML('Nenhum atleta encontrado.');
  const pg = paginate(players, page, PAGE_SIZE);

  return `
    <div class="scroll-x"><table class="players-table med-table">
      <thead><tr><th>Atleta</th><th>Equipa</th><th>IMC</th><th>Última avaliação</th><th></th></tr></thead>
      <tbody>
        ${pg.items.map((p) => {
          const team = teamById(p.team_id);
          const imc = bmi(p.id);
          const last = playerTests(p.id)[0];
          return `
            <tr>
              <td><button class="player-link" data-pf-file="${p.id}" type="button">${esc(p.name)}</button></td>
              <td>${team ? `<span class="team-chip" style="--tc:${escalaoColor(team.escalao)}">${esc(teamName(team))}</span>` : '<span class="muted">—</span>'}</td>
              <td>${imc != null ? imc : '<span class="muted">—</span>'}</td>
              <td>${last ? esc(fmtShort(last.date)) : '<span class="muted">—</span>'}</td>
              <td class="cell-actions">
                <button class="btn btn--ghost btn--sm" data-pf-file="${p.id}" type="button">Ficha física</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    ${paginationHTML({ ...pg, id: 'pf' })}
  `;
}

// --- Separador Periodização -----------------------------------------------

function teamSelectorHTML() {
  if (!state.teams.length) return '';
  return `
    <div class="filters">
      <div>
        <label for="pf-team">Equipa</label>
        <select id="pf-team">
          ${state.teams.map((t) => `<option value="${t.id}" ${selectedTeam === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

function renderPeriodizacao(editable) {
  if (!state.teams.length) return emptyHTML('Ainda não há equipas. Cria equipas nos Plantéis.');

  const phases = teamPhases(selectedTeam);
  const mesos = teamMesocycles(selectedTeam);
  const looseSessions = teamSessions(selectedTeam).filter((s) => !s.mesocycle_id);

  return `
    <section class="card">${teamSelectorHTML()}</section>

    <section class="card">
      <div class="cf-section-head">
        <h2 class="section-title" style="margin:0">Macrociclo</h2>
        ${editable ? '<button class="btn btn--ghost btn--sm" data-add-phase type="button">+ Fase</button>' : ''}
      </div>
      ${phases.length
        ? `<div class="phase-track">${phases.map((p) => phaseHTML(p, editable)).join('')}</div>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem fases definidas (Pré-época, paragens, off-season…).</p>'}
    </section>

    <section class="card">
      <div class="cf-section-head">
        <h2 class="section-title" style="margin:0">Mesociclos</h2>
        ${editable ? '<button class="btn btn--accent btn--sm" data-add-meso type="button">+ Mesociclo</button>' : ''}
      </div>
      ${mesos.length
        ? `<div class="cf-episodes">${mesos.map((m) => mesoHTML(m, editable)).join('')}</div>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem mesociclos.</p>'}

      ${looseSessions.length
        ? `<div style="margin-top:1rem">
             <span class="pd-label">Treinos sem mesociclo</span>
             <div class="cf-episodes" style="margin-top:0.4rem">${looseSessions.map((s) => sessionHTML(s, editable)).join('')}</div>
           </div>`
        : ''}
      ${editable ? '<div class="team-card__actions"><button class="btn btn--ghost btn--sm" data-add-session type="button">+ Treino (sem mesociclo)</button></div>' : ''}
    </section>
  `;
}

function phaseHTML(p, editable) {
  const range = [fmtShort(p.start_date), fmtShort(p.end_date)].join(' → ');
  return `
    <div class="phase-chip phase-chip--${PHASE_TYPE_BADGE[p.type] || 'muted'}">
      <div class="phase-chip__main">
        <strong>${esc(p.name)}</strong>
        <span class="badge badge--${PHASE_TYPE_BADGE[p.type] || 'muted'}">${esc(PHASE_TYPE_LABEL[p.type] || p.type)}</span>
      </div>
      <span class="muted phase-chip__range">${esc(range)}</span>
      ${p.notes ? `<span class="muted phase-chip__notes">${esc(p.notes)}</span>` : ''}
      ${editable
        ? `<div class="cell-actions">
             <button class="btn btn--ghost btn--sm" data-phase-edit="${p.id}" type="button">Editar</button>
             <button class="btn btn--danger btn--sm" data-phase-del="${p.id}" type="button">Remover</button>
           </div>`
        : ''}
    </div>`;
}

function mesoHTML(m, editable) {
  const isOpen = openMeso.has(m.id);
  const sessions = mesocycleSessions(m.id);
  const range = [fmtShort(m.start_date), fmtShort(m.end_date)].join(' → ');
  return `
    <article class="cf-episode">
      <div class="cf-episode__head">
        <button class="cf-episode__toggle" data-meso-toggle="${m.id}" type="button" aria-expanded="${isOpen}">
          <span class="cf-episode__chevron">${isOpen ? '▾' : '▸'}</span>
          <span>
            <strong>${esc(m.name)}</strong>
            ${m.objective ? `<span class="badge badge--info" style="margin-left:0.4rem">${esc(TRAINING_OBJECTIVE_LABEL[m.objective] || m.objective)}</span>` : ''}
            <span class="muted cf-episode__sub">${esc(range)} · ${sessions.length} treino${sessions.length === 1 ? '' : 's'}</span>
          </span>
        </button>
        ${editable
          ? `<div class="cell-actions">
               <button class="btn btn--ghost btn--sm" data-meso-edit="${m.id}" type="button">Editar</button>
               <button class="btn btn--danger btn--sm" data-meso-del="${m.id}" type="button">Remover</button>
             </div>`
          : ''}
      </div>
      ${isOpen ? `
        <div class="cf-episode__body">
          ${m.notes ? `<p class="muted" style="margin:0.2rem 0 0.4rem">${esc(m.notes)}</p>` : ''}
          ${sessions.length
            ? `<div class="cf-episodes">${sessions.map((s) => sessionHTML(s, editable)).join('')}</div>`
            : '<p class="muted" style="margin:0.2rem 0">Sem treinos.</p>'}
          ${editable ? `<div class="team-card__actions"><button class="btn btn--ghost btn--sm" data-add-session="${m.id}" type="button">+ Treino</button></div>` : ''}
        </div>` : ''}
    </article>`;
}

function sessionHTML(s, editable) {
  const isOpen = openSession.has(s.id);
  const exercises = sessionExercises(s.id);
  const present = sessionAttendance(s.id).filter((a) => a.present).length;
  return `
    <article class="cf-episode">
      <div class="cf-episode__head">
        <button class="cf-episode__toggle" data-session-toggle="${s.id}" type="button" aria-expanded="${isOpen}">
          <span class="cf-episode__chevron">${isOpen ? '▾' : '▸'}</span>
          <span>
            <strong>${esc(fmtDate(s.date))}</strong>
            ${s.title ? ` · ${esc(s.title)}` : ''}
            ${s.objective ? `<span class="badge badge--info" style="margin-left:0.4rem">${esc(TRAINING_OBJECTIVE_LABEL[s.objective] || s.objective)}</span>` : ''}
            <span class="muted cf-episode__sub">${exercises.length} exercício${exercises.length === 1 ? '' : 's'}${present ? ` · ${present} presente${present === 1 ? '' : 's'}` : ''}${s.duration_min ? ` · ${s.duration_min} min` : ''}</span>
          </span>
        </button>
        ${editable
          ? `<div class="cell-actions">
               <button class="btn btn--ghost btn--sm" data-attend="${s.id}" type="button">Presenças</button>
               <button class="btn btn--ghost btn--sm" data-session-edit="${s.id}" type="button">Editar</button>
               <button class="btn btn--danger btn--sm" data-session-del="${s.id}" type="button">Remover</button>
             </div>`
          : ''}
      </div>
      ${isOpen ? `
        <div class="cf-episode__body">
          ${s.notes ? `<p class="muted" style="margin:0.2rem 0 0.4rem">${esc(s.notes)}</p>` : ''}
          ${exercises.length
            ? `<div class="scroll-x"><table class="players-table">
                 <thead><tr><th>Exercício</th><th>Séries</th><th>Carga</th><th>Reps</th><th>OBS</th>${editable ? '<th></th>' : ''}</tr></thead>
                 <tbody>${exercises.map((e) => exerciseRowHTML(e, s.id, editable)).join('')}</tbody>
               </table></div>`
            : '<p class="muted" style="margin:0.2rem 0">Sem exercícios.</p>'}
          ${editable ? `<div class="team-card__actions"><button class="btn btn--ghost btn--sm" data-add-ex="${s.id}" type="button">+ Exercício</button></div>` : ''}
        </div>` : ''}
    </article>`;
}

function exerciseRowHTML(e, sessionId, editable) {
  return `
    <tr>
      <td>${esc(e.name)}</td>
      <td>${esc(e.sets || '—')}</td>
      <td>${esc(e.load || '—')}</td>
      <td>${esc(e.reps || '—')}</td>
      <td>${e.notes ? esc(e.notes) : '—'}</td>
      ${editable
        ? `<td class="cell-actions">
             <button class="btn btn--ghost btn--sm" data-session="${sessionId}" data-ex-edit="${e.id}" type="button">Editar</button>
             <button class="btn btn--danger btn--sm" data-ex-del="${e.id}" type="button">Remover</button>
           </td>`
        : ''}
    </tr>`;
}

// --- Separador Mapa de jogos ----------------------------------------------

function renderJogos() {
  if (!state.teams.length) return emptyHTML('Ainda não há equipas.');
  const year = jogosMonth.getFullYear();
  const month = jogosMonth.getMonth();
  const monthLabel = jogosMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  return `
    <section class="card">${teamSelectorHTML()}</section>
    <section class="card">
      <div class="grid-nav">
        <button class="btn btn--ghost btn--sm" id="jogos-prev" type="button">‹ Anterior</button>
        <span class="grid-nav__month">${esc(monthLabel)}</span>
        <button class="btn btn--ghost btn--sm" id="jogos-today" type="button">Hoje</button>
        <button class="btn btn--ghost btn--sm" id="jogos-next" type="button">Seguinte ›</button>
      </div>
      ${jogosCardHTML(selectedTeam, year, month)}
    </section>
  `;
}

function jogosCardHTML(teamId, year, month) {
  const games = gamesInMonth(teamId, year, month);
  if (!games.length) return '<p class="muted">Sem jogos neste mês para esta equipa.</p>';
  return `
    <div class="med-stats" style="margin-bottom:0.6rem">
      <span class="badge badge--danger">${games.length} jogo${games.length === 1 ? '' : 's'} no mês</span>
    </div>
    ${games.map((ev) => {
      const dt = new Date(ev.date + 'T00:00:00');
      const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
      const range = eventTimeRange(ev);
      return `
        <div class="event-row">
          <div class="event-row__when">
            <span class="event-row__date">${esc(dateStr)}</span>
            <span class="event-row__time muted">${range ? esc(range) : '—'}</span>
          </div>
          <div class="event-row__main">
            <div class="event-row__title">${ev.opponent ? 'vs ' + esc(ev.opponent) : esc(ev.title || 'Jogo')}</div>
            ${ev.location ? `<span class="event-row__meta">${esc(ev.location)}</span>` : ''}
          </div>
        </div>`;
    }).join('')}
  `;
}

// --- Formulários ----------------------------------------------------------

function openPhaseForm(container, id) {
  const existing = id ? state.phases.find((p) => p.id === id) : null;
  openModal({
    title: existing ? 'Editar fase' : 'Nova fase do macrociclo',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { type: 'pre_epoca' },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'ex.: Pré-época, Fase 2, Paragem de Natal' },
      { name: 'type', label: 'Tipo', type: 'select', options: PHASE_TYPES },
      { name: 'start_date', label: 'Início', type: 'date' },
      { name: 'end_date', label: 'Fim', type: 'date' },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        team_id: selectedTeam,
        name: values.name.trim(),
        type: values.type || 'fase',
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('training_phases', 'phases', id, payload);
        else await createRow('training_phases', 'phases', payload);
      } catch (err) { throw new Error(dbErrorMessage(err)); }
    },
  });
}

function openMesoForm(container, id) {
  const existing = id ? state.mesocycles.find((m) => m.id === id) : null;
  openModal({
    title: existing ? 'Editar mesociclo' : 'Novo mesociclo',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true, placeholder: 'ex.: Setembro — Adaptação' },
      { name: 'objective', label: 'Objetivo', type: 'select', placeholder: '—', options: TRAINING_OBJECTIVES },
      { name: 'start_date', label: 'Início', type: 'date' },
      { name: 'end_date', label: 'Fim', type: 'date' },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        team_id: selectedTeam,
        name: values.name.trim(),
        objective: values.objective || null,
        start_date: values.start_date || null,
        end_date: values.end_date || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('mesocycles', 'mesocycles', id, payload);
        else { const m = await createRow('mesocycles', 'mesocycles', payload); openMeso.add(m.id); }
      } catch (err) { throw new Error(dbErrorMessage(err)); }
    },
  });
}

function openSessionForm(container, { mesocycleId, sessionId } = {}) {
  const existing = sessionId ? state.gymSessions.find((s) => s.id === sessionId) : null;
  const today = new Date().toISOString().slice(0, 10);
  openModal({
    title: existing ? 'Editar treino' : 'Novo treino',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { date: today },
    fields: [
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'title', label: 'Título', placeholder: 'ex.: Força máxima — inferior' },
      { name: 'objective', label: 'Objetivo', type: 'select', placeholder: '—', options: TRAINING_OBJECTIVES },
      { name: 'duration_min', label: 'Duração (min)', type: 'number' },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        team_id: selectedTeam,
        mesocycle_id: existing ? existing.mesocycle_id : (mesocycleId || null),
        date: values.date,
        title: values.title?.trim() || null,
        objective: values.objective || null,
        duration_min: values.duration_min ? Number(values.duration_min) : null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('gym_sessions', 'gymSessions', sessionId, payload);
        else { const s = await createRow('gym_sessions', 'gymSessions', payload); openSession.add(s.id); }
      } catch (err) { throw new Error(dbErrorMessage(err)); }
    },
  });
}

function openExerciseForm(sessionId, exerciseId) {
  const existing = exerciseId ? state.gymExercises.find((e) => e.id === exerciseId) : null;
  openModal({
    title: existing ? 'Editar exercício' : 'Novo exercício',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Exercício', required: true, full: true, placeholder: 'ex.: Agachamento' },
      { name: 'sets', label: 'Séries', placeholder: 'ex.: 4' },
      { name: 'load', label: 'Carga', placeholder: 'ex.: 70 kg ou 70% 1RM' },
      { name: 'reps', label: 'Repetições', placeholder: 'ex.: 8-10' },
      { name: 'notes', label: 'OBS', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const pos = existing ? existing.position : sessionExercises(sessionId).length;
      const payload = {
        session_id: sessionId,
        name: values.name.trim(),
        sets: values.sets?.trim() || null,
        load: values.load?.trim() || null,
        reps: values.reps?.trim() || null,
        notes: values.notes?.trim() || null,
        position: pos,
      };
      try {
        if (existing) await updateRow('gym_exercises', 'gymExercises', exerciseId, payload);
        else await createRow('gym_exercises', 'gymExercises', payload);
      } catch (err) { throw new Error(dbErrorMessage(err)); }
    },
  });
}

async function removeRow(table, collection, id, message) {
  const ok = await confirmDialog(message);
  if (!ok) return;
  try {
    await deleteRow(table, collection, id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// Presenças num treino: lista os atletas da equipa com presença e minutos.
function openAttendanceModal(sessionId) {
  const session = state.gymSessions.find((s) => s.id === sessionId);
  if (!session) return;
  const players = state.players
    .filter((p) => p.team_id === session.team_id)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const byPlayer = {};
  sessionAttendance(sessionId).forEach((a) => { byPlayer[a.player_id] = a; });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="att-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="att-title">Presenças — ${esc(fmtDate(session.date))}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      ${players.length
        ? `<ul class="cf-appt-list">
             ${players.map((p) => {
               const a = byPlayer[p.id];
               return `
                 <li class="cf-appt-row" data-att-player="${p.id}">
                   <label class="coach-check" style="flex:1">
                     <input type="checkbox" class="att-present" ${a ? (a.present ? 'checked' : '') : 'checked'} />
                     <span>${esc(p.name)}</span>
                   </label>
                   <input type="number" min="0" class="pf-min-input att-min" placeholder="min" value="${a?.minutes ?? (session.duration_min ?? '')}" />
                 </li>`;
             }).join('')}
           </ul>`
        : '<p class="muted">Sem atletas nesta equipa.</p>'}
      <div id="att-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="att-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="att-save" type="button">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#att-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#att-save')?.addEventListener('click', async () => {
    const rows = [...overlay.querySelectorAll('[data-att-player]')].map((li) => ({
      playerId: li.dataset.attPlayer,
      present: li.querySelector('.att-present').checked,
      minutes: li.querySelector('.att-min').value ? Number(li.querySelector('.att-min').value) : null,
    }));
    const errEl = overlay.querySelector('#att-err');
    const btn = overlay.querySelector('#att-save');
    btn.disabled = true; btn.textContent = 'A guardar…';
    try {
      for (const r of rows) {
        await upsertGymAttendance(sessionId, r.playerId, { present: r.present, minutes: r.present ? r.minutes : null });
      }
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Guardar';
    }
  });
}
