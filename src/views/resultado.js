// Registo do resultado de um jogo, feito pelo TREINADOR a seguir ao jogo.
//
// Um só ecrã com as duas coisas que ele tem na cabeça naquele momento: os
// parciais de cada set e quantos pontos cada atleta jogou. Separar em dois
// sítios era garantir que o segundo nunca era preenchido.
//
// No voleibol não há relógio: a participação mede-se em PONTOS. Nas
// modalidades com cronómetro (futebol, futsal, andebol, basquetebol) o campo
// passa a minutos — a app é multi-modalidade e `settings.sport` decide.

import { state, saveGameResult, saveGameParticipation, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import {
  teamById, teamName, eventDateTime, gameResult, gameSetsOf, sport,
} from '../compute.js';
import { toastError } from '../toast.js';

const MAX_SETS = 5;

export function openResultModal(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return;

  const team = teamById(event.team_id);
  const emPontos = sport() === 'voleibol';
  const unidade = emPontos ? 'pontos' : 'minutos';

  // Convocados, se houver convocatória; senão o plantel todo. Quem esteve no
  // jogo é o ponto de partida certo — evita uma lista de 20 para preencher 8.
  const squad = state.squads.find((s) => s.event_id === eventId);
  const convocadosIds = squad
    ? new Set(state.squadPlayers.filter((sp) => sp.squad_id === squad.id).map((sp) => sp.player_id))
    : null;
  const players = state.players
    .filter((p) => p.team_id === event.team_id)
    .filter((p) => !convocadosIds || convocadosIds.has(p.id))
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  const existing = gameResult(eventId);
  const parciais = gameSetsOf(eventId);
  const participacao = new Map(
    state.gameMinutes
      .filter((g) => g.event_id === eventId)
      .map((g) => [g.player_id, emPontos ? g.points : g.minutes])
  );

  const dateStr = eventDateTime(event).toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long',
  });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-labelledby="res-title"
         style="display:flex;flex-direction:column;max-height:92vh">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="res-title">Resultado do jogo</h2>
          <p class="muted" style="margin:0;font-size:0.85rem">
            ${team ? esc(teamName(team)) + ' · ' : ''}${esc(dateStr)}${event.opponent ? ' · vs ' + esc(event.opponent) : ''}
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <div style="overflow-y:auto;flex:1;margin:0 -0.2rem;padding:0 0.2rem">
        <section class="res-block">
          <h3 class="res-block__title">Parciais</h3>
          <p class="muted res-block__hint">
            Preenche os sets que se jogaram. O resultado final é contado a
            partir daqui — e é a soma dos parciais que diz quantos pontos o
            jogo teve, sem a qual "jogou 40 pontos" não significa nada.
          </p>
          <div class="res-sets">
            <div class="res-sets__head">
              <span></span><span>Nós</span><span>Eles</span>
            </div>
            ${Array.from({ length: MAX_SETS }, (_, i) => {
              const p = parciais.find((s) => s.set_number === i + 1);
              return `
                <div class="res-set" data-set="${i + 1}">
                  <span class="res-set__label">${i + 1}.º</span>
                  <input type="number" min="0" max="99" class="res-set__in" data-side="for"
                         value="${p ? p.points_for : ''}" aria-label="Pontos nossos no set ${i + 1}" />
                  <input type="number" min="0" max="99" class="res-set__in" data-side="against"
                         value="${p ? p.points_against : ''}" aria-label="Pontos do adversário no set ${i + 1}" />
                </div>`;
            }).join('')}
          </div>
          <div class="res-final" id="res-final"></div>
        </section>

        <section class="res-block">
          <h3 class="res-block__title">Participação (${esc(unidade)})</h3>
          <p class="muted res-block__hint">
            ${emPontos
              ? 'Quantos pontos esteve cada atleta em campo. Deixa em branco quem não jogou — em branco não é o mesmo que zero.'
              : 'Quantos minutos jogou cada atleta. Deixa em branco quem não jogou.'}
          </p>
          ${players.length
            ? `<ul class="res-players">
                ${players.map((p) => `
                  <li class="res-player" data-player="${p.id}">
                    <span class="res-player__num">${esc(p.number || '—')}</span>
                    <span class="res-player__name">${esc(p.name)}</span>
                    <input type="number" min="0" class="res-player__in"
                           value="${participacao.get(p.id) ?? ''}"
                           placeholder="—" aria-label="${esc(unidade)} de ${esc(p.name)}" />
                  </li>`).join('')}
               </ul>`
            : '<p class="muted">Sem atletas nesta equipa.</p>'}
        </section>

        <section class="res-block">
          <h3 class="res-block__title">Notas</h3>
          <textarea id="res-notes" rows="2" placeholder="O que ficou para trabalhar…">${esc(existing?.notes || '')}</textarea>
        </section>
      </div>

      <p class="modal__error hidden" id="res-err" role="alert"></p>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" id="res-cancel">Cancelar</button>
        <button class="btn btn--primary" type="button" id="res-save">Guardar</button>
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
  overlay.querySelector('#res-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  // Lê os parciais escritos e conta os sets ganhos.
  function readSets() {
    return Array.from(overlay.querySelectorAll('.res-set')).map((row) => {
      const [f, a] = row.querySelectorAll('.res-set__in');
      return {
        points_for: f.value === '' ? null : Number(f.value),
        points_against: a.value === '' ? null : Number(a.value),
      };
    }).filter((s) => s.points_for != null || s.points_against != null);
  }

  // Mostra o resultado a formar-se enquanto se escreve: é a confirmação de
  // que os parciais foram bem introduzidos, antes de gravar.
  function paintFinal() {
    const sets = readSets();
    const el = overlay.querySelector('#res-final');
    if (!sets.length) {
      el.innerHTML = '<span class="muted">Sem parciais — o resultado fica por registar.</span>';
      return;
    }
    const f = sets.filter((s) => (s.points_for || 0) > (s.points_against || 0)).length;
    const a = sets.filter((s) => (s.points_against || 0) > (s.points_for || 0)).length;
    const venceu = f > a;
    el.innerHTML = `
      <span class="res-final__label">Resultado</span>
      <strong class="res-final__score res-final__score--${venceu ? 'win' : f === a ? 'draw' : 'loss'}">${f}–${a}</strong>
      <span class="badge badge--${venceu ? 'ok' : f === a ? 'muted' : 'danger'}">
        ${venceu ? 'Vitória' : f === a ? 'Empate' : 'Derrota'}
      </span>
      <span class="muted res-final__points">
        ${sets.reduce((s, x) => s + (x.points_for || 0) + (x.points_against || 0), 0)} pontos disputados
      </span>`;
  }

  overlay.querySelectorAll('.res-set__in').forEach((i) => i.addEventListener('input', paintFinal));
  paintFinal();

  overlay.querySelector('#res-save').addEventListener('click', async () => {
    const errEl = overlay.querySelector('#res-err');
    const btn = overlay.querySelector('#res-save');
    errEl.classList.add('hidden');

    const sets = readSets();
    // Um set com só um dos lados preenchido é quase de certeza engano: o
    // resultado que sairia daí estaria errado e ninguém daria por isso.
    if (sets.some((s) => s.points_for == null || s.points_against == null)) {
      errEl.textContent = 'Há um set com só um dos lados preenchido. Preenche os dois ou apaga ambos.';
      errEl.classList.remove('hidden');
      return;
    }

    const setsFor = sets.filter((s) => s.points_for > s.points_against).length;
    const setsAgainst = sets.filter((s) => s.points_against > s.points_for).length;

    const rows = Array.from(overlay.querySelectorAll('.res-player')).map((li) => ({
      playerId: li.dataset.player,
      field: emPontos ? 'points' : 'minutes',
      value: li.querySelector('.res-player__in').value,
    }));

    // Ninguém joga mais pontos do que os que o jogo teve. Apanhar o engano aqui
    // é melhor do que o deixar entrar e adulterar as percentagens depois.
    const totalPontos = sets.reduce((s, x) => s + x.points_for + x.points_against, 0);
    if (emPontos && totalPontos) {
      const excede = rows.find((r) => r.value !== '' && Number(r.value) > totalPontos);
      if (excede) {
        const nome = overlay.querySelector(`[data-player="${excede.playerId}"] .res-player__name`)?.textContent || 'Um atleta';
        errEl.textContent = `${nome.trim()} tem mais pontos do que os ${totalPontos} que o jogo teve. Confirma o número.`;
        errEl.classList.remove('hidden');
        return;
      }
    }

    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveGameResult(eventId, {
        setsFor,
        setsAgainst,
        notes: overlay.querySelector('#res-notes').value.trim() || null,
        sets,
      });
      await saveGameParticipation(eventId, rows);
      close();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Guardar';
      toastError(dbErrorMessage(err));
    }
  });
}
