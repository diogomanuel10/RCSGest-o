// Vista: Painel (resumo do clube).
// Cartões de métricas, barra de progresso da meta e próximos eventos.

import { state } from '../store.js';
import { esc, euros } from '../ui.js';
import {
  totalRaised,
  inProgressCount,
  upcomingEvents,
  eventDateTime,
  eventTimeRange,
  teamById,
  teamName,
  quotasOwed,
  quotasThisMonth,
  pendingReviews,
  prospectsReady,
  attendanceStats,
  equipmentNeedsAttention,
  trainingsToMark,
} from '../compute.js';
import { EVENT_TYPE_LABEL, EVENT_TYPE_BADGE } from '../constants.js';
import { canEdit } from '../permissions.js';
import { setSelectedTraining } from './presencas.js';

const ICON_MONEY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-3-3.5c0 1.38 1.34 2.5 3 2.5s3-1.12 3-2.5c0-1.74-1.35-2.17-3-2.5C10.35 11.67 9 11.24 9 9.5 9 8.12 10.34 7 12 7s3 1.12 3 2.5"/></svg>`;

const ICON_CHART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

const ICON_USERS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

const ICON_COACH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const ICON_CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const ICON_CARD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;

const ICON_SHIELD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

const ICON_BOX = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

export function renderPainel(container) {
  const raised = totalRaised();
  const goal = state.settings.goal || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const inProgress = inProgressCount();
  const athletes = state.players.length;
  const coaches = state.coaches.length;
  const teamsCount = state.teams.length;
  const upcoming = upcomingEvents(5);

  const owed = quotasOwed();
  const att = attendanceStats();
  const equipReview = equipmentNeedsAttention();

  const canMark = canEdit('attendances');
  const toMark = canMark ? trainingsToMark(6) : [];
  const actions = buildActions();

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
      ${metricCard(ICON_USERS, 'Atletas', athletes, `em ${teamsCount} equipa${teamsCount === 1 ? '' : 's'}`, 'green')}
      ${metricCard(ICON_COACH, 'Treinadores', coaches, 'na equipa técnica', 'purple')}
    </section>

    <section class="cards-grid">
      ${metricCard(ICON_CHECK, 'Presenças', att.rate == null ? '—' : att.rate + '%', att.total ? `média em ${att.total} registo${att.total === 1 ? '' : 's'}` : 'ainda sem registos', 'green')}
      ${metricCard(ICON_CARD, 'Em dívida', euros(owed.total), owed.count ? `${owed.count} quota${owed.count === 1 ? '' : 's'} por pagar` : 'tudo regularizado', owed.total > 0 ? 'accent' : 'blue')}
      ${metricCard(ICON_SHIELD, 'Equipas', teamsCount, 'plantéis ativos', 'blue')}
      ${metricCard(ICON_BOX, 'Equipamentos', state.equipment.length, equipReview ? `${equipReview} em mau estado` : 'inventário em dia', equipReview ? 'accent' : 'purple')}
    </section>

    ${actions.length ? `<section class="card alerts-card">
      <h2 class="section-title upcoming-card__title">A precisar da tua atenção</h2>
      <ul class="alerts-list">${actions.map(actionItem).join('')}</ul>
    </section>` : ''}

    ${toMark.length ? `<section class="card mark-card">
      <h2 class="section-title upcoming-card__title">Presenças por marcar</h2>
      <ul class="mark-list">${toMark.map(markRow).join('')}</ul>
    </section>` : ''}

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

  // Atalho: pré-seleciona o treino e navega para a vista Presenças.
  container.querySelectorAll('[data-mark-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setSelectedTraining(btn.dataset.markEvent);
      navTo('presencas');
    });
  });

  // Itens de ação: navegam para a secção respetiva.
  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => navTo(el.dataset.nav));
  });
}

// Navega para uma secção, reaproveitando os botões da barra lateral.
function navTo(route) {
  document.querySelector(`[data-route="${route}"]`)?.click();
}

// Constrói a lista de ações pendentes (cada uma navega para a sua secção).
// Só inclui itens com algo por resolver; devolve [] se estiver tudo em dia.
function buildActions() {
  const items = [];

  if (canEdit('quotas')) {
    const qm = quotasThisMonth();
    if (qm.pendentes > 0) {
      items.push({
        variant: 'warn',
        route: 'quotas',
        title: `${qm.pendentes} quota${qm.pendentes === 1 ? '' : 's'} por cobrar este mês`,
        sub: `${euros(qm.total)} por receber — abrir Quotas.`,
      });
    }
  }

  if (canEdit('prospects')) {
    const ready = prospectsReady();
    if (ready > 0) {
      items.push({
        variant: 'ok',
        route: 'recrutamento',
        title: `${ready} prospeto${ready === 1 ? '' : 's'} pronto${ready === 1 ? '' : 's'} a inscrever`,
        sub: 'Confirmados no recrutamento — inscrever no plantel.',
      });
    }
  }

  if (canEdit('equipment') && equipmentNeedsAttention() > 0) {
    const n = equipmentNeedsAttention();
    items.push({
      variant: 'danger',
      route: 'equipamentos',
      title: `${n} equipamento${n === 1 ? '' : 's'} em mau estado`,
      sub: 'Rever ou substituir — abrir Equipamentos.',
    });
  }

  if (canEdit('players')) {
    const pend = pendingReviews();
    if (pend > 0 && state.players.length > 0) {
      items.push({
        variant: 'info',
        route: 'avaliacao',
        title: `${pend} avaliaç${pend === 1 ? 'ão' : 'ões'} de atleta por decidir`,
        sub: 'Definir quem fica para a próxima época — abrir Avaliação.',
      });
    }
  }

  return items;
}

function actionItem({ variant, title, sub, route }) {
  return `
    <li>
      <button class="alert-item alert-item--${variant} alert-item--nav" data-nav="${route}" type="button">
        <span class="alert-item__dot" aria-hidden="true"></span>
        <span class="alert-item__text">
          <strong class="alert-item__title">${esc(title)}</strong>
          <span class="muted alert-item__sub">${esc(sub)}</span>
        </span>
        <span class="alert-item__chevron" aria-hidden="true">›</span>
      </button>
    </li>
  `;
}

// Uma linha do atalho "Presenças por marcar".
function markRow({ event, total, marked, isToday }) {
  const team = teamById(event.team_id);
  const dt = eventDateTime(event);
  const dateLabel = isToday
    ? 'Hoje'
    : dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const range = eventTimeRange(event);
  const falta = Math.max(0, total - marked);
  const sub = total
    ? (marked === 0 ? `${total} atleta${total === 1 ? '' : 's'} por marcar`
       : `${falta} de ${total} por marcar`)
    : 'sem equipa associada';

  return `
    <li class="mark-item">
      <div class="mark-item__when">
        <span class="mark-item__date${isToday ? ' mark-item__date--today' : ''}">${esc(dateLabel)}</span>
        ${range ? `<span class="muted mark-item__time">${esc(range)}</span>` : ''}
      </div>
      <div class="mark-item__body">
        <span class="mark-item__title">${esc(team ? teamName(team) : (event.title || 'Treino'))}</span>
        <span class="muted mark-item__sub">${esc(sub)}</span>
      </div>
      <button class="btn btn--accent btn--sm" data-mark-event="${event.id}" type="button"
              ${total ? '' : 'disabled'}>Marcar</button>
    </li>
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
