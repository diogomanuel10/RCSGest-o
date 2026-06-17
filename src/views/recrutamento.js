// Vista: Recrutamento — funil Kanban de prospetos.
// Colunas: Observado → Contactado → Em negociação → Confirmado → Inscrito.
// Ao chegar a "Inscrito" pode converter-se em atleta do plantel.

import { state, createRow, updateRow, deleteRow, convertProspect, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { teamName } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';
import { PROSPECT_STATUSES, PROSPECT_LABEL, PROSPECT_BADGE, POSITIONS } from '../constants.js';

export function renderRecrutamento(container) {
  const canWrite = canEdit('prospects');
  const total = state.prospects.length;

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Recrutamento</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          ${total} prospeto${total === 1 ? '' : 's'} no funil
        </p>
      </div>
      ${canWrite ? `<button class="btn btn--accent" id="add-prospect" type="button">+ Prospeto</button>` : ''}
    </header>

    <div class="kanban" id="kanban-board">
      ${PROSPECT_STATUSES.map((col) => columnHTML(col, canWrite)).join('')}
    </div>
  `;

  if (canWrite) {
    container.querySelector('#add-prospect').addEventListener('click', () => openProspectForm());
  }

  container.querySelectorAll('[data-prospect-edit]').forEach((btn) =>
    btn.addEventListener('click', () => openProspectForm(btn.dataset.prospectEdit))
  );
  container.querySelectorAll('[data-prospect-del]').forEach((btn) =>
    btn.addEventListener('click', () => removeProspect(btn.dataset.prospectDel))
  );
  container.querySelectorAll('[data-prospect-move]').forEach((btn) =>
    btn.addEventListener('click', () => moveProspect(btn.dataset.prospectMove, btn.dataset.dir))
  );
  container.querySelectorAll('[data-prospect-convert]').forEach((btn) =>
    btn.addEventListener('click', () => openConvertModal(btn.dataset.prospectConvert))
  );
}

function columnHTML(col, canWrite) {
  const prospects = state.prospects
    .filter((p) => p.status === col.key)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const isFirst = col.key === PROSPECT_STATUSES[0].key;
  const isLast  = col.key === PROSPECT_STATUSES[PROSPECT_STATUSES.length - 1].key;

  return `
    <div class="kanban-col">
      <div class="kanban-col__head">
        <span class="badge badge--${col.badge}">${esc(col.label)}</span>
        <span class="kanban-col__count">${prospects.length}</span>
      </div>
      <div class="kanban-col__body">
        ${prospects.length
          ? prospects.map((p) => cardHTML(p, canWrite, isFirst, isLast)).join('')
          : `<div class="kanban-empty">—</div>`}
      </div>
    </div>
  `;
}

function cardHTML(p, canWrite, isFirst, isLast) {
  const team = p.target_team_id ? state.teams.find((t) => t.id === p.target_team_id) : null;
  const meta = [
    p.birth_year ? `Nasc. ${esc(p.birth_year)}` : '',
    p.position ? esc(p.position) : '',
    team ? esc(teamName(team)) : '',
  ].filter(Boolean).join(' · ');

  return `
    <div class="kanban-card">
      <div class="kanban-card__head">
        <strong class="kanban-card__name">${esc(p.name)}</strong>
        ${canWrite ? `
          <div class="kanban-card__actions">
            <button class="btn btn--ghost btn--xs" data-prospect-edit="${p.id}" type="button" title="Editar">✎</button>
            <button class="btn btn--danger btn--xs" data-prospect-del="${p.id}" type="button" title="Remover">×</button>
          </div>` : ''}
      </div>
      ${meta ? `<p class="muted kanban-card__meta">${meta}</p>` : ''}
      ${p.contact ? `<p class="kanban-card__contact">${esc(p.contact)}</p>` : ''}
      ${p.notes ? `<p class="muted kanban-card__notes">${esc(p.notes)}</p>` : ''}
      ${canWrite ? `
        <div class="kanban-card__foot">
          ${!isFirst ? `<button class="btn btn--ghost btn--xs" data-prospect-move="${p.id}" data-dir="prev" type="button">← Recuar</button>` : '<span></span>'}
          ${isLast
            ? `<button class="btn btn--primary btn--xs" data-prospect-convert="${p.id}" type="button">Inscrever no plantel</button>`
            : `<button class="btn btn--ghost btn--xs" data-prospect-move="${p.id}" data-dir="next" type="button">Avançar →</button>`}
        </div>` : ''}
    </div>
  `;
}

function openProspectForm(id) {
  const existing = id ? state.prospects.find((p) => p.id === id) : null;
  const teamOptions = state.teams
    .slice()
    .sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((t) => ({ key: t.id, label: teamName(t) }));

  openModal({
    title: existing ? 'Editar prospeto' : 'Novo prospeto',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'birth_year', label: 'Ano de nascimento', placeholder: 'ex.: 2008' },
      { name: 'position', label: 'Posição', type: 'select', placeholder: '—', options: POSITIONS },
      {
        name: 'target_team_id',
        label: 'Equipa-alvo',
        type: 'select',
        placeholder: 'Sem equipa definida',
        options: teamOptions,
        full: true,
      },
      { name: 'contact', label: 'Contacto', placeholder: 'Telefone, email ou nome do encarregado', full: true },
      { name: 'notes', label: 'Notas', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        name: values.name.trim(),
        birth_year: values.birth_year?.trim() || null,
        position: values.position || null,
        target_team_id: values.target_team_id || null,
        contact: values.contact?.trim() || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('prospects', 'prospects', id, payload);
        else await createRow('prospects', 'prospects', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function moveProspect(id, dir) {
  const p = state.prospects.find((x) => x.id === id);
  if (!p) return;
  const idx = PROSPECT_STATUSES.findIndex((s) => s.key === p.status);
  const next = dir === 'next'
    ? PROSPECT_STATUSES[idx + 1]
    : PROSPECT_STATUSES[idx - 1];
  if (!next) return;
  try {
    await updateRow('prospects', 'prospects', id, { status: next.key });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function removeProspect(id) {
  const p = state.prospects.find((x) => x.id === id);
  const ok = await confirmDialog(`Remover o prospeto "${p?.name}"?`);
  if (!ok) return;
  try {
    await deleteRow('prospects', 'prospects', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

function openConvertModal(prospectId) {
  const p = state.prospects.find((x) => x.id === prospectId);
  if (!p) return;

  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));
  const defaultTeam = p.target_team_id || teams[0]?.id || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="conv-title" style="width:min(460px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="conv-title">Inscrever no plantel</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p style="margin:0 0 1rem;font-size:0.9rem">
        <strong>${esc(p.name)}</strong> vai ser adicionado como atleta à equipa escolhida.
        O registo de recrutamento será removido.
      </p>
      <div class="field field--full">
        <label for="conv-team">Equipa *</label>
        <select id="conv-team" required>
          <option value="">Escolhe…</option>
          ${teams.map((t) => `<option value="${t.id}" ${t.id === defaultTeam ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
        </select>
      </div>
      <div id="conv-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="conv-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="conv-confirm" type="button">Inscrever</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  overlay.querySelector('#conv-team').focus();

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#conv-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#conv-confirm').addEventListener('click', async () => {
    const teamId = overlay.querySelector('#conv-team').value;
    const errEl = overlay.querySelector('#conv-err');
    const btn = overlay.querySelector('#conv-confirm');
    errEl.classList.add('hidden');
    if (!teamId) {
      errEl.textContent = 'Escolhe uma equipa.';
      errEl.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'A inscrever…';
    try {
      await convertProspect(prospectId, teamId);
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Inscrever';
    }
  });
}
