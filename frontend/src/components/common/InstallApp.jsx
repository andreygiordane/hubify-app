import React, { useState } from 'react';
import { Download, Check, Share, PlusSquare, MonitorSmartphone, ShieldAlert, MoreVertical } from 'lucide-react';
import { useInstall } from '../../pwa';

// Arquivo da autoridade certificadora local do servidor (instalado uma vez em cada aparelho)
export const CA_URL = '/hubify-ca.crt';

const Step = ({ n, children }) => (
  <li className="flex items-start gap-3">
    <span className="w-6 h-6 rounded-full bg-surface shadow-card text-[12px] font-semibold font-mono text-ink flex items-center justify-center shrink-0">{n}</span>
    <span className="text-sm text-ink-2 leading-relaxed pt-0.5">{children}</span>
  </li>
);

// Botão discreto para a tela de login: só aparece quando o navegador já oferece a instalação
export function InstallButton({ className = '' }) {
  const { canPrompt, installed, promptInstall } = useInstall();
  if (!canPrompt || installed) return null;
  return (
    <button type="button" onClick={promptInstall} className={`btn-ghost h-10 px-4 ${className}`}>
      <Download className="w-4 h-4" /> Instalar o aplicativo
    </button>
  );
}

// Seção completa (Configurações > Aplicativo)
export default function InstallApp() {
  const { canPrompt, installed, isIOS, isAndroid, secure, swState, promptInstall } = useInstall();
  const [result, setResult] = useState('');

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === 'dismissed') setResult('Instalação cancelada. Você pode tentar de novo quando quiser.');
  };

  const untrusted = !secure || swState === 'blocked';

  return (
    <div className="space-y-4">
      <div className="group-card p-5">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-[16px] bg-surface shadow-card flex items-center justify-center shrink-0">
            {installed ? <Check className="w-6 h-6 text-success" /> : <MonitorSmartphone className="w-6 h-6 text-ink" />}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-semibold text-ink">{installed ? 'Aplicativo instalado' : 'Use o Hubify como aplicativo'}</p>
            <p className="text-sm text-ink-2 mt-1 leading-relaxed">
              {installed
                ? 'Você está usando o Hubify em janela própria, com ícone na área de trabalho ou na tela inicial.'
                : 'Abre em janela própria, sem barra de endereço, com ícone na área de trabalho, no menu Iniciar ou na tela inicial do celular.'}
            </p>
            {!installed && canPrompt && (
              <button onClick={install} className="btn-primary h-11 px-5 mt-4 text-[14px]"><Download className="w-4 h-4" /> Instalar agora</button>
            )}
            {result && <p className="text-sm text-ink-2 mt-3">{result}</p>}
          </div>
        </div>
      </div>

      {!installed && untrusted && (
        <div className="rounded-[22px] bg-warning/15 p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-ink"><ShieldAlert className="w-5 h-5 text-warning" /> Este aparelho ainda não confia no servidor</p>
          <p className="text-sm text-ink-2 mt-1.5 leading-relaxed">
            Enquanto o navegador mostrar o aviso "sua conexão não é particular", ele não libera a instalação.
            Instale o certificado do servidor uma única vez neste aparelho e recarregue a página.
          </p>
          <a href={CA_URL} download="hubify-ca.crt" className="btn-secondary h-10 px-4 mt-4"><Download className="w-4 h-4" /> Baixar certificado</a>
        </div>
      )}

      {!installed && !canPrompt && (
        <div className="group-card p-5">
          <p className="section-title mb-3">{isIOS ? 'No iPhone ou iPad (Safari)' : isAndroid ? 'No Android (Chrome)' : 'No computador (Chrome ou Edge)'}</p>
          {isIOS ? (
            <ol className="space-y-3">
              <Step n={1}>Abra o Hubify no <b className="text-ink">Safari</b>.</Step>
              <Step n={2}>Toque em <b className="text-ink inline-flex items-center gap-1">Compartilhar <Share className="w-4 h-4" /></b> na barra do navegador.</Step>
              <Step n={3}>Escolha <b className="text-ink inline-flex items-center gap-1">Adicionar à Tela de Início <PlusSquare className="w-4 h-4" /></b> e confirme.</Step>
            </ol>
          ) : isAndroid ? (
            <ol className="space-y-3">
              <Step n={1}>Toque no menu <b className="text-ink inline-flex items-center gap-1"><MoreVertical className="w-4 h-4" /> do Chrome</b>, no canto superior.</Step>
              <Step n={2}>Escolha <b className="text-ink">Instalar app</b> (ou <b className="text-ink">Adicionar à tela inicial</b>).</Step>
              <Step n={3}>Confirme em <b className="text-ink">Instalar</b>. O ícone aparece junto dos outros aplicativos.</Step>
            </ol>
          ) : (
            <ol className="space-y-3">
              <Step n={1}>Clique no ícone <b className="text-ink inline-flex items-center gap-1">de instalar <Download className="w-4 h-4" /></b> no fim da barra de endereço.</Step>
              <Step n={2}>Ou abra o menu <b className="text-ink inline-flex items-center gap-1"><MoreVertical className="w-4 h-4" /></b> → <b className="text-ink">Transmitir, salvar e compartilhar</b> → <b className="text-ink">Instalar página como app</b>.</Step>
              <Step n={3}>Confirme em <b className="text-ink">Instalar</b>. O Hubify ganha janela e atalho próprios.</Step>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
