import { PriceTable } from '../../domain/entities';
import { NotFoundError, ValidationError } from '../../domain/errors/AppError';
import {
  IExamRepository,
  IPriceTableRepository,
} from '../../domain/repositories/IVetLifeRepository';
import { ActivePricingResolution, PricingService } from '../../domain/services/PricingService';

export class PriceTableUseCases {
  private readonly pricingService = new PricingService();

  constructor(
    private readonly priceTableRepo: IPriceTableRepository,
    private readonly examRepo: IExamRepository
  ) {}

  public async listPriceTables(): Promise<PriceTable[]> {
    return this.priceTableRepo.listPriceTables();
  }

  public async getActivePriceTable(params?: {
    date?: string;
    partner_clinic?: string;
    price_table_id?: string;
  }): Promise<ActivePricingResolution> {
    const [tables, exams] = await Promise.all([
      this.priceTableRepo.listPriceTables(),
      this.examRepo.listExams(),
    ]);

    return this.pricingService.resolveActivePriceTable(
      tables,
      exams,
      params?.date,
      params?.partner_clinic,
      params?.price_table_id
    );
  }

  public async createPriceTable(input: {
    name: string;
    partner_clinic?: string | null;
    start_date: string;
    end_date: string;
    is_active?: boolean;
    prices?: Array<{ exam_id: string; price: number }>;
    adjustment_percent?: number;
  }): Promise<PriceTable> {
    if (!input.name || !input.start_date || !input.end_date) {
      throw new ValidationError(
        'Informe o nome da tabela e as datas de início e fim da vigência.'
      );
    }

    if (input.end_date < input.start_date) {
      throw new ValidationError('A data final de vigência deve ser maior ou igual à data inicial.');
    }

    let resolvedPrices = input.prices || [];
    if (resolvedPrices.length === 0) {
      const exams = await this.examRepo.listExams();
      const multiplier =
        input.adjustment_percent !== undefined ? 1 + Number(input.adjustment_percent) / 100 : 1;
      resolvedPrices = exams.map((exam) => ({
        exam_id: exam.id,
        price: Number(((exam.base_price ?? 68) * multiplier).toFixed(2)),
      }));
    }

    return this.priceTableRepo.createPriceTable(
      {
        name: input.name,
        partner_clinic: input.partner_clinic || null,
        start_date: input.start_date,
        end_date: input.end_date,
        is_active: input.is_active ?? true,
      },
      resolvedPrices
    );
  }

  public async updatePriceTable(
    id: string,
    input: {
      name?: string;
      partner_clinic?: string | null;
      start_date?: string;
      end_date?: string;
      is_active?: boolean;
      prices?: Array<{ exam_id: string; price: number }>;
      adjustment_percent?: number;
    }
  ): Promise<PriceTable> {
    const existing = await this.priceTableRepo.findPriceTableById(id);
    if (!existing) {
      throw new NotFoundError(`Tabela de preços '${id}' não encontrada.`);
    }

    let updatedPrices = input.prices;
    if (!updatedPrices && input.adjustment_percent !== undefined) {
      const factor = 1 + Number(input.adjustment_percent) / 100;
      const baseList = existing.prices || [];
      updatedPrices = baseList.map((p) => ({
        exam_id: p.exam_id,
        price: Number((Number(p.price) * factor).toFixed(2)),
      }));
    }

    return this.priceTableRepo.updatePriceTable(
      id,
      {
        name: input.name,
        partner_clinic: input.partner_clinic,
        start_date: input.start_date,
        end_date: input.end_date,
        is_active: input.is_active,
      },
      updatedPrices
    );
  }

  public async deletePriceTable(id: string): Promise<void> {
    return this.priceTableRepo.deletePriceTable(id);
  }
}
