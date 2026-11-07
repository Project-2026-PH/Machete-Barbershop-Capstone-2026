import React, { useState, useEffect, useRef } from 'react';
import {
  Image as ImageIcon, Upload, Trash2, ArrowUp, ArrowDown, Save,
  RotateCcw, AlertCircle, Loader2, Plus, Edit2, Check, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import type { GalleryImageConfig } from '@demoshop/shared-types';
import { uploadShopMedia } from '@/services/shopSettings.service';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';
import { ShopSettingsOverrideContext } from '@/hooks/useShopSettings';
import { Gallery } from '@/features/gallery/Gallery';

interface GallerySectionProps {
  initialImages: GalleryImageConfig[];
  onSave: (images: GalleryImageConfig[]) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const GallerySection: React.FC<GallerySectionProps> = ({
  initialImages,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const [images, setImages] = useState<GalleryImageConfig[]>(() =>
    [...initialImages].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Delete modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Edit caption inline / modal state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editCategory, setEditCategory] = useState('haircut');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setImages([...initialImages].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)));
  }, [initialImages]);

  const isDirty = JSON.stringify(images) !== JSON.stringify(initialImages);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const updated = [...images];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Re-index displayOrder
    const reindexed = updated.map((img, i) => ({ ...img, displayOrder: i + 1 }));
    setImages(reindexed);
  };

  const handleUploadImage = async (file: File | undefined) => {
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
      const publicUrl = await uploadShopMedia(file, 'gallery');
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      const newImage: GalleryImageConfig = {
        id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        imageUrl: publicUrl,
        src: publicUrl,
        caption: cleanName,
        alt: cleanName,
        category: 'haircut',
        displayOrder: images.length + 1,
      };
      setImages((prev) => [...prev, newImage]);
    } catch (err: any) {
      console.error('Failed to upload gallery image:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to upload gallery image.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmDelete = () => {
    if (!deleteTargetId) return;
    const filtered = images.filter((img) => img.id !== deleteTargetId);
    const reindexed = filtered.map((img, i) => ({ ...img, displayOrder: i + 1 }));
    setImages(reindexed);
    setDeleteTargetId(null);
  };

  const handleStartEdit = (img: GalleryImageConfig) => {
    setEditingId(img.id);
    setEditCaption(img.caption || img.alt || '');
    setEditCategory(img.category || 'haircut');
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    setImages((prev) =>
      prev.map((img) =>
        img.id === editingId
          ? {
              ...img,
              caption: editCaption.trim(),
              alt: editCaption.trim(),
              category: editCategory,
            }
          : img
      )
    );
    setEditingId(null);
  };

  const handleReset = () => {
    setImages([...initialImages].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    await onSave(images);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
            <ImageIcon className="w-5 h-5 text-gold" /> Public Showcase Gallery
          </h3>
          <p className="text-xs text-ivory-dim mt-1">
            Manage showcase images displayed on the homepage gallery with custom captions and display ordering.
          </p>
        </div>

        <div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              void handleUploadImage(file);
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="primary"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 text-xs"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" /> Add Gallery Image
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {images.length === 0 ? (
          <div className="p-12 text-center border border-dashed border-white/10 rounded-sm">
            <ImageIcon className="w-10 h-10 text-gold/30 mx-auto mb-2" />
            <p className="text-sm font-medium text-ivory">No gallery images uploaded yet</p>
            <p className="text-xs text-ivory-dim mt-1">Upload images to showcase haircuts, craft, and shop ambiance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img, index) => {
              const isEditing = editingId === img.id;

              return (
                <div
                  key={img.id}
                  className="bg-charcoal-light border border-white/10 rounded-sm overflow-hidden flex flex-col group hover:border-gold/40 transition-colors shadow-lg"
                >
                  <div className="relative h-44 bg-charcoal flex items-center justify-center overflow-hidden">
                    <img
                      src={img.imageUrl || img.src}
                      alt={img.caption || img.alt || 'Gallery item'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-2 left-2 bg-charcoal/80 border border-white/20 text-gold text-[10px] font-mono font-bold px-2 py-0.5 rounded">
                      #{index + 1}
                    </div>
                    <div className="absolute top-2 right-2 bg-black/70 text-ivory text-[10px] font-mono px-2 py-0.5 rounded uppercase">
                      {img.category || 'haircut'}
                    </div>
                  </div>

                  <div className="p-3 flex-1 flex flex-col justify-between space-y-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editCaption}
                          onChange={(e) => setEditCaption(e.target.value)}
                          placeholder="Caption / Alt text"
                          className="w-full bg-charcoal border border-white/20 px-2 py-1 text-xs text-ivory rounded focus:border-gold focus:outline-none"
                        />
                        <select
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          className="w-full bg-charcoal border border-white/20 px-2 py-1 text-xs text-ivory rounded focus:border-gold focus:outline-none"
                        >
                          <option value="haircut">Haircut</option>
                          <option value="styling">Styling</option>
                          <option value="interior">Interior</option>
                          <option value="equipment">Equipment</option>
                        </select>
                        <div className="flex gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2 py-0.5 text-[10px] text-ivory-dim hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            className="px-2 py-0.5 text-[10px] bg-gold text-charcoal font-bold rounded flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Done
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-medium text-ivory truncate">
                          {img.caption || img.alt || 'No caption'}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                      {/* Accessible Reorder Controls */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMove(index, 'up')}
                          className="p-1 rounded bg-white/5 border border-white/10 hover:border-gold/50 text-ivory-dim hover:text-white disabled:opacity-20"
                          title="Move earlier"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === images.length - 1}
                          onClick={() => handleMove(index, 'down')}
                          className="p-1 rounded bg-white/5 border border-white/10 hover:border-gold/50 text-ivory-dim hover:text-white disabled:opacity-20"
                          title="Move later"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(img)}
                          className="p-1 text-ivory-dim hover:text-gold"
                          title="Edit caption and category"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTargetId(img.id)}
                          className="p-1 text-red-400/80 hover:text-red-300"
                          title="Remove image"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
              {isSaving ? 'Saving Changes...' : 'Save Gallery Configuration'}
            </Button>
          </div>
        </div>
      </form>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        title="Remove Gallery Image?"
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
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ivory-dim leading-relaxed">
          This image will no longer appear on the public website showcase. Are you sure you want to remove it?
        </p>
      </Modal>

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="Gallery"
        isDirty={isDirty}
        isSaving={isSaving}
        saveButtonLabel="Save Gallery Configuration"
        onSave={async () => {
          await onSave(images);
          setIsPreviewOpen(false);
        }}
      >
        <ShopSettingsOverrideContext.Provider value={{ gallery: images, galleryImages: images } as any}>
          <div className="p-4 sm:p-6 bg-charcoal">
            <Gallery />
          </div>
        </ShopSettingsOverrideContext.Provider>
      </StorefrontPreviewModal>
    </div>
  );
};
