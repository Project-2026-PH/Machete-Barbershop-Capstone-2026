import React, { useState, useEffect, useMemo } from 'react';
import { Search, Check, Loader2, AlertCircle, Scissors } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { barberService, BarberSpecialty } from '../../services/barber.service';

interface ServiceItem {
    service_id: number;
    title: string;
    category: string;
    price: number;
    duration_minutes?: number;
}

interface EditSpecialtiesModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSpecialties: BarberSpecialty[];
    onSuccess: (updatedSpecialties: BarberSpecialty[]) => void;
}

export const EditSpecialtiesModal: React.FC<EditSpecialtiesModalProps> = ({
    isOpen,
    onClose,
    currentSpecialties,
    onSuccess,
}) => {
    const [services, setServices] = useState<ServiceItem[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(new Set(currentSpecialties.map((s) => s.serviceId)));
        setSearchQuery('');
        setErrorMessage(null);

        let isMounted = true;
        setIsLoading(true);
        barberService.getAllServices()
            .then((data) => {
                if (isMounted) setServices(data || []);
            })
            .catch((err) => {
                console.warn('Failed to load services:', err);
                if (isMounted) setErrorMessage('Failed to load services catalog.');
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => { isMounted = false; };
    }, [isOpen, currentSpecialties]);

    const filteredServices = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return services;
        return services.filter(
            (s) =>
                s.title.toLowerCase().includes(q) ||
                (s.category && s.category.toLowerCase().includes(q))
        );
    }, [services, searchQuery]);

    const toggleService = (id: number) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        setErrorMessage(null);
        try {
            const updated = await barberService.updateSpecialties(Array.from(selectedIds));
            onSuccess(updated);
            onClose();
        } catch (err: any) {
            console.error('Failed to update specialties:', err);
            setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to save specialties.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (!isSaving) onClose();
            }}
            title="Edit Specialties"
            size="md"
            footer={
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 w-full">
                    <span className="text-xs text-ivory-dim/70 font-mono">
                        {selectedIds.size} {selectedIds.size === 1 ? 'service' : 'services'} selected
                    </span>
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            disabled={isSaving}
                            className="w-full sm:w-auto"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full sm:w-auto min-w-[120px]"
                        >
                            {isSaving ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                                    Saving...
                                </span>
                            ) : (
                                'Save Specialties'
                            )}
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                <p className="text-xs text-ivory-dim leading-relaxed">
                    Select the services from DemoShop's catalog that you specialize in. These will appear on your public portfolio for customers.
                </p>

                {errorMessage && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Search Bar */}
                <div className="relative">
                    <Search className="w-4 h-4 text-ivory-dim absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search services (e.g. Haircut, Fade, Shave)..."
                        className="w-full bg-charcoal border border-white/10 focus:border-gold/60 text-ivory text-xs rounded-sm pl-9 pr-3 py-2.5 outline-hidden transition-colors placeholder:text-white/20"
                    />
                </div>

                {/* Services List */}
                <div className="max-h-[320px] overflow-y-auto space-y-1.5 pr-1 divide-y divide-white/5">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-ivory-dim">
                            <Loader2 className="w-6 h-6 animate-spin text-gold" />
                            <span className="text-xs">Loading services...</span>
                        </div>
                    ) : filteredServices.length === 0 ? (
                        <div className="py-12 text-center text-xs text-ivory-dim/60">
                            No services match "{searchQuery}"
                        </div>
                    ) : (
                        filteredServices.map((service) => {
                            const isSelected = selectedIds.has(service.service_id);
                            return (
                                <div
                                    key={service.service_id}
                                    onClick={() => toggleService(service.service_id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            toggleService(service.service_id);
                                        }
                                    }}
                                    className={`p-3 rounded-sm flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                                        isSelected
                                            ? 'bg-gold/10 border border-gold/40 text-gold'
                                            : 'hover:bg-white/[0.03] border border-transparent text-ivory'
                                    }`}
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-sm truncate">{service.title}</span>
                                            {service.category && (
                                                <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-xs bg-white/5 text-ivory-dim/70 shrink-0 font-mono">
                                                    {service.category}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-ivory-dim/70 mt-0.5">
                                            <span>₱{Number(service.price).toFixed(2)}</span>
                                            {service.duration_minutes && (
                                                <>
                                                    <span>•</span>
                                                    <span>{service.duration_minutes} mins</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <div
                                        className={`w-5 h-5 rounded-xs border flex items-center justify-center shrink-0 transition-colors ${
                                            isSelected
                                                ? 'bg-gold border-gold text-charcoal'
                                                : 'border-white/20 bg-charcoal'
                                        }`}
                                    >
                                        {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </Modal>
    );
};
