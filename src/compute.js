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
