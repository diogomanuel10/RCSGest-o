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

// Secções configuráveis por utilizador (o coordenador escolhe quais cada
// treinador/leitura vê). Definições e Utilizadores ficam de fora — são sempre
// exclusivas do coordenador. A ordem é a de apresentação na configuração.
export const SECTIONS = [
  { key: 'painel',       label: 'Painel' },
  { key: 'patrocinios',  label: 'Patrocínios' },
  { key: 'planteis',     label: 'Plantéis' },
  { key: 'avaliacao',    label: 'Avaliação' },
  { key: 'calendario',   label: 'Calendário' },
  { key: 'presencas',    label: 'Presenças' },
  { key: 'estatisticas', label: 'Estatísticas' },
  { key: 'quotas',       label: 'Quotas' },
  { key: 'equipamentos', label: 'Equipamentos' },
  { key: 'treinadores',  label: 'Treinadores' },
  { key: 'recrutamento', label: 'Recrutamento' },
];
const SECTION_KEYS = new Set(SECTIONS.map((s) => s.key));

// Acessos sugeridos por omissão ao definir alguém como treinador: as
// ferramentas operacionais das suas equipas (limitadas pelo RLS às dele).
export const DEFAULT_TRAINER_SECTIONS = [
  'planteis',
  'avaliacao',
  'calendario',
  'presencas',
  'estatisticas',
];

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

// Lista de secções que o utilizador atual pode ver (configurada pelo
// coordenador). Vazia se ainda não tiver acesso a nada.
export function currentPermissions() {
  const p = state.profile?.permissions;
  return Array.isArray(p) ? p : [];
}

// Pode aceder (ver) uma dada secção?
//   coordenador → todas (menos o portal, que é do atleta);
//   atleta      → só o portal;
//   treinador / leitura → só as secções que o coordenador lhe deu.
export function canAccess(key) {
  const role = currentRole();
  if (role === 'coordenador') return key !== 'portal';
  if (role === 'atleta') return key === 'portal';
  if (!SECTION_KEYS.has(key)) return false; // portal e afins não se aplicam
  return currentPermissions().includes(key);
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
