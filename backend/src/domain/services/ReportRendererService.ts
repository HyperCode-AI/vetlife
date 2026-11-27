import { Exam, ExamResult, Order, Patient, ReportTemplate, Vet } from '../entities';

/**
 * Decodifica entidades HTML comuns, incluindo &nbsp; e &nbsp malformado sem ponto e vírgula.
 */
export function decodeHtmlEntities(str: string): string {
  return String(str || '')
    .replace(/&amp;nbsp;?/gi, ' ')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&#160;?/gi, ' ')
    .replace(/&#x0*a0;?/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;|&#x27;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converte controles de formulário HTML (<input>, <textarea>, <select>) em texto puro
 * (ou remove se vazios) e remove botões/scripts/estilos.
 */
export function stripFormControlsToText(html: string): string {
  let out = String(html || '');

  // Remove <script>, <style> e <button> completamente
  out = out
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<button\b[^>]*>[\s\S]*?<\/button>/gi, '');

  // <textarea>...</textarea> -> conteúdo interno como texto puro
  out = out.replace(/<textarea\b[^>]*>([\s\S]*?)<\/textarea>/gi, (_match, inner: string) => {
    const text = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    return text ? escapeHtml(text) : '';
  });

  // <select>...</select> -> texto da <option selected> (ou vazio se nenhuma selecionada)
  out = out.replace(/<select\b[^>]*>([\s\S]*?)<\/select>/gi, (_match, inner: string) => {
    const selectedMatch = inner.match(
      /<option\b[^>]*\bselected\b[^>]*>([\s\S]*?)<\/option>/i
    );
    if (!selectedMatch) return '';
    const text = decodeHtmlEntities(selectedMatch[1].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    return text ? escapeHtml(text) : '';
  });

  // <input ...> -> atributo value como texto puro (exceto hidden/button/submit/reset/checkbox/radio)
  out = out.replace(/<input\b([^>]*)\/?>/gi, (_match, attrs: string) => {
    const typeMatch = attrs.match(/\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const inputType = (typeMatch?.[1] || typeMatch?.[2] || typeMatch?.[3] || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'image', 'file'].includes(inputType)) {
      return '';
    }
    const valMatch = attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    const rawVal = valMatch?.[1] ?? valMatch?.[2] ?? valMatch?.[3] ?? '';
    const text = decodeHtmlEntities(rawVal).replace(/\s+/g, ' ').trim();
    return text ? escapeHtml(text) : '';
  });

  return out;
}

/**
 * Sanitiza fragmentos HTML de laudos/referências removendo controles de formulário,
 * linhas <tr> vazias, blocos <p>/<div> vazios, múltiplos <br> e decodificando &nbsp;?.
 */
export function sanitizeReportHtmlFragment(html: string): string {
  let out = stripFormControlsToText(String(html || ''));

  // Decodifica &nbsp; / &nbsp malformado / &#160; para espaço simples
  out = out
    .replace(/&amp;nbsp;?/gi, ' ')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&#160;?/gi, ' ')
    .replace(/&#x0*a0;?/gi, ' ')
    .replace(/\u00a0/g, ' ');

  // Remove linhas <tr> cujas células não possuem conteúdo visível
  out = out.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (match, inner: string) => {
    if (/<img\b/i.test(inner)) return match;
    const visibleText = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, '')
      .trim();
    return visibleText ? match : '';
  });

  // Remove blocos <p> e <div> vazios (várias passadas para elementos aninhados)
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(/<(p|div)\b[^>]*>([\s\S]*?)<\/\1>/gi, (match, _tag: string, inner: string) => {
      if (/<(img|hr|table|svg)\b/i.test(inner)) return match;
      const visibleText = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, '')
        .trim();
      return visibleText ? match : '';
    });
    if (next === out) break;
    out = next;
  }

  // Colapsa múltiplos <br> consecutivos em um único <br/>
  out = out.replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br/>');

  // Remove <br/> soltos logo no início ou fim de células/blocos
  out = out
    .replace(/(<(?:td|th|p|div)\b[^>]*>)\s*(?:<br\s*\/?>\s*)+/gi, '$1')
    .replace(/(?:\s*<br\s*\/?>)+\s*(<\/(?:td|th|p|div)>)/gi, '$1');

  return out.trim();
}

/**
 * Extrai referência específica por parâmetro a partir do reference_snapshot
 * para exibição Lado a Lado com o resultado obtido.
 */
export function resolveSideBySideReference(
  fieldName: string,
  fieldLabel: string,
  referenceSnapshot?: string
): string {
  const withoutControls = stripFormControlsToText(String(referenceSnapshot || ''));
  const raw = decodeHtmlEntities(
    withoutControls
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\r?\n\s*/g, '\n')
    .trim();

  if (!raw) return '—';

  const segments = raw
    .split(/\||;|\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return '—';
  }

  if (segments.length === 1) {
    return segments[0];
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
      const extracted = colonIdx !== -1 ? seg.slice(colonIdx + 1).trim() : seg;
      return extracted || '—';
    }
  }

  return segments.join(' | ');
}

/**
 * Converte valores de referência separados por "|" ou quebras de linha em linhas HTML (<br/>),
 * preservando cabeçalhos entre colchetes [...] em linha própria.
 */
export function formatReferenceLinesHtml(raw: string): string {
  const withoutControls = stripFormControlsToText(String(raw || ''));
  const stripped = decodeHtmlEntities(
    withoutControls
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).trim();

  if (!stripped) return '—';

  const normalized = stripped.replace(/\[([^\]]+)\]/g, (_match, inner: string) => {
    const cleanedInner = inner
      .split('|')
      .map((part) => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' • ');
    return cleanedInner ? `[${cleanedInner}]\n` : '';
  });

  const lines = normalized
    .split(/\||\r?\n/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (lines.length === 0) return '—';

  return lines.map((line) => escapeHtml(line)).join('<br/>');
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
      .map(([key, value], idx) => {
        const fieldDef = exam.input_fields?.find((f) => f.field_name === key);
        const label = escapeHtml(decodeHtmlEntities(fieldDef?.field_label || key));
        const unit = fieldDef?.unit ? ` ${escapeHtml(decodeHtmlEntities(fieldDef.unit))}` : '';
        const cleanVal = escapeHtml(decodeHtmlEntities(String(value ?? '')));
        const paramRef = formatReferenceLinesHtml(
          resolveSideBySideReference(key, fieldDef?.field_label || key, result.reference_snapshot)
        );
        const rowBg = idx % 2 === 1 ? '#f8fbfb' : '#ffffff';
        return `<tr style="background:${rowBg};">
          <td style="padding:7px 10px;border:1px solid #cbd5e1;font-weight:600;color:#334155;vertical-align:top;">${label}</td>
          <td style="padding:7px 10px;border:1px solid #cbd5e1;color:#0b2240;font-weight:700;vertical-align:top;">${cleanVal}${unit}</td>
          <td style="padding:7px 10px;border:1px solid #cbd5e1;color:#334155;font-size:11.5px;line-height:1.45;white-space:pre-line;vertical-align:top;">${paramRef}</td>
        </tr>`;
      })
      .join('');

    const resultadosTable = `<div style="margin-top:12px;margin-bottom:14px;clear:both;display:block;"><table style="width:100%;border-collapse:collapse;margin:0;font-size:12px;">
      <thead>
        <tr style="background:#118a8a;color:#ffffff;text-align:left;">
          <th style="padding:8px 10px;border:1px solid #118a8a;width:36%;font-weight:700;">Parâmetro Analisado</th>
          <th style="padding:8px 10px;border:1px solid #118a8a;width:26%;font-weight:700;">Resultado Obtido</th>
          <th style="padding:8px 10px;border:1px solid #118a8a;width:38%;font-weight:700;">Valores de Referência (${escapeHtml(patient.species)})</th>
        </tr>
      </thead>
      <tbody>${resultsRows || '<tr><td colspan="3" style="padding:8px 10px;border:1px solid #cbd5e1;color:#334155;">Em processamento laboratorial</td></tr>'}</tbody>
    </table></div>`;

    const releaseDateFormatted = result.released_at
      ? new Date(result.released_at).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');

    const logoHtml = `<img src="/images/vetlife-logo.jpg" alt="VetLife" style="height:44px;width:auto;object-fit:contain;border-radius:8px;" />`;

    const replacements: Record<string, string> = {
      '{{logo}}': logoHtml,
      '{{paciente}}': escapeHtml(patient.name),
      '{{especie}}': escapeHtml(patient.species),
      '{{raca}}': escapeHtml(patient.breed),
      '{{sexo}}': patient.gender === 'M' ? 'Macho' : 'Fêmea',
      '{{idade}}': escapeHtml(patient.age_label || `${patient.age_days || 365} dias`),
      '{{tutor}}': escapeHtml(patient.tutor_name),
      '{{veterinario}}': escapeHtml(vet.name),
      '{{crmv}}': escapeHtml(vet.crmv),
      '{{clinica}}': escapeHtml(vet.clinic_name),
      '{{protocolo}}': escapeHtml(order.protocol_code),
      '{{data_pedido}}': new Date(order.created_at).toLocaleDateString('pt-BR'),
      '{{data_liberacao}}': releaseDateFormatted,
      '{{exame}}': escapeHtml(`${exam.code} - ${exam.name}`),
      '{{secao}}': escapeHtml(exam.section),
      '{{resultados}}': resultadosTable,
      '{{referencias}}': formatReferenceLinesHtml(result.reference_snapshot || ''),
      '{{observacoes}}': escapeHtml(
        decodeHtmlEntities(order.notes || 'Sem observações clínicas adicionais.')
      ),
    };

    let combined = `${template.header_html}\n${template.body_template}\n${template.footer_html}`;
    for (const [tag, val] of Object.entries(replacements)) {
      combined = combined.split(tag).join(val);
    }

    return sanitizeReportHtmlFragment(combined);
  }
}
