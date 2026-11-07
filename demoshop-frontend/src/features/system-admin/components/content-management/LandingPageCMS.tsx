import React, { useState } from 'react';
import {
  Globe,
  Eye,
  EyeOff,
  Edit2,
  Sliders,
  Sparkles,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { WebsiteCustomization, ShopSettings } from '@demoshop/shared-types';
import {
  LANDING_PAGE_SECTIONS,
  type LandingSectionDef,
  type ContentManagementArea,
} from './content-constants';
import { SectionAdvancedModal } from './SectionAdvancedModal';

interface LandingPageCMSProps {
  settings: ShopSettings;
  onEditSection: (sectionKey: string) => void;
  onNavigateArea: (areaKey: ContentManagementArea) => void;
  onSaveWebsite: (updatedWebsite: WebsiteCustomization, message: string) => Promise<void>;
  isSaving: boolean;
}

export const LandingPageCMS: React.FC<LandingPageCMSProps> = ({
  settings,
  onEditSection,
  onNavigateArea,
  onSaveWebsite,
  isSaving,
}) => {
  const website = settings.website || {
    heroHeadline: 'PRECISION & TRADITION',
    heroSubtext: 'Experience the art of classic grooming in a modern industrial setting.',
  };

  const [advancedModalSection, setAdvancedModalSection] = useState<LandingSectionDef | null>(null);

  const handleToggleVisibilityQuick = async (sectionKey: string) => {
    const currentVis = website.sectionVisibility?.[sectionKey as keyof typeof website.sectionVisibility] !== false;
    const nextVis = !currentVis;

    const updatedWebsite: WebsiteCustomization = {
      ...website,
      sectionVisibility: {
        ...(website.sectionVisibility || {}),
        [sectionKey]: nextVis,
      },
    };

    const sectionDef = LANDING_PAGE_SECTIONS.find((s) => s.key === sectionKey);
    const label = sectionDef?.name || sectionKey;
    await onSaveWebsite(
      updatedWebsite,
      `${label} is now ${nextVis ? 'visible' : 'hidden'} on the storefront.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-gold" />
            <h3 className="text-base font-serif font-bold text-ivory">
              Homepage Sections & Layout Control
            </h3>
          </div>
          <p className="text-xs text-ivory-dim/75 mt-1">
            Manage what customers see when landing on DemoShop's public website. Control content copy, presentation, and section visibility.
          </p>
        </div>

        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-charcoal border border-white/10 hover:border-gold/40 text-ivory text-xs transition-colors shrink-0"
        >
          <span>View Live Storefront</span>
          <ExternalLink className="w-3.5 h-3.5 text-gold" />
        </a>
      </div>

      {/* Sections List */}
      <div className="space-y-3">
        {LANDING_PAGE_SECTIONS.map((section) => {
          const isVisible =
            website.sectionVisibility?.[section.key as keyof typeof website.sectionVisibility] !== false;

          return (
            <div
              key={section.key}
              className={`p-4 rounded-sm border transition-all ${
                isVisible
                  ? 'bg-charcoal-light/80 border-white/10 hover:border-white/20'
                  : 'bg-charcoal/60 border-white/5 opacity-70 hover:opacity-100'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Left: Section Identity & Description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h4 className="font-serif font-bold text-sm text-ivory">
                      {section.name}
                    </h4>

                    {/* Visibility Badge */}
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] text-[10px] font-mono font-bold uppercase tracking-wider ${
                        isVisible
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isVisible ? 'bg-emerald-400' : 'bg-zinc-500'
                        }`}
                      />
                      <span>{isVisible ? 'Visible' : 'Hidden'}</span>
                    </span>

                    {/* Active Content Preview Snippet for Hero */}
                    {section.key === 'hero' && website.heroHeadline && (
                      <span className="text-[11px] text-ivory-dim/60 font-mono truncate max-w-[280px]">
                        "{website.heroHeadline}"
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-ivory-dim/75 mt-1.5 leading-relaxed">
                    {section.description}
                  </p>
                </div>

                {/* Right: Quick Operational Controls */}
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* Quick Visibility Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleVisibilityQuick(section.key)}
                    disabled={isSaving}
                    title={isVisible ? 'Hide from live storefront' : 'Show on live storefront'}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] text-xs font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                      isVisible
                        ? 'bg-charcoal border border-white/10 hover:border-gold/40 text-ivory-dim hover:text-ivory'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    }`}
                  >
                    {isVisible ? (
                      <>
                        <EyeOff className="w-3.5 h-3.5 text-ivory-dim" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Show</span>
                      </>
                    )}
                  </button>

                  {/* Primary Edit Content Action */}
                  {section.hasDedicatedEditor ? (
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (section.editorArea) {
                          onNavigateArea(section.editorArea);
                        } else {
                          onEditSection(section.key);
                        }
                      }}
                      className="text-xs px-3.5 py-1.5 bg-gold hover:bg-gold-light text-charcoal font-bold flex items-center gap-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Content</span>
                    </Button>
                  ) : section.key === 'services' ? (
                    <a
                      href="/admin?tab=services"
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-[2px] bg-charcoal border border-white/10 hover:border-gold/40 text-gold transition-colors"
                    >
                      <span>Manage Services</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  ) : section.key === 'locations' ? (
                    <a
                      href="/locations"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-[2px] bg-charcoal border border-white/10 hover:border-gold/40 text-ivory-dim hover:text-ivory transition-colors"
                    >
                      <span>View Locations</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  ) : null}

                  {/* Advanced Settings Trigger */}
                  <button
                    type="button"
                    onClick={() => setAdvancedModalSection(section)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[2px] bg-charcoal border border-white/10 hover:border-gold/40 text-xs text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                    title="Configure advanced presentation and routing"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Advanced</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Advanced Settings Modal */}
      {advancedModalSection && (
        <SectionAdvancedModal
          section={advancedModalSection}
          website={website}
          isOpen={true}
          onClose={() => setAdvancedModalSection(null)}
          onSave={async (updatedWebsite) => {
            await onSaveWebsite(
              updatedWebsite,
              `Advanced settings for ${advancedModalSection.name} updated.`
            );
          }}
          isSaving={isSaving}
        />
      )}
    </div>
  );
};
