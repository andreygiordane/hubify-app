
import React from 'react';
import { useAuth } from './context/AuthContext';
import { useChat } from './context/ChatContext';
import Auth from './Auth.jsx';
import MainLayout from './components/layout/MainLayout';
import Chat from './pages/Chat';
import Meetings from './pages/Meetings';
import Calendar from './pages/Calendar';
import Contacts from './pages/Contacts';
import Invitations from './pages/Invitations';
import MeetingRoom from './pages/MeetingRoom';
import Settings from './pages/Settings';
import Modals from './components/modals/Modals';
import MeetingToasts from './components/common/MeetingToasts';
import PushPrompt from './components/common/PushPrompt';
import { useViewportHeight } from './hooks/useViewportHeight';

export default function App() {
  useViewportHeight();
  const { user, login } = useAuth();
  const { view, setView } = useChat();

  React.useEffect(() => {
    // Sem travar a orientação: as telas (inclusive a chamada de vídeo) se adaptam a retrato e paisagem
  }, []);

  if (!user) {
    return <Auth onLogin={login} />;
  }

  return (
    <>
      {view === 'room' ? (
        <MeetingRoom />
      ) : (
        <MainLayout view={view} setView={setView}>
          {view === 'chat' && <Chat />}
          {view === 'meetings' && <Meetings />}
          {view === 'calendar' && <Calendar />}
          {view === 'contacts' && <Contacts />}
          {view === 'invitations' && <Invitations />}
          {view === 'settings' && <Settings />}
        </MainLayout>
      )}
      <Modals />
      <MeetingToasts />
      <PushPrompt />
    </>
  );
}
