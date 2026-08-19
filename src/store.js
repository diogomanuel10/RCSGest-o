// Camada de dados da Rumia.
//
// Responsável por: ir buscar tudo ao Supabase uma vez, manter uma cópia em
// memória (cache), oferecer operações de criar/editar/remover e avisar as
// vistas quando algo muda (para re-desenharem).
//
// Modelo: clube único, dados partilhados — não há filtros por utilizador.

import { supabase } from './supabase.js';
import { applyBranding } from './branding.js';
import { toastOk } from './toast.js';

// Nome legível de cada tabela, para as mensagens de confirmação das operações
// genéricas (createRow/updateRow/…). Uma tabela sem entrada aqui grava na
// mesma — apenas não mostra aviso, por não haver nome apresentável.
const ENTITY_LABEL = {
  players: 'Atleta',
  teams: 'Equipa',
  coaches: 'Treinador',
  sponsors: 'Patrocínio',
  events: 'Evento',
  quotas: 'Quota',
  equipment: 'Equipamento',
  prospects: 'Recrutamento',
  clinical_episodes: 'Episódio clínico',
  clinical_sessions: 'Sessão',
  physio_appointments: 'Atendimento',
  physical_tests: 'Avaliação física',
  training_phases: 'Fase',
  mesocycles: 'Mesociclo',
  gym_sessions: 'Treino de ginásio',
  gym_exercises: 'Exercício',
  finances: 'Movimento',
  orders: 'Encomenda',
  objectives: 'Objetivo',
  documents: 'Documento',
  tactical_scenarios: 'Cenário',
  exercises: 'Exercício',
};

// Etiquetas femininas — o particípio concorda em género («Equipa guardada»).
const FEMININE = new Set([
  'teams', 'quotas', 'clinical_sessions', 'orders', 'training_phases', 'physical_tests',
]);

// Aviso de confirmação para uma operação numa tabela conhecida.
// `stem` é o particípio sem a vogal final: 'guardad' -> guardado/guardada.
function toastEntity(table, stem) {
  const label = ENTITY_LABEL[table];
  if (!label) return;
  toastOk(`${label} ${stem}${FEMININE.has(table) ? 'a' : 'o'}.`);
}

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
  playerSizes: [],        // tamanhos de equipamento por atleta
  playerDocuments: [],    // documentos (exame médico, seguro, CC)
  squads: [],             // convocatórias (1:1 com evento jogo)
  squadPlayers: [],       // atletas em cada convocatória
  eventResponses: [],     // o que o atleta respondeu a cada evento (vou/não vou)
  gameResults: [],        // resultado final de cada jogo (sets)
  gameSets: [],           // parciais de cada set
  financialEntries: [],   // receitas e despesas do clube
  gamePlans: [],          // planos de jogo táticos
  tacticalScenarios: [],  // cenários de decisão tática (free ball, 3x3)
  tacticalAnswers: [],    // respostas dos atletas aos cenários
  objectives: [],         // objetivos / KPIs da época (manuais e automáticos)
  exercises: [],          // biblioteca de exercícios do clube (reutilizáveis)
  profile: null, // perfil do utilizador atual (com o papel/role)
  profiles: [], // todos os perfis (preenchido só se o utilizador for coordenador)
  org: null, // organização (clube) do utilizador atual — multi-tenant
  isPlatformAdmin: false, // o utilizador é admin da plataforma (vendedor)?
  invitations: [], // convites do clube (só o coordenador os lê via RLS)
  plans: [], // planos de subscrição (editáveis pelo admin da plataforma)
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
  state.playerSizes = [];
  state.playerDocuments = [];
  state.squads = [];
  state.squadPlayers = [];
  state.eventResponses = [];
  state.gameResults = [];
  state.gameSets = [];
  state.financialEntries = [];
  state.gamePlans = [];
  state.tacticalScenarios = [];
  state.tacticalAnswers = [];
  state.objectives = [];
  state.exercises = [];
  state.profile = null;
  state.profiles = [];
  state.org = null;
  state.isPlatformAdmin = false;
  state.invitations = [];
  state.plans = [];
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
  state.profile = all.find((p) => p.id === userId) || { id: userId, role: 'leitura', org_id: null };

  await loadOrgContext();
}

// Carrega a organização (clube) do utilizador atual e se é admin da plataforma.
// A app usa isto para o gate de subscrição (trial/suspenso) e o onboarding.
export async function loadOrgContext() {
  const orgId = state.profile?.org_id || null;
  if (orgId) {
    const { data } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();
    state.org = data || null;
  } else {
    state.org = null;
  }
  // Admin da plataforma: a policy só devolve linhas a quem for admin.
  const { data: padmin } = await supabase
    .from('platform_admins')
    .select('user_id')
    .limit(1);
  state.isPlatformAdmin = Array.isArray(padmin) && padmin.length > 0;
}

// A organização atual pode usar a app? (ativa, ou trial por expirar).
// Devolve { ok, reason } — reason ∈ 'pending' | 'suspensa' | 'cancelada' | 'trial_expirado'.
export function orgAccess() {
  if (!state.profile?.org_id) return { ok: false, reason: 'pending' };
  const o = state.org;
  if (!o) return { ok: false, reason: 'pending' };
  if (o.status === 'ativa') return { ok: true };
  if (o.status === 'trial') {
    const expired = o.trial_ends_at && new Date(o.trial_ends_at) < new Date();
    return expired ? { ok: false, reason: 'trial_expirado' } : { ok: true };
  }
  return { ok: false, reason: o.status };
}

// --- Onboarding / convites (multi-tenant) --------------------------------

// Duração (dias) do período de demonstração de um clube novo. Muda aqui para
// ajustar quanto tempo um treinador pode experimentar a app.
export const TRIAL_DAYS = 30;

// Cria um clube novo e torna o utilizador atual coordenador (RPC no Supabase).
// Arranca em período de demonstração de TRIAL_DAYS dias.
export async function createClub(name, sport = 'voleibol', trialDays = TRIAL_DAYS) {
  const { data, error } = await supabase.rpc('create_club', {
    p_name: name,
    p_trial_days: trialDays,
    p_sport: sport,
  });
  if (error) throw error;
  await loadProfile();
  return data;
}

// Cria um clube PARA outra pessoa (admin da plataforma). A conta tem de já
// existir — criar contas exige a chave de serviço, que nunca anda no browser.
// Ver `supabase/acesso-fechado.sql`.
export async function adminCreateClub({ email, name, sport, trialDays = TRIAL_DAYS }) {
  const { data, error } = await supabase.rpc('admin_create_club', {
    p_email: email,
    p_name: name,
    p_sport: sport || 'voleibol',
    p_trial_days: trialDays,
  });
  if (error) throw error;
  return data;
}

// Aceita um convite por token, ligando a conta ao clube (RPC no Supabase).
export async function redeemInvitation(token) {
  const { data, error } = await supabase.rpc('redeem_invitation', { p_token: token });
  if (error) throw error;
  await loadProfile();
  return data;
}

// Cria um convite para o clube atual e devolve a linha (com o token/link).
// Com `playerId`, o convite nasce ligado a essa ficha de atleta: quem o
// resgatar fica vinculado a ELA, sem o coordenador ter de adivinhar depois,
// pelo email, qual das contas é qual (o servidor força o papel 'atleta').
export async function createInvitation(role, permissions, email, playerId = null) {
  const { data, error } = await supabase.rpc('create_invitation', {
    p_role: role,
    p_permissions: permissions || [],
    p_email: email || null,
    p_player_id: playerId,
  });
  if (error) throw error;
  // Um convite de atleta substitui o pendente anterior do mesmo atleta (o
  // servidor apaga-o), por isso a cache local também o tem de largar.
  if (playerId) {
    state.invitations = state.invitations.filter(
      (i) => !(i.player_id === playerId && !i.used_at)
    );
  }
  state.invitations.unshift(data);
  notify();
  return data;
}

// Revoga (apaga) um convite pendente.
export async function revokeInvitation(id) {
  const { error } = await supabase.from('org_invitations').delete().eq('id', id);
  if (error) throw error;
  state.invitations = state.invitations.filter((i) => i.id !== id);
  notify();
}

// --- Painel de admin da plataforma (o vendedor) --------------------------

// Lista todas as organizações com estatísticas (RPC guardado por is_platform_admin).
export async function adminListOrgs() {
  const { data, error } = await supabase.rpc('admin_list_orgs');
  if (error) throw error;
  return data || [];
}

// Altera o estado/plano/fim de trial de uma organização (billing manual).
export async function adminSetOrgStatus(orgId, { status, plan, trialEndsAt } = {}) {
  const { data, error } = await supabase.rpc('admin_set_org_status', {
    p_org: orgId,
    p_status: status ?? null,
    p_plan: plan ?? null,
    p_trial_ends_at: trialEndsAt ?? null,
  });
  if (error) throw error;
  return data;
}

// --- Carregamento inicial -------------------------------------------------
// Vai buscar todas as tabelas em paralelo. Lança erro se alguma falhar.
export async function loadAll() {
  const [settings, coaches, teams, players, sponsors, events, attendances, quotas, equipment, teamCoaches, prospects, episodes, sessions, appointments,
         physProfiles, medHistory, physTests, phases, mesocycles, gymSessions, gymExercises, gymAttendance, gameMinutes, availability,
         trainingPlans, trainingPlanItems, trainingEvaluations, trainingPlayerEvals,
         playerDocuments, playerSizes, squads, squadPlayers, financialEntries, gamePlans, objectives,
         eventResponses, gameResults, gameSets, tacticalScenarios, tacticalAnswers, exercises] =
    await Promise.all([
      // Multi-tenant: o RLS limita as definições ao clube do utilizador, por
      // isso não filtramos por id — devolve a (única) linha do clube atual.
      supabase.from('settings').select('*').limit(1).maybeSingle(),
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
      // Documentos dos atletas.
      supabase.from('player_documents').select('*'),
      // Tamanhos de equipamento.
      supabase.from('player_sizes').select('*'),
      // Convocatórias.
      supabase.from('squads').select('*'),
      supabase.from('squad_players').select('*'),
      // Gestão financeira.
      supabase.from('financial_entries').select('*').order('date', { ascending: false }),
      // Planos de jogo.
      supabase.from('game_plans').select('*').order('game_date', { ascending: false }),
      // Objetivos / KPIs.
      supabase.from('objectives').select('*').order('created_at'),
      // Respostas do atleta aos eventos (convocatórias e treinos). Se a
      // migração `comunicacao.sql` ainda não correu, fica vazio (ver abaixo).
      supabase.from('event_responses').select('*'),
      // Resultados de jogo (final + parciais). Tolerante à migração em falta.
      supabase.from('game_results').select('*'),
      supabase.from('game_sets').select('*').order('set_number'),
      // Decisão tática. Tolerante à migração em falta (ver abaixo).
      supabase.from('tactical_scenarios').select('*').order('created_at', { ascending: false }),
      supabase.from('tactical_answers').select('*'),
      // Biblioteca de exercícios. Tolerante à migração em falta (ver abaixo).
      supabase.from('exercises').select('*').order('name'),
    ]);

  for (const res of [settings, coaches, teams, players, sponsors, events, attendances, quotas, equipment, teamCoaches, prospects, episodes, sessions, appointments,
                     physProfiles, medHistory, physTests, phases, mesocycles, gymSessions, gymExercises, gymAttendance, gameMinutes, availability,
                     trainingPlans, trainingPlanItems, trainingEvaluations, trainingPlayerEvals,
                     playerDocuments, playerSizes, squads, squadPlayers, financialEntries, gamePlans, objectives]) {
    if (res.error) throw res.error;
  }

  if (settings.data) state.settings = settings.data;
  // Aplica a marca do clube (cores, emblema, textos) assim que as definições
  // chegam da BD.
  applyBranding(state.settings);
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
  state.playerDocuments = playerDocuments.data  || [];
  state.playerSizes     = playerSizes.data     || [];
  state.squads          = squads.data          || [];
  state.squadPlayers    = squadPlayers.data    || [];
  state.financialEntries = financialEntries.data || [];
  state.gamePlans        = gamePlans.data        || [];
  state.objectives       = objectives.data       || [];
  // Tolerante à migração em falta: sem `comunicacao.sql` a consulta devolve
  // erro e a app segue sem respostas, em vez de não arrancar de todo.
  state.eventResponses   = eventResponses.error ? [] : (eventResponses.data || []);
  state.gameResults      = gameResults.error   ? [] : (gameResults.data   || []);
  state.gameSets         = gameSets.error      ? [] : (gameSets.data      || []);
  // Sem `tatica.sql` a consulta devolve erro e a secção fica simplesmente
  // vazia, em vez de impedir a app de arrancar.
  state.tacticalScenarios = tacticalScenarios.error ? [] : (tacticalScenarios.data || []);
  state.tacticalAnswers   = tacticalAnswers.error   ? [] : (tacticalAnswers.data   || []);
  // Sem `exercicios.sql` a biblioteca fica vazia e a secção avisa que falta a
  // migração, em vez de impedir a app de arrancar.
  state.exercises         = exercises.error         ? [] : (exercises.data         || []);

  // Coerência da cache: com pais arquivados (ex.: uma equipa), os filhos que os
  // referenciam não devem aparecer nos ecrãs ativos.
  pruneOrphans();

  await loadProfile();
  await loadArchived();
  await loadInvitations();
  await loadPlans();

  state.loaded = true;
  notify();
}

// Carrega os planos de subscrição da BD. Se a tabela ainda não existir (o
// plans.sql não foi corrido), fica vazio e a app usa os planos por omissão.
export async function loadPlans() {
  const { data, error } = await supabase.from('plans').select('*').order('sort');
  state.plans = error ? [] : (data || []);
}

// Cria/atualiza um plano (só o admin da plataforma, garantido pelo RLS).
export async function savePlan(plan) {
  const { data, error } = await supabase
    .from('plans')
    .upsert({ ...plan, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select()
    .single();
  if (error) throw error;
  const i = state.plans.findIndex((p) => p.key === plan.key);
  if (i !== -1) state.plans[i] = data;
  else state.plans.push(data);
  notify();
  return data;
}

// Carrega os convites do clube. O RLS só devolve linhas ao coordenador; para os
// outros papéis fica vazio (sem erro).
export async function loadInvitations() {
  const { data } = await supabase
    .from('org_invitations')
    .select('*')
    .order('created_at', { ascending: false });
  state.invitations = data || [];
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

  // Documentos: só de atletas ativos.
  state.playerDocuments = state.playerDocuments.filter((d) => playerIds.has(d.player_id));
  // Tamanhos de equipamento: só para atletas ativos.
  state.playerSizes = state.playerSizes.filter((s) => playerIds.has(s.player_id));

  // Convocatórias: só para jogos ativos e atletas ativos.
  state.squads = state.squads.filter((s) => eventIds.has(s.event_id));
  const squadIds = new Set(state.squads.map((s) => s.id));
  state.squadPlayers = state.squadPlayers.filter(
    (sp) => squadIds.has(sp.squad_id) && playerIds.has(sp.player_id)
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
  toastEntity(table, 'criad');
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
  const label = ENTITY_LABEL[table];
  if (label) toastOk(`${data.length} registo${data.length === 1 ? '' : 's'} de ${label.toLowerCase()} criado${data.length === 1 ? '' : 's'}.`);
  notify();
  return data;
}

// Registo de presença por leitura do cartão QR (modo quiosque).
// Toda a decisão é do servidor (RPC `check_in_by_qr`): que treino, se conta
// como presente ou atraso, e se o atleta é mesmo daquela equipa e clube. Aqui
// só se sincroniza a cache e se devolve o resultado para o ecrã do quiosque.
// Devolve `{ ok, reason?, status?, already?, minutes_late?, player?, event? }`.
export async function checkInByQr(token, eventId = null) {
  const { data, error } = await supabase.rpc('check_in_by_qr', {
    p_token: token,
    p_event_id: eventId,
  });
  if (error) throw error;
  if (data?.ok && !data.already && data.event?.id && data.player?.id) {
    const row = {
      event_id: data.event.id,
      player_id: data.player.id,
      status: data.status,
      minutes_late: data.minutes_late ?? null,
      justification: null,
      source: 'qr',
      checked_in_at: new Date().toISOString(),
    };
    const i = state.attendances.findIndex(
      (a) => a.event_id === row.event_id && a.player_id === row.player_id
    );
    if (i !== -1) state.attendances[i] = { ...state.attendances[i], ...row };
    else state.attendances.push(row);
    notify();
  }
  return data;
}

// Guarda o que ESTE utilizador escolheu esconder no Painel — indicadores e
// avisos.
// Passa por RPC e não por um update direto: `profiles` só é editável pelo
// coordenador, e abrir a auto-edição da tabela deixaria qualquer utilizador
// mudar o seu próprio `role`. A função no servidor escreve só esta coluna, e
// só na linha de quem a chama.
export async function savePainelPrefs(hiddenAlerts, hiddenMetrics) {
  const { data, error } = await supabase.rpc('set_painel_prefs', {
    p_hidden_alerts: hiddenAlerts || [],
    p_hidden_metrics: hiddenMetrics || [],
  });
  if (error) throw error;
  if (state.profile) {
    state.profile.hidden_alerts = data?.hidden_alerts || [];
    state.profile.hidden_metrics = data?.hidden_metrics || [];
  }
  toastOk('Painel atualizado.');
  notify();
  return data;
}

// --- Resultados de jogo ---------------------------------------------------

// Grava o resultado de um jogo: o final e (opcionalmente) os parciais por set.
// Quando há parciais, é um trigger no servidor que reconta o final a partir
// deles — por isso a cache é recarregada do que ficou gravado, e não do que
// foi enviado. Um valor com dois donos acaba sempre em divergência.
export async function saveGameResult(eventId, { setsFor, setsAgainst, notes, sets }) {
  const { error: resErr } = await supabase
    .from('game_results')
    .upsert(
      { event_id: eventId, sets_for: setsFor, sets_against: setsAgainst, notes: notes || null, updated_at: new Date().toISOString() },
      { onConflict: 'event_id' }
    );
  if (resErr) throw resErr;

  // Os parciais são substituídos em bloco: é mais simples (e mais seguro) do
  // que reconciliar set a set quando o treinador apaga um set a mais.
  const { error: delErr } = await supabase.from('game_sets').delete().eq('event_id', eventId);
  if (delErr) throw delErr;

  const rows = (sets || []).filter((s) => s.points_for != null || s.points_against != null);
  if (rows.length) {
    const { error: insErr } = await supabase.from('game_sets').insert(
      rows.map((s, i) => ({
        event_id: eventId,
        set_number: i + 1,
        points_for: Number(s.points_for) || 0,
        points_against: Number(s.points_against) || 0,
      }))
    );
    if (insErr) throw insErr;
  }

  await reloadGameData(eventId);
  toastOk('Resultado guardado.');
  notify();
}

// Guarda os pontos jogados por cada atleta num jogo (voleibol) ou os minutos
// (modalidades com relógio). Só grava quem tem valor: um atleta sem número
// não é o mesmo que um atleta com zero.
export async function saveGameParticipation(eventId, rows) {
  const toSave = rows.filter((r) => r.value != null && r.value !== '');
  if (toSave.length) {
    const { error } = await supabase.from('game_minutes').upsert(
      toSave.map((r) => ({ event_id: eventId, player_id: r.playerId, [r.field]: Number(r.value) })),
      { onConflict: 'event_id,player_id' }
    );
    if (error) throw error;
  }
  const clear = rows.filter((r) => r.value === '' || r.value == null).map((r) => r.playerId);
  if (clear.length) {
    await supabase.from('game_minutes').delete().eq('event_id', eventId).in('player_id', clear);
  }
  const { data } = await supabase.from('game_minutes').select('*').eq('event_id', eventId);
  state.gameMinutes = state.gameMinutes.filter((g) => g.event_id !== eventId).concat(data || []);
  notify();
}

// Recarrega o resultado e os parciais de um jogo a partir da BD.
async function reloadGameData(eventId) {
  const [res, sets] = await Promise.all([
    supabase.from('game_results').select('*').eq('event_id', eventId).maybeSingle(),
    supabase.from('game_sets').select('*').eq('event_id', eventId).order('set_number'),
  ]);
  state.gameResults = state.gameResults.filter((r) => r.event_id !== eventId);
  if (res.data) state.gameResults.push(res.data);
  state.gameSets = state.gameSets.filter((s) => s.event_id !== eventId).concat(sets.data || []);
}

// --- Comunicação clube <-> atleta ---------------------------------------

// O atleta responde a um evento: 'vou' | 'nao_vou' | 'duvida'.
// Toda a validação é do servidor (RPC `respond_to_event`): que só responde
// pelo próprio, só a eventos da sua equipa e só ao que ainda não aconteceu.
// Uma resposta NÃO é uma presença — é intenção; quem regista o que aconteceu
// continua a ser o treinador ou o cartão QR.
export async function respondToEvent(eventId, response, note = null) {
  const { data, error } = await supabase.rpc('respond_to_event', {
    p_event_id: eventId,
    p_response: response,
    p_note: note,
  });
  if (error) throw error;
  const i = state.eventResponses.findIndex(
    (r) => r.event_id === data.event_id && r.player_id === data.player_id
  );
  if (i !== -1) state.eventResponses[i] = data;
  else state.eventResponses.push(data);
  notify();
  return data;
}

// Guarda alterações a um cenário de decisão tática, SEM toast.
//
// Exceção deliberada à regra "a confirmação de gravação vem do store"
// (ver CLAUDE.md): a vista grava sozinha a cada peça arrastada e a cada campo
// mudado, e um aviso por gesto tornava o ecrã ilegível — a montar um cenário
// são dezenas de gravações em poucos segundos. A confirmação visível aqui é o
// próprio campo, que mostra sempre o estado guardado. Publicar (a única ação
// com efeito para fora do ecrã) avisa à parte, na vista.
export async function saveScenario(id, patch) {
  const { data, error } = await supabase
    .from('tactical_scenarios')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const i = state.tacticalScenarios.findIndex((r) => r.id === id);
  if (i !== -1) state.tacticalScenarios[i] = data;
  // Sem notify(): a vista redesenha-se a si própria no fim de cada gesto, e um
  // re-desenho global a meio de um arrasto lutava com o que o dedo está a fazer.
  return data;
}

// Grava a resposta de um atleta a um cenário de decisão tática.
//
// Só a PRIMEIRA resposta é dado — a tabela tem `unique (scenario_id, player_id)`
// e nenhuma política de UPDATE. Repetir depois de ver a correção é treino
// legítimo, mas já não é uma leitura, por isso o conflito é engolido em
// silêncio em vez de dar erro ao atleta: ele não fez nada de errado.
export async function saveTacticalAnswer(scenarioId, playerId, chosen, verdict) {
  const { data, error } = await supabase
    .from('tactical_answers')
    .insert({ scenario_id: scenarioId, player_id: playerId, chosen, verdict })
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') return null; // já tinha respondido
    throw error;
  }
  if (data) {
    state.tacticalAnswers.push(data);
    notify();
  }
  return data;
}

// Envia um aviso do clube a todos os atletas de uma equipa que tenham conta.
// Devolve quantos foram avisados — é o número que a interface mostra, e diz
// ao treinador quantos NÃO têm conta (a diferença para o plantel).
export async function sendTeamAnnouncement(teamId, title, body) {
  const { data, error } = await supabase.rpc('send_team_announcement', {
    p_team_id: teamId,
    p_title: title,
    p_body: body,
  });
  if (error) throw error;
  return Number(data) || 0;
}

// Emite um cartão QR novo para o atleta: o token anterior deixa de registar
// presenças (é o que se faz quando um cartão se perde). Precisa de reimprimir.
export async function regeneratePlayerQr(playerId, token) {
  const { data, error } = await supabase
    .from('players')
    .update({ qr_token: token })
    .eq('id', playerId)
    .select()
    .single();
  if (error) throw error;
  const i = state.players.findIndex((p) => p.id === playerId);
  if (i !== -1) state.players[i] = data;
  toastOk('Cartão QR novo emitido. O anterior deixou de funcionar.');
  notify();
  return data;
}

// Fecha a sessão: marca falta a quem ficou sem qualquer registo neste treino.
// Devolve quantas faltas foram criadas.
export async function closeAttendanceSession(eventId) {
  const { data, error } = await supabase.rpc('close_attendance_session', {
    p_event_id: eventId,
  });
  if (error) throw error;
  const created = Number(data) || 0;
  if (created) {
    const { data: rows, error: readErr } = await supabase
      .from('attendances')
      .select('*')
      .eq('event_id', eventId);
    if (readErr) throw readErr;
    state.attendances = state.attendances.filter((a) => a.event_id !== eventId);
    state.attendances.push(...(rows || []));
    toastOk(`${created} falta${created === 1 ? '' : 's'} registada${created === 1 ? '' : 's'}.`);
    notify();
  } else {
    toastOk('Todos os atletas já tinham registo.');
  }
  return created;
}

// Fecha VÁRIAS sessões de uma vez (usado no painel do treinador, quando se
// acumularam treinos antigos por fechar). Vai em lote de propósito: chamar
// closeAttendanceSession num ciclo dava um toast por treino e uma releitura
// das presenças por treino, numa operação que é conceptualmente uma só.
// Devolve o total de faltas criadas.
export async function closeAttendanceSessions(eventIds) {
  if (!eventIds.length) return 0;
  let created = 0;
  for (const id of eventIds) {
    const { data, error } = await supabase.rpc('close_attendance_session', { p_event_id: id });
    if (error) throw error;
    created += Number(data) || 0;
  }
  const { data: rows, error: readErr } = await supabase
    .from('attendances')
    .select('*')
    .in('event_id', eventIds);
  if (readErr) throw readErr;
  const touched = new Set(eventIds);
  state.attendances = state.attendances.filter((a) => !touched.has(a.event_id));
  state.attendances.push(...(rows || []));
  toastOk(
    created
      ? `${eventIds.length} ${eventIds.length === 1 ? 'sessão fechada' : 'sessões fechadas'} — ${created} falta${created === 1 ? '' : 's'} registada${created === 1 ? '' : 's'}.`
      : 'Todos os atletas já tinham registo.'
  );
  notify();
  return created;
}

// Upsert de presença (cria ou atualiza — chave única event_id+player_id).
export async function upsertAttendance(eventId, playerId, values) {
  const { data, error } = await supabase
    .from('attendances')
    .upsert(
      { event_id: eventId, player_id: playerId, source: 'manual', ...values },
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
  toastEntity(table, 'guardad');
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
  toastEntity(table, 'arquivad');
}

// Repõe (reativa) um registo arquivado.
export async function restoreRow(table, id) {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: null })
    .eq('id', id);
  if (error) throw error;
  await loadAll();
  toastEntity(table, 'repost');
}

// --- Viragem de época -----------------------------------------------------
//
// Aplica de uma vez as decisões já tomadas na Avaliação de plantel: sobe de
// equipa quem fica, arquiva quem sai, repõe as avaliações a "pendente" para a
// época nova e grava a nova época nas Definições.
//
// Vai em lote de propósito. A alternativa — chamar `archiveRow` por atleta —
// faria um `loadAll()` e um toast por cada um: com 200 atletas são 200 voltas
// à base de dados e uma torrente de avisos por cima de uma operação que é
// conceptualmente UMA. Aqui é uma escrita por grupo e um `loadAll()` no fim.
//
// Nada é apagado: quem sai fica arquivado e pode ser reposto nos Arquivados.
export async function applySeasonRollover({ moves = [], archives = [], resets = [], season }) {
  const now = new Date().toISOString();

  // Movimentos agrupados por equipa de destino: um update por destino.
  const porDestino = new Map();
  for (const m of moves) {
    if (!porDestino.has(m.teamId)) porDestino.set(m.teamId, []);
    porDestino.get(m.teamId).push(m.playerId);
  }
  for (const [teamId, ids] of porDestino) {
    const { error } = await supabase.from('players').update({ team_id: teamId }).in('id', ids);
    if (error) throw error;
  }

  if (archives.length) {
    const { error } = await supabase
      .from('players').update({ archived_at: now }).in('id', archives);
    if (error) throw error;
  }

  // Repor as avaliações: as decisões da época que acabou não valem para a
  // seguinte, e mantê-las faria a Avaliação abrir já toda decidida.
  if (resets.length) {
    const { error } = await supabase
      .from('players').update({ review_status: 'pendente' }).in('id', resets);
    if (error) throw error;
  }

  if (season) {
    const orgId = state.org?.id || state.profile?.org_id;
    const query = supabase.from('settings').update({ season });
    const { error } = await (orgId ? query.eq('org_id', orgId) : query.eq('id', state.settings.id));
    if (error) throw error;
  }

  await loadAll();
  toastOk('Época virada.');
  return { movidos: moves.length, arquivados: archives.length, repostos: resets.length };
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
  toastEntity(table, 'removid');
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

// --- Documentos dos atletas ----------------------------------------------

export async function uploadPlayerDocument(playerId, docType, file, expiresAt) {
  const ext = file.name.split('.').pop();
  const ts = Date.now();
  const path = `${playerId}/${docType}/${ts}.${ext}`;

  const { error: storageErr } = await supabase.storage
    .from('player-docs')
    .upload(path, file, { upsert: false });
  if (storageErr) throw storageErr;

  const { data, error } = await supabase
    .from('player_documents')
    .insert({
      player_id:    playerId,
      doc_type:     docType,
      storage_path: path,
      filename:     file.name,
      expires_at:   expiresAt || null,
      uploaded_by:  (await supabase.auth.getUser()).data.user?.id,
    })
    .select()
    .single();
  if (error) {
    // Limpa o ficheiro do storage se o insert falhou.
    await supabase.storage.from('player-docs').remove([path]);
    throw error;
  }
  state.playerDocuments.push(data);
  notify();
  return data;
}

export async function deletePlayerDocument(docId) {
  const doc = state.playerDocuments.find((d) => d.id === docId);
  if (!doc) return;
  await supabase.storage.from('player-docs').remove([doc.storage_path]);
  const { error } = await supabase.from('player_documents').delete().eq('id', docId);
  if (error) throw error;
  state.playerDocuments = state.playerDocuments.filter((d) => d.id !== docId);
  notify();
}

export async function getDocumentSignedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from('player-docs')
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// --- Tamanhos de equipamento ---------------------------------------------

export async function upsertPlayerSizes(playerId, values) {
  const { data, error } = await supabase
    .from('player_sizes')
    .upsert(
      { player_id: playerId, ...values, updated_at: new Date().toISOString() },
      { onConflict: 'player_id' }
    )
    .select()
    .single();
  if (error) throw error;
  const i = state.playerSizes.findIndex((s) => s.player_id === playerId);
  if (i !== -1) state.playerSizes[i] = data;
  else state.playerSizes.push(data);
  notify();
  return data;
}

// --- Convocatórias -------------------------------------------------------

// Garante que existe uma convocatória para o evento e devolve-a.
export async function ensureSquad(eventId) {
  let squad = state.squads.find((s) => s.event_id === eventId);
  if (!squad) {
    const { data, error } = await supabase
      .from('squads')
      .upsert({ event_id: eventId }, { onConflict: 'event_id' })
      .select()
      .single();
    if (error) throw error;
    squad = data;
    if (!state.squads.some((s) => s.id === squad.id)) state.squads.push(squad);
  }
  return squad;
}

// Adiciona ou atualiza um atleta na convocatória de um jogo.
export async function upsertSquadPlayer(squadId, playerId, status) {
  const { data, error } = await supabase
    .from('squad_players')
    .upsert(
      { squad_id: squadId, player_id: playerId, status },
      { onConflict: 'squad_id,player_id' }
    )
    .select()
    .single();
  if (error) throw error;
  const i = state.squadPlayers.findIndex(
    (sp) => sp.squad_id === squadId && sp.player_id === playerId
  );
  if (i !== -1) state.squadPlayers[i] = data;
  else state.squadPlayers.push(data);
  notify();
  return data;
}

// Remove um atleta da convocatória.
export async function removeSquadPlayer(squadId, playerId) {
  const { error } = await supabase
    .from('squad_players')
    .delete()
    .eq('squad_id', squadId)
    .eq('player_id', playerId);
  if (error) throw error;
  state.squadPlayers = state.squadPlayers.filter(
    (sp) => !(sp.squad_id === squadId && sp.player_id === playerId)
  );
  notify();
}

// --- Definições (linha única) --------------------------------------------
export async function saveSettings(values) {
  // Atualiza a linha de definições do clube atual (multi-tenant). Se ainda não
  // existir (clube acabado de criar), o RLS/DEFAULT tratam do org_id no upsert.
  const orgId = state.org?.id || state.profile?.org_id;
  const query = supabase.from('settings').update(values);
  const { data, error } = await (orgId
    ? query.eq('org_id', orgId)
    : query.eq('id', state.settings.id)
  ).select().single();
  if (error) throw error;
  state.settings = data;
  // Reaplica a marca — cobre qualquer alteração de cores/emblema/textos.
  applyBranding(state.settings);
  toastOk('Definições guardadas.');
  notify();
  return data;
}

// Nota: a cópia de segurança em .json (exportar/importar) foi removida.
// Prometia uma coisa que não cumpria: exportava SEIS tabelas de mais de
// quarenta — sem presenças, quotas, dados clínicos, físicos ou financeiros —
// e a importação APAGAVA eventos, atletas, equipas, patrocínios e treinadores,
// levando atrás, em cascata, tudo o que dependia deles. Um ficheiro chamado
// "backup" que restaura um quinto dos dados e destrói o resto é pior do que
// não existir. As cópias de segurança da base de dados são responsabilidade do
// Supabase; a exportação dos dados de um titular (RGPD) fica por fazer e é
// coisa à parte, por atleta e não por clube.

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
