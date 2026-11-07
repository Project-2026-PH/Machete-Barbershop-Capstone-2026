import React, { useState, useEffect } from 'react';
import {
  HelpCircle, Plus, Trash2, Edit2, ArrowUp, ArrowDown, Save,
  RotateCcw, AlertCircle, Eye, EyeOff, Check
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import type { FAQConfig } from '@demoshop/shared-types';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';
import { ShopSettingsOverrideContext } from '@/hooks/useShopSettings';
import { FAQ } from '@/features/faq/FAQ';

interface FAQSectionProps {
  initialFaqs: FAQConfig[];
  onSave: (faqs: FAQConfig[]) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const FAQSection: React.FC<FAQSectionProps> = ({
  initialFaqs,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [faqs, setFaqs] = useState<FAQConfig[]>(
    [...initialFaqs].sort((a, b) => a.displayOrder - b.displayOrder)
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQConfig | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Form states for add / edit
  const [modalQuestion, setModalQuestion] = useState('');
  const [modalAnswer, setModalAnswer] = useState('');
  const [modalCategory, setModalCategory] = useState('general');
  const [modalEnabled, setModalEnabled] = useState(true);

  useEffect(() => {
    setFaqs([...initialFaqs].sort((a, b) => a.displayOrder - b.displayOrder));
  }, [initialFaqs]);

  const isDirty = JSON.stringify(faqs) !== JSON.stringify(initialFaqs);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= faqs.length) return;

    const updated = [...faqs];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const reindexed = updated.map((item, i) => ({ ...item, displayOrder: i + 1 }));
    setFaqs(reindexed);
  };

  const handleToggleEnabled = (id: string) => {
    setFaqs((prev) =>
      prev.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const handleOpenAddModal = () => {
    setModalQuestion('');
    setModalAnswer('');
    setModalCategory('general');
    setModalEnabled(true);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (faq: FAQConfig) => {
    setEditingFaq(faq);
    setModalQuestion(faq.question);
    setModalAnswer(faq.answer);
    setModalCategory(faq.category || 'general');
    setModalEnabled(faq.enabled);
  };

  const handleSaveModal = () => {
    if (!modalQuestion.trim() || !modalAnswer.trim()) {
      setError('Both Question and Answer are required.');
      return;
    }
    setError(null);

    if (editingFaq) {
      setFaqs((prev) =>
        prev.map((f) =>
          f.id === editingFaq.id
            ? {
                ...f,
                question: modalQuestion.trim(),
                answer: modalAnswer.trim(),
                category: modalCategory,
                enabled: modalEnabled,
              }
            : f
        )
      );
      setEditingFaq(null);
    } else {
      const newFaq: FAQConfig = {
        id: `faq-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        question: modalQuestion.trim(),
        answer: modalAnswer.trim(),
        category: modalCategory,
        enabled: modalEnabled,
        displayOrder: faqs.length + 1,
      };
      setFaqs((prev) => [...prev, newFaq]);
      setIsAddModalOpen(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTargetId) return;
    const filtered = faqs.filter((f) => f.id !== deleteTargetId);
    const reindexed = filtered.map((f, i) => ({ ...f, displayOrder: i + 1 }));
    setFaqs(reindexed);
    setDeleteTargetId(null);
  };

  const handleReset = () => {
    setFaqs([...initialFaqs].sort((a, b) => a.displayOrder - b.displayOrder));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    await onSave(faqs);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-gold" /> Frequently Asked Questions (FAQ)
          </h3>
          <p className="text-xs text-ivory-dim mt-1">
            Authoritative public FAQs displayed on the website. Toggle visibility or adjust display ordering.
          </p>
        </div>

        <Button
          type="button"
          variant="primary"
          onClick={handleOpenAddModal}
          className="flex items-center gap-2 text-xs"
        >
          <Plus className="w-4 h-4" /> Add FAQ Entry
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {faqs.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-white/10 rounded-sm">
            <HelpCircle className="w-10 h-10 text-gold/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-ivory">No FAQ entries created yet</p>
            <p className="text-xs text-ivory-dim mt-1">Add common customer inquiries regarding booking, walk-ins, and payments.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {faqs.map((faq, index) => (
              <div
                key={faq.id}
                className={`p-4 rounded border transition-all ${
                  faq.enabled
                    ? 'bg-white/[0.02] border-white/10 hover:border-gold/30'
                    : 'bg-charcoal/40 border-white/5 opacity-60'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {/* Reorder Buttons */}
                    <div className="flex flex-col gap-1 pt-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMove(index, 'up')}
                        className="p-1 rounded bg-white/5 hover:border-gold/50 text-ivory-dim hover:text-white disabled:opacity-20"
                        title="Move up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={index === faqs.length - 1}
                        onClick={() => handleMove(index, 'down')}
                        className="p-1 rounded bg-white/5 hover:border-gold/50 text-ivory-dim hover:text-white disabled:opacity-20"
                        title="Move down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono font-bold text-gold bg-gold/10 px-1.5 py-0.5 rounded border border-gold/20">
                          #{index + 1}
                        </span>
                        <h4 className="text-sm font-bold text-ivory">{faq.question}</h4>
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded font-bold ${
                            faq.enabled
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-white/10 text-ivory-dim border border-white/10'
                          }`}
                        >
                          {faq.enabled ? 'ACTIVE' : 'DISABLED'}
                        </span>
                        {faq.category && (
                          <span className="text-[9px] font-mono uppercase bg-white/5 text-ivory-dim px-1.5 py-0.2 rounded">
                            {faq.category}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ivory-dim leading-relaxed whitespace-pre-line pl-6">
                        {faq.answer}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-start">
                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(faq.id)}
                      className={`p-1.5 rounded text-xs flex items-center gap-1 ${
                        faq.enabled
                          ? 'text-ivory-dim hover:text-white'
                          : 'text-emerald-400 hover:text-emerald-300'
                      }`}
                      title={faq.enabled ? 'Disable FAQ (Hide from public)' : 'Enable FAQ (Show on public site)'}
                    >
                      {faq.enabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(faq)}
                      className="p-1.5 text-ivory-dim hover:text-gold"
                      title="Edit question & answer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTargetId(faq.id)}
                      className="p-1.5 text-red-400/80 hover:text-red-300"
                      title="Delete FAQ permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

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
              {isSaving ? 'Saving Changes...' : 'Save FAQ Entries'}
            </Button>
          </div>
        </div>
      </form>

      {/* Add / Edit FAQ Modal */}
      <Modal
        isOpen={isAddModalOpen || editingFaq !== null}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingFaq(null);
        }}
        title={editingFaq ? 'Edit FAQ Entry' : 'Add FAQ Entry'}
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingFaq(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveModal}
            >
              Save Entry
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
              Question <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={modalQuestion}
              onChange={(e) => setModalQuestion(e.target.value)}
              placeholder="e.g. Do I need an appointment?"
              className="w-full bg-charcoal border border-white/20 px-3 py-2 text-ivory text-sm rounded focus:border-gold focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
              Answer <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={4}
              value={modalAnswer}
              onChange={(e) => setModalAnswer(e.target.value)}
              placeholder="e.g. While appointments guarantee your preferred slot and barber, walk-ins are always welcomed..."
              className="w-full bg-charcoal border border-white/20 px-3 py-2 text-ivory text-sm rounded focus:border-gold focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-gold font-bold mb-1.5">
                Category
              </label>
              <select
                value={modalCategory}
                onChange={(e) => setModalCategory(e.target.value)}
                className="w-full bg-charcoal border border-white/20 px-3 py-2 text-ivory text-xs rounded focus:border-gold focus:outline-none"
              >
                <option value="general">General</option>
                <option value="booking">Booking & Appointments</option>
                <option value="payments">Payments & Tender</option>
                <option value="services">Services & Haircuts</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={modalEnabled}
                  onChange={(e) => setModalEnabled(e.target.checked)}
                  className="rounded border-white/20 bg-charcoal text-gold focus:ring-gold"
                />
                <span className="text-xs text-ivory font-medium">Active (Visible Publicly)</span>
              </label>
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        title="Delete FAQ Entry?"
        footer={
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleConfirmDelete}
              className="border-red-500/50 text-red-400 hover:bg-red-500/10"
            >
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ivory-dim leading-relaxed">
          Are you sure you want to permanently delete this FAQ entry? To temporarily remove it from public view while preserving the content, you can choose to disable it instead.
        </p>
      </Modal>

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="FAQ"
        isDirty={isDirty}
        isSaving={isSaving}
        saveButtonLabel="Save FAQ Entries"
        onSave={async () => {
          await onSave(faqs);
          setIsPreviewOpen(false);
        }}
      >
        <ShopSettingsOverrideContext.Provider value={{ faqs } as any}>
          <div className="bg-charcoal p-4 sm:p-8">
            <FAQ />
          </div>
        </ShopSettingsOverrideContext.Provider>
      </StorefrontPreviewModal>
    </div>
  );
};
