import React, { useEffect } from "react";
import AudioCallInterface from './audio/AudioCallInterface';
import VideoCallInterface from './video/VideoCallInterface';

export default function MeetingInterface({
  roomId, currentUser, socket, callType, onLeave
}) {
  // Proteção contra F5 e fechamento acidental
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      const msg = 'A chamada será encerrada se você sair ou atualizar a página. Deseja continuar?';
      e.returnValue = msg;
      return msg;
    };

    const handleKeyDown = (e) => {
      // Bloquear F5 (116) e Ctrl+R (82 + ctrl)
      if (e.keyCode === 116 || (e.ctrlKey && e.keyCode === 82)) {
        e.preventDefault();
        return false;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return callType === 'audio' ? (
    <AudioCallInterface
      roomId={roomId}
      currentUser={currentUser}
      socket={socket}
      onLeave={onLeave}
    />
  ) : (
    <VideoCallInterface
      roomId={roomId}
      currentUser={currentUser}
      socket={socket}
      callType={callType}
      onLeave={onLeave}
    />
  );
}
