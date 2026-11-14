# 🐾 Plataforma VetLife (`vetlifelab.com.br`)

Sistema web completo de **Gestão Laboratorial Veterinária (LIMS)**, **Portal do Médico Veterinário** e **Portal Público do Tutor para Consulta de Laudos por Protocolo**, desenvolvido em arquitetura monorepo com **Node.js + TypeScript + Express (Clean Architecture & SOLID)**, **React 18 + Vite + TailwindCSS** e **PostgreSQL / Supabase**.

---

## 📋 Sumário Arquitetural e Documentação

Toda a especificação técnica e funcional está organizada na pasta [`docs/`](./docs):

- 📐 **[Especificação de Arquitetura e Modelagem (`docs/ARCHITECTURE_SPEC.md`)](./docs/ARCHITECTURE_SPEC.md)**: Estrutura do monorepo, segurança JWT + RBAC, contrato padronizado da API REST (`/api/v1`) e deploy Serverless na Vercel.
- ⚙️ **[Especificação do Backend (`docs/BACKEND_SPEC.md`)](./docs/BACKEND_SPEC.md)**: Clean Architecture, princípios SOLID, Casos de Uso, Entidades de Domínio e `HybridDataStore` (Supabase + Fallback In-Memory pré-populado).
- 💻 **[Especificação do Frontend (`docs/FRONTEND_SPEC.md`)](./docs/FRONTEND_SPEC.md)**: Design System VetLife, fluxos por ator, geração real de laudos em PDF e impressão de etiquetas de coleta.
- 🗄️ **[Modelagem SQL e Segurança (`supabase/`)](./supabase)**:
  - [`supabase/schema.sql`](./supabase/schema.sql): DDL completo com as 12 tabelas, chaves estrangeiras, constraints e índices de performance.
  - [`supabase/rls_policies.sql`](./supabase/rls_policies.sql): Políticas de Row Level Security (RLS) garantindo **RN-01** e **RN-02**.
  - [`supabase/seed.sql`](./supabase/seed.sql): Dados iniciais ricos para homologação imediata.

---

## 👥 Atores, Histórias de Usuário e Regras de Negócio Atendidas

1. **Administrador (`admin` — HU-01 a HU-05, RN-01, RN-04)**:
   - Acesso total ao painel interno, incluindo **Configurações** (Catálogo de Exames, Campos Dinâmicos de Lançamento por Exame, Tabelas de Preços com Vigência e Reajuste, Valores de Referência por Espécie/Sexo/Idade em dias e Modelos de Laudos com Tags Dinâmicas) e **Dashboard Financeiro**.
2. **Biomédico / Técnico (`biomedical` — HU-06 a HU-09, RN-01, RN-03)**:
   - Acesso ao **Dashboard Operacional**, **Atendimentos/Rotina** (cadastro de pacientes/tutores, vínculo com veterinário, cálculo automático de preços pela vigência ativa conforme **RN-04** e geração de etiquetas de coleta) e **Lançamento de Laudos** (preenchimento dos inputs dinâmicos **RN-03**, cruzamento automático de referências, anexos complementares e liberação de PDF).
   - Estritamente bloqueado nas telas e rotas de Configurações e Financeiro (**RN-01**).
3. **Médico Veterinário Parceiro (`vet` — HU-10, HU-11)**:
   - Login exclusivo via **E-mail + CRMV** para acompanhamento do status dos exames solicitados e download rápido de laudos em PDF.
4. **Tutor / Cliente (Público — HU-12, RN-02)**:
   - Consulta direta na Landing Page (`vetlifelab.com.br`) ou em `/consulta` informando apenas o **Código de Protocolo** (ex: `VET-2026-0001`), sem necessidade de cadastro ou senha (**RN-02**), com visualização e download do laudo em PDF.

---

## 🔑 Credenciais e Protocolos de Demonstração (Out-of-the-Box)

| Perfil | E-mail / Identificador | Senha / CRMV | Observação |
| :--- | :--- | :--- | :--- |
| **Administrador** | `admin@vetlifelab.com.br` | `admin123` *(ou `Admin@2026`)* | Acesso completo (Operacional + Configurações + Financeiro — RN-01) |
| **Biomédico** | `biomedico@vetlifelab.com.br` | `biomed123` *(ou `bio123` / `Bio@2026`)* | Acesso Operacional, Rotina e Lançamento de Laudos (RN-01) |
| **Veterinário 1** | `carlos.mendes@clinicapetcare.com.br` | `CRMV-SP 45821` | Dr. Carlos Eduardo Mendes (Clínica PetCare) |
| **Veterinário 2** | `dr.carlos@clinicapet.com.br` | `CRMV-SP 12345` | Dr. Carlos Eduardo Silva (Clínica PetCare Jardins) |
| **Veterinário 3** | `fernanda.lima@hospitalvetvida.com.br` | `CRMV-SP 38910` | Dra. Fernanda Costa Lima (Hospital VetVida) |
| **Protocolo Tutor 1** | `VET-2026-0001` | *(Sem senha — RN-02)* | **Concluído** — Paciente: *Thor* (Canino, Golden Retriever) — Hemograma + Bioquímico |
| **Protocolo Tutor 2** | `VET-2026-0002` | *(Sem senha — RN-02)* | **Concluído** — Paciente: *Luna* (Felino, Siamês) — Hemograma + Coproparasitológico |
| **Protocolo Tutor 3** | `VET-2026-0003` | *(Sem senha — RN-02)* | **Em Análise** — Paciente: *Max* (Canino, Bulldog Francês) — Urocultura + Hemograma |
| **Protocolo Tutor 4** | `VET-2026-0004` | *(Sem senha — RN-02)* | **Pendente** — Paciente: *Mel* (Canino, Shih Tzu) — Perfil Bioquímico |

---

## 🚀 Como Executar Localmente

### 1. Instalar Dependências
Na raiz do repositório:
```bash
npm run install:all
```

### 2. Configurar Variáveis de Ambiente (Opcional para Demo Local)
Copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```
> **Nota**: Caso você não configure um banco Supabase externo inicialmente, o backend inicia automaticamente com o `HybridDataStore` pré-populado em memória contendo todos os dados do `supabase/seed.sql`.

### 3. Iniciar Backend e Frontend
Em dois terminais (ou separadamente):
```bash
# Terminal 1 — API Backend na porta 3001
npm run dev:backend

# Terminal 2 — Aplicação Frontend Vite na porta 5173
npm run dev:frontend
```

---

## 🗄️ Configuração do Banco de Dados no Supabase

1. Crie um novo projeto no [Supabase](https://supabase.com).
2. No **SQL Editor** do Supabase, execute os scripts na seguinte ordem:
   - `supabase/schema.sql` (cria as 12 tabelas, relacionamentos, constraints e índices).
   - `supabase/rls_policies.sql` (ativa o Row Level Security garantindo RN-01 e RN-02).
   - `supabase/seed.sql` (popula o catálogo de exames, campos dinâmicos, tabelas de preços com vigência, referências e pedidos `VET-2026-0001` a `VET-2026-0004`).
3. Copie `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` para as variáveis de ambiente do seu projeto.

---

## ☁️ Deploy Unificado na Vercel (`vetlifelab.com.br` — RN-05)

O repositório já possui o arquivo [`vercel.json`](./vercel.json) configurado na raiz para deploy contínuo:
1. Importe o repositório na **Vercel**.
2. Configure as variáveis de ambiente listadas em [`.env.example`](./.env.example).
3. A Vercel fará o build do frontend (`frontend/dist`) e disponibilizará o backend Express como Serverless Function em `/api/*`.
4. Aponte o domínio **`vetlifelab.com.br`** (gerenciado via Registro.br conforme **RN-05**) para os servidores DNS/CNAME da Vercel.
