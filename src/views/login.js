// Ecrã de autenticação. Dois modos: iniciar sessão e criar conta.
// É o primeiro ecrã: nada da aplicação é visível sem sessão.

import { signIn, signUp, authErrorMessage } from '../auth.js';
import { logoUrl } from '../ui.js';

export function renderLogin(root, onSuccess) {
  let mode = 'login'; // 'login' | 'register'
  root.removeAttribute('aria-busy');

  function draw() {
    const isLogin = mode === 'login';
    root.innerHTML = `
      <main class="login">
        <form class="card login__card" id="login-form" novalidate>
          <img class="login__logo" src="${logoUrl}" alt="Real Clube Senhorense" width="84" height="84" />
          <h1 class="section-title login__title">Central RCS</h1>
          <p class="muted login__subtitle">Gestão do Real Clube Senhorense</p>

          <div class="login__tabs" role="tablist">
            <button type="button" class="login__tab ${isLogin ? 'login__tab--active' : ''}"
                    data-mode="login" role="tab" aria-selected="${isLogin}">Entrar</button>
            <button type="button" class="login__tab ${!isLogin ? 'login__tab--active' : ''}"
                    data-mode="register" role="tab" aria-selected="${!isLogin}">Criar conta</button>
          </div>

          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" autocomplete="username"
                   required placeholder="o.teu@email.pt" />
          </div>

          <div class="field">
            <label for="password">Palavra-passe</label>
            <input type="password" id="password" name="password"
                   autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                   required minlength="6" placeholder="••••••••" />
            ${isLogin ? '' : '<span class="login__hint-inline muted">Mínimo 6 caracteres.</span>'}
          </div>

          <p class="login__error hidden" id="login-error" role="alert"></p>
          <p class="login__ok hidden" id="login-ok" role="status"></p>

          <button type="submit" class="btn btn--primary login__submit" id="login-submit">
            ${isLogin ? 'Entrar' : 'Criar conta'}
          </button>
        </form>
      </main>
    `;

    const form = root.querySelector('#login-form');
    const errorEl = root.querySelector('#login-error');
    const okEl = root.querySelector('#login-ok');
    const submitBtn = root.querySelector('#login-submit');

    root.querySelectorAll('[data-mode]').forEach((btn) =>
      btn.addEventListener('click', () => {
        if (btn.dataset.mode !== mode) {
          mode = btn.dataset.mode;
          draw();
        }
      })
    );

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorEl.classList.add('hidden');
      okEl.classList.add('hidden');

      const email = form.email.value;
      const password = form.password.value;
      if (!email || !password) {
        showError('Preenche o email e a palavra-passe.');
        return;
      }
      if (mode === 'register' && password.length < 6) {
        showError('A palavra-passe tem de ter pelo menos 6 caracteres.');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'login' ? 'A entrar…' : 'A criar conta…';
      try {
        if (mode === 'login') {
          await signIn(email, password);
          onSuccess?.(); // a transição é tratada pelo onAuthChange
        } else {
          const { needsConfirmation } = await signUp(email, password);
          if (needsConfirmation) {
            // Conta criada, mas é preciso confirmar o email antes de entrar.
            form.reset();
            mode = 'login';
            draw();
            showOk(
              'Conta criada! Confirma o email que recebeste e depois inicia sessão.'
            );
          } else {
            onSuccess?.(); // sessão imediata (confirmação de email desativada)
          }
        }
      } catch (error) {
        showError(authErrorMessage(error));
        resetButton();
      }

      function resetButton() {
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Criar conta';
      }
    });

    function showError(message) {
      errorEl.textContent = message;
      errorEl.classList.remove('hidden');
    }
    // Nota: showOk é chamado após um redraw, por isso procura o elemento atual.
    function showOk(message) {
      const el = root.querySelector('#login-ok');
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }

  draw();
}
