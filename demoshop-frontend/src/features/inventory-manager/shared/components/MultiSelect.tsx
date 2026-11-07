import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import type { SearchableSelectOption } from './SearchableSelect';

interface MultiSelectProps {
  label: string;
  values: string[];
  options: SearchableSelectOption[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  label,
  values,
  options,
  onChange,
  placeholder = 'Select options',
  searchPlaceholder = 'Search options…',
  emptyMessage = 'No options found',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? options.filter((option) => option.label.toLowerCase().includes(normalizedQuery))
      : options;
  }, [options, query]);

  useEffect(() => {
    if (isOpen) searchRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const toggleOption = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(values.includes(option.value)
      ? values.filter((value) => value !== option.value)
      : [...values, option.value]);
  };

  const selectedLabel = values.length === 0
    ? placeholder
    : values.length === 1
      ? options.find((option) => option.value === values[0])?.label || '1 selected'
      : `${values.length} selected`;

  return (
    <div ref={containerRef} className="relative block space-y-1.5 text-xs text-ivory-dim">
      <span>{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between rounded border border-white/10 bg-charcoal px-3 py-2 text-left text-sm text-ivory outline-none transition-colors focus:border-gold/60"
      >
        <span className={values.length ? 'text-ivory' : 'text-ivory-dim/70'}>{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded border border-white/10 bg-charcoal shadow-xl">
          <div className="border-b border-white/10 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ivory-dim" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                className="min-h-9 w-full rounded border border-white/10 bg-charcoal-light pl-8 pr-2 text-sm text-ivory outline-none focus:border-gold/60"
                aria-label={`${label} search`}
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1" role="listbox" aria-label={label} aria-multiselectable="true">
            {filteredOptions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-ivory-dim">{emptyMessage}</p>
            ) : (
              filteredOptions.map((option) => {
                const selected = values.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    disabled={option.disabled}
                    onClick={() => toggleOption(option)}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${
                      option.disabled
                        ? 'cursor-not-allowed text-ivory-dim/50'
                        : selected
                          ? 'bg-gold/15 text-gold'
                          : 'text-ivory hover:bg-white/5'
                    }`}
                  >
                    <span>{option.label}</span>
                    {selected && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full border-t border-white/10 px-3 py-2 text-left text-xs text-ivory-dim hover:text-gold"
            >
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
};
