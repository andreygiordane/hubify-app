import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Settings, LogOut, Sun, Moon, Monitor, Check, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { useTheme } from '../../theme';
import Avatar, { PRESENCE } from '../ui/Avatar';

const STATUS_OPTIONS = ['online', 'ocupado', 'reuniao', 'ausente', 'offline'];
const THEMES = [
  { id: 'light', label: 'Claro', icon: Sun },
  { id: 'dark', label: 'Escuro', icon: Moon },
  { id: 'system', label: 'Sistema', icon: Monitor },
];

// Menu do perfil: presença, tema, configurações e sair
export default function ProfileMenu({ className = '' }) {
  const { currentUserProfile, userStatus, setUserStatus, logout } = useAuth();
  const { setView, setShowProfileMenu } = useChat();
  const [theme, setTheme] = useTheme();
  const close = () => setShowProfileMenu(false);

  return (
    <div className={`menu w-72 z-[120] ${className}`}>
      <div className="flex items-center gap-3 px-2.5 py-2.5">
        <Avatar src={currentUserProfile?.avatarUrl} name={currentUserProfile?.name} size={44} status={userStatus} />
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{currentUserProfile?.name || 'Usuário'}</p>
          <p className="text-xs text-ink-2 truncate">{currentUserProfile?.email || currentUserProfile?.username}</p>
        </div>
      </div>

      <div className="border-t border-line my-1" />
      <p className="px-2.5 pt-2 pb-1.5 section-title">Status</p>
      {STATUS_OPTIONS.map(id => (
        <button key={id} onClick={() => { setUserStatus(id); close(); }} className="menu-item">
          <span className={`w-2 h-2 rounded-full ${PRESENCE[id].color}`} />
          <span className="flex-1">{PRESENCE[id].label}</span>
          {userStatus === id && <Check className="w-4 h-4 text-brand" />}
        </button>
      ))}

      <div className="border-t border-line my-1" />
      <p className="px-2.5 pt-2 pb-1.5 section-title">Aparência</p>
      <div className="flex p-1 mx-1 mb-1 rounded-full bg-hover">
        {THEMES.map(t => (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            className={`flex-1 h-8 flex items-center justify-center gap-1.5 rounded-full text-xs transition-colors ${theme === t.id ? 'bg-surface text-ink font-semibold shadow-card' : 'text-ink-2 hover:text-ink'}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="border-t border-line my-1" />
      <button onClick={() => { setView('settings'); close(); }} className="menu-item">
        <Settings className="w-4 h-4 text-ink-2" /> Configurações
      </button>
      <button onClick={logout} className="menu-item text-danger">
        <LogOut className="w-4 h-4" /> Sair
      </button>
    </div>
  );
}

// Celular: o mesmo conteúdo num painel que sobe de baixo, com fundo escurecido na tela toda.
// Vai para o <body> (portal) para o fundo cobrir a tela inteira mesmo dentro de elementos com transform.
export function ProfileSheet() {
  const { currentUserProfile, userStatus, setUserStatus, logout } = useAuth();
  const { setView, showProfileMenu, setShowProfileMenu } = useChat();
  const [theme, setTheme] = useTheme();
  const close = () => setShowProfileMenu(false);

  // Esc fecha o painel (teclado físico / navegador de desktop em tela estreita)
  useEffect(() => {
    if (!showProfileMenu) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showProfileMenu]);

  if (!showProfileMenu) return null;

  return createPortal(
    <div className="md:hidden fixed inset-0 z-[300] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in" onClick={close} />
      <div
        className="relative bg-surface rounded-t-3xl shadow-pop animate-slide-up max-h-[88dvh] overflow-y-auto"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="sticky top-0 bg-surface pt-2.5 pb-1 flex justify-center">
          <span className="w-10 h-1.5 rounded-full bg-line" />
        </div>
        <button onClick={close} className="absolute top-3 right-3 icon-btn w-9 h-9" aria-label="Fechar"><X className="w-5 h-5" /></button>

        {/* Identidade */}
        <div className="flex flex-col items-center text-center px-6 pt-2 pb-5">
          <Avatar src={currentUserProfile?.avatarUrl} name={currentUserProfile?.name} size={76} status={userStatus} />
          <p className="mt-3 display text-[22px] text-ink truncate max-w-full">{currentUserProfile?.name || 'Usuário'}</p>
          <p className="text-sm text-ink-2 truncate max-w-full">{currentUserProfile?.email || currentUserProfile?.username}</p>
        </div>

        <div className="px-4 space-y-4">
          {/* Status em chips */}
          <section>
            <p className="px-1 pb-2 section-title">Status</p>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map(id => {
                const active = userStatus === id;
                return (
                  <button
                    key={id}
                    onClick={() => { setUserStatus(id); close(); }}
                    className={`h-11 px-3 flex items-center gap-2.5 rounded-xl border text-sm transition-colors ${active ? 'border-brand bg-brand-soft text-brand-ink font-semibold' : 'border-line text-ink active:bg-hover'}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${PRESENCE[id].color}`} />
                    <span className="flex-1 text-left truncate">{PRESENCE[id].label}</span>
                    {active && <Check className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Tema em controle segmentado */}
          <section>
            <p className="px-1 pb-2 section-title">Aparência</p>
            <div className="flex p-1 rounded-full bg-hover">
              {THEMES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`flex-1 h-10 flex items-center justify-center gap-1.5 rounded-full text-sm transition-colors ${theme === t.id ? 'bg-surface text-ink font-semibold shadow-card' : 'text-ink-2'}`}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-line overflow-hidden">
            <button onClick={() => { setView('settings'); close(); }} className="w-full h-12 px-4 flex items-center gap-3 text-ink active:bg-hover">
              <Settings className="w-5 h-5 text-ink-2" />
              <span className="flex-1 text-left">Configurações</span>
              <ChevronRight className="w-4 h-4 text-ink-3" />
            </button>
            <button onClick={logout} className="w-full h-12 px-4 flex items-center gap-3 text-danger border-t border-line active:bg-danger-soft">
              <LogOut className="w-5 h-5" />
              <span className="flex-1 text-left">Sair</span>
            </button>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
