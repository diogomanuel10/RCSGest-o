// Vista: Admin da plataforma (o vendedor). Só visível a quem é platform_admin.
//
// Três áreas:
//   1. Clubes — subscrições de todos os clubes: estado, plano, trial, contagens.
//   2. Contas — todas as contas da plataforma (quem ficou sem clube, quem nunca
//      mais voltou), para as poder eliminar.
//   3. Planos — editor dos planos (módulos incluídos e limites), guardados na BD.
// Usa os RPCs admin_list_orgs / admin_set_org_status / admin_delete_org /
// admin_list_accounts / admin_delete_user e a tabela `plans`.
//
// Eliminar é IRREVERSÍVEL e não é o arquivar das entidades do clube: aqui as
// linhas desaparecem mesmo. Por isso pede-se o nome do clube escrito à mão —
// um `confirmDialog` normal é um clique, e a lista tem os clubes todos lado a
// lado, com nomes parecidos.

import {
  state, adminListOrgs, adminSetOrgStatus, adminDeleteOrg,
  adminListAccounts, adminDeleteUser, savePlan, dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML, loadingHTML, errorHTML } from '../ui.js';
import { openModal, confirmDialog } from '../modal.js';
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
// Há quanto tempo. Um clube que não é aberto há meses é o candidato natural a
// ser eliminado — a data crua obrigava a fazer a conta de cabeça.
function sinceLabel(iso) {
  if (!iso) return '<span class="badge badge--warn">nunca entrou</span>';
  const days = Math.floor((new Date() - new Date(iso)) / 86400000);
  if (days <= 0) return '<span class="muted">hoje</span>';
  const text = days === 1 ? 'há 1 dia' : `há ${days} dias`;
  return days >= 30 ? `<span class="badge badge--warn">${text}</span>`
                    : `<span class="muted">${text}</span>`;
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
      <h2 class="section-title" style="margin-top:0">Contas</h2>
      <p class="muted" style="margin-top:0">
        Todas as contas da plataforma. Eliminar uma conta apaga o acesso da
        pessoa; não apaga o clube dela (para isso, elimina o clube acima).
      </p>
      <div id="accounts-body">${loadingHTML('A carregar contas…')}</div>
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
  loadAccounts(container.querySelector('#accounts-body'));
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
        <th>Utilizadores</th><th>Estado</th><th>Demonstração até</th>
        <th>Última atividade</th><th>Ações</th>
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
      <td style="font-size:0.85rem">${sinceLabel(o.last_activity)}</td>
      <td style="white-space:nowrap">
        <button class="btn btn--ghost btn--sm" data-extend="${o.id}" type="button">+14 dias</button>
        <button class="btn btn--danger btn--sm" data-del-org="${o.id}" type="button">Eliminar</button>
      </td>
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

  body.querySelectorAll('[data-del-org]').forEach((btn) => {
    btn.addEventListener('click', () => askDeleteOrg(findOrg(btn.dataset.delOrg), act));
  });
}

// Eliminar um clube: pede o nome escrito à mão e o que fazer às contas.
// A gravação corre DENTRO do onSubmit para o erro do servidor (ex.: "não podes
// eliminar o clube a que a tua conta pertence") aparecer no próprio formulário.
function askDeleteOrg(org, act) {
  if (!org) return;
  openModal({
    title: `Eliminar "${org.name}"`,
    submitLabel: 'Eliminar definitivamente',
    fields: [
      {
        name: 'confirm', label: 'Escreve o nome do clube para confirmar', required: true,
        placeholder: org.name,
        hint: `Apaga para sempre ${org.players_count ?? 0} atleta(s), ${org.teams_count ?? 0} equipa(s) `
            + 'e todo o histórico deste clube (presenças, quotas, dados clínicos e físicos). Não há forma de repor.',
      },
      {
        name: 'users', type: 'select', label: 'Contas dos utilizadores deste clube',
        default: 'sim',
        options: [
          { key: 'sim', label: 'Eliminar também as contas' },
          { key: 'nao', label: 'Manter as contas (ficam sem clube)' },
        ],
        hint: 'Manter é o caso de quem vai abrir outro clube: a conta volta ao onboarding.',
      },
    ],
    async onSubmit(values) {
      if ((values.confirm || '').trim() !== org.name) {
        throw new Error('O nome não coincide com o do clube.');
      }
      const res = await adminDeleteOrg(org.id, { deleteUsers: values.users !== 'nao' });
      const n = res?.deleted_users || 0;
      await act(() => {},
        `Clube "${org.name}" eliminado${n ? ` (${n} conta${n !== 1 ? 's' : ''} apagada${n !== 1 ? 's' : ''})` : ''}.`);
      // As contas do clube desapareceram (ou ficaram sem clube) — a lista de
      // baixo ficaria a mostrar gente que já não existe.
      await loadAccounts(document.querySelector('#accounts-body'));
    },
  });
}

// ---------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------
// Filtro do estado local desta vista (não vive na BD, como o resto dos filtros).
let accountFilter = 'todas';

async function loadAccounts(body) {
  if (!body) return;
  try {
    renderAccounts(body, await adminListAccounts());
  } catch (err) {
    body.innerHTML = errorHTML(dbErrorMessage(err));
  }
}

const ACCOUNT_FILTERS = [
  { key: 'todas',    label: 'Todas' },
  { key: 'sem_clube', label: 'Sem clube' },
  { key: 'inativas',  label: 'Sem entrar há 30+ dias' },
];

function accountMatches(a) {
  if (accountFilter === 'sem_clube') return !a.org_id;
  if (accountFilter === 'inativas') {
    return !a.last_sign_in_at
      || (new Date() - new Date(a.last_sign_in_at)) / 86400000 >= 30;
  }
  return true;
}

function renderAccounts(body, accounts) {
  const rows = accounts.filter(accountMatches);
  const semClube = accounts.filter((a) => !a.org_id).length;
  body.innerHTML = `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:center;margin-bottom:0.8rem" class="muted">
      <span><strong>${accounts.length}</strong> contas</span>
      <span><strong>${semClube}</strong> sem clube</span>
      <select class="role-select" id="acc-filter" aria-label="Filtrar contas">
        ${ACCOUNT_FILTERS.map((f) => `<option value="${f.key}" ${f.key === accountFilter ? 'selected' : ''}>${f.label}</option>`).join('')}
      </select>
    </div>
    ${rows.length ? accountsByClubHTML(rows) : emptyHTML('Nenhuma conta neste filtro.')}
    <p class="settings-msg hidden" id="acc-msg"></p>
  `;
  wireAccounts(body, accounts);
}

// As contas agrupadas POR CLUBE, em blocos colapsáveis.
//
// A pergunta que se faz a esta lista não é "quem é o fulano@gmail" — é "quem
// são as pessoas deste clube" (antes de o eliminar, ao responder a um pedido
// de suporte, ao ver se um cliente tem mesmo utilizadores). Numa lista corrida
// de várias centenas, isso obrigava a ler a coluna "Clube" linha a linha.
// Os clubes maiores primeiro, e as contas SEM clube ficam num grupo próprio no
// fim: são o alvo do filtro "sem clube" e não pertencem a lado nenhum.
function accountsByClubHTML(rows) {
  const groups = new Map();
  rows.forEach((a) => {
    const key = a.org_id || '';
    if (!groups.has(key)) {
      groups.set(key, { name: a.org_name || 'Sem clube', semClube: !a.org_id, list: [] });
    }
    groups.get(key).list.push(a);
  });

  const ordered = [...groups.values()].sort((x, y) => {
    if (x.semClube !== y.semClube) return x.semClube ? 1 : -1;
    return y.list.length - x.list.length || x.name.localeCompare(y.name);
  });

  return ordered.map((g) => {
    const table = `
      <div class="table-wrap"><table class="users-table">
        <thead><tr>
          <th>Email</th><th>Papel</th><th>Registo</th>
          <th>Último acesso</th><th>Ações</th>
        </tr></thead>
        <tbody>${g.list.map(accountRow).join('')}</tbody>
      </table></div>`;
    return `
      <details class="group" ${g.list.length <= 15 ? 'open' : ''}>
        <summary class="group__head">
          <span class="group__title">${esc(g.name)}</span>
          <span class="group__count">${g.list.length}</span>
        </summary>
        ${table}
      </details>`;
  }).join('');
}

function accountRow(a) {
  // Um admin da plataforma não tem botão: o servidor recusaria na mesma, e um
  // botão que só dá erro é pior do que não existir.
  const tag = a.is_admin ? ' <span class="badge badge--info">admin</span>'
            : a.is_owner ? ' <span class="badge">dono</span>' : '';
  return `
    <tr>
      <td style="font-size:0.85rem"><strong>${esc(a.email || '—')}</strong>${tag}</td>
      <td style="font-size:0.85rem">${esc(a.role || '—')}</td>
      <td style="font-size:0.85rem">${fmtDate(a.created_at)}</td>
      <td style="font-size:0.85rem">${sinceLabel(a.last_sign_in_at)}</td>
      <td>${a.is_admin ? '' : `<button class="btn btn--danger btn--sm" data-del-user="${a.id}" type="button">Eliminar</button>`}</td>
    </tr>
  `;
}

function wireAccounts(body, accounts) {
  const msg = body.querySelector('#acc-msg');
  const showMsg = (text, kind) => {
    if (!msg) return;
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  };

  body.querySelector('#acc-filter')?.addEventListener('change', (e) => {
    accountFilter = e.target.value;
    renderAccounts(body, accounts);
  });

  body.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const a = accounts.find((x) => x.id === btn.dataset.delUser);
      if (!a) return;
      const warn = a.is_owner
        ? ' Esta conta é a dona de um clube — o clube fica sem dono, mas não é eliminado.'
        : '';
      const ok = await confirmDialog(
        `Eliminar a conta ${a.email}? A pessoa perde o acesso e não há forma de repor.${warn}`,
        { confirmLabel: 'Eliminar conta' }
      );
      if (!ok) return;
      try {
        await adminDeleteUser(a.id);
        showMsg(`Conta ${a.email} eliminada.`, 'ok');
        await loadAccounts(body);
      } catch (err) {
        showMsg(dbErrorMessage(err), 'error');
      }
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
