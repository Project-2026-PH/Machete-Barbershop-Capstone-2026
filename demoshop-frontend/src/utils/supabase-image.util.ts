const SUPABASE_PUBLIC_OBJECT_MARKER = '/storage/v1/object/public/';
const SUPABASE_PUBLIC_RENDER_PREFIX = '/storage/v1/render/image/public/';

/**
 * Returns a resized Supabase Storage image URL. Storage image transformations
 * negotiate WebP automatically when the browser supports it.
 */
export function getOptimizedSupabaseImageUrl(
  source: string,
  width: number,
  quality = 75,
  height?: number,
): string {
  if (!source || width <= 0) return source;

  try {
    const url = new URL(source);
    const markerIndex = url.pathname.indexOf(SUPABASE_PUBLIC_OBJECT_MARKER);

    if (!url.hostname.endsWith('.supabase.co') || markerIndex === -1) {
      return source;
    }

    const objectPath = url.pathname.slice(
      markerIndex + SUPABASE_PUBLIC_OBJECT_MARKER.length,
    );

    if (!objectPath) return source;

    url.pathname = `${SUPABASE_PUBLIC_RENDER_PREFIX}${objectPath}`;
    url.searchParams.set('width', String(Math.round(width)));
    if (height && height > 0) {
      url.searchParams.set('height', String(Math.round(height)));
      url.searchParams.set('resize', 'cover');
    }
    url.searchParams.set('quality', String(Math.min(100, Math.max(1, quality))));

    return url.toString();
  } catch {
    return source;
  }
}
