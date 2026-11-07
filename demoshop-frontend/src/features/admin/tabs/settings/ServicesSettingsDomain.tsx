import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Scissors, Search, RotateCcw, Save, Loader2, AlertCircle, CheckCircle2,
  Filter, Sparkles, Plus, Clock, Tag, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { api } from '@/config/api';
import { ServiceImageUploader } from './ServiceImageUploader';
import { StorefrontPreviewModal } from './StorefrontPreviewModal';
import { ServicesList } from '@/features/services/ServicesList';

export interface ServiceItemConfig {
  service_id: number;
  title: string;
  description: string;
  price: number;
  duration_minutes: number;
  category: string;
  sub_category?: string;
  image_url?: string | null;
}

interface ServicesSettingsDomainProps {
  onDirtyChange?: (isDirty: boolean) => void;
}

export const ServicesSettingsDomain: React.FC<ServicesSettingsDomainProps> = ({
  onDirtyChange,
}) => {
  const { addToast } = useToast();

  const [services, setServices] = useState<ServiceItemConfig[]>([]);
  const [initialServices, setInitialServices] = useState<ServiceItemConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Search and category filter
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Load services from authoritative API / Supabase
  const fetchServices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.get('/api/services');
      const data: any[] = Array.isArray(response.data) ? response.data : [];

      const normalized: ServiceItemConfig[] = data.map((item) => ({
        service_id: Number(item.service_id),
        title: item.title || '',
        description: item.description || '',
        price: Number(item.price) || 0,
        duration_minutes: Number(item.duration_minutes) > 0 ? Number(item.duration_minutes) : 30,
        category: (item.category || "MEN'S GROOMING").trim().toUpperCase(),
        sub_category: item.sub_category || '',
        image_url: item.image_url || null,
      }));

      setServices(normalized);
      setInitialServices(normalized);
    } catch (err: any) {
      console.error('[ServicesSettingsDomain] Failed to load services:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load services catalogue.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchServices();
  }, [fetchServices]);

  // Compute dirty state
  const isDirty = useMemo(() => {
    if (initialServices.length === 0 && services.length === 0) return false;
    return JSON.stringify(services) !== JSON.stringify(initialServices);
  }, [services, initialServices]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Find modified service IDs
  const modifiedServiceIds = useMemo(() => {
    const ids = new Set<number>();
    const initialMap = new Map(initialServices.map((s) => [s.service_id, s]));

    for (const current of services) {
      const initial = initialMap.get(current.service_id);
      if (!initial || JSON.stringify(current) !== JSON.stringify(initial)) {
        ids.add(current.service_id);
      }
    }
    return ids;
  }, [services, initialServices]);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    services.forEach((s) => {
      if (s.category) set.add(s.category);
    });
    return Array.from(set).sort();
  }, [services]);

  // Filtered services
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchesSearch =
        searchFilter.trim() === '' ||
        s.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        s.description.toLowerCase().includes(searchFilter.toLowerCase());

      const matchesCategory =
        categoryFilter === 'ALL' || s.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [services, searchFilter, categoryFilter]);

  // Service field updater
  const handleUpdateField = (
    serviceId: number,
    field: keyof ServiceItemConfig,
    value: any
  ) => {
    setServices((prev) =>
      prev.map((item) =>
        item.service_id === serviceId ? { ...item, [field]: value } : item
      )
    );
  };

  // Reset handler
  const handleReset = () => {
    setServices(initialServices);
    setError(null);
  };

  // Save handler
  const handleSave = async () => {
    if (!isDirty || modifiedServiceIds.size === 0) return;
    setIsSaving(true);
    setError(null);

    try {
      const modifiedList = services.filter((s) => modifiedServiceIds.has(s.service_id));

      // Persist each modified service
      await Promise.all(
        modifiedList.map(async (service) => {
          await api.put(`/api/services/${service.service_id}`, {
            title: service.title.trim(),
            description: service.description.trim() || undefined,
            price: Number(service.price),
            duration_minutes: Number(service.duration_minutes),
            image_url: service.image_url?.trim() || undefined,
            category: service.category,
            sub_category: service.sub_category || undefined,
          });
        })
      );

      setInitialServices(services);
      onDirtyChange?.(false);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('demoshop:services-updated'));
        window.dispatchEvent(new CustomEvent('demoshop:shop-settings-updated'));
      }

      addToast({
        type: 'success',
        title: 'Services Configuration Saved',
        message: `Successfully persisted updates for ${modifiedList.length} service${modifiedList.length > 1 ? 's' : ''
          }.`,
      });
    } catch (err: any) {
      console.error('[ServicesSettingsDomain] Save failed:', err);
      const msg = err?.response?.data?.message || err?.message || 'Failed to persist services updates.';
      setError(msg);
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: msg,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Description */}
      <div className="border-b border-white/10 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2.5">
            <Scissors className="w-5 h-5 text-amber-400" />
            Service Menu & Media Catalog
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Configure barber services, pricing (PHP), duration (mins), customer descriptions, and high-resolution thumbnail media.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono text-zinc-400 px-2.5 py-1 rounded bg-[#1c1c21] border border-zinc-800">
            Total Services: <strong className="text-amber-400">{services.length}</strong>
          </span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Bar (Top) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2 shrink-0">
          {isDirty ? (
            <div className="flex items-center gap-2 text-xs text-amber-400 font-medium whitespace-nowrap">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              <span>
                Unsaved modifications in <strong>{modifiedServiceIds.size}</strong> service
                {modifiedServiceIds.size > 1 ? 's' : ''}
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
                <span className="whitespace-nowrap">Save Services</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#141417] p-3 rounded-lg border border-zinc-800">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search services by title or description…"
            className="w-full bg-[#1c1c21] border border-zinc-800 text-zinc-100 rounded-md pl-9 pr-3 py-1.5 text-xs focus:border-amber-400/50 focus:outline-none placeholder:text-zinc-600 font-sans"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${categoryFilter === 'ALL'
              ? 'bg-amber-400 text-zinc-950 font-bold shadow-xs'
              : 'bg-[#1c1c21] text-zinc-400 hover:text-zinc-100 border border-zinc-800'
              }`}
          >
            All Categories ({services.length})
          </button>
          {categories.map((cat) => {
            const count = services.filter((s) => s.category === cat).length;
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

      {/* Main Grid View of Services */}
      {isLoading ? (
        <div className="p-16 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
          <p className="text-sm text-zinc-300 font-medium">Loading service menu…</p>
        </div>
      ) : filteredServices.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-zinc-800 rounded-lg bg-[#141417]/50 space-y-2">
          <Scissors className="w-8 h-8 text-zinc-600 mx-auto" />
          <h4 className="text-sm font-semibold text-zinc-300">No matching services found</h4>
          <p className="text-xs text-zinc-500">Try adjusting your category filter or search keywords.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredServices.map((service) => {
            const isModified = modifiedServiceIds.has(service.service_id);

            return (
              <div
                key={service.service_id}
                className={`bg-[#141417] border rounded-lg p-4 sm:p-5 flex flex-col gap-4 shadow-md transition-all duration-200 ${isModified
                  ? 'border-amber-400/60 ring-1 ring-amber-400/20 bg-[#16161a]'
                  : 'border-zinc-800 hover:border-zinc-700/80'
                  }`}
              >
                {/* Top Badge Bar */}
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-[#1c1c21] border border-zinc-800 text-amber-400 font-bold">
                    <Tag className="w-3 h-3 text-amber-400/70" />
                    {service.category || "MEN'S GROOMING"}
                  </span>

                  {isModified && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                      Modified
                    </span>
                  )}
                </div>

                {/* 2. Dedicated Image Upload & Management Component */}
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                    Catalog Image (16:9 Thumbnail)
                  </label>
                  <ServiceImageUploader
                    imageUrl={service.image_url}
                    serviceTitle={service.title}
                    onImageUploaded={(url) =>
                      handleUpdateField(service.service_id, 'image_url', url)
                    }
                    onImageRemoved={() =>
                      handleUpdateField(service.service_id, 'image_url', null)
                    }
                  />
                </div>

                {/* Service Form Inputs */}
                <div className="space-y-3 pt-1">
                  {/* Service Name */}
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                      Service Name
                    </label>
                    <input
                      type="text"
                      value={service.title}
                      onChange={(e) =>
                        handleUpdateField(service.service_id, 'title', e.target.value)
                      }
                      placeholder="e.g. HAIR CUT"
                      className="w-full bg-[#1c1c21] border border-zinc-800 text-zinc-100 rounded-md px-3 py-2 text-xs focus:border-amber-400/50 focus:outline-none font-semibold"
                    />
                  </div>

                  {/* Price and Duration Row */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Price in PHP */}
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                        Price (PHP)
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400 font-bold text-xs pointer-events-none">
                          ₱
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={service.price}
                          onChange={(e) =>
                            handleUpdateField(
                              service.service_id,
                              'price',
                              Number(e.target.value) || 0
                            )
                          }
                          className="w-full bg-[#1c1c21] border border-zinc-800 text-zinc-100 rounded-md pl-6 pr-2 py-2 text-xs font-mono font-bold focus:border-amber-400/50 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Duration in Minutes */}
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                        Duration
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={service.duration_minutes || 30}
                          onChange={(e) =>
                            handleUpdateField(
                              service.service_id,
                              'duration_minutes',
                              Number(e.target.value) || 30
                            )
                          }
                          className="w-full bg-[#1c1c21] border border-zinc-800 text-zinc-100 rounded-md pl-2.5 pr-9 py-2 text-xs font-mono font-semibold focus:border-amber-400/50 focus:outline-none"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 text-[10px] font-mono font-bold pointer-events-none">
                          MIN
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                      Description
                    </label>
                    <textarea
                      rows={2}
                      value={service.description}
                      onChange={(e) =>
                        handleUpdateField(service.service_id, 'description', e.target.value)
                      }
                      placeholder="Brief description of the service experience…"
                      className="w-full bg-[#1c1c21] border border-zinc-800 text-zinc-200 rounded-md p-2.5 text-xs focus:border-amber-400/50 focus:outline-none resize-none leading-relaxed"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <StorefrontPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        domainTitle="Services Menu"
        isDirty={isDirty}
        isSaving={isSaving}
        saveButtonLabel="Save Services Configuration"
        onSave={async () => {
          await handleSave();
          setIsPreviewOpen(false);
        }}
      >
        <div className="p-4 sm:p-8">
          <ServicesList overrideServices={services} />
        </div>
      </StorefrontPreviewModal>
    </div>
  );
};

export default ServicesSettingsDomain;
