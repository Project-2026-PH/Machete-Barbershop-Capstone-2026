export function resolveOfflineDaemonUrl(isDev: boolean, configuredUrl?: string): string | null {
  const normalized = (configuredUrl || '').trim();
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(?::|\/|$)/i.test(normalized);

  if (isDev) return normalized || 'http://localhost:5000';
  return normalized && !isLocal ? normalized : null;
}
