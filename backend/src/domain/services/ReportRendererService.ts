import { Exam, ExamResult, Order, Patient, ReportTemplate, Vet } from '../entities';

/**
 * Extrai referência específica por parâmetro a partir do reference_snapshot
 * para exibição Lado a Lado com o resultado obtido.
 */
export function resolveSideBySideReference(
  fieldName: string,
  fieldLabel: string,
  referenceSnapshot?: string
): string {
  const raw = String(referenceSnapshot || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .trim();
  if (!raw) return 'Conforme faixa da espécie';

  const segments = raw
    .split(/\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    return raw;
  }

  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const normLabel = normalize(fieldLabel);
  const normKey = normalize(fieldName.replace(/_/g, ' '));
  const labelTokens = normLabel.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
  const keyTokens = normKey.split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

  for (const seg of segments) {
    const normSeg = normalize(seg);
    const colonIdx = seg.indexOf(':');
    const segHeader = colonIdx !== -1 ? normalize(seg.slice(0, colonIdx)) : normSeg;

    if (
      (labelTokens.length > 0 && labelTokens.some((tok) => segHeader.includes(tok))) ||
      (keyTokens.length > 0 && keyTokens.some((tok) => segHeader.includes(tok)))
    ) {
      return colonIdx !== -1 ? seg.slice(colonIdx + 1).trim() : seg;
    }
  }

  return raw;
}

/**
 * SRP & OCP: Domain service responsible for HU-05
 * Renders dynamic report templates replacing tags like {{logo}}, {{paciente}}, {{protocolo}}, {{resultados}}, {{referencias}}.
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
        const paramRef = resolveSideBySideReference(key, label, result.reference_snapshot);
        return `<tr>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#1e293b;">${label}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#0f766e;font-weight:700;">${String(value)}${unit}</td>
          <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px;">${paramRef}</td>
        </tr>`;
      })
      .join('');

    const resultadosTable = `<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px;">
      <thead>
        <tr style="background:#f8fafc;text-align:left;">
          <th style="padding:8px 10px;border-bottom:2px solid #cbd5e1;width:36%;">Parâmetro Analisado</th>
          <th style="padding:8px 10px;border-bottom:2px solid #cbd5e1;width:28%;">Resultado Obtido</th>
          <th style="padding:8px 10px;border-bottom:2px solid #cbd5e1;width:36%;">Valores de Referência (${patient.species})</th>
        </tr>
      </thead>
      <tbody>${resultsRows || '<tr><td colspan="3" style="padding:8px 10px;">Em processamento laboratorial</td></tr>'}</tbody>
    </table>`;

    const releaseDateFormatted = result.released_at
      ? new Date(result.released_at).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');

    const logoHtml = `<img src="/images/vetlife-logo.jpg" alt="VetLife" style="height:44px;width:auto;object-fit:contain;border-radius:8px;" />`;

    const replacements: Record<string, string> = {
      '{{logo}}': logoHtml,
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
