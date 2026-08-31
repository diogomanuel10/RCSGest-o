// Portal do atleta: a vista pessoal, mobile-first.
//
// Quem abre isto abre para responder a uma de três perguntas — o que tenho a
// seguir, como vai a minha época, onde está o meu cartão. Por isso a página é
// um CABEÇALHO DE AÇÃO (o próximo compromisso, com os botões de resposta já à
// vista) seguido de três separadores, e não a pilha de nove secções com o
// mesmo peso que era antes: no telemóvel davam cinco ou seis ecrãs de scroll e
// a pergunta mais frequente ("a que horas é o treino?") ficava a meio deles.
//
// É de leitura, tirando as respostas a eventos e a decisão tática. O RLS
// garante que o atleta só recebe os seus próprios dados.

import { state, respondToEvent, saveTacticalAnswer, dbErrorMessage } from '../store.js';
import { toastOk, toastError } from '../toast.js';
import { getNotifications, markRead } from '../notifications.js';
import { openModal, wireDialog } from '../modal.js';
import { saveOfflineCard } from '../offline-card.js';
import { renderDrill } from '../tactical-court.js';
import { esc, euros, emptyHTML } from '../ui.js';
import {
  upcomingEvents,
  eventDateTime,
  eventTimeRange,
  teamById,
  teamName,
  playerAttendanceStats,
  playerQuotas,
  playerEventResponse, eventResponseWindow, canRespondToEvent,
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

// Estado local de UI, como nos filtros das outras vistas: sobrevive aos
// re-desenhos do store (uma resposta gravada não pode mandar o atleta de volta
// ao primeiro separador).
let portalTab = 'hoje';
let drillsShowAll = false;

// O SVG do cartão fica em cache pelo token: o portal re-desenha a cada
// notificação do store e não há razão para redesenhar o mesmo código QR.
let cardCache = { token: null, promise: null };

const PORTAL_TABS = [
  { key: 'hoje',   label: 'Hoje' },
  { key: 'epoca',  label: 'A época' },
  { key: 'cartao', label: 'Cartão', needsCard: true },
];

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

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "Hoje" / "Amanhã" / "Sexta-feira, 29 de agosto". No cabeçalho de ação a
// distância importa mais do que a data: quem abre o portal à segunda quer
// saber se é hoje, não que dia do mês é.
function relativeDay(dt) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(dt);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d - hoje) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return cap(dt.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' }));
}

// Os eventos que dizem respeito a este atleta: os da sua equipa e os do clube
// (`team_id` nulo). O RLS já entrega só estes, mas a vista não depende disso —
// é o mesmo recorte que decide quem pode responder ao quê.
function myUpcoming(me, limit) {
  return upcomingEvents(60)
    .filter((ev) => ev.team_id === me.team_id || ev.team_id == null)
    .slice(0, limit);
}

export function renderPortal(container) {
  // O atleta da conta atual. Sem correspondência NÃO se mostra outro registo:
  // o fallback para `state.players[0]` que aqui esteve dava as presenças, as
  // quotas e — pior — o cartão QR de outra pessoa a quem tivesse a conta ainda
  // por ligar. Um portal vazio é mau; o portal de outra atleta é grave.
  const me = state.players.find((p) => p.user_id && p.user_id === state.profile?.id) || null;

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
  const availability = state.availability.find((a) => a.player_id === me.id);
  const upcoming = myUpcoming(me, 8);
  const next = upcoming[0] || null;

  const tabs = PORTAL_TABS.filter((t) => !t.needsCard || me.qr_token);
  if (!tabs.some((t) => t.key === portalTab)) portalTab = tabs[0].key;

  // Tudo dentro de um invólucro próprio: o portal é uma coluna só, e a app
  // corre a largura toda de propósito (ver `.content__inner`). Num monitor,
  // cartões de dois mil píxeis para três linhas de texto ficavam desertos.
  container.innerHTML = `
    <div class="portal">
    ${heroHTML(me, team, availability)}
    ${nextUpHTML(next, me)}

    <div class="cal-toggle section-tabs portal-tabs" role="tablist" aria-label="Áreas da minha página">
      ${tabs.map((t) => `
        <button class="cal-toggle__btn ${portalTab === t.key ? 'cal-toggle__btn--active' : ''}"
                data-portal-tab="${t.key}" type="button" role="tab"
                aria-selected="${portalTab === t.key}">${esc(t.label)}</button>
      `).join('')}
    </div>

    <div id="portal-body">
      ${portalTab === 'hoje'   ? hojeHTML(me, upcoming) : ''}
      ${portalTab === 'epoca'  ? epocaHTML(me) : ''}
      ${portalTab === 'cartao' ? cartaoHTML() : ''}
    </div>
    </div>
  `;

  wire(container, me, team);
}

// --- Cabeçalho -----------------------------------------------------------

function heroHTML(me, team, availability) {
  const first = (me.name || '').split(/\s+/)[0] || '';
  const meta = [
    team ? teamName(team) : 'Sem equipa atribuída',
    me.number ? `Nº ${me.number}` : '',
    me.position || '',
  ].filter(Boolean).join(' · ');

  // A disponibilidade só aparece quando NÃO está tudo bem: dizer "Apto" a
  // quem está apto é ocupar o topo do ecrã com uma não-notícia. Quando há
  // limitações, é a primeira coisa que ela tem de ver.
  const alerta = availability && availability.status !== 'apto'
    ? `<div class="portal-hero__avail">
         <span class="badge badge--${AVAILABILITY_BADGE[availability.status] || 'muted'}">
           ${esc(AVAILABILITY_LABEL[availability.status] || availability.status)}
         </span>
         ${availability.limitations ? `<span class="portal-hero__avail-note">${esc(availability.limitations)}</span>` : ''}
         ${availability.expected_return
           ? `<span class="portal-hero__avail-note">Retorno previsto: ${esc(
               new Date(availability.expected_return + 'T00:00')
                 .toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })
             )}</span>`
           : ''}
       </div>`
    : '';

  return `
    <header class="portal-hero">
      <div class="portal-hero__id">
        <h1 class="portal-hero__greet">${esc(greet())}${first ? ', ' + esc(first) : ''}</h1>
        <p class="portal-hero__meta">${esc(meta)}</p>
      </div>
      ${alerta}
    </header>
  `;
}

// O bloco de ação: o próximo compromisso, com dia, hora, sítio e a resposta.
// É a razão pela qual a maior parte das pessoas abre isto, e por isso vive
// acima dos separadores — está lá seja qual for o separador escolhido.
function nextUpHTML(ev, me) {
  if (!ev) {
    return `
      <section class="card portal-next portal-next--vazio">
        <span class="portal-next__label">A seguir</span>
        <p class="portal-next__title">Sem nada agendado</p>
        <p class="portal-next__meta">Quando o teu treinador marcar o próximo treino ou jogo, aparece aqui.</p>
      </section>`;
  }

  const dt = eventDateTime(ev);
  const range = eventTimeRange(ev);
  const tipo = EVENT_TYPE_LABEL[ev.type] || ev.type;
  const titulo = ev.opponent ? `${tipo} vs ${ev.opponent}` : (ev.title || tipo);

  return `
    <section class="card portal-next portal-next--${esc(ev.type)}">
      <span class="portal-next__label">A seguir</span>
      <p class="portal-next__title">${esc(titulo)}</p>
      <p class="portal-next__when">
        <strong>${esc(relativeDay(dt))}</strong>${range ? ` · ${esc(range)}` : ''}
      </p>
      ${ev.location ? `<p class="portal-next__meta">${esc(ev.location)}</p>` : ''}
      ${responseHTML(ev, me, 'portal-resp--lg')}
    </section>
  `;
}

// --- Separador "Hoje" ----------------------------------------------------

function hojeHTML(me, upcoming) {
  // Avisos do clube: chegam pelas notificações (que o atleta já recebe no sino
  // e por push), mas repetem-se aqui porque é no portal que ele vive.
  const avisos = getNotifications()
    .filter((n) => n.type === 'club_announcement')
    .slice(0, 5);
  const porLer = avisos.filter((n) => !n.read_at);

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

  return `
    ${avisos.length ? `
    <section class="card portal-section">
      <div class="portal-section__head">
        <h2 class="section-title portal-section__title">Avisos do clube</h2>
        ${porLer.length
          ? `<button class="btn btn--ghost btn--xs" data-avisos-read type="button">Marcar lidos</button>`
          : ''}
      </div>
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
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">Decisão tática</h2>
      <p class="portal-section__note">
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
            <button class="btn btn--sm btn--primary" data-drill="${esc(sc.id)}">
              ${answered.has(sc.id) ? 'Repetir' : 'Começar'}
            </button>
          </li>`).join('')}
      </ul>
      ${mineDrills.length && otherCount
        ? `<button class="btn btn--link portal-section__more" data-drills-toggle type="button">
             ${drillsShowAll
               ? 'Mostrar só os da minha posição'
               : `Ver também os das outras posições (${otherCount})`}
           </button>`
        : ''}
    </section>
    ` : ''}

    <section class="card portal-section">
      <h2 class="section-title portal-section__title">Próximos treinos e jogos</h2>
      <p class="portal-section__note">
        Diz ao teu treinador se contas ir. Avisar não é justificar a falta —
        quem decide isso é ele.
      </p>
      ${upcoming.length
        ? `<ul class="portal-events">${upcoming.map((ev) => eventRow(ev, me)).join('')}</ul>`
        : '<p class="portal-section__note">Sem eventos agendados.</p>'}
    </section>
  `;
}

// --- Separador "A minha época" -------------------------------------------

function epocaHTML(me) {
  const att = playerAttendanceStats(me.id);
  const form = playerRecentForm(me.id, 5);
  const recent = playerRecentTrainings(me.id, 8);
  const squads = playerUpcomingSquads(me.id, 5);
  const quotas = playerQuotas(me.id);

  // Só os estados que aconteceram mesmo. A grelha com os quatro estados é
  // contabilidade de treinador: a um atleta sem faltas, três chips a zero só
  // enchem a linha e escondem o número que interessa.
  const chips = ATTENDANCE_STATUSES.filter((s) => att.counts[s.key] > 0);

  return `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">As minhas presenças</h2>
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
               ${chips.map((s) => `<span class="badge badge--${s.badge}">${esc(s.label)}: ${att.counts[s.key]}</span>`).join('')}
             </div>
           </div>
           ${recent.length
             ? `<ul class="portal-att-list">${recent.map(trainingRow).join('')}</ul>`
             : ''}`
        : '<p class="portal-section__note">Ainda sem registos de presença.</p>'}
    </section>

    ${squads.length ? `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">As minhas convocatórias</h2>
      <ul class="portal-squads">${squads.map(squadRow).join('')}</ul>
    </section>
    ` : ''}

    <section class="card portal-section">
      <h2 class="section-title portal-section__title">As minhas quotas</h2>
      ${quotas.list.length
        ? `<div class="portal-quotas-head">
             ${quotas.owedCount
               ? `<span class="badge badge--warn">${quotas.owedCount} por pagar · ${euros(quotas.owed)}</span>`
               : '<span class="badge badge--ok">Tudo regularizado</span>'}
             <span class="badge badge--muted">${quotas.paidCount} pago${quotas.paidCount === 1 ? '' : 's'}</span>
           </div>
           <ul class="portal-quota-list">${quotas.list.slice(0, 12).map(quotaLine).join('')}</ul>`
        : '<p class="portal-section__note">Sem quotas registadas.</p>'}
    </section>
  `;
}

// --- Separador "Cartão" --------------------------------------------------

function cartaoHTML() {
  return `
    <section class="card portal-section portal-qr">
      <h2 class="section-title portal-section__title">O meu cartão</h2>
      <p class="portal-section__note">
        Mostra este código no quiosque à entrada do treino para ficares com a
        presença registada.
      </p>
      <div class="portal-qr__code" id="portal-qr" aria-label="O meu código QR"></div>
      <p class="portal-section__note portal-qr__note">
        Fica guardado neste dispositivo — se o pavilhão não tiver rede, o
        cartão aparece na mesma.
      </p>
    </section>
  `;
}

// --- Ligações -------------------------------------------------------------

function wire(container, me, team) {
  container.querySelectorAll('[data-portal-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      portalTab = b.dataset.portalTab;
      renderPortal(container);
    })
  );

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

  container.querySelector('[data-avisos-read]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const porLer = getNotifications().filter((n) => n.type === 'club_announcement' && !n.read_at);
    try {
      await Promise.all(porLer.map((n) => markRead(n.id)));
      renderPortal(container);
    } catch (err) {
      toastError(dbErrorMessage(err));
      btn.disabled = false;
    }
  });

  container.querySelectorAll('[data-response]').forEach((btn) => {
    btn.addEventListener('click', () => onRespond(btn));
  });

  // O código QR é desenhado à parte: a biblioteca só é carregada para quem tem
  // cartão, e o resto do portal aparece sem esperar por ela.
  //
  // Corre SEMPRE que o portal abre, mesmo com o separador do cartão fechado:
  // é à porta do pavilhão, sem rede, que o cartão faz falta, e nessa altura já
  // não há como o ir buscar. Só o desenho no ecrã depende do separador.
  if (me.qr_token) {
    cardSvg(me)
      .then((svg) => {
        saveOfflineCard({
          name: me.name,
          number: me.number,
          team: team ? teamName(team) : '',
          svg,
        });
        // A promessa pode resolver depois de outro re-desenho: procura-se o
        // destino no DOM vivo, e se já não existir não há nada a fazer.
        const host = container.querySelector('#portal-qr');
        if (host) host.innerHTML = svg;
      })
      .catch(() => {
        const host = container.querySelector('#portal-qr');
        if (host) host.innerHTML = '<p class="muted">Não foi possível desenhar o código.</p>';
      });
  }
}

function cardSvg(me) {
  if (cardCache.token === me.qr_token && cardCache.promise) return cardCache.promise;
  cardCache = {
    token: me.qr_token,
    promise: import('../qrcode.js').then(({ qrSvg, qrPayload }) => qrSvg(qrPayload(me))),
  };
  return cardCache.promise;
}

// Responder a um evento. Um "não vou" pede o motivo — é o que transforma uma
// falta anónima em informação útil para quem treina — e pede-o num modal da
// app e não no `prompt()` do browser: uma caixa cinzenta do sistema, sem o
// guarda de fecho nem os estilos que o resto da Rumia usa.
//
// A gravação acontece DENTRO do `onSubmit`, para o modal ficar aberto e
// mostrar o erro se falhar (é o que o `openModal` faz), e para cancelar não
// deixar os botões presos à espera de uma resposta que não vem.
function onRespond(btn) {
  const eventId = btn.dataset.event;
  const response = btn.dataset.response;
  const row = btn.closest('.portal-resp');

  if (response === 'nao_vou') {
    openModal({
      title: 'Avisar que não vais',
      submitLabel: 'Enviar',
      fields: [{
        name: 'note',
        label: 'Motivo',
        type: 'textarea',
        full: true,
        hint: 'Opcional. Ajuda o treinador a saber com que plantel conta.',
      }],
      onSubmit: async (values) => {
        try {
          await respondToEvent(eventId, 'nao_vou', (values.note || '').trim() || null);
        } catch (err) {
          throw new Error(dbErrorMessage(err));
        }
        toastOk('Resposta enviada. O teu treinador já sabe.');
      },
    });
    return;
  }

  row?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  respondToEvent(eventId, response, null)
    .then(() => toastOk('Resposta enviada. O teu treinador já sabe.'))
    .catch((err) => {
      toastError(dbErrorMessage(err));
      row?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    });
}

// --- Linhas e blocos reutilizados ----------------------------------------

// Os botões de resposta de um evento, ou a razão pela qual não existem.
// Um evento do CLUBE (sem equipa) não se responde: o `respond_to_event`
// recusa-o, e um botão que só serve para dar erro é pior do que não haver
// botão nenhum — diz-se antes o que é aquilo.
function responseHTML(ev, me, extraClass = '') {
  if (!canRespondToEvent(me, ev)) {
    return '<p class="portal-resp-note">Evento do clube — não é preciso responder.</p>';
  }

  const resp = playerEventResponse(me.id, ev.id);
  // A janela de resposta: o treino fecha 6 h antes de começar. Fechada, os
  // botões ficam desativados com o motivo à vista.
  const win = eventResponseWindow(ev);
  const closedNote = win.open
    ? ''
    : win.started
      ? 'Já começou.'
      : `Respostas fechadas desde ${esc(deadlineText(win.deadline))} (até 6 h antes).`;

  return `
    <div class="portal-resp ${extraClass}" data-event="${esc(ev.id)}">
      ${EVENT_RESPONSES.map((r) => `
        <button type="button"
          class="portal-resp__btn portal-resp__btn--${r.key}${resp?.response === r.key ? ' is-active' : ''}"
          data-response="${r.key}" data-event="${esc(ev.id)}"
          ${win.open ? '' : 'disabled'}
          aria-pressed="${resp?.response === r.key}">
          ${esc(r.label)}
        </button>`).join('')}
    </div>
    ${resp?.note ? `<p class="portal-resp-note">“${esc(resp.note)}”</p>` : ''}
    ${closedNote ? `<p class="portal-resp-note">${closedNote}</p>` : ''}
  `;
}

function eventRow(ev, me) {
  const dt = eventDateTime(ev);
  const day = shortDay(dt);
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
        ${responseHTML(ev, me)}
      </div>
    </li>
  `;
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
  let stop = null;
  const close = wireDialog(overlay, { onClose: () => stop?.() });
  overlay.querySelector('.modal__close').focus();

  stop = renderDrill(overlay.querySelector('[data-drill-host]'), scenario, {
    compact: true,
    onAnswer: (att) => {
      saveTacticalAnswer(scenario.id, me.id, att.id, att.verdict).catch(() => {});
    },
  });
}
