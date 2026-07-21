// Vista: Definições. Época e meta editáveis + backup (exportar/importar).

import { state, saveSettings, snapshot, replaceAllData, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { isCoordenador } from '../permissions.js';
import { escaloes, positions, sport } from '../compute.js';
import { SPORTS, SPORT_POSITIONS } from '../constants.js';
import { confirmDialog } from '../modal.js';
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
  if (activeTab === 'backup' && !coordenador) activeTab = 'identidade';
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
        ${coordenador ? tabBtn('backup', 'Cópia de segurança') : ''}
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
    </div>
    </div>

    ${coordenador ? `
    <div class="${panelClass('backup')}" data-panel="backup">
    <div class="settings-stack">
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Cópia de segurança</h2>
      <p class="muted" style="margin-top:0">
        Exporta todos os dados para um ficheiro <code>.json</code>, ou importa um backup anterior.
      </p>
      <div class="row row--wrap" style="gap:0.6rem">
        <button class="btn btn--ghost" id="export-btn" type="button">Exportar backup</button>
        <label class="btn btn--ghost" for="import-file" style="cursor:pointer">Importar backup</label>
        <input type="file" id="import-file" accept="application/json,.json" class="hidden" />
      </div>
      <p class="settings-msg hidden" id="backup-msg"></p>
      <p class="muted settings-warn">
        ⚠ A importação <strong>substitui</strong> todos os dados atuais pelos do ficheiro.
      </p>
    </section>
    </div>
    </div>` : ''}
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

  // --- Exportar --- (a cópia de segurança é exclusiva do coordenador)
  container.querySelector('#export-btn')?.addEventListener('click', () => {
    const data = JSON.stringify(snapshot(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `rumia-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // --- Importar ---
  const backupMsg = container.querySelector('#backup-msg');
  container.querySelector('#import-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite reimportar o mesmo ficheiro
    if (!file) return;

    let backup;
    try {
      backup = JSON.parse(await file.text());
    } catch {
      showMsg(backupMsg, 'O ficheiro não é um backup válido (JSON ilegível).', 'error');
      return;
    }
    if (!backup || typeof backup !== 'object' || !('sponsors' in backup)) {
      showMsg(backupMsg, 'O ficheiro não parece ser um backup da Rumia.', 'error');
      return;
    }

    const ok = await confirmDialog(
      'Importar este backup vai SUBSTITUIR todos os dados atuais. Queres continuar?',
      { confirmLabel: 'Importar', danger: true }
    );
    if (!ok) return;

    showMsg(backupMsg, 'A importar…', 'info');
    try {
      await replaceAllData(backup);
      showMsg(backupMsg, 'Backup importado com sucesso.', 'ok');
    } catch (err) {
      showMsg(backupMsg, dbErrorMessage(err), 'error');
    }
  });
}

function showMsg(el, text, kind) {
  el.textContent = text;
  el.className = `settings-msg settings-msg--${kind}`;
}
