// Scout por posição — lógica pura, sem DOM nem Supabase (como `scout-engine`).
//
// A tabela por atleta diz "quanto"; isto diz "em que situação". As perguntas
// são as de quem prepara a semana com duas ou três atletas na mesma posição:
// para onde é que cada distribuidora joga com receção boa e com receção má, se
// a atacante faz ponto com bola boa e com bola má, onde é que a recetora sofre,
// e que cadeias (receção → passe → ataque) acabam em ponto e quais se partem.
//
// Tudo sai da ORDEM das ações de cada rally (o `replay` entrega-as), sem nada
// marcado a mais. O que vem de fora é o papel de cada atleta (`roleOf`, lido
// da posição da ficha por quem chama): é ele que diz a zona de ataque e quem é
// a distribuidora.
//
// O contexto de cada toque lê-se para trás no rally:
//   - a SITUAÇÃO de um passe é o último primeiro-toque marcado antes dele —
//     receção (#, +, −) ou defesa (boa, má); sem nenhum, "sem receção ou
//     defesa marcada";
//   - a BOLA da atacante é a qualidade do passe imediatamente antes do ataque;
//     sem passe marcado, usa-se a situação como aproximação e diz-se isso
//     (`ballFromPass`);
//   - QUEM PASSOU é o dono desse passe; sem passe marcado, a distribuidora que
//     estava em campo (`setterInferred`).

import { replay, pointTo, emptyAtk, addAtk } from './scout-engine.js';
import { attackZone } from './scout-patterns.js';

const inF = (si, f) => f === 'all' || si === Number(f);
const FRONT = [1, 2, 3]; // índices de `pos` das zonas 2, 3 e 4

export const SITUATIONS = [
  ['R#', 'Receção #'], ['R+', 'Receção +'], ['R-', 'Receção −'],
  ['Dg', 'Defesa boa'], ['Db', 'Defesa má'], ['?', 'Sem receção ou defesa marcada'],
];
export const BALLS = [['#', 'Passe #'], ['+', 'Passe +'], ['-', 'Passe −']];
const situationOf = (a) => {
  if (a.t === 'RECEPTION') return a.q === 'PERFECT' ? 'R#' : a.q === 'OK' ? 'R+' : a.q === 'BAD' ? 'R-' : null;
  if (a.t === 'DEFENSE') return a.q === 'PERFECT' || a.q === 'OK' ? 'Dg' : a.q === 'BAD' ? 'Db' : null;
  return null;
};
const ballOf = (q) => (q === 'PERFECT' ? '#' : q === 'OK' ? '+' : q === 'BAD' ? '-' : null);
// A situação vista como bola, quando o passe não foi marcado.
const ballFromSituation = (s) => (s === 'R#' ? '#' : s === 'R+' || s === 'Dg' ? '+' : s === 'R-' || s === 'Db' ? '-' : null);

const bump = (o, k, mk) => o[k] || (o[k] = mk());

// Percorre os rallies e chama `onAttack` para cada ataque nosso, com tudo o que
// o rodeia, e `onRally` uma vez por rally.
function walk(games, { roleOf, f = 'all' }, { onAttack, onRally }) {
  for (const g of games) {
    g.sets.forEach((set, si) => {
      if (!inF(si, f)) return;
      replay(g, si, (pos, e, srv, acts) => {
        const won = pointTo(e) === 'OUR';
        const setterOnCourt = pos.find((c) => c && c.pid && roleOf(c.pid) === 'distribuidora')?.pid || null;
        const setterZone = setterOnCourt ? pos.findIndex((c) => c && c.pid === setterOnCourt) + 1 : 0;
        let sit = '?';
        let lastSet = null;
        let attacked = false;
        for (const a of acts) {
          const s = situationOf(a);
          if (s) { sit = s; lastSet = null; continue; }
          if (a.t === 'SETTING') { lastSet = a; continue; }
          if (a.t !== 'ATTACK') continue;
          const i = pos.findIndex((c) => c && c.pid === a.pid);
          const role = roleOf(a.pid);
          const zone = attackZone(role, i < 0 ? null : FRONT.includes(i));
          const k1 = srv === 'THEIR' && !attacked;
          const second = role === 'distribuidora' && zone === 'S';
          const setter = second ? a.pid : (lastSet?.pid || setterOnCourt);
          onAttack?.({
            a, pos, zone, sit, k1, won, srv,
            setter, setterInferred: !second && !lastSet?.pid,
            setQ: lastSet ? lastSet.q : null,
            ball: lastSet ? ballOf(lastSet.q) : ballFromSituation(sit),
            ballFromPass: !!lastSet,
          });
          attacked = true;
          sit = '?';
          lastSet = null;
        }
        onRally?.({ pos, e, srv, acts, won, setterOnCourt, setterZone });
      });
    });
  }
}

// --- Distribuidoras -----------------------------------------------------------
export function setterStats(games, { roleOf = () => null, f = 'all' } = {}) {
  const m = {};
  const team = {}; // eficácia da equipa por zona (todas as distribuidoras)
  const mk = () => ({
    sets: 0, inferred: 0, second: emptyAtk(),
    dist: {}, // situação -> zona -> ataques
    pass: {}, // qualidade do passe -> ataques
    rot: {}, // R1..R6 -> { zones: {z: n}, so, soWon } (1.ª bola do side-out)
  });
  walk(games, { roleOf, f }, {
    onAttack: (x) => {
      if (!x.setter) return;
      const s = bump(m, x.setter, mk);
      s.sets++;
      if (x.setterInferred) s.inferred++;
      if (x.zone === 'S') addAtk(s.second, x.a.q);
      addAtk(bump(bump(s.dist, x.sit, () => ({})), x.zone, emptyAtk), x.a.q);
      addAtk(bump(team, x.zone, emptyAtk), x.a.q);
      const b = ballOf(x.setQ);
      if (b) addAtk(bump(s.pass, b, emptyAtk), x.a.q);
      // A rotação nomeia-se pela zona onde estava a distribuidora que passou
      // (R1 = na zona 1), a convenção do resto do scout.
      const sz = x.pos.findIndex((c) => c && c.pid === x.setter) + 1;
      if (x.k1 && sz && x.setter !== x.a.pid) {
        const r = bump(s.rot, `R${sz}`, () => ({ zones: {}, n: 0 }));
        r.zones[x.zone] = (r.zones[x.zone] || 0) + 1;
        r.n++;
      }
    },
    onRally: ({ srv, won, setterOnCourt, setterZone }) => {
      if (srv !== 'THEIR' || !setterOnCourt || !setterZone || !m[setterOnCourt]) return;
      const r = bump(m[setterOnCourt].rot, `R${setterZone}`, () => ({ zones: {}, n: 0 }));
      r.so = (r.so || 0) + 1;
      if (won) r.soWon = (r.soWon || 0) + 1;
    },
  });
  return { byPid: m, team };
}

// --- Atacantes ----------------------------------------------------------------
export function attackerStats(games, { roleOf = () => null, f = 'all' } = {}) {
  const m = {};
  const team = { ball: {}, phase: {}, zone: {} };
  const mk = () => ({ all: emptyAtk(), ball: {}, phase: {}, zone: {}, setter: {}, proxy: 0 });
  walk(games, { roleOf, f }, {
    onAttack: (x) => {
      if (!x.a.pid) return;
      const s = bump(m, x.a.pid, mk);
      const q = x.a.q;
      addAtk(s.all, q);
      if (x.ball) {
        addAtk(bump(s.ball, x.ball, emptyAtk), q);
        addAtk(bump(team.ball, x.ball, emptyAtk), q);
        if (!x.ballFromPass) s.proxy++;
      }
      const ph = x.k1 ? 'K1' : 'K2';
      addAtk(bump(s.phase, ph, emptyAtk), q);
      addAtk(bump(team.phase, ph, emptyAtk), q);
      addAtk(bump(s.zone, x.zone, emptyAtk), q);
      addAtk(bump(team.zone, x.zone, emptyAtk), q);
      if (x.setter && x.setter !== x.a.pid) addAtk(bump(s.setter, x.setter, emptyAtk), q);
    },
  });
  return { byPid: m, team };
}

// --- Líberos e recetoras ------------------------------------------------------
// A receção dela, o que a equipa fez a seguir (o rally foi ganho?), e as
// defesas que viraram ponto nosso.
export function receiverStats(games, { f = 'all' } = {}) {
  const m = {};
  const team = { n: 0, good: 0 };
  const mk = () => ({ q: { PERFECT: 0, OK: 0, BAD: 0, ERROR: 0 }, after: {}, def: { n: 0, good: 0, won: 0 } });
  for (const g of games) {
    g.sets.forEach((set, si) => {
      if (!inF(si, f)) return;
      replay(g, si, (pos, e, srv, acts) => {
        const won = pointTo(e) === 'OUR';
        for (const a of acts) {
          if (!a.pid) continue;
          if (a.t === 'RECEPTION') {
            const s = bump(m, a.pid, mk);
            if (a.q in s.q) s.q[a.q]++;
            team.n++;
            if (a.q === 'PERFECT' || a.q === 'OK') team.good++;
            if (srv === 'THEIR' && a.q !== 'ERROR') {
              const o = bump(s.after, a.q, () => ({ n: 0, won: 0 }));
              o.n++;
              if (won) o.won++;
            }
          } else if (a.t === 'DEFENSE') {
            const s = bump(m, a.pid, mk);
            s.def.n++;
            if (a.q === 'PERFECT' || a.q === 'OK') s.def.good++;
            if (a.q !== 'ERROR' && won) s.def.won++;
          }
        }
      });
    });
  }
  return { byPid: m, team };
}

// --- Sequências ---------------------------------------------------------------
//
// Uma cadeia é o primeiro toque (receção ou defesa), o passe a seguir e o
// ataque que veio dele, com o fim desse ataque: ponto, a bola continuou, ou
// erro/bloqueado. Agrupa-se pela forma (qualidades e zona), e cada cadeia
// guarda quem fez cada toque, para o filtro por atleta.
export function sequenceStats(games, { roleOf = () => null, f = 'all', start = 'RECEPTION', pid = null } = {}) {
  const chains = new Map();
  const funnel = { first: 0, playable: 0, attacked: 0, kill: 0 };
  for (const g of games) {
    g.sets.forEach((set, si) => {
      if (!inF(si, f)) return;
      replay(g, si, (pos, e, srv, acts) => {
        if (start === 'RECEPTION' && srv !== 'THEIR') return;
        for (let i = 0; i < acts.length; i++) {
          const first = acts[i];
          if (first.t !== start) continue;
          let set = null;
          let atk = null;
          for (let j = i + 1; j < acts.length; j++) {
            const a = acts[j];
            if (a.t === 'RECEPTION' || a.t === 'DEFENSE') break;
            if (a.t === 'SETTING' && !set) set = a;
            if (a.t === 'ATTACK') { atk = a; break; }
          }
          const involved = [first.pid, set?.pid, atk?.pid].filter(Boolean);
          if (pid && !involved.includes(pid)) { if (start === 'RECEPTION') break; continue; }
          funnel.first++;
          if (first.q !== 'ERROR') funnel.playable++;
          if (atk) {
            funnel.attacked++;
            if (atk.q === 'PERFECT') funnel.kill++;
            const ix = pos.findIndex((c) => c && c.pid === atk.pid);
            const zone = attackZone(roleOf(atk.pid), ix < 0 ? null : FRONT.includes(ix));
            const key = `${first.q}|${set ? set.q : '-'}|${zone}`;
            const c = chains.get(key) || { key, first: first.q, set: set ? set.q : null, zone, n: 0, kill: 0, cont: 0, lost: 0, who: {} };
            c.n++;
            if (atk.q === 'PERFECT') c.kill++;
            else if (atk.q === 'ERROR' || atk.q === 'BLOCKED') c.lost++;
            else c.cont++;
            const who = [first.pid, set?.pid, atk.pid].map((x) => x || '').join('|');
            c.who[who] = (c.who[who] || 0) + 1;
            chains.set(key, c);
          }
          if (start === 'RECEPTION') break; // uma receção por rally
        }
      });
    });
  }
  const list = [...chains.values()].sort((a, b) => b.n - a.n);
  return { list, funnel };
}
