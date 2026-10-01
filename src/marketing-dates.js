// Datas relevantes para as redes sociais do clube.
//
// O catálogo vive no CÓDIGO e não na base de dados: é o mesmo para todos os
// clubes, e algumas datas mudam todos os anos (o Carnaval e a Páscoa andam com
// a lua, o Dia da Mãe é o primeiro domingo de maio). Guardadas como linhas,
// alguém teria de as reescrever em cada janeiro — e é exatamente esse alguém
// que se esquece. O que é do clube (iniciativas, notas, as datas próprias,
// as que não quer ver) vive em `marketing_items` (ver supabase/marketing.sql).
//
// `star` marca as que encaixam melhor num clube de formação: são as que
// valem uma publicação mesmo num mês cheio.

export const MARKETING_CATEGORIES = [
  { key: 'causa',         label: 'Causa',       badge: 'danger' },
  { key: 'desporto',      label: 'Desporto',    badge: 'ok' },
  { key: 'familia',       label: 'Família',     badge: 'info' },
  { key: 'festa',         label: 'Festividade', badge: 'gold' },
  { key: 'institucional', label: 'Feriado',     badge: 'muted' },
  { key: 'clube',         label: 'Do clube',    badge: 'num' },
];
export const MARKETING_CATEGORY = Object.fromEntries(MARKETING_CATEGORIES.map((c) => [c.key, c]));

export const INITIATIVE_STATUSES = [
  { key: 'ideia',    label: 'Ideia',     badge: 'muted' },
  { key: 'planeada', label: 'Planeada',  badge: 'info' },
  { key: 'feita',    label: 'Publicada', badge: 'ok' },
];
export const INITIATIVE_STATUS = Object.fromEntries(INITIATIVE_STATUSES.map((s) => [s.key, s]));

// `when`:
//   { m, d }                    dia fixo (m de 1 a 12)
//   { m, d, until: { m, d } }   período (o Outubro Rosa é o mês inteiro)
//   { easter: n }               n dias depois (ou antes) do domingo de Páscoa
//   { m, weekday, nth, plus }   n-ésimo dia da semana do mês (0 = domingo),
//                               mais `plus` dias — a Black Friday é a
//                               sexta a seguir à 4.ª quinta de novembro.
// As chaves são guardadas nas iniciativas (`date_key`): não se mudam.
export const MARKETING_DATES = [
  // Janeiro
  { key: 'ano_novo', when: { m: 1, d: 1 }, label: 'Ano Novo', category: 'festa',
    idea: 'Votos do clube e o que vem aí na segunda metade da época.' },
  { key: 'reis', when: { m: 1, d: 6 }, label: 'Dia de Reis', category: 'festa',
    idea: 'Bolo-rei no treino dos mais novos.' },
  { key: 'educacao', when: { m: 1, d: 24 }, label: 'Dia Internacional da Educação', category: 'causa',
    idea: 'Atletas que conciliam a escola com o desporto.' },
  // Fevereiro
  { key: 'cancro', when: { m: 2, d: 4 }, label: 'Dia Mundial do Cancro', category: 'causa',
    idea: 'Mensagem de prevenção.' },
  { key: 'voleibol', when: { m: 2, d: 9 }, label: 'Aniversário da invenção do voleibol (1895)', category: 'desporto', star: true,
    idea: 'A história da modalidade, e a do clube dentro dela.' },
  { key: 'carnaval', when: { easter: -47 }, label: 'Carnaval', category: 'festa', star: true,
    idea: 'Treino mascarado nos escalões mais novos.' },
  { key: 'valentim', when: { m: 2, d: 14 }, label: 'Dia dos Namorados', category: 'festa',
    idea: '"Traz um amigo ao treino" — captação.' },
  // Março
  { key: 'mulher', when: { m: 3, d: 8 }, label: 'Dia Internacional da Mulher', category: 'causa', star: true,
    idea: 'As mulheres do clube: atletas, treinadoras, direção.' },
  { key: 'pai', when: { m: 3, d: 19 }, label: 'Dia do Pai', category: 'familia', star: true,
    idea: 'Jogo pais vs filhos.' },
  { key: 'down', when: { m: 3, d: 21 }, label: 'Dia Mundial da Síndrome de Down', category: 'causa', star: true,
    idea: 'Meias trocadas no treino.' },
  { key: 'pascoa', when: { easter: 0 }, label: 'Páscoa', category: 'festa',
    idea: 'Post festivo.' },
  // Abril
  { key: 'autismo', when: { m: 4, d: 2 }, label: 'Dia da Consciencialização do Autismo', category: 'causa',
    idea: 'Inclusão no desporto.' },
  { key: 'desporto_paz', when: { m: 4, d: 6 }, label: 'Dia Internacional do Desporto para o Desenvolvimento e a Paz', category: 'desporto', star: true,
    idea: 'O dia do desporto: porque se joga neste clube.' },
  { key: 'saude', when: { m: 4, d: 7 }, label: 'Dia Mundial da Saúde', category: 'causa',
    idea: 'Atividade física e hábitos saudáveis.' },
  { key: 'liberdade', when: { m: 4, d: 25 }, label: 'Dia da Liberdade', category: 'institucional',
    idea: 'Post institucional.' },
  // Maio
  { key: 'trabalhador', when: { m: 5, d: 1 }, label: 'Dia do Trabalhador', category: 'institucional',
    idea: 'Agradecer a quem trabalha pelo clube sem receber.' },
  { key: 'mae', when: { m: 5, weekday: 0, nth: 1 }, label: 'Dia da Mãe', category: 'familia', star: true,
    idea: 'Jogo mães vs filhas, homenagem às mães.' },
  { key: 'familia', when: { m: 5, d: 15 }, label: 'Dia Internacional da Família', category: 'familia',
    idea: 'O clube como família.' },
  // Junho
  { key: 'crianca', when: { m: 6, d: 1 }, label: 'Dia Mundial da Criança', category: 'familia', star: true,
    idea: 'Treino aberto ou dia de captação.' },
  { key: 'portugal', when: { m: 6, d: 10 }, label: 'Dia de Portugal', category: 'institucional',
    idea: 'Atletas do clube nas seleções.' },
  { key: 'santo_antonio', when: { m: 6, d: 13 }, label: 'Santo António', category: 'festa',
    idea: 'Santos populares.' },
  { key: 'olimpico', when: { m: 6, d: 23 }, label: 'Dia Olímpico', category: 'desporto', star: true,
    idea: 'Valores olímpicos, treino aberto.' },
  { key: 'sao_joao', when: { m: 6, d: 24 }, label: 'São João', category: 'festa', star: true,
    idea: 'Arraial de fim de época.' },
  // Julho / agosto
  { key: 'amizade', when: { m: 7, d: 30 }, label: 'Dia Internacional da Amizade', category: 'festa',
    idea: 'Amizades que nasceram no pavilhão.' },
  { key: 'juventude', when: { m: 8, d: 12 }, label: 'Dia Internacional da Juventude', category: 'causa',
    idea: 'Os mais novos do clube.' },
  // Setembro
  { key: 'semana_desporto', when: { m: 9, d: 23, until: { m: 9, d: 30 } }, label: 'Semana Europeia do Desporto', category: 'desporto', star: true,
    idea: 'Treinos abertos para captar atletas novos.' },
  { key: 'coracao', when: { m: 9, d: 29 }, label: 'Dia Mundial do Coração', category: 'causa',
    idea: 'Desporto e saúde cardiovascular.' },
  // Outubro
  { key: 'outubro_rosa', when: { m: 10, d: 1, until: { m: 10, d: 31 } }, label: 'Outubro Rosa', category: 'causa', star: true,
    idea: 'Laço rosa nos equipamentos, foto do plantel de rosa, um jogo "rosa" com donativos.' },
  { key: 'idosos', when: { m: 10, d: 1 }, label: 'Dia Internacional das Pessoas Idosas', category: 'familia',
    idea: 'Os avós que vêm ver os jogos.' },
  { key: 'republica', when: { m: 10, d: 5 }, label: 'Implantação da República / Dia do Professor', category: 'institucional',
    idea: 'Homenagem aos treinadores.' },
  { key: 'saude_mental', when: { m: 10, d: 10 }, label: 'Dia Mundial da Saúde Mental', category: 'causa', star: true,
    idea: 'Atletas a dizer o que o voleibol lhes dá.' },
  { key: 'rapariga', when: { m: 10, d: 11 }, label: 'Dia Internacional da Rapariga', category: 'causa', star: true,
    idea: 'Destaque às atletas da formação.' },
  { key: 'alimentacao', when: { m: 10, d: 16 }, label: 'Dia Mundial da Alimentação', category: 'causa',
    idea: 'Dicas de lanche antes do treino.' },
  { key: 'cancro_mama', when: { m: 10, d: 30 }, label: 'Dia Nacional da Prevenção do Cancro da Mama', category: 'causa',
    idea: 'Fecho do Outubro Rosa: o que se angariou.' },
  { key: 'halloween', when: { m: 10, d: 31 }, label: 'Halloween', category: 'festa',
    idea: 'Treino mascarado nos mais novos.' },
  // Novembro
  { key: 'movember', when: { m: 11, d: 1, until: { m: 11, d: 30 } }, label: 'Movember', category: 'causa',
    idea: 'Saúde masculina: treinadores e séniores de bigode.' },
  { key: 'sao_martinho', when: { m: 11, d: 11 }, label: 'São Martinho', category: 'festa', star: true,
    idea: 'Magusto do clube com as famílias.' },
  { key: 'diabetes', when: { m: 11, d: 14 }, label: 'Dia Mundial da Diabetes', category: 'causa',
    idea: 'Informação de saúde.' },
  { key: 'homem', when: { m: 11, d: 19 }, label: 'Dia Internacional do Homem', category: 'causa',
    idea: 'Liga com o Movember.' },
  { key: 'direitos_crianca', when: { m: 11, d: 20 }, label: 'Dia dos Direitos da Criança', category: 'familia', star: true,
    idea: '"Direito a brincar": os minis em ação.' },
  { key: 'violencia_mulheres', when: { m: 11, d: 25 }, label: 'Dia pela Eliminação da Violência contra as Mulheres', category: 'causa',
    idea: 'Mensagem do clube.' },
  { key: 'black_friday', when: { m: 11, weekday: 4, nth: 4, plus: 1 }, label: 'Black Friday', category: 'festa',
    idea: 'Promoção no merchandising do clube.' },
  // Dezembro
  { key: 'independencia', when: { m: 12, d: 1 }, label: 'Restauração da Independência', category: 'institucional',
    idea: 'Post institucional.' },
  { key: 'deficiencia', when: { m: 12, d: 3 }, label: 'Dia Internacional das Pessoas com Deficiência', category: 'causa', star: true,
    idea: 'Inclusão e voleibol adaptado.' },
  { key: 'voluntariado', when: { m: 12, d: 5 }, label: 'Dia Internacional do Voluntariado', category: 'causa', star: true,
    idea: 'Agradecer aos seccionistas, pais motoristas e a quem faz as mesas.' },
  { key: 'natal', when: { m: 12, d: 25 }, label: 'Natal', category: 'festa', star: true,
    idea: 'Postal do clube com todos os escalões; recolha solidária.' },
  { key: 'fim_ano', when: { m: 12, d: 31 }, label: 'Fim de ano', category: 'festa', star: true,
    idea: 'Os melhores momentos do ano (vídeo ou carrossel).' },
];
export const MARKETING_DATE = Object.fromEntries(MARKETING_DATES.map((d) => [d.key, d]));

// Domingo de Páscoa (algoritmo gregoriano anónimo / Meeus).
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function nthWeekday(year, m, weekday, nth) {
  const first = new Date(year, m - 1, 1);
  const shift = (weekday - first.getDay() + 7) % 7;
  return new Date(year, m - 1, 1 + shift + (nth - 1) * 7);
}

// Dia (ou período) de uma data do catálogo num dado ano.
export function resolveWhen(when, year) {
  if (when.easter != null) {
    const e = easterSunday(year);
    return { start: new Date(year, e.getMonth(), e.getDate() + when.easter), end: null };
  }
  if (when.weekday != null) {
    const d = nthWeekday(year, when.m, when.weekday, when.nth);
    d.setDate(d.getDate() + (when.plus || 0));
    return { start: d, end: null };
  }
  const start = new Date(year, when.m - 1, when.d);
  const end = when.until ? new Date(year, when.until.m - 1, when.until.d) : null;
  return { start, end };
}

// 'AAAA-MM-DD' na hora LOCAL (o toISOString passava a UTC e, à meia-noite
// em Portugal no verão, devolvia o dia anterior).
export function isoDay(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDay(s) {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Todas as ocorrências (catálogo + datas do clube) que tocam [from, to].
// `items` são as linhas de `marketing_items`: as 'data' entram como datas do
// clube que se repetem todos os anos; as 'oculta' tiram a data do catálogo,
// a menos que `withHidden` (para as poder repor).
export function dateOccurrences(from, to, items = [], { withHidden = false } = {}) {
  const hidden = new Set(items.filter((i) => i.kind === 'oculta').map((i) => i.date_key));
  const out = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    MARKETING_DATES.forEach((def) => {
      const isHidden = hidden.has(def.key);
      if (isHidden && !withHidden) return;
      const { start, end } = resolveWhen(def.when, y);
      out.push({ ...def, start, end, hidden: isHidden, club: false });
    });
    items.filter((i) => i.kind === 'data' && i.date).forEach((i) => {
      const base = parseDay(i.date);
      // O ano da linha é o primeiro em que a data conta (o clube faz 50 anos
      // em 2027, não fez 49 em 2026 só porque a app passou a saber).
      if (y < base.getFullYear()) return;
      out.push({
        key: `club:${i.id}`,
        label: i.title,
        idea: i.notes || '',
        category: 'clube',
        star: true,
        start: new Date(y, base.getMonth(), base.getDate()),
        end: null,
        hidden: false,
        club: true,
        row: i,
      });
    });
  }
  return out
    .filter((o) => (o.end || o.start) >= from && o.start <= to)
    .sort((a, b) => a.start - b.start || (b.end ? 1 : 0) - (a.end ? 1 : 0));
}

// A ocorrência a que uma iniciativa ligada pertence: a da mesma chave mais
// perto da data da iniciativa (um post de Ano Novo pode sair a 31 de
// dezembro — o ano da data não chega para decidir).
export function occurrenceFor(item, occurrences) {
  if (!item.date_key) return null;
  const t = parseDay(item.date).getTime();
  let best = null;
  occurrences.forEach((o) => {
    if (o.key !== item.date_key) return;
    if (!best || Math.abs(o.start - t) < Math.abs(best.start - t)) best = o;
  });
  return best;
}

// Etiqueta de uma chave (para iniciativas cuja data saiu da janela).
export function dateKeyLabel(key, items = []) {
  if (!key) return '';
  if (key.startsWith('club:')) return items.find((i) => `club:${i.id}` === key)?.title || '';
  return MARKETING_DATE[key]?.label || '';
}
