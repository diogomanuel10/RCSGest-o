// Exportação da encomenda de equipamento para .xlsx.
// Usa a biblioteca SheetJS (xlsx), carregada dinamicamente só quando é mesmo
// precisa (mantém o arranque da app leve). Gera duas folhas:
//   • "Atletas" — uma linha por atleta com o nome a estampar e cada tamanho;
//   • "Resumo"  — contagem de unidades por artigo e tamanho (para encomendar).

// Carrega o SheetJS sob demanda (code-splitting do Vite).
const loadXLSX = () => import('xlsx');

// Ordenação de tamanhos pela ordem em que o clube os escreveu — é ela que diz
// que XS vem antes de S, sem este módulo ter de conhecer escala nenhuma. Um
// valor fora da lista (registado antes de o artigo mudar) vai para o fim.
function sizeSort(a, b, order = []) {
  const ia = order.indexOf(a);
  const ib = order.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
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
//   sizesById  — mapa player_id → { nome_camisola, nome_camisola_alt, sizes }
//                onde `sizes` é { chave do artigo: tamanho }.
//   articles   — a lista de artigos EM VIGOR no clube (compute.equipmentArticles).
//                Vem de fora porque este módulo é um chunk à parte e não deve
//                ir buscar o estado da app para saber o que exportar.
export async function exportEncomendaXLSX({ teamLabel, players, sizesById, articles }) {
  const XLSX = await loadXLSX();

  // --- Folha "Atletas": detalhe por atleta ---
  const detailHeader = [
    'Nº', 'Atleta', 'Nome Camisola', 'Nome Camisola Alt.',
    ...articles.map((a) => a.label),
  ];
  const detailRows = players.map((p) => {
    const s = sizesById[p.id] || {};
    return [
      p.number || '',
      p.name || '',
      s.nome_camisola || '',
      s.nome_camisola_alt || '',
      ...articles.map((a) => s.sizes?.[a.key] || ''),
    ];
  });
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeader, ...detailRows]);
  wsDetail['!cols'] = [
    { wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 18 },
    ...articles.map(() => ({ wch: 16 })),
  ];

  // --- Folha "Resumo": contagem por artigo e tamanho ---
  const summaryRows = [['Artigo', 'Tamanho', 'Quantidade']];
  articles.forEach((article) => {
    const counts = {};
    players.forEach((p) => {
      const v = sizesById[p.id]?.sizes?.[article.key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    const entries = Object.entries(counts).sort(([a], [b]) => sizeSort(a, b, article.sizes));
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
