// Edge Function: calendar-feed
//
// Serve a agenda da fisioterapia como um calendário .ics, para o Google
// Calendar (ou o do iPhone) SUBSCREVER — ver supabase/calendario-subscricao.sql.
//
// Publicar SEM verificação de JWT: quem pede isto é o servidor do Google, que
// não tem sessão na Rumia. A credencial é o token do link.
//
//   supabase functions deploy calendar-feed --no-verify-jwt
//
// Pedido: GET /functions/v1/calendar-feed?t=<token>
//
// Variáveis de ambiente (automáticas no Supabase):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// Opcional (Edge Functions → calendar-feed → Secrets):
//   APP_URL — endereço da app (ex.: https://rumia.pt); se existir, cada
//             atendimento leva o link para a agenda na Rumia.
//
// A chave de serviço NÃO passa pelo RLS. O isolamento entre clubes e a
// permissão de ver a agenda clínica são escritos à mão aqui — a regra do
// `check_in_by_qr` e do `send_weekly_digest`. E verificam-se a CADA pedido:
// o link sobrevive a uma mudança de papel, a um clube suspenso e a um plano
// sem o módulo, e tem de deixar de dar agenda com qualquer um deles.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');

// Janela servida: o passado recente (para a semana que passou continuar lá)
// e o futuro próximo. Um feed com a época inteira faz o Google demorar mais a
// refrescar e não serve a ninguém.
const DAYS_BACK = 60;
const DAYS_AHEAD = 365;

const TYPE_LABEL: Record<string, string> = {
  avaliacao: 'Avaliação',
  tratamento: 'Tratamento',
  reavaliacao: 'Reavaliação',
};

// Mesmos alias do `plans.js`: planos antigos mapeiam PARA CIMA.
const PLAN_ALIASES: Record<string, string> = {
  pro: 'clube_plus', trial: 'clube_plus', '': 'clube_plus',
  solo: 'treinador', treinador_plus: 'treinador', essencial: 'clube',
};

const CLINICAL_ROLES = ['coordenador', 'fisioterapeuta'];

function notFound(): Response {
  // A mesma resposta para "não existe", "foi desligado" e "sem permissão":
  // distinguir as três diria a quem anda a adivinhar tokens quais existem.
  return new Response('Calendário não encontrado.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

// Texto de uma propriedade iCalendar (RFC 5545 §3.3.11).
function icsText(s: string): string {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// Linhas até 75 octetos, com continuação por espaço (RFC 5545 §3.1). O Google
// perdoa linhas longas; o calendário do iPhone nem sempre.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// "Beatriz Soberano Silva" -> "Beatriz S.". O calendário vive numa conta
// fora do clube; o nome inteiro de uma atleta menor ao lado de "Tratamento"
// é mais do que a fisio precisa para saber quem vem.
function shortName(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Atleta';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hasTime = (t: string | null) => !!t && /^\d{1,2}:\d{2}/.test(t);

function localStamp(date: string, time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${date.replace(/-/g, '')}T${pad(h)}${pad(m)}00`;
}

function addMinutes(date: string, time: string, minutes: number): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, m] = time.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, m + minutes));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`;
}

function nextDay(date: string): string {
  const [y, mo, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + 1));
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`;
}

function isoDay(offsetDays: number): string {
  const dt = new Date(Date.now() + offsetDays * 86400000);
  return dt.toISOString().slice(0, 10);
}

// Definição da hora de Lisboa. Com TZID e sem VTIMEZONE o Google adivinha
// bem, mas outros calendários tratam a hora como flutuante — e um
// atendimento às 19h que aparece às 20h no inverno é pior do que nenhum.
const LISBON_VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Lisbon',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0000',
  'TZOFFSETTO:+0100',
  'TZNAME:WEST',
  'DTSTART:19700329T010000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0000',
  'TZNAME:WET',
  'DTSTART:19701025T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método não suportado.', { status: 405 });
  }

  const url = new URL(req.url);
  // Aceita também o token no fim do caminho (…/calendar-feed/<token>.ics):
  // há calendários que só aceitam um endereço que "pareça" um ficheiro.
  const fromPath = url.pathname.split('/').pop()?.replace(/\.ics$/i, '') ?? '';
  const token = (url.searchParams.get('t') || (fromPath !== 'calendar-feed' ? fromPath : '')).trim();
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return notFound();

  // 1. De quem é o link.
  const { data: feed } = await supabase
    .from('calendar_feeds').select('user_id').eq('token', token).maybeSingle();
  if (!feed) return notFound();

  // 2. Ainda pode ver a agenda clínica? Papel, clube ativo e plano com o
  //    módulo — as três condições do `canAccess('medico')` e do `orgAccess()`
  //    da app, verificadas aqui porque a chave de serviço não as conhece.
  const { data: profile } = await supabase
    .from('profiles').select('role, org_id').eq('id', feed.user_id).maybeSingle();
  if (!profile?.org_id || !CLINICAL_ROLES.includes(profile.role)) return notFound();

  const { data: org } = await supabase
    .from('organizations').select('name, status, trial_ends_at, plan')
    .eq('id', profile.org_id).maybeSingle();
  if (!org) return notFound();
  const trialOk = org.status === 'trial'
    && (!org.trial_ends_at || new Date(org.trial_ends_at) > new Date());
  if (org.status !== 'ativa' && !trialOk) return notFound();

  // Fail-open como a app: plano desconhecido ou tabela em falta não fecham.
  const planKey = PLAN_ALIASES[org.plan ?? ''] ?? org.plan;
  const { data: plan } = await supabase
    .from('plans').select('features').eq('key', planKey).maybeSingle();
  if (plan && Array.isArray(plan.features) && !plan.features.includes('medico')) {
    return notFound();
  }

  // 3. A agenda. `org_id` à mão — sem RLS, é o único filtro entre clubes.
  const { data: settings } = await supabase
    .from('settings').select('timezone').eq('org_id', profile.org_id).limit(1).maybeSingle();
  const tz = (settings?.timezone || '').trim() || 'Europe/Lisbon';

  // `athlete_response` só existe depois de resposta-atendimento.sql: sem a
  // coluna, pede-se sem ela em vez de falhar o calendário inteiro.
  const base = 'id, player_id, type, date, time, end_time, location, status';
  const query = (cols: string) => supabase
    .from('physio_appointments')
    .select(cols)
    .eq('org_id', profile.org_id)
    .neq('status', 'cancelado')
    .gte('date', isoDay(-DAYS_BACK))
    .lte('date', isoDay(DAYS_AHEAD))
    .order('date');
  let { data: appts, error } = await query(`${base}, athlete_response, athlete_note`);
  if (error) ({ data: appts, error } = await query(base));
  if (error) return new Response('Erro a ler a agenda.', { status: 500 });

  const ids = [...new Set((appts ?? []).map((a: any) => a.player_id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: players } = await supabase
      .from('players').select('id, name').eq('org_id', profile.org_id).in('id', ids);
    (players ?? []).forEach((p: any) => names.set(p.id, p.name));
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rumia//Agenda de fisioterapia//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`Fisioterapia · ${org.name}`)}`,
    `X-WR-TIMEZONE:${tz}`,
    // Pedido de refresco (o Google ignora-o; o iPhone e o Outlook não).
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...(tz === 'Europe/Lisbon' ? LISBON_VTIMEZONE : []),
  ];

  for (const a of (appts ?? []) as any[]) {
    // Um atendimento de uma atleta já arquivada não tem nome a mostrar e já
    // não é agenda de ninguém.
    if (!names.has(a.player_id)) continue;

    const who = shortName(names.get(a.player_id)!);
    const kind = TYPE_LABEL[a.type] || 'Fisioterapia';
    const cantCome = a.status === 'agendado' && a.athlete_response === 'nao_posso';
    // O que importa ver de relance no telemóvel vai no título: quem, e se
    // ainda está de pé. O "não pode" à cabeça, porque é o que pede ação.
    const prefix = cantCome ? '⚠ Não pode · ' : a.status === 'faltou' ? 'Faltou · ' : '';
    const suffix = a.status === 'realizado' ? ' ✓' : '';
    const summary = `${prefix}${kind} · ${who}${suffix}`;

    // Nada de clínico: nem as notas da fisio nem o episódio. O que vai é o
    // que se escreveria num post-it na porta do gabinete.
    const desc: string[] = [];
    if (cantCome) {
      desc.push(`A atleta avisou que não pode${a.athlete_note ? `: "${a.athlete_note}"` : '.'}`);
    } else if (a.athlete_response === 'vou' && a.status === 'agendado') {
      desc.push('A atleta confirmou.');
    }
    if (APP_URL) desc.push(`Abrir na Rumia: ${APP_URL}/#/saude`);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:appt-${a.id}@rumia`);
    lines.push(`DTSTAMP:${stamp}`);
    if (hasTime(a.time)) {
      const start = a.time.slice(0, 5);
      lines.push(`DTSTART;TZID=${tz}:${localStamp(a.date, start)}`);
      const end = hasTime(a.end_time) && a.end_time.slice(0, 5) > start
        ? localStamp(a.date, a.end_time.slice(0, 5))
        : addMinutes(a.date, start, 60);
      lines.push(`DTEND;TZID=${tz}:${end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${a.date.replace(/-/g, '')}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(a.date)}`);
    }
    lines.push(`SUMMARY:${icsText(summary)}`);
    if (a.location) lines.push(`LOCATION:${icsText(a.location)}`);
    if (desc.length) lines.push(`DESCRIPTION:${icsText(desc.join('\n'))}`);
    lines.push(`STATUS:${cantCome ? 'TENTATIVE' : 'CONFIRMED'}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="fisioterapia.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
});
