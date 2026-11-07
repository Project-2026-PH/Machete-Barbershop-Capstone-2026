import React, { useState, useEffect, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
    Users,
    Activity,
    UserCheck,
    UserX,
    Shield,
    ShieldAlert,
    AlertTriangle,
    UserPlus,
    Sliders,
    ArrowUpRight,
    Clock,
    CheckCircle,
    Server,
    Database,
    RefreshCw,
    Scissors,
    Coins,
    Boxes,
    Store,
    KeyRound,
    Wrench
} from 'lucide-react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

import { api } from '@/config/api';

const TIME_RANGES = [
    { label: 'Last 24 Hours', value: '24h' },
    { label: 'Last 7 Days', value: '7d' },
    { label: 'Last 30 Days', value: '30d' },
];

interface OverviewProps {
    setActiveTab: (tab: string) => void;
    onNavigateToAccounts?: (options?: { category?: string; role?: string; status?: string; verification?: string }) => void;
    setUserFilter?: (filter: string) => void;
    onSelectRole?: (role: string) => void;
    onSelectStatus?: (status: string) => void;
    onSelectCategory?: (category: string) => void;
    onSelectVerification?: (verification: string) => void;
    onOpenProvisionModal?: () => void;
}

export const Overview: React.FC<OverviewProps> = ({
    setActiveTab,
    onNavigateToAccounts,
    setUserFilter,
    onSelectRole,
    onSelectStatus,
    onSelectCategory,
    onSelectVerification,
    onOpenProvisionModal,
}) => {
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        suspended: 0,
        verified: 0,
        unverified: 0,
        recent_7d: 0,
        attention_required: 0,
        customers: 0,
        barbers: 0,
        cashiers: 0,
        inventory_managers: 0,
        shop_admins: 0,
        system_admins: 0,
    });
    const [traffic, setTraffic] = useState<any[]>([]);
    const [recentActivity, setRecentActivity] = useState<any[]>([]);
    const [statsLoading, setStatsLoading] = useState(true);
    const [chartLoading, setChartLoading] = useState(true);
    const [activityLoading, setActivityLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('7d');

    // Fetch stats and traffic
    useEffect(() => {
        let cancelled = false;

        const fetchOverviewData = async () => {
            setChartLoading(true);
            try {
                const res = await api.get(`/api/system-admin/dashboard-stats?range=${timeRange}`);
                const data = res.data;

                if (!cancelled) {
                    const u = data.users || {};
                    setStats({
                        total: u.total ?? 0,
                        active: u.active ?? (u.total - (u.suspended ?? 0)),
                        suspended: u.suspended ?? 0,
                        verified: u.verified ?? 0,
                        unverified: u.unverified ?? 0,
                        recent_7d: u.recent_7d ?? 0,
                        attention_required: u.attention_required ?? (u.unverified ?? 0),
                        customers: u.customers ?? 0,
                        barbers: u.barbers ?? 0,
                        cashiers: u.cashiers ?? 0,
                        inventory_managers: u.inventory_managers ?? 0,
                        shop_admins: u.shop_admins ?? 0,
                        system_admins: u.system_admins ?? 0,
                    });
                    setTraffic(data.traffic ?? []);
                }
            } catch (err: any) {
                console.error('[Overview] Failed to fetch stats/traffic:', err.message);
            } finally {
                if (!cancelled) {
                    setStatsLoading(false);
                    setChartLoading(false);
                }
            }
        };

        fetchOverviewData();

        return () => {
            cancelled = true;
        };
    }, [timeRange]);

    // Fetch recent administrative activity from real audit logs
    useEffect(() => {
        let cancelled = false;

        const fetchRecentActivity = async () => {
            setActivityLoading(true);
            try {
                const res = await api.get('/api/system-admin/audit-logs?page=1&limit=6&sortBy=timestamp_desc');
                if (!cancelled) {
                    setRecentActivity(res.data?.logs || []);
                }
            } catch (err: any) {
                console.error('[Overview] Failed to fetch recent activity:', err.message);
            } finally {
                if (!cancelled) setActivityLoading(false);
            }
        };

        fetchRecentActivity();

        return () => {
            cancelled = true;
        };
    }, []);

    const navigateToAccounts = (options?: { 
        category?: string; 
        role?: string; 
        status?: string; 
        verification?: string; 
    }) => {
        const cat = options?.category ?? 'all';
        const role = options?.role ?? 'all';
        const stat = options?.status ?? 'all';
        const ver = options?.verification ?? 'all';

        if (onNavigateToAccounts) {
            onNavigateToAccounts({ category: cat, role, status: stat, verification: ver });
            return;
        }

        if (onSelectCategory) onSelectCategory(cat);
        if (onSelectRole) onSelectRole(role);
        if (onSelectStatus) onSelectStatus(stat);
        if (onSelectVerification) onSelectVerification(ver);
        if (setUserFilter) setUserFilter(stat);
        setActiveTab('accounts');
    };

    // Chart Configuration
    const chartData = useMemo(() => ({
        labels: traffic.map(d => d.date),
        datasets: [{
            label: 'Daily System Requests',
            data: traffic.map(d => d.count),
            backgroundColor: 'rgba(212, 175, 55, 0.85)',
            hoverBackgroundColor: 'rgba(212, 175, 55, 1)',
            borderColor: 'transparent',
            borderRadius: 4,
            borderSkipped: false,
            barPercentage: 0.6,
            categoryPercentage: 0.8,
        }],
    }), [traffic]);

    const chartOptions: any = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
            legend: {
                position: 'top' as const,
                align: 'end' as const,
                labels: {
                    color: '#C8B89A',
                    font: { size: 11 },
                    boxWidth: 10,
                    boxHeight: 10,
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                },
            },
            title: { display: false },
            tooltip: {
                backgroundColor: '#1C1C1E',
                borderColor: 'rgba(212, 175, 55, 0.3)',
                borderWidth: 1,
                titleColor: '#E8DCC8',
                bodyColor: '#C8B89A',
                padding: 10,
                callbacks: {
                    label: (ctx: any) => ` ${ctx.parsed.y.toLocaleString()} requests`,
                },
            },
        },
        scales: {
            y: {
                ticks: { color: '#888888', font: { size: 11 }, maxTicksLimit: 5 },
                grid: { color: 'rgba(255,255,255,0.06)', drawBorder: false },
                border: { dash: [4, 4], display: false },
            },
            x: {
                ticks: { color: '#888888', font: { size: 10 }, maxTicksLimit: 8, maxRotation: 0 },
                grid: { display: false },
                border: { display: false },
            },
        },
    }), []);

    const formatActionLabel = (action: string) => {
        return (action || '')
            .replace(/_/g, ' ')
            .toLowerCase()
            .replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* Quick Action Launchpad */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-charcoal-light border border-white/5 p-5 rounded-sm card-gold-accent">
                <div>
                    <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2">
                        <Shield className="w-5 h-5 text-gold" /> System Control Center
                    </h3>
                    <p className="text-ivory-dim text-xs mt-0.5">
                        High-level system metrics, account lifecycle state, and audit monitoring.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        onClick={() => navigateToAccounts()}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white/5 hover:bg-gold/15 hover:text-gold border border-white/10 hover:border-gold/30 text-xs font-semibold text-ivory transition-all cursor-pointer"
                    >
                        <Users className="w-3.5 h-3.5 text-gold" />
                        Accounts Directory
                    </button>
                    <button
                        onClick={() => setActiveTab('audit')}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white/5 hover:bg-gold/15 hover:text-gold border border-white/10 hover:border-gold/30 text-xs font-semibold text-ivory transition-all cursor-pointer"
                    >
                        <ShieldAlert className="w-3.5 h-3.5 text-gold" />
                        Review Audit Logs
                    </button>
                    <button
                        onClick={() => setActiveTab('features')}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white/5 hover:bg-gold/15 hover:text-gold border border-white/10 hover:border-gold/30 text-xs font-semibold text-ivory transition-all cursor-pointer"
                    >
                        <Sliders className="w-3.5 h-3.5 text-gold" />
                        System Controls
                    </button>
                    <button
                        onClick={() => setActiveTab('health')}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white/5 hover:bg-gold/15 hover:text-gold border border-white/10 hover:border-gold/30 text-xs font-semibold text-ivory transition-all cursor-pointer"
                    >
                        <Activity className="w-3.5 h-3.5 text-gold" />
                        System Health
                    </button>
                    <button
                        onClick={() => setActiveTab('diagnostics')}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-sm bg-white/5 hover:bg-gold/15 hover:text-gold border border-white/10 hover:border-gold/30 text-xs font-semibold text-ivory transition-all cursor-pointer"
                    >
                        <Wrench className="w-3.5 h-3.5 text-gold" />
                        Diagnostics
                    </button>
                    <button
                        onClick={() => {
                            if (onOpenProvisionModal) onOpenProvisionModal();
                            else navigateToAccounts();
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-gold text-charcoal hover:bg-gold-light text-xs font-bold shadow-md shadow-gold/20 transition-all cursor-pointer"
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                        Provision Account
                    </button>
                </div>
            </div>

            {/* Section 1: System Overview KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
                {/* Total Accounts */}
                <div
                    onClick={() => navigateToAccounts({ category: 'all', role: 'all', status: 'all', verification: 'all' })}
                    className="bg-charcoal-light border border-white/5 p-4 rounded-sm hover:border-gold/40 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer card-gold-accent group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-gold/10 border border-gold/20 text-gold group-hover:scale-105 transition-transform">
                            <Users className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-mono text-ivory-dim/60 flex items-center gap-0.5">
                            Total <ArrowUpRight className="w-3 h-3 text-gold opacity-0 group-hover:opacity-100 transition-opacity" />
                        </span>
                    </div>
                    {statsLoading ? (
                        <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-1" />
                    ) : (
                        <div className="text-2xl font-serif font-bold text-ivory mb-0.5 group-hover:text-gold transition-colors">{stats.total}</div>
                    )}
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Total Accounts</p>
                </div>

                {/* Active Accounts */}
                <div
                    onClick={() => navigateToAccounts({ category: 'all', role: 'all', status: 'active', verification: 'all' })}
                    className="bg-charcoal-light border border-white/5 p-4 rounded-sm hover:border-emerald-500/40 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer card-gold-accent group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:scale-105 transition-transform">
                            <UserCheck className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            Normal
                        </span>
                    </div>
                    {statsLoading ? (
                        <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-1" />
                    ) : (
                        <div className="text-2xl font-serif font-bold text-emerald-400 mb-0.5">{stats.active}</div>
                    )}
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Active Accounts</p>
                </div>

                {/* Suspended Accounts */}
                <div
                    onClick={() => navigateToAccounts({ category: 'all', role: 'all', status: 'suspended', verification: 'all' })}
                    className="bg-charcoal-light border border-white/5 p-4 rounded-sm hover:border-red-500/40 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer card-gold-accent group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-red-500/10 border border-red-500/20 text-red-400 group-hover:scale-105 transition-transform">
                            <UserX className="w-4 h-4" />
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${stats.suspended > 0 ? 'bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse' : 'bg-white/5 text-ivory-dim'}`}>
                            {stats.suspended > 0 ? `${stats.suspended} Suspended` : 'None'}
                        </span>
                    </div>
                    {statsLoading ? (
                        <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-1" />
                    ) : (
                        <div className="text-2xl font-serif font-bold text-red-400 mb-0.5">{stats.suspended}</div>
                    )}
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Suspended</p>
                </div>

                {/* Recently Created (7d) */}
                <div
                    onClick={() => navigateToAccounts({ category: 'all', role: 'all', status: 'all', verification: 'all' })}
                    className="bg-charcoal-light border border-white/5 p-4 rounded-sm hover:border-gold/40 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer card-gold-accent group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-gold/10 border border-gold/20 text-gold group-hover:scale-105 transition-transform">
                            <Clock className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">
                            Last 7d
                        </span>
                    </div>
                    {statsLoading ? (
                        <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-1" />
                    ) : (
                        <div className="text-2xl font-serif font-bold text-gold mb-0.5">+{stats.recent_7d}</div>
                    )}
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">New Accounts</p>
                </div>

                {/* Requires Attention */}
                <div
                    onClick={() => navigateToAccounts({ category: 'all', role: 'all', status: 'all', verification: 'attention_required' })}
                    className="col-span-2 lg:col-span-1 bg-charcoal-light border border-white/5 p-4 rounded-sm hover:border-amber-500/40 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer card-gold-accent group"
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 rounded-sm bg-amber-500/10 border border-amber-500/20 text-amber-400 group-hover:scale-105 transition-transform">
                            <AlertTriangle className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            Review
                        </span>
                    </div>
                    {statsLoading ? (
                        <div className="h-7 w-16 bg-white/10 rounded animate-pulse mb-1" />
                    ) : (
                        <div className="text-2xl font-serif font-bold text-amber-400 mb-0.5">{stats.attention_required}</div>
                    )}
                    <p className="text-ivory-dim text-[11px] uppercase tracking-wider font-medium">Action Required</p>
                </div>
            </div>

            {/* Section 2: Account Role Breakdown Grid */}
            <div className="bg-charcoal-light border border-white/5 p-5 md:p-6 rounded-sm card-gold-accent">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 pb-3 border-b border-white/5">
                    <div>
                        <h4 className="text-base font-serif font-bold text-ivory">Account Breakdown by System Role</h4>
                        <p className="text-ivory-dim text-xs">Direct access into filtered account directories.</p>
                    </div>
                    <button
                        onClick={() => navigateToAccounts()}
                        className="text-xs text-gold hover:underline self-start sm:self-auto flex items-center gap-1 cursor-pointer"
                    >
                        View Full Directory <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    {/* Customers */}
                    <div
                        onClick={() => navigateToAccounts({ category: 'customers', role: 'Customer', status: 'all', verification: 'all' })}
                        className="p-3.5 rounded-sm bg-charcoal border border-white/5 hover:border-gold/30 hover:bg-white/[0.03] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="p-1.5 rounded-sm bg-white/5 text-ivory-dim group-hover:text-gold transition-colors">
                                <Users className="w-4 h-4" />
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono font-medium">
                                {stats.verified} ver.
                            </span>
                        </div>
                        <div className="text-xl font-serif font-bold text-ivory">{stats.customers}</div>
                        <div className="text-[11px] text-ivory-dim font-medium mt-0.5">Customers</div>
                    </div>

                    {/* Barbers */}
                    <div
                        onClick={() => navigateToAccounts({ category: 'staff', role: 'Barber', status: 'all', verification: 'all' })}
                        className="p-3.5 rounded-sm bg-charcoal border border-white/5 hover:border-gold/30 hover:bg-white/[0.03] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="p-1.5 rounded-sm bg-white/5 text-ivory border border-white/10 group-hover:text-gold group-hover:border-gold/30 transition-colors">
                                <Scissors className="w-4 h-4" />
                            </span>
                            <span className="text-[10px] text-ivory-dim font-mono font-medium">Staff</span>
                        </div>
                        <div className="text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors">{stats.barbers}</div>
                        <div className="text-[11px] text-ivory-dim font-medium mt-0.5">Barbers</div>
                    </div>

                    {/* Cashiers */}
                    <div
                        onClick={() => navigateToAccounts({ category: 'staff', role: 'Cashier', status: 'all', verification: 'all' })}
                        className="p-3.5 rounded-sm bg-charcoal border border-white/5 hover:border-gold/30 hover:bg-white/[0.03] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="p-1.5 rounded-sm bg-emerald-500/10 text-emerald-400 group-hover:text-gold transition-colors">
                                <Coins className="w-4 h-4" />
                            </span>
                            <span className="text-[10px] text-emerald-400 font-mono font-medium">Staff</span>
                        </div>
                        <div className="text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors">{stats.cashiers}</div>
                        <div className="text-[11px] text-ivory-dim font-medium mt-0.5">Cashiers</div>
                    </div>

                    {/* Inventory Managers */}
                    <div
                        onClick={() => navigateToAccounts({ category: 'staff', role: 'Inventory Manager', status: 'all', verification: 'all' })}
                        className="p-3.5 rounded-sm bg-charcoal border border-white/5 hover:border-gold/30 hover:bg-white/[0.03] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="p-1.5 rounded-sm bg-amber-500/10 text-amber-400 group-hover:text-gold transition-colors">
                                <Boxes className="w-4 h-4" />
                            </span>
                            <span className="text-[10px] text-amber-400 font-mono font-medium">Staff</span>
                        </div>
                        <div className="text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors">{stats.inventory_managers}</div>
                        <div className="text-[11px] text-ivory-dim font-medium mt-0.5">Inv. Managers</div>
                    </div>

                    {/* Shop Admins */}
                    <div
                        onClick={() => navigateToAccounts({ category: 'admins', role: 'Shop Admin', status: 'all', verification: 'all' })}
                        className="p-3.5 rounded-sm bg-charcoal border border-white/5 hover:border-gold/30 hover:bg-white/[0.03] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="p-1.5 rounded-sm bg-gold/10 text-gold group-hover:text-gold transition-colors">
                                <Store className="w-4 h-4" />
                            </span>
                            <span className="text-[10px] text-gold font-mono font-medium">Branch</span>
                        </div>
                        <div className="text-xl font-serif font-bold text-ivory group-hover:text-gold transition-colors">{stats.shop_admins}</div>
                        <div className="text-[11px] text-ivory-dim font-medium mt-0.5">Shop Admins</div>
                    </div>

                    {/* System Admins */}
                    <div
                        onClick={() => navigateToAccounts({ category: 'admins', role: 'System Admin', status: 'all', verification: 'all' })}
                        className="p-3.5 rounded-sm bg-charcoal border border-gold/30 hover:border-gold hover:bg-white/[0.03] shadow-[0_0_12px_rgba(212,175,55,0.08)] transition-all cursor-pointer group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="p-1.5 rounded-sm bg-gold/15 text-gold group-hover:bg-gold/25 transition-colors">
                                <KeyRound className="w-4 h-4" />
                            </span>
                            <span className="text-[10px] text-gold font-mono font-bold">Root</span>
                        </div>
                        <div className="text-xl font-serif font-bold text-gold">{stats.system_admins}</div>
                        <div className="text-[11px] text-ivory-dim font-medium mt-0.5">Superadmins</div>
                    </div>
                </div>
            </div>

            {/* Section 3: Live Administrative Activity & System Health Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Administrative Activity Stream */}
                <div className="lg:col-span-2 bg-charcoal-light border border-white/5 p-5 md:p-6 rounded-sm card-gold-accent flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                            <div>
                                <h4 className="text-base font-serif font-bold text-ivory flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-gold" /> Administrative & Security Activity
                                </h4>
                                <p className="text-ivory-dim text-xs">Live stream of critical system actions.</p>
                            </div>
                            <button
                                onClick={() => setActiveTab('audit')}
                                className="text-xs text-gold hover:underline flex items-center gap-1 cursor-pointer"
                            >
                                All Logs <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <div className="space-y-2.5">
                            {activityLoading ? (
                                [1, 2, 3, 4].map(i => (
                                    <div key={i} className="p-3 rounded-sm bg-charcoal border border-white/5 animate-pulse flex justify-between items-center">
                                        <div className="space-y-1.5 flex-1">
                                            <div className="h-3.5 w-1/3 bg-white/10 rounded" />
                                            <div className="h-2.5 w-1/2 bg-white/5 rounded" />
                                        </div>
                                        <div className="h-5 w-16 bg-white/10 rounded-full" />
                                    </div>
                                ))
                            ) : recentActivity.length === 0 ? (
                                <div className="py-8 text-center text-ivory-dim text-xs">
                                    No administrative actions recorded in the last 24 hours.
                                </div>
                            ) : (
                                recentActivity.map((event: any) => {
                                    const isFailed = event.status === 'FAILURE' || event.action?.includes('FAIL') || event.action?.includes('ERROR');
                                    return (
                                        <div
                                            key={event.audit_id || event.id}
                                            className="p-3 rounded-sm bg-charcoal border border-white/5 hover:border-white/15 transition-colors flex items-center justify-between gap-3 text-xs"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className={`p-1.5 rounded-full shrink-0 ${isFailed ? 'bg-red-500/10 text-red-400' : 'bg-gold/10 text-gold'}`}>
                                                    {isFailed ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-ivory truncate flex items-center gap-2">
                                                        <span>{formatActionLabel(event.action)}</span>
                                                        {event.actor_role && (
                                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-ivory-dim border border-white/10">
                                                                {event.actor_role}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-ivory-dim text-[11px] truncate flex items-center gap-2 mt-0.5">
                                                        <span>By: <strong className="text-ivory-dim/80">{event.actor_name || event.actor_email || 'System'}</strong></span>
                                                        {event.resource && (
                                                            <>
                                                                <span>•</span>
                                                                <span className="font-mono text-[10px] text-gold/80">{event.resource}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                    isFailed
                                                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                                        : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                }`}>
                                                    {isFailed ? 'FAILED' : 'SUCCESS'}
                                                </span>
                                                <div className="text-[10px] font-mono text-ivory-dim/60 mt-1">
                                                    {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 text-right">
                        <button
                            onClick={() => setActiveTab('audit')}
                            className="text-xs font-semibold text-gold hover:underline cursor-pointer"
                        >
                            Open Detailed Audit Logs Console →
                        </button>
                    </div>
                </div>

                {/* System Diagnostics & Health Status */}
                <div className="bg-charcoal-light border border-white/5 p-5 md:p-6 rounded-sm card-gold-accent flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/5">
                            <div>
                                <h4 className="text-base font-serif font-bold text-ivory flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-emerald-400" /> System Health
                                </h4>
                                <p className="text-ivory-dim text-xs">Operational infrastructure diagnostics.</p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Healthy
                            </span>
                        </div>

                        <div className="space-y-3">
                            <div className="p-3 rounded-sm bg-charcoal border border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Database className="w-4 h-4 text-gold" />
                                    <div>
                                        <div className="text-xs font-semibold text-ivory">PostgreSQL Primary</div>
                                        <div className="text-[10px] text-ivory-dim">Supabase Connection Pool</div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Connected</span>
                            </div>

                            <div className="p-3 rounded-sm bg-charcoal border border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Server className="w-4 h-4 text-blue-400" />
                                    <div>
                                        <div className="text-xs font-semibold text-ivory">Express 5 API</div>
                                        <div className="text-[10px] text-ivory-dim">Port 5000 • JWT Verified</div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Online</span>
                            </div>

                            <div className="p-3 rounded-sm bg-charcoal border border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <RefreshCw className="w-4 h-4 text-purple-400" />
                                    <div>
                                        <div className="text-xs font-semibold text-ivory">Queue & Realtime</div>
                                        <div className="text-[10px] text-ivory-dim">Customer Queue Sync</div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-emerald-400">Active</span>
                            </div>

                            <div className="p-3 rounded-sm bg-charcoal border border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <Sliders className="w-4 h-4 text-amber-400" />
                                    <div>
                                        <div className="text-xs font-semibold text-ivory">System Controls Registry</div>
                                        <div className="text-[10px] text-ivory-dim">Module Overrides Enabled</div>
                                    </div>
                                </div>
                                <span className="text-[10px] font-bold text-gold">Configured</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5">
                        <button
                            onClick={() => setActiveTab('features')}
                            className="w-full py-2 px-3 rounded-sm bg-white/5 hover:bg-gold/15 hover:text-gold border border-white/10 text-xs font-semibold text-ivory transition-all text-center cursor-pointer"
                        >
                            Manage System Controls →
                        </button>
                    </div>
                </div>
            </div>

            {/* Section 4: Daily API Traffic Diagnostics */}
            <div className="bg-charcoal-light border border-white/5 p-5 md:p-6 rounded-sm w-full card-gold-accent">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-5">
                    <div>
                        <h4 className="text-base font-serif font-bold text-ivory">API Traffic & Request Volume</h4>
                        <p className="text-ivory-dim text-xs mt-0.5">Aggregated API activity across shop operations.</p>
                    </div>

                    <div className="flex items-center gap-1 bg-white/5 border border-white/5 rounded-sm p-1 self-start sm:self-auto">
                        {TIME_RANGES.map(({ label, value }) => (
                            <button
                                key={value}
                                onClick={() => setTimeRange(value)}
                                className={`text-xs px-3 py-1.5 rounded-sm font-medium transition-all duration-200 cursor-pointer ${
                                    timeRange === value
                                        ? 'bg-gold text-charcoal font-bold shadow-sm'
                                        : 'text-ivory-dim hover:text-ivory hover:bg-white/5'
                                }`}
                            >
                                <span className="sm:hidden">
                                    {value === '24h' ? '24H' : value === '7d' ? '7D' : '30D'}
                                </span>
                                <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="h-56 sm:h-64 md:h-72 w-full">
                    {chartLoading ? (
                        <div className="flex items-end justify-around h-full gap-1 px-2 pb-6">
                            {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3].map((h, i) => (
                                <div
                                    key={i}
                                    className="flex-1 bg-white/5 rounded-sm animate-pulse"
                                    style={{ height: `${h * 100}%`, animationDelay: `${i * 80}ms` }}
                                />
                            ))}
                        </div>
                    ) : !traffic.length ? (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-ivory-dim text-xs">No traffic telemetry recorded for this interval.</p>
                        </div>
                    ) : (
                        <Bar options={chartOptions} data={chartData} />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Overview;