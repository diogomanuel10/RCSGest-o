// Vista: Admin da plataforma (o vendedor). Só visível a quem é platform_admin.
//
// Duas áreas:
//   1. Clubes — subscrições de todos os clubes: estado, plano, trial, contagens.
//   2. Planos — editor dos planos (módulos incluídos e limites), guardados na BD.
// Usa os RPCs admin_list_orgs / admin_set_org_status e a tabela `plans`.

import { state, adminListOrgs, adminSetOrgStatus, savePlan, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, loadingHTML, errorHTML } from '../ui.js';
import { allPlans, planLabel, normalizePlan, PLAN_FEATURE_CATALOG } from '../plans.js';

const ORG_STATUSES = [
  { key: 'trial',     label: 'Demonstração', badge: 'info' },
  { key: 'ativa',     label: 'Ativa',         badge: 'ok' },
  { key: 'suspensa',  label: 'Suspensa',      badge: 'warn' },
  { key: 'cancelada', label: 'Cancelada',     badge: 'danger' },
];
const STATUS_LABEL = Object.fromEntries(ORG_STATUSES.map((s) => [s.key, s.label]));

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT');
}
function daysLeft(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

export function renderAdmin(container) {
  if (!state.isPlatformAdmin) {
    container.innerHTML = `
      <header class="page-head"><h1 class="section-title">Plataforma</h1></header>
      ${emptyHTML('Área reservada ao administrador da plataforma.')}
    `;
    return;
  }

  container.innerHTML = `
    <header class="page-head"><h1 class="section-title">Plataforma</h1></header>
    <section class="card">
      <h2 class="section-title" style="margin-top:0">Clubes</h2>
      <div id="admin-body">${loadingHTML('A carregar clubes…')}</div>
    </section>
    <section class="card">
      <h2 class="section-title" style="margin-top:0">Planos</h2>
      <p class="muted" style="margin-top:0">
        Define os módulos e os limites de cada plano. As alterações aplicam-se a
        todos os clubes com esse plano.
      </p>
      <div id="plans-body">${renderPlansEditorHTML()}</div>
      <p class="settings-msg hidden" id="plans-msg"></p>
    </section>
  `;

  wirePlansEditor(container);
  loadClubs(container.querySelector('#admin-body'));
}

// ---------------------------------------------------------------------
// Clubes (subscrições)
// ---------------------------------------------------------------------
async function loadClubs(body) {
  try {
    const orgs = await adminListOrgs();
    renderClubs(body, orgs);
  } catch (err) {
    body.innerHTML = errorHTML(dbErrorMessage(err));
  }
}

function renderClubs(body, orgs) {
  if (!orgs.length) {
    body.innerHTML = emptyHTML('Ainda não há clubes registados.');
    return;
  }
  const totals = {
    total: orgs.length,
    ativos: orgs.filter((o) => o.status === 'ativa').length,
    trial: orgs.filter((o) => o.status === 'trial').length,
  };
  body.innerHTML = `
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.8rem" class="muted">
      <span><strong>${totals.total}</strong> clubes</span>
      <span><strong>${totals.ativos}</strong> ativos</span>
      <span><strong>${totals.trial}</strong> em demonstração</span>
    </div>
    <div class="table-wrap"><table class="users-table">
      <thead><tr>
        <th>Clube</th><th>Dono</th><th>Plano</th><th>Atletas</th><th>Equipas</th>
        <th>Utilizadores</th><th>Estado</th><th>Demonstração até</th><th>Ações</th>
      </tr></thead>
      <tbody>${orgs.map(clubRow).join('')}</tbody>
    </table></div>
    <p class="settings-msg hidden" id="admin-msg"></p>
  `;
  wireClubs(body, orgs);
}

function clubRow(o) {
  const dl = daysLeft(o.trial_ends_at);
  const trialInfo = o.status === 'trial' && dl !== null
    ? (dl < 0 ? '<span class="badge badge--danger">expirado</span>'
              : `<span class="muted">${dl} dia${dl !== 1 ? 's' : ''}</span>`)
    : '';
  const planKey = normalizePlan(o.plan);
  return `
    <tr>
      <td><strong>${esc(o.name)}</strong></td>
      <td style="font-size:0.85rem">${esc(o.owner_email || '—')}</td>
      <td>
        <select class="role-select" data-plan="${o.id}">
          ${allPlans().map((p) => `<option value="${p.key}" ${p.key === planKey ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
        </select>
      </td>
      <td>${o.players_count ?? 0}</td>
      <td>${o.teams_count ?? 0}</td>
      <td>${o.users_count ?? 0}</td>
      <td>
        <select class="role-select" data-status="${o.id}">
          ${ORG_STATUSES.map((s) => `<option value="${s.key}" ${o.status === s.key ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:0.85rem">${fmtDate(o.trial_ends_at)} ${trialInfo}</td>
      <td><button class="btn btn--ghost btn--sm" data-extend="${o.id}" type="button">+14 dias</button></td>
    </tr>
  `;
}

function wireClubs(body, orgs) {
  const msg = body.querySelector('#admin-msg');
  const showMsg = (text, kind) => {
    if (!msg) return;
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  };
  const findOrg = (id) => orgs.find((o) => o.id === id);

  async function act(fn, okText) {
    try {
      await fn();
      showMsg(okText, 'ok');
      await loadClubs(body);
    } catch (err) {
      showMsg(dbErrorMessage(err), 'error');
    }
  }

  body.querySelectorAll('[data-status]').forEach((sel) => {
    sel.addEventListener('change', (e) =>
      act(() => adminSetOrgStatus(e.target.dataset.status, { status: e.target.value }),
          `Estado atualizado para "${STATUS_LABEL[e.target.value]}".`));
  });

  body.querySelectorAll('[data-plan]').forEach((sel) => {
    sel.addEventListener('change', (e) =>
      act(() => adminSetOrgStatus(e.target.dataset.plan, { plan: e.target.value }),
          `Plano atualizado para "${planLabel(e.target.value)}".`));
  });

  body.querySelectorAll('[data-extend]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const o = findOrg(btn.dataset.extend);
      const base = o?.trial_ends_at && new Date(o.trial_ends_at) > new Date()
        ? new Date(o.trial_ends_at) : new Date();
      base.setDate(base.getDate() + 14);
      act(() => adminSetOrgStatus(o.id, { status: 'trial', trialEndsAt: base.toISOString() }),
          'Período de demonstração estendido +14 dias.');
    });
  });
}

// ---------------------------------------------------------------------
// Planos (editor)
// ---------------------------------------------------------------------
function renderPlansEditorHTML() {
  const plans = (state.plans || []).slice().sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  if (!plans.length) {
    return emptyHTML('Corre o ficheiro supabase/plans.sql no Supabase para ativar o editor de planos.');
  }
  return plans.map(planCardHTML).join('');
}

function planCardHTML(p) {
  const features = Array.isArray(p.features) ? p.features : [];
  return `
    <div class="plan-editor" data-plan-key="${esc(p.key)}"
         style="border:1px solid var(--border,#e2e8f0);border-radius:12px;padding:1rem;margin-bottom:0.9rem">
      <div class="field">
        <label>Nome</label>
        <input type="text" data-f="name" value="${esc(p.name || '')}" />
      </div>
      <div class="field">
        <label>Descrição</label>
        <input type="text" data-f="description" value="${esc(p.description || '')}" />
      </div>
      <label style="display:block;margin:0.4rem 0 0.3rem">Módulos incluídos</label>
      <div class="coach-checks">
        ${PLAN_FEATURE_CATALOG.map((f) => `
          <label class="coach-check">
            <input type="checkbox" data-feature="${esc(f.key)}" ${features.includes(f.key) ? 'checked' : ''} />
            <span>${esc(f.label)}</span>
          </label>`).join('')}
      </div>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.6rem">
        <div class="field" style="max-width:180px">
          <label>Máx. escalões</label>
          <input type="number" min="0" data-f="max_escaloes" value="${p.max_escaloes ?? ''}" placeholder="ilimitado" />
        </div>
        <div class="field" style="max-width:180px">
          <label>Máx. utilizadores</label>
          <input type="number" min="0" data-f="max_users" value="${p.max_users ?? ''}" placeholder="ilimitado" />
        </div>
      </div>
      <div style="margin-top:0.6rem">
        <button class="btn btn--primary btn--sm" data-plan-save="${esc(p.key)}" type="button">Guardar plano</button>
      </div>
    </div>
  `;
}

function wirePlansEditor(container) {
  const msg = container.querySelector('#plans-msg');
  const showMsg = (text, kind) => {
    if (!msg) return;
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  };

  container.querySelectorAll('[data-plan-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.plan-editor');
      const key = card.dataset.planKey;
      const existing = (state.plans || []).find((p) => p.key === key) || {};
      const num = (v) => (v === '' || v == null ? null : Math.max(0, parseInt(v, 10)));
      const plan = {
        key,
        sort: existing.sort ?? 0,
        name: card.querySelector('[data-f="name"]').value.trim() || key,
        description: card.querySelector('[data-f="description"]').value.trim(),
        features: [...card.querySelectorAll('[data-feature]:checked')].map((c) => c.dataset.feature),
        max_escaloes: num(card.querySelector('[data-f="max_escaloes"]').value),
        max_users: num(card.querySelector('[data-f="max_users"]').value),
      };
      btn.disabled = true;
      try {
        await savePlan(plan);
        showMsg(`Plano "${plan.name}" guardado.`, 'ok');
      } catch (err) {
        showMsg(dbErrorMessage(err), 'error');
        btn.disabled = false;
      }
    });
  });
}
