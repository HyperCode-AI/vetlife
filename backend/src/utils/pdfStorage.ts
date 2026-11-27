import { Invoice, Order, SampleLabel } from '../domain/entities';
import {
  decodeHtmlEntities,
  resolveSideBySideReference,
  stripFormControlsToText,
} from '../domain/services/ReportRendererService';

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

function toPlainAsciiPdf(input: string): string {
  const withoutControls = stripFormControlsToText(String(input || ''));
  return decodeHtmlEntities(withoutControls.replace(/<[^>]+>/g, ' '))
    .replace(/[\u2013\u2014]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapePdfLiteral(plain: string): string {
  return plain
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function estimateHelveticaWidth(text: string, fontSize: number, bold = false): number {
  let factor = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('ilI1.,:;|\'!` '.includes(ch)) {
      factor += 0.28;
    } else if ('fjrt()[]/\\-'.includes(ch)) {
      factor += 0.36;
    } else if ('MWmw@%'.includes(ch)) {
      factor += 0.84;
    } else if (ch >= 'A' && ch <= 'Z') {
      factor += 0.67;
    } else {
      factor += 0.54;
    }
  }
  return factor * fontSize * (bold ? 1.06 : 1.0);
}

function wrapHelveticaText(
  input: string,
  maxWidthPt: number,
  fontSize: number,
  bold = false
): string[] {
  const clean = toPlainAsciiPdf(input);
  if (!clean) return [''];
  if (estimateHelveticaWidth(clean, fontSize, bold) <= maxWidthPt) return [clean];

  const words = clean.split(' ');
  const out: string[] = [];
  let current = '';

  for (const word of words) {
    if (estimateHelveticaWidth(word, fontSize, bold) > maxWidthPt) {
      if (current) {
        out.push(current);
        current = '';
      }
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (chunk && estimateHelveticaWidth(next, fontSize, bold) > maxWidthPt) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      if (chunk) current = chunk;
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (estimateHelveticaWidth(candidate, fontSize, bold) > maxWidthPt) {
      if (current) out.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) out.push(current);
  return out.length > 0 ? out : [''];
}

/**
 * Divide referencias que contenham '|' ou quebras de linha para que cada parametro
 * seja renderizado em sua propria linha dentro da tabela e da secao de referencias.
 */
function splitPipeReferenceLines(
  rawRef: string,
  maxWidthPt: number,
  fontSize: number
): string[] {
  const withoutControls = stripFormControlsToText(String(rawRef || ''));
  const stripped = decodeHtmlEntities(
    withoutControls
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );

  const segments = stripped
    .split(/\s*\|\s*|\r?\n/)
    .map((s) => toPlainAsciiPdf(s))
    .filter(Boolean);

  if (segments.length === 0) {
    return ['-'];
  }

  const lines: string[] = [];
  for (const seg of segments) {
    const wrapped = wrapHelveticaText(seg, maxWidthPt, fontSize, false).filter((l) => l.trim().length > 0);
    lines.push(...wrapped);
  }
  return lines.length > 0 ? lines : ['-'];
}

function formatOrderDateBr(iso?: string | null): string {
  if (!iso) return new Date().toLocaleDateString('pt-BR');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatOrderDateTimeBr(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Gera um documento PDF 1.4 valido (binario) com identidade visual VetLife
 * (Navy #0b2240 + Teal #118a8a + Soft Tint #f0f8f8, Helvetica/Helvetica-Bold)
 * para um exame especifico (singleResultId) ou concatenando todos os exames do atendimento.
 */
export function buildOrderPdfBuffer(order: Order, singleResultId?: string): Buffer {
  const W = 595;
  const H = 842;
  const M_LEFT = 36;
  const M_RIGHT = 36;
  const CONTENT_W = W - M_LEFT - M_RIGHT; // 523 pt
  const BOTTOM_LIMIT = 104;

  // VetLife brand palette
  const NAVY_FILL = '0.043 0.133 0.251 rg';
  const NAVY_STROKE = '0.043 0.133 0.251 RG';
  const TEAL_FILL = '0.067 0.541 0.541 rg';
  const TEAL_STROKE = '0.067 0.541 0.541 RG';
  const SOFT_TINT_FILL = '0.941 0.973 0.973 rg';
  const ZEBRA_FILL = '0.969 0.984 0.988 rg';
  const WHITE_FILL = '1 1 1 rg';
  const BORDER_STROKE = '0.820 0.863 0.894 RG';
  const TEXT_DARK = '0.118 0.161 0.231 rg';
  const TEXT_MUTED = '0.392 0.455 0.545 rg';

  const resultsToInclude = singleResultId
    ? (order.results || []).filter((r) => r.id === singleResultId)
    : order.results || [];

  const releaseStr = formatOrderDateTimeBr(new Date().toISOString());
  const orderDateStr = formatOrderDateBr(order.created_at);
  const protocolCode = toPlainAsciiPdf(order.protocol_code || order.id || 'VET-2026');
  const statusUpper = toPlainAsciiPdf((order.status || 'pendente').toUpperCase());

  const patientName = toPlainAsciiPdf(order.patient?.name || '-');
  const patientSpecies = toPlainAsciiPdf(order.patient?.species || '-');
  const patientBreed = toPlainAsciiPdf(order.patient?.breed || '-');
  const patientGender =
    order.patient?.gender === 'M'
      ? 'Macho'
      : order.patient?.gender === 'F'
      ? 'Femea'
      : toPlainAsciiPdf(order.patient?.gender || '-');
  const patientAge = toPlainAsciiPdf(
    order.patient?.age_label ||
      (order.patient?.age_days ? `${order.patient.age_days} dias` : '-')
  );
  const tutorName = toPlainAsciiPdf(order.patient?.tutor_name || '-');
  const tutorPhone = toPlainAsciiPdf(order.patient?.tutor_phone || '-');
  const vetName = toPlainAsciiPdf(order.vet?.name || '-');
  const vetCrmv = toPlainAsciiPdf(order.vet?.crmv || '-');
  const vetClinic = toPlainAsciiPdf(order.vet?.clinic_name || 'Clinica Parceira');

  const pages: string[][] = [];
  let cmds: string[] = [];
  let y = 0;

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    bold: boolean,
    colorCmd: string
  ) => {
    const clean = toPlainAsciiPdf(text);
    if (!clean) return;
    const font = bold ? '/F2' : '/F1';
    cmds.push(
      `${colorCmd}\nBT ${font} ${size.toFixed(1)} Tf 1 0 0 1 ${x.toFixed(2)} ${yPos.toFixed(
        2
      )} Tm (${escapePdfLiteral(clean)}) Tj ET`
    );
  };

  const drawRightText = (
    text: string,
    rightX: number,
    yPos: number,
    size: number,
    bold: boolean,
    colorCmd: string
  ) => {
    const clean = toPlainAsciiPdf(text);
    if (!clean) return;
    const w = estimateHelveticaWidth(clean, size, bold);
    const x = Math.max(M_LEFT, rightX - w);
    drawText(clean, x, yPos, size, bold, colorCmd);
  };

  const drawRectFill = (x: number, yBottom: number, w: number, h: number, fillCmd: string) => {
    cmds.push(`${fillCmd}\n${x.toFixed(2)} ${yBottom.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };

  const drawRectStroke = (
    x: number,
    yBottom: number,
    w: number,
    h: number,
    strokeCmd: string,
    lineWidth = 0.6
  ) => {
    cmds.push(
      `${lineWidth.toFixed(2)} w ${strokeCmd}\n${x.toFixed(2)} ${yBottom.toFixed(
        2
      )} ${w.toFixed(2)} ${h.toFixed(2)} re S`
    );
  };

  const drawLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    strokeCmd: string,
    lineWidth = 0.8
  ) => {
    cmds.push(
      `${lineWidth.toFixed(2)} w ${strokeCmd}\n${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(
        2
      )} ${y2.toFixed(2)} l S`
    );
  };

  const startNewPage = () => {
    cmds = [];
    pages.push(cmds);

    // Top branded dual-tone header band (Navy + Teal)
    drawRectFill(0, H - 8, W, 8, NAVY_FILL);
    drawRectFill(0, H - 11, W, 3, TEAL_FILL);

    // Left brand identity with Teal accent bar
    drawRectFill(M_LEFT, 777, 4, 42, TEAL_FILL);
    drawText('VETLIFE', M_LEFT + 10, 804, 18, true, NAVY_FILL);
    drawText('DIAGNOSTICOS VETERINARIOS', M_LEFT + 10, 791, 9, true, TEAL_FILL);
    drawText(
      'Laboratorio Clinico Veterinario | Controle de Qualidade PNCQ',
      M_LEFT + 10,
      780,
      7.2,
      false,
      TEXT_MUTED
    );

    // Right-aligned address / WhatsApp / CRMV / Protocolo
    const rightEdge = W - M_RIGHT;
    drawRightText(
      'R. La Salles, 424 - Mocoquinha, Sao Sebastiao do Paraiso - MG',
      rightEdge,
      812,
      7.2,
      false,
      TEXT_DARK
    );
    drawRightText(
      'WhatsApp: (35) 98458-1997 | vetlifelab.com.br',
      rightEdge,
      801,
      7.4,
      true,
      TEAL_FILL
    );
    drawRightText('Registro CRMV-SP PJ 09842', rightEdge, 790, 7.2, false, TEXT_MUTED);
    drawRightText(
      `Protocolo: ${protocolCode} | Emissao: ${releaseStr}`,
      rightEdge,
      779,
      7.4,
      true,
      NAVY_FILL
    );

    // Navy divider rule
    drawLine(M_LEFT, 769, W - M_RIGHT, 769, NAVY_STROKE, 1.5);

    y = 758;
  };

  const ensureSpace = (neededPt: number): boolean => {
    if (y - neededPt < BOTTOM_LIMIT) {
      startNewPage();
      return true;
    }
    return false;
  };

  const drawTableHeader = (speciesLabel: string) => {
    const rowH = 18;
    drawRectFill(M_LEFT, y - rowH, CONTENT_W, rowH, TEAL_FILL);
    drawRectStroke(M_LEFT, y - rowH, CONTENT_W, rowH, TEAL_STROKE, 0.5);
    const textY = y - 12.2;
    drawText('PARAMETRO ANALISADO', M_LEFT + 6, textY, 7.8, true, WHITE_FILL);
    drawText('RESULTADO OBTIDO', M_LEFT + 178, textY, 7.8, true, WHITE_FILL);
    drawText(
      `VALORES DE REFERENCIA (${speciesLabel})`,
      M_LEFT + 298,
      textY,
      7.8,
      true,
      WHITE_FILL
    );
    y -= rowH;
  };

  // Start Page 1
  startNewPage();

  // Structured 2-pair patient info grid (Navy & Teal label cells + crisp borders)
  const colL1 = 76;
  const colV1 = 185;
  const colL2 = 80;
  const colV2 = CONTENT_W - colL1 - colV1 - colL2; // 182 pt
  const gridRowH = 18;

  const infoRows: Array<[string, string, string, string]> = [
    ['PACIENTE', patientName, 'PROTOCOLO', protocolCode],
    ['ESPECIE / RACA', `${patientSpecies} / ${patientBreed}`, 'SEXO / IDADE', `${patientGender} / ${patientAge}`],
    ['TUTOR(A)', tutorName, 'CONTATO', tutorPhone],
    ['VETERINARIO', `${vetName} (${vetCrmv})`, 'CLINICA / DATA', `${vetClinic} | ${orderDateStr}`],
  ];

  infoRows.forEach(([l1, v1, l2, v2], rowIdx) => {
    const rowBottom = y - gridRowH;
    const valBg = rowIdx % 2 === 0 ? SOFT_TINT_FILL : WHITE_FILL;

    // Label 1 (Navy)
    drawRectFill(M_LEFT, rowBottom, colL1, gridRowH, NAVY_FILL);
    // Value 1
    drawRectFill(M_LEFT + colL1, rowBottom, colV1, gridRowH, valBg);
    // Label 2 (Teal)
    drawRectFill(M_LEFT + colL1 + colV1, rowBottom, colL2, gridRowH, TEAL_FILL);
    // Value 2
    drawRectFill(M_LEFT + colL1 + colV1 + colL2, rowBottom, colV2, gridRowH, valBg);

    // Crisp cell borders
    drawRectStroke(M_LEFT, rowBottom, CONTENT_W, gridRowH, BORDER_STROKE, 0.6);
    drawLine(M_LEFT + colL1, rowBottom, M_LEFT + colL1, y, BORDER_STROKE, 0.5);
    drawLine(M_LEFT + colL1 + colV1, rowBottom, M_LEFT + colL1 + colV1, y, BORDER_STROKE, 0.5);
    drawLine(
      M_LEFT + colL1 + colV1 + colL2,
      rowBottom,
      M_LEFT + colL1 + colV1 + colL2,
      y,
      BORDER_STROKE,
      0.5
    );

    const textY = rowBottom + 5.6;
    drawText(l1, M_LEFT + 5, textY, 7.0, true, WHITE_FILL);
    const v1Clip = wrapHelveticaText(v1, colV1 - 10, 7.6, rowIdx === 0)[0] || '-';
    drawText(v1Clip, M_LEFT + colL1 + 5, textY, 7.6, rowIdx === 0, TEXT_DARK);

    drawText(l2, M_LEFT + colL1 + colV1 + 5, textY, 7.0, true, WHITE_FILL);
    const v2Clip = wrapHelveticaText(v2, colV2 - 10, 7.6, rowIdx === 0)[0] || '-';
    drawText(v2Clip, M_LEFT + colL1 + colV1 + colL2 + 5, textY, 7.6, rowIdx === 0, TEXT_DARK);

    y = rowBottom;
  });

  y -= 10;

  // Navy RESULTADO(S) Banner
  const bannerH = 21;
  drawRectFill(M_LEFT, y - bannerH, CONTENT_W, bannerH, NAVY_FILL);
  const bannerTitle = singleResultId
    ? 'RESULTADO(S) ANALITICO(S) - LAUDO INDIVIDUAL'
    : `RESULTADO(S) ANALITICO(S) - LAUDO COMPLETO (${resultsToInclude.length} EXAME(S))`;
  drawText(bannerTitle, M_LEFT + 8, y - 14.2, 8.8, true, WHITE_FILL);
  drawRightText(`STATUS: ${statusUpper}`, W - M_RIGHT - 8, y - 14.2, 7.8, true, '0.678 0.929 0.929 rg');
  y -= bannerH + 10;

  // Results per exam
  const c1W = 172;
  const c2W = 120;
  const c3W = CONTENT_W - c1W - c2W; // 231 pt

  resultsToInclude.forEach((res, idx) => {
    const examCode = toPlainAsciiPdf(res.exam?.code || (res as any).exam_code || 'EXM');
    const examName = toPlainAsciiPdf(res.exam?.name || (res as any).exam_name || 'Exame Laboratorial');
    const examSection = toPlainAsciiPdf(res.exam?.section || (res as any).section || 'Geral');
    const examTitleLines = wrapHelveticaText(
      `${idx + 1}. [${examCode}] ${examName}`,
      CONTENT_W - 22,
      9.2,
      true
    );

    const calloutH = examTitleLines.length * 11.8 + 18;
    ensureSpace(calloutH + 44);

    // Exam callout box with Teal left accent bar
    drawRectFill(M_LEFT, y - calloutH, CONTENT_W, calloutH, SOFT_TINT_FILL);
    drawRectStroke(M_LEFT, y - calloutH, CONTENT_W, calloutH, BORDER_STROKE, 0.6);
    drawRectFill(M_LEFT, y - calloutH, 4, calloutH, TEAL_FILL);

    let ty = y - 12.5;
    for (const tl of examTitleLines) {
      drawText(tl, M_LEFT + 10, ty, 9.2, true, NAVY_FILL);
      ty -= 11.8;
    }
    const releasedLabel = res.released_at
      ? ` | Liberado em: ${formatOrderDateTimeBr(res.released_at)}`
      : '';
    drawText(`Setor: ${examSection}${releasedLabel}`, M_LEFT + 10, ty - 1, 7.3, false, TEAL_FILL);
    y -= calloutH + 8;

    const entries = Object.entries(res.dynamic_content || {});
    const fields = res.exam?.input_fields || (res as any).input_fields || [];

    if (entries.length === 0) {
      ensureSpace(24);
      drawRectFill(M_LEFT, y - 20, CONTENT_W, 20, WHITE_FILL);
      drawRectStroke(M_LEFT, y - 20, CONTENT_W, 20, BORDER_STROKE, 0.5);
      drawText(
        'Parametros em processamento na bancada tecnica.',
        M_LEFT + 8,
        y - 13,
        8.0,
        false,
        TEXT_MUTED
      );
      y -= 28;
    } else {
      ensureSpace(38);
      drawTableHeader(patientSpecies);

      entries.forEach(([key, val], entryIdx) => {
        const meta = fields.find((f: any) => f.field_name === key);
        const rawLabel = meta?.field_label || key;
        const unit = meta?.unit ? ` ${meta.unit}` : '';
        const valText = `${val ?? ''}${unit}`;
        const paramRef = resolveSideBySideReference(key, rawLabel, res.reference_snapshot);

        const labelLines = wrapHelveticaText(rawLabel, c1W - 12, 7.8, true);
        const valLines = wrapHelveticaText(valText, c2W - 12, 8.0, true);
        // CRITICAL: split on '|' so each parameter reference renders on its own line
        const refLines = splitPipeReferenceLines(paramRef, c3W - 12, 7.4);

        const maxLines = Math.max(labelLines.length, valLines.length, refLines.length);
        const lineStep = 10.6;
        const rowH = Math.max(20, maxLines * lineStep + 9);

        if (ensureSpace(rowH)) {
          drawTableHeader(patientSpecies);
        }

        const rowBottom = y - rowH;
        drawRectFill(
          M_LEFT,
          rowBottom,
          CONTENT_W,
          rowH,
          entryIdx % 2 === 1 ? ZEBRA_FILL : WHITE_FILL
        );
        drawRectStroke(M_LEFT, rowBottom, CONTENT_W, rowH, BORDER_STROKE, 0.45);
        drawLine(M_LEFT + c1W, rowBottom, M_LEFT + c1W, y, BORDER_STROKE, 0.4);
        drawLine(M_LEFT + c1W + c2W, rowBottom, M_LEFT + c1W + c2W, y, BORDER_STROKE, 0.4);

        let ly = y - 12;
        for (const l of labelLines) {
          drawText(l, M_LEFT + 6, ly, 7.8, true, TEXT_DARK);
          ly -= lineStep;
        }

        let vy = y - 12;
        for (const v of valLines) {
          drawText(v, M_LEFT + c1W + 6, vy, 8.0, true, TEAL_FILL);
          vy -= lineStep;
        }

        let ry = y - 12;
        for (const r of refLines) {
          drawText(r, M_LEFT + c1W + c2W + 6, ry, 7.4, false, TEXT_MUTED);
          ry -= lineStep;
        }

        y = rowBottom;
      });
      y -= 10;
    }

    // Reference Snapshot Section with '|' split onto separate lines (paginated cleanly)
    if (res.reference_snapshot && res.reference_snapshot.trim()) {
      const refSectionLines = splitPipeReferenceLines(
        res.reference_snapshot,
        CONTENT_W - 18,
        7.3
      );
      const hasMeaningfulRef =
        refSectionLines.length > 0 && !(refSectionLines.length === 1 && refSectionLines[0] === '-');

      if (hasMeaningfulRef) {
        const refLineStep = 10.2;
        const headerPad = 22;
        const bottomPad = 6;
        let lineIdx = 0;
        let isFirstChunk = true;

        while (lineIdx < refSectionLines.length) {
          const minChunkH = (isFirstChunk ? headerPad : 10) + refLineStep + bottomPad;
          if (y - minChunkH < BOTTOM_LIMIT) {
            startNewPage();
          }

          const topPad = isFirstChunk ? headerPad : 10;
          const availH = y - BOTTOM_LIMIT - topPad - bottomPad;
          const maxChunkLines = Math.max(1, Math.floor(availH / refLineStep));
          const chunk = refSectionLines.slice(lineIdx, lineIdx + maxChunkLines);
          const boxH = topPad + chunk.length * refLineStep + bottomPad;

          drawRectFill(M_LEFT, y - boxH, CONTENT_W, boxH, SOFT_TINT_FILL);
          drawRectStroke(M_LEFT, y - boxH, CONTENT_W, boxH, BORDER_STROKE, 0.45);
          drawRectFill(M_LEFT, y - boxH, 2.5, boxH, TEAL_FILL);

          let refY = y - 12;
          if (isFirstChunk) {
            drawText(
              `Valores de Referencia (${patientSpecies}):`,
              M_LEFT + 8,
              refY,
              7.5,
              true,
              NAVY_FILL
            );
            refY -= 11;
          }

          for (const rl of chunk) {
            drawText(rl, M_LEFT + 8, refY, 7.3, false, TEXT_DARK);
            refY -= refLineStep;
          }

          y -= boxH + 10;
          lineIdx += chunk.length;
          isFirstChunk = false;
        }
      }
    }

    if (res.attachments && res.attachments.length > 0) {
      ensureSpace(18);
      drawText(
        `Anexos complementares: ${res.attachments.map((a) => a.name).join(', ')}`,
        M_LEFT + 4,
        y - 10,
        7.3,
        false,
        TEXT_MUTED
      );
      y -= 18;
    }

    y -= 8;
  });

  // Clinical / lab observations if present
  if (order.notes && toPlainAsciiPdf(order.notes).length > 0) {
    const obsLines = wrapHelveticaText(order.notes, CONTENT_W - 18, 7.6, false);
    const obsH = obsLines.length * 10.4 + 20;
    ensureSpace(obsH + 8);
    drawRectFill(M_LEFT, y - obsH, CONTENT_W, obsH, SOFT_TINT_FILL);
    drawRectStroke(M_LEFT, y - obsH, CONTENT_W, obsH, BORDER_STROKE, 0.5);
    drawRectFill(M_LEFT, y - obsH, 3, obsH, NAVY_FILL);
    drawText('OBSERVACOES CLINICAS / LABORATORIAIS', M_LEFT + 8, y - 12, 7.5, true, NAVY_FILL);
    let oy = y - 23;
    for (const ol of obsLines) {
      drawText(ol, M_LEFT + 8, oy, 7.6, false, TEXT_DARK);
      oy -= 10.4;
    }
    y -= obsH + 12;
  }

  // Dual Signatures Block (Kerollyn & Maysa)
  ensureSpace(66);
  y -= 14;
  const sigLineY = y - 10;
  const leftSigStart = M_LEFT + 20;
  const leftSigEnd = M_LEFT + 235;
  const rightSigStart = M_LEFT + 288;
  const rightSigEnd = W - M_RIGHT - 20;

  drawLine(leftSigStart, sigLineY, leftSigEnd, sigLineY, NAVY_STROKE, 0.8);
  drawText(
    'Dra. Kerollyn Isabela Macedo Passos Silva',
    leftSigStart + 6,
    sigLineY - 11,
    7.8,
    true,
    NAVY_FILL
  );
  drawText(
    'Biomedica Patologista Clinica | VetLife Lab',
    leftSigStart + 14,
    sigLineY - 21,
    7.0,
    false,
    TEAL_FILL
  );

  drawLine(rightSigStart, sigLineY, rightSigEnd, sigLineY, NAVY_STROKE, 0.8);
  drawText(
    'Dra. Maysa Barbosa de Almeida',
    rightSigStart + 26,
    sigLineY - 11,
    7.8,
    true,
    NAVY_FILL
  );
  drawText(
    'Medica Veterinaria | Responsavel Tecnica (RT)',
    rightSigStart + 12,
    sigLineY - 21,
    7.0,
    false,
    TEAL_FILL
  );

  // Append standardized VetLife Footer on EVERY page
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    cmds = pages[i];

    // Teal rule above footer
    drawLine(M_LEFT, 88, W - M_RIGHT, 88, TEAL_STROKE, 1.1);

    // 3-column contact strip: Endereco | Contato | Horarios
    const col1X = M_LEFT;
    const col2X = M_LEFT + 186;
    const col3X = M_LEFT + 356;

    drawText('ENDERECO', col1X, 76, 6.8, true, NAVY_FILL);
    drawText('R. La Salles, 424 - Mocoquinha', col1X, 66.5, 6.4, false, TEXT_MUTED);
    drawText('Sao Sebastiao do Paraiso - MG, 37950-000', col1X, 58, 6.4, false, TEXT_MUTED);

    drawText('CONTATO', col2X, 76, 6.8, true, TEAL_FILL);
    drawText('Recepcao / Tecnico: (35) 98458-1997', col2X, 66.5, 6.4, false, TEXT_MUTED);
    drawText('Financeiro: (35) 98445-1372 | vetlifelab.com.br', col2X, 58, 6.4, false, TEXT_MUTED);

    drawText('HORARIOS', col3X, 76, 6.8, true, NAVY_FILL);
    drawText('Seg a Sex: 09:00 - 17:00 | Sab: 09:00 - 11:00', col3X, 66.5, 6.4, false, TEXT_MUTED);
    drawText('Plantoes 24h | Consulta de laudos online 24h', col3X, 58, 6.4, false, TEXT_MUTED);

    // Subtle divider before disclaimer
    drawLine(M_LEFT, 49, W - M_RIGHT, 49, BORDER_STROKE, 0.5);

    // Legal disclaimer
    drawText(
      'Este laudo possui carater tecnico-laboratorial e deve ser interpretado exclusivamente por Medico Veterinario. Documento validado eletronicamente.',
      M_LEFT,
      38,
      6.1,
      false,
      TEXT_MUTED
    );

    // Bottom line with protocol and Pagina X de Y
    drawText(
      `VetLife Diagnosticos Veterinarios | Protocolo ${protocolCode}`,
      M_LEFT,
      23,
      6.8,
      true,
      NAVY_FILL
    );
    drawRightText(
      `Pagina ${i + 1} de ${totalPages}`,
      W - M_RIGHT,
      23,
      7.0,
      true,
      TEAL_FILL
    );
  }

  // Assemble PDF 1.4 objects with Helvetica & Helvetica-Bold
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  let nextObjId = 5;

  for (let i = 0; i < totalPages; i++) {
    pageObjectIds.push(nextObjId++);
    contentObjectIds.push(nextObjId++);
  }

  objects[1] = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(' ')}] /Count ${pageObjectIds.length} >>\nendobj\n`;
  objects[3] = '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects[4] = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';

  for (let i = 0; i < totalPages; i++) {
    const pId = pageObjectIds[i];
    const cId = contentObjectIds[i];
    const stream = pages[i].join('\n') + '\n';

    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
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
        'x-allow-overwrite': '1',
        'x-cache-control-max-age': '0',
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
