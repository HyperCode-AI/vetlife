import {
  CollectionRequest,
  Exam,
  ExamInputField,
  ExamPrice,
  ExamReference,
  ExamResult,
  Order,
  Patient,
  PriceTable,
  ReportTemplate,
  User,
  Vet,
} from '../../domain/entities';
import { loadOfficialCatalog2026 } from './catalog2026';

export interface SeedDatabaseState {
  users: User[];
  reportTemplates: ReportTemplate[];
  exams: Exam[];
  examInputFields: ExamInputField[];
  priceTables: PriceTable[];
  examPrices: ExamPrice[];
  examReferences: ExamReference[];
  patients: Patient[];
  vets: Vet[];
  orders: Order[];
  examResults: ExamResult[];
  collectionRequests: CollectionRequest[];
}

export function createInitialSeedState(): SeedDatabaseState {
  const users: User[] = [
    {
      id: 'usr-admin-001',
      name: 'Dra. Helena Albuquerque (Diretora Admin)',
      email: 'admin@vetlifelab.com.br',
      password_hash: 'Admin@2026',
      role: 'admin',
      created_at: '2026-01-02T08:00:00.000Z',
    },
    {
      id: 'usr-biomed-001',
      name: 'Dr. Rafael Nogueira (Biomédico Responsável CRBM-1 29410)',
      email: 'biomedico@vetlifelab.com.br',
      password_hash: 'Bio@2026',
      role: 'biomedical',
      created_at: '2026-01-02T08:30:00.000Z',
    },
  ];

  const reportTemplates: ReportTemplate[] = [
    {
      id: 'tpl-default-001',
      name: 'Laudo Oficial Padrão VetLife (Hematologia & Bioquímica)',
      header_html: `<div style="border-bottom:2px solid #0d9488;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
  <div>
    <h2 style="margin:0;color:#0f766e;font-size:20px;">VETLIFE LABORATÓRIO DE PATOLOGIA CLÍNICA VETERINÁRIA</h2>
    <p style="margin:2px 0 0;font-size:12px;color:#475569;">vetlifelab.com.br • Registro CRMV-SP PJ 09842 • Qualidade Controlada PNCQ</p>
  </div>
  <div style="text-align:right;font-size:12px;color:#334155;">
    <strong>Protocolo: {{protocolo}}</strong><br/>
    Emissão: {{data_liberacao}}
  </div>
</div>`,
      body_template: `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
    <div><strong>Paciente:</strong> {{paciente}} ({{especie}} • {{raca}} • {{sexo}} • {{idade}})</div>
    <div><strong>Tutor(a):</strong> {{tutor}}</div>
    <div><strong>Veterinário(a) Solicitante:</strong> {{veterinario}} ({{crmv}})</div>
    <div><strong>Clínica Parceira:</strong> {{clinica}}</div>
  </div>
</div>
<h3 style="color:#0f172a;font-size:16px;margin:12px 0 6px;">{{exame}} — Seção: {{secao}}</h3>
{{resultados}}
<div style="margin-top:12px;padding:10px;background:#f0fdfa;border-left:4px solid #0d9488;font-size:12px;color:#134e4a;">
  <strong>Valores de Referência (Cruzamento Espécie / Sexo / Faixa Etária):</strong><br/>
  {{referencias}}
</div>
<p style="margin-top:10px;font-size:12px;color:#475569;"><strong>Notas Clínicas:</strong> {{observacoes}}</p>`,
      footer_html: `<div style="border-top:1px solid #cbd5e1;margin-top:20px;padding-top:10px;font-size:11px;color:#64748b;display:flex;justify-content:space-between;">
  <span>Assinado digitalmente por Dr. Rafael Nogueira — Biomédico Patologista Clínico (CRBM-1 29410)</span>
  <span>Validação pública em vetlifelab.com.br/consulta — Protocolo {{protocolo}}</span>
</div>`,
      dynamic_tags: [
        '{{paciente}}',
        '{{especie}}',
        '{{raca}}',
        '{{sexo}}',
        '{{idade}}',
        '{{tutor}}',
        '{{veterinario}}',
        '{{crmv}}',
        '{{clinica}}',
        '{{protocolo}}',
        '{{data_pedido}}',
        '{{data_liberacao}}',
        '{{exame}}',
        '{{secao}}',
        '{{resultados}}',
        '{{referencias}}',
        '{{observacoes}}',
      ],
      is_default: true,
      created_at: '2026-01-02T09:00:00.000Z',
    },
    {
      id: 'tpl-micro-002',
      name: 'Laudo Especializado Microbiologia & Parasitologia',
      header_html: `<div style="border-bottom:2px solid #0284c7;padding-bottom:10px;margin-bottom:14px;">
  <h2 style="margin:0;color:#0369a1;font-size:19px;">VETLIFE — DIVISÃO DE MICROBIOLOGIA E PARASITOLOGIA VETERINÁRIA</h2>
  <p style="margin:2px 0 0;font-size:12px;color:#475569;">Protocolo: {{protocolo}} | Paciente: {{paciente}} ({{especie}}) | Solicitante: {{veterinario}} ({{crmv}})</p>
</div>`,
      body_template: `<h3 style="color:#0f172a;font-size:15px;">{{exame}}</h3>
{{resultados}}
<div style="margin-top:10px;font-size:12px;color:#334155;"><strong>Referência de Interpretação:</strong><br/>{{referencias}}</div>`,
      footer_html: `<div style="border-top:1px solid #cbd5e1;margin-top:16px;padding-top:8px;font-size:11px;color:#64748b;">
  Laudo Microbiológico liberado em {{data_liberacao}} • VetLife Diagnósticos Veterinários (vetlifelab.com.br)
</div>`,
      dynamic_tags: [
        '{{paciente}}',
        '{{especie}}',
        '{{veterinario}}',
        '{{crmv}}',
        '{{protocolo}}',
        '{{data_liberacao}}',
        '{{exame}}',
        '{{resultados}}',
        '{{referencias}}',
      ],
      is_default: false,
      created_at: '2026-01-03T10:00:00.000Z',
    },
  ];

  const rawCatalog2026 = loadOfficialCatalog2026();

  const exams: Exam[] = rawCatalog2026.map((item) => {
    const isMicroOrParas =
      item.section.toLowerCase().includes('microbiologia') ||
      item.section.toLowerCase().includes('parasitologia');

    return {
      id: item.id || `exam-${item.code}`,
      code: item.code,
      name: item.name,
      section: item.section,
      delivery_days: Number(item.delivery_days || 1),
      delivery_time_label:
        item.delivery_time_label ||
        `${item.delivery_days || 1} ${
          Number(item.delivery_days || 1) === 1 ? 'dia útil' : 'dias úteis'
        }`,
      tube_type: item.material,
      material: item.material,
      preparation: item.preparation || 'Jejum de 6 a 8 horas.',
      label_qty: Number(item.label_qty || 1),
      reference_template_id: isMicroOrParas ? 'tpl-micro-002' : 'tpl-default-001',
      base_price: Number(item.price),
      price: Number(item.price),
      active_price: Number(item.price),
      created_at: '2026-01-03T08:00:00.000Z',
    };
  });

  const examInputFields: ExamInputField[] = [
    // Hemograma Completo (exam-hemograma)
    {
      id: 'fld-hemo-1',
      exam_id: 'exam-hemograma',
      field_name: 'eritrocitos',
      field_label: 'Eritrócitos (Hemácias)',
      field_type: 'number',
      unit: 'milhões/µL',
      options: [],
      is_required: true,
      display_order: 1,
    },
    {
      id: 'fld-hemo-2',
      exam_id: 'exam-hemograma',
      field_name: 'hemoglobina',
      field_label: 'Hemoglobina',
      field_type: 'number',
      unit: 'g/dL',
      options: [],
      is_required: true,
      display_order: 2,
    },
    {
      id: 'fld-hemo-3',
      exam_id: 'exam-hemograma',
      field_name: 'hematocrito',
      field_label: 'Hematócrito (VG)',
      field_type: 'number',
      unit: '%',
      options: [],
      is_required: true,
      display_order: 3,
    },
    {
      id: 'fld-hemo-4',
      exam_id: 'exam-hemograma',
      field_name: 'leucocitos_totais',
      field_label: 'Leucócitos Totais',
      field_type: 'number',
      unit: '/µL',
      options: [],
      is_required: true,
      display_order: 4,
    },
    {
      id: 'fld-hemo-5',
      exam_id: 'exam-hemograma',
      field_name: 'plaquetas',
      field_label: 'Contagem de Plaquetas',
      field_type: 'number',
      unit: 'mil/µL',
      options: [],
      is_required: true,
      display_order: 5,
    },
    {
      id: 'fld-hemo-6',
      exam_id: 'exam-hemograma',
      field_name: 'pesquisa_hemoparasitas',
      field_label: 'Pesquisa de Hemoparasitas em Ponta de Orelha',
      field_type: 'select',
      unit: '',
      options: [
        'Negativa na amostra analisada',
        'Positiva para Babesia spp.',
        'Positiva para Ehrlichia spp.',
        'Positiva para Anaplasma platys',
        'Positiva para Mycoplasma haemofelis',
      ],
      is_required: true,
      display_order: 6,
    },
    {
      id: 'fld-hemo-7',
      exam_id: 'exam-hemograma',
      field_name: 'morfologia_celular',
      field_label: 'Observações Morfológicas da Lâmina',
      field_type: 'text',
      unit: '',
      options: [],
      is_required: false,
      display_order: 7,
    },

    // Bioquímico Renal e Hepático (exam-bioquimico)
    {
      id: 'fld-bioq-1',
      exam_id: 'exam-bioquimico',
      field_name: 'alt_tgp',
      field_label: 'ALT (TGP - Alanina Aminotransferase)',
      field_type: 'number',
      unit: 'U/L',
      options: [],
      is_required: true,
      display_order: 1,
    },
    {
      id: 'fld-bioq-2',
      exam_id: 'exam-bioquimico',
      field_name: 'fosfatase_alcalina',
      field_label: 'Fosfatase Alcalina (FA)',
      field_type: 'number',
      unit: 'U/L',
      options: [],
      is_required: true,
      display_order: 2,
    },
    {
      id: 'fld-bioq-3',
      exam_id: 'exam-bioquimico',
      field_name: 'ureia',
      field_label: 'Ureia Sérica',
      field_type: 'number',
      unit: 'mg/dL',
      options: [],
      is_required: true,
      display_order: 3,
    },
    {
      id: 'fld-bioq-4',
      exam_id: 'exam-bioquimico',
      field_name: 'creatinina',
      field_label: 'Creatinina Sérica',
      field_type: 'number',
      unit: 'mg/dL',
      options: [],
      is_required: true,
      display_order: 4,
    },
    {
      id: 'fld-bioq-5',
      exam_id: 'exam-bioquimico',
      field_name: 'proteinas_totais',
      field_label: 'Proteínas Totais',
      field_type: 'number',
      unit: 'g/dL',
      options: [],
      is_required: true,
      display_order: 5,
    },
    {
      id: 'fld-bioq-6',
      exam_id: 'exam-bioquimico',
      field_name: 'aspecto_soro',
      field_label: 'Aspecto do Soro',
      field_type: 'select',
      unit: '',
      options: ['Límpido Normal', 'Discretamente Lipêmico', 'Lipêmico', 'Hemolisado', 'Ictérico'],
      is_required: true,
      display_order: 6,
    },

    // Coproparasitológico (exam-copro)
    {
      id: 'fld-copro-1',
      exam_id: 'exam-copro',
      field_name: 'consistencia_amostra',
      field_label: 'Consistência e Aspecto Macroscópico',
      field_type: 'select',
      unit: '',
      options: ['Pastosa firme (Normal)', 'Pastosa amolecida', 'Diarreica com muco', 'Sanguinolenta'],
      is_required: true,
      display_order: 1,
    },
    {
      id: 'fld-copro-2',
      exam_id: 'exam-copro',
      field_name: 'contagem_ovos_opg',
      field_label: 'Contagem de Ovos por Grama de Fezes (OPG)',
      field_type: 'number',
      unit: 'OPG',
      options: [],
      is_required: true,
      display_order: 2,
    },
    {
      id: 'fld-copro-3',
      exam_id: 'exam-copro',
      field_name: 'protozoarios_giardia',
      field_label: 'Pesquisa de Cistos de Giardia spp. (Método Faust)',
      field_type: 'select',
      unit: '',
      options: ['Ausentes na amostra', 'Raros cistos (+)', 'Moderados cistos (++)', 'Abundantes cistos (+++)'],
      is_required: true,
      display_order: 3,
    },
    {
      id: 'fld-copro-4',
      exam_id: 'exam-copro',
      field_name: 'helmintos_identificados',
      field_label: 'Helmintos / Parasitas Identificados',
      field_type: 'text',
      unit: '',
      options: [],
      is_required: true,
      display_order: 4,
    },

    // Urocultura com Antibiograma (exam-urocultura)
    {
      id: 'fld-uro-1',
      exam_id: 'exam-urocultura',
      field_name: 'crescimento_bacteriano',
      field_label: 'Crescimento Bacteriano em Meios Seletivos',
      field_type: 'select',
      unit: '',
      options: [
        'Positivo (> 100.000 UFC/mL)',
        'Crescimento moderado (10.000 a 100.000 UFC/mL)',
        'Ausência de crescimento bacteriano em 48h',
      ],
      is_required: true,
      display_order: 1,
    },
    {
      id: 'fld-uro-2',
      exam_id: 'exam-urocultura',
      field_name: 'agente_isolado',
      field_label: 'Microrganismo Isolado',
      field_type: 'text',
      unit: '',
      options: [],
      is_required: true,
      display_order: 2,
    },
    {
      id: 'fld-uro-3',
      exam_id: 'exam-urocultura',
      field_name: 'contagem_colonia_ufc',
      field_label: 'Contagem de Unidades Formadoras de Colônia',
      field_type: 'number',
      unit: 'UFC/mL',
      options: [],
      is_required: true,
      display_order: 3,
    },
    {
      id: 'fld-uro-4',
      exam_id: 'exam-urocultura',
      field_name: 'antibiograma_sensivel',
      field_label: 'Antimicrobianos Sensíveis (S)',
      field_type: 'text',
      unit: '',
      options: [],
      is_required: true,
      display_order: 4,
    },
    {
      id: 'fld-uro-5',
      exam_id: 'exam-urocultura',
      field_name: 'antibiograma_resistente',
      field_label: 'Antimicrobianos Resistentes (R)',
      field_type: 'text',
      unit: '',
      options: [],
      is_required: false,
      display_order: 5,
    },
  ];

  const priceTables: PriceTable[] = [
    {
      id: 'pt-2026-padrao',
      name: 'Tabela 2026',
      partner_clinic: null,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      is_active: true,
      created_at: '2026-01-01T08:00:00.000Z',
    },
    {
      id: 'pt-2026-parceiros',
      name: 'Tabela Convênio Clínicas Parceiras Premium 2026',
      partner_clinic: 'Clínica Veterinária PetCare',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      is_active: true,
      created_at: '2026-01-01T09:00:00.000Z',
    },
    {
      id: 'pt-2025-encerrada',
      name: 'Tabela Base 2025 (Vigência Encerrada)',
      partner_clinic: null,
      start_date: '2025-01-01',
      end_date: '2025-12-31',
      is_active: false,
      created_at: '2025-01-01T08:00:00.000Z',
    },
  ];

  const examPrices: ExamPrice[] = [
    // Tabela 2026 Oficial (todos os 196 exames do PDF)
    ...exams.map((exam, index) => ({
      id: `ep-2026-${index + 1}`,
      price_table_id: 'pt-2026-padrao',
      exam_id: exam.id,
      price: Number(exam.base_price ?? exam.price ?? 50),
    })),
    // Tabela Convênio Parceiros 2026
    ...exams.map((exam, index) => ({
      id: `ep-parc-${index + 1}`,
      price_table_id: 'pt-2026-parceiros',
      exam_id: exam.id,
      price: Number(exam.base_price ?? exam.price ?? 50),
    })),
  ];

  const examReferences: ExamReference[] = [
    {
      id: 'ref-hemo-canino-filhote',
      exam_id: 'exam-hemograma',
      parameter_name: 'Eritrograma e Leucograma (Canino Filhote 0-12m)',
      species: 'Canino',
      gender: 'Ambos',
      min_age_days: 0,
      max_age_days: 365,
      reference_text_content:
        'Eritrócitos: 4,5 a 6,5 milhões/µL | Hemoglobina: 10,0 a 15,0 g/dL | Hematócrito: 32 a 45% | Leucócitos Totais: 7.000 a 18.500 /µL | Plaquetas: 200 a 500 mil/µL',
      min_value: 32,
      max_value: 45,
      unit: '% (Ht)',
    },
    {
      id: 'ref-hemo-canino-adulto',
      exam_id: 'exam-hemograma',
      parameter_name: 'Eritrograma e Leucograma (Canino Adulto/Sênior)',
      species: 'Canino',
      gender: 'Ambos',
      min_age_days: 366,
      max_age_days: 9125,
      reference_text_content:
        'Eritrócitos: 5,5 a 8,5 milhões/µL | Hemoglobina: 12,0 a 18,0 g/dL | Hematócrito: 37 a 55% | Leucócitos Totais: 6.000 a 17.000 /µL | Plaquetas: 175 a 500 mil/µL',
      min_value: 37,
      max_value: 55,
      unit: '% (Ht)',
    },
    {
      id: 'ref-hemo-felino-adulto',
      exam_id: 'exam-hemograma',
      parameter_name: 'Eritrograma e Leucograma (Felino)',
      species: 'Felino',
      gender: 'Ambos',
      min_age_days: 0,
      max_age_days: 9125,
      reference_text_content:
        'Eritrócitos: 5,0 a 10,0 milhões/µL | Hemoglobina: 8,0 a 15,0 g/dL | Hematócrito: 24 a 45% | Leucócitos Totais: 5.500 a 19.500 /µL | Plaquetas: 230 a 680 mil/µL',
      min_value: 24,
      max_value: 45,
      unit: '% (Ht)',
    },
    {
      id: 'ref-bioq-canino',
      exam_id: 'exam-bioquimico',
      parameter_name: 'Perfil Renal e Hepático (Canino)',
      species: 'Canino',
      gender: 'Ambos',
      min_age_days: 0,
      max_age_days: 9125,
      reference_text_content:
        'ALT (TGP): 10 a 109 U/L | Fosfatase Alcalina (FA): 20 a 156 U/L | Ureia: 21 a 60 mg/dL | Creatinina: 0,5 a 1,5 mg/dL | Proteínas Totais: 5,4 a 7,5 g/dL',
      min_value: 0.5,
      max_value: 1.5,
      unit: 'mg/dL (Creat)',
    },
    {
      id: 'ref-bioq-felino',
      exam_id: 'exam-bioquimico',
      parameter_name: 'Perfil Renal e Hepático (Felino)',
      species: 'Felino',
      gender: 'Ambos',
      min_age_days: 0,
      max_age_days: 9125,
      reference_text_content:
        'ALT (TGP): 25 a 97 U/L | Fosfatase Alcalina (FA): 10 a 80 U/L | Ureia: 30 a 65 mg/dL | Creatinina: 0,8 a 1,8 mg/dL | Proteínas Totais: 5,7 a 8,0 g/dL',
      min_value: 0.8,
      max_value: 1.8,
      unit: 'mg/dL (Creat)',
    },
    {
      id: 'ref-copro-geral',
      exam_id: 'exam-copro',
      parameter_name: 'Padrão Coproparasitológico Veterinário',
      species: 'Felino',
      gender: 'Ambos',
      min_age_days: 0,
      max_age_days: 9125,
      reference_text_content:
        'OPG: 0 ovos/g (Negativo) | Cistos de Protozoários (Giardia / Isospora): Ausentes | Larvas e Helmintos: Ausentes na amostra analisada',
      min_value: 0,
      max_value: 0,
      unit: 'OPG',
    },
    {
      id: 'ref-uro-geral',
      exam_id: 'exam-urocultura',
      parameter_name: 'Padrão Microbiológico Urinário (Cistocentese)',
      species: 'Canino',
      gender: 'Ambos',
      min_age_days: 0,
      max_age_days: 9125,
      reference_text_content:
        'Amostra por Cistocentese: Ausência de crescimento bacteriano (< 1.000 UFC/mL). Crescimento >= 100.000 UFC/mL indica infecção urinária ativa.',
      min_value: 0,
      max_value: 1000,
      unit: 'UFC/mL',
    },
  ];

  const patients: Patient[] = [
    {
      id: 'pat-thor-001',
      name: 'Thor',
      species: 'Canino',
      breed: 'Golden Retriever',
      gender: 'M',
      birth_date: '2022-03-15',
      tutor_name: 'Marcelo Henrique Mendonça',
      tutor_phone: '(11) 99812-4401',
      tutor_email: 'marcelo.mendonca@email.com',
      created_at: '2026-02-10T10:00:00.000Z',
    },
    {
      id: 'pat-luna-002',
      name: 'Luna',
      species: 'Felino',
      breed: 'Siamês',
      gender: 'F',
      birth_date: '2024-04-20',
      tutor_name: 'Beatriz Vasconcelos',
      tutor_phone: '(11) 98745-2210',
      tutor_email: 'beatriz.vasconcelos@email.com',
      created_at: '2026-02-12T11:30:00.000Z',
    },
    {
      id: 'pat-max-003',
      name: 'Max',
      species: 'Canino',
      breed: 'Bulldog Francês',
      gender: 'M',
      birth_date: '2025-09-10',
      tutor_name: 'Rodrigo Camargo',
      tutor_phone: '(11) 97621-8890',
      tutor_email: 'rodrigo.camargo@email.com',
      created_at: '2026-03-01T14:00:00.000Z',
    },
    {
      id: 'pat-mel-004',
      name: 'Mel',
      species: 'Canino',
      breed: 'Shih Tzu',
      gender: 'F',
      birth_date: '2018-06-05',
      tutor_name: 'Patrícia Siqueira',
      tutor_phone: '(11) 99123-7744',
      tutor_email: 'patricia.siqueira@email.com',
      created_at: '2026-03-05T09:15:00.000Z',
    },
  ];

  const vets: Vet[] = [
    {
      id: 'vet-carlos-001',
      name: 'Dr. Carlos Eduardo Silva',
      crmv: 'CRMV-SP 45890',
      clinic_name: 'Clínica Veterinária PetCare',
      email: 'carlos.silva@clinicapetcare.com.br',
      phone: '(11) 3045-8800',
      created_at: '2026-01-05T08:00:00.000Z',
    },
    {
      id: 'vet-mariana-002',
      name: 'Dra. Mariana Costa',
      crmv: 'CRMV-SP 51234',
      clinic_name: 'Hospital Veterinário VetVida',
      email: 'mariana.costa@vetvida.com.br',
      phone: '(11) 3289-4100',
      created_at: '2026-01-06T09:00:00.000Z',
    },
    {
      id: 'vet-roberto-003',
      name: 'Dr. Roberto Alves',
      crmv: 'CRMV-RJ 21450',
      clinic_name: 'Centro Veterinário Bicho Saudável',
      email: 'roberto.alves@bichosaudavel.com.br',
      phone: '(21) 2541-9020',
      created_at: '2026-01-10T10:00:00.000Z',
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord-0001',
      protocol_code: 'VET-2026-0001',
      patient_id: 'pat-thor-001',
      vet_id: 'vet-carlos-001',
      price_table_id: 'pt-2026-parceiros',
      price_table_name: 'Tabela Convênio Clínicas Parceiras Premium 2026',
      total_amount: 156.0,
      status: 'concluido',
      notes: 'Check-up pré-cirúrgico ortopédico. Animal em jejum alimentar de 10h.',
      created_at: '2026-03-10T09:30:00.000Z',
    },
    {
      id: 'ord-0002',
      protocol_code: 'VET-2026-0002',
      patient_id: 'pat-luna-002',
      vet_id: 'vet-mariana-002',
      price_table_id: 'pt-2026-padrao',
      price_table_name: 'Tabela Geral VetLife 2026 (Vigência Anual Padrão)',
      total_amount: 123.0,
      status: 'concluido',
      notes: 'Investigação de perda de peso leve e fezes amolecidas intermitentes.',
      created_at: '2026-03-11T10:15:00.000Z',
    },
    {
      id: 'ord-0003',
      protocol_code: 'VET-2026-0003',
      patient_id: 'pat-max-003',
      vet_id: 'vet-carlos-001',
      price_table_id: 'pt-2026-parceiros',
      price_table_name: 'Tabela Convênio Clínicas Parceiras Premium 2026',
      total_amount: 183.0,
      status: 'em_analise',
      notes: 'Suspeita de cistite bacteriana em filhote. Coleta realizada por cistocentese.',
      created_at: '2026-03-12T14:20:00.000Z',
    },
    {
      id: 'ord-0004',
      protocol_code: 'VET-2026-0004',
      patient_id: 'pat-mel-004',
      vet_id: 'vet-mariana-002',
      price_table_id: 'pt-2026-padrao',
      price_table_name: 'Tabela Geral VetLife 2026 (Vigência Anual Padrão)',
      total_amount: 115.0,
      status: 'pendente',
      notes: 'Acompanhamento geriátrico semestral renal e hepático.',
      created_at: '2026-03-13T08:45:00.000Z',
    },
  ];

  const examResults: ExamResult[] = [
    // Resultados de VET-2026-0001 (Thor - Concluído)
    {
      id: 'res-0001-hemo',
      order_id: 'ord-0001',
      exam_id: 'exam-hemograma',
      applied_price: 58.0,
      dynamic_content: {
        eritrocitos: 6.8,
        hemoglobina: 15.4,
        hematocrito: 46,
        leucocitos_totais: 9400,
        plaquetas: 310,
        pesquisa_hemoparasitas: 'Negativa na amostra analisada',
        morfologia_celular: 'Normocitose e normocromia. Plaquetas sem agregados.',
      },
      reference_snapshot:
        '[Canino | Sexo: Ambos | Idade: 366 a 9125 dias] Eritrócitos: 5,5 a 8,5 milhões/µL | Hemoglobina: 12,0 a 18,0 g/dL | Hematócrito: 37 a 55% | Leucócitos Totais: 6.000 a 17.000 /µL | Plaquetas: 175 a 500 mil/µL',
      attachments: [
        {
          id: 'att-thor-usg',
          name: 'Ultrassom_Abdominal_Complementar_Thor.pdf',
          type: 'ultrasound',
          url: 'https://vetlifelab.com.br/laudos/anexos/VET-2026-0001-ultrassom.pdf',
          uploaded_at: '2026-03-10T15:10:00.000Z',
        },
      ],
      pdf_url: 'https://vetlifelab.com.br/api/v1/public/protocol/VET-2026-0001',
      released_at: '2026-03-10T16:00:00.000Z',
      released_by: 'usr-biomed-001',
    },
    {
      id: 'res-0001-bioq',
      order_id: 'ord-0001',
      exam_id: 'exam-bioquimico',
      applied_price: 98.0,
      dynamic_content: {
        alt_tgp: 48,
        fosfatase_alcalina: 74,
        ureia: 38,
        creatinina: 1.1,
        proteinas_totais: 6.4,
        aspecto_soro: 'Límpido Normal',
      },
      reference_snapshot:
        '[Canino | Sexo: Ambos | Idade: 0 a 9125 dias] ALT (TGP): 10 a 109 U/L | Fosfatase Alcalina (FA): 20 a 156 U/L | Ureia: 21 a 60 mg/dL | Creatinina: 0,5 a 1,5 mg/dL | Proteínas Totais: 5,4 a 7,5 g/dL',
      attachments: [],
      pdf_url: 'https://vetlifelab.com.br/api/v1/public/protocol/VET-2026-0001',
      released_at: '2026-03-10T16:00:00.000Z',
      released_by: 'usr-biomed-001',
    },

    // Resultados de VET-2026-0002 (Luna - Concluído)
    {
      id: 'res-0002-hemo',
      order_id: 'ord-0002',
      exam_id: 'exam-hemograma',
      applied_price: 68.0,
      dynamic_content: {
        eritrocitos: 7.4,
        hemoglobina: 11.8,
        hematocrito: 36,
        leucocitos_totais: 11200,
        plaquetas: 390,
        pesquisa_hemoparasitas: 'Negativa na amostra analisada',
        morfologia_celular: 'Série vermelha e branca dentro dos limites fisiológicos para a espécie felina.',
      },
      reference_snapshot:
        '[Felino | Sexo: Ambos | Idade: 0 a 9125 dias] Eritrócitos: 5,0 a 10,0 milhões/µL | Hemoglobina: 8,0 a 15,0 g/dL | Hematócrito: 24 a 45% | Leucócitos Totais: 5.500 a 19.500 /µL | Plaquetas: 230 a 680 mil/µL',
      attachments: [],
      pdf_url: 'https://vetlifelab.com.br/api/v1/public/protocol/VET-2026-0002',
      released_at: '2026-03-11T17:20:00.000Z',
      released_by: 'usr-biomed-001',
    },
    {
      id: 'res-0002-copro',
      order_id: 'ord-0002',
      exam_id: 'exam-copro',
      applied_price: 55.0,
      dynamic_content: {
        consistencia_amostra: 'Pastosa amolecida',
        contagem_ovos_opg: 150,
        protozoarios_giardia: 'Raros cistos (+)',
        helmintos_identificados: 'Presença discreta de cistos de Giardia spp. Ausência de ovos de helmintos.',
      },
      reference_snapshot:
        '[Felino | Sexo: Ambos | Idade: 0 a 9125 dias] OPG: 0 ovos/g (Negativo) | Cistos de Protozoários (Giardia / Isospora): Ausentes',
      attachments: [],
      pdf_url: 'https://vetlifelab.com.br/api/v1/public/protocol/VET-2026-0002',
      released_at: '2026-03-11T17:20:00.000Z',
      released_by: 'usr-biomed-001',
    },

    // Resultados de VET-2026-0003 (Max - Em Análise)
    {
      id: 'res-0003-uro',
      order_id: 'ord-0003',
      exam_id: 'exam-urocultura',
      applied_price: 125.0,
      dynamic_content: {
        crescimento_bacteriano: 'Positivo (> 100.000 UFC/mL)',
        agente_isolado: 'Escherichia coli',
        contagem_colonia_ufc: 120000,
        antibiograma_sensivel: 'Amoxicilina + Clavulanato, Enrofloxacina, Marbofloxacina, Cefovecina',
        antibiograma_resistente: 'Ampicilina, Sulfametoxazol + Trimetoprim',
      },
      reference_snapshot: '',
      attachments: [],
      pdf_url: null,
      released_at: null,
      released_by: null,
    },
    {
      id: 'res-0003-hemo',
      order_id: 'ord-0003',
      exam_id: 'exam-hemograma',
      applied_price: 58.0,
      dynamic_content: {
        eritrocitos: 5.4,
        hemoglobina: 12.1,
        hematocrito: 38,
        leucocitos_totais: 16800,
        plaquetas: 340,
        pesquisa_hemoparasitas: 'Negativa na amostra analisada',
        morfologia_celular: 'Discreta leucocitose por neutrofilia compatível com processo inflamatório/infeccioso.',
      },
      reference_snapshot: '',
      attachments: [],
      pdf_url: null,
      released_at: null,
      released_by: null,
    },

    // Resultados de VET-2026-0004 (Mel - Pendente)
    {
      id: 'res-0004-bioq',
      order_id: 'ord-0004',
      exam_id: 'exam-bioquimico',
      applied_price: 115.0,
      dynamic_content: {},
      reference_snapshot: '',
      attachments: [],
      pdf_url: null,
      released_at: null,
      released_by: null,
    },
  ];

  const collectionRequests: CollectionRequest[] = [
    {
      id: 'col-001',
      clinic_or_tutor_name: 'Clínica Veterinária PetCare (Dr. Carlos)',
      phone: '(11) 3045-8800',
      email: 'carlos.silva@clinicapetcare.com.br',
      address: 'Av. República do Líbano, 1420 - Moema, São Paulo/SP',
      preferred_date: '2026-03-14',
      notes: '3 tubos EDTA + 2 tubos gel separador refrigerados na recepção.',
      status: 'agendada',
      created_at: '2026-03-12T11:00:00.000Z',
    },
    {
      id: 'col-002',
      clinic_or_tutor_name: 'Hospital Veterinário VetVida (Dra. Mariana)',
      phone: '(11) 3289-4100',
      email: 'mariana.costa@vetvida.com.br',
      address: 'Rua Oscar Freire, 890 - Jardins, São Paulo/SP',
      preferred_date: '2026-03-14',
      notes: 'Coleta urgente de cultura bacteriana em cistocentese.',
      status: 'pendente',
      created_at: '2026-03-13T08:10:00.000Z',
    },
  ];

  return {
    users,
    reportTemplates,
    exams,
    examInputFields,
    priceTables,
    examPrices,
    examReferences,
    patients,
    vets,
    orders,
    examResults,
    collectionRequests,
  };
}
