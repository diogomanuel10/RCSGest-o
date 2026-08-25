// Web Push — notificações que chegam ao telemóvel com a app FECHADA.
//
// O sino dentro da app já existia, mas só toca para quem tem a app aberta:
// um treino cancelado às 8h da manhã só era visto por quem calhasse de abrir
// a Rumia. O push resolve isso — no Android e no iOS a notificação aparece
// como a de qualquer outra app.
//
// Como funciona, de ponta a ponta:
//   1. O dispositivo cria uma SUBSCRIÇÃO (um endereço único no servidor de
//      push da Google/Apple) e guarda-a em `push_subscriptions`.
//   2. Ao inserir uma linha em `notifications`, um trigger chama a Edge
//      Function `send-push` (ver supabase/web-push.sql).
//   3. A função assina a mensagem com a chave VAPID e entrega-a; o service
//      worker (`public/sw.js`) mostra-a.
//
// iOS: a Apple só entrega push a uma PWA INSTALADA no ecrã principal
// (Safari 16.4+). No browser não há push nenhum — não é uma limitação da
// Rumia, e por isso o convite a instalar aparece a quem está nessa situação.

import { supabase } from './supabase.js';

// A chave PÚBLICA VAPID. É pública de propósito (identifica o remetente); a
// privada vive só na Edge Function. Ver .env.example.
const VAPID_PUBLIC = (import.meta.env.VITE_VAPID_PUBLIC_KEY || '')
  .trim().replace(/^["']|["']$/g, '').trim();

export const pushConfigured = Boolean(VAPID_PUBLIC);

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

// A app está a correr instalada (ecrã principal) e não dentro do browser?
export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches === true
    || window.navigator.standalone === true;
}

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    // iPadOS recente identifica-se como Mac; distingue-se pelo toque.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// No iOS, o push só existe depois de "Adicionar ao ecrã principal".
export function iosNeedsInstall() {
  return isIOS() && !isStandalone();
}

// A chave VAPID viaja em base64url e o `subscribe()` quer bytes.
function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

// Este dispositivo já está a receber push?
export async function isPushEnabled() {
  if (!pushConfigured || !pushSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  return Boolean(await currentSubscription());
}

// Liga o push NESTE dispositivo. Devolve um código em vez de lançar erro:
// quem chama tem de saber distinguir "o utilizador recusou" de "este
// telemóvel não sabe fazer isto", porque a mensagem a mostrar é outra.
//
//   'ok' | 'sem-suporte' | 'sem-chave' | 'instalar-ios' | 'recusado' | 'erro'
export async function enablePush() {
  if (!pushConfigured) return 'sem-chave';
  if (iosNeedsInstall()) return 'instalar-ios';
  if (!pushSupported()) return 'sem-suporte';

  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') return 'recusado';

    const reg = await navigator.serviceWorker.ready;
    // Reaproveita a subscrição existente: pedir outra ao mesmo dispositivo
    // devolveria um endereço novo e ficávamos com duas linhas a apontar para
    // o mesmo telemóvel (notificação a dobrar).
    const sub = await reg.pushManager.getSubscription()
      || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'erro';

    const json = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id:  user.id,
      endpoint: sub.endpoint,
      p256dh:   json.keys?.p256dh,
      auth_key: json.keys?.auth,
    }, { onConflict: 'user_id,endpoint' });
    if (error) throw error;

    return 'ok';
  } catch (err) {
    console.warn('[Rumia] Push:', err);
    return 'erro';
  }
}

// Desliga o push neste dispositivo (e limpa a linha do lado do servidor).
export async function disablePush() {
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch (err) {
    console.warn('[Rumia] Push (desligar):', err);
  }
}

// Chamado ao sair da conta. O telemóvel fica sem subscrição, senão o próximo
// aviso do clube aparecia no ecrã de alguém que já não tem sessão aberta —
// e num tablet partilhado seria o aviso dirigido a outra pessoa.
export async function clearPushOnLogout() {
  await disablePush();
}
