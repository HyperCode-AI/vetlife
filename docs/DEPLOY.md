# Guia de Deploy e Configuração Multi-Domínio — Plataforma VetLife

## 1. Arquitetura de Domínios (`vetlifelab.com.br` — RN-05)

A Plataforma VetLife opera sob o domínio oficial **`vetlifelab.com.br`** (gerenciado via **Registro.br**), com separação clara entre o site institucional público e a aplicação/sistema laboratorial:

| Domínio / Subdomínio | Papel na Arquitetura | Rotas Atendidas |
| :--- | :--- | :--- |
| **`www.vetlifelab.com.br`** *(e raiz `vetlifelab.com.br`)* | **Site Institucional Público (Landing Page)** | `/` (Apresentação institucional, busca rápida de resultados por protocolo, solicitação de coleta, guia de coleta, serviços e contato) |
| **`app.vetlifelab.com.br`** | **Sistema Laboratorial, Portal do Veterinário e Portal do Tutor** | `/painel` (Admin e Biomédico — RN-01), `/veterinario` (Portal do Médico Veterinário — HU-10/HU-11), `/consulta` (Consulta de Laudos por Protocolo — RN-02) e `/api/v1/*` |

---

## 2. Configuração de DNS no Registro.br

No painel do **Registro.br** para o domínio `vetlifelab.com.br`, configure as seguintes entradas DNS apontando para o projeto na Vercel:

| Tipo | Nome / Host | Valor / Destino | Finalidade |
| :--- | :--- | :--- | :--- |
| **A** | `@` *(vazio)* | `76.76.21.21` | Domínio raiz (`vetlifelab.com.br` -> redireciona para `www.vetlifelab.com.br`) |
| **CNAME** | `www` | `cname.vercel-dns.com.` | Site Institucional (`https://www.vetlifelab.com.br`) |
| **CNAME** | `app` | `cname.vercel-dns.com.` | Aplicação / Dashboard (`https://app.vetlifelab.com.br`) |

---

## 3. Configuração do Projeto na Vercel

1. Conecte o repositório único `VETLIFEAPP` na **Vercel**.
2. O arquivo [`vercel.json`](../vercel.json) na raiz já configura automaticamente:
   - **Build do Frontend**: `npm run build --prefix frontend` -> `frontend/dist`
   - **Serverless API**: Redirecionamento de `/api/(.*)` para `backend/api/index.ts`
   - **CORS Headers**: Habilitados para `https://www.vetlifelab.com.br`, `https://app.vetlifelab.com.br` e `https://vetlifelab.com.br`.
3. Em **Project Settings > Domains**, adicione:
   - `www.vetlifelab.com.br` (e `vetlifelab.com.br` com redirect 308 para `www.vetlifelab.com.br`)
   - `app.vetlifelab.com.br`
4. Em **Project Settings > Environment Variables**, defina:
   ```env
   NODE_ENV=production
   CORS_ORIGIN=https://vetlifelab.com.br,https://www.vetlifelab.com.br,https://app.vetlifelab.com.br
   JWT_SECRET=<sua-chave-secreta-forte>
   SUPABASE_URL=https://<seu-projeto>.supabase.co
   SUPABASE_ANON_KEY=<sua-anon-key>
   SUPABASE_SERVICE_ROLE_KEY=<sua-service-role-key>
   VITE_API_URL=/api/v1
   VITE_PUBLIC_SITE_URL=https://www.vetlifelab.com.br
   VITE_SYSTEM_APP_URL=https://app.vetlifelab.com.br
   ```
