// Painel do guia de entrada de uma equipa (Plantéis → Guia de entrada).
//
// Uma mensagem só, para todo o escalão: os passos comuns (instalar, ligar
// notificações, entrar no grupo) que estavam a ser explicados pessoa a pessoa.
// O que continua a ser pessoal — o link de convite de cada atleta — sai de
// "Convidar para o portal", e é dito aqui de propósito, para ninguém ficar à
// espera que este guia dê acesso a alguém.

import { state } from '../store.js';
import { esc, safeUrl } from '../ui.js';
import { wireDialog } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import { teamName } from '../compute.js';
import { joinMessage } from '../join-guide.js';

export function openJoinGuide(teamId) {
  const team = state.teams.find((t) => t.id === teamId) || null;
  // O link só conta se for mesmo http(s) — a mesma regra do plano de treino.
  // Um endereço mal escrito não pode virar um passo que ninguém consegue abrir.
  const groupUrl = safeUrl(team?.whatsapp_url);
  const text = joinMessage(team, groupUrl);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-labelledby="guia-title">
      <div class="modal__head">
        <h2 class="section-title" id="guia-title">Guia de entrada${team ? ` — ${esc(teamName(team))}` : ''}</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>

      <p class="muted" style="margin:0 0 0.7rem">
        A mesma mensagem para todo o escalão: instalar a app, ligar as notificações
        e entrar no grupo. O <strong>link pessoal</strong> de cada atleta continua a
        sair de “Convidar para o portal”.
      </p>

      ${groupUrl ? '' : `
        <p class="modal__error" style="margin:0 0 0.7rem">
          Esta equipa ainda não tem link do grupo de WhatsApp — edita a equipa para
          o acrescentar. O guia segue à mesma, sem esse passo.
        </p>`}

      <pre class="guia-msg" id="guia-msg">${esc(text)}</pre>

      <div class="modal__actions">
        <button class="btn btn--ghost" id="guia-print" type="button">Cartaz para imprimir</button>
        <button class="btn btn--ghost" id="guia-copy" type="button">Copiar mensagem</button>
        <button class="btn btn--accent" id="guia-send" type="button">Enviar por WhatsApp</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay, { initialFocus: '#guia-copy' });

  overlay.querySelector('#guia-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(text).then(
      () => toastOk('Mensagem copiada.'),
      () => toastError('O browser não deixou copiar. Seleciona o texto e copia à mão.')
    );
  });

  // Abre o WhatsApp com o texto escrito e deixa escolher o grupo. Não se
  // envia nada pelas costas de ninguém — quem carrega vê a mensagem antes de
  // a mandar (mesma regra dos convites).
  overlay.querySelector('#guia-send').addEventListener('click', () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  });

  overlay.querySelector('#guia-print').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'A gerar…';
    try {
      const { openJoinPoster } = await import('../join-poster.js');
      await openJoinPoster({ team, groupUrl });
    } catch (err) {
      toastError(err?.message || 'Não foi possível gerar o cartaz.');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  return close;
}
