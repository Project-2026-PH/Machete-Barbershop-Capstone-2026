import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Wrench,
    Shield,
    ShieldCheck,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Database,
    Search,
    Users,
    Sliders,
    Info,
    Clock,
    ArrowRight,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    Activity,
    UserCheck,
    Layers,
    FlaskConical
} from 'lucide-react';
import { api } from '@/config/api';
import { formatManilaAuditTimestamp } from '@/utils/manila-date';
import { Button } from '@/components/ui/Button';
import { DemoTestingTab } from './diagnostics/DemoTestingTab';
import type {
    IntegrityReport,
    UserAccessInspection,
    FeatureAccessEvaluation,
    DiagnosticsSessionInfo,
    IntegrityCheckResult
} from '@demoshop/shared-types';

interface DiagnosticsProps {
    setActiveTab: (tab: string) => void;
    onNavigateControlsSubTab?: (subTab: 'features' | 'access' | 'content') => void;
}

interface UserSearchResult {
    user_id: string;
    username: string;
    email: string;
    role: string;
    is_verified?: boolean;
    created_at?: string;
}

export const Diagnostics: React.FC<DiagnosticsProps> = ({
    setActiveTab,
    onNavigateControlsSubTab
}) => {
    const [activeSubTab, setActiveSubTab] = useState<'overview' | 'access' | 'integrity' | 'demo'>('overview');

    // ── Session Diagnostics State ─────────────────────────────
    const [sessionInfo, setSessionInfo] = useState<DiagnosticsSessionInfo | null>(null);

    // ── Access Inspector State ────────────────────────────────
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
    const [isSearchingUsers, setIsSearchingUsers] = useState(false);
    const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
    const [userAccessInspection, setUserAccessInspection] = useState<UserAccessInspection | null>(null);
    const [isLoadingAccess, setIsLoadingAccess] = useState(false);
    const [accessFilter, setAccessFilter] = useState<'ALL' | 'ALLOWED' | 'DENIED'>('ALL');
    const [featureFilterQuery, setFeatureFilterQuery] = useState('');
    const [accessError, setAccessError] = useState<string | null>(null);

    // ── Data Integrity State ──────────────────────────────────
    const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
    const [isRunningIntegrity, setIsRunningIntegrity] = useState(false);
    const [integrityError, setIntegrityError] = useState<string | null>(null);
    const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

    // ── Load Session Diagnostics on Mount ─────────────────────
    useEffect(() => {
        api.get<DiagnosticsSessionInfo>('/api/system-admin/diagnostics/session-info')
            .then((res) => setSessionInfo(res.data))
            .catch(() => {
                // Silently fallback if session info endpoint unavailable
            });
    }, []);

    // ── User Search Handler (Debounced) ───────────────────────
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (!query.trim()) {
            setSearchResults([]);
            return;
        }

        searchTimeoutRef.current = setTimeout(async () => {
            setIsSearchingUsers(true);
            try {
                const res = await api.get<{ users: UserSearchResult[] }>('/api/system-admin/users', {
                    params: { search: query.trim(), limit: 8 },
                });
                setSearchResults(res.data?.users || []);
            } catch (err) {
                console.error('[Diagnostics] Failed to search users:', err);
                setSearchResults([]);
            } finally {
                setIsSearchingUsers(false);
            }
        }, 300);
    };

    // ── Inspect Access for Selected User ──────────────────────
    const handleSelectUser = async (user: UserSearchResult) => {
        setSelectedUser(user);
        setSearchQuery('');
        setSearchResults([]);
        setIsLoadingAccess(true);
        setAccessError(null);

        try {
            const res = await api.get<UserAccessInspection>(`/api/system-admin/diagnostics/access/${user.user_id}`);
            setUserAccessInspection(res.data);
        } catch (err: any) {
            console.error('[Diagnostics] Failed to inspect user access:', err);
            setAccessError(err.response?.data?.error || 'Failed to inspect user authorization state.');
            setUserAccessInspection(null);
        } finally {
            setIsLoadingAccess(false);
        }
    };

    // ── Run Data Integrity Checks ─────────────────────────────
    const runIntegrityChecks = useCallback(async () => {
        setIsRunningIntegrity(true);
        setIntegrityError(null);

        try {
            const res = await api.get<IntegrityReport>('/api/system-admin/diagnostics/integrity');
            setIntegrityReport(res.data);
        } catch (err: any) {
            console.error('[Diagnostics] Integrity check failed:', err);
            setIntegrityError(err.response?.data?.error || 'Database integrity scan could not be completed.');
        } finally {
            setIsRunningIntegrity(false);
        }
    }, []);

    // ── Filtered Access Features ──────────────────────────────
    const filteredFeatures = (userAccessInspection?.features || []).filter((f) => {
        if (accessFilter === 'ALLOWED' && f.effectiveAccess !== 'ALLOWED') return false;
        if (accessFilter === 'DENIED' && f.effectiveAccess !== 'DENIED') return false;
        if (featureFilterQuery.trim()) {
            const q = featureFilterQuery.toLowerCase();
            return (
                f.featureName.toLowerCase().includes(q) ||
                f.featureId.toLowerCase().includes(q) ||
                f.category.toLowerCase().includes(q)
            );
        }
        return true;
    });

    const allowedCount = (userAccessInspection?.features || []).filter((f) => f.effectiveAccess === 'ALLOWED').length;
    const deniedCount = (userAccessInspection?.features || []).filter((f) => f.effectiveAccess === 'DENIED').length;

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-5xl mx-auto pb-12 select-none">
            {/* Top Header Card */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 sm:p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                            <Wrench className="w-5 h-5 text-gold" />
                            <h2 className="text-lg sm:text-xl font-serif font-bold text-ivory tracking-wide">
                                System Diagnostics
                            </h2>
                        </div>
                        <p className="text-xs text-ivory-dim/80">
                            Troubleshoot user access, inspect authorization chains, and verify database referential integrity.
                        </p>
                    </div>

                    {/* Sub-Tab Switcher */}
                    <div className="flex items-center gap-1 bg-white/5 p-1 rounded-sm border border-white/10 self-start sm:self-auto">
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('overview')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                                activeSubTab === 'overview'
                                    ? 'bg-gold text-charcoal font-bold shadow-md shadow-gold/20'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            Overview
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('access')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                                activeSubTab === 'access'
                                    ? 'bg-gold text-charcoal font-bold shadow-md shadow-gold/20'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            Access Inspector
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('integrity')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                                activeSubTab === 'integrity'
                                    ? 'bg-gold text-charcoal font-bold shadow-md shadow-gold/20'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            Data Integrity
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubTab('demo')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                                activeSubTab === 'demo'
                                    ? 'bg-gold text-charcoal font-bold shadow-md shadow-gold/20'
                                    : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                            }`}
                        >
                            Demo &amp; Testing
                        </button>
                    </div>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 1: OVERVIEW                                              */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'overview' && (
                <div className="space-y-6">
                    {/* Diagnostic Categories Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* 1. Authorization & Access Inspector */}
                        <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-gold/30 transition-colors">
                            <div className="space-y-2">
                                <div className="p-2.5 rounded-sm bg-white/5 border border-white/10 text-gold w-fit">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-ivory tracking-wide">
                                    User Access Inspector
                                </h3>
                                <p className="text-xs text-ivory-dim/70 font-sans leading-relaxed">
                                    Inspect why an account is allowed or denied feature access. Evaluates global flags, compatibility rules, and role permissions.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setActiveSubTab('access')}
                                className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-9"
                            >
                                <span>Inspect Access</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {/* 2. Data Integrity */}
                        <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-gold/30 transition-colors">
                            <div className="space-y-2">
                                <div className="p-2.5 rounded-sm bg-white/5 border border-white/10 text-gold w-fit">
                                    <Database className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-ivory tracking-wide">
                                    Data Integrity Verification
                                </h3>
                                <p className="text-xs text-ivory-dim/70 font-sans leading-relaxed">
                                    Execute targeted checks across 7 core relational models including barber accounts, queue entries, and inventory product bindings.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setActiveSubTab('integrity');
                                    if (!integrityReport) runIntegrityChecks();
                                }}
                                className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-9"
                            >
                                <span>Run Integrity Check</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {/* 3. Demo & Testing Tools */}
                        <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-gold/30 transition-colors">
                            <div className="space-y-2">
                                <div className="p-2.5 rounded-sm bg-white/5 border border-white/10 text-gold w-fit">
                                    <FlaskConical className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-ivory tracking-wide">
                                    Demo &amp; Testing
                                </h3>
                                <p className="text-xs text-ivory-dim/70 font-sans leading-relaxed">
                                    Controlled tools for simulating reservations, generating test walk-ins, skipping queue entries, submitting reviews, and test data cleanup.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setActiveSubTab('demo')}
                                className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-9"
                            >
                                <span>Open Demo Tools</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                        </div>

                        {/* 4. System Health Integration */}
                        <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 shadow-2xl flex flex-col justify-between space-y-4 hover:border-gold/30 transition-colors">
                            <div className="space-y-2">
                                <div className="p-2.5 rounded-sm bg-white/5 border border-white/10 text-gold w-fit">
                                    <Activity className="w-5 h-5" />
                                </div>
                                <h3 className="text-sm font-semibold text-ivory tracking-wide">
                                    System Operational Health
                                </h3>
                                <p className="text-xs text-ivory-dim/70 font-sans leading-relaxed">
                                    Monitor real-time technical operational state, PostgreSQL pool availability, and live response-time measurements.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setActiveTab('health')}
                                className="text-xs border-white/10 hover:border-gold/40 text-gold flex items-center justify-between w-full h-9"
                            >
                                <span>Open System Health</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* Current Session Diagnostics (Read-Only Genuine Technical State) */}
                    <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl">
                        <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                                <Info className="w-3.5 h-3.5" />
                                Administrative Session Diagnostics
                            </h3>
                            <span className="text-[10px] font-mono text-emerald-400 font-semibold uppercase flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                Authenticated Session Valid
                            </span>
                        </div>

                        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                            <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Active Administrative Role
                                </span>
                                <span className="text-xs font-mono font-bold text-gold block">
                                    {sessionInfo?.currentRole || 'System Admin'}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Superadmin User ID
                                </span>
                                <span className="text-xs font-mono font-semibold text-ivory block truncate" title={sessionInfo?.currentUserId}>
                                    {sessionInfo?.currentUserId ? `usr_${sessionInfo.currentUserId.slice(0, 8)}...` : 'Active'}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Runtime Environment
                                </span>
                                <span className="text-xs font-mono font-semibold text-ivory block capitalize">
                                    {sessionInfo?.environment || import.meta.env.MODE || 'production'}
                                </span>
                            </div>

                            <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Monitored Feature Registry
                                </span>
                                <span className="text-xs font-mono font-semibold text-ivory block">
                                    {sessionInfo?.totalFeatures || 14} System Features
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 2: ACCESS INSPECTOR                                      */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'access' && (
                <div className="space-y-6">
                    {/* User Search & Selection Card */}
                    <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 sm:p-6 shadow-2xl space-y-4">
                        <div className="space-y-1">
                            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                                <Search className="w-3.5 h-3.5" />
                                Select Account to Inspect
                            </h3>
                            <p className="text-xs text-ivory-dim/70">
                                Search any registered user account by name, email, or role to inspect their real-time authorization state.
                            </p>
                        </div>

                        {/* Search Input */}
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={handleSearchChange}
                                placeholder="Search by name, email, or role (e.g. Barber, Cashier)..."
                                className="w-full bg-white/5 border border-white/10 rounded-sm py-2.5 pl-10 pr-4 text-xs text-ivory placeholder:text-ivory-dim/40 focus:border-gold focus:outline-none transition-colors"
                            />
                            <Search className="w-4 h-4 text-ivory-dim/50 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            {isSearchingUsers && (
                                <RefreshCw className="w-3.5 h-3.5 text-gold animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
                            )}
                        </div>

                        {/* Search Results Dropdown */}
                        {searchResults.length > 0 && (
                            <div className="border border-white/10 rounded-sm bg-charcoal divide-y divide-white/5 max-h-56 overflow-y-auto custom-scrollbar">
                                {searchResults.map((u) => (
                                    <button
                                        key={u.user_id}
                                        type="button"
                                        onClick={() => handleSelectUser(u)}
                                        className="w-full p-3 text-left hover:bg-white/5 flex items-center justify-between gap-3 transition-colors cursor-pointer group"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-xs font-semibold text-ivory group-hover:text-gold transition-colors flex items-center gap-2">
                                                <span>{u.username || 'Unnamed User'}</span>
                                                <span className="px-1.5 py-0.5 rounded-[2px] bg-white/10 text-[9px] font-mono font-bold text-ivory-dim uppercase">
                                                    {u.role}
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-ivory-dim/60 font-mono truncate">{u.email}</div>
                                        </div>
                                        <span className="text-[10px] font-mono text-gold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            Inspect Access →
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Selected User Badge Card */}
                        {selectedUser && (
                            <div className="p-4 rounded-sm bg-gold/10 border border-gold/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gold/20 border border-gold/40 text-gold flex items-center justify-center font-serif font-bold text-base shrink-0">
                                        {(selectedUser.username || selectedUser.email || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-bold text-ivory">{selectedUser.username || 'Unnamed'}</span>
                                            <span className="px-2 py-0.5 rounded-[2px] bg-gold/20 border border-gold/40 text-[10px] font-mono font-bold text-gold uppercase">
                                                {selectedUser.role}
                                            </span>
                                            {selectedUser.is_verified && (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                                                    <UserCheck className="w-3 h-3" />
                                                    Verified
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-ivory-dim font-mono break-all mt-0.5">
                                            {selectedUser.email} • ID: usr_{selectedUser.user_id.slice(0, 8)}
                                        </div>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setSelectedUser(null);
                                        setUserAccessInspection(null);
                                    }}
                                    className="text-xs border-white/10 hover:border-gold/40 text-ivory-dim self-start sm:self-auto h-8 px-3"
                                >
                                    Change Account
                                </Button>
                            </div>
                        )}

                        {accessError && (
                            <div className="p-3 rounded-sm bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                <span>{accessError}</span>
                            </div>
                        )}
                    </div>

                    {/* Inspection Loading State */}
                    {isLoadingAccess && (
                        <div className="p-12 text-center bg-charcoal-light border border-white/10 rounded-sm space-y-3 shadow-2xl">
                            <RefreshCw className="w-6 h-6 text-gold animate-spin mx-auto" />
                            <p className="text-xs font-mono text-ivory-dim">
                                Evaluating multi-layer authorization chain for {selectedUser?.username || 'account'}...
                            </p>
                        </div>
                    )}

                    {/* Empty State when no user selected */}
                    {!selectedUser && !isLoadingAccess && (
                        <div className="p-12 text-center bg-charcoal-light border border-white/10 rounded-sm space-y-3 shadow-2xl">
                            <Shield className="w-8 h-8 text-ivory-dim/30 mx-auto" />
                            <h4 className="text-sm font-semibold text-ivory">No Account Selected</h4>
                            <p className="text-xs text-ivory-dim/60 max-w-md mx-auto">
                                Search and select an account above to inspect its real effective permissions across the entire feature registry.
                            </p>
                        </div>
                    )}

                    {/* Inspection Results Matrix */}
                    {userAccessInspection && !isLoadingAccess && (
                        <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl space-y-0">
                            {/* Controls Bar */}
                            <div className="px-5 py-4 border-b border-white/5 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                                        <Layers className="w-3.5 h-3.5" />
                                        Effective Authorization Chain
                                    </h3>
                                    <span className="text-[10px] font-mono text-ivory-dim/60">
                                        ({allowedCount} Allowed / {deniedCount} Denied)
                                    </span>
                                </div>

                                {/* Filter Controls */}
                                <div className="flex items-center gap-2 flex-wrap">
                                    <div className="flex items-center bg-white/5 p-0.5 rounded-sm border border-white/10">
                                        <button
                                            type="button"
                                            onClick={() => setAccessFilter('ALL')}
                                            className={`px-2.5 py-1 rounded-[2px] text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                                                accessFilter === 'ALL' ? 'bg-gold text-charcoal' : 'text-ivory-dim hover:text-ivory'
                                            }`}
                                        >
                                            All ({userAccessInspection.features.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAccessFilter('ALLOWED')}
                                            className={`px-2.5 py-1 rounded-[2px] text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                                                accessFilter === 'ALLOWED' ? 'bg-emerald-500/20 text-emerald-400' : 'text-ivory-dim hover:text-ivory'
                                            }`}
                                        >
                                            Allowed ({allowedCount})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setAccessFilter('DENIED')}
                                            className={`px-2.5 py-1 rounded-[2px] text-[10px] font-mono font-semibold transition-colors cursor-pointer ${
                                                accessFilter === 'DENIED' ? 'bg-red-500/20 text-red-400' : 'text-ivory-dim hover:text-ivory'
                                            }`}
                                        >
                                            Denied ({deniedCount})
                                        </button>
                                    </div>

                                    <input
                                        type="text"
                                        value={featureFilterQuery}
                                        onChange={(e) => setFeatureFilterQuery(e.target.value)}
                                        placeholder="Filter features..."
                                        className="bg-white/5 border border-white/10 rounded-sm py-1 px-2.5 text-[11px] text-ivory placeholder:text-ivory-dim/40 focus:border-gold focus:outline-none w-36"
                                    />
                                </div>
                            </div>

                            {/* Features List */}
                            <div className="divide-y divide-white/5">
                                {filteredFeatures.length === 0 ? (
                                    <div className="p-8 text-center text-xs text-ivory-dim/60 font-mono">
                                        No features match the selected filter.
                                    </div>
                                ) : (
                                    filteredFeatures.map((f) => {
                                        const isAllowed = f.effectiveAccess === 'ALLOWED';
                                        return (
                                            <div
                                                key={f.featureId}
                                                className="p-4 sm:p-5 hover:bg-white/[0.01] transition-colors space-y-3"
                                            >
                                                {/* Header Row */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="text-sm font-bold text-ivory tracking-wide">
                                                                {f.featureName}
                                                            </span>
                                                            <span className="px-1.5 py-0.5 rounded-[2px] bg-white/5 border border-white/10 text-[9px] font-mono text-ivory-dim">
                                                                {f.category}
                                                            </span>
                                                            <span className="text-[10px] font-mono text-ivory-dim/50">
                                                                {f.featureId}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-ivory-dim/70 mt-1 font-sans">
                                                            {f.description}
                                                        </p>
                                                    </div>

                                                    {/* Effective Access Badge */}
                                                    <div className="shrink-0 self-start sm:self-center">
                                                        {isAllowed ? (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]">
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                ALLOWED
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                DENIED
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Multi-Layer Evaluation Breakdown */}
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                                                    {/* 1. Global State */}
                                                    <div className="p-2.5 rounded-sm bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                                        <span className="text-ivory-dim/60 text-[10px] uppercase tracking-wider">
                                                            Global State:
                                                        </span>
                                                        <span className={`font-semibold ${
                                                            f.globalStatus === 'ENABLED' ? 'text-emerald-400' : f.globalStatus === 'MAINTENANCE' ? 'text-amber-300' : 'text-ivory-dim/60'
                                                        }`}>
                                                            {f.globalStatus}
                                                        </span>
                                                    </div>

                                                    {/* 2. Role Access */}
                                                    <div className="p-2.5 rounded-sm bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                                        <span className="text-ivory-dim/60 text-[10px] uppercase tracking-wider">
                                                            Role Access:
                                                        </span>
                                                        <span className={`font-semibold ${
                                                            f.roleAccess === 'ALLOWED' ? 'text-emerald-400' : 'text-red-400'
                                                        }`}>
                                                            {f.roleAccess}
                                                        </span>
                                                    </div>

                                                    {/* 3. Technical Compatibility */}
                                                    <div className="p-2.5 rounded-sm bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                                        <span className="text-ivory-dim/60 text-[10px] uppercase tracking-wider">
                                                            Compatibility:
                                                        </span>
                                                        <span className={`font-semibold ${
                                                            f.isUnavailable ? 'text-amber-300' : 'text-emerald-400'
                                                        }`}>
                                                            {f.isUnavailable ? 'Incompatible' : 'Compatible'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Authorization Decision Explanation */}
                                                <div className={`p-3 rounded-sm border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                                    isAllowed
                                                        ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300/90'
                                                        : 'bg-red-500/5 border-red-500/20 text-red-300/90'
                                                }`}>
                                                    <div className="flex items-start gap-2">
                                                        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                                        <span className="font-sans leading-relaxed">
                                                            <strong className="font-semibold font-mono mr-1">
                                                                Effective Result:
                                                            </strong>
                                                            {f.reason}
                                                        </span>
                                                    </div>

                                                    {/* Contextual Link to System Controls if denied due to role */}
                                                    {!isAllowed && !f.isUnavailable && f.globalStatus === 'ENABLED' && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={() => {
                                                                if (onNavigateControlsSubTab) {
                                                                    onNavigateControlsSubTab('access');
                                                                } else {
                                                                    setActiveTab('features');
                                                                }
                                                            }}
                                                            className="text-[10px] border-white/10 hover:border-gold/40 text-gold shrink-0 h-7 px-2.5 self-start sm:self-center"
                                                        >
                                                            <span>Configure Role Access</span>
                                                            <Sliders className="w-3 h-3 ml-1" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 3: DATA INTEGRITY                                        */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'integrity' && (
                <div className="space-y-6">
                    {/* Top Action Card */}
                    <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 sm:p-6 shadow-2xl space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                                    <Database className="w-3.5 h-3.5" />
                                    Data Integrity Verification
                                </h3>
                                <p className="text-xs text-ivory-dim/70">
                                    Executes targeted backend SQL validation queries to verify referential integrity across all core business models.
                                </p>
                            </div>

                            <div className="flex items-center gap-3 self-start sm:self-auto">
                                <Button
                                    type="button"
                                    onClick={runIntegrityChecks}
                                    disabled={isRunningIntegrity}
                                    className="bg-gold text-charcoal hover:bg-gold-light text-xs font-bold flex items-center gap-1.5 h-8 px-3 shadow-md shadow-gold/20"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isRunningIntegrity ? 'animate-spin' : ''}`} />
                                    <span>{isRunningIntegrity ? 'Running Checks...' : 'Run Integrity Check'}</span>
                                </Button>
                            </div>
                        </div>

                        {integrityReport && (
                            <div className="text-[11px] font-mono text-ivory-dim/60 flex items-center gap-1 pt-1 border-t border-white/5">
                                <Clock className="w-3 h-3 text-gold" />
                                Last verified: {formatManilaAuditTimestamp(integrityReport.timestamp, 'inline')}
                            </div>
                        )}

                        {integrityError && (
                            <div className="p-3 rounded-sm bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                                <span>{integrityError}</span>
                            </div>
                        )}
                    </div>

                    {/* Summary KPI Bar (Rendered when report exists) */}
                    {integrityReport && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                            <div className="p-4 rounded-sm bg-charcoal-light border border-white/10 shadow-xl space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Total Checks
                                </span>
                                <span className="text-xl font-mono font-bold text-ivory">
                                    {integrityReport.totalChecks}
                                </span>
                            </div>

                            <div className="p-4 rounded-sm bg-charcoal-light border border-white/10 shadow-xl space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Checks Passed
                                </span>
                                <span className="text-xl font-mono font-bold text-emerald-400">
                                    {integrityReport.passedChecks}
                                </span>
                            </div>

                            <div className="p-4 rounded-sm bg-charcoal-light border border-white/10 shadow-xl space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Issues Detected
                                </span>
                                <span className={`text-xl font-mono font-bold ${
                                    integrityReport.issuesFoundChecks > 0 ? 'text-amber-400' : 'text-emerald-400'
                                }`}>
                                    {integrityReport.issuesFoundChecks}
                                </span>
                            </div>

                            <div className="p-4 rounded-sm bg-charcoal-light border border-white/10 shadow-xl space-y-1">
                                <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                                    Failed to Check
                                </span>
                                <span className={`text-xl font-mono font-bold ${
                                    integrityReport.failedChecks > 0 ? 'text-red-400' : 'text-ivory-dim/60'
                                }`}>
                                    {integrityReport.failedChecks}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Empty State before any checks run */}
                    {!integrityReport && !isRunningIntegrity && (
                        <div className="p-12 text-center bg-charcoal-light border border-white/10 rounded-sm space-y-4 shadow-2xl">
                            <Database className="w-8 h-8 text-ivory-dim/30 mx-auto" />
                            <div className="space-y-1">
                                <h4 className="text-sm font-semibold text-ivory">No Integrity Scan Executed Yet</h4>
                                <p className="text-xs text-ivory-dim/60 max-w-md mx-auto">
                                    Execute a live verification check to validate account roles, barber station references, customer queue records, and inventory catalogs.
                                </p>
                            </div>
                            <Button
                                type="button"
                                onClick={runIntegrityChecks}
                                className="bg-gold text-charcoal hover:bg-gold-light text-xs font-bold px-4 py-2"
                            >
                                Run Integrity Check Now
                            </Button>
                        </div>
                    )}

                    {/* Checks List */}
                    {integrityReport && (
                        <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl divide-y divide-white/5">
                            {integrityReport.checks.map((check: IntegrityCheckResult) => {
                                const isPassed = check.status === 'PASSED';
                                const hasIssues = check.status === 'ISSUES_FOUND';
                                const isFailed = check.status === 'FAILED_TO_CHECK';
                                const isExpanded = expandedCheckId === check.id;

                                return (
                                    <div key={check.id} className="p-4 sm:p-5 space-y-3 hover:bg-white/[0.01] transition-colors">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-ivory tracking-wide">
                                                        {check.name}
                                                    </span>
                                                    <span className="px-1.5 py-0.5 rounded-[2px] bg-white/5 border border-white/10 text-[9px] font-mono text-ivory-dim">
                                                        {check.category}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-ivory-dim/70 font-sans">
                                                    {check.description}
                                                </p>
                                            </div>

                                            {/* Status Badge & Actions */}
                                            <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                                                <div className="text-right hidden sm:block">
                                                    <span className="text-[11px] font-mono text-ivory-dim/60 block">
                                                        {check.checkedCount} records checked
                                                    </span>
                                                </div>

                                                {isPassed && (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        PASSED
                                                    </span>
                                                )}

                                                {hasIssues && (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]">
                                                        <AlertTriangle className="w-3.5 h-3.5" />
                                                        {check.issueCount} {check.issueCount === 1 ? 'ISSUE' : 'ISSUES'} FOUND
                                                    </span>
                                                )}

                                                {isFailed && (
                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm text-xs font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        FAILED TO CHECK
                                                    </span>
                                                )}

                                                {hasIssues && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                                                        className="p-1 text-ivory-dim/70 hover:text-gold transition-colors cursor-pointer"
                                                        aria-label="Toggle issue details"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronUp className="w-4 h-4 text-gold" />
                                                        ) : (
                                                            <ChevronDown className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Error Message if query execution failed */}
                                        {isFailed && check.errorMessage && (
                                            <div className="p-3 rounded-sm bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-mono">
                                                Execution error: {check.errorMessage}
                                            </div>
                                        )}

                                        {/* Expandable Issues Drawer */}
                                        {hasIssues && isExpanded && check.issues.length > 0 && (
                                            <div className="mt-3 p-3.5 rounded-sm bg-charcoal/60 border border-amber-500/30 space-y-2 animate-fade-in">
                                                <div className="text-[10px] font-mono uppercase font-bold text-amber-300 flex items-center justify-between">
                                                    <span>Discrepancy Details ({check.issues.length} displayed)</span>
                                                    <span className="text-ivory-dim/50 font-normal">Safe IDs • PII Excluded</span>
                                                </div>
                                                <div className="divide-y divide-white/5 text-xs font-mono">
                                                    {check.issues.map((item, idx) => (
                                                        <div key={idx} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-gold font-bold">{item.recordRef}</span>
                                                                <span className="text-ivory-dim/80 font-sans">{item.problem}</span>
                                                            </div>
                                                            {item.details && (
                                                                <span className="text-[10px] text-ivory-dim/50 truncate max-w-xs">
                                                                    {JSON.stringify(item.details)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════ */}
            {/* TAB 4: DEMO & TESTING                                        */}
            {/* ═════════════════════════════════════════════════════════════ */}
            {activeSubTab === 'demo' && <DemoTestingTab />}
        </div>
    );
};

export default Diagnostics;
