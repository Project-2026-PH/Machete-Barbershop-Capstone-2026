import React, { useRef, useState } from 'react';
import {
  Eye, ExternalLink, Globe, CheckCircle2, RotateCcw,
  Save, Loader2
} from 'lucide-react';
import type { ShopSettings } from '@demoshop/shared-types';
import { StorefrontLandingView } from '@/views/storefront/StorefrontLandingView';
import { useStorefrontDraft } from '@/hooks/useStorefrontDraft';
import { Modal } from '@/components/feedback/Modal';

export interface LandingPagePreviewDomainProps {
  settings?: ShopSettings | null;
  onPublishSettings?: () => Promise<void>;
  isDirty?: boolean;
  dirtyDomains?: string[];
}

export function LandingPagePreviewDomain(props?: LandingPagePreviewDomainProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false);

  const { draftConfig, isDirty, isPublishing, resetDraft, publishChanges } = useStorefrontDraft({
    initialSettings: props?.settings,
    onPublishSettings: props?.onPublishSettings,
    isDirty: props?.isDirty,
    dirtyDomains: props?.dirtyDomains,
  });

  const handleConfirmDiscard = () => {
    setIsDiscardModalOpen(false);
    resetDraft();
  };

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 1. Sandbox Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-5 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <Eye className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-base font-bold text-zinc-100 tracking-wide">
                Live Storefront Preview Sandbox
              </h2>
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                1:1 Scale
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Live viewport previewing real-time services, pricing, gallery photos, and business hours.
            </p>
          </div>
        </div>

        {/* Storefront Navigation Helper */}
        <div className="flex items-center gap-3">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-700/80 bg-zinc-800/60 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition hover:border-amber-400/50 hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer"
          >
            <ExternalLink className="h-3.5 w-3.5 text-amber-400" />
            Open Live Storefront
          </a>
        </div>
      </div>

      {/* 2. Full-Fidelity Browser Window Frame */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0c0c0e] shadow-2xl">
        {/* Realistic Browser Title Bar */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-900/80 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-red-500/80 transition hover:opacity-100 inline-block" />
            <span className="h-3 w-3 rounded-full bg-amber-500/80 transition hover:opacity-100 inline-block" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/80 transition hover:opacity-100 inline-block" />
          </div>

          <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/90 px-5 py-1 text-xs text-zinc-400">
            <Globe className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono text-zinc-300">https://portfolio.example.invalid</span>
          </div>

          <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 font-bold">
            Authentic Canvas
          </div>
        </div>

        {/* 3. Live Website Viewport Container */}
        {/* Render the full StorefrontLandingView directly, passing draft overrides */}
        <div
          ref={viewportRef}
          className="relative w-full min-h-[820px] max-h-[820px] overflow-y-auto bg-[#0a0a0c] custom-scrollbar scroll-smooth"
        >
          <StorefrontLandingView
            isPreviewMode={true}
            previewData={draftConfig}
            containerRef={viewportRef}
          />
        </div>
      </div>

      {/* 4. Sticky Bottom Publishing Control Bar */}
      <div className="sticky bottom-4 z-30 flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-zinc-800/90 bg-zinc-950/95 px-6 py-3.5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          {isDirty ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
              </span>
              <span className="text-xs font-medium text-amber-300">
                Draft modifications ready to be published to production
                {props?.dirtyDomains && props.dirtyDomains.length > 0 && ` (${props.dirtyDomains.join(', ')})`}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-400">
                Storefront canvas is fully synchronized with production
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => setIsDiscardModalOpen(true)}
            disabled={!isDirty || isPublishing}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-transparent px-4 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Discard Changes
          </button>

          <button
            type="button"
            onClick={publishChanges}
            disabled={!isDirty || isPublishing}
            className={`flex items-center gap-2 rounded-lg px-6 py-2 text-xs font-bold uppercase tracking-wider transition ${
              isDirty && !isPublishing
                ? 'bg-amber-400 text-zinc-950 shadow-lg shadow-amber-400/10 hover:bg-amber-300 cursor-pointer'
                : 'cursor-not-allowed border border-zinc-800 bg-zinc-900/60 text-zinc-500 shadow-none'
            }`}
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Publishing to Live...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                Save & Publish Landing Page
              </>
            )}
          </button>
        </div>
      </div>

      {/* Discard Confirmation Modal */}
      <Modal
        isOpen={isDiscardModalOpen}
        onClose={() => setIsDiscardModalOpen(false)}
        title="Discard Draft Changes"
        footer={
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsDiscardModalOpen(false)}
              className="rounded-lg border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            >
              Keep Editing
            </button>
            <button
              type="button"
              onClick={handleConfirmDiscard}
              className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20"
            >
              Discard Changes
            </button>
          </div>
        }
      >
        <p className="text-sm text-zinc-300 leading-relaxed">
          Are you sure you want to discard your draft modifications? Any uncommitted storefront edits will be reverted to the production version.
        </p>
      </Modal>
    </div>
  );
}

export default LandingPagePreviewDomain;
