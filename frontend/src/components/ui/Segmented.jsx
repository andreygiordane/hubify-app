import React, { useId, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

// Controle segmentado: abas em pílula com um indicador branco que desliza até a opção ativa.
// options: [{ id, label, icon?, badge? }]   size: 'sm' | 'md' | 'lg'   full: ocupa a largura toda
export default function Segmented({ options, value, onChange, size = 'md', full = false, className = '', label }) {
  const group = useId();
  const railRef = useRef(null);
  const sizes = { sm: 'h-8 px-3 text-[12.5px]', md: '', lg: 'h-10 px-4 text-[14px]' };

  // Em telas estreitas o trilho rola: mantém a opção ativa à vista
  useEffect(() => {
    railRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [value]);

  return (
    <div ref={railRef} role="tablist" aria-label={label} className={`segmented ${full ? 'flex w-full' : ''} ${className}`}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`segmented-item ${sizes[size]} ${full ? 'flex-1' : ''}`}
          >
            {active && <motion.span layoutId={`seg-${group}`} className="segmented-thumb" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            <span className="relative z-10 flex items-center gap-1.5">
              {o.icon && <o.icon className="w-4 h-4 shrink-0" />}
              {o.label}
              {o.badge > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full signal-grad text-[#0c1405] text-[10px] font-bold flex items-center justify-center">{o.badge}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
