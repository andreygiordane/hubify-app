// Web Push: notificações do sistema operacional mesmo com o Hubify fechado ou em segundo plano.
//
// Como funciona: cada navegador que ativa as notificações gera uma "assinatura" (PushSubscription)
// e a envia para cá; quando chega mensagem, chamada ou convite, este servidor entrega um aviso
// criptografado ao serviço de push do próprio navegador (Google, Mozilla, Apple), assinado com as
// chaves VAPID abaixo. O service worker do aparelho recebe e mostra a notificação.
//
// ATENÇÃO (rede interna): o serviço de push fica na internet. Para funcionar, ESTE SERVIDOR e os
// APARELHOS precisam alcançar a internet. Sem internet nada quebra: os envios falham em silêncio
// e o app segue avisando pelas notificações internas (som, selo e avisos na tela).
const fs = require('fs');
const path = require('path');

module.exports = function createPush({ dir }) {
  let webpush;
  try { webpush = require('web-push'); } catch { webpush = null; }

  const vapidFile = path.join(dir, 'vapid.json');
  const subsFile = path.join(dir, 'subscriptions.json');
  const state = { enabled: false, publicKey: null };
  const byUser = new Map(); // uid -> Map(endpoint -> subscription)

  if (!webpush) {
    console.log('[PUSH] Pacote "web-push" não instalado: notificações push desativadas (rode npm install).');
    return { state, subscribe: () => false, unsubscribe: () => {}, send: async () => 0, count: () => 0 };
  }

  fs.mkdirSync(dir, { recursive: true });

  // Chaves VAPID: geradas uma vez e guardadas. Se forem perdidas, as assinaturas antigas deixam de
  // valer e cada aparelho precisa ativar as notificações de novo.
  let keys;
  try {
    keys = JSON.parse(fs.readFileSync(vapidFile, 'utf8'));
    if (!keys.publicKey || !keys.privateKey) throw new Error('incompleto');
  } catch {
    keys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
      : webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidFile, JSON.stringify(keys), { mode: 0o600 });
    console.log('[PUSH] Chaves VAPID criadas.');
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@hubify.local', keys.publicKey, keys.privateKey);
  state.enabled = true;
  state.publicKey = keys.publicKey;

  try {
    const saved = JSON.parse(fs.readFileSync(subsFile, 'utf8'));
    for (const [uid, list] of Object.entries(saved)) byUser.set(uid, new Map(list.map((s) => [s.endpoint, s])));
  } catch { /* ainda não há assinaturas */ }

  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const out = {};
      for (const [uid, subs] of byUser) if (subs.size) out[uid] = [...subs.values()];
      fs.writeFile(subsFile, JSON.stringify(out), { mode: 0o600 }, (e) => { if (e) console.error('[PUSH] Erro ao salvar assinaturas:', e.message); });
    }, 300);
  };

  const validSubscription = (s) =>
    s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 2048 &&
    s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';

  const unsubscribe = (endpoint) => {
    let removed = false;
    for (const subs of byUser.values()) removed = subs.delete(endpoint) || removed;
    if (removed) persist();
  };

  const subscribe = (uid, subscription) => {
    if (!uid || typeof uid !== 'string' || !validSubscription(subscription)) return false;
    // O mesmo aparelho pode trocar de conta: a assinatura passa a valer só para o usuário atual
    unsubscribe(subscription.endpoint);
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    const subs = byUser.get(uid);
    subs.set(subscription.endpoint, { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } });
    // Limite por pessoa: mantém os 10 aparelhos mais recentes
    while (subs.size > 10) subs.delete(subs.keys().next().value);
    persist();
    return true;
  };

  // payload: { title, body, tag, url, kind, ... }  →  nº de aparelhos que aceitaram a entrega
  const send = async (uid, payload, { ttl = 3600, urgency = 'normal' } = {}) => {
    const subs = byUser.get(uid);
    if (!subs || subs.size === 0) return 0;
    const body = JSON.stringify(payload);
    const results = await Promise.all([...subs.values()].map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body, { TTL: ttl, urgency, timeout: 8000 });
        return 1;
      } catch (e) {
        // 404/410: o navegador cancelou esta assinatura (app desinstalado, permissão retirada)
        if (e.statusCode === 404 || e.statusCode === 410) { subs.delete(sub.endpoint); persist(); }
        return 0;
      }
    }));
    return results.reduce((a, b) => a + b, 0);
  };

  const count = () => [...byUser.values()].reduce((n, subs) => n + subs.size, 0);
  console.log(`[PUSH] Notificações push ativas (${count()} aparelho(s) inscrito(s)).`);
  return { state, subscribe, unsubscribe, send, count };
};
