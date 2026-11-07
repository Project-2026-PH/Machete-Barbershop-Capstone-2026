import React from 'react';
import { Save, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

export interface StorefrontPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  domainTitle: string;
  isDirty?: boolean;
  isSaving?: boolean;
  onSave?: () => Promise<void> | void;
  saveButtonLabel?: string;
  children: React.ReactNode;
}

export const StorefrontPreviewModal: React.FC<StorefrontPreviewModalProps> = ({
  isOpen,
  onClose,
  domainTitle,
  isDirty = false,
  isSaving = false,
  onSave,
  saveButtonLabel = 'Save Changes',
  children,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title="Preview Mode (Unsaved Changes)"
      headerExtra={
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-gold/10 border border-gold/30 text-gold">
            {domainTitle}
          </span>
          {isDirty ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Unsaved Draft
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              Synchronized
            </span>
          )}
        </div>
      }
      bodyClassName="p-0 bg-[#0c0c0e]"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
          <div className="text-xs text-ivory-dim flex items-center gap-2">
            {isDirty ? (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Showing live draft changes before committing to production database.</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Preview matches active live storefront configuration.</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              className="text-xs text-ivory-dim hover:text-white min-h-[40px] px-4 cursor-pointer"
            >
              Back to Editing
            </Button>
            {onSave && (
              <Button
                type="button"
                variant="primary"
                onClick={onSave}
                disabled={isSaving || !isDirty}
                className="flex items-center justify-center gap-2 px-5 min-h-[40px] text-xs font-bold bg-gold text-charcoal hover:bg-gold/80 shadow-md cursor-pointer disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {saveButtonLabel}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col w-full">
        {/* Browser Mockup Bar */}
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70 inline-block" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70 inline-block" />
            <span className="ml-2 font-mono text-[11px] text-zinc-400">
              https://portfolio.example.invalid • <span className="text-gold">{domainTitle}</span>
            </span>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold hidden sm:block">
            Authentic Storefront Canvas
          </div>
        </div>

        {/* Viewport Content */}
        <div className="w-full max-h-[70vh] overflow-y-auto custom-scrollbar bg-[#0c0c0e]">
          {children}
        </div>
      </div>
    </Modal>
  );
};

export default StorefrontPreviewModal;
