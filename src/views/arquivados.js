// Vista: Arquivados (só coordenador). Lista os registos inativos (soft-delete)
// das entidades principais e permite repô-los (reativar). Nada é apagado de
// vez nesta aplicação — arquivar mantém o histórico acessível aqui.

import { state, restoreRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { teamName } from '../compute.js';
import { confirmDialog } from '../modal.js';
import { EVENT_TYPE_LABEL, PROSPECT_LABEL } from '../constants.js';

// Resolve o nome de uma equipa, mesmo que ela própria esteja arquivada.
function teamLabel(teamId) {
  if (!teamId) return '';
  const t = state.teams.find((x) => x.id === teamId)
    || state.archived.teams.find((x) => x.id === teamId);
  return t ? teamName(t) : '';
}

// Data legível do arquivo (dd/mm/aaaa).
function archivedOn(row) {
  if (!row.archived_at) return '';
  const d = new Date(row.archived_at);
  return d.toLocaleDateString('pt-PT');
}

// Definição de cada grupo: título, tabela na BD, coleção arquivada e como
// descrever cada registo (nome + detalhe secundário).
const GROUPS = [
  {
    key: 'players', title: 'Atletas', table: 'players',
    name: (r) => r.name,
    meta: (r) => [r.position, teamLabel(r.team_id)].filter(Boolean).join(' · '),
  },
  {
    key: 'teams', title: 'Equipas', table: 'teams',
    name: (r) => teamName(r),
    meta: () => '',
  },
  {
    key: 'coaches', title: 'Treinadores', table: 'coaches',
    name: (r) => r.name,
    meta: (r) => r.role || '',
  },
  {
    key: 'sponsors', title: 'Patrocínios', table: 'sponsors',
    name: (r) => r.name,
    meta: (r) => r.category || '',
  },
  {
    key: 'events', title: 'Eventos', table: 'events',
    name: (r) => r.title || EVENT_TYPE_LABEL[r.type] || 'Evento',
    meta: (r) => [r.date, teamLabel(r.team_id)].filter(Boolean).join(' · '),
  },
  {
    key: 'prospects', title: 'Recrutamento', table: 'prospects',
    name: (r) => r.name,
    meta: (r) => [PROSPECT_LABEL[r.status], teamLabel(r.target_team_id)].filter(Boolean).join(' · '),
  },
];

export function renderArquivados(container) {
  const total = GROUPS.reduce((n, g) => n + (state.archived[g.key]?.length || 0), 0);

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Arquivados</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          ${total} registo${total === 1 ? '' : 's'} inativo${total === 1 ? '' : 's'} · nada é apagado, fica no histórico
        </p>
      </div>
    </header>
    ${total
      ? GROUPS.map(groupHTML).filter(Boolean).join('')
      : emptyHTML('Não há registos arquivados.')}
  `;

  container.querySelectorAll('[data-restore]').forEach((btn) =>
    btn.addEventListener('click', () => restore(btn.dataset.restoreTable, btn.dataset.restore, btn.dataset.restoreName))
  );
}

function groupHTML(g) {
  const rows = state.archived[g.key] || [];
  if (!rows.length) return '';
  return `
    <section class="card" style="margin-bottom:1rem">
      <h2 class="section-title" style="font-size:1.05rem;margin-bottom:0.6rem">${esc(g.title)} <span class="badge badge--muted">${rows.length}</span></h2>
      <div class="arch-list">
        ${rows.map((r) => {
          const meta = g.meta(r);
          const on = archivedOn(r);
          return `
            <div class="arch-row">
              <div class="arch-row__info">
                <strong>${esc(g.name(r) || '—')}</strong>
                ${meta ? `<span class="muted arch-row__meta">${esc(meta)}</span>` : ''}
              </div>
              ${on ? `<span class="muted arch-row__date">Arquivado a ${esc(on)}</span>` : ''}
              <button class="btn btn--ghost btn--sm" data-restore="${r.id}" data-restore-table="${g.table}" data-restore-name="${esc(g.name(r) || '')}" type="button">↩ Repor</button>
            </div>`;
        }).join('')}
      </div>
    </section>
  `;
}

async function restore(table, id, name) {
  const ok = await confirmDialog(
    `Repor "${name}"? Volta a ficar ativo na aplicação.`,
    { confirmLabel: 'Repor', danger: false }
  );
  if (!ok) return;
  try {
    await restoreRow(table, id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
