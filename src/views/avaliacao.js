// Vista: Avaliação de plantel.
// Para cada equipa, permite decidir atleta a atleta quem fica para a próxima
// época (Mantém / Sai / Pendente), com contadores de progresso. Não apaga
// ninguém — é só planeamento. O estado vive em players.review_status.

import { state, updateRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { coachById, teamName } from '../compute.js';
import { REVIEW_STATUSES, REVIEW_LABEL } from '../constants.js';
import { canEdit } from '../permissions.js';

// Equipa selecionada (mantida entre re-desenhos).
let selectedTeam = null;

export function renderAvaliacao(container) {
  const editable = canEdit('players');

  if (!state.teams.length) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">Avaliação de plantel</h1>
          <p class="muted" style="margin:0;font-size:0.88rem">Decide quem fica para a próxima época</p>
        </div>
      </header>
      ${emptyHTML('Ainda não há equipas para avaliar.')}
    `;
    return;
  }

  // Garante uma equipa válida selecionada.
  if (!selectedTeam || !state.teams.some((t) => t.id === selectedTeam)) {
    selectedTeam = state.teams[0].id;
  }
  const team = state.teams.find((t) => t.id === selectedTeam);
  const coach = coachById(team.coach_id);
  const players = state.players
    .filter((p) => p.team_id === selectedTeam)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  const counts = { pendente: 0, mantem: 0, sai: 0 };
  players.forEach((p) => {
    counts[p.review_status || 'pendente']++;
  });
  const total = players.length;
  const decided = counts.mantem + counts.sai;
  const pct = total ? Math.round((decided / total) * 100) : 0;

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Avaliação de plantel</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Decide quem fica para a próxima época</p>
      </div>
      <div class="aval-pick">
        <label for="aval-team">Equipa</label>
        <select id="aval-team">
          ${state.teams
            .map(
              (t) =>
                `<option value="${t.id}" ${t.id === selectedTeam ? 'selected' : ''}>${esc(teamName(t))}</option>`
            )
            .join('')}
        </select>
      </div>
    </header>

    <section class="cards-grid aval-summary">
      ${summaryCard('Mantêm', counts.mantem, 'green')}
      ${summaryCard('Saem', counts.sai, 'red')}
      ${summaryCard('Pendentes', counts.pendente, 'muted')}
      ${summaryCard('Avaliados', `${decided}/${total}`, 'accent')}
    </section>

    <section class="card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">${esc(teamName(team))}${coach ? ` · ${esc(coach.name)}` : ''}</h2>
        <span class="goal-card__pct">${pct}%</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>

      ${
        players.length
          ? `<ul class="aval-list">${players.map((p) => playerRow(p, editable)).join('')}</ul>`
          : '<p class="muted" style="margin:0.6rem 0 0">Sem atletas nesta equipa.</p>'
      }
    </section>
  `;

  container.querySelector('#aval-team').addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    renderAvaliacao(container);
  });

  if (editable) {
    container.querySelectorAll('[data-set-status]').forEach((b) =>
      b.addEventListener('click', () => setStatus(b.dataset.player, b.dataset.setStatus, container))
    );
  }
}

function summaryCard(label, value, variant) {
  return `
    <div class="card metric metric--${variant} aval-metric">
      <span class="metric__label">${esc(label)}</span>
      <strong class="metric__value">${String(value)}</strong>
    </div>
  `;
}

function playerRow(p, editable) {
  const current = p.review_status || 'pendente';
  return `
    <li class="aval-row aval-row--${current}">
      <div class="aval-row__player">
        <span class="aval-row__num">${esc(p.number || '—')}</span>
        <div>
          <span class="aval-row__name">${esc(p.name)}</span>
          <span class="muted aval-row__meta">${[p.position, p.birth_year].filter(Boolean).map(esc).join(' · ') || '—'}</span>
        </div>
      </div>
      ${
        editable
          ? `<div class="aval-seg" role="group" aria-label="Decisão para ${esc(p.name)}">
              ${REVIEW_STATUSES.map(
                (s) =>
                  `<button type="button" class="aval-seg__btn aval-seg__btn--${s.key} ${
                    current === s.key ? 'is-active' : ''
                  }" data-player="${p.id}" data-set-status="${s.key}">${esc(s.label)}</button>`
              ).join('')}
            </div>`
          : `<span class="badge badge--${current === 'mantem' ? 'ok' : current === 'sai' ? 'danger' : 'muted'}">${esc(REVIEW_LABEL[current])}</span>`
      }
    </li>
  `;
}

async function setStatus(playerId, status, container) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.review_status === status) return;
  try {
    await updateRow('players', 'players', playerId, { review_status: status });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
