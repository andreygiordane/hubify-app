import React, { useEffect, useRef, useState } from 'react';
import { Trash2, ArrowUp, MicOff } from 'lucide-react';
import { formatDuration } from './VoiceMessage';

const MAX_SECONDS = 5 * 60;
const LEVELS = 56;

const pickMimeType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return options.find(t => MediaRecorder.isTypeSupported?.(t)) || '';
};

const extensionFor = (type) => (type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm');

// Barra de gravação: ocupa o lugar do campo de mensagem enquanto o microfone está aberto
export default function VoiceRecorder({ onSend, onCancel }) {
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState(() => Array(LEVELS).fill(0.08));
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const rafRef = useRef(0);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const shouldSendRef = useRef(false);
  const finishRef = useRef(() => {});
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;

  const release = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    ctxRef.current?.close?.().catch?.(() => {});
    ctxRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const mimeType = pickMimeType();
      if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
        setError('Este navegador não permite gravar áudio.');
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        if (!cancelled) setError('Permita o uso do microfone para gravar.');
        return;
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const duration = (Date.now() - startedAtRef.current) / 1000;
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        release();
        if (!shouldSendRef.current || blob.size === 0 || duration < 0.5) return;
        const reader = new FileReader();
        reader.onload = () => {
          const stamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h');
          onSendRef.current({
            name: `Mensagem de voz ${stamp}.${extensionFor(type)}`,
            type: type.split(';')[0],
            size: blob.size,
            data: reader.result,
          });
        };
        reader.readAsDataURL(blob);
      };
      startedAtRef.current = Date.now();
      recorder.start(250);

      // Medidor de volume ao vivo
      const Ctx = window.AudioContext || window.webkitAudioContext;
      let analyser = null;
      let samples = null;
      if (Ctx) {
        const ctx = new Ctx();
        ctxRef.current = ctx;
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        samples = new Uint8Array(analyser.fftSize);
      }
      let lastPush = 0;
      const loop = (now) => {
        const seconds = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(seconds);
        if (seconds >= MAX_SECONDS) { finishRef.current(true); return; } // limite atingido: envia o que foi gravado
        if (analyser && now - lastPush > 70) {
          lastPush = now;
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) { const v = (samples[i] - 128) / 128; sum += v * v; }
          const level = Math.max(0.08, Math.min(1, Math.sqrt(sum / samples.length) * 4));
          setLevels(prev => [...prev.slice(1), level]);
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') r.stop(); else release();
    };
  }, []);

  const finish = (send) => {
    shouldSendRef.current = send;
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop(); else release();
    onCancel(); // fecha a barra; o envio (se houver) acontece no onstop
  };
  finishRef.current = finish;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  if (error) {
    return (
      <div className="flex items-center gap-3 h-[52px] pl-4 pr-1.5 rounded-full bg-surface border border-line shadow-card">
        <MicOff className="w-[18px] h-[18px] text-danger shrink-0" />
        <p className="flex-1 min-w-0 truncate text-sm text-ink-2">{error}</p>
        <button type="button" onClick={() => finish(false)} className="btn-secondary h-9">Fechar</button>
      </div>
    );
  }

  return (
    <div className="dark flex items-center gap-2 h-[52px] pl-1.5 pr-1.5 rounded-full bg-[#111112] text-ink shadow-pop animate-pop-in">
      <button type="button" onClick={() => finish(false)} className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-ink-2 hover:bg-white/10 hover:text-danger transition-colors" title="Descartar gravação" aria-label="Descartar gravação">
        <Trash2 className="w-[18px] h-[18px]" />
      </button>
      <span className="flex items-center gap-2 shrink-0">
        <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
        <span className="font-mono text-[13px] tabular-nums w-10">{formatDuration(elapsed)}</span>
      </span>
      <div className="flex-1 min-w-0 h-8 flex items-center justify-end gap-[2px] overflow-hidden" aria-hidden="true">
        {levels.map((l, i) => (
          <span key={i} className="w-[3px] shrink-0 rounded-full signal-grad-v" style={{ height: `${Math.round(l * 100)}%`, opacity: 0.35 + 0.65 * (i / LEVELS) }} />
        ))}
      </div>
      <button type="button" onClick={() => finish(true)} className="w-10 h-10 shrink-0 rounded-full signal-grad text-[#0c1405] flex items-center justify-center transition-transform active:scale-90" title="Enviar mensagem de voz" aria-label="Enviar mensagem de voz">
        <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
