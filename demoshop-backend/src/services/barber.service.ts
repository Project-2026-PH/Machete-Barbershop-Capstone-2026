import crypto from 'crypto';
import { barberRepository } from '../repositories/barber.repository';
import { queueRepository } from '../repositories/queue.repository';
import { calculateTotalWaitTime } from '../utils/queue/wait-time.util';
import { isBarberEligibleForSect, isBarberOnBreak } from '../utils/queue/sect.util';
import { getManilaNow } from '../utils/queue/availability.util';
import { getAdminClient } from '../config/supabase';
import { validateImageBuffer } from '../utils/general/image-upload.util';
import { notificationService } from './notification.service';
import { notificationRepository } from '../repositories/notification.repository';
import { logSecurityEvent } from './audit.service';
import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';
import { staffScheduleService } from './staff-schedule.service';
import { getCache, setCache, deleteCachePattern } from '../redis';
import { realtimeBroadcastService } from './realtime-broadcast.service';

export class BarberService {
    async invalidateBarberCache(barberIdOrUserId?: number | string) {
        try {
            await Promise.all([
                deleteCachePattern('barber:public:*'),
                deleteCachePattern('barber:staff:*'),
                deleteCachePattern('barber:availability:*'),
                deleteCachePattern(barberIdOrUserId ? `barber:performance:*${barberIdOrUserId}*` : 'barber:performance:*'),
                deleteCachePattern(barberIdOrUserId ? `barber:earnings:*${barberIdOrUserId}*` : 'barber:earnings:*'),
                deleteCachePattern(barberIdOrUserId ? `barber:portfolio:*${barberIdOrUserId}*` : 'barber:portfolio:*'),
            ]);
        } catch (err: any) {
            logger.warn(`[BarberService] Cache invalidation error: ${err?.message}`);
        }
    }

    /**
     * Returns the compact barber roster needed by cashier operations. Unlike
     * getPublicBarbers(), this avoids the per-barber public booking schedule
     * expansion and performs today's schedule reads in bulk.
     */
    async getCashierBarbers(branchId: number, targetDate?: string) {
        const effectiveDate = targetDate?.trim() || getManilaNow().todayISO;
        const [barbers, rawLanes] = await Promise.all([
            barberRepository.findActiveBarbersByBranch(String(branchId)),
            queueRepository.findActiveLanesForBranch(branchId),
        ]);

        const ordersByBarber = new Map<number, any[]>();
        for (const row of rawLanes) {
            const barberId = Number(row.barber_id);
            if (!ordersByBarber.has(barberId)) ordersByBarber.set(barberId, []);
            if (row.entry_id && row.queue_status) {
                ordersByBarber.get(barberId)!.push({
                    queue_status: row.queue_status,
                    duration_minutes: row.duration_minutes,
                    timer_started_at: row.timer_started_at,
                    service_started_at: row.service_started_at,
                    service_ends_at: row.service_ends_at,
                    scheduled_start_at: row.scheduled_start_at,
                });
            }
        }

        const availability = await staffScheduleService.getCashierBarberAvailability(
            barbers,
            branchId,
            effectiveDate,
        );

        const availabilityDiagnostics = barbers.map((barber: any) => {
            const barberId = Number(barber.barber_id);
            const schedule = availability.get(barberId);
            return {
                barberId,
                storedStatus: barber.status ?? null,
                isActive: barber.is_active ?? null,
                userIdPresent: Boolean(barber.user_id),
                isOnDuty: schedule?.isOnDutyToday ?? null,
                isOff: schedule?.isOffToday ?? null,
                isAvailableForWalkins: schedule?.isAvailableForWalkins ?? null,
                scheduleReason: schedule?.scheduleReason ?? 'NO_AVAILABILITY_RESULT',
            };
        });
        const onDutyCount = availabilityDiagnostics.filter((entry) => entry.isOnDuty === true).length;
        logger.info('[CashierBarberAvailability] Resolved cashier barber roster', {
            branchId,
            effectiveDate,
            returnedBarberCount: barbers.length,
            activeLaneRowCount: rawLanes.length,
            availabilityResultCount: availability.size,
            onDutyCount,
            offDutyCount: availabilityDiagnostics.filter((entry) => entry.isOff === true).length,
            barbers: availabilityDiagnostics,
        });
        if (barbers.length === 0) {
            logger.warn('[CashierBarberAvailability] Cashier barber roster query returned no barbers', {
                branchId,
                effectiveDate,
                activeLaneRowCount: rawLanes.length,
            });
        } else if (onDutyCount === 0) {
            logger.warn('[CashierBarberAvailability] All returned barbers resolved off duty', {
                branchId,
                effectiveDate,
                barbers: availabilityDiagnostics,
            });
        }

        return barbers.map((barber: any) => {
            const barberId = Number(barber.barber_id);
            const schedule = availability.get(barberId);
            const orders = ordersByBarber.get(barberId) || [];
            const isOnBreak = isBarberOnBreak(barber.status);
            const etaMinutes = isBarberEligibleForSect(barber)
                ? calculateTotalWaitTime(orders)
                : (isOnBreak ? calculateTotalWaitTime(orders, { isOnBreak: true, breakBufferMinutes: 15, breakStartedAt: barber.break_started_at }) : 0);

            return {
                barber_id: barber.barber_id,
                name: barber.name,
                status: barber.status,
                break_started_at: barber.break_started_at ?? null,
                bio: barber.bio,
                rating: barber.rating,
                review_count: barber.review_count,
                specialties: barber.specialties,
                queue_count: barber.queue_count,
                serving_count: barber.serving_count,
                image: barber.profile_picture || barber.image || null,
                profile_picture: barber.profile_picture || barber.image || null,
                eta_minutes: etaMinutes || 0,
                etaMinutes: etaMinutes || 0,
                is_off_today: schedule?.isOffToday ?? false,
                is_on_duty_today: schedule?.isOnDutyToday ?? true,
                isOnDutyToday: schedule?.isOnDutyToday ?? true,
                is_online_booking_enabled: schedule?.isOnlineBookingEnabledToday ?? false,
                is_online_booking_enabled_today: schedule?.isOnlineBookingEnabledToday ?? false,
                isOnlineBookingEnabledToday: schedule?.isOnlineBookingEnabledToday ?? false,
                is_available_for_walkins: schedule?.isAvailableForWalkins ?? !isBarberOnBreak(barber.status),
                walkin_available: schedule?.isAvailableForWalkins ?? !isBarberOnBreak(barber.status),
                walkin_status: schedule?.walkinStatus || barber.status || 'Off Duty',
                schedule_reason: schedule?.scheduleReason || null,
            };
        });
    }

    async getPublicBarbers(branchId?: string, targetDate?: string, includeUnavailable = false) {
        const startedAt = performance.now();
        const hasTargetDate = Boolean(targetDate && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim()));
        const effectiveDate = hasTargetDate ? targetDate!.trim() : getManilaNow().todayISO;
        const cacheKey = `barber:public:v7:${branchId || 'all'}${hasTargetDate ? `:${effectiveDate}` : ''}${includeUnavailable ? ':all-statuses' : ''}`;
        const cached = await getCache<any[]>(cacheKey);
        if (cached) {
            logger.info('[BarberService] Public barber roster cache hit', {
                event: 'public_barber_roster_loaded',
                branchId: branchId || null,
                barberCount: cached.length,
                cacheHit: true,
                duration_ms: Math.round(performance.now() - startedAt),
            });
            return cached;
        }

        const barbers = await barberRepository.findActiveBarbersByBranch(branchId);
        // Top performer and ranking follow the admin leaderboard: most completed cuts, then highest rating, then reviews.
        const rankedBarbers = [...barbers]

            .sort((a, b) => Number(b.completed_services_count || 0) - Number(a.completed_services_count || 0)
                || Number(b.rating ?? 0) - Number(a.rating ?? 0)
                || Number(b.review_count ?? 0) - Number(a.review_count ?? 0)
                || Number(a.barber_id) - Number(b.barber_id));
        const barberRankMap = new Map<number, number>();
        rankedBarbers.forEach((barber, index) => {
            barberRankMap.set(Number(barber.barber_id), index + 1);
        });
        const topPerformer = rankedBarbers.find((barber) => Number(barber.completed_services_count || 0) > 0);
        const topPerformerId = topPerformer ? Number(topPerformer.barber_id) : null;
        const numericBranchId = branchId ? parseInt(branchId, 10) : undefined;
        const isScheduleMocked = Boolean((staffScheduleService.getBarberSchedulePublic as any)?.mock);
        const bulkAvailabilityPromise = Number.isInteger(numericBranchId) && (numericBranchId ?? 0) > 0 && !isScheduleMocked
            ? staffScheduleService.getCashierBarberAvailability(barbers, numericBranchId!, effectiveDate, { publicBookingSemantics: true })
            : Promise.resolve(null);

        let result: any[];
        if (Number.isInteger(numericBranchId) && (numericBranchId ?? 0) > 0) {
            const rawLanes = await queueRepository.findActiveLanesForBranch(numericBranchId!);
            const ordersByBarber = new Map<number, any[]>();
            for (const row of rawLanes) {
                const bId = Number(row.barber_id);
                if (!ordersByBarber.has(bId)) {
                    ordersByBarber.set(bId, []);
                }
                if (row.entry_id && row.queue_status) {
                    ordersByBarber.get(bId)!.push({
                        queue_status: row.queue_status,
                        duration_minutes: row.duration_minutes,
                        timer_started_at: row.timer_started_at,
                        service_started_at: row.service_started_at,
                        service_ends_at: row.service_ends_at,
                        scheduled_start_at: row.scheduled_start_at,
                    });
                }
            }

            result = barbers.map(barber => {
                const bId = Number(barber.barber_id);
                const orders = ordersByBarber.get(bId) || [];
                const isOnBreak = isBarberOnBreak(barber.status);
                const etaMinutes = isBarberEligibleForSect(barber)
                    ? calculateTotalWaitTime(orders)
                    : (isOnBreak ? calculateTotalWaitTime(orders, { isOnBreak: true, breakBufferMinutes: 15, breakStartedAt: barber.break_started_at }) : 0);
                return {
                    barber,
                    etaMinutes,
                };
            });
        } else {
            result = barbers.map(barber => ({
                barber,
                etaMinutes: 0,
            }));
        }

        const mapToPublicBarberDto = (b: any, extra: {
            etaMinutes: number;
            isOffToday: boolean;
            isOnDutyToday: boolean;
            isOnlineBookingEnabledToday: boolean;
            isAvailableForWalkins: boolean;
            walkinStatus: string;
            scheduleReason: string | null;
        }) => {
            const dto: Record<string, any> = {
                barber_id: b.barber_id,
                name: b.name,
            };
            if (b.status !== undefined) dto.status = b.status;
            if (b.break_started_at !== undefined) dto.break_started_at = b.break_started_at;
            if (b.bio !== undefined) dto.bio = b.bio;
            if (b.rating !== undefined) dto.rating = b.rating;
            if (b.review_count !== undefined) dto.review_count = b.review_count;
            if (b.specialties !== undefined) dto.specialties = b.specialties;
            if (b.queue_count !== undefined) dto.queue_count = b.queue_count;
            if (b.serving_count !== undefined) dto.serving_count = b.serving_count;
            if (b.completed_services_count !== undefined) dto.completed_services_count = Number(b.completed_services_count) || 0;
            if (b.signature_service !== undefined) dto.signature_service = b.signature_service || null;
            if (b.service_completed_counts !== undefined) dto.service_completed_counts = b.service_completed_counts || {};
            const barberIdNum = Number(b.barber_id);
            const rank = barberRankMap.get(barberIdNum) ?? null;
            dto.rank = rank;
            dto.is_top_performer = topPerformerId !== null && barberIdNum === topPerformerId;
            dto.isTopPerformer = dto.is_top_performer;
            dto.image = b.profile_picture || b.image || null;
            dto.profile_picture = b.profile_picture || b.image || null;
            dto.eta_minutes = extra.etaMinutes || 0;
            dto.etaMinutes = extra.etaMinutes || 0;
            dto.is_off_today = extra.isOffToday;
            dto.is_on_duty_today = extra.isOnDutyToday;
            dto.isOnDutyToday = extra.isOnDutyToday;
            dto.is_online_booking_enabled = extra.isOnlineBookingEnabledToday;
            dto.is_online_booking_enabled_today = extra.isOnlineBookingEnabledToday;
            dto.isOnlineBookingEnabledToday = extra.isOnlineBookingEnabledToday;
            dto.is_available_for_walkins = extra.isAvailableForWalkins;
            dto.walkin_available = extra.isAvailableForWalkins;
            dto.walkin_status = extra.walkinStatus;
            dto.schedule_reason = extra.scheduleReason;
            return dto;
        };

        const bulkAvailability = await bulkAvailabilityPromise;

        const enriched = await Promise.all(result.map(async ({ barber, etaMinutes }) => {
            try {
                const bulk = bulkAvailability?.get(Number(barber.barber_id));
                const sched = bulk ? null : await staffScheduleService.getBarberSchedulePublic(barber.barber_id, effectiveDate, effectiveDate);
                const dayDetail = sched?.dateDetails[effectiveDate];
                const isOnDutyToday = bulk?.isOnDutyToday ?? (dayDetail?.isOnDuty !== undefined
                    ? Boolean(dayDetail.isOnDuty)
                    : !sched!.offDutyDates.includes(effectiveDate));
                const isOnlineBookingEnabledToday = bulk?.isOnlineBookingEnabledToday ?? (dayDetail?.isOnlineBookingEnabled !== undefined
                    ? Boolean(dayDetail.isOnlineBookingEnabled)
                    : (!sched!.offDutyDates.includes(effectiveDate) && dayDetail?.reason !== 'Online Booking Disabled'));
                const isOffToday = bulk?.isOffToday ?? !isOnDutyToday;
                const scheduleReason = bulk?.scheduleReason ?? (!isOnDutyToday
                    ? (dayDetail?.reason || 'Off Duty')
                    : (!isOnlineBookingEnabledToday ? 'Online Booking Disabled' : null));
                const isAvailableForWalkins = bulk?.isAvailableForWalkins ?? (isOnDutyToday && !isBarberOnBreak(barber.status));
                const walkinStatus = bulk?.walkinStatus || (isAvailableForWalkins ? 'Available for Walk-ins' : (scheduleReason || (isBarberOnBreak(barber.status) ? 'On Break' : barber.status) || 'Off Duty'));

                return mapToPublicBarberDto(barber, {
                    etaMinutes,
                    isOffToday,
                    isOnDutyToday,
                    isOnlineBookingEnabledToday,
                    isAvailableForWalkins,
                    walkinStatus,
                    scheduleReason,
                });
            } catch {
                return mapToPublicBarberDto(barber, {
                    etaMinutes,
                    isOffToday: false,
                    isOnDutyToday: true,
                    isOnlineBookingEnabledToday: true,
                    isAvailableForWalkins: !isBarberOnBreak(barber.status),
                    walkinStatus: !isBarberOnBreak(barber.status) ? 'Available for Walk-ins' : (isBarberOnBreak(barber.status) ? 'On Break' : (barber.status || 'Off Duty')),
                    scheduleReason: null,
                });
            }
        }));

        const finalResult = hasTargetDate && !includeUnavailable
            ? enriched.filter((barber) => barber.is_online_booking_enabled_today || barber.is_online_booking_enabled)
            : enriched;

        void setCache(cacheKey, finalResult, 60);
        logger.info('[BarberService] Public barber roster loaded', {
            event: 'public_barber_roster_loaded',
            branchId: branchId || null,
            barberCount: finalResult.length,
            cacheHit: false,
            duration_ms: Math.round(performance.now() - startedAt),
        });
        return finalResult;
    }

    async getStaff(branchId?: string) {
        const cacheKey = `barber:staff:branch:${branchId || 'all'}`;
        const cached = await getCache<any[]>(cacheKey);
        if (cached) return cached;

        const result = await barberRepository.findActiveBarbersByBranch(branchId);
        await setCache(cacheKey, result, 60);
        return result;
    }

    async searchCustomerHistory(query: string, userId?: string, page: number = 1, limit: number = 6) {
        if (!userId) {
            return { data: [], total: 0, page, limit, totalPages: 1 };
        }
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            return { data: [], total: 0, page, limit, totalPages: 1 };
        }
        return await barberRepository.searchCustomerHistory(query ? query.trim() : '', barber.barber_id, page, limit);
    }

    async getPerformance(userId: string) {
        const cacheKey = `barber:performance:${userId}`;
        const cached = await getCache(cacheKey);
        if (cached) return cached;

        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber) {
            return {
                servedCount: 0,
                targetCount: 12,
                rating: null,
                totalReviews: 0,
                totalSales: 0,
                reviews: []
            };
        }
        const result = await barberRepository.getBarberPerformance(barber.barber_id);
        await setCache(cacheKey, result, 30);
        return result;
    }

    async getEarnings(userId: string, period: 'today' | 'week' | 'month' = 'today') {
        const cacheKey = `barber:earnings:${userId}:${period}`;
        const cached = await getCache(cacheKey);
        if (cached) return cached;

        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber) {
            return {
                period,
                totalServices: 0,
                totalGrossSales: 0,
                commissionRate: 0.40,
                tierLabel: '40% Standard Rate',
                quotaThreshold: 3000,
                isQuotaReached: false,
                remainingToNextTier: 3000,
                netCommissionPayout: 0,
                receipts: []
            };
        }
        const result = await barberRepository.getBarberEarnings(barber.barber_id, period);
        await setCache(cacheKey, result, 30);
        return result;
    }

    async getAvailability(userId: string, targetBarberId?: number) {
        let barber = targetBarberId ? await barberRepository.findBarberById(targetBarberId) : null;
        if (!barber) {
            barber = await barberRepository.findBarberByUserId(userId);
        }
        return {
            status: barber?.status || 'Available',
            barberId: barber?.barber_id || targetBarberId || null,
            name: barber?.name || 'Barber'
        };
    }

    async updateAvailability(userId: string, newStatus: string, targetBarberId?: number, req?: any) {
        const ALLOWED_STATUSES = ['Available', 'Serving', 'On Break'];
        if (!ALLOWED_STATUSES.includes(newStatus)) {
            throw new Error(`Unauthorized status transition: ${newStatus}. Administrative statuses (Absent, Suspended) require Cashier or System Admin override.`);
        }

        const actorRole = (req?.user as any)?.role;
        let barber: any = null;
        if (targetBarberId && actorRole && actorRole !== 'Barber') {
            barber = await barberRepository.findBarberById(targetBarberId);
        } else {
            barber = await barberRepository.findBarberByUserId(userId);
        }
        if (!barber) {
            throw new Error('Barber profile not found for authenticated user.');
        }

        const updated = isBarberOnBreak(newStatus)
            ? await queueRepository.withBarberReadyForBreak(barber.barber_id, (client) =>
                barberRepository.updateBarberStatus(barber.barber_id, newStatus, undefined, client))
            : await barberRepository.updateBarberStatus(barber.barber_id, newStatus);
        const normalizedNewStatus = String(newStatus).trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (isBarberOnBreak(barber.status) && normalizedNewStatus === 'available') {
            await queueRepository.promoteNextToServing(barber.barber_id);
        }
        logSecurityEvent({
            userId,
            action: 'BARBER_AVAILABILITY_UPDATED',
            resource: 'barber_availability',
            details: {
                barber_id: barber.barber_id,
                barber_name: barber.name,
                status: updated?.status || newStatus,
            },
            req,
        });

        await this.invalidateBarberCache(barber.barber_id);
        if (barber.user_id) {
            await this.invalidateBarberCache(barber.user_id);
        }
        realtimeBroadcastService.dispatchAppointmentChangeSafely({
            action: 'STATUS_CHANGED',
            barberId: barber.barber_id,
            status: updated?.status || newStatus,
            metadata: { event: 'barber_status_changed', barberId: barber.barber_id, status: updated?.status || newStatus },
        });
        return updated;
    }

    async updateAdministrativeStatus(params: {
        barberId: number;
        status: string;
        actorId?: string | null;
        actorRole?: string;
        reason?: string;
        branchId?: number;
    }, req?: any) {
        const ALLOWED_ADMIN_STATUSES = [
            'Available', 'available',
            'Serving', 'serving', 'Busy', 'busy',
            'On Break', 'on_break', 'Break', 'break',
            'Absent', 'absent', 'Leave', 'leave',
            'Suspended', 'suspended',
            'Offline', 'offline',
            'On Duty', 'on_duty',
            'Off Duty', 'off_duty',
        ];
        if (!ALLOWED_ADMIN_STATUSES.includes(params.status)) {
            throw new AppError(`Invalid administrative status: ${params.status}`, 400);
        }

        const barber = await barberRepository.findBarberById(params.barberId);
        if (!barber) {
            throw new AppError('Barber not found', 404);
        }

        const updated = isBarberOnBreak(params.status)
            ? await queueRepository.withBarberReadyForBreak(params.barberId, (client) =>
                barberRepository.updateBarberStatus(params.barberId, params.status, undefined, client))
            : await barberRepository.updateBarberStatus(params.barberId, params.status);
        const normalizedNewStatus = String(params.status).trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (isBarberOnBreak(barber.status) && normalizedNewStatus === 'available') {
            await queueRepository.promoteNextToServing(params.barberId);
        }

        logSecurityEvent({
            userId: params.actorId || null,
            action: 'BARBER_ADMIN_STATUS_UPDATED',
            resource: 'barber_management',
            details: {
                barber_id: params.barberId,
                barber_name: barber.name,
                previous_status: barber.status,
                status: updated?.status || params.status,
                reason: params.reason || 'Administrative status override',
                branch_id: params.branchId || null,
                actor_role: params.actorRole || null,
            },
            req,
        });

        await this.invalidateBarberCache(params.barberId);
        realtimeBroadcastService.dispatchAppointmentChangeSafely({
            action: 'STATUS_CHANGED',
            barberId: params.barberId,
            branchId: params.branchId || null,
            status: updated?.status || params.status,
            metadata: { event: 'barber_status_changed', barberId: params.barberId, status: updated?.status || params.status },
        });
        return updated;
    }

    async getAllStaff(branchId?: number) {
        return await barberRepository.findAllStaff(branchId);
    }

    async uploadHaircutPhoto(
        userId: string,
        fileBuffer: Buffer,
        mimeType: string,
        queueEntryId?: number
    ): Promise<{ haircut_photo_url: string }> {
        const barber = await barberRepository.findBarberByUserId(userId);
        const barberId = barber?.barber_id || 'general';

        const detected = validateImageBuffer(fileBuffer);
        const randomKey = crypto.randomBytes(8).toString('hex');
        const filePath = `barber_${barberId}/haircut_${queueEntryId || 'service'}_${Date.now()}_${randomKey}.${detected.extension}`;

        const supabase = getAdminClient();
        const { error: uploadError } = await supabase.storage
            .from('haircut-photos')
            .upload(filePath, fileBuffer, {
                contentType: detected.mimeType,
                upsert: false,
            });

        if (uploadError) {
            logger.error('[uploadHaircutPhoto] Barber Supabase storage upload failed:', uploadError);
            throw new AppError('Failed to upload haircut photo to storage.', 500);
        }

        const { data: signedData } = await supabase.storage
            .from('haircut-photos')
            .createSignedUrl(filePath, 3600 * 24 * 7); // 7-day signed URL

        const photoUrl = signedData?.signedUrl || filePath;
        logger.info(`[uploadHaircutPhoto] Successfully uploaded haircut photo by barber ${barberId}: ${filePath}`);
        return { haircut_photo_url: photoUrl };
    }

    async submitShiftRequest(userId: string, data: {
        requestType: 'swap' | 'time_off';
        shiftDate: string;
        targetBarberName?: string;
        targetDate?: string;
        reason: string;
    }, req?: any) {
        if (data.requestType !== 'time_off') {
            throw new AppError('Shift swap requests have been deprecated. Only time off requests may be submitted.', 400);
        }

        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber) {
            throw new AppError('Barber profile not found for authenticated user.', 404);
        }

        const existing = await barberRepository.getActiveShiftRequest(barber.barber_id);
        if (existing) {
            if (existing.status === 'pending') {
                throw new AppError('You already have a pending shift request under review by shop administration.', 400);
            }
            if (existing.status === 'approved') {
                throw new AppError('You have an active approved schedule change request.', 400);
            }
        }

        const created = await barberRepository.createShiftRequest({
            barberId: barber.barber_id,
            userId,
            requestType: data.requestType,
            shiftDate: data.shiftDate,
            targetBarberName: data.targetBarberName,
            targetDate: data.targetDate,
            reason: data.reason,
        });

        // Notify shop administration and front desk staff
        await notificationService.notifyShopAdminShiftRequest({
            barberName: barber.name || 'Barber',
            requestType: data.requestType,
            shiftDate: data.shiftDate,
            targetBarberName: data.targetBarberName,
            reason: data.reason,
            branchId: barber.branch_id,
            requestId: created.id,
        });

        logSecurityEvent({
            userId,
            action: 'BARBER_SHIFT_REQUEST_SUBMITTED',
            resource: 'shift_management',
            details: {
                barber_id: barber.barber_id,
                barber_name: barber.name,
                request_type: data.requestType,
                shift_date: data.shiftDate,
                request_id: created.id,
            },
            req,
        });

        return created;
    }

    async getActiveShiftRequest(userId: string) {
        const barber = await barberRepository.findBarberByUserId(userId);
        const barberId = barber?.barber_id || null;
        return await barberRepository.getActiveShiftRequest(barberId, userId);
    }

    async acknowledgeShiftRequest(userId: string, requestId: number) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber) {
            throw new AppError('Barber profile not found.', 404);
        }
        return await barberRepository.acknowledgeShiftRequest(barber.barber_id, requestId);
    }

    async listAllShiftRequests(branchId?: number) {
        return await barberRepository.getAllShiftRequests(branchId);
    }

    async reviewShiftRequest(
        requestId: number,
        action: 'approve' | 'decline',
        adminNotes?: string,
        actorId?: string | null,
        req?: any
    ) {
        const reviewed = await barberRepository.reviewShiftRequest(requestId, action, adminNotes);
        if (!reviewed) {
            throw new AppError('Shift request not found.', 404);
        }

        if (action === 'approve') {
            await staffScheduleService.applyApprovedRequest(reviewed);
        }

        // Notify the barber of the decision
        if (reviewed.user_id) {
            await notificationService.notifyBarberShiftDecision({
                barberUserId: reviewed.user_id,
                barberName: reviewed.barber_name || 'Barber',
                requestType: reviewed.request_type,
                shiftDate: reviewed.shift_date,
                action: action === 'approve' ? 'approved' : 'declined',
                adminNotes,
                requestId,
            });
        }

        // Mark all incoming notifications for this shift request as read
        await notificationRepository.markShiftRequestNotificationsRead(requestId);

        logSecurityEvent({
            userId: actorId || null,
            action: 'BARBER_SHIFT_REQUEST_REVIEWED',
            resource: 'shift_management',
            details: {
                request_id: requestId,
                action: action === 'approve' ? 'approved' : 'declined',
                admin_notes: adminNotes || null,
            },
            req,
        });

        return reviewed;
    }

    async clearAllShiftRequests(actorId?: string | null, req?: any) {
        const result = await barberRepository.clearAllShiftRequests();

        // Mark all shift request notifications as read
        await notificationRepository.markAllShiftRequestNotificationsRead();

        logSecurityEvent({
            userId: actorId || null,
            action: 'BARBER_SHIFT_REQUESTS_CLEARED',
            resource: 'shift_management',
            details: { action: 'clear_all' },
            req,
        });

        return result;
    }

    async resolvePortfolioSignedUrls(items: any[]): Promise<any[]> {
        if (!items || !items.length) return [];
        const supabase = getAdminClient();
        const signedUrlPromises = new Map<string, Promise<string | null>>();

        const resolvePath = (storagePath: string): Promise<string | null> => {
            const existing = signedUrlPromises.get(storagePath);
            if (existing) return existing;

            const promise = (async () => {
                const cacheKey = `storage:signed:haircut-photos:${storagePath}`;
                const cached = await getCache<string>(cacheKey);
                if (cached) return cached;

                try {
                    const { data, error } = await supabase.storage
                        .from('haircut-photos')
                        .createSignedUrl(storagePath, 604800);
                    const signedUrl = data && !error && data.signedUrl ? data.signedUrl : null;
                    if (signedUrl) await setCache(cacheKey, signedUrl, 86400);
                    return signedUrl;
                } catch {
                    return null;
                }
            })();
            signedUrlPromises.set(storagePath, promise);
            return promise;
        };

        return Promise.all(
            items.map(async (item) => {
                if (!item.storagePath) return item;
                const signedUrl = await resolvePath(item.storagePath);
                return {
                    ...item,
                    imageUrl: signedUrl || item.imageUrl,
                };
            }),
        );
    }

    async getBarberPortfolio(userId: string) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            throw new AppError('Barber profile not found.', 404);
        }

        const cacheKey = `barber:portfolio:${barber.barber_id}`;
        const cached = await getCache<any>(cacheKey);
        if (cached) return cached;

        const portfolio = await barberRepository.getBarberPortfolio(barber.barber_id);
        if (!portfolio) {
            throw new AppError('Portfolio record not found.', 404);
        }

        portfolio.portfolioItems = await this.resolvePortfolioSignedUrls(portfolio.portfolioItems);
        await setCache(cacheKey, portfolio, 120);
        return portfolio;
    }

    async getPublicBarberPortfolio(barberId: number) {
        if (!Number.isInteger(barberId) || barberId <= 0) {
            throw new AppError('Invalid barber ID.', 400);
        }

        const cacheKey = `barber:portfolio:public:${barberId}`;
        const cached = await getCache<any>(cacheKey);
        if (cached) return cached;

        const portfolio = await barberRepository.getBarberPortfolio(barberId);
        if (!portfolio || !portfolio.isActive) {
            throw new AppError('Barber portfolio not found or barber is inactive.', 404);
        }

        const resolvedItems = await this.resolvePortfolioSignedUrls(portfolio.portfolioItems);
        portfolio.portfolioItems = resolvedItems.map(({ storagePath, ...rest }: any) => rest);
        await setCache(cacheKey, portfolio, 300);
        return portfolio;
    }

    async updateBarberBio(userId: string, bio: string | null) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            throw new AppError('Barber profile not found.', 404);
        }

        const cleanBio = typeof bio === 'string' ? bio.trim() : null;
        if (cleanBio && cleanBio.length > 500) {
            throw new AppError('Bio must be 500 characters or fewer.', 400);
        }

        const updatedBio = await barberRepository.updateBarberBio(barber.barber_id, cleanBio);
        await this.invalidateBarberCache(barber.barber_id);
        return { bio: updatedBio };
    }

    async setBarberSpecialties(userId: string, serviceIds: number[]) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            throw new AppError('Barber profile not found.', 404);
        }

        if (!Array.isArray(serviceIds)) {
            throw new AppError('serviceIds must be an array of service IDs.', 400);
        }

        for (const sid of serviceIds) {
            if (!Number.isInteger(sid) || sid <= 0) {
                throw new AppError(`Invalid service ID: ${sid}`, 400);
            }
        }

        const specialties = await barberRepository.setBarberSpecialties(barber.barber_id, serviceIds);
        await this.invalidateBarberCache(barber.barber_id);
        return specialties;
    }

    async addPortfolioWork(
        userId: string,
        fileBuffer: Buffer,
        _mimeType: string,
        serviceId?: number,
        caption?: string
    ) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            throw new AppError('Barber profile not found.', 404);
        }

        const detected = validateImageBuffer(fileBuffer);
        const randomKey = crypto.randomBytes(8).toString('hex');
        const filePath = `portfolio/barber_${barber.barber_id}/work_${Date.now()}_${randomKey}.${detected.extension}`;

        const cleanCaption = typeof caption === 'string' ? caption.trim() : null;
        if (cleanCaption && cleanCaption.length > 300) {
            throw new AppError('Caption must be 300 characters or fewer.', 400);
        }

        const cleanServiceId = serviceId && Number.isInteger(Number(serviceId)) && Number(serviceId) > 0
            ? Number(serviceId)
            : null;

        const supabase = getAdminClient();
        const { error: uploadError } = await supabase.storage
            .from('haircut-photos')
            .upload(filePath, fileBuffer, {
                contentType: detected.mimeType,
                upsert: false,
            });

        if (uploadError) {
            logger.error('[addPortfolioWork] Supabase storage upload failed:', uploadError);
            throw new AppError('Failed to upload portfolio photo to storage.', 500);
        }

        const { data: signedData } = await supabase.storage
            .from('haircut-photos')
            .createSignedUrl(filePath, 604800);

        const photoUrl = signedData?.signedUrl || filePath;

        const item = await barberRepository.addPortfolioItem(barber.barber_id, {
            serviceId: cleanServiceId,
            imageUrl: photoUrl,
            storagePath: filePath,
            caption: cleanCaption,
        });

        await this.invalidateBarberCache(barber.barber_id);
        return item;
    }

    async updatePortfolioWork(
        userId: string,
        itemId: number,
        serviceId?: number | null,
        caption?: string | null
    ) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            throw new AppError('Barber profile not found.', 404);
        }

        if (!Number.isInteger(itemId) || itemId <= 0) {
            throw new AppError('Invalid portfolio item ID.', 400);
        }

        const cleanCaption = typeof caption === 'string' ? caption.trim() : caption === null ? null : undefined;
        if (cleanCaption && cleanCaption.length > 300) {
            throw new AppError('Caption must be 300 characters or fewer.', 400);
        }

        const cleanServiceId = serviceId !== undefined
            ? (serviceId && Number.isInteger(Number(serviceId)) && Number(serviceId) > 0 ? Number(serviceId) : null)
            : undefined;

        const updated = await barberRepository.updatePortfolioItem(barber.barber_id, itemId, {
            serviceId: cleanServiceId,
            caption: cleanCaption,
        });

        if (!updated) {
            throw new AppError('Portfolio item not found or you do not have permission to modify it.', 404);
        }

        await this.invalidateBarberCache(barber.barber_id);
        return updated;
    }

    async deletePortfolioWork(userId: string, itemId: number) {
        const barber = await barberRepository.findBarberByUserId(userId);
        if (!barber?.barber_id) {
            throw new AppError('Barber profile not found.', 404);
        }

        if (!Number.isInteger(itemId) || itemId <= 0) {
            throw new AppError('Invalid portfolio item ID.', 400);
        }

        const deleted = await barberRepository.deletePortfolioItem(barber.barber_id, itemId);
        if (!deleted) {
            throw new AppError('Portfolio item not found or you do not have permission to delete it.', 404);
        }

        if (deleted.storagePath) {
            try {
                const supabase = getAdminClient();
                await supabase.storage.from('haircut-photos').remove([deleted.storagePath]);
                logger.info(`[deletePortfolioWork] Removed storage file: ${deleted.storagePath}`);
            } catch (err: any) {
                logger.warn(`[deletePortfolioWork] Failed to clean up storage file ${deleted.storagePath}: ${err?.message}`);
            }
        }

        await this.invalidateBarberCache(barber.barber_id);
        return { success: true, message: 'Portfolio item deleted successfully.' };
    }
}

export const barberService = new BarberService();
