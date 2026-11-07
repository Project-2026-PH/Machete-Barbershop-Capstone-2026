import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
    Store,
    Package,
    Scissors,
    CheckCircle2,
    RefreshCw,
    Search,
    AlertTriangle,
    Lock,
    ExternalLink,
    Clock,
    UserCheck,
    UserX,
    ChevronRight,
    ShieldCheck,
} from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { ManagementSubHeaderNav } from '@/features/admin/components/Management/ManagementSubHeaderNav';
import { barberService } from '@/features/barber/services/barber.service';
import { api } from '@/config/api';
import type { StaffDirectoryMember } from '@demoshop/shared-types';

interface RoleDefinition {
    id: string;
    name: string;
    roleKey: string;
    icon: React.ElementType;
    description: string;
    operationalScopeTag: string;
    mainAccess: string;
    accessSummary: string;
    purpose: string;
    grantedScope: string[];
    restrictedBoundaries: string[];
    accessibleAreas: string[];
    capabilities: string[];
    additionalAccessText: string;
    accessStatusText: string;
    isFixed: boolean;
}

const SYSTEM_ROLES: RoleDefinition[] = [
    {
        id: 'cashier',
        name: 'Cashier',
        roleKey: 'Cashier',
        icon: Store,
        description: 'Handles reservations, payments, and front-desk transactions.',
        operationalScopeTag: 'Flexible Inventory Scope',
        mainAccess: 'Cashier Register & Queue',
        accessSummary: 'Can also be granted optional access to manage inventory.',
        purpose: 'Handles front-desk client arrivals, reservations, queue coordination, checkout, and payment processing.',
        grantedScope: [
            'Front-desk POS register and tender collection',
            'Queue ticketing, customer calling, and barber chair assignment',
            'Reservation review, payment receipt verification, and approvals',
            'Optional: Inventory management workspace (when granted by Shop Admin)',
        ],
        restrictedBoundaries: [
            'Cannot modify master service pricing or barber commission rates',
            'Cannot edit staff credentials or global shop configuration',
            'Inventory workspace restricted unless explicitly allowed by Admin',
        ],
        accessibleAreas: [
            'Cashier Register & POS Checkout',
            'Queue Ticketing & Barber Assignment',
            'Reservation Review & Receipt Verification',
            'Daily Sales Drawer & Tenders',
            'Optional: Inventory Management (when granted by Shop Admin)',
        ],
        capabilities: [
            'Create walk-in tickets and reservations',
            'Review reservation receipts and approve appointments',
            'Process customer checkout, cash, and digital payments',
            'Manage customer waiting queue and assign barbers',
            'Switch to Inventory workspace if additional access is allowed',
        ],
        additionalAccessText: 'Flexible. Shop Admin can grant or revoke additional Inventory access per cashier account at any time.',
        accessStatusText: 'Flexible — Inventory access is optional and managed per cashier.',
        isFixed: false,
    },
    {
        id: 'inventory-manager',
        name: 'Inventory Manager',
        roleKey: 'Inventory Manager',
        icon: Package,
        description: 'Manages products, supplies, and stock records.',
        operationalScopeTag: 'Stock Catalog & Reconciliation',
        mainAccess: 'Inventory & Stock Management',
        accessSummary: 'Dedicated stock tracking with read-only sales reconciliation.',
        purpose: 'Tracks shop supplies, monitors stock levels, manages retail products, logs physical audits, and handles vendor purchase orders.',
        grantedScope: [
            'Full management over consumables, retail products, barcodes, and SKUs',
            'Vendor purchase order generation, tracking, and delivery intake',
            'Physical cycle counts, stock adjustments, and variance logging',
            'Cross-workspace: Read-only access to retail POS billing logs for stock reconciliation',
        ],
        restrictedBoundaries: [
            'Restricted from front-desk customer checkout and cash drawer tenders',
            'Restricted from modifying reservations, walk-in tickets, or chair queues',
            'Cannot alter barber commissions, payroll, or staff credentials',
        ],
        accessibleAreas: [
            'Consumables & Internal Usage Stock Directory',
            'Retail Product Catalog, Barcodes, Pricing & Tags',
            'Suppliers, Vendors & Purchase Orders',
            'Physical Stock Counts, Audits & Variance Adjustments',
            'Related POS Retail Billing & Restock Sales Logs (Read-Only)',
        ],
        capabilities: [
            'Track consumable usage and monitor critical stock reorder thresholds',
            'Manage retail product details, barcode SKUs, categories, and pricing',
            'Submit replenishment and vendor purchase order requests',
            'Log scheduled physical cycle counts and audit variances',
            'Reconcile inventory item depletion against front-desk sales records',
        ],
        additionalAccessText: 'Dedicated Scope. Has full authority over inventory and supply replenishment, plus read-only sales log reconciliation. Customer front-desk registers and appointment booking approvals remain restricted to Cashier and Shop Admin.',
        accessStatusText: 'Dedicated Scope — Stock catalog, replenishment, and read-only POS sales reconciliation.',
        isFixed: true,
    },
    {
        id: 'barber',
        name: 'Barber',
        roleKey: 'Barber',
        icon: Scissors,
        description: 'Manages customer queues, availability, and services.',
        operationalScopeTag: 'Chair Station & Self-Service',
        mainAccess: 'Barber Station & Queue',
        accessSummary: 'Dedicated chair queue, commission estimates, and schedule self-service.',
        purpose: 'Delivers haircut and grooming services to assigned customers at their chair station.',
        grantedScope: [
            'Chair station queue visibility, live customer calling, and service logging',
            'Operational availability self-management (On Duty, On Break)',
            'Personal commission analytics, tip summaries, and haircut history',
            'Station consumables logging (pomades, blades, neck strips)',
        ],
        restrictedBoundaries: [
            'Restricted from front-desk customer checkout and tender collection',
            'Cannot alter master product catalog, supplier orders, or shop pricing',
            'Cannot approve or decline reservations for other barbers',
        ],
        accessibleAreas: [
            'Chair Station Queue & Live Customer Calling',
            'Haircut Service Logging, Completed History & Portfolio Photos',
            'Shift Schedules, Availability Status & Time-off Requests',
            'Personal Tips & Commission Estimates',
            'Station Supply Requests & Consumables Logging',
        ],
        capabilities: [
            'View chair station queue and call next customer in real-time',
            'Start, finish, and log haircut services with styling notes and photos',
            'Monitor personal commission earnings, tip summaries, and haircut records',
            'Self-manage operational availability status and request shift swaps',
            'Log consumable barbershop supplies used during chair station services',
        ],
        additionalAccessText: 'Self-Service Scope. Includes personal commission analytics, shift self-management, and station consumable logging. Front-desk checkout, customer billing, and financial drawers remain restricted to Cashiers and Shop Admins.',
        accessStatusText: 'Self-Service Scope — Chair station execution, commission tracking, and shift self-management.',
        isFixed: true,
    },
];

interface RolesAndAccessTabProps {
    onNavigateSubTab?: (subTab: string) => void;
}

export const RolesAndAccessTab: React.FC<RolesAndAccessTabProps> = ({ onNavigateSubTab }) => {
    const [, setSearchParams] = useSearchParams();

    // Staff directory state (all operational staff)
    const [staffList, setStaffList] = useState<StaffDirectoryMember[]>([]);
    const [isLoadingStaff, setIsLoadingStaff] = useState(true);

    // Search filter
    const [searchTerm, setSearchTerm] = useState('');

    // Modal states
    const [selectedRoleForDetail, setSelectedRoleForDetail] = useState<RoleDefinition | null>(null);
    const [confirmingMember, setConfirmingMember] = useState<StaffDirectoryMember | null>(null);
    const [targetAccessState, setTargetAccessState] = useState<boolean>(false);
    const [isUpdatingAccess, setIsUpdatingAccess] = useState(false);

    // Toast alert state
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    // Recent verified access changes
    const [recentAccessLogs, setRecentAccessLogs] = useState<any[]>([]);
    const [isLoadingLogs, setIsLoadingLogs] = useState(true);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchStaff = useCallback(async () => {
        setIsLoadingStaff(true);
        try {
            const data = await barberService.getStaffMembers();
            setStaffList(data || []);
        } catch (err) {
            console.error('[RolesAndAccessTab] Failed to fetch staff directory:', err);
            showToast('Unable to load staff directory. Please try again.', 'error');
        } finally {
            setIsLoadingStaff(false);
        }
    }, []);

    const fetchRecentAccessLogs = useCallback(async () => {
        setIsLoadingLogs(true);
        try {
            const res = await api.get('/api/admin/audit-logs?module=auth&limit=25');
            const logs = res.data?.logs || (Array.isArray(res.data) ? res.data : []);
            setRecentAccessLogs(logs);
        } catch (err) {
            console.warn('[RolesAndAccessTab] Failed to fetch recent access audit logs:', err);
        } finally {
            setIsLoadingLogs(false);
        }
    }, []);

    useEffect(() => {
        void fetchStaff();
        void fetchRecentAccessLogs();
    }, [fetchStaff, fetchRecentAccessLogs]);

    // Cashiers list
    const cashiers = useMemo(() => {
        return staffList.filter((s) => (s.role || '').toLowerCase() === 'cashier');
    }, [staffList]);

    const filteredCashiers = useMemo(() => {
        if (!searchTerm.trim()) return cashiers;
        const q = searchTerm.toLowerCase().trim();
        return cashiers.filter(
            (c) =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.username || '').toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q)
        );
    }, [cashiers, searchTerm]);

    const getRoleStaffCount = (roleKey: string) => {
        return staffList.filter((s) => (s.role || '').toLowerCase() === roleKey.toLowerCase()).length;
    };

    // Filtered verified access & role changes (pure role/permission events)
    const relevantAccessLogs = useMemo(() => {
        return recentAccessLogs.filter((log) => {
            const act = (log.action || '').toUpperCase();
            if (
                act.includes('LOGIN') ||
                act.includes('LOGOUT') ||
                act.includes('SESSION') ||
                act.includes('PASSWORD') ||
                act.includes('AUTH_')
            ) {
                return false;
            }
            return (
                act.includes('CASHIER') ||
                act.includes('INVENTORY_ACCESS') ||
                act.includes('ROLE') ||
                act.includes('STAFF_UPDATE') ||
                act.includes('STAFF_CREATE') ||
                act.includes('STAFF_SUSPEND') ||
                act.includes('STAFF_RESTORE')
            );
        });
    }, [recentAccessLogs]);

    const handleOpenConfirmModal = (member: StaffDirectoryMember, newAccess: boolean) => {
        setConfirmingMember(member);
        setTargetAccessState(newAccess);
    };

    const handleConfirmAccessChange = async () => {
        if (!confirmingMember?.user_id) return;
        setIsUpdatingAccess(true);
        const memberName = confirmingMember.name || confirmingMember.username || 'Cashier';
        try {
            await barberService.updateCashierInventoryAccess(confirmingMember.user_id, targetAccessState);
            showToast(
                targetAccessState
                    ? `Inventory access allowed for ${memberName}.`
                    : `Inventory access removed for ${memberName}.`,
                'success'
            );
            setConfirmingMember(null);
            await fetchStaff();
            await fetchRecentAccessLogs();
        } catch (err: any) {
            console.error('[RolesAndAccessTab] Failed to update cashier inventory access:', err);
            const msg = err?.response?.data?.error || err?.message || 'Failed to update access.';
            showToast(msg, 'error');
        } finally {
            setIsUpdatingAccess(false);
        }
    };

    const handleNavigateAllActivity = () => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('tab', 'reports');
            next.set('subtab', 'audit-logs');
            return next;
        });
        if (onNavigateSubTab) {
            onNavigateSubTab('audit-logs');
        }
    };

    const formatAccessChangeDisplay = (log: any) => {
        const act = (log.action || '').toUpperCase();
        let detailsObj: any = {};
        try {
            detailsObj = typeof log.details === 'string' ? JSON.parse(log.details) : log.details || {};
        } catch {
            detailsObj = {};
        }

        const targetName =
            detailsObj.target_name ||
            detailsObj.target_email ||
            detailsObj.name ||
            detailsObj.email ||
            'Staff Member';

        let title = '';
        let isGrant = false;
        let isRevoke = false;

        if (act === 'CASHIER_INVENTORY_ACCESS_GRANTED') {
            title = `Inventory access allowed for ${targetName}`;
            isGrant = true;
        } else if (act === 'CASHIER_INVENTORY_ACCESS_REVOKED') {
            title = `Inventory access removed for ${targetName}`;
            isRevoke = true;
        } else if (act.includes('STAFF_CREATE')) {
            title = `Staff account created for ${targetName}`;
        } else if (act.includes('STAFF_SUSPEND')) {
            title = `Staff account suspended for ${targetName}`;
            isRevoke = true;
        } else if (act.includes('STAFF_RESTORE')) {
            title = `Staff account restored for ${targetName}`;
            isGrant = true;
        } else if (act.includes('STAFF_UPDATE') || act.includes('ROLE')) {
            title = `Staff access updated for ${targetName}`;
        } else {
            title = `Access changed for ${targetName}`;
        }

        const actor = log.actor_name || log.actor_role || log.actor_email || 'Shop Admin';
        const dateFormatted = log.created_at
            ? new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  timeZone: 'Asia/Manila',
              }).format(new Date(log.created_at))
            : 'Recently';

        return {
            title,
            meta: `Changed by ${actor} · ${dateFormatted}`,
            isGrant,
            isRevoke,
        };
    };

    return (
        <div className="h-full min-h-0 flex flex-col gap-3 overflow-y-auto lg:overflow-hidden pb-28 sm:pb-32 lg:pb-6 touch-pan-y [-webkit-overflow-scrolling:touch] custom-scrollbar">
            {/* Toast Notification */}
            {toastMessage && (
                <div
                    className={`fixed top-4 right-4 z-50 px-3.5 py-2.5 rounded-sm border shadow-lg flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-top-4 ${
                        toastMessage.type === 'success'
                            ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-200'
                            : 'bg-red-950/95 border-red-500/40 text-red-200'
                    }`}
                >
                    {toastMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* Header & Sub-Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • Roles & Access</p>
                    <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">Roles & Access</h2>
                    <p className="text-ivory-dim text-xs mt-1">
                        Review operational roles and manage additional access for staff.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        void fetchStaff();
                        void fetchRecentAccessLogs();
                    }}
                    disabled={isLoadingStaff}
                    className="min-h-[38px] px-3.5 py-1.5 bg-charcoal-light border border-white/5 hover:border-gold/30 text-xs font-semibold text-ivory rounded-sm flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-3.5 h-3.5 text-gold ${isLoadingStaff ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                </button>
            </div>

            {/* Mobile SubHeaderNav (< lg) */}
            <div className="shrink-0 lg:hidden">
                <ManagementSubHeaderNav
                    activeSub="roles-access"
                    onSelect={(sub) => onNavigateSubTab?.(sub)}
                />
            </div>

            {/* Role Overview Cards: 3 Compact Operational Roles */}
            <div className="space-y-2 shrink-0">
                <div>
                    <h3 className="text-sm font-serif font-bold text-ivory">Role Overview</h3>
                    <p className="text-[11px] text-ivory-dim">
                        Summary of operational staff roles and their access scopes.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {SYSTEM_ROLES.map((role) => {
                        const Icon = role.icon;
                        const isCashier = role.id === 'cashier';
                        const staffCount = getRoleStaffCount(role.roleKey);

                        return (
                            <div
                                key={role.id}
                                className={`bg-charcoal-light border rounded-sm p-3.5 flex flex-col justify-between transition-all card-gold-accent ${
                                    isCashier
                                        ? 'border-gold/30 bg-gold/[0.02]'
                                        : 'border-white/5 hover:border-white/15'
                                }`}
                            >
                                <div className="space-y-2">
                                    {/* Top Row: Icon, Title & Assigned Count */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <div
                                                className={`w-7 h-7 rounded-sm flex items-center justify-center shrink-0 border ${
                                                    isCashier
                                                        ? 'bg-gold/15 text-gold border-gold/30'
                                                        : 'bg-white/5 text-ivory border-white/10'
                                                }`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <h3 className="font-bold text-ivory text-xs truncate">
                                                {role.name}
                                            </h3>
                                        </div>
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-sm bg-white/5 text-ivory-dim border border-white/5">
                                            {staffCount} {staffCount === 1 ? 'staff' : 'staff'}
                                        </span>
                                    </div>

                                    {/* Description */}
                                    <p className="text-[11px] text-ivory-dim leading-snug">
                                        {role.description}
                                    </p>

                                    {/* Main Access & Summary */}
                                    <div className="pt-2 border-t border-white/5 space-y-0.5 text-[11px]">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <span className="text-ivory-dim text-[10px]">Main Access:</span>
                                            <span className="font-semibold text-ivory truncate">{role.mainAccess}</span>
                                        </div>
                                        <p className="text-[10px] text-ivory-dim/70 leading-tight">
                                            {role.accessSummary}
                                        </p>
                                    </div>
                                </div>

                                {/* Compact View Details Button */}
                                <div className="mt-3 pt-2 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedRoleForDetail(role)}
                                        className="w-full py-1 text-center text-xs font-semibold text-gold hover:text-gold-light hover:underline cursor-pointer flex items-center justify-center gap-1 transition-colors"
                                    >
                                        <span>View Details</span>
                                        <ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Cashier Access Management Section: Additional Inventory Access */}
            <div className="bg-charcoal-light border border-white/5 rounded-sm p-3.5 sm:p-4 space-y-3 card-gold-accent shrink-0">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2.5 border-b border-white/5">
                    <div>
                        <div className="flex items-center gap-2">
                            <Store className="w-4 h-4 text-gold shrink-0" />
                            <h3 className="text-sm sm:text-base font-serif font-bold text-ivory">Additional Inventory Access</h3>
                        </div>
                        <p className="text-xs text-ivory-dim mt-0.5">
                            Allow selected cashiers to use Inventory alongside their regular duties.
                        </p>
                    </div>

                    {/* Search */}
                    <div className="relative w-full md:w-60">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ivory-dim pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search cashier…"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-charcoal border border-white/10 rounded-sm pl-8 pr-3 py-1.5 text-xs text-ivory placeholder:text-ivory-dim/50 focus:border-gold focus:outline-none"
                        />
                    </div>
                </div>

                {/* Cashier Table */}
                {isLoadingStaff ? (
                    <div className="py-6 flex flex-col items-center justify-center gap-2 text-ivory-dim text-xs">
                        <RefreshCw className="w-4 h-4 text-gold animate-spin" />
                        <span>Loading cashier directory…</span>
                    </div>
                ) : filteredCashiers.length === 0 ? (
                    <div className="py-6 text-center text-ivory-dim space-y-1">
                        <Store className="w-6 h-6 mx-auto text-ivory-dim/40" />
                        <p className="text-xs font-semibold text-ivory">No Cashier accounts found</p>
                        <p className="text-[11px] text-ivory-dim/70">
                            {searchTerm
                                ? 'No cashiers match your search query.'
                                : 'You currently do not have any staff members assigned to the Cashier role.'}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden sm:block overflow-x-auto border border-white/5 rounded-sm">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="border-b border-white/10 bg-charcoal/60 text-ivory-dim text-[11px] uppercase tracking-wider font-semibold">
                                        <th className="py-2.5 px-3.5">Cashier</th>
                                        <th className="py-2.5 px-3.5">Account Status</th>
                                        <th className="py-2.5 px-3.5">Inventory Access</th>
                                        <th className="py-2.5 px-3.5 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredCashiers.map((cashier) => {
                                        const hasInventoryAccess = Boolean(cashier.can_access_inventory);
                                        const isSuspended = Boolean(cashier.is_suspended);
                                        const displayName = cashier.name || cashier.username || 'Staff Member';

                                        return (
                                            <tr key={cashier.user_id || cashier.id} className="hover:bg-white/[0.02] transition-colors">
                                                {/* Cashier identity */}
                                                <td className="py-2.5 px-3.5">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-7 h-7 rounded-sm bg-gold/10 text-gold flex items-center justify-center font-bold text-xs shrink-0 border border-gold/20">
                                                            {displayName.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="font-semibold text-ivory text-xs truncate">
                                                                {displayName}
                                                            </div>
                                                            <div className="text-ivory-dim text-[10px] truncate">
                                                                {cashier.email || 'No email provided'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Account Status */}
                                                <td className="py-2.5 px-3.5 whitespace-nowrap">
                                                    {isSuspended ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                                                            <UserX className="w-3 h-3" />
                                                            Inactive
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                                            <UserCheck className="w-3 h-3" />
                                                            Active
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Inventory Access */}
                                                <td className="py-2.5 px-3.5 whitespace-nowrap">
                                                    {hasInventoryAccess ? (
                                                        <span className="inline-flex items-center gap-1.5 text-xs text-gold font-medium">
                                                            <Package className="w-3.5 h-3.5 text-gold" />
                                                            Allowed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 text-xs text-ivory-dim font-medium">
                                                            <Lock className="w-3.5 h-3.5 text-ivory-dim/60" />
                                                            Not Allowed
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Action */}
                                                <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                                    <button
                                                        type="button"
                                                        disabled={isSuspended}
                                                        onClick={() => handleOpenConfirmModal(cashier, !hasInventoryAccess)}
                                                        className={`min-h-[30px] px-3 py-1 rounded-sm text-xs font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                                            hasInventoryAccess
                                                                ? 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                                                                : 'bg-gold hover:bg-gold/90 text-charcoal font-bold'
                                                        }`}
                                                    >
                                                        {hasInventoryAccess ? 'Remove Access' : 'Allow Access'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile Stacked Cards View (< sm) */}
                        <div className="sm:hidden space-y-2.5">
                            {filteredCashiers.map((cashier) => {
                                const hasInventoryAccess = Boolean(cashier.can_access_inventory);
                                const isSuspended = Boolean(cashier.is_suspended);
                                const displayName = cashier.name || cashier.username || 'Staff Member';

                                return (
                                    <div
                                        key={cashier.user_id || cashier.id}
                                        className="bg-charcoal border border-white/5 rounded-sm p-3 space-y-2.5"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-8 h-8 rounded-sm bg-gold/10 text-gold flex items-center justify-center font-bold text-xs shrink-0 border border-gold/20">
                                                    {displayName.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-ivory text-xs truncate">
                                                        {displayName}
                                                    </div>
                                                    <div className="text-ivory-dim text-[10px] truncate">
                                                        {cashier.email || 'No email provided'}
                                                    </div>
                                                </div>
                                            </div>
                                            {isSuspended ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 shrink-0">
                                                    Inactive
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                                                    Active
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-white/5">
                                            <span className="text-ivory-dim text-[10px]">Inventory Access</span>
                                            {hasInventoryAccess ? (
                                                <span className="text-gold font-medium inline-flex items-center gap-1">
                                                    <Package className="w-3 h-3" />
                                                    Allowed
                                                </span>
                                            ) : (
                                                <span className="text-ivory-dim font-medium inline-flex items-center gap-1">
                                                    <Lock className="w-3 h-3" />
                                                    Not Allowed
                                                </span>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t border-white/5">
                                            <button
                                                type="button"
                                                disabled={isSuspended}
                                                onClick={() => handleOpenConfirmModal(cashier, !hasInventoryAccess)}
                                                className={`w-full min-h-[34px] py-1.5 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${
                                                    hasInventoryAccess
                                                        ? 'border border-red-500/30 text-red-300 hover:bg-red-500/10'
                                                        : 'bg-gold hover:bg-gold/90 text-charcoal font-bold'
                                                }`}
                                            >
                                                {hasInventoryAccess ? 'Remove Access' : 'Allow Access'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Recent Access Changes Section: Compact List */}
            <div className="bg-charcoal-light border border-white/5 rounded-sm p-3.5 sm:p-4 space-y-2.5 card-gold-accent shrink-0">
                <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gold shrink-0" />
                        <h3 className="text-sm font-serif font-bold text-ivory">Recent Access Changes</h3>
                    </div>
                    <button
                        type="button"
                        onClick={handleNavigateAllActivity}
                        className="text-xs font-semibold text-gold hover:text-gold-light hover:underline flex items-center gap-1 cursor-pointer transition-colors"
                    >
                        <span>View Audit Logs</span>
                        <ExternalLink className="w-3 h-3" />
                    </button>
                </div>

                {isLoadingLogs ? (
                    <div className="py-3 text-center text-ivory-dim text-xs">
                        <RefreshCw className="w-3.5 h-3.5 text-gold animate-spin inline-block mr-1.5" />
                        Loading recent changes…
                    </div>
                ) : relevantAccessLogs.length === 0 ? (
                    <div className="py-4 text-center text-xs space-y-0.5">
                        <p className="font-semibold text-ivory">No access changes yet</p>
                        <p className="text-ivory-dim text-[11px]">Staff role or permission changes will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {relevantAccessLogs.slice(0, 4).map((log, index) => {
                            const formatted = formatAccessChangeDisplay(log);

                            return (
                                <div
                                    key={log.id || log.audit_id || index}
                                    className="p-2.5 rounded-sm bg-charcoal border border-white/5 flex flex-col justify-between text-xs space-y-1"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <span
                                            className={`font-semibold text-xs ${
                                                formatted.isGrant
                                                    ? 'text-emerald-400'
                                                    : formatted.isRevoke
                                                    ? 'text-amber-400'
                                                    : 'text-ivory'
                                            }`}
                                        >
                                            {formatted.title}
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-ivory-dim/70 pt-1 border-t border-white/5">
                                        {formatted.meta}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Confirmation Dialog: Allow / Remove Inventory Access */}
            <Modal
                isOpen={Boolean(confirmingMember)}
                onClose={() => !isUpdatingAccess && setConfirmingMember(null)}
                title={
                    targetAccessState
                        ? 'Allow Inventory Access?'
                        : 'Remove Inventory Access?'
                }
            >
                <div className="space-y-4 text-xs text-ivory-dim">
                    <p className="text-ivory text-sm leading-relaxed">
                        {targetAccessState ? (
                            <>
                                <strong>{confirmingMember?.name || confirmingMember?.username || 'This staff member'}</strong> will be able to use Inventory in addition to Cashier.
                            </>
                        ) : (
                            <>
                                <strong>{confirmingMember?.name || confirmingMember?.username || 'This staff member'}</strong> will no longer be able to use Inventory. Their Cashier access will stay the same.
                            </>
                        )}
                    </p>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/10">
                        <button
                            type="button"
                            disabled={isUpdatingAccess}
                            onClick={() => setConfirmingMember(null)}
                            className="min-h-[34px] px-3.5 py-1.5 rounded-sm text-xs font-semibold bg-charcoal border border-white/10 text-ivory hover:border-white/20 cursor-pointer transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={isUpdatingAccess}
                            onClick={handleConfirmAccessChange}
                            className={`min-h-[34px] px-4 py-1.5 rounded-sm text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 ${
                                targetAccessState
                                    ? 'bg-gold hover:bg-gold/90 text-charcoal'
                                    : 'border border-red-500/40 text-red-300 hover:bg-red-500/10'
                            }`}
                        >
                            {isUpdatingAccess ? (
                                <span className="flex items-center gap-1.5">
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    Updating…
                                </span>
                            ) : targetAccessState ? (
                                'Allow Access'
                            ) : (
                                'Remove Access'
                            )}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Role Details Modal */}
            <Modal
                isOpen={Boolean(selectedRoleForDetail)}
                onClose={() => setSelectedRoleForDetail(null)}
                title={selectedRoleForDetail ? `${selectedRoleForDetail.name} — Role Details` : 'Role Details'}
            >
                {selectedRoleForDetail && (
                    <div className="space-y-4 text-xs text-ivory">
                        {/* Header snippet */}
                        <div className="flex items-center gap-2.5 p-3 rounded-sm bg-charcoal border border-white/10">
                            <div className="w-8 h-8 rounded-sm bg-gold/10 text-gold flex items-center justify-center font-bold shrink-0 border border-gold/20">
                                <selectedRoleForDetail.icon className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="text-ivory font-bold text-sm">{selectedRoleForDetail.name}</div>
                                <div className="text-[10px] text-ivory-dim">Operational Staff Role</div>
                            </div>
                        </div>

                        {/* What this role does */}
                        <div>
                            <h4 className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider mb-1">
                                What this role does
                            </h4>
                            <p className="text-xs text-ivory leading-relaxed">
                                {selectedRoleForDetail.purpose}
                            </p>
                        </div>

                        {/* Operational Scope & Permission Boundaries */}
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm space-y-2">
                            <h4 className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider flex items-center gap-1.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                                <span>Operational Scope & Permission Boundaries</span>
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div className="p-2.5 rounded bg-emerald-950/20 border border-emerald-500/20">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-emerald-400 block mb-1">
                                        Granted Operational Scope
                                    </span>
                                    <ul className="space-y-1 text-[11px] text-ivory-dim">
                                        {selectedRoleForDetail.grantedScope.map((item, i) => (
                                            <li key={i} className="flex items-start gap-1.5">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="p-2.5 rounded bg-rose-950/20 border border-rose-500/20">
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-rose-400 block mb-1">
                                        Protected Boundaries
                                    </span>
                                    <ul className="space-y-1 text-[11px] text-ivory-dim">
                                        {selectedRoleForDetail.restrictedBoundaries.map((item, i) => (
                                            <li key={i} className="flex items-start gap-1.5">
                                                <Lock className="w-3 h-3 text-rose-400 shrink-0 mt-0.5" />
                                                <span>{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>

                        {/* What areas it can access */}
                        <div>
                            <h4 className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider mb-1.5">
                                Accessible areas
                            </h4>
                            <ul className="space-y-1 text-xs text-ivory-dim">
                                {selectedRoleForDetail.accessibleAreas.map((area, i) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                                        <span>{area}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* What actions it can perform */}
                        <div>
                            <h4 className="text-[10px] uppercase font-bold text-ivory-dim tracking-wider mb-1.5">
                                Actions it can perform
                            </h4>
                            <ul className="space-y-1 text-xs text-ivory-dim">
                                {selectedRoleForDetail.capabilities.map((cap, i) => (
                                    <li key={i} className="flex items-start gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0 mt-1.5" />
                                        <span>{cap}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Additional access & status */}
                        <div className="pt-2 border-t border-white/10 space-y-2 text-xs">
                            <div>
                                <span className="text-[10px] font-bold text-ivory-dim uppercase tracking-wider block">
                                    Can additional access be granted?
                                </span>
                                <p className="text-ivory mt-0.5">{selectedRoleForDetail.additionalAccessText}</p>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-ivory-dim uppercase tracking-wider block">
                                    Access Status
                                </span>
                                <p className="text-ivory-dim mt-0.5">{selectedRoleForDetail.accessStatusText}</p>
                            </div>
                        </div>

                        {/* Close button */}
                        <div className="pt-2 border-t border-white/10 flex justify-end">
                            <button
                                type="button"
                                onClick={() => setSelectedRoleForDetail(null)}
                                className="min-h-[34px] px-3.5 py-1.5 rounded-sm text-xs font-semibold bg-charcoal border border-white/10 text-ivory hover:border-white/20 cursor-pointer transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default RolesAndAccessTab;
