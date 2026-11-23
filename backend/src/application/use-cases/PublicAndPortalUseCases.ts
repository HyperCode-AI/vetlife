import { CollectionRequest, Order } from '../../domain/entities';
import { NotFoundError, ValidationError } from '../../domain/errors/AppError';
import { IVetLifeRepository } from '../../domain/repositories/IVetLifeRepository';

export class PublicAndPortalUseCases {
  constructor(private readonly repo: IVetLifeRepository) {}

  /**
   * HU-10 & HU-11: Vet Portal orders listing.
   */
  public async listVetOrders(vetId: string, search?: string, status?: string): Promise<Order[]> {
    return this.repo.listOrders({
      vet_id: vetId,
      search,
      status,
    });
  }

  /**
   * HU-12 & RN-02: Tutor public lookup strictly by protocol_code without password.
   */
  public async getReportByProtocolCode(protocolCode: string): Promise<{
    protocol_code: string;
    status: Order['status'];
    created_at: string;
    released_at: string | null;
    laboratory: {
      name: string;
      domain: string;
      crmv_pj: string;
      technical_responsible: string;
    };
    order: Order;
    combined_report_html: string;
  }> {
    if (!protocolCode || !protocolCode.trim()) {
      throw new ValidationError('Digite o código do protocolo para consultar o resultado.');
    }

    const order = await this.repo.findOrderByProtocolCode(protocolCode);
    if (!order) {
      throw new NotFoundError(
        `Não encontramos nenhum laudo para o protocolo "${protocolCode.toUpperCase()}". Confira o número digitado e tente novamente.`
      );
    }

    if (order.status !== 'concluido') {
      return {
        protocol_code: order.protocol_code,
        status: order.status,
        created_at: order.created_at,
        released_at: null,
        laboratory: {
          name: 'VetLife Laboratório de Patologia Clínica Veterinária',
          domain: 'vetlifelab.com.br',
          crmv_pj: 'CRMV-SP PJ 09842',
          technical_responsible: 'Dr. Rafael Nogueira — CRBM-1 29410',
        },
        order: {
          ...order,
          pdf_url: null,
          results: (order.results || []).map((r) => ({
            ...r,
            dynamic_content: {},
            rendered_html: '',
            pdf_url: null,
          })),
        },
        combined_report_html: '',
      };
    }

    const combinedHtml = (order.results || [])
      .map((r) => r.rendered_html || '')
      .join('<hr style="margin:24px 0;border:none;border-top:2px dashed #cbd5e1;"/>');

    const latestRelease =
      (order.results || [])
        .map((r) => r.released_at)
        .filter(Boolean)
        .sort()
        .pop() || null;

    return {
      protocol_code: order.protocol_code,
      status: order.status,
      created_at: order.created_at,
      released_at: latestRelease,
      laboratory: {
        name: 'VetLife Laboratório de Patologia Clínica Veterinária',
        domain: 'vetlifelab.com.br',
        crmv_pj: 'CRMV-SP PJ 09842',
        technical_responsible: 'Dr. Rafael Nogueira — CRBM-1 29410',
      },
      order,
      combined_report_html: combinedHtml,
    };
  }

  /**
   * Landing Page Collection Request section (CRMV Obrigatório).
   */
  public async createCollectionRequest(input: {
    clinic_or_tutor_name: string;
    crmv: string;
    phone: string;
    email?: string;
    address: string;
    preferred_date?: string;
    scheduled_date?: string;
    scheduled_time?: string;
    status?: CollectionRequest['status'];
    notes?: string;
  }): Promise<CollectionRequest> {
    if (!input.clinic_or_tutor_name || !input.phone || !input.address) {
      throw new ValidationError(
        'Nome do médico veterinário/clínica, telefone de contato e endereço de coleta são obrigatórios.'
      );
    }
    if (!input.crmv || input.crmv.trim().length < 3) {
      throw new ValidationError(
        'O número do CRMV é obrigatório para solicitar coleta (exclusivo para médicos veterinários).'
      );
    }

    const resolvedStatus: CollectionRequest['status'] =
      input.status ||
      (input.scheduled_date && input.scheduled_date.trim() ? 'agendada' : 'pendente');

    return this.repo.createCollectionRequest({
      clinic_or_tutor_name: input.clinic_or_tutor_name,
      crmv: input.crmv.trim().toUpperCase(),
      phone: input.phone,
      email: input.email || '',
      address: input.address,
      preferred_date: input.preferred_date || input.scheduled_date,
      ...(input.scheduled_date ? { scheduled_date: input.scheduled_date } : {}),
      ...(input.scheduled_time ? { scheduled_time: input.scheduled_time } : {}),
      status: resolvedStatus,
      notes: input.notes || '',
    });
  }

  public async listCollectionRequests(filters?: {
    status?: string;
    search?: string;
  }): Promise<CollectionRequest[]> {
    let list = await this.repo.listCollectionRequests();
    if (filters?.status && filters.status !== 'todos') {
      list = list.filter((c) => c.status === filters.status);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.clinic_or_tutor_name.toLowerCase().includes(q) ||
          (c.crmv || '').toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          c.address.toLowerCase().includes(q) ||
          (c.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  }

  public async getCollectionRequestById(id: string): Promise<CollectionRequest> {
    const found = await this.repo.findCollectionRequestById(id);
    if (!found) {
      throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
    }
    return found;
  }

  public async updateCollectionRequestStatus(
    id: string,
    status: string,
    scheduledDate?: string,
    scheduledTime?: string
  ): Promise<CollectionRequest> {
    const allowed: CollectionRequest['status'][] = ['pendente', 'agendada', 'concluida', 'cancelada'];
    const normalized = String(status || '').trim() as CollectionRequest['status'];
    if (!allowed.includes(normalized)) {
      throw new ValidationError(
        `Status de coleta inválido: '${status}'. Use um de: ${allowed.join(', ')}.`
      );
    }
    return this.repo.updateCollectionRequestStatus(id, normalized, scheduledDate, scheduledTime);
  }

  public async updateCollectionRequest(
    id: string,
    patch: Partial<Omit<CollectionRequest, 'id' | 'created_at'>>
  ): Promise<CollectionRequest> {
    if (patch.status !== undefined) {
      const allowed: CollectionRequest['status'][] = ['pendente', 'agendada', 'concluida', 'cancelada'];
      if (!allowed.includes(patch.status)) {
        throw new ValidationError(
          `Status de coleta inválido: '${patch.status}'. Use um de: ${allowed.join(', ')}.`
        );
      }
    }
    return this.repo.updateCollectionRequest(id, patch);
  }

  public async deleteCollectionRequest(id: string): Promise<void> {
    return this.repo.deleteCollectionRequest(id);
  }
}
