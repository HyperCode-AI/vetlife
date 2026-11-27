import { NextFunction, Request, Response } from 'express';
import { AuthUseCases } from '../../application/use-cases/AuthUseCases';
import { DashboardUseCases } from '../../application/use-cases/DashboardUseCases';
import { ExamUseCases } from '../../application/use-cases/ExamUseCases';
import { OrderAndRoutineUseCases } from '../../application/use-cases/OrderAndRoutineUseCases';
import { PriceTableUseCases } from '../../application/use-cases/PriceTableUseCases';
import { PublicAndPortalUseCases } from '../../application/use-cases/PublicAndPortalUseCases';
import { ReferenceAndTemplateUseCases } from '../../application/use-cases/ReferenceAndTemplateUseCases';
import { IVetLifeRepository } from '../../domain/repositories/IVetLifeRepository';
import { ForbiddenError } from '../../domain/errors/AppError';
import {
  buildBillingReportPdfBuffer,
  buildOrderPdfBuffer,
  buildThermalLabelsPdfBuffer,
  getLocalPdfBuffer,
  uploadPdfToVercelBlob,
} from '../../utils/pdfStorage';
import {
  createCollectionRequestSchema,
  createExamReferenceSchema,
  createExamSchema,
  createPriceTableSchema,
  createReportTemplateSchema,
  internalLoginSchema,
  vetLoginSchema,
} from '../validators/schemas';

export class VetLifeController {
  private readonly authUseCases: AuthUseCases;
  private readonly examUseCases: ExamUseCases;
  private readonly priceTableUseCases: PriceTableUseCases;
  private readonly refAndTemplateUseCases: ReferenceAndTemplateUseCases;
  private readonly orderUseCases: OrderAndRoutineUseCases;
  private readonly publicUseCases: PublicAndPortalUseCases;
  private readonly dashboardUseCases: DashboardUseCases;

  constructor(private readonly repo: IVetLifeRepository) {
    this.authUseCases = new AuthUseCases(repo);
    this.examUseCases = new ExamUseCases(repo);
    this.priceTableUseCases = new PriceTableUseCases(repo, repo);
    this.refAndTemplateUseCases = new ReferenceAndTemplateUseCases(repo, repo);
    this.orderUseCases = new OrderAndRoutineUseCases(repo);
    this.publicUseCases = new PublicAndPortalUseCases(repo);
    this.dashboardUseCases = new DashboardUseCases(repo);
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================
  public health = (_req: Request, res: Response): void => {
    res.json({
      success: true,
      data: {
        service: 'VetLife Backend API',
        domain: 'vetlifelab.com.br',
        version: '1.0.0',
        storage_mode: this.repo.getStorageMode(),
        timestamp: new Date().toISOString(),
      },
    });
  };

  // ===========================================================================
  // AUTH
  // ===========================================================================
  public loginInternal = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = internalLoginSchema.parse(req.body);
      const result = await this.authUseCases.loginInternal(parsed.email, parsed.password);
      res.json({
        success: true,
        token: result.token,
        user: result.user,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  };

  public loginVet = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const parsed = vetLoginSchema.parse(req.body);
      const password = parsed.password.trim();
      const result = await this.authUseCases.loginVet(parsed.email, password);
      res.json({
        success: true,
        token: result.token,
        vet: result.vet,
        user: {
          ...result.vet,
          role: 'vet',
        },
        data: {
          token: result.token,
          vet: result.vet,
          user: {
            ...result.vet,
            role: 'vet',
          },
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getMe = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      res.json({
        success: true,
        user: req.authUser,
        data: req.authUser,
      });
    } catch (err) {
      next(err);
    }
  };

  private stripPricesForNonAdminExam = (exam: any, role?: string) => {
    if (role === 'admin') return exam;
    const { price: _p, base_price: _bp, active_price: _ap, ...rest } = exam;
    return rest;
  };

  private stripPricesForNonAdminOrder = (order: any, role?: string) => {
    if (role === 'admin') return order;
    const { total_amount: _ta, price_table_id: _pti, price_table_name: _ptn, ...restOrder } = order;
    return {
      ...restOrder,
      total_amount: 0,
      results: Array.isArray(order.results)
        ? order.results.map((r: any) => {
            const { applied_price: _ap, ...restRes } = r;
            return {
              ...restRes,
              ...(r.exam ? { exam: this.stripPricesForNonAdminExam(r.exam, role) } : {}),
            };
          })
        : [],
    };
  };

  // ===========================================================================
  // EXAMS & INPUT FIELDS (HU-01, HU-02, RN-01, RN-03)
  // ===========================================================================
  public listExams = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const role = req.authUser?.role;
      if (req.query.page !== undefined || req.query.limit !== undefined) {
        const rawPage = Number(req.query.page);
        const rawLimit = Number(req.query.limit);
        const paginated = await this.examUseCases.listExamsPaginated({
          page: Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1,
          limit: Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : 12,
          search: req.query.search ? String(req.query.search) : undefined,
          section: req.query.section ? String(req.query.section) : undefined,
        });
        res.json({
          success: true,
          data: {
            ...paginated,
            items: paginated.items.map((e) => this.stripPricesForNonAdminExam(e, role)),
          },
        });
        return;
      }
      const exams = await this.examUseCases.listExams();
      res.json({
        success: true,
        data: exams.map((e) => this.stripPricesForNonAdminExam(e, role)),
      });
    } catch (err) {
      next(err);
    }
  };

  public getExamById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const exam = await this.examUseCases.getExamById(req.params.id);
      res.json({
        success: true,
        data: this.stripPricesForNonAdminExam(exam, req.authUser?.role),
      });
    } catch (err) {
      next(err);
    }
  };

  public createExam = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const resolvedPrice = b.price ?? b.base_price ?? b.basePrice ?? b.active_price ?? 70;
      const rawLabelTemplates = Array.isArray(b.label_templates ?? b.labelTemplates)
        ? (b.label_templates ?? b.labelTemplates).filter(
            (t: any) => t && String(t.tube_type || '').trim().length > 0
          )
        : undefined;
      const derivedTubeFromTemplates =
        rawLabelTemplates && rawLabelTemplates.length > 0
          ? rawLabelTemplates.map((t: any) => String(t.tube_type).trim()).join(' + ')
          : undefined;
      const derivedQtyFromTemplates =
        rawLabelTemplates && rawLabelTemplates.length > 0
          ? rawLabelTemplates.reduce(
              (acc: number, t: any) => acc + Math.max(1, Number(t.label_qty) || 1),
              0
            )
          : undefined;
      const tubeOrMaterial =
        derivedTubeFromTemplates ??
        b.tube_type ??
        b.tubeType ??
        b.material ??
        'Sangue em tubo de tampa roxo com EDTA';
      const parsed = createExamSchema.parse({
        code: String(b.code || '').trim(),
        name: b.name,
        section: b.section,
        delivery_days: b.delivery_days ?? b.deliveryDays ?? 1,
        delivery_time_label: b.delivery_time_label ?? b.deliveryTimeLabel,
        tube_type: tubeOrMaterial,
        material: b.material ?? tubeOrMaterial,
        preparation: b.preparation,
        label_qty: derivedQtyFromTemplates ?? b.label_qty ?? b.labelQty ?? 1,
        label_templates: rawLabelTemplates,
        reference_template_id: b.reference_template_id ?? b.referenceTemplateId ?? null,
        base_price: resolvedPrice,
        price: resolvedPrice,
        input_fields: b.input_fields ?? b.inputFields,
      });
      const created = await this.examUseCases.createExam(parsed);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updateExam = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const resolvedPrice = b.price ?? b.base_price ?? b.basePrice ?? b.active_price;
      const rawLabelTemplates = Array.isArray(b.label_templates ?? b.labelTemplates)
        ? (b.label_templates ?? b.labelTemplates).filter(
            (t: any) => t && String(t.tube_type || '').trim().length > 0
          )
        : undefined;
      const derivedTubeFromTemplates =
        rawLabelTemplates && rawLabelTemplates.length > 0
          ? rawLabelTemplates.map((t: any) => String(t.tube_type).trim()).join(' + ')
          : undefined;
      const derivedQtyFromTemplates =
        rawLabelTemplates && rawLabelTemplates.length > 0
          ? rawLabelTemplates.reduce(
              (acc: number, t: any) => acc + Math.max(1, Number(t.label_qty) || 1),
              0
            )
          : undefined;
      const updated = await this.examUseCases.updateExam(req.params.id, {
        code: b.code,
        name: b.name,
        section: b.section,
        delivery_days: b.delivery_days ?? b.deliveryDays,
        delivery_time_label: b.delivery_time_label ?? b.deliveryTimeLabel,
        tube_type: derivedTubeFromTemplates ?? b.tube_type ?? b.tubeType ?? b.material,
        material: derivedTubeFromTemplates ?? b.material ?? b.tube_type ?? b.tubeType,
        preparation: b.preparation,
        label_qty: derivedQtyFromTemplates ?? b.label_qty ?? b.labelQty,
        ...(rawLabelTemplates !== undefined ? { label_templates: rawLabelTemplates } : {}),
        reference_template_id: b.reference_template_id ?? b.referenceTemplateId,
        base_price: resolvedPrice,
        price: resolvedPrice,
        input_fields: b.input_fields ?? b.inputFields,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public deleteExam = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.examUseCases.deleteExam(req.params.id);
      res.json({ success: true, data: { deleted: true, id: req.params.id } });
    } catch (err) {
      next(err);
    }
  };

  public listExamFields = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const fields = await this.examUseCases.listExamFields(req.params.id);
      res.json({ success: true, data: fields });
    } catch (err) {
      next(err);
    }
  };

  public addExamField = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      if (Array.isArray(b.fields) || Array.isArray(b)) {
        const list = Array.isArray(b) ? b : b.fields;
        const saved = await this.examUseCases.replaceExamFields(req.params.id, list);
        res.status(201).json({ success: true, data: saved });
        return;
      }

      const created = await this.examUseCases.addExamField(req.params.id, {
        field_name: b.field_name ?? b.fieldName,
        field_label: b.field_label ?? b.fieldLabel ?? b.field_name ?? b.fieldName,
        field_type: b.field_type ?? b.fieldType ?? 'text',
        unit: b.unit ?? '',
        options: Array.isArray(b.options)
          ? b.options
          : typeof b.options === 'string' && b.options.trim()
          ? b.options.split(',').map((s: string) => s.trim())
          : [],
        is_required: b.is_required ?? b.isRequired ?? true,
        display_order: Number(b.display_order ?? b.displayOrder ?? 1),
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updateExamFields = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const list = Array.isArray(b) ? b : b.fields || b.input_fields || [];
      const saved = await this.examUseCases.replaceExamFields(req.params.id, list);
      res.json({ success: true, data: saved });
    } catch (err) {
      next(err);
    }
  };

  public deleteExamField = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.examUseCases.deleteExamField(req.params.id, req.params.fieldId);
      res.json({ success: true, data: { deleted: true, id: req.params.fieldId } });
    } catch (err) {
      next(err);
    }
  };

  // ===========================================================================
  // PRICE TABLES (HU-03, RN-01, RN-04)
  // ===========================================================================
  public listPriceTables = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const tables = await this.priceTableUseCases.listPriceTables();
      res.json({ success: true, data: tables });
    } catch (err) {
      next(err);
    }
  };

  public getActivePriceTable = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const resolution = await this.priceTableUseCases.getActivePriceTable({
        date: (req.query.date as string) || undefined,
        partner_clinic: (req.query.partner_clinic as string) || undefined,
        price_table_id: (req.query.price_table_id as string) || undefined,
      });
      res.json({ success: true, data: resolution });
    } catch (err) {
      next(err);
    }
  };

  public createPriceTable = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const parsed = createPriceTableSchema.parse({
        name: b.name,
        partner_clinic: b.partner_clinic ?? b.partnerClinic ?? null,
        start_date: b.start_date ?? b.startDate,
        end_date: b.end_date ?? b.endDate,
        is_active: b.is_active ?? b.isActive ?? true,
        adjustment_percent: b.adjustment_percent ?? b.adjustmentPercent,
        prices: b.prices ?? b.items,
      });
      const created = await this.priceTableUseCases.createPriceTable(parsed);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updatePriceTable = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const updated = await this.priceTableUseCases.updatePriceTable(req.params.id, {
        name: b.name,
        partner_clinic: b.partner_clinic ?? b.partnerClinic,
        start_date: b.start_date ?? b.startDate,
        end_date: b.end_date ?? b.endDate,
        is_active: b.is_active ?? b.isActive,
        adjustment_percent: b.adjustment_percent ?? b.adjustmentPercent,
        prices: b.prices ?? b.items,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public deletePriceTable = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.priceTableUseCases.deletePriceTable(req.params.id);
      res.json({ success: true, data: { deleted: true, id: req.params.id } });
    } catch (err) {
      next(err);
    }
  };

  // ===========================================================================
  // EXAM REFERENCES & REPORT TEMPLATES (HU-04, HU-05, RN-01)
  // ===========================================================================
  public listExamReferences = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const refs = await this.refAndTemplateUseCases.listReferences({
        exam_id: (req.query.exam_id as string) || undefined,
        species: (req.query.species as string) || undefined,
        gender: (req.query.gender as string) || undefined,
        age_days: req.query.age_days ? Number(req.query.age_days) : undefined,
      });
      res.json({ success: true, data: refs });
    } catch (err) {
      next(err);
    }
  };

  public createExamReference = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const parsed = createExamReferenceSchema.parse({
        exam_id: b.exam_id ?? b.examId,
        parameter_name: b.parameter_name ?? b.parameterName,
        species: b.species,
        gender: b.gender ?? 'Ambos',
        min_age_days: b.min_age_days ?? b.minAgeDays ?? 0,
        max_age_days: b.max_age_days ?? b.maxAgeDays ?? 9125,
        reference_text_content:
          b.reference_text_content ?? b.referenceTextContent ?? b.content,
        min_value: b.min_value ?? b.minValue ?? null,
        max_value: b.max_value ?? b.maxValue ?? null,
        unit: b.unit ?? '',
      });
      const created = await this.refAndTemplateUseCases.createReference(parsed);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updateExamReference = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const updated = await this.refAndTemplateUseCases.updateReference(req.params.id, {
        exam_id: b.exam_id ?? b.examId,
        parameter_name: b.parameter_name ?? b.parameterName,
        species: b.species,
        gender: b.gender,
        min_age_days: b.min_age_days ?? b.minAgeDays,
        max_age_days: b.max_age_days ?? b.maxAgeDays,
        reference_text_content: b.reference_text_content ?? b.referenceTextContent,
        min_value: b.min_value ?? b.minValue,
        max_value: b.max_value ?? b.maxValue,
        unit: b.unit,
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public deleteExamReference = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.refAndTemplateUseCases.deleteReference(req.params.id);
      res.json({ success: true, data: { deleted: true, id: req.params.id } });
    } catch (err) {
      next(err);
    }
  };

  public listReportTemplates = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const templates = await this.refAndTemplateUseCases.listReportTemplates();
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  };

  public createReportTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const parsed = createReportTemplateSchema.parse({
        name: b.name,
        header_html: b.header_html ?? b.headerHtml ?? '',
        footer_html: b.footer_html ?? b.footerHtml ?? '',
        body_template: b.body_template ?? b.bodyTemplate ?? '',
        dynamic_tags: b.dynamic_tags ?? b.dynamicTags,
        is_default: b.is_default ?? b.isDefault ?? false,
      });
      const created = await this.refAndTemplateUseCases.createReportTemplate(parsed);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updateReportTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const updated = await this.refAndTemplateUseCases.updateReportTemplate(
        req.params.id,
        {
          name: b.name,
          header_html: b.header_html ?? b.headerHtml,
          footer_html: b.footer_html ?? b.footerHtml,
          body_template: b.body_template ?? b.bodyTemplate,
          dynamic_tags: b.dynamic_tags ?? b.dynamicTags,
          is_default: b.is_default ?? b.isDefault,
        }
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public deleteReportTemplate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.refAndTemplateUseCases.deleteReportTemplate(req.params.id);
      res.json({ success: true, data: { deleted: true, id: req.params.id } });
    } catch (err) {
      next(err);
    }
  };

  // ===========================================================================
  // PATIENTS, VETS & ORDERS (HU-06 to HU-09, RN-03, RN-04)
  // ===========================================================================
  public listPatients = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const patients = await this.orderUseCases.listPatients();
      res.json({ success: true, data: patients });
    } catch (err) {
      next(err);
    }
  };

  public createPatient = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const created = await this.orderUseCases.createPatient({
        name: b.name,
        species: b.species,
        breed: b.breed,
        gender: b.gender,
        birth_date: b.birth_date ?? b.birthDate,
        age_months: b.age_months ?? b.ageMonths,
        age_days: b.age_days ?? b.ageDays,
        tutor_name: b.tutor_name ?? b.tutorName,
        tutor_phone: b.tutor_phone ?? b.tutorPhone ?? '(11) 99999-0000',
        tutor_email: b.tutor_email ?? b.tutorEmail ?? '',
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updatePatient = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const updated = await this.orderUseCases.updatePatient(req.params.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public deletePatient = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.orderUseCases.deletePatient(req.params.id);
      res.json({ success: true, message: 'Paciente removido com sucesso.' });
    } catch (err) {
      next(err);
    }
  };

  public listVets = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const vets = await this.orderUseCases.listVets();
      const safeVets = vets.map(({ password_hash: _ph, ...safe }) => safe);
      res.json({ success: true, data: safeVets });
    } catch (err) {
      next(err);
    }
  };

  public createVet = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      if (!b.name || !b.email || !b.phone) {
        res.status(400).json({
          success: false,
          message: 'Nome, e-mail e telefone são obrigatórios.',
        });
        return;
      }
      if (!b.crmv || String(b.crmv).trim().length < 3) {
        res.status(400).json({
          success: false,
          message: 'O número do CRMV do médico veterinário é obrigatório.',
        });
        return;
      }
      if (!b.password || String(b.password).trim().length < 3) {
        res.status(400).json({
          success: false,
          message: 'Informe uma senha de acesso para o médico veterinário.',
        });
        return;
      }
      const created = await this.orderUseCases.createVet({
        name: String(b.name),
        crmv: String(b.crmv).trim().toUpperCase(),
        clinic_name: b.clinic_name ?? b.clinicName ?? '',
        email: String(b.email),
        phone: String(b.phone),
        password_hash: String(b.password).trim(),
      });
      const { password_hash: _ph, ...safe } = created;
      res.status(201).json({ success: true, data: safe });
    } catch (err) {
      next(err);
    }
  };

  public updateVet = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const patch: Record<string, any> = { ...b };
      if (b.password && String(b.password).trim()) {
        patch.password_hash = String(b.password).trim();
      }
      delete patch.password;
      const updated = await this.orderUseCases.updateVet(req.params.id, patch);
      const { password_hash: _ph, ...safe } = updated;
      res.json({ success: true, data: safe });
    } catch (err) {
      next(err);
    }
  };

  public deleteVet = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.repo.deleteVet(req.params.id);
      res.json({ success: true, message: 'Veterinário removido com sucesso.' });
    } catch (err) {
      next(err);
    }
  };

  public listUsers = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const users = await this.repo.listUsers();
      const safeUsers = users.map(({ password_hash: _ph, ...safe }) => safe);
      res.json({ success: true, data: safeUsers });
    } catch (err) {
      next(err);
    }
  };

  public createUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      if (!b.name || !b.email || !b.password) {
        res.status(400).json({
          success: false,
          message: 'Nome, e-mail e senha são obrigatórios.',
        });
        return;
      }
      const role = b.role === 'admin' ? 'admin' : 'biomedical';
      const created = await this.repo.createUser({
        name: String(b.name),
        email: String(b.email),
        role,
        password_hash: String(b.password).trim(),
      });
      const { password_hash: _ph, ...safe } = created;
      res.status(201).json({ success: true, data: safe });
    } catch (err) {
      next(err);
    }
  };

  public updateUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const patch: Partial<{
        name: string;
        email: string;
        role: 'admin' | 'biomedical';
        password_hash: string;
      }> = {};
      if (b.name) patch.name = String(b.name).trim();
      if (b.email) patch.email = String(b.email).trim().toLowerCase();
      if (b.role === 'admin' || b.role === 'biomedical') patch.role = b.role;
      if (b.password && String(b.password).trim()) {
        patch.password_hash = String(b.password).trim();
      }
      const updated = await this.repo.updateUser(req.params.id, patch);
      const { password_hash: _ph, ...safe } = updated;
      res.json({ success: true, data: safe });
    } catch (err) {
      next(err);
    }
  };

  public deleteUser = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (req.authUser?.sub === req.params.id) {
        throw new ForbiddenError('Você não pode excluir seu próprio usuário ativo.');
      }
      await this.repo.deleteUser(req.params.id);
      res.json({ success: true, message: 'Usuário removido com sucesso.' });
    } catch (err) {
      next(err);
    }
  };

  public listOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orders = await this.orderUseCases.listOrders({
        status: (req.query.status as string) || undefined,
        vet_id: (req.query.vet_id as string) || undefined,
        patient_id: (req.query.patient_id as string) || undefined,
        search: (req.query.search as string) || undefined,
      });
      const role = req.authUser?.role;
      res.json({
        success: true,
        data: orders.map((o) => this.stripPricesForNonAdminOrder(o, role)),
      });
    } catch (err) {
      next(err);
    }
  };

  public getOrderById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const order = await this.orderUseCases.getOrderById(req.params.id);
      if (req.authUser?.role === 'vet' && order.vet_id !== req.authUser.sub) {
        throw new ForbiddenError(
          'Você não tem permissão para acessar atendimentos de outro médico veterinário.'
        );
      }
      res.json({
        success: true,
        data: this.stripPricesForNonAdminOrder(order, req.authUser?.role),
      });
    } catch (err) {
      next(err);
    }
  };

  public createOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const created = await this.orderUseCases.createOrder({
        patient_id: b.patient_id ?? b.patientId,
        patient: b.patient,
        vet_id: b.vet_id ?? b.vetId,
        exam_ids: b.exam_ids ?? b.examIds ?? [],
        price_table_id: b.price_table_id ?? b.priceTableId ?? null,
        order_date: b.order_date ?? b.orderDate,
        notes: b.notes,
      });
      res.status(201).json({
        success: true,
        data: this.stripPricesForNonAdminOrder(created, req.authUser?.role),
      });
    } catch (err) {
      next(err);
    }
  };

  public updateOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const examIdsFromResults = Array.isArray(b.results)
        ? b.results.map((r: any) => r.exam_id).filter(Boolean)
        : undefined;
      const updated = await this.orderUseCases.updateOrder(req.params.id, {
        patient_id: b.patient_id ?? b.patientId,
        vet_id: b.vet_id ?? b.vetId,
        exam_ids: b.exam_ids ?? b.examIds ?? examIdsFromResults,
        price_table_id: b.price_table_id ?? b.priceTableId,
        order_date: b.order_date ?? b.orderDate,
        notes: b.notes,
        status: b.status,
      });
      res.json({
        success: true,
        data: this.stripPricesForNonAdminOrder(updated, req.authUser?.role),
      });
    } catch (err) {
      next(err);
    }
  };

  public deleteOrder = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.orderUseCases.deleteOrder(req.params.id);
      res.json({ success: true, data: { deleted: true, id: req.params.id } });
    } catch (err) {
      next(err);
    }
  };

  public getOrderLabels = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const labelsPayload = await this.orderUseCases.generateOrderLabels(req.params.id);
      res.json({ success: true, data: labelsPayload });
    } catch (err) {
      next(err);
    }
  };

  public getOrderLabelsPdf = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const labelsPayload = await this.orderUseCases.generateOrderLabels(req.params.id);
      const pdfBuffer = buildThermalLabelsPdfBuffer(labelsPayload.labels);
      const fileName = `etiquetas-zebra-50x30-${labelsPayload.protocol_code}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`
      );
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  };

  public saveExamResult = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const updatedOrder = await this.orderUseCases.saveExamResult(
        req.params.orderId,
        req.params.resultId,
        {
          dynamic_content: b.dynamic_content ?? b.dynamicContent,
          attachments: b.attachments,
          reference_snapshot: b.reference_snapshot ?? b.referenceSnapshot,
          notes: b.notes,
        }
      );
      res.json({ success: true, data: updatedOrder });
    } catch (err) {
      next(err);
    }
  };

  public releaseOrderReport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const origin = `${req.protocol}://${req.get('host') || 'vetlifelab.com.br'}`;
      const releasedOrder = await this.orderUseCases.releaseOrderReport(
        req.params.orderId,
        req.authUser?.sub,
        req.body?.notes,
        req.body?.result_id,
        origin,
        {
          template_id: req.body?.template_id,
          pdf_base64: req.body?.pdf_base64,
          exam_pdfs_base64: req.body?.exam_pdfs_base64,
        }
      );
      res.json({ success: true, data: releasedOrder });
    } catch (err) {
      next(err);
    }
  };

  public publishOrderPdf = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const origin = `${req.protocol}://${req.get('host') || 'vetlifelab.com.br'}`;
      const payload = await this.orderUseCases.publishOrderPdf(
        req.params.orderId,
        origin,
        req.body?.order_snapshot,
        {
          pdf_base64: req.body?.pdf_base64,
          exam_pdfs_base64: req.body?.exam_pdfs_base64,
        }
      );
      res.json({ success: true, data: payload });
    } catch (err) {
      next(err);
    }
  };

  public downloadPublicPdf = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    const rawPath = String(req.query.path || '');
    let buffer = getLocalPdfBuffer(rawPath);

    // Fallback stateless (Vercel Serverless): regenera o PDF direto do banco pelo protocolo
    if (!buffer && rawPath) {
      const protocolMatch = rawPath.match(/laudos\/([^/]+)\/([^/]+)\.pdf$/i);
      if (protocolMatch) {
        const protocolCode = decodeURIComponent(protocolMatch[1]);
        const fileSlug = decodeURIComponent(protocolMatch[2]);
        try {
          const order = await this.repo.findOrderByProtocolCode(protocolCode);
          if (order) {
            let singleResultId: string | undefined;
            if (fileSlug.toLowerCase().startsWith('exame-')) {
              const matchedRes = (order.results || []).find((r) =>
                fileSlug.endsWith(r.id)
              );
              singleResultId = matchedRes?.id;
            }
            buffer = buildOrderPdfBuffer(order, singleResultId);
          }
        } catch {
          // segue para 404 abaixo se não localizado
        }
      }
    }

    if (!buffer) {
      res.status(404).json({ success: false, message: 'Arquivo PDF não encontrado.' });
      return;
    }
    const fileName = rawPath.split('/').pop() || 'laudo-vetlife.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${fileName}"`
    );
    res.send(buffer);
  };

  // ===========================================================================
  // VET PORTAL & PUBLIC TUTOR PORTAL (HU-10, HU-11, HU-12, RN-02)
  // ===========================================================================
  public listVetPortalOrders = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const vetId =
        req.authUser?.role === 'vet'
          ? req.authUser.sub
          : (req.query.vet_id as string) || 'vet-carlos-001';

      const orders = await this.publicUseCases.listVetOrders(
        vetId,
        (req.query.search as string) || undefined,
        (req.query.status as string) || undefined
      );
      res.json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  };

  public listVetPortalCollections = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const vetEmail = (req.authUser?.email || '').trim().toLowerCase();
      const vetCrmv = (req.authUser?.crmv || '').trim().toUpperCase();
      const allCollections = await this.publicUseCases.listCollectionRequests({
        status: req.query.status ? String(req.query.status) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      });

      const mine = allCollections.filter((c) => {
        const cEmail = (c.email || '').trim().toLowerCase();
        const cCrmv = (c.crmv || '').trim().toUpperCase();
        if (vetEmail && cEmail && cEmail === vetEmail) return true;
        if (vetCrmv && cCrmv && cCrmv === vetCrmv) return true;
        return false;
      });

      res.json({ success: true, data: mine });
    } catch (err) {
      next(err);
    }
  };

  public listVetPortalCatalog = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const exams = await this.examUseCases.listExams();
      const tables = await this.priceTableUseCases.listPriceTables();
      const today = new Date().toISOString().slice(0, 10);
      const activeTable =
        tables.find(
          (pt) => pt.is_active && pt.start_date <= today && pt.end_date >= today
        ) ||
        tables.find((pt) => pt.is_active) ||
        tables[0];

      const priceMap = new Map<string, number>();
      if (activeTable?.prices) {
        for (const p of activeTable.prices) {
          priceMap.set(p.exam_id, Number(p.price));
        }
      }

      const enriched = exams.map((ex) => {
        const resolvedPrice =
          priceMap.get(ex.id) ?? Number(ex.price ?? ex.base_price ?? 0);
        return {
          ...ex,
          price: resolvedPrice,
          base_price: resolvedPrice,
          price_table_name: activeTable?.name || 'Tabela Vigente',
        };
      });

      res.json({
        success: true,
        data: {
          price_table_name: activeTable?.name || 'Tabela Vigente',
          start_date: activeTable?.start_date || null,
          end_date: activeTable?.end_date || null,
          exams: enriched,
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getPublicProtocolReport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const reportData = await this.publicUseCases.getReportByProtocolCode(
        req.params.protocolCode
      );
      res.json({ success: true, data: reportData });
    } catch (err) {
      next(err);
    }
  };

  public createCollectionRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const parsed = createCollectionRequestSchema.parse({
        clinic_or_tutor_name:
          b.clinic_or_tutor_name ?? b.clinicOrTutorName ?? b.name ?? b.tutor_name,
        crmv: b.crmv ?? '',
        phone: b.phone ?? b.tutor_phone,
        email: b.email ?? '',
        address: b.address,
        preferred_date: b.preferred_date ?? b.preferredDate ?? b.scheduled_date,
        notes: b.notes ?? '',
      });
      const scheduledDate = b.scheduled_date ?? b.scheduledDate;
      const scheduledTime = b.scheduled_time ?? b.scheduledTime;
      const created = await this.publicUseCases.createCollectionRequest({
        ...parsed,
        ...(scheduledDate ? { scheduled_date: String(scheduledDate).trim() } : {}),
        ...(scheduledTime ? { scheduled_time: String(scheduledTime).trim() } : {}),
        ...(b.status ? { status: b.status } : {}),
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public listCollectionRequests = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const list = await this.publicUseCases.listCollectionRequests({
        status: req.query.status ? String(req.query.status) : undefined,
        search: req.query.search ? String(req.query.search) : undefined,
      });
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  };

  public getCollectionRequestById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const item = await this.publicUseCases.getCollectionRequestById(req.params.id);
      res.json({ success: true, data: item });
    } catch (err) {
      next(err);
    }
  };

  public updateCollectionRequestStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const rawStatus = String(b.status || '').trim();
      const rawDate = b.scheduled_date ?? b.scheduledDate ?? b.date;
      const rawTime = b.scheduled_time ?? b.scheduledTime ?? b.time;
      const scheduledDate = rawDate !== undefined && rawDate !== null ? String(rawDate).trim() : undefined;
      const scheduledTime = rawTime !== undefined && rawTime !== null ? String(rawTime).trim() : undefined;
      const updated = await this.publicUseCases.updateCollectionRequestStatus(
        req.params.id,
        rawStatus,
        scheduledDate,
        scheduledTime
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public updateCollectionRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const updated = await this.publicUseCases.updateCollectionRequest(req.params.id, {
        ...(b.clinic_or_tutor_name !== undefined ? { clinic_or_tutor_name: String(b.clinic_or_tutor_name) } : {}),
        ...(b.crmv !== undefined ? { crmv: String(b.crmv).trim().toUpperCase() } : {}),
        ...(b.phone !== undefined ? { phone: String(b.phone) } : {}),
        ...(b.email !== undefined ? { email: String(b.email) } : {}),
        ...(b.address !== undefined ? { address: String(b.address) } : {}),
        ...(b.preferred_date !== undefined ? { preferred_date: String(b.preferred_date) } : {}),
        ...(b.scheduled_date ?? b.scheduledDate ?? b.date
          ? { scheduled_date: String(b.scheduled_date ?? b.scheduledDate ?? b.date).trim() }
          : {}),
        ...(b.scheduled_time ?? b.scheduledTime ?? b.time
          ? { scheduled_time: String(b.scheduled_time ?? b.scheduledTime ?? b.time).trim() }
          : {}),
        ...(b.notes !== undefined ? { notes: String(b.notes) } : {}),
        ...(b.status !== undefined ? { status: b.status } : {}),
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public deleteCollectionRequest = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      await this.publicUseCases.deleteCollectionRequest(req.params.id);
      res.json({ success: true, data: { deleted: true, id: req.params.id } });
    } catch (err) {
      next(err);
    }
  };

  // ===========================================================================
  // DASHBOARDS (Operacional & Financeiro RN-01)
  // ===========================================================================
  public getOperationalDashboard = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await this.dashboardUseCases.getOperationalDashboard();
      const role = req.authUser?.role;
      res.json({
        success: true,
        data: {
          ...data,
          recent_orders: Array.isArray(data.recent_orders)
            ? data.recent_orders.map((o) => this.stripPricesForNonAdminOrder(o, role))
            : [],
        },
      });
    } catch (err) {
      next(err);
    }
  };

  public getFinancialDashboard = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const data = await this.dashboardUseCases.getFinancialDashboard();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  };

  // ===========================================================================
  // INVOICES / FATURAMENTO (ADMIN + PORTAL DO VETERINÁRIO)
  // ===========================================================================
  public listInvoices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const list = await this.repo.listInvoices({
        vet_id: req.query.vet_id ? String(req.query.vet_id) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      res.json({ success: true, data: list });
    } catch (err) {
      next(err);
    }
  };

  public listVetPortalInvoices = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const vetId = req.authUser?.sub || '';
      const list = await this.repo.listInvoices({
        vet_id: vetId,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      res.json({ success: true, data: list.filter((i) => i.status !== 'cancelado') });
    } catch (err) {
      next(err);
    }
  };

  public createInvoice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const orderIds = Array.isArray(b.order_ids) ? b.order_ids.map(String) : [];
      if (!b.vet_id || orderIds.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Selecione o veterinário e ao menos um atendimento para gerar a fatura.',
        });
        return;
      }

      let boletoUrl: string | null = b.boleto_pdf_url ? String(b.boleto_pdf_url) : null;
      const boletoFilename = b.boleto_filename ? String(b.boleto_filename) : '';

      if (b.boleto_pdf_base64 && typeof b.boleto_pdf_base64 === 'string') {
        const cleanBase64 = b.boleto_pdf_base64.includes(',')
          ? b.boleto_pdf_base64.split(',').pop() || ''
          : b.boleto_pdf_base64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const safeName = (boletoFilename || `boleto-${Date.now()}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const origin = `${req.protocol}://${req.get('host') || 'vetlifelab.com.br'}`;
        const { uploadPdfToVercelBlob } = await import('../../utils/pdfStorage');
        const uploaded = await uploadPdfToVercelBlob(`boletos/${Date.now()}-${safeName}`, buffer, origin);
        boletoUrl = uploaded.url;
      }

      const created = await this.repo.createInvoice({
        vet_id: String(b.vet_id),
        order_ids: orderIds,
        reference_month: b.reference_month ? String(b.reference_month) : undefined,
        period_start: b.period_start ? String(b.period_start) : null,
        period_end: b.period_end ? String(b.period_end) : null,
        due_date: b.due_date ? String(b.due_date) : null,
        boleto_filename: boletoFilename,
        boleto_pdf_url: boletoUrl,
        notes: b.notes ? String(b.notes) : '',
      });
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  };

  public updateInvoiceBoleto = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const boletoFilename = b.boleto_filename ? String(b.boleto_filename) : 'boleto.pdf';
      let boletoUrl: string | null = b.boleto_pdf_url ? String(b.boleto_pdf_url) : null;

      if (b.boleto_pdf_base64 && typeof b.boleto_pdf_base64 === 'string') {
        const cleanBase64 = b.boleto_pdf_base64.includes(',')
          ? b.boleto_pdf_base64.split(',').pop() || ''
          : b.boleto_pdf_base64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const safeName = boletoFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const origin = `${req.protocol}://${req.get('host') || 'vetlifelab.com.br'}`;
        const { uploadPdfToVercelBlob } = await import('../../utils/pdfStorage');
        const uploaded = await uploadPdfToVercelBlob(`boletos/${Date.now()}-${safeName}`, buffer, origin);
        boletoUrl = uploaded.url;
      }

      const updated = await this.repo.updateInvoiceBoleto(
        req.params.id,
        boletoFilename,
        boletoUrl
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public markInvoiceAsPaid = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const paidAt = req.body?.paid_at ? String(req.body.paid_at) : undefined;
      const updated = await this.repo.markInvoiceAsPaid(req.params.id, paidAt);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public cancelInvoice = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const updated = await this.repo.cancelInvoice(req.params.id);
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  };

  public publishBillingReportPdf = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const b = req.body || {};
      const isVet = req.authUser?.role === 'vet';

      const allowedStatuses = new Set([
        'todos',
        'nao_faturado',
        'aguardando_pagamento',
        'pago',
        'cancelado',
      ]);
      const rawStatus = typeof b.status === 'string' ? b.status.trim() : 'todos';
      const statusFilter = allowedStatuses.has(rawStatus) ? rawStatus : 'todos';

      const startDate =
        typeof b.start_date === 'string' && b.start_date.trim()
          ? b.start_date.trim().slice(0, 10)
          : undefined;
      const endDate =
        typeof b.end_date === 'string' && b.end_date.trim()
          ? b.end_date.trim().slice(0, 10)
          : undefined;

      const rawPatientId =
        typeof b.patient_id === 'string' && b.patient_id.trim() && b.patient_id.trim() !== 'todos'
          ? b.patient_id.trim()
          : undefined;

      // Segurança: veterinário NUNCA pode consultar outro vet_id
      const effectiveVetId = isVet
        ? req.authUser?.sub || ''
        : typeof b.vet_id === 'string' && b.vet_id.trim() && b.vet_id.trim() !== 'todos'
        ? b.vet_id.trim()
        : undefined;

      const [rawInvoices, rawOrders] = await Promise.all([
        this.repo.listInvoices({ vet_id: effectiveVetId || undefined }),
        this.repo.listOrders({
          vet_id: effectiveVetId || undefined,
          patient_id: rawPatientId || undefined,
        }),
      ]);

      // 1. Filtro de segurança e vet_id
      let invoices = rawInvoices.filter((inv) => {
        if (isVet && inv.status === 'cancelado') return false;
        if (effectiveVetId && inv.vet_id !== effectiveVetId) return false;
        return true;
      });

      let orders = rawOrders.filter((ord) => {
        if (effectiveVetId && ord.vet_id !== effectiveVetId) return false;
        if (rawPatientId && ord.patient_id !== rawPatientId) return false;
        return true;
      });

      // 2. Filtro de período (YYYY-MM-DD sobre created_at.slice(0, 10))
      const inDateRange = (createdAt?: string): boolean => {
        if (!startDate && !endDate) return true;
        const d = String(createdAt || '').slice(0, 10);
        if (!d) return false;
        if (startDate && d < startDate) return false;
        if (endDate && d > endDate) return false;
        return true;
      };

      invoices = invoices.filter((inv) => inDateRange(inv.created_at));
      orders = orders.filter((ord) => inDateRange(ord.created_at));

      // 3. Filtro por patient_id nas faturas (manter faturas que tenham ao menos 1 pedido do paciente)
      if (rawPatientId) {
        const matchingInvoiceIds = new Set(
          orders.map((o) => o.invoice_id).filter((id): id is string => Boolean(id))
        );
        invoices = invoices.filter((inv) => {
          if (matchingInvoiceIds.has(inv.id)) return true;
          if (Array.isArray(inv.orders) && inv.orders.some((o) => o.patient_id === rawPatientId)) {
            return true;
          }
          return false;
        });
      }

      // 4. Filtro por status
      if (statusFilter === 'nao_faturado') {
        invoices = [];
        orders = orders.filter((ord) => (ord.payment_status || 'nao_faturado') === 'nao_faturado');
      } else if (statusFilter === 'cancelado') {
        invoices = invoices.filter((inv) => inv.status === 'cancelado');
        const cancelledInvoiceIds = new Set(invoices.map((inv) => inv.id));
        const cancelledOrderIds = new Set<string>();
        for (const inv of invoices) {
          (inv.order_ids || []).forEach((id) => cancelledOrderIds.add(id));
          (inv.orders || []).forEach((o) => cancelledOrderIds.add(o.id));
        }
        orders = orders.filter(
          (ord) =>
            (ord.invoice_id && cancelledInvoiceIds.has(ord.invoice_id)) ||
            cancelledOrderIds.has(ord.id)
        );
      } else if (statusFilter === 'aguardando_pagamento' || statusFilter === 'pago') {
        invoices = invoices.filter((inv) => inv.status === statusFilter);
        orders = orders.filter((ord) => ord.payment_status === statusFilter);
      }

      // 5. Resumo financeiro consistente (sem dupla contagem entre faturas e pedidos vinculados)
      const unbilledAmount = orders
        .filter((o) => (o.payment_status || 'nao_faturado') === 'nao_faturado')
        .reduce((acc, o) => acc + Number(o.total_amount || 0), 0);

      const cancelledAmount = invoices
        .filter((i) => i.status === 'cancelado')
        .reduce((acc, i) => acc + Number(i.total_amount || 0), 0);

      const paidAmount = rawPatientId
        ? orders
            .filter((o) => o.payment_status === 'pago')
            .reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
        : invoices
            .filter((i) => i.status === 'pago')
            .reduce((acc, i) => acc + Number(i.total_amount || 0), 0);

      const pendingPaymentAmount = rawPatientId
        ? orders
            .filter((o) => o.payment_status === 'aguardando_pagamento')
            .reduce((acc, o) => acc + Number(o.total_amount || 0), 0)
        : invoices
            .filter((i) => i.status === 'aguardando_pagamento')
            .reduce((acc, i) => acc + Number(i.total_amount || 0), 0);

      const totalAmount =
        statusFilter === 'cancelado'
          ? cancelledAmount
          : paidAmount + pendingPaymentAmount + unbilledAmount;

      // 6. Resolver rótulos legíveis para veterinário e paciente
      let vetLabel = 'Todos os veterinarios';
      if (effectiveVetId) {
        const vetObj =
          invoices.find((i) => i.vet)?.vet ||
          orders.find((o) => o.vet)?.vet ||
          (await this.repo.findVetById(effectiveVetId));
        vetLabel = vetObj
          ? `${vetObj.name}${vetObj.crmv ? ` (${vetObj.crmv})` : ''}`
          : effectiveVetId;
      }

      let patientLabel = 'Todos os pacientes';
      if (rawPatientId) {
        const patientObj =
          orders.find((o) => o.patient)?.patient || (await this.repo.findPatientById(rawPatientId));
        patientLabel = patientObj
          ? `${patientObj.name}${patientObj.tutor_name ? ` (Tutor: ${patientObj.tutor_name})` : ''}`
          : rawPatientId;
      }

      const pdfBuffer = buildBillingReportPdfBuffer({
        generated_at: new Date().toISOString(),
        filters: {
          scope: isVet ? 'vet' : 'admin',
          status: statusFilter,
          start_date: startDate,
          end_date: endDate,
          vet_label: vetLabel,
          patient_label: patientLabel,
        },
        summary: {
          invoices_count: invoices.length,
          orders_count: orders.length,
          total_amount: totalAmount,
          paid_amount: paidAmount,
          pending_payment_amount: pendingPaymentAmount,
          unbilled_amount: unbilledAmount,
          cancelled_amount: cancelledAmount,
        },
        invoices,
        orders,
      });

      const timestampSlug = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `relatorio-faturamento-${isVet ? 'vet' : 'admin'}-${timestampSlug}.pdf`;
      const fallbackOrigin = `${req.protocol}://${req.get('host') || 'vetlifelab.com.br'}`;
      const uploaded = await uploadPdfToVercelBlob(
        `relatorios/faturamento/${filename}`,
        pdfBuffer,
        fallbackOrigin
      );

      res.status(200).json({
        success: true,
        data: {
          pdf_url: uploaded.url,
          filename,
          storage: uploaded.storage,
        },
      });
    } catch (err) {
      next(err);
    }
  };
}
