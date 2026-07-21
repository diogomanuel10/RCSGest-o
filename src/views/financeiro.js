// Vista: Gestão Financeira.
// Receitas e despesas do clube, com resumo e filtros. Só o coordenador edita;
// o papel 'leitura' pode consultar (controlado pelo RLS e pela canAccess).

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, euros, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import { financialSummary } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import {
  FINANCIAL_ENTRY_TYPES,
  FINANCIAL_TYPE_LABEL,
  FINANCIAL_TYPE_BADGE,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  MONTHS,
} from '../constants.js';
import { canEdit } from '../permissions.js';

const now = new Date();
const filters = {
  type: '',
  category: '',
  year: now.getFullYear(),
};
let page = 1;

export function renderFinanceiro(container) {
  const editable = canEdit('finances');
  const summary = financialSummary();

  const allYears = buildYears();

  let entries = state.financialEntries.slice();
  if (filters.type) entries = entries.filter((e) => e.type === filters.type);
  if (filters.category) entries = entries.filter((e) => e.category === filters.category);
  if (filters.year) {
    entries = entries.filter((e) => e.date && String(e.date).startsWith(String(filters.year)));
  }
  entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const pg = paginate(entries, page, PAGE_SIZE);

  const allCategories = [...new Set(state.financialEntries.map((e) => e.category))].sort();

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Financeiro</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Receitas e despesas do clube</p>
      </div>
      ${editable ? `<button class="btn btn--accent" id="add-entry" type="button">+ Registo</button>` : ''}
    </header>

    <section class="tier-cards">
      <div class="card tier-card" style="--tier-accent:var(--ok)">
        <span class="tier-card__name">Receitas</span>
        <strong class="tier-card__value" style="color:var(--ok)">${euros(summary.income)}</strong>
        <span class="tier-card__count">${state.financialEntries.filter((e) => e.type === 'receita').length} registo${state.financialEntries.filter((e) => e.type === 'receita').length !== 1 ? 's' : ''}</span>
      </div>
      <div class="card tier-card" style="--tier-accent:var(--info)">
        <span class="tier-card__name">Quotas recebidas</span>
        <strong class="tier-card__value" style="color:var(--info)">${euros(summary.quotas)}</strong>
        <span class="tier-card__count">mensalidades (geridas em Quotas)</span>
      </div>
      <div class="card tier-card" style="--tier-accent:var(--danger)">
        <span class="tier-card__name">Despesas</span>
        <strong class="tier-card__value" style="color:var(--danger)">${euros(summary.expenses)}</strong>
        <span class="tier-card__count">${state.financialEntries.filter((e) => e.type === 'despesa').length} registo${state.financialEntries.filter((e) => e.type === 'despesa').length !== 1 ? 's' : ''}</span>
      </div>
      <div class="card tier-card" style="--tier-accent:var(--navy)">
        <span class="tier-card__name">Saldo</span>
        <strong class="tier-card__value" style="color:${summary.totalBalance >= 0 ? 'var(--ok)' : 'var(--danger)'}">
          ${euros(summary.totalBalance)}
        </strong>
        <span class="tier-card__count">receitas + quotas − despesas</span>
      </div>
    </section>

    <p class="muted" style="margin:-0.4rem 0 1rem;font-size:0.82rem">
      As quotas entram no saldo automaticamente a partir do módulo Quotas; a tabela abaixo é só o livro-razão (receitas/despesas lançadas à mão).
    </p>

    <section class="card">
      <div class="filters">
        <div>
          <label for="f-type">Tipo</label>
          <select id="f-type">
            <option value="">Todos</option>
            ${FINANCIAL_ENTRY_TYPES.map((t) => `
              <option value="${t.key}" ${filters.type === t.key ? 'selected' : ''}>${esc(t.label)}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label for="f-cat">Categoria</label>
          <select id="f-cat">
            <option value="">Todas</option>
            ${allCategories.map((c) => `
              <option value="${esc(c)}" ${filters.category === c ? 'selected' : ''}>${esc(c)}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label for="f-year">Ano</label>
          <select id="f-year">
            <option value="">Todos</option>
            ${allYears.map((y) => `
              <option value="${y}" ${filters.year === y ? 'selected' : ''}>${y}</option>
            `).join('')}
          </select>
        </div>
        <span class="filters__count muted">${entries.length} registo${entries.length !== 1 ? 's' : ''}</span>
      </div>

      ${entries.length ? `
        <div class="scroll-x"><table class="data-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Categoria</th>
              <th>Descrição</th>
              <th style="text-align:right">Valor</th>
              ${editable ? '<th></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${pg.items.map((e) => entryRow(e, editable)).join('')}
          </tbody>
        </table></div>
        ${paginationHTML(pg)}
      ` : emptyHTML('Sem registos para os filtros selecionados.')}
    </section>
  `;

  container.querySelector('#add-entry')?.addEventListener('click', () => openForm());
  container.querySelector('#f-type')?.addEventListener('change', (ev) => {
    filters.type = ev.target.value; page = 1; renderFinanceiro(container);
  });
  container.querySelector('#f-cat')?.addEventListener('change', (ev) => {
    filters.category = ev.target.value; page = 1; renderFinanceiro(container);
  });
  container.querySelector('#f-year')?.addEventListener('change', (ev) => {
    filters.year = ev.target.value ? Number(ev.target.value) : ''; page = 1; renderFinanceiro(container);
  });
  container.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.edit))
  );
  container.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.del))
  );
  wirePagination(container, pg, (p2) => { page = p2; renderFinanceiro(container); });
}

function entryRow(e, editable) {
  const date = e.date
    ? new Date(e.date + 'T00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
  return `
    <tr>
      <td class="muted" style="white-space:nowrap">${esc(date)}</td>
      <td><span class="badge badge--${FINANCIAL_TYPE_BADGE[e.type] || 'muted'}">${esc(FINANCIAL_TYPE_LABEL[e.type] || e.type)}</span></td>
      <td>${esc(e.category || '—')}</td>
      <td>${esc(e.description || '—')}${e.notes ? `<br><span class="muted" style="font-size:0.8rem">${esc(e.notes)}</span>` : ''}</td>
      <td style="text-align:right;font-weight:600;color:${e.type === 'receita' ? 'var(--ok)' : 'var(--danger)'}">
        ${e.type === 'despesa' ? '−' : '+'}${euros(Number(e.amount) || 0)}
      </td>
      ${editable ? `
        <td class="row-actions">
          <button class="btn btn--ghost btn--sm" data-edit="${e.id}" type="button">Editar</button>
          <button class="btn btn--ghost btn--sm btn--danger" data-del="${e.id}" type="button">Remover</button>
        </td>
      ` : ''}
    </tr>
  `;
}

function categoryOptions(type) {
  const cats = type === 'despesa' ? EXPENSE_CATEGORIES : type === 'receita' ? INCOME_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
  return cats.map((c) => ({ key: c, label: c }));
}

function openForm(id) {
  const existing = id ? state.financialEntries.find((e) => e.id === id) : null;
  const isNew = !existing;
  const currentType = existing?.type || 'despesa';

  openModal({
    title: isNew ? 'Novo registo financeiro' : 'Editar registo',
    submitLabel: isNew ? 'Criar' : 'Guardar',
    values: existing || { type: 'despesa', date: new Date().toISOString().slice(0, 10) },
    fields: [
      {
        name: 'type',
        label: 'Tipo',
        type: 'select',
        required: true,
        options: FINANCIAL_ENTRY_TYPES,
      },
      {
        name: 'category',
        label: 'Categoria',
        type: 'select',
        required: true,
        placeholder: 'Escolher…',
        options: categoryOptions(currentType),
      },
      {
        name: 'description',
        label: 'Descrição',
        required: true,
        placeholder: 'Ex.: Compra de bolas de treino',
        full: true,
      },
      {
        name: 'amount',
        label: 'Valor (€)',
        type: 'number',
        required: true,
        placeholder: '0.00',
      },
      {
        name: 'date',
        label: 'Data',
        type: 'date',
        required: true,
      },
      {
        name: 'notes',
        label: 'Notas',
        type: 'textarea',
        placeholder: 'Informação adicional…',
        full: true,
      },
    ],
    onSubmit: async (values) => {
      const payload = {
        type: values.type,
        category: values.category,
        description: values.description.trim(),
        amount: Number(values.amount) || 0,
        date: values.date,
        notes: values.notes?.trim() || null,
      };
      if (isNew) {
        await createRow('financial_entries', 'financialEntries', payload);
      } else {
        await updateRow('financial_entries', 'financialEntries', id, payload);
      }
    },
  });
}

async function remove(id) {
  const e = state.financialEntries.find((x) => x.id === id);
  if (!e) return;
  const label = `${FINANCIAL_TYPE_LABEL[e.type] || e.type} — ${e.description}`;
  confirmDialog(
    `Remover "${label}"?`,
    'Esta ação não pode ser desfeita.',
    async () => {
      await deleteRow('financial_entries', 'financialEntries', id);
    }
  );
}

function buildYears() {
  const years = state.financialEntries
    .map((e) => e.date ? Number(String(e.date).slice(0, 4)) : null)
    .filter(Boolean);
  if (!years.length) return [now.getFullYear()];
  const min = Math.min(...years);
  const max = Math.max(now.getFullYear(), ...years);
  const result = [];
  for (let y = max; y >= min; y--) result.push(y);
  return result;
}
