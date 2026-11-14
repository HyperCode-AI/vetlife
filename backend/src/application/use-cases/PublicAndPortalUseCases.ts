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
      throw new ValidationError('Informe o código de protocolo para consultar o laudo (RN-02).');
    }

    const order = await this.repo.findOrderByProtocolCode(protocolCode);
    if (!order) {
      throw new NotFoundError(
        `Nenhum laudo ou atendimento encontrado para o protocolo '${protocolCode.toUpperCase()}'.`
      );
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
   * Landing Page Collection Request section.
   */
  public async createCollectionRequest(input: {
    clinic_or_tutor_name: string;
    phone: string;
    email?: string;
    address: string;
    preferred_date?: string;
    notes?: string;
  }): Promise<CollectionRequest> {
    if (!input.clinic_or_tutor_name || !input.phone || !input.address) {
      throw new ValidationError(
        'Nome da clínica/tutor, telefone de contato e endereço de coleta são obrigatórios.'
      );
    }

    return this.repo.createCollectionRequest({
      clinic_or_tutor_name: input.clinic_or_tutor_name,
      phone: input.phone,
      email: input.email || '',
      address: input.address,
      preferred_date: input.preferred_date,
      notes: input.notes || '',
    });
  }

  public async listCollectionRequests(): Promise<CollectionRequest[]> {
    return this.repo.listCollectionRequests();
  }
}
