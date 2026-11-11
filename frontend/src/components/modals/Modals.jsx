import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Check, Camera, Phone, PhoneOff, Mic, Video, Search, MessageSquare, Trash2, Users, ChevronDown, Bell, CalendarClock } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { useAuth } from '../../context/AuthContext';
import Avatar, { AvatarStack, presenceOf, PRESENCE } from '../ui/Avatar';
import Segmented from '../ui/Segmented';

/* ---------- Base dos diálogos ---------- */

// Painel que sobe de baixo no celular e caixa centralizada no desktop. Esc e clique fora fecham.
function Dialog({ title, subtitle, onClose, children, footer, z = 'z-[200]' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`overlay ${z}`} onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="dialog-grip" />
        <div className="dialog-head">
          <div className="flex-1 min-w-0">
            <h3 className="dialog-title">{title}</h3>
            {subtitle && <p className="text-[13px] text-ink-2 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="icon-btn w-9 h-9 bg-app" aria-label="Fechar"><X className="w-[18px] h-[18px]" /></button>
        </div>
        {children}
        {footer && <div className="dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

function SearchField({ value, onChange, placeholder, autoFocus }) {
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="field h-11 pl-11 pr-10"
      />
      {value && <button type="button" onClick={() => onChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink" aria-label="Limpar"><X className="w-4 h-4" /></button>}
    </div>
  );
}

const personSubtitle = (u) => u.role || PRESENCE[presenceOf(u)].label;
const matches = (u, q) => !q || u.name?.toLowerCase().includes(q) || u.role?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q);
// No celular o teclado cobriria a lista: só foca a busca sozinho em telas grandes
const wantsAutoFocus = () => window.matchMedia('(min-width: 768px)').matches;

const EmptyPeople = ({ query }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-6">
    <Users className="w-9 h-9 text-ink-3 mb-3" strokeWidth={1.5} />
    <p className="text-sm text-ink-2">{query ? 'Ninguém encontrado com esse nome.' : 'Ainda não há outras pessoas cadastradas.'}</p>
  </div>
);

/* ---------- Chamada recebida / efetuada ---------- */

const CallScreen = ({ children }) => (
  <div className="fixed inset-0 z-[600] bg-[#0b0b0c] text-white flex flex-col items-center overflow-hidden animate-fade-in">
    <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[120vmin] h-[120vmin] rounded-full opacity-[0.16] blur-[110px] signal-grad pointer-events-none" />
    <div className="relative z-10 w-full max-w-md flex-1 flex flex-col items-center px-8" style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))', paddingBottom: 'max(2.5rem, env(safe-area-inset-bottom))' }}>
      {children}
    </div>
  </div>
);

// Avatar grande com ondas em volta
const RingingAvatar = ({ src, name = 'U' }) => (
  <div className="relative my-8">
    <span className="absolute -inset-5 rounded-full border border-white/20 animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite]" />
    <span className="absolute -inset-10 rounded-full border border-white/10 animate-[ping_2.6s_cubic-bezier(0,0,0.2,1)_infinite] [animation-delay:600ms]" />
    <Avatar src={src} name={name} size={148} className="relative shadow-pop" />
  </div>
);

const RoundAction = ({ icon: Icon, label, className, onClick }) => (
  <button onClick={onClick} className="group flex flex-col items-center gap-2.5">
    <span className={`w-[68px] h-[68px] flex items-center justify-center rounded-full transition-transform group-hover:scale-105 group-active:scale-95 ${className}`}>
      <Icon className="w-7 h-7" />
    </span>
    <span className="text-[13px] font-medium text-white/70 group-hover:text-white transition-colors">{label}</span>
  </button>
);

const CallInterface = ({ incomingCall, isOutgoingCall, outgoingTarget, onAccept, onDecline, onCancel, callType }) => {
  const incomingAudioRef = useRef(new Audio('/audio/toque_chamada_recebida.mp3'));
  const outgoingAudioRef = useRef(new Audio('/audio/toque_chamando.mp3'));

  useEffect(() => {
    const incomingAudio = incomingAudioRef.current;
    incomingAudio.loop = true;
    if (incomingCall) incomingAudio.play().catch(() => {});
    else { incomingAudio.pause(); incomingAudio.currentTime = 0; }
    return () => incomingAudio.pause();
  }, [incomingCall]);

  useEffect(() => {
    const outgoingAudio = outgoingAudioRef.current;
    outgoingAudio.loop = true;
    if (isOutgoingCall) outgoingAudio.play().catch(() => {});
    else { outgoingAudio.pause(); outgoingAudio.currentTime = 0; }
    return () => outgoingAudio.pause();
  }, [isOutgoingCall]);

  if (!incomingCall && !isOutgoingCall) return null;

  // Ligando para alguém
  if (isOutgoingCall && outgoingTarget) {
    const isVideo = callType === 'video';
    return (
      <CallScreen>
        <span className="call-chip bg-white/10">{isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />} {isVideo ? 'Chamada de vídeo' : 'Chamada de voz'}</span>
        <div className="flex-1 flex flex-col items-center justify-center text-center w-full min-h-0">
          <RingingAvatar src={outgoingTarget.avatarUrl} name={outgoingTarget.name} />
          <h2 className="display text-[32px] md:text-[38px] max-w-full truncate">{outgoingTarget.name}</h2>
          <p className="mt-3 text-[15px] text-white/60 animate-pulse">Chamando...</p>
        </div>
        <RoundAction icon={PhoneOff} label="Cancelar" className="bg-danger text-white" onClick={onCancel} />
      </CallScreen>
    );
  }

  // Recebendo
  if (incomingCall) {
    const isVideo = incomingCall.type === 'video';
    return (
      <CallScreen>
        <span className="call-chip bg-white/10">{isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />} {isVideo ? 'Chamada de vídeo recebida' : 'Chamada de voz recebida'}</span>
        <div className="flex-1 flex flex-col items-center justify-center text-center w-full min-h-0">
          <RingingAvatar src={incomingCall.fromAvatar} name={incomingCall.fromName} />
          <h2 className="display text-[32px] md:text-[38px] max-w-full truncate">{incomingCall.fromName}</h2>
          <p className="mt-3 text-[15px] text-white/60">está ligando para você</p>
        </div>
        <div className="flex gap-16 items-start">
          <RoundAction icon={PhoneOff} label="Recusar" className="bg-danger text-white" onClick={() => onDecline(incomingCall)} />
          <RoundAction icon={isVideo ? Video : Phone} label="Atender" className="signal-grad text-[#0c1405] animate-bounce-slow" onClick={() => onAccept(incomingCall)} />
        </div>
      </CallScreen>
    );
  }
  return null;
};

/* ---------- Configuração de mídia antes da chamada ---------- */

const DarkSelect = ({ label, icon: Icon, value, onChange, options, fallback }) => (
  <label className="block">
    <span className="block text-[13px] font-medium text-white/60 mb-1.5">{label}</span>
    <span className="relative block">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-12 rounded-full bg-white/10 text-white text-[15px] pl-11 pr-10 outline-none appearance-none cursor-pointer truncate focus:shadow-[0_0_0_3px_rgb(var(--signal)/0.35)]">
        {options.map((d, i) => <option key={d.deviceId} value={d.deviceId} className="text-black">{d.label || `${fallback} ${i + 1}`}</option>)}
      </select>
      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50 pointer-events-none" />
    </span>
  </label>
);

const MediaSetup = ({ onComplete, onCancel, callType }) => {
  const [videoDevices, setVideoDevices] = useState([]);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedAudio, setSelectedAudio] = useState('');
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    async function getDevices() {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videos = devices.filter(d => d.kind === 'videoinput');
      const audios = devices.filter(d => d.kind === 'audioinput');
      setVideoDevices(videos); setAudioDevices(audios);
      if (videos[0]) setSelectedVideo(videos[0].deviceId);
      if (audios[0]) setSelectedAudio(audios[0].deviceId);
    }
    getDevices();
  }, []);

  useEffect(() => {
    async function startPreview() {
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (callType === 'audio') return;
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: selectedVideo ? { deviceId: { exact: selectedVideo } } : true,
          audio: selectedAudio ? { deviceId: { exact: selectedAudio } } : true
        });
        setStream(s);
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (e) {}
    }
    startPreview();
    return () => stream?.getTracks().forEach(t => t.stop());
  }, [selectedVideo, selectedAudio, callType]);

  return (
    <div className="fixed inset-0 z-[700] bg-[#0b0b0c] text-white flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 items-center bg-[#18181a] p-5 md:p-8 rounded-[28px]">
        <div className="relative aspect-video bg-black rounded-[22px] overflow-hidden">
          {callType === 'video'
            ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
            : <div className="flex items-center justify-center h-full"><span className="w-16 h-16 rounded-full signal-grad text-[#0c1405] flex items-center justify-center"><Mic className="w-7 h-7" /></span></div>}
        </div>
        <div className="space-y-4">
          <h2 className="display text-[26px]">Pronto para entrar?</h2>
          {callType === 'video' && <DarkSelect label="Câmera" icon={Video} value={selectedVideo} onChange={setSelectedVideo} options={videoDevices} fallback="Câmera" />}
          <DarkSelect label="Microfone" icon={Mic} value={selectedAudio} onChange={setSelectedAudio} options={audioDevices} fallback="Microfone" />
          <div className="pt-2 flex flex-col gap-2">
            <button onClick={() => onComplete({ videoId: selectedVideo, audioId: selectedAudio })} className="btn h-12 text-[15px] signal-grad text-[#0c1405]"><Check className="w-4 h-4" strokeWidth={2.5} /> Entrar na chamada</button>
            <button onClick={onCancel} className="btn h-11 text-white/70 hover:bg-white/10 hover:text-white">Cancelar</button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- Nova conversa ---------- */

function NewChatDialog({ onClose }) {
  const { user } = useAuth();
  const { users, startConversation } = useChat();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const people = useMemo(
    () => users.filter(u => u.id !== user?.id && matches(u, q)).sort((a, b) => (presenceOf(b) === 'online') - (presenceOf(a) === 'online') || a.name.localeCompare(b.name)),
    [users, user?.id, q]
  );

  return (
    <Dialog title="Nova conversa" subtitle="Escolha com quem você quer falar" onClose={onClose}>
      <div className="px-5 pb-3 shrink-0">
        <SearchField value={query} onChange={setQuery} placeholder="Buscar por nome, cargo ou e-mail" autoFocus={wantsAutoFocus()} />
      </div>
      <div className="flex-1 min-h-[200px] overflow-y-auto custom-scrollbar px-2.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {people.length === 0 ? <EmptyPeople query={q} /> : people.map(u => (
          <button key={u.id} type="button" onClick={() => { startConversation(u.id); onClose(); }} className="person-row">
            <Avatar src={u.avatarUrl} name={u.name} size={44} status={presenceOf(u)} />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium text-ink truncate">{u.name}</span>
              <span className="block text-[13px] text-ink-3 truncate">{personSubtitle(u)}</span>
            </span>
            <MessageSquare className="w-[18px] h-[18px] text-ink-3 shrink-0 mr-1.5" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}

/* ---------- Novo grupo ---------- */

function NewGroupDialog({ onClose }) {
  const { user } = useAuth();
  const {
    users, handleCreateGroup, newGroupName, setNewGroupName, newGroupDesc, setNewGroupDesc,
    selectedGroupMembers, setSelectedGroupMembers, newGroupAvatar, setNewGroupAvatar,
  } = useChat();
  const fileRef = useRef(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const q = query.trim().toLowerCase();
  const others = useMemo(() => users.filter(u => u.id !== user?.id), [users, user?.id]);
  const people = others.filter(u => matches(u, q));
  const selected = others.filter(u => selectedGroupMembers.includes(u.id));

  const toggle = (id) => setSelectedGroupMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const onFile = (e) => {
    const file = e.target.files[0];
    e.target.value = null;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => setNewGroupAvatar(event.target.result);
    reader.readAsDataURL(file);
  };

  const submit = async (e) => {
    if (!newGroupName.trim()) { e.preventDefault(); return; }
    setCreating(true);
    try { await handleCreateGroup(e); } finally { setCreating(false); }
  };

  const count = selectedGroupMembers.length;

  return (
    <Dialog title="Novo grupo" subtitle="Dê um nome e convide quem participa" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-4 space-y-5">
          {/* Foto + nome */}
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <button type="button" onClick={() => fileRef.current.click()} className="block w-[72px] h-[72px] rounded-[22px] overflow-hidden bg-app text-ink-3 hover:text-ink transition-colors" aria-label="Escolher foto do grupo">
                {newGroupAvatar
                  ? <img src={newGroupAvatar} alt="" className="w-full h-full object-cover" />
                  : <span className="w-full h-full flex items-center justify-center"><Camera className="w-6 h-6" /></span>}
              </button>
              {newGroupAvatar && (
                <button type="button" onClick={() => setNewGroupAvatar('')} className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-surface text-danger shadow-card flex items-center justify-center" aria-label="Remover foto"><Trash2 className="w-3 h-3" /></button>
              )}
              <input type="file" ref={fileRef} onChange={onFile} accept="image/*" className="hidden" />
            </div>
            <label className="flex-1 min-w-0 block">
              <span className="field-label">Nome do grupo</span>
              <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Ex.: Vendas, TI, RH" className="field h-14 text-[17px] font-semibold" maxLength={60} required autoFocus={wantsAutoFocus()} />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Descrição <span className="text-ink-3 font-normal">(opcional)</span></span>
            <textarea value={newGroupDesc} onChange={(e) => setNewGroupDesc(e.target.value)} placeholder="Para que serve este grupo?" rows={2} className="field-area" />
          </label>

          {/* Participantes */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="field-label mb-0">Participantes</span>
              {count > 0 && <span className="font-mono text-[11px] text-brand">{count} selecionado{count > 1 ? 's' : ''}</span>}
            </div>

            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {selected.map(u => (
                  <button key={u.id} type="button" onClick={() => toggle(u.id)} className="h-8 pl-1 pr-2.5 flex items-center gap-1.5 rounded-full bg-app text-[13px] text-ink hover:bg-hover transition-colors" title="Remover">
                    <Avatar src={u.avatarUrl} name={u.name} size={24} />
                    <span className="max-w-[110px] truncate">{u.name.split(' ')[0]}</span>
                    <X className="w-3.5 h-3.5 text-ink-3" />
                  </button>
                ))}
              </div>
            )}

            <SearchField value={query} onChange={setQuery} placeholder="Buscar pessoas" />
            <div className="mt-2 -mx-2.5">
              {people.length === 0 ? <EmptyPeople query={q} /> : people.map(u => {
                const on = selectedGroupMembers.includes(u.id);
                return (
                  <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(u.id)} className="person-row">
                    <Avatar src={u.avatarUrl} name={u.name} size={40} status={presenceOf(u)} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14.5px] font-medium text-ink truncate">{u.name}</span>
                      <span className="block text-[12.5px] text-ink-3 truncate">{personSubtitle(u)}</span>
                    </span>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-1 transition-colors ${on ? 'signal-grad text-[#0c1405]' : 'border-2 border-line'}`}>
                      {on && <Check size={14} strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="dialog-foot items-center">
          {count > 0
            ? <AvatarStack people={selected} max={4} size={36} className="shrink-0 mr-1" />
            : <button type="button" onClick={onClose} className="btn-secondary h-12 px-5 text-[14px]">Cancelar</button>}
          <button type="submit" disabled={!newGroupName.trim() || creating} className="btn-primary flex-1 h-12 text-[14px]">
            {creating ? 'Criando...' : count > 0 ? `Criar e convidar ${count}` : 'Criar grupo'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Convidar para um grupo existente ---------- */

function AddMemberDialog({ groupId, onClose }) {
  const { users, groups, groupInvites, handleSendGroupInvite } = useChat();
  const { user } = useAuth();
  const [localInvites, setLocalInvites] = useState(new Set());
  const [query, setQuery] = useState('');
  const group = groups.find(g => g.id === groupId);
  if (!group) return null;
  const q = query.trim().toLowerCase();
  const people = users.filter(u => u.id !== user?.id && matches(u, q));

  return (
    <Dialog title="Convidar para o grupo" subtitle={group.name} onClose={onClose}>
      <div className="px-5 pb-3 shrink-0">
        <SearchField value={query} onChange={setQuery} placeholder="Buscar pessoas" autoFocus={wantsAutoFocus()} />
      </div>
      <div className="flex-1 min-h-[200px] overflow-y-auto custom-scrollbar px-2.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {people.length === 0 ? <EmptyPeople query={q} /> : people.map(u => {
          const isMember = group.members?.includes(u.id);
          const isInvited = localInvites.has(u.id) || groupInvites?.some(i => i.groupId === groupId && i.toId === u.id && i.status === 'pending');
          return (
            <div key={u.id} className="person-row hover:bg-transparent cursor-default">
              <Avatar src={u.avatarUrl} name={u.name} size={42} status={presenceOf(u)} />
              <span className="flex-1 min-w-0">
                <span className="block text-[14.5px] font-medium text-ink truncate">{u.name}</span>
                <span className="block text-[12.5px] text-ink-3 truncate">{personSubtitle(u)}</span>
              </span>
              {isMember ? (
                <span className="pill bg-app text-ink-2 h-7 px-3">No grupo</span>
              ) : isInvited ? (
                <span className="pill bg-brand-soft text-brand-ink h-7 px-3"><Check size={12} strokeWidth={3} /> Convidado</span>
              ) : (
                <button type="button" onClick={() => { setLocalInvites(prev => new Set(prev).add(u.id)); handleSendGroupInvite(groupId, u.id); }} className="btn-primary h-8">Convidar</button>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}

/* ---------- Perfil de um contato ---------- */

function ContactDetailDialog({ contact, onClose }) {
  const { user } = useAuth();
  const { startConversation, handleStartMeeting, handleStartAudioCall } = useChat();
  const presence = presenceOf(contact);
  const isMe = contact.id === user?.id;
  const roomId = `dm_${[user?.id, contact.id].sort().join('_')}`;
  const call = async (kind) => {
    await startConversation(contact.id);
    if (kind === 'audio') handleStartAudioCall(roomId); else handleStartMeeting(roomId);
    onClose();
  };

  return (
    <Dialog title="Perfil" onClose={onClose} z="z-[250]">
      <div className="overflow-y-auto custom-scrollbar px-5" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex flex-col items-center text-center pt-1 pb-5">
          <Avatar src={contact.avatarUrl} name={contact.name} size={104} status={presence} />
          <h4 className="display text-[24px] text-ink mt-4 max-w-full truncate">{contact.name}</h4>
          <p className="text-sm text-ink-2 mt-1">{contact.role || 'Membro da equipe'} · {PRESENCE[presence].label}</p>
        </div>

        {contact.bio && (
          <div className="group-card px-4 py-3.5 mb-4">
            <p className="section-title mb-1">Sobre</p>
            <p className="text-[15px] text-ink leading-relaxed">{contact.bio}</p>
          </div>
        )}

        {!isMe && (
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { startConversation(contact.id); onClose(); }} className="btn-primary h-12 text-[14px]"><MessageSquare className="w-4 h-4" /> Mensagem</button>
            <button onClick={() => call('audio')} className="btn-secondary h-12 text-[14px]"><Phone className="w-4 h-4" /> Áudio</button>
            <button onClick={() => call('video')} className="btn-secondary h-12 text-[14px]"><Video className="w-4 h-4" /> Vídeo</button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/* ---------- Agendar reunião ou lembrete ---------- */

const SCHEDULE_TYPES = [
  { id: 'meeting', label: 'Reunião', icon: Video },
  { id: 'reminder', label: 'Lembrete', icon: Bell },
];

function ScheduleDialog() {
  const { user } = useAuth();
  const {
    users, handleCreateMeeting, newMeetingTitle, setNewMeetingTitle, newMeetingDate, setNewMeetingDate,
    calendarItemType, setCalendarItemType, selectedInvitees, setSelectedInvitees,
    setShowCalendarModal, editingMeetingId, setEditingMeetingId,
  } = useChat();
  const [query, setQuery] = useState('');
  const isMeeting = calendarItemType !== 'reminder';
  const q = query.trim().toLowerCase();
  const others = useMemo(() => users.filter(u => u.id !== user?.id), [users, user?.id]);
  const people = others.filter(u => matches(u, q));
  const invited = others.filter(u => selectedInvitees.includes(u.id));

  const close = () => {
    setShowCalendarModal(false);
    setEditingMeetingId(null);
    setNewMeetingTitle('');
    setNewMeetingDate('');
    setSelectedInvitees([]);
    setCalendarItemType('meeting');
  };
  const toggle = (id) => setSelectedInvitees(selectedInvitees.includes(id) ? selectedInvitees.filter(x => x !== id) : [...selectedInvitees, id]);
  const ready = newMeetingTitle.trim() && newMeetingDate;

  return (
    <Dialog title={editingMeetingId ? 'Editar compromisso' : isMeeting ? 'Agendar reunião' : 'Novo lembrete'} onClose={close}>
      <form onSubmit={handleCreateMeeting} className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-4 space-y-5">
          <Segmented options={SCHEDULE_TYPES} value={isMeeting ? 'meeting' : 'reminder'} onChange={setCalendarItemType} full label="Tipo de compromisso" />

          <label className="block">
            <span className="field-label">Título</span>
            <input required value={newMeetingTitle} onChange={(e) => setNewMeetingTitle(e.target.value)} placeholder={isMeeting ? 'Ex.: Planejamento mensal' : 'Ex.: Enviar relatório'} className="field h-14 text-[17px] font-semibold" maxLength={80} autoFocus={wantsAutoFocus()} />
          </label>

          <label className="block">
            <span className="field-label">Data e horário</span>
            <span className="relative block">
              <CalendarClock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
              <input required type="datetime-local" value={newMeetingDate} onChange={(e) => setNewMeetingDate(e.target.value)} className="field pl-11" />
            </span>
          </label>

          {isMeeting ? (
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="field-label mb-0">Convidados</span>
                {invited.length > 0 && <span className="font-mono text-[11px] text-brand">{invited.length} selecionado{invited.length > 1 ? 's' : ''}</span>}
              </div>
              <SearchField value={query} onChange={setQuery} placeholder="Buscar pessoas" />
              <div className="mt-2 -mx-2.5">
                {people.length === 0 ? <EmptyPeople query={q} /> : people.map(u => {
                  const on = selectedInvitees.includes(u.id);
                  return (
                    <button key={u.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(u.id)} className="person-row">
                      <Avatar src={u.avatarUrl} name={u.name} size={40} status={presenceOf(u)} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[14.5px] font-medium text-ink truncate">{u.name}</span>
                        <span className="block text-[12.5px] text-ink-3 truncate">{personSubtitle(u)}</span>
                      </span>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-1 transition-colors ${on ? 'signal-grad text-[#0c1405]' : 'border-2 border-line'}`}>
                        {on && <Check size={14} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-2 px-1">Lembretes são só seus: ninguém mais vê nem é avisado.</p>
          )}
        </div>

        <div className="dialog-foot items-center">
          {isMeeting && invited.length > 0
            ? <AvatarStack people={invited} max={4} size={36} className="shrink-0 mr-1" />
            : <button type="button" onClick={close} className="btn-secondary h-12 px-5 text-[14px]">Cancelar</button>}
          <button type="submit" disabled={!ready} className="btn-primary flex-1 h-12 text-[14px]">
            {editingMeetingId ? 'Salvar alterações' : isMeeting ? 'Agendar e avisar' : 'Salvar lembrete'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Ponto de montagem ---------- */

export default function Modals() {
  const { user } = useAuth();
  const {
    showDMModal, setShowDMModal, showGroupModal, setShowGroupModal,
    incomingCall, isOutgoingCall, outgoingTarget, callType,
    showMediaSetup, handleCallComplete, handleCallCancel, handleCallDecline,
    showAddMemberModal, setShowAddMemberModal, activeRoomId,
    showContactDetailModal, setShowContactDetailModal, selectedContactDetail,
    showCalendarModal,
  } = useChat();

  if (!user) return null;

  return (
    <>
      <CallInterface
        incomingCall={incomingCall}
        isOutgoingCall={isOutgoingCall}
        outgoingTarget={outgoingTarget}
        onAccept={(call) => handleCallComplete({ video: call.type === 'video', audio: true })}
        onDecline={(call) => handleCallDecline(call)}
        onCancel={() => handleCallCancel()}
        callType={callType || 'video'}
      />

      {showMediaSetup && <MediaSetup callType={callType || 'video'} onComplete={handleCallComplete} onCancel={handleCallCancel} />}
      {showDMModal && <NewChatDialog onClose={() => setShowDMModal(false)} />}
      {showGroupModal && <NewGroupDialog onClose={() => setShowGroupModal(false)} />}
      {showCalendarModal && <ScheduleDialog />}
      {showAddMemberModal && <AddMemberDialog groupId={activeRoomId} onClose={() => setShowAddMemberModal(false)} />}
      {showContactDetailModal && selectedContactDetail && (
        <ContactDetailDialog contact={selectedContactDetail} onClose={() => setShowContactDetailModal(false)} />
      )}
    </>
  );
}
