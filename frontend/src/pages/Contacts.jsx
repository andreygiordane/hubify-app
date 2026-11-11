import React, { useMemo, useState } from 'react';
import { Search, MessageSquare, Phone, Video, X, Mail, Users } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import Avatar, { presenceOf, PRESENCE } from '../components/ui/Avatar';
import Segmented from '../components/ui/Segmented';
import PageHeader from '../components/layout/PageHeader';

export default function Contacts() {
  const { users, startConversation, handleStartMeeting, handleStartAudioCall } = useChat();
  const { user } = useAuth();
  const [selectedContact, setSelectedContact] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState('all');

  const counts = useMemo(() => {
    const online = users.filter(u => presenceOf(u) === 'online').length;
    const away = users.filter(u => ['ocupado', 'reuniao', 'ausente'].includes(presenceOf(u))).length;
    return { online, away };
  }, [users]);

  const TABS = [
    { id: 'all', label: 'Pessoas' },
    { id: 'online', label: 'Disponíveis', badge: counts.online },
    { id: 'away', label: 'Ocupados' },
  ];

  const q = searchQuery.trim().toLowerCase();
  const filteredUsers = users
    .filter(u => !q || u.name.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
    .filter(u => {
      const p = presenceOf(u);
      if (tab === 'online') return p === 'online';
      if (tab === 'away') return ['ocupado', 'reuniao', 'ausente'].includes(p);
      return true;
    })
    .sort((a, b) => (a.id === user?.id) - (b.id === user?.id) || a.name.localeCompare(b.name));

  const handleAction = async (action, contactId) => {
    // Primeiro garante que a conversa está ativa
    await startConversation(contactId);
    // Calcula o roomId manualmente para a chamada usar o canal certo, sem depender do estado global
    const forcedRoomId = `dm_${[user.id, contactId].sort().join('_')}`;
    if (action === 'audio') handleStartAudioCall(forcedRoomId);
    else if (action === 'video') handleStartMeeting(forcedRoomId);
    setSelectedContact(null);
  };

  const selectedPresence = selectedContact && presenceOf(selectedContact);

  return (
    <div className="flex-1 flex flex-col bg-surface overflow-hidden">
      <PageHeader title="Pessoas" subtitle={`${users.length} na equipe · ${counts.online} disponíve${counts.online === 1 ? 'l' : 'is'} agora`} />

      <div className="shrink-0 px-4 md:px-6 pb-3 flex flex-col md:flex-row md:items-center gap-3">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Filtrar pessoas" className="self-start" />
        <div className="relative flex-1 md:max-w-sm md:ml-auto">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
          <input type="text" placeholder="Buscar por nome, cargo ou e-mail" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="field h-11 pl-11 pr-10" />
          {searchQuery
            ? <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" aria-label="Limpar"><X className="w-4 h-4" /></button>
            : <span className="absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-success" title={`${counts.online} disponíveis`} />}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 pb-28 md:pb-6 bg-app md:m-2 md:mt-0 md:rounded-[22px]">
        {filteredUsers.length === 0 ? (
          <div className="flex flex-col items-center text-center py-16">
            <Users className="w-9 h-9 text-ink-3 mb-3" strokeWidth={1.5} />
            <p className="text-sm text-ink-2">Ninguém encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 max-w-7xl mx-auto">
            {filteredUsers.map(u => {
              const presence = presenceOf(u);
              const isMe = u.id === user?.id;
              return (
                <div key={u.id} className="card p-3.5 flex items-center gap-3">
                  <button onClick={() => setSelectedContact(u)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                    <Avatar src={u.avatarUrl} name={u.name} size={48} status={presence} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-ink truncate">{u.name}{isMe && <span className="text-ink-3 font-normal"> (você)</span>}</span>
                      <span className="block text-[13px] text-ink-2 truncate">{u.role || 'Membro da equipe'}</span>
                      <span className="block text-[12px] text-ink-3 truncate">{u.statusMessage || PRESENCE[presence].label}</span>
                    </span>
                  </button>
                  {!isMe && (
                    <div className="flex gap-1.5 shrink-0">
                      <button onClick={() => handleAction('chat', u.id)} className="round-btn" aria-label={`Conversar com ${u.name}`} title="Mensagem"><MessageSquare className="w-[18px] h-[18px]" /></button>
                      <button onClick={() => handleAction('video', u.id)} className="round-btn-dark" aria-label={`Chamada de vídeo com ${u.name}`} title="Chamada de vídeo"><Video className="w-[18px] h-[18px]" /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedContact && (
        <div className="overlay" onClick={() => setSelectedContact(null)}>
          <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <span className="dialog-grip" />
            <div className="dialog-head">
              <h3 className="dialog-title">Perfil</h3>
              <button onClick={() => setSelectedContact(null)} className="icon-btn w-9 h-9 bg-app" aria-label="Fechar"><X className="w-[18px] h-[18px]" /></button>
            </div>
            <div className="overflow-y-auto custom-scrollbar px-5" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
              <div className="flex flex-col items-center text-center pb-5">
                <Avatar src={selectedContact.avatarUrl} name={selectedContact.name} size={104} status={selectedPresence} />
                <h4 className="display text-[24px] text-ink mt-4 max-w-full truncate">{selectedContact.name}</h4>
                <p className="text-sm text-ink-2 mt-1">{selectedContact.role || 'Membro da equipe'} · {PRESENCE[selectedPresence].label}</p>
                {selectedContact.statusMessage && <p className="pill bg-app text-ink h-7 px-3 mt-3 max-w-full truncate">{selectedContact.statusMessage}</p>}
              </div>

              <div className="group-card mb-4">
                <div className="group-row">
                  <span className="row-icon"><Mail className="w-4 h-4" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs text-ink-3">E-mail</span>
                    <span className="block text-[15px] truncate">{selectedContact.email || 'Não informado'}</span>
                  </span>
                </div>
                {selectedContact.bio && (
                  <div className="group-row items-start">
                    <span className="flex-1 min-w-0 py-1">
                      <span className="block text-xs text-ink-3">Sobre</span>
                      <span className="block text-[15px] leading-relaxed">{selectedContact.bio}</span>
                    </span>
                  </div>
                )}
              </div>

              {selectedContact.id !== user?.id && (
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => handleAction('chat', selectedContact.id)} className="btn-primary h-12 text-[14px]"><MessageSquare className="w-4 h-4" /> Mensagem</button>
                  <button onClick={() => handleAction('audio', selectedContact.id)} className="btn-secondary h-12 text-[14px]"><Phone className="w-4 h-4" /> Áudio</button>
                  <button onClick={() => handleAction('video', selectedContact.id)} className="btn-secondary h-12 text-[14px]"><Video className="w-4 h-4" /> Vídeo</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
