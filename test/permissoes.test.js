// Permissões: o papel diz QUEM vê, o plano diz O QUÊ está ligado.
//
// É a única camada da app onde um erro não estraga um número — deixa alguém
// ver o processo clínico de uma menor. O RLS é a fonte de verdade e recusa a
// operação de qualquer forma, mas a UI que mostra uma entrada a quem não pode
// entrar já contou metade da história: que aquela pessoa tem um episódio
// clínico aberto.

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestState } from './helpers.js';
import { state } from '../src/store.js';
import {
  canAccess, canEdit, canDelete, canDecideRequests,
  canManageUsers, canManageSettings, canRestore, isClubWide,
} from '../src/permissions.js';
import { planAllowsFeature, planLimit, planLimitReached } from '../src/plans.js';

// Põe o utilizador atual num papel, com as secções configuráveis indicadas.
function como(role, permissions = []) {
  state.profile = { id: 'u1', role, permissions };
}

beforeEach(() => {
  resetTestState();
  // Plano sem limites, para os testes de papel não esbarrarem no gating.
  state.org = { id: 'o1', plan: 'clube_plus' };
});

describe('áreas confidenciais', () => {
  it('a Fisioterapia é só do coordenador e do fisioterapeuta', () => {
    como('coordenador');   expect(canAccess('medico')).toBe(true);
    como('fisioterapeuta'); expect(canAccess('medico')).toBe(true);
    como('direcao');       expect(canAccess('medico')).toBe(false);
    como('preparador');    expect(canAccess('medico')).toBe(false);
    como('seccionista');   expect(canAccess('medico')).toBe(false);
    como('treinador');     expect(canAccess('medico')).toBe(false);
    como('atleta');        expect(canAccess('medico')).toBe(false);
  });

  it('a Preparação Física é só do coordenador e do preparador', () => {
    como('coordenador'); expect(canAccess('fisica')).toBe(true);
    como('preparador');  expect(canAccess('fisica')).toBe(true);
    como('fisioterapeuta'); expect(canAccess('fisica')).toBe(false);
    como('direcao');     expect(canAccess('fisica')).toBe(false);
  });

  it('NÃO são secções configuráveis: dar a permissão ao treinador não abre a porta', () => {
    // A regressão que este teste existe para apanhar: alguém acrescenta
    // 'medico' à lista de secções configuráveis e o treinador passa a ver o
    // processo clínico sem que nada no ecrã o denuncie.
    como('treinador', ['medico', 'fisica']);
    expect(canAccess('medico')).toBe(false);
    expect(canAccess('fisica')).toBe(false);
  });
});

describe('o portal é do atleta e só do atleta', () => {
  it('o atleta só tem o portal', () => {
    como('atleta');
    expect(canAccess('portal')).toBe(true);
    expect(canAccess('planteis')).toBe(false);
    expect(canAccess('calendario')).toBe(false);
    expect(canAccess('objetivos')).toBe(false);
  });

  it('nem o coordenador entra no portal pessoal de ninguém', () => {
    como('coordenador');
    expect(canAccess('portal')).toBe(false);
  });
});

describe('quem decide um pedido não é quem pede', () => {
  it('decidem o coordenador e a direção', () => {
    como('coordenador'); expect(canDecideRequests()).toBe(true);
    como('direcao');     expect(canDecideRequests()).toBe(true);
  });

  it('não decidem o treinador nem o seccionista', () => {
    // Espelha o trigger `guard_request_decision`: decidir um pedido é
    // comprometer verba.
    como('treinador');   expect(canDecideRequests()).toBe(false);
    como('seccionista'); expect(canDecideRequests()).toBe(false);
    como('atleta');      expect(canDecideRequests()).toBe(false);
  });

  it('o treinador vê a secção Pedidos (é a ferramenta dele); o seccionista não', () => {
    como('treinador');   expect(canAccess('pedidos')).toBe(true);
    como('seccionista', ['pedidos']); expect(canAccess('pedidos')).toBe(false);
    como('leitura', ['pedidos']);     expect(canAccess('pedidos')).toBe(false);
  });
});

describe('editar, arquivar e gerir', () => {
  it('o treinador edita atletas mas NÃO os arquiva', () => {
    // Arquivar é uma decisão, e é do coordenador (alinhado com o trigger
    // `guard_archive`).
    como('treinador');
    expect(canEdit('players')).toBe(true);
    expect(canDelete('players')).toBe(false);
  });

  it('o seccionista escreve na área administrativa mas não arquiva', () => {
    como('seccionista');
    expect(canEdit('players')).toBe(true);
    expect(canEdit('quotas')).toBe(true);
    expect(canDelete('players')).toBe(false);
  });

  it('só o coordenador gere utilizadores e repõe arquivados', () => {
    como('direcao');
    expect(canManageUsers()).toBe(false);
    expect(canRestore()).toBe(false);
    expect(canManageSettings()).toBe(true);          // definições são partilhadas
    como('coordenador');
    expect(canManageUsers()).toBe(true);
    expect(canRestore()).toBe(true);
  });

  it('o leitura não escreve em nada', () => {
    como('leitura', ['planteis', 'calendario']);
    expect(canEdit('players')).toBe(false);
    expect(canEdit('events')).toBe(false);
    expect(canAccess('planteis')).toBe(true);        // ver, sim
  });
});

describe('âmbito de clube', () => {
  it('todos veem o clube inteiro menos o treinador e o atleta', () => {
    for (const r of ['coordenador', 'direcao', 'seccionista', 'leitura', 'fisioterapeuta', 'preparador']) {
      como(r);
      expect(isClubWide(), r).toBe(true);
    }
    como('treinador'); expect(isClubWide()).toBe(false);
    como('atleta');    expect(isClubWide()).toBe(false);
  });
});

describe('gating por plano', () => {
  it('o plano Treinador não inclui os módulos premium', () => {
    state.org = { id: 'o1', plan: 'treinador' };
    como('coordenador');
    expect(canAccess('quotas')).toBe(false);
    expect(canAccess('medico')).toBe(false);
    // O que é base continua a ser base.
    expect(canAccess('planteis')).toBe(true);
    expect(canAccess('calendario')).toBe(true);
  });

  it('os Pedidos seguem o módulo Equipamentos: não há um sem o outro', () => {
    state.org = { id: 'o1', plan: 'treinador' };
    como('treinador');
    expect(canAccess('pedidos')).toBe(false);
    state.org = { id: 'o1', plan: 'clube' };
    expect(canAccess('pedidos')).toBe(true);
  });

  it('os planos antigos mapeiam sempre PARA CIMA', () => {
    // Tirar um módulo a quem já o usava é a forma mais rápida de o perder.
    for (const [antigo, esperado] of [['essencial', true], ['solo', false], ['treinador_plus', false]]) {
      state.org = { id: 'o1', plan: antigo };
      expect(planAllowsFeature('quotas'), antigo).toBe(esperado);
    }
  });

  it('os planos legados `pro`/`trial` abrem tudo (fail-open)', () => {
    for (const p of ['pro', 'trial', '', null, undefined]) {
      state.org = { id: 'o1', plan: p };
      expect(planAllowsFeature('financeiro')).toBe(true);
      expect(planAllowsFeature('ia')).toBe(true);
    }
  });

  it('um módulo fora do catálogo nunca é bloqueado pelo plano', () => {
    state.org = { id: 'o1', plan: 'treinador' };
    expect(planAllowsFeature('planteis')).toBe(true);
  });

  it('os limites do plano são tetos, e null é ilimitado', () => {
    state.org = { id: 'o1', plan: 'treinador' };
    expect(planLimit('escaloes')).toBe(3);
    expect(planLimitReached('escaloes', 2)).toBe(false);
    expect(planLimitReached('escaloes', 3)).toBe(true);
    state.org = { id: 'o1', plan: 'clube_plus' };
    expect(planLimit('escaloes')).toBe(Infinity);
    expect(planLimitReached('escaloes', 500)).toBe(false);
  });
});
