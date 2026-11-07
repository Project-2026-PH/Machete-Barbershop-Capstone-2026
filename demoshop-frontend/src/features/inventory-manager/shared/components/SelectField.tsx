import React from 'react';

export const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }> = ({ label, children, ...props }) => (
  <label className="block space-y-1.5 text-xs text-ivory-dim">
    <span>{label}</span>
    <select
      {...props}
      className="min-h-11 w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory outline-none focus:border-gold/60"
    >
      {children}
    </select>
  </label>
);
