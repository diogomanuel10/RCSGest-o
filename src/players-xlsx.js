// Importação/modelo de atletas a partir de ficheiros Excel (.xlsx).
// Usa a biblioteca SheetJS (xlsx), carregada dinamicamente só quando é mesmo
// precisa (mantém o arranque da app leve). As colunas são reconhecidas pelo
// cabeçalho, aceitando algumas variações de nome e acentos.

// Carrega o SheetJS sob demanda (code-splitting do Vite).
const loadXLSX = () => import('xlsx');

// Cabeçalhos esperados no ficheiro (a 1.ª linha). A ordem é a do modelo.
export const PLAYER_COLUMNS = [
  'Nome',
  'Número',
  'Data de nascimento',
  'Ano de nascimento',
  'Posição',
  'Nº de federado',
  'Contacto do encarregado',
  'Observações',
];

// Normaliza um cabeçalho (minúsculas, sem acentos, sem espaços extra) para
// conseguir mapear variações como "Numero", "Nº" ou "Ano".
function normalize(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Mapeia o cabeçalho do ficheiro para o campo interno do atleta.
function fieldForHeader(header) {
  const h = normalize(header);
  if (h === 'nome') return 'name';
  if (h === 'numero' || h === 'no' || h === 'n' || h === '#') return 'number';
  // "Data de nascimento" antes de "Ano": um cabeçalho que comece por "data"
  // nunca é o ano, e a ordem inversa apanhava "data" em nenhum dos dois.
  if (h.startsWith('data') || h === 'nascimento' || h === 'nasc') return 'birth_date';
  if (h.startsWith('ano')) return 'birth_year';
  if (h.startsWith('posic')) return 'position';
  if (h.includes('feder')) return 'federation_number';
  if (h.includes('encarreg') || h.includes('guardian') || h.includes('contact')) return 'guardian_contact';
  if (h.startsWith('observ') || h === 'notas' || h === 'obs') return 'notes';
  return null;
}

// Data de nascimento vinda do Excel para 'YYYY-MM-DD'. Aceita uma célula de
// data (`Date`, com `cellDates`) e texto escrito à mão em dd/mm/aaaa ou
// aaaa-mm-dd. O que não for reconhecido fica vazio: uma data mal lida põe o
// aniversário no dia errado, e aí mais valia não haver data nenhuma.
function isoDate(cell) {
  if (cell === undefined || cell === null || cell === '') return null;
  const pad = (n) => String(n).padStart(2, '0');
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
  }
  const txt = String(cell).trim();
  let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = txt.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

// Lê um ficheiro .xlsx e devolve { players, skipped }.
// `players` são linhas válidas (com nome); `skipped` é o nº de linhas ignoradas.
export async function parsePlayersFile(file) {
  const XLSX = await loadXLSX();
  const buffer = await file.arrayBuffer();
  // `cellDates` devolve as datas como `Date` em vez do número de série do
  // Excel: sem isto, uma data lida do ficheiro entrava na ficha como "39448".
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
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
      if (field === 'birth_date') {
        obj.birth_date = isoDate(cell);
        return;
      }
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
      birth_date: obj.birth_date || null,
      // Com data completa o ano vem dela — é a mesma regra do formulário.
      birth_year: obj.birth_date ? obj.birth_date.slice(0, 4) : obj.birth_year || null,
      position: obj.position || null,
      federation_number: obj.federation_number || null,
      guardian_contact: obj.guardian_contact || null,
      notes: obj.notes || null,
    });
  }

  return { players, skipped };
}

// Descarrega um modelo .xlsx (cabeçalho + linhas de exemplo).
export async function downloadPlayersTemplate() {
  const XLSX = await loadXLSX();
  const rows = [
    PLAYER_COLUMNS,
    ['Maria Silva', '7', '14/03/2008', '2008', 'Distribuidor', 'FVB-12345', '912 345 678', ''],
    ['Joana Costa', '12', '', '2009', 'Central', 'FVB-67890', '963 456 789', 'Lesão no joelho esq.'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 22 },
    { wch: 10 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Atletas');
  XLSX.writeFile(wb, 'modelo-atletas-rumia.xlsx');
}
