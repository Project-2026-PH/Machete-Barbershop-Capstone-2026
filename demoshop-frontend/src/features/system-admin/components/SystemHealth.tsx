import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Activity,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    Server,
    Database,
    Zap,
    Info,
    Clock,
    Globe,
    Gauge
} from 'lucide-react';
import { api } from '@/config/api';
import { formatManilaAuditTimestamp } from '@/utils/manila-date';
import { Button } from '@/components/ui/Button';

type HealthStatus = 'CHECKING' | 'OPERATIONAL' | 'DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN';

interface ServiceHealth {
    database?: string;
    redis?: string;
    [key: string]: any;
}

interface PerformanceMetrics {
    databaseResponseTimeMs?: number | null;
    [key: string]: any;
}

interface HealthResponse {
    status?: string;
    services?: ServiceHealth;
    performance?: PerformanceMetrics;
    timestamp?: string;
}

export const SystemHealth: React.FC = () => {
    const [overallStatus, setOverallStatus] = useState<HealthStatus>('CHECKING');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
    const [serviceData, setServiceData] = useState<ServiceHealth | null>(null);
    const [apiReachable, setApiReachable] = useState<boolean | null>(null);
    const [apiResponseTimeMs, setApiResponseTimeMs] = useState<number | null>(null);
    const [dbResponseTimeMs, setDbResponseTimeMs] = useState<number | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Track active fetch to avoid overlapping requests
    const isFetchingRef = useRef(false);

    const checkHealth = useCallback(async (isManualRefresh = false) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        if (isManualRefresh) {
            setIsRefreshing(true);
        }

        const apiStart = performance.now();

        try {
            // Using existing /api/health endpoint
            const res = await api.get<HealthResponse>('/api/health', {
                timeout: 10000,
                headers: { 'Cache-Control': 'no-cache' },
            });

            const roundTripDuration = Math.round(performance.now() - apiStart);
            setApiResponseTimeMs(roundTripDuration);

            const data = res.data;
            const now = new Date();
            setLastCheckedAt(now);
            setFetchError(null);
            setApiReachable(true);

            const services = data.services || {};
            setServiceData(services);
            setDbResponseTimeMs(data.performance?.databaseResponseTimeMs ?? null);

            // Determine overall status based on actual returned services
            const isDbConnected = services.database === 'connected';
            const isRedisHealthy = !services.redis || services.redis === 'ready';

            if (data.status === 'OK' && isDbConnected && isRedisHealthy) {
                setOverallStatus('OPERATIONAL');
            } else if (data.status === 'OK' && isDbConnected && !isRedisHealthy) {
                // Secondary service (cache) degraded but core DB and API functioning
                setOverallStatus('DEGRADED');
            } else if (!isDbConnected) {
                // Critical database service unavailable
                setOverallStatus('DEGRADED');
            } else {
                setOverallStatus('DEGRADED');
            }
        } catch (err: any) {
            const roundTripDuration = Math.round(performance.now() - apiStart);
            const now = new Date();
            setLastCheckedAt(now);

            if (err.response) {
                // Application API responded with an error status (e.g. 503 DEGRADED due to DB outage)
                setApiReachable(true);
                setApiResponseTimeMs(roundTripDuration);
                const data = err.response.data;
                const services = data?.services || { database: 'unavailable' };
                setServiceData(services);
                setDbResponseTimeMs(null);
                setOverallStatus('DEGRADED');
                setFetchError('One or more critical platform services reported an outage.');
            } else {
                // Application API was completely unreachable or request timed out
                setApiReachable(false);
                setApiResponseTimeMs(null);
                setServiceData(null);
                setDbResponseTimeMs(null);
                setOverallStatus('UNAVAILABLE');
                setFetchError('Application API is unreachable or request timed out.');
            }
        } finally {
            isFetchingRef.current = false;
            setIsRefreshing(false);
        }
    }, []);

    // Initial check on mount
    useEffect(() => {
        checkHealth(false);
    }, [checkHealth]);

    // Controlled auto-refresh every 45s (pauses when page/tab is hidden)
    useEffect(() => {
        const intervalId = setInterval(() => {
            if (!document.hidden && !isFetchingRef.current) {
                checkHealth(false);
            }
        }, 45000);

        return () => clearInterval(intervalId);
    }, [checkHealth]);

    const getStatusBadge = (status: HealthStatus) => {
        switch (status) {
            case 'OPERATIONAL':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        OPERATIONAL
                    </span>
                );
            case 'DEGRADED':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
                        DEGRADED
                    </span>
                );
            case 'UNAVAILABLE':
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_12px_rgba(239,68,68,0.15)]">
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        UNAVAILABLE
                    </span>
                );
            case 'CHECKING':
            default:
                return (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-gold/15 text-gold border border-gold/30">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-gold" />
                        CHECKING
                    </span>
                );
        }
    };

    const renderServiceRow = (
        name: string,
        description: string,
        icon: React.ComponentType<{ className?: string }>,
        statusComponent: React.ReactNode
    ) => {
        const Icon = icon;
        return (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-sm border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-sm bg-white/5 border border-white/10 text-gold shrink-0">
                        <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-medium text-ivory tracking-wide">{name}</div>
                        <div className="text-xs text-ivory-dim/60 truncate font-mono">{description}</div>
                    </div>
                </div>
                <div className="flex items-center shrink-0 sm:self-center self-start pl-11 sm:pl-0">
                    {statusComponent}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in w-full max-w-5xl mx-auto pb-12 select-none">
            {/* Top Header Card */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm p-5 sm:p-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-gold/60 to-transparent"></div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Activity className="w-5 h-5 text-gold" />
                            <h2 className="text-lg sm:text-xl font-serif font-bold text-ivory tracking-wide">
                                System Health
                            </h2>
                        </div>
                        <p className="text-xs text-ivory-dim/80">
                            Monitor the availability and operational status of DemoShop's core platform services.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-auto">
                        {getStatusBadge(overallStatus)}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => checkHealth(true)}
                            disabled={isRefreshing || overallStatus === 'CHECKING'}
                            className="text-xs border-white/10 text-ivory-dim hover:text-ivory hover:border-gold/40 flex items-center gap-1.5 h-8 px-3"
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-gold' : ''}`} />
                            <span>{isRefreshing ? 'Checking...' : 'Refresh'}</span>
                        </Button>
                    </div>
                </div>

                {fetchError && (
                    <div className="mt-4 p-3 rounded-sm bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                        <span>{fetchError}</span>
                    </div>
                )}
            </div>

            {/* Service Status List */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl">
                <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                        <Server className="w-3.5 h-3.5" />
                        Service Status
                    </h3>
                    <span className="text-[10px] font-mono text-ivory-dim/50 uppercase">
                        Verified via /api/health
                    </span>
                </div>

                <div className="p-4 sm:p-5 space-y-2.5">
                    {/* 1. Application API */}
                    {renderServiceRow(
                        'Application API',
                        'DemoShop Express backend routing & application service layer',
                        Globe,
                        overallStatus === 'CHECKING' ? (
                            <span className="text-xs font-mono text-ivory-dim/50 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                                Checking...
                            </span>
                        ) : apiReachable ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Operational
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-red-400">
                                <XCircle className="w-3.5 h-3.5" />
                                Unreachable
                            </span>
                        )
                    )}

                    {/* 2. PostgreSQL Database (Supabase) */}
                    {renderServiceRow(
                        'PostgreSQL Database',
                        'Supabase connection pool & relational persistence layer',
                        Database,
                        overallStatus === 'CHECKING' ? (
                            <span className="text-xs font-mono text-ivory-dim/50 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                                Checking...
                            </span>
                        ) : serviceData?.database === 'connected' ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Connected
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-red-400">
                                <XCircle className="w-3.5 h-3.5" />
                                Unavailable
                            </span>
                        )
                    )}

                    {/* 3. Cache Engine (Redis) - Only rendered if reported by backend */}
                    {serviceData?.redis !== undefined &&
                        renderServiceRow(
                            'Cache & Rate-Limit Engine',
                            'Redis / Upstash distributed memory state',
                            Zap,
                            overallStatus === 'CHECKING' ? (
                                <span className="text-xs font-mono text-ivory-dim/50 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                                    Checking...
                                </span>
                            ) : serviceData.redis === 'ready' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-emerald-400">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Ready
                                </span>
                            ) : serviceData.redis === 'connecting' ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-300">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Connecting
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-ivory-dim/60">
                                    <span className="w-2 h-2 rounded-full bg-white/30"></span>
                                    Disconnected
                                </span>
                            )
                        )}
                </div>
            </div>

            {/* Performance Section */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl">
                <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                        <Gauge className="w-3.5 h-3.5" />
                        Performance
                    </h3>
                    <span className="text-[10px] font-mono text-ivory-dim/50 uppercase">
                        Latest Telemetry
                    </span>
                </div>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* API Response Time */}
                    <div className="p-4 rounded-sm bg-white/[0.02] border border-white/5 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Globe className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span className="text-xs font-medium text-ivory tracking-wide">API Response Time</span>
                            </div>
                            <p className="text-[11px] text-ivory-dim/60 font-mono">
                                Latest /api/health round-trip response from client.
                            </p>
                        </div>
                        <div className="pt-1">
                            {overallStatus === 'CHECKING' ? (
                                <span className="text-xs font-mono text-ivory-dim/50 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                                    Checking...
                                </span>
                            ) : apiResponseTimeMs !== null ? (
                                <span className="text-xl font-mono font-bold text-ivory tracking-tight">
                                    {apiResponseTimeMs}{' '}
                                    <span className="text-xs font-normal text-ivory-dim/70">ms</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-red-400">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Unavailable
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Database Response Time */}
                    <div className="p-4 rounded-sm bg-white/[0.02] border border-white/5 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Database className="w-3.5 h-3.5 text-gold shrink-0" />
                                <span className="text-xs font-medium text-ivory tracking-wide">Database Response Time</span>
                            </div>
                            <p className="text-[11px] text-ivory-dim/60 font-mono">
                                Latest database health-check response on server.
                            </p>
                        </div>
                        <div className="pt-1">
                            {overallStatus === 'CHECKING' ? (
                                <span className="text-xs font-mono text-ivory-dim/50 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-ping"></span>
                                    Checking...
                                </span>
                            ) : dbResponseTimeMs !== null ? (
                                <span className="text-xl font-mono font-bold text-ivory tracking-tight">
                                    {dbResponseTimeMs}{' '}
                                    <span className="text-xs font-normal text-ivory-dim/70">ms</span>
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-amber-400">
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    Unavailable
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* System Information (Read-Only Genuine Metadata) */}
            <div className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden shadow-2xl">
                <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-gold flex items-center gap-2">
                        <Info className="w-3.5 h-3.5" />
                        System Information
                    </h3>
                </div>

                <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                            Runtime Environment
                        </span>
                        <span className="text-sm font-mono font-semibold text-ivory block capitalize">
                            {import.meta.env.MODE || 'Production'}
                        </span>
                    </div>

                    <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 block">
                            Health Probe Endpoint
                        </span>
                        <span className="text-sm font-mono font-semibold text-ivory block">
                            /api/health
                        </span>
                    </div>

                    <div className="p-3.5 rounded-sm bg-white/[0.02] border border-white/5 space-y-1 sm:col-span-2">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/60 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-gold" />
                            Last Health Check (Asia/Manila)
                        </span>
                        <span className="text-sm font-mono font-semibold text-ivory block">
                            {lastCheckedAt
                                ? formatManilaAuditTimestamp(lastCheckedAt, 'inline')
                                : 'Checking in progress...'}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemHealth;
