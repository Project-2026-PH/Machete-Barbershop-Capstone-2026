import { GlobalSearchResult, GlobalSearchResponse } from '@demoshop/shared-types';
import {
  searchRepository,
  SearchRepository,
} from '../repositories/search.repository';
import { appointmentRepository } from '../repositories/appointment.repository';

/** Builds an admin deep link, skipping empty params so stale filters are never carried over. */
const buildAdminUrl = (params: Record<string, string | null | undefined>): string => {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') qs.set(key, value);
  });
  return `/admin?${qs.toString()}`;
};

const SYSTEM_ADMIN_TOOLS = [
  {
    id: 'tool-accounts',
    title: 'Account Management',
    subtitle: 'System Tool • Manage users, roles & permissions',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=accounts',
    keywords: ['accounts', 'users', 'roles', 'staff', 'customers', 'admins', 'superadmin'],
  },
  {
    id: 'tool-features',
    title: 'System Controls & Feature Gates',
    subtitle: 'System Tool • Toggle features & maintenance modes',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=features',
    keywords: ['features', 'system controls', 'gates', 'flags', 'maintenance'],
  },
  {
    id: 'tool-access',
    title: 'Role Access & Governance',
    subtitle: 'System Tool • Configure permissions and role matrix',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=features&subtab=access',
    keywords: ['role access', 'governance', 'permissions', 'matrix', 'access'],
  },
  {
    id: 'tool-audit',
    title: 'Security & Audit Logs',
    subtitle: 'System Tool • Global immutable audit trail',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=audit',
    keywords: ['audit', 'logs', 'security', 'trail', 'compliance'],
  },
  {
    id: 'tool-health',
    title: 'System Health & Telemetry',
    subtitle: 'System Tool • Database, Redis & API vitals',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=health',
    keywords: ['health', 'telemetry', 'status', 'redis', 'database', 'vitals'],
  },
  {
    id: 'tool-diagnostics',
    title: 'Diagnostics & Self-Tests',
    subtitle: 'System Tool • Run platform diagnostic checks',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=diagnostics',
    keywords: ['diagnostics', 'tests', 'integrity', 'check', 'debug'],
  },
  {
    id: 'tool-pos',
    title: 'Point of Sale (POS)',
    subtitle: 'Operations • Counter Register & Walk-in Checkout',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=operations-pos',
    keywords: ['pos', 'point of sale', 'register', 'cashier', 'checkout', 'payment'],
  },
  {
    id: 'tool-queue',
    title: 'Queue & Reservations Dispatcher',
    subtitle: 'Operations • Live Queue & Bookings Management',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=operations-queue',
    keywords: ['queue', 'reservations', 'bookings', 'walk-ins', 'appointments', 'dispatcher'],
  },
  {
    id: 'tool-inventory',
    title: 'Inventory & Stock Control',
    subtitle: 'Operations • Stock Levels & Physical Counts',
    type: 'tool' as const,
    targetUrl: '/system-admin/dashboard?tab=operations-inventory',
    keywords: ['inventory', 'stock', 'warehouse', 'supplies', 'products', 'counts'],
  },
];

export class SearchService {
  constructor(private repo: SearchRepository = searchRepository) {}

  async globalSearch(
    rawQuery: string,
    limitPerCategory: number = 6,
    scope: 'shop' | 'system' | 'all' = 'shop',
  ): Promise<GlobalSearchResponse> {
    const query = (rawQuery || '').trim();
    if (!query || query.length < 2) {
      return {
        query,
        results: [],
        total: 0,
      };
    }

    if (scope === 'system') {
      return this.searchSystemScope(query, limitPerCategory);
    }

    if (scope === 'all') {
      const [shopResults, systemResults] = await Promise.all([
        this.searchShopScope(query, limitPerCategory),
        this.searchSystemScope(query, limitPerCategory),
      ]);
      const merged = [...systemResults.results, ...shopResults.results];
      return {
        query,
        results: merged.slice(0, limitPerCategory * 4),
        total: merged.length,
      };
    }

    return this.searchShopScope(query, limitPerCategory);
  }

  private async searchSystemScope(query: string, limit: number): Promise<GlobalSearchResponse> {
    const lowerQuery = query.toLowerCase();

    // 1. Tool matches
    const toolResults: GlobalSearchResult[] = SYSTEM_ADMIN_TOOLS.filter((t) =>
      t.title.toLowerCase().includes(lowerQuery) ||
      t.subtitle.toLowerCase().includes(lowerQuery) ||
      t.keywords.some((k) => k.includes(lowerQuery))
    ).map((t) => ({
      id: t.id,
      title: t.title,
      subtitle: t.subtitle,
      type: t.type,
      targetUrl: t.targetUrl,
    }));

    // 2. Query repository in parallel
    const [accounts, features, auditLogs] = await Promise.all([
      this.repo.searchAccounts(query, limit),
      this.repo.searchFeatures(query, limit),
      this.repo.searchAuditLogs(query, limit),
    ]);

    const accountResults: GlobalSearchResult[] = accounts.map((u) => {
      const displayName = u.username || u.email;
      return {
        id: `account-${u.user_id}`,
        title: `${displayName} (${u.role})`,
        subtitle: `Account • ${u.role} • ${u.email}`,
        type: 'account',
        targetUrl: `/system-admin/dashboard?tab=accounts&search=${encodeURIComponent(displayName)}`,
        metadata: {
          userId: u.user_id,
          username: u.username,
          email: u.email,
          role: u.role,
        },
      };
    });

    const featureResults: GlobalSearchResult[] = features.map((f) => ({
      id: `feature-${f.id}`,
      title: `${f.name} (${f.status})`,
      subtitle: `Feature Gate • ${f.category} • ${f.id}`,
      type: 'feature',
      targetUrl: `/system-admin/dashboard?tab=features&search=${encodeURIComponent(f.name)}`,
      metadata: {
        featureId: f.id,
        category: f.category,
        status: f.status,
      },
    }));

    const auditResults: GlobalSearchResult[] = auditLogs.map((a) => ({
      id: `audit-${a.id}`,
      title: `${a.action} (${a.resource})`,
      subtitle: `Audit Log • By ${a.username || a.email || 'System'}`,
      type: 'audit_log',
      targetUrl: `/system-admin/dashboard?tab=audit&filter=${encodeURIComponent(a.action)}`,
      metadata: {
        auditId: a.id,
        action: a.action,
        resource: a.resource,
      },
    }));

    const results = [...toolResults, ...accountResults, ...featureResults, ...auditResults];
    return {
      query,
      results,
      total: results.length,
    };
  }

  private async searchShopScope(query: string, limit: number): Promise<GlobalSearchResponse> {
    const [staffRows, inventoryRows, serviceRows, appointmentRows, transactionRows, stockRequestRows] =
      await Promise.all([
        this.repo.searchStaff(query, limit),
        this.repo.searchInventory(query, limit),
        this.repo.searchServices(query, limit),
        this.repo.searchAppointments(query, limit),
        this.repo.searchTransactions(query, limit),
        this.repo.searchStockRequests(query, limit),
      ]);

    const staffResults: GlobalSearchResult[] = staffRows.map((staff) => {
      const roleLabel = staff.role || 'Staff';
      const displayName = staff.name || staff.username || staff.email || 'Staff member';
      return {
        id: `staff-${staff.user_id || staff.barber_id || displayName}`,
        title: `${displayName} (${roleLabel})`,
        subtitle: `Staff • ${roleLabel}`,
        type: 'staff',
        targetUrl: buildAdminUrl({
          tab: 'management',
          subtab: 'staff',
          search: displayName,
          highlightId: `staff-${staff.user_id}`,
        }),
        metadata: {
          userId: staff.user_id,
          barberId: staff.barber_id,
          email: staff.email,
          role: staff.role,
        },
      };
    });

    const inventoryResults: GlobalSearchResult[] = inventoryRows.map((item) => {
      const categoryLabel = item.category === 'barber_supplies' ? 'Barber supplies' : 'Customer retail';
      const ownershipLabel = item.ownership_type === 'barber_assigned' ? 'Barber-assigned' : 'Retail Items';
      return {
        id: `inventory-${item.inventory_product_id}`,
        title: `${item.name} (${item.unit || 'unit'})`,
        subtitle: `Inventory • ${ownershipLabel}`,
        type: 'inventory',
        targetUrl: buildAdminUrl({
          tab: 'inventory',
          subtab: item.category === 'barber_supplies' ? 'consumables' : 'retails',
          search: item.name,
          itemId: String(item.inventory_product_id),
          highlightId: `inventory-${item.inventory_product_id}`,
        }),
        metadata: {
          productId: item.inventory_product_id,
          unit: item.unit,
          category: item.category,
          categoryLabel,
          ownershipType: item.ownership_type,
        },
      };
    });

    const serviceResults: GlobalSearchResult[] = serviceRows.map((service) => {
      const formattedPrice = !isNaN(Number(service.price)) ? `₱${Number(service.price).toFixed(2)}` : '';
      const categoryLabel = service.category || 'Service';
      return {
        id: `service-${service.service_id}`,
        title: `${service.title}${formattedPrice ? ` (${formattedPrice})` : ''}`,
        subtitle: `Service • ${categoryLabel}`,
        type: 'service',
        targetUrl: buildAdminUrl({
          tab: 'management',
          subtab: 'services',
          search: service.title,
          highlightId: `service-${service.service_id}`,
        }),
        metadata: {
          serviceId: service.service_id,
          price: service.price,
          category: service.category,
          durationMinutes: service.duration_minutes,
        },
      };
    });

    const customerIds = Array.from(
      new Set(
        appointmentRows
          .map((a) => a.customer_user_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    const reliabilityMap = new Map<string, any>();
    if (customerIds.length > 0) {
      await Promise.all(
        customerIds.map(async (cid) => {
          try {
            const stats = await appointmentRepository.getCustomerBookingStats(cid);
            if (stats) reliabilityMap.set(cid, stats);
          } catch {
            // graceful fallback
          }
        })
      );
    }

    const appointmentResults: GlobalSearchResult[] = appointmentRows.map((appt) => {
      const barberText = appt.barber_name ? ` with ${appt.barber_name}` : '';
      const dateText = appt.preferred_date ? ` • ${appt.preferred_date}` : '';
      const rel = appt.customer_user_id ? reliabilityMap.get(appt.customer_user_id) : null;
      return {
        id: `appointment-${appt.id}`,
        title: `${appt.customer_name} (${appt.service_title || 'Appointment'}${barberText})`,
        subtitle: `Appointment • ${appt.status.toUpperCase()}${dateText}`,
        type: 'appointment',
        targetUrl: buildAdminUrl({
          tab: 'reports',
          subtab: 'appointments',
          search: appt.customer_name,
          highlightId: `appointment-${appt.id}`,
        }),
        metadata: {
          appointmentId: appt.id,
          customerName: appt.customer_name,
          barberName: appt.barber_name,
          serviceTitle: appt.service_title,
          status: appt.status,
          date: appt.preferred_date || appt.local_date,
          time: appt.preferred_time,
          reliability: rel || null,
        },
      };
    });

    const transactionResults: GlobalSearchResult[] = transactionRows.map((tx) => {
      const receiptLabel = tx.receipt_number ? `#${tx.receipt_number}` : `#${tx.transaction_id}`;
      const amountStr = !isNaN(Number(tx.total_amount)) ? `₱${Number(tx.total_amount).toFixed(2)}` : '';
      return {
        id: `transaction-${tx.transaction_id}`,
        title: `Receipt ${receiptLabel}${amountStr ? ` (${amountStr})` : ''}`,
        subtitle: `Transaction • ${tx.payment_method} • ${tx.customer_name || 'Customer'}`,
        type: 'transaction',
        targetUrl: buildAdminUrl({
          tab: 'reports',
          subtab: 'transactions',
          search: tx.receipt_number || String(tx.transaction_id),
          startDate: tx.local_date,
          endDate: tx.local_date,
          transactionId: String(tx.transaction_id),
          highlightId: `transaction-${tx.transaction_id}`,
        }),
        metadata: {
          transactionId: tx.transaction_id,
          receiptNumber: tx.receipt_number,
          totalAmount: tx.total_amount,
          paymentMethod: tx.payment_method,
          date: tx.local_date,
        },
      };
    });

    const stockRequestResults: GlobalSearchResult[] = stockRequestRows.map((po) => {
      const creatorText = po.created_by_name ? ` • By ${po.created_by_name}` : '';
      return {
        id: `stock-request-${po.id}`,
        title: `PO #${po.po_number} (${po.status.toUpperCase()})`,
        subtitle: `Stock Request${creatorText}${po.notes ? ` • ${po.notes}` : ''}`,
        type: 'stock_request',
        targetUrl: buildAdminUrl({
          tab: 'purchase-orders',
          // Only pending requests live in the approval queue; everything else is in Receiving/history.
          subtab: po.status === 'pending' ? 'purchase-order-approval' : 'history',
          search: po.po_number,
          highlightId: `po-${po.id}`,
        }),
        metadata: {
          poId: po.id,
          poNumber: po.po_number,
          status: po.status,
          notes: po.notes,
        },
      };
    });

    const results = [
      ...staffResults,
      ...appointmentResults,
      ...transactionResults,
      ...stockRequestResults,
      ...inventoryResults,
      ...serviceResults,
    ];

    return {
      query,
      results,
      total: results.length,
    };
  }
}

export const searchService = new SearchService();
