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
      <strong>Algo correu mal</strong>
      <p>${esc(message)}</p>
    </div>
  `;
}

// Estado vazio (sem dados ainda).
export function emptyHTML(message) {
  return `<div class="state"><p>${esc(message)}</p></div>`;
}
