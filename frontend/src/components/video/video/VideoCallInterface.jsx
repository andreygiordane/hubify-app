import React, { useState, useEffect, useRef } from "react";
import { motion, useMotionValue } from "framer-motion";
import { ChevronRight, ChevronDown, Users, RotateCcw } from "lucide-react";
import { useChat } from '../../../context/ChatContext';
import { useCallLogic } from '../logic/useCallLogic';
import HiddenAudio from '../shared/HiddenAudio';
import {
  VideoTile, AdaptiveGrid, CallHeader, BottomControls, ChatSidebar, PeopleSidebar, InviteModal,
  useElementSize, useIsNarrow
} from '../shared/CallComponents';

/* Uma única tela de chamada que se adapta ao espaço:
   - 1 pessoa: quadro cheio.
   - 2 pessoas: a outra pessoa em destaque e você numa janela flutuante que pode ser arrastada.
   - 3 ou mais: grade que escolhe colunas/linhas conforme o formato da tela (retrato, paisagem, painel aberto).
   - Tela compartilhada: a tela em destaque e as câmeras numa tira (ao lado em telas largas, embaixo em telas altas). */

// Tela compartilhada com zoom (roda do mouse ou pinça) e arraste quando ampliada
function ScreenStage({ participant }) {
  const [scale, setScale] = useState(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const pinch = useRef(null);
  const clamp = (v) => Math.min(4, Math.max(1, v));
  const reset = () => { setScale(1); x.set(0); y.set(0); };

  useEffect(() => { if (scale === 1) { x.set(0); y.set(0); } }, [scale]);

  const onTouchMove = (e) => {
    if (e.touches.length !== 2) return;
    const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    if (pinch.current) setScale((s) => clamp(s * (dist / pinch.current)));
    pinch.current = dist;
  };

  return (
    <div
      className="relative w-full h-full rounded-[24px] bg-black overflow-hidden touch-none"
      onWheel={(e) => setScale((s) => clamp(s * (e.deltaY > 0 ? 0.9 : 1.1)))}
      onTouchMove={onTouchMove}
      onTouchEnd={() => { pinch.current = null; }}
      onDoubleClick={reset}
    >
      <motion.div drag={scale > 1} dragMomentum={false} style={{ x, y, scale }} className={`w-full h-full ${scale > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`}>
        <VideoTile participant={participant} contain className="w-full h-full !rounded-none !bg-black" />
      </motion.div>
      {scale > 1 && (
        <button onClick={reset} className="call-chip absolute top-3 right-3 h-8 hover:bg-black/75 transition-colors">
          <RotateCcw className="w-3.5 h-3.5" /> {Math.round(scale * 100)}%
        </button>
      )}
    </div>
  );
}

// Você, numa janela flutuante que gruda no canto mais próximo ao soltar
function SelfView({ participant, localMicOn, bounds, stage }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const portrait = stage.height > stage.width;
  const w = Math.round(Math.max(96, Math.min(240, stage.width * (portrait ? 0.3 : 0.2))));
  const h = Math.round(portrait ? w * 4 / 3 : w * 3 / 4);
  const margin = 12;

  // Volta para o canto inferior direito quando o espaço muda
  useEffect(() => { x.set(0); y.set(0); }, [stage.width, stage.height]);

  const snap = () => {
    const maxX = stage.width - w - margin * 2;
    const maxY = stage.height - h - margin * 2;
    x.set(x.get() < -maxX / 2 ? -maxX : 0);
    y.set(y.get() < -maxY / 2 ? -maxY : 0);
  };

  return (
    <motion.div
      drag dragConstraints={bounds} dragElastic={0.05} dragMomentum={false} onDragEnd={snap}
      style={{ x, y, width: w, height: h, right: margin, bottom: margin }}
      className="absolute z-20 rounded-[18px] shadow-pop cursor-grab active:cursor-grabbing touch-none"
    >
      <VideoTile participant={participant} localMicOn={localMicOn} compact className="w-full h-full" />
    </motion.div>
  );
}

export default function VideoCallInterface({ roomId, currentUser, socket, callType, onLeave }) {
  const { users, handleInviteToCall } = useChat();
  const {
    allParticipants, screenSharing, time,
    isMicOn, isVideoOn, isHandRaised, setIsHandRaised,
    messages, toggleMic, toggleVideo, shareScreen, handleSendMessage, handleExit,
    invitedUserIds, inviteUser
  } = useCallLogic({ roomId, currentUser, socket, callType: callType || 'video', onLeave });

  const isVoiceMode = callType === 'audio';
  const isMobile = useIsNarrow();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [stripHidden, setStripHidden] = useState(false);
  const [seenMessages, setSeenMessages] = useState(messages.length);
  const [stageRef, stage] = useElementSize();

  useEffect(() => { if (isChatOpen) setSeenMessages(messages.length); }, [isChatOpen, messages.length]);
  const unreadChat = Math.max(0, messages.filter((m, i) => i >= seenMessages && !m.isSelf).length);

  const people = allParticipants.filter(p => !p.isScreenSharing);
  const screens = allParticipants.filter(p => p.isScreenSharing);
  const screen = screens.find(p => !p.isLocal) || screens[0];
  const local = people.find(p => p.isLocal);
  const remotes = people.filter(p => !p.isLocal);
  const wide = stage.width >= stage.height * 1.15 && stage.width >= 640;
  const title = roomId.startsWith('dm_') ? (remotes[0]?.name || 'Chamada') : roomId.startsWith('meeting_') ? 'Reunião' : 'Chamada em grupo';

  let content;
  if (screen) {
    content = (
      <div className={`w-full h-full flex gap-2 ${wide ? 'flex-row' : 'flex-col'}`}>
        <div className="relative flex-1 min-w-0 min-h-0">
          <ScreenStage participant={screen} />
          <button
            onClick={() => setStripHidden(v => !v)}
            className={`call-chip absolute h-8 hover:bg-black/75 transition-colors ${wide ? 'bottom-3 right-3' : 'bottom-3 left-1/2 -translate-x-1/2'}`}
          >
            {stripHidden ? <Users className="w-3.5 h-3.5" /> : wide ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {stripHidden ? `Mostrar câmeras (${people.length})` : 'Ocultar câmeras'}
          </button>
        </div>
        {stripHidden ? (
          // Com a tira escondida, o áudio dos outros continua tocando
          remotes.filter(p => p.stream).map(p => <HiddenAudio key={p.id} stream={p.stream} />)
        ) : (
          <div className={`shrink-0 flex gap-2 scrollbar-hide ${wide ? 'flex-col w-[clamp(160px,18vw,260px)] overflow-y-auto' : 'flex-row h-[clamp(84px,17vh,132px)] overflow-x-auto'}`}>
            {people.map(p => (
              <VideoTile key={p.id} participant={p} localMicOn={isMicOn} compact className={wide ? 'w-full aspect-video shrink-0' : 'h-full aspect-[4/3] shrink-0'} />
            ))}
          </div>
        )}
      </div>
    );
  } else if (people.length === 2 && local && remotes.length === 1) {
    content = (
      <div className="relative w-full h-full">
        <VideoTile participant={remotes[0]} className="w-full h-full" />
        {stage.width > 0 && <SelfView participant={local} localMicOn={isMicOn} bounds={stageRef} stage={stage} />}
      </div>
    );
  } else {
    content = <AdaptiveGrid participants={people} localMicOn={isMicOn} />;
  }

  return (
    <div className="h-dynamic-screen w-full bg-[#0b0b0c] text-white flex flex-col font-sans overflow-hidden relative">
      <CallHeader title={title} time={time} count={people.length} onPeople={() => { setIsChatOpen(false); setIsPeopleOpen(v => !v); }} />

      <div className="flex-1 min-h-0 flex px-2">
        <div ref={stageRef} className="flex-1 min-w-0 h-full relative">{content}</div>
        <ChatSidebar isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} messages={messages} sendMessage={handleSendMessage} isMobileView={isMobile} />
        <PeopleSidebar isOpen={isPeopleOpen} onClose={() => setIsPeopleOpen(false)} participants={allParticipants} isMobileView={isMobile} isMicOn={isMicOn} onInvite={() => setIsInviteOpen(true)} />
      </div>

      <BottomControls
        isMicOn={isMicOn} toggleMic={toggleMic}
        isVideoOn={isVideoOn} toggleVideo={toggleVideo}
        isHandRaised={isHandRaised} toggleHand={() => setIsHandRaised(!isHandRaised)}
        screenSharing={screenSharing} shareScreen={shareScreen}
        onLeave={handleExit} participantCount={people.length}
        toggleChat={() => { setIsPeopleOpen(false); setIsChatOpen(v => !v); }}
        togglePeople={() => { setIsChatOpen(false); setIsPeopleOpen(v => !v); }}
        isChatOpen={isChatOpen} isPeopleOpen={isPeopleOpen} unreadChat={unreadChat}
        isMobileView={isMobile} isVoiceMode={isVoiceMode}
        toggleInvite={() => setIsInviteOpen(true)}
      />

      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        users={users}
        currentUser={currentUser}
        onInvite={(u) => inviteUser(u.id, handleInviteToCall)}
        invitedUserIds={invitedUserIds}
        participants={allParticipants}
      />
    </div>
  );
}
