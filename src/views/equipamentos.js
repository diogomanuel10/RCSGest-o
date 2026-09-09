// Vista: Inventário de equipamentos desportivos.
// CRUD simples com grid de cartões. Campos: nome, categoria, quantidade,
// condição (bom/razoável/mau) e notas.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, wireEmptyAction, PAGE_SIZE } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit, canAccess, canDecideRequests } from '../permissions.js';
import { renderEncomendasBody } from './encomendas.js';
import { renderPedidosBody } from './pedidos.js';
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CONDITIONS,
  CONDITION_LABEL,
  CONDITION_BADGE,
} from '../constants.js';

let page = 1;
let equipTab = 'inventario'; // 'inventario' | 'pedidos' | 'encomendas'

// Orquestrador "Equipamentos": junta o Inventário, os Pedidos (o treinador
// pede material para uma atleta) e as Encomendas (tamanhos por atleta) num só
// ecrã com separadores. As Encomendas são só do coordenador
// (canAccess('encomendas')); o Inventário segue o acesso a 'equipamentos'; os
// Pedidos abrem também ao treinador, que é quem os faz.

// Deixa outra vista (o Painel) escolher o separador antes de navegar para cá.
export function openEquipamentosTab(key) {
  equipTab = key;
}

export function renderEquipamentos(container) {
  const tabs = [];
  if (canAccess('equipamentos')) tabs.push({ key: 'inventario', label: 'Inventário' });
  if (canAccess('pedidos')) tabs.push({ key: 'pedidos', label: pedidosLabel() });
  if (canAccess('encomendas')) tabs.push({ key: 'encomendas', label: 'Encomendas' });
  if (!tabs.some((t) => t.key === equipTab)) equipTab = tabs[0]?.key || 'inventario';

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Equipamentos</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">${esc(headSubtitle(tabs))}</p>
      </div>
      ${tabs.length > 1
        ? `<div class="cal-toggle" role="group" aria-label="Separador">
             ${tabs.map((t) => `<button class="cal-toggle__btn ${equipTab === t.key ? 'cal-toggle__btn--active' : ''}" data-equip-tab="${t.key}" type="button">${esc(t.label)}</button>`).join('')}
           </div>`
        : ''}
    </header>
    <div id="equip-body"></div>
  `;

  container.querySelectorAll('[data-equip-tab]').forEach((b) =>
    b.addEventListener('click', () => { equipTab = b.dataset.equipTab; renderEquipamentos(container); })
  );

  const body = container.querySelector('#equip-body');
  if (equipTab === 'encomendas') renderEncomendasBody(body);
  else if (equipTab === 'pedidos') renderPedidosBody(body);
  else renderInventarioBody(body);
}

// A legenda descreve o que a pessoa tem à frente. Um treinador que só vê os
// Pedidos não devia ler sobre inventário e encomendas — nada disso lhe abre.
function headSubtitle(tabs) {
  const keys = tabs.map((t) => t.key);
  if (keys.length === 1 && keys[0] === 'pedidos') return 'Pedidos de material para as tuas atletas';
  const bits = [];
  if (keys.includes('inventario')) bits.push('inventário do clube');
  if (keys.includes('pedidos')) bits.push('pedidos dos treinadores');
  if (keys.includes('encomendas')) bits.push('encomendas por atleta');
  return bits.join(' · ').replace(/^./, (c) => c.toUpperCase());
}

// O número de pedidos por decidir vai no próprio separador: um pedido que
// ninguém vê é igual à mensagem de telemóvel que isto veio substituir. Só
// aparece a quem decide — para o treinador o contador seria o seu próprio
// pedido a olhar para ele.
function pedidosLabel() {
  if (!canDecideRequests()) return 'Pedidos';
  const n = state.equipmentRequests.filter((r) => r.status === 'pendente').length;
  return n ? `Pedidos (${n})` : 'Pedidos';
}

function renderInventarioBody(container) {
  const canWrite = canEdit('equipment');
  const items = state.equipment.slice().sort((a, b) => a.name.localeCompare(b.name));
  const pg = paginate(items, page, PAGE_SIZE);

  // Contagens por condição
  const counts = { bom: 0, razoavel: 0, mau: 0 };
  items.forEach((e) => { if (counts[e.condition] !== undefined) counts[e.condition]++; });

  container.innerHTML = `
    ${canWrite ? '<div style="display:flex;justify-content:flex-end;margin-bottom:1rem"><button class="btn btn--accent" id="add-equip" type="button">+ Equipamento</button></div>' : ''}

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
      : emptyHTML('Ainda não há equipamentos no inventário.', {
          icone: '👕',
          action: canWrite ? { key: 'add-equip', label: '+ Registar equipamento' } : null,
        })
    }
  `;

  container.querySelector('#add-equip')?.addEventListener('click', () => openForm());
  wireEmptyAction(container, 'add-equip', () => openForm());
  container.querySelectorAll('[data-edit-equip]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.editEquip))
  );
  container.querySelectorAll('[data-del-equip]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.delEquip))
  );
  wirePagination(container, 'equip', pg.page, pg.totalPages, (np) => {
    page = np;
    renderInventarioBody(container);
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
