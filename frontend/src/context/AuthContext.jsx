
import { disablePush } from '../pwa';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { API_URL } from '../config';
import { 
  fetchCollection, listenToCollection, getDatabase, getDocumentPath, saveDocument 
} from '../api-client';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentUserProfile, setCurrentUserProfile] = useState(null);
  const [userStatus, setUserStatus] = useState('online');
  const [loading, setLoading] = useState(true);

  const appId = 'hubify';
  const db = getDatabase();

  useEffect(() => {
    const savedUser = localStorage.getItem('hubify_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setCurrentUserProfile(null);
      return;
    }

    // Ao logar, já definimos um perfil básico baseado no que recebemos do login
    const parseResilient = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      if (typeof val !== 'string') return [];
      try {
        return JSON.parse(val);
      } catch (e) {
        // Tenta limpar colchetes e dividir por vírgula se for formato [uuid, uuid] sem aspas
        if (val.startsWith('[') && val.endsWith(']')) {
          return val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, '')).filter(Boolean);
        }
        return [];
      }
    };
    const parsedDMs = parseResilient(user.activeDMs);

    setCurrentUserProfile({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      name: user.displayName || user.username,
      avatarUrl: user.avatarUrl,
      status: user.status || 'online',
      statusMessage: user.statusMessage || '',
      email: user.email,
      role: user.role,
      bio: user.bio,
      readTimestamps: user.readTimestamps,
      activeDMs: Array.isArray(parsedDMs) ? parsedDMs : []
    });

    const markOnline = async () => {
      if (user?.id) {
        await fetch(`${API_URL}/auth/users/${user.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isOnline: true, status: 'online' })
        }).catch(() => {});
      }
    };
    markOnline();

    const unsub = listenToCollection(`artifacts/${appId}/public/data/users`, (snap) => {
      const found = snap.docs.find(d => d.id === user.id);
      if (found) {
        setCurrentUserProfile(found.data());
        setUserStatus(found.data().status || 'online');
      }
    });

    // Marcar como offline ao fechar a aba/navegador
    const handleUnload = () => {
      if (user?.id) {
        const url = `${API_URL}/auth/users/${user.id}`;
        const data = JSON.stringify({ status: 'offline', isOnline: false });
        
        fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: data,
          keepalive: true
        });
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', handleUnload);
      handleUnload(); // Também marcar como offline ao desmascarar o contexto (logout/reload)
    };
  }, [user?.id]);

  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('hubify_user', JSON.stringify(userData));
  };

  const logout = () => {
    // Este aparelho deixa de receber as notificações de quem saiu
    disablePush();
    setUser(null);
    setCurrentUserProfile(null);
    localStorage.removeItem('hubify_user');
  };

  const value = {
    user,
    currentUserProfile,
    userStatus,
    setUserStatus: (status) => {
      setUserStatus(status);
      if (user) {
        saveDocument(`artifacts/${appId}/public/data/users/${user.id}`, { status }, { merge: true });
      }
    },
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
