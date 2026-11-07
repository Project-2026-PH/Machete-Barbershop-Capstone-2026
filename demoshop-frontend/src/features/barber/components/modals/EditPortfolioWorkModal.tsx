import React, { useState, useEffect } from 'react';
import { Trash2, Loader2, AlertCircle, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { barberService, BarberPortfolioItem } from '../../services/barber.service';

interface ServiceOption {
    service_id: number;
    title: string;
    category: string;
}

interface EditPortfolioWorkModalProps {
    item: BarberPortfolioItem | null;
    isOpen: boolean;
    onClose: () => void;
    onUpdated: (updatedItem: BarberPortfolioItem) => void;
    onDeleted: (deletedItemId: number) => void;
}

export const EditPortfolioWorkModal: React.FC<EditPortfolioWorkModalProps> = ({
    item,
    isOpen,
    onClose,
    onUpdated,
    onDeleted,
}) => {
    const [serviceId, setServiceId] = useState<string>('');
    const [caption, setCaption] = useState<string>('');
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !item) return;
        setServiceId(item.serviceId ? String(item.serviceId) : '');
        setCaption(item.caption || '');
        setErrorMessage(null);
        setIsConfirmingDelete(false);

        barberService.getAllServices()
            .then(data => setServices(data || []))
            .catch(err => console.warn('Failed to load services:', err));
    }, [isOpen, item]);

    if (!item) return null;

    const handleSave = async () => {
        setIsSaving(true);
        setErrorMessage(null);
        try {
            const updated = await barberService.updatePortfolioWork(item.id, {
                serviceId: serviceId ? parseInt(serviceId, 10) : null,
                caption: caption.trim() || undefined,
            });
            onUpdated(updated);
            onClose();
        } catch (err: any) {
            console.error('Failed to update portfolio work:', err);
            setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to update work.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        setErrorMessage(null);
        try {
            await barberService.deletePortfolioWork(item.id);
            onDeleted(item.id);
            onClose();
        } catch (err: any) {
            console.error('Failed to delete portfolio work:', err);
            setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to remove work.');
            setIsConfirmingDelete(false);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
            <Modal
                isOpen={isOpen && !isConfirmingDelete}
                onClose={() => {
                    if (!isSaving && !isDeleting) onClose();
                }}
                title="Edit Work"
                size="md"
                footer={
                    <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-2.5 w-full">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsConfirmingDelete(true)}
                            disabled={isSaving || isDeleting}
                            className="w-full sm:w-auto text-red-400 border-red-500/40 hover:bg-red-500 hover:text-white hover:border-red-500 transition-colors text-xs px-4 py-2"
                        >
                            <Trash2 className="w-3.5 h-3.5 mr-1" />
                            Remove Work
                        </Button>
                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={onClose}
                                disabled={isSaving || isDeleting}
                                className="w-full sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="primary"
                                onClick={handleSave}
                                disabled={isSaving || isDeleting}
                                className="w-full sm:w-auto min-w-[120px]"
                            >
                                {isSaving ? (
                                    <span className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                                        Saving...
                                    </span>
                                ) : (
                                    'Save Changes'
                                )}
                            </Button>
                        </div>
                    </div>
                }
            >
                <div className="space-y-4">
                    {errorMessage && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 text-xs flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}

                    {/* Image Preview (Read-only) */}
                    <div className="relative rounded-sm overflow-hidden border border-white/10 bg-charcoal aspect-square max-w-[220px] mx-auto shadow-md">
                        <img
                            src={item.imageUrl}
                            alt={item.caption || 'Portfolio work'}
                            className="w-full h-full object-cover"
                        />
                    </div>

                    {/* Service Association */}
                    <div>
                        <label className="block text-[11px] uppercase tracking-wider text-ivory-dim font-bold mb-1.5">
                            Service / Style
                        </label>
                        <select
                            value={serviceId}
                            onChange={(e) => setServiceId(e.target.value)}
                            disabled={isSaving || isDeleting}
                            className="w-full bg-charcoal border border-white/10 focus:border-gold/70 text-ivory text-sm rounded-sm px-3 py-2.5 outline-hidden transition-colors cursor-pointer"
                        >
                            <option value="">None / General Work</option>
                            {services.map((svc) => (
                                <option key={svc.service_id} value={svc.service_id}>
                                    {svc.title}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Caption */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                                Caption
                            </label>
                            <span className="text-[10px] text-ivory-dim/50 font-mono">
                                {caption.length}/300
                            </span>
                        </div>
                        <textarea
                            value={caption}
                            onChange={(e) => setCaption(e.target.value.slice(0, 300))}
                            disabled={isSaving || isDeleting}
                            rows={2}
                            placeholder="Optional short description"
                            className="w-full bg-charcoal border border-white/10 focus:border-gold/70 text-ivory text-sm rounded-sm p-3 outline-hidden transition-colors resize-none placeholder:text-white/20"
                        />
                    </div>
                </div>
            </Modal>

            {/* Remove Confirmation Modal */}
            <Modal
                isOpen={isConfirmingDelete}
                onClose={() => {
                    if (!isDeleting) setIsConfirmingDelete(false);
                }}
                title="Remove Portfolio Work"
                size="sm"
                footer={
                    <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 w-full">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setIsConfirmingDelete(false)}
                            disabled={isDeleting}
                            className="w-full sm:w-auto"
                        >
                            Cancel
                        </Button>
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="w-full sm:w-auto min-w-[110px] px-5 py-2.5 rounded-sm bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-serif font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center justify-center gap-2"
                        >
                            {isDeleting ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                                    Removing...
                                </span>
                            ) : (
                                'Remove'
                            )}
                        </button>
                    </div>
                }
            >
                <div className="space-y-3 py-1">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                            <AlertTriangle className="w-5 h-5" />
                        </div>
                        <div>
                            <h5 className="font-bold text-sm text-ivory">Remove this work from your portfolio?</h5>
                            <p className="text-xs text-ivory-dim mt-1 leading-relaxed">
                                This will remove it from your public portfolio and permanently delete the image from storage.
                            </p>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};
