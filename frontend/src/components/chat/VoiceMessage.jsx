import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause } from 'lucide-react';

const BARS = 44;
const SPEEDS = [1, 1.5, 2];
const cache = new Map(); // id da mensagem -> { peaks, duration }
let currentAudio = null; // só um áudio toca por vez

export const formatDuration = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// Forma de onda "de espera", estável por mensagem, usada até o áudio ser decodificado
const placeholderPeaks = (seed = '') => {
  let h = 7;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Array.from({ length: BARS }, (_, i) => {
    h = (h * 1103515245 + 12345) | 0;
    const noise = ((h >>> 16) & 0xff) / 255;
    return 0.25 + 0.6 * noise * (0.6 + 0.4 * Math.sin((i / BARS) * Math.PI));
  });
};

async function analyse(src) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error('sem AudioContext');
  const buf = await (await fetch(src)).arrayBuffer();
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf);
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / BARS));
    const raw = [];
    for (let i = 0; i < BARS; i++) {
      let sum = 0;
      const start = i * step;
      const end = Math.min(start + step, data.length);
      for (let j = start; j < end; j += 8) sum += data[j] * data[j];
      raw.push(Math.sqrt(sum / Math.max(1, (end - start) / 8)));
    }
    const max = Math.max(...raw, 0.0001);
    return { peaks: raw.map(v => Math.max(0.12, Math.min(1, v / max))), duration: audio.duration };
  } finally {
    ctx.close?.();
  }
}

// Mensagem de voz: botão de tocar, forma de onda clicável e velocidade
export default function VoiceMessage({ id, src }) {
  const audioRef = useRef(null);
  const waveRef = useRef(null);
  const rafRef = useRef(0);
  const [info, setInfo] = useState(() => cache.get(id) || { peaks: placeholderPeaks(id), duration: 0 });
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (cache.has(id)) return;
    let alive = true;
    analyse(src)
      .then(res => { cache.set(id, res); if (alive) setInfo(res); })
      .catch(() => {});
    return () => { alive = false; };
  }, [id, src]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    const a = audioRef.current;
    if (a) { a.pause(); if (currentAudio === a) currentAudio = null; }
  }, []);

  const tick = () => {
    const a = audioRef.current;
    if (!a) return;
    setTime(a.currentTime);
    if (!a.paused && !a.ended) rafRef.current = requestAnimationFrame(tick);
  };

  const duration = info.duration || (isFinite(audioRef.current?.duration) ? audioRef.current.duration : 0);
  const progress = duration ? Math.min(1, time / duration) : 0;

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused) { a.pause(); return; }
    if (currentAudio && currentAudio !== a) currentAudio.pause();
    currentAudio = a;
    a.playbackRate = speed;
    try { await a.play(); } catch { /* formato não suportado neste navegador */ }
  };

  const seek = (clientX) => {
    const a = audioRef.current;
    const el = waveRef.current;
    if (!a || !el || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    try { a.currentTime = ratio * duration; } catch { /* ainda carregando */ }
    setTime(ratio * duration);
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return (
    <div className="flex items-center gap-2.5 w-[min(64vw,280px)] py-1" onClick={(e) => e.stopPropagation()}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => { setPlaying(true); cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(tick); }}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setTime(0); if (audioRef.current) audioRef.current.currentTime = 0; }}
      />
      <button
        type="button"
        onClick={toggle}
        className="w-10 h-10 shrink-0 rounded-full bg-ink text-app flex items-center justify-center transition-transform active:scale-90"
        aria-label={playing ? 'Pausar' : 'Ouvir mensagem de voz'}
      >
        {playing ? <Pause className="w-4 h-4" fill="currentColor" strokeWidth={0} /> : <Play className="w-4 h-4 ml-0.5" fill="currentColor" strokeWidth={0} />}
      </button>

      <div
        ref={waveRef}
        role="slider"
        tabIndex={0}
        aria-label="Posição do áudio"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(time)}
        onClick={(e) => seek(e.clientX)}
        onKeyDown={(e) => {
          const a = audioRef.current;
          if (!a || !duration) return;
          if (e.key === 'ArrowRight') a.currentTime = Math.min(duration, a.currentTime + 2);
          if (e.key === 'ArrowLeft') a.currentTime = Math.max(0, a.currentTime - 2);
          setTime(a.currentTime);
        }}
        className="flex-1 min-w-0 h-9 flex items-center gap-[2px] cursor-pointer rounded-md"
      >
        {info.peaks.map((p, i) => {
          const played = (i + 0.5) / info.peaks.length <= progress;
          return (
            <span
              key={i}
              className={`flex-1 rounded-full transition-colors duration-100 ${played ? 'signal-grad-v' : 'bg-ink/25'}`}
              style={{ height: `${Math.round(p * 100)}%`, minHeight: 3 }}
            />
          );
        })}
      </div>

      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className="font-mono text-[11px] leading-none text-chat-meta tabular-nums">
          {formatDuration(playing || time > 0 ? time : duration)}
        </span>
        <button type="button" onClick={cycleSpeed} className="font-mono text-[10px] leading-none px-1.5 py-1 rounded-full bg-ink/10 text-ink-2 hover:bg-ink/20 transition-colors" title="Velocidade">
          {speed}x
        </button>
      </div>
    </div>
  );
}
