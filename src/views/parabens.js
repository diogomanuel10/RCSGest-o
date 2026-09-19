// Diálogo de aniversário: quem faz anos, como se lhe fala e a mensagem pronta.
//
// A linha de aniversários do Painel dizia o nome próprio e o dia, e mais nada.
// A partir dali, felicitar alguém eram cinco passos noutros ecrãs: abrir os
// Plantéis, encontrar a ficha certa entre vinte, copiar o contacto do
// encarregado, mudar para o telemóvel e escrever do zero. Cinco passos para um
// gesto de trinta segundos é um gesto que se deixa de fazer.
//
// Aqui está o que decide esse gesto — o nome INTEIRO (o cabeçalho tinha só o
// primeiro, e num clube há duas Marias), o escalão e o contacto da família — e,
// para o coordenador, a mensagem já escrita.
//
// **Quem faz anos vê-se no clube inteiro** — é o que o `birthdayScope()` em
// `compute.js` diz, e é por isso que este cartão chega à fisio, ao preparador
// e ao treinador dos infantis que cruza a Carolina todas as terças. Dar os
// parabéns é a coisa mais pública que um clube faz.
//
// **A MENSAGEM é só do coordenador** (`isCoordenador`). Não é uma permissão
// de dados — é sobre quem fala em nome do clube: uma mensagem assinada pelo
// clube, mandada por três pessoas diferentes ao mesmo encarregado, deixa de
// ser uma mensagem do clube.
//
// **O contacto segue a ficha, não o aniversário.** Ver que hoje é o dia da
// Carolina e ter o telefone da mãe dela são duas coisas: o segundo já vive na
// ficha, com a permissão da ficha, e esta linha não pode ser a porta lateral
// que o entrega a quem não a pode abrir. Quem já vê os Plantéis (ou a
// Fisioterapia, ou a Prep. física) vê-o aqui; os outros veem o aniversário e
// mais nada.

import { esc } from '../ui.js';
import { wireDialog } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import { teamName } from '../compute.js';
import { isCoordenador, canAccess } from '../permissions.js';
import { birthdayMessage } from '../birthday-message.js';
import { contactChannel, sendVia } from '../sizes-message.js';
import { branding } from '../branding.js';
import { openAthleteProfile } from './athlete-profile.js';

function whenLabel(days) {
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  return `Daqui a ${days} dias`;
}

// `list` são as linhas de `upcomingBirthdays()`: { player, team, date, days,
// turning }. Recebe-se a lista já calculada, e não o id de um atleta, porque o
// cabeçalho mostra três nomes e quem carrega na linha pode querer qualquer um
// deles — abrir o diálogo no primeiro obrigava a fechá-lo e a ir procurar os
// outros aos Plantéis.
export function openBirthdayCard(list) {
  if (!list?.length) return null;
  let i = 0;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="bc-title"
         style="width:min(560px,96vw);max-height:90vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <h2 class="section-title" id="bc-title">🎂 Aniversários</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      ${list.length > 1 ? `
        <div class="mode-toggle" role="group" aria-label="Quem faz anos" id="bc-pick"
             style="flex-wrap:wrap;max-width:100%">
          ${list.map((b, n) => `
            <button class="mode-toggle__btn${n === 0 ? ' is-active' : ''}" type="button"
                    data-bc-pick="${n}" aria-pressed="${n === 0}">${esc(b.player.name.split(/\s+/)[0])}</button>
          `).join('')}
        </div>` : ''}
      <div id="bc-body" style="overflow-y:auto;flex:1"></div>
      <div class="modal__actions" id="bc-actions"></div>
    </div>
  `;

  const close = wireDialog(overlay);

  function paint() {
    const b = list[i];
    const { player, team } = b;
    const equipa = team ? teamName(team) : '';
    const ch = contactChannel(player.guardian_contact);
    // Quem já chega à ficha pelos caminhos normais — é lá que o contacto
    // vive, e é de lá que esta linha o lê.
    const veFicha = canAccess('planteis') || canAccess('medico') || canAccess('fisica');
    // A mensagem constrói-se a cada pintura e não uma vez no arranque: o
    // "hoje / amanhã / no próximo dia 24" é do atleta escolhido, e reutilizar
    // o texto do anterior era mandar à família da Catarina a data da Carolina.
    const texto = isCoordenador()
      ? birthdayMessage({
          player,
          team: equipa,
          turning: b.turning,
          days: b.days,
          date: b.date,
          clubName: branding().club_name || '',
        })
      : '';

    overlay.querySelector('#bc-body').innerHTML = `
      <section class="pd-section">
        <span class="pd-label">Atleta</span>
        <p style="margin:0.15rem 0 0;font-size:1.05rem"><strong>${esc(player.name)}</strong></p>
        <p class="muted" style="margin:0.15rem 0 0;font-size:0.88rem">
          ${equipa ? `${esc(equipa)} · ` : ''}${esc(whenLabel(b.days))} · faz ${b.turning} anos
        </p>
      </section>

      ${veFicha ? `
        <section class="pd-section">
          <span class="pd-label">Contacto do encarregado</span>
          ${player.guardian_contact
            ? `<p style="margin:0.15rem 0 0">${esc(player.guardian_contact)}</p>`
            : `<p class="muted" style="margin:0.15rem 0 0">
                 Esta ficha não tem contacto.${texto ? ' Podes copiar a mensagem e mandá-la pelo caminho que já usas com a família.' : ''}
               </p>`}
        </section>` : ''}

      ${texto ? `
        <section class="pd-section">
          <span class="pd-label">Mensagem de parabéns</span>
          <pre class="guia-msg" id="bc-msg">${esc(texto)}</pre>
        </section>` : ''}
    `;

    // As ações dependem do atleta escolhido (há contacto? é WhatsApp ou
    // email?), por isso redesenham-se com o corpo.
    overlay.querySelector('#bc-actions').innerHTML = `
      ${veFicha ? '<button class="btn btn--ghost" type="button" id="bc-ficha">Ver ficha</button>' : ''}
      ${texto ? '<button class="btn btn--ghost" type="button" id="bc-copy">Copiar mensagem</button>' : ''}
      ${texto && ch
        ? `<button class="btn btn--accent" type="button" id="bc-send">Enviar por ${ch.kind === 'email' ? 'email' : 'WhatsApp'}</button>`
        : '<button class="btn btn--primary" type="button" id="bc-close">Fechar</button>'}
    `;

    overlay.querySelector('#bc-ficha')?.addEventListener('click', () => {
      close();
      openAthleteProfile(player.id);
    });
    overlay.querySelector('#bc-close')?.addEventListener('click', close);
    overlay.querySelector('#bc-copy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(texto).then(
        () => toastOk('Mensagem copiada.'),
        () => toastError('O browser não deixou copiar. Seleciona o texto e copia à mão.')
      );
    });
    // Nada sai pelas costas de ninguém: abre-se a app do canal com o texto
    // escrito, e quem carrega vê a mensagem antes de a mandar.
    overlay.querySelector('#bc-send')?.addEventListener('click', () => {
      sendVia(ch, { subject: `Parabéns, ${player.name.split(/\s+/)[0]}!`, text: texto });
    });
  }

  overlay.querySelectorAll('[data-bc-pick]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const n = Number(btn.dataset.bcPick);
      if (n === i) return;
      i = n;
      overlay.querySelectorAll('[data-bc-pick]').forEach((x) => {
        const on = Number(x.dataset.bcPick) === i;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-pressed', String(on));
      });
      paint();
    })
  );

  paint();
  return close;
}
