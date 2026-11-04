// Análise pós-jogo do scout: dicas para o TREINADOR, tiradas das ações.
//
// Regras e não "inteligência": cada dica sai de uma conta que se pode
// verificar e diz o número que a sustenta. "A Ana esteve on fire" não
// convence ninguém; "6 pontos e 1 erro em 80 pontos em campo" já se usa no
// treino de terça. E funciona sem rede, que é onde o pavilhão está.
//
// Cada regra tem um MÍNIMO de ações: dois ataques certos em dois não é um
// jogo bom, é acaso, e uma dica que se engana duas vezes deixa de ser lida.
//
// Isto é do treinador e não chega ao portal: "destaques do jogo" é um ranking, e
// a atleta não se compara com as colegas (ver `my_scout_games`).

import { counts, playerStats, pointsPlayed, teamSummary, teamCounts, rotationStats, phaseStats, atkEff, findPlayer, qualityOf, ACT } from './scout-engine.js';
import { state } from './store.js';
import { TACTICAL_ROLE_MATCH } from './constants.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const short = (p) => {
  const parts = String(p?.name || '').trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0] || '?';
};
const who = (p) => `${p?.num ? `${p.num} · ` : ''}${short(p)}`;

// A distribuidora lê-se da FICHA (a posição é configurável pelo clube, daí a
// palavra-chave). O plantel copiado para o jogo não guarda posições.
export function setterFinder() {
  const keys = TACTICAL_ROLE_MATCH.distribuidora;
  const ids = new Set(state.players
    .filter((p) => p.position && keys.some((k) => p.position.toLowerCase().includes(k)))
    .map((p) => p.id));
  return (pid) => ids.has(pid);
}

// O nome de uma rotação, para a tabela e para as dicas. `datas` é um jogo ou
// vários (na época, a atleta procura-se no plantel de qualquer um deles).
export function rotationLabel(r, datas) {
  if (r.setter) return { short: `R${r.zone}`, long: `distribuidora na zona ${r.zone}` };
  let p = null;
  for (const d of [].concat(datas)) { p = findPlayer(d, r.pid); if (p) break; }
  return { short: p ? who(p) : '—', long: 'a servir' };
}

// Mínimos das regras de rotação e de fase: rallies de uma rotação NUMA fase
// (side-out ou break-point), e ataques num grupo (K1, K2, uma qualidade de
// receção). Abaixo disto a diferença é acaso.
const ROT_MIN = 5;
const PHASE_MIN = 6;

const ERR_LABEL = {
  SERVICE: 'no serviço', RECEPTION: 'na receção', ATTACK: 'no ataque',
  BLOCK: 'no bloco', DEFENSE: 'na defesa', SETTING: 'no passe', OTHER: 'noutras ações (rede, invasão…)',
};

// Medidas de QUALIDADE por fundamento: a do "melhor jogo da época" e a dos
// destaques do jogo. Percentagens e não contagens — contar pontos ou ases
// deixava a líbero sempre de fora, por mais que a receção dela decidisse o
// jogo. Cada uma com o mínimo de ações para contar e a forma de a dizer.
const pctTxt = (v) => `${Math.round(v * 100)}%`;
const BESTS = [
  ['posR', 'em receção', (s) => (s.rec ? s.posR : null), (s) => s.rec >= 8, (v) => `${pctTxt(v)} positiva`, 'rec'],
  ['effA', 'em eficácia de ataque', (s) => (s.atk ? s.effA : null), (s) => s.atk >= 8, (v) => `${pctTxt(v)} de eficácia`, 'atk'],
  ['posD', 'em defesa', (s) => (s.def ? s.posD : null), (s) => s.def >= 8, (v) => `${pctTxt(v)} positiva`, 'def'],
  ['effS', 'em eficácia de serviço', (s) => (s.srv ? s.effS : null), (s) => s.srv >= 8, (v) => `${pctTxt(v)} de eficácia`, 'srv'],
  ['posP', 'no passe', (s) => (s.pas ? s.posP : null), (s) => s.pas >= 8, (v) => `${pctTxt(v)} positivo`, 'pas'],
];

// A dica é { tone, icon, title, text }. `season` são os OUTROS jogos
// terminados da equipa (pode vir vazio: as dicas de época ficam de fora).
export function gameInsights(data, { season = [], isSetter = () => false } = {}) {
  const out = [];
  const records = [];
  const c = counts([data]);
  const ts = teamSummary([data]);
  const tc = teamCounts([data]);

  // 1. As jogadoras em destaque saíram daqui para um bloco próprio, no topo
  //    da análise (`gameStandouts`): são pessoas e não uma dica, e numa frase
  //    com quatro nomes e quatro percentagens ninguém as via.

  // 2. Melhor jogo da época, contra ela própria. Vão para o FIM da lista: são
  //    boas notícias, e o que pede trabalho (pontos oferecidos, uma ação a
  //    correr mal, a rotação) tem de se ler primeiro. Só com dois jogos anteriores
  //    em que a mesma medida contou — um "recorde" sobre um jogo é nada.
  if (season.length >= 2) {
    const bests = [];
    for (const r of Object.keys(c).map((id) => ({ id, p: findPlayer(data, id), s: playerStats(c[id]) }))) {
      if (!r.p) continue;
      for (const [key, label, val, ok, fmt] of BESTS) {
        if (!ok(r.s)) continue;
        const v = val(r.s);
        if (v == null || v <= 0) continue;
        const prev = season
          .map((g) => counts([g])[r.id])
          .filter(Boolean)
          .map(playerStats)
          .filter(ok)
          .map(val)
          .filter((x) => x != null);
        if (prev.length < 2) continue;
        const max = Math.max(...prev);
        if (v > max) bests.push({ key, r, label, v, max, fmt });
      }
    }
    // Uma por atleta (a primeira medida da lista é a que diz mais), e no
    // máximo três: cinco recordes no mesmo jogo deixam de ser notícia.
    const seen = new Set();
    bests.filter((b) => !seen.has(b.r.id) && seen.add(b.r.id)).slice(0, 3).forEach((b) => records.push({
      tone: 'ok', icon: '⭐', title: 'Melhor jogo da época',
      text: `${who(b.r.p)} ${b.label}: ${b.fmt(b.v)} (o máximo anterior era ${b.fmt(b.max)}).`,
    }));
  }

  // 3. Onde se perderam os pontos: quanto do que o adversário ganhou foi
  //    oferecido por nós, e em que ação.
  if (ts.their >= 10) {
    const share = pct(ts.ourErr, ts.their);
    const worst = Object.keys(ERR_LABEL)
      .map((k) => [k, tc[`${k}.ERROR`] || 0])
      .sort((a, b) => b[1] - a[1])[0];
    out.push(share >= 50
      ? {
        tone: 'warn', icon: '🎯', title: 'Pontos oferecidos',
        text: `${share}% dos ${ts.their} pontos do adversário foram erros nossos (${ts.ourErr})${worst && worst[1] ? ` — o que mais custou foi ${ERR_LABEL[worst[0]]}: ${worst[1]}` : ''}.`,
      }
      : {
        tone: 'info', icon: '🎯', title: 'Pontos do adversário',
        text: `${100 - share}% dos ${ts.their} pontos do adversário foram mérito dele; ${ts.ourErr} foram erros nossos${worst && worst[1] ? `, sobretudo ${ERR_LABEL[worst[0]]} (${worst[1]})` : ''}.`,
      });
  }

  // 4. Uma ação a correr mal a uma atleta: muitos erros nela, e — havendo
  //    época — bem acima do que é normal nela. Sem época, só o número alto.
  const alerts = [];
  for (const r of Object.keys(c).map((id) => ({ id, p: findPlayer(data, id), o: c[id] }))) {
    if (!r.p) continue;
    for (const k of ['SERVICE', 'RECEPTION', 'ATTACK', 'DEFENSE', 'SETTING', 'BLOCK']) {
      const n = r.o[`${k}.ERROR`] || 0;
      if (n < 3) continue;
      const prevGames = season.map((g) => counts([g])[r.id]).filter(Boolean);
      const avg = prevGames.length >= 2 ? prevGames.reduce((a, o) => a + (o[`${k}.ERROR`] || 0), 0) / prevGames.length : null;
      if (avg == null ? n >= 4 : n >= Math.max(3, avg * 2)) alerts.push({ r, k, n, avg });
    }
  }
  alerts.sort((a, b) => b.n - a.n).slice(0, 2).forEach(({ r, k, n, avg }) => out.push({
    tone: 'warn', icon: '⚠️', title: `${ACT[k].l} a rever`,
    text: `${who(r.p)}: ${n} erros ${ERR_LABEL[k]}${avg != null ? ` (costuma ter ${avg.toFixed(1).replace('.', ',')} por jogo)` : ''}.`,
  }));

  // 5. A rotação mais difícil — em side-out e em break-point, cada uma contra
  //    as outras na MESMA fase. Comparar o total de pontos ganhos misturava as
  //    duas: o side-out ganha-se muito mais vezes do que o break-point, e uma
  //    rotação em que calhou servirmos mais parecia "pior" sem jogar pior.
  const rs = rotationStats([data], { isSetter });
  for (const [n, won, title, phase] of [
    ['so', 'soWon', 'Side-out mais difícil', 'quando o adversário servia'],
    ['bp', 'bpWon', 'Break-point mais difícil', 'quando servíamos nós'],
  ]) {
    const ok = rs.list.filter((r) => r[n] >= ROT_MIN);
    if (ok.length < 2) continue;
    const byRate = ok.slice().sort((a, b) => a[won] / a[n] - b[won] / b[n]);
    const worst = byRate[0];
    const best = byRate[byRate.length - 1];
    if (best[won] / best[n] - worst[won] / worst[n] < 0.15) continue;
    const wl = rotationLabel(worst, data);
    const bl = rotationLabel(best, data);
    out.push({
      tone: 'warn', icon: '🔄', title,
      text: `${wl.short} (${wl.long}): ganhámos ${worst[won]} de ${worst[n]} ${phase} (${pct(worst[won], worst[n])}%). A melhor foi ${bl.short}, com ${best[won]} de ${best[n]} (${pct(best[won], best[n])}%).`,
    });
  }

  // 6. Receção → ataque (K1): o ataque cai quando a receção é má? Responde a
  //    "o problema é a receção ou o ataque?" — com receção boa e ataque fraco,
  //    treina-se o ataque; se só cai com receção má, treina-se a receção (ou
  //    a bola alta de recurso).
  const ph = phaseStats([data]);
  const good = { n: 0, kill: 0, err: 0, blk: 0 };
  for (const q of ['PERFECT', 'OK']) for (const k of Object.keys(good)) good[k] += ph.byRec[q][k];
  const bad = ph.byRec.BAD;
  if (good.n >= PHASE_MIN && bad.n >= PHASE_MIN) {
    const eg = atkEff(good);
    const eb = atkEff(bad);
    if (eg - eb >= 0.2) {
      out.push({
        tone: 'warn', icon: '📉', title: 'Receção → ataque',
        text: `Com receção boa (# ou +) a eficácia de ataque foi ${Math.round(eg * 100)}% em ${good.n} ataques; com receção fraca (−) caiu para ${Math.round(eb * 100)}% em ${bad.n}. O ponto a trabalhar é a receção, ou a bola de recurso.`,
      });
    } else if (eg < 0.15) {
      out.push({
        tone: 'warn', icon: '📉', title: 'Receção → ataque',
        text: `Mesmo com receção boa (# ou +) a eficácia de ataque ficou em ${Math.round(eg * 100)}% (${good.kill} pontos, ${good.err + good.blk} erros ou bloqueados em ${good.n}). Aqui o problema não é a receção.`,
      });
    }
  }

  // 7. Transição (K2) contra side-out (K1): quanto do ataque se perde quando a
  //    bola vem de uma defesa. É a fase que decide os sets equilibrados.
  if (ph.k1.n >= PHASE_MIN && ph.k2.n >= PHASE_MIN) {
    const e1 = atkEff(ph.k1);
    const e2 = atkEff(ph.k2);
    const gap = e1 - e2;
    out.push(gap >= 0.15
      ? {
        tone: 'warn', icon: '⚡', title: 'Ataque em transição',
        text: `Em transição (depois de defesa ou bola que voltou) a eficácia foi ${Math.round(e2 * 100)}% em ${ph.k2.n} ataques, contra ${Math.round(e1 * 100)}% no side-out (${ph.k1.n}). É aqui que se perdem os pontos de contra-ataque.`,
      }
      : {
        tone: 'info', icon: '⚡', title: 'Ataque em transição',
        text: `Transição com ${Math.round(e2 * 100)}% de eficácia em ${ph.k2.n} ataques (${ph.k2.kill} pontos); no side-out foi ${Math.round(e1 * 100)}% em ${ph.k1.n}.`,
      });
  }

  return [...out, ...records];
}

// --- Jogadoras em destaque ---------------------------------------------------
//
// Quem se destacou NO JOGO, cada uma pelo que fez de melhor — e não um MVP.
// Comparar posições diferentes numa escala só (pontos, ou um "valor" com
// pesos) põe sempre a oposta à frente da líbero ou o contrário; aqui cada uma
// é medida NO SEU fundamento contra a EQUIPA nesse mesmo jogo: "receção 76%
// boas, a equipa teve 58%".
//
// O peso de um destaque é a diferença para a equipa vezes as ações em que
// assenta: 15 pontos acima em 30 receções pesa mais do que 20 acima em 6. Dá,
// em linguagem de treinador, "quantas bolas bem jogadas a mais do que a
// equipa faria com as mesmas bolas". Soma-se pelos fundamentos em que ela
// ficou acima, para a atleta completa não perder para quem só fez uma coisa.
//
// Mínimos: 6 ações no fundamento (4 no bloco, que tem poucas) e 10 pontos
// acima da equipa — abaixo disso é acaso de um jogo, não destaque.
const STAND = [
  { k: 'RECEPTION', label: 'Receção', min: 6, what: 'receções boas', v: (o) => qualityOf(o, 'RECEPTION') },
  { k: 'ATTACK', label: 'Ataque', min: 6, what: 'de eficácia', v: (o) => { const s = playerStats(o); return { n: s.atk, rate: s.effA }; } },
  { k: 'DEFENSE', label: 'Defesa', min: 6, what: 'defesas boas', v: (o) => qualityOf(o, 'DEFENSE') },
  { k: 'SERVICE', label: 'Serviço', min: 6, what: 'de eficácia', v: (o) => { const s = playerStats(o); return { n: s.srv, rate: s.effS }; } },
  { k: 'SETTING', label: 'Passe', min: 6, what: 'passes bons', v: (o) => qualityOf(o, 'SETTING') },
  { k: 'BLOCK', label: 'Bloco', min: 4, what: 'blocos positivos', v: (o) => qualityOf(o, 'BLOCK') },
];
const STAND_GAP = 0.10;

export function gameStandouts(data, { max = 3 } = {}) {
  const c = counts([data]);
  const tc = teamCounts([data]);
  const played = pointsPlayed(data);
  const team = Object.fromEntries(STAND.map((m) => [m.k, m.v(tc)]));
  const rows = [];
  for (const id of Object.keys(c)) {
    const p = findPlayer(data, id);
    if (!p) continue;
    const reasons = [];
    for (const m of STAND) {
      const me = m.v(c[id]);
      const t = team[m.k];
      if (!me.n || me.n < m.min || me.rate == null || t.rate == null) continue;
      const gap = me.rate - t.rate;
      if (gap < STAND_GAP || me.rate <= 0) continue;
      reasons.push({ k: m.k, label: m.label, what: m.what, rate: me.rate, n: me.n, team: t.rate, weight: gap * me.n });
    }
    if (!reasons.length) continue;
    reasons.sort((a, b) => b.weight - a.weight);
    rows.push({ id, p, reasons, weight: reasons.reduce((a, r) => a + r.weight, 0), played: played[id] || 0 });
  }
  // Um destaque tem de valer ao menos duas bolas bem jogadas a mais: uma
  // diferença de 10 pontos em 6 ações é 0,6, e isso não é um jogo, é um set.
  return rows.filter((r) => r.weight >= 2).sort((a, b) => b.weight - a.weight).slice(0, max)
    .map((r) => ({ ...r, name: who(r.p) }));
}
