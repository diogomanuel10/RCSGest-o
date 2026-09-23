// A agenda da fisioterapia no Google Calendar (ou no calendário do iPhone),
// por um link de SUBSCRIÇÃO — ver supabase/calendario-subscricao.sql e a
// Edge Function `calendar-feed`.
//
// Subscrição e não exportação: um .ics descarregado é uma fotografia, que não
// sabe quando um atendimento muda ou é cancelado — e a fisio acabava com duas
// agendas a dizer coisas diferentes. Com o link, o calendário vai buscar a
// agenda sozinho.
//
// O link É a credencial (quem o tem lê a agenda), por isso: só nasce quando
// alguém o pede, troca-se num clique e desliga-se noutro. O diálogo di-lo.

import {
  getCalendarFeed, rotateCalendarFeed, revokeCalendarFeed, calendarFeedUrl, dbErrorMessage,
} from '../store.js';
import { wireDialog, confirmDialog } from '../modal.js';
import { toastOk, toastError } from '../toast.js';
import { esc } from '../ui.js';

export function openCalendarSync() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="sync-title" style="width:min(560px,96vw)">
      <div class="modal__head">
        <h2 id="sync-title">Agenda no teu calendário</h2>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div id="sync-body"><p class="muted">A carregar…</p></div>
    </div>
  `;
  wireDialog(overlay);
  const body = overlay.querySelector('#sync-body');

  const paint = (token) => {
    body.innerHTML = token ? linkedHTML(token) : emptyHTML();
    wire(token);
  };

  const run = async (fn, okMsg) => {
    body.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try {
      const token = await fn();
      if (okMsg) toastOk(okMsg);
      paint(token);
    } catch (err) {
      toastError(dbErrorMessage(err));
      body.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    }
  };

  function wire(token) {
    body.querySelector('[data-sync-create]')?.addEventListener('click', () =>
      run(rotateCalendarFeed, 'Link criado.'));

    body.querySelector('[data-sync-copy]')?.addEventListener('click', () => {
      const url = calendarFeedUrl(token);
      navigator.clipboard?.writeText(url).then(
        () => toastOk('Link copiado.'),
        () => {
          // Sem acesso ao clipboard (http, browser antigo): o campo fica
          // selecionado para copiar à mão.
          const input = body.querySelector('#sync-url');
          input?.focus();
          input?.select();
        },
      );
    });

    body.querySelector('[data-sync-rotate]')?.addEventListener('click', async () => {
      const ok = await confirmDialog(
        'O link atual deixa de funcionar e o calendário onde o colaste deixa de receber a agenda. Vais ter de adicionar o novo. Continuar?',
        { confirmLabel: 'Gerar novo link' },
      );
      if (ok) run(rotateCalendarFeed, 'Link novo criado. Adiciona-o outra vez ao calendário.');
    });

    body.querySelector('[data-sync-revoke]')?.addEventListener('click', async () => {
      const ok = await confirmDialog(
        'O link deixa de funcionar. O calendário onde o adicionaste fica com a agenda antiga até o apagares de lá.',
        { confirmLabel: 'Desligar' },
      );
      if (ok) run(async () => { await revokeCalendarFeed(); return null; }, 'Sincronização desligada.');
    });
  }

  getCalendarFeed()
    .then(paint)
    .catch((err) => {
      body.innerHTML = `<p class="modal__error">${esc(dbErrorMessage(err))}</p>`;
    });
}

// O que a pessoa lê antes de decidir: o que vai para fora (e o que não vai),
// e quanto tempo o Google demora a atualizar — sem isto, a primeira mudança
// que não aparece no telemóvel lê-se como avaria.
const WHAT_GOES = `
  <ul class="sync-facts">
    <li>Vão os <strong>atendimentos</strong>: dia, hora, local, tipo e o nome da atleta abreviado (“Beatriz S.”).</li>
    <li><strong>Nada de clínico</strong>: nem notas, nem episódio, nem diagnóstico.</li>
    <li>Quem avisou que não pode aparece com <strong>⚠ Não pode</strong>.</li>
    <li>O Google atualiza estes calendários sozinho, mas quando quer — <strong>algumas horas</strong> de atraso é normal. Para mudanças em cima da hora, contam as notificações da Rumia.</li>
  </ul>
`;

function emptyHTML() {
  return `
    <p style="margin-top:0">
      Vê os teus atendimentos no calendário do telemóvel, junto com o resto da
      tua vida — sem os copiar à mão. Crias um link, adicionas uma vez, e o
      calendário mantém-se atualizado.
    </p>
    ${WHAT_GOES}
    <div class="modal__actions">
      <button class="btn btn--accent" data-sync-create type="button">Criar link</button>
    </div>
  `;
}

function linkedHTML(token) {
  const url = calendarFeedUrl(token);
  const webcal = url.replace(/^https?:/, 'webcal:');
  // O `cid` abre o "Adicionar calendário" do Google já com o link. Aceita o
  // endereço em webcal://, que é o que o identifica como subscrição.
  const google = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;
  return `
    <div class="sync-actions">
      <a class="btn btn--accent" href="${esc(google)}" target="_blank" rel="noopener">Adicionar ao Google Calendar</a>
      <a class="btn btn--ghost" href="${esc(webcal)}">iPhone / outro calendário</a>
    </div>

    <div class="field field--full" style="margin-top:0.9rem">
      <label for="sync-url">O teu link</label>
      <div class="sync-url">
        <input id="sync-url" type="text" readonly value="${esc(url)}" />
        <button class="btn btn--ghost btn--sm" data-sync-copy type="button">Copiar</button>
      </div>
      <p class="field__hint">
        No Google Calendar do computador também dá: <em>Outros calendários → + → A partir do URL</em>, e colas isto.
        <strong>Não partilhes este link</strong> — quem o tiver vê a tua agenda.
      </p>
    </div>

    ${WHAT_GOES}

    <div class="modal__actions sync-danger">
      <button class="btn btn--ghost btn--sm" data-sync-rotate type="button">Gerar novo link</button>
      <button class="btn btn--danger btn--sm" data-sync-revoke type="button">Desligar</button>
    </div>
  `;
}
