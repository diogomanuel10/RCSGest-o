// Dados de exemplo — o clube de demonstração de quem acaba de se registar.
//
// Um clube novo arrancava vazio. Quem entra pela primeira vez — muitas vezes
// um treinador que clicou num link no telemóvel — via ecrãs sem um único
// atleta e fechava a app sem perceber o que ela faz. Um produto que só se
// mostra depois de horas de introdução de dados nunca chega a ser visto.
//
// Estes dados são de mentira mas COERENTES: os treinos já têm presenças, os
// jogos já têm resultado, as quotas têm quem pagou e quem não pagou. É a
// coerência que faz o Painel calcular números reais — comparência, quedas
// individuais, quem treina muito e joga pouco — e são esses números, não as
// listas, que mostram o que a app vale.
//
// Tudo o que é criado fica registado em `settings.demo_seed` (ver
// `supabase/dados-exemplo.sql`), para "Limpar dados de exemplo" apagar
// exatamente isto e mais nada. As presenças, quotas, convocatórias e
// resultados não são registados: caem em cascata com o evento ou o atleta.
//
// Escreve direto no Supabase em vez de usar `createRow`/`createRows`: são
// dezenas de inserções numa operação que é conceptualmente UMA, e cada
// chamada daquelas mostraria um toast e notificaria o store.

import { supabase } from './supabase.js';
import { state, loadAll } from './store.js';
import { escaloes, positions } from './compute.js';

// --- Ingredientes ---------------------------------------------------------

const NOMES_F = [
  'Beatriz Salgado', 'Matilde Ferraz', 'Carolina Pinho', 'Inês Vasconcelos',
  'Mariana Quintas', 'Leonor Abreu', 'Rita Camelo', 'Francisca Bento',
  'Margarida Seixas', 'Ana Coelho', 'Sofia Rebelo', 'Joana Trindade',
];
const NOMES_M = [
  'Tomás Aguiar', 'Rodrigo Peixoto', 'Miguel Barbeitos', 'Afonso Vilar',
  'Duarte Nogueira', 'Gonçalo Estrela', 'Santiago Lares', 'Vicente Mourão',
  'Martim Calheiros', 'Dinis Portela', 'Salvador Roque', 'Lourenço Faria',
];
const ADVERSARIOS = ['AD Sanjoanense', 'CD Feirense', 'GC Vilacondense', 'AA Espinho'];
const PATROCINADORES = [
  { name: 'Talho do Mercado',   category: 'Alimentar',  tier: 'bronze', status: 'confirmado' },
  { name: 'Óticas do Centro',   category: 'Comércio',   tier: 'prata',  status: 'confirmado' },
  { name: 'Construções Aliança', category: 'Construção', tier: 'ouro',   status: 'conversacao' },
];

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Gerador determinístico: o clube de exemplo é sempre igual, o que torna
// qualquer problema reproduzível — e um ecrã de demonstração que muda de
// forma a cada visita é impossível de explicar a alguém.
function makeRandom(seed = 20260818) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

// Um plantel: nomes, números e posições da modalidade do clube.
function buildSquad(teamId, nomes, n, rnd) {
  const pos = positions();
  return nomes.slice(0, n).map((name, i) => ({
    team_id: teamId,
    name,
    number: String(i + 1),
    birth_year: String(2008 + Math.floor(rnd() * 3)),
    position: pos.length ? pos[i % pos.length] : null,
  }));
}

// --- Semear ---------------------------------------------------------------

export function hasDemoData() {
  return Boolean(state.settings?.demo_seed?.teams?.length);
}

// Cria o clube de exemplo. Devolve o registo do que foi semeado.
export async function seedDemoData() {
  // Carrega o estado antes de semear. Vindo do onboarding, `state.settings`
  // ainda é o objeto por omissão — e sem as definições reais o plantel de
  // exemplo saía com posições de voleibol num clube de futsal e com os
  // escalões por omissão em vez dos do clube.
  if (!state.loaded) await loadAll();

  const rnd = makeRandom();
  const hoje = new Date();
  const esc = escaloes();
  // Dois escalões distantes na lista: um de formação e um mais velho. Um clube
  // com "Iniciados A" e "Iniciados B" não mostra que a app gere escalões.
  const escA = esc[Math.min(2, esc.length - 1)] || 'Iniciados';
  const escB = esc[Math.min(4, esc.length - 1)] || 'Juniores';

  const ins = async (table, rows) => {
    const { data, error } = await supabase.from(table).insert(rows).select();
    if (error) throw error;
    return data;
  };

  // 1. Treinadores e equipas.
  const coaches = await ins('coaches', [
    { name: 'Hélder Machado', role: 'Treinador principal', contact: 'helder@exemplo.pt',
      notes: 'Exemplo — podes apagar.' },
    { name: 'Sara Loureiro', role: 'Treinadora adjunta', contact: 'sara@exemplo.pt',
      notes: 'Exemplo — podes apagar.' },
  ]);
  const teams = await ins('teams', [
    { escalao: escA, gender: 'F', coach_id: coaches[0].id },
    { escalao: escB, gender: 'M', coach_id: coaches[1].id },
  ]);
  await ins('team_coaches', [
    { team_id: teams[0].id, coach_id: coaches[0].id, role: 'principal' },
    { team_id: teams[1].id, coach_id: coaches[1].id, role: 'principal' },
  ]);

  // 2. Plantéis.
  const players = await ins('players', [
    ...buildSquad(teams[0].id, NOMES_F, 11, rnd),
    ...buildSquad(teams[1].id, NOMES_M, 10, rnd),
  ]);
  const byTeam = (teamId) => players.filter((p) => p.team_id === teamId);

  // 3. Calendário: quatro semanas passadas de treinos (2/semana por equipa),
  //    a semana que vem, e dois jogos já disputados.
  const eventRows = [];
  for (let semana = -4; semana <= 1; semana++) {
    for (const [i, team] of teams.entries()) {
      for (const [dia, hora] of [[1, '18:30'], [3, '18:30']]) {
        const d = addDays(hoje, semana * 7 + dia - hoje.getDay());
        eventRows.push({
          type: 'treino', title: null, date: iso(d), time: hora,
          end_time: '20:00', team_id: team.id, location: 'Pavilhão Municipal',
        });
      }
      if (semana === -3 || semana === -1) {
        const d = addDays(hoje, semana * 7 + 6 - hoje.getDay());
        eventRows.push({
          type: 'jogo', title: null, date: iso(d), time: '10:00',
          team_id: team.id, opponent: ADVERSARIOS[(i + semana + 4) % ADVERSARIOS.length],
          location: 'Pavilhão Municipal',
        });
      }
    }
  }
  const events = await ins('events', eventRows);

  // 4. Presenças nos treinos JÁ PASSADOS. A distribuição não é aleatória de
  //    ponta a ponta: dois atletas por equipa deixam de aparecer na última
  //    quinzena, para o Painel ter mesmo uma queda de comparência para
  //    assinalar. Um clube de exemplo onde corre tudo bem não mostra nada.
  const passados = events.filter((e) => e.type === 'treino' && new Date(e.date) < hoje);
  const desistentes = new Set([
    byTeam(teams[0].id)[7]?.id, byTeam(teams[0].id)[9]?.id,
    byTeam(teams[1].id)[6]?.id,
  ].filter(Boolean));
  const limite = addDays(hoje, -14);

  const attendances = [];
  for (const ev of passados) {
    for (const p of byTeam(ev.team_id)) {
      const recente = new Date(ev.date) >= limite;
      let status;
      if (desistentes.has(p.id) && recente) status = 'falta';
      else {
        const r = rnd();
        status = r > 0.92 ? 'falta' : r > 0.86 ? 'justificado' : r > 0.80 ? 'atraso' : 'presente';
      }
      attendances.push({
        event_id: ev.id, player_id: p.id, status,
        minutes_late: status === 'atraso' ? 5 + Math.floor(rnd() * 10) : null,
        justification: status === 'justificado' ? 'Consulta médica.' : null,
      });
    }
  }
  await ins('attendances', attendances);

  // 5. Jogos: convocatória, resultado e parciais. Sem parciais o resultado
  //    não tem denominador e a participação não diz nada (ver playerGameShare).
  const jogos = events.filter((e) => e.type === 'jogo');
  for (const [i, jogo] of jogos.entries()) {
    const plantel = byTeam(jogo.team_id);
    const [squad] = await ins('squads', [{ event_id: jogo.id }]);
    await ins('squad_players', plantel.slice(0, 10).map((p, k) => ({
      squad_id: squad.id, player_id: p.id,
      status: k < 6 ? 'titular' : k < 9 ? 'suplente' : 'convocado',
    })));

    const venceu = i % 2 === 0;
    const parciais = venceu
      ? [[25, 21], [23, 25], [25, 19], [25, 22]]
      : [[22, 25], [25, 20], [18, 25], [23, 25]];
    await ins('game_results', [{
      event_id: jogo.id,
      sets_for: venceu ? 3 : 1, sets_against: venceu ? 1 : 3,
      notes: 'Jogo de exemplo.',
    }]);
    await ins('game_sets', parciais.map(([f, a], k) => ({
      event_id: jogo.id, set_number: k + 1, points_for: f, points_against: a,
    })));

    // Participação: os titulares jogam quase tudo, os suplentes pouco. É este
    // contraste que faz aparecer o aviso "treina muito, joga pouco".
    const totalPontos = parciais.reduce((t, [f, a]) => t + f + a, 0);
    await ins('game_minutes', plantel.slice(0, 10).map((p, k) => ({
      event_id: jogo.id, player_id: p.id,
      points: k < 6 ? Math.round(totalPontos * 0.9) : Math.round(totalPontos * 0.12),
    })));
  }

  // 6. Quotas dos últimos três meses, com alguns por pagar.
  const quotas = [];
  for (let atras = 0; atras < 3; atras++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - atras, 1);
    for (const [i, p] of players.entries()) {
      const pago = atras > 0 ? i % 9 !== 0 : i % 3 !== 0;
      quotas.push({
        player_id: p.id, mes: d.getMonth() + 1, ano: d.getFullYear(),
        valor: 15, pago, pago_em: pago ? d.toISOString() : null,
      });
    }
  }
  await ins('quotas', quotas);

  // 7. Patrocínios — é deles que sai o "total angariado" do Painel.
  const sponsors = await ins('sponsors', PATROCINADORES.map((s) => ({
    ...s, contact: 'geral@exemplo.pt', notes: 'Patrocínio de exemplo.',
  })));

  const seed = {
    seeded_at: new Date().toISOString(),
    coaches: coaches.map((r) => r.id),
    teams: teams.map((r) => r.id),
    players: players.map((r) => r.id),
    events: events.map((r) => r.id),
    sponsors: sponsors.map((r) => r.id),
  };
  await setDemoSeed(seed);
  await loadAll();
  return seed;
}

// Grava (ou limpa) a marca do que foi semeado. Escreve direto em vez de usar
// `saveSettings` para não somar um "Definições guardadas" ao aviso da própria
// operação — o utilizador não guardou definições nenhumas.
async function setDemoSeed(seed) {
  const orgId = state.org?.id || state.profile?.org_id;
  const query = supabase.from('settings').update({ demo_seed: seed });
  const { error } = await (orgId ? query.eq('org_id', orgId) : query.eq('id', state.settings.id));
  if (error) throw error;
}

// --- Limpar ---------------------------------------------------------------

// Apaga exatamente o que foi semeado, pelos ids guardados. O que o clube tiver
// criado entretanto — atletas seus numa equipa de exemplo, por exemplo — vai
// com a equipa em cascata, e é por isso que o botão avisa antes.
export async function clearDemoData() {
  const seed = state.settings?.demo_seed;
  if (!seed) return;

  const del = async (table, ids) => {
    if (!ids?.length) return;
    const { error } = await supabase.from(table).delete().in('id', ids);
    if (error) throw error;
  };

  // Ordem segura para as chaves estrangeiras: os filhos primeiro. As
  // presenças, quotas, convocatórias, resultados e participações não são
  // apagadas à mão — caem com o evento ou o atleta.
  await del('events', seed.events);
  await del('players', seed.players);
  await del('teams', seed.teams);
  await del('coaches', seed.coaches);
  await del('sponsors', seed.sponsors);

  await setDemoSeed(null);
  await loadAll();
}
