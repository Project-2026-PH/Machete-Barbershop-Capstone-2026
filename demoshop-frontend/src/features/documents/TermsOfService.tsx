import React from 'react';
import { useShopSettings } from '../../hooks/useShopSettings';
import { PublicDocumentRenderer } from '@/components/documents/PublicDocumentRenderer';
import { FileText, Clock, AlertTriangle } from 'lucide-react';

export const TermsOfService = () => {
  const { settings, loading } = useShopSettings();
  const doc = settings?.legalDocs?.termsOfService || settings?.legal?.termsOfService;

  const title = doc?.title || 'Terms of Service';
  const lastUpdated = doc?.lastUpdated || 'Current';
  const content = doc?.contentMarkdown || doc?.content || '';
  const isEnabled = doc?.enabled !== false && doc?.status !== 'draft';

  return (
    <div className="min-h-screen bg-charcoal pt-32 pb-24 px-4 sm:px-6 lg:px-8 relative">
      <div className="absolute inset-0 bg-texture opacity-40 pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Document Header */}
        <header className="border-b border-white/10 pb-8 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/10 border border-gold/20 text-gold text-xs font-mono uppercase tracking-wider mb-4">
            <FileText className="w-3.5 h-3.5" />
            <span>Public Document</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif font-bold text-ivory tracking-tight">
            {title}
          </h1>

          <div className="flex items-center gap-2 mt-4 text-xs sm:text-sm text-gold/80 font-mono">
            <Clock className="w-4 h-4 text-gold" />
            <span>Last Updated: <strong className="text-ivory">{lastUpdated}</strong></span>
          </div>
        </header>

        {/* Status check / Document Body */}
        {loading ? (
          <div className="py-20 text-center text-ivory-dim font-light animate-pulse">
            Loading document...
          </div>
        ) : !isEnabled ? (
          <div className="p-6 bg-gold/5 border border-gold/20 rounded-lg text-center my-12">
            <AlertTriangle className="w-8 h-8 text-gold mx-auto mb-3" />
            <h2 className="text-lg font-serif font-bold text-ivory mb-2">Document Under Review</h2>
            <p className="text-sm text-ivory-dim max-w-md mx-auto">
              This document is currently being updated by the administration and will be published once finalized.
            </p>
          </div>
        ) : (
          <PublicDocumentRenderer content={content} showToc={true} />
        )}
      </div>
    </div>
  );
};
