import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Clock, History, Link2, LogOut, MailCheck, Settings, ShieldCheck, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '@/config/api';
import { useAuth } from '@/components/auth/AuthContext';
import { Button } from '@/components/ui/Button';

type GuestHistoryItem = {
  id: number;
  created_at?: string;
  date?: string;
  service?: string;
  service_name?: string;
  barber?: string;
  barber_name?: string;
  status?: string;
  payment_status?: string;
  total_amount?: number | string | null;
};

type GuestSession = {
  guestReference: string;
  customerName: string;
  businessDate: string;
  linked?: boolean;
  history: GuestHistoryItem[];
};

const GUEST_LINK_PENDING = 'demoshop:guest-link-pending';

const readTokenFromHash = (): string | null => {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const token = params.get('token');
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  return token;
};

const formatDate = (item: GuestHistoryItem): string => {
  const value = item.date || item.created_at;
  if (!value) return 'Date unavailable';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { dateStyle: 'medium' });
};

export const GuestOverview: React.FC = () => {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [activeTab, setActiveTab] = useState<'history' | 'settings'>('history');
  const [session, setSession] = useState<GuestSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkMessage, setLinkMessage] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);

  const loadSession = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = readTokenFromHash();
      if (token) {
        await api.post('/api/guest/session/redeem', { token });
      }
      const response = await api.get<GuestSession>('/api/guest/session');
      setSession(response.data);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'This guest QR is invalid, expired, or has already been used.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const linkGuestHistory = useCallback(async () => {
    if (!user || role !== 'Customer' || !session || isLinking) return;
    setIsLinking(true);
    setLinkMessage(null);
    try {
      await api.post('/api/guest/session/link');
      localStorage.removeItem(GUEST_LINK_PENDING);
      window.location.replace('/dashboard');
    } catch (requestError: any) {
      setLinkMessage(requestError.response?.data?.error || 'We could not link this history to your account.');
      setIsLinking(false);
    }
  }, [isLinking, role, session, user]);

  useEffect(() => {
    if (user && role === 'Customer' && session && !session.linked) {
      void linkGuestHistory();
    }
  }, [linkGuestHistory, session, user]);

  const startAccountLink = (destination: '/login' | '/register') => {
    localStorage.setItem(GUEST_LINK_PENDING, '1');
    navigate(destination);
  };

  const endGuestSession = async () => {
    try {
      await api.post('/api/guest/session/logout');
    } finally {
      navigate('/', { replace: true });
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-charcoal text-ivory flex items-center justify-center">Loading your guest overview...</div>;
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-charcoal text-ivory flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-5">
          <AlertCircle className="mx-auto h-12 w-12 text-gold" />
          <h1 className="text-3xl font-serif font-bold">Guest access unavailable</h1>
          <p className="text-ivory-dim">{error || 'This guest session is no longer available.'}</p>
          <Button variant="outline" onClick={() => navigate('/')}>Return to DemoShop</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal text-ivory px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-6 border-b border-white/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <img src="/demoshop_logo.png" alt="DemoShop" width={192} height={48} decoding="async" className="h-12 w-auto" />
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-gold">Guest overview</p>
              <h1 className="text-3xl font-serif font-bold">Welcome, {session.customerName}</h1>
              <p className="text-sm text-ivory-dim">Reference: <span className="text-gold">{session.guestReference}</span></p>
            </div>
          </div>
          <Button variant="outline" onClick={() => void endGuestSession()} className="flex items-center gap-2 self-start">
            <LogOut className="h-4 w-4" /> End guest session
          </Button>
        </header>

        <nav className="mt-6 flex gap-2 border-b border-white/10" aria-label="Guest sections">
          <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-4 py-3 text-sm ${activeTab === 'history' ? 'border-b-2 border-gold text-gold' : 'text-ivory-dim'}`}>
            <History className="h-4 w-4" /> Recent History
          </button>
          <button onClick={() => setActiveTab('settings')} className={`flex items-center gap-2 px-4 py-3 text-sm ${activeTab === 'settings' ? 'border-b-2 border-gold text-gold' : 'text-ivory-dim'}`}>
            <Settings className="h-4 w-4" /> Settings
          </button>
        </nav>

        {activeTab === 'history' ? (
          <section className="mt-8 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold">Recent History</p>
              <h2 className="mt-1 text-2xl font-serif font-bold">Your visits</h2>
              <p className="mt-1 text-sm text-ivory-dim">Guest history is read-only. Create an account to keep it with your customer profile.</p>
            </div>
            {session.history.length === 0 ? (
              <div className="rounded border border-dashed border-white/15 p-10 text-center text-ivory-dim">No completed visits are available yet.</div>
            ) : session.history.map((item) => (
              <article key={item.id} className="rounded border border-white/10 bg-charcoal-light/50 p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gold"><ShieldCheck className="h-4 w-4" /> {item.status || 'Visit'}</div>
                    <h3 className="mt-2 text-xl font-serif font-bold">{item.service_name || item.service || 'Barbershop service'}</h3>
                    <div className="mt-2 flex flex-wrap gap-4 text-xs text-ivory-dim"><span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {formatDate(item)}</span><span>Barber: {item.barber_name || item.barber || 'Unassigned'}</span></div>
                  </div>
                  <p className="text-xl font-serif font-bold text-gold">₱{item.total_amount ?? 0}</p>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="rounded border border-white/10 bg-charcoal-light/50 p-6">
              <div className="flex items-center gap-3"><UserRound className="h-5 w-5 text-gold" /><h2 className="text-xl font-serif font-bold">Guest details</h2></div>
              <dl className="mt-5 space-y-4 text-sm"><div><dt className="text-ivory-dim">Name</dt><dd>{session.customerName}</dd></div><div><dt className="text-ivory-dim">Guest reference</dt><dd className="text-gold">{session.guestReference}</dd></div><div><dt className="text-ivory-dim">Account status</dt><dd>{session.linked ? 'Linked to a Customer account' : 'Temporary guest session'}</dd></div></dl>
            </div>
            <div className="rounded border border-gold/30 bg-gold/5 p-6">
              <div className="flex items-center gap-3"><Link2 className="h-5 w-5 text-gold" /><h2 className="text-xl font-serif font-bold">Keep your history</h2></div>
              <p className="mt-4 text-sm leading-6 text-ivory-dim">Link this visit history to a verified Customer account. Your guest reference stays as the history provenance.</p>
              {linkMessage && <p className="mt-4 text-sm text-red-300">{linkMessage}</p>}
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="primary" onClick={() => startAccountLink('/register')} className="flex items-center gap-2"><MailCheck className="h-4 w-4" /> Verify email</Button>
                <Button variant="outline" onClick={() => startAccountLink('/login')}>Sign in to link</Button>
                <Button variant="outline" onClick={() => { localStorage.setItem(GUEST_LINK_PENDING, '1'); window.location.href = '/api/auth/google/url'; }}>Continue with Google</Button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default GuestOverview;