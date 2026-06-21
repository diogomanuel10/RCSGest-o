// Permissões na interface. O controlo REAL é feito pelo RLS no Supabase;
// isto serve para mostrar/esconder ações e dar mensagens claras ao utilizador.

import { state } from './store.js';

export const ROLES = [
  { key: 'coordenador', label: 'Coordenador', desc: 'Acesso total' },
  { key: 'treinador', label: 'Treinador', desc: 'Edita plantéis e calendário das suas equipas' },
  { key: 'fisioterapeuta', label: 'Fisioterapeuta', desc: 'Departamento médico e calendário de treinos' },
  { key: 'preparador', label: 'Preparador físico', desc: 'Preparação física, periodização e controlo' },
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

// Acessos sugeridos por omissão ao definir alguém como fisioterapeuta. O
// Departamento Médico é sempre acessível ao fisioterapeuta (ver canAccess);
// aqui ficam as secções de apoio que costuma querer consultar.
export const DEFAULT_FISIO_SECTIONS = [
  'calendario',
  'planteis',
];

// Acessos sugeridos por omissão ao definir alguém como preparador físico. A
// Preparação Física é sempre acessível ao preparador (ver canAccess); aqui
// ficam as secções de apoio (calendário/mapa de jogos e plantéis).
export const DEFAULT_PREP_SECTIONS = [
  'calendario',
  'planteis',
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
  // Calendário: só o coordenador cria/edita/apaga eventos (treinos e jogos).
  events: ['coordenador'],
  attendances: ['coordenador', 'treinador'],
  prospects: ['coordenador', 'treinador'],
  // Departamento médico: dados clínicos e atendimentos só do coordenador e
  // do fisioterapeuta (alinhado com a política "med_rw" do RLS).
  clinical: ['coordenador', 'fisioterapeuta'],
  appointments: ['coordenador', 'fisioterapeuta'],
  // Preparação física: perfil físico, avaliações, periodização e controlo
  // (alinhado com as políticas "phys_*"/"prep_*" do RLS).
  physical: ['coordenador', 'preparador'],
  // A história clínica é editada pela fisio/coordenador; o preparador só lê.
  medicalHistory: ['coordenador', 'fisioterapeuta'],
  // Disponibilidade (estado + limitações) — definida pela fisio/coordenador.
  availability: ['coordenador', 'fisioterapeuta'],
  // Planos de treino e avaliações pós treino: coordenador e treinador.
  training_plans: ['coordenador', 'treinador'],
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

export function isFisio() {
  return currentRole() === 'fisioterapeuta';
}

export function isPreparador() {
  return currentRole() === 'preparador';
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
  // O Departamento Médico é exclusivo do coordenador e do fisioterapeuta
  // (não é uma secção configurável para treinador/leitura).
  if (key === 'medico') return role === 'fisioterapeuta';
  // A Preparação Física é exclusiva do coordenador e do preparador físico.
  if (key === 'fisica') return role === 'preparador';
  // Fisio e preparador têm sempre o seu próprio Painel (resumo da sua área).
  if (key === 'painel') {
    if (role === 'fisioterapeuta' || role === 'preparador') return true;
    return currentPermissions().includes('painel');
  }
  // A Avaliação de plantel (quem fica/mantém/sai) é uma decisão técnica e de
  // direção — nunca acessível ao fisioterapeuta nem ao preparador físico.
  if (key === 'avaliacao' && (role === 'fisioterapeuta' || role === 'preparador')) {
    return false;
  }
  if (!SECTION_KEYS.has(key)) return false; // portal e afins não se aplicam
  return currentPermissions().includes(key);
}

// Pode editar (criar/alterar) uma dada entidade?
export function canEdit(entity) {
  return (EDIT_ROLES[entity] || []).includes(currentRole());
}

// Arquivar/remover é uma DECISÃO — reservada ao coordenador para as entidades
// principais (atletas, recrutamentos, equipas, treinadores, patrocínios,
// eventos). O treinador edita atletas/recrutamentos mas não os arquiva. Para as
// restantes entidades (sem arquivo) usa a mesma regra de edição.
const DELETE_ROLES = {
  players: ['coordenador'],
  prospects: ['coordenador'],
  teams: ['coordenador'],
  coaches: ['coordenador'],
  sponsors: ['coordenador'],
  events: ['coordenador'],
};
export function canDelete(entity) {
  if (DELETE_ROLES[entity]) return DELETE_ROLES[entity].includes(currentRole());
  return canEdit(entity);
}

// Só o coordenador gere utilizadores e definições.
export function canManageUsers() {
  return isCoordenador();
}
export function canManageSettings() {
  return isCoordenador();
}
