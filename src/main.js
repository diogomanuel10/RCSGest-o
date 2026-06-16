// Ponto de entrada da Central RCS.
//
// Fluxo de arranque:
//   1. Se as variáveis do Supabase não estiverem definidas -> ecrã de ajuda.
//   2. Caso contrário, segue para a autenticação e a aplicação (Fases seguintes).

import './style.css';
import { isConfigured } from './supabase.js';
import { renderConfigHelp } from './views/config-help.js';

const root = document.querySelector('#app');

async function boot() {
  // Sem credenciais não há nada a fazer: explicamos como configurar.
  if (!isConfigured) {
    renderConfigHelp(root);
    return;
  }

  // A autenticação e o resto da aplicação chegam nas próximas fases.
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <main class="config-help">
      <div class="card config-help__card" style="text-align:center">
        <h1 class="section-title">Central RCS</h1>
        <p class="muted">Supabase configurado. A autenticação chega na próxima fase.</p>
      </div>
    </main>
  `;
}

boot();
