// Planos de subscrição (SaaS).
//
// Os planos vivem na tabela `plans` do Supabase e são editáveis pelo admin da
// plataforma (ver views/admin.js). Este módulo:
//   - guarda os planos POR OMISSÃO (DEFAULT_PLANS), usados como recurso quando a
//     tabela ainda não foi carregada/criada (fail-open, para não esconder nada);
//   - expõe o catálogo de módulos premium (PLAN_FEATURE_CATALOG) que se podem
//     ligar/desligar por plano;
//   - dá os helpers de gating (planAllowsFeature) e de limites (planLimit).
//
// Forma interna de um plano: { key, name, order, desc, sections:[featureKeys],
// limits:{ escaloes, users } }  (null nos limites = ilimitado).

import { state } from './store.js';

// Catálogo dos módulos premium que um plano pode incluir. A `key` tem de bater
// com a chave de secção usada em permissions.js (canAccess). Editável = o que
// aparece com caixa de seleção no editor de planos do admin.
export const PLAN_FEATURE_CATALOG = [
  { key: 'quotas',       label: 'Quotas (ficha de sócio)' },
  { key: 'equipamentos', label: 'Equipamentos' },
  { key: 'encomendas',   label: 'Encomendas' },
  { key: 'documentos',   label: 'Documentos (RGPD)' },
  { key: 'medico',       label: 'Fisioterapia / Dept. Médico' },
  { key: 'fisica',       label: 'Preparação física' },
  { key: 'financeiro',   label: 'Financeiro (visão de direção)' },
  { key: 'ia',           label: 'Análise / IA avançada' },
];
export const PLAN_FEATURES = PLAN_FEATURE_CATALOG.map((f) => f.key);

// Planos por omissão (recurso e seed inicial da tabela `plans`).
export const DEFAULT_PLANS = [
  { key: 'solo',           name: 'Solo',       order: 1, desc: 'Um treinador, um escalão.',
    sections: [], limits: { escaloes: 1, users: 1 } },
  { key: 'treinador_plus', name: 'Treinador+', order: 2, desc: 'Um treinador com vários escalões e coordenação técnica.',
    sections: [], limits: { escaloes: 3, users: 2 } },
  { key: 'essencial',      name: 'Essencial',  order: 3, desc: 'Gestão do clube com ficha de sócio, material e documentos.',
    sections: ['quotas', 'equipamentos', 'encomendas', 'documentos'], limits: { escaloes: null, users: 5 } },
  { key: 'clube',          name: 'Clube',      order: 4, desc: 'Clube completo: médico, preparação física, material e documentos.',
    sections: ['quotas', 'equipamentos', 'encomendas', 'documentos', 'medico', 'fisica'], limits: { escaloes: null, users: 15 } },
  { key: 'clube_plus',     name: 'Clube+',     order: 5, desc: 'Tudo, mais visão de direção (financeiro) e análise/IA.',
    sections: ['quotas', 'equipamentos', 'encomendas', 'documentos', 'medico', 'fisica', 'financeiro', 'ia'], limits: { escaloes: null, users: null } },
];
const DEFAULT_BY_KEY = Object.fromEntries(DEFAULT_PLANS.map((p) => [p.key, p]));

// Planos "legados"/especiais → plano real. Os clubes existentes ficaram com
// plan='pro' e o trial arranca sem plano; ambos = acesso total até definires um.
const PLAN_ALIASES = { pro: 'clube_plus', trial: 'clube_plus', '': 'clube_plus' };

// Converte uma linha da tabela `plans` para a forma interna.
function fromRow(r) {
  return {
    key: r.key,
    name: r.name,
    order: r.sort ?? 0,
    desc: r.description || '',
    sections: Array.isArray(r.features) ? r.features : [],
    limits: { escaloes: r.max_escaloes ?? null, users: r.max_users ?? null },
  };
}

// Lista efetiva de planos: a da BD se já carregou, senão a de omissão.
export function allPlans() {
  if (Array.isArray(state.plans) && state.plans.length) {
    return state.plans.map(fromRow).sort((a, b) => a.order - b.order);
  }
  return DEFAULT_PLANS;
}

function planMap() {
  return Object.fromEntries(allPlans().map((p) => [p.key, p]));
}

// Normaliza uma chave de plano para uma existente. Desconhecido → acesso total.
export function normalizePlan(plan) {
  const k = String(plan || '').toLowerCase();
  if (planMap()[k]) return k;
  return PLAN_ALIASES[k] || 'clube_plus';
}

// Plano (objeto interno) de uma chave.
export function planOf(plan) {
  const key = normalizePlan(plan);
  return planMap()[key] || DEFAULT_BY_KEY[key] || DEFAULT_BY_KEY.clube_plus;
}

export function planLabel(key) {
  return planOf(key).name;
}

// --- Plano do clube atual (lê de state.org) ------------------------------

export function currentPlanKey() {
  return normalizePlan(state.org?.plan);
}
export function currentPlan() {
  return planOf(state.org?.plan);
}

// O plano atual inclui um dado módulo premium? Módulos fora do catálogo são
// sempre permitidos (base).
export function planAllowsFeature(feature) {
  if (!PLAN_FEATURES.includes(feature)) return true;
  return currentPlan().sections.includes(feature);
}

// Teto do plano atual para um recurso ('escaloes' | 'users'). Infinity = sem limite.
export function planLimit(key) {
  const v = currentPlan().limits[key];
  return v == null ? Infinity : v;
}

// Já se atingiu o teto do plano para um recurso? `count` é o valor atual.
export function planLimitReached(key, count) {
  return count >= planLimit(key);
}
