// Notificações efémeras ("toasts") — confirmação visível de que uma ação
// resultou (ou falhou).
//
// Porquê: as vistas re-desenham-se sozinhas depois de gravar (ver store.js), o
// que é correto mas silencioso — quem grava não tem forma de saber se o clique
// fez alguma coisa. O toast dá essa confirmação sem interromper o trabalho.
//
// Uso: `toastOk('Atleta guardado.')` / `toastError('Não foi possível guardar.')`

import { esc } from './ui.js';

let host = null;

// Contentor único, criado à primeira utilização. É uma região `polite` para
// que os leitores de ecrã anunciem a mensagem sem cortar o que estão a ler.
function ensureHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement('div');
  host.className = 'toast-host';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

const ICONS = {
  ok: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
};

// Evita repetir a mesma mensagem quando uma ação dispara vários avisos
// seguidos (ex.: gravações em lote).
let lastMessage = '';
let lastAt = 0;

export function toast(message, { type = 'ok', duration = 3400 } = {}) {
  if (!message) return;
  const now = Date.now();
  if (message === lastMessage && now - lastAt < 800) return;
  lastMessage = message;
  lastAt = now;

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${ICONS[type] || ICONS.info}</span>
    <span class="toast__text">${esc(message)}</span>
    <button class="toast__close" type="button" aria-label="Fechar aviso">&times;</button>
  `;

  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('toast--out');
    // Espera a animação de saída; o fallback garante a remoção mesmo com
    // `prefers-reduced-motion` (onde a animação não corre).
    const done = () => el.remove();
    el.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400);
  };

  el.querySelector('.toast__close').addEventListener('click', remove);
  ensureHost().appendChild(el);

  // Os erros ficam mais tempo — costumam exigir uma ação de quem os lê.
  setTimeout(remove, type === 'error' ? Math.max(duration, 6000) : duration);
  return remove;
}

export const toastOk = (message) => toast(message, { type: 'ok' });
export const toastError = (message) => toast(message, { type: 'error' });
export const toastInfo = (message) => toast(message, { type: 'info' });
