// Vista: Painel (resumo do clube).
// Cartões de métricas, barra de progresso da meta e próximos eventos.

import {
  state, savePainelPrefs, closeAttendanceSession, closeAttendanceSessions, dbErrorMessage,
} from '../store.js';
import { esc, euros } from '../ui.js';
import {
  totalRaised,
  inProgressCount,
  upcomingEvents,
  todayEvents,
  eventDateTime,
  eventTimeRange,
  teamById,
  teamName,
  quotasOwed,
  quotasThisMonth,
  pendingReviews,
  prospectsReady,
  attendanceStats,
  equipmentNeedsAttention,
  trainingsToMark,
  injuredCount,
  upcomingAppointments,
  apptDateTime,
  activeEpisode,
  expiringDocuments,
  objectivesNeedingAttention,
  trainingVsPlayingGaps,
  attendanceDrops,
  clubRecord,
  attendanceTrend,
  sport,
  myTeams,
  isMyEvent,
  trainingsWithoutPlan,
  gamesWithoutResult,
  myUnavailablePlayers,
} from '../compute.js';
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  AVAILABILITY_LABEL,
  AVAILABILITY_BADGE,
  APPOINTMENT_TYPE_LABEL,
  APPOINTMENT_TYPE_BADGE,
  EPISODE_STATUS_LABEL,
  EPISODE_STATUS_BADGE,
} from '../constants.js';
import {
  canEdit, canAccess, isFisio, isPreparador, isTreinador,
  canManageUsers, canManageSettings,
} from '../permissions.js';
import { openQuickAttendance } from './presencas.js';
import { openTrainingPlan } from './training-plan.js';
import { openEventForm, openRecurrentTrainings } from './calendario.js';
import { openSponsorForm } from './patrocinios.js';
import { openFinanceiroTab } from './financeiro.js';
import { openAthleteProfile } from './athlete-profile.js';
import { confirmDialog } from '../modal.js';
import { openSquadModal } from './convocatorias.js';
import { openResultModal } from './resultado.js';
import { toastError } from '../toast.js';
import { openSeasonPlanning } from './planteis.js';
import { DEFAULT_BRANDING } from '../branding.js';

const ICON_MONEY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v12m-3-3.5c0 1.38 1.34 2.5 3 2.5s3-1.12 3-2.5c0-1.74-1.35-2.17-3-2.5C10.35 11.67 9 11.24 9 9.5 9 8.12 10.34 7 12 7s3 1.12 3 2.5"/></svg>`;

const ICON_TROPHY = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3"/><path d="M7 5H4v2a3 3 0 0 0 3 3"/></svg>`;

const ICON_CHART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

const ICON_USERS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;

const ICON_COACH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

const ICON_CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const ICON_CARD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`;

const ICON_SHIELD = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

const ICON_BOX = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

const ICON_PULSE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

const ICON_CALENDAR = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

const ICON_DUMBBELL = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/></svg>`;

export function renderPainel(container) {
  // Painéis próprios para fisioterapeuta e preparador físico (resumo da sua área).
  if (isFisio()) return renderFisioPainel(container);
  if (isPreparador()) return renderPreparadorPainel(container);
  // O treinador tem o seu próprio painel: o dele não é o resumo do clube, é a
  // lista do que tem de fazer hoje nas suas equipas.
  if (isTreinador()) return renderTreinadorPainel(container);

  const raised = totalRaised();
  const goal = state.settings.goal || 0;
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  const inProgress = inProgressCount();
  const athletes = state.players.length;
  const coaches = state.coaches.length;
  const teamsCount = state.teams.length;
  const upcoming = upcomingEvents(5);

  const owed = quotasOwed();
  const att = attendanceStats();
  const equipReview = equipmentNeedsAttention();

  const canMark = canEdit('attendances');
  const toMark = canMark && alertOn('presencas') ? trainingsToMark(6) : [];
  const actions = buildActions();
  // Alertas de documentos a expirar/expirados/sem data (só para quem os pode ver).
  // A janela de antecedência vem das Definições (doc_alert_days).
  const docAlerts = canEdit('documents') && alertOn('documentos') ? expiringDocuments() : [];
  const today = todayEvents();
  const quick = quickActions();

  // Só se mostram os indicadores das secções a que o utilizador tem acesso —
  // um treinador não vê patrocínios, quotas, equipamentos nem treinadores.
  const seeSpon = canAccess('patrocinios');
  const seeQuotas = canAccess('quotas');
  const seeEquip = canAccess('equipamentos');
  const seeCoaches = canAccess('treinadores');
  const seePlanteis = canAccess('planteis');
  const seeAttendance = canAccess('presencas');
  const seeCalendar = canAccess('calendario');
  const seeMedico = canAccess('medico');
  const attRoute = 'presencas';
  const injured = seeMedico ? injuredCount() : 0;
  // Balanço competitivo e tendência das presenças: dois números que só existem
  // depois de haver resultados e histórico suficiente.
  const record = seeCalendar ? clubRecord(5) : { jogos: 0 };
  const trend = seeAttendance ? attendanceTrend(30) : null;

  const metrics = [
    seeSpon     && metricOn('angariado') && metricCard(ICON_MONEY, 'Angariado', euros(raised), `Meta: ${euros(goal)}`, 'accent', 'financeiro', 'patrocinios'),
    seeSpon     && metricOn('em_contacto') && metricCard(ICON_CHART, 'Em contacto', inProgress, 'patrocínios a decorrer', 'blue', 'financeiro', 'patrocinios'),
    seePlanteis && metricOn('atletas') && metricCard(ICON_USERS, 'Atletas', athletes, `em ${teamsCount} equipa${teamsCount === 1 ? '' : 's'}`, 'green', 'planteis'),
    seeCoaches  && metricOn('treinadores') && metricCard(ICON_COACH, 'Treinadores', coaches, 'na equipa técnica', 'purple', 'treinadores'),
    seeAttendance && metricOn('presencas') && metricCard(ICON_CHECK, 'Presenças', att.rate == null ? '—' : att.rate + '%', attendanceSub(att, trend), attendanceVariant(trend), attRoute),
    seeMedico   && metricOn('em_tratamento') && metricCard(ICON_PULSE, 'Em tratamento', injured, injured ? `atleta${injured === 1 ? '' : 's'} com episódio ativo` : 'sem lesões ativas', injured > 0 ? 'accent' : 'green', 'saude'),
    seeQuotas   && metricOn('em_divida') && metricCard(ICON_CARD, 'Em dívida', euros(owed.total), owed.count ? `${owed.count} quota${owed.count === 1 ? '' : 's'} por pagar` : 'tudo regularizado', owed.total > 0 ? 'accent' : 'blue', 'financeiro', 'quotas'),
    seeCalendar && metricOn('balanco') && record.jogos > 0 && metricCard(
      ICON_TROPHY, 'Balanço', `${record.vitorias}–${record.derrotas}`,
      `${record.taxa}% de vitórias · últimos ${record.recentes.length}: ${record.recentesV}V`,
      record.taxa >= 50 ? 'green' : 'accent', 'calendario'),
    seeEquip    && metricOn('equipamentos') && metricCard(ICON_BOX, 'Equipamentos', state.equipment.length, equipReview ? `${equipReview} em mau estado` : 'inventário em dia', equipReview ? 'accent' : 'purple', 'equipamentos'),
  ].filter(Boolean);

  const steps = firstSteps();

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">${todayLine(today)}</p>
      </div>
      <div class="hero-actions">
        ${quick.map((q) => `
          <button class="btn btn--ghost btn--sm" data-quick="${q.key}" type="button">${esc(q.label)}</button>
        `).join('')}
        ${availableAlerts().length || availableMetrics().length
          ? '<button class="btn btn--ghost btn--sm" id="alert-prefs" type="button">Personalizar</button>'
          : ''}
      </div>
    </header>

    ${steps ? stepsCard(steps) : ''}

    ${today.length && seeCalendar ? `<section class="card today-card">
      <h2 class="section-title upcoming-card__title">Hoje</h2>
      <ul class="today-list">${today.map(todayRow).join('')}</ul>
    </section>` : ''}

    ${metrics.length ? `<section class="cards-grid">${metrics.join('')}</section>` : ''}

    ${actions.length ? `<section class="card alerts-card">
      <h2 class="section-title upcoming-card__title">A precisar da tua atenção</h2>
      <ul class="alerts-list">${actions.map(actionItem).join('')}</ul>
    </section>` : ''}

    ${docAlerts.length ? `<section class="card alerts-card">
      <h2 class="section-title upcoming-card__title">Documentos a expirar</h2>
      <ul class="alerts-list">${docAlerts.map(docAlertItem).join('')}</ul>
    </section>` : ''}

    ${toMark.length ? `<section class="card mark-card">
      <h2 class="section-title upcoming-card__title">Presenças por marcar</h2>
      <ul class="mark-list">${toMark.map((m) => markRow(m)).join('')}</ul>
    </section>` : ''}

    ${seeSpon ? `<section class="card goal-card">
      <div class="goal-card__header">
        <h2 class="section-title goal-card__title">Meta de patrocínios</h2>
        <span class="goal-card__pct">${pct}%</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress__bar" style="width:${pct}%"></div>
      </div>
      <p class="muted goal-card__caption">
        ${euros(raised)} angariados de ${euros(goal)} na época ${esc(state.settings.season)}.
      </p>
    </section>` : ''}

    ${seeCalendar ? `<section class="card">
      <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
      ${upcoming.length ? upcomingList(upcoming) : '<p class="muted" style="margin:0.3rem 0 0">Sem eventos futuros agendados.</p>'}
    </section>` : ''}
  `;

  // Atalho: abre modal rápido de presenças diretamente do Painel.
  container.querySelectorAll('[data-mark-event]').forEach((btn) => {
    btn.addEventListener('click', () => openQuickAttendance(btn.dataset.markEvent));
  });

  // Atalho: abre o plano de treino do evento diretamente do Painel.
  container.querySelectorAll('[data-plan-event]').forEach((btn) => {
    btn.addEventListener('click', () => openTrainingPlan(btn.dataset.planEvent));
  });

  // Itens de ação: navegam para a secção respetiva (e, se marcado, abrem os
  // Plantéis já no modo "Planear época").
  container.querySelectorAll('[data-nav]').forEach((el) => {
    el.addEventListener('click', () => {
      if (el.dataset.plan) openSeasonPlanning();
      // Escolher o separador ANTES de navegar: a secção lê-o ao desenhar.
      if (el.dataset.finTabOpen) openFinanceiroTab(el.dataset.finTabOpen);
      navTo(el.dataset.nav);
    });
  });

  // Alertas de documentos: abrem a ficha do atleta (separador Geral).
  container.querySelectorAll('[data-doc-athlete]').forEach((el) => {
    el.addEventListener('click', () => openAthleteProfile(el.dataset.docAthlete, { tab: 'geral' }));
  });

  // Criação rápida: abre diretamente o formulário respetivo.
  container.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fn = QUICK_HANDLERS[btn.dataset.quick];
      if (fn) fn();
    });
  });

  // O botão vive no cabeçalho e não no cartão dos avisos: se estivesse no
  // cartão, quem escondesse tudo ficava sem forma de voltar atrás.
  container.querySelector('#alert-prefs')?.addEventListener('click', () =>
    openAlertPrefs(() => renderPainel(container))
  );
}

// --- Primeiros passos ----------------------------------------------------
// Um clube acabado de criar não tem nada: sem isto, o Painel mostra só
// indicadores a zero e não diz por onde começar. A lista aparece enquanto
// faltar algum passo essencial e desaparece sozinha quando estiver tudo feito.

// O clube já foi personalizado? Conta qualquer campo de marca afastado do
// valor por omissão — emblema, nomes, lema ou cores. Olhar só para o emblema
// deixava o passo por marcar a quem tinha mudado o nome e as cores.
function isBranded() {
  const s = state.settings || {};
  if (s.logo_url) return true;
  return ['club_name', 'app_name', 'motto', 'brand_primary', 'brand_accent'].some((key) => {
    const value = (s[key] || '').trim();
    if (!value) return false;
    return value.toLowerCase() !== String(DEFAULT_BRANDING[key]).toLowerCase();
  });
}

function firstSteps() {
  // Só faz sentido para quem pode mesmo criar as coisas (o coordenador).
  if (!canEdit('teams') || !canEdit('players')) return null;

  const steps = [
    {
      done: state.teams.length > 0,
      title: 'Criar a primeira equipa',
      sub: 'Escalão, género e treinador — a base de tudo o resto.',
      route: 'planteis',
    },
    {
      done: state.players.length > 0,
      title: 'Adicionar atletas',
      sub: 'Um a um, ou importa a lista toda de um ficheiro Excel.',
      route: 'planteis',
    },
    {
      done: state.events.length > 0,
      title: 'Agendar treinos e jogos',
      sub: 'Com o calendário preenchido podes marcar presenças.',
      route: 'calendario',
    },
    {
      done: (state.profiles?.length || 0) > 1 || (state.invitations?.length || 0) > 0,
      title: 'Convidar a tua equipa técnica',
      sub: 'Cada pessoa entra com a sua conta e vê só o que lhe compete.',
      route: 'utilizadores',
      can: canManageUsers,
    },
    {
      done: isBranded(),
      title: 'Personalizar o clube',
      sub: 'Emblema, cores e época — para a app ficar com a tua cara.',
      route: 'definicoes',
      can: canManageSettings,
    },
  ].filter((s) => (s.can ? s.can() : true));

  // Tudo feito: o cartão sai da frente e não volta.
  return steps.every((s) => s.done) ? null : steps;
}

function stepsCard(steps) {
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  return `
    <section class="card steps-card">
      <div class="steps-card__head">
        <div>
          <h2 class="section-title upcoming-card__title">Primeiros passos</h2>
          <p class="muted steps-card__caption">
            ${done} de ${steps.length} concluídos — clica num passo para o fazer.
          </p>
        </div>
        <span class="steps-card__pct">${pct}%</span>
      </div>
      <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="progress__bar" style="width:${pct}%"></div>
      </div>
      <ul class="steps-list">
        ${steps.map((s) => `
          <li>
            <button class="step-item${s.done ? ' step-item--done' : ''}" type="button" data-nav="${esc(s.route)}">
              <span class="step-item__mark" aria-hidden="true">${s.done ? '✓' : ''}</span>
              <span class="step-item__text">
                <strong class="step-item__title">${esc(s.title)}</strong>
                <span class="muted step-item__sub">${esc(s.sub)}</span>
              </span>
              <span class="alert-item__chevron" aria-hidden="true">›</span>
            </button>
          </li>
        `).join('')}
      </ul>
    </section>
  `;
}

// Saudação conforme a hora do dia.
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

// Nome a mostrar: o do treinador vinculado à conta, senão a parte local do email.
function displayName() {
  const uid = state.profile?.id;
  const coach = uid ? state.coaches.find((c) => c.user_id === uid) : null;
  if (coach?.name) return coach.name.split(/\s+/)[0];
  const email = state.profile?.email || '';
  return email ? email.split('@')[0] : '';
}

// Frase contextual sobre os eventos de hoje.
function todayLine(today) {
  if (!today.length) return 'Não há eventos agendados para hoje.';
  const n = today.length;
  const treinos = today.filter((e) => e.type === 'treino').length;
  const jogos = today.filter((e) => e.type === 'jogo').length;
  const partes = [];
  if (treinos) partes.push(`${treinos} treino${treinos === 1 ? '' : 's'}`);
  if (jogos) partes.push(`${jogos} jogo${jogos === 1 ? '' : 's'}`);
  const detalhe = partes.length ? ` (${partes.join(' · ')})` : '';
  return `Tens ${n} evento${n === 1 ? '' : 's'} hoje${detalhe}.`;
}

// Botões de criação rápida disponíveis para o utilizador atual.
function quickActions() {
  const list = [];
  if (canEdit('events')) {
    list.push({ key: 'event', label: '+ Evento' });
    list.push({ key: 'rec', label: '↺ Treinos' });
  }
  if (canEdit('sponsors')) list.push({ key: 'sponsor', label: '+ Patrocínio' });
  return list;
}

const QUICK_HANDLERS = {
  event: openEventForm,
  rec: openRecurrentTrainings,
  sponsor: openSponsorForm,
};

// Configurar que avisos aparecem. Só lista os que o utilizador PODE ver: a
// permissão manda, a preferência só escolhe dentro do que já era permitido.
function openAlertPrefs(onSaved) {
  const metricas = availableMetrics();
  const avisos = availableAlerts();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="ap-title"
         style="width:min(520px,96vw);max-height:90vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="ap-title">O meu painel</h2>
          <p class="muted" style="margin:0;font-size:0.84rem">
            Escolhe o que queres ver. A lista mostra só o que está ao teu alcance.
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div style="overflow-y:auto;flex:1">
        ${metricas.length ? `
          <p class="pd-label" style="margin:0.6rem 0 0.3rem">Indicadores</p>
          <div class="coach-checks" data-group="metrics">
            ${metricas.map((m) => `
              <label class="coach-check">
                <input type="checkbox" value="${esc(m.key)}" ${metricOn(m.key) ? 'checked' : ''} />
                <span>${esc(m.label)}</span>
              </label>`).join('')}
          </div>` : ''}
        <p class="pd-label" style="margin:1rem 0 0.3rem">Avisos</p>
        <div class="coach-checks" data-group="alerts">
          ${avisos.map((a) => `
            <label class="coach-check">
              <input type="checkbox" value="${esc(a.key)}" ${alertOn(a.key) ? 'checked' : ''} />
              <span>${esc(a.label)}</span>
            </label>`).join('')}
        </div>
      </div>
      <p class="modal__error hidden" id="ap-err" role="alert"></p>
      <div class="modal__actions">
        <button class="btn btn--ghost" type="button" id="ap-cancel">Cancelar</button>
        <button class="btn btn--primary" type="button" id="ap-save">Guardar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const close = () => {
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('#ap-cancel').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#ap-save').addEventListener('click', async () => {
    const btn = overlay.querySelector('#ap-save');
    const errEl = overlay.querySelector('#ap-err');
    // Guardam-se os DESLIGADOS (ver ALERT_CATALOG). Os avisos a que o
    // utilizador não tem acesso não entram na lista — se um dia ganhar esse
    // acesso, o aviso aparece, em vez de ficar escondido sem ele saber porquê.
    const desligados = (grupo) =>
      Array.from(overlay.querySelectorAll(`[data-group="${grupo}"] input[type=checkbox]`))
        .filter((c) => !c.checked)
        .map((c) => c.value);
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await savePainelPrefs(desligados('alerts'), desligados('metrics'));
      close();
      onSaved?.();
    } catch (err) {
      errEl.textContent = dbErrorMessage(err);
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });
}

// Legenda do cartão de Presenças. A média da época é o número grande, mas é a
// janela recente que diz se está a melhorar ou a piorar — e é isso que faz
// alguém agir. Sem dados dos dois lados não se inventa uma seta.
function attendanceSub(att, trend) {
  if (!att.total) return 'ainda sem registos';
  // Havendo tendência, é ela que ocupa a legenda: o número de registos é o
  // menos acionável dos dois, e as duas coisas juntas partiam a linha.
  if (trend?.recente) {
    const seta = trend.delta == null ? ''
      : trend.delta > 0 ? ` ↑${trend.delta}`
      : trend.delta < 0 ? ` ↓${Math.abs(trend.delta)}`
      : ' =';
    return `últimos 30 dias: ${trend.recente.rate}%${seta}`;
  }
  return `média em ${att.total} registo${att.total === 1 ? '' : 's'}`;
}

// Uma descida acentuada da comparência não pode ficar com a mesma cor de
// "está tudo bem" — é o sinal mais precoce de um escalão a esvaziar.
function attendanceVariant(trend) {
  return trend?.delta != null && trend.delta <= -10 ? 'accent' : 'green';
}

// Uma linha do resumo "Hoje".
function todayRow(ev) {
  const team = teamById(ev.team_id);
  const range = eventTimeRange(ev);
  const meta = [
    team ? teamName(team) : '',
    ev.opponent ? `vs ${esc(ev.opponent)}` : '',
    ev.location ? esc(ev.location) : '',
  ].filter(Boolean).join(' · ');

  return `
    <li class="today-item">
      <span class="today-item__time">${range ? esc(range) : '—'}</span>
      <div class="today-item__body">
        <span class="today-item__title">
          <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>
          ${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}
        </span>
        ${meta ? `<span class="muted today-item__meta">${meta}</span>` : ''}
      </div>
    </li>
  `;
}

// Navega para uma secção, reaproveitando os botões da barra lateral.
//
// Nem toda a rota tem botão: os Objetivos passaram a ser um separador do
// Painel e deixaram de ter entrada própria. Nesses casos escreve-se no hash,
// que é a fonte de verdade da navegação — o app-shell trata do resto
// (LEGACY_ROUTES abre a secção já no separador certo).
function navTo(route) {
  const btn = document.querySelector(`[data-route="${route}"]`);
  if (btn) btn.click();
  else location.hash = `#/${route}`;
}

// Catálogo dos avisos do Painel. Cada um declara quem o PODE ver (`can`) —
// isso não é preferência, é permissão, e nunca se contorna. A preferência do
// utilizador só escolhe entre os que ele já podia ver.
//
// Guardam-se os avisos ESCONDIDOS e não os visíveis: assim um aviso novo
// aparece a toda a gente por omissão, em vez de ficar invisível a quem já
// tinha preferências gravadas.
export const ALERT_CATALOG = [
  { key: 'quotas',          label: 'Quotas por cobrar',              can: () => canEdit('quotas') },
  { key: 'recrutamento',    label: 'Prospetos prontos a inscrever',  can: () => canEdit('prospects') },
  { key: 'equipamentos',    label: 'Equipamento em mau estado',      can: () => canEdit('equipment') },
  { key: 'objetivos',       label: 'Objetivos em risco',             can: () => canAccess('objetivos') },
  { key: 'gap_treino_jogo', label: 'Treina muito, joga pouco',       can: () => canAccess('planteis') },
  { key: 'queda_presencas', label: 'Quedas de comparência',          can: () => canAccess('presencas') },
  { key: 'avaliacoes',      label: 'Avaliações de atleta por decidir', can: () => canEdit('players') },
  { key: 'documentos',      label: 'Documentos a expirar',           can: () => canEdit('documents') },
  { key: 'presencas',       label: 'Presenças por marcar',           can: () => canEdit('attendances') },
];

// Catálogo dos INDICADORES (os cartões de números no topo). Mesma regra dos
// avisos: `can` é permissão e não se contorna; a preferência escolhe dentro
// do que já era permitido.
export const METRIC_CATALOG = [
  { key: 'angariado',    label: 'Angariado',     can: () => canAccess('patrocinios') },
  { key: 'em_contacto',  label: 'Em contacto',   can: () => canAccess('patrocinios') },
  { key: 'atletas',      label: 'Atletas',       can: () => canAccess('planteis') },
  { key: 'treinadores',  label: 'Treinadores',   can: () => canAccess('treinadores') },
  { key: 'presencas',    label: 'Presenças',     can: () => canAccess('presencas') },
  { key: 'em_tratamento',label: 'Em tratamento', can: () => canAccess('medico') },
  { key: 'em_divida',    label: 'Em dívida',     can: () => canAccess('quotas') },
  { key: 'balanco',      label: 'Balanço de jogos', can: () => canAccess('calendario') },
  { key: 'equipamentos', label: 'Equipamentos',  can: () => canAccess('equipamentos') },
];

export function availableMetrics() {
  if (!state.profile || !('hidden_metrics' in state.profile)) return [];
  return METRIC_CATALOG.filter((m) => m.can());
}

export function metricOn(key) {
  const hidden = state.profile?.hidden_metrics;
  return !(Array.isArray(hidden) && hidden.includes(key));
}

// Avisos que este utilizador pode ver (permissão) — a base da configuração.
export function availableAlerts() {
  // Sem a migração `painel-avisos.sql` não há onde guardar a escolha: mais vale
  // não oferecer o botão do que oferecer um que rebenta ao gravar.
  if (!state.profile || !('hidden_alerts' in state.profile)) return [];
  return ALERT_CATALOG.filter((a) => a.can());
}

// Um aviso está ligado? Escondido só se o utilizador o escondeu de propósito.
export function alertOn(key) {
  const hidden = state.profile?.hidden_alerts;
  return !(Array.isArray(hidden) && hidden.includes(key));
}

// Constrói a lista de ações pendentes (cada uma navega para a sua secção).
// Só inclui itens com algo por resolver; devolve [] se estiver tudo em dia.
function buildActions() {
  const items = [];

  if (canEdit('quotas') && alertOn('quotas')) {
    const qm = quotasThisMonth();
    if (qm.pendentes > 0) {
      items.push({
        variant: 'warn',
        route: 'financeiro',
        finTab: 'quotas',
        title: `${qm.pendentes} quota${qm.pendentes === 1 ? '' : 's'} por cobrar este mês`,
        sub: `${euros(qm.total)} por receber — abrir Quotas.`,
      });
    }
  }

  if (canEdit('prospects') && alertOn('recrutamento')) {
    const ready = prospectsReady();
    if (ready > 0) {
      items.push({
        variant: 'ok',
        route: 'recrutamento',
        title: `${ready} prospeto${ready === 1 ? '' : 's'} pronto${ready === 1 ? '' : 's'} a inscrever`,
        sub: 'Confirmados no recrutamento — inscrever no plantel.',
      });
    }
  }

  if (canEdit('equipment') && alertOn('equipamentos') && equipmentNeedsAttention() > 0) {
    const n = equipmentNeedsAttention();
    items.push({
      variant: 'danger',
      route: 'equipamentos',
      title: `${n} equipamento${n === 1 ? '' : 's'} em mau estado`,
      sub: 'Rever ou substituir — abrir Equipamentos.',
    });
  }

  // Objetivos em risco ou fora de prazo. Sem isto, a secção Objetivos só se vê
  // indo lá de propósito — e um KPI que ninguém olha não serve de nada.
  if (canAccess('objetivos') && alertOn('objetivos')) {
    objectivesNeedingAttention().slice(0, 3).forEach(({ obj, status, met, total }) => {
      const sub = obj.scope === 'todas'
        ? `${met} de ${total} equipas a cumprir — abrir Objetivos.`
        : status === 'falhado'
          ? 'O prazo passou sem se atingir — rever nos Objetivos.'
          : 'Vai atrasado face ao prazo — abrir Objetivos.';
      items.push({
        variant: status === 'falhado' ? 'danger' : 'warn',
        route: 'objetivos',
        title: `${obj.title}${status === 'falhado' ? ' — fora de prazo' : ' — em risco'}`,
        sub,
      });
    });
  }

  // Treina muito, joga pouco. Fica ANTES das avaliações por decidir porque é
  // informação com prazo: depois de o atleta sair, já não serve de nada.
  if (canAccess('planteis') && alertOn('gap_treino_jogo')) {
    // No voleibol a participação conta-se em pontos; nas modalidades com
    // relógio, em minutos.
    const unidade = sport() === 'voleibol' ? 'dos pontos' : 'dos minutos';
    trainingVsPlayingGaps(3).forEach((g) => {
      items.push({
        variant: 'warn',
        route: 'planteis',
        title: `${g.player.name} treina muito e joga pouco`,
        sub: `${g.presenca}% de presenças em ${g.treinos} treinos, mas ${g.participacao}% ${unidade} em ${g.jogos} jogos${g.team ? ' — ' + teamName(g.team) : ''}.`,
      });
    });
  }

  // Quedas de comparência. A tendência do clube é uma média e uma média
  // esconde o caso individual: enquanto o resto do plantel compensa, o número
  // global não mexe — e quando mexe o atleta já desistiu.
  if (canAccess('presencas') && alertOn('queda_presencas')) {
    attendanceDrops(3).forEach((d) => {
      const equipa = d.team ? ' — ' + teamName(d.team) : '';
      items.push({
        variant: 'warn',
        route: 'presencas',
        title: d.motivo === 'seguidas'
          ? `${d.player.name} faltou aos últimos ${d.faltasSeguidas} treinos`
          : `${d.player.name} deixou de aparecer aos treinos`,
        sub: d.motivo === 'seguidas'
          ? `Vinha a ${d.anterior}% antes destas faltas${equipa}.`
          : `De ${d.anterior}% para ${d.recente}% nos últimos ${d.treinosRecentes} treinos${equipa}.`,
      });
    });
  }

  if (canEdit('players') && alertOn('avaliacoes')) {
    const pend = pendingReviews();
    if (pend > 0 && state.players.length > 0) {
      items.push({
        variant: 'info',
        route: 'planteis',
        plan: true,
        title: `${pend} avaliaç${pend === 1 ? 'ão' : 'ões'} de atleta por decidir`,
        sub: 'Definir quem fica para a próxima época — planear nos Plantéis.',
      });
    }
  }

  return items;
}

function actionItem({ variant, title, sub, route, plan, finTab }) {
  return `
    <li>
      <button class="alert-item alert-item--${variant} alert-item--nav" data-nav="${route}"${
        plan ? ' data-plan="1"' : ''
      }${finTab ? ` data-fin-tab-open="${finTab}"` : ''} type="button">
        <span class="alert-item__dot" aria-hidden="true"></span>
        <span class="alert-item__text">
          <strong class="alert-item__title">${esc(title)}</strong>
          <span class="muted alert-item__sub">${esc(sub)}</span>
        </span>
        <span class="alert-item__chevron" aria-hidden="true">›</span>
      </button>
    </li>
  `;
}

// Uma linha do alerta "Documentos a expirar" — abre a ficha do atleta (onde os
// documentos vivem, no separador Geral) ao clicar.
function docAlertItem(row) {
  const variant = row.status === 'expired' ? 'danger' : row.status === 'missing' ? 'info' : 'warn';
  const date = row.expiresAt
    ? new Date(row.expiresAt + 'T00:00:00').toLocaleDateString('pt-PT',
        { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
  const sub = row.status === 'expired'
    ? `Expirou a ${date} — renovar.`
    : row.status === 'missing'
    ? 'Sem data de validade — atualizar.'
    : `Expira a ${date} (${row.daysLeft} dia${row.daysLeft === 1 ? '' : 's'}).`;
  return `
    <li>
      <button class="alert-item alert-item--${variant} alert-item--nav" data-doc-athlete="${esc(row.playerId)}" type="button">
        <span class="alert-item__dot" aria-hidden="true"></span>
        <span class="alert-item__text">
          <strong class="alert-item__title">${esc(row.docLabel)} — ${esc(row.player.name)}</strong>
          <span class="muted alert-item__sub">${esc(sub)}</span>
        </span>
        <span class="alert-item__chevron" aria-hidden="true">›</span>
      </button>
    </li>
  `;
}

// Uma linha do atalho "Presenças por marcar". `canClose` acrescenta o botão
// que marca falta a quem ficou sem registo (só faz sentido em treinos que já
// aconteceram) e `showAge` diz há quanto tempo o treino ficou por fechar.
function markRow({ event, total, marked, isToday }, { canClose = false, showAge = false } = {}) {
  const team = teamById(event.team_id);
  const dt = eventDateTime(event);
  const dateLabel = isToday
    ? 'Hoje'
    : dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const range = eventTimeRange(event);
  const falta = Math.max(0, total - marked);
  const idade = showAge ? idadeLabel(event) : '';
  const sub = [
    idade,
    total
      ? (marked === 0 ? `${total} atleta${total === 1 ? '' : 's'} por marcar`
         : `${falta} de ${total} por marcar`)
      : 'sem equipa associada',
  ].filter(Boolean).join(' · ');

  return `
    <li class="mark-item">
      <div class="mark-item__when">
        <span class="mark-item__date${isToday ? ' mark-item__date--today' : ''}">${esc(dateLabel)}</span>
        ${range ? `<span class="muted mark-item__time">${esc(range)}</span>` : ''}
      </div>
      <div class="mark-item__body">
        <span class="mark-item__title">${esc(team ? teamName(team) : (event.title || 'Treino'))}</span>
        <span class="muted mark-item__sub">${esc(sub)}</span>
      </div>
      <div style="display:flex;gap:0.4rem;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        ${canClose && total
          ? `<button class="btn btn--ghost btn--sm" data-close-event="${event.id}" type="button"
                     title="Marcar falta a quem ficou sem registo">Fechar</button>`
          : ''}
        <button class="btn btn--ghost btn--sm" data-plan-event="${event.id}" type="button">Plano</button>
        <button class="btn btn--accent btn--sm" data-mark-event="${event.id}" type="button"
                ${total ? '' : 'disabled'}>Marcar</button>
      </div>
    </li>
  `;
}

// `route` opcional: quando presente, o cartão fica clicável e navega para essa
// secção (data-nav, ligado em renderPainel). Sem rota, é só informativo.
// `finTab` abre o Financeiro já no separador certo (patrocínios/quotas).
function metricCard(icon, label, value, sub, variant = '', route = '', finTab = '') {
  const cls = `card metric ${variant ? 'metric--' + variant : ''}${route ? ' metric--nav' : ''}`;
  const inner = `
      <div class="metric__icon-wrap">${icon}</div>
      <span class="metric__label">${esc(label)}</span>
      <strong class="metric__value">${String(value)}</strong>
      <span class="metric__sub muted">${esc(sub)}</span>`;
  return route
    ? `<button class="${cls}" type="button" data-nav="${esc(route)}"${
        finTab ? ` data-fin-tab-open="${esc(finTab)}"` : ''
      } title="Abrir ${esc(label)}">${inner}</button>`
    : `<div class="${cls}">${inner}</div>`;
}

function upcomingList(events) {
  return `
    <ul class="event-mini">
      ${events
        .map((ev) => {
          const dt = eventDateTime(ev);
          const team = teamById(ev.team_id);
          const day = dt.toLocaleDateString('pt-PT', { day: '2-digit' });
          const mon = dt.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
          const time = ev.time ? ev.time.slice(0, 5) : '';
          const meta = [
            team ? teamName(team) : '',
            ev.opponent ? `vs ${esc(ev.opponent)}` : '',
            time ? time : '',
          ]
            .filter(Boolean)
            .join(' · ');
          return `
            <li class="event-mini__item">
              <div class="event-mini__date-block">
                <span class="event-mini__day">${day}</span>
                <span class="event-mini__mon">${mon}</span>
              </div>
              <div class="event-mini__body">
                <span class="event-mini__name">${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}</span>
                <span class="event-mini__meta">
                  <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>
                  ${meta ? `<span class="muted">${meta}</span>` : ''}
                </span>
              </div>
            </li>`;
        })
        .join('')}
    </ul>
  `;
}

// =========================================================================
// Painel do Fisioterapeuta — resumo do Departamento Médico.
// =========================================================================
function renderFisioPainel(container) {
  const injured = injuredCount();
  const upcoming = upcomingAppointments(8);
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayAppts = state.appointments.filter(
    (a) => a.status === 'agendado' && a.date === todayStr
  ).length;

  // Atletas com episódio em curso (ativo ou em recuperação), para a lista.
  const recovering = state.players
    .map((p) => ({ player: p, episode: activeEpisode(p.id) }))
    .filter((x) => x.episode)
    .sort((a, b) => (a.episode.status === 'ativo' ? 0 : 1) - (b.episode.status === 'ativo' ? 0 : 1));

  const metrics = [
    metricCard(ICON_PULSE, 'Em tratamento', injured, injured === 1 ? 'atleta com episódio ativo' : 'atletas com episódio ativo', injured > 0 ? 'accent' : 'green'),
    metricCard(ICON_CALENDAR, 'Atendimentos hoje', todayAppts, todayAppts ? 'agendados para hoje' : 'nada agendado hoje', todayAppts ? 'blue' : 'purple'),
    metricCard(ICON_CHECK, 'Próximos', upcoming.length, 'atendimentos por realizar', 'green'),
  ];

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">Resumo do Departamento Médico.</p>
      </div>
    </header>

    <section class="cards-grid">${metrics.join('')}</section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos atendimentos</h2>
      ${upcoming.length ? `<ul class="today-list">${upcoming.map(apptRow).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem atendimentos agendados.</p>'}
    </section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">Atletas em tratamento</h2>
      ${recovering.length ? `<ul class="today-list">${recovering.map(injuredRow).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Nenhum atleta com episódio em curso.</p>'}
    </section>
  `;

  container.querySelectorAll('[data-open-athlete]').forEach((el) => {
    const open = () => { if (el.dataset.openAthlete) openAthleteProfile(el.dataset.openAthlete, { tab: 'fisioterapia' }); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

function apptRow(a) {
  const player = state.players.find((p) => p.id === a.player_id);
  const dt = apptDateTime(a);
  const dateLabel = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const time = a.time && /^\d{2}:\d{2}/.test(a.time) ? a.time.slice(0, 5) : '';
  return `
    <li class="today-item today-item--link" data-open-athlete="${player?.id || ''}" role="button" tabindex="0">
      <span class="today-item__time">${esc(time || dateLabel)}</span>
      <div class="today-item__body">
        <span class="today-item__title">
          <span class="badge badge--${APPOINTMENT_TYPE_BADGE[a.type] || 'muted'}">${esc(APPOINTMENT_TYPE_LABEL[a.type] || a.type)}</span>
          ${esc(player?.name || 'Atleta')}
        </span>
        <span class="muted today-item__meta">${esc(time ? dateLabel : 'sem hora')}</span>
      </div>
    </li>
  `;
}

function injuredRow({ player, episode }) {
  return `
    <li class="today-item today-item--link" data-open-athlete="${player.id}" role="button" tabindex="0">
      <span class="today-item__time"><span class="badge badge--${EPISODE_STATUS_BADGE[episode.status] || 'muted'}">${esc(EPISODE_STATUS_LABEL[episode.status] || episode.status)}</span></span>
      <div class="today-item__body">
        <span class="today-item__title">${esc(player.name)}</span>
        ${episode.title || episode.body_area ? `<span class="muted today-item__meta">${esc([episode.title, episode.body_area].filter(Boolean).join(' · '))}</span>` : ''}
      </div>
    </li>
  `;
}

// =========================================================================
// Painel do Preparador Físico — resumo da Preparação Física.
// =========================================================================
function renderPreparadorPainel(container) {
  const now = new Date();
  const athletes = state.players.length;
  const upcomingGames = state.events
    .filter((e) => e.type === 'jogo' && eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, 8);
  const upcomingGym = state.gymSessions
    .filter((s) => new Date(s.date + 'T00:00:00') >= new Date(now.toISOString().slice(0, 10)))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 8);
  const testsCount = state.physicalTests.length;

  const metrics = [
    metricCard(ICON_USERS, 'Atletas', athletes, `em ${state.teams.length} equipa${state.teams.length === 1 ? '' : 's'}`, 'green'),
    metricCard(ICON_DUMBBELL, 'Treinos de ginásio', upcomingGym.length, upcomingGym.length ? 'agendados a seguir' : 'nada agendado', 'blue'),
    metricCard(ICON_CHART, 'Avaliações físicas', testsCount, 'registadas no total', 'purple'),
  ];

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">Resumo da Preparação Física.</p>
      </div>
    </header>

    <section class="cards-grid">${metrics.join('')}</section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos treinos de ginásio</h2>
      ${upcomingGym.length ? `<ul class="today-list">${upcomingGym.map(gymRow).join('')}</ul>`
        : '<p class="muted" style="margin:0.3rem 0 0">Sem treinos de ginásio agendados.</p>'}
    </section>

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos jogos</h2>
      ${upcomingGames.length ? upcomingList(upcomingGames)
        : '<p class="muted" style="margin:0.3rem 0 0">Sem jogos agendados.</p>'}
    </section>
  `;
}

function gymRow(s) {
  const team = teamById(s.team_id);
  const dt = new Date(s.date + 'T00:00:00');
  const dateLabel = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  return `
    <li class="today-item">
      <span class="today-item__time">${esc(dateLabel)}</span>
      <div class="today-item__body">
        <span class="today-item__title">${esc(s.title || 'Treino de ginásio')}</span>
        <span class="muted today-item__meta">${[team ? teamName(team) : '', s.duration_min ? s.duration_min + ' min' : ''].filter(Boolean).join(' · ') || '—'}</span>
      </div>
    </li>
  `;
}

// =========================================================================
// Painel do Treinador
// =========================================================================
// O painel genérico é o resumo do CLUBE — angariado, quotas, inventário. Para
// quem treina, isso é informação de outra pessoa. Este painel responde a três
// perguntas, por esta ordem: o que tenho hoje, o que ficou por fechar, e o que
// tenho de preparar. Tudo recortado às SUAS equipas.
//
// A lista de presenças por marcar é o centro do ecrã e não um cartão no fundo:
// é a tarefa que se acumula (um treino por marcar vira quinze em três semanas)
// e a única que, por ficar por fazer, estraga todos os números que a app
// calcula a seguir — a taxa de comparência, as quedas individuais, o "treina
// muito, joga pouco".

// Mostrar tudo ou só as primeiras? Uma lista de 30 treinos empurrava o resto
// do painel para fora do ecrã; escondê-los de vez era fingir que não existem.
let markExpanded = false;
const MARK_PREVIEW = 6;
// Uma sessão "antiga" é o que já não se vai marcar de memória. Uma semana é o
// ponto em que o treinador deixa de saber quem lá esteve.
const OLD_SESSION_DAYS = 7;

function renderTreinadorPainel(container) {
  const teams = myTeams();
  const teamIds = new Set(teams.map((t) => t.id));
  const players = state.players.filter((p) => teamIds.has(p.team_id));
  const today = todayEvents().filter(isMyEvent);
  const canMark = canEdit('attendances');

  // Todos os treinos por marcar (não só os primeiros 6: o problema é
  // precisamente serem muitos).
  const toMark = canMark ? trainingsToMark(500) : [];
  const atrasados = toMark.filter((m) => !m.isToday);
  const antigos = atrasados.filter((m) => daysAgo(m.event) >= OLD_SESSION_DAYS);

  const semPlano = trainingsWithoutPlan(7);
  const semResultado = canEdit('game_results') ? gamesWithoutResult(5) : [];
  const limitados = myUnavailablePlayers();
  const att = attendanceStats();
  const trend = attendanceTrend(30);
  const upcoming = upcomingEvents(20).filter(isMyEvent).slice(0, 5);
  const proximoJogo = state.events
    .filter((e) => e.type === 'jogo' && isMyEvent(e) && eventDateTime(e) >= new Date())
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))[0] || null;

  const metrics = [
    canMark && metricCard(
      ICON_CHECK, 'Por marcar', toMark.length,
      toMark.length
        ? (atrasados.length
            ? `${atrasados.length} de treinos já passados`
            : 'todos de hoje')
        : 'presenças em dia',
      toMark.length ? 'accent' : 'green', 'presencas'),
    metricCard(ICON_USERS, 'Atletas', players.length,
      `em ${teams.length} equipa${teams.length === 1 ? '' : 's'}`, 'green', 'planteis'),
    canAccess('presencas') && metricCard(
      ICON_CHART, 'Comparência', att.rate == null ? '—' : att.rate + '%',
      attendanceSub(att, trend), attendanceVariant(trend), 'presencas'),
    proximoJogo && metricCard(
      ICON_TROPHY, 'Próximo jogo', diasAte(proximoJogo),
      [teamName(teamById(proximoJogo.team_id)), proximoJogo.opponent ? 'vs ' + proximoJogo.opponent : '']
        .filter(Boolean).join(' · ') || 'agendado',
      'blue', 'calendario'),
  ].filter(Boolean);

  const actions = buildActions();

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">
          ${esc(teams.length ? teams.map(teamName).join(' · ') : 'Ainda não estás ligado a nenhuma equipa.')}
          ${today.length ? ' — ' + esc(todayLine(today).replace(/^Tens /, 'tens ')) : ''}
        </p>
      </div>
      <div class="hero-actions">
        ${availableAlerts().length || availableMetrics().length
          ? '<button class="btn btn--ghost btn--sm" id="alert-prefs" type="button">Personalizar</button>'
          : ''}
      </div>
    </header>

    ${metrics.length ? `<section class="cards-grid">${metrics.join('')}</section>` : ''}

    ${today.length ? `<section class="card today-card">
      <h2 class="section-title upcoming-card__title">Hoje</h2>
      <ul class="mark-list">${today.map(coachTodayRow).join('')}</ul>
    </section>` : ''}

    ${toMark.length ? markCard(toMark, atrasados, antigos) : ''}

    ${semPlano.length ? `<section class="card mark-card">
      <h2 class="section-title upcoming-card__title">Treinos por preparar</h2>
      <p class="muted" style="margin:0 0 0.5rem;font-size:0.85rem">
        Próximos 7 dias, ainda sem exercícios no plano.
      </p>
      <ul class="mark-list">${semPlano.slice(0, 6).map(planRow).join('')}</ul>
    </section>` : ''}

    ${semResultado.length ? `<section class="card mark-card">
      <h2 class="section-title upcoming-card__title">Jogos por registar</h2>
      <ul class="mark-list">${semResultado.map(resultRow).join('')}</ul>
    </section>` : ''}

    ${actions.length ? `<section class="card alerts-card">
      <h2 class="section-title upcoming-card__title">A precisar da tua atenção</h2>
      <ul class="alerts-list">${actions.map(actionItem).join('')}</ul>
    </section>` : ''}

    ${limitados.length ? `<section class="card">
      <h2 class="section-title upcoming-card__title">Não estão a 100%</h2>
      <ul class="today-list">${limitados.slice(0, 8).map(limitedRow).join('')}</ul>
    </section>` : ''}

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
      ${upcoming.length ? upcomingList(upcoming)
        : '<p class="muted" style="margin:0.3rem 0 0">Sem eventos futuros agendados.</p>'}
    </section>
  `;

  wireCoachPainel(container, antigos);
}

// Cartão central: tudo o que está por marcar, separado entre o que é de hoje
// (ainda fresco) e o que ficou para trás.
function markCard(toMark, atrasados, antigos) {
  const hoje = toMark.filter((m) => m.isToday);
  const visiveis = markExpanded ? atrasados : atrasados.slice(0, MARK_PREVIEW);
  const escondidos = atrasados.length - visiveis.length;

  return `
    <section class="card mark-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:0.6rem;flex-wrap:wrap">
        <h2 class="section-title upcoming-card__title" style="margin:0">
          Presenças por marcar <span class="muted">(${toMark.length})</span>
        </h2>
        ${antigos.length > 1
          ? `<button class="btn btn--ghost btn--sm" data-close-old type="button"
                     title="Marca falta a quem ficou sem qualquer registo nesses treinos">
               Fechar ${antigos.length} sessões antigas
             </button>`
          : ''}
      </div>
      ${hoje.length ? `
        <p class="pd-label" style="margin:0.7rem 0 0.2rem">Hoje</p>
        <ul class="mark-list">${hoje.map((m) => markRow(m)).join('')}</ul>` : ''}
      ${visiveis.length ? `
        <p class="pd-label" style="margin:0.7rem 0 0.2rem">Por fechar</p>
        <ul class="mark-list">${visiveis.map((m) => markRow(m, { canClose: true, showAge: true })).join('')}</ul>` : ''}
      ${escondidos > 0
        ? `<button class="btn btn--ghost btn--sm" data-mark-more type="button" style="margin-top:0.6rem">
             Ver os restantes ${escondidos}
           </button>`
        : ''}
      ${markExpanded && atrasados.length > MARK_PREVIEW
        ? `<button class="btn btn--ghost btn--sm" data-mark-less type="button" style="margin-top:0.6rem">
             Mostrar menos
           </button>`
        : ''}
    </section>
  `;
}

// Linha de "Hoje": mostra o evento e o que se pode fazer com ele agora.
function coachTodayRow(ev) {
  const team = teamById(ev.team_id);
  const range = eventTimeRange(ev);
  const isJogo = ev.type === 'jogo';
  return `
    <li class="mark-item">
      <div class="mark-item__when">
        <span class="mark-item__date mark-item__date--today">${esc(range || 'Hoje')}</span>
        <span class="muted mark-item__time">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>
      </div>
      <div class="mark-item__body">
        <span class="mark-item__title">${esc(team ? teamName(team) : (ev.title || 'Evento'))}</span>
        <span class="muted mark-item__sub">${esc([
          ev.opponent ? 'vs ' + ev.opponent : '',
          ev.location || '',
        ].filter(Boolean).join(' · ') || '—')}</span>
      </div>
      <div style="display:flex;gap:0.4rem;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        ${isJogo
          ? `${canEdit('squads') && ev.team_id ? `<button class="btn btn--ghost btn--sm" data-squad-event="${ev.id}" type="button">Convocatória</button>` : ''}
             ${canEdit('game_results') ? `<button class="btn btn--accent btn--sm" data-result-event="${ev.id}" type="button">Resultado</button>` : ''}`
          : `<button class="btn btn--ghost btn--sm" data-plan-event="${ev.id}" type="button">Plano</button>
             ${canEdit('attendances') ? `<button class="btn btn--accent btn--sm" data-mark-event="${ev.id}" type="button">Marcar</button>` : ''}`}
      </div>
    </li>
  `;
}

// Linha de "Treinos por preparar".
function planRow(ev) {
  const team = teamById(ev.team_id);
  const dt = eventDateTime(ev);
  const dateLabel = dt.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' });
  const range = eventTimeRange(ev);
  return `
    <li class="mark-item">
      <div class="mark-item__when">
        <span class="mark-item__date">${esc(dateLabel)}</span>
        ${range ? `<span class="muted mark-item__time">${esc(range)}</span>` : ''}
      </div>
      <div class="mark-item__body">
        <span class="mark-item__title">${esc(team ? teamName(team) : (ev.title || 'Treino'))}</span>
        <span class="muted mark-item__sub">Sem exercícios no plano</span>
      </div>
      <div style="flex-shrink:0">
        <button class="btn btn--accent btn--sm" data-plan-event="${ev.id}" type="button">Preparar</button>
      </div>
    </li>
  `;
}

// Linha de "Jogos por registar".
function resultRow(ev) {
  const team = teamById(ev.team_id);
  const dias = daysAgo(ev);
  return `
    <li class="mark-item">
      <div class="mark-item__when">
        <span class="mark-item__date">${esc(eventDateTime(ev).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }))}</span>
        <span class="muted mark-item__time">há ${dias}d</span>
      </div>
      <div class="mark-item__body">
        <span class="mark-item__title">${esc(team ? teamName(team) : (ev.title || 'Jogo'))}</span>
        <span class="muted mark-item__sub">${esc(ev.opponent ? 'vs ' + ev.opponent : 'sem adversário registado')}</span>
      </div>
      <div style="flex-shrink:0">
        <button class="btn btn--accent btn--sm" data-result-event="${ev.id}" type="button">Registar</button>
      </div>
    </li>
  `;
}

// Linha de "Não estão a 100%". Abre a ficha do atleta (separador Geral) — o
// treinador vê o resumo da disponibilidade e as limitações, nunca o detalhe
// clínico.
function limitedRow({ player, av }) {
  const team = teamById(player.team_id);
  return `
    <li class="today-item today-item--link" data-open-athlete="${player.id}" role="button" tabindex="0">
      <span class="today-item__time">
        <span class="badge badge--${AVAILABILITY_BADGE[av.status] || 'muted'}">
          ${esc(AVAILABILITY_LABEL[av.status] || av.status)}
        </span>
      </span>
      <div class="today-item__body">
        <span class="today-item__title">${esc(player.name)}</span>
        <span class="muted today-item__meta">${esc([
          team ? teamName(team) : '',
          av.limitations || '',
        ].filter(Boolean).join(' · ') || '—')}</span>
      </div>
    </li>
  `;
}

function wireCoachPainel(container, antigos) {
  const repaint = () => renderTreinadorPainel(container);

  container.querySelectorAll('[data-mark-event]').forEach((btn) =>
    btn.addEventListener('click', () => openQuickAttendance(btn.dataset.markEvent))
  );
  container.querySelectorAll('[data-plan-event]').forEach((btn) =>
    btn.addEventListener('click', () => openTrainingPlan(btn.dataset.planEvent))
  );
  container.querySelectorAll('[data-result-event]').forEach((btn) =>
    btn.addEventListener('click', () => openResultModal(btn.dataset.resultEvent))
  );
  container.querySelectorAll('[data-squad-event]').forEach((btn) =>
    btn.addEventListener('click', () => openSquadModal(btn.dataset.squadEvent))
  );
  container.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => {
      if (el.dataset.plan) openSeasonPlanning();
      if (el.dataset.finTabOpen) openFinanceiroTab(el.dataset.finTabOpen);
      navTo(el.dataset.nav);
    })
  );
  container.querySelectorAll('[data-open-athlete]').forEach((el) => {
    const open = () => openAthleteProfile(el.dataset.openAthlete, { tab: 'geral' });
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });

  container.querySelector('[data-mark-more]')?.addEventListener('click', () => {
    markExpanded = true;
    repaint();
  });
  container.querySelector('[data-mark-less]')?.addEventListener('click', () => {
    markExpanded = false;
    repaint();
  });

  container.querySelectorAll('[data-close-event]').forEach((btn) =>
    btn.addEventListener('click', () => closeOne(btn.dataset.closeEvent))
  );
  container.querySelector('[data-close-old]')?.addEventListener('click', () => closeOld(antigos));

  container.querySelector('#alert-prefs')?.addEventListener('click', () =>
    openAlertPrefs(repaint)
  );
}

// Fechar UM treino: quem ficou sem registo leva falta. Sem isto, o ausente
// fica só "sem registo" — que não conta para a taxa de comparência e faz o
// número parecer melhor do que é.
async function closeOne(eventId) {
  const row = trainingsToMark(500).find((m) => m.event.id === eventId);
  const falta = row ? Math.max(0, row.total - row.marked) : 0;
  const ok = await confirmDialog(
    `Marcar falta a ${falta} atleta${falta === 1 ? '' : 's'} sem registo neste treino? Quem já tem estado não é alterado.`,
    { confirmLabel: 'Fechar treino' }
  );
  if (!ok) return;
  try {
    await closeAttendanceSession(eventId);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// Fechar TODAS as sessões antigas de uma vez. É a saída para quem tem semanas
// acumuladas: marcar treino a treino de há um mês não é registo, é ficção — o
// que se sabe mesmo é quem não tem registo nenhum.
async function closeOld(antigos) {
  const ids = antigos.map((m) => m.event.id);
  const total = antigos.reduce((s, m) => s + Math.max(0, m.total - m.marked), 0);
  const ok = await confirmDialog(
    `Fechar ${ids.length} treinos com mais de ${OLD_SESSION_DAYS} dias? Marca falta a ${total} registo${total === 1 ? '' : 's'} em falta; quem já tem estado não é alterado.`,
    { confirmLabel: 'Fechar sessões' }
  );
  if (!ok) return;
  try {
    await closeAttendanceSessions(ids);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// "ontem" / "há 5 dias" / "há 3 semanas" — a idade do treino por fechar.
function idadeLabel(ev) {
  const dias = daysAgo(ev);
  if (dias <= 0) return '';
  if (dias === 1) return 'ontem';
  if (dias < 14) return `há ${dias} dias`;
  const semanas = Math.floor(dias / 7);
  return `há ${semanas} semanas`;
}

// Dias inteiros desde o evento (0 = hoje).
function daysAgo(ev) {
  const diff = Date.now() - eventDateTime(ev).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

// "3 dias" / "amanhã" / "hoje" até um evento futuro.
function diasAte(ev) {
  const dias = Math.ceil((eventDateTime(ev).getTime() - Date.now()) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'amanhã';
  return `${dias} dias`;
}
