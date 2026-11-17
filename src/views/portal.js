// Portal do atleta: a vista pessoal, mobile-first.
//
// Quem abre isto abre para responder a uma de três perguntas — o que tenho a
// seguir, como vai a minha época, onde está o meu cartão. Por isso a página é
// um CABEÇALHO DE AÇÃO (o próximo compromisso, com os botões de resposta já à
// vista) seguido de três separadores, e não a pilha de nove secções com o
// mesmo peso que era antes: no telemóvel davam cinco ou seis ecrãs de scroll e
// a pergunta mais frequente ("a que horas é o treino?") ficava a meio deles.
//
// É de leitura, tirando as respostas a eventos e a decisão tática. O RLS
// garante que o atleta só recebe os seus próprios dados.

import {
  state, respondToEvent, respondToAppointment, saveTacticalAnswer, dbErrorMessage,
  createEquipmentRequests, deleteRow, articlePhotoUrl,
  savePlayerPhoto, saveMyPlayerData, uploadPlayerDocument, loadMyScoutGames,
} from '../store.js';
import {
  setsWon, partials, teamSummary, playerRows, pointsPlayed, usedCols, counts, QUALITY, qualityOf,
  ACT, ERR_TYPES,
} from '../scout-engine.js';
import { serveZoneStats, receptionZoneStats, errorTypeStats, runsLost, ZONES } from '../scout-patterns.js';
import { evoChart, wireEvo } from '../scout-charts.js';
import { toastOk, toastError } from '../toast.js';
import { getNotifications, markRead } from '../notifications.js';
import { openModal, wireDialog, confirmDialog } from '../modal.js';
import { saveOfflineCard } from '../offline-card.js';
import { renderDrill } from '../tactical-court.js';
import { esc, euros, emptyHTML, pickFile, safeUrl } from '../ui.js';
import { photoAvatarHTML, hydratePhotos } from '../player-photo.js';
import {
  upcomingEvents,
  eventDateTime,
  eventTimeRange,
  teamById,
  teamName,
  playerAttendanceStats,
  playerEventResponse, eventResponseWindow, canRespondToEvent, isPlayerEvent,
  playerRecentTrainings,
  playerRecentForm,
  playerUpcomingSquads,
  requestableArticles,
  articleLabel,
  requestCost,
  playerOrder,
  playerDataGaps,
  playerPhotoReady,
  myUpcomingAppointments,
  myRehabPlan,
} from '../compute.js';
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_BADGE,
  ATTENDANCE_STATUSES,
  ATTENDANCE_LABEL,
  ATTENDANCE_BADGE,
  AVAILABILITY_LABEL,
  AVAILABILITY_BADGE,
  EVENT_RESPONSES,
  WEEKDAYS,
  TACTICAL_ROLE_LABEL,
  TACTICAL_ROLE_MATCH,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_BADGE,
  PLAYER_DATA_ITEMS,
} from '../constants.js';

// Estado local de UI, como nos filtros das outras vistas: sobrevive aos
// re-desenhos do store (uma resposta gravada não pode mandar o atleta de volta
// ao primeiro separador).
let portalTab = 'hoje';
let drillsShowAll = false;
let scoutShowAll = false;

// O SVG do cartão fica em cache pelo token: o portal re-desenha a cada
// notificação do store e não há razão para redesenhar o mesmo código QR.
let cardCache = { token: null, promise: null };

const PORTAL_TABS = [
  { key: 'hoje',   label: 'Hoje' },
  { key: 'jogos',  label: 'Jogos', needsGames: true },
  { key: 'epoca',  label: 'A época' },
  { key: 'cartao', label: 'Cartão', needsCard: true },
];

// A posição do cenário casa com a da atleta? O cruzamento é por palavra-chave
// porque `settings.positions` é configurável pelo clube — um chama-lhe
// "Distribuidor", outro "Passador", e nenhum tem de saber que isto existe.
// Sem posição na ficha, mostra-se tudo: é melhor do que esconder.
function roleMatchesPlayer(role, position) {
  const keys = TACTICAL_ROLE_MATCH[role];
  if (!keys || !keys.length) return true;   // ex.: serviço — toda a gente serve
  if (!position) return true;
  const p = position.toLowerCase();
  return keys.some((k) => p.includes(k));
}

// Data curta para as listas: "Dom 02/08". Em pt-PT o `weekday: 'short'` do
// Intl devolve o nome inteiro ("domingo"), que parte a coluna em duas linhas —
// daí usar as abreviaturas que a app já tem para a recorrência dos treinos.
function shortDay(dt) {
  const wd = WEEKDAYS.find((w) => w.n === dt.getDay())?.label || '';
  const dm = dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  return `${wd} ${dm}`.trim();
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// "Hoje" / "Amanhã" / "Sexta-feira, 29 de agosto". No cabeçalho de ação a
// distância importa mais do que a data: quem abre o portal à segunda quer
// saber se é hoje, não que dia do mês é.
function relativeDay(dt) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(dt);
  d.setHours(0, 0, 0, 0);
  const dias = Math.round((d - hoje) / 86400000);
  if (dias === 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  return cap(dt.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long' }));
}

// Os eventos que dizem respeito a este atleta: os da sua equipa e os do clube
// (`team_id` nulo), mais as sessões de MUSCULAÇÃO para que foi escolhida — que
// são da sua equipa mas não são de toda a gente. O RLS já entrega só estes, mas
// a vista não depende disso: é o mesmo recorte que decide quem pode responder
// ao quê (`isPlayerEvent`).
function myUpcoming(me, limit) {
  return upcomingEvents(60)
    .filter((ev) => isPlayerEvent(me, ev))
    .slice(0, limit);
}

export function renderPortal(container) {
  // O atleta da conta atual. Sem correspondência NÃO se mostra outro registo:
  // o fallback para `state.players[0]` que aqui esteve dava as presenças, as
  // quotas e — pior — o cartão QR de outra pessoa a quem tivesse a conta ainda
  // por ligar. Um portal vazio é mau; o portal de outra atleta é grave.
  const me = state.players.find((p) => p.user_id && p.user_id === state.profile?.id) || null;

  if (!me) {
    container.innerHTML = `
      <header class="page-head">
        <div>
          <h1 class="section-title">A minha página</h1>
        </div>
      </header>
      ${emptyHTML('A tua conta ainda não está associada a um atleta. Pede ao clube para te vincular.')}
    `;
    return;
  }

  const team = teamById(me.team_id);
  const availability = state.availability.find((a) => a.player_id === me.id);
  const upcoming = myUpcoming(me, 8);
  const next = upcoming[0] || null;

  const tabs = PORTAL_TABS.filter((t) => (!t.needsCard || me.qr_token) && (!t.needsGames || hasPlayedGames(me)));
  if (!tabs.some((t) => t.key === portalTab)) portalTab = tabs[0].key;

  // Tudo dentro de um invólucro próprio: o portal é uma coluna só, e a app
  // corre a largura toda de propósito (ver `.content__inner`). Num monitor,
  // cartões de dois mil píxeis para três linhas de texto ficavam desertos.
  container.innerHTML = `
    <div class="portal">
    ${heroHTML(me, team, availability)}
    ${dadosHTML(me)}
    ${nextUpHTML(next, me)}
    ${physioHTML()}
    ${orderHTML(playerOrder(me.id))}

    <div class="cal-toggle section-tabs portal-tabs" role="tablist" aria-label="Áreas da minha página">
      ${tabs.map((t) => `
        <button class="cal-toggle__btn ${portalTab === t.key ? 'cal-toggle__btn--active' : ''}"
                data-portal-tab="${t.key}" type="button" role="tab"
                aria-selected="${portalTab === t.key}">${esc(t.label)}</button>
      `).join('')}
    </div>

    <div id="portal-body">
      ${portalTab === 'hoje'   ? hojeHTML(me, upcoming) : ''}
      ${portalTab === 'jogos'  ? jogosHTML(me) : ''}
      ${portalTab === 'epoca'  ? epocaHTML(me) : ''}
      ${portalTab === 'cartao' ? cartaoHTML() : ''}
    </div>
    </div>
  `;

  wire(container, me, team);
  hydratePhotos(container);
}

// --- O meu plano de recuperação -------------------------------------------
//
// Vive no separador «Hoje» — que é o que abre — e não acima dos separadores,
// como o atendimento. A diferença é a duração: um atendimento é um
// compromisso que acontece e passa, e por isso ganha o topo; um plano de
// recuperação dura semanas, e um bloco permanente no cimo do ecrã deixa de
// ser lido ao terceiro dia. Aqui é a primeira coisa do separador que ela
// abre, que é tanto quanto precisa.
//
// Desaparece sozinho com a alta: o RLS só lhe entrega os exercícios de
// episódios em curso.
function rehabHTML() {
  const plano = myRehabPlan();
  if (!plano.length) return '';

  const linha = (r) => {
    const carga = [r.sets ? `${r.sets} ×` : '', r.reps || ''].filter(Boolean).join(' ');
    const url = safeUrl(r.link_url);
    return `
      <li class="portal-rehab__item">
        <div class="portal-rehab__head">
          <strong class="portal-rehab__name">${esc(r.name)}</strong>
          ${carga ? `<span class="badge badge--info">${esc(carga)}</span>` : ''}
          ${r.frequency ? `<span class="badge badge--muted">${esc(r.frequency)}</span>` : ''}
        </div>
        ${r.notes ? `<p class="portal-rehab__notes">${esc(r.notes)}</p>` : ''}
        ${url ? `<a class="portal-rehab__link" href="${esc(url)}" target="_blank" rel="noopener">Ver o exercício</a>` : ''}
      </li>`;
  };

  return `
    <section class="card portal-section portal-rehab">
      <h2 class="section-title portal-section__title">O meu plano de recuperação</h2>
      <p class="portal-section__note">
        Os exercícios que a fisioterapia te deixou. Se algum doer, não insistas —
        diz-lhe na próxima sessão.
      </p>
      <ul class="portal-rehab__list">${plano.map(linha).join('')}</ul>
    </section>
  `;
}

// --- A minha fisioterapia -------------------------------------------------
//
// Até aqui, no circuito da fisioterapia, toda a gente sabia de tudo menos a
// pessoa de quem se estava a falar: o treinador via o pedido que fez e a data
// marcada, a fisio via a fila — e aqui havia um crachá a dizer "Em
// recuperação" e mais nada. O dia da consulta chegava-lhe por alguém lho
// dizer no balneário, que é a razão de metade das faltas.
//
// Fica logo a seguir ao "A seguir" e ACIMA dos separadores, pela mesma razão
// que o pôs ali: é um compromisso com hora e sítio, e um compromisso não se
// esconde atrás de um separador. Desaparece sozinho quando não há nenhum —
// não é um aviso permanente.
//
// Mostra o COMPROMISSO e nada mais. O que a fisio escreveu sobre ela — o que
// suspeita, o que vai fazer — fica onde está: é a leitura clínica dela, feita
// para ela, e no telemóvel, sem ninguém ao lado para a explicar, lê-se como um
// diagnóstico. O que chega aqui é o que a atleta precisa para lá estar.
function physioHTML() {
  const proximos = myUpcomingAppointments();
  if (!proximos.length) return '';

  // A resposta vai direta à fisio (`respond_to_appointment`). Antes a única
  // saída era "avisa o teu treinador", que avisava a fisio se se lembrasse —
  // e a fisio ficava à espera, e a atleta levava uma falta por ter avisado.
  const canAnswer = state.apptResponseReady;
  const linha = (a) => {
    const dt = new Date(`${a.ap_date}T${(a.ap_time || '23:59').slice(0, 5)}`);
    const horas = a.ap_time
      ? esc(a.ap_time.slice(0, 5)) + (a.end_time ? '–' + esc(a.end_time.slice(0, 5)) : '')
      : '';
    const aberto = canAnswer && dt > new Date();
    const resp = a.athlete_response || '';
    return `
      <li class="portal-fisio__item">
        <span class="portal-fisio__when">
          <strong>${esc(relativeDay(dt))}</strong>${horas ? ` · ${horas}` : ''}
        </span>
        ${a.location ? `<span class="portal-fisio__where">${esc(a.location)}</span>` : ''}
        ${aberto ? `
          <div class="portal-resp" data-appt="${esc(a.id)}">
            ${APPT_RESPONSES.map((r) => `
              <button type="button"
                class="portal-resp__btn portal-resp__btn--${r.key}${resp === r.key ? ' is-active' : ''}"
                data-appt-response="${r.key}" data-appt="${esc(a.id)}"
                aria-pressed="${resp === r.key}">${esc(r.label)}</button>`).join('')}
          </div>` : ''}
        ${resp === 'nao_posso'
          ? `<p class="portal-resp-note">Avisaste que não podes${a.athlete_note ? `: “${esc(a.athlete_note)}”` : '.'} A fisio vai remarcar.</p>`
          : ''}
      </li>`;
  };

  return `
    <section class="card portal-next portal-fisio">
      <span class="portal-next__label">Fisioterapia</span>
      <ul class="portal-fisio__list">${proximos.slice(0, 3).map(linha).join('')}</ul>
      <p class="portal-fisio__note">${canAnswer
        ? 'Se não puderes ir, carrega em “Não posso” — a fisio é avisada logo.'
        : 'Se não puderes ir, avisa o teu treinador.'}</p>
    </section>
  `;
}

// --- A ficha por completar -----------------------------------------------
//
// Três dados faltam em quase todas as fichas — foto, data de nascimento e
// fotocópia do CC — e o clube não os consegue preencher sozinho: estão todos
// deste lado. Pedi-los por mensagem, atleta a atleta, é o trabalho que nunca
// acaba; aqui a pergunta fica no sítio por onde ela passa de qualquer maneira.
//
// FICA ATÉ ESTAR PREENCHIDO, e desaparece sozinho quando estiver: é o único
// bloco do portal que se põe à frente do "A seguir", e ganha esse lugar
// precisamente por ser temporário. Um aviso permanente no topo deixa de ser
// lido ao terceiro dia.
function dadosHTML(me) {
  // Antes da migração (`supabase/dados-atleta.sql`) não há coluna para a foto
  // nem política que a deixe entregar o cartão de cidadão: o cartão pedia três
  // coisas e as três davam erro. É a mesma linha do `birthDateReady()` — um
  // botão que dá erro é pior do que um botão que não existe.
  if (!playerPhotoReady()) return '';

  const gaps = playerDataGaps(me);
  if (!gaps.length) return '';

  const itens = PLAYER_DATA_ITEMS.filter((i) => gaps.includes(i.key));
  return `
    <section class="card portal-dados">
      <div class="portal-dados__head">
        <span class="portal-dados__label">Falta na tua ficha</span>
        <p class="portal-dados__intro">
          O clube precisa disto para te inscrever. Só tu o podes preencher — demora um minuto.
        </p>
      </div>
      <ul class="portal-dados__list">
        ${itens.map((i) => `
          <li class="portal-dados__item">
            <div class="portal-dados__text">
              <strong>${esc(i.label)}</strong>
              <span class="muted">${esc(i.ask)}</span>
            </div>
            <button class="btn btn--primary btn--sm" data-dados="${i.key}" type="button">${esc(i.action)}</button>
          </li>
        `).join('')}
      </ul>
      ${gaps.includes('cc') ? `
        <p class="portal-dados__nota muted">
          A fotocópia fica guardada num arquivo privado do clube: só a direção e o
          departamento clínico lhe chegam.
        </p>` : ''}
    </section>
  `;
}

// Um campo de ficheiro fora de um formulário: o que se quer aqui é UM gesto
// (escolher a foto no telemóvel), e um modal com um `type: 'file'` e um botão
// de gravar são três. O elemento vive só o tempo da escolha.
async function fillFoto(me, container) {
  const file = await pickFile('image/*');
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    toastError('A imagem não pode exceder 12 MB.');
    return;
  }
  try {
    await savePlayerPhoto(me.id, file);
    toastOk('Fotografia guardada.');
    renderPortal(container);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

function fillNascimento(me) {
  openModal({
    title: 'Data de nascimento',
    intro: 'Escreve o dia em que fazes anos. Depois de gravada, só o clube a pode corrigir.',
    submitLabel: 'Guardar',
    fields: [
      { name: 'birth_date', label: 'Data de nascimento', type: 'date', required: true },
    ],
    onSubmit: async (values) => {
      const d = values.birth_date;
      if (!d) throw new Error('Escolhe uma data.');
      if (new Date(d) > new Date()) throw new Error('A data não pode ser no futuro.');
      // A DATA manda no ano, e não ao contrário. O formulário chegou a recusar
      // um ano diferente do que a ficha tinha, para proteger o escalão — e o
      // que isso fazia era barrar precisamente quem tinha o ano errado na
      // ficha: a atleta lia "fala com o clube" e ficava sem preencher nada,
      // que é o problema que isto veio resolver. O ano da ficha é muitas vezes
      // um palpite de uma importação antiga; a data vem do cartão de cidadão
      // dela. O `players_sync_birth_year` (supabase/aniversarios.sql) acerta o
      // ano sozinho a partir da data — as duas colunas nunca divergem.
      await saveMyPlayerData({ birth_date: d });
      toastOk('Data guardada.');
    },
  });
}

async function fillCC(me, container) {
  // `image/*` e não uma lista de extensões: no iPhone as fotos são HEIC, e
  // uma lista de `.jpg/.png` deixava-as a cinzento no seletor — a fotocópia
  // que a pessoa tem para dar era precisamente a que não conseguia escolher.
  // A conversão para JPEG faz-se depois, no `uploadPlayerDocument`.
  const file = await pickFile('image/*,application/pdf');
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    toastError('O ficheiro não pode exceder 10 MB.');
    return;
  }
  try {
    await uploadPlayerDocument(me.id, 'cc', file, null);
    toastOk('Fotocópia enviada.');
    renderPortal(container);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

// --- Cabeçalho -----------------------------------------------------------

function heroHTML(me, team, availability) {
  const first = (me.name || '').split(/\s+/)[0] || '';
  const meta = [
    team ? teamName(team) : 'Sem equipa atribuída',
    me.number ? `Nº ${me.number}` : '',
    me.position || '',
  ].filter(Boolean).join(' · ');

  // A disponibilidade só aparece quando NÃO está tudo bem: dizer "Apto" a
  // quem está apto é ocupar o topo do ecrã com uma não-notícia. Quando há
  // limitações, é a primeira coisa que ela tem de ver.
  const alerta = availability && availability.status !== 'apto'
    ? `<div class="portal-hero__avail">
         <span class="badge badge--${AVAILABILITY_BADGE[availability.status] || 'muted'}">
           ${esc(AVAILABILITY_LABEL[availability.status] || availability.status)}
         </span>
         ${availability.limitations ? `<span class="portal-hero__avail-note">${esc(availability.limitations)}</span>` : ''}
         ${availability.expected_return
           ? `<span class="portal-hero__avail-note">Retorno previsto: ${esc(
               new Date(availability.expected_return + 'T00:00')
                 .toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' })
             )}</span>`
           : ''}
       </div>`
    : '';

  // O "Pedir equipamento" vive AQUI, ao lado do cumprimento, e não enterrado
  // no fundo do separador "A época": quem precisa de uma camisola nova abre o
  // portal para isso, e chegar ao botão obrigava a trocar de separador e a
  // percorrer as quotas todas até ao fim. Está no cimo e está sempre — em
  // qualquer separador — que é o mesmo lugar que o cartão QR tem no cimo do
  // telemóvel de quem entra no pavilhão.
  const pedir = requestableArticles().length
    ? '<button class="btn btn--primary btn--sm portal-hero__cta" id="portal-pedir" type="button">Pedir equipamento</button>'
    : '';

  return `
    <header class="portal-hero">
      <div class="portal-hero__id">
        ${me.photo_path ? photoAvatarHTML(me, 'portal-hero__foto') : ''}
        <div class="portal-hero__nome">
          <h1 class="portal-hero__greet">${esc(greet())}${first ? ', ' + esc(first) : ''}</h1>
          <p class="portal-hero__meta">${esc(meta)}</p>
        </div>
      </div>
      ${alerta || pedir ? `<div class="portal-hero__side">${alerta}${pedir}</div>` : ''}
    </header>
  `;
}

// O bloco de ação: o próximo compromisso, com dia, hora, sítio e a resposta.
// É a razão pela qual a maior parte das pessoas abre isto, e por isso vive
// acima dos separadores — está lá seja qual for o separador escolhido.
function nextUpHTML(ev, me) {
  if (!ev) {
    return `
      <section class="card portal-next portal-next--vazio">
        <span class="portal-next__label">A seguir</span>
        <p class="portal-next__title">Sem nada agendado</p>
        <p class="portal-next__meta">Quando o teu treinador marcar o próximo treino ou jogo, aparece aqui.</p>
      </section>`;
  }

  const dt = eventDateTime(ev);
  const range = eventTimeRange(ev);
  const tipo = EVENT_TYPE_LABEL[ev.type] || ev.type;
  const titulo = ev.opponent ? `${tipo} vs ${ev.opponent}` : (ev.title || tipo);

  return `
    <section class="card portal-next portal-next--${esc(ev.type)}">
      <span class="portal-next__label">A seguir</span>
      <p class="portal-next__title">${esc(titulo)}</p>
      <p class="portal-next__when">
        <strong>${esc(relativeDay(dt))}</strong>${range ? ` · ${esc(range)}` : ''}
      </p>
      ${ev.location ? `<p class="portal-next__meta">${esc(ev.location)}</p>` : ''}
      ${responseHTML(ev, me, 'portal-resp--lg')}
    </section>
  `;
}

// --- Separador "Hoje" ----------------------------------------------------

function hojeHTML(me, upcoming) {
  // Avisos do clube: chegam pelas notificações (que o atleta já recebe no sino
  // e por push), mas repetem-se aqui porque é no portal que ele vive.
  const avisos = getNotifications()
    .filter((n) => n.type === 'club_announcement')
    .slice(0, 5);
  const porLer = avisos.filter((n) => !n.read_at);

  // Cenários de decisão tática publicados para ela. O RLS já só lhe entrega os
  // publicados da sua equipa (ou do clube); o filtro aqui é defensivo.
  const allDrills = (state.tacticalScenarios || []).filter(
    (sc) => sc.published && (!sc.team_id || sc.team_id === me.team_id)
  );
  // Por omissão mostram-se os da POSIÇÃO dela — é o que ela veio fazer. Mas
  // pode abrir os restantes: uma central perceber a decisão de quem lhe joga a
  // bola é provavelmente a coisa mais útil que aqui há.
  const mineDrills = allDrills.filter((sc) => roleMatchesPlayer(sc.role, me.position));
  const drills = drillsShowAll || !mineDrills.length ? allDrills : mineDrills;
  const otherCount = allDrills.length - mineDrills.length;
  const answered = new Set(
    (state.tacticalAnswers || []).filter((a) => a.player_id === me.id).map((a) => a.scenario_id)
  );

  return `
    ${rehabHTML()}

    ${avisos.length ? `
    <section class="card portal-section">
      <div class="portal-section__head">
        <h2 class="section-title portal-section__title">Avisos do clube</h2>
        ${porLer.length
          ? `<button class="btn btn--ghost btn--xs" data-avisos-read type="button">Marcar lidos</button>`
          : ''}
      </div>
      <ul class="portal-avisos">
        ${avisos.map((n) => `
          <li class="portal-aviso${n.read_at ? '' : ' portal-aviso--novo'}">
            <strong class="portal-aviso__title">${esc(n.title)}</strong>
            <p class="portal-aviso__body">${esc(n.body)}</p>
            <span class="muted portal-aviso__when">${esc(whenText(n.created_at))}</span>
          </li>`).join('')}
      </ul>
    </section>
    ` : ''}

    ${drills.length ? `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">Decisão tática</h2>
      <p class="portal-section__note">
        Lê o que se passa no campo e escolhe o que farias. Não há uma resposta
        certa — no fim vês o que o teu treinador pensa de cada opção.
      </p>
      <ul class="portal-drills">
        ${drills.map((sc) => `
          <li class="portal-drill">
            <div class="portal-drill__text">
              <span class="tb-tag tb-tag--role">${esc(TACTICAL_ROLE_LABEL[sc.role] || sc.role)}</span>
              <strong>${esc(sc.title)}</strong>
              ${answered.has(sc.id) ? '<span class="badge badge--muted">já respondeste</span>' : ''}
            </div>
            <button class="btn btn--sm btn--primary" data-drill="${esc(sc.id)}">
              ${answered.has(sc.id) ? 'Repetir' : 'Começar'}
            </button>
          </li>`).join('')}
      </ul>
      ${mineDrills.length && otherCount
        ? `<button class="btn btn--link portal-section__more" data-drills-toggle type="button">
             ${drillsShowAll
               ? 'Mostrar só os da minha posição'
               : `Ver também os das outras posições (${otherCount})`}
           </button>`
        : ''}
    </section>
    ` : ''}

    <section class="card portal-section">
      <h2 class="section-title portal-section__title">O que tenho pela frente</h2>
      <p class="portal-section__note">
        Diz ao teu treinador se contas ir. Avisar não é justificar a falta —
        quem decide isso é ele.
      </p>
      ${upcoming.length
        ? `<ul class="portal-events">${upcoming.map((ev) => eventRow(ev, me)).join('')}</ul>`
        : '<p class="portal-section__note">Sem eventos agendados.</p>'}
    </section>
  `;
}

// --- Separador «Jogos» (scout) --------------------------------------------
//
// As estatísticas de jogo DELA e as da EQUIPA — e nunca as das colegas. A
// RPC `my_scout_games` já entrega as ações das outras sem dono (contam para o
// marcador e para os totais da equipa, mas não dizem de quem são), por isso
// aqui não há nada a esconder: o que não chegou não se pode mostrar.
//
// É um separador e não uma secção de «A época»: é a parte do portal que ela
// abre por gosto, depois de cada jogo, e ao fim de um campeonato são trinta
// jogos — entre as presenças e o material afogava o resto.
//
// Mostra-se o que ela FEZ e não uma nota. "Eficácia −9%" é linguagem de
// treinador: a uma miúda de catorze anos lê-se como "sou má" sem dizer
// porquê. Cada jogo conta uma pequena história em três passos (decidido sobre
// uma maqueta, à frente de três versões):
//   1. O teu jogo numa FRASE — uma coisa boa e, no máximo, uma para a próxima.
//   2. O que fizeste em BOLAS — uma por ação, com forma E cor (verde cheia,
//      círculo vazio, quadrado laranja, vermelha com ×). Contar bolas lê-se sem
//      explicação; uma barra proporcional com percentagens não.
//   3. No CAMPO — desenhado a sério, "lado delas" e "o nosso lado", sem números
//      de zona: uma miúda de 14 anos não sabe onde fica a zona 5.
// Tudo o resto (evolução, barras da equipa, tipos de erro, como ler) vai para
// um "Ver mais" fechado. Os fundamentos são só os que se marcaram (`usedCols`):
// num jogo em que o treinador não scoutou bloco, "Bloco 0" dizia que ela não
// blocou.

// Uma barra empilhada + a legenda por palavras. `segs` = [[n, rótulo, tom]].
function stackBar(segs, label) {
  const shown = segs.filter(([n]) => n > 0);
  const aria = `${label}: ${shown.map(([n, l]) => `${n} ${l}`).join(', ')}`;
  return `
    <div class="sc-bar" role="img" aria-label="${esc(aria)}">
      ${shown.map(([n, , tone]) => `<span class="sc-bar__seg sc-tone--${tone}" style="flex-grow:${n}"></span>`).join('')}
    </div>
    <p class="sc-legend">${shown.map(([n, l, tone]) =>
      `<span><i class="sc-dot sc-tone--${tone}"></i>${n} ${esc(l)}</span>`).join('')}</p>`;
}


// Fundamentos com menos ações do que isto vão para "Ver mais".
const FUND_SHOW_MIN = 5;

// Comparar com a média DELA só a partir daqui: com 4 ações, 2 defesas boas
// já davam uma seta vermelha, e uma comparação que oscila com uma bola é
// uma nota injusta.
const COMPARE_MIN = 8;

// O fundamento por extenso, com o artigo e a contração certos: "o teu
// serviço", "a tua receção", "no ataque", "na receção".
const FUND_WORDS = {
  ATTACK: { name: 'ataque', the: 'o teu', in: 'no' },
  SERVICE: { name: 'serviço', the: 'o teu', in: 'no' },
  RECEPTION: { name: 'receção', the: 'a tua', in: 'na' },
  DEFENSE: { name: 'defesa', the: 'a tua', in: 'na' },
  SETTING: { name: 'passe', the: 'o teu', in: 'no' },
  BLOCK: { name: 'bloco', the: 'o teu', in: 'no' },
};

// "9 de 26 ataques deram ponto" — o mesmo número da percentagem, dito como
// se diz em voz alta. O verbo concorda com o número das que correram bem.
function goodPhrase(k, { good, n }) {
  const one = good === 1;
  const verb = {
    ATTACK: one ? 'deu ponto' : 'deram ponto',
    SERVICE: one ? 'entrou' : 'entraram',
    RECEPTION: one ? 'foi boa' : 'foram boas',
    DEFENSE: one ? 'foi boa' : 'foram boas',
    SETTING: one ? 'foi bom' : 'foram bons',
    BLOCK: one ? 'deu ponto ou amorteceu' : 'deram ponto ou amorteceram',
  }[k];
  const unit = QUALITY.find((q) => q.k === k).unit;
  return `${good} de ${n} ${unit} ${verb}`;
}

// Este jogo contra o que é normal NELA. "Menos do que costumas" é âmbar e
// não vermelho, e sem negrito: é a regra das avaliações físicas — vermelho
// lê-se como avaria, e um jogo abaixo do costume não é uma avaria.
function compareToSelf(qo, avg) {
  if (avg == null || qo.n < COMPARE_MIN) return null;
  const d = qo.rate - avg;
  const ref = `${Math.round(avg * 100)}%`;
  if (Math.abs(d) < 0.05) return { dir: 'eq', d, tone: 'eq', arrow: '', text: `como costumas (${ref})` };
  return d > 0
    ? { dir: 'up', d, tone: 'good', arrow: '↑ ', text: `mais do que costumas (${ref})` }
    : { dir: 'down', d, tone: 'bad', arrow: '↓ ', text: `menos do que costumas (${ref})` };
}


// Abaixo disto, a percentagem de um jogo não conta: duas receções boas em duas
// são 100% e não dizem nada. O ponto do gráfico fica oco e a comparação com a
// média não se faz.
const EVO_MIN = 4;

// A média DELA num fundamento, ponderada pelas ações (e não a média das
// percentagens, que dava a um jogo de 2 receções o peso de um de 30).
function myAverages(datas, me) {
  const c = counts(datas)[me.id] || {};
  const out = {};
  for (const q of QUALITY) { const o = qualityOf(c, q.k); out[q.k] = o.n >= EVO_MIN ? o.rate : null; }
  return out;
}

// O fundamento em que ela mais mexeu na bola: é o que diz o tipo de jogo que
// fez (receção para a líbero, ataque para a oposta) e é a qualidade que vai
// para a linha fechada do jogo e para o número grande.
function mainQuality(datas, me) {
  const c = counts(datas)[me.id] || {};
  let best = null;
  for (const q of QUALITY) {
    const o = qualityOf(c, q.k);
    if (o.n && (!best || o.n > best.n)) best = { ...o, q };
  }
  return best;
}


// «Como ler isto»: o que cada cor e cada percentagem querem dizer, em
// palavras de quem tem catorze anos. Fechado por omissão — quem já sabe não
// tem de passar por cima disto todas as vezes —, e só com os fundamentos que
// se marcaram.
const HELP = {
  RECEPTION: ['Receção', 'Boa (bola verde): a bola chegou à distribuidora e deu para atacar. Difícil (círculo vazio): ficou em jogo, mas difícil de atacar. Erro (bola com ×): ponto para o adversário.'],
  ATTACK: ['Ataque', 'Ponto (bola verde): a bola caiu no campo delas ou ficou perdida para elas. Defendido (círculo vazio): elas defenderam e o jogo seguiu — não é erro. Bloqueado (quadrado laranja): o bloco delas parou a bola e ganhou o ponto. Erro (bola com ×): fora ou na rede.'],
  SERVICE: ['Serviço', 'Ás (bola verde): ponto direto. Em jogo (círculo vazio): entrou e o jogo seguiu. Erro (bola com ×): fora ou na rede. A percentagem é a dos serviços que entraram.'],
  DEFENSE: ['Defesa', 'Boa (bola verde): a bola ficou jogável para a equipa. Difícil (círculo vazio): ficou em jogo, mas difícil de jogar. Erro (bola com ×): a bola caiu ou ficou impossível de jogar.'],
  SETTING: ['Passe', 'Bom (bola verde): a atacante pôde atacar à vontade. Difícil (círculo vazio): deu para jogar, mas com dificuldade. Erro (bola com ×): dupla, condução ou bola perdida.'],
  BLOCK: ['Bloco', 'Ponto (bola verde): o teu bloco ganhou o ponto. Toque (círculo vazio): tocaste e a bola ficou em jogo. Erro (bola com ×): rede ou bola que saiu por ti.'],
};
function helpHTML(used, { charts = false } = {}) {
  return `<details class="sc-help">
    <summary>Como ler isto</summary>
    <div class="sc-help__body">
      <dl>
        <dt>Pontos que jogaste</dt><dd>Quantos pontos do jogo estiveste dentro de campo. Diz quanto jogaste — não quanto jogaste bem.</dd>
        ${QUALITY.filter((q) => used.has(q.k)).map((q) => `<dt>${esc(HELP[q.k][0])}</dt><dd>${esc(HELP[q.k][1])}</dd>`).join('')}
      </dl>
      <p><strong>Cada bola é uma ação tua.</strong> Quando fazes 10 ou mais, a fila passa a ser <strong>«em cada 10»</strong>: as tuas 42 receções viram 10 bolas, na mesma proporção, e os números certos estão escritos por baixo. Conta a proporção, e não quantas fizeste — quem joga menos tempo faz menos ações.</p>
      <p><strong>No campo</strong>, em cima é o lado delas e em baixo o nosso. O contorno marca a tua melhor zona. Numa zona com muitas ações aparece a conta («12 de 15») em vez das bolas.</p>
      <p><strong>Mais / menos do que costumas</strong> compara este jogo contigo própria, nos teus outros jogos. Ninguém mais entra nesta conta, e só aparece quando fizeste pelo menos ${COMPARE_MIN} ações nesse fundamento — com menos, uma bola mudava tudo.</p>
      ${charts ? '<p><strong>Os gráficos</strong> mostram cada jogo, do mais antigo para o mais recente. O tracejado é a tua média. Uma bolinha vazia é um jogo com poucas ações, que não conta. Toca num ponto para veres o jogo.</p>' : ''}
    </div>
  </details>`;
}

// A evolução: um gráfico por fundamento com a QUALIDADE jogo a jogo, nos
// últimos 10 jogos. Só os fundamentos em que ela tem ações que cheguem (10 no
// total e 3 jogos), pela ordem do que mais faz.
const EVO_GAMES = 10;
function qualityEvo(games, me, used) {
  const recent = games.slice(0, EVO_GAMES).reverse();
  const fmt = (d) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');
  const all = counts(games.map((g) => g.data))[me.id] || {};
  const per = recent.map((g) => counts([g.data])[me.id] || {});
  const charts = QUALITY.filter((q) => used.has(q.k))
    .map((q) => ({ q, tot: qualityOf(all, q.k), withN: per.filter((o) => qualityOf(o, q.k).n > 0).length }))
    .filter((x) => x.tot.n >= 10 && x.withN >= 3)
    .sort((a, b) => b.tot.n - a.tot.n)
    .map(({ q, tot }) => evoChart({
      title: q.label,
      what: `% de ${q.what}, jogo a jogo`,
      unit: q.unit,
      avg: tot.rate,
      points: recent.map((g, i) => {
        const o = qualityOf(per[i], q.k);
        return { label: fmt(g.game_date), tip: `${fmt(g.game_date)} vs ${g.opponent || 'Adversário'}`, v: o.n ? o.rate : null, n: o.n, weak: o.n < EVO_MIN };
      }),
    }));
  if (!charts.length) return '';
  return `<h3 class="portal-scout-sub">A tua evolução</h3><div class="evo-grid">${charts.join('')}</div>`;
}

// De onde vieram os pontos da equipa. "Por mérito próprio" diz-se por
// palavras: é a parte que não foi oferecida pelo adversário.
function teamBlock(datas, { compact = false } = {}) {
  const ts = teamSummary(datas);
  if (!ts.our && !ts.their) return '';
  const merit = ts.our ? Math.round(((ts.our - ts.oppErr) / ts.our) * 100) : 0;
  const bar = stackBar([
    [ts.kill, 'de ataque', 'info'],
    [ts.ace, 'de serviço', 'ok'],
    [ts.blk, 'de bloco', 'gold'],
    [ts.oppErr, 'erros do adversário', 'neutral'],
  ], 'Pontos da equipa');
  return `
    <div class="sc-team${compact ? ' sc-team--compact' : ''}">
      <p class="sc-team__head"><strong>Equipa:</strong> ${ts.our} pontos ganhos · ${ts.ourErr} erros nossos</p>
      ${bar}
      ${compact ? '' : `<p class="sc-team__note">${merit}% dos pontos ganhos foram nossos; o resto foram erros do adversário.</p>`}
    </div>`;
}

// --- O detalhe dela: zonas e tipos de erro -----------------------------------
//
// Só existe nos jogos em que o treinador marcou o detalhe (zona do serviço,
// zona da receção, tipo de erro — `data.extras`). As regras do resto do
// separador valem aqui: as ações DELA, comparadas com ela própria, primeiro o
// que correu bem e por palavras antes do desenho. Nada sobre as colegas: o
// servidor já tira o dono às ações delas (`my_scout_games`).
const ZONE_MIN = 3; // ações numa zona para entrar numa frase

const ERR_FUND = { SERVICE: 'serviço', ATTACK: 'ataque', SETTING: 'passe', BLOCK: 'bloco', OTHER: 'outros' };
function myErrorTypes(datas, me) {
  const mine = errorTypeStats(datas).byPid[me.id];
  if (!mine) return '';
  const rows = Object.keys(ERR_TYPES).filter((t) => mine[t] && mine[t].total > mine[t].none).map((t) => {
    const o = mine[t];
    const parts = ERR_TYPES[t].filter(([k]) => o[k]).sort((a, b) => o[b[0]] - o[a[0]]).map(([k, l]) => `${o[k]} ${l.toLowerCase()}`);
    return `<li><strong>${esc(ERR_FUND[t] === 'outros' ? 'Outros' : ERR_FUND[t].charAt(0).toUpperCase() + ERR_FUND[t].slice(1))}</strong>: ${esc(parts.join(', '))}</li>`;
  });
  if (!rows.length) return '';
  return `<div class="sc-detail"><h4 class="sc-detail__title">Que erros foram</h4>
    <ul class="sc-detail__list">${rows.join('')}</ul>
    <p class="sc-detail__note">Saber se o serviço vai à rede ou sai fora ajuda a perceber o que treinar.</p></div>`;
}


// --- A equipa, sem nomes --------------------------------------------------------
// As séries de pontos perdidos e os erros da equipa por tipo. Nunca se diz
// DE QUEM foi o erro que começou uma série: lido sozinho no telemóvel, "a
// série começou num erro teu" é culpa, e não ajuda ninguém a melhorar.
const START_TEAM = {
  SERVICE: 'num erro de serviço', RECEPTION: 'num erro de receção', ATTACK: 'num erro de ataque',
  BLOCK: 'num erro de bloco', DEFENSE: 'num erro de defesa', SETTING: 'num erro de passe', OTHER: 'num erro nosso',
};
function teamStart(run) {
  const e = run.start;
  if (e.t !== 'OPPONENT') return START_TEAM[e.t] || 'num erro nosso';
  const prev = run.startActs[run.startActs.length - 2];
  return prev && prev.t === 'ATTACK' && prev.q === 'BLOCKED' ? 'num ataque bloqueado' : 'com um ponto delas';
}
function teamPatternsHTML(datas, { season = false } = {}) {
  const out = [];
  const rl = runsLost(datas);
  if (!season && rl.runs[0] && rl.runs[0].len >= 4) {
    const r = rl.runs[0];
    out.push(`<p><strong>A série mais difícil:</strong> ${r.len} pontos seguidos no ${r.set + 1}º set (de ${r.from.our}-${r.from.their} para ${r.to.our}-${r.to.their}). Começou ${esc(teamStart(r))}.</p>`);
  } else if (season && rl.runs.length >= 3) {
    const by = {};
    rl.runs.forEach((r) => { const k = teamStart(r); by[k] = (by[k] || 0) + 1; });
    const [top, n] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
    out.push(`<p><strong>Séries de pontos perdidos:</strong> ${rl.runs.length} vezes perdemos 3 ou mais pontos seguidos. ${n} começaram ${esc(top)}.</p>`);
  }
  const te = errorTypeStats(datas).team;
  const errs = Object.keys(ERR_TYPES).filter((t) => te[t] && te[t].total > te[t].none).map((t) => {
    const o = te[t];
    const [k, l] = ERR_TYPES[t].filter(([x]) => o[x]).sort((a, b) => o[b[0]] - o[a[0]])[0];
    return `no ${ERR_FUND[t] === 'outros' ? 'resto' : ERR_FUND[t]}, ${l.toLowerCase()} (${o[k]})`;
  });
  if (errs.length) out.push(`<p><strong>Os erros que mais se repetiram na equipa:</strong> ${esc(errs.join(' · '))}.</p>`);
  return out.length ? `<div class="sc-team-pat">${out.join('')}</div>` : '';
}

// --- Bolas ----------------------------------------------------------------------
//
// Uma bola por ação, e a forma diz tanto como a cor (quem não distingue o
// verde do vermelho distingue um círculo cheio de um com ×):
//   good — correu bem (a régua de `QUALITY`: receção # e +, ataque que deu
//          ponto, serviço que entrou…) · cont — a bola continuou em jogo ·
//   blk  — bloqueado (só no ataque) · err — erro.
// **Uma fila nunca passa de 10 bolas.** Com 10 ações ou mais a fila é "em cada
// 10", na proporção certa (maior resto, para somar sempre 10), e os números
// reais vão escritos por baixo. Com 50 receções eram quatro linhas de bolas. A
// proporção é FIEL: um erro em 42 pode arredondar para zero bolas vermelhas —
// o texto por baixo diz que houve um, e inventar uma bola era mentir na forma.
const BALL_ORDER = ['good', 'cont', 'blk', 'err'];
const BALL_WORD = { good: 'correu bem', cont: 'a bola continuou', blk: 'bloqueado', err: 'erro' };
function ballKinds(c, k) {
  const q = QUALITY.find((x) => x.k === k);
  const out = { good: 0, cont: 0, blk: 0, err: 0 };
  for (const key of Object.keys(c || {})) {
    const [t, ql] = key.split('.');
    if (t !== k) continue;
    const kind = q.good.includes(ql) ? 'good' : ql === 'ERROR' ? 'err' : ql === 'BLOCKED' ? 'blk' : 'cont';
    out[kind] += c[key];
  }
  return out;
}
function toBalls(kinds, { per10 = false } = {}) {
  const n = BALL_ORDER.reduce((a, k) => a + kinds[k], 0);
  if (!n) return { balls: [], scaled: false };
  if (n < 10 && !per10) return { balls: BALL_ORDER.flatMap((k) => Array(kinds[k]).fill(k)), scaled: false };
  const raw = BALL_ORDER.map((k) => (kinds[k] * 10) / n);
  const fl = raw.map(Math.floor);
  let left = 10 - fl.reduce((a, x) => a + x, 0);
  raw.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left > 0) { fl[i] += 1; left -= 1; } });
  return { balls: BALL_ORDER.flatMap((k, i) => Array(fl[i]).fill(k)), scaled: true };
}
function ballRow(kinds, label, { per10 = false, scaleLabel = true } = {}) {
  const { balls, scaled } = toBalls(kinds, { per10 });
  const aria = `${label}: ${BALL_ORDER.filter((k) => kinds[k]).map((k) => `${kinds[k]} ${BALL_WORD[k]}`).join(', ')}`;
  return `<div class="sb-row"><span class="sb-balls" role="img" aria-label="${esc(aria)}">${balls.map((k) => `<span class="sb sb--${k}"></span>`).join('')}</span>${scaled && scaleLabel ? '<span class="sb-scale">em cada 10</span>' : ''}</div>`;
}
function ballLegend(kinds = BALL_ORDER, words = BALL_WORD) {
  return `<p class="sb-legend">${kinds.map((k) => `<span><span class="sb sb--${k}" aria-hidden="true"></span>${words[k]}</span>`).join('')}</p>`;
}

// Um fundamento: nome, quantas ações, a fila de bolas e UMA linha ("27 de 42
// receções foram boas") com a comparação com ela própria ao lado.
function fundRow(c, k, { avg = null } = {}) {
  const q = QUALITY.find((x) => x.k === k);
  const qo = qualityOf(c, k);
  if (!qo.n) return null;
  const vs = avg != null ? compareToSelf(qo, avg) : null;
  const chip = vs ? `<span class="sb-chip sb-chip--${vs.tone}">${vs.arrow}${esc(vs.text.replace(/ \(.*\)$/, ''))}</span>` : '';
  return { k, n: qo.n, html: `<div class="sb-fund">
      <div class="sb-fund__head"><strong>${esc(q.label)}</strong><span>${qo.n} ${esc(q.unit)}</span></div>
      ${ballRow(ballKinds(c, k), q.label)}
      <p class="sb-fund__line">${esc(goodPhrase(k, qo))}${chip}</p>
    </div>` };
}

// --- A frase do jogo ----------------------------------------------------------
const BEST_TITLE = {
  RECEPTION: 'Boa receção!', ATTACK: 'Bom ataque!', SERVICE: 'Bom serviço!',
  DEFENSE: 'Boa defesa!', SETTING: 'Bom passe!', BLOCK: 'Bom bloco!',
};
// O erro mais repetido dela num fundamento, dito por palavras ("foram à rede").
const ERR_WORDS = {
  rede: 'à rede', fora: 'fora', pe: 'com falta de pé', antena: 'à antena', invasao: 'com invasão',
  dois: 'com dois toques', conducao: 'com condução', rotacao: 'com erro de rotação', outro: 'com outro erro',
};
function topErrorLine(data, me, k) {
  const mine = errorTypeStats([data]).byPid[me.id]?.[k];
  if (!mine || !ERR_TYPES[k]) return null;
  const [type] = ERR_TYPES[k].filter(([x]) => mine[x]).sort((a, b) => mine[b[0]] - mine[a[0]])[0] || [];
  if (!type || mine[type] < 2) return null;
  const n = qualityOf(counts([data])[me.id] || {}, k).n;
  const unit = QUALITY.find((q) => q.k === k)?.unit || 'ações';
  return `${mine[type]} dos teus ${n} ${unit} foram ${ERR_WORDS[type] || type}`;
}
// Começa SEMPRE pelo que correu bem. Com jogos para comparar: o fundamento que
// mais subiu em relação ao costume dela e, se houver, o que mais desceu (ou o
// erro que mais se repetiu). Sem com que comparar: onde ela mais jogou, sem
// juízo. Só fundamentos com ações que cheguem (`COMPARE_MIN`).
function gameHero(data, me, avgs) {
  const c = counts([data])[me.id] || {};
  const used = usedCols([data]);
  const rows = QUALITY.filter((q) => used.has(q.k))
    .map((q) => ({ k: q.k, qo: qualityOf(c, q.k) }))
    .filter((r) => r.qo.n >= COMPARE_MIN)
    .map((r) => ({ ...r, vs: avgs ? compareToSelf(r.qo, avgs[r.k]) : null }));
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const best = rows.filter((r) => r.vs && r.vs.dir === 'up').sort((a, b) => b.vs.d - a.vs.d)[0];
  const worst = rows.filter((r) => r.vs && r.vs.dir === 'down' && (!best || r.k !== best.k)).sort((a, b) => a.vs.d - b.vs.d)[0];
  let title;
  let sub;
  if (best) {
    title = BEST_TITLE[best.k];
    sub = `${cap(goodPhrase(best.k, best.qo))}. Mais do que costumas.`;
  } else {
    const main = rows.slice().sort((a, b) => b.qo.n - a.qo.n)[0];
    if (!main) return '';
    const w = FUND_WORDS[main.k];
    title = `Jogaste sobretudo ${w.in} ${w.name}`;
    sub = `${cap(goodPhrase(main.k, main.qo))}${main.vs ? `, ${main.vs.text.replace(/ \(.*\)$/, '')}` : ''}.`;
  }
  // "Para a próxima": o fundamento que desceu e, se houver, o erro que lá se
  // repetiu — que é o que diz O QUE treinar. Sem descida, um erro repetido.
  let next = '';
  if (worst) {
    const w = FUND_WORDS[worst.k];
    next = `${cap(w.the)} ${w.name}: ${topErrorLine(data, me, worst.k) || `${goodPhrase(worst.k, worst.qo)}, um pouco menos do que costumas`}.`;
  } else {
    const k = QUALITY.map((q) => q.k).find((x) => (!best || x !== best.k) && topErrorLine(data, me, x));
    if (k) next = `${cap(FUND_WORDS[k].the)} ${FUND_WORDS[k].name}: ${topErrorLine(data, me, k)}.`;
  }
  return `<section class="sb-hero">
      <span class="sb-hero__label">O teu jogo</span>
      <strong class="sb-hero__title">${esc(title)}</strong>
      <p class="sb-hero__sub">${esc(sub)}</p>
      ${next ? `<div class="sb-hero__next"><span class="sb-hero__label sb-hero__label--next">Para a próxima</span><p class="sb-hero__sub">${esc(next)}</p></div>` : ''}
    </section>`;
}

// --- O campo ------------------------------------------------------------------
//
// Desenhado como se vê do nosso lado: em cima o campo DELAS (a fila de trás
// delas mais longe), a rede, em baixo o nosso. Sem números de zona: as frases
// dizem o sítio por palavras ("o fundo do campo delas, à esquerda").
// **Até 6 ações numa zona desenham-se as bolas; acima disso, a fração** — uma
// líbero com 42 receções punha vinte bolas numa zona.
const THEIR_ROWS = [[1, 6, 5], [2, 3, 4]];
const OUR_ROWS = [[4, 3, 2], [5, 6, 1]];
const THEIR_WORDS = {
  1: 'o fundo do campo delas, à esquerda', 6: 'o fundo do campo delas, ao meio', 5: 'o fundo do campo delas, à direita',
  2: 'junto à rede delas, à esquerda', 3: 'junto à rede delas, ao meio', 4: 'junto à rede delas, à direita',
};
const OUR_WORDS = {
  4: 'à frente, à esquerda', 3: 'à frente, ao meio', 2: 'à frente, à direita',
  5: 'atrás, à esquerda', 6: 'atrás, ao meio', 1: 'atrás, à direita',
};
const DOTS_MAX = 6;
function zoneHTML(z, cell, hl) {
  if (!cell || !cell.n) return '<div class="sb-zone"></div>';
  const body = cell.n <= DOTS_MAX
    ? `<span class="sb-zone__dots">${cell.dots.map((k) => `<span class="sb sb--sm sb--${k}"></span>`).join('')}</span>`
    : `<span class="sb-zone__frac"><strong>${cell.good} de ${cell.n}</strong><span>${esc(cell.word)}</span></span>`;
  return `<div class="sb-zone${hl ? ' sb-zone--hl' : ''}">${body}</div>`;
}
function courtHTML({ their = {}, ours = {}, best = null, side }) {
  const half = (rows, cells, mine) => `<div class="sb-court__half">${rows.flat().map((z) => zoneHTML(z, cells[z], mine && z === best)).join('')}</div>`;
  return `<div class="sb-court" role="img" aria-label="${side === 'their' ? 'O campo delas, com os teus serviços' : 'O nosso campo, com as tuas receções'}">
      <div class="sb-court__label">Lado delas</div>
      ${half(THEIR_ROWS, their, side === 'their')}
      <div class="sb-court__net" aria-hidden="true"></div>
      ${half(OUR_ROWS, ours, side === 'ours')}
      <div class="sb-court__label">O nosso lado</div>
    </div>`;
}
// O serviço dela: onde caiu e se ganhámos esse ponto (verde) ou não (vazio).
function serveCourt(datas, me) {
  const zs = serveZoneStats(datas).byPid[me.id];
  if (!zs || !ZONES.some((z) => zs[z].n)) return null;
  const cells = {};
  for (const z of ZONES) {
    const o = zs[z];
    cells[z] = { n: o.n, good: o.won, word: 'ganhámos', dots: [...Array(o.won).fill('good'), ...Array(o.n - o.won).fill('cont')] };
  }
  const best = ZONES.filter((z) => zs[z].n >= ZONE_MIN).sort((a, b) => zs[b].won / zs[b].n - zs[a].won / zs[a].n || zs[b].n - zs[a].n)[0] || null;
  const title = best ? `Quando serviste para ${THEIR_WORDS[best]}, ganhámos ${zs[best].won} de ${zs[best].n} pontos.` : 'Para onde serviste, e se ganhámos esse ponto.';
  return { title, html: courtHTML({ their: cells, best, side: 'their' }), legend: ballLegend(['good', 'cont'], { good: 'ganhámos o ponto', cont: 'perdemos o ponto' }) };
}
// A receção dela: onde estava e como correu. A melhor zona e, havendo uma
// diferença clara (15 pontos), a que custou mais — comparada com ELA.
function receptionCourt(datas, me) {
  const zs = receptionZoneStats(datas).byPid[me.id];
  if (!zs || !ZONES.some((z) => zs[z].n)) return null;
  const cells = {};
  for (const z of ZONES) {
    const o = zs[z];
    cells[z] = { n: o.n, good: o.good, word: 'boas', dots: [...Array(o.good).fill('good'), ...Array(o.n - o.good - o.err).fill('cont'), ...Array(o.err).fill('err')] };
  }
  const ok = ZONES.filter((z) => zs[z].n >= ZONE_MIN);
  const rate = (z) => zs[z].good / zs[z].n;
  const best = ok.slice().sort((a, b) => rate(b) - rate(a))[0] || null;
  const worst = ok.slice().sort((a, b) => rate(a) - rate(b))[0];
  let title = 'Onde recebeste, e como correu.';
  let next = '';
  if (best) {
    title = `Onde recebeste melhor: ${OUR_WORDS[best]}. ${zs[best].good} de ${zs[best].n} receções boas.`;
    if (worst && worst !== best && rate(best) - rate(worst) >= 0.15) next = `Custou mais ${OUR_WORDS[worst]}: ${zs[worst].good} de ${zs[worst].n}.`;
  }
  return { title, next, html: courtHTML({ ours: cells, best, side: 'ours' }), legend: ballLegend(['good', 'cont', 'err'], { good: 'receção boa', cont: 'difícil', err: 'erro' }) };
}
// Os dois campos vivem no mesmo cartão, com um seletor quando há os dois. A
// escolha guarda-se por cartão (`courtView`) e troca-se só esse cartão — sem
// re-desenhar o portal, que fecharia o jogo aberto.
const courtView = new Map(); // chave do cartão -> 'serve' | 'rec'
const courtData = new Map(); // chave do cartão -> { datas, me }
function courtCardHTML(key, datas, me) {
  const sv = serveCourt(datas, me);
  const rc = receptionCourt(datas, me);
  if (!sv && !rc) return '';
  courtData.set(key, { datas, me });
  const view = (courtView.get(key) === 'rec' && rc) || !sv ? 'rec' : 'serve';
  const cur = view === 'rec' ? rc : sv;
  const tog = sv && rc ? `<div class="sb-tog" role="group" aria-label="O que mostrar no campo">
      <button type="button" class="sb-tog__btn" data-court="${esc(key)}" data-view="serve" aria-pressed="${view === 'serve'}">Serviço</button>
      <button type="button" class="sb-tog__btn" data-court="${esc(key)}" data-view="rec" aria-pressed="${view === 'rec'}">Receção</button>
    </div>` : '';
  return `<section class="sb-card" data-court-card="${esc(key)}">
      <h3 class="sb-card__title">No campo</h3>
      ${tog}
      <p class="sb-card__lead">${esc(cur.title)}</p>
      ${cur.next ? `<p class="sb-card__next">${esc(cur.next)}</p>` : ''}
      ${cur.html}
      ${cur.legend}
    </section>`;
}
function wireCourts(root) {
  root.querySelectorAll('[data-court]').forEach((b) => b.addEventListener('click', () => {
    const key = b.dataset.court;
    const card = b.closest('[data-court-card]');
    const d = courtData.get(key);
    if (!card || !d) return;
    courtView.set(key, b.dataset.view);
    const tpl = document.createElement('template');
    tpl.innerHTML = courtCardHTML(key, d.datas, d.me).trim();
    const fresh = tpl.content.firstElementChild;
    card.replaceWith(fresh);
    wireCourts(fresh);
    fresh.querySelector(`[data-view="${b.dataset.view}"]`)?.focus();
  }));
}

// --- Um jogo, aberto ------------------------------------------------------------
function gameBody(g, me, avgs) {
  const data = g.data;
  const c = counts([data])[me.id] || {};
  const used = usedCols([data]);
  const order = QUALITY.map((q) => q.k).filter((k) => used.has(k)).sort((a, b) => qualityOf(c, b).n - qualityOf(c, a).n);
  const rows = order.map((k) => fundRow(c, k, { avg: avgs?.[k] ?? null })).filter(Boolean);
  // Com poucas ações (menos de 5) o fundamento vai para "Ver mais": quatro
  // defesas não dizem nada do jogo dela. O primeiro fica sempre à vista.
  const shown = rows.filter((r, i) => i === 0 || r.n >= FUND_SHOW_MIN);
  const few = rows.filter((r) => !shown.includes(r));
  const kindsUsed = BALL_ORDER.filter((kind) => order.some((k) => ballKinds(c, k)[kind]));
  const sets = partials(data);
  const team = teamPatternsHTML([data]);
  const errs = myErrorTypes([data], me);
  return `
    ${gameHero(data, me, avgs)}
    ${rows.length ? `<section class="sb-card">
      <h3 class="sb-card__title">O que fizeste</h3>
      ${ballLegend(kindsUsed)}
      ${shown.map((r) => r.html).join('')}
    </section>` : ''}
    ${courtCardHTML(`g:${g.id}`, [data], me)}
    <section class="sb-card">
      <h3 class="sb-card__title">A equipa</h3>
      <div class="sb-sets">${sets.map((x) => `<span class="sb-set sb-set--${x.our > x.their ? 'won' : 'lost'}">${x.our}–${x.their}</span>`).join('')}</div>
      ${team || ''}
    </section>
    <details class="sb-more">
      <summary>Ver mais${few.length ? `: ${esc(few.map((r) => QUALITY.find((q) => q.k === r.k).label).join(', '))}` : ''}</summary>
      <div class="sb-more__body">
        ${few.map((r) => r.html).join('')}
        ${errs}
        ${teamBlock([data])}
      </div>
    </details>`;
}

// --- A época (B) ----------------------------------------------------------------
//
// "Antes e agora": por fundamento, 10 bolas dos primeiros jogos e 10 dos
// últimos — sempre "em cada 10", para as duas filas se compararem à vista.
// A frase do topo é a maior melhoria (1 bola em cada 10, com 10 ações de cada
// lado); sem melhoria, o fundamento em que ela mais joga, como facto.
// Quantas bolas verdes em 10 — o número que as filas "Antes/Agora" mostram,
// para a frase e o desenho dizerem o mesmo.
const goodIn10 = (c, k) => toBalls(ballKinds(c, k), { per10: true }).balls.filter((x) => x === 'good').length;
const PAST_VERB = {
  RECEPTION: 'eram boas', DEFENSE: 'eram boas', SETTING: 'eram bons',
  ATTACK: 'davam ponto', SERVICE: 'entravam', BLOCK: 'davam ponto ou amorteciam',
};
function seasonSplit(games) {
  // `games` vem do mais recente para o mais antigo.
  const k = Math.min(3, Math.floor(games.length / 2));
  return { now: games.slice(0, k).map((g) => g.data), before: games.slice(-k).map((g) => g.data), k };
}
function seasonHero(games, me, used) {
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const all = counts(games.map((g) => g.data))[me.id] || {};
  if (games.length >= 4) {
    const { now, before, k } = seasonSplit(games);
    const cn = counts(now)[me.id] || {};
    const cb = counts(before)[me.id] || {};
    const gains = QUALITY.filter((q) => used.has(q.k)).map((q) => {
      const a = qualityOf(cb, q.k);
      const b = qualityOf(cn, q.k);
      return { q, a, b, d: a.n >= 10 && b.n >= 10 ? b.rate - a.rate : null };
    }).filter((x) => x.d != null && x.d >= 0.1).sort((x, y) => y.d - x.d);
    if (gains[0]) {
      const { q, a, b } = gains[0];
      const w = FUND_WORDS[q.k];
      return `<section class="sb-hero">
        <span class="sb-hero__label">A tua época</span>
        <strong class="sb-hero__title">${esc(cap(w.the))} ${esc(w.name)} está a melhorar.</strong>
        <p class="sb-hero__sub">Nos primeiros jogos, ${goodIn10(cb, q.k)} em cada 10 ${esc(q.unit)} ${esc(PAST_VERB[q.k])}. Nos últimos ${k}, são ${goodIn10(cn, q.k)} em cada 10.</p>
      </section>`;
    }
  }
  const main = QUALITY.filter((q) => used.has(q.k)).map((q) => ({ q, o: qualityOf(all, q.k) })).filter((x) => x.o.n).sort((x, y) => y.o.n - x.o.n)[0];
  if (!main) return '';
  const w = FUND_WORDS[main.q.k];
  return `<section class="sb-hero">
      <span class="sb-hero__label">A tua época</span>
      <strong class="sb-hero__title">Jogas sobretudo ${esc(w.in)} ${esc(w.name)}</strong>
      <p class="sb-hero__sub">${esc(cap(goodPhrase(main.q.k, main.o)))}.</p>
    </section>`;
}
function seasonBallsHTML(games, me, used) {
  if (games.length < 4) {
    const c = counts(games.map((g) => g.data))[me.id] || {};
    const rows = QUALITY.map((q) => q.k).filter((k) => used.has(k)).sort((a, b) => qualityOf(c, b).n - qualityOf(c, a).n)
      .map((k) => fundRow(c, k)).filter((r) => r && r.n >= FUND_SHOW_MIN);
    return rows.length ? `<section class="sb-card"><h3 class="sb-card__title">O que fizeste</h3>${ballLegend()}${rows.map((r) => r.html).join('')}</section>` : '';
  }
  const { now, before } = seasonSplit(games);
  const cn = counts(now)[me.id] || {};
  const cb = counts(before)[me.id] || {};
  const rows = QUALITY.filter((q) => used.has(q.k)).map((q) => {
    const a = qualityOf(cb, q.k);
    const b = qualityOf(cn, q.k);
    if (a.n < FUND_SHOW_MIN || b.n < FUND_SHOW_MIN) return null;
    const ka = ballKinds(cb, q.k);
    const kb = ballKinds(cn, q.k);
    const ga = goodIn10(cb, q.k);
    const gb = goodIn10(cn, q.k);
    const tag = gb > ga ? ['up', '↑ a melhorar'] : gb < ga ? ['down', '↓ a descer'] : ['eq', 'igual'];
    const unit = q.unit;
    const line = gb !== ga ? `De ${ga} para ${gb} em cada 10 ${unit}` : `${gb} em cada 10 ${unit}`;
    return { n: a.n + b.n, html: `<div class="sb-fund">
        <div class="sb-fund__head"><strong>${esc(q.label)}</strong></div>
        <div class="sb-ba"><span class="sb-ba__l">Antes</span>${ballRow(ka, `${q.label}, antes`, { per10: true, scaleLabel: false })}
          <span class="sb-ba__l sb-ba__l--now">Agora</span>${ballRow(kb, `${q.label}, agora`, { per10: true, scaleLabel: false })}</div>
        <p class="sb-fund__line">${esc(line)} <span class="sb-chip sb-chip--${tag[0] === 'up' ? 'good' : tag[0] === 'down' ? 'bad' : 'eq'}">${tag[1]}</span></p>
      </div>` };
  }).filter(Boolean).sort((x, y) => y.n - x.n);
  if (!rows.length) return '';
  return `<section class="sb-card">
      <h3 class="sb-card__title">Antes e agora</h3>
      <p class="sb-card__lead sb-card__lead--sm">Cada fila são 10 bolas tuas: como eram nos primeiros jogos e como são nos últimos.</p>
      ${rows.map((r) => r.html).join('')}
      ${ballLegend()}
    </section>`;
}

// Quantos jogos se veem antes do "Mostrar os restantes": num campeonato são
// trinta, e a pergunta de quem abre isto é quase sempre o último jogo.
const SCOUT_VISIBLE = 5;

function scoutGameRow(g, me, { open = false, others = [] } = {}) {
  const fmt = (d) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');
  const r = setsWon(g.data);
  const res = r.o > r.t ? 'V' : r.o < r.t ? 'D' : 'E';
  const p = pointsPlayed(g.data)[me.id] || 0;
  const m = playerRows([g.data])[0];
  const main = mainQuality([g.data], me);
  // Fechada, a linha diz o que ela fez nesse jogo — sem isso, trinta linhas
  // de "data · adversário · resultado" eram o calendário outra vez. Diz a
  // QUALIDADE do que mais fez ("Receção 70%"), e não os pontos: a líbero
  // nunca tinha mais do que "0 pts".
  const mineShort = main && main.n >= EVO_MIN ? `${main.q.label} ${Math.round(main.rate * 100)}%` : p ? 'jogaste' : 'não jogaste';
  // A média dela nos OUTROS jogos: comparar um jogo com uma média que já o
  // inclui puxava a média para ele. Só com dois jogos para comparar.
  const avgs = others.length >= 2 ? myAverages(others, me) : null;
  return `<li><details class="portal-scout-game"${open ? ' open' : ''}>
    <summary>
      <span class="portal-scout-game__title">vs ${esc(g.opponent || 'Adversário')}</span>
      <span class="portal-scout-game__meta">${esc(fmt(g.game_date))} · ${esc(mineShort)}</span>
      <span class="badge badge--${res === 'V' ? 'ok' : res === 'D' ? 'danger' : 'muted'}">${r.o}–${r.t}</span>
      <span class="portal-scout-game__chev" aria-hidden="true">▾</span>
    </summary>
    <div class="portal-scout-game__body">
      <p class="sb-meta">${p ? `${p} pontos em campo` : 'Não entraste em campo neste jogo.'}${g.competition ? ` · ${esc(g.competition)}` : ''}</p>
      ${p || m ? gameBody(g, me, avgs) : ''}
    </div>
  </details></li>`;
}

// O separador só aparece a quem tem jogos JÁ JOGADOS no calendário da sua
// equipa — lido dos eventos, que já estão em memória. Saber se há scout
// obrigava a descarregar as ações da época inteira só para decidir se se
// desenha um botão; assim descarrega-se ao abrir o separador.
function hasPlayedGames(me) {
  if (state.myScoutGames?.length) return true;
  const now = new Date();
  return state.events.some((e) => e.type === 'jogo' && e.team_id === me.team_id && eventDateTime(e) < now);
}

function jogosHTML(me) {
  if (state.myScoutGames === null) {
    loadMyScoutGames();
    return '<section class="card portal-section"><p class="portal-section__note">A carregar os jogos…</p></section>';
  }
  const games = state.myScoutGames;
  if (!games.length) {
    return `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">Os meus jogos</h2>
      <p class="portal-section__note">Ainda não há jogos com estatística. Aparecem aqui quando o treinador fizer o scout de um jogo da tua equipa.</p>
    </section>`;
  }
  const note = '<p class="portal-section__note">As tuas ações e as da equipa. As das colegas não aparecem aqui.</p>';

  // Com um jogo só, o resumo da época ERA esse jogo: desenhá-lo duas vezes
  // dizia o mesmo em dois blocos seguidos. Mostra-se o jogo, já aberto.
  if (games.length === 1) {
    return `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">Os meus jogos</h2>
      ${note}
      ${helpHTML(usedCols([games[0].data]))}
      <ul class="portal-scout-list portal-scout-list--solo">${scoutGameRow(games[0], me, { open: true })}</ul>
    </section>`;
  }

  const datas = games.map((g) => g.data);
  const used = usedCols(datas);
  const played = datas.reduce((a, d) => a + (pointsPlayed(d)[me.id] || 0), 0);
  const w = games.filter((g) => { const r = setsWon(g.data); return r.o > r.t; }).length;
  const teamSeason = teamPatternsHTML(datas, { season: true });
  const shown = scoutShowAll ? games : games.slice(0, SCOUT_VISIBLE);
  const rest = games.length - shown.length;

  // Os JOGOS vêm primeiro, com o último já aberto: quem abre isto no sábado à
  // noite quer saber como lhe correu aquele jogo, e com o resumo da época por
  // cima (números, gráficos, barras) o jogo de hoje ficava três ecrãs abaixo.
  // A época é a leitura de fundo, e fica a seguir.
  return `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">Os meus jogos</h2>
      ${note}
      ${helpHTML(used, { charts: games.length >= 3 })}
      <p class="portal-scout-hint">Toca num jogo para o abrir e veres o que fizeste.</p>
      <ul class="portal-scout-list portal-scout-list--solo">
        ${shown.map((g, i) => scoutGameRow(g, me, { open: i === 0, others: datas.filter((d) => d !== g.data) })).join('')}
      </ul>
      ${games.length > SCOUT_VISIBLE
        ? `<button class="btn btn--link portal-section__more" data-scout-toggle type="button">
             ${scoutShowAll ? 'Mostrar só os últimos' : `Mostrar os restantes ${rest}`}
           </button>`
        : ''}
    </section>

    <section class="card portal-section">
      <h2 class="section-title portal-section__title">A minha época</h2>
      <p class="sb-meta">${games.length} jogos · ${w} vitória${w === 1 ? '' : 's'} · ${played} pontos em campo</p>
      <div class="sb-stack">
        ${seasonHero(games, me, used)}
        ${seasonBallsHTML(games, me, used)}
        ${courtCardHTML('season', datas, me)}
        ${teamSeason ? `<section class="sb-card"><h3 class="sb-card__title">A equipa</h3>${teamSeason}</section>` : ''}
        <details class="sb-more">
          <summary>Ver mais: a tua evolução jogo a jogo, todos os números</summary>
          <div class="sb-more__body">
            ${games.length >= 3 ? qualityEvo(games, me, used) : ''}
            ${myErrorTypes(datas, me)}
            ${teamBlock(datas)}
          </div>
        </details>
      </div>
    </section>`;
}

// --- Separador "A minha época" -------------------------------------------

// As QUOTAS saíram do portal (decisão do clube): são assunto entre o clube e
// a família, tratado no Financeiro, e não algo que a atleta acompanhe aqui.
function epocaHTML(me) {
  const att = playerAttendanceStats(me.id);
  const form = playerRecentForm(me.id, 5);
  const recent = playerRecentTrainings(me.id, 8);
  const squads = playerUpcomingSquads(me.id, 5);
  const pedidos = myRequests(me.id);

  // Só os estados que aconteceram mesmo. A grelha com os quatro estados é
  // contabilidade de treinador: a um atleta sem faltas, três chips a zero só
  // enchem a linha e escondem o número que interessa.
  const chips = ATTENDANCE_STATUSES.filter((s) => att.counts[s.key] > 0);

  return `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">As minhas presenças</h2>
      ${att.total
        ? `<div class="portal-att">
             <div class="portal-att__pct">
               <strong class="stat-pct ${pctClass(att.rate)}">${att.rate}%</strong>
               <span class="muted">comparência em ${att.total} treino${att.total === 1 ? '' : 's'}</span>
             </div>
             ${form
               ? `<span class="portal-att__form">
                    Últimos ${form.total}: <strong>${form.compareceu} de ${form.total}</strong>
                  </span>`
               : ''}
             <div class="portal-att__chips">
               ${chips.map((s) => `<span class="badge badge--${s.badge}">${esc(s.label)}: ${att.counts[s.key]}</span>`).join('')}
             </div>
           </div>
           ${recent.length
             ? `<ul class="portal-att-list">${recent.map(trainingRow).join('')}</ul>`
             : ''}`
        : '<p class="portal-section__note">Ainda sem registos de presença.</p>'}
    </section>

    ${squads.length ? `
    <section class="card portal-section">
      <h2 class="section-title portal-section__title">As minhas convocatórias</h2>
      <ul class="portal-squads">${squads.map(squadRow).join('')}</ul>
    </section>
    ` : ''}

    ${materialHTML(pedidos, me)}
  `;
}

// --- O meu material (o histórico) ----------------------------------------
//
// O que JÁ está resolvido: entregue, recusado, ou pago e à espera. A
// encomenda em curso vive lá em cima, fora dos separadores — aqui fica o
// registo, que é consulta e não ação, e por isso pode viver em «A época».
//
// Só aparece quando o clube abriu ALGUM artigo aos pedidos — ou quando ela
// já tem pedidos feitos (senão o histórico desaparecia no dia em que o
// coordenador fechasse a lista).
function materialHTML(pedidos, me) {
  const articles = requestableArticles();
  if (!articles.length && !pedidos.length) return '';

  // O que está na encomenda não se repete aqui: desenhar as mesmas linhas
  // duas vezes era dizer-lhe que tinha pedido o dobro.
  const emCurso = new Set(playerOrder(me.id).list.map((r) => r.id));
  const historico = pedidos.filter((r) => !emCurso.has(r.id));
  if (!historico.length && emCurso.size) return '';

  return `
    <section class="card portal-section">
      <div class="portal-section__head">
        <h2 class="section-title portal-section__title">O meu material</h2>
      </div>
      ${historico.length
        ? `<ul class="portal-req-list">${historico.map(requestRow).join('')}</ul>`
        : `<p class="portal-section__note">
             Ainda não pediste nada. Se precisares de equipamento — porque se
             estragou, se perdeu ou já não te serve — usa o
             <strong>Pedir equipamento</strong> lá em cima e o clube
             responde-te.
           </p>`}
    </section>
  `;
}

// --- A minha encomenda ----------------------------------------------------
//
// Tudo o que pediu e ainda não tem, com o total. Vive ACIMA dos separadores,
// logo a seguir ao próximo treino, e não dentro de "A época": estava a três
// gestos de distância (trocar de separador, passar as presenças, passar as
// quotas) e sem total nenhum — que é precisamente a pergunta que a família
// faz, "quanto é que tenho de levar ao clube?". Somar quatro linhas de cabeça
// num telemóvel é a maneira de o valor acabar numa mensagem dias depois.
//
// É UMA lista e não duas: a pergunta é "o que pedi e em que está", e a
// resposta é o crachá de cada linha. O que já foi entregue, recusado ou pago
// sai daqui para o histórico, em "A época".
function orderHTML(order) {
  if (!order.list.length) return '';

  // O que já está no clube à espera dela é a única coisa nesta lista que lhe
  // pede uma AÇÃO — ir buscar. Por isso sai da lista para uma linha própria,
  // no topo: no meio de quatro crachás parecidos, "Pronto a levantar" lê-se
  // como mais um estado e o material fica no gabinete.
  const prontos = order.prontos.map(articleName);

  return `
    <section class="card portal-order">
      ${prontos.length ? `
        <p class="portal-order__pickup">
          <strong>Podes levantar:</strong> ${esc(prontos.join(' · '))}
          <span class="portal-order__pickup-note">Está à tua espera no clube.</span>
        </p>` : ''}
      <div class="portal-order__head">
        <span class="portal-order__label">A minha encomenda</span>
        <strong class="portal-order__total">
          ${order.total ? esc(euros(order.total)) : '—'}
        </strong>
      </div>
      <ul class="portal-order__list">
        ${order.list.map(orderLine).join('')}
      </ul>
      <p class="portal-order__note muted">
        ${order.unidades} artigo${order.unidades === 1 ? '' : 's'}
        ${order.porDecidir
          ? ` · <strong>${order.porDecidir}</strong> ainda por decidir pelo clube`
          : ''}
        ${order.semPreco
          ? ` · <strong>${order.semPreco} sem preço</strong> (não entra${order.semPreco === 1 ? '' : 'm'} no total)`
          : ''}
      </p>
    </section>
  `;
}

function articleName(r) {
  return r.article === 'outro'
    ? (r.article_other || '').trim() || 'Outro artigo'
    : articleLabel(r.article);
}

function orderLine(r) {
  const custo = requestCost(r);
  return `
    <li class="portal-order__row">
      <span class="portal-order__art">
        ${esc(articleName(r))}
        ${r.size ? `<span class="badge badge--info">${esc(r.size)}</span>` : ''}
        ${r.quantity > 1 ? `<span class="portal-order__qty">×${r.quantity}</span>` : ''}
      </span>
      <span class="badge badge--${REQUEST_STATUS_BADGE[r.status] || 'muted'}">
        ${esc(REQUEST_STATUS_LABEL[r.status] || r.status)}
      </span>
      <span class="portal-order__price">
        ${custo != null ? esc(euros(custo)) : '<span class="muted">sem preço</span>'}
      </span>
      ${r.status === 'pendente'
        ? `<button class="btn btn--ghost btn--xs portal-order__cancel" data-cancel-req="${r.id}" type="button">Cancelar</button>`
        : ''}
    </li>
  `;
}

// Os pedidos desta atleta, do mais recente para trás. O RLS já só lhe entrega
// os seus; o filtro por `player_id` é a mesma regra do resto do portal — o
// atleta é encontrado pela ficha e por mais nada.
function myRequests(playerId) {
  return state.equipmentRequests
    .filter((r) => r.player_id === playerId)
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

function requestRow(r) {
  const pendente = r.status === 'pendente';
  const nota = (r.decision_note || '').trim();
  return `
    <li class="portal-req">
      <div class="portal-req__main">
        <span class="portal-req__art">
          ${esc(r.article === 'outro'
            ? (r.article_other || '').trim() || 'Outro artigo'
            : articleLabel(r.article))}
        </span>
        <span class="badge badge--${REQUEST_STATUS_BADGE[r.status] || 'muted'}">
          ${esc(REQUEST_STATUS_LABEL[r.status] || r.status)}
        </span>
      </div>
      <p class="portal-req__meta muted">
        ${r.size ? `Tamanho ${esc(r.size)}` : 'Sem tamanho'}
        ${r.quantity > 1 ? ` · ×${r.quantity}` : ''}
        ${(() => { const c = requestCost(r); return c != null ? ` · ${esc(euros(c))}` : ''; })()}
        ${r.created_at
          ? ` · ${new Date(r.created_at).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}`
          : ''}
      </p>
      ${(r.notes || '').trim()
        ? `<p class="portal-req__meta muted">${esc(r.notes.trim())}</p>`
        : ''}
      ${nota ? `<p class="portal-req__note">${esc(nota)}</p>` : ''}
      ${pendente
        ? `<button class="btn btn--ghost btn--sm" data-cancel-req="${r.id}" type="button">Cancelar pedido</button>`
        : ''}
    </li>
  `;
}

// --- Separador "Cartão" --------------------------------------------------

function cartaoHTML() {
  return `
    <section class="card portal-section portal-qr">
      <h2 class="section-title portal-section__title">O meu cartão</h2>
      <p class="portal-section__note">
        Mostra este código no quiosque à entrada do treino para ficares com a
        presença registada.
      </p>
      <div class="portal-qr__code" id="portal-qr" aria-label="O meu código QR"></div>
      <p class="portal-section__note portal-qr__note">
        Fica guardado neste dispositivo — se o pavilhão não tiver rede, o
        cartão aparece na mesma.
      </p>
    </section>
  `;
}

// --- Ligações -------------------------------------------------------------

// --- Pedir equipamento ---------------------------------------------------
//
// É o MESMO pedido do ecrã de Equipamentos (mesma tabela, mesmos estados,
// mesma decisão) — o formulário é que perde dois campos, porque a equipa e a
// atleta já se sabem: é ela.
//
// **Pede-se mais do que um artigo de uma vez, e continua a ser um pedido por
// artigo.** A regra "um pedido é UM artigo" existe para as decisões serem
// independentes (aprovar as meias e recusar o blusão), e essa mantém-se: o
// formulário cria uma LINHA POR ARTIGO. O que se poupa é o preenchimento —
// quem chega em setembro sem nada precisa de quatro coisas, e quatro voltas
// ao mesmo formulário no telemóvel é a maneira de a quarta nunca ser pedida.
//
// A seleção é o próprio TAMANHO, e não uma caixa a marcar antes: escolher um
// tamanho já diz que precisa daquilo, e deixar em branco diz que não. Uma
// caixa por artigo mais um tamanho por artigo eram dois gestos para dizer uma
// coisa só. É também a forma do modal de tamanhos das Encomendas — o mesmo
// gesto, o mesmo desenho.
//
// O tamanho não vem da ficha dela. No ecrã do treinador vem, porque ele não
// tem de decorar que a Ana veste M; aqui quem preenche é quem veste a roupa,
// e uma sugestão só serviria para ela aceitar sem pensar o número que já não
// lhe serve — que é metade da razão por que os pedidos existem.
function openRequestModal(me) {
  const articles = requestableArticles();
  if (!articles.length) return;

  openModal({
    title: 'Pedir equipamento',
    submitLabel: 'Pedir',
    // Como se preenche isto é uma frase sobre o formulário INTEIRO, por isso
    // vai no `intro` e não no `hint` do primeiro artigo — pendurada aí, lia-se
    // como se fosse uma instrução sobre a camisola de treino.
    // A frase só fala da quantidade se ALGUM artigo a permitir: num clube em
    // que tudo é uma unidade, explicar uma caixa que não existe é pior do que
    // não explicar nada.
    intro: [
      'Escolhe o tamanho do que precisas e deixa em branco o resto.',
      articles.some((x) => x.multiple)
        ? 'Onde houver caixa ao lado, é a quantidade.'
        : '',
      articles.some((x) => x.price != null)
        ? 'Os valores são o que cada peça custa ao clube.'
        : '',
    ].filter(Boolean).join(' '),
    fields: [
      ...articles.map((a) => ({
        name: `art__${a.key}`,
        // O preço vai na ETIQUETA e não numa ajuda por baixo: tem de ser
        // lido ao mesmo tempo que o nome do artigo, no momento de escolher,
        // e não depois de escolher. Um artigo sem preço definido não mostra
        // número nenhum — melhor calar do que dizer "0 €" e parecer grátis.
        label: a.price != null ? `${a.label} — ${euros(a.price)}` : a.label,
        // "Casaco Fato de Treino", "Blusão" e "Camisola de Treino" são três
        // etiquetas que só distinguem o material a quem já o conhece — e
        // quem escolhe aqui entrou no clube em setembro. A foto responde à
        // pergunta que o nome não responde.
        ...(a.photo ? { image: articlePhotoUrl(a.photo) } : {}),
        // Quantas — só nos artigos em que o clube ligou a quantidade
        // (`multiple` nas Definições). Três camisolas do mesmo tamanho é UM
        // pedido de três, não três voltas ao formulário; três blusões é
        // engano, e é por isso que a decisão é do clube e artigo a artigo.
        // Sem ela não se desenha caixa nenhuma.
        ...(a.multiple ? { qty: { name: `qtd__${a.key}`, max: 20, default: 1 } } : {}),
        ...(a.sizes.length
          ? {
              type: 'select',
              placeholder: '— Não preciso —',
              options: a.sizes.map((x) => ({ key: x, label: x })),
            }
          : {
              type: 'text',
              placeholder: 'Tamanho — vazio se não precisas',
            }),
      })),
      // **Não se pergunta PORQUÊ.** O ecrã do treinador tem a lista de motivos
      // (danificado, tamanho, perdido…) porque é ELE que lança o pedido de
      // outra pessoa e o clube precisa de saber de onde veio. Aqui quem pede é
      // quem veste a roupa: um seletor obrigatório entre cinco rótulos, antes
      // de deixar pedir, é uma pergunta a que quase toda a gente responde ao
      // calhas — e um motivo escolhido ao calhas ajuda a decidir menos do que
      // nenhum. Fica um campo de NOTAS, opcional, onde cabe a verdade toda
      // ("rasguei as meias no sábado") em vez da gaveta mais parecida.
      {
        name: 'notes', label: 'Notas', type: 'textarea', full: true,
        placeholder: 'Opcional — se quiseres dizer alguma coisa ao clube…',
        hint: 'Vale para tudo o que pedires agora.',
      },
    ],
    onSubmit: async (v) => {
      const pedidos = articles
        .map((a) => ({
          article: a.key,
          size: (v[`art__${a.key}`] || '').trim(),
          // Sem caixa, é sempre uma. Com caixa, limitado a 20: o `max` do
          // input é uma sugestão do browser, e um "200" escrito à mão não
          // pode passar daqui para uma decisão de compra.
          quantity: a.multiple
            ? Math.min(Math.max(parseInt(v[`qtd__${a.key}`], 10) || 1, 1), 20)
            : 1,
        }))
        .filter((x) => x.size)
        .map((x) => ({
          player_id: me.id,
          article: x.article,
          size: x.size,
          quantity: x.quantity,
          // A coluna `reason` continua a existir (é `not null` e o ecrã do
          // treinador usa-a), mas aqui ninguém a escolheu: `outro` diz
          // exatamente isso — o motivo, se houver, está nas notas. Inventar
          // "Atleta sem o artigo" seria pôr na boca da atleta uma razão que
          // ela não deu, e é sobre ela que o clube vai decidir.
          reason: 'outro',
          notes: v.notes?.trim() || null,
        }));

      // Sem nenhum tamanho escolhido não há pedido nenhum. A validação nativa
      // não apanha isto (os campos são todos opcionais de propósito), por
      // isso o erro aparece no formulário em vez de o submit "não fazer nada".
      if (!pedidos.length) {
        throw new Error('Escolhe o tamanho de pelo menos um artigo — é isso que diz o que precisas.');
      }

      try {
        await createEquipmentRequests(pedidos);
      } catch (err) {
        throw new Error(dbErrorMessage(err));
      }
    },
  });
}

// Cancelar só enquanto ninguém decidiu — é o que o RLS permite, e a lista só
// desenha o botão nos pendentes. Repetido aqui porque o estado pode ter
// mudado entre o desenho e o clique.
async function cancelMyRequest(id) {
  const req = state.equipmentRequests.find((r) => r.id === id);
  if (!req || req.status !== 'pendente') {
    toastError('Este pedido já foi decidido pelo clube.');
    return;
  }
  const ok = await confirmDialog('Cancelar este pedido de equipamento?', {
    confirmLabel: 'Cancelar pedido',
  });
  if (!ok) return;
  try {
    await deleteRow('equipment_requests', 'equipmentRequests', id);
  } catch (err) {
    toastError(dbErrorMessage(err));
  }
}

function wire(container, me, team) {
  wireEvo(container);
  container.querySelectorAll('[data-portal-tab]').forEach((b) =>
    b.addEventListener('click', () => {
      portalTab = b.dataset.portalTab;
      renderPortal(container);
    })
  );

  container.querySelector('#portal-pedir')?.addEventListener('click', () => openRequestModal(me));

  container.querySelectorAll('[data-dados]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.dados === 'foto') fillFoto(me, container);
      else if (btn.dataset.dados === 'nascimento') fillNascimento(me);
      else fillCC(me, container);
    })
  );

  container.querySelectorAll('[data-cancel-req]').forEach((btn) =>
    btn.addEventListener('click', () => cancelMyRequest(btn.dataset.cancelReq))
  );

  wireCourts(container);
  container.querySelector('[data-scout-toggle]')?.addEventListener('click', () => {
    scoutShowAll = !scoutShowAll;
    renderPortal(container);
  });

  container.querySelector('[data-drills-toggle]')?.addEventListener('click', () => {
    drillsShowAll = !drillsShowAll;
    renderPortal(container);
  });

  container.querySelectorAll('[data-drill]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sc = state.tacticalScenarios.find((x) => x.id === btn.dataset.drill);
      if (sc) openDrillModal(sc, me);
    });
  });

  container.querySelector('[data-avisos-read]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const porLer = getNotifications().filter((n) => n.type === 'club_announcement' && !n.read_at);
    try {
      await Promise.all(porLer.map((n) => markRead(n.id)));
      renderPortal(container);
    } catch (err) {
      toastError(dbErrorMessage(err));
      btn.disabled = false;
    }
  });

  container.querySelectorAll('[data-appt-response]').forEach((btn) => {
    btn.addEventListener('click', () => onRespondAppointment(btn));
  });
  container.querySelectorAll('[data-response]').forEach((btn) => {
    btn.addEventListener('click', () => onRespond(btn));
  });

  // O código QR é desenhado à parte: a biblioteca só é carregada para quem tem
  // cartão, e o resto do portal aparece sem esperar por ela.
  //
  // Corre SEMPRE que o portal abre, mesmo com o separador do cartão fechado:
  // é à porta do pavilhão, sem rede, que o cartão faz falta, e nessa altura já
  // não há como o ir buscar. Só o desenho no ecrã depende do separador.
  if (me.qr_token) {
    cardSvg(me)
      .then((svg) => {
        saveOfflineCard({
          name: me.name,
          number: me.number,
          team: team ? teamName(team) : '',
          svg,
        });
        // A promessa pode resolver depois de outro re-desenho: procura-se o
        // destino no DOM vivo, e se já não existir não há nada a fazer.
        const host = container.querySelector('#portal-qr');
        if (host) host.innerHTML = svg;
      })
      .catch(() => {
        const host = container.querySelector('#portal-qr');
        if (host) host.innerHTML = '<p class="muted">Não foi possível desenhar o código.</p>';
      });
  }
}

function cardSvg(me) {
  if (cardCache.token === me.qr_token && cardCache.promise) return cardCache.promise;
  cardCache = {
    token: me.qr_token,
    promise: import('../qrcode.js').then(({ qrSvg, qrPayload }) => qrSvg(qrPayload(me))),
  };
  return cardCache.promise;
}

// Responder a um evento. Um "não vou" pede o motivo — é o que transforma uma
// falta anónima em informação útil para quem treina — e pede-o num modal da
// app e não no `prompt()` do browser: uma caixa cinzenta do sistema, sem o
// guarda de fecho nem os estilos que o resto da Rumia usa.
//
// A gravação acontece DENTRO do `onSubmit`, para o modal ficar aberto e
// mostrar o erro se falhar (é o que o `openModal` faz), e para cancelar não
// deixar os botões presos à espera de uma resposta que não vem.
function onRespond(btn) {
  const eventId = btn.dataset.event;
  const response = btn.dataset.response;
  const row = btn.closest('.portal-resp');

  if (response === 'nao_vou') {
    openModal({
      title: 'Avisar que não vais',
      submitLabel: 'Enviar',
      fields: [{
        name: 'note',
        label: 'Motivo',
        type: 'textarea',
        full: true,
        hint: 'Opcional. Ajuda o treinador a saber com que plantel conta.',
      }],
      onSubmit: async (values) => {
        try {
          await respondToEvent(eventId, 'nao_vou', (values.note || '').trim() || null);
        } catch (err) {
          throw new Error(dbErrorMessage(err));
        }
        toastOk('Resposta enviada. O teu treinador já sabe.');
      },
    });
    return;
  }

  row?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  respondToEvent(eventId, response, null)
    .then(() => toastOk('Resposta enviada. O teu treinador já sabe.'))
    .catch((err) => {
      toastError(dbErrorMessage(err));
      row?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    });
}

// As duas respostas a um atendimento. Como nos eventos, não há "ainda não
// sei": ficar por responder já o diz.
const APPT_RESPONSES = [
  { key: 'vou', label: 'Vou' },
  { key: 'nao_posso', label: 'Não posso' },
];

// Responder a um atendimento. O "não posso" pede QUANDO pode — é o que deixa
// a fisio remarcar de uma vez, em vez de trocar três mensagens para achar
// uma hora. Não é obrigatório: um aviso sem alternativa continua a ser
// melhor do que a fisio à espera.
function onRespondAppointment(btn) {
  const id = btn.dataset.appt;
  const response = btn.dataset.apptResponse;
  const ok = () => toastOk(response === 'nao_posso'
    ? 'Aviso enviado. A fisio vai remarcar.'
    : 'Confirmado. Até lá!');

  if (response === 'nao_posso') {
    openModal({
      title: 'Não posso ir à fisioterapia',
      submitLabel: 'Avisar a fisio',
      fields: [{
        name: 'note',
        label: 'Quando podes?',
        type: 'textarea',
        full: true,
        placeholder: 'ex.: quinta depois das 18h, ou sábado de manhã',
        hint: 'Opcional, mas ajuda a fisio a marcar outra hora que te dê jeito.',
      }],
      onSubmit: async (values) => {
        try {
          await respondToAppointment(id, 'nao_posso', (values.note || '').trim() || null);
        } catch (err) {
          throw new Error(dbErrorMessage(err));
        }
        ok();
      },
    });
    return;
  }

  const row = btn.closest('.portal-resp');
  row?.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  respondToAppointment(id, response, null)
    .then(ok)
    .catch((err) => {
      toastError(dbErrorMessage(err));
      row?.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    });
}

// --- Linhas e blocos reutilizados ----------------------------------------

// Os botões de resposta de um evento, ou a razão pela qual não existem.
// Um evento do CLUBE (sem equipa) não se responde: o `respond_to_event`
// recusa-o, e um botão que só serve para dar erro é pior do que não haver
// botão nenhum — diz-se antes o que é aquilo.
function responseHTML(ev, me, extraClass = '') {
  if (!canRespondToEvent(me, ev)) {
    return '<p class="portal-resp-note">Evento do clube — não é preciso responder.</p>';
  }

  const resp = playerEventResponse(me.id, ev.id);
  // A janela de resposta: o treino fecha 6 h antes de começar. Fechada, os
  // botões ficam desativados com o motivo à vista.
  const win = eventResponseWindow(ev);
  const closedNote = win.open
    ? ''
    : win.started
      ? 'Já começou.'
      : `Respostas fechadas desde ${esc(deadlineText(win.deadline))} (até 6 h antes).`;

  return `
    <div class="portal-resp ${extraClass}" data-event="${esc(ev.id)}">
      ${EVENT_RESPONSES.map((r) => `
        <button type="button"
          class="portal-resp__btn portal-resp__btn--${r.key}${resp?.response === r.key ? ' is-active' : ''}"
          data-response="${r.key}" data-event="${esc(ev.id)}"
          ${win.open ? '' : 'disabled'}
          aria-pressed="${resp?.response === r.key}">
          ${esc(r.label)}
        </button>`).join('')}
    </div>
    ${resp?.note ? `<p class="portal-resp-note">“${esc(resp.note)}”</p>` : ''}
    ${closedNote ? `<p class="portal-resp-note">${closedNote}</p>` : ''}
  `;
}

function eventRow(ev, me) {
  const dt = eventDateTime(ev);
  const day = shortDay(dt);
  const range = eventTimeRange(ev);
  const meta = [
    ev.opponent ? `vs ${esc(ev.opponent)}` : '',
    ev.location ? esc(ev.location) : '',
  ].filter(Boolean).join(' · ');

  return `
    <li class="portal-event">
      <div class="portal-event__when">
        <span class="portal-event__date">${esc(day)}</span>
        ${range ? `<span class="muted portal-event__time">${esc(range)}</span>` : ''}
      </div>
      <div class="portal-event__body">
        <span class="portal-event__title">
          <span class="badge badge--${EVENT_TYPE_BADGE[ev.type] || 'muted'}">${esc(EVENT_TYPE_LABEL[ev.type] || ev.type)}</span>
          ${esc(ev.title || EVENT_TYPE_LABEL[ev.type] || 'Evento')}
        </span>
        ${meta ? `<span class="muted portal-event__meta">${meta}</span>` : ''}
        ${responseHTML(ev, me)}
      </div>
    </li>
  `;
}

// Uma linha do histórico de treinos: data + o que ficou registado.
// Um treino que ninguém fechou aparece como "sem registo" e não como falta —
// a diferença importa para o atleta, que não tem culpa do treino por fechar.
function trainingRow({ event, attendance }) {
  const day = shortDay(eventDateTime(event));
  const status = attendance?.status;
  const badge = status
    ? `<span class="badge badge--${ATTENDANCE_BADGE[status]}">${esc(ATTENDANCE_LABEL[status])}${
        status === 'atraso' && attendance.minutes_late ? ` ${attendance.minutes_late}'` : ''
      }</span>`
    : '<span class="badge badge--muted">Sem registo</span>';

  return `
    <li class="portal-att-row">
      <span class="portal-att-row__day">${esc(day)}</span>
      <span class="portal-att-row__title">${esc(event.title || 'Treino')}</span>
      ${badge}
    </li>
  `;
}

// A convocatória diz UMA coisa: foste chamada. Quem começa o jogo decide-se no
// pavilhão e muda até ao aquecimento — mostrá-lo aqui, dias antes, era dar como
// facto uma decisão que ainda não está tomada.
function squadRow(event) {
  const day = shortDay(eventDateTime(event));
  return `
    <li class="portal-att-row">
      <span class="portal-att-row__day">${esc(day)}</span>
      <span class="portal-att-row__title">
        ${event.opponent ? `vs ${esc(event.opponent)}` : esc(event.title || 'Jogo')}
      </span>
      <span class="badge badge--ok">Convocado</span>
    </li>
  `;
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 20) return 'Boa tarde';
  return 'Boa noite';
}

function pctClass(pct) {
  if (pct === null) return '';
  return pct >= 70 ? 'stat-pct--ok' : pct >= 50 ? 'stat-pct--warn' : 'stat-pct--danger';
}

// "hoje às 13:00" / "18/03 às 13:00" — o instante em que a janela de resposta
// fechou, para o atleta perceber que prazo é que falhou.
function deadlineText(dt) {
  const hora = dt.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date().toDateString() === dt.toDateString();
  const dia = hoje ? 'hoje' : dt.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
  return `${dia} às ${hora}`;
}

// "há 2 dias" / "ontem" — para os avisos, onde a data exata interessa menos
// do que saber se é coisa de agora.
function whenText(iso) {
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'long' });
}

// Modal do exercício de decisão tática.
//
// O exercício em si vem de `tactical-court.js` — é o MESMO código que o
// treinador vê ao pré-visualizar. Aqui só se trata do invólucro e de gravar a
// resposta.
//
// A gravação é silenciosa de propósito: a atleta não precisa de saber que
// ficou registado, e um aviso a dizer "resposta guardada" no momento em que
// ela está a ler a correção só a distraía do que interessa. Se falhar, também
// não se grita — o exercício valeu-lhe à mesma.
function openDrillModal(scenario, me) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card modal--wide" role="dialog" aria-modal="true" aria-label="${esc(scenario.title)}">
      <button type="button" class="modal__close" aria-label="Fechar">&times;</button>
      <div data-drill-host></div>
    </div>`;
  let stop = null;
  const close = wireDialog(overlay, { onClose: () => stop?.() });
  overlay.querySelector('.modal__close').focus();

  stop = renderDrill(overlay.querySelector('[data-drill-host]'), scenario, {
    compact: true,
    onAnswer: (att) => {
      saveTacticalAnswer(scenario.id, me.id, att.id, att.verdict).catch(() => {});
    },
  });
}
