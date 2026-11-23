import { AnimalGender, ExamReference, ReportTemplate } from '../../domain/entities';
import { ValidationError } from '../../domain/errors/AppError';
import {
  IReferenceRepository,
  IReportTemplateRepository,
} from '../../domain/repositories/IVetLifeRepository';
import { ReferenceResolverService } from '../../domain/services/ReferenceResolverService';

export class ReferenceAndTemplateUseCases {
  private readonly referenceResolver = new ReferenceResolverService();

  constructor(
    private readonly refRepo: IReferenceRepository,
    private readonly templateRepo: IReportTemplateRepository
  ) {}

  public async listReferences(query?: {
    exam_id?: string;
    species?: string;
    gender?: string;
    age_days?: number;
  }): Promise<ExamReference[]> {
    const all = await this.refRepo.listExamReferences({
      exam_id: query?.exam_id,
      species: query?.species,
    });

    if (query?.exam_id && query?.species && query?.age_days !== undefined) {
      return this.referenceResolver.resolveReferencesForPatient(
        all,
        query.exam_id,
        query.species,
        query.gender || 'Ambos',
        Number(query.age_days)
      );
    }

    return all;
  }

  public async createReference(input: {
    exam_id: string;
    parameter_name?: string;
    species: string;
    gender?: AnimalGender;
    min_age_days?: number;
    max_age_days?: number;
    reference_text_content: string;
    min_value?: number | null;
    max_value?: number | null;
    unit?: string;
  }): Promise<ExamReference> {
    if (!input.exam_id || !input.species || !input.reference_text_content) {
      throw new ValidationError(
        'Selecione o exame, a espécie e informe os valores de referência.'
      );
    }

    return this.refRepo.createExamReference({
      exam_id: input.exam_id,
      parameter_name: input.parameter_name,
      species: input.species,
      gender: input.gender || 'Ambos',
      min_age_days: Number(input.min_age_days ?? 0),
      max_age_days: Number(input.max_age_days ?? 9125),
      reference_text_content: input.reference_text_content,
      min_value: input.min_value ?? null,
      max_value: input.max_value ?? null,
      unit: input.unit || '',
    });
  }

  public async updateReference(
    id: string,
    input: Partial<ExamReference>
  ): Promise<ExamReference> {
    return this.refRepo.updateExamReference(id, input);
  }

  public async deleteReference(id: string): Promise<void> {
    return this.refRepo.deleteExamReference(id);
  }

  public async listReportTemplates(): Promise<ReportTemplate[]> {
    return this.templateRepo.listReportTemplates();
  }

  public async createReportTemplate(input: {
    name: string;
    header_html: string;
    footer_html: string;
    body_template: string;
    dynamic_tags?: string[];
    is_default?: boolean;
  }): Promise<ReportTemplate> {
    if (!input.name) {
      throw new ValidationError('Informe um nome para o modelo de laudo.');
    }

    return this.templateRepo.createReportTemplate({
      name: input.name,
      header_html: input.header_html || '',
      footer_html: input.footer_html || '',
      body_template: input.body_template || '',
      dynamic_tags: input.dynamic_tags || [],
      is_default: Boolean(input.is_default),
    });
  }

  public async updateReportTemplate(
    id: string,
    input: Partial<Omit<ReportTemplate, 'id' | 'created_at'>>
  ): Promise<ReportTemplate> {
    return this.templateRepo.updateReportTemplate(id, input);
  }

  public async deleteReportTemplate(id: string): Promise<void> {
    return this.templateRepo.deleteReportTemplate(id);
  }
}
