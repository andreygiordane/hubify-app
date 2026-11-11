import React, { useState, useEffect } from 'react';
import { Video, CalendarPlus, Calendar, Clock, Link2, Users } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import Avatar, { AvatarStack } from '../components/ui/Avatar';
import PageHeader from '../components/layout/PageHeader';

export default function Meetings() {
  const { handleStartMeeting, setView, setShowCalendarModal, setCalendarItemType, setEditingMeetingId, setNewMeetingTitle, setNewMeetingDate } = useChat();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  const startNow = () => handleStartMeeting(`meeting_${Date.now()}`);

  const schedule = () => {
    setEditingMeetingId?.(null);
    setNewMeetingTitle?.('');
    setNewMeetingDate?.('');
    setCalendarItemType?.('meeting');
    setShowCalendarModal(true);
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-surface">
      <PageHeader title="Reuniões" />

      <main className="flex-1 overflow-y-auto custom-scrollbar pb-28 md:pb-0 bg-app md:m-2 md:mt-0 md:rounded-[22px]">
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button onClick={startNow} className="rounded-[24px] bg-surface border border-black/[0.07] shadow-card hover:shadow-pop dark:border-0 dark:shadow-none dark:hover:shadow-none dark:bg-[rgb(32,32,36)] p-5 text-left flex items-start gap-4 transition-transform active:scale-[0.99] group">
              <span className="w-12 h-12 rounded-full bg-brand text-on-brand dark:bg-white dark:text-[#111111] flex items-center justify-center shrink-0">
                <Video className="w-6 h-6" />
              </span>
              <span>
                <span className="block text-base font-semibold text-ink dark:text-white">Reunir agora</span>
                <span className="block text-sm text-ink-2 dark:text-white/60 mt-0.5">Abra uma sala de vídeo e convide as pessoas lá de dentro.</span>
              </span>
            </button>
            <button onClick={schedule} className="card p-5 text-left flex items-start gap-4 hover:shadow-pop transition-shadow group">
              <span className="w-12 h-12 rounded-full signal-grad text-[#0c1405] flex items-center justify-center shrink-0">
                <CalendarPlus className="w-6 h-6" />
              </span>
              <span>
                <span className="block text-base font-semibold text-ink">Agendar reunião</span>
                <span className="block text-sm text-ink-2 mt-0.5">Escolha data, horário e participantes. Eles recebem um lembrete.</span>
              </span>
            </button>
          </section>

          <section className="card">
            <div className="px-5 py-4 border-b border-line/70 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Próximas reuniões</h2>
              <button onClick={() => setView('calendar')} className="btn-ghost h-8 text-brand">
                <Calendar className="w-4 h-4" /> Abrir agenda
              </button>
            </div>
            <MeetingList now={now} />
          </section>
        </div>
      </main>
    </div>
  );
}

function MeetingList({ now }) {
  const { meetings, handleStartMeeting, users } = useChat();
  const { user } = useAuth();

  const list = meetings
    .filter(m => m.type === 'meeting')
    .filter(m => m.status === 'ongoing' || new Date(m.date).getTime() > now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (list.length === 0) {
    return (
      <div className="py-14 flex flex-col items-center text-center px-6">
        <Clock className="w-10 h-10 text-ink-3 mb-3" strokeWidth={1.5} />
        <p className="text-ink font-semibold">Nenhuma reunião agendada</p>
        <p className="text-sm text-ink-2 mt-1">As reuniões que você criar ou para as quais for convidado aparecem aqui.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-line/70">
      {list.map((m) => {
        const date = new Date(m.date);
        const isOngoing = m.status === 'ongoing';
        const isHost = m.creatorId === user?.id;
        const people = [m.creatorId, ...(m.participants || [])].map(id => users.find(u => u.id === id)).filter(Boolean);
        const canJoin = isOngoing || isHost;
        return (
          <li key={m.id} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5">
            <div className={`w-14 shrink-0 text-center rounded-2xl py-2 ${isOngoing ? 'signal-grad text-[#0c1405]' : 'bg-app text-ink'}`}>
              <p className="text-[11px] uppercase leading-none">{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</p>
              <p className="text-lg font-bold leading-tight">{date.getDate()}</p>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-ink truncate">{m.title}</h4>
              <p className="text-sm text-ink-2 flex items-center gap-2 flex-wrap">
                <span>{date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                {isOngoing && <span className="pill bg-success/15 text-success"><span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" /> Em andamento</span>}
                {isHost && <span className="pill bg-hover text-ink-2">Organizador</span>}
              </p>
            </div>
            <AvatarStack people={people} max={4} size={28} className="hidden sm:flex" />
            <button
              onClick={() => handleStartMeeting(`meeting_${m.id}`)}
              className={`${canJoin ? 'btn-primary' : 'btn-secondary'} h-10 px-4 shrink-0`}
              title={canJoin ? 'Entrar na reunião' : 'O organizador ainda não iniciou'}
            >
              <Video className="w-4 h-4" /> {isHost && !isOngoing ? 'Iniciar' : 'Entrar'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
