// Cálculos derivados a partir do estado (state). Sem efeitos secundários.

import { state } from './store.js';
import { TIER_VALUE, IN_PROGRESS_STATUSES } from './constants.js';

// Total angariado = soma do valor do nível dos patrocínios CONFIRMADOS.
// Patrocínios confirmados sem nível contam 0 (não deviam existir, pois a app
// exige nível ao confirmar — mas o cálculo é defensivo na mesma).
export function totalRaised() {
  return state.sponsors
    .filter((s) => s.status === 'confirmado')
    .reduce((sum, s) => sum + (TIER_VALUE[s.tier] || 0), 0);
}

// Nº de contactos em curso (email enviado / a telefonar / em conversação).
export function inProgressCount() {
  return state.sponsors.filter((s) => IN_PROGRESS_STATUSES.includes(s.status)).length;
}

// Quantos patrocínios confirmados existem em cada nível.
export function confirmedByTier() {
  const counts = { ouro: 0, prata: 0, bronze: 0 };
  for (const s of state.sponsors) {
    if (s.status === 'confirmado' && counts[s.tier] !== undefined) counts[s.tier]++;
  }
  return counts;
}

// Data/hora de um evento como objeto Date (para comparar passado/futuro).
export function eventDateTime(ev) {
  const time = ev.time && /^\d{2}:\d{2}/.test(ev.time) ? ev.time : '00:00';
  return new Date(`${ev.date}T${time}`);
}

// Próximos eventos (a partir de agora), ordenados, limitados a `limit`.
export function upcomingEvents(limit = 5) {
  const now = new Date();
  return state.events
    .filter((e) => eventDateTime(e) >= now)
    .sort((a, b) => eventDateTime(a) - eventDateTime(b))
    .slice(0, limit);
}

// Nome legível de uma equipa (ex.: "Seniores Masculino").
export function teamName(team) {
  if (!team) return '';
  const g = team.gender === 'M' ? 'Masculino' : 'Feminino';
  return `${team.escalao} ${g}`;
}

export function teamById(id) {
  return state.teams.find((t) => t.id === id) || null;
}

export function coachById(id) {
  return state.coaches.find((c) => c.id === id) || null;
}
