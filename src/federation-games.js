// Ler jogos colados do site da federação (portugalvoleibol.com e afins).
//
// Não há API pública nem exportação: o que existe é uma página com a tabela
// dos jogos da competição. Ir buscá-la do browser não funciona (o site não
// autoriza pedidos de outra origem), e um "scraper" no servidor parte-se no
// dia em que o site muda o HTML — sem ninguém dar por isso até faltar um jogo
// no calendário. Copiar a tabela e colá-la aqui é um gesto que funciona em
// qualquer página que mostre jogos, e o que se lê vê-se SEMPRE numa
// pré-visualização antes de gravar.
//
// Por isso o parser é tolerante e não conhece colunas: cada jogo é uma DATA
// seguida de duas equipas, com hora, resultado, jornada e pavilhão quando lá
// estiverem. Serve a tabela copiada (células separadas por tabulação), o
// cartão de várias linhas e a lista agrupada por dia ("Sábado, 25/10" e por
// baixo os jogos só com a hora).

const MONTHS = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// Sem acentos, minúsculas, pontuação como espaço — para comparar nomes de
// equipas escritos de formas diferentes ("A.D. Sr.ª da Hora" / "AD Sra Hora").
export function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// O nome do clube pode ter vários: separados por vírgula ("Senhora da Hora,
// ADSH"). Conta como nosso se a célula contiver qualquer um deles.
export function clubMatcher(names) {
  const keys = String(names || '').split(',').map(normName).filter(Boolean);
  return (cell) => {
    const n = ` ${normName(cell)} `;
    return keys.some((k) => n.includes(` ${k} `));
  };
}

// Duas formas de escrever o mesmo adversário contam como o mesmo: o site pode
// acrescentar o escalão ou o patrocinador ao nome.
export function sameTeam(a, b) {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const pad = (n) => String(n).padStart(2, '0');

// O ano em falta ("25/10") lê-se pela época: de agosto em diante é o ano em
// que a época começa, antes disso é o seguinte.
function seasonYear(month, season) {
  const start = Number(String(season || '').match(/\d{4}/)?.[0]) || new Date().getFullYear();
  return month >= 8 ? start : start + 1;
}

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const DATE_RES = [
  // 2026-10-25
  { re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, get: (m) => [+m[1], +m[2], +m[3]] },
  // 25/10/2026 · 25-10-2026 · 25.10.26
  { re: /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/, get: (m) => [m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]] },
  // 25 Out 2026 · 25 de outubro de 2026 · 25 out.
  {
    re: /\b(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s*(?:de\s+)?(\d{4}))?/i,
    get: (m, season) => {
      const mo = MONTHS[m[2].toLowerCase()];
      return [m[3] ? +m[3] : seasonYear(mo, season), mo, +m[1]];
    },
  },
  // 25/10 (sem ano) — por último, para não comer o "25/10" de "25/10/2026".
  {
    re: /\b(\d{1,2})\/(\d{1,2})\b/,
    get: (m, season) => [seasonYear(+m[2], season), +m[2], +m[1]],
  },
];

function takeDate(text, season) {
  for (const { re, get } of DATE_RES) {
    const m = text.match(re);
    if (!m) continue;
    const [y, mo, d] = get(m, season);
    const date = validDate(y, mo, d);
    if (date) return { date, rest: text.replace(m[0], ' ') };
  }
  return { date: null, rest: text };
}

function takeTime(text) {
  const m = text.match(/\b([01]?\d|2[0-3])\s*[:hH]\s*([0-5]\d)\b/);
  if (!m) return { time: null, rest: text };
  return { time: `${pad(+m[1])}:${m[2]}`, rest: text.replace(m[0], ' ') };
}

function takeJornada(text) {
  const m = text.match(/\b(\d{1,2})\s*[ªaº.]{0,2}\s*jornada\b/i)
    || text.match(/\bjornada\s*(?:n\.?\s*º?\s*)?(\d{1,2})\b/i)
    || text.match(/\bJ\.?\s?(\d{1,2})\b/);
  if (!m) return { jornada: null, rest: text };
  return { jornada: +m[1], rest: text.replace(m[0], ' ') };
}

// Resultado em sets (0–3 de cada lado). Só se lê com a data e a hora já
// tiradas, senão o "20:30" passava por um resultado.
function takeResult(text) {
  const m = text.match(/(?:^|[\s\t])([0-3])\s*[-–x:]\s*([0-3])(?=$|[\s\t])/);
  if (!m) return { result: null, rest: text };
  return { result: `${m[1]}-${m[2]}`, rest: text.replace(m[0], '\t') };
}

const WEEKDAY_RE = /\b(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(-feira)?\b|\b(seg|ter|qua|qui|sex|sáb|sab|dom)\b\.?/gi;

// Palavras de cabeçalho e botões que vêm agarrados à tabela copiada.
const NOISE = new Set([
  'data', 'hora', 'jornada', 'casa', 'fora', 'visitado', 'visitante', 'resultado',
  'resultados', 'local', 'pavilhao', 'jogo', 'jogos', 'equipa', 'equipas',
  'competicao', 'ver', 'detalhes', 'live', 'ao vivo', 'ficha de jogo', 'vs', 'x',
  'adiado', 'a definir', 'por definir', 'sets', 'set', 'classificacao', 'calendario',
  'h', 'de',
]);

// Testa-se sobre o nome SEM acentos: com eles, o `\b` do JavaScript parte as
// palavras no "õ" e o "es" de "Leixões" passava por uma escola.
const LOCATION_RE = /pavilh|\bpav\b|ginasio|complexo|multiusos|polidesportiv|\barena\b|\bnave\b|centro desportivo|escola secund/;

function cellsOf(text) {
  return text
    .split(/\t|\s{2,}|\s[-–|]\s|\s(?:vs\.?|x)\s/i)
    .map((c) => c.replace(/^[\s,;:·•|()-]+|[\s,;:·•|()-]+$/g, '').trim())
    .filter((c) => c.length >= 2 && !/^\d+$/.test(c) && !NOISE.has(normName(c)));
}

function parseLine(line, season) {
  let rest = line;
  let date; let time; let jornada; let result;
  ({ date, rest } = takeDate(rest, season));
  ({ time, rest } = takeTime(rest));
  ({ jornada, rest } = takeJornada(rest));
  ({ result, rest } = takeResult(rest));
  rest = rest.replace(WEEKDAY_RE, ' ');
  const teams = [];
  const locations = [];
  for (const c of cellsOf(rest)) (LOCATION_RE.test(normName(c)) ? locations : teams).push(c);
  return { date, time, jornada, result, teams, locations };
}

// Texto colado → jogos em bruto: `{ date, time, jornada, result, teams[],
// locations[] }`. Só sai um jogo com data e pelo menos duas equipas.
export function parseGamesText(text, { season } = {}) {
  const blocks = [];
  let cur = null;
  let ctxDate = null;
  let ctxJornada = null;

  const open = (f, date) => {
    cur = { ...f, date, jornada: f.jornada ?? ctxJornada, teams: [...f.teams], locations: [...f.locations] };
    blocks.push(cur);
  };

  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/ /g, ' ');
    if (!line.trim()) continue;
    const f = parseLine(line, season);

    // "3.ª Jornada" sozinho numa linha é um título de secção.
    if (f.jornada && !f.date && !f.teams.length && !f.time) {
      ctxJornada = f.jornada;
      cur = null;
      continue;
    }
    if (f.date) {
      ctxDate = f.date;
      open(f, f.date);
      continue;
    }
    if (!cur && !ctxDate) continue; // cabeçalho antes do primeiro jogo
    const full = cur && cur.teams.length >= 2;
    if ((!cur || full) && f.teams.length && (f.time || f.teams.length >= 2)) {
      // Outro jogo debaixo do mesmo dia.
      open(f, ctxDate);
      continue;
    }
    if (!cur) continue;
    // Continuação do cartão do jogo atual. Depois de ter as duas equipas, o
    // que vier é pavilhão, hora ou resultado — um título de competição que
    // apareça a seguir não pode passar por equipa.
    cur.time ??= f.time;
    cur.result ??= f.result;
    cur.jornada ??= f.jornada;
    if (!full) cur.teams.push(...f.teams);
    cur.locations.push(...f.locations);
  }

  return blocks.filter((b) => b.date && b.teams.length >= 2);
}

// Jogo em bruto → jogo do clube: quem é o adversário e se é em casa. O
// visitado vem primeiro em todas as tabelas de competição. Devolve `null`
// quando o clube não está no jogo (a página tem a competição INTEIRA).
export function toClubGame(game, isClub) {
  const i = game.teams.findIndex(isClub);
  if (i === -1) return null;
  const others = game.teams.filter((t, j) => j !== i && !isClub(t));
  if (!others.length) return null;
  const opponent = i === 0 ? others[0] : (game.teams[i - 1] && !isClub(game.teams[i - 1]) ? game.teams[i - 1] : others[0]);
  return {
    date: game.date,
    time: game.time,
    jornada: game.jornada,
    result: game.result,
    home: i === 0,
    opponent,
    location: game.locations[0] || '',
  };
}
