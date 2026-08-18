// Layout principal da aplicação autenticada.
//
// Estrutura: uma top bar (com botão de menu, marca e conta) por cima de uma
// barra lateral colapsável (em desktop vira um "rail" só de ícones; em
// telemóvel vira uma gaveta sobreposta) e da área de conteúdo.

import { logoSrc, branding } from '../branding.js';
import { signOut } from '../auth.js';
import { state, subscribe, loadAll, loadProfile, orgAccess, redeemInvitation } from '../store.js';
import { loadingHTML, errorHTML, esc } from '../ui.js';
import { renderOfflineCard, clearOfflineCard } from '../offline-card.js';
import { renderOnboarding } from './onboarding.js';
import { renderSubscriptionBlocked } from './subscription-blocked.js';
import { canManageSettings, canManageUsers, canRestore, canAccess, ROLE_LABEL } from '../permissions.js';
import { teamName } from '../compute.js';
import {
  loadNotifications, getNotifications, getUnreadCount,
  onNotificationChange, markRead, markAllRead,
  subscribeRealtime, requestPermission,
  checkMissingAttendances,
} from '../notifications.js';

import { renderPainel } from './painel.js';
import { renderPlanteis } from './planteis.js';
import { renderCalendario } from './calendario.js';
import { renderPresencas } from './presencas.js';
import { renderEquipamentos } from './equipamentos.js';
import { renderTreinadores } from './treinadores.js';
import { renderDefinicoes } from './definicoes.js';
import { renderUtilizadores } from './utilizadores.js';
import { renderRecrutamento } from './recrutamento.js';
import { renderSaude, openSaudeTab } from './saude.js';
import { renderPortal } from './portal.js';
import { renderArquivados } from './arquivados.js';
import { renderFinanceiro, openFinanceiroTab } from './financeiro.js';
import { renderPlanoJogo } from './plano-jogo.js';
import { renderTatica } from './tatica.js';
import { renderExercicios } from './exercicios.js';
import { renderObjetivos } from './objetivos.js';
import { renderAdmin } from './admin.js';
import { renderAthleteProfilePage, registerProfileOpener } from './athlete-profile.js';

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
  encomendas: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  medico: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
  fisica: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>`,
  portal: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  arquivados: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="4" rx="1"/><path d="M5 7v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7"/><path d="M10 11h4"/></svg>`,
  'plano-jogo': `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  exercicios: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7"/><path d="M9 11h5"/></svg>`,
  tatica: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/></svg>`,
  objetivos: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  admin: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
};

// Visibilidade das secções: cada item usa canAccess(key). Definições e
// Utilizadores (footer) mantêm o seu próprio `can` (coordenador).
// Grupos da barra lateral (agrupadores). A ordem aqui define a ordem de
// apresentação; `label: null` = grupo sem título (fica no topo). Um grupo cujas
// entradas estejam todas escondidas por permissões não aparece (refreshChrome).
const NAV_GROUPS = [
  { key: 'principal',  label: null },
  { key: 'desportivo', label: 'Desportivo' },
  { key: 'competicao', label: 'Competição' },
  { key: 'admin',      label: 'Administração' },
];

const NAV = [
  { key: 'portal',       label: 'A minha página', icon: ICONS.portal,      render: renderPortal,       group: 'principal' },
  { key: 'painel',       label: 'Painel',        icon: ICONS.painel,       render: renderPainel,        group: 'principal' },

  { key: 'planteis',     label: 'Plantéis',      icon: ICONS.planteis,     render: renderPlanteis,      group: 'desportivo', alias: 'atletas equipas avaliação de plantel' },
  { key: 'treinadores',  label: 'Treinadores',   icon: ICONS.treinadores,  render: renderTreinadores,   group: 'desportivo' },
  { key: 'recrutamento', label: 'Recrutamento',  icon: ICONS.recrutamento, render: renderRecrutamento,  group: 'desportivo' },
  { key: 'plano-jogo',   label: 'Plano de Jogo', icon: ICONS['plano-jogo'], render: renderPlanoJogo,    group: 'desportivo' },
  { key: 'exercicios',   label: 'Exercícios',    icon: ICONS.exercicios,   render: renderExercicios,    group: 'desportivo', alias: 'biblioteca exercícios treino side-out receção bloco aquecimento' },
  // O atleta não entra por aqui: os cenários chegam-lhe pelo portal ("A minha
  // página"), junto ao resto do que é dele.
  { key: 'tatica',       label: 'Decisão Tática', icon: ICONS.tatica,      render: renderTatica,        group: 'desportivo', alias: 'distribuidora leitura de bloco free ball cenários decisão' },

  { key: 'saude',        label: 'Saúde & Física', icon: ICONS.medico,      render: renderSaude,         group: 'desportivo', alias: 'fisioterapia lesões dept. médico preparação física ginásio periodização', can: () => canAccess('medico') || canAccess('fisica') },

  { key: 'calendario',   label: 'Calendário',    icon: ICONS.calendario,   render: renderCalendario,    group: 'competicao' },
  { key: 'presencas',    label: 'Presenças',     icon: ICONS.presencas,    render: renderPresencas,     group: 'competicao' },

  { key: 'objetivos',    label: 'Objetivos',     icon: ICONS.objetivos,    render: renderObjetivos,     group: 'admin' },
  { key: 'equipamentos', label: 'Equipamentos',  icon: ICONS.equipamentos, render: renderEquipamentos,  group: 'admin', alias: 'inventário encomendas tamanhos', can: () => canAccess('equipamentos') || canAccess('encomendas') },
  { key: 'financeiro',   label: 'Financeiro',    icon: ICONS.financeiro,   render: renderFinanceiro,    group: 'admin', alias: 'quotas patrocínios livro-razão receitas despesas', can: () => canAccess('financeiro') || canAccess('patrocinios') || canAccess('quotas') },
];

const FOOTER = [
  { key: 'arquivados',   label: 'Arquivados',   icon: ICONS.arquivados,   render: renderArquivados,   can: canRestore },
  { key: 'definicoes',   label: 'Definições',   icon: ICONS.definicoes,   render: renderDefinicoes,   can: canManageSettings },
  { key: 'utilizadores', label: 'Utilizadores', icon: ICONS.utilizadores, render: renderUtilizadores, can: canManageUsers },
  { key: 'admin',        label: 'Plataforma',   icon: ICONS.admin,        render: renderAdmin,        can: () => state.isPlatformAdmin },
];

const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

let current = 'painel';

// Listeners registados fora do `root` (window/document) e a subscrição ao
// store. O shell pode ser montado mais do que uma vez na mesma página — por
// exemplo, ao terminar o onboarding — e sem isto cada montagem deixava para
// trás os listeners da anterior, que continuavam a desenhar num DOM já morto.
let disposeGlobals = null;

export async function renderAppShell(root, session) {
  disposeGlobals?.();
  disposeGlobals = null;
  current = 'painel';
  root.removeAttribute('aria-busy');

  // --- Gate multi-tenant: clube e subscrição ------------------------------
  // Antes de montar a app, confirma que o utilizador pertence a um clube ativo.
  // Sem clube -> onboarding (ou resgate de convite). Clube inativo -> bloqueio.
  root.innerHTML = loadingHTML('A preparar a tua conta…');
  try {
    await loadProfile();

    // Resgata um convite pendente (link ?invite=) se ainda não tiver clube.
    const pendingInvite = (() => {
      try { return localStorage.getItem('rcs.invite'); } catch { return null; }
    })();
    if (!state.profile?.org_id && pendingInvite) {
      try {
        await redeemInvitation(pendingInvite);
      } catch (err) {
        console.warn('Convite inválido ou expirado:', err?.message);
      } finally {
        try { localStorage.removeItem('rcs.invite'); } catch { /* ignora */ }
      }
    }

    const access = orgAccess();
    if (!access.ok) {
      if (access.reason === 'pending') {
        renderOnboarding(root, () => renderAppShell(root, session));
      } else {
        renderSubscriptionBlocked(root, access.reason);
      }
      return;
    }
  } catch (err) {
    root.innerHTML = errorHTML('Não foi possível verificar a tua conta. Tenta recarregar.');
    console.error(err);
    return;
  }

  const itemHTML = (n, footer = false) => `
        <button class="navitem${footer ? ' hidden' : ''}" data-route="${n.key}"${
          footer ? ' data-footer' : ''
        } type="button" title="${n.label}">
          <span class="navitem__icon">${n.icon}</span>
          <span>${n.label}</span>
        </button>`;

  // Rodapé: lista plana (sem agrupadores).
  const navHTML = (items, footer = false) =>
    items.map((n) => itemHTML(n, footer)).join('');

  // Seta de colapso (usada só no telemóvel).
  const CHEVRON = `<svg class="navgroup__chevron" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;

  // NAV principal agrupada por secções (NAV_GROUPS).
  const groupedNavHTML = () =>
    NAV_GROUPS.map((g) => {
      const items = NAV.filter((n) => n.group === g.key);
      if (!items.length) return '';
      const head = g.label
        ? `<button class="navgroup__title" type="button" data-group-toggle="${g.key}"
              aria-expanded="true">
             <span class="navgroup__title-text">${g.label}</span>${CHEVRON}
           </button>`
        : '';
      return `<div class="navgroup" data-group="${g.key}">
          ${head}
          <div class="navgroup__items">${items.map((n) => itemHTML(n)).join('')}</div>
        </div>`;
    }).join('');

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
          <img src="${esc(logoSrc())}" alt="" width="36" height="36" />
          <div>
            <strong>${esc(branding().app_name)}</strong>
            <span>${esc(branding().club_name)}</span>
          </div>
        </div>
        <div class="topbar__search" id="topbar-search">
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search" class="search-input" id="search-input"
                   placeholder="Pesquisar atletas, equipas, secções…" autocomplete="off"
                   aria-label="Pesquisar atletas, equipas, treinadores, eventos e secções" />
            <kbd class="search-kbd" aria-hidden="true">Ctrl K</kbd>
          </div>
          <div class="search-results" id="search-results" hidden></div>
          <button class="search-close" id="search-close" type="button"
                  aria-label="Fechar pesquisa">&times;</button>
        </div>
        <button class="topbar__search-toggle" id="search-toggle" type="button"
                aria-label="Pesquisar" aria-expanded="false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        </button>
        <div class="topbar__notif" id="notif-wrap" hidden>
          <button class="notif-bell" id="notif-btn" type="button"
                  aria-label="Notificações" aria-haspopup="true" aria-expanded="false">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span class="notif-badge" id="notif-badge" hidden>0</span>
          </button>
          <div class="notif-panel" id="notif-panel" role="dialog" aria-label="Notificações">
            <div class="notif-panel__head">
              <strong>Notificações</strong>
              <button class="btn btn--ghost btn--xs" id="notif-read-all" type="button">
                Marcar lidas
              </button>
            </div>
            <div class="notif-list" id="notif-list" aria-live="polite"></div>
            <div class="notif-permission" id="notif-permission" hidden>
              <p>Ativa para receberes alertas mesmo com a app fechada.</p>
              <button class="btn btn--primary btn--sm" id="notif-enable-btn" type="button">
                Ativar notificações
              </button>
            </div>
          </div>
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
          <nav class="sidebar__nav">${groupedNavHTML()}</nav>
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

  // Perfil do Atleta como página (sem modal): quando `detail` está definido, o
  // paint() desenha o perfil em vez da rota atual. Sobrevive às atualizações.
  let detail = null;
  registerProfileOpener((playerId, opts) => {
    setHash(`atleta/${playerId}${opts?.tab ? '/' + opts.tab : ''}`);
  });

  // --- Rotas no endereço (#/seccao) --------------------------------------
  // Sem isto, recarregar a página devolve sempre ao Painel, o botão "voltar"
  // do browser sai da aplicação e não há forma de partilhar o link de um
  // atleta. O endereço passa a ser a fonte de verdade da navegação.

  function setHash(path) {
    const next = `#/${path}`;
    if (location.hash === next) {
      applyHash(); // mesmo destino: re-desenha (ex.: reabrir o mesmo atleta)
      return;
    }
    location.hash = next;
  }

  // Secções que deixaram de ter entrada própria e passaram a ser separadores
  // de outra. Um endereço antigo (link partilhado, favorito) continua a levar
  // ao sítio certo, já no separador respetivo, em vez de cair no Painel.
  const LEGACY_ROUTES = {
    medico:      { route: 'saude',      open: () => openSaudeTab('medico') },
    fisica:      { route: 'saude',      open: () => openSaudeTab('fisica') },
    quotas:      { route: 'financeiro', open: () => openFinanceiroTab('quotas') },
    patrocinios: { route: 'financeiro', open: () => openFinanceiroTab('patrocinios') },
  };

  // Traduz o endereço atual em { route } ou { playerId, tab }.
  function parseHash() {
    const raw = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')).trim();
    if (!raw) return null;
    const [seg, a, b] = raw.split('/');
    if (seg === 'atleta' && a) return { playerId: a, tab: b || undefined };
    return { route: seg };
  }

  function applyHash() {
    const parsed = parseHash();
    if (parsed?.playerId) {
      detail = { playerId: parsed.playerId, opts: parsed.tab ? { tab: parsed.tab } : {} };
    } else {
      detail = null;
      // Rota desconhecida (link antigo ou erro de escrita) cai na primeira
      // secção permitida, em vez de mostrar um ecrã vazio.
      let key = parsed?.route || null;
      const legacy = key ? LEGACY_ROUTES[key] : null;
      if (legacy) {
        legacy.open();
        key = legacy.route;
      }
      const item = key ? allRoutes().find((n) => n.key === key) : null;
      if (item && routeAllowed(item)) current = item.key;
      else current = firstAllowedRoute();
    }
    paint();
    content.scrollTop = 0;
  }

  // Passos de navegação dados dentro da app. Serve para saber se há para onde
  // "voltar": num link partilhado que abre logo o perfil de um atleta, o
  // histórico está vazio e um history.back() sairia da aplicação.
  let inAppNavs = 0;
  const onHashChange = () => {
    inAppNavs++;
    applyHash();
  };
  window.addEventListener('hashchange', onHashChange);

  // Alinha o endereço com o que está desenhado, sem criar um passo no
  // histórico. Usa-se quando o paint() muda de rota por sua conta (rota sem
  // permissão, atleta apagado…) e o endereço ficaria a apontar para o sítio
  // errado.
  function syncHash(route) {
    const expected = `#/${route}`;
    if (location.hash === expected) return;
    // replaceState não dispara `hashchange`, por isso não há re-desenho a
    // evitar — só corrige o endereço no sítio.
    history.replaceState(null, '', location.pathname + location.search + expected);
  }

  function goBack() {
    if (inAppNavs > 0) history.back();
    else setHash(current || firstAllowedRoute() || 'painel');
  }

  // --- Gaveta (telemóvel) ---
  function toggleMenu() {
    if (isMobile()) appRoot.classList.toggle('app--drawer');
  }
  function closeDrawer() {
    appRoot.classList.remove('app--drawer');
  }

  root.querySelector('#menu-toggle').addEventListener('click', toggleMenu);
  root.querySelector('#scrim').addEventListener('click', closeDrawer);
  root.querySelector('#logout').addEventListener('click', () => {
    // O cartão guardado é pessoal: não deve ficar no dispositivo depois de a
    // conta sair (um tablet partilhado passaria o cartão ao utilizador
    // seguinte).
    clearOfflineCard();
    signOut();
  });

  const onResize = () => {
    if (!isMobile()) closeDrawer();
  };
  window.addEventListener('resize', onResize);

  root.querySelectorAll('[data-route]').forEach((btn) => {
    btn.addEventListener('click', () => {
      go(btn.dataset.route);
      if (isMobile()) closeDrawer();
    });
  });

  // Colapsar/expandir secções — efeito só no telemóvel (ver CSS); no desktop a
  // barra é de ícones e expande por hover, por isso o toggle fica inativo.
  root.querySelectorAll('[data-group-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!isMobile()) return;
      const group = btn.closest('.navgroup');
      const collapsed = group.classList.toggle('navgroup--collapsed');
      btn.setAttribute('aria-expanded', String(!collapsed));
    });
  });

  function allRoutes() {
    return [...NAV, ...FOOTER];
  }

  // Um item é visível se: footer → o seu próprio `can`; NAV → canAccess(key).
  function routeAllowed(item) {
    return item.can ? item.can() : canAccess(item.key);
  }

  // Primeira secção a que o utilizador tem acesso (o Painel, quase sempre).
  function firstAllowedRoute() {
    return allRoutes().filter(routeAllowed)[0]?.key || null;
  }

  function refreshChrome() {
    root.querySelectorAll('[data-route]').forEach((btn) => {
      const item = allRoutes().find((r) => r.key === btn.dataset.route);
      btn.classList.toggle('hidden', !(item && routeAllowed(item)));
    });
    // Um grupo sem nenhuma entrada visível não aparece (nem o seu título).
    root.querySelectorAll('.navgroup').forEach((group) => {
      const anyVisible = [...group.querySelectorAll('[data-route]')].some(
        (btn) => !btn.classList.contains('hidden')
      );
      group.classList.toggle('hidden', !anyVisible);
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

    // Perfil do Atleta (página) tem prioridade sobre a rota atual.
    if (detail) {
      const player = state.players.find((p) => p.id === detail.playerId);
      if (player) {
        setActive();
        content.classList.toggle('content__inner--wide', false);
        try {
          renderAthleteProfilePage(content, detail.playerId, {
            ...detail.opts,
            // "Voltar" desfaz o passo no histórico, para coincidir com o botão
            // de voltar do browser/telemóvel em vez de o contrariar.
            onBack: goBack,
          });
        } catch (err) {
          content.innerHTML = errorHTML('Não foi possível mostrar o atleta.');
          console.error(err);
        }
        return;
      }
      detail = null; // atleta já não existe → volta à vista normal
    }

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
    syncHash(view.key);
    setActive();
    content.classList.toggle('content__inner--wide', !!view.wide);
    try {
      view.render(content);
    } catch (err) {
      content.innerHTML = errorHTML('Não foi possível mostrar esta secção.');
      console.error(err);
    }
  }

  // Navegar escreve no endereço; o `hashchange` trata de desenhar. Assim o
  // botão "voltar" do browser desfaz sempre o último passo da navegação.
  function go(route) {
    setHash(route);
  }

  // --- Pesquisa global ---
  // Um único sítio para chegar a qualquer coisa: atletas, treinadores, equipas,
  // eventos e as próprias secções. Atalho Ctrl/⌘+K, navegação com as setas.
  const searchInput = root.querySelector('#search-input');
  const searchResults = root.querySelector('#search-results');
  let searchHits = [];
  let activeHit = -1;

  // Normaliza para comparar sem acentos nem maiúsculas — "jose" encontra
  // "José", que é como as pessoas escrevem quando têm pressa.
  const norm = (v) => String(v || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  function searchAll(q) {
    const lq = norm(q).trim();
    if (!lq) return [];
    const hits = [];
    const match = (v) => norm(v).includes(lq);

    if (canAccess('planteis')) {
      state.players
        .filter((p) => match(p.name))
        .slice(0, 6)
        .forEach((p) => {
          const team = state.teams.find((t) => t.id === p.team_id);
          hits.push({
            label: p.name,
            meta: [p.position, team ? teamName(team) : ''].filter(Boolean).join(' · '),
            playerId: p.id,
            group: 'Atletas',
          });
        });

      state.teams
        .filter((t) => match(teamName(t)))
        .slice(0, 3)
        .forEach((t) => hits.push({ label: teamName(t), meta: 'Equipa', route: 'planteis', group: 'Equipas' }));
    }

    if (canAccess('treinadores')) {
      state.coaches
        .filter((c) => match(c.name))
        .slice(0, 3)
        .forEach((c) => hits.push({ label: c.name, meta: 'Treinador/a', route: 'treinadores', group: 'Treinadores' }));
    }

    if (canAccess('calendario')) {
      state.events
        .filter((e) => match(e.title) || match(e.opponent) || match(e.location))
        .slice(0, 4)
        .forEach((e) => {
          const team = state.teams.find((t) => t.id === e.team_id);
          hits.push({
            label: e.title || e.opponent || 'Evento',
            meta: [e.date, team ? teamName(team) : ''].filter(Boolean).join(' · '),
            route: 'calendario',
            group: 'Calendário',
          });
        });
    }

    // As próprias secções: quem não sabe onde fica uma coisa escreve o nome
    // dela na pesquisa antes de procurar no menu.
    // O `alias` cobre o que vive DENTRO de uma secção (ex.: "quotas" está no
    // Financeiro): quem escreve o nome da coisa continua a encontrá-la.
    allRoutes()
      .filter((n) => routeAllowed(n) && (match(n.label) || match(n.alias)))
      .slice(0, 4)
      .forEach((n) => hits.push({
        label: n.label,
        meta: match(n.label) ? 'Ir para a secção' : 'Secção',
        route: n.key,
        group: 'Secções',
      }));

    return hits.slice(0, 10);
  }

  function openHit(hit) {
    if (!hit) return;
    searchInput.value = '';
    hideResults();
    searchInput.blur();
    closeMobileSearch();
    if (hit.playerId) setHash(`atleta/${hit.playerId}`);
    else go(hit.route);
  }

  function hideResults() {
    searchResults.hidden = true;
    searchResults.innerHTML = '';
    searchInput.setAttribute('aria-expanded', 'false');
    activeHit = -1;
  }

  function highlight(index) {
    const items = [...searchResults.querySelectorAll('.search-result')];
    if (!items.length) return;
    activeHit = (index + items.length) % items.length;
    items.forEach((el, i) => {
      const on = i === activeHit;
      el.classList.toggle('search-result--active', on);
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  function renderSearchResults(hits) {
    searchHits = hits;
    if (!hits.length) {
      // Dizer que não há nada é melhor do que fazer desaparecer o painel e
      // deixar dúvidas sobre se a pesquisa chegou a correr.
      if (searchInput.value.trim()) {
        searchResults.innerHTML = '<p class="search-empty">Sem resultados.</p>';
        searchResults.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
      } else {
        hideResults();
      }
      return;
    }
    let html = '';
    let lastGroup = '';
    hits.forEach((r, i) => {
      if (r.group !== lastGroup) {
        html += `<div class="search-group">${esc(r.group)}</div>`;
        lastGroup = r.group;
      }
      html += `<button class="search-result" type="button" role="option" data-idx="${i}">${esc(r.label)}${
        r.meta ? `<span class="search-result__meta">${esc(r.meta)}</span>` : ''
      }</button>`;
    });
    searchResults.innerHTML = html;
    searchResults.hidden = false;
    searchInput.setAttribute('aria-expanded', 'true');
    activeHit = -1;

    searchResults.querySelectorAll('.search-result').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        openHit(searchHits[Number(btn.dataset.idx)]);
      });
      btn.addEventListener('mousemove', () => highlight(Number(btn.dataset.idx)));
    });
  }

  // No telemóvel a barra de pesquisa não cabe ao lado da marca, por isso vive
  // atrás de um botão e abre por cima da topbar quando é pedida.
  const searchToggle = root.querySelector('#search-toggle');
  const topbar = root.querySelector('.topbar');

  function closeMobileSearch() {
    topbar.classList.remove('topbar--searching');
    searchToggle.setAttribute('aria-expanded', 'false');
  }

  root.querySelector('#search-close').addEventListener('click', () => {
    searchInput.value = '';
    hideResults();
    closeMobileSearch();
  });

  searchToggle.addEventListener('click', () => {
    const opening = !topbar.classList.contains('topbar--searching');
    topbar.classList.toggle('topbar--searching', opening);
    searchToggle.setAttribute('aria-expanded', String(opening));
    if (opening) searchInput.focus();
    else searchInput.value = '';
  });

  searchInput.setAttribute('role', 'combobox');
  searchInput.setAttribute('aria-expanded', 'false');
  searchInput.setAttribute('aria-autocomplete', 'list');

  searchInput.addEventListener('input', () => {
    renderSearchResults(searchAll(searchInput.value));
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(hideResults, 150);
  });
  searchInput.addEventListener('focus', () => {
    if (searchInput.value) renderSearchResults(searchAll(searchInput.value));
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      hideResults();
      searchInput.blur();
      closeMobileSearch();
      return;
    }
    if (searchResults.hidden || !searchHits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); highlight(activeHit + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight(activeHit - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      openHit(searchHits[activeHit >= 0 ? activeHit : 0]);
    }
  });

  // Ctrl/⌘+K e "/" saltam para a pesquisa de qualquer ponto da aplicação.
  const onGlobalKey = (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')
      || e.target?.isContentEditable;
    const shortcut = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if (shortcut || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) {
      e.preventDefault();
      if (isMobile()) {
        topbar.classList.add('topbar--searching');
        searchToggle.setAttribute('aria-expanded', 'true');
      }
      searchInput.focus();
      searchInput.select();
    }
  };
  document.addEventListener('keydown', onGlobalKey);

  const unsubscribe = subscribe(() => paint());

  // Tudo o que este shell registou fora do `root`, para a próxima montagem
  // poder limpar (ver `disposeGlobals`).
  disposeGlobals = () => {
    window.removeEventListener('hashchange', onHashChange);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onGlobalKey);
    unsubscribe();
    disposeNotif?.();
  };

  // --- Notificações (só para coordenador) --------------------------------

  // Limpeza do listener global do painel de notificações (ver disposeGlobals).
  let disposeNotif = null;

  function _notifIcon(type) {
    const icons = {
      // Coordenador
      prospect_added:       `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
      prospect_status:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
      review_status:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
      attendance_missing:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
      // Treinador
      event_added:          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="15" x2="12" y2="19"/><line x1="10" y1="17" x2="14" y2="17"/></svg>`,
      event_updated:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>`,
      event_cancelled:      `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="10" y1="14" x2="14" y2="18"/><line x1="14" y1="14" x2="10" y2="18"/></svg>`,
      player_added:         `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>`,
      player_unavailable:   `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/></svg>`,
      player_available:     `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>`,
      clinical_alta:        `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`,
      attendance_reminder:  `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    };
    return icons[type] || `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
  }

  function _relTime(iso) {
    const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (mins < 1)   return 'agora mesmo';
    if (mins < 60)  return `há ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs  < 24)  return `há ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `há ${days} dia${days !== 1 ? 's' : ''}`;
  }

  async function setupNotifications() {
    const role = state.profile?.role;
    if (role !== 'coordenador' && role !== 'treinador') return;

    const wrap      = root.querySelector('#notif-wrap');
    const btn       = root.querySelector('#notif-btn');
    const panel     = root.querySelector('#notif-panel');
    const badge     = root.querySelector('#notif-badge');
    const list      = root.querySelector('#notif-list');
    const readAllBtn= root.querySelector('#notif-read-all');
    const permDiv   = root.querySelector('#notif-permission');
    const enableBtn = root.querySelector('#notif-enable-btn');

    wrap.hidden = false;

    function renderList() {
      const notifs = getNotifications();
      if (!notifs.length) {
        list.innerHTML = '<p class="notif-empty">Sem notificações.</p>';
        return;
      }
      list.innerHTML = notifs.slice(0, 25).map((n) => `
        <div class="notif-item${n.read_at ? '' : ' notif-item--unread'}" data-id="${esc(n.id)}">
          <span class="notif-item__icon" aria-hidden="true">${_notifIcon(n.type)}</span>
          <div class="notif-item__body">
            <p class="notif-item__title">${esc(n.title)}</p>
            <p class="notif-item__text">${esc(n.body)}</p>
            <p class="notif-item__time">${_relTime(n.created_at)}</p>
          </div>
        </div>
      `).join('');
      list.querySelectorAll('.notif-item').forEach((el) => {
        el.addEventListener('click', () => markRead(el.dataset.id));
      });
    }

    function updateBadge() {
      const count = getUnreadCount();
      badge.hidden = count === 0;
      badge.textContent = count > 9 ? '9+' : String(count);
      btn.setAttribute('aria-label', count
        ? `Notificações (${count} por ler)`
        : 'Notificações');
    }

    function updatePermUI() {
      if (!('Notification' in window)) { permDiv.hidden = true; return; }
      permDiv.hidden = Notification.permission !== 'default';
    }

    function openPanel() {
      panel.classList.add('notif-panel--open');
      btn.setAttribute('aria-expanded', 'true');
      renderList();
      updatePermUI();
    }

    function closePanel() {
      panel.classList.remove('notif-panel--open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.contains('notif-panel--open') ? closePanel() : openPanel();
    });

    const onDocClick = (e) => {
      if (!panel.classList.contains('notif-panel--open')) return;
      if (!panel.contains(e.target) && e.target !== btn) closePanel();
    };
    document.addEventListener('click', onDocClick);
    disposeNotif = () => document.removeEventListener('click', onDocClick);

    readAllBtn.addEventListener('click', async () => {
      await markAllRead();
      renderList();
    });

    enableBtn.addEventListener('click', async () => {
      const result = await requestPermission();
      if (result === 'granted' || result === 'denied') permDiv.hidden = true;
    });

    // Reagir a mudanças no inbox (Realtime + operações locais).
    onNotificationChange(() => {
      updateBadge();
      // Animar o sino.
      btn.classList.remove('notif-bell--pulse');
      void btn.offsetWidth; // força reflow para reiniciar a animação
      btn.classList.add('notif-bell--pulse');
      if (panel.classList.contains('notif-panel--open')) renderList();
    });

    await loadNotifications();
    subscribeRealtime();

    // Verificar presenças em falta (só coordenador; treinadores recebem
    // o lembrete 10 min antes via Edge Function agendada).
    if (state.profile?.role === 'coordenador') {
      await checkMissingAttendances(
        state.events, state.teams, state.players, state.attendances
      );
    }

    updateBadge();
    updatePermUI();
  }

  // -----------------------------------------------------------------------

  content.innerHTML = loadingHTML('A carregar os dados do clube…');
  try {
    if (!state.loaded) await loadAll();
    // Respeita o endereço com que a página abriu (link partilhado, recarga,
    // favorito) em vez de cair sempre no Painel.
    applyHash();
    setupNotifications().catch((err) => console.error('Notificações:', err));
  } catch (err) {
    // Sem dados, um atleta que já tenha visto o cartão continua a poder
    // mostrá-lo: é a única coisa de que precisa à entrada do pavilhão, que é
    // justamente onde a rede costuma faltar.
    if (!renderOfflineCard(content)) {
      content.innerHTML = errorHTML(
        'Não foi possível carregar os dados. Confirma a ligação e o esquema da base de dados.'
      );
    }
    console.error(err);
  }
}
