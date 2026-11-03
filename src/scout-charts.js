// Gráficos de evolução do Scout — a qualidade jogo a jogo.
//
// Um gráfico por medida (um fundamento da atleta, um indicador da equipa) e
// não todas as linhas no mesmo gráfico: cada medida tem a sua escala e a sua
// leitura, e cinco linhas cruzadas num ecrã de telemóvel não se leem.
//
// - Uma série só, por isso não há legenda: o título diz o que é.
// - A linha tracejada é a MÉDIA da época (de quem se está a ver), que é a régua
//   contra a qual cada jogo se lê — a atleta compara-se com ela própria.
// - Um jogo com poucas ações fica a cinzento e oco: duas receções boas em duas
//   são 100% e não querem dizer nada. Continua lá (o jogo existiu), mas não
//   puxa a linha nem decide a frase de baixo.
// - Tocar num ponto (ou passar o rato) diz o jogo, a percentagem e QUANTAS
//   ações a sustentam — num telemóvel não há "hover", e o número sem o tamanho
//   da amostra engana.
// - Cores só dos tokens da app (`--navy-500`, `--text-muted`, `--border`), que
//   já mudam com o tema escuro. A comparação com a média vai sempre por
//   palavras ("acima da tua média"), nunca só pela cor.

import { esc } from './ui.js';

const W = 320;
const H = 132;
const PAD = { l: 34, r: 10, t: 12, b: 20 };

const pct = (v) => `${Math.round(v * 100)}%`;

// "acima / abaixo / perto" da média, com 5 pontos de margem: menos do que isso
// é ruído de um jogo para o outro e não merece uma seta.
export function versus(v, avg, { better = 'up', avgOf = 'da tua média' } = {}) {
  if (v == null || avg == null) return null;
  const d = v - avg;
  if (Math.abs(d) < 0.05) return { dir: 'eq', text: `perto ${avgOf} (${pct(avg)})`, good: null };
  const up = d > 0;
  return { dir: up ? 'up' : 'down', text: `${up ? 'acima' : 'abaixo'} ${avgOf} (${pct(avg)})`, good: better === 'down' ? !up : up };
}

// `points`: do mais antigo para o mais recente — { label, tip, v, n, weak }.
// `v` é uma proporção (0..1, pode ser negativa numa eficácia) ou null (sem
// ações nesse jogo). `avg` é a média ponderada da época (ou null).
export function evoChart({ title, what, points, avg = null, better = 'up', avgOf = 'da tua média', unit = 'ações' }) {
  const vals = points.filter((p) => p.v != null).map((p) => p.v);
  if (!vals.length) return '';
  // Escala: 0..100% quando cabe; uma eficácia negativa abre o fundo, e o topo
  // sobe ao múltiplo de 10% acima do máximo (uma linha colada ao teto lê-se
  // como "perfeito").
  const lo = Math.min(0, Math.floor(Math.min(...vals) * 10) / 10);
  const hi = Math.max(lo + 0.2, Math.min(1, Math.ceil((Math.max(...vals, avg ?? 0) + 0.05) * 10) / 10));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i) => PAD.l + (points.length === 1 ? iw / 2 : (i * iw) / (points.length - 1));
  const y = (v) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
  const grid = [...new Set([lo, lo < 0 ? 0 : (lo + hi) / 2, hi].map((v) => Math.round(v * 100) / 100))];

  // A linha liga só os jogos que CONTAM (com ações suficientes); um jogo fraco
  // fica como ponto solto, sem puxar a linha.
  const strong = points.map((p, i) => ({ ...p, i })).filter((p) => p.v != null && !p.weak);
  const path = strong.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  // A frase de baixo: o último jogo que conta, contra a média.
  const last = strong[strong.length - 1] || null;
  const tips = points.map((p) => {
    if (p.v == null) return `${p.tip}: sem ${unit} neste jogo.`;
    const vs = versus(p.v, avg, { better, avgOf });
    return `${p.tip}: ${pct(p.v)} em ${p.n} ${unit}${p.weak ? ' (poucas para contar)' : vs ? ` — ${vs.text}` : ''}.`;
  });
  const lastVs = last ? versus(last.v, avg, { better, avgOf }) : null;
  const readout = last ? `Último jogo: ${tips[last.i].replace(/^[^:]+: /, '')}` : 'Ainda não há jogos com ações que cheguem.';
  const aria = `${title}. ${avg != null ? `Média ${pct(avg)}. ` : ''}${tips.join(' ')}`;

  return `<figure class="evo" data-evo="${esc(JSON.stringify(tips))}" data-evo-default="${esc(readout)}">
    <figcaption class="evo__head"><strong>${esc(title)}</strong><span>${esc(what)}${avg != null ? ` · <span class="evo__avg-key" aria-hidden="true"></span> média ${pct(avg)}` : ''}</span></figcaption>
    <svg class="evo__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}">
      ${grid.map((g) => `<line class="evo__grid${g === 0 && lo < 0 ? ' evo__grid--zero' : ''}" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(g).toFixed(1)}" y2="${y(g).toFixed(1)}"/>
        <text class="evo__tick" x="${PAD.l - 6}" y="${(y(g) + 3.5).toFixed(1)}" text-anchor="end">${pct(g)}</text>`).join('')}
      ${avg != null ? `<line class="evo__avg" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}"/>` : ''}
      ${path ? `<path class="evo__line" d="${path}"/>` : ''}
      ${points.map((p, i) => (p.v == null ? '' : `<circle class="evo__pt${p.weak ? ' evo__pt--weak' : ''}" data-pt="${i}" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${p.weak ? 3.5 : 4.5}"/>`)).join('')}
      ${points.map((p, i) => `<rect class="evo__hit" data-i="${i}" x="${(x(i) - Math.max(10, iw / Math.max(1, points.length - 1) / 2)).toFixed(1)}" y="0" width="${Math.max(20, iw / Math.max(1, points.length - 1)).toFixed(1)}" height="${H}"><title>${esc(tips[i])}</title></rect>`).join('')}
      <text class="evo__tick" x="${x(0).toFixed(1)}" y="${H - 5}" text-anchor="${points.length === 1 ? 'middle' : 'start'}">${esc(points[0].label)}</text>
      ${points.length > 1 ? `<text class="evo__tick" x="${x(points.length - 1).toFixed(1)}" y="${H - 5}" text-anchor="end">${esc(points[points.length - 1].label)}</text>` : ''}
    </svg>
    <p class="evo__read" aria-live="polite">${lastVs && lastVs.dir !== 'eq' ? `<span class="evo__arrow evo__arrow--${lastVs.good ? 'good' : 'bad'}" aria-hidden="true">${lastVs.dir === 'up' ? '↑' : '↓'}</span>` : ''}<span class="evo__read-txt">${esc(readout)}</span></p>
  </figure>`;
}

// Liga o toque/hover dos pontos à frase de baixo. Uma vez por desenho.
export function wireEvo(root) {
  root.querySelectorAll('.evo').forEach((fig) => {
    let tips = [];
    try { tips = JSON.parse(fig.dataset.evo || '[]'); } catch { tips = []; }
    const txt = fig.querySelector('.evo__read-txt');
    const arrow = fig.querySelector('.evo__arrow');
    const show = (i) => {
      fig.querySelectorAll('.evo__pt--on').forEach((c) => c.classList.remove('evo__pt--on'));
      if (i == null) { txt.textContent = fig.dataset.evoDefault; if (arrow) arrow.hidden = false; return; }
      fig.querySelector(`[data-pt="${i}"]`)?.classList.add('evo__pt--on');
      txt.textContent = tips[i] || '';
      if (arrow) arrow.hidden = true;
    };
    fig.querySelectorAll('.evo__hit').forEach((r) => {
      const i = Number(r.dataset.i);
      r.addEventListener('pointerenter', () => show(i));
      r.addEventListener('click', () => show(i));
    });
    fig.querySelector('.evo__svg')?.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') show(null); });
  });
}
