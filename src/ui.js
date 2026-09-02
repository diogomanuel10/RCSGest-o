// Pequenos utilitários de interface partilhados por várias vistas.

// Emblema de origem servido de public/ (URL na raiz), não importado como asset.
const logoUrl = '/logo.png';

export { logoUrl };

// Escapa texto para inserção segura em HTML (evita partir o layout com < > & ").
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Formata um valor em euros (ex.: 3000 -> "3 000 €").
export function euros(value) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

// Estado de "a carregar" reutilizável.
export function loadingHTML(message = 'A carregar…') {
  return `
    <div class="state" role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <p>${esc(message)}</p>
    </div>
  `;
}

// Estado de erro com tom da interface (diz o que falhou).
export function errorHTML(message) {
  return `
    <div class="state state--error" role="alert">
      <span class="state__icon" aria-hidden="true">⚠</span>
      <strong>Algo correu mal</strong>
      <p>${esc(message)}</p>
    </div>
  `;
}

// Estado vazio (sem dados ainda).
//
// `action` desenha o botão que RESOLVE o vazio, ali mesmo. Sem ele, o ecrã
// que um clube novo vê mais vezes na primeira sessão é um beco: diz "ainda
// não há equipas" e obriga a procurar, noutro canto do ecrã, o botão que as
// cria. `icone` troca o 📂 genérico — uma agenda vazia e um inventário vazio
// não são o mesmo problema.
//
// A ação vai como `data-empty-action="<chave>"` e não como `onClick`: as
// vistas escrevem HTML em `innerHTML` e ligam os eventos depois (o padrão de
// `views/*.js`), por isso uma função passada aqui não teria como sobreviver
// à serialização.
export function emptyHTML(message, { icone = '📂', action = null } = {}) {
  return `
    <div class="state">
      <span class="state__icon" aria-hidden="true">${esc(icone)}</span>
      <p>${esc(message)}</p>
      ${action
        ? `<button class="btn btn--accent btn--sm" type="button"
                   data-empty-action="${esc(action.key)}">${esc(action.label)}</button>`
        : ''}
    </div>
  `;
}

// Liga o botão de um estado vazio criado com `action`.
export function wireEmptyAction(container, key, onClick) {
  container.querySelector(`[data-empty-action="${key}"]`)?.addEventListener('click', onClick);
}

// --- Ligações escritas por utilizadores ----------------------------------
// Um endereço escrito num campo de texto só chega a um href se for mesmo
// http(s): sem esta guarda, um `javascript:` colado no plano de treino
// corria no primeiro clique de quem o abrisse. Devolve o URL normalizado
// (sem esquema assume-se https://) ou null se não servir.
export function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return url.hostname ? url.href : null;
}

// Nome curto de uma ligação para mostrar ao lado do ícone (ex.: "youtube.com").
// O URL inteiro num cartão de exercício ocupa três linhas e não diz mais.
export function linkHost(value) {
  const url = safeUrl(value);
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// Matiz (HSL hue 0–359) estável derivada de um id — para dar a cada equipa
// uma cor consistente (ex.: nos eventos do calendário).
export function teamHue(id) {
  const s = String(id || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// --- Paginação «Anterior / Seguinte» -------------------------------------
// Padrão de uso nas vistas: manter a página atual numa variável do módulo,
// fatiar a lista com paginate(), inserir paginationHTML() e ligar com
// wirePagination(), que re-desenha ao mudar de página.

export const PAGE_SIZE = 12;

// Fatia uma lista para a página pedida, mantendo-a dentro dos limites.
// Devolve { items, page, totalPages, total, start, end }.
export function paginate(items, page = 1, size = PAGE_SIZE) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * size;
  const end = Math.min(start + size, total);
  return { items: items.slice(start, end), page: current, totalPages, total, start, end };
}

// Barra de paginação com contador (ex.: «1–12 de 48»). Não mostra nada se
// tudo cabe numa página. `id` distingue várias barras no mesmo ecrã.
export function paginationHTML({ page, totalPages, total, start, end, id = 'pg' }) {
  if (!total || totalPages <= 1) return '';
  return `
    <nav class="pagination" aria-label="Paginação" data-pagination="${esc(id)}">
      <button class="btn btn--ghost btn--sm" data-page-prev type="button" ${page <= 1 ? 'disabled' : ''} aria-label="Página anterior">‹ Anterior</button>
      <span class="pagination__info muted">${start + 1}–${end} de ${total}</span>
      <button class="btn btn--ghost btn--sm" data-page-next type="button" ${page >= totalPages ? 'disabled' : ''} aria-label="Página seguinte">Seguinte ›</button>
    </nav>
  `;
}

// ---------------------------------------------------------------------------
// Tabelas no telemóvel
// ---------------------------------------------------------------------------
// Uma tabela de sete colunas não cabe num ecrã de 360px, e a saída que a app
// tinha era sempre a mesma: `overflow-x` e o utilizador a deslizar para o lado
// para ver a coluna que lhe interessa. Ao lado do polegar isso não é uma
// tabela, é um puzzle — e quem marca presenças ou confere quotas fá-lo no
// telemóvel, à porta do pavilhão.
//
// Abaixo dos 640px cada linha passa a ser um cartão com "etiqueta: valor" (ver
// `.table--stack` no style.css). A etiqueta de cada célula é o cabeçalho da sua
// coluna — e é por isso que isto é JavaScript e não só CSS: o `content` do
// `::before` tem de sair de um atributo, e escrever `data-label` à mão em cada
// `<td>` de vinte vistas seria vinte sítios para alguém se esquecer de o pôr.
//
// Uma tabela que não deva empilhar (colunas fixas, matriz de números) marca-se
// com a classe `no-stack`.
function stampTable(table) {
  if (table.classList.contains('no-stack') || table.closest('.no-stack')) return;
  const heads = [...table.querySelectorAll(':scope > thead > tr > th')]
    .map((th) => th.textContent.trim());
  // Sem cabeçalho não há etiqueta possível — a tabela fica como está.
  if (!heads.some(Boolean)) return;
  table.classList.add('table--stack');
  table.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
    let col = 0;
    [...tr.children].forEach((cell) => {
      if (cell.tagName === 'TD') {
        const label = heads[col] || '';
        // Uma coluna sem título (a das ações) não ganha etiqueta: mostrá-la
        // vazia deixava um traço solto por cima dos botões.
        if (label) cell.setAttribute('data-label', label);
        else cell.removeAttribute('data-label');
      }
      col += Number(cell.getAttribute('colspan')) || 1;
    });
  });
}

// Percorre as tabelas de um pedaço do DOM e etiqueta-lhes as células.
export function stampTableLabels(root = document) {
  root.querySelectorAll?.('table').forEach(stampTable);
}

let tableObserver = null;

// As vistas escrevem `innerHTML` e só depois ligam os eventos, e há tabelas que
// nascem dentro de modais muito depois do primeiro desenho. Em vez de obrigar
// cada vista a lembrar-se de chamar isto, um observador trata de todas —
// registado uma só vez, mesmo que o shell seja montado outra vez.
export function initTableLabels() {
  stampTableLabels(document);
  if (tableObserver) return;
  let queued = false;
  tableObserver = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      stampTableLabels(document);
    });
  });
  // Só `childList`: o observador altera atributos das células, e observá-los
  // punha-o a acordar-se a si próprio em ciclo.
  tableObserver.observe(document.body, { childList: true, subtree: true });
}

// Liga os botões de uma barra de paginação. onChange(novaPagina) é chamado.
export function wirePagination(container, id, page, totalPages, onChange) {
  const nav = container.querySelector(`[data-pagination="${id}"]`);
  if (!nav) return;
  nav.querySelector('[data-page-prev]')?.addEventListener('click', () => {
    if (page > 1) onChange(page - 1);
  });
  nav.querySelector('[data-page-next]')?.addEventListener('click', () => {
    if (page < totalPages) onChange(page + 1);
  });
}
