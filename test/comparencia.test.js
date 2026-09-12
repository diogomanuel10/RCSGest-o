// Comparência: a queda individual e o cruzamento treino × jogo.
//
// São os dois números do Painel que existem precisamente por a média não os
// mostrar. Um erro aqui não dá exceção nenhuma — dá uma lista vazia onde devia
// estar o nome de quem está a desistir, ou meio plantel assinalado numa lista
// que, a partir daí, ninguém volta a ler.

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestState, dayOffset, evento, atleta } from './helpers.js';
import { state } from '../src/store.js';
import {
  playerAttendanceDrop, attendanceDrops, attendanceStats,
  trainingVsPlayingGaps, playerGameShare, playerAttendanceStats,
} from '../src/compute.js';

// Monta N treinos passados (o índice 0 é o mais antigo) com o estado indicado
// para o atleta. `null` = treino por fechar, sem registo nenhum.
function treinos(estados, playerId = 'p1') {
  state.events = estados.map((_, i) => evento(`e${i}`, { date: dayOffset(-(estados.length - i)) }));
  state.attendances = estados
    .map((st, i) => (st ? { id: `a${i}`, event_id: `e${i}`, player_id: playerId, status: st } : null))
    .filter(Boolean);
}

beforeEach(() => {
  resetTestState();
  state.teams = [{ id: 't1', escalao: 'Juvenis', gender: 'F' }];
  state.players = [atleta('p1')];
});

describe('playerAttendanceDrop', () => {
  it('devolve null sem termo de comparação', () => {
    // Sem treinos anteriores suficientes não há queda — há só um número.
    treinos(['presente', 'presente', 'falta']);
    expect(playerAttendanceDrop('p1')).toBeNull();
  });

  it('não conta os treinos por fechar como faltas', () => {
    // O treino que o treinador ainda não marcou não é uma falta do atleta.
    // Contá-lo como tal inventava uma queda em cada semana mal fechada.
    treinos([
      'presente', 'presente', 'presente', 'presente', 'presente', 'presente', 'presente',
      null, null, null, null, null,
    ]);
    const d = playerAttendanceDrop('p1');
    expect(d.recente).toBe(100);
    expect(d.treinosRecentes + d.treinosAnteriores).toBe(7);
  });

  it('mede a queda entre a janela recente e a anterior', () => {
    treinos([
      'presente', 'presente', 'presente', 'presente', 'presente',  // anteriores: 100%
      'falta', 'falta', 'falta', 'falta', 'presente',              // recentes: 20%
    ]);
    const d = playerAttendanceDrop('p1');
    expect(d.anterior).toBe(100);
    expect(d.recente).toBe(20);
    expect(d.delta).toBe(-80);
  });

  it('o atraso conta como ter comparecido', () => {
    // Quem chegou tarde apareceu. Contar o atraso como falta transformava um
    // problema de pontualidade numa desistência.
    treinos(['presente', 'presente', 'presente', 'atraso', 'atraso', 'atraso', 'atraso']);
    expect(playerAttendanceDrop('p1').recente).toBe(100);
  });

  it('uma justificada quebra a série de faltas seguidas', () => {
    // A série mede o hábito perdido. Uma falta avisada é o contrário disso:
    // é alguém que continua a falar com o clube.
    treinos(['presente', 'presente', 'presente', 'falta', 'justificado', 'falta', 'falta']);
    expect(playerAttendanceDrop('p1').faltasSeguidas).toBe(2);
  });
});

describe('attendanceDrops', () => {
  it('assinala a queda de hábito', () => {
    treinos([
      'presente', 'presente', 'presente', 'presente', 'presente',
      'falta', 'falta', 'falta', 'falta', 'falta',
    ]);
    const out = attendanceDrops();
    expect(out).toHaveLength(1);
    expect(out[0].motivo).toBe('queda');
  });

  it('assinala faltas seguidas mesmo com média anterior alta', () => {
    // O caso que a média esconde: vinha a tudo, faltou às últimas três. A
    // média da época mal mexe, e é aqui que ainda se vai a tempo.
    treinos([
      'presente', 'presente', 'presente', 'presente', 'presente',
      'presente', 'presente', 'falta', 'falta', 'falta',
    ]);
    const out = attendanceDrops();
    expect(out).toHaveLength(1);
    expect(out[0].faltasSeguidas).toBe(3);
  });

  it('não assinala quem nunca vinha: sem hábito não há hábito quebrado', () => {
    treinos([
      'falta', 'falta', 'falta', 'falta', 'presente',
      'falta', 'presente', 'falta', 'presente', 'falta',
    ]);
    // A base anterior (40%) está abaixo do limiar de "havia hábito" (60%), e
    // as faltas seguidas mais recentes são só uma.
    expect(attendanceDrops()).toHaveLength(0);
  });

  it('respeita os limiares configurados nas Definições', () => {
    // Duas faltas seguidas, com queda pequena de mais para o limiar de hábito
    // (60% recente contra 80% anterior). Com o valor por omissão não entra;
    // um clube mais exigente baixa o limiar e passa a entrar.
    treinos([
      'presente', 'presente', 'falta', 'presente', 'presente',
      'presente', 'presente', 'presente', 'falta', 'falta',
    ]);
    expect(attendanceDrops()).toHaveLength(0);
    state.settings.drop_faltas_seguidas = 2;
    expect(attendanceDrops()).toHaveLength(1);
  });
});

describe('attendanceStats', () => {
  it('conta o atraso como presença e ignora estados desconhecidos', () => {
    state.events = [evento('e1')];
    state.attendances = [
      { event_id: 'e1', player_id: 'p1', status: 'presente' },
      { event_id: 'e1', player_id: 'p1', status: 'atraso' },
      { event_id: 'e1', player_id: 'p1', status: 'falta' },
      { event_id: 'e1', player_id: 'p1', status: 'justificado' },
    ];
    const s = attendanceStats();
    expect(s.total).toBe(4);
    expect(s.rate).toBe(50);
  });

  it('sem registos devolve null em vez de zero', () => {
    // Zero por cento e "ainda não há dados" são coisas diferentes, e mostrar
    // 0% a um clube que acabou de entrar é dar-lhe uma má notícia inventada.
    expect(attendanceStats().rate).toBeNull();
  });
});

describe('playerGameShare', () => {
  function jogo(id, sets, minutos) {
    state.events.push(evento(id, { type: 'jogo' }));
    sets.forEach((s, i) =>
      state.gameSets.push({ event_id: id, set_number: i + 1, points_for: s[0], points_against: s[1] }));
    minutos.forEach((m) => state.gameMinutes.push({ event_id: id, ...m }));
  }

  it('sem parciais não há denominador: share é null e não zero', () => {
    // Preferir não mostrar nada a inventar uma percentagem.
    state.events = [evento('j1', { type: 'jogo' })];
    state.gameMinutes = [{ event_id: 'j1', player_id: 'p1', points: 40 }];
    expect(playerGameShare('p1').share).toBeNull();
  });

  it('um jogo sem NENHUM registo de participação não entra na conta', () => {
    // Contá-lo como "zero pontos" penalizava o atleta pelo registo que o
    // treinador ainda não fez.
    state.events = [];
    jogo('j1', [[25, 20], [25, 18]], [{ player_id: 'p1', points: 40 }]);
    jogo('j2', [[25, 22], [25, 20]], []);
    const s = playerGameShare('p1');
    expect(s.jogos).toBe(1);
    // O denominador é o jogo inteiro (os dois lados): 45 + 43.
    expect(s.totais).toBe(88);
  });

  it('quem não tem linha num jogo COM registo é porque não jogou', () => {
    state.events = [];
    jogo('j1', [[25, 20]], [{ player_id: 'p2', points: 45 }]);
    const s = playerGameShare('p1');
    expect(s.jogos).toBe(1);
    expect(s.jogados).toBe(0);
    expect(s.share).toBe(0);
  });

  it('limita os pontos ao total do jogo (engano de digitação)', () => {
    // Sem o limite, um "450" digitado a mais dava um "222%" a passar por
    // análise no perfil do atleta.
    state.events = [];
    jogo('j1', [[25, 20]], [{ player_id: 'p1', points: 450 }]);
    expect(playerGameShare('p1').share).toBe(100);
  });
});

describe('trainingVsPlayingGaps', () => {
  // Vem a tudo e quase não joga: 10 treinos todos presentes, 3 jogos com
  // participação residual.
  function cenario({ presencas, pontosPorJogo }) {
    state.events = [];
    state.attendances = [];
    state.gameSets = [];
    state.gameMinutes = [];
    presencas.forEach((st, i) => {
      state.events.push(evento(`t${i}`, { date: dayOffset(-(20 - i)) }));
      state.attendances.push({ event_id: `t${i}`, player_id: 'p1', status: st });
    });
    pontosPorJogo.forEach((pts, i) => {
      state.events.push(evento(`j${i}`, { type: 'jogo', date: dayOffset(-(10 - i)) }));
      state.gameSets.push({ event_id: `j${i}`, set_number: 1, points_for: 25, points_against: 20 });
      state.gameSets.push({ event_id: `j${i}`, set_number: 2, points_for: 25, points_against: 20 });
      state.gameMinutes.push({ event_id: `j${i}`, player_id: 'p1', points: pts });
      state.gameMinutes.push({ event_id: `j${i}`, player_id: 'p2', points: 40 });
    });
  }

  it('assinala quem vem sempre e quase não joga', () => {
    cenario({ presencas: Array(10).fill('presente'), pontosPorJogo: [4, 2, 3] });
    const out = trainingVsPlayingGaps();
    expect(out).toHaveLength(1);
    expect(out[0].presenca).toBe(100);
    expect(out[0].gap).toBeGreaterThan(90);
  });

  it('não assinala quem joga muito, por muito que treine', () => {
    cenario({ presencas: Array(10).fill('presente'), pontosPorJogo: [45, 40, 42] });
    expect(trainingVsPlayingGaps()).toHaveLength(0);
  });

  it('exige dados dos dois lados: 2 jogos não dizem nada a ninguém', () => {
    cenario({ presencas: Array(10).fill('presente'), pontosPorJogo: [2, 3] });
    expect(trainingVsPlayingGaps()).toHaveLength(0);
  });

  it('exige treinos que cheguem', () => {
    cenario({ presencas: Array(4).fill('presente'), pontosPorJogo: [2, 3, 1] });
    expect(playerAttendanceStats('p1').total).toBe(4);
    expect(trainingVsPlayingGaps()).toHaveLength(0);
  });
});
