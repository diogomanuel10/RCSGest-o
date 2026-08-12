// Cálculos derivados a partir do estado (state). Sem efeitos secundários.

import { state } from './store.js';
import { isClubWide } from './permissions.js';
import {
  TIER_VALUE, IN_PROGRESS_STATUSES, DEFAULT_ESCALOES,
  DEFAULT_SPORT, SPORT_POSITIONS, DEFAULT_POSITIONS, DOC_TYPE_LABEL, DOCUMENT_TYPES,
  PHYSICAL_TEST_LABEL, PHYSICAL_TEST_UNIT, PHYSICAL_TEST_BETTER,
} from './constants.js';

// Tipos de documento que deviam ter data de validade (exame médico, seguro…).
const EXPIRY_DOC_TYPES = DOCUMENT_TYPES.filter((t) => t.hasExpiry).map((t) => t.key);
// Ordem de urgência dos alertas de documentos.
const DOC_ALERT_RANK = { expired: 0, missing: 1, soon: 2 };

// Lista de escalões em vigor (configurável nas Definições). Recorre à lista
// por omissão se ainda não houver nada guardado.
export function escaloes() {
  const e = state.settings?.escaloes;
  return Array.isArray(e) && e.length ? e : DEFAULT_ESCALOES;
}

// Modalidade do clube (configurável nas Definições / escolhida no onboarding).
export function sport() {
  return state.settings?.sport || DEFAULT_SPORT;
}

// Posições em vigor. Se o clube tiver uma lista personalizada (settings.positions)
// usa-a; caso contrário deriva da modalidade escolhida. Assim, mudar de
// modalidade muda logo as posições sem precisar de as recriar à mão.
export function positions() {
  const custom = state.settings?.positions;
  if (Array.isArray(custom) && custom.length) return custom;
  return SPORT_POSITIONS[sport()] || DEFAULT_POSITIONS;
}

// Cor de identidade por escalão / posição: índice na lista configurada (que é
// estável) -> paleta cíclica, para cada escalão/posição ter sempre a mesma cor.
// Partilhado pelos Plantéis (plantel + avaliação) e pelos Treinadores.
const ESCALAO_COLORS = ['#143b61', '#1e5080', '#0d9488', '#b45309', '#7c3aed', '#be185d', '#0369a1', '#4d7c0f'];
const POSITION_COLORS = ['#7c3aed', '#2563eb', '#0d9488', '#dc2626', '#d39f00', '#be185d', '#0369a1', '#4d7c0f'];
function colorFrom(list, value, palette) {
  const i = list.indexOf(value);
  return palette[(i < 0 ? 0 : i) % palette.length];
}
export const escalaoColor = (esc) => colorFrom(escaloes(), esc, ESCALAO_COLORS);
export const positionColor = (pos) => colorFrom(positions(), pos, POSITION_COLORS);

// Janela de aviso (dias de antecedência) para documentos a expirar,
// configurável nas Definições. Recorre a 30 dias se não estiver definida.
export function docAlertDays() {
  const d = Number(state.settings?.doc_alert_days);
  return Number.isFinite(d) && d > 0 ? d : 30;
}

// Documentos de atleta que precisam de atenção: já expirados, a expirar dentro
// de `days` dias, ou sem data de validade (num tipo que a devia ter, p. ex.
// exame médico/seguro). Junta o atleta e devolve ordenado por urgência
// (expirado → sem data → a expirar). Só conta documentos de atletas ativos na
// cache. A leitura de documentos já está limitada por RLS ao coordenador/
// fisioterapeuta/preparador, por isso a lista só traz o que o utilizador pode ver.
export function expiringDocuments(days = docAlertDays()) {
  const now = new Date();
  const dayMs = 1000 * 60 * 60 * 24;
  const out = [];
  for (const doc of state.playerDocuments) {
    // Documento sem validade, mas de um tipo que a devia ter → "em falta".
    const missing = !doc.expires_at && EXPIRY_DOC_TYPES.includes(doc.doc_type);
    let status, diffDays = null;
    if (doc.expires_at) {
      diffDays = (new Date(doc.expires_at) - now) / dayMs;
      if (diffDays < 0) status = 'expired';
      else if (diffDays <= days) status = 'soon';
      else continue; // ainda longe da validade
    } else if (missing) {
      status = 'missing';
    } else {
      continue; // sem validade e de um tipo que não a exige (ex.: CC)
    }
    const player = state.players.find((p) => p.id === doc.player_id);
    if (!player) continue;
    out.push({
      id: doc.id,
      player,
      playerId: player.id,
      docType: doc.doc_type,
      docLabel: DOC_TYPE_LABEL[doc.doc_type] || doc.doc_type,
      expiresAt: doc.expires_at || null,
      status,
      daysLeft: diffDays == null ? null : Math.round(diffDays),
    });
  }
  // Ordena por urgência (expirado → em falta → a expirar) e, dentro do mesmo
  // grupo com data, pela validade mais próxima.
  out.sort((a, b) => {
    if (DOC_ALERT_RANK[a.status] !== DOC_ALERT_RANK[b.status]) {
      return DOC_ALERT_RANK[a.status] - DOC_ALERT_RANK[b.status];
    }
    if (a.expiresAt && b.expiresAt) return new Date(a.expiresAt) - new Date(b.expiresAt);
    return 0;
  });
  return out;
}

// Total angariado = soma do valor do nível dos patrocínios CONFIRMADOS.
// Patrocínios confirmados sem nível contam 0 (não deviam existir, pois a app
// exige nível ao confirmar — mas o cálculo é defensivo na mesma).
export function totalRaised() {
  return state.sponsors
    .filter((s) => s.status === 'confirmado')
    .reduce((sum, s) => sum + (TIER_VALUE[s.tier] || 0), 0);
}

// Nº de contactos em curso (email enviado / a telefonar / em conversação).
export function inProgressCount() {
  return state.sponsors.filter((s) => IN_PROGRESS_STATUSES.includes(s.status)).length;
}

// Quotas por pagar: total em dívida (€) e nº de registos pendentes.
export function quotasOwed() {
  const pendentes = state.quotas.filter((q) => !q.pago);
  const total = pendentes.reduce((sum, q) => sum + Number(q.valor || 0), 0);
  return { total, count: pendentes.length };
}

// Estatística global de presenças nos treinos.
// "Presente" conta presente + atraso (compareceu). Devolve a taxa (0–100),
// o total de registos e a contagem por estado. rate é null se não houver dados.
export function attendanceStats() {
  const all = state.attendances;
  const counts = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
  all.forEach((a) => {
    if (counts[a.status] !== undefined) counts[a.status]++;
  });
  const total = all.length;
  const presentes = counts.presente + counts.atraso;
  const rate = total ? Math.round((presentes / total) * 100) : null;
  return { rate, total, counts };
}

// Nº de equipamentos em mau estado (precisam de atenção).
export function equipmentNeedsAttention() {
  return state.equipment.filter((e) => e.condition === 'mau').length;
}

// Próximos treinos (subconjunto de upcomingEvents só com type 'treino').
export function upcomingTrainings(limit = 5) {
  const now = new Date();
  return state.events
    .filter((e) => e.type === 'treino' && eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, limit);
}

// Data local YYYY-MM-DD (sem conversão para UTC).
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Treinos a precisar de marcação de presenças: os de hoje (sempre) e os
// passados que ainda não têm todos os atletas marcados. Devolve objetos
// enriquecidos { event, total, marked, isToday }, mais urgentes primeiro.
export function trainingsToMark(limit = 6) {
  const now = new Date();
  const todayStr = localDateStr(now);

  const attCount = {};
  state.attendances.forEach((a) => {
    attCount[a.event_id] = (attCount[a.event_id] || 0) + 1;
  });
  const teamSize = (teamId) =>
    teamId ? state.players.filter((p) => p.team_id === teamId).length : 0;

  const list = state.events.filter((e) => {
    if (e.type !== 'treino') return false;
    if (e.date === todayStr) return true; // hoje, sempre
    if (eventDateTime(e) < now && e.team_id) {
      const total = teamSize(e.team_id);
      return total > 0 && (attCount[e.id] || 0) < total; // ainda há quem marcar
    }
    return false;
  });

  return list
    .sort((a, b) => eventDateTime(b) - eventDateTime(a))
    .slice(0, limit)
    .map((e) => ({
      event: e,
      total: teamSize(e.team_id),
      marked: attCount[e.id] || 0,
      isToday: e.date === todayStr,
    }));
}

// Quantos patrocínios confirmados existem em cada nível.
export function confirmedByTier() {
  const counts = { ouro: 0, prata: 0, bronze: 0 };
  for (const s of state.sponsors) {
    if (s.status === 'confirmado' && counts[s.tier] !== undefined) counts[s.tier]++;
  }
  return counts;
}

// Quotas por cobrar no mês atual: nº de pendentes (registadas mas não pagas)
// e total em dívida desse mês.
export function quotasThisMonth() {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const ano = now.getFullYear();
  const monthQuotas = state.quotas.filter((q) => q.mes === mes && q.ano === ano);
  const pendentes = monthQuotas.filter((q) => !q.pago);
  const total = pendentes.reduce((s, q) => s + Number(q.valor || 0), 0);
  return { pendentes: pendentes.length, total, mes, ano };
}

// Nº de atletas com avaliação ainda por decidir (review_status 'pendente').
export function pendingReviews() {
  return state.players.filter((p) => (p.review_status || 'pendente') === 'pendente').length;
}

// Nº de prospetos prontos a inscrever no plantel (estado 'confirmado').
export function prospectsReady() {
  return state.prospects.filter((p) => p.status === 'confirmado').length;
}

// Data/hora de um evento como objeto Date (para comparar passado/futuro).
export function eventDateTime(ev) {
  const time = ev.time && /^\d{2}:\d{2}/.test(ev.time) ? ev.time : '00:00';
  return new Date(`${ev.date}T${time}`);
}

// Intervalo horário legível de um evento: "19:00–20:30", "19:00" ou "".
export function eventTimeRange(ev) {
  const s = ev.time ? ev.time.slice(0, 5) : '';
  const e = ev.end_time ? ev.end_time.slice(0, 5) : '';
  if (s && e) return `${s}–${e}`;
  return s || e || '';
}

// Eventos de hoje (qualquer tipo), ordenados por hora.
export function todayEvents() {
  const todayStr = localDateStr(new Date());
  return state.events
    .filter((e) => e.date === todayStr)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b));
}

// Próximos eventos (a partir de agora), ordenados, limitados a `limit`.
export function upcomingEvents(limit = 5) {
  const now = new Date();
  return state.events
    .filter((e) => eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, limit);
}

// Nome legível de uma equipa. O clube é só feminino, por isso o nome é o
// escalão (ex.: "Seniores"), sem qualificador de género.
export function teamName(team) {
  if (!team) return '';
  return team.escalao;
}

export function teamById(id) {
  return state.teams.find((t) => t.id === id) || null;
}

export function coachById(id) {
  return state.coaches.find((c) => c.id === id) || null;
}

// Treinadores de uma equipa, com o respetivo papel. Principal primeiro.
// Devolve [{ coach, role }] já com o objeto do treinador resolvido.
export function teamCoaches(teamId) {
  return state.teamCoaches
    .filter((tc) => tc.team_id === teamId)
    .map((tc) => ({ coach: coachById(tc.coach_id), role: tc.role }))
    .filter((x) => x.coach)
    .sort((a, b) => (a.role === 'principal' ? 0 : 1) - (b.role === 'principal' ? 0 : 1));
}

// Equipas de um treinador, com o papel que ocupa em cada uma.
// Devolve [{ team, role }].
export function coachTeams(coachId) {
  return state.teamCoaches
    .filter((tc) => tc.coach_id === coachId)
    .map((tc) => ({ team: teamById(tc.team_id), role: tc.role }))
    .filter((x) => x.team);
}

// Ficha de treinador (coach) ligada à conta autenticada, se existir.
export function currentCoach() {
  const uid = state.profile?.id;
  return uid ? state.coaches.find((c) => c.user_id === uid) : null;
}

// Escalões que o utilizador atual orienta (via a sua ficha de treinador).
// Devolve um Set de strings; vazio se não houver ficha/equipas.
export function currentCoachEscaloes() {
  const coach = currentCoach();
  if (!coach) return new Set();
  return new Set(
    coachTeams(coach.id)
      .map((x) => x.team?.escalao)
      .filter(Boolean)
  );
}

// Estatística de presenças de UM atleta (só treinos passados da sua equipa).
// "Compareceu" = presente + atraso. rate é null se não houver registos.
// Devolve { rate, total, counts, totalTrainings, semRegisto }.
export function playerAttendanceStats(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  const counts = { presente: 0, atraso: 0, justificado: 0, falta: 0 };
  if (!player) return { rate: null, total: 0, counts, totalTrainings: 0, semRegisto: 0 };

  const trainings = state.events.filter(
    (e) => e.type === 'treino' && e.team_id === player.team_id && eventDateTime(e) <= new Date()
  );
  const trainingIds = new Set(trainings.map((t) => t.id));
  const atts = state.attendances.filter(
    (a) => a.player_id === playerId && trainingIds.has(a.event_id)
  );
  atts.forEach((a) => { if (counts[a.status] !== undefined) counts[a.status]++; });

  const total = atts.length;
  const compareceu = counts.presente + counts.atraso;
  const rate = total ? Math.round((compareceu / total) * 100) : null;
  return { rate, total, counts, totalTrainings: trainings.length, semRegisto: trainings.length - total };
}

// Últimos treinos de um atleta, do mais recente para trás, com o estado dele
// em cada um. Uma percentagem de época não diz a ninguém a que faltou — e é o
// detalhe que o atleta reconhece ("faltei na terça") e sobre o qual pode agir.
// `semRegisto` marca os treinos que ninguém chegou a fechar.
export function playerRecentTrainings(playerId, limit = 8) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return [];

  const byEvent = new Map(
    state.attendances
      .filter((a) => a.player_id === playerId)
      .map((a) => [a.event_id, a])
  );

  return state.events
    .filter(
      (e) => e.type === 'treino' && e.team_id === player.team_id && eventDateTime(e) <= new Date()
    )
    .sort((a, b) => eventDateTime(b) - eventDateTime(a))
    .slice(0, limit)
    .map((ev) => ({ event: ev, attendance: byEvent.get(ev.id) || null }));
}

// Comparência nos últimos N treinos (a forma recente, por oposição à média da
// época). Só conta os treinos com registo — sem isso, um treino por fechar
// contaria como falta e dava um retrato errado.
export function playerRecentForm(playerId, last = 5) {
  const rows = playerRecentTrainings(playerId, last).filter((r) => r.attendance);
  if (!rows.length) return null;
  const compareceu = rows.filter((r) =>
    r.attendance.status === 'presente' || r.attendance.status === 'atraso'
  ).length;
  return { compareceu, total: rows.length, rate: Math.round((compareceu / rows.length) * 100) };
}

// Convocatórias de um atleta para os jogos que ainda vêm (a `nextPlayerSquadEvent`
// devolve só o próximo). Ordenadas do mais próximo para o mais distante.
export function playerUpcomingSquads(playerId, limit = 5) {
  const now = new Date();
  const mySquadIds = new Set(
    state.squadPlayers
      .filter((sp) => sp.player_id === playerId)
      .map((sp) => sp.squad_id)
  );
  const eventStatus = new Map();
  state.squads
    .filter((s) => mySquadIds.has(s.id))
    .forEach((s) => {
      const sp = state.squadPlayers.find(
        (p) => p.squad_id === s.id && p.player_id === playerId
      );
      eventStatus.set(s.event_id, sp?.status || 'convocado');
    });

  return state.events
    .filter((e) => e.type === 'jogo' && eventStatus.has(e.id) && eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, limit)
    .map((ev) => ({ event: ev, status: eventStatus.get(ev.id) }));
}

// --- Resultados de jogo --------------------------------------------------

// Resultado final de um jogo (ou null se ainda não foi registado).
export function gameResult(eventId) {
  return state.gameResults.find((r) => r.event_id === eventId) || null;
}

// Parciais de um jogo, por ordem de set.
export function gameSetsOf(eventId) {
  return state.gameSets
    .filter((s) => s.event_id === eventId)
    .sort((a, b) => a.set_number - b.set_number);
}

// Total de pontos disputados num jogo (soma dos parciais dos dois lados).
// É o DENOMINADOR da participação: no voleibol não há relógio, por isso
// "jogou 96 pontos" só diz alguma coisa contra o total do jogo.
// Devolve 0 quando não há parciais — e é por isso que eles importam.
export function gameTotalPoints(eventId) {
  return gameSetsOf(eventId).reduce(
    (sum, s) => sum + (s.points_for || 0) + (s.points_against || 0), 0
  );
}

// Forma recente de uma equipa: os últimos N jogos COM resultado, do mais
// recente para trás, com vitória/derrota já decidida.
export function teamForm(teamId, last = 5) {
  return state.events
    .filter((e) => e.type === 'jogo' && e.team_id === teamId && gameResult(e.id))
    .sort((a, b) => eventDateTime(b) - eventDateTime(a))
    .slice(0, last)
    .map((e) => {
      const r = gameResult(e.id);
      return { event: e, result: r, win: r.sets_for > r.sets_against };
    });
}

// Balanço de uma equipa na época: vitórias, derrotas e sets.
export function teamRecord(teamId) {
  const jogos = state.events.filter(
    (e) => e.type === 'jogo' && e.team_id === teamId && gameResult(e.id)
  );
  let vitorias = 0, derrotas = 0, setsFor = 0, setsAgainst = 0;
  for (const e of jogos) {
    const r = gameResult(e.id);
    setsFor += r.sets_for;
    setsAgainst += r.sets_against;
    if (r.sets_for > r.sets_against) vitorias += 1; else derrotas += 1;
  }
  return { jogos: jogos.length, vitorias, derrotas, setsFor, setsAgainst };
}

// Balanço competitivo do clube (todas as equipas que o utilizador vê — o RLS
// já limitou `state.events`). Junta o total da época com a forma recente,
// porque são perguntas diferentes: "como foi a época" e "como estamos agora".
export function clubRecord(last = 5) {
  const jogos = state.events
    .filter((e) => e.type === 'jogo' && gameResult(e.id))
    .sort((a, b) => eventDateTime(b) - eventDateTime(a));

  let vitorias = 0, derrotas = 0;
  for (const e of jogos) {
    const r = gameResult(e.id);
    if (r.sets_for > r.sets_against) vitorias += 1;
    else if (r.sets_against > r.sets_for) derrotas += 1;
  }

  const recentes = jogos.slice(0, last).map((e) => {
    const r = gameResult(e.id);
    return r.sets_for > r.sets_against;
  });

  return {
    jogos: jogos.length,
    vitorias,
    derrotas,
    taxa: jogos.length ? Math.round((vitorias / jogos.length) * 100) : null,
    recentes,                                        // do mais recente para trás
    recentesV: recentes.filter(Boolean).length,
  };
}

// Comparência nas últimas N janelas de dias, para dar DIREÇÃO ao número.
// Uma percentagem sem comparação é trivia: 71% não diz se está a melhorar ou
// a piorar, e é isso que faz alguém agir.
export function attendanceTrend(days = 30) {
  const now = new Date();
  const ms = days * 86400000;
  const rate = (desde, ate) => {
    const ids = new Set(
      state.events
        .filter((e) => {
          if (e.type !== 'treino') return false;
          const dt = eventDateTime(e);
          return dt >= desde && dt < ate;
        })
        .map((e) => e.id)
    );
    const atts = state.attendances.filter((a) => ids.has(a.event_id));
    if (!atts.length) return null;
    const compareceu = atts.filter((a) => a.status === 'presente' || a.status === 'atraso').length;
    return { rate: Math.round((compareceu / atts.length) * 100), total: atts.length };
  };

  const recente = rate(new Date(now - ms), now);
  const anterior = rate(new Date(now - 2 * ms), new Date(now - ms));
  return {
    recente,
    anterior,
    // Só há variação quando existem dados dos DOIS lados: comparar com o nada
    // dava sempre uma subida imaginária no primeiro mês de uso.
    delta: recente && anterior ? recente.rate - anterior.rate : null,
  };
}

// --- Queda individual de comparência -------------------------------------
//
// A tendência do clube (`attendanceTrend`) é uma média, e uma média esconde
// exatamente o caso que interessa: o atleta que sempre veio a tudo e deixou de
// vir. Enquanto o plantel inteiro compensa, o número global não mexe — e
// quando mexe já é tarde.

const DROP_DEFAULTS = {
  drop_recentes: 5,      // treinos da janela recente
  drop_base_min: 60,     // comparência anterior a partir da qual havia hábito
  drop_pontos: 30,       // queda (em pontos) a partir da qual se assinala
  drop_faltas_seguidas: 3,
};

export function dropThresholds() {
  const out = {};
  for (const [k, fallback] of Object.entries(DROP_DEFAULTS)) {
    const v = Number(state.settings?.[k]);
    out[k] = Number.isFinite(v) && v > 0 ? v : fallback;
  }
  return out;
}

// Queda de comparência de UM atleta: compara os últimos N treinos COM registo
// com os anteriores. Devolve null quando não há dados dos dois lados — sem
// termo de comparação não há queda, há só um número.
//
// Conta também as faltas seguidas mais recentes: três seguidas são um sinal
// mesmo quando a média da época ainda está alta, porque a média demora a cair.
export function playerAttendanceDrop(playerId) {
  const t = dropThresholds();
  const rows = playerRecentTrainings(playerId, t.drop_recentes * 3)
    .filter((r) => r.attendance);                  // treinos por fechar não contam
  if (rows.length < t.drop_recentes + 2) return null;

  const compareceu = (r) =>
    r.attendance.status === 'presente' || r.attendance.status === 'atraso';

  // `playerRecentTrainings` vem do mais recente para trás.
  const recentes = rows.slice(0, t.drop_recentes);
  const anteriores = rows.slice(t.drop_recentes);
  const taxa = (list) => Math.round((list.filter(compareceu).length / list.length) * 100);

  const recente = taxa(recentes);
  const anterior = taxa(anteriores);

  let seguidas = 0;
  for (const r of rows) {
    if (compareceu(r)) break;
    if (r.attendance.status === 'falta') seguidas += 1;
    else break;                                    // uma justificada quebra a série
  }

  return {
    recente,
    anterior,
    delta: recente - anterior,
    faltasSeguidas: seguidas,
    treinosRecentes: recentes.length,
    treinosAnteriores: anteriores.length,
  };
}

// Atletas cuja comparência caiu, do caso mais grave para o menos.
// Dois motivos entram na lista, e são coisas diferentes:
//   'queda'    — vinha e deixou de vir (o hábito quebrou-se)
//   'seguidas' — faltou às últimas N seguidas (ainda pode ter média alta)
export function attendanceDrops(limit = 5) {
  const t = dropThresholds();
  const out = [];
  for (const p of state.players) {
    const d = playerAttendanceDrop(p.id);
    if (!d) continue;

    const queda = d.anterior >= t.drop_base_min && d.delta <= -t.drop_pontos;
    const seguidas = d.faltasSeguidas >= t.drop_faltas_seguidas;
    if (!queda && !seguidas) continue;

    out.push({
      player: p,
      team: teamById(p.team_id),
      motivo: queda ? 'queda' : 'seguidas',
      ...d,
    });
  }
  // A queda de hábito ordena-se pela magnitude; as faltas seguidas ficam
  // ordenadas entre si pelo número de faltas.
  return out
    .sort((a, b) => (a.delta - b.delta) || (b.faltasSeguidas - a.faltasSeguidas))
    .slice(0, limit);
}

// --- Histórico de lesões --------------------------------------------------
//
// Os episódios clínicos acumulam-se e nunca são lidos em conjunto. Duas
// perguntas que o fisioterapeuta faz e que os dados já respondem: quanto tempo
// demora a alta, e quais são as zonas que voltam sempre.

// Dias entre a lesão e a alta de um episódio (null se faltar alguma data).
export function episodeReturnDays(ep) {
  if (!ep.injury_date || !ep.discharge_date) return null;
  const dias = Math.round(
    (new Date(ep.discharge_date) - new Date(ep.injury_date)) / 86400000
  );
  return dias >= 0 ? dias : null;                  // datas trocadas não contam
}

// Estatística de lesões por zona do corpo, da zona mais problemática para a
// menos. `recidivas` conta os atletas com MAIS DO QUE UM episódio na mesma
// zona — é o número que diz se a alta está a ser dada cedo demais.
export function injuryStats() {
  const zonas = new Map();
  for (const ep of state.clinicalEpisodes) {
    const zona = (ep.body_area || '').trim() || 'Sem zona indicada';
    if (!zonas.has(zona)) zonas.set(zona, { zona, episodios: 0, porAtleta: new Map(), dias: [], ativos: 0 });
    const z = zonas.get(zona);
    z.episodios += 1;
    z.porAtleta.set(ep.player_id, (z.porAtleta.get(ep.player_id) || 0) + 1);
    if (ep.status !== 'alta') z.ativos += 1;
    const d = episodeReturnDays(ep);
    if (d != null) z.dias.push(d);
  }

  return [...zonas.values()]
    .map((z) => ({
      zona: z.zona,
      episodios: z.episodios,
      atletas: z.porAtleta.size,
      // Atletas que lesionaram a MESMA zona mais do que uma vez.
      recidivas: [...z.porAtleta.values()].filter((n) => n > 1).length,
      ativos: z.ativos,
      // Média só sobre os episódios com alta e com as duas datas: incluir os
      // que ainda decorrem daria um tempo de retorno artificialmente curto.
      diasMedios: z.dias.length
        ? Math.round(z.dias.reduce((s, d) => s + d, 0) / z.dias.length)
        : null,
      comAlta: z.dias.length,
    }))
    .sort((a, b) => b.recidivas - a.recidivas || b.episodios - a.episodios);
}

// Resumo do histórico de lesões de um atleta: total, em curso, zonas que se
// repetiram e tempo médio até à alta.
export function playerInjurySummary(playerId) {
  const eps = state.clinicalEpisodes.filter((e) => e.player_id === playerId);
  const porZona = new Map();
  const dias = [];
  for (const ep of eps) {
    const zona = (ep.body_area || '').trim();
    if (zona) porZona.set(zona, (porZona.get(zona) || 0) + 1);
    const d = episodeReturnDays(ep);
    if (d != null) dias.push(d);
  }
  return {
    total: eps.length,
    emCurso: eps.filter((e) => e.status !== 'alta').length,
    zonasRepetidas: [...porZona.entries()].filter(([, n]) => n > 1).map(([z, n]) => ({ zona: z, n })),
    diasMedios: dias.length ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null,
  };
}

// Participação de um atleta em jogo: pontos que jogou sobre os pontos
// disputados nos jogos em que a equipa dele teve resultado com parciais.
// `share` é null quando não há denominador (sem parciais registados) — é
// preferível não mostrar nada a mostrar uma percentagem inventada.
export function playerGameShare(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { jogados: 0, totais: 0, share: null, jogos: 0 };

  const jogos = state.events.filter((e) => e.type === 'jogo' && e.team_id === player.team_id);
  let jogados = 0, totais = 0, contados = 0;
  for (const e of jogos) {
    const total = gameTotalPoints(e.id);
    if (!total) continue; // sem parciais não há denominador

    // Um jogo onde a participação NUNCA foi preenchida não conta. Contá-lo
    // como "zero pontos" seria penalizar o atleta pelo registo que o treinador
    // ainda não fez — e no início de uma época isso é quase toda a gente.
    // Quando há registo de alguém, quem não tem linha é porque não jogou.
    const temRegisto = state.gameMinutes.some((g) => g.event_id === e.id);
    if (!temRegisto) continue;

    const gm = state.gameMinutes.find((g) => g.event_id === e.id && g.player_id === playerId);
    // Não se pode jogar mais pontos do que os que o jogo teve. Um valor acima
    // disso é engano de digitação; limitá-lo evita percentagens impossíveis
    // (e um "222%" a passar por análise).
    jogados += Math.min(gm?.points || 0, total);
    totais += total;
    contados += 1;
  }
  return {
    jogados,
    totais,
    jogos: contados,
    share: totais ? Math.round((jogados / totais) * 100) : null,
  };
}

// --- Cruzamento treino × jogo -------------------------------------------
//
// O atleta que vai a tudo e joga pouco é dos sinais mais precoces de
// desistência na formação — e é invisível se se olhar para presenças e para
// minutos/pontos em separado, que é como estavam até aqui.
//
// O que isto NÃO é: um juízo sobre o treinador. Um sub-16 pode ter razões
// legítimas para não pôr alguém a jogar. O que a lista faz é obrigar a que
// seja uma decisão consciente, em vez de uma coisa que simplesmente acontece
// e de que só se dá conta quando o atleta sai.

// Limiares, configuráveis nas Definições. Os valores por omissão são
// deliberadamente exigentes: uma lista que assinala meio plantel deixa de ser
// lida à terceira semana. E sem dados que cheguem qualquer conclusão é ruído —
// um atleta com 2 treinos e 1 jogo não diz nada a ninguém.
const GAP_DEFAULTS = {
  gap_presenca_min: 80,  // comparência a partir da qual "vem sempre"
  gap_jogo_max: 25,      // participação abaixo da qual "quase não joga"
  gap_min_treinos: 5,
  gap_min_jogos: 3,
};

export function gapThresholds() {
  const out = {};
  for (const [k, fallback] of Object.entries(GAP_DEFAULTS)) {
    const v = Number(state.settings?.[k]);
    out[k] = Number.isFinite(v) && v >= 0 ? v : fallback;
  }
  return out;
}

// Atletas que treinam muito e jogam pouco, do caso mais gritante para o menos.
// Só entram atletas com registos suficientes dos DOIS lados — e a participação
// só é calculável em jogos com parciais (são eles o denominador).
export function trainingVsPlayingGaps(limit = 5) {
  const t = gapThresholds();
  const out = [];
  for (const p of state.players) {
    const att = playerAttendanceStats(p.id);
    if (att.rate == null || att.total < t.gap_min_treinos) continue;

    const share = playerGameShare(p.id);
    if (share.share == null || share.jogos < t.gap_min_jogos) continue;

    if (att.rate >= t.gap_presenca_min && share.share <= t.gap_jogo_max) {
      out.push({
        player: p,
        team: teamById(p.team_id),
        presenca: att.rate,
        participacao: share.share,
        treinos: att.total,
        jogos: share.jogos,
        gap: att.rate - share.share,
      });
    }
  }
  return out.sort((a, b) => b.gap - a.gap).slice(0, limit);
}

// --- Respostas do atleta a eventos --------------------------------------

// O que um atleta respondeu a um evento (ou null se ainda não respondeu).
export function playerEventResponse(playerId, eventId) {
  return state.eventResponses.find(
    (r) => r.player_id === playerId && r.event_id === eventId
  ) || null;
}

// Resumo das respostas a um evento, para o treinador saber com quem conta:
// contagens por resposta, quem avisou que não vai (com o motivo) e quantos
// nem responderam. `semResposta` conta sobre o plantel da equipa do evento.
export function eventResponseSummary(eventId) {
  const ev = state.events.find((e) => e.id === eventId);
  const counts = { vou: 0, duvida: 0, nao_vou: 0 };
  if (!ev) return { counts, ausentes: [], semResposta: 0 };

  const squad = state.players.filter((p) => p.team_id === ev.team_id);
  const byPlayer = new Map(
    state.eventResponses.filter((r) => r.event_id === eventId).map((r) => [r.player_id, r])
  );

  const ausentes = [];
  let semResposta = 0;
  for (const p of squad) {
    const r = byPlayer.get(p.id);
    if (!r) { semResposta += 1; continue; }
    if (counts[r.response] !== undefined) counts[r.response] += 1;
    if (r.response === 'nao_vou') ausentes.push({ player: p, note: r.note });
  }
  return { counts, ausentes, semResposta };
}

// --- Departamento Médico / Fisioterapia ---------------------------------

// Episódios clínicos de UM atleta, do mais recente para o mais antigo
// (ativos/em recuperação antes dos que têm alta, depois por data de lesão).
export function playerEpisodes(playerId) {
  const rank = { ativo: 0, recuperacao: 1, alta: 2 };
  return state.clinicalEpisodes
    .filter((e) => e.player_id === playerId)
    .sort((a, b) => {
      const r = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      if (r !== 0) return r;
      return (b.injury_date || b.created_at || '').localeCompare(a.injury_date || a.created_at || '');
    });
}

// Sessões de um episódio, da mais recente para a mais antiga.
export function episodeSessions(episodeId) {
  return state.clinicalSessions
    .filter((s) => s.episode_id === episodeId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Episódio "ativo" de um atleta (ativo ou em recuperação), se existir.
export function activeEpisode(playerId) {
  return state.clinicalEpisodes.find(
    (e) => e.player_id === playerId && (e.status === 'ativo' || e.status === 'recuperacao')
  ) || null;
}

// Nº de atletas com um episódio em curso (ativo ou em recuperação).
export function injuredCount() {
  const ids = new Set(
    state.clinicalEpisodes
      .filter((e) => e.status === 'ativo' || e.status === 'recuperacao')
      .map((e) => e.player_id)
  );
  return ids.size;
}

// Atendimentos de UM atleta, ordenados por data/hora.
export function playerAppointments(playerId) {
  return state.appointments
    .filter((a) => a.player_id === playerId)
    .sort((a, b) => apptDateTime(a) - apptDateTime(b));
}

// Data/hora de um atendimento como Date (para ordenar/comparar).
export function apptDateTime(ap) {
  const time = ap.time && /^\d{2}:\d{2}/.test(ap.time) ? ap.time : '00:00';
  return new Date(`${ap.date}T${time}`);
}

// Próximos atendimentos (a partir de agora), agendados, ordenados.
export function upcomingAppointments(limit = 8) {
  const now = new Date();
  return state.appointments
    .filter((a) => a.status === 'agendado' && apptDateTime(a) >= now)
    .sort((a, b) => apptDateTime(a) - apptDateTime(b))
    .slice(0, limit);
}

// Deteta treinos/jogos da equipa do atleta que se sobrepõem ao intervalo de um
// atendimento (mesmo dia e horas a cruzar). Serve para avisar de conflitos.
// `ignoreId` permite excluir o próprio atendimento ao editar.
export function appointmentConflicts(playerId, date, time, endTime) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !date) return [];
  const start = time ? toMinutes(time) : null;
  const end = endTime ? toMinutes(endTime) : null;

  return state.events.filter((ev) => {
    if (ev.date !== date) return false;
    if (ev.team_id !== player.team_id) return false; // só eventos da sua equipa
    // Sem horas em qualquer dos lados → conflito de dia (aviso na mesma).
    if (start === null || !ev.time) return true;
    const evStart = toMinutes(ev.time);
    const evEnd = ev.end_time ? toMinutes(ev.end_time) : evStart + 90;
    const apEnd = end !== null ? end : start + 60;
    return start < evEnd && apEnd > evStart; // sobreposição de intervalos
  });
}

function toMinutes(t) {
  const [h, m] = String(t).slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

// --- Gestão financeira ---------------------------------------------------

// Resumo financeiro: receitas e despesas do livro-razão + quotas recebidas
// (mensalidades pagas, geridas no módulo Quotas) para uma imagem completa sem
// duplicar lançamentos. `balance` fica só com o livro-razão (retrocompatível);
// `totalIncome`/`totalBalance` incluem as quotas.
export function financialSummary() {
  let income = 0;
  let expenses = 0;
  state.financialEntries.forEach((e) => {
    const v = Number(e.amount) || 0;
    if (e.type === 'receita') income += v;
    else expenses += v;
  });
  const quotas = (state.quotas || []).reduce(
    (s, q) => s + (q.pago ? Number(q.valor || 0) : 0),
    0
  );
  return {
    income,
    expenses,
    quotas,
    balance: income - expenses,
    totalIncome: income + quotas,
    totalBalance: income + quotas - expenses,
  };
}

// --- Convocatórias -------------------------------------------------------

// Devolve o estado de convocatória de um atleta para um evento específico,
// ou null se não estiver convocado.
export function playerSquadStatus(playerId, eventId) {
  const squad = state.squads.find((s) => s.event_id === eventId);
  if (!squad) return null;
  const sp = state.squadPlayers.find(
    (p) => p.squad_id === squad.id && p.player_id === playerId
  );
  return sp ? sp.status : null;
}

// Próximo jogo ao qual o atleta está convocado (ou null se nenhum).
export function nextPlayerSquadEvent(playerId) {
  const now = new Date();
  const mySquadIds = new Set(
    state.squadPlayers
      .filter((sp) => sp.player_id === playerId)
      .map((sp) => sp.squad_id)
  );
  const myEventIds = new Set(
    state.squads.filter((s) => mySquadIds.has(s.id)).map((s) => s.event_id)
  );
  const upcoming = state.events
    .filter((e) => e.type === 'jogo' && myEventIds.has(e.id) && eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b));
  if (!upcoming.length) return null;
  const ev = upcoming[0];
  const squad = state.squads.find((s) => s.event_id === ev.id);
  const sp = state.squadPlayers.find(
    (p) => p.squad_id === squad.id && p.player_id === playerId
  );
  return { event: ev, status: sp?.status || 'convocado' };
}

// --- Preparação Física ---------------------------------------------------

export function physicalProfile(playerId) {
  return state.physicalProfiles.find((p) => p.player_id === playerId) || null;
}

export function playerMedicalHistory(playerId) {
  return state.medicalHistory.find((m) => m.player_id === playerId) || null;
}

// Disponibilidade do atleta (resumo visível à equipa técnica). null se nunca
// foi definida (assume-se "apto" na interface).
export function playerAvailability(playerId) {
  return state.availability.find((a) => a.player_id === playerId) || null;
}

// Índice de massa corporal a partir do perfil físico (kg / m²). null se faltar
// altura ou peso.
export function bmi(playerId) {
  const prof = physicalProfile(playerId);
  const h = Number(prof?.height_cm);
  const w = Number(prof?.weight_kg);
  if (!h || !w) return null;
  const m = h / 100;
  return Math.round((w / (m * m)) * 10) / 10;
}

// Testes físicos de UM atleta, do mais recente para o mais antigo.
export function playerTests(playerId) {
  return state.physicalTests
    .filter((t) => t.player_id === playerId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

// Nome de um teste: a etiqueta livre quando é do tipo "outro", senão a do
// catálogo. Vive aqui (e não na vista) porque a evolução agrupa por ele.
export function testName(t) {
  return t.type === 'outro' && t.label ? t.label : (PHYSICAL_TEST_LABEL[t.type] || t.type);
}

// Evolução das avaliações físicas de um atleta, um bloco por teste.
//
// Mostrar só a última medição desperdiça o trabalho de medir: o que interessa
// ao preparador não é "salta 41 cm", é "saltava 37 e agora salta 41". Cada
// bloco traz a série completa (para desenhar), a primeira e a última medição,
// a variação absoluta e relativa, e a DIREÇÃO dessa variação — que depende do
// teste (ver `better` em constants.js) e não do sinal do número.
//
// Testes com uma só medição entram na mesma, com `delta: null`: dizem que o
// registo existe e que falta repetir para haver evolução.
export function playerTestProgress(playerId) {
  const groups = new Map();
  for (const t of state.physicalTests) {
    if (t.player_id !== playerId) continue;
    if (t.value == null || !t.date) continue;      // sem valor não há evolução
    // Agrupa pelo nome visível: dois "outro" com etiquetas diferentes são
    // testes diferentes, e o mesmo tipo com etiquetas iguais é o mesmo teste.
    const key = t.type === 'outro' ? `outro:${t.label || ''}` : t.type;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const out = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const first = rows[0];
    const last = rows[rows.length - 1];
    const type = first.type;
    const unit = last.unit || PHYSICAL_TEST_UNIT[type] || '';
    const better = PHYSICAL_TEST_BETTER[type] ?? null;

    let delta = null, pct = null, direction = null;
    if (rows.length > 1) {
      delta = Math.round((Number(last.value) - Number(first.value)) * 100) / 100;
      const base = Math.abs(Number(first.value));
      pct = base ? Math.round((delta / base) * 100) : null;
      if (delta === 0) direction = 'igual';
      // Sem `better` declarado, a variação mostra-se sem juízo de valor: um
      // IMC que sobe pode ser massa muscular ganha, e chamar-lhe "pior" seria
      // dizer ao preparador uma coisa que os dados não sustentam.
      else if (better === null) direction = 'neutro';
      else if ((delta > 0 && better === 'up') || (delta < 0 && better === 'down')) direction = 'melhor';
      else direction = 'pior';
    }

    out.push({
      key,
      type,
      label: testName(last),
      unit,
      better,
      rows,                                        // série completa, por data
      first,
      last,
      delta,
      pct,
      direction,
      medicoes: rows.length,
    });
  }
  // Os testes com evolução primeiro (são os que dizem alguma coisa), depois
  // por nome para a lista ser estável entre re-desenhos.
  return out.sort((a, b) => {
    if ((b.medicoes > 1) !== (a.medicoes > 1)) return b.medicoes > 1 ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

// Fases (macrociclo) de uma equipa, ordenadas por data de início.
export function teamPhases(teamId) {
  return state.phases
    .filter((p) => p.team_id === teamId)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
}

// Mesociclos de uma equipa, ordenados por data de início.
export function teamMesocycles(teamId) {
  return state.mesocycles
    .filter((m) => m.team_id === teamId)
    .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
}

// Treinos de um mesociclo (ou os sem mesociclo de uma equipa), por data.
export function mesocycleSessions(mesocycleId) {
  return state.gymSessions
    .filter((s) => s.mesocycle_id === mesocycleId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function teamSessions(teamId) {
  return state.gymSessions
    .filter((s) => s.team_id === teamId)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

// Exercícios de um treino, pela ordem definida.
export function sessionExercises(sessionId) {
  return state.gymExercises
    .filter((e) => e.session_id === sessionId)
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

export function sessionAttendance(sessionId) {
  return state.gymAttendance.filter((a) => a.session_id === sessionId);
}

// Controlo de treino de UM atleta: treinos feitos, faltas e tempo total.
// Baseado nas presenças de ginásio dos treinos da sua equipa.
export function playerGymStats(playerId) {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return { treinos: 0, faltas: 0, minutos: 0, totalSessions: 0 };
  const teamSessionIds = new Set(
    state.gymSessions.filter((s) => s.team_id === player.team_id).map((s) => s.id)
  );
  const durBySession = {};
  state.gymSessions.forEach((s) => { durBySession[s.id] = s.duration_min || 0; });

  let treinos = 0, faltas = 0, minutos = 0;
  state.gymAttendance.forEach((a) => {
    if (a.player_id !== playerId || !teamSessionIds.has(a.session_id)) return;
    if (a.present) {
      treinos++;
      minutos += a.minutes != null ? a.minutes : durBySession[a.session_id] || 0;
    } else {
      faltas++;
    }
  });
  return { treinos, faltas, minutos, totalSessions: teamSessionIds.size };
}

// Minutos de jogo de UM atleta: total e lista por jogo (mais recente primeiro).
export function playerGameMinutes(playerId) {
  const rows = state.gameMinutes.filter((g) => g.player_id === playerId);
  const list = rows
    .map((g) => ({ event: state.events.find((e) => e.id === g.event_id), minutes: g.minutes }))
    .filter((x) => x.event)
    .sort((a, b) => eventDateTime(b.event) - eventDateTime(a.event));
  const total = rows.reduce((s, g) => s + (g.minutes || 0), 0);
  return { total, list };
}

// Jogos de uma equipa num mês (para o mapa de jogos), ordenados por data.
export function gamesInMonth(teamId, year, month) {
  return state.events
    .filter((e) => e.type === 'jogo' && e.team_id === teamId)
    .filter((e) => {
      const d = new Date(e.date + 'T00:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => eventDateTime(a) - eventDateTime(b));
}

// --- Objetivos / KPIs ----------------------------------------------------

// Percentagem de atletas com a avaliação já decidida (mantém/sai) — o resto
// está 'pendente'. 0 se não houver atletas.
// Indicadores automáticos disponíveis: cada um sabe calcular o seu valor
// atual a partir do `state`. Para juntar mais no futuro, basta acrescentar uma
// entrada aqui (chave estável guardada em objectives.metric, etiqueta, unidade
// e a função que devolve o valor).
// --- Indicadores dos objetivos -------------------------------------------
//
// Cada indicador sabe calcular-se a partir do `state`. O `scope` diz onde faz
// sentido usá-lo:
//   'clube'  — só ao nível do clube (patrocínios e finanças não têm equipa);
//   'ambos'  — funciona no clube e por equipa (recebe `teamId`; sem ele, mede
//              o clube inteiro).
// Para juntar mais no futuro basta acrescentar uma entrada aqui — a chave fica
// guardada em objectives.metric, por isso tem de ser estável.

// Atletas de uma equipa (ou todos, se `teamId` for nulo).
function playersOf(teamId) {
  return teamId ? state.players.filter((p) => p.team_id === teamId) : state.players;
}

// Retenção do plantel: quantos atletas estão marcados para MANTER, em relação
// ao plantel atual. Os `pendente` contam para o denominador de propósito — até
// decidires, não asseguraste a retenção, e o ecrã mostra quantos faltam.
//
// Nota: isto mede a DECISÃO do coordenador (players.review_status), não a
// inscrição efetiva na época seguinte.
export function squadRetention(teamId) {
  const players = playersOf(teamId);
  const total = players.length;
  const counts = { mantem: 0, sai: 0, pendente: 0 };
  players.forEach((p) => {
    const st = p.review_status || 'pendente';
    if (counts[st] !== undefined) counts[st]++;
  });
  return {
    total,
    ...counts,
    pct: total ? Math.round((counts.mantem / total) * 100) : 0,
  };
}

// Taxa de presenças, opcionalmente limitada a uma equipa (via o evento).
function attendanceRate(teamId) {
  let rows = state.attendances;
  if (teamId) {
    const eventsOfTeam = new Set(
      state.events.filter((e) => e.team_id === teamId).map((e) => e.id)
    );
    rows = rows.filter((a) => eventsOfTeam.has(a.event_id));
  }
  if (!rows.length) return 0;
  const presentes = rows.filter((a) => a.status === 'presente' || a.status === 'atraso').length;
  return Math.round((presentes / rows.length) * 100);
}

// Percentagem de atletas com a avaliação já decidida (Mantém ou Sai).
function reviewDecidedPct(teamId) {
  const players = playersOf(teamId);
  if (!players.length) return 0;
  const decided = players.filter((p) => (p.review_status || 'pendente') !== 'pendente').length;
  return Math.round((decided / players.length) * 100);
}

export const OBJECTIVE_METRICS = [
  {
    key: 'total_raised',
    label: 'Total angariado',
    unit: '€',
    scope: 'clube',
    cumulative: true,
    value: () => totalRaised(),
  },
  {
    key: 'financial_balance',
    label: 'Saldo financeiro',
    unit: '€',
    scope: 'clube',
    cumulative: true,
    value: () => financialSummary().balance,
  },
  {
    key: 'attendance_rate',
    label: 'Taxa de presenças',
    unit: '%',
    scope: 'ambos',
    value: (teamId) => attendanceRate(teamId),
  },
  {
    key: 'squad_retention',
    label: 'Retenção do plantel',
    unit: '%',
    scope: 'ambos',
    value: (teamId) => squadRetention(teamId).pct,
  },
  {
    key: 'review_decided',
    label: 'Avaliação decidida',
    unit: '%',
    scope: 'ambos',
    value: (teamId) => reviewDecidedPct(teamId),
  },
];

const OBJECTIVE_METRIC_BY_KEY = Object.fromEntries(
  OBJECTIVE_METRICS.map((m) => [m.key, m])
);

// Etiqueta legível de um indicador automático (ou a própria chave se não for
// conhecido, para não rebentar com dados antigos).
export function objectiveMetricLabel(key) {
  return OBJECTIVE_METRIC_BY_KEY[key]?.label || key || '';
}

// Indicadores utilizáveis num dado âmbito ('clube' mostra todos; por equipa só
// os que sabem filtrar).
// Um objetivo ACUMULA (soma-se ao longo da época, como o dinheiro angariado)
// ou é uma TAXA (uma percentagem que é o que é em cada momento, como a
// retenção). A distinção muda a leitura de "em risco": num acumulável faz
// sentido comparar o progresso com o tempo gasto; numa taxa não — estar abaixo
// do alvo a meio da época não é ir atrasado, é estar abaixo.
export function isCumulative(obj) {
  if (obj.kind === 'auto') {
    return !!OBJECTIVE_METRIC_BY_KEY[obj.metric]?.cumulative;
  }
  // Nos manuais assume-se contagem (acumula), exceto se a unidade for %.
  return obj.unit !== '%';
}

export function metricsForScope(scope) {
  return scope === 'clube'
    ? OBJECTIVE_METRICS
    : OBJECTIVE_METRICS.filter((m) => m.scope === 'ambos');
}

// Valor atual de um indicador automático; null se a chave for desconhecida.
export function objectiveMetricValue(key, teamId) {
  const m = OBJECTIVE_METRIC_BY_KEY[key];
  return m ? Number(m.value(teamId)) || 0 : null;
}

// Estado de progresso de um objetivo, opcionalmente medido numa equipa (para
// os de âmbito 'todas'). Devolve valor atual, alvo, percentagem (0–100) e se
// já foi atingido. Nos marcos não há percentagem — só atingido ou não.
export function objectiveProgress(obj, teamId) {
  if (obj.kind === 'marco') {
    const reached = !!obj.done_at;
    return { current: reached ? 1 : 0, target: 1, pct: reached ? 100 : 0, reached };
  }
  const scopeTeam = teamId ?? (obj.scope === 'equipa' ? obj.team_id : null);
  const target = Number(obj.target) || 0;
  const current =
    obj.kind === 'auto'
      ? objectiveMetricValue(obj.metric, scopeTeam) ?? 0
      : Number(obj.current) || 0;
  const pct = target > 0 ? Math.min(100, Math.max(0, Math.round((current / target) * 100))) : 0;
  return { current, target, pct, reached: target > 0 && current >= target };
}

// Quotas de UM atleta. Devolve { list, owed, owedCount, paidCount }.
// `list` ordenada da mais recente para a mais antiga.
export function playerQuotas(playerId) {
  const list = state.quotas
    .filter((q) => q.player_id === playerId)
    .sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes));
  const pendentes = list.filter((q) => !q.pago);
  const owed = pendentes.reduce((s, q) => s + Number(q.valor || 0), 0);
  return { list, owed, owedCount: pendentes.length, paidCount: list.length - pendentes.length };
}

// Estado de um objetivo, já a contar com o prazo.
//
//   'atingido'  — chegou ao alvo (ou o marco está feito);
//   'falhado'   — passou o prazo sem chegar lá;
//   'risco'     — precisa de atenção agora (é o que sobe ao Painel);
//   'abaixo'    — taxa abaixo do alvo, mas ainda com tempo;
//   'progresso' — a andar, ou sem prazo que permita julgar.
//
// Num objetivo ACUMULÁVEL o risco compara o progresso com o tempo gasto: se já
// passaram 70% do caminho até ao prazo mas só se fez 40%, vai atrasado. A folga
// de 20 pontos evita assinalar quem está só ligeiramente atrás.
//
// Numa TAXA esse cálculo não se aplica — 75% de retenção não é "estar a 83% do
// caminho", é estar abaixo. Aí fica 'abaixo' enquanto houver tempo, e só passa
// a 'risco' quando o prazo se aproxima (último quarto).
const RISK_MARGIN = 20;
const RATE_RISK_TIME_PCT = 75;
const MARCO_RISK_DAYS = 30;

export function objectiveStatus(obj, progress) {
  if (progress.reached) return 'atingido';

  const cumulative = isCumulative(obj);
  if (!obj.deadline) return cumulative ? 'progresso' : 'abaixo';

  const end = new Date(obj.deadline + 'T23:59:59');
  const now = new Date();
  if (now > end) return 'falhado';

  // Um marco não tem progresso parcial; avisa-se quando o prazo se aproxima.
  if (obj.kind === 'marco') {
    const daysLeft = Math.ceil((end - now) / 86400000);
    return daysLeft <= MARCO_RISK_DAYS ? 'risco' : 'progresso';
  }

  const start = obj.created_at ? new Date(obj.created_at) : null;
  if (!start || end <= start) return cumulative ? 'progresso' : 'abaixo';

  const timePct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  if (cumulative) {
    return timePct - progress.pct >= RISK_MARGIN ? 'risco' : 'progresso';
  }
  return timePct >= RATE_RISK_TIME_PCT ? 'risco' : 'abaixo';
}

// Equipas que o utilizador atual pode ver nos objetivos.
// `null` = todas (coordenador, direção, seccionista…). O treinador fica com as
// equipas onde está inscrito como treinador; sem ficha de coach, nenhuma.
export function visibleTeamIds() {
  if (isClubWide()) return null;
  const coach = currentCoach();
  if (!coach) return new Set();
  return new Set(coachTeams(coach.id).map((x) => x.team.id));
}

// Um objetivo é visível para quem o vê?
//   'clube' e 'todas' → sempre (o alvo do clube é do conhecimento de todos);
//   'equipa'          → só a quem essa equipa pertence.
// Os de 'todas' são visíveis, mas só mostram a linha da própria equipa (ver
// objectiveRows) — o alvo é partilhado, a comparação entre plantéis não.
export function canSeeObjective(obj) {
  const ids = visibleTeamIds();
  if (!ids) return true;
  if (obj.scope !== 'equipa') return true;
  return !!obj.team_id && ids.has(obj.team_id);
}

// Um objetivo de âmbito 'todas' desdobra-se numa linha por equipa. Para os
// outros âmbitos devolve uma linha só (a do clube ou a da equipa escolhida).
export function objectiveRows(obj) {
  if (obj.scope !== 'todas') {
    const team = obj.scope === 'equipa' ? teamById(obj.team_id) : null;
    const progress = objectiveProgress(obj);
    return [{ team, progress, status: objectiveStatus(obj, progress) }];
  }
  const ids = visibleTeamIds();
  return state.teams
    .filter((t) => !ids || ids.has(t.id))
    .sort((a, b) => teamName(a).localeCompare(teamName(b)))
    .map((team) => {
      const progress = objectiveProgress(obj, team.id);
      return { team, progress, status: objectiveStatus(obj, progress) };
    });
}

// Gravidade dos estados, do que mais exige atenção para o que menos exige.
// Serve para ordenar os cartões e para escolher o estado global de um objetivo
// medido em várias equipas.
export const STATUS_ORDER = {
  falhado: 0, risco: 1, abaixo: 2, progresso: 3, atingido: 4,
};

// Resumo de um objetivo de âmbito 'todas': quantas equipas cumprem, e o estado
// global (o pior das equipas — é o que exige atenção).
export function objectiveSummary(obj) {
  const rows = objectiveRows(obj);
  const met = rows.filter((r) => r.progress.reached).length;
  const worst = rows.reduce(
    (acc, r) => (STATUS_ORDER[r.status] < STATUS_ORDER[acc] ? r.status : acc),
    'atingido'
  );
  return { rows, met, total: rows.length, status: rows.length ? worst : 'progresso' };
}

// Objetivos que precisam de atenção (em risco ou já fora de prazo), para o
// Painel os mostrar sem ser preciso ir à secção.
export function objectivesNeedingAttention() {
  return state.objectives
    .filter(canSeeObjective)
    .map((obj) => ({ obj, ...objectiveSummary(obj) }))
    .filter((o) => o.status === 'risco' || o.status === 'falhado');
}
