// Vista: Recrutamento — funil Kanban de prospetos.
// Colunas: Observado → Contactado → Em negociação → Confirmado → Inscrito.
// Ao chegar a "Inscrito" pode converter-se em atleta do plantel.

import { state, createRow, updateRow, archiveRow, convertProspect, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { teamName, teamById, currentCoachEscaloes, escaloes as getEscaloes, positions, escalaoColor } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit, canDelete, isCoordenador, isClubWide } from '../permissions.js';
import { PROSPECT_STATUSES, PROSPECT_REJECTED, PROSPECT_LABEL, PROSPECT_BADGE } from '../constants.js';

// Filtros locais da vista.
let positionFilter = '';
let escalaoFilter = '';

// Colunas: funil linear + coluna terminal "Não fica".
const COLUMNS = [...PROSPECT_STATUSES, PROSPECT_REJECTED];

// A partir de quantos dias no funil (sem estar confirmado nem dispensado) um
// prospeto conta como "parado" — precisa de seguimento. Só temos created_at,
// por isso a idade é desde que foi adicionado (não desde a última mudança).
const STALE_DAYS = 30;

function ageDays(p) {
  if (!p.created_at) return null;
  return Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000);
}
function isStale(p) {
  const a = ageDays(p);
  return a != null && a >= STALE_DAYS && p.status !== 'confirmado' && p.status !== 'dispensado';
}

// Ícones (coerentes com o resto da app).
const ICON_EDIT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_REJECT = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>`;
const ICON_ARCHIVE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>`;

// O treinador só vê os prospetos do(s) seu(s) escalão(ões): um prospeto
// pertence a um escalão pela equipa-alvo. O coordenador vê tudo.
function inMyScope(p) {
  if (isClubWide()) return true;
  const escaloes = currentCoachEscaloes();
  if (!escaloes.size) return false;
  const team = p.target_team_id ? teamById(p.target_team_id) : null;
  return !!team && escaloes.has(team.escalao);
}

// Prospetos que o utilizador atual pode ver (respeita o âmbito por escalão).
function scopedProspects() {
  return state.prospects.filter(inMyScope);
}

function prospectEscalao(p) {
  const team = p.target_team_id ? teamById(p.target_team_id) : null;
  return team?.escalao || '';
}

function visibleProspects(statusKey) {
  return scopedProspects()
    .filter((p) => p.status === statusKey)
    .filter((p) => !positionFilter || p.position === positionFilter)
    .filter((p) => !escalaoFilter || prospectEscalao(p) === escalaoFilter)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export function renderRecrutamento(container) {
  const canWrite = canEdit('prospects');
  // Inscrever um prospeto cria uma atleta no plantel — só o coordenador.
  const canConvert = isCoordenador();
  // Arquivar um prospeto é uma decisão do coordenador.
  const canRemove = canDelete('prospects');
  const mine = scopedProspects();
  const filtered = mine
    .filter((p) => !positionFilter || p.position === positionFilter)
    .filter((p) => !escalaoFilter || prospectEscalao(p) === escalaoFilter);
  const total = filtered.length;

  // Saúde do funil (a partir dos prospetos ativos visíveis).
  const byStatus = Object.fromEntries(PROSPECT_STATUSES.map((s) => [s.key, 0]));
  let staleCount = 0;
  filtered.forEach((p) => {
    if (p.status in byStatus) byStatus[p.status]++;
    if (isStale(p)) staleCount++;
  });
  const confirmado = byStatus.confirmado || 0;
  const dispensado = filtered.filter((p) => p.status === 'dispensado').length;
  const activeTotal = PROSPECT_STATUSES.reduce((s, x) => s + byStatus[x.key], 0);

  // Escalões disponíveis: só o coordenador vê todos; treinador já está limitado
  // pelo scope, por isso mostramos apenas os escalões presentes nos prospetos visíveis.
  const escalaoOptions = isClubWide()
    ? getEscaloes()
    : [...new Set(mine.map(prospectEscalao).filter(Boolean))];

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

    ${
      activeTotal || dispensado
        ? `<section class="rec-summary">
             <div class="rec-funnel" role="img" aria-label="Distribuição do funil de recrutamento">
               ${PROSPECT_STATUSES.map(
                 (s, i) => `
                   ${i ? '<span class="rec-funnel__arrow" aria-hidden="true">›</span>' : ''}
                   <div class="rec-funnel__seg rec-funnel__seg--${s.badge}">
                     <span class="rec-funnel__n">${byStatus[s.key]}</span>
                     <span class="rec-funnel__l">${esc(s.label)}</span>
                   </div>`
               ).join('')}
             </div>
             <div class="rec-summary__chips">
               <span class="rec-chip"><b>${activeTotal}</b> no funil</span>
               <span class="rec-chip rec-chip--ok"><b>${confirmado}</b> prontos a inscrever</span>
               ${staleCount ? `<span class="rec-chip rec-chip--warn"><b>${staleCount}</b> parado${staleCount === 1 ? '' : 's'}</span>` : ''}
               ${dispensado ? `<span class="rec-chip rec-chip--muted"><b>${dispensado}</b> não ${dispensado === 1 ? 'fica' : 'ficam'}</span>` : ''}
             </div>
           </section>`
        : ''
    }

    <div class="filter-bar">
      <div class="field">
        <label for="rec-escalao">Escalão</label>
        <select id="rec-escalao">
          <option value="">Todos os escalões</option>
          ${escalaoOptions.map((e) => `<option value="${esc(e)}" ${escalaoFilter === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="rec-pos">Posição</label>
        <select id="rec-pos">
          <option value="">Todas as posições</option>
          ${positions().map((p) => `<option value="${esc(p)}" ${positionFilter === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
        </select>
      </div>
    </div>

    <div class="kanban" id="kanban-board">
      ${COLUMNS.map((col) => columnHTML(col, canWrite, canConvert, canRemove)).join('')}
    </div>
  `;

  container.querySelector('#rec-escalao')?.addEventListener('change', (e) => {
    escalaoFilter = e.target.value;
    renderRecrutamento(container);
  });
  container.querySelector('#rec-pos')?.addEventListener('change', (e) => {
    positionFilter = e.target.value;
    renderRecrutamento(container);
  });

  if (canWrite) {
    container.querySelector('#add-prospect').addEventListener('click', () => openProspectForm());
    wireDragDrop(container);
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
  container.querySelectorAll('[data-prospect-reject]').forEach((btn) =>
    btn.addEventListener('click', () => setStatus(btn.dataset.prospectReject, 'dispensado'))
  );
  container.querySelectorAll('[data-prospect-restore]').forEach((btn) =>
    btn.addEventListener('click', () => setStatus(btn.dataset.prospectRestore, 'observado'))
  );
  container.querySelectorAll('[data-prospect-convert]').forEach((btn) =>
    btn.addEventListener('click', () => openConvertModal(btn.dataset.prospectConvert))
  );
}

// Arrastar cartões entre colunas (desktop). Os botões Avançar/Recuar e "Não
// fica" continuam a funcionar (caminho para teclado e telemóvel).
function wireDragDrop(container) {
  let draggedId = null;

  container.querySelectorAll('.kanban-card[draggable="true"]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      draggedId = card.dataset.cardId;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', draggedId); } catch { /* ignora */ }
    });
    card.addEventListener('dragend', () => {
      draggedId = null;
      card.classList.remove('is-dragging');
      container.querySelectorAll('.kanban-col--drop').forEach((c) => c.classList.remove('kanban-col--drop'));
    });
  });

  container.querySelectorAll('.kanban-col[data-col-status]').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('kanban-col--drop');
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('kanban-col--drop');
    });
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('kanban-col--drop');
      const id = draggedId || e.dataTransfer.getData('text/plain');
      const status = col.dataset.colStatus;
      if (id && status) setStatus(id, status);
    });
  });
}

function columnHTML(col, canWrite, canConvert, canRemove) {
  const prospects = visibleProspects(col.key);
  const rejected = col.key === PROSPECT_REJECTED.key;

  return `
    <div class="kanban-col${rejected ? ' kanban-col--rejected' : ''}" data-col-status="${col.key}">
      <div class="kanban-col__head">
        <span class="badge badge--${col.badge}">${esc(col.label)}</span>
        <span class="kanban-col__count">${prospects.length}</span>
      </div>
      <div class="kanban-col__body">
        ${prospects.length
          ? prospects.map((p) => cardHTML(p, canWrite, canConvert, canRemove)).join('')
          : `<div class="kanban-empty">—</div>`}
      </div>
    </div>
  `;
}

function cardHTML(p, canWrite, canConvert, canRemove) {
  const team = p.target_team_id ? state.teams.find((t) => t.id === p.target_team_id) : null;
  const meta = [
    p.birth_year ? `Nasc. ${esc(p.birth_year)}` : '',
    p.position ? esc(p.position) : '',
    team ? esc(teamName(team)) : '',
  ].filter(Boolean).join(' · ');

  const idx = PROSPECT_STATUSES.findIndex((s) => s.key === p.status);
  const rejected = p.status === PROSPECT_REJECTED.key;
  const isFirst = idx === 0;
  const isConfirmed = p.status === 'confirmado';
  // Cor de identidade pela equipa-alvo (escalão); neutra se sem equipa.
  const color = team ? escalaoColor(team.escalao) : 'var(--border)';
  const stale = isStale(p);
  const age = ageDays(p);

  return `
    <div class="kanban-card${stale ? ' kanban-card--stale' : ''}" style="--tc:${color}"
         ${canWrite ? `draggable="true" data-card-id="${p.id}"` : ''}>
      <div class="kanban-card__head">
        <strong class="kanban-card__name">${esc(p.name)}</strong>
        ${canWrite ? `
          <div class="kanban-card__actions">
            <button class="icon-btn icon-btn--xs" data-prospect-edit="${p.id}" type="button" aria-label="Editar" title="Editar">${ICON_EDIT}</button>
            ${!rejected ? `<button class="icon-btn icon-btn--xs" data-prospect-reject="${p.id}" type="button" aria-label="Não fica" title="Não fica">${ICON_REJECT}</button>` : ''}
            ${canRemove ? `<button class="icon-btn icon-btn--xs icon-btn--danger" data-prospect-del="${p.id}" type="button" aria-label="Arquivar" title="Arquivar">${ICON_ARCHIVE}</button>` : ''}
          </div>` : ''}
      </div>
      ${meta ? `<p class="muted kanban-card__meta">${meta}</p>` : ''}
      ${p.contact ? `<p class="kanban-card__contact">${esc(p.contact)}</p>` : ''}
      ${p.notes ? `<p class="muted kanban-card__notes">${esc(p.notes)}</p>` : ''}
      ${
        stale
          ? `<p class="kanban-card__stale" title="No funil há ${age} dias sem avançar">⚠ Parado há ${age} dias</p>`
          : ''
      }
      ${canWrite ? `
        <div class="kanban-card__foot">
          ${rejected
            ? `<span></span><button class="btn btn--ghost btn--xs" data-prospect-restore="${p.id}" type="button">↩ Repor</button>`
            : `${!isFirst ? `<button class="btn btn--ghost btn--xs" data-prospect-move="${p.id}" data-dir="prev" type="button">← Recuar</button>` : '<span></span>'}
               ${isConfirmed
                 ? (canConvert ? `<button class="btn btn--primary btn--xs" data-prospect-convert="${p.id}" type="button">Inscrever na equipa</button>` : '<span></span>')
                 : `<button class="btn btn--ghost btn--xs" data-prospect-move="${p.id}" data-dir="next" type="button">Avançar →</button>`}`}
        </div>` : ''}
    </div>
  `;
}

function openProspectForm(id) {
  const existing = id ? state.prospects.find((p) => p.id === id) : null;
  // O treinador só pode atribuir prospetos às equipas do(s) seu(s) escalão(ões).
  const escaloes = isClubWide() ? null : currentCoachEscaloes();
  const teamOptions = state.teams
    .filter((t) => !escaloes || escaloes.has(t.escalao))
    .sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((t) => ({ key: t.id, label: teamName(t) }));

  openModal({
    title: existing ? 'Editar prospeto' : 'Novo prospeto',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'birth_year', label: 'Ano de nascimento', placeholder: 'ex.: 2008' },
      { name: 'position', label: 'Posição', type: 'select', placeholder: '—', options: positions() },
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

async function setStatus(id, status) {
  const p = state.prospects.find((x) => x.id === id);
  if (!p || p.status === status) return;
  try {
    await updateRow('prospects', 'prospects', id, { status });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function removeProspect(id) {
  const p = state.prospects.find((x) => x.id === id);
  const ok = await confirmDialog(
    `Arquivar o prospeto "${p?.name}"? Fica no histórico e pode ser reposto nos Arquivados.`,
    { confirmLabel: 'Arquivar', danger: false }
  );
  if (!ok) return;
  try {
    await archiveRow('prospects', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

function openConvertModal(prospectId) {
  const p = state.prospects.find((x) => x.id === prospectId);
  if (!p) return;

  const escaloes = isClubWide() ? null : currentCoachEscaloes();
  const teams = state.teams
    .filter((t) => !escaloes || escaloes.has(t.escalao))
    .sort((a, b) => teamName(a).localeCompare(teamName(b)));
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
