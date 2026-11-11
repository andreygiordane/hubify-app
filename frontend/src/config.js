// URLs do backend e do servidor de sinalização.
// Sem variáveis definidas, usa o mesmo domínio do frontend (o nginx/vite repassa /api e /socket.io),
// o que permite abrir o app de qualquer aparelho por um único endereço HTTPS.
export const API_URL = import.meta.env.VITE_API_URL || '/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
