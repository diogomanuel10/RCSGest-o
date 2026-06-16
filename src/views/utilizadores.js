// Vista: Utilizadores (gestão de papéis). Visível apenas para o coordenador.

import { state, updateProfileRole, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { ROLES, ROLE_LABEL, isCoordenador } from '../permissions.js';

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
      </p>
      <div class="roles-legend">
        ${ROLES.map(
          (r) => `<span class="muted"><strong>${r.label}:</strong> ${esc(r.desc)}</span>`
        ).join('')}
      </div>

      ${
        profiles.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Email</th><th>Papel</th></tr></thead>
              <tbody>
                ${profiles
                  .map(
                    (p) => `
                  <tr>
                    <td>
                      <strong>${esc(p.email || '—')}</strong>
                      ${p.id === state.profile?.id ? '<span class="badge badge--muted">tu</span>' : ''}
                    </td>
                    <td>
                      <select class="role-select" data-id="${p.id}" ${
                      p.id === state.profile?.id ? 'data-self="1"' : ''
                    }>
                        ${ROLES.map(
                          (r) =>
                            `<option value="${r.key}" ${
                              p.role === r.key ? 'selected' : ''
                            }>${ROLE_LABEL[r.key]}</option>`
                        ).join('')}
                      </select>
                    </td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table></div>`
          : emptyHTML('Ainda não há outros utilizadores registados.')
      }
      <p class="settings-msg hidden" id="roles-msg"></p>
    </section>
  `;

  const msg = container.querySelector('#roles-msg');

  container.querySelectorAll('.role-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.dataset.id;
      const role = e.target.value;
      const previous = state.profiles.find((p) => p.id === id)?.role;

      // Aviso ao despromover-se a si próprio (perde o acesso de gestão).
      if (e.target.dataset.self && role !== 'coordenador') {
        const ok = confirm(
          'Vais deixar de ser coordenador e perdes o acesso de gestão. Continuar?'
        );
        if (!ok) {
          e.target.value = previous;
          return;
        }
      }

      e.target.disabled = true;
      try {
        await updateProfileRole(id, role);
        showMsg(`Papel atualizado para ${ROLE_LABEL[role]}.`, 'ok');
      } catch (err) {
        e.target.value = previous;
        showMsg(dbErrorMessage(err), 'error');
      } finally {
        e.target.disabled = false;
      }
    });
  });

  function showMsg(text, kind) {
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  }
}
