import type { PoolClient } from 'pg';
import db from '../db';

export class GuestRepository {
  async findByIdempotencyKeyForUpdate(client: PoolClient, branchId: number, idempotencyKey: string): Promise<any | null> {
    const result = await client.query(
      `SELECT * FROM guest_profiles
       WHERE branch_id = $1 AND idempotency_key = $2
       FOR UPDATE`,
      [branchId, idempotencyKey],
    );
    return result.rows[0] || null;
  }

  async allocateSequence(client: PoolClient, branchId: number, businessDate: string): Promise<number> {
    const result = await client.query(
      `INSERT INTO guest_reference_counters (branch_id, business_date, next_sequence)
       VALUES ($1, $2::date, 2)
       ON CONFLICT (branch_id, business_date)
       DO UPDATE SET next_sequence = guest_reference_counters.next_sequence + 1
       RETURNING next_sequence - 1 AS allocated_sequence`,
      [branchId, businessDate],
    );
    return Number(result.rows[0]?.allocated_sequence);
  }

  async insertProfile(
    client: PoolClient,
    data: {
      branchId: number;
      businessDate: string;
      dailySequence: number;
      guestReference: string;
      normalizedName: string;
      nameDigest: string;
      idempotencyKey?: string;
      qrTokenHash: string;
      qrExpiresAt: string;
      createdBy?: string | null;
    },
  ): Promise<any> {
    const result = await client.query(
      `INSERT INTO guest_profiles (
         branch_id, business_date, daily_sequence, guest_reference,
         normalized_name, name_digest, idempotency_key, qr_token_hash,
         qr_expires_at, created_by
       )
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.branchId,
        data.businessDate,
        data.dailySequence,
        data.guestReference,
        data.normalizedName,
        data.nameDigest,
        data.idempotencyKey ?? null,
        data.qrTokenHash,
        data.qrExpiresAt,
        data.createdBy ?? null,
      ],
    );
    return result.rows[0];
  }

  async redeemQrToken(client: PoolClient, tokenHash: string, branchId: number): Promise<any | null> {
    const result = await client.query(
      `UPDATE guest_profiles
       SET qr_redeemed_at = NOW()
       WHERE qr_token_hash = $1
         AND branch_id = $2
         AND qr_expires_at > NOW()
         AND qr_redeemed_at IS NULL
       RETURNING *`,
      [tokenHash, branchId],
    );
    return result.rows[0] || null;
  }

  async redeemQrTokenPublic(client: PoolClient, tokenHash: string): Promise<any | null> {
    const result = await client.query(
      `UPDATE guest_profiles
       SET qr_redeemed_at = NOW()
       WHERE qr_token_hash = $1
         AND qr_expires_at > NOW()
         AND qr_redeemed_at IS NULL
       RETURNING *`,
      [tokenHash],
    );
    return result.rows[0] || null;
  }

  async findByReference(branchId: number, guestReference: string): Promise<any | null> {
    const result = await db.query(
      `SELECT * FROM guest_profiles
       WHERE branch_id = $1 AND guest_reference = $2
       LIMIT 1`,
      [branchId, guestReference],
    );
    return result.rows[0] || null;
  }

  async findReferenceById(branchId: number, guestProfileId: number): Promise<{ guest_reference: string; qr_expires_at: string } | null> {
    const result = await db.query(
      `SELECT guest_reference, qr_expires_at
       FROM guest_profiles
       WHERE branch_id = $1 AND guest_profile_id = $2
       LIMIT 1`,
      [branchId, guestProfileId],
    );
    return result.rows[0] || null;
  }

  async findHistory(branchId: number, guestProfileId: number): Promise<any[]> {
    const result = await db.query(
      `SELECT qe.id, qe.created_at, qe.status, qe.payment_status,
              COALESCE(s.title, 'Service') AS service,
              COALESCE(b.name, 'Unassigned') AS barber,
              payment.total_amount, payment.payment_method
       FROM queue_entries qe
       LEFT JOIN services s ON s.service_id = qe.service_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       LEFT JOIN LATERAL (
         SELECT SUM(t.total_amount) AS total_amount,
                CASE WHEN COUNT(DISTINCT t.payment_method) = 1 THEN MAX(t.payment_method)
                     WHEN COUNT(*) > 1 THEN STRING_AGG(DISTINCT t.payment_method, ' + ')
                     ELSE NULL END AS payment_method
         FROM transactions t
         WHERE t.queue_entry_id = qe.id AND t.branch_id = qe.branch_id
       ) payment ON TRUE
       WHERE qe.branch_id = $1 AND qe.guest_profile_id = $2
       ORDER BY qe.created_at DESC, qe.id DESC`,
      [branchId, guestProfileId],
    );
    return result.rows;
  }

  async regenerateQrToken(client: PoolClient, guestProfileId: number, branchId: number, tokenHash: string, expiresAt: string): Promise<any | null> {
    const result = await client.query(
      `UPDATE guest_profiles
       SET qr_token_hash = $1, qr_expires_at = $2, qr_redeemed_at = NULL
       WHERE guest_profile_id = $3 AND branch_id = $4
       RETURNING *`,
      [tokenHash, expiresAt, guestProfileId, branchId],
    );
    return result.rows[0] || null;
  }

  /** Rotate a receipt's guest token atomically, without opening another transaction. */
  async regenerateReceiptQrToken(queueEntryId: number, branchId: number, tokenHash: string, expiresAt: string): Promise<any | null> {
    const result = await db.query(
      `UPDATE guest_profiles gp
       SET qr_token_hash = $3, qr_expires_at = $4, qr_redeemed_at = NULL
       FROM queue_entries qe
       WHERE qe.id = $1 AND qe.branch_id = $2 AND qe.payment_status = 'paid'
         AND gp.guest_profile_id = qe.guest_profile_id AND gp.branch_id = qe.branch_id
       RETURNING gp.guest_reference, gp.qr_expires_at`,
      [queueEntryId, branchId, tokenHash, expiresAt],
    );
    return result.rows[0] || null;
  }

  async findForGuestSession(branchId: number, guestProfileId: number): Promise<any | null> {
    const result = await db.query(
      `SELECT guest_profile_id, branch_id, guest_reference, normalized_name,
              business_date, linked_customer_id
       FROM guest_profiles
       WHERE branch_id = $1 AND guest_profile_id = $2
       LIMIT 1`,
      [branchId, guestProfileId],
    );
    return result.rows[0] || null;
  }

  async linkCustomer(client: PoolClient, branchId: number, guestProfileId: number, customerId: number): Promise<any | null> {
    const result = await client.query(
      `UPDATE guest_profiles
       SET linked_customer_id = $3
       WHERE branch_id = $1
         AND guest_profile_id = $2
         AND (linked_customer_id IS NULL OR linked_customer_id = $3)
       RETURNING guest_profile_id, branch_id, guest_reference, linked_customer_id`,
      [branchId, guestProfileId, customerId],
    );
    return result.rows[0] || null;
  }
}

export const guestRepository = new GuestRepository();
