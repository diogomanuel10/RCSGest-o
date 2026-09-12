// Ferramentas partilhadas pelos testes.
//
// O `state` do `store.js` é um objeto exportado e mutável: os testes escrevem
// nele diretamente, como a app faz depois de um `loadAll()`. Não há rede nem
// cliente Supabase envolvidos — sem as variáveis de ambiente, o `supabase.js`
// exporta `null` e nunca chega a ser chamado por nenhuma função de cálculo.

import { state } from '../src/store.js';

// Estado limpo, com o mínimo para as funções de cálculo não tropeçarem.
const BASE = {
  settings: { id: 1, season: '2026/2027', goal: 15000, escaloes: [], positions: [], sport: 'voleibol' },
  coaches: [], teams: [], players: [], sponsors: [], events: [], attendances: [],
  quotas: [], equipment: [], teamCoaches: [], prospects: [],
  clinicalEpisodes: [], clinicalSessions: [], appointments: [],
  physicalProfiles: [], medicalHistory: [], physicalTests: [],
  phases: [], mesocycles: [], gymSessions: [], gymExercises: [], gymAttendance: [],
  gameMinutes: [], availability: [], trainingPlans: [], trainingPlanItems: [],
  trainingEvaluations: [], trainingPlayerEvals: [], playerSizes: [],
  equipmentRequests: [], playerDocuments: [], squads: [], squadPlayers: [],
  eventResponses: [], gameResults: [], gameSets: [], financialEntries: [],
  gamePlans: [], tacticalScenarios: [], tacticalAnswers: [], objectives: [],
  exercises: [], profiles: [], invitations: [], plans: [],
  profile: { id: 'u1', role: 'coordenador' },
  org: null, isPlatformAdmin: false,
  season: '2026/2027', seasons: ['2026/2027'], seasonsReady: true,
  archived: { teams: [], players: [], coaches: [], sponsors: [], events: [], prospects: [] },
  loaded: true,
};

export function resetTestState(overrides = {}) {
  for (const [k, v] of Object.entries(BASE)) {
    state[k] = Array.isArray(v) ? [] : (v && typeof v === 'object' ? { ...v } : v);
  }
  state.archived = { teams: [], players: [], coaches: [], sponsors: [], events: [], prospects: [] };
  Object.assign(state, overrides);
  return state;
}

// Data ISO a N dias de hoje (negativo = passado). As funções de cálculo
// comparam com `new Date()`, por isso as fixtures têm de ser relativas: uma
// data cravada faz o teste passar hoje e falhar no próximo mês.
export function dayOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Um treino/jogo já realizado (ontem, por omissão).
export function evento(id, extra = {}) {
  return { id, type: 'treino', date: dayOffset(-1), time: '19:00', team_id: 't1', ...extra };
}

export function atleta(id, extra = {}) {
  return { id, name: `Atleta ${id}`, team_id: 't1', number: 1, ...extra };
}
