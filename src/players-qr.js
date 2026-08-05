// Cartões QR dos atletas, prontos a imprimir e plastificar.
//
// Abre uma janela só com os cartões (tamanho de cartão de crédito, 10 por
// folha A4) e manda imprimir. É a via para os escalões de formação, onde a
// maioria não tem telemóvel — quem tem conta vê o mesmo QR no seu portal.

import { esc } from './ui.js';
import { qrSvg, qrPayload } from './qrcode.js';
import { branding, logoSrc } from './branding.js';
import { teamName } from './compute.js';

// Gera e abre a folha de cartões de uma lista de atletas.
// `players` já vem filtrada e ordenada pela vista que chamou.
export async function openQrCards(players, team) {
  const withToken = players.filter((p) => p.qr_token);
  if (!withToken.length) {
    throw new Error(
      'Nenhum destes atletas tem cartão QR. Corre a migração qrcode-presencas.sql no Supabase.'
    );
  }

  const b = branding();
  // A janela nova arranca em `about:blank`: um caminho relativo do emblema
  // (o SVG do pacote) não resolveria lá. Data URLs passam intactas.
  const logo = new URL(logoSrc(), window.location.href).href;
  const svgs = await Promise.all(withToken.map((p) => qrSvg(qrPayload(p))));

  const cards = withToken
    .map((p, i) => cardHTML(p, team, svgs[i], b, logo))
    .join('');

  const win = window.open('', '_blank');
  if (!win) {
    throw new Error('O browser bloqueou a janela de impressão. Autoriza as janelas para este site.');
  }

  win.document.write(`<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8" />
<title>Cartões QR${team ? ' — ' + esc(teamName(team)) : ''}</title>
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
    grid-template-columns: repeat(2, 85mm);
    gap: 4mm;
    justify-content: center;
    padding: 8mm 0;
  }
  .card {
    width: 85mm; height: 54mm;
    border: 0.3mm solid #c9d4de;
    border-radius: 3mm;
    background: #fff;
    padding: 4mm;
    display: flex;
    align-items: center;
    gap: 4mm;
    /* Nunca partir um cartão entre duas folhas. */
    break-inside: avoid; page-break-inside: avoid;
  }
  .card__qr { width: 34mm; height: 34mm; flex: none; }
  .card__qr svg { width: 100%; height: 100%; display: block; }
  .card__info { min-width: 0; flex: 1; }
  .card__club {
    display: flex; align-items: center; gap: 2mm;
    font-size: 8pt; font-weight: 600; color: ${cssColor(b.brand_primary)};
    text-transform: uppercase; letter-spacing: 0.04em;
    margin-bottom: 1.5mm;
  }
  .card__club img { width: 6mm; height: 6mm; object-fit: contain; }
  .card__name {
    font-size: 13pt; font-weight: 700; line-height: 1.15;
    margin: 0 0 1mm;
    /* Nomes longos partem em duas linhas em vez de rebentar o cartão. */
    overflow-wrap: anywhere;
  }
  .card__meta { font-size: 8.5pt; color: #5b6b7a; margin: 0; }
  .card__hint { font-size: 6.5pt; color: #8a98a5; margin: 2.5mm 0 0; }
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
    <span>${withToken.length} cartão${withToken.length === 1 ? '' : 'ões'}${team ? ' · ' + esc(teamName(team)) : ''} · imprime em papel grosso e plastifica</span>
  </div>
  <div class="sheet">${cards}</div>
</body>
</html>`);
  win.document.close();
  return withToken.length;
}

function cardHTML(player, team, svg, b, logo) {
  const meta = [
    player.number ? `Nº ${player.number}` : '',
    team ? teamName(team) : '',
    player.position || '',
  ].filter(Boolean).join(' · ');

  return `
    <div class="card">
      <div class="card__qr">${svg}</div>
      <div class="card__info">
        <div class="card__club">
          ${logo ? `<img src="${esc(logo)}" alt="" />` : ''}
          <span>${esc(b.club_name || b.app_name || 'Clube')}</span>
        </div>
        <p class="card__name">${esc(player.name)}</p>
        <p class="card__meta">${esc(meta || '—')}</p>
        <p class="card__hint">Passa este código no quiosque à entrada do treino.</p>
      </div>
    </div>
  `;
}

// A janela de impressão é um documento novo, sem as variáveis CSS da app:
// as cores da marca têm de ir como valor literal.
function cssColor(value) {
  return /^#[0-9a-f]{3,8}$/i.test(String(value || '')) ? value : '#143b61';
}
