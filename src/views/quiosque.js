// Modo quiosque: um tablet/telemóvel fica à entrada com a câmara ligada e
// cada atleta passa o seu cartão QR. A presença é registada sozinha, com o
// estado (presente/atraso) decidido pela hora do treino no servidor.
//
// Não é uma rota: é um ecrã cheio por cima da app. Assim não se sai por
// engano com o botão "voltar" do browser, e o dispositivo pode ficar horas
// nesta página sem tocar no resto da sessão.

import { state, checkInByQr, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { eventDateTime, eventTimeRange, teamById, teamName } from '../compute.js';
import { createScanner, parseQrPayload, cameraErrorMessage } from '../qrcode.js';

// Leituras que ficaram por enviar (rede em baixo no pavilhão). Ficam também no
// armazenamento local: se o tablet for recarregado a meio, não se perdem.
const PENDING_KEY = 'rumia:qr-pendentes';
const RETRY_MS = 15000;

// Mensagens dos motivos devolvidos pelo servidor (ver check_in_by_qr).
const REASON_MESSAGE = {
  sem_permissao: 'Esta conta não pode registar presenças.',
  sem_permissao_equipa: 'Este treino não é de uma equipa tua.',
  desativado: 'O registo por QR está desligado nas Definições.',
  cartao_desconhecido: 'Cartão não reconhecido.',
  sem_equipa: 'Este atleta não tem equipa atribuída.',
  treino_desconhecido: 'Treino não encontrado.',
  equipa_errada: 'Este atleta não é da equipa deste treino.',
  sem_treino: 'Sem treino a decorrer para este atleta.',
};

export function openQuiosque(preselectedEventId = null) {
  // Só os treinos DE HOJE: o quiosque é usado no próprio dia, e cada treinador
  // que chega escolhe a sua sessão desta lista (ver o seletor na barra).
  // Lida a cada abertura, não guardada: o tablet fica horas ligado e entretanto
  // pode ter sido criado um treino no Calendário (ou passado a meia-noite).
  const todayTrainings = () => {
    const todayKey = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD local
    return state.events
      .filter((e) => e.type === 'treino' && e.date === todayKey)
      .sort((a, b) => eventDateTime(a) - eventDateTime(b));
  };
  const trainings = todayTrainings();

  let eventId = preselectedEventId || '';
  let scanner = null;
  let wakeLock = null;
  let retryTimer = null;
  let scanned = 0;
  const recent = [];
  let pending = loadPending();

  const overlay = document.createElement('div');
  overlay.className = 'kiosk';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Modo quiosque de presenças');
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  renderSetup();

  // --- Ecrã 1: escolher a sessão -----------------------------------------
  function renderSetup() {
    overlay.innerHTML = `
      <div class="kiosk__setup">
        <div class="card kiosk__setup-card">
          <h1 class="section-title">Modo quiosque</h1>
          <p class="muted" style="margin-top:0">
            Deixa este dispositivo à entrada. Cada atleta passa o cartão à frente
            da câmara e fica com a presença registada.
          </p>

          <div class="field">
            <label for="kiosk-event">Sessão de hoje</label>
            <select id="kiosk-event">
              <option value="">Automático — pelo escalão de cada atleta</option>
              ${trainings.map((t) => `<option value="${t.id}" ${t.id === eventId ? 'selected' : ''}>${esc(sessionLabel(t))}</option>`).join('')}
            </select>
            <p class="field__hint muted" style="margin:0.35rem 0 0;font-size:0.84rem">
              ${trainings.length
                ? 'Podes trocar de sessão a qualquer momento sem sair do quiosque. No modo automático, cada cartão vai para o treino da equipa desse atleta que estiver a decorrer.'
                : 'Hoje não há treinos no Calendário. Em automático, o quiosque continua a aceitar cartões de qualquer treino que venha a existir.'}
            </p>
          </div>

          ${pending.length ? `<p class="kiosk__pending-note">Há ${pending.length} leitura${pending.length === 1 ? '' : 's'} por sincronizar da última sessão. Serão enviadas ao iniciar.</p>` : ''}

          <div id="kiosk-setup-err" class="modal__error hidden"></div>

          <div class="row" style="gap:0.6rem;justify-content:flex-end;margin-top:1rem">
            <button class="btn btn--ghost" type="button" id="kiosk-cancel">Cancelar</button>
            <button class="btn btn--primary" type="button" id="kiosk-start">Iniciar leitura</button>
          </div>
        </div>
      </div>
    `;

    overlay.querySelector('#kiosk-event').addEventListener('change', (e) => {
      eventId = e.target.value;
    });
    overlay.querySelector('#kiosk-cancel').addEventListener('click', close);
    overlay.querySelector('#kiosk-start').addEventListener('click', start);
  }

  // Etiqueta de uma sessão: equipa + horas. É o que o treinador procura na
  // lista, por isso a equipa vem primeiro.
  function sessionLabel(ev) {
    const tm = teamById(ev.team_id);
    const range = eventTimeRange(ev);
    return [tm ? teamName(tm) : 'Sem equipa', range, ev.title].filter(Boolean).join(' · ');
  }

  // --- Ecrã 2: a ler ------------------------------------------------------
  // Desenhado UMA vez. Trocar de sessão ou de câmara não pode voltar a escrever
  // no `innerHTML` do palco: isso destruía o <video> e obrigava a repedir a
  // câmara. As atualizações são todas em pontos concretos do DOM.
  function renderScanner() {
    overlay.innerHTML = `
      <div class="kiosk__stage">
        <header class="kiosk__bar">
          <div class="kiosk__bar-id">
            <strong class="kiosk__bar-title">Presenças</strong>
            <button class="kiosk__session" type="button" id="kiosk-session"
                    aria-label="Trocar de sessão de treino">
              <span id="kiosk-session-label"></span>
              <span class="kiosk__session-caret" aria-hidden="true">▾</span>
            </button>
          </div>
          <div class="kiosk__bar-actions">
            <span class="kiosk__count"><strong id="kiosk-count">0</strong> registos</span>
            <span class="kiosk__pending hidden" id="kiosk-pending"></span>
            <button class="btn btn--ghost btn--sm hidden" type="button" id="kiosk-camera">Trocar câmara</button>
            <button class="btn btn--ghost btn--sm" type="button" id="kiosk-full">Ecrã inteiro</button>
            <button class="btn btn--ghost btn--sm" type="button" id="kiosk-exit">Sair</button>
          </div>
        </header>

        <div class="kiosk__body">
          <div class="kiosk__camera">
            <video id="kiosk-video" playsinline muted></video>
            <div class="kiosk__reticle" aria-hidden="true"></div>
          </div>

          <div class="kiosk__feedback" id="kiosk-feedback" aria-live="assertive">
            <div class="kiosk__idle">
              <span class="kiosk__idle-icon" aria-hidden="true">▢</span>
              <p>Passa o teu cartão à frente da câmara</p>
            </div>
          </div>
        </div>

        <ul class="kiosk__recent" id="kiosk-recent" aria-label="Últimas leituras"></ul>
      </div>
    `;

    overlay.querySelector('#kiosk-exit').addEventListener('click', tryClose);
    overlay.querySelector('#kiosk-full').addEventListener('click', toggleFullscreen);
    overlay.querySelector('#kiosk-session').addEventListener('click', openSessionPicker);
    overlay.querySelector('#kiosk-camera').addEventListener('click', switchCamera);
    paintSession();
    paintPending();
  }

  // Sessão em vigor, escrita na barra.
  function paintSession() {
    const el = overlay.querySelector('#kiosk-session-label');
    if (!el) return;
    const ev = eventId ? state.events.find((e) => e.id === eventId) : null;
    el.textContent = ev ? sessionLabel(ev) : 'Automático — pelo escalão de cada atleta';
  }

  // Troca de sessão sem sair do quiosque: o treinador que chega escolhe o seu
  // treino de hoje e o quiosque continua a ler, sem repedir a câmara.
  function openSessionPicker() {
    const today = todayTrainings();
    const rows = [
      { id: '', label: 'Automático — pelo escalão de cada atleta' },
      ...today.map((t) => ({ id: t.id, label: sessionLabel(t) })),
    ];
    const panel = kioskPanel({
      title: 'Sessão de treino de hoje',
      body: `
        <ul class="kiosk__picker">
          ${rows.map((r) => `
            <li>
              <button type="button" class="kiosk__picker-btn${r.id === eventId ? ' is-active' : ''}" data-session="${esc(r.id)}">
                <span>${esc(r.label)}</span>
                ${r.id === eventId ? '<span class="kiosk__picker-tick" aria-hidden="true">✓</span>' : ''}
              </button>
            </li>`).join('')}
        </ul>
        ${today.length ? '' : '<p class="muted" style="margin:0.6rem 0 0;font-size:0.88rem">Hoje não há treinos no Calendário.</p>'}
      `,
      actions: '<button class="btn btn--ghost" type="button" data-close>Fechar</button>',
    });

    panel.querySelectorAll('[data-session]').forEach((btn) =>
      btn.addEventListener('click', () => {
        eventId = btn.dataset.session;
        paintSession();
        scanner?.reset();
        panel.close();
      })
    );
  }

  async function switchCamera() {
    const btn = overlay.querySelector('#kiosk-camera');
    if (!scanner || !btn) return;
    btn.disabled = true;
    try {
      const label = await scanner.switchCamera();
      btn.title = `A usar: ${label}`;
      showResult({ kind: 'repetido', title: label, detail: 'Câmara trocada' });
    } catch (err) {
      showResult({ kind: 'erro', title: 'Câmara', detail: cameraErrorMessage(err) });
    } finally {
      btn.disabled = false;
    }
  }

  // O botão só faz sentido com mais do que uma câmara — num portátil com uma
  // webcam só, trocar não muda nada e o botão seria uma promessa falsa. As
  // câmaras só se conhecem depois de a permissão ser dada, daí ser aqui.
  function paintCameraButton() {
    const btn = overlay.querySelector('#kiosk-camera');
    if (!btn || !scanner) return;
    if (scanner.cameraCount() > 1) {
      btn.classList.remove('hidden');
      btn.title = `A usar: ${scanner.cameraLabel()}`;
    } else {
      btn.classList.add('hidden');
    }
  }

  // Painel montado DENTRO do quiosque (e não no <body>, como o `confirmDialog`
  // partilhado): em ecrã inteiro só é desenhado o que está dentro do elemento
  // em ecrã inteiro, e um diálogo montado no body ficava invisível — era o que
  // fazia o botão "Sair" parecer avariado.
  function kioskPanel({ title, body, actions }) {
    const host = document.createElement('div');
    host.className = 'kiosk__panel';
    host.innerHTML = `
      <div class="card kiosk__panel-card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <h2 class="section-title" style="margin-top:0">${esc(title)}</h2>
        ${body}
        <div class="modal__actions">${actions}</div>
      </div>
    `;
    overlay.appendChild(host);

    const close = () => {
      host.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    host.addEventListener('mousedown', (e) => { if (e.target === host) close(); });
    host.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    host.querySelector('button')?.focus();

    host.close = close;
    return host;
  }

  async function start() {
    renderScanner();
    const video = overlay.querySelector('#kiosk-video');
    scanner = createScanner({ video, onCode: handleCode });
    try {
      await scanner.start();
    } catch (err) {
      scanner = null;
      renderSetup();
      const el = overlay.querySelector('#kiosk-setup-err');
      el.textContent = cameraErrorMessage(err);
      el.classList.remove('hidden');
      return;
    }
    paintCameraButton();
    keepAwake();
    retryTimer = setInterval(flushPending, RETRY_MS);
    flushPending();
  }

  // --- Uma leitura --------------------------------------------------------
  async function handleCode(raw) {
    const token = parseQrPayload(raw);
    if (!token) {
      showResult({ kind: 'erro', title: 'Código inválido', detail: 'Este código não é um cartão da Rumia.' });
      return;
    }

    try {
      const res = await checkInByQr(token, eventId || null);
      if (!res?.ok) {
        showResult({
          kind: 'erro',
          title: res?.player?.name || 'Não registado',
          detail: REASON_MESSAGE[res?.reason] || 'Não foi possível registar a presença.',
        });
        return;
      }

      const p = res.player || {};
      const label = res.status === 'atraso'
        ? `Atraso${res.minutes_late ? ` · ${res.minutes_late} min` : ''}`
        : 'Presente';
      showResult({
        kind: res.already ? 'repetido' : res.status === 'atraso' ? 'atraso' : 'ok',
        title: p.name || 'Atleta',
        detail: res.already ? `Já estavas registado — ${label.toLowerCase()}` : label,
        meta: [p.number ? `Nº ${p.number}` : '', teamName(teamById(p.team_id)) || ''].filter(Boolean).join(' · '),
      });
      if (!res.already) {
        scanned += 1;
        overlay.querySelector('#kiosk-count').textContent = String(scanned);
        pushRecent({ name: p.name, status: res.status, minutes: res.minutes_late });
      }
    } catch (err) {
      // Sem rede: guarda para enviar mais tarde em vez de perder a passagem.
      if (isOffline(err)) {
        queuePending(token);
        showResult({
          kind: 'pendente',
          title: 'Registado sem rede',
          detail: 'A leitura fica guardada e é enviada assim que houver ligação.',
        });
      } else {
        showResult({ kind: 'erro', title: 'Erro', detail: dbErrorMessage(err) });
      }
    }
  }

  // --- Feedback no ecrã ---------------------------------------------------
  let clearTimer = null;
  function showResult({ kind, title, detail, meta }) {
    const el = overlay.querySelector('#kiosk-feedback');
    if (!el) return;
    const icon = { ok: '✓', atraso: '!', repetido: '✓', pendente: '↻', erro: '×' }[kind] || '';
    el.className = `kiosk__feedback kiosk__feedback--${kind}`;
    el.innerHTML = `
      <span class="kiosk__result-icon" aria-hidden="true">${icon}</span>
      <strong class="kiosk__result-name">${esc(title)}</strong>
      ${meta ? `<span class="kiosk__result-meta">${esc(meta)}</span>` : ''}
      <span class="kiosk__result-detail">${esc(detail)}</span>
    `;
    beep(kind);
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => {
      el.className = 'kiosk__feedback';
      el.innerHTML = `
        <div class="kiosk__idle">
          <span class="kiosk__idle-icon" aria-hidden="true">▢</span>
          <p>Passa o teu cartão à frente da câmara</p>
        </div>`;
    }, 3200);
  }

  function pushRecent({ name, status, minutes }) {
    recent.unshift({ name, status, minutes, at: new Date() });
    if (recent.length > 8) recent.pop();
    const list = overlay.querySelector('#kiosk-recent');
    if (!list) return;
    list.innerHTML = recent.map((r) => `
      <li class="kiosk__recent-item">
        <span class="kiosk__recent-time">${r.at.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
        <span class="kiosk__recent-name">${esc(r.name || '—')}</span>
        <span class="badge badge--${r.status === 'atraso' ? 'warn' : 'ok'}">
          ${r.status === 'atraso' ? `Atraso${r.minutes ? ` ${r.minutes}'` : ''}` : 'Presente'}
        </span>
      </li>`).join('');
  }

  // Som curto de confirmação — no barulho de um pavilhão, o ecrã não chega.
  function beep(kind) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = kind === 'erro' ? 220 : kind === 'atraso' ? 620 : 880;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (kind === 'erro' ? 0.35 : 0.12));
      setTimeout(() => ctx.close(), 600);
    } catch {
      /* som é um extra: nunca deve partir a leitura */
    }
  }

  // --- Leituras pendentes (sem rede) --------------------------------------
  function loadPending() {
    try {
      return JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    } catch {
      return [];
    }
  }
  function savePending() {
    try {
      localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    } catch {
      /* armazenamento cheio ou bloqueado: segue sem persistir */
    }
  }
  function queuePending(token) {
    pending.push({ token, eventId: eventId || null, at: new Date().toISOString() });
    savePending();
    paintPending();
  }
  function paintPending() {
    const el = overlay.querySelector('#kiosk-pending');
    if (!el) return;
    if (!pending.length) {
      el.classList.add('hidden');
      return;
    }
    el.textContent = `${pending.length} por sincronizar`;
    el.classList.remove('hidden');
  }
  async function flushPending() {
    if (!pending.length || !navigator.onLine) return;
    const queue = pending.slice();
    for (const item of queue) {
      try {
        await checkInByQr(item.token, item.eventId);
        pending = pending.filter((p) => p !== item);
        savePending();
      } catch (err) {
        if (isOffline(err)) break; // ainda sem rede: tenta no próximo ciclo
        // Erro definitivo (cartão revogado, treino apagado): não vale a pena
        // insistir para sempre — descarta e segue.
        pending = pending.filter((p) => p !== item);
        savePending();
      }
    }
    paintPending();
  }

  // --- Ecrã sempre ligado e ecrã inteiro ----------------------------------
  async function keepAwake() {
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
      document.addEventListener('visibilitychange', reacquire);
    } catch {
      /* sem wake lock o tablet adormece: o utilizador toca no ecrã */
    }
  }
  // O bloqueio cai sozinho quando o ecrã é minimizado; ao voltar, pede outro.
  async function reacquire() {
    if (document.visibilityState !== 'visible' || wakeLock?.released === false) return;
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      /* idem */
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await overlay.requestFullscreen();
    } catch {
      /* alguns browsers recusam sem gesto direto: sem problema */
    }
  }

  // --- Sair ---------------------------------------------------------------
  function tryClose() {
    const panel = kioskPanel({
      title: 'Sair do modo quiosque?',
      body: `<p class="modal__confirm-text" style="margin:0">${
        pending.length
          ? `Há ${pending.length} leitura${pending.length === 1 ? '' : 's'} por sincronizar — ficam guardadas e são enviadas da próxima vez.`
          : 'A câmara deixa de registar presenças.'
      }</p>`,
      actions: `
        <button class="btn btn--ghost" type="button" data-close>Continuar a ler</button>
        <button class="btn btn--primary" type="button" data-exit>Sair</button>
      `,
    });
    panel.querySelector('[data-exit]').addEventListener('click', close);
  }

  function close() {
    scanner?.stop();
    clearInterval(retryTimer);
    clearTimeout(clearTimer);
    document.removeEventListener('visibilitychange', reacquire);
    wakeLock?.release?.().catch(() => {});
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    overlay.remove();
    if (!document.querySelector('.modal-overlay')) document.body.classList.remove('no-scroll');
  }
}

// Falha de rede (fetch rejeitado) vs. erro devolvido pelo servidor.
function isOffline(err) {
  if (!navigator.onLine) return true;
  const msg = String(err?.message || '').toLowerCase();
  return msg.includes('fetch') || msg.includes('network') || msg.includes('rede');
}
