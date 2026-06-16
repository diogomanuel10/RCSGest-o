// Vista: Treinadores. Fichas com dados de contacto e as equipas que orientam.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { teamName } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';

export function renderTreinadores(container) {
  const editable = canEdit('coaches');
  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Treinadores</h1>
      ${editable ? '<button class="btn btn--accent" id="add-coach" type="button">+ Treinador</button>' : ''}
    </header>
    ${
      state.coaches.length
        ? `<div class="coach-grid">${state.coaches.map((c) => coachCard(c, editable)).join('')}</div>`
        : emptyHTML('Ainda não há treinadores.')
    }
  `;

  container.querySelector('#add-coach')?.addEventListener('click', () => openForm());
  container.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.edit))
  );
  container.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.del))
  );
}

function coachCard(coach, editable) {
  const teams = state.teams.filter((t) => t.coach_id === coach.id);
  return `
    <article class="card coach-card">
      <div class="coach-card__head">
        <div>
          <strong class="coach-card__name">${esc(coach.name)}</strong>
          ${coach.role ? `<span class="muted coach-card__role">${esc(coach.role)}</span>` : ''}
        </div>
        ${
          editable
            ? `<div class="cell-actions">
          <button class="btn btn--ghost btn--sm" data-edit="${coach.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-del="${coach.id}" type="button">Remover</button>
        </div>`
            : ''
        }
      </div>

      ${coach.contact ? `<p class="coach-card__contact">${esc(coach.contact)}</p>` : ''}
      ${coach.notes ? `<p class="muted coach-card__notes">${esc(coach.notes)}</p>` : ''}

      <div class="coach-card__teams">
        <span class="coach-card__teams-label">Equipas</span>
        ${
          teams.length
            ? teams.map((t) => `<span class="badge badge--muted">${esc(teamName(t))}</span>`).join(' ')
            : '<span class="muted">Sem equipas atribuídas</span>'
        }
      </div>
    </article>
  `;
}

function openForm(id) {
  const existing = id ? state.coaches.find((c) => c.id === id) : null;
  openModal({
    title: existing ? 'Editar treinador' : 'Novo treinador',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'role', label: 'Função', placeholder: 'ex.: Treinador principal' },
      { name: 'contact', label: 'Contacto', placeholder: 'Email ou telefone' },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        name: values.name.trim(),
        role: values.role?.trim() || null,
        contact: values.contact?.trim() || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('coaches', 'coaches', id, payload);
        else await createRow('coaches', 'coaches', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function remove(id) {
  const coach = state.coaches.find((c) => c.id === id);
  const n = state.teams.filter((t) => t.coach_id === id).length;
  const extra = n ? ` As ${n} equipas que orienta ficam sem treinador atribuído.` : '';
  const ok = await confirmDialog(`Remover o treinador "${coach?.name}"?${extra}`);
  if (!ok) return;
  try {
    await deleteRow('coaches', 'coaches', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
