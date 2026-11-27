import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Order, CollectionLabel, ReportTemplate } from '../types';
import {
  DEFAULT_MERGED_REPORT_TEMPLATE,
  renderReportHtmlWithDynamicTags,
} from '../services/api';

const DEFAULT_FALLBACK_TEMPLATE: ReportTemplate = {
  id: 'default',
  ...DEFAULT_MERGED_REPORT_TEMPLATE,
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

async function waitForImagesLoaded(container: HTMLElement, timeoutMs = 3500): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  if (images.length === 0) return;

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            img.removeEventListener('load', finish);
            img.removeEventListener('error', finish);
            resolve();
          };
          img.addEventListener('load', finish);
          img.addEventListener('error', finish);
          setTimeout(finish, timeoutMs);
        })
    )
  );
}

/**
 * Renders the order's HTML report template offscreen at A4 width, captures it in full color
 * via html2canvas, slices cleanly across A4 pages with jsPDF, and returns { blob, base64, filename }.
 */
export async function generateOrderPdfBlob(
  order: Order,
  customTemplate?: ReportTemplate
): Promise<{ blob: Blob; base64: string; filename: string }> {
  const resolvedTemplate = customTemplate || order.template || DEFAULT_FALLBACK_TEMPLATE;
  const renderedHtml = renderReportHtmlWithDynamicTags(resolvedTemplate, order);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.padding = '28px 34px';
  container.style.boxSizing = 'border-box';
  container.style.background = '#ffffff';
  container.style.fontFamily = 'Arial, Helvetica, sans-serif';
  container.style.color = '#0f172a';
  container.style.zIndex = '-1';

  container.innerHTML = `
    <div style="position:relative;width:100%;background:#ffffff;">
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:0;opacity:0.045;">
        <img src="/images/vetlife-logo.jpg" alt="" style="width:340px;height:auto;object-fit:contain;" />
      </div>
      <div style="position:relative;z-index:1;">
        ${renderedHtml}
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    await waitForImagesLoaded(container);

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const topMarginMm = 6;
    const bottomMarginMm = 12;
    const printableHeightMm = pageHeightMm - topMarginMm - bottomMarginMm;

    const pxPerMm = canvas.width / pageWidthMm;
    const sliceHeightPx = Math.max(1, Math.floor(printableHeightMm * pxPerMm));

    let yOffsetPx = 0;
    let pageIdx = 0;

    while (yOffsetPx < canvas.height) {
      const currentSlicePx = Math.min(sliceHeightPx, canvas.height - yOffsetPx);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = currentSlicePx;

      const ctx = sliceCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          yOffsetPx,
          canvas.width,
          currentSlicePx,
          0,
          0,
          canvas.width,
          currentSlicePx
        );
      }

      if (pageIdx > 0) {
        pdf.addPage();
      }

      const sliceHeightMm = currentSlicePx / pxPerMm;
      const sliceDataUrl = sliceCanvas.toDataURL('image/png');
      pdf.addImage(sliceDataUrl, 'PNG', 0, topMarginMm, pageWidthMm, sliceHeightMm, undefined, 'FAST');

      yOffsetPx += currentSlicePx;
      pageIdx += 1;
    }

    const totalPages = pdf.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      pdf.setPage(p);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(
        `VetLife Laboratório Veterinário • Protocolo ${order.protocol_code}`,
        10,
        pageHeightMm - 6
      );
      pdf.text(`Página ${p} de ${totalPages}`, pageWidthMm - 10, pageHeightMm - 6, {
        align: 'right',
      });
    }

    const blob = pdf.output('blob');
    const dataUri = pdf.output('datauristring');
    const commaIdx = dataUri.indexOf(',');
    const base64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
    const safePatient = (order.patient?.name || 'Paciente')
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'Paciente';
    const filename = `Laudo-${order.protocol_code}-${safePatient}.pdf`;

    return { blob, base64, filename };
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

/**
 * Generates and downloads a full-color A4 PDF matching the active HTML report template 1:1.
 */
export async function downloadOrderPdf(
  order: Order,
  customTemplate?: ReportTemplate
): Promise<void> {
  try {
    const { blob, filename } = await generateOrderPdfBlob(order, customTemplate);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (err) {
    console.error('[VetLife PDF] Falha ao gerar PDF via html2canvas/jsPDF, abrindo impressão:', err);
    printFormattedReportWindow(order, customTemplate);
  }
}

/**
 * Opens a formatted A4 print preview window rendering ONLY the active HTML template (1:1 parity).
 */
export function printFormattedReportWindow(order: Order, customTemplate?: ReportTemplate): void {
  const resolvedTemplate = customTemplate || order.template || DEFAULT_FALLBACK_TEMPLATE;
  const renderedHtml = renderReportHtmlWithDynamicTags(resolvedTemplate, order);
  const win = window.open('', '_blank', 'width=940,height=780');
  if (!win) {
    void downloadOrderPdf(order, resolvedTemplate);
    return;
  }
  win.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Laudo Oficial ${order.protocol_code} — VetLife Lab</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 16px;
            background: #ffffff;
            line-height: 1.45;
          }
          .a4-shell {
            position: relative;
            max-width: 794px;
            margin: 0 auto;
            background: #ffffff;
          }
          .watermark {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: none;
            z-index: 0;
            opacity: 0.045;
          }
          .watermark img {
            width: 340px;
            height: auto;
            object-fit: contain;
          }
          .report-content {
            position: relative;
            z-index: 1;
          }
          @media print {
            body { padding: 0; }
            .a4-shell { max-width: none; }
          }
        </style>
      </head>
      <body>
        <div class="a4-shell">
          <div class="watermark">
            <img src="/images/vetlife-logo.jpg" alt="" />
          </div>
          <div class="report-content">${renderedHtml}</div>
        </div>
        <script>
          window.addEventListener('load', () => {
            setTimeout(() => { window.print(); }, 350);
          });
        </script>
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
