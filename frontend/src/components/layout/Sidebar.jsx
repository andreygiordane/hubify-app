import React from 'react';
import { MessageSquare, Video, Calendar, Users, UserPlus, Search, Settings } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import Avatar from '../ui/Avatar';
import { LogoMark } from '../ui/Logo';
import ProfileMenu, { ProfileSheet } from './ProfileMenu';
import HeaderNotification from '../common/HeaderNotification';

export const useNavItems = () => {
  const { user } = useAuth();
  const { groupInvites, chatRooms, allMessages, readTimestamps } = useChat();
  const pendingInvites = groupInvites.filter(i => i.toId === user?.id).length;
  const unread = chatRooms.filter(r =>
    (allMessages || []).some(m => m.roomId === r.id && m.senderId !== user?.id && m.timestamp > ((readTimestamps || {})[r.id] || 0))
  ).length;
  return [
    { id: 'chat', icon: MessageSquare, label: 'Chat', badge: unread },
    { id: 'meetings', icon: Video, label: 'Reuniões' },
    { id: 'calendar', icon: Calendar, label: 'Agenda' },
    { id: 'contacts', icon: Users, label: 'Pessoas' },
    { id: 'invitations', icon: UserPlus, label: 'Convites', badge: pendingInvites },
  ];
};

// Contador em verde→lima: o único "sinal" de cor da interface
const Badge = ({ value, className = '' }) => value > 0 && (
  <span className={`absolute min-w-[17px] h-[17px] px-1 rounded-full signal-grad text-[#0c1405] text-[10px] font-bold font-mono flex items-center justify-center ring-2 ring-rail ${className}`}>
    {value > 99 ? '99+' : value}
  </span>
);

export const railButtonClass = (active) =>
  `relative w-11 h-11 flex items-center justify-center rounded-full transition-all duration-200 ${
    active
      ? 'bg-brand text-on-brand shadow-card'
      : 'text-ink-2 hover:bg-hover hover:text-ink'
  }`;

export const RailTooltip = ({ children }) => (
  <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink text-app text-xs font-medium px-2.5 py-1.5 shadow-pop opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 z-[150]">
    {children}
  </span>
);

function RailButton({ active, label, onClick, children, badge }) {
  return (
    <div className="relative group">
      <button onClick={onClick} aria-label={label} aria-current={active ? 'page' : undefined} className={railButtonClass(active)}>
        {children}
        <Badge value={badge} className="-top-1 -right-1" />
      </button>
      <RailTooltip>{label}</RailTooltip>
    </div>
  );
}

export default function Sidebar({ onOpenSearch }) {
  const { currentUserProfile, userStatus } = useAuth();
  const { view, setView, showProfileMenu, setShowProfileMenu, selectedChatMobile } = useChat();
  const items = useNavItems();

  return (
    <>
      {/* Trilho (desktop) */}
      <nav className="hidden md:flex w-[68px] bg-rail flex-col items-center gap-1.5 py-4 shrink-0">
        <button onClick={() => setView('chat')} aria-label="Hubify" className="mb-3 rounded-[11px] transition-transform duration-200 hover:scale-105 active:scale-95">
          <LogoMark size={36} />
        </button>

        {items.map(item => (
          <RailButton key={item.id} label={item.label} active={view === item.id} onClick={() => setView(item.id)} badge={item.badge}>
            <item.icon className="w-5 h-5" strokeWidth={view === item.id ? 2.1 : 1.75} />
          </RailButton>
        ))}

        <div className="flex-1" />

        <RailButton label="Pesquisar · Ctrl K" onClick={onOpenSearch}>
          <Search className="w-5 h-5" strokeWidth={1.75} />
        </RailButton>
        <HeaderNotification variant="rail" />
        <RailButton label="Configurações" active={view === 'settings'} onClick={() => setView('settings')}>
          <Settings className="w-5 h-5" strokeWidth={view === 'settings' ? 2.1 : 1.75} />
        </RailButton>
        <div className="relative mt-2">
          <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="block rounded-full ring-2 ring-transparent hover:ring-line transition-shadow" title="Status e perfil">
            <Avatar src={currentUserProfile?.avatarUrl} name={currentUserProfile?.name} size={38} status={userStatus} ringClass="ring-rail" />
          </button>
          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-[110]" onClick={() => setShowProfileMenu(false)} />
              <ProfileMenu className="absolute left-full bottom-0 ml-3" />
            </>
          )}
        </div>
      </nav>

      {/* Barra inferior (celular): flutuante, some ao abrir uma conversa */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 px-3 z-[100] transition-transform duration-200 ${
          (view === 'chat' && selectedChatMobile) ? 'translate-y-[130%]' : 'translate-y-0'
        }`}
        style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}
      >
        {/* Colunas de largura igual: o item ativo ganha uma pílula atrás do ícone, sem empurrar os vizinhos */}
        <div className="h-[66px] grid grid-flow-col auto-cols-fr items-stretch px-1.5 rounded-[28px] bg-surface/95 backdrop-blur-xl shadow-pop" style={{ border: '1px solid rgb(var(--hairline) / 0.06)' }}>
          {items.map(item => {
            const active = view === item.id;
            return (
              <button key={item.id} onClick={() => setView(item.id)} aria-label={item.label} aria-current={active ? 'page' : undefined} className="min-w-0 flex flex-col items-center justify-center gap-[3px] active:scale-95 transition-transform">
                <span className={`relative w-[52px] h-8 flex items-center justify-center rounded-full transition-colors duration-200 ${active ? 'bg-brand text-on-brand' : 'text-ink-2'}`}>
                  <item.icon className="w-[20px] h-[20px] shrink-0" strokeWidth={active ? 2.1 : 1.75} />
                  <Badge value={item.badge} className="-top-1 right-0.5 ring-surface" />
                </span>
                <span className={`max-w-full px-0.5 text-[10.5px] leading-none truncate ${active ? 'font-semibold text-ink' : 'font-medium text-ink-3'}`}>{item.label}</span>
              </button>
            );
          })}
          <button onClick={() => setShowProfileMenu(true)} aria-label="Você" className="min-w-0 flex flex-col items-center justify-center gap-[3px] active:scale-95 transition-transform">
            <span className={`h-8 flex items-center justify-center rounded-full p-0.5 ring-2 transition-shadow ${showProfileMenu || view === 'settings' ? 'ring-signal' : 'ring-transparent'}`}>
              <Avatar src={currentUserProfile?.avatarUrl} name={currentUserProfile?.name} size={26} status={userStatus} />
            </span>
            <span className={`text-[10.5px] leading-none ${showProfileMenu || view === 'settings' ? 'font-semibold text-ink' : 'font-medium text-ink-3'}`}>Você</span>
          </button>
        </div>
      </nav>
      <ProfileSheet />
    </>
  );
}
