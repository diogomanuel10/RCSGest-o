// Avaliação de plantel (modo "Planear época" dos Plantéis).
// Para a equipa selecionada, decide-se atleta a atleta quem fica para a próxima
// época (Mantém / Sai / Pendente), com contadores e progresso. O estado vive em
// players.review_status. "Aplicar decisões" fecha o ciclo: arquiva quem sai e
// repõe os que ficam a Pendente para a nova época (só o coordenador).
//
// Não é uma vista de rota: é renderizada por planteis.js. Exporta um construtor
// de HTML (evaluationHTML) e o respetivo wiring (wireEvaluation).

import { state, updateRow, archiveRow, dbErrorMessage } from '../store.js';
import { esc, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import { teamCoaches, teamName, positions } from '../compute.js';
import { confirmDialog } from '../modal.js';
import { REVIEW_STATUSES, REVIEW_LABEL } from '../constants.js';

// Filtros do modo avaliação (globais) e paginação por equipa.
let positionFilter = '';
let statusFilter = '';
const evalPage = new Map(); // team_id -> página

// HTML do modo avaliação para UMA equipa. `opts`: { editable, canApply, color }.
export function evaluationHTML(team, opts = {}) {
  const { editable = false, canApply = false, color = 'var(--navy)' } = opts;
  const coachLabel = teamCoaches(team.id).map((c) => c.coach.name).join(', ');
  const allPlayers = state.players
    .filter((p) => p.team_id === team.id)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  // Contadores e progresso refletem sempre o plantel completo.
  const counts = { pendente: 0, mantem: 0, sai: 0 };
  allPlayers.forEach((p) => { counts[p.review_status || 'pendente']++; });
  const total = allPlayers.length;
  const decided = counts.mantem + counts.sai;
  const pct = total ? Math.round((decided / total) * 100) : 0;

  // A lista respeita os filtros de posição e de decisão.
  const players = allPlayers
    .filter((p) => !positionFilter || p.position === positionFilter)
    .filter((p) => !statusFilter || (p.review_status || 'pendente') === statusFilter);
  const pg = paginate(players, evalPage.get(team.id) || 1, PAGE_SIZE);

  return `
    <section class="roster" style="--tc:${color}">
      <p class="muted aval-context">
        A decidir quem fica para a <strong>próxima época</strong>${state.settings.season ? ` · época atual <strong>${esc(state.settings.season)}</strong>` : ''}.
      </p>

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

      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">${esc(teamName(team))}${coachLabel ? ` · ${esc(coachLabel)}` : ''}</h2>
        <span class="goal-card__pct">${pct}%</span>
      </div>
      <div class="progress"><div class="progress__bar" style="width:${pct}%;background:${color}"></div></div>

      ${
        players.length
          ? `<ul class="aval-list">${pg.items.map((p) => playerRow(p, editable)).join('')}</ul>
             ${paginationHTML({ ...pg, id: 'aval' })}`
          : `<p class="muted" style="margin:0.6rem 0 0">${positionFilter || statusFilter ? 'Nenhum atleta corresponde ao filtro.' : 'Sem atletas nesta equipa.'}</p>`
      }

      ${
        canApply && decided > 0
          ? `<div class="roster__actions aval-apply">
               <button class="btn btn--accent btn--sm" id="aval-apply" type="button">Aplicar decisões</button>
               <span class="muted aval-apply__hint">Arquiva quem sai e prepara a nova época.</span>
             </div>`
          : ''
      }
    </section>
  `;
}

// Liga os eventos do modo avaliação. `rerender` re-desenha os Plantéis.
export function wireEvaluation(container, team, rerender) {
  container.querySelector('#aval-pos')?.addEventListener('change', (e) => {
    positionFilter = e.target.value;
    evalPage.set(team.id, 1);
    rerender();
  });
  container.querySelector('#aval-status')?.addEventListener('change', (e) => {
    statusFilter = e.target.value;
    evalPage.set(team.id, 1);
    rerender();
  });

  const players = state.players
    .filter((p) => p.team_id === team.id)
    .filter((p) => !positionFilter || p.position === positionFilter)
    .filter((p) => !statusFilter || (p.review_status || 'pendente') === statusFilter);
  const pg = paginate(players, evalPage.get(team.id) || 1, PAGE_SIZE);
  wirePagination(container, 'aval', pg.page, pg.totalPages, (np) => {
    evalPage.set(team.id, np);
    rerender();
  });

  container.querySelectorAll('[data-set-status]').forEach((b) =>
    b.addEventListener('click', () => setStatus(b.dataset.player, b.dataset.setStatus))
  );

  container.querySelector('#aval-apply')?.addEventListener('click', () => applyDecisions(team));
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

async function setStatus(playerId, status) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.review_status === status) return;
  try {
    await updateRow('players', 'players', playerId, { review_status: status });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// Fecha o ciclo: arquiva quem sai e repõe quem fica a Pendente (nova época).
async function applyDecisions(team) {
  const teamPlayers = state.players.filter((p) => p.team_id === team.id);
  const leaving = teamPlayers.filter((p) => (p.review_status || 'pendente') === 'sai');
  const staying = teamPlayers.filter((p) => (p.review_status || 'pendente') === 'mantem');

  const parts = [];
  if (leaving.length) parts.push(`${leaving.length} atleta${leaving.length === 1 ? '' : 's'} marcado${leaving.length === 1 ? '' : 's'} como "Sai" ${leaving.length === 1 ? 'será arquivado' : 'serão arquivados'}`);
  if (staying.length) parts.push(`${staying.length} "Mantém" ${staying.length === 1 ? 'volta' : 'voltam'} a Pendente para a nova época`);

  const ok = await confirmDialog(
    `Aplicar as decisões de "${teamName(team)}"? ${parts.join(' e ')}. Os arquivados ficam no histórico e podem ser repostos nos Arquivados.`,
    { confirmLabel: 'Aplicar', danger: leaving.length > 0 }
  );
  if (!ok) return;

  try {
    for (const p of staying) {
      await updateRow('players', 'players', p.id, { review_status: 'pendente' });
    }
    for (const p of leaving) {
      await archiveRow('players', p.id);
    }
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
