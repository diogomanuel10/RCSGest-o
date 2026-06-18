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
  dbErrorMessage,
} from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { ROLES, ROLE_LABEL, SECTIONS, isCoordenador } from '../permissions.js';
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
