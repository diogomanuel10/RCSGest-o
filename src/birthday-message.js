// A mensagem de parabéns à família, atleta a atleta.
//
// O aniversário já chegava ao cabeçalho do Painel a tempo — que é a única
// coisa que um aniversário precisa de fazer. Mas saber que hoje é o dia da
// Carolina e mandar-lhe uma palavra são dois trabalhos diferentes: o segundo
// obrigava a abrir a ficha, procurar o contacto do encarregado, copiá-lo para
// o telemóvel e escrever do zero uma mensagem que se escreve vinte vezes por
// época. Escrita do zero à pressa, sai sempre a mesma linha seca — e no
// terceiro aniversário já não se manda nada.
//
// É UMA mensagem por ATLETA e vai para o contacto da FAMÍLIA (`guardian_contact`,
// o mesmo canal dos convites ao portal e da confirmação de tamanhos): nos
// escalões de formação quem tem telemóvel é o encarregado de educação, e a
// segunda metade do que aqui se diz é para ele.
//
// Nada é enviado pelas costas de ninguém: quem carrega abre o WhatsApp ou o
// email com o texto escrito e vê-o antes de o mandar.

// Sem ginástica de género ("d[a/o] Carolina", "uma atleta destas"): o nome
// próprio e a segunda pessoa estão sempre certos, e uma frase que sai torta
// na linha de abertura é a mensagem toda a parecer automática — que é o
// contrário do que ela vem fazer.
// A data por extenso, para a mensagem escrita com dias de antecedência.
function dayMonth(date) {
  return date.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });
}

export function birthdayMessage({ player, team, turning, days = 0, date, clubName }) {
  const primeiro = (player?.name || '').trim().split(/\s+/)[0] || '';

  // O dia diz-se como ele é lido: "hoje" só quando é hoje. O coordenador
  // prepara muitas vezes a mensagem na véspera (ou na sexta, para o domingo),
  // e uma mensagem a dizer "hoje" no dia errado é pior do que não a mandar.
  const quando = days === 0 ? 'Hoje'
    : days === 1 ? 'Amanhã'
    : `No próximo dia ${dayMonth(date)}`;

  const idade = turning ? ` ${turning} anos` : ' anos';

  return [
    `Olá! ${quando} ${primeiro} faz${idade} — e não queríamos deixar passar a data sem vos escrever. 🎂`,
    '',
    `Os parabéns de todo o clube, com um abraço grande para ${primeiro || 'quem faz anos'}.`,
    '',
    'E uma palavra para vocês, que estão sempre do outro lado: obrigado pelas manhãs de sábado, pelas viagens, pelas esperas no pavilhão e por um apoio que não aparece em estatística nenhuma mas que se nota em cada treino. Nada disto se faz sem a família por trás.',
    '',
    team
      ? `Obrigado por fazerem parte da equipa ${team} e deste clube. Que seja um dia muito feliz.`
      : 'Obrigado por fazerem parte deste clube. Que seja um dia muito feliz.',
    '',
    'Até ao próximo treino!',
    ...(clubName ? ['', `— ${clubName}`] : []),
  ].join('\n');
}
