import { barberRepository } from '../../repositories/barber.repository';
import { serviceRepository } from '../../repositories/service.repository';
import { barberService } from '../../services/barber.service';
import { branchService } from '../../services/branch.service';
import { getCache, setCache } from '../../redis';
import { chatbotTelemetry } from './chatbot.telemetry';
import db from '../../db';
import { createHash, timingSafeEqual } from 'node:crypto';
import { decryptGuestVisitLookupCode, hashGuestVisitLookupCode } from '../../utils/cashier/guest-visit-lookup.util';
import { invoiceNumberCandidates, isLookupValueClose, normalizeInvoiceNumber } from './visit-lookup.util';

const publicReadCache = async <T>(key: string, load: () => Promise<T>): Promise<T> => {
  const cached = await getCache<T>(key);
  if (cached !== null) {
    chatbotTelemetry.record('cache_lookup', { result: 'hit' });
    return cached;
  }
  chatbotTelemetry.record('cache_lookup', { result: 'miss' });
  const value = await chatbotTelemetry.tool(key.includes('branches') ? 'public_branches' : 'public_services', load);
  await setCache(key, value, 60);
  return value;
};

export const chatbotRepository = {
  async branches() {
    return publicReadCache('chatbot:public:branches:v1', async () => {
      const rows = await branchService.getPublicBranches('');
      return rows.slice(0, 20).map((branch: any) => ({
        id: Number(branch.branch_id), name: String(branch.name || ''), address: typeof branch.address === 'string' ? branch.address : null,
        maps_url: branch.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(branch.address))}` : null,
      }));
    });
  },
  async services() {
    return publicReadCache('chatbot:public:services:v2', async () => {
      const rows = await serviceRepository.findAll();
      return rows.filter((service: any) => service?.service_id && service?.title && Number.isFinite(Number(service.price)))
        .slice(0, 100).map((service: any) => ({ id: Number(service.service_id), name: String(service.title), description: typeof service.description === 'string' && service.description.trim() ? service.description.trim().slice(0, 500) : null, price: Number(service.price), currency: 'PHP' as const, duration_minutes: Number(service.duration_minutes) > 0 ? Number(service.duration_minutes) : null, price_verified: true }));
    });
  },
  async barbers(branchId?: number, date?: string) {
    const rows = await chatbotTelemetry.tool('public_barbers', () => barberService.getPublicBarbers(branchId ? String(branchId) : undefined, date, true));
    return rows.slice(0, 30).map((row: any) => {
      const barber = row?.barber || row;
      return { id: Number(barber.barber_id), name: String(barber.name || ''), branch_id: branchId ?? null, specialties: Array.isArray(barber.specialties) ? barber.specialties.map(String).slice(0, 12) : [], active: true };
    }).filter((barber: any) => Number.isInteger(barber.id) && barber.id > 0 && barber.name);
  },
  async barberIdsForBranch(branchId: number) {
    return chatbotTelemetry.tool('branch_barbers', async () => (await barberRepository.findActiveBarbersByBranch(String(branchId))).map((row: any) => Number(row.barber_id)).filter((id: number) => Number.isInteger(id) && id > 0).slice(0, 30));
  },
  async findGuestVisit(branchId: number, estimatedDate: string, customerName: string, code: string) {
    const normalizedName = customerName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
    const suppliedHash = createHash('sha256').update(code).digest();
    const result = await chatbotTelemetry.tool('guest_visit_lookup', () => db.query(
      `SELECT COALESCE(qe.service_ends_at, qe.service_started_at, payment.paid_at, qe.created_at) AS performed_at,
              COALESCE(
                 (SELECT SUBSTRING(STRING_AGG(CONCAT(line.item->>'serviceName', CASE WHEN NULLIF(line.item->>'customSpecification', '') IS NULL THEN '' ELSE ' (Style: ' || (line.item->>'customSpecification') || ')' END), ', ' ORDER BY line.ordinality) FROM 1 FOR 120)
                 FROM jsonb_array_elements(rd.receipt_data->'lines') WITH ORDINALITY AS line(item, ordinality)
                 WHERE line.item->>'serviceId' IS NOT NULL),
                s.title, 'Service'
              ) AS service_name,
              COALESCE(NULLIF(TRIM(rd.receipt_data->>'barberName'), ''), NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned barber') AS barber_name,
              gp.visit_lookup_code_hash
       FROM queue_entries qe
       JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN services s ON s.service_id = qe.service_id
       LEFT JOIN receipt_documents rd ON rd.queue_entry_id = qe.id AND rd.branch_id = qe.branch_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       LEFT JOIN users bu ON bu.user_id = b.user_id
       LEFT JOIN LATERAL (
         SELECT MAX(t.created_at) AS paid_at FROM transactions t
         WHERE t.queue_entry_id = qe.id AND t.branch_id = qe.branch_id
       ) payment ON TRUE
       WHERE qe.branch_id = $1 AND qe.is_walk_in = TRUE AND qe.payment_status = 'paid' AND qe.status::text = 'completed'
         AND gp.visit_lookup_code_hash IS NOT NULL
         AND gp.visit_lookup_code_hash = $4
         AND LOWER(REGEXP_REPLACE(TRIM(gp.normalized_name), '\\s+', ' ', 'g')) = $2
         AND (COALESCE(qe.service_ends_at, qe.service_started_at, payment.paid_at, qe.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN ($3::date - 2) AND ($3::date + 2)
       ORDER BY qe.created_at DESC, qe.id DESC LIMIT 20`,
      [branchId, normalizedName, estimatedDate, suppliedHash.toString('hex')],
    ));
    for (const row of result.rows) {
      const storedText = String(row.visit_lookup_code_hash || '').trim();
      if (!/^[a-f0-9]{64}$/i.test(storedText)) continue;
      const storedHash = Buffer.from(storedText, 'hex');
      if (storedHash.length === suppliedHash.length && timingSafeEqual(storedHash, suppliedHash)) {
        return { performed_at: new Date(row.performed_at).toISOString(), service_name: String(row.service_name || 'Service'), barber_name: String(row.barber_name || 'Unassigned barber') };
      }
    }
    return null;
  },
  async findVisitByInvoice(invoiceNumber: string, verifier: string) {
    const candidates = invoiceNumberCandidates(invoiceNumber);
    if (!candidates.length) return null;
    const normalizedInvoice = normalizeInvoiceNumber(invoiceNumber)!;
    const verifierValue = verifier.trim().replace(/^\s*(?:guest\s*ref(?:erence)?|visit\s*lookup\s*code)\s*[:#-]?\s*/i, '');
    const exact = await chatbotTelemetry.tool('guest_visit_lookup', () => db.query(
      `SELECT rd.receipt_number, rd.receipt_data,
              COALESCE(qe.service_ends_at, qe.service_started_at, payment.paid_at, qe.created_at) AS performed_at,
              COALESCE(
                (SELECT SUBSTRING(STRING_AGG(CONCAT(line.item->>'serviceName', CASE WHEN NULLIF(line.item->>'customSpecification', '') IS NULL THEN '' ELSE ' (Style: ' || (line.item->>'customSpecification') || ')' END), ', ' ORDER BY line.ordinality) FROM 1 FOR 120)
                 FROM jsonb_array_elements(rd.receipt_data->'lines') WITH ORDINALITY AS line(item, ordinality)
                 WHERE line.item->>'serviceId' IS NOT NULL),
                s.title, 'Service'
              ) AS service_name,
              COALESCE(NULLIF(TRIM(rd.receipt_data->>'barberName'), ''), NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned barber') AS barber_name,
              gp.guest_reference, gp.visit_lookup_code_hash
       FROM receipt_documents rd
       JOIN queue_entries qe ON qe.id = rd.queue_entry_id AND qe.branch_id = rd.branch_id
       JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
       LEFT JOIN services s ON s.service_id = qe.service_id
       LEFT JOIN barbers b ON b.barber_id = qe.barber_id
       LEFT JOIN users bu ON bu.user_id = b.user_id
       LEFT JOIN LATERAL (SELECT MAX(t.created_at) AS paid_at FROM transactions t WHERE t.queue_entry_id = qe.id AND t.branch_id = qe.branch_id) payment ON TRUE
       WHERE regexp_replace(upper(rd.receipt_number), '[^A-Z0-9]', '', 'g') = $1
         AND qe.is_walk_in = TRUE AND qe.payment_status = 'paid' AND qe.status::text = 'completed'
       LIMIT 1`,
      [normalizedInvoice],
    ));
    const isVerified = (row: any): boolean => {
      const supplied = verifierValue.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const expectedReference = String(row.guest_reference || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      let verified = Boolean(expectedReference && isLookupValueClose(expectedReference, supplied));
      if (!verified && /^[A-Z0-9]{24}$/.test(supplied)) {
        const expectedCode = decryptGuestVisitLookupCode(row.receipt_data?.visitLookupCodeEncrypted);
        const storedHash = String(row.visit_lookup_code_hash || '').trim();
        const expectedHashBuffer = /^[a-f0-9]{64}$/i.test(storedHash) ? Buffer.from(storedHash, 'hex') : Buffer.alloc(0);
        const suppliedHashBuffer = Buffer.from(hashGuestVisitLookupCode(expectedCode || ''), 'hex');
        const hashMatches = expectedHashBuffer.length === suppliedHashBuffer.length && timingSafeEqual(expectedHashBuffer, suppliedHashBuffer);
        verified = Boolean(expectedCode && hashMatches && isLookupValueClose(expectedCode, supplied));
      }
      return verified;
    };
    const toResult = (row: any) => ({
      invoice_number: String(row.receipt_number),
      performed_at: new Date(row.performed_at).toISOString(),
      service_name: String(row.service_name || 'Service'),
      barber_name: String(row.barber_name || 'Unassigned barber'),
    });

    if (exact.rows[0]) return isVerified(exact.rows[0]) ? toResult(exact.rows[0]) : null;

    const fuzzy = await chatbotTelemetry.tool('guest_visit_lookup', () => db.query(
        `SELECT rd.receipt_number, rd.receipt_data,
                COALESCE(qe.service_ends_at, qe.service_started_at, payment.paid_at, qe.created_at) AS performed_at,
                COALESCE(
                  (SELECT SUBSTRING(STRING_AGG(CONCAT(line.item->>'serviceName', CASE WHEN NULLIF(line.item->>'customSpecification', '') IS NULL THEN '' ELSE ' (Style: ' || (line.item->>'customSpecification') || ')' END), ', ' ORDER BY line.ordinality) FROM 1 FOR 120)
                   FROM jsonb_array_elements(rd.receipt_data->'lines') WITH ORDINALITY AS line(item, ordinality)
                   WHERE line.item->>'serviceId' IS NOT NULL), s.title, 'Service') AS service_name,
                COALESCE(NULLIF(TRIM(rd.receipt_data->>'barberName'), ''), NULLIF(TRIM(b.name), ''), NULLIF(TRIM(bu.username), ''), 'Unassigned barber') AS barber_name,
                gp.guest_reference, gp.visit_lookup_code_hash
         FROM receipt_documents rd
         JOIN queue_entries qe ON qe.id = rd.queue_entry_id AND qe.branch_id = rd.branch_id
         JOIN guest_profiles gp ON gp.guest_profile_id = qe.guest_profile_id
         LEFT JOIN services s ON s.service_id = qe.service_id
         LEFT JOIN barbers b ON b.barber_id = qe.barber_id
         LEFT JOIN users bu ON bu.user_id = b.user_id
         LEFT JOIN LATERAL (SELECT MAX(t.created_at) AS paid_at FROM transactions t WHERE t.queue_entry_id = qe.id AND t.branch_id = qe.branch_id) payment ON TRUE
         WHERE regexp_replace(upper(rd.receipt_number), '[^A-Z0-9]', '', 'g') = ANY($1::text[])
           AND qe.is_walk_in = TRUE AND qe.payment_status = 'paid' AND qe.status::text = 'completed'
         LIMIT 100`,
        [candidates.filter(candidate => candidate !== normalizedInvoice)],
      ));
    const verifiedRows = fuzzy.rows.filter(isVerified);
    return verifiedRows.length === 1 ? toResult(verifiedRows[0]) : null;
  },
};

