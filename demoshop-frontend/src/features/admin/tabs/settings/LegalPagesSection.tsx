import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  FileText,
  Save,
  RotateCcw,
  AlertCircle,
  Eye,
  Check,
  ExternalLink,
  Calendar,
  Columns,
  Info,
  Edit3,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';
import type { LegalDocsConfig, LegalDocumentConfig } from '@demoshop/shared-types';
import { MarkdownToolbar } from './MarkdownToolbar';
import { PublicDocumentRenderer } from '@/components/documents/PublicDocumentRenderer';

interface LegalPagesSectionProps {
  initialLegalDocs: LegalDocsConfig;
  onSave: (docs: LegalDocsConfig) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const LegalPagesSection: React.FC<LegalPagesSectionProps> = ({
  initialLegalDocs,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [activeDocKey, setActiveDocKey] = useState<'termsOfService' | 'privacyPolicy'>('termsOfService');
  const [legalDocs, setLegalDocs] = useState<LegalDocsConfig>(initialLegalDocs);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit');
  const [desktopLayout, setDesktopLayout] = useState<'split' | 'edit-only' | 'preview-only'>('split');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setLegalDocs(initialLegalDocs);
  }, [initialLegalDocs]);

  const isDirty = JSON.stringify(legalDocs) !== JSON.stringify(initialLegalDocs);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const rawDoc = legalDocs[activeDocKey];
  const currentDoc: LegalDocumentConfig = {
    id: rawDoc?.id || activeDocKey,
    documentKey: rawDoc?.documentKey || activeDocKey,
    title: rawDoc?.title || (activeDocKey === 'termsOfService' ? 'Terms of Service' : 'Privacy Policy'),
    slug: rawDoc?.slug || (activeDocKey === 'termsOfService' ? 'terms-of-service' : 'privacy-policy'),
    content: rawDoc?.contentMarkdown || rawDoc?.content || '',
    contentMarkdown: rawDoc?.contentMarkdown || rawDoc?.content || '',
    status: rawDoc?.status || 'active',
    enabled: rawDoc?.enabled ?? (rawDoc?.status !== 'draft'),
    lastUpdated: rawDoc?.lastUpdated || new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Manila',
    }).format(new Date()),
    lastUpdatedAt: rawDoc?.lastUpdatedAt || new Date().toISOString(),
  };

  const currentContent = currentDoc.contentMarkdown || currentDoc.content || '';

  const handleUpdateCurrentDoc = (field: keyof LegalDocumentConfig, value: any) => {
    setLegalDocs((prev) => {
      const existing = prev[activeDocKey] || {};
      const updated = {
        ...existing,
        [field]: value,
      };

      // Keep content and contentMarkdown synchronized
      if (field === 'content' || field === 'contentMarkdown') {
        updated.content = value;
        updated.contentMarkdown = value;
      }

      // Keep status and enabled synchronized
      if (field === 'status') {
        updated.enabled = value === 'active';
      }
      if (field === 'enabled') {
        updated.status = value ? 'active' : 'draft';
      }

      return {
        ...prev,
        [activeDocKey]: updated,
      };
    });
  };

  const handleReset = () => {
    if (isDirty && !window.confirm('Discard unsaved document edits? Any modified text will be lost.')) {
      return;
    }
    setLegalDocs(initialLegalDocs);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentDoc.title?.trim()) {
      setError('Document title is required.');
      return;
    }

    // Format according to Asia/Manila timezone
    const now = new Date();
    const formattedDate = new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'Asia/Manila',
    }).format(now);
    const isoString = now.toISOString();

    const updatedDoc: LegalDocumentConfig = {
      ...currentDoc,
      lastUpdated: formattedDate,
      lastUpdatedAt: isoString,
      content: currentContent,
      contentMarkdown: currentContent,
      enabled: currentDoc.status === 'active',
    };

    const updatedDocs: LegalDocsConfig = {
      ...legalDocs,
      [activeDocKey]: updatedDoc,
    };

    await onSave(updatedDocs);
  };

  const publicLink =
    activeDocKey === 'termsOfService'
      ? '/documents/terms-of-service'
      : '/documents/privacy-policy';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-gold" /> Legal & Public Documents
          </h3>
          <p className="text-xs text-ivory-dim mt-1">
            Manage public policies and informational documents rendered dynamically to customers and visitors.
          </p>
        </div>

        <Link
          to={publicLink}
          target="_blank"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 border border-white/10 text-xs text-gold hover:bg-white/10 font-semibold self-start sm:self-auto transition-colors"
        >
          View Public Page <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Admin Disclaimer Notice */}
      <div className="p-3.5 bg-gold/5 border border-gold/20 rounded-lg flex items-start gap-3">
        <Info className="w-4 h-4 text-gold shrink-0 mt-0.5" />
        <p className="text-xs text-ivory-dim leading-relaxed">
          <strong className="text-gold font-semibold">Administrative Notice:</strong> System-generated starter content is provided as a guide. Review and update each document to ensure it accurately reflects your business practices and requirements.
        </p>
      </div>

      {/* Document Selector Tabs */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          type="button"
          onClick={() => setActiveDocKey('termsOfService')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
            activeDocKey === 'termsOfService'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-ivory-dim hover:text-white'
          }`}
        >
          Terms of Service
        </button>
        <button
          type="button"
          onClick={() => setActiveDocKey('privacyPolicy')}
          className={`px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
            activeDocKey === 'privacyPolicy'
              ? 'border-gold text-gold bg-gold/5'
              : 'border-transparent text-ivory-dim hover:text-white'
          }`}
        >
          Privacy Policy
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Metadata Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
              Document Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={currentDoc.title || ''}
              onChange={(e) => handleUpdateCurrentDoc('title', e.target.value)}
              className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded font-serif font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
              Publication Status
            </label>
            <select
              value={currentDoc.status || 'active'}
              onChange={(e) => handleUpdateCurrentDoc('status', e.target.value as 'active' | 'draft')}
              className="w-full bg-charcoal border border-white/15 px-3 py-2 text-ivory text-xs focus:border-gold focus:outline-none rounded"
            >
              <option value="active">Active (Publicly Visible)</option>
              <option value="draft">Draft / Inactive (Hidden)</option>
            </select>
          </div>
        </div>

        {/* Metadata info badge */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-ivory-dim bg-white/[0.02] p-2.5 rounded border border-white/5 gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[11px]">
            <Calendar className="w-3.5 h-3.5 text-gold" />
            Display Last Updated: <strong className="text-ivory">{currentDoc.lastUpdated || 'Current'}</strong>
          </span>
          <span className="text-[10px] text-ivory-dim/70 italic">
            Automatically stamped in Asia/Manila time when saving.
          </span>
        </div>

        {/* Formatting Help Accordion */}
        {showHelp && (
          <div className="p-4 bg-charcoal-light/70 rounded-lg border border-white/10 text-xs text-ivory-dim space-y-2">
            <div className="font-bold text-gold uppercase tracking-wider text-[11px] mb-2 flex items-center justify-between">
              <span>Markdown Formatting Reference</span>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="text-ivory-dim hover:text-white"
              >
                ✕ Close
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono">
              <div className="space-y-1">
                <p><span className="text-gold font-bold"># Heading 1</span> - Document title</p>
                <p><span className="text-gold font-bold">## Heading 2</span> - Section (auto TOC)</p>
                <p><span className="text-gold font-bold">### Heading 3</span> - Subsection</p>
                <p><span className="text-gold font-bold">**Bold Text**</span> - Strong emphasis</p>
                <p><span className="text-gold font-bold">*Italic Text*</span> - Subtle emphasis</p>
              </div>
              <div className="space-y-1">
                <p><span className="text-gold font-bold">- Bullet item</span> - Unordered list</p>
                <p><span className="text-gold font-bold">1. Numbered</span> - Ordered list</p>
                <p><span className="text-gold font-bold">&gt; Callout</span> - Information quote</p>
                <p><span className="text-gold font-bold">[Text](url)</span> - Safe hyperlink</p>
                <p><span className="text-gold font-bold">---</span> - Horizontal separator</p>
              </div>
            </div>
          </div>
        )}

        {/* View Switchers: Mobile Tab switch + Desktop Layout switch */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          {/* Mobile Tabs */}
          <div className="flex sm:hidden gap-1 bg-white/5 p-1 rounded">
            <button
              type="button"
              onClick={() => setMobileTab('edit')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 ${
                mobileTab === 'edit' ? 'bg-gold text-charcoal' : 'text-ivory-dim hover:text-white'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('preview')}
              className={`px-3 py-1 rounded text-xs font-semibold flex items-center gap-1.5 ${
                mobileTab === 'preview' ? 'bg-gold text-charcoal' : 'text-ivory-dim hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Preview
            </button>
          </div>

          {/* Desktop Layout Selector */}
          <div className="hidden sm:flex items-center gap-1 ml-auto text-xs text-ivory-dim">
            <span className="text-[11px] uppercase tracking-wider text-ivory-dim/70 mr-1.5 font-mono">View:</span>
            <button
              type="button"
              onClick={() => setDesktopLayout('split')}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                desktopLayout === 'split'
                  ? 'bg-gold/10 border-gold text-gold font-semibold'
                  : 'bg-white/5 border-white/10 text-ivory-dim hover:text-white'
              }`}
            >
              <Columns className="w-3 h-3" /> Split View
            </button>
            <button
              type="button"
              onClick={() => setDesktopLayout('edit-only')}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                desktopLayout === 'edit-only'
                  ? 'bg-gold/10 border-gold text-gold font-semibold'
                  : 'bg-white/5 border-white/10 text-ivory-dim hover:text-white'
              }`}
            >
              <Edit3 className="w-3 h-3" /> Editor Only
            </button>
            <button
              type="button"
              onClick={() => setDesktopLayout('preview-only')}
              className={`px-2.5 py-1 rounded border text-[11px] font-medium flex items-center gap-1 transition-colors ${
                desktopLayout === 'preview-only'
                  ? 'bg-gold/10 border-gold text-gold font-semibold'
                  : 'bg-white/5 border-white/10 text-ivory-dim hover:text-white'
              }`}
            >
              <Eye className="w-3 h-3" /> Preview Only
            </button>
          </div>
        </div>

        {/* Editor & Preview Container */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Editor Column */}
          <div
            className={`flex flex-col space-y-0 ${
              mobileTab === 'preview' ? 'hidden sm:flex' : ''
            } ${desktopLayout === 'preview-only' ? 'sm:hidden' : ''} ${
              desktopLayout === 'edit-only' ? 'sm:col-span-2' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] uppercase tracking-wider text-gold font-bold flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Markdown Content
              </label>
              <span className="text-[10px] text-ivory-dim font-mono">
                {currentContent.length} chars
              </span>
            </div>

            <MarkdownToolbar
              textareaRef={textareaRef}
              value={currentContent}
              onChange={(val) => handleUpdateCurrentDoc('contentMarkdown', val)}
              onToggleHelp={() => setShowHelp((prev) => !prev)}
            />

            <textarea
              ref={textareaRef}
              rows={18}
              value={currentContent}
              onChange={(e) => handleUpdateCurrentDoc('contentMarkdown', e.target.value)}
              placeholder="# Section Heading&#10;&#10;Write clean markdown here without embedding raw HTML or style tags."
              className="w-full bg-charcoal border-x border-b border-white/10 px-4 py-3 text-ivory text-xs font-mono focus:border-gold focus:outline-none rounded-b-lg resize-y leading-relaxed"
            />
          </div>

          {/* Preview Column */}
          <div
            className={`flex flex-col ${
              mobileTab === 'edit' ? 'hidden sm:flex' : ''
            } ${desktopLayout === 'edit-only' ? 'sm:hidden' : ''} ${
              desktopLayout === 'preview-only' ? 'sm:col-span-2' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] uppercase tracking-wider text-gold font-bold flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Live Public Preview
              </label>
              <span className="text-[10px] text-ivory-dim font-mono">
                DemoShop's Public Styling
              </span>
            </div>

            <div className="h-[480px] overflow-y-auto bg-charcoal border border-white/10 rounded-lg p-5">
              <div className="border-b border-white/10 pb-4 mb-6">
                <span className="text-[10px] font-mono uppercase tracking-widest text-gold font-bold">
                  {currentDoc.status === 'active' ? '● LIVE DOCUMENT' : '○ DRAFT PREVIEW'}
                </span>
                <h1 className="text-2xl font-serif font-bold text-ivory mt-1">
                  {currentDoc.title || 'Untitled Document'}
                </h1>
                <p className="text-xs text-gold/80 italic mt-1">
                  Last Updated: {currentDoc.lastUpdated}
                </p>
              </div>

              <PublicDocumentRenderer content={currentContent} isCompact={true} showToc={true} />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between sm:gap-4 pt-4 border-t border-white/10">
          <Button
            type="button"
            variant="outline"
            disabled={!isDirty || isSaving}
            onClick={handleReset}
            className="flex items-center justify-center gap-1.5 text-xs text-ivory-dim hover:text-white min-h-[44px] w-full sm:w-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Discard Changes
          </Button>

          <Button
            type="submit"
            variant="primary"
            disabled={!isDirty || isSaving}
            className="flex items-center justify-center gap-2 px-6 min-h-[44px] w-full sm:w-auto text-xs sm:text-sm"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving Changes...' : `Save ${currentDoc.title || 'Document'}`}
          </Button>
        </div>
      </form>
    </div>
  );
};
