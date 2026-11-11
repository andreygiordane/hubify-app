import React, { useEffect, useState } from 'react';
import { useChat } from '../../context/ChatContext';
import Sidebar from './Sidebar';
import SearchPalette from './SearchPalette';
import SuccessModal from '../common/SuccessModal';
import DocumentPreviewModal from '../common/DocumentPreviewModal';

export default function MainLayout({ children }) {
  const { view, setShowProfileMenu, activeRoomId, selectedChatMobile } = useChat();
  const [showSearch, setShowSearch] = useState(false);

  // Menus abertos não devem sobreviver à troca de tela nem a abrir/fechar uma conversa
  useEffect(() => { setShowProfileMenu(false); }, [view, activeRoomId, selectedChatMobile]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowSearch(s => !s); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-viewport bg-surface md:bg-rail text-ink">
      <div className="flex flex-1 min-h-0">
        <Sidebar onOpenSearch={() => setShowSearch(true)} />
        <main className="stage flex-1 flex flex-col min-w-0 relative overflow-hidden md:my-2 md:mr-2">
          <SuccessModal />
          <DocumentPreviewModal />
          {children}
        </main>
      </div>
      {showSearch && <SearchPalette onClose={() => setShowSearch(false)} />}
    </div>
  );
}
