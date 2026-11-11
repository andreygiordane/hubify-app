const sameDay = (a, b) => a.toDateString() === b.toDateString();

// Hora no estilo WhatsApp: hoje -> 14:05, ontem -> "Ontem", na semana -> dia da semana, depois -> data
export function formatListTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (sameDay(d, yesterday)) return 'Ontem';
  if (now - d < 6 * 24 * 3600 * 1000) {
    const w = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    return w.charAt(0).toUpperCase() + w.slice(1).replace('-feira', '');
  }
  return d.toLocaleDateString('pt-BR');
}

export const formatTime = (ts) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export function formatDaySeparator(ts) {
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return 'Hoje';
  if (sameDay(d, yesterday)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
