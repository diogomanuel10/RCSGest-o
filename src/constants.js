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

// --- Recrutamento: estados do funil ---
export const PROSPECT_STATUSES = [
  { key: 'observado',  label: 'Observado',      badge: 'muted' },
  { key: 'contactado', label: 'Contactado',      badge: 'info'  },
  { key: 'negociacao', label: 'Em negociação',   badge: 'warn'  },
  { key: 'confirmado', label: 'Confirmado',      badge: 'ok'    },
  { key: 'inscrito',   label: 'Inscrito',        badge: 'ok'    },
];
export const PROSPECT_LABEL = Object.fromEntries(
  PROSPECT_STATUSES.map((s) => [s.key, s.label])
);
export const PROSPECT_BADGE = Object.fromEntries(
  PROSPECT_STATUSES.map((s) => [s.key, s.badge])
);
