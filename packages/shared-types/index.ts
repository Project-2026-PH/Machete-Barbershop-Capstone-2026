/**
 * Shared Type Definitions for DemoShop
 * Synchronized with supabase/migrations/20260612000001_schema.sql
 */

export type { Database, Tables } from './supabase';

export enum UserRole {
  SYSTEM_ADMIN = "System Admin",
  OWNER = "Owner",
  ADMIN = "Admin",
  SHOP_ADMIN = "ShopAdmin",
  CASHIER = "Cashier",
  INVENTORY_MANAGER = "Inventory Manager",
  BARBER = "Barber",
  CUSTOMER = "Customer"
}
export interface User {
  user_id: string;
  branch_id?: number | null;
  username?: string | null;
  email: string;
  password_hash?: string | null;
  google_id?: string | null;
  role: UserRole;
  profile_picture?: string | null;
  verification_code?: string | null;
  verification_code_expires_at?: string | null;
  is_verified: boolean;
  can_access_inventory?: boolean | null;
  created_at: string;
  deleted_at?: string | null;
}

export type FeatureStatus = 'ENABLED' | 'DISABLED' | 'MAINTENANCE';

export interface SystemFeature {
  id: string;
  name: string;
  description: string;
  category: string;
  status: FeatureStatus;
  is_core: boolean;
  is_critical: boolean;
  affected_roles: string[];
  dependencies: string[];
  maintenance_message?: string | null;
  updated_at: string;
  updated_by?: string | null;
}

export type FeatureStatusSummary = Record<string, {
  status: FeatureStatus;
  maintenance_message?: string | null;
  affected_roles?: string[];
}>;
// TODO: Create a table
export interface Appointment {
  appointment_id: number;
  customer_id: number;
  barber_id: number;
  barber_name?: string;
  branch_id: number;
  branch_name?: string;
  service_id: number;
  service_title?: string;
  appointment_date: string;
  appointment_time: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
}

// TODO: Create a table
export interface Notification {
  id: number;
  event?: 'reservation_pending' | 'reservation_confirmed' | 'reservation_cancelled' | 'reservation_declined' | 'cashier_reservation_pending' | 'inventory_purchase_order_pending' | 'inventory_purchase_order_approved' | 'inventory_purchase_order_rejected';
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  branch_id?: number | null;
  queue_entry_id?: number | null;
  time?: string;
  created_at?: string;
  read: boolean;
}
export interface CustomerProfile extends Customer {
  email: string;
  membership_tier?: string; // e.g., 'Gold', 'Silver'
  profile_picture?: string | null;
}

export interface StaffMember extends Barber {
  role: string;      // e.g., 'Senior Barber'
  status: BarberStatus;
  appointments: number; // Count of today's tasks
  rating?: number;
}

export interface StaffDirectoryMember {
  id: number;
  barber_id?: number;
  user_id?: string;
  name: string;
  role: string;
  status: BarberStatus;
  appointments: number;
  rating: number;
  specialty?: string;
  branch?: string;
  email?: string;
  username?: string;
  profile_picture?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
  is_suspended?: boolean;
  total_services_completed?: number;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  shift_is_off?: boolean | null;
  can_access_inventory?: boolean | null;
}

export interface StaffCreateData {
  name: string;
  email: string;
  password: string;
  role: 'Barber' | 'Cashier' | 'Inventory Manager';
  specialty?: string;
  branchId?: number;
  username?: string;
}

export interface DashboardScheduleItem {
  id: number;
  client: string;
  service: string;
  barber: string;
  time: string;
  status: 'Confirmed' | 'Completed' | 'Pending' | 'Cancelled' | 'Serving' | 'Waiting' | 'No Show';
  price: string;
}

export interface DashboardStatCard {
  title: string;
  value: string;
  raw_value: number;
  change: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface RevenueChartPoint {
  day: string;
  date: string;
  revenue: number;
  height_percent: number;
}

export interface DashboardTopService {
  name: string;
  count: number;
  percent: number;
}

export interface DashboardCustomerSatisfaction {
  average_rating: number;
  total_reviews: number;
  stars_breakdown: {
    star5: number;
    star4: number;
    star3: number;
    star2: number;
    star1: number;
  };
  positive_percentage?: number;
  recent_reviews?: Array<{
    id: number;
    customer_name: string;
    barber_name: string;
    stars: number;
    comment: string | null;
    date: string;
  }>;
}

export interface MonthlyCustomersServedPoint {
  date: string;
  day: string;
  weekday: string;
  count: number;
  walk_in_count: number;
  online_count: number;
}

export interface MonthlyCustomersServed {
  month_key?: string;
  month_name: string;
  available_months?: Array<{ key: string; label: string }>;
  total_month_served: number;
  daily_average: number;
  peak_day: {
    date: string;
    day: string;
    count: number;
  };
  days: MonthlyCustomersServedPoint[];
}

export interface TopPerformingBarber {
  barber_id: number;
  barber_name: string;
  completed_services_count: number;
  total_revenue: number;
  rating: number;
  review_count: number;
  rank: number;
  avatar?: string | null;
  specialty?: string;
}

export interface RevenuePeriodAggregation {
  total_revenue: number;
  growth_percentage: string;
  points: RevenueChartPoint[];
}

export interface BranchStatsResponse {
  branch_id?: number;
  branch_name?: string;
  stats: {
    total_revenue: DashboardStatCard;
    online_bookings?: DashboardStatCard;
    customers_served?: DashboardStatCard;
    walk_in_customers?: DashboardStatCard;
    total_staff?: DashboardStatCard;
    appointments?: DashboardStatCard;
    new_customers?: DashboardStatCard;
    avg_service?: DashboardStatCard;
  };
  today_schedule: DashboardScheduleItem[];
  revenue_chart: {
    total_period_revenue: number;
    growth_percentage: string;
    points: RevenueChartPoint[];
    periods?: Record<string, RevenuePeriodAggregation>;
  };
  top_services: DashboardTopService[];
  customer_satisfaction: DashboardCustomerSatisfaction;
  monthly_customers_served?: MonthlyCustomersServed;
  top_performing_barbers?: TopPerformingBarber[];
}

export interface Branch {
  branch_id: number;
  name: string;
  address?: string | null;
  image?: string | null;
  daily_float: number;
  contact_email?: string | null;
  settings?: any;
}

export interface BusinessHourDay {
  day: string;
  openTime: string;
  closeTime: string;
  isOpen: boolean;
}

export interface PaymentMethodConfig {
  id: string; // 'cash' | 'gcash' | 'maya' | 'qr_ph' | 'card'
  key: string;
  type: string;
  name: string;
  description: string;
  enabled: boolean;
  isPrimary?: boolean;
  instructions?: string;
  qrImageUrl?: string | null;
  merchantName?: string;
  accountName?: string;
  accountNumber?: string;
  updatedAt?: string;
}

export interface WebsiteCustomization {
  heroHeadline: string;
  heroSubtext: string;
  heroImageUrl?: string;
  heroCtaPrimary?: string;
  heroCtaSecondary?: string;
  ctaPrimaryLabel?: string;
  ctaSecondaryLabel?: string;
  termsLastUpdated?: string;
  privacyLastUpdated?: string;
  lastUpdated?: string;
  updatedBy?: string;
  sectionVisibility?: {
    hero?: boolean;
    about?: boolean;
    services?: boolean;
    bookingPreview?: boolean;
    gallery?: boolean;
    locations?: boolean;
    testimonials?: boolean;
    faq?: boolean;
    footer?: boolean;
  };
  ctaPrimaryDestination?: string;
  ctaSecondaryDestination?: string;
}

export interface GalleryImageConfig {
  id: string;
  src?: string;
  imageUrl: string;
  alt?: string;
  caption?: string;
  category: string;
  displayOrder: number;
}

export interface FAQConfig {
  id: string;
  question: string;
  answer: string;
  isEnabled?: boolean;
  enabled: boolean;
  category?: string;
  displayOrder: number;
}

export interface AboutConfig {
  heading: string;
  subheading?: string;
  storyParagraph1?: string;
  storyParagraph2?: string;
  storyParagraph3?: string;
  yearsExperience?: string;
  happyClients?: string;
  quote?: string;
  quoteText?: string;
  quoteAuthor?: string;
  stats?: {
    years?: string;
    cuts?: string;
    rating?: string;
  };
  imageUrl?: string;
}

export interface FooterConfig {
  brandDescription?: string;
  phone?: string;
  hoursDisplay?: string;
  operatingHoursDisplay?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  socialLinks?: {
    facebook?: string;
    tiktok?: string;
    instagram?: string;
  };
  copyrightText?: string;
}

export interface LegalDocumentConfig {
  id?: string;
  documentKey?: string;
  title: string;
  slug?: string;
  content: string;
  contentMarkdown?: string;
  status: 'active' | 'draft';
  enabled?: boolean;
  lastUpdated: string;
  lastUpdatedAt?: string;
  updatedBy?: string;
}

export interface LegalDocsConfig {
  termsOfService: LegalDocumentConfig;
  privacyPolicy: LegalDocumentConfig;
}

export interface ShopProductConfig {
  id: string | number;
  name: string;
  category: string;
  retailPrice: number;
  description?: string;
  imageUrl?: string | null;
  displayOrder?: number;
  stockStatus?: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';
  tags?: string[];
  ctaText?: string;
  ctaLink?: string;
  showInShop?: boolean;
}

export interface ShopSettings {
  shopName: string;
  contactEmail: string;
  physicalAddress: string;
  businessHours: BusinessHourDay[] | Record<string, { openTime: string; closeTime: string; isOpen: boolean }>;
  paymentMethods?: PaymentMethodConfig[];
  website?: WebsiteCustomization;
  gallery?: GalleryImageConfig[];
  galleryImages?: GalleryImageConfig[];
  shopProducts?: ShopProductConfig[];
  faqs?: FAQConfig[];
  about?: AboutConfig;
  footer?: FooterConfig;
  legal?: LegalDocsConfig;
  legalDocs?: LegalDocsConfig;
  branchId?: number;
  bypassTimeRestrictions?: boolean;
  bypassReceiptOcr?: boolean;
}

export interface Service {
  service_id: number;
  category?: string | null;
  sub_category?: string | null;
  title: string;
  price: number;
  description?: string | null;
  duration_minutes?: number | null;
  id?: number;
  name?: string;
  duration?: number;
  image_url?: string | null;
}

export interface Barber {
  barber_id: number;
  user_id: string;
  name: string;
  current_cash_advance: number;
  is_active: boolean;
  // UI-specific fields (not in schema yet but useful)
  expertise?: string[];
  is_available?: boolean;
  is_off_today?: boolean;
  schedule_reason?: string | null;
  is_on_duty_today?: boolean;
  isOnDutyToday?: boolean;
  is_online_booking_enabled_today?: boolean;
  isOnlineBookingEnabledToday?: boolean;
  is_available_for_walkins?: boolean;
  walkin_available?: boolean;
  rating?: number | null;
  review_count?: number | null;
  completed_services_count?: number;
  is_top_performer?: boolean;
  isTopPerformer?: boolean;
  rank?: number | null;
}

export interface PublicBarber {
  barber_id: number;
  name: string;
  status?: string;
  break_started_at?: string | null;
  bio?: string | null;
  rating?: number | null;
  review_count?: number;
  specialties?: string[];
  queue_count?: number;
  serving_count?: number;
  completed_services_count?: number;
  signature_service?: string | null;
  service_completed_counts?: Record<string, number>;
  is_top_performer?: boolean;
  isTopPerformer?: boolean;
  rank?: number | null;
  image?: string | null;
  profile_picture?: string | null;
  eta_minutes?: number;
  etaMinutes?: number;
  is_off_today?: boolean;
  is_on_duty_today?: boolean;
  isOnDutyToday?: boolean;
  is_online_booking_enabled?: boolean;
  is_online_booking_enabled_today?: boolean;
  isOnlineBookingEnabledToday?: boolean;
  is_available_for_walkins?: boolean;
  walkin_available?: boolean;
  walkin_status?: string;
  schedule_reason?: string | null;
}

export interface Customer {
  customer_id: number;
  user_id: string;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  email?: string | null;
  created_at: string;
}

export interface QueueEntry {
  id: number;
  customer_id?: number | null;
  customer_name?: string | null; // For walk-ins
  barber_id?: number | null;
  branch_id: number;
  /** Primary service retained for legacy queue, feedback, and reporting flows. */
  service_id?: number | null;
  /** All services included in this booking, in customer-selected order. */
  service_ids?: number[] | null;
  /** Server-calculated aggregate duration for scheduling and timer expiry. */
  duration_minutes?: number | null;
  position: number;
  status: 'pending' | 'accepted' | 'late' | 'waiting' | 'serving' | 'in-progress' | 'completed' | 'cancelled' | 'expired' | 'no_show';
  payment_status: 'unpaid' | 'paid';
  /** Non-refundable reservation fee outcome after customer cancellation. */
  reservation_fee_disposition?: 'retained' | null;
  is_walk_in: boolean;
  timer_started_at?: string | null;
  scheduled_start_at?: string | null;
  arrival_deadline_at?: string | null;
  arrived_at?: string | null;
  service_started_at?: string | null;
  service_ends_at?: string | null;
  group_booking_id?: string | null;
  guest_name?: string | null;
  created_at: string;
}

export interface GuestBooking {
  guestIndex: number;
  guestName?: string;
  services: Service[];
  barberId: string;
  barberName?: string;
  barber?: any;
  scheduledDate: string;
  scheduledTime: string;
  estimatedEndTime?: string;
  durationMinutes?: number;
  isSequential?: boolean;
  sequentialReason?: string;
  badgeLabel?: string;
}

export interface GroupBookingItemData {
  guestName?: string;
  barberId: number;
  serviceIds: number[];
  preferredDate: string;
  preferredTime: string;
  scheduledStartTime?: string;
  estimatedEndTime?: string;
  durationMinutes?: number;
}

export interface CreateGroupBookingData {
  branchId: number;
  preferredDate?: string;
  baseTimeSlot?: string;
  isStaggered?: boolean;
  guests: GroupBookingItemData[];
  referenceNumber: string;
  proofImageUrl?: string;
  paymentMethod?: string;
  paymentMethodId?: string;
  imageHash?: string;
  ocrReferenceNumber?: string;
  recipientIdentifierDetected?: string;
  agreedToTerms?: boolean;
}

export interface CreateQueueBookingData {
  branchId: number;
  barberId: number;
  serviceIds: number[];
  preferredDate?: string;
  preferredTime?: string;
  recipientIdentifierDetected?: string;
}

/**
 * Service Combo Rules
 * Shared source of truth so backend validation and frontend UI never drift.
 */
export type ServiceFamily =
  | 'promo'
  | 'headshave'
  | 'haircut'
  | 'hair-perm'
  | 'hair-art'
  | 'other';

export interface ComboEligibleService {
  service_id: number;
  title: string;
  category?: string | null;
  sub_category?: string | null;
}

/** Categorizes a service into a conflict family based on catalog metadata. */
export function getServiceFamily(service: ComboEligibleService): ServiceFamily {
  const title = (service.title || '').toUpperCase().trim();
  const category = (service.category || '').toUpperCase().trim();
  const subCategory = (service.sub_category || '').toUpperCase().trim();

  if (category === 'SPECIAL PROMOS' || subCategory === 'SPECIAL PROMOS' || subCategory === 'PROMO' || subCategory === 'PACKAGES') return 'promo';
  if (subCategory === 'HEAD SHAVE' || /^HEAD\s*SHAVE/.test(title)) return 'headshave';
  if (subCategory === 'HAIR PERM' || /HAIR\s*PERM/.test(title)) return 'hair-perm';
  if (subCategory === 'HAIRCUT' || subCategory === 'HAIR CUT' || /HAIR\s*CUT/.test(title)) return 'haircut';
  if (subCategory === 'HAIR ART' || /HAIR\s*ART/.test(title)) return 'hair-art';
  return 'other';
}

export interface ComboConflict {
  reason: string;
  conflictingIds: number[];
}

/**
 * Validates a selection of services against the combo rules.
 * Returns null when the combination is valid, otherwise a structured conflict.
 */
export function validateServiceCombo(services: ComboEligibleService[]): ComboConflict | null {
  if (services.length <= 1) return null;

  const tagged = services.map(service => ({ service, family: getServiceFamily(service) }));
  const idsFor = (family: ServiceFamily) => tagged.filter(t => t.family === family).map(t => t.service.service_id);
  const hairFamilies: ServiceFamily[] = ['haircut', 'hair-perm', 'hair-art'];

  // Rule 1: only one haircut variant per visit (blocks Haircut + Haircut w/Shampoo and duplicate color add-ons).
  const haircutIds = idsFor('haircut');
  if (haircutIds.length > 1) {
    return {
      reason: 'Only one haircut service can be booked per visit.',
      conflictingIds: haircutIds,
    };
  }

  // Rule 2: Head Shave is incompatible with any hair-based service.
  const headshaveIds = idsFor('headshave');
  const hairIds = tagged.filter(t => hairFamilies.includes(t.family)).map(t => t.service.service_id);
  if (headshaveIds.length > 0 && hairIds.length > 0) {
    return {
      reason: 'Head Shave can\'t be combined with a haircut, hair art, or perm.',
      conflictingIds: [...headshaveIds, ...hairIds],
    };
  }
  if (headshaveIds.length > 1) {
    return {
      reason: 'Head Shave can only be booked once per visit.',
      conflictingIds: headshaveIds,
    };
  }

  // Rule 3: Special Promos already bundle multiple services and are exclusive.
  const promoIds = idsFor('promo');
  if (promoIds.length > 0 && services.length > promoIds.length) {
    return {
      reason: 'Signature packages already include multiple services and can\'t be combined with others.',
      conflictingIds: services.map(s => s.service_id),
    };
  }
  if (promoIds.length > 1) {
    return {
      reason: 'Only one signature package can be selected per visit.',
      conflictingIds: promoIds,
    };
  }

  return null;
}

export type TransactionType = 'service' | 'reservation_fee';

export interface Transaction {
  transaction_id: number;
  branch_id?: number | null;
  barber_id?: number | null;
  customer_id?: number | null;
  queue_entry_id?: number | null;
  payment_attempt_id?: number | null;
  idempotency_key?: string | null;
  total_amount: number;
  payment_method: 'Cash' | 'GCash';
  transaction_type?: TransactionType;
  gcash_ref_no?: string | null;
  gcash_screenshot_url?: string | null;
  created_at: string;
}

export interface ReceiptLine {
  /** Null for retail product lines, which are not services. */
  serviceId: number | null;
  serviceName: string;
  amount: number;
  paymentMethod: 'Cash' | 'GCash';
  /** Set for retail product lines. Service lines are always a single unit. */
  productId?: number;
  quantity?: number;
  unitPrice?: number;
  customSpecification?: string | null;
}

export interface BranchInvoiceProfile {
  branchId: number;
  tradeName: string;
  registeredName: string;
  registeredAddress: string;
  taxType: 'VAT' | 'NON_VAT';
  /** Nine-digit taxpayer identifier, excluding the five-digit branch code. */
  tin: string;
  branchCode: string;
  confirmedFromForm2303: boolean;
  updatedAt: string;
}

export interface ReceiptReservationFee {
  amount: number;
  paymentMethod: 'Cash' | 'GCash';
  transactionId?: number;
}

export interface ReceiptDocument {
  receiptDocumentId: number;
  receiptNumber: string;
  /** Null for retail-only sales, which never create a queue entry. */
  queueEntryId: number | null;
  /** Set for retail-only sales, which are scoped by transaction instead. */
  transactionId?: number | null;
  /** Distinguishes a retail-only POS sale from a service order. */
  isRetailOnly?: boolean;
  branchId: number;
  documentVersion: number;
  issuedAt: string;
  branch: { name: string; address: string | null };
  customerName: string;
  barberName: string;
  cashierName?: string | null;
  guestReference: string | null;
  /** One time private visit lookup code printed on walk-in service receipts. */
  visitLookupCode?: string | null;
  /** Backend-only ciphertext retained so a queued printer can render the receipt again. */
  visitLookupCodeEncrypted?: string | null;
  isWalkIn?: boolean;
  reservationFee?: ReceiptReservationFee | null;
  /** Cash handed to the cashier, recorded on the authoritative transaction. */
  cashReceivedAmount?: number | null;
  /** Change returned to the customer, recorded on the authoritative transaction. */
  cashChangeAmount?: number | null;
  lines: ReceiptLine[];
  totalAmount: number;
  paymentMethods: Array<'Cash' | 'GCash'>;
  gcashReferenceLast4: string | null;
  emailStatus: 'not_applicable' | 'pending' | 'sending' | 'sent' | 'failed';
  emailAvailable: boolean;
}

export interface RecordReservationFeeData {
  queueEntryId: number;
  amount?: number;
  paymentMethod: 'Cash' | 'GCash';
  gcashRefNo?: string | null;
  idempotencyKey?: string;
}

export interface ReservationFeeResponse {
  transaction: Transaction;
  queueEntryId: number;
  status: string;
}

export interface ReceiptResponse extends ReceiptDocument {
  /** Redacted on screen; the print stylesheet reveals the full tax ID only on paper. */
  html: string;
  /** Full taxpayer details for email e-receipts delivered to the verified recipient. */
  invoiceHtml?: string;
  guestQrCode?: string | null;
  /** Restricted receipt response data used only by the authenticated cashier printer. */
  sellerInvoiceProfile?: BranchInvoiceProfile | null;
}

export interface AuditLogDetails {
  target?: string | null;
  target_email?: string | null;
  target_role?: string | null;
  target_user_id?: string | null;
  target_username?: string | null;
  target_name?: string | null;
  customer_name?: string | null;
  customer_id?: string | null;
  barber_name?: string | null;
  barber_id?: number | null;
  appointment_id?: string | number | null;
  transaction_id?: string | number | null;
  service_name?: string | null;
  service_id?: number | null;
  item_name?: string | null;
  supplier_name?: string | null;
  supplier_id?: string | number | null;
  reason?: string | null;
  cancellation_reason?: string | null;
  total_amount?: number | string | null;
  changes?: Record<string, { from?: any; to?: any } | any> | null;
  module?: string | null;
  section?: string | null;
  subsection?: string | null;
  [key: string]: any;
}

export interface AuditLog {
  audit_id: string; // UUID
  user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  action: string;
  resource?: string | null;
  details?: AuditLogDetails | any | null;
  status?: 'SUCCESS' | 'FAILURE' | string;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

/**
 * Inventory / Products (Draft - Not in base schema yet)
 */
export interface Product {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  stock_quantity: number;
  critical_level: number;
  branch_id: number;
  created_at: string;
}

/**
 * Auth-related DTOs
 */
export interface RegistrationData {
  email: string;
  password?: string;
  confirmPassword?: string;
  firstName: string;
  lastName: string;
}

export interface LoginCredentials {
  email: string;
  password?: string;
  rememberMe?: boolean;
}

export interface VerificationData {
  email: string;
  code: string;
  password?: string;
}

export interface SessionData {
  token: string;
  supabaseToken: string | null;
  maxAge: number;
}

/**
 * Walk-in customer data (Cashier POS flow)
 */
export type PaymentMethod = 'Cash' | 'GCash';

export interface CashierPaymentLine {
  serviceId: number;
  method: PaymentMethod;
  gcashRefLast4?: string | null;
  gcashReference?: string | null;
}

/** One retail SKU on a cashier POS cart. Prices are always resolved server-side. */
export interface RetailSaleLineInput {
  productId: number;
  quantity: number;
}

export interface RetailSaleLineSnapshot {
  productId: number;
  quantity: number;
  unitPrice: number;
  name: string;
}

/** Direct retail-only checkout. Must not create a queue_entries row. */
export interface RetailSaleData {
  customerName?: string;
  branchId: number;
  items: RetailSaleLineInput[];
  paymentMethod?: PaymentMethod;
  gcashRefNo?: string | null;
  idempotencyKey: string;
  createdBy?: string;
}

export interface QueuePaymentData {
  queueId: number;
  method: PaymentMethod;
  /** Must equal the server-calculated amount due; never trusted for pricing. */
  amount: number;
  idempotencyKey: string;
  gcashReference?: string;
}

export interface WalkInData {
  customerName: string;
  barberId?: number;
  branchId: number;
  /** Selected service IDs, validated and priced by the server. */
  serviceIds?: number[];
  /** Retail products sold with a service walk-in; ignored by retail-only checkout. */
  retailItems?: RetailSaleLineInput[];
  /** Client-generated key used to make online/offline retries idempotent. */
  idempotencyKey?: string;
  /** Per-service tender details; service prices are always resolved server-side. */
  paymentLines?: CashierPaymentLine[];
  /** Existing reservation code, e.g. MCH-0042, to reconcile instead of creating a walk-in. */
  reservationCode?: string;
  /** Server-only actor identity used for audit ownership when creating a guest profile. */
  createdBy?: string;
  isPrePaid?: boolean;
  isTest?: boolean;
}

/**
 * Shortest Estimated Completion Time (SECT) Barber Candidate
 */
export interface BarberEtaCandidate {
  barberId: number;
  name: string;
  status: string;
  isActive: boolean;
  etaMinutes: number;
}

/**
 * Result of SECT assignment resolution
 */
export interface SectResolution {
  isTie: boolean;
  winner: BarberEtaCandidate | null;
  tiedBarbers: BarberEtaCandidate[];
  eligibleBarbers: BarberEtaCandidate[];
}

export interface SectTieMetadata {
  code: 'SECT_TIE';
  isTie: true;
  tiedBarbers: BarberEtaCandidate[];
}

export type BarberOperationalStatus = 'available' | 'serving' | 'busy' | 'break' | 'on_break' | 'leave' | 'absent' | 'suspended' | 'offline' | 'on_duty' | 'off_duty';
export type BarberStatus =
  | BarberOperationalStatus
  | 'Available'
  | 'Serving'
  | 'Busy'
  | 'On Break'
  | 'Break'
  | 'Absent'
  | 'Leave'
  | 'Suspended'
  | 'Offline'
  | 'On Duty'
  | 'Off Duty';

export interface BarberAdminStatusUpdate {
  barberId: number;
  status: BarberStatus;
  reason?: string;
}

/**
 * Admin creation DTO
 */
export interface AdminCreateData {
  email: string;
  password: string;
  role: string;
  username?: string;
  profilePicture?: string | null;
}

export interface AvailabilitySlot {
  hour: string;
  isAvailable: boolean;
  queueCount: number;
  waitTimeMinutes: number;
  isOnBreak?: boolean;
  breakBufferMinutes?: number;
  recommendedArrivalTime?: string;
}

export interface BusyPeriod {
  startTime: string;
  endTime: string;
  queueCount: number;
  waitTimeMinutes: number;
}

export interface AvailabilityResponse {
  availableSlots: AvailabilitySlot[];
  busyPeriods: BusyPeriod[];
  isUnavailable?: boolean;
  reason?: string;
  isOnBreak?: boolean;
}

export interface BatchAvailabilitySlotSummary {
  availableBarberIds: string[];
  totalAvailable: number;
}

export interface BatchBarberAvailability extends AvailabilityResponse {
  /** Schedule state for the requested date, not necessarily today. */
  isOnDuty?: boolean;
  isOnlineBookingEnabled?: boolean;
  isAvailableForWalkins?: boolean;
  scheduleReason?: string | null;
}

export interface BatchAvailabilityResponse {
  date: string;
  branchId: number;
  slots: Record<string, BatchAvailabilitySlotSummary>;
  barbers: Record<string, BatchBarberAvailability>;
}

/**
 * Rating submission DTO
 */
export interface RatingData {
  queueId: number;
  stars: number;
  comment?: string;
}

/**
 * Service data DTO (for create/update)
 */
export interface ServiceData {
  title: string;
  description?: string;
  price: number;
  category?: string;
  sub_category?: string;
  duration_minutes?: number;
  image_url?: string | null;
}

export * from './profanity-filter';
export * from './payment-recipient';
export * from './payment-providers';



export type PaymentAttemptStatus =
  | 'pending_verification'
  | 'automated_review_passed'
  | 'flagged'
  | 'rejected'
  | 'manually_confirmed';

export type PaymentAttemptDecision = 'confirm' | 'reject';

export interface AutomatedPaymentReview {
  mode: string;
  ocr: 'not_run' | 'completed' | 'failed';
  amountMatch?: boolean;
  merchantMatch?: boolean;
  duplicateReference?: boolean;
  riskScore?: number | null;
  requiresManualReconciliation: boolean;
  reasonCodes?: string[];
}

export interface PaymentAttempt {
  payment_attempt_id: number;
  queue_entry_id: number;
  branch_id: number;
  customer_id?: number | null;
  submitted_by?: string | null;
  payment_method: 'Cash' | 'GCash';
  amount: number | string;
  authoritative_amount: number | string;
  gcash_ref_no?: string | null;
  receipt_storage_path?: string | null;
  receipt_sha256?: string | null;
  receipt_width?: number | null;
  receipt_height?: number | null;
  recipient_identifier_detected?: string | null;
  evidence_validation_status?: string | null;
  evidence_validation_mode?: string | null;
  status: PaymentAttemptStatus;
  automated_review?: AutomatedPaymentReview | null;
  manual_review_reason?: string | null;
  manually_reviewed_by?: string | null;
  manually_reviewed_at?: string | null;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentAttemptSubmissionResult {
  attempt: PaymentAttempt;
  pendingVerification: boolean;
  httpStatus?: 202;
}

export interface PaymentAttemptReconciliationResult {
  attempt: PaymentAttempt;
  queueEntry?: QueueEntry;
  transactions?: unknown[];
  pendingVerification: boolean;
  decision?: PaymentAttemptDecision;
}


export const QUANTITY_UNITS = [
  'pc',
  'bottle',
  'box',
  'tube',
  'pack',
  'roll',
  'plastic',
  'gram',
  'ml',
  'set',
  'pair',
] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number] | string;

export type PurchaseOrderStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'fulfilled';

export interface PurchaseOrderLine {
  id?: string;
  stock_item_id: string;
  item_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  branch_id: number;
  status: PurchaseOrderStatus;
  requested_by: string;
  reviewer_id?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  approved_at?: string | null;
  fulfilled_at?: string | null;
  lines: PurchaseOrderLine[];
  receipt_id?: string | null;
}

export interface BottleLifecycleRecord {
  id: string;
  item_id: string;
  item_name: string;
  barber_id: number;
  barber_name: string;
  issued_at: string;
  issued_customers_count: number;
  returned_at?: string | null;
  returned_customers_count?: number | null;
  net_customers_served?: number | null;
  condition?: 'empty' | 'partially_used' | null;
  remaining_percentage?: number | null;
}

export interface DailyStockReportSummary {
  date: string;
  branch_id: number;
  opening_completed: boolean;
  midday_completed: boolean;
  closing_completed: boolean;
  items: Array<{
    item_id: string;
    name: string;
    unit: string;
    opening_count: number | null;
    midday_count: number | null;
    closing_count: number | null;
    deliveries: number;
    estimated_usage: number;
    variance: number;
  }>;
}

export interface BulkDeleteInventoryRequest {
  itemIds: (string | number)[];
}

export interface BulkDeleteInventoryResponse {
  deletedCount: number;
  itemIds: string[];
}

export type InventoryProductCategory = 'barber_supplies' | 'customer_retail' | 'barber_consumables';
export type InventoryOwnershipType = 'barber_assigned' | 'shared_retail' | 'barber_consumables';
export type InventoryStockStatus =
  | 'Optimal'
  | 'Monitor'
  | 'Low'
  | 'Critical'
  | 'In Stock'
  | 'Low Stock'
  | 'Critically Low'
  | 'Out of Stock';
export type StockCountShift = 'morning' | 'afternoon' | 'evening';
export type StockCountStatus = 'pending' | 'submitted' | 'approved' | 'rejected';
export type InventoryConsumptionSource = 'completed_service' | 'retail_sale' | 'manual' | 'barber_handout';
export type RestockRequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled';

export type InventoryMovementClass = 'fast' | 'slow' | 'insufficient_data';
export type InventoryMovementTrend = 'increasing' | 'decreasing' | 'stable' | 'not_available';

export interface InventoryMovementClassificationRules {
  version: 'v2';
  windowDays: 14;
  minimumHistoryDays: 14;
  fastDailyUnits: 1;
  slowDailyUnits: 1;
}

export interface InventoryProduct {
  id: string;
  name: string;
  category: InventoryProductCategory;
  ownershipType: InventoryOwnershipType;
  unit: string;
  costPrice: number;
  criticalThreshold: number;
  safetyStock: number;
  highVolumeMultiplier: number;
  isActive: boolean;
}

export interface BranchInventoryItem {
  id: string;
  branchId?: number | null;
  productId: string;
  name: string;
  category: 'Barber supplies' | 'Customer retail' | 'Consumables';
  ownership: 'Barber-assigned' | 'Retail Items' | 'Consumables';
  assignedBarber?: string;
  unit: string;
  costPrice: number;
  currentStock: number;
  criticalStock: number;
  safetyStock: number;
  highVolumeMultiplier: number;
  historyDays: number;
  averageDailyConsumption: number;
  weeklyConsumption: number;
  monthlyConsumption: number;
  adjustedWeeklyConsumption: number;
  adjustedMonthlyConsumption: number;
  suggestedReplenishment: number | null;
  suggestedWeeklyReplenishment: number | null;
  suggestedMonthlyReplenishment: number | null;
  expectedStockOutDate: string | null;
  daysOfStockRemaining: number | null;
  daysUntilCritical: number | null;
  thresholdLevel: 0 | 1 | 2 | 3;
  status: InventoryStockStatus;
  stockStatus?: 'Critical' | 'Low' | 'Normal' | 'Overstock';
  forecastAvailable: boolean;
  forecastUnavailableReason?: string;
  expirationDate?: string | null;
}

export type PhysicalStockStatus = 'out_of_stock' | 'critical' | 'low' | 'healthy' | 'overstock';

export interface InventoryDailyConsumptionPoint {
  date: string;
  quantity: number;
}

export interface InventoryDayOfWeekIntensity {
  dayOfWeek: number; // 1 = Mon ... 7 = Sun
  dayName: string; // 'Mon' | 'Tue' ...
  totalUnits: number;
  avgUnits: number;
  relativeIntensity: number; // e.g. 1.25 = 25% higher than daily avg
}

export interface MonthlySeasonalityPoint {
  month: number;
  monthName: string;
  yearMonth?: string;
  consumptionUnits: number;
  seasonalityIndex: number;
  isPeak: boolean;
  isLull: boolean;
  label?: string;
  isBenchmark?: boolean;
}

export interface MonthlySpendTrendPoint {
  yearMonth: string;
  monthName: string;
  consumablesUnits: number;
  retailsUnits: number;
  totalUnits: number;
  restockSpend: number;
}

export interface ProductTierMigrationPoint {
  productId: string;
  name: string;
  currentTier: InventoryMovementClass;
  priorTier: InventoryMovementClass;
  trend: InventoryMovementTrend;
  stockoutBreachMonthsCount: number;
  reliabilityScore: number;
}

export interface InventoryHistoricalAnalytics {
  monthsLogged: number;
  isMaturityReached: boolean;
  maturityProgressPercent: number;
  seasonality: MonthlySeasonalityPoint[];
  spendTrend: MonthlySpendTrendPoint[];
  tierMigrations: ProductTierMigrationPoint[];
  annualTotalConsumption: number;
  annualTotalSpend: number;
}

export interface InventoryForecastItem extends BranchInventoryItem {
  movementClass: InventoryMovementClass;
  movementRatePerDay: number;
  adjustedDailyConsumption: number;
  priorMovementRatePerDay: number | null;
  movementTrend: InventoryMovementTrend;
  movementClassificationReason: string;

  // Operational distinctions (Phase 1)
  projectedStockoutDate: string | null;
  recommendedRestockDate: string | null;
  reorderDeadlineDays: number | null;
  supplierLeadTimeDays: number;
  physicalStockStatus: PhysicalStockStatus;

  // Calibration progress (Phase 2)
  calibrationDaysTracked: number;
  calibrationRequiredDays: number;
  calibrationProgressPercent: number;
  isCalibrating: boolean;

  // Replenishment transparency (Phase 1 & 2)
  suggestedReplenishmentFormula: string;

  // 14-day historical consumption trajectory & day-of-week intensity
  dailyBurnRateHistory: InventoryDailyConsumptionPoint[];
  dayOfWeekIntensity: InventoryDayOfWeekIntensity[];

  // Expected vs Actual (Phase 3)

  // Supplier info
  defaultSupplierId?: string | null;
  defaultSupplierName?: string | null;
}

export interface InventoryForecastResponse {
  items: InventoryForecastItem[];
  summary: {
    totalItems: number;
    fastMoving: number;
    slowMoving: number;
    insufficientData: number;
    urgentRestockCount?: number;
    outOfStockCount?: number;
    criticallyLowCount?: number;
  };
  rules: InventoryMovementClassificationRules;
  historicalAnalytics?: InventoryHistoricalAnalytics;
}

export interface StockCountLine {
  id: string;
  inventoryStockId: string;
  countedQuantity: number;
  notes?: string;
  itemName?: string;
  unit?: string;
  assignedBarber?: string;
  ownership?: InventoryOwnershipType;
  currentQuantity?: number;
}

export interface StockCountAuditEvent {
  action: string;
  resource: string;
  actorId: string;
  branchId: number | null;
  recordedAt: string;
}

export interface StockCountSubmission {
  id: string;
  branchId: number | null;
  submittedBy: string;
  countDate: string;
  shift: StockCountShift;
  status: StockCountStatus;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
  createdAt: string;
  lines: StockCountLine[];
  auditTrail?: StockCountAuditEvent[];
}

export interface InventoryMovement {
  id: string;
  inventoryStockId: string;
  movementType: 'count_correction' | 'consumption' | 'receipt' | 'manual_adjustment' | 'spoilage';
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  costPrice: number;
  financialExposure: number;
  sourceType?: string;
  sourceId?: string;
  reason?: string;
  createdAt: string;
}

export interface InventoryConsumptionRecord {
  id: string;
  inventoryStockId: string;
  quantity: number;
  sourceType: InventoryConsumptionSource;
  sourceId?: string;
  serviceId?: number;
  transactionId?: number;
  consumedAt: string;
  name?: string;
  unit?: string;
}

export type InventoryReportPeriod = 'daily' | 'weekly' | 'custom';

export interface InventoryReportSummary {
  startDate: string;
  endDate: string;
  period: InventoryReportPeriod;
  activeTrackedSkuCount: number;
  atRiskSkuCount: number;
  totalMovementCount: number;
  totalOpeningValue: number;
  totalReceiptsValue: number;
  totalEstimatedConsumptionValue: number;
  totalCountCorrectionsValue: number;
  totalManualAdjustmentsValue: number;
  totalSpoilageQuantity?: number;
  totalSpoilageValue?: number;
  totalClosingValue: number;
}

export interface InventoryReportItem {
  inventoryStockId: string;
  productId: string;
  name: string;
  category: string;
  ownership: string;
  assignedBarber?: string;
  unit: string;
  costPrice: number;
  openingQuantity: number;
  receiptsQuantity: number;
  estimatedConsumptionQuantity: number;
  countCorrectionsQuantity: number;
  manualAdjustmentsQuantity: number;
  spoilageQuantity?: number;
  closingQuantity: number;
  openingValue: number;
  receiptsValue: number;
  estimatedConsumptionValue: number;
  countCorrectionsValue: number;
  manualAdjustmentsValue: number;
  spoilageValue?: number;
  closingValue: number;
  movementCount: number;
  currentStock: number;
  morningStockCount: number | null;
  eveningStockCount: number | null;
  criticalStock: number;
  safetyStock: number;
  highVolumeMultiplier: number;
  stockStatus: string;
  forecastAvailable: boolean;
  forecastUnavailableReason?: string;
  expirationDate?: string | null;
  projectedStockOutDate?: string | null;
  suggestedWeeklyReplenishment?: number | null;
  suggestedMonthlyReplenishment?: number | null;
}

export interface InventoryVarianceItem {
  stockCountId: string;
  countDate: string;
  shift: StockCountShift;
  status: StockCountStatus;
  inventoryStockId: string;
  itemName: string;
  unit: string;
  costPrice: number;
  ownership: string;
  assignedBarber?: string;
  countedQuantity: number;
  currentQuantityBefore: number;
  varianceDelta: number;
  financialExposure: number;
  notes?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

export interface InventoryReportResponse {
  summary: InventoryReportSummary;
  items: InventoryReportItem[];
  variances: InventoryVarianceItem[];
  movements: InventoryMovement[];
}

export type InventoryAlertType = 'critical' | 'low_stock' | 'forecast_stockout';
export type InventoryAlertSeverity = 'critical' | 'warning' | 'info';

export interface InventoryAlert {
  id: string;
  inventoryStockId: string;
  productId: string;
  name: string;
  category: string;
  ownership: string;
  assignedBarber?: string;
  unit: string;
  currentStock: number;
  thresholdValue: number;
  safetyStock: number;
  alertType: InventoryAlertType;
  severity: InventoryAlertSeverity;
  title: string;
  message: string;
  forecastContext?: {
    expectedStockOutDate: string | null;
    suggestedReplenishment: number | null;
    historyDays: number;
  } | null;
  actionableLinks: Array<{
    label: string;
    tab: string;
    action?: string;
  }>;
  createdAt: string;
}

export interface StockReceivingInput {
  requestId: number;
  receivedQuantity?: number;
  unitCost: number;
  supplier?: string;
  notes?: string;
  receivedAt?: string;
}

export interface ReplenishInventoryInput {
  inventoryStockId?: number;
  quantity: number;
  unitCost: number;
  notes?: string;
}

export interface ReplenishInventoryResponse {
  id: string;
  inventoryStockId: number;
  productId: number;
  name: string;
  quantityBefore: number;
  quantityAdded: number;
  quantityAfter: number;
  unit: string;
}

export type ExpiryStatus = 'valid' | 'approaching_expiry' | 'expired';

export interface ExpirableBatchUnit {
  id: string;
  batchId: string;
  unitNumber: number;
  expirationDate: string;
  isDisposed: boolean;
  disposedAt: string | null;
  disposedBy: string | null;
  disposedByName?: string | null;
  status: ExpiryStatus;
  daysUntilExpiry: number;
}

export interface ExpirableStockBatch {
  id: string;
  branchId: number | null;
  inventoryStockId: string;
  inventoryProductId: string;
  itemName: string;
  category: string;
  unit: string;
  costPrice: number;
  purchaseOrderId: string | null;
  poNumber: string | null;
  batchNumber: string;
  receivedDate: string;
  initialQuantity: number;
  currentQuantity: number;
  disposedQuantity: number;
  expirationDate: string;
  manufacturedDate: string | null;
  status: 'active' | 'disposed' | 'consumed';
  expiryStatus: ExpiryStatus;
  daysUntilExpiry: number;
  units: ExpirableBatchUnit[];
}

export interface ExpirableStockSummary {
  totalBatches: number;
  totalTrackedUnits: number;
  approachingExpiryCount: number;
  expiredUnitsCount: number;
  disposedUnitsCount: number;
}

export interface ExpirableStockResponse {
  summary: ExpirableStockSummary;
  batches: ExpirableStockBatch[];
}

export interface DisposeUnitResponse {
  success: boolean;
  message: string;
  unit: ExpirableBatchUnit;
  remainingBatchQuantity: number;
  remainingStockQuantity: number;
}

export type EmergencyCancellationScope = 'barber_unavailability' | 'time_window' | 'shop_closure';

export interface EmergencyCancelRequest {
  branchId: number;
  cancellationType: EmergencyCancellationScope;
  barberId?: number;
  startTime?: string; // HH:mm or ISO string
  endTime?: string;   // HH:mm or ISO string
  reason: string;
}

export interface EmergencyCancelResult {
  cancelledCount: number;
  affectedBookingIds: number[];
  recalculatedSchedules: Array<{
    barberId: number;
    updatedQueueCount: number;
  }>;
}

export interface RebookSlotOption {
  barberId: number;
  barberName: string;
  date: string;
  time: string;
  scheduledStartAt: string;
  arrivalDeadlineAt: string;
}

export interface AffectedBookingNotice {
  queueId: number;
  branchId: number;
  serviceIds?: number[];
  originalBarberId: number | null;
  originalBarberName: string;
  originalDate: string | null;
  originalTime: string | null;
  cancellationType: EmergencyCancellationScope;
  cancellationReason: string;
  cancelledAt: string;
  availableRebookSlots: RebookSlotOption[];
}

export interface CustomerRebookRequest {
  queueId: number;
  selectedSlot: RebookSlotOption;
}

export type GlobalSearchResultType =
  | 'staff'
  | 'inventory'
  | 'service'
  | 'appointment'
  | 'transaction'
  | 'stock_request'
  | 'account'
  | 'feature'
  | 'audit_log'
  | 'tool';

export interface GlobalSearchResult {
  id: string;
  title: string;       // e.g., "Jeremy (Barber)" or "Cotton Balls (Consumable)"
  subtitle?: string;   // e.g., "Staff • Barber" or "Inventory • Barber Supplies"
  type: GlobalSearchResultType;
  targetUrl: string;   // e.g., "/admin/management?tab=staff&search=jeremy"
  metadata?: Record<string, unknown>;
}

export interface GlobalSearchResponse {
  query: string;
  results: GlobalSearchResult[];
  total: number;
}

// ==========================================
// Financial & Sales Reporting Types (Issue #227)
// ==========================================

export interface SalesReportSummary {
  startDate: string;
  endDate: string;
  totalGrossRevenue: number;
  totalTransactionsCount: number;
  averageTicketValue: number;
  cashRevenue: number;
  cashTransactionsCount: number;
  cashPercentage: number;
  digitalRevenue: number;
  digitalTransactionsCount: number;
  digitalPercentage: number;
}

export interface SalesReportDailyPoint {
  date: string;
  formattedDate: string;
  day: string;
  totalRevenue: number;
  cashRevenue: number;
  digitalRevenue: number;
  transactionCount: number;
}

export interface SalesReportTransaction {
  transactionId: number | string;
  date: string;
  formattedDate: string;
  formattedTime: string;
  customerName: string;
  barberName: string;
  serviceName: string;
  paymentMethod: string;
  amount: number;
}

export interface SalesReportResponse {
  summary: SalesReportSummary;
  timeline: SalesReportDailyPoint[];
  transactions: SalesReportTransaction[];
}

export interface BarberCommissionSummary {
  startDate: string;
  endDate: string;
  totalBarbers: number;
  totalServicesCompleted: number;
  totalGrossSales: number;
  totalCommissionPayout: number;
  totalShopNetRevenue: number;
}

export interface BarberCommissionItem {
  barberId: number;
  barberName: string;
  avatarUrl?: string | null;
  role?: string;
  completedServicesCount: number;
  totalGrossSales: number;
  commissionRate: number;
  commissionRateLabel: string;
  isHigherTier: boolean;
  netCommissionPayout: number;
  shopNetRevenue: number;
  averageTicketValue: number;
}

export interface BarberCommissionResponse {
  summary: BarberCommissionSummary;
  barbers: BarberCommissionItem[];
}



// ==========================================
// Inventory Manager operational workflow types (Issue #301)
// ==========================================

export type InventoryManagerPurchaseOrderStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'fulfilled';

export interface InventoryManagerSupplier {
  id: string;
  branchId: number;
  name: string;
  contactPerson?: string | null;
  contactNumber?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  itemsSupplied: number;
  createdAt: string;
}

export interface InventoryManagerPurchaseOrderLine {
  id: string;
  inventoryStockId: string;
  inventoryProductId?: string;
  itemName: string;
  unit: string;
  supplierId?: string | null;
  supplierName?: string | null;
  quantityRequested: number;
  unitCost?: number | null;
  notes?: string | null;
  isDeleted?: boolean;
}

export interface InventoryManagerPurchaseOrder {
  id: string;
  branchId: number;
  poNumber: string;
  status: InventoryManagerPurchaseOrderStatus;
  createdBy: string;
  createdByName?: string | null;
  reviewedBy?: string | null;
  reviewedByName?: string | null;
  reviewNotes?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  fulfilledAt?: string | null;
  receiptId?: string | null;
  receiptImageUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  lines: InventoryManagerPurchaseOrderLine[];
}

export interface InventoryManagerBottleLifecycle {
  id: string;
  branchId: number;
  inventoryStockId: string;
  itemName: string;
  unit: string;
  barberId: number;
  barberName: string;
  issuedAt: string;
  issuedAtCustomerCount: number;
  returnedAt?: string | null;
  returnedAtCustomerCount?: number | null;
  customersServed?: number | null;
  returnCondition?: 'empty' | 'partially_used' | null;
  estimatedRemainingPercent?: number | null;
  consumptionPerCustomer?: number | null;
  status: 'issued' | 'returned';
  notes?: string | null;
  createdAt: string;
}

export interface InventoryManagerDailyStockReportItem {
  inventoryStockId: string;
  itemName: string;
  unit: string;
  currentStock: number;
  openingQuantity: number | null;
  midDayQuantity: number | null;
  closingQuantity: number | null;
  midDayVariance: number | null;
  closingVariance: number | null;
  receiptQuantity: number;
  estimatedConsumption: number;
  netConsumption: number | null;
}

export interface InventoryManagerDailyStockReportShift {
  id?: string;
  shift: StockCountShift | string;
  status: StockCountStatus | 'missing' | string;
  submittedBy?: string | null;
  submittedByRole?: string | null;
  submittedByName?: string | null;
  createdAt?: string | null;
  lines?: Array<Pick<StockCountLine, 'inventoryStockId' | 'itemName' | 'unit' | 'countedQuantity'>>;
}

export interface InventoryManagerDailyStockReport {
  reportDate: string;
  shifts: InventoryManagerDailyStockReportShift[];
  items: InventoryManagerDailyStockReportItem[];
  summary: {
    submittedShiftCount: number;
    missingShiftCount: number;
    fallbackCashierSubmissionCount: number;
    totalNetConsumption: number;
  };
}

export interface InventoryManagerStockReportEmail {
  id: string;
  branchId: number;
  reportDate: string;
  sentBy: string;
  recipientEmail: string;
  ccEmail?: string | null;
  providerMessageId?: string | null;
  status: 'pending' | 'sent' | 'failed';
  errorMessage?: string | null;
  sentAt?: string | null;
  createdAt: string;
}

export { ProfanityFilter, type ProfanityValidationResult } from './profanity-filter';

// ==========================================
// SYSTEM ADMINISTRATION DIAGNOSTICS TYPES
// ==========================================

export type IntegrityCheckStatus = 'PASSED' | 'ISSUES_FOUND' | 'FAILED_TO_CHECK';

export interface IntegrityIssueItem {
  recordRef: string;
  problem: string;
  details?: Record<string, any>;
}

export interface IntegrityCheckResult {
  id: string;
  name: string;
  category: string;
  description: string;
  status: IntegrityCheckStatus;
  checkedCount: number;
  issueCount: number;
  issues: IntegrityIssueItem[];
  errorMessage?: string | null;
}

export interface IntegrityReport {
  timestamp: string;
  totalChecks: number;
  passedChecks: number;
  issuesFoundChecks: number;
  failedChecks: number;
  checks: IntegrityCheckResult[];
}

export interface FeatureAccessEvaluation {
  featureId: string;
  featureName: string;
  category: string;
  description: string;
  globalStatus: FeatureStatus;
  maintenanceMessage?: string | null;
  roleAccess: 'ALLOWED' | 'DENIED';
  isLocked: boolean;
  isUnavailable: boolean;
  unavailableReason?: string;
  effectiveAccess: 'ALLOWED' | 'DENIED';
  reason: string;
}

export interface UserAccessInspection {
  user: {
    userId: string;
    username: string;
    email: string;
    role: string;
    branchId?: number | null;
    isVerified: boolean;
    createdAt: string;
  };
  features: FeatureAccessEvaluation[];
}

export interface DiagnosticsSessionInfo {
  authenticated: boolean;
  currentUserId: string;
  currentRole: string;
  environment: string;
  systemVersion: string;
  totalFeatures: number;
}

// ── Diagnostics Demo & Testing DTOs ──────────────────────────────
export interface DiagnosticCreateReservationDto {
  branchId: number;
  barberId: number;
  serviceIds: number[];
  preferredDate: string;
  preferredTime: string;
  initialStatus?: 'pending' | 'accepted';
  idempotencyKey?: string;
}

export interface DiagnosticReservationResult {
  id: number;
  customerName: string;
  barberName: string;
  serviceTitles: string[];
  preferredDate: string;
  preferredTime: string;
  status: string;
  referenceNumber?: string | null;
}

export interface DiagnosticInsertWalkInsDto {
  branchId: number;
  barberId: number;
  serviceIds: number[];
  quantity: number;
  idempotencyKey?: string;
}

export interface DiagnosticWalkInEntry {
  id: number;
  customerName: string;
  position: number;
  status: string;
}

export interface DiagnosticWalkInsResult {
  count: number;
  barberName: string;
  startPosition: number;
  endPosition: number;
  entries: DiagnosticWalkInEntry[];
}

export interface DiagnosticSkipQueueDto {
  reason?: string;
  reasonCategory?: 'demonstration' | 'not_present' | 'other';
}

export interface DiagnosticCreateReviewDto {
  barberId: number;
  stars: number;
  comment: string;
  showInPublicPortfolio?: boolean;
}

export interface DiagnosticEmailPreviewDto {
  templateType: string;
  variables?: Record<string, any>;
}

export interface DiagnosticEmailPreviewResult {
  subject: string;
  html: string;
}

export interface DiagnosticSendTestEmailDto {
  templateType: string;
  toEmail: string;
  variables?: Record<string, any>;
}

export interface DiagnosticSendTestEmailResult {
  sent: boolean;
  messageId: string | null;
  errorMessage?: string;
}

export interface DiagnosticTestDataCounts {
  reservationsCount: number;
  walkInsCount: number;
  reviewsCount: number;
  total: number;
}

export interface DiagnosticTestDataReviewResponse {
  counts: DiagnosticTestDataCounts;
  reservations: Array<{
    id: number;
    customerName: string;
    barberName: string;
    date: string;
    time: string;
    status: string;
  }>;
  walkIns: Array<{
    id: number;
    customerName: string;
    barberName: string;
    position: number;
    status: string;
  }>;
  reviews: Array<{
    id: number;
    barberName: string;
    stars: number;
    comment: string;
    date: string;
  }>;
}

export interface DiagnosticCleanupDto {
  scope?: 'all' | 'reservations' | 'walk-ins' | 'reviews';
}

export interface DiagnosticCleanupResult {
  success: boolean;
  scope: string;
  reservationsRemoved: number;
  walkInsRemoved: number;
  reviewsRemoved: number;
  totalRemoved: number;
}


/**
 * Transaction History Types & DTOs
 */
export type TransactionChannelType = 'all' | 'walk-in' | 'online' | 'retail' | 'unknown';
export type TransactionStatusType = 'all' | 'completed' | 'refunded' | 'voided' | 'pending';
export type TransactionCategoryType = 'all' | 'haircuts' | 'grooming' | 'retail';

export interface TransactionItemLine {
  id: number | string;
  type: 'service' | 'product';
  name: string;
  category?: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount?: number;
  customSpecification?: string | null;
}

export interface TransactionHistoryCustomer {
  id?: number | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  isGuest: boolean;
}

export interface TransactionHistoryBarber {
  id?: number | null;
  name: string;
  avatarUrl?: string | null;
}

export interface TransactionHistoryCashier {
  id?: string | null;
  name: string;
}

export interface TransactionHistoryItem {
  id: number;
  referenceNumber: string;
  invoiceId: string;
  createdAt: string;
  formattedDate: string;
  formattedTime: string;
  channel: Exclude<TransactionChannelType, 'all'>;
  channelBadge: string;
  status: 'completed' | 'refunded' | 'voided' | 'pending';
  customer: TransactionHistoryCustomer;
  barber: TransactionHistoryBarber | null;
  cashier: TransactionHistoryCashier | null;
  itemsSummary: string;
  itemCount: number;
  lineItems: TransactionItemLine[];
  paymentMethod: string;
  paymentMethodDisplay: string;
  totalAmount: number;
  cashReceivedAmount?: number | null;
  cashChangeAmount?: number | null;
  subtotal: number;
  tax: number;
  tip: number;
  discounts: number;
  paymentReference?: string | null;
  receiptAvailable?: boolean;
  // Audit / Drawer Details:
  queueEntryId?: number | null;
  appointmentCreatedAt?: string | null;
  serviceCompletedAt?: string | null;
  barberCommission?: number;
  shopNetSplit?: number;
}

export interface TransactionHistoryMetrics {
  totalGrossVolume: number;
  transactionCount: number;
  walkInCount: number;
  onlineCount: number;
  retailCount: number;
  averageTicketValue: number;
}

export interface TransactionFilterDTO {
  search?: string;
  channel?: TransactionChannelType;
  startDate?: string;
  endDate?: string;
  paymentMethod?: string;
  barberId?: string; // number string, 'all', or 'unassigned'
  status?: TransactionStatusType;
  category?: TransactionCategoryType;
  minAmount?: number;
  maxAmount?: number;
  page?: number;
  limit?: number;
  cursor?: string;
  sortBy?: string;
  branchId?: number;
}

export interface TransactionHistoryResponse {
  transactions: TransactionHistoryItem[];
  metrics: TransactionHistoryMetrics;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    nextCursor?: string | null;
    paginationMode?: 'offset' | 'cursor';
  };
}

export interface BarberSpecialty {
  serviceId: number;
  title: string;
  category: string;
  price: number;
  durationMinutes?: number;
}

export interface BarberPortfolioItem {
  id: number;
  barberId: number;
  serviceId?: number | null;
  serviceTitle?: string | null;
  imageUrl: string;
  storagePath: string;
  caption?: string;
  createdAt: string;
}

export interface BarberPortfolioFeedback {
  id: string;
  customerName: string;
  rating: number;
  comment?: string;
  date: string;
}

export interface BarberPortfolioData {
  barberId: number;
  name: string;
  bio?: string;
  profilePicture?: string | null;
  status?: string;
  isActive?: boolean;
  rating: number | null;
  totalReviews: number;
  completedServicesCount: number;
  specialties: BarberSpecialty[];
  portfolioItems: BarberPortfolioItem[];
  feedback: BarberPortfolioFeedback[];
}

export interface PublicShopProduct {
  id: number | string;
  name: string;
  imageUrl: string | null;
  retailPrice: number | null;
  category: string;
  tags: string[];
  stockStatus: 'IN STOCK' | 'LOW STOCK' | 'OUT OF STOCK';
  description?: string;
}

// ==========================================
// Appointment Lifecycle & Reliability Types
// ==========================================

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'SCHEDULED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type AppointmentFilterStatus =
  | 'ALL'
  | 'HISTORY'
  | 'PENDING'
  | 'CONFIRMED'
  | 'UPCOMING'
  | 'COMPLETED'
  | 'CANCELLED_NO_SHOW'
  | 'CANCELLED'
  | 'NO_SHOW';

export type ReliabilityRiskLevel = 'normal' | 'moderate' | 'high';

export interface CustomerBookingStats {
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  no_show_bookings: number;
  cancellation_rate: number;
  reliability_score: number;
  risk_level: ReliabilityRiskLevel;
}

export interface CancelAppointmentPayload {
  appointmentId: string;
  status: 'CANCELLED' | 'NO_SHOW';
  cancellation_reason: string;
  other_notes?: string;
}

export interface AppointmentRecord {
  id: string;
  group_booking_id?: string | null;
  customer_id: string | null;
  customer_int_id?: number | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  barber_id: number | null;
  barber_name?: string | null;
  branch_id: number | null;
  branch_name?: string | null;
  service_id: number | null;
  service_title?: string | null;
  service_price?: number | string | null;
  status: AppointmentStatus;
  is_overdue?: boolean;
  scheduled_date: string | null;
  scheduled_time: string | null;
  scheduled_start_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancelled_by_name?: string | null;
  other_notes?: string | null;
  queue_entry_id?: number | null;
  proof_image_url?: string | null;
  reference_number?: string | null;
  ocr_reference_number?: string | null;
  recipient_identifier_detected?: string | null;
  payment_method?: string | null;
  payment_provider?: string | null;
  payment_status?: string | null;
  reservation_fee_paid?: boolean;
  deposit_amount?: number | string | null;
  deposit_status?: string | null;
  booking_channel?: string | null;
  created_at: string;
  updated_at: string;
  reliability?: CustomerBookingStats | null;
}

export interface AppointmentCounts {
  all: number;
  pending?: number;
  history?: number;
  today?: number;
  overdue?: number;
  confirmed?: number;
  upcoming: number;
  completed: number;
  cancelled_no_show: number;
}

export interface AppointmentListResponse {
  appointments: AppointmentRecord[];
  counts: AppointmentCounts;
  pagination: {
    page: number;
    limit: number;
    total: number;
  };
}



export type InventoryThresholdLevel = 0 | 1 | 2 | 3;

export interface BarberPerformanceReviewSummary {
  overall_avg_rating: number;
  total_reviews: number;
  total_completed_services: number;
  top_rated_barber?: {
    barber_id: number;
    barber_name: string;
    avg_rating: number;
    completed_services_count: number;
  } | null;
}

export interface BarberPerformanceMetric {
  barber_id: number;
  barber_name: string;
  profile_picture?: string | null;
  email?: string;
  is_active: boolean;
  completed_services_count: number;
  total_revenue: number;
  avg_rating: number;
  total_reviews: number;
  star5: number;
  star4: number;
  star3: number;
  star2: number;
  star1: number;
}

export interface BarberReviewLogItem {
  id: number;
  barber_id: number;
  barber_name: string;
  customer_name: string;
  stars: number;
  comment?: string | null;
  date: string;
  time: string;
  service_name: string;
  queue_id?: number | null;
}

export interface BarberCompletedServiceLogItem {
  id: number;
  barber_id: number;
  barber_name: string;
  customer_name: string;
  service_name: string;
  price: number;
  status: string;
  date: string;
  time: string;
  stars?: number | null;
  comment?: string | null;
}

export interface BarberPerformanceReviewsResponse {
  summary: BarberPerformanceReviewSummary;
  barbers: BarberPerformanceMetric[];
  reviews: BarberReviewLogItem[];
  completed_services: BarberCompletedServiceLogItem[];
}

export interface MoneyDrawerLogItem {
  id: number;
  transaction_id: string;
  amount: number;
  date: string;
  time: string;
  entry_type: 'manual_adjustment' | 'daily_injection' | 'daily_reset';
  notes?: string | null;
  created_at: string;
}

export interface MoneyDrawerStatusResponse {
  branch_id: number;
  configured_amount: number;
  effective_date: string;
  is_modified_today: boolean;
  can_modify_today: boolean;
  last_modified_at?: string | null;
  fallback_amount: number;
  schedule_status: {
    is_active: boolean;
    active_float: number;
    current_time_manila: string;
    next_scheduled_event: string;
    next_scheduled_time: string;
  };
  history: MoneyDrawerLogItem[];
}

export interface AdjustMoneyDrawerRequest {
  branch_id?: number;
  amount: number;
  date: string;
  notes?: string;
}
