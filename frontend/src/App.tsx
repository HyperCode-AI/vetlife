import React, { useEffect, useRef, useState } from 'react';
import {
  Search,
  Stethoscope,
  LayoutDashboard,
  ExternalLink,
  Menu,
  X,
  LogOut,
  ChevronDown,
  Mail,
  Shield,
} from 'lucide-react';
import { LandingPage } from './pages/LandingPage';
import { TutorPortal } from './pages/TutorPortal';
import { VetPortal } from './pages/VetPortal';
import { InternalPanel } from './pages/InternalPanel';
import { LoginPage } from './pages/LoginPage';
import { api } from './services/api';
import {
  AppView,
  VetLifeDomainMode,
  DOMAINS,
  detectInitialDomainMode,
  detectInitialView,
  isProductionCustomDomain,
  buildAppSystemUrl,
} from './config/domains';

export const App: React.FC = () => {
  const [domainMode, setDomainMode] = useState<VetLifeDomainMode>(() => detectInitialDomainMode());
  const [currentView, setCurrentView] = useState<AppView>(() =>
    detectInitialView(detectInitialDomainMode())
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [, setAuthRevision] = useState(0);
  const [isVerifyingSession, setIsVerifyingSession] = useState<boolean>(() =>
    Boolean(api.getToken())
  );
  const [selectedProtocol, setSelectedProtocol] = useState<string | undefined>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('protocol');
      if (p) return p.toUpperCase();
    }
    return undefined;
  });

  useEffect(() => {
    let active = true;
    const validateInitialSession = async () => {
      if (!api.getToken()) {
        if (active) setIsVerifyingSession(false);
        return;
      }
      await api.verifyRemoteSession();
      if (active) {
        setIsVerifyingSession(false);
        setAuthRevision((r) => r + 1);
      }
    };
    validateInitialSession();

    const onUnauthorized = () => {
      api.logout();
      setAuthRevision((r) => r + 1);
    };
    window.addEventListener('vetlife:unauthorized', onUnauthorized);

    const onPopState = () => {
      const nextDomain = detectInitialDomainMode();
      setDomainMode(nextDomain);
      setCurrentView(detectInitialView(nextDomain));
    };
    window.addEventListener('popstate', onPopState);

    const onClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);

    return () => {
      active = false;
      window.removeEventListener('vetlife:unauthorized', onUnauthorized);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, []);

  const syncBrowserUrl = (nextDomain: VetLifeDomainMode, nextView: AppView, protocol?: string) => {
    if (typeof window === 'undefined') return;
    try {
      const pathMap: Record<AppView, string> = {
        landing: '/',
        tutor: '/consulta',
        vet: '/veterinario',
        internal: '/painel',
        login: '/login',
      };
      const url = new URL(window.location.href);
      url.pathname = pathMap[nextView];
      if (nextDomain === 'app' || nextDomain === 'adm') {
        url.searchParams.set('domain', nextDomain);
      } else {
        url.searchParams.delete('domain');
      }
      if (protocol && nextView === 'tutor') {
        url.searchParams.set('protocol', protocol);
      } else {
        url.searchParams.delete('protocol');
      }
      window.history.pushState({}, '', url.toString());
    } catch {
      // ignore history errors in sandboxed frames
    }
  };

  const handleNavigate = (view: AppView, protocolCode?: string) => {
    setMobileMenuOpen(false);
    if (protocolCode) {
      setSelectedProtocol(protocolCode);
    } else if (view === 'tutor') {
      setSelectedProtocol(undefined);
    }

    if (isProductionCustomDomain()) {
      const host = window.location.hostname.toLowerCase();
      if (view === 'internal' && !host.startsWith('adm.')) {
        window.location.href = buildAppSystemUrl('internal', protocolCode);
        return;
      }
      if (view === 'vet' && !host.startsWith('app.')) {
        window.location.href = buildAppSystemUrl('vet', protocolCode);
        return;
      }
      if (view === 'landing' && (host.startsWith('app.') || host.startsWith('adm.'))) {
        window.location.href = DOMAINS.PUBLIC_URL;
        return;
      }
    }

    const nextDomain: VetLifeDomainMode =
      view === 'internal' || view === 'login'
        ? 'adm'
        : view === 'vet'
        ? 'app'
        : view === 'landing' || view === 'tutor'
        ? 'www'
        : domainMode;

    setDomainMode(nextDomain);
    setCurrentView(view);
    syncBrowserUrl(nextDomain, view, protocolCode);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthSuccess = (targetView: 'internal' | 'vet') => {
    const nextDomain: VetLifeDomainMode = targetView === 'internal' ? 'adm' : 'app';
    setAuthRevision((r) => r + 1);
    setDomainMode(nextDomain);
    setCurrentView(targetView);
    syncBrowserUrl(nextDomain, targetView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthLogout = (scope: 'internal' | 'vet') => {
    api.logout();
    setAuthRevision((r) => r + 1);
    const nextDomain: VetLifeDomainMode = scope === 'internal' ? 'adm' : 'app';
    const nextView: AppView = scope === 'internal' ? 'login' : 'vet';
    setDomainMode(nextDomain);
    setCurrentView(nextView);
    syncBrowserUrl(nextDomain, nextView);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleScrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);
    if (isProductionCustomDomain()) {
      const host = window.location.hostname.toLowerCase();
      if (host.startsWith('app.') || host.startsWith('adm.')) {
        window.location.href = `${DOMAINS.PUBLIC_URL}/#${sectionId}`;
        return;
      }
    }
    if (currentView !== 'landing' || domainMode !== 'www') {
      setDomainMode('www');
      setCurrentView('landing');
      syncBrowserUrl('www', 'landing');
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 120);
    } else {
      const el = document.getElementById(sectionId);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const isLabAuthenticated = api.hasValidSession('internal');
  const isVetAuthenticated = api.hasValidSession('vet');
  const activeAuthUser = api.getCurrentUser();
  const activeAuthVet = api.getCurrentVet();
  const authDisplayName = activeAuthUser?.name || activeAuthVet?.name || 'Usuário';
  const authDisplayEmail = activeAuthUser?.email || activeAuthVet?.email || '';
  const authDisplayRole =
    activeAuthUser?.role === 'admin'
      ? 'Administrador'
      : activeAuthUser?.role === 'biomedical'
      ? 'Biomédico / Técnico'
      : activeAuthVet
      ? 'Médico Veterinário'
      : 'Usuário';
  const authInitials = authDisplayName
    .split(/\s+/)
    .filter((w) => w.length > 1 && !w.endsWith('.'))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'VL';
  const isAuthenticatedAppView =
    (currentView === 'internal' && isLabAuthenticated) ||
    (currentView === 'login' && isLabAuthenticated) ||
    (currentView === 'vet' && isVetAuthenticated);
  const showPublicHeader =
    currentView === 'landing' ||
    currentView === 'tutor' ||
    (currentView === 'vet' && !isVetAuthenticated);
  const showInternalHeader = isAuthenticatedAppView;

  return (
    <div className="relative min-h-screen flex flex-col bg-[#fafbfc] text-[#0b2240]">
      {/* CAMADA DE PROFUNDIDADE AMBIENTE — Gradientes radiais bem sutis em azul escuro (#0b2240 / #13325b) por todo o site */}
      <div
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden no-print"
        aria-hidden="true"
      >
        <div
          className="absolute -top-[180px] -left-[120px] w-[1050px] h-[1050px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(11, 34, 64, 0.035) 0%, rgba(19, 50, 91, 0.015) 42%, rgba(250, 251, 252, 0) 72%)',
          }}
        />
        <div
          className="absolute top-[28%] -right-[220px] w-[1200px] h-[1200px] rounded-full"
          style={{
            background:
              'radial-gradient(circle at center, rgba(19, 50, 91, 0.025) 0%, rgba(11, 34, 64, 0.01) 45%, rgba(250, 251, 252, 0) 72%)',
          }}
        />
        <div
          className="absolute -bottom-[260px] left-[18%] w-[1350px] h-[950px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at center, rgba(11, 34, 64, 0.03) 0%, rgba(19, 50, 91, 0.012) 45%, rgba(250, 251, 252, 0) 74%)',
          }}
        />
      </div>

      {/* GLOBAL NAVBAR */}
      {showPublicHeader ? (
        <header className="sticky top-0 z-50 w-full bg-[#fafbfc]/95 backdrop-blur-md border-b border-slate-200/70 no-print">
          <div className="max-w-[1360px] mx-auto px-3.5 sm:px-6 h-[64px] sm:h-[72px] flex items-center justify-between gap-2 xl:gap-4">
            {/* Esquerda: Logo compacto VetLife */}
            <button
              onClick={() => handleNavigate('landing')}
              className="flex items-center gap-2 text-[#0b2240] hover:opacity-90 transition shrink-0"
              aria-label="VetLife Início"
            >
              <img
                src="/images/vetlife-logo.jpg"
                alt="VetLife"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl object-contain bg-white p-0.5 shadow-sm border border-slate-200/70"
              />
              <span className="font-bold text-base sm:text-lg tracking-tight text-[#0b2240]">VetLife</span>
            </button>

            {/* Centro: Menu Pílula Flutuante Branco (Estilo Editorial Dayos) */}
            <nav
              aria-label="Navegação principal"
              className="hidden lg:flex items-center gap-0.5 bg-white px-2 py-1.5 rounded-full shadow-sm border border-slate-200/80 min-w-0"
            >
              <button
                onClick={() => handleNavigate('landing')}
                className={`text-[12px] xl:text-[13px] font-medium px-2.5 xl:px-3.5 py-1.5 rounded-full transition whitespace-nowrap ${
                  currentView === 'landing'
                    ? 'text-[#0b2240] bg-slate-100 font-semibold'
                    : 'text-[#0b2240] hover:text-[#1d9496] hover:bg-slate-100'
                }`}
              >
                Início
              </button>
              <button
                onClick={() => handleScrollToSection('sobre')}
                className="text-[12px] xl:text-[13px] font-medium text-[#0b2240] hover:text-[#1d9496] px-2.5 xl:px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition whitespace-nowrap"
              >
                Sobre
              </button>
              <button
                onClick={() => handleScrollToSection('fundadora')}
                className="text-[12px] xl:text-[13px] font-medium text-[#0b2240] hover:text-[#1d9496] px-2.5 xl:px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition whitespace-nowrap"
              >
                Quem Somos
              </button>
              <button
                onClick={() => handleScrollToSection('servicos')}
                className="text-[12px] xl:text-[13px] font-medium text-[#0b2240] hover:text-[#1d9496] px-2.5 xl:px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition whitespace-nowrap"
              >
                Serviços
              </button>
              <button
                onClick={() => handleScrollToSection('guia-coleta')}
                className="text-[12px] xl:text-[13px] font-medium text-[#0b2240] hover:text-[#1d9496] px-2.5 xl:px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition whitespace-nowrap"
              >
                Guia de Coleta
              </button>
              <button
                onClick={() => handleScrollToSection('solicitar-coleta')}
                className="text-[12px] xl:text-[13px] font-medium text-[#0b2240] hover:text-[#1d9496] px-2.5 xl:px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition whitespace-nowrap"
              >
                Solicitar Coleta
              </button>
              <button
                onClick={() => handleScrollToSection('contato')}
                className="text-[12px] xl:text-[13px] font-medium text-[#0b2240] hover:text-[#1d9496] px-2.5 xl:px-3.5 py-1.5 rounded-full hover:bg-slate-100 transition whitespace-nowrap"
              >
                Contato
              </button>
            </nav>

            {/* Direita (Desktop lg+): Botões de Ação sem corte */}
            <div className="hidden lg:flex items-center gap-1.5 xl:gap-2 shrink-0">
              <button
                onClick={() => handleNavigate('tutor')}
                className="hidden xl:inline-flex px-3.5 py-1.5 rounded-full bg-white text-[#0b2240] border border-slate-300 hover:border-[#0b2240] text-[12.5px] font-semibold transition whitespace-nowrap"
              >
                Consultar Laudo
              </button>
              <button
                onClick={() => handleNavigate('vet')}
                className="px-3.5 xl:px-4 py-1.5 xl:py-2 rounded-full bg-[#0b2240] text-white hover:bg-[#13325b] text-[12px] xl:text-[13px] font-semibold transition whitespace-nowrap inline-flex items-center gap-1.5 shadow-sm"
              >
                <Stethoscope className="w-3.5 h-3.5 shrink-0" />
                <span>Portal do Veterinário</span>
              </button>
            </div>

            {/* Direita (Tablet & Mobile < lg): Ações rápidas compactas + Menu Hambúrguer */}
            <div className="flex lg:hidden items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => handleNavigate('tutor')}
                className="px-2.5 sm:px-3 py-1.5 rounded-full bg-white text-[#0b2240] border border-slate-300 text-[11px] sm:text-[12px] font-semibold whitespace-nowrap"
              >
                Laudos
              </button>
              <button
                onClick={() => handleNavigate('vet')}
                className="px-2.5 sm:px-3 py-1.5 rounded-full bg-[#0b2240] text-white text-[11px] sm:text-[12px] font-semibold whitespace-nowrap inline-flex items-center gap-1"
              >
                <Stethoscope className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
                <span>Portal Vet</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="p-2 rounded-full bg-white border border-slate-200 text-[#0b2240] shrink-0"
                aria-label="Abrir menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Menu Mobile */}
          {mobileMenuOpen && (
            <div className="lg:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-3 shadow-lg max-h-[calc(100vh-64px)] overflow-y-auto">
              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 gap-2 text-[13px] font-medium">
                <button
                  onClick={() => handleNavigate('landing')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Início
                </button>
                <button
                  onClick={() => handleScrollToSection('sobre')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Sobre o Laboratório
                </button>
                <button
                  onClick={() => handleScrollToSection('fundadora')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Quem Somos
                </button>
                <button
                  onClick={() => handleScrollToSection('servicos')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Serviços e Exames
                </button>
                <button
                  onClick={() => handleScrollToSection('guia-coleta')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Guia de Coleta
                </button>
                <button
                  onClick={() => handleScrollToSection('solicitar-coleta')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Solicitar Coleta
                </button>
                <button
                  onClick={() => handleScrollToSection('contato')}
                  className="text-left px-3.5 py-2.5 rounded-xl bg-slate-50 text-[#0b2240]"
                >
                  Contato
                </button>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => handleNavigate('tutor')}
                  className="w-full py-2.5 rounded-full bg-white text-[#0b2240] border border-slate-300 text-[13px] font-semibold"
                >
                  Consultar Laudo
                </button>
                <button
                  onClick={() => handleNavigate('vet')}
                  className="w-full py-2.5 rounded-full bg-[#0b2240] text-white text-[13px] font-semibold"
                >
                  Portal do Veterinário
                </button>
              </div>
            </div>
          )}
        </header>
      ) : showInternalHeader ? (
        <header className="sticky top-0 z-50 w-full h-[60px] bg-[#0b2240] text-white shadow-sm no-print">
          <div className="max-w-[1320px] mx-auto px-3 sm:px-6 h-full flex items-center justify-between gap-2 sm:gap-4">
            <button
              onClick={() => handleNavigate(isLabAuthenticated ? 'internal' : 'vet')}
              className="flex items-center gap-2 text-white hover:opacity-90 transition shrink-0"
              aria-label="VetLife Sistema"
            >
              <img
                src="/images/vetlife-logo.jpg"
                alt="VetLife"
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-contain bg-white p-0.5"
              />
              <span className="text-[14px] sm:text-[15px] font-bold tracking-tight text-white">VetLife</span>
            </button>

            <nav className="flex items-center gap-2 sm:gap-6 text-[11.5px] sm:text-[13px] font-medium text-white min-w-0">
              {isLabAuthenticated && !isVetAuthenticated && (
                <button
                  onClick={() => handleNavigate('internal')}
                  className={`inline-flex items-center gap-1 sm:gap-1.5 transition whitespace-nowrap ${
                    currentView === 'internal' || currentView === 'login'
                      ? 'text-[#7fdbea] font-semibold'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="sm:hidden">Painel</span>
                  <span className="hidden sm:inline">Painel Laboratorial</span>
                </button>
              )}

              {isVetAuthenticated && !isLabAuthenticated && (
                <button
                  onClick={() => handleNavigate('vet')}
                  className={`inline-flex items-center gap-1 sm:gap-1.5 transition whitespace-nowrap ${
                    currentView === 'vet'
                      ? 'text-[#7fdbea] font-semibold'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  <Stethoscope className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                  <span className="sm:hidden">Portal Vet</span>
                  <span className="hidden sm:inline">Portal do Veterinário</span>
                </button>
              )}

              <button
                onClick={() => handleNavigate('tutor')}
                className="inline-flex items-center gap-1 sm:gap-1.5 transition text-white/80 hover:text-white whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="sm:hidden">Protocolo</span>
                <span className="hidden sm:inline">Consulta de Protocolo</span>
              </button>
            </nav>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => handleNavigate('landing')}
                className="hidden sm:inline-flex px-3.5 py-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 text-[12px] font-medium transition items-center gap-1.5"
              >
                <span>Voltar ao Site</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#7fdbea]" />
              </button>

              {/* Menu do Usuário Logado (Padrão de Mercado com Balão Popover) */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 sm:gap-2 pl-1.5 pr-2.5 sm:pr-3 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="menu"
                >
                  <span className="w-7 h-7 rounded-full bg-[#1d9496] text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {authInitials}
                  </span>
                  <span className="text-[12.5px] font-semibold max-w-[160px] truncate hidden md:inline">
                    {authDisplayName}
                  </span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-white/80 transition-transform ${
                      userMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2.5 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl bg-white text-[#0b2240] shadow-xl shadow-slate-900/15 border border-slate-200/90 p-4 z-50 space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#0b2240] text-white text-[13px] font-bold flex items-center justify-center shrink-0">
                        {authInitials}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="text-[13px] font-bold text-[#0b2240] leading-snug truncate">
                          {authDisplayName}
                        </div>
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#1d9496]/10 text-[#1d9496] text-[10.5px] font-semibold">
                          <Shield className="w-3 h-3" />
                          <span>{authDisplayRole}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[12px] text-[#5b6675]">
                      {authDisplayEmail && (
                        <div className="flex items-center gap-2 truncate">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{authDisplayEmail}</span>
                        </div>
                      )}
                      {activeAuthVet?.crmv && (
                        <div className="text-[11px] font-mono text-[#0b2240] bg-slate-50 px-2.5 py-1 rounded-lg">
                          {activeAuthVet.crmv} • {activeAuthVet.clinic_name}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleNavigate('landing');
                        }}
                        className="sm:hidden w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 text-[#0b2240] text-[12.5px] font-medium inline-flex items-center gap-2"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#1d9496]" />
                        <span>Voltar ao Site</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleAuthLogout(isLabAuthenticated ? 'internal' : 'vet');
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-red-50 text-red-600 text-[12.5px] font-semibold inline-flex items-center gap-2 transition"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sair da Conta</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      ) : null}

      {/* CONTEÚDO PRINCIPAL */}
      <main className="relative z-10 flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-8">
        {currentView === 'landing' && <LandingPage onNavigate={handleNavigate} />}
        {currentView === 'tutor' && <TutorPortal initialProtocol={selectedProtocol} />}
        {currentView === 'vet' &&
          (isVerifyingSession ? (
            <div className="min-h-[60vh] flex items-center justify-center text-[#5b6675] text-sm">
              Validando sessão segura...
            </div>
          ) : isVetAuthenticated ? (
            <VetPortal onLogout={() => handleAuthLogout('vet')} />
          ) : isLabAuthenticated ? (
            <div className="min-h-[60vh] flex items-center justify-center py-12">
              <div className="max-w-md w-full bg-white rounded-[28px] p-8 shadow-sm border border-slate-200 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0b2240]/10 text-[#0b2240] flex items-center justify-center mx-auto">
                  <Shield className="w-6 h-6" />
                </div>
                <h2 className="font-display text-[22px] font-semibold text-[#0b2240]">
                  Portal Exclusivo de Veterinários
                </h2>
                <p className="text-[13px] text-[#5b6675]">
                  Você está autenticado como usuário do laboratório. Usuários do laboratório não possuem acesso ao Portal do Veterinário.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                  <button
                    onClick={() => handleNavigate('internal')}
                    className="px-5 py-2.5 rounded-full bg-[#0b2240] text-white text-[13px] font-semibold"
                  >
                    Voltar ao Painel Laboratorial
                  </button>
                  <button
                    onClick={() => handleAuthLogout('vet')}
                    className="px-5 py-2.5 rounded-full bg-slate-100 text-[#0b2240] text-[13px] font-semibold"
                  >
                    Trocar de Conta
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <LoginPage
              mode="vet"
              onSuccess={handleAuthSuccess}
              onBackToSite={() => handleNavigate('landing')}
            />
          ))}
        {(currentView === 'internal' || currentView === 'login') &&
          (isVerifyingSession ? (
            <div className="min-h-[60vh] flex items-center justify-center text-[#5b6675] text-sm">
              Validando sessão segura...
            </div>
          ) : isLabAuthenticated ? (
            <InternalPanel onLogout={() => handleAuthLogout('internal')} />
          ) : isVetAuthenticated ? (
            <div className="min-h-[60vh] flex items-center justify-center py-12">
              <div className="max-w-md w-full bg-white rounded-[28px] p-8 shadow-sm border border-slate-200 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-[#0b2240]/10 text-[#0b2240] flex items-center justify-center mx-auto">
                  <Shield className="w-6 h-6" />
                </div>
                <h2 className="font-display text-[22px] font-semibold text-[#0b2240]">
                  Área Exclusiva do Laboratório
                </h2>
                <p className="text-[13px] text-[#5b6675]">
                  Você está conectado como Médico Veterinário. Veterinários têm acesso exclusivo ao Portal do Veterinário.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                  <button
                    onClick={() => handleNavigate('vet')}
                    className="px-5 py-2.5 rounded-full bg-[#0b2240] text-white text-[13px] font-semibold"
                  >
                    Voltar ao Portal do Veterinário
                  </button>
                  <button
                    onClick={() => handleAuthLogout('internal')}
                    className="px-5 py-2.5 rounded-full bg-slate-100 text-[#0b2240] text-[13px] font-semibold"
                  >
                    Trocar de Conta
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <LoginPage
              mode="internal"
              onSuccess={handleAuthSuccess}
              onBackToSite={() => handleNavigate('landing')}
            />
          ))}
      </main>

      {/* RODAPÉ */}
      <footer className="relative z-10 w-full bg-transparent border-t border-slate-200/70 text-[#7b8694] py-10 sm:py-12 text-[13px] no-print">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-3.5">
            <img
              src="/images/vetlife-logo.jpg"
              alt="VetLife Laboratório Veterinário"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-contain bg-white p-1 border border-slate-200/70 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-[#0b2240] font-semibold leading-snug">
                VetLife Laboratório de Análises Clínicas Veterinárias
              </div>
              <div className="text-[#5b6675] text-[12px] leading-relaxed mt-0.5 break-words">
                R. La Salles, 424 - Mocoquinha, São Sebastião do Paraíso - MG, 37950-000 •
                Recepção/Técnico: (35) 98458-1997 • Financeiro: +55 35 98445-1372
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-2 w-full md:w-auto">
            <div className="flex flex-wrap items-center gap-4 text-[#0b2240] font-medium text-[12px]">
              <button onClick={() => handleNavigate('landing')} className="hover:text-[#1d9496]">
                Início
              </button>
              <button onClick={() => handleNavigate('tutor')} className="hover:text-[#1d9496]">
                Consultar Laudo
              </button>
              {!isLabAuthenticated && (
                <button onClick={() => handleNavigate('vet')} className="hover:text-[#1d9496]">
                  Portal do Veterinário
                </button>
              )}
            </div>
            <div className="text-[12px] text-[#7b8694]">
              Copyright © {new Date().getFullYear()} VetLife Diagnósticos Veterinários. Todos os
              direitos reservados.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
