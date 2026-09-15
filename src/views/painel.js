// Vista: Painel (resumo do clube).
// Cartões de métricas, barra de progresso da meta e próximos eventos.

import {
  state, savePainelPrefs, closeAttendanceSession, closeAttendanceSessions, dbErrorMessage,
} from '../store.js';
import { esc, euros } from '../ui.js';
import {
  totalRaised,
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
  upcomingBirthdays,
  playersWithoutBirthday,
  birthDateReady,
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
  canEdit, canAccess, canDecideRequests, isFisio, isPreparador, isTreinador,
  canManageUsers, canManageSettings,
} from '../permissions.js';
import { openQuickAttendance } from './presencas.js';
import { openTrainingPlan } from './training-plan.js';
import { openEventForm, openRecurrentTrainings } from './calendario.js';
import { openSponsorForm } from './patrocinios.js';
import { openFinanceiroTab } from './financeiro.js';
import { openAthleteProfile } from './athlete-profile.js';
import { confirmDialog, wireDialog } from '../modal.js';
import { setSelectedEvent } from './presencas.js';
import { openResultModal } from './resultado.js';
import { toastError } from '../toast.js';
import { openSeasonPlanning } from './planteis.js';
import { DEFAULT_BRANDING } from '../branding.js';



const ICON_CHART = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

const ICON_USERS = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;


const ICON_CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;




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
  const athletes = state.players.length;
  const teamsCount = state.teams.length;

  const owed = quotasOwed();
  const att = attendanceStats();

  const actions = buildActions({ includePresencas: true });
  const today = todayEvents();
  const todayIds = new Set(today.map((e) => e.id));
  // "Próximos eventos" exclui os de HOJE: `upcomingEvents` filtra por
  // `>= agora`, por isso o treino das 19h aparecia ao mesmo tempo no cartão
  // "Hoje" e três blocos abaixo, em "Próximos". Ler o mesmo evento duas vezes
  // no mesmo ecrã é o que faz o painel parecer cheio sem dizer mais nada.
  const upcoming = upcomingEvents(12).filter((e) => !todayIds.has(e.id)).slice(0, 5);
  const quick = quickActions();

  // Só se mostram os indicadores das secções a que o utilizador tem acesso.
  const seeSpon = canAccess('patrocinios');
  const seeQuotas = canAccess('quotas');
  const seePlanteis = canAccess('planteis');
  const seeAttendance = canAccess('presencas');
  const seeCalendar = canAccess('calendario');
  const seeMedico = canAccess('medico');
  const injured = seeMedico ? injuredCount() : 0;
  const record = seeCalendar ? clubRecord(5) : { jogos: 0 };
  const trend = seeAttendance ? attendanceTrend(30) : null;

  // A meta de patrocínios deixou de ter cartão próprio: era o mesmo par de
  // números do indicador "Angariado" ("Angariado / Meta: X" em cima, "X
  // angariados de Y" em baixo), com uma barra pelo meio. Ficou a percentagem
  // no subtítulo, que é a única coisa que a barra dizia a mais.
  const stats = [
    seeSpon && metricOn('angariado') && {
      label: 'Angariado', value: euros(raised),
      sub: goal > 0 ? `${pct}% de ${euros(goal)}` : 'sem meta definida',
      tone: goal > 0 && pct >= 100 ? 'ok' : '', route: 'financeiro', finTab: 'patrocinios',
    },
    seePlanteis && metricOn('atletas') && {
      label: 'Atletas', value: athletes,
      sub: `em ${teamsCount} equipa${teamsCount === 1 ? '' : 's'}`, route: 'planteis',
    },
    seeAttendance && metricOn('presencas') && {
      label: 'Presenças', value: att.rate == null ? '—' : att.rate + '%',
      sub: attendanceSub(att, trend),
      tone: trend && trend.delta != null && trend.delta <= -10 ? 'warn' : '',
      route: 'presencas',
    },
    seeQuotas && metricOn('em_divida') && {
      label: 'Em dívida', value: euros(owed.total),
      sub: owed.count ? `${owed.count} quota${owed.count === 1 ? '' : 's'} por pagar` : 'tudo regularizado',
      tone: owed.total > 0 ? 'warn' : 'ok', route: 'financeiro', finTab: 'quotas',
    },
    seeMedico && metricOn('em_tratamento') && {
      label: 'Em tratamento', value: injured,
      sub: injured ? `atleta${injured === 1 ? '' : 's'} com episódio ativo` : 'sem lesões ativas',
      tone: injured > 0 ? 'warn' : 'ok', route: 'saude',
    },
    seeCalendar && metricOn('balanco') && record.jogos > 0 && {
      label: 'Balanço', value: `${record.vitorias}–${record.derrotas}`,
      sub: `${record.taxa}% de vitórias`,
      tone: record.taxa >= 50 ? 'ok' : 'warn', route: 'calendario',
    },
  ].filter(Boolean);

  const steps = firstSteps();

  // --- A ordem depende do dia ---------------------------------------------
  // Um painel fixo serve mal os dois dias que existem. No dia em que há um
  // documento caducado e uma atleta a desistir, nove números antes disso são
  // nove linhas entre o coordenador e o problema; no dia em que não há nada
  // urgente, uma caixa vazia de "atenção" no topo é ruído. Por isso um só
  // interruptor — há trabalho no degrau "Agora"? — decide o que vem primeiro.
  const urgente = actions.some((a) => a.urgency === 'agora');
  const work = workCard(actions);
  const strip = statStrip(stats);
  const corpo = urgente ? [work, strip] : [strip, work];

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">${heroLine(today, actions, urgente)}</p>
        ${birthdayLine()}
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

    ${corpo.join('')}

    ${seeCalendar ? `<section class="card">
      <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
      ${upcoming.length ? upcomingList(upcoming) : '<p class="muted" style="margin:0.3rem 0 0">Sem outros eventos agendados.</p>'}
    </section>` : ''}
  `;

  wireWorkCard(container, () => renderPainel(container));

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
      ${!state.teams.length && canManageSettings() ? `
        <p class="muted steps-card__caption" style="margin:1rem 0 0.6rem">
          Preferes ver a app a funcionar antes de escrever seja o que for?
        </p>
        <button class="btn btn--ghost btn--sm" type="button" data-nav="definicoes">
          Criar dados de exemplo
        </button>` : ''}
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

// Primeira linha do cabeçalho. Muda com o dia: quando há trabalho no degrau
// "Agora" é ISSO que se diz (e a lista sobe para cima dos números); quando não
// há, volta a ser a agenda do dia. Uma frase fixa servia mal os dois dias.
function heroLine(today, actions, urgente) {
  const eventos = today.length
    ? `${today.length} evento${today.length === 1 ? '' : 's'} hoje`
    : '';
  if (urgente) {
    const n = actions.filter((a) => a.urgency === 'agora').length;
    const cabeca = `${n} coisa${n === 1 ? '' : 's'} precisa${n === 1 ? '' : 'm'} de ti agora`;
    return eventos ? `${cabeca} · ${eventos}.` : `${cabeca}.`;
  }
  if (today.length) return todayLine(today);
  return actions.length
    ? 'Nada urgente hoje — há coisas por fazer aqui em baixo.'
    : 'Não há eventos hoje e não há nada pendente. Está tudo em dia.';
}

// Liga o "Ver tudo" da lista de trabalho (estado de UI da vista).
function wireWorkCard(container, rerender) {
  container.querySelector('#work-more')?.addEventListener('click', () => {
    workExpanded = true;
    rerender();
  });
  container.querySelector('#work-less')?.addEventListener('click', () => {
    workExpanded = false;
    rerender();
  });
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
  const close = wireDialog(overlay);
  overlay.querySelector('#ap-cancel').addEventListener('click', close);

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
  { key: 'pedidos_equipamento', label: 'Pedidos de equipamento por decidir', can: () => canDecideRequests() },
  { key: 'objetivos',       label: 'Objetivos em risco',             can: () => canAccess('objetivos') },
  { key: 'gap_treino_jogo', label: 'Treina muito, joga pouco',       can: () => canAccess('planteis') },
  { key: 'queda_presencas', label: 'Quedas de comparência',          can: () => canAccess('presencas') },
  { key: 'avaliacoes',      label: 'Avaliações de atleta por decidir', can: () => canEdit('players') },
  { key: 'documentos',      label: 'Documentos a expirar',           can: () => canEdit('documents') },
  { key: 'presencas',       label: 'Presenças por marcar',           can: () => canEdit('attendances') },
  { key: 'aniversarios',    label: 'Aniversários no cabeçalho',      can: () => canAccess('planteis') },
  { key: 'aniversarios_falta', label: 'Datas de nascimento por preencher', can: () => canEdit('players') },
];

// Catálogo dos INDICADORES (os cartões de números no topo). Mesma regra dos
// avisos: `can` é permissão e não se contorna; a preferência escolhe dentro
// do que já era permitido.
// Saíram três: `treinadores` e `em_contacto` eram números estáticos meses a
// fio (um clube tem 6 treinadores em setembro e 6 em maio) — é o mesmo
// argumento que já tinha eliminado o cartão "Equipas"; e `equipamentos`
// dizia no subtítulo exatamente o aviso que já está na lista de trabalho.
// Um indicador que nunca muda e nunca pede nada é espaço gasto acima do que
// pede.
export const METRIC_CATALOG = [
  { key: 'angariado',    label: 'Angariado',     can: () => canAccess('patrocinios') },
  { key: 'atletas',      label: 'Atletas',       can: () => canAccess('planteis') },
  { key: 'presencas',    label: 'Presenças',     can: () => canAccess('presencas') },
  { key: 'em_divida',    label: 'Em dívida',     can: () => canAccess('quotas') },
  { key: 'em_tratamento',label: 'Em tratamento', can: () => canAccess('medico') },
  { key: 'balanco',      label: 'Balanço de jogos', can: () => canAccess('calendario') },
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
// --- O que precisa de ti -------------------------------------------------
// Antes havia TRÊS caixas a responder à mesma pergunta ("A precisar da tua
// atenção", "Documentos a expirar", "Presenças por marcar") e uma lista sem
// teto: três objetivos, três gaps, três quedas e cinco aniversários davam
// dezanove linhas. Uma lista de dezanove atenções não é uma lista de atenção.
//
// Agora é UMA lista, e cada item declara duas coisas:
//   `urgency` — em que degrau cai (`agora` | `semana` | `depois`). Não é
//     decoração: é o que decide a ORDEM do painel inteiro (ver `renderPainel`).
//     "A Rita deixou de aparecer aos treinos" e "faltam 3 datas de nascimento"
//     tinham o mesmo peso visual, e uma é uma atleta a desistir do clube.
//   `family` — a que grupo pertence. Uma família com 3 ou mais itens colapsa
//     numa linha só com os nomes no subtítulo: o painel é o ponteiro, a secção
//     é o detalhe. Com dois ainda vale a pena ver os dois.
const FAMILY_SUMMARY = {
  objetivos:  (n) => `${n} objetivos em risco ou fora de prazo`,
  gap:        (n) => `${n} atletas treinam muito e jogam pouco`,
  queda:      (n) => `${n} atletas deixaram de aparecer aos treinos`,
  documentos: (n) => `${n} documentos por renovar`,
};
const FAMILY_COLLAPSE_AT = 3;

// Degraus, por ordem de apresentação. O rótulo diz quando, não o que.
export const WORK_STEPS = [
  { key: 'agora',  label: 'Agora' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'depois', label: 'Quando puderes' },
];

// `includePresencas`: só o coordenador. O treinador tem o cartão inteiro das
// presenças por marcar (é o centro do ecrã dele) e uma linha-resumo aqui era
// a mesma coisa duas vezes no mesmo scroll.
function buildActions({ includePresencas = false } = {}) {
  const items = [];

  // Presenças por marcar — uma linha, não um cartão. Quem marca presenças é o
  // treinador; ao coordenador isto é supervisão, e o que ele precisa de saber
  // é se está a acumular.
  if (includePresencas && canEdit('attendances') && alertOn('presencas')) {
    const pend = trainingsToMark(500);
    const atrasados = pend.filter((m) => !m.isToday);
    if (pend.length) {
      items.push({
        urgency: atrasados.length ? 'agora' : 'semana',
        variant: atrasados.length ? 'danger' : 'warn',
        route: 'presencas',
        title: `${pend.length} treino${pend.length === 1 ? '' : 's'} com presenças por marcar`,
        sub: atrasados.length
          ? `${atrasados.length} já passaram — sem registo, a comparência não diz a verdade.`
          : 'Todos de hoje — abrir Presenças.',
      });
    }
  }

  // Documentos: caducado é outra coisa que "a caducar". Um exame médico
  // expirado é risco legal, não um lembrete.
  if (canEdit('documents') && alertOn('documentos')) {
    expiringDocuments().forEach((row) => {
      const date = row.expiresAt
        ? new Date(row.expiresAt + 'T00:00:00').toLocaleDateString('pt-PT',
            { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      items.push({
        urgency: row.status === 'expired' ? 'agora' : 'semana',
        variant: row.status === 'expired' ? 'danger' : row.status === 'missing' ? 'info' : 'warn',
        family: 'documentos',
        name: row.player?.name,
        docAthlete: row.playerId,
        route: 'planteis',
        title: `${row.docLabel} — ${row.player?.name || 'Atleta'}`,
        sub: row.status === 'expired'
          ? `Expirou a ${date} — renovar.`
          : row.status === 'missing'
            ? 'Sem data de validade — atualizar.'
            : `Expira a ${date} (${row.daysLeft} dia${row.daysLeft === 1 ? '' : 's'}).`,
      });
    });
  }

  // Pedidos de equipamento à espera de decisão. É "agora" porque do outro lado
  // está uma pessoa à espera — e um pedido esquecido ensina o treinador (ou a
  // atleta) a não voltar a pedir, que é o que o módulo veio resolver.
  if (canDecideRequests() && alertOn('pedidos_equipamento')) {
    const n = state.equipmentRequests.filter((r) => r.status === 'pendente').length;
    if (n > 0) {
      items.push({
        urgency: 'agora',
        variant: 'warn',
        route: 'pedidos',
        title: `${n} pedido${n === 1 ? '' : 's'} de equipamento por decidir`,
        sub: 'Aprovar, entregar ou recusar — abrir Equipamentos.',
      });
    }
  }

  // Quedas de comparência. A taxa do clube é uma média e a média esconde
  // precisamente este caso: quando o número global mexe, o atleta já desistiu.
  // Por isso é "agora" — é informação com prazo.
  if (canAccess('presencas') && alertOn('queda_presencas')) {
    attendanceDrops(6).forEach((d) => {
      const equipa = d.team ? ' — ' + teamName(d.team) : '';
      items.push({
        urgency: 'agora',
        variant: 'warn',
        family: 'queda',
        name: d.player.name,
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

  // Objetivos: fora de prazo já não se recupera (agora); em risco ainda dá
  // para corrigir (esta semana).
  if (canAccess('objetivos') && alertOn('objetivos')) {
    objectivesNeedingAttention().slice(0, 6).forEach(({ obj, status, met, total }) => {
      const sub = obj.scope === 'todas'
        ? `${met} de ${total} equipas a cumprir — abrir Objetivos.`
        : status === 'falhado'
          ? 'O prazo passou sem se atingir — rever nos Objetivos.'
          : 'Vai atrasado face ao prazo — abrir Objetivos.';
      items.push({
        urgency: status === 'falhado' ? 'agora' : 'semana',
        variant: status === 'falhado' ? 'danger' : 'warn',
        family: 'objetivos',
        name: obj.title,
        route: 'objetivos',
        title: `${obj.title}${status === 'falhado' ? ' — fora de prazo' : ' — em risco'}`,
        sub,
      });
    });
  }

  if (canEdit('quotas') && alertOn('quotas')) {
    const qm = quotasThisMonth();
    if (qm.pendentes > 0) {
      items.push({
        urgency: 'semana',
        variant: 'warn',
        route: 'financeiro',
        finTab: 'quotas',
        title: `${qm.pendentes} quota${qm.pendentes === 1 ? '' : 's'} por cobrar este mês`,
        sub: `${euros(qm.total)} por receber — abrir Quotas.`,
      });
    }
  }

  // Treina muito, joga pouco: dos sinais mais precoces de desistência, mas
  // mede-se em semanas e não em dias — daí não ser "agora".
  if (canAccess('planteis') && alertOn('gap_treino_jogo')) {
    const unidade = sport() === 'voleibol' ? 'dos pontos' : 'dos minutos';
    trainingVsPlayingGaps(6).forEach((g) => {
      items.push({
        urgency: 'semana',
        variant: 'warn',
        family: 'gap',
        name: g.player.name,
        route: 'planteis',
        title: `${g.player.name} treina muito e joga pouco`,
        sub: `${g.presenca}% de presenças em ${g.treinos} treinos, mas ${g.participacao}% ${unidade} em ${g.jogos} jogos${g.team ? ' — ' + teamName(g.team) : ''}.`,
      });
    });
  }

  if (canEdit('equipment') && alertOn('equipamentos') && equipmentNeedsAttention() > 0) {
    const n = equipmentNeedsAttention();
    items.push({
      urgency: 'semana',
      variant: 'danger',
      route: 'equipamentos',
      title: `${n} equipamento${n === 1 ? '' : 's'} em mau estado`,
      sub: 'Rever ou substituir — abrir Equipamentos.',
    });
  }

  if (canEdit('prospects') && alertOn('recrutamento')) {
    const ready = prospectsReady();
    if (ready > 0) {
      items.push({
        urgency: 'semana',
        variant: 'ok',
        route: 'recrutamento',
        title: `${ready} prospeto${ready === 1 ? '' : 's'} pronto${ready === 1 ? '' : 's'} a inscrever`,
        sub: 'Confirmados no recrutamento — inscrever no plantel.',
      });
    }
  }

  if (canEdit('players') && alertOn('avaliacoes')) {
    const pend = pendingReviews();
    if (pend > 0 && state.players.length > 0) {
      items.push({
        urgency: 'semana',
        variant: 'info',
        route: 'planteis',
        plan: true,
        title: `${pend} avaliaç${pend === 1 ? 'ão' : 'ões'} de atleta por decidir`,
        sub: 'Definir quem fica para a próxima época — planear nos Plantéis.',
      });
    }
  }

  // Os aniversários saíram desta lista de propósito e foram para o cabeçalho
  // (ver `birthdayLine`): dar os parabéns não é uma pendência, e cinco linhas
  // de bolos empurravam para fora do ecrã o atleta que está a desistir.
  // Isto fica, porque É trabalho: sem a data não há aniversário nenhum.
  if (canEdit('players') && alertOn('aniversarios_falta') && birthDateReady()) {
    const semData = playersWithoutBirthday();
    if (semData.length && state.players.length) {
      items.push({
        urgency: 'depois',
        variant: 'info',
        route: 'planteis',
        title: `${semData.length} atleta${semData.length === 1 ? '' : 's'} sem data de nascimento`,
        sub: 'Sem a data não há aniversário — preencher nos Plantéis, em "Aniversários".',
      });
    }
  }

  return collapseFamilies(items);
}

// Mostrar a lista de trabalho por inteiro (estado de UI desta vista).
let workExpanded = false;
// Quantos itens se mostram por degrau antes de "Ver tudo". "Agora" leva mais
// porque é precisamente o que não se pode esconder.
const WORK_PREVIEW = { agora: 6, semana: 4, depois: 2 };

// O cartão único de trabalho, em degraus. Substitui as três caixas que havia
// ("A precisar da tua atenção", "Documentos a expirar", "Presenças por
// marcar") — eram três títulos para a mesma pergunta.
function workCard(actions) {
  const steps = WORK_STEPS
    .map((s) => ({ ...s, list: actions.filter((a) => a.urgency === s.key) }))
    .filter((s) => s.list.length);
  if (!steps.length) return '';

  const escondidos = workExpanded
    ? 0
    : steps.reduce((n, s) => n + Math.max(0, s.list.length - WORK_PREVIEW[s.key]), 0);
  const urgente = steps[0]?.key === 'agora';

  return `
    <section class="card alerts-card${urgente ? ' alerts-card--now' : ''}">
      <h2 class="section-title upcoming-card__title">O que precisa de ti</h2>
      ${steps.map((s) => {
        const list = workExpanded ? s.list : s.list.slice(0, WORK_PREVIEW[s.key]);
        return `
          ${steps.length > 1 ? `<p class="pd-label work-step__label">${esc(s.label)}</p>` : ''}
          <ul class="alerts-list">${list.map(actionItem).join('')}</ul>`;
      }).join('')}
      ${escondidos > 0
        ? `<button class="btn btn--ghost btn--sm" id="work-more" type="button" style="margin-top:0.7rem">
             Ver tudo (mais ${escondidos})
           </button>`
        : ''}
      ${workExpanded
        ? `<button class="btn btn--ghost btn--sm" id="work-less" type="button" style="margin-top:0.7rem">
             Mostrar menos
           </button>`
        : ''}
    </section>`;
}

// Faixa de números. Substitui os nove cartões com ícone: cada um ocupava duas
// linhas e um ícone de 42px para dizer um número, e nove deles enchiam o ecrã
// de um telemóvel antes de se chegar ao que há para fazer. A faixa diz os
// mesmos números em dois segundos.
//
// Saíram três indicadores que nunca pediam nada: "Treinadores" e "Em contacto"
// são estáticos meses a fio (é o argumento que já tinha matado o cartão
// "Equipas"), e "Equipamentos" repetia, no subtítulo, o aviso que já está na
// lista de trabalho.
function statStrip(stats) {
  if (!stats.length) return '';
  return `
    <section class="stat-strip">
      ${stats.map((st) => {
        const inner = `
          <span class="stat-strip__value${st.tone ? ' stat-strip__value--' + st.tone : ''}">${String(st.value)}</span>
          <span class="stat-strip__label">${esc(st.label)}</span>
          ${st.sub ? `<span class="stat-strip__sub muted">${esc(st.sub)}</span>` : ''}`;
        return st.route
          ? `<button class="stat-strip__item stat-strip__item--nav" type="button" data-nav="${esc(st.route)}"${
              st.finTab ? ` data-fin-tab-open="${esc(st.finTab)}"` : ''
            } title="Abrir ${esc(st.label)}">${inner}</button>`
          : `<div class="stat-strip__item">${inner}</div>`;
      }).join('')}
    </section>`;
}

// Aniversários no CABEÇALHO e já não na lista de trabalho: dar os parabéns não
// é uma pendência, e cinco linhas de bolos empurravam para fora do ecrã o
// atleta que está a desistir. Aqui continua a chegar a tempo — que é a única
// coisa que um aniversário precisa de fazer.
function birthdayLine() {
  if (!canAccess('planteis') || !alertOn('aniversarios') || !birthDateReady()) return '';
  const list = upcomingBirthdays(7);
  if (!list.length) return '';
  const nomes = list.slice(0, 3).map((b) => {
    const quando = b.days === 0 ? 'hoje' : b.days === 1 ? 'amanhã'
      : b.date.toLocaleDateString('pt-PT', { weekday: 'long' });
    return `${b.player.name.split(/\s+/)[0]} (${quando})`;
  });
  const resto = list.length > nomes.length ? ` e mais ${list.length - nomes.length}` : '';
  return `
    <button class="hero-birthdays" type="button" data-nav="planteis"
            title="Ver aniversários nos Plantéis">
      🎂 ${esc(nomes.join(' · '))}${esc(resto)}
    </button>`;
}

// Colapsa as famílias com muitos itens numa linha só. Guarda o item mais
// urgente do grupo (é dele a cor e o destino) e põe os nomes no subtítulo —
// quem precisa do detalhe abre a secção, que é onde ele mora.
function collapseFamilies(items) {
  const counts = {};
  items.forEach((i) => { if (i.family) counts[i.family] = (counts[i.family] || 0) + 1; });

  const out = [];
  const done = new Set();
  items.forEach((item) => {
    const fam = item.family;
    if (!fam || counts[fam] < FAMILY_COLLAPSE_AT) { out.push(item); return; }
    if (done.has(fam)) return;
    done.add(fam);

    const grupo = items.filter((i) => i.family === fam);
    // O degrau do grupo é o do item mais urgente: um documento caducado no
    // meio de quatro a expirar não pode descer para "esta semana".
    const urgency = WORK_STEPS.find((s) => grupo.some((i) => i.urgency === s.key))?.key || 'semana';
    const lead = grupo.find((i) => i.urgency === urgency) || grupo[0];
    const nomes = grupo.map((i) => i.name).filter(Boolean);
    out.push({
      urgency,
      variant: lead.variant,
      route: lead.route,
      finTab: lead.finTab,
      title: (FAMILY_SUMMARY[fam] || ((n) => `${n} itens`))(grupo.length),
      sub: nomes.length
        ? `${nomes.slice(0, 4).join(', ')}${nomes.length > 4 ? ` e mais ${nomes.length - 4}` : ''}.`
        : '',
    });
  });
  return out;
}

function actionItem({ variant, title, sub, route, plan, finTab, docAthlete }) {
  // Um documento leva à FICHA do atleta e não à secção: o que se vai fazer
  // ali é renovar aquele documento, e a lista de Plantéis é mais um clique
  // pelo meio.
  const target = docAthlete
    ? `data-doc-athlete="${esc(docAthlete)}"`
    : `data-nav="${esc(route)}"`;
  return `
    <li>
      <button class="alert-item alert-item--${variant} alert-item--nav" ${target}${
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
  // Como no painel do coordenador, os eventos de HOJE não se repetem aqui —
  // já estão no cartão "Hoje", três linhas acima.
  const todayIds = new Set(today.map((e) => e.id));
  const upcoming = upcomingEvents(30).filter((e) => isMyEvent(e) && !todayIds.has(e.id)).slice(0, 5);
  const proximoJogo = state.events
    .filter((e) => e.type === 'jogo' && isMyEvent(e) && eventDateTime(e) >= new Date())
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))[0] || null;

  // A faixa perdeu o "Por marcar": o número estava por cima do cartão que
  // lista, linha a linha, exatamente os mesmos treinos — o mesmo dado duas
  // vezes, com meio ecrã de distância.
  const stats = [
    { label: 'Atletas', value: players.length,
      sub: `em ${teams.length} equipa${teams.length === 1 ? '' : 's'}`, route: 'planteis' },
    canAccess('presencas') && {
      label: 'Comparência', value: att.rate == null ? '—' : att.rate + '%',
      sub: attendanceSub(att, trend),
      tone: trend && trend.delta != null && trend.delta <= -10 ? 'warn' : '',
      route: 'presencas' },
    proximoJogo && {
      label: 'Próximo jogo', value: diasAte(proximoJogo),
      sub: [teamName(teamById(proximoJogo.team_id)), proximoJogo.opponent ? 'vs ' + proximoJogo.opponent : '']
        .filter(Boolean).join(' · ') || 'agendado',
      route: 'calendario' },
  ].filter(Boolean);

  // O treinador NÃO leva a linha-resumo das presenças na lista de trabalho: o
  // cartão inteiro está logo aqui ao lado, e é o centro do ecrã dele.
  const actions = buildActions();
  const urgente = actions.some((a) => a.urgency === 'agora') || atrasados.length > 0;

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">
          ${esc(teams.length ? teams.map(teamName).join(' · ') : 'Ainda não estás ligado a nenhuma equipa.')}
        </p>
        ${birthdayLine()}
      </div>
      <div class="hero-actions">
        ${availableAlerts().length || availableMetrics().length
          ? '<button class="btn btn--ghost btn--sm" id="alert-prefs" type="button">Personalizar</button>'
          : ''}
      </div>
    </header>

    ${today.length ? `<section class="card today-card">
      <h2 class="section-title upcoming-card__title">Hoje</h2>
      <ul class="mark-list">${today.map(coachTodayRow).join('')}</ul>
    </section>` : ''}

    ${toMark.length ? markCard(toMark, atrasados, antigos) : ''}

    ${urgente ? workCard(actions) : ''}
    ${statStrip(stats)}

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

    ${urgente ? '' : workCard(actions)}

    ${limitados.length ? `<section class="card">
      <h2 class="section-title upcoming-card__title">Não estão a 100%</h2>
      <ul class="today-list">${limitados.slice(0, 8).map(limitedRow).join('')}</ul>
    </section>` : ''}

    <section class="card">
      <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
      ${upcoming.length ? upcomingList(upcoming)
        : '<p class="muted" style="margin:0.3rem 0 0">Sem outros eventos agendados.</p>'}
    </section>
  `;

  wireWorkCard(container, () => renderTreinadorPainel(container));
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
          ? `${canEdit('squads') && canAccess('presencas') && ev.team_id ? `<button class="btn btn--ghost btn--sm" data-squad-event="${ev.id}" type="button">Convocatória</button>` : ''}
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
    btn.addEventListener('click', () => {
      setSelectedEvent(btn.dataset.squadEvent);
      navTo('presencas');
    })
  );
  container.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => {
      if (el.dataset.plan) openSeasonPlanning();
      if (el.dataset.finTabOpen) openFinanceiroTab(el.dataset.finTabOpen);
      navTo(el.dataset.nav);
    })
  );
  // A lista de trabalho pode trazer documentos (se o treinador os puder ver),
  // e esses abrem a FICHA do atleta e não uma secção.
  container.querySelectorAll('[data-doc-athlete]').forEach((el) =>
    el.addEventListener('click', () => openAthleteProfile(el.dataset.docAthlete, { tab: 'geral' }))
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
