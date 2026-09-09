// Guia de entrada no portal — o texto comum a todo o escalão.
//
// Os links de convite são pessoais e continuam a sê-lo (ver
// `views/convites-portal.js`): um link de equipa ligaria contas ao atleta
// errado. Mas TUDO O RESTO é igual para toda a gente — instalar a app no ecrã
// principal, ligar as notificações, entrar no grupo do escalão — e era isso
// que se estava a explicar vinte vezes por equipa, em conversas separadas,
// ficando por explicar a quem chegasse depois.
//
// O passo de instalar não é um extra de conforto: no iPhone a Apple só entrega
// notificações a uma PWA instalada (ver `push.js`). Sem esse passo o clube
// manda avisos que nunca chegam, e ninguém dá por isso.
//
// Os passos vivem aqui e não na vista porque têm DOIS desenhos — a mensagem
// para colar no grupo e o cartaz para afixar (`join-poster.js`). Escritos duas
// vezes, divergiam à primeira correção, e o cartaz é o que fica meses na
// parede.

import { appUrl } from './ui.js';
import { teamName } from './compute.js';
import { branding } from './branding.js';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

// Os passos, por ordem. O `url` é parâmetro para o cartaz poder desenhar o
// mesmo endereço que vai no QR.
//
// `personal` ({ name, url, expiresAt }) é o que torna a mensagem de UM atleta
// diferente do cartaz do escalão: no lugar do "cada atleta recebe um link só
// dela" entra o link mesmo, com o nome de quem o recebe. É o mesmo guia — o
// que muda é o primeiro passo, que é precisamente o passo que não pode ser
// igual para toda a gente.
export function joinSteps({ groupUrl, url = appUrl(), personal = null } = {}) {
  const steps = [
    personal
      ? {
          title: `Abre o link de ${personal.name}`,
          lines: [
            personal.url,
            'Abre, cria conta com o teu email e ficas logo ligado à ficha.',
            `O link é só de ${personal.name}${personal.expiresAt ? `, válido até ${fmtDate(personal.expiresAt)}` : ''} — não o reencaminhes a mais ninguém.`,
          ],
        }
      : {
          title: 'Abre o teu link pessoal',
          lines: [
            'Cada atleta recebe um link só dela, que a liga à ficha do clube.',
            'É pessoal: não o reencaminhes a mais ninguém.',
          ],
        },
    {
      title: 'Instala no ecrã principal',
      lines: [
        `iPhone: abre ${url} no Safari → Partilhar → “Adicionar ao ecrã principal”.`,
        `Android: abre ${url} no Chrome → menu ⋮ → “Instalar app”.`,
        'No iPhone, sem este passo não chegam notificações nenhumas.',
      ],
    },
    {
      title: 'Liga as notificações',
      lines: [
        'Dentro da app, toca no sino (canto superior) → “Ativar notificações”.',
        'É assim que sabes de um treino cancelado ou de uma convocatória.',
      ],
    },
  ];
  if (groupUrl) {
    steps.push({
      title: 'Entra no grupo do escalão',
      lines: [groupUrl],
    });
  }
  return steps;
}

// Mensagem pronta a enviar. Texto simples de propósito: é o que sobrevive ao
// WhatsApp, ao SMS e ao email sem se desmanchar.
//
// Com `personal` é a mensagem de UM atleta (o convite dele, com tudo o que a
// família precisa de saber a seguir); sem ele é o guia do escalão inteiro.
// São a mesma coisa escrita uma vez: mandar o link numa mensagem e as
// instruções noutra é como isto estava — e a segunda mensagem, na prática,
// nunca chegava a ser escrita.
export function joinMessage(team, groupUrl, personal = null) {
  const b = branding();
  const club = b.club_name || b.app_name || 'clube';
  const who = team ? `${club} · ${teamName(team)}` : club;
  const steps = joinSteps({ groupUrl, personal });

  return [
    personal ? `Acesso ao portal de ${personal.name} — ${who}` : `Acesso ao portal — ${who}`,
    '',
    'O portal é onde vês os treinos e jogos, respondes às convocatórias e consultas as presenças e as quotas.',
    '',
    ...steps.flatMap((s, i) => [`${i + 1}. ${s.title}`, ...s.lines, '']),
    'Qualquer dúvida, é só dizer.',
  ].join('\n').trim();
}
