import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    Search,
    Clock,
    AlertTriangle,
    Shield,
    Filter,
    ArrowUpDown,
    FileText,
    AlertCircle,
    Package,
    Users,
    CreditCard,
    Lock,
    X,
    ChevronDown,
    LucideIcon,
    Settings,
    Calendar,
    Eye,
    KeyRound,
    UserCheck,
    UserX,
    Scissors,
    CheckCircle2,
    XCircle,
    Globe,
    Layers,
    Copy,
    Check,
} from 'lucide-react';
import { SteppingPagination } from '@/components/ui/SteppingPagination';
import { Skeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/feedback/Modal';
import { api } from '@/config/api';
import { supabase } from '@/config/supabaseClient';

export type AuditModuleCategory = 'all' | 'auth' | 'management' | 'booking' | 'inventory' | 'pos' | 'settings';

export interface AuditModuleOption {
    id: AuditModuleCategory;
    label: string;
    icon: LucideIcon;
    description: string;
    resources: string[];
    actionKeywords: string[];
}

export const AUDIT_MODULES: AuditModuleOption[] = [
    {
        id: 'all',
        label: 'All Activity',
        icon: Shield,
        description: 'Complete system audit ledger',
        resources: [],
        actionKeywords: [],
    },
    {
        id: 'auth',
        label: 'Account & Security',
        icon: Lock,
        description: 'Logins, passwords, sessions & access changes',
        resources: ['auth', 'users', 'security_override', 'user', 'session', 'role'],
        actionKeywords: ['AUTH', 'LOGIN', 'LOGOUT', 'USER', 'PASSWORD', 'SECURITY', 'PERMISSION', 'OVERRIDE'],
    },
    {
        id: 'management',
        label: 'Staff & Access',
        icon: Users,
        description: 'Staff directory, shifts, roles & services',
        resources: ['staff', 'shifts', 'services', 'branch', 'service', 'shift', 'barber'],
        actionKeywords: ['STAFF', 'SHIFT', 'SERVICE', 'BRANCH', 'BARBER', 'ROSTER', 'ROLE', 'INVENTORY_ACCESS'],
    },
    {
        id: 'booking',
        label: 'Reservations',
        icon: Calendar,
        description: 'Appointments, reservations & customer queue',
        resources: ['booking', 'queue', 'appointments', 'customers', 'appointment', 'customer'],
        actionKeywords: ['BOOKING', 'QUEUE', 'APPOINTMENT', 'CUSTOMER', 'WALKIN', 'RESERVATION'],
    },
    {
        id: 'inventory',
        label: 'Inventory',
        icon: Package,
        description: 'Stock valuation, consumption & purchase orders',
        resources: ['inventory', 'inventory_consumption', 'restock_requests', 'purchase_orders', 'purchase_order', 'consumables', 'suppliers'],
        actionKeywords: ['INVENTORY', 'RESTOCK', 'PURCHASE_ORDER', 'STOCK', 'CONSUMPTION', 'PO_'],
    },
    {
        id: 'pos',
        label: 'POS & Billing',
        icon: CreditCard,
        description: 'Tenders, transactions, orders & checkout',
        resources: ['payment_attempt', 'transaction', 'orders', 'invoices', 'payment', 'order', 'pos', 'billing', 'cashier'],
        actionKeywords: ['PAYMENT', 'TRANSACTION', 'ORDER', 'INVOICE', 'CHECKOUT', 'BILLING'],
    },
    {
        id: 'settings',
        label: 'Shop Settings',
        icon: Settings,
        description: 'Storefront settings, business hours & payment methods',
        resources: ['shop_settings', 'payment_methods', 'website_content', 'gallery', 'faq', 'legal_docs', 'settings'],
        actionKeywords: ['SETTINGS', 'PAYMENT_METHOD', 'BUSINESS_HOURS', 'GALLERY', 'LEGAL', 'FAQ'],
    },
];

export interface AuditLogEntry {
    audit_id?: string;
    id?: string;
    created_at: string;
    actor_name?: string;
    actor_email?: string;
    actor_role?: string;
    action: string;
    resource?: string;
    details?: any;
    status?: string;
    ip_address?: string;
    user_agent?: string;
}

interface AuditStatsData {
    total_24h: number;
    failed_24h: number;
    auth_24h: number;
}

interface AuditLogsTableProps {
    initialModule?: AuditModuleCategory;
    startDate?: string;
    endDate?: string;
    dateFilterLabel?: string;
}

export const AuditLogsTable: React.FC<AuditLogsTableProps> = ({
    initialModule = 'all',
    startDate,
    endDate,
    dateFilterLabel = 'the selected date range',
}) => {
    const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
    const [auditStats, setAuditStats] = useState<AuditStatsData>({ total_24h: 0, failed_24h: 0, auth_24h: 0 });
    const [auditPage, setAuditPage] = useState(1);
    const [auditTotal, setAuditTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter states
    const [selectedModule, setSelectedModule] = useState<AuditModuleCategory>(initialModule);
    const [auditFilter, setAuditFilter] = useState('');
    const [debouncedAuditFilter, setDebouncedAuditFilter] = useState('');
    const latestAuditRequest = useRef(0);
    const [selectedRole, setSelectedRole] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [sortBy, setSortBy] = useState('timestamp_desc');
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedAuditFilter(auditFilter), 300);
        return () => clearTimeout(timer);
    }, [auditFilter]);

    // Event details modal state
    const [selectedLogForModal, setSelectedLogForModal] = useState<AuditLogEntry | null>(null);
    const [copiedPayload, setCopiedPayload] = useState(false);

    // Synchronize initialModule if prop changes
    useEffect(() => {
        if (initialModule && initialModule !== selectedModule) {
            setSelectedModule(initialModule);
            setAuditPage(1);
        }
    }, [initialModule]);

    const fetchAuditData = useCallback(async (silent = false) => {
        const requestId = ++latestAuditRequest.current;
        if (!silent) setLoading(true);
        setError(null);
        try {
            const queryParams = new URLSearchParams({
                page: String(auditPage),
                limit: '15',
                filter: debouncedAuditFilter.trim(),
                roleFilter: selectedRole,
                statusFilter: selectedStatus,
                sortBy: sortBy,
                module: selectedModule,
            });
            if (startDate) queryParams.set('startDate', startDate);
            if (endDate) queryParams.set('endDate', endDate);

            const [logsRes, statsRes] = await Promise.all([
                api.get(`/api/admin/audit-logs?${queryParams.toString()}`).catch(() =>
                    api.get(`/api/system-admin/audit-logs?${queryParams.toString()}`)
                ),
                api.get('/api/admin/audit-logs/stats').catch(() =>
                    api.get('/api/system-admin/audit-logs/stats')
                ),
            ]);

            if (requestId !== latestAuditRequest.current) return;

            const logsData = logsRes.data;
            const rawLogs: AuditLogEntry[] = logsData.logs || [];

            // Client-side fallback filter
            const matchedLogs = selectedModule === 'all'
                ? rawLogs
                : rawLogs.filter((log) => {
                    const mod = AUDIT_MODULES.find((m) => m.id === selectedModule);
                    if (!mod || mod.resources.length === 0) return true;
                    const res = (log.resource || '').toLowerCase();
                    const act = (log.action || '').toUpperCase();
                    return (
                        mod.resources.some((r) => res.includes(r.toLowerCase())) ||
                        mod.actionKeywords.some((kw) => act.includes(kw))
                    );
                });

            const totalRecords = logsData.pagination?.total ?? logsData.total ?? matchedLogs.length;
            const computedPages = logsData.pagination?.pages ?? Math.max(1, Math.ceil(totalRecords / 15));

            setAuditLogs(matchedLogs);
            setAuditTotal(totalRecords);
            setTotalPages(computedPages);
            setAuditStats(statsRes.data || { total_24h: 0, failed_24h: 0, auth_24h: 0 });
        } catch (err: any) {
            if (requestId === latestAuditRequest.current) {
                console.error('[AuditLogsTable] Failed to fetch audit data:', err);
                setError(err?.response?.data?.message || err?.message || 'Failed to fetch audit logs.');
            }
        } finally {
            if (requestId === latestAuditRequest.current) setLoading(false);
        }
    }, [auditPage, debouncedAuditFilter, selectedRole, selectedStatus, sortBy, selectedModule, startDate, endDate]);

    const fetchAuditDataRef = useRef(fetchAuditData);
    fetchAuditDataRef.current = fetchAuditData;

    useEffect(() => {
        void fetchAuditData();
    }, [fetchAuditData]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const debouncedRefresh = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                void fetchAuditDataRef.current(true);
            }, 300);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        };
        const handleWindowFocus = () => debouncedRefresh();

        const localEvents = [
            'demoshop:inventory-changed',
            'demoshop:stock-count-changed',
            'demoshop:purchase-orders-changed',
            'demoshop:queue-updated',
            'demoshop:staff-changed',
            'storage',
        ];
        localEvents.forEach((evt) => window.addEventListener(evt, debouncedRefresh));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        const channel = supabase
            .channel('audit-logs-realtime-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_consumption' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock_movements' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_restock_requests' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_stock_count_submissions' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedRefresh)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    debouncedRefresh();
                }
            });

        pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        }, 10_000);

        return () => {
            localEvents.forEach((evt) => window.removeEventListener(evt, debouncedRefresh));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
            if (timer) clearTimeout(timer);
            if (pollInterval) clearInterval(pollInterval);
            void supabase.removeChannel(channel).catch(() => {});
        };
    }, []);

    const handleModuleSelect = (modId: AuditModuleCategory) => {
        setSelectedModule(modId);
        setAuditPage(1);
    };

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (selectedModule !== 'all') count++;
        if (selectedRole !== 'all') count++;
        if (selectedStatus !== 'all') count++;
        if (auditFilter.trim()) count++;
        return count;
    }, [selectedModule, selectedRole, selectedStatus, auditFilter]);

    const resetAllFilters = () => {
        setSelectedModule('all');
        setSelectedRole('all');
        setSelectedStatus('all');
        setAuditFilter('');
        setAuditPage(1);
    };

    const formatManilaDate = useCallback((dateStr?: string) => {
        if (!dateStr) return '—';
        try {
            const d = new Date(dateStr);
            return new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
            }).format(d);
        } catch {
            return dateStr;
        }
    }, []);

    const parseDetails = (details: any): Record<string, any> => {
        if (!details) return {};
        if (typeof details === 'object' && !Array.isArray(details)) return details;
        try {
            return JSON.parse(details);
        } catch {
            return {};
        }
    };

        /**
     * Map raw action codes to natural business descriptions & icons
     */
    const formatActivityInfo = (action: string, details?: any) => {
        const act = (action || '').toUpperCase();

        // Auth & Security
        if (act === 'LOGIN_SUCCESS' || act === 'LOGIN') {
            return { label: 'Signed In', icon: UserCheck };
        }
        if (act === 'LOGIN_FAILED') {
            return { label: 'Failed Sign-in', icon: AlertTriangle };
        }
        if (act === 'LOGIN_LOCKED') {
            return { label: 'Sign-in Locked (Too Many Attempts)', icon: Lock };
        }
        if (act === 'LOGOUT') {
            return { label: 'Signed Out', icon: UserX };
        }
        if (act === 'REGISTER_SUCCESS') {
            return { label: 'Account Registered', icon: UserCheck };
        }
        if (act === 'REGISTER_PENDING') {
            return { label: 'Registration Pending Verification', icon: Clock };
        }
        if (act === 'VERIFY_EMAIL_SUCCESS') {
            return { label: 'Email Verified', icon: UserCheck };
        }
        if (act === 'PASSWORD_RESET_SUCCESS') {
            return { label: 'Password Reset Completed', icon: KeyRound };
        }
        if (act === 'PASSWORD_CHANGE_SUCCESS') {
            return { label: 'Password Changed', icon: KeyRound };
        }
        if (act === 'PASSWORD_CHANGE_CODE_REQUESTED') {
            return { label: 'Password Reset Requested', icon: KeyRound };
        }
        if (act === 'PASSWORD_RESET_LOCKED') {
            return { label: 'Password Reset Locked', icon: Lock };
        }
        if (act === 'ADMIN_PASSWORD_RESET') {
            return { label: 'Admin Password Reset', icon: KeyRound };
        }

        // Roles & Staff Management
        if (act === 'CASHIER_INVENTORY_ACCESS_GRANTED') {
            return { label: 'Inventory Access Allowed', icon: Package };
        }
        if (act === 'CASHIER_INVENTORY_ACCESS_REVOKED') {
            return { label: 'Inventory Access Removed', icon: Lock };
        }
        if (act === 'STAFF_CREATE') {
            return { label: 'Staff Member Added', icon: Users };
        }
        if (act === 'STAFF_UPDATE') {
            return { label: 'Staff Account Updated', icon: Users };
        }
        if (act === 'STAFF_SUSPEND' || act === 'ADMIN_SUSPEND') {
            return { label: 'Account Suspended', icon: UserX };
        }
        if (act === 'STAFF_RESTORE' || act === 'ADMIN_RESTORE') {
            return { label: 'Account Restored', icon: UserCheck };
        }
        if (act === 'ROLE_CHANGE') {
            return { label: 'Role Changed', icon: Shield };
        }
        if (act === 'ACCOUNT_UPDATED') {
            return { label: 'Account Details Updated', icon: Users };
        }
        if (act === 'CUSTOMER_ACCOUNT_DELETED') {
            return { label: 'Customer Account Deleted', icon: UserX };
        }

        // Barber & Shift Operations
        if (act === 'BARBER_AVAILABILITY_UPDATED') {
            return { label: 'Barber Availability Updated', icon: Scissors };
        }
        if (act === 'BARBER_ADMIN_STATUS_UPDATED' || act === 'BARBER_ADMIN_STATUS_OVERRIDE') {
            return { label: 'Barber Status Overridden', icon: Scissors };
        }
        if (act === 'BARBER_SHIFT_REQUEST_SUBMITTED') {
            return { label: 'Shift Request Submitted', icon: Calendar };
        }
        if (act === 'BARBER_SHIFT_REQUEST_REVIEWED') {
            return { label: 'Shift Request Reviewed', icon: Calendar };
        }
        if (act === 'BARBER_SHIFT_REQUESTS_CLEARED') {
            return { label: 'Shift Requests Cleared', icon: Calendar };
        }

        // Reservations & Appointments
        if (act === 'RESERVATION_APPROVED' || act === 'APPOINTMENT_APPROVED') {
            return { label: 'Reservation Approved', icon: CheckCircle2 };
        }
        if (act === 'RESERVATION_CONFIRMED' || act === 'APPOINTMENT_CONFIRMED') {
            return { label: 'Reservation Confirmed', icon: CheckCircle2 };
        }
        if (act === 'RESERVATION_DECLINED' || act === 'APPOINTMENT_DECLINED') {
            return { label: 'Reservation Declined', icon: XCircle };
        }
        if (act === 'RESERVATION_CANCELLED' || act === 'APPOINTMENT_CANCELLED') {
            return { label: 'Reservation Cancelled', icon: Calendar };
        }
        if (act === 'APPOINTMENT_NO_SHOW') {
            return { label: 'Reservation No-Show', icon: AlertTriangle };
        }
        if (act === 'CASHIER_ORDER_EXTENDED') {
            return { label: 'Walk-in Service Extended', icon: Clock };
        }
        if (act === 'QUEUE_ORDER_UPDATED') {
            return { label: 'Queue Order Updated', icon: Clock };
        }

        // POS & Sales
        if (act === 'CASHIER_RETAIL_SALE') {
            return { label: 'Retail Sale Completed', icon: CreditCard };
        }
        if (act === 'PAYMENT_ATTEMPT_CONFIRMED') {
            return { label: 'Payment Confirmed', icon: CheckCircle2 };
        }
        if (act === 'PAYMENT_ATTEMPT_FAILED') {
            return { label: 'Payment Failed', icon: XCircle };
        }
        if (act === 'GUEST_QR_REDEEMED') {
            return { label: 'Guest Pass Redeemed', icon: CheckCircle2 };
        }
        if (act === 'GUEST_QR_REISSUED') {
            return { label: 'Guest Pass Reissued', icon: KeyRound };
        }

        // Services & Catalog
        if (act === 'SERVICE_CREATE') {
            return { label: 'Service Created', icon: Scissors };
        }
        if (act === 'SERVICE_UPDATE') {
            return { label: 'Service Updated', icon: Scissors };
        }
        if (act === 'SERVICE_DELETE') {
            return { label: 'Service Deleted', icon: Scissors };
        }

        // Inventory & Suppliers
        if (act === 'PO_APPROVED') {
            return { label: 'Purchase Order Approved', icon: Package };
        }
        if (act === 'PO_REJECTED') {
            return { label: 'Purchase Order Rejected', icon: Package };
        }
        if (act === 'STOCK_COUNT_SUBMITTED') {
            return { label: 'Stock Count Logged', icon: Package };
        }
        if (act === 'INVENTORY_STOCK_MOVEMENT_CREATED') {
            return { label: 'Stock Movement Recorded', icon: Package };
        }
        if (act === 'INVENTORY_SUPPLIER_CREATED') {
            return { label: 'Supplier Added', icon: Package };
        }
        if (act === 'INVENTORY_SUPPLIER_UPDATED') {
            return { label: 'Supplier Updated', icon: Package };
        }
        if (act === 'INVENTORY_SUPPLIER_DEACTIVATED') {
            return { label: 'Supplier Deactivated', icon: Package };
        }
        if (act === 'INVENTORY_DEFAULT_SUPPLIER_ASSIGNED') {
            return { label: 'Default Supplier Assigned', icon: Package };
        }
        if (act === 'RETAIL_PRODUCT_PRESENTATION_UPDATED') {
            return { label: 'Retail Product Updated', icon: Package };
        }
        if (act === 'RETAIL_PRODUCT_IMAGE_UPLOADED') {
            return { label: 'Product Photo Uploaded', icon: Package };
        }
        if (act === 'RETAIL_PRODUCT_IMAGE_REMOVED') {
            return { label: 'Product Photo Removed', icon: Package };
        }
        if (act === 'RETAIL_TAG_CREATED') {
            return { label: 'Product Tag Added', icon: Package };
        }
        if (act === 'RETAIL_CATEGORY_CREATED') {
            return { label: 'Product Category Added', icon: Package };
        }

        // Settings & Storefront
        if (act === 'SHOP_SETTINGS_UPDATE' || act === 'SETTINGS_UPDATE') {
            return { label: 'Shop Settings Updated', icon: Settings };
        }
        if (act === 'BUSINESS_HOURS_UPDATED') {
            return { label: 'Business Hours Updated', icon: Clock };
        }
        if (act === 'LANDING_CONTENT_UPDATED') {
            return { label: 'Storefront Content Updated', icon: Globe };
        }
        if (act === 'SECTION_VISIBILITY_UPDATED') {
            return { label: 'Section Visibility Updated', icon: Eye };
        }
        if (act === 'GALLERY_IMAGE_ADDED') {
            return { label: 'Gallery Photo Added', icon: Eye };
        }
        if (act === 'GALLERY_IMAGE_REMOVED') {
            return { label: 'Gallery Photo Removed', icon: Eye };
        }
        if (act === 'GALLERY_REORDERED') {
            return { label: 'Gallery Photo Order Changed', icon: Eye };
        }
        if (act === 'FAQ_UPDATED') {
            return { label: 'Frequently Asked Questions Updated', icon: FileText };
        }
        if (act === 'PUBLIC_DOCUMENT_UPDATED') {
            return { label: 'Legal Document Updated', icon: FileText };
        }

        // Generic fallback: convert SNAKE_CASE to Title Case
        const formatted = act
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase());
        return { label: formatted, icon: Layers };
    };

    /**
     * Resolves human-readable target context for the affected record
     */
    const extractTargetInfo = (log: AuditLogEntry, details: Record<string, any>) => {
        // Target user / account
        if (details.target_email || details.target_username || details.target_name || details.target_user_id || details.target_role || details.targetUser) {
            const name = details.target_name || details.target_username;
            const email = details.target_email;
            const role = details.target_role || details.new_role || details.old_role;
            const label = name && email ? `${name} (${email})` : (email || name || `User #${details.target_user_id || 'Unknown'}`);
            return {
                type: 'User Account',
                label,
                subtext: role ? `Role: ${role}` : undefined,
            };
        }

        // Reservation / Appointment
        if (details.appointment_id || details.appointmentId || log.resource?.includes('appointment') || log.action?.includes('APPOINTMENT') || log.action?.includes('RESERVATION')) {
            const aptId = details.appointment_id || details.appointmentId || (log.resource?.split('/')[1]);
            const customer = details.customer_name || details.customerName;
            const barber = details.barber_name || details.target_barber_name;
            const dateStr = details.scheduled_date && details.scheduled_time ? `${details.scheduled_date} ${details.scheduled_time}` : details.scheduled_date;
            let label = aptId ? `Reservation #${aptId}` : 'Reservation';
            if (customer) label += ` • ${customer}`;
            const subtext = [barber ? `Barber: ${barber}` : null, dateStr ? `Schedule: ${dateStr}` : null].filter(Boolean).join(' | ');
            return {
                type: 'Reservation',
                label,
                subtext: subtext || undefined,
            };
        }

        // Service Catalog
        if (details.service_name || details.serviceName || details.service_id || log.resource === 'service_catalog') {
            const name = details.service_name || details.serviceName || (details.service_id ? `Service #${details.service_id}` : 'Service Catalog');
            const subtext = [details.category ? `Category: ${details.category}` : null, details.price ? `Price: ₱${details.price}` : null].filter(Boolean).join(' | ');
            return {
                type: 'Service',
                label: name,
                subtext: subtext || undefined,
            };
        }

        // Inventory / Supplier
        if (details.supplier_name || details.supplierName || details.supplier_id || log.resource === 'supplier') {
            const name = details.supplier_name || details.supplierName || (details.supplier_id ? `Supplier #${details.supplier_id}` : 'Supplier');
            return {
                type: 'Supplier',
                label: name,
                subtext: details.item_name ? `Product: ${details.item_name}` : undefined,
            };
        }

        if (details.item_name || details.inventory_stock_id || log.resource?.includes('inventory')) {
            const name = details.item_name || (details.inventory_stock_id ? `Stock #${details.inventory_stock_id}` : 'Inventory Item');
            const subtext = details.quantity_delta !== undefined ? `Qty Delta: ${Number(details.quantity_delta) > 0 ? '+' : ''}${details.quantity_delta}` : undefined;
            return {
                type: 'Inventory',
                label: name,
                subtext,
            };
        }

        // POS & Transactions
        if (details.transaction_id || details.transactionId || log.resource === 'transactions' || log.resource === 'payment_attempt') {
            const id = details.transaction_id || details.transactionId || details.attempt_id;
            let label = id ? `Transaction #${id}` : 'Transaction';
            if (details.customer_name) label += ` • ${details.customer_name}`;
            const subtext = [details.total_amount ? `Total: ₱${details.total_amount}` : null, details.payment_method ? `Method: ${details.payment_method}` : null].filter(Boolean).join(' | ');
            return {
                type: 'Transaction',
                label,
                subtext: subtext || undefined,
            };
        }

        // Settings / Storefront
        if (details.target || details.subsection || details.section || log.resource === 'shop_settings' || log.resource === 'website_content') {
            const label = details.target || details.subsection || details.section || 'Shop Settings';
            const subtext = details.section && details.target !== details.section ? `Section: ${details.section}` : undefined;
            return {
                type: 'Setting',
                label,
                subtext,
            };
        }

        // Fallback email or target
        if (details.email || details.user_email) {
            return {
                type: 'Account',
                label: details.email || details.user_email,
                subtext: undefined,
            };
        }

        return null;
    };

    return (
        <div className="min-h-0 flex flex-col gap-3 overflow-visible lg:h-full lg:overflow-hidden pb-8 lg:pb-0">
            {/* Top Toolbar / Filter Summary */}
            <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-2">
                    {activeFilterCount > 0 ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/15 border border-gold/30 text-gold text-xs font-semibold shadow-xs">
                            <Filter className="w-3.5 h-3.5" />
                            <span>{activeFilterCount} active filter{activeFilterCount > 1 ? 's' : ''} applied</span>
                        </div>
                    ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-ivory-dim text-xs font-mono">
                            <span>{auditTotal} total events recorded</span>
                        </div>
                    )}
                </div>
                {activeFilterCount > 0 && (
                    <button
                        type="button"
                        onClick={resetAllFilters}
                        className="min-h-[34px] bg-white/5 hover:bg-white/10 border border-white/10 text-ivory-dim hover:text-ivory text-xs font-semibold py-1 px-3 rounded-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                        <X className="w-3.5 h-3.5 text-gold" />
                        <span>Reset Filters</span>
                    </button>
                )}
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
                <div className="bg-charcoal-light border border-white/5 p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0">
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Events (24h)
                        </p>
                        {loading && auditTotal === 0 ? (
                            <Skeleton variant="text" className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-ivory mt-0.5 sm:mt-1 truncate">
                                {auditStats.total_24h}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-white/5 rounded-full border border-white/10 shrink-0">
                        <Clock className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gold" />
                    </div>
                </div>

                <div className="bg-charcoal-light border border-white/5 p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0">
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Failed / Denied
                        </p>
                        {loading && auditTotal === 0 ? (
                            <Skeleton variant="text" className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-red-400 mt-0.5 sm:mt-1 truncate">
                                {auditStats.failed_24h}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-red-500/10 rounded-full border border-red-500/20 shrink-0">
                        <AlertTriangle className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-red-400" />
                    </div>
                </div>

                <div className="bg-charcoal-light border border-white/5 p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0">
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Security & Access
                        </p>
                        {loading && auditTotal === 0 ? (
                            <Skeleton variant="text" className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-green-400 mt-0.5 sm:mt-1 truncate">
                                {auditStats.auth_24h}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-green-500/10 rounded-full border border-green-500/20 shrink-0">
                        <Shield className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-green-400" />
                    </div>
                </div>
            </div>

            {/* Category / Module Pills Bar */}
            <div className="shrink-0 bg-charcoal-light border border-white/5 rounded-sm p-2 flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gold font-bold flex items-center gap-1.5">
                        <Filter className="w-3 h-3 text-gold" /> Filter by Activity Category
                    </span>
                    <span className="text-[10px] text-ivory-dim font-mono">
                        {selectedModule === 'all'
                            ? 'All recorded categories'
                            : AUDIT_MODULES.find((m) => m.id === selectedModule)?.description}
                    </span>
                </div>

                {/* Mobile Dropdown */}
                <div className="sm:hidden w-full">
                    <select
                        aria-label="Filter audit logs by module"
                        value={selectedModule}
                        onChange={(e) => handleModuleSelect(e.target.value as AuditModuleCategory)}
                        className="min-h-[44px] w-full bg-charcoal border border-white/10 px-3 py-2 text-xs text-ivory focus:border-gold focus:outline-none rounded-sm"
                    >
                        {AUDIT_MODULES.map((mod) => (
                            <option key={mod.id} value={mod.id}>
                                {mod.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Desktop / Tablet Pills */}
                <div className="hidden sm:flex flex-wrap gap-1.5 items-center">
                    {AUDIT_MODULES.map((mod) => {
                        const isSelected = selectedModule === mod.id;
                        const Icon = mod.icon;
                        return (
                            <button
                                key={mod.id}
                                type="button"
                                onClick={() => handleModuleSelect(mod.id)}
                                className={`min-h-[36px] px-3 py-1.5 rounded-sm text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                                    isSelected
                                        ? 'bg-gold text-charcoal font-bold shadow-sm border border-gold'
                                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-ivory border border-white/5 hover:border-white/15'
                                }`}
                            >
                                <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-charcoal' : 'text-gold'}`} />
                                <span>{mod.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Search and Advanced Filters */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 shrink-0">
                <div className="relative flex-1">
                    <Search className="w-4 h-4 text-ivory-dim absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search by account email, name, activity, or target…"
                        value={auditFilter}
                        onChange={(e) => {
                            setAuditFilter(e.target.value);
                            setAuditPage(1);
                        }}
                        className="min-h-[40px] w-full bg-charcoal-light border border-white/10 pl-9 pr-9 py-2 text-xs text-ivory placeholder-ivory-dim/50 focus:border-gold focus:outline-none rounded-sm"
                    />
                    {auditFilter && (
                        <button
                            type="button"
                            onClick={() => {
                                setAuditFilter('');
                                setAuditPage(1);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory p-1 cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* Role & Status Filter */}
                    <div className="relative flex-1 sm:flex-initial">
                        <button
                            type="button"
                            onClick={() => {
                                setIsFilterOpen(!isFilterOpen);
                                setIsSortOpen(false);
                            }}
                            className={`min-h-[40px] w-full sm:w-auto text-xs py-2 px-3 flex items-center justify-center gap-2 border rounded-sm transition-all cursor-pointer ${
                                selectedRole !== 'all' || selectedStatus !== 'all'
                                    ? 'bg-gold text-charcoal font-bold border-gold'
                                    : 'bg-charcoal-light border-white/10 text-ivory-dim hover:text-ivory'
                            }`}
                        >
                            <Filter className="w-3.5 h-3.5 shrink-0" />
                            <span className="whitespace-nowrap">Filter</span>
                            {(selectedRole !== 'all' || selectedStatus !== 'all') && (
                                <span className="w-1.5 h-1.5 rounded-full bg-charcoal shrink-0" />
                            )}
                        </button>
                        {isFilterOpen && (
                            <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 w-60 bg-charcoal-light border border-white/10 rounded-sm p-3.5 shadow-2xl z-30 space-y-3">
                                <div>
                                    <label className="block text-[10px] uppercase tracking-wider text-gold mb-1 font-bold">
                                        Role Filter
                                    </label>
                                    <select
                                        value={selectedRole}
                                        onChange={(e) => {
                                            setSelectedRole(e.target.value);
                                            setAuditPage(1);
                                            setIsFilterOpen(false);
                                        }}
                                        className="min-h-[38px] w-full bg-charcoal border border-white/10 px-2.5 py-1 text-xs text-ivory focus:border-gold focus:outline-none rounded-sm"
                                    >
                                        <option value="all">All Roles</option>
                                        <option value="Admin">Admin</option>
                                        <option value="Cashier">Cashier</option>
                                        <option value="Inventory Manager">Inventory Manager</option>
                                        <option value="Barber">Barber</option>
                                        <option value="Customer">Customer</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] uppercase tracking-wider text-gold mb-1 font-bold">
                                        Result Status
                                    </label>
                                    <select
                                        value={selectedStatus}
                                        onChange={(e) => {
                                            setSelectedStatus(e.target.value);
                                            setAuditPage(1);
                                            setIsFilterOpen(false);
                                        }}
                                        className="min-h-[38px] w-full bg-charcoal border border-white/10 px-2.5 py-1 text-xs text-ivory focus:border-gold focus:outline-none rounded-sm"
                                    >
                                        <option value="all">All Statuses</option>
                                        <option value="SUCCESS">Success</option>
                                        <option value="FAILURE">Failed / Denied</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sort Dropdown */}
                    <div className="relative flex-1 sm:flex-initial">
                        <button
                            type="button"
                            onClick={() => {
                                setIsSortOpen(!isSortOpen);
                                setIsFilterOpen(false);
                            }}
                            className="min-h-[40px] w-full sm:w-auto bg-charcoal-light border border-white/10 text-ivory-dim hover:text-ivory text-xs py-2 px-3 flex items-center justify-center gap-1.5 rounded-sm transition-all cursor-pointer"
                        >
                            <ArrowUpDown className="w-3.5 h-3.5 text-gold shrink-0" />
                            <span className="whitespace-nowrap">Sort</span>
                            <ChevronDown className="w-3 h-3 text-ivory-dim/60 shrink-0" />
                        </button>
                        {isSortOpen && (
                            <div className="absolute right-0 top-full mt-1.5 w-44 bg-charcoal-light border border-white/10 rounded-sm shadow-2xl z-30 overflow-hidden text-xs">
                                <button
                                    onClick={() => {
                                        setSortBy('timestamp_desc');
                                        setAuditPage(1);
                                        setIsSortOpen(false);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-ivory hover:bg-white/5 hover:text-gold"
                                >
                                    Newest First
                                </button>
                                <button
                                    onClick={() => {
                                        setSortBy('timestamp_asc');
                                        setAuditPage(1);
                                        setIsSortOpen(false);
                                    }}
                                    className="w-full text-left px-3.5 py-2 text-ivory hover:bg-white/5 hover:text-gold"
                                >
                                    Oldest First
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Error Banner */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-sm flex items-center justify-between gap-4 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <span className="text-xs text-red-300">{error}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => fetchAuditData()}
                        className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold rounded-sm transition-colors cursor-pointer shrink-0"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Audit Logs Table & Mobile List */}
            <div className="bg-charcoal-light border border-white/5 rounded-sm overflow-hidden shadow-xl lg:flex-1 lg:min-h-0 flex flex-col">
                {/* 1. MOBILE LIST (< md) */}
                <div className="block md:hidden divide-y divide-white/5">
                    {loading && auditLogs.length === 0 ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="p-3 space-y-2 animate-pulse">
                                <div className="flex items-center justify-between">
                                    <Skeleton variant="text" className="h-4 w-28" />
                                    <Skeleton variant="text" className="h-4 w-16" />
                                </div>
                                <div className="flex items-center justify-between">
                                    <Skeleton variant="text" className="h-3 w-36" />
                                    <Skeleton variant="text" className="h-6 w-20" />
                                </div>
                            </div>
                        ))
                    ) : (
                        auditLogs.map((log) => {
                            const logKey = log.audit_id || log.id || `${log.created_at}-${log.action}`;
                            const isFailure =
                                log.status === 'FAILURE' ||
                                String(log.action).includes('FAIL') ||
                                String(log.action).includes('ERROR') ||
                                String(log.action).includes('DENIED');

                            const activity = formatActivityInfo(log.action, log.details);
                            const ActivityIcon = activity.icon;
                            const details = parseDetails(log.details);
                            const targetInfo = extractTargetInfo(log, details);
                            const target = details.target_email || details.target || details.email;

                            return (
                                <div key={logKey} className="p-3 space-y-2 hover:bg-white/[0.01] transition-colors">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="p-1.5 rounded-sm bg-white/5 border border-white/5 text-gold shrink-0">
                                                <ActivityIcon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-ivory truncate">{activity.label}</h4>
                                                <p className="text-[10px] text-ivory-dim font-mono">{formatManilaDate(log.created_at)}</p>
                                            </div>
                                        </div>
                                        <span
                                            className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                                                isFailure
                                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                            }`}
                                        >
                                            {isFailure ? 'Failed' : 'Success'}
                                        </span>
                                    </div>

                                    {/* Account info */}
                                    <div className="text-[11px] text-ivory-dim flex items-center justify-between gap-2 pt-1 border-t border-white/5">
                                        <div className="truncate">
                                            <span className="text-ivory font-medium">{log.actor_name || log.actor_email || 'System'}</span>
                                            {log.actor_role && (
                                                <span className="ml-1 text-[9px] uppercase px-1 py-0.2 rounded-sm bg-white/5 text-ivory-dim border border-white/5">
                                                    {log.actor_role}
                                                </span>
                                            )}
                                            {targetInfo ? (
                                                <div className="text-[10px] text-ivory-dim/90 truncate mt-0.5 flex items-center gap-1">
                                                    <span className="text-gold font-mono uppercase text-[9px] px-1 py-0.2 rounded-xs bg-gold/10 border border-gold/20">
                                                        {targetInfo.type}
                                                    </span>
                                                    <span className="text-ivory font-medium truncate">{targetInfo.label}</span>
                                                </div>
                                            ) : target && target !== (log.actor_email || log.actor_name) ? (
                                                <span className="block text-[10px] text-ivory-dim/70 truncate mt-0.5">
                                                    Target: {target}
                                                </span>
                                            ) : null}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedLogForModal(log)}
                                            className="min-h-[30px] px-2.5 py-1 text-xs rounded-sm border border-white/10 hover:border-gold/40 text-gold bg-white/5 hover:bg-gold/10 transition-colors shrink-0 font-medium"
                                        >
                                            Details
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* 2. DESKTOP 5-COLUMN TABLE (>= md): Date & Time | Account | Activity | Result | Details */}
                <div className="hidden md:block overflow-x-auto admin-table-scroll lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
                    <table className="w-full text-left text-xs relative">
                        <thead className="sticky top-0 z-10 bg-charcoal-light/95 backdrop-blur-sm border-b border-white/10 text-ivory-dim uppercase tracking-wider text-[10px] font-bold shadow-xs">
                            <tr>
                                <th className="px-4 py-3 whitespace-nowrap">Date & Time</th>
                                <th className="px-4 py-3 whitespace-nowrap">Account</th>
                                <th className="px-4 py-3">Activity</th>
                                <th className="px-4 py-3 whitespace-nowrap">Result</th>
                                <th className="px-4 py-3 whitespace-nowrap text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading && auditLogs.length === 0 ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-4 py-3.5"><Skeleton variant="text" className="h-3 w-28" /></td>
                                        <td className="px-4 py-3.5"><Skeleton variant="text" className="mb-1 h-3 w-32" /><Skeleton variant="text" className="h-2 w-16" /></td>
                                        <td className="px-4 py-3.5"><Skeleton variant="text" className="h-3 w-36" /></td>
                                        <td className="px-4 py-3.5"><Skeleton variant="text" className="h-4 w-16" /></td>
                                        <td className="px-4 py-3.5 text-right"><Skeleton variant="text" className="h-6 w-16 ml-auto" /></td>
                                    </tr>
                                ))
                            ) : (
                                auditLogs.map((log) => {
                                    const logKey = log.audit_id || log.id || `${log.created_at}-${log.action}`;
                                    const isFailure =
                                        log.status === 'FAILURE' ||
                                        String(log.action).includes('FAIL') ||
                                        String(log.action).includes('ERROR') ||
                                        String(log.action).includes('DENIED');

                                    const activity = formatActivityInfo(log.action, log.details);
                                    const ActivityIcon = activity.icon;
                                    const details = parseDetails(log.details);
                                    const targetInfo = extractTargetInfo(log, details);
                                    const target = details.target_email || details.target || details.email;

                                    return (
                                        <tr key={logKey} className="hover:bg-white/[0.02] transition-colors">
                                            {/* Date & Time */}
                                            <td className="px-4 py-3 text-ivory whitespace-nowrap font-mono text-[11px]">
                                                <div className="flex items-center gap-1.5">
                                                    <Clock className="w-3.5 h-3.5 text-ivory-dim shrink-0" />
                                                    <span>{formatManilaDate(log.created_at)}</span>
                                                </div>
                                            </td>

                                            {/* Account */}
                                            <td className="px-4 py-3">
                                                <div>
                                                    <div className="font-semibold text-ivory text-xs flex items-center gap-1.5 flex-wrap">
                                                        <span>{log.actor_name || log.actor_email || 'System'}</span>
                                                        {log.actor_role && (
                                                            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded-sm bg-white/5 text-ivory-dim font-mono border border-white/5">
                                                                {log.actor_role}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {target && target !== (log.actor_email || log.actor_name) && (
                                                        <div className="text-[10px] text-ivory-dim/80 mt-0.5">
                                                            Target: <span className="text-ivory font-medium">{target}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Activity */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-start gap-2">
                                                    <div className="p-1 rounded-sm bg-white/5 border border-white/5 text-gold shrink-0 mt-0.5">
                                                        <ActivityIcon className="w-3.5 h-3.5" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="font-semibold text-ivory text-xs block">{activity.label}</span>
                                                        {targetInfo ? (
                                                            <div className="text-[10px] text-ivory-dim/80 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                                                <span className="text-gold font-mono text-[9px] uppercase px-1 py-0.2 rounded-xs bg-gold/10 border border-gold/20">
                                                                    {targetInfo.type}
                                                                </span>
                                                                <span className="text-ivory/90 font-medium truncate">{targetInfo.label}</span>
                                                                {targetInfo.subtext && (
                                                                    <span className="text-ivory-dim/60 truncate text-[9px]">({targetInfo.subtext})</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-ivory-dim/60 font-mono block mt-0.5 truncate">
                                                                {log.resource || 'system'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Result */}
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                                                        isFailure
                                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                    }`}
                                                >
                                                    {isFailure ? 'Failed' : 'Success'}
                                                </span>
                                            </td>

                                            {/* Details Button */}
                                            <td className="px-4 py-3 text-right whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedLogForModal(log)}
                                                    className="min-h-[28px] px-2.5 py-1 text-xs rounded-sm border border-white/10 hover:border-gold/40 text-ivory-dim hover:text-gold bg-white/5 hover:bg-gold/10 transition-colors cursor-pointer font-medium inline-flex items-center gap-1.5"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>View</span>
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Empty State */}
            {!loading && !error && auditLogs.length === 0 && (
                <div className="text-center py-10 bg-charcoal-light border border-dashed border-white/10 rounded-sm shrink-0 space-y-1">
                    <FileText className="w-8 h-8 text-white/10 mx-auto" />
                    <p className="text-ivory font-bold text-xs">No audit logs found for {dateFilterLabel}.</p>
                    <p className="text-ivory-dim text-[11px]">
                        There are no audit events matching the selected module or search criteria.
                    </p>
                    {activeFilterCount > 0 && (
                        <button
                            type="button"
                            onClick={resetAllFilters}
                            className="mt-2 inline-flex items-center gap-1 text-xs text-gold hover:underline cursor-pointer"
                        >
                            Reset filters to view all events
                        </button>
                    )}
                </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <div className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-1 shrink-0">
                    <p className="text-xs text-ivory-dim text-center sm:text-left">
                        Showing page <span className="text-ivory font-bold">{auditPage}</span> of{' '}
                        <span className="text-ivory font-bold">{totalPages}</span> ({auditTotal} total records)
                    </p>
                    <SteppingPagination
                        currentPage={auditPage}
                        totalPages={totalPages}
                        onPageChange={setAuditPage}
                    />
                </div>
            )}

            {/* Event Details Modal: Preserves IP Address, Device Origin & Payload */}
            <Modal
                isOpen={Boolean(selectedLogForModal)}
                onClose={() => setSelectedLogForModal(null)}
                title="Event Details"
            >
                {selectedLogForModal && (() => {
                    const activity = formatActivityInfo(selectedLogForModal.action, selectedLogForModal.details);
                    const ActivityIcon = activity.icon;
                    const details = parseDetails(selectedLogForModal.details);
                    const targetInfo = extractTargetInfo(selectedLogForModal, details);
                    const isFailure =
                        selectedLogForModal.status === 'FAILURE' ||
                        String(selectedLogForModal.action).includes('FAIL') ||
                        String(selectedLogForModal.action).includes('ERROR') ||
                        String(selectedLogForModal.action).includes('DENIED');

                    return (
                        <div className="space-y-4 text-xs text-ivory">
                            {/* Header Banner */}
                            <div className="flex items-center justify-between p-3 rounded-sm bg-charcoal border border-white/10">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-sm bg-gold/10 text-gold border border-gold/20">
                                        <ActivityIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-ivory">{activity.label}</h4>
                                        <span className="font-mono text-[10px] text-ivory-dim">
                                            {selectedLogForModal.action}
                                        </span>
                                    </div>
                                </div>
                                <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider ${
                                        isFailure
                                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }`}
                                >
                                    {isFailure ? 'Failed' : 'Success'}
                                </span>
                            </div>

                            {/* Core Metadata Grid */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                                        Date & Time
                                    </span>
                                    <span className="text-ivory font-mono text-[11px] block">
                                        {formatManilaDate(selectedLogForModal.created_at)}
                                    </span>
                                </div>

                                <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                                        Resource Domain
                                    </span>
                                    <span className="text-gold font-mono text-[11px] block">
                                        {selectedLogForModal.resource || 'system'}
                                    </span>
                                </div>

                                <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                                        Actor
                                    </span>
                                    <span className="text-ivory font-medium block truncate">
                                        {selectedLogForModal.actor_name || selectedLogForModal.actor_email || 'System'}
                                    </span>
                                    {selectedLogForModal.actor_role && (
                                        <span className="text-[10px] text-gold uppercase tracking-wider font-semibold block">
                                            {selectedLogForModal.actor_role}
                                        </span>
                                    )}
                                </div>

                                <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                                        IP Address (Origin)
                                    </span>
                                    <span className="text-ivory font-mono text-[11px] block truncate">
                                        {selectedLogForModal.ip_address || 'Unavailable'}
                                    </span>
                                </div>
                            </div>

                            {/* Target Record Card */}
                            {targetInfo ? (
                                <div className="bg-charcoal p-3 rounded-sm border border-gold/25 space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase font-bold text-gold tracking-wider flex items-center gap-1.5">
                                            Affected Record • {targetInfo.type}
                                        </span>
                                    </div>
                                    <div className="text-xs sm:text-sm font-semibold text-ivory">
                                        {targetInfo.label}
                                    </div>
                                    {targetInfo.subtext && (
                                        <div className="text-[11px] text-ivory-dim">
                                            {targetInfo.subtext}
                                        </div>
                                    )}
                                    {(details.reason || details.cancellation_reason || details.admin_notes) && (
                                        <div className="pt-1.5 mt-1.5 border-t border-white/5 text-[11px] text-ivory-dim flex items-start gap-1.5">
                                            <span className="text-ivory font-medium">Reason / Notes:</span>
                                            <span className="text-ivory/90">{details.reason || details.cancellation_reason || details.admin_notes}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (details.target_email || details.target || details.email) ? (
                                <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                                        Target Record
                                    </span>
                                    <span className="text-ivory font-medium text-xs block">
                                        {details.target_email || details.target || details.email}
                                    </span>
                                </div>
                            ) : null}

                            {/* Operational Context Attributes */}
                            {(() => {
                                const ignoredKeys = new Set([
                                    'changes', 'target_email', 'target_user_id', 'target_username', 'target_name',
                                    'target_role', 'old_role', 'new_role', 'reason', 'cancellation_reason', 'admin_notes',
                                    'event', 'action', 'role'
                                ]);
                                const opEntries = Object.entries(details).filter(([k, v]) => !ignoredKeys.has(k) && v !== null && v !== undefined && typeof v !== 'object');
                                if (opEntries.length === 0) return null;
                                return (
                                    <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-1.5">
                                        <span className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider block">
                                            Event Parameters
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                            {opEntries.map(([k, v]) => {
                                                const label = k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                                                return (
                                                    <div key={k} className="bg-charcoal-light/60 p-2 rounded-xs border border-white/5">
                                                        <span className="text-[9px] uppercase font-mono text-ivory-dim/70 block truncate">{label}</span>
                                                        <span className="text-[11px] font-medium text-ivory block truncate">{String(v)}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Structured Changes / Diffs */}
                            {details.changes && typeof details.changes === 'object' && (
                                <div className="bg-charcoal p-2.5 rounded-sm border border-white/5 space-y-1.5">
                                    <span className="text-[10px] uppercase font-bold text-gold tracking-wider block">
                                        Changes Recorded
                                    </span>
                                    <div className="flex flex-col gap-1">
                                        {Object.entries(details.changes).map(([field, diff]: [string, any]) => {
                                            const fieldName = field.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
                                            if (diff && typeof diff === 'object' && ('from' in diff || 'to' in diff)) {
                                                return (
                                                    <div key={field} className="text-[11px] flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-ivory-dim">{fieldName}:</span>
                                                        <span className="line-through text-red-300/80 bg-red-500/10 px-1 py-0.2 rounded text-[10px]">
                                                            {String(diff.from ?? 'None')}
                                                        </span>
                                                        <span className="text-gold text-[10px]">→</span>
                                                        <span className="text-emerald-300 font-semibold bg-emerald-500/10 px-1 py-0.2 rounded text-[10px]">
                                                            {String(diff.to ?? 'None')}
                                                        </span>
                                                    </div>
                                                );
                                            }
                                            return (
                                                <div key={field} className="text-[11px] flex items-center gap-1">
                                                    <span className="text-ivory-dim">{fieldName}:</span>
                                                    <span className="text-ivory font-medium">{String(diff)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Raw Technical Details (Collapsible) */}
                            {details && Object.keys(details).length > 0 && (
                                <details className="bg-charcoal/60 rounded-sm border border-white/5 p-2.5">
                                    <summary className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim hover:text-ivory cursor-pointer flex items-center justify-between">
                                        <span>Technical Payload (JSON)</span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                void navigator.clipboard.writeText(JSON.stringify(details, null, 2));
                                                setCopiedPayload(true);
                                                setTimeout(() => setCopiedPayload(false), 2000);
                                            }}
                                            className="px-2 py-0.5 rounded-xs bg-white/5 hover:bg-white/10 text-ivory text-[10px] font-mono border border-white/10 inline-flex items-center gap-1 transition-colors cursor-pointer"
                                        >
                                            {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-gold" />}
                                            <span>{copiedPayload ? 'Copied!' : 'Copy JSON'}</span>
                                        </button>
                                    </summary>
                                    <pre className="mt-2 p-2 bg-charcoal rounded text-[10px] font-mono text-ivory overflow-x-auto whitespace-pre-wrap max-h-40 border border-white/5">
                                        {JSON.stringify(details, null, 2)}
                                    </pre>
                                </details>
                            )}

                            {/* Close Action */}
                            <div className="pt-2 border-t border-white/10 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setSelectedLogForModal(null)}
                                    className="min-h-[34px] px-3.5 py-1.5 rounded-sm text-xs font-semibold bg-charcoal border border-white/10 text-ivory hover:border-white/20 cursor-pointer transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </Modal>
        </div>
    );
};

export default AuditLogsTable;
