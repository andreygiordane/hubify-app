import React, { useState } from 'react';

// Cores vivas sobre o canvas neutro
const PALETTE = ['#EC4899', '#10B981', '#F59E0B', '#EF4444', '#18181B'];
const PLACEHOLDERS = ['/image/sem_foto.avif'];

export const initials = (name = '') =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

export const colorFor = (seed = '') => {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
};

// Presença: cor + legenda
export const PRESENCE = {
  online: { label: 'Disponível', color: 'bg-success' },
  ausente: { label: 'Ausente', color: 'bg-warning' },
  reuniao: { label: 'Em reunião', color: 'bg-danger' },
  ocupado: { label: 'Ocupado', color: 'bg-danger' },
  offline: { label: 'Offline', color: 'bg-ink-3' },
};

export const presenceOf = (person) => {
  if (!person) return 'offline';
  // Sem nenhum aparelho conectado = offline, qualquer que seja o último status escolhido
  if (person.isOnline === false) return 'offline';
  if (person.status && person.status !== 'online' && PRESENCE[person.status]) return person.status;
  return person.isOnline || person.status === 'online' ? 'online' : 'offline';
};

export function PresenceDot({ status = 'offline', size = 12, className = '', ringClass = 'ring-surface' }) {
  return (
    <span
      className={`absolute bottom-0 right-0 rounded-full ring-2 ${ringClass} ${(PRESENCE[status] || PRESENCE.offline).color} ${className}`}
      style={{ width: size, height: size }}
      title={(PRESENCE[status] || PRESENCE.offline).label}
    />
  );
}

export default function Avatar({ src, name = '', size = 40, square = false, status, className = '', ringClass }) {
  const [failed, setFailed] = useState(false);
  const hasImage = src && !failed && !PLACEHOLDERS.includes(src);
  // Grupos usam um "squircle"; pessoas, círculo
  const radius = square ? '' : 'rounded-full';
  const squircle = square ? { borderRadius: Math.round(size * 0.3) } : undefined;

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      {hasImage ? (
        <img src={src} alt={name} onError={() => setFailed(true)} className={`w-full h-full object-cover ${radius} bg-hover`} style={squircle} />
      ) : (
        <div
          className={`w-full h-full ${radius} flex items-center justify-center text-white font-bold select-none`}
          style={{ backgroundColor: colorFor(name), fontSize: Math.max(10, size * 0.36), letterSpacing: '0.02em', ...squircle }}
        >
          {initials(name)}
        </div>
      )}
      {status && <PresenceDot status={status} size={Math.max(8, Math.round(size * 0.27))} ringClass={ringClass} />}
    </div>
  );
}

// Pilha de avatares sobrepostos com borda (grupos, participantes, convidados)
export function AvatarStack({ people = [], max = 4, size = 32, ringClass = 'ring-surface', className = '' }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const overlap = Math.round(size * 0.22);
  return (
    <div className={`flex items-center ${className}`}>
      {shown.map((p, i) => (
        <span key={p.id || i} className={`rounded-full ring-2 ${ringClass}`} style={{ marginLeft: i ? -overlap : 0, zIndex: shown.length - i }} title={p.name}>
          <Avatar src={p.avatarUrl} name={p.name} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className={`rounded-full ring-2 ${ringClass} bg-brand text-on-brand font-bold flex items-center justify-center shrink-0`}
          style={{ marginLeft: -overlap, width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
