import React from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

// Inventory Manager page header. Mirrors the established Admin/docs pattern:
// gold eyebrow, Playfair (font-serif) title, dimmed body-copy subtitle.
export const PageHeader: React.FC<PageHeaderProps> = ({ eyebrow, title, description, actions }) => (
  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">{title}</h2>
      {description && <p className="mt-2 max-w-2xl text-sm text-ivory-dim">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

interface SectionHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ElementType;
  actions?: React.ReactNode;
}

// Card-level heading used inside bg-charcoal-light panels.
export const SectionHeader: React.FC<SectionHeaderProps> = ({ title, description, icon: Icon, actions }) => (
  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
    <div className="flex min-w-0 items-start gap-2">
      {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold" />}
      <div className="min-w-0">
        <h3 className="font-bold text-ivory">{title}</h3>
        {description && <p className="mt-1 text-xs text-ivory-dim">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);
