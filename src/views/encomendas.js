// Vista: Encomendas de Equipamento.
// Dois separadores:
//   1. Tamanhos por atleta — tabela por equipa, editável pelo coordenador.
//   2. Resumo para encomenda — agrega os tamanhos de cada artigo da equipa.

import { state, upsertPlayerSizes, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { teamName, equipmentArticles, playerSizes, sortSizes } from '../compute.js';
import { openModal } from '../modal.js';
import { canEdit } from '../permissions.js';
import { exportEncomendaXLSX } from '../encomendas-xlsx.js';

let selectedTeam = '';
let tab = 'tamanhos'; // 'tamanhos' | 'resumo'

// Corpo do separador "Encomendas" (renderizado pelo orquestrador Equipamentos).
export function renderEncomendasBody(container) {
  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  if (!teams.length) {
    container.innerHTML = emptyHTML('Ainda não há equipas registadas. Começa pelos Plantéis.');
    return;
  }

  if (!selectedTeam || !teams.some((t) => t.id === selectedTeam)) {
    selectedTeam = teams[0].id;
  }

  const team = teams.find((t) => t.id === selectedTeam);
  const players = state.players
    .filter((p) => p.team_id === selectedTeam)
    .sort((a, b) => {
      const na = parseInt(a.number, 10);
      const nb = parseInt(b.number, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      if (!isNaN(na)) return -1;
      if (!isNaN(nb)) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

  const editable = canEdit('sizes');

  container.innerHTML = `
    <div class="card" style="margin-bottom:1rem">
      <div class="filters" style="margin:0;padding:0;background:none;border:none;align-items:flex-end">
        <div>
          <label for="enc-team">Equipa</label>
          <select id="enc-team">
            ${teams.map((t) => `
              <option value="${t.id}" ${t.id === selectedTeam ? 'selected' : ''}>${esc(teamName(t))}</option>
            `).join('')}
          </select>
        </div>
        <div class="pres-tabs">
          <button class="pres-tab${tab === 'tamanhos' ? ' pres-tab--active' : ''}" data-tab="tamanhos" type="button">Tamanhos</button>
          <button class="pres-tab${tab === 'resumo' ? ' pres-tab--active' : ''}" data-tab="resumo" type="button">Resumo encomenda</button>
        </div>
        <button class="btn btn--ghost btn--sm" id="enc-export" type="button" style="margin-left:auto" title="Exportar a encomenda desta equipa">⬇ Exportar Excel</button>
      </div>
    </div>

    ${tab === 'tamanhos'
      ? renderTamanhos(players, team, editable)
      : renderResumo(players, team)}
  `;

  container.querySelector('#enc-team').addEventListener('change', (e) => {
    selectedTeam = e.target.value;
    renderEncomendasBody(container);
  });
  container.querySelector('#enc-export').addEventListener('click', (e) => {
    handleExport(e.currentTarget, team, players);
  });
  container.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => { tab = btn.dataset.tab; renderEncomendasBody(container); });
  });
  container.querySelectorAll('[data-edit-sizes]').forEach((btn) => {
    btn.addEventListener('click', () => openSizesModal(btn.dataset.editSizes, container));
  });
}

// ---------------------------------------------------------------------------
// Separador 1: tamanhos por atleta
// ---------------------------------------------------------------------------

function renderTamanhos(players, team, editable) {
  if (!players.length) return emptyHTML('Esta equipa não tem atletas registadas.');

  const articles = equipmentArticles();
  if (!articles.length) {
    return emptyHTML(
      'O clube não tem artigos de equipamento definidos. Configura-os nas Definições → Estrutura.'
    );
  }

  const filled = players.filter((p) => Object.keys(playerSizes(p.id)).length).length;
  const pct = Math.round((filled / players.length) * 100);

  return `
    <div class="card" style="margin-bottom:0.8rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      <span class="muted" style="font-size:0.88rem">
        ${filled} de ${players.length} atleta${players.length !== 1 ? 's' : ''} com tamanhos preenchidos
      </span>
      <div class="enc-progress">
        <div class="enc-progress__bar" style="width:${pct}%"></div>
      </div>
      <span class="muted" style="font-size:0.88rem">${pct}%</span>
    </div>

    <!-- Tabela (desktop) -->
    <div class="enc-table-wrap card">
      <table class="data-table enc-table">
        <thead>
          <tr>
            <th class="enc-col-num">Nº</th>
            <th class="enc-col-player">Atleta</th>
            ${articles.map((a) => `<th class="enc-col-art">${esc(a.label)}</th>`).join('')}
            ${editable ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${players.map((p) => {
            const sizes = playerSizes(p.id);
            const row = state.playerSizes.find((s) => s.player_id === p.id) || {};
            const hasAny = articles.some((a) => sizes[a.key]);
            return `
              <tr class="${hasAny ? '' : 'enc-row--empty'}">
                <td class="enc-col-num">${p.number ? `<span class="badge badge--num">${esc(p.number)}</span>` : '<span class="muted">—</span>'}</td>
                <td class="enc-col-player">
                  <span class="enc-player-name">${esc(p.name)}</span>
                  ${jerseyNameHTML(row)}
                </td>
                ${articles.map((a) => `
                  <td class="enc-col-art enc-col-art--val">
                    ${sizes[a.key]
                      ? `<span class="badge badge--info">${esc(sizes[a.key])}</span>`
                      : '<span class="muted enc-empty">—</span>'}
                  </td>
                `).join('')}
                ${editable ? `
                  <td class="row-actions">
                    <button class="btn btn--ghost btn--sm" data-edit-sizes="${p.id}" type="button">
                      ${hasAny ? 'Editar' : 'Preencher'}
                    </button>
                  </td>
                ` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Cards (mobile) -->
    <div class="enc-cards">
      ${players.map((p) => {
        const sizes = playerSizes(p.id);
        const row = state.playerSizes.find((s) => s.player_id === p.id) || {};
        const hasAny = articles.some((a) => sizes[a.key]);
        return `
          <div class="card enc-card${hasAny ? '' : ' enc-card--empty'}">
            <div class="enc-card-head">
              ${p.number ? `<span class="badge badge--num">${esc(p.number)}</span>` : ''}
              <span class="enc-player-name">${esc(p.name)}</span>
              ${editable ? `<button class="btn btn--ghost btn--sm enc-card-edit" data-edit-sizes="${p.id}" type="button">${hasAny ? 'Editar' : 'Preencher'}</button>` : ''}
            </div>
            ${jerseyNameHTML(row)}
            <dl class="enc-card-dl">
              ${articles.map((a) => `
                <div class="enc-card-dl-row">
                  <dt>${esc(a.label)}</dt>
                  <dd>${sizes[a.key] ? `<span class="badge badge--info">${esc(sizes[a.key])}</span>` : '<span class="muted">—</span>'}</dd>
                </div>
              `).join('')}
            </dl>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Linha com o(s) nome(s) a estampar na camisola. Mostra a alternativa só
// quando difere da principal.
function jerseyNameHTML(sizes) {
  const main = (sizes.nome_camisola || '').trim();
  const alt = (sizes.nome_camisola_alt || '').trim();
  if (!main && !alt) return '';
  const parts = [];
  if (main) parts.push(`👕 ${esc(main)}`);
  if (alt && alt !== main) parts.push(`alt: ${esc(alt)}`);
  return `<span class="enc-jersey-name muted">${parts.join(' · ')}</span>`;
}

// ---------------------------------------------------------------------------
// Separador 2: resumo para encomenda
// ---------------------------------------------------------------------------

function renderResumo(players, team) {
  if (!players.length) return emptyHTML('Esta equipa não tem atletas registadas.');

  const articles = equipmentArticles();
  if (!articles.length) {
    return emptyHTML(
      'O clube não tem artigos de equipamento definidos. Configura-os nas Definições → Estrutura.'
    );
  }

  const sizesMap = {};
  players.forEach((p) => { sizesMap[p.id] = playerSizes(p.id); });

  const sem = players.filter((p) => !Object.keys(sizesMap[p.id]).length).length;

  return `
    ${sem > 0 ? `
      <div class="alert alert--warn" style="margin-bottom:0.9rem">
        ⚠️ ${sem} atleta${sem !== 1 ? 's' : ''} ainda não tem tamanhos preenchidos — o resumo pode estar incompleto.
      </div>
    ` : ''}

    <div class="enc-resumo-grid">
      ${articles.map((article) => {
        const counts = {};
        players.forEach((p) => {
          const v = sizesMap[p.id]?.[article.key];
          if (v) counts[v] = (counts[v] || 0) + 1;
        });
        const entries = sortSizes(Object.keys(counts), article).map((k) => [k, counts[k]]);
        const total = entries.reduce((s, [, n]) => s + n, 0);

        return `
          <div class="card enc-resumo-card">
            <h3 class="enc-resumo-title">${esc(article.label)}</h3>
            ${entries.length
              ? `<ul class="enc-resumo-list">
                  ${entries.map(([size, count]) => `
                    <li class="enc-resumo-row">
                      <span class="badge badge--info enc-resumo-size">${esc(size)}</span>
                      <span class="enc-resumo-count">${count}×</span>
                      <div class="enc-resumo-bar-wrap">
                        <div class="enc-resumo-bar" style="width:${Math.round((count / total) * 100)}%"></div>
                      </div>
                    </li>
                  `).join('')}
                </ul>
                <p class="muted enc-resumo-total">Total: ${total} unidade${total !== 1 ? 's' : ''}</p>`
              : `<p class="muted" style="margin:0.4rem 0 0;font-size:0.85rem">Sem tamanhos registados.</p>`}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Exportar a encomenda (.xlsx)
// ---------------------------------------------------------------------------

async function handleExport(btn, team, players) {
  if (!players.length) {
    alert('Esta equipa não tem atletas para exportar.');
    return;
  }
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'A exportar…';
  try {
    const sizesById = {};
    players.forEach((p) => {
      const row = state.playerSizes.find((s) => s.player_id === p.id) || {};
      sizesById[p.id] = {
        nome_camisola: row.nome_camisola,
        nome_camisola_alt: row.nome_camisola_alt,
        sizes: playerSizes(p.id),
      };
    });
    await exportEncomendaXLSX({
      teamLabel: teamName(team), players, sizesById, articles: equipmentArticles(),
    });
  } catch (err) {
    alert(dbErrorMessage(err) || 'Não foi possível gerar o ficheiro.');
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

// ---------------------------------------------------------------------------
// Modal de edição de tamanhos de um atleta
// ---------------------------------------------------------------------------

function openSizesModal(playerId, container) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return;
  const existing = state.playerSizes.find((s) => s.player_id === playerId) || {};
  const articles = equipmentArticles();
  const current = playerSizes(playerId);

  // Nome a estampar: por omissão o nome do atleta (pode ser alterado).
  const values = {
    nome_camisola: existing.nome_camisola ?? player.name ?? '',
    nome_camisola_alt: existing.nome_camisola_alt ?? player.name ?? '',
  };
  articles.forEach((a) => { values[`art__${a.key}`] = current[a.key] || ''; });

  openModal({
    title: `Tamanhos — ${player.name}`,
    submitLabel: 'Guardar',
    values,
    fields: [
      { name: 'nome_camisola', label: 'Nome na camisola', type: 'text', placeholder: 'Nome a estampar' },
      { name: 'nome_camisola_alt', label: 'Nome na camisola alternativa', type: 'text', placeholder: 'Nome a estampar' },
      // Um artigo sem tamanhos definidos é texto livre: é o caso das meias,
      // que se medem em números e mudam com a marca. Não se inventa um
      // select vazio para ele.
      ...articles.map((a) => ({
        name: `art__${a.key}`,
        label: a.label,
        ...(a.sizes.length
          ? {
              type: 'select',
              placeholder: '— Não definido —',
              options: a.sizes.map((s) => ({ key: s, label: s })),
            }
          : {
              type: 'text',
              placeholder: 'ex.: 36-38',
            }),
      })),
    ],
    // O prefixo `art__` isola as chaves dos artigos das colunas próprias da
    // tabela: um clube que criasse um artigo com a chave `notes` reescrevia
    // as notas do atleta ao gravar o tamanho.
    onSubmit: async (formValues) => {
      const sizes = {};
      articles.forEach((a) => {
        const v = (formValues[`art__${a.key}`] || '').trim();
        if (v) sizes[a.key] = v;
      });
      await upsertPlayerSizes(playerId, {
        nome_camisola: formValues.nome_camisola?.trim() || null,
        nome_camisola_alt: formValues.nome_camisola_alt?.trim() || null,
        sizes,
      });
    },
  });
}
