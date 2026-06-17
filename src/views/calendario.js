// Vista: Calendário. Lista de eventos por ordem cronológica, com filtros
// por tipo e por equipa, distinguindo eventos passados dos futuros.

import { state, createRow, createRows, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { eventDateTime, teamById, teamName } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  DEFAULT_LOCATION,
  WEEKDAYS,
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
      ${editable ? `
        <div class="row" style="gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn--ghost" id="add-recurrent" type="button">↺ Treinos recorrentes</button>
          <button class="btn btn--accent" id="add-event" type="button">+ Evento</button>
        </div>` : ''}
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
  container.querySelector('#add-recurrent')?.addEventListener('click', () => openRecurrentModal());
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

function openRecurrentModal() {
  const today = new Date().toISOString().slice(0, 10);
  const inThreeMonths = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="rec-title" style="width:min(540px,96vw)">
      <div class="modal__head">
        <h2 id="rec-title">Treinos recorrentes</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <div class="field">
        <label>Dias da semana</label>
        <div class="weekday-pills" id="rec-days">
          ${WEEKDAYS.map((d) => `
            <button type="button" class="weekday-pill" data-day="${d.n}" aria-pressed="false">
              ${esc(d.label)}
            </button>`).join('')}
        </div>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="rec-time">Hora</label>
          <input type="time" id="rec-time" value="19:00" />
        </div>
        <div class="field">
          <label for="rec-team">Equipa</label>
          <select id="rec-team">
            <option value="">Sem equipa</option>
            ${state.teams.map((t) => `<option value="${t.id}">${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="rec-start">Data início</label>
          <input type="date" id="rec-start" value="${today}" required />
        </div>
        <div class="field">
          <label for="rec-end">Data fim</label>
          <input type="date" id="rec-end" value="${inThreeMonths}" required />
        </div>
      </div>

      <div class="field">
        <label for="rec-location">Local</label>
        <input type="text" id="rec-location" value="${esc(DEFAULT_LOCATION)}" />
      </div>
      <div class="field">
        <label for="rec-title-field">Título (opcional)</label>
        <input type="text" id="rec-title-field" placeholder="ex.: Treino semanal" />
      </div>

      <p class="rec-preview muted" id="rec-preview" style="font-size:0.85rem;margin:0.2rem 0 0"></p>

      <div id="rec-err" class="modal__error" style="display:none"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="rec-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="rec-confirm" type="button" disabled>Criar treinos</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
  };
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#rec-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const selectedDays = new Set();
  const confirmBtn = overlay.querySelector('#rec-confirm');
  const previewEl = overlay.querySelector('#rec-preview');
  const errEl = overlay.querySelector('#rec-err');

  function updatePreview() {
    const start = overlay.querySelector('#rec-start').value;
    const end = overlay.querySelector('#rec-end').value;
    if (!start || !end || !selectedDays.size) {
      previewEl.textContent = '';
      confirmBtn.disabled = true;
      return;
    }
    const dates = generateDates(start, end, [...selectedDays]);
    previewEl.textContent = dates.length
      ? `${dates.length} treino${dates.length === 1 ? '' : 's'} a criar`
      : 'Nenhum treino nesse período com os dias selecionados.';
    confirmBtn.disabled = dates.length === 0;
  }

  overlay.querySelectorAll('.weekday-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      const day = Number(btn.dataset.day);
      if (selectedDays.has(day)) {
        selectedDays.delete(day);
        btn.classList.remove('weekday-pill--active');
        btn.setAttribute('aria-pressed', 'false');
      } else {
        selectedDays.add(day);
        btn.classList.add('weekday-pill--active');
        btn.setAttribute('aria-pressed', 'true');
      }
      updatePreview();
    });
  });
  overlay.querySelector('#rec-start').addEventListener('input', updatePreview);
  overlay.querySelector('#rec-end').addEventListener('input', updatePreview);

  overlay.querySelector('#rec-confirm').addEventListener('click', async () => {
    const start = overlay.querySelector('#rec-start').value;
    const end = overlay.querySelector('#rec-end').value;
    const time = overlay.querySelector('#rec-time').value || null;
    const teamId = overlay.querySelector('#rec-team').value || null;
    const location = overlay.querySelector('#rec-location').value.trim() || null;
    const title = overlay.querySelector('#rec-title-field').value.trim() || null;

    const dates = generateDates(start, end, [...selectedDays]);
    if (!dates.length) return;

    const rows = dates.map((date) => ({
      type: 'treino',
      date,
      time: time || null,
      team_id: teamId,
      location,
      title,
    }));

    confirmBtn.disabled = true;
    errEl.style.display = 'none';
    try {
      await createRows('events', 'events', rows);
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.style.display = 'block';
      confirmBtn.disabled = false;
    }
  });
}

function generateDates(startStr, endStr, days) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  if (isNaN(start) || isNaN(end) || end < start) return [];
  const daySet = new Set(days);
  const dates = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (daySet.has(cur.getDay())) {
      dates.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}
