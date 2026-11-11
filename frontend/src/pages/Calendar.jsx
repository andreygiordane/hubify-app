import React, { useMemo, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, Video, Bell, Pencil, Trash2, CalendarDays, ArrowRight } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { AvatarStack } from '../components/ui/Avatar';
import PageHeader from '../components/layout/PageHeader';

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const sameDay = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
const hhmm = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Calendar() {
  const {
    meetings, users, handleDeleteMeeting, openEditMeeting, handleStartMeeting,
    setShowCalendarModal, setNewMeetingDate, setNewMeetingTitle, setEditingMeetingId, setCalendarItemType, setSelectedInvitees,
  } = useChat();
  const { user } = useAuth();
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();

  // Dias do mês que têm algo marcado (bolinha sob o número)
  const marks = useMemo(() => {
    const map = new Map();
    meetings.forEach((m) => {
      const d = new Date(m.date);
      if (d.getMonth() !== month || d.getFullYear() !== year) return;
      const cur = map.get(d.getDate()) || { meeting: false, reminder: false };
      cur[m.type === 'reminder' ? 'reminder' : 'meeting'] = true;
      map.set(d.getDate(), cur);
    });
    return map;
  }, [meetings, month, year]);

  const dayEvents = meetings.filter((m) => sameDay(new Date(m.date), selected)).sort((a, b) => new Date(a.date) - new Date(b.date));
  const nextEvent = meetings
    .filter((m) => new Date(m.date).getTime() >= Date.now() - 5 * 60000)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

  const changeMonth = (delta) => setCursor(new Date(year, month + delta, 1));
  const goToday = () => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(new Date()); };
  const goTo = (date) => { const d = new Date(date); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(d); };

  const openNew = () => {
    const pad = (n) => String(n).padStart(2, '0');
    setEditingMeetingId(null);
    setNewMeetingTitle('');
    setSelectedInvitees([]);
    setCalendarItemType('meeting');
    setNewMeetingDate(`${selected.getFullYear()}-${pad(selected.getMonth() + 1)}-${pad(selected.getDate())}T09:00`);
    setShowCalendarModal(true);
  };

  const selectedLabel = sameDay(selected, today)
    ? 'Hoje'
    : capital(selected.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }));

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden bg-surface">
      <PageHeader title="Agenda">
        <button onClick={openNew} className="btn-primary h-10 px-4 text-[14px]"><Plus className="w-4 h-4" strokeWidth={2.5} /> <span className="hidden sm:inline">Novo compromisso</span><span className="sm:hidden">Novo</span></button>
      </PageHeader>

      <main className="flex-1 overflow-y-auto custom-scrollbar bg-app md:m-2 md:mt-0 md:rounded-[22px] p-4 md:p-6 pb-28 md:pb-6">
        <div className="mx-auto w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-4 md:gap-5 items-start">

          {/* Calendário compacto */}
          <section className="card p-4 sm:p-5 w-full max-w-[420px] mx-auto lg:max-w-none lg:sticky lg:top-0">
            <div className="flex items-center gap-1 mb-3">
              <h2 className="flex-1 text-[17px] font-bold tracking-[-0.02em] text-ink px-1">
                {capital(cursor.toLocaleDateString('pt-BR', { month: 'long' }))} <span className="text-ink-3 font-semibold">{year}</span>
              </h2>
              {!(sameDay(selected, today) && month === today.getMonth() && year === today.getFullYear()) && (
                <button onClick={goToday} className="btn-ghost h-8 px-3 text-[12.5px]">Hoje</button>
              )}
              <button onClick={() => changeMonth(-1)} className="icon-btn w-9 h-9" aria-label="Mês anterior"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => changeMonth(1)} className="icon-btn w-9 h-9" aria-label="Próximo mês"><ChevronRight className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-7 text-center">
              {WEEKDAYS.map((d, i) => <span key={i} className="h-8 flex items-center justify-center text-[11px] font-semibold text-ink-3">{d}</span>)}
              {Array.from({ length: offset }).map((_, i) => <span key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const date = new Date(year, month, day);
                const isSelected = sameDay(date, selected);
                const isToday = sameDay(date, today);
                const mark = marks.get(day);
                return (
                  <button key={day} onClick={() => setSelected(date)} aria-pressed={isSelected} aria-label={date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} className="relative h-10 flex items-center justify-center group">
                    <span className={`w-9 h-9 flex items-center justify-center rounded-full text-[14px] tabular-nums transition-colors ${
                      isSelected ? 'signal-grad text-[#0c1405] font-bold' : isToday ? 'bg-brand text-on-brand font-bold' : 'text-ink font-medium group-hover:bg-hover'
                    }`}>
                      {day}
                    </span>
                    {mark && !isSelected && (
                      <span className="absolute bottom-0 flex gap-[3px]">
                        {mark.meeting && <span className="w-1 h-1 rounded-full bg-success" />}
                        {mark.reminder && <span className="w-1 h-1 rounded-full bg-warning" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Próximo evento, em pílula escura */}
            <button
              onClick={() => nextEvent && goTo(nextEvent.date)}
              disabled={!nextEvent}
              className="card-dark !rounded-full mt-4 w-full h-12 pl-1.5 pr-4 flex items-center gap-3 text-left disabled:opacity-100 transition-transform active:scale-[0.99]"
            >
              <span className="w-9 h-9 rounded-full signal-grad text-[#0c1405] flex items-center justify-center shrink-0">
                {nextEvent?.type === 'reminder' ? <Bell className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </span>
              {nextEvent ? (
                <>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold truncate leading-tight">{nextEvent.title}</span>
                    <span className="block text-[11px] text-white/55 leading-tight">Próximo · {sameDay(new Date(nextEvent.date), today) ? 'hoje' : new Date(nextEvent.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
                  </span>
                  <span className="font-mono text-[13px] font-semibold shrink-0">{hhmm(nextEvent.date)}</span>
                </>
              ) : (
                <span className="flex-1 text-[13px] text-white/65">Nenhum compromisso à frente</span>
              )}
            </button>
          </section>

          {/* Compromissos do dia escolhido */}
          <section className="min-w-0">
            <div className="flex items-baseline gap-2 px-1 mb-3">
              <h3 className="text-[17px] font-bold tracking-[-0.02em] text-ink">{selectedLabel}</h3>
              <span className="text-[13px] text-ink-2">{dayEvents.length === 0 ? 'livre' : `${dayEvents.length} compromisso${dayEvents.length > 1 ? 's' : ''}`}</span>
            </div>

            {dayEvents.length === 0 ? (
              <div className="card px-6 py-12 flex flex-col items-center text-center">
                <span className="w-14 h-14 rounded-full bg-app text-ink-3 flex items-center justify-center mb-4"><CalendarDays className="w-6 h-6" strokeWidth={1.75} /></span>
                <p className="text-[15px] font-semibold text-ink">Nada marcado neste dia</p>
                <p className="text-sm text-ink-2 mt-1 max-w-xs">Agende uma reunião ou crie um lembrete só seu.</p>
                <button onClick={openNew} className="btn-secondary h-10 px-5 mt-5"><Plus className="w-4 h-4" /> Novo compromisso</button>
              </div>
            ) : (
              <ul className="space-y-3">
                {dayEvents.map((event) => {
                  const isMeeting = event.type !== 'reminder';
                  const mine = event.creatorId === user?.id;
                  const people = [event.creatorId, ...(event.participants || [])].map((id) => users.find((u) => u.id === id)).filter(Boolean);
                  const ongoing = event.status === 'ongoing';
                  return (
                    <li key={event.id} className="card p-4 flex items-center gap-3.5">
                      <div className={`w-[58px] shrink-0 rounded-[18px] py-2.5 text-center ${ongoing ? 'signal-grad text-[#0c1405]' : 'bg-app text-ink'}`}>
                        <p className="metric text-[16px] leading-none">{hhmm(event.date)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[15px] font-semibold text-ink truncate">{event.title}</h4>
                        <div className="flex items-center gap-2 mt-1.5 min-w-0">
                          <span className={`pill shrink-0 ${isMeeting ? 'bg-brand-soft text-brand-ink' : 'bg-warning/15 text-ink'}`}>
                            {isMeeting ? <Video className="w-3 h-3" /> : <Bell className="w-3 h-3" />} {isMeeting ? (ongoing ? 'Em andamento' : 'Reunião') : 'Lembrete'}
                          </span>
                          {isMeeting && people.length > 0 && <AvatarStack people={people} max={4} size={22} />}
                        </div>
                      </div>
                      {(
                        <div className="flex shrink-0">
                          <button onClick={() => openEditMeeting(event)} className="icon-btn w-9 h-9" aria-label="Editar"><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => handleDeleteMeeting(event.id)} className="icon-btn w-9 h-9 hover:text-danger hover:bg-danger-soft" aria-label="Excluir"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                      {isMeeting && (
                        <button onClick={() => handleStartMeeting(`meeting_${event.id}`)} className="round-btn-dark" aria-label={mine && !ongoing ? 'Iniciar reunião' : 'Entrar na reunião'} title={mine && !ongoing ? 'Iniciar reunião' : 'Entrar na reunião'}>
                          <ArrowRight className="w-[18px] h-[18px]" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
