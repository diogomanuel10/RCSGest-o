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

// A mensagem leva SÓ o que está preenchido. As linhas em branco chegaram a
// ir com um "(por preencher)" ao lado — a ideia era que quem lê dissesse o
// que falta —, mas o que sai é uma lista de buracos: a família recebe oito
// linhas, seis delas vazias, e deixa de conseguir ver as duas que tinha de
// verificar. Uma mensagem com três linhas certas lê-se; uma com oito, metade
// a dizer que a app não sabe, parece um formulário por preencher e
// responde-se como a um formulário — não se responde.
//
// O que falta continua a ver-se onde é trabalho de quem o preenche: na
// tabela das Encomendas, com o contador e o "—" em cada célula.
//
// Nome a estampar: o que estiver guardado. NÃO se usa o nome do atleta como
// recurso — é exatamente isso que se está a perguntar, e uma mensagem que
// apresenta um palpite como se fosse dado é uma confirmação que confirma o
// engano.
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

  const dados = [
    player.number ? `Número: ${player.number}` : '',
    (row.nome_camisola || '').trim() ? `Nome na camisola principal: ${row.nome_camisola.trim()}` : '',
    (row.nome_camisola_alt || '').trim() ? `Nome na camisola alternativa: ${row.nome_camisola_alt.trim()}` : '',
  ].filter(Boolean);

  const linhas = articles
    .map((a) => [a.label, (sizes[a.key] || '').trim()])
    .filter(([, v]) => v)
    .map(([label, v]) => `• ${label}: ${v}`);

  // Com a ficha inteira em branco não há nada para confirmar, e uma mensagem
  // só com o cumprimento e um "está certo?" pergunta sobre o vazio. Aí
  // diz-se o que é preciso — é a única altura em que esta mensagem pergunta
  // em vez de confirmar.
  if (!dados.length && !linhas.length) {
    return [
      quem,
      '',
      'Ainda não temos nada registado: diz-nos o número que queres, o nome a estampar na camisola (principal e alternativa) e os tamanhos de cada peça.',
      ...(clubName ? ['', `— ${clubName}`] : []),
    ].join('\n');
  }

  return [
    quem,
    ...(dados.length ? ['', ...dados] : []),
    ...(linhas.length ? ['', 'Tamanhos:', ...linhas] : []),
    '',
    'Se estiver tudo certo, responde só "confirmo". Se houver alguma coisa a corrigir — ou a acrescentar —, diz o quê: depois de encomendado já não dá para trocar.',
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
