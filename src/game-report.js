// Resumo pós-jogo em folha A4 imprimível.
//
// Depois de o treinador registar o resultado, os dados ficam a existir dentro
// da app e mais ninguém os vê. Este resumo é o que se afixa no balneário, se
// envia à direção ou se guarda no dossiê da época: o resultado, os parciais,
// quem jogou quanto, e o que isso fez ao balanço da equipa.
//
// Não interpreta nem opina — só arruma o que já foi registado. As notas do
// treinador aparecem como ele as escreveu.

import { state } from './store.js';
import {
  teamById,
  teamName,
  eventDateTime,
  gameResult,
  gameSetsOf,
  gameTotalPoints,
  teamRecord,
  teamForm,
  sport,
} from './compute.js';
import { openSheet, section, stat, tag, empty } from './report-sheet.js';
import { esc } from './ui.js';

export function openGameReport(eventId) {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) throw new Error('Jogo não encontrado.');

  const result = gameResult(eventId);
  if (!result) {
    throw new Error('Este jogo ainda não tem resultado registado. Regista o resultado primeiro.');
  }

  const team = teamById(event.team_id);
  const dateStr = eventDateTime(event).toLocaleDateString('pt-PT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  openSheet({
    title: `${team ? teamName(team) : 'Equipa'}${event.opponent ? ' vs ' + event.opponent : ''}`,
    subtitle: [dateStr, event.location || ''].filter(Boolean).join(' · '),
    body: [
      resultado(event, result),
      parciais(eventId),
      participacao(event, eventId),
      contexto(event, team),
      result.notes ? section('Notas do treinador', `<p style="margin:0">${esc(result.notes)}</p>`) : '',
    ].filter(Boolean).join(''),
  });
}

// --- Resultado ------------------------------------------------------------

function resultado(event, result) {
  const venceu = result.sets_for > result.sets_against;
  const empate = result.sets_for === result.sets_against;
  const total = gameTotalPoints(event.id);

  return section('Resultado', `
    <div class="rp-stats">
      ${stat(`${result.sets_for}–${result.sets_against}`,
             venceu ? 'vitória' : empate ? 'empate' : 'derrota',
             venceu ? 'ok' : empate ? '' : 'danger')}
      ${total ? stat(total, 'pontos disputados', 'info') : ''}
    </div>
  `);
}

// --- Parciais -------------------------------------------------------------

function parciais(eventId) {
  const sets = gameSetsOf(eventId);
  if (!sets.length) {
    // Sem parciais não há denominador para a participação — vale a pena
    // dizê-lo aqui, que é onde o treinador está a olhar.
    return section('Parciais', empty(
      'Sem parciais registados. Sem eles não é possível saber que percentagem do jogo cada atleta jogou.'
    ));
  }

  return section('Parciais', `
    <table class="rp-table">
      <thead><tr><th>Set</th><th class="rp-num">Nós</th><th class="rp-num">Eles</th><th></th></tr></thead>
      <tbody>
        ${sets.map((s) => {
          const ganho = (s.points_for || 0) > (s.points_against || 0);
          return `<tr>
            <td>${s.set_number}.º</td>
            <td class="rp-num">${s.points_for ?? '—'}</td>
            <td class="rp-num">${s.points_against ?? '—'}</td>
            <td>${tag(ganho ? 'Ganho' : 'Perdido', ganho ? 'ok' : 'danger')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`);
}

// --- Participação ---------------------------------------------------------

function participacao(event, eventId) {
  const emPontos = sport() === 'voleibol';
  const unidade = emPontos ? 'pontos' : 'minutos';
  const total = gameTotalPoints(eventId);

  const linhas = state.gameMinutes.filter((g) => g.event_id === eventId);
  if (!linhas.length) {
    return section(`Participação (${unidade})`, empty(
      `Sem participação registada neste jogo. Um jogo por preencher não conta como zero para nenhum atleta.`
    ));
  }

  const byPlayer = new Map(linhas.map((g) => [g.player_id, emPontos ? g.points : g.minutes]));
  const plantel = state.players
    .filter((p) => p.team_id === event.team_id)
    .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));

  // Quem tem linha jogou; quem não tem, não jogou. É a mesma regra do cálculo
  // da participação na época (`playerGameShare`), e tem de ser a mesma aqui.
  const jogaram = plantel.filter((p) => byPlayer.has(p.id) && Number(byPlayer.get(p.id)) > 0);
  const naoJogaram = plantel.filter((p) => !jogaram.includes(p));

  const tabela = `
    <table class="rp-table">
      <thead><tr>
        <th>Nº</th><th>Atleta</th><th>Posição</th>
        <th class="rp-num">${esc(unidade.charAt(0).toUpperCase() + unidade.slice(1))}</th>
        ${total ? '<th class="rp-num">% do jogo</th>' : ''}
      </tr></thead>
      <tbody>
        ${jogaram.map((p) => {
          const v = Number(byPlayer.get(p.id)) || 0;
          return `<tr>
            <td>${esc(p.number || '—')}</td>
            <td>${esc(p.name)}</td>
            <td>${esc(p.position || '—')}</td>
            <td class="rp-num">${v}</td>
            ${total ? `<td class="rp-num">${Math.round((Math.min(v, total) / total) * 100)}%</td>` : ''}
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  const fora = naoJogaram.length
    ? `Não entraram: ${naoJogaram.map((p) => p.name).join(', ')}.`
    : '';

  return section(`Participação (${unidade})`, `
    <div class="rp-stats" style="margin-bottom:3mm">
      ${stat(jogaram.length, 'atletas utilizados')}
      ${stat(naoJogaram.length, 'não entraram', naoJogaram.length ? 'warn' : '')}
      ${total ? stat(total, `${unidade} disputados`, 'info') : ''}
    </div>${tabela}`, fora);
}

// --- Contexto -------------------------------------------------------------
//
// Um resultado isolado não diz muito. O balanço da época e a forma recente
// dizem se foi um desvio ou a continuação de uma tendência.

function contexto(event, team) {
  if (!team) return '';
  const rec = teamRecord(team.id);
  if (!rec.jogos) return '';

  const forma = teamForm(team.id, 5);
  const taxa = Math.round((rec.vitorias / rec.jogos) * 100);

  const sequencia = forma.length
    ? `<p class="rp-note" style="margin-top:2mm">Últimos ${forma.length} jogos (do mais recente): ${
        forma.map((f) => (f.win ? 'V' : 'D')).join(' · ')
      }</p>`
    : '';

  return section('A época desta equipa', `
    <div class="rp-stats">
      ${stat(`${rec.vitorias}–${rec.derrotas}`, 'balanço da época', taxa >= 50 ? 'ok' : 'warn')}
      ${stat(taxa + '%', 'vitórias')}
      ${stat(`${rec.setsFor}–${rec.setsAgainst}`, 'sets')}
      ${stat(rec.jogos, 'jogos com resultado')}
    </div>${sequencia}`);
}
