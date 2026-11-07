import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Upload, Trash2, Save, RotateCcw, AlertCircle, Loader2, Image as ImageIcon, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { AboutConfig } from '@demoshop/shared-types';
import { uploadShopMedia } from '@/services/shopSettings.service';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';
import { ShopSettingsOverrideContext } from '@/hooks/useShopSettings';
import { About } from '@/features/about/About';

interface AboutSectionProps {
  initialAbout: AboutConfig;
  onSave: (about: AboutConfig) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const AboutSection: React.FC<AboutSectionProps> = ({
  initialAbout,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [about, setAbout] = useState<AboutConfig>(initialAbout);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAbout(initialAbout);
  }, [initialAbout]);

  const isDirty = JSON.stringify(about) !== JSON.stringify(initialAbout);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleChange = (field: keyof AboutConfig, val: any) => {
    setAbout((prev) => ({ ...prev, [field]: val }));
  };

  const handleStatChange = (statKey: 'years' | 'cuts' | 'rating', val: string) => {
    setAbout((prev) => ({
      ...prev,
      stats: {
        ...prev.stats,
        [statKey]: val,
      },
    }));
  };

  const handleImageUpload = async (file: File | undefined) => {
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
      handleChange('imageUrl', publicUrl);
    } catch (err: any) {
      console.error('Failed to upload about image:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to upload image.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setAbout(initialAbout);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!about.heading?.trim()) {
      setError('About Heading is required.');
      return;
    }

    await onSave(about);
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-4">
        <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
          <FileText className="w-5 h-5 text-gold" /> About Us & Brand Heritage
        </h3>
        <p className="text-xs text-ivory-dim mt-1">
          Configure the public storytelling, craftsmanship metrics, founder quote, and brand heritage photo.
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Section Heading <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={about.heading || ''}
                onChange={(e) => handleChange('heading', e.target.value)}
                placeholder="e.g. CRAFTING CONFIDENCE SINCE 2018"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Subheading Tagline
              </label>
              <input
                type="text"
                value={about.subheading || ''}
                onChange={(e) => handleChange('subheading', e.target.value)}
                placeholder="e.g. TRADITION • PRECISION • STYLE"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded"
              />
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold">
              Story Paragraphs
            </label>
            <div>
              <span className="text-[10px] text-ivory-dim mb-1 block">Paragraph 1 (Origins & Mission)</span>
              <textarea
                rows={3}
                value={about.storyParagraph1 || ''}
                onChange={(e) => handleChange('storyParagraph1', e.target.value)}
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded resize-none"
              />
            </div>

            <div>
              <span className="text-[10px] text-ivory-dim mb-1 block">Paragraph 2 (Master Craftsmanship)</span>
              <textarea
                rows={3}
                value={about.storyParagraph2 || ''}
                onChange={(e) => handleChange('storyParagraph2', e.target.value)}
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded resize-none"
              />
            </div>

            <div>
              <span className="text-[10px] text-ivory-dim mb-1 block">Paragraph 3 (The Sanctuary Atmosphere)</span>
              <textarea
                rows={3}
                value={about.storyParagraph3 || ''}
                onChange={(e) => handleChange('storyParagraph3', e.target.value)}
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded resize-none"
              />
            </div>
          </div>

          {/* Stats Bar */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Showcase Metrics & Key Stats
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <span className="text-[10px] text-ivory-dim mb-1 block">Years of Mastery</span>
                <input
                  type="text"
                  value={about.stats?.years || '6+'}
                  onChange={(e) => handleStatChange('years', e.target.value)}
                  className="w-full bg-charcoal border border-white/15 px-3 py-1.5 text-xs text-ivory rounded font-mono font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-ivory-dim mb-1 block">Precision Cuts</span>
                <input
                  type="text"
                  value={about.stats?.cuts || '15k+'}
                  onChange={(e) => handleStatChange('cuts', e.target.value)}
                  className="w-full bg-charcoal border border-white/15 px-3 py-1.5 text-xs text-ivory rounded font-mono font-bold"
                />
              </div>
              <div>
                <span className="text-[10px] text-ivory-dim mb-1 block">Star Rating</span>
                <input
                  type="text"
                  value={about.stats?.rating || '4.9'}
                  onChange={(e) => handleStatChange('rating', e.target.value)}
                  className="w-full bg-charcoal border border-white/15 px-3 py-1.5 text-xs text-ivory rounded font-mono font-bold"
                />
              </div>
            </div>
          </div>

          {/* Founder Quote */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Featured Quote
              </label>
              <textarea
                rows={2}
                value={about.quoteText || ''}
                onChange={(e) => handleChange('quoteText', e.target.value)}
                placeholder="e.g. Every cut is a signature of craftsmanship and character."
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded resize-none italic"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Quote Author / Attribution
              </label>
              <input
                type="text"
                value={about.quoteAuthor || ''}
                onChange={(e) => handleChange('quoteAuthor', e.target.value)}
                placeholder="e.g. Master Barber & Founder"
                className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded"
              />
            </div>
          </div>

          {/* Heritage Image */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-2">
              Brand Heritage Imagery
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handleImageUpload(file);
                e.target.value = '';
              }}
            />

            <div className="p-4 bg-white/[0.02] border border-white/10 rounded-sm flex flex-col sm:flex-row items-center gap-4">
              <div className="h-32 w-48 rounded overflow-hidden bg-charcoal border border-white/15 shrink-0 flex items-center justify-center">
                <img
                  src={about.imageUrl || '/images/about-vintage.jpg'}
                  alt="About heritage"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/demoshop_logo.png';
                  }}
                />
              </div>
              <div className="space-y-2 flex-1">
                <p className="text-xs text-ivory-dim">
                  Showcase the authentic barbershop atmosphere, craftsmanship details, or founder portraits.
                </p>
                <div className="flex gap-2">
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
                        <Upload className="w-3.5 h-3.5" /> Replace Photo
                      </>
                    )}
                  </Button>
                  {about.imageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleChange('imageUrl', undefined)}
                      className="flex items-center gap-1.5 text-xs text-red-300 border-red-500/30 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Revert
                    </Button>
                  )}
                </div>
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
              {isSaving ? 'Saving Changes...' : 'Save About Heritage'}
            </Button>
          </div>
        </div>
      </form>

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="About Us"
        isDirty={isDirty}
        isSaving={isSaving}
        saveButtonLabel="Save About Heritage"
        onSave={async () => {
          await onSave(about);
          setIsPreviewOpen(false);
        }}
      >
        <ShopSettingsOverrideContext.Provider value={{ about } as any}>
          <div className="bg-charcoal p-4 sm:p-8">
            <About />
          </div>
        </ShopSettingsOverrideContext.Provider>
      </StorefrontPreviewModal>
    </div>
  );
};
