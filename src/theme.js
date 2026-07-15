// Tema claro / escuro / automático.
//
// Guarda a preferência do utilizador em localStorage e aplica-a stampando
// `data-theme` no <html> (que sobrepõe o prefers-color-scheme do sistema).
// 'auto' remove o atributo e deixa o sistema decidir. Ao mudar de tema,
// reaplica a paleta da marca (as tintas claras derivadas mudam conforme o tema).

import { reapplyPalette } from './branding.js';

const STORAGE_KEY = 'rcs.theme';
export const THEMES = ['light', 'dark', 'auto'];

export function getTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(t) ? t : 'auto';
  } catch {
    return 'auto';
  }
}

// Tema efetivamente em vigor ('light' | 'dark'), resolvendo o 'auto'.
export function resolvedTheme() {
  const t = getTheme();
  if (t !== 'auto') return t;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// Aplica o tema atual ao documento e reaplica a paleta da marca.
export function applyTheme() {
  const t = getTheme();
  const root = document.documentElement;
  if (t === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  reapplyPalette();
}

export function setTheme(t) {
  try {
    localStorage.setItem(STORAGE_KEY, THEMES.includes(t) ? t : 'auto');
  } catch {
    /* localStorage indisponível: o tema aplica-se na mesma nesta sessão */
  }
  applyTheme();
}

// Alterna Claro → Escuro → Automático.
export function cycleTheme() {
  const i = THEMES.indexOf(getTheme());
  setTheme(THEMES[(i + 1) % THEMES.length]);
  return getTheme();
}

// Reage a mudanças do sistema quando estamos em 'auto'.
if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'auto') applyTheme();
  });
}
