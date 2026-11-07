import { diagnosticsRepository } from '../repositories/diagnostics.repository';
import { queueRepository } from '../repositories/queue.repository';
import { barberRepository } from '../repositories/barber.repository';
import { queueService } from './queue.service';
import { feedbackRepository } from '../repositories/feedback.repository';
import { barberService } from './barber.service';
import { emailService } from './email.service';
import { auditService } from './audit.service';
import { AppError } from '../utils/error/AppError';
import logger from '../utils/general/logger';
import type { AuthoritativeUserContext } from '../security/policies/queue.policy';
import {
  getReservationDecisionEmailHtml,
  getVerificationEmailHtml,
  getForgotPasswordEmailHtml,
  getChangePasswordEmailHtml,
  getStockReportEmailHtml,
  type StockReportEmailReport,
  type ReservationDecisionEmailPayload,
} from '../utils/email/email-templates.util';
import { renderReceiptHtml } from '../utils/receipt/receipt-renderer.util';
import type {
  ReceiptDocument,
  DiagnosticCreateReservationDto,
  DiagnosticReservationResult,
  DiagnosticInsertWalkInsDto,
  DiagnosticWalkInsResult,
  DiagnosticWalkInEntry,
  DiagnosticSkipQueueDto,
  DiagnosticCreateReviewDto,
  DiagnosticEmailPreviewDto,
  DiagnosticEmailPreviewResult,
  DiagnosticSendTestEmailDto,
  DiagnosticSendTestEmailResult,
  DiagnosticTestDataCounts,
  DiagnosticTestDataReviewResponse,
  DiagnosticCleanupDto,
  DiagnosticCleanupResult,
} from '@demoshop/shared-types';

export class DiagnosticToolsService {
  private emailRateLimitMap = new Map<string, number[]>();
  private diagnosticCustomerPromise: ReturnType<typeof diagnosticsRepository.findOrCreateDiagnosticCustomer> | null = null;

  /**
   * Enforces server-side rate limiting on test email sending (max 5 emails per minute per user).
   */
  private checkEmailRateLimit(userId: string): void {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxAllowed = 5;

    const timestamps = (this.emailRateLimitMap.get(userId) || []).filter(
      (ts) => now - ts < windowMs
    );

    if (timestamps.length >= maxAllowed) {
      throw new AppError(
        'Test email rate limit reached (maximum 5 emails per minute). Please wait before sending another test email.',
        429
      );
    }

    timestamps.push(now);
    this.emailRateLimitMap.set(userId, timestamps);
  }

  /**
   * 1. Reservation Simulator
   * Reuses real queueService.joinQueue with internal payment bypass and is_test flag.
   */
  async createTestReservation(
    dto: DiagnosticCreateReservationDto,
    userContext: AuthoritativeUserContext,
    req?: any
  ): Promise<DiagnosticReservationResult> {
    const branchId = Number(dto.branchId);
    const barberId = Number(dto.barberId);
    const serviceIds = Array.isArray(dto.serviceIds) ? dto.serviceIds.map(Number) : [];
    const hasValidIds = Number.isInteger(branchId) && branchId > 0
      && Number.isInteger(barberId) && barberId > 0
      && serviceIds.length > 0
      && serviceIds.every((id) => Number.isInteger(id) && id > 0);
    if (!hasValidIds) {
      throw new AppError('Branch, barber, and at least one valid service are required.', 400);
    }
    if (!dto.preferredDate || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dto.preferredDate) || !dto.preferredTime.trim()) {
      throw new AppError('A valid preferred date and time are required.', 400);
    }
    if (dto.initialStatus && dto.initialStatus !== 'pending' && dto.initialStatus !== 'accepted') {
      throw new AppError('Initial status must be pending or accepted.', 400);
    }

    // The diagnostics customer is shared by all synthetic reservations. Reuse
    // the lookup promise so repeated test bookings do not query customers every time.
    if (!this.diagnosticCustomerPromise) {
      this.diagnosticCustomerPromise = diagnosticsRepository.findOrCreateDiagnosticCustomer().catch((error) => {
        this.diagnosticCustomerPromise = null;
        throw error;
      });
    }
    const diagnosticCustomer = await this.diagnosticCustomerPromise;
    const idempotencyKey = dto.idempotencyKey?.trim() || `diag_test_res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Call queueService.joinQueue with strict safety rules preserved and payment proof bypassed
    const created = await queueService.joinQueue({
      customerId: diagnosticCustomer.customer_id,
      barberId,
      branchId,
      serviceIds,
      preferredDate: dto.preferredDate,
      preferredTime: dto.preferredTime,
      initialStatus: dto.initialStatus === 'accepted' ? 'accepted' : 'pending',
      bypassPaymentProof: true,
      isTest: true,
      diagnosticIdempotencyKey: idempotencyKey,
    });

    let currentStatus = created.status || (dto.initialStatus === 'accepted' ? 'accepted' : 'pending');

    // If initial status is accepted and entry is still pending, formally accept the reservation
    if (dto.initialStatus === 'accepted' && created.status === 'pending') {
      try {
        await queueService.acceptReservation(created.id, branchId, {
          cashierName: 'System Admin',
        });
        currentStatus = 'accepted';
      } catch (acceptErr) {
        logger.warn('[DiagnosticToolsService] Auto-acceptance failed, keeping pending', {
          queueId: created.id,
          error: acceptErr,
        });
        currentStatus = 'pending';
      }
    }

    // Query enriched entry for clean presentation
    const enriched = await queueRepository.findById(created.id);

    // Audit log
    await auditService.logSecurityEvent({
      userId: userContext.userId,
      action: 'TEST_RESERVATION_CREATED',
      resource: 'diagnostics',
      details: {
        queueId: created.id,
        barberId: dto.barberId,
        branchId: dto.branchId,
        date: dto.preferredDate,
        time: dto.preferredTime,
        status: currentStatus,
      },
      req,
    });

    const serviceTitles = enriched?.services?.map((s: any) => s.title) ||
      (enriched?.service_name ? [enriched.service_name] : ['Service']);

    return {
      id: created.id,
      customerName: 'Test Customer',
      barberName: enriched?.barber_name || 'Barber',
      serviceTitles,
      preferredDate: dto.preferredDate,
      preferredTime: dto.preferredTime,
      status: currentStatus,
      referenceNumber: enriched?.reference_number || null,
    };
  }

  /**
   * 2. Walk-in Generator
   * Reuses real queueService.addWalkIn sequentially for 1..20 walk-ins.
   */
  async insertTestWalkIns(
    dto: DiagnosticInsertWalkInsDto,
    userContext: AuthoritativeUserContext,
    req?: any
  ): Promise<DiagnosticWalkInsResult> {
    const qty = Number(dto.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      throw new AppError('Quantity must be an integer between 1 and 20.', 400);
    }
    if (!dto.branchId || !dto.barberId || !dto.serviceIds || dto.serviceIds.length === 0) {
      throw new AppError('Branch, barber, and at least one service are required.', 400);
    }

    const batchId = dto.idempotencyKey?.trim() || Date.now().toString(36);
    const createdEntries: DiagnosticWalkInEntry[] = [];

    for (let i = 1; i <= qty; i++) {
      const formattedNum = String(i).padStart(2, '0');
      const guestName = `[TEST] Walk-in ${formattedNum}`;
      const idempotencyKey = `diag_test_walkin_${batchId}_${i}`;

      const entry = await queueService.addWalkIn({
        branchId: Number(dto.branchId),
        barberId: Number(dto.barberId),
        serviceIds: dto.serviceIds.map(Number),
        customerName: guestName,
        isTest: true,
        idempotencyKey,
      });

      createdEntries.push({
        id: entry.id,
        customerName: guestName,
        position: entry.position,
        status: entry.status,
      });
    }

    const barber = await barberRepository.findBarberById(Number(dto.barberId));
    const barberName = barber?.name || 'Barber';

    const startPosition = createdEntries[0]?.position || 1;
    const endPosition = createdEntries[createdEntries.length - 1]?.position || startPosition;

    // Single consolidated audit event
    await auditService.logSecurityEvent({
      userId: userContext.userId,
      action: 'TEST_WALKINS_INSERTED',
      resource: 'diagnostics',
      details: {
        count: qty,
        barberId: dto.barberId,
        barberName,
        branchId: dto.branchId,
        positions: `#${startPosition}–#${endPosition}`,
      },
      req,
    });

    return {
      count: qty,
      barberName,
      startPosition,
      endPosition,
      entries: createdEntries,
    };
  }

  /**
   * Retrieves active queue for a specific barber for Queue Skip UI inspection.
   */
  async getLiveBarberQueueForSkip(barberId: number): Promise<any[]> {
    return diagnosticsRepository.getLiveBarberQueueForSkip(barberId);
  }

  /**
   * 3. Queue Skip
   * Selects correct domain operation: cancelQueue for active entries or cancelReservation/markReservationNoShow for reservations.
   */
  async skipQueueEntry(
    queueId: number,
    dto: DiagnosticSkipQueueDto,
    userContext: AuthoritativeUserContext,
    req?: any
  ): Promise<{ success: boolean; message: string }> {
    const entry = await queueRepository.findById(queueId);
    if (!entry) {
      throw new AppError('Queue entry not found.', 404);
    }

    const isTestEntry = Boolean(entry.is_test);
    const reason = dto.reason?.trim() || (dto.reasonCategory === 'not_present' ? 'Customer Not Present' : 'Test / Demonstration');

    // Route to correct domain behavior
    if (['waiting', 'serving'].includes(entry.status)) {
      await queueService.cancelQueue(queueId, undefined, reason, userContext, { allowInService: true });
    } else if (entry.type === 'reservation' || entry.preferred_date) {
      if (entry.status === 'accepted' && dto.reasonCategory === 'not_present') {
        try {
          await queueService.markReservationNoShow(queueId, entry.branch_id, userContext);
        } catch {
          await queueService.cancelReservation(queueId, entry.branch_id, reason, 'staff_side', {
            cashierName: 'System Admin',
          });
        }
      } else {
        await queueService.cancelReservation(queueId, entry.branch_id, reason, 'staff_side', {
          cashierName: 'System Admin',
        });
      }
    } else {
      await queueService.cancelQueue(queueId, undefined, reason, userContext, { allowInService: true });
    }

    await auditService.logSecurityEvent({
      userId: userContext.userId,
      action: 'QUEUE_ENTRY_SKIPPED',
      resource: 'diagnostics',
      details: {
        queueId,
        customerName: entry.guest_name || entry.customer_name || 'Customer',
        barberId: entry.barber_id,
        isTest: isTestEntry,
        reason,
      },
      req,
    });

    return {
      success: true,
      message: `Queue entry #${queueId} (${entry.guest_name || entry.customer_name || 'Customer'}) skipped successfully.`,
    };
  }

  /**
   * 4. Barber Review Generator
   * Reuses real feedbackRepository with internal diagnostic customer and is_test = TRUE.
   */
  async createTestReview(
    dto: DiagnosticCreateReviewDto,
    userContext: AuthoritativeUserContext,
    req?: any
  ): Promise<{ success: boolean; message: string; ratingId: number }> {
    const stars = Number(dto.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new AppError('Rating must be an integer between 1 and 5 stars.', 400);
    }
    if (!dto.barberId) {
      throw new AppError('Barber selection is required.', 400);
    }

    const diagnosticCustomer = await diagnosticsRepository.findOrCreateDiagnosticCustomer();
    const isPublic = dto.showInPublicPortfolio !== false;

    const inserted = await feedbackRepository.insertRating({
      customerId: diagnosticCustomer.customer_id,
      barberId: Number(dto.barberId),
      stars,
      comment: dto.comment?.trim() || 'Test review generated via Diagnostics.',
      isTest: true,
      isPublicTest: isPublic,
    });

    // Invalidate barber cache so rating calculation updates immediately
    await barberService.invalidateBarberCache(Number(dto.barberId));

    await auditService.logSecurityEvent({
      userId: userContext.userId,
      action: 'TEST_REVIEW_CREATED',
      resource: 'diagnostics',
      details: {
        ratingId: inserted.rating_id,
        barberId: dto.barberId,
        stars,
        showInPublicPortfolio: isPublic,
      },
      req,
    });

    return {
      success: true,
      message: 'Test review created successfully.',
      ratingId: inserted.rating_id,
    };
  }

  /**
   * Helper to assemble HTML and Subject for an email template without sending.
   */
  private buildEmailTemplate(
    templateType: string,
    variables: Record<string, any> = {}
  ): { subject: string; html: string } {
    const norm = templateType.toUpperCase().replace(/-/g, '_');

    switch (norm) {
      case 'BOOKING_RECEIVED': {
        const payload: ReservationDecisionEmailPayload = {
          decision: 'RECEIVED',
          customerName: variables.customerName || 'Test Customer',
          barberName: variables.barberName || 'Alex Santos',
          branchName: variables.branchName || "DemoShop's Barbers — SampleBranch",
          branchAddress: variables.branchAddress || 'Ground floor, SampleBranch, SJDM Bulacan',
          preferredDate: variables.preferredDate || new Date().toISOString().slice(0, 10),
          preferredTime: variables.preferredTime || '10:00 AM',
          services: [{ title: variables.serviceTitle || 'Signature Haircut', price: 350 }],
          totalAmount: 350,
          depositPaid: 100,
          remainingBalance: 250,
          cashierName: 'Front Desk',
          actionTimestamp: new Date(),
        };
        return {
          subject: `Booking Received & Under Review - DemoShop's Barbers (${payload.preferredDate})`,
          html: getReservationDecisionEmailHtml(payload),
        };
      }
      case 'RESERVATION_CONFIRMED': {
        const payload: ReservationDecisionEmailPayload = {
          decision: 'CONFIRMED',
          customerName: variables.customerName || 'Test Customer',
          barberName: variables.barberName || 'Alex Santos',
          branchName: variables.branchName || "DemoShop's Barbers — SampleBranch",
          branchAddress: variables.branchAddress || 'Ground floor, SampleBranch, SJDM Bulacan',
          preferredDate: variables.preferredDate || new Date().toISOString().slice(0, 10),
          preferredTime: variables.preferredTime || '10:00 AM',
          services: [{ title: variables.serviceTitle || 'Signature Haircut', price: 350 }],
          totalAmount: 350,
          depositPaid: 100,
          remainingBalance: 250,
          cashierName: 'Front Desk',
          actionTimestamp: new Date(),
        };
        return {
          subject: `Reservation Confirmed - DemoShop's Barbers (${payload.preferredDate})`,
          html: getReservationDecisionEmailHtml(payload),
        };
      }
      case 'RESERVATION_DECLINED': {
        const payload: ReservationDecisionEmailPayload = {
          decision: 'DECLINED',
          customerName: variables.customerName || 'Test Customer',
          barberName: variables.barberName || 'Alex Santos',
          branchName: variables.branchName || "DemoShop's Barbers — SampleBranch",
          branchAddress: variables.branchAddress || 'Ground floor, SampleBranch, SJDM Bulacan',
          preferredDate: variables.preferredDate || new Date().toISOString().slice(0, 10),
          preferredTime: variables.preferredTime || '10:00 AM',
          services: [{ title: variables.serviceTitle || 'Signature Haircut', price: 350 }],
          totalAmount: 350,
          depositPaid: 100,
          remainingBalance: 250,
          cashierName: 'Front Desk',
          actionTimestamp: new Date(),
          declineReason: variables.declineReason || 'Requested time slot is fully booked for maintenance.',
        };
        return {
          subject: `Reservation Update - DemoShop's Barbers (${payload.preferredDate})`,
          html: getReservationDecisionEmailHtml(payload),
        };
      }
      case 'RESERVATION_CANCELLED': {
        const payload: ReservationDecisionEmailPayload = {
          decision: 'CANCELLED',
          customerName: variables.customerName || 'Test Customer',
          barberName: variables.barberName || 'Alex Santos',
          branchName: variables.branchName || "DemoShop's Barbers — SampleBranch",
          branchAddress: variables.branchAddress || 'Ground floor, SampleBranch, SJDM Bulacan',
          preferredDate: variables.preferredDate || new Date().toISOString().slice(0, 10),
          preferredTime: variables.preferredTime || '10:00 AM',
          services: [{ title: variables.serviceTitle || 'Signature Haircut', price: 350 }],
          totalAmount: 350,
          depositPaid: 100,
          remainingBalance: 250,
          cashierName: 'Front Desk',
          actionTimestamp: new Date(),
          declineReason: variables.cancelReason || 'Cancelled at customer request.',
        };
        return {
          subject: `Reservation Cancelled - DemoShop's Barbers (${payload.preferredDate})`,
          html: getReservationDecisionEmailHtml(payload),
        };
      }
      case 'DAILY_STOCK_REPORT': {
        const reportDate = variables.reportDate || new Date().toISOString().slice(0, 10);
        const report: StockReportEmailReport = {
          summary: {
            submittedShiftCount: 1,
            missingShiftCount: 0,
            fallbackCashierSubmissionCount: 0,
            totalLoggedUsage: 10,
          },
          items: [
            {
              itemName: 'Pomade Deluxe (Classic)',
              unit: 'tins',
              openingQuantity: 20,
              closingQuantity: 15,
              currentStock: 15,
              receiptQuantity: 0,
              loggedUsage: 5,
            },
            {
              itemName: 'Shaving Cream Ultra',
              unit: 'tubes',
              openingQuantity: 30,
              closingQuantity: 25,
              currentStock: 25,
              receiptQuantity: 0,
              loggedUsage: 5,
            },
          ],
        };
        return {
          subject: `DemoShop daily stock report — ${reportDate}`,
          html: getStockReportEmailHtml(report, reportDate),
        };
      }
      case 'RECEIPT': {
        const receiptDoc: ReceiptDocument = {
          receiptDocumentId: 1,
          receiptNumber: variables.receiptNumber || 'RCP-DEMO-202610-001',
          queueEntryId: 1,
          branchId: 1,
          documentVersion: 1,
          issuedAt: new Date().toISOString(),
          branch: {
            name: variables.branchName || "DemoShop's Barbers — SampleBranch",
            address: variables.branchAddress || 'Ground floor, SampleBranch, SJDM Bulacan',
          },
          customerName: variables.customerName || 'Test Customer',
          barberName: variables.barberName || 'Alex Santos',
          guestReference: null,
          lines: [
            {
              serviceId: 1,
              serviceName: variables.serviceTitle || 'Signature Haircut',
              amount: 350,
              paymentMethod: 'Cash',
            },
          ],
          totalAmount: 350,
          paymentMethods: ['Cash'],
          gcashReferenceLast4: null,
          emailStatus: 'pending',
          emailAvailable: true,
        };
        return {
          subject: `Your DemoShop receipt ${receiptDoc.receiptNumber}`,
          html: renderReceiptHtml(receiptDoc, null),
        };
      }
      case 'ACCOUNT_VERIFICATION_OTP': {
        const name = variables.firstName || 'Test User';
        return {
          subject: 'Verify your DemoShop account',
          html: getVerificationEmailHtml(name, '123456'),
        };
      }
      case 'FORGOT_PASSWORD_OTP': {
        const name = variables.firstName || 'Test User';
        return {
          subject: 'Password reset verification',
          html: getForgotPasswordEmailHtml(name, '123456'),
        };
      }
      case 'CHANGE_PASSWORD_OTP': {
        const name = variables.firstName || 'Test User';
        return {
          subject: 'Password reset request',
          html: getChangePasswordEmailHtml(name, '123456'),
        };
      }
      default:
        throw new AppError(`Unknown or unsupported email template '${templateType}'.`, 400);
    }
  }

  /**
   * 5. Email Preview
   * Renders the actual HTML template without sending.
   */
  async previewEmail(dto: DiagnosticEmailPreviewDto): Promise<DiagnosticEmailPreviewResult> {
    if (!dto.templateType) {
      throw new AppError('Template type is required.', 400);
    }
    const { subject, html } = this.buildEmailTemplate(dto.templateType, dto.variables || {});
    return { subject, html };
  }

  /**
   * 5. Send Test Email
   * Uses real SMTP service with explicit recipient and server-side rate limiting.
   */
  async sendTestEmail(
    dto: DiagnosticSendTestEmailDto,
    userContext: AuthoritativeUserContext,
    req?: any
  ): Promise<DiagnosticSendTestEmailResult> {
    if (!dto.toEmail || !dto.toEmail.includes('@')) {
      throw new AppError('A valid recipient email address is required.', 400);
    }
    if (!dto.templateType) {
      throw new AppError('Template type is required.', 400);
    }

    // Rate limiting guard
    this.checkEmailRateLimit(userContext.userId);

    const { subject, html } = this.buildEmailTemplate(dto.templateType, dto.variables || {});

    const delivery = await emailService.sendDiagnosticEmail({
      from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
      to: dto.toEmail.trim(),
      subject,
      html,
    });

    // Audit log - Never persist full email body
    const domain = dto.toEmail.includes('@') ? dto.toEmail.split('@')[1] : 'unknown';
    await auditService.logSecurityEvent({
      userId: userContext.userId,
      action: 'TEST_EMAIL_SENT',
      resource: 'diagnostics',
      details: {
        templateType: dto.templateType,
        recipientDomain: domain,
        sent: delivery.sent,
        messageId: delivery.messageId || null,
        error: delivery.errorMessage || null,
      },
      req,
    });

    return delivery;
  }

  /**
   * 6. Test Data Management — Live Counts
   */
  async getTestDataCounts(): Promise<DiagnosticTestDataCounts> {
    return diagnosticsRepository.getTestDataCounts();
  }

  /**
   * 6. Test Data Management — Review List
   */
  async getTestDataReview(): Promise<DiagnosticTestDataReviewResponse> {
    return diagnosticsRepository.getTestDataReview();
  }

  /**
   * 6. Test Data Management — Cleanup
   * Safely purges only records marked with is_test = TRUE.
   */
  async cleanupTestData(
    dto: DiagnosticCleanupDto,
    userContext: AuthoritativeUserContext,
    req?: any
  ): Promise<DiagnosticCleanupResult> {
    const scope = dto.scope || 'all';

    // 1. Identify affected barbers before purge so we can recalculate and bust caches
    const queueBarberIds = await diagnosticsRepository.findBarbersWithTestQueueEntries();
    const reviewBarberIds = await diagnosticsRepository.findBarbersWithTestReviews();
    const affectedBarberIds = Array.from(new Set([...queueBarberIds, ...reviewBarberIds]));

    let reservationsRemoved = 0;
    let walkInsRemoved = 0;
    let reviewsRemoved = 0;

    if (scope === 'all' || scope === 'reservations') {
      reservationsRemoved = await diagnosticsRepository.purgeTestReservations();
    }
    if (scope === 'all' || scope === 'walk-ins') {
      walkInsRemoved = await diagnosticsRepository.purgeTestWalkIns();
    }
    if (scope === 'all' || scope === 'reviews') {
      reviewsRemoved = await diagnosticsRepository.purgeTestReviews();
    }

    const totalRemoved = reservationsRemoved + walkInsRemoved + reviewsRemoved;

    // 2. Invalidate caches for all affected barbers so live ratings and queue states reset
    for (const barberId of affectedBarberIds) {
      try {
        await barberService.invalidateBarberCache(barberId);
      } catch (err) {
        logger.warn('[DiagnosticToolsService] Error invalidating barber cache after cleanup', {
          barberId,
          error: err,
        });
      }
    }

    // 3. Immutable audit log — Audit records are never deleted
    await auditService.logSecurityEvent({
      userId: userContext.userId,
      action: 'TEST_DATA_CLEANED_UP',
      resource: 'diagnostics',
      details: {
        scope,
        reservationsRemoved,
        walkInsRemoved,
        reviewsRemoved,
        totalRemoved,
        affectedBarbersCount: affectedBarberIds.length,
      },
      req,
    });

    return {
      success: true,
      scope,
      reservationsRemoved,
      walkInsRemoved,
      reviewsRemoved,
      totalRemoved,
    };
  }
}

export const diagnosticToolsService = new DiagnosticToolsService();
