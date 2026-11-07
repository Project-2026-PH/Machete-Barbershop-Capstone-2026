import React, { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Check, Copy, Database, Mail, RefreshCw } from 'lucide-react';
import { api } from '@/config/api';

interface QueryMetric {
  route: string;
  userEmail: string | null;
  signature: string;
  operation: string;
  queryCount: number;
  rowsReturned: number;
  slowQueryCount: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

interface PerformanceSnapshot {
  capturedAt: string;
  database: {
    queryCount: number;
    rowsReturned: number;
    slowQueryCount: number;
    retryCount: number;
    totalDurationMs: number;
    maxDurationMs: number;
    byPool: Record<string, { queryCount: number; rowsReturned: number; slowQueryCount: number; retryCount: number; totalDurationMs: number; maxDurationMs: number }>;
    pools: Record<string, { total: number; idle: number; waiting: number }>;
    topQueries: QueryMetric[];
    topRoutes: Array<{ route: string; userEmail: string | null; requestCount: number; queryCount: number; rowsReturned: number; slowQueryCount: number; totalDurationMs: number; maxDurationMs: number }>;
  };
  email: { attempted: number; sent: number; failed: number };
  note: string;
}

const formatTime = (value?: string) => value ? new Date(value).toLocaleString() : 'Not captured yet';
const formatMs = (value: number) => `${value.toFixed(1)} ms`;
const toTsvCell = (value: unknown) => String(value ?? '').replace(/[\t\r\n]+/g, ' ');
const copyTable = async (headers: string[], rows: unknown[][]): Promise<void> => {
  const tsv = [headers, ...rows].map((row) => row.map(toTsvCell).join('\t')).join('\n');
  await navigator.clipboard.writeText(tsv);
};

export const DatabaseTrafficMonitor: React.FC = () => {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedTable, setCopiedTable] = useState<'routes' | 'queries' | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await api.get<PerformanceSnapshot>('/api/system-admin/diagnostics/performance');
      setSnapshot(response.data);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not load performance metrics.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const database = snapshot?.database;
  const pools = database?.pools || {};
  const poolMetrics = database?.byPool || {};

  const handleCopy = async (table: 'routes' | 'queries') => {
    try {
      setCopyError(null);
      if (table === 'routes') {
        const rows = (database?.topRoutes || []).map((route) => [route.userEmail, route.route, route.requestCount, route.queryCount, route.requestCount ? (route.queryCount / route.requestCount).toFixed(1) : '', route.rowsReturned, route.queryCount ? (route.rowsReturned / route.queryCount).toFixed(1) : '', route.slowQueryCount, route.totalDurationMs.toFixed(1), route.maxDurationMs.toFixed(1)]);
        await copyTable(['User email', 'Role / endpoint', 'HTTP calls', 'DB calls', 'DB calls / request', 'Rows', 'Rows / DB call', 'Slow', 'Total DB time ms', 'Max DB time ms'], rows);
      } else {
        const rows = (database?.topQueries || []).map((query) => [query.userEmail, query.route, query.operation, query.signature, query.queryCount, query.rowsReturned, query.slowQueryCount, query.totalDurationMs.toFixed(1), query.maxDurationMs.toFixed(1)]);
        await copyTable(['User email', 'Role / endpoint', 'Operation', 'Normalized query', 'Calls', 'Rows returned', 'Slow', 'Total time ms', 'Max time ms'], rows);
      }
      setCopiedTable(table);
      window.setTimeout(() => setCopiedTable((current) => current === table ? null : current), 1800);
    } catch {
      setCopyError('Clipboard access failed. Allow clipboard permission and try again.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-gold"><Activity className="h-5 w-5" /><h1 className="text-xl font-serif font-bold text-ivory">Database &amp; Traffic Monitor</h1></div>
          <p className="mt-1 text-xs text-ivory-dim">Application-side database query, connection pool, and email activity.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-white/10 px-3 text-xs text-ivory hover:border-gold/40 disabled:opacity-60">
          <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </header>

      <div className="flex gap-3 rounded-sm border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-amber-100/90">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <p><strong>Neon billed transfer is not measured here.</strong> This monitor shows app-side activity. Query counts and email totals are process-local; database counters may be drained by the background logger every minute. Use Neon consumption history for the billed public network transfer total. Refresh is manual after the initial load to keep monitor traffic low.</p>
      </div>

      {error && <div role="alert" className="rounded-sm border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-200">{error}</div>}
      {copyError && <div role="alert" className="rounded-sm border border-red-400/30 bg-red-400/5 p-3 text-sm text-red-200">{copyError}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Database} label="DB queries (current window)" value={database?.queryCount ?? '—'} detail={`${database?.slowQueryCount ?? 0} slow · ${database?.retryCount ?? 0} retries`} />
        <MetricCard icon={Database} label="Rows returned (current window)" value={database?.rowsReturned ?? '—'} detail="Result rows observed by the app" />
        <MetricCard icon={Activity} label="Total query time" value={database ? formatMs(database.totalDurationMs) : '—'} detail={`Longest ${database ? formatMs(database.maxDurationMs) : '—'}`} />
        <MetricCard icon={Mail} label="Emails sent (process lifetime)" value={snapshot?.email.sent ?? '—'} detail={`${snapshot?.email.failed ?? 0} failed of ${snapshot?.email.attempted ?? 0} attempts`} />
        <MetricCard icon={Database} label="Pool connections" value={Object.values(pools).reduce((n, pool) => n + pool.total, 0) || '—'} detail={Object.entries(pools).map(([name, pool]) => `${name}: ${pool.waiting} waiting`).join(' · ') || 'No pool data'} />
      </section>

      <section className="rounded-sm border border-white/10 bg-charcoal-light">
        <div className="border-b border-white/5 px-4 py-3">
          <h2 className="text-sm font-semibold text-ivory">Database cost by endpoint and role</h2>
          <p className="mt-1 text-[11px] text-ivory-dim">Ranked by accumulated database execution time. Calls per request can expose fan-out; rows per DB call can expose broad reads. Route labels omit IDs and query parameters. Queries in router middleware before route matching may appear under a shared middleware label.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wide text-ivory-dim"><tr><th className="px-4 py-2">User email</th><th className="px-4 py-2">Role / endpoint</th><th className="px-3 py-2">HTTP calls</th><th className="px-3 py-2">DB calls</th><th className="px-3 py-2">DB calls / request</th><th className="px-3 py-2">Rows</th><th className="px-3 py-2">Rows / DB call</th><th className="px-3 py-2">Slow</th><th className="px-3 py-2">Total DB time</th><th className="px-3 py-2">Max</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {(database?.topRoutes || []).map((route) => <tr key={`${route.route}-${route.userEmail || 'service'}`}><td className="px-4 py-3 text-ivory">{route.userEmail || '—'}</td><td className="max-w-2xl break-words px-4 py-3 font-mono text-ivory">{route.route}</td><td className="px-3 py-3">{route.requestCount}</td><td className="px-3 py-3">{route.queryCount}</td><td className="px-3 py-3">{route.requestCount ? (route.queryCount / route.requestCount).toFixed(1) : '—'}</td><td className="px-3 py-3">{route.rowsReturned}</td><td className="px-3 py-3">{route.queryCount ? (route.rowsReturned / route.queryCount).toFixed(1) : '—'}</td><td className="px-3 py-3">{route.slowQueryCount}</td><td className="px-3 py-3">{formatMs(route.totalDurationMs)}</td><td className="px-3 py-3">{formatMs(route.maxDurationMs)}</td></tr>)}
              {!database?.topRoutes?.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-ivory-dim">No database operations in the current metrics window.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/5 px-4 py-3"><button type="button" onClick={() => void handleCopy('routes')} className="inline-flex items-center gap-2 text-xs text-gold hover:text-ivory">{copiedTable === 'routes' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedTable === 'routes' ? 'Copied endpoint table' : 'Copy endpoint table'}</button></div>
      </section>

      <section className="rounded-sm border border-white/10 bg-charcoal-light">
        <div className="flex flex-col gap-1 border-b border-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-ivory">Most expensive query signatures by endpoint</h2>
          <span className="text-[11px] text-ivory-dim">Snapshot captured {formatTime(snapshot?.capturedAt)}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-xs">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-wide text-ivory-dim"><tr><th className="px-4 py-2">User email</th><th className="px-4 py-2">Role / endpoint</th><th className="px-4 py-2">Operation / normalized query</th><th className="px-3 py-2">Calls</th><th className="px-3 py-2">Rows returned</th><th className="px-3 py-2">Slow</th><th className="px-3 py-2">Total</th><th className="px-3 py-2">Max</th></tr></thead>
            <tbody className="divide-y divide-white/5">
              {(database?.topQueries || []).map((query, index) => <tr key={`${query.route}-${query.userEmail || 'service'}-${query.signature}-${index}`} className="align-top"><td className="px-4 py-3 text-ivory">{query.userEmail || '—'}</td><td className="max-w-xs break-words px-4 py-3 font-mono text-ivory">{query.route}</td><td className="max-w-3xl px-4 py-3"><span className="mb-1 block font-mono text-gold">{query.operation}</span><code className="block whitespace-normal break-words text-[11px] text-ivory-dim">{query.signature}</code></td><td className="px-3 py-3 text-ivory">{query.queryCount}</td><td className="px-3 py-3 text-ivory">{query.rowsReturned}</td><td className="px-3 py-3 text-ivory">{query.slowQueryCount}</td><td className="px-3 py-3 text-ivory">{formatMs(query.totalDurationMs)}</td><td className="px-3 py-3 text-ivory">{formatMs(query.maxDurationMs)}</td></tr>)}
              {!database?.topQueries?.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-ivory-dim">No query samples in the current metrics window.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="border-t border-white/5 px-4 py-3"><button type="button" onClick={() => void handleCopy('queries')} className="inline-flex items-center gap-2 text-xs text-gold hover:text-ivory">{copiedTable === 'queries' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedTable === 'queries' ? 'Copied query table' : 'Copy query table'}</button></div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Object.entries(poolMetrics).map(([name, metric]) => {
          const pool = pools[name];
          return <div key={name} className="rounded-sm border border-white/10 bg-charcoal-light p-4">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gold">{name} pool</h3>
            <div className="grid grid-cols-2 gap-3 text-xs text-ivory-dim"><span>Active connections: <b className="text-ivory">{pool?.total ?? '—'}</b></span><span>Idle: <b className="text-ivory">{pool?.idle ?? '—'}</b></span><span>Waiting: <b className="text-ivory">{pool?.waiting ?? '—'}</b></span><span>Queries: <b className="text-ivory">{metric.queryCount}</b></span><span>Rows returned: <b className="text-ivory">{metric.rowsReturned}</b></span><span>Slow queries: <b className="text-ivory">{metric.slowQueryCount}</b></span><span>Retries: <b className="text-ivory">{metric.retryCount}</b></span></div>
          </div>;
        })}
      </section>
      {snapshot?.note && <p className="text-[11px] leading-relaxed text-ivory-dim/70">{snapshot.note}</p>}
    </div>
  );
};

const MetricCard: React.FC<{ icon: typeof Database; label: string; value: string | number; detail: string }> = ({ icon: Icon, label, value, detail }) => (
  <div className="rounded-sm border border-white/10 bg-charcoal-light p-4">
    <div className="flex items-center gap-2 text-ivory-dim"><Icon className="h-4 w-4 text-gold" /><span className="text-[10px] uppercase tracking-wide">{label}</span></div>
    <div className="mt-2 text-2xl font-semibold text-ivory">{value}</div>
    <div className="mt-1 text-[11px] text-ivory-dim">{detail}</div>
  </div>
);
