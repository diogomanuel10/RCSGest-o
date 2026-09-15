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

// --- Filtros (estado de UI, só nesta vista) --------------------------------
// O arquivo é a única lista da app que só CRESCE: uma viragem de época arquiva
// o plantel inteiro de quem sai, e ao fim de duas épocas são centenas de
// linhas em seis blocos empilhados. Repor UM atleta obrigava a percorrer tudo
// com o Ctrl+F do browser — que é o sintoma de a vista não ter filtro nenhum.
//
// A pesquisa cobre o nome E o detalhe secundário (posição, equipa, estado),
// para "Sub-16" devolver os atletas daquele escalão sem ser preciso um filtro
// por equipa só para isso.
let archSearch = '';
let archType = '';
// Grupos cujo "mostrar todos" já foi carregado. Um grupo de 200 atletas
// mostrado por inteiro empurra os outros cinco para fora do ecrã — e o que se
// procura está quase sempre no que foi arquivado há menos tempo (a lista vem
// ordenada por data de arquivo, do mais recente para trás).
const archExpanded = new Set();
const GROUP_PREVIEW = 25;

// Linhas de um grupo que passam o filtro.
function rowsOf(g) {
  const rows = state.archived[g.key] || [];
  if (archType && archType !== g.key) return [];
  const q = archSearch.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => `${g.name(r) || ''} ${g.meta(r) || ''}`.toLowerCase().includes(q));
}

export function renderArquivados(container) {
  const total = GROUPS.reduce((n, g) => n + (state.archived[g.key]?.length || 0), 0);
  const shown = GROUPS.reduce((n, g) => n + rowsOf(g).length, 0);
  const filtering = Boolean(archSearch.trim() || archType);

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Arquivados</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          ${total} registo${total === 1 ? '' : 's'} inativo${total === 1 ? '' : 's'} · nada é apagado, fica no histórico
        </p>
      </div>
    </header>
    ${total ? filterHTML(total, shown, filtering) : ''}
    ${!total
      ? emptyHTML('Não há registos arquivados.')
      : shown
        ? GROUPS.map(groupHTML).filter(Boolean).join('')
        : emptyHTML('Nenhum registo arquivado corresponde ao filtro.')}
  `;

  const searchEl = container.querySelector('#arq-search');
  searchEl?.addEventListener('input', (e) => {
    archSearch = e.target.value;
    renderArquivados(container);
    const el = container.querySelector('#arq-search');
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  });
  container.querySelector('#arq-type')?.addEventListener('change', (e) => {
    archType = e.target.value;
    renderArquivados(container);
  });
  container.querySelector('#arq-clear')?.addEventListener('click', () => {
    archSearch = '';
    archType = '';
    renderArquivados(container);
  });
  container.querySelectorAll('[data-expand]').forEach((btn) =>
    btn.addEventListener('click', () => {
      archExpanded.add(btn.dataset.expand);
      renderArquivados(container);
    })
  );

  container.querySelectorAll('[data-restore]').forEach((btn) =>
    btn.addEventListener('click', () => restore(btn.dataset.restoreTable, btn.dataset.restore, btn.dataset.restoreName))
  );
}

// Barra de filtros. O contador diz sempre quantos estão à vista de quantos há:
// um filtro que esconde 300 linhas em silêncio parece um arquivo vazio.
function filterHTML(total, shown, filtering) {
  return `
    <div class="filter-bar">
      <div class="field field--grow">
        <label for="arq-search">Pesquisar</label>
        <input type="search" id="arq-search" placeholder="Nome, equipa, posição…" value="${esc(archSearch)}" />
      </div>
      <div class="field">
        <label for="arq-type">Tipo</label>
        <select id="arq-type">
          <option value="">Todos os tipos</option>
          ${GROUPS.map((g) => {
            const n = state.archived[g.key]?.length || 0;
            return n
              ? `<option value="${g.key}" ${archType === g.key ? 'selected' : ''}>${esc(g.title)} (${n})</option>`
              : '';
          }).join('')}
        </select>
      </div>
      ${filtering
        ? `<div class="field"><button class="btn btn--ghost btn--sm" id="arq-clear" type="button">Limpar filtros</button></div>`
        : ''}
      <span class="filters__count muted">${shown} de ${total}</span>
    </div>`;
}

function groupHTML(g) {
  const all = rowsOf(g);
  if (!all.length) return '';
  const capped = !archExpanded.has(g.key) && all.length > GROUP_PREVIEW;
  const rows = capped ? all.slice(0, GROUP_PREVIEW) : all;
  return `
    <section class="card" style="margin-bottom:1rem">
      <h2 class="section-title" style="font-size:1.05rem;margin-bottom:0.6rem">${esc(g.title)} <span class="badge badge--muted">${all.length}</span></h2>
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
      ${capped
        ? `<button class="btn btn--ghost btn--sm" data-expand="${g.key}" type="button" style="margin-top:0.6rem">
             Mostrar os restantes ${all.length - GROUP_PREVIEW}
           </button>`
        : ''}
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
