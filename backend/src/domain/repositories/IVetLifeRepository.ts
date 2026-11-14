import {
  CollectionRequest,
  Exam,
  ExamInputField,
  ExamPrice,
  ExamReference,
  ExamResult,
  Order,
  Patient,
  PriceTable,
  ReportTemplate,
  User,
  Vet,
} from '../entities';

export interface IUserRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  listUsers(): Promise<User[]>;
  createUser(data: Omit<User, 'id' | 'created_at'>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
}

export interface IExamRepository {
  listExams(): Promise<Exam[]>;
  findExamById(id: string): Promise<Exam | null>;
  findExamByCode(code: string): Promise<Exam | null>;
  createExam(data: Omit<Exam, 'id' | 'created_at'>): Promise<Exam>;
  updateExam(id: string, data: Partial<Exam>): Promise<Exam>;
  deleteExam(id: string): Promise<void>;
  listExamInputFields(examId: string): Promise<ExamInputField[]>;
  saveExamInputFields(
    examId: string,
    fields: Array<Omit<ExamInputField, 'id' | 'exam_id'> & { id?: string }>
  ): Promise<ExamInputField[]>;
  addExamInputField(
    examId: string,
    field: Omit<ExamInputField, 'id' | 'exam_id'>
  ): Promise<ExamInputField>;
  deleteExamInputField(examId: string, fieldId: string): Promise<void>;
}

export interface IPriceTableRepository {
  listPriceTables(): Promise<PriceTable[]>;
  findPriceTableById(id: string): Promise<PriceTable | null>;
  createPriceTable(
    data: Omit<PriceTable, 'id' | 'created_at' | 'prices'>,
    prices: Array<{ exam_id: string; price: number }>
  ): Promise<PriceTable>;
  updatePriceTable(
    id: string,
    data: Partial<Omit<PriceTable, 'id' | 'created_at' | 'prices'>>,
    prices?: Array<{ exam_id: string; price: number }>
  ): Promise<PriceTable>;
  deletePriceTable(id: string): Promise<void>;
  listExamPrices(priceTableId: string): Promise<ExamPrice[]>;
}

export interface IReferenceRepository {
  listExamReferences(filters?: {
    exam_id?: string;
    species?: string;
  }): Promise<ExamReference[]>;
  createExamReference(data: Omit<ExamReference, 'id'>): Promise<ExamReference>;
  updateExamReference(id: string, data: Partial<ExamReference>): Promise<ExamReference>;
  deleteExamReference(id: string): Promise<void>;
}

export interface IReportTemplateRepository {
  listReportTemplates(): Promise<ReportTemplate[]>;
  findReportTemplateById(id: string): Promise<ReportTemplate | null>;
  getDefaultReportTemplate(): Promise<ReportTemplate>;
  createReportTemplate(
    data: Omit<ReportTemplate, 'id' | 'created_at'>
  ): Promise<ReportTemplate>;
  updateReportTemplate(
    id: string,
    data: Partial<Omit<ReportTemplate, 'id' | 'created_at'>>
  ): Promise<ReportTemplate>;
}

export interface IPatientRepository {
  listPatients(): Promise<Patient[]>;
  findPatientById(id: string): Promise<Patient | null>;
  createPatient(data: Omit<Patient, 'id' | 'created_at'>): Promise<Patient>;
  updatePatient(id: string, data: Partial<Patient>): Promise<Patient>;
  deletePatient(id: string): Promise<void>;
}

export interface IVetRepository {
  listVets(): Promise<Vet[]>;
  findVetById(id: string): Promise<Vet | null>;
  findVetByEmail(email: string): Promise<Vet | null>;
  findVetByEmailAndCrmv(email: string, crmv: string): Promise<Vet | null>;
  createVet(data: Omit<Vet, 'id' | 'created_at'>): Promise<Vet>;
  updateVet(id: string, data: Partial<Vet>): Promise<Vet>;
  deleteVet(id: string): Promise<void>;
}

export interface IOrderRepository {
  listOrders(filters?: {
    status?: string;
    vet_id?: string;
    patient_id?: string;
    search?: string;
  }): Promise<Order[]>;
  findOrderById(id: string): Promise<Order | null>;
  findOrderByProtocolCode(protocolCode: string): Promise<Order | null>;
  createOrder(
    orderData: Omit<Order, 'id' | 'created_at' | 'results' | 'patient' | 'vet'>,
    resultsData: Array<Omit<ExamResult, 'id' | 'order_id'>>
  ): Promise<Order>;
  updateOrderStatus(
    orderId: string,
    status: Order['status'],
    notes?: string,
    pdfUrl?: string | null
  ): Promise<Order>;
  updateExamResult(
    orderId: string,
    resultId: string,
    data: Partial<ExamResult>
  ): Promise<ExamResult>;
}

export interface ICollectionRequestRepository {
  listCollectionRequests(): Promise<CollectionRequest[]>;
  createCollectionRequest(
    data: Omit<CollectionRequest, 'id' | 'created_at' | 'status'> & {
      status?: CollectionRequest['status'];
    }
  ): Promise<CollectionRequest>;
  updateCollectionRequestStatus(
    id: string,
    status: CollectionRequest['status'],
    scheduledDate?: string,
    scheduledTime?: string
  ): Promise<CollectionRequest>;
}

export interface IVetLifeRepository
  extends IUserRepository,
    IExamRepository,
    IPriceTableRepository,
    IReferenceRepository,
    IReportTemplateRepository,
    IPatientRepository,
    IVetRepository,
    IOrderRepository,
    ICollectionRequestRepository {
  getStorageMode(): 'supabase' | 'in-memory-seeded';
}
