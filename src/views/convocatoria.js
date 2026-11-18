// Convocatória de um jogo — um diálogo, aberto da secção Jogos e do Painel.
//
// Vivia nas Presenças, ao lado do registo de presenças dos treinos, com um
// seletor que misturava treinos, sessões de musculação e jogos. Com a secção
// Jogos, a convocatória passou a ser um PASSO do jogo (plano → convocatória →
// scout → resultado → resumo), e as Presenças ficaram só com quem apareceu.
//
// Continua a juntar as duas metades da mesma pergunta: o que cada atleta
// RESPONDEU ao jogo e se o treinador o chamou. Um atleta convocado que avisou
// que não pode ir é exatamente o cruzamento que interessa ver.
//
// Estar convocado é ter linha em `squad_players`; não ter linha é ficar de
// fora. Não há terceiro estado (ver SQUAD_CALLED em constants.js).

import { state, ensureSquad, upsertSquadPlayer, addSquadPlayers, removeSquadPlayer, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName, eventResponseSummary,
         playerEventResponse, eventRoster } from '../compute.js';
import { SQUAD_CALLED, EVENT_RESPONSE_LABEL, EVENT_RESPONSE_BADGE } from '../constants.js';
import { canEdit } from '../permissions.js';
import { confirmDialog, wireDialog } from '../modal.js';
import { toastError, toastOk } from '../toast.js';

export function openSquadModal(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  if (!ev) return;
  const team = teamById(ev.team_id);
  const editable = canEdit('squads');
  const players = eventRoster(ev);
  const dateStr = eventDateTime(ev).toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' });
  const range = eventTimeRange(ev);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="sq-title"
         style="width:min(600px,96vw);max-height:92vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="sq-title">Convocatória</h2>
          <p class="muted" style="margin:0;font-size:0.83rem">${esc([
            team ? teamName(team) : '', ev.opponent ? `vs ${ev.opponent}` : '',
          ].filter(Boolean).join(' '))} · ${esc(dateStr)}${range ? ' · ' + esc(range) : ''}</p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div id="sq-body" style="flex:1;overflow-y:auto"></div>
      <div class="modal__actions">
        <button class="btn btn--ghost" id="sq-close" type="button">Fechar</button>
      </div>
    </div>`;
  const close = wireDialog(overlay);
  overlay.querySelector('#sq-close').addEventListener('click', close);
  const body = overlay.querySelector('#sq-body');

  const squadOf = () => state.squads.find((s) => s.event_id === eventId) || null;
  const isCalled = (pid) => {
    const sq = squadOf();
    return !!sq && state.squadPlayers.some((x) => x.squad_id === sq.id && x.player_id === pid);
  };

  // Redesenha o corpo depois de cada gravação: o diálogo não é a vista, e a
  // notificação do store só re-desenha o que está por baixo dele.
  const withError = async (fn) => {
    try { await fn(); } catch (err) { toastError(dbErrorMessage(err)); }
    paint();
  };

  // A convocatória do jogo ANTERIOR da mesma equipa — a que mais vezes se
  // repete quase igual. Montar vinte nomes de raiz todas as semanas, para
  // trocar dois, era o gesto mais repetido do treinador. Só os atletas que
  // continuam no plantel; quem avisou que não vem a ESTE jogo fica de fora
  // (e diz-se), pela mesma regra do "Todos presentes".
  function previousSquad() {
    if (!ev.team_id) return null;
    const when = eventDateTime(ev);
    const prev = state.events
      .filter((e) => e.type === 'jogo' && e.team_id === ev.team_id && e.id !== ev.id && eventDateTime(e) < when)
      .sort((a, b) => eventDateTime(b) - eventDateTime(a))
      .find((e) => {
        const sq = state.squads.find((s) => s.event_id === e.id);
        return sq && state.squadPlayers.some((x) => x.squad_id === sq.id);
      });
    if (!prev) return null;
    const sq = state.squads.find((s) => s.event_id === prev.id);
    const ids = new Set(state.squadPlayers.filter((x) => x.squad_id === sq.id).map((x) => x.player_id));
    const inRoster = players.filter((p) => ids.has(p.id));
    return inRoster.length ? { event: prev, players: inRoster } : null;
  }

  function paint() {
    const avisos = eventResponseSummary(eventId);
    const avisouIds = new Set(avisos.ausentes.map((a) => a.player.id));
    const called = players.filter((p) => isCalled(p.id)).length;
    const prev = editable && !called ? previousSquad() : null;
    const prevLabel = prev
      ? `${eventDateTime(prev.event).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }).replace('.', '')}${
          prev.event.opponent ? ' vs ' + prev.event.opponent : ''}`
      : '';
    body.innerHTML = `
      ${avisos.ausentes.length ? `
        <div class="card pres-avisos" style="margin-bottom:0.8rem">
          <strong class="pres-avisos__title">${avisos.ausentes.length} avisaram que não podem ir</strong>
          <ul class="pres-avisos__list">
            ${avisos.ausentes.map((a) => `<li><span class="pres-avisos__name">${esc(a.player.name)}</span>
              <span class="muted">— ${esc(a.note || 'sem motivo indicado')}</span></li>`).join('')}
          </ul>
          <p class="muted pres-avisos__hint">Um aviso não é uma decisão: a convocatória continua a ser tua.</p>
        </div>` : ''}

      <div class="row row--between row--wrap" style="gap:0.5rem;margin-bottom:0.4rem">
        <strong>${called} de ${players.length} convocad${called === 1 ? 'o' : 'os'}</strong>
        ${editable && players.length ? `
          <div class="row" style="gap:0.4rem">
            ${prev ? `<button class="btn btn--primary btn--sm" data-sq-repeat type="button"
                 title="Convoca quem foi ao jogo de ${esc(prevLabel)}">Repetir a do último jogo (${prev.players.length})</button>` : ''}
            ${called < players.length ? '<button class="btn btn--ghost btn--sm" data-sq-all type="button">Convocar todos</button>' : ''}
            ${called ? '<button class="btn btn--ghost btn--sm" data-sq-clear type="button">Limpar</button>' : ''}
          </div>` : ''}
      </div>

      ${!team
        ? '<p class="muted">Este jogo não tem equipa associada. Edita-o no Calendário para atribuir uma equipa.</p>'
        : !players.length
          ? '<p class="muted">Sem atletas nesta equipa.</p>'
          : `<ul class="pres-list">${players.map((p) => row(p, isCalled(p.id))).join('')}</ul>`}

      <p class="muted pres-avisos__hint" style="margin-top:0.9rem">
        Quem jogou mede-se no registo do resultado: a convocatória diz quem foi
        chamado, não quantos pontos disputou.
      </p>`;

    body.querySelectorAll('[data-sq-toggle]').forEach((btn) => btn.addEventListener('click', () => withError(async () => {
      const pid = btn.dataset.sqToggle;
      if (isCalled(pid)) { await removeSquadPlayer(squadOf().id, pid); return; }
      const sq = await ensureSquad(eventId);
      await upsertSquadPlayer(sq.id, pid, SQUAD_CALLED);
    })));
    body.querySelector('[data-sq-all]')?.addEventListener('click', () => withError(async () => {
      const sq = await ensureSquad(eventId);
      await addSquadPlayers(sq.id, players.filter((p) => !isCalled(p.id)).map((p) => p.id), SQUAD_CALLED);
    }));
    body.querySelector('[data-sq-repeat]')?.addEventListener('click', (e) => {
      e.currentTarget.disabled = true;
      withError(async () => {
        const ids = prev.players.filter((p) => !avisouIds.has(p.id)).map((p) => p.id);
        const fora = prev.players.filter((p) => avisouIds.has(p.id));
        const sq = await ensureSquad(eventId);
        await addSquadPlayers(sq.id, ids, SQUAD_CALLED);
        toastOk(`${ids.length} convocad${ids.length === 1 ? 'o' : 'os'} como no jogo de ${prevLabel}.${
          fora.length ? ` Ficou de fora quem avisou que não pode: ${fora.map((p) => p.name.split(' ')[0]).join(', ')}.` : ''}`);
      });
    });
    body.querySelector('[data-sq-clear]')?.addEventListener('click', async () => {
      const ok = await confirmDialog(`Limpar a convocatória deste jogo (${called} atleta${called === 1 ? '' : 's'})?`,
        { confirmLabel: 'Limpar', danger: true });
      if (!ok) return;
      withError(async () => {
        const sq = squadOf();
        for (const p of players) if (isCalled(p.id)) await removeSquadPlayer(sq.id, p.id);
      });
    });
  }

  function row(p, called) {
    const r = playerEventResponse(p.id, eventId);
    return `
      <li class="pres-row pres-row--${called ? 'convocado' : 'none'}">
        <div class="aval-row__player">
          <span class="aval-row__num">${esc(p.number || '—')}</span>
          <div>
            <span class="aval-row__name">${esc(p.name)}</span>
            <span class="muted aval-row__meta">${[p.position, p.birth_year].filter(Boolean).map(esc).join(' · ') || '—'}</span>
            ${r ? `<span class="pres-detail"><span class="badge badge--${EVENT_RESPONSE_BADGE[r.response]}">${
              esc(EVENT_RESPONSE_LABEL[r.response])}</span>${r.note ? ' ' + esc(r.note) : ''}</span>` : ''}
          </div>
        </div>
        ${editable
          ? `<div class="pres-actions">
               <button type="button" class="pres-btn ${called ? 'is-active' : ''}" data-sq-toggle="${p.id}"
                 aria-pressed="${called}" title="${called ? 'Retirar da convocatória' : 'Convocar'}">${called ? 'Convocado' : 'Convocar'}</button>
             </div>`
          : `<span class="badge badge--${called ? 'ok' : 'muted'}">${called ? 'Convocado' : 'Não convocado'}</span>`}
      </li>`;
  }

  paint();
}
