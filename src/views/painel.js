// Vista: Painel (resumo do clube).
// Cartões de métricas, barra de progresso da meta e próximos eventos.

import {
  state, savePainelPrefs, dbErrorMessage,
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
  appointmentConflicts,
  activeEpisode,
  episodeReturnDays,
  injuryStats,
  expiringDocuments,
  objectivesNeedingAttention,
  trainingVsPlayingGaps,
  attendanceDrops,
  clubRecord,
  attendanceTrend,
  sport,
  myTeams,
  isMyEvent,
  gamesWithoutResult,
  myUnavailablePlayers,
  upcomingBirthdays,
  playersWithoutBirthday,
  playersMissingData,
  birthDateReady,
  eventRoster,
  eventResponseSummary,
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
  PLAYER_DATA_LABEL,
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
import { wireDialog } from '../modal.js';
import { setSelectedEvent } from './presencas.js';
import { openResultModal } from './resultado.js';
import { openSeasonPlanning } from './planteis.js';
import { DEFAULT_BRANDING } from '../branding.js';













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

  // --- Duas colunas no ecrã grande ----------------------------------------
  // O conteúdo estava numa coluna só, esticada à largura do ecrã: num
  // portátil, a linha "18:30–20:30 · Cadetes F · Pavilhão…" tinha 1500px de
  // vazio à direita, e o que interessava estava tudo abaixo da dobra. O
  // trabalho fica na coluna larga; a agenda e os números na estreita.
  //
  // A **faixa de números vem sempre primeiro**. Chegou a descer para o fim nos
  // dias com trabalho urgente — pela ideia de que a lista tem de vir à frente
  // de tudo —, mas com as duas colunas a lista já está no topo à esquerda: o
  // que a faixa lá em baixo fazia era obrigar a deslizar a página inteira para
  // ver seis números que cabem numa linha.
  //
  // O que ainda depende do dia é só o TELEMÓVEL, onde as colunas empilham (num
  // ecrã grande as duas veem-se ao mesmo tempo): `--calm` manda a coluna
  // lateral — a agenda — para cima da lista quando não há nada urgente.
  const urgente = actions.some((a) => a.urgency === 'agora');

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
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

    ${statStrip(stats)}

    <div class="panel-grid${urgente ? '' : ' panel-grid--calm'}">
      <div class="panel-grid__main">
        ${workCard(actions)}
      </div>
      <aside class="panel-grid__side">
        ${today.length && seeCalendar ? todayCard(today) : ''}

        ${seeCalendar ? `<section class="card">
          <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
          ${upcoming.length ? upcomingList(upcoming) : '<p class="muted" style="margin:0.3rem 0 0">Sem outros eventos agendados.</p>'}
        </section>` : ''}
      </aside>
    </div>
  `;

  wireWorkCard(container, () => renderPainel(container));
  wireWorkTargets(container);

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
function todayRow(ev, { hideLocation = false } = {}) {
  const team = teamById(ev.team_id);
  const range = eventTimeRange(ev);
  const tipo = EVENT_TYPE_LABEL[ev.type] || ev.type;
  // O título só entra quando DIZ alguma coisa. Um treino sem título próprio
  // chamava-se "Treino" — a mesma palavra que o crachá mesmo ao lado, em
  // todas as linhas de todos os dias.
  const titulo = (ev.title || '').trim();
  const proprio = titulo && titulo.toLowerCase() !== tipo.toLowerCase() ? titulo : '';
  // Tudo numa linha: hora, tipo, e o resto separado por pontos. Em duas
  // linhas, três treinos custavam 250px para dizer três horas e três equipas.
  const resto = [
    proprio,
    team ? teamName(team) : '',
    ev.opponent ? `vs ${ev.opponent}` : '',
    hideLocation ? '' : (ev.location || ''),
  ].filter(Boolean).join(' · ');

  return `
    <li class="today-item today-item--slim">
      <span class="today-item__time">${range ? esc(range) : '—'}</span>
      <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(tipo)}</span>
      <span class="today-item__line">${esc(resto || tipo)}</span>
    </li>
  `;
}

// Cartão "Hoje" do coordenador.
function todayCard(today) {
  const local = sharedLocation(today);
  return `
    <section class="card today-card">
      <h2 class="section-title upcoming-card__title">Hoje</h2>
      ${local ? `<p class="muted today-card__where">${esc(local)}</p>` : ''}
      <ul class="today-list">${today.map((e) => todayRow(e, { hideLocation: !!local })).join('')}</ul>
    </section>`;
}

// O local, quando é o MESMO em todos os eventos do dia, sai das linhas e vai
// para o cabeçalho do cartão. Três treinos seguidos no mesmo pavilhão
// repetiam "Pavilhão Escola Secundária da Senhora da Hora" três vezes — e numa
// coluna estreita era precisamente esse nome que empurrava a equipa para fora
// da linha e a deixava como "Cadetes F · P…".
function sharedLocation(events) {
  if (events.length < 2) return '';
  const locais = events.map((e) => (e.location || '').trim());
  // Só sai da linha se TODOS tiverem local e for o mesmo: com um evento sem
  // local, pôr o dos outros no cabeçalho dizia dele uma coisa que não se sabe.
  return locais.every((l) => l && l === locais[0]) ? locais[0] : '';
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
  { key: 'fichas_incompletas', label: 'Fichas de atleta por completar', can: () => canEdit('documents') },
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
  sem_data:   (n) => `${n} atletas sem data de nascimento`,
  fichas:     (n) => `${n} fichas de atleta por completar`,
  // Fisioterapia
  appt_abertos:    (n) => `${n} atendimentos por fechar`,
  retorno_passado: (n) => `${n} atletas passaram a data prevista de retorno`,
  conflitos:       (n) => `${n} atendimentos chocam com treinos`,
  sem_previsao:    (n) => `${n} episódios sem previsão de retorno`,
  // Preparação física
  sem_perfil:        (n) => `${n} atletas sem perfil físico`,
  sem_avaliacao:     (n) => `${n} atletas nunca avaliados`,
  avaliacao_antiga:  (n) => `${n} atletas sem avaliação há mais de ${STALE_TEST_DAYS} dias`,
  musculacao_por_marcar:  (n) => `${n} sessões de musculação sem presenças`,
  musculacao_sem_atletas: (n) => `${n} sessões de musculação sem atletas escolhidos`,
};
const FAMILY_COLLAPSE_AT = 3;

// Ao fim de quantos dias uma avaliação física deixa de servir de referência.
const STALE_TEST_DAYS = 120;

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
      // A linha escolhe o treino ANTES de navegar, senão as Presenças abriam
      // no evento mais perto de hoje e o de há três semanas — o que deu
      // origem ao aviso — ficava onde estava, a meio da lista. `trainingsToMark`
      // vem do mais recente para trás: o mais antigo é o último, e é o que já
      // não se consegue marcar de memória.
      const fila = atrasados.length ? atrasados : pend;
      items.push({
        urgency: atrasados.length ? 'agora' : 'semana',
        variant: atrasados.length ? 'danger' : 'warn',
        route: 'presencas',
        event: fila[fila.length - 1].event.id,
        title: `${pend.length} treino${pend.length === 1 ? '' : 's'} com presenças por marcar`,
        sub: atrasados.length ? `${atrasados.length} já passaram sem registo` : '',
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
          ? `Expirou a ${date}`
          : row.status === 'missing'
            ? 'Sem data de validade'
            : `Expira a ${date} (${row.daysLeft} dia${row.daysLeft === 1 ? '' : 's'})`,
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
        // A pendência é sobre uma pessoa, e é na ficha dela que estão as
        // presenças que a explicam. A secção Presenças é sobre um EVENTO —
        // chegar lá obrigava a reencontrar a Rita à mão.
        athlete: d.player.id,
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
      // Só o âmbito "todas" tem dado para o subtítulo (quantas equipas
      // cumprem); nos outros o título já diz tudo o que há a dizer.
      const sub = obj.scope === 'todas' ? `${met} de ${total} equipas a cumprir` : '';
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
        sub: `${euros(qm.total)} por receber`,
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
        athlete: g.player.id,
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
      });
    }
  }

  // Os aniversários saíram desta lista de propósito e foram para o cabeçalho
  // (ver `birthdayLine`): dar os parabéns não é uma pendência, e cinco linhas
  // de bolos empurravam para fora do ecrã o atleta que está a desistir.
  // Isto fica, porque É trabalho: sem a data não há aniversário nenhum.
  if (canEdit('players') && alertOn('aniversarios_falta') && birthDateReady()) {
    // Uma linha por atleta, e não um contador: "12 atletas sem data" mandava
    // para os Plantéis sem dizer QUAIS, e a lista dos doze tinha de ser
    // reconstruída à mão, ficha a ficha. Com família, o painel continua a
    // mostrar uma linha só — mas ela abre a lista (ver `openWorkGroup`).
    if (state.players.length) {
      playersWithoutBirthday().forEach((p) => {
        items.push({
          urgency: 'depois',
          variant: 'info',
          family: 'sem_data',
          name: p.name,
          athlete: p.id,
          route: 'planteis',
          title: `${p.name} sem data de nascimento`,
        });
      });
    }
  }

  // As fichas a meio: foto, data de nascimento e fotocópia do CC. Não é a
  // mesma pendência das datas de nascimento acima — essa fica para quem NÃO
  // lê documentos (o treinador), e esta responde à pergunta inteira a quem os
  // lê. O trabalho aqui não é preencher: é saber a quem telefonar, porque os
  // três dados estão do lado da família. Quem tem conta ligada ao portal já
  // está a ser pedido lá.
  if (canEdit('documents') && alertOn('fichas_incompletas') && state.players.length) {
    // Também aqui é uma linha por ficha: o subtítulo dizia quatro nomes e
    // "e mais 9", e os nove eram o trabalho. Cada linha diz O QUE falta
    // àquela ficha (é isso que decide o telefonema) e abre a ficha.
    playersMissingData().forEach((r) => {
      items.push({
        urgency: 'depois',
        variant: 'info',
        family: 'fichas',
        name: r.player.name,
        athlete: r.player.id,
        route: 'planteis',
        title: `Ficha de ${r.player.name} por completar`,
        sub: `Falta: ${r.gaps.map((g) => PLAYER_DATA_LABEL[g] || g).join(', ')}`,
      });
    });
  }

  return collapseFamilies(items);
}

// Mostrar o degrau "Agora" por inteiro (estado de UI desta vista).
let workExpanded = false;
// Quantas pendências urgentes se mostram antes do "Ver tudo". Só o "Agora"
// tem teto: os outros degraus nascem fechados, por isso a altura deles já é
// zero.
const WORK_PREVIEW_NOW = 6;

// O cartão único de trabalho. Substituiu as três caixas que havia ("A precisar
// da tua atenção", "Documentos a expirar", "Presenças por marcar") — eram três
// títulos para a mesma pergunta.
//
// Só o degrau **Agora** nasce aberto. "Esta semana" e "Quando puderes" são
// `<details>` com a contagem no resumo, na convenção que o projeto já usa nos
// Utilizadores e nos convites: com os três degraus abertos este cartão era o
// bloco mais alto do ecrã e empurrava tudo o resto para fora, incluindo os
// números e os eventos de hoje. Fechado, o degrau custa uma linha e continua
// a dizer quantas coisas lá estão — que é a parte que não se pode esconder.
function workCard(actions) {
  const steps = WORK_STEPS
    .map((s) => ({ ...s, list: actions.filter((a) => a.urgency === s.key) }))
    .filter((s) => s.list.length);
  if (!steps.length) return '';

  const agora = steps.find((s) => s.key === 'agora');
  const visiveis = agora
    ? (workExpanded ? agora.list : agora.list.slice(0, WORK_PREVIEW_NOW))
    : [];
  const escondidos = agora ? agora.list.length - visiveis.length : 0;

  return `
    <section class="card alerts-card${agora ? ' alerts-card--now' : ''}">
      <h2 class="section-title upcoming-card__title">O que precisa de ti</h2>
      ${agora ? `
        <ul class="alerts-list">${visiveis.map(actionItem).join('')}</ul>
        ${escondidos > 0
          ? `<button class="btn btn--ghost btn--sm" id="work-more" type="button" style="margin-top:0.6rem">
               Ver as restantes ${escondidos}
             </button>`
          : ''}
        ${workExpanded && agora.list.length > WORK_PREVIEW_NOW
          ? `<button class="btn btn--ghost btn--sm" id="work-less" type="button" style="margin-top:0.6rem">
               Mostrar menos
             </button>`
          : ''}` : ''}
      ${steps.filter((s) => s.key !== 'agora').map((s) => `
        <details class="group work-step">
          <summary class="group__head">
            <span class="group__title">${esc(s.label)}</span>
            <span class="group__count">${s.list.length}</span>
          </summary>
          <ul class="alerts-list">${s.list.map(actionItem).join('')}</ul>
        </details>`).join('')}
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

// As linhas de grupo que estão desenhadas AGORA, para o diálogo de detalhe as
// poder reabrir. Vive num módulo e não no DOM porque o item é um objeto (com
// `athlete`, `route`, `sub`) e o painel escreve HTML antes de ligar eventos —
// serializá-lo para um atributo era guardar o mesmo dado duas vezes.
const workGroups = new Map();

// Colapsa as famílias com muitos itens numa linha só. Guarda o item mais
// urgente do grupo (é dele a cor e o degrau) e põe os primeiros nomes no
// subtítulo, para se saber de quem se fala sem abrir nada.
//
// O detalhe deixou de morar só na secção: a linha abre um diálogo com as N
// pendências, cada uma a levar ao sítio DELA (a ficha do atleta, o treino).
// Mandar sete atletas para a lista de Plantéis era devolver ao coordenador o
// trabalho que o painel tinha acabado de fazer — descobrir quais são os sete.
function collapseFamilies(items) {
  workGroups.clear();
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
    const titulo = (FAMILY_SUMMARY[fam] || ((n) => `${n} itens`))(grupo.length);
    // O degrau do grupo é o do item mais urgente: um documento caducado no
    // meio de quatro a expirar não pode descer para "esta semana".
    const urgency = WORK_STEPS.find((s) => grupo.some((i) => i.urgency === s.key))?.key || 'semana';
    const lead = grupo.find((i) => i.urgency === urgency) || grupo[0];
    const nomes = grupo.map((i) => i.name).filter(Boolean);
    // O resumo continua sem `athlete` — uma linha que fala de sete atletas não
    // pode abrir a ficha de um deles. O que abre é a LISTA dos sete.
    workGroups.set(fam, { family: fam, title: titulo, items: grupo, route: lead.route });
    out.push({
      urgency,
      variant: lead.variant,
      group: fam,
      route: lead.route,
      finTab: lead.finTab,
      title: titulo,
      sub: nomes.length
        ? `${nomes.slice(0, 4).join(', ')}${nomes.length > 4 ? ` e mais ${nomes.length - 4}` : ''}`
        : '',
    });
  });
  return out;
}

// Liga os destinos de uma lista de trabalho. Está num sítio só porque os
// quatro painéis (clube, treinador, fisio, preparador) desenham a MESMA lista
// e cada um ligava a parte de que se lembrava: o painel do clube abria a ficha
// de um documento mas não a de uma queda de comparência, e o do treinador nem
// isso.
//
// `includeNav` fica de fora nos painéis porque lá o `data-nav` e o
// `data-doc-athlete` já são ligados junto da faixa de números e dos
// aniversários — ligá-los outra vez abria a ficha duas vezes. Dentro do
// diálogo não há esse risco, e é preciso o conjunto todo.
function wireWorkTargets(root, { tab = 'geral', includeNav = false, before = null } = {}) {
  const go = (fn) => { before?.(); fn(); };

  root.querySelectorAll('[data-work-group]').forEach((el) =>
    el.addEventListener('click', () => openWorkGroup(el.dataset.workGroup, tab))
  );
  root.querySelectorAll('[data-work-athlete]').forEach((el) =>
    el.addEventListener('click', () =>
      go(() => openAthleteProfile(el.dataset.workAthlete, { tab: el.dataset.workTab || tab }))
    )
  );
  // O evento escolhe-se ANTES de navegar: a secção lê a escolha ao desenhar,
  // como já faziam os cartões do Calendário.
  root.querySelectorAll('[data-work-event]').forEach((el) =>
    el.addEventListener('click', () => go(() => {
      setSelectedEvent(el.dataset.workEvent);
      navTo('presencas');
    }))
  );
  if (!includeNav) return;

  root.querySelectorAll('[data-doc-athlete]').forEach((el) =>
    el.addEventListener('click', () => go(() => openAthleteProfile(el.dataset.docAthlete, { tab: 'geral' })))
  );
  root.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => go(() => {
      if (el.dataset.plan) openSeasonPlanning();
      if (el.dataset.finTabOpen) openFinanceiroTab(el.dataset.finTabOpen);
      navTo(el.dataset.nav);
    }))
  );
}

// O detalhe de uma linha de grupo: as N pendências que ela resume, cada uma
// com o seu destino. É um diálogo de corpo livre, por isso usa `wireDialog` e
// não o `openModal` (que é orientado a campos) — entra na pilha, Escape só no
// do topo, Tab preso e foco devolvido, como todos os outros.
//
// Escolher uma linha FECHA o diálogo: o que vem a seguir é uma ficha de atleta
// (outro modal) ou uma mudança de secção, e deixar este aberto por baixo
// punha dois diálogos a falar da mesma coisa.
function openWorkGroup(family, tab = 'geral') {
  const grupo = workGroups.get(family);
  if (!grupo) return;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="wg-title"
         style="width:min(560px,96vw);max-height:90vh;display:flex;flex-direction:column">
      <div class="modal__head">
        <div>
          <h2 class="section-title" id="wg-title">${esc(grupo.title)}</h2>
          <p class="muted" style="margin:0;font-size:0.84rem">
            Escolhe uma linha para ir direto ao que ela pede.
          </p>
        </div>
        <button class="modal__close" type="button" aria-label="Fechar">&times;</button>
      </div>
      <div style="overflow-y:auto;flex:1">
        <ul class="alerts-list">${grupo.items.map(actionItem).join('')}</ul>
      </div>
      <div class="modal__actions">
        ${grupo.route ? `<button class="btn btn--ghost" type="button" data-nav="${esc(grupo.route)}">Abrir secção</button>` : ''}
        <button class="btn btn--primary" type="button" id="wg-close">Fechar</button>
      </div>
    </div>
  `;
  const close = wireDialog(overlay);
  overlay.querySelector('#wg-close').addEventListener('click', close);
  wireWorkTargets(overlay, { tab, includeNav: true, before: close });
}

// O destino de uma linha de trabalho, por ordem de precisão: a lista do grupo,
// a ficha do atleta, o evento concreto, e só depois a secção. Uma pendência que
// nomeia uma pessoa ou um treino e aterra numa secção genérica devolve a quem
// lê o trabalho de reencontrar ali o que o painel já sabia.
function actionTarget({ group, docAthlete, athlete, tab, event, route }) {
  if (group) return `data-work-group="${esc(group)}"`;
  // Um documento leva à FICHA do atleta e não à secção: o que se vai fazer
  // ali é renovar aquele documento, e a lista de Plantéis é mais um clique
  // pelo meio.
  if (docAthlete) return `data-doc-athlete="${esc(docAthlete)}"`;
  if (athlete) return `data-work-athlete="${esc(athlete)}" data-work-tab="${esc(tab || 'geral')}"`;
  if (event) return `data-work-event="${esc(event)}"`;
  return `data-nav="${esc(route)}"`;
}

function actionItem(item) {
  const { variant, title, sub, plan, finTab } = item;
  const target = actionTarget(item);
  // O subtítulo só existe quando traz DADO — nomes, datas, valores. Metade
  // deles dizia o procedimento ("Aprovar, entregar ou recusar — abrir
  // Equipamentos"), que quem lê o painel já sabe: era uma linha inteira por
  // pendência a dizer nada, e eram essas linhas que empurravam o trabalho
  // real para fora do ecrã. Sem subtítulo, a pendência ocupa UMA linha.
  return `
    <li>
      <button class="alert-item alert-item--${variant} alert-item--nav${sub ? '' : ' alert-item--slim'}" ${target}${
        plan ? ' data-plan="1"' : ''
      }${finTab ? ` data-fin-tab-open="${finTab}"` : ''} type="button">
        <span class="alert-item__dot" aria-hidden="true"></span>
        <span class="alert-item__text">
          <strong class="alert-item__title">${esc(title)}</strong>
          ${sub ? `<span class="muted alert-item__sub">${esc(sub)}</span>` : ''}
        </span>
        <span class="alert-item__chevron" aria-hidden="true">›</span>
      </button>
    </li>
  `;
}

// Uma linha do alerta "Documentos a expirar" — abre a ficha do atleta (onde os
// documentos vivem, no separador Geral) ao clicar.

// `absences`: mostrar quem avisou que não vai. Só o painel do TREINADOR o
// pede — uma falta a um treino de sexta é trabalho de quem o dá, e ao
// coordenador com dez escalões seria uma linha de nomes por evento sobre
// treinos a que não vai. É a mesma regra do `event_response_audience`.
function upcomingList(events, { absences = false } = {}) {
  return `
    <ul class="event-mini">
      ${events
        .map((ev) => {
          const dt = eventDateTime(ev);
          const team = teamById(ev.team_id);
          const day = dt.toLocaleDateString('pt-PT', { day: '2-digit' });
          const mon = dt.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
          const time = ev.time ? ev.time.slice(0, 5) : '';
          // Mesma regra do "Hoje": o nome só entra quando não é a palavra que
          // o crachá ao lado já diz. "Jogo · Jogo · Seniores F" ocupava duas
          // linhas para dizer uma.
          const tipo = EVENT_TYPE_LABEL[ev.type] || ev.type;
          const titulo = (ev.title || '').trim();
          const nome = titulo && titulo.toLowerCase() !== tipo.toLowerCase() ? titulo : '';
          // `esc()` sobre a linha inteira: o nome da equipa vinha por
          // interpolação direta, ao contrário da convenção do projeto.
          const meta = esc([
            team ? teamName(team) : '',
            ev.opponent ? `vs ${ev.opponent}` : '',
            time || '',
          ].filter(Boolean).join(' · '));
          return `
            <li class="event-mini__item">
              <div class="event-mini__date-block">
                <span class="event-mini__day">${day}</span>
                <span class="event-mini__mon">${mon}</span>
              </div>
              <div class="event-mini__body">
                <span class="event-mini__meta">
                  <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(tipo)}</span>
                  ${nome ? `<strong class="event-mini__name">${esc(nome)}</strong>` : ''}
                  ${meta ? `<span class="muted">${meta}</span>` : ''}
                </span>
                ${absences ? absenceLine(ev) : ''}
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
// Pendências do fisioterapeuta. O painel dele tinha três números e duas
// listas e não dizia UMA coisa que estivesse por fazer — o que está por fazer
// num departamento clínico é precisamente o que não se vê: o atendimento que
// ninguém fechou, a previsão de retorno que passou, o episódio sem previsão
// nenhuma. Tudo isto já estava na base de dados; faltava alguém perguntar.
function buildFisioActions() {
  const items = [];
  const hoje = localToday();
  const nome = (id) => state.players.find((p) => p.id === id)?.name || 'Atleta';

  // Atendimentos que já passaram e continuam "agendado": ninguém disse se se
  // realizou ou se o atleta faltou. É o equivalente clínico das presenças por
  // marcar — e, tal como lá, o que se perde não é a linha, é a estatística.
  state.appointments
    .filter((a) => a.status === 'agendado' && a.date && a.date < hoje)
    .forEach((a) => {
      items.push({
        urgency: 'agora', variant: 'warn', family: 'appt_abertos',
        name: nome(a.player_id), athlete: a.player_id, tab: 'fisioterapia',
        title: `Atendimento de ${nome(a.player_id)} por fechar`,
        sub: `Marcado para ${dataCurta(a.date)}, ainda como "agendado"`,
      });
    });

  // Previsão de retorno já passada sem alta dada. Ou o atleta voltou e
  // ninguém fechou o episódio, ou não voltou e a previsão está errada — as
  // duas hipóteses pedem a mesma coisa: alguém olhar.
  state.clinicalEpisodes
    .filter((e) => e.status !== 'alta' && e.expected_return && e.expected_return < hoje)
    .forEach((e) => {
      items.push({
        urgency: 'agora', variant: 'danger', family: 'retorno_passado',
        name: nome(e.player_id), athlete: e.player_id, tab: 'fisioterapia',
        title: `${nome(e.player_id)} devia ter voltado a ${dataCurta(e.expected_return)}`,
        sub: 'Sem alta dada',
      });
    });

  // Atendimentos que chocam com treino ou jogo da equipa do atleta. O aviso
  // já existia, mas só aparecia a quem ESTIVESSE a marcar o atendimento: um
  // conflito criado na segunda só se descobria na quinta, no balneário.
  upcomingAppointments(30)
    .filter((a) => appointmentConflicts(a.player_id, a.date, a.time, a.end_time).length)
    .forEach((a) => {
      items.push({
        urgency: 'semana', variant: 'warn', family: 'conflitos',
        name: nome(a.player_id), athlete: a.player_id, tab: 'fisioterapia',
        title: `Atendimento de ${nome(a.player_id)} choca com um treino`,
        sub: `${dataCurta(a.date)} — a equipa tem evento à mesma hora`,
      });
    });

  // Episódio em curso sem previsão de retorno. Sem data prevista, o treinador
  // não sabe com quem conta e o episódio não tem fim à vista — nem para
  // medir, nem para cobrar a si próprio.
  state.clinicalEpisodes
    .filter((e) => e.status !== 'alta' && !e.expected_return)
    .forEach((e) => {
      items.push({
        urgency: 'semana', variant: 'info', family: 'sem_previsao',
        name: nome(e.player_id), athlete: e.player_id, tab: 'fisioterapia',
        title: `${nome(e.player_id)} sem previsão de retorno`,
      });
    });

  return collapseFamilies(items);
}

function renderFisioPainel(container) {
  const injured = injuredCount();
  const hoje = localToday();
  const todayAppts = state.appointments
    .filter((a) => a.status === 'agendado' && a.date === hoje)
    .sort((a, b) => apptDateTime(a) - apptDateTime(b));
  // "Próximos" deixa de repetir os de HOJE, que já estão no cartão de cima —
  // é a mesma correção do "Hoje" vs "Próximos eventos" dos outros painéis.
  const upcoming = upcomingAppointments(30).filter((a) => a.date !== hoje).slice(0, 8);

  // Atletas com episódio em curso (ativo ou em recuperação), para a lista.
  const recovering = state.players
    .map((p) => ({ player: p, episode: activeEpisode(p.id) }))
    .filter((x) => x.episode)
    .sort((a, b) => (a.episode.status === 'ativo' ? 0 : 1) - (b.episode.status === 'ativo' ? 0 : 1));

  // Tempo médio até à alta e recidivas: os dois números que respondem às
  // perguntas que ninguém conseguia responder ficha a ficha. Substituem
  // "Atendimentos hoje" e "Próximos", que eram a contagem das duas listas
  // desenhadas logo por baixo — o mesmo dado duas vezes no mesmo ecrã.
  const dias = state.clinicalEpisodes.map(episodeReturnDays).filter((d) => d != null);
  const media = dias.length ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null;
  const recidivas = injuryStats().reduce((n, z) => n + z.recidivas, 0);

  const stats = [
    { label: 'Em tratamento', value: injured,
      sub: injured ? `atleta${injured === 1 ? '' : 's'} com episódio em curso` : 'sem episódios em curso',
      tone: injured > 0 ? 'warn' : 'ok', route: 'saude' },
    { label: 'Alta média', value: media == null ? '—' : `${media} d`,
      sub: dias.length ? `em ${dias.length} episódio${dias.length === 1 ? '' : 's'} com alta` : 'ainda sem altas registadas',
      route: 'saude' },
    { label: 'Recidivas', value: recidivas,
      sub: recidivas ? 'voltaram a lesionar a mesma zona' : 'nenhuma zona repetida',
      tone: recidivas > 0 ? 'warn' : 'ok', route: 'saude' },
  ];

  const actions = buildFisioActions();
  const urgente = actions.some((a) => a.urgency === 'agora');

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">Departamento Médico.</p>
      </div>
    </header>

    ${statStrip(stats)}

    <div class="panel-grid${urgente ? '' : ' panel-grid--calm'}">
      <div class="panel-grid__main">
        ${workCard(actions)}

        <section class="card">
          <h2 class="section-title upcoming-card__title">Atletas em tratamento</h2>
          ${recovering.length ? `<ul class="today-list">${recovering.map(injuredRow).join('')}</ul>`
            : '<p class="muted" style="margin:0.3rem 0 0">Nenhum atleta com episódio em curso.</p>'}
        </section>
      </div>
      <aside class="panel-grid__side">
        ${todayAppts.length ? `<section class="card today-card">
          <h2 class="section-title upcoming-card__title">Hoje</h2>
          <ul class="today-list">${todayAppts.map(apptRow).join('')}</ul>
        </section>` : ''}

        <section class="card">
          <h2 class="section-title upcoming-card__title">Próximos atendimentos</h2>
          ${upcoming.length ? `<ul class="today-list">${upcoming.map(apptRow).join('')}</ul>`
            : '<p class="muted" style="margin:0.3rem 0 0">Sem outros atendimentos agendados.</p>'}
        </section>
      </aside>
    </div>
  `;

  wireWorkCard(container, () => renderFisioPainel(container));
  wireAreaPainel(container, 'fisioterapia');
  wireWorkTargets(container, { tab: 'fisioterapia' });
}

// Data curta e legível (dd mmm) para os subtítulos das pendências.
function dataCurta(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

// Hoje em ISO local (e não `toISOString`, que devolve UTC e às 23h de verão
// dá o dia seguinte — um atendimento de hoje passava a "atrasado").
function localToday() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Ligações comuns aos painéis de área (fisio e preparador): abrir a ficha do
// atleta no separador da área, navegar a partir das pendências e configurar.
function wireAreaPainel(container, tab) {
  container.querySelectorAll('[data-open-athlete]').forEach((el) => {
    const open = () => {
      if (el.dataset.openAthlete) openAthleteProfile(el.dataset.openAthlete, { tab });
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
  container.querySelectorAll('[data-nav]').forEach((el) =>
    el.addEventListener('click', () => navTo(el.dataset.nav))
  );
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
// Pendências do preparador físico. O painel dele dizia "247 avaliações
// registadas no total" — o exemplo perfeito de um número que nunca pede nada:
// só sobe, nunca desce, e não distingue o clube que mede toda a gente do que
// mediu vinte atletas há três épocas. O que interessa é o inverso: QUEM falta
// medir, que é o trabalho do preparador.
function buildPrepActions() {
  const items = [];
  const comPerfil = new Set(
    state.physicalProfiles.filter((p) => p.height_cm || p.weight_kg).map((p) => p.player_id)
  );
  // Data da última avaliação de cada atleta.
  const ultima = new Map();
  for (const t of state.physicalTests) {
    if (!t.date) continue;
    const atual = ultima.get(t.player_id);
    if (!atual || t.date > atual) ultima.set(t.player_id, t.date);
  }
  const limite = new Date();
  limite.setDate(limite.getDate() - STALE_TEST_DAYS);
  const limiteISO = limite.toISOString().slice(0, 10);

  state.players.forEach((p) => {
    // Sem altura nem peso não há IMC, não há nada — é o primeiro registo de
    // toda a ficha física e sem ele o resto não se calcula.
    if (!comPerfil.has(p.id)) {
      items.push({
        urgency: 'semana', variant: 'warn', family: 'sem_perfil',
        name: p.name, athlete: p.id, tab: 'fisica',
        title: `${p.name} sem perfil físico`,
      });
      return;
    }
    const data = ultima.get(p.id);
    if (!data) {
      items.push({
        urgency: 'semana', variant: 'info', family: 'sem_avaliacao',
        name: p.name, athlete: p.id, tab: 'fisica',
        title: `${p.name} nunca foi avaliada`,
      });
    } else if (data < limiteISO) {
      items.push({
        urgency: 'depois', variant: 'info', family: 'avaliacao_antiga',
        name: p.name, athlete: p.id, tab: 'fisica',
        title: `${p.name} sem avaliação desde ${dataCurta(data)}`,
      });
    }
  });

  // As sessões de musculação que já passaram e ficaram sem registo nenhum. É o
  // equivalente das "presenças por marcar" do treinador, e a mesma perda: o
  // que se perde não é a linha, é saber quem apareceu — e sem isso o controlo
  // de carga é uma folha em branco com boa vontade.
  const agora = new Date();
  const comRegisto = new Set(state.attendances.map((a) => a.event_id));
  state.events
    .filter((e) => e.type === 'musculacao' && eventDateTime(e) < agora)
    .forEach((e) => {
      const roster = eventRoster(e);
      if (!roster.length || comRegisto.has(e.id)) return;
      items.push({
        urgency: 'semana', variant: 'warn', family: 'musculacao_por_marcar',
        name: dataCurta(e.date), route: 'fisica',
        title: `Musculação de ${dataCurta(e.date)} sem presenças`,
      });
    });

  // E as que estão agendadas sem ninguém escolhido: uma sessão sem grupo não
  // aparece a atleta nenhuma, e quem a marcou fica à espera de gente que nunca
  // soube que tinha ginásio.
  state.events
    .filter((e) => e.type === 'musculacao' && eventDateTime(e) >= agora)
    .forEach((e) => {
      if (eventRoster(e).length) return;
      // "Nada no preparador é agora" continua a ser a regra deste painel:
      // medir um atleta é trabalho de semanas. A exceção é a sessão que é já —
      // aí não há semana nenhuma, há um ginásio aberto amanhã para o qual
      // ninguém foi avisado.
      const horas = (eventDateTime(e) - agora) / 3600000;
      items.push({
        urgency: horas <= 48 ? 'agora' : 'semana',
        variant: horas <= 48 ? 'danger' : 'warn',
        family: 'musculacao_sem_atletas',
        name: dataCurta(e.date), route: 'fisica',
        title: `Musculação de ${dataCurta(e.date)} sem atletas escolhidos`,
      });
    });

  return collapseFamilies(items);
}

function renderPreparadorPainel(container) {
  const now = new Date();
  const hoje = localToday();
  const athletes = state.players.length;
  const upcomingGames = state.events
    .filter((e) => e.type === 'jogo' && eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, 8);
  const upcomingGym = state.gymSessions
    .filter((se) => (se.date || '') >= hoje)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .slice(0, 8);

  // Quantos atletas têm alguma avaliação, e há quanto tempo foi a última do
  // clube. Substituem "Treinos de ginásio" (que era a contagem da lista logo
  // por baixo) e "Avaliações físicas no total" (que só sabia crescer).
  const avaliados = new Set(state.physicalTests.map((t) => t.player_id)).size;
  const ultimaData = state.physicalTests
    .map((t) => t.date).filter(Boolean).sort().pop() || null;
  const diasDesde = ultimaData
    ? Math.round((new Date(hoje) - new Date(ultimaData)) / 86400000)
    : null;

  const stats = [
    { label: 'Atletas', value: athletes,
      sub: `em ${state.teams.length} equipa${state.teams.length === 1 ? '' : 's'}`, route: 'planteis' },
    { label: 'Avaliados', value: athletes ? `${avaliados}/${athletes}` : '—',
      sub: athletes ? `${Math.round((avaliados / athletes) * 100)}% do clube com medições` : 'ainda sem atletas',
      tone: athletes && avaliados === athletes ? 'ok' : avaliados < athletes / 2 ? 'warn' : '',
      route: 'saude' },
    { label: 'Última avaliação', value: diasDesde == null ? '—' : diasDesde === 0 ? 'hoje' : `${diasDesde} d`,
      sub: ultimaData ? `registada a ${dataCurta(ultimaData)}` : 'ainda sem avaliações',
      tone: diasDesde != null && diasDesde > STALE_TEST_DAYS ? 'warn' : '',
      route: 'saude' },
  ];

  const actions = buildPrepActions();
  // A coluna da agenda só passa à frente da lista quando NÃO há nada urgente —
  // e neste painel a única coisa urgente que existe é uma sessão de musculação
  // já à porta sem ninguém escolhido.
  const urgente = actions.some((a) => a.urgency === 'agora');

  container.innerHTML = `
    <header class="page-head page-head--hero">
      <div>
        <h1 class="section-title">${esc(greeting())}${displayName() ? ', ' + esc(displayName()) : ''}</h1>
        <p class="muted" style="margin:0;font-size:0.9rem">Preparação Física.</p>
      </div>
    </header>

    ${statStrip(stats)}

    <div class="panel-grid${urgente ? '' : ' panel-grid--calm'}">
      <div class="panel-grid__main">
        ${workCard(actions)}

        <section class="card">
          <h2 class="section-title upcoming-card__title">Próximos treinos de ginásio</h2>
          ${upcomingGym.length ? `<ul class="today-list">${upcomingGym.map(gymRow).join('')}</ul>`
            : '<p class="muted" style="margin:0.3rem 0 0">Sem treinos de ginásio agendados.</p>'}
        </section>
      </div>
      <aside class="panel-grid__side">
        <section class="card">
          <h2 class="section-title upcoming-card__title">Próximos jogos</h2>
          ${upcomingGames.length ? upcomingList(upcomingGames)
            : '<p class="muted" style="margin:0.3rem 0 0">Sem jogos agendados.</p>'}
        </section>
      </aside>
    </div>
  `;

  wireWorkCard(container, () => renderPreparadorPainel(container));
  wireAreaPainel(container, 'fisica');
  wireWorkTargets(container, { tab: 'fisica' });
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

function renderTreinadorPainel(container) {
  const teams = myTeams();
  const teamIds = new Set(teams.map((t) => t.id));
  const players = state.players.filter((p) => teamIds.has(p.team_id));
  const today = todayEvents().filter(isMyEvent);

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

  // A faixa não conta as presenças por marcar. O cartão que as listava saiu
  // deste painel (ver abaixo) e o número sozinho não é trabalho: diz que há
  // nove treinos por fechar e não diz quais, o que obriga na mesma a abrir a
  // secção. Quem marca presenças marca-as lá.
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

  // Saíram deste painel o cartão "Presenças por marcar" e o "Treinos por
  // preparar". Eram duas listas longas de treinos, uma por cima da outra, com
  // o mesmo desenho e os mesmos botões, e entre as duas empurravam para fora
  // do ecrã o que o painel tem de dizer primeiro: o que há hoje e quem não
  // vem. As presenças marcam-se na secção Presenças, que é onde se vê o
  // plantel; o plano prepara-se no Calendário ou no próprio evento de hoje,
  // que continua a ter o botão "Plano".
  //
  // `buildActions()` continua sem `includePresencas` — a linha-resumo é
  // supervisão, e ao treinador diria o que ele já sabe sem lhe dizer quais.
  const actions = buildActions();
  const urgente = actions.some((a) => a.urgency === 'agora');

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

    ${absenceAlert(today)}

    ${statStrip(stats)}

    <div class="panel-grid${urgente ? '' : ' panel-grid--calm'}">
      <div class="panel-grid__main">
        ${semResultado.length ? `<section class="card mark-card">
          <h2 class="section-title upcoming-card__title">Jogos por registar</h2>
          <ul class="mark-list">${semResultado.map(resultRow).join('')}</ul>
        </section>` : ''}

        ${workCard(actions)}
      </div>
      <aside class="panel-grid__side">
        ${today.length ? `<section class="card today-card">
          <h2 class="section-title upcoming-card__title">Hoje</h2>
          ${sharedLocation(today) ? `<p class="muted today-card__where">${esc(sharedLocation(today))}</p>` : ''}
          <ul class="mark-list">${today.map((e) => coachTodayRow(e, !!sharedLocation(today))).join('')}</ul>
        </section>` : ''}

        ${limitados.length ? `<section class="card">
          <h2 class="section-title upcoming-card__title">Não estão a 100%</h2>
          <ul class="today-list">${limitados.slice(0, 8).map(limitedRow).join('')}</ul>
        </section>` : ''}

        <section class="card">
          <h2 class="section-title upcoming-card__title">Próximos eventos</h2>
          ${upcoming.length ? upcomingList(upcoming, { absences: true })
            : '<p class="muted" style="margin:0.3rem 0 0">Sem outros eventos agendados.</p>'}
        </section>
      </aside>
    </div>
  `;

  wireWorkCard(container, () => renderTreinadorPainel(container));
  wireWorkTargets(container);
  wireCoachPainel(container);
}


// Linha de "Hoje": mostra o evento e o que se pode fazer com ele agora.
// Quem avisou que NÃO vem, na linha de um evento FUTURO — o de hoje está no
// aviso principal (`absenceAlert`), e desenhá-lo nos dois sítios era dizer ao
// treinador que tinha o dobro das faltas.
//
// A resposta do atleta já existia
// (`event_responses`) e já chegava ao treinador por notificação — mas uma
// notificação lê-se uma vez, de passagem, e no dia do treino a pergunta
// "afinal quem falta hoje?" só tinha resposta na secção Presenças. O painel é
// onde ela se faz, à hora a que se faz.
//
// Só entram os "não vou": o "vou" é o esperado e não muda nada ao treino, e
// quem nem respondeu é ruído num plantel de vinte — a contagem completa está
// nas Presenças, a um clique daqui (a linha leva ao evento, já escolhido).
// O aviso PRINCIPAL: quem não vem hoje, no topo do painel e antes de tudo o
// resto. A linha na agenda (`absenceLine`) chega para um treino de sábado
// respondido na quarta — não chega para o de hoje às 18h30, que é a única
// coisa deste ecrã que muda o que o treinador vai fazer daqui a duas horas.
// Numa coluna lateral, a três cartões de distância, a falta da Rita lia-se
// depois de já ter saído de casa com o treino montado para vinte.
//
// É só de HOJE. Um aviso permanente com as ausências da semana toda deixa de
// ser lido ao terceiro dia — e o que é de sábado continua a ver-se na linha
// do evento, em "Próximos eventos", que é onde se prepara o sábado.
//
// Vai ACIMA da faixa de números: a faixa responde a "como vai a época" e
// isto responde a "com quem conto hoje". Ler a comparência da época antes de
// saber que faltam três pessoas ao treino de logo é a ordem ao contrário.
function absenceAlert(events) {
  if (!canAccess('presencas')) return '';

  const blocos = events
    .map((ev) => ({ ev, ausentes: eventResponseSummary(ev.id).ausentes }))
    .filter((b) => b.ausentes.length);
  if (!blocos.length) return '';

  const total = blocos.reduce((n, b) => n + b.ausentes.length, 0);

  // Aqui o nome vai INTEIRO e o motivo com ele. Este é o sítio com espaço
  // para os dizer, e é o motivo que evita a mensagem de telemóvel a
  // perguntar porquê — na linha da agenda só cabia com uma ausência.
  const linha = ({ ev, ausentes }) => {
    const team = teamById(ev.team_id);
    const quando = [eventTimeRange(ev), team ? teamName(team) : '']
      .filter(Boolean).join(' · ');
    const quem = ausentes
      .map((a) => a.player.name + (a.note ? ` (${a.note})` : ''))
      .join(', ');
    return `
      <li>
        <button class="absent-row" type="button" data-work-event="${esc(ev.id)}"
                title="Ver quem vem a este evento">
          ${quando ? `<span class="absent-row__when">${esc(quando)}</span>` : ''}
          <span class="absent-row__who">${esc(quem)}</span>
        </button>
      </li>`;
  };

  return `
    <section class="card absent-card" role="status">
      <h2 class="section-title absent-card__title">
        ✋ ${total} ${total === 1 ? 'atleta avisou que não vem' : 'atletas avisaram que não vêm'} hoje
      </h2>
      <ul class="absent-list">${blocos.map(linha).join('')}</ul>
    </section>`;
}

function absenceLine(ev) {
  if (!canAccess('presencas')) return '';
  const { ausentes } = eventResponseSummary(ev.id);
  if (!ausentes.length) return '';

  // Primeiros nomes, como nos aniversários: numa coluna de 360px o nome
  // completo de três atletas parte a linha, e quem treina o plantel reconhece
  // pelo primeiro. Os homónimos resolvem-se no ecrã a que isto leva.
  const nomes = ausentes.slice(0, 3).map((a) => a.player.name.split(/\s+/)[0]);
  const resto = ausentes.length > nomes.length ? ` e mais ${ausentes.length - nomes.length}` : '';
  // Com UMA ausência o motivo cabe, e é o motivo que evita a mensagem de
  // telemóvel a perguntar porquê. Com três, os motivos não cabem em lado
  // nenhum e a lista inteira está a um clique.
  const motivo = ausentes.length === 1 && ausentes[0].note ? ` — ${ausentes[0].note}` : '';

  return `
    <button class="row-absent" type="button" data-work-event="${esc(ev.id)}"
            title="Ver quem vem a este evento">
      ✋ ${ausentes.length} não ${ausentes.length === 1 ? 'vem' : 'vêm'}:
      ${esc(nomes.join(', '))}${esc(resto)}${esc(motivo)}
    </button>`;
}

function coachTodayRow(ev, hideLocation = false) {
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
          hideLocation ? '' : (ev.location || ''),
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

function wireCoachPainel(container) {
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
