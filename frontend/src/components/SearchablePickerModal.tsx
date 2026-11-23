import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export interface SearchableFilterChip<T> {
  id: string;
  label: string;
  predicate: (item: T) => boolean;
}

export interface SearchableSelectFieldProps<T> {
  label?: string;
  placeholder?: string;
  modalTitle: string;
  modalSubtitle?: string;
  searchPlaceholder?: string;
  items: T[];
  value: string;
  getId: (item: T) => string;
  getPrimaryLabel: (item: T) => string;
  getSecondaryLabel?: (item: T) => string;
  getBadge?: (item: T) => string | undefined;
  getSearchText: (item: T) => string;
  filterChips?: SearchableFilterChip<T>[];
  emptyMessage?: string;
  onChange: (id: string, item: T) => void;
  onClear?: () => void;
  variant?: 'default' | 'minimal';
  triggerClassName?: string;
  compact?: boolean;
  disabled?: boolean;
}

export function SearchableSelectField<T>({
  label,
  placeholder = 'Clique para pesquisar e selecionar...',
  modalTitle,
  modalSubtitle,
  searchPlaceholder = 'Digite para pesquisar...',
  items,
  value,
  getId,
  getPrimaryLabel,
  getSecondaryLabel,
  getBadge,
  getSearchText,
  filterChips,
  emptyMessage = 'Nenhum registro encontrado com este filtro.',
  onChange,
  onClear,
  variant = 'default',
  triggerClassName = '',
  compact = false,
  disabled = false,
}: SearchableSelectFieldProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeChipId, setActiveChipId] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItem = useMemo(
    () => items.find((item) => getId(item) === value) || null,
    [items, value, getId],
  );

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveChipId('all');
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeChip = filterChips?.find((c) => c.id === activeChipId);

    return items.filter((item) => {
      if (activeChip && !activeChip.predicate(item)) return false;
      if (!q) return true;
      const tokens = q.split(/\s+/).filter(Boolean);
      const haystack = getSearchText(item).toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [items, query, filterChips, activeChipId, getSearchText]);

  const visibleItems = useMemo(() => filteredItems.slice(0, 80), [filteredItems]);

  const handleSelect = (item: T) => {
    onChange(getId(item), item);
    setOpen(false);
  };

  const showClear = Boolean(selectedItem && onClear && !disabled);
  const isMinimal = variant === 'minimal';

  return (
    <div className="w-full min-w-0">
      {label && (
        <label
          className={`block mb-1 ${
            isMinimal
              ? 'text-[11px] font-medium text-[#707070]'
              : 'text-[12px] text-[#707070]'
          }`}
        >
          {label}
        </label>
      )}
      <div className="relative w-full min-w-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className={`w-full min-w-0 text-left flex items-center justify-between gap-2 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
            isMinimal
              ? 'h-[38px] px-3 rounded-xl bg-[#f5f5f7] hover:bg-[#ebebf0] border border-transparent text-[12.5px] text-[#1d1d1f]'
              : compact
                ? 'px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-[980px] bg-[#f5f5f7] hover:bg-[#ebebf0] text-[12px] font-semibold text-[#1d1d1f]'
                : 'px-3.5 sm:px-4 py-2.5 rounded-[18px] bg-[#f5f5f7] hover:bg-[#ebebf0] text-[13px] sm:text-[15px] text-[#1d1d1f]'
          } ${triggerClassName}`}
        >
          <div className={`min-w-0 flex-1 flex items-center gap-2 ${showClear ? 'pr-6' : ''}`}>
            <Search
              className={`shrink-0 ${
                isMinimal ? 'w-3.5 h-3.5 text-[#86868b]' : 'w-4 h-4 text-[#0071e3]'
              }`}
            />
            {selectedItem ? (
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[#1d1d1f]">
                  {getPrimaryLabel(selectedItem)}
                </div>
                {!isMinimal && !compact && getSecondaryLabel && getSecondaryLabel(selectedItem) && (
                  <div className="truncate text-[11px] text-[#707070]">
                    {getSecondaryLabel(selectedItem)}
                  </div>
                )}
              </div>
            ) : (
              <span className="truncate text-[#86868b]">{placeholder}</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!isMinimal && selectedItem && getBadge && getBadge(selectedItem) && (
              <span className="px-2 py-0.5 rounded-full bg-white text-[#1d1d1f] text-[10px] font-semibold border border-black/5">
                {getBadge(selectedItem)}
              </span>
            )}
            <ChevronDown
              className={
                isMinimal
                  ? 'w-3.5 h-3.5 text-[#86868b]'
                  : 'w-4 h-4 text-[#86868b]'
              }
            />
          </div>
        </button>

        {showClear && onClear && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/10 text-[#86868b] hover:text-[#1d1d1f] transition"
            aria-label="Limpar seleção"
            title="Limpar seleção"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              className="bg-white w-full max-w-2xl rounded-[24px] sm:rounded-[28px] shadow-2xl border border-black/5 overflow-hidden flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 border-b border-black/5 flex items-start justify-between gap-3 shrink-0">
                <div className="min-w-0">
                  <h3 className="font-display text-[18px] sm:text-[20px] font-semibold text-[#1d1d1f]">
                    {modalTitle}
                  </h3>
                  {modalSubtitle && (
                    <p className="text-[12px] text-[#707070] mt-0.5">{modalSubtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 rounded-full bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#1d1d1f] transition shrink-0 cursor-pointer"
                  aria-label="Fechar pesquisa"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Search Input & Filter Chips */}
              <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#f9f9fb] border-b border-black/5 space-y-3 shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#0071e3] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && visibleItems.length > 0) {
                        e.preventDefault();
                        handleSelect(visibleItems[0]);
                      }
                    }}
                    placeholder={searchPlaceholder}
                    className="w-full pl-11 pr-10 py-3 rounded-[18px] bg-white border border-black/10 focus:border-[#0071e3] focus:outline-none text-[15px] text-[#1d1d1f]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery('');
                        inputRef.current?.focus();
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[#f5f5f7] text-[#86868b]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {filterChips && filterChips.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveChipId('all')}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
                        activeChipId === 'all'
                          ? 'bg-[#1d1d1f] text-white'
                          : 'bg-white text-[#707070] border border-black/5 hover:bg-[#f0f0f5]'
                      }`}
                    >
                      Todos ({items.length})
                    </button>
                    {filterChips.map((chip) => (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => setActiveChipId(chip.id)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition ${
                          activeChipId === chip.id
                            ? 'bg-[#0071e3] text-white'
                            : 'bg-white text-[#707070] border border-black/5 hover:bg-[#f0f0f5]'
                        }`}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Results List */}
              <div className="p-3 sm:p-4 overflow-y-auto flex-1 min-h-0 space-y-1.5">
                {visibleItems.length === 0 ? (
                  <div className="py-12 text-center text-[13px] text-[#86868b]">
                    {emptyMessage}
                  </div>
                ) : (
                  visibleItems.map((item) => {
                    const id = getId(item);
                    const isSelected = id === value;
                    const badge = getBadge ? getBadge(item) : undefined;
                    const secondary = getSecondaryLabel ? getSecondaryLabel(item) : undefined;

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`w-full min-w-0 text-left px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-[18px] flex items-center justify-between gap-2.5 sm:gap-3 transition ${
                          isSelected
                            ? 'bg-[#0071e3]/10 border border-[#0071e3] text-[#1d1d1f]'
                            : 'bg-[#f5f5f7]/70 hover:bg-[#ebebf0] border border-transparent text-[#1d1d1f]'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[13px] sm:text-[14px] text-[#1d1d1f] break-words sm:truncate">
                            {getPrimaryLabel(item)}
                          </div>
                          {secondary && (
                            <div className="text-[11px] sm:text-[12px] text-[#707070] break-words sm:truncate mt-0.5">
                              {secondary}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          {badge && (
                            <span className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-white text-[10px] sm:text-[11px] font-semibold text-[#1d1d1f] border border-black/5 max-w-[110px] truncate">
                              {badge}
                            </span>
                          )}
                          {isSelected && (
                            <span className="w-6 h-6 rounded-full bg-[#0071e3] text-white flex items-center justify-center shrink-0">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}

                {filteredItems.length > visibleItems.length && (
                  <div className="text-center text-[11px] text-[#86868b] py-2">
                    Exibindo {visibleItems.length} de {filteredItems.length} registros. Refine a busca acima para localizar exatamente o que deseja.
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 sm:px-6 py-3 bg-[#f9f9fb] border-t border-black/5 flex items-center justify-between text-[11px] text-[#86868b] shrink-0">
                <span>{filteredItems.length} resultado(s) encontrado(s)</span>
                <span className="hidden sm:inline">Enter seleciona o primeiro • Esc fecha</span>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
