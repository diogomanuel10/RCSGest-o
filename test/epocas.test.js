// A época como dimensão dos dados (ver `supabase/epocas.sql`).
//
// O que se testa aqui é o carimbo na ESCRITA, que é a parte que não se vê: a
// leitura filtrada nota-se logo (o ecrã fica vazio), mas um registo criado
// dentro de uma época anterior e gravado na corrente desaparece do ecrã onde
// acabou de ser escrito — e quem o escreveu conclui que a gravação falhou.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// O cliente Supabase é substituído por um duplo que apenas guarda o que lhe
// foi mandado inserir. Não há rede; o que está em teste é o payload.
const inserido = [];
vi.mock('../src/supabase.js', () => {
  const resultado = (data) => ({
    select: () => ({
      single: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }),
      then: (fn) => fn({ data: Array.isArray(data) ? data : [data], error: null }),
    }),
  });
  return {
    isConfigured: true,
    supabase: {
      from: (table) => ({
        insert: (values) => {
          inserido.push({ table, values });
          return resultado(Array.isArray(values) ? values.map((v, i) => ({ id: `n${i}`, ...v })) : { id: 'n0', ...values });
        },
      }),
    },
  };
});

// Os avisos de confirmação escrevem no DOM, que aqui não existe — e não é o
// que está em teste.
vi.mock('../src/toast.js', () => ({ toastOk: () => {}, toastError: () => {} }));

const { state, createRow, createRows, isCurrentSeason } = await import('../src/store.js');
const { resetTestState } = await import('./helpers.js');

beforeEach(() => {
  inserido.length = 0;
  resetTestState();
  state.season = '2024/2025';                  // a consultar uma época anterior
  state.settings.season = '2026/2027';         // a corrente do clube
  state.seasons = ['2026/2027', '2024/2025'];
  state.seasonsReady = true;
});

describe('isCurrentSeason', () => {
  it('distingue a época de trabalho do arquivo', () => {
    expect(isCurrentSeason()).toBe(false);
    state.season = '2026/2027';
    expect(isCurrentSeason()).toBe(true);
  });

  it('sem a migração, tudo é "a época atual"', () => {
    // A app trabalha como sempre trabalhou e a faixa de arquivo não aparece.
    state.seasonsReady = false;
    expect(isCurrentSeason()).toBe(true);
  });
});

describe('carimbo da época na escrita', () => {
  it('uma tabela recortada por época leva a época em CONSULTA', async () => {
    await createRow('events', 'events', { type: 'treino', date: '2025-01-10' });
    expect(inserido[0].values.season).toBe('2024/2025');
  });

  it('uma tabela que atravessa as épocas não leva época nenhuma', () => {
    // Atletas, equipas e a biblioteca persistem: carimbá-los fazia o plantel
    // desaparecer no dia da viragem.
    createRow('players', 'players', { name: 'Ana', team_id: 't1' });
    expect(inserido[0].values).not.toHaveProperty('season');
  });

  it('a inserção em lote carimba TODAS as linhas', async () => {
    await createRows('quotas', 'quotas', [
      { player_id: 'p1', mes: 9, ano: 2024, valor: 25 },
      { player_id: 'p2', mes: 9, ano: 2024, valor: 25 },
    ]);
    expect(inserido[0].values.map((v) => v.season)).toEqual(['2024/2025', '2024/2025']);
  });

  it('uma época escrita à mão pela vista ganha ao carimbo', async () => {
    await createRow('events', 'events', { type: 'jogo', season: '2030/2031' });
    expect(inserido[0].values.season).toBe('2030/2031');
  });

  it('sem a migração não se carimba nada: a coluna não existe', async () => {
    // Mandar uma coluna inexistente fazia falhar a gravação inteira.
    state.seasonsReady = false;
    await createRow('events', 'events', { type: 'treino' });
    expect(inserido[0].values).not.toHaveProperty('season');
  });
});
