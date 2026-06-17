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

export const POSITIONS = [
  'Distribuidor',
  'Zona 4',
  'Central',
  'Oposto',
  'Líbero',
  'Universal',
];

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
