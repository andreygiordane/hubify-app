import React, { useEffect, useRef, useState } from 'react';
import { User, Lock, Mic, Palette, Bell, BellRing, LogOut, ChevronLeft, ChevronRight, ChevronDown, Video, Volume2, Sun, Moon, Monitor, Play, MonitorSmartphone, MessageSquare, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../theme';
import { usePrefs, audioConstraints, videoConstraints, canChooseOutput } from '../media/prefs';
import Avatar from '../components/ui/Avatar';
import InstallApp from '../components/common/InstallApp';
import Segmented from '../components/ui/Segmented';
import { PUSH_HELP } from '../components/common/PushPrompt';
import { usePush, enablePush, disablePush, checkPushServer } from '../pwa';
import SettingsProfile from './SettingsProfile';

const SECTIONS = [
  { group: 'Conta', items: [
    { id: 'profile', label: 'Meu perfil', short: 'Perfil', hint: 'Foto, nome, cargo e status', icon: User },
    { id: 'security', label: 'Senha e segurança', short: 'Segurança', hint: 'Trocar a senha de acesso', icon: Lock },
  ] },
  { group: 'Aplicativo', items: [
    { id: 'voice', label: 'Voz e vídeo', short: 'Voz e vídeo', hint: 'Microfone, alto-falante e câmera', icon: Mic },
    { id: 'appearance', label: 'Aparência', short: 'Aparência', hint: 'Tema claro, escuro ou do sistema', icon: Palette },
    { id: 'notifications', label: 'Notificações', short: 'Notificações', hint: 'Avisos no aparelho e sons', icon: Bell },
    { id: 'install', label: 'Instalar aplicativo', short: 'Instalar', hint: 'Computador, Android e iPhone', icon: MonitorSmartphone },
  ] },
];
const ALL = SECTIONS.flatMap(s => s.items);
const TABS = ALL.map(({ id, short, icon }) => ({ id, label: short, icon }));

export default function Settings() {
  const { logout, currentUserProfile, userStatus } = useAuth();
  const { setView } = useChat();
  const isDesktop = () => window.matchMedia('(min-width: 768px)').matches;
  const [section, setSection] = useState(() => (isDesktop() ? 'profile' : null));
  const current = ALL.find(s => s.id === section);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isDesktop()) setView('chat'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
      {/* Celular, raiz: lista em cartões agrupados */}
      <nav className={`md:hidden flex-1 ${section ? 'hidden' : 'flex'} flex-col overflow-y-auto custom-scrollbar px-4 pt-3 pb-28`}>
        <h1 className="display text-[28px] text-ink px-1 mb-4">Configurações</h1>

        <button onClick={() => setSection('profile')} className="group-card flex items-center gap-3.5 p-4 mb-5 text-left active:bg-hover shrink-0">
          <Avatar src={currentUserProfile?.avatarUrl} name={currentUserProfile?.name} size={56} status={userStatus} ringClass="ring-app" />
          <span className="flex-1 min-w-0">
            <span className="block text-[17px] font-semibold text-ink truncate">{currentUserProfile?.name || 'Usuário'}</span>
            <span className="block text-sm text-ink-2 truncate">{currentUserProfile?.statusMessage || currentUserProfile?.email || currentUserProfile?.username}</span>
          </span>
          <ChevronRight className="w-5 h-5 text-ink-3" />
        </button>

        {SECTIONS.map(group => (
          <div key={group.group} className="mb-5 shrink-0">
            <p className="section-title px-1 mb-2">{group.group}</p>
            <div className="group-card">
              {group.items.map(item => (
                <button key={item.id} onClick={() => setSection(item.id)} className="group-row">
                  <span className="row-icon"><item.icon className="w-[18px] h-[18px]" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium">{item.label}</span>
                    <span className="block text-[13px] text-ink-3 truncate">{item.hint}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink-3 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="group-card shrink-0">
          <button onClick={logout} className="group-row text-danger">
            <span className="row-icon text-danger"><LogOut className="w-[18px] h-[18px]" /></span>
            <span className="flex-1 text-[15px] font-medium">Sair da conta</span>
          </button>
        </div>
      </nav>

      {/* Cabeçalho + abas segmentadas */}
      <header className={`shrink-0 ${section ? 'block' : 'hidden md:block'}`}>
        <div className="flex items-center gap-1 h-14 md:h-16 px-2 md:px-6">
          <button onClick={() => setSection(null)} className="md:hidden icon-btn w-10 h-10" aria-label="Voltar"><ChevronLeft className="w-6 h-6" /></button>
          <h1 className="flex-1 display text-[20px] md:text-[24px] text-ink truncate"><span className="md:hidden">{current?.label}</span><span className="hidden md:inline">Configurações</span></h1>
          <button onClick={logout} className="hidden md:inline-flex btn-ghost h-9 text-danger hover:text-danger hover:bg-danger-soft"><LogOut className="w-4 h-4" /> Sair da conta</button>
          <button onClick={() => setView('chat')} className="hidden md:inline-flex btn-ghost h-9 pl-3 pr-2" title="Fechar (Esc)">
            Fechar <kbd className="ml-1 px-1.5 py-0.5 rounded-md bg-app text-[10.5px] text-ink-2">Esc</kbd>
          </button>
        </div>
        <div className="px-4 md:px-6 pb-3">
          <Segmented options={TABS} value={section} onChange={setSection} label="Seções das configurações" />
        </div>
      </header>

      {/* Conteúdo */}
      <main className={`flex-1 min-h-0 md:bg-app md:mx-2 md:mb-2 md:rounded-[22px] overflow-y-auto custom-scrollbar ${section ? 'block' : 'hidden md:block'}`}>
        <div className="max-w-[720px] mx-auto px-4 md:px-6 pt-1 md:pt-6 pb-28 md:pb-10">
          <h2 className="hidden md:block display text-[22px] text-ink mb-4 px-1">{current?.label}</h2>
          <div className="md:card md:p-7">
            {section === 'profile' && <SettingsProfile section="profile" />}
            {section === 'security' && <SettingsProfile section="security" />}
            {section === 'voice' && <VoiceVideoSettings />}
            {section === 'appearance' && <AppearanceSettings />}
            {section === 'notifications' && <NotificationSettings />}
            {section === 'install' && <InstallApp />}
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- Componentes auxiliares ---------- */

function Toggle({ checked, onChange, label, description, icon: Icon, iconClass = 'bg-surface text-ink shadow-card', disabled = false }) {
  return (
    <label className={`group-row select-none ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      {Icon && <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconClass}`}><Icon className="w-[18px] h-[18px]" /></span>}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {description && <span className="block text-[13px] text-ink-2 mt-0.5 leading-snug">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative w-[50px] h-[30px] rounded-full shrink-0 transition-colors duration-200 ${checked ? 'bg-success' : 'bg-ink-3/40'}`}
      >
        <span className={`absolute top-[2px] left-[2px] w-[26px] h-[26px] rounded-full bg-white shadow-[0_2px_5px_rgb(0_0_0/0.22)] transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </label>
  );
}

function Select({ label, value, onChange, options, icon: Icon }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="relative block">
        {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`field appearance-none pr-10 cursor-pointer truncate ${Icon ? 'pl-11' : ''}`}
        >
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
      </span>
    </label>
  );
}

const Section = ({ title, children }) => (
  <section className="mb-8 last:mb-0">
    {title && <h3 className="section-title mb-3 px-1">{title}</h3>}
    {children}
  </section>
);

/* ---------- Voz e vídeo ---------- */

function VoiceVideoSettings() {
  const [prefs, setPrefs] = usePrefs();
  const [devices, setDevices] = useState({ audioinput: [], audiooutput: [], videoinput: [] });
  const [permission, setPermission] = useState('pending'); // pending | granted | denied
  const [micTesting, setMicTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const micStreamRef = useRef(null);
  const camStreamRef = useRef(null);
  const videoRef = useRef(null);
  const rafRef = useRef(null);

  const loadDevices = async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    const group = (kind, fallback) => list.filter(d => d.kind === kind).map((d, i) => ({ value: d.deviceId, label: d.label || `${fallback} ${i + 1}` }));
    setDevices({ audioinput: group('audioinput', 'Microfone'), audiooutput: group('audiooutput', 'Alto-falante'), videoinput: group('videoinput', 'Câmera') });
  };

  // Pede permissão uma vez para conseguir os nomes dos aparelhos
  useEffect(() => {
    // Sem HTTPS confiável o navegador nem expõe câmera e microfone
    if (!navigator.mediaDevices) { setPermission('denied'); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
        s.getTracks().forEach(t => t.stop());
        if (!cancelled) setPermission('granted');
      } catch {
        if (!cancelled) setPermission('denied');
      }
      if (!cancelled) loadDevices();
    })();
    navigator.mediaDevices.addEventListener?.('devicechange', loadDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.('devicechange', loadDevices);
      stopMic();
      stopCamera();
    };
  }, []);

  const stopMic = () => {
    cancelAnimationFrame(rafRef.current);
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    setLevel(0);
  };

  const startMic = async (p = prefs) => {
    stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(p) });
      micStreamRef.current = stream;
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      stream.getTracks()[0].addEventListener('ended', () => ctx.close());
    } catch {
      setMicTesting(false);
    }
  };

  const stopCamera = () => {
    camStreamRef.current?.getTracks().forEach(t => t.stop());
    camStreamRef.current = null;
  };

  const startCamera = async (p = prefs) => {
    stopCamera();
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(p) });
      camStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      setCameraError('Não foi possível abrir a câmera. Verifique se outro aplicativo está usando ou se o acesso foi bloqueado.');
      setCameraOn(false);
    }
  };

  useEffect(() => { if (micTesting) startMic(prefs); else stopMic(); }, [micTesting, prefs.audioInputId, prefs.noiseSuppression, prefs.echoCancellation, prefs.autoGainControl]);
  useEffect(() => { if (cameraOn) startCamera(prefs); else stopCamera(); }, [cameraOn, prefs.videoInputId]);

  const withDefault = (list) => [{ value: '', label: 'Padrão do sistema' }, ...list.filter(d => d.value && d.value !== 'default' && d.value !== 'communications')];
  const bars = 40;

  return (
    <div>
      {permission === 'denied' && (
        <div className="mb-6 px-4 py-3 rounded-[16px] bg-warning/15 text-ink text-sm leading-relaxed">
          O navegador bloqueou o acesso à câmera ou ao microfone. Libere nas permissões do site (ícone ao lado do endereço) e volte aqui.
        </div>
      )}

      <Section title="Áudio">
        <div className={`grid gap-4 ${canChooseOutput ? 'sm:grid-cols-2' : ''}`}>
          <Select label="Microfone" icon={Mic} value={prefs.audioInputId} onChange={(v) => setPrefs({ audioInputId: v })} options={withDefault(devices.audioinput)} />
          {canChooseOutput && (
            <Select label="Alto-falante ou fone" icon={Volume2} value={prefs.audioOutputId} onChange={(v) => setPrefs({ audioOutputId: v })} options={withDefault(devices.audiooutput)} />
          )}
        </div>

        <div className="rounded-[24px] bg-app text-ink dark:bg-[rgb(32,32,36)] dark:text-white p-4 sm:p-5 mt-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold">Teste do microfone</p>
              <p className="text-[13px] text-ink-2 dark:text-white/60 mt-0.5">Fale algo: a onda mostra o volume que os outros recebem.</p>
            </div>
            <button onClick={() => setMicTesting(v => !v)} className={`btn h-10 px-5 shrink-0 ${micTesting ? 'bg-surface text-ink shadow-card hover:bg-hover dark:shadow-none dark:bg-white/15 dark:text-white dark:hover:bg-white/25' : 'bg-brand text-on-brand hover:bg-brand-hover dark:bg-white dark:text-[#111111] dark:hover:bg-white/90'}`}>
              {micTesting ? 'Parar' : 'Testar'}
            </button>
          </div>
          {/* Onda: barras verticais que crescem do centro conforme o volume */}
          <div className="flex items-center gap-[3px] h-14 mt-4" aria-label="Nível do microfone">
            {Array.from({ length: bars }).map((_, i) => {
              const shape = 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6));
              const center = 1 - Math.abs(i - (bars - 1) / 2) / (bars / 2);
              const height = micTesting ? Math.max(8, Math.min(100, level * 130 * shape * (0.45 + 0.55 * center))) : 8;
              return <span key={i} className={`flex-1 rounded-full transition-[height] duration-100 ease-out ${micTesting && level > 0.04 ? (level > 0.9 ? 'bg-warning' : 'signal-grad-v') : 'bg-ink-3/30 dark:bg-white/20'}`} style={{ height: `${height}%` }} />;
            })}
          </div>
        </div>
      </Section>

      <Section title="Processamento de voz">
        <div className="group-card">
          <Toggle
            checked={prefs.noiseSuppression}
            onChange={(v) => setPrefs({ noiseSuppression: v })}
            label="Supressão de ruído"
            description="Reduz sons de fundo como teclado, ventilador e trânsito."
          />
          <Toggle
            checked={prefs.echoCancellation}
            onChange={(v) => setPrefs({ echoCancellation: v })}
            label="Cancelamento de eco"
            description="Evita que os outros escutem a própria voz saindo do seu alto-falante."
          />
          <Toggle
            checked={prefs.autoGainControl}
            onChange={(v) => setPrefs({ autoGainControl: v })}
            label="Ajuste automático de volume"
            description="Equilibra o volume se você se afastar ou aproximar do microfone."
          />
        </div>
        <p className="text-xs text-ink-3 mt-2.5 px-1">As mudanças valem a partir da próxima chamada.</p>
      </Section>

      <Section title="Vídeo">
        <div className="rounded-[24px] bg-app text-ink dark:bg-[rgb(32,32,36)] dark:text-white overflow-hidden aspect-video flex items-center justify-center relative">
          {cameraOn ? (
            <video ref={(el) => { videoRef.current = el; if (el && camStreamRef.current) el.srcObject = camStreamRef.current; }} autoPlay playsInline muted className="w-full h-full object-cover -scale-x-100" />
          ) : (
            <div className="text-center px-6">
              <span className="w-14 h-14 rounded-full bg-surface shadow-card text-ink dark:shadow-none dark:bg-white/10 dark:text-white flex items-center justify-center mx-auto mb-4"><Video className="w-6 h-6" strokeWidth={1.75} /></span>
              <button onClick={() => setCameraOn(true)} className="btn h-10 px-5 bg-brand text-on-brand hover:bg-brand-hover dark:bg-white dark:text-[#111112] dark:hover:bg-white/90">Testar câmera</button>
              {cameraError && <p className="text-sm text-ink-2 dark:text-white/70 mt-3 max-w-xs mx-auto">{cameraError}</p>}
            </div>
          )}
          {cameraOn && (
            <button onClick={() => setCameraOn(false)} className="absolute bottom-3 right-3 btn h-9 bg-black/55 backdrop-blur-md text-white hover:bg-black/70">Parar</button>
          )}
        </div>
        <div className="mt-4">
          <Select label="Câmera" icon={Video} value={prefs.videoInputId} onChange={(v) => setPrefs({ videoInputId: v })} options={withDefault(devices.videoinput)} />
        </div>
      </Section>
    </div>
  );
}

/* ---------- Aparência ---------- */

// Miniatura do app em cada tema, com as cores reais dos tokens
const THEME_PREVIEW = {
  light: { app: '#EEEEF2', surface: '#ffffff', ink: '#111111', muted: '#d4d4dc' },
  dark: { app: '#0b0b0c', surface: '#18181B', ink: '#f5f5f6', muted: '#3a3a40' },
};

function ThemeThumb({ colors }) {
  return (
    <span className="flex h-full gap-[5%] p-[7%]" style={{ background: colors.app }}>
      <span className="w-[14%] flex flex-col items-center gap-[10%]">
        <span className="w-full aspect-square rounded-[30%]" style={{ background: colors.ink }} />
        <span className="w-[70%] aspect-square rounded-full" style={{ background: colors.muted }} />
        <span className="w-[70%] aspect-square rounded-full" style={{ background: colors.muted }} />
      </span>
      <span className="flex-1 rounded-[10px] p-[8%] flex flex-col justify-end gap-[8%]" style={{ background: colors.surface }}>
        <span className="h-[16%] w-[55%] rounded-full" style={{ background: colors.muted }} />
        <span className="h-[16%] w-[42%] rounded-full self-end" style={{ background: colors.ink }} />
        <span className="h-[16%] w-[30%] rounded-full self-end" style={{ background: 'linear-gradient(90deg,#4ADE80,#A3E635)' }} />
      </span>
    </span>
  );
}

function AppearanceSettings() {
  const [theme, setTheme] = useTheme();
  const options = [
    { id: 'light', label: 'Claro', icon: Sun },
    { id: 'dark', label: 'Escuro', icon: Moon },
    { id: 'system', label: 'Sistema', icon: Monitor },
  ];
  return (
    <Section title="Tema">
      <Segmented options={options} value={theme} onChange={setTheme} size="lg" full label="Tema do aplicativo" />
      <div className="group-card p-3 mt-4">
        <span className="relative block aspect-[16/9] sm:aspect-[2/1] rounded-[18px] overflow-hidden">
          {theme === 'system' ? (
            <>
              <span className="absolute inset-0"><ThemeThumb colors={THEME_PREVIEW.light} /></span>
              <span className="absolute inset-0" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}><ThemeThumb colors={THEME_PREVIEW.dark} /></span>
            </>
          ) : (
            <ThemeThumb colors={THEME_PREVIEW[theme] || THEME_PREVIEW.light} />
          )}
        </span>
      </div>
      <p className="text-[13px] text-ink-2 mt-3 px-1">"Sistema" acompanha o tema claro ou escuro do seu computador ou celular.</p>
    </Section>
  );
}

/* ---------- Notificações ---------- */

function NotificationSettings() {
  const { user } = useAuth();
  const [prefs, setPrefs] = usePrefs();
  const push = usePush();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const playTest = () => { const a = new Audio('/audio/notificacao.mp3'); a.play().catch(() => {}); };

  useEffect(() => { checkPushServer(); }, []);

  const pushOn = push.subscribed && push.permission === 'granted';
  const blocked = push.availability !== 'ok';

  const togglePush = async (on) => {
    setBusy(true);
    setMessage('');
    if (on) {
      const result = await enablePush(user?.id);
      if (result !== 'enabled') setMessage(PUSH_HELP[result] || PUSH_HELP.failed);
    } else {
      await disablePush();
    }
    setBusy(false);
  };

  return (
    <div>
      <Section title="Neste aparelho">
        <div className="group-card">
          <Toggle
            icon={BellRing}
            iconClass="bg-[#EC4899] text-white"
            checked={pushOn}
            disabled={busy || (blocked && !pushOn)}
            onChange={togglePush}
            label="Notificações push"
            description="Avisos do sistema para mensagens, chamadas e convites, mesmo com o Hubify fechado."
          />
        </div>
        {(message || (blocked && !pushOn)) && (
          <p className="text-[13px] text-ink-2 mt-2.5 px-1 leading-relaxed">{message || PUSH_HELP[push.availability]}</p>
        )}
      </Section>

      <Section title="Sons">
        <div className="group-card">
          <Toggle
            icon={MessageSquare}
            iconClass="bg-[#10B981] text-white"
            checked={prefs.notificationSound}
            onChange={(v) => setPrefs({ notificationSound: v })}
            label="Novas mensagens"
            description="Toca um aviso quando chega mensagem em uma conversa que não está silenciada."
          />
          <Toggle
            icon={Video}
            iconClass="bg-[#F59E0B] text-white"
            checked={prefs.inviteSound !== false}
            onChange={(v) => setPrefs({ inviteSound: v })}
            label="Convites para reuniões"
            description="Um toque curto junto do aviso na tela. Chamadas diretas continuam tocando normalmente."
          />
          <button type="button" onClick={playTest} className="group-row">
            <span className="w-9 h-9 rounded-full bg-brand text-on-brand flex items-center justify-center shrink-0"><Play className="w-4 h-4" /></span>
            <span className="flex-1 text-[15px] font-medium">Ouvir o som</span>
          </button>
        </div>
        <p className="text-[13px] text-ink-2 mt-3 px-1">Para silenciar só uma conversa, abra o menu dela no Chat e escolha <b className="text-ink">Silenciar</b>.</p>
      </Section>
    </div>
  );
}
