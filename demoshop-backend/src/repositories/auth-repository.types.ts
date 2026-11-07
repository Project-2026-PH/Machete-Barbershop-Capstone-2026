/**
 * Small database port used by auth repositories.
 *
 * Repositories depend on this abstraction instead of a concrete Pool, which
 * keeps SQL behavior testable without opening a database connection and makes
 * the production db adapter replaceable.
 */
export interface QueryResultLike<Row> {
  rows: Row[];
  rowCount?: number | null;
}

export interface QueryExecutor {
  query<Row = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResultLike<Row>>;
}

export interface TransactionClient extends QueryExecutor {
  release(): void;
}

export interface DatabaseGateway extends QueryExecutor {
  connect(): Promise<TransactionClient>;
}

export const normalizeAuthEmail = (email: string): string => email.trim().toLowerCase();

export const requirePositiveSeconds = (value: number, name: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

export const requireNonEmpty = (value: string, name: string): string => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must not be empty.`);
  return normalized;
};
