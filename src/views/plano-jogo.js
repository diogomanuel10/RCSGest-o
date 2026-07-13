// Vista: Plano de Jogo.
// Formulário tático estruturado para preparação de jogos. Cada plano fica
// associado a uma equipa; o treinador só vê os planos das suas equipas
// (garantido pelo RLS + filtro de UI). O coordenador vê todos.

import { state, createRow, updateRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { canEdit, isClubWide } from '../permissions.js';
import { teamName } from '../compute.js';

// Estado local de UI (persiste entre re-desenhos).
let viewMode = 'list'; // 'list' | 'form'
let editingId = null;

// Campos do formulário para o cálculo da barra de progresso (team_id excluído).
const FORM_FIELDS = [
  'opponent', 'game_date', 'formation', 'reception_system', 'system_notes',
  'defense_system', 'block_notes', 'field_defense_notes', 'sideout_notes',
  'transition_notes', 'serve_type', 'serve_zone_notes', 'rotation_weak',
  'rotation_strong', 'scout_strengths', 'scout_weaknesses', 'scout_patterns',
  'free_notes',
];
const TOTAL_FIELDS = FORM_FIELDS.length;

let formData = {};

function resetForm() {
  formData = {};
  editingId = null;
}

// Devolve as equipas que o utilizador atual pode gerir.
// Coordenador → todas. Treinador → as equipas ligadas ao seu registo de coach.
function myTeams() {
  if (isClubWide()) return state.teams;
  const coachRecord = state.coaches.find((c) => c.user_id === state.profile?.id);
  if (!coachRecord) return [];
  const myTeamIds = new Set(
    state.teamCoaches.filter((tc) => tc.coach_id === coachRecord.id).map((tc) => tc.team_id)
  );
  return state.teams.filter((t) => myTeamIds.has(t.id));
}

function countFilled(data) {
  return FORM_FIELDS.filter((f) => data[f] && String(data[f]).trim() !== '').length;
}

function progressBar(filled, total) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const barColor = pct >= 80 ? 'var(--ok, #16a34a)' : pct >= 40 ? 'var(--warn, #d97706)' : 'var(--border)';
  return `
    <div class="progress-wrap">
      <div class="progress" style="margin-bottom:0.25rem">
        <div class="progress__bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <span class="progress__label muted">${filled}/${total} campos (${pct}%)</span>
    </div>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function chipGroup(name, options, selected) {
  return options
    .map(
      (o) => `
      <label class="chip${selected === o ? ' chip--active' : ''}">
        <input type="radio" name="${name}" value="${esc(o)}"${selected === o ? ' checked' : ''} />
        ${esc(o)}
      </label>`
    )
    .join('');
}

function section(title, id, content) {
  return `
    <details class="plan-section" open>
      <summary class="plan-section__title">${title}</summary>
      <div class="plan-section__body" id="${id}">${content}</div>
    </details>`;
}

function renderForm(container) {
  const plan = editingId ? (state.gamePlans || []).find((p) => p.id === editingId) : null;
  const d = plan || formData;
  const filled = countFilled(d);
  const teams = myTeams();

  const teamSelect = `
    <div class="field">
      <label for="f-team">Equipa <span aria-hidden="true">*</span></label>
      <select id="f-team" name="team_id" required>
        <option value="">Seleccionar equipa…</option>
        ${teams.map((t) => `<option value="${esc(t.id)}"${d.team_id === t.id ? ' selected' : ''}>${esc(teamName(t))}</option>`).join('')}
      </select>
    </div>`;

  container.innerHTML = `
    <header class="page-head">
      <button class="btn btn--ghost" id="btn-back" type="button">← Planos</button>
      <h1 class="section-title">${plan ? 'Editar Plano' : 'Novo Plano de Jogo'}</h1>
    </header>

    ${progressBar(filled, TOTAL_FIELDS)}

    <form id="plan-form" novalidate>
      ${section('1. Meta', 'sec-meta', `
        ${teamSelect}
        <div class="form-row">
          <div class="field">
            <label for="f-opponent">Adversário</label>
            <input id="f-opponent" name="opponent" type="text"
              value="${esc(d.opponent || '')}" placeholder="Nome da equipa adversária" />
          </div>
          <div class="field">
            <label for="f-game-date">Data do jogo</label>
            <input id="f-game-date" name="game_date" type="date"
              value="${esc(d.game_date || '')}" />
          </div>
        </div>
      `)}

      ${section('2. Sistema de Jogo', 'sec-sistema', `
        <div class="field">
          <label>Formação base</label>
          <div class="chip-group">
            ${chipGroup('formation', ['5-1', '6-2', '4-2'], d.formation)}
          </div>
        </div>
        <div class="field">
          <label>Receção base</label>
          <div class="chip-group">
            ${chipGroup('reception_system', ['W5', 'W4', 'W3', 'W2'], d.reception_system)}
          </div>
        </div>
        <div class="field">
          <label for="f-system-notes">Notas ao sistema</label>
          <textarea id="f-system-notes" name="system_notes" rows="3"
            placeholder="Variações, condicionantes, ajustes…">${esc(d.system_notes || '')}</textarea>
        </div>
      `)}

      ${section('3. Princípios Defensivos', 'sec-defesa', `
        <div class="field">
          <label>Sistema defensivo</label>
          <div class="chip-group">
            ${chipGroup('defense_system', ['2 blocadores', '1 blocador', 'Leitura', 'Comprometida'], d.defense_system)}
          </div>
        </div>
        <div class="field">
          <label for="f-block-notes">Bloco</label>
          <textarea id="f-block-notes" name="block_notes" rows="3"
            placeholder="Organização do bloco, matchups, cobertura…">${esc(d.block_notes || '')}</textarea>
        </div>
        <div class="field">
          <label for="f-field-defense">Defesa de campo</label>
          <textarea id="f-field-defense" name="field_defense_notes" rows="3"
            placeholder="Disposição em defesa, responsabilidades…">${esc(d.field_defense_notes || '')}</textarea>
        </div>
      `)}

      ${section('4. Princípios Ofensivos', 'sec-ataque', `
        <div class="field">
          <label for="f-sideout">Side-out</label>
          <textarea id="f-sideout" name="sideout_notes" rows="3"
            placeholder="Estratégia de receção e ataque direto…">${esc(d.sideout_notes || '')}</textarea>
        </div>
        <div class="field">
          <label for="f-transition">Transição / contra-ataque</label>
          <textarea id="f-transition" name="transition_notes" rows="3"
            placeholder="Organização após defesa…">${esc(d.transition_notes || '')}</textarea>
        </div>
        <div class="field">
          <label>Tipo de serviço</label>
          <div class="chip-group">
            ${chipGroup('serve_type', ['Salto flutuante', 'Float de baixo', 'Salto potência', 'Zona-alvo'], d.serve_type)}
          </div>
        </div>
        <div class="field">
          <label for="f-serve-zone">Zona alvo do serviço</label>
          <textarea id="f-serve-zone" name="serve_zone_notes" rows="2"
            placeholder="Zonas a explorar, sequência de serviços…">${esc(d.serve_zone_notes || '')}</textarea>
        </div>
      `)}

      ${section('5. Rotações', 'sec-rotacoes', `
        <div class="field">
          <label for="f-rotation-weak">Rotação crítica / vulnerável</label>
          <textarea id="f-rotation-weak" name="rotation_weak" rows="3"
            placeholder="Rotações onde temos desvantagem e como mitigar…">${esc(d.rotation_weak || '')}</textarea>
        </div>
        <div class="field">
          <label for="f-rotation-strong">Rotação forte / a explorar</label>
          <textarea id="f-rotation-strong" name="rotation_strong" rows="3"
            placeholder="Rotações vantajosas e como potenciá-las…">${esc(d.rotation_strong || '')}</textarea>
        </div>
      `)}

      ${section('6. Scouting do Adversário', 'sec-scouting', `
        <div class="field">
          <label for="f-scout-strengths">Pontos fortes</label>
          <textarea id="f-scout-strengths" name="scout_strengths" rows="3"
            placeholder="Atacantes, servidor principal, bloco…">${esc(d.scout_strengths || '')}</textarea>
        </div>
        <div class="field">
          <label for="f-scout-weaknesses">Vulnerabilidades</label>
          <textarea id="f-scout-weaknesses" name="scout_weaknesses" rows="3"
            placeholder="Deficiências de receção, passe, defesa…">${esc(d.scout_weaknesses || '')}</textarea>
        </div>
        <div class="field">
          <label for="f-scout-patterns">Padrões identificados</label>
          <textarea id="f-scout-patterns" name="scout_patterns" rows="3"
            placeholder="Combinações habituais, tendências de serviço/ataque…">${esc(d.scout_patterns || '')}</textarea>
        </div>
      `)}

      ${section('7. Notas Livres do Treinador', 'sec-notas', `
        <div class="field">
          <textarea id="f-free-notes" name="free_notes" rows="6"
            placeholder="Observações gerais, motivação, referências de vídeo…">${esc(d.free_notes || '')}</textarea>
        </div>
      `)}

      <div class="form-actions">
        <button class="btn btn--ghost" type="button" id="btn-cancel">Cancelar</button>
        <button class="btn btn--accent" type="submit">Guardar plano</button>
      </div>
    </form>
  `;

  const form = container.querySelector('#plan-form');

  form.addEventListener('input', () => {
    const data = collectFormData(form);
    const f = countFilled(data);
    const wrap = container.querySelector('.progress-wrap');
    if (wrap) wrap.outerHTML = progressBar(f, TOTAL_FIELDS).trim();
  });

  container.querySelector('#btn-back').addEventListener('click', () => {
    viewMode = 'list';
    resetForm();
    renderPlanList(container);
  });

  container.querySelector('#btn-cancel').addEventListener('click', () => {
    viewMode = 'list';
    resetForm();
    renderPlanList(container);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = collectFormData(form);
    const teamId = new FormData(form).get('team_id');

    if (!teamId) {
      alert('Selecciona a equipa antes de guardar.');
      return;
    }
    if (!values.opponent?.trim()) {
      alert('O adversário é obrigatório.');
      return;
    }

    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      const payload = { ...values, team_id: teamId };
      if (editingId) {
        await updateRow('game_plans', 'gamePlans', editingId, payload);
      } else {
        await createRow('game_plans', 'gamePlans', payload);
      }
      viewMode = 'list';
      resetForm();
      renderPlanList(container);
    } catch (err) {
      alert(dbErrorMessage(err));
      btn.disabled = false;
    }
  });
}

function collectFormData(form) {
  const fd = new FormData(form);
  const out = {};
  for (const key of FORM_FIELDS) {
    out[key] = fd.get(key) || '';
  }
  return out;
}

function exportTxt(plan) {
  const team = state.teams.find((t) => t.id === plan.team_id);
  const lines = [
    'PLANO DE JOGO',
    '='.repeat(40),
    `Equipa:     ${team ? teamName(team) : '—'}`,
    `Adversário: ${plan.opponent || '—'}`,
    `Data:       ${formatDate(plan.game_date)}`,
    '',
    '[ SISTEMA DE JOGO ]',
    `Formação:  ${plan.formation || '—'}`,
    `Receção:   ${plan.reception_system || '—'}`,
    `Notas:     ${plan.system_notes || '—'}`,
    '',
    '[ PRINCÍPIOS DEFENSIVOS ]',
    `Sistema:           ${plan.defense_system || '—'}`,
    `Bloco:             ${plan.block_notes || '—'}`,
    `Defesa de campo:   ${plan.field_defense_notes || '—'}`,
    '',
    '[ PRINCÍPIOS OFENSIVOS ]',
    `Side-out:          ${plan.sideout_notes || '—'}`,
    `Transição:         ${plan.transition_notes || '—'}`,
    `Tipo de serviço:   ${plan.serve_type || '—'}`,
    `Zona do serviço:   ${plan.serve_zone_notes || '—'}`,
    '',
    '[ ROTAÇÕES ]',
    `Crítica/vulnerável: ${plan.rotation_weak || '—'}`,
    `Forte/a explorar:   ${plan.rotation_strong || '—'}`,
    '',
    '[ SCOUTING DO ADVERSÁRIO ]',
    `Pontos fortes:     ${plan.scout_strengths || '—'}`,
    `Vulnerabilidades:  ${plan.scout_weaknesses || '—'}`,
    `Padrões:           ${plan.scout_patterns || '—'}`,
    '',
    '[ NOTAS DO TREINADOR ]',
    plan.free_notes || '—',
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const fname = `plano-jogo-${(plan.opponent || 'adversario').replace(/\s+/g, '-').toLowerCase()}-${plan.game_date || 'sem-data'}.txt`;
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderPlanList(container) {
  const editable = canEdit('game_plans');
  const plans = [...(state.gamePlans || [])].sort((a, b) => {
    if (a.game_date && b.game_date) return b.game_date.localeCompare(a.game_date);
    return new Date(b.created_at) - new Date(a.created_at);
  });

  const listHTML = plans.length
    ? plans
        .map((p) => {
          const filled = countFilled(p);
          const pct = Math.round((filled / TOTAL_FIELDS) * 100);
          const barColor = pct >= 80 ? 'var(--ok, #16a34a)' : pct >= 40 ? 'var(--warn, #d97706)' : 'var(--border)';
          const team = state.teams.find((t) => t.id === p.team_id);
          return `
          <div class="plan-card card" data-id="${esc(p.id)}">
            <div class="plan-card__head">
              <div>
                <strong class="plan-card__opponent">${esc(p.opponent || '(sem adversário)')}</strong>
                <span class="muted">${formatDate(p.game_date)}</span>
                ${team ? `<span class="badge badge--muted" style="margin-left:0.4rem">${esc(teamName(team))}</span>` : ''}
              </div>
              <div class="plan-card__actions">
                <button class="btn btn--ghost btn--sm btn-export" data-id="${esc(p.id)}" type="button" title="Exportar .txt">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  .txt
                </button>
                ${editable ? `<button class="btn btn--ghost btn--sm btn-edit" data-id="${esc(p.id)}" type="button">Editar</button>` : ''}
              </div>
            </div>
            <div class="progress-wrap" style="margin-top:0.5rem">
              <div class="progress" style="margin-bottom:0.25rem"><div class="progress__bar" style="width:${pct}%;background:${barColor}"></div></div>
              <span class="progress__label muted">${filled}/${TOTAL_FIELDS} (${pct}%)</span>
            </div>
          </div>`;
        })
        .join('')
    : emptyHTML('Ainda não há planos de jogo criados.');

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Plano de Jogo</h1>
      ${editable ? '<button class="btn btn--accent" id="btn-new-plan" type="button">+ Novo plano</button>' : ''}
    </header>
    <div class="plan-list">${listHTML}</div>
  `;

  container.querySelector('#btn-new-plan')?.addEventListener('click', () => {
    viewMode = 'form';
    editingId = null;
    formData = {};
    renderForm(container);
  });

  container.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewMode = 'form';
      editingId = btn.dataset.id;
      renderForm(container);
    });
  });

  container.querySelectorAll('.btn-export').forEach((btn) => {
    btn.addEventListener('click', () => {
      const plan = plans.find((p) => p.id === btn.dataset.id);
      if (plan) exportTxt(plan);
    });
  });
}

export function renderPlanoJogo(container) {
  if (viewMode === 'form') {
    renderForm(container);
  } else {
    renderPlanList(container);
  }
}
