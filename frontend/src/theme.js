import { useEffect, useState } from 'react';

// Tema: 'light' (padrão) | 'dark' | 'system', salvo por navegador
const KEY = 'hubify_theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

const read = () => {
  try { return localStorage.getItem(KEY) || 'light'; } catch { return 'light'; }
};

const apply = (pref) => {
  const dark = pref === 'dark' || (pref === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
  // Barra de status do celular / título da janela do app instalado na cor do fundo
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0b0c' : '#F4F4F6');
};

// Aplica antes do primeiro render para não piscar o tema errado
apply(read());

const listeners = new Set();
media.addEventListener('change', () => { if (read() === 'system') apply('system'); });

export function setTheme(pref) {
  try { localStorage.setItem(KEY, pref); } catch {}
  apply(pref);
  listeners.forEach(fn => fn(pref));
}

export function useTheme() {
  const [theme, setState] = useState(read);
  useEffect(() => {
    listeners.add(setState);
    return () => listeners.delete(setState);
  }, []);
  return [theme, setTheme];
}
