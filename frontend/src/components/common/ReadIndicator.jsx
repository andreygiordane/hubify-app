import React from 'react';

// Um tique cinza = enviada; dois tiques azuis = lida (como no WhatsApp)
export default function ReadIndicator({ isRead, size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size * 0.7}
      viewBox="0 0 16 11"
      fill="none"
      className={`${isRead ? 'text-chat-tick' : 'text-chat-meta'} ${className}`}
      aria-label={isRead ? 'Mensagem lida' : 'Enviada'}
      role="img"
    >
      {isRead ? (
        <>
          <path d="M1 5.8l3.1 3.1L10.4 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.2 8.6l.4.3L13.4 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <path d="M3 5.8l3.1 3.1L12.4 2.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
