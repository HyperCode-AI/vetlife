import { z } from 'zod';

export const internalLoginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(3, 'Informe a senha de acesso.'),
});

export const vetLoginSchema = z
  .object({
    email: z.string().email('Informe o e-mail cadastrado do médico veterinário.'),
    password: z.string().optional(),
    crmv: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.password && data.password.trim().length >= 3) ||
      (data.crmv && data.crmv.trim().length >= 3),
    {
      message: 'Informe a senha de acesso ou o número do CRMV.',
    }
  );

export const examInputFieldSchema = z.object({
  id: z.string().optional(),
  field_name: z.string().min(1, 'Nome técnico do campo é obrigatório.'),
  field_label: z.string().optional(),
  field_type: z.enum(['text', 'number', 'select', 'textarea']).default('text'),
  unit: z.string().optional().default(''),
  options: z.array(z.string()).optional().default([]),
  is_required: z.boolean().optional().default(true),
  display_order: z.number().optional().default(1),
});

export const createExamSchema = z.object({
  code: z.string().min(1, 'Código do exame é obrigatório.'),
  name: z.string().min(2, 'Nome do exame é obrigatório.'),
  section: z.string().min(2, 'Seção técnica é obrigatória.'),
  delivery_days: z.coerce.number().min(0).default(1),
  delivery_time_label: z.string().optional(),
  tube_type: z.string().min(2, 'Tipo de tubo/amostra é obrigatório.'),
  material: z.string().optional(),
  preparation: z.string().optional(),
  label_qty: z.coerce.number().min(1).default(1),
  reference_template_id: z.string().nullable().optional(),
  base_price: z.coerce.number().min(0).optional(),
  price: z.coerce.number().min(0).optional(),
  input_fields: z.array(examInputFieldSchema).optional(),
});

export const createPriceTableSchema = z.object({
  name: z.string().min(2, 'Nome da tabela de preços é obrigatório.'),
  partner_clinic: z.string().nullable().optional(),
  start_date: z.string().min(8, 'Data inicial de vigência é obrigatória.'),
  end_date: z.string().min(8, 'Data final de vigência é obrigatória.'),
  is_active: z.boolean().optional().default(true),
  adjustment_percent: z.coerce.number().optional(),
  prices: z
    .array(
      z.object({
        exam_id: z.string(),
        price: z.coerce.number().min(0),
      })
    )
    .optional(),
});

export const createExamReferenceSchema = z.object({
  exam_id: z.string().min(1, 'ID do exame é obrigatório.'),
  parameter_name: z.string().optional(),
  species: z.string().min(2, 'Espécie é obrigatória.'),
  gender: z.enum(['M', 'F', 'Ambos']).optional().default('Ambos'),
  min_age_days: z.coerce.number().min(0).default(0),
  max_age_days: z.coerce.number().min(0).default(9125),
  reference_text_content: z.string().min(2, 'Conteúdo dos valores de referência é obrigatório.'),
  min_value: z.coerce.number().nullable().optional(),
  max_value: z.coerce.number().nullable().optional(),
  unit: z.string().optional(),
});

export const createReportTemplateSchema = z.object({
  name: z.string().min(2, 'Nome do modelo de laudo é obrigatório.'),
  header_html: z.string().default(''),
  footer_html: z.string().default(''),
  body_template: z.string().default(''),
  dynamic_tags: z.array(z.string()).optional(),
  is_default: z.boolean().optional().default(false),
});

export const createCollectionRequestSchema = z.object({
  clinic_or_tutor_name: z.string().min(2, 'Informe o nome da clínica ou tutor.'),
  phone: z.string().min(6, 'Informe o telefone para contato.'),
  email: z.string().optional().default(''),
  address: z.string().min(5, 'Informe o endereço de coleta.'),
  preferred_date: z.string().optional(),
  notes: z.string().optional().default(''),
});
