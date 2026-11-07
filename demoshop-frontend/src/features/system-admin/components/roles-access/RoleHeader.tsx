import React, { useState } from 'react';
import { Lock, Users, ArrowRight, ChevronDown, Copy, Check, Trash2 } from 'lucide-react';
import type { RoleCapabilityDetails } from '../SystemControls';

interface RoleHeaderProps {
  roleDetails: RoleCapabilityDetails;
  accountCount: number;
  onNavigateToAccounts: () => void;
  onOpenRemoveRoleModal?: () => void;
}

export const RoleHeader: React.FC<RoleHeaderProps> = ({
  roleDetails,
  accountCount,
  onNavigateToAccounts,
  onOpenRemoveRoleModal,
}) => {
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const isProtected = Boolean(roleDetails.isCore);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(roleDetails.roleKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  return (
    <div className="space-y-4 border-b border-white/5 pb-5">
      {/* Title & Protected State */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-xl font-bold font-serif text-ivory tracking-wide uppercase">
              {roleDetails.displayName}
            </h2>
            {isProtected && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[2px] bg-gold/15 border border-gold/30 text-gold text-xs font-mono font-bold tracking-wider uppercase">
                <Lock className="w-3 h-3 text-gold" /> Protected Role
              </span>
            )}
          </div>
          <p className="text-xs text-ivory-dim/80 mt-1 leading-relaxed max-w-2xl">
            {roleDetails.description}
          </p>
        </div>

        {/* Account Count Interaction */}
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={onNavigateToAccounts}
            className="group px-3 py-1.5 rounded-sm bg-charcoal border border-white/10 hover:border-gold/40 text-xs font-mono text-ivory-dim hover:text-gold transition-colors inline-flex items-center gap-2 cursor-pointer shadow-xs"
            title={`View all ${roleDetails.displayName} accounts in Account Management`}
          >
            <Users className="w-3.5 h-3.5 text-gold/80" />
            <span className="font-semibold text-ivory group-hover:text-gold">
              {accountCount} active {accountCount === 1 ? 'account' : 'accounts'}
            </span>
            <ArrowRight className="w-3 h-3 text-ivory-dim/50 group-hover:text-gold group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>
      </div>

      {isProtected && (
        <p className="text-[11px] text-ivory-dim/60 font-mono">
          This role is required by the system and cannot be removed.
        </p>
      )}

      {/* Advanced Details Collapsed Section */}
      <details className="group border border-white/5 rounded-sm bg-charcoal/40">
        <summary className="flex items-center justify-between p-3 cursor-pointer text-xs font-mono uppercase tracking-wider text-ivory-dim/60 hover:text-ivory select-none">
          <span className="font-bold">Advanced Details</span>
          <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-gold" />
        </summary>

        <div className="p-4 pt-1 space-y-3 text-xs border-t border-white/5">
          {/* Role Key */}
          <div className="flex items-center justify-between">
            <span className="text-ivory-dim/60 font-mono text-[11px]">Role Key</span>
            <div className="flex items-center gap-1.5">
              <code className="text-gold font-mono text-xs bg-charcoal px-2 py-0.5 rounded-sm border border-white/5">
                {roleDetails.roleKey}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 rounded text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                title="Copy Role Key"
              >
                {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Role Type */}
          <div className="flex items-center justify-between">
            <span className="text-ivory-dim/60 font-mono text-[11px]">Role Type</span>
            <span className="text-xs text-ivory font-mono">
              {isProtected ? 'Core System Role' : 'System Role'}
            </span>
          </div>

          {/* Scope */}
          <div className="flex items-center justify-between">
            <span className="text-ivory-dim/60 font-mono text-[11px]">Access Scope</span>
            <span className="text-xs text-ivory-dim font-mono">
              {roleDetails.authLevel}
            </span>
          </div>

          {/* Accessible Routes */}
          {roleDetails.accessibleRoutes.length > 0 && (
            <div className="flex items-start justify-between gap-2">
              <span className="text-ivory-dim/60 font-mono text-[11px] shrink-0">Accessible Routes</span>
              <div className="flex flex-wrap justify-end gap-1">
                {roleDetails.accessibleRoutes.map((rt) => (
                  <span
                    key={rt}
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-charcoal text-ivory-dim border border-white/5"
                  >
                    {rt}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Remove Role (Custom Roles only) */}
          {!isProtected && onOpenRemoveRoleModal && (
            <div className="pt-2 border-t border-white/5 flex justify-end">
              <button
                type="button"
                onClick={onOpenRemoveRoleModal}
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-mono transition-colors cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove Role [Preview]</span>
              </button>
            </div>
          )}
        </div>
      </details>
    </div>
  );
};
