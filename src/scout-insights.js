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
// Isto é do treinador e não chega ao portal: "maior impacto" é um ranking, e
// a atleta não se compara com as colegas (ver `my_scout_games`).

import { counts, playerStats, pointsPlayed, teamSummary, teamCounts, rotationStats, findPlayer, ACT } from './scout-engine.js';
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

const ERR_LABEL = {
  SERVICE: 'no serviço', RECEPTION: 'na receção', ATTACK: 'no ataque',
  BLOCK: 'no bloco', DEFENSE: 'na defesa', SETTING: 'no passe', OTHER: 'noutras ações (rede, invasão…)',
};

// Medidas por atleta que podem dar "melhor jogo da época". Cada uma com o
// mínimo de ações para contar e a forma de a dizer.
const BESTS = [
  ['pts', 'em pontos', (s) => s.pts, () => true, (v) => `${v} pontos`],
  ['kill', 'em pontos de ataque', (s) => s.kill, (s) => s.atk >= 5, (v) => `${v} pontos de ataque`],
  ['posR', 'em receção', (s) => (s.rec ? s.posR : null), (s) => s.rec >= 6, (v) => `${Math.round(v * 100)}% positiva`],
  ['effA', 'em eficácia de ataque', (s) => (s.atk ? s.effA : null), (s) => s.atk >= 6, (v) => `${Math.round(v * 100)}%`],
  ['ace', 'em ases', (s) => s.ace, () => true, (v) => `${v} ases`],
];

// A dica é { tone, icon, title, text }. `season` são os OUTROS jogos
// terminados da equipa (pode vir vazio: as dicas de época ficam de fora).
export function gameInsights(data, { season = [], isSetter = () => false } = {}) {
  const out = [];
  const records = [];
  const c = counts([data]);
  const played = pointsPlayed(data);
  const ts = teamSummary([data]);
  const tc = teamCounts([data]);

  // 1. Maior impacto: pontos ganhos menos erros. A fórmula diz-se, para não
  //    parecer uma nota inventada.
  const rows = Object.keys(c)
    .map((id) => ({ id, p: findPlayer(data, id), s: playerStats(c[id]) }))
    .filter((r) => r.p && r.s.pts + r.s.errs >= 3)
    .map((r) => ({ ...r, net: r.s.pts - r.s.errs }))
    .sort((a, b) => b.net - a.net || b.s.pts - a.s.pts);
  if (rows.length && rows[0].net > 0) {
    const [a, b] = rows;
    out.push({
      tone: 'ok', icon: '🔥', title: 'Maior impacto',
      text: `${who(a.p)}: ${a.s.pts} ponto${a.s.pts === 1 ? '' : 's'} e ${a.s.errs} erro${a.s.errs === 1 ? '' : 's'} (saldo +${a.net})${played[a.id] ? ` em ${played[a.id]} pontos em campo` : ''}.${b && b.net > 0 ? ` A seguir: ${who(b.p)} (+${b.net}).` : ''}`,
    });
  }

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

  // 5. A rotação mais difícil e a melhor. Só rotações com rallies que
  //    cheguem para dizer alguma coisa.
  const rs = rotationStats([data], { isSetter });
  const ok = rs.list.filter((r) => r.n >= 6);
  if (ok.length >= 2) {
    const byRate = ok.slice().sort((a, b) => a.won / a.n - b.won / b.n);
    const worst = byRate[0];
    const best = byRate[byRate.length - 1];
    if (best.won / best.n - worst.won / worst.n >= 0.15) {
      const wl = rotationLabel(worst, data);
      const bl = rotationLabel(best, data);
      out.push({
        tone: 'warn', icon: '🔄', title: 'Rotação mais difícil',
        text: `${wl.short} (${wl.long}): ganhámos ${worst.won} de ${worst.n} pontos. A melhor foi ${bl.short}, com ${best.won} de ${best.n}.`,
      });
    }
  }

  return [...out, ...records];
}
