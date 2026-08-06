// Portal do atleta: vista pessoal, só de leitura e mobile-first.
// Mostra o calendário da equipa, as presenças do próprio e as suas quotas.
// O RLS garante que o atleta só recebe os seus próprios dados.

import { state, respondToEvent, dbErrorMessage } from '../store.js';
import { toastOk, toastError } from '../toast.js';
import { getNotifications } from '../notifications.js';
import { saveOfflineCard } from '../offline-card.js';
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
  playerEventResponse,
  playerRecentTrainings,
  playerRecentForm,
  playerUpcomingSquads,
} from '../compute.js';
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABEL,
  ATTENDANCE_BADGE,
  MONTHS,
  SQUAD_STATUS_LABEL,
  SQUAD_STATUS_BADGE,
  AVAILABILITY_LABEL,
  AVAILABILITY_BADGE,
  EVENT_RESPONSES,
  WEEKDAYS,
} from '../constants.js';

// Data curta para as listas: "Dom 02/08". Em pt-PT o `weekday: 'short'` do
// Intl devolve o nome inteiro ("domingo"), que parte a coluna em duas linhas —
// daí usar as abreviaturas que a app já tem para a recorrência dos treinos.
function shortDay(dt) {
  const wd = WEEKDAYS.find((w) => w.n === dt.getDay())?.label || '';
  const dm = dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  return `${wd} ${dm}`.trim();
}

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
  const recent = playerRecentTrainings(me.id, 8);
  const form = playerRecentForm(me.id, 5);
  const squads = playerUpcomingSquads(me.id, 5);
  // Avisos do clube: chegam pelas notificações (que o atleta já recebe no
  // sino e por push), mas repetem-se aqui porque é no portal que ele vive.
  const avisos = getNotifications()
    .filter((n) => n.type === 'club_announcement')
    .slice(0, 5);

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

    ${me.qr_token ? `
    <section class="card portal-qr">
      <h2 class="section-title upcoming-card__title">O meu cartão</h2>
      <p class="muted" style="margin:0.2rem 0 0.8rem;font-size:0.88rem">
        Mostra este código no quiosque à entrada do treino para ficares com a
        presença registada.
      </p>
      <div class="portal-qr__code" id="portal-qr" aria-label="O meu código QR"></div>
    </section>
    ` : ''}

    ${avisos.length ? `
    <section class="card">
      <h2 class="section-title upcoming-card__title">Avisos do clube</h2>
      <ul class="portal-avisos">
        ${avisos.map((n) => `
          <li class="portal-aviso${n.read_at ? '' : ' portal-aviso--novo'}">
            <strong class="portal-aviso__title">${esc(n.title)}</strong>
            <p class="portal-aviso__body">${esc(n.body)}</p>
            <span class="muted portal-aviso__when">${esc(whenText(n.created_at))}</span>
          </li>`).join('')}
      </ul>
    </section>
    ` : ''}

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos treinos e jogos</h2>
      <p class="muted" style="margin:0.2rem 0 0.6rem;font-size:0.86rem">
        Diz ao teu treinador se contas ir. Avisar não é justificar a falta —
        quem decide isso é ele.
      </p>
      ${upcoming.length
        ? `<ul class="portal-events">${upcoming.map((ev) => eventRow(ev, me.id)).join('')}</ul>`
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
             ${form
               ? `<span class="portal-att__form">
                    Últimos ${form.total}: <strong>${form.compareceu} de ${form.total}</strong>
                  </span>`
               : ''}
             <div class="portal-att__chips">
               ${ATTENDANCE_STATUSES.map((s) => `<span class="badge badge--${s.badge}">${esc(s.label)}: ${att.counts[s.key]}</span>`).join('')}
             </div>
           </div>
           ${recent.length
             ? `<ul class="portal-att-list">${recent.map(trainingRow).join('')}</ul>`
             : ''}`
        : '<p class="muted" style="margin:0.3rem 0 0">Ainda sem registos de presença.</p>'}
    </section>

    ${squads.length > 1 ? `
    <section class="card">
      <h2 class="section-title upcoming-card__title">As minhas convocatórias</h2>
      <ul class="portal-squads">${squads.map(squadRow).join('')}</ul>
    </section>
    ` : ''}

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

  // Responder a um evento. Um "não vou" pede o motivo: é o que transforma
  // uma falta anónima em informação útil para quem treina.
  container.querySelectorAll('[data-response]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const eventId = btn.dataset.event;
      const response = btn.dataset.response;
      let note = null;
      if (response === 'nao_vou') {
        note = prompt('Queres dizer porquê? (opcional)') ?? '';
      }
      const row = btn.closest('.portal-resp');
      row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        await respondToEvent(eventId, response, note || null);
        toastOk('Resposta enviada. O teu treinador já sabe.');
      } catch (err) {
        toastError(dbErrorMessage(err));
        row.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
    });
  });

  // O código QR é desenhado à parte: a biblioteca só é carregada para quem
  // tem cartão, e o resto do portal aparece sem esperar por ela.
  const qrEl = container.querySelector('#portal-qr');
  if (qrEl) {
    import('../qrcode.js')
      .then(({ qrSvg, qrPayload }) => qrSvg(qrPayload(me)))
      .then((svg) => {
        qrEl.innerHTML = svg;
        // Guarda-o no dispositivo: à entrada do pavilhão a rede falha, e é
        // precisamente aí que o cartão faz falta.
        saveOfflineCard({
          name: me.name,
          number: me.number,
          team: team ? teamName(team) : '',
          svg,
        });
      })
      .catch(() => {
        qrEl.innerHTML = '<p class="muted">Não foi possível desenhar o código.</p>';
      });
  }
}

// Uma linha do histórico de treinos: data + o que ficou registado.
// Um treino que ninguém fechou aparece como "sem registo" e não como falta —
// a diferença importa para o atleta, que não tem culpa do treino por fechar.
function trainingRow({ event, attendance }) {
  const day = shortDay(eventDateTime(event));
  const status = attendance?.status;
  const badge = status
    ? `<span class="badge badge--${ATTENDANCE_BADGE[status]}">${esc(ATTENDANCE_LABEL[status])}${
        status === 'atraso' && attendance.minutes_late ? ` ${attendance.minutes_late}'` : ''
      }</span>`
    : '<span class="badge badge--muted">Sem registo</span>';

  return `
    <li class="portal-att-row">
      <span class="portal-att-row__day">${esc(day)}</span>
      <span class="portal-att-row__title">${esc(event.title || 'Treino')}</span>
      ${badge}
    </li>
  `;
}

function squadRow({ event, status }) {
  const day = shortDay(eventDateTime(event));
  return `
    <li class="portal-att-row">
      <span class="portal-att-row__day">${esc(day)}</span>
      <span class="portal-att-row__title">
        ${event.opponent ? `vs ${esc(event.opponent)}` : esc(event.title || 'Jogo')}
      </span>
      <span class="badge badge--${SQUAD_STATUS_BADGE[status] || 'info'}">
        ${esc(SQUAD_STATUS_LABEL[status] || status)}
      </span>
    </li>
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

function eventRow(ev, playerId) {
  const dt = eventDateTime(ev);
  const day = shortDay(dt);
  const range = eventTimeRange(ev);
  const meta = [
    ev.opponent ? `vs ${esc(ev.opponent)}` : '',
    ev.location ? esc(ev.location) : '',
  ].filter(Boolean).join(' · ');

  const resp = playerEventResponse(playerId, ev.id);

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
        ${resp?.note ? `<span class="muted portal-event__meta">“${esc(resp.note)}”</span>` : ''}
        <div class="portal-resp" data-event="${esc(ev.id)}">
          ${EVENT_RESPONSES.map((r) => `
            <button type="button"
              class="portal-resp__btn portal-resp__btn--${r.key}${resp?.response === r.key ? ' is-active' : ''}"
              data-response="${r.key}" data-event="${esc(ev.id)}"
              aria-pressed="${resp?.response === r.key}">
              ${esc(r.label)}
            </button>`).join('')}
        </div>
      </div>
    </li>
  `;
}

// "há 2 dias" / "ontem" — para os avisos, onde a data exata interessa menos
// do que saber se é coisa de agora.
function whenText(iso) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' });
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
