import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  Users, MessageSquare, UserPlus, Smile, SendHorizontal, X, Hand, Search, Check
} from "lucide-react";
import Avatar, { presenceOf, PRESENCE } from '../../ui/Avatar';
import HiddenAudio from './HiddenAudio';
import { applyOutputDevice } from '../../../media/prefs';

export const EMOJIS = ['😀','😂','🤣','😍','🥰','😎','🤔','😢','😭','😡','👍','👎','🎉','🔥','❤️','💯','👋','👀'];

export const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h > 0 ? h.toString().padStart(2, '0') + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

/* ---------- Medidas e layout adaptativo ---------- */

// Tamanho (em px) de um elemento, atualizado sempre que ele muda
export function useElementSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function useIsNarrow(limit = 768) {
  const [narrow, setNarrow] = useState(() => window.innerWidth < limit);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < limit);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [limit]);
  return narrow;
}

// Escolhe quantas colunas/linhas deixam os quadros maiores e menos distorcidos para o espaço disponível.
// Para cada grade possível, mede a área do maior retângulo 4:3 que cabe em cada célula e fica com a melhor.
export function bestGrid(count, width, height, gap = 8, ratio = 4 / 3) {
  if (!count || !width || !height) return { cols: 1, rows: 1, tileW: 0, tileH: 0 };
  let best = null;
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const tileW = (width - gap * (cols - 1)) / cols;
    const tileH = (height - gap * (rows - 1)) / rows;
    if (tileW <= 0 || tileH <= 0) continue;
    const fitW = Math.min(tileW, tileH * ratio);
    const score = fitW * (fitW / ratio);
    if (!best || score > best.score) best = { cols, rows, tileW, tileH, score };
  }
  return best || { cols: 1, rows: 1, tileW: width, tileH: height };
}

/* ---------- Atividade de voz ---------- */

export function useAudioActivity(stream, isMuted) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  useEffect(() => {
    if (!stream || isMuted) { setIsSpeaking(false); return; }
    let audioContext, analyser, source, animationId;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;
      source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        setIsSpeaking((sum / dataArray.length) > 10);
        animationId = requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (e) {}
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    };
  }, [stream, isMuted]);
  return isSpeaking;
}

export function AudioWave({ isSpeaking }) {
  return (
    <span className="flex gap-[2px] items-center h-3" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span key={i} className={`w-[2.5px] rounded-full signal-grad-v transition-all duration-150 ${isSpeaking ? (i === 1 ? 'h-3 animate-pulse' : 'h-2 animate-pulse') : 'h-1'}`} style={{ animationDelay: `${i * 120}ms` }} />
      ))}
    </span>
  );
}

/* ---------- Quadro de um participante ---------- */

// compact: miniatura (tira lateral, janela flutuante); contain: mostra o vídeo inteiro (tela compartilhada)
export function VideoTile({ participant: p, localMicOn = true, compact = false, contain = false, className = '', style }) {
  const ref = useRef(null);
  const muted = p.isLocal ? !localMicOn : false;
  const micOff = p.isLocal ? !localMicOn : p.isMicOn === false;
  const isSpeaking = useAudioActivity(p.isScreenSharing ? null : p.stream, muted);
  const showVideo = !!p.stream && p.isCamOn;
  const [tileRef, size] = useElementSize();
  const avatarSize = Math.round(Math.max(40, Math.min(132, Math.min(size.width, size.height) * 0.36)));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (p.stream) {
      if (el.srcObject !== p.stream) el.srcObject = p.stream;
      el.play?.().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [p.stream, showVideo]);

  const ring = p.handRaised
    ? 'shadow-[inset_0_0_0_3px_rgb(var(--warning))]'
    : isSpeaking ? 'shadow-[inset_0_0_0_3px_rgb(var(--signal-a))]' : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]';

  return (
    <div ref={tileRef} style={style} className={`relative bg-[#18181a] overflow-hidden flex items-center justify-center ${compact ? 'rounded-[16px]' : 'rounded-[24px]'} ${className}`}>
      {/* Câmera desligada: o áudio continua tocando por um elemento escondido */}
      {p.stream && !p.isLocal && !p.isCamOn && <HiddenAudio stream={p.stream} />}

      {showVideo ? (
        <video
          ref={ref}
          onLoadedMetadata={(e) => !p.isLocal && applyOutputDevice(e.currentTarget)}
          autoPlay
          playsInline
          muted={p.isLocal || muted}
          className={`w-full h-full ${contain || p.isScreenSharing ? 'object-contain bg-black' : 'object-cover'} ${p.isLocal && !p.isScreenSharing ? '-scale-x-100' : ''}`}
        />
      ) : (
        <div className={`transition-transform duration-300 ${isSpeaking ? 'scale-105' : ''}`}>
          <Avatar src={p.avatarUrl} name={p.name} size={avatarSize} />
        </div>
      )}

      {/* Contorno de quem fala / mão levantada (por cima do vídeo) */}
      <span className={`absolute inset-0 pointer-events-none transition-shadow duration-200 ${compact ? 'rounded-[16px]' : 'rounded-[24px]'} ${ring}`} />

      <div className={`absolute left-2 bottom-2 right-2 flex items-center gap-1.5 pointer-events-none ${compact ? '' : 'md:left-3 md:bottom-3'}`}>
        <span className={`call-chip max-w-full ${compact ? 'h-6 px-2 text-[11px]' : ''}`}>
          {micOff && !p.isScreenSharing ? <MicOff className="w-3.5 h-3.5 text-danger shrink-0" /> : isSpeaking && <AudioWave isSpeaking />}
          <span className="truncate">{p.isLocal && !p.isScreenSharing ? (compact ? 'Você' : `${p.name} (você)`) : p.name}</span>
        </span>
      </div>

      <AnimatePresence>
        {p.handRaised && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className={`absolute top-2 right-2 rounded-full bg-warning text-[#111112] flex items-center justify-center shadow-pop ${compact ? 'w-6 h-6' : 'w-9 h-9'}`}>
            <Hand size={compact ? 13 : 18} fill="currentColor" />
          </motion.span>
        )}
      </AnimatePresence>

      {p.isActuallySharing && !p.isScreenSharing && !compact && (
        <span className="call-chip absolute top-2 left-2 md:top-3 md:left-3"><MonitorUp className="w-3.5 h-3.5" /> Compartilhando a tela</span>
      )}
    </div>
  );
}

// Grade que se reorganiza conforme o número de pessoas e o formato do espaço (retrato, paisagem, painel aberto)
export function AdaptiveGrid({ participants, localMicOn, gap = 8 }) {
  const [ref, size] = useElementSize();
  const { cols, tileW, tileH } = bestGrid(participants.length, size.width, size.height, gap);
  return (
    <div ref={ref} className="w-full h-full flex flex-wrap items-center justify-center content-center" style={{ gap }}>
      {tileW > 0 && participants.map(p => (
        <VideoTile key={p.id} participant={p} localMicOn={localMicOn} compact={cols >= 4} style={{ width: Math.floor(tileW), height: Math.floor(tileH) }} />
      ))}
    </div>
  );
}

/* ---------- Painéis laterais ---------- */

// Desktop: coluna ao lado do palco (a grade se reajusta). Celular: painel que sobe de baixo.
export function SidePanel({ isOpen, onClose, title, icon: Icon, children, isMobileView, action }) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (isMobileView ? (
        <motion.div key="sheet" className="fixed inset-0 z-[130] flex flex-col justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'tween', duration: 0.22 }}
            className="relative h-[78%] bg-[#18181a] rounded-t-[28px] flex flex-col overflow-hidden"
          >
            <span className="mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-white/15 shrink-0" />
            <PanelHead title={title} Icon={Icon} onClose={onClose} action={action} />
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.aside
          key="side"
          initial={{ width: 0, opacity: 0 }} animate={{ width: 360, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ type: 'tween', duration: 0.2 }}
          className="shrink-0 h-full overflow-hidden"
        >
          <div className="w-[352px] ml-2 h-full bg-[#18181a] rounded-[24px] flex flex-col overflow-hidden">
            <PanelHead title={title} Icon={Icon} onClose={onClose} action={action} />
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
          </div>
        </motion.aside>
      ))}
    </AnimatePresence>
  );
}

const PanelHead = ({ title, Icon, onClose, action }) => (
  <div className="shrink-0 h-14 px-4 flex items-center gap-2.5">
    {Icon && <Icon className="w-[18px] h-[18px] text-white/60" />}
    <h3 className="flex-1 text-[16px] font-semibold text-white truncate">{title}</h3>
    {action}
    <button onClick={onClose} className="call-btn w-9 h-9" aria-label="Fechar"><X size={17} /></button>
  </div>
);

export function ChatSidebar({ isOpen, onClose, messages, sendMessage, isMobileView }) {
  const [inputText, setInputText] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = () => {
    if (inputText.trim() === "") return;
    sendMessage(inputText);
    setInputText("");
    setShowEmojis(false);
  };

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Chat da chamada" icon={MessageSquare} isMobileView={isMobileView}>
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-2 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-white/45 text-sm text-center px-4">
            <MessageSquare size={30} className="mb-3" strokeWidth={1.5} />
            Nenhuma mensagem ainda.<br />O que for escrito aqui some ao fim da chamada.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex flex-col ${msg.isSelf ? 'items-end' : 'items-start'}`}>
              <span className="text-[11px] text-white/45 mb-1 px-1.5">{msg.isSelf ? 'Você' : msg.sender} · <span className="font-mono">{msg.time}</span></span>
              <div className={`max-w-[85%] px-3.5 py-2 rounded-[18px] text-[14px] leading-snug break-words ${msg.isSelf ? 'signal-grad text-[#0c1405] rounded-br-md' : 'bg-white/10 text-white rounded-bl-md'}`}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 px-3 pt-2 relative" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <AnimatePresence>
          {showEmojis && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
              className="absolute bottom-full left-3 mb-1 bg-[#26262a] p-2.5 rounded-[18px] grid grid-cols-6 gap-1 shadow-pop z-[70]"
            >
              {EMOJIS.map(emoji => (
                <button key={emoji} onClick={() => setInputText(prev => prev + emoji)} className="w-9 h-9 text-xl rounded-full hover:bg-white/10 transition-colors">{emoji}</button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-1 bg-white/10 rounded-full p-1">
          <button onClick={() => setShowEmojis(!showEmojis)} className="w-10 h-10 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors shrink-0" aria-label="Emojis">
            <Smile size={20} />
          </button>
          <input
            type="text" value={inputText} onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Mensagem"
            className="flex-1 min-w-0 bg-transparent px-1 text-[15px] outline-none text-white placeholder:text-white/40"
          />
          <button onClick={handleSend} disabled={!inputText.trim()} className="w-10 h-10 flex items-center justify-center rounded-full signal-grad text-[#0c1405] disabled:opacity-40 transition-opacity shrink-0" aria-label="Enviar">
            <SendHorizontal size={18} />
          </button>
        </div>
      </div>
    </SidePanel>
  );
}

export function PeopleSidebar({ isOpen, onClose, participants, isMobileView, isMicOn, onInvite }) {
  const people = participants.filter(p => !p.isScreenSharing);
  return (
    <SidePanel
      isOpen={isOpen} onClose={onClose} title={`Pessoas (${people.length})`} icon={Users} isMobileView={isMobileView}
      action={onInvite && <button onClick={onInvite} className="btn h-9 px-3.5 bg-white text-[#111112] hover:bg-white/90"><UserPlus size={16} /> Convidar</button>}
    >
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2.5 pb-4">
        {people.map(p => {
          const micOn = p.isLocal ? isMicOn : p.isMicOn !== false;
          return (
            <div key={p.id} className="flex items-center gap-3 px-2.5 py-2 rounded-[16px] hover:bg-white/5">
              <Avatar src={p.avatarUrl} name={p.name} size={40} />
              <span className="flex-1 min-w-0 text-[15px] text-white truncate">{p.name}{p.isLocal && <span className="text-white/45"> (você)</span>}</span>
              {p.handRaised && <Hand size={17} className="text-warning shrink-0" fill="currentColor" />}
              {p.isActuallySharing && <MonitorUp size={17} className="text-white/60 shrink-0" />}
              {micOn ? <Mic size={17} className="text-white/60 shrink-0" /> : <MicOff size={17} className="text-danger shrink-0" />}
            </div>
          );
        })}
      </div>
    </SidePanel>
  );
}

/* ---------- Convidar para a chamada ---------- */

export function InviteModal({ isOpen, onClose, users, currentUser, onInvite, invitedUserIds = new Set(), participants = [] }) {
  const [search, setSearch] = useState('');
  const q = search.trim().toLowerCase();
  const filteredUsers = (users || []).filter(u =>
    u.id !== currentUser?.uid && (!q || u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[140] flex items-end md:items-center justify-center md:p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: 'tween', duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#18181a] w-full md:max-w-md rounded-t-[28px] md:rounded-[26px] overflow-hidden flex flex-col max-h-[85dvh] text-white shadow-pop"
          >
            <span className="md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-white/15 shrink-0" />
            <PanelHead title="Convidar para a chamada" Icon={UserPlus} onClose={onClose} />
            <div className="px-4 pb-3 shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/45" />
                <input type="text" placeholder="Buscar pessoas" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-11 bg-white/10 rounded-full pl-11 pr-4 text-[15px] text-white placeholder:text-white/40 outline-none focus:shadow-[0_0_0_3px_rgb(var(--signal)/0.35)]" />
              </div>
            </div>

            <div className="flex-1 min-h-[240px] overflow-y-auto custom-scrollbar px-2.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              {filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-white/45 text-sm">
                  <Users size={30} className="mb-3" strokeWidth={1.5} />
                  Ninguém encontrado
                </div>
              ) : filteredUsers.map(u => {
                const presence = presenceOf(u);
                const inRoom = participants.some(p => p.uid === u.id);
                const invited = invitedUserIds.has(u.id);
                const busy = u.status === 'reuniao' || u.status === 'ocupado';
                return (
                  <div key={u.id} className="flex items-center gap-3 px-2.5 py-2 rounded-[16px] hover:bg-white/5">
                    <Avatar src={u.avatarUrl} name={u.name} size={42} status={presence} ringClass="ring-[#18181a]" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-medium truncate">{u.name}</span>
                      <span className="block text-[12.5px] text-white/45 truncate">{PRESENCE[presence].label}</span>
                    </span>
                    {inRoom ? (
                      <span className="call-chip bg-white/10"><Check size={13} strokeWidth={3} /> Na chamada</span>
                    ) : invited ? (
                      <span className="call-chip bg-white/10">Convidado</span>
                    ) : busy ? (
                      <span className="call-chip bg-white/10 text-white/50">{PRESENCE[presence].label}</span>
                    ) : (
                      <button onClick={() => onInvite(u)} className="btn h-8 signal-grad text-[#0c1405]">Convidar</button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Cabeçalho e controles ---------- */

export function CallHeader({ title, time, count, onPeople }) {
  return (
    <header className="shrink-0 h-14 px-3 md:px-4 flex items-center gap-2">
      <div className="flex-1 min-w-0 flex items-center gap-2.5">
        <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
        <h1 className="text-[15px] font-semibold text-white truncate">{title}</h1>
        <span className="font-mono text-[13px] text-white/55 shrink-0">{formatTime(time)}</span>
      </div>
      <button onClick={onPeople} className="call-chip h-9 px-3 bg-white/10 hover:bg-white/[0.18] transition-colors" aria-label="Ver pessoas na chamada">
        <Users className="w-4 h-4" /> <span className="font-mono">{count}</span>
      </button>
    </header>
  );
}

// Botão circular flutuante. Padrão: branco. "on" (recurso ligado: painel aberto, tela compartilhada): preto.
// "alert": selo vermelho no canto (microfone ou câmera desligados).
const Ctl = ({ onClick, label, on = false, alert = false, className = '', children, badge }) => (
  <button
    onClick={onClick}
    title={label}
    aria-label={label}
    aria-pressed={on}
    className={`relative w-12 h-12 flex items-center justify-center rounded-full shrink-0 transition-all duration-150 active:scale-95 shadow-[0_6px_20px_rgb(0_0_0/0.35)] ${
      on ? 'bg-[#111111] text-white ring-1 ring-white/25 hover:bg-[#222]' : 'bg-white text-[#111111] hover:bg-[#ECECEF]'
    } ${className}`}
  >
    {children}
    {alert && <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] rounded-full bg-danger ring-2 ring-[#0b0b0c] flex items-center justify-center"><span className="w-2 h-[2px] rounded-full bg-white" /></span>}
    {!alert && badge > 0 && <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full signal-grad text-[#0c1405] text-[10px] font-bold font-mono flex items-center justify-center ring-2 ring-[#0b0b0c]">{badge}</span>}
  </button>
);

export function BottomControls({
  isMicOn, toggleMic, isVideoOn, toggleVideo, isHandRaised, toggleHand,
  screenSharing, shareScreen, onLeave, participantCount,
  toggleChat, togglePeople, isMobileView, isVoiceMode, toggleInvite,
  isChatOpen, isPeopleOpen, unreadChat = 0
}) {
  const canShare = !isMobileView && !isVoiceMode && !!navigator.mediaDevices?.getDisplayMedia;
  return (
    <div className="shrink-0 flex justify-center px-2 pt-3" style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}>
      <div className="flex items-center gap-2 sm:gap-2.5 max-w-full">
        <Ctl onClick={toggleMic} label={isMicOn ? 'Desligar microfone' : 'Ligar microfone'} alert={!isMicOn}>
          {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
        </Ctl>
        {!isVoiceMode && (
          <Ctl onClick={toggleVideo} label={isVideoOn ? 'Desligar câmera' : 'Ligar câmera'} alert={!isVideoOn}>
            {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
          </Ctl>
        )}
        {canShare && (
          <Ctl onClick={shareScreen} label={screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'} on={screenSharing}>
            <MonitorUp size={20} />
          </Ctl>
        )}
        {!isVoiceMode && (
          <Ctl onClick={toggleHand} label={isHandRaised ? 'Baixar a mão' : 'Levantar a mão'} className={isHandRaised ? '!bg-warning !text-[#111111] !ring-0' : ''}>
            <Hand size={20} fill={isHandRaised ? 'currentColor' : 'none'} />
          </Ctl>
        )}
        <Ctl onClick={toggleChat} label="Chat da chamada" on={isChatOpen} badge={isChatOpen ? 0 : unreadChat}>
          <MessageSquare size={20} />
        </Ctl>
        {!isMobileView && (
          <Ctl onClick={togglePeople} label="Pessoas" on={isPeopleOpen} badge={isPeopleOpen ? 0 : participantCount}>
            <Users size={20} />
          </Ctl>
        )}
        <Ctl onClick={toggleInvite} label="Convidar pessoas"><UserPlus size={20} /></Ctl>

        <button onClick={onLeave} className="h-12 w-12 md:w-auto md:px-6 flex items-center justify-center gap-2 rounded-full bg-danger text-white font-semibold text-[14px] shadow-[0_6px_20px_rgb(0_0_0/0.35)] hover:brightness-110 active:scale-95 transition-all shrink-0" aria-label="Sair da chamada">
          <PhoneOff size={20} />
          <span className="hidden md:inline">Sair</span>
        </button>
      </div>
    </div>
  );
}
