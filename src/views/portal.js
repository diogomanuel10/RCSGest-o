// Portal do atleta: vista pessoal, só de leitura e mobile-first.
// Mostra o calendário da equipa, as presenças do próprio e as suas quotas.
// O RLS garante que o atleta só recebe os seus próprios dados.

import { state, respondToEvent, saveTacticalAnswer, dbErrorMessage } from '../store.js';
import { toastOk, toastError } from '../toast.js';
import { getNotifications } from '../notifications.js';
import { saveOfflineCard } from '../offline-card.js';
import { renderDrill, roleOf } from '../tactical-court.js';
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
  playerEventResponse, eventResponseWindow,
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
  TACTICAL_ROLE_LABEL,
  TACTICAL_ROLE_MATCH,
} from '../constants.js';

// Estado local: a atleta pediu para ver também os cenários de outras posições?
let drillsShowAll = false;

// A posição do cenário casa com a da atleta? O cruzamento é por palavra-chave
// porque `settings.positions` é configurável pelo clube — um chama-lhe
// "Distribuidor", outro "Passador", e nenhum tem de saber que isto existe.
// Sem posição na ficha, mostra-se tudo: é melhor do que esconder.
function roleMatchesPlayer(role, position) {
  const keys = TACTICAL_ROLE_MATCH[role];
  if (!keys || !keys.length) return true;   // ex.: serviço — toda a gente serve
  if (!position) return true;
  const p = position.toLowerCase();
  return keys.some((k) => p.includes(k));
}

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

  // Cenários de decisão tática publicados para ela. O RLS já só lhe entrega os
  // publicados da sua equipa (ou do clube); o filtro aqui é defensivo.
  const allDrills = (state.tacticalScenarios || []).filter(
    (sc) => sc.published && (!sc.team_id || sc.team_id === me.team_id)
  );
  // Por omissão mostram-se os da POSIÇÃO dela — é o que ela veio fazer. Mas
  // pode abrir os restantes: uma central perceber a decisão de quem lhe joga a
  // bola é provavelmente a coisa mais útil que aqui há.
  const mineDrills = allDrills.filter((sc) => roleMatchesPlayer(sc.role, me.position));
  const drills = drillsShowAll || !mineDrills.length ? allDrills : mineDrills;
  const otherCount = allDrills.length - mineDrills.length;
  const answered = new Set(
    (state.tacticalAnswers || []).filter((a) => a.player_id === me.id).map((a) => a.scenario_id)
  );

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

    ${drills.length ? `
    <section class="card">
      <h2 class="section-title upcoming-card__title">Decisão tática</h2>
      <p class="muted" style="margin:0.2rem 0 0.8rem;font-size:0.86rem">
        Lê o que se passa no campo e escolhe o que farias. Não há uma resposta
        certa — no fim vês o que o teu treinador pensa de cada opção.
      </p>
      <ul class="portal-drills">
        ${drills.map((sc) => `
          <li class="portal-drill">
            <div class="portal-drill__text">
              <span class="tb-tag tb-tag--role">${esc(TACTICAL_ROLE_LABEL[sc.role] || sc.role)}</span>
              <strong>${esc(sc.title)}</strong>
              ${answered.has(sc.id) ? '<span class="badge badge--muted">já respondeste</span>' : ''}
            </div>
            <button class="btn btn--sm btn--primary" data-drill="${sc.id}">
              ${answered.has(sc.id) ? 'Repetir' : 'Começar'}
            </button>
          </li>`).join('')}
      </ul>
      ${mineDrills.length && otherCount
        ? `<button class="btn btn--link" data-drills-toggle style="margin-top:0.6rem">
             ${drillsShowAll
               ? 'Mostrar só os da minha posição'
               : `Ver também os das outras posições (${otherCount})`}
           </button>`
        : ''}
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

  // Abrir um cenário de decisão tática. Corre num modal para ela ficar só com
  // o campo à frente — no telemóvel, o resto do portal à volta roubava-lhe o
  // ecrã precisamente no momento em que tem de ler o bloco.
  container.querySelector('[data-drills-toggle]')?.addEventListener('click', () => {
    drillsShowAll = !drillsShowAll;
    renderPortal(container);
  });

  container.querySelectorAll('[data-drill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sc = state.tacticalScenarios.find((x) => x.id === btn.dataset.drill);
      if (sc) openDrillModal(sc, me);
    });
  });

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
  // A janela de resposta: o treino fecha 6 h antes de começar. Fechada, os
  // botões ficam desativados com o motivo à vista — um botão que existe e dá
  // erro ao ser carregado é pior do que um botão que explica porque não dá.
  const win = eventResponseWindow(ev);
  const closedNote = win.open
    ? ''
    : win.started
      ? 'Já começou.'
      : `Respostas fechadas desde ${esc(deadlineText(win.deadline))} (até 6 h antes).`;

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
              ${win.open ? '' : 'disabled'}
              aria-pressed="${resp?.response === r.key}">
              ${esc(r.label)}
            </button>`).join('')}
        </div>
        ${closedNote ? `<span class="muted portal-event__meta">${closedNote}</span>` : ''}
      </div>
    </li>
  `;
}

// "hoje às 13:00" / "18/03 às 13:00" — o instante em que a janela de resposta
// fechou, para o atleta perceber que prazo é que falhou.
function deadlineText(dt) {
  const hora = dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date().toDateString() === dt.toDateString();
  const dia = hoje ? 'hoje' : dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  return `${dia} às ${hora}`;
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

// Modal do exercício de decisão tática.
//
// O exercício em si vem de `tactical-court.js` — é o MESMO código que o
// treinador vê ao pré-visualizar. Aqui só se trata do invólucro e de gravar a
// resposta.
//
// A gravação é silenciosa de propósito: a atleta não precisa de saber que
// ficou registado, e um aviso a dizer "resposta guardada" no momento em que
// ela está a ler a correção só a distraía do que interessa. Se falhar, também
// não se grita — o exercício valeu-lhe à mesma.
function openDrillModal(scenario, me) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-label="${esc(scenario.title)}">
      <button type="button" class="modal__close" aria-label="Fechar">&times;</button>
      <div data-drill-host></div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  let stop = null;
  const close = () => {
    stop?.();
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal__close').focus();

  stop = renderDrill(overlay.querySelector('[data-drill-host]'), scenario, {
    compact: true,
    onAnswer: (att) => {
      saveTacticalAnswer(scenario.id, me.id, att.id, att.verdict).catch(() => {});
    },
  });
}
