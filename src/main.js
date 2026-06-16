// Ponto de entrada da Central RCS.
//
// Fluxo de arranque:
//   1. Sem variáveis do Supabase -> ecrã de ajuda.
//   2. Sem sessão -> ecrã de login.
//   3. Com sessão -> aplicação (layout + vistas, construído nas Fases seguintes).

import './style.css';
import { isConfigured } from './supabase.js';
import { getSession, signOut, onAuthChange } from './auth.js';
import { renderConfigHelp } from './views/config-help.js';
import { renderLogin } from './views/login.js';
import { loadingHTML, errorHTML } from './ui.js';

const root = document.querySelector('#app');

// Decide o que mostrar consoante exista (ou não) sessão.
function route(session) {
  if (session) {
    renderApp(session);
  } else {
    renderLogin(root, () => {
      /* a transição é tratada pelo onAuthChange */
    });
  }
}

// Placeholder da aplicação autenticada (substituído pelo layout na Fase 4).
function renderApp(session) {
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <main class="login">
      <div class="card login__card" style="text-align:center">
        <h1 class="section-title">Central RCS</h1>
        <p class="muted">Sessão iniciada como <strong>${session.user.email}</strong>.</p>
        <p class="muted">O painel e as restantes vistas chegam na próxima fase.</p>
        <button class="btn btn--ghost" id="logout-btn">Sair</button>
      </div>
    </main>
  `;
  root.querySelector('#logout-btn').addEventListener('click', async () => {
    await signOut();
  });
}

async function boot() {
  if (!isConfigured) {
    renderConfigHelp(root);
    return;
  }

  root.innerHTML = loadingHTML('A verificar a sessão…');

  try {
    const session = await getSession();
    route(session);
  } catch (error) {
    root.innerHTML = errorHTML(
      'Não foi possível ligar ao Supabase. Confirma o URL e a chave no ficheiro .env.'
    );
    console.error(error);
    return;
  }

  // Reage a login/logout (incluindo noutros separadores).
  onAuthChange((session) => route(session));
}

boot();
