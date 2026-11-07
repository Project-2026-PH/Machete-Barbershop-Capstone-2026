import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request } from 'express';
import db from '../db';
import { logSecurityEvent } from './audit.service';
import logger from '../utils/general/logger';

/**
 * Represents a registered machine client. The `secretHash` is a
 * bcrypt hash of the secret — the plaintext secret is shown only
 * once at registration and never stored.
 */
export interface MachineClient {
  clientId: string;
  secretHash: string;
  name: string;
  status: 'active' | 'disabled' | 'revoked';
  allowedScopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
}

/** All scopes that may be assigned to a machine client. */
export const VALID_SCOPES = [
  'bookings:read',
  'bookings:write',
  'reports:read',
  'services:read',
  'branches:read',
] as const;

export type ApiScope = typeof VALID_SCOPES[number];
export const SERVICE_TOKEN_TTL_SECONDS = 15 * 60;
const BCRYPT_ROUNDS = 12;
const MAX_NAME_LENGTH = 100;
const MAX_CLIENT_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const CLIENT_ID_PATTERN = /^svc_[a-f0-9]{32}$/;
const DUMMY_SECRET_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

type ClientLifecycleContext = { actorId?: string | null; req?: Request };

type ClientRow = {
  client_id: string;
  secret_hash: string;
  name: string;
  status: MachineClient['status'];
  allowed_scopes: string[];
  created_at: Date | string;
  expires_at: Date | string | null;
  last_used_at: Date | string | null;
};

/** Safe, client-facing validation failure. */
export class ClientCredentialsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientCredentialsInputError';
  }
}

const asDate = (value: Date | string | null): Date | null => {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toClient = (row: ClientRow): MachineClient => ({
  clientId: row.client_id,
  secretHash: row.secret_hash,
  name: row.name,
  status: row.status,
  allowedScopes: [...row.allowed_scopes],
  createdAt: asDate(row.created_at)!,
  expiresAt: asDate(row.expires_at),
  lastUsedAt: asDate(row.last_used_at),
});

const safeClient = (client: MachineClient): Omit<MachineClient, 'secretHash'> => {
  const { secretHash: _secretHash, ...withoutSecretHash } = client;
  return withoutSecretHash;
};

const validateName = (name: unknown): string => {
  if (typeof name !== 'string') {
    throw new ClientCredentialsInputError('name must be a string.');
  }

  const normalized = name.trim();
  if (!normalized || normalized.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new ClientCredentialsInputError(`name must be between 1 and ${MAX_NAME_LENGTH} characters.`);
  }
  return normalized;
};

const validateScopes = (scopes: unknown): ApiScope[] => {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new ClientCredentialsInputError('allowedScopes must be a non-empty array.');
  }

  if (scopes.some((scope) => typeof scope !== 'string')) {
    throw new ClientCredentialsInputError('allowedScopes must contain only strings.');
  }

  const normalized = scopes as string[];
  const duplicates = new Set(normalized).size !== normalized.length;
  if (duplicates) {
    throw new ClientCredentialsInputError('allowedScopes must not contain duplicates.');
  }

  const unknown = normalized.filter((scope) => !(VALID_SCOPES as readonly string[]).includes(scope));
  if (unknown.length > 0) {
    throw new ClientCredentialsInputError('allowedScopes contains an unsupported scope.');
  }

  return normalized as ApiScope[];
};

const validateExpiration = (value: Date | string | null | undefined): Date | null => {
  if (value === undefined || value === null || value === '') return null;

  const expiresAt = value instanceof Date ? value : new Date(value);
  const now = Date.now();
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now) {
    throw new ClientCredentialsInputError('expiresAt must be a valid future date.');
  }
  if (expiresAt.getTime() > now + MAX_CLIENT_LIFETIME_MS) {
    throw new ClientCredentialsInputError('expiresAt must be within one year.');
  }
  return expiresAt;
};

const auditLifecycleEvent = (
  action: string,
  clientId: string,
  context: ClientLifecycleContext,
  details: Record<string, unknown> = {},
): void => {
  void logSecurityEvent({
    userId: context.actorId || null,
    action,
    resource: 'machine_client',
    details: { clientId, ...details },
    req: context.req,
  });
};

export class ClientCredentialsService {
  private async findClient(clientId: string): Promise<MachineClient | null> {
    const result = await db.query(
      `SELECT client_id, secret_hash, name, status, allowed_scopes, created_at, expires_at, last_used_at
       FROM machine_clients WHERE client_id = $1`,
      [clientId],
    );
    return result.rows[0] ? toClient(result.rows[0] as ClientRow) : null;
  }

  /** Registers a client and returns its plaintext secret exactly once. */
  async registerClient(params: {
    name: unknown;
    allowedScopes: readonly string[];
    expiresAt?: Date | string | null;
    actorId?: string | null;
    req?: Request;
  }): Promise<{ client: Omit<MachineClient, 'secretHash'>; plaintextSecret: string }> {
    const name = validateName(params.name);
    const allowedScopes = validateScopes(params.allowedScopes);
    const expiresAt = validateExpiration(params.expiresAt);
    const clientId = `svc_${crypto.randomBytes(16).toString('hex')}`;
    const plaintextSecret = crypto.randomBytes(32).toString('base64url');
    const secretHash = await bcrypt.hash(plaintextSecret, BCRYPT_ROUNDS);

    const result = await db.query(
      `INSERT INTO machine_clients
         (client_id, secret_hash, name, allowed_scopes, expires_at, created_by)
       VALUES ($1, $2, $3, $4::text[], $5, $6)
       RETURNING client_id, secret_hash, name, status, allowed_scopes, created_at, expires_at, last_used_at`,
      [clientId, secretHash, name, allowedScopes, expiresAt, params.actorId || null],
    );

    const client = toClient(result.rows[0] as ClientRow);
    logger.info('[ClientCredentials] Client registered', { clientId, name });
    auditLifecycleEvent('MACHINE_CLIENT_CREATED', clientId, params, {
      name,
      allowedScopes: client.allowedScopes,
      expiresAt: client.expiresAt,
    });

    return { client: safeClient(client), plaintextSecret };
  }

  /** Authenticates a client without distinguishing unknown IDs from bad secrets. */
  async authenticateClient(clientId: string, clientSecret: string): Promise<MachineClient | null> {
    const client = await this.findClient(clientId);
    if (!client) {
      await bcrypt.compare(clientSecret, DUMMY_SECRET_HASH);
      return null;
    }
    if (client.status !== 'active' || (client.expiresAt && client.expiresAt <= new Date())) return null;

    const valid = await bcrypt.compare(clientSecret, client.secretHash);
    if (!valid) return null;

    const lastUsedAt = new Date();
    await db.query('UPDATE machine_clients SET last_used_at = $1, updated_at = NOW() WHERE client_id = $2', [lastUsedAt, clientId]);
    client.lastUsedAt = lastUsedAt;
    return client;
  }

  /** Disables a client without deleting its history. */
  async disableClient(clientId: string, context: ClientLifecycleContext = {}): Promise<boolean> {
    if (!CLIENT_ID_PATTERN.test(clientId)) return false;
    const result = await db.query(
      `UPDATE machine_clients
       SET status = 'disabled', disabled_at = NOW(), updated_at = NOW()
       WHERE client_id = $1 AND status = 'active'
       RETURNING client_id`,
      [clientId],
    );
    if (result.rowCount !== 1) return false;

    logger.info('[ClientCredentials] Client disabled', { clientId });
    auditLifecycleEvent('MACHINE_CLIENT_DISABLED', clientId, context);
    return true;
  }

  /** Permanently revokes a client. Revocation is durable in Postgres. */
  async revokeClient(clientId: string, context: ClientLifecycleContext = {}): Promise<boolean> {
    if (!CLIENT_ID_PATTERN.test(clientId)) return false;
    const result = await db.query(
      `UPDATE machine_clients
       SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
       WHERE client_id = $1 AND status <> 'revoked'
       RETURNING client_id`,
      [clientId],
    );
    if (result.rowCount !== 1) return false;

    logger.info('[ClientCredentials] Client revoked', { clientId });
    auditLifecycleEvent('MACHINE_CLIENT_REVOKED', clientId, context);
    return true;
  }

  /** Rotates an active client's secret and returns the new plaintext once. */
  async rotateSecret(clientId: string, context: ClientLifecycleContext = {}): Promise<string | null> {
    if (!CLIENT_ID_PATTERN.test(clientId)) return null;
    const client = await this.findClient(clientId);
    if (!client || client.status !== 'active' || (client.expiresAt && client.expiresAt <= new Date())) return null;

    const plaintextSecret = crypto.randomBytes(32).toString('base64url');
    const secretHash = await bcrypt.hash(plaintextSecret, BCRYPT_ROUNDS);
    const result = await db.query(
      `UPDATE machine_clients SET secret_hash = $1, updated_at = NOW()
       WHERE client_id = $2 AND status = 'active' RETURNING client_id`,
      [secretHash, clientId],
    );
    if (result.rowCount !== 1) return null;

    logger.info('[ClientCredentials] Secret rotated', { clientId });
    auditLifecycleEvent('MACHINE_CLIENT_ROTATED', clientId, context);
    return plaintextSecret;
  }

  /** Returns a client record without its secret hash. */
  async getClient(clientId: string): Promise<Omit<MachineClient, 'secretHash'> | null> {
    if (!CLIENT_ID_PATTERN.test(clientId)) return null;
    const client = await this.findClient(clientId);
    return client ? safeClient(client) : null;
  }

  /** Test-only cleanup for one client; production callers cannot use this helper. */
  async _clearForTest(clientId: string): Promise<void> {
    if (process.env.NODE_ENV !== 'test') return;
    await db.query('DELETE FROM machine_clients WHERE client_id = $1', [clientId]);
  }
}

export const clientCredentialsService = new ClientCredentialsService();
export default clientCredentialsService;
