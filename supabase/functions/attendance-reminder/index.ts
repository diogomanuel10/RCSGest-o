// Edge Function: attendance-reminder
//
// Corre a cada 5 minutos (configura o cron no Dashboard do Supabase:
//   Edge Functions → attendance-reminder → Schedule → "*/5 * * * *").
//
// O que faz:
//   1. Procura eventos (treino/jogo) que começam nos próximos 10 minutos
//   2. Para cada evento, encontra os treinadores da equipa
//   3. Insere uma notificação "Lembrete: marcar presenças" para cada um
//   4. Não repete: verifica se o lembrete já foi enviado para o evento
//
// Variáveis de ambiente necessárias (disponíveis automaticamente no Supabase):
//   SUPABASE_URL             — URL do projeto
//   SUPABASE_SERVICE_ROLE_KEY — chave service_role (bypassa RLS para INSERT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Deno.serve(async (_req: Request) => {
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    // Janela: eventos que começam entre agora+5min e agora+15min.
    // Com cron a cada 5 min, garante que cada evento é apanhado exatamente uma vez.
    const winStart = new Date(now.getTime() +  5 * 60 * 1000);
    const winEnd   = new Date(now.getTime() + 15 * 60 * 1000);

    const { data: events, error: evErr } = await supabase
      .from('events')
      // org_id: multi-tenant — a notificação herda o clube do evento, para
      // ficar isolada (visível só a esse clube).
      .select('id, type, title, date, time, end_time, team_id, org_id')
      .is('archived_at', null)
      .eq('date', today)
      .gte('time', fmtTime(winStart))
      .lte('time', fmtTime(winEnd));

    if (evErr) {
      return new Response(JSON.stringify({ error: evErr.message }), { status: 500 });
    }

    if (!events?.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }));
    }

    let sent = 0;

    for (const ev of events) {
      if (!ev.team_id) continue;

      // Deduplicação: já foi enviado lembrete para este evento?
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'attendance_reminder')
        .filter('data->>event_id', 'eq', ev.id);

      if ((count ?? 0) > 0) continue;

      // Treinadores da equipa (via team_coaches → coaches.user_id)
      const { data: links } = await supabase
        .from('team_coaches')
        .select('coaches(user_id)')
        .eq('team_id', ev.team_id);

      if (!links?.length) continue;

      const label = ev.title
        || (ev.type === 'treino' ? 'Treino' : ev.type === 'jogo' ? 'Jogo' : ev.type);

      const rows = links
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((l: any) => l.coaches?.user_id)
        .filter(Boolean)
        .map((userId: string) => ({
          type:           'attendance_reminder',
          title:          'Lembrete: marcar presenças',
          body:           `${label} começa às ${ev.time}. Não te esqueças de marcar as presenças.`,
          data:           { event_id: ev.id, type: ev.type, date: ev.date, time: ev.time },
          target_user_id: userId,
          org_id:         ev.org_id, // isola a notificação no clube do evento
        }));

      if (!rows.length) continue;

      const { error: insErr } = await supabase.from('notifications').insert(rows);
      if (!insErr) sent += rows.length;
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
