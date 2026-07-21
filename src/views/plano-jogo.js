// Vista: Plano de Jogo.
// Formulário tático estruturado para preparação de jogos. Cada plano fica
// associado a uma equipa; o treinador só vê os planos das suas equipas
// (garantido pelo RLS + filtro de UI). O coordenador vê todos.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { confirmDialog } from '../modal.js';
import { canEdit, isClubWide } from '../permissions.js';
import { teamName, eventDateTime, escalaoColor } from '../compute.js';

// Estado local de UI (persiste entre re-desenhos).
let viewMode = 'list'; // 'list' | 'form'
let editingId = null;
let teamFilter = ''; // filtro por equipa na lista

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

// Vista de impressão (também serve para "Guardar como PDF" no diálogo de
// impressão). Abre uma janela com o plano formatado e dispara a impressão.
function printPlan(plan) {
  const team = state.teams.find((t) => t.id === plan.team_id);
  const color = team ? escalaoColor(team.escalao) : '#143b61';

  const row = (label, val) =>
    val && String(val).trim()
      ? `<tr><th>${esc(label)}</th><td>${esc(String(val)).replace(/\n/g, '<br>')}</td></tr>`
      : '';
  const sec = (title, rows) => (rows ? `<section><h2>${esc(title)}</h2><table>${rows}</table></section>` : '');

  const body = [
    sec('Sistema de Jogo', row('Formação', plan.formation) + row('Receção', plan.reception_system) + row('Notas', plan.system_notes)),
    sec('Princípios Defensivos', row('Sistema', plan.defense_system) + row('Bloco', plan.block_notes) + row('Defesa de campo', plan.field_defense_notes)),
    sec('Princípios Ofensivos', row('Side-out', plan.sideout_notes) + row('Transição', plan.transition_notes) + row('Tipo de serviço', plan.serve_type) + row('Zona do serviço', plan.serve_zone_notes)),
    sec('Rotações', row('Crítica / vulnerável', plan.rotation_weak) + row('Forte / a explorar', plan.rotation_strong)),
    sec('Scouting do Adversário', row('Pontos fortes', plan.scout_strengths) + row('Vulnerabilidades', plan.scout_weaknesses) + row('Padrões', plan.scout_patterns)),
    sec('Notas do Treinador', row('Observações', plan.free_notes)),
  ].filter(Boolean).join('');

  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8">
    <title>Plano de Jogo${plan.opponent ? ' · ' + esc(plan.opponent) : ''}</title>
    <style>
      *{box-sizing:border-box}
      body{font-family:-apple-system,system-ui,'Segoe UI',Roboto,sans-serif;color:#1a2636;margin:0;padding:32px;line-height:1.5}
      header{border-bottom:3px solid ${color};padding-bottom:12px;margin-bottom:22px}
      h1{margin:0 0 4px;font-size:22px}
      .sub{color:#617080;font-size:14px}
      section{margin:0 0 18px;break-inside:avoid}
      h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:${color};border-bottom:1px solid #dde4ed;padding-bottom:4px;margin:0 0 8px}
      table{width:100%;border-collapse:collapse}
      th{width:180px;text-align:left;vertical-align:top;color:#617080;font-weight:600;font-size:13px;padding:4px 12px 4px 0}
      td{vertical-align:top;font-size:13px;padding:4px 0}
      @media print{body{padding:0}}
    </style></head><body>
    <header>
      <h1>Plano de Jogo${plan.opponent ? ' — vs ' + esc(plan.opponent) : ''}</h1>
      <div class="sub">${team ? esc(teamName(team)) : ''}${plan.game_date ? ' · ' + formatDate(plan.game_date) : ''}</div>
    </header>
    ${body || '<p style="color:#617080">Plano ainda sem conteúdo preenchido.</p>'}
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Permite pop-ups para imprimir ou guardar em PDF.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.onload = () => w.print();
}

// Duplicar um plano (reaproveitar): copia os campos, limpa a data do jogo e
// abre logo em edição para ajustar. Marca o adversário como cópia.
async function duplicatePlan(plan, container) {
  const payload = {};
  FORM_FIELDS.forEach((f) => { payload[f] = plan[f] || ''; });
  payload.team_id = plan.team_id || null;
  payload.game_date = '';
  payload.opponent = plan.opponent ? `${plan.opponent} (cópia)` : '';
  try {
    const created = await createRow('game_plans', 'gamePlans', payload);
    viewMode = 'form';
    editingId = created.id;
    formData = {};
    renderForm(container);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

// Apagar um plano (definitivo — os planos não têm arquivo).
async function deletePlan(plan, container) {
  const label = [plan.opponent, formatDate(plan.game_date)].filter(Boolean).join(' · ') || 'este plano';
  const ok = await confirmDialog(
    `Apagar o plano "${label}"? Esta ação é definitiva (os planos de jogo não têm arquivo).`,
    { confirmLabel: 'Apagar', danger: true }
  );
  if (!ok) return;
  try {
    await deleteRow('game_plans', 'gamePlans', plan.id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

const ICON_PRINT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
const ICON_COPY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_PENCIL = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const ICON_TRASH = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;

// Abre o formulário de novo plano pré-preenchido a partir de um jogo agendado.
function openPlanFromEvent(ev, container) {
  viewMode = 'form';
  editingId = null;
  formData = {
    team_id: ev.team_id || '',
    opponent: ev.opponent || '',
    game_date: ev.date || '',
  };
  renderForm(container);
}

function planCard(p, editable) {
  const filled = countFilled(p);
  const pct = Math.round((filled / TOTAL_FIELDS) * 100);
  const barColor = pct >= 80 ? 'var(--ok, #16a34a)' : pct >= 40 ? 'var(--warn, #d97706)' : 'var(--border)';
  const team = state.teams.find((t) => t.id === p.team_id);
  const color = team ? escalaoColor(team.escalao) : 'var(--border)';
  return `
    <div class="plan-card card" style="--tc:${color}" data-id="${esc(p.id)}">
      <div class="plan-card__head">
        <div>
          <strong class="plan-card__opponent">${esc(p.opponent || '(sem adversário)')}</strong>
          <span class="muted">${formatDate(p.game_date)}</span>
          ${team ? `<span class="badge badge--muted" style="margin-left:0.4rem">${esc(teamName(team))}</span>` : ''}
        </div>
        <div class="plan-card__actions">
          <button class="icon-btn" data-print="${esc(p.id)}" type="button" aria-label="Imprimir / PDF" title="Imprimir / PDF">${ICON_PRINT}</button>
          ${editable ? `<button class="icon-btn" data-dup="${esc(p.id)}" type="button" aria-label="Duplicar" title="Duplicar">${ICON_COPY}</button>` : ''}
          ${editable ? `<button class="icon-btn" data-edit="${esc(p.id)}" type="button" aria-label="Editar" title="Editar">${ICON_PENCIL}</button>` : ''}
          ${editable ? `<button class="icon-btn icon-btn--danger" data-del="${esc(p.id)}" type="button" aria-label="Apagar" title="Apagar">${ICON_TRASH}</button>` : ''}
        </div>
      </div>
      <div class="progress-wrap" style="margin-top:0.5rem">
        <div class="progress" style="margin-bottom:0.25rem"><div class="progress__bar" style="width:${pct}%;background:${barColor}"></div></div>
        <span class="progress__label muted">${filled}/${TOTAL_FIELDS} (${pct}%)</span>
      </div>
    </div>`;
}

function renderPlanList(container) {
  const editable = canEdit('game_plans');
  const teams = myTeams();
  const all = [...(state.gamePlans || [])];
  const plans = all.filter((p) => !teamFilter || p.team_id === teamFilter);
  const todayStr = new Date().toISOString().slice(0, 10);

  // Próximos vs. passados (por data do jogo; sem data conta como próximo).
  const upcoming = plans
    .filter((p) => !p.game_date || p.game_date >= todayStr)
    .sort((a, b) => (a.game_date || '9999').localeCompare(b.game_date || '9999'));
  const past = plans
    .filter((p) => p.game_date && p.game_date < todayStr)
    .sort((a, b) => (b.game_date || '').localeCompare(a.game_date || ''));

  // Jogos agendados (futuros) das minhas equipas ainda sem plano.
  const teamIds = new Set(teams.map((t) => t.id));
  const hasPlan = (ev) => all.some((p) => p.team_id === ev.team_id && p.game_date === ev.date);
  const gamesNoPlan = editable
    ? state.events
        .filter((e) => e.type === 'jogo' && e.date >= todayStr)
        .filter((e) => isClubWide() || (e.team_id && teamIds.has(e.team_id)))
        .filter((e) => !hasPlan(e))
        .sort((a, b) => eventDateTime(a) - eventDateTime(b))
        .slice(0, 6)
    : [];

  const group = (title, list) =>
    list.length
      ? `<h2 class="plan-group__title">${title} <span class="plan-group__count">${list.length}</span></h2>
         <div class="plan-list">${list.map((p) => planCard(p, editable)).join('')}</div>`
      : '';

  const noPlanRow = (ev) => {
    const team = state.teams.find((t) => t.id === ev.team_id);
    const when = eventDateTime(ev).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
    const label = [team ? teamName(team) : '', ev.opponent ? `vs ${esc(ev.opponent)}` : ''].filter(Boolean).join(' · ') || 'Jogo';
    return `
      <li class="noplan-item">
        <span class="noplan-item__date">${esc(when)}</span>
        <span class="noplan-item__body">${label}</span>
        <button class="btn btn--accent btn--sm" data-prep-game="${esc(ev.id)}" type="button">Preparar plano</button>
      </li>`;
  };

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Plano de Jogo</h1>
      ${editable ? '<button class="btn btn--accent" id="btn-new-plan" type="button">+ Novo plano</button>' : ''}
    </header>

    ${
      teams.length > 1
        ? `<div class="filter-bar">
             <div class="field">
               <label for="plan-team">Equipa</label>
               <select id="plan-team">
                 <option value="">Todas as equipas</option>
                 ${teams.map((t) => `<option value="${esc(t.id)}" ${teamFilter === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`).join('')}
               </select>
             </div>
           </div>`
        : ''
    }

    ${
      gamesNoPlan.length
        ? `<section class="card noplan-card">
             <h2 class="section-title upcoming-card__title">Jogos sem plano</h2>
             <ul class="noplan-list">${gamesNoPlan.map(noPlanRow).join('')}</ul>
           </section>`
        : ''
    }

    ${
      plans.length
        ? `${group('Próximos', upcoming)}${group('Passados', past)}`
        : emptyHTML(teamFilter ? 'Sem planos para esta equipa.' : 'Ainda não há planos de jogo criados.')
    }
  `;

  container.querySelector('#btn-new-plan')?.addEventListener('click', () => {
    viewMode = 'form';
    editingId = null;
    formData = {};
    renderForm(container);
  });

  container.querySelector('#plan-team')?.addEventListener('change', (e) => {
    teamFilter = e.target.value;
    renderPlanList(container);
  });

  container.querySelectorAll('[data-prep-game]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const ev = state.events.find((e) => e.id === btn.dataset.prepGame);
      if (ev) openPlanFromEvent(ev, container);
    })
  );

  container.querySelectorAll('[data-edit]').forEach((btn) =>
    btn.addEventListener('click', () => {
      viewMode = 'form';
      editingId = btn.dataset.edit;
      renderForm(container);
    })
  );
  container.querySelectorAll('[data-print]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const plan = all.find((p) => p.id === btn.dataset.print);
      if (plan) printPlan(plan);
    })
  );
  container.querySelectorAll('[data-dup]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const plan = all.find((p) => p.id === btn.dataset.dup);
      if (plan) duplicatePlan(plan, container);
    })
  );
  container.querySelectorAll('[data-del]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const plan = all.find((p) => p.id === btn.dataset.del);
      if (plan) deletePlan(plan, container);
    })
  );
}

export function renderPlanoJogo(container) {
  if (viewMode === 'form') {
    renderForm(container);
  } else {
    renderPlanList(container);
  }
}
