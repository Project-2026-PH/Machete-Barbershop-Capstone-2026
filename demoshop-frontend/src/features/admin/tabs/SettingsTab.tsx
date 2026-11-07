import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { AdminTabPanel } from '@/features/admin/components/AdminTabPanel';
import {
  Settings, Clock, CreditCard, Globe, Image as ImageIcon, HelpCircle,
  FileText, Layers, ShieldAlert, Loader2, AlertCircle, RefreshCw,
  ChevronRight, ChevronDown, CheckCircle2, ShieldCheck, Scissors, ShoppingBag
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import type { ShopSettings } from '@demoshop/shared-types';
import { getAdminShopSettings, updateAdminShopSettings } from '@/services/shopSettings.service';

// Modular Section Components
import { GeneralSettingsSection } from './settings/GeneralSettingsSection';
import { ServicesSettingsDomain } from './settings/ServicesSettingsDomain';
import { ShopSection, DEFAULT_SHOP_RETAIL_PRODUCTS } from './settings/ShopSection';
import { BusinessHoursSection, type BusinessHourDay } from './settings/BusinessHoursSection';
import { PaymentMethodsSection } from './settings/PaymentMethodsSection';
import { LandingPageSection } from './settings/LandingPageSection';
import { GallerySection } from './settings/GallerySection';
import { FAQSection } from './settings/FAQSection';
import { AboutSection } from './settings/AboutSection';
import { FooterSection } from './settings/FooterSection';
import { LegalPagesSection } from './settings/LegalPagesSection';
import { InvoiceProfileSection } from './settings/InvoiceProfileSection';

type SettingsSectionKey =
  | 'general'
  | 'landing_page'
  | 'services'
  | 'shop'
  | 'gallery'
  | 'about'
  | 'faq'
  | 'footer'
  | 'business_hours'
  | 'payment_methods'
  | 'invoice-profile'
  | 'legal';

interface NavItem {
  key: SettingsSectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'general', label: 'General', icon: Settings, description: 'Storefront name, email & address' },
  { key: 'landing_page', label: 'Landing Page', icon: Globe, description: 'Hero banner, headlines & copy' },
  { key: 'services', label: 'Services', icon: Scissors, description: 'Service menu, pricing & catalog images' },
  { key: 'shop', label: 'Collections', icon: ShoppingBag, description: 'Retail products, pricing & showcase' },
  { key: 'gallery', label: 'Gallery', icon: ImageIcon, description: 'Showcase photos & ordering' },
  { key: 'about', label: 'About', icon: FileText, description: 'Story, metrics & heritage' },
  { key: 'faq', label: 'FAQ', icon: HelpCircle, description: 'Public inquiries & answers' },
  { key: 'footer', label: 'Footer', icon: Layers, description: 'Footer copy, phone & socials' },
  { key: 'business_hours', label: 'Business Hours', icon: Clock, description: 'Weekly schedule & booking hours' },
  { key: 'payment_methods', label: 'Payment Methods', icon: CreditCard, description: 'Tender channels & QR codes' },
  { key: 'invoice-profile', label: 'Invoice Profile', icon: ShieldCheck, description: 'Protected seller details for invoices' },
  { key: 'legal', label: 'Legal & Public Pages', icon: ShieldAlert, description: 'Terms of Service & Privacy Policy' },
];

export const SettingsTab: React.FC = () => {
  const { addToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSection, setActiveSection] = useState<SettingsSectionKey>(() => {
    const subtabParam = searchParams.get('subtab');
    if (subtabParam === 'services') return 'services';
    if (subtabParam === 'shop') return 'shop';
    return 'general';
  });
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Dirty state tracking per section
  const [isCurrentSectionDirty, setIsCurrentSectionDirty] = useState(false);

  // Unsaved changes confirmation modal
  const [pendingSectionKey, setPendingSectionKey] = useState<SettingsSectionKey | null>(null);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await getAdminShopSettings();
      setSettings(data);
    } catch (err: any) {
      console.error('Failed to load shop settings:', err);
      setFetchError(err?.response?.data?.message || err?.message || 'Failed to load shop settings.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Synchronize active section with URL subtab query parameter
  useEffect(() => {
    const subtabParam = searchParams.get('subtab');
    if (subtabParam) {
      const validKeys: SettingsSectionKey[] = [
        'general',
        'landing_page',
        'services',
        'shop',
        'gallery',
        'about',
        'faq',
        'footer',
        'business_hours',
        'payment_methods',
        'invoice-profile',
        'legal',
      ];
      if (validKeys.includes(subtabParam as SettingsSectionKey)) {
        setActiveSection(subtabParam as SettingsSectionKey);
      }
    }
  }, [searchParams]);

  const handleSelectSection = (key: SettingsSectionKey) => {
    if (key === activeSection) return;
    if (isCurrentSectionDirty) {
      setPendingSectionKey(key);
    } else {
      setActiveSection(key);
      setIsCurrentSectionDirty(false);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'settings');
        next.set('subtab', key);
        return next;
      });
    }
  };

  const handleConfirmDiscard = () => {
    if (pendingSectionKey) {
      setActiveSection(pendingSectionKey);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'settings');
        next.set('subtab', pendingSectionKey);
        return next;
      });
      setPendingSectionKey(null);
      setIsCurrentSectionDirty(false);
    }
  };

  const handleCancelDiscard = () => {
    setPendingSectionKey(null);
  };

  const handleSaveMutation = async (partialUpdate: Partial<ShopSettings>, successMessage: string) => {
    setIsSaving(true);
    try {
      const updated = await updateAdminShopSettings(partialUpdate);
      setSettings(updated);
      setIsCurrentSectionDirty(false);
      addToast({
        type: 'success',
        title: 'Settings Saved',
        message: successMessage,
      });
    } catch (err: any) {
      console.error('Failed to update shop settings:', err);
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err?.response?.data?.message || err?.message || 'Failed to persist settings.',
      });
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

  // Memoized initial values for each section to prevent inline object recreation from resetting local drafts
  const generalInitialValues = useMemo(() => ({
    shopName: settings?.shopName || "DemoShop's Barbers",
    contactEmail: settings?.contactEmail || 'portfolio@example.invalid',
    physicalAddress: settings?.physicalAddress || 'Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan',
  }), [settings?.shopName, settings?.contactEmail, settings?.physicalAddress]);

  const paymentMethodsInitial = useMemo(() => {
    return settings?.paymentMethods || [];
  }, [settings?.paymentMethods]);

  const landingPageInitial = useMemo(() => {
    return settings?.website || {
      heroHeadline: 'PRECISION & TRADITION',
      heroSubtext: 'Experience the art of classic grooming in an atmosphere of modern industrial elegance.',
    };
  }, [settings?.website]);

  const galleryInitial = useMemo(() => {
    return settings?.gallery || settings?.galleryImages || [];
  }, [settings?.gallery, settings?.galleryImages]);

  const shopInitial = useMemo(() => {
    if (settings?.shopProducts && settings.shopProducts.length > 0) {
      return [...settings.shopProducts];
    }
    return DEFAULT_SHOP_RETAIL_PRODUCTS;
  }, [settings?.shopProducts]);

  const faqInitial = useMemo(() => {
    return settings?.faqs || [];
  }, [settings?.faqs]);

  const aboutInitial = useMemo(() => {
    return settings?.about || {
      heading: 'CRAFTING CONFIDENCE SINCE 2018',
      subheading: 'TRADITION • PRECISION • STYLE',
    };
  }, [settings?.about]);

  const footerInitial = useMemo(() => {
    return settings?.footer || {};
  }, [settings?.footer]);

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

  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden w-full">
      <div className="flex-1 min-h-0 overflow-hidden">
        <AdminTabPanel panelKey="shop-settings" className="h-full min-h-0 flex flex-col p-0">
          {/* Header Banner */}
          <div className="bg-charcoal border-b border-white/10 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-gold" />
                <h2 className="text-xl font-serif font-bold text-ivory tracking-wide">
                  Storefront & Business Settings
                </h2>
              </div>
              <p className="text-xs text-ivory-dim mt-0.5">
                Authoritative business configuration governing public website, customer booking, and cashier POS.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] bg-gold/15 border border-gold/30 text-[10px] font-mono font-bold uppercase tracking-wider text-gold">
                <ShieldCheck className="w-3.5 h-3.5" /> Live Storefront
              </span>
              <Button
                variant="outline"
                onClick={fetchSettings}
                disabled={isLoading || isSaving}
                className="flex items-center gap-1.5 text-xs text-ivory-dim hover:text-white"
                title="Refresh settings from server"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
              </Button>
            </div>
          </div>

          {/* Main Workspace Body */}
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center p-12">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto" />
                <p className="text-sm font-medium text-ivory">Loading authoritative shop settings…</p>
                <p className="text-xs text-ivory-dim">Synchronizing storefront and operational configuration</p>
              </div>
            </div>
          ) : fetchError || !settings ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="max-w-md w-full bg-charcoal-light border border-red-500/20 rounded p-6 text-center space-y-4">
                <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
                <h3 className="text-lg font-bold text-ivory">Unable to Load Settings</h3>
                <p className="text-xs text-ivory-dim leading-relaxed">{fetchError || 'Settings data is unavailable.'}</p>
                <Button variant="primary" onClick={fetchSettings} className="inline-flex items-center gap-2">
                  <RefreshCw className="w-4 h-4" /> Retry Loading
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              {/* Desktop Left Sidebar Navigation */}
              <aside className="hidden md:flex w-64 flex-col bg-charcoal/80 border-r border-white/10 shrink-0 overflow-y-auto">
                <div className="p-3 text-[10px] uppercase tracking-widest text-gold/80 font-bold border-b border-white/5">
                  Configuration Domains
                </div>
                <nav className="p-2 space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.key;
                    const isDirty = isActive && isCurrentSectionDirty;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectSection(item.key)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-left transition-all group ${
                          isActive
                            ? 'bg-gold/15 text-gold border-l-2 border-gold font-bold shadow-inner'
                            : 'text-ivory-dim hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive ? 'text-gold' : 'text-ivory-dim/60 group-hover:text-gold/80'
                          }`} />
                          <div className="min-w-0">
                            <span className="text-xs truncate block">{item.label}</span>
                            <span className="text-[10px] text-ivory-dim/50 truncate block font-light">
                              {item.description}
                            </span>
                          </div>
                        </div>

                        {isDirty ? (
                          <span
                            className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.6)]"
                            title="Unsaved changes in this section"
                          />
                        ) : isActive ? (
                          <ChevronRight className="w-3.5 h-3.5 text-gold shrink-0 opacity-80" />
                        ) : null}
                      </button>
                    );
                  })}
                </nav>
              </aside>

              {/* Right Content Panel */}
              <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-charcoal-light/50 overscroll-contain">
                <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-28 sm:pb-32 lg:pb-12">
                  {/* Mobile Navigation Dropdown / Selector (Normal Block Flow in Mobile View) */}
                  <div className="md:hidden bg-charcoal-light border border-white/10 rounded-sm p-4 shadow-sm">
                    <label className="block text-[10px] uppercase tracking-wider text-gold font-bold mb-1.5">
                      Settings Section
                    </label>
                    <div className="relative">
                      <select
                        value={activeSection}
                        onChange={(e) => handleSelectSection(e.target.value as SettingsSectionKey)}
                        className="w-full bg-charcoal border border-white/15 px-3.5 py-2.5 text-ivory text-xs font-semibold rounded focus:border-gold focus:outline-none appearance-none pr-9 min-h-[44px]"
                      >
                        {NAV_ITEMS.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.label} {isCurrentSectionDirty && activeSection === item.key ? '• (Unsaved)' : ''}
                          </option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-ivory-dim">
                        <ChevronDown className="w-4 h-4 text-gold" />
                      </div>
                    </div>
                  </div>

                  {/* Form Card Container with independent bounds & padding */}
                  <div className="bg-charcoal-light border border-white/5 rounded-sm p-4 sm:p-6 card-gold-accent shadow-md">
                    {activeSection === 'general' && (
                      <GeneralSettingsSection
                        initialValues={generalInitialValues}
                        onSave={async (vals) => {
                          await handleSaveMutation(vals, 'General shop information updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'landing_page' && (
                      <LandingPageSection
                        initialWebsite={landingPageInitial}
                        onSave={async (website) => {
                          await handleSaveMutation({ website }, 'Landing page content updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'services' && (
                      <ServicesSettingsDomain
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'shop' && (
                      <ShopSection
                        initialProducts={shopInitial}
                        onSave={async (shopProducts) => {
                          await handleSaveMutation({ shopProducts }, 'Collections retail catalog updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'gallery' && (
                      <GallerySection
                        initialImages={galleryInitial}
                        onSave={async (galleryImages) => {
                          await handleSaveMutation({ gallery: galleryImages, galleryImages }, 'Gallery images and ordering updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'about' && (
                      <AboutSection
                        initialAbout={aboutInitial}
                        onSave={async (about) => {
                          await handleSaveMutation({ about }, 'About Us heritage and metrics updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'faq' && (
                      <FAQSection
                        initialFaqs={faqInitial}
                        onSave={async (faqs) => {
                          await handleSaveMutation({ faqs }, 'FAQ entries and display order updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'footer' && (
                      <FooterSection
                        initialFooter={footerInitial}
                        generalInfo={generalInitialValues}
                        onNavigateToGeneral={() => handleSelectSection('general')}
                        onSave={async (footer) => {
                          await handleSaveMutation({ footer }, 'Footer configuration updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'business_hours' && (
                      <BusinessHoursSection
                        initialHours={businessHoursArray}
                        onSave={async (newHours) => {
                          await handleSaveMutation({ businessHours: newHours }, 'Business operating hours updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'payment_methods' && (
                      <PaymentMethodsSection
                        initialMethods={paymentMethodsInitial}
                        onSave={async (methods) => {
                          await handleSaveMutation({ paymentMethods: methods }, 'Payment methods and tender channels updated.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}

                    {activeSection === 'invoice-profile' && <InvoiceProfileSection />}

                    {activeSection === 'legal' && (
                      <LegalPagesSection
                        initialLegalDocs={legalInitial}
                        onSave={async (legalDocs) => {
                          await handleSaveMutation({ legalDocs, legal: legalDocs }, 'Legal document published successfully.');
                        }}
                        isSaving={isSaving}
                        onDirtyChange={setIsCurrentSectionDirty}
                      />
                    )}
                  </div>
                </div>
              </main>
            </div>
          )}
        </AdminTabPanel>
      </div>

      {/* Unsaved Changes Confirmation Modal */}
      <Modal
        isOpen={pendingSectionKey !== null}
        onClose={handleCancelDiscard}
        title="Unsaved Changes"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelDiscard}
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirmDiscard}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              Discard Changes
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ivory-dim leading-relaxed">
          You have unsaved changes in this section. If you switch to another section before saving, your modifications will be discarded.
        </p>
      </Modal>
    </div>
  );
};

export const SettingsOverview = SettingsTab;
export default SettingsTab;
