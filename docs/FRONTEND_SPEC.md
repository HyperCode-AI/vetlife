# Especificação Técnica de Frontend — Plataforma VetLife (`vetlifelab.com.br`)

## 1. Visão Geral e Arquitetura Frontend

O Frontend da **Plataforma VetLife** é uma Single Page Application (SPA) moderna, responsiva e orientada a domínio laboratorial veterinário, construída com **React 18**, **TypeScript**, **Vite**, **TailwindCSS** e **Lucide React**.

A arquitetura foi projetada para atender os 4 atores do ecossistema (`Administrador`, `Biomédico / Técnico`, `Médico Veterinário` e `Tutor / Cliente`) com:
- **Separação estrita de acesso por perfil (RBAC visual e funcional — RN-01)**.
- **Renderização dinâmica de formulários laboratoriais (RN-03)** baseada nos metadados de `exam_input_fields` (`text`, `number`, `select`, `textarea`).
- **Cruzamento automático de Valores de Referência (HU-04)** por espécie, sexo e faixa etária do paciente em dias/meses.
- **Cálculo automático de preços por Tabela de Vigência ativa na data do atendimento (RN-04)**.
- **Motor real de geração de Laudos em PDF e Impressão de Etiquetas de Coleta com Código de Barras** (`frontend/src/utils/pdfGenerator.ts`).
- **Camada de Serviço Resiliente (`frontend/src/services/api.ts`)** integrada à API REST `/api/v1/...` do Backend Node.js/Supabase, com normalização de contratos JSON e *Stateful Fallback Store* sincronizado em `localStorage` para operação contínua mesmo em ambientes de preview estático.

---

## 2. Design System VetLife (`DESIGN.md` + Paleta Oficial do Logotipo)

### 2.1 Arquitetura `DESIGN.md` com Cores Oficiais do Logotipo VetLife
A página inicial e os portais seguem a arquitetura escultural de vitrine em névoa matinal (`DESIGN.md`: *gallery vitrine in morning fog*, superfícies planas `#f5f5f7` → `#ffffff` com raio `28px`, pílulas `980px`, tipografia `SF Pro Display` / `SF Pro Text` com *tracking* negativo e ritmo de seções de `120px`), aplicando exclusivamente a paleta cromática extraída do logotipo oficial VetLife (`/images/vetlife-logo.jpg`):
- **Azul-Marinho Profundo do Logo (`#0b2240` — `--color-apple-ink` / `vetlife-navy`)**:
  - Cor principal de tipografia display, contornos estruturais (`Ghost Button`), barra de navegação global translúcida (`bg-[#0b2240]/92 backdrop-blur-md`) e ícones principais.
- **Verde-Água / Teal Clínico do Logo (`#1d9496` — `--color-electric-blue` / `vetlife-teal`)**:
  - Extraído do subtítulo *"Veterinárias"* e do arco interno do coração no logotipo oficial; reservado para botões primários de conversão em formato de pílula (`980px`) e destaques de ação.
- **Teal Floresta da Pata (`#147a7c` / `#11615c` — `--color-link-blue`)**:
  - Extraído da patinha sobre a letra *"i"* no logotipo; aplicado em links textuais inline (`Inline Text Link` com seta `ChevronRight`).
- **Superfícies `DESIGN.md`**:
  - **Fog Canvas (`#f5f5f7`)**: Fundo principal de página e *chips* de metadados (`999px`).
  - **Pure White (`#ffffff`)**: Cartões e vitrines elevados de `28px` de raio sem sombras decorativas.

### 2.2 Separação de Domínios (`www.vetlifelab.com.br` vs `app.vetlifelab.com.br`)
- **`www.vetlifelab.com.br` (Site Institucional / Landing Page)**:
  - Hospeda a apresentação institucional do laboratório, vitrine da marca, busca rápida de protocolo, seções de Sobre, Serviços, Guia de Coleta, Requisição & Solicitação de Coleta e Contato (`frontend/src/config/domains.ts`).
- **`app.vetlifelab.com.br` (Dashboard & Sistema Laboratorial)**:
  - Subdomínio dedicado exclusivamente à operação do sistema: **Painel Laboratorial Interno** (`/painel` — Admin e Biomédico), **Portal do Médico Veterinário** (`/veterinario`) e **Consulta de Laudos** (`/consulta`).
  - Em produção (`*.vetlifelab.com.br`), os botões de acesso ao sistema a partir de `www.vetlifelab.com.br` redirecionam automaticamente para `https://app.vetlifelab.com.br`, enquanto em ambiente local/preview permitem alternância fluida via rota/query (`?domain=app`).

### 2.2 Tipografia e Densidade Visual
- **Fonte Principal**: `Inter`, `system-ui`, `-apple-system`, sans-serif — alta legibilidade para tabelas densas de parâmetros hematológicos e bioquímicos.
- **Fonte Monoespaçada**: `JetBrains Mono` / `monospace` para códigos de protocolo (`VET-2026-0001`), CRMV, códigos de exame (`HEMO-01`) e códigos de barras de etiquetas de tubos.
- **Responsividade (100% Web Responsivo)**:
  - **Mobile (< 768px)**: Navegação adaptativa, cards empilháveis para consulta rápida de laudos pelo Tutor e pelo Veterinário em plantão.
  - **Desktop (>= 1024px)**: Layout *split-pane* na tela de Lançamento de Laudos (formulário dinâmico à esquerda + preview ao vivo do laudo formatado à direita).

---

## 3. Estrutura de Diretórios (`frontend/`)

```text
frontend/
├── index.html                  # Documento raiz com metadados SEO de vetlifelab.com.br
├── package.json                # Dependências React 18, TypeScript, Vite, Tailwind, Lucide
├── tsconfig.json               # Configuração TypeScript estrita
├── vite.config.ts              # Configuração Vite com proxy /api -> http://localhost:3001
├── tailwind.config.js          # Tema customizado VetLife (emerald/teal/slate)
├── postcss.config.js           # Processamento CSS
├── .env.example                # Variáveis VITE_API_URL e VITE_APP_DOMAIN
└── src/
    ├── main.tsx                # Ponto de entrada React 18
    ├── App.tsx                 # Roteador de visões, barra global de navegação e contexto
    ├── index.css               # Estilos globais Tailwind + regras @media print para PDF
    ├── types/
    │   └── index.ts            # Contratos TypeScript espelhados com o Banco e API REST
    ├── services/
    │   ├── mockData.ts         # Dados semente ricos (exames, campos dinâmicos, tabelas, pedidos)
    │   └── api.ts              # Cliente HTTP (/api/v1/...) com fallback híbrido resiliente
    ├── utils/
    │   └── pdfGenerator.ts     # Gerador real de PDF (Laudo Veterinário + Etiquetas de Tubo)
    └── pages/
        ├── LandingPage.tsx     # Site público vetlifelab.com.br + Coleta + Busca Rápida
        ├── TutorPortal.tsx     # Portal público do Tutor por protocol_code (RN-02, HU-12)
        ├── VetPortal.tsx       # Portal do Veterinário por E-mail + CRMV (HU-10, HU-11)
        └── InternalPanel.tsx   # Painel Admin e Biomédico com 5 módulos e RBAC (RN-01)
```

---

## 4. Mapeamento Completo: Histórias de Usuário (HU-01 a HU-12) e Regras de Negócio (RN-01 a RN-05)

### 4.1 Regras de Negócio Implementadas no Frontend

| Regra | Descrição na `SPEC.MD` | Implementação no Frontend |
| :--- | :--- | :--- |
| **RN-01** | Acesso à tela de configurações (exames, campos, tabelas de preço e modelos) e financeiro restrito exclusivamente ao perfil `admin`. | No `InternalPanel.tsx`, usuários com `role === 'biomedical'` visualizam apenas **Dashboard Operacional**, **Atendimentos / Rotina** e **Lançamento de Laudos**. As abas **Configurações** e **Dashboard Financeiro** ficam bloqueadas tanto na navegação quanto por *guard* de renderização e token JWT na API. |
| **RN-02** | O tutor não realiza cadastro ou senha; autenticação estritamente via `protocol_code`. | Em `LandingPage.tsx` e `TutorPortal.tsx`, a busca consome `GET /api/v1/public/protocol/:protocolCode` sem exigir login, exibindo o laudo completo e botão de download de PDF. |
| **RN-03** | Durante o lançamento pelo biomédico, renderizar dinamicamente os campos específicos configurados para aquele exame. | Na aba **Lançamento de Laudos** (`InternalPanel.tsx`), o componente lê `exam_input_fields` do exame selecionado e constrói controles `number` (com unidade), `text`, `select` (lendo opções JSON) e `textarea` em tempo real. |
| **RN-04** | Cálculo do valor do exame em um atendimento deve respeitar a tabela de preços ativa com base na data da solicitação (vigência). | Na aba **Atendimentos / Rotina**, ao selecionar a data da solicitação e a tabela/convênio vigente (`start_date <= requestDate <= end_date` e `is_active`), o preço de cada exame é resolvido automaticamente a partir de `exam_prices`. |
| **RN-05** | O domínio oficial da plataforma é `vetlifelab.com.br`, registrado via Registro.br. | Identidade institucional, cabeçalhos, rodapés, gerador de laudos PDF, QR Code de validação e variáveis de ambiente referenciam oficialmente `https://vetlifelab.com.br`. |

### 4.2 Mapeamento das Histórias de Usuário (HU-01 a HU-12)

- **HU-01 (Admin — Catálogo de Exames)**: Sub-aba *Exames* em Configurações permite listar, criar, editar e excluir exames com código (`HEMO-01`), nome, seção técnica (`Hematologia`, `Bioquímica`, `Microbiologia`, `Parasitologia`, `Hormônios`, `Imagem`), prazo em dias, tipo de tubo (`Tubo EDTA (Roxo)`, `Tubo Gel Separador (Amarelo)`, etc.), quantidade de etiquetas e modelo de laudo padrão.
- **HU-02 (Admin — Campos Dinâmicos por Exame)**: Sub-aba *Campos Dinâmicos* permite selecionar qualquer exame e adicionar/remover campos personalizados (`field_name`, `field_label`, `field_type`: `text` | `number` | `select`, unidade de medida, opções JSON para selects e flag `is_required`). As alterações refletem imediatamente na tela de Lançamento de Laudos do Biomédico.
- **HU-03 (Admin — Tabelas de Preços com Vigência)**: Sub-aba *Tabelas de Preços* permite criar tabelas com período de vigência (`start_date` e `end_date`), clínica/convênio parceiro, editar preços individuais por exame e aplicar **Reajuste Percentual em Massa** (ex: `+8.5%`).
- **HU-04 (Admin — Valores de Referência Cruzados)**: Sub-aba *Valores de Referência* permite cadastrar parâmetros cruzando `exam_id`, `species` (`Canino`, `Felino`, `Equino`, `Silvestre`), `gender` (`M`, `F`, `Ambos`) e faixa etária em dias/meses (`min_age_days` a `max_age_days`).
- **HU-05 (Admin — Modelos de Laudos com Tags Dinâmicas)**: Sub-aba *Modelos de Laudos* oferece editor de cabeçalho, corpo e rodapé com botões de inserção rápida das tags dinâmicas (`{{paciente}}`, `{{especie}}`, `{{idade}}`, `{{tutor}}`, `{{veterinario}}`, `{{crmv}}`, `{{protocolo}}`, `{{data_liberacao}}`, `{{resultados}}`, `{{referencias}}`) e preview em tempo real.
- **HU-06 (Biomédico — Cadastro de Atendimento e Etiquetas)**: Aba *Atendimentos / Rotina* permite cadastrar paciente + tutor (ou selecionar existente), vincular veterinário solicitante, escolher múltiplos exames com cálculo automático de preço pela vigência (RN-04), gerar o protocolo (`VET-2026-XXXX`) e abrir o **Modal de Impressão de Etiquetas de Coleta** com código de barras, tipo de tubo e quantidade exata de etiquetas.
- **HU-07 (Biomédico — Preenchimento Dinâmico de Resultados)**: Aba *Lançamento de Laudos* renderiza os inputs customizados do exame (RN-03) e exibe ao lado o valor de referência cruzado automaticamente para a espécie, sexo e idade do animal atendido.
- **HU-08 (Biomédico — Anexos Complementares)**: No lançamento do exame, o biomédico pode anexar imagens de ultrassom, lâminas microscópicas ou PDFs complementares (via upload de arquivo local convertido para DataURL ou link de documento).
- **HU-09 (Biomédico — Finalização, PDF e Envio)**: Botões para salvar rascunho (`em_analise`), **Liberar Laudo Oficial (`concluido`)**, baixar o PDF formatado e disparar notificação/compartilhamento direto para o veterinário e tutor.
- **HU-10 e HU-11 (Médico Veterinário — Login por E-mail/CRMV e Download Rápido)**: `VetPortal.tsx` disponibiliza login exclusivo por E-mail + CRMV (com preenchimento de 1 clique para avaliação), listagem filtrável de pedidos solicitados pelo profissional, visualização do laudo na tela e download instantâneo do PDF.
- **HU-12 (Tutor — Consulta Pública por Protocolo)**: `TutorPortal.tsx` e a seção de busca na `LandingPage.tsx` permitem consultar o protocolo (ex: `VET-2026-0001`) sem senha, visualizar o status de cada exame, ler o laudo completo com valores de referência e baixar o arquivo PDF oficial.

---

## 5. Fluxo de Geração de PDF e Impressão (`pdfGenerator.ts`)

O módulo `frontend/src/utils/pdfGenerator.ts` implementa duas formas complementares de exportação:
1. **Download Direto de Arquivo `.pdf` Real**: Constrói dinamicamente um documento PDF binário válido (padrão ISO PDF 1.4 multi-bloco com tipografia Helvetica, cabeçalho institucional `vetlifelab.com.br`, metadados do protocolo, dados do paciente/tutor/veterinário, tabela de parâmetros analisados com valores de referência cruzados, anexos e assinatura eletrônica do biomédico responsável) e aciona o download imediato pelo navegador (`Laudo-VET-2026-0001.pdf`).
2. **Janela de Impressão de Alta Resolução / Etiquetas Térmicas**: Renderiza o template HTML customizado (HU-05) com substituição das tags `{{...}}` ou o layout de etiquetas de código de barras de tubos de coleta para impressão direta ou "Salvar como PDF".
