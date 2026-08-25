// Edge Function: send-push
//
// Entrega uma notificação da tabela `notifications` aos dispositivos do
// destinatário, por Web Push — é isto que faz a Rumia notificar como uma app
// normal no Android e no iOS, com a app fechada.
//
// Quem a chama: o trigger `trg_push_on_notification` (ver supabase/web-push.sql),
// a cada linha inserida em `notifications`. Assim há UM sítio só a decidir o
// que é uma notificação (o resto do código continua a inserir na tabela como
// sempre) e o push é só a última perna do caminho.
//
// Variáveis de ambiente (Edge Functions → send-push → Secrets):
//   VAPID_PUBLIC_KEY   — a mesma que o site usa em VITE_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY  — a privada; NUNCA vai para o cliente
//   VAPID_SUBJECT      — "mailto:o-teu@email" (exigido pela norma)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — automáticas no Supabase
//
// Gerar o par de chaves (uma vez, na tua máquina):
//   npx web-push generate-vapid-keys

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
);

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:geral@rumia.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  target_user_id: string | null;
  target_role: string | null;
  org_id: string | null;
};

// O trigger manda `{ record: <linha> }` (o mesmo formato dos Database
// Webhooks do Supabase); aceita-se também a linha à solta, para dar para
// testar a função à mão com um `curl`.
function readNotification(payload: unknown): Notification | null {
  const p = payload as Record<string, unknown>;
  const row = (p?.record ?? p) as Notification;
  return row?.title ? row : null;
}

// A quem se entrega: ao destinatário direto ou, quando a notificação é
// dirigida a um PAPEL (as antigas, sem target_user_id), a toda a gente com
// esse papel NESSE clube — o org_id não é opcional aqui: sem ele o aviso de
// um clube tocava no telemóvel do coordenador de outro.
async function recipients(n: Notification): Promise<string[]> {
  if (n.target_user_id) return [n.target_user_id];
  if (!n.target_role) return [];

  let q = supabase.from('profiles').select('id').eq('role', n.target_role);
  if (n.org_id) q = q.eq('org_id', n.org_id);
  else return [];

  const { data } = await q;
  return (data ?? []).map((p: { id: string }) => p.id);
}

Deno.serve(async (req: Request) => {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'VAPID por configurar' }), { status: 500 });
  }

  let payload: unknown;
  try { payload = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'JSON inválido' }), { status: 400 }); }

  const notif = readNotification(payload);
  if (!notif) return new Response(JSON.stringify({ error: 'Notificação em falta' }), { status: 400 });

  const users = await recipients(notif);
  if (!users.length) return new Response(JSON.stringify({ ok: true, sent: 0 }));

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .in('user_id', users);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!subs?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }));

  const message = JSON.stringify({
    title: notif.title,
    body:  notif.body,
    data:  { ...(notif.data ?? {}), notification_id: notif.id, type: notif.type },
    // Uma etiqueta por notificação: duas notificações diferentes não se
    // devem substituir uma à outra no ecrã.
    tag:   `rumia-${notif.id}`,
  });

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(subs.map(async (s: {
    id: string; endpoint: string; p256dh: string; auth_key: string;
  }) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } },
        message
      );
      sent += 1;
    } catch (err) {
      // 404/410 = o dispositivo desinstalou a app ou limpou os dados. A
      // subscrição está morta para sempre: guardá-la só faz a próxima
      // notificação demorar mais a chegar a quem ainda existe.
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) dead.push(s.id);
      else console.error('[send-push]', status, (err as Error)?.message);
    }
  }));

  if (dead.length) {
    await supabase.from('push_subscriptions').delete().in('id', dead);
  }

  return new Response(JSON.stringify({ ok: true, sent, removed: dead.length }));
});
