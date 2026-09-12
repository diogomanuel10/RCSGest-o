// Objetivos / KPIs — a distinção entre um indicador que ACUMULA e uma TAXA.
//
// É a regra menos óbvia de toda a app e a que mais barato sai errar: estar a
// 75% de um alvo de 90% de retenção, a meio da época, não é ir atrasado (é
// estar `abaixo`), mas estar a 40% do dinheiro angariado com 80% do tempo
// gasto é mesmo estar em `risco`. Trocá-las enche o Painel de alarmes falsos,
// e um painel que assinala tudo deixa de ser lido.

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestState, dayOffset } from './helpers.js';
import { objectiveProgress, objectiveStatus, isCumulative } from '../src/compute.js';

const acumulavel = (extra = {}) => ({
  id: 'o1', kind: 'manual', unit: '€', target: 10000, current: 4000,
  created_at: new Date(Date.now() - 80 * 86400000).toISOString(),
  deadline: dayOffset(20), ...extra,
});
const taxa = (extra = {}) => ({ ...acumulavel({ unit: '%', target: 90, current: 75 }), ...extra });

beforeEach(() => resetTestState());

describe('isCumulative', () => {
  it('trata os objetivos manuais em % como taxa e os restantes como acumuláveis', () => {
    expect(isCumulative({ kind: 'manual', unit: '%' })).toBe(false);
    expect(isCumulative({ kind: 'manual', unit: '€' })).toBe(true);
    expect(isCumulative({ kind: 'manual', unit: '' })).toBe(true);
  });

  it('lê a declaração do indicador nos objetivos automáticos', () => {
    expect(isCumulative({ kind: 'auto', metric: 'total_raised' })).toBe(true);
    expect(isCumulative({ kind: 'auto', metric: 'attendance_rate' })).toBe(false);
    // Uma métrica desconhecida (chave antiga, migração por correr) não pode
    // rebentar o cartão: assume-se taxa, que é a leitura mais conservadora.
    expect(isCumulative({ kind: 'auto', metric: 'nao_existe' })).toBe(false);
  });
});

describe('objectiveProgress', () => {
  it('limita a percentagem a 100 e marca como atingido', () => {
    const p = objectiveProgress(acumulavel({ current: 12000 }));
    expect(p.pct).toBe(100);
    expect(p.reached).toBe(true);
  });

  it('um alvo de zero nunca conta como atingido', () => {
    // Sem alvo não há nada para atingir. Marcar 0/0 como 100% punha no Painel
    // um objetivo "cumprido" que ninguém definiu.
    const p = objectiveProgress(acumulavel({ target: 0, current: 0 }));
    expect(p.pct).toBe(0);
    expect(p.reached).toBe(false);
  });

  it('um marco é binário: sem alvo nem barra', () => {
    expect(objectiveProgress({ kind: 'marco', done_at: null }).reached).toBe(false);
    expect(objectiveProgress({ kind: 'marco', done_at: '2026-03-01' })).toMatchObject({
      reached: true, pct: 100, target: 1,
    });
  });
});

describe('objectiveStatus', () => {
  it('atingido ganha a tudo o resto, prazo passado incluído', () => {
    const obj = acumulavel({ current: 10000, deadline: dayOffset(-5) });
    expect(objectiveStatus(obj, objectiveProgress(obj))).toBe('atingido');
  });

  it('prazo passado sem atingir é falhado', () => {
    const obj = acumulavel({ deadline: dayOffset(-1) });
    expect(objectiveStatus(obj, objectiveProgress(obj))).toBe('falhado');
  });

  it('num ACUMULÁVEL, ficar muito atrás do tempo gasto é risco', () => {
    // 90 dias de prazo, 80 já gastos (89% do tempo), 40% do alvo feito.
    const obj = acumulavel({
      created_at: new Date(Date.now() - 80 * 86400000).toISOString(),
      deadline: dayOffset(10),
      current: 4000,
    });
    expect(objectiveStatus(obj, objectiveProgress(obj))).toBe('risco');
  });

  it('num ACUMULÁVEL, acompanhar o tempo gasto é progresso normal', () => {
    const obj = acumulavel({
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
      deadline: dayOffset(45),
      current: 5000,                                   // 50% feito, 50% do tempo
    });
    expect(objectiveStatus(obj, objectiveProgress(obj))).toBe('progresso');
  });

  it('numa TAXA, estar abaixo do alvo a meio do prazo é `abaixo` e não `risco`', () => {
    // A regra que justifica toda a distinção: 75% de retenção contra um alvo
    // de 90%, a meio da época, não é ir atrasado — a taxa é o que é agora.
    const obj = taxa({
      created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
      deadline: dayOffset(45),
    });
    expect(objectiveStatus(obj, objectiveProgress(obj))).toBe('abaixo');
  });

  it('numa TAXA, o risco só entra no último quarto do prazo', () => {
    const obj = taxa({
      created_at: new Date(Date.now() - 90 * 86400000).toISOString(),
      deadline: dayOffset(10),                         // 90% do tempo gasto
    });
    expect(objectiveStatus(obj, objectiveProgress(obj))).toBe('risco');
  });

  it('sem prazo não há ritmo que se meça', () => {
    const acum = acumulavel({ deadline: null });
    expect(objectiveStatus(acum, objectiveProgress(acum))).toBe('progresso');
    const tx = taxa({ deadline: null });
    expect(objectiveStatus(tx, objectiveProgress(tx))).toBe('abaixo');
  });

  it('um marco avisa quando o prazo se aproxima', () => {
    const perto = { kind: 'marco', done_at: null, deadline: dayOffset(10) };
    expect(objectiveStatus(perto, objectiveProgress(perto))).toBe('risco');
    const longe = { kind: 'marco', done_at: null, deadline: dayOffset(200) };
    expect(objectiveStatus(longe, objectiveProgress(longe))).toBe('progresso');
  });
});
