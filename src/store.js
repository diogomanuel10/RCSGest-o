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
  state.attendances = [];
  state.quotas = [];
  state.equipment = [];
  state.teamCoaches = [];
  state.prospects = [];
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
  const [settings, coaches, teams, players, sponsors, events, attendances, quotas, equipment, teamCoaches, prospects] =
    await Promise.all([
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
      supabase.from('coaches').select('*').order('name'),
      supabase.from('teams').select('*').order('created_at'),
      supabase.from('players').select('*').order('number'),
      supabase.from('sponsors').select('*').order('name'),
      supabase.from('events').select('*').order('date'),
      supabase.from('attendances').select('*'),
      supabase.from('quotas').select('*'),
      supabase.from('equipment').select('*').order('name'),
      supabase.from('team_coaches').select('*'),
      supabase.from('prospects').select('*').order('created_at'),
    ]);

  for (const res of [settings, coaches, teams, players, sponsors, events, attendances, quotas, equipment, teamCoaches, prospects]) {
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

  await loadProfile();

  state.loaded = true;
  notify();
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

  const { error: dErr } = await supabase.from('prospects').delete().eq('id', prospectId);
  if (dErr) throw dErr;
  state.prospects = state.prospects.filter((x) => x.id !== prospectId);
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
    state.teamCoaches = state.teamCoaches.filter((tc) => tc.team_id !== id);
  }
  if (collection === 'coaches') {
    state.teams.forEach((t) => {
      if (t.coach_id === id) t.coach_id = null;
    });
    state.teamCoaches = state.teamCoaches.filter((tc) => tc.coach_id !== id);
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
