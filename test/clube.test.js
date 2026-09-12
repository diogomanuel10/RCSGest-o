// Regras do clube: janela de resposta, contas, balanço, artigos e tamanhos,
// e o `safeUrl` que decide se um endereço colado num campo de texto vira ou
// não um link clicável.

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestState, dayOffset, evento, atleta } from './helpers.js';
import { state } from '../src/store.js';
import {
  eventResponseWindow, canRespondToEvent, clubRecord, teamRecord,
  financialSummary, quotasOwed, totalRaised, playerQuotas,
  escaloes, positions, sortSizes, articleLabel, equipmentArticles, articlePrice,
} from '../src/compute.js';
import { safeUrl, linkHost } from '../src/ui.js';

// Um evento daqui a N horas.
function daqui(horas, extra = {}) {
  const d = new Date(Date.now() + horas * 3600000);
  return {
    id: 'e1', type: 'treino', team_id: 't1',
    date: d.toISOString().slice(0, 10),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    ...extra,
  };
}

beforeEach(() => {
  resetTestState();
  state.teams = [{ id: 't1', escalao: 'Juvenis' }];
});

describe('janela de resposta', () => {
  it('o treino fecha 6 horas antes de começar', () => {
    // Uma falta avisada à hora do treino não é um aviso: quem treina já saiu
    // de casa com o plano feito e já não chama ninguém.
    expect(eventResponseWindow(daqui(8)).open).toBe(true);
    expect(eventResponseWindow(daqui(3)).open).toBe(false);
    expect(eventResponseWindow(daqui(8)).lead).toBe(6);
  });

  it('o jogo aceita resposta até começar', () => {
    // Numa convocatória, saber tarde é melhor do que não saber.
    expect(eventResponseWindow(daqui(1, { type: 'jogo' })).open).toBe(true);
    expect(eventResponseWindow(daqui(-1, { type: 'jogo' })).open).toBe(false);
  });

  it('marca os eventos já começados', () => {
    expect(eventResponseWindow(daqui(-2)).started).toBe(true);
    expect(eventResponseWindow(daqui(2)).started).toBe(false);
  });
});

describe('canRespondToEvent', () => {
  const jogadora = atleta('p1');

  it('um evento da equipa dela aceita resposta', () => {
    expect(canRespondToEvent(jogadora, evento('e1'))).toBe(true);
  });

  it('um evento DO CLUBE não: o servidor recusa-o', () => {
    // O RLS deixa ver o evento sem equipa, mas o `respond_to_event` recusa-o.
    // Sem esta verificação o portal desenhava um botão cuja única função era
    // dar erro ao ser carregado.
    expect(canRespondToEvent(jogadora, evento('e1', { team_id: null }))).toBe(false);
  });

  it('um evento de outra equipa não', () => {
    expect(canRespondToEvent(jogadora, evento('e1', { team_id: 't2' }))).toBe(false);
  });

  it('uma atleta sem equipa responde aos eventos sem equipa', () => {
    // A mesma comparação do servidor (`is distinct from`): sem equipa de um
    // lado e sem equipa do outro continua a ser a mesma coisa.
    expect(canRespondToEvent(atleta('p1', { team_id: null }), evento('e1', { team_id: null }))).toBe(true);
  });
});

describe('balanço competitivo', () => {
  function jogoCom(id, setsFor, setsAgainst, teamId = 't1', dias = -1) {
    state.events.push(evento(id, { type: 'jogo', team_id: teamId, date: dayOffset(dias) }));
    state.gameResults.push({ event_id: id, sets_for: setsFor, sets_against: setsAgainst });
  }

  it('conta vitórias e derrotas e devolve a forma recente', () => {
    jogoCom('j1', 3, 0, 't1', -5);
    jogoCom('j2', 1, 3, 't1', -3);
    jogoCom('j3', 3, 2, 't1', -1);
    const r = clubRecord();
    expect(r).toMatchObject({ vitorias: 2, derrotas: 1, jogos: 3 });
    // A forma vem do mais recente para trás.
    expect(r.recentes).toEqual([true, false, true]);
  });

  it('um jogo sem resultado registado não conta', () => {
    jogoCom('j1', 3, 0);
    state.events.push(evento('j2', { type: 'jogo' }));
    expect(clubRecord().jogos).toBe(1);
  });

  it('o registo por equipa não mistura equipas', () => {
    jogoCom('j1', 3, 0, 't1');
    jogoCom('j2', 0, 3, 't2');
    expect(teamRecord('t1')).toMatchObject({ vitorias: 1, derrotas: 0 });
  });
});

describe('contas', () => {
  it('separa o livro-razão das quotas e só soma as quotas PAGAS', () => {
    state.financialEntries = [
      { type: 'receita', amount: 1000 },
      { type: 'despesa', amount: 400 },
    ];
    state.quotas = [
      { player_id: 'p1', valor: 25, pago: true },
      { player_id: 'p1', valor: 25, pago: false },
    ];
    const f = financialSummary();
    expect(f).toMatchObject({ income: 1000, expenses: 400, quotas: 25, balance: 600 });
    expect(f.totalBalance).toBe(625);
    expect(quotasOwed()).toMatchObject({ total: 25, count: 1 });
  });

  it('o total angariado é o dos patrocínios CONFIRMADOS', () => {
    state.sponsors = [
      { status: 'confirmado', tier: 'ouro' },
      { status: 'confirmado', tier: 'prata' },
      { status: 'email', tier: 'ouro' },             // em curso: não conta
      { status: 'confirmado', tier: null },          // sem nível: conta 0
    ];
    expect(totalRaised()).toBe(4500);
  });

  it('as quotas de um atleta vêm da mais recente para a mais antiga', () => {
    state.quotas = [
      { player_id: 'p1', ano: 2026, mes: 9, valor: 25, pago: false },
      { player_id: 'p1', ano: 2026, mes: 11, valor: 25, pago: true },
      { player_id: 'p1', ano: 2027, mes: 1, valor: 25, pago: false },
      { player_id: 'p2', ano: 2026, mes: 9, valor: 25, pago: false },
    ];
    const q = playerQuotas('p1');
    expect(q.list.map((x) => `${x.ano}-${x.mes}`)).toEqual(['2027-1', '2026-11', '2026-9']);
    expect(q.owed).toBe(50);
  });
});

describe('listas configuráveis', () => {
  it('escalões e posições recorrem às listas por omissão quando vazios', () => {
    expect(escaloes().length).toBeGreaterThan(0);
    expect(positions().length).toBeGreaterThan(0);
  });

  it('as posições derivam da MODALIDADE enquanto não forem personalizadas', () => {
    // Mudar de modalidade muda logo as posições, sem seed nenhum.
    state.settings.sport = 'futebol';
    const futebol = positions();
    state.settings.sport = 'voleibol';
    expect(positions()).not.toEqual(futebol);
  });

  it('uma lista personalizada sobrepõe-se à da modalidade', () => {
    state.settings.positions = ['Ponta', 'Central'];
    expect(positions()).toEqual(['Ponta', 'Central']);
  });
});

describe('artigos e tamanhos de equipamento', () => {
  beforeEach(() => {
    state.settings.equipment_articles = [
      { key: 'meias', label: 'Meias', active: true, sizes: ['35-38', '39-42'], price: 6 },
      { key: 'blusao', label: 'Casaco', active: false, sizes: ['S', 'M', 'L'] },
      { key: 'camisola', label: 'Camisola', active: true, sizes: [], price: 0 },
    ];
  });

  it('um artigo desativado sai das listas mas a etiqueta sobrevive', () => {
    // Sem isto, um pedido de dezembro passava a dizer `blusao` no lugar de
    // "Casaco" no dia em que o artigo saísse de circulação.
    expect(equipmentArticles().map((a) => a.key)).toEqual(['meias', 'camisola']);
    expect(articleLabel('blusao')).toBe('Casaco');
  });

  it('uma chave desconhecida devolve a própria chave em vez de vazio', () => {
    expect(articleLabel('coisa_qualquer')).toBe('coisa_qualquer');
  });

  it('zero e "sem preço" são coisas diferentes', () => {
    // Zero é "o clube dá de graça" (um número, que soma); a ausência é
    // "ainda não sei quanto custa", e um orçamento que a engula em silêncio é
    // um número que alguém leva à direção a pensar que está fechado.
    expect(articlePrice(equipmentArticles().find((a) => a.key === 'camisola'))).toBe(0);
    expect(articlePrice(equipmentArticles().find((a) => a.key === 'meias'))).toBe(6);
    expect(articlePrice({ key: 'x' })).toBeNull();
  });

  it('a ordem dos tamanhos é a que o coordenador escreveu', () => {
    // É ela que diz que XS vem antes de S, sem a app ter de conhecer escala
    // nenhuma.
    const meias = equipmentArticles().find((a) => a.key === 'meias');
    expect(sortSizes(['39-42', '35-38'], meias)).toEqual(['35-38', '39-42']);
  });

  it('um tamanho registado antes de o artigo mudar vai para o FIM, não desaparece', () => {
    const meias = equipmentArticles().find((a) => a.key === 'meias');
    expect(sortSizes(['43-46', '39-42', '35-38'], meias)).toEqual(['35-38', '39-42', '43-46']);
  });

  it('sem lista declarada ordena de forma natural (10 depois de 9)', () => {
    expect(sortSizes(['12', '9', '10'], { sizes: [] })).toEqual(['9', '10', '12']);
  });
});

describe('safeUrl', () => {
  it('assume https a quem escreve só o domínio', () => {
    expect(safeUrl('youtube.com/watch')).toBe('https://youtube.com/watch');
  });

  it('recusa tudo o que não seja http(s)', () => {
    // Um `javascript:` colado num campo de texto corria no primeiro clique de
    // quem abrisse o plano de treino.
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>')).toBeNull();
    expect(safeUrl('vbscript:msgbox')).toBeNull();
    expect(safeUrl('file:///etc/passwd')).toBeNull();
  });

  it('ignora espaços e valores vazios', () => {
    expect(safeUrl('  ')).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl('  https://exemplo.pt  ')).toBe('https://exemplo.pt/');
  });

  it('o nome curto tira o www', () => {
    expect(linkHost('https://www.youtube.com/watch?v=1')).toBe('youtube.com');
    expect(linkHost('javascript:alert(1)')).toBe('');
  });
});
