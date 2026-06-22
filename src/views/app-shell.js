// Layout principal da aplicação autenticada.
//
// Estrutura: uma top bar (com botão de menu, marca e conta) por cima de uma
// barra lateral colapsável (em desktop vira um "rail" só de ícones; em
// telemóvel vira uma gaveta sobreposta) e da área de conteúdo.

import { logoUrl } from '../ui.js';
import { signOut } from '../auth.js';
import { state, subscribe, loadAll } from '../store.js';
import { loadingHTML, errorHTML, esc } from '../ui.js';
import { canManageSettings, canManageUsers, canAccess, ROLE_LABEL } from '../permissions.js';
import { teamName } from '../compute.js';

import { renderPainel } from './painel.js';
import { renderPatrocinios } from './patrocinios.js';
import { renderPlanteis } from './planteis.js';
import { renderAvaliacao } from './avaliacao.js';
import { renderCalendario } from './calendario.js';
import { renderPresencas } from './presencas.js';
import { renderQuotas } from './quotas.js';
import { renderEquipamentos } from './equipamentos.js';
import { renderEstatisticas } from './estatisticas.js';
import { renderTreinadores } from './treinadores.js';
import { renderDefinicoes } from './definicoes.js';
import { renderUtilizadores } from './utilizadores.js';
import { renderRecrutamento } from './recrutamento.js';
import { renderMedico } from './medico.js';
import { renderPreparacao } from './preparacao.js';
import { renderPortal } from './portal.js';
import { renderArquivados } from './arquivados.js';
import { renderFinanceiro } from './financeiro.js';

const ICONS = {
  painel: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`,
  patrocinios: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  planteis: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  calendario: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  treinadores: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  definicoes: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  utilizadores: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  avaliacao: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
  presencas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
  quotas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  equipamentos: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  estatisticas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`,
  recrutamento: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
  financeiro: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  medico: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  fisica: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>`,
  portal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  arquivados: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7"/><path d="M10 11h4"/></svg>`,
};

// Visibilidade das secções: cada item usa canAccess(key). Definições e
// Utilizadores (footer) mantêm o seu próprio `can` (coordenador).
const NAV = [
  { key: 'portal',       label: 'A minha página', icon: ICONS.portal,      render: renderPortal },
  { key: 'painel',       label: 'Painel',        icon: ICONS.painel,       render: renderPainel },
  { key: 'patrocinios',  label: 'Patrocínios',   icon: ICONS.patrocinios,  render: renderPatrocinios },
  { key: 'planteis',     label: 'Plantéis',      icon: ICONS.planteis,     render: renderPlanteis },
  { key: 'avaliacao',    label: 'Avaliação',     icon: ICONS.avaliacao,    render: renderAvaliacao },
  { key: 'calendario',   label: 'Calendário',    icon: ICONS.calendario,   render: renderCalendario },
  { key: 'presencas',    label: 'Presenças',     icon: ICONS.presencas,    render: renderPresencas },
  { key: 'estatisticas', label: 'Estatísticas',  icon: ICONS.estatisticas, render: renderEstatisticas },
  { key: 'quotas',       label: 'Quotas',        icon: ICONS.quotas,       render: renderQuotas },
  { key: 'equipamentos', label: 'Equipamentos',  icon: ICONS.equipamentos, render: renderEquipamentos },
  { key: 'medico',       label: 'Dept. Médico',  icon: ICONS.medico,       render: renderMedico },
  { key: 'fisica',       label: 'Prep. Física',  icon: ICONS.fisica,       render: renderPreparacao },
  { key: 'treinadores',  label: 'Treinadores',   icon: ICONS.treinadores,  render: renderTreinadores },
  { key: 'recrutamento', label: 'Recrutamento',  icon: ICONS.recrutamento, render: renderRecrutamento },
  { key: 'financeiro',   label: 'Financeiro',    icon: ICONS.financeiro,   render: renderFinanceiro },
];

const FOOTER = [
  { key: 'arquivados',   label: 'Arquivados',   icon: ICONS.arquivados,   render: renderArquivados,   can: canManageSettings },
  { key: 'definicoes',   label: 'Definições',   icon: ICONS.definicoes,   render: renderDefinicoes,   can: canManageSettings },
  { key: 'utilizadores', label: 'Utilizadores', icon: ICONS.utilizadores, render: renderUtilizadores, can: canManageUsers },
];

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
          <span class="navitem__icon">${n.icon}</span>
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
          <img src="${logoUrl}" alt="" width="36" height="36" />
          <div>
            <strong>Central RCS</strong>
            <span>Real Clube Senhorense</span>
          </div>
        </div>
        <div class="topbar__search" id="topbar-search">
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" class="search-input" id="search-input" placeholder="Pesquisar…" autocomplete="off" aria-label="Pesquisar atletas, treinadores…" />
          </div>
          <div class="search-results" id="search-results" hidden></div>
        </div>
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

  // --- Gaveta (telemóvel) ---
  function toggleMenu() {
    if (isMobile()) appRoot.classList.toggle('app--drawer');
  }
  function closeDrawer() {
    appRoot.classList.remove('app--drawer');
  }

  root.querySelector('#menu-toggle').addEventListener('click', toggleMenu);
  root.querySelector('#scrim').addEventListener('click', closeDrawer);
  root.querySelector('#logout').addEventListener('click', () => signOut());

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

  // Um item é visível se: footer → o seu próprio `can`; NAV → canAccess(key).
  function routeAllowed(item) {
    return item.can ? item.can() : canAccess(item.key);
  }

  function refreshChrome() {
    root.querySelectorAll('[data-route]').forEach((btn) => {
      const item = allRoutes().find((r) => r.key === btn.dataset.route);
      btn.classList.toggle('hidden', !(item && routeAllowed(item)));
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

  // Mostra um ecrã de espera quando a conta ainda não tem acesso a nada.
  function renderWaiting() {
    content.innerHTML = `
      <div class="card" style="text-align:center;max-width:520px;margin:2rem auto">
        <div class="state">
          <span class="state__icon" aria-hidden="true">⏳</span>
          <h1 class="section-title" style="margin-bottom:0.4rem">A tua conta está quase pronta</h1>
          <p class="muted" style="margin:0">
            Ainda não tens acesso a nenhuma secção. O coordenador do clube precisa
            de te atribuir acessos. Tenta novamente mais tarde.
          </p>
        </div>
      </div>
    `;
  }

  function paint() {
    refreshChrome();

    const allowed = allRoutes().filter(routeAllowed);
    if (!allowed.length) {
      current = null;
      setActive();
      renderWaiting();
      return;
    }

    const item = allRoutes().find((n) => n.key === current);
    if (!item || !routeAllowed(item)) current = allowed[0].key;

    const view = allRoutes().find((n) => n.key === current) || allowed[0];
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

  // --- Pesquisa global ---
  const searchInput = root.querySelector('#search-input');
  const searchResults = root.querySelector('#search-results');

  function searchAll(q) {
    const lq = q.toLowerCase().trim();
    if (!lq) return [];
    const results = [];

    state.players
      .filter((p) => p.name?.toLowerCase().includes(lq))
      .slice(0, 5)
      .forEach((p) => {
        const team = state.teams.find((t) => t.id === p.team_id);
        results.push({ label: p.name, meta: [p.position, team ? teamName(team) : ''].filter(Boolean).join(' · '), route: 'planteis', group: 'Atletas' });
      });

    state.coaches
      .filter((c) => c.name?.toLowerCase().includes(lq))
      .slice(0, 3)
      .forEach((c) => results.push({ label: c.name, meta: 'Treinador/a', route: 'treinadores', group: 'Treinadores' }));

    state.sponsors
      ?.filter((s) => s.name?.toLowerCase().includes(lq))
      .slice(0, 3)
      .forEach((s) => results.push({ label: s.name, meta: s.contact || 'Patrocinador', route: 'patrocinios', group: 'Patrocínios' }));

    return results.slice(0, 8);
  }

  function renderSearchResults(results) {
    if (!results.length) {
      searchResults.hidden = true;
      return;
    }
    let html = '';
    let lastGroup = '';
    results.forEach((r, i) => {
      if (r.group !== lastGroup) {
        html += `<div class="search-group">${esc(r.group)}</div>`;
        lastGroup = r.group;
      }
      html += `<button class="search-result" type="button" data-idx="${i}">${esc(r.label)}${r.meta ? `<span class="search-result__meta">${esc(r.meta)}</span>` : ''}</button>`;
    });
    searchResults.innerHTML = html;
    searchResults.hidden = false;

    searchResults.querySelectorAll('.search-result').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        go(results[Number(btn.dataset.idx)].route);
        searchInput.value = '';
        searchResults.hidden = true;
      });
    });
  }

  searchInput.addEventListener('input', () => {
    renderSearchResults(searchAll(searchInput.value));
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => { searchResults.hidden = true; }, 150);
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value) renderSearchResults(searchAll(searchInput.value));
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { searchInput.value = ''; searchResults.hidden = true; searchInput.blur(); }
  });

  subscribe(() => paint());

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
