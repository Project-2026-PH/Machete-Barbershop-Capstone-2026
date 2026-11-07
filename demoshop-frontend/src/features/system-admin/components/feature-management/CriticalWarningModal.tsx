import React from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { RoleModule } from './types';

interface CriticalWarningModalProps {
  module: RoleModule | null;
  roleName: string | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const CriticalWarningModal: React.FC<CriticalWarningModalProps> = ({
  module,
  roleName,
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!module) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Critical Module Warning"
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
            Confirm Disable
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-sm bg-red-500/10 border border-red-500/30">
          <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-red-300 font-serif">
              Caution: High-Risk Action
            </h4>
            <p className="text-xs text-ivory-dim leading-relaxed">
              You are about to turn off <span className="text-ivory font-bold">{module.name}</span> for the <span className="text-gold font-bold">{roleName}</span> role.
            </p>
          </div>
        </div>

        <div className="bg-charcoal-light/60 border border-white/5 p-3 rounded-sm text-xs text-ivory-dim space-y-2">
          <div className="flex items-center gap-2 text-ivory font-medium">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Impact of Disabling:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-ivory-dim/80">
            {module.id === 'sys_users' && (
              <li>Admins cannot inspect user accounts, verify credentials, or look up customer profiles.</li>
            )}
            {module.id === 'sys_audit' && (
              <li>Platform security audit logs will stop recording administrative events.</li>
            )}
            {module.id === 'sys_admins' && (
              <li>Provisioning new administrators and resetting administrator passwords will be blocked.</li>
            )}
            {module.id === 'cashier_pos' && (
              <li>The cashier checkout terminal cannot ring up haircut tickets, accept payments, or balance the drawer.</li>
            )}
          </ul>
        </div>

        <p className="text-[11px] text-ivory-dim/60 italic">
          Note: This is a frontend mock action. Changes will only apply locally to this session.
        </p>
      </div>
    </Modal>
  );
};
