// Mensagem de confirmação dos dados da encomenda, atleta a atleta.
//
// A tabela das Encomendas é a lista que vai ao fornecedor, e o que lá está
// não foi confirmado por ninguém: o número, o nome a estampar e os tamanhos
// foram escritos pelo treinador de memória ou saíram de uma medição da época
// passada. O erro só aparece quando a caixa chega — "MARIA" em vez de
// "MARIANA", um M que devia ser S —, e uma camisola estampada não se troca.
//
// É UMA mensagem por ATLETA e não uma do escalão, pela mesma razão do convite
// ao portal: o que se pergunta são os dados DELA, e uma mensagem de grupo com
// vinte fichas lá dentro não recebe vinte respostas — recebe duas.
//
// Mostra o que a app já tem preenchido e pede que confirmem ou corrijam. Uma
// mensagem que só pergunta ("que tamanho vestes?") obriga cada família a
// pensar do zero e responde-se muito menos do que a uma que diz "temos isto,
// está certo?".

// Nome a estampar: o que estiver guardado. NÃO se usa o nome do atleta como
// recurso — é exatamente isso que se está a perguntar, e uma mensagem que
// apresenta um palpite como se fosse dado é uma confirmação que confirma o
// engano.
function jerseyLine(label, value) {
  const v = (value || '').trim();
  return `${label}: ${v || '(por preencher — diz-nos o que queres estampar)'}`;
}

// `articles` é a lista em vigor do clube; `sizes` o objeto { chave: tamanho }.
// Os artigos por preencher DIZEM-SE, em vez de saírem da lista: são
// precisamente aqueles sobre os quais se está a escrever.
export function sizesMessage({ player, team, row = {}, articles, clubName }) {
  const sizes = row.sizes || {};

  // Sem ginástica de artigos e géneros ("d[a/o] Sub-21 F", "d[a/o] Rita"):
  // "da equipa X" e "de <nome completo>" estão sempre certos, e uma frase
  // que sai torta na primeira linha é a mensagem toda a parecer automática.
  const quem = [
    'Olá! Vamos encomendar o equipamento',
    team ? ` da equipa ${team}` : '',
    ' e precisamos de confirmar os dados de ',
    player.name || 'quem veste',
    '.',
  ].join('');

  const linhas = articles.map((a) => {
    const v = (sizes[a.key] || '').trim();
    return `• ${a.label}: ${v || '(por preencher)'}`;
  });

  return [
    quem,
    '',
    `Número: ${player.number ? player.number : '(por atribuir)'}`,
    jerseyLine('Nome na camisola principal', row.nome_camisola),
    jerseyLine('Nome na camisola alternativa', row.nome_camisola_alt),
    '',
    'Tamanhos:',
    ...linhas,
    '',
    'Se estiver tudo certo, responde só "confirmo". Se houver alguma coisa a corrigir, diz o quê — depois de encomendado já não dá para trocar.',
    ...(clubName ? ['', `— ${clubName}`] : []),
  ].join('\n');
}

// O contacto do encarregado é texto livre (a ficha aceita "telefone ou
// email"). Adivinha-se o canal para dar o botão certo — e não se adivinha
// mais nada: sem contacto reconhecível, fica só o copiar.
//
// É a MESMA pergunta dos convites ao portal, por isso vive num sítio só e é
// de lá que também se lê.
export function contactChannel(raw) {
  const v = (raw || '').trim();
  if (!v) return null;
  if (v.includes('@')) return { kind: 'email', value: v.toLowerCase() };
  const digits = v.replace(/\D/g, '');
  if (digits.length < 9) return null;
  // O wa.me exige indicativo. Nove dígitos sem indicativo é um número
  // português; qualquer coisa maior já o traz.
  const intl = v.startsWith('+') ? digits : digits.length === 9 ? `351${digits}` : digits;
  return { kind: 'phone', value: intl };
}

// Abre a app do canal com o texto já escrito. Nada é enviado pelas costas de
// ninguém: quem carrega vê a mensagem antes de a mandar.
export function sendVia(channel, { subject, text }) {
  const href = channel.kind === 'email'
    ? `mailto:${encodeURIComponent(channel.value)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
    : `https://wa.me/${channel.value}?text=${encodeURIComponent(text)}`;
  window.open(href, '_blank');
}
