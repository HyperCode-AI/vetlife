import React, { useState } from 'react';
import {
  Lock,
  Stethoscope,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { api } from '../services/api';

interface LoginPageProps {
  mode: 'internal' | 'vet';
  onSuccess: (targetView: 'internal' | 'vet') => void;
  onBackToSite: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  mode,
  onSuccess,
  onBackToSite,
}) => {
  const isLab = mode === 'internal';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (isLab) {
        await api.loginInternal(email.trim(), password);
        onSuccess('internal');
      } else {
        await api.loginVet(email.trim(), password);
        onSuccess('vet');
      }
    } catch (err: any) {
      const msg =
        err?.message && err.message !== '[object Object]'
          ? err.message
          : null;
      setError(
        msg ||
          (isLab
            ? 'Falha na autenticação laboratorial. Verifique seu e-mail e senha.'
            : 'Falha na autenticação. Verifique seu e-mail e senha de acesso.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-6 sm:py-10 px-0 sm:px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-900/5 border border-slate-200/80 p-5 sm:p-10 space-y-6 sm:space-y-7">
        {/* Cabeçalho com marca VetLife */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <img
                src="/images/vetlife-logo.jpg"
                alt="VetLife"
                className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 border border-slate-200"
              />
              <div>
                <div className="text-[15px] font-bold text-[#0b2240] leading-tight">VetLife</div>
                <div className="text-[11px] font-medium text-[#1d9496]">
                  {isLab ? 'Sistema Laboratorial' : 'Portal do Veterinário'}
                </div>
              </div>
            </div>

            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isLab ? 'bg-[#0b2240]/5 text-[#0b2240]' : 'bg-[#1d9496]/10 text-[#1d9496]'
              }`}
            >
              {isLab ? <Lock className="w-5 h-5" /> : <Stethoscope className="w-5 h-5" />}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-[#0b2240] text-[11px] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1d9496]" />
              <span>Acesso Protegido por Login</span>
            </div>
            <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#0b2240]">
              {isLab ? 'Área Laboratorial' : 'Portal do Veterinário'}
            </h1>
            <p className="text-[14px] leading-relaxed text-[#5b6675]">
              {isLab
                ? 'Faça login com suas credenciais corporativas para acessar o painel, rotina, laudos e configurações.'
                : 'Informe seu e-mail cadastrado e senha para acessar os exames e laudos dos seus pacientes.'}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-red-50 border border-red-200/80 text-red-700 text-[13px]"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="vetlife-login-email"
              className="block text-[12px] font-semibold text-[#0b2240] mb-1.5"
            >
              {isLab ? 'E-mail Corporativo' : 'E-mail Profissional'}
            </label>
            <input
              id="vetlife-login-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                isLab ? 'usuario@vetlifelab.com.br' : 'veterinario@clinica.com.br'
              }
              className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-[#0b2240] text-[15px] placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#1d9496] focus:ring-2 focus:ring-[#1d9496]/20 transition"
            />
          </div>

          <div>
            <label
              htmlFor="vetlife-login-password"
              className="block text-[12px] font-semibold text-[#0b2240] mb-1.5"
            >
              Senha
            </label>
            <div className="relative">
              <input
                id="vetlife-login-password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Digite sua senha"
                className="w-full px-4 py-3 pr-11 rounded-2xl bg-slate-50 border border-slate-200 text-[#0b2240] text-[15px] placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-[#1d9496] focus:ring-2 focus:ring-[#1d9496]/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-[#0b2240] transition"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full py-3.5 rounded-full text-white text-[15px] font-semibold shadow-sm transition flex items-center justify-center gap-2 disabled:opacity-60 ${
              isLab
                ? 'bg-[#0b2240] hover:bg-[#13325b]'
                : 'bg-[#1d9496] hover:bg-[#147a7c]'
            }`}
          >
            {isSubmitting ? (
              <span>Validando acesso...</span>
            ) : (
              <span>{isLab ? 'Entrar na Área Laboratorial' : 'Acessar Portal do Veterinário'}</span>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 flex items-center text-[13px]">
          <button
            type="button"
            onClick={onBackToSite}
            className="inline-flex items-center gap-1.5 text-[#5b6675] hover:text-[#0b2240] font-medium transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Voltar ao Site</span>
          </button>
        </div>
      </div>
    </div>
  );
};
