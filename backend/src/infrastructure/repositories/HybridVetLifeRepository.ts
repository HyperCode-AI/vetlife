import { createHash, randomUUID } from 'crypto';
import {
  CollectionRequest,
  Exam,
  ExamInputField,
  ExamLabelTemplate,
  ExamPrice,
  ExamReference,
  ExamResult,
  Invoice,
  Order,
  Patient,
  PriceTable,
  ReportTemplate,
  User,
  Vet,
  parseTubeTypeToLabelTemplates,
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
      const { data, error } = await sb
        .from('users')
        .select('*')
        .ilike('email', normalized)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as User) || null;
    }

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
      const { data, error } = await sb.from('users').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as User) || null;
    }
    return this.state.users.find((u) => u.id === id) || null;
  }

  public async listUsers(): Promise<User[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('users')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as User[];
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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('users').select('*').eq('id', id).maybeSingle();
      if (existing) {
        const nextEmail = data.email ? data.email.trim().toLowerCase() : existing.email;
        const { data: dup } = await sb
          .from('users')
          .select('id')
          .ilike('email', nextEmail)
          .neq('id', id)
          .maybeSingle();
        if (dup) {
          throw new ConflictError(`Já existe outro usuário com o e-mail '${nextEmail}'.`);
        }
        const patch: Record<string, any> = {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.email !== undefined ? { email: nextEmail } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.password_hash !== undefined ? { password_hash: data.password_hash } : {}),
        };
        const { data: updated, error } = await sb
          .from('users')
          .update(patch)
          .eq('id', id)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        const idx = this.state.users.findIndex((u) => u.id === id);
        if (idx !== -1) this.state.users[idx] = updated as User;
        return updated as User;
      }
      throw new NotFoundError(`Usuário '${id}' não encontrado.`);
    }

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
    return updated;
  }

  public async deleteUser(id: string): Promise<void> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('users').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Usuário '${id}' não encontrado.`);
      }
      const { error } = await sb.from('users').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.users = this.state.users.filter((u) => u.id !== id);
      return;
    }

    const idx = this.state.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Usuário '${id}' não encontrado.`);
    }
    this.state.users.splice(idx, 1);
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

    const stateTemplates = (this.state.examLabelTemplates || [])
      .filter((lt) => lt.exam_id === exam.id)
      .sort((a, b) => Number(a.display_order || 1) - Number(b.display_order || 1));

    const rawTemplates: ExamLabelTemplate[] =
      exam.label_templates && exam.label_templates.length > 0
        ? exam.label_templates
        : stateTemplates.length > 0
          ? stateTemplates
          : parseTubeTypeToLabelTemplates(
              exam.tube_type || exam.material || 'Tubo Padrão',
              exam.label_qty,
              exam.id
            );

    const normalizedTemplates: ExamLabelTemplate[] = rawTemplates.map((lt, idx) => ({
      id: lt.id || `lt-${exam.id}-${idx + 1}`,
      exam_id: exam.id,
      tube_type: (lt.tube_type || exam.tube_type || 'Tubo Padrão').trim(),
      label_qty: Math.max(1, Number(lt.label_qty) || 1),
      display_order: Number(lt.display_order ?? idx + 1),
    }));

    const joinedTubes =
      normalizedTemplates.length > 0
        ? normalizedTemplates.map((lt) => lt.tube_type).join(' + ')
        : exam.tube_type || exam.material || 'Tubo Padrão';
    const totalLabelQty =
      normalizedTemplates.length > 0
        ? normalizedTemplates.reduce((acc, lt) => acc + lt.label_qty, 0)
        : Math.max(1, Number(exam.label_qty) || 1);

    return {
      ...exam,
      delivery_days: deliveryDays,
      delivery_time_label: deliveryLabel,
      tube_type: joinedTubes,
      material: exam.material || joinedTubes,
      label_qty: totalLabelQty,
      label_templates: normalizedTemplates,
      base_price: resolvedPrice,
      price: resolvedPrice,
      active_price: resolvedPrice,
      input_fields: fields,
    };
  }

  public async listExams(): Promise<Exam[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const [
        { data: examsData, error },
        { data: priceTables },
        { data: examPrices },
        { data: labelTemplatesData },
      ] = await Promise.all([
        sb.from('exams').select('*, exam_input_fields(*)').order('code', { ascending: true }),
        sb.from('price_tables').select('*').eq('is_active', true),
        sb.from('exam_prices').select('*'),
        sb.from('exam_label_templates').select('*').order('display_order', { ascending: true }),
      ]);
      if (error) throw new Error(error.message);

      const activePt =
        (priceTables || []).find((pt: any) => !pt.partner_clinic) || (priceTables || [])[0];
      const priceMap = new Map<string, number>();
      if (activePt && Array.isArray(examPrices)) {
        for (const ep of examPrices as any[]) {
          if (ep.price_table_id === activePt.id) {
            priceMap.set(ep.exam_id, Number(ep.price));
          }
        }
      }

      const templatesByExamId = new Map<string, ExamLabelTemplate[]>();
      if (Array.isArray(labelTemplatesData)) {
        for (const lt of labelTemplatesData as any[]) {
          const list = templatesByExamId.get(lt.exam_id) || [];
          list.push({
            id: lt.id,
            exam_id: lt.exam_id,
            tube_type: String(lt.tube_type || '').trim(),
            label_qty: Math.max(1, Number(lt.label_qty) || 1),
            display_order: Number(lt.display_order || list.length + 1),
          });
          templatesByExamId.set(lt.exam_id, list);
        }
      }

      return (examsData || []).map((row: Record<string, unknown>) => {
        const base = row as unknown as Exam;
        const dbPrice = priceMap.get(base.id);
        const fields = Array.isArray(row.exam_input_fields)
          ? (row.exam_input_fields as ExamInputField[]).sort(
            (a, b) => a.display_order - b.display_order
          )
          : [];
        const dbTemplates = templatesByExamId.get(base.id);
        return this.enrichExam({
          ...base,
          ...(dbPrice !== undefined ? { base_price: dbPrice, price: dbPrice, active_price: dbPrice } : {}),
          ...(dbTemplates && dbTemplates.length > 0 ? { label_templates: dbTemplates } : {}),
          input_fields: fields,
        });
      });
    }
    return this.state.exams.map((e) => this.enrichExam(e));
  }

  private async saveExamLabelTemplates(
    examId: string,
    templates: ExamLabelTemplate[]
  ): Promise<ExamLabelTemplate[]> {
    const normalized: ExamLabelTemplate[] = templates
      .filter((t) => t && String(t.tube_type || '').trim().length > 0)
      .map((t, index) => ({
        id: t.id && /^[0-9a-f-]{36}$/i.test(t.id) ? t.id : randomUUID(),
        exam_id: examId,
        tube_type: String(t.tube_type).trim(),
        label_qty: Math.max(1, Number(t.label_qty) || 1),
        display_order: index + 1,
      }));

    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('exam_label_templates').delete().eq('exam_id', examId);
      if (normalized.length > 0) {
        const payload = normalized.map((n) => ({
          id: n.id,
          exam_id: examId,
          tube_type: n.tube_type,
          label_qty: n.label_qty,
          display_order: n.display_order,
        }));
        await sb.from('exam_label_templates').insert(payload);
      }
    }

    this.state.examLabelTemplates = (this.state.examLabelTemplates || []).filter(
      (lt) => lt.exam_id !== examId
    );
    this.state.examLabelTemplates.push(...normalized);
    return normalized;
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
    const initialTemplates =
      data.label_templates && data.label_templates.length > 0
        ? data.label_templates
        : parseTubeTypeToLabelTemplates(
            data.tube_type || data.material || 'Tubo EDTA',
            data.label_qty
          );
    const tubeOrMaterial =
      initialTemplates.length > 0
        ? initialTemplates.map((t) => String(t.tube_type).trim()).join(' + ')
        : (data.tube_type || data.material || 'Tubo EDTA').trim();
    const totalLabelQty =
      initialTemplates.length > 0
        ? initialTemplates.reduce((acc, t) => acc + Math.max(1, Number(t.label_qty) || 1), 0)
        : Number(data.label_qty ?? 1);

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
      label_qty: totalLabelQty,
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

    const savedTemplates = await this.saveExamLabelTemplates(newExam.id, initialTemplates);
    newExam.label_templates = savedTemplates;

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
    const incomingTemplates =
      data.label_templates && data.label_templates.length > 0
        ? data.label_templates
            .filter((t) => t && String(t.tube_type || '').trim().length > 0)
            .map((t, idx) => ({
              tube_type: String(t.tube_type).trim(),
              label_qty: Math.max(1, Number(t.label_qty) || 1),
              display_order: idx + 1,
            }))
        : data.tube_type !== undefined || data.material !== undefined
          ? parseTubeTypeToLabelTemplates(
              String(data.tube_type ?? data.material ?? 'Tubo Padrão'),
              data.label_qty
            )
          : undefined;

    const derivedTubeType =
      incomingTemplates && incomingTemplates.length > 0
        ? incomingTemplates.map((t) => t.tube_type).join(' + ')
        : data.tube_type !== undefined
          ? data.tube_type.trim()
          : data.material !== undefined
            ? data.material.trim()
            : undefined;

    const derivedLabelQty =
      incomingTemplates && incomingTemplates.length > 0
        ? incomingTemplates.reduce((acc, t) => acc + t.label_qty, 0)
        : data.label_qty !== undefined
          ? Number(data.label_qty)
          : undefined;

    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb
        .from('exams')
        .select('*')
        .or(`id.eq.${id},code.eq.${id}`)
        .maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Exame com ID '${id}' não encontrado.`);
      }
      const nextDeliveryDays =
        data.delivery_days !== undefined ? Number(data.delivery_days) : existing.delivery_days;
      const patch: Record<string, any> = {
        ...(data.code !== undefined ? { code: data.code.trim().toUpperCase() } : {}),
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.section !== undefined ? { section: data.section.trim() } : {}),
        delivery_days: nextDeliveryDays,
        delivery_time_label:
          data.delivery_time_label !== undefined
            ? data.delivery_time_label.trim()
            : data.delivery_days !== undefined
              ? `${nextDeliveryDays} ${nextDeliveryDays === 1 ? 'dia útil' : 'dias úteis'}`
              : existing.delivery_time_label,
        ...(derivedTubeType !== undefined ? { tube_type: derivedTubeType } : {}),
        ...(derivedLabelQty !== undefined ? { label_qty: derivedLabelQty } : {}),
        ...(data.reference_template_id !== undefined
          ? { reference_template_id: data.reference_template_id || null }
          : {}),
      };
      const { data: updatedRow, error } = await sb
        .from('exams')
        .update(patch)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);

      let savedTemplates: ExamLabelTemplate[] | undefined;
      if (incomingTemplates && incomingTemplates.length > 0) {
        savedTemplates = await this.saveExamLabelTemplates(existing.id, incomingTemplates);
      }

      if (data.price !== undefined || data.base_price !== undefined) {
        const nextPrice = Number(data.price ?? data.base_price);
        await sb.from('exam_prices').update({ price: nextPrice }).eq('exam_id', existing.id);
      }
      if (data.input_fields) {
        await this.saveExamInputFields(existing.id, data.input_fields);
      }
      return this.enrichExam({
        ...(updatedRow as Exam),
        ...(savedTemplates ? { label_templates: savedTemplates } : {}),
        ...(data.price !== undefined || data.base_price !== undefined
          ? {
            price: Number(data.price ?? data.base_price),
            base_price: Number(data.price ?? data.base_price),
          }
          : {}),
      });
    }

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

    let savedTemplates = current.label_templates;
    if (incomingTemplates && incomingTemplates.length > 0) {
      savedTemplates = await this.saveExamLabelTemplates(current.id, incomingTemplates);
    }

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
      tube_type: derivedTubeType !== undefined ? derivedTubeType : current.tube_type,
      material:
        derivedTubeType !== undefined ? derivedTubeType : current.material || current.tube_type,
      label_qty: derivedLabelQty !== undefined ? derivedLabelQty : current.label_qty,
      label_templates: savedTemplates,
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

    return this.enrichExam(updated);
  }

  public async deleteExam(id: string): Promise<void> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('exams').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Exame com ID '${id}' não encontrado.`);
      }
      const { error } = await sb.from('exams').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.exams = this.state.exams.filter((e) => e.id !== id);
      this.state.examInputFields = this.state.examInputFields.filter((f) => f.exam_id !== id);
      this.state.examLabelTemplates = (this.state.examLabelTemplates || []).filter(
        (lt) => lt.exam_id !== id
      );
      this.state.examPrices = this.state.examPrices.filter((p) => p.exam_id !== id);
      return;
    }

    const idx = this.state.exams.findIndex((e) => e.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Exame com ID '${id}' não encontrado.`);
    }
    this.state.exams.splice(idx, 1);
    this.state.examInputFields = this.state.examInputFields.filter((f) => f.exam_id !== id);
    this.state.examLabelTemplates = (this.state.examLabelTemplates || []).filter(
      (lt) => lt.exam_id !== id
    );
    this.state.examPrices = this.state.examPrices.filter((p) => p.exam_id !== id);
  }

  public async listExamInputFields(examId: string): Promise<ExamInputField[]> {
    const exam = await this.findExamById(examId);
    if (!exam) {
      throw new NotFoundError(`Exame '${examId}' não encontrado.`);
    }
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb
        .from('exam_input_fields')
        .select('*')
        .eq('exam_id', exam.id)
        .order('display_order', { ascending: true });
      if (data && data.length > 0) return data as ExamInputField[];
    }
    return exam.input_fields || [];
  }

  public async saveExamInputFields(
    examId: string,
    fields: Array<Omit<ExamInputField, 'id' | 'exam_id'> & { id?: string }>
  ): Promise<ExamInputField[]> {
    const exam = await this.findExamById(examId);
    if (!exam) {
      throw new NotFoundError(`Exame '${examId}' não encontrado.`);
    }

    const createdFields: ExamInputField[] = fields.map((f, index) => ({
      id: f.id && /^[0-9a-f-]{36}$/i.test(f.id) ? f.id : randomUUID(),
      exam_id: exam.id,
      field_name: f.field_name.trim(),
      field_label: (f.field_label || f.field_name).trim(),
      field_type: f.field_type || 'text',
      unit: f.unit || '',
      options: Array.isArray(f.options) ? f.options : [],
      is_required: f.is_required ?? true,
      display_order: f.display_order ?? index + 1,
    }));

    const sb = getSupabaseClient();
    if (sb) {
      await sb.from('exam_input_fields').delete().eq('exam_id', exam.id);
      if (createdFields.length > 0) {
        const { data: inserted, error } = await sb
          .from('exam_input_fields')
          .insert(createdFields)
          .select('*');
        if (error) throw new Error(error.message);
        if (inserted) return inserted as ExamInputField[];
      }
      return createdFields;
    }

    this.state.examInputFields = this.state.examInputFields.filter((f) => f.exam_id !== exam.id);
    this.state.examInputFields.push(...createdFields);
    return createdFields;
  }

  public async addExamInputField(
    examId: string,
    field: Omit<ExamInputField, 'id' | 'exam_id'>
  ): Promise<ExamInputField> {
    const exam = await this.findExamById(examId);
    if (!exam) {
      throw new NotFoundError(`Exame '${examId}' não encontrado.`);
    }

    const existingForExam = this.state.examInputFields.filter((f) => f.exam_id === exam.id);
    const newField: ExamInputField = {
      id: randomUUID(),
      exam_id: exam.id,
      field_name: field.field_name.trim(),
      field_label: (field.field_label || field.field_name).trim(),
      field_type: field.field_type || 'text',
      unit: field.unit || '',
      options: Array.isArray(field.options) ? field.options : [],
      is_required: field.is_required ?? true,
      display_order: field.display_order ?? existingForExam.length + 1,
    };

    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted, error } = await sb
        .from('exam_input_fields')
        .insert(newField)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return inserted as ExamInputField;
    }

    this.state.examInputFields.push(newField);
    return newField;
  }

  public async deleteExamInputField(examId: string, fieldId: string): Promise<void> {
    const sb = getSupabaseClient();
    if (sb) {
      const { error } = await sb
        .from('exam_input_fields')
        .delete()
        .eq('exam_id', examId)
        .eq('id', fieldId);
      if (error) throw new Error(error.message);
      this.state.examInputFields = this.state.examInputFields.filter(
        (f) => !(f.exam_id === examId && f.id === fieldId)
      );
      return;
    }
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
    const sb = getSupabaseClient();
    if (sb) {
      const [{ data: tables }, { data: prices }, { data: exams }] = await Promise.all([
        sb.from('price_tables').select('*').order('created_at', { ascending: false }),
        sb.from('exam_prices').select('*'),
        sb.from('exams').select('id, code, name'),
      ]);
      if (tables) {
        const examMap = new Map((exams || []).map((e: any) => [e.id, e]));
        return (tables as PriceTable[]).map((pt) => ({
          ...pt,
          prices: ((prices || []) as ExamPrice[])
            .filter((p) => p.price_table_id === pt.id)
            .map((p) => ({
              ...p,
              price: Number(p.price),
              exam_code: examMap.get(p.exam_id)?.code,
              exam_name: examMap.get(p.exam_id)?.name,
            })),
        }));
      }
    }
    return this.state.priceTables.map((pt) => this.enrichPriceTable(pt));
  }

  public async findPriceTableById(id: string): Promise<PriceTable | null> {
    const sb = getSupabaseClient();
    if (sb) {
      const list = await this.listPriceTables();
      return list.find((t) => t.id === id) || null;
    }
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

    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted, error } = await sb
        .from('price_tables')
        .insert({
          id: newTable.id,
          name: newTable.name,
          partner_clinic: newTable.partner_clinic,
          start_date: newTable.start_date,
          end_date: newTable.end_date,
          is_active: newTable.is_active,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      const tableId = inserted.id as string;
      const entries = (prices || []).map((item) => ({
        price_table_id: tableId,
        exam_id: item.exam_id,
        price: Number(item.price),
      }));
      if (entries.length > 0) {
        await sb.from('exam_prices').insert(entries);
      }
      return (await this.findPriceTableById(tableId)) || { ...(inserted as PriceTable), prices: [] };
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('price_tables').select('*').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Tabela de preços '${id}' não encontrada.`);
      }
      const patch: Record<string, any> = {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.partner_clinic !== undefined ? { partner_clinic: data.partner_clinic } : {}),
        ...(data.start_date !== undefined ? { start_date: data.start_date } : {}),
        ...(data.end_date !== undefined ? { end_date: data.end_date } : {}),
        ...(data.is_active !== undefined ? { is_active: Boolean(data.is_active) } : {}),
      };
      if (Object.keys(patch).length > 0) {
        const { error } = await sb.from('price_tables').update(patch).eq('id', id);
        if (error) throw new Error(error.message);
      }
      if (prices && prices.length > 0) {
        await sb.from('exam_prices').delete().eq('price_table_id', id);
        await sb.from('exam_prices').insert(
          prices.map((item) => ({
            price_table_id: id,
            exam_id: item.exam_id,
            price: Number(item.price),
          }))
        );
      }
      const refreshed = await this.findPriceTableById(id);
      if (!refreshed) throw new NotFoundError(`Tabela de preços '${id}' não encontrada.`);
      return refreshed;
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('price_tables').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Tabela de preços '${id}' não encontrada.`);
      }
      const { error } = await sb.from('price_tables').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.priceTables = this.state.priceTables.filter((t) => t.id !== id);
      this.state.examPrices = this.state.examPrices.filter((p) => p.price_table_id !== id);
      return;
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      let query = sb.from('exam_references').select('*, exams(name)');
      if (filters?.exam_id) query = query.eq('exam_id', filters.exam_id);
      if (filters?.species) query = query.ilike('species', filters.species.trim());
      const { data, error } = await query;
      if (!error && data) {
        return data.map((row: any) => ({
          id: row.id,
          exam_id: row.exam_id,
          exam_name: row.exams?.name,
          parameter_name: row.parameter_name || row.exams?.name || '',
          species: row.species,
          gender: row.gender,
          min_age_days: Number(row.min_age_days ?? 0),
          max_age_days: Number(row.max_age_days ?? 36500),
          reference_text_content: row.reference_text_content,
          min_value: row.min_value !== null ? Number(row.min_value) : null,
          max_value: row.max_value !== null ? Number(row.max_value) : null,
          unit: row.unit || '',
        }));
      }
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted, error } = await sb
        .from('exam_references')
        .insert({
          exam_id: data.exam_id,
          parameter_name: data.parameter_name || '',
          species: data.species,
          gender: data.gender || 'Ambos',
          min_age_days: Number(data.min_age_days ?? 0),
          max_age_days: Number(data.max_age_days ?? 9125),
          reference_text_content: data.reference_text_content,
          min_value: data.min_value ?? null,
          max_value: data.max_value ?? null,
          unit: data.unit || '',
        })
        .select('*, exams(name)')
        .single();
      if (error) throw new Error(error.message);
      return {
        ...(inserted as any),
        exam_name: (inserted as any).exams?.name,
      } as ExamReference;
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('exam_references').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Referência '${id}' não encontrada.`);
      }
      const patch: Record<string, any> = {};
      if (data.exam_id !== undefined) patch.exam_id = data.exam_id;
      if (data.parameter_name !== undefined) patch.parameter_name = data.parameter_name;
      if (data.species !== undefined) patch.species = data.species;
      if (data.gender !== undefined) patch.gender = data.gender;
      if (data.min_age_days !== undefined) patch.min_age_days = Number(data.min_age_days);
      if (data.max_age_days !== undefined) patch.max_age_days = Number(data.max_age_days);
      if (data.reference_text_content !== undefined) patch.reference_text_content = data.reference_text_content;
      if (data.min_value !== undefined) patch.min_value = data.min_value;
      if (data.max_value !== undefined) patch.max_value = data.max_value;
      if (data.unit !== undefined) patch.unit = data.unit;

      const { data: updated, error } = await sb
        .from('exam_references')
        .update(patch)
        .eq('id', id)
        .select('*, exams(name)')
        .single();
      if (error) throw new Error(error.message);
      return {
        ...(updated as any),
        exam_name: (updated as any).exams?.name,
      } as ExamReference;
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('exam_references').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Referência '${id}' não encontrada.`);
      }
      const { error } = await sb.from('exam_references').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.examReferences = this.state.examReferences.filter((r) => r.id !== id);
      return;
    }

    const idx = this.state.examReferences.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Referência '${id}' não encontrada.`);
    }
    this.state.examReferences.splice(idx, 1);
  }

  public async listReportTemplates(): Promise<ReportTemplate[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb
        .from('report_templates')
        .select('*')
        .order('created_at', { ascending: true });
      if (data && data.length > 0) return data as ReportTemplate[];
    }
    return [...this.state.reportTemplates];
  }

  public async findReportTemplateById(id: string): Promise<ReportTemplate | null> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('report_templates').select('*').eq('id', id).maybeSingle();
      if (data) return data as ReportTemplate;
    }
    return this.state.reportTemplates.find((t) => t.id === id) || null;
  }

  public async getDefaultReportTemplate(): Promise<ReportTemplate> {
    const templates = await this.listReportTemplates();
    return templates.find((t) => t.is_default) || templates[0];
  }

  public async createReportTemplate(
    data: Omit<ReportTemplate, 'id' | 'created_at'>
  ): Promise<ReportTemplate> {
    const dynamicTags =
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
        ];

    const sb = getSupabaseClient();
    if (sb) {
      if (data.is_default) {
        await sb.from('report_templates').update({ is_default: false }).eq('is_default', true);
      }
      const { data: inserted, error } = await sb
        .from('report_templates')
        .insert({
          name: data.name,
          header_html: data.header_html,
          footer_html: data.footer_html,
          body_template: data.body_template,
          dynamic_tags: dynamicTags,
          is_default: Boolean(data.is_default),
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return inserted as ReportTemplate;
    }

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
      dynamic_tags: dynamicTags,
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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('report_templates').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Modelo de laudo '${id}' não encontrado.`);
      }
      if (data.is_default) {
        await sb.from('report_templates').update({ is_default: false }).neq('id', id);
      }
      const patch: Record<string, any> = {};
      if (data.name !== undefined) patch.name = data.name;
      if (data.header_html !== undefined) patch.header_html = data.header_html;
      if (data.footer_html !== undefined) patch.footer_html = data.footer_html;
      if (data.body_template !== undefined) patch.body_template = data.body_template;
      if (data.dynamic_tags !== undefined) patch.dynamic_tags = data.dynamic_tags;
      if (data.is_default !== undefined) patch.is_default = Boolean(data.is_default);

      const { data: updated, error } = await sb
        .from('report_templates')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return updated as ReportTemplate;
    }

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

  public async deleteReportTemplate(id: string): Promise<void> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('report_templates').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Modelo de laudo '${id}' não encontrado.`);
      }
      const { error } = await sb.from('report_templates').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.reportTemplates = this.state.reportTemplates.filter((t) => t.id !== id);
      return;
    }

    const idx = this.state.reportTemplates.findIndex((t) => t.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Modelo de laudo '${id}' não encontrado.`);
    }
    this.state.reportTemplates.splice(idx, 1);
  }

  // ===========================================================================
  // PATIENTS & VETS (HU-06, HU-10)
  // ===========================================================================
  public async listPatients(): Promise<Patient[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('patients')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        return (data as Patient[]).map((p) => this.referenceResolver.enrichPatientWithAge(p));
      }
    }
    return this.state.patients.map((p) => this.referenceResolver.enrichPatientWithAge(p));
  }

  public async findPatientById(id: string): Promise<Patient | null> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('patients').select('*').eq('id', id).maybeSingle();
      if (data) return this.referenceResolver.enrichPatientWithAge(data as Patient);
      return null;
    }
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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted, error } = await sb
        .from('patients')
        .insert({
          id: created.id,
          name: created.name,
          species: created.species,
          breed: created.breed,
          gender: created.gender,
          birth_date: created.birth_date,
          tutor_name: created.tutor_name,
          tutor_phone: created.tutor_phone,
          tutor_email: created.tutor_email,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return this.referenceResolver.enrichPatientWithAge(inserted as Patient);
    }
    this.state.patients.unshift(created);
    return this.referenceResolver.enrichPatientWithAge(created);
  }

  public async updatePatient(id: string, data: Partial<Patient>): Promise<Patient> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('patients').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Paciente '${id}' não encontrado.`);
      }
      const patch: Record<string, any> = {};
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.species !== undefined) patch.species = data.species.trim();
      if (data.breed !== undefined) patch.breed = data.breed.trim();
      if (data.gender !== undefined) patch.gender = data.gender === 'F' ? 'F' : 'M';
      if (data.birth_date !== undefined) patch.birth_date = data.birth_date;
      if (data.tutor_name !== undefined) patch.tutor_name = data.tutor_name.trim();
      if (data.tutor_phone !== undefined) patch.tutor_phone = data.tutor_phone.trim();
      if (data.tutor_email !== undefined) patch.tutor_email = data.tutor_email.trim();

      const { data: updated, error } = await sb
        .from('patients')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return this.referenceResolver.enrichPatientWithAge(updated as Patient);
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('patients').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Paciente '${id}' não encontrado.`);
      }
      const { error } = await sb.from('patients').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.patients = this.state.patients.filter((p) => p.id !== id);
      return;
    }

    const idx = this.state.patients.findIndex((p) => p.id === id);
    if (idx === -1) {
      throw new NotFoundError(`Paciente '${id}' não encontrado.`);
    }
    this.state.patients.splice(idx, 1);
  }

  public async listVets(): Promise<Vet[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('vets')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) return data as Vet[];
    }
    return [...this.state.vets];
  }

  public async findVetById(id: string): Promise<Vet | null> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data } = await sb.from('vets').select('*').eq('id', id).maybeSingle();
      if (data) return data as Vet;
      return null;
    }
    return this.state.vets.find((v) => v.id === id) || null;
  }

  public async findVetByEmail(email: string): Promise<Vet | null> {
    const cleanEmail = email.trim().toLowerCase();
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('vets')
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Vet) || null;
    }
    const direct = this.state.vets.find((v) => v.email.toLowerCase() === cleanEmail);
    if (direct) return direct;
    return null;
  }

  public async findVetByEmailAndCrmv(email: string, crmv: string): Promise<Vet | null> {
    const normEmail = email.trim().toLowerCase();
    const normCrmv = crmv.trim().toUpperCase().replace(/\s+/g, ' ');
    const digitsOnly = normCrmv.replace(/\D/g, '');

    const vets = await this.listVets();
    const direct = vets.find((v) => {
      const vEmail = v.email.toLowerCase();
      const vCrmv = (v.crmv || '').toUpperCase().replace(/\s+/g, ' ');
      const vDigits = vCrmv.replace(/\D/g, '');
      return (
        vEmail === normEmail &&
        (vCrmv === normCrmv || (digitsOnly.length >= 4 && vDigits === digitsOnly))
      );
    });
    return direct || null;
  }

  public async createVet(data: Omit<Vet, 'id' | 'created_at'>): Promise<Vet> {
    const email = data.email.trim().toLowerCase();
    const crmv = (data.crmv || '').trim().toUpperCase();
    const sb = getSupabaseClient();
    if (sb) {
      const { data: dup } = await sb.from('vets').select('id').ilike('email', email).maybeSingle();
      if (dup) {
        throw new ConflictError(`Já existe um veterinário cadastrado com o e-mail '${email}'.`);
      }
      const { data: inserted, error } = await sb
        .from('vets')
        .insert({
          id: randomUUID(),
          name: data.name.trim(),
          crmv,
          clinic_name: (data.clinic_name || '').trim(),
          email,
          phone: data.phone.trim(),
          password_hash: data.password_hash || '',
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return inserted as Vet;
    }

    const duplicate = this.state.vets.find((v) => v.email.toLowerCase() === email);
    if (duplicate) {
      throw new ConflictError(`Já existe um veterinário cadastrado com o e-mail '${email}'.`);
    }
    const created: Vet = {
      id: randomUUID(),
      name: data.name.trim(),
      crmv,
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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('vets').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Veterinário '${id}' não encontrado.`);
      }
      const patch: Record<string, any> = {};
      if (data.name !== undefined) patch.name = data.name.trim();
      if (data.crmv !== undefined) patch.crmv = data.crmv.trim().toUpperCase();
      if (data.clinic_name !== undefined) patch.clinic_name = data.clinic_name.trim();
      if (data.email !== undefined) patch.email = data.email.trim().toLowerCase();
      if (data.phone !== undefined) patch.phone = data.phone.trim();
      if (data.password_hash !== undefined) patch.password_hash = data.password_hash;

      const { data: updated, error } = await sb
        .from('vets')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return updated as Vet;
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('vets').select('id').eq('id', id).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Veterinário '${id}' não encontrado.`);
      }
      const { error } = await sb.from('vets').delete().eq('id', id);
      if (error) throw new Error(error.message);
      this.state.vets = this.state.vets.filter((v) => v.id !== id);
      return;
    }

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
    const sb = getSupabaseClient();
    let orders: Order[];
    if (sb) {
      const [{ data: rawOrders }, { data: rawResults }, { data: rawPatients }, { data: rawVets }, exams, allRefs, templates, priceTables] =
        await Promise.all([
          sb.from('orders').select('*').order('created_at', { ascending: false }),
          sb.from('exam_results').select('*'),
          sb.from('patients').select('*'),
          sb.from('vets').select('*'),
          this.listExams(),
          this.listExamReferences(),
          this.listReportTemplates(),
          this.listPriceTables(),
        ]);

      const patMap = new Map((rawPatients || []).map((p: any) => [p.id, this.referenceResolver.enrichPatientWithAge(p as Patient)]));
      const vetMap = new Map((rawVets || []).map((v: any) => [v.id, v as Vet]));
      const examMap = new Map(exams.map((e) => [e.id, e]));
      const ptMap = new Map(priceTables.map((pt) => [pt.id, pt]));
      const tplMap = new Map(templates.map((t) => [t.id, t]));
      const defaultTpl = templates.find((t) => t.is_default) || templates[0];

      orders = ((rawOrders || []) as Order[]).map((ord) => {
        const patient = patMap.get(ord.patient_id);
        const vet = vetMap.get(ord.vet_id);
        const pt = ord.price_table_id ? ptMap.get(ord.price_table_id) : undefined;
        const results = ((rawResults || []) as ExamResult[])
          .filter((r) => r.order_id === ord.id)
          .map((r) => {
            const exam = examMap.get(r.exam_id);
            const matchedRefs =
              exam && patient
                ? this.referenceResolver.resolveReferencesForPatient(
                  allRefs,
                  exam.id,
                  patient.species,
                  patient.gender,
                  patient.age_days || 365
                )
                : [];
            const refSnapshot =
              r.reference_snapshot || this.referenceResolver.buildReferenceSnapshotText(matchedRefs);
            const tpl = (exam?.reference_template_id && tplMap.get(exam.reference_template_id)) || defaultTpl;
            const enrichedResult: ExamResult = {
              ...r,
              applied_price: Number(r.applied_price),
              reference_snapshot: refSnapshot,
              exam,
              matched_references: matchedRefs,
            };
            if (tpl && patient && vet && exam) {
              enrichedResult.rendered_html = this.reportRenderer.renderExamResultHtml({
                template: tpl,
                order: ord,
                patient,
                vet,
                exam,
                result: enrichedResult,
              });
            }
            return enrichedResult;
          });

        return {
          ...ord,
          total_amount: Number(ord.total_amount),
          price_table_name: ord.price_table_name || pt?.name || 'Tabela Geral VetLife 2026',
          patient,
          vet,
          results,
        };
      });
    } else {
      orders = this.state.orders.map((o) => this.enrichOrder(o));
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const all = await this.listOrders();
      return all.find((o) => o.id === id || o.protocol_code === id) || null;
    }
    const order = this.state.orders.find((o) => o.id === id || o.protocol_code === id);
    return order ? this.enrichOrder(order) : null;
  }

  public async findOrderByProtocolCode(protocolCode: string): Promise<Order | null> {
    const normalized = protocolCode.trim().toUpperCase();
    const sb = getSupabaseClient();
    if (sb) {
      const all = await this.listOrders();
      return all.find((o) => o.protocol_code.trim().toUpperCase() === normalized) || null;
    }
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

    const sb = getSupabaseClient();
    if (sb) {
      const { data: insertedOrder, error: orderErr } = await sb
        .from('orders')
        .insert({
          id: newOrder.id,
          protocol_code: newOrder.protocol_code,
          patient_id: newOrder.patient_id,
          vet_id: newOrder.vet_id,
          price_table_id: newOrder.price_table_id,
          total_amount: newOrder.total_amount,
          status: newOrder.status,
          notes: newOrder.notes,
        })
        .select('*')
        .single();
      if (orderErr) throw new Error(orderErr.message);

      if (resultsData.length > 0) {
        const { error: resErr } = await sb.from('exam_results').insert(
          resultsData.map((res) => ({
            id: randomUUID(),
            order_id: insertedOrder.id,
            exam_id: res.exam_id,
            applied_price: Number(res.applied_price),
            dynamic_content: res.dynamic_content || {},
            reference_snapshot: res.reference_snapshot || '',
            attachments: res.attachments || [],
            pdf_url: res.pdf_url || null,
            released_at: res.released_at || null,
            released_by: res.released_by || null,
          }))
        );
        if (resErr) throw new Error(resErr.message);
      }

      const full = await this.findOrderById(insertedOrder.id);
      if (full) return full;
    }

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

  public async updateOrder(
    orderId: string,
    orderData: Partial<Omit<Order, 'id' | 'created_at' | 'results' | 'patient' | 'vet'>>,
    resultsData?: Array<Omit<ExamResult, 'id' | 'order_id'>>
  ): Promise<Order> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('orders').select('id').eq('id', orderId).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
      }
      const patch: Record<string, any> = {};
      if (orderData.patient_id !== undefined) patch.patient_id = orderData.patient_id;
      if (orderData.vet_id !== undefined) patch.vet_id = orderData.vet_id;
      if (orderData.price_table_id !== undefined) patch.price_table_id = orderData.price_table_id;
      if (orderData.total_amount !== undefined) patch.total_amount = Number(orderData.total_amount);
      if (orderData.status !== undefined) patch.status = orderData.status;
      if (orderData.notes !== undefined) patch.notes = orderData.notes;
      if (orderData.pdf_url !== undefined) patch.pdf_url = orderData.pdf_url;

      if (Object.keys(patch).length > 0) {
        const { error } = await sb.from('orders').update(patch).eq('id', orderId);
        if (error) throw new Error(error.message);
      }

      if (resultsData && resultsData.length > 0) {
        await sb.from('exam_results').delete().eq('order_id', orderId);
        const { error: resErr } = await sb.from('exam_results').insert(
          resultsData.map((res) => ({
            id: randomUUID(),
            order_id: orderId,
            exam_id: res.exam_id,
            applied_price: Number(res.applied_price),
            dynamic_content: res.dynamic_content || {},
            reference_snapshot: res.reference_snapshot || '',
            attachments: res.attachments || [],
            pdf_url: res.pdf_url || null,
            released_at: res.released_at || null,
            released_by: res.released_by || null,
          }))
        );
        if (resErr) throw new Error(resErr.message);
      }

      const full = await this.findOrderById(orderId);
      if (!full) throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
      return full;
    }

    const idx = this.state.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) {
      throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
    }
    this.state.orders[idx] = {
      ...this.state.orders[idx],
      ...orderData,
      id: orderId,
    };

    if (resultsData && resultsData.length > 0) {
      this.state.examResults = this.state.examResults.filter((r) => r.order_id !== orderId);
      for (const res of resultsData) {
        this.state.examResults.push({
          id: randomUUID(),
          order_id: orderId,
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
    }

    return this.enrichOrder(this.state.orders[idx]);
  }

  public async deleteOrder(orderId: string): Promise<void> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('orders').select('id').eq('id', orderId).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
      }
      const { error } = await sb.from('orders').delete().eq('id', orderId);
      if (error) throw new Error(error.message);
      this.state.orders = this.state.orders.filter((o) => o.id !== orderId);
      this.state.examResults = this.state.examResults.filter((r) => r.order_id !== orderId);
      return;
    }

    const idx = this.state.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) {
      throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
    }
    this.state.orders.splice(idx, 1);
    this.state.examResults = this.state.examResults.filter((r) => r.order_id !== orderId);
  }

  public async updateOrderStatus(
    orderId: string,
    status: Order['status'],
    notes?: string,
    pdfUrl?: string | null
  ): Promise<Order> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb.from('orders').select('id').eq('id', orderId).maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
      }
      const patch: Record<string, any> = { status };
      if (notes !== undefined) patch.notes = notes;
      if (pdfUrl !== undefined) patch.pdf_url = pdfUrl;
      const { error } = await sb.from('orders').update(patch).eq('id', orderId);
      if (error) throw new Error(error.message);
      const refreshed = await this.findOrderById(orderId);
      if (!refreshed) throw new NotFoundError(`Pedido '${orderId}' não encontrado.`);
      return refreshed;
    }

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
    const sb = getSupabaseClient();
    if (sb) {
      const { data: current } = await sb
        .from('exam_results')
        .select('*')
        .eq('order_id', orderId)
        .or(`id.eq.${resultId},exam_id.eq.${resultId}`)
        .maybeSingle();
      if (!current) {
        throw new NotFoundError(
          `Resultado '${resultId}' não encontrado para o pedido '${orderId}'.`
        );
      }
      const patch: Record<string, any> = {};
      if (data.dynamic_content !== undefined) {
        patch.dynamic_content = { ...(current.dynamic_content || {}), ...data.dynamic_content };
      }
      if (data.reference_snapshot !== undefined) patch.reference_snapshot = data.reference_snapshot;
      if (data.attachments !== undefined) patch.attachments = data.attachments;
      if (data.pdf_url !== undefined) patch.pdf_url = data.pdf_url;
      if (data.released_at !== undefined) patch.released_at = data.released_at;
      if (data.released_by !== undefined) {
        patch.released_by = /^[0-9a-f-]{36}$/i.test(String(data.released_by))
          ? data.released_by
          : null;
      }

      const { data: updated, error } = await sb
        .from('exam_results')
        .update(patch)
        .eq('id', current.id)
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return updated as ExamResult;
    }

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
  // COLLECTION REQUESTS (Agendamento de Coleta — Landing Page & Painel Interno)
  // ===========================================================================
  public async listCollectionRequests(): Promise<CollectionRequest[]> {
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('collection_requests')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as CollectionRequest[];
    }
    return [...this.state.collectionRequests];
  }

  private resolveCollectionSeedId(id: string): string {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(id)) return id;
    const hex = createHash('sha256').update(`vetlife-seed:${id}`).digest('hex');
    const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, '0');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
  }

  public async findCollectionRequestById(id: string): Promise<CollectionRequest | null> {
    const resolvedId = this.resolveCollectionSeedId(id);
    const sb = getSupabaseClient();
    if (sb) {
      const { data, error } = await sb
        .from('collection_requests')
        .select('*')
        .eq('id', resolvedId)
        .maybeSingle();
      if (error) return null;
      return (data as CollectionRequest) || null;
    }
    return (
      this.state.collectionRequests.find((c) => c.id === id || c.id === resolvedId) || null
    );
  }

  public async createCollectionRequest(
    data: Omit<CollectionRequest, 'id' | 'created_at' | 'status'> & {
      status?: CollectionRequest['status'];
    }
  ): Promise<CollectionRequest> {
    const created: CollectionRequest = {
      id: randomUUID(),
      clinic_or_tutor_name: data.clinic_or_tutor_name.trim(),
      crmv: (data.crmv || '').trim().toUpperCase(),
      phone: data.phone.trim(),
      email: (data.email || '').trim(),
      address: data.address.trim(),
      preferred_date: data.preferred_date || new Date().toISOString().slice(0, 10),
      ...(data.scheduled_date ? { scheduled_date: data.scheduled_date } : {}),
      ...(data.scheduled_time ? { scheduled_time: data.scheduled_time } : {}),
      notes: (data.notes || '').trim(),
      status: data.status || 'pendente',
      created_at: new Date().toISOString(),
    };
    const sb = getSupabaseClient();
    if (sb) {
      const { data: inserted, error } = await sb
        .from('collection_requests')
        .insert(created)
        .select('*')
        .single();
      if (error) {
        const { crmv: _crmv, ...sbPayload } = created;
        const retry = await sb
          .from('collection_requests')
          .insert(sbPayload)
          .select('*')
          .single();
        if (retry.error) throw new Error(retry.error.message);
        return { ...(retry.data as CollectionRequest), crmv: created.crmv };
      }
      return { ...(inserted as CollectionRequest), crmv: (inserted as any)?.crmv || created.crmv };
    }
    this.state.collectionRequests.unshift(created);
    return created;
  }

  public async updateCollectionRequestStatus(
    id: string,
    status: CollectionRequest['status'],
    scheduledDate?: string,
    scheduledTime?: string
  ): Promise<CollectionRequest> {
    return this.updateCollectionRequest(id, {
      status,
      ...(scheduledDate !== undefined ? { scheduled_date: scheduledDate } : {}),
      ...(scheduledTime !== undefined ? { scheduled_time: scheduledTime } : {}),
    });
  }

  public async updateCollectionRequest(
    id: string,
    data: Partial<Omit<CollectionRequest, 'id' | 'created_at'>>
  ): Promise<CollectionRequest> {
    const resolvedId = this.resolveCollectionSeedId(id);
    const sb = getSupabaseClient();
    if (sb) {
      const patch: Record<string, any> = {};
      if (data.clinic_or_tutor_name !== undefined)
        patch.clinic_or_tutor_name = data.clinic_or_tutor_name.trim();
      if (data.crmv !== undefined) patch.crmv = data.crmv.trim().toUpperCase();
      if (data.phone !== undefined) patch.phone = data.phone.trim();
      if (data.email !== undefined) patch.email = data.email.trim();
      if (data.address !== undefined) patch.address = data.address.trim();
      if (data.preferred_date !== undefined) patch.preferred_date = data.preferred_date;
      if (data.scheduled_date !== undefined) patch.scheduled_date = data.scheduled_date;
      if (data.scheduled_time !== undefined) patch.scheduled_time = data.scheduled_time;
      if (data.notes !== undefined) patch.notes = data.notes.trim();
      if (data.status !== undefined) patch.status = data.status;

      const { data: updated, error } = await sb
        .from('collection_requests')
        .update(patch)
        .eq('id', resolvedId)
        .select('*')
        .maybeSingle();
      if (error) {
        if (error.code === '22P02') {
          throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
        }
        throw new Error(error.message);
      }
      if (!updated) {
        throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
      }
      return updated as CollectionRequest;
    }

    const idx = this.state.collectionRequests.findIndex(
      (c) => c.id === id || c.id === resolvedId
    );
    if (idx === -1) {
      throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
    }
    const updated: CollectionRequest = {
      ...this.state.collectionRequests[idx],
      ...data,
      id: this.state.collectionRequests[idx].id,
    };
    this.state.collectionRequests[idx] = updated;
    return updated;
  }

  public async deleteCollectionRequest(id: string): Promise<void> {
    const resolvedId = this.resolveCollectionSeedId(id);
    const sb = getSupabaseClient();
    if (sb) {
      const { data: existing } = await sb
        .from('collection_requests')
        .select('id')
        .eq('id', resolvedId)
        .maybeSingle();
      if (!existing) {
        throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
      }
      const { error } = await sb.from('collection_requests').delete().eq('id', resolvedId);
      if (error) throw new Error(error.message);
      this.state.collectionRequests = this.state.collectionRequests.filter(
        (c) => c.id !== id && c.id !== resolvedId
      );
      return;
    }

    const idx = this.state.collectionRequests.findIndex(
      (c) => c.id === id || c.id === resolvedId
    );
    if (idx === -1) {
      throw new NotFoundError(`Solicitação de coleta '${id}' não encontrada.`);
    }
    this.state.collectionRequests.splice(idx, 1);
  }

  // ===========================================================================
  // INVOICES / FATURAMENTO (LOTES DE ATENDIMENTOS POR VETERINÁRIO)
  // ===========================================================================
  public async listInvoices(filters?: { vet_id?: string; status?: string }): Promise<Invoice[]> {
    const sb = getSupabaseClient();
    const allOrders = await this.listOrders(filters?.vet_id ? { vet_id: filters.vet_id } : undefined);
    const allVets = await this.listVets();
    const vetMap = new Map(allVets.map((v) => [v.id, v]));

    if (sb) {
      let query = sb.from('invoices').select('*').order('created_at', { ascending: false });
      if (filters?.vet_id) query = query.eq('vet_id', filters.vet_id);
      if (filters?.status && filters.status !== 'todos') query = query.eq('status', filters.status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return ((data || []) as Invoice[]).map((inv) => {
        const linkedOrders = allOrders.filter((o) => o.invoice_id === inv.id);
        return {
          ...inv,
          total_amount: Number(inv.total_amount || 0),
          vet: vetMap.get(inv.vet_id),
          orders: linkedOrders,
          order_ids: linkedOrders.map((o) => o.id),
          orders_count: linkedOrders.length,
        };
      });
    }

    let list = [...(this.state.invoices || [])];
    if (filters?.vet_id) list = list.filter((i) => i.vet_id === filters.vet_id);
    if (filters?.status && filters.status !== 'todos') list = list.filter((i) => i.status === filters.status);

    return list
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map((inv) => {
        const linkedOrders = allOrders.filter((o) => o.invoice_id === inv.id);
        return {
          ...inv,
          total_amount: Number(inv.total_amount || 0),
          vet: vetMap.get(inv.vet_id),
          orders: linkedOrders,
          order_ids: linkedOrders.map((o) => o.id),
          orders_count: linkedOrders.length,
        };
      });
  }

  public async findInvoiceById(id: string): Promise<Invoice | null> {
    const list = await this.listInvoices();
    return list.find((inv) => inv.id === id) || null;
  }

  public async createInvoice(data: {
    vet_id: string;
    order_ids: string[];
    reference_month?: string;
    period_start?: string | null;
    period_end?: string | null;
    due_date?: string | null;
    boleto_filename?: string;
    boleto_pdf_url?: string | null;
    notes?: string;
  }): Promise<Invoice> {
    const uniqueOrderIds = Array.from(new Set(data.order_ids || [])).filter(Boolean);
    if (uniqueOrderIds.length === 0) {
      throw new Error('Selecione ao menos um atendimento para gerar a fatura.');
    }

    const vetOrders = await this.listOrders({ vet_id: data.vet_id });
    const targetOrders = vetOrders.filter((o) => uniqueOrderIds.includes(o.id));
    if (targetOrders.length === 0) {
      throw new NotFoundError('Nenhum atendimento válido encontrado para este veterinário.');
    }

    const alreadyBilled = targetOrders.find(
      (o) => o.invoice_id && o.payment_status && o.payment_status !== 'nao_faturado'
    );
    if (alreadyBilled) {
      throw new ConflictError(
        `O atendimento ${alreadyBilled.protocol_code} já está vinculado a uma fatura.`
      );
    }

    const totalAmount = targetOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
    const now = new Date();
    const year = now.getFullYear();
    const seq = String(Math.floor(1000 + Math.random() * 9000));
    const invoiceNumber = `FAT-${year}-${seq}`;

    const invoiceRow: Invoice = {
      id: randomUUID(),
      invoice_number: invoiceNumber,
      vet_id: data.vet_id,
      reference_month: data.reference_month || `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      period_start: data.period_start || null,
      period_end: data.period_end || null,
      due_date: data.due_date || null,
      total_amount: Number(totalAmount.toFixed(2)),
      status: 'aguardando_pagamento',
      boleto_filename: data.boleto_filename || '',
      boleto_pdf_url: data.boleto_pdf_url || null,
      notes: data.notes || '',
      paid_at: null,
      created_at: now.toISOString(),
    };

    const sb = getSupabaseClient();
    if (sb) {
      const { error: invErr } = await sb.from('invoices').insert({
        id: invoiceRow.id,
        invoice_number: invoiceRow.invoice_number,
        vet_id: invoiceRow.vet_id,
        reference_month: invoiceRow.reference_month,
        period_start: invoiceRow.period_start,
        period_end: invoiceRow.period_end,
        due_date: invoiceRow.due_date,
        total_amount: invoiceRow.total_amount,
        status: invoiceRow.status,
        boleto_filename: invoiceRow.boleto_filename,
        boleto_pdf_url: invoiceRow.boleto_pdf_url,
        notes: invoiceRow.notes,
        paid_at: null,
        created_at: invoiceRow.created_at,
      });
      if (invErr) throw new Error(invErr.message);

      const { error: ordErr } = await sb
        .from('orders')
        .update({ invoice_id: invoiceRow.id, payment_status: 'aguardando_pagamento' })
        .in('id', targetOrders.map((o) => o.id));
      if (ordErr) throw new Error(ordErr.message);
    } else {
      this.state.invoices = [invoiceRow, ...(this.state.invoices || [])];
      const idSet = new Set(targetOrders.map((o) => o.id));
      this.state.orders = this.state.orders.map((o) =>
        idSet.has(o.id)
          ? { ...o, invoice_id: invoiceRow.id, payment_status: 'aguardando_pagamento' }
          : o
      );
    }

    const enriched = await this.findInvoiceById(invoiceRow.id);
    return enriched || invoiceRow;
  }

  public async updateInvoiceBoleto(
    invoiceId: string,
    boletoFilename: string,
    boletoPdfUrl: string | null
  ): Promise<Invoice> {
    const existing = await this.findInvoiceById(invoiceId);
    if (!existing) {
      throw new NotFoundError(`Fatura '${invoiceId}' não encontrada.`);
    }

    const sb = getSupabaseClient();
    if (sb) {
      const { error } = await sb
        .from('invoices')
        .update({ boleto_filename: boletoFilename, boleto_pdf_url: boletoPdfUrl })
        .eq('id', invoiceId);
      if (error) throw new Error(error.message);
    } else {
      this.state.invoices = (this.state.invoices || []).map((inv) =>
        inv.id === invoiceId
          ? { ...inv, boleto_filename: boletoFilename, boleto_pdf_url: boletoPdfUrl }
          : inv
      );
    }

    const refreshed = await this.findInvoiceById(invoiceId);
    if (!refreshed) throw new NotFoundError(`Fatura '${invoiceId}' não encontrada.`);
    return refreshed;
  }

  public async markInvoiceAsPaid(invoiceId: string, paidAt?: string): Promise<Invoice> {
    const existing = await this.findInvoiceById(invoiceId);
    if (!existing) {
      throw new NotFoundError(`Fatura '${invoiceId}' não encontrada.`);
    }
    const resolvedPaidAt = paidAt || new Date().toISOString();

    const sb = getSupabaseClient();
    if (sb) {
      const { error: invErr } = await sb
        .from('invoices')
        .update({ status: 'pago', paid_at: resolvedPaidAt })
        .eq('id', invoiceId);
      if (invErr) throw new Error(invErr.message);

      const { error: ordErr } = await sb
        .from('orders')
        .update({ payment_status: 'pago' })
        .eq('invoice_id', invoiceId);
      if (ordErr) throw new Error(ordErr.message);
    } else {
      this.state.invoices = (this.state.invoices || []).map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'pago', paid_at: resolvedPaidAt } : inv
      );
      this.state.orders = this.state.orders.map((o) =>
        o.invoice_id === invoiceId ? { ...o, payment_status: 'pago' } : o
      );
    }

    const refreshed = await this.findInvoiceById(invoiceId);
    if (!refreshed) throw new NotFoundError(`Fatura '${invoiceId}' não encontrada.`);
    return refreshed;
  }

  public async cancelInvoice(invoiceId: string): Promise<Invoice> {
    const existing = await this.findInvoiceById(invoiceId);
    if (!existing) {
      throw new NotFoundError(`Fatura '${invoiceId}' não encontrada.`);
    }

    const sb = getSupabaseClient();
    if (sb) {
      const { error: ordErr } = await sb
        .from('orders')
        .update({ invoice_id: null, payment_status: 'nao_faturado' })
        .eq('invoice_id', invoiceId);
      if (ordErr) throw new Error(ordErr.message);

      const { error: invErr } = await sb
        .from('invoices')
        .update({ status: 'cancelado' })
        .eq('id', invoiceId);
      if (invErr) throw new Error(invErr.message);
    } else {
      this.state.orders = this.state.orders.map((o) =>
        o.invoice_id === invoiceId
          ? { ...o, invoice_id: null, payment_status: 'nao_faturado' }
          : o
      );
      this.state.invoices = (this.state.invoices || []).map((inv) =>
        inv.id === invoiceId ? { ...inv, status: 'cancelado' } : inv
      );
    }

    const refreshed = await this.findInvoiceById(invoiceId);
    if (!refreshed) throw new NotFoundError(`Fatura '${invoiceId}' não encontrada.`);
    return refreshed;
  }
}

export const repositorySingleton = new HybridVetLifeRepository();
