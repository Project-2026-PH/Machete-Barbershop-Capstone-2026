import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import type { SystemFeature, FeatureStatus } from '@demoshop/shared-types';

interface FeatureConfirmModalProps {
  isOpen: boolean;
  feature: SystemFeature | null;
  targetStatus: FeatureStatus | null;
  onCancel: () => void;
  onConfirm: () => void;
  isSaving: boolean;
}

export const FeatureConfirmModal: React.FC<FeatureConfirmModalProps> = ({
  isOpen,
  feature,
  targetStatus,
  onCancel,
  onConfirm,
  isSaving,
}) => {
  if (!feature || !targetStatus) return null;

  const isDisabling = targetStatus === 'DISABLED';
  const actionLabel = isDisabling
    ? `Disable ${feature.name}`
    : `Set ${feature.name} to Maintenance`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSaving ? () => {} : onCancel}
      title={isDisabling ? 'DISABLE FEATURE?' : 'SET FEATURE TO MAINTENANCE?'}
      size="sm"
    >
      <div className="space-y-4 text-xs text-ivory">
        <div className="flex items-start gap-3 p-3 rounded-sm bg-charcoal border border-white/5">
          <div
            className={`p-2 rounded-xs shrink-0 ${
              isDisabling
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                : 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <div className="font-serif font-bold text-sm text-ivory">
              Changing {feature.name} to {isDisabling ? 'Disabled' : 'Maintenance'}
            </div>
            <p className="text-xs text-ivory-dim/80 mt-1 leading-relaxed">
              {isDisabling
                ? `${feature.name} will become unavailable to customers and normal users immediately.`
                : `${feature.name} will display a scheduled maintenance screen to affected users.`}
            </p>
          </div>
        </div>

        {/* Safety Assurance Callout */}
        <div className="p-3 rounded-sm bg-white/[0.02] border border-white/10 text-xs space-y-1.5 text-ivory-dim/90">
          <div className="font-semibold text-ivory flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-mono">
            <span>Safety Assurance</span>
          </div>
          <p className="text-[11px] leading-relaxed text-ivory-dim/80">
            Existing records, transaction histories, and user data will <strong>NOT</strong> be deleted.
          </p>
        </div>

        {/* Modal Actions */}
        <div className="pt-2 flex items-center justify-end gap-2 border-t border-white/5">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
            className="text-xs px-3 py-1.5 border-white/10 hover:border-white/20"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={isSaving}
            className={`text-xs px-4 py-1.5 font-bold cursor-pointer ${
              isDisabling
                ? 'bg-rose-500 hover:bg-rose-600 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-charcoal'
            }`}
          >
            {isSaving ? 'Updating...' : actionLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
