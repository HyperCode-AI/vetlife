-- Limpeza de dados fictícios/teste no banco VetLife (Supabase)
-- Mantém:
--   * 1 usuário admin (admin@vetlifelab.com.br)
--   * Catálogo oficial de exames (exams: 195), tabelas e preços (price_tables: 1, exam_prices: 195)
--   * Campos dinâmicos (exam_input_fields: 25), referências (exam_references: 8) e modelos de laudo (report_templates: 2)
-- Remove:
--   * Resultados, atendimentos, solicitações de coleta, pacientes, veterinários e usuários biomédicos de teste.

BEGIN;

DELETE FROM public.exam_results;
DELETE FROM public.orders;
DELETE FROM public.collection_requests;
DELETE FROM public.patients;
DELETE FROM public.vets;
DELETE FROM public.users
WHERE email <> 'admin@vetlifelab.com.br'
   OR role <> 'admin';

COMMIT;
