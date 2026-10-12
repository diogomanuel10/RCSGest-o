// Importar atletas do clube inteiro a partir de texto colado (de uma folha de
// cálculo, de um email, de um .csv aberto no bloco de notas). Ao contrário do
// "Importar (xlsx)" de cada equipa, aqui é a LINHA que diz o escalão: colar o
// clube todo de uma vez em vez de repetir a importação equipa a equipa.
//
// Cabeçalhos obrigatórios: Nome, Posição, Escalões. As restantes colunas do
// modelo .xlsx (Número, Data de nascimento, …) são aceites se vierem.
// O separador das colunas é detetado no cabeçalho (tab, ; ou ,).

import { normalize, fieldForHeader, isoDate } from './players-xlsx.js';

export const PASTE_REQUIRED = ['Nome', 'Posição', 'Escalões'];

// Tab ganha sempre: é o que sai de copiar células do Excel/Sheets, e um nome
// com vírgula ("Silva, Ana") não pode partir a linha. Entre ; e , ganha o que
// aparecer no cabeçalho — o Excel em português exporta .csv com ;.
export function detectSeparator(headerLine) {
  if (headerLine.includes('\t')) return '\t';
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  if (semi && semi >= comma) return ';';
  if (comma) return ',';
  return '\t';
}

// Parte uma linha pelo separador, respeitando aspas ("Silva, Ana").
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && !cur.trim()) {
      quoted = true;
    } else if (ch === sep) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function headerField(header) {
  const h = normalize(header);
  if (h.startsWith('escal') || h === 'equipa' || h === 'equipas') return 'escaloes';
  return fieldForHeader(header);
}

// Lê o texto colado e resolve o escalão de cada linha contra as equipas
// (`teams`, só as que quem importa pode escrever).
//
// Devolve `{ error }` quando falta um cabeçalho obrigatório, ou
// `{ separator, rows }`. Cada linha: `{ line, name, position, team, extra,
// player, error }` — `player` é o registo pronto a inserir quando não há erro.
//
// Um atleta tem UMA equipa. Com vários escalões (`Juniores | Seniores`) a
// ficha fica na primeira e os outros vão para as observações ("Também joga
// em: Seniores"): criar uma ficha por escalão duplicava a atleta — duas
// fichas, duas quotas, dois cartões QR — e escolher em silêncio perdia o dado.
export function parsePastedPlayers(text, teams, { existing = [], positions = [] } = {}) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/^﻿/, ''))
    .filter((l) => l.trim());
  if (!lines.length) return { separator: null, rows: [] };

  const separator = detectSeparator(lines[0]);
  const fields = splitLine(lines[0], separator).map(headerField);
  const missing = [
    ['name', 'Nome'],
    ['position', 'Posição'],
    ['escaloes', 'Escalões'],
  ].filter(([f]) => !fields.includes(f)).map(([, label]) => label);
  if (missing.length) {
    return {
      separator,
      rows: [],
      error: `Falta${missing.length > 1 ? 'm' : ''} o${missing.length > 1 ? 's' : ''} cabeçalho${missing.length > 1 ? 's' : ''} ${missing.join(', ')} na primeira linha.`,
    };
  }

  // Escalão → equipas. Uma lista e não uma equipa: dois plantéis com o mesmo
  // escalão (masculino e feminino) não se adivinham — pede-se que se diga qual.
  const byEscalao = new Map();
  for (const t of teams) {
    const k = normalize(t.escalao);
    if (!byEscalao.has(k)) byEscalao.set(k, []);
    byEscalao.get(k).push(t);
  }
  const posByKey = new Map(positions.map((p) => [normalize(p), p]));
  // Quem já está no plantel não entra outra vez (colar a mesma lista duas
  // vezes é o engano mais provável de todos). Também dentro do próprio texto.
  const seen = new Set(existing.map((p) => `${p.team_id}|${normalize(p.name)}`));

  const rows = lines.slice(1).map((line, i) => {
    const cells = splitLine(line, separator);
    const obj = {};
    fields.forEach((f, col) => {
      if (f) obj[f] = cells[col] ?? '';
    });
    const name = (obj.name || '').trim();
    const position = posByKey.get(normalize(obj.position)) || (obj.position || '').trim() || null;
    const asked = String(obj.escaloes || '').split('|').map((s) => s.trim()).filter(Boolean);
    const row = { line: i + 2, name, position, team: null, extra: [], player: null, error: null };

    if (!name) { row.error = 'Sem nome'; return row; }
    if (!asked.length) { row.error = 'Sem escalão'; return row; }

    const resolved = [];
    for (const e of asked) {
      const found = byEscalao.get(normalize(e)) || [];
      if (!found.length) { row.error = `Escalão "${e}" não existe`; return row; }
      if (found.length > 1) { row.error = `Há ${found.length} equipas "${e}"`; return row; }
      if (!resolved.includes(found[0])) resolved.push(found[0]);
    }
    row.team = resolved[0];
    row.extra = resolved.slice(1);

    const key = `${row.team.id}|${normalize(name)}`;
    if (seen.has(key)) { row.error = 'Já existe neste escalão'; return row; }
    seen.add(key);

    const birthDate = obj.birth_date ? isoDate(obj.birth_date) : null;
    const notes = [
      (obj.notes || '').trim(),
      row.extra.length ? `Também joga em: ${row.extra.map((t) => t.escalao).join(', ')}` : '',
    ].filter(Boolean).join(' · ');
    row.player = {
      name,
      position,
      team_id: row.team.id,
      number: (obj.number || '').trim() || null,
      birth_date: birthDate,
      birth_year: birthDate ? birthDate.slice(0, 4) : (obj.birth_year || '').trim() || null,
      federation_number: (obj.federation_number || '').trim() || null,
      guardian_contact: (obj.guardian_contact || '').trim() || null,
      notes: notes || null,
    };
    return row;
  });

  return { separator, rows };
}
