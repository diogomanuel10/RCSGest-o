// Cálculos derivados a partir do estado (state). Sem efeitos secundários.

import { state } from './store.js';
import { TIER_VALUE, IN_PROGRESS_STATUSES, DEFAULT_ESCALOES } from './constants.js';

// Lista de escalões em vigor (configurável nas Definições). Recorre à lista
// por omissão se ainda não houver nada guardado.
export function escaloes() {
  const e = state.settings?.escaloes;
  return Array.isArray(e) && e.length ? e : DEFAULT_ESCALOES;
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

// Próximos eventos (a partir de agora), ordenados, limitados a `limit`.
export function upcomingEvents(limit = 5) {
  const now = new Date();
  return state.events
    .filter((e) => eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, limit);
}

// Nome legível de uma equipa (ex.: "Seniores Masculino").
export function teamName(team) {
  if (!team) return '';
  const g = team.gender === 'M' ? 'Masculino' : 'Feminino';
  return `${team.escalao} ${g}`;
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
