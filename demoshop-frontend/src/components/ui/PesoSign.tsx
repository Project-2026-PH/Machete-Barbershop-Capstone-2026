import React from 'react';

interface PesoSignProps {
  className?: string;
}

export const PesoSign: React.FC<PesoSignProps> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M7 4v16" />
    <path d="M7 4h5a4 4 0 0 1 0 8H7" />
    <path d="M4 7h11" />
    <path d="M4 10h11" />
  </svg>
);

export default PesoSign;
