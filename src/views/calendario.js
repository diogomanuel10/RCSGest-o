// Vista: Calendário. Lista de eventos por ordem cronológica, com filtros
// por tipo e por equipa, distinguindo eventos passados dos futuros.

import { state, createRow, createRows, updateRow, archiveRow, dbErrorMessage } from '../store.js';
import { openSquadModal } from './convocatorias.js';
import { esc, emptyHTML, teamHue } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  DEFAULT_LOCATION,
  WEEKDAYS,
} from '../constants.js';
import { canEdit, canAccess } from '../permissions.js';

const filters = { type: '', team: '' };
let calView = 'lista'; // 'lista' | 'grelha'
let gridMonth = new Date(); // mês exibido na grelha

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
      <div class="row" style="gap:0.5rem;flex-wrap:wrap">
        <div class="cal-toggle" role="group" aria-label="Vista">
          <button class="cal-toggle__btn ${calView === 'lista' ? 'cal-toggle__btn--active' : ''}" id="view-lista" type="button">☰ Lista</button>
          <button class="cal-toggle__btn ${calView === 'grelha' ? 'cal-toggle__btn--active' : ''}" id="view-grelha" type="button">▦ Grelha</button>
        </div>
        ${editable ? `
          <button class="btn btn--ghost" id="add-recurrent" type="button">↺ Recorrentes</button>
          <button class="btn btn--accent" id="add-event" type="button">+ Evento</button>
        ` : ''}
      </div>
    </header>

    ${calView === 'grelha' ? renderGrid(events, editable) : renderLista(events, future, past, editable)}
  `;

  container.querySelector('#add-event')?.addEventListener('click', () => openForm());
  container.querySelector('#add-recurrent')?.addEventListener('click', () => openRecurrentModal());
  container.querySelector('#view-lista').addEventListener('click', () => { calView = 'lista'; renderCalendario(container); });
  container.querySelector('#view-grelha').addEventListener('click', () => { calView = 'grelha'; renderCalendario(container); });
  container.querySelector('#f-type')?.addEventListener('change', (e) => { filters.type = e.target.value; renderCalendario(container); });
  container.querySelector('#f-team')?.addEventListener('change', (e) => { filters.team = e.target.value; renderCalendario(container); });
  container.querySelector('#grid-prev')?.addEventListener('click', () => { gridMonth = new Date(gridMonth.getFullYear(), gridMonth.getMonth() - 1, 1); renderCalendario(container); });
  container.querySelector('#grid-next')?.addEventListener('click', () => { gridMonth = new Date(gridMonth.getFullYear(), gridMonth.getMonth() + 1, 1); renderCalendario(container); });
  container.querySelector('#grid-today')?.addEventListener('click', () => { gridMonth = new Date(); renderCalendario(container); });
  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.edit)));
  container.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => remove(b.dataset.del)));
  container.querySelectorAll('[data-squad]').forEach((b) => b.addEventListener('click', () => openSquadModal(b.dataset.squad)));
  container.querySelectorAll('[data-new-day]').forEach((b) => b.addEventListener('click', () => openForm(null, b.dataset.newDay)));
}

function renderLista(events, future, past, editable) {
  return `
    <section class="card">
      <div class="filters">
        <div>
          <label for="f-type">Tipo</label>
          <select id="f-type">
            <option value="">Todos</option>
            ${EVENT_TYPES.map((t) => `<option value="${t.key}" ${filters.type === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="f-team">Equipa</label>
          <select id="f-team">
            <option value="">Todas</option>
            ${state.teams.map((t) => `<option value="${t.id}" ${filters.team === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <span class="filters__count muted">${events.length} evento${events.length === 1 ? '' : 's'}</span>
      </div>
      ${events.length
        ? `${future.length ? `<h3 class="cal-group">Próximos</h3>${future.map((e) => eventRow(e, false, editable)).join('')}` : ''}
           ${past.length ? `<h3 class="cal-group cal-group--past">Passados</h3>${past.map((e) => eventRow(e, true, editable)).join('')}` : ''}`
        : emptyHTML('Sem eventos para os filtros escolhidos.')}
    </section>
  `;
}

function renderGrid(allEvents, editable) {
  const year = gridMonth.getFullYear();
  const month = gridMonth.getMonth(); // 0-indexed
  const today = new Date();
  const todayStr = toLocalISO(today);

  const monthLabel = gridMonth.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });

  // Days of the week header (Mon–Sun, 1-7, JS: 0=Sun)
  const DAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  // First day of month and total days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Offset: Monday-based (Mon=0 … Sun=6)
  const startOffset = (firstDay.getDay() + 6) % 7;

  // Build events map by date string
  const evMap = {};
  allEvents.forEach((ev) => {
    const d = ev.date;
    if (!evMap[d]) evMap[d] = [];
    evMap[d].push(ev);
  });

  // Build cell array
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, dateStr, events: evMap[dateStr] || [] });
  }
  // pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return `
    <div class="grid-nav">
      <button class="btn btn--ghost btn--sm" id="grid-prev" type="button">‹ Anterior</button>
      <span class="grid-nav__month">${esc(monthLabel)}</span>
      <button class="btn btn--ghost btn--sm" id="grid-today" type="button">Hoje</button>
      <button class="btn btn--ghost btn--sm" id="grid-next" type="button">Seguinte ›</button>
    </div>
    <div class="cal-grid card">
      <div class="cal-grid__head">
        ${DAYS.map((d) => `<div class="cal-grid__dow">${d}</div>`).join('')}
      </div>
      <div class="cal-grid__body">
        ${rows.map((row) => `
          <div class="cal-grid__row">
            ${row.map((cell) => {
              if (!cell) return `<div class="cal-grid__cell cal-grid__cell--empty"></div>`;
              const isToday = cell.dateStr === todayStr;
              const isPast = cell.dateStr < todayStr;
              return `
                <div class="cal-grid__cell${isToday ? ' cal-grid__cell--today' : ''}${isPast ? ' cal-grid__cell--past' : ''}">
                  <div class="cal-grid__day-head">
                    <span class="cal-grid__day-num${isToday ? ' cal-grid__day-num--today' : ''}">${cell.day}</span>
                    ${editable ? `<button class="cal-grid__add" data-new-day="${cell.dateStr}" type="button" title="Novo evento">+</button>` : ''}
                  </div>
                  <div class="cal-grid__events">
                    ${cell.events.slice(0, 3).map((ev) => {
                      const evTeam = teamById(ev.team_id);
                      // Etiqueta da grelha: identifica a equipa (escalão) do
                      // treino/jogo; sem equipa, mostra o título ou o tipo.
                      const label = evTeam ? teamName(evTeam) : (ev.title || EVENT_TYPE_LABEL[ev.type] || '');
                      const time = ev.time ? ev.time.slice(0, 5) : '';
                      const full = [EVENT_TYPE_LABEL[ev.type] || ev.type, label, time, ev.opponent ? `vs ${ev.opponent}` : '']
                        .filter(Boolean).join(' · ');
                      // Cor por equipa (mantém o texto). Sem equipa, usa a cor do tipo.
                      const hue = evTeam ? teamHue(evTeam.id) : null;
                      const colorClass = hue != null ? 'cal-grid__ev--team' : `badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}`;
                      const styleAttr = hue != null
                        ? ` style="background:hsl(${hue} 70% 92%);border-left:3px solid hsl(${hue} 55% 42%);color:#1f2937"`
                        : '';
                      return `
                      <div class="cal-grid__ev ${colorClass}"${styleAttr} title="${esc(full)}">
                        ${time ? `<span class="cal-grid__ev-time">${esc(time)}</span> ` : ''}${esc(label.slice(0, 16))}${label.length > 16 ? '…' : ''}
                      </div>`;
                    }).join('')}
                    ${cell.events.length > 3 ? `<span class="muted" style="font-size:0.7rem">+${cell.events.length - 3} mais</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>`).join('')}
      </div>
    </div>
  `;
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

  const hue = team ? teamHue(team.id) : null;
  const accent = hue != null ? ` style="border-left:4px solid hsl(${hue} 55% 45%);padding-left:0.7rem"` : '';

  const canSquad = canEdit('squads') && ev.type === 'jogo' && ev.team_id;
  const squad = state.squads.find((s) => s.event_id === ev.id);
  const nConvocados = squad
    ? state.squadPlayers.filter((sp) => sp.squad_id === squad.id).length
    : 0;

  return `
    <div class="event-row ${isPast ? 'event-row--past' : ''}"${accent}>
      <div class="event-row__when">
        <span class="event-row__date">${dateStr}</span>
        <span class="event-row__time muted">${eventTimeRange(ev) ? esc(eventTimeRange(ev)) : '—'}</span>
      </div>
      <div class="event-row__main">
        <div class="event-row__title">
          <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}" style="margin-right:0.4rem">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}
        </div>
        ${meta ? `<span class="event-row__meta">${meta}</span>` : ''}
        ${ev.type === 'jogo' && nConvocados > 0
          ? `<span class="badge badge--info" style="margin-top:0.3rem;display:inline-block">${nConvocados} convocado${nConvocados !== 1 ? 's' : ''}</span>`
          : ''}
      </div>
      <div class="cell-actions">
        ${canSquad ? `<button class="btn btn--ghost btn--sm" data-squad="${ev.id}" type="button">Convocar</button>` : ''}
        ${editable
          ? `<button class="btn btn--ghost btn--sm" data-edit="${ev.id}" type="button">Editar</button>
             <button class="btn btn--danger btn--sm" data-del="${ev.id}" type="button">Remover</button>`
          : ''}
      </div>
    </div>
  `;
}

function openForm(id, prefillDate) {
  const existing = id ? state.events.find((e) => e.id === id) : null;
  openModal({
    title: existing ? 'Editar evento' : 'Novo evento',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { type: 'jogo', location: DEFAULT_LOCATION, date: prefillDate || '' },
    fields: [
      { name: 'type', label: 'Tipo', type: 'select', required: true, options: EVENT_TYPES },
      { name: 'title', label: 'Título', placeholder: 'ex.: Jornada 3' },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'time', label: 'Hora de início', type: 'time' },
      { name: 'end_time', label: 'Hora de fim', type: 'time' },
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
        end_time: values.end_time || null,
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
  const ok = await confirmDialog(
    `Arquivar o evento "${ev?.title || EVENT_TYPE_LABEL[ev?.type]}"? Fica no histórico e pode ser reposto nos Arquivados.`,
    { confirmLabel: 'Arquivar', danger: false }
  );
  if (!ok) return;
  try {
    await archiveRow('events', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

function openRecurrentModal() {
  const today = toLocalISO(new Date());
  const inThreeMonths = toLocalISO(new Date(Date.now() + 90 * 86400000));

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
          <label for="rec-time">Hora de início</label>
          <input type="time" id="rec-time" value="19:00" />
        </div>
        <div class="field">
          <label for="rec-end-time">Hora de fim</label>
          <input type="time" id="rec-end-time" value="20:30" />
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
    const endTime = overlay.querySelector('#rec-end-time').value || null;
    const teamId = overlay.querySelector('#rec-team').value || null;
    const location = overlay.querySelector('#rec-location').value.trim() || null;
    const title = overlay.querySelector('#rec-title-field').value.trim() || null;

    const dates = generateDates(start, end, [...selectedDays]);
    if (!dates.length) return;

    const rows = dates.map((date) => ({
      type: 'treino',
      date,
      time: time || null,
      end_time: endTime || null,
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
      // Formatar em data LOCAL (não toISOString, que converte para UTC e
      // poderia deslocar o dia para trás em fusos a leste de Greenwich).
      dates.push(toLocalISO(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// Devolve YYYY-MM-DD na data local (sem conversão para UTC).
function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Aberturas usadas pela criação rápida do Painel.
export function openEventForm() {
  openForm();
}
export function openRecurrentTrainings() {
  openRecurrentModal();
}
