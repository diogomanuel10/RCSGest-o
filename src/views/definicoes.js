// Vista: Definições. Época e meta editáveis + backup (exportar/importar).

import { state, saveSettings, snapshot, replaceAllData, dbErrorMessage } from '../store.js';
import { esc } from '../ui.js';
import { confirmDialog } from '../modal.js';

export function renderDefinicoes(container) {
  const { season, goal } = state.settings;

  container.innerHTML = `
    <header class="page-head"><h1 class="section-title">Definições</h1></header>

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
        </div>
        <p class="settings-msg hidden" id="settings-msg"></p>
        <div class="row" style="justify-content:flex-end">
          <button type="submit" class="btn btn--primary" id="save-settings">Guardar</button>
        </div>
      </form>
    </section>

    <section class="card settings-card">
      <h2 class="section-title settings-card__title">Cópia de segurança</h2>
      <p class="muted">
        Exporta todos os dados (patrocínios, plantéis, calendário e treinadores)
        para um ficheiro <code>.json</code>, ou importa um backup anterior.
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
      });
      showMsg(settingsMsg, 'Definições guardadas.', 'ok');
    } catch (err) {
      showMsg(settingsMsg, dbErrorMessage(err), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Guardar';
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
