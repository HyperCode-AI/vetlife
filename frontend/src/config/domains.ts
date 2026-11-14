/**
 * Configuração Oficial de Multi-Domínio da Plataforma VetLife:
 * - Site Institucional (Landing Page): https://www.vetlifelab.com.br
 * - Sistema & Dashboard Laboratorial:  https://app.vetlifelab.com.br
 */

export type VetLifeDomainMode = 'www' | 'app';
export type AppView = 'landing' | 'tutor' | 'vet' | 'internal' | 'login';

export const DOMAINS = {
  PUBLIC_HOST: (import.meta as any).env?.VITE_PUBLIC_DOMAIN || 'www.vetlifelab.com.br',
  APP_HOST: (import.meta as any).env?.VITE_APP_DOMAIN || 'app.vetlifelab.com.br',
  PUBLIC_URL: (import.meta as any).env?.VITE_PUBLIC_SITE_URL || 'https://www.vetlifelab.com.br',
  APP_URL: (import.meta as any).env?.VITE_APP_SYSTEM_URL || 'https://app.vetlifelab.com.br',
};

/**
 * Identifica se a execução atual está em produção sob o domínio oficial vetlifelab.com.br
 */
export function isProductionCustomDomain(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return host === 'vetlifelab.com.br' || host.endsWith('.vetlifelab.com.br');
}

/**
 * Resolve qual superfície de domínio deve ser exibida:
 * - 'www': Site Institucional (www.vetlifelab.com.br)
 * - 'app': Dashboard e Sistema Laboratorial (app.vetlifelab.com.br)
 */
export function detectInitialDomainMode(): VetLifeDomainMode {
  if (typeof window === 'undefined') return 'www';
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);

  // 1. Subdomínio explícito app.vetlifelab.com.br
  if (host.startsWith('app.')) {
    return 'app';
  }

  // 2. Domínio principal www.vetlifelab.com.br ou vetlifelab.com.br
  if (host === 'www.vetlifelab.com.br' || host === 'vetlifelab.com.br') {
    return 'www';
  }

  // 3. Em ambiente local / preview, permite simular ambos via query (?domain=app) ou rota (/painel, /veterinario, /consulta)
  const domainParam = params.get('domain');
  if (domainParam === 'app') return 'app';
  if (domainParam === 'www') return 'www';

  if (
    path.startsWith('/painel') ||
    path.startsWith('/dashboard') ||
    path.startsWith('/veterinario') ||
    path.startsWith('/login') ||
    path.startsWith('/app')
  ) {
    return 'app';
  }

  return 'www';
}

/**
 * Resolve a visão inicial com base no domínio e caminho da URL
 */
export function detectInitialView(domainMode: VetLifeDomainMode): AppView {
  if (typeof window === 'undefined') {
    return domainMode === 'app' ? 'internal' : 'landing';
  }
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const viewParam = params.get('view') as AppView | null;

  if (domainMode === 'www') {
    if (path.startsWith('/consulta') || viewParam === 'tutor') {
      return 'tutor';
    }
    return 'landing';
  }

  // No domínio app.vetlifelab.com.br (Dashboard & Sistema)
  if (viewParam && ['internal', 'vet', 'tutor', 'login'].includes(viewParam)) {
    return viewParam;
  }
  if (path.startsWith('/login')) return 'login';
  if (path.startsWith('/veterinario')) return 'vet';
  if (path.startsWith('/consulta')) return 'tutor';
  return 'internal';
}

/**
 * Monta a URL absoluta para navegar entre www.vetlifelab.com.br e app.vetlifelab.com.br em produção
 */
export function buildAppSystemUrl(view: 'internal' | 'vet' | 'tutor', protocolCode?: string): string {
  const pathMap: Record<'internal' | 'vet' | 'tutor', string> = {
    internal: '/painel',
    vet: '/veterinario',
    tutor: '/consulta',
  };
  const base = `${DOMAINS.APP_URL}${pathMap[view]}`;
  if (protocolCode) {
    return `${base}?protocol=${encodeURIComponent(protocolCode)}`;
  }
  return base;
}
