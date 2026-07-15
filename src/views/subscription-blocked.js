// Ecrã de acesso bloqueado (multi-tenant).
//
// Mostrado quando a organização do utilizador não pode usar a app: período de
// demonstração terminado, subscrição suspensa ou cancelada. O acesso aos dados
// é, ainda assim, recusado pelo RLS — isto é apenas a explicação ao utilizador.

import { signOut } from '../auth.js';
import { esc } from '../ui.js';
import { logoSrc, branding } from '../branding.js';

const MESSAGES = {
  trial_expirado: {
    icon: '⏳',
    title: 'O período de demonstração terminou',
    body: 'Obrigado por experimentares a Rumia! Para continuares a usar a app com o teu clube, contacta-nos para ativar a subscrição.',
  },
  suspensa: {
    icon: '⛔',
    title: 'Subscrição suspensa',
    body: 'O acesso ao teu clube está temporariamente suspenso. Contacta-nos para regularizar a situação e reativar a conta.',
  },
  cancelada: {
    icon: '🔒',
    title: 'Conta encerrada',
    body: 'A subscrição deste clube foi cancelada. Se quiseres voltar a usar a Rumia, fala connosco.',
  },
};

export function renderSubscriptionBlocked(root, reason) {
  root.removeAttribute('aria-busy');
  const b = branding();
  const m = MESSAGES[reason] || MESSAGES.suspensa;

  root.innerHTML = `
    <main class="login">
      <div class="card login__card" style="text-align:center">
        <img class="login__logo" src="${esc(logoSrc())}" alt="" width="72" height="72" />
        <div class="state">
          <span class="state__icon" aria-hidden="true">${m.icon}</span>
          <h1 class="section-title" style="margin-bottom:0.4rem">${esc(m.title)}</h1>
          <p class="muted" style="margin:0 0 1rem">${esc(m.body)}</p>
        </div>
        <a class="btn btn--primary" href="mailto:diomanuel10@gmail.com?subject=${encodeURIComponent('Subscrição Rumia — ' + b.club_name)}">
          Contactar
        </a>
        <button type="button" class="btn btn--ghost btn--sm" id="blocked-logout"
                style="margin-top:0.5rem">Sair</button>
      </div>
    </main>
  `;

  root.querySelector('#blocked-logout').addEventListener('click', () => signOut());
}
