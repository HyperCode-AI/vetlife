# Especificação de Arquitetura e Modelagem — Plataforma VetLife (`vetlifelab.com.br`)

## 1. Visão Geral da Arquitetura do Monorepo

A **Plataforma VetLife** é um sistema web responsivo e unificado para gestão laboratorial veterinária, projetado sob **Clean Architecture**, **Princípios SOLID** e **Serverless Deployment** na Vercel com persistência relacional em **PostgreSQL (Supabase)**.

### Estrutura de Diretórios do Repositório Único

```text
VETLIFEAPP/
├── backend/                        # API RESTful em Node.js + TypeScript + Express (Clean Architecture)
│   ├── api/
│   │   └── index.ts                # Entrypoint Serverless para a Vercel (/api/*)
│   ├── src/
│   │   ├── config/                 # Variáveis de ambiente e constantes de sistema
│   │   ├── domain/                 # Entidades, Value Objects, Contratos de Repositório e Erros
│   │   ├── application/            # Casos de Uso (Use Cases) e DTOs de negócio
│   │   ├── infrastructure/         # Supabase Client, Hybrid/InMemory DataStore, Segurança JWT
│   │   ├── presentation/           # Controllers, Rotas (/api/v1), Middlewares RBAC e ErrorHandler
│   │   └── server.ts               # Entrypoint HTTP local (porta 3001)
│   ├── package.json
│   └── tsconfig.json
├── frontend/                       # SPA Responsiva em React 18 + Vite + TypeScript + TailwindCSS
│   ├── src/
│   │   ├── components/             # Componentes visuais reutilizáveis e modais
│   │   ├── pages/                  # Telas (Landing, Portal Tutor, Portal Vet, Painel Admin/Biomédico)
│   │   ├── services/               # Cliente de API (/api/v1) com fallback resiliente
│   │   ├── utils/                  # Gerador de PDF real de Laudos e Etiquetas de Coleta
│   │   └── types/                  # Contratos TypeScript compartilhados
│   ├── package.json
│   └── vite.config.ts
├── supabase/                       # Camada de Dados PostgreSQL e Segurança RLS
│   ├── schema.sql                  # Modelagem DDL completa (12 tabelas, constraints, índices)
│   ├── rls_policies.sql            # Políticas de Row Level Security (RN-01, RN-02)
│   └── seed.sql                    # Dados iniciais ricos para homologação e testes imediatos
├── docs/                           # Documentação Técnica de Arquitetura, Backend e Frontend
│   ├── ARCHITECTURE_SPEC.md
│   ├── BACKEND_SPEC.md
│   └── FRONTEND_SPEC.md
├── SPEC.MD                         # Especificação funcional original do produto
├── vercel.json                     # Configuração de roteamento unificado Frontend + Serverless API
├── package.json                    # Scripts orquestradores do monorepo
├── .env.example                    # Template de variáveis de ambiente
└── README.md                       # Guia de instalação, arquitetura e deploy
```

---

## 2. Segurança, Autenticação e Controle de Acesso (RBAC)

A arquitetura de segurança implementa três fluxos de acesso independentes, garantindo estrita conformidade com **RN-01** e **RN-02**:

### 2.1. Fluxo 1: Painel Interno (`admin` e `biomedical` — RN-01)
- **Endpoint**: `POST /api/v1/auth/login`
- **Credenciais**: `email` e `password`.
- **Token**: JWT assinado com `JWT_SECRET` contendo `{ sub: user.id, email: user.email, name: user.name, role: 'admin' | 'biomedical' }`.
- **Regras RBAC (RN-01)**:
  - `admin`: Acesso total a todas as rotas operacionais, financeiras (`/api/v1/dashboard/financial`) e de configuração (`/api/v1/exams`, `/api/v1/price-tables`, `/api/v1/exam-references`, `/api/v1/report-templates`).
  - `biomedical`: Acesso às rotas operacionais (`/api/v1/dashboard/operational`, `/api/v1/patients`, `/api/v1/vets`, `/api/v1/orders`, lançamento de resultados, anexos e liberação de laudos), além de leitura (`GET`) de exames, referências, templates e preços vigentes. **Bloqueado (`403 Forbidden`)** em qualquer mutação de configurações ou acesso ao dashboard financeiro.

### 2.2. Fluxo 2: Portal do Médico Veterinário (`vet` — HU-10, HU-11)
- **Endpoint**: `POST /api/v1/auth/vet-login`
- **Credenciais**: `email` + `crmv` (ex: `carlos.silva@clinicapetcare.com.br` + `CRMV-SP 45890`).
- **Token**: JWT assinado com `{ sub: vet.id, email: vet.email, crmv: vet.crmv, name: vet.name, clinic_name: vet.clinic_name, role: 'vet' }`.
- **Escopo**: Permite consultar exclusivamente os atendimentos vinculados ao próprio `vet_id` (`GET /api/v1/vet/orders`) e baixar os laudos liberados.

### 2.3. Fluxo 3: Portal Público do Tutor (`protocol_code` sem senha — HU-12, RN-02)
- **Endpoint**: `GET /api/v1/public/protocol/:protocolCode`
- **Acesso**: Rota pública sem necessidade de cadastro ou senha, validada estritamente pelo código único de protocolo (ex: `VET-2026-0001`). Não permite listagem geral de pedidos nem exposição de outros pacientes.

---

## 3. Credenciais e Protocolos Padrão (Seed / Demo)

Para garantir alinhamento entre `@arquitetura`, `@backend` e `@frontend`:

| Perfil | Identificador / E-mail | Senha / CRMV / Protocolo | Nome / Descrição |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@vetlifelab.com.br` | `admin123` *(ou `Admin@2026` / `VetLife@2026`)* | Dr. Ricardo Mendes (Diretor Técnico) |
| **Biomédico** | `biomedico@vetlifelab.com.br` | `biomed123` *(ou `bio123` / `Bio@2026`)* | Dra. Camila Torres (CRBM-1 14502) |
| **Veterinário 1** | `carlos.mendes@clinicapetcare.com.br` | `CRMV-SP 45821` | Dr. Carlos Eduardo Mendes (Clínica PetCare) |
| **Veterinário 2** | `dr.carlos@clinicapet.com.br` | `CRMV-SP 12345` | Dr. Carlos Eduardo Silva (Clínica PetCare Jardins) |
| **Veterinário 3** | `fernanda.lima@hospitalvetvida.com.br` | `CRMV-SP 38910` | Dra. Fernanda Costa Lima (Hospital VetVida) |
| **Veterinário 4** | `dra.marina@vetcare.com.br` | `CRMV-SP 54321` | Dra. Marina Oliveira (Hospital VetCare 24h) |
| **Tutor (Protocolo 1)** | `VET-2026-0001` | *(Sem senha - RN-02)* | Paciente **Thor** (Canino, Golden Retriever) — Status: `concluido` |
| **Tutor (Protocolo 2)** | `VET-2026-0002` | *(Sem senha - RN-02)* | Paciente **Luna** (Felino, Siamês) — Status: `concluido` |
| **Tutor (Protocolo 3)** | `VET-2026-0003` | *(Sem senha - RN-02)* | Paciente **Max** (Canino, Bulldog Francês) — Status: `em_analise` |
| **Tutor (Protocolo 4)** | `VET-2026-0004` | *(Sem senha - RN-02)* | Paciente **Mel** (Canino, Shih Tzu) — Status: `pendente` |

---

## 4. Contrato Padronizado da API REST (`/api/v1`)

Todas as respostas seguem envelope JSON consistente ou retornam os dados tipados diretamente com suporte no cliente HTTP. O padrão recomendado de resposta é:
- Sucesso: `200 OK` / `201 Created` com `{ success: true, data: ... }` (ou acesso direto compatível).
- Erro: `400 / 401 / 403 / 404 / 500` com `{ success: false, error: { code: string, message: string, details?: any } }`.

### 4.1. Healthcheck
- `GET /api/v1/health` -> `{ status: "ok", service: "vetlife-api", timestamp: "..." }`

### 4.2. Autenticação (`/api/v1/auth`)
- `POST /api/v1/auth/login`
  - **Request**: `{ "email": "admin@vetlifelab.com.br", "password": "Admin@2026" }`
  - **Response**: `{ "token": "jwt...", "user": { "id": "...", "name": "...", "email": "...", "role": "admin" } }`
- `POST /api/v1/auth/vet-login`
  - **Request**: `{ "email": "carlos.silva@clinicapetcare.com.br", "crmv": "CRMV-SP 45890" }`
  - **Response**: `{ "token": "jwt...", "vet": { "id": "...", "name": "...", "crmv": "CRMV-SP 45890", "clinic_name": "...", "email": "...", "phone": "..." } }`
- `GET /api/v1/auth/me` -> Retorna o perfil autenticado pelo token Bearer.

### 4.3. Catálogo de Exames e Campos Dinâmicos (`/api/v1/exams` — HU-01, HU-02, RN-01, RN-03)
- `GET /api/v1/exams` (Autenticado: `admin`, `biomedical`, ou público/vet para catálogo)
  - Retorna lista oficial de 195 exames da **Tabela de Preços e Prazos 2026** com `delivery_days`, `delivery_time_label`, `price` (preço vigente na "Tabela 2026") e seus `input_fields` (`exam_input_fields`) ordenados por `display_order`.
- `POST /api/v1/exams` (Exclusivo `admin` — RN-01)
  - **Payload**: `{ "code": "057", "name": "HEMOGRAMA COMPLETO", "section": "Hematologia", "delivery_days": 1, "delivery_time_label": "1 dia útil", "price": 34.00, "tube_type": "Sangue em tubo de tampa roxo com EDTA", "label_qty": 1, "reference_template_id": "uuid-opcional" }`
- `PUT /api/v1/exams/:id` (Exclusivo `admin` — RN-01)
- `DELETE /api/v1/exams/:id` (Exclusivo `admin` — RN-01)
- `GET /api/v1/exams/:id/fields` (Autenticado `admin` / `biomedical`)
- `POST /api/v1/exams/:id/fields` (Exclusivo `admin` — RN-01)
  - **Payload**: `{ "field_name": "eritrocitos", "field_label": "Eritrócitos", "field_type": "number", "unit": "milhões/µL", "options": [], "is_required": true, "display_order": 1 }`
- `PUT /api/v1/exams/:id/fields` (Exclusivo `admin` — substitui ou atualiza lista/item de campos do exame)

### 4.4. Tabelas de Preços com Vigência (`/api/v1/price-tables` — HU-03, RN-01, RN-04)
- `GET /api/v1/price-tables` (Autenticado `admin` / `biomedical`)
  - Retorna todas as tabelas de preços com a lista `prices: [{ exam_id, exam_code, exam_name, price }]`.
- `GET /api/v1/price-tables/active?date=YYYY-MM-DD&partner_clinic=...` (Autenticado `admin` / `biomedical`)
  - Resolve e retorna automaticamente a tabela de preços ativa cuja vigência (`start_date <= date <= end_date` e `is_active = true`) cobre a data da solicitação (RN-04), juntamente com o mapa de preços por exame.
- `POST /api/v1/price-tables` (Exclusivo `admin` — RN-01)
  - **Payload**: `{ "name": "Tabela Particular 2026", "partner_clinic": null, "start_date": "2026-01-01", "end_date": "2026-12-31", "is_active": true, "prices": [{ "exam_id": "...", "price": 65.00 }] }`
- `PUT /api/v1/price-tables/:id` (Exclusivo `admin` — RN-01, suporta atualização de preços ou reajuste percentual)

### 4.5. Valores de Referência e Modelos de Laudos (`/api/v1/exam-references` & `/api/v1/report-templates` — HU-04, HU-05, RN-01)
- `GET /api/v1/exam-references?exam_id=...&species=...&gender=...&age_days=...`
  - Lista todas as referências ou filtra automaticamente cruzando espécie (`Canino`, `Felino`, `Silvestre`, `Equino`), sexo (`M`, `F`, `Ambos`) e faixa etária em dias (`min_age_days <= age_days <= max_age_days`).
- `POST /api/v1/exam-references` (Exclusivo `admin` — RN-01)
  - **Payload**: `{ "exam_id": "...", "species": "Canino", "gender": "Ambos", "min_age_days": 180, "max_age_days": 2920, "reference_text_content": "Eritrócitos: 5.5 - 8.5 milhões/µL | Hemoglobina: 12 - 18 g/dL | Leucócitos: 6.000 - 17.000 /µL | Plaquetas: 200.000 - 500.000 /µL", "min_value": 5.5, "max_value": 8.5, "unit": "milhões/µL" }`
- `PUT /api/v1/exam-references/:id` (Exclusivo `admin` — RN-01)
- `DELETE /api/v1/exam-references/:id` (Exclusivo `admin` — RN-01)
- `GET /api/v1/report-templates` (Autenticado `admin` / `biomedical`)
- `POST /api/v1/report-templates` (Exclusivo `admin` — RN-01)
- `PUT /api/v1/report-templates/:id` (Exclusivo `admin` — RN-01)

### 4.6. Pacientes, Veterinários e Atendimentos / Laudos (`/api/v1/patients`, `/api/v1/vets`, `/api/v1/orders` — HU-06 a HU-09)
- `GET /api/v1/patients` | `POST /api/v1/patients`
- `GET /api/v1/vets` | `POST /api/v1/vets`
- `GET /api/v1/orders` (Lista pedidos com dados aninhados de `patient`, `vet`, `price_table` e `results` contendo os exames, campos dinâmicos e referências aplicáveis).
- `POST /api/v1/orders` (Cria atendimento, calcula automaticamente o preço de cada exame pela tabela de vigência ativa na data conforme RN-04, gera `protocol_code` único `VET-2026-XXXX` e inicializa `exam_results`).
  - **Payload**: `{ "patient_id": "...", " patient": { ...opcional para criar inline... }, "vet_id": "...", "exam_ids": ["..."], "price_table_id": "...opcional...", "notes": "..." }`
- `GET /api/v1/orders/:id/labels` (Gera os dados de impressão de etiquetas de coleta com código de barras/protocolo, paciente, espécie, tipo de tubo e quantidade de etiquetas por exame).
- `PUT /api/v1/orders/:orderId/results/:resultId` (Lançamento de resultados nos campos dinâmicos `dynamic_content`, `reference_snapshot` e `attachments` pelo Biomédico/Admin — HU-07, HU-08, RN-03).
- `POST /api/v1/orders/:orderId/release` (Finaliza e libera o laudo para consulta do Veterinário e do Tutor, registrando `released_at`, `released_by`, `pdf_url` e mudando status do pedido para `concluido` — HU-09).

### 4.7. Portal do Veterinário (`/api/v1/vet` — HU-10, HU-11)
- `GET /api/v1/vet/orders` (Autenticado com JWT `role: 'vet'`, ou query `vet_id` para admin; retorna todos os pedidos solicitados pelo veterinário com resultados e dados para download do PDF).

### 4.8. Portal Público do Tutor e Coleta (`/api/v1/public` — HU-12, RN-02)
- `GET /api/v1/public/protocol/:protocolCode`
  - Retorna o atendimento correspondente ao `protocol_code` (`VET-2026-0001`), incluindo paciente, veterinário, template de laudo, resultados dinâmicos lançados, anexos e valores de referência cruzados por espécie/idade/sexo.
- `POST /api/v1/public/collection-requests`
  - **Payload**: `{ "clinic_or_tutor_name": "...", "phone": "...", "email": "...", "address": "...", "notes": "..." }`

### 4.9. Dashboards (`/api/v1/dashboard`)
- `GET /api/v1/dashboard/operational` (Admin e Biomédico): Total de exames do dia, pendentes, em análise, concluídos, fila recente e distribuição por seção técnica.
- `GET /api/v1/dashboard/financial` (Exclusivo `admin` — RN-01): Receita total, ticket médio, faturamento por tabela de vigência/convênio, exames mais rentáveis e balancete operacional (receitas, custos laboratoriais estimados e margem líquida).

---

## 5. Gestão de Variáveis de Ambiente e Deploy Serverless na Vercel

### 5.1. Ambientes (Development, Preview, Production)
- **Development (`localhost`)**:
  - Frontend Vite roda em `http://localhost:5173` com proxy reverso de `/api` para `http://localhost:3001`.
  - Backend Express roda em `http://localhost:3001`. Se `SUPABASE_URL` não estiver definido, o `HybridDataStore` ativa automaticamente o repositório em memória pré-populado com os mesmos dados do `supabase/seed.sql`.
- **Preview & Production (Vercel — `www.vetlifelab.com.br` e `app.vetlifelab.com.br` — RN-05)**:
  - **`www.vetlifelab.com.br`**: Site Institucional público (Landing Page).
  - **`app.vetlifelab.com.br`**: Dashboard e Sistema Laboratorial (`/painel`, `/veterinario`, `/consulta`).
  - O arquivo `vercel.json` na raiz compila o frontend (`frontend/dist`) como conteúdo estático + SPA fallback, configura headers CORS multi-domínio e roteia todas as chamadas `/api/(.*)` para a Serverless Function `backend/api/index.ts`.
  - Variáveis configuradas no painel da Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `CORS_ORIGIN=https://vetlifelab.com.br,https://www.vetlifelab.com.br,https://app.vetlifelab.com.br`, `VITE_API_URL=/api/v1`, `VITE_PUBLIC_SITE_URL=https://www.vetlifelab.com.br`, `VITE_SYSTEM_APP_URL=https://app.vetlifelab.com.br`. Veja detalhes de DNS (Registro.br) em [`docs/DEPLOY.md`](./DEPLOY.md).
