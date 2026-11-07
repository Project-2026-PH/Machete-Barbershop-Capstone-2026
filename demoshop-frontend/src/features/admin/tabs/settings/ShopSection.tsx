import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ShoppingBag,
  RotateCcw,
  Eye,
  Save,
  Loader2,
  CheckCircle2,
  Search,
  ArrowUp,
  ArrowDown,
  Edit2,
  Trash2,
  Upload,
  AlertCircle,
  X,
  Package,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import type { ShopProductConfig } from '@demoshop/shared-types';
import { uploadShopMedia } from '@/services/shopSettings.service';
import { ProductImageFallback } from '@/features/shop/ProductImageFallback';
import { ShopPreview } from '@/features/shop/ShopPreview';
import { Shop } from '@/features/shop/Shop';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';

interface ShopSectionProps {
  initialProducts: ShopProductConfig[];
  onSave: (products: ShopProductConfig[]) => Promise<void>;
  isSaving: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

const CATEGORY_SUGGESTIONS = ['HAIR', 'BEARD', 'STYLING', 'SHAVE', 'GROOMING', 'BODY'];

export const DEFAULT_SHOP_RETAIL_PRODUCTS: ShopProductConfig[] = [
  {
    id: '1',
    name: 'Matte Pomade',
    category: 'HAIR',
    retailPrice: 150,
    imageUrl: '/pomade.jpg',
    description: 'High hold, low shine styling pomade for clean precision pompadours and textured finishes.',
    displayOrder: 1,
    stockStatus: 'IN STOCK',
    tags: ['MATTE', 'HIGH HOLD'],
    ctaText: 'Explore Product',
    ctaLink: '/shop',
  },
  {
    id: '2',
    name: 'Texture Powder',
    category: 'HAIR',
    retailPrice: 150,
    imageUrl: '/powder.jpg',
    description: 'Weightless volumizing powder with a natural matte finish, engineered for modern messy crops.',
    displayOrder: 2,
    stockStatus: 'IN STOCK',
    tags: ['VOLUMIZING', 'WEIGHTLESS'],
    ctaText: 'Explore Product',
    ctaLink: '/shop',
  },
  {
    id: '3',
    name: 'Beard Oil',
    category: 'BEARD',
    retailPrice: 150,
    imageUrl: '/beard-oil.jpg',
    description: 'Nourishing organic beard oil formulated with argan and cedarwood to soften facial hair and protect the skin beneath.',
    displayOrder: 3,
    stockStatus: 'IN STOCK',
    tags: ['ORGANIC', 'CEDARWOOD', 'ARGAN'],
    ctaText: 'Explore Product',
    ctaLink: '/shop',
  },
  {
    id: '4',
    name: 'Hair Gel',
    category: 'STYLING',
    retailPrice: 150,
    imageUrl: '/hair-gel.jpg',
    description: 'High hold, clean sheen styling gel engineered for slicked backs, side parts, and razor-sharp separation without flaking.',
    displayOrder: 4,
    stockStatus: 'IN STOCK',
    tags: ['HIGH HOLD', 'CLEAN FINISH', 'FLAKE-FREE'],
    ctaText: 'Explore Product',
    ctaLink: '/shop',
  },
];

export const ShopSection: React.FC<ShopSectionProps> = ({
  initialProducts,
  onSave,
  isSaving,
  onDirtyChange,
}) => {
  const effectiveInitial = useMemo(() => {
    return initialProducts.length > 0 ? initialProducts : DEFAULT_SHOP_RETAIL_PRODUCTS;
  }, [initialProducts]);

  const [products, setProducts] = useState<ShopProductConfig[]>(() =>
    [...effectiveInitial].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
  );
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewTab, setPreviewTab] = useState<'carousel' | 'catalog'>('carousel');
  const [error, setError] = useState<string | null>(null);

  // Edit Modal state (Products originate from Inventory -> Retails; no external "Add Product")
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ShopProductConfig>>({});
  const [editingTagsString, setEditingTagsString] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete / Hide Modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProducts([...effectiveInitial].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)));
  }, [effectiveInitial]);

  const isDirty = useMemo(() => {
    return JSON.stringify(products) !== JSON.stringify(effectiveInitial);
  }, [products, effectiveInitial]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Modified items count
  const modifiedCount = useMemo(() => {
    const initialMap = new Map(effectiveInitial.map((p) => [String(p.id), p]));
    let count = 0;
    for (const p of products) {
      const initial = initialMap.get(String(p.id));
      if (!initial || JSON.stringify(p) !== JSON.stringify(initial)) {
        count++;
      }
    }
    return count;
  }, [products, effectiveInitial]);

  // Extract distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category && p.category.trim() !== '') {
        set.add(p.category.trim().toUpperCase());
      }
    });
    return Array.from(set).sort();
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    return products.filter((p) => {
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q));

      const matchesCategory =
        categoryFilter === 'ALL' ||
        (p.category && p.category.trim().toUpperCase() === categoryFilter);

      return matchesSearch && matchesCategory;
    });
  }, [products, searchFilter, categoryFilter]);

  // Reorder product handler
  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= products.length) return;

    const updated = [...products];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    const reindexed = updated.map((item, i) => ({
      ...item,
      displayOrder: i + 1,
    }));
    setProducts(reindexed);
  };

  // Open Edit Modal for an inventory product
  const handleOpenEditModal = (product: ShopProductConfig) => {
    setEditingProduct({ ...product });
    setEditingTagsString(Array.isArray(product.tags) ? product.tags.join(', ') : '');
    setModalError(null);
    setIsEditModalOpen(true);
  };

  // Save Edit Modal
  const handleSaveProductModal = () => {
    if (!editingProduct.name || editingProduct.name.trim() === '') {
      setModalError('Product name is required.');
      return;
    }
    if (editingProduct.retailPrice === undefined || editingProduct.retailPrice < 0) {
      setModalError('Valid retail price (₱) is required.');
      return;
    }

    const parsedTags = editingTagsString
      .split(',')
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    const completeProduct: ShopProductConfig = {
      id: editingProduct.id || `prod-${Date.now()}`,
      name: editingProduct.name.trim(),
      category: (editingProduct.category || 'HAIR').trim().toUpperCase(),
      retailPrice: Number(editingProduct.retailPrice) || 0,
      description: (editingProduct.description || '').trim(),
      imageUrl: editingProduct.imageUrl || null,
      stockStatus: editingProduct.stockStatus || 'IN STOCK',
      tags: parsedTags,
      displayOrder: typeof editingProduct.displayOrder === 'number' ? editingProduct.displayOrder : 1,
    };

    setProducts((prev) =>
      prev.map((p) => (p.id === completeProduct.id ? completeProduct : p))
    );

    setIsEditModalOpen(false);
    setEditingProduct({});
  };

  // Handle image upload from computer
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModalError(null);

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setModalError('Please upload a valid image file (JPEG, PNG, or WebP).');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setModalError('Image size must be under 8MB.');
      return;
    }

    setIsUploadingImage(true);
    try {
      const publicUrl = await uploadShopMedia(file, 'shop');
      setEditingProduct((prev) => ({ ...prev, imageUrl: publicUrl }));
    } catch (err: any) {
      console.error('Failed to upload product media:', err);
      setModalError(err?.response?.data?.message || err?.message || 'Failed to upload product image.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Remove/Hide product confirmation
  const handleConfirmDelete = () => {
    if (deleteTargetId === null) return;
    const filtered = products.filter((p) => p.id !== deleteTargetId);
    const reindexed = filtered.map((item, i) => ({
      ...item,
      displayOrder: i + 1,
    }));
    setProducts(reindexed);
    setDeleteTargetId(null);
  };

  // Reset to initial
  const handleReset = () => {
    setProducts([...effectiveInitial].sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)));
    setError(null);
  };

  // Save to backend
  const handleSave = async () => {
    setError(null);
    try {
      await onSave(products);
    } catch (err: any) {
      console.error('Failed to save shop catalog:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to persist shop catalog.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            Collections Retail Catalog
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Retail products, pricing & showcase (synced from Inventory &gt; Retails)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-400 px-2.5 py-1 rounded bg-[#1c1c21] border border-zinc-800">
            Total Products: <strong className="text-amber-400">{products.length}</strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Action Bar (No Add Product Button — products originate from Inventory -> Retails) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2 shrink-0">
          {isDirty ? (
            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>
                Unsaved modifications in <strong>{modifiedCount}</strong> retail item{modifiedCount > 1 ? 's' : ''}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 whitespace-nowrap">


            </div>
          )}
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full lg:w-auto justify-end">

          <Button
            type="button"
            variant="outline"
            onClick={() => setIsPreviewOpen(true)}
            className="flex items-center justify-center gap-1.5 text-xs text-ivory hover:text-gold border-white/20 hover:border-gold h-[44px] min-h-[44px] py-0 px-4 w-full sm:w-auto cursor-pointer whitespace-nowrap"
          >
            <Eye className="w-4 h-4 text-gold shrink-0" /> Preview
          </Button>

          <Button
            type="button"
            variant="primary"
            disabled={!isDirty || isSaving}
            onClick={handleSave}
            className="flex items-center justify-center gap-2 px-5 h-[44px] min-h-[44px] py-0 w-full sm:w-auto text-xs sm:text-sm whitespace-nowrap shrink-0"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span className="whitespace-nowrap">Saving Changes...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">Save Collections</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Search & Category Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141417] p-3 rounded-lg border border-zinc-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search products by title or description…"
            className="w-full bg-[#1c1c21] border border-zinc-800 text-zinc-100 rounded-md pl-9 pr-3 py-1.5 text-xs focus:border-amber-400/50 focus:outline-none placeholder:text-zinc-600 font-sans"
          />
          {searchFilter && (
            <button
              type="button"
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-100 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${categoryFilter === 'ALL'
              ? 'bg-amber-400 text-zinc-950 font-bold shadow-xs'
              : 'bg-[#1c1c21] text-zinc-400 hover:text-zinc-100 border border-zinc-800'
              }`}
          >
            All Categories ({products.length})
          </button>
          {categories.map((cat) => {
            const count = products.filter((p) => p.category?.toUpperCase() === cat).length;
            const isSelected = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${isSelected
                  ? 'bg-amber-400 text-zinc-950 font-bold shadow-xs'
                  : 'bg-[#1c1c21] text-zinc-400 hover:text-zinc-100 border border-zinc-800'
                  }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* 3-Column Dark Product Cards Grid */}
      {products.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-white/10 rounded-xl bg-charcoal-light/30 space-y-4">
          <Package className="w-12 h-12 text-gold/40 mx-auto" />
          <div className="space-y-1">
            <h4 className="text-base font-serif font-bold text-ivory">No Retail Products</h4>
            <p className="text-xs text-ivory-dim max-w-sm mx-auto">
              Retail products are registered under Inventory &gt; Retails. Active retail items automatically populate here to configure custom showcase media, pricing, and descriptions.
            </p>
          </div>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-12 px-4 border border-zinc-800 rounded-lg bg-[#141417] space-y-2">
          <p className="text-sm text-zinc-400">No products match your search or filter.</p>
          <button
            type="button"
            onClick={() => {
              setSearchFilter('');
              setCategoryFilter('ALL');
            }}
            className="text-xs text-amber-400 hover:underline cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const actualIndex = products.findIndex((p) => p.id === product.id);

            return (
              <div
                key={product.id}
                className="group relative bg-[#141417] border border-white/10 hover:border-amber-400/40 rounded-xl overflow-hidden transition-all duration-300 flex flex-col justify-between shadow-lg"
              >
                {/* Visual Thumbnail Stage */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-[#1c1c20] via-[#151518] to-[#0e0e10] p-4 flex items-center justify-center border-b border-white/5">
                  {/* Subtle Studio Glow */}
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(212,175,55,0.06)_0%,_transparent_70%)] pointer-events-none" />

                  {/* Thumbnail Image or Fallback */}
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="max-h-full max-w-full object-contain drop-shadow-[0_12px_20px_rgba(0,0,0,0.7)] group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <ProductImageFallback
                      name={product.name}
                      category={product.category}
                      size="md"
                    />
                  )}

                  {/* Badges Overlay */}
                  <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-black/80 text-amber-400 border border-amber-400/30 backdrop-blur-md">
                      #{product.displayOrder || actualIndex + 1}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase bg-black/75 text-zinc-300 border border-white/10 backdrop-blur-md">
                      {product.category || 'RETAIL'}
                    </span>
                  </div>

                  {/* Stock Status Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10">
                    {product.stockStatus === 'IN STOCK' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-black/80 border border-emerald-500/40 text-emerald-300 backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        In Stock
                      </span>
                    )}
                    {product.stockStatus === 'LOW STOCK' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-black/80 border border-amber-500/40 text-amber-300 backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Low Stock
                      </span>
                    )}
                    {product.stockStatus === 'OUT OF STOCK' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium bg-black/80 border border-zinc-700 text-zinc-400 backdrop-blur-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                        Out of Stock
                      </span>
                    )}
                  </div>
                </div>

                {/* Product Info Body */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-serif font-bold text-sm text-zinc-100 group-hover:text-amber-400 transition-colors line-clamp-1">
                        {product.name}
                      </h4>
                      <span className="font-serif font-bold text-base text-amber-400 shrink-0">
                        ₱{Number(product.retailPrice || 0).toLocaleString('en-PH')}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 font-light line-clamp-2 leading-relaxed">
                      {product.description || 'No description provided.'}
                    </p>

                    {Array.isArray(product.tags) && product.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {product.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="border border-amber-400/25 bg-black/40 text-amber-400/90 text-[8px] font-mono px-1.5 py-0.5 rounded-[2px]"
                          >
                            {tag}
                          </span>
                        ))}
                        {product.tags.length > 3 && (
                          <span className="text-[8px] text-zinc-500 px-1">
                            +{product.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Controls Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                    {/* Reorder Arrows */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={actualIndex === 0}
                        onClick={() => handleMove(actualIndex, 'up')}
                        className="p-1 rounded bg-white/5 border border-white/10 hover:border-amber-400/50 text-zinc-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move Earlier in Showcase"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={actualIndex === products.length - 1}
                        onClick={() => handleMove(actualIndex, 'down')}
                        className="p-1 rounded bg-white/5 border border-white/10 hover:border-amber-400/50 text-zinc-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Move Later in Showcase"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Edit & Remove Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(product)}
                        className="p-1.5 rounded text-zinc-400 hover:text-amber-400 hover:bg-white/5 transition-colors cursor-pointer"
                        title="Configure Showcase Details"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(product.id)}
                        className="p-1.5 rounded text-red-400/80 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Hide From Showcase"
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

      {/* Edit Product Details Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Retail Showcase - ${editingProduct.name || 'Product'}`}
        size="lg"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditModalOpen(false)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveProductModal}
              disabled={isUploadingImage}
              className="text-xs px-4"
            >
              Save Showcase Details
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {modalError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{modalError}</span>
            </div>
          )}

          {/* Relation indicator with Inventory -> Retails */}
          <div className="p-2.5 rounded bg-amber-400/10 border border-amber-400/20 flex items-center gap-2 text-xs text-amber-300">
            <Layers className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Product identity is linked to <strong>Inventory &gt; Retails</strong>. Customize public showcase media, display copy, and price.</span>
          </div>

          {/* Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Product Name
              </label>
              <input
                type="text"
                disabled
                value={editingProduct.name || ''}
                className="w-full bg-[#141416] border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-300 opacity-80 cursor-not-allowed"
                title="Product title is managed under Inventory > Retails"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Category
              </label>
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={editingProduct.category || ''}
                  onChange={(e) => setEditingProduct((p) => ({ ...p, category: e.target.value }))}
                  placeholder="e.g. HAIR, BEARD, STYLING"
                  className="w-full bg-[#18181b] border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none uppercase"
                />
                <div className="flex flex-wrap gap-1">
                  {CATEGORY_SUGGESTIONS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditingProduct((p) => ({ ...p, category: cat }))}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-amber-400 hover:bg-zinc-700"
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Price & Stock Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Retail Price (₱ PHP) <span className="text-amber-400">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={editingProduct.retailPrice ?? 150}
                onChange={(e) => setEditingProduct((p) => ({ ...p, retailPrice: Number(e.target.value) }))}
                className="w-full bg-[#18181b] border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Stock Status
              </label>
              <select
                value={editingProduct.stockStatus || 'IN STOCK'}
                onChange={(e) => setEditingProduct((p) => ({ ...p, stockStatus: e.target.value as any }))}
                className="w-full bg-[#18181b] border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none cursor-pointer"
              >
                <option value="IN STOCK">IN STOCK (Available at Counter)</option>
                <option value="LOW STOCK">LOW STOCK (Limited Physical Stock)</option>
                <option value="OUT OF STOCK">OUT OF STOCK (Temporarily Unavailable)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Description / Ritual Narrative
            </label>
            <textarea
              rows={3}
              value={editingProduct.description || ''}
              onChange={(e) => setEditingProduct((p) => ({ ...p, description: e.target.value }))}
              placeholder="Grooming details, hold level, finish, and recommended application ritual…"
              className="w-full bg-[#18181b] border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Search Tags (comma-separated)
            </label>
            <input
              type="text"
              value={editingTagsString}
              onChange={(e) => setEditingTagsString(e.target.value)}
              placeholder="e.g. HIGH HOLD, LOW SHINE, MATTE"
              className="w-full bg-[#18181b] border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-100 focus:border-amber-400 focus:outline-none uppercase"
            />
          </div>

          {/* Image Upload / URL */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">
              Product Image
            </label>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              {/* Thumbnail Preview */}
              <div className="w-20 h-20 rounded border border-zinc-700 bg-zinc-900 overflow-hidden flex items-center justify-center shrink-0 relative group">
                {editingProduct.imageUrl ? (
                  <>
                    <img
                      src={editingProduct.imageUrl}
                      alt="Preview"
                      className="w-full h-full object-contain p-1"
                    />
                    <button
                      type="button"
                      onClick={() => setEditingProduct((p) => ({ ...p, imageUrl: null }))}
                      className="absolute inset-0 bg-black/75 flex items-center justify-center text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove Image"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <Package className="w-6 h-6 text-zinc-600" />
                )}
              </div>

              {/* Upload Controls */}
              <div className="flex-1 space-y-2 w-full">
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleImageFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="text-xs h-8 px-3 border-zinc-700 hover:border-amber-400 text-zinc-200"
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5 mr-1.5" /> Upload Image
                      </>
                    )}
                  </Button>
                  <span className="text-[10px] text-zinc-500">Max 8MB (JPEG, PNG, WebP)</span>
                </div>

                <input
                  type="text"
                  value={editingProduct.imageUrl || ''}
                  onChange={(e) => setEditingProduct((p) => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="Or enter image URL path (e.g. /pomade.jpg)"
                  className="w-full bg-[#18181b] border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-300 placeholder:text-zinc-600 focus:border-amber-400 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>

      {/* Hide / Remove Confirmation Modal */}
      <Modal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        title="Hide Retail Product from Showcase?"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTargetId(null)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleConfirmDelete}
              className="text-xs bg-red-600 hover:bg-red-500 text-white border-none"
            >
              Hide Product
            </Button>
          </div>
        }
      >
        <p className="text-xs text-zinc-300 leading-relaxed">
          Are you sure you want to hide this retail product from the storefront showcase? The product remains preserved in Inventory &gt; Retails and can be restored using the Reset button.
        </p>
      </Modal>

      {/* Live Preview Modal */}
      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="Shop Retail Catalog"
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        saveButtonLabel="Save Shop"
      >
        <div className="w-full">
          {/* Segmented Preview View Selector */}
          <div className="px-6 py-3 border-b border-white/10 bg-[#121215] flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
              Live Draft Preview
            </span>
            <div className="flex items-center gap-1 bg-[#1a1a1e] p-1 rounded-md border border-zinc-800">
              <button
                type="button"
                onClick={() => setPreviewTab('carousel')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${previewTab === 'carousel'
                  ? 'bg-amber-400 text-zinc-950 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
                  }`}
              >
                Storefront Carousel
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('catalog')}
                className={`px-3 py-1 text-xs font-semibold rounded transition-all cursor-pointer ${previewTab === 'catalog'
                  ? 'bg-amber-400 text-zinc-950 font-bold'
                  : 'text-zinc-400 hover:text-zinc-200'
                  }`}
              >
                Full Catalog Grid
              </button>
            </div>
          </div>

          {/* Render Shop Feature Component with Draft State */}
          <div className="overflow-hidden">
            {previewTab === 'carousel' ? (
              <ShopPreview overrideProducts={products} />
            ) : (
              <Shop overrideProducts={products} />
            )}
          </div>
        </div>
      </StorefrontPreviewModal>
    </div>
  );
};
