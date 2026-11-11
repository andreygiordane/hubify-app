import React from 'react';

// Marca do Hubify: duas hastes ligadas por um ponto — o "hub" no meio do H
export function LogoMark({ size = 36, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className={className} aria-hidden="true">
      <rect width="36" height="36" rx="11" fill="rgb(var(--brand))" />
      <rect x="10" y="9" width="4.5" height="18" rx="2.25" fill="rgb(var(--on-brand))" />
      <rect x="21.5" y="9" width="4.5" height="18" rx="2.25" fill="rgb(var(--on-brand))" />
      <circle cx="18" cy="18" r="2.9" fill="rgb(var(--signal))" />
    </svg>
  );
}

export default function Logo({ size = 36, className = '', wordClassName = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      <span className={`display ${wordClassName}`} style={{ fontSize: size * 0.62 }}>Hubify</span>
    </span>
  );
}
