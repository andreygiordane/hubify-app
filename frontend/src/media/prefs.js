import { useEffect, useState } from 'react';

// Preferências de áudio/vídeo e notificações, salvas neste navegador
const KEY = 'hubify_media_prefs';
const DEFAULTS = {
  audioInputId: '',
  audioOutputId: '',
  videoInputId: '',
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  notificationSound: true,
  inviteSound: true,
};

const listeners = new Set();

export function getPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export function setPrefs(patch) {
  const next = { ...getPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach(fn => fn(next));
  return next;
}

export function usePrefs() {
  const [prefs, setState] = useState(getPrefs);
  useEffect(() => {
    listeners.add(setState);
    return () => listeners.delete(setState);
  }, []);
  return [prefs, setPrefs];
}

// "ideal" em vez de "exact": se o aparelho escolhido sumir, o navegador usa o padrão
export const audioConstraints = (p = getPrefs()) => ({
  ...(p.audioInputId ? { deviceId: { ideal: p.audioInputId } } : {}),
  noiseSuppression: p.noiseSuppression,
  echoCancellation: p.echoCancellation,
  autoGainControl: p.autoGainControl,
});

export const videoConstraints = (p = getPrefs()) => ({
  ...(p.videoInputId ? { deviceId: { ideal: p.videoInputId } } : {}),
  width: { ideal: 1280 },
  height: { ideal: 720 },
});

export const canChooseOutput = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

// Toca o áudio da chamada no alto-falante/fone escolhido (Chrome/Edge; Safari usa o padrão do sistema)
export function applyOutputDevice(el, p = getPrefs()) {
  if (el && canChooseOutput && p.audioOutputId) el.setSinkId(p.audioOutputId).catch(() => {});
}
