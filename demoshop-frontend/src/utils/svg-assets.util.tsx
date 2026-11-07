import React from 'react';

export interface VectorAvatarProps {
  name: string;
  size?: number;
  className?: string;
}

/**
 * Renders a lightweight 0-byte SVG letter avatar with responsive gradient background.
 */
export const VectorAvatar: React.FC<VectorAvatarProps> = ({ name, size = 40, className = '' }) => {
  const initial = (name || '?').charAt(0).toUpperCase();
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'
  ];
  const charCode = initial.charCodeAt(0) || 0;
  const color = colors[charCode % colors.length];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`rounded-full shadow-sm ${className}`}
    >
      <rect width="40" height="40" rx="20" fill={color} />
      <text
        x="50%"
        y="54%"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="18"
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        {initial}
      </text>
    </svg>
  );
};

/**
 * Pure CSS/SVG badge icon for status indicators.
 */
export const StatusVectorBadge: React.FC<{ status: 'online' | 'busy' | 'offline'; size?: number }> = ({
  status,
  size = 12
}) => {
  const colorMap = {
    online: '#22C55E',
    busy: '#EF4444',
    offline: '#9CA3AF'
  };

  return (
    <span
      className="inline-block rounded-full border-2 border-white"
      style={{
        width: size,
        height: size,
        backgroundColor: colorMap[status] || colorMap.offline
      }}
    />
  );
};
