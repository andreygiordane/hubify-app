import { useEffect, useState } from 'react';

// Instalação como aplicativo (PWA) e notificações push.
// - Chrome/Edge (desktop e Android): o navegador avisa com "beforeinstallprompt" e nós guardamos
//   o evento para abrir a janela de instalação quando a pessoa tocar em "Instalar".
// - iPhone/iPad: não existe instalação por botão; a pessoa usa Compartilhar > Adicionar à Tela de Início.
//   As notificações push no iOS (16.4+) só existem DEPOIS disso, dentro do app instalado.
// Tudo depende de HTTPS confiável: com o aviso "sua conexão não é particular" o navegador
// não registra o service worker, não oferece a instalação e bloqueia o push.

let deferredPrompt = null;
let installed = false;
const listeners = new Set();
const notify = () => listeners.forEach(fn => fn());

const ua = navigator.userAgent || '';
export const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/.test(ua);
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: window-controls-overlay)').matches ||
  window.navigator.standalone === true;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  notify();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installed = true;
  notify();
});

let swState = 'serviceWorker' in navigator ? 'pending' : 'unsupported'; // pending | ready | blocked | unsupported

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => { swState = 'ready'; })
      // Falha típica: certificado HTTPS não confiável neste aparelho
      .catch(() => { swState = 'blocked'; })
      .finally(notify);
  });
}

export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  notify();
  return outcome; // 'accepted' | 'dismissed'
}

const snapshot = () => ({
  canPrompt: !!deferredPrompt,
  installed: installed || isStandalone(),
  isIOS,
  isAndroid,
  secure: window.isSecureContext,
  swState,
});

export function useInstall() {
  const [state, setState] = useState(snapshot);
  useEffect(() => {
    const update = () => setState(snapshot());
    listeners.add(update);
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener?.('change', update);
    return () => { listeners.delete(update); mq.removeEventListener?.('change', update); };
  }, []);
  return { ...state, promptInstall };
}

/* ---------- Notificações push ---------- */

const ASKED_KEY = 'hubify_push_asked';     // a pessoa já respondeu (ou dispensou) o convite para ativar
const pushListeners = new Set();
const notifyPush = () => pushListeners.forEach(fn => fn());
let subscribed = false;
let serverEnabled = null; // null = ainda não consultado

const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;

// Por que (ainda) não dá para ativar neste aparelho — ou 'ok'
export function pushAvailability() {
  if (!window.isSecureContext) return 'insecure';
  // iPhone/iPad: só dentro do app adicionado à Tela de Início
  if (isIOS && !isStandalone()) return 'ios-install';
  if (!pushSupported()) return 'unsupported';
  if (swState === 'blocked') return 'insecure';
  if (Notification.permission === 'denied') return 'denied';
  if (serverEnabled === false) return 'server-off';
  return 'ok';
}

const urlBase64ToUint8Array = (base64) => {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const postJson = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function serverKey() {
  const res = await fetch('/push/public-key', { cache: 'no-store' });
  if (!res.ok) throw new Error('push indisponível');
  const data = await res.json();
  serverEnabled = !!(data.enabled && data.publicKey);
  if (!serverEnabled) throw new Error('push desativado no servidor');
  return data.publicKey;
}

// Consulta (uma vez) se o servidor tem o push ligado, para nem oferecer quando não tem
export async function checkPushServer() {
  if (serverEnabled !== null || import.meta.env.DEV) return serverEnabled;
  await serverKey().catch(() => { if (serverEnabled === null) serverEnabled = false; });
  notifyPush();
  return serverEnabled;
}

// Garante que a assinatura deste navegador está registrada no servidor para o usuário atual.
// Só age se a permissão JÁ foi dada: nunca abre a pergunta do navegador sozinho.
export async function syncPush(uid) {
  if (!uid || !pushSupported() || import.meta.env.DEV) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (Notification.permission !== 'granted') { subscribed = false; notifyPush(); return false; }
    const key = await serverKey();
    // Chave do servidor mudou (ex.: dados recriados): a assinatura antiga não serve mais
    const current = sub?.options?.applicationServerKey ? btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : null;
    if (sub && current && current !== key) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const res = await postJson('/push/subscribe', { uid, subscription: sub.toJSON() });
    subscribed = res.ok;
  } catch {
    subscribed = false;
  }
  notifyPush();
  return subscribed;
}

// Chamado pelo botão "Ativar notificações" (precisa ser um gesto da pessoa, exigência do iOS e do Chrome)
export async function enablePush(uid) {
  try { localStorage.setItem(ASKED_KEY, '1'); } catch {}
  const why = pushAvailability();
  if (why !== 'ok') return why;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  notifyPush();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'dismissed';
  return (await syncPush(uid)) ? 'enabled' : (serverEnabled === false ? 'server-off' : 'failed');
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await postJson('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch { /* sem service worker: nada a desfazer */ }
  subscribed = false;
  notifyPush();
}

export const dismissPushPrompt = () => { try { localStorage.setItem(ASKED_KEY, '1'); } catch {} notifyPush(); };
const wasAsked = () => { try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return true; } };

const pushSnapshot = () => ({
  availability: pushAvailability(),
  permission: 'Notification' in window ? Notification.permission : 'unsupported',
  subscribed,
  asked: wasAsked(),
});

export function usePush() {
  const [state, setState] = useState(pushSnapshot);
  useEffect(() => {
    const update = () => setState(pushSnapshot());
    pushListeners.add(update);
    listeners.add(update); // estado do service worker / instalação também muda a disponibilidade
    return () => { pushListeners.delete(update); listeners.delete(update); };
  }, []);
  return state;
}

// Aviso do sistema para quando o app está aberto mas fora de vista (aba em segundo plano, janela minimizada).
// Não depende do push nem de internet: é o próprio app que pede ao service worker para mostrar.
export async function showLocalNotification({ title, body, tag, url = '/', kind = 'message' }) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg) return;
    await reg.showNotification(title || 'Hubify', { body: body || '', tag, renotify: !!tag, icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', lang: 'pt-BR', data: { url, kind } });
  } catch { /* navegador sem suporte: o som e o selo continuam valendo */ }
}

// Destinos pedidos de fora do app: clique numa notificação (mensagem do service worker) ou link de abertura (?room= / ?join=)
export function onNavigateRequest(handler) {
  const handle = (raw) => {
    try {
      const url = new URL(raw, window.location.origin);
      const room = url.searchParams.get('room');
      const join = url.searchParams.get('join');
      if (join) handler({ kind: 'join', roomId: join, type: url.searchParams.get('type') === 'audio' ? 'audio' : 'video' });
      else if (room) handler({ kind: 'room', roomId: room });
    } catch { /* endereço inválido: ignora */ }
  };
  const onMessage = (e) => {
    if (e.data?.type === 'hubify:navigate') handle(e.data.url);
    if (e.data?.type === 'hubify:resubscribe') handler({ kind: 'resubscribe' });
  };
  navigator.serviceWorker?.addEventListener('message', onMessage);
  // App aberto pela notificação: o destino vem no endereço; limpa para não repetir ao recarregar
  if (window.location.search) {
    const initial = window.location.href;
    window.history.replaceState(null, '', window.location.pathname);
    setTimeout(() => handle(initial), 0);
  }
  return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
}
