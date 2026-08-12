// Viragem de época — assistente do coordenador.
//
// Virar a época é hoje trabalho braçal: subir cada atleta de escalão à mão,
// arquivar quem sai, repor as avaliações e mudar a época nas Definições. É uma
// coisa que se faz uma vez por ano, o que é precisamente o motivo pelo qual
// ninguém se lembra de como se fazia da última vez.
//
// O assistente PROPÕE — a partir das decisões já tomadas na Avaliação de
// plantel — e mostra tudo antes de aplicar. Não decide nada sozinho: quem fica
// e quem sai já foi decidido pelo treinador, e o destino de cada equipa pode
// ser mudado aqui antes de confirmar.
//
// A decisão continua a ser do coordenador (é ele quem arquiva) e nada é
// apagado: quem sai fica arquivado e pode ser reposto nos Arquivados.

import { state, applySeasonRollover, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { escaloes, teamName } from '../compute.js';
import { confirmDialog } from '../modal.js';
import { toastError } from '../toast.js';

// Destino escolhido por equipa (team_id de origem -> team_id de destino, ou
// '' para "fica onde está"). Vive enquanto o assistente estiver aberto.
let destinos = new Map();

export function openSeasonRollover() {
  const teams = state.teams
    .slice()
    .sort((a, b) => teamName(a).localeCompare(teamName(b)));

  destinos = new Map();
  for (const t of teams) {
    const sugerido = suggestDestination(t, teams);
    destinos.set(t.id, sugerido ? sugerido.id : '');
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-labelledby="ne-title"
         style="display:flex;flex-direction:column;max-height:92vh">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="ne-title">Virar a época</h2>
          <p class="muted" style="margin:0;font-size:0.85rem">
            Aplica as decisões da Avaliação de plantel a todo o clube.
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <div style="overflow-y:auto;flex:1;margin:0 -0.2rem;padding:0 0.2rem" data-ne-body></div>

      <p class="modal__error hidden" data-ne-err role="alert"></p>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" data-ne-cancel>Cancelar</button>
        <button class="btn btn--primary" type="button" data-ne-apply>Rever e aplicar</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('[data-ne-cancel]').addEventListener('click', close);

  const body = overlay.querySelector('[data-ne-body]');

  function paint() {
    body.innerHTML = bodyHTML(teams);
    body.querySelectorAll('[data-dest]').forEach((sel) =>
      sel.addEventListener('change', () => {
        destinos.set(sel.dataset.dest, sel.value);
        paint();                                   // o resumo muda com a escolha
      })
    );
  }
  paint();

  overlay.querySelector('[data-ne-apply]').addEventListener('click', async () => {
    const errEl = overlay.querySelector('[data-ne-err]');
    const btn = overlay.querySelector('[data-ne-apply]');
    errEl.classList.add('hidden');

    const plano = buildPlan(teams);
    const season = (body.querySelector('#ne-season')?.value || '').trim();

    if (!plano.moves.length && !plano.archives.length && !plano.resets.length && !season) {
      errEl.textContent = 'Não há nada para aplicar. Decide primeiro quem fica e quem sai na Avaliação de plantel.';
      errEl.classList.remove('hidden');
      return;
    }

    const partes = [];
    if (plano.moves.length) partes.push(`${plano.moves.length} atleta(s) mudam de equipa`);
    if (plano.archives.length) partes.push(`${plano.archives.length} são arquivados`);
    if (plano.resets.length) partes.push(`${plano.resets.length} voltam a "Pendente"`);
    if (season && season !== state.settings.season) partes.push(`a época passa a ${season}`);

    const ok = await confirmDialog(
      `${partes.join(', ')}. Os arquivados ficam no histórico e podem ser repostos nos Arquivados.`,
      { confirmLabel: 'Aplicar', danger: plano.archives.length > 0 }
    );
    if (!ok) return;

    btn.disabled = true;
    btn.textContent = 'A aplicar…';
    try {
      await applySeasonRollover({ ...plano, season: season || undefined });
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      toastError(dbErrorMessage(err));
      btn.disabled = false;
      btn.textContent = 'Rever e aplicar';
    }
  });
}

// --- Proposta -------------------------------------------------------------

// Equipa do escalão seguinte, com o mesmo género. A ordem dos escalões é a que
// está configurada nas Definições (do mais novo para o mais velho), por isso
// "seguinte" é literalmente o item a seguir na lista.
//
// Devolve null quando não há para onde subir — no último escalão (seniores) ou
// quando a equipa de destino ainda não existe. Nesse caso a proposta é ficar,
// que é o que acontece na realidade.
function suggestDestination(team, teams) {
  const lista = escaloes();
  const i = lista.indexOf(team.escalao);
  if (i < 0 || i >= lista.length - 1) return null;
  const seguinte = lista[i + 1];
  return teams.find((t) => t.escalao === seguinte && t.gender === team.gender) || null;
}

// Traduz as escolhas do ecrã no conjunto de operações a executar.
function buildPlan(teams) {
  const moves = [];
  const archives = [];
  const resets = [];

  for (const team of teams) {
    const destinoId = destinos.get(team.id) || '';
    const plantel = state.players.filter((p) => p.team_id === team.id);

    for (const p of plantel) {
      const decisao = p.review_status || 'pendente';
      if (decisao === 'sai') {
        archives.push(p.id);
      } else if (decisao === 'mantem') {
        // Mover só quando há destino diferente da equipa atual: um update que
        // grava o mesmo valor é uma escrita a mais e um registo de alteração
        // que não aconteceu.
        if (destinoId && destinoId !== team.id) moves.push({ playerId: p.id, teamId: destinoId });
        resets.push(p.id);
      }
      // 'pendente' fica exatamente como está — ninguém sobe nem sai por
      // omissão. Uma decisão que não foi tomada não é uma decisão.
    }
  }
  return { moves, archives, resets };
}

// --- Ecrã -----------------------------------------------------------------

function bodyHTML(teams) {
  const plano = buildPlan(teams);
  const pendentes = state.players.filter((p) => (p.review_status || 'pendente') === 'pendente').length;

  return `
    <section class="res-block">
      <h3 class="res-block__title">Época</h3>
      <p class="muted res-block__hint">
        A época atual é <strong>${esc(state.settings.season || '—')}</strong>.
        Escreve a nova para ficar registada nas Definições.
      </p>
      <div class="field" style="max-width:16rem">
        <label for="ne-season">Nova época</label>
        <input type="text" id="ne-season" maxlength="20"
               value="${esc(nextSeason(state.settings.season))}" placeholder="2027/2028" />
      </div>
    </section>

    <section class="res-block">
      <h3 class="res-block__title">Destino de cada equipa</h3>
      <p class="muted res-block__hint">
        Quem foi marcado como <strong>Mantém</strong> passa para a equipa de destino.
        A proposta é o escalão seguinte, quando essa equipa existe — podes mudá-la.
      </p>
      ${teams.length
        ? `<div class="scroll-x"><table class="players-table">
             <thead><tr>
               <th>Equipa</th><th>Mantêm</th><th>Saem</th><th>Pendentes</th><th>Destino de quem fica</th>
             </tr></thead>
             <tbody>${teams.map((t) => teamRowHTML(t, teams)).join('')}</tbody>
           </table></div>`
        : '<p class="muted">Ainda não há equipas.</p>'}
    </section>

    <section class="res-block">
      <h3 class="res-block__title">O que vai acontecer</h3>
      <ul class="ne-summary">
        <li><strong>${plano.moves.length}</strong> atleta(s) mudam de equipa</li>
        <li><strong>${plano.archives.length}</strong> atleta(s) arquivados (podem ser repostos nos Arquivados)</li>
        <li><strong>${plano.resets.length}</strong> avaliações repostas a "Pendente"</li>
      </ul>
      ${pendentes
        ? `<p class="res-block__hint" style="color:var(--warn)">
             ${pendentes} atleta(s) ainda por decidir ficam exatamente onde estão.
             Decide-os na Avaliação de plantel antes de virar a época, se quiseres que subam.
           </p>`
        : ''}
    </section>
  `;
}

function teamRowHTML(team, teams) {
  const plantel = state.players.filter((p) => p.team_id === team.id);
  const counts = { pendente: 0, mantem: 0, sai: 0 };
  plantel.forEach((p) => { counts[p.review_status || 'pendente']++; });
  const destinoId = destinos.get(team.id) || '';

  const opcoes = [`<option value="" ${destinoId === '' ? 'selected' : ''}>Fica em ${esc(teamName(team))}</option>`]
    .concat(
      teams
        .filter((t) => t.id !== team.id)
        .map((t) => `<option value="${t.id}" ${destinoId === t.id ? 'selected' : ''}>${esc(teamName(t))}</option>`)
    ).join('');

  return `
    <tr>
      <td>${esc(teamName(team))}</td>
      <td>${counts.mantem}</td>
      <td>${counts.sai || '<span class="muted">—</span>'}</td>
      <td>${counts.pendente || '<span class="muted">—</span>'}</td>
      <td>
        <select data-dest="${team.id}" aria-label="Destino de quem fica em ${esc(teamName(team))}"
                ${counts.mantem ? '' : 'disabled'}>
          ${opcoes}
        </select>
      </td>
    </tr>`;
}

// Sugestão para a época seguinte a partir da atual. Cobre os dois formatos em
// uso ("2026/2027" e "2026/27") e, se não reconhecer o formato, devolve o
// campo vazio em vez de inventar um valor errado.
function nextSeason(atual) {
  const m = /^(\d{4})\s*\/\s*(\d{2,4})$/.exec(String(atual || '').trim());
  if (!m) return '';
  const inicio = Number(m[1]) + 1;
  const fim = m[2].length === 4 ? String(Number(m[2]) + 1) : String((Number(m[2]) + 1) % 100).padStart(2, '0');
  return `${inicio}/${fim}`;
}
