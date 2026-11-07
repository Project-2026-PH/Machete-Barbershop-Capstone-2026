import React, { useState, useEffect } from 'react';
import {
  Layers, Save, RotateCcw, AlertCircle, Info, ExternalLink, Facebook, Phone, Clock, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { FooterConfig } from '@demoshop/shared-types';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';
import { ShopSettingsOverrideContext } from '@/hooks/useShopSettings';
import { Footer } from '@/components/layout/Footer';

interface FooterSectionProps {
  initialFooter: FooterConfig;
  generalInfo: {
    shopName: string;
    contactEmail: string;
    physicalAddress: string;
  };
  onSave: (footer: FooterConfig) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  onNavigateToGeneral?: () => void;
}

export const FooterSection: React.FC<FooterSectionProps> = ({
  initialFooter,
  generalInfo,
  onSave,
  isSaving,
  onDirtyChange,
  onNavigateToGeneral,
}) => {
  const [footer, setFooter] = useState<FooterConfig>(initialFooter);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  useEffect(() => {
    setFooter(initialFooter);
  }, [initialFooter]);

  const isDirty = JSON.stringify(footer) !== JSON.stringify(initialFooter);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleChange = (field: keyof FooterConfig, val: any) => {
    setFooter((prev) => ({ ...prev, [field]: val }));
  };

  const handleSocialChange = (network: 'facebook' | 'tiktok' | 'instagram', val: string) => {
    setFooter((prev) => ({
      ...prev,
      socialLinks: {
        ...prev.socialLinks,
        [network]: val,
      },
    }));
  };

  const handleReset = () => {
    setFooter(initialFooter);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    await onSave(footer);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
          <Layers className="w-5 h-5 text-gold" /> Public Footer Configuration
        </h3>
        <p className="text-xs text-ivory-dim mt-1">
          Configure footer-specific copy, contact telephone, operating hours text, and social channel links.
        </p>
      </div>

      {/* Single Source of Truth Banner */}
      <div className="p-4 bg-gold/10 border border-gold/30 rounded-sm space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-gold font-bold text-xs uppercase tracking-wider">
            <Info className="w-4 h-4 shrink-0" /> Single Source of Truth
          </div>
          {onNavigateToGeneral && (
            <button
              type="button"
              onClick={onNavigateToGeneral}
              className="text-[11px] text-gold hover:underline flex items-center gap-1 font-semibold"
            >
              Edit in General Settings <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className="text-xs text-ivory-dim">
          To prevent duplicate and conflicting storefront data, the public footer automatically inherits its authoritative business details from General Settings:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
          <div className="bg-charcoal/60 p-2 rounded border border-white/5">
            <span className="text-gold/80 block text-[9px] uppercase">Shop Name</span>
            <span className="text-ivory font-bold">{generalInfo.shopName}</span>
          </div>
          <div className="bg-charcoal/60 p-2 rounded border border-white/5">
            <span className="text-gold/80 block text-[9px] uppercase">Contact Email</span>
            <span className="text-ivory truncate block">{generalInfo.contactEmail}</span>
          </div>
          <div className="bg-charcoal/60 p-2 rounded border border-white/5">
            <span className="text-gold/80 block text-[9px] uppercase">Physical Address</span>
            <span className="text-ivory truncate block">{generalInfo.physicalAddress}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
              Brand Description
            </label>
            <textarea
              rows={2}
              value={footer.brandDescription || ''}
              onChange={(e) => handleChange('brandDescription', e.target.value)}
              placeholder="e.g. Where tradition meets precision. Experience the art of grooming in an atmosphere of industrial elegance."
              className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded resize-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Contact Phone / Landline
              </label>
              <input
                type="text"
                value={footer.phone || ''}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="e.g. (02) 8555-0123"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Operating Hours Display Text
              </label>
              <textarea
                rows={2}
                value={footer.operatingHoursDisplay || ''}
                onChange={(e) => handleChange('operatingHoursDisplay', e.target.value)}
                placeholder="e.g. Monday - Sunday&#10;10am - 9pm"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded resize-none"
              />
            </div>
          </div>

          {/* Social Links */}
          <div className="space-y-3 pt-2">
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold">
              Social Media Channels
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-ivory-dim mb-1 block">Facebook URL</span>
                <input
                  type="url"
                  value={footer.socialLinks?.facebook || ''}
                  onChange={(e) => handleSocialChange('facebook', e.target.value)}
                  placeholder="https://facebook.com/..."
                  className="w-full bg-charcoal border border-white/15 px-3 py-1.5 text-xs text-ivory rounded focus:border-gold focus:outline-none"
                />
              </div>

              <div>
                <span className="text-[10px] text-ivory-dim mb-1 block">TikTok URL</span>
                <input
                  type="url"
                  value={footer.socialLinks?.tiktok || ''}
                  onChange={(e) => handleSocialChange('tiktok', e.target.value)}
                  placeholder="https://tiktok.com/@..."
                  className="w-full bg-charcoal border border-white/15 px-3 py-1.5 text-xs text-ivory rounded focus:border-gold focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
              Copyright Notice
            </label>
            <input
              type="text"
              value={footer.copyrightText || ''}
              onChange={(e) => handleChange('copyrightText', e.target.value)}
              placeholder={`© ${new Date().getFullYear()} DemoShop's Barbers. All rights reserved.`}
              className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 text-xs text-ivory-dim hover:text-white min-h-[44px] w-full sm:w-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </Button>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPreviewOpen(true)}
              className="flex items-center justify-center gap-1.5 text-xs text-ivory hover:text-gold border-white/20 hover:border-gold min-h-[44px] px-4 w-full sm:w-auto cursor-pointer"
            >
              <Eye className="w-4 h-4 text-gold" /> Preview
            </Button>

            <Button
              type="submit"
              variant="primary"
              disabled={!isDirty || isSaving}
              className="flex items-center justify-center gap-2 px-6 min-h-[44px] w-full sm:w-auto text-xs sm:text-sm"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving Changes...' : 'Save Footer Settings'}
            </Button>
          </div>
        </div>
      </form>

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="Footer"
        isDirty={isDirty}
        isSaving={isSaving}
        saveButtonLabel="Save Footer Settings"
        onSave={async () => {
          await onSave(footer);
          setIsPreviewOpen(false);
        }}
      >
        <ShopSettingsOverrideContext.Provider
          value={{
            footer,
            shopName: generalInfo?.shopName,
            physicalAddress: generalInfo?.physicalAddress,
          } as any}
        >
          <div className="bg-charcoal">
            <Footer />
          </div>
        </ShopSettingsOverrideContext.Provider>
      </StorefrontPreviewModal>
    </div>
  );
};
