// Ponto de entrada da Central RCS.
// Na Fase 0 apenas confirmamos que o andaime arranca e que a deteção das
// variáveis do Supabase funciona. A autenticação, o layout e as vistas
// são construídos nas fases seguintes.

import './style.css';
import { isConfigured } from './supabase.js';

const app = document.querySelector('#app');

function render() {
  app.removeAttribute('aria-busy');

  if (!isConfigured) {
    app.innerHTML = `
      <main class="boot">
        <h1>Central RCS</h1>
        <p>Falta configurar o Supabase (ver <code>.env</code>).</p>
      </main>
    `;
    return;
  }

  app.innerHTML = `
    <main class="boot">
      <h1>Central RCS</h1>
      <p>Andaime pronto. A construção continua nas próximas fases.</p>
    </main>
  `;
}

render();
