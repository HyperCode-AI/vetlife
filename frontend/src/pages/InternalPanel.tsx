import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardPlus,
  FlaskConical,
  Settings,
  DollarSign,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Tag,
  Plus,
  Trash2,
  FileDown,
  Printer,
  Send,
  Paperclip,
  Barcode,
  Sparkles,
  Lock,
  Percent,
  Sliders,
  BookOpen,
  FileText,
  Eye,
  Pencil,
  Users,
  MessageCircle,
  Mail,
  Calendar,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import { SearchableSelectField } from '../components/SearchablePickerModal';
import { ExamMultiPicker } from '../components/ExamMultiPicker';
import { PaginationBar } from '../components/PaginationBar';
import { BillingSection } from '../components/BillingSection';
import {
  User,
  Exam,
  ExamInputField,
  PriceTable,
  ExamReference,
  ReportTemplate,
  Patient,
  Vet,
  Order,
  Invoice,
  CollectionLabel,
  CollectionRequest,
  OperationalStats,
  FinancialStats,
  FieldType,
  ExamAttachment,
} from '../types';
import {
  api,
  calculatePatientAgeDays,
  formatAgeLabel,
  parseTubeTypeToLabelTemplates,
  renderReportHtmlWithDynamicTags,
  resolveReferenceForPatient,
} from '../services/api';
import { RichHtmlEditor } from '../components/RichHtmlEditor';
import {
  downloadOrderPdf,
  downloadThermalLabelsPdf,
  printCollectionLabelsWindow,
} from '../utils/pdfGenerator';

export type InternalTab =
  | 'operational'
  | 'patients'
  | 'routine'
  | 'launch'
  | 'settings'
  | 'financial';
export type RoutineSubTab = 'list' | 'new' | 'collections';
export type FinancialSubTab = 'overview' | 'billing';
export type SettingsSubTab =
  | 'exams'
  | 'fields'
  | 'prices'
  | 'references'
  | 'templates'
  | 'users'
  | 'vets';

interface InternalPanelProps {
  activeTab?: InternalTab;
  routineSubTab?: RoutineSubTab;
  settingsTab?: SettingsSubTab;
  financialSubTab?: FinancialSubTab;
  tabChangeNonce?: number;
  openNewOrderNonce?: number;
  onTabChange?: (tab: InternalTab) => void;
  onRoutineSubTabChange?: (sub: RoutineSubTab) => void;
  onSettingsTabChange?: (sub: SettingsSubTab) => void;
  onFinancialSubTabChange?: (sub: FinancialSubTab) => void;
  onLogout?: () => void;
}

const getTodayIsoDate = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const resolveFirstActivePriceTableId = (
  tables: PriceTable[],
  targetDate: string = getTodayIsoDate()
): string => {
  const dateStr = targetDate || getTodayIsoDate();
  const vigentes = tables.filter(
    (pt) => pt.is_active && pt.start_date <= dateStr && pt.end_date >= dateStr
  );
  if (vigentes.length > 0) {
    return vigentes[0].id;
  }
  const fallback = tables.find((pt) => pt.is_active) || tables[0];
  return fallback?.id || '';
};

const createEmptyPatientForm = () => ({
  name: '',
  species: '',
  breed: '',
  gender: '' as '' | 'M' | 'F',
  birth_date: '',
  age_years: '' as number | '',
  age_months: '' as number | '',
  tutor_name: '',
  tutor_phone: '',
  tutor_email: '',
});

const createEmptyPatientCrudForm = () => ({
  name: '',
  species: '',
  breed: '',
  gender: '' as '' | 'M' | 'F',
  birth_date: '',
  age_years: '' as number | '',
  age_months: '' as number | '',
  tutor_name: '',
  tutor_phone: '',
  tutor_email: '',
});

export const InternalPanel: React.FC<InternalPanelProps> = ({
  activeTab: externalActiveTab,
  routineSubTab: externalRoutineSubTab,
  settingsTab: externalSettingsTab,
  financialSubTab: externalFinancialSubTab,
  tabChangeNonce,
  openNewOrderNonce,
  onTabChange,
  onRoutineSubTabChange,
  onSettingsTabChange,
  onFinancialSubTabChange,
}) => {
  const [user, setUser] = useState<User | null>(() =>
    api.hasValidSession('internal') ? api.getCurrentUser() : null
  );
  const [loginEmail, setLoginEmail] = useState('admin@vetlifelab.com.br');
  const [loginPassword, setLoginPassword] = useState('admin123');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTabState, setActiveTabState] = useState<InternalTab>(
    externalActiveTab || 'operational'
  );
  const activeTab = activeTabState;
  const setActiveTab = (nextTab: InternalTab) => {
    setActiveTabState(nextTab);
    onTabChange?.(nextTab);
  };
  const [settingsTabState, setSettingsTabState] = useState<SettingsSubTab>(
    externalSettingsTab || 'exams'
  );
  const settingsTab = settingsTabState;
  const setSettingsTab = (nextSub: SettingsSubTab) => {
    setSettingsTabState(nextSub);
    onSettingsTabChange?.(nextSub);
  };
  const [financialSubTabState, setFinancialSubTabState] = useState<FinancialSubTab>(
    externalFinancialSubTab || 'overview'
  );
  const financialSubTab = externalFinancialSubTab || financialSubTabState;
  const setFinancialSubTab = (nextSub: FinancialSubTab) => {
    setFinancialSubTabState(nextSub);
    onFinancialSubTabChange?.(nextSub);
  };
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  type NavHistorySnapshot = {
    tab: InternalTab;
    routineSubTab: 'list' | 'new' | 'collections';
    launchSubView: 'list' | 'editor';
    settingsTab: SettingsSubTab;
    selectedOrderId?: string;
    selectedResultId?: string;
    label: string;
  };
  const [navHistory, setNavHistory] = useState<NavHistorySnapshot[]>([]);

  const [exams, setExams] = useState<Exam[]>([]);
  const [priceTables, setPriceTables] = useState<PriceTable[]>([]);
  const [references, setReferences] = useState<ExamReference[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [vets, setVets] = useState<Vet[]>([]);
  const [labUsers, setLabUsers] = useState<User[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [editingLabUserId, setEditingLabUserId] = useState<string | null>(null);
  const [labUserForm, setLabUserForm] = useState({
    name: '',
    email: '',
    role: 'biomedical' as 'admin' | 'biomedical',
    password: '',
  });
  const [vetSearch, setVetSearch] = useState('');
  const [editingVetId, setEditingVetId] = useState<string | null>(null);
  const [vetForm, setVetForm] = useState({
    name: '',
    crmv: '',
    clinic_name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [opStats, setOpStats] = useState<OperationalStats | null>(null);
  const [finStats, setFinStats] = useState<FinancialStats | null>(null);

  const [orderDate, setOrderDate] = useState<string>(() => getTodayIsoDate());
  const [selectedTableId, setSelectedTableId] = useState('');
  const [selectedVetId, setSelectedVetId] = useState('');
  const [selectedExamIds, setSelectedExamIds] = useState<string[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderModalResetKey, setOrderModalResetKey] = useState(0);
  const [patientForm, setPatientForm] = useState(createEmptyPatientForm);
  const [labelsModal, setLabelsModal] = useState<{
    order: Order;
    labels: CollectionLabel[];
  } | null>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string>('ord-03');
  const [selectedResultId, setSelectedResultId] = useState<string>('');
  const [dynamicValues, setDynamicValues] = useState<Record<string, any>>({});
  const [attachments, setAttachments] = useState<ExamAttachment[]>([]);
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl-default-01');

  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examSearchQuery, setExamSearchQuery] = useState<string>('');
  const [newExamForm, setNewExamForm] = useState({
    code: '',
    name: '',
    section: 'Bioquímica',
    delivery_days: 1,
    delivery_time_label: '1 dia útil',
    tube_type: 'Tubo EDTA (Tampa Roxa)',
    label_qty: 1,
    label_templates: [
      { tube_type: 'Tubo EDTA (Tampa Roxa)', label_qty: 1 },
    ] as Array<{ tube_type: string; label_qty: number }>,
    base_price: 85,
  });
  const [examTablePrices, setExamTablePrices] = useState<Record<string, number>>({});
  const [configExamIdForFields, setConfigExamIdForFields] = useState<string>('exam-hemo-01');
  const [newFieldForm, setNewFieldForm] = useState({
    field_name: '',
    field_label: '',
    field_type: 'number' as FieldType,
    unit: '',
    options_csv: '',
    is_required: true,
  });
  const [editingPriceTableId, setEditingPriceTableId] = useState<string>('pt-2026-padrao');
  const [adjustmentPercent, setAdjustmentPercent] = useState<number>(8.5);
  const [newPriceTableForm, setNewPriceTableForm] = useState({
    name: '',
    partner_clinic: '',
    start_date: '2026-05-01',
    end_date: '2026-12-31',
  });
  const [newRefForm, setNewRefForm] = useState({
    exam_id: 'exam-hemo-01',
    species: 'Canino',
    gender: 'Ambos',
    min_age_days: 180,
    max_age_days: 3650,
    reference_text_content: '',
  });
  const [editingTemplate, setEditingTemplate] = useState<ReportTemplate | null>(null);
  const [editingReferenceId, setEditingReferenceId] = useState<string | null>(null);
  const [activeTemplateField, setActiveTemplateField] = useState<'header' | 'body' | 'footer'>('body');
  const [insertTagRequest, setInsertTagRequest] = useState<{ tag: string; nonce: number } | null>(null);
  const [templatePreviewWithSample, setTemplatePreviewWithSample] = useState<boolean>(true);

  // Estados do CRUD de Pacientes (com pedido opcional de exames)
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const calculateAgeMonthsFromBirthDate = (birthDateStr: string): number | '' => {
    if (!birthDateStr) return '';
    const parts = birthDateStr.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
    const [year, month, day] = parts;
    const birth = new Date(year, month - 1, day);
    if (Number.isNaN(birth.getTime())) return '';
    const today = new Date();
    if (birth > today) return 0;
    let months =
      (today.getFullYear() - birth.getFullYear()) * 12 + (today.getMonth() - birth.getMonth());
    if (today.getDate() < birth.getDate()) {
      months -= 1;
    }
    return Math.max(0, months);
  };

  const calculateBirthDateFromAgeMonths = (months: number): string => {
    if (Number.isNaN(months) || months < 0) return '';
    const date = new Date();
    date.setMonth(date.getMonth() - Math.floor(months));
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateAgeDaysFromYearsMonths = (years: number, months: number): number => {
    const safeY = Math.max(0, Math.floor(years || 0));
    const safeM = Math.max(0, Math.floor(months || 0));
    return Math.max(1, safeY * 365 + safeM * 30);
  };

  const splitDaysToYearsMonths = (days: number): { years: number; months: number } => {
    const safeDays = Math.max(0, Math.floor(Number(days) || 0));
    const years = Math.floor(safeDays / 365);
    const months = Math.min(11, Math.floor((safeDays % 365) / 30));
    return { years, months };
  };

  const formatReferenceAgeRange = (minDays: number, maxDays: number): string => {
    const fmt = (d: number) => {
      const safe = Math.max(0, Math.floor(Number(d) || 0));
      if (safe === 0) return '0 dias';
      if (safe < 30) return `${safe} dia${safe === 1 ? '' : 's'}`;
      const y = Math.floor(safe / 365);
      const m = Math.floor((safe % 365) / 30);
      if (y === 0) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
      if (m === 0) return `${y} ${y === 1 ? 'ano' : 'anos'}`;
      return `${y}a ${m}m`;
    };
    return `${fmt(minDays)} a ${fmt(maxDays)} (${minDays}–${maxDays} dias)`;
  };

  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [patientSpeciesFilter, setPatientSpeciesFilter] = useState('todos');
  const [patientCrudForm, setPatientCrudForm] = useState(createEmptyPatientCrudForm);
  const [patientIncludeExamOrder, setPatientIncludeExamOrder] = useState(false);
  const [patientSelectedExamIds, setPatientSelectedExamIds] = useState<string[]>([]);
  const [patientOrderVetId, setPatientOrderVetId] = useState('');
  const [patientOrderTableId, setPatientOrderTableId] = useState('');
  const [patientOrderModalKey, setPatientOrderModalKey] = useState(0);
  const [patientOrderNotes, setPatientOrderNotes] = useState('');

  // Estados de Atendimentos / Rotina (Listagem + Novo Atendimento vinculado a paciente + Solicitações de Coleta)
  const [routineSubTabState, setRoutineSubTabState] = useState<RoutineSubTab>(
    externalRoutineSubTab || 'list'
  );
  const routineSubTab = routineSubTabState;
  const setRoutineSubTab = (nextSub: RoutineSubTab) => {
    setRoutineSubTabState(nextSub);
    onRoutineSubTabChange?.(nextSub);
  };
  const [collectionRequests, setCollectionRequests] = useState<CollectionRequest[]>([]);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [collectionStatusFilter, setCollectionStatusFilter] = useState('todos');
  const [convertingCollection, setConvertingCollection] = useState<CollectionRequest | null>(null);
  const [convertingVetMatched, setConvertingVetMatched] = useState(false);
  const [quickVetModal, setQuickVetModal] = useState<{
    name: string;
    email: string;
    phone: string;
    password: string;
    clinic_name: string;
    crmv: string;
  } | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{
    collection: CollectionRequest;
    date: string;
    time: string;
  } | null>(null);
  const [collectionCrudModal, setCollectionCrudModal] = useState<{
    id?: string;
    clinic_or_tutor_name: string;
    crmv: string;
    phone: string;
    email: string;
    address: string;
    preferred_date: string;
    scheduled_date: string;
    scheduled_time: string;
    status: 'pendente' | 'agendada' | 'concluida' | 'cancelada';
    notes: string;
  } | null>(null);
  const [openOrderExamsKey, setOpenOrderExamsKey] = useState<string | null>(null);
  const [opPage, setOpPage] = useState(1);
  const [patientsPage, setPatientsPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [collectionsPage, setCollectionsPage] = useState(1);
  const [examsPage, setExamsPage] = useState(1);
  const [examModalOpen, setExamModalOpen] = useState(false);
  const [patientModalOpen, setPatientModalOpen] = useState(false);
  const [priceTableModalOpen, setPriceTableModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [vetModalOpen, setVetModalOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [referenceModalOpen, setReferenceModalOpen] = useState(false);
  const [fieldsPage, setFieldsPage] = useState(1);
  const [examSectionFilter, setExamSectionFilter] = useState('todos');
  const [pagedExams, setPagedExams] = useState<Exam[]>([]);
  const [pagedExamsTotal, setPagedExamsTotal] = useState(0);
  const [priceRowsPage, setPriceRowsPage] = useState(1);
  const [refsPage, setRefsPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [vetsPage, setVetsPage] = useState(1);
  const [launchSubView, setLaunchSubView] = useState<'list' | 'editor'>('list');
  const [launchStatusFilter, setLaunchStatusFilter] = useState<
    'todos' | 'pendente' | 'em_analise' | 'concluido'
  >('todos');
  const [launchSearch, setLaunchSearch] = useState('');
  const [launchPage, setLaunchPage] = useState(1);
  const [expandedLaunchOrderIds, setExpandedLaunchOrderIds] = useState<string[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [routinePatientMode, setRoutinePatientMode] = useState<'existing' | 'new'>('existing');
  const [routineSelectedPatientId, setRoutineSelectedPatientId] = useState<string>('');
  const [orderSearchCode, setOrderSearchCode] = useState('');
  const [orderSearchAnimal, setOrderSearchAnimal] = useState('');
  const [orderSearchTutor, setOrderSearchTutor] = useState('');
  const [orderSearchClinic, setOrderSearchClinic] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('todos');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const isAdmin = user?.role === 'admin';

  const getTabLabel = (tab: InternalTab): string => {
    switch (tab) {
      case 'operational':
        return 'Dashboard Operacional';
      case 'patients':
        return 'Pacientes';
      case 'routine':
        return 'Atendimentos';
      case 'launch':
        return 'Laudos';
      case 'settings':
        return 'Configurações';
      case 'financial':
        return 'Dashboard Financeiro';
      default:
        return 'Painel';
    }
  };

  const getSubScreenLabel = (
    tab: InternalTab,
    rSub: 'list' | 'new' | 'collections',
    lView: 'list' | 'editor',
    sTab: SettingsSubTab
  ): string => {
    if (tab === 'routine') {
      if (rSub === 'collections') return 'Coletas';
      return 'Atendimentos';
    }
    if (tab === 'launch') {
      return lView === 'editor' ? 'Editor de Laudo' : 'Fila de Bancada';
    }
    if (tab === 'settings') {
      const map: Record<SettingsSubTab, string> = {
        exams: 'Catálogo de Exames',
        fields: 'Campos Dinâmicos',
        prices: 'Tabelas de Preços',
        references: 'Valores de Referência',
        templates: 'Modelos de Laudos',
        users: 'Usuários do Laboratório',
        vets: 'Veterinários & Clínicas',
      };
      return map[sTab] || 'Configurações';
    }
    if (tab === 'patients') return 'Cadastro & Listagem';
    if (tab === 'financial') return financialSubTab === 'billing' ? 'Faturamento' : 'Visão Financeira';
    return 'Visão Geral';
  };

  const pushNavSnapshot = () => {
    const currentLabel = `${getTabLabel(activeTab)} > ${getSubScreenLabel(
      activeTab,
      routineSubTab,
      launchSubView,
      settingsTab
    )}`;
    setNavHistory((prev) => [
      ...prev.slice(-14),
      {
        tab: activeTab,
        routineSubTab,
        launchSubView,
        settingsTab,
        selectedOrderId,
        selectedResultId,
        label: currentLabel,
      },
    ]);
  };

  const handleGoBack = () => {
    if (navHistory.length === 0) {
      if (activeTab === 'launch' && launchSubView === 'editor') {
        setLaunchSubView('list');
      } else if (activeTab !== 'operational') {
        setActiveTab('operational');
      }
      return;
    }
    const last = navHistory[navHistory.length - 1];
    setNavHistory((prev) => prev.slice(0, -1));
    setActiveTab(last.tab);
    setRoutineSubTab(last.routineSubTab);
    setLaunchSubView(last.launchSubView);
    setSettingsTab(last.settingsTab);
    if (last.selectedOrderId) setSelectedOrderId(last.selectedOrderId);
    if (last.selectedResultId) setSelectedResultId(last.selectedResultId);
  };

  useEffect(() => {
    if (!externalActiveTab) return;
    const isRestricted =
      user?.role !== 'admin' &&
      (externalActiveTab === 'settings' || externalActiveTab === 'financial');
    const targetTab: InternalTab = isRestricted ? 'operational' : externalActiveTab;
    const targetRoutineSub: RoutineSubTab = externalRoutineSubTab || 'list';
    const targetSettingsSub: SettingsSubTab = externalSettingsTab || 'exams';

    if (
      targetTab !== activeTabState ||
      (targetTab === 'launch' && launchSubView !== 'list') ||
      (targetTab === 'routine' && routineSubTabState !== targetRoutineSub) ||
      (targetTab === 'settings' && settingsTabState !== targetSettingsSub)
    ) {
      pushNavSnapshot();
    }
    if (targetTab === 'launch') {
      setLaunchSubView('list');
    }
    if (targetTab === 'routine') {
      setRoutineSubTabState(targetRoutineSub);
      if (targetRoutineSub === 'collections') {
        api
          .getCollectionRequests()
          .then((fresh) => setCollectionRequests(fresh))
          .catch(() => {});
      }
    }
    if (targetTab === 'settings') {
      setSettingsTabState(targetSettingsSub);
    }
    setActiveTabState(targetTab);
  }, [externalActiveTab, externalRoutineSubTab, externalSettingsTab, tabChangeNonce]);

  useEffect(() => {
    if (!openNewOrderNonce) return;
    handleOpenNewOrder();
  }, [openNewOrderNonce]);

  useEffect(() => {
    setPatientsPage(1);
  }, [patientSearchQuery, patientSpeciesFilter]);

  useEffect(() => {
    setOrdersPage(1);
  }, [orderSearchCode, orderSearchAnimal, orderSearchTutor, orderSearchClinic, orderStatusFilter]);

  useEffect(() => {
    setCollectionsPage(1);
  }, [collectionSearch, collectionStatusFilter]);

  useEffect(() => {
    setExamsPage(1);
  }, [examSearchQuery, examSectionFilter]);

  useEffect(() => {
    let cancelled = false;
    api
      .getExamsPaginated({
        page: examsPage,
        limit: 12,
        search: examSearchQuery,
        section: examSectionFilter,
      })
      .then((res) => {
        if (!cancelled) {
          const safeItems = Array.isArray(res?.items) ? res.items : [];
          setPagedExams(safeItems);
          setPagedExamsTotal(
            Number.isFinite(Number(res?.total)) ? Math.max(0, Number(res.total)) : safeItems.length
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          const q = examSearchQuery.trim().toLowerCase();
          const filtered = exams.filter((ex) => {
            const matchesSec = examSectionFilter === 'todos' || ex.section === examSectionFilter;
            const matchesQ =
              !q ||
              ex.code.toLowerCase().includes(q) ||
              ex.name.toLowerCase().includes(q) ||
              (ex.section || '').toLowerCase().includes(q);
            return matchesSec && matchesQ;
          });
          setPagedExamsTotal(filtered.length);
          setPagedExams(filtered.slice((examsPage - 1) * 12, examsPage * 12));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [examsPage, examSearchQuery, examSectionFilter, exams]);

  useEffect(() => {
    setPriceRowsPage(1);
  }, [editingPriceTableId]);

  useEffect(() => {
    setUsersPage(1);
  }, [userSearch]);

  useEffect(() => {
    setVetsPage(1);
  }, [vetSearch]);

  useEffect(() => {
    setLaunchPage(1);
  }, [launchStatusFilter, launchSearch]);

  const getOrderResultMeta = (r: NonNullable<Order['results']>[number]) => {
    const catalogExam = exams.find((e) => e.id === r.exam_id);
    const code = r.exam_code || r.exam?.code || catalogExam?.code || 'EXM';
    const name = r.exam_name || r.exam?.name || catalogExam?.name || 'Exame Laboratorial';
    const isReleased = Boolean(r.released_at);
    const hasDraft = Boolean(
      (r.dynamic_content && Object.keys(r.dynamic_content).length > 0) ||
      (r.notes && r.notes.trim())
    );
    return { code, name, isReleased, hasDraft };
  };

  const resolveOrderVet = (ord: Order): Vet | undefined => {
    const fromList = vets.find((v) => v.id === ord.vet_id);
    if (ord.vet && fromList) {
      return {
        ...fromList,
        ...ord.vet,
        name: ord.vet.name || fromList.name,
        phone: ord.vet.phone || fromList.phone,
        email: ord.vet.email || fromList.email,
      };
    }
    return ord.vet || fromList;
  };

  const formatVetGreeting = (vet?: Vet): string => {
    const name = vet?.name?.trim();
    if (!name) return 'Olá, Dr(a).!';
    if (/^dr(a)?\.?\s/i.test(name)) return `Olá, ${name}!`;
    return `Olá, Dr(a). ${name}!`;
  };

  const publishOrderForSharing = async (ord: Order) => {
    const published = await api.publishOrderPdf(ord);
    const pdfLink = published.pdf_url;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === ord.id
          ? {
            ...o,
            pdf_url: pdfLink,
            results: (o.results || []).map((r) => {
              const found = published.exam_pdfs.find((ep) => ep.result_id === r.id);
              return found ? { ...r, pdf_url: found.pdf_url } : r;
            }),
          }
          : o
      )
    );

    const attachmentLinks = Array.from(
      new Map(
        (ord.results || [])
          .flatMap((r) => r.attachments || [])
          .filter((att) => att?.url && /^https?:\/\//i.test(att.url))
          .map((att) => [att.url, att])
      ).values()
    );

    return { pdfLink, attachmentLinks };
  };

  const buildOrderShareMessage = (
    ord: Order,
    targetVet: Vet | undefined,
    pdfLink: string,
    attachmentLinks: ExamAttachment[],
    useMarkdownBold: boolean
  ): string => {
    const b = (text: string) => (useMarkdownBold ? `*${text}*` : text);
    const examNames = (ord.results || [])
      .map((r) => getOrderResultMeta(r).name)
      .join(', ');
    const patientSpecies = ord.patient?.species ? ` (${ord.patient.species})` : '';
    const lines = [
      `${formatVetGreeting(targetVet)} Segue o link oficial do laudo laboratorial do atendimento ${b(ord.protocol_code)}.`,
      `Paciente: ${b(ord.patient?.name || 'Pet')}${patientSpecies}`,
      ord.patient?.tutor_name ? `Tutor: ${ord.patient.tutor_name}` : '',
      examNames ? `Exames incluídos: ${examNames}` : '',
      '',
      'Baixar Laudo em PDF:',
      pdfLink,
    ];

    if (attachmentLinks.length > 0) {
      lines.push('', 'Arquivos / Anexos Complementares:');
      attachmentLinks.forEach((att) => {
        lines.push(`- ${att.name}: ${att.url}`);
      });
    }

    return lines.filter((line) => line !== undefined && line !== null).join('\n');
  };

  const handleSendOrderWhatsApp = async (ord: Order) => {
    // Regra de negócio: envio de laudos, arquivos e mensagens é SEMPRE para o veterinário, nunca para o tutor.
    const targetVet = resolveOrderVet(ord);
    const rawPhone = (targetVet?.phone || '').trim();
    const digits = rawPhone.replace(/\D/g, '');
    const waNumber =
      digits.length >= 10 && !digits.startsWith('55') ? `55${digits}` : digits;

    if (!waNumber) {
      const vetLabel = targetVet?.name || 'veterinário solicitante';
      showToast(
        `O ${vetLabel} não possui telefone/WhatsApp cadastrado. Cadastre o WhatsApp do veterinário para enviar o laudo.`
      );
      return;
    }

    showToast('Gerando e salvando PDF online para envio no WhatsApp do veterinário...');
    const { pdfLink, attachmentLinks } = await publishOrderForSharing(ord);
    const message = buildOrderShareMessage(ord, targetVet, pdfLink, attachmentLinks, true);

    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    showToast(
      `PDF salvo online e WhatsApp aberto para o veterinário (${targetVet?.name || rawPhone})!`
    );
  };

  const handleSendOrderEmail = async (ord: Order) => {
    // Regra de negócio: envio de laudos, arquivos e mensagens é SEMPRE para o veterinário, nunca para o tutor.
    const targetVet = resolveOrderVet(ord);
    const vetEmail = (targetVet?.email || '').trim();

    if (!vetEmail) {
      const vetLabel = targetVet?.name || 'veterinário solicitante';
      showToast(
        `O ${vetLabel} não possui e-mail cadastrado. Cadastre o e-mail do veterinário para enviar o laudo.`
      );
      return;
    }

    showToast('Gerando e salvando PDF online para envio por e-mail ao veterinário...');
    const { pdfLink, attachmentLinks } = await publishOrderForSharing(ord);
    const subject = `Laudo Laboratorial VetLife — Protocolo ${ord.protocol_code} (${ord.patient?.name || 'Paciente'})`;
    const body = buildOrderShareMessage(ord, targetVet, pdfLink, attachmentLinks, false);

    const mailtoUrl = `mailto:${encodeURIComponent(vetEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    showToast(`PDF salvo online e e-mail preparado para o veterinário (${vetEmail})!`);
  };

  const renderOrderExamsDropdown = (ord: Order, scopeKey: string) => {
    const results = ord.results || [];
    const isOpen = openOrderExamsKey === scopeKey;
    const previewCodes = results
      .slice(0, 2)
      .map((r) => getOrderResultMeta(r).code)
      .join(', ');

    return (
      <div className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setOpenOrderExamsKey(isOpen ? null : scopeKey)}
          className="px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition cursor-pointer"
        >
          <span>
            {results.length} exame{results.length === 1 ? '' : 's'}
          </span>
          {previewCodes && (
            <span className="font-mono text-[#0071e3] text-[10px]">
              ({previewCodes}
              {results.length > 2 ? '…' : ''})
            </span>
          )}
          <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-1.5 w-72 rounded-2xl bg-white shadow-xl border border-black/10 p-2 z-40 space-y-1">
            <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#86868b] flex items-center justify-between">
              <span>Exames do Protocolo</span>
              <button
                type="button"
                onClick={() => setOpenOrderExamsKey(null)}
                className="text-[#86868b] hover:text-[#1d1d1f]"
              >
                Fechar
              </button>
            </div>
            {results.length === 0 ? (
              <div className="px-2.5 py-2 text-[11px] text-[#707070]">
                Nenhum exame vinculado.
              </div>
            ) : (
              results.map((res) => {
                const meta = getOrderResultMeta(res);
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => {
                      setOpenOrderExamsKey(null);
                      pushNavSnapshot();
                      setSelectedOrderId(ord.id);
                      setSelectedResultId(res.id);
                      setLaunchSubView('editor');
                      setActiveTab('launch');
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-[#f5f5f7] transition flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-[#1d1d1f] truncate">
                        <span className="font-mono text-[#0071e3] mr-1.5">[{meta.code}]</span>
                        {meta.name}
                      </div>
                      <div className="text-[10px] text-[#707070]">
                        {meta.isReleased
                          ? 'Laudo concluído • Editar'
                          : meta.hasDraft
                            ? 'Em análise • Editar rascunho'
                            : 'Pendente • Lançar laudo'}
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-semibold shrink-0 ${meta.isReleased
                        ? 'bg-emerald-100 text-emerald-800'
                        : meta.hasDraft
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-200 text-slate-700'
                        }`}
                    >
                      {meta.isReleased ? 'Concluído' : meta.hasDraft ? 'Editar' : 'Lançar'}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  const resetOrderForm = () => {
    const today = getTodayIsoDate();
    const defaultTableId = resolveFirstActivePriceTableId(priceTables, today);
    setEditingOrderId(null);
    setConvertingCollection(null);
    setConvertingVetMatched(false);
    setRoutinePatientMode('existing');
    setRoutineSelectedPatientId('');
    setSelectedVetId('');
    setSelectedTableId(defaultTableId);
    setSelectedExamIds([]);
    setOrderDate(today);
    setOrderNotes('');
    setPatientForm(createEmptyPatientForm());
    setOrderModalResetKey((k) => k + 1);
  };

  const handleOpenNewOrder = (options?: {
    patientId?: string;
    switchToRoutineTab?: boolean;
  }) => {
    resetOrderForm();
    if (options?.patientId) {
      setRoutinePatientMode('existing');
      setRoutineSelectedPatientId(options.patientId);
    }
    if (options?.switchToRoutineTab) {
      setRoutineSubTab('list');
      setActiveTab('routine');
    }
    setOrderModalOpen(true);
  };

  const handleCloseOrderModal = () => {
    setOrderModalOpen(false);
    resetOrderForm();
  };

  const resetPatientModal = () => {
    const defaultTableId = resolveFirstActivePriceTableId(priceTables, getTodayIsoDate());
    setEditingPatientId(null);
    setPatientIncludeExamOrder(false);
    setPatientSelectedExamIds([]);
    setPatientOrderVetId('');
    setPatientOrderTableId(defaultTableId);
    setPatientOrderNotes('');
    setPatientCrudForm(createEmptyPatientCrudForm());
    setPatientOrderModalKey((k) => k + 1);
  };

  const handleClosePatientModal = () => {
    setPatientModalOpen(false);
    resetPatientModal();
  };

  const handleStartEditOrder = (ord: Order) => {
    setOpenOrderExamsKey(null);
    resetOrderForm();
    setEditingOrderId(ord.id);
    setRoutinePatientMode('existing');
    setRoutineSelectedPatientId(ord.patient_id || ord.patient?.id || '');
    if (ord.vet_id || ord.vet?.id) {
      setSelectedVetId(ord.vet_id || ord.vet?.id || '');
    }
    if (ord.price_table_id) {
      setSelectedTableId(ord.price_table_id);
    }
    setSelectedExamIds((ord.results || []).map((r) => r.exam_id));
    if (ord.created_at) {
      setOrderDate(ord.created_at.slice(0, 10));
    }
    setOrderNotes(ord.notes || '');
    setOrderModalOpen(true);
    showToast(`Editando atendimento ${ord.protocol_code}`);
  };

  const handleConvertCollectionToOrder = (col: CollectionRequest) => {
    const cleanDigits = (s?: string) => (s || '').replace(/\D/g, '');
    const colDigits = cleanDigits(col.phone);
    const colEmail = (col.email || '').trim().toLowerCase();
    const colName = (col.clinic_or_tutor_name || '').trim().toLowerCase();

    const matchedVet = vets.find((v) => {
      if (colEmail && v.email.toLowerCase() === colEmail) return true;
      const vDigits = cleanDigits(v.phone);
      if (
        colDigits.length >= 8 &&
        vDigits.length >= 8 &&
        vDigits.slice(-8) === colDigits.slice(-8)
      ) {
        return true;
      }
      if (v.clinic_name && colName.includes(v.clinic_name.trim().toLowerCase())) {
        return true;
      }
      return false;
    });

    resetOrderForm();
    if (matchedVet) {
      setSelectedVetId(matchedVet.id);
      setConvertingVetMatched(true);
    } else {
      setConvertingVetMatched(false);
    }
    if (col.scheduled_date || col.preferred_date) {
      setOrderDate(col.scheduled_date || col.preferred_date!);
    }
    setOrderNotes(
      `[Coleta: ${col.clinic_or_tutor_name} | Tel: ${col.phone} | End: ${col.address}] ${col.notes || ''}`.trim()
    );
    setConvertingCollection(col);
    setOrderModalOpen(true);
    showToast(
      matchedVet
        ? `Solicitação carregada e vinculada a ${matchedVet.name}!`
        : `Solicitação de ${col.clinic_or_tutor_name} carregada! Você pode cadastrar a clínica/veterinário agora ou selecionar um existente.`
    );
  };

  const renderOrderQuickActions = (ord: Order, compact = false) => {
    const pad = compact ? 'px-2.5 py-1 text-[11px]' : 'px-2.5 py-1.5 text-[11px]';
    const iconSize = 'w-3 h-3';

    const labelsBtn = (
      <button
        type="button"
        onClick={async () => {
          const lbls = await api.getOrderLabels(ord);
          setLabelsModal({ order: ord, labels: lbls });
        }}
        className={`${pad} rounded-[980px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] inline-flex items-center gap-1 whitespace-nowrap cursor-pointer`}
      >
        <Barcode className={iconSize} />
        Etiquetas
      </button>
    );

    const editOrderBtn = (
      <button
        type="button"
        onClick={() => handleStartEditOrder(ord)}
        title="Editar dados e exames deste atendimento"
        className={`${pad} rounded-[980px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] font-semibold transition inline-flex items-center gap-1 whitespace-nowrap cursor-pointer`}
      >
        <Pencil className={iconSize} />
        Editar
      </button>
    );

    if (ord.status === 'concluido') {
      return (
        <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
          <button
            type="button"
            onClick={() => downloadOrderPdf(ord)}
            title="Baixar PDF completo"
            className={`${pad} rounded-[980px] border border-[#1d1d1f] text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white transition inline-flex items-center gap-1 font-semibold whitespace-nowrap cursor-pointer`}
          >
            <FileDown className={iconSize} />
            PDF
          </button>
          <button
            type="button"
            onClick={() => handleSendOrderWhatsApp(ord)}
            title="Enviar laudo por WhatsApp para o veterinário"
            className={`${pad} rounded-[980px] bg-emerald-600 hover:bg-emerald-700 text-white transition inline-flex items-center gap-1 font-semibold whitespace-nowrap cursor-pointer`}
          >
            <MessageCircle className={iconSize} />
            WhatsApp
          </button>
          <button
            type="button"
            onClick={() => handleSendOrderEmail(ord)}
            title="Enviar laudo por e-mail para o veterinário"
            className={`${pad} rounded-[980px] bg-[#0071e3] hover:bg-[#0062c4] text-white transition inline-flex items-center gap-1 font-semibold whitespace-nowrap cursor-pointer`}
          >
            <Mail className={iconSize} />
            E-mail
          </button>
          {editOrderBtn}
        </div>
      );
    }

    return (
      <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
        {labelsBtn}
        {editOrderBtn}
      </div>
    );
  };

  const loadAllData = async () => {
    const isAdminUser = user?.role === 'admin';
    const [exList, ptList, refList, tplList, vetList, patList, ordList, opData, finData] = await Promise.all([
      api.getExams(),
      isAdminUser ? api.getPriceTables().catch(() => []) : Promise.resolve([]),
      api.getExamReferences(),
      api.getReportTemplates(),
      api.getVets(),
      api.getPatients(),
      api.getOrders(),
      api.getOperationalDashboard(),
      isAdminUser ? api.getFinancialDashboard().catch(() => null) : Promise.resolve(null),
    ]);
    setExams(exList);
    setPriceTables(ptList);
    if (ptList.length > 0) {
      const initialActiveId = resolveFirstActivePriceTableId(ptList, orderDate || getTodayIsoDate());
      setSelectedTableId((prev) => prev || initialActiveId);
      setPatientOrderTableId((prev) => prev || initialActiveId);
    }
    setReferences(refList);
    setTemplates(tplList);
    setVets(vetList);
    setPatients(patList);
    setOrders(ordList);
    setOpStats(opData);
    setFinStats(finData);
    if (!editingTemplate && tplList.length > 0) {
      setEditingTemplate(tplList[0]);
    }
    if (user?.role === 'admin') {
      try {
        const uList = await api.getUsers();
        setLabUsers(uList);
      } catch {
        // ignore if restricted
      }
      try {
        const invList = await api.getInvoices();
        setInvoices(invList);
      } catch {
        // ignore if restricted
      }
    }
    try {
      const colList = await api.getCollectionRequests();
      setCollectionRequests(colList);
    } catch {
      // ignore if unavailable
    }
  };

  useEffect(() => {
    if (user) {
      loadAllData();
    }
  }, [user]);

  const currentOrder = orders.find((o) => o.id === selectedOrderId) || orders[0];
  useEffect(() => {
    if (currentOrder && currentOrder.results && currentOrder.results.length > 0) {
      const exists = currentOrder.results.some((r) => r.id === selectedResultId);
      const target = exists
        ? currentOrder.results.find((r) => r.id === selectedResultId)!
        : currentOrder.results[0];
      setSelectedResultId(target.id);
      setDynamicValues(target.dynamic_content || {});
      setAttachments(target.attachments || []);
    }
  }, [selectedOrderId, orders]);

  const handleSelectResultItem = (resId: string) => {
    setSelectedResultId(resId);
    const item = currentOrder?.results?.find((r) => r.id === resId);
    if (item) {
      setDynamicValues(item.dynamic_content || {});
      setAttachments(item.attachments || []);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await api.loginInternal(loginEmail, loginPassword);
      setUser(res.user);
      if (res.user.role === 'biomedical' && (activeTab === 'settings' || activeTab === 'financial')) {
        setActiveTab('operational');
      }
    } catch (err: any) {
      const msg =
        err?.message && err.message !== '[object Object]'
          ? err.message
          : null;
      setLoginError(msg || 'Não foi possível autenticar. Verifique seu e-mail e senha.');
    }
  };

  if (!user || !api.hasValidSession('internal')) {
    return null;
  }

  const effectiveOrderDate = orderDate || getTodayIsoDate();
  const validTablesForDate = priceTables.filter(
    (pt) =>
      pt.is_active &&
      pt.start_date <= effectiveOrderDate &&
      pt.end_date >= effectiveOrderDate
  );
  const defaultActivePriceTable =
    validTablesForDate[0] || priceTables.find((pt) => pt.is_active) || priceTables[0] || null;
  const effectiveOrderPriceTable =
    priceTables.find((pt) => pt.id === selectedTableId) || defaultActivePriceTable;
  const effectivePatientPriceTable =
    priceTables.find((pt) => pt.id === patientOrderTableId) || defaultActivePriceTable;

  const getExamPriceInTable = (
    examId: string,
    table: PriceTable | null = effectiveOrderPriceTable
  ): number => {
    const ex = exams.find((e) => e.id === examId);
    if (!ex) return 0;
    const entry = (table?.prices || table?.items || []).find((p) => p.exam_id === examId);
    if (entry) return Number(entry.price) || 0;
    return Number(ex.price ?? ex.base_price ?? 0) || 0;
  };

  const validSelectedExamIds = selectedExamIds.filter((id) =>
    exams.some((e) => e.id === id)
  );
  const validPatientSelectedExamIds = patientSelectedExamIds.filter((id) =>
    exams.some((e) => e.id === id)
  );

  const calculatedOrderTotal = validSelectedExamIds.reduce(
    (sum, id) => sum + getExamPriceInTable(id, effectiveOrderPriceTable),
    0
  );

  const calculatedPatientOrderTotal = validPatientSelectedExamIds.reduce(
    (sum, id) => sum + getExamPriceInTable(id, effectivePatientPriceTable),
    0
  );

  const handleSavePatientCrud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !patientCrudForm.species ||
      (patientCrudForm.gender !== 'M' && patientCrudForm.gender !== 'F')
    ) {
      showToast('Selecione espécie e sexo do paciente.');
      return;
    }
    const hasYears =
      patientCrudForm.age_years !== '' && !Number.isNaN(Number(patientCrudForm.age_years));
    const hasMonths =
      patientCrudForm.age_months !== '' && !Number.isNaN(Number(patientCrudForm.age_months));
    const safeYears = hasYears ? Math.max(0, Math.floor(Number(patientCrudForm.age_years))) : 0;
    const safeMonths = hasMonths ? Math.max(0, Math.floor(Number(patientCrudForm.age_months))) : 0;
    const totalMonths = safeYears * 12 + safeMonths;

    if (!hasYears && !hasMonths && !patientCrudForm.birth_date) {
      showToast('Informe a idade em anos/meses (ou a data de nascimento para cálculo automático).');
      return;
    }
    if (patientIncludeExamOrder) {
      if (!patientOrderVetId || !vets.some((v) => v.id === patientOrderVetId)) {
        showToast('Selecione o veterinário solicitante para o atendimento.');
        return;
      }
      if (validPatientSelectedExamIds.length === 0) {
        showToast('Selecione pelo menos 1 exame ou desmarque a opção de pedido de exames.');
        return;
      }
    }

    const computedDays =
      patientCrudForm.birth_date
        ? calculatePatientAgeDays(patientCrudForm.birth_date)
        : calculateAgeDaysFromYearsMonths(safeYears, safeMonths);
    const savedPatient = await api.savePatient({
      ...(editingPatientId ? { id: editingPatientId } : {}),
      name: patientCrudForm.name.trim(),
      species: patientCrudForm.species,
      breed: patientCrudForm.breed.trim() || 'SRD',
      gender: patientCrudForm.gender,
      birth_date: patientCrudForm.birth_date || calculateBirthDateFromAgeMonths(totalMonths),
      age_days: computedDays,
      tutor_name: patientCrudForm.tutor_name.trim(),
      tutor_phone: patientCrudForm.tutor_phone.trim(),
      tutor_email: patientCrudForm.tutor_email.trim(),
    });

    if (patientIncludeExamOrder && validPatientSelectedExamIds.length > 0) {
      const createdOrder = await api.createOrder({
        patient: savedPatient,
        vet_id: patientOrderVetId,
        price_table_id: effectivePatientPriceTable?.id || '',
        exam_ids: validPatientSelectedExamIds,
        order_date: getTodayIsoDate(),
        notes: patientOrderNotes.trim(),
      });
      const labels = await api.getOrderLabels(createdOrder);
      setLabelsModal({ order: createdOrder, labels });
      showToast(
        `Paciente "${savedPatient.name}" salvo e atendimento ${createdOrder.protocol_code} gerado!`
      );
    } else {
      showToast(
        editingPatientId
          ? `Paciente "${savedPatient.name}" atualizado com sucesso!`
          : `Paciente "${savedPatient.name}" cadastrado com sucesso!`
      );
    }

    await loadAllData();
    handleClosePatientModal();
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    const existingPatient =
      routinePatientMode === 'existing'
        ? patients.find((p) => p.id === routineSelectedPatientId)
        : undefined;

    if (routinePatientMode === 'existing' && !existingPatient) {
      showToast('Selecione um paciente cadastrado ou altere para "+ Novo".');
      return;
    }

    if (routinePatientMode === 'new') {
      if (
        !patientForm.name.trim() ||
        !patientForm.species ||
        (patientForm.gender !== 'M' && patientForm.gender !== 'F') ||
        !patientForm.tutor_name.trim()
      ) {
        showToast('Preencha animal, espécie, sexo e tutor do novo paciente.');
        return;
      }
    }

    if (!selectedVetId || !vets.some((v) => v.id === selectedVetId)) {
      showToast('Selecione o veterinário solicitante.');
      return;
    }

    if (validSelectedExamIds.length === 0) {
      showToast('Selecione pelo menos 1 exame para o atendimento.');
      return;
    }

    const hasAgeYears =
      patientForm.age_years !== '' && !Number.isNaN(Number(patientForm.age_years));
    const hasAgeMonths =
      patientForm.age_months !== '' && !Number.isNaN(Number(patientForm.age_months));
    const safeOrderYears = hasAgeYears ? Math.max(0, Math.floor(Number(patientForm.age_years))) : 0;
    const safeOrderMonths = hasAgeMonths ? Math.max(0, Math.floor(Number(patientForm.age_months))) : 0;
    const numericAgeMonths =
      hasAgeYears || hasAgeMonths ? safeOrderYears * 12 + safeOrderMonths : undefined;
    const resolvedBirthDate =
      patientForm.birth_date ||
      (numericAgeMonths !== undefined ? calculateBirthDateFromAgeMonths(numericAgeMonths) : '');
    const resolvedAgeDays =
      hasAgeYears || hasAgeMonths
        ? calculateAgeDaysFromYearsMonths(safeOrderYears, safeOrderMonths)
        : undefined;

    const newPatientPayload: Omit<Patient, 'id'> = {
      name: patientForm.name.trim(),
      species: patientForm.species,
      breed: patientForm.breed.trim() || 'SRD',
      gender: (patientForm.gender === 'F' ? 'F' : 'M') as 'M' | 'F',
      birth_date: resolvedBirthDate,
      ...(resolvedAgeDays !== undefined ? { age_days: resolvedAgeDays } : {}),
      tutor_name: patientForm.tutor_name.trim(),
      tutor_phone: patientForm.tutor_phone.trim(),
      tutor_email: patientForm.tutor_email.trim(),
    };

    const resolvedOrderDate = orderDate || getTodayIsoDate();
    const resolvedPriceTableId = effectiveOrderPriceTable?.id || '';
    const trimmedNotes = orderNotes.trim();

    if (editingOrderId) {
      const targetPatient = existingPatient || (await api.savePatient(newPatientPayload));
      await api.updateOrder(editingOrderId, {
        patient_id: targetPatient.id,
        patient: targetPatient,
        vet_id: selectedVetId,
        price_table_id: resolvedPriceTableId,
        exam_ids: validSelectedExamIds,
        order_date: resolvedOrderDate,
        notes: trimmedNotes,
      });
      await loadAllData();
      handleCloseOrderModal();
      setRoutineSubTab('list');
      showToast('Atendimento atualizado com sucesso!');
      return;
    }

    const created = await api.createOrder({
      patient: existingPatient || newPatientPayload,
      vet_id: selectedVetId,
      price_table_id: resolvedPriceTableId,
      exam_ids: validSelectedExamIds,
      order_date: resolvedOrderDate,
      notes: trimmedNotes,
    });

    if (convertingCollection?.id) {
      try {
        await api.updateCollectionRequestStatus(convertingCollection.id, 'concluida');
      } catch {
        // ignore
      }
    }

    const labels = await api.getOrderLabels(created);
    await loadAllData();
    setLabelsModal({ order: created, labels });
    handleCloseOrderModal();
    setRoutineSubTab('list');
    showToast(
      `Atendimento ${created.protocol_code} registrado com sucesso! Etiquetas de coleta geradas.`
    );
  };

  const currentResultItem = currentOrder?.results?.find((r) => r.id === selectedResultId);
  const currentExamMeta =
    exams.find((e) => e.id === currentResultItem?.exam_id) || currentResultItem?.exam;
  const dynamicFieldsToRender: ExamInputField[] =
    (currentExamMeta?.input_fields && currentExamMeta.input_fields.length > 0
      ? currentExamMeta.input_fields
      : currentResultItem?.input_fields) || [];

  const matchedRefForCurrentResult = currentOrder
    ? resolveReferenceForPatient(
      references,
      currentResultItem?.exam_id || 'exam-hemo-01',
      currentOrder.patient?.species || 'Canino',
      currentOrder.patient?.gender || 'M',
      calculatePatientAgeDays(currentOrder.patient?.birth_date, currentOrder.patient?.age_days)
    )
    : null;

  const handleSaveResultDraft = async () => {
    if (!currentOrder || !currentResultItem) return;
    await api.saveExamResult(currentOrder.id, currentResultItem.id, {
      dynamic_content: dynamicValues,
      attachments,
      reference_snapshot:
        matchedRefForCurrentResult?.reference_text_content ||
        currentResultItem.reference_snapshot,
    });
    await loadAllData();
    showToast(`Parâmetros de ${currentResultItem.exam_code} salvos com sucesso!`);
  };

  const handleReleaseReport = async (options?: { advanceToNext?: boolean }) => {
    if (!currentOrder) return;
    const currentId = currentResultItem?.id;
    if (currentResultItem) {
      await api.saveExamResult(currentOrder.id, currentResultItem.id, {
        dynamic_content: dynamicValues,
        attachments,
        reference_snapshot:
          matchedRefForCurrentResult?.reference_text_content ||
          currentResultItem.reference_snapshot,
      });
    }
    const released = await api.releaseOrderReport(
      currentOrder.id,
      selectedTemplateId,
      currentId
    );
    await loadAllData();

    const releasedResults = released.results || [];
    const nextPending = releasedResults.find(
      (r) => r.id !== currentId && !r.released_at
    );

    if (options?.advanceToNext && nextPending) {
      setSelectedOrderId(released.id);
      setSelectedResultId(nextPending.id);
      setDynamicValues(nextPending.dynamic_content || {});
      setAttachments(nextPending.attachments || []);
      const nextMeta = getOrderResultMeta(nextPending);
      const remainingCount = releasedResults.filter((r) => !r.released_at).length;
      showToast(
        `Exame concluído! Carregado próximo exame: [${nextMeta.code}] ${nextMeta.name} (${remainingCount} restante${remainingCount > 1 ? 's' : ''}).`
      );
      return;
    }

    showToast(
      released.status === 'concluido'
        ? `Todos os exames finalizados! Atendimento ${released.protocol_code} concluído e laudo liberado.`
        : `Exame liberado! O atendimento ${released.protocol_code} segue Em Análise até todos os exames serem concluídos.`
    );
    if (navHistory.length > 0) {
      handleGoBack();
    } else {
      setLaunchSubView('list');
    }
  };

  const handleFileUploadAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const added: ExamAttachment = {
        id: `att-${Date.now()}`,
        name: file.name,
        type: file.type.includes('pdf') ? 'pdf' : 'image',
        url: typeof reader.result === 'string' ? reader.result : '#',
        uploaded_at: new Date().toISOString(),
      };
      setAttachments((prev) => [...prev, added]);
      showToast(`Arquivo complementar "${file.name}" anexado ao laudo.`);
    };
    reader.readAsDataURL(file);
  };

  const handleStartEditExam = (ex: Exam) => {
    const resolvedPrice = ex.price ?? ex.base_price ?? getExamPriceInTable(ex.id);
    const days = Number(ex.delivery_days) || 1;
    const resolvedTemplates =
      Array.isArray(ex.label_templates) && ex.label_templates.length > 0
        ? ex.label_templates.map((lt) => ({
            tube_type: lt.tube_type,
            label_qty: Math.max(1, Number(lt.label_qty) || 1),
          }))
        : parseTubeTypeToLabelTemplates(
            ex.tube_type || ex.material || 'Tubo EDTA (Tampa Roxa)',
            ex.label_qty
          ).map((lt) => ({
            tube_type: lt.tube_type,
            label_qty: Math.max(1, Number(lt.label_qty) || 1),
          }));

    const combinedTube =
      resolvedTemplates.map((lt) => lt.tube_type).join(' + ') || 'Tubo EDTA (Tampa Roxa)';
    const totalLabels =
      resolvedTemplates.reduce((acc, lt) => acc + (Number(lt.label_qty) || 1), 0) || 1;

    setEditingExamId(ex.id);
    setNewExamForm({
      code: ex.code,
      name: ex.name,
      section: ex.section || 'Bioquímica',
      delivery_days: days,
      delivery_time_label:
        ex.delivery_time_label || (days === 1 ? '1 dia útil' : `${days} dias úteis`),
      tube_type: combinedTube,
      label_qty: totalLabels,
      label_templates: resolvedTemplates,
      base_price: Number(resolvedPrice) || 75,
    });
    const perTable: Record<string, number> = {};
    priceTables.forEach((pt) => {
      const entry = (pt.prices || pt.items || []).find(
        (p) => p.exam_id === ex.id || p.exam_code === ex.code
      );
      perTable[pt.id] = entry ? Number(entry.price) : Number(resolvedPrice) || 75;
    });
    setExamTablePrices(perTable);
    setExamModalOpen(true);
  };

  const handleOpenNewExamModal = () => {
    handleCancelEditExam();
    setExamModalOpen(true);
  };

  const handleCancelEditExam = () => {
    setEditingExamId(null);
    setExamModalOpen(false);
    setNewExamForm({
      code: '',
      name: '',
      section: 'Bioquímica',
      delivery_days: 1,
      delivery_time_label: '1 dia útil',
      tube_type: 'Tubo EDTA (Tampa Roxa)',
      label_qty: 1,
      label_templates: [{ tube_type: 'Tubo EDTA (Tampa Roxa)', label_qty: 1 }],
      base_price: 85,
    });
    setExamTablePrices({});
  };

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = Math.max(1, Number(newExamForm.delivery_days) || 1);
    const label =
      newExamForm.delivery_time_label?.trim() ||
      (days === 1 ? '1 dia útil' : `${days} dias úteis`);
    const priceValue = Number(newExamForm.base_price) || 0;
    const mergedTablePrices: Record<string, number> = {};
    priceTables.forEach((pt) => {
      mergedTablePrices[pt.id] =
        examTablePrices[pt.id] !== undefined ? Number(examTablePrices[pt.id]) : priceValue;
    });

    const validTemplates = (newExamForm.label_templates || [])
      .filter((lt) => lt && typeof lt.tube_type === 'string' && lt.tube_type.trim().length > 0)
      .map((lt, idx) => ({
        tube_type: lt.tube_type.trim(),
        label_qty: Math.max(1, Number(lt.label_qty) || 1),
        display_order: idx + 1,
      }));

    const finalTemplates =
      validTemplates.length > 0
        ? validTemplates
        : [
            {
              tube_type: newExamForm.tube_type?.trim() || 'Tubo EDTA (Tampa Roxa)',
              label_qty: Math.max(1, Number(newExamForm.label_qty) || 1),
              display_order: 1,
            },
          ];

    const combinedTube = finalTemplates.map((lt) => lt.tube_type).join(' + ');
    const totalLabelQty = finalTemplates.reduce((acc, lt) => acc + lt.label_qty, 0);

    if (editingExamId) {
      const existing = exams.find((item) => item.id === editingExamId);
      await api.saveExam(
        {
          ...existing,
          id: editingExamId,
          code: newExamForm.code,
          name: newExamForm.name,
          section: newExamForm.section,
          delivery_days: days,
          delivery_time_label: label,
          tube_type: combinedTube,
          material: combinedTube,
          label_qty: totalLabelQty,
          label_templates: finalTemplates,
          base_price: priceValue,
          price: priceValue,
        },
        mergedTablePrices
      );
      await loadAllData();
      handleCancelEditExam();
      showToast(
        `Exame ${newExamForm.code} atualizado (${finalTemplates.length} tipo(s) de tubo / ${totalLabelQty} etiqueta(s))!`
      );
      return;
    }

    await api.saveExam(
      {
        ...newExamForm,
        delivery_days: days,
        delivery_time_label: label,
        tube_type: combinedTube,
        material: combinedTube,
        label_qty: totalLabelQty,
        label_templates: finalTemplates,
        base_price: priceValue,
        price: priceValue,
        input_fields: [
          {
            id: `fld-${Date.now()}`,
            exam_id: '',
            field_name: 'resultado_principal',
            field_label: 'Resultado Analítico Principal',
            field_type: 'text',
            is_required: true,
          },
        ],
      },
      mergedTablePrices
    );
    await loadAllData();
    handleCancelEditExam();
    showToast(
      `Novo exame ${newExamForm.code} cadastrado (${finalTemplates.length} tipo(s) de tubo / ${totalLabelQty} etiqueta(s))!`
    );
  };

  const handleAddDynamicField = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetExam = exams.find((ex) => ex.id === configExamIdForFields);
    if (!targetExam) return;
    const newField: ExamInputField = {
      id: `fld-${Date.now()}`,
      exam_id: targetExam.id,
      field_name:
        newFieldForm.field_name.trim().toLowerCase().replace(/\s+/g, '_') ||
        `campo_${Date.now()}`,
      field_label: newFieldForm.field_label || newFieldForm.field_name,
      field_type: newFieldForm.field_type,
      unit: newFieldForm.unit,
      options:
        newFieldForm.field_type === 'select'
          ? newFieldForm.options_csv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          : undefined,
      is_required: newFieldForm.is_required,
    };
    const nextFields = [...(targetExam.input_fields || []), newField];
    await api.saveExamFields(targetExam.id, nextFields);
    await loadAllData();
    setNewFieldForm({
      field_name: '',
      field_label: '',
      field_type: 'number',
      unit: '',
      options_csv: '',
      is_required: true,
    });
    setFieldModalOpen(false);
    showToast(`Campo dinâmico "${newField.field_label}" vinculado ao exame ${targetExam.code}!`);
  };

  const handleRemoveDynamicField = async (examId: string, fieldId: string) => {
    const targetExam = exams.find((ex) => ex.id === examId);
    if (!targetExam) return;
    const nextFields = (targetExam.input_fields || []).filter((f) => f.id !== fieldId);
    await api.saveExamFields(examId, nextFields);
    await loadAllData();
    showToast('Campo removido do exame.');
  };

  const handleApplyPercentageAdjustment = async () => {
    const target = priceTables.find((pt) => pt.id === editingPriceTableId);
    if (!target) return;
    await api.savePriceTable(target, adjustmentPercent);
    await loadAllData();
    showToast(
      `Reajuste de ${adjustmentPercent > 0 ? `+${adjustmentPercent}%` : `${adjustmentPercent}%`} aplicado na tabela "${target.name}"!`
    );
  };

  const handleCreatePriceTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const created = await api.savePriceTable({
      ...newPriceTableForm,
      is_active: true,
    });
    await loadAllData();
    setEditingPriceTableId(created.id);
    setNewPriceTableForm({
      name: '',
      partner_clinic: '',
      start_date: '2026-05-01',
      end_date: '2026-12-31',
    });
    setPriceTableModalOpen(false);
    showToast(`Nova Tabela de Preços "${created.name}" criada com vigência!`);
  };

  const handleAddReference = async (e: React.FormEvent) => {
    e.preventDefault();
    const stripped = newRefForm.reference_text_content.replace(/<[^>]+>/g, '').trim();
    if (!stripped) {
      showToast('Preencha o conteúdo e layout da referência antes de salvar.');
      return;
    }
    const ex = exams.find((item) => item.id === newRefForm.exam_id);
    await api.saveExamReference({
      ...(editingReferenceId ? { id: editingReferenceId } : {}),
      ...newRefForm,
      exam_name: ex?.name || 'Exame',
    });
    await loadAllData();
    setEditingReferenceId(null);
    setNewRefForm({ ...newRefForm, reference_text_content: '' });
    setReferenceModalOpen(false);
    showToast(
      editingReferenceId
        ? 'Layout e valores de referência atualizados!'
        : 'Valor de referência e layout salvos!'
    );
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTemplate) return;
    await api.saveReportTemplate(editingTemplate);
    await loadAllData();
    showToast(`Modelo de laudo "${editingTemplate.name}" salvo com sucesso!`);
  };

  const insertDynamicTag = (tag: string) => {
    if (!editingTemplate) return;
    setInsertTagRequest({ tag, nonce: Date.now() + Math.random() });
  };

  return (
    <div className="space-y-5 sm:space-y-6 py-4 sm:py-6 pb-20 sm:pb-24">
      {/* NOTIFICAÇÃO TOAST */}
      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 max-w-md bg-[#1d1d1f] text-[#f5f5f7] px-4 sm:px-5 py-3.5 rounded-[20px] sm:rounded-[980px] flex items-center gap-3 text-[12px] font-semibold shadow-lg">
          <CheckCircle2 className="w-4 h-4 text-[#0071e3] shrink-0" />
          <span className="break-words">{toast}</span>
        </div>
      )}

      {/* ASSISTENTE DE NAVEGAÇÃO (BREADCRUMB MÓDULO > SUBTELA > SUBTELA + BOTÃO VOLTAR) */}
      <div className="bg-white rounded-[20px] px-4 py-2.5 border border-black/5 flex flex-wrap items-center justify-between gap-2.5 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5 text-[#5b6675] min-w-0">
          <button
            type="button"
            onClick={handleGoBack}
            disabled={navHistory.length === 0 && activeTab === 'operational'}
            className={`px-3 py-1 rounded-full font-semibold inline-flex items-center gap-1.5 transition shrink-0 ${
              navHistory.length > 0 || (activeTab === 'launch' && launchSubView === 'editor') || activeTab !== 'operational'
                ? 'bg-[#0b2240] text-white hover:bg-[#13325b] cursor-pointer'
                : 'bg-[#f5f5f7] text-[#86868b] cursor-not-allowed'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
          </button>

          <span className="text-[#86868b] mx-1 hidden sm:inline">|</span>

          <button
            type="button"
            onClick={() => {
              if (activeTab !== 'operational') pushNavSnapshot();
              setActiveTab('operational');
            }}
            className="font-semibold text-[#0b2240] hover:text-[#0071e3] transition"
          >
            Painel Laboratorial
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-[#86868b] shrink-0" />

          <button
            type="button"
            onClick={() => {
              if (activeTab === 'launch' && launchSubView === 'editor') {
                setLaunchSubView('list');
              } else if (activeTab === 'routine' && routineSubTab !== 'list') {
                setRoutineSubTab('list');
              }
            }}
            className="font-semibold text-[#0b2240] hover:text-[#0071e3] transition"
          >
            {getTabLabel(activeTab)}
          </button>

          <ChevronRight className="w-3.5 h-3.5 text-[#86868b] shrink-0" />

          <span className="font-semibold text-[#0071e3]">
            {getSubScreenLabel(activeTab, routineSubTab, launchSubView, settingsTab)}
          </span>

          {activeTab === 'launch' && launchSubView === 'editor' && currentOrder && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
              <span className="font-mono font-bold text-[#1d1d1f]">
                {currentOrder.protocol_code} ({currentOrder.patient?.name})
              </span>
              {currentResultItem && (
                <>
                  <ChevronRight className="w-3.5 h-3.5 text-[#86868b] shrink-0" />
                  <span className="px-2 py-0.5 rounded-full bg-[#e8f2fd] text-[#0071e3] font-mono text-[11px] font-bold">
                    [{currentResultItem.exam_code || currentExamMeta?.code || 'EXM'}]
                  </span>
                </>
              )}
            </>
          )}
        </div>

        {navHistory.length > 0 && (
          <div className="text-[11px] text-[#707070] truncate max-w-xs">
            Anterior: <strong className="text-[#1d1d1f]">{navHistory[navHistory.length - 1].label}</strong>
          </div>
        )}
      </div>

      {/* =====================================================================
          ABA 1: DASHBOARD OPERACIONAL (ATALHOS RÁPIDOS + 70% ROTINA / 30% COLETAS PENDENTES)
         ===================================================================== */}
      {activeTab === 'operational' &&
        (() => {
          const pendingCollections = collectionRequests.filter(
            (c) => (c.status || 'pendente') === 'pendente'
          );
          const hasPendingCollections = pendingCollections.length > 0;

          return (
            <div className="space-y-4 sm:space-y-5">
              {/* ROW 1: ATALHOS RÁPIDOS DAS TELAS E AÇÕES MAIS USADAS */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3">
                <button
                  type="button"
                  onClick={() => handleOpenNewOrder()}
                  className="p-3.5 rounded-[20px] bg-[#0071e3] hover:bg-[#0062c4] text-white text-left transition flex items-center gap-3 shadow-xs cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-bold leading-tight truncate">
                      Novo Atendimento
                    </div>
                    <div className="text-[10.5px] text-white/80 truncate mt-0.5">
                      Registrar ordem
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    pushNavSnapshot();
                    resetPatientModal();
                    setActiveTab('patients');
                    setPatientModalOpen(true);
                  }}
                  className="p-3.5 rounded-[20px] bg-white hover:bg-[#f5f5f7] border border-black/5 text-left transition flex items-center gap-3 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#0b2240]/8 text-[#0b2240] flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-[#1d1d1f] leading-tight truncate">
                      Novo Paciente
                    </div>
                    <div className="text-[10.5px] text-[#707070] truncate mt-0.5">
                      Cadastrar animal
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    pushNavSnapshot();
                    setLaunchSubView('list');
                    setActiveTab('launch');
                  }}
                  className="p-3.5 rounded-[20px] bg-white hover:bg-[#f5f5f7] border border-black/5 text-left transition flex items-center gap-3 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center shrink-0">
                    <FlaskConical className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-[#1d1d1f] leading-tight truncate">
                      Lançar Laudos
                    </div>
                    <div className="text-[10.5px] text-[#707070] truncate mt-0.5">
                      Fila de bancada
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    pushNavSnapshot();
                    setRoutineSubTab('list');
                    setActiveTab('routine');
                  }}
                  className="p-3.5 rounded-[20px] bg-white hover:bg-[#f5f5f7] border border-black/5 text-left transition flex items-center gap-3 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-[#0071e3]/10 text-[#0071e3] flex items-center justify-center shrink-0">
                    <ClipboardPlus className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold text-[#1d1d1f] leading-tight truncate">
                      Atendimentos
                    </div>
                    <div className="text-[10.5px] text-[#707070] truncate mt-0.5">
                      Buscar protocolos
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    pushNavSnapshot();
                    setRoutineSubTab('collections');
                    setActiveTab('routine');
                  }}
                  className="p-3.5 rounded-[20px] bg-white hover:bg-[#f5f5f7] border border-black/5 text-left transition flex items-center gap-3 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-700 flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12.5px] font-semibold text-[#1d1d1f] leading-tight truncate">
                        Coletas
                      </span>
                      {hasPendingCollections && (
                        <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-[#0b2240] text-[10px] font-bold shrink-0">
                          {pendingCollections.length}
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-[#707070] truncate mt-0.5">
                      Solicitações do site
                    </div>
                  </div>
                </button>

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => {
                      pushNavSnapshot();
                      setSettingsTab('exams');
                      setActiveTab('settings');
                    }}
                    className="p-3.5 rounded-[20px] bg-white hover:bg-[#f5f5f7] border border-black/5 text-left transition flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#0b2240] flex items-center justify-center shrink-0">
                      <Settings className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#1d1d1f] leading-tight truncate">
                        Catálogo & Preços
                      </div>
                      <div className="text-[10.5px] text-[#707070] truncate mt-0.5">
                        Exames e tabelas
                      </div>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      pushNavSnapshot();
                      setActiveTab('patients');
                    }}
                    className="p-3.5 rounded-[20px] bg-white hover:bg-[#f5f5f7] border border-black/5 text-left transition flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-xl bg-slate-100 text-[#0b2240] flex items-center justify-center shrink-0">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#1d1d1f] leading-tight truncate">
                        Pacientes
                      </div>
                      <div className="text-[10.5px] text-[#707070] truncate mt-0.5">
                        Histórico de animais
                      </div>
                    </div>
                  </button>
                )}
              </div>

              {/* ROW 2: DUAS TABELAS (70% FILA DE ROTINA LABORATORIAL | 30% FILA DE COLETAS PENDENTES) */}
              <div className="grid grid-cols-1 xl:grid-cols-10 gap-4 sm:gap-5 items-start">
                {/* 70% (ou 100% se não houver coletas pendentes): Fila de Rotina Laboratorial Recente */}
                <div
                  className={`${
                    hasPendingCollections ? 'xl:col-span-7' : 'xl:col-span-10'
                  } bg-white rounded-[24px] p-4 sm:p-6 space-y-4 border border-black/5 min-w-0`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-[18px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                        Fila de Rotina Laboratorial Recente
                      </h2>
                      <p className="text-[12px] text-[#707070]">
                        Selecione um atendimento para registrar resultados ou imprimir etiquetas de amostras.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOpenNewOrder()}
                      className="px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:opacity-95 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Novo Atendimento
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-[12px]">
                      <thead>
                        <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10.5px]">
                          <th className="py-2.5 px-2.5 font-semibold">Protocolo</th>
                          <th className="py-2.5 px-2.5 font-semibold">Paciente / Espécie</th>
                          <th className="py-2.5 px-2.5 font-semibold">Tutor & Veterinário</th>
                          <th className="py-2.5 px-2.5 font-semibold">Exames</th>
                          {isAdmin && <th className="py-2.5 px-2.5 font-semibold">Valor</th>}
                          <th className="py-2.5 px-2.5 font-semibold">Status</th>
                          <th className="py-2.5 px-2.5 font-semibold text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f5f5f7]">
                        {orders.slice((opPage - 1) * 10, opPage * 10).map((ord) => (
                          <tr key={ord.id} className="hover:bg-[#f5f5f7]/60">
                            <td className="py-2.5 px-2.5 font-mono font-semibold text-[#1d1d1f] whitespace-nowrap">
                              {ord.protocol_code}
                            </td>
                            <td className="py-2.5 px-2.5">
                              <div className="font-semibold text-[#1d1d1f] leading-tight">
                                {ord.patient?.name}
                              </div>
                              <div className="text-[11px] text-[#707070] truncate max-w-[140px]">
                                {ord.patient?.species} • {ord.patient?.breed} ({ord.patient?.gender})
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5">
                              <div className="text-[#1d1d1f] leading-tight truncate max-w-[170px]">
                                {ord.patient?.tutor_name}
                              </div>
                              <div className="text-[11px] text-[#707070] truncate max-w-[170px]">
                                {ord.vet?.name} {ord.vet?.crmv ? `(${ord.vet.crmv})` : ''}
                              </div>
                            </td>
                            <td className="py-2.5 px-2.5">
                              {renderOrderExamsDropdown(ord, `op-${ord.id}`)}
                            </td>
                            {isAdmin && (
                              <td className="py-2.5 px-2.5 font-mono font-semibold text-[#1d1d1f] whitespace-nowrap">
                                R$ {(ord.total_amount || 0).toFixed(2)}
                              </td>
                            )}
                            <td className="py-2.5 px-2.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
                                  ord.status === 'concluido'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : ord.status === 'em_analise'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                                }`}
                              >
                                {ord.status === 'concluido'
                                  ? 'Concluído'
                                  : ord.status === 'em_analise'
                                    ? 'Em Análise'
                                    : 'Pendente'}
                              </span>
                            </td>
                            <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                              {renderOrderQuickActions(ord, true)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <PaginationBar
                    page={opPage}
                    pageSize={10}
                    totalItems={orders.length}
                    onPageChange={setOpPage}
                  />
                </div>

                {/* 30%: Fila de Solicitações de Coleta Pendentes (oculta automaticamente se não houver pendentes) */}
                {hasPendingCollections && (
                  <div className="xl:col-span-3 bg-white rounded-[24px] p-4 sm:p-5 space-y-3.5 border border-black/5 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-[16px] sm:text-[18px] font-semibold text-[#1d1d1f]">
                            Coletas Pendentes
                          </h3>
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                            {pendingCollections.length}
                          </span>
                        </div>
                        <p className="text-[11.5px] text-[#707070] mt-0.5">
                          Converta em atendimento com 1 clique.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          pushNavSnapshot();
                          setRoutineSubTab('collections');
                          setActiveTab('routine');
                        }}
                        className="text-[11.5px] font-semibold text-[#0071e3] hover:underline shrink-0 cursor-pointer"
                      >
                        Ver todas
                      </button>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11.5px]">
                        <thead>
                          <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10px]">
                            <th className="py-2 px-2 font-semibold">Solicitante / Local</th>
                            <th className="py-2 px-2 font-semibold text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#f5f5f7]">
                          {pendingCollections.map((col) => (
                            <tr
                              key={col.id || `${col.email}-${col.created_at}`}
                              className="hover:bg-[#f5f5f7]/60 align-top"
                            >
                              <td className="py-2.5 px-2 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-[#1d1d1f] truncate max-w-[160px]">
                                    {col.clinic_or_tutor_name}
                                  </span>
                                  {col.crmv && (
                                    <span className="px-1.5 py-0.2 rounded bg-[#f5f5f7] text-[#0b2240] font-mono text-[9.5px] font-bold border border-black/10">
                                      {col.crmv}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10.5px] text-[#707070] truncate max-w-[200px] mt-0.5">
                                  {col.address}
                                </div>
                                <div className="text-[10px] text-[#86868b] mt-0.5">
                                  {col.phone}
                                  {col.preferred_date ? ` • Data: ${col.preferred_date}` : ''}
                                </div>
                              </td>
                              <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                <div className="inline-flex flex-col items-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleConvertCollectionToOrder(col)}
                                    className="px-2.5 py-1 rounded-full bg-[#0071e3] text-white text-[10.5px] font-semibold hover:opacity-95 transition inline-flex items-center gap-1 cursor-pointer"
                                    title="Transformar em Atendimento"
                                  >
                                    <ClipboardPlus className="w-3 h-3" />
                                    Atender
                                  </button>
                                  {col.id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setScheduleModal({
                                          collection: col,
                                          date:
                                            col.scheduled_date ||
                                            col.preferred_date ||
                                            new Date().toISOString().slice(0, 10),
                                          time: col.scheduled_time || '09:00',
                                        })
                                      }
                                      className="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#0b2240] text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                    >
                                      <Calendar className="w-2.5 h-2.5 text-[#0071e3]" />
                                      Agendar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

      {/* =====================================================================
          ABA: CADASTRO & LISTAGEM DE PACIENTES (CRUD COMPLETO + EXAME OPCIONAL)
         ===================================================================== */}
      {activeTab === 'patients' && (
        <div className="space-y-6">
          {/* MODAL DE CADASTRO / EDIÇÃO DE PACIENTE */}
          {patientModalOpen && (
            <div
              className="fixed inset-0 z-50 bg-[#0b2240]/45 backdrop-blur-md flex items-center justify-center p-2.5 sm:p-5"
              onClick={handleClosePatientModal}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[24px] max-w-4xl w-[95vw] min-w-0 max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-black/10"
              >
                <form onSubmit={handleSavePatientCrud} className="flex flex-col min-h-0 flex-1">
                  {/* Header */}
                  <div className="px-5 py-3.5 border-b border-black/5 flex items-center justify-between gap-2 shrink-0">
                    <h2 className="font-display text-[16px] sm:text-[17px] font-semibold text-[#1d1d1f]">
                      {editingPatientId ? 'Editar Paciente' : 'Novo Paciente'}
                    </h2>
                    <button
                      type="button"
                      onClick={handleClosePatientModal}
                      className="p-1.5 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                      aria-label="Fechar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="px-5 py-4 overflow-y-auto space-y-3 flex-1 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Nome do Animal *
                        </label>
                        <input
                          type="text"
                          required
                          value={patientCrudForm.name}
                          onChange={(e) =>
                            setPatientCrudForm({ ...patientCrudForm, name: e.target.value })
                          }
                          placeholder="Ex: Thor"
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Espécie *
                        </label>
                        <select
                          required
                          value={patientCrudForm.species}
                          onChange={(e) =>
                            setPatientCrudForm({ ...patientCrudForm, species: e.target.value })
                          }
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        >
                          <option value="">Selecione...</option>
                          <option value="Canino">Canino</option>
                          <option value="Felino">Felino</option>
                          <option value="Equino">Equino</option>
                          <option value="Silvestre">Silvestre / Exótico</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-4">
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Raça
                        </label>
                        <input
                          type="text"
                          value={patientCrudForm.breed}
                          onChange={(e) =>
                            setPatientCrudForm({ ...patientCrudForm, breed: e.target.value })
                          }
                          placeholder="Opcional (SRD)"
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Sexo *
                        </label>
                        <select
                          required
                          value={patientCrudForm.gender}
                          onChange={(e) =>
                            setPatientCrudForm({
                              ...patientCrudForm,
                              gender: e.target.value as '' | 'M' | 'F',
                            })
                          }
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        >
                          <option value="">Selecione...</option>
                          <option value="M">Macho (M)</option>
                          <option value="F">Fêmea (F)</option>
                        </select>
                      </div>
                      <div className="sm:col-span-5">
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Idade (Anos e Meses) *
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={60}
                              placeholder="0"
                              value={patientCrudForm.age_years}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextYears =
                                  raw === '' ? '' : Math.max(0, Math.floor(Number(raw)));
                                if (nextYears !== '' && Number.isNaN(nextYears)) return;
                                const curMonths =
                                  patientCrudForm.age_months === ''
                                    ? 0
                                    : Math.max(0, Number(patientCrudForm.age_months));
                                const totalM =
                                  (nextYears === '' ? 0 : nextYears) * 12 + curMonths;
                                setPatientCrudForm({
                                  ...patientCrudForm,
                                  age_years: nextYears,
                                  birth_date:
                                    nextYears === '' && patientCrudForm.age_months === ''
                                      ? ''
                                      : calculateBirthDateFromAgeMonths(totalM),
                                });
                              }}
                              className="w-full h-[38px] pl-3 pr-12 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#707070] pointer-events-none">
                              anos
                            </span>
                          </div>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={11}
                              placeholder="0"
                              value={patientCrudForm.age_months}
                              onChange={(e) => {
                                const raw = e.target.value;
                                const nextMonths =
                                  raw === '' ? '' : Math.min(11, Math.max(0, Math.floor(Number(raw))));
                                if (nextMonths !== '' && Number.isNaN(nextMonths)) return;
                                const curYears =
                                  patientCrudForm.age_years === ''
                                    ? 0
                                    : Math.max(0, Number(patientCrudForm.age_years));
                                const totalM =
                                  curYears * 12 + (nextMonths === '' ? 0 : nextMonths);
                                setPatientCrudForm({
                                  ...patientCrudForm,
                                  age_months: nextMonths,
                                  birth_date:
                                    patientCrudForm.age_years === '' && nextMonths === ''
                                      ? ''
                                      : calculateBirthDateFromAgeMonths(totalM),
                                });
                              }}
                              className="w-full h-[38px] pl-3 pr-14 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#707070] pointer-events-none">
                              meses
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Data de Nascimento (Opcional)
                        </label>
                        <input
                          type="date"
                          value={patientCrudForm.birth_date}
                          onChange={(e) => {
                            const val = e.target.value;
                            const computedMonths = calculateAgeMonthsFromBirthDate(val);
                            setPatientCrudForm({
                              ...patientCrudForm,
                              birth_date: val,
                              age_years:
                                computedMonths !== ''
                                  ? Math.floor(computedMonths / 12)
                                  : patientCrudForm.age_years,
                              age_months:
                                computedMonths !== ''
                                  ? computedMonths % 12
                                  : patientCrudForm.age_months,
                            });
                          }}
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Tutor (Proprietário) *
                        </label>
                        <input
                          type="text"
                          required
                          value={patientCrudForm.tutor_name}
                          onChange={(e) =>
                            setPatientCrudForm({ ...patientCrudForm, tutor_name: e.target.value })
                          }
                          placeholder="Nome do tutor"
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          Telefone / WhatsApp do Tutor (Opcional)
                        </label>
                        <input
                          type="text"
                          value={patientCrudForm.tutor_phone}
                          onChange={(e) =>
                            setPatientCrudForm({ ...patientCrudForm, tutor_phone: e.target.value })
                          }
                          placeholder="Opcional — (00) 00000-0000"
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-[#707070] mb-1">
                          E-mail do Tutor (Opcional)
                        </label>
                        <input
                          type="email"
                          value={patientCrudForm.tutor_email}
                          onChange={(e) =>
                            setPatientCrudForm({ ...patientCrudForm, tutor_email: e.target.value })
                          }
                          placeholder="tutor@email.com"
                          className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                        />
                      </div>
                    </div>

                    {/* Opção minimalista de gerar atendimento neste cadastro */}
                    <div className="p-3 rounded-xl bg-[#f9f9fb] border border-black/8 space-y-2.5">
                      <label className="flex items-center gap-2 cursor-pointer text-[12.5px] font-semibold text-[#1d1d1f]">
                        <input
                          type="checkbox"
                          checked={patientIncludeExamOrder}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setPatientIncludeExamOrder(checked);
                            setPatientOrderVetId('');
                            setPatientOrderTableId(
                              resolveFirstActivePriceTableId(priceTables, getTodayIsoDate())
                            );
                            setPatientSelectedExamIds([]);
                            setPatientOrderNotes('');
                            setPatientOrderModalKey((k) => k + 1);
                          }}
                          className="w-4 h-4 accent-[#0071e3] rounded"
                        />
                        <span>Gerar atendimento agora</span>
                      </label>

                      {patientIncludeExamOrder && (
                        <div className="space-y-2.5 pt-2 border-t border-black/5">
                          <div className={`grid grid-cols-1 ${isAdmin ? 'sm:grid-cols-2' : ''} gap-2.5`}>
                            <SearchableSelectField
                              label="Veterinário *"
                              placeholder="Selecionar veterinário..."
                              modalTitle="Selecionar Veterinário Solicitante"
                              modalSubtitle="Pesquise por nome, CRMV ou clínica parceira"
                              searchPlaceholder="Buscar por nome, CRMV ou clínica..."
                              items={vets}
                              value={patientOrderVetId}
                              getId={(v) => v.id}
                              getPrimaryLabel={(v) => v.name}
                              getSecondaryLabel={(v) =>
                                `${v.crmv || 'Sem CRMV'}${v.clinic_name ? ` • ${v.clinic_name}` : ''}`
                              }
                              getBadge={(v) => v.crmv || undefined}
                              getSearchText={(v) => `${v.name} ${v.crmv || ''} ${v.clinic_name || ''}`}
                              onChange={(id) => setPatientOrderVetId(id)}
                              onClear={() => setPatientOrderVetId('')}
                              variant="minimal"
                              triggerClassName="bg-white border border-black/10"
                            />
                            {isAdmin && (
                              <SearchableSelectField
                                label="Tabela"
                                placeholder="Tabela padrão..."
                                modalTitle="Selecionar Tabela de Preços / Convênio"
                                searchPlaceholder="Buscar tabela por nome ou vigência..."
                                items={priceTables}
                                value={patientOrderTableId || defaultActivePriceTable?.id || ''}
                                getId={(pt) => pt.id}
                                getPrimaryLabel={(pt) => pt.name}
                                getSecondaryLabel={(pt) => `Vigência: ${pt.start_date} a ${pt.end_date}`}
                                getSearchText={(pt) => `${pt.name} ${pt.start_date} ${pt.end_date}`}
                                onChange={(id) => setPatientOrderTableId(id)}
                                onClear={() =>
                                  setPatientOrderTableId(
                                    resolveFirstActivePriceTableId(priceTables, getTodayIsoDate())
                                  )
                                }
                                variant="minimal"
                                triggerClassName="bg-white border border-black/10"
                              />
                            )}
                          </div>

                          <ExamMultiPicker
                            key={patientOrderModalKey}
                            exams={exams}
                            selectedExamIds={patientSelectedExamIds}
                            onChange={setPatientSelectedExamIds}
                            activePriceTable={effectivePatientPriceTable}
                            minimal
                            listMaxHeightClass="max-h-[165px]"
                            hidePrices={!isAdmin}
                          />

                          <input
                            type="text"
                            value={patientOrderNotes}
                            onChange={(e) => setPatientOrderNotes(e.target.value)}
                            placeholder="Observações (opcional)"
                            className="w-full h-[36px] px-3 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3.5 border-t border-black/5 bg-[#fafafa] flex flex-wrap items-center justify-between gap-2 shrink-0">
                    <div className="text-[12px] text-[#707070]">
                      {patientIncludeExamOrder && (
                        <span>
                          {validPatientSelectedExamIds.length} exame(s)
                          {isAdmin && (
                            <>
                              {' '}•{' '}
                              <strong className="font-mono text-[#1d1d1f]">
                                R$ {calculatedPatientOrderTotal.toFixed(2)}
                              </strong>
                            </>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <button
                        type="button"
                        onClick={handleClosePatientModal}
                        className="px-4 py-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[12px] font-semibold transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 rounded-full bg-[#0071e3] text-white text-[12.5px] font-semibold hover:opacity-95 transition cursor-pointer"
                      >
                        {editingPatientId
                          ? patientIncludeExamOrder
                            ? 'Salvar e Atender'
                            : 'Salvar'
                          : patientIncludeExamOrder
                            ? 'Cadastrar e Atender'
                            : 'Cadastrar'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Listagem Completa de Pacientes (CRUD) */}
          <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-[20px] sm:text-[22px] font-semibold text-[#1d1d1f]">
                  Listagem de Pacientes ({patients.length})
                </h2>
                <p className="text-[12px] text-[#707070]">
                  Gerencie todos os pacientes cadastrados e inicie novos atendimentos com 1 clique.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    resetPatientModal();
                    setPatientModalOpen(true);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer"
                >
                  + Novo Paciente
                </button>
                <input
                  type="text"
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  placeholder="Buscar animal ou tutor..."
                  className="px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px] flex-1 sm:w-48 min-w-[140px]"
                />
                <select
                  value={patientSpeciesFilter}
                  onChange={(e) => setPatientSpeciesFilter(e.target.value)}
                  className="px-3 py-2 rounded-full bg-[#f5f5f7] text-[12px]"
                >
                  <option value="todos">Todas Espécies</option>
                  <option value="Canino">Canino</option>
                  <option value="Felino">Felino</option>
                  <option value="Equino">Equino</option>
                  <option value="Silvestre">Silvestre</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[12px]">
                <thead>
                  <tr className="border-b border-slate-200 text-[#86868b] uppercase text-[11px]">
                    <th className="py-3 px-3">Animal</th>
                    <th className="py-3 px-3">Espécie / Raça</th>
                    <th className="py-3 px-3">Tutor</th>
                    <th className="py-3 px-3">Atendimentos</th>
                    <th className="py-3 px-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {patients
                    .filter((p) => {
                      const q = patientSearchQuery.trim().toLowerCase();
                      const matchesSpecies =
                        patientSpeciesFilter === 'todos' ||
                        p.species.toLowerCase() === patientSpeciesFilter.toLowerCase();
                      const matchesQuery =
                        !q ||
                        p.name.toLowerCase().includes(q) ||
                        p.tutor_name.toLowerCase().includes(q) ||
                        (p.breed || '').toLowerCase().includes(q);
                      return matchesSpecies && matchesQuery;
                    })
                    .slice((patientsPage - 1) * 10, patientsPage * 10)
                    .map((p) => {
                      const patientOrdersCount = orders.filter(
                        (o) => o.patient_id === p.id || o.patient?.id === p.id
                      ).length;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-[#0b2240]">{p.name}</div>
                            <div className="text-[11px] text-[#707070]">
                              {p.gender === 'F' ? 'Fêmea' : 'Macho'} •{' '}
                              {formatAgeLabel(p.age_days, p.birth_date)}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[#0b2240] font-medium">{p.species}</div>
                            <div className="text-[11px] text-[#707070]">{p.breed || 'SRD'}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="text-[#0b2240] font-medium">{p.tutor_name}</div>
                            <div className="text-[11px] text-[#707070]">
                              {p.tutor_phone || p.tutor_email || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            <span className="px-2.5 py-1 rounded-full bg-slate-100 text-[#0b2240] font-semibold whitespace-nowrap inline-block">
                              {patientOrdersCount} atendimento(s)
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right space-x-1 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenNewOrder({
                                  patientId: p.id,
                                  switchToRoutineTab: true,
                                })
                              }
                              className="px-2.5 py-1.5 rounded-full bg-[#1d9496] text-white text-[11px] font-semibold hover:opacity-90 transition inline-flex items-center gap-1"
                            >
                              <ClipboardPlus className="w-3 h-3" />
                              Atendimento
                            </button>
                            <button
                              type="button"
                              title="Editar paciente"
                              onClick={() => {
                                resetPatientModal();
                                setEditingPatientId(p.id);
                                const editBirthDate = p.birth_date || '';
                                const editTotalMonths = editBirthDate
                                  ? calculateAgeMonthsFromBirthDate(editBirthDate)
                                  : p.age_days
                                    ? Math.max(0, Math.round(p.age_days / 30))
                                    : '';
                                setPatientCrudForm({
                                  name: p.name,
                                  species: p.species,
                                  breed: p.breed || '',
                                  gender: p.gender,
                                  birth_date: editBirthDate,
                                  age_years:
                                    editTotalMonths !== '' ? Math.floor(editTotalMonths / 12) : '',
                                  age_months:
                                    editTotalMonths !== '' ? editTotalMonths % 12 : '',
                                  tutor_name: p.tutor_name,
                                  tutor_phone: p.tutor_phone || '',
                                  tutor_email: p.tutor_email || '',
                                });
                                setPatientModalOpen(true);
                              }}
                              className="p-1.5 text-[#0b2240] hover:bg-slate-100 rounded-full inline-flex items-center"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Excluir paciente"
                              onClick={async () => {
                                await api.deletePatient(p.id);
                                if (editingPatientId === p.id) setEditingPatientId(null);
                                await loadAllData();
                                showToast(`Paciente "${p.name}" removido.`);
                              }}
                              className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full inline-flex items-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {(() => {
              const totalFilteredPatients = patients.filter((p) => {
                const matchesSpecies =
                  patientSpeciesFilter === 'todos' || p.species === patientSpeciesFilter;
                const q = patientSearchQuery.trim().toLowerCase();
                const matchesQuery =
                  !q ||
                  p.name.toLowerCase().includes(q) ||
                  p.tutor_name.toLowerCase().includes(q) ||
                  (p.breed || '').toLowerCase().includes(q);
                return matchesSpecies && matchesQuery;
              }).length;
              return (
                <PaginationBar
                  page={patientsPage}
                  pageSize={10}
                  totalItems={totalFilteredPatients}
                  onPageChange={setPatientsPage}
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 2: ATENDIMENTOS / ROTINA (LISTA + SOLICITAÇÕES DE COLETA)
         ===================================================================== */}
      {activeTab === 'routine' && (
        <div className="space-y-5 sm:space-y-6">
          {routineSubTab === 'list' && (
            <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[20px] sm:text-[22px] font-semibold text-[#1d1d1f]">
                    Lista de Atendimentos ({orders.length})
                  </h2>
                  <p className="text-[12px] text-[#707070]">
                    Os laudos são gerados a partir de cada atendimento e suas solicitações de exames.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenNewOrder()}
                  className="px-4 py-2 rounded-full text-[12px] font-semibold transition bg-[#0071e3] text-white hover:opacity-95 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Atendimento
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
                <input
                  type="text"
                  value={orderSearchCode}
                  onChange={(e) => setOrderSearchCode(e.target.value)}
                  placeholder="Código / Protocolo"
                  className="px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12px]"
                />
                <input
                  type="text"
                  value={orderSearchAnimal}
                  onChange={(e) => setOrderSearchAnimal(e.target.value)}
                  placeholder="Animal"
                  className="px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12px]"
                />
                <input
                  type="text"
                  value={orderSearchTutor}
                  onChange={(e) => setOrderSearchTutor(e.target.value)}
                  placeholder="Tutor / Proprietário"
                  className="px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12px]"
                />
                <input
                  type="text"
                  value={orderSearchClinic}
                  onChange={(e) => setOrderSearchClinic(e.target.value)}
                  placeholder="Clínica / Veterinário"
                  className="px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12px]"
                />
                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[12px]"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="pendente">Pendente</option>
                  <option value="em_analise">Em Análise</option>
                  <option value="concluido">Concluído</option>
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setOrderSearchCode('');
                    setOrderSearchAnimal('');
                    setOrderSearchTutor('');
                    setOrderSearchClinic('');
                    setOrderStatusFilter('todos');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0b2240] text-[12px] font-semibold"
                >
                  Limpar Filtros
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[#86868b] uppercase text-[11px]">
                      <th className="py-3 px-3">Código</th>
                      <th className="py-3 px-3">Data</th>
                      <th className="py-3 px-3">Animal</th>
                      <th className="py-3 px-3">Tutor</th>
                      <th className="py-3 px-3">Clínica / Vet</th>
                      <th className="py-3 px-3">Exames</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {orders
                      .filter((ord) => {
                        const mCode =
                          !orderSearchCode.trim() ||
                          ord.protocol_code
                            .toLowerCase()
                            .includes(orderSearchCode.trim().toLowerCase());
                        const mAnimal =
                          !orderSearchAnimal.trim() ||
                          (ord.patient?.name || '')
                            .toLowerCase()
                            .includes(orderSearchAnimal.trim().toLowerCase());
                        const mTutor =
                          !orderSearchTutor.trim() ||
                          (ord.patient?.tutor_name || '')
                            .toLowerCase()
                            .includes(orderSearchTutor.trim().toLowerCase());
                        const mClinic =
                          !orderSearchClinic.trim() ||
                          (ord.vet?.clinic_name || '')
                            .toLowerCase()
                            .includes(orderSearchClinic.trim().toLowerCase()) ||
                          (ord.vet?.name || '')
                            .toLowerCase()
                            .includes(orderSearchClinic.trim().toLowerCase());
                        const mStatus =
                          orderStatusFilter === 'todos' || ord.status === orderStatusFilter;
                        return mCode && mAnimal && mTutor && mClinic && mStatus;
                      })
                      .slice((ordersPage - 1) * 10, ordersPage * 10)
                      .map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-3 font-mono font-semibold text-[#0b2240]">
                            {ord.protocol_code}
                          </td>
                          <td className="py-3 px-3 text-[#5b6675]">
                            {new Date(ord.created_at).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-[#0b2240]">{ord.patient?.name}</div>
                            <div className="text-[11px] text-[#707070]">{ord.patient?.species}</div>
                          </td>
                          <td className="py-3 px-3 text-[#0b2240]">{ord.patient?.tutor_name}</td>
                          <td className="py-3 px-3">
                            <div className="text-[#0b2240] font-medium">
                              {ord.vet?.clinic_name || 'Clínica Parceira'}
                            </div>
                            <div className="text-[11px] text-[#707070]">{ord.vet?.name}</div>
                          </td>
                          <td className="py-3 px-3">
                            {renderOrderExamsDropdown(ord, `list-${ord.id}`)}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2.5 py-1 rounded-full font-semibold whitespace-nowrap ${ord.status === 'concluido'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ord.status === 'em_analise'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-[#0b2240]'
                                }`}
                            >
                              {ord.status === 'concluido'
                                ? 'Concluído'
                                : ord.status === 'em_analise'
                                  ? 'Em Análise'
                                  : 'Pendente'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {renderOrderQuickActions(ord, true)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const totalFilteredOrders = orders.filter((ord) => {
                  const mCode =
                    !orderSearchCode.trim() ||
                    ord.protocol_code
                      .toLowerCase()
                      .includes(orderSearchCode.trim().toLowerCase());
                  const mAnimal =
                    !orderSearchAnimal.trim() ||
                    (ord.patient?.name || '')
                      .toLowerCase()
                      .includes(orderSearchAnimal.trim().toLowerCase());
                  const mTutor =
                    !orderSearchTutor.trim() ||
                    (ord.patient?.tutor_name || '')
                      .toLowerCase()
                      .includes(orderSearchTutor.trim().toLowerCase());
                  const mClinic =
                    !orderSearchClinic.trim() ||
                    (ord.vet?.clinic_name || '')
                      .toLowerCase()
                      .includes(orderSearchClinic.trim().toLowerCase()) ||
                    (ord.vet?.name || '')
                      .toLowerCase()
                      .includes(orderSearchClinic.trim().toLowerCase());
                  const mStatus =
                    orderStatusFilter === 'todos' || ord.status === orderStatusFilter;
                  return mCode && mAnimal && mTutor && mClinic && mStatus;
                }).length;
                return (
                  <PaginationBar
                    page={ordersPage}
                    pageSize={10}
                    totalItems={totalFilteredOrders}
                    onPageChange={setOrdersPage}
                  />
                );
              })()}
            </div>
          )}

          {routineSubTab === 'collections' && (
            <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[20px] sm:text-[22px] font-semibold text-[#1d1d1f]">
                    Solicitações & Agendamentos de Coleta ({collectionRequests.length})
                  </h2>
                  <p className="text-[12px] text-[#707070]">
                    Gerencie pedidos recebidos pelo site ou cadastre novos agendamentos de retirada e converta em Atendimento com 1 clique.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() =>
                      setCollectionCrudModal({
                        clinic_or_tutor_name: '',
                        crmv: '',
                        phone: '',
                        email: '',
                        address: '',
                        preferred_date: getTodayIsoDate(),
                        scheduled_date: getTodayIsoDate(),
                        scheduled_time: '09:00',
                        status: 'agendada',
                        notes: '',
                      })
                    }
                    className="px-4 py-2 rounded-full bg-[#0071e3] hover:opacity-95 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo Agendamento
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const fresh = await api.getCollectionRequests();
                      setCollectionRequests(fresh);
                      showToast('Lista de solicitações atualizada!');
                    }}
                    className="px-3.5 py-2 rounded-full bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Atualizar
                  </button>
                  <input
                    type="text"
                    value={collectionSearch}
                    onChange={(e) => setCollectionSearch(e.target.value)}
                    placeholder="Buscar clínica, CRMV, telefone, endereço..."
                    className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[12px] flex-1 sm:w-60 min-w-[150px]"
                  />
                  <select
                    value={collectionStatusFilter}
                    onChange={(e) => setCollectionStatusFilter(e.target.value)}
                    className="px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px] w-full sm:w-auto"
                  >
                    <option value="todos">Todos os status</option>
                    <option value="pendente">Pendentes</option>
                    <option value="agendada">Agendadas</option>
                    <option value="concluida">Concluídas</option>
                    <option value="cancelada">Canceladas</option>
                  </select>
                </div>
              </div>

              {collectionRequests.length === 0 ? (
                <div className="py-12 text-center text-[13px] text-[#86868b]">
                  Nenhuma solicitação de coleta registrada até o momento.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {collectionRequests
                    .filter((c) => {
                      const st = c.status || 'pendente';
                      if (collectionStatusFilter !== 'todos' && st !== collectionStatusFilter) {
                        return false;
                      }
                      const q = collectionSearch.trim().toLowerCase();
                      if (!q) return true;
                      return `${c.clinic_or_tutor_name} ${c.phone} ${c.email} ${c.address} ${c.notes}`
                        .toLowerCase()
                        .includes(q);
                    })
                    .slice((collectionsPage - 1) * 8, collectionsPage * 8)
                    .map((col) => {
                      const st = col.status || 'pendente';
                      const statusBadge =
                        st === 'concluida'
                          ? 'bg-emerald-100 text-emerald-800'
                          : st === 'agendada'
                            ? 'bg-sky-100 text-sky-800'
                            : st === 'cancelada'
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-amber-100 text-amber-800';

                      return (
                        <div
                          key={col.id || `${col.email}-${col.created_at}`}
                          className="p-5 rounded-2xl bg-[#f5f5f7] space-y-3 flex flex-col justify-between border border-black/5"
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="text-[15px] font-semibold text-[#1d1d1f]">
                                    {col.clinic_or_tutor_name}
                                  </div>
                                  {col.crmv && (
                                    <span className="px-2 py-0.5 rounded-full bg-white text-[#0b2240] font-mono text-[10.5px] font-bold border border-black/10">
                                      {col.crmv}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[12px] text-[#707070]">
                                  {col.phone} • {col.email}
                                </div>
                              </div>
                              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusBadge}`}>
                                {st}
                              </span>
                            </div>

                            <div className="text-[12px] text-[#1d1d1f] bg-white rounded-xl p-3 space-y-1">
                              <div>
                                <strong className="text-[#707070]">Endereço:</strong> {col.address}
                              </div>
                              {col.preferred_date && (
                                <div>
                                  <strong className="text-[#707070]">Data Preferencial:</strong>{' '}
                                  {col.preferred_date}
                                </div>
                              )}
                              {st === 'agendada' && (
                                <div className="text-sky-800 font-semibold flex items-center gap-1.5 pt-0.5">
                                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                                  <span>
                                    Agendado para:{' '}
                                    {col.scheduled_date
                                      ? `${col.scheduled_date.split('-').reverse().join('/')}${col.scheduled_time ? ` às ${col.scheduled_time}` : ''
                                      }`
                                      : col.preferred_date
                                        ? `${col.preferred_date.split('-').reverse().join('/')} (horário não definido)`
                                        : 'Data/horário não informado'}
                                  </span>
                                </div>
                              )}
                              <div>
                                <strong className="text-[#707070]">Observações:</strong>{' '}
                                {col.notes || 'Sem observações'}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap gap-1.5">
                              {(() => {
                                const digits = (col.phone || '').replace(/\D/g, '');
                                const waNumber =
                                  digits.length >= 10 && !digits.startsWith('55')
                                    ? `55${digits}`
                                    : digits;
                                const waText = encodeURIComponent(
                                  `Olá ${col.clinic_or_tutor_name}! Aqui é da VetLife Laboratório Veterinário. Recebemos sua solicitação de coleta e gostaríamos de confirmar o agendamento.`
                                );
                                return (
                                  <>
                                    {waNumber && (
                                      <a
                                        href={`https://wa.me/${waNumber}?text=${waText}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Chamar veterinário/clínica no WhatsApp"
                                        className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                      >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                        Chamar no Whats
                                      </a>
                                    )}
                                    {col.email && (
                                      <a
                                        href={`mailto:${encodeURIComponent(col.email)}?subject=${encodeURIComponent('VetLife — Confirmação de Solicitação de Coleta')}&body=${waText}`}
                                        title="Enviar e-mail para o veterinário/clínica"
                                        className="px-3 py-1.5 rounded-full bg-[#0071e3] hover:bg-[#0062c4] text-white text-[11px] font-semibold inline-flex items-center gap-1 transition"
                                      >
                                        <Mail className="w-3.5 h-3.5" />
                                        E-mail
                                      </a>
                                    )}
                                  </>
                                );
                              })()}
                              {(st === 'pendente' || st === 'agendada') && col.id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setScheduleModal({
                                      collection: col,
                                      date:
                                        col.scheduled_date ||
                                        col.preferred_date ||
                                        getTodayIsoDate(),
                                      time: col.scheduled_time || '09:00',
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-[#0b2240] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-[#0071e3]" />
                                  {st === 'agendada' ? 'Reagendar' : 'Agendar'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setCollectionCrudModal({
                                    id: col.id,
                                    clinic_or_tutor_name: col.clinic_or_tutor_name || '',
                                    crmv: col.crmv || '',
                                    phone: col.phone || '',
                                    email: col.email || '',
                                    address: col.address || '',
                                    preferred_date: col.preferred_date || getTodayIsoDate(),
                                    scheduled_date:
                                      col.scheduled_date || col.preferred_date || getTodayIsoDate(),
                                    scheduled_time: col.scheduled_time || '09:00',
                                    status: (st === 'agendada' ||
                                    st === 'concluida' ||
                                    st === 'cancelada'
                                      ? st
                                      : 'pendente') as
                                      | 'pendente'
                                      | 'agendada'
                                      | 'concluida'
                                      | 'cancelada',
                                    notes: col.notes || '',
                                  })
                                }
                                className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-[#0b2240] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                                Editar
                              </button>
                              {st !== 'concluida' && st !== 'cancelada' && col.id && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const updated = await api.updateCollectionRequestStatus(col.id!, 'cancelada');
                                    setCollectionRequests((prev) =>
                                      prev.map((item) =>
                                        item.id === col.id || item.id === updated.id
                                          ? { ...item, ...updated }
                                          : item
                                      )
                                    );
                                    showToast('Solicitação cancelada.');
                                  }}
                                  className="px-3 py-1.5 rounded-full bg-white hover:bg-red-50 text-red-600 text-[11px] font-semibold cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              )}
                              {st === 'cancelada' && col.id && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const updated = await api.updateCollectionRequestStatus(col.id!, 'pendente');
                                    setCollectionRequests((prev) =>
                                      prev.map((item) =>
                                        item.id === col.id || item.id === updated.id
                                          ? { ...item, ...updated }
                                          : item
                                      )
                                    );
                                    showToast('Solicitação reaberta como pendente.');
                                  }}
                                  className="px-3 py-1.5 rounded-full bg-white hover:bg-slate-100 text-[#0b2240] text-[11px] font-semibold cursor-pointer"
                                >
                                  Reabrir
                                </button>
                              )}
                              {col.id && (
                                <button
                                  type="button"
                                  title="Excluir solicitação"
                                  onClick={async () => {
                                    await api.deleteCollectionRequest(col.id!);
                                    setCollectionRequests((prev) =>
                                      prev.filter((item) => item.id !== col.id)
                                    );
                                    showToast('Solicitação de coleta removida.');
                                  }}
                                  className="p-1.5 rounded-full bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 transition inline-flex items-center cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {st !== 'cancelada' && (
                              <button
                                type="button"
                                onClick={() => handleConvertCollectionToOrder(col)}
                                className="px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <ClipboardPlus className="w-3.5 h-3.5" />
                                Transformar em Atendimento
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
              {(() => {
                const totalFilteredCollections = collectionRequests.filter((c) => {
                  const st = c.status || 'pendente';
                  if (collectionStatusFilter !== 'todos' && st !== collectionStatusFilter) {
                    return false;
                  }
                  const q = collectionSearch.trim().toLowerCase();
                  if (!q) return true;
                  return `${c.clinic_or_tutor_name} ${c.phone} ${c.email} ${c.address} ${c.notes}`
                    .toLowerCase()
                    .includes(q);
                }).length;
                return (
                  <PaginationBar
                    page={collectionsPage}
                    pageSize={8}
                    totalItems={totalFilteredCollections}
                    onPageChange={setCollectionsPage}
                  />
                );
              })()}
            </div>
          )}
        </div>
      )}

      {orderModalOpen &&
        (() => {
          const totalLabels = validSelectedExamIds.reduce((sum, id) => {
            const ex = exams.find((e) => e.id === id);
            return sum + (ex?.label_qty || 0);
          }, 0);

          return (
            <div
              className="fixed inset-0 z-50 bg-[#0b2240]/45 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 lg:p-6"
              onClick={handleCloseOrderModal}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-[26px] w-[96vw] max-w-[1380px] min-w-0 max-h-[94vh] flex flex-col overflow-hidden shadow-2xl border border-black/10"
              >
                <form onSubmit={handleCreateOrder} className="flex flex-col min-h-0 flex-1">
                  {/* Header */}
                  <div className="px-6 sm:px-7 py-4 border-b border-black/5 flex items-center justify-between gap-3 shrink-0">
                    <div>
                      <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f] truncate">
                        {editingOrderId
                          ? `Editar Atendimento ${orders.find((o) => o.id === editingOrderId)?.protocol_code || ''}`
                          : 'Novo Atendimento Laboratorial'}
                      </h3>
                      <p className="text-[12px] text-[#707070] mt-0.5">
                        Vincule o paciente, médico veterinário solicitante e selecione os exames da ordem de serviço.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseOrderModal}
                      className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                      aria-label="Fechar"
                      title="Fechar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="px-6 sm:px-7 py-4 sm:py-5 overflow-y-auto space-y-4 flex-1 min-w-0">
                    {convertingCollection && (
                      <div
                        className={`px-3.5 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-[11.5px] ${
                          convertingVetMatched
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                            : 'bg-amber-50 border-amber-200 text-amber-950'
                        }`}
                      >
                        <div className="min-w-0 truncate">
                          <strong>Coleta:</strong> {convertingCollection.clinic_or_tutor_name} (
                          {convertingCollection.phone})
                          {convertingVetMatched && (
                            <span className="ml-2 text-emerald-700 font-semibold">• Vet vinculado</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {!convertingVetMatched && (
                            <button
                              type="button"
                              onClick={() =>
                                setQuickVetModal({
                                  name: convertingCollection.clinic_or_tutor_name,
                                  email: convertingCollection.email || '',
                                  phone: convertingCollection.phone || '',
                                  password: '',
                                  clinic_name: convertingCollection.clinic_or_tutor_name,
                                  crmv: convertingCollection.crmv || '',
                                })
                              }
                              className="px-2.5 py-1 rounded-full bg-[#0071e3] text-white text-[11px] font-semibold hover:opacity-95 transition"
                            >
                              + Cadastrar Vet
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setConvertingCollection(null);
                              setConvertingVetMatched(false);
                            }}
                            className="text-[#0071e3] font-semibold hover:underline"
                          >
                            Desvincular
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Paciente + Veterinário + Tabela + Data em layout horizontal amplo */}
                    {routinePatientMode === 'existing' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end min-w-0">
                        <div className="sm:col-span-2 lg:col-span-4 space-y-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-[#707070]">Paciente *</span>
                            <div className="inline-flex rounded-full bg-[#f5f5f7] p-0.5 text-[11px] font-semibold">
                              <button
                                type="button"
                                onClick={() => setRoutinePatientMode('existing')}
                                className="px-2.5 py-0.5 rounded-full transition cursor-pointer bg-[#1d1d1f] text-white"
                              >
                                Cadastrado
                              </button>
                              <button
                                type="button"
                                onClick={() => setRoutinePatientMode('new')}
                                className="px-2.5 py-0.5 rounded-full transition cursor-pointer text-[#5b6675] hover:text-[#1d1d1f]"
                              >
                                + Novo
                              </button>
                            </div>
                          </div>
                          <SearchableSelectField
                            placeholder="Selecionar paciente..."
                            modalTitle="Pesquisar Paciente Cadastrado"
                            modalSubtitle="Busque por nome do animal, tutor, telefone, raça ou espécie"
                            searchPlaceholder="Digite o nome do animal, tutor ou raça..."
                            items={patients}
                            value={routineSelectedPatientId}
                            getId={(p) => p.id}
                            getPrimaryLabel={(p) => `${p.name} (${p.species}) • Tutor: ${p.tutor_name}`}
                            getSecondaryLabel={(p) =>
                              `Tutor: ${p.tutor_name}${p.tutor_phone ? ` • ${p.tutor_phone}` : ''}`
                            }
                            getBadge={(p) => p.species}
                            getSearchText={(p) =>
                              `${p.name} ${p.species} ${p.breed || ''} ${p.tutor_name} ${p.tutor_phone || ''}`
                            }
                            filterChips={[
                              { id: 'canino', label: 'Caninos', predicate: (p) => p.species === 'Canino' },
                              { id: 'felino', label: 'Felinos', predicate: (p) => p.species === 'Felino' },
                            ]}
                            onChange={(id) => setRoutineSelectedPatientId(id)}
                            onClear={() => setRoutineSelectedPatientId('')}
                            variant="minimal"
                          />
                        </div>

                        <div className={`${isAdmin ? 'lg:col-span-3' : 'lg:col-span-5'} min-w-0`}>
                          <SearchableSelectField
                            label="Veterinário *"
                            placeholder="Selecionar veterinário..."
                            modalTitle="Pesquisar Veterinário Solicitante"
                            modalSubtitle="Busque por nome, CRMV ou clínica parceira"
                            searchPlaceholder="Digite o nome do veterinário, CRMV ou clínica..."
                            items={vets}
                            value={selectedVetId}
                            getId={(v) => v.id}
                            getPrimaryLabel={(v) => v.name}
                            getSecondaryLabel={(v) =>
                              `${v.crmv || 'Sem CRMV'}${v.clinic_name ? ` • ${v.clinic_name}` : ''}`
                            }
                            getBadge={(v) => v.crmv || undefined}
                            getSearchText={(v) => `${v.name} ${v.crmv || ''} ${v.clinic_name || ''}`}
                            onChange={(id) => setSelectedVetId(id)}
                            onClear={() => setSelectedVetId('')}
                            variant="minimal"
                          />
                        </div>

                        {isAdmin && (
                          <div className="lg:col-span-3 min-w-0">
                            <SearchableSelectField
                              label="Tabela"
                              placeholder="Tabela vigente..."
                              modalTitle="Selecionar Tabela de Preços / Convênio"
                              searchPlaceholder="Pesquisar tabela por nome ou vigência..."
                              items={priceTables}
                              value={selectedTableId || defaultActivePriceTable?.id || ''}
                              getId={(pt) => pt.id}
                              getPrimaryLabel={(pt) => pt.name}
                              getSecondaryLabel={(pt) => `Vigência: ${pt.start_date} a ${pt.end_date}`}
                              getSearchText={(pt) => `${pt.name} ${pt.start_date} ${pt.end_date}`}
                              onChange={(id) => setSelectedTableId(id)}
                              onClear={() =>
                                setSelectedTableId(
                                  resolveFirstActivePriceTableId(
                                    priceTables,
                                    orderDate || getTodayIsoDate()
                                  )
                                )
                              }
                              variant="minimal"
                            />
                          </div>
                        )}

                        <div className={`${isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'} min-w-0`}>
                          <label className="block text-[11px] font-medium text-[#707070] mb-1">
                            Data
                          </label>
                          <input
                            type="date"
                            value={orderDate || getTodayIsoDate()}
                            onChange={(e) => {
                              const nextDate = e.target.value;
                              setOrderDate(nextDate);
                              if (!editingOrderId && nextDate) {
                                const cur = priceTables.find((pt) => pt.id === selectedTableId);
                                if (
                                  !cur ||
                                  !cur.is_active ||
                                  cur.start_date > nextDate ||
                                  cur.end_date < nextDate
                                ) {
                                  setSelectedTableId(
                                    resolveFirstActivePriceTableId(priceTables, nextDate)
                                  );
                                }
                              }
                            }}
                            className="w-full h-[38px] px-2.5 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-[#707070]">
                              Novo Paciente *
                            </span>
                            <div className="inline-flex rounded-full bg-[#f5f5f7] p-0.5 text-[11px] font-semibold">
                              <button
                                type="button"
                                onClick={() => setRoutinePatientMode('existing')}
                                className="px-2.5 py-0.5 rounded-full transition cursor-pointer text-[#5b6675] hover:text-[#1d1d1f]"
                              >
                                Cadastrado
                              </button>
                              <button
                                type="button"
                                onClick={() => setRoutinePatientMode('new')}
                                className="px-2.5 py-0.5 rounded-full transition cursor-pointer bg-[#1d1d1f] text-white"
                              >
                                + Novo
                              </button>
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-[#f9f9fb] border border-black/8 grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-12 gap-2.5 min-w-0">
                            <div className="sm:col-span-2 lg:col-span-2 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Animal *
                              </label>
                              <input
                                type="text"
                                required
                                value={patientForm.name}
                                onChange={(e) =>
                                  setPatientForm({ ...patientForm, name: e.target.value })
                                }
                                placeholder="Ex: Apollo"
                                className="w-full h-[36px] px-2.5 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-2 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Espécie *
                              </label>
                              <select
                                required
                                value={patientForm.species}
                                onChange={(e) =>
                                  setPatientForm({ ...patientForm, species: e.target.value })
                                }
                                className="w-full h-[36px] px-2.5 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                              >
                                <option value="">Selecione...</option>
                                <option value="Canino">Canino</option>
                                <option value="Felino">Felino</option>
                                <option value="Equino">Equino</option>
                                <option value="Silvestre">Silvestre / Exótico</option>
                              </select>
                            </div>
                            <div className="sm:col-span-1 lg:col-span-1 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Sexo *
                              </label>
                              <select
                                required
                                value={patientForm.gender}
                                onChange={(e) =>
                                  setPatientForm({
                                    ...patientForm,
                                    gender: e.target.value as '' | 'M' | 'F',
                                  })
                                }
                                className="w-full h-[36px] px-2 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                              >
                                <option value="">—</option>
                                <option value="M">M</option>
                                <option value="F">F</option>
                              </select>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-2 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Idade (Anos / Meses)
                              </label>
                              <div className="grid grid-cols-2 gap-1.5">
                                <input
                                  type="number"
                                  min={0}
                                  max={60}
                                  placeholder="Anos"
                                  value={patientForm.age_years}
                                  onChange={(e) =>
                                    setPatientForm({
                                      ...patientForm,
                                      age_years:
                                        e.target.value === ''
                                          ? ''
                                          : Math.max(0, Math.floor(Number(e.target.value))),
                                    })
                                  }
                                  className="w-full h-[36px] px-2 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12px] text-[#1d1d1f]"
                                />
                                <input
                                  type="number"
                                  min={0}
                                  max={11}
                                  placeholder="Meses"
                                  value={patientForm.age_months}
                                  onChange={(e) =>
                                    setPatientForm({
                                      ...patientForm,
                                      age_months:
                                        e.target.value === ''
                                          ? ''
                                          : Math.min(11, Math.max(0, Math.floor(Number(e.target.value)))),
                                    })
                                  }
                                  className="w-full h-[36px] px-2 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12px] text-[#1d1d1f]"
                                />
                              </div>
                            </div>
                            <div className="sm:col-span-2 lg:col-span-1 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Raça
                              </label>
                              <input
                                type="text"
                                value={patientForm.breed}
                                onChange={(e) =>
                                  setPatientForm({ ...patientForm, breed: e.target.value })
                                }
                                placeholder="SRD"
                                className="w-full h-[36px] px-2.5 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-2 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Tutor *
                              </label>
                              <input
                                type="text"
                                required
                                value={patientForm.tutor_name}
                                onChange={(e) =>
                                  setPatientForm({ ...patientForm, tutor_name: e.target.value })
                                }
                                placeholder="Nome do tutor"
                                className="w-full h-[36px] px-2.5 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                              />
                            </div>
                            <div className="sm:col-span-2 lg:col-span-2 min-w-0">
                              <label className="block text-[11px] font-medium text-[#707070] mb-0.5">
                                Tel. Tutor (Opcional)
                              </label>
                              <input
                                type="text"
                                value={patientForm.tutor_phone}
                                onChange={(e) =>
                                  setPatientForm({ ...patientForm, tutor_phone: e.target.value })
                                }
                                placeholder="Opcional"
                                className="w-full h-[36px] px-2.5 rounded-xl bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 min-w-0">
                          <div className={`${isAdmin ? 'sm:col-span-5' : 'sm:col-span-8'} min-w-0`}>
                            <SearchableSelectField
                              label="Veterinário *"
                              placeholder="Selecionar veterinário..."
                              modalTitle="Pesquisar Veterinário Solicitante"
                              modalSubtitle="Busque por nome, CRMV ou clínica parceira"
                              searchPlaceholder="Digite o nome do veterinário, CRMV ou clínica..."
                              items={vets}
                              value={selectedVetId}
                              getId={(v) => v.id}
                              getPrimaryLabel={(v) => v.name}
                              getSecondaryLabel={(v) =>
                                `${v.crmv || 'Sem CRMV'}${v.clinic_name ? ` • ${v.clinic_name}` : ''}`
                              }
                              getBadge={(v) => v.crmv || undefined}
                              getSearchText={(v) => `${v.name} ${v.crmv || ''} ${v.clinic_name || ''}`}
                              onChange={(id) => setSelectedVetId(id)}
                              onClear={() => setSelectedVetId('')}
                              variant="minimal"
                            />
                          </div>
                          {isAdmin && (
                            <div className="sm:col-span-4 min-w-0">
                              <SearchableSelectField
                                label="Tabela"
                                placeholder="Tabela vigente..."
                                modalTitle="Selecionar Tabela de Preços / Convênio"
                                searchPlaceholder="Pesquisar tabela por nome ou vigência..."
                                items={priceTables}
                                value={selectedTableId || defaultActivePriceTable?.id || ''}
                                getId={(pt) => pt.id}
                                getPrimaryLabel={(pt) => pt.name}
                                getSecondaryLabel={(pt) => `Vigência: ${pt.start_date} a ${pt.end_date}`}
                                getSearchText={(pt) => `${pt.name} ${pt.start_date} ${pt.end_date}`}
                                onChange={(id) => setSelectedTableId(id)}
                                onClear={() =>
                                  setSelectedTableId(
                                    resolveFirstActivePriceTableId(
                                      priceTables,
                                      orderDate || getTodayIsoDate()
                                    )
                                  )
                                }
                                variant="minimal"
                              />
                            </div>
                          )}
                          <div className={`${isAdmin ? 'sm:col-span-3' : 'sm:col-span-4'} min-w-0`}>
                            <label className="block text-[11px] font-medium text-[#707070] mb-1">
                              Data
                            </label>
                            <input
                              type="date"
                              value={orderDate || getTodayIsoDate()}
                              onChange={(e) => {
                                const nextDate = e.target.value;
                                setOrderDate(nextDate);
                                if (!editingOrderId && nextDate) {
                                  const cur = priceTables.find((pt) => pt.id === selectedTableId);
                                  if (
                                    !cur ||
                                    !cur.is_active ||
                                    cur.start_date > nextDate ||
                                    cur.end_date < nextDate
                                  ) {
                                    setSelectedTableId(
                                      resolveFirstActivePriceTableId(priceTables, nextDate)
                                    );
                                  }
                                }
                              }}
                              className="w-full h-[38px] px-2.5 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[12.5px] text-[#1d1d1f]"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Exames */}
                    <div>
                      <label className="block text-[12px] font-semibold text-[#1d1d1f] mb-1.5">
                        Exames Solicitados *
                      </label>
                      <ExamMultiPicker
                        key={orderModalResetKey}
                        exams={exams}
                        selectedExamIds={selectedExamIds}
                        onChange={setSelectedExamIds}
                        activePriceTable={effectiveOrderPriceTable}
                        minimal
                        listMaxHeightClass="max-h-[360px] sm:max-h-[410px]"
                        hidePrices={!isAdmin}
                      />
                    </div>

                    {/* Observações */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#707070] mb-1">
                        Observações Clínicas / Amostra (Opcional)
                      </label>
                      <input
                        type="text"
                        value={orderNotes}
                        onChange={(e) => setOrderNotes(e.target.value)}
                        placeholder="Informe suspeita clínica, condições da amostra ou urgência..."
                        className="w-full h-[40px] px-3.5 rounded-xl bg-[#f5f5f7] border border-transparent focus:bg-white focus:border-[#0071e3] focus:outline-none text-[13px] text-[#1d1d1f]"
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-4 border-t border-black/5 bg-[#fafafa] flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <div className="flex items-center gap-2.5 text-[12.5px]">
                      <span className="text-[12.5px] font-medium text-[#5b6675]">
                        {validSelectedExamIds.length} exame(s) selecionado(s)
                        {totalLabels > 0 ? ` • ${totalLabels} etiqueta(s)` : ''}
                      </span>
                      {isAdmin && (
                        <span className="font-mono text-[16px] font-bold text-[#1d1d1f]">
                          • R$ {calculatedOrderTotal.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2.5 ml-auto">
                      <button
                        type="button"
                        onClick={handleCloseOrderModal}
                        className="px-5 py-2.5 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[12.5px] font-semibold transition cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2.5 rounded-full bg-[#0071e3] text-white text-[13px] font-semibold hover:opacity-95 transition cursor-pointer shadow-sm"
                      >
                        {editingOrderId ? 'Salvar Alterações' : 'Registrar Atendimento'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          );
        })()}

      {/* MODAL DE CADASTRO RÁPIDO DE VETERINÁRIO / CLÍNICA NA CONVERSÃO DE COLETA */}
      {quickVetModal && (
        <div
          className="fixed inset-0 z-[65] bg-[#1d1d1f]/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setQuickVetModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const created = await api.createVet({
                  name: quickVetModal.name,
                  email: quickVetModal.email,
                  phone: quickVetModal.phone,
                  password: quickVetModal.password,
                  clinic_name: quickVetModal.clinic_name,
                  crmv: quickVetModal.crmv,
                });
                setVets((prev) => [created, ...prev]);
                setSelectedVetId(created.id);
                setConvertingVetMatched(true);
                setQuickVetModal(null);
                showToast(`Veterinário/Clínica "${created.name}" cadastrado e vinculado ao atendimento!`);
              } catch (err: any) {
                showToast(err?.message || 'Erro ao cadastrar veterinário.');
              }
            }}
            className="bg-white rounded-[24px] sm:rounded-[28px] max-w-lg w-full min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 pb-2 border-b border-[#e5e5ea]">
              <div>
                <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                  Cadastrar Veterinário / Clínica Parceira
                </h3>
                <p className="text-[12px] text-[#707070] mt-0.5">
                  Já cria o acesso ao Portal do Veterinário e vincula automaticamente a este atendimento.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickVetModal(null)}
                className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">Nome / Responsável *</label>
                <input
                  type="text"
                  required
                  value={quickVetModal.name}
                  onChange={(e) =>
                    setQuickVetModal((prev) => (prev ? { ...prev, name: e.target.value } : null))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">E-mail de Acesso *</label>
                <input
                  type="email"
                  required
                  value={quickVetModal.email}
                  onChange={(e) =>
                    setQuickVetModal((prev) => (prev ? { ...prev, email: e.target.value } : null))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">Telefone / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={quickVetModal.phone}
                  onChange={(e) =>
                    setQuickVetModal((prev) => (prev ? { ...prev, phone: e.target.value } : null))
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">Senha de Acesso *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={quickVetModal.password}
                  onChange={(e) =>
                    setQuickVetModal((prev) => (prev ? { ...prev, password: e.target.value } : null))
                  }
                  placeholder="Mínimo 4 caracteres"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">Clínica (Opcional)</label>
                <input
                  type="text"
                  value={quickVetModal.clinic_name}
                  onChange={(e) =>
                    setQuickVetModal((prev) =>
                      prev ? { ...prev, clinic_name: e.target.value } : null
                    )
                  }
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">CRMV Obrigatório *</label>
                <input
                  type="text"
                  required
                  value={quickVetModal.crmv}
                  onChange={(e) =>
                    setQuickVetModal((prev) => (prev ? { ...prev, crmv: e.target.value.toUpperCase() } : null))
                  }
                  placeholder="Ex: CRMV-MG 12345"
                  className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] font-mono uppercase text-[13px]"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickVetModal(null)}
                className="px-4 py-2.5 sm:py-2 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[12px] font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 sm:py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition"
              >
                Cadastrar e Vincular
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE AGENDAMENTO DE COLETA (DATA E HORA) */}
      {scheduleModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2240]/45 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          onClick={() => setScheduleModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              const targetId = scheduleModal.collection.id || `col-${Date.now()}`;
              try {
                const updated = await api.updateCollectionRequestStatus(
                  targetId,
                  'agendada',
                  scheduleModal.date,
                  scheduleModal.time
                );
                setCollectionRequests((prev) =>
                  prev.map((item) =>
                    item.id === scheduleModal.collection.id || item.id === updated.id
                      ? {
                          ...item,
                          ...updated,
                          status: 'agendada',
                          scheduled_date: scheduleModal.date,
                          scheduled_time: scheduleModal.time,
                        }
                      : item
                  )
                );
                showToast(
                  `Coleta agendada para ${scheduleModal.date.split('-').reverse().join('/')} às ${scheduleModal.time}!`
                );
                setScheduleModal(null);
              } catch (err: any) {
                showToast(err?.message || 'Erro ao agendar coleta. Tente novamente.');
              }
            }}
            className="bg-white rounded-[24px] sm:rounded-[28px] max-w-md w-full min-w-0 p-4 sm:p-6 space-y-4 shadow-2xl border border-black/10"
          >
            <div className="flex items-start justify-between gap-3 pb-2 border-b border-[#e5e5ea]">
              <div className="min-w-0">
                <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                  Agendar Retirada de Coleta
                </h3>
                <p className="text-[12px] text-[#707070] mt-0.5 break-words">
                  {scheduleModal.collection.clinic_or_tutor_name} • {scheduleModal.collection.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleModal(null)}
                className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">Data da Coleta *</label>
                <input
                  type="date"
                  required
                  value={scheduleModal.date}
                  onChange={(e) =>
                    setScheduleModal((prev) => (prev ? { ...prev, date: e.target.value } : null))
                  }
                  className="w-full min-w-0 px-3.5 py-2.5 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#707070] mb-1">Horário *</label>
                <input
                  type="time"
                  required
                  value={scheduleModal.time}
                  onChange={(e) =>
                    setScheduleModal((prev) => (prev ? { ...prev, time: e.target.value } : null))
                  }
                  className="w-full min-w-0 px-3.5 py-2.5 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setScheduleModal(null)}
                className="px-4 py-2.5 sm:py-2 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[12px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 sm:py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer"
              >
                Confirmar Agendamento
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE CADASTRO / EDIÇÃO COMPLETA DE AGENDAMENTO DE COLETA */}
      {collectionCrudModal && (
        <div
          className="fixed inset-0 z-50 bg-[#0b2240]/45 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
          onClick={() => setCollectionCrudModal(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!collectionCrudModal.crmv.trim() || collectionCrudModal.crmv.trim().length < 3) {
                showToast('Informe o CRMV obrigatório do médico veterinário solicitante.');
                return;
              }
              try {
                if (collectionCrudModal.id) {
                  const updated = await api.updateCollectionRequest(collectionCrudModal.id, {
                    clinic_or_tutor_name: collectionCrudModal.clinic_or_tutor_name.trim(),
                    crmv: collectionCrudModal.crmv.trim().toUpperCase(),
                    phone: collectionCrudModal.phone.trim(),
                    email: collectionCrudModal.email.trim(),
                    address: collectionCrudModal.address.trim(),
                    preferred_date:
                      collectionCrudModal.scheduled_date || collectionCrudModal.preferred_date,
                    scheduled_date: collectionCrudModal.scheduled_date,
                    scheduled_time: collectionCrudModal.scheduled_time,
                    status: collectionCrudModal.status,
                    notes: collectionCrudModal.notes.trim(),
                  });
                  setCollectionRequests((prev) =>
                    prev.map((item) =>
                      item.id === collectionCrudModal.id || item.id === updated.id
                        ? { ...item, ...updated }
                        : item
                    )
                  );
                  showToast('Agendamento de coleta atualizado com sucesso!');
                } else {
                  const created = await api.createCollectionRequest({
                    clinic_or_tutor_name: collectionCrudModal.clinic_or_tutor_name.trim(),
                    crmv: collectionCrudModal.crmv.trim().toUpperCase(),
                    phone: collectionCrudModal.phone.trim(),
                    email: collectionCrudModal.email.trim(),
                    address: collectionCrudModal.address.trim(),
                    preferred_date:
                      collectionCrudModal.scheduled_date || collectionCrudModal.preferred_date,
                    scheduled_date: collectionCrudModal.scheduled_date,
                    scheduled_time: collectionCrudModal.scheduled_time,
                    status: collectionCrudModal.status,
                    notes: collectionCrudModal.notes.trim(),
                  });
                  setCollectionRequests((prev) => [created, ...prev]);
                  showToast('Novo agendamento de coleta registrado com sucesso!');
                }
                setCollectionCrudModal(null);
              } catch (err: any) {
                showToast(err?.message || 'Erro ao salvar agendamento de coleta.');
              }
            }}
            className="bg-white rounded-[24px] sm:rounded-[28px] max-w-2xl w-[95vw] min-w-0 max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4 shadow-2xl border border-black/10"
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-black/5">
              <div>
                <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                  {collectionCrudModal.id
                    ? 'Editar Agendamento de Coleta'
                    : 'Novo Agendamento de Coleta'}
                </h3>
                <p className="text-[12px] text-[#707070] mt-0.5">
                  Vincule um veterinário parceiro ou preencha os dados de retirada e horário programado.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCollectionCrudModal(null)}
                className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Preenchimento rápido a partir de Veterinário cadastrado */}
            <div>
              <SearchableSelectField
                label="Preencher com Veterinário / Clínica Cadastrada (Opcional)"
                placeholder="Selecionar veterinário parceiro para preencher automático..."
                modalTitle="Selecionar Veterinário Parceiro"
                modalSubtitle="Preenche automaticamente nome, CRMV, telefone e e-mail"
                searchPlaceholder="Buscar por nome, CRMV ou clínica..."
                items={vets}
                value=""
                getId={(v) => v.id}
                getPrimaryLabel={(v) => `${v.name}${v.clinic_name ? ` • ${v.clinic_name}` : ''}`}
                getSecondaryLabel={(v) => `${v.crmv || ''} • ${v.phone || v.email}`}
                getBadge={(v) => v.crmv || undefined}
                getSearchText={(v) => `${v.name} ${v.crmv || ''} ${v.clinic_name || ''}`}
                onChange={(vetId) => {
                  const found = vets.find((v) => v.id === vetId);
                  if (found) {
                    setCollectionCrudModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            clinic_or_tutor_name: found.clinic_name
                              ? `${found.clinic_name} (${found.name})`
                              : found.name,
                            crmv: found.crmv || prev.crmv,
                            phone: found.phone || prev.phone,
                            email: found.email || prev.email,
                          }
                        : null
                    );
                  }
                }}
                variant="minimal"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-7">
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  Clínica / Médico Veterinário Solicitante *
                </label>
                <input
                  type="text"
                  required
                  value={collectionCrudModal.clinic_or_tutor_name}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev ? { ...prev, clinic_or_tutor_name: e.target.value } : null
                    )
                  }
                  placeholder="Ex: Clínica VetCare (Dr. Carlos)"
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div className="sm:col-span-5">
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  CRMV Obrigatório *
                </label>
                <input
                  type="text"
                  required
                  value={collectionCrudModal.crmv}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev ? { ...prev, crmv: e.target.value.toUpperCase() } : null
                    )
                  }
                  placeholder="Ex: CRMV-MG 12345"
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] font-mono uppercase text-[13px]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  Telefone / WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  value={collectionCrudModal.phone}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev ? { ...prev, phone: e.target.value } : null
                    )
                  }
                  placeholder="(00) 00000-0000"
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  value={collectionCrudModal.email}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev ? { ...prev, email: e.target.value } : null
                    )
                  }
                  placeholder="clinica@email.com.br"
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#707070] mb-1">
                Endereço Completo de Retirada *
              </label>
              <input
                type="text"
                required
                value={collectionCrudModal.address}
                onChange={(e) =>
                  setCollectionCrudModal((prev) =>
                    prev ? { ...prev, address: e.target.value } : null
                  )
                }
                placeholder="Rua, número, bairro, cidade..."
                className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  Data Agendada *
                </label>
                <input
                  type="date"
                  required
                  value={collectionCrudModal.scheduled_date}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev ? { ...prev, scheduled_date: e.target.value } : null
                    )
                  }
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  Horário *
                </label>
                <input
                  type="time"
                  required
                  value={collectionCrudModal.scheduled_time}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev ? { ...prev, scheduled_time: e.target.value } : null
                    )
                  }
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[#707070] mb-1">
                  Status
                </label>
                <select
                  value={collectionCrudModal.status}
                  onChange={(e) =>
                    setCollectionCrudModal((prev) =>
                      prev
                        ? {
                            ...prev,
                            status: e.target.value as
                              | 'pendente'
                              | 'agendada'
                              | 'concluida'
                              | 'cancelada',
                          }
                        : null
                    )
                  }
                  className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
                >
                  <option value="agendada">Agendada</option>
                  <option value="pendente">Pendente</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#707070] mb-1">
                Observações / Amostras (Tubos, Urgência, Cuidados)
              </label>
              <input
                type="text"
                value={collectionCrudModal.notes}
                onChange={(e) =>
                  setCollectionCrudModal((prev) =>
                    prev ? { ...prev, notes: e.target.value } : null
                  )
                }
                placeholder="Ex: 2 tubos EDTA + 1 tubo tampa amarela refrigerados na recepção"
                className="w-full h-[38px] px-3 rounded-xl bg-[#f5f5f7] text-[13px]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-black/5">
              <button
                type="button"
                onClick={() => setCollectionCrudModal(null)}
                className="px-4 py-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[12px] font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-full bg-[#0071e3] text-white text-[12.5px] font-semibold hover:opacity-95 transition cursor-pointer"
              >
                {collectionCrudModal.id ? 'Salvar Alterações' : 'Registrar Agendamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL DE IMPRESSÃO DE ETIQUETAS DE COLETA — ZEBRA 50mm x 30mm (P&B, SEM CÓDIGO DE BARRAS) */}
      {labelsModal && (
        <div
          className="fixed inset-0 z-[65] bg-[#1d1d1f]/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
          onClick={() => setLabelsModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[24px] sm:rounded-[28px] max-w-3xl w-full min-w-0 max-h-[88vh] overflow-y-auto p-4 sm:p-8 space-y-4 sm:space-y-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[11px] sm:text-[12px] font-mono text-[#86868b] block truncate">
                  PROTOCOLO: {labelsModal.order.protocol_code} • ZEBRA TÉRMICA 50×30mm (P&amp;B)
                </span>
                <h3 className="font-display text-[18px] sm:text-[24px] font-semibold text-[#1d1d1f] leading-snug">
                  Etiquetas de Amostra Biológica ({labelsModal.labels.length} unidades)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLabelsModal(null)}
                className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                aria-label="Fechar"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadThermalLabelsPdf(labelsModal.labels, labelsModal.order.protocol_code)
                }
                className="flex-1 sm:flex-initial justify-center px-4 py-2 rounded-[980px] bg-[#1d1d1f] hover:bg-black text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <FileDown className="w-4 h-4 shrink-0" />
                <span>Baixar PDF (50×30mm)</span>
              </button>
              <button
                type="button"
                onClick={() => printCollectionLabelsWindow(labelsModal.labels)}
                className="flex-1 sm:flex-initial justify-center px-4 py-2 rounded-[980px] bg-[#0071e3] hover:opacity-95 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>Imprimir Térmica</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {labelsModal.labels.map((lbl) => (
                <div
                  key={lbl.label_id}
                  className="rounded-xl border-2 border-black bg-white text-black p-3 space-y-1.5 text-[11.5px] min-w-0 font-sans"
                >
                  {/* Cabeçalho Branco com VETLIFE e Código do Protocolo Maior */}
                  <div className="bg-white text-black border-b-2 border-black pb-1 flex items-baseline justify-between gap-2 font-mono font-bold">
                    <span className="text-[12px] tracking-tight shrink-0">VETLIFE</span>
                    <span className="text-[15px] sm:text-[16px] font-extrabold tracking-tight truncate">
                      {lbl.protocol_code}
                    </span>
                    <span className="text-[12px] shrink-0">
                      {lbl.label_index}/{lbl.total_labels_for_exam}
                    </span>
                  </div>

                  {/* Paciente + Data + Espécie na mesma linha com fonte maior e mais visível */}
                  <div className="flex items-baseline justify-between gap-2 pt-0.5">
                    <span
                      className="font-extrabold text-[14px] uppercase leading-tight truncate max-w-[44%]"
                      title={lbl.patient_name}
                    >
                      {lbl.patient_name}
                    </span>
                    <span className="text-[11.5px] font-semibold whitespace-nowrap shrink-0">
                      {lbl.created_at
                        ? new Date(lbl.created_at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : ''}
                    </span>
                    <span className="text-[11.5px] font-bold whitespace-nowrap shrink-0">
                      ESP: {lbl.species}
                    </span>
                  </div>

                  {/* Tutor com linha divisória */}
                  <div className="text-[12px] font-medium leading-tight truncate border-b border-black pb-1">
                    <strong>Tutor:</strong> {lbl.tutor_name}
                  </div>

                  {/* Tubo / Material */}
                  <div className="text-[11.5px] leading-snug line-clamp-2 break-words">
                    <strong>Tubo:</strong> {lbl.tube_type}
                  </div>

                  {/* Rodapé focado em: CÓDIGO | NOME/RESUMO DO EXAME (sem repetir protocolo) */}
                  <div className="border border-black px-2.5 py-1.5 bg-white">
                    <div className="text-[12px] leading-snug line-clamp-2 break-words">
                      <span className="font-mono font-extrabold text-[13.5px]">
                        {lbl.exam_code}
                      </span>
                      <span className="mx-1.5 font-bold">|</span>
                      <span className="font-semibold">{lbl.exam_name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 3: LAUDOS (AGRUPADO POR ATENDIMENTO, LAYOUT SLIM + EDITOR)
         ===================================================================== */}
      {activeTab === 'launch' && launchSubView === 'list' && (() => {
        const groupedOrders = orders.map((ord) => {
          const examItems = (ord.results || []).map((res) => {
            const meta = getOrderResultMeta(res);
            const itemStatus: 'pendente' | 'em_analise' | 'concluido' =
              meta.isReleased || ord.status === 'concluido'
                ? 'concluido'
                : meta.hasDraft || ord.status === 'em_analise'
                  ? 'em_analise'
                  : 'pendente';
            return { res, meta, itemStatus };
          });

          const totalExams = examItems.length;
          const completedExams = examItems.filter((i) => i.itemStatus === 'concluido').length;
          const anyInAnalysis = examItems.some((i) => i.itemStatus === 'em_analise');

          const orderStatus: 'pendente' | 'em_analise' | 'concluido' =
            (totalExams > 0 && completedExams === totalExams) || ord.status === 'concluido'
              ? 'concluido'
              : completedExams > 0 || anyInAnalysis || ord.status === 'em_analise'
                ? 'em_analise'
                : 'pendente';

          const firstPendingItem =
            examItems.find((i) => i.itemStatus !== 'concluido') || examItems[0];

          return {
            ord,
            examItems,
            totalExams,
            completedExams,
            orderStatus,
            firstPendingItem,
          };
        });

        const counts = {
          todos: groupedOrders.length,
          pendente: groupedOrders.filter((g) => g.orderStatus === 'pendente').length,
          em_analise: groupedOrders.filter((g) => g.orderStatus === 'em_analise').length,
          concluido: groupedOrders.filter((g) => g.orderStatus === 'concluido').length,
        };

        const q = launchSearch.trim().toLowerCase();
        const filteredOrders = groupedOrders.filter(({ ord, examItems, orderStatus }) => {
          if (launchStatusFilter !== 'todos' && orderStatus !== launchStatusFilter) {
            return false;
          }
          if (!q) return true;
          const examsHaystack = examItems.map((i) => `${i.meta.code} ${i.meta.name}`).join(' ');
          return `${ord.protocol_code} ${examsHaystack} ${ord.patient?.name || ''} ${ord.patient?.tutor_name || ''
            } ${ord.vet?.name || ''} ${ord.vet?.clinic_name || ''}`
            .toLowerCase()
            .includes(q);
        });

        const pagedOrders = filteredOrders.slice((launchPage - 1) * 12, launchPage * 12);

        const toggleExpandOrder = (orderId: string) => {
          setExpandedLaunchOrderIds((prev) =>
            prev.includes(orderId) ? prev.filter((id) => id !== orderId) : [...prev, orderId]
          );
        };

        const openExamEditor = (orderId: string, resultId: string) => {
          pushNavSnapshot();
          setSelectedOrderId(orderId);
          setSelectedResultId(resultId);
          setLaunchSubView('editor');
        };

        return (
          <div className="bg-white rounded-[22px] p-4 sm:p-5 space-y-3.5 border border-black/5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div className="min-w-0">
                <h2 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f] leading-tight">
                  Laudos por Atendimento
                </h2>
                <p className="text-[11.5px] text-[#707070] mt-0.5">
                  Clique em um atendimento para expandir os exames e lançar ou revisar os laudos.
                </p>
              </div>
              <input
                type="text"
                value={launchSearch}
                onChange={(e) => setLaunchSearch(e.target.value)}
                placeholder="Buscar protocolo, exame, paciente, tutor ou vet..."
                className="w-full md:w-80 px-3.5 py-2 rounded-full bg-[#f5f5f7] text-[12px] text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'todos' as const, label: 'Todos', count: counts.todos },
                { id: 'pendente' as const, label: 'Pendentes', count: counts.pendente },
                { id: 'em_analise' as const, label: 'Em Análise', count: counts.em_analise },
                { id: 'concluido' as const, label: 'Concluídos', count: counts.concluido },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLaunchStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${launchStatusFilter === tab.id
                    ? 'bg-[#0b2240] text-white'
                    : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e5e5ea]'
                    }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${launchStatusFilter === tab.id
                      ? 'bg-white/20 text-white'
                      : 'bg-white text-[#1d1d1f]'
                      }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full table-fixed text-left border-collapse text-[11.5px]">
                <thead>
                  <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed] text-[10px]">
                    <th className="py-2 px-2 font-semibold w-[16%]">Protocolo</th>
                    <th className="py-2 px-2 font-semibold w-[16%]">Paciente</th>
                    <th className="py-2 px-2 font-semibold w-[22%]">Tutor / Vet</th>
                    <th className="py-2 px-2 font-semibold w-[14%]">Exames</th>
                    <th className="py-2 px-2 font-semibold w-[11%]">Status</th>
                    <th className="py-2 px-2 font-semibold text-right w-[21%]">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f0f5]">
                  {pagedOrders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#707070] text-[12px]">
                        Nenhum atendimento encontrado para este filtro.
                      </td>
                    </tr>
                  ) : (
                    pagedOrders.map(({ ord, examItems, totalExams, completedExams, orderStatus, firstPendingItem }) => {
                      const isExpanded = expandedLaunchOrderIds.includes(ord.id);
                      const shortDate = ord.created_at
                        ? new Date(ord.created_at).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                          })
                        : '';

                      return (
                        <React.Fragment key={ord.id}>
                          <tr
                            onClick={() => toggleExpandOrder(ord.id)}
                            className={`transition cursor-pointer ${
                              isExpanded ? 'bg-[#f5f8fc]' : 'hover:bg-[#f5f5f7]/70'
                            }`}
                          >
                            <td className="py-2 px-2 align-middle">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="p-0.5 rounded-md text-[#5b6675] shrink-0">
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5 text-[#0071e3]" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-mono font-bold text-[#1d1d1f] truncate">
                                    {ord.protocol_code}
                                  </div>
                                  {shortDate && (
                                    <div className="text-[10px] text-[#86868b] leading-tight">
                                      {shortDate}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-2 px-2 align-middle">
                              <div
                                className="font-semibold text-[#1d1d1f] truncate"
                                title={ord.patient?.name || ''}
                              >
                                {ord.patient?.name || '—'}
                              </div>
                              <div
                                className="text-[10.5px] text-[#707070] truncate"
                                title={`${ord.patient?.species || ''} • ${ord.patient?.breed || ''}`}
                              >
                                {ord.patient?.species || '—'}
                                {ord.patient?.breed ? ` • ${ord.patient.breed}` : ''}
                              </div>
                            </td>

                            <td className="py-2 px-2 align-middle">
                              <div
                                className="text-[#1d1d1f] font-medium truncate"
                                title={ord.patient?.tutor_name || ''}
                              >
                                {ord.patient?.tutor_name || '—'}
                              </div>
                              <div
                                className="text-[10.5px] text-[#707070] truncate"
                                title={`${ord.vet?.name || ''} ${ord.vet?.crmv ? `(${ord.vet.crmv})` : ''}`}
                              >
                                {ord.vet?.name || '—'}
                              </div>
                            </td>

                            <td className="py-2 px-2 align-middle">
                              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[10.5px] font-semibold whitespace-nowrap">
                                <span>
                                  {completedExams}/{totalExams}
                                </span>
                                <span className="text-[#707070] font-normal">
                                  {totalExams === 1 ? 'exame' : 'exames'}
                                </span>
                              </div>
                            </td>

                            <td className="py-2 px-2 align-middle">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-semibold whitespace-nowrap ${
                                  orderStatus === 'concluido'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : orderStatus === 'em_analise'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-[#f5f5f7] text-[#1d1d1f]'
                                }`}
                              >
                                {orderStatus === 'concluido'
                                  ? 'Concluído'
                                  : orderStatus === 'em_analise'
                                    ? 'Em Análise'
                                    : 'Pendente'}
                              </span>
                            </td>

                            <td
                              className="py-2 px-2 align-middle text-right"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="inline-flex items-center justify-end gap-1 flex-nowrap">
                                {orderStatus === 'concluido' ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => downloadOrderPdf(ord)}
                                      title="Baixar PDF Completo"
                                      className="px-2 py-1 rounded-full border border-[#1d1d1f]/25 text-[#1d1d1f] hover:bg-[#1d1d1f] hover:text-white text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                                    >
                                      <FileDown className="w-3 h-3" />
                                      <span>PDF</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendOrderWhatsApp(ord)}
                                      title="Enviar laudo por WhatsApp para o veterinário"
                                      className="px-2 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                                    >
                                      <MessageCircle className="w-3 h-3" />
                                      <span>Whats</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendOrderEmail(ord)}
                                      title="Enviar laudo por e-mail para o veterinário"
                                      className="px-2 py-1 rounded-full bg-[#0071e3] hover:bg-[#0062c4] text-white text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                                    >
                                      <Mail className="w-3 h-3" />
                                      <span>E-mail</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandOrder(ord.id)}
                                      title={isExpanded ? 'Recolher exames' : 'Ver / editar exames'}
                                      className="px-2 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shrink-0"
                                    >
                                      <Pencil className="w-3 h-3" />
                                      <span>Itens</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {firstPendingItem && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openExamEditor(ord.id, firstPendingItem.res.id)
                                        }
                                        className={`px-2.5 py-1 rounded-full text-white text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shrink-0 ${
                                          orderStatus === 'em_analise'
                                            ? 'bg-amber-500 hover:bg-amber-600'
                                            : 'bg-[#0071e3] hover:bg-[#0062c4]'
                                        }`}
                                      >
                                        <FlaskConical className="w-3 h-3" />
                                        <span>
                                          {orderStatus === 'em_analise' ? 'Continuar' : 'Lançar'}
                                        </span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => toggleExpandOrder(ord.id)}
                                      title={isExpanded ? 'Recolher exames' : 'Ver exames do atendimento'}
                                      className="px-2 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[10.5px] font-semibold inline-flex items-center gap-0.5 transition cursor-pointer shrink-0"
                                    >
                                      <span>Exames</span>
                                      {isExpanded ? (
                                        <ChevronDown className="w-3 h-3" />
                                      ) : (
                                        <ChevronRight className="w-3 h-3" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* SUB-LISTA EXPANDIDA: EXAMES DO ATENDIMENTO */}
                          {isExpanded && (
                            <tr className="bg-[#f8fafc]">
                              <td colSpan={6} className="px-3 py-2.5 border-t border-slate-200/70">
                                <div className="pl-4 border-l-2 border-[#0071e3]/40 space-y-1.5">
                                  <div className="flex items-center justify-between text-[10.5px] font-semibold text-[#5b6675] pb-0.5">
                                    <span>
                                      Exames de {ord.protocol_code} ({completedExams} de {totalExams}{' '}
                                      concluído{completedExams === 1 ? '' : 's'})
                                    </span>
                                  </div>
                                  {examItems.map(({ res, meta, itemStatus }, idx) => (
                                    <div
                                      key={res.id}
                                      className="bg-white rounded-xl px-3 py-1.5 border border-slate-200/70 flex items-center justify-between gap-2.5"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="text-[10px] font-mono text-[#86868b] shrink-0">
                                          #{idx + 1}
                                        </span>
                                        <span className="font-mono text-[11px] font-bold text-[#0071e3] bg-[#e8f2fd] px-1.5 py-0.5 rounded shrink-0">
                                          {meta.code}
                                        </span>
                                        <span
                                          className="text-[11.5px] font-semibold text-[#1d1d1f] truncate"
                                          title={meta.name}
                                        >
                                          {meta.name}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                                            itemStatus === 'concluido'
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : itemStatus === 'em_analise'
                                                ? 'bg-amber-100 text-amber-800'
                                                : 'bg-[#f5f5f7] text-[#5b6675]'
                                          }`}
                                        >
                                          {itemStatus === 'concluido'
                                            ? 'Concluído'
                                            : itemStatus === 'em_analise'
                                              ? 'Em Análise'
                                              : 'Pendente'}
                                        </span>

                                        {itemStatus === 'concluido' ? (
                                          <button
                                            type="button"
                                            onClick={() => openExamEditor(ord.id, res.id)}
                                            className="px-2.5 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                          >
                                            <Pencil className="w-3 h-3" />
                                            Revisar / Editar
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => openExamEditor(ord.id, res.id)}
                                            className={`px-2.5 py-1 rounded-full text-white text-[10.5px] font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                                              itemStatus === 'em_analise'
                                                ? 'bg-amber-500 hover:bg-amber-600'
                                                : 'bg-[#0071e3] hover:bg-[#0062c4]'
                                            }`}
                                          >
                                            <FlaskConical className="w-3 h-3" />
                                            {itemStatus === 'em_analise'
                                              ? 'Continuar Laudo'
                                              : 'Lançar Laudo'}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <PaginationBar
              page={launchPage}
              pageSize={12}
              totalItems={filteredOrders.length}
              onPageChange={setLaunchPage}
            />
          </div>
        );
      })()}

      {activeTab === 'launch' && launchSubView === 'editor' && currentOrder && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          <div className="lg:col-span-6 bg-white rounded-[24px] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={handleGoBack}
                  className="mb-2 px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                >
                  ← Voltar para Tela Anterior
                </button>
                <span className="block text-[12px] uppercase text-[#86868b]">Bancada Biomédica</span>
                <h2 className="font-display text-[20px] sm:text-[24px] font-semibold text-[#1d1d1f]">
                  Lançamento Dinâmico de Resultados
                </h2>
              </div>
              <div className="w-full sm:w-[360px]">
                <SearchableSelectField
                  modalTitle="Selecionar Atendimento / Protocolo"
                  modalSubtitle="Pesquise por código do protocolo, nome do animal, tutor ou veterinário"
                  searchPlaceholder="Ex: VET-2026-0001, Thor, Marcelo..."
                  items={orders}
                  value={currentOrder.id}
                  getId={(o) => o.id}
                  getPrimaryLabel={(o) =>
                    `${o.protocol_code} — ${o.patient?.name || 'Paciente'} (${o.patient?.species || ''})`
                  }
                  getSecondaryLabel={(o) =>
                    `Tutor: ${o.patient?.tutor_name || 'N/D'} • Vet: ${o.vet?.name || 'N/D'}`
                  }
                  getBadge={(o) => o.status}
                  getSearchText={(o) =>
                    `${o.protocol_code} ${o.patient?.name || ''} ${o.patient?.species || ''} ${o.patient?.tutor_name || ''
                    } ${o.vet?.name || ''} ${o.status}`
                  }
                  filterChips={[
                    { id: 'pending', label: 'Pendentes', predicate: (o) => o.status === 'pendente' },
                    { id: 'analyzing', label: 'Em Análise', predicate: (o) => o.status === 'em_analise' },
                    { id: 'done', label: 'Concluídos', predicate: (o) => o.status === 'concluido' },
                  ]}
                  onChange={(id) => setSelectedOrderId(id)}
                  compact
                />
              </div>
            </div>

            {(() => {
              const allResults = currentOrder.results || [];
              const completedCount = allResults.filter((r) => Boolean(r.released_at)).length;
              const pendingOthersCount = allResults.filter(
                (r) => r.id !== currentResultItem?.id && !r.released_at
              ).length;
              return (
                <div className="space-y-2">
                  {allResults.length > 1 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#f5f8fc] border border-[#0071e3]/15 text-[11px]">
                      <span className="font-semibold text-[#0b2240]">
                        Progresso do atendimento {currentOrder.protocol_code}:{' '}
                        <span className="text-[#0071e3]">
                          {completedCount}/{allResults.length} concluído{completedCount === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className="text-[#5b6675]">
                        {pendingOthersCount > 0
                          ? `${pendingOthersCount} outro${pendingOthersCount > 1 ? 's' : ''} exame${pendingOthersCount > 1 ? 's' : ''} aguardando lançamento`
                          : currentResultItem?.released_at
                            ? 'Todos os exames deste atendimento já foram lançados'
                            : 'Último exame pendente — ao concluir, o atendimento será finalizado'}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {allResults.map((r) => {
                      const fallbackExam = exams.find((e) => e.id === r.exam_id);
                      const examCode = r.exam_code || fallbackExam?.code || 'EXAME';
                      const examName = r.exam_name || fallbackExam?.name || '';
                      const isReleased = Boolean(r.released_at);
                      const isActive = currentResultItem?.id === r.id;
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleSelectResultItem(r.id)}
                          title={`[${examCode}] ${examName}`}
                          className={`px-3 py-1.5 rounded-full text-[11.5px] font-semibold transition text-left inline-flex items-center gap-1.5 max-w-full cursor-pointer ${
                            isActive
                              ? 'bg-[#0071e3] text-white'
                              : isReleased
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                                : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'
                          }`}
                        >
                          {isReleased && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                          <span className="truncate max-w-[260px]">
                            [{examCode}] {examName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="p-3.5 rounded-2xl bg-[#f5f5f7] space-y-1 text-[11px]">
              <div className="font-semibold text-[#1d1d1f] flex items-start sm:items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0071e3] shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  Valor de Referência Cruzado Automaticamente ({currentOrder.patient?.species}, Sexo{' '}
                  {currentOrder.patient?.gender}, Idade:{' '}
                  {formatAgeLabel(currentOrder.patient?.age_days, currentOrder.patient?.birth_date)}):
                </span>
              </div>
              <div className="text-[#707070] leading-snug break-words">
                {matchedRefForCurrentResult?.reference_text_content ||
                  currentResultItem?.reference_snapshot ||
                  'Referência clínica padrão para a espécie e faixa etária.'}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[#86868b]">
                  Parâmetros de Entrada de [
                  {currentResultItem?.exam_code ||
                    exams.find((e) => e.id === currentResultItem?.exam_id)?.code ||
                    currentResultItem?.exam_name ||
                    'Exame'}
                  ]:
                </h3>
                <span className="text-[11px] text-[#86868b] shrink-0">
                  {dynamicFieldsToRender.length} parâmetro(s)
                </span>
              </div>

              <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2.5">
                {dynamicFieldsToRender.map((fld) => {
                  const val = dynamicValues[fld.field_name] ?? '';
                  return (
                    <div
                      key={fld.id || fld.field_name}
                      className={fld.field_type === 'text' ? 'col-span-1 xs:col-span-2 sm:col-span-3' : ''}
                    >
                      <label className="block text-[11px] font-semibold text-[#5b6675] mb-1 truncate" title={fld.field_label || fld.field_name}>
                        {fld.field_label || fld.field_name}{' '}
                        {fld.unit && <span className="text-[#1d1d1f] font-mono font-normal">({fld.unit})</span>}
                        {fld.is_required && <span className="text-[#0071e3] ml-0.5">*</span>}
                      </label>

                      {fld.field_type === 'select' ? (
                        <select
                          value={val}
                          onChange={(e) =>
                            setDynamicValues({ ...dynamicValues, [fld.field_name]: e.target.value })
                          }
                          className="w-full h-9 px-2.5 rounded-xl bg-[#f5f5f7] text-[12px] text-[#1d1d1f]"
                        >
                          <option value="">Selecione...</option>
                          {(fld.options || []).map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : fld.field_type === 'number' ? (
                        <input
                          type="number"
                          step="any"
                          value={val}
                          onChange={(e) =>
                            setDynamicValues({
                              ...dynamicValues,
                              [fld.field_name]:
                                e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          placeholder={fld.unit ? `Ex: ${fld.unit}` : 'Valor'}
                          className="w-full h-9 px-2.5 rounded-xl bg-[#f5f5f7] font-mono text-[13px] font-semibold text-[#1d1d1f]"
                        />
                      ) : (
                        <input
                          type="text"
                          value={val}
                          onChange={(e) =>
                            setDynamicValues({ ...dynamicValues, [fld.field_name]: e.target.value })
                          }
                          placeholder="Descreva o achado laboratorial..."
                          className="w-full h-9 px-3 rounded-xl bg-[#f5f5f7] text-[13px] text-[#1d1d1f]"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[12px] uppercase tracking-wider text-[#86868b] flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4 text-[#1d1d1f]" />
                  Anexos Complementares (Ultrassom, Lâminas ou PDFs)
                </h3>
                <label className="px-4 py-1.5 rounded-[980px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] cursor-pointer">
                  + Upload de Arquivo Local
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileUploadAttachment}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newAttachmentName}
                  onChange={(e) => setNewAttachmentName(e.target.value)}
                  placeholder="Nome do anexo (ex: Ultrassom_Abdominal.pdf)"
                  className="flex-1 px-4 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                />
                <input
                  type="text"
                  value={newAttachmentUrl}
                  onChange={(e) => setNewAttachmentUrl(e.target.value)}
                  placeholder="URL ou caminho do documento"
                  className="flex-1 px-4 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newAttachmentName.trim()) return;
                    setAttachments((prev) => [
                      ...prev,
                      {
                        id: `att-${Date.now()}`,
                        name: newAttachmentName.trim(),
                        type: newAttachmentName.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image',
                        url:
                          newAttachmentUrl.trim() ||
                          'https://vetlifelab.com.br/anexos/documento-complementar.pdf',
                        uploaded_at: new Date().toISOString(),
                      },
                    ]);
                    setNewAttachmentName('');
                    setNewAttachmentUrl('');
                  }}
                  className="px-4 py-2 rounded-[980px] bg-[#1d1d1f] text-white text-[12px]"
                >
                  Adicionar
                </button>
              </div>

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <span
                      key={att.id}
                      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[999px] bg-[#f5f5f7] text-[12px] text-[#1d1d1f]"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      {att.name}
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((prev) => prev.filter((item) => item.id !== att.id))
                        }
                        className="text-[#707070] hover:text-[#1d1d1f] font-bold"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {(() => {
              const allResults = currentOrder.results || [];
              const nextPendingExam = allResults.find(
                (r) => r.id !== currentResultItem?.id && !r.released_at
              );
              const hasMoreExamsToLaunch = Boolean(nextPendingExam);

              return (
                <div className="pt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleSaveResultDraft}
                    className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-[980px] border border-[#1d1d1f] text-[#1d1d1f] text-[12px] font-semibold hover:bg-[#1d1d1f] hover:text-white transition inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Salvar Rascunho</span>
                  </button>

                  {hasMoreExamsToLaunch ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReleaseReport({ advanceToNext: true })}
                        className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-[980px] bg-[#0071e3] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:opacity-95 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5 shrink-0" />
                        <span>Concluir e Lançar Próximo Exame</span>
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReleaseReport({ advanceToNext: false })}
                        className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-[980px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Concluir Exame e Voltar</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleReleaseReport({ advanceToNext: false })}
                      className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-[980px] bg-[#0071e3] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:opacity-95 transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {allResults.length > 1
                          ? 'Finalizar Último Exame e Concluir Atendimento'
                          : 'Finalizar e Concluir Atendimento'}
                      </span>
                    </button>
                  )}

                  {currentOrder.status === 'concluido' && (
                    <>
                      <button
                        type="button"
                        onClick={() => downloadOrderPdf(currentOrder)}
                        className="flex-1 sm:flex-initial justify-center px-4 py-2.5 sm:py-2 rounded-[980px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <FileDown className="w-3.5 h-3.5 shrink-0" />
                        <span>Baixar PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendOrderWhatsApp(currentOrder)}
                        title="Enviar laudo por WhatsApp para o veterinário"
                        className="flex-1 sm:flex-initial justify-center px-4 py-2.5 sm:py-2 rounded-[980px] bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Enviar por Whats</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendOrderEmail(currentOrder)}
                        title="Enviar laudo por e-mail para o veterinário"
                        className="flex-1 sm:flex-initial justify-center px-4 py-2.5 sm:py-2 rounded-[980px] bg-[#0071e3] hover:bg-[#0062c4] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span>Enviar por E-mail</span>
                      </button>
                    </>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="lg:col-span-6 min-w-0 bg-white rounded-[24px] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                  Preview ao Vivo do Laudo
                </h3>
                <p className="text-[12px] text-[#707070]">
                  Renderizado com tags dinâmicas do modelo selecionado
                </p>
              </div>
              <div className="w-full sm:w-64">
                <SearchableSelectField
                  modalTitle="Selecionar Modelo de Laudo"
                  searchPlaceholder="Buscar modelo por nome..."
                  items={templates}
                  value={selectedTemplateId}
                  getId={(t) => t.id}
                  getPrimaryLabel={(t) => t.name}
                  getSearchText={(t) => t.name}
                  onChange={(id) => setSelectedTemplateId(id)}
                  compact
                />
              </div>
            </div>

            <div className="bg-[#f8fafc] border border-slate-200 p-3 sm:p-5 rounded-[20px] sm:rounded-[22px] overflow-x-auto max-h-[540px] overflow-y-auto">
              <div
                className="bg-white rounded-2xl p-3.5 sm:p-5 shadow-sm border border-slate-100 text-[12px] sm:text-[13px] min-w-[260px]"
                dangerouslySetInnerHTML={{
                  __html: renderReportHtmlWithDynamicTags(
                    templates.find((t) => t.id === selectedTemplateId) || templates[0],
                    {
                      ...currentOrder,
                      results: (currentOrder.results || []).map((r) =>
                        r.id === currentResultItem?.id
                          ? { ...r, dynamic_content: dynamicValues, attachments }
                          : r
                      ),
                    }
                  ),
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          ABA 4: CONFIGURAÇÕES (EXCLUSIVO ADMIN)
         ===================================================================== */}
      {activeTab === 'settings' && user.role === 'admin' && (
        <div className="space-y-5 sm:space-y-6">
          {settingsTab === 'exams' && (
            <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display text-[20px] sm:text-[22px] font-semibold text-[#1d1d1f]">
                    Catálogo Oficial de Exames ({pagedExamsTotal})
                  </h3>
                  <p className="text-[12px] text-[#707070]">
                    Gerencie códigos, prazos, tubos de coleta, campos dinâmicos e preços por tabela de vigência.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={examSearchQuery}
                    onChange={(e) => setExamSearchQuery(e.target.value)}
                    placeholder="Buscar por código, nome ou seção..."
                    className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[12px] text-[#1d1d1f] w-full sm:w-64"
                  />
                  <select
                    value={examSectionFilter}
                    onChange={(e) => setExamSectionFilter(e.target.value)}
                    className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[12px] text-[#1d1d1f] font-medium flex-1 sm:flex-initial"
                  >
                    <option value="todos">Todas as Seções</option>
                    {Array.from(new Set(exams.map((ex) => ex.section)))
                      .sort()
                      .map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleOpenNewExamModal}
                    className="w-full sm:w-auto justify-center px-4 py-2 rounded-full bg-[#0071e3] hover:bg-[#0062c4] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Novo Exame
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[12px]">
                  <thead>
                    <tr className="text-[#86868b] uppercase border-b border-[#e8e8ed]">
                      <th className="py-3 px-3 font-normal">Código</th>
                      <th className="py-3 px-3 font-normal">Exame</th>
                      <th className="py-3 px-3 font-normal">Seção & Tubo/Amostra</th>
                      <th className="py-3 px-3 font-normal">Prazo</th>
                      <th className="py-3 px-3 font-normal">Preço</th>
                      <th className="py-3 px-3 font-normal text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f5f5f7]">
                    {pagedExams.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#707070]">
                          Nenhum exame encontrado para este filtro.
                        </td>
                      </tr>
                    ) : (
                      pagedExams.map((ex) => {
                        const examPrice = ex.price ?? ex.base_price ?? getExamPriceInTable(ex.id);
                        const deadlineText =
                          ex.delivery_time_label ||
                          (ex.delivery_days === 1 ? '1 dia útil' : `${ex.delivery_days} dias úteis`);
                        return (
                          <tr key={ex.id} className="hover:bg-[#f5f5f7]/60">
                            <td className="py-3 px-3 font-mono font-semibold text-[#1d1d1f] whitespace-nowrap">
                              [{ex.code}]
                            </td>
                            <td className="py-3 px-3 font-semibold text-[#1d1d1f] max-w-md">
                              {ex.name}
                            </td>
                            <td className="py-3 px-3 text-[#707070]">
                              <div className="font-medium text-[#1d1d1f] flex items-center gap-1.5 flex-wrap">
                                <span>{ex.section}</span>
                                <span className="px-2 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0066cc] text-[10px] font-bold">
                                  {ex.label_qty || 1} etiq.
                                </span>
                              </div>
                              {Array.isArray(ex.label_templates) && ex.label_templates.length > 0 ? (
                                <div className="mt-1 space-y-0.5">
                                  {ex.label_templates.map((lt, idx) => (
                                    <div key={idx} className="text-[11px] text-[#55555a] flex items-center gap-1">
                                      <span className="font-mono font-bold text-[#1d1d1f]">
                                        {lt.label_qty}x
                                      </span>
                                      <span>{lt.tube_type}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-[11px]">{ex.tube_type || ex.material}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 whitespace-nowrap">
                              <span className="px-2.5 py-0.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] font-semibold">
                                {deadlineText}
                              </span>
                            </td>
                            <td className="py-3 px-3 font-mono font-semibold text-[#0066cc] whitespace-nowrap">
                              R$ {Number(examPrice).toFixed(2)}
                            </td>
                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditExam(ex)}
                                  className="px-3 py-1 rounded-full bg-[#0071e3]/10 text-[#0066cc] font-semibold hover:bg-[#0071e3] hover:text-white transition inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" />
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setConfigExamIdForFields(ex.id);
                                    setSettingsTab('fields');
                                  }}
                                  className="px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] font-semibold cursor-pointer"
                                >
                                  Campos ({(ex.input_fields || []).length})
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await api.deleteExam(ex.id);
                                    await loadAllData();
                                    showToast(`Exame ${ex.code} removido.`);
                                  }}
                                  title="Excluir exame"
                                  className="p-1.5 rounded-full text-[#707070] hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <PaginationBar
                page={examsPage}
                pageSize={12}
                totalItems={pagedExamsTotal}
                onPageChange={setExamsPage}
              />

              {/* MODAL DE INCLUIR / EDITAR EXAME */}
              {examModalOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
                  onClick={handleCancelEditExam}
                >
                  <form
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={handleAddExam}
                    className="bg-white rounded-[24px] sm:rounded-[28px] max-w-2xl w-full min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-black/10"
                  >
                    <div className="flex items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
                      <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                        {editingExamId
                          ? `Editar Exame [${newExamForm.code}]`
                          : 'Cadastrar Novo Exame no Catálogo'}
                      </h3>
                      <button
                        type="button"
                        onClick={handleCancelEditExam}
                        className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                        aria-label="Fechar"
                        title="Fechar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">Código *</label>
                        <input
                          type="text"
                          required
                          value={newExamForm.code}
                          onChange={(e) => setNewExamForm({ ...newExamForm, code: e.target.value })}
                          placeholder="Ex: 057 ou CIT-01"
                          className="w-full px-3.5 py-2 rounded-[14px] bg-[#f5f5f7] font-mono text-[12px] uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">Seção Técnica *</label>
                        <select
                          value={newExamForm.section}
                          onChange={(e) => setNewExamForm({ ...newExamForm, section: e.target.value })}
                          className="w-full px-3.5 py-2 rounded-[14px] bg-[#f5f5f7] text-[12px]"
                        >
                          <option value="Painéis e Check-ups">Painéis e Check-ups</option>
                          <option value="Hematologia">Hematologia</option>
                          <option value="Bioquímica">Bioquímica</option>
                          <option value="Bioquímica Clínica">Bioquímica Clínica</option>
                          <option value="Microbiologia">Microbiologia</option>
                          <option value="Parasitologia">Parasitologia</option>
                          <option value="Urinálise">Urinálise</option>
                          <option value="Endocrinologia">Endocrinologia</option>
                          <option value="Hormônios">Hormônios / Endocrinologia</option>
                          <option value="Imunologia e Sorologia">Imunologia e Sorologia</option>
                          <option value="Biologia Molecular (PCR)">Biologia Molecular (PCR)</option>
                          <option value="Patologia">Patologia / Citologia / Histopatologia</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] text-[#707070] mb-1">Nome do Exame *</label>
                      <input
                        type="text"
                        required
                        value={newExamForm.name}
                        onChange={(e) => setNewExamForm({ ...newExamForm, name: e.target.value })}
                        placeholder="Ex: Hemograma Completo Veterinário"
                        className="w-full px-3.5 py-2 rounded-[14px] bg-[#f5f5f7] text-[12px]"
                      />
                    </div>

                    <div className="p-4 rounded-[20px] bg-[#f5f5f7] space-y-3 border border-[#e8e8ed]">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1d1d1f] flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-[#0071e3]" />
                        Prazo de Entrega & Preços por Tabela de Vigência
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1d1d1f] mb-1">
                            Prazo (Dias Úteis) *
                          </label>
                          <input
                            type="number"
                            required
                            min={1}
                            max={60}
                            value={newExamForm.delivery_days}
                            onChange={(e) => {
                              const days = Math.max(1, Number(e.target.value) || 1);
                              setNewExamForm({
                                ...newExamForm,
                                delivery_days: days,
                                delivery_time_label:
                                  days === 1 ? '1 dia útil' : `${days} dias úteis`,
                              });
                            }}
                            className="w-full px-3 py-2 rounded-xl bg-white font-semibold text-[12px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1d1d1f] mb-1">
                            Preço Padrão Base (R$) *
                          </label>
                          <input
                            type="number"
                            required
                            min={0}
                            step="0.01"
                            value={newExamForm.base_price}
                            onChange={(e) =>
                              setNewExamForm({ ...newExamForm, base_price: Number(e.target.value) })
                            }
                            className="w-full px-3 py-2 rounded-xl bg-white font-mono font-semibold text-[12px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#1d1d1f] mb-1">
                            Descrição do Prazo *
                          </label>
                          <input
                            type="text"
                            required
                            value={newExamForm.delivery_time_label}
                            onChange={(e) =>
                              setNewExamForm({ ...newExamForm, delivery_time_label: e.target.value })
                            }
                            placeholder="Ex: 1 dia útil"
                            className="w-full px-3 py-2 rounded-xl bg-white text-[12px]"
                          />
                        </div>
                      </div>

                      {priceTables.length > 0 && (
                        <div className="pt-2 border-t border-[#e5e5ea] space-y-2">
                          <div className="text-[11px] font-semibold text-[#1d1d1f]">
                            Preço em cada Tabela de Preços ({priceTables.length})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                            {priceTables.map((pt) => {
                              const today = new Date().toISOString().slice(0, 10);
                              const start = pt.start_date || '';
                              const end = pt.end_date || '';
                              const isCurrent = Boolean(start && end && today >= start && today <= end);
                              const val =
                                examTablePrices[pt.id] !== undefined
                                  ? examTablePrices[pt.id]
                                  : newExamForm.base_price;
                              return (
                                <div
                                  key={pt.id}
                                  className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <div className="text-[11px] font-semibold text-[#1d1d1f] flex items-center gap-1 truncate">
                                      <span className="truncate">{pt.name}</span>
                                      {isCurrent && (
                                        <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold shrink-0">
                                          Vigente
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[10px] text-[#707070]">
                                      {start || '—'} a {end || '—'}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[11px] font-mono text-[#707070]">R$</span>
                                    <input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      value={val}
                                      onChange={(e) =>
                                        setExamTablePrices((prev) => ({
                                          ...prev,
                                          [pt.id]: Number(e.target.value),
                                        }))
                                      }
                                      className="w-20 px-2 py-1 rounded-lg bg-[#f5f5f7] font-mono text-[12px] font-semibold text-right"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-[20px] bg-[#f5f5f7] space-y-3 border border-[#e8e8ed]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1d1d1f] flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-[#0071e3]" />
                          Configuração de Etiquetas por Tubo / Amostra (N:1) *
                          <span className="px-2 py-0.5 rounded-full bg-[#0071e3]/10 text-[#0066cc] text-[10px] font-bold">
                            Total:{' '}
                            {(newExamForm.label_templates || []).reduce(
                              (acc, lt) => acc + (Math.max(1, Number(lt.label_qty) || 1)),
                              0
                            )}{' '}
                            etiqueta(s)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setNewExamForm((prev) => ({
                              ...prev,
                              label_templates: [
                                ...(prev.label_templates || []),
                                { tube_type: '', label_qty: 1 },
                              ],
                            }))
                          }
                          className="px-3 py-1.5 rounded-full bg-[#0071e3] text-white text-[11px] font-semibold hover:opacity-95 transition inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Adicionar Tubo / Etiqueta
                        </button>
                      </div>

                      <div className="space-y-2">
                        {(newExamForm.label_templates || []).map((tpl, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-white p-3 rounded-[16px] border border-[#e5e5ea]"
                          >
                            <div className="sm:col-span-8">
                              <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                                Tipo de Tubo / Amostra #{idx + 1} *
                              </label>
                              <input
                                type="text"
                                required
                                value={tpl.tube_type}
                                onChange={(e) => {
                                  const next = [...(newExamForm.label_templates || [])];
                                  next[idx] = { ...next[idx], tube_type: e.target.value };
                                  setNewExamForm({
                                    ...newExamForm,
                                    label_templates: next,
                                    tube_type: next.map((t) => t.tube_type).filter(Boolean).join(' + '),
                                  });
                                }}
                                placeholder="Ex: Sangue em tubo de tampa roxa com EDTA"
                                className="w-full px-3.5 py-2 rounded-[12px] bg-[#f5f5f7] text-[12px]"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="block text-[11px] font-semibold text-[#707070] mb-1">
                                Qtd. Etiquetas *
                              </label>
                              <input
                                type="number"
                                required
                                min={1}
                                max={20}
                                value={tpl.label_qty}
                                onChange={(e) => {
                                  const next = [...(newExamForm.label_templates || [])];
                                  next[idx] = {
                                    ...next[idx],
                                    label_qty: Math.max(1, Number(e.target.value) || 1),
                                  };
                                  setNewExamForm({
                                    ...newExamForm,
                                    label_templates: next,
                                    label_qty: next.reduce(
                                      (acc, t) => acc + Math.max(1, Number(t.label_qty) || 1),
                                      0
                                    ),
                                  });
                                }}
                                className="w-full px-3.5 py-2 rounded-[12px] bg-[#f5f5f7] font-mono font-semibold text-[12px]"
                              />
                            </div>
                            <div className="sm:col-span-1 flex justify-end">
                              <button
                                type="button"
                                disabled={(newExamForm.label_templates || []).length <= 1}
                                onClick={() => {
                                  if ((newExamForm.label_templates || []).length <= 1) return;
                                  const next = (newExamForm.label_templates || []).filter(
                                    (_, i) => i !== idx
                                  );
                                  setNewExamForm({
                                    ...newExamForm,
                                    label_templates: next,
                                    tube_type: next.map((t) => t.tube_type).filter(Boolean).join(' + '),
                                    label_qty: next.reduce(
                                      (acc, t) => acc + Math.max(1, Number(t.label_qty) || 1),
                                      0
                                    ),
                                  });
                                }}
                                title="Remover este tubo/etiqueta"
                                className="p-2 rounded-xl text-[#707070] hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCancelEditExam}
                        className="px-5 py-2.5 rounded-full bg-[#f5f5f7] text-[#1d1d1f] text-[12px] font-semibold cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2.5 rounded-full bg-[#0071e3] text-white font-semibold text-[12px] hover:opacity-95 transition cursor-pointer"
                      >
                        {editingExamId ? 'Salvar Alterações' : '+ Cadastrar Exame'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {settingsTab === 'fields' && (
            <div className="space-y-6">
              {fieldModalOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
                  onClick={() => setFieldModalOpen(false)}
                >
                  <form
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={handleAddDynamicField}
                    className="bg-white rounded-[24px] sm:rounded-[28px] max-w-xl w-full min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-black/10"
                  >
                    <div className="flex items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
                      <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                        Configurar Campo Personalizado de Exame
                      </h3>
                      <button
                        type="button"
                        onClick={() => setFieldModalOpen(false)}
                        className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                        aria-label="Fechar"
                        title="Fechar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <SearchableSelectField
                      label="Selecionar Exame Alvo *"
                      modalTitle="Selecionar Exame Alvo"
                      modalSubtitle="Pesquise por código, nome ou seção técnica"
                      searchPlaceholder="Ex: 000, Hemograma, Bioquímica..."
                      items={exams}
                      value={configExamIdForFields}
                      getId={(ex) => ex.id}
                      getPrimaryLabel={(ex) => `[${ex.code}] ${ex.name}`}
                      getSecondaryLabel={(ex) => `${ex.section} • ${ex.tube_type}`}
                      getBadge={(ex) => ex.section}
                      getSearchText={(ex) => `${ex.code} ${ex.name} ${ex.section}`}
                      onChange={(id) => setConfigExamIdForFields(id)}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">
                          Identificador Técnico *
                        </label>
                        <input
                          type="text"
                          required
                          value={newFieldForm.field_name}
                          onChange={(e) =>
                            setNewFieldForm({ ...newFieldForm, field_name: e.target.value })
                          }
                          placeholder="Ex: reticulocitos"
                          className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] font-mono text-[12px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">Tipo de Input *</label>
                        <select
                          value={newFieldForm.field_type}
                          onChange={(e) =>
                            setNewFieldForm({
                              ...newFieldForm,
                              field_type: e.target.value as FieldType,
                            })
                          }
                          className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                        >
                          <option value="number">Numérico (number)</option>
                          <option value="text">Texto Livre (text)</option>
                          <option value="select">Lista de Opções (select)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">
                          Rótulo no Laudo *
                        </label>
                        <input
                          type="text"
                          required
                          value={newFieldForm.field_label}
                          onChange={(e) =>
                            setNewFieldForm({ ...newFieldForm, field_label: e.target.value })
                          }
                          placeholder="Ex: Contagem de Reticulócitos"
                          className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">
                          Unidade de Medida
                        </label>
                        <input
                          type="text"
                          value={newFieldForm.unit}
                          onChange={(e) => setNewFieldForm({ ...newFieldForm, unit: e.target.value })}
                          placeholder="Ex: % ou mg/dL"
                          className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                        />
                      </div>
                    </div>

                    {newFieldForm.field_type === 'select' && (
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">
                          Opções do Select (separadas por vírgula) *
                        </label>
                        <input
                          type="text"
                          required
                          value={newFieldForm.options_csv}
                          onChange={(e) =>
                            setNewFieldForm({ ...newFieldForm, options_csv: e.target.value })
                          }
                          placeholder="Negativo, Positivo (+), Positivo (++)"
                          className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                        />
                      </div>
                    )}

                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-[980px] bg-[#0071e3] text-white text-[12px] font-semibold cursor-pointer"
                    >
                      + Adicionar Campo Dinâmico ao Exame
                    </button>
                  </form>
                </div>
              )}

              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="w-full sm:min-w-[260px] flex-1 max-w-md">
                    <SearchableSelectField
                      label="Exame Selecionado"
                      modalTitle="Selecionar Exame Alvo"
                      modalSubtitle="Pesquise por código, nome ou seção técnica"
                      searchPlaceholder="Ex: 000, Hemograma, Bioquímica..."
                      items={exams}
                      value={configExamIdForFields}
                      getId={(ex) => ex.id}
                      getPrimaryLabel={(ex) => `[${ex.code}] ${ex.name}`}
                      getSecondaryLabel={(ex) => `${ex.section} • ${ex.tube_type}`}
                      getBadge={(ex) => ex.section}
                      getSearchText={(ex) => `${ex.code} ${ex.name} ${ex.section}`}
                      onChange={(id) => {
                        setConfigExamIdForFields(id);
                        setFieldsPage(1);
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFieldModalOpen(true)}
                    className="w-full sm:w-auto px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer shrink-0"
                  >
                    + Novo Campo Dinâmico
                  </button>
                </div>
                <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                  Campos de Entrada Configurados para o Exame Selecionado (
                  {(exams.find((ex) => ex.id === configExamIdForFields)?.input_fields || []).length})
                </h3>
                <div className="divide-y divide-[#f5f5f7]">
                  {(
                    exams.find((ex) => ex.id === configExamIdForFields)?.input_fields || []
                  )
                    .slice((fieldsPage - 1) * 10, fieldsPage * 10)
                    .map((fld) => (
                      <div
                        key={fld.id || fld.field_name}
                        className="py-3 flex items-center justify-between text-[12px]"
                      >
                        <div>
                          <span className="font-semibold text-[#1d1d1f]">
                            {fld.field_label || fld.field_name}
                          </span>{' '}
                          <span className="font-mono text-[#86868b]">({fld.field_name})</span>
                          <div className="text-[#707070]">
                            Tipo: <strong className="uppercase">{fld.field_type}</strong>
                            {fld.unit ? ` • Unidade: ${fld.unit}` : ''}
                            {fld.options && fld.options.length > 0
                              ? ` • Opções: [${fld.options.join(', ')}]`
                              : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveDynamicField(configExamIdForFields, fld.id)
                          }
                          className="p-1.5 text-[#707070] hover:text-[#1d1d1f] rounded-[999px]"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                </div>
                <PaginationBar
                  page={fieldsPage}
                  pageSize={10}
                  totalItems={
                    (exams.find((ex) => ex.id === configExamIdForFields)?.input_fields || []).length
                  }
                  onPageChange={setFieldsPage}
                />
              </div>
            </div>
          )}

          {settingsTab === 'prices' && (
            <div className="space-y-6">
              {priceTableModalOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
                  onClick={() => setPriceTableModalOpen(false)}
                >
                  <form
                    onClick={(e) => e.stopPropagation()}
                    onSubmit={handleCreatePriceTable}
                    className="bg-white rounded-[24px] sm:rounded-[28px] max-w-lg w-full min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-black/10"
                  >
                    <div className="flex items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
                      <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                        Nova Tabela de Preços com Vigência
                      </h3>
                      <button
                        type="button"
                        onClick={() => setPriceTableModalOpen(false)}
                        className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                        aria-label="Fechar"
                        title="Fechar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#707070] mb-1">
                        Nome da Tabela / Período *
                      </label>
                      <input
                        type="text"
                        required
                        value={newPriceTableForm.name}
                        onChange={(e) =>
                          setNewPriceTableForm({ ...newPriceTableForm, name: e.target.value })
                        }
                        placeholder="Ex: Tabela 2º Semestre 2026 — Clínicas Parceiras"
                        className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#707070] mb-1">
                        Convênio / Clínica Parceira Vinculada
                      </label>
                      <input
                        type="text"
                        value={newPriceTableForm.partner_clinic}
                        onChange={(e) =>
                          setNewPriceTableForm({
                            ...newPriceTableForm,
                            partner_clinic: e.target.value,
                          })
                        }
                        placeholder="Ex: Hospital VetVida / Rede Credenciada"
                        className="w-full px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">
                          Início da Vigência *
                        </label>
                        <input
                          type="date"
                          required
                          value={newPriceTableForm.start_date}
                          onChange={(e) =>
                            setNewPriceTableForm({
                              ...newPriceTableForm,
                              start_date: e.target.value,
                            })
                          }
                          className="w-full min-w-0 px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] text-[#707070] mb-1">
                          Fim da Vigência *
                        </label>
                        <input
                          type="date"
                          required
                          value={newPriceTableForm.end_date}
                          onChange={(e) =>
                            setNewPriceTableForm({ ...newPriceTableForm, end_date: e.target.value })
                          }
                          className="w-full min-w-0 px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 rounded-[980px] bg-[#0071e3] text-white text-[12px] font-semibold cursor-pointer"
                    >
                      + Criar Tabela de Vigência
                    </button>
                  </form>
                </div>
              )}

              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                      Gerenciar Vigência e Reajuste Percentual
                    </h3>
                    <p className="text-[12px] text-[#707070]">
                      Selecione uma tabela para revisar os preços por exame ou aplicar reajuste em
                      massa.
                    </p>
                  </div>
                  <div className="w-full sm:w-80">
                    <SearchableSelectField
                      modalTitle="Selecionar Tabela de Preços"
                      searchPlaceholder="Buscar tabela por nome ou vigência..."
                      items={priceTables}
                      value={editingPriceTableId}
                      getId={(pt) => pt.id}
                      getPrimaryLabel={(pt) => `${pt.name}`}
                      getSecondaryLabel={(pt) => `${pt.start_date} até ${pt.end_date}`}
                      getSearchText={(pt) => `${pt.name} ${pt.start_date} ${pt.end_date}`}
                      onChange={(id) => setEditingPriceTableId(id)}
                      compact
                    />
                  </div>
                </div>

                <div className="p-3.5 sm:p-4 rounded-[20px] sm:rounded-[25px] bg-[#f5f5f7] flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                    <Percent className="w-4 h-4 text-[#0071e3] shrink-0" />
                    <span>Aplicar Reajuste Percentual (%) na Tabela Selecionada:</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <input
                      type="number"
                      step="0.5"
                      value={adjustmentPercent}
                      onChange={(e) => setAdjustmentPercent(Number(e.target.value))}
                      className="w-24 px-3 py-1.5 rounded-[980px] bg-white font-mono text-[12px] font-semibold"
                    />
                    <button
                      type="button"
                      onClick={handleApplyPercentageAdjustment}
                      className="px-4 py-1.5 rounded-[980px] bg-[#0071e3] text-white text-[12px] font-semibold"
                    >
                      Aplicar Reajuste
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceTableModalOpen(true)}
                      className="w-full sm:w-auto px-4 py-1.5 rounded-[980px] bg-[#0b2240] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer"
                    >
                      + Nova Tabela de Vigência
                    </button>
                  </div>
                </div>

                <div className="divide-y divide-[#f5f5f7] text-[12px]">
                  {(
                    priceTables.find((pt) => pt.id === editingPriceTableId)?.prices || []
                  )
                    .slice((priceRowsPage - 1) * 15, priceRowsPage * 15)
                    .map((item) => (
                      <div
                        key={item.exam_id}
                        className="py-3 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono font-semibold text-[#1d1d1f] mr-2">
                            {item.exam_code}
                          </span>
                          <span className="text-[#707070]">{item.exam_name}</span>
                        </div>
                        <span className="font-mono font-semibold text-[#1d1d1f]">
                          R$ {Number(item.price).toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
                <PaginationBar
                  page={priceRowsPage}
                  pageSize={15}
                  totalItems={
                    (priceTables.find((pt) => pt.id === editingPriceTableId)?.prices || []).length
                  }
                  onPageChange={setPriceRowsPage}
                />
              </div>
            </div>
          )}

          {settingsTab === 'references' && (
            <div className="space-y-6">
              {referenceModalOpen && (
                <div
                  className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4"
                  onClick={() => {
                    setReferenceModalOpen(false);
                    setEditingReferenceId(null);
                    setNewRefForm({ ...newRefForm, reference_text_content: '' });
                  }}
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-[#f5f5f7] rounded-[24px] sm:rounded-[28px] max-w-5xl w-full min-w-0 max-h-[92vh] overflow-y-auto p-3.5 sm:p-6 space-y-4 shadow-2xl border border-black/10"
                  >
                    <div className="flex items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
                      <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                        {editingReferenceId
                          ? 'Editar Valor & Layout de Referência'
                          : 'Novo Valor & Layout de Referência'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setReferenceModalOpen(false);
                          setEditingReferenceId(null);
                          setNewRefForm({ ...newRefForm, reference_text_content: '' });
                        }}
                        className="p-2 rounded-full bg-white hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                        aria-label="Fechar"
                        title="Fechar"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 sm:gap-6 items-start min-w-0">
                      <form
                        onSubmit={handleAddReference}
                        className="xl:col-span-7 min-w-0 bg-white rounded-[20px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4"
                      >

                        <SearchableSelectField
                          label="Exame *"
                          modalTitle="Selecionar Exame para Referência"
                          modalSubtitle="Pesquise por código, nome ou seção técnica"
                          searchPlaceholder="Ex: 000, Hemograma, Renal..."
                          items={exams}
                          value={newRefForm.exam_id}
                          getId={(ex) => ex.id}
                          getPrimaryLabel={(ex) => `[${ex.code}] ${ex.name}`}
                          getSecondaryLabel={(ex) => `${ex.section} • ${ex.tube_type}`}
                          getBadge={(ex) => ex.section}
                          getSearchText={(ex) => `${ex.code} ${ex.name} ${ex.section}`}
                          onChange={(id) => setNewRefForm({ ...newRefForm, exam_id: id })}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[12px] text-[#707070] mb-1">Espécie *</label>
                            <select
                              value={newRefForm.species}
                              onChange={(e) => setNewRefForm({ ...newRefForm, species: e.target.value })}
                              className="w-full px-3 sm:px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                            >
                              <option value="Canino">Canino</option>
                              <option value="Felino">Felino</option>
                              <option value="Equino">Equino</option>
                              <option value="Silvestre">Silvestre</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[12px] text-[#707070] mb-1">Sexo *</label>
                            <select
                              value={newRefForm.gender}
                              onChange={(e) => setNewRefForm({ ...newRefForm, gender: e.target.value })}
                              className="w-full px-3 sm:px-3.5 py-2 rounded-[18px] bg-[#f5f5f7] text-[12px]"
                            >
                              <option value="Ambos">Ambos (M/F)</option>
                              <option value="M">Macho (M)</option>
                              <option value="F">Fêmea (F)</option>
                            </select>
                          </div>
                        </div>

                        {(() => {
                          const minSplit = splitDaysToYearsMonths(newRefForm.min_age_days);
                          const maxSplit = splitDaysToYearsMonths(newRefForm.max_age_days);
                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="p-3 rounded-2xl bg-[#f5f5f7] space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-[#5b6675]">
                                  <span>Idade Mínima (Anos / Meses) *</span>
                                  <span className="font-mono text-[#0071e3]">
                                    = {newRefForm.min_age_days} dias
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={0}
                                      max={60}
                                      value={minSplit.years}
                                      onChange={(e) => {
                                        const y = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                        setNewRefForm({
                                          ...newRefForm,
                                          min_age_days: y * 365 + minSplit.months * 30,
                                        });
                                      }}
                                      className="w-full pl-3 pr-11 py-1.5 rounded-xl bg-white text-[12px] font-semibold"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-[#707070] pointer-events-none">
                                      anos
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={0}
                                      max={11}
                                      value={minSplit.months}
                                      onChange={(e) => {
                                        const m = Math.min(11, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                                        setNewRefForm({
                                          ...newRefForm,
                                          min_age_days: minSplit.years * 365 + m * 30,
                                        });
                                      }}
                                      className="w-full pl-3 pr-13 py-1.5 rounded-xl bg-white text-[12px] font-semibold"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-[#707070] pointer-events-none">
                                      meses
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="p-3 rounded-2xl bg-[#f5f5f7] space-y-1.5">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-[#5b6675]">
                                  <span>Idade Máxima (Anos / Meses) *</span>
                                  <span className="font-mono text-[#0071e3]">
                                    = {newRefForm.max_age_days} dias
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={0}
                                      max={60}
                                      value={maxSplit.years}
                                      onChange={(e) => {
                                        const y = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                        setNewRefForm({
                                          ...newRefForm,
                                          max_age_days: Math.max(1, y * 365 + maxSplit.months * 30),
                                        });
                                      }}
                                      className="w-full pl-3 pr-11 py-1.5 rounded-xl bg-white text-[12px] font-semibold"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-[#707070] pointer-events-none">
                                      anos
                                    </span>
                                  </div>
                                  <div className="relative">
                                    <input
                                      type="number"
                                      min={0}
                                      max={11}
                                      value={maxSplit.months}
                                      onChange={(e) => {
                                        const m = Math.min(11, Math.max(0, Math.floor(Number(e.target.value) || 0)));
                                        setNewRefForm({
                                          ...newRefForm,
                                          max_age_days: Math.max(1, maxSplit.years * 365 + m * 30),
                                        });
                                      }}
                                      className="w-full pl-3 pr-13 py-1.5 rounded-xl bg-white text-[12px] font-semibold"
                                    />
                                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-[#707070] pointer-events-none">
                                      meses
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Campo 1: Janela de Edição Visual (sem escrever HTML) */}
                        <RichHtmlEditor
                          label="Layout & Parâmetros de Referência (Editor Visual)"
                          value={newRefForm.reference_text_content}
                          onChange={(html) =>
                            setNewRefForm({ ...newRefForm, reference_text_content: html })
                          }
                          minHeightClass="min-h-[160px]"
                          placeholder="Monte o layout da referência com títulos, negrito, listas, cores..."
                        />

                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-[980px] bg-[#0071e3] text-white text-[13px] font-semibold hover:opacity-95 transition"
                        >
                          {editingReferenceId
                            ? 'Salvar Alterações da Referência'
                            : '+ Salvar Valor e Layout de Referência'}
                        </button>
                      </form>

                      {/* Campo 2: Visualização ao Vivo do Layout da Referência */}
                      <div className="xl:col-span-5 min-w-0 bg-white rounded-[20px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="inline-flex items-center gap-1.5 text-[14px] sm:text-[15px] font-bold text-[#0b2240]">
                            <Eye className="w-4 h-4 text-[#1d9496] shrink-0" />
                            <span>Visualização ao Vivo da Referência</span>
                          </div>
                          <span className="text-[11px] text-[#5b6675] bg-slate-100 px-2.5 py-0.5 rounded-full">
                            {newRefForm.species} • {newRefForm.gender}
                          </span>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2">
                          <div className="text-[12px] font-bold text-[#0b2240] break-words">
                            {exams.find((item) => item.id === newRefForm.exam_id)?.name || 'Exame'}
                          </div>
                          <div className="text-[11px] text-[#1d9496] font-semibold">
                            Faixa: {formatReferenceAgeRange(newRefForm.min_age_days, newRefForm.max_age_days)}
                          </div>
                          <div className="bg-white rounded-xl border border-slate-200/80 p-3 sm:p-4 min-h-[180px] text-[13px] text-[#0b2240] leading-relaxed overflow-x-auto [&_h2]:text-base [&_h2]:font-bold [&_h3]:text-sm [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
                            {newRefForm.reference_text_content.replace(/<[^>]+>/g, '').trim() ? (
                              <div
                                dangerouslySetInnerHTML={{
                                  __html: newRefForm.reference_text_content,
                                }}
                              />
                            ) : (
                              <span className="text-slate-400 italic text-[12px]">
                                O layout formatado da referência aparecerá aqui ao vivo enquanto você edita...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Matriz de Referências Cadastradas */}
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                    Matriz de Referências Cadastradas ({references.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingReferenceId(null);
                      setNewRefForm({ ...newRefForm, reference_text_content: '' });
                      setReferenceModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer shrink-0"
                  >
                    + Nova Referência
                  </button>
                </div>
                <div className="space-y-2.5">
                  {references.slice((refsPage - 1) * 10, refsPage * 10).map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-[25px] bg-[#f5f5f7] text-[12px] flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="font-semibold text-[#1d1d1f]">
                          {r.exam_name || r.exam_id} —{' '}
                          <span className="text-[#0066cc]">
                            {r.species} ({r.gender}) • {formatReferenceAgeRange(r.min_age_days, r.max_age_days)}
                          </span>
                        </div>
                        {/<[a-z][\s\S]*>/i.test(r.reference_text_content || '') ? (
                          <div
                            className="text-[#475569] bg-white/80 rounded-xl p-2.5 border border-slate-200/60 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
                            dangerouslySetInnerHTML={{ __html: r.reference_text_content }}
                          />
                        ) : (
                          <div className="text-[#707070]">{r.reference_text_content}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          title="Editar referência e layout"
                          onClick={() => {
                            setEditingReferenceId(r.id);
                            setNewRefForm({
                              exam_id: r.exam_id,
                              species: r.species,
                              gender: r.gender,
                              min_age_days: r.min_age_days,
                              max_age_days: r.max_age_days,
                              reference_text_content: r.reference_text_content,
                            });
                            setReferenceModalOpen(true);
                          }}
                          className="p-1.5 text-[#0b2240] hover:bg-white rounded-[999px] transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Excluir referência"
                          onClick={async () => {
                            await api.deleteExamReference(r.id);
                            await loadAllData();
                          }}
                          className="p-1.5 text-[#707070] hover:text-red-600 rounded-[999px] transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <PaginationBar
                  page={refsPage}
                  pageSize={10}
                  totalItems={references.length}
                  onPageChange={setRefsPage}
                />
              </div>
            </div>
          )}

          {settingsTab === 'templates' && editingTemplate && (
            <form
              onSubmit={handleSaveTemplate}
              className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-5 sm:space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                    Editor Visual de Modelos de Laudos
                  </h3>
                  <p className="text-[12px] text-[#707070]">
                    Edite normalmente sem precisar escrever HTML. A visualização ao vivo ao lado mostra exatamente como o laudo será salvo.
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <SearchableSelectField
                    modalTitle="Selecionar Modelo de Laudo"
                    searchPlaceholder="Buscar modelo..."
                    items={templates}
                    value={editingTemplate.id}
                    getId={(t) => t.id}
                    getPrimaryLabel={(t) => t.name}
                    getSearchText={(t) => t.name}
                    onChange={(_id, found) => setEditingTemplate(found)}
                    compact
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-[#5b6675]">
                  Clique em uma tag dinâmica para inserir no campo selecionado ({activeTemplateField === 'header' ? 'Cabeçalho' : activeTemplateField === 'body' ? 'Corpo do Laudo' : 'Rodapé'}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    '{{logo}}',
                    '{{paciente}}',
                    '{{especie}}',
                    '{{idade}}',
                    '{{tutor}}',
                    '{{veterinario}}',
                    '{{crmv}}',
                    '{{protocolo}}',
                    '{{data_liberacao}}',
                    '{{exame}}',
                    '{{resultados}}',
                    '{{referencias}}',
                  ].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => insertDynamicTag(tag)}
                      className="px-3 py-1 rounded-[999px] bg-[#f5f5f7] hover:bg-[#e8e8ed] font-mono text-[12px] text-[#0b2240] transition"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* DOIS CAMPOS LADO A LADO: 1) Janela de Edição Visual | 2) Visualização ao Vivo */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                {/* Coluna Esquerda: Edição Visual Estilo Editor de Texto */}
                <div className="xl:col-span-7 space-y-4">
                  <RichHtmlEditor
                    label="1. Cabeçalho Institucional (Header)"
                    value={editingTemplate.header_html}
                    onChange={(html) =>
                      setEditingTemplate({ ...editingTemplate, header_html: html })
                    }
                    onFocus={() => setActiveTemplateField('header')}
                    isActive={activeTemplateField === 'header'}
                    insertTagRequest={insertTagRequest}
                    minHeightClass="min-h-[84px]"
                    placeholder="Ex: VetLife Laboratório de Análises Clínicas Veterinárias..."
                  />

                  <RichHtmlEditor
                    label="2. Estrutura Padrão / Corpo do Laudo"
                    value={editingTemplate.body_template}
                    onChange={(html) =>
                      setEditingTemplate({ ...editingTemplate, body_template: html })
                    }
                    onFocus={() => setActiveTemplateField('body')}
                    isActive={activeTemplateField === 'body'}
                    insertTagRequest={insertTagRequest}
                    minHeightClass="min-h-[210px]"
                    placeholder="Digite o corpo padrão do laudo e insira as tags dinâmicas..."
                  />

                  <RichHtmlEditor
                    label="3. Rodapé Legal e Verificação de Autenticidade (Footer)"
                    value={editingTemplate.footer_html}
                    onChange={(html) =>
                      setEditingTemplate({ ...editingTemplate, footer_html: html })
                    }
                    onFocus={() => setActiveTemplateField('footer')}
                    isActive={activeTemplateField === 'footer'}
                    insertTagRequest={insertTagRequest}
                    minHeightClass="min-h-[76px]"
                    placeholder="Ex: Documento assinado eletronicamente em {{data_liberacao}}..."
                  />
                </div>

                {/* Coluna Direita: Visualização ao Vivo (Preview do Laudo Salvo em HTML) */}
                <div className="xl:col-span-5 bg-slate-50 border border-slate-200 rounded-3xl p-5 space-y-3 xl:sticky xl:top-24">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0b2240]">
                      <Eye className="w-4 h-4 text-[#1d9496]" />
                      <span>Visualização ao Vivo</span>
                    </div>
                    <div className="inline-flex rounded-full bg-white border border-slate-200 p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setTemplatePreviewWithSample(true)}
                        className={`px-2.5 py-1 rounded-full transition ${templatePreviewWithSample
                          ? 'bg-[#0b2240] text-white'
                          : 'text-[#5b6675] hover:text-[#0b2240]'
                          }`}
                      >
                        Dados de Exemplo
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplatePreviewWithSample(false)}
                        className={`px-2.5 py-1 rounded-full transition ${!templatePreviewWithSample
                          ? 'bg-[#0b2240] text-white'
                          : 'text-[#5b6675] hover:text-[#0b2240]'
                          }`}
                      >
                        Com Tags
                      </button>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 min-h-[420px] max-h-[600px] overflow-y-auto text-[13px]">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: templatePreviewWithSample
                          ? renderReportHtmlWithDynamicTags(
                            editingTemplate,
                            orders[0] || {
                              id: 'sample-order',
                              protocol_code: 'VET-2026-0001',
                              patient_id: 'pat-sample',
                              vet_id: 'vet-sample',
                              total_amount: 120,
                              status: 'concluido',
                              created_at: new Date().toISOString(),
                              released_at: new Date().toISOString(),
                              patient: {
                                id: 'pat-sample',
                                name: 'Thor',
                                species: 'Canino',
                                breed: 'Golden Retriever',
                                gender: 'M',
                                age_days: 1095,
                                tutor_name: 'Mariana Costa',
                              },
                              vet: {
                                id: 'vet-sample',
                                name: 'Dr. Carlos Mendes',
                                crmv: 'CRMV-SP 45821',
                                clinic_name: 'Clínica PetCare',
                                email: 'carlos@petcare.com.br',
                                phone: '(11) 99999-0000',
                              },
                              results: [
                                {
                                  id: 'res-sample',
                                  order_id: 'sample-order',
                                  exam_id: 'exam-sample',
                                  exam_code: 'HEMO-01',
                                  exam_name: 'Hemograma Completo Veterinário',
                                  section: 'Hematologia',
                                  applied_price: 68,
                                  dynamic_content: {
                                    Eritrócitos: '6,8 milhões/mm³',
                                    Hemoglobina: '15,2 g/dL',
                                    Leucócitos: '9.400 /mm³',
                                  },
                                  reference_snapshot:
                                    'Eritrócitos: 5,5 a 8,5 milhões/mm³ | Hemoglobina: 12 a 18 g/dL',
                                },
                              ],
                            }
                          )
                          : `<div style="font-family:Inter,system-ui,sans-serif;color:#0f172a;line-height:1.5;"><div>${editingTemplate.header_html || ''}</div><div style="margin:14px 0;">${editingTemplate.body_template || ''}</div><div>${editingTemplate.footer_html || ''}</div></div>`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="px-6 py-2.5 rounded-[980px] bg-[#0071e3] text-white text-[13px] font-semibold hover:opacity-95 transition"
              >
                Salvar Modelo de Laudo
              </button>
            </form>
          )}

          {settingsTab === 'users' && (
            <div className="space-y-6">
              {/* USUÁRIOS DO LABORATÓRIO */}
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#e8f2fd] text-[#0071e3] text-[11px] font-semibold mb-1.5">
                      <Lock className="w-3 h-3" />
                      Acesso exclusivo ao Painel Laboratorial
                    </span>
                    <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                      Usuários do Laboratório
                    </h3>
                    <p className="text-[12px] text-[#707070]">
                      Administradores e Biomédicos acessam somente o Painel Laboratorial (sem acesso ao Portal do Veterinário).
                    </p>
                  </div>
                  {user?.role === 'admin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLabUserId(null);
                        setLabUserForm({ name: '', email: '', role: 'biomedical', password: '' });
                        setUserModalOpen(true);
                      }}
                      className="w-full sm:w-auto px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer shrink-0"
                    >
                      + Novo Usuário
                    </button>
                  )}
                </div>

                {user?.role !== 'admin' ? (
                  <div className="p-4 rounded-2xl bg-[#f5f5f7] text-[12px] text-[#707070] flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-[#0071e3] shrink-0" />
                    Apenas usuários com perfil <strong>Administrador</strong> podem cadastrar ou gerenciar usuários do laboratório.
                  </div>
                ) : (
                  <>
                    {userModalOpen && (
                      <div
                        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
                        onClick={() => {
                          setUserModalOpen(false);
                          setEditingLabUserId(null);
                          setLabUserForm({ name: '', email: '', role: 'biomedical', password: '' });
                        }}
                      >
                        <form
                          onClick={(e) => e.stopPropagation()}
                          onSubmit={async (e) => {
                            e.preventDefault();
                            try {
                              if (editingLabUserId) {
                                await api.updateUser(editingLabUserId, {
                                  name: labUserForm.name,
                                  email: labUserForm.email,
                                  role: labUserForm.role,
                                  ...(labUserForm.password.trim()
                                    ? { password: labUserForm.password.trim() }
                                    : {}),
                                });
                                showToast('Usuário do laboratório atualizado!');
                              } else {
                                await api.createUser({
                                  name: labUserForm.name,
                                  email: labUserForm.email,
                                  role: labUserForm.role,
                                  password: labUserForm.password,
                                });
                                showToast('Usuário do laboratório cadastrado com sucesso!');
                              }
                              setEditingLabUserId(null);
                              setLabUserForm({ name: '', email: '', role: 'biomedical', password: '' });
                              setUserModalOpen(false);
                              const updatedUsers = await api.getUsers();
                              setLabUsers(updatedUsers);
                            } catch (err: any) {
                              showToast(err?.message || 'Erro ao salvar usuário.');
                            }
                          }}
                          className="bg-white rounded-[24px] sm:rounded-[28px] max-w-xl w-full min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-black/10"
                        >
                          <div className="flex items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
                            <h4 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                              {editingLabUserId ? 'Editar Usuário do Laboratório' : 'Novo Usuário do Laboratório'}
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setUserModalOpen(false);
                                setEditingLabUserId(null);
                                setLabUserForm({ name: '', email: '', role: 'biomedical', password: '' });
                              }}
                              className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                              aria-label="Fechar"
                              title="Fechar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-[11px] text-[#707070] mb-1">Nome Completo *</label>
                              <input
                                type="text"
                                required
                                value={labUserForm.name}
                                onChange={(e) => setLabUserForm({ ...labUserForm, name: e.target.value })}
                                placeholder="Ex: Dra. Camila Rocha"
                                className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#707070] mb-1">E-mail de Login *</label>
                              <input
                                type="email"
                                required
                                value={labUserForm.email}
                                onChange={(e) => setLabUserForm({ ...labUserForm, email: e.target.value })}
                                placeholder="camila@vetlifelab.com.br"
                                className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#707070] mb-1">Perfil de Acesso *</label>
                              <select
                                value={labUserForm.role}
                                onChange={(e) =>
                                  setLabUserForm({
                                    ...labUserForm,
                                    role: e.target.value as 'admin' | 'biomedical',
                                  })
                                }
                                className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                              >
                                <option value="biomedical">Biomédico / Técnico (Rotina & Laudos)</option>
                                <option value="admin">Administrador (Acesso Total Lab)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[#707070] mb-1">
                                {editingLabUserId ? 'Nova Senha (opcional)' : 'Senha de Acesso *'}
                              </label>
                              <input
                                type="password"
                                required={!editingLabUserId}
                                minLength={4}
                                value={labUserForm.password}
                                onChange={(e) => setLabUserForm({ ...labUserForm, password: e.target.value })}
                                placeholder={editingLabUserId ? 'Deixe em branco para manter' : 'Mínimo 4 caracteres'}
                                className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="submit"
                              className="px-5 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer"
                            >
                              {editingLabUserId ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setUserModalOpen(false);
                                setEditingLabUserId(null);
                                setLabUserForm({ name: '', email: '', role: 'biomedical', password: '' });
                              }}
                              className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[#707070] text-[12px] font-semibold cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    <div className="space-y-2.5">
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Pesquisar usuário por nome, e-mail ou perfil..."
                        className="w-full px-4 py-2 rounded-full bg-[#f5f5f7] text-[12px]"
                      />
                      <div className="space-y-2">
                        {labUsers
                          .filter((u) => {
                            const q = userSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
                          })
                          .slice((usersPage - 1) * 8, usersPage * 8)
                          .map((u) => (
                            <div
                              key={u.id}
                              className="p-3.5 rounded-2xl bg-[#f5f5f7] flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px] font-semibold text-[#1d1d1f] truncate">
                                    {u.name}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${u.role === 'admin'
                                      ? 'bg-[#0b2240] text-white'
                                      : 'bg-[#e8f2fd] text-[#0071e3]'
                                      }`}
                                  >
                                    {u.role === 'admin' ? 'Administrador' : 'Biomédico / Técnico'}
                                  </span>
                                  {(u.id === user?.id || u.email.toLowerCase() === user?.email?.toLowerCase()) && (
                                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                      Você (Logado)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-[#707070] truncate mt-0.5">
                                  {u.email}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingLabUserId(u.id);
                                    setLabUserForm({
                                      name: u.name,
                                      email: u.email,
                                      role: u.role === 'admin' ? 'admin' : 'biomedical',
                                      password: '',
                                    });
                                    setUserModalOpen(true);
                                  }}
                                  className="p-2 rounded-full bg-white hover:bg-[#e5e5ea] text-[#1d1d1f]"
                                  title="Editar usuário"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {u.id !== user?.id && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await api.deleteUser(u.id);
                                        setLabUsers((prev) => prev.filter((item) => item.id !== u.id));
                                        showToast('Usuário removido.');
                                      } catch (err: any) {
                                        showToast(err?.message || 'Erro ao remover usuário.');
                                      }
                                    }}
                                    className="p-2 rounded-full bg-white hover:bg-red-50 text-red-600"
                                    title="Remover usuário"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                      <PaginationBar
                        page={usersPage}
                        pageSize={8}
                        totalItems={
                          labUsers.filter((u) => {
                            const q = userSearch.trim().toLowerCase();
                            if (!q) return true;
                            return `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q);
                          }).length
                        }
                        onPageChange={setUsersPage}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {settingsTab === 'vets' && (
            <div className="space-y-6">
              {/* VETERINÁRIOS E CLÍNICAS PARCEIRAS */}
              <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold mb-1.5">
                      <Lock className="w-3 h-3" />
                      Acesso exclusivo ao Portal do Veterinário
                    </span>
                    <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                      Veterinários & Clínicas Parceiras
                    </h3>
                    <p className="text-[12px] text-[#707070]">
                      Médicos Veterinários acessam somente o Portal do Veterinário (via E-mail + Senha), sem acesso ao Painel Laboratorial.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingVetId(null);
                      setVetForm({ name: '', crmv: '', clinic_name: '', email: '', phone: '', password: '' });
                      setVetModalOpen(true);
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer shrink-0"
                  >
                    + Novo Veterinário
                  </button>
                </div>

                {vetModalOpen && (
                  <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4"
                    onClick={() => {
                      setVetModalOpen(false);
                      setEditingVetId(null);
                      setVetForm({ name: '', crmv: '', clinic_name: '', email: '', phone: '', password: '' });
                    }}
                  >
                    <form
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        try {
                          if (editingVetId) {
                            const updated = await api.updateVet(editingVetId, {
                              name: vetForm.name,
                              email: vetForm.email,
                              phone: vetForm.phone,
                              crmv: vetForm.crmv,
                              clinic_name: vetForm.clinic_name,
                              ...(vetForm.password.trim()
                                ? { password: vetForm.password.trim() }
                                : {}),
                            });
                            setVets((prev) => prev.map((v) => (v.id === editingVetId ? updated : v)));
                            showToast('Veterinário parceiro atualizado!');
                          } else {
                            const created = await api.createVet({
                              name: vetForm.name,
                              email: vetForm.email,
                              phone: vetForm.phone,
                              crmv: vetForm.crmv,
                              clinic_name: vetForm.clinic_name,
                              password: vetForm.password.trim(),
                            });
                            setVets((prev) => [created, ...prev]);
                            showToast('Veterinário parceiro e usuário de acesso cadastrados!');
                          }
                          setEditingVetId(null);
                          setVetForm({ name: '', crmv: '', clinic_name: '', email: '', phone: '', password: '' });
                          setVetModalOpen(false);
                        } catch (err: any) {
                          showToast(err?.message || 'Erro ao salvar veterinário.');
                        }
                      }}
                      className="bg-white rounded-[24px] sm:rounded-[28px] max-w-xl w-full min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-4 shadow-2xl border border-black/10"
                    >
                      <div className="flex items-start sm:items-center justify-between gap-2 pb-2 border-b border-[#e5e5ea]">
                        <h4 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                          {editingVetId ? 'Editar Veterinário Parceiro' : 'Novo Veterinário / Clínica Parceira'}
                        </h4>
                        <button
                          type="button"
                          onClick={() => {
                            setVetModalOpen(false);
                            setEditingVetId(null);
                            setVetForm({ name: '', crmv: '', clinic_name: '', email: '', phone: '', password: '' });
                          }}
                          className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#707070] hover:text-[#1d1d1f] transition cursor-pointer shrink-0"
                          aria-label="Fechar"
                          title="Fechar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-[#707070] mb-1">Nome do Veterinário *</label>
                          <input
                            type="text"
                            required
                            value={vetForm.name}
                            onChange={(e) => setVetForm({ ...vetForm, name: e.target.value })}
                            placeholder="Ex: Dr. Lucas Ferreira"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#707070] mb-1">E-mail de Acesso *</label>
                          <input
                            type="email"
                            required
                            value={vetForm.email}
                            onChange={(e) => setVetForm({ ...vetForm, email: e.target.value })}
                            placeholder="lucas@vetcare.com.br"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#707070] mb-1">Telefone / WhatsApp *</label>
                          <input
                            type="text"
                            required
                            value={vetForm.phone}
                            onChange={(e) => setVetForm({ ...vetForm, phone: e.target.value })}
                            placeholder="(16) 99999-0000"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#707070] mb-1">
                            {editingVetId ? 'Nova Senha (opcional)' : 'Senha de Acesso *'}
                          </label>
                          <input
                            type="password"
                            required={!editingVetId}
                            minLength={4}
                            value={vetForm.password}
                            onChange={(e) => setVetForm({ ...vetForm, password: e.target.value })}
                            placeholder={editingVetId ? 'Deixe em branco para manter' : 'Mínimo 4 caracteres'}
                            className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#707070] mb-1">CRMV Obrigatório *</label>
                          <input
                            type="text"
                            required
                            value={vetForm.crmv}
                            onChange={(e) => setVetForm({ ...vetForm, crmv: e.target.value.toUpperCase() })}
                            placeholder="Ex: CRMV-MG 12345"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] font-mono uppercase text-[13px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#707070] mb-1">Clínica / Hospital Parceiro (Opcional)</label>
                          <input
                            type="text"
                            value={vetForm.clinic_name}
                            onChange={(e) => setVetForm({ ...vetForm, clinic_name: e.target.value })}
                            placeholder="Ex: Clínica VetCare"
                            className="w-full px-3.5 py-2 rounded-xl bg-[#f5f5f7] text-[13px]"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold hover:opacity-95 transition cursor-pointer"
                        >
                          {editingVetId ? 'Salvar Alterações' : 'Cadastrar Veterinário'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setVetModalOpen(false);
                            setEditingVetId(null);
                            setVetForm({ name: '', crmv: '', clinic_name: '', email: '', phone: '', password: '' });
                          }}
                          className="px-4 py-2 rounded-full bg-[#f5f5f7] text-[#707070] text-[12px] font-semibold cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={vetSearch}
                    onChange={(e) => setVetSearch(e.target.value)}
                    placeholder="Pesquisar veterinário por nome, CRMV, clínica ou e-mail..."
                    className="w-full px-4 py-2 rounded-full bg-[#f5f5f7] text-[12px]"
                  />
                  <div className="space-y-2">
                    {vets
                      .filter((v) => {
                        const q = vetSearch.trim().toLowerCase();
                        if (!q) return true;
                        return `${v.name} ${v.crmv} ${v.clinic_name || ''} ${v.email}`
                          .toLowerCase()
                          .includes(q);
                      })
                      .slice((vetsPage - 1) * 8, vetsPage * 8)
                      .map((v) => (
                        <div
                          key={v.id}
                          className="p-3.5 rounded-2xl bg-[#f5f5f7] flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-[#1d1d1f] truncate">
                                {v.name}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-white text-[#0b2240] text-[10px] font-mono font-semibold border border-black/5">
                                {v.crmv}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#707070] truncate mt-0.5">
                              {v.clinic_name} • {v.email} {v.phone ? `• ${v.phone}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVetId(v.id);
                                setVetForm({
                                  name: v.name,
                                  crmv: v.crmv || '',
                                  clinic_name: v.clinic_name || '',
                                  email: v.email,
                                  phone: v.phone || '',
                                  password: '',
                                });
                                setVetModalOpen(true);
                              }}
                              className="p-2 rounded-full bg-white hover:bg-[#e5e5ea] text-[#1d1d1f]"
                              title="Editar veterinário"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await api.deleteVet(v.id);
                                  setVets((prev) => prev.filter((item) => item.id !== v.id));
                                  showToast('Veterinário removido.');
                                } catch (err: any) {
                                  showToast(err?.message || 'Erro ao remover veterinário.');
                                }
                              }}
                              className="p-2 rounded-full bg-white hover:bg-red-50 text-red-600"
                              title="Remover veterinário"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                  <PaginationBar
                    page={vetsPage}
                    pageSize={8}
                    totalItems={
                      vets.filter((v) => {
                        const q = vetSearch.trim().toLowerCase();
                        if (!q) return true;
                        return `${v.name} ${v.crmv} ${v.clinic_name || ''} ${v.email}`
                          .toLowerCase()
                          .includes(q);
                      }).length
                    }
                    onPageChange={setVetsPage}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          ABA 5: MÓDULO FINANCEIRO (VISÃO FINANCEIRA + FATURAMENTO — ADMIN)
         ===================================================================== */}
      {activeTab === 'financial' && user.role === 'admin' && (
        <div className="space-y-5 sm:space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFinancialSubTab('overview')}
              className={`px-4 py-2 rounded-full text-[12px] font-semibold inline-flex items-center gap-2 transition cursor-pointer ${
                financialSubTab === 'overview'
                  ? 'bg-[#0b2240] text-white shadow-xs'
                  : 'bg-white border border-black/5 text-[#1d1d1f] hover:bg-[#f5f5f7]'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Dashboard Financeiro</span>
            </button>
            <button
              type="button"
              onClick={() => setFinancialSubTab('billing')}
              className={`px-4 py-2 rounded-full text-[12px] font-semibold inline-flex items-center gap-2 transition cursor-pointer ${
                financialSubTab === 'billing'
                  ? 'bg-[#0b2240] text-white shadow-xs'
                  : 'bg-white border border-black/5 text-[#1d1d1f] hover:bg-[#f5f5f7]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Faturamento & Boletos ({invoices.filter((i) => i.status === 'aguardando_pagamento').length})</span>
            </button>
          </div>

          {financialSubTab === 'billing' && (
            <BillingSection
              orders={orders}
              vets={vets}
              invoices={invoices}
              onRefresh={loadAllData}
              onToast={showToast}
            />
          )}

          {financialSubTab === 'overview' && finStats && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-[28px] rounded-[24px] sm:rounded-[28px]">
              <div className="text-[11px] sm:text-[12px] uppercase text-[#86868b]">Receita Bruta Mensal</div>
              <div className="font-display text-[24px] sm:text-[32px] font-semibold text-[#1d1d1f] font-mono mt-1">
                R$ {finStats.monthly_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] sm:text-[12px] text-[#707070] mt-1">Faturamento de exames</div>
            </div>

            <div className="bg-white p-4 sm:p-[28px] rounded-[24px] sm:rounded-[28px]">
              <div className="text-[11px] sm:text-[12px] uppercase text-[#86868b]">Ticket Médio por Pedido</div>
              <div className="font-display text-[24px] sm:text-[32px] font-semibold text-[#1d1d1f] font-mono mt-1">
                R$ {finStats.average_ticket.toFixed(2)}
              </div>
              <div className="text-[11px] sm:text-[12px] text-[#707070] mt-1">Média por protocolo emitido</div>
            </div>

            <div className="bg-white p-4 sm:p-[28px] rounded-[24px] sm:rounded-[28px]">
              <div className="text-[11px] sm:text-[12px] uppercase text-[#86868b]">
                Custos Operacionais & Insumos
              </div>
              <div className="font-display text-[24px] sm:text-[32px] font-semibold text-[#1d1d1f] font-mono mt-1">
                R$ {finStats.operational_costs.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] sm:text-[12px] text-[#707070] mt-1">Reagentes, tubos e logística</div>
            </div>

            <div className="bg-[#1d1d1f] text-[#f5f5f7] p-4 sm:p-[28px] rounded-[24px] sm:rounded-[28px]">
              <div className="text-[11px] sm:text-[12px] uppercase text-[#86868b]">
                Resultado Líquido (Balancete)
              </div>
              <div className="font-display text-[24px] sm:text-[32px] font-semibold text-white font-mono mt-1">
                R$ {finStats.net_margin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] sm:text-[12px] text-[#86868b] mt-1">
                Margem Operacional: {finStats.margin_percent}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
            <div className="lg:col-span-6 bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
              <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                Faturamento por Tabela de Vigência / Convênio
              </h3>
              <div className="space-y-3">
                {finStats.revenue_by_table.map((row) => (
                  <div
                    key={row.table_name}
                    className="p-4 sm:p-5 rounded-[20px] sm:rounded-[25px] bg-[#f5f5f7] flex flex-wrap items-center justify-between gap-2 text-[12px]"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1d1d1f] break-words">{row.table_name}</div>
                      <div className="text-[#707070]">
                        {row.partner} • {row.count} atendimentos
                      </div>
                    </div>
                    <div className="font-mono font-semibold text-[#1d1d1f] text-[15px] sm:text-[17px] shrink-0">
                      R$ {row.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-4">
              <h3 className="font-display text-[19px] sm:text-[21px] font-semibold text-[#1d1d1f]">
                Balancete Simples (Entradas e Custos Operacionais)
              </h3>
              <div className="divide-y divide-[#f5f5f7] text-[12px]">
                {finStats.ledger_entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="py-3.5 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[#1d1d1f] break-words">{entry.description}</div>
                      <div className="text-[#86868b]">
                        {entry.date} • {entry.category}
                      </div>
                    </div>
                    <span
                      className={`font-mono font-semibold shrink-0 ${entry.type === 'entrada' ? 'text-[#1d1d1f]' : 'text-[#707070]'
                        }`}
                    >
                      {entry.type === 'entrada' ? '+' : '-'} R${' '}
                      {entry.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
