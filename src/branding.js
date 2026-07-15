// Personalização da marca (white-label).
//
// Permite ao coordenador dar a cara do seu clube à aplicação: cores, emblema e
// textos (nome da app, nome do clube, lema). Os valores vivem na tabela
// `settings` (BD) e são aplicados em runtime — como variáveis CSS no
// documento, como logótipo e como títulos.
//
// Guardamos ainda uma cópia da última marca em localStorage para conseguir
// pintar o ecrã de login (que corre sem sessão, logo sem acesso à BD) já com a
// identidade do clube, em vez do arranque genérico.

// Logótipo por omissão da aplicação. O ficheiro vive em `public/logo.png` e é
// servido diretamente em `/logo.png` (não precisa de import/bundling). É o que
// aparece antes de um clube personalizar o seu emblema.
const defaultLogoUrl = '/logo.png';

const STORAGE_KEY = 'rcs.branding';

// Valores por omissão (a marca do produto, Rumia). Servem de recurso de
// segurança quando algo está vazio ou inválido, e são o que um clube novo vê
// antes de personalizar.
export const DEFAULT_BRANDING = {
  club_name: 'Rumia',
  app_name: 'Rumia',
  motto: 'A tua gestão desportiva, simples',
  brand_primary: '#143b61',
  brand_accent: '#f2b705',
  logo: null,
};

let current = { ...DEFAULT_BRANDING };

// Marca em vigor (já normalizada). As vistas leem daqui para os textos.
export function branding() {
  return current;
}

// URL do emblema a mostrar: o personalizado (data URL guardado) ou o de origem.
export function logoSrc() {
  return current.logo || defaultLogoUrl;
}

// Emblema de origem (o SVG do pacote), para pré-visualizar o "repor original".
export const defaultLogo = defaultLogoUrl;

// --- Utilitários de cor (hex) --------------------------------------------

function clamp(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

// Aceita '#rgb' ou '#rrggbb'. Devolve [r,g,b] ou null se inválido.
export function parseHex(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

// Mistura `hex` com `target` na proporção `amt` (0–1). Usado para derivar os
// tons mais claros/escuros a partir da cor base do clube.
function mix(hex, target, amt) {
  const a = parseHex(hex);
  const b = parseHex(target);
  if (!a || !b) return hex;
  return toHex(a.map((v, i) => v + (b[i] - v) * amt));
}

// O tema em vigor é escuro? Lê o data-theme (definido por theme.js) e, na sua
// ausência ('auto'), o prefers-color-scheme do sistema.
function isDarkTheme() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

// Aplica a paleta ao documento, derivando os tons da cor primária/destaque.
// Mantém alinhado com os tokens definidos em style.css (:root). As tintas
// CLARAS (--navy-100/-300, usadas como fundos suaves) derivam para branco no
// tema claro e para um tom escuro no tema escuro, para funcionarem nos dois.
function applyPalette(primary, accent) {
  const s = document.documentElement.style;
  const p = parseHex(primary) ? primary : DEFAULT_BRANDING.brand_primary;
  const a = parseHex(accent) ? accent : DEFAULT_BRANDING.brand_accent;
  const dark = isDarkTheme();
  const softTint = dark ? '#141c26' : '#ffffff';

  s.setProperty('--navy', p);
  s.setProperty('--navy-700', mix(p, '#000000', 0.22));
  s.setProperty('--navy-500', mix(p, '#ffffff', 0.16));
  s.setProperty('--navy-300', mix(p, softTint, dark ? 0.48 : 0.34));
  s.setProperty('--navy-100', mix(p, softTint, dark ? 0.80 : 0.88));
  s.setProperty('--yellow', a);
  s.setProperty('--yellow-600', mix(a, '#000000', 0.16));
}

// Reaplica a paleta com a marca atual (usado ao trocar de tema).
export function reapplyPalette() {
  applyPalette(current.brand_primary, current.brand_accent);
}

// Normaliza um objeto de definições para uma marca completa e válida.
function normalize(settings) {
  const s = settings || {};
  return {
    club_name: (s.club_name || '').trim() || DEFAULT_BRANDING.club_name,
    app_name: (s.app_name || '').trim() || DEFAULT_BRANDING.app_name,
    motto: (s.motto || '').trim() || DEFAULT_BRANDING.motto,
    brand_primary: parseHex(s.brand_primary) ? s.brand_primary : DEFAULT_BRANDING.brand_primary,
    brand_accent: parseHex(s.brand_accent) ? s.brand_accent : DEFAULT_BRANDING.brand_accent,
    logo: s.logo || null,
  };
}

// Aplica a marca a partir das definições (cores, título, meta theme-color) e
// guarda-a em cache para o próximo arranque.
export function applyBranding(settings) {
  current = normalize(settings);
  applyPalette(current.brand_primary, current.brand_accent);
  document.title = current.app_name;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', current.brand_primary);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* localStorage indisponível (modo privado): a marca aplica-se na mesma */
  }
}

// Aplica a última marca conhecida (localStorage). Chamado no arranque, antes de
// haver sessão, para o ecrã de login já surgir com a identidade do clube.
export function applyCachedBranding() {
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    cached = null;
  }
  applyBranding(cached || DEFAULT_BRANDING);
}
