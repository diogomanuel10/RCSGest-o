// Portal do atleta: vista pessoal, só de leitura e mobile-first.
// Mostra o calendário da equipa, as presenças do próprio e as suas quotas.
// O RLS garante que o atleta só recebe os seus próprios dados.

import { state } from '../store.js';
import { esc, euros, emptyHTML } from '../ui.js';
import {
  upcomingEvents,
  eventDateTime,
  eventTimeRange,
  teamById,
  teamName,
  playerAttendanceStats,
  playerQuotas,
  nextPlayerSquadEvent,
} from '../compute.js';
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  ATTENDANCE_STATUSES,
  MONTHS,
  SQUAD_STATUS_LABEL,
  SQUAD_STATUS_BADGE,
  AVAILABILITY_LABEL,
  AVAILABILITY_BADGE,
} from '../constants.js';

export function renderPortal(container) {
  // O atleta da conta atual (o RLS limita state.players ao próprio registo).
  const me = state.players.find((p) => p.user_id === state.profile?.id)
    || state.players[0]
    || null;

  if (!me) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">A minha página</h1>
        </div>
      </header>
      ${emptyHTML('A tua conta ainda não está associada a um atleta. Pede ao clube para te vincular.')}
    `;
    return;
  }

  const team = teamById(me.team_id);
  const upcoming = upcomingEvents(8);
  const att = playerAttendanceStats(me.id);
  const quotas = playerQuotas(me.id);
  const nextSquad = nextPlayerSquadEvent(me.id);
  const availability = state.availability.find((a) => a.player_id === me.id);

  const greeting = greet();
  const first = (me.name || '').split(/\s+/)[0] || '';

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting)}${first ? ', ' + esc(first) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">
          ${team ? esc(teamName(team)) : 'Sem equipa atribuída'}${me.number ? ` · Nº ${esc(me.number)}` : ''}
          ${me.position ? ` · ${esc(me.position)}` : ''}
        </p>
      </div>
    </header>

    ${(availability || nextSquad) ? `
    <div class="portal-highlights">
      ${availability ? `
        <div class="card portal-highlight">
          <span class="portal-highlight__label">Disponibilidade</span>
          <span class="badge badge--${AVAILABILITY_BADGE[availability.status] || 'muted'} portal-highlight__badge">
            ${esc(AVAILABILITY_LABEL[availability.status] || availability.status)}
          </span>
          ${availability.limitations ? `<p class="muted portal-highlight__note">${esc(availability.limitations)}</p>` : ''}
          ${availability.expected_return ? `<p class="muted portal-highlight__note">Retorno previsto: ${new Date(availability.expected_return + 'T00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })}</p>` : ''}
        </div>
      ` : ''}
      ${nextSquad ? `
        <div class="card portal-highlight">
          <span class="portal-highlight__label">Próximo jogo</span>
          <span class="badge badge--${SQUAD_STATUS_BADGE[nextSquad.status] || 'info'} portal-highlight__badge">
            ${esc(SQUAD_STATUS_LABEL[nextSquad.status] || nextSquad.status)}
          </span>
          <p class="muted portal-highlight__note">
            ${nextSquad.event.date
              ? new Date(nextSquad.event.date + 'T00:00').toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' })
              : '—'}
            ${nextSquad.event.opponent ? ` · vs ${esc(nextSquad.event.opponent)}` : ''}
          </p>
        </div>
      ` : ''}
    </div>
    ` : ''}

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos treinos e jogos</h2>
      ${upcoming.length
        ? `<ul class="portal-events">${upcoming.map(eventRow).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem eventos agendados.</p>'}
    </section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">As minhas presenças</h2>
      ${att.total
        ? `<div class="portal-att">
             <div class="portal-att__pct">
               <strong class="stat-pct ${pctClass(att.rate)}">${att.rate}%</strong>
               <span class="muted">comparência em ${att.total} treino${att.total === 1 ? '' : 's'}</span>
             </div>
             <div class="portal-att__chips">
               ${ATTENDANCE_STATUSES.map((s) => `<span class="badge badge--${s.badge}">${esc(s.label)}: ${att.counts[s.key]}</span>`).join('')}
             </div>
           </div>`
        : '<p class="muted" style="margin:0.3rem 0 0">Ainda sem registos de presença.</p>'}
    </section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">As minhas quotas</h2>
      ${quotas.list.length
        ? `<div class="portal-quotas-head">
             ${quotas.owedCount
               ? `<span class="badge badge--warn">${quotas.owedCount} por pagar · ${euros(quotas.owed)}</span>`
               : '<span class="badge badge--ok">Tudo regularizado</span>'}
             <span class="badge badge--muted">${quotas.paidCount} pago${quotas.paidCount === 1 ? '' : 's'}</span>
           </div>
           <ul class="portal-quota-list">${quotas.list.slice(0, 12).map(quotaLine).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem quotas registadas.</p>'}
    </section>
  `;
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

function pctClass(pct) {
  if (pct === null) return '';
  return pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
}

function eventRow(ev) {
  const dt = eventDateTime(ev);
  const day = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const range = eventTimeRange(ev);
  const meta = [
    ev.opponent ? `vs ${esc(ev.opponent)}` : '',
    ev.location ? esc(ev.location) : '',
  ].filter(Boolean).join(' · ');

  return `
    <li class="portal-event">
      <div class="portal-event__when">
        <span class="portal-event__date">${esc(day)}</span>
        ${range ? `<span class="muted portal-event__time">${esc(range)}</span>` : ''}
      </div>
      <div class="portal-event__body">
        <span class="portal-event__title">
          <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>
          ${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}
        </span>
        ${meta ? `<span class="muted portal-event__meta">${meta}</span>` : ''}
      </div>
    </li>
  `;
}

function quotaLine(q) {
  const mes = MONTHS[q.mes - 1] || q.mes;
  const pagoEm = q.pago_em
    ? new Date(q.pago_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
    : null;
  return `
    <li class="portal-quota-row">
      <span class="portal-quota-row__when">${esc(String(mes))} ${q.ano}</span>
      <span class="portal-quota-row__valor">${euros(Number(q.valor || 0))}</span>
      ${q.pago
        ? `<span class="badge badge--ok">Pago${pagoEm ? ' · ' + esc(pagoEm) : ''}</span>`
        : '<span class="badge badge--warn">Pendente</span>'}
    </li>
  `;
}
