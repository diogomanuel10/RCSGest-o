// Vista: Admin da plataforma (o vendedor). Só visível a quem é platform_admin.
//
// Gere as subscrições de todos os clubes: ver estado/plano/trial e alterá-los
// manualmente (ativar, suspender, cancelar, estender demonstração). Usa os RPCs
// admin_list_orgs e admin_set_org_status (guardados por is_platform_admin no RLS).

import { state, adminListOrgs, adminSetOrgStatus, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, loadingHTML, errorHTML } from '../ui.js';
import { PLANS, PLAN_LABEL, normalizePlan } from '../plans.js';

const ORG_STATUSES = [
  { key: 'trial',     label: 'Demonstração', badge: 'info' },
  { key: 'ativa',     label: 'Ativa',         badge: 'ok' },
  { key: 'suspensa',  label: 'Suspensa',      badge: 'warn' },
  { key: 'cancelada', label: 'Cancelada',     badge: 'danger' },
];
const STATUS_BADGE = Object.fromEntries(ORG_STATUSES.map((s) => [s.key, s.badge]));
const STATUS_LABEL = Object.fromEntries(ORG_STATUSES.map((s) => [s.key, s.label]));

// Formata uma data ISO para dd/mm/aaaa (ou '—').
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT');
}

// Dias que faltam (negativo = expirado) para uma data ISO.
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
    <header class="page-head"><h1 class="section-title">Plataforma — Clubes</h1></header>
    <section class="card" id="admin-body">${loadingHTML('A carregar clubes…')}</section>
  `;
  const body = container.querySelector('#admin-body');

  async function load() {
    try {
      const orgs = await adminListOrgs();
      render(orgs);
    } catch (err) {
      body.innerHTML = errorHTML(dbErrorMessage(err));
    }
  }

  function render(orgs) {
    if (!orgs.length) {
      body.innerHTML = emptyHTML('Ainda não há clubes registados.');
      return;
    }
    // Resumo no topo.
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
        <tbody>${orgs.map(orgRow).join('')}</tbody>
      </table></div>
      <p class="settings-msg hidden" id="admin-msg"></p>
      <div class="roles-legend" style="margin-top:1rem">
        ${PLANS.map((p) => `<span class="muted"><strong>${esc(p.name)}:</strong> ${esc(p.desc)}</span>`).join('')}
      </div>
    `;
    wire(orgs);
  }

  function orgRow(o) {
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
            ${PLANS.map((p) => `<option value="${p.key}" ${p.key === planKey ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
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
        <td>
          <button class="btn btn--ghost btn--sm" data-extend="${o.id}" type="button">+14 dias</button>
        </td>
      </tr>
    `;
  }

  function wire(orgs) {
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
        await load();
      } catch (err) {
        showMsg(dbErrorMessage(err), 'error');
      }
    }

    body.querySelectorAll('[data-status]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const id = e.target.dataset.status;
        const status = e.target.value;
        act(() => adminSetOrgStatus(id, { status }),
            `Estado do clube atualizado para "${STATUS_LABEL[status]}".`);
      });
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

    body.querySelectorAll('[data-plan]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const id = e.target.dataset.plan;
        const plan = e.target.value;
        act(() => adminSetOrgStatus(id, { plan }),
            `Plano atualizado para "${PLAN_LABEL[plan] || plan}".`);
      });
    });
  }

  load();
}
