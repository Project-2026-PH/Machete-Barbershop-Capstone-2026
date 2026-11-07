import React, { useState, useEffect, useMemo } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { SteppingPagination } from '@/components/ui/SteppingPagination';
import { Modal } from '@/components/feedback/Modal';
import {
    Download,
    Search,
    Clock,
    AlertTriangle,
    Shield,
    CheckCircle,
    XCircle,
    Filter,
    ArrowUpDown,
    Eye,
    KeyRound,
    UserCog,
    Layers,
    Sliders,
    Globe,
    FileText,
    Calendar,
    RefreshCw,
    RotateCcw,
    X
} from 'lucide-react';
import { api } from '@/config/api';
import { formatManilaAuditTimestamp } from '@/utils/manila-date';

interface AuditLogsProps {
    auditFilter?: string;
    setAuditFilter?: (filter: string) => void;
    initialSearch?: string;
}

export const AuditLogs: React.FC<AuditLogsProps> = ({
    auditFilter = '',
    setAuditFilter,
    initialSearch = '',
}) => {
    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [auditStats, setAuditStats] = useState({ total_24h: 0, failed_24h: 0, auth_24h: 0 });
    const [auditPage, setAuditPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [searchTerm, setSearchTerm] = useState(auditFilter || initialSearch);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedRole, setSelectedRole] = useState('all');
    const [selectedStatus, setSelectedStatus] = useState('all');
    const [sortBy, setSortBy] = useState('timestamp_desc');

    // Details Modal State
    const [selectedLog, setSelectedLog] = useState<any | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    // Sync external filter if passed
    useEffect(() => {
        if (auditFilter !== undefined && auditFilter !== searchTerm) {
            setSearchTerm(auditFilter);
        }
    }, [auditFilter]);

    // Fetch audit logs and stats
    const fetchAuditData = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(auditPage),
                limit: '10',
                roleFilter: selectedRole,
                statusFilter: selectedStatus,
                sortBy: sortBy,
            });

            if (searchTerm.trim()) {
                params.append('filter', searchTerm.trim());
            }

            const [logsRes, statsRes] = await Promise.all([
                api.get(`/api/system-admin/audit-logs?${params.toString()}`),
                api.get('/api/system-admin/audit-logs/stats?range=24h'),
            ]);

            const logsData = logsRes.data;
            setAuditLogs(logsData.logs || []);
            setTotalCount(logsData.pagination?.total || 0);
            setTotalPages(logsData.pagination?.pages || 1);
            setAuditStats(statsRes.data || { total_24h: 0, failed_24h: 0, auth_24h: 0 });
        } catch (err) {
            console.error('[AuditLogs] Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handler = setTimeout(() => {
            fetchAuditData();
        }, 250);
        return () => clearTimeout(handler);
    }, [auditPage, searchTerm, selectedRole, selectedStatus, sortBy]);

    // Categorize an action string into administrative classification (DemoShop Charcoal & Gold Standard)
    const categorizeAction = (action = '', resource = ''): { category: string; color: string; label: string } => {
        const act = action.toUpperCase();
        const res = resource.toUpperCase();

        if (act.includes('LOGIN') || act.includes('LOGOUT') || act.includes('AUTH')) {
            return { category: 'AUTHENTICATION', color: 'text-gold bg-gold/15 border-gold/30', label: 'Auth' };
        }
        if (act.includes('PASSWORD') || act.includes('RESET')) {
            return { category: 'CREDENTIALS', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30', label: 'Credentials' };
        }
        if (act.includes('ROLE') || act.includes('PROMOTE') || act.includes('DEMOTE')) {
            return { category: 'ROLE_PERMISSION', color: 'text-gold bg-gold/15 border-gold/30', label: 'Role & Perms' };
        }
        if (act.includes('SUSPEND') || act.includes('RESTORE') || act.includes('USER_') || act.includes('ADMIN_') || act.includes('STAFF_')) {
            return { category: 'ACCOUNT', color: 'text-gold bg-gold/15 border-gold/30', label: 'Account' };
        }
        if (act.includes('FEATURE') || res.includes('FEATURE')) {
            return { category: 'FEATURE_MANAGEMENT', color: 'text-gold bg-gold/15 border-gold/30', label: 'Feature Gate' };
        }
        if (act.includes('SETTINGS') || act.includes('SHOP') || res.includes('SETTINGS')) {
            return { category: 'CONFIGURATION', color: 'text-gold-dim bg-gold/10 border-gold/20', label: 'Configuration' };
        }
        if (act.includes('INVENTORY') || act.includes('STOCK')) {
            return { category: 'INVENTORY', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', label: 'Inventory' };
        }
        return { category: 'SYSTEM_SECURITY', color: 'text-gold-dim bg-white/5 border-gold/20', label: 'System' };
    };

    // Client-side category filtering on the loaded page if category selected
    const filteredLogs = useMemo(() => {
        if (selectedCategory === 'all') return auditLogs;
        return auditLogs.filter(log => {
            const { category } = categorizeAction(log.action, log.resource);
            return category === selectedCategory;
        });
    }, [auditLogs, selectedCategory]);

    const formatActionName = (action: string) => {
        return (action || '')
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
    };

    const parseDetails = (detailsRaw: any) => {
        if (!detailsRaw) return null;
        if (typeof detailsRaw === 'object') return detailsRaw;
        try {
            return JSON.parse(detailsRaw);
        } catch {
            return { raw: String(detailsRaw) };
        }
    };

    const exportToCSV = () => {
        if (!auditLogs.length) return;
        const headers = ['Audit ID', 'Timestamp (UTC)', 'Action', 'Category', 'Actor Email', 'Actor Role', 'Status', 'IP Address', 'Resource', 'Details'];
        const rows = auditLogs.map(log => [
            log.audit_id,
            log.created_at,
            log.action,
            categorizeAction(log.action, log.resource).category,
            log.actor_email || 'System',
            log.actor_role || 'System',
            log.status,
            log.ip_address || '',
            log.resource || '',
            typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '').replace(/"/g, '""'),
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' +
            [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `DemoShop_Audit_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const hasActiveFilters = 
        Boolean(searchTerm.trim()) || 
        selectedCategory !== 'all' || 
        selectedRole !== 'all' || 
        selectedStatus !== 'all';

    const handleResetFilters = () => {
        setSearchTerm('');
        if (setAuditFilter) setAuditFilter('');
        setSelectedCategory('all');
        setSelectedRole('all');
        setSelectedStatus('all');
        setAuditPage(1);
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header with Title and CSV Export */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-charcoal-light border border-white/5 p-5 rounded-sm card-gold-accent">
                <div>
                    <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2">
                        <Shield className="w-5 h-5 text-gold" /> System Audit & Security Console
                    </h3>
                    <p className="text-ivory-dim text-xs mt-0.5">
                        Immutable, append-only chronological record of administrative actions, credential resets, and security events.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={exportToCSV}
                        disabled={loading || auditLogs.length === 0}
                        className="text-xs flex items-center gap-2 hover:text-gold cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5 text-gold" />
                        Export Audit CSV
                    </Button>
                </div>
            </div>

            {/* Top Metric Cards (Backed by real 24h stats) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Total Events (24h) */}
                <div className="bg-charcoal-light border border-white/5 p-4 rounded-sm card-gold-accent hover:border-gold/30 transition-all">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-gold/10 border border-gold/20 text-gold">
                            <Clock className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">
                            24 Hours
                        </span>
                    </div>
                    <div className="text-2xl font-serif font-bold text-ivory mb-0.5">
                        {loading && auditLogs.length === 0 ? <Skeleton className="h-7 w-16" /> : auditStats.total_24h}
                    </div>
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Total Audit Events</p>
                </div>

                {/* Failed / Security Actions (24h) */}
                <div className="bg-charcoal-light border border-white/5 p-4 rounded-sm card-gold-accent">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400">
                            <AlertTriangle className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${auditStats.failed_24h > 0 ? 'bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse' : 'bg-white/5 text-ivory-dim'}`}>
                            {auditStats.failed_24h > 0 ? `${auditStats.failed_24h} Failed` : 'None'}
                        </span>
                    </div>
                    <div className="text-2xl font-serif font-bold text-red-400 mb-0.5">
                        {loading && auditLogs.length === 0 ? <Skeleton className="h-7 w-16" /> : auditStats.failed_24h}
                    </div>
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Failed / Denied Operations</p>
                </div>

                {/* Authentication Events (24h) */}
                <div className="bg-charcoal-light border border-white/5 p-4 rounded-sm card-gold-accent">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-gold/10 border border-gold/20 text-gold">
                            <Shield className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">
                            Security
                        </span>
                    </div>
                    <div className="text-2xl font-serif font-bold text-gold mb-0.5">
                        {loading && auditLogs.length === 0 ? <Skeleton className="h-7 w-16" /> : auditStats.auth_24h}
                    </div>
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Authentication Cycles</p>
                </div>
            </div>

            {/* Filter and Query Tray */}
            <div className="bg-charcoal-light border border-white/5 p-3.5 rounded-sm card-gold-accent flex flex-wrap items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-ivory-dim absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            if (setAuditFilter) setAuditFilter(e.target.value);
                            setAuditPage(1);
                        }}
                        placeholder="Filter by action, user email, actor, IP address, or resource..."
                        className="w-full bg-charcoal border border-white/10 rounded-sm py-1.5 pl-9 pr-3 text-xs text-ivory placeholder-ivory-dim/60 focus:border-gold focus:ring-1 focus:ring-gold/30 focus:outline-none"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => {
                                setSearchTerm('');
                                if (setAuditFilter) setAuditFilter('');
                            }}
                            aria-label="Clear search input"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory text-xs cursor-pointer p-0.5"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Event Category Filter */}
                    <div className="relative">
                        <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            aria-label="Filter audit logs by event category"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="all">Category: All</option>
                            <option value="ACCOUNT">Accounts</option>
                            <option value="AUTHENTICATION">Authentication</option>
                            <option value="CREDENTIALS">Credentials</option>
                            <option value="ROLE_PERMISSION">Role & Permissions</option>
                            <option value="FEATURE_MANAGEMENT">System Controls</option>
                            <option value="CONFIGURATION">Configuration</option>
                            <option value="INVENTORY">Inventory</option>
                            <option value="SYSTEM_SECURITY">System / Security</option>
                        </select>
                    </div>

                    {/* Actor Role Filter */}
                    <div className="relative">
                        <select
                            value={selectedRole}
                            onChange={(e) => { setSelectedRole(e.target.value); setAuditPage(1); }}
                            aria-label="Filter audit logs by actor role"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="all">Actor Role: All</option>
                            <option value="System Admin">System Admin</option>
                            <option value="Owner">Owner</option>
                            <option value="Shop Admin">Shop Admin</option>
                            <option value="Cashier">Cashier</option>
                            <option value="Barber">Barber</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="relative">
                        <select
                            value={selectedStatus}
                            onChange={(e) => { setSelectedStatus(e.target.value); setAuditPage(1); }}
                            aria-label="Filter audit logs by outcome status"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="all">Status: All</option>
                            <option value="SUCCESS">SUCCESS</option>
                            <option value="FAILURE">FAILURE</option>
                        </select>
                    </div>

                    {/* Sort Order */}
                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => { setSortBy(e.target.value); setAuditPage(1); }}
                            aria-label="Sort audit logs"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="timestamp_desc">Newest First</option>
                            <option value="timestamp_asc">Oldest First</option>
                            <option value="action_asc">Action (A-Z)</option>
                            <option value="action_desc">Action (Z-A)</option>
                        </select>
                    </div>

                    {/* Reset Filters Action Button */}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            title="Reset all search queries and filter constraints"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-white/5 hover:bg-gold/15 border border-white/10 hover:border-gold/30 text-ivory hover:text-gold text-xs font-medium transition-all cursor-pointer shadow-sm"
                        >
                            <RotateCcw className="w-3 h-3 text-gold" />
                            Reset Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Active Filter Notification Banner */}
            {searchTerm.trim() && (
                <div className="flex items-center justify-between p-2.5 rounded bg-gold/10 border border-gold/20 text-xs text-gold animate-fade-in">
                    <span className="flex items-center gap-1.5 font-medium">
                        <Filter className="w-3.5 h-3.5 shrink-0" />
                        <span>Filtering audit records matching: <strong className="font-mono text-ivory">"{searchTerm.trim()}"</strong></span>
                    </span>
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            if (setAuditFilter) setAuditFilter('');
                        }}
                        className="text-[11px] text-gold hover:text-gold-light hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                    >
                        <X className="w-3 h-3" /> Clear Filter
                    </button>
                </div>
            )}

            {/* Audit Logs Table */}
            <div className="bg-charcoal-light border border-white/5 rounded-sm overflow-hidden card-gold-accent">
                {/* Desktop View */}
                <div className="hidden lg:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-white/[0.03] text-ivory-dim uppercase tracking-widest text-[10px] border-b border-white/5">
                            <tr>
                                <th className="px-5 py-3 font-semibold">Timestamp (PHT / Manila)</th>
                                <th className="px-4 py-3 font-semibold">Action & Category</th>
                                <th className="px-4 py-3 font-semibold">Actor (Who)</th>
                                <th className="px-4 py-3 font-semibold">Target / Resource</th>
                                <th className="px-4 py-3 font-semibold">Outcome</th>
                                <th className="px-4 py-3 font-semibold">IP Address</th>
                                <th className="px-4 py-3 font-semibold text-right">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading && filteredLogs.length === 0 ? (
                                [1, 2, 3, 4, 5].map(i => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-5 py-3.5"><div className="h-4 w-28 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-36 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-32 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-20 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-16 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-24 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5 text-right"><div className="h-4 w-8 bg-white/10 rounded ml-auto" /></td>
                                    </tr>
                                ))
                            ) : filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-5 py-12 text-center text-ivory-dim">
                                        <div className="max-w-xs mx-auto space-y-2">
                                            <p className="text-sm font-semibold text-ivory">No matching audit events</p>
                                            <p className="text-xs text-ivory-dim/70">
                                                No administrative events match your search query or active filter settings.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => {
                                    const { category, color: catColor, label: catLabel } = categorizeAction(log.action, log.resource);
                                    const isFailed = log.status === 'FAILURE' || log.action?.includes('FAIL') || log.action?.includes('ERROR');
                                    const parsed = parseDetails(log.details);
                                    const targetIdentifier = parsed?.updated_user_id || parsed?.suspended_user_id || parsed?.reset_user_id || parsed?.email || log.resource;

                                    return (
                                        <tr
                                            key={log.audit_id}
                                            onClick={() => { setSelectedLog(log); setIsDetailModalOpen(true); }}
                                            className="hover:bg-gold/[0.04] transition-colors cursor-pointer group"
                                        >
                                            {/* Timestamp (Philippine Standard Time / Manila) */}
                                            {(() => {
                                                const ts = formatManilaAuditTimestamp(log.created_at, 'split');
                                                return (
                                                    <td className="px-5 py-3.5 font-mono text-[11px] whitespace-nowrap">
                                                        <div className="text-ivory font-medium">{ts.date}</div>
                                                        <div className="text-ivory-dim text-[10px] flex items-center gap-1">
                                                            <span>{ts.time}</span>
                                                            <span className="text-gold font-bold text-[9px] px-1 py-0.2 rounded bg-gold/10 border border-gold/20">{ts.tz}</span>
                                                        </div>
                                                    </td>
                                                );
                                            })()}

                                            {/* Action & Category */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-2">
                                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${catColor}`}>
                                                        {catLabel}
                                                    </span>
                                                    <span className="font-semibold text-ivory group-hover:text-gold transition-colors">
                                                        {formatActionName(log.action)}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Actor */}
                                            <td className="px-4 py-3.5">
                                                <div className="min-w-0">
                                                    <div className="font-medium text-ivory truncate">
                                                        {log.actor_name || log.actor_email || 'System Automation'}
                                                    </div>
                                                    {log.actor_role && (
                                                        <div className="text-[10px] text-ivory-dim font-mono">
                                                            {log.actor_role}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Target / Resource */}
                                            <td className="px-4 py-3.5 text-ivory-dim font-mono text-[11px]">
                                                {targetIdentifier ? (
                                                    <span className="truncate block max-w-[140px]" title={String(targetIdentifier)}>
                                                        {String(targetIdentifier)}
                                                    </span>
                                                ) : (
                                                    <span className="text-ivory-dim/40">-</span>
                                                )}
                                            </td>

                                            {/* Outcome Status */}
                                            <td className="px-4 py-3.5">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    isFailed
                                                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                }`}>
                                                    {isFailed ? <XCircle className="w-2.5 h-2.5" /> : <CheckCircle className="w-2.5 h-2.5" />}
                                                    {isFailed ? 'FAILURE' : 'SUCCESS'}
                                                </span>
                                            </td>

                                            {/* IP Address */}
                                            <td className="px-4 py-3.5 font-mono text-[11px] text-ivory-dim">
                                                {log.ip_address || '-'}
                                            </td>

                                            {/* Inspect Button */}
                                            <td className="px-4 py-3.5 text-right">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedLog(log);
                                                        setIsDetailModalOpen(true);
                                                    }}
                                                    className="p-1 rounded bg-white/5 hover:bg-gold/15 text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View (Cards) */}
                <div className="lg:hidden divide-y divide-white/5">
                    {loading && filteredLogs.length === 0 ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="p-4 space-y-2.5 animate-pulse">
                                <div className="h-4 w-1/3 bg-white/10 rounded" />
                                <div className="h-3 w-2/3 bg-white/5 rounded" />
                            </div>
                        ))
                    ) : filteredLogs.length === 0 ? (
                        <div className="p-6 text-center text-ivory-dim text-xs">
                            No matching audit logs found.
                        </div>
                    ) : (
                        filteredLogs.map(log => {
                            const { color: catColor, label: catLabel } = categorizeAction(log.action, log.resource);
                            const isFailed = log.status === 'FAILURE' || log.action?.includes('FAIL') || log.action?.includes('ERROR');

                            return (
                                <div
                                    key={log.audit_id}
                                    onClick={() => { setSelectedLog(log); setIsDetailModalOpen(true); }}
                                    className="p-4 space-y-2 hover:bg-gold/[0.03] transition-colors cursor-pointer"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${catColor}`}>
                                            {catLabel}
                                        </span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isFailed ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                            {isFailed ? 'FAILURE' : 'SUCCESS'}
                                        </span>
                                    </div>
                                    <div className="font-semibold text-ivory text-xs">{formatActionName(log.action)}</div>
                                    <div className="flex items-center justify-between text-[11px] text-ivory-dim">
                                        <span>Actor: {log.actor_name || log.actor_email || 'System'}</span>
                                        <span className="font-mono text-[10px] text-ivory-dim">{formatManilaAuditTimestamp(log.created_at, 'time-only')}</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Stepping Pagination */}
            <SteppingPagination
                currentPage={auditPage}
                totalPages={totalPages}
                onPageChange={setAuditPage}
            />

            {/* --- EVENT DETAIL DRAWER / MODAL --- */}
            {isDetailModalOpen && selectedLog && (
                <Modal
                    isOpen={isDetailModalOpen}
                    onClose={() => { setIsDetailModalOpen(false); setSelectedLog(null); }}
                    title={`Audit Event Details — #${selectedLog.audit_id}`}
                >
                    <div className="space-y-4 text-xs">
                        {/* Event Header Card */}
                        <div className="p-4 rounded bg-charcoal border border-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${categorizeAction(selectedLog.action, selectedLog.resource).color}`}>
                                    {categorizeAction(selectedLog.action, selectedLog.resource).category}
                                </span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    selectedLog.status === 'FAILURE'
                                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                }`}>
                                    {selectedLog.status}
                                </span>
                            </div>
                            <h4 className="text-base font-bold text-ivory">{formatActionName(selectedLog.action)}</h4>
                            <div className="flex items-center gap-2 text-ivory-dim text-[11px]">
                                <Clock className="w-3.5 h-3.5 text-gold" />
                                <span className="font-mono text-ivory">{formatManilaAuditTimestamp(selectedLog.created_at, 'inline')}</span>
                            </div>
                        </div>

                        {/* Actor & Origin Grid */}
                        <div className="grid grid-cols-2 gap-3 bg-white/[0.02] p-3.5 rounded border border-white/5">
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider">Actor Email</span>
                                <span className="font-mono text-ivory text-[11px]">{selectedLog.actor_email || 'System Automation'}</span>
                            </div>
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider">Actor Role</span>
                                <span className="text-ivory font-semibold">{selectedLog.actor_role || 'Root Automation'}</span>
                            </div>
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider">IP Address</span>
                                <span className="font-mono text-gold text-[11px]">{selectedLog.ip_address || 'Internal Localhost'}</span>
                            </div>
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider">Resource Target</span>
                                <span className="font-mono text-ivory text-[11px]">{selectedLog.resource || 'Generic'}</span>
                            </div>
                            {selectedLog.user_agent && (
                                <div className="col-span-2">
                                    <span className="text-ivory-dim block text-[10px] uppercase tracking-wider">User Agent</span>
                                    <span className="font-mono text-ivory-dim text-[10px] break-all">{selectedLog.user_agent}</span>
                                </div>
                            )}
                        </div>

                        {/* Structured Event Details / Payload */}
                        {(() => {
                            const parsed = parseDetails(selectedLog.details);
                            if (!parsed || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
                                return (
                                    <div className="p-3 bg-charcoal rounded border border-white/5 text-[11px] text-ivory-dim italic">
                                        No additional parameter details were captured for this event.
                                    </div>
                                );
                            }

                            return (
                                <div className="space-y-3">
                                    {/* Structured Field Changes if recorded */}
                                    {parsed.changes && typeof parsed.changes === 'object' && Object.keys(parsed.changes).length > 0 && (
                                        <div className="p-3 bg-white/[0.02] border border-white/10 rounded space-y-2">
                                            <span className="text-gold block text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                <ArrowUpDown className="w-3.5 h-3.5" /> Field Level Changes
                                            </span>
                                            <div className="space-y-1.5">
                                                {Object.entries(parsed.changes).map(([field, diff]: [string, any]) => (
                                                    <div key={field} className="grid grid-cols-3 gap-2 p-2 rounded bg-charcoal text-[11px] items-center border border-white/5">
                                                        <span className="font-semibold text-ivory capitalize">{field}</span>
                                                        <div className="text-red-400 font-mono truncate text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title={String(diff?.from ?? 'null')}>
                                                            {String(diff?.from ?? 'null')}
                                                        </div>
                                                        <div className="text-emerald-400 font-mono truncate text-[10px] bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20" title={String(diff?.to ?? 'null')}>
                                                            {String(diff?.to ?? 'null')}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Feature Governance Context if recorded */}
                                    {(parsed.featureId || parsed.feature_id || parsed.featureName) && (
                                        <div className="p-3 bg-white/[0.02] border border-white/10 rounded space-y-1.5">
                                            <span className="text-gold block text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                                                <Sliders className="w-3.5 h-3.5" /> Feature Governance Context
                                            </span>
                                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                {(parsed.featureName || parsed.featureId || parsed.feature_id) && (
                                                    <div>
                                                        <span className="text-ivory-dim text-[10px] block">Feature</span>
                                                        <span className="text-ivory font-semibold">{parsed.featureName || parsed.featureId || parsed.feature_id}</span>
                                                    </div>
                                                )}
                                                {(parsed.featureId || parsed.feature_id) && (
                                                    <div>
                                                        <span className="text-ivory-dim text-[10px] block">Identifier</span>
                                                        <span className="font-mono text-gold">{parsed.featureId || parsed.feature_id}</span>
                                                    </div>
                                                )}
                                                {parsed.targetRole && (
                                                    <div>
                                                        <span className="text-ivory-dim text-[10px] block">Target Role</span>
                                                        <span className="font-semibold text-ivory">{parsed.targetRole}</span>
                                                    </div>
                                                )}
                                                {parsed.currentStatus !== undefined && (
                                                    <div>
                                                        <span className="text-ivory-dim text-[10px] block">Current Status</span>
                                                        <span className="font-mono text-ivory">{String(parsed.currentStatus)}</span>
                                                    </div>
                                                )}
                                                {parsed.previousStatus !== undefined && (
                                                    <div>
                                                        <span className="text-ivory-dim text-[10px] block">Previous Status</span>
                                                        <span className="font-mono text-ivory">{String(parsed.previousStatus)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Raw JSON Payload (Collapsible) */}
                                    <details className="group border border-white/5 rounded bg-charcoal">
                                        <summary className="p-2.5 text-[10px] text-ivory-dim uppercase tracking-wider font-semibold cursor-pointer hover:text-gold select-none flex items-center justify-between">
                                            <span>Diagnostic Payload (JSON)</span>
                                            <span className="text-[9px] text-ivory-dim font-mono group-open:rotate-90 transition-transform">▸</span>
                                        </summary>
                                        <div className="p-3 pt-0 overflow-x-auto max-h-48 font-mono text-[11px] text-ivory">
                                            <pre className="whitespace-pre-wrap">
                                                {JSON.stringify(parsed, null, 2)}
                                            </pre>
                                        </div>
                                    </details>
                                </div>
                            );
                        })()}

                        <div className="flex justify-end pt-2">
                            <Button
                                variant="primary"
                                onClick={() => setIsDetailModalOpen(false)}
                                className="text-xs bg-gold hover:bg-gold-light text-charcoal font-bold shadow-md shadow-gold/20"
                            >
                                Close Inspection
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default AuditLogs;
