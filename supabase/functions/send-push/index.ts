// Edge Function: send-push
//
// Envia notificações push (Web Push) para utilizadores da Central RCS.
// Só o coordenador a pode invocar. Pode segmentar por papéis e/ou por
// utilizadores específicos; sem segmento, envia para todos os subscritos.
//
// Corpo do pedido (JSON):
//   {
//     "title": "Treino alterado",
//     "body":  "O treino de sábado passou para as 10h.",
//     "url":   "/",                 // opcional: para onde abrir ao clicar
//     "tag":   "evento-123",        // opcional: agrupa/substitui notificações
//     "roles": ["treinador"],       // opcional: filtrar por papel
//     "user_ids": ["uuid", ...]      // opcional: utilizadores específicos
//   }
//
// Variáveis de ambiente necessárias (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:geral@clube.pt)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são automáticas.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:geral@example.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // 1. Autenticar o chamador e exigir papel 'coordenador'.
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asUser.auth.getUser();
    if (!userData?.user) return json({ error: 'Sem sessão.' }, 401);

    const { data: profile } = await asUser
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();
    if (profile?.role !== 'coordenador') {
      return json({ error: 'Apenas o coordenador pode enviar notificações.' }, 403);
    }

    // 2. Ler o pedido.
    const { title, body, url, tag, roles, user_ids } = await req.json();
    if (!title) return json({ error: 'Falta o título (title).' }, 400);

    // 3. Determinar os destinatários (service role: ignora RLS).
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    let targetIds: string[] | null = null;

    if (Array.isArray(user_ids) && user_ids.length) {
      targetIds = user_ids;
    } else if (Array.isArray(roles) && roles.length) {
      const { data: profs } = await admin.from('profiles').select('id').in('role', roles);
      targetIds = (profs ?? []).map((p) => p.id);
      if (!targetIds.length) return json({ sent: 0, note: 'Nenhum utilizador com esses papéis.' });
    }

    let q = admin.from('push_subscriptions').select('endpoint, subscription');
    if (targetIds) q = q.in('user_id', targetIds);
    const { data: subs, error } = await q;
    if (error) throw error;

    // 4. Enviar. Remove subscrições mortas (404/410).
    const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/', tag });
    let sent = 0;
    const stale: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (row) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) stale.push(row.endpoint);
        }
      })
    );
    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('endpoint', stale);
    }

    return json({ sent, removed: stale.length });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
