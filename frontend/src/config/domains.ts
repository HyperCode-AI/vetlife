/**
 * Configuração Oficial de Multi-Domínio da Plataforma VetLife:
 * - Site Institucional & Consulta de Laudos: https://www.vetlifelab.com.br
 * - Portal do Veterinário:                  https://app.vetlifelab.com.br
 * - Portal Laboratorial (Admin/Biomédico):  https://adm.vetlifelab.com.br
 */

export type VetLifeDomainMode = 'www' | 'app' | 'adm';
export type AppView = 'landing' | 'tutor' | 'vet' | 'internal' | 'login';

export const DOMAINS = {
  PUBLIC_HOST: (import.meta as any).env?.VITE_PUBLIC_DOMAIN || 'www.vetlifelab.com.br',
  APP_HOST: (import.meta as any).env?.VITE_APP_DOMAIN || 'app.vetlifelab.com.br',
  ADM_HOST: (import.meta as any).env?.VITE_ADM_DOMAIN || 'adm.vetlifelab.com.br',
  PUBLIC_URL: (import.meta as any).env?.VITE_PUBLIC_SITE_URL || 'https://www.vetlifelab.com.br',
  APP_URL: (import.meta as any).env?.VITE_APP_SYSTEM_URL || 'https://app.vetlifelab.com.br',
  ADM_URL: (import.meta as any).env?.VITE_ADM_SYSTEM_URL || 'https://adm.vetlifelab.com.br',
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
 * - 'www': Site Institucional e Consulta Pública (www.vetlifelab.com.br)
 * - 'app': Portal do Veterinário (app.vetlifelab.com.br)
 * - 'adm': Portal Laboratorial Interno (adm.vetlifelab.com.br)
 */
export function detectInitialDomainMode(): VetLifeDomainMode {
  if (typeof window === 'undefined') return 'www';
  const host = window.location.hostname.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);

  // 1. Subdomínios explícitos
  if (host.startsWith('adm.')) {
    return 'adm';
  }
  if (host.startsWith('app.')) {
    return 'app';
  }

  // 2. Domínio principal www.vetlifelab.com.br ou vetlifelab.com.br
  if (host === 'www.vetlifelab.com.br' || host === 'vetlifelab.com.br') {
    return 'www';
  }

  // 3. Em ambiente local / preview, permite simular via query (?domain=adm|app|www) ou rota
  const domainParam = params.get('domain');
  if (domainParam === 'adm') return 'adm';
  if (domainParam === 'app') return 'app';
  if (domainParam === 'www') return 'www';

  if (
    path.startsWith('/painel') ||
    path.startsWith('/dashboard') ||
    path.startsWith('/login') ||
    path.startsWith('/adm')
  ) {
    return 'adm';
  }

  if (path.startsWith('/veterinario') || path.startsWith('/app')) {
    return 'app';
  }

  return 'www';
}

/**
 * Resolve a visão inicial com base no domínio e caminho da URL
 */
export function detectInitialView(domainMode: VetLifeDomainMode): AppView {
  if (typeof window === 'undefined') {
    if (domainMode === 'adm') return 'internal';
    if (domainMode === 'app') return 'vet';
    return 'landing';
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

  if (domainMode === 'app') {
    if (path.startsWith('/consulta') || viewParam === 'tutor') return 'tutor';
    return 'vet';
  }

  // No domínio adm.vetlifelab.com.br (Portal Laboratorial)
  if (viewParam && ['internal', 'login', 'tutor'].includes(viewParam)) {
    return viewParam;
  }
  if (path.startsWith('/login')) return 'login';
  if (path.startsWith('/consulta')) return 'tutor';
  return 'internal';
}

/**
 * Monta a URL absoluta para navegar entre www, app e adm em produção
 */
export function buildAppSystemUrl(view: 'internal' | 'vet' | 'tutor', protocolCode?: string): string {
  const targetMap: Record<'internal' | 'vet' | 'tutor', string> = {
    internal: `${DOMAINS.ADM_URL}/painel`,
    vet: `${DOMAINS.APP_URL}/veterinario`,
    tutor: `${DOMAINS.PUBLIC_URL}/consulta`,
  };
  const base = targetMap[view];
  if (protocolCode) {
    return `${base}?protocol=${encodeURIComponent(protocolCode)}`;
  }
  return base;
}
