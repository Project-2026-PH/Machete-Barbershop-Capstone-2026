import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  shortLabel?: string;
  description?: string;
  badge?: {
    text: string;
    variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'gold';
  };
  extraRight?: string;
  disabled?: boolean;
  colorDot?: string;
}

export interface SearchableSelectProps {
  label?: string;
  labelClassName?: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  dropdownAlign?: 'left' | 'right';
  wrapOptionText?: boolean;
  id?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  labelClassName,
  value,
  options,
  onChange,
  placeholder = 'Select an option…',
  searchPlaceholder = 'Search options…',
  emptyMessage = 'No options found',
  disabled = false,
  className = '',
  buttonClassName = '',
  dropdownAlign = 'left',
  wrapOptionText = false,
  id,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      (option.shortLabel && option.shortLabel.toLowerCase().includes(normalizedQuery)) ||
      (option.description && option.description.toLowerCase().includes(normalizedQuery)) ||
      (option.badge?.text && option.badge.text.toLowerCase().includes(normalizedQuery)) ||
      (option.extraRight && option.extraRight.toLowerCase().includes(normalizedQuery))
    );
  }, [options, query]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const frame = requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const close = () => {
    setIsOpen(false);
    setQuery('');
    setHighlightedIndex(0);
  };

  const selectOption = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter' && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      selectOption(filteredOptions[highlightedIndex]);
    }
  };

  const defaultButtonClass =
    'flex min-h-10 w-full items-center justify-between rounded-sm border border-white/10 bg-charcoal/80 px-3.5 py-2 text-left text-sm text-ivory outline-none transition-colors hover:border-white/20 focus:border-gold/60 focus:ring-1 focus:ring-gold/50 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <div ref={containerRef} className={`relative block min-w-0 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className={labelClassName || 'block text-xs font-medium text-ivory-dim mb-1.5'}
        >
          {label}
        </label>
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className={buttonClassName ? `flex items-center justify-between ${buttonClassName}` : defaultButtonClass}
      >
        <span className="mr-2 min-w-0 flex-1 truncate text-left">
          {selectedOption ? (
            selectedOption.label.includes(' — ₱') ? (
              <span className="flex items-center justify-between w-full">
                <span className="text-ivory font-medium truncate">{selectedOption.label.split(' — ')[0]}</span>
                <span className="font-semibold text-gold ml-2 shrink-0">{selectedOption.label.split(' — ')[1]}</span>
              </span>
            ) : selectedOption.badge || selectedOption.extraRight || selectedOption.colorDot ? (
              <span className="flex items-center justify-between w-full gap-2">
                <span className="flex items-center gap-2 min-w-0 truncate">
                  {selectedOption.colorDot && (
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                      style={{ backgroundColor: selectedOption.colorDot }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-ivory font-medium truncate">{selectedOption.shortLabel || selectedOption.label}</span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {selectedOption.badge && (
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide ${
                      selectedOption.badge.variant === 'success'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : selectedOption.badge.variant === 'danger'
                        ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                        : selectedOption.badge.variant === 'warning'
                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : selectedOption.badge.variant === 'gold'
                        ? 'bg-gold/15 text-gold border border-gold/30'
                        : 'bg-white/10 text-ivory-dim/70 border border-white/10'
                    }`}>
                      {selectedOption.badge.text}
                    </span>
                  )}
                  {selectedOption.extraRight && (
                    <span className="font-mono text-xs font-semibold text-gold">
                      {selectedOption.extraRight}
                    </span>
                  )}
                </div>
              </span>
            ) : (
              <span className={selectedOption.disabled ? 'text-ivory-dim/50' : 'text-ivory'}>{selectedOption.shortLabel || selectedOption.label}</span>
            )
          ) : (
            <span className="text-ivory-dim/60">{placeholder}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ivory-dim transition-transform ${isOpen ? 'rotate-180 text-gold' : ''}`} />
      </button>

      {isOpen && (
        <div className={`absolute top-full ${dropdownAlign === 'right' ? 'right-0' : 'left-0'} z-50 mt-1 w-full min-w-[280px] sm:min-w-[320px] max-w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-sm border border-white/10 bg-charcoal shadow-2xl`}>
          <div className="border-b border-white/10 p-2 bg-charcoal-light/40">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setHighlightedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                className="min-h-8 w-full rounded-sm border border-white/10 bg-charcoal/80 py-1 pl-8 pr-2.5 text-xs sm:text-sm text-ivory outline-none focus:border-gold/60 focus:ring-1 focus:ring-gold/50 placeholder:text-ivory-dim/40 transition-colors"
                aria-label={`${label || 'Options'} search`}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5 custom-scrollbar" role="listbox" aria-label={label || 'Options'}>
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ivory-dim">{emptyMessage}</p>
            ) : (
              filteredOptions.map((option, index) => {
                const isServicePrice = option.label.includes(' — ₱');
                const [namePart, pricePart] = isServicePrice ? option.label.split(' — ') : [option.label, ''];
                const hasRichContent = Boolean(option.badge || option.description || option.extraRight || option.colorDot);

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    disabled={option.disabled}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option)}
                    className={`flex w-full items-center justify-between gap-2 rounded-sm px-3 py-2 text-left text-xs sm:text-sm transition-colors cursor-pointer ${
                      option.disabled
                        ? 'cursor-not-allowed opacity-40 text-ivory-dim'
                        : index === highlightedIndex
                          ? 'bg-gold/15 text-gold'
                          : option.value === value
                            ? 'bg-gold/10 text-gold'
                            : 'text-ivory hover:bg-white/5'
                    }`}
                  >
                    {hasRichContent ? (
                      <div className="flex flex-col min-w-0 flex-1 py-0.5">
                        <div className={`flex justify-between gap-2 ${wrapOptionText ? 'flex-wrap items-start' : 'items-center'}`}>
                          <span className={`flex items-center gap-2 min-w-0 ${wrapOptionText ? 'flex-1 basis-36' : 'truncate'}`}>
                            {option.colorDot && (
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/20"
                                style={{ backgroundColor: option.colorDot }}
                                aria-hidden="true"
                              />
                            )}
                            <span className={`font-semibold text-xs sm:text-sm ${wrapOptionText ? 'whitespace-normal break-words' : 'truncate'} ${option.value === value || index === highlightedIndex ? 'text-gold' : 'text-ivory'}`}>
                              {wrapOptionText ? option.label : option.shortLabel || option.label}
                            </span>
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {option.badge && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                                option.badge.variant === 'success'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                  : option.badge.variant === 'danger'
                                  ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                                  : option.badge.variant === 'warning'
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                  : option.badge.variant === 'gold'
                                  ? 'bg-gold/15 text-gold border border-gold/30'
                                  : 'bg-white/10 text-ivory-dim/70 border border-white/10'
                              }`}>
                                {option.badge.text}
                              </span>
                            )}
                            {option.extraRight && (
                              <span className="font-mono text-xs font-semibold text-gold">
                                {option.extraRight}
                              </span>
                            )}
                          </div>
                        </div>
                        {option.description && (
                          <span className={wrapOptionText ? 'mt-1 text-xs leading-relaxed text-ivory-dim whitespace-normal break-words' : 'text-[11px] text-ivory-dim/60 truncate mt-0.5'}>
                            {option.description}
                          </span>
                        )}
                      </div>
                    ) : isServicePrice ? (
                      <div className="flex items-center justify-between w-full min-w-0 pr-1">
                        <span className="truncate">{namePart}</span>
                        <span className={`font-semibold ml-2 shrink-0 ${option.value === value || index === highlightedIndex ? 'text-gold' : 'text-gold/90'}`}>
                          {pricePart}
                        </span>
                      </div>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    )}
                    {option.value === value && !wrapOptionText && <Check className="h-3.5 w-3.5 shrink-0 text-gold ml-2" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
