// Permissões na interface. O controlo REAL é feito pelo RLS no Supabase;
// isto serve para mostrar/esconder ações e dar mensagens claras ao utilizador.

import { state } from './store.js';

export const ROLES = [
  { key: 'coordenador', label: 'Coordenador', desc: 'Acesso total' },
  { key: 'treinador', label: 'Treinador', desc: 'Edita plantéis e calendário das suas equipas' },
  { key: 'leitura', label: 'Leitura', desc: 'Apenas consulta' },
  { key: 'atleta', label: 'Atleta', desc: 'Portal pessoal (calendário, presenças, quotas)' },
];
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.key, r.label]));

// Que papéis podem ESCREVER em cada entidade (alinhado com o RLS do schema.sql).
// Nota: para players/events/attendances o treinador só escreve nas SUAS
// equipas — essa restrição por equipa é imposta pelo RLS, não aqui.
const EDIT_ROLES = {
  settings: ['coordenador'],
  coaches: ['coordenador'],
  sponsors: ['coordenador'],
  quotas: ['coordenador'],
  equipment: ['coordenador'],
  teams: ['coordenador'],
  players: ['coordenador', 'treinador'],
  events: ['coordenador', 'treinador'],
  attendances: ['coordenador', 'treinador'],
  prospects: ['coordenador', 'treinador'],
};

// Papel do utilizador atual (por omissão 'leitura' até o perfil carregar).
export function currentRole() {
  return state.profile?.role || 'leitura';
}

export function isCoordenador() {
  return currentRole() === 'coordenador';
}

export function isLeitura() {
  return currentRole() === 'leitura';
}

export function isAtleta() {
  return currentRole() === 'atleta';
}

// Coordenador e treinador acedem às secções operacionais (plantéis, calendário…).
// Leitura vê só Painel e Patrocínios; atleta vê só o seu portal.
export function canViewSection() {
  return isCoordenador() || currentRole() === 'treinador';
}

// O Painel e os Patrocínios são visíveis a toda a gestão, mas não ao atleta.
export function canViewDashboard() {
  return !isAtleta();
}

// Pode editar (criar/alterar/remover) uma dada entidade?
export function canEdit(entity) {
  return (EDIT_ROLES[entity] || []).includes(currentRole());
}

// Só o coordenador gere utilizadores e definições.
export function canManageUsers() {
  return isCoordenador();
}
export function canManageSettings() {
  return isCoordenador();
}
