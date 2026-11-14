# Especificação de Arquitetura do Backend (`docs/BACKEND_SPEC.md`) — Plataforma VetLife

## 1. Visão Geral e Princípios Arquiteturais

O Backend da **Plataforma VetLife (`www.vetlifelab.com.br` e `app.vetlifelab.com.br`)** foi projetado como uma API RESTful modular em **Node.js + TypeScript + Express**, compatível tanto com execução dedicada (`backend/src/server.ts`) quanto com **Serverless Functions na Vercel** (`backend/api/index.ts`), atendendo simultaneamente:
- **`https://www.vetlifelab.com.br`**: Site Institucional e Landing Page pública (consulta rápida de protocolo e solicitação de coleta).
- **`https://app.vetlifelab.com.br`**: Sistema e Dashboard Laboratorial (`/painel` para Admin e Biomédico, `/veterinario` para Médicos Veterinários parceiros e `/consulta` para visualização/download de laudos).

Utiliza **Supabase (PostgreSQL)** como camada de persistência primária e um provedor híbrido resiliente (`HybridDataStore` / `InMemorySeededRepository`) pré-populado com os **195+ exames oficiais da Tabela de Preços e Prazos 2026 (`docs/assets/tabela-precos-prazos-2026.pdf`)**.

A arquitetura segue rigorosamente **Clean Code**, **Clean Architecture** (Robert C. Martin) e os **5 Princípios SOLID**:

| Princípio SOLID | Aplicação Concreta no Backend VetLife |
| :--- | :--- |
| **S — Single Responsibility Principle (SRP)** | Cada Caso de Uso (`UseCase`), `Controller`, `Validator` e Serviço de Domínio possui uma única razão para mudar. Ex.: `PricingService` calcula exclusivamente a tabela de preços vigente (RN-04); `ReferenceResolverService` resolve exclusivamente os valores de referência por espécie, sexo e faixa etária em dias (HU-04); `ReportRendererService` interpola tags dinâmicas do laudo (HU-05). |
| **O — Open/Closed Principle (OCP)** | O motor de campos dinâmicos (`ExamInputField` — RN-03) e o renderizador de templates de laudo (`ReportTemplate` — HU-05) são abertos para extensão (novos tipos de exames, parâmetros hematológicos/bioquímicos/microbiológicos e tags dinâmicas) sem exigir modificação na lógica de lançamento de resultados. |
| **L — Liskov Substitution Principle (LSP)** | As implementações concretas de persistência (`SupabaseDataStore` e `InMemorySeededDataStore` orquestradas pelo `HybridDataStore`) respeitam integralmente o contrato `IVetLifeRepository`, podendo substituir-se mutuamente sem alterar o comportamento dos Casos de Uso. |
| **I — Interface Segregation Principle (ISP)** | Os contratos de repositório são segregados por contexto de domínio (`IUserRepository`, `IExamRepository`, `IPriceTableRepository`, `IReferenceRepository`, `IReportTemplateRepository`, `IPatientRepository`, `IVetRepository`, `IOrderRepository`, `ICollectionRequestRepository`), evitando que Casos de Uso dependam de métodos que não utilizam. |
| **D — Dependency Inversion Principle (DIP)** | A camada `application/` (Casos de Uso) depende exclusivamente das abstrações definidas em `domain/repositories/` e `domain/entities/`, nunca do SDK `@supabase/supabase-js` ou de detalhes HTTP do Express. |

---

## 2. Estrutura de Diretórios (`backend/`)

```text
backend/
├── api/
│   └── index.ts                                  # Entrypoint Serverless para a Vercel
├── src/
│   ├── app.ts                                    # Configuração do Express, CORS, Helmet, Rotas e Error Handler
│   ├── server.ts                                 # Entrypoint HTTP local (porta 3001)
│   ├── config/
│   │   └── env.ts                                # Validação e carregamento tipado de variáveis de ambiente
│   ├── domain/
│   │   ├── entities/
│   │   │   └── index.ts                          # Entidades e Value Objects do Domínio VetLife
│   │   ├── errors/
│   │   │   └── AppError.ts                       # Hierarquia de erros de domínio (400, 401, 403, 404, 409)
│   │   ├── repositories/
│   │   │   └── IVetLifeRepository.ts             # Interfaces segregadas (ISP + DIP)
│   │   └── services/
│   │       ├── PricingService.ts                 # Regra RN-04 (cálculo de tabela de preços vigente na data)
│   │       ├── ReferenceResolverService.ts       # Regra HU-04 (cruzamento espécie + sexo + idade em dias)
│   │       └── ReportRendererService.ts          # Regra HU-05 (renderização de tags dinâmicas de laudos)
│   ├── application/
│   │   └── use-cases/
│   │       ├── AuthUseCases.ts                   # Login Interno (Admin/Biomédico) e Login Veterinário (E-mail + CRMV)
│   │       ├── ExamUseCases.ts                   # HU-01, HU-02, RN-01: Catálogo de exames e campos dinâmicos
│   │       ├── PriceTableUseCases.ts             # HU-03, RN-01, RN-04: Tabelas de preço com vigência e reajuste
│   │       ├── ReferenceAndTemplateUseCases.ts   # HU-04, HU-05, RN-01: Valores de referência e modelos de laudo
│   │       ├── OrderAndRoutineUseCases.ts        # HU-06 a HU-09, RN-03, RN-04: Pacientes, Vets, Pedidos, Etiquetas, Laudos
│   │       ├── PublicAndPortalUseCases.ts        # HU-10, HU-11, HU-12, RN-02: Portal Vet, Consulta Tutor e Coleta
│   │       └── DashboardUseCases.ts              # Dashboards Operacional e Financeiro (RN-01)
│   ├── infrastructure/
│   │   ├── database/
│   │   │   ├── supabaseClient.ts                 # Singleton do cliente Supabase (Service Role / Anon)
│   │   │   └── seedData.ts                       # Dados realistas pré-populados de laboratório veterinário
│   │   └── repositories/
│   │       └── HybridVetLifeRepository.ts        # Provedor Supabase + InMemory Fallback com persistência em memória
│   ├── presentation/
│   │   ├── controllers/
│   │   │   └── VetLifeController.ts              # Controllers HTTP enxutos delegando aos Use Cases
│   │   ├── middlewares/
│   │   │   ├── authMiddleware.ts                 # Autenticação JWT e RBAC (requireRole('admin'), requireVet, etc.)
│   │   │   └── errorHandler.ts                   # Tratamento centralizado de erros Zod e AppError
│   │   ├── routes/
│   │   │   └── index.ts                          # Roteador modular `/api/v1`
│   │   └── validators/
│   │       └── schemas.ts                        # Schemas Zod para validação de entrada (body/query/params)
│   └── tests/
│       └── api.spec.ts                           # Suíte de testes de integração cobrindo HUs e RNs
├── .env.example
├── package.json
└── tsconfig.json
```

---

## 3. Entidades de Domínio (`src/domain/entities/index.ts`)

1. **`User`**: Representa operadores internos do laboratório (`id`, `name`, `email`, `password_hash`, `role: 'admin' | 'biomedical'`, `created_at`).
2. **`Exam` (HU-01)**: Exame do catálogo (`id`, `code`, `name`, `section`, `delivery_days`, `tube_type`, `label_qty`, `reference_template_id`, `base_price`, `input_fields`).
3. **`ExamInputField` (HU-02, RN-03)**: Campo dinâmico de lançamento de resultado (`id`, `exam_id`, `field_name`, `field_label`, `field_type: 'text' | 'number' | 'select' | 'textarea'`, `unit`, `options`, `default_value`, `is_required`, `display_order`).
4. **`PriceTable` e `ExamPrice` (HU-03, RN-04)**: Tabela de preços com período de vigência (`id`, `name`, `partner_clinic`, `start_date`, `end_date`, `is_active`, `prices: ExamPrice[]`).
5. **`ExamReference` (HU-04)**: Valores de referência parametrizados por espécie, sexo e faixa etária em dias (`id`, `exam_id`, `parameter_name`, `species`, `gender`, `min_age_days`, `max_age_days`, `min_value`, `max_value`, `unit`, `reference_text_content`).
6. **`ReportTemplate` (HU-05)**: Modelo de laudo com cabeçalho, rodapé, estrutura de corpo e tags dinâmicas (`{{paciente}}`, `{{especie}}`, `{{raca}}`, `{{idade}}`, `{{sexo}}`, `{{tutor}}`, `{{veterinario}}`, `{{crmv}}`, `{{clinica}}`, `{{protocolo}}`, `{{data_pedido}}`, `{{data_liberacao}}`, `{{exame}}`, `{{secao}}`, `{{resultados}}`, `{{referencias}}`, `{{observacoes}}`).
7. **`Patient` (HU-06)**: Animal e dados do tutor (`id`, `name`, `species`, `breed`, `gender`, `birth_date`, `age_days`, `age_label`, `tutor_name`, `tutor_phone`, `tutor_email`).
8. **`Vet` (HU-06, HU-10)**: Médico veterinário parceiro (`id`, `name`, `crmv`, `clinic_name`, `email`, `phone`).
9. **`Order` e `ExamResult` (HU-06 a HU-09, RN-03, RN-04)**: Atendimento laboratorial identificado por `protocol_code` único (`VET-2026-XXXX`), vinculado a paciente, veterinário, tabela de preço aplicada e lista de `ExamResult` contendo `dynamic_content`, `attachments`, `reference_snapshot`, `rendered_report_html`, `pdf_url` e `released_at`.
10. **`CollectionRequest`**: Solicitação de coleta enviada pela Landing Page pública (`id`, `clinic_or_tutor_name`, `phone`, `email`, `address`, `preferred_date`, `notes`, `status`, `created_at`).

---

## 4. Segurança, Autenticação JWT e RBAC (RN-01 e RN-02)

### 4.1 Perfis e Tokens JWT
- **Login Interno (`POST /api/v1/auth/login`)**: Autentica usuários `admin` e `biomedical` e emite JWT assinado com `JWT_SECRET` contendo `{ sub, email, name, role: 'admin' | 'biomedical' }`.
- **Login do Veterinário (`POST /api/v1/auth/vet-login`)**: Autentica médicos veterinários parceiros validando `email` + `crmv` (aceitando formato completo ex: `CRMV-SP 45821` ou numérico `45821`) e emite JWT de escopo `{ sub, email, name, crmv, clinic_name, role: 'vet' }`.
- **Consulta Pública do Tutor (`GET /api/v1/public/protocol/:protocolCode`)**: Respeita **RN-02**, não exigindo senha nem cadastro, expondo exclusivamente o laudo correspondente ao código de protocolo exato informado.

### 4.2 Matriz de Controle de Acesso (RBAC — RN-01)

| Recurso / Endpoint | Público (Tutor/Landing) | Veterinário (`vet`) | Biomédico (`biomedical`) | Admin (`admin`) |
| :--- | :---: | :---: | :---: | :---: |
| `GET /api/v1/public/protocol/:code` | Permitido | Permitido | Permitido | Permitido |
| `POST /api/v1/public/collection-requests` | Permitido | Permitido | Permitido | Permitido |
| `GET /api/v1/vet/orders` | Negado (401) | Permitido (Próprios) | Permitido | Permitido |
| `GET/POST /api/v1/patients`, `/vets`, `/orders` | Negado (401) | Leitura própria | Permitido | Permitido |
| `PUT /api/v1/orders/:id/results/:resId` | Negado (401) | Negado (403) | Permitido | Permitido |
| `POST /api/v1/orders/:id/release` | Negado (401) | Negado (403) | Permitido | Permitido |
| `GET /api/v1/dashboard/operational` | Negado (401) | Negado (403) | Permitido | Permitido |
| `POST/PUT/DELETE /api/v1/exams` e `/fields` | Negado (401) | Negado (403) | **Negado (403 - RN-01)** | **Exclusivo Admin** |
| `POST/PUT/DELETE /api/v1/price-tables` | Negado (401) | Negado (403) | **Negado (403 - RN-01)** | **Exclusivo Admin** |
| `POST/PUT/DELETE /api/v1/exam-references` | Negado (401) | Negado (403) | **Negado (403 - RN-01)** | **Exclusivo Admin** |
| `POST/PUT /api/v1/report-templates` | Negado (401) | Negado (403) | **Negado (403 - RN-01)** | **Exclusivo Admin** |
| `GET /api/v1/dashboard/financial` | Negado (401) | Negado (403) | **Negado (403 - RN-01)** | **Exclusivo Admin** |

---

## 5. Catálogo Completo de Endpoints (`/api/v1`)

### 5.1 Health & Metadata
- `GET /api/v1/health`: Status da API, modo do banco (`supabase` ou `in-memory-seeded`), timestamp e versão.

### 5.2 Autenticação
- `POST /api/v1/auth/login`: Login interno (`email`, `password`).
- `POST /api/v1/auth/vet-login`: Login do portal veterinário (`email`, `crmv`).
- `GET /api/v1/auth/me`: Dados do perfil autenticado via Bearer Token.

### 5.3 Exames e Campos Dinâmicos (HU-01, HU-02, RN-01, RN-03)
- `GET /api/v1/exams`: Lista exames com seus `input_fields` ordenados por `display_order`.
- `GET /api/v1/exams/:id`: Detalhes de um exame e seus campos dinâmicos.
- `POST /api/v1/exams` (`admin`): Cria novo exame no catálogo (com campos dinâmicos opcionais).
- `PUT /api/v1/exams/:id` (`admin`): Atualiza dados cadastrais do exame.
- `DELETE /api/v1/exams/:id` (`admin`): Remove exame do catálogo.
- `GET /api/v1/exams/:id/fields`: Lista os campos dinâmicos configurados para o exame.
- `POST /api/v1/exams/:id/fields` (`admin`): Adiciona um campo de entrada específico ao exame (`text`, `number`, `select`, `textarea`).
- `PUT /api/v1/exams/:id/fields` (`admin`): Substitui/atualiza a lista de campos dinâmicos do exame ou atualiza um campo individual.
- `DELETE /api/v1/exams/:id/fields/:fieldId` (`admin`): Remove um campo dinâmico específico.

### 5.4 Tabelas de Preços com Vigência (HU-03, RN-01, RN-04)
- `GET /api/v1/price-tables`: Lista todas as tabelas de preços com seus itens (`prices`).
- `GET /api/v1/price-tables/active`: Retorna a tabela de preços ativa na data solicitada (`?date=YYYY-MM-DD&partner_clinic=...`) e o mapa de preços vigentes por exame (RN-04).
- `POST /api/v1/price-tables` (`admin`): Cria nova tabela de preços com vigência (`start_date`, `end_date`), preços por exame ou percentual de reajuste sobre a tabela padrão.
- `PUT /api/v1/price-tables/:id` (`admin`): Atualiza vigência, status ativo, preços individuais ou aplica reajuste percentual (`adjustment_percent`).
- `DELETE /api/v1/price-tables/:id` (`admin`): Remove tabela de preço.

### 5.5 Valores de Referência e Modelos de Laudo (HU-04, HU-05, RN-01)
- `GET /api/v1/exam-references`: Lista referências filtráveis por `exam_id`, `species`, `gender`, `age_days`.
- `POST /api/v1/exam-references` (`admin`): Cadastra referência cruzando espécie, sexo e faixa etária inicial/final em dias.
- `PUT /api/v1/exam-references/:id` (`admin`): Atualiza referência existente.
- `DELETE /api/v1/exam-references/:id` (`admin`): Remove referência.
- `GET /api/v1/report-templates`: Lista modelos de laudo e a relação de tags dinâmicas suportadas.
- `POST /api/v1/report-templates` (`admin`): Cria novo modelo de laudo.
- `PUT /api/v1/report-templates/:id` (`admin`): Atualiza cabeçalho, rodapé, corpo e flags do modelo de laudo.

### 5.6 Rotina Laboratorial: Pacientes, Veterinários, Atendimentos e Laudos (HU-06 a HU-09, RN-03, RN-04)
- `GET /api/v1/patients` e `POST /api/v1/patients` e `PUT /api/v1/patients/:id`: Gestão de pacientes e tutores.
- `GET /api/v1/vets` e `POST /api/v1/vets` e `PUT /api/v1/vets/:id`: Gestão de médicos veterinários parceiros.
- `GET /api/v1/orders`: Lista atendimentos com filtros (`status`, `vet_id`, `patient_id`, `search`), incluindo paciente, veterinário e resultados enriquecidos com campos dinâmicos e valores de referência resolvidos automaticamente para a espécie/sexo/idade do animal.
- `GET /api/v1/orders/:id`: Detalhes completos de um atendimento/pedido.
- `POST /api/v1/orders`: Cria atendimento (aceitando `patient_id` existente ou objeto `patient` novo inline), vincula veterinário, calcula o preço de cada exame usando a **tabela de preços vigente na data da solicitação (RN-04)** e gera código de protocolo único (`VET-2026-XXXX`).
- `GET /api/v1/orders/:id/labels`: Gera payload de etiquetas de coleta com código de barras/protocolo, paciente, espécie, tipo de tubo e quantidade de etiquetas por exame (`label_qty`).
- `PUT /api/v1/orders/:orderId/results/:resultId`: Salva o preenchimento dos campos dinâmicos (`dynamic_content` — RN-03) e anexos complementares (`attachments` — HU-08: imagens de ultrassom, PDFs externos), mudando o status do atendimento para `em_analise`.
- `POST /api/v1/orders/:orderId/release`: Finaliza e libera o laudo (HU-09), gerando o snapshot das referências aplicáveis, renderizando o template HTML/PDF com tags dinâmicas e marcando o pedido como `concluido`.

### 5.7 Portais Externos e Dashboards (HU-10, HU-11, HU-12, RN-01, RN-02)
- `GET /api/v1/vet/orders`: Retorna os pedidos vinculados ao médico veterinário autenticado (com filtro por status ou busca textual).
- `GET /api/v1/public/protocol/:protocolCode`: Consulta pública estrita por código de protocolo para o Tutor (RN-02), retornando o laudo formatado, resultados comparados com valores de referência, anexos e HTML pronto para impressão/download em PDF.
- `POST /api/v1/public/collection-requests` e `GET /api/v1/collection-requests`: Solicitação de coleta em domicílio/clínica via Landing Page.
- `GET /api/v1/dashboard/operational` (`admin`, `biomedical`): KPIs do dia, pendentes, em análise, concluídos, exames por seção técnica e fila prioritária.
- `GET /api/v1/dashboard/financial` (Exclusivo `admin` — RN-01): Receita bruta, ticket médio, faturamento por tabela de vigência/convênio, receita por exame e balancete operacional (entradas, custos laboratoriais estimados, resultado líquido e margem).
