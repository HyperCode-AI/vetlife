import { Exam, ExamResult, Order, Patient, ReportTemplate, Vet } from '../entities';

/**
 * SRP & OCP: Domain service responsible for HU-05
 * Renders dynamic report templates replacing tags like {{paciente}}, {{protocolo}}, {{resultados}}, {{referencias}}.
 */
export class ReportRendererService {
  public renderExamResultHtml(params: {
    template: ReportTemplate;
    order: Order;
    patient: Patient;
    vet: Vet;
    exam: Exam;
    result: ExamResult;
  }): string {
    const { template, order, patient, vet, exam, result } = params;

    const resultsRows = Object.entries(result.dynamic_content || {})
      .map(([key, value]) => {
        const fieldDef = exam.input_fields?.find((f) => f.field_name === key);
        const label = fieldDef?.field_label || key;
        const unit = fieldDef?.unit ? ` ${fieldDef.unit}` : '';
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">${label}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;color:#0f766e;font-weight:700;">${String(value)}${unit}</td>
        </tr>`;
      })
      .join('');

    const resultadosTable = `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px;">
      <thead>
        <tr style="background:#f1f5f9;text-align:left;">
          <th style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Parâmetro Analisado</th>
          <th style="padding:8px 10px;border-bottom:2px solid #cbd5e1;">Resultado Obtido</th>
        </tr>
      </thead>
      <tbody>${resultsRows || '<tr><td colspan="2" style="padding:8px 10px;">Em processamento laboratorial</td></tr>'}</tbody>
    </table>`;

    const releaseDateFormatted = result.released_at
      ? new Date(result.released_at).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');

    const replacements: Record<string, string> = {
      '{{paciente}}': patient.name,
      '{{especie}}': patient.species,
      '{{raca}}': patient.breed,
      '{{sexo}}': patient.gender === 'M' ? 'Macho' : 'Fêmea',
      '{{idade}}': patient.age_label || `${patient.age_days || 365} dias`,
      '{{tutor}}': patient.tutor_name,
      '{{veterinario}}': vet.name,
      '{{crmv}}': vet.crmv,
      '{{clinica}}': vet.clinic_name,
      '{{protocolo}}': order.protocol_code,
      '{{data_pedido}}': new Date(order.created_at).toLocaleDateString('pt-BR'),
      '{{data_liberacao}}': releaseDateFormatted,
      '{{exame}}': `${exam.code} - ${exam.name}`,
      '{{secao}}': exam.section,
      '{{resultados}}': resultadosTable,
      '{{referencias}}': (result.reference_snapshot || '').replace(/\n/g, '<br/>'),
      '{{observacoes}}': order.notes || 'Sem observações clínicas adicionais.',
    };

    let combined = `${template.header_html}\n${template.body_template}\n${template.footer_html}`;
    for (const [tag, val] of Object.entries(replacements)) {
      combined = combined.split(tag).join(val);
    }

    return combined;
  }
}
