// Vista: Decisão Tática.
//
// Treino de decisão para TODAS as posições. O treinador monta o cenário
// arrastando as peças; a atleta responde no portal com um só gesto.
//
// O modelo é o mesmo em todas as posições porque todas as decisões de
// voleibol têm a mesma forma — ver `tactical-court.js`. Aqui trata-se da
// autoria: escolher a posição que se treina, arrastar as peças, marcar as
// opções e escrever a razão de cada uma.
//
// Duas regras que atravessam tudo:
//   • O cenário move-se e CONGELA. Cada peça tem posição inicial e final; é o
//     movimento que se lê em jogo, não a posição final.
//   • Não há resposta certa. Cada opção é ótima/aceitável/má com uma razão, e
//     a atleta vê-as todas depois de responder. Por isso o resumo conta por
//     OPÇÃO e nunca por atleta — ver `answerSummary`.

import { state, createRow, deleteRow, saveScenario, dbErrorMessage } from '../store.js';
import { esc, emptyHTML } from '../ui.js';
import { confirmDialog } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import { canEdit, isClubWide } from '../permissions.js';
import { TACTICAL_ROLES, TACTICAL_ROLE_LABEL } from '../constants.js';
import {
  blankScenario,
  courtSVG,
  makeDraggable,
  renderDrill,
  roleOf,
  optionName,
  pieceName,
  pieceHeight,
  VERDICTS,
  VERDICT_KEYS,
} from '../tactical-court.js';

// Estado local de UI (persiste entre re-desenhos, como nas outras vistas).
let currentId = null;
let mode = 'treinador';     // 'treinador' (autoria) | 'atleta' (pré-visualização)
let editTarget = 'inicial'; // 'inicial' | 'final' — que posição das peças se arrasta
let teamFilter = '';
let roleFilter = '';
let stopDrill = null;

// Cenários visíveis. O RLS já filtra no servidor; isto é só a barra.
function visibleScenarios() {
  let list = state.tacticalScenarios || [];
  if (teamFilter) list = list.filter((s) => s.team_id === teamFilter);
  if (roleFilter) list = list.filter((s) => s.role === roleFilter);
  return list;
}

// Equipas que o utilizador pode gerir (mesma regra do plano de jogo).
function myTeams() {
  if (isClubWide()) return state.teams;
  const coachRecord = state.coaches.find((c) => c.user_id === state.profile?.id);
  if (!coachRecord) return [];
  const mine = new Set(
    state.teamCoaches.filter((tc) => tc.coach_id === coachRecord.id).map((tc) => tc.team_id)
  );
  return state.teams.filter((t) => mine.has(t.id));
}

function current() {
  const list = visibleScenarios();
  return list.find((s) => s.id === currentId) || list[0] || null;
}

// Atletas elegíveis para ligar a uma peça: as da equipa do cenário (ou todas,
// se for um cenário de clube).
function rosterFor(scenario) {
  return scenario.team_id
    ? state.players.filter((p) => p.team_id === scenario.team_id)
    : state.players;
}

// Resumo das respostas. Conta por OPÇÃO e não por atleta: o que interessa ao
// treinador é "metade do plantel jogou na ponta com a central livre" — um
// problema de treino. Uma percentagem de acerto por atleta seria uma nota, e
// uma nota troca exploração por decorar.
function answerSummary(scenario) {
  const rows = (state.tacticalAnswers || []).filter((a) => a.scenario_id === scenario.id);
  if (!rows.length) return null;
  return {
    total: rows.length,
    byChoice: scenario.options.map((o) => ({ opt: o, n: rows.filter((r) => r.chosen === o.id).length })),
  };
}

// ─── Vista ──────────────────────────────────────────────────────────────────
export function renderTatica(container) {
  const canAuthor = canEdit('tactical');
  if (!canAuthor) mode = 'atleta';

  stopDrill?.();
  stopDrill = null;

  const scenario = current();
  const teams = myTeams();
  const list = visibleScenarios();

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Decisão Tática</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          Cenários de leitura de jogo para cada posição — a atleta lê e decide
        </p>
      </div>
      ${canAuthor && scenario
        ? `<div class="tb-modes" role="group" aria-label="Modo">
             <button type="button" class="tb-toggle__btn${mode === 'treinador' ? ' is-on' : ''}" data-mode="treinador">Editar</button>
             <button type="button" class="tb-toggle__btn${mode === 'atleta' ? ' is-on' : ''}" data-mode="atleta">Pré-visualizar</button>
           </div>`
        : ''}
    </header>

    <div class="tb-bar">
      <label class="tb-field tb-field--inline">
        <span>Equipa</span>
        <select id="tb-team-filter">
          <option value="">Todas</option>
          ${teams.map((t) => `<option value="${t.id}"${teamFilter === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
        </select>
      </label>
      <label class="tb-field tb-field--inline">
        <span>Posição</span>
        <select id="tb-role-filter">
          <option value="">Todas</option>
          ${TACTICAL_ROLES.map((r) => `<option value="${r.key}"${roleFilter === r.key ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}
        </select>
      </label>
      ${list.length
        ? `<label class="tb-field tb-field--inline">
             <span>Cenário</span>
             <select id="tb-pick">
               ${list
                 .map((s) => `<option value="${s.id}"${s.id === scenario?.id ? ' selected' : ''}>${esc(TACTICAL_ROLE_LABEL[s.role] || s.role)} · ${esc(s.title)}${s.published ? '' : ' (rascunho)'}</option>`)
                 .join('')}
             </select>
           </label>`
        : ''}
      ${canAuthor
        ? `<button class="btn btn--primary btn--sm" data-act="new">Novo cenário</button>
           ${scenario ? `<button class="btn btn--ghost btn--sm" data-act="dup">Duplicar</button>
           <button class="btn btn--danger btn--sm" data-act="del">Apagar</button>` : ''}`
        : ''}
    </div>

    <div data-body></div>`;

  const body = container.querySelector('[data-body]');

  if (!scenario) {
    body.innerHTML = emptyHTML(
      canAuthor
        ? 'Ainda não há cenários. Cria o primeiro — escolhes a posição e o molde vem já montado.'
        : 'Ainda não há cenários publicados para ti.'
    );
  } else if (mode === 'atleta') {
    // Pré-visualização: corre o exercício tal e qual, mas SEM gravar resposta —
    // o treinador a experimentar o seu próprio cenário não é um dado.
    const host = document.createElement('div');
    body.appendChild(host);
    stopDrill = renderDrill(host, scenario, { onAnswer: null });
  } else {
    renderAuthor(body, scenario);
  }

  wireBar(container, scenario, canAuthor);
}

function refresh(container) {
  renderTatica(container);
}

// ─── Barra ──────────────────────────────────────────────────────────────────
function wireBar(container, scenario, canAuthor) {
  container.querySelector('#tb-team-filter')?.addEventListener('change', (e) => {
    teamFilter = e.target.value;
    currentId = null;
    refresh(container);
  });

  container.querySelector('#tb-role-filter')?.addEventListener('change', (e) => {
    roleFilter = e.target.value;
    currentId = null;
    refresh(container);
  });

  container.querySelector('#tb-pick')?.addEventListener('change', (e) => {
    currentId = e.target.value;
    refresh(container);
  });

  container.querySelector('[data-act="new"]')?.addEventListener('click', () => newScenario(container));

  container.querySelector('[data-act="dup"]')?.addEventListener('click', async () => {
    try {
      const row = await createRow('tactical_scenarios', 'tacticalScenarios', {
        team_id: scenario.team_id,
        role: scenario.role,
        title: `${scenario.title} (cópia)`,
        note: scenario.note,
        actor: scenario.actor,
        options: scenario.options,
        pieces: scenario.pieces,
        published: false, // uma cópia nasce rascunho: ainda vai ser mexida
        created_by: state.profile?.id || null,
      });
      currentId = row?.id || null;
      refresh(container);
    } catch (e) {
      toastError(dbErrorMessage(e));
    }
  });

  container.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      `Apagar o cenário “${scenario.title}”? As respostas dos atletas são apagadas com ele.`,
      { confirmLabel: 'Apagar', danger: true }
    );
    if (!ok) return;
    try {
      await deleteRow('tactical_scenarios', 'tacticalScenarios', scenario.id);
      currentId = null;
      refresh(container);
    } catch (e) {
      toastError(dbErrorMessage(e));
    }
  });

  container.querySelectorAll('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      refresh(container);
    })
  );
}

// A posição escolhe-se ANTES de criar: é ela que decide o molde, o gesto e a
// fatia de campo. Mudá-la depois deitava fora o cenário montado, por isso
// pergunta-se primeiro em vez de ser um campo editável.
function newScenario(container) {
  // Um cenário sem equipa é do CLUBE (chega a todos os escalões) e só o
  // coordenador o pode criar. Para o treinador nasce na equipa filtrada ou na
  // primeira que ele treina — nunca em "todos" por omissão.
  const mine = myTeams();
  const teamId = teamFilter || (isClubWide() ? null : mine[0]?.id || null);
  if (!isClubWide() && !teamId) {
    toastError('Ainda não tens equipas atribuídas. Pede ao coordenador para te ligar a um plantel.');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-label="Nova posição a treinar">
      <h2 class="section-title">Que posição vais treinar?</h2>
      <p class="muted" style="margin:0.2rem 0 0.9rem;font-size:0.88rem">
        O molde vem já montado e a pergunta muda com a posição.
      </p>
      <div class="tb-roles">
        ${TACTICAL_ROLES.map(
          (r) => `
          <button type="button" class="tb-role-card" data-role="${r.key}">
            <strong>${esc(r.label)}</strong>
            <span class="muted">${esc(r.question)}</span>
            <span class="tb-role-card__gesture">${r.token === 'bola' ? 'arrasta a bola' : 'arrasta a sua peça'}</span>
          </button>`
        ).join('')}
      </div>
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-cancel>Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('[data-cancel]').focus();

  overlay.querySelectorAll('[data-role]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      close();
      try {
        const row = await createRow('tactical_scenarios', 'tacticalScenarios', {
          ...blankScenario(btn.dataset.role),
          team_id: teamId,
          created_by: state.profile?.id || null,
        });
        currentId = row?.id || null;
        roleFilter = '';
        mode = 'treinador';
        refresh(container);
      } catch (e) {
        toastError(dbErrorMessage(e));
      }
    })
  );
}

// ─── Autoria ────────────────────────────────────────────────────────────────
function renderAuthor(body, scenario) {
  const role = roleOf(scenario);
  const teams = myTeams();
  const roster = rosterFor(scenario);
  const summary = answerSummary(scenario);

  body.innerHTML = `
    <div class="tb-layout">
      <div class="tb-court-wrap">
        ${courtSVG({ scenario, at: editTarget, ghosts: true })}
      </div>
      <div class="tb-side">
        <div class="tb-panel">
          <div class="tb-role-head">
            <span class="tb-tag tb-tag--role">${esc(role.label)}</span>
            <span class="muted">${esc(role.question)}</span>
          </div>

          <label class="tb-field">
            <span>Título do cenário</span>
            <input id="tb-title" value="${esc(scenario.title)}" />
          </label>

          <label class="tb-field">
            <span>Equipa</span>
            <select id="tb-team">
              ${isClubWide() ? `<option value=""${scenario.team_id ? '' : ' selected'}>Todo o clube</option>` : ''}
              ${teams.map((t) => `<option value="${t.id}"${scenario.team_id === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}
            </select>
          </label>
          ${isClubWide()
            ? ''
            : '<p class="tb-hint tb-hint--tight">Só podes criar cenários para as tuas equipas. Publicar para o clube inteiro é do coordenador.</p>'}

          <div class="tb-toggle" role="group" aria-label="Que posição das peças estou a arrastar">
            <button type="button" class="tb-toggle__btn${editTarget === 'inicial' ? ' is-on' : ''}" data-target="inicial">Posição inicial</button>
            <button type="button" class="tb-toggle__btn${editTarget === 'final' ? ' is-on' : ''}" data-target="final">Posição final</button>
          </div>
          <p class="tb-hint">
            ${editTarget === 'inicial'
              ? 'Arrasta as peças para onde estão no início da jogada. Depois passa a “Posição final”.'
              : 'Arrasta as peças para onde chegam ao fim de 1,5 s. O traço mostra o movimento que a atleta vai ler.'}
          </p>
        </div>

        <div class="tb-panel">
          <h3 class="tb-panel__title">As opções</h3>
          <p class="tb-hint tb-hint--tight">
            ${role.optionKind === 'jogadora'
              ? 'Para quem ela pode jogar. Arrasta-as no campo para as pores onde estão.'
              : role.optionKind === 'zona'
                ? 'As zonas onde ela pode pôr a bola. Arrasta os alvos no campo.'
                : 'Os sítios onde ela se pode colocar. Arrasta-os no campo.'}
          </p>
          ${scenario.options.map((o) => optionCardHTML(o, role, roster)).join('')}
        </div>

        <div class="tb-panel">
          <label class="tb-field">
            <span>Nota do treinador (opcional)</span>
            <textarea id="tb-note" rows="2"
              placeholder="Contexto: marcador, adversário, o que se está a trabalhar…">${esc(scenario.note || '')}</textarea>
          </label>

          <label class="tb-check">
            <input type="checkbox" id="tb-pub"${scenario.published ? ' checked' : ''} />
            <span>Publicado — visível no portal das atletas</span>
          </label>
          <p class="tb-hint">
            Enquanto for rascunho fica só para ti. Um cenário meio feito que chegasse
            à atleta ensinava o erro.
          </p>
        </div>

        ${summary ? summaryHTML(summary) : ''}
      </div>
    </div>`;

  wireAuthor(body, scenario);
}

function optionCardHTML(o, role, roster) {
  const v = VERDICTS[o.verdict] || VERDICTS.aceitavel;
  const height = pieceHeight(o);
  return `
    <div class="tb-att-card" data-opt="${esc(o.id)}">
      <div class="tb-att-card__head">
        <span class="tb-tag" style="background:${v.bg};color:${v.color}">${esc(o.label)}</span>
        ${role.optionKind === 'jogadora'
          ? `<select class="tb-name" data-field="player_id" aria-label="Atleta na posição ${esc(o.label)}">
               <option value="">— sem ficha (genérica) —</option>
               ${roster.map((p) => `<option value="${p.id}"${o.player_id === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
             </select>`
          : `<input class="tb-name" data-field="label" value="${esc(o.label || '')}"
                    placeholder="Nome da opção (ex.: Diagonal)" aria-label="Nome da opção" />`}
      </div>
      ${role.optionKind === 'jogadora' && o.player_id
        ? `<p class="tb-hint tb-hint--tight">${esc(pieceName(o))}${height ? ` · ${height} cm` : ''}</p>`
        : role.optionKind === 'jogadora'
          ? `<input class="tb-name" data-field="name" value="${esc(o.name || '')}"
                    placeholder="Etiqueta (ex.: Ponta esquerda)" aria-label="Etiqueta da posição ${esc(o.label)}" />`
          : ''}
      <div class="tb-verdicts" role="group" aria-label="Qualidade da opção ${esc(o.label)}">
        ${VERDICT_KEYS.map(
          (k) => `
          <button type="button" class="tb-verdict${o.verdict === k ? ' is-on' : ''}" data-verdict="${k}"
                  style="${o.verdict === k ? `background:${VERDICTS[k].bg};color:${VERDICTS[k].color};border-color:${VERDICTS[k].color}` : ''}">
            ${VERDICTS[k].label}
          </button>`
        ).join('')}
      </div>
      <textarea class="tb-reason" data-field="reason" rows="2"
                placeholder="Porquê? (a atleta vê isto depois de responder)"
                aria-label="Razão para ${esc(o.label)}">${esc(o.reason || '')}</textarea>
    </div>`;
}

// O resumo mostra QUANTAS escolheram cada opção, e mais nada. Sem nomes, sem
// percentagem de acerto, sem ranking: o que se quer ver é se o plantel leu o
// jogo da mesma maneira, não quem falhou.
function summaryHTML({ total, byChoice }) {
  return `
    <div class="tb-panel">
      <h3 class="tb-panel__title">O que o plantel respondeu</h3>
      <p class="tb-hint tb-hint--tight">${total} resposta${total === 1 ? '' : 's'} · só a primeira de cada atleta conta</p>
      ${byChoice
        .map(({ opt, n }) => {
          const v = VERDICTS[opt.verdict] || VERDICTS.aceitavel;
          const pct = total ? Math.round((n / total) * 100) : 0;
          return `
          <div class="tb-sum">
            <div class="tb-sum__head">
              <span class="tb-tag" style="background:${v.bg};color:${v.color}">${v.label}</span>
              <strong>${esc(optionName(opt))}</strong>
              <span class="muted">${n}</span>
            </div>
            <div class="progress"><div class="progress__bar" style="width:${pct}%;background:${v.color}"></div></div>
          </div>`;
        })
        .join('')}
    </div>`;
}

function wireAuthor(body, scenario) {
  const save = async (patch) => {
    try {
      await saveScenario(scenario.id, patch);
    } catch (e) {
      toastError(dbErrorMessage(e));
    }
  };

  body.querySelectorAll('[data-target]').forEach((btn) =>
    btn.addEventListener('click', () => {
      editTarget = btn.dataset.target;
      renderAuthor(body, scenario);
    })
  );

  const title = body.querySelector('#tb-title');
  title?.addEventListener('change', () => save({ title: title.value.trim() || 'Cenário sem título' }));

  const team = body.querySelector('#tb-team');
  team?.addEventListener('change', () => {
    // Mudar de equipa invalida as fichas ligadas (são de outro plantel): as
    // peças voltam a genéricas em vez de apontarem para atletas que já não
    // pertencem ao cenário.
    const options = scenario.options.map((o) => ({ ...o, player_id: null }));
    const pieces = scenario.pieces.map((p) => ({ ...p, player_id: null }));
    save({ team_id: team.value || null, options, pieces });
  });

  const note = body.querySelector('#tb-note');
  note?.addEventListener('change', () => save({ note: note.value }));

  const pub = body.querySelector('#tb-pub');
  pub?.addEventListener('change', () => {
    save({ published: pub.checked });
    toastOk(pub.checked ? 'Cenário publicado às atletas.' : 'Cenário voltou a rascunho.');
  });

  body.querySelectorAll('.tb-att-card').forEach((card) => {
    const id = card.dataset.opt;
    const patchOption = (changes) =>
      save({ options: scenario.options.map((o) => (o.id === id ? { ...o, ...changes } : o)) });

    card.querySelectorAll('[data-field]').forEach((input) =>
      input.addEventListener('change', () => {
        const field = input.dataset.field;
        patchOption({ [field]: field === 'player_id' ? input.value || null : input.value });
      })
    );

    card.querySelectorAll('[data-verdict]').forEach((btn) =>
      btn.addEventListener('click', () => patchOption({ verdict: btn.dataset.verdict }))
    );
  });

  // Arrastar peças. O estado só sobe à base de dados quando o dedo/rato larga
  // — durante o arrasto atualiza-se o SVG e o objeto local, senão seria uma
  // escrita por cada pixel percorrido.
  const svg = body.querySelector('.tb-court');
  const draft = {
    actor: { ...scenario.actor },
    options: scenario.options.map((o) => ({ ...o })),
    pieces: scenario.pieces.map((p) => ({ ...p })),
  };

  const find = (kind, id) => {
    if (kind === 'actor') return draft.actor;
    if (kind === 'opt') return draft.options.find((o) => o.id === id);
    return draft.pieces.find((p) => p.id === id);
  };

  makeDraggable(
    svg,
    (kind, id) => {
      const target = find(kind, id);
      // As opções seguem a natureza do cenário: uma zona pode estar do lado de
      // lá, uma jogadora nossa não.
      if (kind === 'opt') return { kind: roleOf(scenario).optionKind === 'jogadora' ? 'jogadora' : 'zona', side: 'nos' };
      if (kind === 'actor') return { kind: 'jogadora', side: 'nos' };
      return target;
    },
    (id, kind, pos) => {
      const target = find(kind, id);
      if (!target) return;
      // As opções e o ator não animam — só as peças de contexto têm posição
      // final. Uma opção que se mexesse durante a jogada deixava de ser um
      // alvo estável para onde arrastar.
      if (kind === 'ctx' && editTarget === 'final') {
        target.x2 = pos.x;
        target.y2 = pos.y;
        return;
      }
      if (kind === 'ctx') {
        // Mover a inicial arrasta a final junto enquanto ainda não houver
        // movimento definido — senão a peça "partia-se" em duas à primeira
        // arrastada, antes de o treinador perceber o modelo.
        const still =
          Math.abs((target.x2 ?? target.x) - target.x) < 0.05 &&
          Math.abs((target.y2 ?? target.y) - target.y) < 0.05;
        if (still) {
          target.x2 = pos.x;
          target.y2 = pos.y;
        }
      }
      target.x = pos.x;
      target.y = pos.y;
    },
    async () => {
      Object.assign(scenario, structuredClone(draft));
      await save({ actor: draft.actor, options: draft.options, pieces: draft.pieces });
      renderAuthor(body, scenario);
    }
  );
}
