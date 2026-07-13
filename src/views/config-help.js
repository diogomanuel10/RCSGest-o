// Ecrã mostrado quando as variáveis do Supabase NÃO estão definidas.
// Em vez de a aplicação rebentar, explicamos ao utilizador o que fazer.

import { logoUrl } from '../ui.js';

export function renderConfigHelp(root) {
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <main class="config-help">
      <div class="card config-help__card">
        <img class="config-help__logo" src="${logoUrl}" alt="Rumia" width="72" height="72" />
        <h1 class="section-title">Rumia</h1>
        <p class="muted">Falta ligar a aplicação ao Supabase.</p>

        <ol class="config-help__steps">
          <li>Cria um projeto em <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li>
          <li>Em <strong>Project Settings → API</strong>, copia o <em>Project URL</em> e a chave <em>anon public</em>.</li>
          <li>Na pasta do projeto, cria um ficheiro <code>.env</code> a partir de <code>.env.example</code> com:
            <pre><code>VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...</code></pre>
          </li>
          <li>Pára o servidor e corre de novo <code>npm run dev</code>.</li>
        </ol>

        <p class="muted config-help__note">
          A chave <em>anon</em> é segura no navegador desde que o RLS esteja ativo.
          Nunca uses aqui a <strong>service_role key</strong>.
        </p>
      </div>
    </main>
  `;
}
