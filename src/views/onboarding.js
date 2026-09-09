// Onboarding do clube (multi-tenant).
//
// Mostrado a um utilizador autenticado que ainda não pertence a nenhum clube:
// cria o seu clube e torna-se coordenador. Quem chega por convite não devia
// ver este ecrã — o convite é resgatado no arranque (ver app-shell).
//
// "Não devia" não chega: quando o resgate falha (link expirado, ou o convite
// perdido entre o browser do WhatsApp e o do email), é AQUI que a pessoa
// aterra — e o que a app lhe propõe é criar um clube, que é exatamente o que
// ela não quer. Por isso este ecrã tem a saída de emergência: colar o link do
// convite e entrar no clube certo, sem passar por lado nenhum.

import { createClub, redeemInvitation, dbErrorMessage, TRIAL_DAYS } from '../store.js';
import { seedDemoData } from '../demo-data.js';
import { signOut } from '../auth.js';
import { esc } from '../ui.js';
import { logoSrc, branding } from '../branding.js';
import { SPORTS, DEFAULT_SPORT } from '../constants.js';

// `notice` — aviso a mostrar por cima do formulário (ex.: o convite que falhou
// no arranque). Sem ele, quem chegou aqui por um link gasto não tinha como
// saber que o link é que falhou, e criava um clube por engano.
export function renderOnboarding(root, onDone, { notice = '' } = {}) {
  root.removeAttribute('aria-busy');
  const b = branding();

  root.innerHTML = `
    <main class="login">
      <form class="card login__card" id="onboarding-form" novalidate>
        <img class="login__logo" src="${esc(logoSrc())}" alt="" width="72" height="72" />
        <h1 class="section-title login__title">Bem-vindo à ${esc(b.app_name)}</h1>
        ${notice ? `<p class="login__error" role="alert">${esc(notice)}</p>` : ''}
        <p class="muted login__subtitle">
          Cria o teu clube para começar. Tens <strong>${TRIAL_DAYS} dias</strong>
          gratuitos para experimentar tudo, e podes convidar os teus treinadores.
        </p>

        <div class="field">
          <label for="club-name">Nome do clube</label>
          <input type="text" id="club-name" name="club-name" required
                 placeholder="Ex.: Clube Desportivo da Senhora da Hora" />
        </div>

        <div class="field">
          <label for="club-sport">Modalidade</label>
          <select id="club-sport" name="club-sport">
            ${SPORTS.map((s) => `<option value="${esc(s.key)}" ${s.key === DEFAULT_SPORT ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
          </select>
          <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
            Define as posições sugeridas. Podes mudar e personalizar depois nas Definições.
          </p>
        </div>

        <div class="field">
          <label class="check" for="club-demo" style="display:flex;gap:0.5rem;align-items:flex-start;cursor:pointer">
            <input type="checkbox" id="club-demo" name="club-demo" checked
                   style="margin-top:0.2rem" />
            <span>
              Começar com dados de exemplo
              <span class="field__hint muted" style="display:block;font-size:0.82rem">
                Um plantel, um mês de treinos com presenças e jogos com resultado,
                para veres a app a funcionar antes de meteres os teus dados.
                Limpas tudo num clique nas Definições.
              </span>
            </span>
          </label>
        </div>

        <p class="login__error hidden" id="onboarding-error" role="alert"></p>

        <button type="submit" class="btn btn--primary login__submit" id="onboarding-submit">
          Criar clube
        </button>
        <button type="button" class="btn btn--ghost btn--sm" id="onboarding-logout"
                style="margin-top:0.5rem">Sair</button>
      </form>

      <div class="card login__card" style="margin-top:1rem">
        <h2 class="section-title" style="margin:0 0 0.4rem;font-size:1rem">Tens um convite do teu clube?</h2>
        <p class="muted" style="margin:0 0 0.8rem;font-size:0.86rem">
          Então não crias clube nenhum. Cola aqui o link que recebeste e entras
          direto para a tua ficha.
        </p>
        <div class="field">
          <label for="ob-invite">Link do convite</label>
          <input type="text" id="ob-invite" inputmode="url" autocomplete="off"
                 placeholder="https://…?invite=…" />
        </div>
        <p class="login__error hidden" id="ob-invite-error" role="alert"></p>
        <button type="button" class="btn btn--primary login__submit" id="ob-invite-go">
          Entrar com o convite
        </button>
      </div>
    </main>
  `;

  const form = root.querySelector('#onboarding-form');
  const errorEl = root.querySelector('#onboarding-error');
  const submitBtn = root.querySelector('#onboarding-submit');

  root.querySelector('#onboarding-logout').addEventListener('click', () => signOut());

  // Aceita o link inteiro ou só o token: quem cola de uma mensagem traz o
  // endereço todo, quem escreve à mão traz o código. Exigir uma das duas
  // formas era pôr o problema de volta na pessoa que já está perdida.
  const inviteInput = root.querySelector('#ob-invite');
  const inviteErr = root.querySelector('#ob-invite-error');
  const inviteBtn = root.querySelector('#ob-invite-go');

  inviteBtn.addEventListener('click', async () => {
    inviteErr.classList.add('hidden');
    const raw = inviteInput.value.trim();
    const token = (raw.match(/[?&]invite=([^&\s]+)/)?.[1] || raw).trim();
    if (!token) {
      inviteErr.textContent = 'Cola o link do convite.';
      inviteErr.classList.remove('hidden');
      return;
    }
    inviteBtn.disabled = true;
    inviteBtn.textContent = 'A entrar…';
    try {
      await redeemInvitation(decodeURIComponent(token));
      try { localStorage.removeItem('rcs.invite'); } catch { /* ignora */ }
      onDone?.();
    } catch (error) {
      inviteErr.textContent =
        'Esse convite não funcionou — pode ter expirado ou já ter sido usado. '
        + 'Pede um novo ao teu clube.';
      inviteErr.classList.remove('hidden');
      console.warn('Convite recusado:', error?.message);
      inviteBtn.disabled = false;
      inviteBtn.textContent = 'Entrar com o convite';
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.classList.add('hidden');
    const name = form['club-name'].value.trim();
    if (!name) {
      errorEl.textContent = 'Indica o nome do clube.';
      errorEl.classList.remove('hidden');
      return;
    }
    const sport = form['club-sport'].value || DEFAULT_SPORT;
    submitBtn.disabled = true;
    submitBtn.textContent = 'A criar…';
    try {
      await createClub(name, sport);
      // Os dados de exemplo são um extra: se falharem (por exemplo, porque a
      // migração `dados-exemplo.sql` ainda não correu), o clube já existe e o
      // utilizador entra na mesma — vazio é mau, mas ficar preso é pior.
      if (form['club-demo']?.checked) {
        submitBtn.textContent = 'A preparar o clube…';
        try {
          await seedDemoData();
        } catch (seedErr) {
          console.warn('Dados de exemplo não criados:', seedErr);
        }
      }
      onDone?.();
    } catch (error) {
      errorEl.textContent = dbErrorMessage(error);
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Criar clube';
    }
  });
}
