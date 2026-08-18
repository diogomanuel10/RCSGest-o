// Vista: Definições. Época, meta, identidade do clube, estrutura e limiares.

import { state, saveSettings, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { isCoordenador } from '../permissions.js';
import { escaloes, positions, sport } from '../compute.js';
import { SPORTS, SPORT_POSITIONS } from '../constants.js';
import { branding, logoSrc, defaultLogo, parseHex, DEFAULT_BRANDING } from '../branding.js';

// Limite do emblema guardado (data URL na linha de definições). Mantém a linha
// pequena e o carregamento rápido.
const MAX_LOGO_BYTES = 256 * 1024;

// Separador ativo das Definições (mantido entre re-desenhos).
let activeTab = 'identidade';

export function renderDefinicoes(container) {
  const b = branding();
  const coordenador = isCoordenador();
  // "Cópia de segurança" só existe para o coordenador — evita ficar preso nesse
  // separador se o utilizador não lhe tiver acesso.
  const panelClass = (key) =>
    `settings-panel${activeTab === key ? ' settings-panel--active' : ''}`;
  const tabBtn = (key, label) =>
    `<button class="cal-toggle__btn ${activeTab === key ? 'cal-toggle__btn--active' : ''}"
             data-settings-tab="${key}" type="button">${label}</button>`;

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Definições</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Identidade, estrutura e cópia de segurança</p>
      </div>
      <div class="cal-toggle" role="group" aria-label="Separadores das definições">
        ${tabBtn('identidade', 'Identidade')}
        ${tabBtn('estrutura', 'Estrutura')}
      </div>
    </header>

    <div class="${panelClass('identidade')}" data-panel="identidade">
    <div class="settings-stack">
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Personalização</h2>
      <p class="muted" style="margin-top:0">
        A identidade do clube na aplicação: nome, lema, cores e emblema. Muda
        aqui para dar a cara do teu clube a toda a plataforma.
      </p>
      <form id="brand-form">
        <div class="field-grid">
          <div class="field">
            <label for="app_name">Nome da aplicação</label>
            <input type="text" id="app_name" name="app_name" maxlength="40"
                   value="${esc(b.app_name)}" placeholder="Rumia" />
          </div>
          <div class="field">
            <label for="club_name">Nome do clube</label>
            <input type="text" id="club_name" name="club_name" maxlength="80"
                   value="${esc(b.club_name)}" placeholder="O nome do teu clube" />
          </div>
          <div class="field field--full">
            <label for="motto">Lema do clube</label>
            <input type="text" id="motto" name="motto" maxlength="120"
                   value="${esc(b.motto)}" placeholder="A tua gestão desportiva, simples" />
          </div>
          <div class="field">
            <label for="brand_primary">Cor principal</label>
            <div class="color-field">
              <input type="color" id="brand_primary" name="brand_primary"
                     value="${esc(b.brand_primary)}" aria-label="Cor principal" />
              <input type="text" id="brand_primary_hex" value="${esc(b.brand_primary)}"
                     maxlength="7" spellcheck="false" aria-label="Cor principal (hex)" />
            </div>
          </div>
          <div class="field">
            <label for="brand_accent">Cor de destaque</label>
            <div class="color-field">
              <input type="color" id="brand_accent" name="brand_accent"
                     value="${esc(b.brand_accent)}" aria-label="Cor de destaque" />
              <input type="text" id="brand_accent_hex" value="${esc(b.brand_accent)}"
                     maxlength="7" spellcheck="false" aria-label="Cor de destaque (hex)" />
            </div>
          </div>
          <div class="field field--full">
            <label>Emblema do clube</label>
            <div class="row row--wrap" style="align-items:center;gap:0.8rem">
              <img id="logo-preview" src="${esc(logoSrc())}" alt="Emblema atual"
                   width="64" height="64"
                   style="border-radius:12px;background:var(--surface-2);padding:4px;object-fit:contain" />
              <label class="btn btn--ghost" for="logo-file" style="cursor:pointer">Escolher imagem</label>
              <input type="file" id="logo-file" accept="image/png,image/jpeg,image/svg+xml,image/webp" class="hidden" />
              <button type="button" class="btn btn--ghost btn--sm" id="logo-reset">Repor original</button>
            </div>
            <p class="field__hint muted" style="margin:0.4rem 0 0;font-size:0.82rem">
              PNG, SVG, JPG ou WebP até 256 KB. Ideal: quadrado, fundo transparente.
            </p>
          </div>
        </div>
        <p class="settings-msg hidden" id="brand-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-brand">Guardar personalização</button>
        </div>
      </form>
    </section>
    </div>
    </div>

    <div class="${panelClass('estrutura')}" data-panel="estrutura">
    <div class="settings-stack">
    ${coordenador ? `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Virar a época</h2>
      <p class="muted" style="margin-top:0">
        Época atual: <strong>${esc(state.settings.season || '—')}</strong>.
        O assistente aplica de uma vez as decisões da Avaliação de plantel a
        todo o clube: sobe de escalão quem fica, arquiva quem sai, repõe as
        avaliações e regista a época nova. Mostra tudo antes de aplicar, e
        quem for arquivado pode ser reposto nos Arquivados.
      </p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn btn--primary" id="open-rollover" type="button">Abrir assistente</button>
      </div>
    </section>
    ` : ''}

    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Escalões</h2>
      <p class="muted" style="margin-top:0">
        A lista usada ao criar equipas nos Plantéis. A ordem aqui é a ordem que
        aparece no formulário.
      </p>
      <ul class="chips" id="esc-list"></ul>
      <form class="esc-add" id="esc-add">
        <input type="text" id="esc-input" placeholder="Novo escalão" maxlength="40"
               aria-label="Novo escalão" />
        <button class="btn btn--ghost" type="submit">Adicionar</button>
      </form>
      <p class="settings-msg hidden" id="esc-msg"></p>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn btn--primary" id="save-esc">Guardar escalões</button>
      </div>
    </section>

    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Modalidade e posições</h2>
      <p class="muted" style="margin-top:0">
        A modalidade do clube e as posições usadas nas fichas de atleta, plantéis,
        recrutamento e avaliação. Mudar de modalidade sugere as suas posições —
        podes personalizá-las livremente.
      </p>
      <div class="field" style="max-width:280px">
        <label for="sport-select">Modalidade</label>
        <select id="sport-select">
          ${SPORTS.map((s) => `<option value="${esc(s.key)}" ${s.key === sport() ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}
        </select>
      </div>
      <p class="muted" style="font-size:0.86rem;margin:0.7rem 0 0.3rem">Posições</p>
      <ul class="chips" id="pos-list"></ul>
      <form class="esc-add" id="pos-add">
        <input type="text" id="pos-input" placeholder="Nova posição" maxlength="40"
               aria-label="Nova posição" />
        <button class="btn btn--ghost" type="submit">Adicionar</button>
      </form>
      <div class="row row--wrap" style="gap:0.6rem;margin-top:0.3rem">
        <button type="button" class="btn btn--ghost btn--sm" id="pos-load-defaults">
          Repor posições da modalidade
        </button>
      </div>
      <p class="settings-msg hidden" id="pos-msg"></p>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn btn--primary" id="save-pos">Guardar modalidade e posições</button>
      </div>
    </section>

    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Avaliação de plantel</h2>
      <form id="settings-form">
        <div class="field-grid">
          <div class="field">
            <label for="review_deadline">Prazo de avaliação de plantel</label>
            <input type="date" id="review_deadline" name="review_deadline"
                   value="${esc(state.settings.review_deadline || '')}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Após esta data, só o coordenador pode alterar as decisões.
            </p>
          </div>
        </div>
        <p class="settings-msg hidden" id="settings-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-settings">Guardar</button>
        </div>
      </form>
    </section>

    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Alertas de documentos</h2>
      <p class="muted" style="margin-top:0">
        Com quantos dias de antecedência o Painel avisa que um exame médico ou
        seguro está a expirar. Documentos já expirados ou sem data são sempre
        assinalados.
      </p>
      <form id="doc-alert-form">
        <div class="field-grid">
          <div class="field">
            <label for="doc_alert_days">Antecedência do aviso (dias)</label>
            <input type="number" id="doc_alert_days" name="doc_alert_days" min="1" max="365"
                   value="${esc(String(state.settings.doc_alert_days ?? 30))}" />
          </div>
        </div>
        <p class="settings-msg hidden" id="doc-alert-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-doc-alert">Guardar</button>
        </div>
      </form>
    </section>

    ${'gap_presenca_min' in state.settings ? `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Aviso "treina muito, joga pouco"</h2>
      <p class="muted" style="margin-top:0">
        O Painel assinala atletas que vão a quase todos os treinos e quase não
        entram em jogo — dos primeiros sinais de desistência. Aqui defines a
        partir de que valores isso conta para o teu clube.
      </p>
      <form id="gap-form">
        <div class="field-grid">
          <div class="field">
            <label for="gap_presenca_min">Presenças a partir de (%)</label>
            <input type="number" id="gap_presenca_min" name="gap_presenca_min" min="0" max="100"
                   value="${esc(String(state.settings.gap_presenca_min ?? 80))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Acima disto considera-se que o atleta "vem sempre".
            </p>
          </div>
          <div class="field">
            <label for="gap_jogo_max">Participação até (%)</label>
            <input type="number" id="gap_jogo_max" name="gap_jogo_max" min="0" max="100"
                   value="${esc(String(state.settings.gap_jogo_max ?? 25))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Abaixo disto considera-se que "quase não joga".
            </p>
          </div>
          <div class="field">
            <label for="gap_min_treinos">Mínimo de treinos</label>
            <input type="number" id="gap_min_treinos" name="gap_min_treinos" min="1" max="100"
                   value="${esc(String(state.settings.gap_min_treinos ?? 5))}" />
          </div>
          <div class="field">
            <label for="gap_min_jogos">Mínimo de jogos</label>
            <input type="number" id="gap_min_jogos" name="gap_min_jogos" min="1" max="100"
                   value="${esc(String(state.settings.gap_min_jogos ?? 3))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Abaixo destes mínimos não há dados que cheguem para concluir nada.
            </p>
          </div>
        </div>
        <p class="settings-msg hidden" id="gap-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-gap">Guardar</button>
        </div>
      </form>
    </section>
    ` : ''}

    ${'drop_pontos' in state.settings ? `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Aviso de queda de comparência</h2>
      <p class="muted" style="margin-top:0">
        A taxa de presenças do clube é uma média, e uma média esconde o atleta
        que vinha sempre e deixou de vir. Aqui defines a partir de quando essa
        queda individual passa a ser assinalada no Painel.
      </p>
      <form id="drop-form">
        <div class="field-grid">
          <div class="field">
            <label for="drop_recentes">Treinos da janela recente</label>
            <input type="number" id="drop_recentes" name="drop_recentes" min="2" max="30"
                   value="${esc(String(state.settings.drop_recentes ?? 5))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Comparam-se estes últimos treinos com os anteriores.
            </p>
          </div>
          <div class="field">
            <label for="drop_pontos">Queda a partir de (pontos)</label>
            <input type="number" id="drop_pontos" name="drop_pontos" min="5" max="100"
                   value="${esc(String(state.settings.drop_pontos ?? 30))}" />
          </div>
          <div class="field">
            <label for="drop_base_min">Comparência anterior mínima (%)</label>
            <input type="number" id="drop_base_min" name="drop_base_min" min="0" max="100"
                   value="${esc(String(state.settings.drop_base_min ?? 60))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Só há queda em quem tinha o hábito de vir.
            </p>
          </div>
          <div class="field">
            <label for="drop_faltas_seguidas">Faltas seguidas</label>
            <input type="number" id="drop_faltas_seguidas" name="drop_faltas_seguidas" min="2" max="20"
                   value="${esc(String(state.settings.drop_faltas_seguidas ?? 3))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Assinala mesmo quem ainda tem média alta — a média demora a cair.
            </p>
          </div>
        </div>
        <p class="settings-msg hidden" id="drop-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-drop">Guardar</button>
        </div>
      </form>
    </section>
    ` : ''}

    ${'qr_checkin_enabled' in state.settings ? `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Presenças por QR (modo quiosque)</h2>
      <p class="muted" style="margin-top:0">
        Com o modo quiosque, um tablet à entrada lê o cartão QR de cada atleta e
        regista a presença sozinho. A marcação manual continua disponível.
      </p>
      <form id="qr-form">
        <label class="coach-check" for="qr_checkin_enabled">
          <input type="checkbox" id="qr_checkin_enabled" name="qr_checkin_enabled"
                 ${state.settings.qr_checkin_enabled === false ? '' : 'checked'} />
          <span>Permitir registo de presenças por QR</span>
        </label>
        <div class="field-grid" style="margin-top:0.8rem">
          <div class="field">
            <label for="qr_tolerance_min">Tolerância (minutos)</label>
            <input type="number" id="qr_tolerance_min" name="qr_tolerance_min" min="0" max="60"
                   value="${esc(String(state.settings.qr_tolerance_min ?? 5))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Passar o cartão depois deste tempo conta como atraso.
            </p>
          </div>
          <div class="field">
            <label for="qr_window_before_min">Abre o quiosque (min. antes)</label>
            <input type="number" id="qr_window_before_min" name="qr_window_before_min" min="5" max="240"
                   value="${esc(String(state.settings.qr_window_before_min ?? 60))}" />
          </div>
          <div class="field">
            <label for="qr_window_after_min">Fecha o quiosque (min. depois)</label>
            <input type="number" id="qr_window_after_min" name="qr_window_after_min" min="5" max="240"
                   value="${esc(String(state.settings.qr_window_after_min ?? 90))}" />
            <p class="field__hint muted" style="margin:0.25rem 0 0;font-size:0.82rem">
              Fora desta janela o cartão não encontra treino para registar.
            </p>
          </div>
        </div>
        <p class="settings-msg hidden" id="qr-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-qr">Guardar</button>
        </div>
      </form>
    </section>
    ` : ''}
    </div>
    </div>

  `;

  // --- Separadores ---
  container.querySelectorAll('[data-settings-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.settingsTab;
      container.querySelectorAll('[data-settings-tab]').forEach((x) =>
        x.classList.toggle('cal-toggle__btn--active', x.dataset.settingsTab === activeTab)
      );
      container.querySelectorAll('[data-panel]').forEach((p) =>
        p.classList.toggle('settings-panel--active', p.dataset.panel === activeTab)
      );
    })
  );

  // --- Guardar definições ---
  const form = container.querySelector('#settings-form');
  const settingsMsg = container.querySelector('#settings-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = container.querySelector('#save-settings');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings({
        review_deadline: form.review_deadline.value || null,
      });
      showMsg(settingsMsg, 'Definições guardadas.', 'ok');
    } catch (err) {
      showMsg(settingsMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  // --- Alertas de documentos (janela de antecedência) ---
  const docAlertForm = container.querySelector('#doc-alert-form');
  const docAlertMsg = container.querySelector('#doc-alert-msg');
  docAlertForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = Math.round(Number(docAlertForm.doc_alert_days.value));
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      showMsg(docAlertMsg, 'Indica um número de dias entre 1 e 365.', 'error');
      return;
    }
    const btn = container.querySelector('#save-doc-alert');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings({ doc_alert_days: days });
      showMsg(docAlertMsg, 'Alertas de documentos guardados.', 'ok');
    } catch (err) {
      showMsg(docAlertMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  // --- Aviso "treina muito, joga pouco" ---
  const gapForm = container.querySelector('#gap-form');
  const gapMsg = container.querySelector('#gap-msg');
  gapForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = (name, min, max) => {
      const v = Math.round(Number(gapForm[name].value));
      return Number.isFinite(v) && v >= min && v <= max ? v : null;
    };
    const values = {
      gap_presenca_min: num('gap_presenca_min', 0, 100),
      gap_jogo_max: num('gap_jogo_max', 0, 100),
      gap_min_treinos: num('gap_min_treinos', 1, 100),
      gap_min_jogos: num('gap_min_jogos', 1, 100),
    };
    if (Object.values(values).some((v) => v === null)) {
      showMsg(gapMsg, 'Confirma os valores: percentagens 0–100 e mínimos 1–100.', 'error');
      return;
    }
    // Um limiar de presenças abaixo do de participação inverte o sentido do
    // aviso e assinalaria toda a gente.
    if (values.gap_presenca_min <= values.gap_jogo_max) {
      showMsg(gapMsg, 'A percentagem de presenças tem de ser maior do que a de participação.', 'error');
      return;
    }
    const btn = container.querySelector('#save-gap');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings(values);
      showMsg(gapMsg, 'Limiares guardados.', 'ok');
    } catch (err) {
      showMsg(gapMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  // --- Virar a época (assistente) ---
  // Carregado a pedido: é uma operação anual e não tem de pesar no arranque.
  container.querySelector('#open-rollover')?.addEventListener('click', async () => {
    const { openSeasonRollover } = await import('./nova-epoca.js');
    openSeasonRollover();
  });

  // --- Aviso de queda de comparência ---
  const dropForm = container.querySelector('#drop-form');
  const dropMsg = container.querySelector('#drop-msg');
  dropForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = (name, min, max) => {
      const v = Math.round(Number(dropForm[name].value));
      return Number.isFinite(v) && v >= min && v <= max ? v : null;
    };
    const values = {
      drop_recentes: num('drop_recentes', 2, 30),
      drop_pontos: num('drop_pontos', 5, 100),
      drop_base_min: num('drop_base_min', 0, 100),
      drop_faltas_seguidas: num('drop_faltas_seguidas', 2, 20),
    };
    if (Object.values(values).some((v) => v === null)) {
      showMsg(dropMsg, 'Confirma os valores: cada campo tem de estar dentro dos limites indicados.', 'error');
      return;
    }
    const btn = container.querySelector('#save-drop');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings(values);
      showMsg(dropMsg, 'Limiares guardados.', 'ok');
    } catch (err) {
      showMsg(dropMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  // --- Presenças por QR (modo quiosque) ---
  // A secção só existe depois da migração; sem ela não há nada para ligar.
  const qrForm = container.querySelector('#qr-form');
  const qrMsg = container.querySelector('#qr-msg');
  qrForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = (name, min, max) => {
      const v = Math.round(Number(qrForm[name].value));
      return Number.isFinite(v) && v >= min && v <= max ? v : null;
    };
    const tolerance = num('qr_tolerance_min', 0, 60);
    const before = num('qr_window_before_min', 5, 240);
    const after = num('qr_window_after_min', 5, 240);
    if (tolerance === null || before === null || after === null) {
      showMsg(qrMsg, 'Confirma os minutos: tolerância 0–60 e janelas 5–240.', 'error');
      return;
    }
    const btn = container.querySelector('#save-qr');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings({
        qr_checkin_enabled: qrForm.qr_checkin_enabled.checked,
        qr_tolerance_min: tolerance,
        qr_window_before_min: before,
        qr_window_after_min: after,
      });
      showMsg(qrMsg, 'Definições do quiosque guardadas.', 'ok');
    } catch (err) {
      showMsg(qrMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    }
  });

  // --- Personalização (marca) ---
  const brandForm = container.querySelector('#brand-form');
  const brandMsg = container.querySelector('#brand-msg');
  const logoPreview = container.querySelector('#logo-preview');
  // Emblema pendente: undefined = sem alteração; null = repor original;
  // string = novo data URL.
  let pendingLogo;

  // Mantém o seletor de cor e a caixa hex sincronizados nos dois sentidos.
  function bindColorPair(colorId, hexId) {
    const color = container.querySelector(`#${colorId}`);
    const hex = container.querySelector(`#${hexId}`);
    color.addEventListener('input', () => { hex.value = color.value; });
    hex.addEventListener('input', () => {
      const v = hex.value.trim();
      if (parseHex(v)) color.value = v.length === 4
        ? '#' + v.slice(1).split('').map((c) => c + c).join('')
        : v;
    });
  }
  bindColorPair('brand_primary', 'brand_primary_hex');
  bindColorPair('brand_accent', 'brand_accent_hex');

  container.querySelector('#logo-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showMsg(brandMsg, 'O ficheiro tem de ser uma imagem.', 'error');
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      showMsg(brandMsg, 'A imagem é demasiado grande (máx. 256 KB).', 'error');
      return;
    }
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      pendingLogo = dataUrl;
      logoPreview.src = dataUrl;
      brandMsg.classList.add('hidden');
    } catch {
      showMsg(brandMsg, 'Não foi possível ler a imagem.', 'error');
    }
  });

  container.querySelector('#logo-reset').addEventListener('click', () => {
    pendingLogo = null; // repor o emblema de origem ao guardar
    logoPreview.src = defaultLogo;
    brandMsg.classList.add('hidden');
  });

  brandForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const primary = container.querySelector('#brand_primary_hex').value.trim();
    const accent = container.querySelector('#brand_accent_hex').value.trim();
    if (!parseHex(primary) || !parseHex(accent)) {
      showMsg(brandMsg, 'As cores têm de estar em formato hexadecimal (ex.: #143b61).', 'error');
      return;
    }
    const values = {
      app_name: brandForm.app_name.value.trim() || DEFAULT_BRANDING.app_name,
      club_name: brandForm.club_name.value.trim() || DEFAULT_BRANDING.club_name,
      motto: brandForm.motto.value.trim() || DEFAULT_BRANDING.motto,
      brand_primary: primary,
      brand_accent: accent,
    };
    if (pendingLogo !== undefined) values.logo = pendingLogo; // string ou null
    const btn = container.querySelector('#save-brand');
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings(values);
      showMsg(brandMsg, 'Personalização guardada.', 'ok');
    } catch (err) {
      showMsg(brandMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar personalização';
    }
  });

  // --- Escalões configuráveis ---
  let escList = [...escaloes()];
  const escListEl = container.querySelector('#esc-list');
  const escMsg = container.querySelector('#esc-msg');

  function drawEscList() {
    if (!escList.length) {
      escListEl.innerHTML = '<li class="muted" style="list-style:none">Sem escalões.</li>';
    } else {
      escListEl.innerHTML = escList
        .map(
          (name, i) => `
        <li class="chip">
          <span class="chip__label">${esc(name)}</span>
          <span class="chip__actions">
            <button type="button" data-up="${i}" aria-label="Mover para cima" ${
            i === 0 ? 'disabled' : ''
          }>↑</button>
            <button type="button" data-down="${i}" aria-label="Mover para baixo" ${
            i === escList.length - 1 ? 'disabled' : ''
          }>↓</button>
            <button type="button" data-remove="${i}" aria-label="Remover" class="chip__remove">×</button>
          </span>
        </li>`
        )
        .join('');
    }
    escListEl.querySelectorAll('[data-remove]').forEach((b) =>
      b.addEventListener('click', () => {
        escList.splice(Number(b.dataset.remove), 1);
        drawEscList();
      })
    );
    escListEl.querySelectorAll('[data-up]').forEach((b) =>
      b.addEventListener('click', () => move(Number(b.dataset.up), -1))
    );
    escListEl.querySelectorAll('[data-down]').forEach((b) =>
      b.addEventListener('click', () => move(Number(b.dataset.down), 1))
    );
  }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= escList.length) return;
    [escList[i], escList[j]] = [escList[j], escList[i]];
    drawEscList();
  }

  drawEscList();

  container.querySelector('#esc-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = container.querySelector('#esc-input');
    const name = input.value.trim();
    if (!name) return;
    if (escList.some((x) => x.toLowerCase() === name.toLowerCase())) {
      showMsg(escMsg, 'Esse escalão já existe na lista.', 'error');
      return;
    }
    escList.push(name);
    input.value = '';
    escMsg.classList.add('hidden');
    drawEscList();
    input.focus();
  });

  container.querySelector('#save-esc').addEventListener('click', async (e) => {
    if (!escList.length) {
      showMsg(escMsg, 'Tem de existir pelo menos um escalão.', 'error');
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings({ escaloes: escList });
      showMsg(escMsg, 'Escalões guardados.', 'ok');
    } catch (err) {
      showMsg(escMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar escalões';
    }
  });

  // --- Modalidade e posições configuráveis ---
  let posList = [...positions()];
  const sportSelect = container.querySelector('#sport-select');
  const posListEl = container.querySelector('#pos-list');
  const posMsg = container.querySelector('#pos-msg');

  function drawPosList() {
    if (!posList.length) {
      posListEl.innerHTML = '<li class="muted" style="list-style:none">Sem posições. Adiciona ou repõe as da modalidade.</li>';
    } else {
      posListEl.innerHTML = posList
        .map(
          (name, i) => `
        <li class="chip">
          <span class="chip__label">${esc(name)}</span>
          <span class="chip__actions">
            <button type="button" data-pup="${i}" aria-label="Mover para cima" ${
            i === 0 ? 'disabled' : ''
          }>↑</button>
            <button type="button" data-pdown="${i}" aria-label="Mover para baixo" ${
            i === posList.length - 1 ? 'disabled' : ''
          }>↓</button>
            <button type="button" data-premove="${i}" aria-label="Remover" class="chip__remove">×</button>
          </span>
        </li>`
        )
        .join('');
    }
    posListEl.querySelectorAll('[data-premove]').forEach((b) =>
      b.addEventListener('click', () => {
        posList.splice(Number(b.dataset.premove), 1);
        drawPosList();
      })
    );
    posListEl.querySelectorAll('[data-pup]').forEach((b) =>
      b.addEventListener('click', () => movePos(Number(b.dataset.pup), -1))
    );
    posListEl.querySelectorAll('[data-pdown]').forEach((b) =>
      b.addEventListener('click', () => movePos(Number(b.dataset.pdown), 1))
    );
  }

  function movePos(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= posList.length) return;
    [posList[i], posList[j]] = [posList[j], posList[i]];
    drawPosList();
  }

  drawPosList();

  container.querySelector('#pos-add').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = container.querySelector('#pos-input');
    const name = input.value.trim();
    if (!name) return;
    if (posList.some((x) => x.toLowerCase() === name.toLowerCase())) {
      showMsg(posMsg, 'Essa posição já existe na lista.', 'error');
      return;
    }
    posList.push(name);
    input.value = '';
    posMsg.classList.add('hidden');
    drawPosList();
    input.focus();
  });

  // Carrega as posições por omissão da modalidade selecionada (substitui a lista).
  container.querySelector('#pos-load-defaults').addEventListener('click', () => {
    posList = [...(SPORT_POSITIONS[sportSelect.value] || [])];
    posMsg.classList.add('hidden');
    drawPosList();
  });

  container.querySelector('#save-pos').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings({ sport: sportSelect.value, positions: posList });
      showMsg(posMsg, 'Modalidade e posições guardadas.', 'ok');
    } catch (err) {
      showMsg(posMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar modalidade e posições';
    }
  });

}

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `settings-msg settings-msg--${kind}`;
}
