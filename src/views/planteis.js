// Vista: Plantéis. Equipas agrupadas por género, com lista de atletas
// expansível e operações de adicionar/editar/remover equipas e atletas.

import { state, createRow, createRows, updateRow, deleteRow, saveTeamCoaches, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { teamName, teamCoaches, escaloes } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { GENDERS, POSITIONS, COACH_ROLE_LABEL } from '../constants.js';
import { canEdit } from '../permissions.js';
import { parsePlayersFile, downloadPlayersTemplate } from '../players-xlsx.js';
import { openAthleteProfile } from './athlete-profile.js';

// Equipas expandidas (mostram os atletas). Mantido entre re-desenhos.
const expanded = new Set();

export function renderPlanteis(container) {
  // Gestão de equipas é do coordenador; gestão de atletas é do coordenador
  // ou do treinador (limitado às suas equipas pelo RLS).
  const canTeams = canEdit('teams');
  const canPlayers = canEdit('players');
  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Plantéis</h1>
      ${canTeams ? '<button class="btn btn--accent" id="add-team" type="button">+ Equipa</button>' : ''}
    </header>
    ${
      state.teams.length
        ? `<div class="genders">${GENDERS.map((g) => genderColumnHTML(g, canTeams, canPlayers)).join('')}</div>`
        : emptyHTML('Ainda não há equipas.')
    }
  `;

  container.querySelector('#add-team')?.addEventListener('click', () => openTeamForm());

  container.querySelectorAll('[data-toggle]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.toggle;
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      renderPlanteis(container);
    })
  );
  container.querySelectorAll('[data-team-edit]').forEach((b) =>
    b.addEventListener('click', () => openTeamForm(b.dataset.teamEdit))
  );
  container.querySelectorAll('[data-team-del]').forEach((b) =>
    b.addEventListener('click', () => removeTeam(b.dataset.teamDel, container))
  );
  container.querySelectorAll('[data-add-player]').forEach((b) =>
    b.addEventListener('click', () => openPlayerForm(b.dataset.addPlayer))
  );
  container.querySelectorAll('[data-import-player]').forEach((b) =>
    b.addEventListener('click', () => importPlayers(b.dataset.importPlayer))
  );
  container.querySelectorAll('[data-template]').forEach((b) =>
    b.addEventListener('click', () => downloadPlayersTemplate())
  );
  container.querySelectorAll('[data-player-view]').forEach((b) =>
    b.addEventListener('click', () => {
      const id = b.dataset.playerView;
      const teamId = b.dataset.team;
      openAthleteProfile(id, canEdit('players') ? { onEdit: () => openPlayerForm(teamId, id) } : {});
    })
  );
  container.querySelectorAll('[data-player-edit]').forEach((b) =>
    b.addEventListener('click', () => openPlayerForm(b.dataset.team, b.dataset.playerEdit))
  );
  container.querySelectorAll('[data-player-del]').forEach((b) =>
    b.addEventListener('click', () => removePlayer(b.dataset.playerDel, container))
  );
}

function genderColumnHTML(g, canTeams, canPlayers) {
  const teams = state.teams.filter((t) => t.gender === g.key);
  return `
    <section class="gender-col">
      <h2 class="section-title gender-col__title">${g.label}</h2>
      ${
        teams.length
          ? teams.map((t) => teamCardHTML(t, canTeams, canPlayers)).join('')
          : `<p class="muted">Sem equipas ${g.label.toLowerCase()}.</p>`
      }
    </section>
  `;
}

function teamCardHTML(team, canTeams, canPlayers) {
  const players = state.players
    .filter((p) => p.team_id === team.id)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
  const coaches = teamCoaches(team.id);
  const coachesSummary = coaches.length
    ? coaches.map((c) => esc(c.coach.name)).join(', ')
    : 'Sem treinador';
  const isOpen = expanded.has(team.id);

  return `
    <article class="card team-card">
      <div class="team-card__head">
        <button class="team-card__toggle" data-toggle="${team.id}" type="button"
                aria-expanded="${isOpen}">
          <span class="team-card__chevron">${isOpen ? '▾' : '▸'}</span>
          <span>
            <strong>${esc(team.escalao)}</strong>
            <span class="muted team-card__meta">
              ${coachesSummary} · ${players.length} atleta${players.length === 1 ? '' : 's'}
            </span>
          </span>
        </button>
        ${
          canTeams
            ? `<div class="cell-actions">
          <button class="btn btn--ghost btn--sm" data-team-edit="${team.id}" type="button">Editar</button>
          <button class="btn btn--danger btn--sm" data-team-del="${team.id}" type="button">Remover</button>
        </div>`
            : ''
        }
      </div>

      ${
        isOpen
          ? `
        <div class="team-card__body">
          ${
            coaches.length
              ? `<div class="team-card__coaches">
                  ${coaches
                    .map(
                      (c) => `<span class="team-coach-chip">
                        ${esc(c.coach.name)}
                        <span class="badge badge--${c.role === 'principal' ? 'info' : 'muted'}">${esc(COACH_ROLE_LABEL[c.role] || c.role)}</span>
                      </span>`
                    )
                    .join('')}
                 </div>`
              : ''
          }
          ${
            players.length
              ? `<table class="players-table">
                  <thead><tr><th>#</th><th>Nome</th><th>Ano</th><th>Posição</th>${
                    canPlayers ? '<th></th>' : ''
                  }</tr></thead>
                  <tbody>
                    ${players
                      .map(
                        (p) => `
                      <tr>
                        <td>${esc(p.number || '—')}</td>
                        <td>
                          <button class="player-link" data-player-view="${p.id}" data-team="${team.id}" type="button">${esc(p.name)}</button>
                          ${playerExtraHTML(p)}
                        </td>
                        <td>${esc(p.birth_year || '—')}</td>
                        <td>${esc(p.position || '—')}</td>
                        ${
                          canPlayers
                            ? `<td class="cell-actions">
                          <button class="btn btn--ghost btn--sm" data-team="${team.id}" data-player-edit="${p.id}" type="button">Editar</button>
                          <button class="btn btn--danger btn--sm" data-player-del="${p.id}" type="button">Remover</button>
                        </td>`
                            : ''
                        }
                      </tr>`
                      )
                      .join('')}
                  </tbody>
                </table>`
              : '<p class="muted" style="margin:0.4rem 0">Sem atletas nesta equipa.</p>'
          }
          ${
            canPlayers
              ? `<div class="team-card__actions">
                   <button class="btn btn--ghost btn--sm" data-add-player="${team.id}" type="button">+ Atleta</button>
                   <button class="btn btn--ghost btn--sm" data-import-player="${team.id}" type="button">Importar (xlsx)</button>
                   <button class="btn btn--link btn--sm" data-template type="button">Descarregar modelo</button>
                 </div>`
              : ''
          }
        </div>`
          : ''
      }
    </article>
  `;
}

function openTeamForm(id) {
  const existing = id ? state.teams.find((t) => t.id === id) : null;
  const current = existing ? teamCoaches(existing.id) : [];
  const principalId = current.find((c) => c.role === 'principal')?.coach.id || '';
  const adjuntoIds = new Set(
    current.filter((c) => c.role === 'adjunto').map((c) => c.coach.id)
  );
  const escalaoList = escaloes();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="team-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 class="section-title" id="team-title">${existing ? 'Editar equipa' : 'Nova equipa'}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <div class="field-grid">
        <div class="field">
          <label for="team-escalao">Escalão *</label>
          <select id="team-escalao" required>
            <option value="" ${existing ? '' : 'selected'}>Escolhe…</option>
            ${escalaoList.map((e) => `<option value="${esc(e)}" ${existing?.escalao === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="team-gender">Género *</label>
          <select id="team-gender" required>
            ${GENDERS.map((g) => `<option value="${g.key}" ${existing?.gender === g.key ? 'selected' : ''}>${esc(g.label)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field field--full">
        <label for="team-principal">Treinador principal</label>
        <select id="team-principal">
          <option value="">Sem treinador principal</option>
          ${state.coaches.map((c) => `<option value="${c.id}" ${principalId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>

      <div class="field field--full">
        <label>Treinadores adjuntos</label>
        ${
          state.coaches.length
            ? `<div class="coach-checks" id="team-adjuntos">
                ${state.coaches.map((c) => `
                  <label class="coach-check">
                    <input type="checkbox" value="${c.id}" ${adjuntoIds.has(c.id) ? 'checked' : ''} />
                    <span>${esc(c.name)}</span>
                  </label>`).join('')}
               </div>`
            : '<p class="muted" style="margin:0">Ainda não há treinadores registados.</p>'
        }
      </div>

      <div id="team-err" class="modal__error hidden"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="team-cancel" type="button">Cancelar</button>
        <button class="btn btn--primary" id="team-confirm" type="button">${existing ? 'Guardar' : 'Adicionar'}</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  overlay.querySelector('#team-escalao').focus();

  const close = () => {
    overlay.remove();
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#team-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const principalSel = overlay.querySelector('#team-principal');
  const errEl = overlay.querySelector('#team-err');

  // O principal não pode estar também marcado como adjunto: ao escolher
  // principal, desmarca e desativa essa opção na lista de adjuntos.
  function syncAdjuntos() {
    const pid = principalSel.value;
    overlay.querySelectorAll('#team-adjuntos input').forEach((chk) => {
      const isPrincipal = chk.value === pid && pid !== '';
      chk.disabled = isPrincipal;
      if (isPrincipal) chk.checked = false;
      chk.closest('.coach-check').classList.toggle('coach-check--disabled', isPrincipal);
    });
  }
  principalSel.addEventListener('change', syncAdjuntos);
  syncAdjuntos();

  overlay.querySelector('#team-confirm').addEventListener('click', async () => {
    const escalao = overlay.querySelector('#team-escalao').value;
    const gender = overlay.querySelector('#team-gender').value;
    const principal = principalSel.value || null;
    const adjuntos = [...overlay.querySelectorAll('#team-adjuntos input:checked')]
      .map((chk) => chk.value)
      .filter((cid) => cid !== principal);

    errEl.classList.add('hidden');
    if (!escalao || !gender) {
      errEl.textContent = 'Escolhe o escalão e o género.';
      errEl.classList.remove('hidden');
      return;
    }

    const confirmBtn = overlay.querySelector('#team-confirm');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'A guardar…';

    const payload = { escalao, gender, coach_id: principal };
    const entries = [];
    if (principal) entries.push({ coach_id: principal, role: 'principal' });
    adjuntos.forEach((cid) => entries.push({ coach_id: cid, role: 'adjunto' }));

    try {
      let teamId;
      if (existing) {
        await updateRow('teams', 'teams', id, payload);
        teamId = id;
      } else {
        const created = await createRow('teams', 'teams', payload);
        teamId = created.id;
        expanded.add(teamId);
      }
      await saveTeamCoaches(teamId, entries);
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      confirmBtn.disabled = false;
      confirmBtn.textContent = existing ? 'Guardar' : 'Adicionar';
    }
  });
}

// Pequena linha com dados extra do atleta (nº de federado, encarregado, notas).
function playerExtraHTML(p) {
  const bits = [];
  if (p.federation_number) bits.push(`Fed. ${esc(p.federation_number)}`);
  if (p.guardian_contact) bits.push(esc(p.guardian_contact));
  if (p.notes) bits.push(esc(p.notes));
  if (!bits.length) return '';
  return `<span class="player-extra muted">${bits.join(' · ')}</span>`;
}

function openPlayerForm(teamId, playerId) {
  const existing = playerId ? state.players.find((p) => p.id === playerId) : null;
  const team = state.teams.find((t) => t.id === teamId);
  openModal({
    title: existing ? 'Editar atleta' : `Novo atleta · ${teamName(team)}`,
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Nome', required: true, full: true },
      { name: 'number', label: 'Número' },
      { name: 'birth_year', label: 'Ano de nascimento', placeholder: 'ex.: 2008' },
      {
        name: 'position',
        label: 'Posição',
        type: 'select',
        placeholder: '—',
        options: POSITIONS,
        full: true,
      },
      { name: 'federation_number', label: 'Nº de federado', placeholder: 'ex.: 987654' },
      { name: 'guardian_contact', label: 'Contacto do encarregado', placeholder: 'Telefone ou email' },
      { name: 'notes', label: 'Observações', type: 'textarea', full: true },
    ],
    onSubmit: async (values) => {
      const payload = {
        team_id: teamId,
        name: values.name.trim(),
        number: values.number?.trim() || null,
        birth_year: values.birth_year?.trim() || null,
        position: values.position || null,
        federation_number: values.federation_number?.trim() || null,
        guardian_contact: values.guardian_contact?.trim() || null,
        notes: values.notes?.trim() || null,
      };
      try {
        if (existing) await updateRow('players', 'players', playerId, payload);
        else await createRow('players', 'players', payload);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

// Importa atletas de um ficheiro .xlsx para a equipa indicada.
function importPlayers(teamId) {
  const team = state.teams.find((t) => t.id === teamId);
  const input = document.createElement('input');
  input.type = 'file';
  input.accept =
    '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    let parsed;
    try {
      parsed = await parsePlayersFile(file);
    } catch {
      alert('Não foi possível ler o ficheiro. Confirma que é um .xlsx válido.');
      return;
    }

    if (!parsed.players.length) {
      alert(
        'Não foram encontrados atletas no ficheiro. Usa o modelo (coluna "Nome" obrigatória).'
      );
      return;
    }

    const skippedMsg = parsed.skipped
      ? ` ${parsed.skipped} linha(s) sem nome foram ignoradas.`
      : '';
    const ok = await confirmDialog(
      `Importar ${parsed.players.length} atleta(s) para a equipa "${teamName(team)}"?${skippedMsg}`,
      { confirmLabel: 'Importar', danger: false }
    );
    if (!ok) return;

    const rows = parsed.players.map((p) => ({ ...p, team_id: teamId }));
    try {
      await createRows('players', 'players', rows);
      expanded.add(teamId);
    } catch (err) {
      alert(dbErrorMessage(err));
    }
  });
  input.click();
}

async function removeTeam(id, container) {
  const team = state.teams.find((t) => t.id === id);
  const n = state.players.filter((p) => p.team_id === id).length;
  const extra = n ? ` Os ${n} atletas associados também serão removidos.` : '';
  const ok = await confirmDialog(`Remover a equipa "${teamName(team)}"?${extra}`);
  if (!ok) return;
  try {
    await deleteRow('teams', 'teams', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function removePlayer(id, container) {
  const p = state.players.find((x) => x.id === id);
  const ok = await confirmDialog(`Remover o atleta "${p?.name}"?`);
  if (!ok) return;
  try {
    await deleteRow('players', 'players', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
