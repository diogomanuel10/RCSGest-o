// Cartaz de entrada no portal — A4 para afixar no pavilhão.
//
// A mensagem no grupo chega a quem está no grupo. O cartaz à porta do
// balneário chega ao pai que veio buscar a filha e nunca leu o grupo, e ao
// atleta que entrou a meio da época — que são exatamente as pessoas que ficam
// de fora do portal quando isto se explica só por mensagem.
//
// Não leva NENHUM link pessoal: um cartaz é público, e o link de convite está
// ligado a uma ficha. Leva os passos comuns e dois códigos — o da app e o do
// grupo do escalão.

import { esc, appUrl } from './ui.js';
import { qrSvg } from './qrcode.js';
import { teamName } from './compute.js';
import { openSheet, section } from './report-sheet.js';
import { joinSteps } from './join-guide.js';

export async function openJoinPoster({ team, groupUrl }) {
  const url = appUrl();
  const steps = joinSteps({ groupUrl, url });

  // Os dois QR são gerados antes de abrir a janela: a biblioteca carrega
  // dinamicamente e a folha é escrita de uma vez só.
  const [appQr, groupQr] = await Promise.all([
    qrSvg(url),
    groupUrl ? qrSvg(groupUrl) : Promise.resolve(null),
  ]);

  openSheet({
    title: 'Acesso ao portal',
    subtitle: team ? teamName(team) : 'Portal do atleta',
    body: `
      <style>
        .jp-intro { font-size: 11pt; margin: 0 0 5mm; }
        .jp-steps { list-style: none; margin: 0; padding: 0; counter-reset: jp; }
        .jp-step {
          display: flex; gap: 4mm; align-items: flex-start;
          padding: 3mm 0; border-bottom: 0.2mm solid #eef2f6;
          break-inside: avoid; page-break-inside: avoid;
        }
        .jp-step:last-child { border-bottom: 0; }
        .jp-step__n {
          counter-increment: jp; flex: none;
          width: 9mm; height: 9mm; border-radius: 50%;
          background: #eef2f6; color: #1a2636;
          font-size: 12pt; font-weight: 700;
          display: flex; align-items: center; justify-content: center;
        }
        .jp-step__n::before { content: counter(jp); }
        .jp-step__title { font-size: 12pt; font-weight: 700; margin: 0 0 1mm; }
        .jp-step__line { font-size: 10pt; margin: 0 0 0.8mm; overflow-wrap: anywhere; }
        .jp-codes { display: flex; gap: 6mm; flex-wrap: wrap; }
        .jp-code { flex: 1 1 55mm; text-align: center; }
        .jp-code svg { width: 40mm; height: 40mm; display: block; margin: 0 auto 2mm; }
        .jp-code__label { font-size: 10pt; font-weight: 700; margin: 0; }
        .jp-code__url {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 7.5pt; color: #617080; margin: 0.8mm 0 0; overflow-wrap: anywhere;
        }
      </style>

      <p class="jp-intro">
        Treinos e jogos, convocatórias, presenças e quotas — tudo no telemóvel.
        Aponta a câmara a um dos códigos e segue os passos.
      </p>

      ${section('Como entras', `
        <ol class="jp-steps">
          ${steps.map((s) => `
            <li class="jp-step">
              <span class="jp-step__n" aria-hidden="true"></span>
              <div>
                <p class="jp-step__title">${esc(s.title)}</p>
                ${s.lines.map((l) => `<p class="jp-step__line">${esc(l)}</p>`).join('')}
              </div>
            </li>`).join('')}
        </ol>
      `, 'O link de acesso é pessoal e chega a cada atleta em separado — não há aqui nenhum link de conta.')}

      ${section('Códigos', `
        <div class="jp-codes">
          <div class="jp-code">
            ${appQr}
            <p class="jp-code__label">Abrir a app</p>
            <p class="jp-code__url">${esc(url)}</p>
          </div>
          ${groupQr ? `
            <div class="jp-code">
              ${groupQr}
              <p class="jp-code__label">Grupo${team ? ' do ' + esc(teamName(team)) : ''}</p>
              <p class="jp-code__url">${esc(groupUrl)}</p>
            </div>` : ''}
        </div>
      `)}
    `,
  });
}
