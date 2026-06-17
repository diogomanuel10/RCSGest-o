// Vista: Utilizadores (gestão de papéis e vínculo a registo de treinador).
// Visível apenas para o coordenador.

import { state, updateProfileRole, linkCoachToUser, dbErrorMessage } from '../store.js';
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

  // Mapa coach.user_id → coach.id (para pré-selecionar o vínculo)
  const coachByUser = {};
  state.coaches.forEach((c) => {
    if (c.user_id) coachByUser[c.user_id] = c.id;
  });

  const coachOptions = state.coaches
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((c) => `<option value="${c.id}">${esc(c.name)}</option>`)
    .join('');

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Utilizadores</h1>
    </header>

    <section class="card">
      <p class="muted" style="margin-top:0">
        Define o papel de cada pessoa. Quem se regista começa em <strong>Leitura</strong>.
        Para os treinadores, vincula o registo de treinador para que só vejam as suas equipas.
      </p>
      <div class="roles-legend">
        ${ROLES.map(
          (r) => `<span class="muted"><strong>${r.label}:</strong> ${esc(r.desc)}</span>`
        ).join('')}
      </div>

      ${
        profiles.length
          ? `<div class="table-wrap"><table class="users-table">
              <thead><tr><th>Email</th><th>Papel</th><th>Treinador vinculado</th></tr></thead>
              <tbody>
                ${profiles.map((p) => userRow(p, coachByUser, coachOptions)).join('')}
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
        // Ao mudar de treinador para outro papel, mostrar/esconder o seletor de coach
        const coachWrap = container.querySelector(`[data-coach-wrap="${id}"]`);
        if (coachWrap) coachWrap.classList.toggle('hidden', role !== 'treinador');
        showMsg(`Papel atualizado para ${ROLE_LABEL[role]}.`, 'ok');
      } catch (err) {
        e.target.value = previous;
        showMsg(dbErrorMessage(err), 'error');
      } finally {
        e.target.disabled = false;
      }
    });
  });

  container.querySelectorAll('.coach-link-select').forEach((sel) => {
    sel.addEventListener('change', async (e) => {
      const coachId = e.target.value;
      const userId = e.target.dataset.userid;
      const previous = e.target.dataset.prev;
      e.target.disabled = true;
      try {
        if (coachId) {
          await linkCoachToUser(coachId, userId);
          e.target.dataset.prev = coachId;
          showMsg('Vínculo guardado.', 'ok');
        } else if (previous) {
          // Desvincula o coach anterior
          await linkCoachToUser(previous, null);
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
  });

  function showMsg(text, kind) {
    msg.textContent = text;
    msg.className = `settings-msg settings-msg--${kind}`;
  }
}

function userRow(p, coachByUser, coachOptions) {
  const linkedCoachId = coachByUser[p.id] || '';
  const isTrainer = p.role === 'treinador';

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
      <td>
        <div data-coach-wrap="${p.id}" ${!isTrainer ? 'class="hidden"' : ''}>
          <select class="coach-link-select" data-userid="${p.id}" data-prev="${linkedCoachId}">
            <option value="">— Sem vínculo —</option>
            ${coachOptions.replace(
              `value="${linkedCoachId}"`,
              `value="${linkedCoachId}" selected`
            )}
          </select>
        </div>
        ${!isTrainer ? '<span class="muted" style="font-size:0.8rem">—</span>' : ''}
      </td>
    </tr>
  `;
}
