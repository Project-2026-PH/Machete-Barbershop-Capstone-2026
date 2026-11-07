import db from '../db';
import { DatabaseGateway, requireNonEmpty } from './auth-repository.types';

export interface CreateOAuthTransactionInput {
  stateHash: Buffer;
  codeVerifier: string;
  redirectUri?: string | null;
  expiresAt: Date;
}

export interface OAuthTransaction {
  stateHash: Buffer;
  codeVerifier: string;
  redirectUri: string | null;
  expiresAt: Date;
}

export interface OAuthTransactionRepositoryPort {
  create(input: CreateOAuthTransactionInput): Promise<void>;
  consume(stateHash: Buffer): Promise<OAuthTransaction | null>;
  deleteExpired(): Promise<number>;
}

type OAuthTransactionRow = {
  state_hash: Buffer;
  code_verifier: string;
  redirect_uri: string | null;
  expires_at: Date;
};

const normalizeHash = (hash: Buffer, name: string): Buffer => {
  if (!Buffer.isBuffer(hash) || hash.length === 0) throw new Error(`${name} must not be empty.`);
  return hash;
};

/** PostgreSQL implementation of one-time OAuth/PKCE transactions. */
export class OAuthTransactionRepository implements OAuthTransactionRepositoryPort {
  constructor(private readonly database: DatabaseGateway = db) {}

  async create(input: CreateOAuthTransactionInput): Promise<void> {
    const stateHash = normalizeHash(input.stateHash, 'stateHash');
    const codeVerifier = requireNonEmpty(input.codeVerifier, 'codeVerifier');
    await this.database.query(
      `INSERT INTO public.oauth_transactions
        (state_hash, code_verifier, redirect_uri, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [stateHash, codeVerifier, input.redirectUri ?? null, input.expiresAt],
    );
  }

  async consume(stateHashInput: Buffer): Promise<OAuthTransaction | null> {
    const stateHash = normalizeHash(stateHashInput, 'stateHash');
    const result = await this.database.query<OAuthTransactionRow>(
      `DELETE FROM public.oauth_transactions
       WHERE state_hash = $1
         AND expires_at > NOW()
       RETURNING state_hash, code_verifier, redirect_uri, expires_at`,
      [stateHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      stateHash: row.state_hash,
      codeVerifier: row.code_verifier,
      redirectUri: row.redirect_uri,
      expiresAt: row.expires_at,
    };
  }

  async deleteExpired(): Promise<number> {
    const result = await this.database.query(
      'DELETE FROM public.oauth_transactions WHERE expires_at <= NOW()',
    );
    return result.rowCount ?? 0;
  }
}

export const oauthTransactionRepository = new OAuthTransactionRepository();
export default oauthTransactionRepository;
