// A ficha do atleta: idade, aniversários, histórico de lesões e evolução
// física. Todas estas funções têm uma regra que não se vê no resultado — e é
// sempre a mesma: NÃO inventar um dado que não se tem.

import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestState, atleta } from './helpers.js';
import { state } from '../src/store.js';
import {
  playerAge, nextBirthday, playersWithoutBirthday, birthdayCalendar,
  injuryStats, playerInjurySummary, episodeReturnDays,
  playerTestProgress, bmi, squadRetention,
} from '../src/compute.js';

beforeEach(() => {
  resetTestState();
  state.teams = [{ id: 't1', escalao: 'Juvenis' }];
});

describe('playerAge', () => {
  const anoAtual = new Date().getFullYear();

  it('com data completa dá a idade REAL e marca-a como exata', () => {
    const ontem = new Date();
    ontem.setFullYear(ontem.getFullYear() - 16);
    ontem.setDate(ontem.getDate() - 1);
    expect(playerAge({ birth_date: ontem.toISOString().slice(0, 10) })).toEqual({ age: 16, exact: true });
  });

  it('quem ainda não fez anos este ano tem menos um ano', () => {
    const amanha = new Date();
    amanha.setFullYear(amanha.getFullYear() - 16);
    amanha.setDate(amanha.getDate() + 2);
    expect(playerAge({ birth_date: amanha.toISOString().slice(0, 10) }).age).toBe(15);
  });

  it('só com o ano dá a idade do ano civil e NÃO se apresenta como exata', () => {
    // É a idade que conta para o escalão e a única que os dados sustentam —
    // por isso a app mostra-a com "~". Marcá-la como exata era prometer uma
    // precisão que a ficha não tem.
    const r = playerAge({ birth_year: anoAtual - 14 });
    expect(r).toEqual({ age: 14, exact: false });
  });

  it('a data completa ganha ao ano quando os dois existem', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    d.setDate(d.getDate() - 1);
    const r = playerAge({ birth_date: d.toISOString().slice(0, 10), birth_year: 1990 });
    expect(r).toEqual({ age: 16, exact: true });
  });

  it('recusa datas impossíveis em vez de devolver um número absurdo', () => {
    expect(playerAge({ birth_year: 1800 })).toBeNull();
    expect(playerAge({ birth_year: 2500 })).toBeNull();
    expect(playerAge({})).toBeNull();
    expect(playerAge(null)).toBeNull();
  });
});

describe('nextBirthday', () => {
  it('hoje são zero dias, não trezentos e sessenta e cinco', () => {
    const hoje = new Date(2026, 4, 10);
    const r = nextBirthday({ birth_date: '2010-05-10' }, hoje);
    expect(r.days).toBe(0);
    expect(r.turning).toBe(16);
  });

  it('um aniversário já passado salta para o ano seguinte', () => {
    const r = nextBirthday({ birth_date: '2010-01-05' }, new Date(2026, 4, 10));
    expect(r.date.getFullYear()).toBe(2027);
    expect(r.turning).toBe(17);
  });

  it('sem data não se inventa nenhuma', () => {
    // De um ano não se inventa um dia: dar os parabéns na altura errada é
    // pior do que não dar.
    expect(nextBirthday({ birth_year: 2010 })).toBeNull();
  });
});

describe('quem falta preencher', () => {
  it('separa "mês calmo" de "metade do plantel sem data"', () => {
    state.players = [
      atleta('p1', { birth_date: '2010-03-02' }),
      atleta('p2', { birth_year: 2010 }),
      atleta('p3', {}),
    ];
    expect(birthdayCalendar()).toHaveLength(1);
    expect(playersWithoutBirthday().map((p) => p.id)).toEqual(['p2', 'p3']);
  });
});

describe('histórico de lesões', () => {
  const ep = (id, extra) => ({
    id, player_id: 'p1', body_area: 'Tornozelo', status: 'alta',
    injury_date: '2026-01-01', discharge_date: '2026-01-21', ...extra,
  });

  it('só conta para a média os episódios com alta e com as duas datas', () => {
    // Incluir os que ainda decorrem dava um tempo de retorno mais curto do
    // que o real — exatamente ao contrário do que a pergunta quer saber.
    expect(episodeReturnDays(ep('e1'))).toBe(20);
    expect(episodeReturnDays(ep('e2', { discharge_date: null }))).toBeNull();
    expect(episodeReturnDays(ep('e3', { injury_date: null }))).toBeNull();
  });

  it('datas trocadas não contam', () => {
    expect(episodeReturnDays(ep('e4', { injury_date: '2026-02-01', discharge_date: '2026-01-01' }))).toBeNull();
  });

  it('recidiva é o MESMO atleta a repetir a MESMA zona', () => {
    state.clinicalEpisodes = [
      ep('e1'),
      ep('e2', { player_id: 'p1' }),               // mesma zona, mesmo atleta
      ep('e3', { player_id: 'p2' }),               // mesma zona, outro atleta
      ep('e4', { player_id: 'p1', body_area: 'Ombro' }),
    ];
    const zonas = injuryStats();
    const tornozelo = zonas.find((z) => z.zona === 'Tornozelo');
    expect(tornozelo.episodios).toBe(3);
    expect(tornozelo.atletas).toBe(2);
    expect(tornozelo.recidivas).toBe(1);
    // A lista abre pela zona mais problemática.
    expect(zonas[0].zona).toBe('Tornozelo');
  });

  it('episódios em curso contam como ativos mas não na média de dias', () => {
    state.clinicalEpisodes = [
      ep('e1'),
      ep('e2', { status: 'ativo', discharge_date: null }),
    ];
    const [z] = injuryStats();
    expect(z.ativos).toBe(1);
    expect(z.comAlta).toBe(1);
    expect(z.diasMedios).toBe(20);
  });

  it('um episódio sem zona indicada não desaparece da estatística', () => {
    state.clinicalEpisodes = [ep('e1', { body_area: '  ' })];
    expect(injuryStats()[0].zona).toBe('Sem zona indicada');
  });

  it('o resumo do atleta aponta as zonas que se repetiram', () => {
    state.clinicalEpisodes = [ep('e1'), ep('e2'), ep('e3', { body_area: 'Joelho' })];
    const r = playerInjurySummary('p1');
    expect(r.total).toBe(3);
    expect(r.zonasRepetidas).toEqual([{ zona: 'Tornozelo', n: 2 }]);
  });
});

describe('playerTestProgress', () => {
  const teste = (type, date, value, extra = {}) => ({ player_id: 'p1', type, date, value, ...extra });

  it('a DIREÇÃO da melhoria não é o sinal do número', () => {
    // Subir 3 cm no CMJ é bom; subir 0,3 s no sprint é mau. É o `better` de
    // cada teste que decide, não o sinal da variação.
    state.physicalTests = [
      teste('cmj', '2026-01-01', 37),
      teste('cmj', '2026-06-01', 41),
      teste('sprint_20m', '2026-01-01', 3.1),
      teste('sprint_20m', '2026-06-01', 3.4),
    ];
    const out = playerTestProgress('p1');
    expect(out.find((t) => t.type === 'cmj')).toMatchObject({ delta: 4, direction: 'melhor' });
    expect(out.find((t) => t.type === 'sprint_20m')).toMatchObject({ direction: 'pior' });
  });

  it('sem `better` declarado mostra a variação SEM juízo de valor', () => {
    // Um IMC que sobe pode ser massa muscular ganha. Chamar-lhe "pior" seria
    // dizer ao preparador uma coisa que os dados não sustentam.
    state.physicalTests = [teste('imc', '2026-01-01', 21), teste('imc', '2026-06-01', 22.5)];
    expect(playerTestProgress('p1')[0]).toMatchObject({ direction: 'neutro', better: null });
  });

  it('uma medição só não tem evolução nenhuma', () => {
    state.physicalTests = [teste('cmj', '2026-01-01', 37)];
    expect(playerTestProgress('p1')[0]).toMatchObject({ delta: null, direction: null, medicoes: 1 });
  });

  it('dois "outro" com etiquetas diferentes são testes diferentes', () => {
    state.physicalTests = [
      teste('outro', '2026-01-01', 10, { label: 'Prancha' }),
      teste('outro', '2026-06-01', 20, { label: 'Prancha' }),
      teste('outro', '2026-01-01', 5, { label: 'Flexões' }),
    ];
    const out = playerTestProgress('p1');
    expect(out).toHaveLength(2);
    expect(out.find((t) => t.label === 'Prancha').delta).toBe(10);
  });

  it('a série é ordenada por data, mesmo que chegue baralhada', () => {
    state.physicalTests = [
      teste('cmj', '2026-06-01', 41),
      teste('cmj', '2026-01-01', 37),
      teste('cmj', '2026-03-01', 39),
    ];
    const [t] = playerTestProgress('p1');
    expect(t.first.value).toBe(37);
    expect(t.last.value).toBe(41);
    expect(t.delta).toBe(4);
  });

  it('uma medição sem valor não entra na evolução', () => {
    state.physicalTests = [
      teste('cmj', '2026-01-01', 37),
      teste('cmj', '2026-03-01', null),
      teste('cmj', '2026-06-01', 41),
    ];
    expect(playerTestProgress('p1')[0].medicoes).toBe(2);
  });
});

describe('bmi', () => {
  it('calcula a partir do perfil físico', () => {
    state.physicalProfiles = [{ player_id: 'p1', height_cm: 170, weight_kg: 62 }];
    expect(bmi('p1')).toBeCloseTo(21.5, 1);
  });

  it('sem altura ou sem peso devolve null em vez de zero ou infinito', () => {
    state.physicalProfiles = [{ player_id: 'p1', height_cm: null, weight_kg: 62 }];
    expect(bmi('p1')).toBeNull();
    expect(bmi('nao-existe')).toBeNull();
  });
});

describe('squadRetention', () => {
  it('os pendentes contam para o denominador, de propósito', () => {
    // Mede a DECISÃO do coordenador. Tirar os pendentes da conta dava 100% a
    // um plantel onde ainda não se decidiu nada.
    state.players = [
      atleta('p1', { review_status: 'mantem' }),
      atleta('p2', { review_status: 'mantem' }),
      atleta('p3', { review_status: 'sai' }),
      atleta('p4', {}),
    ];
    expect(squadRetention()).toMatchObject({ total: 4, mantem: 2, sai: 1, pendente: 1, pct: 50 });
  });

  it('um plantel vazio não dá divisão por zero', () => {
    expect(squadRetention()).toMatchObject({ total: 0, pct: 0 });
  });
});
