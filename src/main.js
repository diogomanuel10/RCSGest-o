// Ponto de entrada da Central RCS.
//
// Fluxo de arranque:
//   1. Sem variáveis do Supabase -> ecrã de ajuda.
//   2. Sem sessão -> ecrã de login.
//   3. Com sessão -> aplicação (layout + vistas, construído nas Fases seguintes).

import './style.css';
import { isConfigured } from './supabase.js';
import { getSession, onAuthChange } from './auth.js';
import { renderConfigHelp } from './views/config-help.js';
import { renderLogin } from './views/login.js';
import { renderAppShell } from './views/app-shell.js';
import { loadingHTML, errorHTML } from './ui.js';

const root = document.querySelector('#app');

// Evita re-render desnecessário quando o onAuthChange dispara com a mesma sessão.
let currentUserId = null;

// Decide o que mostrar consoante exista (ou não) sessão.
function route(session) {
  const userId = session?.user?.id ?? null;
  if (userId === currentUserId && session) return;
  currentUserId = userId;

  if (session) {
    renderAppShell(root, session);
  } else {
    renderLogin(root, () => {
      /* a transição é tratada pelo onAuthChange */
    });
  }
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
