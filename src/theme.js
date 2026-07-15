// Tema da aplicação: fixo em claro.
//
// A app usa apenas o tema claro. Stampamos `data-theme="light"` no <html>
// para forçar o tema claro mesmo que o sistema operativo esteja em modo
// escuro (o CSS respeita esta escolha explícita em style.css).

import { reapplyPalette } from './branding.js';

// Aplica o tema claro ao documento e reaplica a paleta da marca.
export function applyTheme() {
  document.documentElement.setAttribute('data-theme', 'light');
  reapplyPalette();
}
