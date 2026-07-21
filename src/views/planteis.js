// Vista: Plantéis. Equipas agrupadas por género, com lista de atletas
// expansível e operações de adicionar/editar/remover equipas e atletas.

import { state, createRow, createRows, updateRow, archiveRow, saveTeamCoaches, dbErrorMessage } from '../store.js';
import { esc, emptyHTML, paginate, paginationHTML, wirePagination, PAGE_SIZE } from '../ui.js';
import {
  teamName, teamCoaches, escaloes, currentCoach, coachTeams, positions,
  playerAttendanceStats, playerAvailability, playerQuotas,
  escalaoColor, positionColor,
} from '../compute.js';
import { openModal, confirmDialog } from '../modal.js';
import { COACH_ROLE_LABEL, AVAILABILITY_LABEL } from '../constants.js';
import { canEdit, canDelete, canAccess, isCoordenador } from '../permissions.js';
import { planLimit, currentPlan } from '../plans.js';
import { parsePlayersFile, downloadPlayersTemplate } from '../players-xlsx.js';
import { openAthleteProfile } from './athlete-profile.js';
import { evaluationHTML, wireEvaluation } from './avaliacao.js';

// Equipa selecionada (mostra o seu plantel). Mantida entre re-desenhos.
let selectedTeamId = null;
// Modo da vista: 'plantel' (lista de atletas) ou 'avaliacao' (planear a época).
let mode = 'plantel';
// Filtros e paginação (estado local da vista).
let search = '';
let positionFilter = '';
const teamPage = new Map(); // team_id -> página atual dos atletas

// Abre os Plantéis diretamente no modo "Planear época" (usado pelo Painel).
export function openSeasonPlanning() {
  mode = 'avaliacao';
}

// Sigla curta do escalão para o crachá (ex.: "Sub-14" -> "S14", "Seniores" -> "SEN").
function escalaoBadge(esc) {
  const s = String(esc || '');
  const digits = (s.match(/\d+/) || [''])[0];
  const letter = (s.match(/[A-Za-zÀ-ÿ]/) || ['?'])[0].toUpperCase();
  return digits ? letter + digits : s.slice(0, 3).toUpperCase();
}

// Idade a partir do ano de nascimento (só se for um ano plausível).
function ageFrom(birthYear) {
  const y = Number(birthYear);
  if (!y || y < 1900 || y > 2100) return null;
  const a = new Date().getFullYear() - y;
  return a >= 0 && a < 120 ? a : null;
}

// Equipas visíveis ao utilizador atual. O coordenador vê todas; o treinador
// (e qualquer outro papel ligado a uma ficha de treinador) só vê as suas.
function scopedTeams() {
  if (isCoordenador()) return state.teams;
  const coach = currentCoach();
  if (!coach) return state.teams;
  const mine = new Set(coachTeams(coach.id).map((x) => x.team.id));
  return state.teams.filter((t) => mine.has(t.id));
}

// Atletas de uma equipa após pesquisa e filtro de posição, ordenados por nº.
function filteredPlayers(teamId) {
  const q = search.trim().toLowerCase();
  return state.players
    .filter((p) => p.team_id === teamId)
    .filter((p) => !q || (p.name || '').toLowerCase().includes(q))
    .filter((p) => !positionFilter || p.position === positionFilter)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
}

export function renderPlanteis(container) {
  // Gestão de equipas é do coordenador; gestão de atletas é do coordenador
  // ou do treinador (limitado às suas equipas pelo RLS).
  const canTeams = canEdit('teams');
  const canPlayers = canEdit('players');
  // Arquivar atletas é uma decisão do coordenador (o treinador edita mas não remove).
  const canRemovePlayers = canDelete('players');
  // "Planear época" (avaliação) só para quem tem acesso à avaliação de plantel.
  const canEval = canAccess('avaliacao');
  if (mode === 'avaliacao' && !canEval) mode = 'plantel';
  const evaluating = mode === 'avaliacao';
  // Os filtros de pesquisa só se aplicam no modo plantel.
  const filtering = !evaluating && !!(search.trim() || positionFilter);

  // Equipas do utilizador (todas para o coordenador; só as suas para o treinador).
  const myTeams = scopedTeams();
  // Com filtro ativo, mostram-se só as equipas com atletas correspondentes.
  const teams = myTeams.filter((t) => !filtering || filteredPlayers(t.id).length);

  // Seleção: mantida entre re-desenhos; cai na primeira equipa visível se a
  // selecionada deixar de existir ou de corresponder ao filtro.
  if (!teams.some((t) => t.id === selectedTeamId)) {
    selectedTeamId = teams.length ? teams[0].id : null;
  }
  const team = teams.find((t) => t.id === selectedTeamId) || null;

  container.innerHTML = `
    <header class="page-head">
      <h1 class="section-title">Plantéis</h1>
      <div class="page-head__actions">
        ${canEval ? modeToggleHTML(mode) : ''}
        ${canTeams ? '<button class="btn btn--accent" id="add-team" type="button">+ Equipa</button>' : ''}
      </div>
    </header>
    ${myTeams.length && !evaluating ? filterBarHTML() : ''}
    ${
      !myTeams.length
        ? emptyHTML(evaluating ? 'Ainda não há equipas para avaliar.' : 'Ainda não há equipas.')
        : !teams.length
          ? emptyHTML('Nenhum atleta corresponde ao filtro.')
          : `${teamPillsHTML(teams, filtering)}
             ${
               evaluating
                 ? evaluationHTML(team, { editable: canPlayers, canApply: canRemovePlayers, color: escalaoColor(team.escalao) })
                 : rosterHTML(team, canTeams, canPlayers, canRemovePlayers, filtering)
             }`
    }
  `;

  // Filtros: pesquisa (mantém o foco) e posição.
  const searchEl = container.querySelector('#pl-search');
  searchEl?.addEventListener('input', (e) => {
    search = e.target.value;
    teamPage.clear();
    renderPlanteis(container);
    const el = container.querySelector('#pl-search');
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  });
  container.querySelector('#pl-pos')?.addEventListener('change', (e) => {
    positionFilter = e.target.value;
    teamPage.clear();
    renderPlanteis(container);
  });

  // Alternar modo (Plantel / Planear época).
  container.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      if (mode === b.dataset.mode) return;
      mode = b.dataset.mode;
      renderPlanteis(container);
    })
  );

  // Seleção da equipa (separadores).
  container.querySelectorAll('[data-team-pick]').forEach((b) =>
    b.addEventListener('click', () => {
      selectedTeamId = b.dataset.teamPick;
      renderPlanteis(container);
    })
  );

  // + Equipa está no cabeçalho nos dois modos.
  container.querySelector('#add-team')?.addEventListener('click', () => openTeamForm());

  // Modo avaliação: liga os seus próprios eventos (filtros, decisões, aplicar).
  if (evaluating && team) {
    wireEvaluation(container, team, () => renderPlanteis(container));
    return;
  }

  // Paginação dos atletas da equipa selecionada (modo plantel).
  if (team) {
    const pg = paginate(filteredPlayers(team.id), teamPage.get(team.id) || 1, PAGE_SIZE);
    wirePagination(container, `pl-${team.id}`, pg.page, pg.totalPages, (np) => {
      teamPage.set(team.id, np);
      renderPlanteis(container);
    });
  }

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

// Alternador de modo: ver o plantel ou planear a próxima época (avaliação).
function modeToggleHTML(current) {
  const opt = (key, label) =>
    `<button class="mode-toggle__btn${current === key ? ' is-active' : ''}"
             type="button" data-mode="${key}" aria-pressed="${current === key}">${label}</button>`;
  return `<div class="mode-toggle" role="group" aria-label="Modo dos Plantéis">
      ${opt('plantel', 'Plantel')}${opt('avaliacao', 'Planear época')}
    </div>`;
}

// Barra de filtros (pesquisa por nome + posição).
function filterBarHTML() {
  return `
    <div class="filter-bar">
      <div class="field field--grow">
        <label for="pl-search">Pesquisar atleta</label>
        <input type="search" id="pl-search" placeholder="Nome do atleta…" value="${esc(search)}" />
      </div>
      <div class="field">
        <label for="pl-pos">Posição</label>
        <select id="pl-pos">
          <option value="">Todas as posições</option>
          ${positions().map((p) => `<option value="${esc(p)}" ${positionFilter === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}
        </select>
      </div>
    </div>
  `;
}

// Separadores das equipas (um por escalão, com cor e crachá). Clicar seleciona.
function teamPillsHTML(teams, filtering) {
  return `
    <div class="team-pills" role="tablist" aria-label="Equipas">
      ${teams
        .map((t) => {
          const color = escalaoColor(t.escalao);
          const count = filtering
            ? filteredPlayers(t.id).length
            : state.players.filter((p) => p.team_id === t.id).length;
          const on = t.id === selectedTeamId;
          return `
            <button class="team-pill${on ? ' team-pill--on' : ''}" style="--tc:${color}"
                    role="tab" aria-selected="${on}" data-team-pick="${t.id}" type="button">
              <span class="team-pill__badge">${esc(escalaoBadge(t.escalao))}</span>
              <span class="team-pill__t">
                <strong>${esc(t.escalao)}</strong>
                <span>${count} atleta${count === 1 ? '' : 's'}</span>
              </span>
            </button>`;
        })
        .join('')}
    </div>`;
}

// Plantel da equipa selecionada: cabeçalho com identidade + grelha de atletas.
function rosterHTML(team, canTeams, canPlayers, canRemovePlayers, filtering) {
  if (!team) return '';
  const color = escalaoColor(team.escalao);
  const players = filteredPlayers(team.id);
  const totalInTeam = state.players.filter((p) => p.team_id === team.id).length;
  const coaches = teamCoaches(team.id);
  const pg = paginate(players, teamPage.get(team.id) || 1, PAGE_SIZE);
  const countLabel = filtering
    ? `${players.length} de ${totalInTeam} atleta${totalInTeam === 1 ? '' : 's'}`
    : `${totalInTeam} atleta${totalInTeam === 1 ? '' : 's'}`;

  return `
    <section class="roster" style="--tc:${color}">
      <div class="roster__head">
        <div class="roster__title">
          <span class="roster__badge">${esc(escalaoBadge(team.escalao))}</span>
          <div>
            <h2 class="section-title" style="margin:0">${esc(team.escalao)}</h2>
            <span class="muted roster__count">${countLabel}</span>
          </div>
        </div>
        ${
          canTeams
            ? `<div class="cell-actions">
                 <button class="btn btn--ghost btn--sm" data-team-edit="${team.id}" type="button">Editar equipa</button>
                 <button class="btn btn--danger btn--sm" data-team-del="${team.id}" type="button">Remover</button>
               </div>`
            : ''
        }
      </div>

      ${
        coaches.length
          ? `<div class="roster__coaches">
              ${coaches
                .map(
                  (c) => `<span class="team-coach-chip">
                    ${esc(c.coach.name)}
                    <span class="badge badge--${c.role === 'principal' ? 'info' : 'muted'}">${esc(COACH_ROLE_LABEL[c.role] || c.role)}</span>
                  </span>`
                )
                .join('')}
             </div>`
          : '<p class="muted roster__nocoach">Sem treinador atribuído.</p>'
      }

      ${
        players.length
          ? `<div class="player-cards">${pg.items.map((p) => playerCardHTML(p, team.id, canPlayers, canRemovePlayers)).join('')}</div>
             ${paginationHTML({ ...pg, id: `pl-${team.id}` })}`
          : `<p class="muted" style="margin:0.6rem 0">${filtering ? 'Nenhum atleta corresponde ao filtro.' : 'Sem atletas nesta equipa.'}</p>`
      }

      ${
        canPlayers
          ? `<div class="roster__actions">
               <button class="btn btn--accent btn--sm" data-add-player="${team.id}" type="button">+ Atleta</button>
               <button class="btn btn--ghost btn--sm" data-import-player="${team.id}" type="button">Importar (xlsx)</button>
               <button class="btn btn--link btn--sm" data-template type="button">Descarregar modelo</button>
             </div>`
          : ''
      }
    </section>
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

      <div class="field field--full">
        <label for="team-escalao">Escalão *</label>
        <select id="team-escalao" required>
          <option value="" ${existing ? '' : 'selected'}>Escolhe…</option>
          ${escalaoList.map((e) => `<option value="${esc(e)}" ${existing?.escalao === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}
        </select>
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
    const gender = 'F'; // clube só feminino
    const principal = principalSel.value || null;
    const adjuntos = [...overlay.querySelectorAll('#team-adjuntos input:checked')]
      .map((chk) => chk.value)
      .filter((cid) => cid !== principal);

    errEl.classList.add('hidden');
    if (!escalao) {
      errEl.textContent = 'Escolhe o escalão.';
      errEl.classList.remove('hidden');
      return;
    }

    // Limite de escalões do plano: só ao criar um escalão NOVO (adicionar mais
    // uma equipa a um escalão já existente não conta). Infinity = sem limite.
    if (!existing) {
      const distinct = new Set(state.teams.map((t) => t.escalao));
      if (!distinct.has(escalao) && distinct.size >= planLimit('escaloes')) {
        errEl.textContent =
          `O plano ${currentPlan().name} permite ${planLimit('escaloes')} escalão(ões). ` +
          'Faz upgrade do plano para adicionares mais.';
        errEl.classList.remove('hidden');
        return;
      }
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
        selectedTeamId = teamId;
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

// Linha de indicadores do cartão (só os que o utilizador pode ver): presenças,
// quotas e disponibilidade. Devolve '' se nenhum estiver acessível.
function playerStatsHTML(p) {
  const items = [];

  if (canAccess('presencas') || canAccess('estatisticas')) {
    const rate = playerAttendanceStats(p.id).rate;
    items.push(`
      <span class="pstat">
        <b class="${rate != null && rate < 75 ? 'pstat--warn' : ''}">${rate == null ? '—' : rate + '%'}</b>
        <small>Presenças</small>
      </span>`);
  }

  if (canAccess('quotas')) {
    const q = playerQuotas(p.id);
    items.push(`
      <span class="pstat">
        <b class="${q.owedCount ? 'pstat--warn' : ''}">${q.owedCount ? q.owedCount : '✓'}</b>
        <small>${q.owedCount ? `Quota${q.owedCount === 1 ? '' : 's'} em dívida` : 'Quota em dia'}</small>
      </span>`);
  }

  // Disponibilidade — visível à equipa técnica; assume "Apto" se nunca definida.
  const st = playerAvailability(p.id)?.status || 'apto';
  items.push(`
    <span class="pstat">
      <b><span class="avail-dot avail-dot--${st}"></span></b>
      <small>${esc(AVAILABILITY_LABEL[st] || st)}</small>
    </span>`);

  return `<span class="player-card__stats">${items.join('')}</span>`;
}

// Cartão de um atleta: clicável (abre o Perfil do Atleta). Nº e posição na cor
// da posição, avatar de iniciais, e uma linha de indicadores. Ações discretas.
function playerCardHTML(p, teamId, canPlayers, canRemovePlayers) {
  const initials = (p.name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  const color = positionColor(p.position);
  const age = ageFrom(p.birth_year);
  return `
    <article class="player-card" style="--pc:${color}">
      <button class="player-card__main" data-player-view="${p.id}" data-team="${teamId}" type="button">
        <span class="player-card__top">
          <span class="player-card__num">${p.number ? esc(p.number) : '—'}</span>
          <span class="player-card__avatar" aria-hidden="true">${esc(initials || '?')}</span>
          <span class="player-card__info">
            <span class="player-card__name">${esc(p.name)}</span>
            <span class="player-card__tags">
              <span class="pos-tag">${esc(p.position || 'Sem posição')}</span>
              ${age != null ? `<span class="player-card__age">${age} anos</span>` : ''}
            </span>
          </span>
        </span>
        ${playerStatsHTML(p)}
      </button>
      ${
        canPlayers || canRemovePlayers
          ? `<div class="player-card__actions">
               ${canPlayers ? `<button class="icon-btn" data-team="${teamId}" data-player-edit="${p.id}" type="button" aria-label="Editar atleta" title="Editar">
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
               </button>` : ''}
               ${canRemovePlayers ? `<button class="icon-btn icon-btn--danger" data-player-del="${p.id}" type="button" aria-label="Arquivar atleta" title="Arquivar">
                 <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>
               </button>` : ''}
             </div>`
          : ''
      }
    </article>
  `;
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
        options: positions(),
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
      selectedTeamId = teamId;
    } catch (err) {
      alert(dbErrorMessage(err));
    }
  });
  input.click();
}

async function removeTeam(id, container) {
  const team = state.teams.find((t) => t.id === id);
  const n = state.players.filter((p) => p.team_id === id).length;
  const extra = n ? ` Os ${n} atletas associados deixam de aparecer enquanto a equipa estiver arquivada.` : '';
  const ok = await confirmDialog(
    `Arquivar a equipa "${teamName(team)}"?${extra} Fica no histórico e pode ser reposta nos Arquivados.`,
    { confirmLabel: 'Arquivar', danger: false }
  );
  if (!ok) return;
  try {
    await archiveRow('teams', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}

async function removePlayer(id, container) {
  const p = state.players.find((x) => x.id === id);
  const ok = await confirmDialog(
    `Arquivar o atleta "${p?.name}"? Fica no histórico e pode ser reposto nos Arquivados.`,
    { confirmLabel: 'Arquivar', danger: false }
  );
  if (!ok) return;
  try {
    await archiveRow('players', id);
  } catch (err) {
    alert(dbErrorMessage(err));
  }
}
