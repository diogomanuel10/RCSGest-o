// Exportação do Scout: Excel (.xlsx, SheetJS carregado só quando é pedido)
// e folha A4 imprimível (report-sheet, a mesma moldura do resumo pós-jogo —
// "Guardar como PDF" na janela de impressão dá o PDF).
//
// O Excel é o "todos os dados": quem quer cruzar a época numa tabela
// dinâmica precisa das ações em bruto, uma por linha, e não só dos totais.
// A folha A4 é o que se afixa, se manda à direção ou se guarda no dossiê.

import {
  ACT, SYM, QN, derive, partials, setsWon, teamSummary, playerRows, pointsPlayed,
  findPlayer, pointTo, fmtPct,
} from './scout-engine.js';
import { openSheet, section, stat, empty } from './report-sheet.js';
import { esc, safeFileName } from './ui.js';

const loadXLSX = () => import('xlsx');

// `game` = { teamLabel, opponent, game_date, competition, status, data }
const fmtDate = (s) => (s ? s.split('-').reverse().join('/') : '');
const pc = (v) => (v == null ? '' : Math.round(v * 100));
const byDate = (a, b) => String(a.game_date || '').localeCompare(String(b.game_date || ''));

function result(g) {
  const w = setsWon(g.data);
  return { ...w, label: `${w.o}-${w.t}`, res: w.o > w.t ? 'V' : w.o < w.t ? 'D' : 'E' };
}

const ATHLETE_HEADER = (multi) => [
  'Nº', 'Atleta', ...(multi ? ['Jogos'] : []), 'Pontos jogados', 'Pontos', 'Erros',
  'Serv. total', 'Ases', 'Erros serv.', 'Ef. serv. %',
  'Rec. total', 'Erros rec.', 'Rec. positiva %', 'Rec. perfeita %',
  'Ataque total', 'Pontos ataque', 'Erros ataque', 'Bloqueados', 'Ef. ataque %',
  'Bloco total', 'Pontos bloco', 'Defesa total', 'Def. positiva %', 'Passe total', 'Passe positivo %',
];
const ATHLETE_WIDTHS = [5, 22, 7, 9, 7, 7, 7, 6, 9, 9, 8, 8, 12, 12, 10, 11, 10, 10, 10, 9, 10, 10, 12, 9, 13];

function athleteRow(r, played, multi) {
  const s = r.s;
  return [
    r.p.num, r.p.name, ...(multi ? [r.j] : []), played[r.id] || 0, s.pts, s.errs,
    s.srv, s.ace, s.srvErr, pc(s.effS), s.rec, s.recErr, pc(s.posR), pc(s.perfR),
    s.atk, s.kill, s.atkErr, s.atkBlk, pc(s.effA), s.blkT, s.blk, s.def, pc(s.posD), s.pas, pc(s.posP),
  ];
}

function sumPlayed(games) {
  const m = {};
  for (const g of games) {
    const p = pointsPlayed(g.data);
    for (const k of Object.keys(p)) m[k] = (m[k] || 0) + p[k];
  }
  return m;
}

function actionRows(games) {
  const rows = [];
  for (const g of games.slice().sort(byDate)) {
    const sc = g.data.sets.map(() => ({ o: 0, t: 0 }));
    for (const e of g.data.events) {
      const s = sc[e.set] || { o: 0, t: 0 };
      let para = '';
      const inc = pointTo(e);
      if (inc === 'OUR') { s.o++; para = 'Nós'; } else if (inc === 'THEIR') { s.t++; para = 'Adversário'; }
      const p = e.pid ? findPlayer(g.data, e.pid) : null;
      const nome = (id) => { const x = findPlayer(g.data, id); return x ? `${x.num} ${x.name}` : ''; };
      const fundamento = e.t === 'SUB' ? 'Substituição' : ACT[e.t].l;
      const qualidade = e.t === 'SUB'
        ? `Sai ${nome(e.out)} / entra ${nome(e.in)}`
        : e.t === 'OPPONENT'
          ? (e.q === 'ERROR' ? 'Erro do adversário' : 'Mérito do adversário')
          : `${SYM[e.q] === '−' ? '-' : SYM[e.q]} ${QN[e.q]}`;
      const hora = e.ts ? new Date(e.ts).toTimeString().slice(0, 8) : '';
      rows.push([g.game_date || '', g.opponent || '', e.set + 1, `${s.o}-${s.t}`, fundamento, qualidade,
        p ? p.num : '', p ? p.name : '', para, hora]);
    }
  }
  return rows;
}
const ACTION_HEADER = ['Data', 'Adversário', 'Set', 'Marcador', 'Fundamento', 'Qualidade', 'Nº', 'Atleta', 'Ponto para', 'Hora'];
const ACTION_WIDTHS = [11, 20, 5, 9, 12, 22, 5, 22, 11, 9];

function sheet(XLSX, aoa, widths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

export async function exportGameXlsx(g) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const r = result(g);
  const ts = teamSummary([g.data]);
  const resumo = [
    ['Equipa', g.teamLabel], ['Adversário', g.opponent], ['Data', fmtDate(g.game_date)],
    ['Competição', g.competition || ''], ['Resultado (sets)', r.label],
    ['Parciais', partials(g.data).map((s) => `${s.our}-${s.their}`).join(', ')],
    ['Estado', g.status === 'terminado' ? 'Terminado' : 'Em curso'], [],
    ['Pontos nossos', ts.our], ['  de ataque', ts.kill], ['  de serviço', ts.ace], ['  de bloco', ts.blk],
    ['  erros do adversário', ts.oppErr], ['Pontos do adversário', ts.their], ['  erros nossos', ts.ourErr],
    ['  mérito do adversário', ts.oppPt],
  ];
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, resumo, [24, 32]), 'Resumo');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [['Set', 'Nós', 'Adversário'],
    ...partials(g.data).map((s) => [s.set, s.our, s.their])], [6, 8, 12]), 'Sets');
  const played = pointsPlayed(g.data);
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [ATHLETE_HEADER(false),
    ...playerRows([g.data]).map((x) => athleteRow(x, played, false))], ATHLETE_WIDTHS.filter((_, i) => i !== 2)), 'Atletas');
  g.data.sets.forEach((_, i) => {
    const rows = playerRows([g.data], String(i));
    if (!rows.length) return;
    const pSet = {};
    // Pontos jogados no set: reproduz-se só esse set.
    const one = { ...g.data, sets: g.data.sets, events: g.data.events.filter((e) => e.set === i) };
    Object.assign(pSet, pointsPlayed(one));
    XLSX.utils.book_append_sheet(wb, sheet(XLSX, [ATHLETE_HEADER(false), ...rows.map((x) => athleteRow(x, pSet, false))],
      ATHLETE_WIDTHS.filter((_, k) => k !== 2)), `Atletas ${i + 1}º set`);
  });
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [ACTION_HEADER, ...actionRows([g])], ACTION_WIDTHS), 'Ações');
  XLSX.writeFile(wb, `${safeFileName(`Scout ${g.teamLabel} ${g.game_date} ${g.opponent}`)}.xlsx`);
}

export async function exportSeasonXlsx(teamLabel, games) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const all = games.slice().sort(byDate);
  const fin = all.filter((g) => g.status === 'terminado');

  const jogos = [['Data', 'Adversário', 'Competição', 'Estado', 'Resultado', 'Sets ganhos', 'Sets perdidos', 'Parciais',
    'Pontos nossos', 'Pontos adversário', 'Pontos ataque', 'Ases', 'Pontos bloco', 'Erros adversário', 'Erros nossos', 'Mérito adversário']];
  for (const g of all) {
    const r = result(g);
    const ts = teamSummary([g.data]);
    jogos.push([g.game_date, g.opponent, g.competition || '', g.status === 'terminado' ? 'Terminado' : 'Em curso',
      g.status === 'terminado' ? r.res : '', r.o, r.t, partials(g.data).map((s) => `${s.our}-${s.their}`).join(', '),
      ts.our, ts.their, ts.kill, ts.ace, ts.blk, ts.oppErr, ts.ourErr, ts.oppPt]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, jogos, [11, 22, 18, 10, 9, 10, 12, 24, 12, 14, 12, 6, 11, 14, 11, 15]), 'Jogos');

  const datas = fin.map((g) => g.data);
  const played = sumPlayed(fin);
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [ATHLETE_HEADER(true),
    ...playerRows(datas).map((x) => athleteRow(x, played, true))], ATHLETE_WIDTHS), 'Atletas (época)');

  const axj = [['Data', 'Adversário', ...ATHLETE_HEADER(false)]];
  for (const g of fin) {
    const p = pointsPlayed(g.data);
    for (const x of playerRows([g.data])) axj.push([g.game_date, g.opponent, ...athleteRow(x, p, false)]);
  }
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, axj, [11, 20, ...ATHLETE_WIDTHS.filter((_, i) => i !== 2)]), 'Atleta x Jogo');
  XLSX.utils.book_append_sheet(wb, sheet(XLSX, [ACTION_HEADER, ...actionRows(all)], ACTION_WIDTHS), 'Ações');
  XLSX.writeFile(wb, `${safeFileName(`Scout ${teamLabel} época`)}.xlsx`);
}

// --- Folha A4 -----------------------------------------------------------

function athleteTable(datas, played, multi) {
  const rows = playerRows(datas);
  if (!rows.length) return empty('Sem ações registadas.');
  return `<table class="rp-table">
    <thead><tr><th style="text-align:left">Atleta</th>${multi ? '<th>J</th>' : ''}<th>Pts jog.</th><th>Pts</th><th>Erros</th>
      <th>Serv.</th><th>Ace</th><th>Ef. S</th><th>Rec.</th><th>Pos.</th><th>Atq.</th><th>Pto</th><th>Ef. A</th><th>Blk</th><th>Def. +</th></tr></thead>
    <tbody>${rows.map(({ id, p, s, j }) => `<tr>
      <td>${esc(`${p.num} ${p.name}`)}</td>${multi ? `<td style="text-align:right">${j}</td>` : ''}
      <td style="text-align:right">${played[id] || 0}</td><td style="text-align:right"><b>${s.pts}</b></td><td style="text-align:right">${s.errs}</td>
      <td style="text-align:right">${s.srv}</td><td style="text-align:right">${s.ace}</td><td style="text-align:right">${fmtPct(s.effS)}</td>
      <td style="text-align:right">${s.rec}</td><td style="text-align:right">${fmtPct(s.posR)}</td>
      <td style="text-align:right">${s.atk}</td><td style="text-align:right">${s.kill}</td><td style="text-align:right">${fmtPct(s.effA)}</td>
      <td style="text-align:right">${s.blk}</td><td style="text-align:right">${fmtPct(s.posD)}</td></tr>`).join('')}</tbody></table>`;
}

function origem(ts) {
  return `<div class="rp-stats">
    ${stat(ts.our, 'pontos nossos', 'ok')}${stat(ts.kill, 'de ataque')}${stat(ts.ace, 'de serviço')}${stat(ts.blk, 'de bloco')}${stat(ts.oppErr, 'erros do adversário')}
  </div><div class="rp-stats" style="margin-top:3mm">
    ${stat(ts.their, 'pontos do adversário', 'danger')}${stat(ts.ourErr, 'erros nossos')}${stat(ts.oppPt, 'mérito do adversário')}
  </div>`;
}

export function openGameSheet(g) {
  const r = result(g);
  const ps = partials(g.data);
  openSheet({
    title: `${g.teamLabel} ${r.label} ${g.opponent}`,
    subtitle: [fmtDate(g.game_date), g.competition, ps.map((s) => `${s.our}-${s.their}`).join(' · ')].filter(Boolean).join(' · '),
    body: [
      section('Origem dos pontos', origem(teamSummary([g.data]))),
      section('Por atleta', athleteTable([g.data], pointsPlayed(g.data), false),
        'Pts jog. = pontos em que a atleta estava em campo. Ef. = (pontos − erros [− bloqueados]) ÷ total. Pos. = (# + +) ÷ total.'),
      ...g.data.sets.map((_, i) => {
        const d = derive(g.data, i);
        if (!d.our && !d.their) return '';
        const one = { ...g.data, events: g.data.events.filter((e) => e.set === i) };
        return section(`${i + 1}º set · ${d.our}-${d.their}`, athleteTable([one], pointsPlayed(one), false));
      }),
    ].join(''),
  });
}

export function openSeasonSheet(teamLabel, games) {
  const fin = games.filter((g) => g.status === 'terminado').sort(byDate);
  const v = fin.filter((g) => result(g).res === 'V').length;
  const lista = fin.length ? `<table class="rp-table"><thead><tr><th style="text-align:left">Data</th><th style="text-align:left">Adversário</th><th>Sets</th><th style="text-align:left">Parciais</th></tr></thead>
    <tbody>${fin.map((g) => `<tr><td>${esc(fmtDate(g.game_date))}</td><td>${esc(g.opponent)}</td><td style="text-align:right">${result(g).label}</td>
      <td>${esc(partials(g.data).map((s) => `${s.our}-${s.their}`).join(', '))}</td></tr>`).join('')}</tbody></table>`
    : empty('Ainda não há jogos terminados.');
  openSheet({
    title: `${teamLabel} · Scout da época`,
    subtitle: `${fin.length} jogos · ${v} vitórias · ${fin.length - v} derrotas`,
    body: [
      section('Jogos', lista),
      section('Origem dos pontos', origem(teamSummary(fin.map((g) => g.data)))),
      section('Totais por atleta', athleteTable(fin.map((g) => g.data), sumPlayed(fin), true)),
    ].join(''),
  });
}
