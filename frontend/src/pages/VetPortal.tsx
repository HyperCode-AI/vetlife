import React, { useEffect, useState } from 'react';
import {
  Stethoscope,
  LogOut,
  FileDown,
  Search,
  Printer,
} from 'lucide-react';
import { Order, Vet } from '../types';
import { api, formatAgeLabel, resolveSideBySideReference } from '../services/api';
import { downloadOrderPdf, printFormattedReportWindow } from '../utils/pdfGenerator';

interface VetPortalProps {
  onLogout?: () => void;
}

export const VetPortal: React.FC<VetPortalProps> = ({ onLogout }) => {
  const [vet, setVet] = useState<Vet | null>(() =>
    api.hasValidSession('vet') ? api.getCurrentVet() : null
  );
  const isLabStaff = api.hasValidSession('internal');
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const loadVetOrders = async (vetId?: string) => {
    const list = await api.getVetOrders(vetId);
    setOrders(list);
    if (list.length > 0 && !selectedOrder) {
      setSelectedOrder(list[0]);
    }
  };

  useEffect(() => {
    if (api.hasValidSession('vet')) {
      loadVetOrders(vet?.id);
    }
  }, [vet]);

  const handleLogout = () => {
    api.logout();
    setVet(null);
    setSelectedOrder(null);
    onLogout?.();
  };

  if (!api.hasValidSession('vet')) {
    return null;
  }

  const filteredOrders = orders.filter((o) => {
    const matchesStatus = statusFilter === 'todos' || o.status === statusFilter;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      !term ||
      o.protocol_code.toLowerCase().includes(term) ||
      (o.patient?.name || '').toLowerCase().includes(term) ||
      (o.patient?.tutor_name || '').toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-5 sm:space-y-8 py-6 sm:py-10 pb-20 sm:pb-24">
      {/* BARRA DO VETERINÁRIO LOGADO */}
      <div className="bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5 sm:gap-4 min-w-0">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-[999px] bg-[#f5f5f7] text-[#1d1d1f] flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-[20px] sm:text-[24px] font-semibold text-[#1d1d1f] leading-tight">
                {vet ? vet.name : 'Visualização Laboratorial — Portal do Veterinário'}
              </h1>
              {vet?.crmv && (
                <span className="px-[10px] py-[4px] rounded-[999px] bg-[#f5f5f7] font-mono text-[11px] sm:text-[12px] text-[#1d1d1f] shrink-0">
                  {vet.crmv}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#707070] mt-0.5 break-words">
              {vet
                ? `${vet.clinic_name} • ${vet.email}`
                : isLabStaff
                ? 'Acesso corporativo autenticado do laboratório'
                : ''}
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="px-5 py-2 rounded-[980px] border border-[#1d1d1f] text-[#1d1d1f] text-[12px] hover:bg-[#1d1d1f] hover:text-white transition inline-flex items-center gap-2 self-start sm:self-auto shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sair
        </button>
      </div>

      {/* LISTAGEM DE EXAMES SOLICITADOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6">
        <div className="lg:col-span-7 bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px] space-y-5 sm:space-y-6">
          <div className="space-y-3.5 sm:space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[20px] sm:text-[24px] font-semibold text-[#1d1d1f]">
                Exames Solicitados ({filteredOrders.length})
              </h2>
              <span className="text-[12px] text-[#86868b]">Download direto em PDF</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#86868b] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por protocolo, paciente ou tutor..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-[980px] bg-[#f5f5f7] text-[12px] text-[#1d1d1f] placeholder:text-[#86868b] focus:outline-none focus:ring-2 focus:ring-[#0071e3]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2.5 rounded-[980px] bg-[#f5f5f7] text-[12px] text-[#1d1d1f] focus:outline-none"
              >
                <option value="todos">Todos os Status</option>
                <option value="concluido">Concluídos</option>
                <option value="em_analise">Em Análise</option>
                <option value="pendente">Pendentes</option>
              </select>
            </div>
          </div>

          <div className="space-y-3">
            {filteredOrders.map((ord) => (
              <div
                key={ord.id}
                onClick={() => setSelectedOrder(ord)}
                className={`p-4 sm:p-5 rounded-[22px] sm:rounded-[25px] cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 ${
                  selectedOrder?.id === ord.id ? 'bg-[#e8e8ed]' : 'bg-[#f5f5f7] hover:bg-[#e8e8ed]/70'
                }`}
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-[#1d1d1f]">
                      {ord.protocol_code}
                    </span>
                    <span className="px-[10px] py-[4px] rounded-[999px] bg-white text-[11px] sm:text-[12px] text-[#1d1d1f]">
                      {ord.status === 'concluido'
                        ? 'Concluído'
                        : ord.status === 'em_analise'
                        ? 'Em Análise'
                        : 'Pendente'}
                    </span>
                  </div>
                  <div className="font-display text-[17px] sm:text-[19px] font-semibold text-[#1d1d1f]">
                    {ord.patient?.name}{' '}
                    <span className="font-sans font-normal text-[12px] text-[#707070]">
                      ({ord.patient?.species} • {ord.patient?.breed} • Tutor:{' '}
                      {ord.patient?.tutor_name})
                    </span>
                  </div>
                  <div className="text-[12px] text-[#86868b] break-words">
                    Exames: {(ord.results || []).map((r) => r.exam_code).join(', ')}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {ord.status === 'concluido' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadOrderPdf(ord);
                      }}
                      className="w-full sm:w-auto justify-center px-4 py-2 rounded-[980px] bg-[#0071e3] text-white text-[12px] font-normal inline-flex items-center gap-1.5 hover:opacity-95 transition"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Baixar PDF
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 rounded-[980px] bg-white text-[#707070] text-[11px] font-medium">
                      Aguardando liberação
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PREVIEW DO LAUDO SELECIONADO */}
        <div className="lg:col-span-5 bg-white rounded-[24px] sm:rounded-[28px] p-4 sm:p-[28px]">
          {selectedOrder ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-[#e5e5ea]">
                <div className="flex items-start gap-3 min-w-0">
                  <img
                    src="/images/vetlife-logo.jpg"
                    alt="VetLife"
                    className="w-10 h-10 rounded-xl object-contain bg-white p-0.5 border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <span className="text-[12px] font-mono text-[#86868b]">
                      {selectedOrder.protocol_code}
                    </span>
                    <h3 className="font-display text-[20px] sm:text-[22px] font-semibold text-[#1d1d1f] leading-tight">
                      {selectedOrder.patient?.name} ({selectedOrder.patient?.species})
                    </h3>
                    <p className="text-[12px] text-[#707070] mt-0.5">
                      Idade:{' '}
                      {formatAgeLabel(
                        selectedOrder.patient?.age_days,
                        selectedOrder.patient?.birth_date
                      )}{' '}
                      • Tutor: {selectedOrder.patient?.tutor_name}
                    </p>
                  </div>
                </div>
                {selectedOrder.status === 'concluido' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => downloadOrderPdf(selectedOrder)}
                      className="px-4 py-2 rounded-[980px] bg-[#0071e3] text-white text-[12px] inline-flex items-center gap-1.5"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      PDF
                    </button>
                    <button
                      onClick={() => printFormattedReportWindow(selectedOrder)}
                      className="p-2.5 rounded-[980px] bg-[#f5f5f7] hover:bg-[#e8e8ed] text-[#1d1d1f]"
                      title="Imprimir Laudo"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                {selectedOrder.status !== 'concluido' ? (
                  <div className="p-5 rounded-[22px] bg-[#f5f5f7] text-center space-y-2">
                    <div className="font-display text-[16px] font-semibold text-[#1d1d1f]">
                      Exame em análise técnica na bancada
                    </div>
                    <p className="text-[12px] text-[#707070]">
                      O laudo e os resultados parametrizados serão disponibilizados assim que a equipe biomédica finalizar e liberar o protocolo.
                    </p>
                  </div>
                ) : (
                  (selectedOrder.results || []).map((res) => {
                    const fields = res.input_fields || res.exam?.input_fields || [];
                    const refText =
                      res.reference_snapshot ||
                      res.matched_reference?.reference_text_content ||
                      'Referência padrão';
                    return (
                      <div key={res.id} className="p-4 sm:p-5 rounded-[22px] sm:rounded-[25px] bg-[#f5f5f7] space-y-3">
                        <div className="font-display text-[16px] sm:text-[18px] font-semibold text-[#1d1d1f]">
                          [{res.exam_code || res.exam?.code}] {res.exam_name || res.exam?.name}
                        </div>
                        {Object.entries(res.dynamic_content || {}).length === 0 ? (
                          <div className="text-[12px] text-[#707070]">Em processamento laboratorial.</div>
                        ) : (
                          <div className="bg-white rounded-[18px] p-3 overflow-x-auto">
                            <table className="w-full text-left border-collapse text-[12px]">
                              <thead>
                                <tr className="text-[10px] uppercase text-[#86868b] border-b border-[#e8e8ed]">
                                  <th className="pb-2 pr-2 font-semibold">Parâmetro</th>
                                  <th className="pb-2 px-2 font-semibold">Resultado</th>
                                  <th className="pb-2 pl-2 font-semibold">Referência</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#f0f0f5]">
                                {Object.entries(res.dynamic_content).map(([k, v]) => {
                                  const fMeta = fields.find((f) => f.field_name === k);
                                  const rawLabel = fMeta?.field_label || k;
                                  const unit = fMeta?.unit ? ` ${fMeta.unit}` : '';
                                  const sideRef = resolveSideBySideReference(k, rawLabel, refText);
                                  return (
                                    <tr key={k}>
                                      <td className="py-1.5 pr-2 font-medium text-[#1d1d1f]">
                                        {rawLabel}
                                      </td>
                                      <td className="py-1.5 px-2 font-mono font-bold text-[#0f766e]">
                                        {String(v)}{unit}
                                      </td>
                                      <td className="py-1.5 pl-2 text-[11px] text-[#5b6675]">
                                        {sideRef}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-[#86868b] text-[15px] sm:text-[17px]">
              Selecione um atendimento ao lado para inspecionar o laudo completo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
