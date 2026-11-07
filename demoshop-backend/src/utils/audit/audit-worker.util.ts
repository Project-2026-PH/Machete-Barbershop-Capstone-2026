import { Request } from 'express';

const AUDIT_DETAIL_KEYS = new Set([
  'action', 'autoLogin', 'barber_id', 'branch_id', 'cancel_type', 'clientId',
  'attempt_id', 'count', 'event', 'position', 'queue_id', 'reason_code',
  'retryAfter', 'review_mode', 'role', 'service_id', 'status',
  'adjustment_source', 'additional_line_count', 'initial_quantity', 'inventory_stock_id', 'line_count', 'movement_count', 'movement_type', 'previous_status', 'quantity_after',
  'quantity_before', 'quantity_delta', 'restock_request_id', 'shift', 'stock_count_id',
  'category', 'reason', 'item_name', 'unit', 'expiration_date', 'expirationDate',
  'updated_user_id', 'suspended_user_id', 'restored_user_id', 'reset_user_id', 'deleted_user_id', 'created_user_id',
  'target_user_id', 'target_email', 'target_role', 'target_username', 'target_name', 'old_role', 'new_role', 'changed_by', 'passwordChanged',
  'barber_name', 'target_barber_id', 'new_status', 'old_status', 'override', 'admin_notes', 'admin_name', 'adminName',
  'customer_id', 'customer_name', 'customerName', 'customer_email', 'user_email',
  'appointment_id', 'appointmentId', 'cancellation_reason', 'cancel_reason', 'other_notes', 'scheduled_date', 'scheduled_time',
  'shift_date', 'request_id', 'request_type', 'target_barber_name', 'target_date',
  'actor_role', 'actor_name', 'critical_threshold', 'safety_stock', 'high_volume_multiplier',
  'target_status', 'is_active',
  'featureId', 'feature_id', 'featureName', 'previousStatus', 'attemptedStatus', 'currentStatus',
  'targetRole', 'previousAccess', 'newAccess', 'result', 'error', 'affectedRoles',
  'actorUserId', 'queueEntryId', 'barberId', 'beforeServiceIds', 'afterServiceIds',
  'beforeDurationMinutes', 'afterDurationMinutes', 'previewFingerprint', 'confirmed',
  'projectedCompletionAt', 'affectedReservations',
  'changes', 'updates', 'target_id', 'name',
  'module', 'section', 'subsection', 'target',
  'paymentMethod', 'payment_method', 'methodId', 'method_id', 'methodName', 'method_name',
  'previous', 'new', 'field', 'branchId',
  'shopName', 'shop_name', 'contactEmail', 'contact_email', 'physicalAddress', 'physical_address',
  'day', 'daysUpdated', 'totalImages', 'totalFaqs',
  'document', 'documents', 'documentKey', 'documentTitle', 'title',
  'previousUpdatedAt', 'newUpdatedAt', 'termsUpdated', 'privacyUpdated',
  'headline', 'description', 'accountNumber', 'merchantName',
  'can_access_inventory', 'workspace', 'inventoryAccess',
  'service_name', 'serviceName', 'service_ids', 'price',
  'supplier_id', 'supplier_name', 'supplierName', 'default_supplier_id',
  'transaction_id', 'transactionId', 'order_id', 'orderId', 'cashier_id', 'total_amount', 'amount', 'item_count', 'product_ids',
  'payment_attempt_id', 'queue_entry_id',
  'bypassReceiptOcr', 'bypassTimeRestrictions', 'visibility', 'image_url',
]);
const MAX_AUDIT_DETAIL_LENGTH = 160;

const SENSITIVE_KEY_REGEX = /^(password|new_?password|old_?password|confirm_?password|password_?hash|token|access_?token|refresh_?token|reset_?token|secret|authorization|cookie|card_?number|otp|cvv|pin|api_?key)$/i;

const sanitizeAuditScalar = (value: unknown): string | number | boolean | null => {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (/^bearer\s+[a-z0-9_\-\.]+/i.test(cleaned) || /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/.test(cleaned)) {
    return '[REDACTED_TOKEN]';
  }
  return cleaned.slice(0, MAX_AUDIT_DETAIL_LENGTH);
};

/**
 * Persist only an allowlisted event summary. Authentication inputs, customer
 * records, payment credentials, and arbitrary request bodies never enter audit JSON.
 * Sensitive fields (passwords, tokens, credentials) are strictly rejected/redacted.
 */
export const sanitizeAuditDetails = (details: unknown): Record<string, any> => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (!AUDIT_DETAIL_KEYS.has(key)) continue;
    if (SENSITIVE_KEY_REGEX.test(key)) continue;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (key === 'changes') {
        const sanitizedChanges: Record<string, any> = {};
        for (const [fieldKey, fieldDiff] of Object.entries(value as Record<string, any>)) {
          if (SENSITIVE_KEY_REGEX.test(fieldKey)) {
            sanitizedChanges[fieldKey] = { changed: true };
            continue;
          }
          if (fieldDiff && typeof fieldDiff === 'object' && ('from' in fieldDiff || 'to' in fieldDiff)) {
            sanitizedChanges[fieldKey] = {
              from: sanitizeAuditScalar(fieldDiff.from),
              to: sanitizeAuditScalar(fieldDiff.to),
            };
          } else {
            const scalar = sanitizeAuditScalar(fieldDiff);
            if (scalar !== null) {
              sanitizedChanges[fieldKey] = scalar;
            }
          }
        }
        if (Object.keys(sanitizedChanges).length > 0) {
          sanitized.changes = sanitizedChanges;
        }
      } else {
        // Generic nested dictionary (e.g. updates, visibility, metadata)
        const sanitizedObj: Record<string, any> = {};
        for (const [subKey, subVal] of Object.entries(value as Record<string, any>)) {
          if (SENSITIVE_KEY_REGEX.test(subKey)) {
            sanitizedObj[subKey] = '[REDACTED]';
            continue;
          }
          const scalar = sanitizeAuditScalar(subVal);
          if (scalar !== null) {
            sanitizedObj[subKey] = scalar;
          }
        }
        if (Object.keys(sanitizedObj).length > 0) {
          sanitized[key] = sanitizedObj;
        }
      }
    } else if (Array.isArray(value)) {
      const sanitizedArray = value
        .map((item) => {
          if (item && typeof item === 'object' && !Array.isArray(item)) {
            const sanitizedItem: Record<string, any> = {};
            for (const [subKey, subVal] of Object.entries(item)) {
              if (SENSITIVE_KEY_REGEX.test(subKey)) continue;
              const scalar = sanitizeAuditScalar(subVal);
              if (scalar !== null) {
                sanitizedItem[subKey] = scalar;
              }
            }
            return Object.keys(sanitizedItem).length > 0 ? sanitizedItem : null;
          }
          return sanitizeAuditScalar(item);
        })
        .filter((item) => item !== null);
      if (sanitizedArray.length > 0) {
        sanitized[key] = sanitizedArray;
      }
    } else {
      const scalar = sanitizeAuditScalar(value);
      if (scalar !== null) {
        sanitized[key] = scalar;
      }
    }
  }

  return sanitized;
};

const anonymizeIpAddress = (value: string | null): string | null => {
  if (!value) return null;
  if (value.includes(':')) return `${value.split(':').slice(0, 4).join(':')}:0:0:0:0`;
  const octets = value.split('.');
  return octets.length === 4 ? `${octets[0]}.${octets[1]}.${octets[2]}.0` : null;
};

/**
 * Extract only minimally identifying request metadata for security audits.
 * User-Agent is intentionally discarded to prevent browser/device tracking.
 */
export const extractRequestMetadata = (req?: Request) => {
  if (!req) return { ipAddress: null, userAgent: null };

  return {
    ipAddress: anonymizeIpAddress(req.ip || req.socket.remoteAddress || null),
    userAgent: null,
  };
};
