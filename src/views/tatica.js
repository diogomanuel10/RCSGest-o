// Vista: Decisão Tática (PROTÓTIPO).
//
// Treino de decisão para distribuidoras. O cenário é sempre o mesmo molde:
// free ball perfeita, 3 atacantes nossas, 3 blocadoras adversárias. A atleta
// não desenha nada nem posiciona ninguém — arrasta a BOLA para a atacante que
// escolhe. É um só gesto, porque a decisão da distribuidora é um destino, não
// uma posição.
//
// O que torna isto leitura de bloco e não um puzzle é o tempo: as blocadoras
// têm posição inicial E final, movem-se durante ~1,5s e CONGELAM. A direção do
// movimento é a informação que se lê em jogo; uma fotografia estática dava a
// posição final de bandeja e escondia o movimento que a produziu.
//
// Não há resposta única: cada atacante é classificada `otima|aceitavel|ma` com
// uma razão escrita. Uma resposta certa só ensinaria a preferência do treinador.
// Pela mesma razão não há nota, percentagem acumulada nem comparação entre
// atletas — isso trocava exploração por decorar.
//
// PROTÓTIPO: os cenários vivem em localStorage, não no Supabase. Serve para
// avaliar a sensação de uso antes de investir no SQL, no RLS e no portal.

import { esc } from '../ui.js';
import { confirmDialog } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import { canEdit } from '../permissions.js';

const STORE_KEY = 'rumia:tatica:proto:v1';

// ─── Geometria do campo, em METROS ──────────────────────────────────────────
// Guardar as posições em metros (e não em píxeis) faz o mesmo cenário desenhar
// bem num telemóvel de 320px e num projetor, sem tocar nos dados: o viewBox do
// SVG trata da escala sozinho.
// Mostra-se uma FATIA do campo (dos 3 m adversários aos ~6 m dos nossos) e não
// os 18 m oficiais: a decisão em free ball vive toda à volta da rede, e desenhar
// o fundo do campo vazio só encolhia as peças que interessam. Por isso os bordos
// de cima e de baixo não têm linha — são cortes, não linhas de fundo.
const COURT = {
  width: 9,        // largura oficial
  netY: 3,         // a rede; acima dela vê-se a faixa da frente adversária
  backY: 9.5,      // até onde desenhamos o nosso campo (corte, não linha de fundo)
  attackY: 6,      // linha de ataque (3 m da rede)
};
const VIEWBOX = '-0.8 -0.8 10.6 11.1';

const PLAYER_R = 0.46;
const BALL_R = 0.3;
const DROP_RADIUS = 1.3;   // tolerância para largar a bola em cima de uma atacante
const ANIM_MS = 1500;

const VERDICTS = {
  otima:     { label: 'Ótima',     color: 'var(--ok)',     bg: 'var(--ok-bg)' },
  aceitavel: { label: 'Aceitável', color: 'var(--warn)',   bg: 'var(--warn-bg)' },
  ma:        { label: 'Má',        color: 'var(--danger)', bg: 'var(--danger-bg)' },
};
const VERDICT_KEYS = Object.keys(VERDICTS);

// Molde de partida: 5-1 em free ball, distribuidora entrada da zona 1.
function blankScenario() {
  return {
    id: `s${Date.now().toString(36)}`,
    title: 'Free ball — bloco a fechar ao meio',
    note: '',
    setter: { x: 6.5, y: 6.0 },
    attackers: [
      { id: 'a4', label: 'Z4', name: 'Ponta esquerda', x: 1.3, y: 4.5, verdict: 'aceitavel', reason: '' },
      { id: 'a3', label: 'Z3', name: 'Central',        x: 4.5, y: 3.9, verdict: 'otima',     reason: '' },
      { id: 'a2', label: 'Z2', name: 'Oposto',         x: 7.9, y: 4.5, verdict: 'ma',        reason: '' },
    ],
    blockers: [
      { id: 'b4', label: 'B1', x: 1.4, y: 2.3, x2: 2.2, y2: 2.3 },
      { id: 'b3', label: 'B2', x: 4.5, y: 2.3, x2: 4.5, y2: 2.3 },
      { id: 'b2', label: 'B3', x: 7.6, y: 2.3, x2: 6.8, y2: 2.3 },
    ],
  };
}

// ─── Persistência do protótipo ──────────────────────────────────────────────
function loadScenarios() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) && list.length ? list : [blankScenario()];
  } catch {
    return [blankScenario()];
  }
}

function saveScenarios(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// ─── Estado local da vista (persiste entre re-desenhos, como nas outras) ────
let scenarios = null;
let currentId = null;
let mode = 'treinador';   // 'treinador' (autoria) | 'atleta' (exercício)
let editTarget = 'inicial'; // 'inicial' | 'final' — que posição do bloco se arrasta
let phase = 'pronto';     // atleta: 'pronto' | 'a-mover' | 'decidir' | 'resposta'
let answerId = null;      // atacante escolhida pela atleta
let animRAF = null;

function current() {
  return scenarios.find((s) => s.id === currentId) || scenarios[0];
}

function persist() {
  if (!saveScenarios(scenarios)) toastError('Não foi possível guardar o cenário neste dispositivo.');
}

// ─── Desenho do campo ───────────────────────────────────────────────────────
function courtHTML(scenario) {
  const { width, netY, backY, attackY } = COURT;

  const attackers = scenario.attackers
    .map(
      (a) => `
      <g class="tb-piece tb-piece--att" data-piece="att" data-id="${a.id}"
         transform="translate(${a.x} ${a.y})">
        <circle r="${PLAYER_R}" class="tb-att-dot" />
        <text class="tb-piece-label" y="0.16">${esc(a.label)}</text>
      </g>`
    )
    .join('');

  // Fantasma da posição inicial + traço até à final: sem isto o treinador não
  // vê que movimento acabou de definir.
  const blockers = scenario.blockers
    .map((b) => {
      const moved = Math.abs(b.x2 - b.x) > 0.05 || Math.abs(b.y2 - b.y) > 0.05;
      const ghost =
        mode === 'treinador' && moved
          ? `<circle class="tb-ghost" cx="${b.x}" cy="${b.y}" r="${PLAYER_R}" />
             <line class="tb-ghost-line" x1="${b.x}" y1="${b.y}" x2="${b.x2}" y2="${b.y2}" />`
          : '';
      // Em autoria mostra-se a peça na posição que se está a editar. No
      // exercício começa na inicial (a animação move-a a partir daí), mas
      // assim que o bloco congela fica na FINAL — incluindo no re-desenho da
      // resposta, senão a atleta via o bloco saltar de volta ao início e
      // perdia a imagem sobre a qual acabou de decidir.
      const frozen = mode === 'atleta' && (phase === 'decidir' || phase === 'resposta');
      const shown =
        frozen || (mode === 'treinador' && editTarget === 'final')
          ? { x: b.x2, y: b.y2 }
          : { x: b.x, y: b.y };
      return `
        ${ghost}
        <g class="tb-piece tb-piece--blk" data-piece="blk" data-id="${b.id}"
           transform="translate(${shown.x} ${shown.y})">
          <circle r="${PLAYER_R}" class="tb-blk-dot" />
          <text class="tb-piece-label" y="0.16">${esc(b.label)}</text>
        </g>`;
    })
    .join('');

  // Depois de responder a bola fica em cima de quem foi escolhida: o gesto tem
  // de deixar rasto, senão a resposta some-se e sobra só o texto ao lado.
  const picked = phase === 'resposta' && scenario.attackers.find((a) => a.id === answerId);
  const ball = picked
    ? { x: picked.x, y: picked.y - 0.72 }
    : { x: scenario.setter.x, y: scenario.setter.y - 0.95 };

  return `
    <svg class="tb-court" viewBox="${VIEWBOX}" role="img"
         aria-label="Campo de voleibol com três atacantes e três blocadoras adversárias">
      <!-- faixa adversária + nosso campo -->
      <rect class="tb-opp"   x="0" y="0"        width="${width}" height="${netY}" />
      <rect class="tb-floor" x="0" y="${netY}"  width="${width}" height="${backY - netY}" />
      <line class="tb-line"  x1="0"        y1="0" x2="0"        y2="${backY}" />
      <line class="tb-line"  x1="${width}" y1="0" x2="${width}" y2="${backY}" />
      <line class="tb-line"  x1="0" y1="${attackY}" x2="${width}" y2="${attackY}" />
      <line class="tb-net"   x1="0" y1="${netY}"    x2="${width}" y2="${netY}" />
      <text class="tb-side-label" x="0.18" y="0.62">adversário</text>

      ${blockers}
      ${attackers}

      <g class="tb-piece tb-piece--setter" data-piece="setter" data-id="setter"
         transform="translate(${scenario.setter.x} ${scenario.setter.y})">
        <circle r="${PLAYER_R}" class="tb-setter-dot" />
        <text class="tb-piece-label" y="0.16">D</text>
      </g>

      <g class="tb-ball" data-piece="ball" transform="translate(${ball.x} ${ball.y})">
        <circle r="${BALL_R}" class="tb-ball-dot" />
      </g>
    </svg>`;
}

// ─── Conversão ecrã → metros ────────────────────────────────────────────────
function toCourt(svg, evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const p = pt.matrixTransform(ctm.inverse());
  return { x: p.x, y: p.y };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// ─── Painel lateral: autoria ────────────────────────────────────────────────
function authorPanelHTML(scenario) {
  const cards = scenario.attackers
    .map((a) => {
      const v = VERDICTS[a.verdict] || VERDICTS.aceitavel;
      return `
      <div class="tb-att-card" data-att="${a.id}">
        <div class="tb-att-card__head">
          <span class="tb-tag" style="background:${v.bg};color:${v.color}">${esc(a.label)}</span>
          <input class="tb-name" data-field="name" value="${esc(a.name)}"
                 aria-label="Nome da atacante ${esc(a.label)}" />
        </div>
        <div class="tb-verdicts" role="group" aria-label="Qualidade da opção ${esc(a.label)}">
          ${VERDICT_KEYS.map(
            (k) => `
            <button type="button" class="tb-verdict${a.verdict === k ? ' is-on' : ''}"
                    data-verdict="${k}"
                    style="${a.verdict === k ? `background:${VERDICTS[k].bg};color:${VERDICTS[k].color};border-color:${VERDICTS[k].color}` : ''}">
              ${VERDICTS[k].label}
            </button>`
          ).join('')}
        </div>
        <textarea class="tb-reason" data-field="reason" rows="2"
                  placeholder="Porquê? (a atleta vê isto depois de responder)"
                  aria-label="Razão para ${esc(a.label)}">${esc(a.reason)}</textarea>
      </div>`;
    })
    .join('');

  return `
    <div class="tb-panel">
      <label class="tb-field">
        <span>Título do cenário</span>
        <input id="tb-title" value="${esc(scenario.title)}" />
      </label>

      <div class="tb-toggle" role="group" aria-label="Que posição do bloco estou a arrastar">
        <button type="button" class="tb-toggle__btn${editTarget === 'inicial' ? ' is-on' : ''}"
                data-target="inicial">Posição inicial</button>
        <button type="button" class="tb-toggle__btn${editTarget === 'final' ? ' is-on' : ''}"
                data-target="final">Posição final</button>
      </div>
      <p class="tb-hint">
        ${editTarget === 'inicial'
          ? 'Arrasta as blocadoras para onde estão quando a bola sai. Depois passa a “Posição final”.'
          : 'Arrasta as blocadoras para onde chegam ao fim de 1,5 s. O traço mostra o movimento que a atleta vai ler.'}
      </p>

      <h3 class="tb-panel__title">As três opções</h3>
      ${cards}

      <label class="tb-field">
        <span>Nota do treinador (opcional)</span>
        <textarea id="tb-note" rows="2"
          placeholder="Contexto: marcador, adversário, o que se está a trabalhar…">${esc(scenario.note)}</textarea>
      </label>
    </div>`;
}

// ─── Painel lateral: exercício ──────────────────────────────────────────────
function athletePanelHTML(scenario) {
  if (phase === 'pronto') {
    return `
      <div class="tb-panel tb-panel--center">
        <h3 class="tb-panel__title">${esc(scenario.title)}</h3>
        <p class="tb-hint">
          Free ball perfeita. O bloco vai mover-se durante 1,5 segundos e depois congela.
          Lê para onde vão as blocadoras e arrasta a bola para quem devias jogar.
        </p>
        <button class="btn btn--primary" data-act="start">Começar</button>
      </div>`;
  }
  if (phase === 'a-mover') {
    return `
      <div class="tb-panel tb-panel--center">
        <p class="tb-watch" role="status">A ler o bloco…</p>
      </div>`;
  }
  if (phase === 'decidir') {
    return `
      <div class="tb-panel tb-panel--center">
        <p class="tb-watch tb-watch--go" role="status">Decide.</p>
        <p class="tb-hint">Arrasta a bola para a atacante que escolhes.</p>
      </div>`;
  }

  // phase === 'resposta'
  const picked = scenario.attackers.find((a) => a.id === answerId);
  const v = VERDICTS[picked?.verdict] || VERDICTS.aceitavel;
  const others = scenario.attackers.filter((a) => a.id !== answerId);

  return `
    <div class="tb-panel">
      <div class="tb-result" style="background:${v.bg};border-color:${v.color}">
        <strong style="color:${v.color}">${v.label}</strong>
        <span>Escolheste a ${esc(picked?.name || picked?.label || '')}</span>
      </div>
      ${picked?.reason ? `<p class="tb-reason-out">${esc(picked.reason)}</p>` : ''}

      <h3 class="tb-panel__title">As outras opções</h3>
      ${others
        .map((a) => {
          const ov = VERDICTS[a.verdict] || VERDICTS.aceitavel;
          return `
          <div class="tb-alt">
            <span class="tb-tag" style="background:${ov.bg};color:${ov.color}">${ov.label}</span>
            <div>
              <strong>${esc(a.name || a.label)}</strong>
              ${a.reason ? `<p class="tb-reason-out">${esc(a.reason)}</p>` : ''}
            </div>
          </div>`;
        })
        .join('')}
      ${scenario.note ? `<p class="tb-note-out">${esc(scenario.note)}</p>` : ''}
      <button class="btn btn--ghost" data-act="again">Repetir</button>
    </div>`;
}

// ─── Vista ──────────────────────────────────────────────────────────────────
export function renderTatica(container) {
  if (!scenarios) scenarios = loadScenarios();
  if (!current()) currentId = scenarios[0].id;
  const scenario = current();
  const canAuthor = canEdit('players');
  if (!canAuthor) mode = 'atleta';

  cancelAnim();

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Decisão Tática</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">
          Protótipo · free ball, 3 atacantes, 3 blocadoras · guardado só neste dispositivo
        </p>
      </div>
      ${canAuthor
        ? `<div class="tb-modes" role="group" aria-label="Modo">
             <button type="button" class="tb-toggle__btn${mode === 'treinador' ? ' is-on' : ''}" data-mode="treinador">Criar cenário</button>
             <button type="button" class="tb-toggle__btn${mode === 'atleta' ? ' is-on' : ''}" data-mode="atleta">Ver como atleta</button>
           </div>`
        : ''}
    </header>

    ${canAuthor
      ? `<div class="tb-bar">
           <label class="tb-field tb-field--inline">
             <span>Cenário</span>
             <select id="tb-pick">
               ${scenarios.map((s) => `<option value="${s.id}"${s.id === scenario.id ? ' selected' : ''}>${esc(s.title)}</option>`).join('')}
             </select>
           </label>
           <button class="btn btn--ghost btn--sm" data-act="new">Novo</button>
           <button class="btn btn--ghost btn--sm" data-act="dup">Duplicar</button>
           <button class="btn btn--danger btn--sm" data-act="del"${scenarios.length < 2 ? ' disabled' : ''}>Apagar</button>
         </div>`
      : ''}

    <div class="tb-layout">
      <div class="tb-court-wrap">${courtHTML(scenario)}</div>
      <div class="tb-side" data-side>
        ${mode === 'treinador' ? authorPanelHTML(scenario) : athletePanelHTML(scenario)}
      </div>
    </div>`;

  wire(container, scenario, canAuthor);
}

function redraw(container) {
  renderTatica(container);
}

function cancelAnim() {
  if (animRAF) cancelAnimationFrame(animRAF);
  animRAF = null;
}

function wire(container, scenario, canAuthor) {
  const svg = container.querySelector('.tb-court');
  const side = container.querySelector('[data-side]');

  // ── Barra de cenários ──
  container.querySelector('#tb-pick')?.addEventListener('change', (e) => {
    currentId = e.target.value;
    phase = 'pronto';
    answerId = null;
    redraw(container);
  });

  container.querySelector('[data-act="new"]')?.addEventListener('click', () => {
    const s = blankScenario();
    scenarios.push(s);
    currentId = s.id;
    persist();
    redraw(container);
  });

  container.querySelector('[data-act="dup"]')?.addEventListener('click', () => {
    const copy = structuredClone(scenario);
    copy.id = `s${Date.now().toString(36)}`;
    copy.title = `${scenario.title} (cópia)`;
    scenarios.push(copy);
    currentId = copy.id;
    persist();
    toastOk('Cenário duplicado.');
    redraw(container);
  });

  container.querySelector('[data-act="del"]')?.addEventListener('click', async () => {
    const ok = await confirmDialog(
      `Apagar o cenário “${scenario.title}”? Não é possível repor.`,
      { confirmLabel: 'Apagar', danger: true }
    );
    if (!ok) return;
    scenarios = scenarios.filter((s) => s.id !== scenario.id);
    currentId = scenarios[0]?.id || null;
    persist();
    redraw(container);
  });

  // ── Modo ──
  container.querySelectorAll('[data-mode]').forEach((btn) =>
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode;
      phase = 'pronto';
      answerId = null;
      redraw(container);
    })
  );

  if (mode === 'treinador' && canAuthor) wireAuthor(container, scenario, svg);
  else wireAthlete(container, scenario, svg, side);
}

// ─── Autoria ────────────────────────────────────────────────────────────────
function wireAuthor(container, scenario, svg) {
  container.querySelectorAll('[data-target]').forEach((btn) =>
    btn.addEventListener('click', () => {
      editTarget = btn.dataset.target;
      redraw(container);
    })
  );

  const title = container.querySelector('#tb-title');
  title?.addEventListener('change', () => {
    scenario.title = title.value.trim() || 'Cenário sem título';
    persist();
    redraw(container);
  });

  const note = container.querySelector('#tb-note');
  note?.addEventListener('change', () => {
    scenario.note = note.value;
    persist();
  });

  container.querySelectorAll('.tb-att-card').forEach((card) => {
    const att = scenario.attackers.find((a) => a.id === card.dataset.att);
    if (!att) return;

    card.querySelectorAll('[data-field]').forEach((input) =>
      input.addEventListener('change', () => {
        att[input.dataset.field] = input.value;
        persist();
      })
    );

    card.querySelectorAll('[data-verdict]').forEach((btn) =>
      btn.addEventListener('click', () => {
        att.verdict = btn.dataset.verdict;
        persist();
        redraw(container);
      })
    );
  });

  // Arrastar peças. Pointer events (e não dragstart do HTML5) porque isto tem
  // de funcionar ao toque no telemóvel, que é onde vai ser usado.
  makeDraggable(svg, (id, kind, pos) => {
    if (kind === 'setter') {
      scenario.setter = pos;
    } else if (kind === 'att') {
      const a = scenario.attackers.find((x) => x.id === id);
      if (a) Object.assign(a, pos);
    } else if (kind === 'blk') {
      const b = scenario.blockers.find((x) => x.id === id);
      if (!b) return;
      if (editTarget === 'final') {
        b.x2 = pos.x;
        b.y2 = pos.y;
      } else {
        // Mover a inicial arrasta a final junto quando ainda não há movimento
        // definido — senão a peça "partia-se" em duas à primeira arrastada.
        const still = Math.abs(b.x2 - b.x) < 0.05 && Math.abs(b.y2 - b.y) < 0.05;
        if (still) {
          b.x2 = pos.x;
          b.y2 = pos.y;
        }
        b.x = pos.x;
        b.y = pos.y;
      }
    }
  }, () => {
    persist();
    redraw(container);
  });
}

// Limites por tipo de peça: as blocadoras vivem do lado de lá da rede, as
// nossas do lado de cá. Sem isto arrastava-se uma central para dentro do
// campo adversário e o cenário deixava de fazer sentido.
function limitsFor(kind) {
  if (kind === 'blk') return { minY: 0.6, maxY: COURT.netY - 0.35 };
  return { minY: COURT.netY + 0.5, maxY: COURT.backY - 0.5 };
}

function makeDraggable(svg, onMove, onEnd) {
  if (!svg) return;
  let active = null;

  svg.querySelectorAll('[data-piece]').forEach((g) => {
    const kind = g.dataset.piece;
    if (kind === 'ball') return;
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
      const lim = limitsFor(kind);
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

// ─── Exercício ──────────────────────────────────────────────────────────────
function wireAthlete(container, scenario, svg, side) {
  container.querySelector('[data-act="start"]')?.addEventListener('click', () => {
    runBlockMove(container, scenario, svg, side);
  });

  container.querySelector('[data-act="again"]')?.addEventListener('click', () => {
    phase = 'pronto';
    answerId = null;
    redraw(container);
  });

  if (phase === 'decidir') wireBallDrag(container, scenario, svg);
}

// As blocadoras movem-se da posição inicial para a final e ficam lá. Congelar
// (e não voltar atrás) é de propósito: é a posição final que ela tem de ler,
// depois de ver como se lá chegou.
function runBlockMove(container, scenario, svg, side) {
  phase = 'a-mover';
  side.innerHTML = athletePanelHTML(scenario);

  const nodes = scenario.blockers
    .map((b) => ({ b, g: svg.querySelector(`[data-piece="blk"][data-id="${b.id}"]`) }))
    .filter((n) => n.g);

  const finish = () => {
    nodes.forEach(({ b, g }) => g.setAttribute('transform', `translate(${b.x2} ${b.y2})`));
    phase = 'decidir';
    side.innerHTML = athletePanelHTML(scenario);
    wireAthlete(container, scenario, svg, side);
  };

  // Quem pediu menos movimento não leva animação nenhuma — mostra-se a posição
  // final e dá-se tempo de leitura equivalente.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setTimeout(finish, ANIM_MS);
    return;
  }

  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ANIM_MS);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease-in-out
    nodes.forEach(({ b, g }) => {
      g.setAttribute('transform', `translate(${b.x + (b.x2 - b.x) * e} ${b.y + (b.y2 - b.y) * e})`);
    });
    if (k < 1) animRAF = requestAnimationFrame(step);
    else { animRAF = null; finish(); }
  };
  animRAF = requestAnimationFrame(step);
}

function wireBallDrag(container, scenario, svg) {
  const ball = svg.querySelector('[data-piece="ball"]');
  if (!ball) return;
  ball.classList.add('is-draggable');

  const start = { x: scenario.setter.x, y: scenario.setter.y - 0.95 };
  let dragging = false;

  const nearest = (p) => {
    let best = null;
    let bestD = Infinity;
    scenario.attackers.forEach((a) => {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < bestD) { bestD = d; best = a; }
    });
    return bestD <= DROP_RADIUS ? best : null;
  };

  const highlight = (att) => {
    svg.querySelectorAll('[data-piece="att"]').forEach((g) =>
      g.classList.toggle('is-target', !!att && g.dataset.id === att.id)
    );
  };

  ball.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    ball.setPointerCapture(e.pointerId);
    ball.classList.add('is-dragging');
  });

  ball.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const p = toCourt(svg, e);
    if (!p) return;
    ball.setAttribute('transform', `translate(${p.x} ${p.y})`);
    highlight(nearest(p));
  });

  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    ball.classList.remove('is-dragging');
    try { ball.releasePointerCapture(e.pointerId); } catch { /* já libertado */ }

    const p = toCourt(svg, e);
    const att = p && nearest(p);
    highlight(null);

    if (!att) {
      // Largar no vazio não é uma resposta errada — é um gesto falhado.
      ball.setAttribute('transform', `translate(${start.x} ${start.y})`);
      return;
    }
    answerId = att.id;
    phase = 'resposta';
    redraw(container);
  };

  ball.addEventListener('pointerup', end);
  ball.addEventListener('pointercancel', end);
}
