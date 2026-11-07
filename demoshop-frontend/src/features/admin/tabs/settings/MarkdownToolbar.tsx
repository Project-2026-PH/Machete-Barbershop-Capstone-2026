import React from 'react';
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Quote,
  HelpCircle,
} from 'lucide-react';

interface MarkdownToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (newValue: string) => void;
  onToggleHelp?: () => void;
}

export const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
  textareaRef,
  value,
  onChange,
  onToggleHelp,
}) => {
  const insertSyntax = (prefix: string, suffix = '', defaultText = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end) || defaultText;

    const before = value.slice(0, start);
    const after = value.slice(end);

    const replacement = `${prefix}${selectedText}${suffix}`;
    const newContent = `${before}${replacement}${after}`;

    onChange(newContent);

    // Reposition cursor inside or right after inserted tokens
    setTimeout(() => {
      textarea.focus();
      const newCursorStart = start + prefix.length;
      const newCursorEnd = newCursorStart + selectedText.length;
      textarea.setSelectionRange(newCursorStart, newCursorEnd);
    }, 0);
  };

  const insertLinePrefix = (linePrefix: string, defaultText = 'Heading') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.slice(start, end);

    const before = value.slice(0, start);
    const after = value.slice(end);

    // If starting on a fresh line or middle of line
    const needsLeadingNewline = start > 0 && !before.endsWith('\n');
    const textToInsert = selectedText || defaultText;
    const formatted = `${needsLeadingNewline ? '\n' : ''}${linePrefix} ${textToInsert}\n`;

    const newContent = `${before}${formatted}${after}`;
    onChange(newContent);

    setTimeout(() => {
      textarea.focus();
      const cursor = start + (needsLeadingNewline ? 1 : 0) + linePrefix.length + 1;
      textarea.setSelectionRange(cursor, cursor + textToInsert.length);
    }, 0);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-1.5 bg-charcoal border border-white/10 rounded-t-lg text-ivory-dim">
      <div className="flex items-center gap-0.5 border-r border-white/10 pr-1.5 mr-1">
        <button
          type="button"
          onClick={() => insertLinePrefix('#', 'Document Title')}
          title="Heading 1 (# Title)"
          className="px-2 py-1 rounded text-xs font-serif font-bold hover:bg-white/10 hover:text-gold transition-colors flex items-center gap-1"
        >
          <Heading1 className="w-3.5 h-3.5" />
          <span className="text-[10px]">H1</span>
        </button>

        <button
          type="button"
          onClick={() => insertLinePrefix('##', 'Section Heading')}
          title="Heading 2 (## Section)"
          className="px-2 py-1 rounded text-xs font-serif font-bold hover:bg-white/10 hover:text-gold transition-colors flex items-center gap-1"
        >
          <Heading2 className="w-3.5 h-3.5" />
          <span className="text-[10px]">H2</span>
        </button>

        <button
          type="button"
          onClick={() => insertLinePrefix('###', 'Subsection Heading')}
          title="Heading 3 (### Subsection)"
          className="px-2 py-1 rounded text-xs font-serif font-bold hover:bg-white/10 hover:text-gold transition-colors flex items-center gap-1"
        >
          <Heading3 className="w-3.5 h-3.5" />
          <span className="text-[10px]">H3</span>
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-white/10 pr-1.5 mr-1">
        <button
          type="button"
          onClick={() => insertSyntax('**', '**', 'bold text')}
          title="Bold (**text**)"
          className="p-1.5 rounded hover:bg-white/10 hover:text-gold transition-colors"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => insertSyntax('*', '*', 'italic text')}
          title="Italic (*text*)"
          className="p-1.5 rounded hover:bg-white/10 hover:text-gold transition-colors"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-white/10 pr-1.5 mr-1">
        <button
          type="button"
          onClick={() => insertLinePrefix('-', 'List item')}
          title="Bullet List (- item)"
          className="p-1.5 rounded hover:bg-white/10 hover:text-gold transition-colors"
        >
          <List className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => insertLinePrefix('1.', 'Numbered item')}
          title="Numbered List (1. item)"
          className="p-1.5 rounded hover:bg-white/10 hover:text-gold transition-colors"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-r border-white/10 pr-1.5 mr-1">
        <button
          type="button"
          onClick={() => insertSyntax('[', '](https://example.com)', 'Link text')}
          title="Link ([text](url))"
          className="p-1.5 rounded hover:bg-white/10 hover:text-gold transition-colors"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => insertLinePrefix('>', 'Important information')}
          title="Blockquote (> text)"
          className="p-1.5 rounded hover:bg-white/10 hover:text-gold transition-colors"
        >
          <Quote className="w-3.5 h-3.5" />
        </button>
      </div>

      {onToggleHelp && (
        <button
          type="button"
          onClick={onToggleHelp}
          title="Formatting Help"
          className="ml-auto px-2 py-1 rounded text-[11px] hover:bg-white/10 hover:text-gold text-ivory-dim/70 flex items-center gap-1 transition-colors"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Help</span>
        </button>
      )}
    </div>
  );
};
