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
        <p class="muted" style="margin:0">Época ${esc(state.settings.season)}</p>
      </div>
    </header>

    <section class="cards-grid">
      ${metricCard('Angariado', euros(raised), `Meta: ${euros(goal)}`, 'accent')}
      ${metricCard('Contactos em curso', inProgress, 'patrocínios a decorrer')}
      ${metricCard('Atletas', athletes, 'inscritos nos plantéis')}
      ${metricCard('Treinadores', coaches, 'na equipa técnica')}
    </section>

    <section class="card goal-card">
      <div class="row row--between">
        <h2 class="section-title goal-card__title">Progresso da meta</h2>
        <strong>${pct}%</strong>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress__bar" style="width:${pct}%"></div>
      </div>
      <p class="muted goal-card__caption">
        ${euros(raised)} de ${euros(goal)} angariados.
      </p>
    </section>

    <section class="card">
      <h2 class="section-title" style="font-size:1.05rem">Próximos eventos</h2>
      ${upcoming.length ? upcomingList(upcoming) : '<p class="muted">Sem eventos futuros agendados.</p>'}
    </section>
  `;
}

function metricCard(label, value, sub, variant = '') {
  return `
    <div class="card metric ${variant ? 'metric--' + variant : ''}">
      <span class="metric__label">${esc(label)}</span>
      <strong class="metric__value">${esc(value)}</strong>
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
          const when = dt.toLocaleDateString('pt-PT', {
            day: '2-digit',
            month: 'short',
          });
          const time = ev.time ? ` · ${esc(ev.time)}` : '';
          const meta = [team ? teamName(team) : '', ev.opponent ? `vs ${esc(ev.opponent)}` : '']
            .filter(Boolean)
            .join(' · ');
          return `
            <li class="event-mini__item">
              <span class="event-mini__date">${when}${time}</span>
              <span class="event-mini__body">
                <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(
            EVENT_TYPE_LABEL[ev.type] || ev.type
          )}</span>
                <strong>${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}</strong>
                ${meta ? `<span class="muted">${meta}</span>` : ''}
              </span>
            </li>`;
        })
        .join('')}
    </ul>
  `;
}
