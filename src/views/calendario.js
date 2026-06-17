// Vista: Calendário. Lista de eventos por ordem cronológica, com filtros
// por tipo e por equipa, distinguindo eventos passados dos futuros.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { eventDateTime, teamById, teamName } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  DEFAULT_LOCATION,
} from '../constants.js';
import { canEdit } from '../permissions.js';

const filters = { type: '', team: '' };

export function renderCalendario(container) {
  const editable = canEdit('events');
  const now = new Date();

  const events = state.events
    .filter(
      (e) =>
        (!filters.type || e.type === filters.type) &&
        (!filters.team || e.team_id === filters.team)
    )
    .sort((a, b) => eventDateTime(a) - eventDateTime(b));

  const future = events.filter((e) => eventDateTime(e) >= now);
  const past = events.filter((e) => eventDateTime(e) < now);

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Calendário</h1>
      ${editable ? '<button class="btn btn--accent" id="add-event" type="button">+ Evento</button>' : ''}
    </header>

    <section class="card">
      <div class="filters">
        <div>
          <label for="f-type">Tipo</label>
          <select id="f-type">
            <option value="">Todos</option>
            ${EVENT_TYPES.map(
              (t) => `<option value="${t.key}" ${filters.type === t.key ? 'selected' : ''}>${esc(
                t.label
              )}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label for="f-team">Equipa</label>
          <select id="f-team">
            <option value="">Todas</option>
            ${state.teams
              .map(
                (t) => `<option value="${t.id}" ${filters.team === t.id ? 'selected' : ''}>${esc(
                  teamName(t)
                )}</option>`
              )
              .join('')}
          </select>
        </div>
        <span class="filters__count muted">${events.length} evento${
    events.length === 1 ? '' : 's'
  }</span>
      </div>

      ${
        events.length
          ? `
        ${future.length ? `<h3 class="cal-group">Próximos</h3>${future.map((e) => eventRow(e, false, editable)).join('')}` : ''}
        ${past.length ? `<h3 class="cal-group cal-group--past">Passados</h3>${past.map((e) => eventRow(e, true, editable)).join('')}` : ''}
      `
          : emptyHTML('Sem eventos para os filtros escolhidos.')
      }
    </section>
  `;

  container.querySelector('#add-event')?.addEventListener('click', () => openForm());
  container.querySelector('#f-type').addEventListener('change', (e) => {
    filters.type = e.target.value;
    renderCalendario(container);
  });
  container.querySelector('#f-team').addEventListener('change', (e) => {
    filters.team = e.target.value;
    renderCalendario(container);
  });
  container.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.edit))
  );
  container.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.del))
  );
}

function eventRow(ev, isPast, editable) {
  const dt = eventDateTime(ev);
  const team = teamById(ev.team_id);
  const dateStr = dt.toLocaleDateString('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  const meta = [
    team ? teamName(team) : '',
    ev.opponent ? `vs ${esc(ev.opponent)}` : '',
    ev.location ? esc(ev.location) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <div class="event-row ${isPast ? 'event-row--past' : ''}">
      <div class="event-row__when">
        <span class="event-row__date">${dateStr}</span>
        <span class="event-row__time muted">${ev.time ? esc(ev.time) : '—'}</span>
      </div>
      <div class="event-row__main">
        <div class="event-row__title">
          <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}" style="margin-right:0.4rem">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}
        </div>
        ${meta ? `<span class="event-row__meta">${meta}</span>` : ''}
      </div>
      ${
        editable
          ? `<div class="cell-actions">
        <button class="btn btn--ghost btn--sm" data-edit="${ev.id}" type="button">Editar</button>
        <button class="btn btn--danger btn--sm" data-del="${ev.id}" type="button">Remover</button>
      </div>`
          : ''
      }
    </div>
  `;
}

function openForm(id) {
  const existing = id ? state.events.find((e) => e.id === id) : null;
  openModal({
    title: existing ? 'Editar evento' : 'Novo evento',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { type: 'jogo', location: DEFAULT_LOCATION },
    fields: [
      { name: 'type', label: 'Tipo', type: 'select', required: true, options: EVENT_TYPES },
      { name: 'title', label: 'Título', placeholder: 'ex.: Jornada 3' },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'time', label: 'Hora', type: 'time' },
      {
        name: 'team_id',
        label: 'Equipa',
        type: 'select',
        placeholder: 'Sem equipa',
        options: state.teams.map((t) => ({ key: t.id, label: teamName(t) })),
      },
      { name: 'opponent', label: 'Adversário (só jogos)', placeholder: 'Nome do adversário' },
      { name: 'location', label: 'Local', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        type: values.type,
        title: values.title?.trim() || null,
        date: values.date,
        time: values.time || null,
        team_id: values.team_id || null,
        opponent: values.type === 'jogo' ? values.opponent?.trim() || null : null,
        location: values.location?.trim() || null,
      };
      try {
        if (existing) await updateRow('events', 'events', id, payload);
        else await createRow('events', 'events', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function remove(id) {
  const ev = state.events.find((x) => x.id === id);
  const ok = await confirmDialog(`Remover o evento "${ev?.title || EVENT_TYPE_LABEL[ev?.type]}"?`);
  if (!ok) return;
  try {
    await deleteRow('events', 'events', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
