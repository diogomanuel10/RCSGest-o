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

  // --- Folha "Resumo": contagem por artigo e tamanho, com o custo ---
  // É esta folha que vai para o fornecedor e para a direção, por isso leva
  // o preço unitário e o subtotal. Um artigo sem preço deixa as duas células
  // VAZIAS em vez de zero: zero numa folha de cálculo soma, e um total que
  // engole artigos por orçamentar é pior do que um total que falta.
  const summaryRows = [['Artigo', 'Tamanho', 'Quantidade', 'Preço unit. (€)', 'Subtotal (€)']];
  let grandTotal = 0;
  let anyMissing = false;

  articles.forEach((article) => {
    const counts = {};
    players.forEach((p) => {
      const v = sizesById[p.id]?.sizes?.[article.key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    });
    const entries = Object.entries(counts).sort(([a], [b]) => sizeSort(a, b, article.sizes));
    const priced = article.price != null;

    if (!entries.length) {
      summaryRows.push([article.label, '—', 0, priced ? article.price : '', '']);
      return;
    }
    entries.forEach(([size, count]) => {
      const sub = priced ? article.price * count : '';
      if (priced) grandTotal += article.price * count;
      else anyMissing = true;
      summaryRows.push([article.label, size, count, priced ? article.price : '', sub]);
    });
  });

  summaryRows.push([]);
  summaryRows.push([
    anyMissing ? 'TOTAL (sem os artigos por orçamentar)' : 'TOTAL',
    '', '', '', grandTotal,
  ]);

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Atletas');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');
  XLSX.writeFile(wb, `encomenda-${slugify(teamLabel)}.xlsx`);
}
