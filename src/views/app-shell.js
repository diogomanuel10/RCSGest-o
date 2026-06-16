// Layout principal da aplicação autenticada: barra lateral (desktop) /
// separadores no topo (telemóvel), e área de conteúdo com router simples.

import { logoUrl } from '../ui.js';
import { signOut } from '../auth.js';
import { state, subscribe, loadAll } from '../store.js';
import { loadingHTML, errorHTML } from '../ui.js';

import { renderPainel } from './painel.js';
import { renderPatrocinios } from './patrocinios.js';
import { renderPlanteis } from './planteis.js';
import { renderCalendario } from './calendario.js';
import { renderTreinadores } from './treinadores.js';
import { renderDefinicoes } from './definicoes.js';

const NAV = [
  { key: 'painel', label: 'Painel', icon: '▦', render: renderPainel },
  { key: 'patrocinios', label: 'Patrocínios', icon: '★', render: renderPatrocinios },
  { key: 'planteis', label: 'Plantéis', icon: '🏐', render: renderPlanteis },
  { key: 'calendario', label: 'Calendário', icon: '📅', render: renderCalendario },
  { key: 'treinadores', label: 'Treinadores', icon: '🧑‍🏫', render: renderTreinadores },
];

let current = 'painel';

export async function renderAppShell(root, session) {
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <img src="${logoUrl}" alt="" width="40" height="40" />
          <div>
            <strong>Central RCS</strong>
            <span class="sidebar__sub">Real Clube Senhorense</span>
          </div>
        </div>
        <nav class="sidebar__nav" id="nav">
          ${NAV.map(
            (n) => `
            <button class="navitem" data-route="${n.key}" type="button">
              <span class="navitem__icon" aria-hidden="true">${n.icon}</span>
              <span>${n.label}</span>
            </button>`
          ).join('')}
        </nav>
        <div class="sidebar__foot">
          <button class="navitem" data-route="definicoes" type="button">
            <span class="navitem__icon" aria-hidden="true">⚙</span>
            <span>Definições</span>
          </button>
          <button class="btn btn--ghost sidebar__logout" id="logout" type="button">Sair</button>
          <span class="sidebar__user" title="${session.user.email}">${session.user.email}</span>
        </div>
      </aside>
      <main class="content" id="content"></main>
    </div>
  `;

  const content = root.querySelector('#content');
  const nav = root.querySelector('#nav');

  root.querySelector('#logout').addEventListener('click', () => signOut());

  // Delegação de cliques na navegação (inclui Definições no rodapé).
  root.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => go(btn.dataset.route));
  });

  function setActive() {
    root.querySelectorAll('[data-route]').forEach((btn) => {
      btn.classList.toggle('navitem--active', btn.dataset.route === current);
    });
  }

  function paint() {
    const view =
      NAV.find((n) => n.key === current) ||
      (current === 'definicoes' ? { render: renderDefinicoes } : NAV[0]);
    setActive();
    try {
      view.render(content);
    } catch (err) {
      content.innerHTML = errorHTML('Não foi possível mostrar esta secção.');
      console.error(err);
    }
  }

  function go(route) {
    current = route;
    paint();
    content.scrollTop = 0;
  }

  // Re-desenha a vista atual sempre que os dados mudam.
  subscribe(() => paint());

  // Carrega tudo do Supabase e desenha.
  content.innerHTML = loadingHTML('A carregar os dados do clube…');
  try {
    if (!state.loaded) await loadAll();
    paint();
  } catch (err) {
    content.innerHTML = errorHTML(
      'Não foi possível carregar os dados. Confirma a ligação e o esquema da base de dados.'
    );
    console.error(err);
  }
}
