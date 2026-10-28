// Imagem de um resultado (ou da jornada inteira) para partilhar nas histórias
// do Instagram e no WhatsApp, com as cores e o emblema do clube.
//
// É um módulo à parte, carregado só quando alguém carrega em "Partilhar": o
// site abre-se com dados móveis e quase ninguém partilha numa visita. O
// desenho é feito num <canvas> no próprio browser — não há servidor nenhum a
// gerar imagens, e por isso também não há nada a pagar nem a manter.
//
// Nada é enviado pelas costas de ninguém: abre-se uma pré-visualização, e é
// quem a vê que escolhe partilhar ou descarregar.

const W = 1080;
const H = 1920;
const PAD = 90;
const WIN = '#22c55e';
const LOSS = '#ef4444';
const DRAW = '#94a3b8';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function outcome(g) {
  if (g.sets_for === g.sets_against) return ['draw', 'Empate', DRAW];
  return g.sets_for > g.sets_against ? ['win', 'Vitória', WIN] : ['loss', 'Derrota', LOSS];
}

const DISPLAY = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BODY = 'Inter, system-ui, sans-serif';

// O tipo de letra tem de estar carregado ANTES de desenhar: o canvas não
// espera por ele, e a primeira imagem saía em Arial.
async function fontsReady() {
  try {
    await Promise.all([
      document.fonts.load(`italic 800 100px ${DISPLAY}`),
      document.fonts.load(`800 100px ${DISPLAY}`),
      document.fonts.load(`700 100px ${DISPLAY}`),
      document.fonts.load(`600 40px ${BODY}`),
    ]);
  } catch { /* desenha com o que houver */ }
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    if (!/^data:/i.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Escreve numa largura máxima, encolhendo a letra até caber: os nomes vão de
// "CVA" a "Clube Desportivo e Recreativo da Senhora da Hora".
function fitText(ctx, text, { font, size, max, x, y, align = 'left', color, spacing = 0 }) {
  let s = size;
  ctx.textAlign = align;
  ctx.fillStyle = color;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  do {
    ctx.font = font.replace('{s}', s);
    if (ctx.measureText(text).width <= max) break;
    s -= 4;
  } while (s > 20);
  ctx.fillText(text, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function background(ctx, colors) {
  ctx.fillStyle = colors.primary;
  ctx.fillRect(0, 0, W, H);
  // As riscas do site, na diagonal, com a cor de destaque.
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = colors.accent;
  ctx.translate(W / 2, H / 2);
  ctx.rotate((25 * Math.PI) / 180);
  for (let x = -H; x < H; x += 190) ctx.fillRect(x, -H, 64, H * 2);
  ctx.restore();
  const shade = ctx.createLinearGradient(0, H * 0.55, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
}

function header(ctx, { club, colors, logo }) {
  const size = 150;
  let x = PAD;
  if (logo) {
    ctx.save();
    roundRect(ctx, PAD, 110, size, size, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.clip();
    const k = Math.min((size - 20) / logo.width, (size - 20) / logo.height);
    ctx.drawImage(logo, PAD + (size - logo.width * k) / 2, 110 + (size - logo.height * k) / 2, logo.width * k, logo.height * k);
    ctx.restore();
    x = PAD + size + 36;
  }
  fitText(ctx, String(club.name || '').toUpperCase(), {
    font: `italic 800 {s}px ${DISPLAY}`, size: 76, max: W - x - PAD, x, y: 192, color: colors.brandInk,
  });
  if (club.season) {
    fitText(ctx, `ÉPOCA ${club.season}`, {
      font: `600 {s}px ${BODY}`, size: 32, max: W - x - PAD, x, y: 246, color: colors.accent, spacing: 4,
    });
  }
}

function footer(ctx, { site, colors }) {
  fitText(ctx, site, {
    font: `700 {s}px ${DISPLAY}`, size: 52, max: W - PAD * 2, x: W / 2, y: H - 110, align: 'center', color: colors.accent, spacing: 2,
  });
}

function drawResult(ctx, { games, labels, colors }) {
  const g = games[0];
  const [, word, tone] = outcome(g);
  fitText(ctx, `RESULTADO · ${(labels[g.team_id] || '').toUpperCase()}`, {
    font: `600 {s}px ${BODY}`, size: 40, max: W - PAD * 2, x: PAD, y: 520, color: colors.accent, spacing: 6,
  });
  ctx.fillStyle = tone;
  ctx.fillRect(PAD, 560, 120, 12);
  fitText(ctx, word.toUpperCase(), {
    font: `italic 800 {s}px ${DISPLAY}`, size: 210, max: W - PAD * 2, x: PAD - 6, y: 790, color: colors.brandInk,
  });
  fitText(ctx, `${g.sets_for}–${g.sets_against}`, {
    font: `800 {s}px ${DISPLAY}`, size: 440, max: W - PAD * 2, x: W / 2, y: 1190, align: 'center', color: colors.accent,
  });
  fitText(ctx, `VS ${String(g.opponent || g.title || 'Adversário').toUpperCase()}`, {
    font: `700 {s}px ${DISPLAY}`, size: 92, max: W - PAD * 2, x: W / 2, y: 1320, align: 'center', color: colors.brandInk,
  });
  const sets = (g.sets || []).map(([a, b]) => `${a}-${b}`).join('   ');
  if (sets) {
    fitText(ctx, sets, {
      font: `600 {s}px ${BODY}`, size: 44, max: W - PAD * 2, x: W / 2, y: 1410, align: 'center', color: colors.brandInk,
    });
  }
  const day = parseDay(g.date).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
  ctx.globalAlpha = 0.8;
  fitText(ctx, day.charAt(0).toUpperCase() + day.slice(1), {
    font: `500 {s}px ${BODY}`, size: 38, max: W - PAD * 2, x: W / 2, y: 1480, align: 'center', color: colors.brandInk,
  });
  ctx.globalAlpha = 1;
}

function drawRound(ctx, { games, labels, colors }) {
  const wins = games.filter((g) => outcome(g)[0] === 'win').length;
  const first = parseDay(games[games.length - 1].date);
  const last = parseDay(games[0].date);
  const fmt = (d) => d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '').toUpperCase();
  fitText(ctx, `RESULTADOS · ${first.getTime() === last.getTime() ? fmt(last) : `${fmt(first)} E ${fmt(last)}`}`, {
    font: `600 {s}px ${BODY}`, size: 40, max: W - PAD * 2, x: PAD, y: 470, color: colors.accent, spacing: 6,
  });
  const l1 = wins ? `${wins} ${wins === 1 ? 'VITÓRIA' : 'VITÓRIAS'}` : `${games.length} JOGOS`;
  const l2 = wins ? `EM ${games.length} JOGOS` : 'DA JORNADA';
  fitText(ctx, l1, { font: `italic 800 {s}px ${DISPLAY}`, size: 170, max: W - PAD * 2, x: PAD - 6, y: 650, color: colors.brandInk });
  fitText(ctx, l2, { font: `italic 800 {s}px ${DISPLAY}`, size: 170, max: W - PAD * 2, x: PAD - 6, y: 810, color: colors.accent });

  const shown = games.slice(0, 6);
  const rowH = 132;
  let y = 900;
  shown.forEach((g) => {
    const [, , tone] = outcome(g);
    ctx.save();
    roundRect(ctx, PAD, y, W - PAD * 2, rowH - 18, 22);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = tone;
    ctx.fillRect(PAD, y, 14, rowH - 18);
    ctx.restore();
    fitText(ctx, (labels[g.team_id] || '').toUpperCase(), {
      font: `700 {s}px ${DISPLAY}`, size: 50, max: 560, x: PAD + 44, y: y + 54, color: colors.brandInk,
    });
    ctx.globalAlpha = 0.8;
    fitText(ctx, `vs ${g.opponent || g.title || 'Adversário'}`, {
      font: `500 {s}px ${BODY}`, size: 32, max: 560, x: PAD + 44, y: y + 96, color: colors.brandInk,
    });
    ctx.globalAlpha = 1;
    fitText(ctx, `${g.sets_for}–${g.sets_against}`, {
      font: `800 {s}px ${DISPLAY}`, size: 96, max: 260, x: W - PAD - 36, y: y + 88, align: 'right', color: colors.brandInk,
    });
    y += rowH;
  });
  if (games.length > shown.length) {
    fitText(ctx, `e mais ${games.length - shown.length}`, {
      font: `600 {s}px ${BODY}`, size: 36, max: W - PAD * 2, x: W / 2, y: y + 40, align: 'center', color: colors.brandInk,
    });
  }
}

async function render(opts, withLogo) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const logo = withLogo ? await loadImage(opts.club.logo) : null;
  background(ctx, opts.colors);
  header(ctx, { ...opts, logo });
  if (opts.kind === 'round') drawRound(ctx, opts);
  else drawResult(ctx, opts);
  footer(ctx, opts);
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Sem imagem'))), 'image/png');
    } catch (e) {
      reject(e);
    }
  });
}

// Um emblema guardado noutro domínio sem permissões de CORS "suja" o canvas e
// o browser recusa exportá-lo. Aí a imagem sai sem emblema — melhor do que
// não sair imagem nenhuma.
async function makeImage(opts) {
  await fontsReady();
  try {
    return await render(opts, true);
  } catch {
    return render(opts, false);
  }
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function openShareCard(opts) {
  const g = opts.games[0];
  const team = opts.labels[g.team_id] || '';
  const name = opts.kind === 'round'
    ? `resultados-${String(g.date).slice(0, 10)}.png`
    : `resultado-${slugify(team)}-${String(g.date).slice(0, 10)}.png`;
  const text = opts.kind === 'round'
    ? `${opts.club.name}: os resultados da jornada.`
    : `${opts.club.name} · ${team} ${g.sets_for}–${g.sets_against} vs ${g.opponent || g.title || 'Adversário'}`;

  const dlg = document.createElement('dialog');
  dlg.className = 'dialog dialog--card';
  dlg.setAttribute('aria-labelledby', 'card-title');
  dlg.innerHTML = `
    <div class="dialog__head">
      <h2 id="card-title" class="dialog__title">${opts.kind === 'round' ? 'Partilhar os resultados' : 'Partilhar o resultado'}</h2>
      <button type="button" class="iconbtn dialog__x" data-close aria-label="Fechar">×</button>
    </div>
    <div class="cardprev" aria-busy="true"><span>A preparar a imagem…</span></div>
    <p class="form__note">Pronta para as histórias do Instagram, o estado do WhatsApp ou o grupo da equipa.</p>
    <div class="cardprev__actions">
      <button type="button" class="btn btn--accent" data-share-file hidden>Partilhar</button>
      <a class="btn btn--ghost" data-download hidden>Descarregar imagem</a>
    </div>
    <p class="form__error" role="alert" hidden></p>`;
  document.body.appendChild(dlg);
  let url = '';
  const close = () => dlg.close();
  dlg.addEventListener('close', () => {
    if (url) URL.revokeObjectURL(url);
    dlg.remove();
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.querySelector('[data-close]').addEventListener('click', close);
  dlg.showModal();

  const err = dlg.querySelector('.form__error');
  try {
    const blob = await makeImage(opts);
    url = URL.createObjectURL(blob);
    const prev = dlg.querySelector('.cardprev');
    prev.removeAttribute('aria-busy');
    prev.innerHTML = `<img src="${url}" alt="${esc(text)}" />`;
    const dl = dlg.querySelector('[data-download]');
    dl.href = url;
    dl.download = name;
    dl.hidden = false;
    const file = new File([blob], name, { type: 'image/png' });
    const shareBtn = dlg.querySelector('[data-share-file]');
    if (navigator.canShare?.({ files: [file] })) {
      shareBtn.hidden = false;
      shareBtn.addEventListener('click', async () => {
        try {
          await navigator.share({ files: [file], text: `${text}\n${opts.url}` });
        } catch { /* quem cancela a partilha não fez nada de errado */ }
      });
    }
  } catch {
    err.textContent = 'Não foi possível criar a imagem neste browser.';
    err.hidden = false;
  }
}
