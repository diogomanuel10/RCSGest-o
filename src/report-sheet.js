// Folhas A4 imprimíveis (relatórios), partilhadas pelos vários relatórios.
//
// A app já calcula tudo o que estes relatórios mostram — o que faltava era um
// formato que saísse do ecrã: uma ficha que se entrega ao encarregado de
// educação, um resumo que se afixa no balneário, um documento que se anexa a
// um email. Um número que só existe dentro da app só chega a quem lá entra.
//
// Tudo é gerado no browser a partir de `state` (que o RLS já limitou) e o
// desenho é o mesmo de `players-qr.js`: uma janela nova, autónoma, com um
// botão de imprimir. Sem dependências, sem servidor, sem esperar por nada.

import { esc } from './ui.js';
import { branding, logoSrc } from './branding.js';

// A janela nova é um documento à parte: não tem as variáveis CSS da app, por
// isso as cores da marca têm de ir como valor literal — e um valor inválido
// (ou vazio) tem de cair no azul de origem em vez de partir a folha.
export function cssColor(value, fallback = '#143b61') {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : fallback;
}

export const fmtDate = (d) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT',
    { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// Abre uma folha imprimível numa janela nova.
//   title    — título do documento (e da aba)
//   subtitle — linha de contexto por baixo do nome do clube
//   body     — HTML do corpo (usar as classes documentadas abaixo)
export function openSheet({ title, subtitle, body }) {
  const b = branding();
  // A janela arranca em `about:blank`: um caminho relativo do emblema não
  // resolveria lá. Data URLs passam intactas.
  const logo = new URL(logoSrc(), window.location.href).href;
  const primary = cssColor(b.brand_primary);
  const accent = cssColor(b.brand_accent, '#f2b705');

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('O browser bloqueou a janela de impressão. Autoriza as janelas para este site.');
  }

  win.document.write(`<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #1a2636;
    background: #f0f4f8;
    font-size: 10pt;
    line-height: 1.45;
  }
  .toolbar {
    position: sticky; top: 0; z-index: 1;
    display: flex; align-items: center; gap: 0.8rem;
    padding: 0.8rem 1rem;
    background: #fff; border-bottom: 1px solid #d8e0e8;
    font-size: 0.9rem;
  }
  .toolbar button {
    font: inherit; font-weight: 600;
    padding: 0.45rem 1rem; border-radius: 8px; cursor: pointer;
    border: 1px solid ${primary}; background: ${primary}; color: #fff;
  }
  .page {
    width: 186mm; margin: 6mm auto;
    background: #fff; padding: 8mm;
    border: 1px solid #dde4ed; border-radius: 3mm;
  }
  .rp-head {
    display: flex; align-items: center; gap: 4mm;
    padding-bottom: 3mm; margin-bottom: 4mm;
    border-bottom: 1.2mm solid ${primary};
  }
  .rp-head img { width: 14mm; height: 14mm; object-fit: contain; flex: none; }
  .rp-head__club {
    font-size: 8pt; font-weight: 700; color: ${primary};
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .rp-head__title { font-size: 16pt; font-weight: 700; margin: 0.5mm 0 0; line-height: 1.1; }
  .rp-head__sub { font-size: 9pt; color: #617080; margin: 0.5mm 0 0; }

  .rp-section { margin: 0 0 5mm; break-inside: avoid; page-break-inside: avoid; }
  .rp-section__title {
    font-size: 10pt; font-weight: 700; margin: 0 0 2mm;
    padding-bottom: 1mm; border-bottom: 0.3mm solid #dde4ed;
    text-transform: uppercase; letter-spacing: 0.04em; color: ${primary};
  }
  .rp-note { font-size: 8pt; color: #8a98a5; margin: 1.5mm 0 0; }

  /* Grelha de pares etiqueta/valor */
  .rp-grid {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(38mm, 1fr));
    gap: 2mm 4mm;
  }
  .rp-item__label {
    display: block; font-size: 7.5pt; color: #8a98a5;
    text-transform: uppercase; letter-spacing: 0.04em;
  }
  .rp-item__value { display: block; font-size: 10.5pt; font-weight: 600; }

  /* Números em destaque */
  .rp-stats { display: flex; flex-wrap: wrap; gap: 3mm; }
  .rp-stat {
    flex: 1 1 30mm; min-width: 30mm;
    border: 0.3mm solid #dde4ed; border-radius: 2mm;
    padding: 2.5mm 3mm; background: #f8fafb;
  }
  .rp-stat__value { display: block; font-size: 15pt; font-weight: 700; line-height: 1.1; }
  .rp-stat__label { display: block; font-size: 7.5pt; color: #617080; margin-top: 0.8mm; }
  .rp-stat--ok    { border-left: 1.2mm solid #16a34a; }
  .rp-stat--warn  { border-left: 1.2mm solid #d97706; }
  .rp-stat--danger{ border-left: 1.2mm solid #dc2626; }
  .rp-stat--info  { border-left: 1.2mm solid ${accent}; }

  table.rp-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  table.rp-table th {
    text-align: left; font-size: 7.5pt; text-transform: uppercase;
    letter-spacing: 0.04em; color: #8a98a5; font-weight: 600;
    border-bottom: 0.3mm solid #dde4ed; padding: 1.2mm 1.5mm;
  }
  table.rp-table td { padding: 1.2mm 1.5mm; border-bottom: 0.2mm solid #eef2f6; }
  table.rp-table tr:last-child td { border-bottom: 0; }
  .rp-num { text-align: right; font-variant-numeric: tabular-nums; }

  .rp-tag {
    display: inline-block; padding: 0.3mm 1.6mm; border-radius: 1mm;
    font-size: 7.5pt; font-weight: 600; background: #eef2f6; color: #617080;
  }
  .rp-tag--ok     { background: #dcfce7; color: #15803d; }
  .rp-tag--warn   { background: #fef3c7; color: #b45309; }
  .rp-tag--danger { background: #fee2e2; color: #b91c1c; }
  .rp-tag--info   { background: #dbeafe; color: #1d4ed8; }

  .rp-empty { color: #8a98a5; font-size: 9pt; margin: 0; }
  .rp-foot {
    margin-top: 6mm; padding-top: 2mm; border-top: 0.2mm solid #dde4ed;
    font-size: 7.5pt; color: #8a98a5;
    display: flex; justify-content: space-between; gap: 4mm;
  }

  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .page { width: auto; margin: 0; padding: 0; border: 0; border-radius: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Imprimir / Guardar PDF</button>
    <span>${esc(title)}</span>
  </div>
  <div class="page">
    <header class="rp-head">
      ${logo ? `<img src="${esc(logo)}" alt="" />` : ''}
      <div>
        <span class="rp-head__club">${esc(b.club_name || b.app_name || 'Clube')}</span>
        <h1 class="rp-head__title">${esc(title)}</h1>
        ${subtitle ? `<p class="rp-head__sub">${esc(subtitle)}</p>` : ''}
      </div>
    </header>
    ${body}
    <footer class="rp-foot">
      <span>${esc(b.club_name || b.app_name || 'Clube')}</span>
      <span>Gerado a ${esc(new Date().toLocaleDateString('pt-PT', {
        day: '2-digit', month: 'long', year: 'numeric',
      }))}</span>
    </footer>
  </div>
</body>
</html>`);
  win.document.close();
}

// --- Blocos reutilizáveis -------------------------------------------------

export function section(title, inner, note) {
  return `
    <section class="rp-section">
      <h2 class="rp-section__title">${esc(title)}</h2>
      ${inner}
      ${note ? `<p class="rp-note">${esc(note)}</p>` : ''}
    </section>`;
}

export function item(label, value) {
  return `
    <div class="rp-item">
      <span class="rp-item__label">${esc(label)}</span>
      <span class="rp-item__value">${value === '' || value == null ? '—' : esc(String(value))}</span>
    </div>`;
}

export function stat(value, label, variant = '') {
  return `
    <div class="rp-stat${variant ? ' rp-stat--' + variant : ''}">
      <span class="rp-stat__value">${esc(String(value))}</span>
      <span class="rp-stat__label">${esc(label)}</span>
    </div>`;
}

export function tag(text, variant = '') {
  return `<span class="rp-tag${variant ? ' rp-tag--' + variant : ''}">${esc(text)}</span>`;
}

export function empty(text) {
  return `<p class="rp-empty">${esc(text)}</p>`;
}
