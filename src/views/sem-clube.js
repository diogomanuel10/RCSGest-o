// Ecrã de quem tem conta mas ainda não pertence a nenhum clube.
//
// Substitui o onboarding para toda a gente que não seja o admin da plataforma:
// a Rumia não tem inscrição aberta, os clubes entram um a um por nós (ver
// `supabase/acesso-fechado.sql`). Sem este ecrã, quem chegasse aqui via o
// formulário de "Criar clube" e levava com um erro do servidor ao submeter —
// uma porta pintada na parede.
//
// Há duas maneiras legítimas de cair aqui, e o texto responde às duas: a conta
// foi criada mas o clube ainda não lhe foi atribuído, ou o link de convite
// expirou/já tinha sido usado.

import { signOut } from '../auth.js';
import { esc } from '../ui.js';
import { logoSrc, branding } from '../branding.js';

export function renderSemClube(root) {
  root.removeAttribute('aria-busy');
  const b = branding();

  root.innerHTML = `
    <main class="login">
      <div class="card login__card">
        <img class="login__logo" src="${esc(logoSrc())}" alt="" width="72" height="72" />
        <h1 class="section-title login__title">A tua conta está pronta</h1>
        <p class="muted login__subtitle">
          Falta ligá-la a um clube — e isso é connosco. A ${esc(b.app_name)} não
          tem inscrição aberta: cada clube entra acompanhado, um a um.
        </p>

        <ul class="muted" style="text-align:left;font-size:0.9rem;line-height:1.6;margin:0 0 1.2rem;padding-left:1.1rem">
          <li>Se já falaste connosco, o clube é criado do nosso lado e o acesso
              aparece aqui assim que voltares a entrar.</li>
          <li>Se vieste por um link de convite de um clube, o link pode ter
              expirado ou já ter sido usado — pede outro a quem to enviou.</li>
        </ul>

        <button type="button" class="btn btn--ghost login__submit" id="sem-clube-recarregar">
          Já tenho acesso — verificar
        </button>
        <button type="button" class="btn btn--ghost btn--sm" id="sem-clube-sair"
                style="margin-top:0.5rem">Sair</button>
      </div>
    </main>
  `;

  root.querySelector('#sem-clube-recarregar').addEventListener('click', () => location.reload());
  root.querySelector('#sem-clube-sair').addEventListener('click', () => signOut());
}
