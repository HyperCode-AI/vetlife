import {
  User,
  Vet,
  Exam,
  ExamInputField,
  PriceTable,
  ExamReference,
  ReportTemplate,
  Patient,
  Order,
  CollectionLabel,
  CollectionRequest,
  OperationalStats,
  FinancialStats,
  ExamAttachment,
} from '../types';
import {
  SEED_USERS,
  SEED_VETS,
  SEED_EXAMS,
  SEED_PRICE_TABLES,
  SEED_EXAM_REFERENCES,
  SEED_REPORT_TEMPLATES,
  SEED_PATIENTS,
  SEED_ORDERS,
  SEED_COLLECTION_REQUESTS,
} from './mockData';

const API_BASE = (import.meta as any).env?.VITE_API_URL || '/api/v1';

const STORAGE_KEYS = {
  TOKEN: 'vetlife_token',
  USER: 'vetlife_user',
  VET: 'vetlife_vet',
  EXAMS: 'vetlife_store_exams_v2026',
  PRICE_TABLES: 'vetlife_store_price_tables_v2026',
  REFERENCES: 'vetlife_store_references',
  TEMPLATES: 'vetlife_store_templates',
  PATIENTS: 'vetlife_store_patients',
  VETS: 'vetlife_store_vets',
  USERS: 'vetlife_store_users',
  ORDERS: 'vetlife_store_orders',
  COLLECTIONS: 'vetlife_store_collections',
};

function loadStore<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveStore<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
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
      const fields = res.input_fields || [];
      const formattedParams =
        entries.length === 0
          ? '  - [Parâmetros aguardando lançamento técnico]'
          : entries
            .map(([k, v]) => {
              const fieldMeta = fields.find((f) => f.field_name === k);
              const label = fieldMeta?.field_label || k;
              const unit = fieldMeta?.unit ? ` ${fieldMeta.unit}` : '';
              return `  • ${label}: ${v}${unit}`;
            })
            .join('\n');
      return `[${res.exam_code || 'EXAME'}] ${res.exam_name || ''} (${res.section || 'Geral'})\n${formattedParams}`;
    })
    .join('\n\n');

  const referencesLines = (order.results || [])
    .map(
      (res) =>
        `• ${res.exam_name}: ${res.reference_snapshot ||
        res.matched_reference?.reference_text_content ||
        'Referência padrão da espécie conforme literatura clínica.'
        }`
    )
    .join('\n');

  const replacements: Record<string, string> = {
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
      const fields = res.input_fields || [];
      const rows =
        entries.length === 0
          ? '<li style="color:#64748b;font-style:italic;">Parâmetros aguardando lançamento técnico</li>'
          : entries
            .map(([k, v]) => {
              const fieldMeta = fields.find((f) => f.field_name === k);
              const label = escapeHtml(fieldMeta?.field_label || k);
              const unit = fieldMeta?.unit ? ` ${escapeHtml(fieldMeta.unit)}` : '';
              return `<li><strong>${label}:</strong> ${escapeHtml(String(v))}${unit}</li>`;
            })
            .join('');
      return `<div style="margin-bottom:10px;padding:8px 10px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;"><div style="font-weight:700;color:#0b2240;font-size:12px;">[${escapeHtml(
        res.exam_code || 'EXAME'
      )}] ${escapeHtml(res.exam_name || '')} <span style="font-weight:400;color:#64748b;">(${escapeHtml(
        res.section || 'Geral'
      )})</span></div><ul style="margin:4px 0 0 16px;padding:0;font-size:12px;color:#1e293b;">${rows}</ul></div>`;
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
        res.exam_name || ''
      )}:</strong></div><div style="margin-left:12px;">${formattedRef}</div></div>`;
    })
    .join('');

  const firstExamName = order.results?.[0]?.exam_name || 'Exame Laboratorial';
  const firstExamSection = order.results?.[0]?.section || 'Geral';
  const replacements: Record<string, string> = {
    '{{paciente}}': escapeHtml(patient?.name || 'N/D'),
    '{{especie}}': escapeHtml(
      `${patient?.species || 'N/D'} (${patient?.breed || 'SRD'}, ${patient?.gender || 'M'})`
    ),
    '{{raca}}': escapeHtml(patient?.breed || 'SRD'),
    '{{sexo}}': escapeHtml(patient?.gender === 'F' ? 'Fêmea' : patient?.gender === 'M' ? 'Macho' : patient?.gender || 'N/D'),
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
    <div>${template.header_html || ''}</div>
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
    if (token.startsWith('local-')) {
      const raw = token.slice('local-'.length);
      return JSON.parse(atob(raw));
    }
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && token) {
      clearAuthStorage();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('vetlife:unauthorized'));
      }
    }
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.message || errBody.error || `HTTP ${response.status}`);
  }

  const json = await response.json();
  if (json && typeof json === 'object' && 'data' in json && json.data !== undefined) {
    return json.data as T;
  }
  return json as T;
}

export const api = {
  // ==========================================
  // 1. AUTENTICAÇÃO INTERNA (Admin / Biomédico)
  // ==========================================
  async loginInternal(email: string, password: string): Promise<{ token: string; user: User }> {
    let networkFailed = false;
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.message || errBody.error || 'E-mail ou senha inválidos. Verifique suas credenciais.'
        );
      }
      const json = await res.json();
      const payload = json.data || json;
      const token = payload.token || json.token;
      const user = payload.user || json.user;
      if (!token || !user) {
        throw new Error('Resposta de autenticação inválida do servidor.');
      }
      clearAuthStorage();
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
      return { token, user };
    } catch (err: any) {
      if (err instanceof TypeError) {
        networkFailed = true;
      } else {
        throw err;
      }
    }

    if (!networkFailed) {
      throw new Error('Falha na autenticação.');
    }

    // Fallback offline apenas quando o servidor está inacessível (preview estático), validando senha estritamente
    const normalizedEmail = email.trim().toLowerCase();
    const matched = SEED_USERS.find((u) => u.email.toLowerCase() === normalizedEmail);
    const trimmedPassword = password.trim();
    const validAdminPasswords = ['admin123', 'Admin@2026', 'VetLife@2026'];
    const validBioPasswords = ['bio123', 'biomed123', 'Bio@2026', 'VetLife@2026'];
    const isPasswordValid = matched
      ? matched.role === 'admin'
        ? validAdminPasswords.includes(trimmedPassword)
        : validBioPasswords.includes(trimmedPassword)
      : false;

    if (!matched || !isPasswordValid) {
      throw new Error('E-mail ou senha inválidos. Verifique suas credenciais corporativas.');
    }

    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const token = `local-${btoa(JSON.stringify({ sub: matched.id, role: matched.role, exp }))}`;
    clearAuthStorage();
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(matched));
    return { token, user: matched };
  },

  // ==========================================
  // 2. AUTENTICAÇÃO VETERINÁRIO (E-mail + Senha)
  // ==========================================
  async loginVet(email: string, credential: string): Promise<{ token: string; vet: Vet }> {
    let networkFailed = false;
    try {
      const res = await fetch(`${API_BASE}/auth/vet-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: credential, crmv: credential }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.message || errBody.error || 'Médico Veterinário não localizado ou senha incorreta.'
        );
      }
      const json = await res.json();
      const payload = json.data || json;
      const token = payload.token || json.token;
      const vet = payload.vet || json.vet || payload.user;
      if (!token || !vet) {
        throw new Error('Resposta de autenticação inválida do servidor.');
      }
      clearAuthStorage();
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      localStorage.setItem(STORAGE_KEYS.VET, JSON.stringify(vet));
      return { token, vet };
    } catch (err: any) {
      if (err instanceof TypeError) {
        networkFailed = true;
      } else {
        throw err;
      }
    }

    if (!networkFailed) {
      throw new Error('Falha na autenticação do veterinário.');
    }

    const vets = loadStore<Array<Vet & { password_hash?: string }>>(STORAGE_KEYS.VETS, SEED_VETS);
    const cleanEmail = email.trim().toLowerCase();
    const secret = credential.trim();
    const cleanCrmv = secret.toLowerCase().replace(/[^a-z0-9]/g, '');

    const matched = vets.find((v) => {
      if (v.email.toLowerCase() !== cleanEmail) return false;
      if (v.password_hash) {
        return v.password_hash === secret || (v.crmv && v.crmv.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanCrmv);
      }
      return (
        (v.crmv && v.crmv.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanCrmv) ||
        ['vet123', 'Vet@2026', 'VetLife@2026'].includes(secret)
      );
    });

    if (!matched) {
      throw new Error('Médico Veterinário não localizado com este E-mail e CRMV.');
    }

    const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const token = `local-${btoa(JSON.stringify({ sub: matched.id, role: 'vet', exp }))}`;
    clearAuthStorage();
    localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.VET, JSON.stringify(matched));
    return { token, vet: matched };
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

    try {
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
    } catch {
      // Se backend offline, valida token local não expirado
      const payload = decodeTokenPayload(token);
      return { authenticated: Boolean(payload?.role), role: payload?.role };
    }
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
    try {
      const data = await request<any>(`/public/protocol/${encodeURIComponent(cleanCode)}`);
      if (data) {
        const order: Order = data.order ? { ...data.order, ...data } : data;
        if (order.protocol_code) return order;
      }
    } catch {
      // Fallback local
    }

    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const found = orders.find((o) => o.protocol_code.toUpperCase() === cleanCode);
    if (!found) {
      throw new Error(
        `Protocolo "${cleanCode}" não encontrado. Experimente VET-2026-0001, VET-2026-0002 ou VET-2026-0003.`
      );
    }
    const templates = loadStore<ReportTemplate[]>(STORAGE_KEYS.TEMPLATES, SEED_REPORT_TEMPLATES);
    const tpl = found.template || templates.find((t) => t.is_default) || templates[0];
    return {
      ...found,
      template: tpl,
      rendered_report: renderReportWithDynamicTags(tpl, found),
    };
  },

  // ==========================================
  // 4. SOLICITAÇÃO DE COLETA (LANDING PAGE)
  // ==========================================
  async createCollectionRequest(payload: CollectionRequest): Promise<CollectionRequest> {
    try {
      const created = await request<CollectionRequest>('/public/collection-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const list = loadStore<CollectionRequest[]>(STORAGE_KEYS.COLLECTIONS, SEED_COLLECTION_REQUESTS);
      saveStore(STORAGE_KEYS.COLLECTIONS, [
        created,
        ...list.filter((c) => c.id !== created.id),
      ]);
      return created;
    } catch {
      const list = loadStore<CollectionRequest[]>(STORAGE_KEYS.COLLECTIONS, SEED_COLLECTION_REQUESTS);
      const created: CollectionRequest = {
        ...payload,
        id: `col-${Date.now()}`,
        status: 'pendente',
        created_at: new Date().toISOString(),
      };
      list.unshift(created);
      saveStore(STORAGE_KEYS.COLLECTIONS, list);
      return created;
    }
  },

  async getCollectionRequests(): Promise<CollectionRequest[]> {
    const local = loadStore<CollectionRequest[]>(STORAGE_KEYS.COLLECTIONS, SEED_COLLECTION_REQUESTS);
    try {
      const remote = await request<CollectionRequest[]>('/collection-requests');
      if (Array.isArray(remote) && remote.length > 0) {
        const remoteIds = new Set(remote.map((r) => r.id));
        const localOnly = local.filter((l) => l.id && !remoteIds.has(l.id) && l.id.startsWith('col-17'));
        const merged = [...localOnly, ...remote];
        saveStore(STORAGE_KEYS.COLLECTIONS, merged);
        return merged;
      }
    } catch {
      // fallback
    }
    return local;
  },

  async updateCollectionRequestStatus(
    id: string,
    status: 'pendente' | 'agendada' | 'concluida' | 'cancelada',
    scheduledDate?: string,
    scheduledTime?: string,
  ): Promise<CollectionRequest> {
    const local = loadStore<CollectionRequest[]>(STORAGE_KEYS.COLLECTIONS, SEED_COLLECTION_REQUESTS);
    let localUpdated: CollectionRequest | null = null;
    const nextLocal = local.map((item) => {
      if (item.id === id) {
        localUpdated = {
          ...item,
          status,
          ...(scheduledDate !== undefined ? { scheduled_date: scheduledDate } : {}),
          ...(scheduledTime !== undefined ? { scheduled_time: scheduledTime } : {}),
        };
        return localUpdated;
      }
      return item;
    });
    saveStore(STORAGE_KEYS.COLLECTIONS, nextLocal);

    try {
      const remote = await request<CollectionRequest>(`/collection-requests/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          ...(scheduledDate !== undefined ? { scheduled_date: scheduledDate } : {}),
          ...(scheduledTime !== undefined ? { scheduled_time: scheduledTime } : {}),
        }),
      });
      return remote;
    } catch {
      if (!localUpdated) throw new Error('Solicitação de coleta não encontrada.');
      return localUpdated;
    }
  },

  // ==========================================
  // 5. CATÁLOGO DE EXAMES E CAMPOS DINÂMICOS
  // ==========================================
  async getExams(): Promise<Exam[]> {
    const localExams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);
    const normalizeExam = (ex: any): Exam => {
      const days = Number(ex.delivery_days) || 1;
      const resolvedPrice = Number(ex.price ?? ex.base_price ?? 75);
      return {
        ...ex,
        delivery_days: days,
        delivery_time_label:
          ex.delivery_time_label || (days === 1 ? '1 dia útil' : `${days} dias úteis`),
        tube_type: ex.tube_type || ex.material || 'Tubo EDTA (Tampa Roxa)',
        material: ex.material || ex.tube_type || 'Tubo EDTA (Tampa Roxa)',
        label_qty: Number(ex.label_qty) || 1,
        base_price: resolvedPrice,
        price: resolvedPrice,
      };
    };

    try {
      const remote = await request<Exam[]>('/exams');
      if (Array.isArray(remote) && remote.length > 0) {
        const normalized = remote.map(normalizeExam);
        saveStore(STORAGE_KEYS.EXAMS, normalized);
        return normalized;
      }
    } catch {
      // use local
    }
    return localExams.map(normalizeExam);
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
    const qs = new URLSearchParams({
      page: String(params.page),
      limit: String(params.limit),
    });
    if (params.search?.trim()) qs.set('search', params.search.trim());
    if (params.section && params.section !== 'todos') qs.set('section', params.section);

    try {
      const remote = await request<{
        items: Exam[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>(`/exams?${qs.toString()}`);
      if (remote && Array.isArray(remote.items)) {
        return remote;
      }
    } catch {
      // fallback to local store pagination
    }

    const all = await this.getExams();
    const q = (params.search || '').trim().toLowerCase();
    const sec = params.section || 'todos';
    const filtered = all.filter((ex) => {
      if (sec !== 'todos' && ex.section !== sec) return false;
      if (!q) return true;
      return (
        ex.code.toLowerCase().includes(q) ||
        ex.name.toLowerCase().includes(q) ||
        ex.section.toLowerCase().includes(q)
      );
    });
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / params.limit));
    const page = Math.min(Math.max(1, params.page), totalPages);
    return {
      items: filtered.slice((page - 1) * params.limit, page * params.limit),
      total,
      page,
      limit: params.limit,
      totalPages,
    };
  },

  async saveExam(exam: Partial<Exam>, tablePrices?: Record<string, number>): Promise<Exam> {
    const exams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);
    const days = Number(exam.delivery_days) || 1;
    const label =
      exam.delivery_time_label?.trim() || (days === 1 ? '1 dia útil' : `${days} dias úteis`);
    const resolvedPrice = Number(exam.price ?? exam.base_price ?? 80);
    const payload: Partial<Exam> = {
      ...exam,
      code: (exam.code || 'EXM-NEW').toUpperCase(),
      delivery_days: days,
      delivery_time_label: label,
      tube_type: exam.tube_type || exam.material || 'Tubo EDTA (Tampa Roxa)',
      material: exam.material || exam.tube_type || 'Tubo EDTA (Tampa Roxa)',
      label_qty: Number(exam.label_qty) || 1,
      base_price: resolvedPrice,
      price: resolvedPrice,
    };

    const syncExamPriceToActiveTables = (savedExam: Exam) => {
      try {
        const tables = loadStore<PriceTable[]>(STORAGE_KEYS.PRICE_TABLES, SEED_PRICE_TABLES);
        const updatedTables = tables.map((pt) => {
          const hasExplicitPrice = tablePrices && tablePrices[pt.id] !== undefined;
          if (!hasExplicitPrice && !pt.is_active) return pt;
          const targetPrice = hasExplicitPrice ? Number(tablePrices![pt.id]) : resolvedPrice;
          const list = pt.prices || pt.items || [];
          const exists = list.some((p) => p.exam_id === savedExam.id || p.exam_code === savedExam.code);
          const nextPrices = exists
            ? list.map((p) =>
              p.exam_id === savedExam.id || p.exam_code === savedExam.code
                ? { ...p, exam_id: savedExam.id, exam_code: savedExam.code, exam_name: savedExam.name, price: targetPrice }
                : p
            )
            : [
              ...list,
              {
                exam_id: savedExam.id,
                exam_code: savedExam.code,
                exam_name: savedExam.name,
                price: targetPrice,
              },
            ];
          return { ...pt, prices: nextPrices };
        });
        saveStore(STORAGE_KEYS.PRICE_TABLES, updatedTables);
      } catch {
        // ignore
      }
    };

    try {
      if (exam.id) {
        const updated = await request<Exam>(`/exams/${exam.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const merged: Exam = {
          ...(exams.find((e) => e.id === exam.id) || ({} as Exam)),
          ...payload,
          ...updated,
          delivery_time_label: updated.delivery_time_label || label,
          base_price: Number(updated.price ?? updated.base_price ?? resolvedPrice),
          price: Number(updated.price ?? updated.base_price ?? resolvedPrice),
        };
        const next = exams.map((e) => (e.id === exam.id ? merged : e));
        saveStore(STORAGE_KEYS.EXAMS, next);
        syncExamPriceToActiveTables(merged);
        return merged;
      } else {
        const created = await request<Exam>('/exams', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const merged: Exam = {
          ...payload,
          ...created,
          id: created.id || `exam-${Date.now()}`,
          delivery_time_label: created.delivery_time_label || label,
          base_price: Number(created.price ?? created.base_price ?? resolvedPrice),
          price: Number(created.price ?? created.base_price ?? resolvedPrice),
        } as Exam;
        const next = [merged, ...exams];
        saveStore(STORAGE_KEYS.EXAMS, next);
        syncExamPriceToActiveTables(merged);
        return merged;
      }
    } catch {
      if (exam.id) {
        const next = exams.map((e) => (e.id === exam.id ? ({ ...e, ...payload } as Exam) : e));
        saveStore(STORAGE_KEYS.EXAMS, next);
        const found = next.find((e) => e.id === exam.id)!;
        syncExamPriceToActiveTables(found);
        return found;
      }
      const created: Exam = {
        id: `exam-${Date.now()}`,
        code: (payload.code || 'EXM-NEW').toUpperCase(),
        name: payload.name || 'Novo Exame Laboratorial',
        section: payload.section || 'Bioquímica',
        delivery_days: days,
        delivery_time_label: label,
        tube_type: payload.tube_type || 'Tubo EDTA (Tampa Roxa)',
        material: payload.material || payload.tube_type || 'Tubo EDTA (Tampa Roxa)',
        label_qty: Number(payload.label_qty) || 1,
        reference_template_id: payload.reference_template_id || 'tpl-default-01',
        base_price: resolvedPrice,
        price: resolvedPrice,
        input_fields: payload.input_fields || [],
      };
      const next = [created, ...exams];
      saveStore(STORAGE_KEYS.EXAMS, next);
      syncExamPriceToActiveTables(created);
      return created;
    }
  },

  async deleteExam(examId: string): Promise<void> {
    const exams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS).filter((e) => e.id !== examId);
    saveStore(STORAGE_KEYS.EXAMS, exams);
    try {
      await request(`/exams/${examId}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
  },

  async saveExamFields(examId: string, fields: ExamInputField[]): Promise<ExamInputField[]> {
    const exams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);
    const updatedExams = exams.map((e) =>
      e.id === examId ? { ...e, input_fields: fields } : e
    );
    saveStore(STORAGE_KEYS.EXAMS, updatedExams);

    try {
      const res = await request<any>(`/exams/${examId}/fields`, {
        method: 'PUT',
        body: JSON.stringify({ fields }),
      });
      return Array.isArray(res) ? res : res.fields || fields;
    } catch {
      return fields;
    }
  },

  // ==========================================
  // 6. TABELAS DE PREÇOS COM VIGÊNCIA (HU-03, RN-04)
  // ==========================================
  async getPriceTables(): Promise<PriceTable[]> {
    const local = loadStore<PriceTable[]>(STORAGE_KEYS.PRICE_TABLES, SEED_PRICE_TABLES);
    try {
      const remote = await request<PriceTable[]>('/price-tables');
      if (Array.isArray(remote) && remote.length > 0) {
        const normalized = remote.map((pt) => ({
          ...pt,
          prices: pt.prices || pt.items || [],
        }));
        saveStore(STORAGE_KEYS.PRICE_TABLES, normalized);
        return normalized;
      }
    } catch {
      // fallback
    }
    return local;
  },

  async savePriceTable(
    table: Partial<PriceTable>,
    adjustmentPercent?: number
  ): Promise<PriceTable> {
    const tables = loadStore<PriceTable[]>(STORAGE_KEYS.PRICE_TABLES, SEED_PRICE_TABLES);
    const exams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);

    let prices = table.prices || [];
    if (prices.length === 0) {
      prices = exams.map((ex) => ({
        exam_id: ex.id,
        exam_code: ex.code,
        exam_name: ex.name,
        price: ex.base_price || 75,
      }));
    }

    if (typeof adjustmentPercent === 'number' && adjustmentPercent !== 0) {
      const factor = 1 + adjustmentPercent / 100;
      prices = prices.map((p) => ({
        ...p,
        price: Number((p.price * factor).toFixed(2)),
      }));
    }

    const payload = { ...table, prices, adjustment_percent: adjustmentPercent };

    try {
      if (table.id) {
        const res = await request<PriceTable>(`/price-tables/${table.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const merged: PriceTable = {
          ...(tables.find((t) => t.id === table.id) || ({} as PriceTable)),
          ...table,
          ...res,
          prices: res.prices || res.items || prices,
        };
        saveStore(
          STORAGE_KEYS.PRICE_TABLES,
          tables.map((t) => (t.id === table.id ? merged : t))
        );
        return merged;
      } else {
        const res = await request<PriceTable>('/price-tables', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const created: PriceTable = {
          id: res.id || `pt-${Date.now()}`,
          name: table.name || 'Nova Tabela de Vigência',
          partner_clinic: table.partner_clinic || 'Clínicas Parceiras',
          start_date: table.start_date || '2026-01-01',
          end_date: table.end_date || '2026-12-31',
          is_active: table.is_active ?? true,
          prices: res.prices || res.items || prices,
        };
        saveStore(STORAGE_KEYS.PRICE_TABLES, [created, ...tables]);
        return created;
      }
    } catch {
      if (table.id) {
        const updated: PriceTable = {
          ...(tables.find((t) => t.id === table.id) as PriceTable),
          ...table,
          prices,
        };
        saveStore(
          STORAGE_KEYS.PRICE_TABLES,
          tables.map((t) => (t.id === table.id ? updated : t))
        );
        return updated;
      }
      const created: PriceTable = {
        id: `pt-${Date.now()}`,
        name: table.name || 'Nova Tabela de Vigência',
        partner_clinic: table.partner_clinic || 'Convênio Geral',
        start_date: table.start_date || '2026-01-01',
        end_date: table.end_date || '2026-12-31',
        is_active: table.is_active ?? true,
        prices,
      };
      saveStore(STORAGE_KEYS.PRICE_TABLES, [created, ...tables]);
      return created;
    }
  },

  // ==========================================
  // 7. VALORES DE REFERÊNCIA E MODELOS DE LAUDOS (HU-04, HU-05)
  // ==========================================
  async getExamReferences(): Promise<ExamReference[]> {
    const local = loadStore<ExamReference[]>(STORAGE_KEYS.REFERENCES, SEED_EXAM_REFERENCES);
    try {
      const remote = await request<ExamReference[]>('/exam-references');
      if (Array.isArray(remote) && remote.length > 0) {
        saveStore(STORAGE_KEYS.REFERENCES, remote);
        return remote;
      }
    } catch {
      // use local
    }
    return local;
  },

  async saveExamReference(ref: Partial<ExamReference>): Promise<ExamReference> {
    const refs = loadStore<ExamReference[]>(STORAGE_KEYS.REFERENCES, SEED_EXAM_REFERENCES);
    try {
      if (ref.id) {
        const updated = await request<ExamReference>(`/exam-references/${ref.id}`, {
          method: 'PUT',
          body: JSON.stringify(ref),
        });
        const next = refs.map((r) => (r.id === ref.id ? { ...r, ...updated } : r));
        saveStore(STORAGE_KEYS.REFERENCES, next);
        return updated;
      } else {
        const created = await request<ExamReference>('/exam-references', {
          method: 'POST',
          body: JSON.stringify(ref),
        });
        saveStore(STORAGE_KEYS.REFERENCES, [...refs, created]);
        return created;
      }
    } catch {
      const created: ExamReference = {
        id: ref.id || `ref-${Date.now()}`,
        exam_id: ref.exam_id || 'exam-hemo-01',
        exam_name: ref.exam_name,
        species: ref.species || 'Canino',
        gender: ref.gender || 'Ambos',
        min_age_days: Number(ref.min_age_days) || 1,
        max_age_days: Number(ref.max_age_days) || 3650,
        reference_text_content: ref.reference_text_content || '',
      };
      const next = ref.id
        ? refs.map((r) => (r.id === ref.id ? created : r))
        : [...refs, created];
      saveStore(STORAGE_KEYS.REFERENCES, next);
      return created;
    }
  },

  async deleteExamReference(id: string): Promise<void> {
    const refs = loadStore<ExamReference[]>(STORAGE_KEYS.REFERENCES, SEED_EXAM_REFERENCES).filter(
      (r) => r.id !== id
    );
    saveStore(STORAGE_KEYS.REFERENCES, refs);
    try {
      await request(`/exam-references/${id}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
  },

  async getReportTemplates(): Promise<ReportTemplate[]> {
    const local = loadStore<ReportTemplate[]>(STORAGE_KEYS.TEMPLATES, SEED_REPORT_TEMPLATES);
    try {
      const remote = await request<ReportTemplate[]>('/report-templates');
      if (Array.isArray(remote) && remote.length > 0) {
        saveStore(STORAGE_KEYS.TEMPLATES, remote);
        return remote;
      }
    } catch {
      // use local
    }
    return local;
  },

  async saveReportTemplate(tpl: Partial<ReportTemplate>): Promise<ReportTemplate> {
    const templates = loadStore<ReportTemplate[]>(STORAGE_KEYS.TEMPLATES, SEED_REPORT_TEMPLATES);
    try {
      if (tpl.id) {
        const updated = await request<ReportTemplate>(`/report-templates/${tpl.id}`, {
          method: 'PUT',
          body: JSON.stringify(tpl),
        });
        const next = templates.map((t) => (t.id === tpl.id ? { ...t, ...tpl, ...updated } : t));
        saveStore(STORAGE_KEYS.TEMPLATES, next);
        return next.find((t) => t.id === tpl.id)!;
      } else {
        const created = await request<ReportTemplate>('/report-templates', {
          method: 'POST',
          body: JSON.stringify(tpl),
        });
        saveStore(STORAGE_KEYS.TEMPLATES, [...templates, created]);
        return created;
      }
    } catch {
      const saved: ReportTemplate = {
        id: tpl.id || `tpl-${Date.now()}`,
        name: tpl.name || 'Modelo Personalizado VetLife',
        header_html: tpl.header_html || '',
        body_template: tpl.body_template || '',
        footer_html: tpl.footer_html || '',
        is_default: tpl.is_default ?? false,
      };
      const next = tpl.id
        ? templates.map((t) => (t.id === tpl.id ? saved : t))
        : [...templates, saved];
      saveStore(STORAGE_KEYS.TEMPLATES, next);
      return saved;
    }
  },

  // ==========================================
  // 8. PACIENTES, VETERINÁRIOS E ATENDIMENTOS (HU-06 a HU-09, RN-03, RN-04)
  // ==========================================
  async getPatients(): Promise<Patient[]> {
    const local = loadStore<Patient[]>(STORAGE_KEYS.PATIENTS, SEED_PATIENTS);
    try {
      const remote = await request<Patient[]>('/patients');
      if (Array.isArray(remote) && remote.length > 0) {
        saveStore(STORAGE_KEYS.PATIENTS, remote);
        return remote;
      }
    } catch {
      // fallback
    }
    return local;
  },

  async savePatient(patient: Partial<Patient>): Promise<Patient> {
    const list = loadStore<Patient[]>(STORAGE_KEYS.PATIENTS, SEED_PATIENTS);
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

    try {
      if (patient.id) {
        const updated = await request<Patient>(`/patients/${patient.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        const merged = { ...(list.find((p) => p.id === patient.id) || ({} as Patient)), ...payload, ...updated } as Patient;
        saveStore(STORAGE_KEYS.PATIENTS, list.map((p) => (p.id === patient.id ? merged : p)));
        return merged;
      } else {
        const created = await request<Patient>('/patients', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const merged: Patient = {
          ...payload,
          ...created,
          id: created.id || `pat-${Date.now()}`,
          age_days: created.age_days || ageDays,
        } as Patient;
        saveStore(STORAGE_KEYS.PATIENTS, [merged, ...list]);
        return merged;
      }
    } catch {
      if (patient.id) {
        const next = list.map((p) => (p.id === patient.id ? ({ ...p, ...payload } as Patient) : p));
        saveStore(STORAGE_KEYS.PATIENTS, next);
        return next.find((p) => p.id === patient.id)!;
      }
      const created: Patient = {
        id: `pat-${Date.now()}`,
        name: payload.name || 'Paciente',
        species: payload.species || 'Canino',
        breed: payload.breed || 'SRD',
        gender: payload.gender === 'F' ? 'F' : 'M',
        birth_date: payload.birth_date || new Date().toISOString().slice(0, 10),
        age_days: ageDays,
        tutor_name: payload.tutor_name || 'Tutor Responsável',
        tutor_phone: payload.tutor_phone || '',
        tutor_email: payload.tutor_email || '',
      };
      saveStore(STORAGE_KEYS.PATIENTS, [created, ...list]);
      return created;
    }
  },

  async deletePatient(patientId: string): Promise<void> {
    const list = loadStore<Patient[]>(STORAGE_KEYS.PATIENTS, SEED_PATIENTS).filter(
      (p) => p.id !== patientId
    );
    saveStore(STORAGE_KEYS.PATIENTS, list);
    try {
      await request(`/patients/${patientId}`, { method: 'DELETE' });
    } catch {
      // ignore if offline
    }
  },

  async getVets(): Promise<Vet[]> {
    const local = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
    try {
      const remote = await request<Vet[]>('/vets');
      if (Array.isArray(remote) && remote.length > 0) {
        saveStore(STORAGE_KEYS.VETS, remote);
        return remote;
      }
    } catch {
      // fallback
    }
    return local;
  },

  async createVet(payload: Omit<Vet, 'id' | 'created_at'> & { password?: string }): Promise<Vet> {
    try {
      const created = await request<Vet>('/vets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const local = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
      saveStore(STORAGE_KEYS.VETS, [created, ...local.filter((v) => v.id !== created.id)]);
      return created;
    } catch {
      const local = loadStore<Array<Vet & { password_hash?: string }>>(STORAGE_KEYS.VETS, SEED_VETS);
      const created: Vet & { password_hash?: string } = {
        ...payload,
        id: `vet-${Date.now().toString().slice(-6)}`,
        ...(payload.password ? { password_hash: payload.password } : {}),
        created_at: new Date().toISOString(),
      };
      saveStore(STORAGE_KEYS.VETS, [created, ...local]);
      return created;
    }
  },

  async updateVet(id: string, payload: Partial<Vet> & { password?: string }): Promise<Vet> {
    try {
      const updated = await request<Vet>(`/vets/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const local = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
      saveStore(
        STORAGE_KEYS.VETS,
        local.map((v) => (v.id === id ? updated : v)),
      );
      return updated;
    } catch {
      const local = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
      let result: Vet | null = null;
      const next = local.map((v) => {
        if (v.id === id) {
          result = { ...v, ...payload, id };
          return result;
        }
        return v;
      });
      saveStore(STORAGE_KEYS.VETS, next);
      if (!result) throw new Error('Veterinário não encontrado.');
      return result;
    }
  },

  async deleteVet(id: string): Promise<void> {
    const local = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
    saveStore(
      STORAGE_KEYS.VETS,
      local.filter((v) => v.id !== id),
    );
    try {
      await request(`/vets/${id}`, { method: 'DELETE' });
    } catch {
      // ignore if offline
    }
  },

  async getUsers(): Promise<User[]> {
    const local = loadStore<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
    try {
      const remote = await request<User[]>('/users');
      if (Array.isArray(remote) && remote.length > 0) {
        saveStore(STORAGE_KEYS.USERS, remote);
        return remote;
      }
    } catch {
      // fallback
    }
    const current = this.getCurrentUser();
    if (current && !local.some((u) => u.email.toLowerCase() === current.email.toLowerCase())) {
      const merged = [current, ...local];
      saveStore(STORAGE_KEYS.USERS, merged);
      return merged;
    }
    return local;
  },

  async createUser(payload: {
    name: string;
    email: string;
    role: 'admin' | 'biomedical';
    password: string;
  }): Promise<User> {
    try {
      const created = await request<User>('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const local = loadStore<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
      saveStore(STORAGE_KEYS.USERS, [...local.filter((u) => u.id !== created.id), created]);
      return created;
    } catch (err: any) {
      if (err?.message && !String(err.message).includes('404')) {
        throw err;
      }
      const local = loadStore<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
      const created: User = {
        id: `usr-${Date.now().toString().slice(-6)}`,
        name: payload.name.trim(),
        email: payload.email.trim().toLowerCase(),
        role: payload.role,
      };
      saveStore(STORAGE_KEYS.USERS, [...local, created]);
      return created;
    }
  },

  async updateUser(
    id: string,
    payload: Partial<{
      name: string;
      email: string;
      role: 'admin' | 'biomedical';
      password: string;
    }>,
  ): Promise<User> {
    try {
      const updated = await request<User>(`/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      const local = loadStore<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
      saveStore(
        STORAGE_KEYS.USERS,
        local.map((u) => (u.id === id ? updated : u)),
      );
      return updated;
    } catch (err: any) {
      if (err?.message && !String(err.message).includes('404')) {
        throw err;
      }
      const local = loadStore<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
      let result: User | null = null;
      const next = local.map((u) => {
        if (u.id === id) {
          result = {
            ...u,
            ...(payload.name ? { name: payload.name } : {}),
            ...(payload.email ? { email: payload.email } : {}),
            ...(payload.role ? { role: payload.role } : {}),
          };
          return result;
        }
        return u;
      });
      saveStore(STORAGE_KEYS.USERS, next);
      if (!result) throw new Error('Usuário não encontrado.');
      return result;
    }
  },

  async deleteUser(id: string): Promise<void> {
    const local = loadStore<User[]>(STORAGE_KEYS.USERS, SEED_USERS);
    saveStore(
      STORAGE_KEYS.USERS,
      local.filter((u) => u.id !== id),
    );
    try {
      await request(`/users/${id}`, { method: 'DELETE' });
    } catch {
      // ignore if offline
    }
  },

  async getOrders(): Promise<Order[]> {
    const local = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    try {
      const remote = await request<Order[]>('/orders');
      if (Array.isArray(remote) && remote.length > 0) {
        saveStore(STORAGE_KEYS.ORDERS, remote);
        return remote;
      }
    } catch {
      // fallback
    }
    return local;
  },

  async getVetOrders(vetId?: string): Promise<Order[]> {
    try {
      const remote = await request<Order[]>('/vet/orders');
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch {
      // fallback
    }
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    if (!vetId) return orders;
    const filtered = orders.filter((o) => o.vet_id === vetId || o.vet?.id === vetId);
    return filtered.length > 0 ? filtered : orders;
  },

  async createOrder(payload: {
    patient: Omit<Patient, 'id'> & { id?: string };
    vet_id: string;
    price_table_id: string;
    exam_ids: string[];
    order_date: string;
    notes?: string;
  }): Promise<Order> {
    const exams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);
    const tables = loadStore<PriceTable[]>(STORAGE_KEYS.PRICE_TABLES, SEED_PRICE_TABLES);
    const vets = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
    const refs = loadStore<ExamReference[]>(STORAGE_KEYS.REFERENCES, SEED_EXAM_REFERENCES);
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const patients = loadStore<Patient[]>(STORAGE_KEYS.PATIENTS, SEED_PATIENTS);

    const activeTable =
      tables.find((t) => t.id === payload.price_table_id) ||
      tables.find((t) => t.is_active) ||
      tables[0];

    const patient: Patient = payload.patient.id
      ? (patients.find((p) => p.id === payload.patient.id) || {
        ...payload.patient,
        id: payload.patient.id,
      })
      : {
        ...payload.patient,
        id: `pat-${Date.now()}`,
        age_days: calculatePatientAgeDays(payload.patient.birth_date, payload.patient.age_days),
      };

    if (!patients.some((p) => p.id === patient.id)) {
      saveStore(STORAGE_KEYS.PATIENTS, [patient, ...patients]);
    }

    const vet = vets.find((v) => v.id === payload.vet_id) || vets[0];
    const ageDays = calculatePatientAgeDays(patient.birth_date, patient.age_days);

    const results = payload.exam_ids.map((examId, idx) => {
      const ex = exams.find((e) => e.id === examId)!;
      const priceEntry = (activeTable?.prices || activeTable?.items || []).find(
        (p) => p.exam_id === examId
      );
      const appliedPrice = priceEntry ? priceEntry.price : ex?.base_price || 75;
      const matchedRef = resolveReferenceForPatient(
        refs,
        examId,
        patient.species,
        patient.gender,
        ageDays
      );

      return {
        id: `res-${Date.now()}-${idx}`,
        order_id: '',
        exam_id: examId,
        exam: ex,
        exam_code: ex?.code || 'EXM',
        exam_name: ex?.name || 'Exame',
        section: ex?.section || 'Rotina',
        applied_price: appliedPrice,
        dynamic_content: {},
        reference_snapshot: matchedRef?.reference_text_content || '',
        matched_reference: matchedRef,
        attachments: [],
        input_fields: ex?.input_fields || [],
      };
    });

    const totalAmount = results.reduce((acc, r) => acc + (r.applied_price || 0), 0);
    const nextNumber = String(orders.length + 1).padStart(4, '0');
    const localOrder: Order = {
      id: `ord-${Date.now()}`,
      protocol_code: `VET-2026-${nextNumber}`,
      patient_id: patient.id,
      vet_id: vet.id,
      price_table_id: activeTable?.id,
      price_table_name: activeTable?.name,
      total_amount: Number(totalAmount.toFixed(2)),
      status: 'pendente',
      notes: payload.notes,
      created_at: new Date().toISOString(),
      patient,
      vet,
      results,
    };
    localOrder.results = results.map((r) => ({ ...r, order_id: localOrder.id }));

    try {
      const remote = await request<Order>('/orders', {
        method: 'POST',
        body: JSON.stringify({
          patient,
          patient_id: patient.id,
          vet_id: vet.id,
          price_table_id: activeTable?.id,
          exam_ids: payload.exam_ids,
          order_date: payload.order_date,
          notes: payload.notes,
        }),
      });
      const merged: Order = {
        ...localOrder,
        ...remote,
        patient: remote.patient || patient,
        vet: remote.vet || vet,
        results: remote.results && remote.results.length > 0 ? remote.results : localOrder.results,
      };
      saveStore(STORAGE_KEYS.ORDERS, [merged, ...orders]);
      return merged;
    } catch {
      saveStore(STORAGE_KEYS.ORDERS, [localOrder, ...orders]);
      return localOrder;
    }
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
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const existing = orders.find((o) => o.id === orderId);
    if (!existing) throw new Error('Atendimento não encontrado.');

    const vets = loadStore<Vet[]>(STORAGE_KEYS.VETS, SEED_VETS);
    const allExams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);
    const priceTables = loadStore<PriceTable[]>(STORAGE_KEYS.PRICE_TABLES, SEED_PRICE_TABLES);
    const refs = loadStore<ExamReference[]>(STORAGE_KEYS.REFERENCES, SEED_EXAM_REFERENCES);

    const patients = loadStore<Patient[]>(STORAGE_KEYS.PATIENTS, SEED_PATIENTS);
    const resolvedPatient: Patient =
      (payload.patient_id && patients.find((p) => p.id === payload.patient_id)) ||
      (payload.patient && 'id' in payload.patient ? (payload.patient as Patient) : existing.patient!);

    const vet = vets.find((v) => v.id === payload.vet_id) || existing.vet!;
    const activeTable =
      priceTables.find((pt) => pt.id === payload.price_table_id) || priceTables[0];

    const ageDays =
      resolvedPatient.age_days ||
      calculatePatientAgeDays(resolvedPatient.birth_date || '2023-01-01');

    const updatedResults = payload.exam_ids.map((examId, idx) => {
      const prevRes = (existing.results || []).find((r) => r.exam_id === examId);
      const ex = allExams.find((e) => e.id === examId);
      const priceEntry = activeTable?.prices?.find(
        (p) => p.exam_id === examId || p.exam_code === ex?.code
      );
      const appliedPrice = priceEntry ? priceEntry.price : ex?.base_price || prevRes?.applied_price || 75;
      const matchedRef = resolveReferenceForPatient(
        refs,
        examId,
        resolvedPatient.species,
        resolvedPatient.gender,
        ageDays
      );

      if (prevRes) {
        return {
          ...prevRes,
          exam: ex || prevRes.exam,
          exam_code: ex?.code || prevRes.exam_code || 'EXM',
          exam_name: ex?.name || prevRes.exam_name || 'Exame',
          section: ex?.section || prevRes.section || 'Rotina',
          applied_price: appliedPrice,
          matched_reference: matchedRef || prevRes.matched_reference,
          reference_snapshot: matchedRef?.reference_text_content || prevRes.reference_snapshot || '',
        };
      }

      return {
        id: `res-${Date.now()}-${idx}`,
        order_id: existing.id,
        exam_id: examId,
        exam: ex,
        exam_code: ex?.code || 'EXM',
        exam_name: ex?.name || 'Exame',
        section: ex?.section || 'Rotina',
        applied_price: appliedPrice,
        dynamic_content: {},
        reference_snapshot: matchedRef?.reference_text_content || '',
        matched_reference: matchedRef,
        attachments: [],
        input_fields: ex?.input_fields || [],
      };
    });

    const totalAmount = updatedResults.reduce((acc, r) => acc + (r.applied_price || 0), 0);
    const updatedOrder: Order = {
      ...existing,
      patient_id: resolvedPatient.id,
      patient: resolvedPatient,
      vet_id: vet.id,
      vet,
      price_table_id: activeTable?.id,
      price_table_name: activeTable?.name,
      total_amount: Number(totalAmount.toFixed(2)),
      notes: payload.notes,
      created_at: payload.order_date ? `${payload.order_date}T12:00:00.000Z` : existing.created_at,
      results: updatedResults,
    };

    try {
      await request<Order>(`/orders/${orderId}`, {
        method: 'PUT',
        body: JSON.stringify(updatedOrder),
      });
    } catch {
      // fallback to local store
    }

    const nextOrders = orders.map((o) => (o.id === orderId ? updatedOrder : o));
    saveStore(STORAGE_KEYS.ORDERS, nextOrders);
    return updatedOrder;
  },

  async getOrderLabels(order: Order): Promise<CollectionLabel[]> {
    try {
      const remote = await request<any>(`/orders/${order.id}/labels`);
      const list = Array.isArray(remote) ? remote : remote.labels;
      if (Array.isArray(list) && list.length > 0) return list;
    } catch {
      // generate locally from exam tube_type & label_qty
    }

    const exams = loadStore<Exam[]>(STORAGE_KEYS.EXAMS, SEED_EXAMS);
    const labels: CollectionLabel[] = [];

    (order.results || []).forEach((res) => {
      const ex = exams.find((e) => e.id === res.exam_id) || res.exam;
      const qty = ex?.label_qty || 1;
      const tubeType = ex?.tube_type || 'Tubo Padrão';
      const code = ex?.code || res.exam_code || 'EXM';

      for (let i = 1; i <= qty; i++) {
        labels.push({
          label_id: `${order.protocol_code}-${code}-${i}`,
          protocol_code: order.protocol_code,
          barcode: `*${order.protocol_code.replace(/-/g, '')}${code.replace(/-/g, '')}${i}*`,
          patient_name: order.patient?.name || 'Paciente',
          species: order.patient?.species || 'Canino',
          tutor_name: order.patient?.tutor_name || 'Tutor',
          exam_code: code,
          exam_name: ex?.name || res.exam_name || 'Exame',
          section: ex?.section || res.section || 'Geral',
          tube_type: tubeType,
          label_index: i,
          total_labels_for_exam: qty,
          created_at: order.created_at,
        });
      }
    });

    return labels;
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
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const updatedOrders = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const results = (ord.results || []).map((r) =>
        r.id === resultId
          ? {
            ...r,
            dynamic_content: payload.dynamic_content,
            attachments: payload.attachments ?? r.attachments,
            reference_snapshot: payload.reference_snapshot ?? r.reference_snapshot,
            notes: payload.notes ?? r.notes,
          }
          : r
      );
      const nextStatus = ord.status === 'concluido' ? 'concluido' : 'em_analise';
      return { ...ord, status: nextStatus as any, results };
    });
    saveStore(STORAGE_KEYS.ORDERS, updatedOrders);

    try {
      await request(`/orders/${orderId}/results/${resultId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    } catch {
      // local already saved
    }

    return updatedOrders.find((o) => o.id === orderId)!;
  },

  async releaseOrderReport(orderId: string, templateId?: string, resultId?: string): Promise<Order> {
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const templates = loadStore<ReportTemplate[]>(STORAGE_KEYS.TEMPLATES, SEED_REPORT_TEMPLATES);
    const chosenTemplate =
      templates.find((t) => t.id === templateId) ||
      templates.find((t) => t.is_default) ||
      templates[0];

    const releasedAt = new Date().toISOString();
    const currentUser = this.getCurrentUser();

    const updatedOrders = orders.map((ord) => {
      if (ord.id !== orderId) return ord;
      const updatedResults = (ord.results || []).map((r) => {
        if (resultId && r.id !== resultId) return r;
        return {
          ...r,
          released_at: releasedAt,
          released_by: currentUser?.name || 'Corpo Biomédico VetLife',
          pdf_url: `https://vetlifelab.com.br/laudos/${ord.protocol_code}.pdf`,
        };
      });
      const allReleased =
        updatedResults.length > 0 && updatedResults.every((r) => Boolean(r.released_at));
      const nextOrder: Order = {
        ...ord,
        status: allReleased ? 'concluido' : 'em_analise',
        released_at: allReleased ? releasedAt : ord.released_at,
        template: chosenTemplate,
        results: updatedResults,
      };
      nextOrder.rendered_report = renderReportWithDynamicTags(chosenTemplate, nextOrder);
      return nextOrder;
    });

    saveStore(STORAGE_KEYS.ORDERS, updatedOrders);

    try {
      const remote = await request<Order>(`/orders/${orderId}/release`, {
        method: 'POST',
        body: JSON.stringify({ template_id: chosenTemplate.id, result_id: resultId }),
      });
      if (remote) {
        const merged = updatedOrders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                pdf_url: remote.pdf_url ?? o.pdf_url,
                results: (o.results || []).map((r) => {
                  const remoteRes = (remote.results || []).find((rr) => rr.id === r.id);
                  return remoteRes?.pdf_url ? { ...r, pdf_url: remoteRes.pdf_url } : r;
                }),
              }
            : o
        );
        saveStore(STORAGE_KEYS.ORDERS, merged);
        return merged.find((o) => o.id === orderId)!;
      }
    } catch {
      // local already saved
    }

    return updatedOrders.find((o) => o.id === orderId)!;
  },

  async publishOrderPdf(order: Order): Promise<{
    pdf_url: string;
    exam_pdfs: Array<{ result_id: string; pdf_url: string }>;
  }> {
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    try {
      const remote = await request<{
        pdf_url: string;
        exam_pdfs: Array<{ result_id: string; pdf_url: string }>;
      }>(`/orders/${order.id}/publish-pdf`, {
        method: 'POST',
        body: JSON.stringify({ order_snapshot: order }),
      });

      const updatedOrders = orders.map((o) => {
        if (o.id !== order.id) return o;
        return {
          ...o,
          pdf_url: remote.pdf_url,
          results: (o.results || []).map((r) => {
            const found = remote.exam_pdfs.find((ep) => ep.result_id === r.id);
            return found ? { ...r, pdf_url: found.pdf_url } : r;
          }),
        };
      });
      saveStore(STORAGE_KEYS.ORDERS, updatedOrders);
      return remote;
    } catch {
      const fallbackUrl = order.pdf_url || `${window.location.origin}/?protocol=${order.protocol_code}`;
      return {
        pdf_url: fallbackUrl,
        exam_pdfs: (order.results || []).map((r) => ({
          result_id: r.id,
          pdf_url: r.pdf_url || fallbackUrl,
        })),
      };
    }
  },

  // ==========================================
  // 9. DASHBOARDS OPERACIONAL E FINANCEIRO (RN-01)
  // ==========================================
  async getOperationalDashboard(): Promise<OperationalStats> {
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const collections = loadStore<CollectionRequest[]>(
      STORAGE_KEYS.COLLECTIONS,
      SEED_COLLECTION_REQUESTS
    );

    const pending = orders.filter((o) => o.status === 'pendente').length;
    const inAnalysis = orders.filter((o) => o.status === 'em_analise').length;
    const completed = orders.filter((o) => o.status === 'concluido').length;

    const sectionCounts: Record<string, number> = {};
    orders.forEach((o) => {
      (o.results || []).forEach((r) => {
        const sec = r.section || 'Geral';
        sectionCounts[sec] = (sectionCounts[sec] || 0) + 1;
      });
    });

    return {
      today_orders: orders.length,
      total_orders: orders.length,
      pending_orders: pending,
      in_analysis_orders: inAnalysis,
      completed_orders: completed,
      pending_collections: collections.length,
      section_breakdown: Object.entries(sectionCounts).map(([section, count]) => ({
        section,
        count,
      })),
      recent_orders: orders.slice(0, 8),
    };
  },

  async getFinancialDashboard(): Promise<FinancialStats> {
    const orders = loadStore<Order[]>(STORAGE_KEYS.ORDERS, SEED_ORDERS);
    const totalOrdersRevenue = orders.reduce((acc, o) => acc + (o.total_amount || 0), 0);
    const baseMonthlyRevenue = 18450.0 + totalOrdersRevenue;
    const operationalCosts = 6820.0;
    const netMargin = baseMonthlyRevenue - operationalCosts;
    const marginPercent = Number(((netMargin / baseMonthlyRevenue) * 100).toFixed(1));

    return {
      total_revenue: Number(baseMonthlyRevenue.toFixed(2)),
      monthly_revenue: Number(baseMonthlyRevenue.toFixed(2)),
      average_ticket: Number((totalOrdersRevenue / Math.max(1, orders.length)).toFixed(2)),
      operational_costs: operationalCosts,
      net_margin: Number(netMargin.toFixed(2)),
      margin_percent: marginPercent,
      revenue_by_table: [
        {
          table_name: 'Tabela Particular & Clínicas 2026',
          partner: 'Atendimento Direto / Clínicas Gerais',
          count: 84,
          total: 11890.0,
        },
        {
          table_name: 'Convênio Parceiro — Rede PetCare & VetVida (-15%)',
          partner: 'Rede Credenciada PetCare / VetVida',
          count: 58,
          total: 6560.0 + totalOrdersRevenue,
        },
      ],
      top_exams: [
        { exam_code: 'HEMO-01', exam_name: 'Hemograma Completo Veterinário', count: 96, revenue: 6528.0 },
        { exam_code: 'BIOQ-01', exam_name: 'Perfil Bioquímico Renal e Hepático', count: 64, revenue: 7360.0 },
        { exam_code: 'MICRO-01', exam_name: 'Urocultura Quantitativa com Antibiograma', count: 22, revenue: 3190.0 },
        { exam_code: 'PARA-01', exam_name: 'Coproparasitológico Funcional', count: 29, revenue: 1595.0 },
      ],
      ledger_entries: [
        {
          id: 'ldg-1',
          date: '2026-04-13',
          description: 'Faturamento Rotina Laboratorial — Tabela Particular 2026',
          type: 'entrada',
          category: 'Exames Laboratoriais',
          amount: 11890.0,
        },
        {
          id: 'ldg-2',
          date: '2026-04-13',
          description: 'Repasse Convênio Clínicas Parceiras (PetCare & VetVida)',
          type: 'entrada',
          category: 'Convênios Veterinários',
          amount: Number((6560.0 + totalOrdersRevenue).toFixed(2)),
        },
        {
          id: 'ldg-3',
          date: '2026-04-10',
          description: 'Insumos Diagnósticos, Reagentes Bioquímicos e Tubos EDTA/Gel',
          type: 'saida',
          category: 'Custos Operacionais / Insumos',
          amount: 3920.0,
        },
        {
          id: 'ldg-4',
          date: '2026-04-08',
          description: 'Logística de Coleta Externa Motorizada e Controle de Qualidade',
          type: 'saida',
          category: 'Logística & Qualidade',
          amount: 2900.0,
        },
      ],
    };
  },
};
