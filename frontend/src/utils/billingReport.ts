import { Invoice, Order, Patient, Vet } from '../types';

export type BillingReportStatusFilter =
  | 'todos'
  | 'nao_faturado'
  | 'aguardando_pagamento'
  | 'pago'
  | 'cancelado';

export interface BillingReportFilters {
  status: BillingReportStatusFilter;
  startDate: string; // '' or 'YYYY-MM-DD'
  endDate: string;   // '' or 'YYYY-MM-DD'
  vetId: string;     // '' or 'todos' or specific vet.id
  patientId: string; // '' or 'todos' or specific patient.id
}

export interface BillingReportSummary {
  totalInvoices: number;
  totalOrders: number;
  totalAmount: number;
  paidAmount: number;
  awaitingAmount: number;
  unbilledAmount: number;
  cancelledAmount: number;
}

export interface FilteredBillingReportData {
  invoices: Invoice[];
  orders: Order[];
  summary: BillingReportSummary;
  filters: BillingReportFilters;
  vetName?: string;
  patientName?: string;
  scope: 'admin' | 'vet';
}

const STATUS_LABELS_PT: Record<BillingReportStatusFilter, string> = {
  todos: 'Todos os Status',
  nao_faturado: 'Não Faturado',
  aguardando_pagamento: 'Aguardando Pagamento',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

const STATUS_SHORT_ASCII: Record<string, string> = {
  nao_faturado: 'Nao Faturado',
  aguardando_pagamento: 'Aguard. Pgto',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

function formatCurrencyBRL(value: number): string {
  const num = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(num);
}

function extractDateYMD(iso?: string | null): string {
  if (!iso) return '';
  const trimmed = String(iso).trim();
  if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBR(iso?: string | null): string {
  const ymd = extractDateYMD(iso);
  if (!ymd) return '-';
  const [yyyy, mm, dd] = ymd.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function formatTodayYMD(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatPeriodLabel(startDate: string, endDate: string): string {
  if (startDate && endDate) {
    return `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;
  }
  if (startDate) {
    return `A partir de ${formatDateBR(startDate)}`;
  }
  if (endDate) {
    return `Até ${formatDateBR(endDate)}`;
  }
  return 'Todo o período';
}

function matchesDateRange(
  iso: string | undefined | null,
  startDate: string,
  endDate: string
): boolean {
  if (!startDate && !endDate) return true;
  const ymd = extractDateYMD(iso);
  if (!ymd) return false;
  if (startDate && ymd < startDate) return false;
  if (endDate && ymd > endDate) return false;
  return true;
}

function getStatusLabel(status: string): string {
  return STATUS_LABELS_PT[status as BillingReportStatusFilter] || status || '-';
}

function sanitizePdfText(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function toPlainAscii(input: string): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function truncateText(input: string, maxLen: number): string {
  const clean = toPlainAscii(input).replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  if (maxLen <= 3) return clean.slice(0, maxLen);
  return `${clean.slice(0, maxLen - 3)}...`;
}

function wrapPdfText(input: string, maxChars: number): string[] {
  const clean = toPlainAscii(input).replace(/\s+/g, ' ').trim();
  if (!clean) return [''];
  if (clean.length <= maxChars) return [clean];

  const words = clean.split(' ');
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

export function filterBillingReportData(params: {
  invoices: Invoice[];
  orders: Order[];
  filters: BillingReportFilters;
  vets?: Vet[];
  patients?: Patient[];
  scope: 'admin' | 'vet';
  fixedVet?: Vet | null;
}): FilteredBillingReportData {
  const allInvoices = Array.isArray(params.invoices) ? params.invoices : [];
  const allOrders = Array.isArray(params.orders) ? params.orders : [];
  const { filters, vets = [], patients = [], scope, fixedVet } = params;

  const effectiveVetId =
    scope === 'vet' && fixedVet?.id
      ? fixedVet.id
      : filters.vetId && filters.vetId !== 'todos'
      ? filters.vetId
      : '';

  const effectivePatientId =
    filters.patientId && filters.patientId !== 'todos' ? filters.patientId : '';

  const startDate = (filters.startDate || '').trim();
  const endDate = (filters.endDate || '').trim();
  const statusFilter: BillingReportStatusFilter = filters.status || 'todos';

  // Map invoice_id -> has matching patient order in allOrders
  const invoiceIdsWithPatient = new Set<string>();
  if (effectivePatientId) {
    for (const ord of allOrders) {
      if (ord.patient_id === effectivePatientId && ord.invoice_id) {
        invoiceIdsWithPatient.add(ord.invoice_id);
      }
    }
  }

  // Base order filter (vet, date range, patient)
  const baseOrders = allOrders.filter((ord) => {
    if (effectiveVetId && ord.vet_id !== effectiveVetId) return false;
    if (!matchesDateRange(ord.created_at, startDate, endDate)) return false;
    if (effectivePatientId && ord.patient_id !== effectivePatientId) return false;
    return true;
  });

  // Base invoice filter (vet, date range, patient)
  const baseInvoices = allInvoices.filter((inv) => {
    if (effectiveVetId && inv.vet_id !== effectiveVetId) return false;
    if (!matchesDateRange(inv.created_at, startDate, endDate)) return false;
    if (effectivePatientId) {
      const hasEmbeddedMatch = Boolean(
        inv.orders?.some((o) => o.patient_id === effectivePatientId)
      );
      const hasLinkedMatch = invoiceIdsWithPatient.has(inv.id);
      if (!hasEmbeddedMatch && !hasLinkedMatch) return false;
    }
    return true;
  });

  let filteredInvoices: Invoice[] = [];
  let filteredOrders: Order[] = [];

  if (statusFilter === 'todos') {
    filteredInvoices =
      scope === 'vet'
        ? baseInvoices.filter((inv) => inv.status !== 'cancelado')
        : baseInvoices;
    filteredOrders = baseOrders;
  } else if (statusFilter === 'nao_faturado') {
    filteredInvoices = [];
    filteredOrders = baseOrders.filter(
      (ord) => (ord.payment_status || 'nao_faturado') === 'nao_faturado'
    );
  } else if (statusFilter === 'cancelado') {
    filteredInvoices = baseInvoices.filter((inv) => inv.status === 'cancelado');
    const cancelledInvoiceIds = new Set(filteredInvoices.map((inv) => inv.id));
    const cancelledOrderIds = new Set<string>();
    for (const inv of filteredInvoices) {
      (inv.order_ids || []).forEach((id) => cancelledOrderIds.add(id));
      (inv.orders || []).forEach((o) => cancelledOrderIds.add(o.id));
    }
    filteredOrders = baseOrders.filter(
      (ord) =>
        (ord.invoice_id && cancelledInvoiceIds.has(ord.invoice_id)) ||
        cancelledOrderIds.has(ord.id)
    );
  } else {
    // 'aguardando_pagamento' | 'pago'
    filteredInvoices = baseInvoices.filter((inv) => inv.status === statusFilter);
    filteredOrders = baseOrders.filter(
      (ord) => (ord.payment_status || 'nao_faturado') === statusFilter
    );
  }

  // Sort newest first
  const sortDescByCreated = <T extends { created_at?: string }>(arr: T[]): T[] =>
    [...arr].sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );

  filteredInvoices = sortDescByCreated(filteredInvoices);
  filteredOrders = sortDescByCreated(filteredOrders);

  // Compute summary without double counting
  let paidAmount = 0;
  let awaitingAmount = 0;
  let unbilledAmount = 0;
  let cancelledAmount = filteredInvoices
    .filter((inv) => inv.status === 'cancelado')
    .reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);

  if (filteredOrders.length > 0 && statusFilter !== 'cancelado') {
    for (const ord of filteredOrders) {
      const amount = Number(ord.total_amount || 0);
      const paymentStatus = ord.payment_status || 'nao_faturado';
      if (paymentStatus === 'pago') {
        paidAmount += amount;
      } else if (paymentStatus === 'aguardando_pagamento') {
        awaitingAmount += amount;
      } else {
        unbilledAmount += amount;
      }
    }
  } else if (filteredInvoices.length > 0 && statusFilter !== 'cancelado') {
    for (const inv of filteredInvoices) {
      const amount = Number(inv.total_amount || 0);
      if (inv.status === 'pago') {
        paidAmount += amount;
      } else if (inv.status === 'aguardando_pagamento') {
        awaitingAmount += amount;
      }
    }
  }

  const totalAmount =
    statusFilter === 'cancelado'
      ? cancelledAmount
      : paidAmount + awaitingAmount + unbilledAmount;

  const summary: BillingReportSummary = {
    totalInvoices: filteredInvoices.length,
    totalOrders: filteredOrders.length,
    totalAmount,
    paidAmount,
    awaitingAmount,
    unbilledAmount,
    cancelledAmount,
  };

  // Resolve vetName
  let vetName: string | undefined;
  if (scope === 'vet' && fixedVet) {
    vetName = `${fixedVet.name}${fixedVet.crmv ? ` (${fixedVet.crmv})` : ''}`;
  } else if (effectiveVetId) {
    const foundVet =
      vets.find((v) => v.id === effectiveVetId) ||
      filteredInvoices.find((i) => i.vet_id === effectiveVetId)?.vet ||
      filteredOrders.find((o) => o.vet_id === effectiveVetId)?.vet ||
      allInvoices.find((i) => i.vet_id === effectiveVetId)?.vet ||
      allOrders.find((o) => o.vet_id === effectiveVetId)?.vet;
    if (foundVet) {
      vetName = `${foundVet.name}${foundVet.crmv ? ` (${foundVet.crmv})` : ''}`;
    }
  }

  // Resolve patientName
  let patientName: string | undefined;
  if (effectivePatientId) {
    const foundPatient =
      patients.find((p) => p.id === effectivePatientId) ||
      filteredOrders.find((o) => o.patient_id === effectivePatientId)?.patient ||
      allOrders.find((o) => o.patient_id === effectivePatientId)?.patient ||
      allInvoices
        .flatMap((i) => i.orders || [])
        .find((o) => o.patient_id === effectivePatientId)?.patient;
    if (foundPatient) {
      patientName = `${foundPatient.name}${
        foundPatient.tutor_name ? ` (Tutor: ${foundPatient.tutor_name})` : ''
      }`;
    }
  }

  return {
    invoices: filteredInvoices,
    orders: filteredOrders,
    summary,
    filters: {
      status: statusFilter,
      startDate,
      endDate,
      vetId: effectiveVetId || filters.vetId || '',
      patientId: effectivePatientId || filters.patientId || '',
    },
    vetName,
    patientName,
    scope,
  };
}

interface PdfLine {
  text: string;
  size: number;
  bold?: boolean;
}

export function downloadBillingReportPdf(data: FilteredBillingReportData): void {
  const { invoices, orders, summary, filters, vetName, patientName, scope } = data;
  const generatedAt = new Date().toLocaleString('pt-BR');
  const periodLabel = formatPeriodLabel(filters.startDate, filters.endDate);
  const statusLabel = getStatusLabel(filters.status);
  const vetDisplay = vetName || 'Todos os Veterinarios';
  const patientDisplay = patientName || 'Todos os Pacientes';

  const SEP_HEAVY =
    '============================================================================================';
  const SEP_LIGHT =
    '--------------------------------------------------------------------------------------------';

  const lines: PdfLine[] = [
    { text: 'VETLIFE DIAGNOSTICOS VETERINARIOS - vetlifelab.com.br', size: 13, bold: true },
    {
      text:
        scope === 'vet'
          ? 'RELATORIO DE FATURAMENTO - PORTAL DO VETERINARIO'
          : 'RELATORIO DE FATURAMENTO - PAINEL ADMINISTRATIVO',
      size: 10,
      bold: true,
    },
    { text: `Emitido em: ${generatedAt}`, size: 8.5 },
    { text: SEP_HEAVY, size: 8.5 },
    { text: 'FILTROS APLICADOS', size: 9.5, bold: true },
    { text: `Periodo:     ${periodLabel}`, size: 8.5 },
    { text: `Status:      ${statusLabel}`, size: 8.5 },
    ...wrapPdfText(`Veterinario: ${vetDisplay}`, 92).map((t) => ({ text: t, size: 8.5 })),
    ...wrapPdfText(`Paciente:    ${patientDisplay}`, 92).map((t) => ({ text: t, size: 8.5 })),
    { text: SEP_LIGHT, size: 8.5 },
    { text: 'RESUMO FINANCEIRO', size: 9.5, bold: true },
    {
      text: `Total Consolidado: ${formatCurrencyBRL(summary.totalAmount).padEnd(18, ' ')} | Faturas: ${String(
        summary.totalInvoices
      ).padEnd(5, ' ')} | Pedidos: ${summary.totalOrders}`,
      size: 9,
      bold: true,
    },
    {
      text: `Pago:              ${formatCurrencyBRL(summary.paidAmount).padEnd(
        18,
        ' '
      )} | Aguardando Pgto: ${formatCurrencyBRL(summary.awaitingAmount)}`,
      size: 8.5,
    },
    {
      text: `Nao Faturado:      ${formatCurrencyBRL(summary.unbilledAmount).padEnd(
        18,
        ' '
      )}${
        scope === 'admin' || summary.cancelledAmount > 0
          ? ` | Cancelado:       ${formatCurrencyBRL(summary.cancelledAmount)}`
          : ''
      }`,
      size: 8.5,
    },
    { text: SEP_HEAVY, size: 8.5 },
  ];

  // Faturas table
  if (invoices.length > 0) {
    lines.push({ text: `FATURAS CONSOLIDADAS (${invoices.length})`, size: 9.5, bold: true });
    if (scope === 'admin') {
      lines.push({
        text: 'NUMERO       | EMISSAO    | VENCIMENTO | VETERINARIO         | STATUS       | VALOR',
        size: 8,
        bold: true,
      });
      lines.push({ text: SEP_LIGHT, size: 8 });
      for (const inv of invoices) {
        const num = truncateText(inv.invoice_number || inv.id.slice(0, 10), 12).padEnd(12, ' ');
        const dt = formatDateBR(inv.created_at).padEnd(10, ' ');
        const due = formatDateBR(inv.due_date).padEnd(10, ' ');
        const vName = truncateText(inv.vet?.name || '-', 19).padEnd(19, ' ');
        const st = (STATUS_SHORT_ASCII[inv.status] || inv.status).padEnd(12, ' ');
        const val = toPlainAscii(formatCurrencyBRL(Number(inv.total_amount || 0))).padStart(13, ' ');
        lines.push({
          text: `${num} | ${dt} | ${due} | ${vName} | ${st} | ${val}`,
          size: 8,
        });
      }
    } else {
      lines.push({
        text: 'NUMERO         | EMISSAO    | VENCIMENTO | PEDIDOS | STATUS       | VALOR',
        size: 8,
        bold: true,
      });
      lines.push({ text: SEP_LIGHT, size: 8 });
      for (const inv of invoices) {
        const num = truncateText(inv.invoice_number || inv.id.slice(0, 12), 14).padEnd(14, ' ');
        const dt = formatDateBR(inv.created_at).padEnd(10, ' ');
        const due = formatDateBR(inv.due_date).padEnd(10, ' ');
        const cnt = String(inv.orders_count ?? inv.orders?.length ?? inv.order_ids?.length ?? 0).padEnd(7, ' ');
        const st = (STATUS_SHORT_ASCII[inv.status] || inv.status).padEnd(12, ' ');
        const val = toPlainAscii(formatCurrencyBRL(Number(inv.total_amount || 0))).padStart(13, ' ');
        lines.push({
          text: `${num} | ${dt} | ${due} | ${cnt} | ${st} | ${val}`,
          size: 8,
        });
      }
    }
    lines.push({ text: ' ', size: 6 });
  }

  // Pedidos / Pacientes detalhados table
  if (orders.length > 0) {
    lines.push({
      text: `PEDIDOS E PACIENTES DETALHADOS (${orders.length})`,
      size: 9.5,
      bold: true,
    });
    lines.push({
      text: 'DATA       | PROTOCOLO    | PACIENTE / TUTOR             | STATUS       | VALOR',
      size: 8,
      bold: true,
    });
    lines.push({ text: SEP_LIGHT, size: 8 });

    for (const ord of orders) {
      const dt = formatDateBR(ord.created_at).padEnd(10, ' ');
      const proto = truncateText(ord.protocol_code || ord.id.slice(0, 12), 12).padEnd(12, ' ');
      const patientText = ord.patient
        ? `${ord.patient.name}${ord.patient.tutor_name ? ` (${ord.patient.tutor_name})` : ''}`
        : 'Paciente';
      const patCol = truncateText(patientText, 28).padEnd(28, ' ');
      const pStatus = ord.payment_status || 'nao_faturado';
      const st = (STATUS_SHORT_ASCII[pStatus] || pStatus).padEnd(12, ' ');
      const val = toPlainAscii(formatCurrencyBRL(Number(ord.total_amount || 0))).padStart(13, ' ');

      lines.push({
        text: `${dt} | ${proto} | ${patCol} | ${st} | ${val}`,
        size: 8,
      });

      if (scope === 'admin' && !vetName && ord.vet?.name) {
        lines.push({
          text: `   Vet: ${truncateText(ord.vet.name, 78)}`,
          size: 7.5,
        });
      }

      if (ord.results && ord.results.length > 0) {
        const examNames = ord.results
          .map((r) => r.exam_name || r.exam?.name || r.exam_code || r.exam?.code || 'Exame')
          .join(', ');
        const wrappedExams = wrapPdfText(`Exames: ${examNames}`, 86);
        for (const el of wrappedExams) {
          lines.push({ text: `   ${el}`, size: 7.5 });
        }
      }
    }
  }

  if (invoices.length === 0 && orders.length === 0) {
    lines.push({
      text: 'Nenhum registro encontrado para os filtros selecionados.',
      size: 9.5,
      bold: true,
    });
  }

  lines.push({ text: ' ', size: 6 });
  lines.push({ text: SEP_LIGHT, size: 8.5 });
  lines.push({
    text: 'Documento gerado eletronicamente pelo sistema VetLife Diagnosticos Veterinarios.',
    size: 8,
  });

  // Paginate automatically across A4 pages (595 x 842 pt)
  const pageChunks: PdfLine[][] = [];
  let currentChunk: PdfLine[] = [];
  let yCursor = 800;

  for (const item of lines) {
    const step = item.size + 4.2;
    if (yCursor - step < 52 && currentChunk.length > 0) {
      pageChunks.push(currentChunk);
      currentChunk = [];
      yCursor = 800;
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

    let y = 800;
    const streamCommands: string[] = ['BT'];
    for (const line of chunk) {
      const font = line.bold ? '/F2' : '/F1';
      const safe = sanitizePdfText(line.text);
      streamCommands.push(`${font} ${line.size} Tf`);
      streamCommands.push(`1 0 0 1 36 ${y.toFixed(1)} Tm`);
      streamCommands.push(`(${safe}) Tj`);
      y -= line.size + 4.2;
    }

    // Page footer with page numbering
    const footerLeft = sanitizePdfText('VetLife Lab - Relatorio de Faturamento');
    const footerRight = sanitizePdfText(`Pagina ${i + 1} de ${totalPages}`);
    streamCommands.push('/F1 8 Tf');
    streamCommands.push('1 0 0 1 36 28.0 Tm');
    streamCommands.push(`(${footerLeft}) Tj`);
    streamCommands.push('1 0 0 1 468 28.0 Tm');
    streamCommands.push(`(${footerRight}) Tj`);
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
  link.download = `relatorio-faturamento-${formatTodayYMD()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function buildBillingReportWhatsAppMessage(
  data: FilteredBillingReportData,
  pdfUrl?: string | null
): string {
  const { invoices, orders, summary, filters, vetName, patientName, scope } = data;
  const title =
    scope === 'vet'
      ? '*VetLife Lab — Relatório de Faturamento (Veterinário)*'
      : '*VetLife Lab — Relatório de Faturamento (Administrativo)*';

  const periodLabel = formatPeriodLabel(filters.startDate, filters.endDate);
  const statusLabel = getStatusLabel(filters.status);
  const vetDisplay = vetName || 'Todos';
  const patientDisplay = patientName || 'Todos';

  const parts: string[] = [
    title,
    '',
    '*Filtros Aplicados:*',
    `• Período: ${periodLabel}`,
    `• Status: ${statusLabel}`,
    `• Veterinário: ${vetDisplay}`,
    `• Paciente: ${patientDisplay}`,
    '',
    '*Resumo Financeiro:*',
    `• Total Consolidado: *${formatCurrencyBRL(summary.totalAmount)}*`,
    `• Faturas: ${summary.totalInvoices} | Pedidos: ${summary.totalOrders}`,
    `• Pago: ${formatCurrencyBRL(summary.paidAmount)}`,
    `• Aguardando Pagamento: ${formatCurrencyBRL(summary.awaitingAmount)}`,
    `• Não Faturado: ${formatCurrencyBRL(summary.unbilledAmount)}`,
  ];

  if (summary.cancelledAmount > 0 || filters.status === 'cancelado') {
    parts.push(`• Cancelado: ${formatCurrencyBRL(summary.cancelledAmount)}`);
  }

  const MAX_INVOICES = 5;
  if (invoices.length > 0) {
    parts.push('', `*Faturas (${invoices.length}):*`);
    for (const inv of invoices.slice(0, MAX_INVOICES)) {
      parts.push(
        `• ${inv.invoice_number} | ${formatDateBR(inv.created_at)} | ${getStatusLabel(
          inv.status
        )} | ${formatCurrencyBRL(Number(inv.total_amount || 0))}`
      );
    }
    if (invoices.length > MAX_INVOICES) {
      parts.push(`_... e mais ${invoices.length - MAX_INVOICES} fatura(s)._`);
    }
  }

  const MAX_ORDERS = 8;
  if (orders.length > 0) {
    parts.push('', `*Pedidos (${orders.length}):*`);
    for (const ord of orders.slice(0, MAX_ORDERS)) {
      const pat = ord.patient?.name || 'Paciente';
      const st = getStatusLabel(ord.payment_status || 'nao_faturado');
      parts.push(
        `• ${ord.protocol_code} | ${pat} | ${st} | ${formatCurrencyBRL(
          Number(ord.total_amount || 0)
        )}`
      );
    }
    if (orders.length > MAX_ORDERS) {
      parts.push(`_... e mais ${orders.length - MAX_ORDERS} pedido(s)._`);
    }
  }

  if (pdfUrl && pdfUrl.trim()) {
    parts.push('', `*PDF do Relatório:* ${pdfUrl.trim()}`);
  }

  parts.push('', '_Gerado por VetLife Diagnósticos Veterinários_');

  return parts.join('\n');
}

export function openBillingReportWhatsApp(params: {
  data: FilteredBillingReportData;
  phone?: string | null;
  pdfUrl?: string | null;
}): { ok: boolean; url: string } {
  const message = buildBillingReportWhatsAppMessage(params.data, params.pdfUrl);
  const rawDigits = String(params.phone || '').replace(/\D/g, '');

  let waNumber = rawDigits;
  if (
    (rawDigits.length === 10 || rawDigits.length === 11) &&
    !rawDigits.startsWith('55')
  ) {
    waNumber = `55${rawDigits}`;
  }

  const encodedText = encodeURIComponent(message);
  const url =
    waNumber.length >= 10
      ? `https://wa.me/${waNumber}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

  if (typeof window === 'undefined') {
    return { ok: true, url };
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, url };
  } catch {
    return { ok: false, url };
  }
}
