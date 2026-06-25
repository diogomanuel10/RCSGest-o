// Edge Function: send-push
//
// Chamada por pg_net quando uma nova notificação é inserida na BD.
// Envia Web Push (VAPID) a todos os dispositivos subscritos do utilizador alvo
// (ou de todos os utilizadores com o papel alvo, quando target_role é usado).
//
// Segredos a adicionar em Supabase → Edge Functions → send-push → Secrets:
//   VAPID_PUBLIC_KEY        — chave pública VAPID (base64url)
//   VAPID_PRIVATE_KEY       — chave privada VAPID (base64url)
//   PUSH_SECRET             — segredo partilhado para autenticar pedidos do pg_net
//   SUPABASE_URL            — disponível automaticamente
//   SUPABASE_SERVICE_ROLE_KEY — disponível automaticamente

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req: Request) => {
  const secret = req.headers.get('x-push-secret');
  if (secret !== Deno.env.get('PUSH_SECRET')) {
    return new Response('Unauthorized', { status: 401 });
  }

  let payload: {
    id: string;
    title: string;
    body: string;
    type: string;
    data: Record<string, unknown>;
    target_user_id: string | null;
    target_role: string | null;
  };

  try {
    payload = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  webpush.setVapidDetails(
    'mailto:admin@rcs.pt',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );

  let userIds: string[] = [];

  if (payload.target_user_id) {
    userIds = [payload.target_user_id];
  } else if (payload.target_role) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', payload.target_role);
    userIds = (profiles ?? []).map((p: { id: string }) => p.id);
  }

  if (!userIds.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')
    .in('user_id', userIds);

  if (!subs?.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body:  payload.body,
    tag:   `${payload.type}_${payload.id}`,
    data:  payload.data ?? {},
  });

  let sent = 0;
  const expired: string[] = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        pushPayload,
      );
      sent++;
    } catch (err: unknown) {
      const status = err && typeof err === 'object' && 'statusCode' in err
        ? (err as { statusCode: number }).statusCode
        : 0;
      if (status === 410 || status === 404) {
        expired.push(sub.id);
      } else {
        console.warn('[send-push] erro:', err);
      }
    }
  }

  if (expired.length) {
    await supabase.from('push_subscriptions').delete().in('id', expired);
  }

  return new Response(JSON.stringify({ ok: true, sent, expired: expired.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
