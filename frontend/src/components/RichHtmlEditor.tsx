import React, { useEffect, useRef } from 'react';
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Minus,
  RemoveFormatting,
  Heading2,
  Heading3,
  Pilcrow,
} from 'lucide-react';

interface RichHtmlEditorProps {
  label: string;
  value: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  minHeightClass?: string;
  placeholder?: string;
  isActive?: boolean;
  insertTagRequest?: { tag: string; nonce: number } | null;
}

const COLOR_SWATCHES = [
  { label: 'Azul VetLife', color: '#0b2240' },
  { label: 'Teal VetLife', color: '#1d9496' },
  { label: 'Preto', color: '#111827' },
  { label: 'Cinza', color: '#475569' },
  { label: 'Vermelho', color: '#dc2626' },
];

export const RichHtmlEditor: React.FC<RichHtmlEditorProps> = ({
  label,
  value,
  onChange,
  onFocus,
  minHeightClass = 'min-h-[120px]',
  placeholder = 'Digite e formate o conteúdo aqui...',
  isActive = false,
  insertTagRequest,
}) => {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedHtmlRef = useRef<string>(value);
  const lastInsertedNonceRef = useRef<number>(0);

  // Sincroniza quando o modelo selecionado muda externamente
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== lastEmittedHtmlRef.current && el.innerHTML !== value) {
      el.innerHTML = value || '';
      lastEmittedHtmlRef.current = value;
    }
  }, [value]);

  // Inicialização no primeiro mount
  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== value) {
      el.innerHTML = value || '';
      lastEmittedHtmlRef.current = value;
    }
  }, []);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastEmittedHtmlRef.current = html;
    onChange(html);
  };

  // Inserção de tag dinâmica no cursor quando este editor está ativo
  useEffect(() => {
    if (!insertTagRequest || !isActive) return;
    if (insertTagRequest.nonce === lastInsertedNonceRef.current) return;
    lastInsertedNonceRef.current = insertTagRequest.nonce;

    const el = editorRef.current;
    if (!el) return;
    el.focus();

    const ok = document.execCommand('insertText', false, ` ${insertTagRequest.tag} `);
    if (!ok) {
      el.innerHTML = `${el.innerHTML} ${insertTagRequest.tag}`;
    }
    emitChange();
  }, [insertTagRequest, isActive]);

  const exec = (command: string, commandValue?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, commandValue);
    emitChange();
  };

  return (
    <div
      className={`rounded-2xl border bg-white overflow-hidden transition ${
        isActive ? 'border-[#1d9496] ring-2 ring-[#1d9496]/15' : 'border-slate-200'
      }`}
    >
      {/* Cabeçalho do campo + Barra de ferramentas estilo Word */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold text-[#0b2240]">{label}</span>
          {isActive && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#1d9496]/10 text-[#1d9496]">
              Campo ativo para inserir tags
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {/* Formato de Bloco */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('formatBlock', 'P')}
            title="Texto Normal"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Pilcrow className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('formatBlock', 'H2')}
            title="Título Grande"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('formatBlock', 'H3')}
            title="Subtítulo"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Heading3 className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Estilos de Texto */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('bold')}
            title="Negrito"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('italic')}
            title="Itálico"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('underline')}
            title="Sublinhado"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Alinhamento */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('justifyLeft')}
            title="Alinhar à Esquerda"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('justifyCenter')}
            title="Centralizar"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('justifyRight')}
            title="Alinhar à Direita"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Listas & Divisória */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertUnorderedList')}
            title="Lista com Marcadores"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertOrderedList')}
            title="Lista Numerada"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <ListOrdered className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('insertHorizontalRule')}
            title="Inserir Linha Divisória"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-[#0b2240] transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          {/* Cores de Texto */}
          <div className="flex items-center gap-1 px-1" title="Cor do texto">
            {COLOR_SWATCHES.map((sw) => (
              <button
                key={sw.color}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec('foreColor', sw.color)}
                title={sw.label}
                className="w-4 h-4 rounded-full border border-slate-300 hover:scale-110 transition"
                style={{ backgroundColor: sw.color }}
              />
            ))}
          </div>

          <span className="w-px h-4 bg-slate-300 mx-1" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec('removeFormat')}
            title="Limpar Formatação"
            className="p-1.5 rounded-lg hover:bg-slate-200/70 text-slate-600 transition"
          >
            <RemoveFormatting className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Área Editável Visual (WYSIWYG) */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={onFocus}
        onInput={emitChange}
        onBlur={emitChange}
        data-placeholder={placeholder}
        className={`w-full px-4 py-3 text-[13px] text-[#0b2240] leading-relaxed focus:outline-none overflow-y-auto [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_hr]:my-2 [&_hr]:border-slate-300 ${minHeightClass}`}
      />
    </div>
  );
};
