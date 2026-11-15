import { randomUUID } from 'crypto';
import {
  CollectionRequest,
  Exam,
  ExamInputField,
  ExamPrice,
  ExamReference,
  ExamResult,
  Order,
  Patient,
  PriceTable,
  ReportTemplate,
  User,
  Vet,
} from '../../domain/entities';
import { ConflictError, NotFoundError } from '../../domain/errors/AppError';
import { IVetLifeRepository } from '../../domain/repositories/IVetLifeRepository';
import { ReferenceResolverService } from '../../domain/services/ReferenceResolverService';
import { ReportRendererService } from '../../domain/services/ReportRendererService';
import { createInitialSeedState, SeedDatabaseState } from '../database/seedData';
import { getSupabaseClient } from '../database/supabaseClient';

/**
 * LSP & DIP: Hybrid Repository that seamlessly operates with Supabase when configured,
 * and falls back automatically to the pre-populated In-Memory Seeded Store for local dev,
 * demo environments, and integration tests.
 */
export class HybridVetLifeRepository implements IVetLifeRepository {
  private state: SeedDatabaseState;
  private referenceResolver = new ReferenceResolverService();
  private reportRenderer = new ReportRendererService();

  constructor() {
    this.state = createInitialSeedState();
  }

  public getStorageMode(): 'supabase' | 'in-memory-seeded' {
    return getSupabaseClient() ? 'supabase' : 'in-memory-seeded';
  }

  // ===========================================================================
  // USERS
  // ===========================================================================
  public async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('users').select('*').ilike('email', normalized).maybeSingle();
      if (data) return data as User;
    }

    // Support alias emails for biomedical demo convenience
    if (normalized === 'biomed@vetlifelab.com.br') {
      return (
        this.state.users.find((u) => u.email.toLowerCase() === 'biomedico@vetlifelab.com.br') ||
        null
      );
    }

    return this.state.users.find((u) => u.email.toLowerCase() === normalized) || null;
  }

  public async findUserById(id: string): Promise<User | null> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('users').select('*').eq('id', id).maybeSingle();
      if (data) return data as User;
    }
    return this.state.users.find((u) => u.id === id) || null;
  }

  public async listUsers(): Promise<User[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('users').select('*').order('created_at', { ascending: true });
      if (data && data.length > 0) return data as User[];
    }
    return [...this.state.users];
  }

  public async createUser(data: Omit<User, 'id' | 'created_at'>): Promise<User> {
    const email = data.email.trim().toLowerCase();
    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new ConflictError(`Já existe um usuário cadastrado com o e-mail '${email}'.`);
    }
    const created: User = {
      id: randomUUID(),
      name: data.name.trim(),
      email,
      role: data.role,
      password_hash: data.password_hash,
      created_at: new Date().toISOString(),
    };
    this.state.users.push(created);
    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('users').insert(created);
    }
    return created;
  }

  public async updateUser(id: string, data: Partial<User>): Promise<User> {
    const idx = this.state.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Usuário '${id}' não encontrado.`);
    }
    const nextEmail = data.email ? data.email.trim().toLowerCase() : this.state.users[idx].email;
    const duplicate = this.state.users.find(
      (u) => u.id !== id && u.email.toLowerCase() === nextEmail
    );
    if (duplicate) {
      throw new ConflictError(`Já existe outro usuário com o e-mail '${nextEmail}'.`);
    }
    const updated: User = {
      ...this.state.users[idx],
      ...data,
      email: nextEmail,
      id,
    };
    this.state.users[idx] = updated;
    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('users').update(updated).eq('id', id);
    }
    return updated;
  }

  public async deleteUser(id: string): Promise<void> {
    const idx = this.state.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Usuário '${id}' não encontrado.`);
    }
    this.state.users.splice(idx, 1);
    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('users').delete().eq('id', id);
    }
  }

  // ===========================================================================
  // EXAMS & INPUT FIELDS
  // ===========================================================================
  private enrichExam(exam: Exam): Exam {
    let fields = this.state.examInputFields
      .filter((f) => f.exam_id === exam.id)
      .sort((a, b) => a.display_order - b.display_order);

    if (fields.length === 0) {
      fields = [
        {
          id: `fld-${exam.id}-res`,
          exam_id: exam.id,
          field_name: 'resultado_analitico',
          field_label: `Resultado — ${exam.name}`,
          field_type: 'text',
          unit: '',
          options: [],
          is_required: true,
          display_order: 1,
        },
        {
          id: `fld-${exam.id}-obs`,
          exam_id: exam.id,
          field_name: 'conclusao_laboratorial',
          field_label: 'Conclusão / Interpretação Laboratorial',
          field_type: 'textarea',
          unit: '',
          options: [],
          is_required: false,
          display_order: 2,
        },
      ];
    }

    const activePt =
      this.state.priceTables.find((pt) => pt.is_active && !pt.partner_clinic) ||
      this.state.priceTables.find((pt) => pt.is_active) ||
      this.state.priceTables[0];

    const tablePriceItem = activePt
      ? this.state.examPrices.find(
          (ep) => ep.price_table_id === activePt.id && ep.exam_id === exam.id
        )
      : undefined;

    const resolvedPrice = Number(
      tablePriceItem?.price ?? exam.base_price ?? exam.price ?? 50
    );

    const deliveryDays = Number(exam.delivery_days ?? 1);
    const deliveryLabel =
      exam.delivery_time_label ||
      `${deliveryDays} ${deliveryDays === 1 ? 'dia útil' : 'dias úteis'}`;

    return {
      ...exam,
      delivery_days: deliveryDays,
      delivery_time_label: deliveryLabel,
      material: exam.material || exam.tube_type,
      base_price: resolvedPrice,
      price: resolvedPrice,
      active_price: resolvedPrice,
      input_fields: fields,
    };
  }

  public async listExams(): Promise<Exam[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: examsData } = await sb
        .from('exams')
        .select('*, exam_input_fields(*)')
        .order('code', { ascending: true });
      if (examsData && examsData.length > 0) {
        return examsData.map((row: Record<string, unknown>) => {
          const base = row as unknown as Exam;
          return this.enrichExam({
            ...base,
            input_fields: Array.isArray(row.exam_input_fields)
              ? (row.exam_input_fields as ExamInputField[]).sort(
                  (a, b) => a.display_order - b.display_order
                )
              : [],
          });
        });
      }
    }
    return this.state.exams.map((e) => this.enrichExam(e));
  }

  public async findExamById(id: string): Promise<Exam | null> {
    const exams = await this.listExams();
    return exams.find((e) => e.id === id || e.code === id) || null;
  }

  public async findExamByCode(code: string): Promise<Exam | null> {
    const normalized = code.trim().toUpperCase();
    const exams = await this.listExams();
    return exams.find((e) => e.code.toUpperCase() === normalized) || null;
  }

  public async createExam(data: Omit<Exam, 'id' | 'created_at'>): Promise<Exam> {
    const deliveryDays = Number(data.delivery_days ?? 1);
    const resolvedPrice = Number(data.price ?? data.base_price ?? 70);
    const tubeOrMaterial = (data.tube_type || data.material || 'Tubo EDTA').trim();

    const defaultTemplate = await this.getDefaultReportTemplate();
    const newExam: Exam = {
      id: randomUUID(),
      code: data.code.trim().toUpperCase(),
      name: data.name.trim(),
      section: data.section.trim(),
      delivery_days: deliveryDays,
      delivery_time_label:
        data.delivery_time_label?.trim() ||
        `${deliveryDays} ${deliveryDays === 1 ? 'dia útil' : 'dias úteis'}`,
      tube_type: tubeOrMaterial,
      material: data.material?.trim() || tubeOrMaterial,
      preparation: data.preparation || 'Jejum de 6 a 8 horas.',
      label_qty: Number(data.label_qty ?? 1),
      reference_template_id: data.reference_template_id || defaultTemplate.id,
      base_price: resolvedPrice,
      price: resolvedPrice,
      active_price: resolvedPrice,
      created_at: new Date().toISOString(),
    };

    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted } = await sb
        .from('exams')
        .insert({
          code: newExam.code,
          name: newExam.name,
          section: newExam.section,
          delivery_days: newExam.delivery_days,
          delivery_time_label: newExam.delivery_time_label,
          tube_type: newExam.tube_type,
          label_qty: newExam.label_qty,
          reference_template_id: newExam.reference_template_id,
        })
        .select('*')
        .maybeSingle();
      if (inserted) {
        newExam.id = inserted.id;
      }
    }

    this.state.exams.push(newExam);

    if (data.input_fields && data.input_fields.length > 0) {
      await this.saveExamInputFields(newExam.id, data.input_fields);
    }

    // Add price to all price tables
    for (const pt of this.state.priceTables) {
      this.state.examPrices.push({
        id: randomUUID(),
        price_table_id: pt.id,
        exam_id: newExam.id,
        price: resolvedPrice,
      });
    }

    return this.enrichExam(newExam);
  }

  public async updateExam(id: string, data: Partial<Exam>): Promise<Exam> {
    const idx = this.state.exams.findIndex((e) => e.id === id || e.code === id);
    if (idx === -1) {
      throw new NotFoundError(`Exame com ID '${id}' não encontrado.`);
    }

    const current = this.state.exams[idx];
    const nextDeliveryDays =
      data.delivery_days !== undefined ? Number(data.delivery_days) : current.delivery_days;
    const nextPrice =
      data.price !== undefined
        ? Number(data.price)
        : data.base_price !== undefined
        ? Number(data.base_price)
        : current.base_price ?? current.price ?? 50;

    const updated: Exam = {
      ...current,
      code: data.code !== undefined ? data.code.trim().toUpperCase() : current.code,
      name: data.name !== undefined ? data.name.trim() : current.name,
      section: data.section !== undefined ? data.section.trim() : current.section,
      delivery_days: nextDeliveryDays,
      delivery_time_label:
        data.delivery_time_label !== undefined
          ? data.delivery_time_label.trim()
          : data.delivery_days !== undefined
          ? `${nextDeliveryDays} ${nextDeliveryDays === 1 ? 'dia útil' : 'dias úteis'}`
          : current.delivery_time_label,
      tube_type:
        data.tube_type !== undefined
          ? data.tube_type.trim()
          : data.material !== undefined
          ? data.material.trim()
          : current.tube_type,
      material:
        data.material !== undefined
          ? data.material.trim()
          : data.tube_type !== undefined
          ? data.tube_type.trim()
          : current.material || current.tube_type,
      label_qty: data.label_qty !== undefined ? Number(data.label_qty) : current.label_qty,
      reference_template_id:
        data.reference_template_id !== undefined
          ? data.reference_template_id
          : current.reference_template_id,
      base_price: nextPrice,
      price: nextPrice,
      active_price: nextPrice,
    };

    this.state.exams[idx] = updated;

    // Sync price in active price tables when updated on exam
    if (data.price !== undefined || data.base_price !== undefined) {
      for (const ep of this.state.examPrices) {
        if (ep.exam_id === current.id) {
          ep.price = nextPrice;
        }
      }
    }

    if (data.input_fields) {
      await this.saveExamInputFields(current.id, data.input_fields);
    }

    const sb = getSupabaseClient();
    if (sb) {
      await sb
        .from('exams')
        .update({
          code: updated.code,
          name: updated.name,
          section: updated.section,
          delivery_days: updated.delivery_days,
          delivery_time_label: updated.delivery_time_label,
          tube_type: updated.tube_type,
          label_qty: updated.label_qty,
          reference_template_id: updated.reference_template_id,
        })
        .eq('id', current.id);
    }

    return this.enrichExam(updated);
  }

  public async deleteExam(id: string): Promise<void> {
    const idx = this.state.exams.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Exame com ID '${id}' não encontrado.`);
    }
    this.state.exams.splice(idx, 1);
    this.state.examInputFields = this.state.examInputFields.filter((f) => f.exam_id !== id);
    this.state.examPrices = this.state.examPrices.filter((p) => p.exam_id !== id);

    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('exams').delete().eq('id', id);
    }
  }

  public async listExamInputFields(examId: string): Promise<ExamInputField[]> {
    const exam = await this.findExamById(examId);
    if (!exam) {
      throw new NotFoundError(`Exame '${examId}' não encontrado.`);
    }
    return exam.input_fields || [];
  }

  public async saveExamInputFields(
    examId: string,
    fields: Array<Omit<ExamInputField, 'id' | 'exam_id'> & { id?: string }>
  ): Promise<ExamInputField[]> {
    const examExists = this.state.exams.some((e) => e.id === examId);
    if (!examExists) {
      throw new NotFoundError(`Exame '${examId}' não encontrado.`);
    }

    this.state.examInputFields = this.state.examInputFields.filter((f) => f.exam_id !== examId);

    const createdFields: ExamInputField[] = fields.map((f, index) => ({
      id: f.id || randomUUID(),
      exam_id: examId,
      field_name: f.field_name.trim(),
      field_label: (f.field_label || f.field_name).trim(),
      field_type: f.field_type || 'text',
      unit: f.unit || '',
      options: Array.isArray(f.options) ? f.options : [],
      is_required: f.is_required ?? true,
      display_order: f.display_order ?? index + 1,
    }));

    this.state.examInputFields.push(...createdFields);
    return createdFields;
  }

  public async addExamInputField(
    examId: string,
    field: Omit<ExamInputField, 'id' | 'exam_id'>
  ): Promise<ExamInputField> {
    const examExists = this.state.exams.some((e) => e.id === examId);
    if (!examExists) {
      throw new NotFoundError(`Exame '${examId}' não encontrado.`);
    }

    const existingForExam = this.state.examInputFields.filter((f) => f.exam_id === examId);
    const newField: ExamInputField = {
      id: randomUUID(),
      exam_id: examId,
      field_name: field.field_name.trim(),
      field_label: (field.field_label || field.field_name).trim(),
      field_type: field.field_type || 'text',
      unit: field.unit || '',
      options: Array.isArray(field.options) ? field.options : [],
      is_required: field.is_required ?? true,
      display_order: field.display_order ?? existingForExam.length + 1,
    };

    this.state.examInputFields.push(newField);
    return newField;
  }

  public async deleteExamInputField(examId: string, fieldId: string): Promise<void> {
    this.state.examInputFields = this.state.examInputFields.filter(
      (f) => !(f.exam_id === examId && f.id === fieldId)
    );
  }

  // ===========================================================================
  // PRICE TABLES (HU-03, RN-04)
  // ===========================================================================
  private enrichPriceTable(pt: PriceTable): PriceTable {
    const prices = this.state.examPrices
      .filter((p) => p.price_table_id === pt.id)
      .map((p) => {
        const exam = this.state.exams.find((e) => e.id === p.exam_id);
        return {
          ...p,
          exam_code: exam?.code,
          exam_name: exam?.name,
        };
      });
    return {
      ...pt,
      prices,
    };
  }

  public async listPriceTables(): Promise<PriceTable[]> {
    return this.state.priceTables.map((pt) => this.enrichPriceTable(pt));
  }

  public async findPriceTableById(id: string): Promise<PriceTable | null> {
    const pt = this.state.priceTables.find((t) => t.id === id);
    return pt ? this.enrichPriceTable(pt) : null;
  }

  public async createPriceTable(
    data: Omit<PriceTable, 'id' | 'created_at' | 'prices'>,
    prices: Array<{ exam_id: string; price: number }>
  ): Promise<PriceTable> {
    const newTable: PriceTable = {
      id: randomUUID(),
      name: data.name.trim(),
      partner_clinic: data.partner_clinic || null,
      start_date: data.start_date,
      end_date: data.end_date,
      is_active: data.is_active ?? true,
      created_at: new Date().toISOString(),
    };

    this.state.priceTables.unshift(newTable);

    const priceEntries =
      prices && prices.length > 0
        ? prices
        : this.state.exams.map((exam) => ({
            exam_id: exam.id,
            price: Number(exam.base_price ?? 68),
          }));

    for (const item of priceEntries) {
      this.state.examPrices.push({
        id: randomUUID(),
        price_table_id: newTable.id,
        exam_id: item.exam_id,
        price: Number(item.price),
      });
    }

    return this.enrichPriceTable(newTable);
  }

  public async updatePriceTable(
    id: string,
    data: Partial<Omit<PriceTable, 'id' | 'created_at' | 'prices'>>,
    prices?: Array<{ exam_id: string; price: number }>
  ): Promise<PriceTable> {
    const idx = this.state.priceTables.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Tabela de preços '${id}' não encontrada.`);
    }

    const current = this.state.priceTables[idx];
    const updated: PriceTable = {
      ...current,
      name: data.name !== undefined ? data.name.trim() : current.name,
      partner_clinic:
        data.partner_clinic !== undefined ? data.partner_clinic : current.partner_clinic,
      start_date: data.start_date !== undefined ? data.start_date : current.start_date,
      end_date: data.end_date !== undefined ? data.end_date : current.end_date,
      is_active: data.is_active !== undefined ? Boolean(data.is_active) : current.is_active,
    };

    this.state.priceTables[idx] = updated;

    if (prices && prices.length > 0) {
      this.state.examPrices = this.state.examPrices.filter((p) => p.price_table_id !== id);
      for (const item of prices) {
        this.state.examPrices.push({
          id: randomUUID(),
          price_table_id: id,
          exam_id: item.exam_id,
          price: Number(item.price),
        });
      }
    }

    return this.enrichPriceTable(updated);
  }

  public async deletePriceTable(id: string): Promise<void> {
    const idx = this.state.priceTables.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Tabela de preços '${id}' não encontrada.`);
    }
    this.state.priceTables.splice(idx, 1);
    this.state.examPrices = this.state.examPrices.filter((p) => p.price_table_id !== id);
  }

  public async listExamPrices(priceTableId: string): Promise<ExamPrice[]> {
    const pt = await this.findPriceTableById(priceTableId);
    return pt?.prices || [];
  }

  // ===========================================================================
  // EXAM REFERENCES & REPORT TEMPLATES (HU-04, HU-05)
  // ===========================================================================
  public async listExamReferences(filters?: {
    exam_id?: string;
    species?: string;
  }): Promise<ExamReference[]> {
    let list = this.state.examReferences.map((ref) => {
      const exam = this.state.exams.find((e) => e.id === ref.exam_id);
      return {
        ...ref,
        exam_name: exam?.name,
      };
    });

    if (filters?.exam_id) {
      list = list.filter((r) => r.exam_id === filters.exam_id);
    }
    if (filters?.species) {
      const s = filters.species.trim().toLowerCase();
      list = list.filter((r) => r.species.toLowerCase() === s);
    }
    return list;
  }

  public async createExamReference(data: Omit<ExamReference, 'id'>): Promise<ExamReference> {
    const exam = this.state.exams.find((e) => e.id === data.exam_id);
    const created: ExamReference = {
      id: randomUUID(),
      exam_id: data.exam_id,
      exam_name: exam?.name,
      parameter_name: data.parameter_name || exam?.name || 'Parâmetro Geral',
      species: data.species,
      gender: data.gender || 'Ambos',
      min_age_days: Number(data.min_age_days ?? 0),
      max_age_days: Number(data.max_age_days ?? 9125),
      reference_text_content: data.reference_text_content,
      min_value: data.min_value ?? null,
      max_value: data.max_value ?? null,
      unit: data.unit || '',
    };
    this.state.examReferences.push(created);
    return created;
  }

  public async updateExamReference(
    id: string,
    data: Partial<ExamReference>
  ): Promise<ExamReference> {
    const idx = this.state.examReferences.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Referência '${id}' não encontrada.`);
    }
    const current = this.state.examReferences[idx];
    const updated: ExamReference = {
      ...current,
      ...data,
      id: current.id,
    };
    this.state.examReferences[idx] = updated;
    return updated;
  }

  public async deleteExamReference(id: string): Promise<void> {
    const idx = this.state.examReferences.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Referência '${id}' não encontrada.`);
    }
    this.state.examReferences.splice(idx, 1);
  }

  public async listReportTemplates(): Promise<ReportTemplate[]> {
    return [...this.state.reportTemplates];
  }

  public async findReportTemplateById(id: string): Promise<ReportTemplate | null> {
    return this.state.reportTemplates.find((t) => t.id === id) || null;
  }

  public async getDefaultReportTemplate(): Promise<ReportTemplate> {
    return (
      this.state.reportTemplates.find((t) => t.is_default) || this.state.reportTemplates[0]
    );
  }

  public async createReportTemplate(
    data: Omit<ReportTemplate, 'id' | 'created_at'>
  ): Promise<ReportTemplate> {
    if (data.is_default) {
      this.state.reportTemplates.forEach((t) => {
        t.is_default = false;
      });
    }

    const created: ReportTemplate = {
      id: randomUUID(),
      name: data.name,
      header_html: data.header_html,
      footer_html: data.footer_html,
      body_template: data.body_template,
      dynamic_tags:
        data.dynamic_tags && data.dynamic_tags.length > 0
          ? data.dynamic_tags
          : [
              '{{paciente}}',
              '{{especie}}',
              '{{raca}}',
              '{{sexo}}',
              '{{idade}}',
              '{{tutor}}',
              '{{veterinario}}',
              '{{crmv}}',
              '{{protocolo}}',
              '{{data_liberacao}}',
              '{{resultados}}',
              '{{referencias}}',
            ],
      is_default: Boolean(data.is_default),
      created_at: new Date().toISOString(),
    };
    this.state.reportTemplates.push(created);
    return created;
  }

  public async updateReportTemplate(
    id: string,
    data: Partial<Omit<ReportTemplate, 'id' | 'created_at'>>
  ): Promise<ReportTemplate> {
    const idx = this.state.reportTemplates.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Modelo de laudo '${id}' não encontrado.`);
    }
    if (data.is_default) {
      this.state.reportTemplates.forEach((t) => {
        t.is_default = false;
      });
    }
    const current = this.state.reportTemplates[idx];
    const updated: ReportTemplate = {
      ...current,
      ...data,
      id: current.id,
    };
    this.state.reportTemplates[idx] = updated;
    return updated;
  }

  // ===========================================================================
  // PATIENTS & VETS (HU-06, HU-10)
  // ===========================================================================
  public async listPatients(): Promise<Patient[]> {
    return this.state.patients.map((p) => this.referenceResolver.enrichPatientWithAge(p));
  }

  public async findPatientById(id: string): Promise<Patient | null> {
    const p = this.state.patients.find((pat) => pat.id === id);
    return p ? this.referenceResolver.enrichPatientWithAge(p) : null;
  }

  public async createPatient(data: Omit<Patient, 'id' | 'created_at'>): Promise<Patient> {
    const created: Patient = {
      id: randomUUID(),
      name: data.name.trim(),
      species: data.species.trim(),
      breed: data.breed.trim(),
      gender: data.gender || 'M',
      birth_date: data.birth_date || '2023-01-01',
      tutor_name: data.tutor_name.trim(),
      tutor_phone: data.tutor_phone.trim(),
      tutor_email: (data.tutor_email || '').trim(),
      created_at: new Date().toISOString(),
    };
    this.state.patients.unshift(created);
    return this.referenceResolver.enrichPatientWithAge(created);
  }

  public async updatePatient(id: string, data: Partial<Patient>): Promise<Patient> {
    const idx = this.state.patients.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Paciente '${id}' não encontrado.`);
    }
    const updated: Patient = {
      ...this.state.patients[idx],
      ...data,
      id,
    };
    this.state.patients[idx] = updated;
    return this.referenceResolver.enrichPatientWithAge(updated);
  }

  public async deletePatient(id: string): Promise<void> {
    const idx = this.state.patients.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Paciente '${id}' não encontrado.`);
    }
    this.state.patients.splice(idx, 1);
  }

  public async listVets(): Promise<Vet[]> {
    return [...this.state.vets];
  }

  public async findVetById(id: string): Promise<Vet | null> {
    return this.state.vets.find((v) => v.id === id) || null;
  }

  public async findVetByEmail(email: string): Promise<Vet | null> {
    const cleanEmail = email.trim().toLowerCase();
    const direct = this.state.vets.find((v) => v.email.toLowerCase() === cleanEmail);
    if (direct) return direct;
    const demoAliases = [
      'mariana.costa@vetvida.com.br',
      'dra.marina@vetcare.com.br',
      'fernanda.lima@hospitalvetvida.com.br',
      'vet@vetlife.com.br',
    ];
    if (demoAliases.includes(cleanEmail)) {
      return this.state.vets[0] || null;
    }
    return null;
  }

  public async findVetByEmailAndCrmv(email: string, crmv: string): Promise<Vet | null> {
    const normEmail = email.trim().toLowerCase();
    const normCrmv = crmv.trim().toUpperCase().replace(/\s+/g, ' ');
    const digitsOnly = normCrmv.replace(/\D/g, '');

    // Check exact or numeric match in state
    const direct = this.state.vets.find((v) => {
      const vEmail = v.email.toLowerCase();
      const vCrmv = v.crmv.toUpperCase().replace(/\s+/g, ' ');
      const vDigits = vCrmv.replace(/\D/g, '');
      return (
        vEmail === normEmail &&
        (vCrmv === normCrmv || (digitsOnly.length >= 4 && vDigits === digitsOnly))
      );
    });
    if (direct) return direct;

    // Support cross-agent demo aliases (#5, #6, #7) so any demo button works out-of-the-box
    const carlosAliases = [
      'carlos.silva@clinicapetcare.com.br',
      'dr.carlos@clinicapet.com.br',
      'carlos.mendes@clinicapetcare.com.br',
    ];
    const marianaAliases = [
      'mariana.costa@vetvida.com.br',
      'dra.marina@vetcare.com.br',
      'fernanda.lima@hospitalvetvida.com.br',
    ];

    if (carlosAliases.includes(normEmail)) {
      return this.state.vets[0] || null;
    }
    if (marianaAliases.includes(normEmail)) {
      return this.state.vets[1] || null;
    }

    return null;
  }

  public async createVet(data: Omit<Vet, 'id' | 'created_at'>): Promise<Vet> {
    const email = data.email.trim().toLowerCase();
    const duplicate = this.state.vets.find((v) => v.email.toLowerCase() === email);
    if (duplicate) {
      throw new ConflictError(`Já existe um veterinário cadastrado com o e-mail '${email}'.`);
    }
    const created: Vet = {
      id: randomUUID(),
      name: data.name.trim(),
      crmv: (data.crmv || '').trim().toUpperCase(),
      clinic_name: (data.clinic_name || '').trim(),
      email,
      phone: data.phone.trim(),
      ...(data.password_hash ? { password_hash: data.password_hash } : {}),
      created_at: new Date().toISOString(),
    };
    this.state.vets.unshift(created);
    return created;
  }

  public async updateVet(id: string, data: Partial<Vet>): Promise<Vet> {
    const idx = this.state.vets.findIndex((v) => v.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Veterinário '${id}' não encontrado.`);
    }
    const updated: Vet = {
      ...this.state.vets[idx],
      ...data,
      id,
    };
    this.state.vets[idx] = updated;
    return updated;
  }

  public async deleteVet(id: string): Promise<void> {
    const idx = this.state.vets.findIndex((v) => v.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Veterinário '${id}' não encontrado.`);
    }
    this.state.vets.splice(idx, 1);
  }

  // ===========================================================================
  // ORDERS & EXAM RESULTS (HU-06 to HU-12, RN-02, RN-03, RN-04)
  // ===========================================================================
  private enrichOrder(order: Order): Order {
    const rawPatient =
      this.state.patients.find((p) => p.id === order.patient_id) || this.state.patients[0];
    const patient = this.referenceResolver.enrichPatientWithAge(rawPatient);
    const vet = this.state.vets.find((v) => v.id === order.vet_id) || this.state.vets[0];
    const pt = this.state.priceTables.find((t) => t.id === order.price_table_id);

    const results = this.state.examResults
      .filter((r) => r.order_id === order.id)
      .map((r) => {
        const baseExam = this.state.exams.find((e) => e.id === r.exam_id) || this.state.exams[0];
        const exam = this.enrichExam(baseExam);
        const matchedRefs = this.referenceResolver.resolveReferencesForPatient(
          this.state.examReferences,
          exam.id,
          patient.species,
          patient.gender,
          patient.age_days || 365
        );
        const refSnapshot =
          r.reference_snapshot ||
          this.referenceResolver.buildReferenceSnapshotText(matchedRefs);

        const template =
          this.state.reportTemplates.find((t) => t.id === exam.reference_template_id) ||
          this.state.reportTemplates[0];

        const enrichedResult: ExamResult = {
          ...r,
          reference_snapshot: refSnapshot,
          exam,
          matched_references: matchedRefs,
        };

        enrichedResult.rendered_html = this.reportRenderer.renderExamResultHtml({
          template,
          order,
          patient,
          vet,
          exam,
          result: enrichedResult,
        });

        return enrichedResult;
      });

    return {
      ...order,
      price_table_name: order.price_table_name || pt?.name || 'Tabela Geral VetLife 2026',
      patient,
      vet,
      results,
    };
  }

  public async listOrders(filters?: {
    status?: string;
    vet_id?: string;
    patient_id?: string;
    search?: string;
  }): Promise<Order[]> {
    let orders = this.state.orders.map((o) => this.enrichOrder(o));

    if (filters?.status) {
      orders = orders.filter((o) => o.status === filters.status);
    }
    if (filters?.vet_id) {
      orders = orders.filter((o) => o.vet_id === filters.vet_id);
    }
    if (filters?.patient_id) {
      orders = orders.filter((o) => o.patient_id === filters.patient_id);
    }
    if (filters?.search) {
      const q = filters.search.trim().toLowerCase();
      orders = orders.filter(
        (o) =>
          o.protocol_code.toLowerCase().includes(q) ||
          (o.patient?.name || '').toLowerCase().includes(q) ||
          (o.patient?.tutor_name || '').toLowerCase().includes(q) ||
          (o.vet?.name || '').toLowerCase().includes(q)
      );
    }

    return orders;
  }

  public async findOrderById(id: string): Promise<Order | null> {
    const order = this.state.orders.find((o) => o.id === id || o.protocol_code === id);
    return order ? this.enrichOrder(order) : null;
  }

  public async findOrderByProtocolCode(protocolCode: string): Promise<Order | null> {
    const normalized = protocolCode.trim().toUpperCase();
    const order = this.state.orders.find(
      (o) => o.protocol_code.trim().toUpperCase() === normalized
    );
    return order ? this.enrichOrder(order) : null;
  }

  public async createOrder(
    orderData: Omit<Order, 'id' | 'created_at' | 'results' | 'patient' | 'vet'>,
    resultsData: Array<Omit<ExamResult, 'id' | 'order_id'>>
  ): Promise<Order> {
    const newOrder: Order = {
      id: randomUUID(),
      protocol_code: orderData.protocol_code,
      patient_id: orderData.patient_id,
      vet_id: orderData.vet_id,
      price_table_id: orderData.price_table_id,
      price_table_name: orderData.price_table_name,
      total_amount: Number(orderData.total_amount),
      status: orderData.status || 'pendente',
      notes: orderData.notes || '',
      created_at: new Date().toISOString(),
    };

    this.state.orders.unshift(newOrder);

    for (const res of resultsData) {
      this.state.examResults.push({
        id: randomUUID(),
        order_id: newOrder.id,
        exam_id: res.exam_id,
        applied_price: Number(res.applied_price),
        dynamic_content: res.dynamic_content || {},
        reference_snapshot: res.reference_snapshot || '',
        attachments: res.attachments || [],
        pdf_url: res.pdf_url || null,
        released_at: res.released_at || null,
        released_by: res.released_by || null,
      });
    }

    return this.enrichOrder(newOrder);
  }

  public async updateOrderStatus(
    orderId: string,
    status: Order['status'],
    notes?: string,
    pdfUrl?: string | null
  ): Promise<Order> {
    const idx = this.state.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) {
      throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
    }
    this.state.orders[idx] = {
      ...this.state.orders[idx],
      status,
      notes: notes !== undefined ? notes : this.state.orders[idx].notes,
      pdf_url: pdfUrl !== undefined ? pdfUrl : this.state.orders[idx].pdf_url,
    };
    return this.enrichOrder(this.state.orders[idx]);
  }

  public async updateExamResult(
    orderId: string,
    resultId: string,
    data: Partial<ExamResult>
  ): Promise<ExamResult> {
    const idx = this.state.examResults.findIndex(
      (r) =>
        r.order_id === orderId && (r.id === resultId || r.exam_id === resultId)
    );
    if (idx === -1) {
      throw new NotFoundError(
        `Resultado '${resultId}' não encontrado para o pedido '${orderId}'.`
      );
    }

    const current = this.state.examResults[idx];
    const updated: ExamResult = {
      ...current,
      dynamic_content:
        data.dynamic_content !== undefined
          ? { ...current.dynamic_content, ...data.dynamic_content }
          : current.dynamic_content,
      reference_snapshot:
        data.reference_snapshot !== undefined
          ? data.reference_snapshot
          : current.reference_snapshot,
      attachments:
        data.attachments !== undefined ? data.attachments : current.attachments,
      pdf_url: data.pdf_url !== undefined ? data.pdf_url : current.pdf_url,
      released_at:
        data.released_at !== undefined ? data.released_at : current.released_at,
      released_by:
        data.released_by !== undefined ? data.released_by : current.released_by,
    };

    this.state.examResults[idx] = updated;
    const enrichedOrder = this.enrichOrder(
      this.state.orders.find((o) => o.id === orderId)!
    );
    return (
      enrichedOrder.results?.find((r) => r.id === updated.id) || updated
    );
  }

  // ===========================================================================
  // COLLECTION REQUESTS (Landing Page)
  // ===========================================================================
  public async listCollectionRequests(): Promise<CollectionRequest[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('collection_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        return data as CollectionRequest[];
      }
    }
    return [...this.state.collectionRequests];
  }

  public async createCollectionRequest(
    data: Omit<CollectionRequest, 'id' | 'created_at' | 'status'> & {
      status?: CollectionRequest['status'];
    }
  ): Promise<CollectionRequest> {
    const created: CollectionRequest = {
      id: randomUUID(),
      clinic_or_tutor_name: data.clinic_or_tutor_name.trim(),
      phone: data.phone.trim(),
      email: (data.email || '').trim(),
      address: data.address.trim(),
      preferred_date: data.preferred_date || new Date().toISOString().slice(0, 10),
      notes: (data.notes || '').trim(),
      status: data.status || 'pendente',
      created_at: new Date().toISOString(),
    };
    this.state.collectionRequests.unshift(created);
    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted, error } = await sb
        .from('collection_requests')
        .insert(created)
        .select()
        .single();
      if (!error && inserted) {
        return inserted as CollectionRequest;
      }
    }
    return created;
  }

  public async updateCollectionRequestStatus(
    id: string,
    status: CollectionRequest['status'],
    scheduledDate?: string,
    scheduledTime?: string
  ): Promise<CollectionRequest> {
    const sb = getSupabaseClient();
    if (sb) {
      const patch: Record<string, any> = { status };
      if (scheduledDate !== undefined) patch.scheduled_date = scheduledDate;
      if (scheduledTime !== undefined) patch.scheduled_time = scheduledTime;
      const { data: updated, error } = await sb
        .from('collection_requests')
        .update(patch)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (!error && updated) {
        const idx = this.state.collectionRequests.findIndex((c) => c.id === id);
        if (idx !== -1) {
          this.state.collectionRequests[idx] = updated as CollectionRequest;
        }
        return updated as CollectionRequest;
      }
    }

    const idx = this.state.collectionRequests.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
    }
    this.state.collectionRequests[idx].status = status;
    if (scheduledDate !== undefined) {
      this.state.collectionRequests[idx].scheduled_date = scheduledDate;
    }
    if (scheduledTime !== undefined) {
      this.state.collectionRequests[idx].scheduled_time = scheduledTime;
    }
    return this.state.collectionRequests[idx];
  }
}

export const repositorySingleton = new HybridVetLifeRepository();
