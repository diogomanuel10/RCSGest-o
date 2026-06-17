// Vista: Quotas / mensalidades dos atletas.
// Filtra por equipa, mês e ano. Permite gerar registos para toda a equipa
// e marcar individualmente como pago / não pago.

import { state, generateQuotas, toggleQuota, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, euros } from '../ui.js';
import { teamName } from '../compute.js';
import { canEdit } from '../permissions.js';
import { MONTHS } from '../constants.js';

const now = new Date();
const filters = {
  team: '',
  mes: now.getMonth() + 1,
  ano: now.getFullYear(),
};

export function renderQuotas(container) {
  const canWrite = canEdit('players');

  // Anos disponíveis: do ano mais antigo nas quotas até ao atual +1
  const anos = buildYears();
  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  if (!teams.length) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">Quotas</h1>
          <p class="muted" style="margin:0;font-size:0.88rem">Gestão de mensalidades por atleta</p>
        </div>
      </header>
      ${emptyHTML('Ainda não há equipas registadas. Começa pelos Plantéis.')}
    `;
    return;
  }

  if (!filters.team) filters.team = teams[0]?.id || '';

  const team = teams.find((t) => t.id === filters.team);
  const players = team
    ? state.players
        .filter((p) => p.team_id === team.id)
        .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999))
    : [];

  const monthQuotas = state.quotas.filter(
    (q) => q.mes === filters.mes && q.ano === filters.ano
  );
  const quotaMap = {};
  monthQuotas.forEach((q) => {
    quotaMap[q.player_id] = q;
  });

  const playerIds = new Set(players.map((p) => p.id));
  const teamQuotas = monthQuotas.filter((q) => playerIds.has(q.player_id));
  const totalPago = teamQuotas.filter((q) => q.pago).reduce((s, q) => s + Number(q.valor), 0);
  const totalPendente = teamQuotas.filter((q) => !q.pago).reduce((s, q) => s + Number(q.valor), 0);
  const nPago = teamQuotas.filter((q) => q.pago).length;
  const nPendente = teamQuotas.filter((q) => !q.pago).length;
  const nSemRegisto = players.length - teamQuotas.length;

  const mesLabel = MONTHS[filters.mes - 1];

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Quotas</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Gestão de mensalidades por atleta</p>
      </div>
      ${canWrite ? `<button class="btn btn--accent" id="gen-quotas" type="button">Gerar quotas</button>` : ''}
    </header>

    <div class="card" style="margin-bottom:1.2rem">
      <div class="filters" style="margin-bottom:0;padding:0;background:none;border:none">
        <div>
          <label for="q-team">Equipa</label>
          <select id="q-team">
            ${teams.map((t) => `<option value="${t.id}" ${t.id === filters.team ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="q-mes">Mês</label>
          <select id="q-mes">
            ${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === filters.mes ? 'selected' : ''}>${esc(m)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label for="q-ano">Ano</label>
          <select id="q-ano">
            ${anos.map((a) => `<option value="${a}" ${a === filters.ano ? 'selected' : ''}>${a}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <section class="cards-grid aval-summary" style="margin-bottom:1.2rem">
      ${summaryCard('Pagos', nPago, euros(totalPago), 'green')}
      ${summaryCard('Pendentes', nPendente, euros(totalPendente), 'warn')}
      ${summaryCard('Sem registo', nSemRegisto, '', 'muted')}
    </section>

    <section class="card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">
          ${esc(team ? teamName(team) : '—')} — ${esc(mesLabel)} ${filters.ano}
        </h2>
        ${teamQuotas.length ? `<span class="goal-card__pct">${euros(totalPago + totalPendente)}</span>` : ''}
      </div>

      ${!players.length
        ? '<p class="muted" style="margin:0.5rem 0 0">Sem atletas nesta equipa.</p>'
        : `<ul class="quota-list">
            ${players.map((p) => quotaRow(p, quotaMap[p.id], canWrite)).join('')}
           </ul>`
      }
    </section>
  `;

  container.querySelector('#q-team').addEventListener('change', (e) => {
    filters.team = e.target.value;
    renderQuotas(container);
  });
  container.querySelector('#q-mes').addEventListener('change', (e) => {
    filters.mes = Number(e.target.value);
    renderQuotas(container);
  });
  container.querySelector('#q-ano').addEventListener('change', (e) => {
    filters.ano = Number(e.target.value);
    renderQuotas(container);
  });

  if (canWrite) {
    container.querySelector('#gen-quotas')?.addEventListener('click', () =>
      openGenerateModal(filters.team, filters.mes, filters.ano, container)
    );
    container.querySelectorAll('[data-toggle-quota]').forEach((btn) => {
      btn.addEventListener('click', () => handleToggle(btn, container));
    });
  }
}

function summaryCard(label, count, sub, variant) {
  return `
    <div class="card metric metric--${variant} aval-metric">
      <span class="metric__label">${esc(label)}</span>
      <strong class="metric__value">${count}</strong>
      ${sub ? `<span class="metric__sub muted">${esc(sub)}</span>` : ''}
    </div>
  `;
}

function quotaRow(player, quota, canWrite) {
  const pago = quota?.pago ?? null;
  const valor = quota ? Number(quota.valor) : null;
  const pagoEm = quota?.pago_em
    ? new Date(quota.pago_em).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })
    : null;

  return `
    <li class="quota-row quota-row--${pago === null ? 'none' : pago ? 'pago' : 'pendente'}">
      <div class="aval-row__player">
        <span class="aval-row__num">${esc(player.number || '—')}</span>
        <div>
          <span class="aval-row__name">${esc(player.name)}</span>
          <span class="muted aval-row__meta">${[player.position, player.birth_year].filter(Boolean).map(esc).join(' · ') || '—'}</span>
        </div>
      </div>
      <div class="quota-row__right">
        ${valor !== null ? `<span class="quota-row__valor">${euros(valor)}</span>` : ''}
        ${pago === null
          ? '<span class="badge badge--muted">Sem registo</span>'
          : pago
            ? `<span class="badge badge--ok">Pago${pagoEm ? ' · ' + pagoEm : ''}</span>`
            : '<span class="badge badge--warn">Pendente</span>'
        }
        ${canWrite && quota
          ? `<button class="btn btn--sm ${quota.pago ? 'btn--ghost' : 'btn--primary'}"
               data-toggle-quota="${quota.id}"
               data-pago="${quota.pago ? '1' : '0'}"
               type="button">
               ${quota.pago ? 'Marcar pendente' : 'Marcar pago'}
             </button>`
          : ''
        }
      </div>
    </li>
  `;
}

function openGenerateModal(teamId, mes, ano, container) {
  const team = state.teams.find((t) => t.id === teamId);
  const mesLabel = MONTHS[mes - 1];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="gen-title">
      <div class="modal__head">
        <h2 id="gen-title">Gerar quotas — ${esc(mesLabel)} ${ano}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p style="margin:0 0 1rem;font-size:0.9rem">
        Serão criados registos de quota para todos os atletas de
        <strong>${esc(team ? teamName(team) : '—')}</strong>
        que ainda não tenham registo em ${esc(mesLabel)} ${ano}.
      </p>
      <div class="field">
        <label for="gen-valor">Valor (€)</label>
        <input type="number" id="gen-valor" min="0" step="0.01" value="25" style="max-width:140px" />
      </div>
      <div id="gen-err" class="modal__error" style="display:none"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="gen-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="gen-confirm" type="button">Gerar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  overlay.querySelector('#gen-valor').focus();

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
  };
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#gen-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#gen-confirm').addEventListener('click', async () => {
    const valor = parseFloat(overlay.querySelector('#gen-valor').value) || 0;
    const errEl = overlay.querySelector('#gen-err');
    const btn = overlay.querySelector('#gen-confirm');
    btn.disabled = true;
    errEl.style.display = 'none';
    try {
      await generateQuotas(teamId, mes, ano, valor);
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.style.display = 'block';
      btn.disabled = false;
    }
  });
}

async function handleToggle(btn, container) {
  const id = btn.dataset.toggleQuota;
  const pago = btn.dataset.pago === '1';
  btn.disabled = true;
  try {
    await toggleQuota(id, !pago);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

function buildYears() {
  const minYear = state.quotas.reduce((m, q) => Math.min(m, q.ano), now.getFullYear());
  const maxYear = now.getFullYear() + 1;
  const years = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);
  return years;
}
