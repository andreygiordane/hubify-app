import { useState, useEffect, useRef } from 'react';
import { Peer } from '../utils/WebRTCUtils';
import { loadIceServers } from '../utils/iceServers';
import { audioConstraints, videoConstraints } from '../../../media/prefs';

export function useCallLogic({ roomId, currentUser, socket, callType, onLeave }) {
  // Sala da chamada separada da sala do chat: quem só está com o chat aberto não vira participante,
  // e sair da chamada não tira o socket da sala do chat (digitando, leitura etc.)
  const callRoomId = `call:${roomId}`;
  const [streams, setStreams] = useState({}); // { [peerID]: { webcam: Stream, screen: Stream } }
  const [localStream, setLocalStream] = useState(null);
  const [cameraStream, setCameraStream] = useState(null);
  const [screenStream, setScreenStream] = useState(null);
  const [screenSharing, setScreenSharing] = useState(false);
  const [hasConnected, setHasConnected] = useState(false);
  const [time, setTime] = useState(0);

  const isVoiceMode = callType === 'audio';
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(!isVoiceMode);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [messages, setMessages] = useState([{
    sender: 'Sistema',
    text: `Você entrou na sala!`,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isSelf: false
  }]);
  const [roomParticipants, setRoomParticipants] = useState([]);

  const peersRef = useRef([]);
  const [invitedUserIds, setInvitedUserIds] = useState(new Set());
  const localStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const screenStreamRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(t => t + 1), 1000);
    return () => {
      clearInterval(timer);
      peersRef.current.forEach(p => p.peer.destroy());
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (cameraStreamRef.current && cameraStreamRef.current !== localStreamRef.current) {
        cameraStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (socket) {
        socket.off('room-participants');
        socket.off('receive-chat');
        socket.off('call-ended');
        socket.off('user-joined-room');
        socket.off('all-users');
        socket.off('user-joined');
        socket.off('receiving-returned-signal');
        socket.off('user-disconnected');
      }
    };
  }, []);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  // Callbacks atuais sem precisar re-registrar os listeners do socket a cada render
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const unmountedRef = useRef(false);
  useEffect(() => () => { unmountedRef.current = true; }, []);

  // Efeito de Entrada e Saída da Sala (Estrito)
  useEffect(() => {
    console.log(`[Componente] useCallLogic montado para sala: ${roomId} | Socket: ${socket?.id || 'Desconectado'}`);
    if (socket && roomId && currentUser) {
      let cancelled = false;
      let joined = false;
      const handleInit = async () => {
        // Câmera/microfone e TURN em paralelo, ANTES de entrar: as conexões já nascem com a mídia
        // (sem renegociação extra, que atrasava o vídeo aparecer)
        await Promise.all([loadIceServers(), ensureMedia()]);
        if (cancelled || !socket.connected) return;
        // Socket reconectou (ex.: troca de Wi-Fi para 4G): o id mudou e os peers antigos não servem mais
        if (joined) resetPeers();
        joined = true;
        const me = currentUserRef.current;
        socket.emit("join-room", {
          roomId: callRoomId,
          uid: me.uid,
          name: me.name,
          avatarUrl: me.avatarUrl
        });
        socket.emit('update-user-state', { roomId: callRoomId, state: stateRef.current });
      };

      if (socket.connected) handleInit();
      socket.on('connect', handleInit);

      return () => {
        cancelled = true;
        socket.off('connect', handleInit);
        socket.emit('leave-room', { roomId: callRoomId });
      };
    }
  }, [socket, roomId]);

  const resetPeers = () => {
    peersRef.current.forEach(({ peer }) => peer.destroy());
    peersRef.current = [];
    streamsCache.current = {};
    setStreams({});
  };

  // Gerenciamento de Listeners (Prevenção de Duplicidade)
  useEffect(() => {
    if (!socket) return;

    socket.off('room-participants');
    socket.on('room-participants', updated => {
      setRoomParticipants(updated);
      setStreams(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(sid => {
          const p = updated.find(part => part.socketId === sid);
          if (next[sid]?.list?.length > 1 && (!p || !p.isScreenSharing)) {
          }
        });
        return changed ? next : prev;
      });
    });

    socket.off('receive-chat');
    socket.on('receive-chat', msg => {
      const isSelf = msg.sender === currentUserRef.current?.name;
      setMessages(prev => [...prev, {
        sender: msg.sender,
        text: msg.text,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSelf
      }]);
    });

    socket.off('call-ended');
    socket.on('call-ended', () => onLeaveRef.current());

    socket.off('user-connected');
    socket.on('user-connected', userId => {
      if (peersRef.current.find(p => p.peerID === userId)) return;
      console.log(`[Socket] Novo usuário na sala: ${userId}. Iniciando conexão...`);
      const peer = createPeer(userId, socket.id, localStreamRef.current);
      peersRef.current.push({ peerID: userId, peer });
    });

    socket.off('user-joined');
    socket.on("user-joined", payload => {
      const existing = peersRef.current.find(p => p.peerID === payload.callerID);
      if (existing) {
        console.log(`[Socket] Sinal recebido para conexão existente: ${payload.callerID}`);
        existing.peer.signal(payload.signal);
        return;
      }
      // Só uma oferta abre conexão nova; candidatos soltos são de um peer que já foi descartado
      if (payload.signal?.type !== 'offer') return;
      console.log(`[Socket] Sinal recebido de ${payload.callerID}. Respondendo...`);
      const peer = addPeer(payload.signal, payload.callerID, localStreamRef.current);
      peersRef.current.push({ peerID: payload.callerID, peer });
    });

    socket.off('receiving-returned-signal');
    socket.on("receiving-returned-signal", payload => {
      const item = peersRef.current.find(p => p.peerID === payload.id);
      if (item) item.peer.signal(payload.signal);
    });

    socket.off('user-disconnected');
    socket.on('user-disconnected', userId => {
      console.log(`[Socket] Usuário saiu:`, userId);
      const peerObj = peersRef.current.find(p => p.peerID === userId);
      if (peerObj) {
        peerObj.peer.destroy();
        peersRef.current = peersRef.current.filter(p => p.peerID !== userId);
      }
      setStreams(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    });

    return () => {
      socket.off('room-participants');
      socket.off('receive-chat');
      socket.off('call-ended');
      socket.off('user-connected');
      socket.off('user-joined');
      socket.off('receiving-returned-signal');
      socket.off('user-disconnected');
    };
  }, [socket, roomId]);

  const stateRef = useRef(null);
  // Os IDs dizem a quem assiste qual stream é a câmera e qual é a tela (o ID chega igual do outro lado)
  stateRef.current = {
    isMicOn, isCamOn: isVideoOn, isHandRaised, isScreenSharing: screenSharing,
    cameraStreamId: localStream?.id || null,
    screenStreamId: screenSharing ? (screenStream?.id || null) : null
  };
  useEffect(() => {
    if (socket && roomId) {
      socket.emit('update-user-state', { roomId: callRoomId, state: stateRef.current });
    }
  }, [isMicOn, isVideoOn, isHandRaised, screenSharing, localStream, screenStream]);

  // Removido temporariamente para evitar kicks acidentais
  /*
  useEffect(() => {
    if (roomId && roomId.startsWith('dm_')) {
      if (roomParticipants.length > 1) {
        setHasConnected(true);
      } else if (hasConnected && roomParticipants.length <= 1) {
        onLeave();
      }
    }
  }, [roomParticipants, roomId, hasConnected, onLeave]);
  */
  // Obtém a mídia local uma única vez (várias chamadas aguardam a mesma promessa)
  const mediaPromiseRef = useRef(null);
  const ensureMedia = () => {
    if (mediaPromiseRef.current) return mediaPromiseRef.current;
    const useStream = (stream) => {
      if (unmountedRef.current) {
        // Saiu da chamada antes da câmera abrir: não deixa a câmera ligada
        stream.getTracks().forEach(t => t.stop());
        return null;
      }
      console.log(`[Media] Local stream obtido (V/A): ${stream.getVideoTracks().length}/${stream.getAudioTracks().length}`);
      localStreamRef.current = stream;
      setLocalStream(stream);
      setCameraStream(stream);
      // Peers criados antes da mídia (reconexão) passam a enviá-la
      peersRef.current.forEach(({ peer }) => {
        try { peer.addStream(stream); } catch (e) {}
      });
      return stream;
    };
    mediaPromiseRef.current = navigator.mediaDevices.getUserMedia({ video: isVoiceMode ? false : videoConstraints(), audio: audioConstraints() })
      .then(useStream)
      .catch(err => {
        console.error(`[Media] Erro ao obter câmera/microfone:`, err);
        if (isVoiceMode) return null;
        // Câmera ocupada ou negada: entra só com áudio em vez de ficar sem nada
        setIsVideoOn(false);
        return navigator.mediaDevices.getUserMedia({ audio: audioConstraints() })
          .then(useStream)
          .catch(e => { console.error('[Media] Sem microfone também:', e); return null; });
      });
    return mediaPromiseRef.current;
  };

  // Stream remoto chegou: guarda e redesenha sempre que uma faixa entra, sai ou termina
  // (sem isso a tela fica presa numa faixa que já morreu, ex.: depois de parar o compartilhamento)
  const watchedStreams = useRef(new WeakSet());
  const addRemoteStream = (peerID, s) => {
    console.log(`[WebRTC] Stream de ${peerID} (${s.id}). Tracks (V/A): ${s.getVideoTracks().length}/${s.getAudioTracks().length}`);
    if (!watchedStreams.current.has(s)) {
      watchedStreams.current.add(s);
      const refresh = () => setStreams(prev => {
        const entry = prev[peerID];
        if (!entry) return prev;
        // Stream sem nenhuma faixa (tela encerrada) sai da lista
        return { ...prev, [peerID]: { list: entry.list.filter(st => st.getTracks().length > 0) } };
      });
      const watchTrack = (t) => { t.addEventListener('ended', refresh); t.addEventListener('mute', refresh); t.addEventListener('unmute', refresh); };
      s.getTracks().forEach(watchTrack);
      s.addEventListener('addtrack', (e) => { watchTrack(e.track); refresh(); });
      s.addEventListener('removetrack', refresh);
    }
    setStreams(prev => {
      const existing = prev[peerID] || { list: [] };
      if (existing.list.includes(s)) return { ...prev, [peerID]: { list: [...existing.list] } };
      return { ...prev, [peerID]: { list: [...existing.list, s] } };
    });
  };

  const createPeer = (userToSignal, callerID, stream) => {
    const peer = new Peer({ initiator: true, stream });
    peer.on("signal", signal => {
      socket.emit("sending-signal", { userToSignal, callerID, signal });
    });
    peer.on("stream", s => addRemoteStream(userToSignal, s));
    return peer;
  };

  const addPeer = (incomingSignal, callerID, stream) => {
    const peer = new Peer({ initiator: false, stream });
    peer.on("signal", signal => {
      socket.emit("returning-signal", { signal, callerID });
    });
    peer.on("stream", s => addRemoteStream(callerID, s));
    peer.signal(incomingSignal);
    return peer;
  };

  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMicOn(audioTrack.enabled); }
    }
  };

  const toggleVideo = async () => {
    if (cameraStream) {
      const videoTrack = cameraStream.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'ended') {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints() });
          const newVideoTrack = newStream.getVideoTracks()[0];
          cameraStream.removeTrack(videoTrack);
          cameraStream.addTrack(newVideoTrack);
          
          if (localStreamRef.current) {
             const oldLocalTrack = localStreamRef.current.getVideoTracks()[0];
             if (oldLocalTrack) localStreamRef.current.removeTrack(oldLocalTrack);
             localStreamRef.current.addTrack(newVideoTrack);
          }

          peersRef.current.forEach(({ peer }) => {
            try { peer.replaceTrack(videoTrack, newVideoTrack, cameraStream); } catch (e) {}
          });
          
          setIsVideoOn(true);
        } catch (err) {
          console.error("Erro ao recuperar câmera:", err);
          setIsVideoOn(false);
        }
      } else if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled; 
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  const shareScreen = async () => {
    try {
      if (screenSharing) {
        peersRef.current.forEach(({ peer }) => {
          if (screenStream) { try { peer.removeStream(screenStream); } catch (e) {} }
        });
        if (screenStream) screenStream.getTracks().forEach(t => t.stop());
        setScreenStream(null);
        setScreenSharing(false);
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      setScreenStream(stream);
      setScreenSharing(true);
      peersRef.current.forEach(({ peer }) => peer.addStream(stream));
      stream.getVideoTracks()[0].onended = () => {
        setScreenSharing(false);
        setScreenStream(null);
        peersRef.current.forEach(({ peer }) => { try { peer.removeStream(stream); } catch (e) {} });
      };
    } catch (err) { console.error(err); setScreenSharing(false); }
  };

  const handleSendMessage = (text) => {
    const msg = { sender: currentUser.name, text };
    socket.emit('send-chat', { roomId: callRoomId, message: msg });
  };

  const inviteUser = async (targetId, handleInviteToCall) => {
    if (invitedUserIds.has(targetId)) return;
    setInvitedUserIds(prev => new Set(prev).add(targetId));
    try {
      await handleInviteToCall(targetId, roomId, callType);
    } catch (err) {
      setInvitedUserIds(prev => { const next = new Set(prev); next.delete(targetId); return next; });
    }
  };

  const handleExit = () => {
    if (socket && roomId) {
      if (roomId.startsWith('dm_')) socket.emit('end-call', { roomId: callRoomId });
      else socket.emit('leave-room', { roomId: callRoomId });
    }
    onLeave();
  };

  const streamsCache = useRef({});

  // REATOR: allParticipants agora é guiado pela lista de participantes do servidor
  let participantsList = roomParticipants.map(p => {
    const isLocal = p.socketId === socket?.id;
    const userStreamsList = streams[p.socketId]?.list || [];
    
    let webcamStream = null;
    let screenStream = null;

    if (userStreamsList.length > 0) {
        let cached = streamsCache.current[p.socketId];
        if (!cached) {
            cached = { webcam: new MediaStream(), screen: new MediaStream() };
            streamsCache.current[p.socketId] = cached;
        }

        const { webcam, screen } = cached;
        const live = (tracks) => tracks.filter(t => t.readyState === 'live' && !t.muted);

        // Tela: só o stream que o participante anunciou como tela, enquanto compartilha
        const screenSource = p.isScreenSharing && p.screenStreamId
          ? userStreamsList.find(st => st.id === p.screenStreamId)
          : null;
        // Câmera: o stream anunciado como câmera; sem anúncio (versão antiga), o primeiro que não é a tela
        const cameraSource = userStreamsList.find(st => st.id === p.cameraStreamId)
          || userStreamsList.find(st => st.id !== p.screenStreamId && st !== screenSource && live(st.getVideoTracks().concat(st.getAudioTracks())).length > 0)
          || null;

        // Sync Audio
        const targetAudio = cameraSource ? (live(cameraSource.getAudioTracks())[0] || cameraSource.getAudioTracks()[0] || null) : null;
        webcam.getAudioTracks().forEach(t => { if (t !== targetAudio) webcam.removeTrack(t); });
        if (targetAudio && !webcam.getAudioTracks().includes(targetAudio)) webcam.addTrack(targetAudio);

        // Sync Video
        const targetWebcamVideo = cameraSource ? (cameraSource.getVideoTracks().find(t => t.readyState === 'live') || null) : null;
        const targetScreenVideo = screenSource ? (live(screenSource.getVideoTracks())[0] || null) : null;

        // Faixa de vídeo trocou: stream novo para o <video> reanexar (senão fica no quadro da faixa antiga).
        // Sem troca, mantém o mesmo objeto para não piscar.
        if ((webcam.getVideoTracks()[0] || null) !== targetWebcamVideo) {
          cached.webcam = new MediaStream([...webcam.getAudioTracks(), ...(targetWebcamVideo ? [targetWebcamVideo] : [])]);
        }
        if ((screen.getVideoTracks()[0] || null) !== targetScreenVideo) {
          cached.screen = new MediaStream(targetScreenVideo ? [targetScreenVideo] : []);
        }

        webcamStream = cached.webcam.getTracks().length > 0 ? cached.webcam : null;
        screenStream = cached.screen.getTracks().length > 0 ? cached.screen : null;
    }
    
    return {
      id: p.socketId,
      uid: p.uid,
      name: isLocal ? (currentUser?.name || p.name) : (p.name || 'Convidado'),
      avatarUrl: isLocal ? (currentUser?.avatarUrl || currentUser?.avatar || p.avatarUrl) : p.avatarUrl,
      isLocal,
      stream: isLocal ? cameraStream : webcamStream,
      handRaised: isLocal ? isHandRaised : p.isHandRaised,
      isMicOn: isLocal ? isMicOn : p.isMicOn,
      isCamOn: isLocal ? isVideoOn : p.isCamOn,
      isActuallySharing: isLocal ? screenSharing : !!screenStream,
      isScreenSharing: false,
      _remoteScreenStream: screenStream // Save for later screen share virtual tile
    };
  });

  // Fallback: se a lista do servidor estiver vazia ou não tiver o local, forçar o local
  const hasLocal = participantsList.some(p => p.isLocal);
  if (!hasLocal && currentUser) {
    participantsList.unshift({
      id: socket?.id || 'local',
      uid: currentUser.uid,
      name: `${currentUser.name} (Conectando...)`,
      avatarUrl: currentUser.avatarUrl,
      isLocal: true,
      stream: cameraStream,
      handRaised: isHandRaised,
      isMicOn: isMicOn,
      isCamOn: isVideoOn,
      isActuallySharing: screenSharing,
      isScreenSharing: false
    });
  }

  // Deduplicar por id e preferir entradas que possuam stream (evita tile de avatar + tile de stream do mesmo usuário)
  const participantsMap = new Map();
  participantsList.forEach(p => {
    const existing = participantsMap.get(p.id);
    if (!existing) participantsMap.set(p.id, p);
    else if (!existing.stream && p.stream) participantsMap.set(p.id, p);
  });
  const allParticipants = Array.from(participantsMap.values());

  // Adicionar telas compartilhadas como participantes virtuais
  if (screenSharing && screenStream && screenStream.active) {
    allParticipants.push({
      id: (socket?.id || 'local') + '-screen',
      uid: currentUser?.uid,
      stream: screenStream,
      isLocal: true,
      isScreenSharing: true,
      name: `Sua Tela`,
      handRaised: false, isMicOn: false, isCamOn: true
    });
  }

  participantsList.forEach(p => {
    if (p._remoteScreenStream && p._remoteScreenStream.active) {
      allParticipants.push({
        id: p.id + '-screen',
        uid: p.uid,
        stream: p._remoteScreenStream,
        isLocal: false,
        isScreenSharing: true,
        name: `Tela de ${p.name || 'Convidado'}`,
        avatarUrl: p.avatarUrl,
        handRaised: false, isMicOn: false, isCamOn: true
      });
    }
  });

  return {
    streams, localStream, cameraStream, screenSharing, time,
    isMicOn, isVideoOn, isHandRaised, setIsHandRaised,
    messages, roomParticipants, allParticipants, invitedUserIds,
    toggleMic, toggleVideo, shareScreen, handleSendMessage, handleExit, inviteUser
  };
}
