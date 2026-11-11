import React, { useState, useEffect, useRef } from 'react';
import { Check, Lock, Camera, Trash2, Plus, Minus, X, Eye, EyeOff, AtSign, Mail, Upload } from 'lucide-react';
import { motion, useMotionValue } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import Avatar from '../components/ui/Avatar';

const passwordRequirements = [
  { id: 'length', label: 'Mínimo de 8 caracteres', test: (value) => value.length >= 8 },
  { id: 'number', label: 'Pelo menos um número', test: (value) => /[0-9]/.test(value) },
  { id: 'special', label: 'Caractere especial (@, #, $)', test: (value) => /[!@#$%^&*]/.test(value) },
  { id: 'upper', label: 'Uma letra maiúscula', test: (value) => /[A-Z]/.test(value) },
];

const BIO_MAX = 200;

function Feedback({ error, success }) {
  if (!error && !success) return null;
  return (
    <div role="status" className={`mb-5 px-4 py-3 rounded-[16px] text-sm flex items-center gap-2.5 ${error ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-ink'}`}>
      {!error && <Check className="w-4 h-4 shrink-0" strokeWidth={2.5} />}
      {error || success}
    </div>
  );
}

// Seções "Meu perfil" e "Senha e segurança" da tela de Configurações
export default function SettingsProfile({ section = 'profile' }) {
  const { currentUserProfile } = useAuth();
  const { handleUpdateProfile } = useChat();
  const fileInputRef = useRef(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [role, setRole] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [avatar, setAvatar] = useState('');
  const [tempImage, setTempImage] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setName(currentUserProfile?.name || '');
    setBio(currentUserProfile?.bio || '');
    setRole(currentUserProfile?.role || '');
    setStatusMessage(currentUserProfile?.statusMessage || '');
    setAvatar(currentUserProfile?.avatarUrl || '');
  }, [currentUserProfile?.name, currentUserProfile?.bio, currentUserProfile?.role, currentUserProfile?.statusMessage, currentUserProfile?.avatarUrl]);

  useEffect(() => { setError(''); setSuccess(''); }, [section]);

  const dirty =
    name.trim() !== (currentUserProfile?.name || '') ||
    bio.trim() !== (currentUserProfile?.bio || '') ||
    role.trim() !== (currentUserProfile?.role || '') ||
    statusMessage.trim() !== (currentUserProfile?.statusMessage || '') ||
    avatar !== (currentUserProfile?.avatarUrl || '');

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    e.target.value = null;
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('A imagem deve ter no máximo 5 MB.');
      setSuccess('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => { setError(''); setTempImage(event.target.result); };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e) => {
    e?.preventDefault();
    if (!name.trim()) {
      setError('O nome de exibição é obrigatório.');
      setSuccess('');
      return;
    }
    setError('');
    setSuccess('');
    setIsSavingProfile(true);
    try {
      await handleUpdateProfile({ displayName: name.trim(), name: name.trim(), avatarUrl: avatar, bio: bio.trim(), role: role.trim(), statusMessage: statusMessage.trim() });
      setSuccess('Perfil atualizado.');
    } catch {
      setError('Não foi possível atualizar o perfil.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const score = passwordRequirements.filter((rule) => rule.test(newPassword)).length;
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const handleSavePassword = async (e) => {
    e?.preventDefault();
    if (score < passwordRequirements.length) {
      setError('A nova senha precisa atender a todos os requisitos.');
      setSuccess('');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      setSuccess('');
      return;
    }
    setError('');
    setSuccess('');
    setIsSavingPassword(true);
    try {
      await handleUpdateProfile({ password: newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Senha atualizada.');
    } catch {
      setError('Não foi possível atualizar a senha.');
    } finally {
      setIsSavingPassword(false);
    }
  };

  return (
    <div>
      <Feedback error={error} success={success} />

      {section === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* Foto */}
          <div className="group-card p-5 flex flex-col sm:flex-row items-center gap-5">
            <div className="relative">
              <Avatar src={avatar} name={name || currentUserProfile?.name} size={104} />
              <button
                type="button"
                onClick={() => fileInputRef.current.click()}
                className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-brand text-on-brand flex items-center justify-center ring-4 ring-app hover:bg-brand-hover transition-colors"
                aria-label="Trocar foto"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <p className="text-[16px] font-semibold text-ink">Foto de perfil</p>
              <p className="text-sm text-ink-2 mt-0.5">JPG ou PNG de até 5 MB. Sem foto, mostramos suas iniciais.</p>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3.5">
                <button type="button" onClick={() => fileInputRef.current.click()} className="btn-secondary h-9"><Upload className="w-4 h-4" /> {avatar ? 'Trocar foto' : 'Enviar foto'}</button>
                {avatar && <button type="button" onClick={() => setAvatar('')} className="btn-ghost h-9 text-danger hover:text-danger hover:bg-danger-soft"><Trash2 className="w-4 h-4" /> Remover</button>}
              </div>
            </div>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>

          {/* Dados */}
          <div className="space-y-4">
            <label className="block">
              <span className="field-label">Nome de exibição</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como as pessoas verão você" className="field" maxLength={80} />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="field-label">Cargo</span>
                <input type="text" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex.: Analista de Suporte" className="field" maxLength={60} />
              </label>
              <label className="block">
                <span className="field-label">Status personalizado</span>
                <input type="text" value={statusMessage} onChange={(e) => setStatusMessage(e.target.value)} placeholder="Ex.: Em home office" className="field" maxLength={60} />
              </label>
            </div>

            <label className="block">
              <span className="field-label flex justify-between">Sobre mim <span className="font-mono text-[11px] text-ink-3">{bio.length}/{BIO_MAX}</span></span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))} rows={3} placeholder="Cargo, área ou uma frase curta" className="field-area" />
            </label>
          </div>

          {/* Conta (somente leitura) */}
          {(currentUserProfile?.username || currentUserProfile?.email) && (
            <div>
              <p className="section-title mb-2 px-1">Conta</p>
              <div className="group-card">
                {currentUserProfile?.username && (
                  <div className="group-row">
                    <span className="row-icon"><AtSign className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-ink-3">Usuário</span>
                      <span className="block text-[15px] truncate">{currentUserProfile.username}</span>
                    </span>
                  </div>
                )}
                {currentUserProfile?.email && (
                  <div className="group-row">
                    <span className="row-icon"><Mail className="w-4 h-4" /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs text-ink-3">E-mail</span>
                      <span className="block text-[15px] truncate">{currentUserProfile.email}</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={isSavingProfile || !dirty} className="btn-primary h-11 px-6 text-[14px] w-full sm:w-auto">
              {isSavingProfile ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      )}

      {section === 'security' && (
        <form onSubmit={handleSavePassword} className="space-y-4">
          <p className="text-[15px] text-ink-2 pb-1">Escolha uma senha nova. Ela passa a valer em todos os aparelhos no próximo acesso.</p>

          <label className="block">
            <span className="field-label">Nova senha</span>
            <span className="relative block">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 w-4 h-4 pointer-events-none" />
              <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" className="field pl-11 pr-12" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn" title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <label className="block">
            <span className="field-label">Confirmar nova senha</span>
            <span className="relative block">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 w-4 h-4 pointer-events-none" />
              <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" className="field pl-11" />
            </span>
            {mismatch && <span className="block text-xs text-danger mt-1.5 px-1">As senhas não coincidem.</span>}
          </label>

          <div className="group-card p-4">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((step) => (
                <span key={step} className={`h-1.5 flex-1 rounded-full ${score >= step ? (score === 4 ? 'signal-grad' : score >= 2 ? 'bg-warning' : 'bg-danger') : 'bg-line'}`} />
              ))}
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-3.5">
              {passwordRequirements.map((req) => {
                const met = req.test(newPassword);
                return (
                  <li key={req.id} className={`flex items-center gap-2 text-[13px] ${met ? 'text-ink' : 'text-ink-3'}`}>
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${met ? 'signal-grad text-[#0c1405]' : 'border border-line bg-surface'}`}>{met && <Check size={10} strokeWidth={3.5} />}</span>
                    {req.label}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex justify-end pt-2">
            <button type="submit" disabled={isSavingPassword || !newPassword || !confirmPassword} className="btn-primary h-11 px-6 text-[14px] w-full sm:w-auto">
              {isSavingPassword ? 'Atualizando...' : 'Atualizar senha'}
            </button>
          </div>
        </form>
      )}

      {tempImage && (
        <CropDialog
          image={tempImage}
          onCancel={() => setTempImage(null)}
          onPickOther={() => fileInputRef.current.click()}
          onApply={(dataUrl) => { setAvatar(dataUrl); setTempImage(null); }}
        />
      )}
    </div>
  );
}

/* ---------- Recorte da foto: arrastar para posicionar, rolar/pinçar para ampliar ---------- */

function CropDialog({ image, onCancel, onPickOther, onApply }) {
  const [zoom, setZoom] = useState(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const imgRef = useRef(null);
  const maskRef = useRef(null);
  const pinchRef = useRef(null);

  useEffect(() => { setZoom(1); x.set(0); y.set(0); }, [image]);

  const clamp = (v) => Math.max(0.2, Math.min(5, v));

  const onTouchMove = (e) => {
    if (e.touches.length !== 2) return;
    const dist = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY);
    if (pinchRef.current) setZoom((z) => clamp(z * (dist / pinchRef.current)));
    pinchRef.current = dist;
  };

  const apply = () => {
    const el = imgRef.current;
    const mask = maskRef.current;
    if (!el || !mask || !el.naturalWidth) return;
    const maskRect = mask.getBoundingClientRect();
    const imgRect = el.getBoundingClientRect();
    const ratioX = el.naturalWidth / imgRect.width;
    const ratioY = el.naturalHeight / imgRect.height;
    const size = 400;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111112';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(el, (maskRect.left - imgRect.left) * ratioX, (maskRect.top - imgRect.top) * ratioY, maskRect.width * ratioX, maskRect.height * ratioY, 0, 0, size, size);
    onApply(canvas.toDataURL('image/jpeg', 0.85));
  };

  return (
    <div className="fixed inset-0 z-[400] flex flex-col bg-[#0b0b0c] text-white animate-fade-in">
      <div className="shrink-0 flex items-center gap-2 px-3 h-14" style={{ marginTop: 'env(safe-area-inset-top)' }}>
        <button onClick={onCancel} className="call-btn w-10 h-10 bg-transparent" aria-label="Cancelar"><X className="w-5 h-5" /></button>
        <p className="flex-1 text-[16px] font-semibold">Ajustar foto</p>
        <button onClick={onPickOther} className="btn h-9 text-white/80 hover:bg-white/10 hover:text-white">Escolher outra</button>
      </div>

      <div
        className="flex-1 relative overflow-hidden flex items-center justify-center touch-none"
        onWheel={(e) => setZoom((z) => clamp(z * (e.deltaY > 0 ? 0.92 : 1.08)))}
        onTouchMove={onTouchMove}
        onTouchEnd={() => { pinchRef.current = null; }}
      >
        <motion.img
          ref={imgRef}
          src={image}
          alt=""
          drag
          dragMomentum={false}
          draggable={false}
          style={{ x, y, scale: zoom }}
          className="max-w-[min(86vw,460px)] max-h-[60vh] origin-center cursor-grab active:cursor-grabbing select-none"
        />
        {/* Máscara circular: o que fica dentro do círculo vira a foto */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div ref={maskRef} className="w-[min(72vw,300px)] aspect-square rounded-full ring-2 ring-white shadow-[0_0_0_9999px_rgb(0_0_0/0.62)]" />
        </div>
      </div>

      <div className="shrink-0 px-5 pt-4 flex flex-col items-center gap-4" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center gap-3 w-full max-w-xs">
          <button onClick={() => setZoom((z) => clamp(z - 0.1))} className="call-btn w-10 h-10" aria-label="Diminuir"><Minus className="w-4 h-4" /></button>
          <input type="range" min="0.2" max="5" step="0.01" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="flex-1 accent-white" aria-label="Zoom" />
          <button onClick={() => setZoom((z) => clamp(z + 0.1))} className="call-btn w-10 h-10" aria-label="Aumentar"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2 w-full max-w-xs">
          <button onClick={onCancel} className="btn flex-1 h-12 bg-white/10 text-white hover:bg-white/[0.18] text-[15px]">Cancelar</button>
          <button onClick={apply} className="btn flex-1 h-12 signal-grad text-[#0c1405] text-[15px]"><Check className="w-4 h-4" strokeWidth={2.5} /> Usar foto</button>
        </div>
      </div>
    </div>
  );
}
