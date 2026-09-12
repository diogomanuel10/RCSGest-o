// Vista: Definições. Época, meta, identidade do clube, estrutura e limiares.

import { state, saveSettings, dbErrorMessage, uploadArticlePhoto, deleteArticlePhoto, articlePhotoUrl } from '../store.js';
import { esc, euros } from '../ui.js';
import { toastOk } from '../toast.js';
import { confirmDialog } from '../modal.js';
import { isCoordenador } from '../permissions.js';
import { hasDemoData, seedDemoData, clearDemoData } from '../demo-data.js';
import { escaloes, positions, sport, allEquipmentArticles, equipmentArticlesReady } from '../compute.js';
import { SPORTS, SPORT_POSITIONS, TEXT_SIZES, DEFAULT_EQUIPMENT_ARTICLES } from '../constants.js';
import { openModal } from '../modal.js';
import { branding, logoSrc, defaultLogo, parseHex, DEFAULT_BRANDING } from '../branding.js';

// Limite do emblema guardado (data URL na linha de definições). Mantém a linha
// pequena e o carregamento rápido.
const MAX_LOGO_BYTES = 256 * 1024;

// Separador ativo das Definições (mantido entre re-desenhos).
let activeTab = 'identidade';

export function renderDefinicoes(container) {
  const b = branding();
  const coordenador = isCoordenador();
  // Os dados de exemplo só existem depois de `supabase/dados-exemplo.sql` correr
  // (é ele que traz a coluna) — sem migração, o cartão não aparece.
  const demoReady = 'demo_seed' in (state.settings || {});
  // Os artigos configuráveis só existem depois de `artigos-configuraveis.sql`
  // correr (é ele que traz a coluna) — sem migração, o cartão não aparece.
  const articlesReady = equipmentArticlesReady();
  const demoOn = demoReady && hasDemoData();
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

    ${coordenador && demoReady ? `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Dados de exemplo</h2>
      <p class="muted" style="margin-top:0">
        ${demoOn
          ? `Este clube tem dados de demonstração: dois escalões, os plantéis,
             um mês de treinos com presenças, jogos com resultado, quotas e
             patrocínios. Servem para veres a app a funcionar antes de
             introduzires os teus. Limpa-os quando começares a sério.`
          : `Enche o clube com um plantel, um mês de treinos já marcados, jogos
             com resultado e quotas, para veres o que a app faz sem teres de
             escrever nada. Podes limpar tudo a seguir.`}
      </p>
      ${demoOn ? `
      <p class="muted settings-warn">
        ⚠ Limpar apaga as equipas de exemplo e <strong>tudo o que estiver
        dentro delas</strong> — inclusive atletas teus que tenhas acrescentado a
        essas equipas. As tuas próprias equipas não são tocadas.
      </p>` : ''}
      <p class="settings-msg hidden" id="demo-msg"></p>
      <div class="row" style="justify-content:flex-end">
        ${demoOn
          ? '<button class="btn btn--ghost" id="demo-clear" type="button">Limpar dados de exemplo</button>'
          : '<button class="btn btn--ghost" id="demo-seed" type="button">Criar dados de exemplo</button>'}
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

    ${articlesReady ? `
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Artigos de equipamento</h2>
      <p class="muted" style="margin-top:0">
        Os artigos que o clube dá aos atletas e os tamanhos de cada um. É esta
        lista que faz as colunas das Encomendas e as opções dos Pedidos. Um
        artigo <strong>sem tamanhos</strong> pede o tamanho em texto livre —
        é o caso das meias, que se medem em números. O <strong>🙋 pedível</strong>
        marca o que uma atleta pode pedir da sua página: as camisolas de treino
        sim, a camisola de jogo com o número dela não — essa não se pede, vem
        na encomenda.
      </p>
      <ul class="chips" id="art-list"></ul>
      <div class="row row--wrap" style="gap:0.6rem;margin-top:0.5rem">
        <button type="button" class="btn btn--ghost btn--sm" id="art-add">+ Novo artigo</button>
        <button type="button" class="btn btn--ghost btn--sm" id="art-defaults">Repor lista de origem</button>
      </div>
      <p class="settings-msg hidden" id="art-msg"></p>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn btn--primary" id="save-art">Guardar artigos</button>
      </div>
    </section>
    ` : ''}

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
  // --- Dados de exemplo ---
  const demoMsg = container.querySelector('#demo-msg');
  container.querySelector('#demo-seed')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'A criar…';
    showMsg(demoMsg, 'A criar o clube de exemplo…', 'info');
    try {
      await seedDemoData();
      toastOk('Dados de exemplo criados.');
    } catch (err) {
      showMsg(demoMsg, dbErrorMessage(err), 'error');
      btn.disabled = false;
      btn.textContent = 'Criar dados de exemplo';
    }
  });
  container.querySelector('#demo-clear')?.addEventListener('click', async (e) => {
    const ok = await confirmDialog(
      'Apagar as equipas de exemplo e tudo o que está dentro delas (atletas, treinos, presenças, quotas)? As tuas próprias equipas não são tocadas.',
      { confirmLabel: 'Limpar', danger: true }
    );
    if (!ok) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'A limpar…';
    try {
      await clearDemoData();
      toastOk('Dados de exemplo removidos.');
    } catch (err) {
      showMsg(demoMsg, dbErrorMessage(err), 'error');
      btn.disabled = false;
      btn.textContent = 'Limpar dados de exemplo';
    }
  });

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

  // --- Artigos de equipamento configuráveis ---
  if (articlesReady) wireArticles();

  function wireArticles() {
    // A CHAVE de um artigo é imutável depois de criada: é ela que está guardada
    // nos tamanhos de cada atleta (player_sizes.sizes) e em cada pedido
    // (equipment_requests.article). Renomear "Blusão" para "Casaco" muda só a
    // etiqueta; mudar a chave perdia os tamanhos todos.
    let artList = allEquipmentArticles().map((a) => ({ ...a, sizes: [...a.sizes] }));
    const artListEl = container.querySelector('#art-list');
    const artMsg = container.querySelector('#art-msg');

    // Chave a partir da etiqueta: minúsculas sem acentos. Só serve para
    // artigos NOVOS — nunca se recalcula a de um artigo existente.
    function articleKeyFrom(label) {
      const base = String(label)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase() || 'artigo';
      // 'outro' é a chave reservada do "Outro artigo…" nos Pedidos.
      let key = base === 'outro' ? 'artigo_outro' : base;
      let n = 2;
      while (artList.some((a) => a.key === key)) key = `${base}_${n++}`;
      return key;
    }

    function drawArtList() {
      if (!artList.length) {
        artListEl.innerHTML = '<li class="muted" style="list-style:none">Sem artigos. As Encomendas ficam vazias.</li>';
        return;
      }
      artListEl.innerHTML = artList
        .map((a, i) => `
          <li class="chip chip--rich${a.active ? '' : ' chip--off'}">
            ${a.photo
              ? `<img class="chip__photo" src="${esc(articlePhotoUrl(a.photo))}" alt=""
                      loading="lazy" onerror="this.remove()" />`
              : ''}
            <span class="chip__label">
              ${esc(a.label)}
              ${a.active ? '' : '<span class="badge badge--muted">Desativado</span>'}
              <small class="muted" style="display:block;font-weight:400">
                ${a.sizes.length ? esc(a.sizes.join(' · ')) : 'Tamanho em texto livre'}
                ${a.price != null ? ` · ${esc(euros(a.price))}` : ''}
                ${a.requestable ? ' · 🙋 as atletas podem pedir' : ''}
              </small>
            </span>
            <span class="chip__actions">
              <button type="button" data-aup="${i}" aria-label="Mover para cima" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button type="button" data-adown="${i}" aria-label="Mover para baixo" ${i === artList.length - 1 ? 'disabled' : ''}>↓</button>
              <button type="button" data-aedit="${i}" aria-label="Editar ${esc(a.label)}">✎</button>
              <button type="button" data-areq="${i}" class="${a.requestable ? 'chip__on' : ''}"
                      aria-pressed="${a.requestable ? 'true' : 'false'}"
                      aria-label="${a.requestable ? 'Deixar de permitir' : 'Permitir'} que as atletas peçam ${esc(a.label)}"
                      title="As atletas podem pedir este artigo">🙋</button>
              <button type="button" data-atoggle="${i}"
                      aria-label="${a.active ? 'Desativar' : 'Reativar'} ${esc(a.label)}">${a.active ? '⏻' : '↺'}</button>
            </span>
          </li>`)
        .join('');

      artListEl.querySelectorAll('[data-aup]').forEach((b) =>
        b.addEventListener('click', () => moveArt(Number(b.dataset.aup), -1))
      );
      artListEl.querySelectorAll('[data-adown]').forEach((b) =>
        b.addEventListener('click', () => moveArt(Number(b.dataset.adown), 1))
      );
      artListEl.querySelectorAll('[data-aedit]').forEach((b) =>
        b.addEventListener('click', () => openArticleForm(Number(b.dataset.aedit)))
      );
      artListEl.querySelectorAll('[data-areq]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.areq);
          artList[i] = { ...artList[i], requestable: !artList[i].requestable };
          drawArtList();
        })
      );
      // Desativar e NÃO apagar: os tamanhos e os pedidos já registados guardam a
      // chave deste artigo, e sem a definição um pedido de dezembro passava a
      // dizer "blusao" em vez de "Blusão". Desativado, deixa de se poder
      // preencher e sai das Encomendas — o histórico fica legível.
      artListEl.querySelectorAll('[data-atoggle]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.atoggle);
          artList[i] = { ...artList[i], active: !artList[i].active };
          drawArtList();
        })
      );
    }

    function moveArt(i, dir) {
      const j = i + dir;
      if (j < 0 || j >= artList.length) return;
      [artList[i], artList[j]] = [artList[j], artList[i]];
      drawArtList();
    }

    // Os tamanhos escrevem-se numa linha separada por vírgulas, e não em chips
    // um a um: escrever "XS, S, M, L, XL" é um gesto; cinco chips são cinco
    // submissões de formulário para dizer a mesma coisa. A ORDEM em que se
    // escrevem é a ordem em que aparecem — é ela que diz que XS vem antes de S,
    // sem a app ter de conhecer escala nenhuma.
    function openArticleForm(index) {
      const editing = index != null ? artList[index] : null;
      openModal({
        title: editing ? `Artigo — ${editing.label}` : 'Novo artigo',
        submitLabel: 'Aplicar',
        values: {
          label: editing?.label || '',
          sizes: (editing?.sizes || TEXT_SIZES).join(', '),
          price: editing?.price ?? '',
          photo_action: 'manter',
        },
        fields: [
          {
            name: 'label', label: 'Nome do artigo', required: true,
            placeholder: 'ex.: Joelheiras',
            hint: editing
              ? 'Muda só o que se lê no ecrã — os tamanhos já registados mantêm-se.'
              : undefined,
          },
          {
            name: 'sizes', label: 'Tamanhos', type: 'text',
            placeholder: 'XS, S, M, L, XL, XXL',
            hint: 'Separados por vírgulas, pela ordem em que devem aparecer. Deixa vazio para pedir o tamanho em texto livre.',
          },
          // A foto serve sobretudo o portal: "Casaco Fato de Treino" e
          // "Blusão" são duas etiquetas que só distinguem o material a quem
          // já o conhece, e quem escolhe lá é uma atleta que entrou em
          // setembro. A imagem é reduzida no browser antes de subir.
          {
            name: 'price', label: 'Preço unitário (€)', type: 'number',
            placeholder: 'ex.: 12.50',
            hint: 'Opcional. Serve para orçamentar a encomenda e para decidires um pedido sabendo quanto custa. Deixa vazio se ainda não sabes — zero quer dizer que o clube dá de graça.',
          },
          {
            name: 'photo_file', label: 'Foto', type: 'file', accept: 'image/*',
            ...(editing?.photo ? { image: articlePhotoUrl(editing.photo) } : {}),
            hint: editing?.photo
              ? 'Escolhe um ficheiro para substituir a foto atual.'
              : 'Opcional. Ajuda as atletas a reconhecer o artigo no portal.',
          },
          // Só aparece quando há foto: uma opção "remover" num artigo sem
          // imagem é uma escolha sem efeito a ocupar uma linha do formulário.
          ...(editing?.photo ? [{
            name: 'photo_action', label: 'Foto atual', type: 'select',
            options: [
              { key: 'manter', label: 'Manter' },
              { key: 'remover', label: 'Remover a foto' },
            ],
          }] : []),
        ],
        onSubmit: async (values) => {
          const label = values.label.trim();
          // O nome é o cabeçalho de uma coluna da tabela das Encomendas — um
          // parágrafo ali dentro deita a tabela ao lado.
          if (label.length > 40) throw new Error('O nome do artigo não pode ter mais de 40 caracteres.');
          if (artList.some((a, j) => j !== index && a.label.toLowerCase() === label.toLowerCase())) {
            throw new Error('Já existe um artigo com esse nome.');
          }
          // Vazio continua vazio (null = "ainda não sei"); um número válido
          // é guardado. Um texto que não seja número é engano de digitação e
          // dizê-lo é melhor do que gravar zero em silêncio.
          const rawPrice = (values.price ?? '').toString().trim();
          let price = null;
          if (rawPrice !== '') {
            const n = Number(rawPrice.replace(',', '.'));
            if (!Number.isFinite(n) || n < 0) {
              throw new Error('O preço tem de ser um número igual ou maior que zero (ou vazio).');
            }
            price = Math.round(n * 100) / 100;
          }

          const sizes = (values.sizes || '')
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
            // Um tamanho repetido dava duas opções iguais no select.
            .filter((x, i, arr) => arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);

          // A chave calcula-se UMA vez: serve para o nome do ficheiro e para
          // o artigo novo. `articleKeyFrom` desempata contra a lista, por
          // isso duas chamadas eram duas oportunidades de divergirem.
          const key = editing ? editing.key : articleKeyFrom(label);

          // A foto sobe AQUI e não no "Guardar artigos": assim a miniatura
          // aparece logo na lista e confirma-se que a imagem certa foi
          // escolhida antes de gravar tudo. Uma foto que fique no bucket
          // porque o coordenador desistiu a seguir é lixo de 60 KB — uma
          // gravação que só mostra o resultado no fim é pior.
          let photo = editing?.photo || '';
          const file = values.photo_file;
          if (file && file.size) {
            try {
              photo = await uploadArticlePhoto(key, file);
            } catch (err) {
              throw new Error(dbErrorMessage(err) || 'Não foi possível guardar a foto.');
            }
            if (editing?.photo && editing.photo !== photo) deleteArticlePhoto(editing.photo);
          } else if (values.photo_action === 'remover' && editing?.photo) {
            deleteArticlePhoto(editing.photo);
            photo = '';
          }

          if (editing) {
            artList[index] = { ...editing, label, sizes, photo, price };
          } else {
            // Nasce NÃO pedível: pôr um artigo no catálogo do clube e abri-lo
            // aos pedidos das atletas são duas decisões, e a segunda é a que
            // custa dinheiro.
            artList.push({ key, label, sizes, photo, price, active: true, requestable: false });
          }
          artMsg.classList.add('hidden');
          drawArtList();
        },
      });
    }

  drawArtList();

  container.querySelector('#art-add').addEventListener('click', () => openArticleForm(null));

  container.querySelector('#art-defaults').addEventListener('click', async () => {
    const ok = await confirmDialog(
      'Repor a lista de artigos de origem? Os artigos que criaste desaparecem da lista. '
      + 'Os tamanhos já registados não são apagados — voltam a aparecer se o artigo for recriado com a mesma chave.',
      { confirmLabel: 'Repor', danger: false }
    );
    if (!ok) return;
    artList = DEFAULT_EQUIPMENT_ARTICLES.map((a) => ({
      ...a, sizes: [...a.sizes], photo: '', price: null, active: true, requestable: false,
    }));
    drawArtList();
  });

  container.querySelector('#save-art').addEventListener('click', async (e) => {
    if (!artList.some((a) => a.active)) {
      showMsg(artMsg, 'Tem de ficar pelo menos um artigo ativo.', 'error');
      return;
    }
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'A guardar…';
    try {
      await saveSettings({ equipment_articles: artList });
      showMsg(artMsg, 'Artigos guardados.', 'ok');
    } catch (err) {
      showMsg(artMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar artigos';
    }
  });
  }

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
