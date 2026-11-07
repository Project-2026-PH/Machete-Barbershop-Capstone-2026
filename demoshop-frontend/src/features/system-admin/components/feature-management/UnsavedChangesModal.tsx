import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDiscard: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onClose,
  onDiscard,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Unsaved Feature Changes"
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-xs py-2 px-4"
          >
            Keep Editing
          </Button>
          <button
            onClick={onDiscard}
            className="px-5 py-2.5 rounded-sm bg-red-600/90 hover:bg-red-600 text-white font-serif font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_15px_rgba(220,38,38,0.4)] cursor-pointer"
          >
            Discard Changes
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3.5 rounded-sm bg-amber-500/10 border border-amber-500/30">
          <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-300 font-serif">
              You Have Unsaved Changes
            </h4>
            <p className="text-xs text-ivory-dim leading-relaxed">
              You have modified role feature toggles that have not been saved yet. Navigating away without saving will discard your changes.
            </p>
          </div>
        </div>

        <p className="text-[11px] text-ivory-dim/70">
          Click <strong className="text-ivory">Keep Editing</strong> to review and save your changes, or <strong className="text-red-400">Discard Changes</strong> to abandon them.
        </p>
      </div>
    </Modal>
  );
};
