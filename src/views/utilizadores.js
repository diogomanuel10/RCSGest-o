// Vista: Utilizadores (papéis, vínculos e acessos). Visível só ao coordenador.
//   Papel       → o que pode fazer (leitura/treinador/coordenador/atleta).
//   Vínculo     → liga a conta a um registo de treinador ou de atleta.
//   Acessos     → que secções um treinador/leitura pode ver (configurável).

import {
  state,
  updateProfileRole,
  updateProfilePermissions,
  linkCoachToUser,
  linkPlayerToUser,
  createInvitation,
  revokeInvitation,
  dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { ROLES, ROLE_LABEL, SECTIONS, DEFAULT_TRAINER_SECTIONS, DEFAULT_FISIO_SECTIONS, DEFAULT_PREP_SECTIONS, DEFAULT_SECCIONISTA_SECTIONS, isCoordenador } from '../permissions.js';
import { planLimit, planLimitReached, currentPlan } from '../plans.js';

// Acessos por omissão sugeridos ao convidar, por papel.
const DEFAULT_SECTIONS_BY_ROLE = {
  treinador: DEFAULT_TRAINER_SECTIONS,
  fisioterapeuta: DEFAULT_FISIO_SECTIONS,
  preparador: DEFAULT_PREP_SECTIONS,
  seccionista: DEFAULT_SECCIONISTA_SECTIONS,
  leitura: [],
};
// Papéis com acessos configuráveis por secção (mostram a lista no convite).
const CONFIGURABLE_ROLES = new Set(Object.keys(DEFAULT_SECTIONS_BY_ROLE));

// Constrói o link de convite a partir do token (mesma origem/caminho da app).
function inviteLink(token) {
  return `${window.location.origin}${window.location.pathname}?invite=${token}`;
}

// Estado legível de um convite: usado, expirado ou pendente.
function inviteState(inv) {
  if (inv.used_at) return { key: 'usado', label: 'Usado', badge: 'muted' };
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return { key: 'expirado', label: 'Expirado', badge: 'danger' };
  }
  return { key: 'pendente', label: 'Pendente', badge: 'ok' };
}
import { teamName, teamById } from '../compute.js';

export function renderUtilizadores(container) {
  if (!isCoordenador()) {
    container.innerHTML = `
      <header class="page-head"><h1 class="section-title">Utilizadores</h1></header>
      ${emptyHTML('Só o coordenador pode gerir utilizadores.')}
    `;
    return;
  }

  const profiles = [...state.profiles].sort((a, b) =>
    (a.email || '').localeCompare(b.email || '')
  );

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Utilizadores</h1>
    </header>

    <section class="card">
      <p class="muted" style="margin-top:0">
        Define o papel de cada pessoa. Quem se regista começa em <strong>Leitura</strong>
        sem acesso a nada — escolhe os acessos para ele poder ver as secções.
        Treinadores e atletas devem ser vinculados ao respetivo registo.
      </p>
      <div class="roles-legend">
        ${ROLES.map(
          (r) => `<span class="muted"><strong>${r.label}:</strong> ${esc(r.desc)}</span>`
        ).join('')}
      </div>

      ${
        profiles.length
          ? `<div class="table-wrap"><table class="users-table">
              <thead><tr><th>Email</th><th>Papel</th><th>Vínculo</th><th>Acessos</th></tr></thead>
              <tbody>${profiles.map(userRow).join('')}</tbody>
            </table></div>`
          : emptyHTML('Ainda não há outros utilizadores registados.')
      }
      <p class="settings-msg hidden" id="roles-msg"></p>
    </section>

    <section class="card">
      <header class="page-head" style="margin-bottom:0.6rem">
        <h2 class="section-title">Convites</h2>
        <button class="btn btn--primary btn--sm" id="invite-new" type="button">Criar convite</button>
      </header>
      <p class="muted" style="margin-top:0">
        Gera um link para convidares um treinador ou colaborador. Ele abre o
        link, cria conta e entra automaticamente neste clube, com o papel que
        escolheres. Os dados ficam sempre isolados dos outros clubes.
      </p>
      <div id="invites-list">${invitesListHTML()}</div>
      <p class="settings-msg hidden" id="invites-msg"></p>
    </section>
  `;

  const msg = container.querySelector('#roles-msg');
  function showMsg(text, kind) {
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  }

  container.querySelectorAll('.role-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const role = e.target.value;
      const previous = state.profiles.find((p) => p.id === id)?.role;

      if (e.target.dataset.self && role !== 'coordenador') {
        const ok = confirm('Vais deixar de ser coordenador e perdes o acesso de gestão. Continuar?');
        if (!ok) { e.target.value = previous; return; }
      }

      e.target.disabled = true;
      try {
        await updateProfileRole(id, role);
        // Ao tornar-se treinador sem acessos definidos, sugere os de base.
        const before = state.profiles.find((p) => p.id === id);
        const hadPerms = Array.isArray(before?.permissions) && before.permissions.length > 0;
        if (role === 'treinador' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_TRAINER_SECTIONS]);
        }
        // O fisioterapeuta tem sempre o Departamento Médico; sugere também as
        // secções de apoio (calendário, plantéis) se ainda não tiver acessos.
        if (role === 'fisioterapeuta' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_FISIO_SECTIONS]);
        }
        // O preparador físico tem sempre a Preparação Física; sugere também as
        // secções de apoio (calendário/mapa de jogos, plantéis).
        if (role === 'preparador' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_PREP_SECTIONS]);
        }
        // O seccionista tem acessos configuráveis; sugere as secções
        // administrativas de base se ainda não tiver nada definido.
        if (role === 'seccionista' && !hadPerms) {
          await updateProfilePermissions(id, [...DEFAULT_SECCIONISTA_SECTIONS]);
        }
        const updated = state.profiles.find((p) => p.id === id);
        // Reconstrói o vínculo e os acessos para o novo papel.
        const linkWrap = container.querySelector(`[data-link-wrap="${id}"]`);
        if (linkWrap) { linkWrap.innerHTML = linkControl(updated); wireLink(linkWrap); }
        const accWrap = container.querySelector(`[data-acc-wrap="${id}"]`);
        if (accWrap) { accWrap.innerHTML = accessControl(updated); wireAccess(accWrap); }
        showMsg(`Papel atualizado para ${ROLE_LABEL[role]}.`, 'ok');
      } catch (err) {
        e.target.value = previous;
        showMsg(dbErrorMessage(err), 'error');
      } finally {
        e.target.disabled = false;
      }
    });
  });

  container.querySelectorAll('[data-link-wrap]').forEach(wireLink);
  container.querySelectorAll('[data-acc-wrap]').forEach(wireAccess);

  // --- Convites ---
  const invMsg = container.querySelector('#invites-msg');
  function showInvMsg(text, kind) {
    invMsg.textContent = text;
    invMsg.className = `settings-msg settings-msg--${kind}`;
  }

  container.querySelector('#invite-new')?.addEventListener('click', () => {
    // Limite de utilizadores do plano: conta os perfis do clube + convites por
    // usar. Ao atingir o teto, sugere upgrade em vez de criar mais.
    const pendentes = (state.invitations || []).filter((i) => !i.used_at && (!i.expires_at || new Date(i.expires_at) >= new Date())).length;
    const usados = state.profiles.length;
    if (planLimitReached('users', usados + pendentes)) {
      showInvMsg(
        `Atingiste o limite de utilizadores do plano ${currentPlan().name} (${planLimit('users')}). ` +
        'Faz upgrade do plano para convidares mais pessoas.',
        'error'
      );
      return;
    }
    openInviteModal((inv) => showInviteLinkModal(inv));
  });

  container.querySelectorAll('[data-invite-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyToClipboard(inviteLink(btn.dataset.inviteCopy), btn));
  });

  container.querySelectorAll('[data-invite-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const inv = state.invitations.find((i) => i.id === btn.dataset.inviteRevoke);
      if (!inv) return;
      if (!confirm('Revogar este convite? O link deixa de funcionar.')) return;
      btn.disabled = true;
      try {
        await revokeInvitation(inv.id);
        showInvMsg('Convite revogado.', 'ok');
      } catch (err) {
        showInvMsg(dbErrorMessage(err), 'error');
        btn.disabled = false;
      }
    });
  });

  function wireLink(wrap) {
    if (!wrap) return;
    const sel = wrap.querySelector('.link-select');
    if (!sel) return;
    sel.addEventListener('change', async (e) => {
      const kind = e.target.dataset.kind; // 'coach' | 'player'
      const targetId = e.target.value;
      const userId = e.target.dataset.userid;
      const previous = e.target.dataset.prev;
      e.target.disabled = true;
      try {
        const linkFn = kind === 'coach' ? linkCoachToUser : linkPlayerToUser;
        if (targetId) {
          await linkFn(targetId, userId);
          e.target.dataset.prev = targetId;
          showMsg('Vínculo guardado.', 'ok');
        } else if (previous) {
          await linkFn(previous, null);
          e.target.dataset.prev = '';
          showMsg('Vínculo removido.', 'ok');
        }
      } catch (err) {
        e.target.value = previous;
        showMsg(dbErrorMessage(err), 'error');
      } finally {
        e.target.disabled = false;
      }
    });
  }

  function wireAccess(wrap) {
    if (!wrap) return;
    const btn = wrap.querySelector('[data-acc-config]');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const profile = state.profiles.find((p) => p.id === btn.dataset.accConfig);
      openAccessModal(profile, () => {
        // Após guardar, refresca o resumo do botão.
        wrap.innerHTML = accessControl(state.profiles.find((p) => p.id === profile.id));
        wireAccess(wrap);
        showMsg('Acessos atualizados.', 'ok');
      });
    });
  }
}

function userRow(p) {
  return `
    <tr>
      <td>
        <strong>${esc(p.email || '—')}</strong>
        ${p.id === state.profile?.id ? '<span class="badge badge--muted">tu</span>' : ''}
      </td>
      <td>
        <select class="role-select" data-id="${p.id}"${p.id === state.profile?.id ? ' data-self="1"' : ''}>
          ${ROLES.map(
            (r) => `<option value="${r.key}" ${p.role === r.key ? 'selected' : ''}>${ROLE_LABEL[r.key]}</option>`
          ).join('')}
        </select>
      </td>
      <td><div data-link-wrap="${p.id}">${linkControl(p)}</div></td>
      <td><div data-acc-wrap="${p.id}">${accessControl(p)}</div></td>
    </tr>
  `;
}

// Seletor de vínculo: coordenador/treinador → registo de treinador (o
// coordenador pode acumular o papel de treinador); atleta → registo de atleta.
function linkControl(p) {
  if (p.role === 'coordenador' || p.role === 'treinador') {
    const linked = state.coaches.find((c) => c.user_id === p.id)?.id || '';
    const opts = state.coaches
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((c) => `<option value="${c.id}" ${c.id === linked ? 'selected' : ''}>${esc(c.name)}</option>`)
      .join('');
    return `
      <select class="link-select" data-kind="coach" data-userid="${p.id}" data-prev="${linked}">
        <option value="">— Sem treinador —</option>${opts}
      </select>`;
  }
  if (p.role === 'atleta') {
    const linked = state.players.find((pl) => pl.user_id === p.id)?.id || '';
    const opts = state.players
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((pl) => {
        const t = teamById(pl.team_id);
        const label = `${pl.name}${t ? ' — ' + teamName(t) : ''}`;
        return `<option value="${pl.id}" ${pl.id === linked ? 'selected' : ''}>${esc(label)}</option>`;
      })
      .join('');
    return `
      <select class="link-select" data-kind="player" data-userid="${p.id}" data-prev="${linked}">
        <option value="">— Sem atleta —</option>${opts}
      </select>`;
  }
  return '<span class="muted" style="font-size:0.8rem">—</span>';
}

// Resumo dos acessos + botão para configurar. Coordenador vê tudo; atleta tem
// o portal; treinador/leitura têm uma lista configurável.
function accessControl(p) {
  if (p.role === 'coordenador') return '<span class="muted" style="font-size:0.8rem">Tudo</span>';
  if (p.role === 'atleta') return '<span class="muted" style="font-size:0.8rem">Portal pessoal</span>';
  const perms = Array.isArray(p.permissions) ? p.permissions : [];
  const n = perms.length;
  return `
    <button class="btn btn--ghost btn--sm" data-acc-config="${p.id}" type="button">
      Configurar (${n}/${SECTIONS.length})
    </button>`;
}

// Modal com as caixas de seleção das secções. onSaved() corre após guardar.
function openAccessModal(profile, onSaved) {
  if (!profile) return;
  const current = new Set(Array.isArray(profile.permissions) ? profile.permissions : []);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="acc-title" style="width:min(520px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="acc-title">Acessos</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p class="muted" style="margin:0 0 0.8rem">
        Escolhe as secções que <strong>${esc(profile.email || 'este utilizador')}</strong> pode ver.
      </p>
      <div class="acc-actions">
        <button class="btn btn--link btn--sm" id="acc-all" type="button">Selecionar tudo</button>
        <button class="btn btn--link btn--sm" id="acc-none" type="button">Limpar</button>
      </div>
      <div class="coach-checks" id="acc-list">
        ${SECTIONS.map((s) => `
          <label class="coach-check">
            <input type="checkbox" value="${s.key}" ${current.has(s.key) ? 'checked' : ''} />
            <span>${esc(s.label)}</span>
          </label>`).join('')}
      </div>
      <div id="acc-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="acc-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="acc-save" type="button">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#acc-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const boxes = () => [...overlay.querySelectorAll('#acc-list input')];
  overlay.querySelector('#acc-all').addEventListener('click', () => boxes().forEach((b) => (b.checked = true)));
  overlay.querySelector('#acc-none').addEventListener('click', () => boxes().forEach((b) => (b.checked = false)));

  overlay.querySelector('#acc-save').addEventListener('click', async () => {
    const permissions = boxes().filter((b) => b.checked).map((b) => b.value);
    const errEl = overlay.querySelector('#acc-err');
    const btn = overlay.querySelector('#acc-save');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await updateProfilePermissions(profile.id, permissions);
      close();
      onSaved?.();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });
}

// Lista dos convites do clube (pendentes primeiro, com link e ações).
function invitesListHTML() {
  const invites = state.invitations || [];
  if (!invites.length) {
    return '<p class="muted" style="font-size:0.85rem;margin:0.4rem 0 0">Ainda não há convites.</p>';
  }
  return `
    <div class="table-wrap"><table class="users-table">
      <thead><tr><th>Para</th><th>Papel</th><th>Estado</th><th>Ações</th></tr></thead>
      <tbody>${invites.map(inviteRow).join('')}</tbody>
    </table></div>
  `;
}

function inviteRow(inv) {
  const st = inviteState(inv);
  const pending = st.key === 'pendente';
  return `
    <tr>
      <td>${esc(inv.email || 'Qualquer pessoa com o link')}</td>
      <td>${esc(ROLE_LABEL[inv.role] || inv.role)}</td>
      <td><span class="badge badge--${st.badge}">${st.label}</span></td>
      <td>
        ${pending ? `
          <button class="btn btn--ghost btn--sm" data-invite-copy="${esc(inv.token)}" type="button">Copiar link</button>
          <button class="btn btn--link btn--sm" data-invite-revoke="${esc(inv.id)}" type="button">Revogar</button>
        ` : '<span class="muted" style="font-size:0.8rem">—</span>'}
      </td>
    </tr>
  `;
}

// Modal para criar um convite: papel, email (opcional) e acessos por secção
// (para os papéis configuráveis). onCreated(inv) corre após criar.
function openInviteModal(onCreated) {
  const invitableRoles = ROLES.filter((r) => r.key !== 'atleta');
  const initialRole = 'treinador';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="inv-title" style="width:min(520px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="inv-title">Novo convite</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div class="field">
        <label for="inv-role">Papel</label>
        <select id="inv-role">
          ${invitableRoles.map((r) => `<option value="${r.key}" ${r.key === initialRole ? 'selected' : ''}>${ROLE_LABEL[r.key]}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="inv-email">Email (opcional)</label>
        <input type="email" id="inv-email" placeholder="para tua referência" />
      </div>
      <div id="inv-sections-wrap">
        <label style="display:block;margin-bottom:0.3rem">Acessos</label>
        <div class="acc-actions">
          <button class="btn btn--link btn--sm" id="inv-all" type="button">Selecionar tudo</button>
          <button class="btn btn--link btn--sm" id="inv-none" type="button">Limpar</button>
        </div>
        <div class="coach-checks" id="inv-sections">
          ${SECTIONS.map((s) => `
            <label class="coach-check">
              <input type="checkbox" value="${s.key}" />
              <span>${esc(s.label)}</span>
            </label>`).join('')}
        </div>
      </div>
      <div id="inv-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="inv-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="inv-create" type="button">Criar convite</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#inv-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const roleSel = overlay.querySelector('#inv-role');
  const sectionsWrap = overlay.querySelector('#inv-sections-wrap');
  const boxes = () => [...overlay.querySelectorAll('#inv-sections input')];

  // Aplica os acessos por omissão do papel e mostra/esconde a lista.
  function applyRoleDefaults() {
    const role = roleSel.value;
    const configurable = CONFIGURABLE_ROLES.has(role);
    sectionsWrap.style.display = configurable ? '' : 'none';
    const defaults = new Set(DEFAULT_SECTIONS_BY_ROLE[role] || []);
    boxes().forEach((b) => (b.checked = defaults.has(b.value)));
  }
  applyRoleDefaults();
  roleSel.addEventListener('change', applyRoleDefaults);

  overlay.querySelector('#inv-all').addEventListener('click', () => boxes().forEach((b) => (b.checked = true)));
  overlay.querySelector('#inv-none').addEventListener('click', () => boxes().forEach((b) => (b.checked = false)));

  overlay.querySelector('#inv-create').addEventListener('click', async () => {
    const role = roleSel.value;
    const email = overlay.querySelector('#inv-email').value.trim() || null;
    const permissions = CONFIGURABLE_ROLES.has(role)
      ? boxes().filter((b) => b.checked).map((b) => b.value)
      : [];
    const errEl = overlay.querySelector('#inv-err');
    const btn = overlay.querySelector('#inv-create');
    errEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'A criar…';
    try {
      const inv = await createInvitation(role, permissions, email);
      close();
      onCreated?.(inv);
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Criar convite';
    }
  });
}

// Modal que mostra o link gerado, pronto a copiar/partilhar.
function showInviteLinkModal(inv) {
  const link = inviteLink(inv.token);
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="invl-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="invl-title">Convite criado 🎉</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <p class="muted" style="margin:0 0 0.6rem">
        Envia este link a quem queres convidar (${esc(ROLE_LABEL[inv.role] || inv.role)}).
        É válido durante 14 dias e só pode ser usado uma vez.
      </p>
      <div class="field">
        <input type="text" id="invl-link" readonly value="${esc(link)}" onclick="this.select()" />
      </div>
      <div class="modal__actions">
        <button class="btn btn--primary" id="invl-copy" type="button">Copiar link</button>
        <button class="btn btn--ghost" id="invl-close" type="button">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
  };
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#invl-close').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#invl-copy').addEventListener('click', (e) => copyToClipboard(link, e.currentTarget));
  overlay.querySelector('#invl-link').select?.();
}

// Copia texto para a área de transferência, com feedback no botão.
async function copyToClipboard(text, btn) {
  const original = btn ? btn.textContent : '';
  try {
    await navigator.clipboard.writeText(text);
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = original; }, 1500); }
  } catch {
    // Recurso: seleciona um campo temporário para o utilizador copiar à mão.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch { /* ignora */ }
    ta.remove();
    if (btn) { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = original; }, 1500); }
  }
}
