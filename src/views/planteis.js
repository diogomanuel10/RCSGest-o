// Vista: Plantéis. Equipas agrupadas por género, com lista de atletas
// expansível e operações de adicionar/editar/remover equipas e atletas.

import { state, createRow, updateRow, deleteRow, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { coachById, teamName, escaloes } from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { GENDERS, POSITIONS } from '../constants.js';
import { canEdit } from '../permissions.js';

// Equipas expandidas (mostram os atletas). Mantido entre re-desenhos.
const expanded = new Set();

export function renderPlanteis(container) {
  const editable = canEdit('teams');
  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Plantéis</h1>
      ${editable ? '<button class="btn btn--accent" id="add-team" type="button">+ Equipa</button>' : ''}
    </header>
    ${
      state.teams.length
        ? `<div class="genders">${GENDERS.map((g) => genderColumnHTML(g, editable)).join('')}</div>`
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
  container.querySelectorAll('[data-player-edit]').forEach((b) =>
    b.addEventListener('click', () => openPlayerForm(b.dataset.team, b.dataset.playerEdit))
  );
  container.querySelectorAll('[data-player-del]').forEach((b) =>
    b.addEventListener('click', () => removePlayer(b.dataset.playerDel, container))
  );
}

function genderColumnHTML(g, editable) {
  const teams = state.teams.filter((t) => t.gender === g.key);
  return `
    <section class="gender-col">
      <h2 class="section-title gender-col__title">${g.label}</h2>
      ${
        teams.length
          ? teams.map((t) => teamCardHTML(t, editable)).join('')
          : `<p class="muted">Sem equipas ${g.label.toLowerCase()}.</p>`
      }
    </section>
  `;
}

function teamCardHTML(team, editable) {
  const players = state.players
    .filter((p) => p.team_id === team.id)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
  const coach = coachById(team.coach_id);
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
              ${coach ? esc(coach.name) : 'Sem treinador'} · ${players.length} atleta${
    players.length === 1 ? '' : 's'
  }
            </span>
          </span>
        </button>
        ${
          editable
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
            players.length
              ? `<table class="players-table">
                  <thead><tr><th>#</th><th>Nome</th><th>Ano</th><th>Posição</th>${
                    editable ? '<th></th>' : ''
                  }</tr></thead>
                  <tbody>
                    ${players
                      .map(
                        (p) => `
                      <tr>
                        <td>${esc(p.number || '—')}</td>
                        <td>${esc(p.name)}</td>
                        <td>${esc(p.birth_year || '—')}</td>
                        <td>${esc(p.position || '—')}</td>
                        ${
                          editable
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
            editable
              ? `<button class="btn btn--ghost btn--sm team-card__addplayer" data-add-player="${team.id}" type="button">+ Atleta</button>`
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
  openModal({
    title: existing ? 'Editar equipa' : 'Nova equipa',
    submitLabel: existing ? 'Guardar' : 'Adicionar',
    values: existing || {},
    fields: [
      { name: 'escalao', label: 'Escalão', type: 'select', required: true, placeholder: 'Escolhe…', options: escaloes() },
      { name: 'gender', label: 'Género', type: 'select', required: true, options: GENDERS },
      {
        name: 'coach_id',
        label: 'Treinador',
        type: 'select',
        placeholder: 'Sem treinador',
        options: state.coaches.map((c) => ({ key: c.id, label: c.name })),
      },
    ],
    onSubmit: async (values) => {
      const payload = {
        escalao: values.escalao,
        gender: values.gender,
        coach_id: values.coach_id || null,
      };
      try {
        if (existing) await updateRow('teams', 'teams', id, payload);
        else {
          const created = await createRow('teams', 'teams', payload);
          expanded.add(created.id);
        }
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
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
    ],
    onSubmit: async (values) => {
      const payload = {
        team_id: teamId,
        name: values.name.trim(),
        number: values.number?.trim() || null,
        birth_year: values.birth_year?.trim() || null,
        position: values.position || null,
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
