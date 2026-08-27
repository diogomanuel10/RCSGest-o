// Talões de convite ao portal, prontos a imprimir e a entregar em mão.
//
// A folha existe pelo mesmo motivo que os cartões QR: nos escalões de formação
// o contacto do encarregado muitas vezes não está na ficha, e o que funciona é
// um papel entregue no fim do treino. Cada talão tem o QR do link pessoal do
// atleta (aponta-se a câmara e abre) e o endereço escrito por baixo, para quem
// preferir escrevê-lo.
//
// Os talões NÃO são intermutáveis: cada um leva o link de UMA ficha. Trocá-los
// entre atletas liga a conta ao atleta errado — daí o nome em destaque no
// cimo de cada talão.

import { esc } from './ui.js';
import { qrSvg } from './qrcode.js';
import { branding, logoSrc } from './branding.js';
import { teamName } from './compute.js';
import { cssColor } from './report-sheet.js';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// `rows`: [{ player, url, expiresAt }], já filtrados e ordenados pela vista.
export async function openInviteSlips(rows, team) {
  if (!rows?.length) throw new Error('Não há convites para imprimir.');

  const b = branding();
  // A janela nova arranca em `about:blank`: um caminho relativo do emblema não
  // resolveria lá. Data URLs passam intactas.
  const logo = new URL(logoSrc(), window.location.href).href;
  const svgs = await Promise.all(rows.map((r) => qrSvg(r.url)));
  const slips = rows.map((r, i) => slipHTML(r, team, svgs[i], b, logo)).join('');

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('O browser bloqueou a janela de impressão. Autoriza as janelas para este site.');
  }

  win.document.write(`<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>Convites ao portal${team ? ' — ' + esc(teamName(team)) : ''}</title>
<style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #10202f;
    background: #f4f6f8;
  }
  .sheet {
    display: grid;
    grid-template-columns: repeat(2, 90mm);
    gap: 4mm;
    justify-content: center;
    padding: 8mm 0;
  }
  .slip {
    width: 90mm; min-height: 62mm;
    border: 0.3mm dashed #b8c4d0;
    border-radius: 2mm;
    background: #fff;
    padding: 5mm;
    display: flex; gap: 4mm;
    /* Nunca partir um talão entre duas folhas. */
    break-inside: avoid; page-break-inside: avoid;
  }
  .slip__qr { width: 30mm; height: 30mm; flex: none; }
  .slip__qr svg { width: 100%; height: 100%; display: block; }
  .slip__info { min-width: 0; flex: 1; }
  .slip__club {
    display: flex; align-items: center; gap: 2mm;
    font-size: 8pt; font-weight: 600; color: ${cssColor(b.brand_primary)};
    text-transform: uppercase; letter-spacing: 0.04em;
    margin-bottom: 1.5mm;
  }
  .slip__club img { width: 6mm; height: 6mm; object-fit: contain; }
  .slip__name {
    font-size: 12.5pt; font-weight: 700; line-height: 1.15;
    margin: 0 0 1mm; overflow-wrap: anywhere;
  }
  .slip__meta { font-size: 8pt; color: #5b6b7a; margin: 0 0 2mm; }
  .slip__steps { font-size: 8pt; color: #33475b; margin: 0 0 2mm; padding-left: 4mm; }
  .slip__steps li { margin-bottom: 0.6mm; }
  .slip__url {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 6.5pt; color: #33475b;
    margin: 0; overflow-wrap: anywhere;
  }
  .slip__warn { font-size: 6.5pt; color: #8a98a5; margin: 1.5mm 0 0; }
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
    border: 1px solid ${cssColor(b.brand_primary)};
    background: ${cssColor(b.brand_primary)}; color: #fff;
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { padding: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Imprimir</button>
    <span>${rows.length} talão${rows.length === 1 ? '' : 'ões'}${team ? ' · ' + esc(teamName(team)) : ''} · corta e entrega a cada atleta — cada talão é pessoal</span>
  </div>
  <div class="sheet">${slips}</div>
</body>
</html>`);
  win.document.close();
  return rows.length;
}

function slipHTML({ player, url, expiresAt }, team, svg, b, logo) {
  const club = b.club_name || b.app_name || 'clube';
  const meta = [player.number ? `Nº ${player.number}` : '', team ? teamName(team) : '']
    .filter(Boolean).join(' · ');

  return `
    <div class="slip">
      <div class="slip__qr">${svg}</div>
      <div class="slip__info">
        <div class="slip__club">
          ${logo ? `<img src="${esc(logo)}" alt="" />` : ''}
          <span>${esc(club)} · acesso ao portal</span>
        </div>
        <p class="slip__name">${esc(player.name)}</p>
        <p class="slip__meta">${esc(meta || '—')}</p>
        <ol class="slip__steps">
          <li>Aponta a câmara ao código (ou escreve o endereço).</li>
          <li>Cria conta com o teu email.</li>
          <li>Ficas logo ligado a esta ficha.</li>
        </ol>
        <p class="slip__url">${esc(url)}</p>
        <p class="slip__warn">
          Talão pessoal de ${esc(player.name)}${expiresAt ? ` · válido até ${esc(fmtDate(expiresAt))}` : ''}.
        </p>
      </div>
    </div>
  `;
}
