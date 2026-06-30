// Vista: Definições. Época e meta editáveis + backup (exportar/importar).

import { state, saveSettings, snapshot, replaceAllData, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { escaloes } from '../compute.js';
import { confirmDialog } from '../modal.js';

export function renderDefinicoes(container) {
  const { season, goal } = state.settings;

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
    a.download = `central-rcs-backup-${stamp}.json`;
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
      showMsg(backupMsg, 'O ficheiro não parece ser um backup da Central RCS.', 'error');
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
