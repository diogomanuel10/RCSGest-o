// Site público do clube (<clube>.rumia.pt).
//
// Não importa nada da app: nem o cliente do Supabase, nem o store, nem o
// design system. Quem abre isto é um pai no telemóvel, vindo de um link do
// Instagram, muitas vezes com dados móveis — e o que precisa são duas
// chamadas `fetch` e uma página. Os dados vêm de duas RPCs públicas
// (`public_club_site` e `public_site_signup`, ver `supabase/site-publico.sql`),
// que só devolvem o que é público: nenhum atleta sai de lá.

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
const AGENDA_STEP = 12;
const RESULTS_STEP = 10;

let data = null;
let slug = '';
let teamFilter = '';
let agendaShown = AGENDA_STEP;
let resultsShown = RESULTS_STEP;
let signupDone = false;

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
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dayLabel(s) {
  const d = parseDay(s);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  const txt = d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function monthLabel(s) {
  const txt = parseDay(s).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function hhmm(t) {
  return t ? String(t).slice(0, 5) : '';
}

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

// Pela ordem dos escalões do clube (Minis antes de Seniores), não alfabética.
function orderedTeams() {
  const order = Array.isArray(data?.club?.escaloes) ? data.club.escaloes : [];
  const rank = (e) => {
    const i = order.indexOf(e);
    return i === -1 ? 999 : i;
  };
  return [...(data?.teams || [])].sort(
    (a, b) => rank(a.escalao) - rank(b.escalao) || a.escalao.localeCompare(b.escalao) || a.gender.localeCompare(b.gender)
  );
}

function filtered(list) {
  return teamFilter ? list.filter((g) => g.team_id === teamFilter) : list;
}

// --- Blocos ----------------------------------------------------------------

function heroHTML() {
  const c = data.club;
  const logo = c.logo
    ? `<img class="hero__logo" src="${esc(c.logo)}" alt="" />`
    : `<span class="hero__logo hero__logo--initials" aria-hidden="true">${esc(initials(c.name))}</span>`;
  const s = data.sections;
  const links = [
    s.agenda && ['agenda', 'Jogos'],
    s.resultados && ['resultados', 'Resultados'],
    s.patrocinadores && (data.sponsors || []).length && ['patrocinadores', 'Patrocinadores'],
    s.inscricoes && ['inscricoes', 'Inscrições'],
    ['contactos', 'Contactos'],
  ].filter(Boolean);
  return `
    <header class="hero">
      <div class="wrap hero__inner">
        ${logo}
        <div class="hero__text">
          <h1 class="hero__name">${esc(c.name)}</h1>
          ${c.motto ? `<p class="hero__motto">${esc(c.motto)}</p>` : ''}
        </div>
      </div>
      <nav class="site-nav" aria-label="Secções">
        <div class="wrap site-nav__inner">
          ${links.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}
        </div>
      </nav>
    </header>`;
}

function nextGameHTML(labels) {
  const g = filtered(data.upcoming || [])[0];
  if (!data.sections.agenda || !g) return '';
  return `
    <section class="next" aria-label="Próximo jogo">
      <p class="next__kicker">Próximo jogo · ${esc(labels[g.team_id] || '')}</p>
      <p class="next__match">${esc(data.club.name)} <span class="next__vs">vs</span> ${esc(g.opponent || g.title || 'A definir')}</p>
      <p class="next__when">
        <strong>${esc(dayLabel(g.date))}${g.time ? ` · ${esc(hhmm(g.time))}` : ''}</strong>
        ${g.location ? `<span>${esc(g.location)}</span>` : ''}
      </p>
    </section>`;
}

function filterHTML(labels) {
  const teams = orderedTeams();
  if (teams.length < 2 || !(data.sections.agenda || data.sections.resultados)) return '';
  const chip = (id, label) => `
    <button type="button" class="chip${teamFilter === id ? ' chip--on' : ''}"
            data-team="${esc(id)}" aria-pressed="${teamFilter === id}">${esc(label)}</button>`;
  return `
    <div class="chips" role="group" aria-label="Escolher escalão">
      ${chip('', 'Todos')}
      ${teams.map((t) => chip(t.id, labels[t.id])).join('')}
    </div>`;
}

function agendaHTML(labels) {
  if (!data.sections.agenda) return '';
  const all = filtered(data.upcoming || []);
  const list = all.slice(0, agendaShown);
  let month = '';
  const rows = list.map((g) => {
    const m = monthLabel(g.date);
    const head = m !== month ? `<li class="list__month">${esc(m)}</li>` : '';
    month = m;
    return `${head}
      <li class="game">
        <div class="game__when">
          <span class="game__day">${esc(dayLabel(g.date))}</span>
          ${g.time ? `<span class="game__time">${esc(hhmm(g.time))}</span>` : ''}
        </div>
        <div class="game__body">
          <p class="game__title">vs ${esc(g.opponent || g.title || 'A definir')}</p>
          <p class="game__meta">${esc(labels[g.team_id] || '')}${g.location ? ` · ${esc(g.location)}` : ''}</p>
        </div>
      </li>`;
  }).join('');
  const more = all.length > agendaShown
    ? `<button type="button" class="more" data-more="agenda">Mostrar os restantes ${all.length - agendaShown}</button>`
    : '';
  return `
    <section class="block" id="agenda">
      <h2 class="block__title">Próximos jogos</h2>
      ${rows ? `<ul class="list">${rows}</ul>${more}` : `<p class="empty">Não há jogos marcados${teamFilter ? ' para este escalão' : ''}.</p>`}
    </section>`;
}

function resultsHTML(labels) {
  if (!data.sections.resultados) return '';
  const all = filtered(data.results || []);
  const list = all.slice(0, resultsShown);
  const rows = list.map((g) => {
    const win = g.sets_for > g.sets_against;
    const draw = g.sets_for === g.sets_against;
    const tag = draw ? ['E', 'draw', 'Empate'] : win ? ['V', 'win', 'Vitória'] : ['D', 'loss', 'Derrota'];
    const sets = (g.sets || []).map(([a, b]) => `${a}–${b}`).join(' · ');
    return `
      <li class="game">
        <span class="result result--${tag[1]}" title="${tag[2]}" aria-label="${tag[2]}">${tag[0]}</span>
        <div class="game__body">
          <p class="game__title">vs ${esc(g.opponent || g.title || 'Adversário')}
            <span class="score">${esc(g.sets_for)}–${esc(g.sets_against)}</span></p>
          <p class="game__meta">${esc(dayLabel(g.date))} · ${esc(labels[g.team_id] || '')}${sets ? ` · <span class="sets">${esc(sets)}</span>` : ''}</p>
        </div>
      </li>`;
  }).join('');
  const more = all.length > resultsShown
    ? `<button type="button" class="more" data-more="results">Mostrar os restantes ${all.length - resultsShown}</button>`
    : '';
  return `
    <section class="block" id="resultados">
      <h2 class="block__title">Resultados</h2>
      ${rows ? `<ul class="list">${rows}</ul>${more}` : `<p class="empty">Ainda não há resultados${teamFilter ? ' deste escalão' : ''} esta época.</p>`}
    </section>`;
}

const TIER_LABEL = { ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze' };

function sponsorsHTML() {
  const list = data.sponsors || [];
  if (!data.sections.patrocinadores || !list.length) return '';
  const groups = ['ouro', 'prata', 'bronze', ''].map((tier) => ({
    tier,
    items: list.filter((s) => (TIER_LABEL[s.tier] ? s.tier : '') === tier),
  })).filter((g) => g.items.length);
  return `
    <section class="block" id="patrocinadores">
      <h2 class="block__title">Quem nos apoia</h2>
      ${groups.map((g) => `
        ${g.tier ? `<p class="tier tier--${g.tier}">${TIER_LABEL[g.tier]}</p>` : groups.length > 1 ? '<p class="tier">Apoios</p>' : ''}
        <ul class="sponsors sponsors--${g.tier || 'base'}">
          ${g.items.map((s) => `
            <li class="sponsor">
              <span class="sponsor__name">${esc(s.name)}</span>
              ${s.category ? `<span class="sponsor__cat">${esc(s.category)}</span>` : ''}
            </li>`).join('')}
        </ul>`).join('')}
    </section>`;
}

function signupHTML() {
  if (!data.sections.inscricoes) return '';
  if (signupDone) {
    return `
      <section class="block" id="inscricoes">
        <h2 class="block__title">Inscrições</h2>
        <div class="done" role="status">
          <p><strong>Pedido enviado.</strong></p>
          <p>O clube recebeu o teu pedido e vai entrar em contacto pelo telefone ou email que deixaste.</p>
        </div>
      </section>`;
  }
  const teams = orderedTeams();
  const labels = teamLabels();
  return `
    <section class="block" id="inscricoes">
      <h2 class="block__title">Quero fazer parte</h2>
      <p class="block__lead">Deixa os teus dados e o clube entra em contacto para marcar um treino de experiência.</p>
      <form class="form" id="signup" novalidate>
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
        <button class="btn" type="submit">Enviar pedido</button>
      </form>
    </section>`;
}

function contactsHTML() {
  const c = data.contacts || {};
  const items = [];
  if (c.address) items.push(`<li><span class="ct__k">Onde estamos</span><span>${esc(c.address)}</span></li>`);
  if (c.phone) {
    const tel = String(c.phone).replace(/[^\d+]/g, '');
    items.push(`<li><span class="ct__k">Telefone</span><a href="tel:${esc(tel)}">${esc(c.phone)}</a></li>`);
  }
  if (c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
    items.push(`<li><span class="ct__k">Email</span><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>`);
  }
  const ig = socialUrl(c.instagram, 'https://instagram.com');
  const fb = socialUrl(c.facebook, 'https://facebook.com');
  const social = [
    ig && `<a class="social" href="${esc(ig)}" target="_blank" rel="noopener">Instagram</a>`,
    fb && `<a class="social" href="${esc(fb)}" target="_blank" rel="noopener">Facebook</a>`,
  ].filter(Boolean).join('');
  return `
    <section class="block" id="contactos">
      <h2 class="block__title">${data.about ? 'Sobre o clube' : 'Contactos'}</h2>
      ${data.about ? `<p class="about">${esc(data.about).replace(/\n/g, '<br />')}</p>` : ''}
      ${items.length ? `<ul class="ct">${items.join('')}</ul>` : ''}
      ${social ? `<div class="socials">${social}</div>` : ''}
      ${!data.about && !items.length && !social ? '<p class="empty">O clube ainda não deixou contactos.</p>' : ''}
    </section>`;
}

// --- Página ----------------------------------------------------------------

function applyTheme() {
  const c = data.club;
  const primary = /^#[0-9a-f]{6}$/i.test(c.primary || '') ? c.primary : '#143b61';
  const accent = /^#[0-9a-f]{6}$/i.test(c.accent || '') ? c.accent : '#f2b705';
  const s = document.documentElement.style;
  s.setProperty('--brand', primary);
  s.setProperty('--brand-ink', inkOn(primary));
  s.setProperty('--accent', accent);
  s.setProperty('--accent-ink', inkOn(accent));
  document.title = `${c.name} — Jogos e resultados`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', primary);
  const desc = [c.motto, 'Agenda de jogos, resultados e contactos.'].filter(Boolean).join(' · ');
  document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
  if (c.logo) document.querySelector('link[rel="icon"]')?.setAttribute('href', c.logo);
}

function render() {
  // Trocar de escalão ou abrir "mostrar mais" re-desenha a página: o que já
  // estava escrito no formulário de inscrição não se pode perder com isso.
  const draft = root.querySelector('#signup');
  const kept = draft
    ? { values: Object.fromEntries(new FormData(draft)), consent: draft.consent?.checked }
    : null;
  const labels = teamLabels();
  applyTheme();
  root.removeAttribute('aria-busy');
  const preview = data.published === false
    ? `<p class="preview" role="status">Pré-visualização: só tu vês esta página. O site ainda não está publicado.</p>`
    : '';
  root.innerHTML = `
    ${preview}
    ${heroHTML()}
    <main class="wrap main">
      ${nextGameHTML(labels)}
      ${filterHTML(labels)}
      <div class="cols">
        <div>
          ${agendaHTML(labels)}
          ${resultsHTML(labels)}
        </div>
        <div>
          ${sponsorsHTML()}
          ${contactsHTML()}
        </div>
      </div>
      ${signupHTML()}
    </main>
    <footer class="foot">
      <div class="wrap foot__inner">
        <span>${esc(data.club.name)}${data.club.season ? ` · Época ${esc(data.club.season)}` : ''}</span>
        <a href="https://www.${esc(SITE_DOMAIN)}" target="_blank" rel="noopener">Feito com Rumia</a>
      </div>
    </footer>`;
  const form = root.querySelector('#signup');
  if (form && kept) {
    Object.entries(kept.values).forEach(([k, v]) => {
      if (form.elements[k] && k !== 'consent') form.elements[k].value = v;
    });
    form.consent.checked = Boolean(kept.consent);
  }
  wire();
}

function wire() {
  root.querySelectorAll('[data-team]').forEach((btn) =>
    btn.addEventListener('click', () => {
      teamFilter = btn.dataset.team;
      agendaShown = AGENDA_STEP;
      resultsShown = RESULTS_STEP;
      writeStore(`rumia-site-team:${slug}`, teamFilter);
      render();
    })
  );
  root.querySelectorAll('[data-more]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (btn.dataset.more === 'agenda') agendaShown = Infinity;
      else resultsShown = Infinity;
      render();
    })
  );
  const form = root.querySelector('#signup');
  if (form) form.addEventListener('submit', onSignup);
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
    root.querySelector('#inscricoes')?.scrollIntoView({ block: 'start' });
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

  // Quem já cá esteve vê logo a última versão, e a página atualiza-se quando
  // a resposta chega — um jogo de sábado não muda entre duas visitas.
  const cached = readStore(`rumia-site:${slug}`);
  if (cached?.data) {
    data = cached.data;
    if (teamFilter && !(data.teams || []).some((t) => t.id === teamFilter)) teamFilter = '';
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
    data = fresh;
    // Uma pré-visualização não fica guardada: era o que um visitante deste
    // dispositivo veria depois, sem o site estar publicado.
    if (fresh.published !== false) writeStore(`rumia-site:${slug}`, { at: Date.now(), data });
    if (teamFilter && !(data.teams || []).some((t) => t.id === teamFilter)) teamFilter = '';
    if (!same) render();
  } catch (ex) {
    if (!data) message('Sem ligação', 'Não foi possível carregar o site do clube. Tenta de novo daqui a pouco.');
  }
}

start();
