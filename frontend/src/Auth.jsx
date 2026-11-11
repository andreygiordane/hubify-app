import React, { useMemo, useState } from 'react';
import { Mail, Lock, User, ArrowRight, Check, UserCircle, Eye, EyeOff } from 'lucide-react';
import { API_URL } from './config';
import Logo from './components/ui/Logo';
import { InstallButton } from './components/common/InstallApp';

const passwordRequirements = [
  { id: 'length', label: 'Mínimo de 8 caracteres', test: (pw) => pw.length >= 8 },
  { id: 'number', label: 'Pelo menos um número', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'Caractere especial (@, #, $)', test: (pw) => /[!@#$%^&*]/.test(pw) },
  { id: 'upper', label: 'Uma letra maiúscula', test: (pw) => /[A-Z]/.test(pw) },
];

const getStrength = (score) => {
  if (score === 4) return { label: 'Forte', color: 'text-success', bar: 'bg-success' };
  if (score >= 2) return { label: 'Média', color: 'text-warning', bar: 'bg-warning' };
  return { label: 'Fraca', color: 'text-danger', bar: 'bg-danger' };
};

export default function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [password, setPassword] = useState('');
  const [formData, setFormData] = useState({ displayName: '', username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [mustUpdateUser, setMustUpdateUser] = useState(null);
  const [updateForm, setUpdateForm] = useState({ password: '', confirmPassword: '' });

  const passwordScore = useMemo(() => passwordRequirements.filter((r) => r.test(formData.password)).length, [formData.password]);
  const passwordStrength = getStrength(passwordScore);
  const passwordIsStrongEnough = passwordScore === passwordRequirements.length;

  const toggleMode = () => {
    setIsLogin((s) => !s);
    setFormData({ displayName: '', username: '', email: '', password: '' });
    setPassword('');
    setShowHints(false);
    setError('');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'password') {
      setPassword(value);
    }
    setFormData((p) => ({ ...p, [name]: value }));
    if (name === 'password' && !isLogin) setShowHints(true);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isLogin && !passwordIsStrongEnough) {
      setError('A senha precisa atender a todos os requisitos de segurança.');
      setShowHints(true);
      return;
    }

    setLoading(true);
    const endpoint = isLogin ? '/auth/login' : '/auth/register';
    try {
      const apiUrl = API_URL;
      const base = apiUrl || '';
      let payload = formData;
      if (isLogin) {
        const identifier = (formData.username || '').trim();
        if (identifier.includes('@')) {
          payload = { email: identifier, password };
        } else {
          payload = { username: identifier, password };
        }
      }
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Erro na autenticação');
      }
      const user = await res.json();

      if (user.mustChangePassword) {
        setMustUpdateUser(user);
        setError('');
        return;
      }

      if (onLogin) onLogin(user);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (updateForm.password !== updateForm.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    const score = passwordRequirements.filter((r) => r.test(updateForm.password)).length;
    if (score < passwordRequirements.length) {
      setError('A nova senha não atende aos requisitos de segurança.');
      return;
    }

    setLoading(true);
    try {
      const apiUrl = API_URL;
      const res = await fetch(`${apiUrl}/auth/users/${mustUpdateUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: updateForm.password }),
      });

      if (!res.ok) throw new Error('Erro ao atualizar senha');

      const updatedUser = await res.json();
      if (onLogin) onLogin(updatedUser);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const labelClass = 'field-label';
  const inputClass = 'field';

  const field = (name, label, Icon, props = {}) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="relative block">
        <Icon className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 w-4 h-4 pointer-events-none" />
        <input name={name} value={formData[name]} onChange={handleChange} className={`${inputClass} pl-11`} {...props} />
      </span>
    </label>
  );

  const Requirements = ({ value }) => (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
      {passwordRequirements.map((req) => {
        const isMet = req.test(value);
        return (
          <li key={req.id} className={`flex items-center gap-2 text-xs ${isMet ? 'text-ink' : 'text-ink-3'}`}>
            <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${isMet ? 'signal-grad text-[#0c1405]' : 'border border-line bg-surface'}`}>{isMet && <Check size={10} strokeWidth={3.5} />}</span>
            {req.label}
          </li>
        );
      })}
    </ul>
  );

  const Spinner = () => <span className="w-4 h-4 border-2 border-on-brand/40 border-t-on-brand rounded-full animate-spin" />;

  return (
    <div className="app-viewport bg-app">
      <div className="h-full overflow-y-auto custom-scrollbar">
        <div className="min-h-full flex flex-col items-center justify-center px-4 py-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
          <Logo size={40} className="text-ink" />

          <main className="w-full max-w-[420px] mt-8 bg-surface rounded-[30px] shadow-stage">
            <div className="p-6 sm:p-9">
              <h1 className="display text-[28px] text-ink">
                {mustUpdateUser ? 'Atualize sua senha' : (isLogin ? 'Entrar' : 'Criar conta')}
              </h1>
              <p className="text-[15px] text-ink-2 mt-2 mb-7">
                {mustUpdateUser
                  ? 'Sua conta usa um padrão de senha antigo. Crie uma nova senha segura para continuar.'
                  : (isLogin ? 'Use seu usuário ou e-mail corporativo.' : 'Leva menos de um minuto.')}
              </p>

              {error && <div className="bg-danger-soft text-danger px-4 py-3 rounded-[16px] mb-5 text-sm">{error}</div>}

              {mustUpdateUser ? (
                <form className="space-y-4" onSubmit={handleUpdatePassword}>
                  <label className="block">
                    <span className={labelClass}>Nova senha</span>
                    <input type="password" value={updateForm.password} onChange={(e) => setUpdateForm({ ...updateForm, password: e.target.value })} className={inputClass} />
                  </label>
                  <label className="block">
                    <span className={labelClass}>Confirmar nova senha</span>
                    <input type="password" value={updateForm.confirmPassword} onChange={(e) => setUpdateForm({ ...updateForm, confirmPassword: e.target.value })} className={inputClass} />
                  </label>
                  <Requirements value={updateForm.password} />
                  <button type="submit" className="btn-primary w-full h-12 text-[15px] mt-2">{loading ? <Spinner /> : 'Atualizar e entrar'}</button>
                  <button type="button" onClick={() => setMustUpdateUser(null)} className="btn-ghost w-full h-11">Voltar para o login</button>
                </form>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  {isLogin ? (
                    field('username', 'Usuário ou e-mail', Mail, { type: 'text', autoComplete: 'username', placeholder: 'nome@empresa.com' })
                  ) : (
                    <>
                      {field('displayName', 'Nome completo', User, { type: 'text', placeholder: 'Como as pessoas verão você' })}
                      {field('username', 'Nome de usuário', UserCircle, { type: 'text', autoComplete: 'username', placeholder: 'usuario' })}
                      {field('email', 'E-mail corporativo', Mail, { type: 'email', autoComplete: 'email', placeholder: 'nome@empresa.com' })}
                    </>
                  )}

                  <label className="block">
                    <span className={labelClass}>Senha</span>
                    <span className="relative block">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-3 w-4 h-4 pointer-events-none" />
                      <input
                        name="password"
                        value={password}
                        onChange={handleChange}
                        onFocus={() => !isLogin && setShowHints(true)}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        className={`${inputClass} pl-11 pr-12`}
                      />
                      <button type="button" onClick={() => setShowPassword((c) => !c)} className="absolute right-2 top-1/2 -translate-y-1/2 icon-btn" title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                  </label>

                  {!isLogin && showHints && (
                    <div className="rounded-[20px] bg-app p-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-ink-2">Força da senha</span>
                        <span className={`font-semibold ${passwordStrength.color}`}>{passwordStrength.label}</span>
                      </div>
                      <div className="flex gap-1 mt-2">
                        {[1, 2, 3, 4].map((step) => <span key={step} className={`h-1.5 flex-1 rounded-full ${passwordScore >= step ? (passwordScore === 4 ? 'signal-grad' : passwordStrength.bar) : 'bg-line'}`} />)}
                      </div>
                      <Requirements value={formData.password} />
                    </div>
                  )}

                  <button type="submit" disabled={loading} className="btn-primary w-full h-12 text-[15px] mt-2">
                    {loading ? <Spinner /> : <>{isLogin ? 'Entrar' : 'Criar conta'} <ArrowRight size={17} /></>}
                  </button>
                </form>
              )}

              {!mustUpdateUser && (
                <p className="mt-7 text-center text-sm text-ink-2">
                  {isLogin ? 'Ainda não tem conta?' : 'Já tem uma conta?'}{' '}
                  <button onClick={toggleMode} className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4 hover:decoration-[3px]">{isLogin ? 'Criar conta' : 'Entrar'}</button>
                </p>
              )}
            </div>
          </main>

          <InstallButton className="mt-5" />
          <p className="font-mono text-[11px] text-ink-3 mt-6">© {new Date().getFullYear()} Hubify</p>
        </div>
      </div>
    </div>
  );
}
