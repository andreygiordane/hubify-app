import React from 'react';
import HeaderNotification from '../common/HeaderNotification';

// Cabeçalho padrão das telas: título, subtítulo opcional e ações à direita.
// Sem relógio nem data: a informação de tempo vive só na Agenda.
// No celular mostra o sino de lembretes (no desktop ele fica no trilho lateral).
export default function PageHeader({ title, subtitle, children, bell = true }) {
  return (
    <header className="shrink-0 bg-surface px-4 md:px-6 pt-3 md:pt-4 pb-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <h1 className="display text-[28px] md:text-[24px] text-ink truncate">{title}</h1>
        {subtitle && <p className="text-[13px] text-ink-2 mt-1 truncate">{subtitle}</p>}
      </div>
      {children}
      {bell && <div className="md:hidden"><HeaderNotification /></div>}
    </header>
  );
}
