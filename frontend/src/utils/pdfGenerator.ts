import { Order, CollectionLabel, ReportTemplate } from '../types';
import { formatAgeLabel, renderReportHtmlWithDynamicTags, resolveSideBySideReference } from '../services/api';

const DEFAULT_FALLBACK_TEMPLATE: ReportTemplate = {
  id: 'default',
  name: 'Laudo Oficial VetLife',
  header_html: '<div style="border-bottom:2px solid #0d9488;padding-bottom:10px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;"><div>{{logo}}</div><div style="text-align:right;font-size:12px;"><strong>Protocolo:</strong> {{protocolo}}<br/><strong>Emissão:</strong> {{data_liberacao}}</div></div>',
  body_template:
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:12px;font-size:12px;"><strong>Paciente:</strong> {{paciente}} ({{especie}} • {{idade}}) | <strong>Tutor:</strong> {{tutor}}<br/><strong>Veterinário(a):</strong> {{veterinario}} ({{crmv}})</div>{{resultados}}',
  footer_html: 'Documento assinado eletronicamente pelo Corpo Biomédico VetLife.',
  is_default: true,
};

function sanitizePdfText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function stripHtmlTagsToLines(html?: string): string[] {
  if (!html) return [];
  const text = String(html)
    .replace(/\{\{[^}]+\}\}/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');

  return text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Generates and downloads a valid ISO PDF 1.4 binary document (.pdf) directly in the browser
 * containing the full VetLife Laboratory Report (Header, Patient/Tutor/Vet info, Dynamic Results,
 * Cross-matched Reference Values by Species/Gender/Age, Attachments and Biomedical Signature).
 */
export function downloadOrderPdf(order: Order, customTemplate?: ReportTemplate): void {
  const tpl = customTemplate || order.template || DEFAULT_FALLBACK_TEMPLATE;
  const ageLabel = formatAgeLabel(order.patient?.age_days, order.patient?.birth_date);
  const releaseStr = order.released_at
    ? new Date(order.released_at).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');

  const headerLines = stripHtmlTagsToLines(tpl.header_html).slice(0, 2);
  const footerLines = stripHtmlTagsToLines(tpl.footer_html).slice(0, 2);

  const lines: Array<{ text: string; size: number; bold?: boolean }> = [
    { text: 'VETLIFE DIAGNOSTICOS VETERINARIOS - vetlifelab.com.br', size: 13, bold: true },
    ...(headerLines.length > 0
      ? headerLines.map((h) => ({ text: h.slice(0, 96), size: 8.5 }))
      : [{ text: 'Central Diagnostica Veterinaria | Controle de Qualidade PNCQ', size: 8.5 }]),
    { text: '----------------------------------------------------------------------------------------', size: 9 },
    {
      text: `LAUDO LABORATORIAL OFICIAL | PROTOCOLO: ${order.protocol_code} | STATUS: ${order.status.toUpperCase()}`,
      size: 10.5,
      bold: true,
    },
    { text: `Data de Emissao/Liberacao: ${releaseStr}`, size: 9 },
    { text: '----------------------------------------------------------------------------------------', size: 9 },
    {
      text: `PACIENTE: ${order.patient?.name || '-'} | Especie: ${order.patient?.species || '-'} | Raca: ${
        order.patient?.breed || '-'
      } | Sexo: ${order.patient?.gender || '-'} | Idade: ${ageLabel}`,
      size: 9,
      bold: true,
    },
    {
      text: `TUTOR(A) RESPONSAVEL: ${order.patient?.tutor_name || '-'}${
        order.patient?.tutor_phone ? ` | Contato: ${order.patient.tutor_phone}` : ''
      }`,
      size: 9,
    },
    {
      text: `VETERINARIO(A) SOLICITANTE: ${order.vet?.name || '-'} (${order.vet?.crmv || '-'}) - ${
        order.vet?.clinic_name || ''
      }`,
      size: 9,
    },
    { text: '========================================================================================', size: 9 },
    { text: 'RESULTADOS ANALITICOS E VALORES DE REFERENCIA CRUZADOS:', size: 10, bold: true },
  ];

  (order.results || []).forEach((res, idx) => {
    const examCode = res.exam_code || res.exam?.code || 'EXM';
    const examName = res.exam_name || res.exam?.name || 'Exame Laboratorial';
    const examSection = res.section || res.exam?.section || 'Geral';

    for (const wrappedTitle of wrapPdfText(
      `${idx + 1}. [${examCode}] ${examName} (Setor: ${examSection})`,
      86
    )) {
      lines.push({ text: wrappedTitle, size: 9.5, bold: true });
    }

    const entries = Object.entries(res.dynamic_content || {});
    const fields = res.input_fields || res.exam?.input_fields || [];
    const refText =
      res.reference_snapshot ||
      res.matched_reference?.reference_text_content ||
      'Referencia padrao para a especie/idade.';

    if (entries.length === 0) {
      lines.push({ text: '   - Parametros em processamento na bancada tecnica.', size: 9 });
    } else {
      lines.push({
        text: '   PARAMETRO ANALISADO             | RESULTADO OBTIDO       | VALOR DE REFERENCIA',
        size: 8,
        bold: true,
      });
      entries.forEach(([key, val]) => {
        const meta = fields.find((f) => f.field_name === key);
        const rawLabel = meta?.field_label || key;
        const unit = meta?.unit ? ` ${meta.unit}` : '';
        const valText = `${val}${unit}`;
        const sideRefFull = resolveSideBySideReference(key, rawLabel, refText);

        const labelLines = wrapPdfText(rawLabel, 30);
        const valLines = wrapPdfText(valText, 21);
        const refLines = wrapPdfText(sideRefFull, 34);
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
        text: `   Anexos Complementares: ${res.attachments.map((a) => a.name).join(', ')}`,
        size: 8,
      });
    }
    lines.push({ text: ' ', size: 6 });
  });

  lines.push({
    text: '----------------------------------------------------------------------------------------',
    size: 9,
  });
  lines.push({
    text: 'Responsavel Tecnico: Dra. Maysa Barbosa de Almeida (RT) & Dra. Kerollyn Passos Silva',
    size: 8.5,
    bold: true,
  });
  footerLines.forEach((fl) => {
    lines.push({ text: fl.slice(0, 96), size: 8 });
  });
  lines.push({
    text: `Autenticidade verificavel em https://vetlifelab.com.br/consulta - Protocolo ${order.protocol_code}`,
    size: 8,
  });

  // Paginar automaticamente em folhas A4 (595 x 842 pt)
  const pageChunks: Array<Array<{ text: string; size: number; bold?: boolean }>> = [];
  let currentChunk: Array<{ text: string; size: number; bold?: boolean }> = [];
  let yCursor = 798;

  for (const item of lines) {
    const step = item.size + 4.5;
    if (yCursor - step < 48) {
      pageChunks.push(currentChunk);
      currentChunk = [];
      yCursor = 798;
    }
    currentChunk.push(item);
    yCursor -= step;
  }
  if (currentChunk.length > 0) {
    pageChunks.push(currentChunk);
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

  for (let i = 0; i < pageChunks.length; i++) {
    const pId = pageObjectIds[i];
    const cId = contentObjectIds[i];
    const chunk = pageChunks[i];

    let y = 798;
    const streamCommands: string[] = ['BT'];
    chunk.forEach((line) => {
      const font = line.bold ? '/F2' : '/F1';
      const safe = sanitizePdfText(line.text);
      streamCommands.push(`${font} ${line.size} Tf`);
      streamCommands.push(`1 0 0 1 36 ${y.toFixed(1)} Tm`);
      streamCommands.push(`(${safe}) Tj`);
      y -= line.size + 4.5;
    });
    streamCommands.push('ET');
    const streamContent = streamCommands.join('\n');

    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < nextObjId; id++) {
    offsets[id] = pdf.length;
    pdf += objects[id];
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${nextObjId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextObjId; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextObjId} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Laudo-${order.protocol_code}-${(order.patient?.name || 'Paciente').replace(/\s+/g, '_')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Opens a formatted print preview window for either the official report or tube barcode labels.
 */
export function printFormattedReportWindow(order: Order, template?: ReportTemplate): void {
  const tpl = template || order.template || DEFAULT_FALLBACK_TEMPLATE;
  const renderedHtml = renderReportHtmlWithDynamicTags(tpl, order);
  const win = window.open('', '_blank', 'width=940,height=780');
  if (!win) {
    downloadOrderPdf(order, tpl);
    return;
  }
  win.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Laudo Oficial ${order.protocol_code} — VetLife Lab</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; background: #fff; }
          .header { border-bottom: 2px solid #0d9488; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
          .brand-wrap { display: flex; align-items: center; gap: 12px; }
          .brand-logo { height: 48px; width: auto; object-fit: contain; border-radius: 8px; }
          .brand { font-size: 20px; font-weight: 800; color: #0b2240; }
          .protocol-box { background: #f0fdfa; border: 1px solid #0d9488; padding: 8px 14px; border-radius: 8px; font-family: monospace; font-weight: bold; color: #0f766e; }
          .report-body { font-size: 13px; }
          .sig { margin-top: 28px; text-align: right; font-size: 12px; color: #334155; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="brand-wrap">
            <img src="/images/vetlife-logo.jpg" alt="VetLife" class="brand-logo" />
            <div>
              <div class="brand">VetLife Diagnósticos Veterinários</div>
              <div style="font-size:12px;color:#475569;">https://vetlifelab.com.br — Central Diagnóstica Veterinária</div>
            </div>
          </div>
          <div class="protocol-box">Protocolo: ${order.protocol_code}</div>
        </div>
        <div class="report-body">${renderedHtml}</div>
        <div class="sig">
          <strong>Assinado Digitalmente:</strong> Dra. Maysa Barbosa de Almeida (RT) &amp; Dra. Kerollyn Passos Silva<br/>
          Verificação pública sem senha em <strong>vetlifelab.com.br/consulta</strong> informando o código <strong>${order.protocol_code}</strong>
        </div>
        <script>setTimeout(() => { window.print(); }, 350);</script>
      </body>
    </html>
  `);
  win.document.close();
}

function wrapPdfText(input: string, maxChars: number): string[] {
  const clean = sanitizePdfText(input);
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

function inferMaterialAndTube(lbl: CollectionLabel): { material: string; tube: string } {
  const rawTube = (lbl.tube_type || 'Tubo Padrao').trim();
  const lower = rawTube.toLowerCase();
  let material = 'Amostra';
  if (lower.includes('soro') || lower.includes('amarelo') || lower.includes('vermelh')) {
    material = 'Soro';
  } else if (
    lower.includes('sangue') ||
    lower.includes('edta') ||
    lower.includes('roxo') ||
    lower.includes('citrat') ||
    lower.includes('heparin')
  ) {
    material = 'Sangue';
  } else if (lower.includes('urina')) {
    material = 'Urina';
  } else if (lower.includes('fezes') || lower.includes('copro')) {
    material = 'Fezes';
  } else if (lower.includes('swab') || lower.includes('raspado') || lower.includes('pele')) {
    material = 'Swab/Pele';
  } else if (lower.includes('biops') || lower.includes('histop') || lower.includes('citol')) {
    material = 'Tecido';
  }
  return { material, tube: rawTube };
}

function formatThermalDateTime(iso?: string): string {
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
 * Gera e baixa PDF 1.4 no tamanho exato 50mm x 30mm (141.73 pt x 85.04 pt)
 * para impressora térmica Zebra (1 etiqueta por página, estritamente Preto e Branco,
 * cabeçalho branco com código maior, paciente+data+espécie na mesma linha e rodapé CÓDIGO | EXAME).
 */
export function downloadThermalLabelsPdf(
  labels: CollectionLabel[],
  protocolCode?: string
): void {
  if (!labels || labels.length === 0) return;

  const W = 141.73; // 50 mm
  const H = 85.04;  // 30 mm

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextObjId = 5;

  for (let i = 0; i < labels.length; i++) {
    pageObjectIds.push(nextObjId++);
    contentObjectIds.push(nextObjId++);
  }

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i];
    const pId = pageObjectIds[i];
    const cId = contentObjectIds[i];

    const patientUpper = sanitizePdfText((lbl.patient_name || 'PACIENTE').toUpperCase()).slice(0, 11);
    const tutorText = sanitizePdfText(`Tutor: ${lbl.tutor_name || '-'}`).slice(0, 32);
    const dateTimeStr = sanitizePdfText(formatThermalDateTime(lbl.created_at));
    const speciesText = sanitizePdfText(lbl.species || '').slice(0, 9);
    const { material, tube } = inferMaterialAndTube(lbl);
    const matTubeLines = wrapPdfText(`Material: ${material}  Tubo: ${tube}`, 36).slice(0, 2);
    const proto = sanitizePdfText(lbl.protocol_code || protocolCode || 'VET-2026');
    const examCode = sanitizePdfText(lbl.exam_code || '000');
    const examPipeLines = wrapPdfText(`${examCode} | ${lbl.exam_name || 'Exame'}`, 35).slice(0, 2);
    const idxStr = sanitizePdfText(`${lbl.label_index}/${lbl.total_labels_for_exam}`);

    const cmds: string[] = [];
    // Cabeçalho branco com texto preto e código do protocolo maior
    cmds.push('0 g 0 G');
    cmds.push('BT /F2 6.8 Tf 4.5 75.2 Td (VETLIFE) Tj ET');
    cmds.push(`BT /F2 8.6 Tf 40.0 74.8 Td (${proto}) Tj ET`);
    cmds.push(`BT /F2 6.8 Tf 120.0 75.2 Td (${idxStr}) Tj ET`);
    cmds.push('0.9 w 4.5 71.8 m 137.23 71.8 l S');

    // Linha 1: Paciente (cortado se grande) + Data/Hora + Espécie na mesma linha com fonte maior
    cmds.push(`BT /F2 7.4 Tf 4.5 62.8 Td (${patientUpper}) Tj ET`);
    cmds.push(`BT /F2 6.2 Tf 53.0 62.8 Td (${dateTimeStr}) Tj ET`);
    if (speciesText) {
      cmds.push(`BT /F2 6.2 Tf 97.5 62.8 Td (ESP: ${speciesText}) Tj ET`);
    }

    // Linha 2: Tutor + linha divisória
    cmds.push(`BT /F1 6.2 Tf 4.5 54.4 Td (${tutorText}) Tj ET`);
    cmds.push('0.5 w 4.5 51.0 m 137.23 51.0 l S');

    // Material e Tubo
    cmds.push(`BT /F1 5.8 Tf 4.5 43.8 Td (${matTubeLines[0] || ''}) Tj ET`);
    if (matTubeLines[1]) {
      cmds.push(`BT /F1 5.8 Tf 4.5 37.0 Td (${matTubeLines[1]}) Tj ET`);
    }

    // Caixa de rodapé: CÓDIGO | NOME/RESUMO DO EXAME (sem repetir protocolo, até 2 linhas)
    cmds.push('0.8 w 4.5 4.2 132.73 26.5 re S');
    cmds.push(`BT /F2 6.6 Tf 7.5 21.0 Td (${examPipeLines[0] || ''}) Tj ET`);
    if (examPipeLines[1]) {
      cmds.push(`BT /F1 6.0 Tf 7.5 11.5 Td (${examPipeLines[1]}) Tj ET`);
    }

    const stream = cmds.join('\n') + '\n';
    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W.toFixed(
      2
    )} ${H.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let id = 1; id < nextObjId; id++) {
    offsets[id] = pdf.length;
    pdf += objects[id];
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${nextObjId}\n0000000000 65535 f \n`;
  for (let id = 1; id < nextObjId; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${nextObjId} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const code = (protocolCode || labels[0]?.protocol_code || 'VETLIFE').replace(/[^a-zA-Z0-9_-]/g, '');
  link.href = url;
  link.download = `Etiquetas-Zebra-50x30mm-${code}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function printCollectionLabelsWindow(labels: CollectionLabel[]): void {
  const win = window.open('', '_blank', 'width=480,height=640');
  if (!win) {
    downloadThermalLabelsPdf(labels);
    return;
  }
  const pagesHtml = labels
    .map((lbl) => {
      const { material, tube } = inferMaterialAndTube(lbl);
      const dt = formatThermalDateTime(lbl.created_at);
      return `
      <div class="label-page">
        <div class="bar">
          <span class="brand-name">VETLIFE</span>
          <span class="proto-header">${lbl.protocol_code}</span>
          <span class="idx-header">${lbl.label_index}/${lbl.total_labels_for_exam}</span>
        </div>
        <div class="patient-row">
          <span class="patient">${(lbl.patient_name || '').toUpperCase()}</span>
          <span class="dt">${dt}</span>
          <span class="esp"><strong>ESP:</strong> ${lbl.species || '-'}</span>
        </div>
        <div class="tutor"><strong>Tutor:</strong> ${lbl.tutor_name || '-'}</div>
        <div class="mat"><strong>Material:</strong> ${material} &nbsp; <strong>Tubo:</strong> ${tube}</div>
        <div class="footer-box">
          <div class="exam-pipe"><span class="exam-code">${lbl.exam_code}</span> | ${lbl.exam_name}</div>
        </div>
      </div>
    `;
    })
    .join('');

  win.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Etiquetas Térmicas Zebra 50x30mm — VetLife</title>
        <style>
          @page { size: 50mm 30mm; margin: 0; }
          * { box-sizing: border-box; color: #000 !important; }
          body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background: #fff; }
          .label-page {
            width: 50mm; height: 30mm; padding: 1.2mm 1.5mm;
            page-break-after: always; break-after: page;
            display: flex; flex-direction: column; justify-content: space-between;
            background: #fff; border: 0; overflow: hidden;
          }
          .label-page:last-child { page-break-after: auto; break-after: auto; }
          .bar {
            background: #fff !important; color: #000 !important;
            border-bottom: 0.35mm solid #000;
            display: flex; justify-content: space-between; align-items: baseline;
            padding: 0 0 0.5mm 0; font-family: monospace; font-weight: 700;
          }
          .brand-name { font-size: 6.6pt; }
          .proto-header { font-size: 8.6pt; font-weight: 800; }
          .idx-header { font-size: 6.6pt; }
          .patient-row {
            display: flex; justify-content: space-between; align-items: baseline; gap: 1mm;
            padding-top: 0.3mm;
          }
          .patient {
            font-size: 7.4pt; font-weight: 800; line-height: 1.1;
            max-width: 42%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .dt { font-size: 6.2pt; font-weight: 600; white-space: nowrap; }
          .esp { font-size: 6.2pt; font-weight: 700; white-space: nowrap; }
          .tutor {
            font-size: 6.2pt; line-height: 1.1;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            border-bottom: 0.25mm solid #000; padding-bottom: 0.5mm;
          }
          .mat { font-size: 5.8pt; line-height: 1.15; max-height: 5.8mm; overflow: hidden; }
          .footer-box { border: 0.3mm solid #000; padding: 0.6mm 1.1mm; background: #fff; }
          .exam-pipe {
            font-size: 6.2pt; font-weight: 600; line-height: 1.15;
            max-height: 5.8mm; overflow: hidden;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          }
          .exam-code { font-size: 7.2pt; font-weight: 800; font-family: monospace; }
          @media screen {
            body { background: #e5e5e5; padding: 12px; display: flex; flex-wrap: wrap; gap: 10px; }
            .label-page { box-shadow: 0 1px 4px rgba(0,0,0,0.25); }
          }
        </style>
      </head>
      <body>
        ${pagesHtml}
        <script>setTimeout(() => { window.print(); }, 300);</script>
      </body>
    </html>
  `);
  win.document.close();
}
