// Folha da encomenda para o FORNECEDOR (.xlsx), no formato que ele usa.
//
// A exportação de `encomendas-xlsx.js` é a folha de trabalho do clube (quem
// confirmou, quem pagou, quanto custa). O fornecedor não quer nada disso: quer
// a folha dele — uma secção por escalão, uma linha por camisola a estampar,
// com o kit, o número, o nome e os tamanhos. Era copiada à mão da app para o
// modelo dele, linha a linha, e é nessa cópia que um "S" passa a "M".
//
// O desenho segue o modelo do fornecedor célula a célula (colunas B–K,
// cabeçalho azul, "Camisola alternativa" a laranja, nota no fim) para a folha
// poder seguir tal como sai. Precisa de cores e células unidas, que a versão
// livre do SheetJS não escreve — por isso usa o ExcelJS, carregado só quando
// alguém pede esta folha (chunk à parte).
//
// A camisola alternativa: quando leva o MESMO nome (e o mesmo tamanho) da
// principal, é uma linha só ("Equipamento Principal e Camisola alternativa").
// Quando o nome ou o tamanho difere, sai numa linha própria logo a seguir, só
// com o tamanho da camisola — e o número entra na nota do fim, que é o que o
// fornecedor lê para não estampar o nome errado.

const loadExcelJS = () => import('exceljs');

const MAIN_KEY = 'camisola';
const ALT_KEY = 'camisola_alt';

const BLUE = 'FF3367D6';
const ORANGE = 'FFFFC000';
const thin = { style: 'thin' };
const BOX = { top: thin, left: thin, bottom: thin, right: thin };

function slugify(text) {
  return String(text || 'clube')
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'clube';
}

// Exporta a folha do fornecedor.
//   clubLabel — nome do clube (só para o nome do ficheiro).
//   groups    — [{ teamLabel, players: [{ id, number, name }] }], pela ordem
//               em que devem sair.
//   sizesById — player_id → { nome_camisola, nome_camisola_alt, sizes }.
//   articles  — artigos em vigor (compute.equipmentArticles).
// Devolve quantas linhas de camisola foram escritas.
export async function exportFornecedorXLSX({ clubLabel, groups, sizesById, articles }) {
  const mod = await loadExcelJS();
  const ExcelJS = mod.default || mod;

  const mainArt = articles.find((a) => a.key === MAIN_KEY) || null;
  const altArt = articles.find((a) => a.key === ALT_KEY) || null;

  const hasData = (p) => {
    const s = sizesById[p.id] || {};
    return !!(s.nome_camisola || s.nome_camisola_alt
      || Object.values(s.sizes || {}).some(Boolean));
  };

  // As colunas de tamanho são os artigos que ALGUÉM desta folha tem
  // preenchidos: um clube com nove artigos e uma encomenda de três não manda
  // ao fornecedor seis colunas vazias. A camisola alternativa não é coluna —
  // é a linha própria, como no modelo.
  const used = groups.flatMap((g) => g.players).filter(hasData);
  const columns = articles.filter((a) => a.key !== ALT_KEY
    && used.some((p) => sizesById[p.id]?.sizes?.[a.key]));
  // A camisola principal vem sempre à cabeça, que é onde a linha da
  // alternativa escreve o seu tamanho.
  if (mainArt) {
    const i = columns.findIndex((a) => a.key === MAIN_KEY);
    if (i > 0) columns.unshift(columns.splice(i, 1)[0]);
    if (i === -1 && altArt) columns.unshift(mainArt);
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Folha1');

  // B..K no modelo; aqui F é o escalão e as colunas de tamanho começam em I.
  const firstSize = 9; // I
  const lastCol = Math.max(firstSize + columns.length - 1, 11); // pelo menos até K
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 12.6;
  ws.getColumn(3).width = 12.6;
  ws.getColumn(4).width = 1.75;
  ws.getColumn(5).width = 23.1;
  ws.getColumn(6).width = 11;
  ws.getColumn(7).width = 10;
  ws.getColumn(8).width = 14.9;
  for (let c = firstSize; c <= lastCol; c += 1) ws.getColumn(c).width = 12.25;

  const font = { name: 'Aptos Narrow', size: 11 };
  const center = { horizontal: 'center', vertical: 'middle' };
  const box = (row, from, to) => {
    for (let c = from; c <= to; c += 1) ws.getCell(row, c).border = BOX;
  };

  let r = 2;
  let written = 0;
  const altNumbers = [];

  groups.forEach((g) => {
    const players = g.players.filter(hasData);
    if (!players.length) return;

    // Título do escalão
    ws.mergeCells(r, 2, r, lastCol);
    const title = ws.getCell(r, 2);
    title.value = `ESCALÃO ${String(g.teamLabel || '').toUpperCase()}`;
    title.font = { ...font, bold: true };
    title.alignment = center;
    box(r, 2, lastCol);
    r += 2;

    // Cabeçalho
    const head = { name: 'Raleway', size: 9, color: { argb: 'FFFFFFFF' } };
    const fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
    const headAlign = { ...center, wrapText: true };
    ws.mergeCells(r, 2, r, 5);
    const kit = ws.getCell(r, 2);
    kit.value = 'KIT';
    kit.font = { ...head, size: 10 };
    kit.fill = fill;
    kit.alignment = headAlign;
    const labels = ['Escalão', 'Nº Camisola', 'Nome Camisola',
      ...columns.map((a) => `Tamanho ${a.label}`)];
    labels.forEach((text, i) => {
      const c = ws.getCell(r, 6 + i);
      c.value = text;
      c.font = head;
      c.fill = fill;
      c.alignment = headAlign;
    });
    ws.getRow(r).height = 36;
    box(r, 2, lastCol);
    r += 1;

    const escalao = String(g.teamLabel || '').toUpperCase();

    const writeRow = ({ kitText, together, number, name, sizes }) => {
      if (together) {
        ws.mergeCells(r, 2, r, 3);
        ws.getCell(r, 2).value = 'Equipamento Principal';
        ws.getCell(r, 4).value = 'e';
        const alt = ws.getCell(r, 5);
        alt.value = 'Camisola alternativa';
        alt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
        [2, 4, 5].forEach((c) => { ws.getCell(r, c).alignment = center; });
      } else {
        ws.mergeCells(r, 2, r, 5);
        const k = ws.getCell(r, 2);
        k.value = kitText;
        k.alignment = center;
        if (kitText === 'Camisola alternativa') {
          k.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } };
        }
      }
      const values = [escalao, number, name, ...sizes];
      values.forEach((v, i) => {
        const c = ws.getCell(r, 6 + i);
        c.value = v === '' || v == null ? null : v;
        c.alignment = center;
      });
      for (let c = 2; c <= lastCol; c += 1) ws.getCell(r, c).font = font;
      box(r, 2, lastCol);
      r += 1;
      written += 1;
    };

    players.forEach((p) => {
      const s = sizesById[p.id] || {};
      const sz = s.sizes || {};
      const num = parseInt(p.number, 10);
      const number = Number.isNaN(num) ? (p.number || '') : num;
      const mainName = (s.nome_camisola || '').trim().toUpperCase();
      const altName = (s.nome_camisola_alt || '').trim().toUpperCase();
      const mainSize = mainArt ? (sz[MAIN_KEY] || '') : '';
      const altSize = altArt ? (sz[ALT_KEY] || '') : '';

      // Leva camisola alternativa quem tem tamanho ou nome para ela.
      const hasAlt = !!(altSize || altName);
      const splitAlt = hasAlt
        && ((altName && altName !== mainName) || (altSize && mainSize && altSize !== mainSize));

      const sizes = columns.map((a) => sz[a.key] || '');
      if (!hasAlt) {
        writeRow({ kitText: 'Equipamento Principal', number, name: mainName, sizes });
      } else if (!splitAlt) {
        // Mesma camisola: o tamanho da alternativa só entra se a principal
        // não o tiver.
        if (mainArt && !mainSize && altSize) sizes[0] = altSize;
        writeRow({ together: true, number, name: mainName || altName, sizes });
      } else {
        writeRow({ kitText: 'Equipamento Principal', number, name: mainName, sizes });
        const altSizes = columns.map(() => '');
        if (columns.length) altSizes[0] = altSize || mainSize;
        writeRow({ kitText: 'Camisola alternativa', number, name: altName || mainName, sizes: altSizes });
        if (altName && altName !== mainName && number !== '') altNumbers.push(number);
      }
    });

    r += 1;
  });

  if (!written) return 0;

  if (altNumbers.length) {
    const uniq = [...new Set(altNumbers)];
    const list = uniq.length > 1
      ? `${uniq.slice(0, -1).join(', ')} e ${uniq[uniq.length - 1]}`
      : String(uniq[0]);
    ws.mergeCells(r, 2, r, lastCol);
    const nb = ws.getCell(r, 2);
    nb.value = uniq.length > 1
      ? `N.B. - As camisolas alternativas dos números ${list} têm nomes diferentes`
      : `N.B. - A camisola alternativa do número ${list} tem um nome diferente`;
    nb.font = font;
    nb.alignment = { horizontal: 'left' };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `encomenda-fornecedor-${slugify(clubLabel)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return written;
}
