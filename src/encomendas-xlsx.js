// Exportação da encomenda de equipamento para .xlsx.
// Usa a biblioteca SheetJS (xlsx), carregada dinamicamente só quando é mesmo
// precisa (mantém o arranque da app leve). Gera duas folhas:
//   • "Atletas" — uma linha por atleta com o nome a estampar e cada tamanho;
//   • "Resumo"  — contagem de unidades por artigo e tamanho (para encomendar).

import { EQUIPMENT_ARTICLES } from './constants.js';

// Carrega o SheetJS sob demanda (code-splitting do Vite).
const loadXLSX = () => import('xlsx');

// Ordenação de tamanhos de texto (XS < S < … < XXL); resto natural.
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
function sizeSort(a, b, type) {
  if (type === 'text') {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
  }
  return String(a).localeCompare(String(b), 'pt', { numeric: true });
}

// Nome de ficheiro seguro a partir do nome da equipa.
function slugify(text) {
  return String(text || 'equipa')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'equipa';
}

// Exporta a encomenda de uma equipa.
//   teamLabel  — nome da equipa (para o título/ficheiro).
//   players    — atletas já ordenados; cada um { id, number, name }.
//   sizesById  — mapa player_id → linha de player_sizes (ou undefined).
export async function exportEncomendaXLSX({ teamLabel, players, sizesById }) {
  const XLSX = await loadXLSX();

  // --- Folha "Atletas": detalhe por atleta ---
  const detailHeader = [
    'Nº', 'Atleta', 'Nome Camisola', 'Nome Camisola Alt.',
    ...EQUIPMENT_ARTICLES.map((a) => a.label),
  ];
  const detailRows = players.map((p) => {
    const s = sizesById[p.id] || {};
    return [
      p.number || '',
      p.name || '',
      s.nome_camisola || '',
      s.nome_camisola_alt || '',
      ...EQUIPMENT_ARTICLES.map((a) => s[a.key] || ''),
    ];
  });
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
  wsDetail['!cols'] = [
    { wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 18 },
    ...EQUIPMENT_ARTICLES.map(() => ({ wch: 16 })),
  ];

  // --- Folha "Resumo": contagem por artigo e tamanho ---
  const summaryRows = [['Artigo', 'Tamanho', 'Quantidade']];
  EQUIPMENT_ARTICLES.forEach((article) => {
    const counts = {};
    players.forEach((p) => {
      const v = sizesById[p.id]?.[article.key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    const entries = Object.entries(counts).sort(([a], [b]) => sizeSort(a, b, article.type));
    if (!entries.length) {
      summaryRows.push([article.label, '—', 0]);
    } else {
      entries.forEach(([size, count]) => summaryRows.push([article.label, size, count]));
    }
  });
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Atletas');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
  XLSX.writeFile(wb, `encomenda-${slugify(teamLabel)}.xlsx`);
}
