import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

interface DisableAllModalProps {
  roleName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const DisableAllModal: React.FC<DisableAllModalProps> = ({
  roleName,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!roleName) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Disable all ${roleName} features?`}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs py-2 px-4"
          >
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            className="px-5 py-2.5 rounded-sm bg-red-600/90 hover:bg-red-600 text-white font-serif font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_15px_rgba(220,38,38,0.4)] cursor-pointer"
          >
            Disable All
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-sm bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-300 font-serif">
              Bulk Deactivation Warning
            </h4>
            <p className="text-xs text-ivory-dim leading-relaxed">
              This will disable configurable modules and features available to the <span className="text-ivory font-bold">{roleName}</span> role.
            </p>
          </div>
        </div>

        <div className="bg-charcoal-light/60 border border-white/5 p-3 rounded-sm text-xs text-ivory-dim space-y-1.5">
          <span className="font-semibold text-ivory">Safety Protection:</span>
          <p className="text-[11px] text-ivory-dim/80">
            Core protected system features (marked with a gold lock) will remain safely enabled to prevent administrative lockout.
          </p>
        </div>
      </div>
    </Modal>
  );
};
