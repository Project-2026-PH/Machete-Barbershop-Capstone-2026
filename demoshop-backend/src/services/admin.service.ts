import { adminRepository } from '../repositories/admin.repository';
import { notificationRepository } from '../repositories/notification.repository';
import { AppError } from '../utils/error/AppError';
import { hashPassword } from '../utils/auth/auth-security.util';
import {
  validateAdminCreation,
  validateAdminUpdate,
  validateAdminPasswordReset,
  normalizeRole,
} from '../utils/admin/admin-validation.util';
import {
  getCachedUsers,
  setCachedUsers,
  invalidateAdminCache,
} from '../utils/admin/admin-cache.util';
import {
  getCachedShopSettings,
  setCachedShopSettings,
  invalidateShopSettingsCache,
} from '../utils/admin/settings-cache.util';
import { ensureNotSelfSuspension } from '../utils/admin/admin-guard.util';
import { getAdminClient } from '../config/supabase';
import { getCache, setCache } from '../redis';
import { logSecurityEvent } from './audit.service';
import logger from '../utils/general/logger';
import crypto from 'crypto';
import { validateImageBuffer } from '../utils/general/image-upload.util';

const normalizeEmail = (email: unknown): string =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';
const PROFILE_RETRY_COUNT = 10;
const PROFILE_RETRY_DELAY_MS = 100;
const BRANCH_STATS_CACHE_TTL_SECONDS = 15;
const branchStatsInFlight = new Map<string, Promise<any>>();

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const isDuplicateAuthError = (error: any): boolean => {
  const value = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return value.includes('already registered')
    || value.includes('already exists')
    || value.includes('duplicate')
    || value.includes('email_exists');
};

const findAuthUserByEmail = async (adminClient: any, email: string): Promise<any | null> => {
  for (let page = 1; ; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;

    const match = data.users.find((user: any) => normalizeEmail(user.email || '') === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
};

/**
 * Service for Admin business logic.
 * Follows the Coordinator Pattern: orchestrates utilities and repositories
 * to handle complex admin operations.
 */
export class AdminService {
  async getDashboardStats() {
    const [users, traffic] = await Promise.all([
      adminRepository.getUserStats(),
      adminRepository.getTrafficData(),
    ]);
    return { users, traffic };
  }

  async getBranchStats(branchId?: number, month?: string) {
    const normalizedMonth = month
      ? (month.length === 7 ? `${month}-01` : month)
      : undefined;
    const cacheKey = `admin:branch-stats:${branchId ?? 'all'}:${normalizedMonth ?? 'current'}`;
    const cached = await getCache<any>(cacheKey);
    if (cached) return cached;

    const inFlight = branchStatsInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const request = (async () => {
      const stats = await adminRepository.getBranchStats(branchId, normalizedMonth);
      await setCache(cacheKey, stats, BRANCH_STATS_CACHE_TTL_SECONDS);
      return stats;
    })();
    branchStatsInFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (branchStatsInFlight.get(cacheKey) === request) {
        branchStatsInFlight.delete(cacheKey);
      }
    }
  }

  async getCustomerReviews(branchId?: number, page?: number, limit?: number) {
    return adminRepository.getCustomerReviews(branchId, page, limit);
  }

  async getBarberPerformanceReviews(branchId?: number, startDate?: string, endDate?: string, barberId?: number) {
    return adminRepository.getBarberPerformanceReviews(branchId, startDate, endDate, barberId);
  }

  async getShopSettings(branchId?: number) {
    const targetBranchId = branchId || 1;
    const cached = getCachedShopSettings(targetBranchId);
    if (cached) return cached;

    const settings = await adminRepository.getShopSettings(targetBranchId);
    setCachedShopSettings(targetBranchId, settings);
    return settings;
  }

  async updateShopSettings(data: any, req?: any) {
    const branchId = data.branchId || (req?.user as any)?.branch_id || 1;

    // 1. General Validations
    if (data.shopName !== undefined) {
      if (typeof data.shopName !== 'string' || !data.shopName.trim() || data.shopName.trim().length > 100) {
        throw new AppError('Shop name must be between 1 and 100 characters.', 400);
      }
    }

    if (data.contactEmail !== undefined) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (typeof data.contactEmail !== 'string' || !emailRegex.test(data.contactEmail.trim())) {
        throw new AppError('A valid contact email address is required.', 400);
      }
    }

    if (data.physicalAddress !== undefined) {
      if (typeof data.physicalAddress !== 'string' || !data.physicalAddress.trim() || data.physicalAddress.trim().length > 255) {
        throw new AppError('Physical address must be between 1 and 255 characters.', 400);
      }
    }

    // 2. Business Hours Validations
    if (data.businessHours !== undefined) {
      if (typeof data.businessHours === 'object' && !Array.isArray(data.businessHours) && data.businessHours !== null) {
        data.businessHours = Object.entries(data.businessHours).map(([day, val]: [string, any]) => ({
          day,
          isOpen: Boolean(val?.isOpen),
          openTime: val?.openTime || '',
          closeTime: val?.closeTime || '',
        }));
      }
      if (!Array.isArray(data.businessHours) || data.businessHours.length === 0 || data.businessHours.length > 7) {
        throw new AppError('Business hours must contain between 1 and 7 day schedules.', 400);
      }
      for (const day of data.businessHours) {
        if (!day.day || typeof day.isOpen !== 'boolean') {
          throw new AppError(`Invalid day schedule configuration for ${day.day || 'unknown'}.`, 400);
        }
        if (day.isOpen) {
          if (!day.openTime || !day.closeTime) {
            throw new AppError(`Opening and closing times are required for open day: ${day.day}.`, 400);
          }
          if (day.openTime >= day.closeTime) {
            throw new AppError(`Opening time must be earlier than closing time for ${day.day}.`, 400);
          }
        }
      }
    }

    // 3. Payment Methods Validations
    if (data.paymentMethods !== undefined) {
      if (!Array.isArray(data.paymentMethods)) {
        throw new AppError('Payment methods must be an array.', 400);
      }
      const allowedPaymentTypes = ['cash', 'gcash', 'maya', 'qrph', 'qr_ph', 'card', 'bank', 'maribank', 'gotyme'];
      for (const pm of data.paymentMethods) {
        if (!pm.id || !pm.type || !allowedPaymentTypes.includes(pm.type.toLowerCase())) {
          throw new AppError(`Unsupported payment method type: ${pm.type}.`, 400);
        }
        if ((pm.id === 'cash' || pm.type === 'cash') && pm.enabled === false) {
          throw new AppError('Cash payment is a core primary method and cannot be disabled.', 400);
        }
      }
    }

    // 4. Content Validations
    if (data.faqs !== undefined) {
      if (!Array.isArray(data.faqs)) {
        throw new AppError('FAQs must be an array.', 400);
      }
      for (const faq of data.faqs) {
        if (!faq.question || !faq.answer) {
          throw new AppError('FAQ question and answer must not be empty.', 400);
        }
      }
    }

    // 5. Advanced Website Configuration Authorization Boundary
    if (
      data.website?.sectionVisibility !== undefined ||
      data.website?.ctaPrimaryDestination !== undefined ||
      data.website?.ctaSecondaryDestination !== undefined
    ) {
      const actorRole = (req?.user as any)?.role;
      if (actorRole !== 'System Admin' && actorRole !== 'Owner') {
        throw new AppError('Advanced website configuration (section visibility and CTA destinations) is restricted to System Administrators.', 403);
      }
    }

    const current = await adminRepository.getShopSettings(branchId);

    // Compute granular field-level diffs
    const generalChanges: Record<string, { from: any; to: any }> = {};
    if (data.shopName !== undefined && data.shopName.trim() !== (current.shopName || '').trim()) {
      generalChanges.shop_name = { from: current.shopName || '', to: data.shopName.trim() };
    }
    if (data.contactEmail !== undefined && data.contactEmail.trim() !== (current.contactEmail || '').trim()) {
      generalChanges.contact_email = { from: current.contactEmail || '', to: data.contactEmail.trim() };
    }
    if (data.physicalAddress !== undefined && data.physicalAddress.trim() !== (current.physicalAddress || '').trim()) {
      generalChanges.physical_address = { from: current.physicalAddress || '', to: data.physicalAddress.trim() };
    }

    const hoursChanges: Record<string, { from: any; to: any }> = {};
    const daysUpdated: Array<{ day: string; isOpen: boolean }> = [];
    if (data.businessHours !== undefined && Array.isArray(data.businessHours)) {
      for (const newDay of data.businessHours) {
        const oldDay = (current.businessHours || []).find((d: any) => d.day === newDay.day);
        const oldStr = oldDay ? (oldDay.isOpen ? `${oldDay.openTime || ''} - ${oldDay.closeTime || ''}` : 'Closed') : 'Unset';
        const newStr = newDay.isOpen ? `${newDay.openTime || ''} - ${newDay.closeTime || ''}` : 'Closed';
        if (oldStr !== newStr) {
          hoursChanges[newDay.day] = { from: oldStr, to: newStr };
          daysUpdated.push({ day: newDay.day, isOpen: newDay.isOpen });
        }
      }
    }

    const paymentEvents: Array<{ action: string; resource: string; details: any }> = [];
    if (data.paymentMethods !== undefined && Array.isArray(data.paymentMethods)) {
      for (const newMethod of data.paymentMethods) {
        const targetId = newMethod.id || newMethod.key;
        const oldMethod = (current.paymentMethods || []).find((m: any) => (m.id || m.key) === targetId);
        if (oldMethod) {
          if (oldMethod.enabled !== newMethod.enabled) {
            paymentEvents.push({
              action: newMethod.enabled ? 'PAYMENT_METHOD_ENABLED' : 'PAYMENT_METHOD_DISABLED',
              resource: 'payment_methods',
              details: {
                module: 'Shop Admin',
                section: 'Settings',
                subsection: 'Payment Methods',
                target: newMethod.name || targetId,
                paymentMethod: newMethod.name || targetId,
                methodId: targetId,
                previous: oldMethod.enabled ? 'Enabled' : 'Disabled',
                new: newMethod.enabled ? 'Enabled' : 'Disabled',
                changes: {
                  status: {
                    from: oldMethod.enabled ? 'Enabled' : 'Disabled',
                    to: newMethod.enabled ? 'Enabled' : 'Disabled',
                  },
                },
              },
            });
          }
          if (oldMethod.qrImageUrl !== newMethod.qrImageUrl) {
            paymentEvents.push({
              action: !newMethod.qrImageUrl ? 'PAYMENT_QR_REMOVED' : 'PAYMENT_QR_UPDATED',
              resource: 'payment_methods',
              details: {
                module: 'Shop Admin',
                section: 'Settings',
                subsection: 'Payment Methods',
                target: newMethod.name || targetId,
                paymentMethod: newMethod.name || targetId,
                methodId: targetId,
                changes: {
                  qr_code: {
                    from: oldMethod.qrImageUrl ? 'Configured' : 'None',
                    to: newMethod.qrImageUrl ? 'Configured' : 'None',
                  },
                },
              },
            });
          }
          if (
            (newMethod.merchantName !== undefined && newMethod.merchantName !== oldMethod.merchantName) ||
            (newMethod.accountNumber !== undefined && newMethod.accountNumber !== oldMethod.accountNumber)
          ) {
            const pmDetailChanges: Record<string, { from: any; to: any }> = {};
            if (newMethod.merchantName !== undefined && newMethod.merchantName !== oldMethod.merchantName) {
              pmDetailChanges.merchant_name = { from: oldMethod.merchantName || '', to: newMethod.merchantName };
            }
            if (newMethod.accountNumber !== undefined && newMethod.accountNumber !== oldMethod.accountNumber) {
              pmDetailChanges.account_number = { from: oldMethod.accountNumber || '', to: newMethod.accountNumber };
            }
            if (Object.keys(pmDetailChanges).length > 0) {
              paymentEvents.push({
                action: 'PAYMENT_METHOD_UPDATED',
                resource: 'payment_methods',
                details: {
                  module: 'Shop Admin',
                  section: 'Settings',
                  subsection: 'Payment Methods',
                  target: newMethod.name || targetId,
                  paymentMethod: newMethod.name || targetId,
                  methodId: targetId,
                  changes: pmDetailChanges,
                },
              });
            }
          }
        }
      }
    }

    const incomingGallery = data.gallery !== undefined ? data.gallery : data.galleryImages;
    const galleryChanged = incomingGallery !== undefined && JSON.stringify(incomingGallery) !== JSON.stringify(current.gallery);

    const shopProductsChanged = data.shopProducts !== undefined && JSON.stringify(data.shopProducts) !== JSON.stringify(current.shopProducts);

    const faqChanged = data.faqs !== undefined && JSON.stringify(data.faqs) !== JSON.stringify(current.faqs);

    const aboutChanged = data.about !== undefined && JSON.stringify(data.about) !== JSON.stringify(current.about);

    const footerChanged = data.footer !== undefined && JSON.stringify(data.footer) !== JSON.stringify(current.footer);

    const incomingLegal = data.legal !== undefined ? data.legal : data.legalDocs;
    const documentsUpdated: Array<{ documentKey: string; title: string; previousUpdatedAt?: string; newUpdatedAt?: string; status?: string; changes?: Record<string, { from: any; to: any }> }> = [];

    if (incomingLegal !== undefined && JSON.stringify(incomingLegal) !== JSON.stringify(current.legal)) {
      if (incomingLegal.termsOfService && JSON.stringify(incomingLegal.termsOfService) !== JSON.stringify(current.legal?.termsOfService)) {
        const docChanges: Record<string, { from: any; to: any }> = {};
        if (incomingLegal.termsOfService.title && incomingLegal.termsOfService.title !== current.legal?.termsOfService?.title) {
          docChanges.title = { from: current.legal?.termsOfService?.title || 'Terms of Service', to: incomingLegal.termsOfService.title };
        }
        if (incomingLegal.termsOfService.status && incomingLegal.termsOfService.status !== current.legal?.termsOfService?.status) {
          docChanges.status = { from: current.legal?.termsOfService?.status || 'draft', to: incomingLegal.termsOfService.status };
        }
        if (incomingLegal.termsOfService.contentMarkdown && incomingLegal.termsOfService.contentMarkdown !== current.legal?.termsOfService?.contentMarkdown) {
          docChanges.content = { from: 'Previous Content', to: 'Updated Content' };
        }
        documentsUpdated.push({
          documentKey: 'termsOfService',
          title: incomingLegal.termsOfService.title || 'Terms of Service',
          previousUpdatedAt: current.legal?.termsOfService?.lastUpdatedAt || current.legal?.termsOfService?.lastUpdated,
          newUpdatedAt: incomingLegal.termsOfService.lastUpdatedAt || incomingLegal.termsOfService.lastUpdated,
          status: incomingLegal.termsOfService.status,
          changes: docChanges,
        });
      }

      if (incomingLegal.privacyPolicy && JSON.stringify(incomingLegal.privacyPolicy) !== JSON.stringify(current.legal?.privacyPolicy)) {
        const docChanges: Record<string, { from: any; to: any }> = {};
        if (incomingLegal.privacyPolicy.title && incomingLegal.privacyPolicy.title !== current.legal?.privacyPolicy?.title) {
          docChanges.title = { from: current.legal?.privacyPolicy?.title || 'Privacy Policy', to: incomingLegal.privacyPolicy.title };
        }
        if (incomingLegal.privacyPolicy.status && incomingLegal.privacyPolicy.status !== current.legal?.privacyPolicy?.status) {
          docChanges.status = { from: current.legal?.privacyPolicy?.status || 'draft', to: incomingLegal.privacyPolicy.status };
        }
        if (incomingLegal.privacyPolicy.contentMarkdown && incomingLegal.privacyPolicy.contentMarkdown !== current.legal?.privacyPolicy?.contentMarkdown) {
          docChanges.content = { from: 'Previous Content', to: 'Updated Content' };
        }
        documentsUpdated.push({
          documentKey: 'privacyPolicy',
          title: incomingLegal.privacyPolicy.title || 'Privacy Policy',
          previousUpdatedAt: current.legal?.privacyPolicy?.lastUpdatedAt || current.legal?.privacyPolicy?.lastUpdated,
          newUpdatedAt: incomingLegal.privacyPolicy.lastUpdatedAt || incomingLegal.privacyPolicy.lastUpdated,
          status: incomingLegal.privacyPolicy.status,
          changes: docChanges,
        });
      }
    }

    const websiteChanged = data.website !== undefined && JSON.stringify(data.website) !== JSON.stringify(current.website);

    const bypassTimeChanged =
      data.bypassTimeRestrictions !== undefined &&
      Boolean(data.bypassTimeRestrictions) !== Boolean(current.bypassTimeRestrictions);

    const bypassReceiptChanged =
      data.bypassReceiptOcr !== undefined &&
      Boolean(data.bypassReceiptOcr) !== Boolean(current.bypassReceiptOcr);

    const hasAnyChanges =
      Object.keys(generalChanges).length > 0 ||
      Object.keys(hoursChanges).length > 0 ||
      paymentEvents.length > 0 ||
      galleryChanged ||
      shopProductsChanged ||
      faqChanged ||
      aboutChanged ||
      footerChanged ||
      documentsUpdated.length > 0 ||
      websiteChanged ||
      bypassTimeChanged ||
      bypassReceiptChanged;

    // NO-CHANGE SAVE: If nothing changed, do not mutate DB and do not create meaningless audit events
    if (!hasAnyChanges) {
      return current;
    }

    const result = await adminRepository.updateShopSettings(branchId, data);
    invalidateShopSettingsCache(branchId);

    const actorId = (req?.user as any)?.user_id || (req?.user as any)?.id || null;
    const actorRole = (req?.user as any)?.role || 'Shop Admin';
    const isSystemAdminActor = actorRole === 'System Admin' || actorRole === 'Owner';
    const auditModule = isSystemAdminActor ? 'System Controls' : 'Shop Admin';
    const auditSection = isSystemAdminActor ? 'Content Management' : 'Settings';

    // Log General Settings audit event if general fields changed
    if (Object.keys(generalChanges).length > 0) {
      logSecurityEvent({
        userId: actorId,
        action: 'SHOP_SETTINGS_UPDATE',
        resource: 'shop_settings',
        details: {
          module: auditModule,
          section: auditSection,
          subsection: 'General',
          target: 'General Settings',
          branchId,
          shopName: result.shopName,
          contactEmail: result.contactEmail,
          changes: generalChanges,
          actorRole,
        },
        req,
      });
    }

    // Business Hours audit
    if (Object.keys(hoursChanges).length > 0) {
      logSecurityEvent({
        userId: actorId,
        action: 'BUSINESS_HOURS_UPDATED',
        resource: 'shop_settings',
        details: {
          module: auditModule,
          section: auditSection,
          subsection: 'Business Hours',
          target: 'Business Hours',
          branchId,
          daysUpdated,
          changes: hoursChanges,
          actorRole,
        },
        req,
      });
    }

    // Payment Methods audit (per modified method only)
    for (const pe of paymentEvents) {
      logSecurityEvent({
        userId: actorId,
        action: pe.action,
        resource: pe.resource,
        details: pe.details,
        req,
      });
    }

    // Landing / Website Content audit
    if (websiteChanged) {
      logSecurityEvent({
        userId: actorId,
        action: 'LANDING_CONTENT_UPDATED',
        resource: 'website_content',
        details: {
          module: auditModule,
          section: auditSection,
          subsection: 'Landing Page',
          target: 'Landing & About',
          headline: result.website?.heroHeadline,
          actorRole,
        },
        req,
      });

      // Distinct Section Visibility audit event if visibility changed
      const visibilityChanged =
        data.website?.sectionVisibility !== undefined &&
        JSON.stringify(data.website.sectionVisibility) !== JSON.stringify(current.website?.sectionVisibility);

      if (visibilityChanged) {
        logSecurityEvent({
          userId: actorId,
          action: 'SECTION_VISIBILITY_UPDATED',
          resource: 'website_content',
          details: {
            module: auditModule,
            section: auditSection,
            subsection: 'Section Visibility',
            target: 'Homepage Sections',
            visibility: result.website?.sectionVisibility,
            actorRole,
          },
          req,
        });
      }
    }

    // Gallery audit
    if (galleryChanged) {
      const oldCount = (current.gallery || []).length;
      const newCount = (result.gallery || []).length;
      logSecurityEvent({
        userId: actorId,
        action: newCount > oldCount ? 'GALLERY_IMAGE_ADDED' : newCount < oldCount ? 'GALLERY_IMAGE_REMOVED' : 'GALLERY_REORDERED',
        resource: 'gallery',
        details: {
          module: auditModule,
          section: auditSection,
          subsection: 'Gallery',
          target: 'Showcase Gallery',
          totalImages: newCount,
          changes: {
            total_images: { from: oldCount, to: newCount },
          },
          actorRole,
        },
        req,
      });
    }

    // FAQ audit
    if (faqChanged) {
      const oldCount = (current.faqs || []).length;
      const newCount = (result.faqs || []).length;
      logSecurityEvent({
        userId: actorId,
        action: 'FAQ_UPDATED',
        resource: 'faq',
        details: {
          module: auditModule,
          section: auditSection,
          subsection: 'FAQ',
          target: 'Frequently Asked Questions',
          totalFaqs: newCount,
          changes: {
            total_faqs: { from: oldCount, to: newCount },
          },
          actorRole,
        },
        req,
      });
    }

    // Legal Documents audit
    if (documentsUpdated.length > 0) {
      logSecurityEvent({
        userId: actorId,
        action: 'PUBLIC_DOCUMENT_UPDATED',
        resource: 'legal_docs',
        details: {
          module: auditModule,
          section: auditSection,
          subsection: 'Legal & Public Pages',
          target: documentsUpdated.map((d) => d.title).join(', '),
          termsUpdated: Boolean(incomingLegal?.termsOfService),
          privacyUpdated: Boolean(incomingLegal?.privacyPolicy),
          details: 'Content Updated',
          actorRole,
          documents: documentsUpdated.map((d) => ({
            documentKey: d.documentKey,
            title: d.title,
            previousUpdatedAt: d.previousUpdatedAt,
            newUpdatedAt: d.newUpdatedAt,
            status: d.status,
          })),
        },
        req,
      });
    }

    // Receipt Screenshot OCR Bypass audit
    if (bypassReceiptChanged) {
      logSecurityEvent({
        userId: actorId,
        action: 'SHOP_SETTINGS_UPDATE',
        resource: 'shop_settings',
        details: {
          module: 'System Controls',
          section: 'Roles & Access',
          subsection: 'Customer Experience',
          target: 'Bypass Payment Screenshot OCR',
          branchId,
          bypassReceiptOcr: Boolean(data.bypassReceiptOcr),
          changes: {
            bypassReceiptOcr: {
              from: Boolean(current.bypassReceiptOcr),
              to: Boolean(data.bypassReceiptOcr),
            },
          },
        },
        req,
      });
    }

    // Appointment Time Restrictions Bypass audit
    if (bypassTimeChanged) {
      logSecurityEvent({
        userId: actorId,
        action: 'SHOP_SETTINGS_UPDATE',
        resource: 'shop_settings',
        details: {
          module: 'System Controls',
          section: 'Roles & Access',
          subsection: 'Shop Operations',
          target: 'Bypass Appointment Time Restrictions',
          branchId,
          bypassTimeRestrictions: Boolean(data.bypassTimeRestrictions),
          changes: {
            bypassTimeRestrictions: {
              from: Boolean(current.bypassTimeRestrictions),
              to: Boolean(data.bypassTimeRestrictions),
            },
          },
        },
        req,
      });
    }

    return result;
  }

  async uploadShopMedia(file: Express.Multer.File, category: string = 'general'): Promise<{ publicUrl: string; fileName: string }> {
    if (!file || !file.buffer) {
      throw new AppError('No image file provided.', 400);
    }

    const detected = validateImageBuffer(file.buffer);
    const safeCategory = category.replace(/[^a-zA-Z0-9_-]/g, '');
    const randomKey = crypto.randomBytes(8).toString('hex');
    const filePath = `shop-settings/${safeCategory}_${Date.now()}_${randomKey}.${detected.extension}`;

    const adminClient = getAdminClient();
    const { error: uploadError } = await adminClient.storage
      .from('avatars')
      .upload(filePath, file.buffer, {
        contentType: detected.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error('[uploadShopMedia] Supabase storage upload failed:', uploadError);
      throw new AppError('Failed to upload media to storage.', 500);
    }

    const { data: { publicUrl } } = adminClient.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return { publicUrl, fileName: filePath };
  }

  async getUsers(
    page: number,
    limit: number,
    filter: string,
    roleFilter?: string,
    sortBy?: string,
    statusFilter?: string,
    categoryFilter?: string,
    search?: string
  ) {
    const effectiveRoleFilter = roleFilter && roleFilter !== 'all' ? normalizeRole(roleFilter) : roleFilter;
    const offset = (page - 1) * limit;
    const cacheKey = `${page}-${limit}-${filter}-${effectiveRoleFilter || 'all'}-${statusFilter || 'all'}-${categoryFilter || 'all'}-${search || ''}-${sortBy || 'default'}`;
    const cachedData = getCachedUsers(cacheKey);
    if (cachedData) return cachedData;

    const [totalUsers, users] = await Promise.all([
      adminRepository.countUsers({ filter, roleFilter: effectiveRoleFilter, statusFilter, categoryFilter, search }),
      adminRepository.findUsersPaginated({ filter, limit, offset, roleFilter: effectiveRoleFilter, sortBy, statusFilter, categoryFilter, search }),
    ]);

    const responseData = {
      users,
      pagination: { total: totalUsers, page, pages: Math.ceil(totalUsers / limit) },
    };
    setCachedUsers(cacheKey, responseData);
    return responseData;
  }

  async getAdmins() {
    return adminRepository.findAdmins();
  }

  async createAdmin(data: {
    email: string;
    password: string;
    role: string;
    username?: string;
    profilePicture?: string | null;
  }, req?: any) {
    const email = normalizeEmail(data.email);
    const role = data.role ? normalizeRole(data.role) : data.role;
    const normalizedData = { ...data, email, role };
    validateAdminCreation(normalizedData);

    const existingProfile = await adminRepository.findUserByEmail(email);
    if (existingProfile) throw new AppError('User already exists.', 409);

    const adminClient = getAdminClient();
    let authUser: any;
    try {
      const existingAuthUser = await findAuthUserByEmail(adminClient, email);
      if (existingAuthUser) throw new AppError('User already exists.', 409);

      // Never pass the requested staff role as Auth metadata. Public signup
      // metadata is untrusted; the protected repository promotion is authoritative.
      const { data: created, error } = await adminClient.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
      });
      if (error || !created?.user) {
        if (isDuplicateAuthError(error)) throw new AppError('User already exists.', 409);
        logger.error('[AdminService] Supabase Auth user creation failed', { error });
        throw new AppError('Unable to create the administrator account.', 500);
      }
      authUser = created.user;
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error('[AdminService] Supabase Auth provisioning request failed', { error });
      throw new AppError('Unable to create the administrator account.', 500);
    }

    try {
      let profile: any = null;
      for (let attempt = 0; attempt < PROFILE_RETRY_COUNT; attempt += 1) {
        profile = await adminRepository.findUserById(authUser.id);
        if (profile) break;
        if (attempt < PROFILE_RETRY_COUNT - 1) await delay(PROFILE_RETRY_DELAY_MS);
      }
      if (!profile) {
        throw new Error('Supabase Auth trigger did not create a public profile.');
      }

      const actorId = (req?.user as any)?.user_id || (req?.user as any)?.id || null;
      const result = await adminRepository.promoteAuthUser({
        userId: authUser.id,
        email,
        passwordHash: await hashPassword(data.password),
        role: data.role,
        username: data.username || null,
        profilePicture: data.profilePicture || null,
        createdBy: actorId,
        accountSource: 'system_admin',
      });

      invalidateAdminCache();
      logSecurityEvent({
        userId: actorId,
        action: 'ADMIN_CREATE',
        resource: 'admin_manager',
        details: { email: result.email, role: result.role, username: result.username },
        req,
      });
      return result;
    } catch (error: any) {
      logger.error('[AdminService] Public profile promotion failed', {
        userId: authUser.id,
        error: error?.message || error,
      });

      try {
        await adminRepository.deleteProvisionedAuthProfile(authUser.id);
      } catch (cleanupError) {
        logger.error('[AdminService] Failed to clean up public profile after provisioning failure', {
          userId: authUser.id,
          error: cleanupError,
        });
      }

      try {
        const { error: deleteError } = await adminClient.auth.admin.deleteUser(authUser.id);
        if (deleteError) {
          logger.error('[AdminService] Failed to clean up Supabase Auth user after provisioning failure', {
            userId: authUser.id,
            error: deleteError,
          });
        }
      } catch (cleanupError) {
        logger.error('[AdminService] Supabase Auth cleanup request failed', {
          userId: authUser.id,
          error: cleanupError,
        });
      }

      throw new AppError('Unable to finish administrator account provisioning.', 500);
    }
  }

  async createStaff(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    username?: string;
    profilePicture?: string | null;
    branchId?: number;
    specialty?: string;
  }, req?: any) {
    const email = normalizeEmail(data.email);
    const name = (data.name || '').trim();
    if (!name) {
      throw new AppError('Staff name is required.', 400);
    }
    if (!email) {
      throw new AppError('Email is required.', 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError('Invalid email format.', 400);
    }
    if (!data.password || data.password.length < 8) {
      throw new AppError('Password must be at least 8 characters.', 400);
    }

    const roleLower = (data.role || '').trim().toLowerCase();
    let normalizedRole: string;
    if (roleLower === 'barber') {
      normalizedRole = 'Barber';
    } else if (roleLower === 'cashier') {
      normalizedRole = 'Cashier';
    } else if (roleLower === 'inventory manager' || roleLower === 'inventory_manager') {
      normalizedRole = 'Inventory Manager';
    } else {
      throw new AppError('Staff role must be Barber, Cashier, or Inventory Manager.', 400);
    }

    const existingProfile = await adminRepository.findUserByEmail(email);
    if (existingProfile) throw new AppError('User already exists.', 409);

    const adminClient = getAdminClient();
    let authUser: any;
    try {
      const existingAuthUser = await findAuthUserByEmail(adminClient, email);
      if (existingAuthUser) throw new AppError('User already exists.', 409);

      const { data: created, error } = await adminClient.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: {
          name,
          full_name: name,
          role: normalizedRole,
        },
      });
      if (error || !created?.user) {
        if (isDuplicateAuthError(error)) throw new AppError('User already exists.', 409);
        logger.error('[AdminService] Supabase Auth staff creation failed', { error });
        throw new AppError('Unable to create the staff account.', 500);
      }
      authUser = created.user;
    } catch (error: any) {
      if (error instanceof AppError) throw error;
      logger.error('[AdminService] Supabase Auth provisioning request failed', { error });
      throw new AppError('Unable to create the staff account.', 500);
    }

    try {
      let profile: any = null;
      for (let attempt = 0; attempt < PROFILE_RETRY_COUNT; attempt += 1) {
        profile = await adminRepository.findUserById(authUser.id);
        if (profile) break;
        if (attempt < PROFILE_RETRY_COUNT - 1) await delay(PROFILE_RETRY_DELAY_MS);
      }
      if (!profile) {
        throw new Error('Supabase Auth trigger did not create a public profile.');
      }

      const actorId = (req?.user as any)?.user_id || (req?.user as any)?.id || null;
      const result = await adminRepository.promoteAuthStaff({
        userId: authUser.id,
        email,
        passwordHash: await hashPassword(data.password),
        role: normalizedRole,
        name,
        username: data.username || name,
        profilePicture: data.profilePicture || null,
        branchId: data.branchId || 1,
        createdBy: actorId,
        accountSource: 'admin',
      });

      invalidateAdminCache();
      logSecurityEvent({
        userId: actorId,
        action: 'STAFF_CREATE',
        resource: 'staff_management',
        details: { email: result.email, role: result.role, name: result.name },
        req,
      });
      return result;
    } catch (error: any) {
      logger.error('[AdminService] Public profile staff promotion failed', {
        userId: authUser.id,
        error: error?.message || error,
      });

      try {
        await adminRepository.deleteProvisionedAuthProfile(authUser.id);
      } catch (cleanupError) {
        logger.error('[AdminService] Staff profile rollback failed', { userId: authUser.id, cleanupError });
      }

      try {
        await adminClient.auth.admin.deleteUser(authUser.id);
      } catch (authCleanupError) {
        logger.error('[AdminService] Auth user rollback failed', { userId: authUser.id, authCleanupError });
      }

      throw new AppError('Staff account creation failed. Please try again.', 500);
    }
  }

  async updateStaff(id: string, data: {
    name?: string;
    email?: string;
    role?: string;
    username?: string;
    profilePicture?: string;
    specialty?: string;
    branchId?: number;
  }, req?: any) {
    let normalizedRole: string | undefined = undefined;
    if (data.role !== undefined) {
      const roleLower = data.role.trim().toLowerCase();
      if (roleLower === 'barber') {
        normalizedRole = 'Barber';
      } else if (roleLower === 'cashier') {
        normalizedRole = 'Cashier';
      } else if (roleLower === 'inventory manager' || roleLower === 'inventory_manager') {
        normalizedRole = 'Inventory Manager';
      } else {
        throw new AppError('Staff role must be Barber, Cashier, or Inventory Manager.', 400);
      }
    }

    const normalizedData = {
      ...data,
      email: data.email ? normalizeEmail(data.email) : undefined,
      role: normalizedRole,
    };

    const current = await adminRepository.findUserById(id);
    if (!current) throw new AppError('Staff member not found', 404);

    if (normalizedData.email && normalizedData.email !== normalizeEmail(current.email)) {
      const duplicate = await adminRepository.findUserByEmail(normalizedData.email);
      if (duplicate && String(duplicate.user_id) !== String(id)) {
        throw new AppError('A user with this email already exists.', 409);
      }

      const { error } = await getAdminClient().auth.admin.updateUserById(id, {
        email: normalizedData.email,
        email_confirm: true,
      });
      if (error) {
        if (isDuplicateAuthError(error)) throw new AppError('User already exists.', 409);
        logger.error('[AdminService] Supabase Auth staff email update failed', { userId: id, error });
        throw new AppError('Unable to update staff email.', 500);
      }
    }

    const result = await adminRepository.updateStaffMember(id, normalizedData);
    if (!result) throw new AppError('Staff member not found', 404);

    invalidateAdminCache();
    logSecurityEvent({
      userId: (req?.user as any)?.user_id || (req?.user as any)?.id || null,
      action: 'STAFF_UPDATE',
      resource: 'staff_management',
      details: { updated_user_id: id, email: result.email, role: result.role, name: result.name },
      req,
    });
    return result;
  }

  async setCashierInventoryAccess(cashierId: string, canAccess: boolean, actorId: string | null, req?: any) {
    const current = await adminRepository.findUserById(cashierId);
    if (!current) throw new AppError('Cashier user not found', 404);

    if (current.role !== 'Cashier') {
      throw new AppError('Inventory workspace access can only be granted to Cashier accounts.', 400);
    }

    const updated = await adminRepository.updateCashierInventoryAccess(cashierId, Boolean(canAccess));
    if (!updated) throw new AppError('Failed to update cashier inventory access', 500);

    invalidateAdminCache();

    logSecurityEvent({
      userId: actorId || null,
      action: canAccess ? 'CASHIER_INVENTORY_ACCESS_GRANTED' : 'CASHIER_INVENTORY_ACCESS_REVOKED',
      resource: 'role',
      details: {
        target_user_id: cashierId,
        target_email: current.email,
        targetRole: 'Cashier',
        can_access_inventory: Boolean(canAccess),
        reason: canAccess ? 'Granted inventory management workspace access' : 'Revoked inventory management workspace access',
      },
      req,
    });

    return updated;
  }

  async updateAdmin(id: string, data: {
    email?: string;
    role?: string;
    username?: string;
    profilePicture?: string;
  }, req?: any) {
    const current = await adminRepository.findUserById(id);
    if (!current) throw new AppError('User not found', 404);

    const normalizedData = {
      ...data,
      email: data.email ? normalizeEmail(data.email) : undefined,
      role: data.role !== undefined ? normalizeRole(data.role) : undefined,
    };
    validateAdminUpdate(normalizedData);

    const currentRole = String(current.role || '').trim().toLowerCase();
    const newRole = normalizedData.role !== undefined ? String(normalizedData.role).trim().toLowerCase() : currentRole;
    const isRoleChange = normalizedData.role !== undefined && newRole !== currentRole;

    const actorId = req?.user?.user_id || req?.user?.id;
    // Only prohibit self-role modification if role is ACTUALLY changing
    if (isRoleChange && actorId && String(actorId) === String(id)) {
      throw new AppError('Cannot change your own role.', 400);
    }

    // Only prevent final Superadmin demotion if role is ACTUALLY changing
    if (
      isRoleChange &&
      (currentRole.includes('system admin') || currentRole.includes('owner')) &&
      (!newRole.includes('system admin') && !newRole.includes('owner'))
    ) {
      const activeAdminCount = await adminRepository.countActiveSystemAdmins();
      if (activeAdminCount <= 1) {
        throw new AppError('Cannot demote the final remaining System Administrator.', 400);
      }
    }

    // Determine actual changed fields
    const changes: Record<string, { from: any; to: any }> = {};

    if (isRoleChange && normalizedData.role) {
      changes.role = { from: current.role, to: normalizedData.role };
    }

    const currentEmail = normalizeEmail(current.email);
    const isEmailChange = Boolean(normalizedData.email && normalizedData.email !== currentEmail);
    if (isEmailChange && normalizedData.email) {
      changes.email = { from: current.email, to: normalizedData.email };
    }

    const currentUsername = String(current.username || '').trim();
    const newUsername = normalizedData.username !== undefined ? String(normalizedData.username).trim() : currentUsername;
    const isUsernameChange = normalizedData.username !== undefined && newUsername !== currentUsername;
    if (isUsernameChange) {
      changes.username = { from: current.username || '(none)', to: normalizedData.username };
    }

    const currentProfilePic = current.profile_picture || null;
    const isProfilePicChange = normalizedData.profilePicture !== undefined && normalizedData.profilePicture !== currentProfilePic;
    if (isProfilePicChange) {
      changes.profilePicture = {
        from: currentProfilePic ? '[Avatar Set]' : '[None]',
        to: normalizedData.profilePicture ? '[Avatar Updated]' : '[None]',
      };
    }

    // If email actually changed, verify uniqueness and update Supabase Auth
    if (isEmailChange && normalizedData.email) {
      const duplicate = await adminRepository.findUserByEmail(normalizedData.email);
      if (duplicate && String(duplicate.user_id) !== String(id)) {
        throw new AppError('User already exists.', 409);
      }

      const { error } = await getAdminClient().auth.admin.updateUserById(id, {
        email: normalizedData.email,
        email_confirm: true,
      });
      if (error) {
        if (isDuplicateAuthError(error)) throw new AppError('User already exists.', 409);
        logger.error('[AdminService] Supabase Auth email update failed', { userId: id, error });
        throw new AppError('Unable to update the administrator email.', 500);
      }
    }

    // Only submit changed fields to repository
    const fieldsToUpdate: any = {};
    if (isEmailChange) fieldsToUpdate.email = normalizedData.email;
    if (isRoleChange) fieldsToUpdate.role = normalizedData.role;
    if (isUsernameChange) fieldsToUpdate.username = normalizedData.username;
    if (isProfilePicChange) fieldsToUpdate.profilePicture = normalizedData.profilePicture;

    let result = current;
    if (Object.keys(fieldsToUpdate).length > 0) {
      result = await adminRepository.updateAdminUser(id, fieldsToUpdate);
      if (!result) throw new AppError('No fields to update or user not found', 400);

      if (isEmailChange) {
        try {
          await getAdminClient().auth.admin.signOut(id, 'global');
        } catch (error) {
          logger.warn('[AdminService] Failed to revoke sessions after email update', { userId: id, error });
        }
      }

      invalidateAdminCache();
    }

    // Audit Logging
    if (isRoleChange) {
      logSecurityEvent({
        userId: actorId || null,
        action: 'ROLE_CHANGE',
        resource: 'role_management',
        details: {
          target_user_id: id,
          target_email: result.email,
          old_role: current.role,
          new_role: result.role,
          changed_by: actorId || 'System',
          changes,
        },
        req,
      });

      try {
        await notificationRepository.insertNotification({
          recipientUserId: id,
          event: 'user_role_updated',
          type: 'info',
          title: 'Role & Permissions Updated',
          message: `Your account role was changed from ${current.role} to ${result.role}. Your navigation and operational privileges have been updated.`,
          dedupeKey: `role_change:${id}:${result.role}:${Date.now()}`,
        });
      } catch (notifError) {
        logger.warn('[AdminService] Failed to emit role change notification', { userId: id, error: notifError });
      }
    } else if (Object.keys(changes).length > 0) {
      logSecurityEvent({
        userId: actorId || null,
        action: 'ACCOUNT_UPDATED',
        resource: 'account_management',
        details: {
          target_user_id: id,
          target_email: result.email,
          changes,
        },
        req,
      });
    }

    return result;
  }

  async suspendAdmin(id: string, currentUserId: string | number, req?: any) {
    ensureNotSelfSuspension(id, currentUserId);

    const targetUser = await adminRepository.findUserById(id);
    if (!targetUser) throw new AppError('User not found', 404);

    const targetRole = String(targetUser.role || '').toLowerCase();
    if (targetRole.includes('system admin') || targetRole.includes('owner')) {
      const activeAdminCount = await adminRepository.countActiveSystemAdmins();
      if (activeAdminCount <= 1) {
        throw new AppError('Cannot suspend the final remaining System Administrator.', 400);
      }
    }

    const result = await adminRepository.suspendUser(id);
    if (!result) throw new AppError('User not found', 404);

    try {
      await getAdminClient().auth.admin.signOut(id, 'global');
    } catch (error) {
      logger.warn('[AdminService] Failed to revoke sessions for suspended admin', { userId: id, error });
    }

    invalidateAdminCache();
    logSecurityEvent({
      userId: (req?.user as any)?.user_id || (req?.user as any)?.id || null,
      action: 'ADMIN_SUSPEND',
      resource: 'admin_manager',
      details: {
        suspended_user_id: id,
        target_email: targetUser.email,
        target_role: targetUser.role,
        target_username: (targetUser as any).username || null,
      },
      req,
    });
    return result;
  }

  async restoreAdmin(id: string, req?: any) {
    const targetUser = await adminRepository.findUserById(id);
    const result = await adminRepository.restoreUser(id);
    if (!result) throw new AppError('User not found', 404);

    invalidateAdminCache();
    logSecurityEvent({
      userId: (req?.user as any)?.user_id || (req?.user as any)?.id || null,
      action: 'ADMIN_RESTORE',
      resource: 'admin_manager',
      details: {
        restored_user_id: id,
        target_email: targetUser?.email || null,
        target_role: targetUser?.role || null,
        target_username: (targetUser as any)?.username || null,
      },
      req,
    });
    return result;
  }

  async resetPassword(id: string, newPassword: string, req?: any) {
    validateAdminPasswordReset(newPassword);
    const current = await adminRepository.findUserById(id);
    if (!current) throw new AppError('User not found', 404);

    const { error } = await getAdminClient().auth.admin.updateUserById(id, {
      password: newPassword,
    });
    if (error) {
      logger.error('[AdminService] Supabase Auth password update failed', { userId: id, error });
      throw new AppError('Unable to update the administrator password.', 500);
    }

    const passwordHash = await hashPassword(newPassword);
    const result = await adminRepository.updatePassword(id, passwordHash);
    if (!result) throw new AppError('User not found', 404);

    try {
      await getAdminClient().auth.admin.signOut(id, 'global');
    } catch (error) {
      logger.warn('[AdminService] Failed to revoke sessions after password reset', { userId: id, error });
    }

    invalidateAdminCache();
    logSecurityEvent({
      userId: (req?.user as any)?.user_id || (req?.user as any)?.id || null,
      action: 'ADMIN_PASSWORD_RESET',
      resource: 'admin_manager',
      details: {
        reset_user_id: id,
        target_email: current.email,
        target_role: current.role,
        target_username: (current as any).username || null,
      },
      req,
    });
    return { message: 'Password updated successfully' };
  }

  private validateReportDate(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new AppError('Date must use YYYY-MM-DD format.', 400);
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new AppError('Date is not a valid calendar date.', 400);
    }
    return value;
  }

  private toPositiveInt(value: unknown): number | null {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  async getSalesReport(query: { startDate?: unknown; endDate?: unknown; branchId?: unknown } = {}, req?: any) {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const startDate = query.startDate ? this.validateReportDate(query.startDate) : today;
    const endDate = query.endDate ? this.validateReportDate(query.endDate) : today;
    if (startDate > endDate) {
      throw new AppError('startDate cannot be after endDate.', 400);
    }
    const branchId = this.toPositiveInt(query.branchId ?? req?.user?.branch_id);
    try {
      return await adminRepository.getSalesReport({
        startDate,
        endDate,
        branchId,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      const detail = error instanceof Error ? error.message : 'Unknown database error';
      logger.error('[AdminService] getSalesReport failed', { error, startDate, endDate, branchId });
      throw new AppError(`Failed to load sales report. ${detail}`, 500);
    }
  }

  async getCommissionReport(query: { startDate?: unknown; endDate?: unknown; branchId?: unknown; barberId?: unknown } = {}, req?: any) {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const startDate = query.startDate ? this.validateReportDate(query.startDate) : today;
    const endDate = query.endDate ? this.validateReportDate(query.endDate) : today;
    if (startDate > endDate) {
      throw new AppError('startDate cannot be after endDate.', 400);
    }
    const branchId = this.toPositiveInt(query.branchId ?? req?.user?.branch_id);
    const barberId = this.toPositiveInt(query.barberId);
    try {
      return await adminRepository.getCommissionReport({
        startDate,
        endDate,
        branchId,
        barberId,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      const detail = error instanceof Error ? error.message : 'Unknown database error';
      logger.error('[AdminService] getCommissionReport failed', { error, startDate, endDate, branchId });
      throw new AppError(`Failed to load commission report. ${detail}`, 500);
    }
  }

  /**
   * Securely upload avatar image to Supabase Storage using admin client (service_role),
   * bypassing client-side RLS restrictions and enforcing server-side image validation.
   */
  async uploadAvatar(
    fileBuffer: Buffer,
    _mimeType: string,
    targetUserId?: string
  ) {
    const detected = validateImageBuffer(fileBuffer);
    const randomKey = crypto.randomBytes(8).toString('hex');
    const folder = targetUserId ? String(targetUserId).replace(/[^a-zA-Z0-9_-]/g, '_') : 'admin-uploads';
    const filePath = `${folder}/${Date.now()}_${randomKey}.${detected.extension}`;

    logger.info(`[uploadAvatar] System Admin uploading avatar to Supabase Storage: ${filePath}`);

    const adminClient = getAdminClient();
    const { error: uploadError } = await adminClient.storage
      .from('avatars')
      .upload(filePath, fileBuffer, {
        contentType: detected.mimeType,
        upsert: false,
      });

    if (uploadError) {
      logger.error(`[uploadAvatar] Supabase Storage upload failed: ${uploadError.message}`);
      throw new AppError('Failed to upload profile picture. Please try again.', 500);
    }

    const { data: { publicUrl } } = adminClient.storage
      .from('avatars')
      .getPublicUrl(filePath);

    logger.info(`[uploadAvatar] Avatar uploaded successfully: ${publicUrl}`);
    return {
      message: 'Avatar uploaded successfully',
      publicUrl,
      profilePicture: publicUrl,
    };
  }
}

export const adminService = new AdminService();
export default adminService;
