import {
  User,
  Vet,
  Exam,
  ExamLabelTemplate,
  ExamInputField,
  PriceTable,
  ExamReference,
  ReportTemplate,
  Patient,
  Order,
  Invoice,
  CollectionLabel,
  CollectionRequest,
  OperationalStats,
  FinancialStats,
  ExamAttachment,
} from '../types';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api/v1';

const STORAGE_KEYS = {
  TOKEN: 'vetlife_token',
  USER: 'vetlife_user',
  VET: 'vetlife_vet',
  COLLECTIONS_CACHE: 'vetlife_collections_cache_v1',
};

type LocalCollectionStore = {
  overrides: Record<string, Partial<CollectionRequest>>;
  created: CollectionRequest[];
  deletedIds: string[];
};

function readLocalCollectionStore(): LocalCollectionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COLLECTIONS_CACHE);
    if (!raw) return { overrides: {}, created: [], deletedIds: [] };
    const parsed = JSON.parse(raw);
    return {
      overrides: parsed?.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
      created: Array.isArray(parsed?.created) ? parsed.created : [],
      deletedIds: Array.isArray(parsed?.deletedIds) ? parsed.deletedIds : [],
    };
  } catch {
    return { overrides: {}, created: [], deletedIds: [] };
  }
}

function writeLocalCollectionStore(store: LocalCollectionStore): void {
  try {
    localStorage.setItem(STORAGE_KEYS.COLLECTIONS_CACHE, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

function mergeCollectionsWithLocalStore(remoteList: CollectionRequest[]): CollectionRequest[] {
  const store = readLocalCollectionStore();
  const deletedSet = new Set(store.deletedIds);
  const remoteIds = new Set(remoteList.map((c) => c.id).filter(Boolean));
  const localCreatedOnly = store.created.filter((c) => c.id && !remoteIds.has(c.id));
  const combined = [...localCreatedOnly, ...remoteList];
  return combined
    .filter((c) => !c.id || !deletedSet.has(c.id))
    .map((c) => (c.id && store.overrides[c.id] ? { ...c, ...store.overrides[c.id], id: c.id } : c));
}

export function calculatePatientAgeDays(birthDate?: string, fallbackDays?: number): number {
  if (typeof fallbackDays === 'number' && fallbackDays > 0) return fallbackDays;
  if (!birthDate) return 730;
  const birth = new Date(birthDate).getTime();
  if (Number.isNaN(birth)) return 730;
  const diff = Date.now() - birth;
  return Math.max(1, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export function formatAgeLabel(ageDays?: number, birthDate?: string): string {
  const days = calculatePatientAgeDays(birthDate, ageDays);
  if (days < 60) return `${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months} meses (${days} dias)`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days % 365) / 30);
  return remMonths > 0 ? `${years} anos e ${remMonths} meses` : `${years} anos`;
}

export function resolveReferenceForPatient(
  references: ExamReference[],
  examId: string,
  species: string,
  gender: string,
  ageDays: number
): ExamReference | null {
  const examRefs = references.filter((r) => r.exam_id === examId);
  if (examRefs.length === 0) return null;

  const exactMatch = examRefs.find(
    (r) =>
      r.species.toLowerCase() === species.toLowerCase() &&
      (r.gender === 'Ambos' || r.gender.toLowerCase() === gender.toLowerCase()) &&
      ageDays >= r.min_age_days &&
      ageDays <= r.max_age_days
  );
  if (exactMatch) return exactMatch;

  const speciesMatch = examRefs.find((r) => r.species.toLowerCase() === species.toLowerCase());
  return speciesMatch || examRefs[0];
}

export function resolveSideBySideReference(
  fieldName: string,
  fieldLabel: string,
  referenceSnapshot?: string
): string {
  const raw = String(referenceSnapshot || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  if (!raw) return 'Conforme faixa da espécie';

  const segments = raw
    .split(/\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return raw;
  }

  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const normLabel = normalize(fieldLabel);
  const normKey = normalize(fieldName.replace(/_/g, ' '));
  const labelTokens = normLabel.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const keyTokens = normKey.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

  for (const seg of segments) {
    const normSeg = normalize(seg);
    const colonIdx = seg.indexOf(':');
    const segHeader = colonIdx !== -1 ? normalize(seg.slice(0, colonIdx)) : normSeg;

    if (
      (labelTokens.length > 0 && labelTokens.some((tok) => segHeader.includes(tok))) ||
      (keyTokens.length > 0 && keyTokens.some((tok) => segHeader.includes(tok)))
    ) {
      return colonIdx !== -1 ? seg.slice(colonIdx + 1).trim() : seg;
    }
  }

  return raw;
}

export function renderReportWithDynamicTags(
  template: ReportTemplate,
  order: Order
): string {
  const patient = order.patient;
  const vet = order.vet;
  const ageLabel = formatAgeLabel(patient?.age_days, patient?.birth_date);
  const releaseDate = order.released_at
    ? new Date(order.released_at).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');

  const resultsLines = (order.results || [])
    .map((res) => {
      const entries = Object.entries(res.dynamic_content || {});
      const fields = res.input_fields || res.exam?.input_fields || [];
      const refText =
        res.reference_snapshot ||
        res.matched_reference?.reference_text_content ||
        'Referência padrão da espécie conforme literatura clínica.';
      const formattedParams =
        entries.length === 0
          ? '  - [Parâmetros aguardando lançamento técnico]'
          : entries
              .map(([k, v]) => {
                const fieldMeta = fields.find((f) => f.field_name === k);
                const label = fieldMeta?.field_label || k;
                const unit = fieldMeta?.unit ? ` ${fieldMeta.unit}` : '';
                const sideRef = resolveSideBySideReference(k, label, refText);
                return `  • ${label}: ${v}${unit}   |   Ref.: ${sideRef}`;
              })
              .join('\n');
      return `[${res.exam_code || res.exam?.code || 'EXAME'}] ${
        res.exam_name || res.exam?.name || ''
      } (${res.section || res.exam?.section || 'Geral'})\n${formattedParams}`;
    })
    .join('\n\n');

  const referencesLines = (order.results || [])
    .map(
      (res) =>
        `• ${res.exam_name || res.exam?.name || 'Exame'}: ${
          res.reference_snapshot ||
          res.matched_reference?.reference_text_content ||
          'Referência padrão da espécie conforme literatura clínica.'
        }`
    )
    .join('\n');

  const replacements: Record<string, string> = {
    '{{logo}}': '[VETLIFE DIAGNÓSTICOS VETERINÁRIOS]',
    '{{paciente}}': patient?.name || 'N/D',
    '{{especie}}': `${patient?.species || 'N/D'} (${patient?.breed || 'SRD'}, ${patient?.gender || 'M'})`,
    '{{idade}}': ageLabel,
    '{{tutor}}': patient?.tutor_name || 'N/D',
    '{{veterinario}}': vet?.name || 'N/D',
    '{{crmv}}': vet?.crmv || 'N/D',
    '{{protocolo}}': order.protocol_code,
    '{{data_liberacao}}': releaseDate,
    '{{resultados}}': resultsLines,
    '{{referencias}}': referencesLines,
  };

  let content = `${template.header_html}\n${'='.repeat(72)}\n\n${template.body_template}\n\n${'-'.repeat(72)}\n${template.footer_html}`;
  Object.entries(replacements).forEach(([tag, value]) => {
    content = content.split(tag).join(value);
  });
  return content;
}

export function renderReportHtmlWithDynamicTags(
  template: ReportTemplate,
  order: Order
): string {
  const patient = order.patient;
  const vet = order.vet;
  const ageLabel = formatAgeLabel(patient?.age_days, patient?.birth_date);
  const releaseDate = order.released_at
    ? new Date(order.released_at).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');

  const escapeHtml = (str: string) =>
    String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const resultsHtml = (order.results || [])
    .map((res) => {
      const entries = Object.entries(res.dynamic_content || {});
      const fields = res.input_fields || res.exam?.input_fields || [];
      const refText =
        res.reference_snapshot ||
        res.matched_reference?.reference_text_content ||
        'Referência padrão da espécie.';
      const rows =
        entries.length === 0
          ? '<tr><td colspan="3" style="padding:8px 10px;color:#64748b;font-style:italic;">Parâmetros aguardando lançamento técnico</td></tr>'
          : entries
              .map(([k, v]) => {
                const fieldMeta = fields.find((f) => f.field_name === k);
                const rawLabel = fieldMeta?.field_label || k;
                const label = escapeHtml(rawLabel);
                const unit = fieldMeta?.unit ? ` ${escapeHtml(fieldMeta.unit)}` : '';
                const sideRef = escapeHtml(resolveSideBySideReference(k, rawLabel, refText));
                return `<tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:7px 10px;font-weight:600;color:#0f172a;">${label}</td>
                  <td style="padding:7px 10px;font-weight:700;color:#0f766e;font-family:monospace;">${escapeHtml(String(v))}${unit}</td>
                  <td style="padding:7px 10px;color:#475569;font-size:11.5px;">${sideRef}</td>
                </tr>`;
              })
              .join('');
      return `<div style="margin-bottom:14px;background:#ffffff;border-radius:10px;border:1px solid #e2e8f0;overflow:hidden;">
        <div style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0b2240;font-size:12.5px;display:flex;justify-content:space-between;align-items:center;">
          <span>[${escapeHtml(res.exam_code || res.exam?.code || 'EXAME')}] ${escapeHtml(res.exam_name || res.exam?.name || '')}</span>
          <span style="font-weight:500;color:#64748b;font-size:11px;">${escapeHtml(res.section || res.exam?.section || 'Geral')}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead>
            <tr style="background:#fcfcfd;text-align:left;color:#64748b;font-size:10.5px;text-transform:uppercase;border-bottom:1px solid #e2e8f0;">
              <th style="padding:6px 10px;width:36%;">Parâmetro Analisado</th>
              <th style="padding:6px 10px;width:28%;">Resultado Obtido</th>
              <th style="padding:6px 10px;width:36%;">Valores de Referência (${escapeHtml(patient?.species || 'Espécie')})</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    })
    .join('');

  const referencesHtml = (order.results || [])
    .map((res) => {
      const rawRef =
        res.reference_snapshot ||
        res.matched_reference?.reference_text_content ||
        'Referência padrão da espécie conforme literatura clínica.';
      const isHtmlRef = /<[a-z][\s\S]*>/i.test(rawRef);
      const formattedRef = isHtmlRef ? rawRef : escapeHtml(rawRef);
      return `<div style="margin-bottom:6px;"><div>• <strong>${escapeHtml(
        res.exam_name || res.exam?.name || 'Exame'
      )}:</strong></div><div style="margin-left:12px;">${formattedRef}</div></div>`;
    })
    .join('');

  const firstExamName =
    order.results?.[0]?.exam_name || order.results?.[0]?.exam?.name || 'Exame Laboratorial';
  const firstExamSection =
    order.results?.[0]?.section || order.results?.[0]?.exam?.section || 'Geral';
  const logoHtml = `<img src="/images/vetlife-logo.jpg" alt="VetLife" style="height:42px;width:auto;object-fit:contain;border-radius:8px;vertical-align:middle;" />`;
  const hasLogoInHeader = (template.header_html || '').includes('{{logo}}') || (template.header_html || '').includes('<img');
  const cleanHeaderHtml = hasLogoInHeader
    ? template.header_html || ''
    : `<div style="display:flex;align-items:center;gap:12px;">${logoHtml}<div style="flex:1;">${template.header_html || ''}</div></div>`;

  const replacements: Record<string, string> = {
    '{{logo}}': logoHtml,
    '{{paciente}}': escapeHtml(patient?.name || 'N/D'),
    '{{especie}}': escapeHtml(
      `${patient?.species || 'N/D'} (${patient?.breed || 'SRD'}, ${patient?.gender || 'M'})`
    ),
    '{{raca}}': escapeHtml(patient?.breed || 'SRD'),
    '{{sexo}}': escapeHtml(
      patient?.gender === 'F' ? 'Fêmea' : patient?.gender === 'M' ? 'Macho' : patient?.gender || 'N/D'
    ),
    '{{idade}}': escapeHtml(ageLabel),
    '{{tutor}}': escapeHtml(patient?.tutor_name || 'N/D'),
    '{{veterinario}}': escapeHtml(vet?.name || 'N/D'),
    '{{crmv}}': escapeHtml(vet?.crmv || 'N/D'),
    '{{clinica}}': escapeHtml(vet?.clinic_name || 'Particular / Atendimento Direto'),
    '{{protocolo}}': escapeHtml(order.protocol_code),
    '{{data_liberacao}}': escapeHtml(releaseDate),
    '{{exame}}': escapeHtml(firstExamName),
    '{{secao}}': escapeHtml(firstExamSection),
    '{{resultados}}': resultsHtml,
    '{{referencias}}': referencesHtml,
  };

  let html = `<div style="font-family:Inter,system-ui,sans-serif;color:#0f172a;line-height:1.5;">
    <div>${cleanHeaderHtml}</div>
    <div style="margin:14px 0;">${template.body_template || ''}</div>
    <div>${template.footer_html || ''}</div>
  </div>`;

  Object.entries(replacements).forEach(([tag, value]) => {
    html = html.split(tag).join(value);
  });
  return html;
}

function clearAuthStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.VET);
  } catch {
    // ignore storage errors
  }
}

function decodeTokenPayload(token: string): { exp?: number; role?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isTokenValidAndActive(token: string | null): boolean {
  if (!token || !token.trim()) return false;
  const payload = decodeTokenPayload(token.trim());
  if (!payload) return false;
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    return false;
  }
  return true;
}

function extractErrorMessage(errBody: any, fallback: string, status?: number): string {
  const clean = (val: unknown): string | null => {
    if (typeof val !== 'string') return null;
    const trimmed = val.trim();
    if (!trimmed || trimmed === '[object Object]') return null;
    return trimmed;
  };

  if (errBody && typeof errBody === 'object') {
    const directMsg = clean(errBody.message);
    if (directMsg) return directMsg;

    const directErr = clean(errBody.error);
    if (directErr) return directErr;

    if (errBody.error && typeof errBody.error === 'object') {
      const nestedMsg = clean(errBody.error.message);
      const firstDetail = Array.isArray(errBody.error.details) ? errBody.error.details[0] : null;
      const detailText =
        firstDetail && typeof firstDetail === 'object' && clean(firstDetail.message)
          ? firstDetail.field
            ? `${firstDetail.field}: ${firstDetail.message}`
            : String(firstDetail.message)
          : null;

      if (nestedMsg && detailText && !nestedMsg.includes(detailText)) {
        return `${nestedMsg} (${detailText})`;
      }
      if (nestedMsg) return nestedMsg;
      if (detailText) return detailText;
    }
  }

  switch (status) {
    case 400:
      return 'Dados inválidos na solicitação. Verifique os campos preenchidos.';
    case 401:
      return 'Sessão expirada ou credenciais inválidas. Faça login novamente.';
    case 403:
      return 'Acesso negado. Você não tem permissão para realizar esta ação.';
    case 404:
      return 'Registro ou recurso não encontrado no servidor.';
    case 409:
      return 'Conflito de dados: já existe um registro com estas informações.';
    case 500:
    case 502:
    case 503:
      return 'Erro interno no servidor. Tente novamente em instantes.';
    default:
      return fallback;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.'
    );
  }

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearAuthStorage();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vetlife:unauthorized'));
      }
    }
    const errBody = await response.json().catch(() => ({}));
    throw new Error(
      extractErrorMessage(
        errBody,
        'Não foi possível concluir sua solicitação. Tente novamente em instantes.',
        response.status
      )
    );
  }

  const json = await response.json();
  if (json && typeof json === 'object' && 'data' in json && json.data !== undefined) {
    return json.data as T;
  }
  return json as T;
}

export function parseTubeTypeToLabelTemplates(
  tubeTypeRaw?: string,
  totalQty?: number
): ExamLabelTemplate[] {
  const cleanRaw = (tubeTypeRaw || '').trim();
  if (!cleanRaw) {
    return [{ tube_type: 'Tubo EDTA (Tampa Roxa)', label_qty: Math.max(1, Number(totalQty) || 1), display_order: 1 }];
  }
  const parts = cleanRaw
    .split(/\s+\+\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    const single = parts[0] || 'Tubo EDTA (Tampa Roxa)';
    const capitalized = single.charAt(0).toUpperCase() + single.slice(1);
    return [{ tube_type: capitalized, label_qty: Math.max(1, Number(totalQty) || 1), display_order: 1 }];
  }

  return parts.map((part, idx) => {
    const capitalized = part.charAt(0).toUpperCase() + part.slice(1);
    return {
      tube_type: capitalized,
      label_qty: 1,
      display_order: idx + 1,
    };
  });
}

function normalizeExam(ex: any): Exam {
  const days = Number(ex.delivery_days) || 1;
  const resolvedPrice = Number(ex.price ?? ex.base_price ?? ex.active_price ?? 0);
  const rawTemplates: ExamLabelTemplate[] =
    Array.isArray(ex.label_templates) && ex.label_templates.length > 0
      ? ex.label_templates
          .filter((lt: any) => lt && typeof lt.tube_type === 'string' && lt.tube_type.trim().length > 0)
          .map((lt: any, idx: number) => ({
            id: lt.id,
            exam_id: lt.exam_id || ex.id,
            tube_type: lt.tube_type.trim(),
            label_qty: Math.max(1, Number(lt.label_qty) || 1),
            display_order: Number(lt.display_order) || idx + 1,
          }))
      : parseTubeTypeToLabelTemplates(
          ex.tube_type || ex.material || 'Tubo EDTA (Tampa Roxa)',
          ex.label_qty
        );

  const joinedTubeType = rawTemplates.map((lt) => lt.tube_type).join(' + ');
  const totalLabelQty = rawTemplates.reduce((acc, lt) => acc + (Number(lt.label_qty) || 1), 0);

  return {
    ...ex,
    delivery_days: days,
    delivery_time_label:
      ex.delivery_time_label || (days === 1 ? '1 dia útil' : `${days} dias úteis`),
    tube_type: joinedTubeType || ex.tube_type || ex.material || 'Tubo EDTA (Tampa Roxa)',
    material: joinedTubeType || ex.material || ex.tube_type || 'Tubo EDTA (Tampa Roxa)',
    label_qty: totalLabelQty || Number(ex.label_qty) || 1,
    label_templates: rawTemplates,
    base_price: resolvedPrice,
    price: resolvedPrice,
  };
}

export interface PublishBillingReportPdfPayload {
  status?: 'todos' | 'nao_faturado' | 'aguardando_pagamento' | 'pago' | 'cancelado';
  start_date?: string;
  end_date?: string;
  vet_id?: string;
  patient_id?: string;
}

export interface PublishBillingReportPdfResponse {
  pdf_url: string;
  filename: string;
  storage: 'vercel-blob' | 'local-api';
}

export const api = {
  // ==========================================
  // 1. AUTENTICAÇÃO INTERNA (Admin / Biomédico)
  // ==========================================
  async loginInternal(email: string, password: string): Promise<{ token: string; user: User }> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(
        'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.'
      );
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        extractErrorMessage(
          errBody,
          'E-mail ou senha inválidos. Verifique suas credenciais.',
          res.status
        )
      );
    }
    const json = await res.json();
    const payload = json.data || json;
    const token = payload.token || json.token;
    const user = payload.user || json.user;
    if (!token || !user) {
      throw new Error('Não foi possível iniciar sua sessão. Tente novamente em instantes.');
    }
    clearAuthStorage();
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    return { token, user };
  },

  // ==========================================
  // 2. AUTENTICAÇÃO VETERINÁRIO (E-mail + Senha Obrigatória)
  // ==========================================
  async loginVet(email: string, password: string): Promise<{ token: string; vet: Vet }> {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/auth/vet-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error(
        'Não foi possível conectar ao servidor. Verifique sua conexão com a internet e tente novamente.'
      );
    }
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        extractErrorMessage(
          errBody,
          'Médico Veterinário não localizado ou senha incorreta.',
          res.status
        )
      );
    }
    const json = await res.json();
    const payload = json.data || json;
    const token = payload.token || json.token;
    const vet = payload.vet || json.vet || payload.user;
    if (!token || !vet) {
      throw new Error('Não foi possível iniciar sua sessão. Tente novamente em instantes.');
    }
    clearAuthStorage();
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.VET, JSON.stringify(vet));
    return { token, vet };
  },

  logout(): void {
    clearAuthStorage();
  },

  getToken(): string | null {
    const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
    if (!isTokenValidAndActive(token)) {
      if (token) clearAuthStorage();
      return null;
    }
    return token;
  },

  hasValidSession(scope: 'internal' | 'vet'): boolean {
    const token = this.getToken();
    if (!token) return false;
    const user = this.getCurrentUser();
    const vet = this.getCurrentVet();
    if (scope === 'internal') {
      return Boolean(user && (user.role === 'admin' || user.role === 'biomedical'));
    }
    return Boolean(vet);
  },

  async verifyRemoteSession(): Promise<{ authenticated: boolean; role?: string }> {
    const token = this.getToken();
    if (!token) return { authenticated: false };

    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      clearAuthStorage();
      return { authenticated: false };
    }
    const json = await res.json();
    const authUser = json.user || json.data;
    return { authenticated: Boolean(authUser?.role), role: authUser?.role };
  },

  getCurrentUser(): User | null {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!isTokenValidAndActive(token)) return null;
      const raw = localStorage.getItem(STORAGE_KEYS.USER);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  },

  getCurrentVet(): Vet | null {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
      if (!isTokenValidAndActive(token)) return null;
      const raw = localStorage.getItem(STORAGE_KEYS.VET);
      return raw ? (JSON.parse(raw) as Vet) : null;
    } catch {
      return null;
    }
  },

  // ==========================================
  // 3. CONSULTA PÚBLICA POR PROTOCOLO (RN-02, HU-12)
  // ==========================================
  async getPublicProtocol(protocolCode: string): Promise<Order> {
    const cleanCode = protocolCode.trim().toUpperCase();
    const data = await request<any>(`/public/protocol/${encodeURIComponent(cleanCode)}`);
    const order: Order = data?.order ? { ...data.order, ...data } : data;
    if (!order || !order.protocol_code) {
      throw new Error(`Protocolo "${cleanCode}" não encontrado.`);
    }
    return order;
  },

  // ==========================================
  // 4. SOLICITAÇÃO DE COLETA / AGENDAMENTO (BANCO DE DADOS + FALLBACK RESILIENTE)
  // ==========================================
  async createCollectionRequest(payload: CollectionRequest): Promise<CollectionRequest> {
    try {
      const created = await request<CollectionRequest>('/public/collection-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (created?.id) {
        const store = readLocalCollectionStore();
        store.overrides[created.id] = {
          ...store.overrides[created.id],
          ...(payload.crmv ? { crmv: payload.crmv.trim().toUpperCase() } : {}),
          ...(payload.scheduled_date ? { scheduled_date: payload.scheduled_date } : {}),
          ...(payload.scheduled_time ? { scheduled_time: payload.scheduled_time } : {}),
          ...(payload.status ? { status: payload.status } : {}),
        };
        writeLocalCollectionStore(store);
      }
      return {
        ...created,
        crmv: created?.crmv || payload.crmv?.trim().toUpperCase(),
        scheduled_date: created?.scheduled_date || payload.scheduled_date,
        scheduled_time: created?.scheduled_time || payload.scheduled_time,
        status: created?.status || payload.status || 'pendente',
      };
    } catch {
      const fallbackItem: CollectionRequest = {
        ...payload,
        id: payload.id || `col-${Date.now()}`,
        crmv: (payload.crmv || '').trim().toUpperCase(),
        status: payload.status || (payload.scheduled_date ? 'agendada' : 'pendente'),
        created_at: new Date().toISOString(),
      };
      const store = readLocalCollectionStore();
      store.created = [fallbackItem, ...store.created];
      writeLocalCollectionStore(store);
      return fallbackItem;
    }
  },

  async getCollectionRequests(): Promise<CollectionRequest[]> {
    try {
      const remote = await request<CollectionRequest[]>('/collection-requests');
      const list = Array.isArray(remote) ? remote : [];
      return mergeCollectionsWithLocalStore(list);
    } catch {
      return mergeCollectionsWithLocalStore([]);
    }
  },

  async updateCollectionRequestStatus(
    id: string,
    status: 'pendente' | 'agendada' | 'concluida' | 'cancelada',
    scheduledDate?: string,
    scheduledTime?: string
  ): Promise<CollectionRequest> {
    const patchPayload: Partial<CollectionRequest> = {
      status,
      ...(scheduledDate !== undefined ? { scheduled_date: scheduledDate } : {}),
      ...(scheduledTime !== undefined ? { scheduled_time: scheduledTime } : {}),
    };
    try {
      const updated = await request<CollectionRequest>(`/collection-requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify(patchPayload),
      });
      const store = readLocalCollectionStore();
      store.overrides[id] = { ...(store.overrides[id] || {}), ...patchPayload };
      writeLocalCollectionStore(store);
      return { ...updated, ...patchPayload };
    } catch {
      const store = readLocalCollectionStore();
      store.overrides[id] = { ...(store.overrides[id] || {}), ...patchPayload };
      writeLocalCollectionStore(store);
      const currentList = await this.getCollectionRequests();
      const matched = currentList.find((c) => c.id === id);
      return (
        matched || {
          id,
          clinic_or_tutor_name: 'Solicitação de Coleta',
          crmv: '',
          phone: '',
          email: '',
          address: '',
          notes: '',
          ...patchPayload,
        }
      );
    }
  },

  async updateCollectionRequest(
    id: string,
    payload: Partial<CollectionRequest>
  ): Promise<CollectionRequest> {
    try {
      const updated = await request<CollectionRequest>(`/collection-requests/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const store = readLocalCollectionStore();
      store.overrides[id] = { ...(store.overrides[id] || {}), ...payload };
      writeLocalCollectionStore(store);
      return { ...updated, ...payload };
    } catch {
      const store = readLocalCollectionStore();
      store.overrides[id] = { ...(store.overrides[id] || {}), ...payload };
      writeLocalCollectionStore(store);
      const currentList = await this.getCollectionRequests();
      const matched = currentList.find((c) => c.id === id);
      return (
        matched || {
          id,
          clinic_or_tutor_name: payload.clinic_or_tutor_name || 'Solicitação de Coleta',
          crmv: payload.crmv || '',
          phone: payload.phone || '',
          email: payload.email || '',
          address: payload.address || '',
          notes: payload.notes || '',
          ...payload,
        }
      );
    }
  },

  async deleteCollectionRequest(id: string): Promise<void> {
    const store = readLocalCollectionStore();
    if (!store.deletedIds.includes(id)) {
      store.deletedIds.push(id);
    }
    delete store.overrides[id];
    store.created = store.created.filter((c) => c.id !== id);
    writeLocalCollectionStore(store);
    try {
      await request(`/collection-requests/${id}`, { method: 'DELETE' });
    } catch {
      // handled locally if old server instance does not have DELETE route
    }
  },

  // ==========================================
  // 5. CATÁLOGO DE EXAMES E CAMPOS DINÂMICOS
  // ==========================================
  async getExams(): Promise<Exam[]> {
    const remote = await request<Exam[]>('/exams');
    return Array.isArray(remote) ? remote.map(normalizeExam) : [];
  },

  async getExamsPaginated(params: {
    page: number;
    limit: number;
    search?: string;
    section?: string;
  }): Promise<{
    items: Exam[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const safePage = Number.isFinite(Number(params.page)) && Number(params.page) > 0 ? Math.floor(Number(params.page)) : 1;
    const safeLimit = Number.isFinite(Number(params.limit)) && Number(params.limit) > 0 ? Math.floor(Number(params.limit)) : 12;
    const qs = new URLSearchParams({
      page: String(safePage),
      limit: String(safeLimit),
    });
    if (params.search?.trim()) qs.set('search', params.search.trim());
    if (params.section && params.section !== 'todos') qs.set('section', params.section);

    const remote = await request<any>(`/exams?${qs.toString()}`);

    if (Array.isArray(remote)) {
      const normalized = remote.map(normalizeExam);
      const total = normalized.length;
      const totalPages = Math.max(1, Math.ceil(total / safeLimit));
      const currentPage = Math.min(safePage, totalPages);
      const items = normalized.slice((currentPage - 1) * safeLimit, currentPage * safeLimit);
      return {
        items,
        total,
        page: currentPage,
        limit: safeLimit,
        totalPages,
      };
    }

    const rawItems = Array.isArray(remote?.items)
      ? remote.items
      : Array.isArray(remote?.data)
        ? remote.data
        : [];
    const items = rawItems.map(normalizeExam);
    const total = Number.isFinite(Number(remote?.total)) ? Math.max(0, Number(remote.total)) : items.length;
    const totalPages = Number.isFinite(Number(remote?.totalPages))
      ? Math.max(1, Number(remote.totalPages))
      : Math.max(1, Math.ceil(total / safeLimit));
    const page = Number.isFinite(Number(remote?.page)) ? Math.max(1, Number(remote.page)) : safePage;

    return {
      items,
      total,
      page,
      limit: safeLimit,
      totalPages,
    };
  },

  async saveExam(exam: Partial<Exam>, tablePrices?: Record<string, number>): Promise<Exam> {
    const days = Number(exam.delivery_days) || 1;
    const label =
      exam.delivery_time_label?.trim() || (days === 1 ? '1 dia útil' : `${days} dias úteis`);
    const resolvedPrice = Number(exam.price ?? exam.base_price ?? 80);

    const normalizedTemplates: ExamLabelTemplate[] =
      Array.isArray(exam.label_templates) && exam.label_templates.length > 0
        ? exam.label_templates
            .filter((lt) => lt && typeof lt.tube_type === 'string' && lt.tube_type.trim().length > 0)
            .map((lt, idx) => ({
              tube_type: lt.tube_type.trim(),
              label_qty: Math.max(1, Number(lt.label_qty) || 1),
              display_order: idx + 1,
            }))
        : parseTubeTypeToLabelTemplates(
            exam.tube_type || exam.material || 'Tubo EDTA (Tampa Roxa)',
            exam.label_qty
          );

    const joinedTubeType =
      normalizedTemplates.map((lt) => lt.tube_type).join(' + ') || 'Tubo EDTA (Tampa Roxa)';
    const totalLabelQty =
      normalizedTemplates.reduce((acc, lt) => acc + (Number(lt.label_qty) || 1), 0) || 1;

    const payload: Partial<Exam> = {
      ...exam,
      code: (exam.code || 'EXM-NEW').toUpperCase(),
      delivery_days: days,
      delivery_time_label: label,
      tube_type: joinedTubeType,
      material: joinedTubeType,
      label_qty: totalLabelQty,
      label_templates: normalizedTemplates,
      base_price: resolvedPrice,
      price: resolvedPrice,
    };

    const saved = exam.id
      ? await request<Exam>(`/exams/${exam.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : await request<Exam>('/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

    if (tablePrices && Object.keys(tablePrices).length > 0) {
      const tables = await this.getPriceTables();
      await Promise.all(
        tables
          .filter((pt) => tablePrices[pt.id] !== undefined)
          .map((pt) => {
            const existingPrices = pt.prices || pt.items || [];
            const hasExam = existingPrices.some((p) => p.exam_id === saved.id);
            const nextPrices = hasExam
              ? existingPrices.map((p) =>
                  p.exam_id === saved.id
                    ? { exam_id: p.exam_id, price: Number(tablePrices[pt.id]) }
                    : { exam_id: p.exam_id, price: Number(p.price) }
                )
              : [
                  ...existingPrices.map((p) => ({ exam_id: p.exam_id, price: Number(p.price) })),
                  { exam_id: saved.id, price: Number(tablePrices[pt.id]) },
                ];
            return request<PriceTable>(`/price-tables/${pt.id}`, {
              method: 'PUT',
              body: JSON.stringify({ prices: nextPrices }),
            });
          })
      );
    }

    return normalizeExam(saved);
  },

  async deleteExam(examId: string): Promise<void> {
    await request(`/exams/${examId}`, { method: 'DELETE' });
  },

  async saveExamFields(examId: string, fields: ExamInputField[]): Promise<ExamInputField[]> {
    const res = await request<any>(`/exams/${examId}/fields`, {
      method: 'PUT',
      body: JSON.stringify({ fields }),
    });
    return Array.isArray(res) ? res : res.fields || [];
  },

  // ==========================================
  // 6. TABELAS DE PREÇOS COM VIGÊNCIA (HU-03, RN-04)
  // ==========================================
  async getPriceTables(): Promise<PriceTable[]> {
    const remote = await request<PriceTable[]>('/price-tables');
    if (!Array.isArray(remote)) return [];
    return remote.map((pt) => ({
      ...pt,
      prices: pt.prices || pt.items || [],
    }));
  },

  async savePriceTable(
    table: Partial<PriceTable>,
    adjustmentPercent?: number
  ): Promise<PriceTable> {
    const payload: Record<string, any> = {
      name: table.name,
      partner_clinic: table.partner_clinic,
      start_date: table.start_date,
      end_date: table.end_date,
      is_active: table.is_active ?? true,
      ...(typeof adjustmentPercent === 'number' ? { adjustment_percent: adjustmentPercent } : {}),
    };

    if (table.prices && table.prices.length > 0 && typeof adjustmentPercent !== 'number') {
      payload.prices = table.prices.map((p) => ({
        exam_id: p.exam_id,
        price: Number(p.price),
      }));
    }

    const res = table.id
      ? await request<PriceTable>(`/price-tables/${table.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : await request<PriceTable>('/price-tables', {
          method: 'POST',
          body: JSON.stringify(payload),
        });

    return {
      ...res,
      prices: res.prices || res.items || [],
    };
  },

  // ==========================================
  // 7. VALORES DE REFERÊNCIA E MODELOS DE LAUDOS (HU-04, HU-05)
  // ==========================================
  async getExamReferences(): Promise<ExamReference[]> {
    const remote = await request<ExamReference[]>('/exam-references');
    return Array.isArray(remote) ? remote : [];
  },

  async saveExamReference(ref: Partial<ExamReference>): Promise<ExamReference> {
    if (ref.id) {
      return request<ExamReference>(`/exam-references/${ref.id}`, {
        method: 'PUT',
        body: JSON.stringify(ref),
      });
    }
    return request<ExamReference>('/exam-references', {
      method: 'POST',
      body: JSON.stringify(ref),
    });
  },

  async deleteExamReference(id: string): Promise<void> {
    await request(`/exam-references/${id}`, { method: 'DELETE' });
  },

  async getReportTemplates(): Promise<ReportTemplate[]> {
    const remote = await request<ReportTemplate[]>('/report-templates');
    return Array.isArray(remote) ? remote : [];
  },

  async saveReportTemplate(tpl: Partial<ReportTemplate>): Promise<ReportTemplate> {
    if (tpl.id) {
      return request<ReportTemplate>(`/report-templates/${tpl.id}`, {
        method: 'PUT',
        body: JSON.stringify(tpl),
      });
    }
    return request<ReportTemplate>('/report-templates', {
      method: 'POST',
      body: JSON.stringify(tpl),
    });
  },

  // ==========================================
  // 8. PACIENTES, VETERINÁRIOS, USUÁRIOS E ATENDIMENTOS
  // ==========================================
  async getPatients(): Promise<Patient[]> {
    const remote = await request<Patient[]>('/patients');
    return Array.isArray(remote) ? remote : [];
  },

  async savePatient(patient: Partial<Patient>): Promise<Patient> {
    const ageDays = calculatePatientAgeDays(patient.birth_date, patient.age_days);
    const payload: Partial<Patient> = {
      ...patient,
      name: patient.name?.trim() || 'Paciente',
      species: patient.species || 'Canino',
      breed: patient.breed?.trim() || 'SRD',
      gender: patient.gender === 'F' ? 'F' : 'M',
      age_days: ageDays,
      tutor_name: patient.tutor_name?.trim() || 'Tutor Responsável',
      tutor_phone: patient.tutor_phone?.trim() || '',
      tutor_email: patient.tutor_email?.trim() || '',
    };

    if (patient.id) {
      return request<Patient>(`/patients/${patient.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    }
    return request<Patient>('/patients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async deletePatient(patientId: string): Promise<void> {
    await request(`/patients/${patientId}`, { method: 'DELETE' });
  },

  async getVets(): Promise<Vet[]> {
    const remote = await request<Vet[]>('/vets');
    return Array.isArray(remote) ? remote : [];
  },

  async createVet(payload: Omit<Vet, 'id' | 'created_at'> & { password?: string }): Promise<Vet> {
    return request<Vet>('/vets', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateVet(id: string, payload: Partial<Vet> & { password?: string }): Promise<Vet> {
    return request<Vet>(`/vets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteVet(id: string): Promise<void> {
    await request(`/vets/${id}`, { method: 'DELETE' });
  },

  async getUsers(): Promise<User[]> {
    const remote = await request<User[]>('/users');
    return Array.isArray(remote) ? remote : [];
  },

  async createUser(payload: {
    name: string;
    email: string;
    role: 'admin' | 'biomedical';
    password: string;
  }): Promise<User> {
    return request<User>('/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateUser(
    id: string,
    payload: Partial<{
      name: string;
      email: string;
      role: 'admin' | 'biomedical';
      password: string;
    }>
  ): Promise<User> {
    return request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteUser(id: string): Promise<void> {
    await request(`/users/${id}`, { method: 'DELETE' });
  },

  async getOrders(): Promise<Order[]> {
    const remote = await request<Order[]>('/orders');
    return Array.isArray(remote) ? remote : [];
  },

  async getVetOrders(_vetId?: string): Promise<Order[]> {
    const remote = await request<Order[]>('/vet/orders');
    return Array.isArray(remote) ? remote : [];
  },

  async getVetCollections(): Promise<CollectionRequest[]> {
    const remote = await request<CollectionRequest[]>('/vet/collections');
    return Array.isArray(remote) ? remote : [];
  },

  async getVetCatalog(): Promise<{
    price_table_name: string;
    start_date: string | null;
    end_date: string | null;
    exams: Exam[];
  }> {
    const remote = await request<any>('/vet/catalog');
    const rawExams = Array.isArray(remote?.exams) ? remote.exams : Array.isArray(remote) ? remote : [];
    return {
      price_table_name: remote?.price_table_name || 'Tabela Vigente',
      start_date: remote?.start_date || null,
      end_date: remote?.end_date || null,
      exams: rawExams.map(normalizeExam),
    };
  },

  async getVetInvoices(): Promise<Invoice[]> {
    const remote = await request<Invoice[]>('/vet/invoices');
    return Array.isArray(remote) ? remote : [];
  },

  // ==========================================
  // 8.1 FATURAMENTO / LOTES DE BOLETOS (ADMIN)
  // ==========================================
  async getInvoices(params?: { vet_id?: string; status?: string }): Promise<Invoice[]> {
    const qs = new URLSearchParams();
    if (params?.vet_id) qs.set('vet_id', params.vet_id);
    if (params?.status) qs.set('status', params.status);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const remote = await request<Invoice[]>(`/invoices${suffix}`);
    return Array.isArray(remote) ? remote : [];
  },

  async createInvoice(payload: {
    vet_id: string;
    order_ids: string[];
    reference_month?: string;
    period_start?: string;
    period_end?: string;
    due_date?: string;
    boleto_filename?: string;
    boleto_pdf_base64?: string;
    notes?: string;
  }): Promise<Invoice> {
    return request<Invoice>('/invoices', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async updateInvoiceBoleto(
    invoiceId: string,
    payload: { boleto_filename: string; boleto_pdf_base64: string }
  ): Promise<Invoice> {
    return request<Invoice>(`/invoices/${invoiceId}/boleto`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  async markInvoiceAsPaid(invoiceId: string, paidAt?: string): Promise<Invoice> {
    return request<Invoice>(`/invoices/${invoiceId}/pay`, {
      method: 'PATCH',
      body: JSON.stringify({ paid_at: paidAt }),
    });
  },

  async cancelInvoice(invoiceId: string): Promise<Invoice> {
    return request<Invoice>(`/invoices/${invoiceId}/cancel`, {
      method: 'PATCH',
      body: JSON.stringify({}),
    });
  },

  async publishBillingReportPdf(
    payload: PublishBillingReportPdfPayload
  ): Promise<PublishBillingReportPdfResponse> {
    return request<PublishBillingReportPdfResponse>('/billing/report/publish-pdf', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async createOrder(payload: {
    patient: Omit<Patient, 'id'> & { id?: string };
    vet_id: string;
    price_table_id: string;
    exam_ids: string[];
    order_date: string;
    notes?: string;
  }): Promise<Order> {
    return request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({
        patient: payload.patient,
        ...(payload.patient.id ? { patient_id: payload.patient.id } : {}),
        vet_id: payload.vet_id,
        price_table_id: payload.price_table_id,
        exam_ids: payload.exam_ids,
        order_date: payload.order_date,
        notes: payload.notes,
      }),
    });
  },

  async updateOrder(
    orderId: string,
    payload: {
      patient_id?: string;
      patient?: Omit<Patient, 'id'> | Patient;
      vet_id: string;
      price_table_id: string;
      exam_ids: string[];
      order_date?: string;
      notes?: string;
    }
  ): Promise<Order> {
    return request<Order>(`/orders/${orderId}`, {
      method: 'PUT',
      body: JSON.stringify({
        patient_id: payload.patient_id,
        vet_id: payload.vet_id,
        price_table_id: payload.price_table_id,
        exam_ids: payload.exam_ids,
        order_date: payload.order_date,
        notes: payload.notes,
      }),
    });
  },

  async getOrderLabels(order: Order): Promise<CollectionLabel[]> {
    const remote = await request<any>(`/orders/${order.id}/labels`);
    const list = Array.isArray(remote) ? remote : remote?.labels || [];
    return list.map((lbl: any) => ({
      ...lbl,
      barcode: lbl.barcode || lbl.barcode_value || '',
    }));
  },

  async saveExamResult(
    orderId: string,
    resultId: string,
    payload: {
      dynamic_content: Record<string, any>;
      attachments?: ExamAttachment[];
      reference_snapshot?: string;
      notes?: string;
    }
  ): Promise<Order> {
    return request<Order>(`/orders/${orderId}/results/${resultId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async releaseOrderReport(orderId: string, templateId?: string, resultId?: string): Promise<Order> {
    return request<Order>(`/orders/${orderId}/release`, {
      method: 'POST',
      body: JSON.stringify({ template_id: templateId, result_id: resultId }),
    });
  },

  async publishOrderPdf(order: Order): Promise<{
    pdf_url: string;
    exam_pdfs: Array<{ result_id: string; pdf_url: string }>;
  }> {
    return request<{
      pdf_url: string;
      exam_pdfs: Array<{ result_id: string; pdf_url: string }>;
    }>(`/orders/${order.id}/publish-pdf`, {
      method: 'POST',
      body: JSON.stringify({ order_snapshot: order }),
    });
  },

  // ==========================================
  // 9. DASHBOARDS OPERACIONAL E FINANCEIRO (100% BANCO DE DADOS)
  // ==========================================
  async getOperationalDashboard(): Promise<OperationalStats> {
    const remote = await request<any>('/dashboard/operational');
    const summary = remote?.summary || {};
    return {
      today_orders: Number(summary.orders_today ?? summary.total_orders ?? 0),
      total_orders: Number(summary.total_orders ?? 0),
      pending_orders: Number(summary.pending_orders ?? 0),
      in_analysis_orders: Number(summary.in_analysis_orders ?? 0),
      completed_orders: Number(summary.completed_orders ?? 0),
      pending_collections: Number(summary.pending_collections ?? 0),
      section_breakdown: Array.isArray(remote?.exams_by_section) ? remote.exams_by_section : [],
      recent_orders: Array.isArray(remote?.recent_orders) ? remote.recent_orders : [],
    };
  },

  async getFinancialDashboard(): Promise<FinancialStats> {
    const remote = await request<any>('/dashboard/financial');
    const ind = remote?.indicators || {};
    const bs = remote?.balance_sheet || {};
    const gross = Number(ind.gross_revenue ?? bs.total_credits ?? 0);
    const costs = Number(bs.total_debits ?? 0);
    const net = Number(bs.net_balance ?? gross - costs);
    const margin = Number(bs.operating_margin_percent ?? 0);

    return {
      total_revenue: gross,
      monthly_revenue: gross,
      average_ticket: Number(ind.average_ticket ?? 0),
      operational_costs: costs,
      net_margin: net,
      margin_percent: margin,
      revenue_by_table: Array.isArray(remote?.revenue_by_price_table)
        ? remote.revenue_by_price_table.map((row: any) => ({
            table_name: row.table_name || 'Tabela Padrão',
            partner: row.partner || 'Atendimento Laboratorial',
            count: Number(row.orders_count ?? row.count ?? 0),
            total: Number(row.total_revenue ?? row.total ?? 0),
          }))
        : [],
      top_exams: Array.isArray(remote?.revenue_by_exam)
        ? remote.revenue_by_exam.map((row: any) => ({
            exam_code: row.exam_code || 'EXM',
            exam_name: row.exam_name || 'Exame',
            count: Number(row.quantity ?? row.count ?? 0),
            revenue: Number(row.revenue ?? 0),
          }))
        : [],
      ledger_entries: Array.isArray(bs.entries)
        ? bs.entries.map((entry: any, idx: number) => ({
            id: `ldg-${idx + 1}`,
            date: new Date().toISOString().slice(0, 10),
            description: entry.category || 'Lançamento',
            type: entry.type === 'credit' ? 'entrada' : 'saida',
            category: bs.period || 'Operacional',
            amount: Number(entry.amount ?? 0),
          }))
        : [],
    };
  },
};
