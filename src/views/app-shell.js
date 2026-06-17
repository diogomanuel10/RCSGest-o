// Layout principal da aplicação autenticada.
//
// Estrutura: uma top bar (com botão de menu, marca e conta) por cima de uma
// barra lateral colapsável (em desktop vira um "rail" só de ícones; em
// telemóvel vira uma gaveta sobreposta) e da área de conteúdo.

import { logoUrl } from '../ui.js';
import { signOut } from '../auth.js';
import { state, subscribe, loadAll } from '../store.js';
import { loadingHTML, errorHTML } from '../ui.js';
import { canManageSettings, canManageUsers, ROLE_LABEL } from '../permissions.js';

import { renderPainel } from './painel.js';
import { renderPatrocinios } from './patrocinios.js';
import { renderPlanteis } from './planteis.js';
import { renderCalendario } from './calendario.js';
import { renderTreinadores } from './treinadores.js';
import { renderDefinicoes } from './definicoes.js';
import { renderUtilizadores } from './utilizadores.js';

const NAV = [
  { key: 'painel', label: 'Painel', icon: '▦', render: renderPainel },
  { key: 'patrocinios', label: 'Patrocínios', icon: '★', render: renderPatrocinios },
  { key: 'planteis', label: 'Plantéis', icon: '🏐', render: renderPlanteis },
  { key: 'calendario', label: 'Calendário', icon: '📅', render: renderCalendario },
  { key: 'treinadores', label: 'Treinadores', icon: '🧑‍🏫', render: renderTreinadores },
];

// Rotas do rodapé, com a condição de visibilidade (por papel).
const FOOTER = [
  { key: 'definicoes', label: 'Definições', icon: '⚙', render: renderDefinicoes, can: canManageSettings },
  { key: 'utilizadores', label: 'Utilizadores', icon: '👥', render: renderUtilizadores, can: canManageUsers },
];

const COLLAPSE_KEY = 'rcs-sidebar-collapsed';
const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

let current = 'painel';

export async function renderAppShell(root, session) {
  current = 'painel';
  root.removeAttribute('aria-busy');

  const navHTML = (items, footer = false) =>
    items
      .map(
        (n) => `
        <button class="navitem${footer ? ' hidden' : ''}" data-route="${n.key}"${
          footer ? ' data-footer' : ''
        } type="button" title="${n.label}">
          <span class="navitem__icon" aria-hidden="true">${n.icon}</span>
          <span>${n.label}</span>
        </button>`
      )
      .join('');

  root.innerHTML = `
    <div class="app" id="app-root">
      <header class="topbar">
        <button class="topbar__toggle" id="menu-toggle" type="button"
                aria-label="Mostrar ou esconder o menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div class="topbar__brand">
          <img src="${logoUrl}" alt="" width="38" height="38" />
          <div>
            <strong>Central RCS</strong>
            <span>Real Clube Senhorense</span>
          </div>
        </div>
        <div class="topbar__spacer"></div>
        <div class="topbar__account">
          <div class="topbar__user">
            <span class="topbar__email">${session.user.email}</span>
            <span class="badge badge--muted" id="role-badge">leitura</span>
          </div>
          <button class="btn btn--ghost btn--sm" id="logout" type="button">Sair</button>
        </div>
      </header>

      <div class="app__body">
        <aside class="sidebar" id="sidebar">
          <nav class="sidebar__nav">${navHTML(NAV)}</nav>
          <div class="sidebar__foot">${navHTML(FOOTER, true)}</div>
        </aside>
        <div class="scrim" id="scrim"></div>
        <main class="content"><div class="content__inner" id="content"></div></main>
      </div>
    </div>
  `;

  const appRoot = root.querySelector('#app-root');
  const content = root.querySelector('#content');
  const sidebar = root.querySelector('#sidebar');

  // --- Colapsar (desktop) / gaveta (telemóvel) ---
  if (!isMobile() && localStorage.getItem(COLLAPSE_KEY) === '1') {
    appRoot.classList.add('app--collapsed');
  }

  function toggleMenu() {
    if (isMobile()) {
      appRoot.classList.toggle('app--drawer');
    } else {
      const collapsed = appRoot.classList.toggle('app--collapsed');
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    }
  }
  function closeDrawer() {
    appRoot.classList.remove('app--drawer');
  }

  root.querySelector('#menu-toggle').addEventListener('click', toggleMenu);
  root.querySelector('#scrim').addEventListener('click', closeDrawer);
  root.querySelector('#logout').addEventListener('click', () => signOut());

  // Limpa o estado de gaveta ao passar para desktop.
  window.addEventListener('resize', () => {
    if (!isMobile()) closeDrawer();
  });

  root.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      go(btn.dataset.route);
      if (isMobile()) closeDrawer();
    });
  });

  function allRoutes() {
    return [...NAV, ...FOOTER];
  }

  // Mostra/esconde as entradas do rodapé e atualiza o papel apresentado.
  function refreshChrome() {
    sidebar.querySelectorAll('[data-footer]').forEach((btn) => {
      const item = FOOTER.find((f) => f.key === btn.dataset.route);
      btn.classList.toggle('hidden', !(item && item.can()));
    });
    const role = state.profile?.role;
    if (role) {
      const badge = root.querySelector('#role-badge');
      badge.textContent = ROLE_LABEL[role] || role;
    }
  }

  function setActive() {
    root.querySelectorAll('[data-route]').forEach((btn) => {
      btn.classList.toggle('navitem--active', btn.dataset.route === current);
    });
  }

  function paint() {
    refreshChrome();

    // Guarda de rota: se a entrada atual não estiver acessível, volta ao Painel.
    const item = allRoutes().find((n) => n.key === current);
    if (!item || (item.can && !item.can())) current = 'painel';

    const view = allRoutes().find((n) => n.key === current) || NAV[0];
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
