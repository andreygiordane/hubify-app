import React, { useEffect, useState } from 'react';
import { BellRing, MessageSquare, Video, Phone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useChat } from '../../context/ChatContext';
import { usePush, enablePush, dismissPushPrompt, checkPushServer } from '../../pwa';

export const PUSH_HELP = {
  insecure: 'Este aparelho ainda não confia no HTTPS do servidor. Instale o certificado (Configurações → Instalar aplicativo) e recarregue.',
  'ios-install': 'No iPhone e no iPad, primeiro adicione o Hubify à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá.',
  unsupported: 'Este navegador não oferece notificações push.',
  denied: 'As notificações estão bloqueadas para este site. Libere nas permissões do navegador (ícone ao lado do endereço) e tente de novo.',
  'server-off': 'O servidor está sem o serviço de push. Avise quem administra o Hubify.',
  failed: 'Não foi possível ativar agora. Confira se este aparelho e o servidor têm acesso à internet.',
  dismissed: 'A permissão não foi concedida.',
};

// Convite amigável ANTES da pergunta do navegador: a permissão só é pedida quando a pessoa toca em "Ativar".
// (No iPhone isso é obrigatório: o pedido precisa vir de um toque, dentro do app instalado.)
export default function PushPrompt() {
  const { user } = useAuth();
  const { view } = useChat();
  const { availability, permission, asked } = usePush();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Dá um tempo para a pessoa chegar no app antes de oferecer
  useEffect(() => {
    let t;
    checkPushServer().then((enabled) => { if (enabled) t = setTimeout(() => setReady(true), 2500); });
    return () => clearTimeout(t);
  }, []);

  if (!ready || !user || asked || view === 'room' || availability !== 'ok' || permission !== 'default') return null;

  const activate = async () => {
    setBusy(true);
    const result = await enablePush(user.id);
    setBusy(false);
    if (result !== 'enabled' && PUSH_HELP[result]) setError(PUSH_HELP[result]);
  };

  return (
    <div className="overlay z-[450]" onClick={dismissPushPrompt}>
      <div className="dialog md:max-w-[400px]" role="dialog" aria-modal="true" aria-label="Ativar notificações" onClick={(e) => e.stopPropagation()}>
        <span className="dialog-grip" />
        <div className="px-6 pt-6 text-center" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <span className="mx-auto w-16 h-16 rounded-[22px] bg-brand text-on-brand flex items-center justify-center">
            <BellRing className="w-7 h-7" />
          </span>
          <h3 className="display text-[24px] text-ink mt-5">Não perca nada importante</h3>
          <p className="text-[15px] text-ink-2 mt-2 leading-relaxed">Receba um aviso neste aparelho mesmo com o Hubify fechado.</p>

          <ul className="group-card mt-5 text-left">
            {[[MessageSquare, 'Novas mensagens'], [Phone, 'Chamadas recebidas'], [Video, 'Convites para reuniões']].map(([Icon, label]) => (
              <li key={label} className="group-row min-h-[48px]">
                <span className="w-8 h-8 rounded-full signal-grad text-[#0c1405] flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>
                <span className="text-[14.5px] font-medium text-ink">{label}</span>
              </li>
            ))}
          </ul>

          {error && <p className="text-sm text-danger mt-4 text-left">{error}</p>}

          <button onClick={activate} disabled={busy} className="btn-primary w-full h-12 text-[15px] mt-5">{busy ? 'Ativando...' : 'Ativar notificações'}</button>
          <button onClick={dismissPushPrompt} className="btn-ghost w-full h-11 mt-1.5 text-[14px]">Agora não</button>
          <p className="text-xs text-ink-3 mt-2">Você pode mudar isso em Configurações → Notificações.</p>
        </div>
      </div>
    </div>
  );
}
