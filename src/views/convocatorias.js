// Convocatórias: modal para gerir a lista de convocados para um jogo.
// Abre a partir do Calendário, sobre um evento do tipo 'jogo'.

import { state, ensureSquad, upsertSquadPlayer, removeSquadPlayer, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName } from '../compute.js';
import { SQUAD_STATUSES, SQUAD_STATUS_LABEL, SQUAD_STATUS_BADGE } from '../constants.js';
import { canEdit } from '../permissions.js';

export async function openSquadModal(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return;

  const editable = canEdit('squads');
  const team = teamById(event.team_id);
  const players = state.players
    .filter((p) => p.team_id === event.team_id)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  const dt = eventDateTime(event);
  const dateStr = dt.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' });
  const timeStr = eventTimeRange(event);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  function getSquad() {
    return state.squads.find((s) => s.event_id === eventId) || null;
  }

  function playerStatus(playerId) {
    const squad = getSquad();
    if (!squad) return null;
    const sp = state.squadPlayers.find(
      (p) => p.squad_id === squad.id && p.player_id === playerId
    );
    return sp ? sp.status : null;
  }

  function render() {
    const squad = getSquad();
    const convocados = players.filter((p) => playerStatus(p.id) !== null);
    const nConvocados = convocados.length;
    const nTitulares = convocados.filter((p) => playerStatus(p.id) === 'titular').length;
    const nSuplentes = convocados.filter((p) => playerStatus(p.id) === 'suplente').length;

    overlay.innerHTML = `
      <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-label="Convocatória">
        <div class="modal__head">
          <div>
            <h2 class="section-title">Convocatória</h2>
            <p class="muted" style="margin:0;font-size:0.85rem">
              ${team ? esc(teamName(team)) : 'Sem equipa'} · ${esc(dateStr)}${timeStr ? ' · ' + esc(timeStr) : ''}
              ${event.opponent ? ' · vs ' + esc(event.opponent) : ''}
            </p>
          </div>
          <button class="modal__close" aria-label="Fechar" type="button">&times;</button>
        </div>

        <div class="squad-summary" style="display:flex;gap:1rem;margin-bottom:1rem;flex-wrap:wrap">
          <span class="badge badge--info">${nConvocados} convocado${nConvocados !== 1 ? 's' : ''}</span>
          <span class="badge badge--ok">${nTitulares} titular${nTitulares !== 1 ? 'es' : ''}</span>
          <span class="badge badge--warn">${nSuplentes} suplente${nSuplentes !== 1 ? 's' : ''}</span>
          ${!squad && players.length ? '<span class="badge badge--muted">Convocatória ainda não criada</span>' : ''}
        </div>

        <p class="modal__error hidden" role="alert"></p>

        ${!players.length
          ? `<p class="muted">Esta equipa não tem atletas registados.</p>`
          : `<div class="squad-list">
              ${players.map((p) => {
                const st = playerStatus(p.id);
                return `
                  <div class="squad-row" data-player="${p.id}">
                    <div class="squad-row__info">
                      ${p.number ? `<span class="squad-row__num">${esc(p.number)}</span>` : ''}
                      <span class="squad-row__name">${esc(p.name)}</span>
                      ${p.position ? `<span class="muted" style="font-size:0.8rem">${esc(p.position)}</span>` : ''}
                    </div>
                    ${editable
                      ? `<div class="squad-row__actions">
                          ${SQUAD_STATUSES.map((s) => `
                            <button type="button"
                              class="btn btn--xs ${st === s.key ? 'btn--primary' : 'btn--ghost'}"
                              data-action="set" data-player="${p.id}" data-status="${s.key}">
                              ${esc(s.label)}
                            </button>
                          `).join('')}
                          ${st !== null
                            ? `<button type="button" class="btn btn--xs btn--ghost squad-remove"
                                data-action="remove" data-player="${p.id}" title="Remover">✕</button>`
                            : ''}
                        </div>`
                      : `<div class="squad-row__status">
                          ${st !== null
                            ? `<span class="badge badge--${SQUAD_STATUS_BADGE[st]}">${esc(SQUAD_STATUS_LABEL[st])}</span>`
                            : '<span class="muted" style="font-size:0.8rem">Não convocado</span>'}
                        </div>`
                    }
                  </div>
                `;
              }).join('')}
            </div>`
        }

        <div class="modal__actions" style="margin-top:1.2rem">
          ${editable && players.length ? `
            <button type="button" class="btn btn--ghost" id="squad-convocar-todos">
              Convocar todos
            </button>
            <button type="button" class="btn btn--ghost squad-clear-all" id="squad-limpar">
              Limpar tudo
            </button>
          ` : ''}
          <button type="button" class="btn btn--primary" data-close>Fechar</button>
        </div>
      </div>
    `;

    const errorEl = overlay.querySelector('.modal__error');

    async function withError(fn) {
      errorEl.classList.add('hidden');
      try {
        await fn();
      } catch (err) {
        errorEl.textContent = dbErrorMessage(err);
        errorEl.classList.remove('hidden');
      }
    }

    overlay.querySelector('[data-close], .modal__close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelectorAll('[data-action="set"]').forEach((btn) => {
      btn.addEventListener('click', () => withError(async () => {
        const squad = await ensureSquad(eventId);
        await upsertSquadPlayer(squad.id, btn.dataset.player, btn.dataset.status);
        render();
      }));
    });

    overlay.querySelectorAll('[data-action="remove"]').forEach((btn) => {
      btn.addEventListener('click', () => withError(async () => {
        const squad = getSquad();
        if (squad) await removeSquadPlayer(squad.id, btn.dataset.player);
        render();
      }));
    });

    overlay.querySelector('#squad-convocar-todos')?.addEventListener('click', () =>
      withError(async () => {
        const squad = await ensureSquad(eventId);
        for (const p of players) {
          if (playerStatus(p.id) === null) {
            await upsertSquadPlayer(squad.id, p.id, 'convocado');
          }
        }
        render();
      })
    );

    overlay.querySelector('#squad-limpar')?.addEventListener('click', () =>
      withError(async () => {
        const squad = getSquad();
        if (!squad) return;
        for (const p of players) {
          if (playerStatus(p.id) !== null) {
            await removeSquadPlayer(squad.id, p.id);
          }
        }
        render();
      })
    );
  }

  function close() {
    overlay.remove();
    document.body.classList.remove('no-scroll');
  }

  render();
}
