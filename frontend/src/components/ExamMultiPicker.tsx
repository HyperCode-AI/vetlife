import React, { useMemo, useState } from 'react';
import { Check, Maximize2, Search, Sparkles, Trash2, X } from 'lucide-react';
import { Exam, PriceTable } from '../types';

export interface ExamMultiPickerProps {
  exams: Exam[];
  selectedExamIds: string[];
  onChange: (nextIds: string[]) => void;
  activePriceTable?: PriceTable | null;
  title?: string;
  compact?: boolean;
  hideHeaderSummary?: boolean;
}

export function ExamMultiPicker({
  exams,
  selectedExamIds,
  onChange,
  activePriceTable,
  title = 'Selecionar Exames Solicitados',
  compact = false,
  hideHeaderSummary = false,
}: ExamMultiPickerProps) {
  const [query, setQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [onlySelected, setOnlySelected] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const getExamPrice = (ex: Exam) => {
    const entry = (activePriceTable?.prices || activePriceTable?.items || []).find(
      (p) => p.exam_id === ex.id,
    );
    return entry?.price ?? ex.price ?? ex.base_price ?? 0;
  };

  const sections = useMemo(() => {
    const set = new Set<string>();
    exams.forEach((e) => {
      if (e.section) set.add(e.section);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [exams]);

  const validSelectedIds = useMemo(
    () => selectedExamIds.filter((id) => exams.some((e) => e.id === id)),
    [selectedExamIds, exams],
  );

  const selectedExams = useMemo(
    () =>
      validSelectedIds
        .map((id) => exams.find((e) => e.id === id))
        .filter((e): e is Exam => Boolean(e)),
    [validSelectedIds, exams],
  );

  const totalValue = useMemo(
    () => selectedExams.reduce((sum, ex) => sum + getExamPrice(ex), 0),
    [selectedExams, activePriceTable],
  );

  const filteredExams = useMemo(() => {
    const q = query.trim().toLowerCase();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    return exams.filter((ex) => {
      if (onlySelected && !validSelectedIds.includes(ex.id)) return false;
      if (sectionFilter !== 'ALL' && ex.section !== sectionFilter) return false;
      if (tokens.length === 0) return true;
      const hay = `${ex.code} ${ex.name} ${ex.section || ''} ${ex.tube_type || ''}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [exams, query, sectionFilter, onlySelected, validSelectedIds]);

  const toggleExam = (examId: string) => {
    if (validSelectedIds.includes(examId)) {
      const next = validSelectedIds.filter((id) => id !== examId);
      onChange(next);
      if (next.length === 0 && onlySelected) {
        setOnlySelected(false);
      }
    } else {
      onChange([...validSelectedIds, examId]);
    }
  };

  const handleClearAll = () => {
    onChange([]);
    setOnlySelected(false);
  };

  const renderPickerBody = (isModal: boolean) => (
    <div className={compact && !isModal ? 'space-y-2.5' : 'space-y-3'}>
      {/* Header + Stats */}
      {(!hideHeaderSummary || isModal) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-semibold text-[#1d1d1f]">
            {title}{' '}
            <span className="text-[#0071e3]">
              ({validSelectedIds.length} selecionado{validSelectedIds.length === 1 ? '' : 's'} de{' '}
              {exams.length})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-[#e8f2fd] text-[#0071e3] text-[12px] font-semibold">
              Total: R$ {totalValue.toFixed(2)}
            </span>
            {!isModal && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="px-3 py-1 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[11px] font-semibold inline-flex items-center gap-1.5 transition"
                title="Abrir seletor de exames em tela ampla"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#0071e3]" />
                Ampliar Lista
              </button>
            )}
          </div>
        </div>
      )}

      {/* Prominent Full-Width Search Bar + Optional Ampliar button when header hidden */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#0071e3] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar exame por código (ex: 000), nome, seção ou tubo..."
            className={`w-full pl-10 pr-9 ${
              compact && !isModal ? 'py-2 text-[13px]' : 'py-2.5 text-[14px]'
            } rounded-[14px] bg-[#f5f5f7] border border-black/10 focus:bg-white focus:border-[#0071e3] focus:outline-none text-[#1d1d1f] transition`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5 text-[#86868b]"
              title="Limpar busca"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {hideHeaderSummary && !isModal && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="px-3 py-2 rounded-[14px] bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 transition"
            title="Abrir seletor de exames em tela ampla"
          >
            <Maximize2 className="w-3.5 h-3.5 text-[#0071e3]" />
            Ampliar
          </button>
        )}
      </div>

      {/* Section Filter Chips — all visible, wrapped cleanly */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setSectionFilter('ALL');
            setOnlySelected(false);
          }}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition ${
            sectionFilter === 'ALL' && !onlySelected
              ? 'bg-[#1d1d1f] text-white'
              : 'bg-[#f5f5f7] text-[#707070] hover:bg-[#e5e5ea]'
          }`}
        >
          Todos ({exams.length})
        </button>
        <button
          type="button"
          onClick={() => setOnlySelected((prev) => !prev)}
          className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition inline-flex items-center gap-1 ${
            onlySelected
              ? 'bg-[#0071e3] text-white'
              : 'bg-[#e8f2fd] text-[#0071e3] hover:bg-[#d7e9fc]'
          }`}
        >
          <Sparkles className="w-3 h-3" />
          Selecionados ({validSelectedIds.length})
        </button>
        {sections.map((sec) => (
          <button
            key={sec}
            type="button"
            onClick={() => {
              setOnlySelected(false);
              setSectionFilter((prev) => (prev === sec ? 'ALL' : sec));
            }}
            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition ${
              sectionFilter === sec && !onlySelected
                ? 'bg-[#0071e3] text-white'
                : 'bg-[#f5f5f7] text-[#707070] hover:bg-[#e5e5ea]'
            }`}
          >
            {sec}
          </button>
        ))}
      </div>

      {/* Selected Exams Removable Chips */}
      {selectedExams.length > 0 && (
        <div className="p-3 rounded-[18px] bg-[#f5f5f7] border border-black/5 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-[#707070]">
            <span className="font-semibold uppercase tracking-wider">
              Exames selecionados neste pedido ({selectedExams.length})
            </span>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-red-600 hover:text-red-700 font-semibold inline-flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              Limpar todos
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedExams.map((ex) => (
              <span
                key={ex.id}
                className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-white border border-[#0071e3]/30 text-[11px] font-medium text-[#1d1d1f]"
              >
                <span className="font-mono font-bold text-[#0071e3]">[{ex.code}]</span>
                <span className="max-w-[220px] truncate">{ex.name}</span>
                <span className="text-[#707070]">R$ {getExamPrice(ex).toFixed(2)}</span>
                <button
                  type="button"
                  onClick={() => toggleExam(ex.id)}
                  className="p-0.5 rounded-full hover:bg-[#f5f5f7] text-[#86868b] hover:text-red-600 transition"
                  aria-label={`Remover ${ex.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Compact Scannable Exam List */}
      <div
        className={`rounded-[20px] border border-black/10 bg-white overflow-y-auto divide-y divide-black/5 ${
          isModal ? 'max-h-[52vh]' : compact ? 'max-h-[260px]' : 'max-h-[340px]'
        }`}
      >
        {filteredExams.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-[#86868b]">
            {onlySelected && validSelectedIds.length === 0
              ? 'Nenhum exame selecionado no momento.'
              : query.trim()
                ? `Nenhum exame encontrado para "${query}".`
                : 'Nenhum exame encontrado nesta seção.'}
          </div>
        ) : (
          filteredExams.map((ex) => {
            const checked = validSelectedIds.includes(ex.id);
            const price = getExamPrice(ex);

            return (
              <label
                key={ex.id}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer transition ${
                  checked ? 'bg-[#0071e3]/8 hover:bg-[#0071e3]/12' : 'hover:bg-[#f5f5f7]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleExam(ex.id)}
                    className="sr-only"
                  />
                  <span
                    className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 transition ${
                      checked
                        ? 'bg-[#0071e3] border-[#0071e3] text-white'
                        : 'bg-white border-black/20 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded-md bg-[#f5f5f7] font-mono text-[11px] font-bold text-[#1d1d1f]">
                        {ex.code}
                      </span>
                      <span className="text-[13px] font-semibold text-[#1d1d1f] truncate">
                        {ex.name}
                      </span>
                      {ex.section && (
                        <span className="px-2 py-0.5 rounded-full bg-[#f5f5f7] text-[10px] font-medium text-[#707070]">
                          {ex.section}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#86868b] truncate mt-0.5">
                      Prazo: {ex.delivery_days} dia(s) útil(eis) • {ex.tube_type}
                    </div>
                  </div>
                </div>
                <span className="text-[13px] font-bold text-[#1d1d1f] shrink-0">
                  R$ {price.toFixed(2)}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <>
      {renderPickerBody(false)}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="bg-white w-full max-w-4xl rounded-[28px] shadow-2xl border border-black/5 p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/5 pb-3">
              <div>
                <h3 className="font-display text-[20px] font-semibold text-[#1d1d1f]">
                  Catálogo de Exames — Seleção Rápida
                </h3>
                <p className="text-[12px] text-[#707070]">
                  Pesquise, filtre por seção e marque os exames desejados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-[980px] bg-[#1d1d1f] text-white text-[12px] font-semibold hover:bg-black transition"
              >
                Concluir ({validSelectedIds.length})
              </button>
            </div>
            {renderPickerBody(true)}
          </div>
        </div>
      )}
    </>
  );
}
