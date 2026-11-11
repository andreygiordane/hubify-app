const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());

const server = http.createServer(app);
app.get('/health', (req, res) => res.status(200).send('OK'));

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8082/api';

// ICE SERVERS — REDE INTERNA
// O Hubify roda só na rede da empresa: não usa STUN/TURN da internet.
// Na mesma rede os aparelhos se conectam direto (candidatos "host"), então a lista normalmente é vazia.
// Se a empresa tiver sub-redes/VLANs que não se enxergam, aponte TURN_URLS para um coturn LOCAL
// (docker compose --profile turn up) e, se quiser, STUN_URLS para o mesmo servidor.
const STUN_URLS = (process.env.STUN_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
const ICE_TTL = parseInt(process.env.TURN_TTL || '86400', 10);

const buildIceServers = () => {
  const { TURN_URLS, TURN_SECRET, TURN_USERNAME, TURN_CREDENTIAL } = process.env;

  const iceServers = STUN_URLS.length ? [{ urls: STUN_URLS }] : [];
  if (TURN_URLS) {
    const urls = TURN_URLS.split(',').map(u => u.trim()).filter(Boolean);
    if (TURN_SECRET) {
      // TURN REST API (coturn --use-auth-secret): credenciais temporárias
      const username = `${Math.floor(Date.now() / 1000) + ICE_TTL}:hubify`;
      const credential = crypto.createHmac('sha1', TURN_SECRET).update(username).digest('base64');
      iceServers.push({ urls, username, credential });
    } else if (TURN_USERNAME && TURN_CREDENTIAL) {
      iceServers.push({ urls, username: TURN_USERNAME, credential: TURN_CREDENTIAL });
    }
  }
  return iceServers;
};

app.get('/ice-servers', (req, res) => {
  try {
    res.json({ iceServers: buildIceServers(), ttl: ICE_TTL });
  } catch (e) {
    console.error('[ICE] Erro ao gerar ICE servers:', e.message);
    res.json({ iceServers: [], ttl: 300 });
  }
});

// Certificado da autoridade local: cada aparelho instala uma vez para o HTTPS ser aceito sem aviso
const CERT_DIR = path.resolve(process.env.CERT_DIR || path.join(__dirname, 'certs'));
const CA_CERT_FILE = path.join(CERT_DIR, 'hubify-ca.crt');
app.get('/hubify-ca.crt', (req, res) => {
  if (!fs.existsSync(CA_CERT_FILE)) return res.status(404).send('Certificado ainda não gerado.');
  res.setHeader('Content-Type', 'application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="hubify-ca.crt"');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(CA_CERT_FILE).pipe(res);
});

// ===== NOTIFICAÇÕES PUSH (Web Push / VAPID) =====
// Chaves e assinaturas ficam em PUSH_DIR (no Docker, um volume) — ver push.js
const push = require('./push')({ dir: path.resolve(process.env.PUSH_DIR || path.join(__dirname, 'push-data')) });
const pushJson = express.json({ limit: '16kb' });

app.get('/push/public-key', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ enabled: push.state.enabled, publicKey: push.state.publicKey });
});

app.post('/push/subscribe', pushJson, (req, res) => {
  const { uid, subscription } = req.body || {};
  if (!push.subscribe(uid, subscription)) return res.status(400).json({ ok: false });
  res.json({ ok: true });
});

app.post('/push/unsubscribe', pushJson, (req, res) => {
  if (typeof req.body?.endpoint === 'string') push.unsubscribe(req.body.endpoint);
  res.json({ ok: true });
});

// HSTS (opcional, HUBIFY_HSTS=1): manda o navegador usar sempre HTTPS neste endereço.
// Só ligue com certificado já confiável em TODOS os aparelhos (CA instalada ou certificado público):
// com HSTS o navegador deixa de oferecer "continuar mesmo assim" e de aceitar http:// neste nome.
const HSTS = /^(1|true|on|yes)$/i.test(process.env.HUBIFY_HSTS || '');
if (HSTS) {
  app.use((req, res, next) => {
    if (req.socket.encrypted) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
}

// ===== SERVIDOR ÚNICO (sem Docker) =====
// Com STATIC_DIR definido, este processo vira a porta de entrada da rede: entrega o site,
// repassa /api para o backend Java e atende em HTTPS com certificado autoassinado.
// Quem usa é o iniciar-servidor.ps1; no docker compose esse papel continua com o nginx.
const STATIC_DIR = process.env.STATIC_DIR ? path.resolve(process.env.STATIC_DIR) : null;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '0', 10);
const LOCAL_NAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

// IPs desta máquina na rede (para o certificado e para mostrar onde conectar)
const lanAddresses = () => Object.values(os.networkInterfaces())
  .flat()
  .filter(i => i && i.family === 'IPv4' && !i.internal)
  .map(i => i.address);

if (STATIC_DIR) {
  const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws: wss: data: blob:; worker-src 'self' blob:; " +
    "frame-src 'self' data: blob:; object-src 'self' data: blob:; base-uri 'self'; form-action 'self'";

  app.use((req, res, next) => {
    // Fora de localhost o navegador só libera microfone/câmera em HTTPS
    const hostname = (req.headers.host || '').replace(/:\d+$/, '');
    // (o certificado da autoridade local precisa poder ser baixado por HTTP, antes de o aparelho confiar no HTTPS)
    if (HTTPS_PORT && !req.socket.encrypted && !LOCAL_NAMES.has(hostname) && req.path !== '/health' && req.path !== '/hubify-ca.crt') {
      return res.redirect(307, `https://${hostname}${HTTPS_PORT === 443 ? '' : ':' + HTTPS_PORT}${req.originalUrl}`);
    }
    // O navegador só pode falar com este servidor: nada de fontes, scripts ou conexões externas
    res.setHeader('Content-Security-Policy', CSP);
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // /api -> backend Java (em fluxo, sem carregar o corpo na memória)
  const backendOrigin = new URL(BACKEND_URL);
  app.use('/api', (req, res) => {
    const upstream = http.request({
      hostname: backendOrigin.hostname,
      port: backendOrigin.port || 80,
      method: req.method,
      path: req.originalUrl,
      headers: { ...req.headers, host: backendOrigin.host, 'x-forwarded-for': req.socket.remoteAddress || '', 'x-forwarded-proto': req.socket.encrypted ? 'https' : 'http' },
    }, (up) => {
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    });
    upstream.on('error', () => {
      if (!res.headersSent) res.status(502).json({ error: 'Backend indisponível' });
      else res.destroy();
    });
    req.pipe(upstream);
  });

  app.use(express.static(STATIC_DIR, {
    index: false,
    setHeaders: (res, file) => {
      // Arquivos com hash no nome podem ficar em cache; o index.html nunca
      if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });
}

// ===== HTTPS SEM AVISO NO NAVEGADOR =====
// Em vez de um certificado autoassinado solto (que todo navegador recusa), o servidor cria uma
// pequena AUTORIDADE CERTIFICADORA LOCAL (CA) e usa ela para assinar o certificado do site.
//   - A CA é criada uma única vez e nunca muda: cada aparelho instala o arquivo hubify-ca.crt
//     como "autoridade confiável" uma vez e o aviso "sua conexão não é particular" some de vez.
//   - O certificado do site é refeito sozinho quando os IPs da máquina mudam ou perto de vencer,
//     sem precisar reinstalar nada nos aparelhos.
// O arquivo da CA fica disponível em /hubify-ca.crt (só a parte pública; a chave nunca sai do servidor).
const LEAF_DAYS = 800;        // iPhone/iPad recusam certificados de site com mais de 825 dias
const RENEW_BEFORE_DAYS = 30;

const loadOrCreateCertificate = () => {
  const forge = require('node-forge');
  const { pki, md } = forge;
  const files = {
    caKey: path.join(CERT_DIR, 'hubify-ca.key'), caCert: CA_CERT_FILE,
    key: path.join(CERT_DIR, 'server.key'), cert: path.join(CERT_DIR, 'server.crt'), meta: path.join(CERT_DIR, 'server.json'),
  };
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const serial = () => '00' + crypto.randomBytes(15).toString('hex');
  const days = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

  // 1) Autoridade local (uma vez só)
  let caKey, caCert;
  try {
    caKey = pki.privateKeyFromPem(fs.readFileSync(files.caKey, 'utf8'));
    caCert = pki.certificateFromPem(fs.readFileSync(files.caCert, 'utf8'));
  } catch {
    console.log('[HTTPS] Criando a autoridade certificadora local (só na primeira vez)...');
    const keys = pki.rsa.generateKeyPair(2048);
    caKey = keys.privateKey;
    caCert = pki.createCertificate();
    caCert.publicKey = keys.publicKey;
    caCert.serialNumber = serial();
    caCert.validity.notBefore = days(-1);
    caCert.validity.notAfter = days(3650);
    const subject = [{ name: 'commonName', value: `Hubify CA local (${os.hostname()})` }, { name: 'organizationName', value: 'Hubify' }];
    caCert.setSubject(subject);
    caCert.setIssuer(subject);
    caCert.setExtensions([
      { name: 'basicConstraints', cA: true, pathLenConstraint: 0, critical: true },
      { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
      { name: 'subjectKeyIdentifier' },
    ]);
    caCert.sign(caKey, md.sha256.create());
    fs.writeFileSync(files.caKey, pki.privateKeyToPem(caKey), { mode: 0o600 });
    fs.writeFileSync(files.caCert, pki.certificateToPem(caCert));
  }
  const caPem = pki.certificateToPem(caCert);

  // 2) Certificado do site, assinado pela autoridade
  const extra = (process.env.HUBIFY_HOSTS || '').split(',').map(h => h.trim()).filter(Boolean);
  const hosts = [...new Set(['localhost', '127.0.0.1', os.hostname(), ...lanAddresses(), ...extra])].sort();
  try {
    const meta = JSON.parse(fs.readFileSync(files.meta, 'utf8'));
    const fresh = new Date(meta.notAfter).getTime() - Date.now() > RENEW_BEFORE_DAYS * 86400000;
    if (fresh && meta.ca === caCert.serialNumber && JSON.stringify(meta.hosts) === JSON.stringify(hosts)) {
      return { key: fs.readFileSync(files.key), cert: fs.readFileSync(files.cert), caFile: files.caCert };
    }
  } catch { /* ainda não existe ou está ilegível: gera abaixo */ }

  const isIp = (h) => /^\d+\.\d+\.\d+\.\d+$/.test(h);
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = serial();
  cert.validity.notBefore = days(-1);
  cert.validity.notAfter = days(LEAF_DAYS);
  cert.setSubject([{ name: 'commonName', value: 'Hubify (rede interna)' }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: hosts.map(h => (isIp(h) ? { type: 7, ip: h } : { type: 2, value: h })) },
    { name: 'authorityKeyIdentifier', keyIdentifier: caCert.generateSubjectKeyIdentifier().getBytes() },
  ]);
  cert.sign(caKey, md.sha256.create());

  const keyPem = pki.privateKeyToPem(keys.privateKey);
  const chainPem = pki.certificateToPem(cert) + caPem; // o navegador recebe o site + a autoridade
  fs.writeFileSync(files.key, keyPem, { mode: 0o600 });
  fs.writeFileSync(files.cert, chainPem);
  fs.writeFileSync(files.meta, JSON.stringify({ hosts, ca: caCert.serialNumber, notAfter: cert.validity.notAfter.toISOString() }));
  console.log(`[HTTPS] Certificado do site gerado para: ${hosts.join(', ')}`);
  return { key: keyPem, cert: chainPem, caFile: files.caCert };
};

const IO_OPTIONS = {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  // Detecta mais rápido aparelhos que sumiram sem avisar (navegador do celular fechado)
  pingInterval: 10000,
  pingTimeout: 10000,
  // Anexos vão em base64 dentro da mensagem (mesmo limite do nginx/backend)
  maxHttpBufferSize: 12e6
};
const io = new Server(server, IO_OPTIONS);

io.engine.on("connection_error", (err) => {
  console.log(`[!] Connection Error:`, err.req ? `Request to ${err.req.url}` : 'No request', `| Code: ${err.code} | Message: ${err.message}`);
});

const backend = async (method, path, body) => {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Backend ${method} ${path} respondeu ${res.status}`);
  return res.json();
};

// ---------- Push: quem avisar e o que escrever ----------
// Membros dos grupos (para avisar quem está com o app fechado), com cache curto
let groupsCache = { at: 0, byId: new Map() };
const groupInfo = async (groupId) => {
  if (Date.now() - groupsCache.at > 30000) {
    try {
      const docs = await backend('GET', '/data/groups');
      const byId = new Map();
      for (const d of docs) { try { const g = JSON.parse(d.jsonData); byId.set(g.id || d.id, g); } catch { /* documento ilegível */ } }
      groupsCache = { at: Date.now(), byId };
    } catch (e) {
      console.error('[PUSH] Não foi possível ler os grupos:', e.message);
    }
  }
  return groupsCache.byId.get(groupId) || null;
};

const clip = (text, max = 140) => { const t = String(text || '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };

const messagePreview = (m) => {
  if (m.text) return clip(m.text);
  const type = m.attachment?.type || '';
  if (type.startsWith('audio/')) return '🎤 Mensagem de voz';
  if (type.startsWith('image/')) return '📷 Foto';
  if (m.attachment) return `📎 ${clip(m.attachment.name || 'Arquivo', 80)}`;
  return 'Nova mensagem';
};

// Mensagem nova: avisa o outro lado da DM ou os membros do grupo (o aparelho decide se mostra:
// com o Hubify aberto e em foco, o service worker não exibe nada)
const pushMessage = async (message) => {
  if (!push.state.enabled || push.count() === 0 || message.isDeleted) return;
  const sender = message.senderName || 'Hubify';
  let targets = [];
  let title = sender;
  if (message.roomId.startsWith('dm_')) {
    targets = message.roomId.slice(3).split('_').filter(id => id && id !== message.senderId);
  } else {
    const group = await groupInfo(message.roomId);
    if (!group) return;
    targets = (group.members || []).filter(id => id !== message.senderId);
    title = group.name || 'Grupo';
  }
  const body = message.roomId.startsWith('dm_') ? messagePreview(message) : `${sender.split(' ')[0]}: ${messagePreview(message)}`;
  const payload = { kind: 'message', title, body, tag: `room:${message.roomId}`, url: `/?room=${encodeURIComponent(message.roomId)}` };
  targets.forEach(uid => push.send(uid, payload, { ttl: 24 * 3600 }).catch(() => {}));
};

// Presença no backend (não bloqueia a entrada na sala)
const setOnline = (uid, isOnline) => {
  backend('PUT', `/auth/users/${uid}`, { isOnline })
    .catch(e => console.error(`[STATUS] Error updating presence for ${uid}:`, e.message));
};

// Presença: sockets abertos por usuário. Só fica offline quando o último aparelho desconecta.
const userSockets = new Map(); // uid -> Set(socketId)
const offlineTimers = new Map(); // uid -> timeout (tolerância para reconexões rápidas)

const userRoom = (uid) => `user:${uid}`;
const chatRoom = (roomId) => `chat:${roomId}`;

// Quem deve receber eventos de uma conversa: os dois lados de uma DM, ou quem assina o grupo
const recipientsOf = (roomId) => {
  if (roomId.startsWith('dm_')) {
    return roomId.slice(3).split('_').filter(Boolean).map(userRoom);
  }
  return [chatRoom(roomId)];
};

// Pode falar nesta conversa? (DM só entre os dois participantes)
const canUseRoom = (socket, roomId) => {
  if (!socket.userId || typeof roomId !== 'string' || !roomId) return false;
  if (roomId.startsWith('dm_')) return roomId.slice(3).split('_').includes(socket.userId);
  return true;
};

// Convites de chamada em andamento: callId -> convite (entregue também a quem conectar depois)
const pendingCalls = new Map();
const CALL_RING_MS = 50000;

const closeCall = (callId) => {
  const call = pendingCalls.get(callId);
  if (!call) return null;
  clearTimeout(call.timer);
  pendingCalls.delete(callId);
  return call;
};

const registerPresence = (socket, uid) => {
  if (!uid || socket.userId === uid) return;
  socket.userId = uid;
  socket.join(userRoom(uid));
  if (!userSockets.has(uid)) userSockets.set(uid, new Set());
  const sockets = userSockets.get(uid);
  sockets.add(socket.id);
  clearTimeout(offlineTimers.get(uid));
  offlineTimers.delete(uid);
  if (sockets.size === 1) setOnline(uid, true);

  // Aparelho que acabou de conectar ainda deve tocar se houver uma chamada para ele
  for (const call of pendingCalls.values()) {
    if (call.to === uid) socket.emit('call-incoming', call.invite);
  }
};

const unregisterPresence = (socket) => {
  const uid = socket.userId;
  const sockets = uid && userSockets.get(uid);
  if (!sockets) return;
  sockets.delete(socket.id);
  if (sockets.size > 0) return;
  userSockets.delete(uid);
  offlineTimers.set(uid, setTimeout(() => {
    offlineTimers.delete(uid);
    if (userSockets.has(uid)) return;
    setOnline(uid, false);
    // Quem ligou caiu de vez: para de tocar no outro lado
    for (const [callId, call] of pendingCalls) {
      if (call.from === uid) {
        closeCall(callId);
        io.to(userRoom(call.to)).emit('call-cancelled', { callId });
      }
    }
  }, 5000));
};

// State
const rooms = {}; // roomId -> Map of participant states

const cleanupRoom = (roomId) => {
  if (rooms[roomId] && rooms[roomId].size === 0) {
    delete rooms[roomId];
    console.log(`[GC] Room ${roomId} removed from memory (empty). Active rooms: ${Object.keys(rooms).length}`);
  }
};

const ack = (fn, payload) => { if (typeof fn === 'function') fn(payload); };

io.on('connection', (socket) => {
  console.log(`[+] User connected: ${socket.id} | Active connections: ${io.engine.clientsCount}`);

  // Relógio do servidor: o cliente calcula a diferença para o seu (ordem e "lida" corretas)
  socket.on('server-time', (fn) => ack(fn, Date.now()));

  // Cada aparelho se identifica ao conectar (não depende de abrir uma conversa)
  socket.on('presence', ({ uid } = {}) => registerPresence(socket, uid));

  // Grupos que este aparelho acompanha (mensagens, digitando, leitura)
  socket.on('subscribe-rooms', ({ rooms: roomIds } = {}) => {
    if (!Array.isArray(roomIds)) return;
    const wanted = new Set(roomIds.filter(id => typeof id === 'string' && !id.startsWith('dm_')).map(chatRoom));
    for (const r of socket.rooms) {
      if (r.startsWith('chat:') && !wanted.has(r)) socket.leave(r);
    }
    wanted.forEach(r => socket.join(r));
  });

  // ---------- Mensagens ----------
  // Grava no backend e só então entrega e confirma ao remetente (✓). Reenvio com o mesmo id é seguro.
  socket.on('send-message', async (message, fn) => {
    try {
      if (!message?.id || !canUseRoom(socket, message.roomId)) return ack(fn, { ok: false, error: 'invalid' });
      const { isOptimistic, status, ...clean } = message;
      const stored = { ...clean, senderId: socket.userId, timestamp: Date.now() };
      const saved = await backend('POST', '/data/messages', stored);
      const final = { ...stored, updatedAt: saved.updatedAt };
      socket.to(recipientsOf(final.roomId)).emit('message-created', final);
      ack(fn, { ok: true, message: final });
      pushMessage(final).catch(() => {});
    } catch (e) {
      console.error('[MSG] Falha ao salvar mensagem:', e.message);
      ack(fn, { ok: false, error: 'storage' });
    }
  });

  // Edição e exclusão ("Mensagem apagada")
  socket.on('update-message', async ({ id, roomId, changes } = {}, fn) => {
    try {
      if (!id || !changes || !canUseRoom(socket, roomId)) return ack(fn, { ok: false, error: 'invalid' });
      const saved = await backend('PATCH', `/data/messages/${encodeURIComponent(id)}`, changes);
      const message = { ...JSON.parse(saved.jsonData), updatedAt: saved.updatedAt };
      socket.to(recipientsOf(roomId)).emit('message-updated', message);
      ack(fn, { ok: true, message });
    } catch (e) {
      console.error('[MSG] Falha ao atualizar mensagem:', e.message);
      ack(fn, { ok: false, error: 'storage' });
    }
  });

  socket.on('typing', ({ roomId, userName } = {}) => {
    if (!canUseRoom(socket, roomId)) return;
    socket.to(recipientsOf(roomId)).emit('user-typing', { roomId, userId: socket.userId, userName });
  });

  socket.on('stop-typing', ({ roomId } = {}) => {
    if (!canUseRoom(socket, roomId)) return;
    socket.to(recipientsOf(roomId)).emit('user-stop-typing', { roomId, userId: socket.userId });
  });

  // Confirmação de leitura com a hora do servidor (mesma base do timestamp das mensagens)
  socket.on('messages-read', ({ roomId } = {}, fn) => {
    if (!canUseRoom(socket, roomId)) return ack(fn, { ok: false });
    const timestamp = Date.now();
    socket.to(recipientsOf(roomId)).emit('user-read-messages', { userId: socket.userId, roomId, timestamp });
    ack(fn, { ok: true, timestamp });
  });

  socket.on('profile-update', ({ userId, data } = {}) => {
    if (!userId || userId !== socket.userId) return;
    socket.broadcast.emit('profile-update', { userId, data });
  });

  socket.on('conversation-deleted', ({ roomId, deletedBy, deletedAt } = {}) => {
    // DMs não são apagadas para o outro participante; grupos sim
    if (!roomId || !roomId.startsWith('group_')) return;
    socket.to(chatRoom(roomId)).emit('conversation-deleted', { roomId, deletedBy, deletedAt });
  });

  // ---------- Convites de chamada (entrega imediata, sem passar pelo banco) ----------
  socket.on('call-invite', (invite, fn) => {
    if (!socket.userId || !invite?.callId || !invite?.to || !invite?.roomId) return ack(fn, { ok: false });
    const call = {
      callId: invite.callId,
      from: socket.userId,
      to: invite.to,
      invite: { ...invite, id: invite.callId, from: socket.userId, status: 'ringing', timestamp: Date.now() }
    };
    closeCall(call.callId);
    call.timer = setTimeout(() => {
      if (!closeCall(call.callId)) return;
      io.to(userRoom(call.from)).emit('call-missed', { callId: call.callId });
      io.to(userRoom(call.to)).emit('call-cancelled', { callId: call.callId });
    }, CALL_RING_MS);
    pendingCalls.set(call.callId, call);
    io.to(userRoom(call.to)).emit('call-incoming', call.invite);
    if (!userSockets.has(call.to)) {
      push.send(call.to, {
        kind: 'call', title: clip(invite.fromName || 'Chamada', 60),
        body: invite.type === 'audio' ? 'Chamada de voz recebida' : 'Chamada de vídeo recebida',
        tag: `call:${call.callId}`, url: '/', requireInteraction: true,
      }, { ttl: Math.round(CALL_RING_MS / 1000), urgency: 'high' }).catch(() => {});
    }
    console.log(`[CALL] ${call.from} -> ${call.to} (${invite.type}) ${call.callId}`);
    ack(fn, { ok: true, online: userSockets.has(call.to) });
  });

  // ---------- Convite para reunião / sala em grupo (MEETING_INVITE) ----------
  // Diferente da chamada 1:1, não toca: vira um aviso na tela (e um push) com "Entrar na reunião".
  socket.on('meeting-invite', (invite, fn) => {
    if (!socket.userId || !invite?.to || !invite?.roomId || invite.to === socket.userId) return ack(fn, { ok: false });
    const payload = {
      id: `mi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      from: socket.userId,
      to: invite.to,
      roomId: String(invite.roomId),
      roomName: clip(invite.roomName || 'Reunião', 80),
      type: invite.type === 'audio' ? 'audio' : 'video',
      fromName: clip(invite.fromName || 'Alguém', 60),
      fromAvatar: invite.fromAvatar || null,
      timestamp: Date.now(),
    };
    io.to(userRoom(payload.to)).emit('meeting-invite', payload);
    push.send(payload.to, {
      kind: 'meeting-invite', title: payload.roomName,
      body: `${payload.fromName} convidou você para entrar`,
      tag: `meeting:${payload.roomId}`,
      url: `/?join=${encodeURIComponent(payload.roomId)}&type=${payload.type}`,
      actions: [{ action: 'join', title: 'Entrar na reunião' }],
    }, { ttl: 600, urgency: 'high' }).catch(() => {});
    console.log(`[MEETING] Convite ${payload.from} -> ${payload.to} (${payload.roomId})`);
    ack(fn, { ok: true, online: userSockets.has(payload.to) });
  });

  socket.on('call-accept', ({ callId } = {}, fn) => {
    const call = pendingCalls.get(callId);
    if (!call || call.to !== socket.userId) return ack(fn, { ok: false });
    closeCall(callId);
    ack(fn, { ok: true });
    io.to(userRoom(call.from)).emit('call-accepted', { callId, roomId: call.invite.roomId });
    // Outros aparelhos de quem atendeu param de tocar
    socket.to(userRoom(call.to)).emit('call-cancelled', { callId });
  });

  socket.on('call-decline', ({ callId, reason } = {}) => {
    const call = pendingCalls.get(callId);
    if (!call || call.to !== socket.userId) return;
    closeCall(callId);
    io.to(userRoom(call.from)).emit('call-declined', { callId, reason: reason || 'declined' });
    socket.to(userRoom(call.to)).emit('call-cancelled', { callId });
  });

  socket.on('call-cancel', ({ callId } = {}) => {
    const call = pendingCalls.get(callId);
    if (!call || call.from !== socket.userId) return;
    closeCall(callId);
    io.to(userRoom(call.to)).emit('call-cancelled', { callId });
  });

  // ---------- Sala da chamada (WebRTC) ----------
  socket.on('join-room', ({ roomId, uid, name, avatarUrl } = {}) => {
    try {
      if (!roomId) return;
      socket.join(roomId);
      registerPresence(socket, uid);

      if (!rooms[roomId]) rooms[roomId] = new Map();
      const isNew = !rooms[roomId].has(socket.id);
      rooms[roomId].set(socket.id, { isMicOn: true, isCamOn: true, ...rooms[roomId].get(socket.id), uid, name, avatarUrl, socketId: socket.id });

      // Quem já está na sala inicia a conexão WebRTC com o novo participante
      if (isNew) socket.to(roomId).emit('user-connected', socket.id);

      const participants = Array.from(rooms[roomId].values());
      io.to(roomId).emit('room-participants', participants);
      console.log(`[ROOM] User ${name} (${uid}) joined ${roomId}. Participants: ${participants.length}`);
    } catch (e) {
      console.error(`Error joining room:`, e);
    }
  });

  socket.on('update-user-state', ({ roomId, state } = {}) => {
    try {
      if (rooms[roomId] && rooms[roomId].has(socket.id)) {
        const current = rooms[roomId].get(socket.id);
        rooms[roomId].set(socket.id, { ...current, ...state });
        io.to(roomId).emit('room-participants', Array.from(rooms[roomId].values()));
      }
    } catch (e) {
      console.error(`Error updating state:`, e);
    }
  });

  socket.on('send-chat', ({ roomId, message } = {}) => {
    if (rooms[roomId]?.has(socket.id)) io.to(roomId).emit('receive-chat', message);
  });

  // Sinalização WebRTC (classe Peer)
  socket.on("sending-signal", payload => {
    const sig = payload.signal || {};
    if (sig.type) console.log(`[SIGNAL] ${payload.callerID} -> ${payload.userToSignal}: ${sig.type}`);
    io.to(payload.userToSignal).emit('user-joined', { signal: payload.signal, callerID: socket.id });
  });

  socket.on("returning-signal", payload => {
    const sig = payload.signal || {};
    if (sig.type) console.log(`[SIGNAL] ${socket.id} -> ${payload.callerID}: ${sig.type}`);
    io.to(payload.callerID).emit('receiving-returned-signal', { signal: payload.signal, id: socket.id });
  });

  socket.on('leave-room', ({ roomId } = {}) => {
    socket.leave(roomId);
    if (rooms[roomId] && rooms[roomId].delete(socket.id)) {
      io.to(roomId).emit('room-participants', Array.from(rooms[roomId].values()));
      io.to(roomId).emit('user-disconnected', socket.id);
      cleanupRoom(roomId);
    }
  });

  socket.on('end-call', ({ roomId } = {}) => {
    if (rooms[roomId]?.has(socket.id)) io.to(roomId).emit('call-ended');
  });

  socket.on('disconnect', () => {
    console.log(`[-] User disconnected: ${socket.id} | Active connections: ${io.engine.clientsCount}`);
    unregisterPresence(socket);

    for (const roomId in rooms) {
      if (rooms[roomId].delete(socket.id)) {
        io.to(roomId).emit('room-participants', Array.from(rooms[roomId].values()));
        io.to(roomId).emit('user-disconnected', socket.id);
        cleanupRoom(roomId);
      }
    }
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Video Signaling Server listening on port ${PORT} at 0.0.0.0`);
});

if (HTTPS_PORT) {
  const { key, cert, caFile } = loadOrCreateCertificate();
  const secureServer = https.createServer({ key, cert }, app);
  io.attach(secureServer, IO_OPTIONS);
  secureServer.on('error', (e) => {
    console.error(`[HTTPS] Não foi possível abrir a porta ${HTTPS_PORT}: ${e.code === 'EADDRINUSE' ? 'ela já está em uso por outro programa' : e.message}`);
    process.exit(1);
  });
  secureServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    const suffix = HTTPS_PORT === 443 ? '' : `:${HTTPS_PORT}`;
    const line = '='.repeat(62);
    console.log(`\n${line}\n  HUBIFY NO AR — conecte pelo navegador de qualquer aparelho da rede:\n`);
    lanAddresses().forEach(ip => console.log(`     https://${ip}${suffix}`));
    console.log(`\n  Nesta máquina:  http://localhost:${PORT}`);
    console.log(`\n  PARA O NAVEGADOR NÃO MOSTRAR "SUA CONEXÃO NÃO É PARTICULAR":`);
    console.log(`  instale uma única vez, em cada aparelho, o certificado da autoridade local:`);
    lanAddresses().forEach(ip => console.log(`     http://${ip}:${PORT}/hubify-ca.crt`));
    console.log(`  (arquivo: ${caFile} — passo a passo no README, seção "HTTPS sem aviso")\n${line}\n`);
  });
}
