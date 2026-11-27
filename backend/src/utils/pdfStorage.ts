import { Invoice, Order, SampleLabel } from '../domain/entities';
import { resolveSideBySideReference } from '../domain/services/ReportRendererService';

const localPdfStore = new Map<string, Buffer>();

function sanitizePdfText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 92): string[] {
  const clean = sanitizePdfText(text);
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(' ');
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) out.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) out.push(current);
  return out;
}

/**
 * Gera um documento PDF 1.4 válido (binário) para um exame específico (singleResultId)
 * ou concatenando todos os exames do atendimento (quando singleResultId é omitido).
 */
export function buildOrderPdfBuffer(order: Order, singleResultId?: string): Buffer {
  const resultsToInclude = singleResultId
    ? (order.results || []).filter((r) => r.id === singleResultId)
    : order.results || [];

  const releaseStr = new Date().toLocaleString('pt-BR');
  const titleLabel = singleResultId
    ? `LAUDO DE EXAME | PROTOCOLO: ${order.protocol_code}`
    : `LAUDO LABORATORIAL COMPLETO (TODOS OS EXAMES) | PROTOCOLO: ${order.protocol_code}`;

  const lines: Array<{ text: string; size: number; bold?: boolean }> = [
    { text: 'VETLIFE DIAGNOSTICOS VETERINARIOS - vetlifelab.com.br', size: 13, bold: true },
    { text: 'Registro CRMV-SP PJ 09842 | Controle de Qualidade PNCQ', size: 8 },
    { text: '----------------------------------------------------------------------------------------', size: 9 },
    { text: `${titleLabel} | STATUS: ${order.status.toUpperCase()}`, size: 10, bold: true },
    { text: `Data de Emissao: ${releaseStr}`, size: 9 },
    { text: '----------------------------------------------------------------------------------------', size: 9 },
    {
      text: `PACIENTE: ${order.patient?.name || '-'} | Especie: ${order.patient?.species || '-'} | Raca: ${
        order.patient?.breed || '-'
      } | Sexo: ${order.patient?.gender || '-'}`,
      size: 9,
      bold: true,
    },
    {
      text: `TUTOR(A): ${order.patient?.tutor_name || '-'} | Contato: ${order.patient?.tutor_phone || '-'}`,
      size: 9,
    },
    {
      text: `VETERINARIO(A): ${order.vet?.name || '-'} (${order.vet?.crmv || '-'}) - ${
        order.vet?.clinic_name || ''
      }`,
      size: 9,
    },
    { text: '========================================================================================', size: 9 },
    {
      text: singleResultId
        ? 'RESULTADO ANALITICO DO EXAME:'
        : `RESULTADOS ANALITICOS CONCATENADOS (${resultsToInclude.length} EXAME(S)):`,
      size: 10,
      bold: true,
    },
  ];

  resultsToInclude.forEach((res, idx) => {
    const examCode = res.exam?.code || (res as any).exam_code || 'EXM';
    const examName = res.exam?.name || (res as any).exam_name || 'Exame Laboratorial';
    const examSection = res.exam?.section || (res as any).section || 'Geral';

    for (const wrappedTitle of wrapLine(
      `${idx + 1}. [${examCode}] ${examName} (Setor: ${examSection})`,
      86
    )) {
      lines.push({ text: wrappedTitle, size: 9.5, bold: true });
    }

    const entries = Object.entries(res.dynamic_content || {});
    const fields = res.exam?.input_fields || (res as any).input_fields || [];
    if (entries.length === 0) {
      lines.push({ text: '   - Parametros em processamento na bancada tecnica.', size: 9 });
    } else {
      lines.push({
        text: '   PARAMETRO ANALISADO             | RESULTADO OBTIDO       | VALOR DE REFERENCIA',
        size: 8,
        bold: true,
      });
      entries.forEach(([key, val]) => {
        const meta = fields.find((f: any) => f.field_name === key);
        const rawLabel = meta?.field_label || key;
        const unit = meta?.unit ? ` ${meta.unit}` : '';
        const valText = `${val}${unit}`;
        const paramRef = resolveSideBySideReference(key, rawLabel, res.reference_snapshot);

        const labelLines = wrapLine(rawLabel, 30);
        const valLines = wrapLine(valText, 21);
        const refLines = wrapLine(paramRef, 34);
        const rowCount = Math.max(labelLines.length, valLines.length, refLines.length);

        for (let rIdx = 0; rIdx < rowCount; rIdx++) {
          const c1 = (labelLines[rIdx] || '').padEnd(31, ' ');
          const c2 = (valLines[rIdx] || '').padEnd(22, ' ');
          const c3 = refLines[rIdx] || '';
          lines.push({ text: `   ${c1} | ${c2} | ${c3}`, size: 8 });
        }
      });
    }

    if (res.attachments && res.attachments.length > 0) {
      lines.push({
        text: `   Anexos: ${res.attachments.map((a) => a.name).join(', ')}`,
        size: 8,
      });
    }

    lines.push({ text: '', size: 7 });
  });

  lines.push({
    text: '----------------------------------------------------------------------------------------',
    size: 9,
  });
  lines.push({
    text: 'Documento assinado eletronicamente pelo Corpo Biomedico VetLife | vetlifelab.com.br',
    size: 8,
    bold: true,
  });

  // Paginar em blocos para caber em folhas A4 (595 x 842 pt)
  const pageChunks: Array<Array<{ text: string; size: number; bold?: boolean }>> = [];
  let currentChunk: Array<{ text: string; size: number; bold?: boolean }> = [];
  let yCursor = 795;

  for (const item of lines) {
    const step = item.size + 5;
    if (yCursor - step < 50) {
      pageChunks.push(currentChunk);
      currentChunk = [];
      yCursor = 795;
    }
    currentChunk.push(item);
    yCursor -= step;
  }
  if (currentChunk.length > 0) {
    pageChunks.push(currentChunk);
  }

  // Montar objetos PDF 1.4
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: Font Regular, 4: Font Bold
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextObjId = 5;

  for (let i = 0; i < pageChunks.length; i++) {
    pageObjectIds.push(nextObjId++);
    contentObjectIds.push(nextObjId++);
  }

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] =
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n';
  objects[4] =
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n';

  for (let i = 0; i < pageChunks.length; i++) {
    const pId = pageObjectIds[i];
    const cId = contentObjectIds[i];
    const chunk = pageChunks[i];

    let stream = 'BT\n';
    let y = 795;
    for (const line of chunk) {
      const fontRef = line.bold ? '/F2' : '/F1';
      stream += `${fontRef} ${line.size} Tf\n1 0 0 1 42 ${y} Tm\n(${sanitizePdfText(
        line.text
      )}) Tj\n`;
      y -= line.size + 5;
    }
    stream += 'ET\n';

    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${Buffer.byteLength(
      stream,
      'latin1'
    )} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < nextObjId; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += objects[id];
  }

  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${nextObjId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextObjId; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextObjId} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Faz upload do PDF para o Vercel Blob Storage (quando BLOB_READ_WRITE_TOKEN estiver configurado)
 * ou armazena no servidor de arquivos da API para download público imediato em desenvolvimento.
 */
export async function uploadPdfToVercelBlob(
  pathname: string,
  pdfBuffer: Buffer,
  fallbackOrigin: string
): Promise<{ url: string; pathname: string; storage: 'vercel-blob' | 'local-api' }> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const cleanPath = pathname.replace(/^\/+/, '');

  if (token) {
    const res = await fetch(`https://blob.vercel-storage.com/${encodeURI(cleanPath)}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-version': '7',
        'x-content-type': 'application/pdf',
        'x-add-random-suffix': '0',
      },
      body: new Uint8Array(pdfBuffer),
    });

    if (res.ok) {
      const data = (await res.json()) as { url: string; pathname: string };
      return {
        url: data.url,
        pathname: data.pathname || cleanPath,
        storage: 'vercel-blob',
      };
    }
  }

  localPdfStore.set(cleanPath, pdfBuffer);
  const origin = fallbackOrigin.replace(/\/+$/, '');
  return {
    url: `${origin}/api/v1/public/pdfs?path=${encodeURIComponent(cleanPath)}`,
    pathname: cleanPath,
    storage: 'local-api',
  };
}

export function getLocalPdfBuffer(pathname: string): Buffer | null {
  const cleanPath = pathname.replace(/^\/+/, '');
  return localPdfStore.get(cleanPath) || null;
}

/**
 * Extrai o material biológico a partir do campo material/tube_type de forma limpa.
 */
function inferMaterialAndTube(label: SampleLabel): { material: string; tube: string } {
  const rawTube = (label.tube_type || label.material || 'Tubo Padrao').trim();
  const rawMat = (label.material || '').trim();
  const lower = `${rawMat} ${rawTube}`.toLowerCase();

  let material = 'Amostra';
  if (lower.includes('soro') || lower.includes('amarelo') || lower.includes('vermelh')) {
    material = 'Soro';
  } else if (lower.includes('sangue') || lower.includes('edta') || lower.includes('roxo') || lower.includes('citrat') || lower.includes('heparin')) {
    material = 'Sangue';
  } else if (lower.includes('urina')) {
    material = 'Urina';
  } else if (lower.includes('fezes') || lower.includes('copro')) {
    material = 'Fezes';
  } else if (lower.includes('swab') || lower.includes('raspado') || lower.includes('pele')) {
    material = 'Swab/Pele';
  } else if (lower.includes('biops') || lower.includes('histop') || lower.includes('citol')) {
    material = 'Tecido';
  } else if (rawMat && rawMat !== rawTube) {
    material = rawMat.slice(0, 14);
  }

  return { material, tube: rawTube };
}

function formatShortDateTime(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy}, ${hh}:${min}`;
}

/**
 * Gera PDF 1.4 pronto para impressora térmica Zebra no tamanho exato 50mm x 30mm
 * (141.73 pt x 85.04 pt), 1 etiqueta por página, exclusivamente Preto e Branco,
 * cabeçalho branco com código maior, paciente+data+espécie na mesma linha e rodapé CÓDIGO | EXAME.
 */
export function buildThermalLabelsPdfBuffer(labels: SampleLabel[]): Buffer {
  const W = 141.73; // 50 mm in PostScript points
  const H = 85.04;  // 30 mm in PostScript points

  const safeLabels: SampleLabel[] =
    labels.length > 0
      ? labels
      : [
          {
            label_id: 'empty-1',
            protocol_code: 'VET-2026-0000',
            barcode_value: '',
            patient_name: 'PACIENTE',
            species: 'Canino',
            tutor_name: 'Tutor',
            vet_name: '',
            exam_code: '000',
            exam_name: 'Exame',
            section: 'Geral',
            tube_type: 'Tubo Padrao',
            label_index: 1,
            total_labels_for_exam: 1,
            created_at: new Date().toISOString(),
          },
        ];

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextObjId = 5;

  for (let i = 0; i < safeLabels.length; i++) {
    pageObjectIds.push(nextObjId++);
    contentObjectIds.push(nextObjId++);
  }

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  for (let i = 0; i < safeLabels.length; i++) {
    const lbl = safeLabels[i];
    const pId = pageObjectIds[i];
    const cId = contentObjectIds[i];

    const patientUpper = sanitizePdfText((lbl.patient_name || 'PACIENTE').toUpperCase()).slice(0, 11);
    const tutorText = sanitizePdfText(`Tutor: ${lbl.tutor_name || '-'}`).slice(0, 32);
    const dateTimeStr = sanitizePdfText(formatShortDateTime(lbl.created_at));
    const speciesText = sanitizePdfText(lbl.species || '').slice(0, 9);
    const { material, tube } = inferMaterialAndTube(lbl);
    const matTubeLines = wrapLine(`Material: ${material}  Tubo: ${tube}`, 36).slice(0, 2);
    const protocolText = sanitizePdfText(lbl.protocol_code || 'VET-2026');
    const examCodeText = sanitizePdfText(lbl.exam_code || '000');
    const examPipeLines = wrapLine(`${examCodeText} | ${lbl.exam_name || 'Exame'}`, 35).slice(0, 2);
    const indexText = sanitizePdfText(`${lbl.label_index}/${lbl.total_labels_for_exam}`);

    const cmds: string[] = [];

    // 1. Cabeçalho branco com texto preto e Código do Protocolo maior
    cmds.push('0 g 0 G');
    cmds.push('BT /F2 6.8 Tf 4.5 75.2 Td (VETLIFE) Tj ET');
    cmds.push(`BT /F2 8.6 Tf 40.0 74.8 Td (${protocolText}) Tj ET`);
    cmds.push(`BT /F2 6.8 Tf 120.0 75.2 Td (${indexText}) Tj ET`);
    cmds.push('0.9 w 4.5 71.8 m 137.23 71.8 l S');

    // 2. Linha 1: Paciente (cortado se grande) + Data/Hora + Espécie na mesma linha com fonte maior
    cmds.push(`BT /F2 7.4 Tf 4.5 62.8 Td (${patientUpper}) Tj ET`);
    cmds.push(`BT /F2 6.2 Tf 53.0 62.8 Td (${dateTimeStr}) Tj ET`);
    if (speciesText) {
      cmds.push(`BT /F2 6.2 Tf 97.5 62.8 Td (ESP: ${speciesText}) Tj ET`);
    }

    // 3. Linha 2: Tutor + linha divisória
    cmds.push(`BT /F1 6.2 Tf 4.5 54.4 Td (${tutorText}) Tj ET`);
    cmds.push('0.5 w 4.5 51.0 m 137.23 51.0 l S');

    // 4. Linha 3: Material e Tubo (até 2 linhas)
    cmds.push(`BT /F1 5.8 Tf 4.5 43.8 Td (${matTubeLines[0] || ''}) Tj ET`);
    if (matTubeLines[1]) {
      cmds.push(`BT /F1 5.8 Tf 4.5 37.0 Td (${matTubeLines[1]}) Tj ET`);
    }

    // 5. Rodapé emoldurado: CÓDIGO | NOME/RESUMO DO EXAME (sem repetir protocolo, até 2 linhas)
    cmds.push('0.8 w 4.5 4.2 132.73 26.5 re S');
    cmds.push(`BT /F2 6.6 Tf 7.5 21.0 Td (${examPipeLines[0] || ''}) Tj ET`);
    if (examPipeLines[1]) {
      cmds.push(`BT /F1 6.0 Tf 7.5 11.5 Td (${examPipeLines[1]}) Tj ET`);
    }

    const stream = cmds.join('\n') + '\n';
    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(
      2
    )} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${Buffer.byteLength(
      stream,
      'latin1'
    )} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < nextObjId; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += objects[id];
  }

  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${nextObjId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextObjId; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextObjId} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

export interface BillingReportPdfFilters {
  scope: 'admin' | 'vet';
  status?: 'todos' | 'nao_faturado' | 'aguardando_pagamento' | 'pago' | 'cancelado' | string;
  start_date?: string;
  end_date?: string;
  vet_label?: string;
  patient_label?: string;
}

export interface BillingReportPdfSummary {
  invoices_count: number;
  orders_count: number;
  total_amount: number;
  paid_amount: number;
  pending_payment_amount: number;
  unbilled_amount: number;
  cancelled_amount: number;
}

export interface BillingReportPdfData {
  generated_at?: string;
  filters: BillingReportPdfFilters;
  summary: BillingReportPdfSummary;
  invoices: Invoice[];
  orders: Order[];
}

function toAsciiPlain(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function wrapPlainLine(text: string, maxChars: number): string[] {
  const clean = toAsciiPlain(text).trim();
  if (!clean) return [''];
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(/\s+/);
  const out: string[] = [];
  let current = '';
  for (const w of words) {
    if (w.length > maxChars) {
      if (current) {
        out.push(current);
        current = '';
      }
      for (let i = 0; i < w.length; i += maxChars) {
        out.push(w.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxChars) {
      if (current) out.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) out.push(current);
  return out.length > 0 ? out : [''];
}

function formatBrl(value: number): string {
  const num = Number(value) || 0;
  const fixed = Math.abs(num).toFixed(2).replace('.', ',');
  const [intPart, decPart] = fixed.split(',');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${num < 0 ? '-' : ''}R$ ${grouped},${decPart}`;
}

function formatDateBr(isoOrDate?: string | null): string {
  if (!isoOrDate) return '-';
  const raw = String(isoOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [yyyy, mm, dd] = raw.slice(0, 10).split('-');
    return `${dd}/${mm}/${yyyy}`;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTimeBr(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function translateBillingStatus(status?: string): string {
  switch (status) {
    case 'pago':
      return 'Pago';
    case 'aguardando_pagamento':
      return 'Aguard. Pagto';
    case 'nao_faturado':
      return 'Nao Faturado';
    case 'cancelado':
      return 'Cancelado';
    case 'todos':
    case '':
    case undefined:
      return 'Todos';
    default:
      return String(status);
  }
}

/**
 * Gera um documento PDF 1.4 multi-pagina (A4 595x842 pt) de Relatorio de Faturamento
 * contendo filtros aplicados, resumo financeiro, tabela de faturas e pedidos/exames detalhados.
 */
export function buildBillingReportPdfBuffer(data: BillingReportPdfData): Buffer {
  const { filters, summary, invoices = [], orders = [] } = data;
  const generatedStr = formatDateTimeBr(data.generated_at);

  const periodLabel =
    filters.start_date && filters.end_date
      ? `${formatDateBr(filters.start_date)} a ${formatDateBr(filters.end_date)}`
      : filters.start_date
      ? `A partir de ${formatDateBr(filters.start_date)}`
      : filters.end_date
      ? `Ate ${formatDateBr(filters.end_date)}`
      : 'Todo o periodo';

  const scopeLabel = filters.scope === 'vet' ? 'Portal do Veterinario' : 'Administrativo';
  const statusLabel = translateBillingStatus(filters.status || 'todos');
  const vetLabel = filters.vet_label || 'Todos os veterinarios';
  const patientLabel = filters.patient_label || 'Todos os pacientes';

  const HR = '-----------------------------------------------------------------------------------------------------------';
  const EQ = '===========================================================================================================';

  const lines: Array<{ text: string; size: number; bold?: boolean }> = [
    { text: 'VETLIFE DIAGNOSTICOS VETERINARIOS - vetlifelab.com.br', size: 12, bold: true },
    { text: 'Registro CRMV-SP PJ 09842 | Relatorio de Faturamento e Demonstrativo Financeiro', size: 8 },
    { text: `Emitido em: ${generatedStr}`, size: 8 },
    { text: EQ, size: 7.5 },
    { text: 'FILTROS APLICADOS', size: 9, bold: true },
    { text: `Escopo: ${scopeLabel}   |   Status: ${statusLabel}   |   Periodo: ${periodLabel}`, size: 8 },
  ];

  for (const wLine of wrapPlainLine(`Veterinario: ${vetLabel}   |   Paciente: ${patientLabel}`, 104)) {
    lines.push({ text: wLine, size: 8 });
  }

  lines.push({ text: HR, size: 7.5 });
  lines.push({ text: 'RESUMO FINANCEIRO', size: 9, bold: true });
  lines.push({
    text: `Qtd Faturas: ${String(summary.invoices_count).padEnd(8, ' ')} | Qtd Pedidos: ${String(
      summary.orders_count
    ).padEnd(8, ' ')} | Total Geral: ${formatBrl(summary.total_amount)}`,
    size: 8.5,
    bold: true,
  });
  lines.push({
    text: `Pago: ${formatBrl(summary.paid_amount).padEnd(16, ' ')} | Aguardando Pagamento: ${formatBrl(
      summary.pending_payment_amount
    )}`,
    size: 8,
  });
  lines.push({
    text: `Nao Faturado: ${formatBrl(summary.unbilled_amount).padEnd(14, ' ')} | Cancelado: ${formatBrl(
      summary.cancelled_amount
    )}`,
    size: 8,
  });

  // Secao 1: Faturas
  lines.push({ text: '', size: 6 });
  lines.push({ text: EQ, size: 7.5 });
  lines.push({ text: `FATURAS (${invoices.length})`, size: 9.5, bold: true });
  lines.push({ text: HR, size: 7.5 });

  if (invoices.length === 0) {
    lines.push({ text: 'Nenhuma fatura encontrada para os filtros aplicados.', size: 8 });
  } else {
    lines.push({
      text: `${'NUMERO'.padEnd(13, ' ')} | ${'MES REF.'.padEnd(8, ' ')} | ${'VETERINARIO'.padEnd(
        22,
        ' '
      )} | ${'EMISSAO'.padEnd(10, ' ')} | ${'VENCTO'.padEnd(10, ' ')} | ${'STATUS'.padEnd(
        13,
        ' '
      )} | ${'VALOR'.padStart(12, ' ')}`,
      size: 7.5,
      bold: true,
    });
    lines.push({ text: HR, size: 7.5 });

    for (const inv of invoices) {
      const numCol = toAsciiPlain(inv.invoice_number || inv.id || '-').slice(0, 13);
      const refCol = toAsciiPlain(inv.reference_month || '-').slice(0, 8);
      const vetNameRaw = inv.vet?.name || inv.vet_id || '-';
      const vetWrapped = wrapPlainLine(vetNameRaw, 22);
      const emiCol = formatDateBr(inv.created_at).slice(0, 10);
      const dueCol = formatDateBr(inv.due_date).slice(0, 10);
      const stCol = translateBillingStatus(inv.status).slice(0, 13);
      const valCol = formatBrl(Number(inv.total_amount || 0));

      for (let r = 0; r < vetWrapped.length; r++) {
        const c1 = (r === 0 ? numCol : '').padEnd(13, ' ');
        const c2 = (r === 0 ? refCol : '').padEnd(8, ' ');
        const c3 = (vetWrapped[r] || '').padEnd(22, ' ');
        const c4 = (r === 0 ? emiCol : '').padEnd(10, ' ');
        const c5 = (r === 0 ? dueCol : '').padEnd(10, ' ');
        const c6 = (r === 0 ? stCol : '').padEnd(13, ' ');
        const c7 = (r === 0 ? valCol : '').padStart(12, ' ');
        lines.push({ text: `${c1} | ${c2} | ${c3} | ${c4} | ${c5} | ${c6} | ${c7}`, size: 7.5 });
      }
    }
  }

  // Secao 2: Pedidos / Exames detalhados
  lines.push({ text: '', size: 6 });
  lines.push({ text: EQ, size: 7.5 });
  lines.push({ text: `PEDIDOS / EXAMES DETALHADOS (${orders.length})`, size: 9.5, bold: true });
  lines.push({ text: HR, size: 7.5 });

  if (orders.length === 0) {
    lines.push({ text: 'Nenhum pedido encontrado para os filtros aplicados.', size: 8 });
  } else {
    lines.push({
      text: `${'DATA'.padEnd(10, ' ')} | ${'PROTOCOLO'.padEnd(14, ' ')} | ${'PACIENTE / TUTOR'.padEnd(
        24,
        ' '
      )} | ${'VETERINARIO'.padEnd(20, ' ')} | ${'STATUS PAGTO'.padEnd(13, ' ')} | ${'VALOR'.padStart(
        12,
        ' '
      )}`,
      size: 7.5,
      bold: true,
    });
    lines.push({ text: HR, size: 7.5 });

    for (const ord of orders) {
      const dateCol = formatDateBr(ord.created_at).slice(0, 10);
      const protoCol = toAsciiPlain(ord.protocol_code || ord.id || '-').slice(0, 14);
      const patientName = ord.patient?.name || '-';
      const tutorName = ord.patient?.tutor_name ? ` (${ord.patient.tutor_name})` : '';
      const patWrapped = wrapPlainLine(`${patientName}${tutorName}`, 24);
      const vetWrapped = wrapPlainLine(ord.vet?.name || ord.vet_id || '-', 20);
      const payCol = translateBillingStatus(ord.payment_status || 'nao_faturado').slice(0, 13);
      const valCol = formatBrl(Number(ord.total_amount || 0));

      const rowLines = Math.max(patWrapped.length, vetWrapped.length);
      for (let r = 0; r < rowLines; r++) {
        const c1 = (r === 0 ? dateCol : '').padEnd(10, ' ');
        const c2 = (r === 0 ? protoCol : '').padEnd(14, ' ');
        const c3 = (patWrapped[r] || '').padEnd(24, ' ');
        const c4 = (vetWrapped[r] || '').padEnd(20, ' ');
        const c5 = (r === 0 ? payCol : '').padEnd(13, ' ');
        const c6 = (r === 0 ? valCol : '').padStart(12, ' ');
        lines.push({ text: `${c1} | ${c2} | ${c3} | ${c4} | ${c5} | ${c6}`, size: 7.5 });
      }

      const examNames = (ord.results || [])
        .map((res) => res.exam?.name || (res as any).exam_name || res.exam?.code || '')
        .filter(Boolean);
      if (examNames.length > 0) {
        for (const exLine of wrapPlainLine(`   Exames: ${examNames.join(', ')}`, 102)) {
          lines.push({ text: exLine, size: 7 });
        }
      }
    }
  }

  lines.push({ text: '', size: 6 });
  lines.push({ text: HR, size: 7.5 });
  lines.push({
    text: 'Documento gerado automaticamente pelo sistema VetLife Lab | vetlifelab.com.br',
    size: 7.5,
    bold: true,
  });

  // Paginar em blocos para caber em folhas A4 (595 x 842 pt) com margem inferior segura
  const pageChunks: Array<Array<{ text: string; size: number; bold?: boolean }>> = [];
  let currentChunk: Array<{ text: string; size: number; bold?: boolean }> = [];
  let yCursor = 804;

  for (const item of lines) {
    const step = item.size + 4.5;
    if (yCursor - step < 52) {
      pageChunks.push(currentChunk);
      currentChunk = [];
      yCursor = 804;
    }
    currentChunk.push(item);
    yCursor -= step;
  }
  if (currentChunk.length > 0) {
    pageChunks.push(currentChunk);
  }
  if (pageChunks.length === 0) {
    pageChunks.push([{ text: 'Relatorio de Faturamento VetLife', size: 10, bold: true }]);
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextObjId = 5;

  for (let i = 0; i < pageChunks.length; i++) {
    pageObjectIds.push(nextObjId++);
    contentObjectIds.push(nextObjId++);
  }

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n';
  objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold >>\nendobj\n';

  const totalPages = pageChunks.length;
  for (let i = 0; i < totalPages; i++) {
    const pId = pageObjectIds[i];
    const cId = contentObjectIds[i];
    const chunk = pageChunks[i];

    let stream = 'BT\n';
    let y = 804;
    for (const line of chunk) {
      const fontRef = line.bold ? '/F2' : '/F1';
      stream += `${fontRef} ${line.size} Tf\n1 0 0 1 36 ${y.toFixed(1)} Tm\n(${sanitizePdfText(
        line.text
      )}) Tj\n`;
      y -= line.size + 4.5;
    }
    const footerText = `VetLife Diagnosticos Veterinarios | Pagina ${i + 1} de ${totalPages}`;
    stream += `/F1 7.5 Tf\n1 0 0 1 36 28 Tm\n(${sanitizePdfText(footerText)}) Tj\n`;
    stream += 'ET\n';

    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${Buffer.byteLength(
      stream,
      'latin1'
    )} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < nextObjId; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += objects[id];
  }

  const xrefPos = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${nextObjId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextObjId; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextObjId} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}
