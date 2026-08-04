// Modal reutilizável com formulário, e diálogo de confirmação.
// Todas as vistas usam isto para adicionar / editar / remover.

import { esc } from './ui.js';

// Pilha de diálogos abertos. Só o do topo reage ao Escape — sem isto, cancelar
// o aviso de "alterações por guardar" fechava também o formulário por trás.
const stack = [];
const isTop = (overlay) => stack[stack.length - 1] === overlay;

function pushOverlay(overlay) {
  stack.push(overlay);
  document.body.classList.add('no-scroll');
}

function popOverlay(overlay) {
  const i = stack.indexOf(overlay);
  if (i !== -1) stack.splice(i, 1);
  if (!stack.length) document.body.classList.remove('no-scroll');
}

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
  // `hint` explica o campo por baixo do controlo (ligado por aria-describedby,
  // para os leitores de ecrã o anunciarem junto com a etiqueta).
  const hint = field.hint
    ? `<p class="field__hint muted" id="${id}-hint">${esc(field.hint)}</p>`
    : '';
  const described = field.hint ? ` aria-describedby="${id}-hint"` : '';
  return `<div class="field${span}" data-field="${field.name}">
    <label for="${id}">${esc(field.label)}${
      field.required ? ' <span class="field__req" title="Obrigatório">*</span>' : ''
    }</label>
    ${described ? control.replace(/^(<\w+)/, `$1${described}`) : control}
    ${hint}
  </div>`;
}

// Elementos que podem receber foco dentro de um contentor, pela ordem do DOM.
function focusables(root) {
  return [...root.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

// Mantém o Tab dentro do diálogo (requisito de acessibilidade dos modais) e
// devolve o foco ao elemento de origem quando fecha.
function trapFocus(overlay) {
  const previous = document.activeElement;
  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const items = focusables(overlay);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  overlay.addEventListener('keydown', onKeydown);
  return () => {
    overlay.removeEventListener('keydown', onKeydown);
    if (previous && document.contains(previous)) previous.focus();
  };
}

// Abre um modal com um formulário. `onSubmit(values)` pode lançar erro
// (mostrado no topo do formulário) ou devolver para fechar.
export function openModal({
  title, fields, values = {}, submitLabel = 'Guardar', onSubmit, onFieldChange,
}) {
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
  pushOverlay(overlay);

  const form = overlay.querySelector('form');
  const errorEl = overlay.querySelector('.modal__error');
  const submitBtn = overlay.querySelector('[data-submit]');
  const releaseFocus = trapFocus(overlay);

  // Foco no primeiro campo.
  const firstInput = form.querySelector('input, select, textarea');
  firstInput?.focus();

  // Campos marcados com `reactive: true` avisam assim que mudam, para a vista
  // poder reconstruir o formulário (ex.: mudar o tipo de objetivo troca os
  // campos seguintes). Reconstruir só na gravação não serve: os campos
  // obrigatórios ainda por preencher bloqueiam o submit antes de lá chegar.
  if (onFieldChange) {
    fields.filter((f) => f.reactive).forEach((f) => {
      form.querySelector(`[name="${f.name}"]`)?.addEventListener('change', () => {
        const current = Object.fromEntries(new FormData(form).entries());
        onFieldChange(f.name, current);
      });
    });
  }

  // Instantâneo do formulário ao abrir, para detetar alterações por gravar.
  const initial = new URLSearchParams(new FormData(form)).toString();
  const isDirty = () =>
    new URLSearchParams(new FormData(form)).toString() !== initial;

  function close() {
    releaseFocus();
    overlay.remove();
    popOverlay(overlay);
    document.removeEventListener('keydown', onKey);
  }

  // Fechar com alterações por gravar pede confirmação — fechar sem querer
  // (Escape ou clique fora) é a forma mais fácil de perder trabalho.
  async function requestClose() {
    if (!isDirty()) return close();
    const ok = await confirmDialog(
      'Tens alterações por guardar. Queres fechar e perdê-las?',
      { confirmLabel: 'Fechar sem guardar', danger: true }
    );
    if (ok) close();
  }

  function onKey(e) {
    // Só o modal mais acima reage ao Escape (evita fechar o formulário quando
    // se cancela o diálogo de confirmação que ele próprio abriu).
    if (e.key !== 'Escape' || !isTop(overlay)) return;
    requestClose();
  }
  document.addEventListener('keydown', onKey);

  overlay.querySelector('.modal__close').addEventListener('click', requestClose);
  overlay.querySelector('[data-cancel]').addEventListener('click', requestClose);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) requestClose();
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
      // Leva o utilizador ao erro — num formulário longo, uma mensagem no topo
      // fora do ecrã passa despercebida e parece que o botão não fez nada.
      errorEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
    pushOverlay(overlay);
    const releaseFocus = trapFocus(overlay);

    function done(result) {
      releaseFocus();
      overlay.remove();
      popOverlay(overlay);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }

    // Escape cancela — a saída segura, coerente com o botão «Cancelar».
    function onKey(e) {
      if (e.key === 'Escape' && isTop(overlay)) done(false);
    }
    document.addEventListener('keydown', onKey);

    overlay.querySelector('[data-no]').addEventListener('click', () => done(false));
    overlay.querySelector('[data-yes]').addEventListener('click', () => done(true));
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay) done(false);
    });
    // Foco no «Cancelar»: numa ação destrutiva, o Enter reflexo não deve
    // confirmar. Quem quer mesmo remover carrega no botão ou faz Tab.
    overlay.querySelector('[data-no]').focus();
  });
}
