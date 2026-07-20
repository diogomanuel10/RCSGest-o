// Vista: Avaliação de plantel.
// Para cada equipa, permite decidir atleta a atleta quem fica para a próxima
// época (Mantém / Sai / Pendente), com contadores de progresso. Não apaga
// ninguém — é só planeamento. O estado vive em players.review_status.

import { state, updateRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import { teamCoaches, teamName, positions } from '../compute.js';
import { REVIEW_STATUSES, REVIEW_LABEL } from '../constants.js';
import { canEdit } from '../permissions.js';

// Equipa selecionada (mantida entre re-desenhos).
let selectedTeam = null;
let page = 1;
let positionFilter = '';
let statusFilter = '';

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
  const coachLabel = teamCoaches(team.id).map((c) => c.coach.name).join(', ');
  const allPlayers = state.players
    .filter((p) => p.team_id === selectedTeam)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  // Contadores e progresso refletem sempre o plantel completo.
  const counts = { pendente: 0, mantem: 0, sai: 0 };
  allPlayers.forEach((p) => {
    counts[p.review_status || 'pendente']++;
  });
  const total = allPlayers.length;
  const decided = counts.mantem + counts.sai;
  const pct = total ? Math.round((decided / total) * 100) : 0;

  // A lista respeita os filtros de posição e de decisão.
  const players = allPlayers
    .filter((p) => !positionFilter || p.position === positionFilter)
    .filter((p) => !statusFilter || (p.review_status || 'pendente') === statusFilter);
  const pg = paginate(players, page, PAGE_SIZE);

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

    <div class="filter-bar">
      <div class="field">
        <label for="aval-pos">Posição</label>
        <select id="aval-pos">
          <option value="">Todas as posições</option>
          ${positions().map((p) => `<option value="${esc(p)}" ${positionFilter === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="aval-status">Decisão</label>
        <select id="aval-status">
          <option value="">Todas</option>
          ${REVIEW_STATUSES.map((s) => `<option value="${s.key}" ${statusFilter === s.key ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>
      </div>
    </div>

    <section class="card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">${esc(teamName(team))}${coachLabel ? ` · ${esc(coachLabel)}` : ''}</h2>
        <span class="goal-card__pct">${pct}%</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%"></div></div>

      ${
        players.length
          ? `<ul class="aval-list">${pg.items.map((p) => playerRow(p, editable)).join('')}</ul>
             ${paginationHTML({ ...pg, id: 'aval' })}`
          : `<p class="muted" style="margin:0.6rem 0 0">${positionFilter || statusFilter ? 'Nenhum atleta corresponde ao filtro.' : 'Sem atletas nesta equipa.'}</p>`
      }
    </section>
  `;

  container.querySelector('#aval-team').addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    page = 1;
    renderAvaliacao(container);
  });
  container.querySelector('#aval-pos')?.addEventListener('change', (e) => {
    positionFilter = e.target.value;
    page = 1;
    renderAvaliacao(container);
  });
  container.querySelector('#aval-status')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    page = 1;
    renderAvaliacao(container);
  });

  wirePagination(container, 'aval', pg.page, pg.totalPages, (np) => {
    page = np;
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
