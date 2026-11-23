import React, { useEffect, useState } from 'react';
import {
  Search,
  FileDown,
  Printer,
  AlertCircle,
  Paperclip,
  ExternalLink,
  Clock,
  ChevronDown,
} from 'lucide-react';
import { Exam, Order } from '../types';
import { api, formatAgeLabel, resolveSideBySideReference } from '../services/api';
import { downloadOrderPdf, printFormattedReportWindow } from '../utils/pdfGenerator';

interface TutorPortalProps {
  initialProtocol?: string;
}

export const TutorPortal: React.FC<TutorPortalProps> = ({ initialProtocol }) => {
  const [protocolCode, setProtocolCode] = useState(initialProtocol || '');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedResultIds, setExpandedResultIds] = useState<string[]>([]);

  const fetchProtocol = async (codeToSearch: string) => {
    const clean = codeToSearch.trim();
    if (!clean) {
      setOrder(null);
      setExpandedResultIds([]);
      setError('Informe o código de protocolo presente no seu comprovante de atendimento.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.getPublicProtocol(clean);
      setOrder(result);
      const resList = result.results || [];
      setExpandedResultIds(resList.length === 1 ? [resList[0].id] : []);
    } catch (err: any) {
      setOrder(null);
      setExpandedResultIds([]);
      setError(err.message || 'Protocolo não localizado.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialProtocol && initialProtocol.trim()) {
      setProtocolCode(initialProtocol);
      fetchProtocol(initialProtocol);
    } else {
      setProtocolCode('');
      setOrder(null);
      setExpandedResultIds([]);
      setError(null);
    }
  }, [initialProtocol]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProtocol(protocolCode);
  };

  const toggleResult = (id: string) => {
    setExpandedResultIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleDownloadFullPdf = (ord: Order) => {
    if (ord.pdf_url && /^https?:\/\//i.test(ord.pdf_url) && !ord.pdf_url.includes('/public/protocol/')) {
      window.open(ord.pdf_url, '_blank', 'noopener,noreferrer');
      return;
    }
    downloadOrderPdf(ord);
  };

  const handleDownloadSingleExamPdf = (ord: Order, res: NonNullable<Order['results']>[number]) => {
    if (res.pdf_url && /^https?:\/\//i.test(res.pdf_url) && !res.pdf_url.includes('/public/protocol/')) {
      window.open(res.pdf_url, '_blank', 'noopener,noreferrer');
      return;
    }
    downloadOrderPdf({ ...ord, results: [res] });
  };

  const resolveExamMeta = (res: NonNullable<Order['results']>[number]) => {
    const catalogExam: Exam | undefined = res.exam;
    return {
      code: res.exam_code || catalogExam?.code || 'EXM',
      name: res.exam_name || catalogExam?.name || 'Exame Laboratorial',
      section: res.section || catalogExam?.section || 'Diagnóstico',
      fields: res.input_fields?.length ? res.input_fields : catalogExam?.input_fields || [],
    };
  };

  const renderStatusChip = (status: Order['status']) => {
    if (status === 'concluido') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
          Laudo Liberado
        </span>
      );
    }
    if (status === 'em_analise') {
      return (
        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
          Em Análise
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-semibold">
        Amostra Recebida
      </span>
    );
  };

  const results = order?.results || [];

  return (
    <div className="max-w-[1100px] mx-auto space-y-4 sm:space-y-5 py-4 sm:py-6 pb-16 px-0 sm:px-4">
      {/* BUSCA COMPACTA POR PROTOCOLO */}
      <div className="bg-white rounded-[24px] p-4 sm:p-5 space-y-3 border border-black/5">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-[24px] sm:text-[32px] font-semibold leading-tight text-[#1d1d1f]">
              Consulta de Resultados
            </h1>
            <p className="text-[13px] text-[#707070] mt-0.5">
              Informe o código de protocolo do comprovante de atendimento para visualizar e baixar o laudo oficial em PDF.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#86868b] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={protocolCode}
              onChange={(e) => setProtocolCode(e.target.value)}
              placeholder="Ex: VET-2026-0001"
              className="w-full h-11 sm:h-10 pl-10 pr-4 rounded-full bg-[#f5f5f7] font-mono text-[14px] uppercase text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="h-11 sm:h-10 px-6 rounded-full bg-[#0071e3] text-white text-[13px] font-semibold hover:opacity-95 transition shrink-0 cursor-pointer"
          >
            {loading ? 'Consultando...' : 'Consultar Resultado'}
          </button>
        </form>
      </div>

      {/* ERRO SE PROTOCOLO NÃO EXISTIR */}
      {error && (
        <div className="bg-white rounded-[24px] p-4 sm:p-5 text-[#1d1d1f] flex items-start sm:items-center gap-3 border border-black/5">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5 sm:mt-0" />
          <div>
            <div className="font-display text-[16px] font-semibold">Protocolo não encontrado</div>
            <div className="text-[13px] text-[#707070]">{error}</div>
          </div>
        </div>
      )}

      {/* Cabeçalho Institucional no topo do Laudo Público */}
      {order && (
        <div className="bg-white rounded-[24px] p-4 sm:p-6 space-y-5 border border-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#e5e5ea]">
            <div className="flex items-center gap-3">
              <img
                src="/images/vetlife-logo.jpg"
                alt="VetLife"
                className="w-11 h-11 rounded-xl object-contain bg-white p-0.5 border border-slate-200/80 shadow-sm shrink-0"
              />
              <div>
                <div className="font-display text-[17px] sm:text-[19px] font-bold text-[#0b2240]">
                  VetLife Diagnósticos Veterinários
                </div>
                <div className="text-[11.5px] text-[#707070]">
                  Laudo Laboratorial Oficial • vetlifelab.com.br
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[13px] font-bold text-[#0b2240] bg-[#f5f5f7] px-3 py-1 rounded-full">
                {order.protocol_code}
              </span>
              {renderStatusChip(order.status)}
            </div>
          </div>

          {/* Cabeçalho Compacto */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#e5e5ea]">
            <div className="space-y-1">
              <h2 className="font-display text-[20px] sm:text-[24px] font-semibold leading-tight text-[#1d1d1f]">
                {order.patient?.name}{' '}
                <span className="text-[14px] sm:text-[15px] font-normal text-[#707070]">
                  ({order.patient?.species} • {order.patient?.breed})
                </span>
              </h2>
            </div>

            {order.status === 'concluido' && (
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadFullPdf(order)}
                  className="flex-1 sm:flex-initial justify-center h-9 px-4 rounded-full bg-[#0071e3] text-white text-[12px] font-semibold inline-flex items-center gap-1.5 hover:opacity-95 transition cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 shrink-0" />
                  <span>Baixar PDF Completo</span>
                </button>
                <button
                  type="button"
                  onClick={() => printFormattedReportWindow(order)}
                  className="flex-1 sm:flex-initial justify-center h-9 px-4 rounded-full border border-[#1d1d1f] text-[#1d1d1f] text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#1d1d1f] hover:text-white transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Imprimir Completo</span>
                </button>
              </div>
            )}
          </div>

          {/* Informações Clínicas Compactas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
            <div className="bg-[#f5f5f7] p-3.5 rounded-2xl space-y-0.5">
              <div className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">
                Paciente
              </div>
              <div className="font-semibold text-[#1d1d1f]">
                {order.patient?.name} • {order.patient?.gender === 'F' ? 'Fêmea' : 'Macho'} •{' '}
                {formatAgeLabel(order.patient?.age_days, order.patient?.birth_date)}
              </div>
              {order.patient?.tutor_name && (
                <div className="text-[#707070]">Responsável: {order.patient.tutor_name}</div>
              )}
            </div>

            <div className="bg-[#f5f5f7] p-3.5 rounded-2xl space-y-0.5">
              <div className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">
                Veterinário Solicitante
              </div>
              <div className="font-semibold text-[#1d1d1f]">
                {order.vet?.name} <span className="font-mono text-[11px]">({order.vet?.crmv})</span>
              </div>
              <div className="text-[#707070]">{order.vet?.clinic_name}</div>
            </div>

            <div className="bg-[#f5f5f7] p-3.5 rounded-2xl space-y-0.5">
              <div className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider">
                Emissão & Verificação
              </div>
              <div className="font-semibold text-[#1d1d1f]">
                {order.released_at
                  ? `Liberado em ${new Date(order.released_at).toLocaleDateString('pt-BR')}`
                  : 'Em processamento'}
              </div>
              <div className="text-[#707070]">
                Pedido: {new Date(order.created_at).toLocaleDateString('pt-BR')} • vetlifelab.com.br
              </div>
            </div>
          </div>

          {/* Resultados — liberado apenas quando TODO o atendimento estiver concluído */}
          {order.status !== 'concluido' ? (
            <div className="bg-[#f5f5f7] rounded-2xl p-6 text-center space-y-2.5">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white text-[#0071e3] shadow-sm">
                <Clock className="w-5 h-5" />
              </div>
              <h3 className="font-display text-[18px] font-semibold text-[#1d1d1f]">
                Atendimento em processamento no laboratório
              </h3>
              <p className="text-[13px] text-[#707070] max-w-xl mx-auto">
                Os resultados e o laudo oficial em PDF ficarão disponíveis neste portal assim que{' '}
                <strong>todos os exames</strong> deste protocolo forem concluídos e liberados pela
                nossa equipe biomédica.
              </p>
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white text-[11px] font-semibold text-[#1d1d1f]">
                Exames concluídos: {results.filter((r) => Boolean(r.released_at)).length} de{' '}
                {results.length}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[12px] font-semibold uppercase tracking-wider text-[#86868b]">
                  Exames do Atendimento ({results.length})
                  {results.length > 1 && (
                    <span className="ml-2 font-normal normal-case text-[#707070]">
                      — Clique em um exame para visualizar os resultados ou baixe individualmente
                    </span>
                  )}
                </div>
                {results.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedResultIds(
                        expandedResultIds.length === results.length ? [] : results.map((r) => r.id)
                      )
                    }
                    className="px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[11px] font-semibold text-[#1d1d1f] transition cursor-pointer"
                  >
                    {expandedResultIds.length === results.length
                      ? 'Recolher Todos'
                      : 'Expandir Todos'}
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {results.map((res) => {
                  const meta = resolveExamMeta(res);
                  const isOpen = expandedResultIds.includes(res.id);
                  const entries = Object.entries(res.dynamic_content || {});

                  return (
                    <div
                      key={res.id}
                      className="rounded-2xl bg-[#f5f5f7] border border-black/5 overflow-hidden"
                    >
                      {/* Cabeçalho do Dropdown do Exame */}
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleResult(res.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleResult(res.id);
                          }
                        }}
                        className="w-full px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-[#ececf0] transition cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="px-2.5 py-0.5 rounded-full bg-white font-mono text-[11px] font-bold text-[#0071e3] shrink-0">
                            {meta.code}
                          </span>
                          <span className="font-display text-[15px] font-semibold text-[#1d1d1f] truncate">
                            {meta.name}
                          </span>
                          <span className="hidden sm:inline text-[11px] text-[#86868b] shrink-0">
                            • {meta.section}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownloadSingleExamPdf(order, res);
                            }}
                            className="h-7 px-3 rounded-full bg-white hover:bg-[#0b2240] hover:text-white text-[#1d1d1f] text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer shadow-sm"
                          >
                            <FileDown className="w-3 h-3" />
                            PDF do Exame
                          </button>
                          <ChevronDown
                            className={`w-4 h-4 text-[#5b6675] transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {/* Conteúdo Expandido do Exame */}
                      {isOpen && (
                        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-black/5 bg-[#f5f5f7]">
                          {entries.length === 0 ? (
                            <div className="bg-white rounded-xl p-3 text-[12px] text-[#707070]">
                              Este exame encontra-se em processamento técnico no laboratório.
                            </div>
                          ) : (
                            <div className="bg-white rounded-xl p-3 overflow-x-auto">
                              <table className="w-full text-left border-collapse text-[12px]">
                                <thead>
                                  <tr className="text-[10px] uppercase text-[#86868b] border-b border-[#e8e8ed]">
                                    <th className="pb-2 pr-3 font-semibold">Parâmetro Analisado</th>
                                    <th className="pb-2 px-3 font-semibold">Resultado Obtido</th>
                                    <th className="pb-2 pl-3 font-semibold">
                                      Valor de Referência ({order.patient?.species})
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f0f0f5]">
                                  {entries.map(([key, val]) => {
                                    const fieldMeta = meta.fields.find((f) => f.field_name === key);
                                    const rawLabel = fieldMeta?.field_label || key;
                                    const unit = fieldMeta?.unit ? ` ${fieldMeta.unit}` : '';
                                    const refText =
                                      res.reference_snapshot ||
                                      res.matched_reference?.reference_text_content ||
                                      'Referência padrão da espécie.';
                                    const sideRef = resolveSideBySideReference(key, rawLabel, refText);
                                    return (
                                      <tr key={key}>
                                        <td className="py-2 pr-3 text-[#1d1d1f] font-medium">
                                          {rawLabel}
                                        </td>
                                        <td className="py-2 px-3 font-mono font-bold text-[#0f766e]">
                                          {String(val)}{unit}
                                        </td>
                                        <td className="py-2 pl-3 text-[11.5px] text-[#5b6675]">
                                          {sideRef}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* Valor de Referência */}
                          <div className="bg-white rounded-xl p-3 space-y-0.5 text-[11px]">
                            <div className="font-semibold text-[#1d1d1f]">
                              Valores de Referência ({order.patient?.species}, Sexo{' '}
                              {order.patient?.gender},{' '}
                              {formatAgeLabel(order.patient?.age_days, order.patient?.birth_date)}):
                            </div>
                            <div className="text-[#707070] leading-snug">
                              {res.reference_snapshot ||
                                res.matched_reference?.reference_text_content ||
                                'Valores de referência compatíveis com a espécie e faixa etária.'}
                            </div>
                          </div>

                          {/* Anexos Complementares */}
                          {res.attachments && res.attachments.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold text-[#1d1d1f]">
                                Anexos ({res.attachments.length}):
                              </span>
                              {res.attachments.map((att) => (
                                <a
                                  key={att.id}
                                  href={att.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-[11px] text-[#0066cc] hover:opacity-80 transition"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  {att.name}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
