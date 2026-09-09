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

// Os passos, por ordem. O `url` é parâmetro para o cartaz poder desenhar o
// mesmo endereço que vai no QR.
export function joinSteps({ groupUrl, url = appUrl() } = {}) {
  const steps = [
    {
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

// Mensagem pronta a colar no grupo. Texto simples de propósito: é o que
// sobrevive ao WhatsApp, ao SMS e ao email sem se desmanchar.
export function joinMessage(team, groupUrl) {
  const b = branding();
  const club = b.club_name || b.app_name || 'clube';
  const who = team ? `${club} · ${teamName(team)}` : club;
  const steps = joinSteps({ groupUrl });

  return [
    `Acesso ao portal — ${who}`,
    '',
    'O portal é onde vês os treinos e jogos, respondes às convocatórias e consultas as presenças e as quotas.',
    '',
    ...steps.flatMap((s, i) => [`${i + 1}. ${s.title}`, ...s.lines, '']),
    'Qualquer dúvida, é só dizer.',
  ].join('\n').trim();
}
