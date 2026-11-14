export type UserRole = 'admin' | 'biomedical' | 'vet';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'biomedical';
  created_at?: string;
}

export interface Vet {
  id: string;
  name: string;
  crmv: string;
  clinic_name: string;
  email: string;
  phone: string;
  created_at?: string;
}

export type FieldType = 'text' | 'number' | 'select' | 'textarea';

export interface ExamInputField {
  id: string;
  exam_id: string;
  field_name: string;
  field_label?: string;
  field_type: FieldType;
  unit?: string;
  options?: string[];
  is_required: boolean;
  display_order?: number;
}

export interface Exam {
  id: string;
  code: string;
  name: string;
  section: string;
  delivery_days: number;
  delivery_time_label?: string;
  tube_type: string;
  material?: string;
  label_qty: number;
  reference_template_id?: string;
  base_price?: number;
  price?: number;
  input_fields?: ExamInputField[];
  created_at?: string;
}

export interface ExamPrice {
  id?: string;
  price_table_id?: string;
  exam_id: string;
  exam_code?: string;
  exam_name?: string;
  price: number;
}

export interface PriceTable {
  id: string;
  name: string;
  partner_clinic?: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  prices?: ExamPrice[];
  items?: ExamPrice[];
  created_at?: string;
}

export interface ExamReference {
  id: string;
  exam_id: string;
  exam_name?: string;
  species: string; // 'Canino' | 'Felino' | 'Equino' | 'Silvestre'
  gender: string;  // 'M' | 'F' | 'Ambos'
  min_age_days: number;
  max_age_days: number;
  reference_text_content: string;
  min_value?: number;
  max_value?: number;
  unit?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  header_html: string;
  footer_html: string;
  body_template: string;
  dynamic_tags?: string[];
  is_default: boolean;
  created_at?: string;
}

export interface Patient {
  id: string;
  name: string;
  species: string;
  breed: string;
  gender: 'M' | 'F';
  birth_date: string;
  age_days?: number;
  tutor_name: string;
  tutor_phone: string;
  tutor_email: string;
  created_at?: string;
}

export interface ExamAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'document';
  url: string;
  uploaded_at: string;
}

export interface ExamResultItem {
  id: string;
  order_id: string;
  exam_id: string;
  exam?: Exam;
  exam_code?: string;
  exam_name?: string;
  section?: string;
  applied_price?: number;
  dynamic_content: Record<string, any>;
  reference_snapshot?: string;
  matched_reference?: ExamReference | null;
  attachments?: ExamAttachment[];
  notes?: string;
  pdf_url?: string;
  released_at?: string;
  released_by?: string;
  input_fields?: ExamInputField[];
}

export type OrderStatus = 'pendente' | 'em_analise' | 'concluido';

export interface Order {
  id: string;
  protocol_code: string;
  patient_id: string;
  vet_id: string;
  price_table_id?: string;
  price_table_name?: string;
  total_amount: number;
  status: OrderStatus;
  pdf_url?: string | null;
  notes?: string;
  created_at: string;
  released_at?: string;
  patient?: Patient;
  vet?: Vet;
  results?: ExamResultItem[];
  rendered_report?: string;
  template?: ReportTemplate;
}

export interface CollectionLabel {
  label_id: string;
  protocol_code: string;
  barcode: string;
  patient_name: string;
  species: string;
  tutor_name: string;
  exam_code: string;
  exam_name: string;
  section: string;
  tube_type: string;
  label_index: number;
  total_labels_for_exam: number;
  created_at: string;
}

export interface CollectionRequest {
  id?: string;
  clinic_or_tutor_name: string;
  phone: string;
  email: string;
  address: string;
  preferred_date?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  notes: string;
  status?: string;
  created_at?: string;
}

export interface OperationalStats {
  today_orders: number;
  total_orders: number;
  pending_orders: number;
  in_analysis_orders: number;
  completed_orders: number;
  pending_collections: number;
  section_breakdown: Array<{ section: string; count: number }>;
  recent_orders: Order[];
}

export interface FinancialStats {
  total_revenue: number;
  monthly_revenue: number;
  average_ticket: number;
  operational_costs: number;
  net_margin: number;
  margin_percent: number;
  revenue_by_table: Array<{ table_name: string; partner: string; count: number; total: number }>;
  top_exams: Array<{ exam_code: string; exam_name: string; count: number; revenue: number }>;
  ledger_entries: Array<{ id: string; date: string; description: string; type: 'entrada' | 'saida'; category: string; amount: number }>;
}
