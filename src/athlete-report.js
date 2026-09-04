// Ficha do atleta em folha A4 imprimível.
//
// É o documento que se entrega ao encarregado de educação no fim da época, ou
// que se leva para uma reunião com o atleta. Junta numa página o que hoje está
// espalhado por três separadores — comparência, participação em jogo, evolução
// física, lesões, quotas e documentos.
//
// O relatório mostra apenas o que quem o gera já podia ver na app: o detalhe
// clínico e o físico têm as suas permissões, e sem elas as secções não são
// sequer geradas. Imprimir não pode ser uma porta lateral para dados
// reservados.

import { state } from './store.js';
import {
  teamById,
  teamName,
  teamCoaches,
  playerAttendanceStats,
  playerAttendanceDrop,
  playerRecentTrainings,
  playerGameShare,
  playerQuotas,
  playerAvailability,
  physicalProfile,
  bmi,
  playerTestProgress,
  playerEpisodes,
  playerInjurySummary,
  episodeReturnDays,
  eventDateTime,
  sport,
} from './compute.js';
import { canAccess, canEdit } from './permissions.js';
import {
  ATTENDANCE_LABEL,
  AVAILABILITY_LABEL,
  REVIEW_LABEL,
  DOCUMENT_TYPES,
  DOC_TYPE_LABEL,
  EPISODE_STATUS_LABEL,
  MONTHS,
} from './constants.js';
import { openSheet, section, item, stat, tag, empty, fmtDate } from './report-sheet.js';
import { esc, euros } from './ui.js';

const ATT_TAG = { presente: 'ok', atraso: 'warn', justificado: 'info', falta: 'danger' };

export function openAthleteReport(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error('Atleta não encontrado.');

  const team = teamById(player.team_id);
  const blocks = [
    identificacao(player, team),
    comparencia(player),
    participacao(player),
    canAccess('fisica') ? fisico(player) : '',
    canAccess('medico') ? clinico(player) : '',
    canAccess('quotas') ? quotasBlock(player) : '',
    canEdit('documents') ? documentos(player) : '',
  ].filter(Boolean);

  openSheet({
    title: player.name,
    subtitle: [
      team ? teamName(team) : 'Sem equipa',
      player.number ? `Nº ${player.number}` : '',
      player.position || '',
      state.settings?.season ? `Época ${state.settings.season}` : '',
    ].filter(Boolean).join(' · '),
    body: blocks.join(''),
  });
}

// --- Identificação --------------------------------------------------------

function identificacao(player, team) {
  const coaches = team ? teamCoaches(team.id) : [];
  const av = playerAvailability(player.id);
  const status = av?.status || 'apto';

  return section('Identificação', `
    <div class="rp-grid">
      ${item('Nome', player.name)}
      ${item('Número', player.number || '')}
      ${item('Posição', player.position || '')}
      ${item('Data de nascimento', player.birth_date
        ? new Date(player.birth_date + 'T00:00:00').toLocaleDateString('pt-PT',
            { day: '2-digit', month: '2-digit', year: 'numeric' })
        : player.birth_year || '')}
      ${item('Equipa', team ? teamName(team) : '')}
      ${item('Treinador', coaches.map((c) => c.coach?.name).filter(Boolean).join(', '))}
      ${item('Disponibilidade', AVAILABILITY_LABEL[status] || status)}
      ${item('Avaliação de plantel', REVIEW_LABEL[player.review_status || 'pendente'] || '')}
    </div>
    ${av?.limitations ? `<p class="rp-note">Limitações ao treino: ${esc(av.limitations)}</p>` : ''}
  `);
}

// --- Comparência ----------------------------------------------------------

function comparencia(player) {
  const att = playerAttendanceStats(player.id);
  const drop = playerAttendanceDrop(player.id);
  const recentes = playerRecentTrainings(player.id, 10).filter((r) => r.attendance);

  if (!att.total) {
    return section('Comparência nos treinos', empty('Ainda não há presenças registadas para este atleta.'));
  }

  const variant = att.rate >= 80 ? 'ok' : att.rate >= 60 ? 'warn' : 'danger';
  const stats = [
    stat(att.rate + '%', 'comparência na época', variant),
    stat(att.counts.presente, 'presenças'),
    stat(att.counts.atraso, 'atrasos'),
    stat(att.counts.justificado, 'faltas justificadas'),
    stat(att.counts.falta, 'faltas', att.counts.falta ? 'danger' : ''),
  ].join('');

  // A tendência individual é o que a taxa da época esconde: quem vinha sempre
  // e deixou de vir mantém uma média alta durante semanas.
  const tendencia = drop
    ? `<p class="rp-note">Últimos ${drop.treinosRecentes} treinos: ${drop.recente}% (antes: ${drop.anterior}%${
        drop.delta === 0 ? '' : `, ${drop.delta > 0 ? '+' : ''}${drop.delta} pontos`
      }).${drop.faltasSeguidas >= 2 ? ` ${drop.faltasSeguidas} faltas seguidas.` : ''}</p>`
    : '';

  const lista = recentes.length ? `
    <table class="rp-table" style="margin-top:3mm">
      <thead><tr><th>Data</th><th>Treino</th><th>Estado</th></tr></thead>
      <tbody>
        ${recentes.map((r) => {
          const dt = eventDateTime(r.event);
          return `<tr>
            <td>${esc(dt.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' }))}</td>
            <td>${esc(r.event.title || 'Treino')}</td>
            <td>${tag(ATTENDANCE_LABEL[r.attendance.status] || r.attendance.status, ATT_TAG[r.attendance.status] || '')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>` : '';

  return section('Comparência nos treinos',
    `<div class="rp-stats">${stats}</div>${tendencia}${lista}`,
    att.semRegisto > 0
      ? `${att.semRegisto} treino(s) da equipa ainda sem registo de presenças — não contam para a percentagem.`
      : ''
  );
}

// --- Participação em jogo -------------------------------------------------

function participacao(player) {
  const share = playerGameShare(player.id);
  const emPontos = sport() === 'voleibol';
  const unidade = emPontos ? 'pontos' : 'minutos';

  // Sem parciais (ou sem minutos) não há denominador: prefere-se dizer que
  // falta o registo a mostrar uma percentagem inventada.
  if (share.share == null) {
    return section('Participação em jogo', empty(
      `Sem dados de participação. É preciso registar os ${unidade} de jogo (e, no voleibol, os parciais de cada jogo).`
    ));
  }

  return section('Participação em jogo', `
    <div class="rp-stats">
      ${stat(share.share + '%', `dos ${unidade} disputados`, share.share >= 25 ? 'ok' : 'warn')}
      ${stat(share.jogados, `${unidade} jogados`)}
      ${stat(share.totais, `${unidade} disputados pela equipa`)}
      ${stat(share.jogos, 'jogos considerados')}
    </div>
  `, `Só entram jogos com participação registada — um jogo por preencher não conta como zero.`);
}

// --- Preparação física ----------------------------------------------------

function fisico(player) {
  const prof = physicalProfile(player.id);
  const imc = bmi(player.id);
  const progress = playerTestProgress(player.id);
  const comEvolucao = progress.filter((p) => p.medicoes > 1);

  const dados = `
    <div class="rp-grid">
      ${item('Altura', prof?.height_cm ? `${prof.height_cm} cm` : '')}
      ${item('Peso', prof?.weight_kg ? `${prof.weight_kg} kg` : '')}
      ${item('IMC', imc != null ? String(imc) : '')}
    </div>`;

  if (!progress.length) {
    return section('Preparação física', dados + empty('Sem avaliações físicas registadas.'));
  }

  const tabela = `
    <table class="rp-table" style="margin-top:3mm">
      <thead><tr>
        <th>Teste</th><th class="rp-num">Primeira</th><th class="rp-num">Última</th>
        <th class="rp-num">Variação</th><th>Evolução</th><th class="rp-num">Medições</th>
      </tr></thead>
      <tbody>${progress.map(progressRow).join('')}</tbody>
    </table>`;

  return section('Preparação física', dados + tabela,
    comEvolucao.length
      ? ''
      : 'Cada teste tem uma só medição: a evolução aparece a partir da segunda avaliação.'
  );
}

function progressRow(p) {
  const unit = p.unit ? ' ' + p.unit : '';
  const sinal = p.delta > 0 ? '+' : '';
  const variacao = p.delta == null
    ? '—'
    : `${sinal}${p.delta}${unit}${p.pct != null ? ` (${sinal}${p.pct}%)` : ''}`;
  const dir = { melhor: ['Melhorou', 'ok'], pior: ['Regrediu', 'danger'],
                igual: ['Sem alteração', ''], neutro: ['Variação', 'info'] }[p.direction];
  return `
    <tr>
      <td>${esc(p.label)}</td>
      <td class="rp-num">${esc(String(p.first.value))}${esc(unit)}</td>
      <td class="rp-num">${esc(String(p.last.value))}${esc(unit)}</td>
      <td class="rp-num">${esc(variacao)}</td>
      <td>${dir ? tag(dir[0], dir[1]) : '<span class="rp-tag">Uma medição</span>'}</td>
      <td class="rp-num">${p.medicoes}</td>
    </tr>`;
}

// --- Fisioterapia ---------------------------------------------------------

function clinico(player) {
  const eps = playerEpisodes(player.id);
  if (!eps.length) {
    return section('Histórico clínico', empty('Sem episódios clínicos registados.'));
  }
  const resumo = playerInjurySummary(player.id);

  const stats = [
    stat(resumo.total, 'episódios'),
    stat(resumo.emCurso, 'em curso', resumo.emCurso ? 'warn' : 'ok'),
    stat(resumo.diasMedios != null ? resumo.diasMedios : '—', 'dias até à alta (média)'),
    stat(resumo.zonasRepetidas.length, 'zonas recorrentes', resumo.zonasRepetidas.length ? 'warn' : ''),
  ].join('');

  const tabela = `
    <table class="rp-table" style="margin-top:3mm">
      <thead><tr><th>Episódio</th><th>Zona</th><th>Lesão</th><th>Alta</th><th class="rp-num">Dias</th><th>Estado</th></tr></thead>
      <tbody>
        ${eps.map((ep) => {
          const dias = episodeReturnDays(ep);
          return `<tr>
            <td>${esc(ep.title || '—')}</td>
            <td>${esc(ep.body_area || '—')}</td>
            <td>${esc(fmtDate(ep.injury_date))}</td>
            <td>${esc(fmtDate(ep.discharge_date))}</td>
            <td class="rp-num">${dias != null ? dias : '—'}</td>
            <td>${tag(EPISODE_STATUS_LABEL[ep.status] || ep.status,
                      ep.status === 'alta' ? 'ok' : ep.status === 'ativo' ? 'danger' : 'warn')}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>`;

  const repetidas = resumo.zonasRepetidas.length
    ? `Zonas lesionadas mais do que uma vez: ${resumo.zonasRepetidas.map((z) => `${z.zona} (${z.n})`).join(', ')}.`
    : '';

  return section('Histórico clínico', `<div class="rp-stats">${stats}</div>${tabela}`, repetidas);
}

// --- Quotas ---------------------------------------------------------------

function quotasBlock(player) {
  const q = playerQuotas(player.id);
  if (!q.list.length) {
    return section('Quotas', empty('Sem quotas emitidas para este atleta.'));
  }
  const pendentes = q.list.filter((x) => !x.pago);

  const stats = [
    stat(q.paidCount, 'quotas pagas', 'ok'),
    stat(q.owedCount, 'por pagar', q.owedCount ? 'danger' : ''),
    stat(euros(q.owed), 'em dívida', q.owed > 0 ? 'danger' : 'ok'),
  ].join('');

  const lista = pendentes.length ? `
    <table class="rp-table" style="margin-top:3mm">
      <thead><tr><th>Mês</th><th class="rp-num">Valor</th></tr></thead>
      <tbody>
        ${pendentes.map((x) => `<tr>
          <td>${esc(MONTHS[x.mes - 1] || x.mes)} ${x.ano}</td>
          <td class="rp-num">${esc(euros(Number(x.valor || 0)))}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : '';

  return section('Quotas', `<div class="rp-stats">${stats}</div>${lista}`);
}

// --- Documentos -----------------------------------------------------------

function documentos(player) {
  const docs = state.playerDocuments.filter((d) => d.player_id === player.id);
  const hoje = new Date();

  const linhas = DOCUMENT_TYPES.map((tipo) => {
    const doc = docs.find((d) => d.doc_type === tipo.key);
    let estado = ['Em falta', 'danger'];
    if (doc) {
      if (!doc.expires_at) {
        estado = tipo.hasExpiry ? ['Sem validade', 'warn'] : ['Entregue', 'ok'];
      } else {
        estado = new Date(doc.expires_at) < hoje ? ['Caducado', 'danger'] : ['Válido', 'ok'];
      }
    }
    return `<tr>
      <td>${esc(DOC_TYPE_LABEL[tipo.key] || tipo.key)}</td>
      <td>${esc(doc?.expires_at ? fmtDate(doc.expires_at) : '—')}</td>
      <td>${tag(estado[0], estado[1])}</td>
    </tr>`;
  }).join('');

  return section('Documentos', `
    <table class="rp-table">
      <thead><tr><th>Documento</th><th>Validade</th><th>Estado</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table>`);
}
