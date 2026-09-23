// Vista: Calendário. Lista de eventos por ordem cronológica, com filtros
// por tipo e por equipa, distinguindo eventos passados dos futuros.

import { state, createRow, createRows, updateRow, archiveRow, setEventPlayers, dbErrorMessage } from '../store.js';
import { setSelectedEvent } from './presencas.js';
import { openResultModal } from './resultado.js';
import { esc, emptyHTML, wireEmptyAction } from '../ui.js';
import { toastError } from '../toast.js';
import { eventDateTime, eventTimeRange, teamById, teamName, escalaoColor, gameResult, gameSetsOf,
         eventPlayerIds, eventRoster, appointmentConflicts } from '../compute.js';
import { openModal, confirmDialog, wireDialog } from '../modal.js';
import { openAthleteProfile } from './athlete-profile.js';
import { findPlanForEvent, openGamePlanForEvent } from './plano-jogo.js';
import { openTrainingPlan } from './training-plan.js';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_STATUS_LABEL,
  DEFAULT_LOCATION,
  WEEKDAYS,
  isPickedEvent,
} from '../constants.js';
import { canEdit, canAccess, canEditEvent, isFisio } from '../permissions.js';

// Tipos que este utilizador pode criar. O coordenador cria tudo; o preparador
// físico cria musculação e mais nada — e a musculação só existe depois de a
// migração `musculacao.sql` correr (sem `event_players` não há forma de dizer
// quem lá vai, que é a única coisa que a distingue de um treino).
function creatableTypes() {
  return EVENT_TYPES.filter((t) => {
    if (t.key === 'musculacao') return state.musculacaoReady && canEdit('musculacao');
    return canEdit('events');
  });
}

// Atletas de uma equipa, por número — as opções do seletor de participantes.
function teamPlayerOptions(teamId) {
  if (!teamId) return [];
  return state.players
    .filter((p) => p.team_id === teamId)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999))
    .map((p) => ({
      key: p.id,
      label: p.name,
      meta: p.number ? `#${p.number}` : '',
    }));
}

// Nº máximo de eventos mostrados numa célula da grelha antes de resumir com
// "+N mais" (clicando no dia abre-se o detalhe completo).
const GRID_CELL_LIMIT = 4;

// Converte um atendimento de fisioterapia num "evento" para o calendário.
// São só de leitura aqui (geridos no Departamento Médico).
function apptToEvent(a) {
  const player = state.players.find((p) => p.id === a.player_id);
  return {
    id: `appt-${a.id}`,
    _appt: true,
    playerId: a.player_id,
    type: 'fisioterapia',
    apptType: a.type,
    status: a.status,
    title: player ? player.name : 'Atendimento',
    date: a.date,
    time: a.time,
    end_time: null,
    team_id: player ? player.team_id : null,
    location: a.location,
  };
}

// Cor de identidade de um evento: a do escalão da sua equipa (unificada com o
// resto da app). null se o evento não tiver equipa.
function eventColor(ev) {
  const team = teamById(ev.team_id);
  return team ? escalaoColor(team.escalao) : null;
}
// Estilo de "chip" (fundo suave + acento) para a grelha/semana.
function eventChipStyle(color) {
  return `background:color-mix(in srgb, ${color} 16%, var(--surface));border-left:3px solid ${color};color:var(--text)`;
}
// Navega para outra secção reaproveitando o botão da barra lateral.
function navTo(route) {
  const btn = document.querySelector(`[data-route="${route}"]`);
  if (btn) btn.click();
  else location.hash = `#/${route}`;
}

// A convocatória deixou de ser um modal do Calendário: é o ecrã das Presenças
// com o jogo escolhido. Quem vai ao jogo, quem avisou que não pode e quem
// apareceu ao treino são a mesma pergunta sobre o mesmo evento.
function openSquad(eventId) {
  setSelectedEvent(eventId);
  navTo('presencas');
}

const filters = { type: '', team: '' };
// Foco nos atendimentos: a fisio precisa de saber que há treino às 18:30 —
// é o que decide a hora a que marca —, mas o calendário do clube tem quatro
// treinos por noite e cada um ocupava tanto como a consulta da Beatriz. Com
// foco, os atendimentos são as linhas e os eventos do clube passam a CONTEXTO:
// uma linha por dia, com o que colide com a atleta assinalado. `null` = o que
// o papel pede (ligado para a fisio, desligado para o coordenador).
let apptFocus = null;
let calView = 'lista'; // 'lista' | 'semana' | 'grelha'
let gridMonth = new Date(); // mês exibido na grelha
let weekRef = new Date();   // qualquer dia da semana exibida na vista Semana

export function renderCalendario(container) {
  // "Pode criar alguma coisa neste calendário?" — o coordenador cria tudo, o
  // preparador físico só musculação. Quem pode editar CADA evento decide-se
  // linha a linha (`canEditEvent`).
  const editable = creatableTypes().length > 0;
  const showAppts = canAccess('medico');
  const now = new Date();

  // Junta os atendimentos de fisioterapia (só visíveis a quem acede ao
  // Departamento Médico) aos eventos normais do calendário.
  const apptEvents = showAppts
    ? state.appointments.filter((a) => a.status !== 'cancelado').map(apptToEvent)
    : [];

  const events = [...state.events, ...apptEvents]
    .filter(
      (e) =>
        (!filters.type || e.type === filters.type) &&
        (!filters.team || e.team_id === filters.team)
    )
    .sort((a, b) => eventDateTime(a) - eventDateTime(b));

  const future = events.filter((e) => eventDateTime(e) >= now);
  const past = events.filter((e) => eventDateTime(e) < now);
  // Com um tipo escolhido no filtro a pergunta já foi feita — o foco só
  // arruma a vista "Todos".
  const focus = showAppts && !filters.type && (apptFocus ?? isFisio());

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Calendário</h1>
      <div class="row" style="gap:0.5rem;flex-wrap:wrap">
        <div class="cal-toggle" role="group" aria-label="Vista">
          <button class="cal-toggle__btn ${calView === 'lista' ? 'cal-toggle__btn--active' : ''}" id="view-lista" type="button">☰ Lista</button>
          <button class="cal-toggle__btn ${calView === 'semana' ? 'cal-toggle__btn--active' : ''}" id="view-semana" type="button">▤ Semana</button>
          <button class="cal-toggle__btn ${calView === 'grelha' ? 'cal-toggle__btn--active' : ''}" id="view-grelha" type="button">▦ Mês</button>
        </div>
        ${showAppts && !filters.type ? `
          <div class="cal-toggle" role="group" aria-label="O que destacar">
            <button class="cal-toggle__btn ${focus ? 'cal-toggle__btn--active' : ''}" data-focus="on" type="button" aria-pressed="${focus}">🩺 Atendimentos</button>
            <button class="cal-toggle__btn ${!focus ? 'cal-toggle__btn--active' : ''}" data-focus="off" type="button" aria-pressed="${!focus}">Tudo</button>
          </div>` : ''}
        <button class="btn btn--ghost" id="export-ics" type="button" title="Adicionar ao Google/Apple Calendar">⤓ .ics</button>
        ${editable ? `
          <button class="btn btn--ghost" id="add-recurrent" type="button">↺ Recorrentes</button>
          <button class="btn btn--accent" id="add-event" type="button">+ Evento</button>
        ` : ''}
      </div>
    </header>

    ${
      calView === 'grelha'
        ? renderGrid(events, editable, focus)
        : calView === 'semana'
          ? renderWeek(events, editable, focus)
          : renderLista(events, future, past, editable, showAppts, focus)
    }
  `;

  container.querySelector('#add-event')?.addEventListener('click', () => openForm());
  wireEmptyAction(container, 'add-event', () => openForm());
  container.querySelector('#add-recurrent')?.addEventListener('click', () => openRecurrentModal());
  container.querySelector('#export-ics')?.addEventListener('click', () => exportICS(events));
  container.querySelectorAll('[data-focus]').forEach((b) => b.addEventListener('click', () => {
    apptFocus = b.dataset.focus === 'on';
    renderCalendario(container);
  }));
  container.querySelector('#view-lista').addEventListener('click', () => { calView = 'lista'; renderCalendario(container); });
  container.querySelector('#view-semana').addEventListener('click', () => { calView = 'semana'; renderCalendario(container); });
  container.querySelector('#view-grelha').addEventListener('click', () => { calView = 'grelha'; renderCalendario(container); });
  container.querySelector('#week-prev')?.addEventListener('click', () => { weekRef = new Date(weekRef.getFullYear(), weekRef.getMonth(), weekRef.getDate() - 7); renderCalendario(container); });
  container.querySelector('#week-next')?.addEventListener('click', () => { weekRef = new Date(weekRef.getFullYear(), weekRef.getMonth(), weekRef.getDate() + 7); renderCalendario(container); });
  container.querySelector('#week-today')?.addEventListener('click', () => { weekRef = new Date(); renderCalendario(container); });
  container.querySelector('#f-type')?.addEventListener('change', (e) => { filters.type = e.target.value; renderCalendario(container); });
  container.querySelector('#f-team')?.addEventListener('change', (e) => { filters.team = e.target.value; renderCalendario(container); });
  container.querySelector('#grid-prev')?.addEventListener('click', () => { gridMonth = new Date(gridMonth.getFullYear(), gridMonth.getMonth() - 1, 1); renderCalendario(container); });
  container.querySelector('#grid-next')?.addEventListener('click', () => { gridMonth = new Date(gridMonth.getFullYear(), gridMonth.getMonth() + 1, 1); renderCalendario(container); });
  container.querySelector('#grid-today')?.addEventListener('click', () => { gridMonth = new Date(); renderCalendario(container); });
  container.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openForm(b.dataset.edit)));
  container.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => remove(b.dataset.del)));
  container.querySelectorAll('[data-squad]').forEach((b) => b.addEventListener('click', () => openSquad(b.dataset.squad)));
  container.querySelectorAll('[data-result]').forEach((b) => b.addEventListener('click', () => openResultModal(b.dataset.result)));
  // Resumo pós-jogo: folha imprimível com o que já foi registado. O módulo é
  // carregado só quando alguém pede o resumo (chunk à parte).
  container.querySelectorAll('[data-report]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        const { openGameReport } = await import('../game-report.js');
        openGameReport(b.dataset.report);
      } catch (err) {
        toastError(err.message || 'Não foi possível gerar o resumo.');
      }
    })
  );
  container.querySelectorAll('[data-new-day]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); openForm(null, b.dataset.newDay); }));
  container.querySelectorAll('[data-appt]').forEach((b) => b.addEventListener('click', () => openAthleteProfile(b.dataset.appt, { tab: 'fisioterapia' })));
  container.querySelectorAll('[data-plan-event]').forEach((b) => b.addEventListener('click', () => {
    const ev = state.events.find((e) => e.id === b.dataset.planEvent);
    if (ev) { openGamePlanForEvent(ev); navTo('plano-jogo'); }
  }));
  container.querySelectorAll('[data-training-plan]').forEach((b) =>
    b.addEventListener('click', () => openTrainingPlan(b.dataset.trainingPlan)));
  container.querySelectorAll('[data-day]').forEach((cell) => {
    cell.addEventListener('click', () => openDayModal(cell.dataset.day, editable));
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDayModal(cell.dataset.day, editable); }
    });
  });
}

function renderLista(events, future, past, editable, showAppts, focus) {
  const nAppts = events.filter((e) => e._appt).length;
  const count = focus
    ? `${nAppts} atendimento${nAppts === 1 ? '' : 's'}`
    : `${events.length} evento${events.length === 1 ? '' : 's'}`;
  const rows = (list, isPast) => (focus ? focusRows(list, isPast) : list.map((e) => eventRow(e, isPast, editable)).join(''));
  return `
    <section class="card">
      <div class="filters">
        <div>
          <label for="f-type">Tipo</label>
          <select id="f-type">
            <option value="">Todos</option>
            ${EVENT_TYPES.map((t) => `<option value="${t.key}" ${filters.type === t.key ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
            ${showAppts ? `<option value="fisioterapia" ${filters.type === 'fisioterapia' ? 'selected' : ''}>Fisioterapia</option>` : ''}
          </select>
        </div>
        <div>
          <label for="f-team">Equipa</label>
          <select id="f-team">
            <option value="">Todas</option>
            ${state.teams.map((t) => `<option value="${t.id}" ${filters.team === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <span class="filters__count muted">${count}</span>
      </div>
      ${events.length
        ? `${future.length ? `<h3 class="cal-group">Próximos</h3>${rows(future, false)}` : ''}
           ${past.length ? `<h3 class="cal-group cal-group--past">Passados</h3>${rows(past, true)}` : ''}`
        : state.events.length
          // Sem eventos NENHUNS é um clube a começar; sem eventos NESTE filtro
          // é um filtro apertado. A mesma frase para os dois casos mandava
          // criar um evento a quem já tem trinta.
          ? emptyHTML('Sem eventos para os filtros escolhidos.', { icone: '🔍' })
          : emptyHTML('O calendário está vazio. Marca os treinos e os jogos aqui — é daqui que saem as presenças e as convocatórias.', {
              icone: '📅',
              action: editable ? { key: 'add-event', label: '+ Marcar o primeiro evento' } : null,
            })}
    </section>
  `;
}

// Rótulo curto de um evento do clube na linha de contexto: hora e equipa. O
// tipo só entra quando não é treino — numa noite de quatro treinos, escrever
// "Treino" quatro vezes não diz nada.
function contextLabel(ev) {
  const team = teamById(ev.team_id);
  const who = team ? teamName(team) : (ev.title || EVENT_TYPE_LABEL[ev.type] || '');
  const kind = ev.type !== 'treino' ? `${EVENT_TYPE_LABEL[ev.type] || ev.type} ` : '';
  const time = ev.time ? `${ev.time.slice(0, 5)} ` : '';
  return `${time}${kind}${who}${ev.opponent ? ` vs ${ev.opponent}` : ''}`;
}

// A vista Lista com foco nos atendimentos: por dia, os atendimentos como
// linhas inteiras e o resto numa linha de contexto. Dias sem atendimento
// ficam numa linha só (e abrem o detalhe do dia); nos passados nem isso —
// o treino de há três semanas já não decide hora nenhuma.
function focusRows(list, isPast) {
  const byDay = new Map();
  list.forEach((e) => {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(e);
  });
  return [...byDay.entries()].map(([date, evs]) => {
    const appts = evs.filter((e) => e._appt);
    const others = evs.filter((e) => !e._appt);
    if (!appts.length) return isPast ? '' : daySummaryRow(date, others);
    const clash = new Set(appts.flatMap((a) => apptClashes(a).map((c) => c.id)));
    return appts.map((a) => apptEventRow(a, isPast)).join('')
      + (others.length ? contextLine(others, clash, 'No mesmo dia') : '');
  }).join('');
}

function contextLine(evs, clash, lead) {
  return `<p class="cal-context">${esc(lead)}: ${evs.map((e) => {
    const conflict = clash.has(e.id);
    return `<span class="cal-context__item${conflict ? ' cal-context__item--clash' : ''}"${conflict ? ' title="Coincide com um atendimento"' : ''}>${conflict ? '⚠ ' : ''}${esc(contextLabel(e))}</span>`;
  }).join('<span aria-hidden="true"> · </span>')}</p>`;
}

function daySummaryRow(date, evs) {
  const dt = new Date(`${date}T00:00:00`);
  const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  return `
    <div class="cal-daysum" data-day="${date}" role="button" tabindex="0" title="Ver o dia">
      <span class="cal-daysum__date">${esc(dateStr)}</span>
      ${contextLine(evs, new Set(), `${evs.length} evento${evs.length === 1 ? '' : 's'}`)}
    </div>`;
}

// Treinos/jogos da equipa da atleta que se sobrepõem ao atendimento — o
// conflito que o formulário já mostrava a quem MARCA, e que aqui fica à vista
// de quem olha para a semana.
function apptClashes(ev) {
  if (ev.status !== 'agendado') return [];
  return appointmentConflicts(ev.playerId, ev.date, ev.time, null);
}

function renderGrid(allEvents, editable, focus) {
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
  // Com foco, os atendimentos vêm primeiro na célula: senão ficavam atrás do
  // "+N mais", escondidos por quatro treinos.
  if (focus) Object.values(evMap).forEach((l) => l.sort((a, b) => (b._appt ? 1 : 0) - (a._appt ? 1 : 0)));

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
              const hasEvents = cell.events.length > 0;
              return `
                <div class="cal-grid__cell${isToday ? ' cal-grid__cell--today' : ''}${isPast ? ' cal-grid__cell--past' : ''}${hasEvents ? ' cal-grid__cell--clickable' : ''}"${hasEvents ? ` data-day="${cell.dateStr}" role="button" tabindex="0" title="Ver o dia ${cell.day}"` : ''}>
                  <div class="cal-grid__day-head">
                    <span class="cal-grid__day-num${isToday ? ' cal-grid__day-num--today' : ''}">${cell.day}</span>
                    ${editable ? `<button class="cal-grid__add" data-new-day="${cell.dateStr}" type="button" title="Novo evento">+</button>` : ''}
                  </div>
                  <div class="cal-grid__events">
                    ${cell.events.slice(0, GRID_CELL_LIMIT).map((ev) => {
                      if (ev._appt) {
                        const time = ev.time ? ev.time.slice(0, 5) : '';
                        const full = ['Fisioterapia', APPOINTMENT_TYPE_LABEL[ev.apptType] || '', ev.title, time]
                          .filter(Boolean).join(' · ');
                        return `
                      <div class="cal-grid__ev" style="background:hsl(275 60% 93%);border-left:3px solid hsl(275 55% 52%);color:#1f2937" title="${esc(full)}">
                        ${time ? `<span class="cal-grid__ev-time">${esc(time)}</span> ` : ''}🩺 ${esc(ev.title.slice(0, 14))}${ev.title.length > 14 ? '…' : ''}
                      </div>`;
                      }
                      const evTeam = teamById(ev.team_id);
                      // Etiqueta da grelha: identifica a equipa (escalão) do
                      // treino/jogo; sem equipa, mostra o título ou o tipo.
                      const label = evTeam ? teamName(evTeam) : (ev.title || EVENT_TYPE_LABEL[ev.type] || '');
                      const time = ev.time ? ev.time.slice(0, 5) : '';
                      const full = [EVENT_TYPE_LABEL[ev.type] || ev.type, label, time, ev.opponent ? `vs ${ev.opponent}` : '']
                        .filter(Boolean).join(' · ');
                      // Cor pelo escalão da equipa (unificada). Sem equipa, cor do tipo.
                      const color = evTeam ? escalaoColor(evTeam.escalao) : null;
                      const colorClass = (color ? 'cal-grid__ev--team' : `badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}`) + (focus ? ' cal-grid__ev--context' : '');
                      const styleAttr = color ? ` style="${eventChipStyle(color)}"` : '';
                      return `
                      <div class="cal-grid__ev ${colorClass}"${styleAttr} title="${esc(full)}">
                        ${time ? `<span class="cal-grid__ev-time">${esc(time)}</span> ` : ''}${esc(label.slice(0, 16))}${label.length > 16 ? '…' : ''}
                      </div>`;
                    }).join('')}
                    ${cell.events.length > GRID_CELL_LIMIT ? `<span class="cal-grid__more">+${cell.events.length - GRID_CELL_LIMIT} mais</span>` : ''}
                  </div>
                </div>
              `;
            }).join('')}
          </div>`).join('')}
      </div>
    </div>
  `;
}

// Segunda-feira da semana que contém `d`.
function startOfWeek(d) {
  const off = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - off);
}

// Um "chip" de evento na vista Semana (reutiliza o estilo da grelha).
function weekChip(ev, focus) {
  const time = ev.time && /^\d{2}:\d{2}/.test(ev.time) ? ev.time.slice(0, 5) : '';
  if (ev._appt) {
    const label = ev.title || 'Atendimento';
    return `<div class="cal-grid__ev" style="background:hsl(275 60% 93%);border-left:3px solid hsl(275 55% 52%);color:#1f2937" title="Fisioterapia · ${esc(label)}">${time ? `<span class="cal-grid__ev-time">${esc(time)}</span> ` : ''}🩺 ${esc(label)}</div>`;
  }
  const evTeam = teamById(ev.team_id);
  const label = evTeam ? teamName(evTeam) : (ev.title || EVENT_TYPE_LABEL[ev.type] || '');
  const color = evTeam ? escalaoColor(evTeam.escalao) : null;
  const cls = (color ? 'cal-grid__ev cal-grid__ev--team' : `cal-grid__ev badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}`) + (focus ? ' cal-grid__ev--context' : '');
  const style = color ? ` style="${eventChipStyle(color)}"` : '';
  const full = [EVENT_TYPE_LABEL[ev.type] || ev.type, label, time, ev.opponent ? `vs ${ev.opponent}` : ''].filter(Boolean).join(' · ');
  return `<div class="${cls}"${style} title="${esc(full)}">${time ? `<span class="cal-grid__ev-time">${esc(time)}</span> ` : ''}${esc(label)}</div>`;
}

function renderWeek(allEvents, editable, focus) {
  const monday = startOfWeek(weekRef);
  const todayStr = toLocalISO(new Date());
  const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const evMap = {};
  allEvents.forEach((ev) => { (evMap[ev.date] = evMap[ev.date] || []).push(ev); });

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    days.push({ date: d, dateStr: toLocalISO(d) });
  }
  const rangeLabel = `${monday.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })} – ${days[6].date.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return `
    <div class="grid-nav">
      <button class="btn btn--ghost btn--sm" id="week-prev" type="button">‹ Anterior</button>
      <span class="grid-nav__month">${esc(rangeLabel)}</span>
      <button class="btn btn--ghost btn--sm" id="week-today" type="button">Esta semana</button>
      <button class="btn btn--ghost btn--sm" id="week-next" type="button">Seguinte ›</button>
    </div>
    <div class="cal-week card">
      ${days.map((day, i) => {
        const list = (evMap[day.dateStr] || []).sort((a, b) => eventDateTime(a) - eventDateTime(b));
        const isToday = day.dateStr === todayStr;
        const isPast = day.dateStr < todayStr;
        return `
          <div class="cal-week__col${isToday ? ' cal-week__col--today' : ''}${isPast ? ' cal-week__col--past' : ''}">
            <div class="cal-week__head"${list.length ? ` data-day="${day.dateStr}" role="button" tabindex="0" title="Ver o dia"` : ''}>
              <span class="cal-week__dow">${DOW[i]}</span>
              <span class="cal-week__num${isToday ? ' cal-week__num--today' : ''}">${day.date.getDate()}</span>
              ${editable ? `<button class="cal-grid__add" data-new-day="${day.dateStr}" type="button" title="Novo evento">+</button>` : ''}
            </div>
            <div class="cal-week__events">
              ${list.length ? list.map((ev) => weekChip(ev, focus)).join('') : '<span class="cal-week__empty">—</span>'}
            </div>
          </div>`;
      }).join('')}
    </div>
  `;
}

// Exporta os eventos (sem os atendimentos de fisioterapia) para um ficheiro
// .ics, que se pode importar/subscrever no Google/Apple Calendar.
function exportICS(events) {
  const real = events.filter((e) => !e._appt);
  if (!real.length) { alert('Sem eventos para exportar nos filtros atuais.'); return; }

  const pad = (n) => String(n).padStart(2, '0');
  const enc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const dstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const hasTime = (t) => t && /^\d{2}:\d{2}/.test(t);

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumia//Calendario//PT', 'CALSCALE:GREGORIAN'];

  real.forEach((ev) => {
    const team = teamById(ev.team_id);
    let summary = EVENT_TYPE_LABEL[ev.type] || ev.type;
    if (team) summary += `: ${teamName(team)}`;
    if (ev.opponent) summary += ` vs ${ev.opponent}`;
    if (ev.title) summary += ` (${ev.title})`;

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${ev.id}@rumia`);
    lines.push(`DTSTAMP:${dstamp}`);

    const [y, m, d] = ev.date.split('-');
    if (hasTime(ev.time)) {
      const [hh, mm] = ev.time.split(':');
      lines.push(`DTSTART:${y}${m}${d}T${hh}${mm}00`);
      let end;
      if (hasTime(ev.end_time)) {
        const [eh, em] = ev.end_time.split(':');
        end = `${y}${m}${d}T${eh}${em}00`;
      } else {
        const dt = new Date(`${ev.date}T${ev.time}:00`);
        dt.setHours(dt.getHours() + 1);
        end = `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
      }
      lines.push(`DTEND:${end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${y}${m}${d}`);
      const nd = new Date(`${ev.date}T00:00:00`);
      nd.setDate(nd.getDate() + 1);
      lines.push(`DTEND;VALUE=DATE:${nd.getFullYear()}${pad(nd.getMonth() + 1)}${pad(nd.getDate())}`);
    }

    lines.push(`SUMMARY:${enc(summary)}`);
    if (ev.location) lines.push(`LOCATION:${enc(ev.location)}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'calendario-rumia.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

function eventRow(ev, isPast, editable) {
  if (ev._appt) return apptEventRow(ev, isPast);
  const dt = eventDateTime(ev);
  const team = teamById(ev.team_id);
  const dateStr = dt.toLocaleDateString('pt-PT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
  // O crachá já diz o tipo: repeti-lo no título ("Treino Treino") não diz
  // nada. Sem título próprio, o título passa a ser a equipa — que é o que
  // distingue os quatro treinos da mesma noite.
  const typeLabel = EVENT_TYPE_LABEL[ev.type] || ev.type;
  const ownTitle = ev.title && ev.title !== typeLabel ? ev.title : '';
  const heading = ownTitle || (team ? teamName(team) : typeLabel || 'Evento');
  const meta = [
    team && ownTitle ? esc(teamName(team)) : '',
    ev.opponent ? `vs ${esc(ev.opponent)}` : '',
    ev.location ? esc(ev.location) : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const color = team ? escalaoColor(team.escalao) : null;
  const accent = color ? ` style="border-left:4px solid ${color};padding-left:0.7rem"` : '';

  // A convocatória vive agora nas Presenças: sem acesso a essa secção, o botão
  // levaria a um sítio onde o utilizador não entra.
  const canSquad = canEdit('squads') && canAccess('presencas') && ev.type === 'jogo' && ev.team_id;
  const squad = state.squads.find((s) => s.event_id === ev.id);
  const nConvocados = squad
    ? state.squadPlayers.filter((sp) => sp.squad_id === squad.id).length
    : 0;

  // Ligação ao Plano de Jogo (só jogos, para quem tem acesso a essa secção).
  const showPlan = ev.type === 'jogo' && ev.team_id && canAccess('plano-jogo');
  const hasPlan = showPlan && !!findPlanForEvent(ev);
  // Ligação ao Plano de Treino (só treinos, para quem marca presenças). O
  // calendário é o sítio natural para o preparar — antes só se lá chegava pelo
  // Painel, e só a treinos de hoje ou com presenças por marcar.
  const showTraining = ev.type === 'treino' && canEdit('attendances');
  const hasTraining = showTraining && state.trainingPlans.some((tp) => tp.event_id === ev.id);

  // Numa sessão de musculação o que se quer saber de relance é QUANTAS entram
  // — é a diferença entre esta e todas as outras linhas do calendário, e o
  // número é o que se confere à porta do ginásio.
  const nPicked = isPickedEvent(ev) ? eventRoster(ev).length : 0;
  // Editar/remover é por evento: o preparador físico mexe nas sessões de
  // musculação e em mais nada. Um botão que aparece e depois dá erro de
  // permissão lê-se como avaria.
  const canEditThis = editable && canEditEvent(ev);

  return `
    <div class="event-row ${isPast ? 'event-row--past' : ''}"${accent}>
      <div class="event-row__when">
        <span class="event-row__date">${dateStr}</span>
        <span class="event-row__time muted">${eventTimeRange(ev) ? esc(eventTimeRange(ev)) : '—'}</span>
      </div>
      <div class="event-row__main">
        <div class="event-row__title">
          <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}" style="margin-right:0.4rem">${esc(typeLabel)}</span>${esc(heading)}
        </div>
        ${meta ? `<span class="event-row__meta">${meta}</span>` : ''}
        ${resultBadge(ev)}
        ${ev.type === 'jogo' && nConvocados > 0
          ? `<span class="badge badge--info" style="margin-top:0.3rem;display:inline-block">${nConvocados} convocado${nConvocados !== 1 ? 's' : ''}</span>`
          : ''}
        ${isPickedEvent(ev)
          ? `<span class="badge badge--${nPicked ? 'gold' : 'warn'}" style="margin-top:0.3rem;display:inline-block">${nPicked ? `${nPicked} atleta${nPicked !== 1 ? 's' : ''}` : 'Sem atletas'}</span>`
          : ''}
      </div>
      <div class="cell-actions">
        ${showPlan ? `<button class="btn btn--ghost btn--sm" data-plan-event="${ev.id}" type="button">${hasPlan ? 'Plano ✓' : 'Preparar plano'}</button>` : ''}
        ${showTraining ? `<button class="btn btn--ghost btn--sm" data-training-plan="${ev.id}" type="button">${hasTraining ? 'Plano ✓' : 'Preparar treino'}</button>` : ''}
        ${canSquad ? `<button class="btn btn--ghost btn--sm" data-squad="${ev.id}" type="button">Convocar</button>` : ''}
        ${canResult(ev) ? `<button class="btn btn--ghost btn--sm" data-result="${ev.id}" type="button">${gameResult(ev.id) ? 'Resultado ✓' : 'Registar resultado'}</button>` : ''}
        ${ev.type === 'jogo' && gameResult(ev.id) ? `<button class="btn btn--ghost btn--sm" data-report="${ev.id}" type="button">Resumo</button>` : ''}
        ${canEditThis
          ? `<button class="btn btn--ghost btn--sm" data-edit="${ev.id}" type="button">Editar</button>
             <button class="btn btn--danger btn--sm" data-del="${ev.id}" type="button">Remover</button>`
          : ''}
      </div>
    </div>
  `;
}

// Detalhe de um dia: abre-se ao clicar numa célula da grelha (útil quando há
// muitos eventos e a célula só mostra os primeiros). Lista todos os eventos e
// atendimentos do dia, com as mesmas ações da vista Lista.
function openDayModal(dateStr, editable) {
  const showAppts = canAccess('medico');
  const apptEvents = showAppts
    ? state.appointments.filter((a) => a.status !== 'cancelado' && a.date === dateStr).map(apptToEvent)
    : [];
  const dayEvents = [...state.events.filter((e) => e.date === dateStr), ...apptEvents]
    .filter(
      (e) =>
        (!filters.type || e.type === filters.type) &&
        (!filters.team || e.team_id === filters.team)
    )
    .sort((a, b) => eventDateTime(a) - eventDateTime(b));

  const d = new Date(dateStr + 'T00:00:00');
  const heading = d.toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="day-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 id="day-title" style="text-transform:capitalize">${esc(heading)}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="cal-day-list">
        ${dayEvents.length
          ? dayEvents.map((e) => eventRow(e, false, editable)).join('')
          : emptyHTML('Sem eventos neste dia.')}
      </div>
    </div>
  `;
  const close = wireDialog(overlay);

  // As ações fecham o detalhe primeiro para que o modal/diálogo seguinte
  // fique por cima sem sobreposições.
  overlay.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { close(); openForm(b.dataset.edit); }));
  overlay.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => { close(); remove(b.dataset.del); }));
  overlay.querySelectorAll('[data-squad]').forEach((b) => b.addEventListener('click', () => { close(); openSquad(b.dataset.squad); }));
  overlay.querySelectorAll('[data-appt]').forEach((b) => b.addEventListener('click', () => { close(); openAthleteProfile(b.dataset.appt, { tab: 'fisioterapia' }); }));
  overlay.querySelectorAll('[data-plan-event]').forEach((b) => b.addEventListener('click', () => {
    const ev = state.events.find((e) => e.id === b.dataset.planEvent);
    if (ev) { close(); openGamePlanForEvent(ev); navTo('plano-jogo'); }
  }));
  overlay.querySelectorAll('[data-training-plan]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.trainingPlan;
    close();
    openTrainingPlan(id);
  }));
}

// Linha (vista Lista) de um atendimento de fisioterapia. Só de leitura — abre
// a ficha clínica do atleta.
function apptEventRow(ev, isPast) {
  const team = teamById(ev.team_id);
  const dt = eventDateTime(ev);
  const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const meta = [
    team ? teamName(team) : '',
    ev.location ? esc(ev.location) : '',
  ].filter(Boolean).join(' · ');
  const clashes = apptClashes(ev);

  return `
    <div class="event-row ${isPast ? 'event-row--past' : ''}" style="border-left:4px solid hsl(275 55% 52%);padding-left:0.7rem">
      <div class="event-row__when">
        <span class="event-row__date">${esc(dateStr)}</span>
        <span class="event-row__time muted">${ev.time ? esc(ev.time.slice(0, 5)) : '—'}</span>
      </div>
      <div class="event-row__main">
        <div class="event-row__title">
          <span class="badge" style="margin-right:0.4rem;background:hsl(275 60% 94%);color:hsl(275 45% 35%)">🩺 ${esc(APPOINTMENT_TYPE_LABEL[ev.apptType] || 'Fisioterapia')}</span>${esc(ev.title)}
          <span class="muted" style="margin-left:0.4rem;font-size:0.82rem">${esc(APPOINTMENT_STATUS_LABEL[ev.status] || ev.status)}</span>
        </div>
        ${meta ? `<span class="event-row__meta">${meta}</span>` : ''}
        ${clashes.length && !isPast
          ? `<span class="cal-clash">⚠ Coincide com ${esc(clashes.map(contextLabel).join(', '))}</span>`
          : ''}
      </div>
      <div class="cell-actions">
        <button class="btn btn--ghost btn--sm" data-appt="${ev.playerId}" type="button">Ficha clínica</button>
      </div>
    </div>
  `;
}

function openForm(id, prefillDate, defaults) {
  const existing = id ? state.events.find((e) => e.id === id) : null;
  const types = creatableTypes();
  const defaultType = types.some((t) => t.key === 'jogo') ? 'jogo' : types[0]?.key || 'jogo';
  const values = existing
    ? { ...existing, players: eventPlayerIds(existing.id) }
    : { type: defaultType, location: DEFAULT_LOCATION, date: prefillDate || '', players: [], ...(defaults || {}) };

  // O formulário muda de forma com o TIPO e com a EQUIPA: a musculação
  // acrescenta a lista de quem entra naquele horário, e essa lista é do
  // plantel escolhido. Reconstruir só na gravação não serve — os campos por
  // preencher bloqueiam o submit antes de lá chegar (ver `reactive` no
  // modal.js).
  function build(current) {
    const isPicked = isPickedEvent({ type: current.type });
    const teamId = current.team_id || '';
    const options = teamPlayerOptions(teamId);
    return [
      { name: 'type', label: 'Tipo', type: 'select', required: true, options: types, reactive: true },
      { name: 'title', label: 'Título', placeholder: 'ex.: Jornada 3' },
      { name: 'date', label: 'Data', type: 'date', required: true },
      { name: 'time', label: 'Hora de início', type: 'time' },
      { name: 'end_time', label: 'Hora de fim', type: 'time' },
      {
        name: 'team_id',
        label: 'Equipa',
        type: 'select',
        placeholder: isPicked ? 'Escolhe a equipa' : 'Sem equipa',
        required: isPicked,
        reactive: true,
        options: state.teams.map((t) => ({ key: t.id, label: teamName(t) })),
        hint: isPicked ? 'A musculação escolhe-se dentro de um escalão.' : '',
      },
      ...(isPicked
        ? [{
            name: 'players',
            label: 'Atletas neste horário',
            type: 'checks',
            full: true,
            required: true,
            options,
            emptyText: teamId
              ? 'Esta equipa ainda não tem atletas.'
              : 'Escolhe primeiro a equipa.',
            hint: 'O ginásio não leva o plantel todo: marca quem entra nesta sessão.',
          }]
        : []),
      ...(isPicked ? [] : [{ name: 'opponent', label: 'Adversário (só jogos)', placeholder: 'Nome do adversário' }]),
      { name: 'location', label: 'Local', full: true },
    ];
  }

  let reopen;
  reopen = (current) => {
    const close = openModal({
      title: existing ? 'Editar evento' : 'Novo evento',
      submitLabel: existing ? 'Guardar' : 'Adicionar',
      values: current,
      fields: build(current),
      onFieldChange: (name, snapshot) => {
        // Só o tipo e a equipa mudam a forma do formulário; qualquer outra
        // alteração não vale perder o que já lá está escrito.
        if (name !== 'type' && name !== 'team_id') return;
        const next = { ...current, ...snapshot };
        // Trocar de equipa desfaz a escolha de atletas: são de outro plantel.
        // Deixar lá os anteriores gravava no grupo das 19h gente que nem
        // treina naquele escalão.
        if (name === 'team_id') next.players = [];
        close();
        reopen(next);
      },
      onSubmit: async (submitted) => {
        const isPicked = isPickedEvent({ type: submitted.type });
        const picked = Array.isArray(submitted.players) ? submitted.players : [];
        // O `required` de um grupo de caixas não é validado pelo browser (não
        // há um controlo único a que ele se aplique), e uma sessão de
        // musculação sem ninguém é uma sessão que não existe.
        if (isPicked && !picked.length) {
          throw new Error('Escolhe pelo menos um atleta para esta sessão.');
        }
        const payload = {
          type: submitted.type,
          title: submitted.title?.trim() || null,
          date: submitted.date,
          time: submitted.time || null,
          end_time: submitted.end_time || null,
          team_id: submitted.team_id || null,
          opponent: submitted.type === 'jogo' ? submitted.opponent?.trim() || null : null,
          location: submitted.location?.trim() || null,
        };
        try {
          const row = existing
            ? await updateRow('events', 'events', id, payload)
            : await createRow('events', 'events', payload);
          const eventId = row?.id || id;
          // Trocar um evento de musculação para outro tipo larga o grupo: um
          // treino da equipa toda com uma lista de dez nomes por baixo é uma
          // contradição à espera de decidir qual das duas manda.
          if (eventId) await setEventPlayers(eventId, isPicked ? picked : []);
        } catch (err) {
          throw new Error(dbErrorMessage(err));
        }
      },
    });
  };
  reopen(values);
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

// Criador de eventos recorrentes. Nasceu para os treinos semanais e serve
// agora também a musculação, que é o caso onde a recorrência mais pesa: o
// ginásio faz-se por horários fixos e o mesmo grupo repete-se toda a semana —
// lançar sessão a sessão eram trinta formulários para dizer três coisas.
function openRecurrentModal() {
  const today = toLocalISO(new Date());
  const inThreeMonths = toLocalISO(new Date(Date.now() + 90 * 86400000));
  const types = creatableTypes().filter((t) => t.key === 'treino' || t.key === 'musculacao');
  if (!types.length) return;
  let recType = types[0].key;
  const recTitle = (t) => (t === 'musculacao' ? 'Musculação recorrente' : 'Treinos recorrentes');
  const recSubmit = (t) => (t === 'musculacao' ? 'Criar sessões' : 'Criar treinos');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="rec-title" style="width:min(540px,96vw)">
      <div class="modal__head">
        <h2 id="rec-title">${esc(recTitle(recType))}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      ${types.length > 1 ? `
      <div class="field">
        <label for="rec-type">Tipo</label>
        <select id="rec-type">
          ${types.map((t) => `<option value="${t.key}" ${t.key === recType ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
        </select>
      </div>` : ''}

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

      <div class="field field--full" id="rec-players-field" hidden>
        <span class="field__label">Atletas neste horário <span class="field__req" title="Obrigatório">*</span></span>
        <div id="rec-players"></div>
        <p class="field__hint muted">O mesmo grupo em todas as sessões criadas. Trocar de equipa recomeça a escolha.</p>
      </div>

      <p class="rec-preview muted" id="rec-preview" style="font-size:0.85rem;margin:0.2rem 0 0"></p>

      <div id="rec-err" class="modal__error" style="display:none"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="rec-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="rec-confirm" type="button" disabled>${esc(recSubmit(recType))}</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay);
  overlay.querySelector('#rec-cancel').addEventListener('click', close);

  const selectedDays = new Set();
  const confirmBtn = overlay.querySelector('#rec-confirm');
  const previewEl = overlay.querySelector('#rec-preview');
  const errEl = overlay.querySelector('#rec-err');
  const teamEl = overlay.querySelector('#rec-team');
  const typeEl = overlay.querySelector('#rec-type');
  const playersField = overlay.querySelector('#rec-players-field');
  const playersBox = overlay.querySelector('#rec-players');
  const selectedPlayers = new Set();

  const isPicked = () => isPickedEvent({ type: recType });

  // A lista de atletas é reconstruída a cada troca de equipa (e some quando o
  // tipo deixa de ser musculação). A escolha anterior NÃO sobrevive à troca:
  // são atletas de outro plantel.
  function renderPlayers() {
    playersField.hidden = !isPicked();
    if (!isPicked()) return;
    const options = teamPlayerOptions(teamEl.value);
    if (!options.length) {
      playersBox.innerHTML = `<p class="muted">${teamEl.value ? 'Esta equipa ainda não tem atletas.' : 'Escolhe primeiro a equipa.'}</p>`;
      return;
    }
    playersBox.innerHTML = `
      <div class="check-list">
        <div class="check-list__bar">
          <button type="button" class="btn btn--ghost btn--sm" data-rec-all>Todas</button>
          <button type="button" class="btn btn--ghost btn--sm" data-rec-none>Nenhuma</button>
          <span class="muted check-list__count" id="rec-players-count"></span>
        </div>
        ${options.map((o, i) => `
          <label class="check-item" for="rec-p-${i}">
            <input type="checkbox" id="rec-p-${i}" value="${esc(o.key)}" ${selectedPlayers.has(o.key) ? 'checked' : ''} />
            <span>${esc(o.label)}${o.meta ? ` <span class="muted">${esc(o.meta)}</span>` : ''}</span>
          </label>`).join('')}
      </div>`;
    const boxes = [...playersBox.querySelectorAll('input[type="checkbox"]')];
    const countEl = playersBox.querySelector('#rec-players-count');
    const sync = () => {
      selectedPlayers.clear();
      boxes.filter((b) => b.checked).forEach((b) => selectedPlayers.add(b.value));
      countEl.textContent = `${selectedPlayers.size} de ${boxes.length} selecionada${boxes.length === 1 ? '' : 's'}`;
      updatePreview();
    };
    boxes.forEach((b) => b.addEventListener('change', sync));
    playersBox.querySelector('[data-rec-all]').addEventListener('click', () => { boxes.forEach((b) => { b.checked = true; }); sync(); });
    playersBox.querySelector('[data-rec-none]').addEventListener('click', () => { boxes.forEach((b) => { b.checked = false; }); sync(); });
    sync();
  }

  function updatePreview() {
    const start = overlay.querySelector('#rec-start').value;
    const end = overlay.querySelector('#rec-end').value;
    const label = isPicked() ? 'sessão' : 'treino';
    if (!start || !end || !selectedDays.size) {
      previewEl.textContent = '';
      confirmBtn.disabled = true;
      return;
    }
    const dates = generateDates(start, end, [...selectedDays]);
    // Na musculação faltam sempre duas respostas antes de se poder criar seja
    // o que for: a equipa e quem entra. Dizê-lo aqui — e não num erro depois
    // de carregar — é a diferença entre um formulário e uma adivinha.
    if (isPicked() && (!teamEl.value || !selectedPlayers.size)) {
      previewEl.textContent = !teamEl.value
        ? 'Escolhe a equipa e os atletas deste horário.'
        : 'Escolhe os atletas deste horário.';
      confirmBtn.disabled = true;
      return;
    }
    previewEl.textContent = dates.length
      ? `${dates.length} ${label}${dates.length === 1 ? '' : 's'} a criar`
        + (isPicked() ? `, com ${selectedPlayers.size} atleta${selectedPlayers.size === 1 ? '' : 's'}` : '')
      : `Nenhuma data nesse período com os dias selecionados.`;
    confirmBtn.disabled = dates.length === 0;
  }

  typeEl?.addEventListener('change', () => {
    recType = typeEl.value;
    overlay.querySelector('#rec-title').textContent = recTitle(recType);
    confirmBtn.textContent = recSubmit(recType);
    renderPlayers();
    updatePreview();
  });
  teamEl.addEventListener('change', () => { selectedPlayers.clear(); renderPlayers(); updatePreview(); });
  renderPlayers();

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

    if (isPicked() && (!teamId || !selectedPlayers.size)) return;

    const rows = dates.map((date) => ({
      type: recType,
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
      const created = await createRows('events', 'events', rows);
      // O grupo é o MESMO em todas as sessões criadas — é isso que faz disto
      // um horário e não trinta sessões soltas. Vai uma escrita por sessão
      // porque os participantes são por evento, mas o gesto é um só.
      if (isPicked()) {
        const picked = [...selectedPlayers];
        for (const ev of created) await setEventPlayers(ev.id, picked);
      }
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

// Aberturas usadas pela criação rápida do Painel e pela Preparação Física.
//
// O horário do ginásio é trabalho do preparador físico: mandá-lo ao Calendário
// para lançar cada sessão era mandá-lo ao ecrã de outra pessoa. Daí os
// `defaults` — abre-se o mesmo formulário já com o tipo e a equipa certos.
export function openEventForm(id = null, defaults = null) {
  openForm(id, null, defaults);
}
export function openRecurrentTrainings() {
  openRecurrentModal();
}
export { openRecurrentTrainings as openRecurrentForm };


// Quem regista o resultado: quem marca convocatórias (coordenador e treinador
// da equipa), e só depois de o jogo ter acontecido — registar o resultado de
// um jogo que ainda não se jogou não faz sentido.
function canResult(ev) {
  return canEdit('squads')
    && ev.type === 'jogo'
    && ev.team_id
    && eventDateTime(ev) <= new Date();
}

// Resultado na linha do evento: o marcador em sets e, se houver parciais, os
// sets escritos por extenso — que é como um treinador lê um jogo.
function resultBadge(ev) {
  const r = gameResult(ev.id);
  if (!r) return '';
  const venceu = r.sets_for > r.sets_against;
  const parciais = gameSetsOf(ev.id)
    .map((s) => `${s.points_for}-${s.points_against}`)
    .join(' · ');
  return `
    <span class="event-row__result">
      <strong class="badge badge--${venceu ? 'ok' : r.sets_for === r.sets_against ? 'muted' : 'danger'}">
        ${r.sets_for}–${r.sets_against}
      </strong>
      ${parciais ? `<span class="muted event-row__parciais">${esc(parciais)}</span>` : ''}
    </span>`;
}
