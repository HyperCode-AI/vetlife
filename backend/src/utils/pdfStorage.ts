import { Order } from '../domain/entities';

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
      entries.forEach(([key, val]) => {
        const meta = fields.find((f) => f.field_name === key);
        const label = meta?.field_label || key;
        const unit = meta?.unit ? ` ${meta.unit}` : '';
        lines.push({ text: `   * ${label}: ${val}${unit}`, size: 9 });
      });
    }

    if (res.reference_snapshot) {
      wrapLine(`   Valor de Referencia: ${res.reference_snapshot}`, 90).forEach((l) =>
        lines.push({ text: l, size: 8 })
      );
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
