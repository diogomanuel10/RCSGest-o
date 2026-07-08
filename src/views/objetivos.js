// Vista: Objetivos / KPIs.
// Metas da época com barra de progresso. Dois tipos:
//   - manuais: o coordenador escreve o alvo e vai atualizando o valor atual;
//   - automáticos: a app calcula o valor atual a partir dos dados
//     (compute.OBJECTIVE_METRICS), preenchendo-se sozinha.
// Todos consultam; só o coordenador cria/edita/remove (canEdit + RLS).

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, euros, emptyHTML } from '../ui.js';
import { OBJECTIVE_METRICS, objectiveMetricLabel, objectiveProgress } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';

export function renderObjetivos(container) {
  const editable = canEdit('objectives');
  const objectives = state.objectives.slice();

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Objetivos</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Metas da época e indicadores de progresso</p>
      </div>
      ${
        editable
          ? `<div class="cell-actions">
              <button class="btn btn--ghost" id="add-auto" type="button">+ Indicador automático</button>
              <button class="btn btn--accent" id="add-manual" type="button">+ Objetivo</button>
            </div>`
          : ''
      }
    </header>

    ${
      objectives.length
        ? `<div class="obj-grid">${objectives.map((o) => objectiveCard(o, editable)).join('')}</div>`
        : emptyHTML(
            editable
              ? 'Ainda não há objetivos. Cria um objetivo manual ou um indicador automático.'
              : 'Ainda não há objetivos definidos.'
          )
    }
  `;

  container.querySelector('#add-manual')?.addEventListener('click', () => openForm('manual'));
  container.querySelector('#add-auto')?.addEventListener('click', () => openForm('auto'));
  container.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(null, b.dataset.edit))
  );
  container.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.del))
  );
}

// Formata um número sem casas decimais desnecessárias.
function fmtNum(n) {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
}

// Valor + unidade legível (€ e % têm apresentação própria).
function formatValue(value, unit) {
  if (unit === '€') return euros(value);
  if (unit === '%') return `${fmtNum(value)}%`;
  return `${fmtNum(value)}${unit ? ` ${esc(unit)}` : ''}`;
}

function objectiveCard(obj, editable) {
  const { current, target, pct, reached } = objectiveProgress(obj);
  const kindTag =
    obj.kind === 'auto'
      ? `Automático · ${esc(objectiveMetricLabel(obj.metric))}`
      : 'Manual';
  const hasTarget = Number(obj.target) > 0;

  return `
    <article class="card obj-card">
      <div class="obj-card__head">
        <div class="obj-card__heading">
          <h2 class="obj-card__title">${esc(obj.title)}</h2>
          <span class="badge badge--${obj.kind === 'auto' ? 'info' : 'muted'}">${kindTag}</span>
        </div>
        <span class="obj-card__pct">${hasTarget ? `${pct}%` : '—'}</span>
      </div>

      ${obj.description ? `<p class="muted obj-card__desc">${esc(obj.description)}</p>` : ''}

      <div class="progress"><div class="progress__bar" style="width:${hasTarget ? pct : 0}%"></div></div>

      <div class="obj-card__foot">
        <span class="muted obj-card__values">
          ${
            hasTarget
              ? `${formatValue(current, obj.unit)} <span class="obj-card__of">de</span> ${formatValue(target, obj.unit)}`
              : 'Sem alvo definido'
          }
        </span>
        ${hasTarget ? `<span class="badge badge--${reached ? 'ok' : 'muted'}">${reached ? 'Atingido' : 'Em progresso'}</span>` : ''}
      </div>

      ${
        editable
          ? `<div class="cell-actions obj-card__actions">
              <button class="btn btn--ghost btn--sm" data-edit="${obj.id}" type="button">Editar</button>
              <button class="btn btn--danger btn--sm" data-del="${obj.id}" type="button">Remover</button>
            </div>`
          : ''
      }
    </article>
  `;
}

// Abre o formulário. `kind` ('manual'|'auto') decide os campos ao criar; ao
// editar, o tipo vem do próprio registo (não se muda depois de criado).
function openForm(kind, id) {
  const existing = id ? state.objectives.find((o) => o.id === id) : null;
  const type = existing ? existing.kind : kind;

  const commonFields = [
    { name: 'title', label: 'Título', required: true, full: true, placeholder: 'ex.: Renovar patrocinadores' },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true },
  ];

  const fields =
    type === 'auto'
      ? [
          ...commonFields,
          {
            name: 'metric',
            label: 'Indicador',
            type: 'select',
            required: true,
            placeholder: 'Escolher indicador…',
            options: OBJECTIVE_METRICS.map((m) => ({ key: m.key, label: `${m.label} (${m.unit})` })),
          },
          { name: 'target', label: 'Alvo', type: 'number', required: true, placeholder: 'ex.: 85' },
        ]
      : [
          ...commonFields,
          { name: 'target', label: 'Alvo', type: 'number', required: true, placeholder: 'ex.: 3' },
          { name: 'current', label: 'Valor atual', type: 'number', default: '0' },
          { name: 'unit', label: 'Unidade', placeholder: 'ex.: €, renovações, %' },
        ];

  openModal({
    title: existing
      ? 'Editar objetivo'
      : type === 'auto'
        ? 'Novo indicador automático'
        : 'Novo objetivo',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields,
    onSubmit: async (values) => {
      let payload;
      if (type === 'auto') {
        const metric = OBJECTIVE_METRICS.find((m) => m.key === values.metric);
        if (!metric) throw new Error('Escolhe um indicador.');
        payload = {
          title: values.title.trim(),
          description: values.description?.trim() || null,
          kind: 'auto',
          metric: metric.key,
          target: Number(values.target) || 0,
          current: 0,
          unit: metric.unit || '',
        };
      } else {
        payload = {
          title: values.title.trim(),
          description: values.description?.trim() || null,
          kind: 'manual',
          metric: null,
          target: Number(values.target) || 0,
          current: Number(values.current) || 0,
          unit: values.unit?.trim() || '',
        };
      }
      try {
        if (existing) await updateRow('objectives', 'objectives', id, payload);
        else await createRow('objectives', 'objectives', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

async function remove(id) {
  const obj = state.objectives.find((o) => o.id === id);
  const ok = await confirmDialog(`Remover o objetivo "${obj?.title}"? Esta ação não pode ser anulada.`, {
    confirmLabel: 'Remover',
    danger: true,
  });
  if (!ok) return;
  try {
    await deleteRow('objectives', 'objectives', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
