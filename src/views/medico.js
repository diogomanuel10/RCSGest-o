// Vista: Departamento Médico / Fisioterapia.
//
// Dois separadores:
//   • Atletas — lista de todos os atletas do clube (pesquisável), com o estado
//     clínico atual; abrir a ficha clínica de cada um.
//   • Agenda  — atendimentos de fisioterapia marcados, cruzados com o
//     calendário de treinos para evitar conflitos.

import { state } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import {
  teamById,
  teamName,
  activeEpisode,
  injuredCount,
  apptDateTime,
  upcomingTrainings,
} from '../compute.js';
import {
  EPISODE_STATUS_LABEL,
  EPISODE_STATUS_BADGE,
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_BADGE,
  APPOINTMENT_STATUS_LABEL,
  APPOINTMENT_STATUS_BADGE,
  EVENT_TYPE_LABEL,
} from '../constants.js';
import { canEdit } from '../permissions.js';
import { openModal } from '../modal.js';
import { openAppointmentForm } from './clinical-file.js';
import { openAthleteProfile } from './athlete-profile.js';

let tab = 'atletas'; // 'atletas' | 'agenda'
let search = '';
let page = 1;

export function renderMedico(container) {
  const editable = canEdit('clinical');
  const injured = injuredCount();

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Departamento Médico</h1>
      <div class="cal-toggle" role="group" aria-label="Separador">
        <button class="cal-toggle__btn ${tab === 'atletas' ? 'cal-toggle__btn--active' : ''}" data-tab="atletas" type="button">Atletas</button>
        <button class="cal-toggle__btn ${tab === 'agenda' ? 'cal-toggle__btn--active' : ''}" data-tab="agenda" type="button">Agenda</button>
      </div>
    </header>

    <div class="med-stats">
      <span class="badge badge--muted">${state.players.length} atleta${state.players.length === 1 ? '' : 's'}</span>
      <span class="badge badge--${injured ? 'danger' : 'ok'}">${injured} em tratamento</span>
    </div>

    ${tab === 'atletas' ? renderAtletas(editable) : renderAgenda(editable)}
  `;

  container.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { tab = b.dataset.tab; renderMedico(container); })
  );

  const searchEl = container.querySelector('#med-search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      search = e.target.value;
      page = 1;
      // Re-desenha só a lista, mantendo o foco no campo de pesquisa.
      const list = container.querySelector('#med-list');
      if (list) list.innerHTML = athleteListHTML();
      wireAthleteButtons(container);
    });
  }

  container.querySelector('#med-add-appt')?.addEventListener('click', () => pickAthleteThenAppt(container));
  wireAthleteButtons(container);
  container.querySelectorAll('[data-appt-file]').forEach((b) =>
    b.addEventListener('click', () => openAthleteProfile(b.dataset.apptFile, { tab: 'fisioterapia' }))
  );
}

function wireAthleteButtons(container) {
  container.querySelectorAll('[data-file]').forEach((b) =>
    b.addEventListener('click', () => openAthleteProfile(b.dataset.file, { tab: 'fisioterapia' }))
  );
  const pg = paginate(filteredAthletes(), page, PAGE_SIZE);
  wirePagination(container, 'med', pg.page, pg.totalPages, (np) => {
    page = np;
    const list = container.querySelector('#med-list');
    if (list) list.innerHTML = athleteListHTML();
    wireAthleteButtons(container);
  });
}

// --- Separador Atletas ----------------------------------------------------

function renderAtletas(editable) {
  return `
    <section class="card">
      <div class="filters">
        <div style="flex:1">
          <label for="med-search">Pesquisar atleta</label>
          <input type="search" id="med-search" placeholder="Nome do atleta…" value="${esc(search)}" />
        </div>
      </div>
      <div id="med-list">${athleteListHTML()}</div>
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
    <div class="table-scroll">
    <table class="players-table med-table">
      <thead><tr><th>Atleta</th><th>Equipa</th><th>Estado clínico</th><th></th></tr></thead>
      <tbody>
        ${pg.items.map((p) => {
          const team = teamById(p.team_id);
          const active = activeEpisode(p.id);
          const statusBadge = active
            ? `<span class="badge badge--${EPISODE_STATUS_BADGE[active.status]}">${esc(EPISODE_STATUS_LABEL[active.status])}</span>`
            : '<span class="badge badge--ok">Apto</span>';
          return `
            <tr>
              <td><button class="player-link" data-file="${p.id}" type="button">${esc(p.name)}</button></td>
              <td>${team ? esc(teamName(team)) : '<span class="muted">—</span>'}</td>
              <td>${statusBadge}${active && active.title ? ` <span class="muted">${esc(active.title)}</span>` : ''}</td>
              <td class="cell-actions">
                <button class="btn btn--ghost btn--sm" data-file="${p.id}" type="button">Ficha clínica</button>
              </td>
            </tr>`;
        }).join('')}
      </tbody>
    </table>
    </div>
    ${paginationHTML({ ...pg, id: 'med' })}
  `;
}

// --- Separador Agenda -----------------------------------------------------

function renderAgenda(editable) {
  const now = new Date();
  const appts = state.appointments
    .slice()
    .sort((a, b) => apptDateTime(a) - apptDateTime(b));
  const future = appts.filter((a) => apptDateTime(a) >= now && a.status === 'agendado');
  const rest = appts.filter((a) => !(apptDateTime(a) >= now && a.status === 'agendado'))
    .sort((a, b) => apptDateTime(b) - apptDateTime(a));

  const trainings = upcomingTrainings(6);

  return `
    <div class="med-agenda">
      <section class="card">
        <div class="cf-section-head">
          <h2 class="section-title" style="margin:0">Atendimentos</h2>
          ${editable ? '<button class="btn btn--accent btn--sm" id="med-add-appt" type="button">+ Atendimento</button>' : ''}
        </div>
        ${future.length
          ? `<h3 class="cal-group">Próximos</h3>${future.map(apptRowHTML).join('')}`
          : '<p class="muted">Sem atendimentos agendados.</p>'}
        ${rest.length
          ? `<h3 class="cal-group cal-group--past">Anteriores / outros</h3>${rest.slice(0, 20).map(apptRowHTML).join('')}`
          : ''}
      </section>

      <section class="card">
        <h2 class="section-title" style="margin-top:0">Próximos treinos</h2>
        <p class="muted" style="margin-top:0">Para cruzar com os atendimentos e evitar conflitos.</p>
        ${trainings.length
          ? trainings.map(trainingRowHTML).join('')
          : '<p class="muted">Sem treinos agendados.</p>'}
      </section>
    </div>
  `;
}

function apptRowHTML(a) {
  const player = state.players.find((p) => p.id === a.player_id);
  const team = player ? teamById(player.team_id) : null;
  const dt = apptDateTime(a);
  const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  return `
    <div class="event-row">
      <div class="event-row__when">
        <span class="event-row__date">${esc(dateStr)}</span>
        <span class="event-row__time muted">${a.time ? esc(a.time.slice(0, 5)) : '—'}</span>
      </div>
      <div class="event-row__main">
        <div class="event-row__title">
          <span class="badge badge--${APPOINTMENT_TYPE_BADGE[a.type] || 'muted'}" style="margin-right:0.4rem">${esc(APPOINTMENT_TYPE_LABEL[a.type] || a.type)}</span>
          <button class="player-link" data-appt-file="${a.player_id}" type="button">${esc(player?.name || 'Atleta')}</button>
          <span class="badge badge--${APPOINTMENT_STATUS_BADGE[a.status] || 'muted'}" style="margin-left:0.4rem">${esc(APPOINTMENT_STATUS_LABEL[a.status] || a.status)}</span>
        </div>
        <span class="event-row__meta">${team ? esc(teamName(team)) : ''}${a.location ? ' · ' + esc(a.location) : ''}</span>
      </div>
    </div>
  `;
}

function trainingRowHTML(ev) {
  const team = teamById(ev.team_id);
  const dt = apptDateTime(ev);
  const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  return `
    <div class="event-row event-row--past">
      <div class="event-row__when">
        <span class="event-row__date">${esc(dateStr)}</span>
        <span class="event-row__time muted">${ev.time ? esc(ev.time.slice(0, 5)) : '—'}</span>
      </div>
      <div class="event-row__main">
        <div class="event-row__title">${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Treino')}</div>
        <span class="event-row__meta">${team ? esc(teamName(team)) : ''}${ev.location ? ' · ' + esc(ev.location) : ''}</span>
      </div>
    </div>
  `;
}

// Escolher o atleta antes de marcar um atendimento a partir da agenda.
function pickAthleteThenAppt(container) {
  const players = state.players
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (!players.length) {
    alert('Ainda não há atletas registados.');
    return;
  }
  openModal({
    title: 'Marcar atendimento',
    submitLabel: 'Continuar',
    fields: [
      {
        name: 'player_id',
        label: 'Atleta',
        type: 'select',
        required: true,
        placeholder: 'Escolhe o atleta…',
        full: true,
        options: players.map((p) => {
          const t = teamById(p.team_id);
          return { key: p.id, label: `${p.name}${t ? ' — ' + teamName(t) : ''}` };
        }),
      },
    ],
    onSubmit: async (values) => {
      if (!values.player_id) throw new Error('Escolhe o atleta.');
      // Abre o formulário de atendimento após fechar este seletor.
      setTimeout(() => openAppointmentForm({ playerId: values.player_id }), 0);
    },
  });
}
