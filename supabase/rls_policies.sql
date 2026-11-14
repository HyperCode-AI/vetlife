-- =============================================================================
-- PLATAFORMA VETLIFE (vetlifelab.com.br) — ROW LEVEL SECURITY (RLS) POLICIES
-- Garantia estrita de RN-01 (Exclusividade Admin em Configurações/Financeiro)
-- e RN-02 (Consulta Pública de Tutores estritamente por protocol_code sem senha)
-- =============================================================================

-- Habilitar RLS em todas as tabelas do schema public
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_input_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_requests ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- FUNÇÕES AUXILIARES DE SEGURANÇA (CLAIMS DO JWT / SUPABASE AUTH)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'role'),
    'anon'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_vet_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claims', true)::jsonb ->> 'vet_id',
      current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

CREATE OR REPLACE FUNCTION public.requested_protocol_code()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.headers', true)::jsonb ->> 'x-protocol-code',
    current_setting('app.current_protocol_code', true),
    ''
  );
$$;

-- =============================================================================
-- 1. POLÍTICAS PARA TABELA: users (RN-01)
-- Somente Admin gerencia usuários; Biomédico pode ler apenas seu próprio perfil.
-- =============================================================================
DROP POLICY IF EXISTS "users_admin_all" ON public.users;
CREATE POLICY "users_admin_all" ON public.users
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "users_self_select" ON public.users;
CREATE POLICY "users_self_select" ON public.users
    FOR SELECT
    USING (
        public.current_user_role() = 'biomedical'
        AND id::text = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    );

-- =============================================================================
-- 2. POLÍTICAS DE CONFIGURAÇÃO (RN-01: Escrita exclusiva para 'admin')
-- Tabelas: exams, exam_input_fields, price_tables, exam_prices,
--          exam_references, report_templates
-- =============================================================================

-- 2.1. exams (HU-01, RN-01)
DROP POLICY IF EXISTS "exams_read_all" ON public.exams;
CREATE POLICY "exams_read_all" ON public.exams
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "exams_admin_write" ON public.exams;
CREATE POLICY "exams_admin_write" ON public.exams
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- 2.2. exam_input_fields (HU-02, RN-01, RN-03)
DROP POLICY IF EXISTS "exam_input_fields_read_all" ON public.exam_input_fields;
CREATE POLICY "exam_input_fields_read_all" ON public.exam_input_fields
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "exam_input_fields_admin_write" ON public.exam_input_fields;
CREATE POLICY "exam_input_fields_admin_write" ON public.exam_input_fields
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- 2.3. price_tables (HU-03, RN-01, RN-04)
DROP POLICY IF EXISTS "price_tables_internal_read" ON public.price_tables;
CREATE POLICY "price_tables_internal_read" ON public.price_tables
    FOR SELECT
    USING (public.current_user_role() IN ('admin', 'biomedical'));

DROP POLICY IF EXISTS "price_tables_admin_write" ON public.price_tables;
CREATE POLICY "price_tables_admin_write" ON public.price_tables
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- 2.4. exam_prices (HU-03, RN-01, RN-04)
DROP POLICY IF EXISTS "exam_prices_internal_read" ON public.exam_prices;
CREATE POLICY "exam_prices_internal_read" ON public.exam_prices
    FOR SELECT
    USING (public.current_user_role() IN ('admin', 'biomedical'));

DROP POLICY IF EXISTS "exam_prices_admin_write" ON public.exam_prices;
CREATE POLICY "exam_prices_admin_write" ON public.exam_prices
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- 2.5. exam_references (HU-04, RN-01)
DROP POLICY IF EXISTS "exam_references_read_all" ON public.exam_references;
CREATE POLICY "exam_references_read_all" ON public.exam_references
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "exam_references_admin_write" ON public.exam_references;
CREATE POLICY "exam_references_admin_write" ON public.exam_references
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- 2.6. report_templates (HU-05, RN-01)
DROP POLICY IF EXISTS "report_templates_read_all" ON public.report_templates;
CREATE POLICY "report_templates_read_all" ON public.report_templates
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "report_templates_admin_write" ON public.report_templates;
CREATE POLICY "report_templates_admin_write" ON public.report_templates
    FOR ALL
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');

-- =============================================================================
-- 3. POLÍTICAS OPERACIONAIS, PORTAL VETERINÁRIO E CONSULTA POR PROTOCOLO (RN-02)
-- Tabelas: patients, vets, orders, exam_results, collection_requests
-- =============================================================================

-- 3.1. patients (HU-06)
DROP POLICY IF EXISTS "patients_internal_all" ON public.patients;
CREATE POLICY "patients_internal_all" ON public.patients
    FOR ALL
    USING (public.current_user_role() IN ('admin', 'biomedical'))
    WITH CHECK (public.current_user_role() IN ('admin', 'biomedical'));

DROP POLICY IF EXISTS "patients_vet_read" ON public.patients;
CREATE POLICY "patients_vet_read" ON public.patients
    FOR SELECT
    USING (
        public.current_user_role() = 'vet'
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.patient_id = patients.id
              AND o.vet_id = public.current_vet_id()
        )
    );

DROP POLICY IF EXISTS "patients_tutor_protocol_read" ON public.patients;
CREATE POLICY "patients_tutor_protocol_read" ON public.patients
    FOR SELECT
    USING (
        public.requested_protocol_code() <> ''
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.patient_id = patients.id
              AND o.protocol_code = public.requested_protocol_code()
        )
    );

-- 3.2. vets (HU-06, HU-10)
DROP POLICY IF EXISTS "vets_internal_all" ON public.vets;
CREATE POLICY "vets_internal_all" ON public.vets
    FOR ALL
    USING (public.current_user_role() IN ('admin', 'biomedical'))
    WITH CHECK (public.current_user_role() IN ('admin', 'biomedical'));

DROP POLICY IF EXISTS "vets_self_read" ON public.vets;
CREATE POLICY "vets_self_read" ON public.vets
    FOR SELECT
    USING (
        public.current_user_role() = 'vet'
        AND id = public.current_vet_id()
    );

DROP POLICY IF EXISTS "vets_tutor_protocol_read" ON public.vets;
CREATE POLICY "vets_tutor_protocol_read" ON public.vets
    FOR SELECT
    USING (
        public.requested_protocol_code() <> ''
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.vet_id = vets.id
              AND o.protocol_code = public.requested_protocol_code()
        )
    );

-- 3.3. orders (HU-06, HU-10, HU-12, RN-02)
DROP POLICY IF EXISTS "orders_internal_all" ON public.orders;
CREATE POLICY "orders_internal_all" ON public.orders
    FOR ALL
    USING (public.current_user_role() IN ('admin', 'biomedical'))
    WITH CHECK (public.current_user_role() IN ('admin', 'biomedical'));

DROP POLICY IF EXISTS "orders_vet_select_own" ON public.orders;
CREATE POLICY "orders_vet_select_own" ON public.orders
    FOR SELECT
    USING (
        public.current_user_role() = 'vet'
        AND vet_id = public.current_vet_id()
    );

-- RN-02: Tutor visualiza estritamente o pedido cujo protocol_code foi informado
DROP POLICY IF EXISTS "orders_tutor_by_protocol" ON public.orders;
CREATE POLICY "orders_tutor_by_protocol" ON public.orders
    FOR SELECT
    USING (
        public.requested_protocol_code() <> ''
        AND protocol_code = public.requested_protocol_code()
    );

-- 3.4. exam_results (HU-07, HU-08, HU-09, HU-11, HU-12, RN-02)
DROP POLICY IF EXISTS "exam_results_internal_all" ON public.exam_results;
CREATE POLICY "exam_results_internal_all" ON public.exam_results
    FOR ALL
    USING (public.current_user_role() IN ('admin', 'biomedical'))
    WITH CHECK (public.current_user_role() IN ('admin', 'biomedical'));

DROP POLICY IF EXISTS "exam_results_vet_select" ON public.exam_results;
CREATE POLICY "exam_results_vet_select" ON public.exam_results
    FOR SELECT
    USING (
        public.current_user_role() = 'vet'
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = exam_results.order_id
              AND o.vet_id = public.current_vet_id()
        )
    );

DROP POLICY IF EXISTS "exam_results_tutor_by_protocol" ON public.exam_results;
CREATE POLICY "exam_results_tutor_by_protocol" ON public.exam_results
    FOR SELECT
    USING (
        public.requested_protocol_code() <> ''
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = exam_results.order_id
              AND o.protocol_code = public.requested_protocol_code()
        )
    );

-- 3.5. collection_requests (Landing Page Pública -> Painel Interno)
DROP POLICY IF EXISTS "collection_requests_public_insert" ON public.collection_requests;
CREATE POLICY "collection_requests_public_insert" ON public.collection_requests
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "collection_requests_internal_all" ON public.collection_requests;
CREATE POLICY "collection_requests_internal_all" ON public.collection_requests
    FOR ALL
    USING (public.current_user_role() IN ('admin', 'biomedical'))
    WITH CHECK (public.current_user_role() IN ('admin', 'biomedical'));
