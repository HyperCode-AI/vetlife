export type InternalUserRole = 'admin' | 'biomedical';
export type AuthRole = InternalUserRole | 'vet';

export interface User {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  role: InternalUserRole;
  created_at: string;
}

export type SafeUser = Omit<User, 'password_hash'>;

export type FieldType = 'text' | 'number' | 'select' | 'textarea';

export interface ExamInputField {
  id: string;
  exam_id: string;
  field_name: string;
  field_label: string;
  field_type: FieldType;
  unit?: string;
  options: string[];
  is_required: boolean;
  display_order: number;
}

export interface ExamLabelTemplate {
  id?: string;
  exam_id?: string;
  tube_type: string;
  label_qty: number;
  display_order?: number;
}

export function parseTubeTypeToLabelTemplates(
  tubeTypeRaw: string,
  totalQty?: number,
  examId = ''
): ExamLabelTemplate[] {
  const cleanRaw = (tubeTypeRaw || 'Tubo Padrão').trim();
  const segments = cleanRaw
    .split(/\s+\+\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (segments.length <= 1) {
    const formatted = cleanRaw.charAt(0).toUpperCase() + cleanRaw.slice(1);
    return [
      {
        ...(examId ? { exam_id: examId } : {}),
        tube_type: formatted,
        label_qty: Math.max(1, Number(totalQty) || 1),
        display_order: 1,
      },
    ];
  }

  return segments.map((seg, idx) => {
    const formatted = seg.charAt(0).toUpperCase() + seg.slice(1);
    return {
      ...(examId ? { exam_id: examId } : {}),
      tube_type: formatted,
      label_qty: 1,
      display_order: idx + 1,
    };
  });
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
  preparation?: string;
  label_qty: number;
  label_templates?: ExamLabelTemplate[];
  reference_template_id: string | null;
  base_price?: number;
  price?: number;
  active_price?: number;
  created_at: string;
  input_fields?: ExamInputField[];
}

export interface ExamPrice {
  id: string;
  price_table_id: string;
  exam_id: string;
  exam_code?: string;
  exam_name?: string;
  price: number;
}

export interface PriceTable {
  id: string;
  name: string;
  partner_clinic: string | null;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  prices?: ExamPrice[];
}

export type AnimalGender = 'M' | 'F' | 'Ambos';

export interface ExamReference {
  id: string;
  exam_id: string;
  exam_name?: string;
  parameter_name?: string;
  species: string;
  gender: AnimalGender;
  min_age_days: number;
  max_age_days: number;
  reference_text_content: string;
  min_value?: number | null;
  max_value?: number | null;
  unit?: string;
}

export interface ReportTemplate {
  id: string;
  name: string;
  header_html: string;
  footer_html: string;
  body_template: string;
  dynamic_tags: string[];
  is_default: boolean;
  created_at: string;
}

export interface Patient {
  id: string;
  name: string;
  species: string;
  breed: string;
  gender: 'M' | 'F';
  birth_date: string;
  age_days?: number;
  age_label?: string;
  tutor_name: string;
  tutor_phone: string;
  tutor_email: string;
  created_at: string;
}

export interface Vet {
  id: string;
  name: string;
  crmv: string;
  clinic_name: string;
  email: string;
  phone: string;
  password_hash?: string;
  created_at: string;
}

export type OrderStatus = 'pendente' | 'em_analise' | 'concluido';
export type PaymentStatus = 'nao_faturado' | 'aguardando_pagamento' | 'pago';
export type InvoiceStatus = 'aguardando_pagamento' | 'pago' | 'cancelado';

export interface Invoice {
  id: string;
  invoice_number: string;
  vet_id: string;
  reference_month?: string;
  period_start?: string | null;
  period_end?: string | null;
  due_date?: string | null;
  total_amount: number;
  status: InvoiceStatus;
  boleto_filename?: string;
  boleto_pdf_url?: string | null;
  notes?: string;
  paid_at?: string | null;
  created_at: string;
  vet?: Vet;
  orders?: Order[];
  order_ids?: string[];
  orders_count?: number;
}

export interface ReportAttachment {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'ultrasound';
  url: string;
  uploaded_at: string;
}

export interface ExamResult {
  id: string;
  order_id: string;
  exam_id: string;
  applied_price: number;
  dynamic_content: Record<string, string | number | boolean>;
  reference_snapshot: string;
  attachments: ReportAttachment[];
  pdf_url: string | null;
  released_at: string | null;
  released_by: string | null;
  exam?: Exam;
  matched_references?: ExamReference[];
  rendered_html?: string;
}

export interface Order {
  id: string;
  protocol_code: string;
  patient_id: string;
  vet_id: string;
  price_table_id: string | null;
  price_table_name?: string;
  invoice_id?: string | null;
  payment_status?: PaymentStatus;
  total_amount: number;
  status: OrderStatus;
  pdf_url?: string | null;
  notes: string;
  created_at: string;
  patient?: Patient;
  vet?: Vet;
  results?: ExamResult[];
}

export interface SampleLabel {
  label_id: string;
  protocol_code: string;
  barcode_value: string;
  patient_name: string;
  species: string;
  tutor_name: string;
  vet_name: string;
  exam_code: string;
  exam_name: string;
  section: string;
  material?: string;
  tube_type: string;
  label_index: number;
  total_labels_for_exam: number;
  created_at: string;
}

export type CollectionRequestStatus = 'pendente' | 'agendada' | 'concluida' | 'cancelada';

export interface CollectionRequest {
  id: string;
  clinic_or_tutor_name: string;
  crmv: string;
  phone: string;
  email: string;
  address: string;
  preferred_date?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  notes: string;
  status: CollectionRequestStatus;
  created_at: string;
}
