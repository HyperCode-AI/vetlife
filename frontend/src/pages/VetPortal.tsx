import React, { useEffect, useMemo, useState } from 'react';
import {
  Stethoscope,
  LogOut,
  FileDown,
  Search,
  Printer,
  Calendar,
  BookOpen,
  DollarSign,
  Plus,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  X,
  FlaskConical,
  RefreshCw,
} from 'lucide-react';
import { CollectionRequest, Exam, Invoice, Order, Vet } from '../types';
import { api, formatAgeLabel, resolveSideBySideReference } from '../services/api';
import { downloadOrderPdf, printFormattedReportWindow } from '../utils/pdfGenerator';
import { PaginationBar } from '../components/PaginationBar';

export type VetPortalTab = 'orders' | 'collections' | 'catalog' | 'financial';

interface VetPortalProps {
  activeTab?: VetPortalTab;
  onTabChange?: (tab: VetPortalTab) => void;
  onLogout?: () => void;
}

const getFirstDayOfCurrentMonth = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
};

const getLastDayOfCurrentMonth = (): string => {
  const now = new Date();
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, '0');
  const d = String(last.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getTodayIso = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const VetPortal: React.FC<VetPortalProps> = ({
  activeTab: externalTab,
  onTabChange,
  onLogout,
}) => {
  const [vet, setVet] = useState<Vet | null>(() =>
    api.hasValidSession('vet') ? api.getCurrentVet() : null
  );
  const isLabStaff = api.hasValidSession('internal');

  const [tabState, setTabState] = useState<VetPortalTab>(externalTab || 'orders');
  const activeTab = externalTab || tabState;
  const setActiveTab = (next: VetPortalTab) => {
    setTabState(next);
    onTabChange?.(next);
  };

  const [orders, setOrders] = useState<Order[]>([]);
  const [collections, setCollections] = useState<CollectionRequest[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [catalogExams, setCatalogExams] = useState<Exam[]>([]);
  const [catalogTableName, setCatalogTableName] = useState<string>('Tabela Vigente');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Aba 1: Exames / Atendimentos
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [ordersPage, setOrdersPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Aba 2: Coletas e Agendamentos + Modal Solicitar Coleta
  const [collectionStatusFilter, setCollectionStatusFilter] = useState<string>('todos');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionsPage, setCollectionsPage] = useState(1);
  const [requestCollectionOpen, setRequestCollectionOpen] = useState(false);
  const [isSubmittingCollection, setIsSubmittingCollection] = useState(false);
  const [collectionForm, setCollectionForm] = useState({
    clinic_or_tutor_name: '',
    crmv: '',
    phone: '',
    email: '',
    address: '',
    preferred_date: getTodayIso(),
    notes: '',
  });

  // Aba 3: Catálogo de Exames & Valores
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogSection, setCatalogSection] = useState('todos');
  const [catalogPage, setCatalogPage] = useState(1);

  // Aba 4: Consolidado Financeiro por Período
  const [finStartDate, setFinStartDate] = useState(getFirstDayOfCurrentMonth);
  const [finEndDate, setFinEndDate] = useState(getLastDayOfCurrentMonth);
  const [finStatusFilter, setFinStatusFilter] = useState<'todos' | 'concluido' | 'em_andamento'>('todos');
  const [finPage, setFinPage] = useState(1);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const loadAllVetData = async () => {
    setLoading(true);
    try {
      const [ordersList, collectionsList, catalogRes, invoicesList] = await Promise.all([
        api.getVetOrders(vet?.id).catch(() => []),
        api.getVetCollections().catch(() => []),
        api.getVetCatalog().catch(() => ({
          price_table_name: 'Tabela Vigente',
          start_date: null,
          end_date: null,
          exams: [],
        })),
        api.getVetInvoices().catch(() => []),
      ]);
      setOrders(ordersList);
      setCollections(collectionsList);
      setCatalogExams(catalogRes.exams);
      setCatalogTableName(catalogRes.price_table_name || 'Tabela Vigente');
      setInvoices(invoicesList);
      if (ordersList.length > 0 && !selectedOrder) {
        setSelectedOrder(ordersList[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (api.hasValidSession('vet')) {
      loadAllVetData();
    }
  }, [vet?.id]);

  useEffect(() => {
    setOrdersPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    setCollectionsPage(1);
  }, [collectionSearch, collectionStatusFilter]);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogSearch, catalogSection]);

  useEffect(() => {
    setFinPage(1);
  }, [finStartDate, finEndDate, finStatusFilter]);

  const handleOpenRequestCollection = () => {
    setCollectionForm({
      clinic_or_tutor_name: vet?.clinic_name || vet?.name || '',
      crmv: vet?.crmv || '',
      phone: vet?.phone || '',
      email: vet?.email || '',
      address: '',
      preferred_date: getTodayIso(),
      notes: '',
    });
    setRequestCollectionOpen(true);
  };

  const handleSubmitCollectionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionForm.address.trim()) {
      showToast('Informe o endereço completo para retirada das amostras.');
      return;
    }
    setIsSubmittingCollection(true);
    try {
      const created = await api.createCollectionRequest({
        clinic_or_tutor_name: collectionForm.clinic_or_tutor_name.trim() || vet?.name || 'Médico Veterinário',
        crmv: (collectionForm.crmv || vet?.crmv || '').trim().toUpperCase(),
        phone: collectionForm.phone.trim() || vet?.phone || '',
        email: collectionForm.email.trim() || vet?.email || '',
        address: collectionForm.address.trim(),
        preferred_date: collectionForm.preferred_date || getTodayIso(),
        notes: collectionForm.notes.trim(),
      });
      setCollections((prev) => [created, ...prev]);
      setRequestCollectionOpen(false);
      setActiveTab('collections');
      showToast('Solicitação de coleta enviada! Você pode acompanhar o agendamento aqui.');
    } catch (err: any) {
      showToast(err?.message || 'Não foi possível enviar a solicitação de coleta.');
    } finally {
      setIsSubmittingCollection(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setVet(null);
    setSelectedOrder(null);
    onLogout?.();
  };

  // Hooks de filtro (devem ficar acima do return condicional)
  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((o) => {
      const matchesStatus = statusFilter === 'todos' || o.status === statusFilter;
      const matchesSearch =
        !term ||
        o.protocol_code.toLowerCase().includes(term) ||
        (o.patient?.name || '').toLowerCase().includes(term) ||
        (o.patient?.tutor_name || '').toLowerCase().includes(term) ||
        (o.results || []).some((r) =>
          `${r.exam_code || ''} ${r.exam_name || ''}`.toLowerCase().includes(term)
        );
      return matchesStatus && matchesSearch;
    });
  }, [orders, searchTerm, statusFilter]);

  const filteredCollections = useMemo(() => {
    const q = collectionSearch.trim().toLowerCase();
    return collections.filter((c) => {
      const st = c.status || 'pendente';
      if (collectionStatusFilter !== 'todos' && st !== collectionStatusFilter) return false;
      if (!q) return true;
      return `${c.clinic_or_tutor_name} ${c.crmv || ''} ${c.address} ${c.notes || ''} ${c.scheduled_date || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [collections, collectionSearch, collectionStatusFilter]);

  const catalogSections = useMemo(() => {
    return Array.from(new Set(catalogExams.map((e) => e.section).filter(Boolean))).sort();
  }, [catalogExams]);

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    return catalogExams.filter((ex) => {
      if (catalogSection !== 'todos' && ex.section !== catalogSection) return false;
      if (!q) return true;
      return `${ex.code} ${ex.name} ${ex.section} ${ex.tube_type || ''} ${ex.material || ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [catalogExams, catalogSearch, catalogSection]);

  const financialOrders = useMemo(() => {
    return orders.filter((ord) => {
      const ordDate = (ord.created_at || '').slice(0, 10);
      if (finStartDate && ordDate && ordDate < finStartDate) return false;
      if (finEndDate && ordDate && ordDate > finEndDate) return false;
      if (finStatusFilter === 'concluido' && ord.status !== 'concluido') return false;
      if (finStatusFilter === 'em_andamento' && ord.status === 'concluido') return false;
      return true;
    });
  }, [orders, finStartDate, finEndDate, finStatusFilter]);

  const financialSummary = useMemo(() => {
    const totalAmount = financialOrders.reduce(
      (sum, o) => sum + (Number(o.total_amount) || 0),
      0
    );
    const totalExams = financialOrders.reduce(
      (sum, o) => sum + (o.results?.length || 0),
      0
    );
    const completedOrders = financialOrders.filter((o) => o.status === 'concluido');
    const completedAmount = completedOrders.reduce(
      (sum, o) => sum + (Number(o.total_amount) || 0),
      0
    );
    const inProgressAmount = totalAmount - completedAmount;
    const avgTicket = financialOrders.length > 0 ? totalAmount / financialOrders.length : 0;

    return {
      totalAmount,
      totalExams,
      totalOrders: financialOrders.length,
      completedAmount,
      inProgressAmount,
      avgTicket,
    };
  }, [financialOrders]);

  if (!api.hasValidSession('vet')) {
    return null;
  }

  const pendingCollectionsCount = collections.filter(
    (c) => (c.status || 'pendente') === 'pendente' || c.status === 'agendada'
  ).length;

  return (
    <div className="space-y-5 py-5 sm:py-7 pb-20 sm:pb-24">
      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 max-w-md bg-[#0b2240] text-white px-4 sm:px-5 py-3 rounded-2xl sm:rounded-full flex items-center gap-2.5 text-[12px] font-semibold shadow-xl">
          <CheckCircle2 className="w-4 h-4 text-[#7fdbea] shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* CABEÇALHO DO VETERINÁRIO + ATALHO DE SOLICITAR COLETA */}
      <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-[#1d9496]/10 text-[#1d9496] flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[19px] sm:text-[22px] font-semibold text-[#1d1d1f] leading-tight">
                {vet ? vet.name : 'Portal do Veterinário'}
              </h1>
              {vet?.crmv && (
                <span className="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] font-mono text-[11px] font-bold text-[#0b2240] shrink-0">
                  {vet.crmv}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#707070] mt-0.5 truncate">
              {vet
                ? `${vet.clinic_name || 'Clínica Parceira'} • ${vet.email}`
                : isLabStaff
                  ? 'Acesso corporativo autenticado'
                  : ''}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenRequestCollection}
            className="px-4 py-2 rounded-full bg-[#0071e3] hover:bg-[#0062c4] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Solicitar Coleta
          </button>
          <button
            type="button"
            onClick={loadAllVetData}
            disabled={loading}
            className="px-3.5 py-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="px-4 py-2 rounded-full border border-slate-200 hover:bg-slate-100 text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </div>

      {/* ABAS DE NAVEGAÇÃO RÁPIDA (MOBILE / COMPLEMENTO À SIDEBAR) */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { id: 'orders' as VetPortalTab, label: 'Atendimentos & Laudos', count: orders.length, icon: FlaskConical },
            { id: 'collections' as VetPortalTab, label: 'Coletas & Agendamentos', count: pendingCollectionsCount, icon: Calendar },
            { id: 'catalog' as VetPortalTab, label: 'Catálogo & Valores', count: catalogExams.length, icon: BookOpen },
            { id: 'financial' as VetPortalTab, label: 'Consolidado Financeiro', icon: DollarSign },
          ] as const
        ).map((item) => {
          const IconComp = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`px-4 py-2 rounded-full text-[12px] font-semibold inline-flex items-center gap-2 transition cursor-pointer ${
                active
                  ? 'bg-[#0b2240] text-white shadow-xs'
                  : 'bg-white border border-black/5 text-[#1d1d1f] hover:bg-[#f5f5f7]'
              }`}
            >
              <IconComp className="w-3.5 h-3.5" />
              <span>{item.label}</span>
              {'count' in item && typeof item.count === 'number' && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-[#f5f5f7] text-[#1d1d1f]'
                  }`}
                >
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* =====================================================================
          ABA 1: MEUS ATENDIMENTOS & LAUDOS
         ===================================================================== */}
      {activeTab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-[19px] font-semibold text-[#1d1d1f]">
                  Atendimentos & Exames Solicitados ({filteredOrders.length})
                </h2>
                <p className="text-[11.5px] text-[#707070]">
                  Acompanhe o status em tempo real e baixe os laudos liberados em PDF.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#86868b] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar protocolo, paciente, tutor ou exame..."
                  className="w-full pl-9 pr-4 py-2 rounded-full bg-[#f5f5f7] text-[12px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px] text-[#1d1d1f] focus:outline-none"
              >
                <option value="todos">Todos os Status</option>
                <option value="concluido">Concluídos</option>
                <option value="em_analise">Em Análise</option>
                <option value="pendente">Pendentes</option>
              </select>
            </div>

            <div className="space-y-2.5">
              {filteredOrders.length === 0 ? (
                <div className="py-10 text-center text-[12.5px] text-[#707070] bg-[#f8fafc] rounded-2xl">
                  Nenhum atendimento encontrado para este filtro.
                </div>
              ) : (
                filteredOrders
                  .slice((ordersPage - 1) * 8, ordersPage * 8)
                  .map((ord) => (
                    <div
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className={`p-3.5 sm:p-4 rounded-[20px] cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 border ${
                        selectedOrder?.id === ord.id
                          ? 'bg-[#f0f7ff] border-[#0071e3]/30'
                          : 'bg-[#f5f5f7] border-transparent hover:bg-[#ebebf0]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[12px] font-bold text-[#0b2240]">
                            {ord.protocol_code}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                              ord.status === 'concluido'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'em_analise'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-white text-[#5b6675]'
                            }`}
                          >
                            {ord.status === 'concluido'
                              ? 'Concluído'
                              : ord.status === 'em_analise'
                                ? 'Em Análise'
                                : 'Pendente'}
                          </span>
                          {ord.created_at && (
                            <span className="text-[11px] text-[#86868b]">
                              {new Date(ord.created_at).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                        <div className="text-[14px] font-semibold text-[#1d1d1f] truncate">
                          {ord.patient?.name || 'Paciente'}{' '}
                          <span className="font-normal text-[11.5px] text-[#707070]">
                            ({ord.patient?.species || '—'} • Tutor: {ord.patient?.tutor_name || '—'})
                          </span>
                        </div>
                        <div className="text-[11.5px] text-[#5b6675] truncate">
                          Exames: {(ord.results || []).map((r) => `[${r.exam_code || r.exam?.code || 'EXM'}] ${r.exam_name || r.exam?.name || ''}`).join(', ')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[12px] font-bold text-[#0b2240] bg-white px-2.5 py-1 rounded-full">
                          R$ {Number(ord.total_amount || 0).toFixed(2)}
                        </span>
                        {ord.status === 'concluido' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              downloadOrderPdf(ord);
                            }}
                            className="px-3 py-1.5 rounded-full bg-[#0071e3] text-white text-[11.5px] font-semibold inline-flex items-center gap-1 hover:opacity-95 transition cursor-pointer"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            PDF
                          </button>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full bg-white text-[#707070] text-[10.5px] font-medium">
                            Aguardando
                          </span>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>

            <PaginationBar
              page={ordersPage}
              pageSize={8}
              totalItems={filteredOrders.length}
              onPageChange={setOrdersPage}
            />
          </div>

          {/* PREVIEW DO LAUDO SELECIONADO */}
          <div className="lg:col-span-5 bg-white rounded-[24px] p-4 sm:p-6 border border-black/5">
            {selectedOrder ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#e5e5ea]">
                  <div className="flex items-start gap-3 min-w-0">
                    <img
                      src="/images/vetlife-logo.jpg"
                      alt="VetLife"
                      className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 border border-slate-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[11.5px] font-mono font-bold text-[#86868b]">
                        {selectedOrder.protocol_code}
                      </span>
                      <h3 className="font-display text-[18px] font-semibold text-[#1d1d1f] leading-tight">
                        {selectedOrder.patient?.name} ({selectedOrder.patient?.species})
                      </h3>
                      <p className="text-[11.5px] text-[#707070] mt-0.5">
                        Idade:{' '}
                        {formatAgeLabel(
                          selectedOrder.patient?.age_days,
                          selectedOrder.patient?.birth_date
                        )}{' '}
                        • Tutor: {selectedOrder.patient?.tutor_name}
                      </p>
                    </div>
                  </div>
                  {selectedOrder.status === 'concluido' && (
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => downloadOrderPdf(selectedOrder)}
                        className="px-3.5 py-1.5 rounded-full bg-[#0071e3] text-white text-[11.5px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => printFormattedReportWindow(selectedOrder)}
                        className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] cursor-pointer"
                        title="Imprimir Laudo"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {selectedOrder.status !== 'concluido' ? (
                    <div className="p-5 rounded-[20px] bg-[#f5f5f7] text-center space-y-2">
                      <div className="font-display text-[15px] font-semibold text-[#1d1d1f]">
                        Exame em análise técnica na bancada
                      </div>
                      <p className="text-[12px] text-[#707070]">
                        O laudo completo será disponibilizado aqui assim que todos os exames deste protocolo forem finalizados.
                      </p>
                    </div>
                  ) : (
                    (selectedOrder.results || []).map((res) => {
                      const fields = res.input_fields || res.exam?.input_fields || [];
                      const refText =
                        res.reference_snapshot ||
                        res.matched_reference?.reference_text_content ||
                        'Referência padrão';
                      return (
                        <div key={res.id} className="p-4 rounded-[20px] bg-[#f5f5f7] space-y-2.5">
                          <div className="font-display text-[15px] font-semibold text-[#1d1d1f]">
                            [{res.exam_code || res.exam?.code}] {res.exam_name || res.exam?.name}
                          </div>
                          {Object.entries(res.dynamic_content || {}).length === 0 ? (
                            <div className="text-[12px] text-[#707070]">Em processamento laboratorial.</div>
                          ) : (
                            <div className="bg-white rounded-[16px] p-3 overflow-x-auto">
                              <table className="w-full text-left border-collapse text-[11.5px]">
                                <thead>
                                  <tr className="text-[10px] uppercase text-[#86868b] border-b border-[#e8e8ed]">
                                    <th className="pb-1.5 pr-2 font-semibold">Parâmetro</th>
                                    <th className="pb-1.5 px-2 font-semibold">Resultado</th>
                                    <th className="pb-1.5 pl-2 font-semibold">Referência</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f0f0f5]">
                                  {Object.entries(res.dynamic_content).map(([k, v]) => {
                                    const fMeta = fields.find((f) => f.field_name === k);
                                    const rawLabel = fMeta?.field_label || k;
                                    const unit = fMeta?.unit ? ` ${fMeta.unit}` : '';
                                    const sideRef = resolveSideBySideReference(k, rawLabel, refText);
                                    return (
                                      <tr key={k}>
                                        <td className="py-1.5 pr-2 font-medium text-[#1d1d1f]">
                                          {rawLabel}
                                        </td>
                                        <td className="py-1.5 px-2 font-mono font-bold text-[#0f766e]">
                                          {String(v)}{unit}
                                        </td>
                                        <td className="py-1.5 pl-2 text-[11px] text-[#5b6675]">
                                          {sideRef}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="py-14 text-center text-[13px] text-[#707070]">
                Selecione um atendimento ao lado para visualizar os detalhes e o laudo.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 2: MINHAS COLETAS & AGENDAMENTOS
         ===================================================================== */}
      {activeTab === 'collections' && (
        <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                Minhas Coletas & Agendamentos ({filteredCollections.length})
              </h2>
              <p className="text-[12px] text-[#707070]">
                Consulte o status das suas solicitações, datas/horários agendados pelo laboratório ou peça uma nova coleta.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleOpenRequestCollection}
                className="px-4 py-2 rounded-full bg-[#0071e3] hover:bg-[#0062c4] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova Solicitação de Coleta
              </button>
              <input
                type="text"
                value={collectionSearch}
                onChange={(e) => setCollectionSearch(e.target.value)}
                placeholder="Buscar endereço ou observação..."
                className="px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px] w-full sm:w-56"
              />
              <select
                value={collectionStatusFilter}
                onChange={(e) => setCollectionStatusFilter(e.target.value)}
                className="px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px]"
              >
                <option value="todos">Todos os Status</option>
                <option value="pendente">Pendentes</option>
                <option value="agendada">Agendadas</option>
                <option value="concluida">Concluídas</option>
                <option value="cancelada">Canceladas</option>
              </select>
            </div>
          </div>

          {filteredCollections.length === 0 ? (
            <div className="py-12 text-center space-y-3 bg-[#f8fafc] rounded-2xl">
              <div className="text-[13px] text-[#707070]">
                Nenhuma solicitação de coleta encontrada para este filtro.
              </div>
              <button
                type="button"
                onClick={handleOpenRequestCollection}
                className="px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Solicitar Coleta Agora
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredCollections
                .slice((collectionsPage - 1) * 8, collectionsPage * 8)
                .map((col) => {
                  const st = col.status || 'pendente';
                  const badgeClass =
                    st === 'concluida'
                      ? 'bg-emerald-100 text-emerald-800'
                      : st === 'agendada'
                        ? 'bg-sky-100 text-sky-800'
                        : st === 'cancelada'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-amber-100 text-amber-800';
                  const statusLabel =
                    st === 'concluida'
                      ? 'Concluída'
                      : st === 'agendada'
                        ? 'Agendada'
                        : st === 'cancelada'
                          ? 'Cancelada'
                          : 'Aguardando Agendamento';

                  return (
                    <div
                      key={col.id || `${col.address}-${col.created_at}`}
                      className="p-4 rounded-2xl bg-[#f5f5f7] border border-black/5 space-y-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[14px] font-semibold text-[#1d1d1f] truncate">
                            {col.clinic_or_tutor_name}
                          </div>
                          <div className="text-[11px] text-[#707070] flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3 shrink-0" />
                            <span>{col.phone}</span>
                            {col.crmv && (
                              <span className="font-mono font-bold text-[#0b2240]">• {col.crmv}</span>
                            )}
                          </div>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold shrink-0 ${badgeClass}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <div className="bg-white rounded-xl p-3 text-[12px] space-y-1.5">
                        <div className="flex items-start gap-1.5 text-[#1d1d1f]">
                          <MapPin className="w-3.5 h-3.5 text-[#0071e3] shrink-0 mt-0.5" />
                          <span>{col.address}</span>
                        </div>
                        {col.preferred_date && (
                          <div className="text-[11.5px] text-[#5b6675]">
                            <strong>Data Preferencial:</strong>{' '}
                            {col.preferred_date.split('-').reverse().join('/')}
                          </div>
                        )}
                        {(col.scheduled_date || st === 'agendada') && (
                          <div className="flex items-center gap-1.5 text-sky-800 font-semibold text-[12px] pt-0.5">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              Retirada Agendada:{' '}
                              {col.scheduled_date
                                ? `${col.scheduled_date.split('-').reverse().join('/')}${
                                    col.scheduled_time ? ` às ${col.scheduled_time}` : ''
                                  }`
                                : 'Confirmado pelo laboratório'}
                            </span>
                          </div>
                        )}
                        {col.notes && (
                          <div className="text-[11.5px] text-[#5b6675]">
                            <strong>Observações:</strong> {col.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          <PaginationBar
            page={collectionsPage}
            pageSize={8}
            totalItems={filteredCollections.length}
            onPageChange={setCollectionsPage}
          />
        </div>
      )}

      {/* =====================================================================
          ABA 3: CATÁLOGO DE EXAMES, EXPLICAÇÕES E VALORES
         ===================================================================== */}
      {activeTab === 'catalog' && (
        <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                  Catálogo de Exames & Valores ({filteredCatalog.length})
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10.5px] font-bold">
                  {catalogTableName}
                </span>
              </div>
              <p className="text-[12px] text-[#707070] mt-0.5">
                Consulte os exames disponíveis, material/tubos necessários, prazo de entrega e valores atualizados.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-[#86868b] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder="Buscar por código, nome ou tubo..."
                  className="w-full pl-9 pr-4 py-2 rounded-full bg-[#f5f5f7] text-[12px]"
                />
              </div>
              <select
                value={catalogSection}
                onChange={(e) => setCatalogSection(e.target.value)}
                className="px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px]"
              >
                <option value="todos">Todas as Seções</option>
                {catalogSections.map((sec) => (
                  <option key={sec} value={sec}>
                    {sec}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[12px]">
              <thead>
                <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10.5px]">
                  <th className="py-2.5 px-3 font-semibold">Código</th>
                  <th className="py-2.5 px-3 font-semibold">Exame / Composição</th>
                  <th className="py-2.5 px-3 font-semibold">Amostra / Tubos & Orientação</th>
                  <th className="py-2.5 px-3 font-semibold">Prazo</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f5]">
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-[#707070]">
                      Nenhum exame encontrado para este filtro.
                    </td>
                  </tr>
                ) : (
                  filteredCatalog
                    .slice((catalogPage - 1) * 15, catalogPage * 15)
                    .map((ex) => {
                      const deadlineText =
                        ex.delivery_time_label ||
                        (ex.delivery_days === 1 ? '1 dia útil' : `${ex.delivery_days} dias úteis`);
                      const priceVal = Number(ex.price ?? ex.base_price ?? 0);
                      return (
                        <tr key={ex.id} className="hover:bg-[#f5f5f7]/60 align-top">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#0071e3] whitespace-nowrap">
                            [{ex.code}]
                          </td>
                          <td className="py-2.5 px-3 max-w-md">
                            <div className="font-semibold text-[#1d1d1f]">{ex.name}</div>
                            <div className="text-[11px] text-[#707070] mt-0.5">
                              Seção: <span className="font-medium text-[#1d1d1f]">{ex.section}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-[#5b6675] max-w-sm">
                            {Array.isArray(ex.label_templates) && ex.label_templates.length > 0 ? (
                              <div className="space-y-0.5">
                                {ex.label_templates.map((lt, idx) => (
                                  <div key={idx} className="text-[11.5px] flex items-start gap-1">
                                    <span className="font-mono font-bold text-[#0b2240] shrink-0">
                                      {lt.label_qty}x
                                    </span>
                                    <span>{lt.tube_type}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[11.5px]">{ex.tube_type || ex.material || 'Conforme coleta padrão'}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[11px] font-semibold">
                              <Clock className="w-3 h-3 text-[#0071e3]" />
                              {deadlineText}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#0b2240] text-right whitespace-nowrap">
                            R$ {priceVal.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>

          <PaginationBar
            page={catalogPage}
            pageSize={15}
            totalItems={filteredCatalog.length}
            onPageChange={setCatalogPage}
          />
        </div>
      )}

      {/* =====================================================================
          ABA 4: CONSOLIDADO FINANCEIRO / FATURAS & BOLETOS
         ===================================================================== */}
      {activeTab === 'financial' && (
        <div className="space-y-4">
          {/* Faturas / Boletos Emitidos pelo Laboratório */}
          <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-3.5">
            <div>
              <h2 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                Faturas & Boletos ({invoices.length})
              </h2>
              <p className="text-[12px] text-[#707070]">
                Acompanhe as faturas consolidadas emitidas pelo laboratório e baixe o PDF do boleto para pagamento.
              </p>
            </div>

            {invoices.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#707070] bg-[#f8fafc] rounded-2xl">
                Nenhuma fatura consolidada emitida até o momento.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-4 rounded-2xl bg-[#f5f5f7] border border-black/5 flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono text-[13px] font-bold text-[#0b2240]">
                          {inv.invoice_number}
                        </div>
                        <div className="text-[11px] text-[#707070]">
                          Referência: {inv.reference_month || '—'} •{' '}
                          {inv.orders_count ?? inv.orders?.length ?? 0} atendimento(s)
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold ${
                          inv.status === 'pago'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {inv.status === 'pago' ? 'Pago' : 'Aguardando Pagamento'}
                      </span>
                    </div>

                    <div className="bg-white rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-[10.5px] text-[#707070]">Valor da Fatura</div>
                        <div className="font-mono text-[17px] font-bold text-[#0b2240]">
                          R$ {Number(inv.total_amount || 0).toFixed(2)}
                        </div>
                        {inv.due_date && (
                          <div className="text-[11px] text-[#5b6675]">
                            Vencimento: {inv.due_date.split('-').reverse().join('/')}
                          </div>
                        )}
                      </div>
                      {inv.boleto_pdf_url ? (
                        <a
                          href={inv.boleto_pdf_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 rounded-full bg-[#0071e3] hover:bg-[#0062c4] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          Baixar Boleto PDF
                        </a>
                      ) : (
                        <span className="px-3 py-1.5 rounded-full bg-[#f5f5f7] text-[#707070] text-[11px] font-medium">
                          Boleto pendente de envio
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-[24px] p-4 sm:p-6 border border-black/5 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                  Consolidado para Acerto / Extrato por Período
                </h2>
                <p className="text-[12px] text-[#707070] mt-0.5">
                  Filtre por data para conferir todos os exames solicitados e o valor total consolidado do período.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[10.5px] font-semibold text-[#707070] mb-1">
                    Data Inicial
                  </label>
                  <input
                    type="date"
                    value={finStartDate}
                    onChange={(e) => setFinStartDate(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-[#f5f5f7] text-[12px] font-medium text-[#1d1d1f]"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-[#707070] mb-1">
                    Data Final
                  </label>
                  <input
                    type="date"
                    value={finEndDate}
                    onChange={(e) => setFinEndDate(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-[#f5f5f7] text-[12px] font-medium text-[#1d1d1f]"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-semibold text-[#707070] mb-1">
                    Status
                  </label>
                  <select
                    value={finStatusFilter}
                    onChange={(e) => setFinStatusFilter(e.target.value as any)}
                    className="px-3 py-1.5 rounded-xl bg-[#f5f5f7] text-[12px] font-medium text-[#1d1d1f]"
                  >
                    <option value="todos">Todos</option>
                    <option value="concluido">Somente Concluídos</option>
                    <option value="em_andamento">Em Andamento</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFinStartDate(getFirstDayOfCurrentMonth());
                    setFinEndDate(getLastDayOfCurrentMonth());
                    setFinStatusFilter('todos');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#0b2240] text-white text-[12px] font-semibold cursor-pointer"
                >
                  Mês Atual
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFinStartDate('');
                    setFinEndDate('');
                    setFinStatusFilter('todos');
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[12px] font-semibold cursor-pointer"
                >
                  Todo Período
                </button>
              </div>
            </div>

            {/* Cards Consolidados */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-[#0b2240] text-white">
                <div className="text-[11px] uppercase tracking-wider text-white/70">
                  Total Consolidado no Período
                </div>
                <div className="font-display text-[24px] font-bold font-mono mt-1">
                  R$ {financialSummary.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-white/75 mt-0.5">
                  {financialSummary.totalOrders} atendimento(s) • {financialSummary.totalExams} exame(s)
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                <div className="text-[11px] uppercase tracking-wider text-[#707070]">
                  Laudos Concluídos
                </div>
                <div className="font-display text-[22px] font-bold font-mono text-emerald-700 mt-1">
                  R$ {financialSummary.completedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-[#707070] mt-0.5">
                  Exames já finalizados
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                <div className="text-[11px] uppercase tracking-wider text-[#707070]">
                  Em Análise / Pendentes
                </div>
                <div className="font-display text-[22px] font-bold font-mono text-amber-700 mt-1">
                  R$ {financialSummary.inProgressAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-[#707070] mt-0.5">
                  Aguardando liberação
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                <div className="text-[11px] uppercase tracking-wider text-[#707070]">
                  Ticket Médio
                </div>
                <div className="font-display text-[22px] font-bold font-mono text-[#1d1d1f] mt-1">
                  R$ {financialSummary.avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-[#707070] mt-0.5">
                  Média por atendimento
                </div>
              </div>
            </div>

            {/* Extrato Detalhado */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10.5px]">
                    <th className="py-2.5 px-3 font-semibold">Data</th>
                    <th className="py-2.5 px-3 font-semibold">Protocolo</th>
                    <th className="py-2.5 px-3 font-semibold">Paciente / Tutor</th>
                    <th className="py-2.5 px-3 font-semibold">Exames Solicitados</th>
                    <th className="py-2.5 px-3 font-semibold">Pagamento</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f5]">
                  {financialOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#707070]">
                        Nenhum atendimento registrado no período selecionado.
                      </td>
                    </tr>
                  ) : (
                    financialOrders
                      .slice((finPage - 1) * 12, finPage * 12)
                      .map((ord) => (
                        <tr key={ord.id} className="hover:bg-[#f5f5f7]/60">
                          <td className="py-2.5 px-3 whitespace-nowrap text-[#5b6675]">
                            {ord.created_at
                              ? new Date(ord.created_at).toLocaleDateString('pt-BR')
                              : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#0b2240] whitespace-nowrap">
                            {ord.protocol_code}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-[#1d1d1f]">{ord.patient?.name}</div>
                            <div className="text-[11px] text-[#707070]">{ord.patient?.tutor_name}</div>
                          </td>
                          <td className="py-2.5 px-3 max-w-md">
                            <div className="space-y-0.5">
                              {(ord.results || []).map((r) => (
                                <div key={r.id} className="text-[11.5px] text-[#1d1d1f] truncate">
                                  <span className="font-mono font-semibold text-[#0071e3] mr-1">
                                    [{r.exam_code || r.exam?.code || 'EXM'}]
                                  </span>
                                  <span>{r.exam_name || r.exam?.name}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${
                                ord.payment_status === 'pago'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : ord.payment_status === 'aguardando_pagamento'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-[#f5f5f7] text-[#5b6675]'
                              }`}
                            >
                              {ord.payment_status === 'pago'
                                ? 'Pago'
                                : ord.payment_status === 'aguardando_pagamento'
                                  ? 'Aguardando Pagamento'
                                  : 'Não Faturado'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-[#0b2240] text-right whitespace-nowrap">
                            R$ {Number(ord.total_amount || 0).toFixed(2)}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            <PaginationBar
              page={finPage}
              pageSize={12}
              totalItems={financialOrders.length}
              onPageChange={setFinPage}
            />
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL: SOLICITAR COLETA (DADOS DO VET PRÉ-PREENCHIDOS)
         ===================================================================== */}
      {requestCollectionOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2240]/45 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
          onClick={() => setRequestCollectionOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmitCollectionRequest}
            className="bg-white rounded-[24px] max-w-xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-black/10"
          >
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
              <div>
                <h3 className="font-display text-[18px] font-semibold text-[#1d1d1f]">
                  Solicitar Coleta de Amostras
                </h3>
                <p className="text-[12px] text-[#707070]">
                  Informe o endereço e os detalhes das amostras para agendarmos a retirada.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequestCollectionOpen(false)}
                className="p-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  Clínica / Veterinário *
                </label>
                <input
                  type="text"
                  required
                  value={collectionForm.clinic_or_tutor_name}
                  onChange={(e) =>
                    setCollectionForm({ ...collectionForm, clinic_or_tutor_name: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  CRMV *
                </label>
                <input
                  type="text"
                  required
                  value={collectionForm.crmv}
                  onChange={(e) =>
                    setCollectionForm({ ...collectionForm, crmv: e.target.value.toUpperCase() })
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] font-mono text-[12.5px] uppercase"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  Telefone / WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={collectionForm.phone}
                  onChange={(e) => setCollectionForm({ ...collectionForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={collectionForm.email}
                  onChange={(e) => setCollectionForm({ ...collectionForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                  Data Preferencial *
                </label>
                <input
                  type="date"
                  required
                  value={collectionForm.preferred_date}
                  onChange={(e) =>
                    setCollectionForm({ ...collectionForm, preferred_date: e.target.value })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                Endereço Completo para Retirada *
              </label>
              <input
                type="text"
                required
                value={collectionForm.address}
                onChange={(e) => setCollectionForm({ ...collectionForm, address: e.target.value })}
                placeholder="Rua, número, bairro, cidade e ponto de referência"
                className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                Observações / Amostras Preparadas
              </label>
              <textarea
                rows={3}
                value={collectionForm.notes}
                onChange={(e) => setCollectionForm({ ...collectionForm, notes: e.target.value })}
                placeholder="Ex: 2 tubos EDTA + 1 tubo tampa amarela refrigerados na recepção..."
                className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12.5px]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRequestCollectionOpen(false)}
                className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[12px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmittingCollection}
                className="px-5 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer disabled:opacity-60"
              >
                {isSubmittingCollection ? 'Enviando...' : 'Enviar Solicitação'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
