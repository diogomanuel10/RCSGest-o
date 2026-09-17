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
  } else if (field.type === 'checks') {
    // Lista de caixas de seleção com o MESMO nome: é a forma de um campo
    // responder "estas e não as outras" (que atletas entram nesta sessão de
    // musculação). Um `<select multiple>` não serve — num telemóvel obriga a
    // arrastar com o dedo dentro de uma caixa de 100px e a acertar em vinte
    // nomes sem os ver todos.
    const options = field.options || [];
    const chosen = new Set((Array.isArray(v) ? v : []).map(String));
    const boxes = options
      .map((o, i) => {
        const key = typeof o === 'string' ? o : o.key;
        const label = typeof o === 'string' ? o : o.label;
        const meta = typeof o === 'string' ? '' : o.meta || '';
        const on = chosen.has(String(key)) ? 'checked' : '';
        return `<label class="check-item" for="${id}-${i}">
            <input type="checkbox" id="${id}-${i}" name="${field.name}"
                   value="${esc(key)}" ${on} />
            <span>${esc(label)}${meta ? ` <span class="muted">${esc(meta)}</span>` : ''}</span>
          </label>`;
      })
      .join('');
    control = options.length
      ? `<div class="check-list" id="${id}" data-checks="${field.name}">
           <div class="check-list__bar">
             <button type="button" class="btn btn--ghost btn--sm" data-check-all="${field.name}">Todas</button>
             <button type="button" class="btn btn--ghost btn--sm" data-check-none="${field.name}">Nenhuma</button>
             <span class="muted check-list__count" data-check-count="${field.name}"></span>
           </div>
           ${boxes}
         </div>`
      : `<p class="muted" id="${id}">${esc(field.emptyText || 'Sem opções disponíveis.')}</p>`;
  } else if (field.type === 'file') {
    control = `<input type="file" id="${id}" name="${field.name}" ${required}
      accept="${esc(field.accept || '*/*')}" style="padding:0.25rem 0" />`;
  } else {
    const type = field.type || 'text';
    control = `<input type="${type}" id="${id}" name="${field.name}" ${required}
      value="${esc(v)}" placeholder="${esc(field.placeholder || '')}" />`;
  }

  const span = field.full ? ' field--full' : '';
  // Miniatura ilustrativa ao lado da etiqueta (a foto de um artigo de
  // equipamento). É `alt=""` de propósito: a imagem repete o que a etiqueta
  // já diz, e anunciá-la duas vezes a quem usa leitor de ecrã é ruído. Falha
  // em silêncio se o ficheiro não carregar — um campo sem foto continua a
  // ser um campo que se responde.
  //
  // É um BOTÃO e não uma imagem solta: 56px de casaco preto não distinguem
  // um blusão de uma sweat, que é precisamente a pergunta que a foto veio
  // responder. Clicar abre-a por inteiro (`openImageViewer`) — e sendo botão,
  // quem navega por teclado chega lá e o leitor de ecrã anuncia o que faz.
  const image = field.image
    ? `<button type="button" class="field__image" data-zoom-src="${esc(field.image)}"
               data-zoom-label="${esc(field.label)}"
               aria-label="Ver a foto: ${esc(field.label)}">
         <img src="${esc(field.image)}" alt="" loading="lazy"
              onerror="this.closest('.field__image').remove()" />
       </button>`
    : '';
  // `hint` explica o campo por baixo do controlo (ligado por aria-describedby,
  // para os leitores de ecrã o anunciarem junto com a etiqueta).
  const hint = field.hint
    ? `<p class="field__hint muted" id="${id}-hint">${esc(field.hint)}</p>`
    : '';
  const described = field.hint ? ` aria-describedby="${id}-hint"` : '';
  const main = described ? control.replace(/^(<\w+)/, `$1${described}`) : control;

  // `qty` põe uma quantidade pequena ao lado do controlo principal, no mesmo
  // campo: são duas respostas sobre a MESMA coisa (que tamanho, quantas), e
  // um campo à parte por artigo duplicava o formulário do portal. Vale por si
  // no FormData — é um `input` com nome próprio.
  const qty = field.qty
    ? `<div class="field__controls">
         ${main}
         <input type="number" class="field__qty" name="${esc(field.qty.name)}"
                min="1" max="${field.qty.max || 50}" step="1"
                value="${esc(field.qty.default ?? 1)}"
                aria-label="Quantidade — ${esc(field.label)}" />
       </div>`
    : main;

  // Um grupo de caixas não tem um controlo único para o `for` apontar: a
  // etiqueta é do CONJUNTO, e um `<label for>` a apontar para uma `<div>` não
  // liga nada (e é anunciado como se ligasse).
  const labelTag = field.type === 'checks'
    ? `<span class="field__label">${esc(field.label)}${field.required ? ' <span class="field__req" title="Obrigatório">*</span>' : ''}</span>`
    : `<label for="${id}">${esc(field.label)}${
        field.required ? ' <span class="field__req" title="Obrigatório">*</span>' : ''
      }</label>`;

  return `<div class="field${span}${field.image ? ' field--with-image' : ''}" data-field="${field.name}">
    ${image}
    ${labelTag}
    ${qty}
    ${hint}
  </div>`;
}

// Valores do formulário. `Object.fromEntries` colapsa nomes repetidos no
// último, por isso os campos `checks` — que são N caixas com o mesmo nome —
// são lidos à parte, com `getAll`, e chegam ao `onSubmit` como array.
function readValues(form, fields) {
  const data = new FormData(form);
  const values = Object.fromEntries(data.entries());
  fields.filter((f) => f.type === 'checks').forEach((f) => {
    values[f.name] = data.getAll(f.name);
  });
  return values;
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

// Dá a um diálogo construído à mão a mesma moldura do `openModal`: entra na
// pilha partilhada (só o do topo reage ao Escape), prende o Tab lá dentro,
// devolve o foco ao elemento de origem e fecha no X, no Escape e no clique
// fora.
//
// Existe porque dezoito diálogos espalhados pelas vistas reimplementavam cada
// um a parte de que se lembraram: uns sem Escape, outros sem devolver o foco,
// nenhum a prender o Tab. Para quem navega por teclado, a app tinha duas
// personalidades conforme o ecrã em que estava. O `openModal` não servia
// aqui — é orientado a campos de formulário, e estes têm corpo livre.
//
// O `overlay` chega já montado em memória (com o seu HTML) e é esta função
// que o insere no documento. Devolve o `close()`.
export function wireDialog(overlay, { onClose, initialFocus } = {}) {
  document.body.appendChild(overlay);
  pushOverlay(overlay);
  const releaseFocus = trapFocus(overlay);

  const first =
    (typeof initialFocus === 'string' ? overlay.querySelector(initialFocus) : initialFocus) ||
    overlay.querySelector('.modal__close') ||
    focusables(overlay)[0];
  first?.focus();

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    // Pela pilha, e não com um `classList.remove('no-scroll')` direto: fechar
    // um diálogo aberto por cima de outro devolvia o scroll à página com o de
    // baixo ainda aberto.
    popOverlay(overlay);
    releaseFocus();
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape' && isTop(overlay)) close();
  }
  document.addEventListener('keydown', onKey);

  overlay.querySelector('.modal__close')?.addEventListener('click', close);
  // `mousedown` e não `click`: com `click`, um arrasto que comece dentro do
  // diálogo e acabe fora fechava-o a meio de uma seleção de texto.
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });

  return close;
}

// Abre um modal com um formulário. `onSubmit(values)` pode lançar erro
// (mostrado no topo do formulário) ou devolver para fechar.
// `intro` é uma frase sobre o FORMULÁRIO inteiro (como se preenche, o que é
// que cada coisa significa), no topo e antes do primeiro campo. Existe porque
// o `hint` é de um campo: a instrução do formulário de pedir equipamento
// ("escolhe o tamanho do que precisas e deixa em branco o resto") estava
// pendurada no primeiro artigo e lia-se como se fosse só sobre esse artigo.
export function openModal({
  title, intro = '', fields, values = {}, submitLabel = 'Guardar', onSubmit, onFieldChange,
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
        ${intro ? `<p class="modal__intro muted">${esc(intro)}</p>` : ''}
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

  // Campos `checks`: "Todas"/"Nenhuma" e o contador. Sem o contador, uma lista
  // de vinte nomes meio marcada não diz quantos ficaram — e o número é
  // exatamente o que se está a decidir (quantas atletas naquele horário).
  form.querySelectorAll('[data-checks]').forEach((list) => {
    const name = list.dataset.checks;
    const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
    const countEl = list.querySelector(`[data-check-count="${name}"]`);
    const refresh = () => {
      const n = boxes.filter((b) => b.checked).length;
      if (countEl) countEl.textContent = `${n} de ${boxes.length} selecionada${boxes.length === 1 ? '' : 's'}`;
    };
    list.querySelector(`[data-check-all="${name}"]`)
      ?.addEventListener('click', () => { boxes.forEach((b) => { b.checked = true; }); refresh(); });
    list.querySelector(`[data-check-none="${name}"]`)
      ?.addEventListener('click', () => { boxes.forEach((b) => { b.checked = false; }); refresh(); });
    boxes.forEach((b) => b.addEventListener('change', refresh));
    refresh();
  });

  // Campos marcados com `reactive: true` avisam assim que mudam, para a vista
  // poder reconstruir o formulário (ex.: mudar o tipo de objetivo troca os
  // campos seguintes). Reconstruir só na gravação não serve: os campos
  // obrigatórios ainda por preencher bloqueiam o submit antes de lá chegar.
  if (onFieldChange) {
    fields.filter((f) => f.reactive).forEach((f) => {
      form.querySelector(`[name="${f.name}"]`)?.addEventListener('change', () => {
        onFieldChange(f.name, readValues(form, fields));
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
    const values = readValues(form, fields);

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

// --- Ver uma imagem por inteiro ------------------------------------------
//
// A miniatura de 56px ao lado de um campo (a foto do artigo de equipamento)
// serve para reconhecer o que já se conhece; não serve para escolher entre
// "Blusão" e "Casaco Fato de Treino", que é o que a atleta faz no portal.
// Escolher o artigo errado gasta um pedido, uma decisão e uma entrega.
//
// Usa a mesma moldura de todos os outros diálogos (`wireDialog`): entra na
// pilha, fecha no Escape, no X e no clique fora, e devolve o foco à miniatura
// de onde saiu. Fica ACIMA do modal (z-index 350) e abaixo dos toasts — abre-se
// de dentro de um formulário, e um visualizador por baixo do formulário não se
// via.
export function openImageViewer(src, label = '') {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay imgview';
  overlay.innerHTML = `
    <div class="imgview__box" role="dialog" aria-modal="true"
         aria-label="${esc(label || 'Imagem')}">
      <button class="modal__close imgview__close" aria-label="Fechar" type="button">&times;</button>
      <img class="imgview__img" src="${esc(src)}" alt="${esc(label)}" />
      ${label ? `<p class="imgview__caption">${esc(label)}</p>` : ''}
    </div>
  `;
  return wireDialog(overlay, { initialFocus: '.imgview__close' });
}

// Uma miniatura é ampliável esteja onde estiver — num campo de formulário, numa
// lista de pedidos, numa ficha. Ligar isto vista a vista era vinte sítios para
// alguém se esquecer (e há miniaturas que nascem dentro de modais, muito depois
// do primeiro desenho), por isso o clique é apanhado uma vez no documento, na
// mesma lógica do `initTableLabels`.
let zoomWired = false;
export function initImageZoom() {
  if (zoomWired) return;
  zoomWired = true;
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-zoom-src]');
    if (!el) return;
    e.preventDefault();
    openImageViewer(el.dataset.zoomSrc, el.dataset.zoomLabel || '');
  });
}
