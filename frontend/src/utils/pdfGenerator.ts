import { Order, CollectionLabel, ReportTemplate } from '../types';
import { formatAgeLabel, renderReportWithDynamicTags } from '../services/api';
import { SEED_REPORT_TEMPLATES } from '../services/mockData';

function sanitizePdfText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Generates and downloads a valid ISO PDF 1.4 binary document (.pdf) directly in the browser
 * containing the full VetLife Laboratory Report (Header, Patient/Tutor/Vet info, Dynamic Results,
 * Cross-matched Reference Values by Species/Gender/Age, Attachments and Biomedical Signature).
 */
export function downloadOrderPdf(order: Order, customTemplate?: ReportTemplate): void {
  const tpl = customTemplate || order.template || SEED_REPORT_TEMPLATES[0];
  const ageLabel = formatAgeLabel(order.patient?.age_days, order.patient?.birth_date);
  const releaseStr = order.released_at
    ? new Date(order.released_at).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');

  const lines: Array<{ text: string; size: number; bold?: boolean }> = [
    { text: 'VETLIFE DIAGNOSTICOS VETERINARIOS - vetlifelab.com.br', size: 13, bold: true },
    { text: sanitizePdfText(tpl.header_html), size: 8 },
    { text: '----------------------------------------------------------------------------------------', size: 9 },
    {
      text: `LAUDO LABORATORIAL OFICIAL | PROTOCOLO: ${order.protocol_code} | STATUS: ${order.status.toUpperCase()}`,
      size: 11,
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
      text: `TUTOR(A) RESPONSAVEL: ${order.patient?.tutor_name || '-'} | Contato: ${
        order.patient?.tutor_phone || '-'
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
    lines.push({
      text: `${idx + 1}. [${res.exam_code || 'EXM'}] ${res.exam_name || 'Exame'} (Setor: ${
        res.section || 'Geral'
      })`,
      size: 10,
      bold: true,
    });

    const entries = Object.entries(res.dynamic_content || {});
    const fields = res.input_fields || [];
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

    const refText =
      res.reference_snapshot ||
      res.matched_reference?.reference_text_content ||
      'Referencia cruzada padrao para a especie/idade.';
    // Wrap reference text into 88-char chunks
    const cleanRef = `   Ref. (${order.patient?.species || 'Especie'}/${ageLabel}): ${refText}`;
    for (let i = 0; i < cleanRef.length; i += 88) {
      lines.push({ text: cleanRef.slice(i, i + 88), size: 8 });
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
    text: 'Responsavel Tecnico: Dra. Camila Prado - Biomedica Veterinaria CRBM-1 9841',
    size: 9,
    bold: true,
  });
  lines.push({
    text: sanitizePdfText(tpl.footer_html),
    size: 8,
  });
  lines.push({
    text: `Autenticidade verificavel em https://vetlifelab.com.br/consulta — Protocolo ${order.protocol_code}`,
    size: 8,
  });

  // Build PDF content stream
  let y = 800;
  const streamCommands: string[] = ['BT'];
  lines.slice(0, 56).forEach((line) => {
    const font = line.bold ? '/F2' : '/F1';
    const safe = sanitizePdfText(line.text);
    streamCommands.push(`${font} ${line.size} Tf`);
    streamCommands.push(`1 0 0 1 40 ${y} Tm`);
    streamCommands.push(`(${safe}) Tj`);
    y -= line.size + 4;
  });
  streamCommands.push('ET');
  const streamContent = streamCommands.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
    `6 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  objects.forEach((obj) => {
    offsets.push(pdf.length);
    pdf += obj;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

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
  const tpl = template || order.template || SEED_REPORT_TEMPLATES[0];
  const rendered = renderReportWithDynamicTags(tpl, order);
  const win = window.open('', '_blank', 'width=900,height=750');
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
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 32px; line-height: 1.5; }
          .header { border-bottom: 3px solid #059669; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: center; }
          .brand { font-size: 22px; font-weight: 800; color: #065f46; }
          .protocol-box { background: #ecfdf5; border: 1px solid #10b981; padding: 8px 14px; border-radius: 8px; font-family: monospace; font-weight: bold; }
          pre { white-space: pre-wrap; font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; background: #f8fafc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; }
          .sig { margin-top: 28px; text-align: right; font-size: 12px; color: #334155; border-top: 1px dashed #cbd5e1; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">VetLife Diagnósticos Veterinários</div>
            <div style="font-size:12px;color:#475569;">https://vetlifelab.com.br — Central Diagnóstica Veterinária</div>
          </div>
          <div class="protocol-box">Protocolo: ${order.protocol_code}</div>
        </div>
        <pre>${rendered}</pre>
        <div class="sig">
          <strong>Assinado Digitalmente:</strong> Dra. Camila Prado — Biomédica Responsável (CRBM-1 9841)<br/>
          Verificação pública sem senha em <strong>vetlifelab.com.br/consulta</strong> informando o código <strong>${order.protocol_code}</strong>
        </div>
        <script>setTimeout(() => { window.print(); }, 350);</script>
      </body>
    </html>
  `);
  win.document.close();
}

export function printCollectionLabelsWindow(labels: CollectionLabel[]): void {
  const win = window.open('', '_blank', 'width=720,height=650');
  if (!win) return;
  const cardsHtml = labels
    .map(
      (lbl) => `
      <div class="label-card">
        <div class="top-row">
          <span><strong>VETLIFE LAB</strong> • ${lbl.protocol_code}</span>
          <span>Etiqueta ${lbl.label_index}/${lbl.total_labels_for_exam}</span>
        </div>
        <div class="patient">${lbl.patient_name} (${lbl.species}) — Tutor: ${lbl.tutor_name}</div>
        <div class="exam"><strong>[${lbl.exam_code}]</strong> ${lbl.exam_name}</div>
        <div class="tube">Tubo: ${lbl.tube_type} | Setor: ${lbl.section}</div>
        <div class="barcode">||| || |||| | ||| |||| || | ||||</div>
        <div class="barcode-code">${lbl.barcode}</div>
      </div>
    `
    )
    .join('');

  win.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>Etiquetas de Coleta — VetLife</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; background: #f8fafc; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
          .label-card { background: #fff; border: 2px dashed #0f172a; border-radius: 8px; padding: 12px; font-size: 11px; }
          .top-row { display: flex; justify-content: space-between; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin-bottom: 6px; }
          .patient { font-size: 13px; font-weight: bold; margin-bottom: 4px; }
          .exam { color: #065f46; margin-bottom: 3px; }
          .tube { background: #f1f5f9; padding: 3px 6px; border-radius: 4px; font-weight: 600; margin-bottom: 6px; }
          .barcode { font-family: monospace; font-size: 20px; letter-spacing: 3px; text-align: center; font-weight: 900; margin-top: 4px; }
          .barcode-code { font-family: monospace; font-size: 10px; text-align: center; color: #475569; }
        </style>
      </head>
      <body>
        <h3 style="margin-top:0;">Impressão Térmica de Etiquetas de Amostra Biológica — VetLife</h3>
        <div class="grid">${cardsHtml}</div>
        <script>setTimeout(() => { window.print(); }, 350);</script>
      </body>
    </html>
  `);
  win.document.close();
}
