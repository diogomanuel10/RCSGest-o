// Scout → "Por posição": as atletas da mesma posição LADO A LADO, para quem
// prepara a semana (decidido sobre uma maqueta). Quatro separadores:
// Distribuidoras, Atacantes, Líberos e recetoras, Sequências. As contas vivem
// em `scout-positions.js` (lógica pura); aqui só se desenha.
//
// É da equipa técnica: compara colegas (as passadoras lado a lado), por isso
// não chega ao portal — a regra do "nunca as das colegas" do lado da atleta.
// A média da equipa aparece ao lado de cada número, discreta: é o termo de
// comparação, não um ranking.

import { esc } from '../ui.js';
import { findPlayer, atkEff } from '../scout-engine.js';
import { ZONE_LABEL, receptionByRotation, receptionZoneStats, ZONES } from '../scout-patterns.js';
import { roleFinder, setterFinder, rotationLabel } from '../scout-insights.js';
import { setterStats, attackerStats, receiverStats, sequenceStats, SITUATIONS, BALLS } from '../scout-positions.js';

// --- Estado local (vive no módulo, como o resto do Scout) ---------------------
let tab = 'setters';
let scope = 'all'; // 'all' (época) ou o id de um jogo
let attackerFilter = 'all';
let seqStart = 'RECEPTION';
let seqPid = '';

const TABS = [['setters', 'Distribuidoras'], ['attackers', 'Atacantes'], ['receivers', 'Líberos e recetoras'], ['sequences', 'Sequências']];
const ROLE_LABEL = { distribuidora: 'Distribuidora', ponta: 'Ponta', oposta: 'Oposta', central: 'Central', libero: 'Líbero' };
const ZONE_ORDER = ['4', '3', '2', 'P', '1', 'S', '?'];
const ZONE_TO = { 4: 'a zona 4', 3: 'a zona 3', 2: 'a zona 2', P: 'o pipe', 1: 'a zona 1', S: 'o 2.º toque', '?': 'atacantes sem posição' };
const ZONE_IN = { 4: 'na zona 4', 3: 'na zona 3', 2: 'na zona 2', P: 'de pipe', 1: 'na zona 1', S: 'de 2.º toque', '?': 'de atacante sem posição' };
const OUT = [['kill', 'ponto', 'pz-o-kill'], ['cont', 'defendido', 'pz-o-cont'], ['blk', 'bloqueado', 'pz-o-blk'], ['err', 'erro', 'pz-o-err']];
const MIN_TONE = 5; // ações para uma cor ter significado

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const killRate = (o) => (o && o.n ? o.kill / o.n : null);
const outcomes = (o) => ({ kill: o.kill, err: o.err, blk: o.blk, cont: o.n - o.kill - o.err - o.blk });
function nameOf(datas, id) {
  for (const d of datas) { const p = findPlayer(d, id); if (p) return { num: p.num, name: p.name, short: shortName(p.name) }; }
  return { num: '?', name: 'Atleta', short: 'Atleta' };
}
function shortName(n) {
  const a = String(n || '').trim().split(/\s+/);
  return a.length > 1 ? `${a[0]} ${a[a.length - 1][0]}.` : a[0] || '';
}
const toneOf = (v, ref, n, gap = 0.1) => (v == null || ref == null || n < MIN_TONE ? '' : v >= ref + gap ? 'up' : v <= ref - gap ? 'down' : '');

// Uma barra empilhada com o número em cada fatia que caiba.
function barHTML(segs, aria, { pctLabels = false } = {}) {
  const tot = segs.reduce((a, s) => a + s.v, 0) || 1;
  return `<div class="pz-bar" role="img" aria-label="${esc(aria)}">${segs.filter((s) => s.v > 0).map((s) => {
    const share = s.v / tot;
    const txt = share >= 0.12 ? (pctLabels ? `${Math.round(share * 100)}%` : String(s.v)) : '';
    return `<span class="pz-seg ${s.cls}" style="flex-grow:${s.v}">${txt}</span>`;
  }).join('')}</div>`;
}
function outcomeBar(o, label) {
  const c = outcomes(o);
  return barHTML(OUT.map(([k, , cls]) => ({ v: c[k], cls })), `${label}: ${OUT.map(([k, w]) => `${c[k]} ${w}`).join(', ')}, em ${o.n}`);
}
// A % de pontos à direita, com a média da equipa por baixo.
function killCell(o, teamO, showTeam) {
  const v = killRate(o);
  const ref = killRate(teamO);
  const tone = showTeam ? toneOf(v, ref, o.n) : '';
  return `<span class="pz-k"><strong class="${tone ? `pz-t-${tone}` : ''}">${v == null ? '—' : `${Math.round(v * 100)}%`}</strong>${showTeam && ref != null ? `<span>equipa ${Math.round(ref * 100)}%</span>` : `<span>${o.n} at.</span>`}</span>`;
}
function legendHTML(items) {
  return `<p class="pz-leg">${items.map(([cls, w]) => `<span><i class="pz-dot ${cls}"></i>${esc(w)}</span>`).join('')}</p>`;
}
const zoneLegend = (zs) => legendHTML(zs.map((z) => [`pz-z-${z}`, ZONE_LABEL[z]]));
const outLegend = () => legendHTML(OUT.map(([, w, cls]) => [cls, w]));
function headHTML(datas, id, meta) {
  const p = nameOf(datas, id);
  return `<div class="pz-who"><span class="pz-num">${esc(String(p.num))}</span>
    <div><strong>${esc(p.name)}</strong><span>${esc(meta)}</span></div></div>`;
}
const insightHTML = (txt, tone = 'info') => (txt ? `<p class="pz-insight pz-insight--${tone}">${esc(txt)}</p>` : '');
const sum = (o) => Object.values(o || {}).reduce((a, x) => a + (x.n || 0), 0);

// =============================================================================
export function renderPositions(box, rows) {
  const games = scope === 'all' ? rows : rows.filter((r) => r.id === scope);
  const datas = games.map((g) => g.data);
  const roleOf = roleFinder();
  const fmt = (d) => (d ? d.split('-').reverse().slice(0, 2).join('/') : '');
  const anyRole = datas.some((d) => (d.roster || []).some((p) => roleOf(p.id)));

  box.innerHTML = `
    <div class="pz-controls">
      <div class="field"><label for="pz-scope">Âmbito</label>
        <select id="pz-scope">
          <option value="all" ${scope === 'all' ? 'selected' : ''}>Época · ${rows.length} jogo${rows.length === 1 ? '' : 's'}</option>
          ${rows.map((r) => `<option value="${esc(r.id)}" ${scope === r.id ? 'selected' : ''}>${esc(fmt(r.game_date))} vs ${esc(r.opponent || 'Adversário')}</option>`).join('')}
        </select></div>
    </div>
    <nav class="pz-tabs" role="tablist" aria-label="Posição">
      ${TABS.map(([k, l]) => `<button type="button" role="tab" class="pz-tab" data-pz-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('')}
    </nav>
    ${anyRole ? '' : '<p class="pz-warn">Nenhuma atleta destes jogos tem posição na ficha. É a posição que diz quem é distribuidora, ponta, oposta ou central — preenche-a nos Plantéis e esta página ganha forma.</p>'}
    <div id="pz-body">${datas.length ? bodyHTML(datas, roleOf) : '<p class="muted">Sem jogos terminados nesta equipa.</p>'}</div>`;

  box.querySelector('#pz-scope').addEventListener('change', (e) => { scope = e.target.value; renderPositions(box, rows); });
  box.querySelectorAll('[data-pz-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.pzTab; renderPositions(box, rows); }));
  box.querySelectorAll('[data-pz-att]').forEach((b) => b.addEventListener('click', () => { attackerFilter = b.dataset.pzAtt; renderPositions(box, rows); }));
  box.querySelector('#pz-seq-pid')?.addEventListener('change', (e) => { seqPid = e.target.value; renderPositions(box, rows); });
  box.querySelector('#pz-seq-start')?.addEventListener('change', (e) => { seqStart = e.target.value; renderPositions(box, rows); });
}

function bodyHTML(datas, roleOf) {
  if (tab === 'setters') return settersHTML(datas, roleOf);
  if (tab === 'attackers') return attackersHTML(datas, roleOf);
  if (tab === 'receivers') return receiversHTML(datas, roleOf);
  return sequencesHTML(datas, roleOf);
}
const grid = (cards) => `<div class="pz-grid">${cards.join('')}</div>`;

// --- Distribuidoras -----------------------------------------------------------
function settersHTML(datas, roleOf) {
  const st = setterStats(datas, { roleOf });
  const ids = Object.keys(st.byPid)
    .filter((id) => roleOf(id) === 'distribuidora' || st.byPid[id].sets >= 10)
    .sort((a, b) => st.byPid[b].sets - st.byPid[a].sets);
  if (!ids.length) return '<p class="muted">Sem distribuidoras nestes jogos. A distribuidora reconhece-se pela posição da ficha ("Distribuidor").</p>';
  return grid(ids.map((id) => setterCard(datas, id, st)));
}
function setterCard(datas, id, st) {
  const s = st.byPid[id];
  const sits = SITUATIONS.filter(([k]) => sum(s.dist[k]) > 0);
  const zonesUsed = ZONE_ORDER.filter((z) => sits.some(([k]) => s.dist[k][z]?.n));
  const dist = sits.map(([k, label]) => {
    const row = s.dist[k];
    const n = sum(row);
    return `<div class="pz-row"><span>${esc(label)}</span>${barHTML(zonesUsed.map((z) => ({ v: row[z]?.n || 0, cls: `pz-z-${z}` })), `${label}: ${zonesUsed.filter((z) => row[z]?.n).map((z) => `${ZONE_LABEL[z]} ${pct(row[z].n, n)}%`).join(', ')}`, { pctLabels: true })}<span class="pz-n">${n}</span></div>`;
  }).join('');
  // Eficácia por zona em cada situação, contra a da equipa nessa zona.
  const effZones = ['4', '3', '2', 'P', '1'].filter((z) => sits.some(([k]) => s.dist[k][z]?.n));
  const eff = effZones.length ? `<section class="pz-card"><h4 class="pz-h">E a atacante fez ponto?</h4>
    <div class="table-wrap"><table class="no-stack pz-tbl"><thead><tr><th>Situação</th>${effZones.map((z) => `<th>${esc(ZONE_LABEL[z])}</th>`).join('')}</tr></thead>
    <tbody>${sits.map(([k, label]) => `<tr><td>${esc(label)}</td>${effZones.map((z) => {
      const o = s.dist[k][z];
      if (!o?.n) return '<td class="muted">—</td>';
      const tone = toneOf(killRate(o), killRate(st.team[z]), o.n);
      return `<td class="${tone ? `pz-c-${tone}` : ''}">${pct(o.kill, o.n)}% <span class="muted">· ${o.n}</span></td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="pz-note">% de ataques que deram ponto, e em quantos. A verde ou âmbar quando está 10 pontos acima ou abaixo da equipa nessa zona (com ${MIN_TONE} ataques ou mais).</p></section>` : '';
  const passRows = BALLS.filter(([b]) => s.pass[b]?.n);
  const pass = passRows.length ? `<section class="pz-card"><h4 class="pz-h">O passe dela → o que a atacante fez</h4>
    ${passRows.map(([b, label]) => `<div class="pz-row pz-row--k"><span>${esc(label)}</span>${outcomeBar(s.pass[b], label)}<span class="pz-k"><strong>${pct(s.pass[b].kill, s.pass[b].n)}%</strong><span>pontos</span></span></div>`).join('')}
    ${outLegend()}</section>` : '';
  // Por rotação: a zona mais usada na 1.ª bola do side-out e o side-out.
  const rots = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'].filter((r) => s.rot[r]);
  const soAll = rots.reduce((a, r) => ({ so: a.so + (s.rot[r].so || 0), won: a.won + (s.rot[r].soWon || 0) }), { so: 0, won: 0 });
  const rot = rots.length ? `<section class="pz-card"><h4 class="pz-h">Por rotação: para onde vai a primeira bola</h4>
    <div class="table-wrap"><table class="no-stack pz-tbl"><thead><tr><th></th>${rots.map((r) => `<th>${r}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Zona mais usada</td>${rots.map((r) => {
        const [z, n] = Object.entries(s.rot[r].zones).sort((a, b) => b[1] - a[1])[0] || [];
        return `<td>${z ? `<span class="pz-chip pz-z-${z}">${esc(ZONE_LABEL[z])}</span><span class="pz-sub">${pct(n, s.rot[r].n)}% de ${s.rot[r].n}</span>` : '—'}</td>`;
      }).join('')}</tr>
      <tr><td>Side-out</td>${rots.map((r) => {
        const o = s.rot[r];
        if (!o.so) return '<td class="muted">—</td>';
        const tone = toneOf(o.soWon / o.so, soAll.so ? soAll.won / soAll.so : null, o.so);
        return `<td class="${tone ? `pz-c-${tone}` : ''}">${pct(o.soWon || 0, o.so)}% <span class="muted">· ${o.so}</span></td>`;
      }).join('')}</tr></tbody></table></div>
    <p class="pz-note">R1 = ela na zona 1. Side-out a verde ou âmbar quando está 10 pontos acima ou abaixo da média DELA.</p></section>` : '';
  const meta = [`${s.sets} bolas passadas`, s.second.n ? `${s.second.n} ataques de 2.º toque` : ''].filter(Boolean).join(' · ');
  return `<div class="pz-col">${headHTML(datas, id, meta)}${setterInsight(s, st)}
    <section class="pz-card"><h4 class="pz-h">Para onde distribui</h4>${dist}${zoneLegend(zonesUsed)}
      ${s.inferred ? `<p class="pz-note">${s.inferred} ataque${s.inferred === 1 ? '' : 's'} sem passe marcado: contado${s.inferred === 1 ? '' : 's'} para a distribuidora que estava em campo.</p>` : ''}</section>
    ${eff}${pass}${rot}</div>`;
}
function setterInsight(s, st) {
  const bad = s.dist['R-'];
  const n = sum(bad);
  if (n >= 8) {
    const [z, o] = Object.entries(bad).sort((a, b) => b[1].n - a[1].n)[0];
    const share = o.n / n;
    const in10 = Math.round(share * 10);
    if (share >= 0.7) {
      return insightHTML(`Com receção má, ${in10} em cada 10 bolas vão para ${ZONE_TO[z]} — e a eficácia aí é ${pct(o.kill, o.n)}% (a equipa, nessa zona, faz ${pct(st.team[z]?.kill || 0, st.team[z]?.n || 0)}%). Com a bola tão previsível, o bloco adversário também sabe para onde ir.`, 'warn');
    }
    return insightHTML(`Com receção má distribui por várias zonas: ${ZONE_TO[z]} leva ${in10} em cada 10 bolas, com ${pct(o.kill, o.n)}% de pontos.`, 'info');
  }
  const all = {};
  for (const row of Object.values(s.dist)) for (const [z, o] of Object.entries(row)) all[z] = (all[z] || 0) + o.n;
  const [z, nz] = Object.entries(all).sort((a, b) => b[1] - a[1])[0] || [];
  return z ? insightHTML(`A zona mais usada é ${ZONE_TO[z]}: ${Math.round((nz / s.sets) * 10)} em cada 10 bolas.`, 'info') : '';
}

// --- Atacantes ----------------------------------------------------------------
const ATT_FILTERS = [['all', 'Todas'], ['ponta', 'Pontas'], ['oposta', 'Opostas'], ['central', 'Centrais']];
function attackersHTML(datas, roleOf) {
  const st = attackerStats(datas, { roleOf });
  const isAtt = (id) => ['ponta', 'oposta', 'central'].includes(roleOf(id)) || (!roleOf(id) && st.byPid[id].all.n >= 5);
  const ids = Object.keys(st.byPid).filter(isAtt)
    .filter((id) => attackerFilter === 'all' || roleOf(id) === attackerFilter)
    .sort((a, b) => st.byPid[b].all.n - st.byPid[a].all.n);
  const pills = `<div class="pz-pills" role="group" aria-label="Que atacantes mostrar">${ATT_FILTERS.map(([k, l]) => `<button type="button" class="pz-pill" data-pz-att="${k}" aria-pressed="${attackerFilter === k}">${l}</button>`).join('')}</div>`;
  if (!ids.length) return `${pills}<p class="muted">Sem atacantes nesta escolha.</p>`;
  return `<div class="pz-bar-top">${pills}${outLegend()}</div>${grid(ids.map((id) => attackerCard(datas, id, st, roleOf)))}
    <p class="pz-note">À direita de cada barra: % de ataques que deram ponto e a média da equipa na mesma situação (verde ou âmbar a 10 pontos de diferença, com ${MIN_TONE} ataques ou mais). "Bola" é o passe que a atacante recebeu.</p>`;
}
function attackerCard(datas, id, st, roleOf) {
  const s = st.byPid[id];
  const block = (title, rows, note = '') => (rows.length ? `<section class="pz-card"><h4 class="pz-h">${esc(title)}</h4>${rows.join('')}${note}</section>` : '');
  const row = (label, o, teamO) => `<div class="pz-row pz-row--k"><span>${esc(label)}</span>${outcomeBar(o, label)}${killCell(o, teamO, true)}</div>`;
  const ball = BALLS.filter(([b]) => s.ball[b]?.n).map(([b, l]) => row(l, s.ball[b], st.team.ball[b]));
  const phase = [['K1', 'Receção (K1)'], ['K2', 'Transição (K2)']].filter(([k]) => s.phase[k]?.n).map(([k, l]) => row(l, s.phase[k], st.team.phase[k]));
  const zone = ZONE_ORDER.filter((z) => s.zone[z]?.n).map((z) => row(ZONE_LABEL[z], s.zone[z], st.team.zone[z]));
  const setter = Object.entries(s.setter).sort((a, b) => b[1].n - a[1].n).map(([sid, o]) => `<div class="pz-row pz-row--k"><span>${esc(nameOf(datas, sid).short)}</span>${outcomeBar(o, nameOf(datas, sid).short)}${killCell(o, null, false)}</div>`);
  const role = ROLE_LABEL[roleOf(id)] || 'Sem posição na ficha';
  return `<div class="pz-col">${headHTML(datas, id, `${role} · ${s.all.n} ataques · eficácia ${Math.round((atkEff(s.all) || 0) * 100)}%`)}${attackerInsight(s, st)}
    ${block('Consoante a bola que recebeu', ball, s.proxy ? `<p class="pz-note">${s.proxy} sem passe marcado: a bola lê-se pela receção ou pela defesa.</p>` : '')}
    ${block('De onde veio a bola', phase)}
    ${block('Por zona', zone)}
    ${block('Com que distribuidora', setter)}</div>`;
}
function attackerInsight(s, st) {
  const g = s.ball['#'];
  const b = s.ball['-'];
  const tb = killRate(st.team.ball['-']);
  if (g?.n >= 6 && b?.n >= 6) {
    const kg = killRate(g);
    const kb = killRate(b);
    const txt = `Com bola boa faz ponto em ${Math.round(kg * 100)}% dos ataques; com bola má em ${Math.round(kb * 100)}%${tb != null ? ` (a equipa, com bola má, faz ${Math.round(tb * 100)}%)` : ''}.`;
    if (tb != null && kb >= tb + 0.1) return insightHTML(`${txt} É das que melhor resolvem a bola difícil.`, 'good');
    if ((tb != null && kb <= tb - 0.1) || kg - kb >= 0.35) return insightHTML(`${txt} É na bola má que vale a pena trabalhar: a bola alta de recurso.`, 'warn');
    return insightHTML(txt, 'info');
  }
  const k = killRate(s.all);
  const tk = killRate(Object.values(st.team.zone).reduce((a, o) => ({ n: a.n + o.n, kill: a.kill + o.kill }), { n: 0, kill: 0 }));
  return k != null ? insightHTML(`Faz ponto em ${Math.round(k * 100)}% dos ataques${tk != null ? ` (equipa ${Math.round(tk * 100)}%)` : ''}.`, 'info') : '';
}

// --- Líberos e recetoras --------------------------------------------------------
const REC_Q = [['PERFECT', '#', 'pz-q-p'], ['OK', '+', 'pz-q-o'], ['BAD', '−', 'pz-q-b'], ['ERROR', 'erro', 'pz-o-err']];
function receiversHTML(datas, roleOf) {
  const st = receiverStats(datas);
  const recN = (id) => Object.values(st.byPid[id].q).reduce((a, b) => a + b, 0);
  const ids = Object.keys(st.byPid).filter((id) => (roleOf(id) === 'libero' && (recN(id) || st.byPid[id].def.n)) || recN(id) >= 10)
    .sort((a, b) => recN(b) - recN(a));
  if (!ids.length) return '<p class="muted">Sem receções marcadas nestes jogos.</p>';
  const isSetter = setterFinder();
  const rr = receptionByRotation(datas, { isSetter });
  const rz = receptionZoneStats(datas);
  return `${legendHTML(REC_Q.map(([, w, cls]) => [cls, w === '#' ? '# perfeita' : w === '+' ? '+ boa' : w === '−' ? '− difícil' : 'erro']))}
    ${grid(ids.map((id) => receiverCard(datas, id, st, rr, rz, roleOf, recN(id))))}`;
}
function receiverCard(datas, id, st, rr, rz, roleOf, n) {
  const s = st.byPid[id];
  const good = s.q.PERFECT + s.q.OK;
  const teamRate = st.team.n ? st.team.good / st.team.n : null;
  const rate = n ? good / n : null;
  const tone = toneOf(rate, teamRate, n);
  const rec = n ? `<section class="pz-card"><h4 class="pz-h">Receção</h4>
    <div class="pz-row pz-row--k"><span>Todas</span>${barHTML(REC_Q.map(([k, , cls]) => ({ v: s.q[k], cls })), `Receção: ${REC_Q.map(([k, w]) => `${s.q[k]} ${w}`).join(', ')}`)}
      <span class="pz-k"><strong class="${tone ? `pz-t-${tone}` : ''}">${pct(good, n)}%</strong><span>equipa ${teamRate == null ? '—' : `${Math.round(teamRate * 100)}%`}</span></span></div>
    <p class="pz-note">À direita: receções boas (# ou +).</p></section>` : '';
  // Por rotação, contra o total DELA.
  const row = rr.rows.find((r) => r.pid === id);
  const own = row?.tot.n ? row.tot.good / row.tot.n : null;
  const rot = row ? `<section class="pz-card"><h4 class="pz-h">Por rotação</h4><div class="pz-rots">${rr.rots.map((r) => {
    const c = row.byRot[r.key];
    if (!c?.n) return `<div class="pz-rot"><span>${esc(rotationLabel(r, datas).short)}</span><strong>—</strong></div>`;
    const t = toneOf(c.good / c.n, own, c.n, 0.15);
    return `<div class="pz-rot${t ? ` pz-rot--${t}` : ''}"><span>${esc(rotationLabel(r, datas).short)}</span><strong>${pct(c.good, c.n)}%</strong><span>${c.n} rec.</span></div>`;
  }).join('')}</div><p class="pz-note">Receções boas em cada rotação. A cor compara com o total DELA (15 pontos).</p></section>` : '';
  // Por zona (só com a zona da receção marcada).
  const zs = rz.byPid[id];
  const zn = zs ? ZONES.reduce((a, z) => a + zs[z].n, 0) : 0;
  const zone = zn ? `<section class="pz-card"><h4 class="pz-h">Por zona</h4><div class="pz-court" role="img" aria-label="Receção por zona">
      <div class="pz-net"></div>${[4, 3, 2, 5, 6, 1].map((z) => {
        const c = zs[z];
        if (!c.n) return '<div class="pz-zc"></div>';
        const t = toneOf(c.good / c.n, own, c.n, 0.15);
        return `<div class="pz-zc${t ? ` pz-zc--${t}` : ''}"><strong>${pct(c.good, c.n)}%</strong><span>${c.n} rec.</span></div>`;
      }).join('')}</div><p class="pz-note">Só as receções com zona marcada (${zn} de ${n}).</p></section>` : '';
  const after = REC_Q.slice(0, 3).filter(([k]) => s.after[k]?.n).map(([k, w]) => {
    const o = s.after[k];
    return `<div class="pz-row pz-row--k"><span>Receção ${w}</span>${barHTML([{ v: o.won, cls: 'pz-o-kill' }, { v: o.n - o.won, cls: 'pz-o-lost' }], `Receção ${w}: ganhámos ${o.won} de ${o.n}`)}<span class="pz-k"><strong>${pct(o.won, o.n)}%</strong><span>side-out</span></span></div>`;
  });
  const afterHTML = after.length ? `<section class="pz-card"><h4 class="pz-h">O que a equipa fez a seguir</h4>${after.join('')}<p class="pz-note">Depois de uma receção dela, em quantos rallies ganhámos o ponto.</p></section>` : '';
  const def = s.def.n ? `<section class="pz-card"><h4 class="pz-h">Defesa → transição</h4><div class="pz-stats">
      <div><strong>${s.def.n}</strong><span>defesas</span></div>
      <div><strong>${pct(s.def.good, s.def.n)}%</strong><span>jogáveis</span></div>
      <div><strong>${pct(s.def.won, s.def.n)}%</strong><span>viraram ponto nosso</span></div></div></section>` : '';
  const role = ROLE_LABEL[roleOf(id)] || 'Sem posição na ficha';
  return `<div class="pz-col">${headHTML(datas, id, `${role} · ${n} receções${s.def.n ? ` · ${s.def.n} defesas` : ''}`)}${receiverInsight(row, rr, datas, rate, teamRate, n)}
    ${rec}${rot}${zone}${afterHTML}${def}</div>`;
}
function receiverInsight(row, rr, datas, rate, teamRate, n) {
  if (row) {
    const own = row.tot.n ? row.tot.good / row.tot.n : null;
    const cells = rr.rots.map((r) => ({ r, c: row.byRot[r.key] })).filter((x) => x.c?.n >= 5);
    const worst = cells.sort((a, b) => a.c.good / a.c.n - b.c.good / b.c.n)[0];
    if (worst && own != null && own - worst.c.good / worst.c.n >= 0.15) {
      return insightHTML(`Custa-lhe a ${rotationLabel(worst.r, datas).short}: ${pct(worst.c.good, worst.c.n)}% de receções boas, quando o total dela é ${Math.round(own * 100)}%.`, 'warn');
    }
  }
  if (rate == null) return '';
  const tone = teamRate != null && rate >= teamRate + 0.1 ? 'good' : teamRate != null && rate <= teamRate - 0.1 ? 'warn' : 'info';
  return insightHTML(`${Math.round(rate * 100)}% de receções boas em ${n}${teamRate != null ? ` (equipa ${Math.round(teamRate * 100)}%)` : ''}.`, tone);
}

// --- Sequências ----------------------------------------------------------------
const QS = { PERFECT: '#', OK: '+', BAD: '−', ERROR: '=' };
function sequencesHTML(datas, roleOf) {
  const ids = new Set();
  for (const d of datas) for (const e of d.events) if (e.pid && ['RECEPTION', 'DEFENSE', 'SETTING', 'ATTACK'].includes(e.t)) ids.add(e.pid);
  const people = [...ids].map((id) => ({ id, ...nameOf(datas, id) })).sort((a, b) => (Number(a.num) || 99) - (Number(b.num) || 99));
  if (seqPid && !ids.has(seqPid)) seqPid = '';
  const sq = sequenceStats(datas, { roleOf, start: seqStart, pid: seqPid || null });
  const firstLabel = seqStart === 'RECEPTION' ? 'Receção' : 'Defesa';
  const step = (label, q) => `<span class="pz-step pz-step--${q || 'none'}">${esc(label)} ${q ? QS[q] : '?'}</span>`;
  const arrow = '<span class="pz-arrow" aria-hidden="true">→</span>';
  const who = (c) => {
    if (!seqPid) return '';
    const [k] = Object.entries(c.who).sort((a, b) => b[1] - a[1])[0] || [];
    if (!k) return '';
    return `<span class="pz-sub">${k.split('|').filter(Boolean).map((x) => esc(nameOf(datas, x).short)).join(' → ')}</span>`;
  };
  const list = sq.list.slice(0, 10);
  const rows = list.map((c) => `<div class="pz-seq">
      <div class="pz-chain">${step(firstLabel, c.first)}${arrow}${c.set ? `${step('Passe', c.set)}${arrow}` : ''}<span class="pz-step pz-step--atk">Ataque · ${esc(ZONE_LABEL[c.zone])}</span>${who(c)}</div>
      <strong>${c.n}</strong>
      <div>${barHTML([{ v: c.kill, cls: 'pz-o-kill' }, { v: c.cont, cls: 'pz-o-cont' }, { v: c.lost, cls: 'pz-o-err' }], `${c.kill} pontos, ${c.cont} continuaram, ${c.lost} erros ou bloqueados, em ${c.n}`)}
        <span class="pz-sub">${c.kill} pontos em ${c.n} (${pct(c.kill, c.n)}%)</span></div>
    </div>`).join('');
  const f = sq.funnel;
  const funnel = f.first ? [
    [`${firstLabel === 'Receção' ? 'Receções' : 'Defesas'}`, f.first], ['Jogáveis', f.playable], ['Chegou ao ataque', f.attacked], ['Ponto no 1.º ataque', f.kill],
  ].map(([l, n]) => `<div class="pz-fn"><span>${l}</span><div class="pz-fn__track"><div class="pz-fn__bar" style="width:${Math.round((n / f.first) * 100)}%"></div></div><strong>${n}</strong></div>`).join('') : '';
  // A cadeia que mais custa e a que mais rende, com 6 vezes ou mais.
  const big = sq.list.filter((c) => c.n >= 6);
  const desc = (c) => `${firstLabel} ${QS[c.first]} → ${c.set ? `passe ${QS[c.set]} → ` : ''}ataque ${ZONE_IN[c.zone]}`;
  const worst = big.slice().sort((a, b) => a.kill / a.n - b.kill / b.n)[0];
  const best = big.slice().sort((a, b) => b.kill / b.n - a.kill / a.n)[0];
  const side = `
    ${funnel ? `<section class="pz-card"><h4 class="pz-h">Onde a cadeia se parte</h4>${funnel}<p class="pz-note">De ${f.first} ${firstLabel === 'Receção' ? 'receções' : 'defesas'}, quantas chegaram a cada passo.</p></section>` : ''}
    ${worst && best && worst !== best ? `
      <section class="pz-card pz-card--warn"><h4 class="pz-h">A cadeia que mais custa</h4><p>${esc(desc(worst))}: ${worst.n} vezes, ${worst.kill} ponto${worst.kill === 1 ? '' : 's'}${worst.lost ? `; em ${worst.lost} a bola foi bloqueada ou saiu` : ''}.</p></section>
      <section class="pz-card pz-card--good"><h4 class="pz-h">A que mais rende</h4><p>${esc(desc(best))}: ${best.n} vezes, ${best.kill} pontos (${pct(best.kill, best.n)}%).</p></section>` : ''}`;
  return `
    <div class="pz-controls">
      <div class="field"><label for="pz-seq-pid">Com a atleta</label><select id="pz-seq-pid">
        <option value="">Todas</option>${people.map((p) => `<option value="${esc(p.id)}" ${seqPid === p.id ? 'selected' : ''}>${esc(`${p.num} · ${p.name}`)}</option>`).join('')}</select></div>
      <div class="field"><label for="pz-seq-start">Começa em</label><select id="pz-seq-start">
        <option value="RECEPTION" ${seqStart === 'RECEPTION' ? 'selected' : ''}>Receção (side-out)</option>
        <option value="DEFENSE" ${seqStart === 'DEFENSE' ? 'selected' : ''}>Defesa (transição)</option></select></div>
    </div>
    ${list.length ? `<div class="pz-seqgrid">
      <section class="pz-card"><h4 class="pz-h">As cadeias mais comuns</h4>
        <div class="pz-seq pz-seq--head"><span>${firstLabel} → passe → ataque</span><span>Vezes</span><span>Como acabou</span></div>
        ${rows}
        ${legendHTML([['pz-o-kill', 'ponto no próprio ataque'], ['pz-o-cont', 'a bola continuou'], ['pz-o-err', 'erro ou bloqueado']])}
        ${seqPid ? '<p class="pz-note">Só as cadeias em que ela tocou na bola, com quem fez cada toque (a combinação mais frequente).</p>' : ''}
      </section>
      <div class="pz-col">${side}</div></div>`
      : `<p class="muted">Sem cadeias${seqPid ? ' com esta atleta' : ''} a começar ${seqStart === 'RECEPTION' ? 'na receção' : 'na defesa'}. Para as sequências é preciso marcar o primeiro toque e o ataque${seqStart === 'DEFENSE' ? ' (e a defesa)' : ''}.</p>`}`;
}
