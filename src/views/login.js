// Ecrã de autenticação. Dois modos: iniciar sessão e criar conta.
// É o primeiro ecrã: nada da aplicação é visível sem sessão.

import { signIn, signUp, requestPasswordReset, authErrorMessage } from '../auth.js';
import { esc } from '../ui.js';
import { logoSrc, branding } from '../branding.js';

export function renderLogin(root, onSuccess) {
  let mode = 'login'; // 'login' | 'register' | 'reset'
  root.removeAttribute('aria-busy');

  const submitLabel = () =>
    mode === 'login' ? 'Entrar' : mode === 'register' ? 'Criar conta' : 'Enviar link';

  function draw() {
    const isLogin = mode === 'login';
    const isReset = mode === 'reset';
    const b = branding();
    root.innerHTML = `
      <main class="login">
        <form class="card login__card" id="login-form" novalidate>
          <img class="login__logo" src="${esc(logoSrc())}" alt="${esc(b.club_name)}" width="84" height="84" />
          <h1 class="section-title login__title">${esc(b.app_name)}</h1>
          <p class="muted login__subtitle">${esc(b.motto)}</p>

          ${isReset ? '' : `
          <div class="login__tabs" role="tablist">
            <button type="button" class="login__tab ${isLogin ? 'login__tab--active' : ''}"
                    data-mode="login" role="tab" aria-selected="${isLogin}">Entrar</button>
            <button type="button" class="login__tab ${!isLogin ? 'login__tab--active' : ''}"
                    data-mode="register" role="tab" aria-selected="${!isLogin}">Criar conta</button>
          </div>`}

          ${isReset ? `
          <p class="muted login__subtitle" style="margin-top:0">
            Escreve o teu email e enviamos-te um link para definires uma nova
            palavra-passe.
          </p>` : ''}

          <div class="field">
            <label for="email">Email</label>
            <input type="email" id="email" name="email" autocomplete="username"
                   required placeholder="o.teu@email.pt" />
          </div>

          ${isReset ? '' : `
          <div class="field">
            <label for="password">Palavra-passe</label>
            <div class="input-reveal">
              <input type="password" id="password" name="password"
                     autocomplete="${isLogin ? 'current-password' : 'new-password'}"
                     required minlength="6" placeholder="••••••••" />
              <button type="button" class="input-reveal__btn" id="toggle-password"
                      aria-label="Mostrar palavra-passe" aria-pressed="false">Mostrar</button>
            </div>
            ${isLogin ? '' : '<span class="login__hint-inline muted">Mínimo 6 caracteres.</span>'}
          </div>`}

          <p class="login__error hidden" id="login-error" role="alert"></p>
          <p class="login__ok hidden" id="login-ok" role="status"></p>

          <button type="submit" class="btn btn--primary login__submit" id="login-submit">
            ${submitLabel()}
          </button>

          <button type="button" class="btn btn--ghost btn--sm login__link" data-mode="${isReset ? 'login' : 'reset'}">
            ${isReset ? 'Voltar a iniciar sessão' : 'Esqueci-me da palavra-passe'}
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

      // Recuperação: só precisa do email.
      if (mode === 'reset') {
        if (!email) {
          showError('Escreve o teu email.');
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = 'A enviar…';
        try {
          await requestPasswordReset(email);
          mode = 'login';
          draw();
          // Mensagem igual quer a conta exista ou não — não revela que emails
          // estão registados.
          showOk('Se existir uma conta com esse email, enviámos-te o link para definires uma nova palavra-passe.');
        } catch (error) {
          showError(authErrorMessage(error));
          submitBtn.disabled = false;
          submitBtn.textContent = submitLabel();
        }
        return;
      }

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
        submitBtn.textContent = submitLabel();
      }
    });

    // Mostrar/esconder a palavra-passe — evita o ciclo de "escrevi mal, tento
    // outra vez" às cegas, sobretudo no telemóvel.
    const toggle = root.querySelector('#toggle-password');
    toggle?.addEventListener('click', () => {
      const input = root.querySelector('#password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.textContent = show ? 'Esconder' : 'Mostrar';
      toggle.setAttribute('aria-pressed', String(show));
      toggle.setAttribute('aria-label', show ? 'Esconder palavra-passe' : 'Mostrar palavra-passe');
      input.focus();
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
