import { Exam, PriceTable } from '../entities';

export interface ActivePricingResolution {
  activeTable: PriceTable | null;
  priceByExamId: Record<string, number>;
  referenceDate: string;
}

/**
 * SRP & OCP: Domain service dedicated strictly to RN-04
 * ("O cálculo do valor do exame em um atendimento deve respeitar a tabela de preços ativa com base na data da solicitação").
 */
export class PricingService {
  public resolveActivePriceTable(
    priceTables: PriceTable[],
    exams: Exam[],
    requestDate?: string,
    partnerClinic?: string | null,
    explicitPriceTableId?: string | null
  ): ActivePricingResolution {
    const targetDate = (requestDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

    let selectedTable: PriceTable | null = null;

    if (explicitPriceTableId) {
      selectedTable = priceTables.find((pt) => pt.id === explicitPriceTableId) || null;
    }

    if (!selectedTable) {
      const validTables = priceTables.filter((pt) => {
        if (!pt.is_active) return false;
        const start = pt.start_date.slice(0, 10);
        const end = pt.end_date.slice(0, 10);
        return targetDate >= start && targetDate <= end;
      });

      if (partnerClinic) {
        const normalizedClinic = partnerClinic.trim().toLowerCase();
        selectedTable =
          validTables.find(
            (pt) => (pt.partner_clinic || '').trim().toLowerCase() === normalizedClinic
          ) || null;
      }

      if (!selectedTable) {
        selectedTable =
          validTables.find((pt) => !pt.partner_clinic) || validTables[0] || null;
      }
    }

    if (!selectedTable && priceTables.length > 0) {
      selectedTable = priceTables.find((pt) => pt.is_active) || priceTables[0];
    }

    const priceByExamId: Record<string, number> = {};
    for (const exam of exams) {
      priceByExamId[exam.id] = Number(exam.base_price ?? 65);
    }

    if (selectedTable?.prices) {
      for (const item of selectedTable.prices) {
        priceByExamId[item.exam_id] = Number(item.price);
      }
    }

    return {
      activeTable: selectedTable,
      priceByExamId,
      referenceDate: targetDate,
    };
  }
}
