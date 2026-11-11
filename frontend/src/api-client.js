
/**
 * Hubify API Client
 * Centralized communication layer for Hubify platform backend.
 */

import { API_URL } from './config';

// Database core functions
export const getDatabase = () => ({});

export const getCollectionPath = (db, ...paths) => {
  return paths.join('/');
};

export const getDocumentPath = (db, ...paths) => {
  return paths.join('/');
};

/**
 * Real-time listener for collection changes
 */
export const listenToCollection = (path, callback, intervalMs = 5000) => {
  let interval;
  let lastHash = '';
  let inFlight = false;
  
  const fetchPath = async () => {
    // Aba em segundo plano não precisa atualizar; nem empilhar requisições se a rede estiver lenta
    if (inFlight || document.hidden) return;
    inFlight = true;
    try {
      let url = '';
      const isUser = path.includes('users');
      
      if (isUser) url = `${API_URL}/auth/users`;
      else if (path.includes('messages')) url = `${API_URL}/data/messages`;
      else if (path.includes('groups')) url = `${API_URL}/data/groups`;
      else if (path.includes('meetings')) url = `${API_URL}/data/meetings`;
      else if (path.includes('calls')) url = `${API_URL}/data/calls`;
      else if (path.includes('invites')) url = `${API_URL}/data/invites`;

      if (!url) return;

      const res = await fetch(`${url}?t=${Date.now()}`);
      if (res.ok) {
        const text = await res.text();
        if (text === lastHash) return;
        lastHash = text;

        const data = JSON.parse(text);
        let mappedDocs = [];
        
        if (isUser) {
          mappedDocs = data.map(d => ({
            id: d.id,
            ...d,
            data: () => ({ 
              id: d.id,
              username: d.username,
              email: d.email,
              displayName: d.displayName,
              name: d.displayName || d.username, 
              role: d.role, 
              isOnline: d.online, 
              avatarUrl: d.avatarUrl, 
              bio: d.bio,
              status: d.status || (d.online ? 'online' : 'offline'),
              statusMessage: d.statusMessage || '',
              readTimestamps: d.readTimestamps,
              activeDMs: d.activeDMs
            })
          }));
        } else {
          mappedDocs = data.map(d => {
            const parsed = JSON.parse(d.jsonData);
            return {
              id: parsed.id || d.id,
              data: () => parsed
            };
          });
        }
        
        callback({ docs: mappedDocs });
      }
    } catch (e) {
    } finally {
      inFlight = false;
    }
  };

  const onVisible = () => { if (!document.hidden) fetchPath(); };
  fetchPath();
  interval = setInterval(fetchPath, intervalMs);
  document.addEventListener('visibilitychange', onVisible);
  
  return () => {
    clearInterval(interval);
    document.removeEventListener('visibilitychange', onVisible);
  };
};

/**
 * Mensagens alteradas desde `since` (hora do servidor) nas DMs do usuário e nos grupos.
 * Retorna { messages, cursor } — cursor é o maior updatedAt recebido.
 */
export const syncMessages = async ({ since = 0, userId, groupIds = [] }) => {
  const params = new URLSearchParams({ since: String(since) });
  if (userId) params.set('user', userId);
  if (groupIds.length) params.set('groups', groupIds.join(','));
  let res = await fetch(`${API_URL}/data/messages/sync?${params}`);
  let rows;
  if (res.status === 404 || res.status === 405) {
    // Backend ainda sem a rota de sincronização (não foi atualizado): baixa tudo e filtra aqui
    res = await fetch(`${API_URL}/data/messages?t=${Date.now()}`);
    if (!res.ok) throw new Error(`Mensagens respondeu ${res.status}`);
    const groups = new Set(groupIds);
    rows = (await res.json()).filter(row => {
      try {
        const roomId = JSON.parse(row.jsonData).roomId || '';
        return (userId && roomId.startsWith('dm_') && roomId.includes(userId)) || groups.has(roomId);
      } catch (e) { return false; }
    }).map(row => ({ ...row, updatedAt: row.updatedAt ?? 0 }));
    // Sem updatedAt no backend antigo: o cursor fica em 0 e cada sincronização relê tudo
    since = 0;
  } else {
    if (!res.ok) throw new Error(`Sync respondeu ${res.status}`);
    rows = await res.json();
  }
  let cursor = since;
  const messages = [];
  rows.forEach(row => {
    try {
      messages.push({ ...JSON.parse(row.jsonData), updatedAt: row.updatedAt });
      if (row.updatedAt > cursor) cursor = row.updatedAt;
    } catch (e) {}
  });
  return { messages, cursor };
};

/**
 * Create a new document in a collection
 */
export const createDocument = async (path, data) => {
  let url = '';
  if (path.includes('messages')) url = `${API_URL}/data/messages`;
  else if (path.includes('meetings')) url = `${API_URL}/data/meetings`;
  else if (path.includes('calls')) url = `${API_URL}/data/calls`;
  else if (path.includes('groups')) url = `${API_URL}/data/groups`;
  else if (path.includes('invites')) url = `${API_URL}/data/invites`;

  if (url) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (err) {
      console.error('API Error (createDocument):', err);
    }
  }
};

/**
 * Save or merge a document
 */
export const saveDocument = async (path, data, options = {}) => {
  const shouldMerge = Boolean(options?.merge);
  let url = '';
  if (path.includes('users')) {
    const userId = path.split('/').pop();
    url = `${API_URL}/auth/users/${userId}`;
    try {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API Error (${response.status}):`, errorText);
        return null;
      }
      
      return await response.json();
    } catch (err) {
      console.error('API Error (saveDocument users):', err);
      return null;
    }
  } else {
    const parts = path.split('/');
    const docId = parts.pop();
    const collectionName = parts.pop();
    url = `${API_URL}/data/${collectionName}`;

    try {
      // Merge é feito no servidor: não precisa baixar a coleção inteira antes
      const response = await fetch(shouldMerge ? `${url}/${encodeURIComponent(docId)}` : url, {
        method: shouldMerge ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: docId, ...data })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      console.error(`API Error (saveDocument ${collectionName}):`, err);
      return null;
    }
  }
};

export const patchDocument = async (path, data) => {
  return saveDocument(path, data, { merge: true });
};

/**
 * Fetch a full collection
 */
export const fetchCollection = async (path) => {
  try {
    let collectionName = '';
    if (path.includes('calls')) collectionName = 'calls';
    else if (path.includes('users')) collectionName = 'users';
    else if (path.includes('groups')) collectionName = 'groups';
    else if (path.includes('messages')) collectionName = 'messages';
    else if (path.includes('invites')) collectionName = 'invites';
    
    if (!collectionName) return { docs: [] };

    let url = collectionName === 'users' ? `${API_URL}/auth/users` : `${API_URL}/data/${collectionName}`;

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const mappedDocs = data.map(d => ({
        id: collectionName === 'users' ? d.id : (JSON.parse(d.jsonData).id || d.id),
        data: () => collectionName === 'users' ? d : JSON.parse(d.jsonData)
      }));
      return { docs: mappedDocs };
    }
  } catch (e) {
    console.error('API Error (fetchCollection):', e);
  }
  return { docs: [] };
};

/**
 * Delete a document
 */
export const removeDocument = async (path) => {
  const parts = String(path).split('/');
  const id = parts.pop();
  const collectionName = parts.pop();
  
  if (collectionName && id) {
    try {
      const url = `${API_URL}/data/${collectionName}/${id}`;
      return await fetch(url, { method: 'DELETE' });
    } catch (err) {
      console.error('API Error (removeDocument):', err);
    }
  }
};

// Legacy auth stubs (handled externally)
export const initializeApp = () => ({});
export const getAuth = () => ({});
export const onAuthStateChanged = (auth, callback) => (() => {});
export const signInAnonymously = async () => {};
export const signInWithCustomToken = async () => {};
