// Ecrã de login. É o primeiro ecrã: nada da aplicação é visível sem sessão.

import { signIn, authErrorMessage } from '../auth.js';
import { logoUrl } from '../ui.js';

export function renderLogin(root, onSuccess) {
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <main class="login">
      <form class="card login__card" id="login-form" novalidate>
        <img class="login__logo" src="${logoUrl}" alt="Real Clube Senhorense" width="84" height="84" />
        <h1 class="section-title login__title">Central RCS</h1>
        <p class="muted login__subtitle">Gestão do Real Clube Senhorense</p>

        <div class="field">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" autocomplete="username"
                 required placeholder="o.teu@email.pt" />
        </div>

        <div class="field">
          <label for="password">Palavra-passe</label>
          <input type="password" id="password" name="password"
                 autocomplete="current-password" required placeholder="••••••••" />
        </div>

        <p class="login__error hidden" id="login-error" role="alert"></p>

        <button type="submit" class="btn btn--primary login__submit" id="login-submit">
          Entrar
        </button>

        <p class="muted login__hint">
          Sem registo aqui — as contas são criadas no painel do Supabase.
        </p>
      </form>
    </main>
  `;

  const form = root.querySelector('#login-form');
  const errorEl = root.querySelector('#login-error');
  const submitBtn = root.querySelector('#login-submit');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.classList.add('hidden');

    const email = form.email.value;
    const password = form.password.value;
    if (!email || !password) {
      showError('Preenche o email e a palavra-passe.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'A entrar…';
    try {
      await signIn(email, password);
      // O estado de sessão é tratado pelo onAuthChange em main.js,
      // mas chamamos onSuccess para uma transição imediata.
      onSuccess?.();
    } catch (error) {
      showError(authErrorMessage(error));
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  });

  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}
