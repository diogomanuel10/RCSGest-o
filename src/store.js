// Camada de dados da Central RCS.
//
// Responsável por: ir buscar tudo ao Supabase uma vez, manter uma cópia em
// memória (cache), oferecer operações de criar/editar/remover e avisar as
// vistas quando algo muda (para re-desenharem).
//
// Modelo: clube único, dados partilhados — não há filtros por utilizador.

import { supabase } from './supabase.js';

// Estado em memória. As vistas leem daqui após o carregamento inicial.
export const state = {
  settings: { id: 1, season: '2026/2027', goal: 15000 },
  coaches: [],
  teams: [],
  players: [],
  sponsors: [],
  events: [],
  attendances: [],
  quotas: [],
  equipment: [],
  teamCoaches: [], // ligação equipa<->treinador (principal/adjunto)
  prospects: [],  // funil de recrutamento
  clinicalEpisodes: [], // episódios clínicos (departamento médico)
  clinicalSessions: [], // sessões realizadas dentro de cada episódio
  appointments: [],     // atendimentos de fisioterapia (agenda médica)
  physicalProfiles: [], // perfil físico (altura/peso/mão) por atleta
  medicalHistory: [],   // história clínica resumida por atleta
  physicalTests: [],    // avaliações físicas / testes
  phases: [],           // macrociclo (fases da época)
  mesocycles: [],       // mesociclos
  gymSessions: [],      // treinos de preparação física
  gymExercises: [],     // exercícios de cada treino
  gymAttendance: [],    // presenças nos treinos de ginásio
  gameMinutes: [],      // minutos de jogo por atleta
  availability: [],     // disponibilidade do atleta (resumo p/ treinador)
  trainingPlans: [],      // planos de treino (1:1 com evento treino)
  trainingPlanItems: [],  // tarefas/blocos de cada plano
  trainingEvaluations: [], // avaliações pós treino (1:1 com evento treino)
  trainingPlayerEvals: [], // avaliações individuais por atleta
  profile: null, // perfil do utilizador atual (com o papel/role)
  profiles: [], // todos os perfis (preenchido só se o utilizador for coordenador)
  // Registos arquivados (inativos), só carregados para o coordenador — usados
  // na área "Arquivados" para consultar e repor. As coleções normais (acima)
  // contêm apenas registos ativos.
  archived: { teams: [], players: [], coaches: [], sponsors: [], events: [], prospects: [] },
  loaded: false,
};

// Limpa a cache (usado ao terminar sessão, para o próximo login recarregar).
export function resetState() {
  state.coaches = [];
  state.teams = [];
  state.players = [];
  state.sponsors = [];
  state.events = [];
  state.attendances = [];
  state.quotas = [];
  state.equipment = [];
  state.teamCoaches = [];
  state.prospects = [];
  state.clinicalEpisodes = [];
  state.clinicalSessions = [];
  state.appointments = [];
  state.physicalProfiles = [];
  state.medicalHistory = [];
  state.physicalTests = [];
  state.phases = [];
  state.mesocycles = [];
  state.gymSessions = [];
  state.gymExercises = [];
  state.gymAttendance = [];
  state.gameMinutes = [];
  state.availability = [];
  state.trainingPlans = [];
  state.trainingPlanItems = [];
  state.trainingEvaluations = [];
  state.trainingPlayerEvals = [];
  state.profile = null;
  state.profiles = [];
  state.archived = { teams: [], players: [], coaches: [], sponsors: [], events: [], prospects: [] };
  state.loaded = false;
}

// --- Subscrições (padrão observador) -------------------------------------
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

// Carrega o perfil (papel) do utilizador atual e, se for coordenador, a lista
// de todos os perfis (para a gestão de utilizadores). O RLS garante que um
// não-coordenador só recebe o seu próprio perfil.
export async function loadProfile() {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('email');
  if (error) throw error;

  const all = data || [];
  state.profiles = all;
  state.profile = all.find((p) => p.id === userId) || { id: userId, role: 'leitura' };
}

// --- Carregamento inicial -------------------------------------------------
// Vai buscar todas as tabelas em paralelo. Lança erro se alguma falhar.
export async function loadAll() {
  const [settings, coaches, teams, players, sponsors, events, attendances, quotas, equipment, teamCoaches, prospects, episodes, sessions, appointments,
         physProfiles, medHistory, physTests, phases, mesocycles, gymSessions, gymExercises, gymAttendance, gameMinutes, availability,
         trainingPlans, trainingPlanItems, trainingEvaluations, trainingPlayerEvals] =
    await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      // Só registos ativos (archived_at nulo). Os arquivados carregam-se à parte
      // (loadArchived) e só para o coordenador.
      supabase.from('coaches').select('*').is('archived_at', null).order('name'),
      supabase.from('teams').select('*').is('archived_at', null).order('created_at'),
      supabase.from('players').select('*').is('archived_at', null).order('number'),
      supabase.from('sponsors').select('*').is('archived_at', null).order('name'),
      supabase.from('events').select('*').is('archived_at', null).order('date'),
      supabase.from('attendances').select('*'),
      supabase.from('quotas').select('*'),
      supabase.from('equipment').select('*').order('name'),
      supabase.from('team_coaches').select('*'),
      supabase.from('prospects').select('*').is('archived_at', null).order('created_at'),
      // Dados do departamento médico e da preparação física. Para papéis sem
      // acesso, o RLS devolve uma lista vazia (sem erro): é seguro consultar.
      supabase.from('clinical_episodes').select('*').order('created_at', { ascending: false }),
      supabase.from('clinical_sessions').select('*').order('date', { ascending: false }),
      supabase.from('physio_appointments').select('*').order('date'),
      supabase.from('physical_profiles').select('*'),
      supabase.from('medical_history').select('*'),
      supabase.from('physical_tests').select('*').order('date', { ascending: false }),
      supabase.from('training_phases').select('*').order('start_date'),
      supabase.from('mesocycles').select('*').order('start_date'),
      supabase.from('gym_sessions').select('*').order('date'),
      supabase.from('gym_exercises').select('*').order('position'),
      supabase.from('gym_attendance').select('*'),
      supabase.from('game_minutes').select('*'),
      supabase.from('athlete_availability').select('*'),
      // Planos de treino e avaliações pós treino.
      supabase.from('training_plans').select('*').order('created_at'),
      supabase.from('training_plan_items').select('*').order('position'),
      supabase.from('training_evaluations').select('*').order('created_at'),
      supabase.from('training_player_evals').select('*'),
    ]);

  for (const res of [settings, coaches, teams, players, sponsors, events, attendances, quotas, equipment, teamCoaches, prospects, episodes, sessions, appointments,
                     physProfiles, medHistory, physTests, phases, mesocycles, gymSessions, gymExercises, gymAttendance, gameMinutes, availability,
                     trainingPlans, trainingPlanItems, trainingEvaluations, trainingPlayerEvals]) {
    if (res.error) throw res.error;
  }

  if (settings.data) state.settings = settings.data;
  state.coaches     = coaches.data     || [];
  state.teams       = teams.data       || [];
  state.players     = players.data     || [];
  state.sponsors    = sponsors.data    || [];
  state.events      = events.data      || [];
  state.attendances = attendances.data || [];
  state.quotas      = quotas.data      || [];
  state.equipment   = equipment.data   || [];
  state.teamCoaches = teamCoaches.data || [];
  state.prospects   = prospects.data   || [];
  state.clinicalEpisodes = episodes.data     || [];
  state.clinicalSessions = sessions.data      || [];
  state.appointments     = appointments.data  || [];
  state.physicalProfiles = physProfiles.data  || [];
  state.medicalHistory   = medHistory.data    || [];
  state.physicalTests    = physTests.data     || [];
  state.phases           = phases.data        || [];
  state.mesocycles       = mesocycles.data    || [];
  state.gymSessions      = gymSessions.data   || [];
  state.gymExercises     = gymExercises.data  || [];
  state.gymAttendance    = gymAttendance.data || [];
  state.gameMinutes      = gameMinutes.data   || [];
  state.availability     = availability.data  || [];
  state.trainingPlans      = trainingPlans.data      || [];
  state.trainingPlanItems  = trainingPlanItems.data  || [];
  state.trainingEvaluations = trainingEvaluations.data || [];
  state.trainingPlayerEvals = trainingPlayerEvals.data || [];

  // Coerência da cache: com pais arquivados (ex.: uma equipa), os filhos que os
  // referenciam não devem aparecer nos ecrãs ativos.
  pruneOrphans();

  await loadProfile();
  await loadArchived();

  state.loaded = true;
  notify();
}

// Remove da cache ativa os registos cujo "pai" já não está ativo (foi
// arquivado): atletas de equipas arquivadas e os dados dependentes de atletas/
// eventos que deixaram de existir na cache. Os registos continuam na BD (não se
// apagam) — apenas não se mostram enquanto o pai estiver arquivado.
function pruneOrphans() {
  const teamIds = new Set(state.teams.map((t) => t.id));
  // Atletas de equipas arquivadas saem das listas ativas.
  state.players = state.players.filter((p) => teamIds.has(p.team_id));

  const playerIds = new Set(state.players.map((p) => p.id));
  const eventIds = new Set(state.events.map((e) => e.id));
  const coachIds = new Set(state.coaches.map((c) => c.id));

  state.attendances = state.attendances.filter((a) => eventIds.has(a.event_id) && playerIds.has(a.player_id));
  state.quotas = state.quotas.filter((q) => playerIds.has(q.player_id));
  state.gameMinutes = state.gameMinutes.filter((g) => playerIds.has(g.player_id) && eventIds.has(g.event_id));
  state.gymAttendance = state.gymAttendance.filter((a) => playerIds.has(a.player_id));

  const episodeIds = new Set(
    state.clinicalEpisodes.filter((e) => playerIds.has(e.player_id)).map((e) => e.id)
  );
  state.clinicalEpisodes = state.clinicalEpisodes.filter((e) => playerIds.has(e.player_id));
  state.clinicalSessions = state.clinicalSessions.filter((s) => episodeIds.has(s.episode_id));
  state.appointments = state.appointments.filter((a) => playerIds.has(a.player_id));
  state.physicalProfiles = state.physicalProfiles.filter((p) => playerIds.has(p.player_id));
  state.medicalHistory = state.medicalHistory.filter((m) => playerIds.has(m.player_id));
  state.physicalTests = state.physicalTests.filter((t) => playerIds.has(t.player_id));
  state.availability = state.availability.filter((a) => playerIds.has(a.player_id));

  // Ligações treinador<->equipa cujo treinador foi arquivado.
  state.teamCoaches = state.teamCoaches.filter((tc) => coachIds.has(tc.coach_id) && teamIds.has(tc.team_id));

  // Planos de treino e avaliações de eventos arquivados saem da cache ativa.
  state.trainingPlans = state.trainingPlans.filter((p) => eventIds.has(p.event_id));
  const planIds = new Set(state.trainingPlans.map((p) => p.id));
  state.trainingPlanItems = state.trainingPlanItems.filter((i) => planIds.has(i.plan_id));
  state.trainingEvaluations = state.trainingEvaluations.filter((e) => eventIds.has(e.event_id));
  const evalIds = new Set(state.trainingEvaluations.map((e) => e.id));
  state.trainingPlayerEvals = state.trainingPlayerEvals.filter(
    (e) => evalIds.has(e.evaluation_id) && playerIds.has(e.player_id)
  );
}

// Carrega os registos arquivados (só para o coordenador, que tem a área
// "Arquivados"). Para os outros papéis fica vazio — não precisam.
async function loadArchived() {
  const empty = { teams: [], players: [], coaches: [], sponsors: [], events: [], prospects: [] };
  if (state.profile?.role !== 'coordenador') {
    state.archived = empty;
    return;
  }
  const arch = (table, order) =>
    supabase.from(table).select('*').not('archived_at', 'is', null).order(order, { ascending: false });
  const [teams, players, coaches, sponsors, events, prospects] = await Promise.all([
    arch('teams', 'archived_at'),
    arch('players', 'archived_at'),
    arch('coaches', 'archived_at'),
    arch('sponsors', 'archived_at'),
    arch('events', 'archived_at'),
    arch('prospects', 'archived_at'),
  ]);
  state.archived = {
    teams: teams.data || [],
    players: players.data || [],
    coaches: coaches.data || [],
    sponsors: sponsors.data || [],
    events: events.data || [],
    prospects: prospects.data || [],
  };
}

// Vincula (ou desvincula) uma conta de utilizador a um registo de treinador.
// Garante que nenhum outro coach fica com o mesmo user_id (1 utilizador → 1 coach).
export async function linkCoachToUser(coachId, userId) {
  if (userId) {
    const { error: clearErr } = await supabase
      .from('coaches')
      .update({ user_id: null })
      .eq('user_id', userId)
      .neq('id', coachId);
    if (clearErr) throw clearErr;
    state.coaches.forEach((c) => {
      if (c.id !== coachId && c.user_id === userId) c.user_id = null;
    });
  }
  const { data, error } = await supabase
    .from('coaches')
    .update({ user_id: userId || null })
    .eq('id', coachId)
    .select()
    .single();
  if (error) throw error;
  const i = state.coaches.findIndex((c) => c.id === coachId);
  if (i !== -1) state.coaches[i] = data;
  notify();
  return data;
}

// Vincula (ou desvincula) uma conta de utilizador a um registo de atleta.
// Garante que nenhum outro atleta fica com o mesmo user_id (1 conta → 1 atleta).
export async function linkPlayerToUser(playerId, userId) {
  if (userId) {
    const { error: clearErr } = await supabase
      .from('players')
      .update({ user_id: null })
      .eq('user_id', userId)
      .neq('id', playerId);
    if (clearErr) throw clearErr;
    state.players.forEach((p) => {
      if (p.id !== playerId && p.user_id === userId) p.user_id = null;
    });
  }
  const { data, error } = await supabase
    .from('players')
    .update({ user_id: userId || null })
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw error;
  const i = state.players.findIndex((p) => p.id === playerId);
  if (i !== -1) state.players[i] = data;
  notify();
  return data;
}

// Altera o papel de um utilizador (apenas coordenador, validado pelo RLS).
export async function updateProfileRole(id, role) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const i = state.profiles.findIndex((p) => p.id === id);
  if (i !== -1) state.profiles[i] = data;
  if (state.profile?.id === id) state.profile = data;
  notify();
  return data;
}

// Define as secções que um utilizador pode ver (lista de chaves de secção).
export async function updateProfilePermissions(id, permissions) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ permissions })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const i = state.profiles.findIndex((p) => p.id === id);
  if (i !== -1) state.profiles[i] = data;
  if (state.profile?.id === id) state.profile = data;
  notify();
  return data;
}

// --- Operações genéricas (CRUD) ------------------------------------------
// Cada operação atualiza o Supabase e, em caso de sucesso, a cache local,
// avisando depois as vistas. `collection` é a chave em `state` (ex.: 'coaches').

export async function createRow(table, collection, values) {
  const { data, error } = await supabase
    .from(table)
    .insert(values)
    .select()
    .single();
  if (error) throw error;
  state[collection].push(data);
  notify();
  return data;
}

// Inserção em lote (ex.: importar atletas de um ficheiro). Devolve as linhas
// criadas e atualiza a cache local de uma só vez.
export async function createRows(table, collection, rows) {
  if (!rows.length) return [];
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (error) throw error;
  state[collection].push(...data);
  notify();
  return data;
}

// Upsert de presença (cria ou atualiza — chave única event_id+player_id).
export async function upsertAttendance(eventId, playerId, values) {
  const { data, error } = await supabase
    .from('attendances')
    .upsert(
      { event_id: eventId, player_id: playerId, ...values },
      { onConflict: 'event_id,player_id' }
    )
    .select()
    .single();
  if (error) throw error;
  const i = state.attendances.findIndex(
    (a) => a.event_id === eventId && a.player_id === playerId
  );
  if (i !== -1) state.attendances[i] = data;
  else state.attendances.push(data);
  notify();
  return data;
}

// Upsert de uma tabela com chave `player_id` (perfil físico, história clínica).
// Cria ou atualiza a linha desse atleta e sincroniza a cache local.
export async function upsertByPlayer(table, collection, playerId, values) {
  const { data, error } = await supabase
    .from(table)
    .upsert({ player_id: playerId, ...values, updated_at: new Date().toISOString() }, { onConflict: 'player_id' })
    .select()
    .single();
  if (error) throw error;
  const i = state[collection].findIndex((r) => r.player_id === playerId);
  if (i !== -1) state[collection][i] = data;
  else state[collection].push(data);
  notify();
  return data;
}

// Upsert de presença num treino de ginásio (chave session_id+player_id).
export async function upsertGymAttendance(sessionId, playerId, values) {
  const { data, error } = await supabase
    .from('gym_attendance')
    .upsert({ session_id: sessionId, player_id: playerId, ...values }, { onConflict: 'session_id,player_id' })
    .select()
    .single();
  if (error) throw error;
  const i = state.gymAttendance.findIndex((a) => a.session_id === sessionId && a.player_id === playerId);
  if (i !== -1) state.gymAttendance[i] = data;
  else state.gymAttendance.push(data);
  notify();
  return data;
}

// Upsert de minutos de jogo (chave event_id+player_id).
export async function upsertGameMinutes(eventId, playerId, minutes) {
  const { data, error } = await supabase
    .from('game_minutes')
    .upsert({ event_id: eventId, player_id: playerId, minutes }, { onConflict: 'event_id,player_id' })
    .select()
    .single();
  if (error) throw error;
  const i = state.gameMinutes.findIndex((g) => g.event_id === eventId && g.player_id === playerId);
  if (i !== -1) state.gameMinutes[i] = data;
  else state.gameMinutes.push(data);
  notify();
  return data;
}

// Gera registos de quota para todos os atletas de uma equipa que ainda não
// tenham registo nesse mês/ano. Não duplica — usa upsert com onConflict.
export async function generateQuotas(teamId, mes, ano, valor) {
  const players = state.players.filter((p) => p.team_id === teamId);
  const existing = new Set(
    state.quotas.filter((q) => q.mes === mes && q.ano === ano).map((q) => q.player_id)
  );
  const rows = players.filter((p) => !existing.has(p.id)).map((p) => ({
    player_id: p.id, mes, ano, valor,
  }));
  if (!rows.length) return [];
  return createRows('quotas', 'quotas', rows);
}

// Marca uma quota como paga (ou não paga).
export async function toggleQuota(id, pago) {
  return updateRow('quotas', 'quotas', id, {
    pago,
    pago_em: pago ? new Date().toISOString() : null,
  });
}

// Converte um prospeto em atleta do plantel: cria o jogador e apaga o prospeto.
// `teamId` é a equipa de destino (obrigatório).
export async function convertProspect(prospectId, teamId) {
  const p = state.prospects.find((x) => x.id === prospectId);
  if (!p) throw new Error('Prospeto não encontrado.');
  const { data: player, error: cErr } = await supabase
    .from('players')
    .insert({
      team_id: teamId,
      name: p.name,
      birth_year: p.birth_year || null,
      position: p.position || null,
      notes: p.notes || null,
      guardian_contact: p.contact || null,
    })
    .select()
    .single();
  if (cErr) throw cErr;
  state.players.push(player);

  // Não se apaga o prospeto: fica como 'inscrito' e arquivado, preservando o
  // histórico de recrutamento. Sai das listas ativas do funil.
  const { error: dErr } = await supabase
    .from('prospects')
    .update({ status: 'inscrito', archived_at: new Date().toISOString() })
    .eq('id', prospectId);
  if (dErr) throw dErr;
  state.prospects = state.prospects.filter((x) => x.id !== prospectId);
  const arch = state.archived?.prospects;
  if (arch) arch.unshift({ ...p, status: 'inscrito', archived_at: new Date().toISOString() });
  notify();
  return player;
}

// Define o conjunto de treinadores de uma equipa (substitui o que existir).
// `entries` é uma lista de { coach_id, role } (role: 'principal' | 'adjunto').
// Estratégia simples: apaga os atuais e insere os novos.
export async function saveTeamCoaches(teamId, entries) {
  const { error: delErr } = await supabase
    .from('team_coaches')
    .delete()
    .eq('team_id', teamId);
  if (delErr) throw delErr;

  let inserted = [];
  if (entries.length) {
    const rows = entries.map((e) => ({
      team_id: teamId,
      coach_id: e.coach_id,
      role: e.role,
    }));
    const { data, error } = await supabase.from('team_coaches').insert(rows).select();
    if (error) throw error;
    inserted = data;
  }

  state.teamCoaches = state.teamCoaches
    .filter((tc) => tc.team_id !== teamId)
    .concat(inserted);
  notify();
  return inserted;
}

export async function updateRow(table, collection, id, values) {
  const { data, error } = await supabase
    .from(table)
    .update(values)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const i = state[collection].findIndex((r) => r.id === id);
  if (i !== -1) state[collection][i] = data;
  notify();
  return data;
}

// Remove da cache local os dados clínicos de um atleta apagado (episódios,
// respetivas sessões e atendimentos). Na BD isto é tratado pelas FKs em cascata.
function cleanupPlayerClinical(playerId) {
  const episodeIds = new Set(
    state.clinicalEpisodes.filter((e) => e.player_id === playerId).map((e) => e.id)
  );
  state.clinicalEpisodes = state.clinicalEpisodes.filter((e) => e.player_id !== playerId);
  state.clinicalSessions = state.clinicalSessions.filter((s) => !episodeIds.has(s.episode_id));
  state.appointments = state.appointments.filter((a) => a.player_id !== playerId);
  // Preparação física do atleta apagado.
  state.physicalProfiles = state.physicalProfiles.filter((p) => p.player_id !== playerId);
  state.medicalHistory = state.medicalHistory.filter((m) => m.player_id !== playerId);
  state.physicalTests = state.physicalTests.filter((t) => t.player_id !== playerId);
  state.gymAttendance = state.gymAttendance.filter((a) => a.player_id !== playerId);
  state.gameMinutes = state.gameMinutes.filter((g) => g.player_id !== playerId);
  state.availability = state.availability.filter((a) => a.player_id !== playerId);
}

// Arquiva (soft-delete) um registo: marca-o como inativo em vez de apagar, para
// manter o histórico. Recarrega tudo para repor a coerência da cache (filhos de
// pais arquivados deixam de aparecer). Só o coordenador o consegue (guard no RLS).
export async function archiveRow(table, id) {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  await loadAll();
}

// Repõe (reativa) um registo arquivado.
export async function restoreRow(table, id) {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: null })
    .eq('id', id);
  if (error) throw error;
  await loadAll();
}

export async function deleteRow(table, collection, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  state[collection] = state[collection].filter((r) => r.id !== id);

  // Tratar relações apagadas em cascata/anuladas na cache local:
  if (collection === 'teams') {
    const removedPlayers = state.players.filter((p) => p.team_id === id).map((p) => p.id);
    state.players = state.players.filter((p) => p.team_id !== id);
    state.events.forEach((e) => {
      if (e.team_id === id) e.team_id = null;
    });
    state.teamCoaches = state.teamCoaches.filter((tc) => tc.team_id !== id);
    removedPlayers.forEach(cleanupPlayerClinical);
    // Periodização da equipa (fases, mesociclos, treinos, exercícios, presenças).
    const sessionIds = new Set(state.gymSessions.filter((s) => s.team_id === id).map((s) => s.id));
    state.phases = state.phases.filter((p) => p.team_id !== id);
    state.mesocycles = state.mesocycles.filter((m) => m.team_id !== id);
    state.gymSessions = state.gymSessions.filter((s) => s.team_id !== id);
    state.gymExercises = state.gymExercises.filter((e) => !sessionIds.has(e.session_id));
    state.gymAttendance = state.gymAttendance.filter((a) => !sessionIds.has(a.session_id));
  }
  if (collection === 'coaches') {
    state.teams.forEach((t) => {
      if (t.coach_id === id) t.coach_id = null;
    });
    state.teamCoaches = state.teamCoaches.filter((tc) => tc.coach_id !== id);
  }
  if (collection === 'players') {
    cleanupPlayerClinical(id);
  }
  // Apagar um episódio leva as suas sessões (cascade na BD) e liberta os
  // atendimentos que lhe estavam associados (episode_id -> null).
  if (collection === 'clinicalEpisodes') {
    state.clinicalSessions = state.clinicalSessions.filter((s) => s.episode_id !== id);
    state.appointments.forEach((a) => {
      if (a.episode_id === id) a.episode_id = null;
    });
  }
  // Apagar um treino de ginásio leva os exercícios e as presenças (cascade).
  if (collection === 'gymSessions') {
    state.gymExercises = state.gymExercises.filter((e) => e.session_id !== id);
    state.gymAttendance = state.gymAttendance.filter((a) => a.session_id !== id);
  }
  // Apagar um mesociclo liberta os treinos que lhe pertenciam (mesocycle_id -> null).
  if (collection === 'mesocycles') {
    state.gymSessions.forEach((s) => {
      if (s.mesocycle_id === id) s.mesocycle_id = null;
    });
  }
  // Apagar um plano de treino leva as suas tarefas (cascade).
  if (collection === 'trainingPlans') {
    state.trainingPlanItems = state.trainingPlanItems.filter((i) => i.plan_id !== id);
  }
  // Apagar uma avaliação leva as avaliações individuais (cascade).
  if (collection === 'trainingEvaluations') {
    state.trainingPlayerEvals = state.trainingPlayerEvals.filter((e) => e.evaluation_id !== id);
  }
  notify();
}

// --- Planos de treino e avaliações pós treino ----------------------------

// Cria ou atualiza o plano de treino de um evento (chave única event_id).
export async function upsertTrainingPlan(eventId, values) {
  const { data, error } = await supabase
    .from('training_plans')
    .upsert(
      { event_id: eventId, ...values, updated_at: new Date().toISOString() },
      { onConflict: 'event_id' }
    )
    .select()
    .single();
  if (error) throw error;
  const i = state.trainingPlans.findIndex((p) => p.event_id === eventId);
  if (i !== -1) state.trainingPlans[i] = data;
  else state.trainingPlans.push(data);
  notify();
  return data;
}

// Cria ou atualiza a avaliação pós treino de um evento (chave única event_id).
export async function upsertTrainingEvaluation(eventId, values) {
  const { data, error } = await supabase
    .from('training_evaluations')
    .upsert(
      { event_id: eventId, ...values, updated_at: new Date().toISOString() },
      { onConflict: 'event_id' }
    )
    .select()
    .single();
  if (error) throw error;
  const i = state.trainingEvaluations.findIndex((e) => e.event_id === eventId);
  if (i !== -1) state.trainingEvaluations[i] = data;
  else state.trainingEvaluations.push(data);
  notify();
  return data;
}

// Cria ou atualiza a avaliação individual de um atleta numa avaliação de treino.
export async function upsertPlayerEval(evaluationId, playerId, values) {
  const { data, error } = await supabase
    .from('training_player_evals')
    .upsert(
      { evaluation_id: evaluationId, player_id: playerId, ...values },
      { onConflict: 'evaluation_id,player_id' }
    )
    .select()
    .single();
  if (error) throw error;
  const i = state.trainingPlayerEvals.findIndex(
    (e) => e.evaluation_id === evaluationId && e.player_id === playerId
  );
  if (i !== -1) state.trainingPlayerEvals[i] = data;
  else state.trainingPlayerEvals.push(data);
  notify();
  return data;
}

// --- Definições (linha única) --------------------------------------------
export async function saveSettings(values) {
  const { data, error } = await supabase
    .from('settings')
    .update(values)
    .eq('id', 1)
    .select()
    .single();
  if (error) throw error;
  state.settings = data;
  notify();
  return data;
}

// --- Backup: substituir todos os dados (importar) ------------------------
// Apaga o que existe e insere o conteúdo do backup, respeitando a ordem das
// relações (filhos primeiro a apagar, pais primeiro a inserir).
export async function replaceAllData(backup) {
  const delFilter = (q) => q.not('id', 'is', null);

  // Apagar (ordem segura para as chaves estrangeiras).
  for (const table of ['events', 'players', 'teams', 'sponsors', 'coaches']) {
    const { error } = await delFilter(supabase.from(table).delete());
    if (error) throw error;
  }

  // Inserir (pais primeiro). Só insere se houver linhas.
  const insertOrder = ['coaches', 'teams', 'players', 'sponsors', 'events'];
  for (const table of insertOrder) {
    const rows = backup[table];
    if (Array.isArray(rows) && rows.length) {
      const { error } = await supabase.from(table).insert(rows);
      if (error) throw error;
    }
  }

  // Definições (linha única).
  if (backup.settings) {
    const { season, goal, escaloes } = backup.settings;
    const values = { season, goal };
    if (Array.isArray(escaloes)) values.escaloes = escaloes;
    await saveSettings(values);
  }

  await loadAll();
}

// Snapshot de todos os dados, para exportar.
export function snapshot() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: state.settings,
    coaches: state.coaches,
    teams: state.teams,
    players: state.players,
    sponsors: state.sponsors,
    events: state.events,
  };
}

// Mensagens de erro de base de dados em português europeu.
export function dbErrorMessage(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Sem ligação ao servidor. Verifica a internet e tenta de novo.';
  }
  if (msg.includes('row-level security') || msg.includes('rls')) {
    return 'Sem permissão para esta operação. Confirma que tens sessão iniciada.';
  }
  return error?.message || 'Ocorreu um erro ao guardar os dados.';
}
