import React, { useState, useRef, useEffect } from 'react';
import { Bell, Calendar, Video } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { railButtonClass, RailTooltip } from '../layout/Sidebar';

// Sino com as reuniões que ainda vão acontecer hoje
export default function HeaderNotification({ variant = 'default' }) {
  const { meetings, setView, handleStartMeeting } = useChat();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const today = new Date();
  const upcomingMeetings = meetings.filter(m => {
    if (m.type !== 'meeting') return false;
    const d = new Date(m.date);
    return d.toDateString() === today.toDateString() && d.getTime() > today.getTime();
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isRail = variant === 'rail';
  const buttonClass = isRail
    ? railButtonClass(isOpen)
    : `relative flex items-center justify-center transition-colors w-8 h-8 rounded-full text-ink-2 hover:bg-hover ${isOpen ? 'bg-hover text-ink' : ''}`;

  return (
    <div className="relative group" ref={dropdownRef}>
      <button onClick={() => setIsOpen(!isOpen)} className={buttonClass} aria-label="Notificações">
        <Bell className={isRail ? 'w-5 h-5' : 'w-[18px] h-[18px]'} strokeWidth={1.75} />
        {upcomingMeetings.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full signal-grad text-[#0c1405] text-[10px] font-bold font-mono flex items-center justify-center ring-2 ring-rail">
            {upcomingMeetings.length}
          </span>
        )}
      </button>
      {isRail && !isOpen && <RailTooltip>Notificações</RailTooltip>}

      {isOpen && (
        <div className={`menu absolute w-80 z-[120] text-ink !p-0 overflow-hidden ${isRail ? 'left-full bottom-0 ml-3' : 'right-0 top-full mt-2'}`}>
          <div className="px-4 py-3 border-b border-line flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <h3 className="font-semibold text-[13px]">Próximas reuniões de hoje</h3>
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
            {upcomingMeetings.length === 0 ? (
              <p className="px-4 py-8 text-center text-ink-2">Nenhuma reunião pelo resto do dia.</p>
            ) : (
              upcomingMeetings.map(m => (
                <div key={m.id} className="px-4 py-3 border-b border-line last:border-0 flex items-center gap-3">
                  <span className="font-mono text-xs font-medium text-brand-ink bg-brand-soft rounded-md px-2 py-1 shrink-0">
                    {new Date(m.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <p className="flex-1 truncate font-semibold">{m.title}</p>
                  <button onClick={() => { handleStartMeeting(`meeting_${m.id}`); setIsOpen(false); }} className="btn-primary h-7 px-2 text-xs">
                    <Video className="w-3.5 h-3.5" /> Entrar
                  </button>
                </div>
              ))
            )}
          </div>
          <button onClick={() => { setView('calendar'); setIsOpen(false); }} className="w-full py-2.5 text-sm font-semibold text-brand hover:bg-hover border-t border-line">
            Abrir agenda
          </button>
        </div>
      )}
    </div>
  );
}
