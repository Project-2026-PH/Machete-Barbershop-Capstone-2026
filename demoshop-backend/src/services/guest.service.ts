import { AppError } from '../utils/error/AppError';
import { config } from '../config/env';
import { guestRepository } from '../repositories/guest.repository';
import { queueRepository } from '../repositories/queue.repository';
import { customerRepository } from '../repositories/customer.repository';
import {
  createGuestQrCode,
  createGuestQrToken,
  formatGuestReference,
  GUEST_QR_TTL_MS,
  getBusinessDate,
  getGuestNameDigest,
  hashGuestQrToken,
  normalizeGuestName,
} from '../utils/cashier/guest-reference.util';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,80}$/;

export interface GuestCreationData {
  branchId: number;
  customerName: string;
  idempotencyKey?: string;
  createdBy?: string | null;
}

export class GuestService {
  async createForWalkIn(client: import('pg').PoolClient, data: GuestCreationData): Promise<{
    profile: any;
    qrToken: string | null;
    qrCodeDataUrl: string | null;
    reused: boolean;
  }> {
    if (data.idempotencyKey) {
      const existing = await guestRepository.findByIdempotencyKeyForUpdate(client, data.branchId, data.idempotencyKey);
      if (existing) return { profile: existing, qrToken: null, qrCodeDataUrl: null, reused: true };
    }

    const normalizedName = normalizeGuestName(data.customerName);
    const businessDate = getBusinessDate(new Date(), config.gcash.businessTimeZone);
    const nameDigest = getGuestNameDigest(normalizedName, config.auth.jwtSecret);
    const dailySequence = await guestRepository.allocateSequence(client, data.branchId, businessDate);

    // A concurrent retry may have committed while the daily counter was locked.
    if (data.idempotencyKey) {
      const existing = await guestRepository.findByIdempotencyKeyForUpdate(client, data.branchId, data.idempotencyKey);
      if (existing) return { profile: existing, qrToken: null, qrCodeDataUrl: null, reused: true };
    }

    const qrToken = createGuestQrToken();
    const profile = await guestRepository.insertProfile(client, {
      branchId: data.branchId,
      businessDate,
      dailySequence,
      guestReference: formatGuestReference(businessDate, nameDigest, dailySequence),
      normalizedName,
      nameDigest,
      idempotencyKey: data.idempotencyKey,
      qrTokenHash: hashGuestQrToken(qrToken),
      qrExpiresAt: new Date(Date.now() + GUEST_QR_TTL_MS).toISOString(),
      createdBy: data.createdBy,
    });

    return {
      profile,
      qrToken,
      qrCodeDataUrl: null,
      reused: false,
    };
  }

  async generateQrCode(token: string): Promise<string> {
    return createGuestQrCode(token);
  }

  private extractGuestToken(tokenInput: string): string {
    const input = tokenInput.trim();
    if (input.startsWith('http://') || input.startsWith('https://')) {
      try {
        const url = new URL(input);
        const token = new URLSearchParams(url.hash.replace(/^#/, '')).get('token');
        if (token) return token.replace(/^MCH-GUEST:/i, '');
      } catch {
        // Fall through to the legacy payload parser and return the same generic error.
      }
    }
    return input.replace(/^MCH-GUEST:/i, '');
  }

  async redeemQrToken(tokenInput: string, branchId?: number): Promise<any> {
    const token = this.extractGuestToken(tokenInput);
    if (!TOKEN_PATTERN.test(token)) throw new AppError('Guest QR code is invalid or expired.', 404);

    const profile = await queueRepository.withTransaction((client) =>
      branchId === undefined
        ? guestRepository.redeemQrTokenPublic(client, hashGuestQrToken(token))
        : guestRepository.redeemQrToken(client, hashGuestQrToken(token), branchId),
    );
    if (!profile) {
      throw new AppError('Guest QR code is invalid or expired.', 404);
    }

    const history = await guestRepository.findHistory(Number(profile.branch_id), Number(profile.guest_profile_id));
    return {
      guestProfileId: Number(profile.guest_profile_id),
      branchId: Number(profile.branch_id),
      guestReference: profile.guest_reference,
      customerName: profile.normalized_name,
      businessDate: profile.business_date,
      history,
    };
  }

  async getSession(branchId: number, guestProfileId: number): Promise<any> {
    const profile = await guestRepository.findForGuestSession(branchId, guestProfileId);
    if (!profile) throw new AppError('Guest session is invalid or expired.', 401);

    return {
      guestReference: profile.guest_reference,
      customerName: profile.normalized_name,
      businessDate: profile.business_date,
      linked: Boolean(profile.linked_customer_id),
      history: await guestRepository.findHistory(branchId, guestProfileId),
    };
  }

  async linkSessionToCustomer(
    branchId: number,
    guestProfileId: number,
    userId: string,
    userRole: string | null | undefined,
    isVerified: boolean | null | undefined,
  ): Promise<{ linked: true; guestReference: string }> {
    if (userRole !== 'Customer' || isVerified !== true) {
      throw new AppError('A verified Customer account is required to link guest history.', 403);
    }

    const customerId = await customerRepository.findCustomerIdByUserId(userId);
    if (!customerId) throw new AppError('Customer profile not found.', 404);

    const profile = await guestRepository.findForGuestSession(branchId, guestProfileId);
    if (!profile) throw new AppError('Guest session is invalid or expired.', 401);
    if (profile.linked_customer_id && Number(profile.linked_customer_id) !== customerId) {
      throw new AppError('This guest history is already linked to another account.', 409);
    }

    const linked = await queueRepository.withTransaction((client) =>
      guestRepository.linkCustomer(client, branchId, guestProfileId, customerId),
    );
    if (!linked) throw new AppError('This guest history is already linked to another account.', 409);

    return { linked: true, guestReference: linked.guest_reference };
  }

  async getByReference(branchId: number, guestReference: string): Promise<any> {
    if (!/^[0-9A-Z-]{8,12}$/.test(guestReference.trim().toUpperCase())) {
      throw new AppError('Guest reference was not found.', 404);
    }
    const profile = await guestRepository.findByReference(branchId, guestReference.trim().toUpperCase());
    if (!profile) throw new AppError('Guest reference was not found.', 404);
    return {
      guestReference: profile.guest_reference,
      customerName: profile.normalized_name,
      businessDate: profile.business_date,
      history: await guestRepository.findHistory(branchId, Number(profile.guest_profile_id)),
    };
  }

  async getReferenceById(branchId: number, guestProfileId: number): Promise<{ profile: { guest_reference: string; qr_expires_at: string }; qrCodeDataUrl: null } | null> {
    const profile = await guestRepository.findReferenceById(branchId, guestProfileId);
    return profile ? { profile, qrCodeDataUrl: null } : null;
  }

  async regenerateQrToken(branchId: number, guestProfileId: number): Promise<any> {
    if (!Number.isSafeInteger(guestProfileId) || guestProfileId < 1) {
      throw new AppError('Guest profile was not found.', 404);
    }
    const qrToken = createGuestQrToken();
    const profile = await queueRepository.withTransaction((client) => guestRepository.regenerateQrToken(
      client,
      guestProfileId,
      branchId,
      hashGuestQrToken(qrToken),
      new Date(Date.now() + GUEST_QR_TTL_MS).toISOString(),
    ));
    if (!profile) throw new AppError('Guest profile was not found.', 404);
    return {
      guestReference: profile.guest_reference,
      qrToken,
      qrCodeDataUrl: await createGuestQrCode(qrToken),
      expiresAt: profile.qr_expires_at,
    };
  }

  async regenerateReceiptQrToken(branchId: number, queueEntryId: number): Promise<{ qrCodeDataUrl: string } | null> {
    const token = createGuestQrToken();
    const profile = await guestRepository.regenerateReceiptQrToken(
      queueEntryId, branchId, hashGuestQrToken(token), new Date(Date.now() + GUEST_QR_TTL_MS).toISOString(),
    );
    return profile ? { qrCodeDataUrl: await createGuestQrCode(token) } : null;
  }
}

export const guestService = new GuestService();
