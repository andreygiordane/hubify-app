import { applyOutputDevice } from '../../../media/prefs';
import React, { useState, useEffect, useRef } from "react";
import { MicOff } from "lucide-react";
import { useChat } from '../../../context/ChatContext';
import { useCallLogic } from '../logic/useCallLogic';
import Avatar from '../../ui/Avatar';
import {
  ChatSidebar, PeopleSidebar, InviteModal, BottomControls, CallHeader,
  useAudioActivity, useElementSize, useIsNarrow
} from '../shared/CallComponents';

// Barras que acompanham o volume de quem está falando
function VoiceBars({ stream, active }) {
  const barsRef = useRef([]);
  const count = 27;

  useEffect(() => {
    const rest = () => barsRef.current.forEach(bar => { if (bar) bar.style.height = '4px'; });
    if (!stream || !active) { rest(); return; }
    let audioContext, analyser, source, animationId;
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.7;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        source = audioContext.createMediaStreamSource(new MediaStream([audioTracks[0]]));
        source.connect(analyser);
      }
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        analyser.getByteFrequencyData(dataArray);
        barsRef.current.forEach((bar, i) => {
          if (!bar) return;
          const centerDist = Math.abs((count - 1) / 2 - i);
          const val = dataArray[Math.min(dataArray.length - 1, Math.round(centerDist * 2))] || 0;
          const damping = Math.max(0.15, 1 - centerDist / (count / 2));
          bar.style.height = `${4 + (val / 255) * 40 * damping}px`;
        });
        animationId = requestAnimationFrame(draw);
      };
      draw();
    } catch (e) {}
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (source) source.disconnect();
      if (analyser) analyser.disconnect();
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
      rest();
    };
  }, [stream, active]);

  return (
    <div className="flex items-center justify-center gap-[5px] h-12" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} ref={el => barsRef.current[i] = el} className="w-[5px] rounded-full signal-grad-v transition-[height] duration-75 ease-out" style={{ height: 4 }} />
      ))}
    </div>
  );
}

// Uma pessoa na chamada de voz: avatar com contorno que acende quando ela fala
function VoicePerson({ participant: p, localMicOn, size }) {
  const micOff = p.isLocal ? !localMicOn : p.isMicOn === false;
  const speaking = useAudioActivity(p.stream, micOff);
  return (
    <div className="flex flex-col items-center gap-3 min-w-0" style={{ width: size + 24 }}>
      <div className={`relative rounded-full p-1 transition-shadow duration-200 ${speaking ? 'shadow-[0_0_0_3px_rgb(var(--signal-a)),0_0_44px_rgb(var(--signal-a)/0.35)]' : 'shadow-[0_0_0_3px_rgb(255_255_255/0.08)]'}`}>
        <Avatar src={p.avatarUrl} name={p.name} size={size} />
        {micOff && (
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#18181a] text-danger flex items-center justify-center ring-4 ring-[#0b0b0c]"><MicOff className="w-4 h-4" /></span>
        )}
      </div>
      <span className="max-w-full text-[14px] font-medium text-white/85 truncate">{p.name}{p.isLocal ? ' (você)' : ''}</span>
    </div>
  );
}

function RemoteAudio({ stream, id }) {
  const audioRef = useRef(null);
  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch(err => console.warn(`[Audio] Erro ao dar play automático para ${id}:`, err));
    }
  }, [stream, id]);
  return <audio ref={audioRef} onLoadedMetadata={(e) => applyOutputDevice(e.currentTarget)} autoPlay playsInline style={{ display: 'none' }} />;
}

export default function AudioCallInterface({ roomId, currentUser, socket, onLeave }) {
  const { users, handleInviteToCall } = useChat();
  const {
    allParticipants, localStream, time, isMicOn, isVideoOn, isHandRaised, setIsHandRaised,
    messages, toggleMic, toggleVideo, shareScreen, handleSendMessage, handleExit,
    invitedUserIds, inviteUser
  } = useCallLogic({ roomId, currentUser, socket, callType: 'audio', onLeave });

  const isMobile = useIsNarrow();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPeopleOpen, setIsPeopleOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [seenMessages, setSeenMessages] = useState(messages.length);
  const [stageRef, stage] = useElementSize();

  useEffect(() => { if (isChatOpen) setSeenMessages(messages.length); }, [isChatOpen, messages.length]);
  const unreadChat = messages.filter((m, i) => i >= seenMessages && !m.isSelf).length;

  const people = allParticipants.filter(p => !p.isScreenSharing);
  const remotes = people.filter(p => !p.isLocal && p.uid !== currentUser?.uid);
  const waiting = remotes.length === 0;
  const single = remotes.length <= 1;
  const shown = single ? (remotes.length ? remotes : people) : people;
  // O avatar encolhe conforme entram mais pessoas e conforme o espaço diminui
  const base = Math.min(stage.width, stage.height) || 320;
  const avatarSize = Math.round(single ? Math.max(104, Math.min(184, base * 0.42)) : Math.max(64, Math.min(132, base / (Math.ceil(Math.sqrt(shown.length)) * 1.9))));
  const title = roomId.startsWith('dm_') ? 'Chamada de voz' : 'Chamada de voz em grupo';
  const featured = remotes[0];

  return (
    <div className="h-dynamic-screen w-full bg-[#0b0b0c] text-white flex flex-col font-sans relative overflow-hidden">
      {people.filter(p => !p.isLocal && p.stream).map(p => <RemoteAudio key={p.id} stream={p.stream} id={p.id} />)}
      <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[110vmin] h-[110vmin] rounded-full opacity-[0.12] blur-[110px] signal-grad pointer-events-none" />

      <CallHeader title={title} time={time} count={people.length} onPeople={() => { setIsChatOpen(false); setIsPeopleOpen(v => !v); }} />

      <div className="relative flex-1 min-h-0 flex px-2">
        <div ref={stageRef} className="flex-1 min-w-0 h-full flex flex-col items-center justify-center gap-7 overflow-y-auto scrollbar-hide py-4">
          <div className="flex flex-wrap items-start justify-center gap-x-6 gap-y-7 max-w-3xl px-4">
            {shown.map(p => <VoicePerson key={p.id} participant={p} localMicOn={isMicOn} size={avatarSize} />)}
          </div>
          {single && (
            <div className="text-center">
              <p className="display text-[26px] md:text-[32px]">{waiting ? 'Aguardando alguém entrar...' : featured?.name}</p>
              <div className="mt-5"><VoiceBars stream={featured?.stream || localStream} active={waiting ? isMicOn : true} /></div>
            </div>
          )}
        </div>
        <ChatSidebar isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} messages={messages} sendMessage={handleSendMessage} isMobileView={isMobile} />
        <PeopleSidebar isOpen={isPeopleOpen} onClose={() => setIsPeopleOpen(false)} participants={allParticipants} isMobileView={isMobile} isMicOn={isMicOn} onInvite={() => setIsInviteOpen(true)} />
      </div>

      <BottomControls
        isMicOn={isMicOn} toggleMic={toggleMic}
        isVideoOn={isVideoOn} toggleVideo={toggleVideo}
        isHandRaised={isHandRaised} toggleHand={() => setIsHandRaised(!isHandRaised)}
        screenSharing={false} shareScreen={shareScreen}
        onLeave={handleExit} participantCount={people.length}
        toggleChat={() => { setIsPeopleOpen(false); setIsChatOpen(v => !v); }}
        togglePeople={() => { setIsChatOpen(false); setIsPeopleOpen(v => !v); }}
        isChatOpen={isChatOpen} isPeopleOpen={isPeopleOpen} unreadChat={unreadChat}
        isMobileView={isMobile} isVoiceMode={true}
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
