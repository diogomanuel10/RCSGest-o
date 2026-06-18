// Vista: Utilizadores (gestão de papéis e vínculos). Visível só ao coordenador.
// Treinador → vincula a um registo de treinador (vê só as suas equipas).
// Atleta    → vincula a um registo de atleta (portal pessoal).

import { state, updateProfileRole, linkCoachToUser, linkPlayerToUser, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { ROLES, ROLE_LABEL, isCoordenador } from '../permissions.js';
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
        Define o papel de cada pessoa. Quem se regista começa em <strong>Leitura</strong>.
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
              <thead><tr><th>Email</th><th>Papel</th><th>Vínculo</th></tr></thead>
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
        // Mostra o seletor de vínculo adequado ao novo papel.
        const wrap = container.querySelector(`[data-link-wrap="${id}"]`);
        if (wrap) wrap.innerHTML = linkControl(state.profiles.find((p) => p.id === id));
        wireLink(container.querySelector(`[data-link-wrap="${id}"]`));
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
    </tr>
  `;
}

// Seletor de vínculo conforme o papel: treinador→coach, atleta→player.
function linkControl(p) {
  if (p.role === 'treinador') {
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
