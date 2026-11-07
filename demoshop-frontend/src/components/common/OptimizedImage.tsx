import React, { useState } from 'react';

export interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  webpSrc?: string;
  avifSrc?: string;
  fallbackSrc?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
}

/**
 * High-performance image component with AVIF/WebP picture source fallbacks,
 * native lazy loading, async decoding, and skeleton blur placeholder.
 */
export const OptimizedImage: React.FC<OptimizedImageProps> = ({
  src,
  alt,
  webpSrc,
  avifSrc,
  fallbackSrc,
  width,
  height,
  className = '',
  style,
  ...props
}) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Derive webp variant automatically if url supports extension swap or Supabase Storage transform
  const resolvedWebp = webpSrc || (src.match(/\.(png|jpe?g)$/i) ? src.replace(/\.(png|jpe?g)$/i, '.webp') : undefined);
  const resolvedAvif = avifSrc || (src.match(/\.(png|jpe?g)$/i) ? src.replace(/\.(png|jpe?g)$/i, '.avif') : undefined);

  return (
    <div
      className={`relative overflow-hidden inline-block ${!loaded && !error ? 'bg-gray-200 animate-pulse' : ''} ${className}`}
      style={{ width, height, ...style }}
    >
      <picture>
        {resolvedAvif && <source srcSet={resolvedAvif} type="image/avif" />}
        {resolvedWebp && <source srcSet={resolvedWebp} type="image/webp" />}
        <img
          src={error && fallbackSrc ? fallbackSrc : src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
          {...props}
        />
      </picture>
    </div>
  );
};
