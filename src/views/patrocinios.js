// Vista: Patrocínios.
// Cartões por nível (confirmados), tabela com filtros e CRUD.
// Regra de negócio: para marcar como "Confirmado" é obrigatório ter nível.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, euros, emptyHTML } from '../ui.js';
import { confirmedByTier } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  TIERS,
  TIER_LABEL,
  SPONSOR_CATEGORIES,
  SPONSOR_STATUSES,
  STATUS_LABEL,
  STATUS_BADGE,
} from '../constants.js';

// Estado local dos filtros (mantido entre re-desenhos da vista).
const filters = { category: '', status: '' };

export function renderPatrocinios(container) {
  const counts = confirmedByTier();

  const filtered = state.sponsors.filter(
    (s) =>
      (!filters.category || s.category === filters.category) &&
      (!filters.status || s.status === filters.status)
  );

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Patrocínios</h1>
      <button class="btn btn--accent" id="add-sponsor" type="button">+ Empresa</button>
    </header>

    <section class="tier-cards">
      ${TIERS.map(
        (t) => `
        <div class="card tier-card tier-card--${t.key}">
          <span class="tier-card__name">${t.label}</span>
          <strong class="tier-card__value">${euros(t.value)}</strong>
          <span class="tier-card__count">${counts[t.key]} confirmado${
          counts[t.key] === 1 ? '' : 's'
        }</span>
        </div>`
      ).join('')}
    </section>

    <section class="card">
      <div class="filters">
        <div>
          <label for="f-cat">Categoria</label>
          <select id="f-cat">
            <option value="">Todas</option>
            ${SPONSOR_CATEGORIES.map(
              (c) =>
                `<option value="${esc(c)}" ${filters.category === c ? 'selected' : ''}>${esc(
                  c
                )}</option>`
            ).join('')}
          </select>
        </div>
        <div>
          <label for="f-status">Estado</label>
          <select id="f-status">
            <option value="">Todos</option>
            ${SPONSOR_STATUSES.map(
              (s) =>
                `<option value="${s.key}" ${filters.status === s.key ? 'selected' : ''}>${esc(
                  s.label
                )}</option>`
            ).join('')}
          </select>
        </div>
        <span class="filters__count muted">${filtered.length} de ${state.sponsors.length}</span>
      </div>

      ${
        filtered.length
          ? `<div class="table-wrap"><table>
              <thead>
                <tr>
                  <th>Empresa</th><th>Categoria</th><th>Nível</th>
                  <th>Estado</th><th>Contacto</th><th></th>
                </tr>
              </thead>
              <tbody>${filtered.map(rowHTML).join('')}</tbody>
            </table></div>`
          : emptyHTML('Sem empresas para os filtros escolhidos.')
      }
    </section>
  `;

  // --- Ligações de eventos ---
  container.querySelector('#add-sponsor').addEventListener('click', () => openForm());
  container.querySelector('#f-cat').addEventListener('change', (e) => {
    filters.category = e.target.value;
    renderPatrocinios(container);
  });
  container.querySelector('#f-status').addEventListener('change', (e) => {
    filters.status = e.target.value;
    renderPatrocinios(container);
  });
  container.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.edit))
  );
  container.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.del, container))
  );
}

function rowHTML(s) {
  const tier = s.tier ? `<span class="badge badge--${s.tier}">${TIER_LABEL[s.tier]}</span>` : '<span class="muted">—</span>';
  return `
    <tr>
      <td>
        <strong>${esc(s.name)}</strong>
        ${s.notes ? `<div class="cell-note muted">${esc(s.notes)}</div>` : ''}
      </td>
      <td>${esc(s.category || '—')}</td>
      <td>${tier}</td>
      <td><span class="badge badge--${STATUS_BADGE[s.status] || 'muted'}">${esc(
    STATUS_LABEL[s.status] || s.status
  )}</span></td>
      <td>${esc(s.contact || '—')}</td>
      <td class="cell-actions">
        <button class="btn btn--ghost btn--sm" data-edit="${s.id}" type="button">Editar</button>
        <button class="btn btn--danger btn--sm" data-del="${s.id}" type="button">Remover</button>
      </td>
    </tr>
  `;
}

function openForm(id) {
  const existing = id ? state.sponsors.find((s) => s.id === id) : null;
  openModal({
    title: existing ? 'Editar empresa' : 'Nova empresa',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { status: 'acontactar' },
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'category', label: 'Categoria', type: 'select', placeholder: '—', options: SPONSOR_CATEGORIES },
      {
        name: 'tier',
        label: 'Nível',
        type: 'select',
        placeholder: 'Sem nível',
        options: TIERS.map((t) => ({ key: t.key, label: `${t.label} (${euros(t.value)})` })),
      },
      {
        name: 'status',
        label: 'Estado',
        type: 'select',
        required: true,
        options: SPONSOR_STATUSES,
      },
      { name: 'contact', label: 'Contacto', placeholder: 'Email ou telefone' },
      {
        name: 'notes',
        label: 'Notas',
        type: 'textarea',
        full: true,
        placeholder: 'Contacto por email individual e personalizado…',
      },
    ],
    onSubmit: async (values) => {
      // Regra: confirmar exige nível.
      if (values.status === 'confirmado' && !values.tier) {
        throw new Error('Para marcar como Confirmado tens de escolher um nível (Ouro, Prata ou Bronze).');
      }
      const payload = {
        name: values.name.trim(),
        category: values.category || null,
        tier: values.tier || '',
        status: values.status,
        contact: values.contact?.trim() || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('sponsors', 'sponsors', id, payload);
        else await createRow('sponsors', 'sponsors', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function remove(id, container) {
  const s = state.sponsors.find((x) => x.id === id);
  const ok = await confirmDialog(`Remover a empresa "${s?.name}"? Esta ação não pode ser anulada.`);
  if (!ok) return;
  try {
    await deleteRow('sponsors', 'sponsors', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
