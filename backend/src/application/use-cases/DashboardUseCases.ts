import { IVetLifeRepository } from '../../domain/repositories/IVetLifeRepository';

export class DashboardUseCases {
  constructor(private readonly repo: IVetLifeRepository) {}

  public async getOperationalDashboard() {
    const [orders, patients, vets, exams, collectionRequests] = await Promise.all([
      this.repo.listOrders(),
      this.repo.listPatients(),
      this.repo.listVets(),
      this.repo.listExams(),
      this.repo.listCollectionRequests(),
    ]);

    const pendingCount = orders.filter((o) => o.status === 'pendente').length;
    const inAnalysisCount = orders.filter((o) => o.status === 'em_analise').length;
    const completedCount = orders.filter((o) => o.status === 'concluido').length;

    const totalExamsRequested = orders.reduce(
      (sum, o) => sum + (o.results?.length || 0),
      0
    );

    const examsBySection: Record<string, number> = {};
    for (const order of orders) {
      for (const res of order.results || []) {
        const sec = res.exam?.section || 'Geral';
        examsBySection[sec] = (examsBySection[sec] || 0) + 1;
      }
    }

    return {
      summary: {
        total_orders: orders.length,
        orders_today: orders.length,
        pending_orders: pendingCount,
        in_analysis_orders: inAnalysisCount,
        completed_orders: completedCount,
        total_exams_performed: totalExamsRequested,
        registered_patients: patients.length,
        partner_vets: vets.length,
        catalog_exams: exams.length,
        pending_collections: collectionRequests.filter((c) => c.status === 'pendente')
          .length,
      },
      exams_by_section: Object.entries(examsBySection).map(([section, count]) => ({
        section,
        count,
      })),
      recent_orders: orders.slice(0, 8),
      recent_collection_requests: collectionRequests.slice(0, 5),
    };
  }

  /**
   * RN-01: Exclusive Admin Financial Dashboard & Simple Balance Sheet
   */
  public async getFinancialDashboard() {
    const [orders, priceTables, exams] = await Promise.all([
      this.repo.listOrders(),
      this.repo.listPriceTables(),
      this.repo.listExams(),
    ]);

    const grossRevenue = orders.reduce((acc, o) => acc + Number(o.total_amount || 0), 0);
    const completedRevenue = orders
      .filter((o) => o.status === 'concluido')
      .reduce((acc, o) => acc + Number(o.total_amount || 0), 0);
    const receivableRevenue = grossRevenue - completedRevenue;
    const averageTicket =
      orders.length > 0 ? Number((grossRevenue / orders.length).toFixed(2)) : 0;

    // Revenue by Price Table (Vigência / Convênio)
    const byPriceTableMap: Record<
      string,
      { table_name: string; orders_count: number; total_revenue: number }
    > = {};
    for (const order of orders) {
      const key = order.price_table_id || 'pt-default';
      const name = order.price_table_name || 'Tabela Geral VetLife 2026';
      if (!byPriceTableMap[key]) {
        byPriceTableMap[key] = {
          table_name: name,
          orders_count: 0,
          total_revenue: 0,
        };
      }
      byPriceTableMap[key].orders_count += 1;
      byPriceTableMap[key].total_revenue = Number(
        (byPriceTableMap[key].total_revenue + Number(order.total_amount || 0)).toFixed(2)
      );
    }

    // Revenue by Exam
    const byExamMap: Record<
      string,
      { exam_code: string; exam_name: string; section: string; quantity: number; revenue: number }
    > = {};
    for (const order of orders) {
      for (const res of order.results || []) {
        const exam = res.exam || exams.find((e) => e.id === res.exam_id);
        const key = res.exam_id;
        if (!byExamMap[key]) {
          byExamMap[key] = {
            exam_code: exam?.code || 'EXM',
            exam_name: exam?.name || 'Exame',
            section: exam?.section || 'Geral',
            quantity: 0,
            revenue: 0,
          };
        }
        byExamMap[key].quantity += 1;
        byExamMap[key].revenue = Number(
          (byExamMap[key].revenue + Number(res.applied_price || 0)).toFixed(2)
        );
      }
    }

    // Simple Balance Sheet (Balancete Operacional Mensal Estimado + Realizado)
    const reagentsAndKitsCost = Number((grossRevenue * 0.24).toFixed(2));
    const logisticsAndTubesCost = Number((grossRevenue * 0.08).toFixed(2));
    const qualityControlCost = Number((grossRevenue * 0.05).toFixed(2));
    const totalOperationalCosts = Number(
      (reagentsAndKitsCost + logisticsAndTubesCost + qualityControlCost).toFixed(2)
    );
    const netOperatingResult = Number((grossRevenue - totalOperationalCosts).toFixed(2));
    const marginPercent =
      grossRevenue > 0 ? Number(((netOperatingResult / grossRevenue) * 100).toFixed(1)) : 63.0;

    return {
      indicators: {
        gross_revenue: Number(grossRevenue.toFixed(2)),
        completed_revenue: Number(completedRevenue.toFixed(2)),
        receivable_revenue: Number(receivableRevenue.toFixed(2)),
        average_ticket: averageTicket,
        total_orders: orders.length,
        active_price_tables: priceTables.filter((pt) => pt.is_active).length,
      },
      balance_sheet: {
        period: 'Março / 2026 (Acumulado Operacional)',
        entries: [
          {
            category: 'Receita de Exames — Convênios e Clínicas Parceiras',
            type: 'credit',
            amount: Number(
              orders
                .filter((o) => o.price_table_id === 'pt-2026-parceiros')
                .reduce((s, o) => s + Number(o.total_amount), 0)
                .toFixed(2)
            ),
          },
          {
            category: 'Receita de Exames — Tabela Particular Padrão',
            type: 'credit',
            amount: Number(
              orders
                .filter((o) => o.price_table_id !== 'pt-2026-parceiros')
                .reduce((s, o) => s + Number(o.total_amount), 0)
                .toFixed(2)
            ),
          },
          {
            category: 'Insumos, Reagentes Hematológicos e Bioquímicos',
            type: 'debit',
            amount: reagentsAndKitsCost,
          },
          {
            category: 'Tubos de Coleta, Etiquetas e Logística Motoboy',
            type: 'debit',
            amount: logisticsAndTubesCost,
          },
          {
            category: 'Controle de Qualidade Interno/Externo (PNCQ)',
            type: 'debit',
            amount: qualityControlCost,
          },
        ],
        total_credits: Number(grossRevenue.toFixed(2)),
        total_debits: totalOperationalCosts,
        net_balance: netOperatingResult,
        operating_margin_percent: marginPercent,
      },
      revenue_by_price_table: Object.values(byPriceTableMap),
      revenue_by_exam: Object.values(byExamMap),
    };
  }
}
