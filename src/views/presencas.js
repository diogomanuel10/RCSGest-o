// Vista: Presenças — quem apareceu, um treino de cada vez.
//
// Treinos e sessões de musculação. Os JOGOS saíram daqui: a convocatória é um
// passo do jogo e vive na secção Jogos (`convocatoria.js`). Misturar os dois
// no mesmo seletor punha um jogo de sábado entre vinte treinos, e o ecrã
// mudava de forma conforme a linha escolhida.
//
// A separação também é de números, e não só de ecrã: `attendanceStats` conta
// TODAS as presenças que existirem, e marcar presenças em jogos misturaria
// comparência ao treino com participação em jogo — dois números que a app usa
// para coisas opostas (ver `trainingVsPlayingGaps`). Quem jogou mede-se em
// pontos, no registo do resultado.
//
// Uma sessão FECHA-SE sozinha ao fim de `settings.attendance_auto_close_days`
// (3 por omissão; `supabase/fecho-presencas.sql`): quem ficou sem registo
// passa a falta. Só fecha a que tem pelo menos um registo — um treino sem
// registo nenhum é um treino que ninguém marcou, não um a que ninguém foi — e
// fechar não bloqueia: uma falta continua a poder passar a justificada.

import { state, upsertAttendance, closeAttendanceSession, markAllPresent, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName, eventResponseSummary,
         playerEventResponse, eventRoster, isMyEvent, myTeams } from '../compute.js';
import { ATTENDANCE_STATUSES, ATTENDANCE_LABEL, ATTENDANCE_BADGE,
         EVENT_TYPE_LABEL, isPickedEvent,
         EVENT_RESPONSE_LABEL, EVENT_RESPONSE_BADGE } from '../constants.js';
import { canMarkAttendance } from '../permissions.js';
import { confirmDialog, wireDialog } from '../modal.js';
import { toastError } from '../toast.js';
import { openAthleteProfile } from './athlete-profile.js';

let selectedEventId = null;
let presTab = 'sessao'; // 'sessao' | 'estatisticas'
let summaryTeamId = '';
// Período das estatísticas: '' = toda a época, ou 'YYYY-MM' para um mês.
let summaryMonth = '';
let showAllPending = false;

// Quantas linhas do "Por fechar" se mostram antes do "Mostrar mais".
const PENDING_LIMIT = 6;

// Pré-seleciona um treino (usado pelos atalhos do Painel e do Calendário).
export function setSelectedEvent(id) {
  selectedEventId = id;
  presTab = 'sessao';
}

// Ao fim de quantos dias a sessão fecha sozinha — ou null se a migração
// `fecho-presencas.sql` ainda não correu. Sem ela não há quem feche, e dizer
// "fecha a 29 out" seria uma promessa que ninguém cumpre.
function autoCloseDays() {
  if (!('attendance_auto_close_days' in state.settings)) return null;
  return Number(state.settings.attendance_auto_close_days) || 3;
}
function autoCloseDate(ev) {
  const days = autoCloseDays();
  if (days == null) return null;
  const d = new Date(`${ev.date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d;
}
// Já acabou? O treino das 18:30 que está a decorrer não está "por fechar".
// Sem hora de fim, conta-se hora e meia.
function eventEnded(ev) {
  const end = ev.end_time && /^\d{2}:\d{2}/.test(ev.end_time)
    ? new Date(`${ev.date}T${ev.end_time.slice(0, 5)}:00`)
    : new Date(eventDateTime(ev).getTime() + 90 * 60 * 1000);
  return end <= new Date();
}
const shortDate = (d) => d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).replace('.', '');

// Registos de um evento, contados SÓ entre quem lá devia estar: uma presença
// de uma atleta que entretanto mudou de equipa não torna a sessão "completa".
function sessionCounts(ev) {
  const roster = eventRoster(ev);
  const ids = new Set(roster.map((p) => p.id));
  const marked = state.attendances.filter((a) => a.event_id === ev.id && ids.has(a.player_id)).length;
  return { total: roster.length, marked };
}

// O estado do fecho de uma sessão passada, numa frase.
function closeNote(ev, { marked, total }) {
  if (!total || marked >= total || eventDateTime(ev) > new Date()) return '';
  if (!marked) return 'Sem nenhum registo — não fecha sozinha: falta marcar quem veio.';
  const at = autoCloseDate(ev);
  if (!at) return '';
  return at <= new Date()
    ? 'Fecha esta noite: quem ficar sem registo passa a falta.'
    : `Fecha automaticamente a ${shortDate(at)}: quem ficar sem registo passa a falta.`;
}

export function renderPresencas(container) {
  // Treinos e sessões de musculação. A musculação entra aqui porque o gesto é o
  // mesmo (quem apareceu), e não porque seja um treino da equipa: o plantel
  // dela é o grupo escolhido para aquele horário, e a comparência que conta
  // para a equipa continua a ser só a dos treinos (ver `attendanceStats`).
  // Ao treinador só os das SUAS equipas (`isMyEvent`): os treinos dos outros
  // escalões não são trabalho dele, e no seletor eram metade das linhas.
  const eventos = state.events
    .filter((e) => (e.type === 'treino' || e.type === 'musculacao') && isMyEvent(e))
    .sort((a, b) => eventDateTime(b) - eventDateTime(a));

  const header = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Presenças</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Quem apareceu aos treinos e às sessões de musculação</p>
      </div>
      <span id="pres-head-action"></span>
    </header>`;

  if (!eventos.length) {
    container.innerHTML = `${header}
      ${emptyHTML('Ainda não há treinos no Calendário. A convocatória dos jogos está na secção Jogos.')}`;
    return;
  }

  const tabBar = `
    <div class="pres-tabs">
      <button class="pres-tab${presTab === 'sessao' ? ' pres-tab--active' : ''}" data-tab="sessao" type="button">Marcar</button>
      <button class="pres-tab${presTab === 'estatisticas' ? ' pres-tab--active' : ''}" data-tab="estatisticas" type="button">Estatísticas</button>
    </div>
  `;

  if (presTab === 'estatisticas') {
    renderSummary(container, tabBar);
    container.querySelectorAll('[data-tab]').forEach((btn) =>
      btn.addEventListener('click', () => { presTab = btn.dataset.tab; renderPresencas(container); })
    );
    return;
  }

  if (!selectedEventId || !eventos.some((e) => e.id === selectedEventId)) {
    // Por omissão, o evento mais PERTO de agora — não o mais recente da lista.
    // Numa época inteira, "o mais recente" no fim de agosto é um treino de maio.
    selectedEventId = nearestEvent(eventos).id;
  }

  const now = new Date();
  const counts = new Map(eventos.map((e) => [e.id, sessionCounts(e)]));

  // Por fechar: o que já passou, é de quem está a ver e tem registos em falta.
  // Era preciso ir procurá-los num seletor com a época inteira; o Painel do
  // coordenador contava-os, mas o ecrã onde se fecham não os mostrava.
  const pending = eventos.filter((e) => {
    const c = counts.get(e.id);
    return eventEnded(e) && canMarkAttendance(e) && c.total && c.marked < c.total;
  });

  const ev = eventos.find((e) => e.id === selectedEventId);
  const isPicked = isPickedEvent(ev);
  const editable = canMarkAttendance(ev);
  const team = teamById(ev?.team_id);
  // Quem entra neste evento: a equipa, ou — na musculação — só o grupo daquele
  // horário. É a mesma função que o portal e as notificações usam.
  const players = eventRoster(ev);

  const tally = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
  const attendanceMap = {};
  state.attendances
    .filter((a) => a.event_id === selectedEventId)
    .forEach((a) => {
      attendanceMap[a.player_id] = a;
      tally[a.status] = (tally[a.status] || 0) + 1;
    });

  const { total: totalPlayers, marked } = counts.get(ev.id);
  const pct = totalPlayers ? Math.round((marked / totalPlayers) * 100) : 0;
  const started = eventDateTime(ev) <= new Date(now.getTime() + 60 * 60 * 1000);

  // "Todos presentes" marca quem ainda não tem registo — e salta quem avisou
  // que não vinha: marcar presente a quem disse que faltava é o engano que
  // depois ninguém repara.
  const avisos = eventResponseSummary(selectedEventId);
  const avisouIds = new Set(avisos.ausentes.map((a) => a.player.id));
  const toPresent = players.filter((p) => !attendanceMap[p.id] && !avisouIds.has(p.id));

  const dateStr = eventDateTime(ev).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' });

  // O quiosque procura o TREINO da equipa do atleta mais perto de agora
  // (`check_in_by_qr`): numa sessão de musculação não teria onde marcar, por
  // isso não se oferece — um botão que dá erro é pior do que botão nenhum.
  const qrOn = editable && !isPicked && state.settings.qr_checkin_enabled === true;
  const note = closeNote(ev, { marked, total: totalPlayers });

  const shownPending = showAllPending ? pending : pending.slice(0, PENDING_LIMIT);

  container.innerHTML = `
    ${header.replace('<span id="pres-head-action"></span>', qrOn
      ? '<button class="btn btn--primary" id="pres-kiosk" type="button">Modo quiosque</button>' : '')}

    ${tabBar}

    ${pending.length ? `
      <section class="card pres-pending">
        <h2 class="section-title pres-pending__title">Por fechar <span class="muted">${pending.length}</span></h2>
        <ul class="pres-pending__list">
          ${shownPending.map((e) => {
            const c = counts.get(e.id);
            const n = closeNote(e, c);
            return `<li>
              <button type="button" class="pres-pending__item${e.id === selectedEventId ? ' is-active' : ''}" data-pick-event="${esc(e.id)}">
                <span class="pres-pending__label">${esc(shortLabel(e))}</span>
                <span class="badge badge--${c.marked ? 'warn' : 'danger'}">${c.marked}/${c.total}</span>
                ${n ? `<span class="muted pres-pending__note">${esc(n)}</span>` : ''}
              </button></li>`;
          }).join('')}
        </ul>
        ${pending.length > shownPending.length
          ? `<button class="btn btn--ghost btn--sm" id="pres-more" type="button">Mostrar os restantes ${pending.length - shownPending.length}</button>` : ''}
      </section>` : ''}

    <div class="presenca-picker card" style="margin-bottom:1.2rem">
      <div class="row row--between row--wrap" style="gap:0.8rem">
        <div style="min-width:260px;flex:1">
          <label for="pres-event">Treino ou sessão de musculação</label>
          <select id="pres-event">
            ${eventPickerHTML(eventos, selectedEventId, counts)}
          </select>
        </div>
        <div class="presenca-meta muted" style="font-size:0.86rem;align-self:flex-end;padding-bottom:0.1rem">
          ${team ? `<strong>${esc(teamName(team))}</strong> · ` : ''}${esc(dateStr)}${eventTimeRange(ev) ? ' · ' + esc(eventTimeRange(ev)) : ''}
          ${isPicked ? '<br>Sessão de musculação — só os atletas deste horário.' : ''}
        </div>
      </div>
    </div>

    ${avisos.ausentes.length
      ? `<div class="card pres-avisos">
           <strong class="pres-avisos__title">
             ${avisos.ausentes.length} avisaram que não vêm
           </strong>
           <ul class="pres-avisos__list">
             ${avisos.ausentes.map((a) => `
               <li>
                 <span class="pres-avisos__name">${esc(a.player.name)}</span>
                 ${a.note ? `<span class="muted">— ${esc(a.note)}</span>` : '<span class="muted">— sem motivo indicado</span>'}
               </li>`).join('')}
           </ul>
           <p class="muted pres-avisos__hint">Um aviso não é uma justificação: decide tu — na linha de cada um há "Justificar com o aviso".</p>
         </div>`
      : ''}

    <section class="cards-grid aval-summary" style="margin-bottom:1.2rem">
      ${summaryCard('Presentes', tally.presente, 'green')}
      ${summaryCard('Atrasos', tally.atraso, 'warn')}
      ${summaryCard('Justificados', tally.justificado, 'info')}
      ${summaryCard('Faltas', tally.falta, 'red')}
    </section>

    <section class="card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">${isPicked ? 'Atletas deste horário' : 'Lista de atletas'}</h2>
        <span class="goal-card__pct">${marked}/${totalPlayers} · ${pct}% registado</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>

      ${editable && team && totalPlayers && marked < totalPlayers && started
        ? `<div class="row row--between row--wrap pres-close">
             <span class="muted" style="font-size:0.85rem">
               ${totalPlayers - marked} atleta${totalPlayers - marked === 1 ? '' : 's'} sem registo.
               ${note ? `<br>${esc(note)}` : ''}
             </span>
             <span class="row" style="gap:0.4rem;flex-wrap:wrap">
               ${toPresent.length
                 ? `<button class="btn btn--primary btn--sm" id="pres-all" type="button"
                      title="Marca presente quem ainda não tem registo${avisouIds.size ? ' (exceto quem avisou que não vinha)' : ''}">Todos presentes (${toPresent.length})</button>`
                 : ''}
               <button class="btn btn--ghost btn--sm" id="pres-close" type="button">Fechar já (marcar faltas)</button>
             </span>
           </div>`
        : ''}

      ${!team
        ? '<p class="muted" style="margin:1rem 0 0">Este treino não tem equipa associada. Edita-o no Calendário para atribuir uma equipa.</p>'
        : !players.length
        ? `<p class="muted" style="margin:1rem 0 0">${isPicked
             ? 'Esta sessão ainda não tem atletas escolhidos. Edita-a no Calendário para escolher quem entra.'
             : 'Sem atletas nesta equipa.'}</p>`
        : `<ul class="pres-list">${players.map((p) => playerRow(p, attendanceMap[p.id], ev, editable)).join('')}</ul>`
      }
    </section>
  `;

  container.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => { presTab = btn.dataset.tab; renderPresencas(container); })
  );

  container.querySelector('#pres-event').addEventListener('change', (e) => {
    selectedEventId = e.target.value;
    renderPresencas(container);
  });
  container.querySelectorAll('[data-pick-event]').forEach((b) => b.addEventListener('click', () => {
    selectedEventId = b.dataset.pickEvent;
    renderPresencas(container);
  }));
  container.querySelector('#pres-more')?.addEventListener('click', () => { showAllPending = true; renderPresencas(container); });

  // O quiosque (câmara + descodificador de QR) só é carregado a quem o abre.
  container.querySelector('#pres-kiosk')?.addEventListener('click', async () => {
    const { openQuiosque } = await import('./quiosque.js');
    openQuiosque(selectedEventId);
  });

  if (editable) {
    container.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () =>
        handleStatusClick(btn, container, ev)
      );
    });
    container.querySelectorAll('[data-justify-aviso]').forEach((btn) => btn.addEventListener('click', () => {
      const r = playerEventResponse(btn.dataset.justifyAviso, selectedEventId);
      saveAttendance(btn.dataset.justifyAviso, {
        status: 'justificado', justification: r?.note || 'Avisou que não vinha.', minutes_late: null,
      }, container);
    }));
    container.querySelector('#pres-close')?.addEventListener('click', () =>
      closeSession(selectedEventId, totalPlayers - marked)
    );
    container.querySelector('#pres-all')?.addEventListener('click', async () => {
      try {
        await markAllPresent(selectedEventId, toPresent.map((p) => p.id));
      } catch (err) {
        toastError(dbErrorMessage(err));
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Seletor do evento
// ---------------------------------------------------------------------------
// A lista estava ordenada do mais recente para o mais antigo, e à quinta
// jornada isso quer dizer que o treino de hoje está a meio de duzentas linhas:
// para marcar as presenças do dia era preciso deslizar a lista inteira. A
// ordem passa a ser a DISTÂNCIA A HOJE, em três grupos — hoje, o que vem a
// seguir, e o passado do mais recente para trás. Assim o que se procura em
// 95% das visitas (hoje, ou o treino de ontem que ficou por fechar) está
// sempre no topo.
function eventLabel(ev) {
  const dt = eventDateTime(ev).toLocaleDateString('pt-PT', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const tm = teamById(ev.team_id);
  const range = eventTimeRange(ev);
  const tipo = EVENT_TYPE_LABEL[ev.type] || 'Treino';
  const title = ev.title && ev.title !== tipo ? ' — ' + ev.title : '';
  return `${tipo} · ${dt}${range ? ' ' + range : ''}${tm ? ' — ' + teamName(tm) : ''}${title}`;
}

// "YYYY-MM-DD" no fuso do utilizador (o mesmo formato de `events.date`).
function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Divide os eventos em hoje / futuros (ascendente) / passados (descendente).
function eventGroups(eventos) {
  // Data local e não `toISOString()`: em Portugal, no verão, à meia-noite e
  // meia o UTC ainda está no dia anterior — e o treino de hoje aparecia em
  // "Anteriores".
  const hojeStr = localDate(new Date());
  const hoje = [];
  const proximos = [];
  const anteriores = [];
  eventos.forEach((e) => {
    if (e.date === hojeStr) hoje.push(e);
    else if (e.date > hojeStr) proximos.push(e);
    else anteriores.push(e);
  });
  hoje.sort((a, b) => eventDateTime(a) - eventDateTime(b));
  proximos.sort((a, b) => eventDateTime(a) - eventDateTime(b));
  anteriores.sort((a, b) => eventDateTime(b) - eventDateTime(a));
  return { hoje, proximos, anteriores };
}

// O evento mais perto de agora, em qualquer direção.
function nearestEvent(eventos) {
  const now = Date.now();
  return eventos.reduce((best, e) =>
    Math.abs(eventDateTime(e) - now) < Math.abs(eventDateTime(best) - now) ? e : best
  , eventos[0]);
}

// Rótulo curto para a lista "Por fechar": dia, hora e equipa.
function shortLabel(ev) {
  const dt = eventDateTime(ev).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const tm = teamById(ev.team_id);
  const kind = ev.type === 'musculacao' ? 'Musculação · ' : '';
  return `${kind}${dt}${ev.time ? ' ' + ev.time.slice(0, 5) : ''}${tm ? ' — ' + teamName(tm) : ''}`;
}

// No seletor, cada sessão que já começou diz quantos registos tem ("12/18"):
// uma sessão por fechar lê-se sem a abrir.
function eventPickerHTML(eventos, selectedId, counts) {
  const { hoje, proximos, anteriores } = eventGroups(eventos);
  const now = new Date();
  const opt = (e) => {
    const c = counts.get(e.id);
    const tag = c && c.total && eventDateTime(e) <= now ? ` · ${c.marked}/${c.total}` : '';
    return `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${esc(eventLabel(e) + tag)}</option>`;
  };
  const group = (label, list) =>
    list.length ? `<optgroup label="${esc(label)}">${list.map(opt).join('')}</optgroup>` : '';
  return group('Hoje', hoje) + group('Próximos', proximos) + group('Anteriores', anteriores);
}

// O que o atleta respondeu ao evento. É informação DELE, separada do estado
// que o treinador atribui.
function respostaHTML(playerId, event) {
  const r = playerEventResponse(playerId, event?.id);
  if (!r) return '';
  return `<span class="pres-detail"><span class="badge badge--${EVENT_RESPONSE_BADGE[r.response]}">${
    esc(EVENT_RESPONSE_LABEL[r.response])}</span>${r.note ? ' ' + esc(r.note) : ''}</span>`;
}

// "Fechar sessão": quem não passou o cartão nem foi marcado fica em falta.
// É o passo que fecha o ciclo do quiosque — sem ele, ausentes ficavam apenas
// "sem registo", que não conta para a taxa de comparência.
async function closeSession(eventId, missing) {
  const ok = await confirmDialog(
    `Marcar falta a ${missing} atleta${missing === 1 ? '' : 's'} sem registo neste treino? Quem já tem estado não é alterado.`,
    { confirmLabel: 'Marcar faltas', danger: false }
  );
  if (!ok) return;
  try {
    await closeAttendanceSession(eventId);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

function summaryCard(label, value, variant) {
  return `
    <div class="card metric metric--${variant} aval-metric">
      <span class="metric__label">${esc(label)}</span>
      <strong class="metric__value">${value}</strong>
    </div>
  `;
}

function playerRow(player, attendance, event, editable) {
  const current = attendance?.status || null;
  return `
    <li class="pres-row pres-row--${current || 'none'}" data-player-row="${player.id}">
      <div class="aval-row__player">
        <span class="aval-row__num">${esc(player.number || '—')}</span>
        <div>
          <span class="aval-row__name">${esc(player.name)}</span>
          <span class="muted aval-row__meta">${[player.position, player.birth_year].filter(Boolean).map(esc).join(' · ') || '—'}</span>
          ${respostaHTML(player.id, event)}
          ${editable && current !== 'justificado' && playerEventResponse(player.id, event?.id)?.response === 'nao_vou'
            ? `<button type="button" class="btn btn--ghost btn--sm pres-justify" data-justify-aviso="${player.id}"
                 title="Marca justificado, com o motivo que o atleta deu">Justificar com o aviso</button>`
            : ''}
          ${attendance?.minutes_late != null ? `<span class="pres-detail">${attendance.minutes_late} min de atraso</span>` : ''}
          ${attendance?.justification ? `<span class="pres-detail">${esc(attendance.justification)}</span>` : ''}
          ${attendance?.source === 'qr'
            ? `<span class="pres-detail pres-detail--qr" title="Registado pelo cartão QR no quiosque">Cartão QR${
                attendance.checked_in_at
                  ? ' · ' + new Date(attendance.checked_in_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
                  : ''
              }</span>`
            : ''}
        </div>
      </div>
      ${editable
        ? `<div class="pres-actions">
            ${ATTENDANCE_STATUSES.map((s) => `
              <button type="button"
                class="pres-btn pres-btn--${s.key} ${current === s.key ? 'is-active' : ''}"
                data-status="${s.key}"
                data-player="${player.id}"
                title="${s.label}">
                ${s.label}
              </button>`).join('')}
           </div>`
        : current
          ? `<span class="badge badge--${ATTENDANCE_BADGE[current]}">${esc(ATTENDANCE_LABEL[current])}</span>`
          : '<span class="badge badge--muted">—</span>'
      }
    </li>
  `;
}

async function handleStatusClick(btn, container, event) {
  const playerId = btn.dataset.player;
  const status = btn.dataset.status;

  if (status === 'justificado') {
    showJustificationInput(btn, playerId, container, event);
    return;
  }

  if (status === 'atraso') {
    showDelayInput(btn, playerId, container, event);
    return;
  }

  await saveAttendance(playerId, { status }, container);
}

function showJustificationInput(btn, playerId, container, event) {
  // Remove any existing inline form
  container.querySelectorAll('.pres-inline').forEach((el) => el.remove());

  const row = btn.closest('[data-player-row]');
  const form = document.createElement('div');
  form.className = 'pres-inline';
  form.innerHTML = `
    <div class="pres-inline__inner">
      <textarea class="pres-inline__text" placeholder="Motivo da justificação…" rows="2"></textarea>
      <div class="row" style="gap:0.4rem;margin-top:0.5rem">
        <button type="button" class="btn btn--primary btn--sm" data-confirm>Guardar</button>
        <button type="button" class="btn btn--ghost btn--sm" data-dismiss>Cancelar</button>
      </div>
    </div>
  `;
  row.insertAdjacentElement('afterend', form);
  form.querySelector('textarea').focus();

  form.querySelector('[data-dismiss]').addEventListener('click', () => form.remove());
  form.querySelector('[data-confirm]').addEventListener('click', async () => {
    const text = form.querySelector('textarea').value.trim();
    form.remove();
    await saveAttendance(playerId, { status: 'justificado', justification: text || null }, container);
  });
}

function showDelayInput(btn, playerId, container, event) {
  container.querySelectorAll('.pres-inline').forEach((el) => el.remove());

  // Auto-calcular minutos de atraso com base na hora do evento
  let autoMinutes = null;
  if (event?.time) {
    const [h, m] = event.time.split(':').map(Number);
    const start = new Date(event.date + 'T' + event.time + ':00');
    const now = new Date();
    const diff = Math.round((now - start) / 60000);
    if (diff > 0) autoMinutes = diff;
  }

  const row = btn.closest('[data-player-row]');
  const form = document.createElement('div');
  form.className = 'pres-inline';
  form.innerHTML = `
    <div class="pres-inline__inner">
      <label style="font-size:0.8rem;font-weight:600;color:var(--text-muted);margin-bottom:0.3rem;display:block">
        Minutos de atraso
        ${autoMinutes != null ? `<span style="font-weight:400">(calculado: ${autoMinutes} min)</span>` : ''}
      </label>
      <input type="number" class="pres-inline__num" min="1" max="120"
             value="${autoMinutes ?? ''}" placeholder="ex.: 10" style="max-width:120px" />
      <div class="row" style="gap:0.4rem;margin-top:0.5rem">
        <button type="button" class="btn btn--primary btn--sm" data-confirm>Guardar</button>
        <button type="button" class="btn btn--ghost btn--sm" data-dismiss>Cancelar</button>
      </div>
    </div>
  `;
  row.insertAdjacentElement('afterend', form);
  form.querySelector('input').focus();
  if (autoMinutes != null) form.querySelector('input').select();

  form.querySelector('[data-dismiss]').addEventListener('click', () => form.remove());
  form.querySelector('[data-confirm]').addEventListener('click', async () => {
    const mins = parseInt(form.querySelector('input').value, 10) || 0;
    form.remove();
    await saveAttendance(playerId, { status: 'atraso', minutes_late: mins > 0 ? mins : null }, container);
  });
}

async function saveAttendance(playerId, values, container) {
  try {
    await upsertAttendance(selectedEventId, playerId, values);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// Modal rápido de presenças — abre diretamente do Painel sem navegar para a vista.
export function openQuickAttendance(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return;
  const team = teamById(ev.team_id);
  // O plantel do EVENTO (na musculação, só o grupo daquele horário) — a mesma
  // função do ecrã inteiro.
  const players = eventRoster(ev);

  const attendanceMap = {};
  state.attendances.filter((a) => a.event_id === eventId).forEach((a) => {
    attendanceMap[a.player_id] = a;
  });

  const dateStr = eventDateTime(ev).toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long',
  });
  const range = eventTimeRange(ev);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="qa-title" style="width:min(540px,96vw);max-height:90vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="qa-title">Marcar presenças</h2>
          <p class="muted" style="margin:0;font-size:0.83rem">${esc(team ? teamName(team) + ' · ' : '')}${esc(dateStr)}${range ? ' · ' + esc(range) : ''}</p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      ${!players.length
        ? '<p class="muted">Sem atletas nesta equipa.</p>'
        : `<ul class="pres-list" style="flex:1;overflow-y:auto;margin:0 -1.2rem;padding:0 1.2rem">
            ${players.map((p) => {
              const att = attendanceMap[p.id];
              const current = att?.status || null;
              return `
                <li class="pres-row pres-row--${current || 'none'}" data-player-row="${p.id}">
                  <div class="aval-row__player">
                    <span class="aval-row__num">${esc(p.number || '—')}</span>
                    <span class="aval-row__name">${esc(p.name)}</span>
                  </div>
                  <div class="pres-actions">
                    ${ATTENDANCE_STATUSES.map((s) => `
                      <button type="button"
                        class="pres-btn pres-btn--${s.key} ${current === s.key ? 'is-active' : ''}"
                        data-qa-status="${s.key}" data-qa-player="${p.id}"
                        title="${s.label}">${s.label}</button>`).join('')}
                  </div>
                </li>`;
            }).join('')}
           </ul>`}
      <div id="qa-err" class="modal__error hidden" style="margin-top:0.5rem"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="qa-cancel" type="button">Fechar</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay);
  overlay.querySelector('#qa-cancel').addEventListener('click', close);

  overlay.querySelectorAll('[data-qa-status]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const playerId = btn.dataset.qaPlayer;
      const status = btn.dataset.qaStatus;
      const errEl = overlay.querySelector('#qa-err');
      errEl.classList.add('hidden');

      if (status === 'justificado') {
        const text = prompt('Motivo da justificação:') ?? '';
        try {
          await upsertAttendance(eventId, playerId, { status, justification: text || null });
        } catch (err) {
          errEl.textContent = dbErrorMessage(err);
          errEl.classList.remove('hidden');
          return;
        }
      } else if (status === 'atraso') {
        const mins = parseInt(prompt('Minutos de atraso:') || '0', 10);
        try {
          await upsertAttendance(eventId, playerId, { status, minutes_late: mins > 0 ? mins : null });
        } catch (err) {
          errEl.textContent = dbErrorMessage(err);
          errEl.classList.remove('hidden');
          return;
        }
      } else {
        try {
          await upsertAttendance(eventId, playerId, { status });
        } catch (err) {
          errEl.textContent = dbErrorMessage(err);
          errEl.classList.remove('hidden');
          return;
        }
      }

      // Atualiza estado visual do botão
      const row = overlay.querySelector(`[data-player-row="${playerId}"]`);
      if (row) {
        ATTENDANCE_STATUSES.forEach((s) => row.querySelector(`[data-qa-status="${s.key}"]`)?.classList.remove('is-active'));
        btn.classList.add('is-active');
        row.className = `pres-row pres-row--${status}`;
      }
    });
  });
}

// Separador "Estatísticas": comparência por atleta de UMA equipa, ordenada da
// melhor para a pior, com barra e taxa global. (Absorveu o antigo ecrã
// Estatísticas.)
function renderSummary(container, tabBar) {
  // Ao treinador só as SUAS equipas: a comparência dos outros escalões é
  // supervisão, e é do coordenador.
  const teams = myTeams().slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const wireTabs = () => container.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => { presTab = btn.dataset.tab; renderPresencas(container); })
  );

  if (!teams.length) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">Presenças</h1>
          <p class="muted" style="margin:0;font-size:0.88rem">Quem apareceu aos treinos e às sessões de musculação</p>
        </div>
      </header>
      ${tabBar}
      ${emptyHTML('Ainda não há equipas.')}
    `;
    wireTabs();
    return;
  }

  if (!summaryTeamId || !teams.some((t) => t.id === summaryTeamId)) {
    summaryTeamId = teams[0].id;
  }

  const players = state.players
    .filter((p) => p.team_id === summaryTeamId)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  // Treinos passados desta equipa (só esses têm presenças a contar).
  const allTrainings = state.events.filter(
    (e) => e.type === 'treino' && e.team_id === summaryTeamId && eventDateTime(e) <= new Date()
  );

  // Meses com treinos, do mais recente para o mais antigo.
  const months = [...new Set(allTrainings.map((t) => (t.date || '').slice(0, 7)).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a));
  if (summaryMonth && !months.includes(summaryMonth)) summaryMonth = '';

  const trainings = summaryMonth
    ? allTrainings.filter((t) => (t.date || '').startsWith(summaryMonth))
    : allTrainings;
  const totalTrainings = trainings.length;
  const trainingIds = new Set(trainings.map((t) => t.id));
  // Treinos sem NENHUM registo não entram na taxa — que fica calculada sobre
  // menos treinos do que os que houve. Diz-se quantos, senão uma taxa de 95%
  // com metade dos treinos por marcar lê-se como um plantel exemplar.
  const withRecords = new Set(state.attendances.filter((a) => trainingIds.has(a.event_id)).map((a) => a.event_id));
  const unmarked = trainings.filter((t) => !withRecords.has(t.id)).length;

  const rows = players.map((p) => {
    const atts = state.attendances.filter((a) => a.player_id === p.id && trainingIds.has(a.event_id));
    const byStatus = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
    atts.forEach((a) => { if (byStatus[a.status] !== undefined) byStatus[a.status]++; });
    const compareceu = byStatus.presente + byStatus.atraso;
    const total = atts.length;
    const pct = total ? Math.round((compareceu / total) * 100) : null;
    return { player: p, byStatus, compareceu, total, pct, semRegisto: totalTrainings - total };
  });

  const sorted = [...rows].sort((a, b) => {
    if (a.pct === null && b.pct === null) return 0;
    if (a.pct === null) return 1;
    if (b.pct === null) return -1;
    return b.pct - a.pct;
  });

  const totalRegistos = rows.reduce((s, r) => s + r.total, 0);
  const totalCompareceu = rows.reduce((s, r) => s + r.compareceu, 0);
  const globalPct = totalRegistos ? Math.round((totalCompareceu / totalRegistos) * 100) : null;

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Presenças</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Quem apareceu aos treinos e às sessões de musculação</p>
      </div>
    </header>

    ${tabBar}

    <div class="card" style="margin-bottom:1.2rem">
      <div class="row row--between row--wrap" style="gap:0.8rem">
        <div style="min-width:220px">
          <label for="sum-team">Equipa</label>
          <select id="sum-team">
            ${teams.map((t) => `<option value="${t.id}" ${t.id === summaryTeamId ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <div class="stat-summary">
          <span class="stat-summary__item"><strong>${totalTrainings}</strong> treino${totalTrainings === 1 ? '' : 's'}</span>
          <span class="stat-summary__item"><strong>${players.length}</strong> atleta${players.length === 1 ? '' : 's'}</span>
          <span class="stat-summary__item">${summaryMonth ? 'Taxa do mês' : 'Taxa global'}
            <strong class="stat-pct ${globalPct !== null ? (globalPct >= 70 ? 'stat-pct--ok' : globalPct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger') : ''}">
              ${globalPct !== null ? globalPct + '%' : '—'}
            </strong>
          </span>
        </div>
      </div>
      ${monthBarHTML(months, allTrainings)}
      ${unmarked ? `<p class="muted pres-unmarked">⚠ ${unmarked} de ${totalTrainings} treino${totalTrainings === 1 ? '' : 's'} ainda sem nenhum registo — não entra${unmarked === 1 ? '' : 'm'} na taxa. Marca-${unmarked === 1 ? 'o' : 'os'} no separador «Marcar».</p>` : ''}
    </div>

    ${!totalTrainings
      ? `<div class="card">${emptyHTML(summaryMonth
          ? 'Este mês não tem treinos com presenças registadas.'
          : 'Esta equipa ainda não tem treinos passados com presenças.')}</div>`
      : !players.length
        ? `<div class="card">${emptyHTML('Sem atletas nesta equipa.')}</div>`
        : `<div class="card">
             <div class="stat-table-wrap">
               <table class="stat-table">
                 <thead>
                   <tr>
                     <th>#</th>
                     <th>Atleta</th>
                     <th class="stat-col--center">Presenças</th>
                     <th class="stat-col--center">Atrasos</th>
                     <th class="stat-col--center">Justif.</th>
                     <th class="stat-col--center">Faltas</th>
                     <th class="stat-col--center">Sem reg.</th>
                     <th class="stat-col--bar">% Comparência</th>
                   </tr>
                 </thead>
                 <tbody>
                   ${sorted.map((r) => statRow(r)).join('')}
                 </tbody>
               </table>
             </div>
           </div>`
    }
  `;

  wireTabs();
  container.querySelector('#sum-team').addEventListener('change', (e) => {
    summaryTeamId = e.target.value;
    summaryMonth = '';
    renderSummary(container, tabBar);
  });
  container.querySelectorAll('[data-stat-player]').forEach((b) =>
    b.addEventListener('click', () => openAthleteProfile(b.dataset.statPlayer)));
  container.querySelectorAll('[data-month]').forEach((btn) => {
    btn.addEventListener('click', () => {
      summaryMonth = btn.dataset.month;
      renderSummary(container, tabBar);
    });
  });
}

// Barra de períodos: "Toda a época" + um botão por mês, cada um com a sua taxa
// de comparência.
//
// Não é só um filtro. A taxa da época inteira é uma média de oito meses e
// esconde exatamente o que interessa explicar a alguém: em novembro o plantel
// vinha a 90% e em fevereiro a 55%. Ver os meses lado a lado dá a conversa
// ("o que aconteceu em fevereiro?") que o número único não dá — e é por isso
// que cada botão mostra a percentagem em vez de ser só o nome do mês.
function monthBarHTML(months, allTrainings) {
  if (months.length < 2) return '';
  const chip = (key, label, pct) => {
    const cls = pct === null ? '' : pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
    return `
      <button type="button" class="month-chip${summaryMonth === key ? ' month-chip--active' : ''}" data-month="${esc(key)}">
        <span class="month-chip__label">${esc(label)}</span>
        <span class="month-chip__pct stat-pct ${cls}">${pct !== null ? pct + '%' : '—'}</span>
      </button>`;
  };
  const rate = (list) => {
    const ids = new Set(list.map((t) => t.id));
    const atts = state.attendances.filter((a) => ids.has(a.event_id));
    if (!atts.length) return null;
    const ok = atts.filter((a) => a.status === 'presente' || a.status === 'atraso').length;
    return Math.round((ok / atts.length) * 100);
  };
  // Do mês mais antigo para o mais recente: lê-se como uma linha do tempo.
  const cronologico = [...months].reverse();
  return `
    <div class="month-bar" role="group" aria-label="Período">
      ${chip('', 'Toda a época', rate(allTrainings))}
      ${cronologico.map((m) => chip(
        m,
        monthLabel(m),
        rate(allTrainings.filter((t) => (t.date || '').startsWith(m)))
      )).join('')}
    </div>
  `;
}

// "2026-02" -> "fev 2026"
function monthLabel(key) {
  const [y, m] = key.split('-');
  const label = new Date(Number(y), Number(m) - 1, 1)
    .toLocaleDateString('pt-PT', { month: 'short' })
    .replace('.', '');
  return `${label} ${y}`;
}

function statRow({ player, byStatus, pct, semRegisto }) {
  const pctClass = pct === null ? '' : pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
  const barWidth = pct ?? 0;
  return `
    <tr class="stat-row">
      <td class="stat-num">${esc(player.number || '—')}</td>
      <td class="stat-name">
        <button type="button" class="link-btn" data-stat-player="${player.id}" title="Abrir a ficha">${esc(player.name)}</button>
        ${player.position ? `<span class="muted stat-pos">${esc(player.position)}</span>` : ''}
      </td>
      <td class="stat-col--center"><span class="badge badge--ok">${byStatus.presente}</span></td>
      <td class="stat-col--center"><span class="badge badge--warn">${byStatus.atraso}</span></td>
      <td class="stat-col--center"><span class="badge badge--info">${byStatus.justificado}</span></td>
      <td class="stat-col--center"><span class="badge badge--danger">${byStatus.falta}</span></td>
      <td class="stat-col--center"><span class="badge badge--muted">${semRegisto}</span></td>
      <td class="stat-col--bar">
        <div class="stat-bar-wrap">
          <div class="stat-bar">
            <div class="stat-bar__fill stat-bar__fill--${pctClass.replace('stat-pct--', '')}" style="width:${barWidth}%"></div>
          </div>
          <span class="stat-pct ${pctClass}">${pct !== null ? pct + '%' : '—'}</span>
        </div>
      </td>
    </tr>
  `;
}
