// Vista: Definições. Época e meta editáveis + backup (exportar/importar).

import { state, saveSettings, snapshot, replaceAllData, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { escaloes } from '../compute.js';
import { confirmDialog } from '../modal.js';
import { branding, logoSrc, defaultLogo, parseHex, DEFAULT_BRANDING } from '../branding.js';

// Limite do emblema guardado (data URL na linha de definições). Mantém a linha
// pequena e o carregamento rápido.
const MAX_LOGO_BYTES = 256 * 1024;

export function renderDefinicoes(container) {
  const { season, goal } = state.settings;
  const b = branding();

  container.innerHTML = `
    <header class="page-head">
      <div>
        <h1 class="section-title">Definições</h1>
        <p class="muted" style="margin:0;font-size:0.88rem">Época, escalões e cópia de segurança</p>
      </div>
    </header>

    <div class="settings-grid">
    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Época e meta</h2>
      <form id="settings-form">
        <div class="field-grid">
          <div class="field">
            <label for="season">Época</label>
            <input type="text" id="season" name="season" value="${esc(season)}"
                   placeholder="2026/2027" pattern="\\d{4}/\\d{4}" required />
          </div>
          <div class="field">
            <label for="goal">Meta da época (€)</label>
            <input type="number" id="goal" name="goal" value="${esc(goal)}" min="0" step="100" required />
          </div>
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

    <section class="card settings-card settings-card--wide">
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

    <details class="card settings-card">
      <summary class="section-title settings-card__title" style="cursor:pointer;list-style:none">
        Cópia de segurança
        <span class="muted" style="font-size:0.82rem;font-weight:normal;margin-left:0.5rem">▸ avançado</span>
      </summary>
      <p class="muted" style="margin-top:0.75rem">
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
    </details>
    </div>
  `;

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
        season: form.season.value.trim(),
        goal: parseInt(form.goal.value, 10) || 0,
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

  // --- Exportar ---
  container.querySelector('#export-btn').addEventListener('click', () => {
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
  container.querySelector('#import-file').addEventListener('change', async (e) => {
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
