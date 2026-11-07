import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Lock,
  Copy,
  Check,
  ChevronDown,
  Clock,
  FileText,
  AlertCircle,
} from 'lucide-react';
import Portal from '@/components/common/Portal';
import { Button } from '@/components/ui/Button';
import type { SystemFeature, FeatureStatus } from '@demoshop/shared-types';
import {
  SYSTEM_ROLES,
  getRoleAccessState,
  type SystemRole,
} from '../../utils/feature-compatibility';
import { getFeatureRoutes, getFeatureProductArea, getRoleDisplayName } from './feature-constants';

interface FeatureConfigureDrawerProps {
  feature: SystemFeature | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    targetStatus: FeatureStatus,
    maintenanceMsg: string,
    pendingRoles: Record<string, boolean>
  ) => Promise<void>;
  isSaving: boolean;
  onViewAuditHistory: (feature: SystemFeature) => void;
  isCheckingAuditLogs: boolean;
}

export const FeatureConfigureDrawer: React.FC<FeatureConfigureDrawerProps> = ({
  feature,
  isOpen,
  onClose,
  onSave,
  isSaving,
  onViewAuditHistory,
  isCheckingAuditLogs,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<FeatureStatus>('ENABLED');
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>('');
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Sync state whenever the drawer opens or feature changes
  useEffect(() => {
    if (feature) {
      setSelectedStatus(feature.status);
      setMaintenanceMessage(
        feature.maintenance_message ||
          `${feature.name} is currently undergoing scheduled maintenance. Services will resume shortly.`
      );
      setPendingRoleChanges({});
      setCopiedKey(false);
    }
  }, [feature, isOpen]);

  // Lock body scroll and listen for Escape key
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !isSaving) {
          onClose();
        }
      };
      window.addEventListener('keydown', handleEscape);

      return () => {
        document.body.style.overflow = prevOverflow;
        window.removeEventListener('keydown', handleEscape);
      };
    }
  }, [isOpen, isSaving, onClose]);

  const effectiveRoles = useMemo(() => {
    if (!feature) return [];
    return SYSTEM_ROLES.filter((role) => {
      if (pendingRoleChanges[role] !== undefined) {
        return pendingRoleChanges[role];
      }
      return feature.affected_roles.includes(role);
    });
  }, [feature, pendingRoleChanges]);

  if (!isOpen || !feature) return null;

  const isCore = Boolean(feature.is_core);
  const area = getFeatureProductArea(feature);
  const routes = getFeatureRoutes(feature.id);

  const hasStatusChanged = selectedStatus !== feature.status;
  const hasMaintenanceMessageChanged =
    selectedStatus === 'MAINTENANCE' &&
    maintenanceMessage.trim() !== (feature.maintenance_message || '').trim();
  const hasRoleChanges = Object.keys(pendingRoleChanges).length > 0;
  const hasChanges = hasStatusChanged || hasMaintenanceMessageChanged || hasRoleChanges;

  const handleCopyKey = () => {
    navigator.clipboard.writeText(feature.id);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleToggleRole = (role: SystemRole, makeAllowed: boolean) => {
    const currentlyAllowed = feature.affected_roles.includes(role);
    if (currentlyAllowed === makeAllowed) {
      // Reverted to original
      setPendingRoleChanges((prev) => {
        const next = { ...prev };
        delete next[role];
        return next;
      });
    } else {
      setPendingRoleChanges((prev) => ({
        ...prev,
        [role]: makeAllowed,
      }));
    }
  };

  const handleSubmit = async () => {
    await onSave(selectedStatus, maintenanceMessage, pendingRoleChanges);
  };

  const container =
    typeof document !== 'undefined'
      ? document.getElementById('system-admin-drawer-root') || document.body
      : null;

  return (
    <Portal container={container}>
      <div className="pointer-events-auto fixed lg:absolute inset-0 flex justify-end z-50 overflow-hidden">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
          onClick={isSaving ? undefined : onClose}
        />

        {/* Drawer Panel */}
        <div className="relative w-full sm:max-w-xl bg-charcoal border-l border-white/10 h-full overflow-hidden flex flex-col z-10 shadow-2xl animate-slide-in-right">
          {/* Header */}
          <div className="shrink-0 p-5 border-b border-white/10 bg-charcoal-light flex items-start justify-between gap-3">
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gold font-bold">
                  {area} Area
                </span>
                {isCore && (
                  <span className="px-1.5 py-0.2 rounded-[2px] bg-gold/15 border border-gold/30 text-[9px] font-mono text-gold uppercase">
                    Core Platform
                  </span>
                )}
              </div>
              <h3 className="font-serif font-bold text-lg text-ivory tracking-wide truncate mt-0.5">
                {feature.name}
              </h3>
              <p className="text-xs text-ivory-dim/75 mt-1 leading-relaxed">
                {feature.description}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              aria-label="Close configuration drawer"
              className="p-1.5 rounded-sm text-ivory-dim hover:text-ivory hover:bg-white/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="p-5 space-y-6 flex-1 overflow-y-auto text-xs text-ivory custom-scrollbar">
            {/* 1. STATUS SECTION */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-ivory uppercase tracking-wider font-mono">
                  Status
                </label>
                <span className="text-[11px] text-ivory-dim/60">
                  {isCore ? 'Protected core system feature' : 'Controls feature availability'}
                </span>
              </div>

              {isCore ? (
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-sm flex items-start gap-2.5">
                  <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-ivory-dim/90 leading-relaxed">
                    <strong className="text-emerald-400 block font-sans">Active (Always Required)</strong>
                    This core platform feature is essential for basic operations and security. It cannot be disabled.
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {/* Active Option */}
                    <label
                      className={`flex flex-col p-3 rounded-sm border cursor-pointer transition-all ${
                        selectedStatus === 'ENABLED'
                          ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-xs'
                          : 'bg-charcoal-light border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="drawer_feature_status"
                          value="ENABLED"
                          checked={selectedStatus === 'ENABLED'}
                          onChange={() => setSelectedStatus('ENABLED')}
                          className="accent-emerald-500"
                        />
                        <span className="font-bold text-xs text-ivory">Active</span>
                      </div>
                      <span className="text-[10px] text-ivory-dim/70 mt-1 pl-5">
                        Works normally.
                      </span>
                    </label>

                    {/* Maintenance Option */}
                    <label
                      className={`flex flex-col p-3 rounded-sm border cursor-pointer transition-all ${
                        selectedStatus === 'MAINTENANCE'
                          ? 'bg-amber-500/15 border-amber-500 text-amber-200 shadow-xs'
                          : 'bg-charcoal-light border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="drawer_feature_status"
                          value="MAINTENANCE"
                          checked={selectedStatus === 'MAINTENANCE'}
                          onChange={() => setSelectedStatus('MAINTENANCE')}
                          className="accent-amber-500"
                        />
                        <span className="font-bold text-xs text-ivory">Maintenance</span>
                      </div>
                      <span className="text-[10px] text-ivory-dim/70 mt-1 pl-5">
                        Temporarily offline.
                      </span>
                    </label>

                    {/* Disabled Option */}
                    <label
                      className={`flex flex-col p-3 rounded-sm border cursor-pointer transition-all ${
                        selectedStatus === 'DISABLED'
                          ? 'bg-rose-500/15 border-rose-500 text-rose-300 shadow-xs'
                          : 'bg-charcoal-light border-white/5 text-ivory-dim hover:text-ivory hover:border-white/15'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="drawer_feature_status"
                          value="DISABLED"
                          checked={selectedStatus === 'DISABLED'}
                          onChange={() => setSelectedStatus('DISABLED')}
                          className="accent-rose-500"
                        />
                        <span className="font-bold text-xs text-ivory">Disabled</span>
                      </div>
                      <span className="text-[10px] text-ivory-dim/70 mt-1 pl-5">
                        Turned off.
                      </span>
                    </label>
                  </div>

                  {/* Maintenance Notice text area */}
                  {selectedStatus === 'MAINTENANCE' && (
                    <div className="space-y-1.5 pt-2 animate-fade-in">
                      <label className="block text-xs font-semibold text-amber-300">
                        Maintenance Notice (shown to users):
                      </label>
                      <textarea
                        rows={2}
                        value={maintenanceMessage}
                        onChange={(e) => setMaintenanceMessage(e.target.value)}
                        placeholder="Explain why this service is offline and expected resumption..."
                        className="w-full bg-charcoal-light border border-white/10 rounded-sm p-2.5 text-xs text-ivory focus:outline-none focus:border-gold placeholder-ivory-dim/40 leading-relaxed"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 2. AVAILABLE TO SECTION */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-ivory uppercase tracking-wider font-mono block">
                  Available To
                </label>
                <p className="text-[11px] text-ivory-dim/70 mt-0.5">
                  Select which roles can access this feature.
                </p>
              </div>

              <div className="bg-charcoal-light border border-white/5 rounded-sm divide-y divide-white/5">
                {SYSTEM_ROLES.map((role) => {
                  const compInfo = getRoleAccessState(feature.id, role, effectiveRoles);
                  const isAllowed = effectiveRoles.includes(role);
                  const isStaged = pendingRoleChanges[role] !== undefined;

                  return (
                    <div
                      key={role}
                      className="p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-ivory">
                            {getRoleDisplayName(role)}
                          </span>
                          {role === 'System Admin' && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-gold/15 text-gold border border-gold/30 font-bold uppercase">
                              Superadmin
                            </span>
                          )}
                          {isStaged && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-gold/20 text-gold border border-gold/40">
                              Staged
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-ivory-dim/50 font-mono mt-0.5">
                          {compInfo.state === 'LOCKED' && (
                            <span className="text-amber-400/80">{compInfo.reason}</span>
                          )}
                          {compInfo.state === 'UNAVAILABLE' && (
                            <span className="text-ivory-dim/40">{compInfo.reason}</span>
                          )}
                          {compInfo.isEditable && (
                            <span>{isAllowed ? 'Currently Allowed' : 'Currently Denied'}</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center">
                        {compInfo.state === 'LOCKED' ? (
                          <span className="px-2 py-0.5 rounded-[2px] bg-gold/10 border border-gold/20 text-gold text-[10px] font-mono uppercase flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Locked
                          </span>
                        ) : compInfo.state === 'UNAVAILABLE' ? (
                          <span
                            title={compInfo.reason}
                            className="px-2 py-0.5 rounded-[2px] bg-white/5 border border-white/10 text-ivory-dim/40 text-[10px] font-mono uppercase flex items-center gap-1"
                          >
                            <AlertCircle className="w-2.5 h-2.5" /> Unavailable
                          </span>
                        ) : (
                          <div className="inline-flex rounded-sm p-0.5 bg-charcoal border border-white/10">
                            <button
                              type="button"
                              onClick={() => handleToggleRole(role, true)}
                              className={`px-2.5 py-1 rounded-[2px] text-[10px] font-mono uppercase transition-colors cursor-pointer ${
                                isAllowed
                                  ? 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'
                                  : 'text-ivory-dim/60 hover:text-ivory'
                              }`}
                            >
                              Allow
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleRole(role, false)}
                              className={`px-2.5 py-1 rounded-[2px] text-[10px] font-mono uppercase transition-colors cursor-pointer ${
                                !isAllowed
                                  ? 'bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30'
                                  : 'text-ivory-dim/60 hover:text-ivory'
                              }`}
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. IMPACT SECTION */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-ivory uppercase tracking-wider font-mono block">
                Impact
              </label>
              <div className="p-3.5 bg-charcoal-light border border-white/5 rounded-sm text-xs leading-relaxed text-ivory-dim/80">
                {isCore ? (
                  <span>
                    Core system feature required for platform security and recovery. Status cannot be modified.
                  </span>
                ) : selectedStatus === 'DISABLED' ? (
                  <span>
                    Changing <strong>{feature.name}</strong> to Disabled will make it immediately unavailable to all users across the system. Existing records and historical logs will <strong>NOT</strong> be deleted.
                  </span>
                ) : selectedStatus === 'MAINTENANCE' ? (
                  <span>
                    Normal users will see a scheduled maintenance notice when attempting to access <strong>{feature.name}</strong>. Background operations and stored records remain intact.
                  </span>
                ) : (
                  <span>
                    <strong>{feature.name}</strong> will be active and accessible to all permitted roles across the platform.
                  </span>
                )}
              </div>
            </div>

            {/* 4. ADVANCED DETAILS (COLLAPSED BY DEFAULT) */}
            <details className="group border border-white/5 rounded-sm bg-charcoal-light/60">
              <summary className="flex items-center justify-between p-3.5 cursor-pointer text-xs font-mono uppercase tracking-wider text-ivory-dim/70 hover:text-ivory select-none">
                <span className="font-bold">Advanced Details</span>
                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180 text-gold" />
              </summary>

              <div className="p-4 pt-1 space-y-3.5 text-xs border-t border-white/5">
                {/* Feature Key */}
                <div className="flex items-center justify-between">
                  <span className="text-ivory-dim/60 font-mono text-[11px]">Feature Key</span>
                  <div className="flex items-center gap-1.5">
                    <code className="text-gold font-mono text-xs bg-charcoal px-2 py-0.5 rounded-sm border border-white/5">
                      {feature.id}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="p-1 rounded text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                      title="Copy Feature Key"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Affected Routes */}
                <div className="flex items-start justify-between gap-2">
                  <span className="text-ivory-dim/60 font-mono text-[11px] shrink-0">Affected Routes</span>
                  <div className="flex flex-wrap justify-end gap-1">
                    {routes.map((rt) => (
                      <span
                        key={rt}
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-charcoal text-ivory-dim border border-white/5"
                      >
                        {rt}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Last Updated */}
                <div className="flex items-center justify-between">
                  <span className="text-ivory-dim/60 font-mono text-[11px]">Last Updated</span>
                  <span className="text-[11px] font-mono text-ivory-dim">
                    {feature.updated_at
                      ? new Date(feature.updated_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : 'Initial Deployment'}
                  </span>
                </div>

                {/* Dependencies */}
                <div className="flex items-center justify-between">
                  <span className="text-ivory-dim/60 font-mono text-[11px]">Dependencies</span>
                  <span className="text-[11px] font-mono text-ivory-dim">
                    {feature.dependencies && feature.dependencies.length > 0
                      ? feature.dependencies.join(', ')
                      : 'None'}
                  </span>
                </div>

                {/* Audit History link */}
                <div className="pt-2 border-t border-white/5 flex justify-end">
                  <Button
                    variant="ghost"
                    disabled={isCheckingAuditLogs}
                    onClick={() => onViewAuditHistory(feature)}
                    className="text-xs px-2.5 py-1 text-gold hover:text-gold-light border border-white/10 hover:border-gold/40 cursor-pointer disabled:opacity-50"
                  >
                    <Clock className="w-3 h-3 mr-1.5" />
                    <span>{isCheckingAuditLogs ? 'Checking Audit Logs...' : 'View Audit History →'}</span>
                  </Button>
                </div>
              </div>
            </details>
          </div>

          {/* Pinned Footer */}
          <div className="shrink-0 p-4 bg-charcoal-light border-t border-white/10 flex items-center justify-end gap-2.5">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="text-xs px-3.5 py-1.5 border-white/10 hover:border-white/20"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSaving || (!hasChanges && !isCore)}
              className="text-xs px-4 py-1.5 bg-gold hover:bg-gold-light text-charcoal font-bold cursor-pointer disabled:opacity-50"
            >
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
};
