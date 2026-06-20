// Notificações push (Web Push).
//
// Fluxo: o utilizador ativa as notificações -> pedimos permissão -> subscrevemos
// no PushManager do service worker com a chave pública VAPID -> guardamos a
// subscrição no Supabase (tabela push_subscriptions). O envio é feito do lado do
// servidor (Edge Function "send-push") com a chave privada VAPID.
//
// Requer a variável de ambiente VITE_VAPID_PUBLIC_KEY (ver supabase/functions).

import { supabase } from './supabase.js';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Há suporte a push neste dispositivo/navegador?
export function pushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  );
}

// Estado atual: 'unsupported' | 'denied' | 'enabled' | 'disabled'.
export async function pushState() {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub ? 'enabled' : 'disabled';
}

// Ativa as notificações neste dispositivo. Devolve o novo estado.
export async function enablePush() {
  if (!pushSupported()) throw new Error('Este dispositivo não suporta notificações.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissão de notificações recusada.');
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  await saveSubscription(sub);
  return 'enabled';
}

// Desativa as notificações neste dispositivo (remove a subscrição local e no servidor).
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => {});
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  }
  return 'disabled';
}

// Guarda (ou atualiza) a subscrição no Supabase, associada ao utilizador atual.
async function saveSubscription(sub) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id || null;
  const json = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: sub.endpoint,
      subscription: json,
      user_agent: navigator.userAgent,
    },
    { onConflict: 'endpoint' }
  );
  if (error) throw error;
}

// Envia uma notificação (via Edge Function "send-push"). Só o coordenador pode
// (validado no servidor). `roles`/`user_ids` segmentam; sem eles, vai a todos.
export async function sendBroadcast({ title, body, url, tag, roles, user_ids }) {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: { title, body, url, tag, roles, user_ids },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data; // { sent, removed }
}

// Converte a chave VAPID (base64url) no formato que o PushManager exige.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
