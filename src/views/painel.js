// Vista: Painel (resumo do clube).
// Cartões de métricas, barra de progresso da meta e próximos eventos.

import { state } from '../store.js';
import { esc, euros } from '../ui.js';
import {
  totalRaised,
  inProgressCount,
  upcomingEvents,
  eventDateTime,
  teamById,
  teamName,
} from '../compute.js';
import { EVENT_TYPE_LABEL, EVENT_TYPE_BADGE } from '../constants.js';

const ICON_MONEY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-3-3.5c0 1.38 1.34 2.5 3 2.5s3-1.12 3-2.5c0-1.74-1.35-2.17-3-2.5C10.35 11.67 9 11.24 9 9.5 9 8.12 10.34 7 12 7s3 1.12 3 2.5"/></svg>`;

const ICON_CHART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

const ICON_USERS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

const ICON_COACH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

export function renderPainel(container) {
  const raised = totalRaised();
  const goal = state.settings.goal || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const inProgress = inProgressCount();
  const athletes = state.players.length;
  const coaches = state.coaches.length;
  const upcoming = upcomingEvents(5);

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Painel</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Época ${esc(state.settings.season)}</p>
      </div>
    </header>

    <section class="cards-grid">
      ${metricCard(ICON_MONEY, 'Angariado', euros(raised), `Meta: ${euros(goal)}`, 'accent')}
      ${metricCard(ICON_CHART, 'Em contacto', inProgress, 'patrocínios a decorrer', 'blue')}
      ${metricCard(ICON_USERS, 'Atletas', athletes, 'inscritos nos plantéis', 'green')}
      ${metricCard(ICON_COACH, 'Treinadores', coaches, 'na equipa técnica', 'purple')}
    </section>

    <section class="card goal-card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">Meta de patrocínios</h2>
        <span class="goal-card__pct">${pct}%</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress__bar" style="width:${pct}%"></div>
      </div>
      <p class="muted goal-card__caption">
        ${euros(raised)} angariados de ${euros(goal)} na época ${esc(state.settings.season)}.
      </p>
    </section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
      ${upcoming.length ? upcomingList(upcoming) : '<p class="muted" style="margin:0.3rem 0 0">Sem eventos futuros agendados.</p>'}
    </section>
  `;
}

function metricCard(icon, label, value, sub, variant = '') {
  return `
    <div class="card metric ${variant ? 'metric--' + variant : ''}">
      <div class="metric__icon-wrap">${icon}</div>
      <span class="metric__label">${esc(label)}</span>
      <strong class="metric__value">${String(value)}</strong>
      <span class="metric__sub muted">${esc(sub)}</span>
    </div>
  `;
}

function upcomingList(events) {
  return `
    <ul class="event-mini">
      ${events
        .map((ev) => {
          const dt = eventDateTime(ev);
          const team = teamById(ev.team_id);
          const day = dt.toLocaleDateString('pt-PT', { day: '2-digit' });
          const mon = dt.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
          const time = ev.time ? ev.time.slice(0, 5) : '';
          const meta = [
            team ? teamName(team) : '',
            ev.opponent ? `vs ${esc(ev.opponent)}` : '',
            time ? time : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return `
            <li class="event-mini__item">
              <div class="event-mini__date-block">
                <span class="event-mini__day">${day}</span>
                <span class="event-mini__mon">${mon}</span>
              </div>
              <div class="event-mini__body">
                <span class="event-mini__name">${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}</span>
                <span class="event-mini__meta">
                  <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>
                  ${meta ? `<span class="muted">${meta}</span>` : ''}
                </span>
              </div>
            </li>`;
        })
        .join('')}
    </ul>
  `;
}
