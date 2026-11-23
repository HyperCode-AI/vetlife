import { Order, SampleLabel } from '../domain/entities';
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
    lines.push({
      text: `${idx + 1}. [${res.exam?.code || 'EXM'}] ${res.exam?.name || 'Exame Laboratorial'} (Setor: ${
        res.exam?.section || 'Geral'
      })`,
      size: 10,
      bold: true,
    });

    const entries = Object.entries(res.dynamic_content || {});
    const fields = res.exam?.input_fields || [];
    if (entries.length === 0) {
      lines.push({ text: '   - Parametros em processamento na bancada tecnica.', size: 9 });
    } else {
      lines.push({
        text: '   PARAMETRO ANALISADO                | RESULTADO OBTIDO       | VALOR DE REFERENCIA',
        size: 8,
        bold: true,
      });
      entries.forEach(([key, val]) => {
        const meta = fields.find((f) => f.field_name === key);
        const label = (meta?.field_label || key).slice(0, 34).padEnd(34, ' ');
        const unit = meta?.unit ? ` ${meta.unit}` : '';
        const valStr = `${val}${unit}`.slice(0, 22).padEnd(22, ' ');
        const paramRef = resolveSideBySideReference(key, meta?.field_label || key, res.reference_snapshot).slice(0, 36);
        lines.push({ text: `   ${label} | ${valStr} | ${paramRef}`, size: 8.5 });
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
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[4] =
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

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
