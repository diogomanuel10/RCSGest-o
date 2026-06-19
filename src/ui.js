// Pequenos utilitários de interface partilhados por várias vistas.

import logoUrl from './assets/logo.svg';

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
export function emptyHTML(message) {
  return `
    <div class="state">
      <span class="state__icon" aria-hidden="true">📂</span>
      <p>${esc(message)}</p>
    </div>
  `;
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
