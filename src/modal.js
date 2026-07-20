// Modal reutilizável com formulário, e diálogo de confirmação.
// Todas as vistas usam isto para adicionar / editar / remover.

import { esc } from './ui.js';

let openCount = 0;

// Constrói o HTML de um campo a partir da sua definição.
function fieldHTML(field, value) {
  const v = value ?? field.default ?? '';
  const id = `f-${field.name}`;
  const required = field.required ? 'required' : '';
  let control;

  if (field.type === 'textarea') {
    control = `<textarea id="${id}" name="${field.name}" ${required}
      placeholder="${esc(field.placeholder || '')}">${esc(v)}</textarea>`;
  } else if (field.type === 'select') {
    const options = field.options || [];
    const keys = options.map((o) => (typeof o === 'string' ? o : o.key));
    const opts = options
      .map((o) => {
        const key = typeof o === 'string' ? o : o.key;
        const label = typeof o === 'string' ? o : o.label;
        const sel = String(key) === String(v) ? 'selected' : '';
        return `<option value="${esc(key)}" ${sel}>${esc(label)}</option>`;
      })
      .join('');
    // Valor guardado que já não consta das opções (ex.: posição de uma
    // modalidade anterior). Preserva-o como opção "atual" já selecionada, para
    // que editar o registo nunca o sobrescreva silenciosamente.
    const orphan =
      v && !keys.some((k) => String(k) === String(v))
        ? `<option value="${esc(v)}" selected>${esc(v)} (atual)</option>`
        : '';
    const placeholder = field.placeholder
      ? `<option value="" ${v ? '' : 'selected'}>${esc(field.placeholder)}</option>`
      : '';
    control = `<select id="${id}" name="${field.name}" ${required}>${placeholder}${orphan}${opts}</select>`;
  } else if (field.type === 'file') {
    control = `<input type="file" id="${id}" name="${field.name}" ${required}
      accept="${esc(field.accept || '*/*')}" style="padding:0.25rem 0" />`;
  } else {
    const type = field.type || 'text';
    control = `<input type="${type}" id="${id}" name="${field.name}" ${required}
      value="${esc(v)}" placeholder="${esc(field.placeholder || '')}" />`;
  }

  const span = field.full ? ' field--full' : '';
  return `<div class="field${span}" data-field="${field.name}">
    <label for="${id}">${esc(field.label)}${field.required ? ' *' : ''}</label>
    ${control}
  </div>`;
}

// Abre um modal com um formulário. `onSubmit(values)` pode lançar erro
// (mostrado no topo do formulário) ou devolver para fechar.
export function openModal({ title, fields, values = {}, submitLabel = 'Guardar', onSubmit }) {
  openCount++;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal card" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal__head">
        <h2 class="section-title">${esc(title)}</h2>
        <button class="modal__close" aria-label="Fechar" type="button">&times;</button>
      </div>
      <form class="modal__form">
        <p class="modal__error hidden" role="alert"></p>
        <div class="field-grid">
          ${fields.map((f) => fieldHTML(f, values[f.name])).join('')}
        </div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-cancel>Cancelar</button>
          <button type="submit" class="btn btn--primary" data-submit>${esc(submitLabel)}</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const form = overlay.querySelector('form');
  const errorEl = overlay.querySelector('.modal__error');
  const submitBtn = overlay.querySelector('[data-submit]');

  // Foco no primeiro campo.
  const firstInput = form.querySelector('input, select, textarea');
  firstInput?.focus();

  function close() {
    overlay.remove();
    openCount--;
    if (openCount === 0) document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  document.addEventListener('keydown', onKey);

  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.classList.add('hidden');
    const values = Object.fromEntries(new FormData(form).entries());

    submitBtn.disabled = true;
    submitBtn.textContent = 'A guardar…';
    try {
      await onSubmit(values);
      close();
    } catch (err) {
      errorEl.textContent = err.message || 'Não foi possível guardar.';
      errorEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = submitLabel;
    }
  });

  return close;
}

// Diálogo de confirmação simples (para remoções). Devolve uma Promise<boolean>.
export function confirmDialog(message, { confirmLabel = 'Remover', danger = true } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal card modal--confirm" role="alertdialog" aria-modal="true">
        <p class="modal__confirm-text">${esc(message)}</p>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-no>Cancelar</button>
          <button type="button" class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-yes>
            ${esc(confirmLabel)}
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');

    function done(result) {
      overlay.remove();
      document.body.classList.remove('no-scroll');
      resolve(result);
    }
    overlay.querySelector('[data-no]').addEventListener('click', () => done(false));
    overlay.querySelector('[data-yes]').addEventListener('click', () => done(true));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) done(false);
    });
    overlay.querySelector('[data-yes]').focus();
  });
}
