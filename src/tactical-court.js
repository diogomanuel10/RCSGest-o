// Campo de voleibol em SVG + o exercício de decisão.
//
// Partilhado pela autoria (`views/tatica.js`, onde o treinador arrasta as
// peças) e pelo exercício, que corre tanto na pré-visualização do treinador
// como no portal do atleta. O desenho tem de ser literalmente o mesmo nos dois
// sítios — se a atleta visse um campo diferente do que o treinador montou, o
// cenário deixava de ser o cenário.
//
// O modelo é o MESMO para todas as posições, porque todas as decisões de
// voleibol têm a mesma forma: um campo, qualquer coisa que se move e congela,
// um conjunto de opções classificadas, e um token que se arrasta. O que muda
// entre a distribuidora e a central é só o que é o token (a bola ou a própria
// atleta) e o que são as opções (uma colega, uma zona, um sítio onde estar).
// Ver `TACTICAL_ROLES` em `constants.js`.
//
// As posições vivem em METROS do campo real e não em píxeis: o mesmo cenário
// desenha bem num telemóvel de 320px e num projetor, e o viewBox trata da
// escala sozinho.

import { state } from './store.js';
import { esc } from './ui.js';
import { TACTICAL_ROLE } from './constants.js';

// Sistema de coordenadas: a rede em y=3, o nosso campo a crescer para y maior
// (fundo em y=12), o adversário para y menor (fundo em y=-6). x de 0 a 9.
export const COURT = {
  width: 9,
  netY: 3,
  ourBackY: 12,
  oppBackY: -6,
  ourAttackY: 6,    // linha de ataque nossa (3 m da rede)
  oppAttackY: 0,    // linha de ataque adversária
};

// A fatia de campo desenhada NÃO é fixa por posição: calcula-se a partir das
// peças do cenário (ver `viewBoxFor`). Desenhar sempre os 18 m encolhia o que
// interessa, mas uma janela fixa por posição partia-se assim que o treinador
// arrastasse uma peça para fora dela — e cada decisão vive numa zona diferente
// do campo, do serviço (que o atravessa todo) ao bloco (que vive na rede).

export const PLAYER_R = 0.46;
export const ZONE_R = 0.7;
export const BALL_R = 0.3;
const DROP_RADIUS = 1.4;   // tolerância para largar o token em cima de uma opção
const BALL_LIFT = 0.95;    // a bola desenha-se um pouco à frente de quem a tem
export const ANIM_MS = 1500;

export const VERDICTS = {
  otima:     { label: 'Ótima',     color: 'var(--ok)',     bg: 'var(--ok-bg)' },
  aceitavel: { label: 'Aceitável', color: 'var(--warn)',   bg: 'var(--warn-bg)' },
  ma:        { label: 'Má',        color: 'var(--danger)', bg: 'var(--danger-bg)' },
};
export const VERDICT_KEYS = Object.keys(VERDICTS);

export function roleOf(scenario) {
  return TACTICAL_ROLE[scenario?.role] || TACTICAL_ROLE.distribuidora;
}

// ─── Moldes de partida, por posição ─────────────────────────────────────────
//
// Cada molde é uma situação reconhecível, já montada: o treinador ajusta em
// vez de começar de um campo vazio. Uma ferramenta de autoria que obrigue a
// pousar dez peças à mão não é usada duas vezes.
const TEMPLATES = {
  distribuidora: () => ({
    title: 'Free ball — bloco a fechar ao meio',
    actor: { label: 'D', x: 6.5, y: 6.0, player_id: null },
    options: [
      { id: 'o1', kind: 'jogadora', label: 'Z4', name: 'Ponta esquerda', x: 1.3, y: 4.5, verdict: 'aceitavel', reason: '' },
      { id: 'o2', kind: 'jogadora', label: 'Z3', name: 'Central',        x: 4.5, y: 3.9, verdict: 'otima',     reason: '' },
      { id: 'o3', kind: 'jogadora', label: 'Z2', name: 'Oposto',         x: 7.9, y: 4.5, verdict: 'ma',        reason: '' },
    ],
    pieces: [
      { id: 'p1', side: 'adv', label: 'B1', x: 1.4, y: 2.3, x2: 2.2, y2: 2.3 },
      { id: 'p2', side: 'adv', label: 'B2', x: 4.5, y: 2.3, x2: 4.5, y2: 2.3 },
      { id: 'p3', side: 'adv', label: 'B3', x: 7.6, y: 2.3, x2: 6.8, y2: 2.3 },
    ],
  }),

  atacante: () => ({
    title: 'Ataque na ponta — bloco duplo a formar-se',
    actor: { label: 'A', x: 1.3, y: 4.2, player_id: null },
    options: [
      { id: 'o1', kind: 'zona', label: 'Diagonal',  x: 6.6, y: -3.4, verdict: 'aceitavel', reason: '' },
      { id: 'o2', kind: 'zona', label: 'Paralela',  x: 1.2, y: -2.2, verdict: 'otima',     reason: '' },
      { id: 'o3', kind: 'zona', label: 'Amortizada', x: 4.2, y: 1.2, verdict: 'ma',        reason: '' },
    ],
    pieces: [
      { id: 'p1', side: 'adv', label: 'B1', x: 1.8, y: 2.3, x2: 1.4, y2: 2.3 },
      { id: 'p2', side: 'adv', label: 'B2', x: 4.5, y: 2.3, x2: 2.5, y2: 2.3 },
      { id: 'p3', side: 'adv', label: 'D',  x: 7.0, y: 0.4, x2: 7.0, y2: 0.4 },
      { id: 'p4', side: 'adv', label: 'L',  x: 4.6, y: -2.6, x2: 5.6, y2: -3.2 },
    ],
  }),

  servico: () => ({
    title: 'Serviço — receção com líbero deslocado',
    actor: { label: 'S', x: 4.5, y: 11.2, player_id: null },
    options: [
      { id: 'o1', kind: 'zona', label: 'Zona 1',   x: 7.4, y: -3.8, verdict: 'aceitavel', reason: '' },
      { id: 'o2', kind: 'zona', label: 'Zona 6',   x: 4.5, y: -4.4, verdict: 'ma',        reason: '' },
      { id: 'o3', kind: 'zona', label: 'Curta Z2', x: 7.2, y: 1.0,  verdict: 'otima',     reason: '' },
    ],
    pieces: [
      { id: 'p1', side: 'adv', label: 'R1', x: 2.0, y: -3.2, x2: 2.0, y2: -3.2 },
      { id: 'p2', side: 'adv', label: 'L',  x: 4.5, y: -3.8, x2: 3.6, y2: -3.8 },
      { id: 'p3', side: 'adv', label: 'R2', x: 7.0, y: -3.0, x2: 7.0, y2: -3.0 },
    ],
  }),

  bloco: () => ({
    title: 'Bloco — central adversária a entrar em 1.º tempo',
    actor: { label: 'C', x: 4.5, y: 3.6, player_id: null },
    options: [
      { id: 'o1', kind: 'posicao', label: 'Fica ao meio', x: 4.5, y: 3.6, verdict: 'aceitavel', reason: '' },
      { id: 'o2', kind: 'posicao', label: 'Fecha na Z4',  x: 1.9, y: 3.6, verdict: 'otima',     reason: '' },
      { id: 'o3', kind: 'posicao', label: 'Fecha na Z2',  x: 7.1, y: 3.6, verdict: 'ma',        reason: '' },
    ],
    pieces: [
      { id: 'p1', side: 'adv', label: 'D',  x: 6.6, y: 0.2,  x2: 6.6, y2: 0.2 },
      { id: 'p2', side: 'adv', label: 'C',  x: 4.5, y: 0.9,  x2: 4.0, y2: 2.1 },
      { id: 'p3', side: 'adv', label: 'Z4', x: 1.4, y: -0.6, x2: 2.0, y2: 1.6 },
      { id: 'p4', kind: 'bola', label: '',  x: 5.6, y: 1.0,  x2: 5.0, y2: 0.6 },
    ],
  }),

  defesa: () => ({
    title: 'Defesa — ataque da ponta adversária com bloco duplo',
    actor: { label: 'L', x: 4.5, y: 8.4, player_id: null },
    options: [
      { id: 'o1', kind: 'posicao', label: 'Atrás do bloco', x: 6.4, y: 7.6, verdict: 'ma',        reason: '' },
      { id: 'o2', kind: 'posicao', label: 'Diagonal longa', x: 6.8, y: 10.4, verdict: 'otima',    reason: '' },
      { id: 'o3', kind: 'posicao', label: 'Meio do campo',  x: 4.5, y: 9.4, verdict: 'aceitavel', reason: '' },
    ],
    pieces: [
      { id: 'p1', side: 'nos', label: 'B1', x: 1.8, y: 3.5, x2: 1.6, y2: 3.5 },
      { id: 'p2', side: 'nos', label: 'B2', x: 4.0, y: 3.5, x2: 2.6, y2: 3.5 },
      { id: 'p3', side: 'adv', label: 'Z4', x: 1.5, y: 1.6, x2: 1.5, y2: 2.3 },
      { id: 'p4', kind: 'bola', label: '',  x: 3.2, y: 1.0, x2: 2.0, y2: 1.9 },
    ],
  }),

  rececao: () => ({
    title: 'Receção — serviço em suspensão para a zona 6',
    actor: { label: 'R', x: 3.2, y: 8.6, player_id: null },
    options: [
      { id: 'o1', kind: 'posicao', label: 'Avança',      x: 3.4, y: 7.2, verdict: 'ma',        reason: '' },
      { id: 'o2', kind: 'posicao', label: 'Recua',       x: 3.6, y: 10.6, verdict: 'otima',    reason: '' },
      { id: 'o3', kind: 'posicao', label: 'Fecha ao meio', x: 5.0, y: 9.2, verdict: 'aceitavel', reason: '' },
    ],
    pieces: [
      { id: 'p1', side: 'nos', label: 'L',  x: 6.4, y: 8.8, x2: 6.4, y2: 8.8 },
      { id: 'p2', side: 'adv', label: 'S',  x: 4.6, y: -5.4, x2: 4.6, y2: -4.6 },
      { id: 'p3', kind: 'bola', label: '',  x: 4.6, y: -4.0, x2: 4.6, y2: 0.6 },
    ],
  }),
};

// Cenário novo para uma posição. `role` decide o token, as opções e a fatia
// de campo — tudo o resto é igual em todas as posições.
export function blankScenario(role = 'distribuidora') {
  const r = TACTICAL_ROLE[role] ? role : 'distribuidora';
  const t = (TEMPLATES[r] || TEMPLATES.distribuidora)();
  return {
    role: r,
    title: t.title,
    note: '',
    published: false,
    team_id: null,
    actor: { player_id: null, ...t.actor },
    options: t.options.map((o) => ({ player_id: null, name: '', reason: '', ...o })),
    pieces: t.pieces.map((p) => ({ kind: 'jogadora', side: 'adv', player_id: null, ...p })),
  };
}

// Nome a mostrar numa peça. Se estiver ligada a uma ficha real do plantel usa
// o nome do atleta — é isso que torna o matchup concreto ("a Rita bloqueia
// contra a Inês") em vez de abstrato. Uma ficha entretanto arquivada volta ao
// nome genérico em vez de desaparecer.
export function pieceName(piece) {
  if (piece?.player_id) {
    const p = state.players.find((x) => x.id === piece.player_id);
    if (p?.name) return p.name;
  }
  return piece?.name || piece?.label || '';
}

// Altura da atleta ligada à peça (do perfil físico), quando existe. É o dado
// que muda a leitura de um matchup e que uma app genérica de tática não tem.
export function pieceHeight(piece) {
  if (!piece?.player_id) return null;
  const prof = state.physicalProfiles?.find((x) => x.player_id === piece.player_id);
  const h = Number(prof?.height_cm);
  return Number.isFinite(h) && h > 0 ? h : null;
}

// ─── Desenho ────────────────────────────────────────────────────────────────
//
// `at`      — 'inicial' | 'final': onde desenhar as peças que se movem.
// `ghosts`  — posição inicial a tracejado + traço até à final. Só na autoria:
//             é a única forma de VER o movimento definido, sem desenhar setas.
// `token`   — posição do token arrastável (bola ou a própria atleta); por
//             omissão, junto ao ator.
// Janela vertical que mostra tudo o que o cenário tem, com folga. A rede entra
// sempre: é a referência que dá sentido às posições, e um enquadramento sem ela
// deixava a atleta sem saber para que lado está a olhar.
const MIN_HEIGHT = 7.5;   // não ampliar ao ponto de as peças ficarem enormes
const PAD = 1.3;

export function viewWindow(scenario) {
  const ys = [];
  const push = (p) => {
    if (!p) return;
    ys.push(p.y);
    if (p.y2 !== undefined && p.y2 !== null) ys.push(p.y2);
  };
  push(scenario.actor);
  ys.push((scenario.actor?.y ?? COURT.netY) - BALL_LIFT);
  (scenario.options || []).forEach(push);
  (scenario.pieces || []).forEach(push);

  let y0 = Math.min(...ys, COURT.netY - 1) - PAD;
  let y1 = Math.max(...ys, COURT.netY + 1) + PAD;

  if (y1 - y0 < MIN_HEIGHT) {
    const c = (y0 + y1) / 2;
    y0 = c - MIN_HEIGHT / 2;
    y1 = c + MIN_HEIGHT / 2;
  }
  y0 = Math.max(y0, COURT.oppBackY - 0.9);
  y1 = Math.min(y1, COURT.ourBackY + 0.9);

  return { y0, y1 };
}

export function viewBoxFor(scenario) {
  const { y0, y1 } = viewWindow(scenario);
  return `-0.8 ${y0.toFixed(2)} ${COURT.width + 1.6} ${(y1 - y0).toFixed(2)}`;
}

export function courtSVG({ scenario, at = 'inicial', ghosts = false, token = null }) {
  const role = roleOf(scenario);
  const { width, netY, ourBackY, oppBackY, ourAttackY, oppAttackY } = COURT;
  const { y0: viewY0 } = viewWindow(scenario);
  const viewBox = viewBoxFor(scenario);

  const optionSVG = (o) => {
    if (o.kind === 'jogadora') {
      return `
        <g class="tb-piece tb-piece--opt tb-piece--att" data-piece="opt" data-id="${esc(o.id)}"
           transform="translate(${o.x} ${o.y})">
          <circle r="${PLAYER_R}" class="tb-att-dot" />
          <text class="tb-piece-label" y="0.16">${esc(o.label)}</text>
        </g>`;
    }
    // Zonas e posições desenham-se como alvos, não como jogadoras: são sítios,
    // e um círculo cheio leria-se como "está aqui alguém".
    return `
      <g class="tb-piece tb-piece--opt tb-piece--zone" data-piece="opt" data-id="${esc(o.id)}"
         transform="translate(${o.x} ${o.y})">
        <circle r="${ZONE_R}" class="tb-zone-dot" />
        <text class="tb-zone-label" y="${ZONE_R + 0.42}">${esc(o.label)}</text>
      </g>`;
  };

  const pieceSVG = (p) => {
    const moved = Math.abs((p.x2 ?? p.x) - p.x) > 0.05 || Math.abs((p.y2 ?? p.y) - p.y) > 0.05;
    const gx = p.x2 ?? p.x;
    const gy = p.y2 ?? p.y;
    const ghost =
      ghosts && moved
        ? `<circle class="tb-ghost" cx="${p.x}" cy="${p.y}" r="${p.kind === 'bola' ? BALL_R : PLAYER_R}" />
           <line class="tb-ghost-line" x1="${p.x}" y1="${p.y}" x2="${gx}" y2="${gy}" />`
        : '';
    const pos = at === 'final' ? { x: gx, y: gy } : { x: p.x, y: p.y };
    const body =
      p.kind === 'bola'
        ? `<circle r="${BALL_R}" class="tb-ball-dot" />`
        : `<circle r="${PLAYER_R}" class="tb-${p.side === 'nos' ? 'our' : 'blk'}-dot" />
           <text class="tb-piece-label" y="0.16">${esc(p.label || '')}</text>`;
    return `
      ${ghost}
      <g class="tb-piece tb-piece--ctx" data-piece="ctx" data-id="${esc(p.id)}"
         transform="translate(${pos.x} ${pos.y})">
        ${body}
      </g>`;
  };

  const tk = token || (role.token === 'bola'
    ? { x: scenario.actor.x, y: scenario.actor.y - BALL_LIFT }
    : { x: scenario.actor.x, y: scenario.actor.y });

  // Quando é a própria atleta que se arrasta, o token É o ator — desenhá-lo
  // duas vezes punha uma peça fantasma no sítio de onde ela saiu.
  const actorSVG = role.token === 'bola'
    ? `<g class="tb-piece tb-piece--setter" data-piece="actor" data-id="actor"
           transform="translate(${scenario.actor.x} ${scenario.actor.y})">
         <circle r="${PLAYER_R}" class="tb-setter-dot" />
         <text class="tb-piece-label" y="0.16">${esc(scenario.actor.label || 'D')}</text>
       </g>`
    : '';

  const tokenSVG = role.token === 'bola'
    ? `<g class="tb-token tb-token--ball" data-piece="token" transform="translate(${tk.x} ${tk.y})">
         <circle r="${BALL_R}" class="tb-ball-dot" />
       </g>`
    : `<g class="tb-token tb-token--actor tb-piece" data-piece="token" data-id="actor"
           transform="translate(${tk.x} ${tk.y})">
         <circle r="${PLAYER_R}" class="tb-setter-dot" />
         <text class="tb-piece-label" y="0.16">${esc(scenario.actor.label || 'A')}</text>
       </g>`;

  return `
    <svg class="tb-court" viewBox="${viewBox}" role="img"
         aria-label="Campo de voleibol com o cenário tático">
      <rect class="tb-opp"   x="0" y="${oppBackY}" width="${width}" height="${netY - oppBackY}" />
      <rect class="tb-floor" x="0" y="${netY}"     width="${width}" height="${ourBackY - netY}" />
      <line class="tb-line"  x1="0"        y1="${oppBackY}" x2="0"        y2="${ourBackY}" />
      <line class="tb-line"  x1="${width}" y1="${oppBackY}" x2="${width}" y2="${ourBackY}" />
      <line class="tb-line"  x1="0" y1="${ourAttackY}" x2="${width}" y2="${ourAttackY}" />
      <line class="tb-line"  x1="0" y1="${oppAttackY}" x2="${width}" y2="${oppAttackY}" />
      <line class="tb-line"  x1="0" y1="${ourBackY}"   x2="${width}" y2="${ourBackY}" />
      <line class="tb-line"  x1="0" y1="${oppBackY}"   x2="${width}" y2="${oppBackY}" />
      <line class="tb-net"   x1="0" y1="${netY}"       x2="${width}" y2="${netY}" />
      <text class="tb-side-label" x="0.18" y="${(viewY0 + 0.62).toFixed(2)}">${viewY0 < netY ? 'adversário' : 'nós'}</text>

      ${(scenario.pieces || []).map(pieceSVG).join('')}
      ${(scenario.options || []).map(optionSVG).join('')}
      ${actorSVG}
      ${tokenSVG}
    </svg>`;
}

// ─── Conversão ecrã → metros ────────────────────────────────────────────────
export function toCourt(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Limites por peça: quem é do lado de lá fica do lado de lá. Sem isto
// arrastava-se uma central adversária para dentro do nosso campo e o cenário
// deixava de fazer sentido. As zonas e a bola atravessam a rede à vontade —
// é precisamente para lá que a bola vai.
export function limitsFor(piece) {
  const free = { minY: COURT.oppBackY, maxY: COURT.ourBackY };
  if (!piece) return free;
  if (piece.kind === 'bola' || piece.kind === 'zona') return free;
  if (piece.side === 'adv') return { minY: COURT.oppBackY, maxY: COURT.netY - 0.35 };
  return { minY: COURT.netY + 0.35, maxY: COURT.ourBackY };
}

// Arrastar peças com pointer events (e não `dragstart` do HTML5), porque isto
// tem de funcionar ao toque no telemóvel — que é onde vai ser usado.
//
// `resolve(kind, id)` devolve o objeto do cenário para saber os limites.
export function makeDraggable(svg, resolve, onMove, onEnd) {
  if (!svg) return;
  let active = null;

  svg.querySelectorAll('[data-piece]').forEach((g) => {
    const kind = g.dataset.piece;
    if (kind === 'token') return;
    g.classList.add('is-draggable');

    g.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      active = { g, kind, id: g.dataset.id };
      g.setPointerCapture(e.pointerId);
      g.classList.add('is-dragging');
    });

    g.addEventListener('pointermove', (e) => {
      if (!active || active.g !== g) return;
      const p = toCourt(svg, e);
      if (!p) return;
      const lim = limitsFor(resolve(kind, active.id));
      const pos = {
        x: clamp(p.x, PLAYER_R, COURT.width - PLAYER_R),
        y: clamp(p.y, lim.minY, lim.maxY),
      };
      g.setAttribute('transform', `translate(${pos.x} ${pos.y})`);
      onMove(active.id, kind, pos);
    });

    const end = (e) => {
      if (!active || active.g !== g) return;
      g.classList.remove('is-dragging');
      try { g.releasePointerCapture(e.pointerId); } catch { /* já libertado */ }
      active = null;
      onEnd();
    };
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  });
}

// ─── O exercício ────────────────────────────────────────────────────────────
//
// Quatro fases: pronto → a-mover (o cenário anima 1,5 s) → decidir (arrasta o
// token) → resposta. `onAnswer(option)` é chamado uma vez, na primeira
// resposta — é aí que quem chama decide se grava (portal) ou não
// (pré-visualização do treinador).
export function renderDrill(host, scenario, { onAnswer = null, compact = false } = {}) {
  const role = roleOf(scenario);
  let phase = 'pronto';
  let answerId = null;
  let raf = null;
  let answered = false;

  host.classList.add('tb-drill');

  const paint = () => {
    const picked = phase === 'resposta' && scenario.options.find((o) => o.id === answerId);
    const frozen = phase === 'decidir' || phase === 'resposta';
    host.innerHTML = `
      <div class="tb-layout${compact ? ' tb-layout--compact' : ''}">
        <div class="tb-court-wrap">
          ${courtSVG({
            scenario,
            at: frozen ? 'final' : 'inicial',
            token: picked
              ? (role.token === 'bola' ? { x: picked.x, y: picked.y - 0.72 } : { x: picked.x, y: picked.y })
              : null,
          })}
        </div>
        <div class="tb-side">${panelHTML(picked)}</div>
      </div>`;
    wire();
  };

  const panelHTML = (picked) => {
    if (phase === 'pronto') {
      return `
        <div class="tb-panel tb-panel--center">
          <span class="tb-tag tb-tag--role">${esc(role.label)}</span>
          <h3 class="tb-panel__title">${esc(scenario.title)}</h3>
          <p class="tb-hint">
            O cenário vai mover-se durante 1,5 segundos e depois congela.
            Lê o que se passa e ${role.token === 'bola'
              ? 'arrasta a bola para onde a jogavas.'
              : 'arrasta a tua peça para onde te colocavas.'}
          </p>
          <button class="btn btn--primary" data-act="start">Começar</button>
        </div>`;
    }
    if (phase === 'a-mover') {
      return `<div class="tb-panel tb-panel--center"><p class="tb-watch" role="status">A ler o jogo…</p></div>`;
    }
    if (phase === 'decidir') {
      return `
        <div class="tb-panel tb-panel--center">
          <p class="tb-watch tb-watch--go" role="status">${esc(role.question)}</p>
          <p class="tb-hint">${role.token === 'bola'
            ? 'Arrasta a bola para a opção que escolhes.'
            : 'Arrasta a tua peça para o sítio que escolhes.'}</p>
        </div>`;
    }

    const v = VERDICTS[picked?.verdict] || VERDICTS.aceitavel;
    const others = scenario.options.filter((o) => o.id !== answerId);
    return `
      <div class="tb-panel">
        <div class="tb-result" style="background:${v.bg};border-color:${v.color}">
          <strong style="color:${v.color}">${v.label}</strong>
          <span>Escolheste ${esc(optionName(picked))}</span>
        </div>
        ${picked?.reason ? `<p class="tb-reason-out">${esc(picked.reason)}</p>` : ''}

        <h3 class="tb-panel__title">As outras opções</h3>
        ${others
          .map((o) => {
            const ov = VERDICTS[o.verdict] || VERDICTS.aceitavel;
            return `
            <div class="tb-alt">
              <span class="tb-tag" style="background:${ov.bg};color:${ov.color}">${ov.label}</span>
              <div>
                <strong>${esc(optionName(o))}</strong>
                ${o.reason ? `<p class="tb-reason-out">${esc(o.reason)}</p>` : ''}
              </div>
            </div>`;
          })
          .join('')}
        ${scenario.note ? `<p class="tb-note-out">${esc(scenario.note)}</p>` : ''}
        <button class="btn btn--ghost" data-act="again">Repetir</button>
      </div>`;
  };

  const wire = () => {
    const svg = host.querySelector('.tb-court');
    const side = host.querySelector('.tb-side');
    host.querySelector('[data-act="start"]')?.addEventListener('click', () => run(svg, side));
    host.querySelector('[data-act="again"]')?.addEventListener('click', () => {
      phase = 'pronto';
      answerId = null;
      paint();
    });
    if (phase === 'decidir') wireToken(svg);
  };

  // As peças movem-se da posição inicial para a final e ficam lá. Congelar (e
  // não voltar atrás) é de propósito: é a posição final que ela tem de ler,
  // depois de ver COMO se lá chegou.
  const run = (svg, side) => {
    phase = 'a-mover';
    side.innerHTML = panelHTML(null);

    const nodes = (scenario.pieces || [])
      .map((p) => ({ p, g: svg.querySelector(`[data-piece="ctx"][data-id="${p.id}"]`) }))
      .filter((n) => n.g);

    const finish = () => {
      nodes.forEach(({ p, g }) =>
        g.setAttribute('transform', `translate(${p.x2 ?? p.x} ${p.y2 ?? p.y})`)
      );
      phase = 'decidir';
      side.innerHTML = panelHTML(null);
      wire();
    };

    // Quem pediu menos movimento não leva animação — mostra-se a posição final
    // e dá-se o mesmo tempo de leitura.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(finish, ANIM_MS);
      return;
    }

    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ANIM_MS);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease-in-out
      nodes.forEach(({ p, g }) => {
        const dx = (p.x2 ?? p.x) - p.x;
        const dy = (p.y2 ?? p.y) - p.y;
        g.setAttribute('transform', `translate(${p.x + dx * e} ${p.y + dy * e})`);
      });
      if (k < 1) raf = requestAnimationFrame(step);
      else { raf = null; finish(); }
    };
    raf = requestAnimationFrame(step);
  };

  const wireToken = (svg) => {
    const tok = svg.querySelector('[data-piece="token"]');
    if (!tok) return;
    tok.classList.add('is-draggable');

    const home = role.token === 'bola'
      ? { x: scenario.actor.x, y: scenario.actor.y - BALL_LIFT }
      : { x: scenario.actor.x, y: scenario.actor.y };
    let dragging = false;

    const nearest = (p) => {
      let best = null;
      let bestD = Infinity;
      scenario.options.forEach((o) => {
        const d = Math.hypot(o.x - p.x, o.y - p.y);
        if (d < bestD) { bestD = d; best = o; }
      });
      return bestD <= DROP_RADIUS ? best : null;
    };

    const highlight = (opt) => {
      svg.querySelectorAll('[data-piece="opt"]').forEach((g) =>
        g.classList.toggle('is-target', !!opt && g.dataset.id === opt.id)
      );
    };

    tok.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dragging = true;
      tok.setPointerCapture(e.pointerId);
      tok.classList.add('is-dragging');
    });

    tok.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const p = toCourt(svg, e);
      if (!p) return;
      tok.setAttribute('transform', `translate(${p.x} ${p.y})`);
      highlight(nearest(p));
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      tok.classList.remove('is-dragging');
      try { tok.releasePointerCapture(e.pointerId); } catch { /* já libertado */ }

      const p = toCourt(svg, e);
      const opt = p && nearest(p);
      highlight(null);

      if (!opt) {
        // Largar no vazio não é uma resposta errada — é um gesto falhado.
        tok.setAttribute('transform', `translate(${home.x} ${home.y})`);
        return;
      }
      answerId = opt.id;
      phase = 'resposta';
      // Só a PRIMEIRA resposta é dado: repetir depois de ver a correção é
      // treino, mas já não é uma leitura.
      if (!answered) {
        answered = true;
        onAnswer?.(opt);
      }
      paint();
    };

    tok.addEventListener('pointerup', end);
    tok.addEventListener('pointercancel', end);
  };

  paint();
  return () => { if (raf) cancelAnimationFrame(raf); };
}

// Nome de uma opção: a ficha real quando existe (para quem jogo), senão a
// etiqueta escrita (a zona, o sítio).
export function optionName(option) {
  if (!option) return '';
  if (option.kind === 'jogadora') return pieceName(option);
  return option.label || option.name || '';
}
