import React, { useEffect } from 'react';
import { X, Video, Phone, Clock } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import Avatar from '../ui/Avatar';

const INVITE_TTL_MS = 45000;
const REMINDER_LABEL = { host_joined: 'Já começou', '0m': 'Começa agora', '5m': 'Em 5 minutos', '10m': 'Em 10 minutos' };

// Cartão escuro em pílula: ícone verde, texto curto e um botão para entrar
function Toast({ icon, title, subtitle, action, onAction, onClose, ttl }) {
  useEffect(() => {
    if (!ttl) return;
    const t = setTimeout(onClose, ttl);
    return () => clearTimeout(t);
  }, [ttl]);

  return (
    <div role="status" className="card-dark pointer-events-auto relative w-full shadow-pop animate-toast-in overflow-hidden">
      <div className="flex items-center gap-3 p-3 pr-2">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-[14.5px] font-semibold truncate leading-tight">{title}</p>
          <p className="text-[12.5px] text-white/60 truncate mt-0.5">{subtitle}</p>
        </div>
        <button onClick={onAction} className="btn h-10 px-4 signal-grad text-[#0c1405] text-[13.5px] shrink-0">{action}</button>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full text-white/55 hover:text-white hover:bg-white/10 transition-colors shrink-0" aria-label="Dispensar"><X size={16} /></button>
      </div>
      {ttl && <span className="absolute bottom-0 left-0 h-[3px] signal-grad animate-shrink-width" style={{ animationDuration: `${ttl}ms` }} />}
    </div>
  );
}

// Avisos discretos no topo: convites para reuniões em grupo (sem toque de chamada) e lembretes da agenda
export default function MeetingToasts() {
  const { meetingNotifications, setMeetingNotifications, handleStartMeeting, meetingInvites, joinMeetingInvite, dismissMeetingInvite } = useChat();
  const removeReminder = (id) => setMeetingNotifications(prev => prev.filter(n => n.id !== id));

  if (meetingNotifications.length === 0 && meetingInvites.length === 0) return null;

  return (
    <div className="fixed z-[500] inset-x-3 md:inset-x-auto md:right-5 md:w-[400px] flex flex-col gap-2 pointer-events-none" style={{ top: 'max(0.75rem, env(safe-area-inset-top))' }}>
      {meetingInvites.map((invite) => (
        <Toast
          key={invite.id}
          icon={
            <span className="relative shrink-0">
              <Avatar src={invite.fromAvatar} name={invite.fromName} size={44} />
              <span className="absolute -bottom-1 -right-1 w-[22px] h-[22px] rounded-full signal-grad text-[#0c1405] flex items-center justify-center ring-2 ring-[rgb(var(--dark-card))]">
                {invite.type === 'audio' ? <Phone size={11} strokeWidth={2.5} /> : <Video size={11} strokeWidth={2.5} />}
              </span>
            </span>
          }
          title={invite.roomName || 'Reunião'}
          subtitle={`${invite.fromName} convidou você`}
          action="Entrar"
          onAction={() => joinMeetingInvite(invite)}
          onClose={() => dismissMeetingInvite(invite.id)}
          ttl={INVITE_TTL_MS}
        />
      ))}

      {meetingNotifications.map((notif) => (
        <Toast
          key={`${notif.id}-${notif.type}`}
          icon={<span className="w-11 h-11 rounded-full signal-grad text-[#0c1405] flex items-center justify-center shrink-0"><Clock size={20} /></span>}
          title={notif.title}
          subtitle={notif.label || REMINDER_LABEL[notif.type] || 'Começa em breve'}
          action="Entrar"
          onAction={() => { handleStartMeeting(`meeting_${notif.id}`); removeReminder(notif.id); }}
          onClose={() => removeReminder(notif.id)}
        />
      ))}
    </div>
  );
}
