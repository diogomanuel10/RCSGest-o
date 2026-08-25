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
export const EVENT_TYPES = [
  { key: 'jogo', label: 'Jogo', badge: 'danger' },
  { key: 'treino', label: 'Treino', badge: 'info' },
  { key: 'evento', label: 'Evento', badge: 'warn' },
];
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
  { key: 'aperto_mao',      label: 'Aperto de mão (preensão)', unit: 'kg', better: 'up' },
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

// --- Tamanhos de equipamento ---

export const TEXT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

// Artigos de equipamento com o tipo de tamanho:
//   'text' = XS–XXL (select)  |  'free' = texto livre (numérico, ex.: meias)
export const EQUIPMENT_ARTICLES = [
  { key: 'camisola',        label: 'Camisola',               type: 'text' },
  { key: 'camisola_alt',    label: 'Camisola Alternativa',   type: 'text' },
  { key: 'calcoes',         label: 'Calções',                type: 'text' },
  { key: 'meias',           label: 'Meias',                  type: 'free' },
  { key: 'casaco_treino',   label: 'Casaco Fato de Treino',  type: 'text' },
  { key: 'calca_treino',    label: 'Calça Fato de Treino',   type: 'text' },
  { key: 'mochila',         label: 'Mochila',                type: 'text' },
  { key: 'blusao',          label: 'Blusão',                 type: 'text' },
  { key: 'camisola_treino', label: 'Camisola de Treino',     type: 'text' },
];
export const ARTICLE_LABEL = Object.fromEntries(EQUIPMENT_ARTICLES.map((a) => [a.key, a.label]));

// --- Convocatórias ---

export const SQUAD_STATUSES = [
  { key: 'convocado', label: 'Convocado', badge: 'info' },
  { key: 'titular',   label: 'Titular',   badge: 'ok' },
  { key: 'suplente',  label: 'Suplente',  badge: 'warn' },
];
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
// O TREINO fecha 6 horas antes: uma falta avisada à hora do treino não é um
// aviso — o treinador já saiu de casa com o plano feito e já não chama
// ninguém. O JOGO aceita até começar: uma convocatória confirma-se até ao
// último momento e, aí, saber tarde é melhor do que não saber.
// Espelha o prazo validado no servidor (`respond_to_event`, comunicacao.sql).
export const RESPONSE_LEAD_HOURS = { treino: 6, jogo: 0 };
export const DEFAULT_RESPONSE_LEAD_HOURS = 0;
export const EVENT_RESPONSE_LABEL = Object.fromEntries(EVENT_RESPONSES.map((r) => [r.key, r.label]));
export const EVENT_RESPONSE_BADGE = Object.fromEntries(EVENT_RESPONSES.map((r) => [r.key, r.badge]));

export const SQUAD_STATUS_LABEL = Object.fromEntries(SQUAD_STATUSES.map((s) => [s.key, s.label]));
export const SQUAD_STATUS_BADGE = Object.fromEntries(SQUAD_STATUSES.map((s) => [s.key, s.badge]));

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
