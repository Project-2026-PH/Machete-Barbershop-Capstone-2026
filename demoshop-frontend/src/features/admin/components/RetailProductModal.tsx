import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Upload, Trash2, Tag, Plus, X, Eye, EyeOff, Loader2, Image as ImageIcon } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { api } from '@/config/api';
import { QUANTITY_UNITS, QuantityUnit } from '@demoshop/shared-types';
import { ProductImageFallback } from '../../shop/ProductImageFallback';

export interface RetailProductFormData {
  id?: string;
  name: string;
  unit: QuantityUnit | string;
  costPrice: string;
  retailPrice: string;
  initialQuantity?: string;
  retailCategory: string;
  tags: string[];
  showInShop: boolean;
  imageUrl: string | null;
}

interface RetailProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: any | null; // Existing InventoryRow or null for new
  availableCategories: string[];
  availableTags: string[];
  onSaved: (item: any) => void;
  onCategoryAdded?: (category: string) => void;
  onTagAdded?: (tag: string) => void;
}

export const RetailProductModal: React.FC<RetailProductModalProps> = ({
  isOpen,
  onClose,
  item,
  availableCategories,
  availableTags,
  onSaved,
  onCategoryAdded,
  onTagAdded,
}) => {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState<QuantityUnit | string>('pc');
  const [costPrice, setCostPrice] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [initialQuantity, setInitialQuantity] = useState('0');
  const [retailCategory, setRetailCategory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showInShop, setShowInShop] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Inline new tag & category states
  const [newTagInput, setNewTagInput] = useState('');
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);

  // Dynamic custom quantity unit states
  const [isCustomUnitMode, setIsCustomUnitMode] = useState(false);
  const [customUnitInput, setCustomUnitInput] = useState('');
  const [customUnits, setCustomUnits] = useState<string[]>([]);

  const handleSaveCustomUnit = () => {
    const trimmed = customUnitInput.trim().toLowerCase();
    if (!trimmed) {
      setValidationError('Please enter a custom unit name.');
      return;
    }
    if (trimmed.length > 32) {
      setValidationError('Custom unit must be 32 characters or fewer.');
      return;
    }
    if (!customUnits.includes(trimmed)) {
      setCustomUnits((prev) => [...prev, trimmed]);
    }
    setUnit(trimmed);
    setIsCustomUnitMode(false);
    setCustomUnitInput('');
    setValidationError('');
  };

  const availableUnits = useMemo(() => {
    const set = new Set<string>(QUANTITY_UNITS);
    customUnits.forEach((u) => set.add(u));
    if (unit && !set.has(unit)) {
      set.add(unit);
    }
    return Array.from(set);
  }, [customUnits, unit]);

  useEffect(() => {
    if (isOpen) {
      if (item) {
        setName(item.name || '');
        setUnit(item.unit || 'pc');
        setCostPrice(item.costPrice != null ? Number(item.costPrice).toFixed(2) : '0.00');
        setRetailPrice(item.retailPrice != null ? Number(item.retailPrice).toFixed(2) : '');
        setInitialQuantity(String(item.currentStock ?? 0));
        setRetailCategory(item.retailCategory || '');
        setTags(Array.isArray(item.tags) ? item.tags : []);
        setShowInShop(Boolean(item.showInShop));
        setImageUrl(item.imageUrl || null);
      } else {
        setName('');
        setUnit('pc');
        setCostPrice('');
        setRetailPrice('');
        setInitialQuantity('0');
        setRetailCategory(availableCategories[0] || 'Hair');
        setTags([]);
        setShowInShop(true);
        setImageUrl(null);
      }
      setPendingFile(null);
      setValidationError('');
      setNewTagInput('');
      setNewCategoryInput('');
      setIsCustomUnitMode(false);
      setCustomUnitInput('');
    }
  }, [isOpen, item, availableCategories]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setValidationError('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setValidationError('Image size must be 5MB or less.');
      return;
    }

    setValidationError('');

    if (item?.id) {
      // Direct upload for existing item
      setIsUploadingImage(true);
      const formData = new FormData();
      formData.append('image', file);
      try {
        const response = await api.post(`/api/inventory/items/${item.id}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const uploadedUrl = response.data?.imageUrl;
        setImageUrl(uploadedUrl);
        addToast({
          type: 'success',
          title: 'Image uploaded',
          message: 'Product image updated in Supabase Storage.',
        });
      } catch (err: any) {
        setValidationError(err?.response?.data?.message || err?.message || 'Failed to upload image.');
      } finally {
        setIsUploadingImage(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
      // Local preview for new item before creation
      setPendingFile(file);
      const previewUrl = URL.createObjectURL(file);
      setImageUrl(previewUrl);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async () => {
    if (item?.id && imageUrl && !pendingFile) {
      setIsUploadingImage(true);
      try {
        await api.delete(`/api/inventory/items/${item.id}/image`);
        setImageUrl(null);
        addToast({
          type: 'success',
          title: 'Image removed',
          message: 'Product image removed.',
        });
      } catch (err: any) {
        setValidationError(err?.response?.data?.message || err?.message || 'Failed to remove image.');
      } finally {
        setIsUploadingImage(false);
      }
    } else {
      setPendingFile(null);
      setImageUrl(null);
    }
  };

  const handleAddTag = async () => {
    const clean = newTagInput.trim();
    if (!clean) return;
    if (tags.some((t) => t.toLowerCase() === clean.toLowerCase())) {
      setNewTagInput('');
      return;
    }

    setIsAddingTag(true);
    try {
      await api.post('/api/inventory/retail/tags', { name: clean });
      onTagAdded?.(clean);
      setTags((prev) => [...prev, clean]);
      setNewTagInput('');
    } catch {
      // Add locally anyway if exists
      setTags((prev) => [...prev, clean]);
      setNewTagInput('');
    } finally {
      setIsAddingTag(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  const handleSelectExistingTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags((prev) => [...prev, tag]);
    }
  };

  const handleAddCategory = async () => {
    const clean = newCategoryInput.trim();
    if (!clean) return;
    setIsAddingCategory(true);
    try {
      await api.post('/api/inventory/retail/categories', { name: clean });
      onCategoryAdded?.(clean);
      setRetailCategory(clean);
      setNewCategoryInput('');
    } catch {
      setRetailCategory(clean);
      setNewCategoryInput('');
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      setValidationError('Please enter a product name between 1 and 120 characters.');
      return;
    }

    const numCost = costPrice.trim() === '' ? 0 : Number(costPrice);
    if (!Number.isFinite(numCost) || numCost < 0) {
      setValidationError('Cost price must be zero or a valid positive amount.');
      return;
    }

    const numRetail = retailPrice.trim() === '' ? null : Number(retailPrice);
    if (numRetail !== null && (!Number.isFinite(numRetail) || numRetail < 0)) {
      setValidationError('Retail price must be zero or a valid positive amount.');
      return;
    }

    setIsSubmitting(true);
    setValidationError('');

    try {
      if (item?.id) {
        // Update existing retail product presentation & costs
        const payload = {
          name: trimmedName,
          unit,
          costPrice: numCost,
          retailPrice: numRetail,
          retailCategory: retailCategory.trim() || null,
          tags,
          showInShop,
          imageUrl: pendingFile ? null : imageUrl,
        };

        const targetId = (item as any)?.productId || item.id;
        const res = await api.patch(`/api/inventory/items/${targetId}/retail`, payload);
        addToast({
          type: 'success',
          title: 'Product updated',
          message: `${trimmedName} retail presentation saved.`,
        });
        onSaved(res.data);
        onClose();
      } else {
        // Create new retail product
        const initialQty = parseInt(initialQuantity || '0', 10) || 0;
        const res = await api.post('/api/inventory/items', {
          name: trimmedName,
          unit,
          initialQuantity: initialQty,
          costPrice: numCost,
          retailPrice: numRetail,
          category: 'shared_retail',
          retailCategory: retailCategory.trim() || null,
          tags,
          showInShop,
        });

        const createdItem = res.data;

        // If there was a pending image file, upload it now
        if (pendingFile && createdItem?.id) {
          try {
            const formData = new FormData();
            formData.append('image', pendingFile);
            const imgRes = await api.post(`/api/inventory/items/${createdItem.id}/image`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' },
            });
            createdItem.imageUrl = imgRes.data?.imageUrl;
          } catch {
            // Silently continue if image upload failed after item was created
          }
        }

        addToast({
          type: 'success',
          title: 'Retail product created',
          message: `${trimmedName} added to inventory and storefront.`,
        });
        onSaved(createdItem);
        onClose();
      }
    } catch (err: any) {
      setValidationError(
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        'Failed to save retail product.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const unusedTags = availableTags.filter((t) => !tags.includes(t));

  return (
    <Modal
      sidebarOffset
      isOpen={isOpen}
      onClose={onClose}
      title={item ? 'Modify Retail Product' : 'Add Retail Product'}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting || isUploadingImage}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting || isUploadingImage}>
            {isSubmitting ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </span>
            ) : item ? (
              'Save Presentation'
            ) : (
              'Create Product'
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        {validationError && (
          <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {validationError}
          </div>
        )}

        {/* ================= 1. PRODUCT IDENTIFIER ================= */}
        <div className="rounded-lg border border-white/10 bg-charcoal/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gold">1. Product Information</span>
            <span className="text-[10px] text-ivory-dim">Base Item Specs</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-ivory-dim mb-1">
                Product Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. DemoShop Matte Clay, Sandalwood Beard Oil"
                className="w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory placeholder-ivory-dim/50 focus:border-gold/60 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ivory-dim mb-1">Quantity Unit</label>
              {isCustomUnitMode ? (
                <div className="space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      id="custom-retail-unit-input"
                      type="text"
                      autoFocus
                      placeholder="e.g. sachet, can, gallon"
                      maxLength={32}
                      value={customUnitInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomUnitInput(val);
                        if (val.trim()) setUnit(val.trim().toLowerCase());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveCustomUnit();
                        } else if (e.key === 'Escape') {
                          setIsCustomUnitMode(false);
                          setCustomUnitInput('');
                        }
                      }}
                      className="w-full flex-1 rounded border border-gold/50 bg-charcoal px-3 py-2 text-sm text-ivory outline-none focus:border-gold"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCustomUnit}
                      disabled={!customUnitInput.trim()}
                      className="shrink-0 rounded border border-gold bg-gold/15 px-3 py-2 text-xs font-bold uppercase tracking-wider text-gold transition hover:bg-gold hover:text-charcoal disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomUnitMode(false);
                        setCustomUnitInput('');
                      }}
                      className="shrink-0 rounded border border-white/10 bg-charcoal-light px-2.5 py-2 text-xs text-ivory-dim hover:text-ivory cursor-pointer"
                      title="Cancel custom unit"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <select
                  value={unit || 'pc'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__add_custom__') {
                      setIsCustomUnitMode(true);
                      setCustomUnitInput('');
                    } else {
                      setIsCustomUnitMode(false);
                      setUnit(val);
                    }
                  }}
                  className="w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory focus:border-gold/60 focus:outline-none"
                >
                  <optgroup label="Available Units">
                    {availableUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Custom">
                    <option value="__add_custom__">+ Add New Unit…</option>
                  </optgroup>
                </select>
              )}
            </div>
          </div>
        </div>

        {/* ================= 2. PUBLIC RETAIL SHOWCASE ================= */}
        <div className="rounded-lg border border-violet-400/25 bg-violet-400/5 p-3.5 space-y-4">
          <div className="flex items-center justify-between border-b border-violet-400/20 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">
              2. Public Retail Presentation
            </span>
            <span className="text-[10px] text-violet-200/70">Customer Showcase on /shop</span>
          </div>

          {/* Product Image Section */}
          <div>
            <label className="block text-[11px] font-semibold text-ivory-dim mb-1.5">
              Product Image (Optional)
            </label>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-24 h-24 shrink-0 rounded-lg overflow-hidden border border-white/15 bg-charcoal relative">
                {imageUrl ? (
                  <img src={imageUrl} alt={name || 'Product'} width={96} height={96} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                ) : (
                  <ProductImageFallback name={name || 'DemoShop'} category={retailCategory} size="sm" />
                )}
                {isUploadingImage && (
                  <div className="absolute inset-0 bg-charcoal/80 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-gold" />
                  </div>
                )}
              </div>

              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => void handleFileChange(e)}
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="text-xs py-1.5 px-3 border-gold/40 text-gold hover:bg-gold/10"
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {imageUrl ? 'Replace Image' : 'Upload Image'}
                  </Button>
                  {imageUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleRemoveImage()}
                      disabled={isUploadingImage}
                      className="text-xs py-1.5 px-3 border-red-500/30 text-red-300 hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-ivory-dim leading-relaxed">
                  Real Supabase Storage reference. If omitted, DemoShop's custom editorial fallback will display
                  seamlessly.
                </p>
              </div>
            </div>
          </div>

          {/* Retail Price & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] font-semibold text-ivory-dim mb-1">
                Retail Price (₱) <span className="text-gold">• View-only on /shop</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gold font-bold">₱</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={retailPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d+(\.\d{0,2})?$/.test(val) || /^\.\d{0,2}$/.test(val)) {
                      setRetailPrice(val);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full rounded border border-white/10 bg-charcoal pl-8 pr-3 py-2 text-sm text-ivory font-bold placeholder-ivory-dim/40 focus:border-gold/60 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-ivory-dim mb-1">Category</label>
              <div className="space-y-1.5">
                <select
                  value={retailCategory}
                  onChange={(e) => setRetailCategory(e.target.value)}
                  className="w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory focus:border-gold/60 focus:outline-none"
                >
                  <option value="">Select category…</option>
                  {availableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newCategoryInput}
                    onChange={(e) => setNewCategoryInput(e.target.value)}
                    placeholder="+ New category…"
                    className="flex-1 rounded border border-white/10 bg-charcoal px-2.5 py-1 text-xs text-ivory focus:border-gold/60 focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void handleAddCategory();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleAddCategory()}
                    disabled={isAddingCategory || !newCategoryInput.trim()}
                    className="text-xs py-1 px-2.5"
                  >
                    Add
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Reusable Tags */}
          <div className="pt-1">
            <label className="block text-[11px] font-semibold text-ivory-dim mb-1.5">
              Showcase Tags <span className="text-[10px] text-ivory-dim/70">(e.g. Barber Pick, New, Best Seller)</span>
            </label>

            {/* Currently assigned tags */}
            <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 rounded border border-white/10 bg-charcoal/80 mb-2">
              {tags.length === 0 ? (
                <span className="text-xs text-ivory-dim/50 italic py-0.5">No tags assigned. Click below or create one.</span>
              ) : (
                tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-0.5 text-xs font-semibold text-gold"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-red-300 ml-0.5 text-gold/80"
                      aria-label={`Remove tag ${t}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))
              )}
            </div>

            {/* Reusable tags click-to-add */}
            {unusedTags.length > 0 && (
              <div className="mb-2">
                <span className="text-[10px] uppercase tracking-wider text-ivory-dim block mb-1">
                  Click to add existing tag:
                </span>
                <div className="flex flex-wrap gap-1">
                  {unusedTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleSelectExistingTag(tag)}
                      className="rounded border border-white/10 bg-white/5 hover:bg-white/10 px-2 py-0.5 text-[11px] text-ivory-dim hover:text-ivory transition-colors cursor-pointer"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Create new tag inline */}
            <div className="flex gap-1.5 max-w-sm">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                placeholder="Create new reusable tag…"
                className="flex-1 rounded border border-white/10 bg-charcoal px-2.5 py-1 text-xs text-ivory focus:border-gold/60 focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddTag();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAddTag()}
                disabled={isAddingTag || !newTagInput.trim()}
                className="text-xs py-1 px-3 border-gold/30 text-gold"
              >
                + Add Tag
              </Button>
            </div>
          </div>

          {/* Show in Shop Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-charcoal pt-2">
            <div>
              <span className="text-xs font-bold text-ivory block">Show in Public Shop</span>
              <span className="text-[11px] text-ivory-dim">
                Controls whether guests can view this item in the /shop catalog.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowInShop((prev) => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                showInShop
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {showInShop ? (
                <>
                  <Eye className="h-3.5 w-3.5" /> Visible in Shop
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Hidden from Shop
                </>
              )}
            </button>
          </div>
        </div>

        {/* ================= 3. INTERNAL INVENTORY ================= */}
        <div className="rounded-lg border border-white/10 bg-charcoal/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gold">3. Internal Inventory</span>
            <span className="text-[10px] text-ivory-dim">Authoritative Backend Stock</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-ivory-dim mb-1">Unit Cost (₱)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ivory-dim">₱</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={costPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d+(\.\d{0,2})?$/.test(val) || /^\.\d{0,2}$/.test(val)) {
                      setCostPrice(val);
                    }
                  }}
                  placeholder="0.00"
                  className="w-full rounded border border-white/10 bg-charcoal pl-8 pr-3 py-2 text-sm text-ivory placeholder-ivory-dim/40 focus:border-gold/60 focus:outline-none"
                />
              </div>
            </div>

            {!item ? (
              <div>
                <label className="block text-[11px] font-semibold text-ivory-dim mb-1">Initial Stock</label>
                <input
                  type="number"
                  min="0"
                  value={initialQuantity}
                  onChange={(e) => setInitialQuantity(e.target.value)}
                  className="w-full rounded border border-white/10 bg-charcoal px-3 py-2 text-sm text-ivory focus:border-gold/60 focus:outline-none"
                />
              </div>
            ) : (
              <div className="flex flex-col justify-center">
                <span className="text-[11px] text-ivory-dim">Authoritative Stock</span>
                <span className="text-base font-bold text-ivory mt-0.5">
                  {item.currentStock} {item.unit}
                </span>
                <span className="text-[10px] text-ivory-dim/60">
                  Stock updates through restock receipts & physical counts only.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
