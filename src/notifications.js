// Sistema de notificações da Central RCS.
//
// Responsável por: carregar o inbox do coordenador, subscrever o canal
// Realtime para atualizações em tempo real, mostrar notificações nativas
// via Notifications API / Service Worker, e verificar presenças em falta.
//
// Não importa `state` de store.js para evitar dependências circulares.
// A função checkMissingAttendances recebe os dados como parâmetros.

import { supabase } from './supabase.js';

let _notifications = [];
let _unreadCount = 0;
let _channel = null;
const _listeners = new Set();

// --- Leitura de estado ---------------------------------------------------

export function getNotifications() { return _notifications; }
export function getUnreadCount()   { return _unreadCount; }

// Subscreve mudanças no estado das notificações.
// Devolve uma função de cancelamento.
export function onNotificationChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _emit() {
  _unreadCount = _notifications.filter((n) => !n.read_at).length;
  for (const fn of _listeners) fn();
}

// --- Operações de dados --------------------------------------------------

// Carrega as últimas 50 notificações do coordenador.
export async function loadNotifications() {
  const { data } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  _notifications = data || [];
  _emit();
}

// Marca uma notificação como lida.
export async function markRead(id) {
  const now = new Date().toISOString();
  await supabase.from('notifications').update({ read_at: now }).eq('id', id);
  const n = _notifications.find((n) => n.id === id);
  if (n) n.read_at = now;
  _emit();
}

// Marca todas as não lidas como lidas.
export async function markAllRead() {
  const ids = _notifications.filter((n) => !n.read_at).map((n) => n.id);
  if (!ids.length) return;
  const now = new Date().toISOString();
  await supabase.from('notifications').update({ read_at: now }).in('id', ids);
  _notifications.forEach((n) => { if (!n.read_at) n.read_at = now; });
  _emit();
}

// --- Verificação de presenças em falta ----------------------------------
// Corre no frontend para o coordenador: procura eventos de treino/jogo que
// já terminaram (nas últimas 24 h) sem nenhuma presença marcada. Insere uma
// notificação por evento em falta (uma só vez — deduplica contra o inbox).
export async function checkMissingAttendances(events, teams, players, attendances) {
  if (!Array.isArray(events) || !events.length) return;

  const now = new Date();
  const cutoff = new Date(now - 24 * 60 * 60 * 1000); // há 24 h

  const toInsert = [];

  for (const ev of events) {
    if (!ev.end_time) continue;

    const evEnd = new Date(`${ev.date}T${ev.end_time}`);
    if (isNaN(evEnd) || evEnd > now || evEnd < cutoff) continue;

    const teamPlayers = players.filter((p) => p.team_id === ev.team_id);
    if (!teamPlayers.length) continue;

    const hasAny = attendances.some((a) => a.event_id === ev.id);
    if (hasAny) continue;

    // Não duplicar: não criar se já existe notificação para este evento.
    const already = _notifications.some(
      (n) => n.type === 'attendance_missing' && n.data?.event_id === ev.id
    );
    if (already) continue;

    const team = teams.find((t) => t.id === ev.team_id);
    const teamLabel = team
      ? `${team.escalao}${team.gender === 'F' ? ' (F)' : ''}`.trim()
      : 'equipa';

    toInsert.push({
      type:  'attendance_missing',
      title: 'Presenças por registar',
      body:  `O evento "${ev.title || ev.type}" de ${teamLabel} em ${ev.date} terminou sem presenças marcadas.`,
      data:  { event_id: ev.id, team_id: ev.team_id, date: ev.date },
    });
  }

  if (!toInsert.length) return;

  await supabase.from('notifications').insert(toInsert);
  await loadNotifications();
}

// --- Realtime ------------------------------------------------------------

// Inicia a subscrição ao canal Realtime para receber novos INSERTs em tempo
// real. Se já houver um canal ativo, destrói-o primeiro (re-login seguro).
export function subscribeRealtime() {
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
  _channel = supabase
    .channel('rcs-notifications')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications' },
      (payload) => {
        // Evitar duplicados: o frontend de quem criou a notificação
        // pode recebê-la de volta pelo Realtime.
        if (_notifications.some((n) => n.id === payload.new.id)) return;
        _notifications.unshift(payload.new);
        _emit();
        _showOsNotification(payload.new);
      }
    )
    .subscribe();
}

export function unsubscribeRealtime() {
  if (_channel) {
    supabase.removeChannel(_channel);
    _channel = null;
  }
}

// --- Notifications API (OS/browser) -------------------------------------

// Pede permissão para mostrar notificações nativas.
// Devolve: 'granted' | 'denied' | 'default' | 'unsupported'
export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

// --- Web Push (VAPID) — necessário para iOS em segundo plano -----------

function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Subscreve o Web Push e guarda o endpoint na BD.
// Só faz algo se o browser suportar PushManager e a permissão estiver concedida.
export async function subscribeWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (Notification.permission !== 'granted') return;

  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    console.warn('[RCS] VITE_VAPID_PUBLIC_KEY não definida — Web Push desativado.');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly:      true,
      applicationServerKey: _urlBase64ToUint8Array(vapidKey),
    });
    const json = sub.toJSON();
    await supabase.from('push_subscriptions').upsert({
      endpoint: json.endpoint,
      p256dh:   json.keys?.p256dh,
      auth_key: json.keys?.auth,
    }, { onConflict: 'user_id,endpoint' });
  } catch (err) {
    console.warn('[RCS] Web Push subscribe falhou:', err);
  }
}

// Remove a subscrição Web Push do dispositivo atual e da BD.
export async function unsubscribeWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch (err) {
    console.warn('[RCS] Web Push unsubscribe falhou:', err);
  }
}

// Mostra uma notificação nativa do sistema operativo (quando o browser
// está em segundo plano ou o ecrã está bloqueado).
async function _showOsNotification(notif) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const opts = {
      body:     notif.body,
      icon:     '/logo-192.png',
      badge:    '/logo-192.png',
      data:     notif.data,
      tag:      `${notif.type}_${notif.id}`,
      renotify: false,
    };
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(notif.title, opts);
    } else {
      new Notification(notif.title, opts);
    }
  } catch (err) {
    console.warn('[RCS] Notificação nativa falhou:', err);
  }
}
