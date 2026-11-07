import React from 'react';

export const Field: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({ label, ...props }) => (
  <label className="block space-y-1.5 text-xs text-ivory-dim">
    <span>{label}</span>
    <input
      {...props}
      className="min-h-11 w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory outline-none transition-colors placeholder:text-ivory-dim/50 focus:border-gold/60"
    />
  </label>
);
