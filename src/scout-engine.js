// Motor do Scout ao vivo — lógica pura, sem DOM nem Supabase.
//
// Um jogo scoutado é uma SEQUÊNCIA de ações (`data.events`) e tudo o resto
// deriva dela: o marcador, quem serve, a rotação, quem está em campo (com a
// líbero) e as estatísticas. Nada disto se guarda à parte. Guardar totais ao
// lado da sequência era ter dois donos para o mesmo número — e o "anular
// última ação" passava a ter de desfazer contas em vários sítios.
//
// Forma de `data` (coluna jsonb `game_scouts.data`):
//   {
//     v: 1,
//     roster: [{ id, num, name }],       // cópia do plantel no início do jogo
//     sets: [{ lineup: [6 ids],          // posição inicial 1..6 (1 = zona de serviço)
//              libero, liberoDef,        // líbero de receção (ou única) e de defesa (opcional)
//              liberoFor: [ids],         // quem a líbero substitui na zona de defesa
//              firstServer: 'OUR'|'THEIR'|null }],
//     events: [{ set, t, q, pid, ts }    // ação de uma atleta (ou do adversário)
//            | { set, t: 'SUB', out, in, ts }],
//     cur: 0                             // set ativo
//   }
//
// O roster é uma CÓPIA: o jogo é um registo histórico, e uma atleta que
// mude de número ou saia do clube não pode reescrever o que se jogou.

// Ações e quem ganha o ponto. É a mesma tabela da folha de scout original
// (Apps Script), para os números baterem com os jogos já scoutados.
export const ACT = {
  DEFENSE:   { l: 'Defesa',     q: { PERFECT: 'NO', OK: 'NO', BAD: 'NO', ERROR: 'THEIR' } },
  RECEPTION: { l: 'Receção',    q: { PERFECT: 'NO', OK: 'NO', BAD: 'NO', ERROR: 'THEIR' } },
  SETTING:   { l: 'Passe',      q: { PERFECT: 'NO', OK: 'NO', BAD: 'NO', ERROR: 'THEIR' } },
  SERVICE:   { l: 'Serviço',    q: { PERFECT: 'OUR', OK: 'NO', BAD: 'NO', ERROR: 'THEIR' } },
  ATTACK:    { l: 'Ataque',     q: { PERFECT: 'OUR', OK: 'NO', BAD: 'NO', BLOCKED: 'NO', ERROR: 'THEIR' } },
  BLOCK:     { l: 'Bloco',      q: { PERFECT: 'OUR', OK: 'NO', BAD: 'NO', ERROR: 'THEIR' } },
  OTHER:     { l: 'Outros',     q: { ERROR: 'THEIR' } },
  OPPONENT:  { l: 'Adversário', q: { ERROR: 'OUR', POINT: 'THEIR' } },
};
export const COLS = [
  ['DEFENSE', 'Defesa', 'Def'], ['RECEPTION', 'Receção', 'Rec'], ['SETTING', 'Passe', 'Pas'],
  ['SERVICE', 'Serviço', 'Srv'], ['ATTACK', 'Ataque', 'Ata'], ['BLOCK', 'Bloco', 'Blo'],
  ['OTHER', 'Outros', 'Out'], ['OPPONENT', 'Adversário', 'Adv'],
];
export const ROWS = ['PERFECT', 'OK', 'BAD', 'BLOCKED', 'ERROR'];
// Notação de qualidade do DataVolley — a que os treinadores já leem.
export const SYM = { PERFECT: '#', OK: '+', BAD: '−', BLOCKED: '/', ERROR: '=' };
export const QN = { PERFECT: 'Perfeito', OK: 'Bom', BAD: 'Fraco', BLOCKED: 'Bloqueado', ERROR: 'Erro' };

export const MAX_SETS = 5;
export const BACK_ROW = [1, 5, 6];

export function emptyData(roster, base = {}) {
  const ok = (id) => roster.some((p) => p.id === id);
  const lineup = (base.lineup || []).map((x) => (ok(x) ? x : null));
  while (lineup.length < 6) lineup.push(null);
  return {
    v: 1,
    roster,
    sets: [{
      lineup: lineup.slice(0, 6),
      libero: ok(base.libero) ? base.libero : null,
      liberoDef: ok(base.liberoDef) && base.liberoDef !== base.libero ? base.liberoDef : null,
      liberoFor: (base.liberoFor || []).filter(ok),
      firstServer: null,
    }],
    events: [],
    cur: 0,
  };
}

export const pointTo = (e) => (e.t === 'SUB' ? 'NO' : (ACT[e.t]?.q[e.q] || 'NO'));
const posOf = (slot, rot) => (((slot - rot) % 6) + 6) % 6 + 1;

// Que líbero está em campo neste rally. Há equipas com DUAS: a de receção
// entra quando o adversário serve (é a fase em que se recebe) e a de defesa
// quando servimos nós. Com uma só, `libero` serve as duas fases — que é também
// como ficam os jogos gravados antes de existir a segunda.
export function activeLibero(set, srv) {
  if (srv === 'OUR' && set.liberoDef) return set.liberoDef;
  return set.libero || null;
}

// Quem está em cada posição (1..6) com esta formação, rotação e serviço. A
// líbero entra no lugar das atletas marcadas quando estas estão na zona de
// defesa — exceto na posição 1 quando servimos nós, porque a líbero não serve.
function positions(set, lineup, rot, srv) {
  const pos = new Array(6).fill(null);
  const libero = activeLibero(set, srv);
  lineup.forEach((pid, slot) => {
    const p = posOf(slot, rot);
    let show = pid;
    let lib = false;
    if (pid && libero && set.liberoFor.includes(pid) && BACK_ROW.includes(p) && !(p === 1 && srv === 'OUR')) {
      show = libero;
      lib = true;
    }
    pos[p - 1] = { pid: show, base: pid, lib, slot };
  });
  return pos;
}

// Reproduz um set. `onRally(pos, e)` é chamado em cada ponto, com quem estava
// em campo ANTES de o ponto mudar a rotação — é assim que se contam os pontos
// jogados por atleta.
export function replay(g, si, onRally) {
  const set = g.sets[si];
  let lineup = set.lineup.slice();
  let rot = 0;
  let srv = set.firstServer;
  let our = 0;
  let their = 0;
  for (const e of g.events) {
    if (e.set !== si) continue;
    if (e.t === 'SUB') {
      const i = lineup.indexOf(e.out);
      if (i >= 0) lineup[i] = e.in;
      continue;
    }
    const inc = pointTo(e);
    if (inc === 'NO') continue;
    if (onRally) onRally(positions(set, lineup, rot, srv), e);
    if (inc === 'OUR') {
      if (srv === 'THEIR') rot = (rot + 1) % 6;
      srv = 'OUR';
      our++;
    } else {
      srv = 'THEIR';
      their++;
    }
  }
  return { lineup, rot, srv, our, their };
}

export const derive = (g, si) => replay(g, si);

export function court(g, si) {
  const d = derive(g, si);
  return { d, pos: positions(g.sets[si], d.lineup, d.rot, d.srv) };
}

export const setTarget = (si) => (si === MAX_SETS - 1 ? 15 : 25);

export function setWinner(g, si) {
  const d = derive(g, si);
  const t = setTarget(si);
  if (Math.max(d.our, d.their) >= t && Math.abs(d.our - d.their) >= 2) return d.our > d.their ? 'OUR' : 'THEIR';
  return null;
}

export function setsWon(g) {
  let o = 0;
  let t = 0;
  g.sets.forEach((_, i) => {
    const w = setWinner(g, i);
    if (w === 'OUR') o++;
    else if (w === 'THEIR') t++;
  });
  return { o, t };
}

export const hasPoints = (g, si) => g.events.some((e) => e.set === si && e.t !== 'SUB');

// Parciais dos sets com pontos (um set criado e nunca jogado não conta).
export function partials(g) {
  return g.sets
    .map((_, i) => ({ set: i + 1, ...derive(g, i) }))
    .filter((s) => s.our + s.their > 0)
    .map((s) => ({ set: s.set, our: s.our, their: s.their }));
}

// Resumo gravado em `game_scouts.summary` — o que a lista precisa sem
// descarregar as ações.
export function summarize(g) {
  const w = setsWon(g);
  return { sets: partials(g).map((s) => [s.our, s.their]), setsFor: w.o, setsAgainst: w.t, actions: g.events.length };
}

// Pontos JOGADOS por atleta (estava em campo quando o ponto acabou). É a
// mesma medida de `game_minutes.points`: no voleibol a participação mede-se
// em pontos, e aqui sai exata em vez de estimada no fim do jogo.
export function pointsPlayed(g) {
  const m = {};
  g.sets.forEach((_, si) => {
    replay(g, si, (pos) => {
      for (const c of pos) if (c && c.pid) m[c.pid] = (m[c.pid] || 0) + 1;
    });
  });
  return m;
}

// --- Estatísticas -------------------------------------------------------

const inSet = (e, f) => f === 'all' || e.set === Number(f);

export function counts(games, f = 'all') {
  const m = {};
  for (const g of games) {
    for (const e of g.events) {
      if (e.t === 'SUB' || !e.pid || !inSet(e, f)) continue;
      const o = m[e.pid] || (m[e.pid] = {});
      const k = `${e.t}.${e.q}`;
      o[k] = (o[k] || 0) + 1;
    }
  }
  return m;
}

const gv = (o, k) => o[k] || 0;
const tot = (o, t) => Object.keys(o).filter((k) => k.startsWith(`${t}.`)).reduce((a, k) => a + o[k], 0);
const pct = (a, b) => (b ? a / b : null);

export function playerStats(o) {
  const srv = tot(o, 'SERVICE');
  const rec = tot(o, 'RECEPTION');
  const atk = tot(o, 'ATTACK');
  const def = tot(o, 'DEFENSE');
  const pas = tot(o, 'SETTING');
  const errs = ['SERVICE', 'RECEPTION', 'ATTACK', 'BLOCK', 'DEFENSE', 'SETTING', 'OTHER']
    .reduce((a, t) => a + gv(o, `${t}.ERROR`), 0);
  return {
    srv, ace: gv(o, 'SERVICE.PERFECT'), srvErr: gv(o, 'SERVICE.ERROR'),
    effS: pct(gv(o, 'SERVICE.PERFECT') - gv(o, 'SERVICE.ERROR'), srv),
    rec, recErr: gv(o, 'RECEPTION.ERROR'),
    posR: pct(gv(o, 'RECEPTION.PERFECT') + gv(o, 'RECEPTION.OK'), rec),
    perfR: pct(gv(o, 'RECEPTION.PERFECT'), rec),
    atk, kill: gv(o, 'ATTACK.PERFECT'), atkErr: gv(o, 'ATTACK.ERROR'), atkBlk: gv(o, 'ATTACK.BLOCKED'),
    effA: pct(gv(o, 'ATTACK.PERFECT') - gv(o, 'ATTACK.ERROR') - gv(o, 'ATTACK.BLOCKED'), atk),
    blk: gv(o, 'BLOCK.PERFECT'), blkT: tot(o, 'BLOCK'),
    def, posD: pct(gv(o, 'DEFENSE.PERFECT') + gv(o, 'DEFENSE.OK'), def),
    pas, posP: pct(gv(o, 'SETTING.PERFECT') + gv(o, 'SETTING.OK'), pas),
    pts: gv(o, 'SERVICE.PERFECT') + gv(o, 'ATTACK.PERFECT') + gv(o, 'BLOCK.PERFECT'),
    errs,
  };
}

// De onde vieram os pontos de cada lado.
export function teamSummary(games, f = 'all') {
  const r = { ace: 0, kill: 0, blk: 0, oppErr: 0, ourErr: 0, oppPt: 0 };
  for (const g of games) {
    for (const e of g.events) {
      if (e.t === 'SUB' || !inSet(e, f)) continue;
      if (e.t === 'OPPONENT') {
        if (e.q === 'ERROR') r.oppErr++;
        else r.oppPt++;
        continue;
      }
      if (e.q === 'PERFECT') {
        if (e.t === 'SERVICE') r.ace++;
        if (e.t === 'ATTACK') r.kill++;
        if (e.t === 'BLOCK') r.blk++;
      }
      if (e.q === 'ERROR') r.ourErr++;
    }
  }
  r.our = r.ace + r.kill + r.blk + r.oppErr;
  r.their = r.ourErr + r.oppPt;
  return r;
}

export function findPlayer(g, id) {
  return (g.roster || []).find((p) => p.id === id) || null;
}

// Uma linha por atleta com ações, ordenadas por pontos. Em vários jogos
// (`games` com mais de um), `j` diz em quantos jogou.
export function playerRows(games, f = 'all') {
  const c = counts(games, f);
  return Object.keys(c)
    .map((id) => {
      let p = null;
      for (const g of games) { p = findPlayer(g, id); if (p) break; }
      const j = games.filter((g) => g.events.some((e) => e.pid === id || e.in === id)
        || g.sets.some((s) => s.lineup.includes(id) || s.libero === id || s.liberoDef === id)).length;
      return { id, p, s: playerStats(c[id]), j };
    })
    .filter((r) => r.p)
    .sort((a, b) => b.s.pts - a.s.pts || numOf(a.p) - numOf(b.p));
}

export const numOf = (p) => (Number(p?.num) || 999);
export const fmtPct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
