import React, { useState } from 'react';
import { Sparkles, Eye, EyeOff, Save, ExternalLink } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import type { WebsiteCustomization } from '@demoshop/shared-types';
import type { LandingSectionDef } from './content-constants';

interface SectionAdvancedModalProps {
  section: LandingSectionDef;
  website: WebsiteCustomization;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedWebsite: WebsiteCustomization) => Promise<void>;
  isSaving: boolean;
}

export const SectionAdvancedModal: React.FC<SectionAdvancedModalProps> = ({
  section,
  website,
  isOpen,
  onClose,
  onSave,
  isSaving,
}) => {
  const currentVisibility = website.sectionVisibility?.[section.key as keyof typeof website.sectionVisibility] !== false;
  const [isVisible, setIsVisible] = useState<boolean>(currentVisibility);
  const [primaryDest, setPrimaryDest] = useState<string>(website.ctaPrimaryDestination || '/booking');
  const [secondaryDest, setSecondaryDest] = useState<string>(website.ctaSecondaryDestination || '#services');

  const handleConfirm = async () => {
    const updatedVisibility = {
      ...(website.sectionVisibility || {}),
      [section.key]: isVisible,
    };

    const payload: WebsiteCustomization = {
      ...website,
      sectionVisibility: updatedVisibility,
    };

    if (section.key === 'hero') {
      payload.ctaPrimaryDestination = primaryDest.trim() || '/booking';
      payload.ctaSecondaryDestination = secondaryDest.trim() || '#services';
    }

    await onSave(payload);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`ADVANCED SETTINGS: ${section.name.toUpperCase()}`}
      size="md"
    >
      <div className="space-y-5 text-xs text-ivory">
        {/* Advanced Header Indicator */}
        <div className="p-3.5 bg-charcoal border border-gold/20 rounded-sm flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-gold shrink-0" />
              <h4 className="font-serif font-bold text-sm text-ivory">
                {section.name} Configuration
              </h4>
            </div>
            <p className="text-xs text-ivory-dim/75 mt-1 leading-relaxed">
              {section.description}
            </p>
          </div>
          <span className="px-2 py-0.5 rounded-[2px] bg-gold/15 text-gold border border-gold/30 text-[9px] font-mono uppercase font-bold shrink-0">
            Advanced
          </span>
        </div>

        {/* Section Visibility Switch */}
        <div className="p-4 bg-charcoal-light/70 border border-white/5 rounded-sm space-y-2.5">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-gold">
            Public Website Visibility
          </label>
          <p className="text-xs text-ivory-dim/70">
            Control whether this section appears on the customer-facing landing page.
          </p>

          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {isVisible ? (
                <>
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-300">
                    Currently Visible to Public
                  </span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-zinc-400" />
                  <span className="text-xs font-semibold text-zinc-400">
                    Currently Hidden from Public
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsVisible(!isVisible)}
              className={`px-3.5 py-1.5 rounded-[2px] text-xs font-bold transition-all cursor-pointer ${
                isVisible
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
              }`}
            >
              {isVisible ? 'Show on Website: ON' : 'Show on Website: OFF'}
            </button>
          </div>
        </div>

        {/* Specific Controls for Hero: CTA Destinations */}
        {section.key === 'hero' && (
          <div className="p-4 bg-charcoal-light/70 border border-white/5 rounded-sm space-y-4">
            <div className="border-b border-white/5 pb-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gold">
                Call-to-Action Destination Routing
              </label>
              <p className="text-xs text-ivory-dim/70 mt-0.5">
                Configure where clicking the hero buttons takes visitors.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim mb-1">
                Primary CTA Link Target
              </label>
              <input
                type="text"
                value={primaryDest}
                onChange={(e) => setPrimaryDest(e.target.value)}
                placeholder="/booking"
                className="w-full bg-charcoal border border-white/10 px-3 py-1.5 text-xs text-ivory focus:border-gold focus:outline-none rounded"
              />
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-ivory-dim/50">Presets:</span>
                {['/booking', '#services', '#about', '#locations'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setPrimaryDest(preset)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition-colors ${
                      primaryDest === preset
                        ? 'bg-gold/20 text-gold border border-gold/40'
                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-ivory-dim mb-1">
                Secondary CTA Link Target
              </label>
              <input
                type="text"
                value={secondaryDest}
                onChange={(e) => setSecondaryDest(e.target.value)}
                placeholder="#services"
                className="w-full bg-charcoal border border-white/10 px-3 py-1.5 text-xs text-ivory focus:border-gold focus:outline-none rounded"
              />
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                <span className="text-[10px] text-ivory-dim/50">Presets:</span>
                {['#services', '/booking', '#gallery', '#about'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSecondaryDest(preset)}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer transition-colors ${
                      secondaryDest === preset
                        ? 'bg-gold/20 text-gold border border-gold/40'
                        : 'bg-white/5 hover:bg-white/10 text-ivory-dim'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Live Site Preview Quick Link */}
        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm flex items-center justify-between text-xs text-ivory-dim">
          <span>Verify updates on public site</span>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-gold hover:underline cursor-pointer"
          >
            <span>View Live Storefront</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Modal Actions */}
        <div className="pt-3 flex justify-end gap-2.5 border-t border-white/5">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSaving}
            className="text-xs px-3.5 py-1.5"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={isSaving}
            className="text-xs px-4 py-1.5 bg-gold hover:bg-gold-light text-charcoal font-bold flex items-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Apply Advanced Settings'}</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
