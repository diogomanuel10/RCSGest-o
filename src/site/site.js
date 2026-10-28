// Site público do clube (<clube>.rumia.pt).
//
// Não importa nada da app: nem o cliente do Supabase, nem o store, nem o
// design system. Quem abre isto é um pai no telemóvel, vindo de um link do
// Instagram, muitas vezes com dados móveis — e o que precisa são poucas
// chamadas `fetch` e uma página. Os dados vêm de RPCs públicas
// (`public_club_site`, `public_site_signup` e `public_shop_order`, ver
// `supabase/site-publico.sql` e `supabase/site-conteudo.sql`), que só
// devolvem o que é público.
//
// É UMA página com várias secções em rotas no hash (`#/calendario`,
// `#/equipas/<id>`…): os dados chegam todos numa chamada, por isso mudar de
// secção não espera pela rede, e cada endereço continua a ser partilhável.

import './site.css';

function cleanEnv(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '').trim();
}

const API_URL = cleanEnv(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
const API_KEY = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
// Domínio onde vivem os subdomínios dos clubes (clube.rumia.pt).
export const SITE_DOMAIN = cleanEnv(import.meta.env.VITE_SITE_DOMAIN) || 'rumia.pt';

const root = document.getElementById('site');

// Quantas linhas se mostram antes do "Mostrar mais". Uma época tem trinta
// jogos por escalão; a página inteira aberta era um scroll sem fim.
const RESULTS_STEP = 12;
const SLIDE_MS = 6000;

let data = null;
let slug = '';
let teamFilter = '';
let resultsShown = RESULTS_STEP;
let signupDone = false;
let calMonth = null; // { y, m } do mês aberto no calendário
let calDay = '';     // dia escolhido no calendário ('YYYY-MM-DD')
let slideIndex = 0;
let slideTimer = null;
let menuOpen = false;

// --- Utilitários -----------------------------------------------------------

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// O endereço do clube: o subdomínio, ou `?clube=` (desenvolvimento local e a
// pré-visualização das Definições, antes de o DNS estar pronto).
function slugFromLocation() {
  const param = new URLSearchParams(location.search).get('clube');
  if (param) return param.trim().toLowerCase();
  const host = location.hostname.toLowerCase();
  const suffix = `.${SITE_DOMAIN}`;
  if (host.endsWith(suffix)) {
    const label = host.slice(0, -suffix.length).split('.').pop();
    if (label && label !== 'www' && label !== 'app') return label;
  }
  return '';
}

// Pré-visualização: aberto a partir das Definições (`?clube=` na origem da
// app), o site leva a sessão de quem lá está, e o servidor mostra o site do
// PRÓPRIO clube mesmo antes de publicado. No subdomínio não há sessão nenhuma
// (é outra origem) e isto devolve nada.
function sessionToken() {
  if (!new URLSearchParams(location.search).get('clube')) return '';
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!/^sb-.+-auth-token$/.test(key)) continue;
      const sess = JSON.parse(localStorage.getItem(key) || 'null');
      if (sess?.access_token && (!sess.expires_at || sess.expires_at * 1000 > Date.now())) {
        return sess.access_token;
      }
    }
  } catch { /* sem armazenamento */ }
  return '';
}

async function rpc(name, body) {
  const res = await fetch(`${API_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${sessionToken() || API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(json?.message || 'Não foi possível contactar o servidor.');
  }
  return json;
}

// Endereço público de uma imagem do bucket `site-media`. O caminho vem da
// base de dados, por isso cada segmento é codificado.
function mediaUrl(path) {
  if (!path) return '';
  return `${API_URL}/storage/v1/object/public/site-media/${String(path).split('/').map(encodeURIComponent).join('/')}`;
}

// Uma preferência deste dispositivo (o escalão escolhido) e a última página
// vista, para quem volta abrir já com conteúdo. Em janela privada o
// localStorage rebenta — e isso não pode impedir o site de abrir.
function readStore(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sem armazenamento */ }
}

// Datas guardadas como 'YYYY-MM-DD': lidas como dia local, nunca como UTC
// (senão o jogo de sábado aparecia na sexta a quem estivesse a oeste).
function parseDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cap(txt) {
  return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : txt;
}

function dayLabel(s) {
  const d = parseDay(s);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  return cap(d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }));
}

function longDate(s) {
  return parseDay(s).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function monthLabel(s) {
  return cap(parseDay(s).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }));
}

function hhmm(t) {
  return t ? String(t).slice(0, 5) : '';
}

// "Faltam 3 dias" — para o próximo jogo. Só em dias: horas e minutos a contar
// num site que ninguém deixa aberto são um relógio que nunca se vê mexer.
function countdown(g) {
  const d = parseDay(g.date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff <= 0) return 'É hoje!';
  if (diff === 1) return 'É amanhã';
  return `Faltam ${diff} dias`;
}

// A hora de início de um jogo como data local (sem hora: meia-noite).
function startsAt(g) {
  const d = parseDay(g.date);
  const [h, m] = String(g.time || '').split(':').map(Number);
  if (g.time) d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

// "Daqui a 2h 15min" — só no próprio dia, que é quando as horas importam.
function startsIn(g) {
  if (!g.time) return 'Hoje';
  const mins = Math.round((startsAt(g) - Date.now()) / 60000);
  if (mins <= 0) return `Começou às ${hhmm(g.time)}`;
  if (mins < 60) return `Começa daqui a ${mins} min`;
  const h = Math.floor(mins / 60);
  return `Começa daqui a ${h}h${mins % 60 ? ` ${String(mins % 60).padStart(2, '0')}min` : ''}`;
}

// Os jogos por jogar a partir de hoje. A cópia guardada no dispositivo pode
// ser de há uma semana, e o "próximo jogo" não pode ser o de sábado passado.
function upcomingGames() {
  if (!has('agenda')) return [];
  const today = isoDay(new Date());
  return (data.upcoming || []).filter((g) => String(g.date).slice(0, 10) >= today);
}

function mapsUrl(place) {
  return place ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}` : '';
}

// O nome da modalidade para "Hoje há voleibol". Sem modalidade conhecida a
// frase fica "Hoje jogamos" — não se inventa.
const SPORT_WORD = {
  voleibol: 'voleibol', futebol: 'futebol', futsal: 'futsal', andebol: 'andebol', basquetebol: 'basquetebol',
};

// Só se constrói um href se for mesmo http(s) — a regra do `safeUrl` da app.
function safeUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withProto);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

// "@clube" ou "clube" vira o endereço da rede; um URL completo fica como está.
function socialUrl(raw, base) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v) || v.includes('.')) return safeUrl(v);
  return safeUrl(`${base}/${v.replace(/^@/, '')}`);
}

// Cor do texto que se lê em cima da cor do clube: o clube escolhe as cores na
// app, e um amarelo-limão com texto branco não se lê.
function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#111827' : '#ffffff';
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-Z]/.test(w))
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '★';
}

function euros(v) {
  return Number(v).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
}

// Texto livre escrito na app: parágrafos separados por uma linha em branco,
// quebras simples mantêm-se.
function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function emblem(cls = '') {
  const c = data.club;
  return c.logo
    ? `<img class="emblem ${cls}" src="${esc(c.logo)}" alt="" />`
    : `<span class="emblem emblem--initials ${cls}" aria-hidden="true">${esc(initials(c.name))}</span>`;
}

// --- Equipas ---------------------------------------------------------------

// O nome de uma equipa é o escalão; o género só entra quando o clube tem o
// mesmo escalão nos dois (senão "Iniciados" chegava duas vezes, iguais).
function teamLabels() {
  const teams = data?.teams || [];
  const count = {};
  teams.forEach((t) => { count[t.escalao] = (count[t.escalao] || 0) + 1; });
  const map = {};
  teams.forEach((t) => {
    map[t.id] = count[t.escalao] > 1
      ? `${t.escalao} ${t.gender === 'F' ? 'Fem.' : 'Masc.'}`
      : t.escalao;
  });
  return map;
}

const GENDER = { F: 'Feminino', M: 'Masculino', X: 'Misto' };

// Pela ordem dos escalões do clube (Minis antes de Seniores), não alfabética.
function orderedTeams() {
  const order = Array.isArray(data?.club?.escaloes) ? data.club.escaloes : [];
  const rank = (e) => {
    const i = order.indexOf(e);
    return i === -1 ? 999 : i;
  };
  return [...(data?.teams || [])].sort(
    (a, b) => rank(a.escalao) - rank(b.escalao) || a.escalao.localeCompare(b.escalao) || String(a.gender).localeCompare(String(b.gender))
  );
}

function filtered(list) {
  return teamFilter ? list.filter((g) => g.team_id === teamFilter) : list;
}

function outcome(g) {
  if (g.sets_for === g.sets_against) return ['E', 'draw', 'Empate'];
  return g.sets_for > g.sets_against ? ['V', 'win', 'Vitória'] : ['D', 'loss', 'Derrota'];
}

// O balanço de uma equipa (ou do clube): é a pergunta que um pai faz antes de
// todas as outras — "como é que eles vão?".
function record(list) {
  const r = { played: list.length, win: 0, loss: 0, draw: 0, setsFor: 0, setsAgainst: 0 };
  list.forEach((g) => {
    const [, kind] = outcome(g);
    r[kind] += 1;
    r.setsFor += Number(g.sets_for) || 0;
    r.setsAgainst += Number(g.sets_against) || 0;
  });
  r.form = list.slice(0, 5).map(outcome);
  r.pct = r.played ? Math.round((r.win / r.played) * 100) : 0;
  return r;
}

function formDots(form) {
  if (!form.length) return '';
  return `<span class="formguide" aria-label="Últimos jogos: ${form.map((f) => f[2]).join(', ')}">
    ${form.map((f) => `<span class="formguide__dot formguide__dot--${f[1]}" title="${f[2]}">${f[0]}</span>`).join('')}
  </span>`;
}

// --- Rotas -----------------------------------------------------------------

// Os endereços da primeira versão do site eram âncoras (`#agenda`), e já
// foram partilhados: continuam a abrir a secção certa.
const LEGACY_ROUTES = { agenda: 'calendario' };

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const page = parts[0] || '';
  return { page: LEGACY_ROUTES[page] || page, id: parts[1] ? decodeURIComponent(parts[1]) : '' };
}

function has(section) {
  const s = data.sections || {};
  switch (section) {
    case 'galeria': return s.galeria !== false && (data.photos || []).length > 0;
    case 'noticias': return s.noticias !== false && (data.posts || []).length > 0;
    case 'loja': return s.loja !== false && (data.products || []).length > 0;
    case 'historia': {
      const h = data.history;
      return s.historia !== false && h && (h.text || h.founded || (h.milestones || []).length);
    }
    case 'patrocinadores': return s.patrocinadores !== false && (data.sponsors || []).length > 0;
    case 'equipas': return s.equipas !== false && (data.teams || []).length > 0;
    case 'agenda': return s.agenda !== false;
    case 'resultados': return s.resultados !== false;
    case 'inscricoes': return s.inscricoes !== false;
    default: return true;
  }
}

// O menu só mostra o que existe: uma "Loja" que abre uma página vazia lê-se
// como um site abandonado.
function navItems() {
  return [
    ['', 'Início', true],
    ['calendario', 'Calendário', has('agenda') || has('resultados')],
    ['resultados', 'Resultados', has('resultados')],
    ['equipas', 'Equipas', has('equipas')],
    ['noticias', 'Notícias', has('noticias')],
    ['loja', 'Loja', has('loja')],
    ['historia', 'História', has('historia')],
    ['patrocinadores', 'Patrocinadores', has('patrocinadores')],
    ['contactos', 'Contactos', true],
  ].filter((x) => x[2]);
}

function link(page, id = '') {
  return `#/${page}${id ? `/${encodeURIComponent(id)}` : ''}`;
}

// --- Cabeçalho e rodapé ------------------------------------------------------

function headerHTML(page) {
  const items = navItems();
  const active = page === 'equipa' ? 'equipas' : page === 'noticia' ? 'noticias' : page;
  const nav = items.map(([id, label]) => `
    <a href="${link(id)}" class="topnav__link${active === id ? ' is-active' : ''}"
       ${active === id ? 'aria-current="page"' : ''}>${label}</a>`).join('');
  return `
    <header class="topbar">
      <div class="wrap topbar__inner">
        <a class="brand" href="#/" aria-label="${esc(data.club.name)} — início">
          ${emblem('emblem--sm')}
          <span class="brand__name">${esc(data.club.name)}</span>
        </a>
        <nav class="topnav" aria-label="Secções">${nav}</nav>
        ${has('inscricoes') ? '<a class="btn btn--accent topbar__cta" href="#/inscricoes">Inscreve-te</a>' : ''}
        <button type="button" class="burger" aria-expanded="${menuOpen}" aria-controls="menu" data-menu>
          <span class="sr-only">Menu</span><span class="burger__bar" aria-hidden="true"></span>
        </button>
      </div>
      <nav class="menu${menuOpen ? ' is-open' : ''}" id="menu" aria-label="Menu" ${menuOpen ? '' : 'hidden'}>
        ${nav}
        ${has('inscricoes') ? '<a class="topnav__link menu__cta" href="#/inscricoes">Inscreve-te</a>' : ''}
      </nav>
    </header>`;
}

function socialsHTML() {
  const c = data.contacts || {};
  const ig = socialUrl(c.instagram, 'https://instagram.com');
  const fb = socialUrl(c.facebook, 'https://facebook.com');
  return [
    ig && `<a class="social" href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a>`,
    fb && `<a class="social" href="${esc(fb)}" target="_blank" rel="noopener">Facebook</a>`,
  ].filter(Boolean).join('');
}

function footerHTML() {
  const c = data.contacts || {};
  const tel = c.phone ? String(c.phone).replace(/[^\d+]/g, '') : '';
  const mail = c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? c.email : '';
  return `
    <footer class="foot">
      <div class="wrap foot__grid">
        <div class="foot__club">
          ${emblem('emblem--sm')}
          <div>
            <p class="foot__name">${esc(data.club.name)}</p>
            ${data.club.motto ? `<p class="foot__muted">${esc(data.club.motto)}</p>` : ''}
          </div>
        </div>
        <nav class="foot__nav" aria-label="Rodapé">
          ${navItems().map(([id, label]) => `<a href="${link(id)}">${label}</a>`).join('')}
        </nav>
        <div class="foot__contacts">
          ${c.address ? `<p>${esc(c.address)}</p>` : ''}
          ${tel ? `<p><a href="tel:${esc(tel)}">${esc(c.phone)}</a></p>` : ''}
          ${mail ? `<p><a href="mailto:${esc(mail)}">${esc(mail)}</a></p>` : ''}
          <div class="socials">${socialsHTML()}</div>
        </div>
      </div>
      <div class="wrap foot__base">
        <span>${esc(data.club.name)}${data.club.season ? ` · Época ${esc(data.club.season)}` : ''}</span>
        <a href="https://www.${esc(SITE_DOMAIN)}" target="_blank" rel="noopener">Feito com Rumia</a>
      </div>
    </footer>`;
}

// No telemóvel, o pedido de inscrição fica fixo em baixo: é a única coisa que
// o site pede a quem o visita, e no fim de uma página longa ninguém lá chega.
// Ao lado vai "Como chegar" ao próximo jogo (ou à sede), que é o que um pai
// procura no sábado de manhã.
function dockHTML(page) {
  if (!has('inscricoes') || page === 'inscricoes') return '';
  const g = upcomingGames()[0];
  const place = g?.location || data.contacts?.address || '';
  return `
    <div class="dock" role="region" aria-label="Atalhos">
      <a class="btn btn--accent" href="${link('inscricoes')}">Inscreve-te</a>
      ${place
        ? `<a class="btn btn--glass" href="${esc(mapsUrl(place))}" target="_blank" rel="noopener">Como chegar</a>`
        : `<a class="btn btn--glass" href="${link('calendario')}">Calendário</a>`}
    </div>`;
}

// --- Blocos comuns -----------------------------------------------------------

function chipsHTML() {
  const teams = orderedTeams();
  if (teams.length < 2) return '';
  const labels = teamLabels();
  const chip = (id, label) => `
    <button type="button" class="chip${teamFilter === id ? ' chip--on' : ''}"
            data-team="${esc(id)}" aria-pressed="${teamFilter === id}">${esc(label)}</button>`;
  return `
    <div class="chips" role="group" aria-label="Escolher escalão">
      ${chip('', 'Todos')}
      ${teams.map((t) => chip(t.id, labels[t.id])).join('')}
    </div>`;
}

function pageHead(kicker, title, lead = '') {
  return `
    <section class="pagehead">
      <div class="wrap">
        <p class="kicker">${esc(kicker)}</p>
        <h1 class="pagehead__title">${esc(title)}</h1>
        ${lead ? `<p class="pagehead__lead">${lead}</p>` : ''}
      </div>
    </section>`;
}

function sectionHead(title, more = '') {
  return `
    <div class="sechead">
      <h2 class="sechead__title">${esc(title)}</h2>
      ${more}
    </div>`;
}

function moreLink(page, label) {
  return `<a class="sechead__more" href="${link(page)}">${esc(label)} →</a>`;
}

function upcomingRow(g, labels) {
  return `
    <li class="game">
      <div class="game__date">
        <span class="game__dnum">${parseDay(g.date).getDate()}</span>
        <span class="game__dmon">${esc(parseDay(g.date).toLocaleDateString('pt-PT', { month: 'short' }).replace('.', ''))}</span>
      </div>
      <div class="game__body">
        <p class="game__title"><span class="vs">vs</span> ${esc(g.opponent || g.title || 'A definir')}</p>
        <p class="game__meta">
          <span class="tag">${esc(labels[g.team_id] || '')}</span>
          ${esc(dayLabel(g.date))}${g.time ? ` · ${esc(hhmm(g.time))}` : ''}${g.location ? ` · ${esc(g.location)}` : ''}
        </p>
      </div>
    </li>`;
}

function resultRow(g, labels) {
  const tag = outcome(g);
  const sets = (g.sets || []).map(([a, b]) => `${a}–${b}`).join(' · ');
  return `
    <li class="game">
      <span class="result result--${tag[1]}" title="${tag[2]}" aria-label="${tag[2]}">${tag[0]}</span>
      <div class="game__body">
        <p class="game__title">vs ${esc(g.opponent || g.title || 'Adversário')}</p>
        <p class="game__meta">
          <span class="tag">${esc(labels[g.team_id] || '')}</span>
          ${esc(dayLabel(g.date))}${sets ? ` · <span class="sets">${esc(sets)}</span>` : ''}
        </p>
      </div>
      <span class="score score--${tag[1]}">${esc(g.sets_for)}<span>–</span>${esc(g.sets_against)}</span>
      ${shareBtn(g.id)}
    </li>`;
}

// O resultado em imagem, para as histórias do Instagram e o WhatsApp: é por
// lá que chega quase todo o público de um clube de formação.
function shareBtn(id, label = '') {
  return `<button type="button" class="sharebtn${label ? ' sharebtn--text' : ''}" data-card="result" data-id="${esc(id)}"
    aria-label="Partilhar este resultado em imagem" title="Partilhar em imagem">${SHARE_ICON}${label ? `<span>${esc(label)}</span>` : ''}</button>`;
}

const SHARE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';

function newsCard(p, labels, big = false) {
  return `
    <a class="news${big ? ' news--big' : ''}" href="${link('noticia', p.id)}">
      <div class="news__img">
        ${p.cover ? `<img src="${esc(mediaUrl(p.cover))}" alt="" loading="lazy" />` : `<span class="news__ph" aria-hidden="true">${emblem('emblem--ghost')}</span>`}
      </div>
      <div class="news__body">
        <p class="news__meta">${p.published_at ? esc(longDate(p.published_at)) : ''}${p.team_id && labels[p.team_id] ? ` · ${esc(labels[p.team_id])}` : ''}</p>
        <h3 class="news__title">${esc(p.title)}</h3>
        ${p.summary ? `<p class="news__sum">${esc(p.summary)}</p>` : ''}
      </div>
    </a>`;
}

function productCard(p) {
  return `
    <article class="product">
      <div class="product__img">
        ${p.photo ? `<img src="${esc(mediaUrl(p.photo))}" alt="" loading="lazy" />` : `<span class="news__ph" aria-hidden="true">${emblem('emblem--ghost')}</span>`}
      </div>
      <div class="product__body">
        <h3 class="product__name">${esc(p.name)}</h3>
        <p class="product__price">${p.price == null ? 'Preço sob consulta' : esc(euros(p.price))}</p>
        ${(p.sizes || []).length ? `<p class="product__sizes">${p.sizes.map((s) => `<span>${esc(s)}</span>`).join('')}</p>` : ''}
        <button type="button" class="btn btn--brand" data-order="${esc(p.id)}">Encomendar</button>
      </div>
    </article>`;
}

function sponsorTile(s, cls = '') {
  const url = safeUrl(s.url);
  const inner = s.logo
    ? `<img src="${esc(mediaUrl(s.logo))}" alt="${esc(s.name)}" loading="lazy" />`
    : `<span class="sponsor__name">${esc(s.name)}</span>`;
  const body = `${inner}${s.category && !s.logo ? `<span class="sponsor__cat">${esc(s.category)}</span>` : ''}`;
  return url
    ? `<li${cls ? ` class="${cls}"` : ''}><a class="sponsor sponsor--${esc(s.tier || 'base')}" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(s.name)}">${body}</a></li>`
    : `<li${cls ? ` class="${cls}"` : ''}><span class="sponsor sponsor--${esc(s.tier || 'base')}" title="${esc(s.name)}">${body}</span></li>`;
}

// --- Carrossel -----------------------------------------------------------------

function slideCaption(ph, labels) {
  if (ph.caption) return esc(ph.caption);
  const g = ph.game;
  if (!g) return '';
  const score = g.sets_for != null ? ` · ${esc(g.sets_for)}–${esc(g.sets_against)}` : '';
  return `${esc(labels[g.team_id] || '')} vs ${esc(g.opponent || 'Adversário')}${score}`;
}

// O topo do início muda com o dia, como nos sites dos clubes grandes: um
// clube vive ao ritmo do fim de semana, e uma página igual no sábado de manhã
// e na terça à noite não dá razão nenhuma para voltar. Tudo sai dos dados que
// já chegam (jogos e resultados) — o coordenador não escreve nada a mais.
//   jogo     — há jogos HOJE: "Hoje há voleibol", o jogo que vem a seguir e a
//              hora a que começa.
//   ronda    — a última jornada acabou há três dias ou menos: o balanço dela.
//   proximo  — o resto da semana: o próximo jogo.
//   clube    — sem jogos à vista: o nome e o lema do clube.
function heroMoment() {
  const today = isoDay(new Date());
  const up = upcomingGames();
  const todays = up.filter((g) => String(g.date).slice(0, 10) === today);
  if (todays.length) {
    // O jogo em destaque é o primeiro que ainda não acabou (duas horas de
    // margem); ao fim do dia fica o último.
    const now = Date.now();
    const current = todays.find((g) => !g.time || startsAt(g).getTime() + 2 * 3600000 > now) || todays[todays.length - 1];
    return { kind: 'jogo', games: todays, game: current };
  }
  const res = has('resultados') ? data.results || [] : [];
  if (res.length) {
    const last = parseDay(res[0].date);
    const age = Math.round((parseDay(today) - last) / 86400000);
    if (age <= 3) {
      // A jornada é o último dia com resultados e os dois anteriores: sábado e
      // domingo contam juntos, e um jogo de quarta não se cola ao fim de semana.
      const games = res.filter((g) => (last - parseDay(g.date)) / 86400000 <= 2);
      return { kind: 'ronda', games };
    }
  }
  if (up.length) return { kind: 'proximo', game: up[0] };
  return { kind: 'clube' };
}

function sideName(name, cls = '') {
  return `<span class="mside ${cls}">${cls ? `<span class="emblem emblem--initials emblem--md emblem--opp" aria-hidden="true">${esc(initials(name))}</span>` : emblem('emblem--md')}
    <span class="mside__name">${esc(name)}</span></span>`;
}

// O cartão do jogo: os dois lados, a hora e onde é.
function matchCard(g, labels, { live = false, others = [] } = {}) {
  return `
    <div class="mcard">
      <div class="mcard__top">
        <span>${esc(labels[g.team_id] || '')}</span>
        <span>${esc(live ? startsIn(g) : countdown(g))}</span>
      </div>
      <div class="mcard__row">
        ${sideName(data.club.name)}
        <span class="mcard__vs">
          <strong>${g.time ? esc(hhmm(g.time)) : 'vs'}</strong>
          <small>${esc(dayLabel(g.date))}</small>
        </span>
        ${sideName(g.opponent || g.title || 'A definir', 'mside--opp')}
      </div>
      ${g.location ? `<p class="mcard__where">${esc(g.location)}</p>` : ''}
      ${others.length ? `
        <ul class="mcard__more" aria-label="Também hoje">
          ${others.map((o) => `<li><strong>${o.time ? esc(hhmm(o.time)) : '—'}</strong> ${esc(labels[o.team_id] || '')} <span>vs ${esc(o.opponent || o.title || 'A definir')}</span></li>`).join('')}
        </ul>` : ''}
    </div>`;
}

function scoreTile(g, labels) {
  const tag = outcome(g);
  return `
    <li class="stile stile--${tag[1]}">
      <span class="stile__score">${esc(g.sets_for)}–${esc(g.sets_against)}</span>
      <span class="stile__who">${esc(labels[g.team_id] || '')} <span>vs ${esc(g.opponent || g.title || 'Adversário')}</span></span>
      ${shareBtn(g.id)}
    </li>`;
}

function heroCopy(moment, labels) {
  const c = data.club;
  const word = SPORT_WORD[c.sport];
  const ctas = (...items) => items.filter(Boolean).join('');
  switch (moment.kind) {
    case 'jogo': {
      const gs = moment.games;
      const g = moment.game;
      const places = [...new Set(gs.map((x) => x.location || ''))];
      const where = places.length === 1 && places[0] ? ` · ${places[0]}` : '';
      const times = gs.filter((x) => x.time).map((x) => hhmm(x.time));
      const sub = gs.length === 1
        ? `${labels[g.team_id] || ''} vs ${g.opponent || g.title || 'A definir'}${where}.`
        : `${gs.length} jogos${times.length > 1 ? `, das ${times[0]} às ${times[times.length - 1]}` : ''}${where}. Aparece!`;
      return {
        kicker: cap(parseDay(g.date).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })),
        title: word ? `Hoje há<br><em>${esc(word)}</em>` : 'Hoje<br><em>jogamos</em>',
        sub: esc(sub),
        ctas: ctas(
          g.location && `<a class="btn btn--accent" href="${esc(mapsUrl(g.location))}" target="_blank" rel="noopener">Como chegar</a>`,
          `<button type="button" class="btn btn--glass" data-ics="${esc(g.id)}">Adicionar ao calendário</button>`,
        ),
        panel: matchCard(g, labels, { live: true, others: gs.filter((x) => x.id !== g.id) }),
      };
    }
    case 'ronda': {
      const gs = moment.games;
      const wins = gs.filter((g) => outcome(g)[1] === 'win');
      const first = parseDay(gs[gs.length - 1].date);
      const last = parseDay(gs[0].date);
      const fmt = (d) => d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }).replace('.', '');
      const when = isoDay(first) === isoDay(last) ? fmt(last) : `${fmt(first)} e ${fmt(last)}`;
      let title;
      let sub;
      if (gs.length === 1) {
        const g = gs[0];
        const tag = outcome(g);
        title = `${tag[2]}<br><em>${esc(g.sets_for)}–${esc(g.sets_against)}</em>`;
        sub = `${esc(labels[g.team_id] || '')} vs ${esc(g.opponent || g.title || 'Adversário')}.`;
      } else {
        title = wins.length
          ? `${wins.length} ${wins.length === 1 ? 'vitória' : 'vitórias'}<br><em>em ${gs.length} jogos</em>`
          : `${gs.length} jogos<br><em>da jornada</em>`;
        // O destaque é a vitória com mais diferença de sets: é a que se conta.
        const best = [...wins].sort((a, b) => (b.sets_for - b.sets_against) - (a.sets_for - a.sets_against))[0];
        sub = best
          ? `Destaque: ${esc(labels[best.team_id] || '')} ${esc(best.sets_for)}–${esc(best.sets_against)} vs ${esc(best.opponent || best.title || 'Adversário')}.`
          : 'Todos os resultados, escalão a escalão.';
      }
      const shown = gs.slice(0, 4);
      return {
        kicker: `Resultados · ${when}`,
        title,
        sub,
        ctas: ctas(
          `<button type="button" class="btn btn--accent" data-card="${gs.length === 1 ? 'result' : 'round'}" data-id="${esc(gs[0].id)}">${SHARE_ICON} Partilhar resultados</button>`,
          `<a class="btn btn--glass" href="${link('resultados')}">Todos os resultados</a>`,
        ),
        panel: `
          <ul class="stiles">${shown.map((g) => scoreTile(g, labels)).join('')}</ul>
          ${gs.length > shown.length ? `<a class="hero__more" href="${link('resultados')}">e mais ${gs.length - shown.length} →</a>` : ''}`,
      };
    }
    case 'proximo': {
      const g = moment.game;
      const week = upcomingGames().filter((x) => (parseDay(x.date) - parseDay(isoDay(new Date()))) / 86400000 <= 7);
      const post = has('noticias') ? data.posts[0] : null;
      return {
        kicker: `Próximo jogo · ${dayLabel(g.date)}${g.time ? ` ${hhmm(g.time)}` : ''}`,
        title: `${esc(labels[g.team_id] || data.club.name)}<br><em>vs ${esc(g.opponent || g.title || 'A definir')}</em>`,
        sub: esc(`${countdown(g)}.${week.length > 1 ? ` ${week.length} jogos nos próximos 7 dias.` : ''}`),
        ctas: ctas(
          `<button type="button" class="btn btn--accent" data-ics="${esc(g.id)}">Adicionar ao calendário</button>`,
          `<a class="btn btn--glass" href="${link('calendario')}">Ver calendário</a>`,
        ),
        // Com uma notícia, o painel é dela: o jogo já está no título.
        panel: post ? `
          <a class="hnews" href="${link('noticia', post.id)}">
            ${post.cover ? `<img src="${esc(mediaUrl(post.cover))}" alt="" />` : ''}
            <span class="hnews__body">
              <span class="hnews__kick">Notícia${post.published_at ? ` · ${esc(dayLabel(post.published_at))}` : ''}</span>
              <strong>${esc(post.title)}</strong>
            </span>
          </a>` : matchCard(g, labels),
      };
    }
    default:
      return {
        kicker: c.season ? `Época ${c.season}` : 'Bem-vindo',
        title: esc(c.name),
        sub: c.motto ? esc(c.motto) : '',
        ctas: ctas(
          has('agenda') && `<a class="btn btn--accent" href="${link('calendario')}">Ver calendário</a>`,
          has('inscricoes') && `<a class="btn btn--glass" href="${link('inscricoes')}">Quero fazer parte</a>`,
        ),
        panel: '',
      };
  }
}

function heroHTML(labels, moment) {
  const photos = has('galeria') ? data.photos : [];
  if (slideIndex >= photos.length) slideIndex = 0;
  const copy = heroCopy(moment, labels);
  const plain = moment.kind === 'clube';
  // As legendas das fotos só aparecem no topo "do clube": com um painel ao
  // lado disputavam o mesmo canto, e o que se lê ali é o jogo.
  const slides = photos.map((ph, i) => {
    const capt = plain ? slideCaption(ph, labels) : '';
    const meta = ph.game?.date ? esc(longDate(ph.game.date)) : '';
    return `
      <figure class="slide${i === slideIndex ? ' is-active' : ''}" aria-hidden="${i !== slideIndex}"
              role="group" aria-roledescription="diapositivo" aria-label="${i + 1} de ${photos.length}">
        <img src="${esc(mediaUrl(ph.path))}" alt="${slideCaption(ph, labels).replace(/<[^>]+>/g, '')}"
             ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
        ${capt ? `<figcaption class="slide__cap"><span>${capt}</span>${meta ? `<small>${meta}</small>` : ''}</figcaption>` : ''}
      </figure>`;
  }).join('');
  const controls = photos.length > 1 ? `
    <button type="button" class="hero__arrow hero__arrow--prev" data-slide="-1" aria-label="Foto anterior">‹</button>
    <button type="button" class="hero__arrow hero__arrow--next" data-slide="1" aria-label="Foto seguinte">›</button>
    <div class="hero__dots" role="group" aria-label="Escolher foto">
      ${photos.map((_, i) => `<button type="button" class="hero__dot${i === slideIndex ? ' is-active' : ''}"
         data-goto="${i}" aria-label="Foto ${i + 1}" aria-current="${i === slideIndex}"></button>`).join('')}
    </div>` : '';
  return `
    <section class="hero hero--${moment.kind}${photos.length ? '' : ' hero--plain'}" aria-label="Destaque">
      <div class="hero__slides" data-swipe>${slides}</div>
      <div class="hero__shade" aria-hidden="true"></div>
      <div class="hero__stripes" aria-hidden="true"></div>
      <div class="wrap hero__content${copy.panel ? ' hero__content--split' : ''}">
        <div class="hero__text">
          ${plain && !photos.length ? emblem('emblem--hero') : ''}
          <p class="kicker kicker--hero">${esc(copy.kicker)}</p>
          <h1 class="hero__name">${copy.title}</h1>
          ${copy.sub ? `<p class="hero__motto">${copy.sub}</p>` : ''}
          ${copy.ctas ? `<div class="hero__ctas">${copy.ctas}</div>` : ''}
        </div>
        ${copy.panel ? `<div class="hero__panel">${copy.panel}</div>` : ''}
      </div>
      ${controls}
    </section>`;
}

function stopSlides() {
  if (slideTimer) clearInterval(slideTimer);
  slideTimer = null;
}

function showSlide(i) {
  const slides = [...root.querySelectorAll('.slide')];
  if (!slides.length) return;
  slideIndex = (i + slides.length) % slides.length;
  slides.forEach((s, n) => {
    s.classList.toggle('is-active', n === slideIndex);
    s.setAttribute('aria-hidden', String(n !== slideIndex));
  });
  root.querySelectorAll('.hero__dot').forEach((d, n) => {
    d.classList.toggle('is-active', n === slideIndex);
    d.setAttribute('aria-current', String(n === slideIndex));
  });
}

// Avança sozinho, mas para quando alguém está a olhar com atenção (rato ou
// foco no carrossel) e não anda de todo com "reduzir movimento".
function startSlides() {
  stopSlides();
  const count = root.querySelectorAll('.slide').length;
  if (count < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  slideTimer = setInterval(() => showSlide(slideIndex + 1), SLIDE_MS);
}

function wireCarousel() {
  const hero = root.querySelector('.hero');
  if (!hero || root.querySelectorAll('.slide').length < 2) return;
  hero.querySelectorAll('[data-slide]').forEach((b) => b.addEventListener('click', () => {
    showSlide(slideIndex + Number(b.dataset.slide));
    startSlides();
  }));
  hero.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    showSlide(Number(b.dataset.goto));
    startSlides();
  }));
  hero.addEventListener('mouseenter', stopSlides);
  hero.addEventListener('mouseleave', startSlides);
  hero.addEventListener('focusin', stopSlides);
  hero.addEventListener('focusout', startSlides);
  // Deslizar com o dedo: é no telemóvel que o site é mais visto.
  const area = hero.querySelector('[data-swipe]');
  let x0 = null;
  area.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  area.addEventListener('pointerup', (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) {
      showSlide(slideIndex + (dx < 0 ? 1 : -1));
      startSlides();
    }
  });
  startSlides();
}

// --- Páginas -------------------------------------------------------------------

// A faixa de resultados no topo: todos os escalões num marcador, como os
// clubes grandes fazem com as modalidades. Num clube de formação o jogo dos
// infantis é o jogo mais importante para vinte famílias.
function tickerHTML(labels) {
  const list = (has('resultados') ? data.results || [] : []).slice(0, 10);
  if (!list.length) return '';
  return `
    <nav class="ticker" aria-label="Últimos resultados">
      <div class="wrap ticker__inner">
        <span class="ticker__label">Últimos resultados</span>
        <ul class="ticker__list">
          ${list.map((g) => {
            const tag = outcome(g);
            return `<li><a href="${link('resultados')}">
              <span class="ticker__team">${esc(labels[g.team_id] || '')}</span>
              <strong class="ticker__score ticker__score--${tag[1]}">${esc(g.sets_for)}–${esc(g.sets_against)}</strong>
              <span class="ticker__opp">${esc(g.opponent || g.title || 'Adversário')}</span>
            </a></li>`;
          }).join('')}
        </ul>
      </div>
    </nav>`;
}

// Os jogos da semana em cartões, um por escalão. O que já está no topo não se
// repete aqui: o mesmo jogo duas vezes lê-se como dois jogos.
function weekHTML(labels, moment) {
  const up = upcomingGames();
  if (!up.length) return '';
  const today = parseDay(isoDay(new Date()));
  const skip = new Set(moment.kind === 'jogo' ? moment.games.map((g) => g.id) : moment.game ? [moment.game.id] : []);
  const rest = up.filter((g) => !skip.has(g.id));
  let list = rest.filter((g) => (parseDay(g.date) - today) / 86400000 <= 7);
  let title = 'Próximos 7 dias';
  if (!list.length) {
    list = rest.slice(0, 4);
    title = 'A seguir';
  } else if (list.every((g) => [0, 6].includes(parseDay(g.date).getDay()))
    && (parseDay(list[list.length - 1].date) - parseDay(list[0].date)) / 86400000 <= 1) {
    title = 'Este fim de semana';
  }
  if (!list.length) return '';
  const shown = list.slice(0, 8);
  return `
    <section class="sec">
      ${sectionHead(title, moreLink('calendario', 'Calendário completo'))}
      <ul class="wgames">
        ${shown.map((g) => `
          <li class="wgame">
            <span class="wgame__team">${esc(labels[g.team_id] || '')}</span>
            <span class="wgame__vs">vs ${esc(g.opponent || g.title || 'A definir')}</span>
            <span class="wgame__when">${esc(dayLabel(g.date))}${g.time ? ` · ${esc(hhmm(g.time))}` : ''}</span>
            ${g.location ? `<span class="wgame__where">${esc(g.location)}</span>` : ''}
            <span class="wgame__actions">
              ${g.location ? `<a href="${esc(mapsUrl(g.location))}" target="_blank" rel="noopener">Como chegar</a>` : ''}
              <button type="button" class="linkbtn" data-ics="${esc(g.id)}">Adicionar ao calendário</button>
            </span>
          </li>`).join('')}
      </ul>
    </section>`;
}

function galleryHTML(labels) {
  if (!has('galeria') || data.photos.length < 3) return '';
  const photos = data.photos.slice(0, 5);
  return `
    <section class="sec">
      ${sectionHead('Galeria')}
      <ul class="mosaic mosaic--${photos.length}">
        ${photos.map((ph) => {
          const capt = slideCaption(ph, labels);
          return `<li><a href="${esc(mediaUrl(ph.path))}" target="_blank" rel="noopener">
            <img src="${esc(mediaUrl(ph.path))}" alt="${capt.replace(/<[^>]+>/g, '')}" loading="lazy" />
            ${capt ? `<span class="mosaic__cap">${capt}</span>` : ''}
          </a></li>`;
        }).join('')}
      </ul>
    </section>`;
}

// O patrocinador principal (o primeiro Ouro) tem lugar próprio: é o que
// mostra a quem pensa patrocinar o que está a comprar.
function homeSponsorsHTML() {
  if (!has('patrocinadores')) return '';
  const list = data.sponsors;
  const main = list[0]?.tier === 'ouro' ? list[0] : null;
  const rest = main ? list.slice(1) : list;
  return `
    <section class="sec">
      ${sectionHead('Quem nos apoia', `<a class="sechead__more" href="${link('contactos')}">Patrocinar o clube →</a>`)}
      <ul class="sponsors sponsors--home">
        ${main ? sponsorTile(main, 'sponsors__main') : ''}
        ${rest.map((s) => sponsorTile(s)).join('')}
      </ul>
    </section>`;
}

// "Dos Minis aos Seniores": os escalões do próprio clube dizem quem pode vir.
function bandTitle() {
  const teams = orderedTeams();
  const first = teams[0]?.escalao;
  const last = teams[teams.length - 1]?.escalao;
  return first && last && first !== last ? `Dos ${first} aos ${last}` : 'Queres jogar connosco?';
}

function homeHTML(labels) {
  const moment = heroMoment();
  const posts = has('noticias') ? data.posts.slice(moment.kind === 'proximo' ? 1 : 0).slice(0, 3) : [];
  const prods = has('loja') ? data.products.slice(0, 4) : [];
  const founded = Number(data.history?.founded);
  const years = founded ? new Date().getFullYear() - founded : 0;
  const rec = record(data.results || []);
  const stats = [
    (data.teams || []).length && [String(data.teams.length), data.teams.length === 1 ? 'equipa' : 'equipas'],
    rec.played && [String(rec.win), rec.win === 1 ? 'vitória esta época' : 'vitórias esta época'],
    rec.played && [`${rec.pct}%`, 'de jogos ganhos'],
    years > 0 && [String(years), years === 1 ? 'ano de história' : 'anos de história'],
  ].filter(Boolean);

  return `
    ${moment.kind === 'ronda' ? '' : tickerHTML(labels)}
    ${heroHTML(labels, moment)}
    <div class="wrap home">
      ${weekHTML(labels, moment)}

      ${stats.length ? `
        <ul class="stats">
          ${stats.map(([n, l]) => `<li><strong>${esc(n)}</strong><span>${esc(l)}</span></li>`).join('')}
        </ul>` : ''}

      ${posts.length ? `
        <section class="sec">
          ${sectionHead('Notícias', moreLink('noticias', 'Todas as notícias'))}
          <div class="newsgrid">${posts.map((p, i) => newsCard(p, labels, i === 0 && posts.length >= 3)).join('')}</div>
        </section>` : ''}

      ${galleryHTML(labels)}

      ${prods.length ? `
        <section class="sec">
          ${sectionHead('Loja do clube', moreLink('loja', 'Ver a loja'))}
          <div class="shopgrid">${prods.map(productCard).join('')}</div>
        </section>` : ''}

      ${homeSponsorsHTML()}
    </div>

    ${has('inscricoes') ? `
      <section class="band">
        <div class="wrap band__inner">
          <div>
            <h2 class="band__title">${esc(bandTitle())}</h2>
            <p>Marca um treino experimental. Há lugar para ti.</p>
          </div>
          <a class="btn btn--brand btn--lg" href="${link('inscricoes')}">Marca um treino experimental</a>
        </div>
      </section>` : ''}`;
}

// Calendário: o mês em grelha, com os jogos de cada dia. Os jogos já jogados
// levam o resultado — é o mesmo calendário que um pai consulta na segunda a
// perguntar "quanto ficou?".
function calendarHTML(labels) {
  const games = filtered([
    ...(has('agenda') ? data.upcoming || [] : []),
    ...(has('resultados') ? data.results || [] : []),
  ]);
  const byDay = {};
  games.forEach((g) => { (byDay[String(g.date).slice(0, 10)] ||= []).push(g); });
  Object.values(byDay).forEach((l) => l.sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))));

  const today = new Date();
  if (!calMonth) calMonth = { y: today.getFullYear(), m: today.getMonth() };
  const first = new Date(calMonth.y, calMonth.m, 1);
  const offset = (first.getDay() + 6) % 7; // segunda-feira primeiro
  const daysIn = new Date(calMonth.y, calMonth.m + 1, 0).getDate();
  const todayIso = isoDay(today);
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<li class="cal__cell cal__cell--out" aria-hidden="true"></li>');
  for (let d = 1; d <= daysIn; d += 1) {
    const iso = isoDay(new Date(calMonth.y, calMonth.m, d));
    const list = byDay[iso] || [];
    const chips = list.slice(0, 3).map((g) => {
      const kind = g.sets_for != null ? outcome(g)[1] : 'next';
      return `<span class="cal__chip cal__chip--${kind}">${esc(labels[g.team_id] || '')}</span>`;
    }).join('');
    cells.push(`
      <li class="cal__cell${iso === todayIso ? ' is-today' : ''}${list.length ? ' has-games' : ''}${iso === calDay ? ' is-picked' : ''}">
        ${list.length
          ? `<button type="button" class="cal__btn" data-day="${iso}" aria-pressed="${iso === calDay}"
               aria-label="${d}: ${list.length} jogo${list.length === 1 ? '' : 's'}">
               <span class="cal__num">${d}</span>
               <span class="cal__chips">${chips}${list.length > 3 ? `<span class="cal__chip">+${list.length - 3}</span>` : ''}</span>
               <span class="cal__dots" aria-hidden="true">${list.map((g) => `<i class="cal__dot--${g.sets_for != null ? outcome(g)[1] : 'next'}"></i>`).join('')}</span>
             </button>`
          : `<span class="cal__num">${d}</span>`}
      </li>`);
  }

  const monthKey = `${calMonth.y}-${String(calMonth.m + 1).padStart(2, '0')}`;
  const inMonth = games
    .filter((g) => String(g.date).startsWith(monthKey))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')));
  const shown = calDay ? (byDay[calDay] || []) : inMonth;
  const label = cap(first.toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' }));

  return `
    ${pageHead('Calendário', 'Jogos do clube', 'Todos os jogos, de todos os escalões. Escolhe o teu para ver só os dele.')}
    <div class="wrap page">
      ${chipsHTML()}
      <div class="calwrap">
        <section class="card cal" aria-label="${esc(label)}">
          <div class="cal__head">
            <button type="button" class="iconbtn" data-month="-1" aria-label="Mês anterior">‹</button>
            <h2 class="cal__title">${esc(label)}</h2>
            <button type="button" class="iconbtn" data-month="1" aria-label="Mês seguinte">›</button>
          </div>
          <ol class="cal__week" aria-hidden="true">
            ${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => `<li>${d}</li>`).join('')}
          </ol>
          <ol class="cal__grid">${cells.join('')}</ol>
          <p class="cal__legend">
            <span><i class="lg lg--next"></i> Por jogar</span>
            <span><i class="lg lg--win"></i> Vitória</span>
            <span><i class="lg lg--loss"></i> Derrota</span>
            ${calMonth.y !== today.getFullYear() || calMonth.m !== today.getMonth()
              ? '<button type="button" class="linkbtn" data-month="today">Voltar a hoje</button>' : ''}
          </p>
        </section>
        <section class="card calside">
          <div class="sechead sechead--tight">
            <h2 class="sechead__title">${calDay ? esc(cap(parseDay(calDay).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }))) : `Jogos de ${esc(label.split(' ')[0].toLowerCase())}`}</h2>
            ${calDay ? '<button type="button" class="linkbtn" data-day="">Ver o mês todo</button>' : ''}
          </div>
          ${shown.length
            ? `<ul class="list">${shown.map((g) => (g.sets_for != null ? resultRow(g, labels) : upcomingRow(g, labels))).join('')}</ul>`
            : `<p class="empty">Não há jogos ${calDay ? 'neste dia' : 'neste mês'}${teamFilter ? ' para este escalão' : ''}.</p>`}
        </section>
      </div>
    </div>`;
}

function resultsPageHTML(labels) {
  const teams = orderedTeams();
  const all = data.results || [];
  const summary = (teamFilter ? teams.filter((t) => t.id === teamFilter) : teams)
    .map((t) => ({ t, r: record(all.filter((g) => g.team_id === t.id)) }))
    .filter((x) => x.r.played);
  const list = filtered(all);
  const shown = list.slice(0, resultsShown);
  const more = list.length > resultsShown
    ? `<button type="button" class="more" data-more="results">Mostrar os restantes ${list.length - resultsShown}</button>`
    : '';
  return `
    ${pageHead('Resultados', 'Como vão as equipas', 'O balanço da época de cada escalão e todos os resultados, com os parciais.')}
    <div class="wrap page">
      ${chipsHTML()}
      ${summary.length ? `
        <ul class="teamstats">
          ${summary.map(({ t, r }) => `
            <li class="teamstat">
              <a href="${link('equipas', t.id)}" class="teamstat__name">${esc(labels[t.id])}</a>
              <div class="teamstat__bar" aria-hidden="true">
                <span class="teamstat__win" style="width:${r.played ? (r.win / r.played) * 100 : 0}%"></span>
              </div>
              <div class="teamstat__nums">
                <span><strong>${r.played}</strong> jogos</span>
                <span><strong>${r.win}</strong> V</span>
                <span><strong>${r.loss}</strong> D</span>
                ${r.draw ? `<span><strong>${r.draw}</strong> E</span>` : ''}
                <span><strong>${r.setsFor}–${r.setsAgainst}</strong> sets</span>
              </div>
              ${formDots(r.form)}
            </li>`).join('')}
        </ul>` : ''}
      <section class="card sec">
        ${shown.length ? `<ul class="list">${shown.map((g) => resultRow(g, labels)).join('')}</ul>${more}`
          : `<p class="empty">Ainda não há resultados${teamFilter ? ' deste escalão' : ''} esta época.</p>`}
      </section>
    </div>`;
}

function teamsHTML(labels) {
  const teams = orderedTeams();
  return `
    ${pageHead('Equipas', 'Os nossos escalões', 'Cada equipa, quem a treina e como vai a época.')}
    <div class="wrap page">
      <ul class="teamgrid">
        ${teams.map((t) => {
          const r = record((data.results || []).filter((g) => g.team_id === t.id));
          const next = (data.upcoming || []).find((g) => g.team_id === t.id);
          const head = (t.coaches || []).find((c) => c.role === 'principal') || (t.coaches || [])[0];
          return `
          <li>
            <a class="teamcard" href="${link('equipas', t.id)}">
              <span class="teamcard__badge">${esc(t.escalao.slice(0, 3).toUpperCase())}</span>
              <span class="teamcard__name">${esc(labels[t.id])}</span>
              <span class="teamcard__meta">${esc(GENDER[t.gender] || '')}${head ? ` · ${esc(head.name)}` : ''}</span>
              ${r.played ? `<span class="teamcard__rec">${r.win}V · ${r.loss}D ${formDots(r.form)}</span>` : ''}
              ${next ? `<span class="teamcard__next">Próximo: ${esc(dayLabel(next.date))} vs ${esc(next.opponent || 'A definir')}</span>` : ''}
              ${t.roster ? '<span class="teamcard__roster">Ver plantel →</span>' : ''}
            </a>
          </li>`;
        }).join('')}
      </ul>
    </div>`;
}

function teamHTML(id, labels) {
  const t = (data.teams || []).find((x) => x.id === id);
  if (!t) return notFoundHTML();
  const results = (data.results || []).filter((g) => g.team_id === id);
  const upcoming = (data.upcoming || []).filter((g) => g.team_id === id);
  const r = record(results);
  const posts = has('noticias') ? data.posts.filter((p) => p.team_id === id).slice(0, 3) : [];
  const roster = Array.isArray(t.roster) ? t.roster : null;
  return `
    <section class="pagehead pagehead--team">
      <div class="wrap">
        <a class="back" href="${link('equipas')}">← Equipas</a>
        <p class="kicker">${esc(GENDER[t.gender] || '')}${data.club.season ? ` · Época ${esc(data.club.season)}` : ''}</p>
        <h1 class="pagehead__title">${esc(labels[t.id])}</h1>
        ${r.played ? `
        <ul class="stats stats--inline">
          <li><strong>${r.played}</strong><span>jogos</span></li>
          <li><strong>${r.win}</strong><span>vitórias</span></li>
          <li><strong>${r.loss}</strong><span>derrotas</span></li>
          <li><strong>${r.pct}%</strong><span>ganhos</span></li>
        </ul>` : ''}
      </div>
    </section>
    <div class="wrap page">
      ${(t.coaches || []).length ? `
        <section class="sec">
          ${sectionHead('Equipa técnica')}
          <ul class="coaches">
            ${t.coaches.map((c) => `
              <li class="coach">
                <span class="coach__av" aria-hidden="true">${esc(initials(c.name))}</span>
                <span><strong>${esc(c.name)}</strong><small>${c.role === 'principal' ? 'Treinador principal' : 'Treinador adjunto'}</small></span>
              </li>`).join('')}
          </ul>
        </section>` : ''}
      ${roster ? `
        <section class="sec">
          ${sectionHead('Plantel')}
          ${roster.length ? `
          <ul class="roster">
            ${roster.map((p) => `
              <li class="player">
                <span class="player__num">${esc(p.number || '–')}</span>
                <span class="player__name">${esc(p.name)}</span>
                ${p.position ? `<span class="player__pos">${esc(p.position)}</span>` : ''}
              </li>`).join('')}
          </ul>` : '<p class="empty">O plantel ainda não está fechado.</p>'}
        </section>` : ''}
      <div class="twocol">
        ${has('agenda') ? `
        <section class="card sec">
          ${sectionHead('Próximos jogos')}
          ${upcoming.length ? `<ul class="list">${upcoming.slice(0, 8).map((g) => upcomingRow(g, labels)).join('')}</ul>`
            : '<p class="empty">Não há jogos marcados.</p>'}
        </section>` : ''}
        ${has('resultados') ? `
        <section class="card sec">
          ${sectionHead('Resultados', r.played ? formDots(r.form) : '')}
          ${results.length ? `<ul class="list">${results.slice(0, 8).map((g) => resultRow(g, labels)).join('')}</ul>`
            : '<p class="empty">Ainda sem resultados esta época.</p>'}
        </section>` : ''}
      </div>
      ${posts.length ? `
        <section class="sec">
          ${sectionHead(`Notícias dos ${labels[t.id]}`)}
          <div class="newsgrid">${posts.map((p) => newsCard(p, labels)).join('')}</div>
        </section>` : ''}
    </div>`;
}

function newsPageHTML(labels) {
  const posts = data.posts || [];
  return `
    ${pageHead('Notícias', 'O que se passa no clube')}
    <div class="wrap page">
      <div class="newsgrid newsgrid--all">${posts.map((p, i) => newsCard(p, labels, i === 0)).join('')}</div>
    </div>`;
}

function postHTML(id, labels) {
  const p = (data.posts || []).find((x) => x.id === id);
  if (!p) return notFoundHTML();
  const others = data.posts.filter((x) => x.id !== id).slice(0, 3);
  return `
    <article class="post">
      ${p.cover ? `<div class="post__cover"><img src="${esc(mediaUrl(p.cover))}" alt="" /></div>` : ''}
      <div class="wrap wrap--narrow post__wrap">
        <a class="back back--dark" href="${link('noticias')}">← Notícias</a>
        <p class="kicker">${p.published_at ? esc(longDate(p.published_at)) : ''}${p.team_id && labels[p.team_id] ? ` · ${esc(labels[p.team_id])}` : ''}</p>
        <h1 class="post__title">${esc(p.title)}</h1>
        ${p.summary ? `<p class="post__lead">${esc(p.summary)}</p>` : ''}
        <div class="prose">${paragraphs(p.body)}</div>
        <button type="button" class="btn btn--ghost" data-share>Partilhar</button>
      </div>
    </article>
    ${others.length ? `
      <div class="wrap page">
        ${sectionHead('Mais notícias')}
        <div class="newsgrid">${others.map((o) => newsCard(o, labels)).join('')}</div>
      </div>` : ''}`;
}

function shopHTML() {
  return `
    ${pageHead('Loja', 'Veste as cores do clube', 'Escolhe o artigo, deixa o teu contacto e o clube combina contigo o pagamento e a entrega.')}
    <div class="wrap page">
      <div class="shopgrid shopgrid--all">${(data.products || []).map(productCard).join('')}</div>
    </div>`;
}

function historyHTML() {
  const h = data.history || {};
  const founded = Number(h.founded);
  const years = founded ? new Date().getFullYear() - founded : 0;
  const miles = Array.isArray(h.milestones) ? h.milestones : [];
  return `
    <section class="pagehead pagehead--history">
      <div class="wrap">
        <p class="kicker">História</p>
        <h1 class="pagehead__title">${founded ? `Desde ${esc(founded)}` : esc(data.club.name)}</h1>
        ${years > 0 ? `<p class="pagehead__lead">${years} anos de ${esc(data.club.name)}.</p>` : ''}
      </div>
    </section>
    <div class="wrap wrap--narrow page">
      ${h.text ? `<div class="prose prose--lead">${paragraphs(h.text)}</div>` : ''}
      ${miles.length ? `
        <section class="sec">
          ${sectionHead('Marcos')}
          <ol class="timeline">
            ${miles.map((m) => `
              <li class="timeline__item">
                <span class="timeline__year">${esc(m.year)}</span>
                <p class="timeline__text">${esc(m.text)}</p>
              </li>`).join('')}
          </ol>
        </section>` : ''}
    </div>`;
}

const TIER_LABEL = { ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze' };

function sponsorsPageHTML() {
  const list = data.sponsors || [];
  const groups = ['ouro', 'prata', 'bronze', ''].map((tier) => ({
    tier,
    items: list.filter((s) => (TIER_LABEL[s.tier] ? s.tier : '') === tier),
  })).filter((g) => g.items.length);
  return `
    ${pageHead('Patrocinadores', 'Quem nos apoia', 'Sem eles não havia equipamentos, deslocações nem torneios. Obrigado.')}
    <div class="wrap page">
      ${groups.map((g) => `
        <section class="sec">
          <p class="tier tier--${g.tier || 'base'}">${g.tier ? `Patrocinador ${TIER_LABEL[g.tier]}` : 'Apoios'}</p>
          <ul class="sponsors sponsors--${g.tier || 'base'}">${g.items.map(sponsorTile).join('')}</ul>
        </section>`).join('')}
    </div>`;
}

function signupHTML() {
  if (signupDone) {
    return `
      ${pageHead('Inscrições', 'Pedido enviado')}
      <div class="wrap wrap--narrow page">
        <div class="card done" role="status">
          <p><strong>Obrigado!</strong></p>
          <p>O clube recebeu o teu pedido e vai entrar em contacto pelo telefone ou email que deixaste.</p>
        </div>
      </div>`;
  }
  const teams = orderedTeams();
  const labels = teamLabels();
  return `
    ${pageHead('Inscrições', 'Quero fazer parte', 'Deixa os teus dados e o clube entra em contacto para marcar um treino de experiência.')}
    <div class="wrap wrap--narrow page">
      <form class="card form" id="signup" novalidate>
        <div class="form__grid">
          <label class="field">
            <span>Nome do atleta</span>
            <input name="name" required maxlength="120" autocomplete="off" />
          </label>
          <label class="field">
            <span>Ano de nascimento</span>
            <input name="birth_year" inputmode="numeric" maxlength="4" placeholder="ex.: 2014" />
          </label>
          ${teams.length ? `
          <label class="field">
            <span>Escalão de interesse</span>
            <select name="team_id">
              <option value="">Não sei</option>
              ${teams.map((t) => `<option value="${esc(t.id)}">${esc(labels[t.id])}</option>`).join('')}
            </select>
          </label>` : ''}
          <label class="field">
            <span>Telefone ou email (encarregado)</span>
            <input name="contact" required maxlength="160" autocomplete="email tel" />
          </label>
        </div>
        <label class="field">
          <span>Mensagem <em>(opcional)</em></span>
          <textarea name="message" rows="3" maxlength="1000"></textarea>
        </label>
        <label class="check">
          <input type="checkbox" name="consent" required />
          <span>Autorizo o clube a guardar estes dados para me contactar sobre a inscrição.
            Se o atleta for menor, sou o encarregado de educação.</span>
        </label>
        <p class="form__error" id="signup-error" role="alert" hidden></p>
        <button class="btn btn--accent btn--lg" type="submit">Enviar pedido</button>
      </form>
    </div>`;
}

function contactsHTML() {
  const c = data.contacts || {};
  const items = [];
  if (c.address) {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`;
    items.push(`<li><span class="ct__k">Onde estamos</span><span>${esc(c.address)}</span>
      <a class="linkbtn" href="${esc(maps)}" target="_blank" rel="noopener">Abrir no mapa ↗</a></li>`);
  }
  if (c.phone) {
    const tel = String(c.phone).replace(/[^\d+]/g, '');
    items.push(`<li><span class="ct__k">Telefone</span><a href="tel:${esc(tel)}">${esc(c.phone)}</a></li>`);
  }
  if (c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
    items.push(`<li><span class="ct__k">Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`);
  }
  const social = socialsHTML();
  return `
    ${pageHead('Contactos', data.about ? 'Sobre o clube' : 'Fala connosco')}
    <div class="wrap page">
      <div class="twocol">
        ${data.about ? `<section class="card sec prose">${paragraphs(data.about)}</section>` : ''}
        <section class="card sec">
          ${items.length ? `<ul class="ct">${items.join('')}</ul>` : ''}
          ${social ? `<div class="socials">${social}</div>` : ''}
          ${!items.length && !social ? '<p class="empty">O clube ainda não deixou contactos.</p>' : ''}
        </section>
      </div>
    </div>`;
}

function notFoundHTML() {
  return `
    ${pageHead('Ups', 'Esta página não existe')}
    <div class="wrap page"><p><a class="btn btn--brand" href="#/">Voltar ao início</a></p></div>`;
}

function pageHTML(page, id, labels) {
  switch (page) {
    case '': return homeHTML(labels);
    case 'calendario': return has('agenda') || has('resultados') ? calendarHTML(labels) : notFoundHTML();
    case 'resultados': return has('resultados') ? resultsPageHTML(labels) : notFoundHTML();
    case 'equipas': return has('equipas') ? (id ? teamHTML(id, labels) : teamsHTML(labels)) : notFoundHTML();
    case 'noticias': return has('noticias') ? newsPageHTML(labels) : notFoundHTML();
    case 'noticia': return has('noticias') ? postHTML(id, labels) : notFoundHTML();
    case 'loja': return has('loja') ? shopHTML() : notFoundHTML();
    case 'historia': return has('historia') ? historyHTML() : notFoundHTML();
    case 'patrocinadores': return has('patrocinadores') ? sponsorsPageHTML() : notFoundHTML();
    case 'inscricoes': return has('inscricoes') ? signupHTML() : notFoundHTML();
    case 'contactos': return contactsHTML();
    default: return notFoundHTML();
  }
}

function pageTitle(page, id, labels) {
  const name = data.club.name;
  const map = {
    calendario: 'Calendário', resultados: 'Resultados', equipas: 'Equipas', noticias: 'Notícias',
    loja: 'Loja', historia: 'História', patrocinadores: 'Patrocinadores', inscricoes: 'Inscrições',
    contactos: 'Contactos',
  };
  if (page === 'equipas' && id && labels[id]) return `${labels[id]} — ${name}`;
  if (page === 'noticia') {
    const p = (data.posts || []).find((x) => x.id === id);
    if (p) return `${p.title} — ${name}`;
  }
  return map[page] ? `${map[page]} — ${name}` : name;
}

// --- Adicionar ao calendário --------------------------------------------------

// Um .ics de um só jogo, feito no browser. A hora vai "flutuante" (sem fuso):
// é a hora do pavilhão, e é essa que o telemóvel de quem lá vai deve mostrar.
function icsText(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

function downloadIcs(id) {
  const g = (data.upcoming || []).find((x) => x.id === id);
  if (!g) return;
  const labels = teamLabels();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const start = startsAt(g);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rumia//Site do clube//PT', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${g.id}@${SITE_DOMAIN}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
  ];
  if (g.time) {
    const end = new Date(start.getTime() + 2 * 3600000);
    const t = (d) => `${stamp(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    lines.push(`DTSTART:${t(start)}`, `DTEND:${t(end)}`);
  } else {
    const next = new Date(start);
    next.setDate(next.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${stamp(start)}`, `DTEND;VALUE=DATE:${stamp(next)}`);
  }
  lines.push(`SUMMARY:${icsText(`${data.club.name} · ${labels[g.team_id] || ''} vs ${g.opponent || g.title || 'A definir'}`)}`);
  if (g.location) lines.push(`LOCATION:${icsText(g.location)}`);
  lines.push(`URL:${location.origin}${location.pathname}${location.search}#/calendario`, 'END:VEVENT', 'END:VCALENDAR');
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `jogo-${String(g.date).slice(0, 10)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// --- Imagem para partilhar ----------------------------------------------------

// O desenho fica num módulo à parte (só se carrega ao carregar no botão): o
// site é aberto com dados móveis, e quase ninguém partilha numa visita.
async function openCard(kind, id) {
  const labels = teamLabels();
  const results = data.results || [];
  const g = results.find((x) => x.id === id);
  if (!g) return;
  let games = [g];
  if (kind === 'round') {
    const moment = heroMoment();
    if (moment.kind === 'ronda') games = moment.games;
  }
  const { openShareCard } = await import('./share-card.js');
  openShareCard({
    kind: games.length > 1 ? 'round' : 'result',
    games,
    labels,
    club: data.club,
    colors: { ...clubColors(), brandInk: inkOn(clubColors().primary), accentInk: inkOn(clubColors().accent) },
    site: `${slug}.${SITE_DOMAIN}`,
    url: `${location.origin}${location.pathname}${location.search}#/resultados`,
  });
}

// --- Encomenda da loja -------------------------------------------------------

function openOrder(productId) {
  const p = (data.products || []).find((x) => x.id === productId);
  if (!p) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'dialog';
  dlg.setAttribute('aria-labelledby', 'order-title');
  dlg.innerHTML = `
    <form class="form" method="dialog" novalidate>
      <div class="dialog__head">
        ${p.photo ? `<img class="dialog__img" src="${esc(mediaUrl(p.photo))}" alt="" />` : ''}
        <div>
          <h2 id="order-title" class="dialog__title">${esc(p.name)}</h2>
          <p class="product__price">${p.price == null ? 'Preço sob consulta' : esc(euros(p.price))}</p>
        </div>
        <button type="button" class="iconbtn dialog__x" data-close aria-label="Fechar">×</button>
      </div>
      ${p.description ? `<div class="prose prose--sm">${paragraphs(p.description)}</div>` : ''}
      <div class="form__grid">
        ${(p.sizes || []).length ? `
        <label class="field">
          <span>Tamanho</span>
          <select name="size" required>
            <option value="">Escolher…</option>
            ${p.sizes.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          </select>
        </label>` : ''}
        <label class="field">
          <span>Quantidade</span>
          <input name="quantity" type="number" min="1" max="20" step="1" value="1" inputmode="numeric" />
        </label>
        <label class="field">
          <span>O teu nome</span>
          <input name="name" required maxlength="120" autocomplete="name" />
        </label>
        <label class="field">
          <span>Telefone ou email</span>
          <input name="contact" required maxlength="160" autocomplete="email tel" />
        </label>
      </div>
      <label class="field">
        <span>Nota <em>(opcional — ex.: nome e número a estampar)</em></span>
        <textarea name="message" rows="2" maxlength="1000"></textarea>
      </label>
      <label class="check">
        <input type="checkbox" name="consent" required />
        <span>Autorizo o clube a guardar estes dados para tratar da encomenda.</span>
      </label>
      <p class="form__note">Não pagas nada agora: o clube contacta-te para combinar o pagamento e a entrega.</p>
      <p class="form__error" role="alert" hidden></p>
      <div class="dialog__done" role="status" hidden></div>
      <button class="btn btn--accent btn--lg" type="submit" value="send">Enviar pedido</button>
    </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector('form');
  const err = dlg.querySelector('.form__error');
  const close = () => { dlg.close(); };
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  dlg.querySelector('[data-close]').addEventListener('click', close);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(form));
    const fail = (msg) => { err.textContent = msg; err.hidden = false; };
    if (form.elements.size && !v.size) return fail('Escolhe o tamanho.');
    const qty = Math.round(Number(v.quantity) || 0);
    if (qty < 1 || qty > 20) return fail('A quantidade tem de estar entre 1 e 20.');
    if (String(v.name || '').trim().length < 2) return fail('Escreve o teu nome.');
    if (String(v.contact || '').trim().length < 6) return fail('Deixa um telefone ou um email para o clube te contactar.');
    if (!form.consent.checked) return fail('É preciso autorizar o tratamento dos dados para o clube te poder contactar.');
    err.hidden = true;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'A enviar…';
    try {
      await rpc('public_shop_order', {
        p_slug: slug,
        p_product_id: p.id,
        p_size: v.size || null,
        p_quantity: qty,
        p_name: v.name,
        p_contact: v.contact,
        p_message: v.message || null,
        p_consent: true,
      });
      form.querySelectorAll('.field, .check, .form__grid, .form__note, button[type="submit"]').forEach((x) => { x.hidden = true; });
      const done = dlg.querySelector('.dialog__done');
      done.innerHTML = '<p><strong>Pedido enviado!</strong></p><p>O clube vai contactar-te para combinar o pagamento e a entrega.</p><button type="button" class="btn btn--brand" data-close>Fechar</button>';
      done.hidden = false;
      done.querySelector('[data-close]').addEventListener('click', close);
    } catch (ex) {
      fail(/failed to fetch|network/i.test(ex.message) ? 'Sem ligação. Verifica a internet e tenta de novo.' : ex.message);
      btn.disabled = false;
      btn.textContent = 'Enviar pedido';
    }
  });
  dlg.showModal();
}

// --- Página ----------------------------------------------------------------

function clubColors() {
  const c = data.club;
  return {
    primary: /^#[0-9a-f]{6}$/i.test(c.primary || '') ? c.primary : '#143b61',
    accent: /^#[0-9a-f]{6}$/i.test(c.accent || '') ? c.accent : '#f2b705',
  };
}

function applyTheme() {
  const c = data.club;
  const { primary, accent } = clubColors();
  const s = document.documentElement.style;
  s.setProperty('--brand', primary);
  s.setProperty('--brand-ink', inkOn(primary));
  s.setProperty('--accent', accent);
  s.setProperty('--accent-ink', inkOn(accent));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
  const desc = [c.motto, 'Calendário, resultados, equipas, notícias e loja do clube.'].filter(Boolean).join(' · ');
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
  if (c.logo) document.querySelector('link[rel="icon"]')?.setAttribute('href', c.logo);
}

let lastRoute = null;

function render() {
  // Trocar de escalão ou abrir "mostrar mais" re-desenha a página: o que já
  // estava escrito no formulário de inscrição não se pode perder com isso.
  const draft = root.querySelector('#signup');
  const kept = draft
    ? { values: Object.fromEntries(new FormData(draft)), consent: draft.consent?.checked }
    : null;
  stopSlides();
  const labels = teamLabels();
  const { page, id } = route();
  const key = `${page}/${id}`;
  applyTheme();
  document.title = pageTitle(page, id, labels);
  root.removeAttribute('aria-busy');
  const preview = data.published === false
    ? '<p class="preview" role="status">Pré-visualização: só tu vês esta página. O site ainda não está publicado.</p>'
    : '';
  root.innerHTML = `
    ${preview}
    ${headerHTML(page)}
    <main id="main" class="main main--${page || 'inicio'}">${pageHTML(page, id, labels)}</main>
    ${footerHTML()}
    ${dockHTML(page)}`;
  root.classList.toggle('has-dock', Boolean(root.querySelector('.dock')));
  const form = root.querySelector('#signup');
  if (form && kept) {
    Object.entries(kept.values).forEach(([k, v]) => {
      if (form.elements[k] && k !== 'consent') form.elements[k].value = v;
    });
    form.consent.checked = Boolean(kept.consent);
  }
  if (lastRoute !== null && lastRoute !== key) window.scrollTo(0, 0);
  lastRoute = key;
  wire();
}

// O menu passa a gaveta quando não cabe na barra — e isso depende do nome do
// clube, que vai de "CVA" a "Clube Desportivo e Recreativo da Senhora da
// Hora". Uma largura fixa de corte servia uns e cortava o "Contactos" a outros.
function fitNav() {
  const bar = root.querySelector('.topbar');
  const nav = bar?.querySelector('.topnav');
  if (!nav) return;
  bar.classList.remove('topbar--burger');
  if (window.innerWidth <= 1000 || nav.scrollWidth > nav.clientWidth + 1) bar.classList.add('topbar--burger');
}

function wire() {
  fitNav();
  root.querySelector('[data-menu]')?.addEventListener('click', () => {
    menuOpen = !menuOpen;
    const menu = root.querySelector('#menu');
    menu.hidden = !menuOpen;
    menu.classList.toggle('is-open', menuOpen);
    root.querySelector('[data-menu]').setAttribute('aria-expanded', String(menuOpen));
  });
  root.querySelectorAll('[data-team]').forEach((btn) =>
    btn.addEventListener('click', () => {
      teamFilter = btn.dataset.team;
      resultsShown = RESULTS_STEP;
      calDay = '';
      writeStore(`rumia-site-team:${slug}`, teamFilter);
      render();
    })
  );
  root.querySelectorAll('[data-more]').forEach((btn) =>
    btn.addEventListener('click', () => {
      resultsShown = Infinity;
      render();
    })
  );
  root.querySelectorAll('[data-month]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const today = new Date();
      if (btn.dataset.month === 'today') calMonth = { y: today.getFullYear(), m: today.getMonth() };
      else {
        const d = new Date(calMonth.y, calMonth.m + Number(btn.dataset.month), 1);
        calMonth = { y: d.getFullYear(), m: d.getMonth() };
      }
      calDay = '';
      render();
    })
  );
  root.querySelectorAll('[data-day]').forEach((btn) =>
    btn.addEventListener('click', () => {
      calDay = btn.dataset.day === calDay ? '' : btn.dataset.day;
      render();
      if (calDay && window.innerWidth < 900) root.querySelector('.calside')?.scrollIntoView({ block: 'start' });
    })
  );
  root.querySelectorAll('[data-order]').forEach((btn) =>
    btn.addEventListener('click', () => openOrder(btn.dataset.order))
  );
  root.querySelectorAll('[data-ics]').forEach((btn) =>
    btn.addEventListener('click', () => downloadIcs(btn.dataset.ics))
  );
  root.querySelectorAll('[data-card]').forEach((btn) =>
    btn.addEventListener('click', () => openCard(btn.dataset.card, btn.dataset.id))
  );
  root.querySelector('[data-share]')?.addEventListener('click', async (e) => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else {
        await navigator.clipboard.writeText(url);
        e.currentTarget.textContent = 'Link copiado';
      }
    } catch { /* quem cancela a partilha não fez nada de errado */ }
  });
  const form = root.querySelector('#signup');
  if (form) form.addEventListener('submit', onSignup);
  wireCarousel();
}

async function onSignup(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const err = form.querySelector('#signup-error');
  const btn = form.querySelector('button[type="submit"]');
  const v = Object.fromEntries(new FormData(form));
  const fail = (msg) => {
    err.textContent = msg;
    err.hidden = false;
  };
  // A validação a sério é no servidor; isto só poupa uma ida e volta a quem
  // se esqueceu de um campo.
  if (!String(v.name || '').trim()) return fail('Escreve o nome do atleta.');
  if (String(v.contact || '').trim().length < 6) return fail('Deixa um telefone ou um email para o clube te contactar.');
  if (!form.consent.checked) return fail('É preciso autorizar o tratamento dos dados para o clube te poder contactar.');
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = 'A enviar…';
  try {
    await rpc('public_site_signup', {
      p_slug: slug,
      p_name: v.name,
      p_birth_year: v.birth_year || null,
      p_contact: v.contact,
      p_team_id: v.team_id || null,
      p_message: v.message || null,
      p_consent: true,
    });
    signupDone = true;
    render();
    window.scrollTo(0, 0);
  } catch (ex) {
    fail(/failed to fetch|network/i.test(ex.message)
      ? 'Sem ligação. Verifica a internet e tenta de novo.'
      : ex.message);
    btn.disabled = false;
    btn.textContent = 'Enviar pedido';
  }
}

function message(title, body) {
  root.removeAttribute('aria-busy');
  root.innerHTML = `
    <div class="notice">
      <h1>${esc(title)}</h1>
      <p>${body}</p>
    </div>`;
}

// O mesmo site, aberto na versão anterior (sem galeria, notícias nem loja):
// uma cópia guardada de antes desta versão não tem estas listas, e o resto do
// código assume que existem.
function normalize(d) {
  return {
    ...d,
    sections: d.sections || {},
    teams: d.teams || [],
    upcoming: d.upcoming || [],
    results: d.results || [],
    sponsors: d.sponsors || [],
    photos: d.photos || [],
    posts: d.posts || [],
    products: d.products || [],
  };
}

async function start() {
  if (!API_URL || !API_KEY) {
    message('Site por configurar', 'Faltam as variáveis do Supabase neste alojamento.');
    return;
  }
  slug = slugFromLocation();
  if (!slug) {
    message('Que clube?', `Abre o endereço do clube, por exemplo <strong>o-teu-clube.${esc(SITE_DOMAIN)}</strong>.`);
    return;
  }
  teamFilter = readStore(`rumia-site-team:${slug}`) || '';

  window.addEventListener('hashchange', () => {
    menuOpen = false;
    if (data) render();
  });
  window.addEventListener('resize', fitNav);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menuOpen) {
      menuOpen = false;
      if (data) render();
    }
  });

  // Quem já cá esteve vê logo a última versão, e a página atualiza-se quando
  // a resposta chega — um jogo de sábado não muda entre duas visitas.
  const cached = readStore(`rumia-site:${slug}`);
  if (cached?.data) {
    data = normalize(cached.data);
    if (teamFilter && !data.teams.some((t) => t.id === teamFilter)) teamFilter = '';
    render();
  }

  try {
    const fresh = await rpc('public_club_site', { p_slug: slug });
    if (!fresh) {
      try { localStorage.removeItem(`rumia-site:${slug}`); } catch { /* sem armazenamento */ }
      message('Site não encontrado', `Este clube não tem site publicado em <strong>${esc(slug)}.${esc(SITE_DOMAIN)}</strong>.`);
      return;
    }
    const same = cached?.data && JSON.stringify(cached.data) === JSON.stringify(fresh);
    data = normalize(fresh);
    // Uma pré-visualização não fica guardada: era o que um visitante deste
    // dispositivo veria depois, sem o site estar publicado.
    if (fresh.published !== false) writeStore(`rumia-site:${slug}`, { at: Date.now(), data: fresh });
    if (teamFilter && !data.teams.some((t) => t.id === teamFilter)) teamFilter = '';
    if (!same) render();
  } catch (ex) {
    if (!data) message('Sem ligação', 'Não foi possível carregar o site do clube. Tenta de novo daqui a pouco.');
  }
}

start();
