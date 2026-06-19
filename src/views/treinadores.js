// Vista: Treinadores. Fichas com dados de contacto e as equipas que orientam.

import { state, createRow, updateRow, archiveRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import { teamName, coachTeams } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';
import { COACH_ROLE_LABEL } from '../constants.js';

let page = 1;

export function renderTreinadores(container) {
  const editable = canEdit('coaches');
  const coaches = state.coaches.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const pg = paginate(coaches, page, PAGE_SIZE);
  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Treinadores</h1>
      ${editable ? '<button class="btn btn--accent" id="add-coach" type="button">+ Treinador</button>' : ''}
    </header>
    ${
      coaches.length
        ? `<div class="coach-grid">${pg.items.map((c) => coachCard(c, editable)).join('')}</div>
           ${paginationHTML({ ...pg, id: 'coach' })}`
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
  wirePagination(container, 'coach', pg.page, pg.totalPages, (np) => {
    page = np;
    renderTreinadores(container);
  });
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function coachCard(coach, editable) {
  const teams = coachTeams(coach.id);
  return `
    <article class="card coach-card">
      <div class="coach-card__head">
        <div class="coach-card__identity">
          <div class="coach-avatar" aria-hidden="true">${esc(initials(coach.name))}</div>
          <div>
            <strong class="coach-card__name">${esc(coach.name)}</strong>
            ${coach.role ? `<span class="muted coach-card__role">${esc(coach.role)}</span>` : ''}
          </div>
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

      ${coach.contact ? `<p class="coach-card__contact muted">${esc(coach.contact)}</p>` : ''}
      ${
        coach.license_number || coach.tptd
          ? `<div class="coach-card__creds">
              ${coach.license_number ? `<span class="coach-card__cred"><span class="coach-card__cred-label">Nº Licença</span>${esc(coach.license_number)}</span>` : ''}
              ${coach.tptd ? `<span class="coach-card__cred"><span class="coach-card__cred-label">TPTD</span>${esc(coach.tptd)}</span>` : ''}
            </div>`
          : ''
      }
      ${coach.notes ? `<p class="muted coach-card__notes">${esc(coach.notes)}</p>` : ''}

      <div class="coach-card__teams">
        <span class="coach-card__teams-label">Equipas</span>
        ${
          teams.length
            ? teams.map((t) => `<span class="badge badge--${t.role === 'principal' ? 'info' : 'muted'}" title="${esc(COACH_ROLE_LABEL[t.role] || '')}">${esc(teamName(t.team))}</span>`).join(' ')
            : '<span class="muted" style="font-size:0.84rem">Sem equipas atribuídas</span>'
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
      { name: 'license_number', label: 'Nº da Licença', placeholder: 'ex.: 123456' },
      { name: 'tptd', label: 'TPTD', placeholder: 'ex.: Grau II' },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        name: values.name.trim(),
        role: values.role?.trim() || null,
        contact: values.contact?.trim() || null,
        license_number: values.license_number?.trim() || null,
        tptd: values.tptd?.trim() || null,
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
  const n = coachTeams(id).length;
  const extra = n ? ` Deixa de constar nas ${n} equipa(s) que orienta.` : '';
  const ok = await confirmDialog(
    `Arquivar o treinador "${coach?.name}"?${extra} Fica no histórico e pode ser reposto nos Arquivados.`,
    { confirmLabel: 'Arquivar', danger: false }
  );
  if (!ok) return;
  try {
    await archiveRow('coaches', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
