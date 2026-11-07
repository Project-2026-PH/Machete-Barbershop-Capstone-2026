import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
    Plus, Edit, Trash2, CheckCircle, XCircle, X, ChevronDown, Upload, ImageIcon, Loader2, Scissors, Clock
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Portal from '@/components/common/Portal';
import { api } from '@/config/api';
import { uploadShopMedia } from '@/services/shopSettings.service';
import { ManagementSubHeaderNav } from '@/features/admin/components/Management/ManagementSubHeaderNav';
import { useSearchHighlight } from '@/features/admin/hooks/useSearchHighlight';

interface APIService {
    service_id: number;
    title: string;
    description: string | null;
    price: number;
    category: string;
    sub_category?: string | null;
    duration_minutes?: number | null;
    duration?: string | null;
    image_url?: string | null;
}

const formatServiceDuration = (service: Pick<APIService, 'duration_minutes' | 'duration'>): string => {
    const minutes = Number(service.duration_minutes);
    if (Number.isFinite(minutes) && minutes > 0) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const parts: string[] = [];
        if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
        if (mins > 0) parts.push(`${mins} mins`);
        return parts.join(' ');
    }
    return typeof service.duration === 'string' ? service.duration.trim() : '';
};

const durationPartsFromService = (service: APIService): { durationHour: string; durationMin: string } => {
    const minutes = Number(service.duration_minutes);
    if (Number.isFinite(minutes) && minutes > 0) {
        return {
            durationHour: String(Math.floor(minutes / 60)),
            durationMin: String(minutes % 60),
        };
    }
    let durationHour = '0';
    let durationMin = '0';
    if (service.duration) {
        const hMatch = service.duration.match(/(\d+)\s*hour/);
        const mMatch = service.duration.match(/(\d+)\s*min/);
        if (hMatch) durationHour = hMatch[1];
        if (mMatch) durationMin = mMatch[1];
    }
    return { durationHour, durationMin };
};

interface NewServiceState {
    title: string;
    description: string;
    price: string;
    category: string;
    sub_category: string;
    durationHour: string;
    durationMin: string;
    image_url: string;
}

const SUBCATEGORY_SUGGESTIONS: Record<string, string[]> = {
    "MEN'S GROOMING": ['Haircut', 'Shave & Beard', 'Facial & Spa'],
    "TREATMENT SERVICES": ['Haircut', 'Hair Art', 'Head Shave', 'Hair Perm', 'Hair Color', 'Hair Treatment'],
    "SPECIAL PROMOS": ['Packages'],
};

const DEFAULT_SERVICE_STATE: NewServiceState = {
    title: '',
    description: '',
    price: '',
    category: "MEN'S GROOMING",
    sub_category: 'Haircut',
    durationHour: '',
    durationMin: '',
    image_url: '',
};

const STANDARD_CATEGORIES = ["MEN'S GROOMING", "TREATMENT SERVICES", "SPECIAL PROMOS"] as const;

export const normalizeCategory = (cat?: string | null): string => {
    const trimmed = (cat || '').trim();
    if (!trimmed) return "MEN'S GROOMING";
    const upper = trimmed.toUpperCase();
    for (const std of STANDARD_CATEGORIES) {
        if (std.toUpperCase() === upper) return std;
    }
    return trimmed;
};

export const isSubcategoryMeaningful = (
    title: string,
    subCategory?: string | null,
    category?: string | null
): boolean => {
    if (!subCategory || !subCategory.trim()) return false;
    const clean = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanTitle = clean(title);
    const cleanSub = clean(subCategory);
    if (!cleanSub || cleanSub.length < 2) return false;
    // Hide if subcategory matches title exactly (e.g., "Hair Cut" vs "Haircut", "Head Shave" vs "Head Shave")
    if (cleanTitle === cleanSub) return false;
    // Hide if subcategory matches category
    if (category && clean(category) === cleanSub) return false;
    return true;
};

export const ServiceThumbnail: React.FC<{
    imageUrl?: string | null;
    title: string;
    size?: 'sm' | 'md';
}> = ({ imageUrl, title, size = 'md' }) => {
    const [imageError, setImageError] = useState(false);
    const hasImage = Boolean(imageUrl && imageUrl.trim()) && !imageError;
    const sizeClasses = size === 'sm' ? 'w-10 h-10' : 'w-12 h-12';
    const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';

    return (
        <div
            className={`${sizeClasses} rounded-sm border border-gold/30 bg-charcoal shrink-0 overflow-hidden flex items-center justify-center relative shadow-sm`}
        >
            {hasImage ? (
                <img
                    src={imageUrl!}
                    alt={title}
                    width={size === 'sm' ? 40 : 48}
                    height={size === 'sm' ? 40 : 48}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover rounded-sm transition-transform duration-200 group-hover:scale-105"
                    onError={() => setImageError(true)}
                />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gold/15 via-charcoal to-charcoal-light border border-gold/20">
                    <Scissors className={`${iconSize} text-gold drop-shadow-sm`} />
                </div>
            )}
        </div>
    );
};


interface NotificationState {
    message: string;
    type: 'success' | 'error';
    show: boolean;
}

interface ServicesTabProps {
    onNavigateSubTab?: (subTab: string) => void;
}

export const ServicesTab: React.FC<ServicesTabProps> = ({ onNavigateSubTab }) => {
    const [searchParams] = useSearchParams();
    const urlSearch = searchParams.get('search') || searchParams.get('q') || '';
    const highlightId = searchParams.get('highlightId');

    const [services, setServices] = useState<APIService[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [expandedServiceId, setExpandedServiceId] = useState<number | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    // Reset category filter to ALL when arriving via global search
    useEffect(() => {
        if (urlSearch || highlightId) {
            setSelectedCategory('ALL');
        }
    }, [urlSearch, highlightId]);
    const [isAddingService, setIsAddingService] = useState<boolean>(false);
    const [editingService, setEditingService] = useState<APIService | null>(null);
    const [deletingService, setDeletingService] = useState<APIService | null>(null);
    const [notification, setNotification] = useState<NotificationState>({ message: '', type: 'success', show: false });
    const [newService, setNewService] = useState<NewServiceState>(DEFAULT_SERVICE_STATE);
    const [isUploadingImage, setIsUploadingImage] = useState<boolean>(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

    const fetchControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (isAddingService || deletingService) {
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = 'unset';
            };
        }
    }, [isAddingService, deletingService]);

    const fetchServices = useCallback(async () => {
        fetchControllerRef.current?.abort();
        const controller = new AbortController();
        fetchControllerRef.current = controller;
        try {
            const response = await api.get('/api/services', { signal: controller.signal });
            if (controller.signal.aborted) return;
            const data = (Array.isArray(response.data) ? response.data : []).map((service: any) => ({
                ...service,
                duration_minutes: Number(service.duration_minutes) > 0 ? Number(service.duration_minutes) : null,
                image_url: service.image_url || null,
            }));

            setServices(data);
        } catch (err: any) {
            if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return;
            console.error("Tab fetch failed:", err);
        } finally {
            if (fetchControllerRef.current === controller) {
                fetchControllerRef.current = null;
                if (!controller.signal.aborted) setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void fetchServices();
        return () => fetchControllerRef.current?.abort();
    }, [fetchServices]);

    useEffect(() => {
        if (notification.show) {
            const timer = setTimeout(() => {
                setNotification(prev => ({ ...prev, show: false }));
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [notification.show]);

    const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setUploadError('Please select a valid image file (PNG, JPG, WEBP).');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setUploadError('Image size exceeds 5MB limit.');
            return;
        }

        setIsUploadingImage(true);
        setUploadError(null);

        try {
            const uploadedUrl = await uploadShopMedia(file, 'services');
            setNewService(prev => ({ ...prev, image_url: uploadedUrl }));
        } catch (err: any) {
            console.error('Image upload failed:', err);
            setUploadError(err?.response?.data?.message || 'Failed to upload image. Please try again.');
        } finally {
            setIsUploadingImage(false);
            // Reset input value so re-selecting same file triggers onChange
            e.target.value = '';
        }
    };

    const handleAddService = async (e: React.FormEvent) => {
        e.preventDefault();
        const h = parseInt(newService.durationHour, 10) || 0;
        const m = parseInt(newService.durationMin, 10) || 0;
        const durationMinutes = h * 60 + m;

        const url = editingService ? `/api/services/${editingService.service_id}` : '/api/services';
        const payload = {
            title: newService.title.trim(),
            description: newService.description.trim() || undefined,
            price: parseFloat(newService.price),
            category: newService.category.trim(),
            sub_category: newService.sub_category.trim() || undefined,
            duration_minutes: durationMinutes > 0 ? durationMinutes : undefined,
            image_url: newService.image_url.trim() || null,
        };

        setIsSubmitting(true);
        try {
            const response = editingService 
                ? await api.put(url, payload) 
                : await api.post(url, payload);

            if (response.status === 200 || response.status === 201) {
                setIsAddingService(false);
                setEditingService(null);
                setNewService(DEFAULT_SERVICE_STATE);
                setUploadError(null);
                await fetchServices();
                setNotification({ message: editingService ? 'Service updated!' : 'Service added!', type: 'success', show: true });
            }
        } catch (err: any) {
            setNotification({ message: err?.response?.data?.message || 'Error saving service', type: 'error', show: true });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditService = (service: APIService) => {
        setEditingService(service);
        const { durationHour, durationMin } = durationPartsFromService(service);
        setNewService({
            title: service.title,
            description: service.description || '',
            price: String(service.price),
            category: service.category,
            sub_category: service.sub_category || '',
            durationHour,
            durationMin,
            image_url: service.image_url || '',
        });
        setUploadError(null);
        setIsAddingService(true);
    };

    const handleDeleteService = async () => {
        if (!deletingService) return;
        try {
            const response = await api.delete(`/api/services/${deletingService.service_id}`);
            if (response.status === 200) {
                setDeletingService(null);
                await fetchServices();
                setNotification({ message: 'Service removed successfully!', type: 'success', show: true });
            }
        } catch (err) {
            setNotification({ message: 'Failed to delete service', type: 'error', show: true });
        }
    };

    // Category options for filter tabs — deduplicated case-insensitively
    const categoryOptions = useMemo(() => {
        // Map normalized uppercase key -> canonical label
        const categoryMap = new Map<string, string>();

        // Always include standard categories in canonical order
        STANDARD_CATEGORIES.forEach(c => {
            categoryMap.set(c.toUpperCase(), c);
        });

        // Add any custom categories from services
        services.forEach(s => {
            if (s.category && s.category.trim()) {
                const norm = normalizeCategory(s.category);
                const key = norm.toUpperCase();
                if (!categoryMap.has(key)) {
                    categoryMap.set(key, norm);
                }
            }
        });

        return ['ALL', ...Array.from(categoryMap.values())];
    }, [services]);

    // Unified filtered services list
    const filteredServices = useMemo(() => {
        const q = urlSearch.trim().toLowerCase();
        return services.filter((s) => {
            const serviceCat = normalizeCategory(s.category);
            const matchesCategory = selectedCategory === 'ALL' || serviceCat.toUpperCase() === selectedCategory.toUpperCase();
            const matchesSearch = !q
                || s.title.toLowerCase().includes(q)
                || (s.description && s.description.toLowerCase().includes(q))
                || (s.category && s.category.toLowerCase().includes(q))
                || (s.sub_category && s.sub_category.toLowerCase().includes(q));
            return matchesCategory && matchesSearch;
        });
    }, [services, selectedCategory, urlSearch]);

    // Activate glow highlight and smooth scroll-into-view
    useSearchHighlight(!loading && filteredServices.length > 0);

    const handleOpenAddModal = () => {
        setEditingService(null);
        setNewService(DEFAULT_SERVICE_STATE);
        setUploadError(null);
        setIsAddingService(true);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-20">
                <span className="text-ivory-dim text-sm italic">Loading services...</span>
            </div>
        );
    }

    return (
        <div className="relative h-full min-h-0 flex flex-col gap-3 overflow-hidden">
            {/* Notification UI */}
            {notification.show && (
                <Portal>
                    <div className={`fixed top-24 right-8 z-[110] flex items-center gap-3 px-6 py-4 rounded-sm border shadow-2xl animate-fade-in ${notification.type === 'success' ? 'bg-charcoal-light border-gold text-gold' : 'bg-charcoal-light border-red-500 text-red-500'
                        }`}>
                        {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                        <span className="font-serif font-bold tracking-wide uppercase text-xs">{notification.message}</span>
                        <button onClick={() => setNotification({ ...notification, show: false })} className="ml-4 opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
                    </div>
                </Portal>
            )}

            {/* Top Bar: Title & Primary Controls */}
            <div className="shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • Services Menu</p>
                    <h3 className="mt-1 text-2xl font-serif font-bold text-ivory">Service Menu Management</h3>
                    <p className="text-ivory-dim text-xs mt-1">
                        Maintain and update your list of services with live storefront photos.
                    </p>
                </div>
                {/* Desktop Add Service Button (>= sm) */}
                <div className="hidden sm:flex items-center gap-3">
                    <Button
                        variant="primary"
                        onClick={handleOpenAddModal}
                        className="min-h-[44px] flex items-center justify-center gap-2 bg-gold text-charcoal font-bold cursor-pointer px-4"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add Service</span>
                    </Button>
                </div>
            </div>

            {/* Sub-Header Segmented Bar (Directly underneath page description) */}
            <div className="shrink-0 lg:hidden">
                <ManagementSubHeaderNav
                    activeSub="services"
                    onSelect={onNavigateSubTab}
                />
            </div>

            {/* Mobile Add Service Button (< sm): Positioned below sub-nav tabs and directly above category selector */}
            <div className="sm:hidden shrink-0">
                <Button
                    variant="primary"
                    onClick={handleOpenAddModal}
                    className="w-full min-h-[44px] flex items-center justify-center gap-2 bg-gold text-charcoal font-bold cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    <span>Add Service</span>
                </Button>
            </div>

            {/* Category Filters: Mobile Dropdown (< sm) & Desktop Pills (>= sm) */}
            <div className="shrink-0">
                {/* Mobile Dropdown (< sm) */}
                <div className="sm:hidden relative w-full">
                    <label htmlFor="service-category-filter" className="sr-only">Filter by Service Category</label>
                    <div className="relative">
                        <select
                            id="service-category-filter"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="min-h-[44px] w-full appearance-none rounded-sm border border-white/15 bg-charcoal px-3.5 py-2.5 pr-10 text-xs font-bold uppercase tracking-wider text-ivory focus:border-gold focus:outline-none cursor-pointer shadow-md"
                        >
                            {categoryOptions.map((cat) => {
                                const count = cat === 'ALL'
                                    ? services.length
                                    : services.filter(s => normalizeCategory(s.category).toUpperCase() === cat.toUpperCase()).length;
                                return (
                                    <option key={cat} value={cat} className="bg-charcoal text-ivory font-semibold">
                                        {cat} ({count})
                                    </option>
                                );
                            })}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gold">
                            <ChevronDown className="w-4 h-4" />
                        </div>
                    </div>
                </div>

                {/* Tablet / Desktop Pill Bar (>= sm) */}
                <div className="hidden sm:flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {categoryOptions.map((cat) => {
                        const isActive = selectedCategory === cat;
                        const count = cat === 'ALL'
                            ? services.length
                            : services.filter(s => normalizeCategory(s.category).toUpperCase() === cat.toUpperCase()).length;

                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setSelectedCategory(cat)}
                                className={`min-h-[40px] px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-200 cursor-pointer flex items-center gap-2 border ${
                                    isActive
                                        ? 'bg-gold text-charcoal border-gold shadow-[0_0_12px_rgba(212,175,55,0.25)]'
                                        : 'bg-white/5 border-white/10 text-ivory-dim hover:text-ivory hover:border-white/20'
                                }`}
                            >
                                <span>{cat}</span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                                    isActive ? 'bg-charcoal/20 text-charcoal' : 'bg-white/10 text-ivory-dim'
                                }`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Unified Screen-Fitted Services Container */}
            <div className="flex-1 min-h-0 bg-charcoal-light border border-white/5 rounded-sm overflow-hidden flex flex-col">
                {/* Desktop Unified Table */}
                <div className="hidden md:block flex-1 min-h-0 overflow-y-auto admin-table-scroll">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead className="sticky top-0 bg-charcoal/95 backdrop-blur-md text-ivory-dim uppercase tracking-widest text-[10px] font-bold border-b border-white/10 z-10">
                            <tr>
                                <th className="px-6 py-3.5">Service Details</th>
                                <th className="px-6 py-3.5">Category</th>
                                <th className="px-6 py-3.5">Description</th>
                                <th className="px-6 py-3.5">Duration</th>
                                <th className="px-6 py-3.5">Price</th>
                                <th className="px-6 py-3.5 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredServices.map((s) => (
                                <tr
                                    key={s.service_id}
                                    data-search-id={`service-${s.service_id} ${s.service_id}`}
                                    className="hover:bg-white/[0.03] transition-colors group"
                                >
                                    {/* Service Details (Photo + Title + Subcategory) */}
                                    <td className="px-6 py-3.5 font-bold text-ivory">
                                        <div className="flex items-center gap-3">
                                            <ServiceThumbnail imageUrl={s.image_url} title={s.title} size="md" />
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-ivory font-serif text-sm group-hover:text-gold transition-colors">{s.title}</span>
                                                    {isSubcategoryMeaningful(s.title, s.sub_category, s.category) && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-gold/10 text-gold border border-gold/20">
                                                            {s.sub_category}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </td>

                                    {/* Category Badge */}
                                    <td className="px-6 py-3.5 whitespace-nowrap">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-white/5 text-ivory-dim border border-white/10">
                                            {normalizeCategory(s.category)}
                                        </span>
                                    </td>

                                    {/* Description */}
                                    <td className="px-6 py-3.5 text-ivory-dim text-xs max-w-[240px] truncate leading-relaxed">
                                        {s.description || <span className="italic text-ivory-dim/40">No description provided</span>}
                                    </td>

                                    {/* Duration */}
                                    <td className="px-6 py-3.5 text-ivory font-mono text-xs whitespace-nowrap">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="w-3.5 h-3.5 text-gold/70 shrink-0" />
                                            <span>{formatServiceDuration(s) || 'Standard'}</span>
                                        </div>
                                    </td>

                                    {/* Price */}
                                    <td className="px-6 py-3.5 text-gold font-bold font-serif text-base whitespace-nowrap">
                                        ₱{Number(s.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>

                                    {/* Actions */}
                                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                                        <div className="flex justify-end gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => handleEditService(s)}
                                                className="min-h-[44px] min-w-[44px] p-2 text-ivory-dim hover:text-gold hover:bg-gold/10 rounded-sm transition-colors cursor-pointer flex items-center justify-center"
                                                title="Edit service"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeletingService(s)}
                                                className="min-h-[44px] min-w-[44px] p-2 text-ivory-dim hover:text-red-400 hover:bg-red-500/10 rounded-sm transition-colors cursor-pointer flex items-center justify-center"
                                                title="Delete service"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Unified Cards View */}
                <div className="block md:hidden flex-1 min-h-0 overflow-y-auto divide-y divide-white/5 bg-white/[0.01] pb-28 sm:pb-32 touch-pan-y custom-scrollbar">
                    {filteredServices.map((s) => {
                        const isExpanded = expandedServiceId === s.service_id;

                        return (
                            <div
                                key={s.service_id}
                                data-search-id={`service-${s.service_id} ${s.service_id}`}
                                className={`p-3 transition-colors ${
                                    isExpanded ? 'bg-white/[0.03]' : 'hover:bg-white/[0.01]'
                                }`}
                            >
                                {/* Primary Compact Row: Thumbnail, Title, Price, and Dropdown Details button */}
                                <div className="flex items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        {/* Thumbnail with High Contrast Fallback */}
                                        <ServiceThumbnail imageUrl={s.image_url} title={s.title} size="md" />

                                        {/* Title & Price */}
                                        <div className="min-w-0 flex-1">
                                            <h4 className="font-bold text-ivory text-sm truncate font-serif">{s.title}</h4>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className="text-gold font-bold font-serif text-sm">
                                                    ₱{Number(s.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                                {isSubcategoryMeaningful(s.title, s.sub_category, s.category) && (
                                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] uppercase font-bold tracking-wider bg-gold/10 text-gold border border-gold/20 truncate">
                                                        {s.sub_category}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Dropdown Button to View / Hide Details */}
                                    <button
                                        type="button"
                                        onClick={() => setExpandedServiceId(isExpanded ? null : s.service_id)}
                                        aria-expanded={isExpanded}
                                        className={`min-h-[34px] px-2.5 py-1 text-xs rounded-sm border transition-all flex items-center gap-1.5 shrink-0 cursor-pointer font-medium ${
                                            isExpanded
                                                ? 'bg-gold/15 text-gold border-gold/40'
                                                : 'bg-white/5 text-ivory-dim hover:text-ivory border-white/10 hover:border-white/20'
                                        }`}
                                    >
                                        <span>{isExpanded ? 'Hide Details' : 'View Details'}</span>
                                        <ChevronDown
                                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                                isExpanded ? 'rotate-180 text-gold' : 'text-ivory-dim'
                                            }`}
                                        />
                                    </button>
                                </div>

                                {/* Collapsible Details: Revealed upon clicking View Details */}
                                {isExpanded && (
                                    <div className="mt-3 pt-3 border-t border-white/5 space-y-3 animate-in fade-in duration-150">
                                        {/* Category & Duration Grid */}
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="bg-charcoal p-2.5 rounded-sm border border-white/5">
                                                <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">
                                                    Category
                                                </span>
                                                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-white/5 text-ivory-dim border border-white/10">
                                                        {normalizeCategory(s.category)}
                                                    </span>
                                                    {isSubcategoryMeaningful(s.title, s.sub_category, s.category) && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-gold/10 text-gold border border-gold/20">
                                                            {s.sub_category}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="bg-charcoal p-2.5 rounded-sm border border-white/5">
                                                <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">
                                                    Duration
                                                </span>
                                                <div className="mt-1 flex items-center gap-1 text-ivory font-mono text-xs">
                                                    <Clock className="w-3.5 h-3.5 text-gold/70 shrink-0" />
                                                    <span className="truncate">{formatServiceDuration(s) || 'Not specified'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div className="bg-charcoal p-2.5 rounded-sm border border-white/5">
                                            <span className="text-[9px] uppercase font-bold tracking-wider text-ivory-dim block">
                                                Description
                                            </span>
                                            <p className="mt-1 text-ivory-dim text-xs italic leading-relaxed">
                                                {s.description || 'No description provided'}
                                            </p>
                                        </div>

                                        {/* Actions with >=44px Touch Targets */}
                                        <div className="flex items-center justify-end gap-2 pt-1 border-t border-white/5">
                                            <button
                                                type="button"
                                                onClick={() => handleEditService(s)}
                                                className="min-h-[44px] px-3.5 py-2 bg-white/5 hover:bg-gold/10 text-gold border border-white/10 rounded-sm flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-colors"
                                            >
                                                <Edit className="w-3.5 h-3.5" />
                                                <span>Edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeletingService(s)}
                                                className="min-h-[44px] px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-sm flex items-center gap-1.5 text-xs font-bold cursor-pointer transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                <span>Delete</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Empty State */}
                {filteredServices.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                        <Scissors className="w-12 h-12 text-white/10 mb-3" />
                        <h4 className="text-base font-serif font-bold text-ivory mb-1">No services found</h4>
                        <p className="text-ivory-dim text-xs max-w-sm mb-4">
                            No services available in {selectedCategory}.
                        </p>
                        <Button
                            variant="primary"
                            onClick={() => {
                                setEditingService(null);
                                setNewService(DEFAULT_SERVICE_STATE);
                                setUploadError(null);
                                setIsAddingService(true);
                            }}
                            className="min-h-[44px] bg-gold text-charcoal font-bold flex items-center gap-1.5"
                        >
                            <Plus className="w-4 h-4" />
                            <span>Add New Service</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Modal: Add / Edit Service */}
            {isAddingService && (
                <Portal>
                    <div className="fixed inset-0 bg-charcoal/90 z-[101] flex items-center justify-center p-4 transform-gpu will-change-transform animate-fade-in">
                        <div className="bg-charcoal-light border border-gold/30 p-6 sm:p-8 rounded-sm w-full max-w-lg shadow-2xl animate-fade-in max-h-[90vh] overflow-y-auto custom-scrollbar transform-gpu will-change-transform">
                            <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-6">
                                <h3 className="text-xl font-serif font-bold text-gold uppercase tracking-tight">
                                    {editingService ? 'Edit Service' : 'Add New Service'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!isSubmitting) {
                                            setIsAddingService(false);
                                            setEditingService(null);
                                        }
                                    }}
                                    className="min-h-[44px] min-w-[44px] text-ivory-dim hover:text-ivory flex items-center justify-center cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleAddService} className="space-y-4">
                                {/* Service Photo Upload Field */}
                                <div>
                                    <label className="block text-[10px] uppercase text-gold mb-1.5 font-bold tracking-widest">
                                        Service Photo (Landing Page Display)
                                    </label>
                                    <div className="flex items-start gap-4 p-3 bg-charcoal border border-white/10 rounded-sm">
                                        <div className="w-20 h-20 rounded-sm border border-white/15 bg-charcoal-light flex items-center justify-center overflow-hidden shrink-0 relative group">
                                            {newService.image_url ? (
                                                <>
                                                    <img
                                                        src={newService.image_url}
                                                        alt="Service preview"
                                                        width={80}
                                                        height={80}
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setNewService(prev => ({ ...prev, image_url: '' }))}
                                                        className="absolute inset-0 bg-charcoal/80 text-red-400 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-opacity text-[10px] font-bold cursor-pointer"
                                                        title="Remove photo"
                                                    >
                                                        <Trash2 className="w-4 h-4 mb-0.5" />
                                                        <span>Remove</span>
                                                    </button>
                                                </>
                                            ) : (
                                                <div className="text-center p-2 text-ivory-dim/40 flex flex-col items-center">
                                                    <ImageIcon className="w-6 h-6 mb-1 text-gold/40" />
                                                    <span className="text-[9px]">No Photo</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-1 space-y-2">
                                            <label className="min-h-[44px] inline-flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/15 rounded-sm hover:border-gold/50 text-ivory text-xs cursor-pointer transition-colors">
                                                {isUploadingImage ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin text-gold" />
                                                        <span>Uploading photo...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-4 h-4 text-gold" />
                                                        <span>{newService.image_url ? 'Replace Photo' : 'Upload Photo'}</span>
                                                    </>
                                                )}
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={handleImageFileChange}
                                                    disabled={isUploadingImage}
                                                />
                                            </label>
                                            <p className="text-[10px] text-ivory-dim">
                                                PNG, JPG, or WEBP up to 5MB. Automatically shown on the public landing page menu.
                                            </p>
                                            {uploadError && (
                                                <p className="text-[11px] text-red-400 font-bold">{uploadError}</p>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Category & Price */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] uppercase text-gold mb-1 font-bold tracking-widest">Category</label>
                                        <select
                                            value={newService.category}
                                            onChange={(e) => {
                                                const cat = e.target.value;
                                                const defaultSub = SUBCATEGORY_SUGGESTIONS[cat]?.[0] || '';
                                                setNewService({ ...newService, category: cat, sub_category: defaultSub });
                                            }}
                                            className="min-h-[44px] w-full bg-charcoal border border-white/10 px-3 py-2 text-ivory text-sm focus:border-gold outline-none rounded-sm"
                                        >
                                            <option value="MEN'S GROOMING">MEN'S GROOMING</option>
                                            <option value="TREATMENT SERVICES">TREATMENT SERVICES</option>
                                            <option value="SPECIAL PROMOS">SPECIAL PROMOS</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] uppercase text-gold mb-1 font-bold tracking-widest">Price (₱) *</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            required
                                            value={newService.price}
                                            onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                                            className="min-h-[44px] w-full bg-charcoal border border-white/10 px-3 py-2 text-ivory text-sm focus:border-gold outline-none rounded-sm"
                                        />
                                    </div>
                                </div>

                                {/* Subcategory */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-[10px] uppercase text-gold font-bold tracking-widest">Sub-Category</label>
                                        <span className="text-[10px] text-ivory-dim">e.g. Haircut, Shave &amp; Beard</span>
                                    </div>
                                    <input
                                        type="text"
                                        list="subcategory-suggestions"
                                        value={newService.sub_category}
                                        onChange={(e) => setNewService({ ...newService, sub_category: e.target.value })}
                                        placeholder="Select or enter sub-category"
                                        className="min-h-[44px] w-full bg-charcoal border border-white/10 px-3 py-2 text-ivory text-sm focus:border-gold outline-none rounded-sm"
                                    />
                                    <datalist id="subcategory-suggestions">
                                        {(SUBCATEGORY_SUGGESTIONS[newService.category] || []).map(suggestion => (
                                            <option key={suggestion} value={suggestion} />
                                        ))}
                                    </datalist>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {(SUBCATEGORY_SUGGESTIONS[newService.category] || []).map(suggestion => (
                                            <button
                                                key={suggestion}
                                                type="button"
                                                onClick={() => setNewService({ ...newService, sub_category: suggestion })}
                                                className={`min-h-[32px] text-[10px] px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                                                    newService.sub_category === suggestion
                                                        ? 'bg-gold/20 border-gold text-gold font-bold'
                                                        : 'bg-white/5 border-white/10 text-ivory-dim hover:border-white/20 hover:text-ivory'
                                                }`}
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Service Title */}
                                <div>
                                    <label className="block text-[10px] uppercase text-gold mb-1 font-bold tracking-widest">Service Title *</label>
                                    <input
                                        type="text"
                                        required
                                        value={newService.title}
                                        onChange={(e) => setNewService({ ...newService, title: e.target.value.toUpperCase() })}
                                        className="min-h-[44px] w-full bg-charcoal border border-white/10 px-3 py-2 text-ivory text-sm focus:border-gold outline-none rounded-sm font-medium"
                                        placeholder="e.g. EXECUTIVE SIGNATURE HAIRCUT"
                                    />
                                </div>

                                {/* Duration */}
                                <div>
                                    <label className="block text-[10px] uppercase text-gold mb-1 font-bold tracking-widest">Duration</label>
                                    <div className="flex gap-2 items-center text-ivory-dim text-xs">
                                        <input
                                            type="number"
                                            placeholder="0"
                                            min="0"
                                            value={newService.durationHour}
                                            onChange={(e) => setNewService({ ...newService, durationHour: e.target.value })}
                                            className="min-h-[44px] w-20 bg-charcoal border border-white/10 p-2 text-ivory text-center outline-none focus:border-gold rounded-sm"
                                        />
                                        <span>hours</span>
                                        <input
                                            type="number"
                                            placeholder="0"
                                            min="0"
                                            max="59"
                                            value={newService.durationMin}
                                            onChange={(e) => setNewService({ ...newService, durationMin: e.target.value })}
                                            className="min-h-[44px] w-20 bg-charcoal border border-white/10 p-2 text-ivory text-center outline-none focus:border-gold rounded-sm"
                                        />
                                        <span>mins</span>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="block text-[10px] uppercase text-gold mb-1 font-bold tracking-widest">Description (Optional)</label>
                                    <textarea
                                        rows={3}
                                        value={newService.description}
                                        onChange={(e) => setNewService({ ...newService, description: e.target.value })}
                                        className="w-full bg-charcoal border border-white/10 p-3 text-ivory text-sm focus:border-gold outline-none resize-none rounded-sm"
                                        placeholder="Provide detailed information regarding the service..."
                                    />
                                </div>

                                <div className="flex gap-4 pt-4 border-t border-white/5">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={isSubmitting || isUploadingImage}
                                        className="flex-1 min-h-[44px] bg-gold text-charcoal font-bold flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>Saving...</span>
                                            </>
                                        ) : (
                                            <span>Save Service</span>
                                        )}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        disabled={isSubmitting}
                                        onClick={() => {
                                            setIsAddingService(false);
                                            setEditingService(null);
                                        }}
                                        className="flex-1 min-h-[44px]"
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </Portal>
            )}

            {/* Modal: Delete Confirmation */}
            {deletingService && (
                <Portal>
                    <div className="fixed inset-0 bg-charcoal/90 z-[101] flex items-center justify-center p-4 transform-gpu will-change-transform animate-fade-in">
                        <div className="bg-charcoal-light border border-red-500/30 p-8 rounded-sm w-full max-w-md shadow-2xl animate-fade-in text-center transform-gpu will-change-transform">
                            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-6">
                                <Trash2 className="w-7 h-7 text-red-400" />
                            </div>
                            <h3 className="text-2xl font-serif font-bold text-ivory mb-2">Delete Service</h3>
                            <p className="text-ivory-dim text-sm mb-2">Are you sure you want to delete</p>
                            <p className="text-gold font-bold mb-6 italic">"{deletingService.title}"?</p>
                            <div className="flex gap-4">
                                <button
                                    onClick={handleDeleteService}
                                    className="flex-1 min-h-[44px] py-3 bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 font-bold uppercase tracking-widest text-[10px] rounded-sm transition-all cursor-pointer"
                                >
                                    Yes, Delete
                                </button>
                                <button
                                    onClick={() => setDeletingService(null)}
                                    className="flex-1 min-h-[44px] py-3 bg-white/5 border border-white/10 text-ivory hover:bg-white/10 font-bold uppercase tracking-widest text-[10px] rounded-sm transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </Portal>
            )}
        </div>
    );
};

export default ServicesTab;
