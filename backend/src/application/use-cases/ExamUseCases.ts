import { Exam, ExamInputField } from '../../domain/entities';
import { ConflictError, NotFoundError, ValidationError } from '../../domain/errors/AppError';
import { IExamRepository } from '../../domain/repositories/IVetLifeRepository';

export class ExamUseCases {
  constructor(private readonly examRepo: IExamRepository) { }

  public async listExams(): Promise<Exam[]> {
    return this.examRepo.listExams();
  }

  public async listExamsPaginated(params: {
    page?: number;
    limit?: number;
    search?: string;
    section?: string;
  }): Promise<{
    items: Exam[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const all = await this.examRepo.listExams();
    const q = (params.search || '').trim().toLowerCase();
    const sec = (params.section || '').trim();

    const filtered = all.filter((ex) => {
      if (sec && sec !== 'todos' && ex.section !== sec) return false;
      if (!q) return true;
      return (
        ex.code.toLowerCase().includes(q) ||
        ex.name.toLowerCase().includes(q) ||
        ex.section.toLowerCase().includes(q)
      );
    });

    const limit = Math.max(1, Math.min(100, Number(params.limit) || 12));
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const page = Math.min(Math.max(1, Number(params.page) || 1), totalPages);
    const items = filtered.slice((page - 1) * limit, page * limit);

    return { items, total, page, limit, totalPages };
  }

  public async getExamById(id: string): Promise<Exam> {
    const exam = await this.examRepo.findExamById(id);
    if (!exam) {
      throw new NotFoundError(`Exame '${id}' não encontrado.`);
    }
    return exam;
  }

  public async createExam(input: {
    code: string;
    name: string;
    section: string;
    delivery_days?: number;
    delivery_time_label?: string;
    tube_type: string;
    material?: string;
    preparation?: string;
    label_qty?: number;
    reference_template_id?: string | null;
    base_price?: number;
    price?: number;
    input_fields?: Array<Partial<ExamInputField> & { field_name: string }>;
  }): Promise<Exam> {
    if (!input.code || !input.name || !input.section || (!input.tube_type && !input.material)) {
      throw new ValidationError(
        'Código, nome, seção técnica e tipo de tubo/amostra são obrigatórios.'
      );
    }

    const existing = await this.examRepo.findExamByCode(input.code);
    if (existing) {
      throw new ConflictError(`Já existe um exame cadastrado com o código '${input.code}'.`);
    }

    const normalizedFields: ExamInputField[] | undefined = input.input_fields?.map(
      (f, idx) => ({
        id: f.id || '',
        exam_id: f.exam_id || '',
        field_name: f.field_name,
        field_label: f.field_label || f.field_name,
        field_type: f.field_type || 'text',
        unit: f.unit || '',
        options: f.options || [],
        is_required: f.is_required ?? true,
        display_order: f.display_order ?? idx + 1,
      })
    );

    const deliveryDays = Number(input.delivery_days ?? 1);
    const resolvedPrice = Number(input.price ?? input.base_price ?? 70);
    const tubeOrMaterial = input.tube_type || input.material || 'Tubo EDTA';

    return this.examRepo.createExam({
      code: input.code,
      name: input.name,
      section: input.section,
      delivery_days: deliveryDays,
      delivery_time_label:
        input.delivery_time_label ||
        `${deliveryDays} ${deliveryDays === 1 ? 'dia útil' : 'dias úteis'}`,
      tube_type: tubeOrMaterial,
      material: input.material || tubeOrMaterial,
      preparation: input.preparation,
      label_qty: Number(input.label_qty ?? 1),
      reference_template_id: input.reference_template_id || '',
      base_price: resolvedPrice,
      price: resolvedPrice,
      input_fields: normalizedFields,
    });
  }

  public async updateExam(id: string, input: Partial<Exam>): Promise<Exam> {
    return this.examRepo.updateExam(id, input);
  }

  public async deleteExam(id: string): Promise<void> {
    return this.examRepo.deleteExam(id);
  }

  public async listExamFields(examId: string): Promise<ExamInputField[]> {
    return this.examRepo.listExamInputFields(examId);
  }

  public async addExamField(
    examId: string,
    field: Omit<ExamInputField, 'id' | 'exam_id'>
  ): Promise<ExamInputField> {
    if (!field.field_name) {
      throw new ValidationError('Informe o identificador do campo personalizado antes de salvar.');
    }
    return this.examRepo.addExamInputField(examId, {
      field_name: field.field_name,
      field_label: field.field_label || field.field_name,
      field_type: field.field_type || 'text',
      unit: field.unit || '',
      options: Array.isArray(field.options) ? field.options : [],
      is_required: field.is_required ?? true,
      display_order: Number(field.display_order ?? 1),
    });
  }

  public async replaceExamFields(
    examId: string,
    fields: Array<Omit<ExamInputField, 'id' | 'exam_id'> & { id?: string }>
  ): Promise<ExamInputField[]> {
    return this.examRepo.saveExamInputFields(examId, fields);
  }

  public async deleteExamField(examId: string, fieldId: string): Promise<void> {
    return this.examRepo.deleteExamInputField(examId, fieldId);
  }
}
