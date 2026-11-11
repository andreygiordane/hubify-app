
import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import MeetingInterface from '../components/video/MeetingInterface';

export default function MeetingRoom() {
  const { user, currentUserProfile, setUserStatus } = useAuth();
  const { socket, activeRoomId, setView, callType, mediaSettings, handleLeaveRoom } = useChat();

  const handleLeave = () => {
    handleLeaveRoom();
  };

  if (!user || !activeRoomId || !socket) {
    return (
      <div className="h-dynamic-screen w-full bg-[#0b0b0c] flex flex-col items-center justify-center text-white p-6 text-center">
        <span className="w-12 h-12 border-[3px] border-white/15 border-t-white rounded-full animate-spin mb-6" />
        <h2 className="display text-[24px] mb-2">Entrando na sala...</h2>
        <p className="text-white/55 max-w-xs">Conectando ao servidor de chamadas.</p>
      </div>
    );
  }

  return (
    <MeetingInterface 
      roomId={activeRoomId}
      currentUser={{ 
        uid: user.id, 
        name: currentUserProfile?.name || user.displayName || user.username,
        avatarUrl: currentUserProfile?.avatarUrl
      }}
      socket={socket}
      callType={callType}
      onLeave={handleLeave}
      initialMediaSettings={mediaSettings}
    />
  );
}
