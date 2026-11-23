import React, { useMemo, useState } from 'react';
import {
  FileText,
  Upload,
  CheckCircle2,
  XCircle,
  FileDown,
  Plus,
  Calendar,
  DollarSign,
  Receipt,
  Check,
  X,
} from 'lucide-react';
import { Invoice, Order, Vet } from '../types';
import { api } from '../services/api';
import { PaginationBar } from './PaginationBar';

interface BillingSectionProps {
  orders: Order[];
  vets: Vet[];
  invoices: Invoice[];
  onRefresh: () => Promise<void>;
  onToast: (msg: string) => void;
}

const getFirstDayOfMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
};

const getLastDayOfMonth = (): string => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(
    last.getDate()
  ).padStart(2, '0')}`;
};

const getCurrentMonthRef = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const readFileAsBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo PDF.'));
    reader.readAsDataURL(file);
  });

export const BillingSection: React.FC<BillingSectionProps> = ({
  orders,
  vets,
  invoices,
  onRefresh,
  onToast,
}) => {
  const [selectedVetId, setSelectedVetId] = useState<string>('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<
    'nao_faturado' | 'aguardando_pagamento' | 'pago' | 'todos'
  >('nao_faturado');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [ordersPage, setOrdersPage] = useState(1);

  // Modal de gerar fatura
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [referenceMonth, setReferenceMonth] = useState(getCurrentMonthRef);
  const [dueDate, setDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [boletoFileName, setBoletoFileName] = useState('');
  const [boletoBase64, setBoletoBase64] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Listagem de faturas geradas
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState<
    'todos' | 'aguardando_pagamento' | 'pago' | 'cancelado'
  >('todos');
  const [invoicesPage, setInvoicesPage] = useState(1);
  const [uploadingBoletoForId, setUploadingBoletoForId] = useState<string | null>(null);

  const vetsWithUnbilledCounts = useMemo(() => {
    return vets.map((v) => {
      const vetOrders = orders.filter((o) => o.vet_id === v.id);
      const unbilled = vetOrders.filter(
        (o) => !o.payment_status || o.payment_status === 'nao_faturado'
      );
      const unbilledTotal = unbilled.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
      return {
        vet: v,
        unbilledCount: unbilled.length,
        unbilledTotal,
        totalOrders: vetOrders.length,
      };
    });
  }, [vets, orders]);

  const activeVetId = selectedVetId || vetsWithUnbilledCounts[0]?.vet.id || '';
  const activeVet = vets.find((v) => v.id === activeVetId) || null;

  const filteredVetOrders = useMemo(() => {
    if (!activeVetId) return [];
    return orders.filter((o) => {
      if (o.vet_id !== activeVetId) return false;
      const pStatus = o.payment_status || 'nao_faturado';
      if (paymentStatusFilter !== 'todos' && pStatus !== paymentStatusFilter) return false;
      const ordDate = (o.created_at || '').slice(0, 10);
      if (startDate && ordDate && ordDate < startDate) return false;
      if (endDate && ordDate && ordDate > endDate) return false;
      return true;
    });
  }, [orders, activeVetId, paymentStatusFilter, startDate, endDate]);

  const selectableOrders = useMemo(
    () =>
      filteredVetOrders.filter(
        (o) => !o.payment_status || o.payment_status === 'nao_faturado'
      ),
    [filteredVetOrders]
  );

  const selectedOrders = useMemo(
    () => selectableOrders.filter((o) => selectedOrderIds.includes(o.id)),
    [selectableOrders, selectedOrderIds]
  );

  const selectedTotalAmount = useMemo(
    () => selectedOrders.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0),
    [selectedOrders]
  );

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (invoiceStatusFilter !== 'todos' && inv.status !== invoiceStatusFilter) return false;
      return true;
    });
  }, [invoices, invoiceStatusFilter]);

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    const allIds = selectableOrders.map((o) => o.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedOrderIds.includes(id));
    if (allSelected) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(allIds);
    }
  };

  const handleOpenInvoiceModal = () => {
    if (selectedOrders.length === 0) {
      onToast('Selecione ao menos um atendimento não faturado para gerar a fatura.');
      return;
    }
    setReferenceMonth(getCurrentMonthRef());
    setDueDate('');
    setInvoiceNotes('');
    setBoletoFileName('');
    setBoletoBase64('');
    setInvoiceModalOpen(true);
  };

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVetId || selectedOrders.length === 0) return;
    setSubmitting(true);
    try {
      const created = await api.createInvoice({
        vet_id: activeVetId,
        order_ids: selectedOrders.map((o) => o.id),
        reference_month: referenceMonth,
        period_start: startDate || undefined,
        period_end: endDate || undefined,
        due_date: dueDate || undefined,
        boleto_filename: boletoFileName || undefined,
        boleto_pdf_base64: boletoBase64 || undefined,
        notes: invoiceNotes.trim() || undefined,
      });
      setInvoiceModalOpen(false);
      setSelectedOrderIds([]);
      await onRefresh();
      onToast(
        `Fatura ${created.invoice_number} gerada com ${selectedOrders.length} atendimento(s) (Total: R$ ${Number(
          created.total_amount
        ).toFixed(2)})!`
      );
    } catch (err: any) {
      onToast(err?.message || 'Erro ao gerar fatura.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachBoletoToExisting = async (
    invoiceId: string,
    file: File | undefined
  ) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      onToast('Selecione um arquivo no formato PDF.');
      return;
    }
    setUploadingBoletoForId(invoiceId);
    try {
      const base64 = await readFileAsBase64(file);
      await api.updateInvoiceBoleto(invoiceId, {
        boleto_filename: file.name,
        boleto_pdf_base64: base64,
      });
      await onRefresh();
      onToast(`Boleto "${file.name}" anexado à fatura e liberado no Portal do Veterinário!`);
    } catch (err: any) {
      onToast(err?.message || 'Erro ao anexar boleto PDF.');
    } finally {
      setUploadingBoletoForId(null);
    }
  };

  const handleMarkPaid = async (inv: Invoice) => {
    try {
      await api.markInvoiceAsPaid(inv.id);
      await onRefresh();
      onToast(`Baixa registrada! Fatura ${inv.invoice_number} e seus atendimentos marcados como PAGO.`);
    } catch (err: any) {
      onToast(err?.message || 'Erro ao dar baixa no pagamento.');
    }
  };

  const handleCancelInvoice = async (inv: Invoice) => {
    try {
      await api.cancelInvoice(inv.id);
      await onRefresh();
      onToast(`Fatura ${inv.invoice_number} cancelada. Os atendimentos voltaram para "Não Faturado".`);
    } catch (err: any) {
      onToast(err?.message || 'Erro ao cancelar fatura.');
    }
  };

  const renderPaymentBadge = (status?: string) => {
    if (status === 'pago') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-semibold whitespace-nowrap">
          Pago
        </span>
      );
    }
    if (status === 'aguardando_pagamento') {
      return (
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10.5px] font-semibold whitespace-nowrap">
          Aguardando Pagamento
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#5b6675] text-[10.5px] font-semibold whitespace-nowrap">
        Não Faturado
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* BLOCO 1: SELEÇÃO DE ATENDIMENTOS POR VETERINÁRIO PARA GERAR FATURA */}
      <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
              Faturamento por Veterinário Solicitante
            </h3>
            <p className="text-[12px] text-[#707070]">
              Selecione o veterinário, marque os atendimentos não faturados e gere o lote de fatura com boleto PDF opcional.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedOrders.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-[#e8f2fd] text-[#0071e3] text-[12px] font-bold font-mono">
                {selectedOrders.length} selecionado(s) • R$ {selectedTotalAmount.toFixed(2)}
              </span>
            )}
            <button
              type="button"
              disabled={selectedOrders.length === 0}
              onClick={handleOpenInvoiceModal}
              className="px-4 py-2 rounded-full bg-[#0071e3] hover:bg-[#0062c4] disabled:opacity-40 disabled:pointer-events-none text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Gerar Fatura ({selectedOrders.length})
            </button>
          </div>
        </div>

        {/* Filtros: Veterinário + Status de Pagamento + Período */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-end bg-[#f8fafc] p-3.5 rounded-2xl border border-slate-200/70">
          <div className="lg:col-span-4">
            <label className="block text-[10.5px] font-semibold text-[#5b6675] mb-1">
              Veterinário Solicitante *
            </label>
            <select
              value={activeVetId}
              onChange={(e) => {
                setSelectedVetId(e.target.value);
                setSelectedOrderIds([]);
                setOrdersPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-[12px] font-semibold text-[#1d1d1f]"
            >
              {vetsWithUnbilledCounts.length === 0 ? (
                <option value="">Nenhum veterinário cadastrado</option>
              ) : (
                vetsWithUnbilledCounts.map(({ vet, unbilledCount, unbilledTotal }) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.name} ({vet.crmv}) — {unbilledCount} não faturado(s) (R${' '}
                    {unbilledTotal.toFixed(2)})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="lg:col-span-3">
            <label className="block text-[10.5px] font-semibold text-[#5b6675] mb-1">
              Status de Pagamento
            </label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value as any);
                setSelectedOrderIds([]);
                setOrdersPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-[12px] text-[#1d1d1f]"
            >
              <option value="nao_faturado">Não Faturado</option>
              <option value="aguardando_pagamento">Aguardando Pagamento</option>
              <option value="pago">Pago</option>
              <option value="todos">Todos os Status</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10.5px] font-semibold text-[#5b6675] mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setOrdersPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[12px]"
            />
          </div>

          <div className="lg:col-span-2">
            <label className="block text-[10.5px] font-semibold text-[#5b6675] mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setOrdersPage(1);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-[12px]"
            />
          </div>

          <div className="lg:col-span-1 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setStartDate(getFirstDayOfMonth());
                setEndDate(getLastDayOfMonth());
                setOrdersPage(1);
              }}
              title="Filtrar Mês Atual"
              className="w-full px-2 py-2 rounded-xl bg-[#0b2240] text-white text-[11px] font-semibold cursor-pointer"
            >
              Mês
            </button>
          </div>
        </div>

        {/* Tabela de Atendimentos do Veterinário Selecionado */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10.5px]">
                <th className="py-2.5 px-2.5 w-10">
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={selectableOrders.length === 0}
                    className={`w-4 h-4 rounded flex items-center justify-center border transition cursor-pointer disabled:opacity-30 ${
                      selectableOrders.length > 0 &&
                      selectableOrders.every((o) => selectedOrderIds.includes(o.id))
                        ? 'bg-[#0071e3] border-[#0071e3] text-white'
                        : 'bg-white border-slate-300'
                    }`}
                    title="Selecionar todos não faturados"
                  >
                    {selectableOrders.length > 0 &&
                      selectableOrders.every((o) => selectedOrderIds.includes(o.id)) && (
                        <Check className="w-3 h-3" />
                      )}
                  </button>
                </th>
                <th className="py-2.5 px-2.5 font-semibold">Protocolo</th>
                <th className="py-2.5 px-2.5 font-semibold">Data</th>
                <th className="py-2.5 px-2.5 font-semibold">Paciente / Tutor</th>
                <th className="py-2.5 px-2.5 font-semibold">Exames</th>
                <th className="py-2.5 px-2.5 font-semibold">Pagamento</th>
                <th className="py-2.5 px-2.5 font-semibold text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f5]">
              {filteredVetOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#707070]">
                    Nenhum atendimento encontrado para este veterinário com o filtro atual.
                  </td>
                </tr>
              ) : (
                filteredVetOrders
                  .slice((ordersPage - 1) * 10, ordersPage * 10)
                  .map((ord) => {
                    const pStatus = ord.payment_status || 'nao_faturado';
                    const canSelect = pStatus === 'nao_faturado';
                    const checked = selectedOrderIds.includes(ord.id);
                    return (
                      <tr
                        key={ord.id}
                        onClick={() => canSelect && toggleSelectOrder(ord.id)}
                        className={`transition ${
                          canSelect ? 'cursor-pointer' : 'opacity-80'
                        } ${checked ? 'bg-[#f0f7ff]' : 'hover:bg-[#f5f5f7]/60'}`}
                      >
                        <td className="py-2.5 px-2.5">
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              !canSelect
                                ? 'bg-slate-100 border-slate-200 text-slate-300'
                                : checked
                                  ? 'bg-[#0071e3] border-[#0071e3] text-white'
                                  : 'bg-white border-slate-300'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 font-mono font-bold text-[#0b2240] whitespace-nowrap">
                          {ord.protocol_code}
                        </td>
                        <td className="py-2.5 px-2.5 whitespace-nowrap text-[#5b6675]">
                          {ord.created_at
                            ? new Date(ord.created_at).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <div className="font-semibold text-[#1d1d1f]">{ord.patient?.name}</div>
                          <div className="text-[11px] text-[#707070]">
                            {ord.patient?.tutor_name}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 max-w-xs">
                          <div className="text-[11.5px] text-[#5b6675] truncate">
                            {(ord.results || [])
                              .map((r) => `[${r.exam_code || r.exam?.code || 'EXM'}] ${r.exam_name || r.exam?.name || ''}`)
                              .join(', ')}
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5">{renderPaymentBadge(pStatus)}</td>
                        <td className="py-2.5 px-2.5 font-mono font-bold text-[#0b2240] text-right whitespace-nowrap">
                          R$ {Number(ord.total_amount || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={ordersPage}
          pageSize={10}
          totalItems={filteredVetOrders.length}
          onPageChange={setOrdersPage}
        />
      </div>

      {/* BLOCO 2: FATURAS / LOTES GERADOS (UPLOAD DE BOLETO + BAIXA MANUAL) */}
      <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f] flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#0071e3]" />
              Faturas Geradas & Controle de Baixa ({filteredInvoices.length})
            </h3>
            <p className="text-[12px] text-[#707070]">
              Anexe ou atualize o PDF do boleto (disponibilizado no Portal do Veterinário) e dê baixa manual ao confirmar o pagamento.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'todos', label: 'Todas' },
                { id: 'aguardando_pagamento', label: 'Aguardando Pagamento' },
                { id: 'pago', label: 'Pagas' },
                { id: 'cancelado', label: 'Canceladas' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setInvoiceStatusFilter(st.id);
                  setInvoicesPage(1);
                }}
                className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition cursor-pointer ${
                  invoiceStatusFilter === st.id
                    ? 'bg-[#0b2240] text-white'
                    : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e5e5ea]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[12px]">
            <thead>
              <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10.5px]">
                <th className="py-2.5 px-3 font-semibold">Fatura / Ref.</th>
                <th className="py-2.5 px-3 font-semibold">Veterinário / Clínica</th>
                <th className="py-2.5 px-3 font-semibold">Lote</th>
                <th className="py-2.5 px-3 font-semibold">Vencimento</th>
                <th className="py-2.5 px-3 font-semibold">Valor Total</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Boleto & Baixa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f0f0f5]">
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#707070]">
                    Nenhuma fatura gerada para este filtro.
                  </td>
                </tr>
              ) : (
                filteredInvoices
                  .slice((invoicesPage - 1) * 10, invoicesPage * 10)
                  .map((inv) => (
                    <tr key={inv.id} className="hover:bg-[#f5f5f7]/60">
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-mono font-bold text-[#0b2240]">{inv.invoice_number}</div>
                        <div className="text-[10.5px] text-[#86868b]">
                          Ref: {inv.reference_month || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#1d1d1f]">
                          {inv.vet?.name || 'Veterinário'}
                        </div>
                        <div className="text-[11px] text-[#707070]">
                          {inv.vet?.clinic_name || inv.vet?.crmv || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[11px] font-semibold">
                          {inv.orders_count ?? inv.orders?.length ?? 0} atendimento(s)
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[#5b6675]">
                        {inv.due_date
                          ? inv.due_date.split('-').reverse().join('/')
                          : 'Não definido'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-[#0b2240] whitespace-nowrap">
                        R$ {Number(inv.total_amount || 0).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {inv.status === 'pago' ? (
                          <div>
                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-semibold">
                              Pago
                            </span>
                            {inv.paid_at && (
                              <div className="text-[10px] text-[#86868b] mt-0.5">
                                {new Date(inv.paid_at).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                          </div>
                        ) : inv.status === 'cancelado' ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10.5px] font-semibold">
                            Cancelada
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10.5px] font-semibold">
                            Aguardando Pagamento
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5 flex-wrap">
                          {inv.boleto_pdf_url && (
                            <a
                              href={inv.boleto_pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1 rounded-full border border-[#1d1d1f]/25 text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white text-[11px] font-semibold inline-flex items-center gap-1 transition"
                            >
                              <FileDown className="w-3 h-3" />
                              Boleto PDF
                            </a>
                          )}

                          {inv.status !== 'cancelado' && (
                            <label className="px-2.5 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer">
                              <Upload className="w-3 h-3 text-[#0071e3]" />
                              <span>
                                {uploadingBoletoForId === inv.id
                                  ? 'Enviando...'
                                  : inv.boleto_pdf_url
                                    ? 'Trocar PDF'
                                    : 'Subir Boleto'}
                              </span>
                              <input
                                type="file"
                                accept="application/pdf,.pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  handleAttachBoletoToExisting(inv.id, f);
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          )}

                          {inv.status === 'aguardando_pagamento' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleMarkPaid(inv)}
                                className="px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Dar Baixa (Pago)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelInvoice(inv)}
                                title="Cancelar fatura e devolver atendimentos para Não Faturado"
                                className="p-1.5 rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationBar
          page={invoicesPage}
          pageSize={10}
          totalItems={filteredInvoices.length}
          onPageChange={setInvoicesPage}
        />
      </div>

      {/* MODAL: GERAR FATURA EM LOTE */}
      {invoiceModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2240]/45 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => setInvoiceModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateInvoice}
            className="bg-white rounded-[24px] max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-black/10"
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
              <div>
                <h3 className="font-display text-[18px] font-semibold text-[#1d1d1f]">
                  Gerar Fatura Consolidada
                </h3>
                <p className="text-[12px] text-[#707070]">
                  {activeVet?.name} ({activeVet?.crmv}) • {selectedOrders.length} atendimento(s) selecionado(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceModalOpen(false)}
                className="p-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#0b2240] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-[#7fdbea]" />
                <div>
                  <div className="text-[11px] text-white/75">Valor Total da Fatura</div>
                  <div className="text-[11px] text-white/60">
                    {selectedOrders.length} atendimento(s) mudarão para "Aguardando Pagamento"
                  </div>
                </div>
              </div>
              <div className="font-mono text-[20px] font-bold">
                R$ {selectedTotalAmount.toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  Mês de Referência *
                </label>
                <input
                  type="month"
                  required
                  value={referenceMonth}
                  onChange={(e) => setReferenceMonth(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  Data de Vencimento (Opcional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
                />
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#f5f5f7] space-y-2 border border-dashed border-slate-300">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11.5px] font-semibold text-[#1d1d1f] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#0071e3]" />
                  <span>Arquivo PDF do Boleto (Opcional)</span>
                </div>
                <label className="px-3 py-1 rounded-full bg-white hover:bg-slate-100 text-[#0071e3] text-[11px] font-semibold border border-slate-200 cursor-pointer inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>Selecionar PDF</span>
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const b64 = await readFileAsBase64(f);
                      setBoletoFileName(f.name);
                      setBoletoBase64(b64);
                    }}
                  />
                </label>
              </div>
              {boletoFileName ? (
                <div className="flex items-center justify-between bg-white px-3 py-1.5 rounded-xl text-[11.5px] text-emerald-800 font-medium">
                  <span className="truncate">{boletoFileName}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBoletoFileName('');
                      setBoletoBase64('');
                    }}
                    className="text-red-500 text-[11px] font-semibold ml-2 cursor-pointer"
                  >
                    Remover
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-[#707070]">
                  Você pode subir o PDF do boleto agora ou anexar depois na lista de faturas geradas.
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                Observações da Fatura (Opcional)
              </label>
              <textarea
                rows={2}
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                placeholder="Ex: Fechamento mensal - pagamento via boleto ou PIX..."
                className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] text-[12px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceModalOpen(false)}
                className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[12px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer disabled:opacity-60"
              >
                {submitting ? 'Gerando...' : 'Confirmar e Gerar Fatura'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
