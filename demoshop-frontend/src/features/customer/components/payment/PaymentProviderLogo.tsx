import React, { useState } from 'react';

interface PaymentProviderLogoProps {
  providerId: string;
  size?: 'sm' | 'md' | 'lg';
  isSelected?: boolean;
  className?: string;
}

const PROVIDER_IMAGE_MAP: Record<string, { src: string; bg: string; label: string }> = {
  gcash: {
    src: '/gcash.jpg',
    bg: '#007DFE',
    label: 'Gcash',
  },
  maya: {
    src: '/maya.jpg',
    bg: '#000000',
    label: 'Maya/ Paymaya',
  },
  maribank: {
    src: '/maribank.webp',
    bg: '#FFFFFF',
    label: 'MariBank',
  },
  gotyme: {
    src: '/gotyme.jpg',
    bg: '#00D8B4',
    label: 'GoTyme',
  },
};

export const PaymentProviderLogo: React.FC<PaymentProviderLogoProps> = ({
  providerId,
  size = 'md',
  isSelected = false,
  className = '',
}) => {
  const [hasError, setHasError] = useState(false);
  const norm = String(providerId || '').toLowerCase().trim();

  const matchedKey =
    norm.includes('gcash')
      ? 'gcash'
      : norm.includes('maya')
      ? 'maya'
      : norm.includes('maribank') || norm.includes('seabank')
      ? 'maribank'
      : norm.includes('gotyme')
      ? 'gotyme'
      : null;

  const sizeClass =
    size === 'sm'
      ? 'w-7 h-7'
      : size === 'lg'
      ? 'w-12 h-12'
      : 'w-10 h-10';

  const containerClasses = `${sizeClass} rounded-lg overflow-hidden flex items-center justify-center shrink-0 border border-white/10 ${className}`;

  if (matchedKey && PROVIDER_IMAGE_MAP[matchedKey] && !hasError) {
    const config = PROVIDER_IMAGE_MAP[matchedKey];
    return (
      <div
        className={containerClasses}
        style={{ backgroundColor: config.bg }}
        title={config.label}
      >
        <img
          src={config.src}
          alt={`${config.label} logo`}
          className="w-full h-full object-cover"
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  // Fallback badge if image is unavailable
  return (
    <div
      className={`${containerClasses} bg-charcoal font-bold font-mono text-xs text-gold`}
    >
      {norm.slice(0, 2).toUpperCase() || 'QR'}
    </div>
  );
};
