import { randomUUID } from 'crypto';
import {
  ExamResult,
  Order,
  Patient,
  ReportAttachment,
  SampleLabel,
  Vet,
} from '../../domain/entities';
import { NotFoundError, ValidationError } from '../../domain/errors/AppError';
import { IVetLifeRepository } from '../../domain/repositories/IVetLifeRepository';
import { PricingService } from '../../domain/services/PricingService';
import { ReferenceResolverService } from '../../domain/services/ReferenceResolverService';
import { buildOrderPdfBuffer, uploadPdfToVercelBlob } from '../../utils/pdfStorage';

export class OrderAndRoutineUseCases {
  private readonly pricingService = new PricingService();
  private readonly referenceResolver = new ReferenceResolverService();

  constructor(private readonly repo: IVetLifeRepository) {}

  // ===========================================================================
  // PATIENTS & VETS
  // ===========================================================================
  public async listPatients(): Promise<Patient[]> {
    return this.repo.listPatients();
  }

  public async createPatient(input: {
    name: string;
    species: string;
    breed?: string;
    gender?: 'M' | 'F';
    birth_date?: string;
    age_months?: number;
    age_days?: number;
    tutor_name: string;
    tutor_phone: string;
    tutor_email?: string;
  }): Promise<Patient> {
    if (!input.name || !input.species || !input.tutor_name) {
      throw new ValidationError(
        'Preencha o nome do animal, a espécie e o nome do tutor para cadastrar o paciente.'
      );
    }

    let resolvedBirthDate = input.birth_date;
    if (!resolvedBirthDate) {
      const days =
        input.age_days !== undefined
          ? Number(input.age_days)
          : input.age_months !== undefined
          ? Number(input.age_months) * 30
          : 365;
      const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      resolvedBirthDate = d.toISOString().slice(0, 10);
    }

    return this.repo.createPatient({
      name: input.name,
      species: input.species,
      breed: input.breed || 'SRD',
      gender: input.gender === 'F' ? 'F' : 'M',
      birth_date: resolvedBirthDate,
      tutor_name: input.tutor_name,
      tutor_phone: input.tutor_phone || '(11) 99999-0000',
      tutor_email: input.tutor_email || '',
    });
  }

  public async updatePatient(id: string, input: Partial<Patient>): Promise<Patient> {
    return this.repo.updatePatient(id, input);
  }

  public async deletePatient(id: string): Promise<void> {
    return this.repo.deletePatient(id);
  }

  public async listVets(): Promise<Vet[]> {
    return this.repo.listVets();
  }

  public async createVet(input: {
    name: string;
    crmv: string;
    clinic_name?: string;
    email: string;
    phone?: string;
    password_hash?: string;
  }): Promise<Vet> {
    if (!input.name || !input.email) {
      throw new ValidationError('Nome e e-mail do veterinário são obrigatórios.');
    }
    if (!input.crmv || input.crmv.trim().length < 3) {
      throw new ValidationError('O registro CRMV é obrigatório para cadastrar médicos veterinários.');
    }

    return this.repo.createVet({
      name: input.name,
      crmv: input.crmv.trim().toUpperCase(),
      clinic_name: input.clinic_name || 'Clínica Veterinária Parceira',
      email: input.email,
      phone: input.phone || '(11) 3000-0000',
      ...(input.password_hash ? { password_hash: input.password_hash } : {}),
    });
  }

  public async updateVet(id: string, input: Partial<Vet>): Promise<Vet> {
    if (input.crmv !== undefined && input.crmv.trim().length < 3) {
      throw new ValidationError('O registro CRMV não pode ficar vazio.');
    }
    return this.repo.updateVet(id, {
      ...input,
      ...(input.crmv !== undefined ? { crmv: input.crmv.trim().toUpperCase() } : {}),
    });
  }

  public async deleteVet(id: string): Promise<void> {
    return this.repo.deleteVet(id);
  }

  // ===========================================================================
  // ORDERS / ATENDIMENTOS (HU-06, RN-03, RN-04)
  // ===========================================================================
  public async listOrders(filters?: {
    status?: string;
    vet_id?: string;
    patient_id?: string;
    search?: string;
  }): Promise<Order[]> {
    return this.repo.listOrders(filters);
  }

  public async getOrderById(id: string): Promise<Order> {
    const order = await this.repo.findOrderById(id);
    if (!order) {
      throw new NotFoundError(`Atendimento/Pedido '${id}' não encontrado.`);
    }
    return order;
  }

  public async createOrder(input: {
    patient_id?: string;
    patient?: {
      name: string;
      species: string;
      breed?: string;
      gender?: 'M' | 'F';
      birth_date?: string;
      age_months?: number;
      age_days?: number;
      tutor_name: string;
      tutor_phone?: string;
      tutor_email?: string;
    };
    vet_id?: string;
    exam_ids: string[];
    price_table_id?: string | null;
    order_date?: string;
    notes?: string;
  }): Promise<Order> {
    if (!input.exam_ids || !Array.isArray(input.exam_ids) || input.exam_ids.length === 0) {
      throw new ValidationError('Selecione ao menos um exame para abrir o atendimento.');
    }

    let resolvedPatientId = input.patient_id;
    if (!resolvedPatientId && input.patient) {
      const createdPatient = await this.createPatient({
        name: input.patient.name,
        species: input.patient.species,
        breed: input.patient.breed,
        gender: input.patient.gender,
        birth_date: input.patient.birth_date,
        age_months: input.patient.age_months,
        age_days: input.patient.age_days,
        tutor_name: input.patient.tutor_name,
        tutor_phone: input.patient.tutor_phone || '(11) 99999-0000',
        tutor_email: input.patient.tutor_email,
      });
      resolvedPatientId = createdPatient.id;
    }

    if (!resolvedPatientId) {
      throw new ValidationError(
        'Selecione um paciente cadastrado ou preencha os dados de um novo paciente para continuar.'
      );
    }

    const patient = await this.repo.findPatientById(resolvedPatientId);
    if (!patient) {
      throw new NotFoundError(`Paciente '${resolvedPatientId}' não encontrado.`);
    }

    const vets = await this.repo.listVets();
    const vet =
      (input.vet_id ? vets.find((v) => v.id === input.vet_id) : vets[0]) || vets[0];

    const [priceTables, exams, allRefs, existingOrders] = await Promise.all([
      this.repo.listPriceTables(),
      this.repo.listExams(),
      this.repo.listExamReferences(),
      this.repo.listOrders(),
    ]);

    // RN-04: Respect active price table based on request date and partner clinic
    const pricing = this.pricingService.resolveActivePriceTable(
      priceTables,
      exams,
      input.order_date,
      vet?.clinic_name,
      input.price_table_id
    );

    const maxSeq = existingOrders.reduce((max, o) => {
      const m = String(o.protocol_code || '').match(/(\d+)$/);
      const num = m ? Number(m[1]) : 0;
      return num > max ? num : max;
    }, existingOrders.length);
    const nextSeq = maxSeq + 1;
    const protocolCode = `VET-2026-${String(nextSeq).padStart(4, '0')}`;

    let totalAmount = 0;
    const resultsPayload: Array<Omit<ExamResult, 'id' | 'order_id'>> = [];

    for (const examId of input.exam_ids) {
      const exam = exams.find((e) => e.id === examId || e.code === examId);
      if (!exam) {
        throw new NotFoundError(`Exame '${examId}' não encontrado no catálogo.`);
      }

      const appliedPrice = Number(pricing.priceByExamId[exam.id] ?? exam.base_price ?? 68);
      totalAmount += appliedPrice;

      const matchedRefs = this.referenceResolver.resolveReferencesForPatient(
        allRefs,
        exam.id,
        patient.species,
        patient.gender,
        patient.age_days || 365
      );

      resultsPayload.push({
        exam_id: exam.id,
        applied_price: appliedPrice,
        dynamic_content: {},
        reference_snapshot: this.referenceResolver.buildReferenceSnapshotText(matchedRefs),
        attachments: [],
        pdf_url: null,
        released_at: null,
        released_by: null,
      });
    }

    return this.repo.createOrder(
      {
        protocol_code: protocolCode,
        patient_id: patient.id,
        vet_id: vet.id,
        price_table_id: pricing.activeTable?.id || null,
        price_table_name: pricing.activeTable?.name || 'Tabela Geral VetLife 2026',
        total_amount: Number(totalAmount.toFixed(2)),
        status: 'pendente',
        notes: input.notes || '',
      },
      resultsPayload
    );
  }

  public async updateOrder(
    orderId: string,
    input: {
      patient_id?: string;
      vet_id?: string;
      exam_ids?: string[];
      price_table_id?: string | null;
      order_date?: string;
      notes?: string;
      status?: Order['status'];
    }
  ): Promise<Order> {
    const existing = await this.getOrderById(orderId);
    const targetPatientId = input.patient_id || existing.patient_id;
    const patient = await this.repo.findPatientById(targetPatientId);
    if (!patient) {
      throw new NotFoundError(`Paciente '${targetPatientId}' não encontrado.`);
    }

    const vets = await this.repo.listVets();
    const vet =
      (input.vet_id ? vets.find((v) => v.id === input.vet_id) : vets.find((v) => v.id === existing.vet_id)) ||
      vets[0];

    let resultsPayload: Array<Omit<ExamResult, 'id' | 'order_id'>> | undefined;
    let totalAmount = existing.total_amount;
    let resolvedTableId = input.price_table_id !== undefined ? input.price_table_id : existing.price_table_id;
    let resolvedTableName = existing.price_table_name;

    if (Array.isArray(input.exam_ids) && input.exam_ids.length > 0) {
      const [priceTables, exams, allRefs] = await Promise.all([
        this.repo.listPriceTables(),
        this.repo.listExams(),
        this.repo.listExamReferences(),
      ]);

      const pricing = this.pricingService.resolveActivePriceTable(
        priceTables,
        exams,
        input.order_date,
        vet?.clinic_name,
        resolvedTableId
      );

      resolvedTableId = pricing.activeTable?.id || null;
      resolvedTableName = pricing.activeTable?.name || 'Tabela Geral VetLife 2026';
      totalAmount = 0;
      resultsPayload = [];

      for (const examId of input.exam_ids) {
        const exam = exams.find((e) => e.id === examId || e.code === examId);
        if (!exam) {
          throw new NotFoundError(`Exame '${examId}' não encontrado no catálogo.`);
        }
        const prev = (existing.results || []).find((r) => r.exam_id === exam.id);
        const appliedPrice = Number(pricing.priceByExamId[exam.id] ?? exam.base_price ?? 68);
        totalAmount += appliedPrice;

        const matchedRefs = this.referenceResolver.resolveReferencesForPatient(
          allRefs,
          exam.id,
          patient.species,
          patient.gender,
          patient.age_days || 365
        );

        resultsPayload.push({
          exam_id: exam.id,
          applied_price: appliedPrice,
          dynamic_content: prev?.dynamic_content || {},
          reference_snapshot:
            prev?.reference_snapshot ||
            this.referenceResolver.buildReferenceSnapshotText(matchedRefs),
          attachments: prev?.attachments || [],
          pdf_url: prev?.pdf_url || null,
          released_at: prev?.released_at || null,
          released_by: prev?.released_by || null,
        });
      }
    }

    return this.repo.updateOrder(
      orderId,
      {
        patient_id: patient.id,
        vet_id: vet?.id || existing.vet_id,
        price_table_id: resolvedTableId,
        price_table_name: resolvedTableName,
        total_amount: Number(totalAmount.toFixed(2)),
        ...(input.status ? { status: input.status } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      resultsPayload
    );
  }

  public async deleteOrder(orderId: string): Promise<void> {
    return this.repo.deleteOrder(orderId);
  }

  public async generateOrderLabels(orderId: string): Promise<{
    order_id: string;
    protocol_code: string;
    total_labels: number;
    labels: SampleLabel[];
  }> {
    const order = await this.getOrderById(orderId);
    const labels: SampleLabel[] = [];

    for (const result of order.results || []) {
      const exam = result.exam;
      if (!exam) continue;
      const qty = Math.max(1, Number(exam.label_qty || 1));

      for (let i = 1; i <= qty; i++) {
        labels.push({
          label_id: `${order.protocol_code}-${exam.code}-${i}`,
          protocol_code: order.protocol_code,
          barcode_value: `${order.protocol_code.replace(/-/g, '')}${exam.code.replace(
            /-/g,
            ''
          )}${i}`,
          patient_name: order.patient?.name || 'Animal',
          species: order.patient?.species || 'Canino',
          tutor_name: order.patient?.tutor_name || 'Tutor',
          vet_name: order.vet?.name || 'Veterinário',
          exam_code: exam.code,
          exam_name: exam.name,
          section: exam.section,
          material: exam.material || exam.tube_type,
          tube_type: exam.tube_type,
          label_index: i,
          total_labels_for_exam: qty,
          created_at: order.created_at,
        });
      }
    }

    return {
      order_id: order.id,
      protocol_code: order.protocol_code,
      total_labels: labels.length,
      labels,
    };
  }

  // ===========================================================================
  // RESULTS & REPORT RELEASE (HU-07, HU-08, HU-09, RN-03)
  // ===========================================================================
  public async saveExamResult(
    orderId: string,
    resultId: string,
    input: {
      dynamic_content?: Record<string, string | number | boolean>;
      attachments?: Array<Partial<ReportAttachment>>;
      reference_snapshot?: string;
      notes?: string;
    }
  ): Promise<Order> {
    const order = await this.getOrderById(orderId);

    let normalizedAttachments: ReportAttachment[] | undefined;
    if (input.attachments) {
      normalizedAttachments = input.attachments.map((att) => ({
        id: att.id || `att-${randomUUID().slice(0, 8)}`,
        name: att.name || 'Exame_Complementar.pdf',
        type: att.type || 'pdf',
        url:
          att.url ||
          `https://vetlifelab.com.br/laudos/anexos/${order.protocol_code}-${
            att.name || 'anexo.pdf'
          }`,
        uploaded_at: att.uploaded_at || new Date().toISOString(),
      }));
    }

    await this.repo.updateExamResult(order.id, resultId, {
      dynamic_content: input.dynamic_content,
      attachments: normalizedAttachments,
      reference_snapshot: input.reference_snapshot,
    });

    if (order.status === 'pendente') {
      await this.repo.updateOrderStatus(order.id, 'em_analise', input.notes);
    } else if (input.notes !== undefined) {
      await this.repo.updateOrderStatus(order.id, order.status, input.notes);
    }

    return this.getOrderById(order.id);
  }

  public async releaseOrderReport(
    orderId: string,
    releasedByUserId?: string,
    notes?: string,
    resultId?: string,
    fallbackOrigin = 'https://vetlifelab.com.br'
  ): Promise<Order> {
    const order = await this.getOrderById(orderId);
    const nowIso = new Date().toISOString();

    for (const res of order.results || []) {
      if (resultId && res.id !== resultId) continue;
      const examCode = (res.exam?.code || 'EXM').replace(/[^a-zA-Z0-9_-]/g, '');
      const examPdfBuffer = buildOrderPdfBuffer(order, res.id);
      const uploadedExam = await uploadPdfToVercelBlob(
        `laudos/${order.protocol_code}/exame-${examCode}-${res.id}.pdf`,
        examPdfBuffer,
        fallbackOrigin
      );
      await this.repo.updateExamResult(order.id, res.id, {
        released_at: nowIso,
        released_by: releasedByUserId || 'usr-biomed-001',
        pdf_url: uploadedExam.url,
      });
    }

    const refreshed = await this.getOrderById(order.id);
    const allReleased =
      (refreshed.results || []).length > 0 &&
      (refreshed.results || []).every((r) => Boolean(r.released_at));

    if (allReleased) {
      const fullPdfBuffer = buildOrderPdfBuffer(refreshed);
      const uploadedFull = await uploadPdfToVercelBlob(
        `laudos/${refreshed.protocol_code}/laudo-completo-${refreshed.protocol_code}.pdf`,
        fullPdfBuffer,
        fallbackOrigin
      );
      return this.repo.updateOrderStatus(order.id, 'concluido', notes, uploadedFull.url);
    }

    return this.repo.updateOrderStatus(order.id, 'em_analise', notes);
  }

  public async publishOrderPdf(
    orderId: string,
    fallbackOrigin: string,
    orderSnapshot?: Order
  ): Promise<{
    pdf_url: string;
    exam_pdfs: Array<{ result_id: string; pdf_url: string }>;
    order?: Order;
  }> {
    let order: Order | null = null;
    try {
      order = await this.getOrderById(orderId);
    } catch {
      order = orderSnapshot || null;
    }

    if (!order) {
      throw new NotFoundError(`Atendimento '${orderId}' não encontrado.`);
    }

    const examPdfs: Array<{ result_id: string; pdf_url: string }> = [];
    for (const res of order.results || []) {
      const examCode = (res.exam?.code || (res as any).exam_code || 'EXM').replace(
        /[^a-zA-Z0-9_-]/g,
        ''
      );
      const examPdfBuffer = buildOrderPdfBuffer(order, res.id);
      const uploadedExam = await uploadPdfToVercelBlob(
        `laudos/${order.protocol_code}/exame-${examCode}-${res.id}.pdf`,
        examPdfBuffer,
        fallbackOrigin
      );
      examPdfs.push({ result_id: res.id, pdf_url: uploadedExam.url });

      try {
        await this.repo.updateExamResult(order.id, res.id, {
          pdf_url: uploadedExam.url,
        });
      } catch {
        // orderSnapshot apenas em memória local do frontend
      }
    }

    const fullPdfBuffer = buildOrderPdfBuffer(order);
    const uploadedFull = await uploadPdfToVercelBlob(
      `laudos/${order.protocol_code}/laudo-completo-${order.protocol_code}.pdf`,
      fullPdfBuffer,
      fallbackOrigin
    );

    let updatedOrder = order;
    try {
      updatedOrder = await this.repo.updateOrderStatus(
        order.id,
        order.status,
        order.notes,
        uploadedFull.url
      );
    } catch {
      updatedOrder = { ...order, pdf_url: uploadedFull.url };
    }

    return {
      pdf_url: uploadedFull.url,
      exam_pdfs: examPdfs,
      order: updatedOrder,
    };
  }
}
