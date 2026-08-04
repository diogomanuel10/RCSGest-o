// Vista: Objetivos / KPIs da época.
//
// Três tipos de objetivo:
//   • Automático — a app calcula o valor atual a partir dos dados
//     (compute.OBJECTIVE_METRICS). É o que se quer sempre que houver
//     indicador para o efeito.
//   • Manual — o coordenador escreve o alvo e vai atualizando o valor.
//   • Marco — binário, sem alvo nem barra: ou se atinge ou não
//     (ex.: "Apurar para o campeonato nacional").
//
// E três âmbitos:
//   • Clube  — um número para todo o clube;
//   • Equipa — uma equipa concreta;
//   • Todas  — a MESMA definição medida em cada plantel, com uma linha por
//     equipa (ex.: "90% dos atletas mantêm-se, em cada escalão").
//
// Todos consultam; só o coordenador cria/edita/remove (canEdit + RLS).

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, euros, emptyHTML } from '../ui.js';
import {
  OBJECTIVE_METRICS,
  metricsForScope,
  objectiveMetricLabel,
  objectiveSummary,
  canSeeObjective,
  visibleTeamIds,
  squadRetention,
  STATUS_ORDER,
  teamName,
} from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { canEdit } from '../permissions.js';

const SCOPES = [
  { key: 'clube',  label: 'Todo o clube' },
  { key: 'equipa', label: 'Uma equipa' },
  { key: 'todas',  label: 'Todas as equipas (uma linha por plantel)' },
];
const SCOPE_LABEL = Object.fromEntries(SCOPES.map((s) => [s.key, s.label]));

const KINDS = [
  { key: 'auto',   label: 'Automático — a app calcula o valor' },
  { key: 'manual', label: 'Manual — atualizo o valor à mão' },
  { key: 'marco',  label: 'Marco — só atingido ou não' },
];

const STATUS = {
  atingido:  { label: 'Atingido',       badge: 'ok' },
  risco:     { label: 'Em risco',       badge: 'warn' },
  falhado:   { label: 'Fora de prazo',  badge: 'danger' },
  abaixo:    { label: 'Abaixo do alvo', badge: 'warn' },
  progresso: { label: 'Em progresso',   badge: 'muted' },
};

export function renderObjetivos(container) {
  const editable = canEdit('objectives');
  // Os que precisam de atenção primeiro; depois os que já lá chegaram.
  // O treinador vê os objetivos do clube e os das SUAS equipas; nos de âmbito
  // "todas" vê o cartão e o alvo, mas só a linha do seu plantel.
  const items = state.objectives
    .filter(canSeeObjective)
    .map((obj) => ({ obj, ...objectiveSummary(obj) }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  const tally = items.reduce((acc, i) => {
    acc[i.status] = (acc[i.status] || 0) + 1;
    return acc;
  }, {});

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Objetivos</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Metas da época e indicadores de progresso</p>
      </div>
      ${editable ? '<button class="btn btn--accent" id="add-obj" type="button">+ Objetivo</button>' : ''}
    </header>

    ${items.length ? summaryStrip(tally, items.length) : ''}

    ${
      items.length
        ? `<div class="obj-grid">${items.map((i) => objectiveCard(i, editable)).join('')}</div>`
        : emptyState(editable)
    }
  `;

  container.querySelector('#add-obj')?.addEventListener('click', () => openForm());
  container.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => openForm(b.dataset.edit))
  );
  container.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => remove(b.dataset.del))
  );
  container.querySelectorAll('[data-toggle-marco]').forEach((b) =>
    b.addEventListener('click', () => toggleMarco(b.dataset.toggleMarco))
  );
  container.querySelectorAll('[data-suggest]').forEach((b) =>
    b.addEventListener('click', () => addSuggestion(b.dataset.suggest))
  );
}

// Faixa de contagem por estado — dá a leitura de "estamos bem ou mal?" sem
// obrigar a percorrer os cartões.
function summaryStrip(tally, total) {
  const cells = ['falhado', 'risco', 'abaixo', 'progresso', 'atingido']
    .filter((k) => tally[k])
    .map((k) => `
      <span class="obj-tally__item">
        <span class="badge badge--${STATUS[k].badge}">${tally[k]}</span>
        ${esc(STATUS[k].label)}
      </span>`)
    .join('');
  return `<div class="obj-tally"><strong>${total} objetivo${total === 1 ? '' : 's'}</strong>${cells}</div>`;
}

// --- Sugestões para o estado vazio ---------------------------------------
// O difícil para quem começa não é criar um objetivo, é saber que KPIs deve
// ter. Estas criam-se com um clique e podem ser editadas a seguir.
const SUGGESTIONS = {
  retencao: {
    title: 'Retenção do plantel',
    description: '90% dos atletas mantêm-se, em cada escalão.',
    kind: 'auto', metric: 'squad_retention', scope: 'todas', target: 90, unit: '%',
  },
  presencas: {
    title: 'Taxa de presenças',
    description: 'Assiduidade média nos treinos, em cada escalão.',
    kind: 'auto', metric: 'attendance_rate', scope: 'todas', target: 85, unit: '%',
  },
  avaliacao: {
    title: 'Avaliação de plantel decidida',
    description: 'Decidir quem fica para a próxima época.',
    kind: 'auto', metric: 'review_decided', scope: 'clube', target: 100, unit: '%',
  },
};

function emptyState(editable) {
  if (!editable) return emptyHTML('Ainda não há objetivos definidos.');
  return `
    <div class="card obj-empty">
      <h2 class="section-title" style="margin-bottom:0.3rem">Começa por aqui</h2>
      <p class="muted" style="margin:0 0 1rem">
        Escolhe um destes para arrancar — podes editar o alvo a seguir — ou cria
        o teu com <strong>+ Objetivo</strong>.
      </p>
      <ul class="obj-suggest">
        ${Object.entries(SUGGESTIONS).map(([key, s]) => `
          <li>
            <button class="step-item" type="button" data-suggest="${key}">
              <span class="step-item__mark" aria-hidden="true">+</span>
              <span class="step-item__text">
                <strong class="step-item__title">${esc(s.title)} — ${s.target}${esc(s.unit)}</strong>
                <span class="muted step-item__sub">${esc(s.description)}</span>
              </span>
            </button>
          </li>`).join('')}
      </ul>
    </div>
  `;
}

async function addSuggestion(key) {
  const s = SUGGESTIONS[key];
  if (!s) return;
  try {
    await createRow('objectives', 'objectives', {
      ...s, current: 0, deadline: null, team_id: null,
    });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// --- Cartões --------------------------------------------------------------

function fmtNum(n) {
  const x = Number(n) || 0;
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100);
}

function formatValue(value, unit) {
  if (unit === '€') return euros(value);
  if (unit === '%') return `${fmtNum(value)}%`;
  return `${fmtNum(value)}${unit ? ` ${esc(unit)}` : ''}`;
}

function deadlineLabel(obj, status) {
  if (!obj.deadline) return '';
  const d = new Date(obj.deadline + 'T00:00:00');
  const txt = d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  if (status === 'falhado') return `Prazo esgotado a ${txt}`;
  const days = Math.ceil((d - new Date()) / 86400000);
  return days <= 60 ? `Até ${txt} (${days} dia${days === 1 ? '' : 's'})` : `Até ${txt}`;
}

function kindTag(obj) {
  if (obj.kind === 'marco') return 'Marco';
  if (obj.kind === 'auto') return `Automático · ${objectiveMetricLabel(obj.metric)}`;
  return 'Manual';
}

function scopeTag(obj) {
  if (obj.scope === 'equipa') {
    const t = state.teams.find((x) => x.id === obj.team_id);
    return t ? teamName(t) : 'Equipa removida';
  }
  return SCOPE_LABEL[obj.scope] || 'Todo o clube';
}

function objectiveCard({ obj, rows, met, total, status }, editable) {
  const st = STATUS[status] || STATUS.progresso;
  const dl = deadlineLabel(obj, status);

  return `
    <article class="card obj-card obj-card--${status}${obj.scope === 'todas' ? ' obj-card--wide' : ''}">
      <div class="obj-card__head">
        <div class="obj-card__heading">
          <h2 class="obj-card__title">${esc(obj.title)}</h2>
          <div class="obj-card__tags">
            <span class="badge badge--muted">${esc(kindTag(obj))}</span>
            <span class="badge badge--info">${esc(scopeTag(obj))}</span>
          </div>
        </div>
        <span class="badge badge--${st.badge}">${esc(st.label)}</span>
      </div>

      ${obj.description ? `<p class="muted obj-card__desc">${esc(obj.description)}</p>` : ''}
      ${dl ? `<p class="obj-card__deadline muted">${esc(dl)}</p>` : ''}

      ${obj.kind === 'marco' ? marcoBody(obj, editable) : progressBody(obj, rows, met, total)}

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

// Corpo de um marco: sem barra — um estado e o botão para o virar.
function marcoBody(obj, editable) {
  const done = !!obj.done_at;
  const when = done
    ? new Date(obj.done_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  return `
    <div class="obj-marco">
      <span class="obj-marco__mark${done ? ' obj-marco__mark--done' : ''}" aria-hidden="true">${done ? '✓' : ''}</span>
      <span class="obj-marco__text">
        ${done ? `Atingido a ${esc(when)}` : 'Por atingir'}
      </span>
      ${
        editable
          ? `<button class="btn btn--${done ? 'ghost' : 'accent'} btn--sm" data-toggle-marco="${obj.id}" type="button">
               ${done ? 'Marcar por atingir' : 'Marcar como atingido'}
             </button>`
          : ''
      }
    </div>
  `;
}

// Corpo de um objetivo com alvo. No âmbito 'todas' desdobra-se numa linha por
// equipa — é o formato que responde a "90% em CADA escalão".
function progressBody(obj, rows, met, total) {
  if (obj.scope === 'todas') {
    if (!rows.length) {
      return '<p class="muted" style="margin:0">Ainda não há equipas para medir.</p>';
    }
    // A contagem "X de Y a cumprir" é uma leitura de conjunto — só se mostra a
    // quem vê o clube todo. Para o treinador ficaria a comparar-se com equipas
    // que nem lhe aparecem.
    const rollup = visibleTeamIds() === null
      ? `<strong>${met} de ${total}</strong> equipa${total === 1 ? '' : 's'} a cumprir <span class="muted">·</span> `
      : '';
    return `
      <p class="obj-card__rollup">
        ${rollup}<span class="muted">alvo ${formatValue(obj.target, obj.unit)}</span>
      </p>
      <ul class="obj-teams">
        ${rows.map((r) => teamRow(obj, r)).join('')}
      </ul>
    `;
  }

  const r = rows[0];
  const hasTarget = Number(obj.target) > 0;
  return `
    <div class="progress"><div class="progress__bar" style="width:${hasTarget ? r.progress.pct : 0}%"></div></div>
    <div class="obj-card__foot">
      <span class="muted obj-card__values">
        ${
          hasTarget
            ? `${formatValue(r.progress.current, obj.unit)} <span class="obj-card__of">de</span> ${formatValue(r.progress.target, obj.unit)}`
            : 'Sem alvo definido'
        }
      </span>
      <span class="obj-card__pct">${hasTarget ? `${r.progress.pct}%` : '—'}</span>
    </div>
    ${detailNote(obj, null)}
  `;
}

function teamRow(obj, { team, progress, status }) {
  const st = STATUS[status] || STATUS.progresso;
  return `
    <li class="obj-team">
      <span class="obj-team__name">${esc(teamName(team))}</span>
      <span class="obj-team__bar">
        <span class="progress"><span class="progress__bar" style="width:${progress.pct}%"></span></span>
      </span>
      <span class="obj-team__value">${formatValue(progress.current, obj.unit)}</span>
      ${
        progress.reached
          ? '<span class="badge badge--ok">✓</span>'
          : `<span class="badge badge--${st.badge}">${esc(st.label)}</span>`
      }
      ${detailNote(obj, team.id)}
    </li>
  `;
}

// Contexto que impede o número de ser mal lido. Na retenção, os atletas ainda
// por decidir contam para baixo — sem este aviso a percentagem parece final.
function detailNote(obj, teamId) {
  if (obj.kind !== 'auto' || obj.metric !== 'squad_retention') return '';
  const scopeTeam = teamId ?? (obj.scope === 'equipa' ? obj.team_id : null);
  const r = squadRetention(scopeTeam);
  if (!r.total) return '';
  const bits = [`${r.mantem} de ${r.total} a manter`];
  if (r.pendente) bits.push(`${r.pendente} por decidir`);
  return `<span class="obj-note muted">${esc(bits.join(' · '))}</span>`;
}

// --- Formulário -----------------------------------------------------------

// O formulário é redesenhado quando o tipo ou o âmbito mudam: os campos de um
// marco não são os de um automático, e os indicadores dependem do âmbito.
function openForm(id, draft) {
  const existing = id ? state.objectives.find((o) => o.id === id) : null;
  const values = draft || (existing
    ? { ...existing }
    : { kind: 'auto', scope: 'clube', target: '', current: '0', unit: '' });

  const kind = values.kind || 'auto';
  const scope = values.scope || 'clube';
  const teams = state.teams.slice().sort((a, b) => teamName(a).localeCompare(teamName(b)));

  const fields = [
    { name: 'title', label: 'Título', required: true, full: true, placeholder: 'ex.: Apurar para o campeonato nacional' },
    { name: 'description', label: 'Descrição', type: 'textarea', full: true },
    {
      name: 'kind', label: 'Tipo', type: 'select', required: true, reactive: true,
      options: KINDS.map((k) => ({ key: k.key, label: k.label })),
      hint: 'Muda os campos abaixo.',
    },
    {
      name: 'scope', label: 'Aplica-se a', type: 'select', required: true, reactive: true,
      options: SCOPES.map((s) => ({ key: s.key, label: s.label })),
      hint: '"Todas as equipas" mede a mesma meta em cada plantel, separadamente.',
    },
  ];

  if (scope === 'equipa') {
    fields.push({
      name: 'team_id', label: 'Equipa', type: 'select', required: true,
      placeholder: teams.length ? 'Escolher equipa…' : 'Ainda não há equipas',
      options: teams.map((t) => ({ key: t.id, label: teamName(t) })),
    });
  }

  if (kind === 'auto') {
    const usable = metricsForScope(scope);
    fields.push({
      name: 'metric', label: 'Indicador', type: 'select', required: true,
      placeholder: 'Escolher indicador…',
      options: usable.map((m) => ({ key: m.key, label: `${m.label} (${m.unit})` })),
      hint: scope === 'clube'
        ? undefined
        : 'Só aparecem os indicadores que sabem medir uma equipa.',
    });
    fields.push({ name: 'target', label: 'Alvo', type: 'number', required: true, placeholder: 'ex.: 90' });
  } else if (kind === 'manual') {
    fields.push({ name: 'target', label: 'Alvo', type: 'number', required: true, placeholder: 'ex.: 3' });
    fields.push({ name: 'current', label: 'Valor atual', type: 'number', default: '0' });
    fields.push({ name: 'unit', label: 'Unidade', placeholder: 'ex.: €, renovações, %' });
  }

  fields.push({
    name: 'deadline', label: 'Prazo', type: 'date',
    hint: 'Opcional. Sem prazo não se consegue dizer se o objetivo vai atrasado.',
  });

  let close;
  close = openModal({
    title: existing ? 'Editar objetivo' : 'Novo objetivo',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values,
    fields,
    // Trocar o tipo ou o âmbito reconstrói o formulário logo, guardando o que
    // já lá estava escrito.
    onFieldChange: (_name, current) => {
      close?.();
      openForm(id, { ...values, ...current });
    },
    onSubmit: async (v) => {
      const payload = {
        title: v.title.trim(),
        description: v.description?.trim() || null,
        kind,
        scope,
        team_id: scope === 'equipa' ? v.team_id || null : null,
        deadline: v.deadline || null,
      };

      if (scope === 'equipa' && !payload.team_id) throw new Error('Escolhe a equipa.');

      if (kind === 'auto') {
        const metric = OBJECTIVE_METRICS.find((m) => m.key === v.metric);
        if (!metric) throw new Error('Escolhe um indicador.');
        Object.assign(payload, {
          metric: metric.key,
          target: Number(v.target) || 0,
          current: 0,
          unit: metric.unit || '',
        });
      } else if (kind === 'manual') {
        Object.assign(payload, {
          metric: null,
          target: Number(v.target) || 0,
          current: Number(v.current) || 0,
          unit: v.unit?.trim() || '',
        });
      } else {
        // Marco: sem alvo nem unidade; o estado vive em done_at.
        Object.assign(payload, { metric: null, target: 0, current: 0, unit: '' });
        if (!existing) payload.done_at = null;
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

async function toggleMarco(id) {
  const obj = state.objectives.find((o) => o.id === id);
  if (!obj) return;
  try {
    await updateRow('objectives', 'objectives', id, {
      done_at: obj.done_at ? null : new Date().toISOString(),
    });
  } catch (err) {
    alert(dbErrorMessage(err));
  }
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
