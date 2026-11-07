import React, { useState, useEffect, useRef } from 'react';
import { Globe, Upload, Trash2, Save, RotateCcw, AlertCircle, Loader2, Sparkles, Image as ImageIcon, Eye } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { WebsiteCustomization } from '@demoshop/shared-types';
import { uploadShopMedia } from '@/services/shopSettings.service';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';
import { ShopSettingsOverrideContext } from '@/hooks/useShopSettings';
import { Hero } from '@/features/hero/Hero';

interface LandingPageProps {
  initialWebsite: WebsiteCustomization;
  onSave: (website: WebsiteCustomization) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  canConfigureAdvanced?: boolean;
}

export const LandingPageSection: React.FC<LandingPageProps> = ({
  initialWebsite,
  onSave,
  isSaving,
  onDirtyChange,
  canConfigureAdvanced = false,
}) => {
  const [website, setWebsite] = useState<WebsiteCustomization>(initialWebsite);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setWebsite(initialWebsite);
  }, [initialWebsite]);

  const isDirty = JSON.stringify(website) !== JSON.stringify(initialWebsite);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleChange = (field: keyof WebsiteCustomization, val: any) => {
    setWebsite((prev) => ({ ...prev, [field]: val }));
  };

  const handleHeroImageUpload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Please upload a valid image (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError('Image file size must be less than 8MB.');
      return;
    }

    setIsUploading(true);
    try {
      const publicUrl = await uploadShopMedia(file);
      handleChange('heroImageUrl', publicUrl);
    } catch (err: any) {
      console.error('Failed to upload hero image:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to upload hero image.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setWebsite(initialWebsite);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!website.heroHeadline?.trim()) {
      setError('Hero Headline is required.');
      return;
    }
    if (!website.heroSubtext?.trim()) {
      setError('Hero Subtext is required.');
      return;
    }

    await onSave(website);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
          <Globe className="w-5 h-5 text-gold" /> Public Landing Page Content
        </h3>
        <p className="text-xs text-ivory-dim mt-1">
          Customize the authoritative hero banner, marketing copy, and call-to-action buttons on the storefront.
        </p>
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
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Hero Headline <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={website.heroHeadline || ''}
              onChange={(e) => handleChange('heroHeadline', e.target.value)}
              placeholder="e.g. PRECISION & TRADITION"
              className="w-full bg-charcoal border border-white/15 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none transition-colors rounded uppercase tracking-wider font-serif"
            />
            <p className="text-[10px] text-ivory-dim mt-1">
              Primary brand statement rendered prominently on the homepage hero banner.
            </p>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Hero Subtext <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              value={website.heroSubtext || ''}
              onChange={(e) => handleChange('heroSubtext', e.target.value)}
              placeholder="e.g. Experience the art of classic grooming in an atmosphere of modern industrial elegance."
              className="w-full bg-charcoal border border-white/15 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none transition-colors rounded resize-none"
            />
            <p className="text-[10px] text-ivory-dim mt-1">
              Descriptive tagline articulating DemoShop's values and client experience.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
                Primary CTA Button Label
              </label>
              <input
                type="text"
                value={website.ctaPrimaryLabel || ''}
                onChange={(e) => handleChange('ctaPrimaryLabel', e.target.value)}
                placeholder="e.g. Book Appointment"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
                Secondary CTA Button Label
              </label>
              <input
                type="text"
                value={website.ctaSecondaryLabel || ''}
                onChange={(e) => handleChange('ctaSecondaryLabel', e.target.value)}
                placeholder="e.g. View Services"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded"
              />
            </div>
          </div>

          {/* System Admin Advanced Controls */}
          {canConfigureAdvanced && (
            <div className="p-4 bg-charcoal-light/70 border border-gold/30 rounded-sm space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <span className="text-xs font-bold uppercase tracking-wider text-gold">
                    Advanced Homepage Presentation
                  </span>
                </div>
                <span className="px-1.5 py-0.5 rounded-[2px] bg-gold/15 text-gold border border-gold/30 text-[9px] font-mono uppercase font-bold">
                  Advanced
                </span>
              </div>

              {/* Hero Section Visibility */}
              <div className="flex items-center justify-between gap-4 p-3 bg-charcoal border border-white/5 rounded-sm">
                <div>
                  <div className="text-xs font-semibold text-ivory">Hero Banner Visibility</div>
                  <div className="text-[11px] text-ivory-dim/70">
                    Controls whether the main hero introduction is visible on the public storefront.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const currentVis = website.sectionVisibility?.hero !== false;
                    handleChange('sectionVisibility', {
                      ...website.sectionVisibility,
                      hero: !currentVis,
                    });
                  }}
                  className={`px-3 py-1.5 rounded text-xs font-bold transition-all cursor-pointer ${
                    website.sectionVisibility?.hero !== false
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  }`}
                >
                  {website.sectionVisibility?.hero !== false ? 'Visible on Website' : 'Hidden from Website'}
                </button>
              </div>

              {/* Call to Action Routing */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-ivory-dim font-bold mb-1.5">
                    Primary CTA Destination
                  </label>
                  <input
                    type="text"
                    value={website.ctaPrimaryDestination || ''}
                    onChange={(e) => handleChange('ctaPrimaryDestination', e.target.value)}
                    placeholder="Default: /booking"
                    className="w-full bg-charcoal border border-white/10 px-3 py-1.5 text-ivory text-xs focus:border-gold focus:outline-none rounded"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-ivory-dim/50">Presets:</span>
                    {['/booking', '#services', '#about', '#locations'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleChange('ctaPrimaryDestination', preset)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-gold font-mono cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-ivory-dim font-bold mb-1.5">
                    Secondary CTA Destination
                  </label>
                  <input
                    type="text"
                    value={website.ctaSecondaryDestination || ''}
                    onChange={(e) => handleChange('ctaSecondaryDestination', e.target.value)}
                    placeholder="Default: #services"
                    className="w-full bg-charcoal border border-white/10 px-3 py-1.5 text-ivory text-xs focus:border-gold focus:outline-none rounded"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="text-[10px] text-ivory-dim/50">Presets:</span>
                    {['#services', '/booking', '#gallery', '#about'].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleChange('ctaSecondaryDestination', preset)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-gold font-mono cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Hero Media Background */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Hero Background Imagery
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleHeroImageUpload(file);
                e.target.value = '';
              }}
            />

            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-sm">
              <div
                className="relative h-44 w-full rounded overflow-hidden bg-charcoal flex items-center justify-center border border-white/10"
                style={{
                  backgroundColor: '#121212',
                }}
              >
                {website.heroImageUrl ? (
                  <img
                    src={website.heroImageUrl}
                    alt="Hero Background Preview"
                    className="w-full h-full object-cover opacity-60 grayscale mix-blend-overlay"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-center p-4 text-ivory-dim/60">
                    <ImageIcon className="w-8 h-8 mx-auto mb-1 text-gold/40" />
                    <p className="text-[11px] font-mono uppercase tracking-wider">Default Ambient Backdrop (No Custom Image)</p>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 flex flex-col justify-end p-4 pointer-events-none">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-gold font-bold">
                    Live Banner Preview
                  </span>
                  <h4 className="text-lg font-serif font-bold text-ivory uppercase truncate">
                    {website.heroHeadline || 'PRECISION & TRADITION'}
                  </h4>
                </div>
              </div>

              <div className="flex gap-2.5 mt-3 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-gold border-gold/40 hover:bg-gold/10"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" /> {website.heroImageUrl ? 'Replace Hero Image' : 'Upload Hero Image'}
                    </>
                  )}
                </Button>

                {website.heroImageUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleChange('heroImageUrl', undefined)}
                    className="flex items-center gap-1.5 text-xs text-red-300 border-red-500/30 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Hero Image
                  </Button>
                )}
              </div>
            </div>
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
              {isSaving ? 'Saving Changes...' : 'Save Landing Page Content'}
            </Button>
          </div>
        </div>
      </form>

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="Landing Page"
        isDirty={isDirty}
        isSaving={isSaving}
        saveButtonLabel="Save Landing Page Content"
        onSave={async () => {
          await onSave(website);
          setIsPreviewOpen(false);
        }}
      >
        <ShopSettingsOverrideContext.Provider value={{ website } as any}>
          <div className="relative w-full max-h-[640px] overflow-hidden [&>section]:h-[560px] [&>section]:min-h-[500px]">
            <Hero />
          </div>
        </ShopSettingsOverrideContext.Provider>
      </StorefrontPreviewModal>
    </div>
  );
};
