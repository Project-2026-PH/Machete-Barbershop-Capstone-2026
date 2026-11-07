import React, { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useFeatures } from '@/context/FeatureContext';
import { useAuth } from '@/components/auth/AuthContext';
import { Wrench, ShieldAlert, ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FeatureGuardProps {
  featureId: string;
  featureName?: string;
  children: ReactNode;
}

export const FeatureGuard: React.FC<FeatureGuardProps> = ({
  featureId,
  featureName,
  children,
}) => {
  const { getFeatureState, getMaintenanceMessage, refreshFeatures, loading, hasAccess } = useFeatures();
  const { role } = useAuth();
  const navigate = useNavigate();

  // Still fetching initial status
  if (loading) {
    return <>{children}</>;
  }

  const state = getFeatureState(featureId);
  const displayName = featureName || featureId.replace(/_/g, ' ');

  // 1. Layer 1: Global Feature State (DISABLED or MAINTENANCE)
  if (state === 'MAINTENANCE') {
    const message =
      getMaintenanceMessage(featureId) ||
      `The ${displayName} module is temporarily undergoing scheduled maintenance. Please check back shortly.`;

    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-charcoal-light border border-gold/30 rounded-sm p-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-center relative overflow-hidden">
          {/* Subtle gold glow accent */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-gold/10 rounded-full blur-2xl pointer-events-none" />

          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-gold/15 border border-gold/40 flex items-center justify-center text-gold shadow-[0_0_15px_rgba(212,175,55,0.25)]">
            <Wrench className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono uppercase tracking-wider mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Scheduled Maintenance
          </div>

          <h2 className="text-xl font-bold font-serif text-ivory mb-2 tracking-wide">
            {displayName.toUpperCase()}
          </h2>

          <p className="text-ivory-dim/80 text-sm leading-relaxed mb-6">
            {message}
          </p>

          <div className="p-3 bg-white/[0.03] border border-white/5 rounded text-xs text-ivory-dim/60 mb-6">
            Existing records and history remain safe and intact. Service will automatically resume once maintenance is completed.
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => refreshFeatures()}
              className="border-white/10 hover:border-gold text-xs px-4 py-2"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Check Again
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate('/')}
              className="text-xs px-4 py-2"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Return Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Layer 1 (cont): Global Disabled State
  if (state === 'DISABLED') {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-charcoal-light border border-white/10 rounded-sm p-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-center relative overflow-hidden">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-ivory-dim">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono uppercase tracking-wider mb-3">
            Feature Unavailable
          </div>

          <h2 className="text-xl font-bold font-serif text-ivory mb-2 tracking-wide">
            {displayName.toUpperCase()}
          </h2>

          <p className="text-ivory-dim/80 text-sm leading-relaxed mb-6">
            This feature has been temporarily taken offline by system administrators. Please check back later or contact customer support.
          </p>

          <div className="p-3 bg-white/[0.03] border border-white/5 rounded text-xs text-ivory-dim/60 mb-6">
            Existing customer profiles, receipts, and past visit data remain securely archived.
          </div>

          <Button
            variant="primary"
            onClick={() => navigate('/')}
            className="text-xs px-4 py-2"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Return Home
          </Button>
        </div>
      </div>
    );
  }

  // 3. Layer 2: Role Access Authorization
  if (!hasAccess(featureId)) {
    const rolePath = role === 'Cashier' ? '/cashier' : role === 'System Admin' || role === 'SystemAdmin' ? '/system-admin' : role === 'Admin' || role === 'ShopAdmin' || role === 'Owner' ? '/admin' : role === 'Barber' ? '/barber' : role === 'Inventory Manager' ? '/inventory-manager' : '/';

    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full bg-charcoal-light border border-amber-500/30 rounded-sm p-8 shadow-[0_10px_30px_rgba(0,0,0,0.5)] text-center relative overflow-hidden">
          <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono uppercase tracking-wider mb-3">
            Access Restricted
          </div>

          <h2 className="text-xl font-bold font-serif text-ivory mb-2 tracking-wide">
            ACCESS DENIED: {displayName.toUpperCase()}
          </h2>

          <p className="text-ivory-dim/80 text-sm leading-relaxed mb-6">
            Your role (<span className="text-gold font-semibold">{role || 'Current User'}</span>) is not currently authorized to access this feature. Access has been restricted in System Controls.
          </p>

          <div className="p-3 bg-white/[0.03] border border-white/5 rounded text-xs text-ivory-dim/60 mb-6">
            If you need access to this operational module, please contact a System Administrator to update your role permissions.
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => refreshFeatures()}
              className="border-white/10 hover:border-gold text-xs px-4 py-2"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Re-check Access
            </Button>
            <Button
              variant="primary"
              onClick={() => navigate(rolePath)}
              className="text-xs px-4 py-2"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Return to Workspace
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
