// Ponto de entrada da Rumia.
//
// Fluxo de arranque:
//   1. Sem variáveis do Supabase -> ecrã de ajuda.
//   2. Sem sessão -> ecrã de login.
//   3. Com sessão -> aplicação (layout + vistas, construído nas Fases seguintes).

import './style.css';
import { isConfigured } from './supabase.js';
import { getSession, onAuthChange } from './auth.js';
import { resetState } from './store.js';
import { applyCachedBranding } from './branding.js';
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

  // Mudou de utilizador (ou terminou sessão): limpa a cache para recarregar.
  if (userId !== currentUserId) resetState();
  currentUserId = userId;

  if (session) {
    renderAppShell(root, session);
  } else {
    renderLogin(root, () => {
      /* a transição é tratada pelo onAuthChange */
    });
  }
}

// Guarda um token de convite presente no URL (?invite=TOKEN) para sobreviver ao
// registo/confirmação de email. É resgatado no arranque da app (ver app-shell).
function captureInviteToken() {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite');
    if (token) {
      localStorage.setItem('rcs.invite', token);
      // Limpa o parâmetro do URL para não ficar visível/partilhável por engano.
      params.delete('invite');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
    }
  } catch {
    /* URL/localStorage indisponível: segue sem convite */
  }
}

async function boot() {
  // Aplica a última marca conhecida já no arranque, para que o ecrã de login
  // (sem sessão, sem acesso à BD) surja com a identidade do clube.
  applyCachedBranding();
  captureInviteToken();

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
