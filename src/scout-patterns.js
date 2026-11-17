// Padrões do jogo — lógica pura, sem DOM nem Supabase (como o `scout-engine`).
//
// A tabela por atleta responde a "o quê" e "quanto". Estas contas respondem a
// "ONDE" e "QUANDO", que é o que torna a conversa com a equipa produtiva:
// "tivemos 55% de receção" fecha a conversa; "as três séries de pontos
// perdidos foram todas na R4 e começaram numa receção" abre-a.
//
// Nada disto pede um toque a mais a quem marca: sai da ORDEM das ações, do
// marcador e da rotação que o `replay` já reconstrói rally a rally. Por isso
// funciona também nos jogos scoutados antes de isto existir.
//
// O que vem de fora (quem é distribuidora, que posição tem cada atleta) entra
// por funções (`isSetter`, `roleOf`), lidas da ficha por quem chama: o plantel
// copiado para o jogo não guarda posições, e este ficheiro não lê o `state`.

import { replay, pointTo, setTarget, emptyAtk, addAtk, K1_RECEPTIONS, ERR_TYPES } from './scout-engine.js';

const inF = (si, f) => f === 'all' || si === Number(f);

// A rotação de um rally, no formato do `rotationStats` (é o que o
// `rotationLabel` sabe nomear): pela distribuidora quando ela está em campo,
// senão por quem está na zona 1.
function rotOf(pos, setter) {
  const z = setter ? pos.findIndex((c) => c && c.base === setter) : -1;
  return z >= 0
    ? { key: `R${z + 1}`, setter: true, zone: z + 1, pid: null }
    : { key: `S:${pos[0]?.base || '?'}`, setter: false, zone: 0, pid: pos[0]?.base || null };
}

function eachRally(games, f, isSetter, fn) {
  for (const g of games) {
    g.sets.forEach((set, si) => {
      if (!inF(si, f)) return;
      const setter = set.lineup.find((pid) => pid && isSetter(pid)) || null;
      replay(g, si, (pos, e, srv, acts, score) => fn({
        g, si, pos, e, srv, acts, score, won: pointTo(e) === 'OUR', rot: rotOf(pos, setter),
      }));
    });
  }
}

// O ponto foi perdido por erro NOSSO (e não por mérito do adversário)?
const ourError = (e) => e.t !== 'OPPONENT' && pointTo(e) === 'THEIR';

// Ordena as rotações como a tabela de rotações: R1..R6 primeiro.
const rotOrder = (a, b) => (a.setter === b.setter ? (a.setter ? a.zone - b.zone : 0) : a.setter ? -1 : 1);

// Acumulador de rallies: total, ganhos, side-out e break-point, e quantos se
// perderam por erro nosso. É a mesma medida em várias contas deste ficheiro.
const emptyRallies = () => ({ n: 0, won: 0, so: 0, soWon: 0, bp: 0, bpWon: 0, lost: 0, lostErr: 0 });
function addRally(o, { e, srv, won }) {
  o.n++;
  if (won) o.won++;
  else { o.lost++; if (ourError(e)) o.lostErr++; }
  if (srv === 'THEIR') { o.so++; if (won) o.soWon++; } else if (srv === 'OUR') { o.bp++; if (won) o.bpWon++; }
}

// As ações de um rally no formato do `counts` (`RECEPTION.OK`…), da equipa e
// por atleta — para se poder usar o `qualityOf`/`playerStats` sobre um
// subconjunto dos rallies.
function addActs(team, byPid, acts) {
  for (const a of acts) {
    if (a.t === 'OPPONENT' || a.t === 'SUB') continue;
    const k = `${a.t}.${a.q}`;
    team[k] = (team[k] || 0) + 1;
    if (!a.pid || !byPid) continue;
    const o = byPid[a.pid] || (byPid[a.pid] = {});
    o[k] = (o[k] || 0) + 1;
  }
}

// --- Séries de pontos perdidos -----------------------------------------------
//
// Três ou mais pontos seguidos para o adversário. É onde os sets se perdem, e a
// pergunta útil é "como começou?": quase sempre há um primeiro erro, e o resto
// é a equipa a não conseguir sair. Uma série acontece TODA na mesma rotação —
// só se roda quando se ganha o side-out — por isso a rotação da série é uma
// só, e é a que fica presa.
export const RUN_MIN = 3;
export function runsLost(games, { isSetter = () => false, f = 'all', min = RUN_MIN } = {}) {
  const runs = [];
  for (const g of games) {
    g.sets.forEach((set, si) => {
      if (!inF(si, f)) return;
      const setter = set.lineup.find((pid) => pid && isSetter(pid)) || null;
      let cur = null;
      const close = () => { if (cur && cur.len >= min) runs.push(cur); cur = null; };
      replay(g, si, (pos, e, srv, acts, score) => {
        if (pointTo(e) === 'OUR') { close(); return; }
        if (!cur) {
          cur = {
            g, set: si, from: { ...score }, to: null, len: 0, errs: 0,
            rot: rotOf(pos, setter), srv, start: e, startActs: acts,
          };
        }
        cur.len++;
        if (ourError(e)) cur.errs++;
        cur.to = { our: score.our, their: score.their + 1 };
      });
      close();
    });
  }
  runs.sort((a, b) => b.len - a.len || a.set - b.set);
  // Por rotação, e como começaram: um erro nosso (e em que ação) ou um ponto
  // do adversário.
  const byRot = new Map();
  const starts = {};
  let points = 0;
  for (const r of runs) {
    points += r.len;
    const o = byRot.get(r.rot.key) || { ...r.rot, runs: 0, points: 0 };
    o.runs++;
    o.points += r.len;
    byRot.set(r.rot.key, o);
    const k = ourError(r.start) ? r.start.t : 'OPPONENT';
    starts[k] = (starts[k] || 0) + 1;
  }
  return { runs, points, starts, byRot: [...byRot.values()].sort((a, b) => b.points - a.points || rotOrder(a, b)) };
}

// --- Final de set disputado ----------------------------------------------------
//
// Os rallies jogados com alguma equipa a 20 ou mais (10 no 5.º set) e a
// diferença em 3 pontos ou menos — é aqui que um set se decide, e uma equipa
// que joga bem aos 8-6 e se encolhe aos 22-21 tem um problema que a média do
// jogo não mostra. Um 22-12 não conta: aí já não há nada em jogo.
//
// Devolve as duas metades com o mesmo formato (rallies + ações), para se
// comparar o final com o resto do jogo, da equipa e de cada atleta.
export const PRESSURE_GAP = 3;
export const isPressure = (si, score) => Math.max(score.our, score.their) >= setTarget(si) - 5
  && Math.abs(score.our - score.their) <= PRESSURE_GAP;

export function pressureStats(games, { f = 'all' } = {}) {
  const mk = () => ({ r: emptyRallies(), team: {}, byPid: {} });
  const out = { pressure: mk(), rest: mk() };
  eachRally(games, f, () => false, (x) => {
    const b = isPressure(x.si, x.score) ? out.pressure : out.rest;
    addRally(b.r, x);
    addActs(b.team, b.byPid, x.acts);
  });
  return out;
}

// --- Serviço pelo efeito -------------------------------------------------------
//
// "O serviço entrou" é metade da pergunta. A outra metade é o que acontece
// depois: um serviço que entra fácil dá ao adversário um side-out limpo, e um
// que o tira do sítio dá-nos o ponto três toques mais tarde. Mede-se por quem
// SERVIU (a atleta na zona 1 quando servimos — a líbero nunca serve): em
// quantos desses rallies ganhámos o ponto (o break-point dela) e, tirando os
// ases e os erros, em quantos ganhámos com a bola em jogo.
export function serveStats(games, { f = 'all' } = {}) {
  const m = {};
  const tot = { n: 0, won: 0, ace: 0, err: 0, marked: 0 };
  eachRally(games, f, () => false, ({ pos, srv, won, acts }) => {
    if (srv !== 'OUR') return;
    const pid = pos[0]?.pid;
    if (!pid) return;
    const o = m[pid] || (m[pid] = { pid, n: 0, won: 0, ace: 0, err: 0, marked: 0 });
    const s = acts.find((a) => a.t === 'SERVICE');
    for (const t of [o, tot]) {
      t.n++;
      if (won) t.won++;
      if (s) {
        t.marked++;
        if (s.q === 'PERFECT') t.ace++;
        else if (s.q === 'ERROR') t.err++;
      }
    }
  });
  const fin = (o) => {
    // "Em jogo" só faz sentido quando os serviços dela foram marcados: sem
    // isso não se sabe quais foram ases nem erros.
    const inPlay = o.marked ? o.marked - o.ace - o.err : null;
    const inPlayWon = o.marked ? Math.max(0, o.won - o.ace) : null;
    return { ...o, inPlay, inPlayWon };
  };
  return { list: Object.values(m).map(fin).sort((a, b) => b.n - a.n), tot: fin(tot) };
}

// --- Receção por rotação -------------------------------------------------------
//
// A receção de cada atleta em cada rotação. A mesma recetora pode estar bem
// em quatro rotações e perdida numa (a que a obriga a receber de um sítio que
// não lhe é natural, ou a que a deixa sozinha com a zona). O total da linha
// esconde isso.
export function receptionByRotation(games, { isSetter = () => false, f = 'all' } = {}) {
  const rots = new Map();
  const rows = {};
  const team = {};
  eachRally(games, f, isSetter, ({ srv, acts, rot }) => {
    if (srv !== 'THEIR') return;
    for (const a of acts) {
      if (a.t !== 'RECEPTION' || !a.pid) continue;
      rots.set(rot.key, rot);
      const good = a.q === 'PERFECT' || a.q === 'OK';
      const bad = a.q === 'ERROR';
      const row = rows[a.pid] || (rows[a.pid] = { pid: a.pid, byRot: {}, tot: { n: 0, good: 0, err: 0 } });
      const cell = row.byRot[rot.key] || (row.byRot[rot.key] = { n: 0, good: 0, err: 0 });
      const tc = team[rot.key] || (team[rot.key] = { n: 0, good: 0, err: 0 });
      for (const o of [cell, row.tot, tc]) { o.n++; if (good) o.good++; if (bad) o.err++; }
    }
  });
  return {
    rots: [...rots.values()].sort(rotOrder),
    rows: Object.values(rows).sort((a, b) => b.tot.n - a.tot.n),
    team,
  };
}

// --- Com e sem cada atleta em campo -------------------------------------------
//
// O side-out e o break-point da equipa nos rallies em que a atleta estava em
// campo e nos outros. Há atletas cujo valor não aparece em contagem nenhuma —
// a central que fecha o bloco e obriga o adversário a atacar onde a nossa
// defesa está — e aparece aqui. Num jogo só, quem joga tudo não tem "sem ela"
// que se compare; serve sobretudo a época.
export function onCourtStats(games, { f = 'all' } = {}) {
  const rallies = [];
  const ids = new Set();
  eachRally(games, f, () => false, (x) => {
    if (x.srv !== 'OUR' && x.srv !== 'THEIR') return;
    const on = new Set(x.pos.map((c) => c?.pid).filter(Boolean));
    on.forEach((id) => ids.add(id));
    rallies.push({ on, x });
  });
  const list = [...ids].map((pid) => {
    const on = emptyRallies();
    const off = emptyRallies();
    for (const r of rallies) addRally(r.on.has(pid) ? on : off, r.x);
    return { pid, on, off };
  });
  return list.sort((a, b) => b.on.n - a.on.n);
}

// --- Set a set -----------------------------------------------------------------
//
// Os mesmos números por set: a equipa cai ao longo do jogo (cansaço,
// concentração), ou entra a dormir e acorda no 3.º? Num jogo, uma coluna por
// set; na época, o 1.º set de cada jogo contra o ÚLTIMO (em jogos com dois
// sets ou mais) — o 3.º set de um jogo de três não é o 3.º de um de cinco.
function setBucket() { return { r: emptyRallies(), team: {} }; }
function fillSet(b, g, si) {
  replay(g, si, (pos, e, srv, acts) => {
    addRally(b.r, { e, srv, won: pointTo(e) === 'OUR' });
    addActs(b.team, null, acts);
  });
}
export function setBySet(g) {
  return g.sets.map((_, si) => {
    const b = setBucket();
    fillSet(b, g, si);
    return { label: `${si + 1}º set`, ...b };
  }).filter((b) => b.r.n > 0);
}
export function firstVsLast(games) {
  const first = setBucket();
  const last = setBucket();
  let n = 0;
  for (const g of games) {
    const played = g.sets.map((_, si) => si).filter((si) => g.events.some((e) => e.set === si && e.t !== 'SUB'));
    if (played.length < 2) continue;
    n++;
    fillSet(first, g, played[0]);
    fillSet(last, g, played[played.length - 1]);
  }
  return { games: n, rows: n ? [{ label: '1º set', ...first }, { label: 'Último set', ...last }] : [] };
}

// --- Ataque por zona e distribuição ---------------------------------------------
//
// A zona de ataque não se marca: deduz-se de QUEM atacou (a posição da ficha)
// e de ONDE ela estava em campo nesse rally (a rotação). À frente, a ponta
// ataca da 4, a central da 3 e a oposta da 2; atrás, a oposta ataca da 1 e a
// ponta de pipe (6). O "2.º toque" é a distribuidora a atacar.
//
// Com o passe e a receção marcados antes do ataque, sai também a DISTRIBUIÇÃO:
// para onde foi a bola consoante a receção — a conversa mais rica que se tem
// com uma distribuidora, e com a equipa ("com receção −, é tudo para a 4").
//
// Uma ponta que ataca da 2 numa jogada combinada conta como zona 4: para ver
// padrões chega, e marcar a zona à mão é o que isto evita. Quem não tem posição
// na ficha fica em "?", e diz-se quantos.
export const ATTACK_ZONES = ['4', '3', '2', 'P', '1', 'S', '?'];
export const ZONE_LABEL = {
  4: 'Zona 4', 3: 'Zona 3', 2: 'Zona 2', P: 'Pipe (zona 6)', 1: 'Zona 1', S: '2.º toque', '?': 'Sem posição na ficha',
};
const FRONT = [1, 2, 3]; // índices de `pos` das zonas 2, 3 e 4

export function attackZone(role, front) {
  if (role === 'ponta') return front === false ? 'P' : '4';
  if (role === 'oposta') return front === false ? '1' : '2';
  if (role === 'central') return front === false ? 'P' : '3';
  if (role === 'distribuidora') return 'S';
  return '?';
}

export function attackZoneStats(games, { roleOf = () => null, f = 'all' } = {}) {
  const z = () => Object.fromEntries(ATTACK_ZONES.map((k) => [k, emptyAtk()]));
  const out = { all: z(), k1: z(), k2: z(), byRec: Object.fromEntries(K1_RECEPTIONS.map((q) => [q, z()])) };
  eachRally(games, f, () => false, ({ pos, srv, acts }) => {
    let attacked = false;
    let rec = 'NONE';
    for (const a of acts) {
      if (a.t === 'RECEPTION') rec = a.q;
      if (a.t !== 'ATTACK') continue;
      const i = pos.findIndex((c) => c && c.pid === a.pid);
      const zone = attackZone(roleOf(a.pid), i < 0 ? null : FRONT.includes(i));
      addAtk(out.all[zone], a.q);
      if (srv === 'THEIR' && !attacked) {
        addAtk(out.k1[zone], a.q);
        addAtk(out.byRec[out.byRec[rec] ? rec : 'NONE'][zone], a.q);
      } else if (srv === 'OUR' || srv === 'THEIR') {
        addAtk(out.k2[zone], a.q);
      }
      attacked = true;
    }
  });
  return out;
}

// Quantos ataques há num grupo de zonas.
export const zoneTotal = (zs) => ATTACK_ZONES.reduce((a, k) => a + zs[k].n, 0);

// --- Zonas marcadas: serviço e receção -----------------------------------------
//
// Só contam as ações com zona marcada (`z`, ver `extrasFor` no motor): um jogo
// sem detalhe, ou uma ação em que o toque da zona se saltou, não entra — e
// quem lê vê em quantas ações assenta cada número.
export const ZONES = [1, 2, 3, 4, 5, 6];
const emptyZones = (mk) => Object.fromEntries(ZONES.map((z) => [z, mk()]));

// Para onde servimos e com que efeito: ases e, sobretudo, em quantos desses
// rallies ganhámos o ponto. É a pergunta "para onde é que o nosso serviço
// faz estragos?".
export function serveZoneStats(games, { f = 'all' } = {}) {
  const mk = () => ({ n: 0, ace: 0, won: 0 });
  const team = emptyZones(mk);
  const byPid = {};
  let marked = 0;
  let total = 0;
  eachRally(games, f, () => false, ({ srv, won, acts }) => {
    if (srv !== 'OUR') return;
    const s = acts.find((a) => a.t === 'SERVICE');
    if (!s || s.q === 'ERROR') return;
    total++;
    if (!s.z || !team[s.z]) return;
    marked++;
    const zs = s.pid ? (byPid[s.pid] || (byPid[s.pid] = emptyZones(mk))) : null;
    for (const o of [team[s.z], zs && zs[s.z]]) {
      if (!o) continue;
      o.n++;
      if (s.q === 'PERFECT') o.ace++;
      if (won) o.won++;
    }
  });
  return { team, byPid, marked, total };
}

// Onde recebemos e com que qualidade, da equipa e de cada recetora — e o
// side-out a partir de cada zona.
export function receptionZoneStats(games, { f = 'all' } = {}) {
  const mk = () => ({ n: 0, good: 0, err: 0, soWon: 0 });
  const team = emptyZones(mk);
  const byPid = {};
  let marked = 0;
  let total = 0;
  eachRally(games, f, () => false, ({ srv, won, acts }) => {
    if (srv !== 'THEIR') return;
    for (const a of acts) {
      if (a.t !== 'RECEPTION') continue;
      total++;
      if (!a.z || !team[a.z]) continue;
      marked++;
      const zs = a.pid ? (byPid[a.pid] || (byPid[a.pid] = emptyZones(mk))) : null;
      for (const o of [team[a.z], zs && zs[a.z]]) {
        if (!o) continue;
        o.n++;
        if (a.q === 'PERFECT' || a.q === 'OK') o.good++;
        if (a.q === 'ERROR') o.err++;
        if (won) o.soWon++;
      }
    }
  });
  return { team, byPid, marked, total };
}

// --- Tipo de erro ---------------------------------------------------------------
//
// "5 erros de serviço" e "5 serviços na rede" pedem treinos diferentes. Conta
// por fundamento e por tipo, da equipa e de cada atleta; os erros sem tipo
// marcado contam-se à parte (`none`) em vez de desaparecerem.
export function errorTypeStats(games, { f = 'all' } = {}) {
  const team = {};
  const byPid = {};
  for (const g of games) {
    for (const e of g.events) {
      if (e.t === 'SUB' || e.t === 'OPPONENT' || e.q !== 'ERROR' || !inF(e.set, f) || !ERR_TYPES[e.t]) continue;
      const k = e.et && ERR_TYPES[e.t].some(([x]) => x === e.et) ? e.et : 'none';
      const t = team[e.t] || (team[e.t] = { total: 0, none: 0 });
      t.total++;
      if (k === 'none') t.none++; else t[k] = (t[k] || 0) + 1;
      if (!e.pid) continue;
      const p = byPid[e.pid] || (byPid[e.pid] = {});
      const pt = p[e.t] || (p[e.t] = { total: 0, none: 0 });
      pt.total++;
      if (k === 'none') pt.none++; else pt[k] = (pt[k] || 0) + 1;
    }
  }
  return { team, byPid };
}
