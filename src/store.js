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
  profile: null, // perfil do utilizador atual (com o papel/role)
  profiles: [], // todos os perfis (preenchido só se o utilizador for coordenador)
  loaded: false,
};

// Limpa a cache (usado ao terminar sessão, para o próximo login recarregar).
export function resetState() {
  state.coaches = [];
  state.teams = [];
  state.players = [];
  state.sponsors = [];
  state.events = [];
  state.profile = null;
  state.profiles = [];
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
  const [settings, coaches, teams, players, sponsors, events] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('coaches').select('*').order('name'),
    supabase.from('teams').select('*').order('created_at'),
    supabase.from('players').select('*').order('number'),
    supabase.from('sponsors').select('*').order('name'),
    supabase.from('events').select('*').order('date'),
  ]);

  for (const res of [settings, coaches, teams, players, sponsors, events]) {
    if (res.error) throw res.error;
  }

  if (settings.data) state.settings = settings.data;
  state.coaches = coaches.data || [];
  state.teams = teams.data || [];
  state.players = players.data || [];
  state.sponsors = sponsors.data || [];
  state.events = events.data || [];

  await loadProfile();

  state.loaded = true;
  notify();
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

export async function deleteRow(table, collection, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw error;
  state[collection] = state[collection].filter((r) => r.id !== id);

  // Tratar relações apagadas em cascata/anuladas na cache local:
  if (collection === 'teams') {
    state.players = state.players.filter((p) => p.team_id !== id);
    state.events.forEach((e) => {
      if (e.team_id === id) e.team_id = null;
    });
  }
  if (collection === 'coaches') {
    state.teams.forEach((t) => {
      if (t.coach_id === id) t.coach_id = null;
    });
  }
  notify();
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
