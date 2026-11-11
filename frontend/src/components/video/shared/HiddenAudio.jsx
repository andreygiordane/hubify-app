import React, { useEffect, useRef } from 'react';
import { applyOutputDevice } from '../../../media/prefs';

// Mantém o áudio de quem desligou a câmera tocando (o <video> some quando a câmera está desligada)
export default function HiddenAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    applyOutputDevice(el);
    el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
}
