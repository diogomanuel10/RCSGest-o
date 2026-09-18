// Valores partilhados por toda a aplicação.
// As CHAVES (key) são guardadas na base de dados; as ETIQUETAS (label) são o
// que o utilizador vê. Mantém-nas alinhadas com supabase/schema.sql.

// --- Patrocínios: níveis e respetivo valor para a meta ---
export const TIERS = [
  { key: 'ouro', label: 'Ouro', value: 3000, varColor: '--gold' },
  { key: 'prata', label: 'Prata', value: 1500, varColor: '--silver' },
  { key: 'bronze', label: 'Bronze', value: 500, varColor: '--bronze' },
];

export const TIER_VALUE = Object.fromEntries(TIERS.map((t) => [t.key, t.value]));
export const TIER_LABEL = Object.fromEntries(TIERS.map((t) => [t.key, t.label]));

// --- Patrocínios: categorias ---
export const SPONSOR_CATEGORIES = [
  'Farmácias',
  'Clínicas dentárias',
  'Ginásios',
  'Restaurantes/Cafés',
  'Construção/Imobiliário',
  'Stands automóveis',
  'Outro',
];

// --- Patrocínios: estados do processo de contacto ---
// 'confirmado' conta para o total; é também o estado que exige nível.
export const SPONSOR_STATUSES = [
  { key: 'acontactar', label: 'A contactar', badge: 'muted' },
  { key: 'email', label: 'Email enviado', badge: 'info' },
  { key: 'telefone', label: 'Contactar por telefone', badge: 'warn' },
  { key: 'conversacao', label: 'Em conversação', badge: 'info' },
  { key: 'confirmado', label: 'Confirmado', badge: 'ok' },
  { key: 'recusado', label: 'Recusado', badge: 'danger' },
];

export const STATUS_LABEL = Object.fromEntries(
  SPONSOR_STATUSES.map((s) => [s.key, s.label])
);
export const STATUS_BADGE = Object.fromEntries(
  SPONSOR_STATUSES.map((s) => [s.key, s.badge])
);

// Estados considerados "contactos em curso" (para o painel).
export const IN_PROGRESS_STATUSES = ['email', 'telefone', 'conversacao'];

// --- Plantéis ---
export const GENDERS = [
  { key: 'M', label: 'Masculino' },
  { key: 'F', label: 'Feminino' },
];
export const GENDER_LABEL = Object.fromEntries(GENDERS.map((g) => [g.key, g.label]));

// Escalões por omissão. A lista real é configurável e vive em
// state.settings.escaloes (ver compute.escaloes()); isto é só o ponto de
// partida e o recurso de segurança caso ainda não exista nada guardado.
export const DEFAULT_ESCALOES = [
  'Minis',
  'Infantis',
  'Iniciados',
  'Juvenis',
  'Juniores',
  'Seniores',
];

// Modalidades suportadas. Cada uma traz o seu conjunto de posições por omissão
// (PT-PT). A modalidade do clube guarda-se em settings.sport; as posições em
// vigor obtêm-se por compute.positions() (que recorre a estas se o clube não
// tiver uma lista personalizada). Geridas nas Definições e no onboarding.
export const SPORTS = [
  {
    key: 'voleibol',
    label: 'Voleibol',
    positions: ['Distribuidor', 'Zona 4', 'Central', 'Oposto', 'Líbero', 'Universal'],
  },
  {
    key: 'futebol',
    label: 'Futebol',
    positions: [
      'Guarda-redes', 'Defesa central', 'Defesa direito', 'Defesa esquerdo',
      'Médio defensivo', 'Médio centro', 'Médio ofensivo',
      'Extremo direito', 'Extremo esquerdo', 'Avançado',
    ],
  },
  {
    key: 'futsal',
    label: 'Futsal',
    positions: ['Guarda-redes', 'Fixo', 'Ala direito', 'Ala esquerdo', 'Pivô', 'Universal'],
  },
  {
    key: 'andebol',
    label: 'Andebol',
    positions: [
      'Guarda-redes', 'Ponta esquerda', 'Ponta direita',
      'Lateral esquerdo', 'Lateral direito', 'Central', 'Pivô',
    ],
  },
  {
    key: 'basquetebol',
    label: 'Basquetebol',
    positions: ['Base', 'Escolta', 'Extremo', 'Ala-poste', 'Poste'],
  },
  {
    key: 'outro',
    label: 'Outro',
    positions: [],
  },
];
export const SPORT_LABEL = Object.fromEntries(SPORTS.map((s) => [s.key, s.label]));
export const SPORT_POSITIONS = Object.fromEntries(SPORTS.map((s) => [s.key, s.positions]));
export const DEFAULT_SPORT = 'voleibol';

// Posições por omissão (recurso caso a modalidade seja desconhecida). Mantém a
// retrocompatibilidade com os clubes de voleibol já existentes.
export const DEFAULT_POSITIONS = SPORT_POSITIONS[DEFAULT_SPORT];

// Papel de um treinador dentro de uma equipa.
export const COACH_ROLES = [
  { key: 'principal', label: 'Principal', badge: 'info' },
  { key: 'adjunto', label: 'Adjunto', badge: 'muted' },
];
export const COACH_ROLE_LABEL = Object.fromEntries(
  COACH_ROLES.map((r) => [r.key, r.label])
);
export const COACH_ROLE_BADGE = Object.fromEntries(
  COACH_ROLES.map((r) => [r.key, r.badge])
);

// --- Avaliação de plantel (decisão para a próxima época) ---
export const REVIEW_STATUSES = [
  { key: 'pendente', label: 'Pendente', badge: 'muted' },
  { key: 'mantem', label: 'Mantém', badge: 'ok' },
  { key: 'sai', label: 'Sai', badge: 'danger' },
];
export const REVIEW_LABEL = Object.fromEntries(
  REVIEW_STATUSES.map((s) => [s.key, s.label])
);
export const REVIEW_BADGE = Object.fromEntries(
  REVIEW_STATUSES.map((s) => [s.key, s.badge])
);

// --- Calendário ---
// A `musculacao` é um treino de PREPARAÇÃO FÍSICA e não um treino da equipa:
// é o único tipo cujo plantel não é a equipa toda, mas os atletas escolhidos
// para aquele horário (ver `event_players` e `eventRoster` em compute.js). O
// ginásio tem seis bancos e não vinte, e o horário faz-se por grupos.
export const EVENT_TYPES = [
  { key: 'jogo', label: 'Jogo', badge: 'danger' },
  { key: 'treino', label: 'Treino', badge: 'info' },
  { key: 'musculacao', label: 'Musculação', badge: 'gold' },
  { key: 'evento', label: 'Evento', badge: 'warn' },
];

// Tipos de evento cujo plantel são os atletas ESCOLHIDOS, e não a equipa
// inteira. É uma lista e não um `=== 'musculacao'` espalhado por dez
// ficheiros: a pergunta ("quem é que isto abrange?") é uma só.
export const PICKED_EVENT_TYPES = ['musculacao'];
export const isPickedEvent = (ev) => PICKED_EVENT_TYPES.includes(ev?.type);
export const EVENT_TYPE_LABEL = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.key, t.label])
);
export const EVENT_TYPE_BADGE = Object.fromEntries(
  EVENT_TYPES.map((t) => [t.key, t.badge])
);

// Local pré-preenchido para novos eventos.
export const DEFAULT_LOCATION = 'Pavilhão Municipal da Senhora da Hora';

// --- Presenças ---
export const ATTENDANCE_STATUSES = [
  { key: 'presente',    label: 'Presente',    badge: 'ok',     color: 'green' },
  { key: 'atraso',      label: 'Atraso',      badge: 'warn',   color: 'warn' },
  { key: 'justificado', label: 'Justificado', badge: 'info',   color: 'info' },
  { key: 'falta',       label: 'Falta',       badge: 'danger', color: 'red' },
];
export const ATTENDANCE_LABEL = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.key, s.label])
);
export const ATTENDANCE_BADGE = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.key, s.badge])
);

// Dias da semana para recorrência de treinos (0=Dom, 1=Seg, …, 6=Sáb).
export const WEEKDAYS = [
  { n: 1, label: 'Seg' },
  { n: 2, label: 'Ter' },
  { n: 3, label: 'Qua' },
  { n: 4, label: 'Qui' },
  { n: 5, label: 'Sex' },
  { n: 6, label: 'Sáb' },
  { n: 0, label: 'Dom' },
];

// --- Equipamentos ---
export const EQUIPMENT_CATEGORIES = [
  'Bolas',
  'Redes e postes',
  'Coletes',
  'Cones e material de treino',
  'Uniformes',
  'Material médico',
  // Sala de musculação / ginásio
  'Barras',
  'Kettlebells',
  'Power racks / Bancos',
  'Bolas / Material livre',
  'Discos',
  'Ergómetros',
  'Outro',
];
export const EQUIPMENT_CONDITIONS = [
  { key: 'bom',      label: 'Bom',      badge: 'ok' },
  { key: 'razoavel', label: 'Razoável', badge: 'warn' },
  { key: 'mau',      label: 'Mau',      badge: 'danger' },
];
export const CONDITION_LABEL = Object.fromEntries(
  EQUIPMENT_CONDITIONS.map((c) => [c.key, c.label])
);
export const CONDITION_BADGE = Object.fromEntries(
  EQUIPMENT_CONDITIONS.map((c) => [c.key, c.badge])
);

// --- Quotas ---
export const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// --- Departamento Médico / Fisioterapia ---

// Estado de um episódio clínico (ex.: percurso de uma lesão).
export const EPISODE_STATUSES = [
  { key: 'ativo',       label: 'Ativo',           badge: 'danger' },
  { key: 'recuperacao', label: 'Em recuperação',  badge: 'warn' },
  { key: 'alta',        label: 'Alta',            badge: 'ok' },
];
export const EPISODE_STATUS_LABEL = Object.fromEntries(
  EPISODE_STATUSES.map((s) => [s.key, s.label])
);
export const EPISODE_STATUS_BADGE = Object.fromEntries(
  EPISODE_STATUSES.map((s) => [s.key, s.badge])
);

// Tipo de atendimento de fisioterapia.
export const APPOINTMENT_TYPES = [
  { key: 'avaliacao',   label: 'Avaliação',   badge: 'info' },
  { key: 'tratamento',  label: 'Tratamento',  badge: 'warn' },
  { key: 'reavaliacao', label: 'Reavaliação', badge: 'info' },
];
export const APPOINTMENT_TYPE_LABEL = Object.fromEntries(
  APPOINTMENT_TYPES.map((t) => [t.key, t.label])
);
export const APPOINTMENT_TYPE_BADGE = Object.fromEntries(
  APPOINTMENT_TYPES.map((t) => [t.key, t.badge])
);

// Estado de um atendimento agendado.
export const APPOINTMENT_STATUSES = [
  { key: 'agendado',  label: 'Agendado',  badge: 'info' },
  { key: 'realizado', label: 'Realizado', badge: 'ok' },
  { key: 'faltou',    label: 'Faltou',    badge: 'danger' },
  { key: 'cancelado', label: 'Cancelado', badge: 'muted' },
];
export const APPOINTMENT_STATUS_LABEL = Object.fromEntries(
  APPOINTMENT_STATUSES.map((s) => [s.key, s.label])
);
export const APPOINTMENT_STATUS_BADGE = Object.fromEntries(
  APPOINTMENT_STATUSES.map((s) => [s.key, s.badge])
);

// --- Preparação Física ---

// Mão dominante do atleta.
export const DOMINANT_HANDS = [
  { key: 'direita',    label: 'Direita' },
  { key: 'esquerda',   label: 'Esquerda' },
  { key: 'ambidestra', label: 'Ambidestra' },
];
export const DOMINANT_HAND_LABEL = Object.fromEntries(
  DOMINANT_HANDS.map((h) => [h.key, h.label])
);

// Tipos de teste/avaliação física (antropometria + performance). `unit` é a
// unidade sugerida; `outro` permite etiqueta livre.
//
// `better` diz para que lado do número está a melhoria — sem isso não se pode
// dizer se uma variação é progresso ou regressão: subir 3 cm no CMJ é bom,
// subir 0,3 s no sprint é mau. `null` = depende do contexto (o IMC de um
// atleta a ganhar massa sobe, e isso não é bom nem mau por si só) e nesses
// casos mostra-se a variação sem juízo de valor.
export const PHYSICAL_TEST_TYPES = [
  { key: 'massa_gorda',     label: '% Massa gorda',          unit: '%',  better: 'down' },
  { key: 'massa_muscular',  label: '% Massa muscular',       unit: '%',  better: 'up' },
  { key: 'imc',             label: 'IMC',                    unit: '',   better: null },
  { key: '1rm_peso_morto',  label: '1RM Peso morto',         unit: 'kg', better: 'up' },
  { key: '1rm_agachamento', label: '1RM Agachamento',        unit: 'kg', better: 'up' },
  { key: '1rm_supino',      label: '1RM Supino',             unit: 'kg', better: 'up' },
  { key: 'aperto_mao',      label: 'Preensão — mão dominante', unit: 'kg', better: 'up' },
  { key: 'aperto_mao_nd',   label: 'Preensão — mão não dominante', unit: 'kg', better: 'up' },
  { key: 'salto_bloco',     label: 'Salto em altura (bloco)', unit: 'cm', better: 'up' },
  { key: 'cmj',             label: 'Salto CMJ',              unit: 'cm', better: 'up' },
  { key: 'sprint_20m',      label: 'Sprint 20 m',            unit: 's',  better: 'down' },
  { key: 'outro',           label: 'Outro',                  unit: '',   better: null },
];
export const PHYSICAL_TEST_LABEL = Object.fromEntries(
  PHYSICAL_TEST_TYPES.map((t) => [t.key, t.label])
);
export const PHYSICAL_TEST_UNIT = Object.fromEntries(
  PHYSICAL_TEST_TYPES.map((t) => [t.key, t.unit])
);
export const PHYSICAL_TEST_BETTER = Object.fromEntries(
  PHYSICAL_TEST_TYPES.map((t) => [t.key, t.better])
);

// --- Valores de referência por teste, sexo e idade -------------------------
//
// Uma medição sozinha não diz nada a quem a lê pela primeira vez: "28 kgf" é
// muito ou é pouco? Quem tem a tabela na cabeça sabe; quem está a começar
// escreve o número e fica na mesma. A referência responde a isso e a mais
// nada.
//
// É REFERÊNCIA e não nota. O que interessa é cada atleta melhorar os seus
// próprios índices — a evolução (`playerTestProgress`) é que é o trabalho, e
// isto é o contexto em que ela se lê. Uma atleta em "Baixo" que subiu 4 kgf em
// três meses está a fazer exatamente o que se lhe pede; uma em "Forte" que
// desceu 5 tem um problema que a faixa esconde. Por isso o crachá anda sempre
// acompanhado da palavra "referência" e nunca substitui a variação.
//
// **Só existe o que tem fonte.** Esta tabela é a que o clube forneceu:
// preensão manual, FEMININO. Não há aqui valores para o masculino nem para os
// outros testes, e isso é deliberado — inventar faixas para o CMJ ou para o
// sprint era pôr a app a dizer a uma miúda de 15 anos que está "abaixo do
// normal" com base num número que ninguém mediu. Sem faixa, a app mostra o
// valor e cala-se sobre o resto.
//
// Acrescentar um teste é acrescentar uma entrada aqui, com a sua `source`: a
// fonte é mostrada ao lado do crachá, porque uma referência sem origem é um
// número sem autoridade — e quem a lê tem direito a saber de onde vem.
export const TEST_REFERENCES = {
  // Força de preensão manual (dinamómetro), em kgf.
  aperto_mao: {
    source: 'Revista Brasileira de Cineantropometria & Desempenho Humano',
    note: 'Valores médios esperados, mão dominante.',
    F: [
      { from: 15, to: 19, min: 22, max: 30 },
      { from: 20, to: 29, min: 25, max: 35 },
      { from: 30, to: 39, min: 26, max: 36 },
      { from: 40, to: 49, min: 24, max: 33 },
      { from: 50, to: 59, min: 22, max: 30 },
      { from: 60, to: 69, min: 19, max: 27 },
      { from: 70, to: null, min: 16, max: 23 },
    ],
  },
  aperto_mao_nd: {
    source: 'Revista Brasileira de Cineantropometria & Desempenho Humano',
    note: 'Valores médios esperados, mão não dominante.',
    F: [
      { from: 15, to: 19, min: 20, max: 27 },
      { from: 20, to: 29, min: 22, max: 32 },
      { from: 30, to: 39, min: 23, max: 33 },
      { from: 40, to: 49, min: 21, max: 30 },
      { from: 50, to: 59, min: 20, max: 28 },
      { from: 60, to: 69, min: 18, max: 25 },
      { from: 70, to: null, min: 15, max: 21 },
    ],
  },
};

// Como se lê um valor contra a sua faixa. Três degraus e não cinco: a faixa é
// um intervalo de MÉDIA, e partir "abaixo" em dois graus era fingir uma
// precisão que a tabela não tem.
//
// "Baixo" é âmbar e não vermelho de propósito. Vermelho lê-se como avaria, e
// estar abaixo da média de uma tabela populacional não é uma avaria — numa
// atleta de 15 anos é quase sempre só o ponto de partida.
export const TEST_REFERENCE_LEVELS = {
  baixo:  { label: 'Baixo',  badge: 'warn' },
  normal: { label: 'Normal', badge: 'info' },
  forte:  { label: 'Forte',  badge: 'ok' },
};

// Objetivo dominante de um mesociclo / treino.
export const TRAINING_OBJECTIVES = [
  { key: 'forca',        label: 'Força' },
  { key: 'potencia',     label: 'Potência' },
  { key: 'hipertrofia',  label: 'Hipertrofia' },
  { key: 'resistencia',  label: 'Resistência muscular' },
  { key: 'velocidade',   label: 'Velocidade / agilidade' },
  { key: 'tecnica',      label: 'Técnica' },
  { key: 'prevencao',    label: 'Prevenção de lesões' },
  { key: 'recuperacao',  label: 'Recuperação / regeneração' },
  { key: 'outro',        label: 'Outro' },
];
export const TRAINING_OBJECTIVE_LABEL = Object.fromEntries(
  TRAINING_OBJECTIVES.map((o) => [o.key, o.label])
);

// Tipos de fase do macrociclo (com cor/badge associada).
export const PHASE_TYPES = [
  { key: 'pre_epoca',   label: 'Pré-época',           badge: 'info' },
  { key: 'competitiva', label: 'Período competitivo', badge: 'ok' },
  { key: 'transicao',   label: 'Transição',           badge: 'warn' },
  { key: 'paragem',     label: 'Paragem',             badge: 'muted' },
  { key: 'off_season',  label: 'Off-season',          badge: 'muted' },
  { key: 'fase',        label: 'Fase',                badge: 'info' },
  { key: 'outro',       label: 'Outro',               badge: 'muted' },
];
export const PHASE_TYPE_LABEL = Object.fromEntries(
  PHASE_TYPES.map((p) => [p.key, p.label])
);
export const PHASE_TYPE_BADGE = Object.fromEntries(
  PHASE_TYPES.map((p) => [p.key, p.badge])
);

// Disponibilidade do atleta para treino/jogo (resumo visível ao treinador).
export const AVAILABILITY_STATUSES = [
  { key: 'apto',         label: 'Apto',           badge: 'ok' },
  { key: 'limitado',     label: 'Limitado',       badge: 'warn' },
  { key: 'recuperacao',  label: 'Em recuperação', badge: 'info' },
  { key: 'indisponivel', label: 'Indisponível',   badge: 'danger' },
];
export const AVAILABILITY_LABEL = Object.fromEntries(
  AVAILABILITY_STATUSES.map((s) => [s.key, s.label])
);
export const AVAILABILITY_BADGE = Object.fromEntries(
  AVAILABILITY_STATUSES.map((s) => [s.key, s.badge])
);

// --- Planos de treino ---

// Categorias de tarefas/blocos num plano de treino.
export const PLAN_CATEGORIES = [
  { key: 'aquecimento', label: 'Aquecimento',       badge: 'warn' },
  { key: 'tecnica',     label: 'Técnica',            badge: 'info' },
  { key: 'tatica',      label: 'Tática',             badge: 'ok' },
  { key: 'situacao',    label: 'Situação de jogo',   badge: 'danger' },
  { key: 'retorno',     label: 'Retorno à calma',    badge: 'muted' },
  { key: 'outro',       label: 'Outro',              badge: 'muted' },
];
export const PLAN_CATEGORY_LABEL = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.label]));
export const PLAN_CATEGORY_BADGE = Object.fromEntries(PLAN_CATEGORIES.map((c) => [c.key, c.badge]));

// --- Recrutamento: estados do funil ---
// --- Documentos do atleta ---

export const DOCUMENT_TYPES = [
  { key: 'exame_medico', label: 'Exame Médico',      icon: '🩺', hasExpiry: true  },
  { key: 'seguro',       label: 'Seguro',             icon: '🛡️', hasExpiry: true  },
  { key: 'cc',           label: 'Fotocópia do CC',   icon: '🪪', hasExpiry: false },
];
export const DOC_TYPE_LABEL = Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.key, d.label]));

// --- O que falta na ficha de um atleta ---
//
// Os três dados que o clube precisa de ter para inscrever uma atleta e que o
// coordenador NÃO consegue preencher sozinho: a foto está no telemóvel da
// família, o dia do aniversário está no cartão dela e a fotocópia é um
// ficheiro que alguém tem de digitalizar. São por isso os três que o portal
// pede a quem tem conta ligada à ficha (ver `playerDataGaps` em compute.js).
//
// A ordem é a do esforço que cada um custa a quem responde: a foto tira-se
// ali, a data sabe-se de cor, a fotocópia obriga a ir buscar o cartão.
export const PLAYER_DATA_ITEMS = [
  {
    key: 'foto',
    label: 'Fotografia',
    ask: 'Uma fotografia tua, de frente e com a cara bem visível.',
    action: 'Escolher foto',
  },
  {
    key: 'nascimento',
    label: 'Data de nascimento',
    ask: 'O dia completo — a ficha só tem o ano.',
    action: 'Preencher data',
  },
  {
    key: 'cc',
    label: 'Fotocópia do Cartão de Cidadão',
    ask: 'Uma foto ou digitalização legível do cartão.',
    action: 'Enviar ficheiro',
  },
];
export const PLAYER_DATA_LABEL = Object.fromEntries(PLAYER_DATA_ITEMS.map((i) => [i.key, i.label]));

// --- Tamanhos e artigos de equipamento ---

// Conjunto de tamanhos por omissão para vestuário. Serve de sugestão no
// editor de artigos das Definições — o clube pode escrever os que quiser.
export const TEXT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Artigos de equipamento POR OMISSÃO. A lista em vigor obtém-se por
// `compute.equipmentArticles()`, que usa a do clube (settings.equipment_articles)
// quando existe — um clube que dá joelheiras, ou que compra em tamanhos de
// criança, não cabia numa lista cravada no código.
//
// Cada artigo tem:
//   key    — estável e imutável; é o que fica guardado em player_sizes.sizes
//            e em equipment_requests.article. Mudar a etiqueta não lhe toca,
//            senão renomear "Blusão" para "Casaco" perdia os tamanhos todos.
//   label  — o que se lê no ecrã.
//   sizes  — os tamanhos possíveis. Lista VAZIA = texto livre (é o caso das
//            meias, que se medem em números e variam com a marca).
export const DEFAULT_EQUIPMENT_ARTICLES = [
  { key: 'camisola',        label: 'Camisola',               sizes: TEXT_SIZES },
  { key: 'camisola_alt',    label: 'Camisola Alternativa',   sizes: TEXT_SIZES },
  { key: 'calcoes',         label: 'Calções',                sizes: TEXT_SIZES },
  { key: 'meias',           label: 'Meias',                  sizes: [] },
  { key: 'casaco_treino',   label: 'Casaco Fato de Treino',  sizes: TEXT_SIZES },
  { key: 'calca_treino',    label: 'Calça Fato de Treino',   sizes: TEXT_SIZES },
  { key: 'mochila',         label: 'Mochila',                sizes: TEXT_SIZES },
  { key: 'blusao',          label: 'Blusão',                 sizes: TEXT_SIZES },
  { key: 'camisola_treino', label: 'Camisola de Treino',     sizes: TEXT_SIZES },
];


// --- Pedidos de equipamento (treinador -> clube) ---

// Porque é que se está a pedir. É a informação que faz a diferença entre
// "aprovar" e "recusar" — um par de meias rasgado a meio da época não é o
// mesmo pedido que um blusão a mais.
export const REQUEST_REASONS = [
  { key: 'novo',       label: 'Atleta sem o artigo' },
  { key: 'danificado', label: 'Danificado' },
  { key: 'tamanho',    label: 'Tamanho já não serve' },
  { key: 'perdido',    label: 'Perdido' },
  { key: 'outro',      label: 'Outro motivo' },
];
export const REQUEST_REASON_LABEL = Object.fromEntries(REQUEST_REASONS.map((r) => [r.key, r.label]));

// Percurso de um pedido. São as paragens do circuito real do material, e
// cada uma existe porque muda o que a atleta (ou o clube) tem de fazer a
// seguir:
//
//   pendente    — o clube ainda não decidiu
//   aprovado    — confirmado pelo clube ("Confirmado" é o que se lê)
//   encomendado — pedido ao fornecedor
//   pronto      — chegou ao clube, está à espera de quem o pediu
//   entregue    — está com o atleta
//   recusado    — o fim da linha do outro lado
//
// A regra de sempre não caiu — "um estado a mais é mais um sítio onde um
// pedido fica parado sem ninguém reparar" — mudou de caso: entre "confirmado"
// e "entregue" passavam-se semanas em que a app dizia sempre a mesma coisa, e
// a pergunta ("já foi encomendado? já posso ir buscar?") saía da app para o
// telemóvel, que é o que este módulo veio resolver. `pronto` é a única
// paragem que pede alguma coisa ao ATLETA; `encomendado` é a que responde à
// pergunta da espera. Nenhuma das duas é uma gaveta administrativa.
//
// A chave `aprovado` mantém-se (está guardada em todos os pedidos já feitos);
// só a etiqueta passou a "Confirmado". É a regra dos artigos de equipamento:
// a chave é imutável, a etiqueta é que se lê.
export const REQUEST_STATUSES = [
  { key: 'pendente',    label: 'Por decidir',       badge: 'warn' },
  { key: 'aprovado',    label: 'Confirmado',        badge: 'info' },
  { key: 'encomendado', label: 'Encomendado',       badge: 'info' },
  { key: 'pronto',      label: 'Pronto a levantar', badge: 'gold' },
  { key: 'entregue',    label: 'Entregue',          badge: 'ok' },
  { key: 'recusado',    label: 'Recusado',          badge: 'danger' },
];
export const REQUEST_STATUS_LABEL = Object.fromEntries(REQUEST_STATUSES.map((s) => [s.key, s.label]));

// O passo seguinte de cada paragem, e o rótulo do botão que o dá. Está aqui
// e não na vista porque é a definição do circuito: quem o lê num sítio só vê
// o percurso inteiro de uma vez.
//
// Há DOIS caminhos a partir de "Confirmado" porque há dois casos reais: o
// artigo que o clube tem em armazém passa direto a "pronto a levantar", e o
// que é preciso comprar vai ao fornecedor. Obrigar o material que já está na
// prateleira a passar por "encomendado" seria escrever na app uma encomenda
// que ninguém fez.
export const REQUEST_NEXT_STEPS = {
  pendente:    [{ status: 'aprovado',    label: 'Confirmar' }],
  aprovado:    [
    { status: 'encomendado', label: 'Encomendei ao fornecedor' },
    { status: 'pronto',      label: 'Já está no clube' },
  ],
  encomendado: [{ status: 'pronto',   label: 'Chegou ao clube' }],
  pronto:      [{ status: 'entregue', label: 'Entregue ao atleta' }],
};

// As paragens em que o pedido ainda está vivo: decidido, a caminho, mas ainda
// não nas mãos de quem o pediu. É o que faz a encomenda do atleta no portal e
// o que o clube ainda tem em cima da mesa.
export const REQUEST_IN_FLIGHT = ['aprovado', 'encomendado', 'pronto'];

export const REQUEST_STATUS_BADGE = Object.fromEntries(REQUEST_STATUSES.map((s) => [s.key, s.badge]));

// --- Convocatórias ---

// Uma convocatória tem DUAS respostas: convocado ou não convocado. Ter linha
// em `squad_players` é estar convocado; não ter, é não estar.
//
// Houve `titular` e `suplente` pelo meio, e eram a decisão errada no sítio
// errado. O 6 inicial decide-se no pavilhão, muda no aquecimento e muda outra
// vez a meio do primeiro set — mas o portal do atleta mostrava-o como um facto
// dias antes do jogo, sem conversa nenhuma à volta. E quem jogou mesmo já se
// mede em pontos, no registo do resultado, que é onde isso é verdade.
// Ao treinador só pedia arrumar o plantel em três gavetas para responder a uma
// pergunta de duas.
export const SQUAD_CALLED = 'convocado';

// --- Respostas do atleta a um evento ---
// O mesmo conjunto serve para confirmar uma convocatória e para avisar que
// falta a um treino: do lado de quem treina o problema é o mesmo — saber com
// quem conta.
//
// São só duas. Havia um "Ainda não sei", e ele respondia-se exatamente como o
// silêncio — o treinador continuava sem saber com quem contava, mas via a
// linha como respondida e deixava de insistir. Ficar por responder já diz o
// mesmo, e diz a verdade.
export const EVENT_RESPONSES = [
  { key: 'vou',     label: 'Vou',     badge: 'ok' },
  { key: 'nao_vou', label: 'Não vou', badge: 'danger' },
];

// Antecedência mínima para responder, em horas, por tipo de evento.
// O TREINO (e a musculação, que é um treino) fecha 6 horas antes: uma falta
// avisada à hora do treino não é um aviso — quem treina já saiu de casa com o
// plano feito e já não chama ninguém. O JOGO aceita até começar: uma
// convocatória confirma-se até ao último momento e, aí, saber tarde é melhor
// do que não saber.
// Espelha o prazo validado no servidor (`respond_to_event`, comunicacao.sql).
export const RESPONSE_LEAD_HOURS = { treino: 6, musculacao: 6, jogo: 0 };
export const DEFAULT_RESPONSE_LEAD_HOURS = 0;
export const EVENT_RESPONSE_LABEL = Object.fromEntries(EVENT_RESPONSES.map((r) => [r.key, r.label]));
export const EVENT_RESPONSE_BADGE = Object.fromEntries(EVENT_RESPONSES.map((r) => [r.key, r.badge]));

// --- Gestão financeira ---

export const FINANCIAL_ENTRY_TYPES = [
  { key: 'receita', label: 'Receita', badge: 'ok' },
  { key: 'despesa', label: 'Despesa', badge: 'danger' },
];
export const FINANCIAL_TYPE_LABEL = Object.fromEntries(FINANCIAL_ENTRY_TYPES.map((t) => [t.key, t.label]));
export const FINANCIAL_TYPE_BADGE = Object.fromEntries(FINANCIAL_ENTRY_TYPES.map((t) => [t.key, t.badge]));

export const EXPENSE_CATEGORIES = [
  'Material desportivo',
  'Deslocações',
  'Arbitragem',
  'Seguros',
  'Formação',
  'Instalações',
  'Administrativo',
  'Outro',
];

export const INCOME_CATEGORIES = [
  'Quotas',
  'Patrocínios',
  'Venda de material',
  'Eventos',
  'Subsídios',
  'Outro',
];

// --- Recrutamento: estados do funil ---
// Estados lineares do funil (avançar/recuar entre eles).
export const PROSPECT_STATUSES = [
  { key: 'observado',  label: 'Observado',      badge: 'muted' },
  { key: 'contactado', label: 'Contactado',      badge: 'info'  },
  { key: 'negociacao', label: 'Em negociação',   badge: 'warn'  },
  { key: 'confirmado', label: 'Confirmado',      badge: 'ok'    },
];
// Estado terminal negativo (atletas que não ficam), fora do funil linear.
export const PROSPECT_REJECTED = { key: 'dispensado', label: 'Não fica', badge: 'danger' };
const ALL_PROSPECT_STATUSES = [...PROSPECT_STATUSES, PROSPECT_REJECTED];
export const PROSPECT_LABEL = Object.fromEntries(
  ALL_PROSPECT_STATUSES.map((s) => [s.key, s.label])
);
export const PROSPECT_BADGE = Object.fromEntries(
  ALL_PROSPECT_STATUSES.map((s) => [s.key, s.badge])
);

// --- Decisão Tática -------------------------------------------------------
//
// Cada cenário treina a decisão de UMA posição, e as decisões caem em duas
// famílias que mudam o gesto da atleta:
//
//   • `token: 'bola'`   — a pergunta é PARA ONDE vai a bola (distribuidora,
//     atacante, serviço). Ela arrasta a bola até à opção.
//   • `token: 'atleta'` — a pergunta é ONDE ME COLOCO (bloco, defesa, receção).
//     Ela arrasta a sua própria peça.
//
// `optionKind` diz o que são as opções: outra jogadora (para quem jogo), uma
// zona do campo (onde ponho a bola) ou uma posição (onde me coloco).
//
// A fatia de campo desenhada não vem daqui: é calculada a partir das peças de
// cada cenário (`viewBoxFor` em tactical-court.js). Uma janela fixa por posição
// partia-se assim que o treinador arrastasse uma peça para fora dela.
export const TACTICAL_ROLES = [
  { key: 'distribuidora', label: 'Distribuidora', token: 'bola',   optionKind: 'jogadora',
    question: 'Para quem jogas a bola?' },
  { key: 'atacante',      label: 'Atacante',      token: 'bola',   optionKind: 'zona',
    question: 'Onde colocas a bola?' },
  { key: 'servico',       label: 'Serviço',       token: 'bola',   optionKind: 'zona',
    question: 'Para onde serves?' },
  { key: 'bloco',         label: 'Bloco',         token: 'atleta', optionKind: 'posicao',
    question: 'Onde te colocas?' },
  { key: 'defesa',        label: 'Defesa',        token: 'atleta', optionKind: 'posicao',
    question: 'Onde te colocas?' },
  { key: 'rececao',       label: 'Receção',       token: 'atleta', optionKind: 'posicao',
    question: 'Onde te colocas?' },
];
export const TACTICAL_ROLE_LABEL = Object.fromEntries(TACTICAL_ROLES.map((r) => [r.key, r.label]));
export const TACTICAL_ROLE = Object.fromEntries(TACTICAL_ROLES.map((r) => [r.key, r]));

// Que posições do plantel (`players.position`) correspondem a cada papel do
// cenário. Serve para o portal mostrar primeiro à atleta o que é DELA — o
// cruzamento é por palavra-chave porque `settings.positions` é configurável
// pelo clube e cada um chama-lhes o que quer ("Distribuidor", "Passador"…).
export const TACTICAL_ROLE_MATCH = {
  distribuidora: ['distribuid', 'passador', 'levantador', 'setter'],
  atacante:      ['atacante', 'ponta', 'oposto', 'central', 'zona 4', 'zona 2', 'extremo'],
  servico:       [], // toda a gente serve
  bloco:         ['central', 'bloco', 'ponta', 'oposto'],
  defesa:        ['libero', 'líbero', 'defesa', 'ponta', 'recetor'],
  rececao:       ['libero', 'líbero', 'recetor', 'ponta', 'extremo'],
};
