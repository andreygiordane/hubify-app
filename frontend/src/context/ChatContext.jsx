
import { getPrefs } from '../media/prefs';
import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import {
  getDatabase, listenToCollection, syncMessages,
  fetchCollection, patchDocument, saveDocument, removeDocument
} from '../api-client';
import { useAuth } from './AuthContext';
import { io } from 'socket.io-client';
import { loadIceServers } from '../components/video/utils/iceServers';

import { SOCKET_URL } from '../config';
import { syncPush, showLocalNotification, onNavigateRequest } from '../pwa';
const SOCKET_OPTIONS = {
  transports: ['polling', 'websocket'],
  // Nunca desiste de reconectar (celular que dormiu, troca de rede)
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
};

const SAFETY_SYNC_MS = 15000; // rede de segurança caso algum evento do socket se perca
const SYNC_OVERLAP_MS = 5000; // reconsulta um pouco antes do cursor (gravações simultâneas)
const TYPING_TTL_MS = 6000;

// IDs de usuário são UUID. Versões antigas chegaram a gravar dois IDs grudados numa mesma entrada
// ("<id1><id2>"): extrair todos os UUIDs recupera os contatos certos.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const extractUserIds = (val) => [...new Set(String(val || '').match(UUID_RE) || [])];

const parseJson = (val, fallback) => {
  if (!val) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch (e) { return fallback; }
};

const ChatContext = createContext();

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }) => {
  const { user, currentUserProfile, userStatus, setUserStatus } = useAuth();
  const appId = 'hubify';
  const db = getDatabase();

  // Estados
  const [activeRoomId, setActiveRoomId] = useState(() => localStorage.getItem('hubify_active_room_id') || null);
  const [callType, setCallType] = useState('video');
  const [mediaSettings, setMediaSettings] = useState({ video: true, audio: true });
  const [allMessages, setAllMessages] = useState([]);

  const handleUpdateProfile = async (data) => {
    try {
      await saveDocument(`artifacts/hubify/public/data/users/${user.id}`, data, { merge: true });
      
      // Emitir via socket para atualização instantânea para todos
      if (socketRef.current) {
        socketRef.current.emit('profile-update', { userId: user.id, data });
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      throw error;
    }
  };

  // Diferença entre o relógio do servidor e o deste aparelho: ordem das mensagens e "lida" não
  // podem depender do relógio de cada celular
  const clockOffsetRef = useRef(0);
  const serverNow = () => Date.now() + clockOffsetRef.current;

  // Grava a leitura no perfil (para outros aparelhos/recarregar) sem fazer um PUT por mensagem
  const readSaveTimer = useRef(null);
  const persistReadTimestamps = (next) => {
    clearTimeout(readSaveTimer.current);
    readSaveTimer.current = setTimeout(() => {
      saveDocument(`artifacts/hubify/public/data/users/${user.id}`, { readTimestamps: JSON.stringify(next) }, { merge: true })
        .catch(err => console.error('[MARK_READ] Erro ao salvar leitura:', err));
    }, 1500);
  };

  const markRoomAsRead = async (roomId) => {
    if (!roomId || !user?.id) return;

    const apply = (ts) => setReadTimestamps(prev => {
      if ((prev[roomId] || 0) >= ts) return prev;
      const next = { ...prev, [roomId]: ts };
      persistReadTimestamps(next);
      return next;
    });

    const s = socketRef.current;
    if (s?.connected) {
      // O servidor carimba a hora da leitura e avisa o outro lado (✓✓)
      s.timeout(5000).emit('messages-read', { roomId }, (err, res) => apply(!err && res?.ok ? res.timestamp : serverNow()));
    } else {
      apply(serverNow());
    }
  };

  const [groups, setGroups] = useState([]);
  const groupsRef = useRef(groups);
  useEffect(() => { groupsRef.current = groups; }, [groups]);
  
  // Rastrear salas em processo de deleção para evitar que reapareçam via polling
  const processingDeletions = useRef(new Set());
  
  // Rastrear timestamps de ordenação para evitar que deletar mensagens mude a posição do card
  const roomSortTimestamps = useRef({}); // { roomId: timestamp }
  const [users, setUsers] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [activeDMs, setActiveDMs] = useState([]);
  const [typingUsers, setTypingUsers] = useState({}); // { roomId: { userId: userName } }
  const [socket, setSocket] = useState(null);
  const socketRef = useRef(null);
  const [readTimestamps, setReadTimestamps] = useState({});
  
  // 🔥 NOVO: Estado separado para readTimestamps dos outros usuários (atualizado APENAS via Socket.IO)
  // Isso evita que o polling de usuários sobrescreva os dados
  const [otherUsersReadTimestamps, setOtherUsersReadTimestamps] = useState({});
  const [roomWallpapers, setRoomWallpapers] = useState(() => {
    try {
      const saved = localStorage.getItem('hubify_room_wallpapers');
      return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  const handleUpdateRoomWallpaper = (roomId, wallpaperId) => {
    setRoomWallpapers(prev => {
      const next = { ...prev, [roomId]: wallpaperId };
      localStorage.setItem('hubify_room_wallpapers', JSON.stringify(next));
      return next;
    });
  };
  
  useEffect(() => {
    const saved = parseJson(currentUserProfile?.readTimestamps, null);
    if (!saved) return;
    // Mescla: o perfil salvo pode estar atrás do que já foi lido neste aparelho
    setReadTimestamps(prev => {
      const next = { ...prev };
      Object.entries(saved).forEach(([roomId, ts]) => { next[roomId] = Math.max(next[roomId] || 0, ts || 0); });
      return next;
    });
  }, [currentUserProfile]);
  const [mutedRooms, setMutedRooms] = useState(() => {
    try {
      const saved = localStorage.getItem('hubify_muted_rooms');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // Interface e Modais
  const [view, setView] = useState(() => localStorage.getItem('hubify_active_view') || 'chat');
  const [incomingCall, setIncomingCall] = useState(null);
  const [isOutgoingCall, setIsOutgoingCall] = useState(false);
  const [outgoingTarget, setOutgoingTarget] = useState(null);
  const [showMediaSetup, setShowMediaSetup] = useState(false);

  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showDMModal, setShowDMModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showContactDetailModal, setShowContactDetailModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [showDayEventsModal, setShowDayEventsModal] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [previewDocument, setPreviewDocument] = useState(null);
  const [selectedChatMobile, setSelectedChatMobile] = useState(null);
  const [showChatInfo, setShowChatInfo] = useState(false);
  const [groupInvites, setGroupInvites] = useState([]);
  const [roomToDelete, setRoomToDelete] = useState(null);
  const [deletedRoomIds, setDeletedRoomIds] = useState(() => {
    try {
      const saved = localStorage.getItem('hubify_deleted_rooms');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const deletedRoomIdsRef = useRef(deletedRoomIds);
  useEffect(() => {
    deletedRoomIdsRef.current = deletedRoomIds;
    localStorage.setItem('hubify_deleted_rooms', JSON.stringify(deletedRoomIds));
  }, [deletedRoomIds]);

  // Estados de formulário/dados temporários
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [newMeetingTitle, setNewMeetingTitle] = useState('');
  const [newMeetingDate, setNewMeetingDate] = useState('');
  const [calendarItemType, setCalendarItemType] = useState('meeting');
  const [selectedInvitees, setSelectedInvitees] = useState([]);
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
  const [selectedContactDetail, setSelectedContactDetail] = useState(null);
  const [pendingFile, setPendingFile] = useState(null);
  const [uploadComment, setUploadComment] = useState('');
  const [meetingNotifications, setMeetingNotifications] = useState([]);
  // Convites para reuniões/salas em grupo: aviso na tela com "Entrar", sem toque de chamada
  const [meetingInvites, setMeetingInvites] = useState([]);
  const [newGroupAvatar, setNewGroupAvatar] = useState('');

  const statusConfig = {
    online: { label: 'Online', color: 'bg-green-500' },
    offline: { label: 'Offline', color: 'bg-gray-500' },
    ausente: { label: 'Ausente', color: 'bg-yellow-500' },
    reuniao: { label: 'Em Reunião', color: 'bg-blue-500' },
    ocupado: { label: 'Ocupado', color: 'bg-red-500' }
  };

  // Refs
  const messagesEndRef = useRef(null);
  const notificationAudio = useRef(new Audio('/audio/notificacao.mp3'));
  const notified10 = useRef(new Set());
  const notified5 = useRef(new Set());
  const notified0 = useRef(new Set());
  const notifiedHostJoined = useRef(new Set());

  const activeRoomIdRef = useRef(activeRoomId);
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
    localStorage.setItem('hubify_active_room_id', activeRoomId);
  }, [activeRoomId]);

  const mutedRoomsRef = useRef(mutedRooms);
  useEffect(() => {
    mutedRoomsRef.current = mutedRooms;
  }, [mutedRooms]);

  const playNotificationSound = (roomId = null) => {
    if (roomId && (mutedRoomsRef.current || []).includes(roomId)) return;
    if (!getPrefs().notificationSound) return;
    
    notificationAudio.current.currentTime = 0;
    notificationAudio.current.play().catch(e => {
      // Browsers often block auto-play until user interaction
      console.log('Audio playback pending user interaction');
    });
  };

  // Persistência
  const viewRef = useRef(view);
  const processedCallsRef = useRef(new Set());
  // Convites que EU enviei e ainda espero resposta (só eles podem me levar para a sala)
  const outgoingCallIdsRef = useRef(new Set());
  // Convites que já atendi/recusei: nunca devem tocar nem me puxar para a sala de novo
  const handledCallsRef = useRef(new Set());
  const incomingCallRef = useRef(incomingCall);
  const isOutgoingCallRef = useRef(isOutgoingCall);

  useEffect(() => {
    viewRef.current = view;
    localStorage.setItem('hubify_active_view', view);
  }, [view]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    isOutgoingCallRef.current = isOutgoingCall;
  }, [isOutgoingCall]);

  useEffect(() => {
    if (activeRoomId) localStorage.setItem('hubify_active_room_id', activeRoomId);
    else localStorage.removeItem('hubify_active_room_id');
  }, [activeRoomId]);

  // ---------- Mensagens: armazenamento local, fila de envio e sincronização ----------
  const knownIdsRef = useRef(new Set());
  const outboxKey = user?.id ? `hubify_outbox_${user.id}` : null;
  // Mensagens ainda não confirmadas pelo servidor (sobrevivem a recarregar a página)
  const outboxRef = useRef(new Map());
  const sendingRef = useRef(new Set());

  const persistOutbox = () => {
    if (!outboxKey) return;
    const pending = [...outboxRef.current.values()];
    try {
      localStorage.setItem(outboxKey, JSON.stringify(pending));
    } catch (e) {
      // Anexo grande demais para o localStorage: guarda ao menos os textos
      try { localStorage.setItem(outboxKey, JSON.stringify(pending.filter(m => !m.attachment))); } catch (e2) {}
    }
  };

  // Insere/atualiza mensagens sem duplicar e sem deixar uma versão antiga sobrescrever a nova
  const upsertMessages = (incoming) => {
    if (!incoming?.length) return;
    incoming.forEach(m => {
      knownIdsRef.current.add(m.id);
      // Versão do servidor confirma o envio
      if (m.updatedAt && outboxRef.current.delete(m.id)) persistOutbox();
      roomSortTimestamps.current[m.roomId] = Math.max(roomSortTimestamps.current[m.roomId] || 0, m.timestamp || 0);
    });
    setAllMessages(prev => {
      const byId = new Map(prev.map(m => [m.id, m]));
      incoming.forEach(m => {
        const current = byId.get(m.id);
        if (current?.updatedAt && m.updatedAt && m.updatedAt < current.updatedAt) return;
        byId.set(m.id, { ...current, ...m, status: m.updatedAt ? undefined : (m.status ?? current?.status) });
      });
      return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
    });
  };

  const deliverMessage = (msg) => {
    const s = socketRef.current;
    if (!s?.connected || sendingRef.current.has(msg.id)) return;
    sendingRef.current.add(msg.id);
    s.timeout(15000).emit('send-message', msg, (err, res) => {
      sendingRef.current.delete(msg.id);
      if (!err && res?.ok) {
        upsertMessages([res.message]);
      } else {
        console.warn(`[MSG] Envio de ${msg.id} falhou (${err ? 'timeout' : res?.error}); será reenviada`);
        upsertMessages([{ ...msg, status: 'failed' }]);
      }
    });
  };

  const queueMessage = (msg) => {
    outboxRef.current.set(msg.id, msg);
    persistOutbox();
    upsertMessages([msg]);
    deliverMessage(msg);
  };

  const flushOutbox = () => {
    outboxRef.current.forEach(msg => deliverMessage(msg));
  };

  const retryMessage = (messageId) => {
    const msg = outboxRef.current.get(messageId);
    if (!msg) return;
    upsertMessages([{ ...msg, status: 'sending' }]);
    deliverMessage(msg);
  };

  // Busca no servidor o que mudou desde a última sincronização (reconexão, voltar ao app, segurança)
  const syncCursorRef = useRef(0);
  const syncingRef = useRef(false);
  const firstSyncDoneRef = useRef(false);
  const syncedGroupsRef = useRef(new Set());

  const isHiddenRoom = (roomId) => processingDeletions.current.has(roomId) || deletedRoomIdsRef.current.includes(roomId);

  // Mensagens novas de outras pessoas: "lida" se a conversa está aberta na tela, senão notificação
  const handleIncoming = (messages) => {
    const fresh = messages.filter(m => !knownIdsRef.current.has(m.id) && m.senderId !== user.id && !m.isDeleted);
    upsertMessages(messages);
    if (!fresh.length || !firstSyncDoneRef.current) return;
    const activeRoom = activeRoomIdRef.current;
    const viewing = viewRef.current === 'chat' && !document.hidden;
    if (viewing && fresh.some(m => m.roomId === activeRoom)) markRoomAsRead(activeRoom);
    // Histórico antigo (ex.: grupo em que acabei de entrar) não toca notificação
    const recent = serverNow() - 2 * 60 * 1000;
    const notify = fresh.filter(m => m.timestamp > recent && !(viewing && m.roomId === activeRoom));
    if (notify.length) {
      const last = notify[notify.length - 1];
      playNotificationSound(last.roomId);
      if (document.hidden && !(mutedRoomsRef.current || []).includes(last.roomId)) {
        const group = groups.find(g => g.id === last.roomId);
        const sender = users.find(u => u.id === last.senderId)?.name || last.senderName || 'Nova mensagem';
        const kind = last.attachment?.type || '';
        const text = last.text || (kind.startsWith('audio/') ? 'Mensagem de voz' : kind.startsWith('image/') ? 'Foto' : last.attachment?.name || 'Nova mensagem');
        showLocalNotification({
          title: group ? group.name : sender,
          body: group ? `${sender.split(' ')[0]}: ${text}` : text,
          tag: `room:${last.roomId}`,
          url: `/?room=${encodeURIComponent(last.roomId)}`,
        });
      }
    }
  };

  const resyncRef = useRef(false);
  const runSync = async () => {
    if (!user?.id) return;
    if (syncingRef.current) { resyncRef.current = true; return; }
    syncingRef.current = true;
    try {
      const groupIds = groupsRef.current.map(g => g.id);
      const first = !syncCursorRef.current;
      const known = groupIds.filter(id => syncedGroupsRef.current.has(id));
      const fresh = groupIds.filter(id => !syncedGroupsRef.current.has(id));
      const since = first ? 0 : Math.max(0, syncCursorRef.current - SYNC_OVERLAP_MS);
      const requests = [syncMessages({ since, userId: user.id, groupIds: first ? groupIds : known })];
      // Grupo que acabou de aparecer: histórico completo só dele
      if (!first && fresh.length) requests.push(syncMessages({ since: 0, groupIds: fresh }));
      const results = await Promise.all(requests);
      groupIds.forEach(id => syncedGroupsRef.current.add(id));
      results.forEach(r => { syncCursorRef.current = Math.max(syncCursorRef.current, r.cursor); });
      handleIncoming(results.flatMap(r => r.messages).filter(m => m.roomId && !isHiddenRoom(m.roomId)));
      firstSyncDoneRef.current = true;
    } catch (e) {
      console.warn('[SYNC] Falha ao sincronizar mensagens:', e.message);
    } finally {
      syncingRef.current = false;
      if (resyncRef.current) {
        resyncRef.current = false;
        runSyncRef.current();
      }
    }
  };

  // Mantém sempre a versão mais nova das funções para os listeners registrados uma única vez
  const playNotificationSoundRef = useRef(playNotificationSound);
  playNotificationSoundRef.current = playNotificationSound;
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;
  const flushOutboxRef = useRef(flushOutbox);
  flushOutboxRef.current = flushOutbox;
  const handleIncomingRef = useRef(handleIncoming);
  handleIncomingRef.current = handleIncoming;
  const upsertMessagesRef = useRef(upsertMessages);
  upsertMessagesRef.current = upsertMessages;
  const markRoomAsReadRef = useRef(markRoomAsRead);
  markRoomAsReadRef.current = markRoomAsRead;

  // Recupera o que ficou sem enviar (página recarregada, aparelho sem rede)
  useEffect(() => {
    const saved = parseJson(outboxKey && localStorage.getItem(outboxKey), []) || [];
    outboxRef.current = new Map(saved.map(m => [m.id, m]));
    if (saved.length) upsertMessagesRef.current(saved.map(m => ({ ...m, status: 'sending' })));
  }, [outboxKey]);

  // ---------- Chamadas: convites via socket (chegam na hora, sem esperar o banco) ----------
  const emitCallInvite = (invite) => new Promise((resolve) => {
    const s = socketRef.current;
    if (!s?.connected) return resolve({ ok: false });
    s.timeout(8000).emit('call-invite', invite, (err, res) => resolve(err ? { ok: false } : res));
  });

  const myCallName = () => currentUserProfile?.name || user.username;

  // Convite para reunião/sala em grupo: aviso assíncrono (não toca como chamada)
  const emitMeetingInvite = (invite) => new Promise((resolve) => {
    const s = socketRef.current;
    if (!s?.connected) return resolve({ ok: false });
    s.timeout(8000).emit('meeting-invite', invite, (err, res) => resolve(err ? { ok: false } : res));
  });

  // Nome que aparece no convite: o grupo, a reunião agendada ou "Reunião de Fulano"
  const roomDisplayName = (rId) => {
    const group = groups.find(g => g.id === rId);
    if (group) return group.name;
    if (rId.startsWith('meeting_')) {
      const meeting = meetings.find(m => m.id === rId.replace('meeting_', ''));
      if (meeting?.title) return meeting.title;
    }
    return `Reunião de ${myCallName().split(' ')[0]}`;
  };

  const dismissMeetingInvite = (id) => setMeetingInvites(prev => prev.filter(i => i.id !== id));

  // "Entrar na reunião" (aviso na tela, notificação push ou link ?join=)
  const joinMeetingInvite = (invite) => {
    if (!invite?.roomId) return false;
    setMeetingInvites(prev => prev.filter(i => i.roomId !== invite.roomId));
    if (viewRef.current === 'room') {
      if (activeRoomIdRef.current !== invite.roomId) alert('Você já está em uma chamada ativa. Encerre-a antes de entrar em outra.');
      return false;
    }
    if (!socketRef.current?.connected) {
      setSuccessMessage('Sem conexão com o servidor. Aguarde reconectar e tente novamente.');
      setShowSuccessModal(true);
      return false;
    }
    const type = invite.type === 'audio' ? 'audio' : 'video';
    loadIceServers();
    setCallType(type);
    setMediaSettings({ video: type === 'video', audio: true });
    setActiveRoomId(invite.roomId);
    setView('room');
    setUserStatus('reuniao');
    return true;
  };

  const startCall = (rId, type) => {
    if (view === 'room') {
      alert("Você já está em uma chamada ativa. Encerre-a antes de iniciar outra.");
      return false;
    }
    if (!socketRef.current?.connected) {
      setSuccessMessage('Sem conexão com o servidor. Aguarde reconectar e tente novamente.');
      setShowSuccessModal(true);
      return false;
    }
    // Adianta as credenciais TURN enquanto toca
    loadIceServers();
    setCallType(type);
    setMediaSettings({ video: type === 'video', audio: true });

    if (rId.startsWith('dm_')) {
      const otherId = rId.replace('dm_', '').split('_').find(id => id !== user.id);
      const contact = users.find(u => u.id === otherId);

      if (contact?.status === 'reuniao' || contact?.status === 'ocupado') {
        alert(`${contact.name} está em outra reunião ou ocupado no momento.`);
        return false;
      }

      setIsOutgoingCall(true);
      setOutgoingTarget({
        id: otherId,
        name: contact?.name || 'Colega',
        avatarUrl: contact?.avatarUrl || "/image/sem_foto.avif"
      });

      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      outgoingCallIdsRef.current = new Set([callId]);

      emitCallInvite({
        callId, to: otherId, roomId: rId, type,
        fromName: myCallName(),
        fromAvatar: currentUserProfile?.avatarUrl
      }).then(res => {
        if (res?.ok || !outgoingCallIdsRef.current.has(callId)) return;
        outgoingCallIdsRef.current.clear();
        setIsOutgoingCall(false);
        setSuccessMessage('Falha ao iniciar a chamada. Verifique sua conexão e tente novamente.');
        setShowSuccessModal(true);
      });
      return true;
    }

    // Grupo: quem liga entra direto na sala e os membros recebem o convite
    const group = groups.find(g => g.id === rId);
    if (group) {
      group.members.forEach((memberId) => {
        if (memberId === user.id) return;
        const member = users.find(u => u.id === memberId);
        if (member?.status === 'reuniao' || member?.status === 'ocupado') return;
        emitMeetingInvite({
          to: memberId, roomId: rId, roomName: group.name, type,
          fromName: myCallName(),
          fromAvatar: currentUserProfile?.avatarUrl
        });
      });
    }
    setActiveRoomId(rId);
    setView('room');
    setUserStatus('reuniao');
    setIsOutgoingCall(false);
    return true;
  };

  const handleStartMeeting = async (forcedRoomId = null) => {
    const rId = forcedRoomId || activeRoomId;
    if (!rId) return;

    if (rId.startsWith('meeting_')) {
      // Reunião agendada
      const mtgId = rId.replace('meeting_', '');
      const meeting = meetings.find(m => m.id === mtgId);

      if (meeting) {
        if (meeting.creatorId === user.id) {
          // Anfitrião entra e inicia a reunião
          await saveDocument(`artifacts/${appId}/public/data/meetings/${mtgId}`, { status: 'ongoing' }, { merge: true });
        } else if (meeting.status !== 'ongoing') {
          // Convidado tentando entrar antes do host
          setSuccessMessage("Aguarde, a reunião começa em breve. O anfitrião ainda não iniciou a sala.");
          setShowSuccessModal(true);
          return;
        }
      }
    }
    startCall(rId, 'video');
  };

  const handleStartAudioCall = async (forcedRoomId = null) => {
    const rId = forcedRoomId || activeRoomId;
    if (!rId) return;
    startCall(rId, 'audio');
  };

  const handleInviteToCall = async (targetId, roomId, type) => {
    const contact = users.find(u => u.id === targetId);
    if (contact?.status === 'reuniao' || contact?.status === 'ocupado') {
      alert(`${contact.name} já está em uma reunião ou ocupado.`);
      return;
    }

    // Convidar alguém para a sala onde já estou: aviso com "Entrar na reunião", sem toque
    const res = await emitMeetingInvite({
      to: targetId, roomId, roomName: roomDisplayName(roomId), type: type || 'video',
      fromName: myCallName(),
      fromAvatar: currentUserProfile?.avatarUrl
    });
    if (!res?.ok) throw new Error('Convite não enviado');
  };

  const newMessageId = (prefix = 'msg') => `${prefix}_${Date.now()}_${user.id}_${Math.random().toString(36).substr(2, 5)}`;

  const handleSendMessage = async (text, attachment = null, replyToId = null) => {
    if (!activeRoomId || !user) return;

    if (activeRoomId.startsWith('dm_')) {
      const otherId = activeRoomId.replace('dm_', '').split('_').find(id => id !== user.id);
      if (otherId && !activeDMs.includes(otherId)) {
        const newDMs = [...activeDMs, otherId];
        setActiveDMs(newDMs);
        saveDocument(`artifacts/${appId}/public/data/users/${user.id}`, { activeDMs: JSON.stringify(newDMs) }, { merge: true }).catch(console.error);
      }
    }

    // Aparece na hora com o relógio (enviando); o servidor confirma com ✓
    queueMessage({
      id: newMessageId(),
      roomId: activeRoomId,
      senderId: user.id,
      senderName: currentUserProfile?.name || user.username,
      text,
      attachment,
      replyToId,
      timestamp: serverNow(),
      status: 'sending'
    });
  };

  const handleForwardMessages = async (messageIds, targetRoomIds) => {
    for (const roomId of targetRoomIds) {
      for (const msgId of messageIds) {
        const originalMsg = allMessages.find(m => m.id === msgId);
        if (!originalMsg) continue;

        queueMessage({
          id: newMessageId('msg_fwd'),
          roomId,
          senderId: user.id,
          senderName: currentUserProfile?.name || user.username,
          text: originalMsg.text,
          attachment: originalMsg.attachment,
          timestamp: serverNow(),
          isForwarded: true,
          status: 'sending'
        });
      }
    }
  };

  useEffect(() => {
    if (activeRoomId && user?.id) {
      console.log(`[ACTIVE_ROOM] Room activated: ${activeRoomId}`);
      localStorage.setItem('hubify_active_room_id', activeRoomId);
      markRoomAsRead(activeRoomId).catch(err => console.error(`[ACTIVE_ROOM] Error marking read:`, err));
    } else {
      console.log(`[ACTIVE_ROOM] No active room`);
      localStorage.removeItem('hubify_active_room_id');
    }
  }, [activeRoomId, user?.id]);

  // Sistema de Notificações de Reunião (10m, 5m, 0m e Host Entrou)
  useEffect(() => {
    if (!user || meetings.length === 0) return;

    const checkMeetings = () => {
      const now = Date.now();

      meetings.forEach(m => {
        if (m.type !== 'meeting') return;
        const meetingTime = new Date(m.date).getTime();
        const diffMinutes = (meetingTime - now) / (1000 * 60);

        // 1. Notificação 10 minutos antes
        if (diffMinutes > 9 && diffMinutes <= 10.5 && !notified10.current.has(m.id)) {
          notified10.current.add(m.id);
          playNotificationSound();
          setMeetingNotifications(prev => [...prev, { ...m, label: 'Faltam 10 minutos', type: '10m', notifiedAt: now }]);
        }

        // 2. Notificação 5 minutos antes
        if (diffMinutes > 4 && diffMinutes <= 5.5 && !notified5.current.has(m.id)) {
          notified5.current.add(m.id);
          playNotificationSound();
          setMeetingNotifications(prev => [...prev, { ...m, label: 'Faltam 5 minutos', type: '5m', notifiedAt: now }]);
        }

        // 3. Notificação no Horário (0 minutos)
        if (diffMinutes > -1 && diffMinutes <= 0.5 && !notified0.current.has(m.id)) {
          notified0.current.add(m.id);
          playNotificationSound();
          setMeetingNotifications(prev => [...prev, { ...m, label: 'A reunião vai começar', type: '0m', notifiedAt: now }]);
        }

        // 4. Notificação de Anfitrião Entrou (para convidados)
        if (m.status === 'ongoing' && m.creatorId !== user.id && !notifiedHostJoined.current.has(m.id)) {
          // Verificar se o usuário está convidado
          if (m.participants?.includes(user.id)) {
            notifiedHostJoined.current.add(m.id);
            playNotificationSound();
            setMeetingNotifications(prev => [...prev, { ...m, label: 'Anfitrião já está na sala', type: 'host_joined', notifiedAt: now }]);
          }
        }
      });
    };

    const timer = setInterval(checkMeetings, 30000);
    checkMeetings();
    return () => clearInterval(timer);
  }, [user, meetings]);

  // Socket Connection
  useEffect(() => {
    if (!user) return;

    console.log(`[SOCKET_INIT] Initializing socket connection to ${SOCKET_URL}`);
    const newSocket = io(SOCKET_URL, SOCKET_OPTIONS);
    socketRef.current = newSocket;
    setSocket(newSocket);
    const typingTimers = {};

    newSocket.on('connect', () => {
      console.log(`[SOCKET_CONNECT] Connected with ID: ${newSocket.id}`);
      newSocket.emit('presence', { uid: user.id });
      newSocket.emit('subscribe-rooms', { rooms: groupsRef.current.map(g => g.id) });
      const t0 = Date.now();
      newSocket.timeout(5000).emit('server-time', (err, serverTime) => {
        if (!err && typeof serverTime === 'number') clockOffsetRef.current = serverTime - (t0 + Date.now()) / 2;
      });
      // Recupera o que chegou enquanto estava desconectado e reenvia o que ficou pendente
      runSyncRef.current();
      flushOutboxRef.current();
      if (activeRoomIdRef.current && viewRef.current === 'chat' && !document.hidden) {
        markRoomAsReadRef.current(activeRoomIdRef.current);
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.warn(`[SOCKET] Desconectado: ${reason}`);
      // Desconexão pedida pelo servidor não reconecta sozinha
      if (reason === 'io server disconnect') newSocket.connect();
    });

    const clearTyping = (roomId, userId) => {
      clearTimeout(typingTimers[`${roomId}:${userId}`]);
      setTypingUsers(prev => {
        if (!prev[roomId]?.[userId]) return prev;
        const roomTyping = { ...prev[roomId] };
        delete roomTyping[userId];
        return { ...prev, [roomId]: roomTyping };
      });
    };

    newSocket.on('user-typing', ({ roomId, userId, userName }) => {
      if (!roomId || !userId) return;
      setTypingUsers(prev => ({
        ...prev,
        [roomId]: { ...(prev[roomId] || {}), [userId]: userName }
      }));
      // Se o "parou de digitar" se perder, o aviso some sozinho
      clearTimeout(typingTimers[`${roomId}:${userId}`]);
      typingTimers[`${roomId}:${userId}`] = setTimeout(() => clearTyping(roomId, userId), TYPING_TTL_MS);
    });

    newSocket.on('user-stop-typing', ({ roomId, userId }) => {
      if (roomId && userId) clearTyping(roomId, userId);
    });

    newSocket.on('user-read-messages', ({ userId, roomId, timestamp }) => {
      setOtherUsersReadTimestamps(prev => {
        const userTs = prev[userId] || {};
        if ((userTs[roomId] || 0) >= timestamp) return prev;
        return { ...prev, [userId]: { ...userTs, [roomId]: timestamp } };
      });
    });

    newSocket.on('profile-update', ({ userId, data }) => {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data } : u));
    });

    newSocket.on('message-created', (message) => {
      if (!message?.id || !message?.roomId) return;
      // Alguém escreveu numa DM que eu tinha apagado: a conversa volta (como no WhatsApp)
      if (message.roomId.startsWith('dm_') && deletedRoomIdsRef.current.includes(message.roomId)) {
        processingDeletions.current.delete(message.roomId);
        deletedRoomIdsRef.current = deletedRoomIdsRef.current.filter(id => id !== message.roomId);
        setDeletedRoomIds(prev => prev.filter(id => id !== message.roomId));
      }
      if (processingDeletions.current.has(message.roomId) || deletedRoomIdsRef.current.includes(message.roomId)) return;
      handleIncomingRef.current([message]);
    });

    // Edição ou exclusão feita pelo outro lado
    newSocket.on('message-updated', (message) => {
      if (!message?.id || !knownIdsRef.current.has(message.id)) return;
      upsertMessagesRef.current([message]);
    });

    newSocket.on('conversation-deleted', ({ roomId }) => {
      if (!roomId) return;
      setDeletedRoomIds(prev => (prev.includes(roomId) ? prev : [...prev, roomId]));
      processingDeletions.current.add(roomId);

      if (activeRoomIdRef.current === roomId) {
        setActiveRoomId(null);
        setShowChatInfo(false);
        setView('chat');
      }
    });

    // ---------- Chamadas ----------
    newSocket.on('call-incoming', (call) => {
      if (!call?.id || handledCallsRef.current.has(call.id)) return;
      if (incomingCallRef.current?.id === call.id) return;
      // Já em outra chamada (ou tocando/ligando): responde "ocupado" na hora
      if (viewRef.current === 'room' || incomingCallRef.current || isOutgoingCallRef.current) {
        handledCallsRef.current.add(call.id);
        newSocket.emit('call-decline', { callId: call.id, reason: 'busy' });
        return;
      }
      console.log(`[Chamada] Convite recebido: ${call.id} para sala ${call.roomId}`);
      loadIceServers();
      incomingCallRef.current = call;
      setIncomingCall(call);
      if (call.type) setCallType(call.type);
    });

    // Convite para reunião em grupo: só um aviso (some sozinho), nada de tela cheia tocando
    newSocket.on('meeting-invite', (invite) => {
      if (!invite?.id || !invite?.roomId) return;
      if (viewRef.current === 'room' && activeRoomIdRef.current === invite.roomId) return;
      setMeetingInvites(prev => [...prev.filter(i => i.roomId !== invite.roomId), invite].slice(-3));
      if (getPrefs().inviteSound !== false) playNotificationSoundRef.current();
      showLocalNotification({
        title: invite.roomName || 'Reunião',
        body: `${invite.fromName || 'Alguém'} convidou você para entrar`,
        tag: `meeting:${invite.roomId}`,
        url: `/?join=${encodeURIComponent(invite.roomId)}&type=${invite.type || 'video'}`,
        kind: 'meeting-invite',
      });
    });

    newSocket.on('call-accepted', ({ callId, roomId }) => {
      if (!outgoingCallIdsRef.current.has(callId) || viewRef.current === 'room') return;
      console.log(`[Chamada] Aceita. Entrando na sala: ${roomId}`);
      outgoingCallIdsRef.current.clear();
      setActiveRoomId(roomId);
      setIncomingCall(null);
      setIsOutgoingCall(false);
      setShowMediaSetup(false);
      setView('room');
      setUserStatus('reuniao');
    });

    const endOutgoing = (callId, message) => {
      if (!outgoingCallIdsRef.current.delete(callId)) return;
      if (outgoingCallIdsRef.current.size > 0) return;
      setIsOutgoingCall(false);
      if (viewRef.current !== 'room') {
        setSuccessMessage(message);
        setShowSuccessModal(true);
      }
    };

    newSocket.on('call-declined', ({ callId, reason }) => {
      endOutgoing(callId, reason === 'busy' ? 'Ocupado em outra chamada.' : 'Chamada recusada.');
    });

    newSocket.on('call-missed', ({ callId }) => endOutgoing(callId, 'Sem resposta.'));

    newSocket.on('call-cancelled', ({ callId }) => {
      handledCallsRef.current.add(callId);
      if (incomingCallRef.current?.id !== callId) return;
      incomingCallRef.current = null;
      setIncomingCall(null);
      setShowMediaSetup(false);
    });

    // Celular volta do bloqueio / aba volta ao foco / rede volta: reconecta e sincroniza na hora
    const onResume = () => {
      if (document.hidden) return;
      if (!newSocket.connected) newSocket.connect();
      runSyncRef.current();
      if (activeRoomIdRef.current && viewRef.current === 'chat') markRoomAsReadRef.current(activeRoomIdRef.current);
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', onResume);
    window.addEventListener('focus', onResume);

    const safety = setInterval(() => {
      if (document.hidden) return;
      runSyncRef.current();
      flushOutboxRef.current();
    }, SAFETY_SYNC_MS);

    return () => {
      clearInterval(safety);
      Object.values(typingTimers).forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', onResume);
      window.removeEventListener('focus', onResume);
      newSocket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  // Grupos mudaram: assina os eventos deles e baixa o histórico dos que acabaram de aparecer
  const groupIdsKey = groups.map(g => g.id).sort().join(',');
  useEffect(() => {
    if (!user) return;
    const ids = groupIdsKey ? groupIdsKey.split(',') : [];
    socketRef.current?.emit('subscribe-rooms', { rooms: ids });
    if (ids.some(id => !syncedGroupsRef.current.has(id))) runSyncRef.current();
  }, [groupIdsKey, user]);

  // Listeners
    useEffect(() => {
    localStorage.setItem('hubify_muted_rooms', JSON.stringify(mutedRooms));
  }, [mutedRooms]);

  useEffect(() => {
    if (!user) return;

    // Primeira carga das mensagens (as próximas chegam pelo socket)
    runSyncRef.current();

    const unsubUsers = listenToCollection(`artifacts/${appId}/public/data/users`, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(all);
      const me = all.find(u => u.id === user.id);
      if (me?.activeDMs) {
        const stored = parseJson(me.activeDMs, []);
        const known = new Set(all.map(u => u.id));
        const cleaned = extractUserIds(JSON.stringify(stored)).filter(id => id !== user.id && known.has(id));
        setActiveDMs(cleaned);
        // Corrige no banco a lista corrompida para não reaparecer em outros aparelhos
        if (JSON.stringify(cleaned) !== JSON.stringify(stored)) {
          saveDocument(`artifacts/${appId}/public/data/users/${user.id}`, { activeDMs: JSON.stringify(cleaned) }, { merge: true }).catch(() => {});
        }
      }
    }, 4000);

    const unsubMeetings = listenToCollection(`artifacts/${appId}/public/data/meetings`, (snap) => {
      let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setMeetings(fetched.filter(m => m.creatorId === user.id || m.participants?.includes(user.id)));
    }, 5000);

    const unsubGroups = listenToCollection(`artifacts/${appId}/public/data/groups`, (snap) => {
      let fetched = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGroups(fetched.filter(g =>
        (g.members?.includes(user.id) || g.pendingMembers?.includes(user.id)) &&
        !processingDeletions.current.has(g.id) &&
        !deletedRoomIdsRef.current.includes(g.id)
      ));
    }, 5000);

    const unsubInvites = listenToCollection(`artifacts/${appId}/public/data/invites`, (snap) => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setGroupInvites(all);
    }, 5000);

    return () => {
      unsubUsers(); unsubMeetings(); unsubGroups(); unsubInvites();
    };
  }, [user]);

  // Conversa salva como aberta, mas o contato não existe (dado antigo corrompido): volta para a lista
  useEffect(() => {
    if (!users.length || !activeRoomId?.startsWith('dm_') || view === 'room') return;
    const otherId = activeRoomId.replace('dm_', '').split('_').find(id => id !== user?.id);
    if (!users.some(u => u.id === otherId)) {
      setActiveRoomId(null);
      setSelectedChatMobile(null);
    }
  }, [users, activeRoomId]);

  // Notificações: abre a conversa/reunião pedida pelo clique num aviso do sistema e mantém a
  // assinatura de push deste aparelho ligada ao usuário atual
  const joinMeetingInviteRef = useRef(null);
  useEffect(() => {
    if (!user?.id) return;
    syncPush(user.id);
    return onNavigateRequest((req) => {
      if (req.kind === 'resubscribe') { syncPush(user.id); return; }
      if (req.kind === 'join') { joinMeetingInviteRef.current?.({ roomId: req.roomId, type: req.type }); return; }
      if (req.kind === 'room' && viewRef.current !== 'room') {
        setActiveRoomId(req.roomId);
        setSelectedChatMobile(true);
        setView('chat');
      }
    });
  }, [user?.id]);

  // Ações
  const startConversation = async (contactId) => {
    const roomId = `dm_${[user.id, contactId].sort().join('_')}`;

    // Se a sala tinha sido marcada como deletada, removê-la para permitir recriação imediata
    setDeletedRoomIds(prev => prev.filter(id => id !== roomId));
    processingDeletions.current.delete(roomId);

    setActiveRoomId(roomId);
    // No celular a conversa só aparece com esta marca (lista e conversa dividem a mesma tela)
    setSelectedChatMobile(true);
    setView('chat');
  };

  const handleCallComplete = (settings) => {
    setMediaSettings(settings);
    setShowMediaSetup(false);
    const call = incomingCallRef.current || incomingCall;
    if (call) {
      console.log(`[Chamada] Aceitando chamada ${call.id}. Sala: ${call.roomId}`);
      handledCallsRef.current.add(call.id);
      incomingCallRef.current = null;
      setIncomingCall(null);
      setActiveRoomId(call.roomId);
      localStorage.setItem('hubify_active_room_id', call.roomId);
      // Entra na sala imediatamente; quem ligou é avisado na mesma hora pelo servidor
      socketRef.current?.timeout(8000).emit('call-accept', { callId: call.id }, (err, res) => {
        if (err || res?.ok || viewRef.current !== 'room') return;
        // Quem ligou desistiu antes do atendimento
        handleLeaveRoomRef.current();
        setSuccessMessage('A chamada já foi encerrada.');
        setShowSuccessModal(true);
      });
    }
    setView('room');
    setUserStatus('reuniao');
  };

  const handleCallCancel = async () => {
    const s = socketRef.current;
    outgoingCallIdsRef.current.forEach(callId => s?.emit('call-cancel', { callId }));
    const call = incomingCallRef.current;
    if (call) {
      handledCallsRef.current.add(call.id);
      s?.emit('call-decline', { callId: call.id });
    }
    incomingCallRef.current = null;
    outgoingCallIdsRef.current.clear();
    setIsOutgoingCall(false);
    setIncomingCall(null);
    setShowMediaSetup(false);
  };

  // Rede de segurança: o servidor encerra em 50s; se a conexão caiu, não deixa a tela "chamando" presa
  useEffect(() => {
    if (!isOutgoingCall) return;
    const timer = setTimeout(() => {
      if (!isOutgoingCallRef.current || viewRef.current === 'room') return;
      handleCallCancel();
      setSuccessMessage('Sem resposta.');
      setShowSuccessModal(true);
    }, 55000);
    return () => clearTimeout(timer);
  }, [isOutgoingCall]);

  const handleCallDecline = async (call) => {
    handledCallsRef.current.add(call.id);
    incomingCallRef.current = null;
    setIncomingCall(null);
    socketRef.current?.emit('call-decline', { callId: call.id });
  };

  const [processingInvites, setProcessingInvites] = useState(new Set());

  const handleAcceptGroup = async (groupId) => {
    if (processingInvites.has(groupId)) return;
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    setProcessingInvites(prev => new Set(prev).add(groupId));
    try {
      const newMembers = [...new Set([...(group.members || []), user.id])];
      const newPending = (group.pendingMembers || []).filter(id => id !== user.id);
      await saveDocument(`artifacts/${appId}/public/data/groups/${groupId}`, {
        ...group, members: newMembers, pendingMembers: newPending
      }, { merge: true });
      setActiveRoomId(groupId);
      setSelectedChatMobile(true);
      setView('chat');
    } catch (error) { console.error(error); }
    finally { setProcessingInvites(prev => { const n = new Set(prev); n.delete(groupId); return n; }); }
  };

  const handleDeclineGroup = async (groupId) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    const newPending = (group.pendingMembers || []).filter(id => id !== user.id);
    await saveDocument(`artifacts/${appId}/public/data/groups/${groupId}`, {
      ...group, pendingMembers: newPending
    }, { merge: true });
  };

  const isCreatingGroupRef = React.useRef(false);
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || isCreatingGroupRef.current) return;
    isCreatingGroupRef.current = true;
    try {
      const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
      const newGroupData = {
        id: groupId,
        name: newGroupName,
        description: newGroupDesc || "Grupo de colaboração corporativa.",
        members: [user.id],
        createdBy: user.id,
        admins: [user.id],
        isGroup: true,
        avatar: newGroupName.substring(0, 2).toUpperCase(),
        avatarUrl: newGroupAvatar || null,
        createdAt: Date.now(),
        pendingMembers: selectedGroupMembers
      };

      await saveDocument(`artifacts/${appId}/public/data/groups/${groupId}`, newGroupData);
      setGroups(prev => [...prev, newGroupData]);

      for (const memberId of selectedGroupMembers) {
        const inviteId = `invite_${Date.now()}_${memberId}`;
        await saveDocument(`artifacts/${appId}/public/data/invites/${inviteId}`, {
          id: inviteId,
          groupId,
          groupName: newGroupName,
          fromId: user.id,
          fromName: currentUserProfile?.name || user.username || user.displayName,
          toId: memberId,
          timestamp: Date.now(),
          status: 'pending'
        });
      }

      setNewGroupName(''); setNewGroupDesc(''); setNewGroupAvatar(''); setSelectedGroupMembers([]); setShowGroupModal(false);
      setActiveRoomId(groupId); setSelectedChatMobile(true); setView('chat');
    } finally {
      isCreatingGroupRef.current = false;
    }
  };

  const handleUpdateGroup = async (groupId, data) => {
    try {
      await saveDocument(`artifacts/${appId}/public/data/groups/${groupId}`, data, { merge: true });
      // Emitir via socket se necessário (o listener cuidará da atualização local)
    } catch (error) {
      console.error("Erro ao atualizar grupo:", error);
      throw error;
    }
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    if (!newMeetingTitle || !newMeetingDate) return;
    const meetingId = editingMeetingId || `mtg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const meetingData = {
      id: meetingId,
      title: newMeetingTitle,
      date: newMeetingDate,
      type: calendarItemType,
      creatorId: user.id,
      creatorName: currentUserProfile?.name,
      participants: calendarItemType === 'meeting' ? selectedInvitees : [],
      timestamp: Date.now()
    };

    if (editingMeetingId) {
      await saveDocument(`artifacts/${appId}/public/data/meetings/${editingMeetingId}`, meetingData, { merge: true });
    } else {
      await saveDocument(`artifacts/${appId}/public/data/meetings/${meetingId}`, meetingData);
    }
    setNewMeetingTitle(''); setNewMeetingDate(''); setSelectedInvitees([]); setEditingMeetingId(null);
    setShowCalendarModal(false);
  };

  const handleDeleteMeeting = async (id) => {
    if (window.confirm("Tem certeza que deseja excluir este item?")) {
      await removeDocument(`artifacts/${appId}/public/data/meetings/${id}`);
    }
  };

  const openEditMeeting = (meeting) => {
    setEditingMeetingId(meeting.id);
    setNewMeetingTitle(meeting.title);
    setNewMeetingDate(meeting.date);
    setCalendarItemType(meeting.type);
    setSelectedInvitees(meeting.participants || []);
    setShowCalendarModal(true);
  };

  const handleLeaveRoom = async () => {
    // Se for uma reunião agendada e eu sou o host, apagar o agendamento
    if (activeRoomId && activeRoomId.startsWith('meeting_')) {
      const mtgId = activeRoomId.replace('meeting_', '');
      const meeting = meetings.find(m => m.id === mtgId);
      if (meeting && meeting.creatorId === user.id) {
        await removeDocument(`artifacts/${appId}/public/data/meetings/${mtgId}`);
      }
      // Ao sair de uma reunião agendada, voltamos para a lista
      setActiveRoomId(null);
      setSelectedChatMobile(false);
    }
    
    outgoingCallIdsRef.current.clear();
    setIsOutgoingCall(false);
    setOutgoingTarget(null);
    setIncomingCall(null);
    setShowMediaSetup(false);
    setActiveRoomId(null); // Limpar sempre ao sair
    setView('chat');
    setUserStatus('online');
    setSelectedChatMobile(false);
  };

  const handleLeaveRoomRef = useRef(handleLeaveRoom);
  handleLeaveRoomRef.current = handleLeaveRoom;

  const toggleMuteRoom = (roomId) => {
    setMutedRooms(prev => 
      prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
    );
  };

  // Edição/exclusão: pelo socket (o outro lado vê na hora); sem conexão, direto na API
  const updateMessage = (messageId, changes) => new Promise((resolve) => {
    const message = allMessages.find(m => m.id === messageId);
    if (!message) return resolve(false);

    upsertMessages([{ ...message, ...changes }]);

    // Ainda não chegou ao servidor: basta alterar o que está na fila
    if (outboxRef.current.has(messageId)) {
      outboxRef.current.set(messageId, { ...outboxRef.current.get(messageId), ...changes });
      persistOutbox();
      return resolve(true);
    }

    const viaHttp = () => patchDocument(`artifacts/${appId}/public/data/messages/${messageId}`, changes)
      .then(saved => resolve(!!saved));
    const s = socketRef.current;
    if (!s?.connected) return viaHttp();
    s.timeout(10000).emit('update-message', { id: messageId, roomId: message.roomId, changes }, (err, res) => {
      if (!err && res?.ok) {
        upsertMessages([res.message]);
        resolve(true);
      } else {
        viaHttp();
      }
    });
  });

  const handleEditMessage = async (messageId, newText) => {
    const ok = await updateMessage(messageId, { text: newText, isEdited: true, editedAt: serverNow() });
    if (!ok) console.error("Erro ao editar mensagem:", messageId);
  };

  const [deletingMessages, setDeletingMessages] = useState(new Set());

  const handleDeleteMessage = async (messageId) => {
    if (deletingMessages.has(messageId)) return;
    if (!window.confirm("Excluir esta mensagem?")) return;
    const previous = allMessages.find(m => m.id === messageId);
    setDeletingMessages(prev => new Set(prev).add(messageId));
    try {
      const ok = await updateMessage(messageId, { isDeleted: true, text: '🚫 Mensagem apagada', attachment: null });
      if (!ok && previous) upsertMessages([previous]);
    } finally {
      setDeletingMessages(prev => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
    }
  };

  const setTyping = (isTyping) => {
    if (!socketRef.current || !activeRoomId || !user) return;
    if (isTyping) {
      socketRef.current.emit('typing', { 
        roomId: activeRoomId, 
        userId: user.id, 
        userName: currentUserProfile?.name || user.username 
      });
    } else {
      socketRef.current.emit('stop-typing', { roomId: activeRoomId, userId: user.id });
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (window.confirm("Tem certeza que deseja excluir esta conversa? Todas as mensagens serão perdidas.")) {
      // 1. Marcar como em processamento de deleção
      processingDeletions.current.add(roomId);
      setDeletedRoomIds(prev => (prev.includes(roomId) ? prev : [...prev, roomId]));

      // 2. Atualização Otimista Local (Imediata)
      const roomMsgs = allMessages.filter(m => m.roomId === roomId);
      setAllMessages(prev => prev.filter(m => m.roomId !== roomId));
      
      if (activeRoomId === roomId) {
        setActiveRoomId(null);
        setView('chat');
      }

      // 3. Processar remoção no Banco de Dados
      try {
        // Para DM: não apagar mensagens do banco. Apenas remover localmente e atualizar activeDMs do usuário.
        if (roomId.startsWith('dm_')) {
          const otherId = roomId.replace('dm_', '').split('_').find(id => id !== user.id);
          const newDMs = activeDMs.filter(id => id !== otherId);
          setActiveDMs(newDMs);
          await saveDocument(`artifacts/${appId}/public/data/users/${user.id}`, { activeDMs: JSON.stringify(newDMs) }, { merge: true });

          // Apagar mensagens da DM do banco para que a exclusão seja permanente
          try {
            if (roomMsgs.length > 0) {
              await Promise.all(roomMsgs.map(m => removeDocument(`artifacts/${appId}/public/data/messages/${m.id}`)));
            }
            if (socketRef.current) {
              socketRef.current.emit('conversation-deleted', { roomId, deletedBy: user.id, deletedAt: Date.now() });
            }
          } catch (e) {
            console.error('Erro ao apagar mensagens da DM:', e);
          }

          processingDeletions.current.delete(roomId);
        } else {
          // Para grupos: verificar se usuário é admin (apagar para todos) ou apenas sair do grupo
          const group = groups.find(g => g.id === roomId);
          const isAdmin = group && ((group.admins || []).includes(user.id) || group.createdBy === user.id);
          if (group) {
            if (isAdmin) {
              // Confirmar exclusão global
              if (window.confirm('Você é administrador. Deseja excluir o grupo para todos os membros?')) {
                // Apagar todas as mensagens do grupo
                try {
                  const msgsToDelete = roomMsgs || [];
                  await Promise.all(msgsToDelete.map(msg => removeDocument(`artifacts/${appId}/public/data/messages/${msg.id}`)));
                } catch (e) {
                  console.error('Erro ao apagar mensagens do grupo:', e);
                }
                // Apagar o documento do grupo
                await removeDocument(`artifacts/${appId}/public/data/groups/${roomId}`);
                // Emitir evento para todos
                if (socketRef.current) {
                  socketRef.current.emit('conversation-deleted', { roomId, deletedBy: user.id, deletedAt: Date.now() });
                }
              } else {
                // Administrador cancelou — restaurar estado local
                setDeletedRoomIds(prev => prev.filter(id => id !== roomId));
              }
            } else {
              // Sair do grupo apenas para o usuário atual
              const newMembers = (group.members || []).filter(id => id !== user.id);
              await saveDocument(`artifacts/${appId}/public/data/groups/${roomId}`, { members: newMembers }, { merge: true });
              setGroups(prev => prev.filter(g => g.id !== roomId));
            }
          }

          processingDeletions.current.delete(roomId);
        }

      } catch (error) {
        console.error("Erro ao deletar conversa:", error);
        processingDeletions.current.delete(roomId);
        setDeletedRoomIds(prev => prev.filter(id => id !== roomId));
      }
      // Não limpar o activeRoomId aqui novamente — já foi limpo no início quando necessário.
      setShowChatInfo(false);
    }
  };

  const handleSendGroupInvite = async (groupId, targetUserId) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    // Verificar se já é membro
    if (group.members.includes(targetUserId)) {
      alert("Este usuário já é membro do grupo.");
      return;
    }

    // Verificar se já tem convite pendente
    const alreadyInvited = groupInvites.find(i => i.groupId === groupId && i.toId === targetUserId && i.status === 'pending');
    if (alreadyInvited) {
      alert("Um convite já foi enviado para este usuário.");
      return;
    }

    // Adicionar ao pendingMembers do grupo para garantir visibilidade
    const updatedGroup = { ...group, pendingMembers: [...new Set([...(group.pendingMembers || []), targetUserId])] };
    await saveDocument(`artifacts/${appId}/public/data/groups/${groupId}`, { pendingMembers: updatedGroup.pendingMembers }, { merge: true });

    const inviteId = `invite_${Date.now()}_${targetUserId}`;
    await saveDocument(`artifacts/${appId}/public/data/invites/${inviteId}`, {
      id: inviteId,
      groupId,
      groupName: group.name,
      fromId: user.id,
      fromName: currentUserProfile?.name || user.displayName || user.username || "Usuário",
      toId: targetUserId,
      timestamp: Date.now(),
      status: 'pending'
    });
    alert("Convite enviado com sucesso!");
  };

  const handleAcceptGroupInvite = async (inviteId) => {
    const invite = groupInvites.find(i => i.id === inviteId);
    if (!invite) return;

    // Buscar o grupo - tentar no estado local primeiro, depois via API
    let group = groups.find(g => g.id === invite.groupId);

    if (!group) {
      try {
        const { docs } = await fetchCollection(`artifacts/${appId}/public/data/groups`);
        const found = docs.find(d => d.id === invite.groupId);
        if (found) group = { id: found.id, ...found.data() };
      } catch (e) { console.error("Erro ao buscar grupo:", e); }
    }

    if (group) {
      const newMembers = [...new Set([...(group.members || []), user.id])];
      const newPending = (group.pendingMembers || []).filter(id => id !== user.id);

      await saveDocument(`artifacts/${appId}/public/data/groups/${invite.groupId}`, {
        members: newMembers,
        pendingMembers: newPending
      }, { merge: true });

      setActiveRoomId(invite.groupId);
      setSelectedChatMobile(true);
      setView('chat');
    }

    await removeDocument(`artifacts/${appId}/public/data/invites/${inviteId}`);
  };

  const handleDeclineGroupInvite = async (inviteId) => {
    await removeDocument(`artifacts/${appId}/public/data/invites/${inviteId}`);
  };

  const handleRemoveMember = async (groupId, memberId) => {
    const group = groups.find(g => g.id === groupId);
    if (!group || group.createdBy !== user.id) return;

    if (window.confirm("Remover este membro do grupo?")) {
      const newMembers = group.members.filter(id => id !== memberId);
      await saveDocument(`artifacts/${appId}/public/data/groups/${groupId}`, { members: newMembers }, { merge: true });
    }
  };
  const chatRooms = useMemo(() => {
    if (!user) return [];

    // Pegar IDs de usuários com quem temos mensagens
    // 1. DMs: Extrair contatos ativos baseados em mensagens enviadas/recebidas
    const usersWithMessages = new Set();
    allMessages.forEach(m => {
      if (m.roomId && m.roomId.startsWith('dm_') && m.roomId.includes(user.id) && !processingDeletions.current.has(m.roomId) && !deletedRoomIds.includes(m.roomId)) {
        const parts = m.roomId.replace('dm_', '').split('_');
        const otherId = parts.find(id => id !== user.id);
        if (otherId) usersWithMessages.add(otherId);
      }
    });

    // Combinar com activeDMs (que são os iniciados manualmente), filtrando os que estão sendo deletados
    const filteredActiveDMs = activeDMs.filter(id => {
      const roomId = `dm_${[user.id, id].sort().join('_')}`;
      return !processingDeletions.current.has(roomId) && !deletedRoomIds.includes(roomId);
    });

    const allActiveContactIds = [...new Set([...filteredActiveDMs, ...Array.from(usersWithMessages)])]
      .filter(id => users.length === 0 || users.some(u => u.id === id));

    const rooms = [
      ...groups.filter(g => g.members?.includes(user.id) && !processingDeletions.current.has(g.id) && !deletedRoomIds.includes(g.id)).map(g => ({
        id: g.id, isGroup: true, name: g.name, avatar: g.name.substring(0, 2).toUpperCase(),
        avatarUrl: g.avatarUrl,
        members: g.members,
        pendingMembers: g.pendingMembers || [],
        createdBy: g.createdBy, admins: g.admins, description: g.description
      })),
      ...allActiveContactIds.map(id => {
        const u = users.find(x => x.id === id);
        return {
          id: `dm_${[user.id, id].sort().join('_')}`,
          isGroup: false,
          name: u?.name || 'Carregando...',
          avatarUrl: u?.avatarUrl,
          id_contact: id,
          status: u?.status,
          isOnline: u?.isOnline
        };
      })
    ];

    // Ordenar salas pela última mensagem (mais recente no topo)
    return rooms.map(room => {
      const roomMessages = allMessages.filter(m => m.roomId === room.id);
      const lastMsg = roomMessages[roomMessages.length - 1];
      
      // Usar o timestamp de ordenação persistente se disponível, senão o da última mensagem
      const sortTs = roomSortTimestamps.current[room.id] || (lastMsg ? lastMsg.timestamp : 0);

      const unreadCount = allMessages.filter(m => 
        m.roomId === room.id && 
        m.senderId !== user?.id && 
        m.timestamp > (readTimestamps[room.id] || 0)
      ).length;

      return {
        ...room,
        lastMessage: lastMsg,
        unreadCount,
        lastMessageTimestamp: sortTs
      };
    }).sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
  }, [groups, activeDMs, users, user, allMessages, deletedRoomIds]);

  // "Lida" dos outros: o salvo no perfil (sobrevive a recarregar) + o recebido ao vivo pelo socket
  const peerReadTimestamps = useMemo(() => {
    const merged = {};
    users.forEach(u => {
      if (u.id === user?.id) return;
      const saved = parseJson(u.readTimestamps, null);
      if (saved && typeof saved === 'object') merged[u.id] = { ...saved };
    });
    Object.entries(otherUsersReadTimestamps).forEach(([uid, roomsTs]) => {
      merged[uid] = { ...(merged[uid] || {}) };
      Object.entries(roomsTs).forEach(([roomId, ts]) => { merged[uid][roomId] = Math.max(merged[uid][roomId] || 0, ts); });
    });
    return merged;
  }, [users, otherUsersReadTimestamps, user?.id]);

  joinMeetingInviteRef.current = joinMeetingInvite;

  const value = {
    socket,
    activeRoomId, setActiveRoomId,
    allMessages, users, groups, meetings, chatRooms, readTimestamps,
    otherUsersReadTimestamps: peerReadTimestamps,
    retryMessage,
    view, setView,
    incomingCall, setIncomingCall,
    isOutgoingCall, setIsOutgoingCall,
    outgoingTarget, setOutgoingTarget,
    callType, setCallType,
    showMediaSetup, setShowMediaSetup,
    mediaSettings, setMediaSettings,
    handleCallComplete, handleCallCancel, handleCallDecline,
    showInviteModal, setShowInviteModal,
    showDMModal, setShowDMModal,
    showGroupModal, setShowGroupModal,
    showCalendarModal, setShowCalendarModal,
    showContactDetailModal, setShowContactDetailModal,
    showEditProfileModal, setShowEditProfileModal,
    showUploadModal, setShowUploadModal,
    showDocumentModal, setShowDocumentModal,
    showDayEventsModal, setShowDayEventsModal,
    showAddMemberModal, setShowAddMemberModal,
    showSuccessModal, setShowSuccessModal,
    showProfileMenu, setShowProfileMenu,
    statusConfig,
    showSecurityModal, setShowSecurityModal,
    newGroupName, setNewGroupName,
    newGroupDesc, setNewGroupDesc,
    selectedGroupMembers, setSelectedGroupMembers,
    newMeetingTitle, setNewMeetingTitle,
    newMeetingDate, setNewMeetingDate,
    calendarItemType, setCalendarItemType,
    selectedInvitees, setSelectedInvitees,
    editingMeetingId, setEditingMeetingId,
    selectedCalendarDay, setSelectedCalendarDay,
    selectedContactDetail, setSelectedContactDetail,
    previewDocument, setPreviewDocument,
    pendingFile, setPendingFile,
    uploadComment, setUploadComment,
    successMessage, setSuccessMessage,
    startConversation, handleSendMessage,
    handleAcceptGroup, handleDeclineGroup, processingInvites,
    handleCreateGroup, handleCreateMeeting, handleDeleteMeeting, openEditMeeting,
    handleUpdateProfile, handleUpdateGroup, handleDeleteRoom, handleDeleteMessage, handleEditMessage,
    handleForwardMessages,
    roomWallpapers, handleUpdateRoomWallpaper,
    roomToDelete, setRoomToDelete,
    showChatInfo, setShowChatInfo,
    groupInvites, handleSendGroupInvite, handleAcceptGroupInvite, handleDeclineGroupInvite,
    handleRemoveMember,
    handleStartMeeting, handleStartAudioCall, handleInviteToCall,
    handleLeaveRoom,
    selectedChatMobile, setSelectedChatMobile,
    meetingNotifications, setMeetingNotifications,
    meetingInvites, joinMeetingInvite, dismissMeetingInvite,
    mutedRooms, toggleMuteRoom,
    typingUsers, setTyping, userStatus,
    newGroupAvatar, setNewGroupAvatar
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
