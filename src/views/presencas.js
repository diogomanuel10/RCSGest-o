// Vista: Presenças nos treinos.
// Seleciona um treino, mostra os atletas da equipa e permite marcar presença
// com 4 estados: Presente / Atraso (com minutos) / Justificado (com texto) / Falta.

import { state, upsertAttendance, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName } from '../compute.js';
import { ATTENDANCE_STATUSES, ATTENDANCE_LABEL, ATTENDANCE_BADGE } from '../constants.js';
import { canEdit } from '../permissions.js';

let selectedEventId = null;
let presTab = 'sessao'; // 'sessao' | 'estatisticas'
let summaryTeamId = '';

// Pré-seleciona uma sessão de treino (usado pelo atalho do Painel).
export function setSelectedTraining(id) {
  selectedEventId = id;
  presTab = 'sessao';
}

export function renderPresencas(container) {
  const editable = canEdit('attendances');

  // Treinos ordenados do mais recente para o mais antigo
  const trainings = state.events
    .filter((e) => e.type === 'treino')
    .sort((a, b) => eventDateTime(b) - eventDateTime(a));

  if (!trainings.length) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">Presenças</h1>
          <p class="muted" style="margin:0;font-size:0.88rem">Registo de presenças nos treinos</p>
        </div>
      </header>
      ${emptyHTML('Ainda não há treinos registados no Calendário.')}
    `;
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

  if (!selectedEventId || !trainings.some((e) => e.id === selectedEventId)) {
    // Seleciona o treino mais recente por omissão
    selectedEventId = trainings[0].id;
  }

  const ev = trainings.find((e) => e.id === selectedEventId);
  const team = teamById(ev?.team_id);
  const players = team
    ? state.players
        .filter((p) => p.team_id === team.id)
        .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999))
    : [];

  // Contagens de presença para o evento selecionado
  const counts = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
  const attendanceMap = {};
  state.attendances
    .filter((a) => a.event_id === selectedEventId)
    .forEach((a) => {
      attendanceMap[a.player_id] = a;
      counts[a.status] = (counts[a.status] || 0) + 1;
    });

  const totalPlayers = players.length;
  const marked = counts.presente + counts.atraso + counts.justificado + counts.falta;
  const pct = totalPlayers ? Math.round((marked / totalPlayers) * 100) : 0;

  const dateStr = ev
    ? eventDateTime(ev).toLocaleDateString('pt-PT', {
        weekday: 'long', day: '2-digit', month: 'long',
      })
    : '';

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Presenças</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Registo de presenças nos treinos</p>
      </div>
    </header>

    ${tabBar}

    <div class="presenca-picker card" style="margin-bottom:1.2rem">
      <div class="row row--between row--wrap" style="gap:0.8rem">
        <div style="min-width:260px;flex:1">
          <label for="pres-event">Sessão de treino</label>
          <select id="pres-event">
            ${trainings.map((t) => {
              const dt = eventDateTime(t).toLocaleDateString('pt-PT', {
                day: '2-digit', month: 'short', year: 'numeric',
              });
              const tm = teamById(t.team_id);
              const range = eventTimeRange(t);
              const label = `${dt}${range ? ' ' + range : ''}${tm ? ' — ' + teamName(tm) : ''}${t.title ? ' — ' + t.title : ''}`;
              return `<option value="${t.id}" ${t.id === selectedEventId ? 'selected' : ''}>${esc(label)}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="presenca-meta muted" style="font-size:0.86rem;align-self:flex-end;padding-bottom:0.1rem">
          ${team ? `<strong>${esc(teamName(team))}</strong> · ` : ''}${esc(dateStr)}${ev && eventTimeRange(ev) ? ' · ' + esc(eventTimeRange(ev)) : ''}
        </div>
      </div>
    </div>

    <section class="cards-grid aval-summary" style="margin-bottom:1.2rem">
      ${summaryCard('Presentes', counts.presente, 'green')}
      ${summaryCard('Atrasos', counts.atraso, 'warn')}
      ${summaryCard('Justificados', counts.justificado, 'info')}
      ${summaryCard('Faltas', counts.falta, 'red')}
    </section>

    <section class="card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">Lista de atletas</h2>
        <span class="goal-card__pct">${pct}% registado</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>

      ${!team
        ? '<p class="muted" style="margin:1rem 0 0">Este treino não tem equipa associada. Edita-o no Calendário para atribuir uma equipa.</p>'
        : !players.length
        ? '<p class="muted" style="margin:1rem 0 0">Sem atletas nesta equipa.</p>'
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

  if (editable) {
    container.querySelectorAll('[data-status]').forEach((btn) => {
      btn.addEventListener('click', () =>
        handleStatusClick(btn, container, ev)
      );
    });
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
          ${attendance?.minutes_late != null ? `<span class="pres-detail">${attendance.minutes_late} min de atraso</span>` : ''}
          ${attendance?.justification ? `<span class="pres-detail">${esc(attendance.justification)}</span>` : ''}
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
    alert(dbErrorMessage(err));
  }
}

// Modal rápido de presenças — abre diretamente do Painel sem navegar para a vista.
export function openQuickAttendance(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return;
  const team = teamById(ev.team_id);
  const players = team
    ? state.players
        .filter((p) => p.team_id === team.id)
        .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999))
    : [];

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
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#qa-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

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
  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const wireTabs = () => container.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => { presTab = btn.dataset.tab; renderPresencas(container); })
  );

  if (!teams.length) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">Presenças</h1>
          <p class="muted" style="margin:0;font-size:0.88rem">Registo de presenças nos treinos</p>
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
  const trainings = state.events.filter(
    (e) => e.type === 'treino' && e.team_id === summaryTeamId && eventDateTime(e) <= new Date()
  );
  const totalTrainings = trainings.length;
  const trainingIds = new Set(trainings.map((t) => t.id));

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
        <p class="muted" style="margin:0;font-size:0.88rem">Registo de presenças nos treinos</p>
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
          <span class="stat-summary__item">Taxa global
            <strong class="stat-pct ${globalPct !== null ? (globalPct >= 70 ? 'stat-pct--ok' : globalPct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger') : ''}">
              ${globalPct !== null ? globalPct + '%' : '—'}
            </strong>
          </span>
        </div>
      </div>
    </div>

    ${!totalTrainings
      ? `<div class="card">${emptyHTML('Esta equipa ainda não tem treinos passados com presenças.')}</div>`
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
    renderSummary(container, tabBar);
  });
}

function statRow({ player, byStatus, pct, semRegisto }) {
  const pctClass = pct === null ? '' : pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
  const barWidth = pct ?? 0;
  return `
    <tr class="stat-row">
      <td class="stat-num">${esc(player.number || '—')}</td>
      <td class="stat-name">
        <span>${esc(player.name)}</span>
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
