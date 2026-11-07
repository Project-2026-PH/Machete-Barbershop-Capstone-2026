import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import logger from '../utils/general/logger';

/**
 * Local SQLite database for offline queue operations.
 * Only used by the local cashier node daemon when network is offline.
 * Follows the Repository pattern.
 */
export class LocalQueueDB {
  private db: Database.Database | null = null;

  constructor() {
    // Bypass SQLite initialization on Vercel serverless functions
    if (process.env.VERCEL) {
      logger.info('[SQLite] Running on Vercel. Bypassing Local Queue Database initialization.');
      return;
    }
    try {
      // Ensure data directory exists so db file can be created securely
      const dataDir = path.join(__dirname, '../../data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      const dbPath = path.join(dataDir, 'queue.db');

      // Initiate synchronous connection
      this.db = new Database(dbPath);
      // Enable WAL mode for significant improvements in concurrency
      this.db.pragma('journal_mode = WAL');
      this.initDatabase();
      logger.info('[SQLite] Local Queue Database initialized successfully in WAL mode.');
    } catch (error: any) {
      logger.warn('[SQLite] Failed to initialize Local Queue Database:', error);
      // We let it pass with warning. On cloud (Vercel) this might fail if read-only fs.
      // But this DB is fundamentally built for the local cashier Node daemon.
    }
  }

  private initDatabase(): void {
    if (!this.db) return;
    // We use a comment hint to tell IDEs (like IntelliJ/DataGrip) to parse this as SQLite
    this.db.exec(`
      /* language=sqlite */
      CREATE TABLE IF NOT EXISTS order_queue (
        id INTEGER PRIMARY KEY,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Inserts an order payload into the local queue.
   */
  insertOrder(payload: any): { id: number | bigint; status: string } {
    if (!this.db) throw new Error('SQLite DB not initialized');
    /* language=sqlite */
    const stmt = this.db.prepare(`INSERT INTO order_queue (payload) VALUES (?)`);
    const info = stmt.run(JSON.stringify(payload));
    return { id: info.lastInsertRowid, status: 'pending' };
  }

  /**
   * Retrieves all pending orders from the local queue.
   */
  getPendingOrders(): { id: number; payload: any; status: string; created_at: string }[] {
    if (!this.db) return [];
    /* language=sqlite */
    const stmt = this.db.prepare(`SELECT * FROM order_queue WHERE status = 'pending' ORDER BY created_at ASC`);
    return stmt.all().map((row: any) => ({
      id: row.id,
      payload: JSON.parse(row.payload),
      status: row.status,
      created_at: row.created_at,
    }));
  }

  /**
   * Marks orders as synced by their IDs.
   */
  markAsSynced(ids: number[]): number {
    if (!this.db || !ids || ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    /* language=sqlite */
    const stmt = this.db.prepare(`UPDATE order_queue SET status = 'synced' WHERE id IN (${placeholders})`);
    const info = stmt.run(...ids);
    return info.changes;
  }

  /**
   * Removes a permanently invalid pending order without touching valid queued work.
   */
  discardPendingOrder(id: number): boolean {
    if (!this.db) return false;
    /* language=sqlite */
    const stmt = this.db.prepare(`DELETE FROM order_queue WHERE id = ? AND status = 'pending'`);
    return stmt.run(id).changes > 0;
  }
}

export default LocalQueueDB;
