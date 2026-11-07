import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Globe,
  Image as ImageIcon,
  HelpCircle,
  ShieldAlert,
  Store,
  Layers,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Loader2,
  Clock,
  UserCheck,
  CheckCircle2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import type { ShopSettings, WebsiteCustomization, BusinessHourDay } from '@demoshop/shared-types';
import { getAdminShopSettings, updateAdminShopSettings } from '@/services/shopSettings.service';

// Modular Shared Editors Reused Directly from Shop Admin
import { LandingPageSection } from '@/features/admin/tabs/settings/LandingPageSection';
import { AboutSection } from '@/features/admin/tabs/settings/AboutSection';
import { GallerySection } from '@/features/admin/tabs/settings/GallerySection';
import { FAQSection } from '@/features/admin/tabs/settings/FAQSection';
import { LegalPagesSection } from '@/features/admin/tabs/settings/LegalPagesSection';
import { GeneralSettingsSection } from '@/features/admin/tabs/settings/GeneralSettingsSection';
import { BusinessHoursSection } from '@/features/admin/tabs/settings/BusinessHoursSection';
import { FooterSection } from '@/features/admin/tabs/settings/FooterSection';

// Subcomponents
import { CONTENT_AREAS, type ContentManagementArea } from './content-constants';
import { LandingPageCMS } from './LandingPageCMS';

interface ContentManagementProps {
  initialArea?: ContentManagementArea;
}

export const ContentManagement: React.FC<ContentManagementProps> = ({
  initialArea = 'landing',
}) => {
  const { addToast } = useToast();

  const [activeArea, setActiveArea] = useState<ContentManagementArea>(initialArea);
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Drawer / Sub-modal editor state for specific sections from Landing Page CMS
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await getAdminShopSettings();
      setSettings(data);
    } catch (err: any) {
      console.error('[ContentManagement] Failed to fetch shop settings:', err);
      setFetchError(
        err?.response?.data?.message || err?.message || 'Failed to load authoritative website settings.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Unified save handler that updates the single authoritative DB record and Redis cache
  const handleSaveMutation = async (
    partialUpdate: Partial<ShopSettings>,
    successMessage: string
  ) => {
    setIsSaving(true);
    try {
      const updated = await updateAdminShopSettings(partialUpdate);
      setSettings(updated);
      addToast({
        type: 'success',
        title: 'Content Saved',
        message: successMessage,
      });
      // Close any section editor modal if open
      setEditingSectionKey(null);
    } catch (err: any) {
      console.error('[ContentManagement] Save mutation failed:', err);
      addToast({
        type: 'error',
        title: 'Save Failed',
        message:
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          err?.message ||
          'Failed to update website content.',
      });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  // Convert settings.businessHours map/array into BusinessHourDay[]
  const businessHoursArray: BusinessHourDay[] = useMemo(() => {
    if (!settings) return [];
    if (Array.isArray(settings.businessHours)) {
      return settings.businessHours;
    }
    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const map = settings.businessHours || {};
    return daysOrder.map((day) => ({
      day,
      openTime: map[day]?.openTime || '09:00',
      closeTime: map[day]?.closeTime || '20:00',
      isOpen: map[day]?.isOpen ?? (day !== 'Sunday'),
    }));
  }, [settings?.businessHours]);

  // Memoized values for shared editors
  const generalInitialValues = useMemo(
    () => ({
      shopName: settings?.shopName || "DemoShop's Barbers",
      contactEmail: settings?.contactEmail || 'portfolio@example.invalid',
      physicalAddress:
        settings?.physicalAddress || 'Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan',
    }),
    [settings?.shopName, settings?.contactEmail, settings?.physicalAddress]
  );

  const websiteInitial = useMemo(
    () =>
      settings?.website || {
        heroHeadline: 'PRECISION & TRADITION',
        heroSubtext:
          'Experience the art of classic grooming in a modern industrial setting. Where every cut is a masterpiece.',
      },
    [settings?.website]
  );

  const galleryInitial = useMemo(
    () => settings?.gallery || settings?.galleryImages || [],
    [settings?.gallery, settings?.galleryImages]
  );

  const faqInitial = useMemo(() => settings?.faqs || [], [settings?.faqs]);

  const aboutInitial = useMemo(
    () =>
      settings?.about || {
        heading: 'CRAFTING CONFIDENCE SINCE 2018',
        subheading: 'TRADITION • PRECISION • STYLE',
      },
    [settings?.about]
  );

  const footerInitial = useMemo(() => settings?.footer || {}, [settings?.footer]);

  const legalInitial = useMemo(() => {
    return settings?.legalDocs?.termsOfService
      ? settings.legalDocs
      : settings?.legal?.termsOfService
      ? (settings.legal as any)
      : {
          termsOfService: {
            id: 'termsOfService',
            title: 'Terms of Service',
            content: '',
            status: 'active' as const,
            lastUpdated: 'February 2026',
          },
          privacyPolicy: {
            id: 'privacyPolicy',
            title: 'Privacy Policy',
            content: '',
            status: 'active' as const,
            lastUpdated: 'February 2026',
          },
        };
  }, [settings?.legalDocs, settings?.legal]);

  // Render Area Icon helper
  const renderAreaIcon = (iconName: string, className = 'w-4 h-4') => {
    switch (iconName) {
      case 'Globe':
        return <Globe className={className} />;
      case 'Image':
        return <ImageIcon className={className} />;
      case 'HelpCircle':
        return <HelpCircle className={className} />;
      case 'ShieldAlert':
        return <ShieldAlert className={className} />;
      case 'Store':
        return <Store className={className} />;
      case 'Layers':
        return <Layers className={className} />;
      default:
        return <Globe className={className} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* ── 1. AUTHORITATIVE METADATA BANNER ───────────────────────────────── */}
      <div className="p-3.5 bg-charcoal-light/70 border border-white/5 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-semibold text-ivory">Single Authoritative Source</span>
          </div>
          <span className="text-white/20 hidden sm:inline">•</span>
          <span className="text-ivory-dim/70">
            PostgreSQL & Redis • Cross-Module Real-time Sync with Shop Admin & Public Storefront
          </span>
          {settings?.website?.lastUpdated && (
            <>
              <span className="text-white/20 hidden sm:inline">•</span>
              <span className="text-ivory-dim/60 font-mono text-[11px]">
                Updated: {settings.website.lastUpdated}
                {settings.website.updatedBy ? ` by ${settings.website.updatedBy}` : ''}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => fetchSettings()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-ivory-dim hover:text-gold transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-gold' : ''}`} />
            <span>Refresh</span>
          </button>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-charcoal border border-white/10 hover:border-gold/40 text-ivory hover:text-gold text-xs rounded transition-colors"
          >
            <span>View Live Website</span>
            <ExternalLink className="w-3.5 h-3.5 text-gold" />
          </a>
        </div>
      </div>

      {fetchError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <Button variant="outline" onClick={() => fetchSettings()} className="text-xs px-2.5 py-1">
            Retry
          </Button>
        </div>
      )}

      {/* ── 2. AREA NAVIGATION PILLS ─────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-white/5 scrollbar-thin">
        {CONTENT_AREAS.map((area) => {
          const isActive = activeArea === area.key;
          return (
            <button
              key={area.key}
              type="button"
              onClick={() => setActiveArea(area.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[2px] text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-gold text-charcoal font-bold shadow-xs'
                  : 'text-ivory-dim hover:text-ivory bg-charcoal-light/60 hover:bg-charcoal-light border border-white/5'
              }`}
            >
              {renderAreaIcon(area.iconName, 'w-3.5 h-3.5')}
              <span>{area.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── 3. WORKSPACE CONTENT AREA ────────────────────────────────────── */}
      {isLoading && !settings ? (
        <div className="p-12 text-center text-ivory-dim">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-gold mb-2" />
          <p className="text-xs font-mono uppercase tracking-wider">
            Loading authoritative content settings...
          </p>
        </div>
      ) : settings ? (
        <div className="bg-charcoal-light/40 border border-white/5 rounded-sm p-5 md:p-6">
          {/* AREA 1: LANDING PAGE CMS */}
          {activeArea === 'landing' && (
            <LandingPageCMS
              settings={settings}
              onEditSection={(sectionKey) => setEditingSectionKey(sectionKey)}
              onNavigateArea={(areaKey) => setActiveArea(areaKey)}
              onSaveWebsite={(updatedWebsite, message) =>
                handleSaveMutation({ website: updatedWebsite }, message)
              }
              isSaving={isSaving}
            />
          )}

          {/* AREA 2: SHOWCASE GALLERY */}
          {activeArea === 'gallery' && (
            <GallerySection
              initialImages={galleryInitial}
              onSave={async (images) => {
                await handleSaveMutation(
                  { gallery: images, galleryImages: images },
                  'Showcase gallery photos and order updated.'
                );
              }}
              isSaving={isSaving}
            />
          )}

          {/* AREA 3: FAQ ACCORDION */}
          {activeArea === 'faq' && (
            <FAQSection
              initialFaqs={faqInitial}
              onSave={async (faqs) => {
                await handleSaveMutation({ faqs }, 'FAQ questions and order updated.');
              }}
              isSaving={isSaving}
            />
          )}

          {/* AREA 4: LEGAL & POLICIES */}
          {activeArea === 'legal' && (
            <LegalPagesSection
              initialLegalDocs={legalInitial}
              onSave={async (docs) => {
                await handleSaveMutation(
                  { legal: docs, legalDocs: docs },
                  'Terms of Service and Privacy Policy published.'
                );
              }}
              isSaving={isSaving}
            />
          )}

          {/* AREA 5: BUSINESS INFORMATION & HOURS */}
          {activeArea === 'business' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-base font-serif font-bold text-ivory flex items-center gap-2 mb-1">
                  <Store className="w-4 h-4 text-gold" />
                  Storefront Identity & Contact
                </h3>
                <p className="text-xs text-ivory-dim/70 mb-4">
                  Authoritative public business details displayed across the website and booking confirmation receipts.
                </p>
                <GeneralSettingsSection
                  initialValues={generalInitialValues}
                  onSave={async (vals) => {
                    await handleSaveMutation(vals, 'Storefront identity details updated.');
                  }}
                  isSaving={isSaving}
                />
              </div>

              <div className="border-t border-white/5 pt-6">
                <BusinessHoursSection
                  initialHours={businessHoursArray}
                  onSave={async (hours) => {
                    await handleSaveMutation(
                      { businessHours: hours },
                      'Weekly operating hours updated.'
                    );
                  }}
                  isSaving={isSaving}
                />
              </div>
            </div>
          )}

          {/* AREA 6: FOOTER & SOCIALS */}
          {activeArea === 'footer' && (
            <FooterSection
              initialFooter={footerInitial}
              generalInfo={generalInitialValues}
              onSave={async (footer) => {
                await handleSaveMutation({ footer }, 'Footer brand copy and social links updated.');
              }}
              isSaving={isSaving}
              onNavigateToGeneral={() => setActiveArea('business')}
            />
          )}
        </div>
      ) : null}

      {/* ── 4. DEDICATED SECTION EDIT MODAL (FOR HERO & ABOUT FROM CMS) ───── */}
      {editingSectionKey === 'hero' && settings && (
        <Modal
          isOpen={true}
          onClose={() => setEditingSectionKey(null)}
          title="EDIT HERO BANNER CONTENT"
          size="lg"
        >
          <div className="p-2">
            <LandingPageSection
              initialWebsite={websiteInitial}
              onSave={async (updatedWebsite) => {
                await handleSaveMutation(
                  { website: updatedWebsite },
                  'Hero banner content and copy updated.'
                );
              }}
              isSaving={isSaving}
              canConfigureAdvanced={true}
            />
          </div>
        </Modal>
      )}

      {editingSectionKey === 'about' && settings && (
        <Modal
          isOpen={true}
          onClose={() => setEditingSectionKey(null)}
          title="EDIT ABOUT & BRAND HERITAGE"
          size="lg"
        >
          <div className="p-2">
            <AboutSection
              initialAbout={aboutInitial}
              onSave={async (updatedAbout) => {
                await handleSaveMutation(
                  { about: updatedAbout },
                  'About brand story, stats, and heritage photo updated.'
                );
              }}
              isSaving={isSaving}
            />
          </div>
        </Modal>
      )}
    </div>
  );
};
