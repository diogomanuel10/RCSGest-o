// Movimento do site público: revelar ao deslizar, contadores, inclinação 3D
// dos cartões, a montra 3D dos artigos da loja, paralaxe do topo e a barra de
// progresso. Sem dependências — o site continua a ser poucas dezenas de KB.
//
// Três regras que valem para tudo o que aqui está:
//   1. Nada disto esconde conteúdo se falhar. O CSS só esconde o que vai
//      "entrar" depois de o JS pôr a classe `fx` no <html>.
//   2. Só se anima a ENTRADA numa página. Trocar de escalão ou abrir "mostrar
//      mais" re-desenha a mesma página, e uma lista que entra outra vez a cada
//      toque é ruído (`mountFx({ animate: false })`).
//   3. Com "reduzir movimento" não se anima nada; a montra 3D fica parada mas
//      continua a rodar com o dedo, porque aí o movimento é de quem toca.

const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
const FINE = window.matchMedia('(hover: hover) and (pointer: fine)');

// O que "entra" ao deslizar. São as folhas (um cartão, uma linha), não as
// secções: uma secção inteira a entrar de uma vez não dá ritmo nenhum.
const REVEAL = [
  '[data-rv]', '.sechead', '.wgame', '.stats > li', '.news', '.product', '.showcase',
  '.mosaic > li', '.mteaser', '.sponsors > li', '.band__inner > *', '.teamstat',
  '.teamcard', '.coach', '.player', '.card', '.timeline__item', '.mascot',
  '.anthem > *', '.symbols__grid', '.prose--lead', '.ct > li', '.tier', '.chips',
  '.post__wrap > *', '.pdp__info > *', '.logos',
].join(',');

// Onde o foco de luz segue o rato.
const SPOT = '[data-tilt], .wgame, .teamcard, .news, .teamstat, .stats > li, .coach, .card, .mteaser';

let root = null;
let io = null;
let stageIo = null;
let lastHover = null;
let raf = 0;
const stages = new Set();

export function initFx(el) {
  root = el;
  document.documentElement.classList.add('fx');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      applyScroll();
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerleave', () => clearHover());
  if ('IntersectionObserver' in window) {
    stageIo = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.target._p3d) en.target._p3d.visible = en.isIntersecting;
      });
      if (!raf && stages.size) raf = requestAnimationFrame(frame);
    });
  }
}

// --- Scroll: barra de progresso, cabeçalho e paralaxe do topo ----------------

function applyScroll() {
  if (!root) return;
  const y = window.scrollY;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  root.querySelector('.topbar')?.classList.toggle('is-scrolled', y > 24);
  root.querySelector('.progress')?.style.setProperty('--p', max > 0 ? Math.min(1, y / max).toFixed(4) : '0');
  // A variável vive no próprio topo e não no <html>: mudá-la lá em cima a cada
  // frame recalculava os estilos da página inteira.
  const hero = root.querySelector('.hero');
  if (hero && !RM.matches) hero.style.setProperty('--sy', String(Math.min(y, window.innerHeight)));
}

// --- Rato: inclinação e foco de luz ------------------------------------------

function clearHover() {
  if (!lastHover) return;
  ['--rx', '--ry', '--mx', '--my'].forEach((p) => lastHover.style.removeProperty(p));
  lastHover.classList.remove('is-hover');
  lastHover = null;
}

function onMove(e) {
  if (!FINE.matches) return;
  const t = e.target.closest?.(SPOT);
  if (t !== lastHover) clearHover();
  if (!t) return;
  lastHover = t;
  const r = t.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width;
  const py = (e.clientY - r.top) / r.height;
  t.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
  t.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  t.classList.add('is-hover');
  if (t.hasAttribute('data-tilt') && !RM.matches) {
    const max = Number(t.dataset.tilt) || 8;
    t.style.setProperty('--ry', `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
    t.style.setProperty('--rx', `${(-(py - 0.5) * 2 * max).toFixed(2)}deg`);
  }
}

// --- Contadores ---------------------------------------------------------------

// "87%" conta de 0 a 87. O texto final já está no HTML: se isto não correr, o
// número certo fica lá na mesma.
function countUp(scope, delay) {
  const list = scope.matches('[data-count]') ? [scope] : [...scope.querySelectorAll('[data-count]')];
  list.forEach((el) => {
    const m = /^(\D*)(\d+)(.*)$/.exec(el.textContent.trim());
    if (!m) return;
    const end = Number(m[2]);
    if (!end) return;
    const t0 = performance.now() + delay;
    const dur = 1100;
    el.textContent = `${m[1]}0${m[3]}`;
    const step = (now) => {
      if (!el.isConnected) return;
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      const eased = 1 - (1 - k) ** 3;
      el.textContent = `${m[1]}${Math.round(end * eased)}${m[3]}`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// --- Revelar ao deslizar --------------------------------------------------------

export function mountFx({ animate = true } = {}) {
  if (!root) return;
  io?.disconnect();
  io = null;
  clearHover();
  applyScroll();
  mountStages();
  if (!animate || RM.matches || !('IntersectionObserver' in window)) {
    root.querySelectorAll('[data-rv]').forEach((el) => el.removeAttribute('data-rv'));
    return;
  }
  const els = root.querySelectorAll(REVEAL);
  els.forEach((el) => { if (!el.hasAttribute('data-rv')) el.setAttribute('data-rv', ''); });
  io = new IntersectionObserver((entries) => {
    // O que entra no mesmo instante entra em escada, pela ordem da página.
    let n = 0;
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      io.unobserve(el);
      const d = Math.min(n, 8) * 70;
      n += 1;
      el.style.setProperty('--d', `${d}ms`);
      el.classList.add('is-in');
      countUp(el, d);
      // No fim o elemento volta a ser um elemento normal: a transformação da
      // entrada não pode ficar a disputar a da inclinação 3D.
      setTimeout(() => {
        el.removeAttribute('data-rv');
        el.classList.remove('is-in');
        el.style.removeProperty('--d');
      }, d + 950);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  els.forEach((el) => io.observe(el));
}

// --- Montra 3D ---------------------------------------------------------------------
//
// Cada artigo da loja é um objeto com espessura (a foto empilhada em camadas
// no eixo Z, ver `stage3d` no site.js) que balança sozinho e roda com o dedo
// ou o rato, com inércia. É CSS 3D e não WebGL: não precisa de um modelo por
// artigo — o clube só tem fotos —, não descarrega biblioteca nenhuma e corre
// em qualquer telemóvel.

function mountStages() {
  [...stages].forEach((s) => { if (!s.el.isConnected) stages.delete(s); });
  root.querySelectorAll('[data-p3d]').forEach((el) => {
    if (el._p3d) return;
    const obj = el.querySelector('.p3d__obj');
    if (!obj) return;
    const s = { el, obj, ry: -24, rx: -8, vy: 0, drag: null, visible: true, t0: performance.now() - Math.random() * 4000, touched: 0 };
    el._p3d = s;
    stages.add(s);
    stageIo?.observe(el);
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      s.drag = { x: e.clientX, y: e.clientY };
      s.vy = 0;
      el.classList.add('is-grabbing', 'is-touched');
      try { el.setPointerCapture(e.pointerId); } catch { /* ponteiro já largado */ }
    });
    el.addEventListener('pointermove', (e) => {
      if (!s.drag) return;
      const dx = e.clientX - s.drag.x;
      const dy = e.clientY - s.drag.y;
      s.drag = { x: e.clientX, y: e.clientY };
      s.ry += dx * 0.55;
      s.vy = dx * 0.55;
      s.rx = Math.max(-32, Math.min(32, s.rx - dy * 0.3));
      if (RM.matches) paint(s);
    });
    const drop = () => {
      if (!s.drag) return;
      s.drag = null;
      s.touched = performance.now();
      el.classList.remove('is-grabbing');
    };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
    // Teclado: as setas rodam o artigo.
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      s.vy = e.key === 'ArrowLeft' ? -7 : 7;
      s.touched = performance.now();
      el.classList.add('is-touched');
      if (RM.matches) { s.ry += s.vy * 4; s.vy = 0; paint(s); }
    });
    paint(s);
  });
  if (!raf && stages.size && !RM.matches) raf = requestAnimationFrame(frame);
}

function paint(s) {
  const rad = (s.ry * Math.PI) / 180;
  s.obj.style.transform = `rotateX(${s.rx.toFixed(2)}deg) rotateY(${s.ry.toFixed(2)}deg)`;
  s.el.style.setProperty('--c', Math.abs(Math.cos(rad)).toFixed(3));
  s.el.style.setProperty('--g', `${(50 + Math.sin(rad) * 70).toFixed(1)}%`);
}

function frame(now) {
  raf = 0;
  let live = false;
  stages.forEach((s) => {
    if (!s.el.isConnected) { stages.delete(s); return; }
    if (!s.visible) return;
    live = true;
    if (!s.drag) {
      if (Math.abs(s.vy) > 0.05) {
        // Inércia: continua a rodar depois de largado, a abrandar.
        s.ry += s.vy;
        s.vy *= 0.955;
        s.touched = now;
      } else if (now - s.touched > 1400) {
        // Parado: volta à frente e balança devagar.
        const base = Math.round(s.ry / 360) * 360;
        const target = base + Math.sin((now - s.t0) / 1700) * 26;
        s.ry += (target - s.ry) * 0.035;
        s.rx += (-7 + Math.sin((now - s.t0) / 2300) * 4 - s.rx) * 0.04;
      }
    }
    paint(s);
  });
  if (live && !RM.matches) raf = requestAnimationFrame(frame);
}
