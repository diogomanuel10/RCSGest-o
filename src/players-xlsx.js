// Importação/modelo de atletas a partir de ficheiros Excel (.xlsx).
// Usa a biblioteca SheetJS (xlsx), carregada dinamicamente só quando é mesmo
// precisa (mantém o arranque da app leve). As colunas são reconhecidas pelo
// cabeçalho, aceitando algumas variações de nome e acentos.

// Carrega o SheetJS sob demanda (code-splitting do Vite).
const loadXLSX = () => import('xlsx');

// Cabeçalhos esperados no ficheiro (a 1.ª linha). A ordem é a do modelo.
export const PLAYER_COLUMNS = ['Nome', 'Número', 'Ano de nascimento', 'Posição'];

// Normaliza um cabeçalho (minúsculas, sem acentos, sem espaços extra) para
// conseguir mapear variações como "Numero", "Nº" ou "Ano".
function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// Mapeia o cabeçalho do ficheiro para o campo interno do atleta.
function fieldForHeader(header) {
  const h = normalize(header);
  if (h === 'nome') return 'name';
  if (h === 'numero' || h === 'no' || h === 'n' || h === '#') return 'number';
  if (h.startsWith('ano')) return 'birth_year';
  if (h.startsWith('posic')) return 'position';
  return null;
}

// Lê um ficheiro .xlsx e devolve { players, skipped }.
// `players` são linhas válidas (com nome); `skipped` é o nº de linhas ignoradas.
export async function parsePlayersFile(file) {
  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { players: [], skipped: 0 };

  // Lê como matriz de linhas (a primeira é o cabeçalho).
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  if (!rows.length) return { players: [], skipped: 0 };

  const headers = rows[0].map(fieldForHeader);
  const players = [];
  let skipped = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const obj = {};
    headers.forEach((field, col) => {
      if (!field) return;
      const cell = row[col];
      obj[field] = cell === undefined || cell === null ? '' : String(cell).trim();
    });
    const name = (obj.name || '').trim();
    if (!name) {
      skipped++;
      continue;
    }
    players.push({
      name,
      number: obj.number || null,
      birth_year: obj.birth_year || null,
      position: obj.position || null,
    });
  }

  return { players, skipped };
}

// Descarrega um modelo .xlsx (cabeçalho + linhas de exemplo).
export async function downloadPlayersTemplate() {
  const XLSX = await loadXLSX();
  const rows = [
    PLAYER_COLUMNS,
    ['Maria Silva', '7', '2008', 'Distribuidor'],
    ['Joana Costa', '12', '2009', 'Central'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Atletas');
  XLSX.writeFile(wb, 'modelo-atletas-rcs.xlsx');
}
