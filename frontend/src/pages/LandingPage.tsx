import React, { useState } from 'react';
import {
  Search,
  Microscope,
  FlaskConical,
  Bug,
  Activity,
  Dna,
  FileText,
  ChevronRight,
  CheckCircle2,
  MapPin,
  Phone,
  Clock,
  Truck,
  TestTube2,
  Stethoscope,
  MessageCircle,
  Award,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../services/api';

interface LandingPageProps {
  onNavigate: (view: 'landing' | 'tutor' | 'vet' | 'internal', protocolCode?: string) => void;
}

const FALLBACK_FOUNDER_IMG =
  'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=900&q=85';

const FALLBACK_LAB_BENCH_1 =
  'https://images.unsplash.com/photo-1579154204601-01588f351e67?auto=format&fit=crop&w=600&q=80';

const FALLBACK_LAB_BENCH_2 =
  'https://images.unsplash.com/photo-1582719471384-894fbb16e074?auto=format&fit=crop&w=600&q=80';

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [protocolInput, setProtocolInput] = useState('');
  const [protocolError, setProtocolError] = useState<string | null>(null);
  const [trioImgSrc, setTrioImgSrc] = useState('/images/hero-pets-trio.png?v=3');
  const [founderImgSrc, setFounderImgSrc] = useState('/images/kerollyn-passos.jpg?v=2');
  const [collectionForm, setCollectionForm] = useState({
    clinic_or_tutor_name: '',
    phone: '',
    email: '',
    address: '',
    preferred_date: '2026-04-14',
    notes: '',
  });
  const [submittingCollection, setSubmittingCollection] = useState(false);
  const [collectionSuccess, setCollectionSuccess] = useState<string | null>(null);

  const handleQuickProtocolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = protocolInput.trim().toUpperCase();
    if (!code) {
      setProtocolError('Informe o código de protocolo do exame antes de consultar.');
      return;
    }
    setProtocolError(null);
    onNavigate('tutor', code);
  };

  const handleCollectionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCollection(true);
    setCollectionSuccess(null);
    try {
      await api.createCollectionRequest(collectionForm);
      setCollectionSuccess(
        'Solicitação de coleta registrada com sucesso. Nossa equipe logística entrará em contato em breve.'
      );
      setCollectionForm({
        clinic_or_tutor_name: '',
        phone: '',
        email: '',
        address: '',
        preferred_date: '2026-04-14',
        notes: '',
      });
    } finally {
      setSubmittingCollection(false);
    }
  };

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const technicalSections = [
    {
      icon: Activity,
      title: 'Hematologia Clínica.',
      desc: 'Hemograma automatizado com revisão microscópica de lâmina, contagem de reticulócitos e pesquisa de hemoparasitas.',
      sla: '1 dia útil',
      tube: 'Tubo Roxo (EDTA)',
    },
    {
      icon: FlaskConical,
      title: 'Bioquímica & Painéis.',
      desc: 'Painel Check-up 1, 2 e Geral, perfis renal (SDMA, Creatinina, Ureia, UPC) e hepático (ALT, AST, FA, GGT) por espécie.',
      sla: '1 dia útil',
      tube: 'Tubo Amarelo (Gel)',
    },
    {
      icon: Microscope,
      title: 'Microbiologia & Cultura.',
      desc: 'Urocultura quantitativa, cultura bacteriana aeróbia/anaeróbia com antibiograma (MIC) e cultura fúngica.',
      sla: '8 a 10 dias úteis',
      tube: 'Frasco Estéril / Swab',
    },
    {
      icon: Bug,
      title: 'Parasitologia & Urinálise.',
      desc: 'Coproparasitológico pelos métodos de Willis, Faust e Hoffman, pesquisa de Giardia e Urina Rotina completa.',
      sla: '1 dia útil',
      tube: 'Coletor Universal',
    },
    {
      icon: Dna,
      title: 'Endocrinologia.',
      desc: 'Dosagens hormonais de T4 Livre por diálise de equilíbrio, TSH específico, cortisol basal e curvas diagnósticas.',
      sla: '4 a 5 dias úteis',
      tube: 'Tubo Amarelo (Soro)',
    },
    {
      icon: FileText,
      title: 'Patologia & PCR.',
      desc: 'Citologia aspirativa, histopatologia (biópsias) e painéis de Biologia Molecular (PCR Real-Time) de alta especificidade.',
      sla: '4 a 9 dias úteis',
      tube: 'Lâmina / Formol / EDTA',
    },
  ];

  const collectionGuideItems = [
    {
      badge: 'Tampa Roxa • EDTA',
      dotColor: 'bg-[#6b3fa0]',
      title: 'Hematologia e Biologia Molecular.',
      desc: 'Indicado para Hemograma Completo, Reticulócitos, Pesquisa de Hemoparasitas e PCR. Homogeneizar suavemente por inversão (5 a 8 vezes) após a coleta e manter refrigerado entre 2°C e 8°C.',
      thermalControl: 'Controle térmico: 2°C a 8°C',
    },
    {
      badge: 'Tampa Amarela • Gel Separador',
      dotColor: 'bg-[#d99b16]',
      title: 'Bioquímica Sérica, Hormônios e Sorologia.',
      desc: 'Indicado para ALT, AST, FA, GGT, Ureia, Creatinina, SDMA, Proteínas e Perfis Hormonais. Aguardar retração do coágulo por 15 a 30 minutos antes de refrigerar.',
      thermalControl: 'Controle térmico: 2°C a 8°C',
    },
    {
      badge: 'Tampa Cinza • Fluoreto',
      dotColor: 'bg-[#7b8694]',
      title: 'Glicemia Plasmática e Lactato.',
      desc: 'Inibe a glicólise in vitro preservando a concentração real de glicose e lactato. Homogeneizar por inversão suave imediatamente após a punção.',
      thermalControl: 'Controle térmico: 2°C a 8°C',
    },
    {
      badge: 'Tampa Azul • Citrato 3,2%',
      dotColor: 'bg-[#1d9496]',
      title: 'Coagulograma (TP, TTPA e Fibrinogênio).',
      desc: 'Preencher rigorosamente até a marca indicativa do tubo para manter a proporção exata de 9:1 entre sangue e anticoagulante.',
      thermalControl: 'Controle térmico: 2°C a 8°C',
    },
    {
      badge: 'Frasco Estéril & Coletor',
      dotColor: 'bg-[#0b2240]',
      title: 'Urinálise, UPC, Urocultura e Parasitológico.',
      desc: 'Amostras de urina por cistocentese e fezes frescas devem ser mantidas sob refrigeração imediata para preservação celular e microbiológica.',
      thermalControl: 'Controle térmico: 2°C a 8°C',
    },
    {
      badge: 'Lâminas & Formol 10%',
      dotColor: 'bg-[#147a7c]',
      title: 'Citologia e Histopatologia.',
      desc: 'Lâminas secas ao ar em porta-lâminas rígido, enviadas separadas de frascos de formol para evitar artefatos de fixação celular.',
      thermalControl: 'Controle térmico: Temperatura ambiente',
    },
  ];

  return (
    <div className="space-y-24 lg:space-y-[120px] pb-28 text-[#0b2240]">
      {/* =====================================================================
          HERO SECTION 50/50 — ESTILO EDITORIAL DAYOS
          Esquerda: Montagem Cão Porte Grande + Cão Porte Pequeno + Gato
          Direita: Headline Forte + Consulta de Laudo + Botões de Ação
         ===================================================================== */}
      <section className="pt-6 pb-8 lg:py-12">
        <div className="max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center min-h-[76vh]">
          {/* METADE ESQUERDA: PNG Orgânico Fundido ao Fundo com Sombreamento Sutil em Azul Escuro */}
          <div className="lg:col-span-6 relative flex items-center justify-center min-h-[340px] sm:min-h-[460px] lg:min-h-[540px]">
            {/* Sombreamento radial amplo e bem sutil em azul escuro (#0b2240 / #13325b) sem borda marcada */}
            <div
              className="absolute -inset-24 sm:-inset-36 blur-3xl pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 48% 50%, rgba(11, 34, 64, 0.045) 0%, rgba(19, 50, 91, 0.02) 45%, rgba(250, 251, 252, 0) 76%)',
              }}
              aria-hidden="true"
            />

            <img
              src={trioImgSrc}
              onError={() => setTrioImgSrc('/images/hero-pets-trio.jpg?v=3')}
              alt="Cachorro de porte grande, cachorro de porte pequeno e gato atendidos no Laboratório VetLife"
              className="relative z-10 w-full max-w-[680px] lg:max-w-none lg:w-[115%] lg:-ml-6 xl:w-[120%] xl:-ml-8 h-auto object-contain select-none [mask-image:linear-gradient(to_bottom,black_82%,transparent_99%)]"
            />
          </div>

          {/* METADE DIREITA: Tipografia Forte Estilo Dayos + Botões de Ação */}
          <div className="lg:col-span-6 space-y-7">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-sm text-[12px] font-bold tracking-wider text-[#147a7c] uppercase">
              <span className="w-2 h-2 rounded-full bg-[#1d9496]" />
              Medicina Laboratorial Veterinária
            </div>

            <div className="space-y-4">
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[56px] font-black tracking-tight leading-[1.02] text-[#0b2240] uppercase">
                Precisão e agilidade em diagnósticos veterinários.
              </h1>
              <p className="text-[17px] sm:text-[19px] leading-[1.5] text-[#5b6675] max-w-xl">
                Suporte diagnóstico completo para clínicas e médicos veterinários, com
                valores de referência calibrados por espécie e laudos digitais em PDF.
              </p>
            </div>

            {/* Bloco de Consulta Rápida de Laudo */}
            <div className="bg-white rounded-[24px] p-4 sm:p-5 border border-slate-200/80 shadow-sm space-y-3">
              <div className="text-[12px] font-bold uppercase tracking-wider text-[#0b2240]">
                Consultar Resultado do Exame
              </div>
              <form
                onSubmit={handleQuickProtocolSubmit}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
              >
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#7b8694] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={protocolInput}
                    onChange={(e) => {
                      setProtocolInput(e.target.value);
                      if (protocolError) setProtocolError(null);
                    }}
                    placeholder="Digite o protocolo do exame..."
                    aria-label="Protocolo do exame"
                    className="w-full pl-11 pr-4 py-3 rounded-full bg-[#f5f5f7] text-[#0b2240] placeholder:text-[#7b8694] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                  />
                </div>
                <button
                  type="submit"
                  className="px-6 py-3 rounded-full bg-[#1d9496] hover:bg-[#147a7c] text-white text-[15px] font-semibold transition shrink-0"
                >
                  Consultar Laudo
                </button>
              </form>
              {protocolError && (
                <p className="mt-2 text-[12px] font-medium text-red-600">{protocolError}</p>
              )}
            </div>

            {/* Grade / Linha de Botões de Ação Principais */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('vet')}
                  className="px-6 py-3.5 rounded-full bg-[#0b2240] hover:bg-[#13325b] text-white text-[15px] font-semibold transition inline-flex items-center gap-2 shadow-sm"
                >
                  <Stethoscope className="w-4 h-4 text-[#7fdbea]" />
                  <span>Portal do Veterinário</span>
                </button>

                <button
                  type="button"
                  onClick={() => scrollToId('solicitar-coleta')}
                  className="px-6 py-3.5 rounded-full bg-white hover:bg-[#0b2240] text-[#0b2240] hover:text-white border border-[#0b2240] text-[15px] font-semibold transition inline-flex items-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  <span>Solicitar Coleta</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => scrollToId('servicos')}
                  className="px-4 py-2 rounded-full bg-white border border-slate-200/80 text-[#0b2240] hover:border-[#1d9496] hover:text-[#147a7c] text-[13px] font-semibold transition"
                >
                  Tabela de Exames e Prazos
                </button>
                <button
                  type="button"
                  onClick={() => scrollToId('guia-coleta')}
                  className="px-4 py-2 rounded-full bg-white border border-slate-200/80 text-[#0b2240] hover:border-[#1d9496] hover:text-[#147a7c] text-[13px] font-semibold transition"
                >
                  Guia de Tubos e Coleta
                </button>
                <a
                  href="https://wa.me/5535984581997"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-full bg-[#e8f6f5] text-[#147a7c] hover:bg-[#1d9496] hover:text-white text-[13px] font-semibold transition inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Falar no WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO "SOBRE O LABORATÓRIO"
         ===================================================================== */}
      <section id="sobre" className="max-w-[1240px] mx-auto space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#1d9496]">
              Estrutura & Qualidade Analítica
            </span>
            <h2 className="font-display text-[32px] sm:text-[48px] font-bold leading-[1.08] tracking-tight text-[#0b2240]">
              Sobre o laboratório.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('tutor', 'VET-2026-0001')}
            className="inline-flex items-center gap-1 text-[16px] font-semibold text-[#147a7c] hover:opacity-80 transition"
          >
            Consultar laudo emitido
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white rounded-[28px] p-7 sm:p-12 border border-slate-200/70 space-y-10">
          <div className="max-w-4xl space-y-5 text-[17px] sm:text-[19px] leading-[1.55] text-[#5b6675]">
            <p>
              O <strong className="text-[#0b2240] font-semibold">VetLife Laboratório</strong>{' '}
              oferece suporte diagnóstico completo ao{' '}
              <strong className="text-[#0b2240] font-semibold">Médico Veterinário</strong> através
              de análises clínicas de alta precisão em{' '}
              <strong className="text-[#0b2240] font-semibold">
                Hematologia, Bioquímica, Urinálise, Parasitologia, Microbiologia, Hormônios,
                Imunologia, Biologia Molecular, Citologia e Histopatologia
              </strong>
              .
            </p>
            <p>
              Combinamos equipamentos automatizados dedicados à medicina veterinária com revisão
              microscópica minuciosa de lâminas e controle de qualidade interno diário, entregando
              resultados confiáveis com valores de referência calibrados por{' '}
              <strong className="text-[#147a7c] font-semibold">
                espécie, sexo e faixa etária
              </strong>
              .
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="p-6 rounded-[22px] bg-[#f5f5f7]">
              <div className="font-display text-[32px] font-bold text-[#0b2240]">195+</div>
              <div className="text-[13px] text-[#5b6675] mt-1">
                Exames e painéis diagnósticos padronizados no catálogo
              </div>
            </div>
            <div className="p-6 rounded-[22px] bg-[#f5f5f7]">
              <div className="font-display text-[32px] font-bold text-[#1d9496]">1 dia útil</div>
              <div className="text-[13px] text-[#5b6675] mt-1">
                Prazo ágil para hemogramas, perfis bioquímicos e check-ups de rotina
              </div>
            </div>
            <div className="p-6 rounded-[22px] bg-[#f5f5f7]">
              <div className="font-display text-[32px] font-bold text-[#0b2240]">100% PDF</div>
              <div className="text-[13px] text-[#5b6675] mt-1">
                Laudos digitais completos com acesso rápido para clínicas e médicos veterinários
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          NOVA SEÇÃO: DIREÇÃO TÉCNICA & FUNDADORA — DRA. KEROLLYN ISABELA MACEDO PASSOS SILVA
         ===================================================================== */}
      <section id="fundadora" className="max-w-[1240px] mx-auto space-y-10">
        <div className="space-y-2">
          <span className="text-[12px] font-bold uppercase tracking-wider text-[#1d9496]">
            Liderança & Responsabilidade Técnica
          </span>
          <h2 className="font-display text-[32px] sm:text-[48px] font-bold leading-[1.08] tracking-tight text-[#0b2240]">
            Direção técnica e cuidado em cada laudo.
          </h2>
        </div>

        <div className="bg-white rounded-[32px] p-6 sm:p-10 lg:p-12 border border-slate-200/70 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Coluna da Foto Principal + Galeria Mockada do Laboratório */}
          <div className="lg:col-span-5 space-y-4">
            <div className="relative rounded-[24px] overflow-hidden bg-[#f5f5f7]">
              <img
                src={founderImgSrc}
                onError={() => setFounderImgSrc(FALLBACK_FOUNDER_IMG)}
                alt="Dra. Kerollyn Isabela Macedo Passos Silva — Biomédica e Fundadora do Laboratório VetLife"
                className="w-full h-[380px] sm:h-[430px] object-cover object-top"
              />
              <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-[#0b2240]/90 backdrop-blur-sm px-4 py-3 text-white">
                <div className="text-[14px] font-bold">
                  Dra. Kerollyn Isabela Macedo Passos Silva
                </div>
                <div className="text-[12px] text-[#7fdbea]">
                  Fundadora & Direção Laboratorial • Biomédica Patologista Clínica
                </div>
              </div>
            </div>

            {/* Galeria secundária mockada da bancada/microscopia */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl overflow-hidden bg-[#f5f5f7] relative h-28">
                <img
                  src={FALLBACK_LAB_BENCH_1}
                  alt="Bancada de análises clínicas e microscopia VetLife"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-white/90 text-[11px] font-semibold text-[#0b2240]">
                  Microscopia
                </span>
              </div>
              <div className="rounded-2xl overflow-hidden bg-[#f5f5f7] relative h-28">
                <img
                  src={FALLBACK_LAB_BENCH_2}
                  alt="Processamento automatizado e controle de qualidade VetLife"
                  className="w-full h-full object-cover"
                />
                <span className="absolute bottom-2 left-2 px-2.5 py-0.5 rounded-full bg-white/90 text-[11px] font-semibold text-[#0b2240]">
                  Bancada Técnica
                </span>
              </div>
            </div>
          </div>

          {/* Coluna de Conteúdo */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#e8f6f5] text-[#147a7c] text-[12px] font-bold uppercase tracking-wider">
              <Award className="w-4 h-4" />
              Direção Laboratorial & Fundadora
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-[28px] sm:text-[36px] font-bold leading-tight text-[#0b2240]">
                Dra. Kerollyn Isabela Macedo Passos Silva
              </h3>
              <p className="text-[15px] font-semibold text-[#1d9496]">
                Biomédica Patologista Clínica • Proprietária do Laboratório VetLife
              </p>
            </div>

            <div className="space-y-4 text-[17px] leading-[1.58] text-[#5b6675]">
              <p>
                À frente do <strong className="text-[#0b2240] font-semibold">VetLife</strong> em
                São Sebastião do Paraíso e região, a{' '}
                <strong className="text-[#0b2240] font-semibold">
                  Dra. Kerollyn Isabela Macedo Passos Silva
                </strong>{' '}
                conduz a rotina laboratorial com olhar clínico atento e rigor analítico em cada
                amostra recebida.
              </p>
              <p>
                Cada lâmina hematológica, esfregaço citológico e perfil bioquímico passa por revisão
                técnica individualizada, assegurando que o médico veterinário requisitante tenha
                respaldo seguro para tomar decisões clínicas rápidas e precisas.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-[#f5f5f7] flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#1d9496] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[14px] font-bold text-[#0b2240]">
                    Revisão Lâmina a Lâmina
                  </div>
                  <div className="text-[13px] text-[#5b6675]">
                    Conferência morfológica especializada em todas as rotinas.
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-2xl bg-[#f5f5f7] flex items-start gap-3">
                <Stethoscope className="w-5 h-5 text-[#1d9496] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[14px] font-bold text-[#0b2240]">
                    Assessoria ao Veterinário
                  </div>
                  <div className="text-[13px] text-[#5b6675]">
                    Canal direto com a bancada para discussão de casos clínicos.
                  </div>
                </div>
              </div>
            </div>

            {/* Responsável Técnica (RT) — Dra. Maysa Barbosa de Almeida */}
            <div className="p-5 rounded-2xl bg-[#f5f5f7] border border-slate-200/80 space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#e8f6f5] text-[#147a7c] text-[11px] font-bold uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5" />
                Responsável Técnica (RT)
              </div>
              <div className="text-[17px] font-bold text-[#0b2240]">
                Dra. Maysa Barbosa de Almeida
              </div>
              <div className="text-[13px] font-semibold text-[#1d9496]">
                Médica Veterinária • Responsável Técnica & Leitura de Citologias
              </div>
              <p className="text-[14px] leading-[1.55] text-[#5b6675]">
                Médica Veterinária e Responsável Técnica do laboratório, a{' '}
                <strong className="text-[#0b2240] font-semibold">
                  Dra. Maysa Barbosa de Almeida
                </strong>{' '}
                também realiza a leitura e interpretação especializada das citologias, garantindo
                rigor diagnóstico em cada exame citopatológico.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO "SERVIÇOS E ESPECIALIDADES"
         ===================================================================== */}
      <section id="servicos" className="max-w-[1240px] mx-auto space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#1d9496]">
              Catálogo Diagnóstico
            </span>
            <h2 className="font-display text-[32px] sm:text-[48px] font-bold leading-[1.08] tracking-tight text-[#0b2240]">
              Serviços e especialidades.
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('vet')}
            className="inline-flex items-center gap-1 text-[16px] font-semibold text-[#147a7c] hover:opacity-80 transition"
          >
            Portal do Médico Veterinário
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {technicalSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.title}
                className="bg-white rounded-[28px] p-7 border border-slate-200/70 flex flex-col justify-between space-y-8"
              >
                <div className="space-y-4">
                  <div className="w-12 h-12 rounded-full bg-[#f5f5f7] flex items-center justify-center text-[#0b2240]">
                    <Icon className="w-5 h-5 stroke-[1.75] text-[#1d9496]" />
                  </div>
                  <h3 className="font-display text-[22px] font-bold leading-[1.2] text-[#0b2240]">
                    {sec.title}
                  </h3>
                  <p className="text-[16px] font-normal leading-[1.5] text-[#5b6675]">{sec.desc}</p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="px-3 py-1 rounded-full bg-[#f5f5f7] text-[12px] text-[#0b2240] font-semibold">
                    Prazo: {sec.sla}
                  </span>
                  <span className="text-[12px] text-[#7b8694] font-medium">{sec.tube}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO "GUIA DE COLETA"
         ===================================================================== */}
      <section id="guia-coleta" className="max-w-[1240px] mx-auto space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#1d9496]">
              Fase Pré-Analítica
            </span>
            <h2 className="font-display text-[32px] sm:text-[48px] font-bold leading-[1.08] tracking-tight text-[#0b2240]">
              Guia de coleta.
            </h2>
          </div>
          <span className="text-[16px] text-[#5b6675]">
            Padronização pré-analítica de tubos e conservação de amostras.
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {collectionGuideItems.map((item) => (
            <div
              key={item.badge}
              className="bg-white rounded-[28px] p-7 border border-slate-200/70 flex flex-col justify-between space-y-6"
            >
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f5f5f7] text-[12px] font-semibold text-[#0b2240]">
                  <span className={`w-2.5 h-2.5 rounded-full ${item.dotColor}`} />
                  {item.badge}
                </div>
                <h3 className="font-display text-[20px] font-bold leading-[1.2] text-[#0b2240]">
                  {item.title}
                </h3>
                <p className="text-[16px] leading-[1.5] text-[#5b6675]">{item.desc}</p>
              </div>
              <div className="text-[12px] text-[#147a7c] font-semibold flex items-center gap-1.5 pt-2 border-t border-slate-100">
                <TestTube2 className="w-3.5 h-3.5" />
                {item.thermalControl}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO "SOLICITAÇÃO DE COLETA"
         ===================================================================== */}
      <section id="solicitar-coleta" className="max-w-[1240px] mx-auto">
        <div className="bg-white rounded-[32px] p-7 sm:p-12 border border-slate-200/70 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
          <div className="lg:col-span-5 flex flex-col justify-between space-y-8">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f5f5f7] text-[12px] font-semibold text-[#0b2240]">
                <Truck className="w-3.5 h-3.5 text-[#1d9496]" />
                Logística Refrigerada
              </span>
              <h2 className="font-display text-[32px] sm:text-[40px] font-bold leading-[1.1] text-[#0b2240]">
                Solicitar coleta na sua clínica.
              </h2>
              <p className="text-[17px] leading-[1.5] text-[#5b6675]">
                Nossa equipe realiza a retirada programada de amostras biológicas com controle
                térmico rigoroso e disponibiliza os laudos em PDF assim que liberados pela bancada
                biomédica.
              </p>
            </div>

            <div className="space-y-1.5 p-5 rounded-2xl bg-[#f5f5f7] text-[13px] text-[#5b6675]">
              <div className="text-[#0b2240] font-bold">Central de Atendimento VetLife</div>
              <div>R. La Salles, 424 - Mocoquinha</div>
              <div>São Sebastião do Paraíso - MG, 37950-000</div>
              <div className="text-[#147a7c] font-semibold pt-1">
                Recepção & Área Técnica: (35) 98458-1997
              </div>
              <div className="text-[#0b2240] font-medium">
                Financeiro (Orçamentos/Pagamentos): +55 35 98445-1372
              </div>
            </div>
          </div>

          <div className="lg:col-span-7">
            {collectionSuccess && (
              <div className="mb-6 p-4 rounded-2xl bg-[#e8f6f5] text-[#0b2240] text-[15px] flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#1d9496] shrink-0 mt-0.5" />
                <div>{collectionSuccess}</div>
              </div>
            )}

            <form onSubmit={handleCollectionSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#5b6675] mb-1.5">
                    Clínica ou Responsável *
                  </label>
                  <input
                    type="text"
                    required
                    value={collectionForm.clinic_or_tutor_name}
                    onChange={(e) =>
                      setCollectionForm({ ...collectionForm, clinic_or_tutor_name: e.target.value })
                    }
                    placeholder="Nome da clínica ou responsável"
                    className="w-full px-4 py-3 rounded-2xl bg-[#f5f5f7] text-[#0b2240] placeholder:text-[#7b8694] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#5b6675] mb-1.5">
                    Telefone / WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    value={collectionForm.phone}
                    onChange={(e) => setCollectionForm({ ...collectionForm, phone: e.target.value })}
                    placeholder="(35) 98458-1997"
                    className="w-full px-4 py-3 rounded-2xl bg-[#f5f5f7] text-[#0b2240] placeholder:text-[#7b8694] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#5b6675] mb-1.5">
                    E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    value={collectionForm.email}
                    onChange={(e) => setCollectionForm({ ...collectionForm, email: e.target.value })}
                    placeholder="contato@clinica.com.br"
                    className="w-full px-4 py-3 rounded-2xl bg-[#f5f5f7] text-[#0b2240] placeholder:text-[#7b8694] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#5b6675] mb-1.5">
                    Data Preferencial
                  </label>
                  <input
                    type="date"
                    value={collectionForm.preferred_date}
                    onChange={(e) =>
                      setCollectionForm({ ...collectionForm, preferred_date: e.target.value })
                    }
                    className="w-full px-4 py-3 rounded-2xl bg-[#f5f5f7] text-[#0b2240] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#5b6675] mb-1.5">
                  Endereço Completo *
                </label>
                <input
                  type="text"
                  required
                  value={collectionForm.address}
                  onChange={(e) =>
                    setCollectionForm({ ...collectionForm, address: e.target.value })
                  }
                  placeholder="Rua, número, complemento, bairro e cidade"
                  className="w-full px-4 py-3 rounded-2xl bg-[#f5f5f7] text-[#0b2240] placeholder:text-[#7b8694] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                />
              </div>

              <div>
                <label className="block text-[12px] font-semibold text-[#5b6675] mb-1.5">
                  Observações sobre as amostras
                </label>
                <textarea
                  rows={3}
                  value={collectionForm.notes}
                  onChange={(e) => setCollectionForm({ ...collectionForm, notes: e.target.value })}
                  placeholder="Informe tipos de amostra, quantidade de tubos ou urgência"
                  className="w-full px-4 py-3 rounded-2xl bg-[#f5f5f7] text-[#0b2240] placeholder:text-[#7b8694] text-[15px] focus:outline-none focus:ring-2 focus:ring-[#1d9496]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingCollection}
                  className="px-7 py-3 rounded-full bg-[#1d9496] hover:bg-[#147a7c] text-white text-[15px] font-semibold transition disabled:opacity-50"
                >
                  {submittingCollection ? 'Enviando...' : 'Solicitar Coleta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* =====================================================================
          SEÇÃO "CONTATO"
         ===================================================================== */}
      <section id="contato" className="max-w-[1240px] mx-auto space-y-10">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[12px] font-bold uppercase tracking-wider text-[#1d9496]">
              Atendimento
            </span>
            <h2 className="font-display text-[32px] sm:text-[48px] font-bold leading-[1.08] tracking-tight text-[#0b2240]">
              Contato.
            </h2>
          </div>
          <a
            href="https://wa.me/5535984581997"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[16px] font-semibold text-[#147a7c] hover:opacity-80 transition"
          >
            Falar no WhatsApp (35) 98458-1997
            <ChevronRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-[28px] p-7 border border-slate-200/70 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#f5f5f7] flex items-center justify-center text-[#1d9496]">
              <MapPin className="w-5 h-5" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#0b2240]">Endereço.</h3>
            <p className="text-[16px] leading-[1.5] text-[#5b6675]">
              R. La Salles, 424 — Mocoquinha
              <br />
              São Sebastião do Paraíso — MG, 37950-000
            </p>
          </div>

          <div className="bg-white rounded-[28px] p-7 border border-slate-200/70 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#f5f5f7] flex items-center justify-center text-[#1d9496]">
              <Phone className="w-5 h-5" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#0b2240]">
              Telefone & WhatsApp.
            </h3>
            <div className="text-[15px] leading-[1.6] text-[#5b6675] space-y-2">
              <div>
                Recepção e Área Técnica:
                <br />
                <a
                  href="https://wa.me/5535984581997"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#147a7c] font-semibold hover:underline"
                >
                  (35) 98458-1997
                </a>
              </div>
              <div>
                Financeiro (Orçamentos e Pagamentos):
                <br />
                <a
                  href="https://wa.me/5535984451372"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#0b2240] font-semibold hover:underline"
                >
                  +55 35 98445-1372
                </a>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[28px] p-7 border border-slate-200/70 space-y-4">
            <div className="w-12 h-12 rounded-full bg-[#f5f5f7] flex items-center justify-center text-[#1d9496]">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-display text-[20px] font-bold text-[#0b2240]">
              Atendimento & Laudos.
            </h3>
            <p className="text-[15px] leading-[1.6] text-[#5b6675]">
              Segunda a Sexta: <strong className="text-[#0b2240]">09:00 - 17:00 hrs</strong>
              <br />
              Sábado: <strong className="text-[#0b2240]">09:00 - 11:00 hrs</strong>
              <br />
              <span className="text-[#147a7c] font-semibold">
                Plantões em qualquer horário que precisar.
              </span>
              <br />
              Consulta de laudos online 24h.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
