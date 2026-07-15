// Onboarding do clube (multi-tenant).
//
// Mostrado a um utilizador autenticado que ainda não pertence a nenhum clube:
// cria o seu clube e torna-se coordenador. Quem chega por convite não vê este
// ecrã — o convite é resgatado automaticamente no arranque (ver app-shell).

import { createClub, dbErrorMessage } from '../store.js';
import { signOut } from '../auth.js';
import { esc } from '../ui.js';
import { logoSrc, branding } from '../branding.js';

export function renderOnboarding(root, onDone) {
  root.removeAttribute('aria-busy');
  const b = branding();

  root.innerHTML = `
    <main class="login">
      <form class="card login__card" id="onboarding-form" novalidate>
        <img class="login__logo" src="${esc(logoSrc())}" alt="" width="72" height="72" />
        <h1 class="section-title login__title">Bem-vindo à ${esc(b.app_name)}</h1>
        <p class="muted login__subtitle">
          Cria o teu clube para começar. Terás um período de demonstração
          gratuito e poderás convidar os teus treinadores.
        </p>

        <div class="field">
          <label for="club-name">Nome do clube</label>
          <input type="text" id="club-name" name="club-name" required
                 placeholder="Ex.: Clube Desportivo da Senhora da Hora" />
        </div>

        <p class="login__error hidden" id="onboarding-error" role="alert"></p>

        <button type="submit" class="btn btn--primary login__submit" id="onboarding-submit">
          Criar clube
        </button>
        <button type="button" class="btn btn--ghost btn--sm" id="onboarding-logout"
                style="margin-top:0.5rem">Sair</button>
      </form>
    </main>
  `;

  const form = root.querySelector('#onboarding-form');
  const errorEl = root.querySelector('#onboarding-error');
  const submitBtn = root.querySelector('#onboarding-submit');

  root.querySelector('#onboarding-logout').addEventListener('click', () => signOut());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.classList.add('hidden');
    const name = form['club-name'].value.trim();
    if (!name) {
      errorEl.textContent = 'Indica o nome do clube.';
      errorEl.classList.remove('hidden');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'A criar…';
    try {
      await createClub(name);
      onDone?.();
    } catch (error) {
      errorEl.textContent = dbErrorMessage(error);
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Criar clube';
    }
  });
}
