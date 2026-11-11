import { SOCKET_URL } from '../../../config';

// Busca STUN/TURN no servidor de sinalização (credenciais TURN são temporárias)

// Rede interna: sem STUN/TURN externos. Na mesma rede os aparelhos se conectam direto
// (candidatos "host"); um TURN local, se configurado, vem do servidor de sinalização.
const FALLBACK_ICE_SERVERS = [];

let cached = null;
let expiresAt = 0;
let pending = null;

export function loadIceServers() {
  if (cached && Date.now() < expiresAt) return Promise.resolve(cached);
  if (pending) return pending;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  pending = fetch(`${SOCKET_URL}/ice-servers`, { signal: controller.signal })
    .then(res => res.json())
    .then(({ iceServers, ttl }) => {
      cached = iceServers;
      // Renova na metade do TTL para não usar credenciais vencidas
      expiresAt = Date.now() + (ttl || 300) * 500;
      const hasTurn = iceServers.some(s => [].concat(s.urls).some(u => u.startsWith('turn')));
      console.log(`[WebRTC] ICE servers carregados (TURN: ${hasTurn ? 'sim' : 'NÃO'})`);
      return cached;
    })
    .catch(err => {
      console.error('[WebRTC] Falha ao buscar ICE servers, usando conexão direta na rede local:', err);
      return FALLBACK_ICE_SERVERS;
    })
    .finally(() => {
      clearTimeout(timeout);
      pending = null;
    });

  return pending;
}

export function getIceServers() {
  return cached || FALLBACK_ICE_SERVERS;
}
