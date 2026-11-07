import React from 'react';

export interface SegmentedNavItem {
  id: string;
  label: string;
  onSelect: () => void;
}

interface SegmentedNavProps {
  items: SegmentedNavItem[];
  activeId: string;
  ariaLabel: string;
  className?: string;
}

// Compact pill switcher for sibling Inventory Manager views (e.g. Stock List /
// Stock Count / Daily Report). Scrolls horizontally instead of wrapping on phones.
export const SegmentedNav: React.FC<SegmentedNavProps> = ({ items, activeId, ariaLabel, className = '' }) => (
  <nav
    aria-label={ariaLabel}
    className={`inline-flex max-w-full items-center overflow-x-auto rounded-lg border border-white/10 bg-charcoal-light p-1 ${className}`}
  >
    {items.map((item) => {
      const isActive = item.id === activeId;
      return (
        <button
          key={item.id}
          type="button"
          onClick={item.onSelect}
          aria-current={isActive ? 'page' : undefined}
          className={`min-h-[44px] sm:min-h-9 whitespace-nowrap rounded px-3 py-2 sm:py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
            isActive ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'
          }`}
        >
          {item.label}
        </button>
      );
    })}
  </nav>
);
