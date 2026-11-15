-- =============================================================================
-- PLATAFORMA VETLIFE (vetlifelab.com.br) — SUPABASE / POSTGRESQL SCHEMA (DDL)
-- =============================================================================
-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. TABELA: users (Atores Internos: Administrador e Biomédico/Técnico — RN-01)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('admin', 'biomedical')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- =============================================================================
-- 2. TABELA: report_templates (Modelos de Laudos Dinâmicos — HU-05, RN-01)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.report_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    header_html TEXT NOT NULL DEFAULT '',
    footer_html TEXT NOT NULL DEFAULT '',
    body_template TEXT NOT NULL DEFAULT '',
    dynamic_tags JSONB NOT NULL DEFAULT '["{{paciente}}","{{especie}}","{{raca}}","{{sexo}}","{{idade}}","{{tutor}}","{{veterinario}}","{{crmv}}","{{protocolo}}","{{data_liberacao}}","{{resultados}}","{{referencias}}"]'::jsonb,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. TABELA: exams (Catálogo de Exames Laboratoriais — HU-01, RN-01)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(30) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    section VARCHAR(100) NOT NULL,
    delivery_days INTEGER NOT NULL DEFAULT 1 CHECK (delivery_days >= 0),
    delivery_time_label TEXT NOT NULL DEFAULT '1 dia útil',
    tube_type VARCHAR(255) NOT NULL,
    label_qty INTEGER NOT NULL DEFAULT 1 CHECK (label_qty >= 1),
    reference_template_id UUID REFERENCES public.report_templates(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_code ON public.exams(code);
CREATE INDEX IF NOT EXISTS idx_exams_section ON public.exams(section);

-- =============================================================================
-- 4. TABELA: exam_input_fields (Campos Dinâmicos por Exame — HU-02, RN-01, RN-03)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exam_input_fields (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    field_name VARCHAR(100) NOT NULL,
    field_label VARCHAR(150) NOT NULL,
    field_type VARCHAR(30) NOT NULL CHECK (field_type IN ('text', 'number', 'select', 'textarea')),
    unit VARCHAR(50) DEFAULT '',
    options JSONB DEFAULT '[]'::jsonb,
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 1,
    UNIQUE (exam_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_exam_input_fields_exam_id ON public.exam_input_fields(exam_id, display_order);

-- =============================================================================
-- 5. TABELA: price_tables (Tabelas de Preços com Vigência — HU-03, RN-01, RN-04)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.price_tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    partner_clinic VARCHAR(150) DEFAULT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_price_table_dates CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_price_tables_vigencia ON public.price_tables(is_active, start_date, end_date);

-- =============================================================================
-- 6. TABELA: exam_prices (Preços de Exames por Tabela de Vigência — HU-03, RN-04)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exam_prices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    price_table_id UUID NOT NULL REFERENCES public.price_tables(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    UNIQUE (price_table_id, exam_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_prices_table_exam ON public.exam_prices(price_table_id, exam_id);

-- =============================================================================
-- 7. TABELA: exam_references (Valores de Referência por Espécie/Sexo/Idade — HU-04)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exam_references (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    species VARCHAR(50) NOT NULL,
    gender VARCHAR(20) NOT NULL DEFAULT 'Ambos' CHECK (gender IN ('M', 'F', 'Ambos')),
    min_age_days INTEGER NOT NULL DEFAULT 0 CHECK (min_age_days >= 0),
    max_age_days INTEGER NOT NULL DEFAULT 36500 CHECK (max_age_days >= min_age_days),
    reference_text_content TEXT NOT NULL,
    min_value NUMERIC(10,2) DEFAULT NULL,
    max_value NUMERIC(10,2) DEFAULT NULL,
    unit VARCHAR(50) DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_exam_references_lookup ON public.exam_references(exam_id, species, gender, min_age_days, max_age_days);

-- =============================================================================
-- 8. TABELA: patients (Pacientes / Animais e Dados do Tutor — HU-06)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.patients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    species VARCHAR(50) NOT NULL,
    breed VARCHAR(100) NOT NULL,
    gender VARCHAR(20) NOT NULL CHECK (gender IN ('M', 'F')),
    birth_date DATE NOT NULL,
    tutor_name VARCHAR(150) NOT NULL,
    tutor_phone VARCHAR(40) NOT NULL,
    tutor_email VARCHAR(150) DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_name ON public.patients(name);
CREATE INDEX IF NOT EXISTS idx_patients_tutor ON public.patients(tutor_name);

-- =============================================================================
-- 9. TABELA: vets (Médicos Veterinários Parceiros — HU-06, HU-10)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.vets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    crmv VARCHAR(40) NOT NULL UNIQUE,
    clinic_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(40) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vets_email_crmv ON public.vets(email, crmv);

-- =============================================================================
-- 10. TABELA: orders (Atendimentos / Pedidos de Exames — HU-06, HU-12, RN-02, RN-04)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    protocol_code VARCHAR(40) NOT NULL UNIQUE,
    patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
    vet_id UUID NOT NULL REFERENCES public.vets(id) ON DELETE RESTRICT,
    price_table_id UUID REFERENCES public.price_tables(id) ON DELETE SET NULL,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    status VARCHAR(30) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_analise', 'concluido')),
    pdf_url TEXT DEFAULT NULL,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_protocol_code ON public.orders(protocol_code);
CREATE INDEX IF NOT EXISTS idx_orders_vet_id ON public.orders(vet_id);
CREATE INDEX IF NOT EXISTS idx_orders_patient_id ON public.orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- =============================================================================
-- 11. TABELA: exam_results (Resultados Dinâmicos, Anexos e PDF — HU-07, HU-08, HU-09)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.exam_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE RESTRICT,
    applied_price NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (applied_price >= 0),
    dynamic_content JSONB NOT NULL DEFAULT '{}'::jsonb,
    reference_snapshot TEXT DEFAULT '',
    attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
    pdf_url TEXT DEFAULT NULL,
    released_at TIMESTAMPTZ DEFAULT NULL,
    released_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exam_results_order_id ON public.exam_results(order_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_id ON public.exam_results(exam_id);

-- =============================================================================
-- 12. TABELA: collection_requests (Solicitações de Coleta via Landing Page)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.collection_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_or_tutor_name VARCHAR(150) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    email VARCHAR(150) DEFAULT '',
    address TEXT NOT NULL,
    notes TEXT DEFAULT '',
    preferred_date VARCHAR(20),
    scheduled_date VARCHAR(20),
    scheduled_time VARCHAR(20),
    status VARCHAR(30) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'agendada', 'concluida', 'cancelada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_requests_status ON public.collection_requests(status, created_at DESC);
