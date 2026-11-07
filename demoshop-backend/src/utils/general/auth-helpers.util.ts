import { Request } from 'express';

/**
 * Utility to safely parse first and last name from a full name string,
 * falling back to defaults if not split.
 */
export function parseNameString(fullName: string): { firstName: string; lastName: string } {
  const nameParts = (fullName || '').split(/[ ._+]/).filter(Boolean);
  const firstName = nameParts[0] || 'Google';
  const lastName = nameParts.slice(1).join(' ') || 'User';
  return { firstName, lastName };
}

/**
 * Utility to reliably extract protocol and host from request,
 * respecting reverse proxies (x-forwarded-proto).
 */
export function getProtocolAndHost(req: Request): { protocol: string; host: string } {
  const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const host = req.get('host') || 'localhost:5000';
  return { protocol, host };
}
