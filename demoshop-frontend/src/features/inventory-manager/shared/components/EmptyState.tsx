import React from 'react';

export const EmptyState: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-lg border border-dashed border-white/10 px-4 py-8 text-center text-sm text-ivory-dim ${className}`}>
    {children}
  </div>
);
