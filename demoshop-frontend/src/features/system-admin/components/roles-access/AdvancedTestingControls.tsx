import React from 'react';
import { Wrench, ChevronDown, Store, Upload, AlertTriangle } from 'lucide-react';

interface AdvancedTestingControlsProps {
  selectedRoleKey: string;
  bypassTimeRestrictions: boolean;
  onOpenBypassTimeModal: (action: 'grant' | 'revoke') => void;
  isUpdatingBypass: boolean;
  bypassReceiptOcr: boolean;
  onOpenBypassReceiptModal: (action: 'grant' | 'revoke') => void;
  isUpdatingReceiptBypass: boolean;
}

export const AdvancedTestingControls: React.FC<AdvancedTestingControlsProps> = ({
  selectedRoleKey,
  bypassTimeRestrictions,
  onOpenBypassTimeModal,
  isUpdatingBypass,
  bypassReceiptOcr,
  onOpenBypassReceiptModal,
  isUpdatingReceiptBypass,
}) => {
  // Only display relevant testing overrides for the roles they affect (Customer or Cashier) or admin inspection
  const hasCustomerOverride = selectedRoleKey === 'Customer' || selectedRoleKey === 'System Admin';
  const hasCashierOverride = selectedRoleKey === 'Cashier' || selectedRoleKey === 'System Admin';

  if (!hasCustomerOverride && !hasCashierOverride) return null;

  return (
    <details className="group border border-amber-500/20 bg-amber-500/[0.02] rounded-sm mt-6">
      <summary className="p-3.5 flex items-center justify-between cursor-pointer select-none text-xs text-amber-300 font-mono uppercase tracking-wider font-bold">
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-amber-400" />
          <span>Advanced Testing Controls</span>
        </div>
        <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-amber-300/70" />
      </summary>

      <div className="p-4 pt-1 space-y-4 border-t border-amber-500/15 text-xs">
        <div className="flex items-center gap-2 p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-200 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span>
            These settings are testing overrides intended for QA and staging environments.
          </span>
        </div>

        {/* 1. Payment Screenshot OCR Bypass (for Customer) */}
        {hasCustomerOverride && (
          <div className="p-3 bg-charcoal border border-white/5 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="text-xs font-bold text-ivory flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-gold/80 shrink-0" />
                <span>Bypass Payment Screenshot OCR</span>
                <span className="px-1.5 py-0.2 rounded-[2px] bg-amber-500/15 border border-amber-500/30 text-[9px] font-mono text-amber-300 uppercase">
                  Testing Mode
                </span>
              </div>
              <p className="text-[11px] text-ivory-dim/70">
                Allow uploading any image without OCR verification during customer booking checkout.
              </p>
              <div className="text-[10px] font-mono mt-0.5 text-ivory-dim/50">
                Current: {bypassReceiptOcr ? 'Bypass Active (Testing)' : 'Strict OCR Enforcement Active'}
              </div>
            </div>

            <div className="shrink-0">
              <div className="inline-flex rounded-sm p-0.5 bg-charcoal-light border border-white/10">
                <button
                  type="button"
                  disabled={isUpdatingReceiptBypass}
                  onClick={() => {
                    if (!bypassReceiptOcr) onOpenBypassReceiptModal('grant');
                  }}
                  className={`px-3 py-1 rounded-[2px] text-xs font-mono uppercase transition-colors cursor-pointer disabled:opacity-50 ${
                    bypassReceiptOcr
                      ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                      : 'text-ivory-dim/60 hover:text-ivory'
                  }`}
                >
                  Allowed
                </button>
                <button
                  type="button"
                  disabled={isUpdatingReceiptBypass}
                  onClick={() => {
                    if (bypassReceiptOcr) onOpenBypassReceiptModal('revoke');
                  }}
                  className={`px-3 py-1 rounded-[2px] text-xs font-mono uppercase transition-colors cursor-pointer disabled:opacity-50 ${
                    !bypassReceiptOcr
                      ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                      : 'text-ivory-dim/60 hover:text-ivory'
                  }`}
                >
                  Denied
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Appointment Time Restrictions Bypass (for Cashier) */}
        {hasCashierOverride && (
          <div className="p-3 bg-charcoal border border-white/5 rounded-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="text-xs font-bold text-ivory flex items-center gap-2">
                <Store className="w-3.5 h-3.5 text-gold/80 shrink-0" />
                <span>Bypass Appointment Time Restrictions</span>
                <span className="px-1.5 py-0.2 rounded-[2px] bg-amber-500/15 border border-amber-500/30 text-[9px] font-mono text-amber-300 uppercase">
                  Testing Mode
                </span>
              </div>
              <p className="text-[11px] text-ivory-dim/70">
                Bypass appointment arrival schedule time gates for Check In and No Show actions on Cashier Queue.
              </p>
              <div className="text-[10px] font-mono mt-0.5 text-ivory-dim/50">
                Current: {bypassTimeRestrictions ? 'Time Gates Bypassed (Testing)' : 'Strict Enforcement Active'}
              </div>
            </div>

            <div className="shrink-0">
              <div className="inline-flex rounded-sm p-0.5 bg-charcoal-light border border-white/10">
                <button
                  type="button"
                  disabled={isUpdatingBypass}
                  onClick={() => {
                    if (!bypassTimeRestrictions) onOpenBypassTimeModal('grant');
                  }}
                  className={`px-3 py-1 rounded-[2px] text-xs font-mono uppercase transition-colors cursor-pointer disabled:opacity-50 ${
                    bypassTimeRestrictions
                      ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                      : 'text-ivory-dim/60 hover:text-ivory'
                  }`}
                >
                  Allowed
                </button>
                <button
                  type="button"
                  disabled={isUpdatingBypass}
                  onClick={() => {
                    if (bypassTimeRestrictions) onOpenBypassTimeModal('revoke');
                  }}
                  className={`px-3 py-1 rounded-[2px] text-xs font-mono uppercase transition-colors cursor-pointer disabled:opacity-50 ${
                    !bypassTimeRestrictions
                      ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                      : 'text-ivory-dim/60 hover:text-ivory'
                  }`}
                >
                  Denied
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </details>
  );
};
