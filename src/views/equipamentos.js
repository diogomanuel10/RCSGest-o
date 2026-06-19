// Vista: Inventário de equipamentos desportivos.
// CRUD simples com grid de cartões. Campos: nome, categoria, quantidade,
// condição (bom/razoável/mau) e notas.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CONDITIONS,
  CONDITION_LABEL,
  CONDITION_BADGE,
} from '../constants.js';

let page = 1;

export function renderEquipamentos(container) {
  const canWrite = canEdit('equipment');
  const items = state.equipment.slice().sort((a, b) => a.name.localeCompare(b.name));
  const pg = paginate(items, page, PAGE_SIZE);

  // Contagens por condição
  const counts = { bom: 0, razoavel: 0, mau: 0 };
  items.forEach((e) => { if (counts[e.condition] !== undefined) counts[e.condition]++; });

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Equipamentos</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Inventário de material desportivo</p>
      </div>
      ${canWrite ? `<button class="btn btn--accent" id="add-equip" type="button">+ Equipamento</button>` : ''}
    </header>

    <section class="cards-grid aval-summary" style="margin-bottom:1.2rem">
      <div class="card metric metric--green aval-metric">
        <span class="metric__label">Bom estado</span>
        <strong class="metric__value">${counts.bom}</strong>
      </div>
      <div class="card metric metric--warn aval-metric">
        <span class="metric__label">Razoável</span>
        <strong class="metric__value">${counts.razoavel}</strong>
      </div>
      <div class="card metric metric--red aval-metric">
        <span class="metric__label">Mau estado</span>
        <strong class="metric__value">${counts.mau}</strong>
      </div>
      <div class="card metric metric--muted aval-metric">
        <span class="metric__label">Total itens</span>
        <strong class="metric__value">${items.length}</strong>
      </div>
    </section>

    ${items.length
      ? `<div class="equip-grid">
          ${pg.items.map((e) => equipCard(e, canWrite)).join('')}
         </div>
         ${paginationHTML({ ...pg, id: 'equip' })}`
      : emptyHTML('Ainda não há equipamentos no inventário.')
    }
  `;

  container.querySelector('#add-equip')?.addEventListener('click', () => openForm());
  container.querySelectorAll('[data-edit-equip]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.editEquip))
  );
  container.querySelectorAll('[data-del-equip]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.delEquip))
  );
  wirePagination(container, 'equip', pg.page, pg.totalPages, (np) => {
    page = np;
    renderEquipamentos(container);
  });
}

function equipCard(item, canWrite) {
  const condBadge = CONDITION_BADGE[item.condition] || 'muted';
  const condLabel = CONDITION_LABEL[item.condition] || item.condition;

  return `
    <div class="equip-card card">
      <div class="equip-card__head">
        <div class="equip-card__qty">${item.quantity}</div>
        <div class="equip-card__info">
          <span class="equip-card__name">${esc(item.name)}</span>
          ${item.category ? `<span class="muted equip-card__cat">${esc(item.category)}</span>` : ''}
        </div>
        ${canWrite ? `<div class="cell-actions equip-card__actions">
          <button class="btn btn--ghost btn--sm" data-edit-equip="${item.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-del-equip="${item.id}" type="button">Remover</button>
        </div>` : ''}
      </div>
      <div class="equip-card__foot">
        <span class="badge badge--${condBadge}">${esc(condLabel)}</span>
        ${item.notes ? `<span class="equip-card__notes muted">${esc(item.notes)}</span>` : ''}
      </div>
    </div>
  `;
}

function openForm(id) {
  const existing = id ? state.equipment.find((e) => e.id === id) : null;
  openModal({
    title: existing ? 'Editar equipamento' : 'Novo equipamento',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || { condition: 'bom', quantity: 1 },
    fields: [
      { name: 'name', label: 'Nome', required: true, placeholder: 'ex.: Bola de jogo' },
      {
        name: 'category',
        label: 'Categoria',
        type: 'select',
        placeholder: 'Sem categoria',
        options: EQUIPMENT_CATEGORIES.map((c) => ({ key: c, label: c })),
      },
      { name: 'quantity', label: 'Quantidade', type: 'number', required: true },
      {
        name: 'condition',
        label: 'Condição',
        type: 'select',
        required: true,
        options: EQUIPMENT_CONDITIONS,
      },
      { name: 'notes', label: 'Notas', full: true, placeholder: 'Observações opcionais…' },
    ],
    onSubmit: async (values) => {
      const payload = {
        name: values.name?.trim(),
        category: values.category || null,
        quantity: parseInt(values.quantity, 10) || 1,
        condition: values.condition || 'bom',
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('equipment', 'equipment', id, payload);
        else await createRow('equipment', 'equipment', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function remove(id) {
  const item = state.equipment.find((e) => e.id === id);
  const ok = await confirmDialog(`Remover "${item?.name}" do inventário?`);
  if (!ok) return;
  try {
    await deleteRow('equipment', 'equipment', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
