import React, { useMemo } from 'react';

export interface PublicDocumentRendererProps {
  content: string;
  showToc?: boolean;
  className?: string;
  isCompact?: boolean;
}

interface TocItem {
  id: string;
  text: string;
  level: number;
}

// Ensure URL schemes are safe to prevent XSS / malicious protocol injection
function isSafeUrl(url: string): boolean {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return true;
  if (trimmed.startsWith('mailto:') || trimmed.startsWith('tel:')) return true;
  return false;
}

// Generate stable URL anchor slugs from heading text
function generateSlug(text: string, counts: Map<string, number>): string {
  const clean = text
    .replace(/[*_#`\[\]]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
  
  const base = clean || 'section';
  const existingCount = counts.get(base) || 0;
  counts.set(base, existingCount + 1);
  return existingCount === 0 ? base : `${base}-${existingCount}`;
}

// Safe inline Markdown parser that outputs React nodes (zero dangerouslySetInnerHTML)
function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Tokenizer pattern: links [text](url), bold-italic ***text***, bold **text**, italic *text*, inline `code`
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let tokenIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const fullMatch = match[0];
    const key = `${keyPrefix}-${tokenIdx++}`;

    if (fullMatch.startsWith('[') && match[2] && match[3]) {
      // Link: [text](url)
      const linkText = match[2];
      const linkUrl = match[3];

      if (isSafeUrl(linkUrl)) {
        const isExternal = linkUrl.startsWith('http://') || linkUrl.startsWith('https://');
        nodes.push(
          <a
            key={key}
            href={linkUrl}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="text-gold underline decoration-gold/40 underline-offset-2 hover:decoration-gold hover:text-white transition-colors font-medium"
          >
            {renderInlineMarkdown(linkText, `${key}-inner`)}
          </a>
        );
      } else {
        // Disallowed scheme (e.g. javascript:), render text safely
        nodes.push(<span key={key} className="text-ivory-dim">{linkText}</span>);
      }
    } else if (match[4]) {
      // Bold + Italic: ***text***
      nodes.push(
        <strong key={key} className="font-bold italic text-ivory">
          {renderInlineMarkdown(match[4], `${key}-inner`)}
        </strong>
      );
    } else if (match[5]) {
      // Bold: **text**
      nodes.push(
        <strong key={key} className="font-semibold text-ivory">
          {renderInlineMarkdown(match[5], `${key}-inner`)}
        </strong>
      );
    } else if (match[6]) {
      // Italic: *text*
      nodes.push(
        <em key={key} className="italic text-ivory/90">
          {renderInlineMarkdown(match[6], `${key}-inner`)}
        </em>
      );
    } else if (match[7]) {
      // Inline code: `code`
      nodes.push(
        <code key={key} className="px-1.5 py-0.5 rounded bg-white/10 text-gold font-mono text-[0.85em]">
          {match[7]}
        </code>
      );
    }

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

interface Block {
  type: 'h1' | 'h2' | 'h3' | 'blockquote' | 'hr' | 'ul' | 'ol' | 'paragraph';
  content?: string;
  items?: string[];
  id?: string;
}

export const PublicDocumentRenderer: React.FC<PublicDocumentRendererProps> = ({
  content,
  showToc = true,
  className = '',
  isCompact = false,
}) => {
  // Parse blocks & TOC from content
  const { blocks, tocItems } = useMemo(() => {
    if (!content || !content.trim()) {
      return { blocks: [], tocItems: [] };
    }

    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const parsedBlocks: Block[] = [];
    const toc: TocItem[] = [];
    const slugCounts = new Map<string, number>();

    let currentList: { type: 'ul' | 'ol'; items: string[] } | null = null;
    let currentParagraphLines: string[] = [];

    const flushParagraph = () => {
      if (currentParagraphLines.length > 0) {
        parsedBlocks.push({
          type: 'paragraph',
          content: currentParagraphLines.join('\n').trim(),
        });
        currentParagraphLines = [];
      }
    };

    const flushList = () => {
      if (currentList) {
        parsedBlocks.push({
          type: currentList.type,
          items: [...currentList.items],
        });
        currentList = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Empty line closes paragraphs and lists
      if (!trimmed) {
        flushParagraph();
        flushList();
        continue;
      }

      // Horizontal Rule
      if (/^(---|\*\*\*|___)$/.test(trimmed)) {
        flushParagraph();
        flushList();
        parsedBlocks.push({ type: 'hr' });
        continue;
      }

      // Headings
      const h3Match = trimmed.match(/^###\s+(.+)$/);
      if (h3Match) {
        flushParagraph();
        flushList();
        const text = h3Match[1].trim();
        const slug = generateSlug(text, slugCounts);
        parsedBlocks.push({ type: 'h3', content: text, id: slug });
        continue;
      }

      const h2Match = trimmed.match(/^##\s+(.+)$/);
      if (h2Match) {
        flushParagraph();
        flushList();
        const text = h2Match[1].trim();
        const slug = generateSlug(text, slugCounts);
        parsedBlocks.push({ type: 'h2', content: text, id: slug });
        toc.push({ id: slug, text, level: 2 });
        continue;
      }

      const h1Match = trimmed.match(/^#\s+(.+)$/);
      if (h1Match) {
        flushParagraph();
        flushList();
        const text = h1Match[1].trim();
        const slug = generateSlug(text, slugCounts);
        parsedBlocks.push({ type: 'h1', content: text, id: slug });
        continue;
      }

      // Blockquote
      const quoteMatch = trimmed.match(/^>\s?(.*)$/);
      if (quoteMatch) {
        flushParagraph();
        flushList();
        parsedBlocks.push({ type: 'blockquote', content: quoteMatch[1] });
        continue;
      }

      // Bullet List (- or *)
      const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
      if (bulletMatch) {
        flushParagraph();
        if (!currentList || currentList.type !== 'ul') {
          flushList();
          currentList = { type: 'ul', items: [] };
        }
        currentList.items.push(bulletMatch[1]);
        continue;
      }

      // Numbered List (1. 2. etc.)
      const numberMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (numberMatch) {
        flushParagraph();
        if (!currentList || currentList.type !== 'ol') {
          flushList();
          currentList = { type: 'ol', items: [] };
        }
        currentList.items.push(numberMatch[1]);
        continue;
      }

      // Otherwise normal paragraph text
      if (currentList) {
        flushList();
      }
      currentParagraphLines.push(trimmed);
    }

    flushParagraph();
    flushList();

    return { blocks: parsedBlocks, tocItems: toc };
  }, [content]);

  if (!content || !content.trim()) {
    return (
      <div className="py-12 text-center text-ivory-dim/60 italic text-sm">
        No document content to display.
      </div>
    );
  }

  return (
    <div className={`space-y-6 text-ivory-dim font-light leading-relaxed ${className}`}>
      {/* Optional Table of Contents - Rendered when 2+ H2 headings exist */}
      {showToc && tocItems.length >= 2 && (
        <nav
          aria-label="Table of contents"
          className="mb-8 p-5 bg-charcoal-light/60 rounded-lg border border-white/10 backdrop-blur-sm"
        >
          <div className="text-[11px] uppercase tracking-widest font-mono text-gold font-bold mb-3 flex items-center gap-2">
            <span>CONTENTS</span>
            <span className="h-px flex-1 bg-white/10"></span>
          </div>
          <ol className="space-y-2 text-sm">
            {tocItems.map((item, index) => (
              <li key={item.id} className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-gold/60">{index + 1}.</span>
                <a
                  href={`#${item.id}`}
                  className="text-ivory/80 hover:text-gold transition-colors underline-offset-4 hover:underline"
                >
                  {item.text.replace(/[*_#`\[\]]/g, '')}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Render Document Blocks */}
      <div className="space-y-6">
        {blocks.map((block, idx) => {
          switch (block.type) {
            case 'h1':
              return (
                <h1
                  key={idx}
                  id={block.id}
                  className={`${
                    isCompact ? 'text-2xl mt-4 mb-2' : 'text-3xl md:text-4xl mt-8 mb-4'
                  } font-serif font-bold text-ivory border-b border-white/10 pb-3 scroll-mt-24`}
                >
                  {renderInlineMarkdown(block.content || '', `h1-${idx}`)}
                </h1>
              );

            case 'h2':
              return (
                <h2
                  key={idx}
                  id={block.id}
                  className={`${
                    isCompact ? 'text-lg mt-6 mb-2' : 'text-2xl font-serif mt-10 mb-3'
                  } font-bold text-ivory tracking-wide flex items-center gap-2 scroll-mt-24`}
                >
                  <span className="w-1.5 h-5 bg-gold rounded-sm inline-block shrink-0"></span>
                  <span>{renderInlineMarkdown(block.content || '', `h2-${idx}`)}</span>
                </h2>
              );

            case 'h3':
              return (
                <h3
                  key={idx}
                  id={block.id}
                  className={`${
                    isCompact ? 'text-base mt-4 mb-1' : 'text-lg mt-6 mb-2'
                  } font-serif font-semibold text-ivory/95 scroll-mt-24`}
                >
                  {renderInlineMarkdown(block.content || '', `h3-${idx}`)}
                </h3>
              );

            case 'paragraph':
              return (
                <p key={idx} className={`${isCompact ? 'text-xs' : 'text-sm md:text-base'} text-ivory-dim leading-relaxed`}>
                  {renderInlineMarkdown(block.content || '', `p-${idx}`)}
                </p>
              );

            case 'blockquote':
              return (
                <blockquote
                  key={idx}
                  className="border-l-2 border-gold/70 pl-4 py-2 my-4 bg-gold/[0.04] text-ivory/90 italic rounded-r text-sm"
                >
                  {renderInlineMarkdown(block.content || '', `quote-${idx}`)}
                </blockquote>
              );

            case 'ul':
              return (
                <ul
                  key={idx}
                  className={`list-disc pl-6 space-y-2 text-ivory-dim ${
                    isCompact ? 'text-xs' : 'text-sm md:text-base'
                  }`}
                >
                  {(block.items || []).map((item, itemIdx) => (
                    <li key={itemIdx} className="leading-relaxed">
                      {renderInlineMarkdown(item, `ul-${idx}-${itemIdx}`)}
                    </li>
                  ))}
                </ul>
              );

            case 'ol':
              return (
                <ol
                  key={idx}
                  className={`list-decimal pl-6 space-y-2 text-ivory-dim ${
                    isCompact ? 'text-xs' : 'text-sm md:text-base'
                  }`}
                >
                  {(block.items || []).map((item, itemIdx) => (
                    <li key={itemIdx} className="leading-relaxed">
                      {renderInlineMarkdown(item, `ol-${idx}-${itemIdx}`)}
                    </li>
                  ))}
                </ol>
              );

            case 'hr':
              return <hr key={idx} className="border-white/10 my-8" />;

            default:
              return null;
          }
        })}
      </div>
    </div>
  );
};
