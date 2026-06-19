// Vista: Presenças nos treinos.
// Seleciona um treino, mostra os atletas da equipa e permite marcar presença
// com 4 estados: Presente / Atraso (com minutos) / Justificado (com texto) / Falta.

import { state, upsertAttendance, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName } from '../compute.js';
import { ATTENDANCE_STATUSES, ATTENDANCE_LABEL, ATTENDANCE_BADGE } from '../constants.js';
import { canEdit } from '../permissions.js';

let selectedEventId = null;
let presTab = 'sessao'; // 'sessao' | 'resumo'
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
      <button class="pres-tab${presTab === 'sessao' ? ' pres-tab--active' : ''}" data-tab="sessao" type="button">Por sessão</button>
      <button class="pres-tab${presTab === 'resumo' ? ' pres-tab--active' : ''}" data-tab="resumo" type="button">Resumo global</button>
    </div>
  `;

  if (presTab === 'resumo') {
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

function renderSummary(container, tabBar) {
  const trainings = state.events.filter((e) => e.type === 'treino');

  // Treinos por equipa
  const sessionsByTeam = {};
  trainings.forEach((t) => {
    if (t.team_id) sessionsByTeam[t.team_id] = (sessionsByTeam[t.team_id] || 0) + 1;
  });

  // Presenças por atleta
  const byPlayer = {};
  state.attendances.forEach((a) => {
    if (!byPlayer[a.player_id]) byPlayer[a.player_id] = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
    if (a.status) byPlayer[a.player_id][a.status] = (byPlayer[a.player_id][a.status] || 0) + 1;
  });

  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const filteredTeams = summaryTeamId ? teams.filter((t) => t.id === summaryTeamId) : teams;

  const rows = filteredTeams.flatMap((team) => {
    const sessions = sessionsByTeam[team.id] || 0;
    const players = state.players
      .filter((p) => p.team_id === team.id)
      .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
    if (!players.length) return [];
    return [
      { type: 'team', team, sessions },
      ...players.map((p) => {
        const s = byPlayer[p.id] || { presente: 0, atraso: 0, justificado: 0, falta: 0 };
        const attended = s.presente + s.atraso;
        const pct = sessions ? Math.round((attended / sessions) * 100) : null;
        return { type: 'player', player: p, sessions, s, attended, pct };
      }),
    ];
  });

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Presenças</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Registo de presenças nos treinos</p>
      </div>
    </header>

    ${tabBar}

    <div class="filter-bar">
      <div class="field">
        <label for="sum-team">Equipa</label>
        <select id="sum-team">
          <option value="">Todas as equipas</option>
          ${teams.map((t) => `<option value="${t.id}" ${t.id === summaryTeamId ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
        </select>
      </div>
    </div>

    <section class="card" style="padding:0;overflow:hidden">
      <table class="pres-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Atleta</th>
            <th title="Treinos realizados">Treinos</th>
            <th title="Presente + a tempo">Presenças</th>
            <th title="Chegou tarde">Atrasos</th>
            <th title="Falta justificada">Justificadas</th>
            <th title="Falta injustificada">Faltas</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map((r) => {
            if (r.type === 'team') {
              return `<tr class="pres-table__team-row"><td colspan="8">${esc(teamName(r.team))} <span class="muted" style="font-weight:400">· ${r.sessions} treino${r.sessions !== 1 ? 's' : ''}</span></td></tr>`;
            }
            const { player: p, sessions, s, attended, pct } = r;
            const pctClass = pct === null ? '' : pct >= 80 ? 'pres-pct--ok' : pct >= 50 ? 'pres-pct--warn' : 'pres-pct--bad';
            return `
              <tr>
                <td class="muted">${esc(p.number || '—')}</td>
                <td><strong>${esc(p.name)}</strong>${p.position ? `<br><span class="muted" style="font-size:0.78rem">${esc(p.position)}</span>` : ''}</td>
                <td class="pres-table__num">${sessions}</td>
                <td class="pres-table__num">${s.presente}</td>
                <td class="pres-table__num">${s.atraso || 0}</td>
                <td class="pres-table__num">${s.justificado || 0}</td>
                <td class="pres-table__num">${s.falta || 0}</td>
                <td class="pres-table__num"><span class="pres-pct ${pctClass}">${pct !== null ? pct + '%' : '—'}</span></td>
              </tr>
            `;
          }).join('') : `<tr><td colspan="8" class="muted" style="text-align:center;padding:1.5rem">Sem dados de presença ainda.</td></tr>`}
        </tbody>
      </table>
    </section>
  `;

  container.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => { presTab = btn.dataset.tab; renderPresencas(container); })
  );
  container.querySelector('#sum-team').addEventListener('change', (e) => {
    summaryTeamId = e.target.value;
    renderSummary(container, tabBar);
    container.querySelectorAll('[data-tab]').forEach((b) =>
      b.addEventListener('click', () => { presTab = b.dataset.tab; renderPresencas(container); })
    );
  });
}
