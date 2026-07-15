// Planos de subscrição (SaaS).
//
// Fonte única de verdade dos 5 planos comerciais da Rumia. Cada plano define:
//   - `sections`: os módulos PREMIUM que desbloqueia (as secções base estão
//     sempre disponíveis, independentemente do plano);
//   - `limits`: tetos por quantidade (escalões, utilizadores). null = sem limite.
//
// O gating de módulos é aplicado na UI (ver permissions.js). Os limites por
// quantidade têm helpers prontos (planLimit) para os avisos de upgrade.
//
// Para MUDAR preços/limites/módulos de um plano, edita só este ficheiro.

import { state } from './store.js';

// Módulos premium controlados pelo plano. Tudo o que NÃO estiver aqui é base
// (disponível em todos os planos, sujeito apenas ao papel do utilizador).
//   quotas       → "Ficha de sócio/atleta completa" (quotas/mensalidades)
//   medico       → Fisioterapia / Departamento Médico
//   fisica       → Preparação Física (periodização, testes)
//   equipamentos → Inventário de material
//   encomendas   → Encomendas (consolidação de tamanhos)
//   financeiro   → Visão de direção (financeiro + painel agregado)
//   documentos   → Arquivo de documentos (exame médico, CC) com RGPD
//   ia           → Análise / IA avançada (futuro)
export const PLAN_FEATURES = [
  'quotas', 'medico', 'fisica', 'equipamentos', 'encomendas', 'financeiro',
  'documentos', 'ia',
];

// Os 5 planos, do mais simples ao mais completo (order crescente).
export const PLANS = [
  {
    key: 'solo', name: 'Solo', order: 1,
    desc: 'Um treinador, um escalão.',
    sections: [],
    limits: { escaloes: 1, users: 1 },
  },
  {
    key: 'treinador_plus', name: 'Treinador+', order: 2,
    desc: 'Um treinador com vários escalões e coordenação técnica.',
    sections: [],
    limits: { escaloes: 3, users: 2 },
  },
  {
    key: 'essencial', name: 'Essencial', order: 3,
    desc: 'Gestão do clube com ficha de sócio, material e documentos.',
    sections: ['quotas', 'equipamentos', 'documentos'],
    limits: { escaloes: null, users: 5 },
  },
  {
    key: 'clube', name: 'Clube', order: 4,
    desc: 'Clube completo: médico, preparação física, material e documentos.',
    sections: ['quotas', 'medico', 'fisica', 'equipamentos', 'encomendas', 'documentos'],
    limits: { escaloes: null, users: 15 },
  },
  {
    key: 'clube_plus', name: 'Clube+', order: 5,
    desc: 'Tudo, mais visão de direção (financeiro) e análise/IA.',
    sections: ['quotas', 'medico', 'fisica', 'equipamentos', 'encomendas', 'documentos', 'financeiro', 'ia'],
    limits: { escaloes: null, users: null },
  },
];

export const PLAN_BY_KEY = Object.fromEntries(PLANS.map((p) => [p.key, p]));
export const PLAN_LABEL = Object.fromEntries(PLANS.map((p) => [p.key, p.name]));

// Planos "legados"/especiais mapeados para um plano real. Os clubes existentes
// ficaram com plan='pro' no backfill e o trial arranca sem plano escolhido —
// ambos têm acesso total até definires um plano no painel de admin (fail-open,
// para não esconder módulos a quem já usava tudo).
const PLAN_ALIASES = { pro: 'clube_plus', trial: 'clube_plus', '': 'clube_plus' };

// Normaliza uma chave de plano para uma das reais. Desconhecido → acesso total.
export function normalizePlan(plan) {
  const k = String(plan || '').toLowerCase();
  if (PLAN_BY_KEY[k]) return k;
  return PLAN_ALIASES[k] || 'clube_plus';
}

// Plano (objeto) de uma chave, já normalizada.
export function planOf(plan) {
  return PLAN_BY_KEY[normalizePlan(plan)];
}

// --- Plano do clube atual (lê de state.org) ------------------------------

export function currentPlanKey() {
  return normalizePlan(state.org?.plan);
}
export function currentPlan() {
  return planOf(state.org?.plan);
}

// O plano atual inclui um dado módulo premium? Módulos fora da lista premium
// são sempre permitidos (base).
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
