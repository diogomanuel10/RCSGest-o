// Modal de plano de treino + avaliação pós treino.
// Abre a partir do Painel (secção "Presenças por marcar"), associado 1:1
// a um evento de tipo 'treino'. Tem dois separadores:
//   • Plano de treino  — material, objetivo, notas e blocos de trabalho ordenados.
//   • Avaliação pós treino — nota geral do treinador + avaliação por atleta.

import {
  state,
  createRow,
  updateRow,
  deleteRow,
  upsertTrainingPlan,
  upsertTrainingEvaluation,
  upsertPlayerEval,
  dbErrorMessage,
} from '../store.js';
import { esc, safeUrl, linkHost } from '../ui.js';
import { openModal, confirmDialog, wireDialog } from '../modal.js';
import { canEdit } from '../permissions.js';
import { toastError } from '../toast.js';
import { openExercisePicker, exercisePayload } from './exercicios.js';
import { PLAN_CATEGORIES, PLAN_CATEGORY_LABEL, PLAN_CATEGORY_BADGE } from '../constants.js';
import { eventTimeRange, teamById, teamName } from '../compute.js';

const STAR_ON  = '#f59e0b';
const STAR_OFF = 'var(--muted,#9ca3af)';

// Ligação escrita pelo treinador (plano feito noutra app, vídeo do exercício).
// Só se desenha quando o endereço é mesmo http(s) — ver `safeUrl` em ui.js.
function linkChipHTML(value, label = 'Abrir') {
  const url = safeUrl(value);
  if (!url) return '';
  const host = linkHost(url);
  return `
    <a class="tp-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">
      <span class="tp-link__icon" aria-hidden="true">↗</span>
      <span class="tp-link__text">${esc(label)}${host ? ` · ${esc(host)}` : ''}</span>
    </a>`;
}

// Devolve a duração do evento em minutos, ou null se não tiver hora de início/fim.
function eventDurationMin(event) {
  if (!event?.time || !event?.end_time) return null;
  const [sh, sm] = event.time.split(':').map(Number);
  const [eh, em] = event.end_time.split(':').map(Number);
  const diff = (eh * 60 + em) - (sh * 60 + sm);
  return diff > 0 ? diff : null;
}

// Abre o modal do plano de treino para o evento indicado.
export function openTrainingPlan(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return;

  let activeTab = 'plan';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay tp-overlay';
  overlay.innerHTML = buildShell(event);

  const close = wireDialog(overlay);
  overlay.querySelector('[data-tp-close]').addEventListener('click', close);

  const body = overlay.querySelector('[data-tp-body]');

  overlay.querySelectorAll('[data-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      overlay.querySelectorAll('[data-tab]').forEach((b) =>
        b.classList.toggle('ap-tab--active', b.dataset.tab === activeTab)
      );
      paintTab();
    })
  );

  function paintTab() {
    if (activeTab === 'eval') paintEvalTab(body, eventId);
    else paintPlanTab(body, eventId);
  }

  paintTab();
}

// Constrói a estrutura fixa do modal (cabeçalho + separadores + área de corpo).
function buildShell(event) {
  const team = teamById(event.team_id);
  const range = eventTimeRange(event);
  const date = new Date(event.date + 'T00:00:00').toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long',
  });
  return `
    <div class="modal card tp-modal" role="dialog" aria-modal="true" aria-label="Plano de treino">
      <div class="modal__head">
        <div class="tp-head__text">
          <h2 class="section-title tp-title">
            ${esc(team ? teamName(team) : (event.title || 'Treino'))}
          </h2>
          <p class="muted tp-subtitle">
            ${esc(date)}${range ? ' · ' + esc(range) : ''}
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="ap-tabs tp-tabs" role="tablist">
        <button class="ap-tab ap-tab--active" data-tab="plan" type="button" role="tab">Plano</button>
        <button class="ap-tab" data-tab="eval" type="button" role="tab">Avaliação</button>
      </div>
      <div class="tp-body" data-tp-body></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" data-tp-close type="button">Fechar</button>
      </div>
    </div>
  `;
}

// =========================================================================
// Separador: Plano de treino
// =========================================================================

function paintPlanTab(body, eventId) {
  const event = state.events.find((e) => e.id === eventId);
  const plan  = state.trainingPlans.find((p) => p.event_id === eventId);
  const items = plan
    ? state.trainingPlanItems
        .filter((i) => i.plan_id === plan.id)
        .sort((a, b) => a.position - b.position)
    : [];
  const canWrite = canEdit('training_plans');

  body.innerHTML = `
    <div class="tp-pane">
      ${renderTotalizer(items, event)}
      ${renderPlanHeader(plan, canWrite)}
      ${renderItemList(items, canWrite, canEdit('exercises'))}
      ${canWrite
        ? `<div class="tp-add">
             <button class="btn btn--primary btn--sm" data-add-item type="button">+ Adicionar exercício</button>
             <button class="btn btn--ghost btn--sm" data-from-library type="button">Da biblioteca</button>
           </div>`
        : ''}
    </div>
  `;

  if (!canWrite) return;

  body.querySelector('[data-edit-header]')?.addEventListener('click', () => {
    openModal({
      title: plan ? 'Editar cabeçalho do plano' : 'Definir objetivo do treino',
      fields: [
        {
          name: 'material', label: 'Material necessário', type: 'text', full: true,
          placeholder: 'Ex.: Bolas, coletes, cones, antenas…',
        },
        {
          name: 'objective', label: 'Objetivo do treino', type: 'text', full: true,
          placeholder: 'Ex.: Trabalho de receção e finalização',
        },
        {
          name: 'notes', label: 'Notas gerais', type: 'textarea', full: true,
          placeholder: 'Informações adicionais para os atletas…',
        },
        {
          name: 'link_url', label: 'Ligação do plano', type: 'text', full: true,
          placeholder: 'https://…',
          hint: 'Para o treino montado noutra app (quadro tático, folha partilhada, vídeo).',
        },
      ],
      values: plan
        ? {
            material: plan.material || '', objective: plan.objective || '',
            notes: plan.notes || '', link_url: plan.link_url || '',
          }
        : {},
      submitLabel: 'Guardar',
      async onSubmit(vals) {
        const link = vals.link_url?.trim() || '';
        if (link && !safeUrl(link)) {
          throw new Error('A ligação tem de ser um endereço http:// ou https://.');
        }
        await upsertTrainingPlan(eventId, {
          material:  vals.material.trim()  || null,
          objective: vals.objective.trim() || null,
          notes:     vals.notes.trim()     || null,
          link_url:  safeUrl(link),
        });
        paintPlanTab(body, eventId);
      },
    });
  });

  body.querySelector('[data-add-item]')?.addEventListener('click', () => {
    openItemModal({ body, eventId, plan, items });
  });

  // Puxar um exercício da biblioteca do clube. Os campos são COPIADOS para o
  // plano: um treino que já aconteceu é um registo histórico, e se apontasse
  // para a biblioteca, editar o exercício amanhã reescrevia o que se treinou.
  body.querySelector('[data-from-library]')?.addEventListener('click', () => {
    const teamSize = event?.team_id
      ? state.players.filter((p) => p.team_id === event.team_id).length
      : 0;
    openExercisePicker({
      teamSize,
      async onPick(ex) {
        const planRecord = plan || (await upsertTrainingPlan(eventId, {}));
        await createRow('training_plan_items', 'trainingPlanItems', {
          plan_id:      planRecord.id,
          exercise_id:  ex.id,
          category:     ex.category || 'outro',
          name:         ex.name,
          duration_min: ex.duration_min ?? null,
          organization: ex.organization ?? null,
          objective:    ex.objective    ?? null,
          reps:         ex.reps         ?? null,
          description:  ex.description  ?? null,
          link_url:     ex.link_url     ?? null,
          position:     items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0,
        });
        paintPlanTab(body, eventId);
      },
    });
  });

  // Guardar um bloco escrito à mão na biblioteca, para não o reescrever no
  // mês que vem. Só aparece nos blocos que ainda não vieram de lá.
  body.querySelectorAll('[data-save-item]').forEach((btn) => {
    const item = state.trainingPlanItems.find((i) => i.id === btn.dataset.saveItem);
    if (!item) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const created = await createRow('exercises', 'exercises', exercisePayload(item));
        // Liga o bloco ao exercício criado — é assim que a biblioteca sabe,
        // depois, quais são os exercícios que se usam mesmo.
        await updateRow('training_plan_items', 'trainingPlanItems', item.id, { exercise_id: created.id });
        paintPlanTab(body, eventId);
      } catch (err) {
        btn.disabled = false;
        toastError(dbErrorMessage(err));
      }
    });
  });

  body.querySelectorAll('[data-edit-item]').forEach((btn) => {
    const item = state.trainingPlanItems.find((i) => i.id === btn.dataset.editItem);
    if (item) btn.addEventListener('click', () => openItemModal({ body, eventId, plan, items, item }));
  });

  body.querySelectorAll('[data-delete-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmDialog('Remover este exercício do plano?', { confirmLabel: 'Remover', danger: true }))) return;
      await deleteRow('training_plan_items', 'trainingPlanItems', btn.dataset.deleteItem);
      paintPlanTab(body, eventId);
    });
  });
}

// Totalizador de duração: soma dos blocos vs. duração real do treino.
function renderTotalizer(items, event) {
  const planned  = items.reduce((s, i) => s + (i.duration_min || 0), 0);
  const treino   = eventDurationMin(event);

  if (!planned && !treino) return '';

  let barHtml = '';
  let pctLabel = '';
  if (treino) {
    const pct   = Math.min(100, Math.round((planned / treino) * 100));
    const over  = planned > treino;
    const near  = pct >= 85;
    // A barra é forma e leva o tom cheio; a percentagem é texto pequeno e
    // leva a tinta (ver os tokens `-ink` em style.css).
    const color = over ? 'var(--danger)' : near ? 'var(--gold)' : 'var(--info)';
    const ink   = over ? 'var(--danger-ink)' : near ? 'var(--gold-ink)' : 'var(--info-ink)';
    pctLabel = `<span class="tp-total__pct" style="color:${ink}">${pct}%${over ? ' — acima do tempo' : ''}</span>`;
    barHtml  = `
      <div class="tp-total__track">
        <div class="tp-total__fill" style="width:${pct}%;background:${color}"></div>
      </div>`;
  }

  return `
    <div class="tp-total">
      <div class="tp-total__line">
        <span>
          Total previsto: <strong>${planned} min</strong>
          ${treino ? `<span class="muted"> | Treino: ${treino} min</span>` : ''}
        </span>
        ${pctLabel}
      </div>
      ${barHtml}
    </div>
  `;
}

function renderPlanHeader(plan, canWrite) {
  if (!plan) {
    return canWrite
      ? `<div class="tp-planhead tp-planhead--empty">
           <p class="muted" style="margin:0 0 0.5rem">Ainda sem plano para este treino.</p>
           <button class="btn btn--ghost btn--sm" data-edit-header type="button">Definir objetivo / notas</button>
         </div>`
      : `<p class="muted" style="margin:0 0 1rem">Ainda sem plano para este treino.</p>`;
  }
  const hasContent = plan.material || plan.objective || plan.notes || safeUrl(plan.link_url);
  return `
    <div class="card tp-planhead">
      ${plan.material
        ? `<p style="margin:0${(plan.objective || plan.notes) ? ' 0 0.25rem' : ''}">
             <strong>Material:</strong> ${esc(plan.material)}
           </p>`
        : ''}
      ${plan.objective
        ? `<p style="margin:0${plan.notes ? ' 0 0.25rem' : ''}">
             <strong>Objetivo:</strong> ${esc(plan.objective)}
           </p>`
        : ''}
      ${plan.notes
        ? `<p class="muted" style="margin:0;font-size:0.9rem;white-space:pre-wrap">${esc(plan.notes)}</p>`
        : ''}
      ${linkChipHTML(plan.link_url, 'Abrir o plano')}
      ${!hasContent ? '<p class="muted" style="margin:0">Sem objetivo definido.</p>' : ''}
      ${canWrite
        ? `<button class="btn btn--ghost btn--sm" data-edit-header type="button" style="margin-top:0.6rem">Editar</button>`
        : ''}
    </div>
  `;
}

function renderItemList(items, canWrite, canLibrary = false) {
  if (!items.length) {
    return `<p class="muted" style="margin:0 0 1rem">Sem exercícios no plano.</p>`;
  }
  return `
    <ul class="tp-items">
      ${items.map((item) => {
        const meta = [
          item.organization ? `Organização: ${esc(item.organization)}` : '',
          item.objective    ? `Objetivo: ${esc(item.objective)}`    : '',
          item.reps         ? `Reps: ${esc(item.reps)}`             : '',
        ].filter(Boolean).join(' · ');
        return `
          <li class="tp-item">
            <span class="badge badge--${PLAN_CATEGORY_BADGE[item.category] || 'muted'} tp-item__cat">
              ${esc(PLAN_CATEGORY_LABEL[item.category] || item.category)}
            </span>
            <div class="tp-item__main">
              <strong>${esc(item.name)}</strong>${item.duration_min
                ? ` <span class="muted">(${item.duration_min} min)</span>`
                : ''}
              ${meta
                ? `<p class="tp-item__meta">${meta}</p>`
                : ''}
              ${item.description
                ? `<p class="muted tp-item__desc">${esc(item.description)}</p>`
                : ''}
              ${linkChipHTML(item.link_url, 'Abrir')}
            </div>
            ${canWrite ? `
              <div class="tp-item__actions">
                ${canLibrary && !item.exercise_id
                  ? `<button class="btn btn--ghost btn--sm" data-save-item="${item.id}" type="button"
                             title="Guardar na biblioteca de exercícios">Guardar</button>`
                  : ''}
                <button class="btn btn--ghost btn--sm" data-edit-item="${item.id}" type="button" aria-label="Editar exercício">✏</button>
                <button class="btn btn--ghost btn--sm" data-delete-item="${item.id}" type="button" aria-label="Remover exercício">✕</button>
              </div>
            ` : ''}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function openItemModal({ body, eventId, plan, items, item = null }) {
  const nextPos = item
    ? item.position
    : (items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0);

  openModal({
    title: item ? 'Editar exercício' : 'Adicionar exercício',
    fields: [
      {
        name: 'category', label: 'Categoria', type: 'select', required: true,
        options: PLAN_CATEGORIES, default: 'outro',
      },
      {
        name: 'name', label: 'Nome do exercício', type: 'text', required: true, full: true,
        placeholder: 'Ex.: Receção-ataque em 6×6',
      },
      { name: 'duration_min', label: 'Duração (min)', type: 'number', placeholder: 'Ex.: 15' },
      {
        name: 'organization', label: 'Organização', type: 'text', full: true,
        placeholder: 'Ex.: Pares, Grupos de 3, 6×6, equipa completa…',
      },
      {
        name: 'objective', label: 'Objetivo', type: 'text', full: true,
        placeholder: 'Ex.: Passe, receção, bloco, finalização…',
      },
      {
        name: 'reps', label: 'Repetições / séries', type: 'text',
        placeholder: 'Ex.: 3×10, 5 min, 2 séries',
      },
      {
        name: 'description', label: 'Descrição / notas', type: 'textarea', full: true,
        placeholder: 'Variantes, progressões, pontos de atenção…',
      },
      {
        name: 'link_url', label: 'Ligação', type: 'text', full: true,
        placeholder: 'https://…',
        hint: 'Vídeo do exercício ou ficha noutra app.',
      },
    ],
    values: item
      ? {
          category:     item.category,
          name:         item.name,
          duration_min: item.duration_min ?? '',
          organization: item.organization ?? '',
          objective:    item.objective    ?? '',
          reps:         item.reps         ?? '',
          description:  item.description  ?? '',
          link_url:     item.link_url     ?? '',
        }
      : {},
    submitLabel: item ? 'Guardar' : 'Adicionar',
    async onSubmit(vals) {
      if (!vals.name.trim()) throw new Error('O nome do exercício é obrigatório.');
      const link = vals.link_url?.trim() || '';
      if (link && !safeUrl(link)) {
        throw new Error('A ligação tem de ser um endereço http:// ou https://.');
      }
      const planRecord = plan || (await upsertTrainingPlan(eventId, {}));
      const data = {
        plan_id:      planRecord.id,
        category:     vals.category     || 'outro',
        name:         vals.name.trim(),
        duration_min: vals.duration_min  ? parseInt(vals.duration_min, 10) : null,
        organization: vals.organization?.trim() || null,
        objective:    vals.objective?.trim()    || null,
        reps:         vals.reps?.trim()         || null,
        description:  vals.description?.trim()  || null,
        link_url:     safeUrl(link),
        position:     nextPos,
      };
      if (item) {
        await updateRow('training_plan_items', 'trainingPlanItems', item.id, data);
      } else {
        await createRow('training_plan_items', 'trainingPlanItems', data);
      }
      paintPlanTab(body, eventId);
    },
  });
}

// =========================================================================
// Separador: Avaliação pós treino
// =========================================================================

function paintEvalTab(body, eventId) {
  const event   = state.events.find((e) => e.id === eventId);
  const team    = event ? teamById(event.team_id) : null;
  const players = team
    ? state.players
        .filter((p) => p.team_id === team.id)
        .sort((a, b) => {
          const na = parseInt(a.number, 10) || 999;
          const nb = parseInt(b.number, 10) || 999;
          return na !== nb ? na - nb : (a.name || '').localeCompare(b.name || '');
        })
    : [];

  const evalData   = state.trainingEvaluations.find((e) => e.event_id === eventId);
  const evalId     = evalData?.id;
  const existingPE = evalId
    ? state.trainingPlayerEvals.filter((e) => e.evaluation_id === evalId)
    : [];
  const canWrite = canEdit('training_plans');

  // Ratings locais (actualizam-se ao clicar nas estrelas sem re-render completo).
  let overallRating = evalData?.overall_rating || 0;
  const playerRatings = {};
  players.forEach((p) => {
    const pe = existingPE.find((e) => e.player_id === p.id);
    playerRatings[p.id] = pe?.effort_rating || 0;
  });

  body.innerHTML = `
    <div class="tp-pane">
      <div class="tp-field">
        <label class="tp-label">
          Avaliação geral do treino
        </label>
        <div class="tp-stars" data-overall-stars>
          ${starsHTML(overallRating, canWrite)}
          <span class="muted tp-stars__label" data-overall-label>
            ${overallRating ? overallRating + '/5' : 'Não avaliado'}
          </span>
        </div>
      </div>

      <div class="field tp-field">
        <label for="eval-notes">Notas gerais</label>
        <textarea id="eval-notes" rows="3"
                  placeholder="Observações sobre o treino…"
                  ${!canWrite ? 'disabled' : ''}>${esc(evalData?.notes || '')}</textarea>
      </div>

      ${players.length ? `
        <h3 class="tp-eval-title">
          Avaliação por atleta
          <span class="muted" style="font-weight:normal;font-size:0.85rem">(opcional)</span>
        </h3>
        <ul class="tp-eval-list">
          ${players.map((p) => {
            const pr = playerRatings[p.id] || 0;
            const pe = existingPE.find((e) => e.player_id === p.id);
            return `
              <li class="tp-eval-row">
                <span class="tp-eval-row__name">${esc(p.name)}</span>
                <div class="tp-stars tp-eval-row__stars" data-player-stars="${p.id}">
                  ${starsHTML(pr, canWrite)}
                </div>
                <input type="text" placeholder="Nota opcional…"
                       value="${esc(pe?.notes || '')}"
                       data-player-notes="${p.id}"
                       class="tp-eval-row__notes"
                       ${!canWrite ? 'disabled' : ''}>
              </li>
            `;
          }).join('')}
        </ul>
      ` : '<p class="muted" style="margin:0 0 1.5rem">Nenhum atleta associado a esta equipa.</p>'}

      ${canWrite ? `
        <div class="tp-save">
          <button class="btn btn--primary" data-save-eval type="button">Guardar avaliação</button>
          <p class="modal__error hidden" role="alert" data-eval-error style="margin:0;flex:1"></p>
        </div>
      ` : ''}
    </div>
  `;

  if (!canWrite) return;

  // Estrelas gerais.
  body.querySelectorAll('[data-overall-stars] [data-star]').forEach((btn) => {
    btn.addEventListener('click', () => {
      overallRating = parseInt(btn.dataset.star, 10);
      updateStars(body, '[data-overall-stars]', overallRating);
      const label = body.querySelector('[data-overall-label]');
      if (label) label.textContent = overallRating + '/5';
    });
  });

  // Estrelas por atleta.
  players.forEach((p) => {
    body.querySelectorAll(`[data-player-stars="${p.id}"] [data-star]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        playerRatings[p.id] = parseInt(btn.dataset.star, 10);
        updateStars(body, `[data-player-stars="${p.id}"]`, playerRatings[p.id]);
      });
    });
  });

  // Guardar avaliação.
  body.querySelector('[data-save-eval]').addEventListener('click', async () => {
    const saveBtn = body.querySelector('[data-save-eval]');
    const errorEl = body.querySelector('[data-eval-error]');
    const notesEl = body.querySelector('#eval-notes');

    saveBtn.disabled = true;
    saveBtn.textContent = 'A guardar…';
    errorEl.classList.add('hidden');

    try {
      const saved = await upsertTrainingEvaluation(eventId, {
        overall_rating: overallRating || null,
        notes: notesEl?.value.trim() || null,
      });

      for (const p of players) {
        const rating = playerRatings[p.id];
        const notesInput = body.querySelector(`[data-player-notes="${p.id}"]`);
        const notes = notesInput?.value.trim() || null;
        if (rating || notes) {
          await upsertPlayerEval(saved.id, p.id, {
            effort_rating: rating || null,
            notes,
          });
        }
      }

      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardado ✓';
      setTimeout(() => {
        if (saveBtn.isConnected) saveBtn.textContent = 'Guardar avaliação';
      }, 2000);
    } catch (err) {
      errorEl.textContent = dbErrorMessage(err);
      errorEl.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar avaliação';
    }
  });
}

// =========================================================================
// Utilitários de estrelas
// =========================================================================

function starsHTML(current, canWrite) {
  return [1, 2, 3, 4, 5]
    .map(
      (n) => `
        <button type="button" data-star="${n}" class="tp-star"
                style="color:${n <= current ? STAR_ON : STAR_OFF}"
                ${!canWrite ? 'disabled' : ''}
                aria-label="${n} estrela${n === 1 ? '' : 's'}">★</button>`
    )
    .join('');
}

function updateStars(body, selector, rating) {
  body.querySelectorAll(`${selector} [data-star]`).forEach((s) => {
    s.style.color = parseInt(s.dataset.star, 10) <= rating ? STAR_ON : STAR_OFF;
  });
}
