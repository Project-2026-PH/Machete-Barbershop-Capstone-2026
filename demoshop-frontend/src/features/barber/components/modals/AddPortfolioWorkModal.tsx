import React, { useState, useEffect, useRef } from 'react';
import { Upload, X, Loader2, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { barberService, BarberPortfolioItem } from '../../services/barber.service';

interface ServiceOption {
    service_id: number;
    title: string;
    category: string;
}

interface AddPortfolioWorkModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newItem: BarberPortfolioItem) => void;
}

export const AddPortfolioWorkModal: React.FC<AddPortfolioWorkModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
}) => {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [serviceId, setServiceId] = useState<string>('');
    const [caption, setCaption] = useState<string>('');
    const [services, setServices] = useState<ServiceOption[]>([]);
    const [isLoadingServices, setIsLoadingServices] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch real service catalog for dropdown
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;
        setIsLoadingServices(true);
        barberService.getAllServices()
            .then((data) => {
                if (isMounted) setServices(data || []);
            })
            .catch((err) => {
                console.warn('Failed to load services:', err);
            })
            .finally(() => {
                if (isMounted) setIsLoadingServices(false);
            });
        return () => { isMounted = false; };
    }, [isOpen]);

    // Reset state on open/close
    useEffect(() => {
        if (!isOpen) {
            setFile(null);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
            setServiceId('');
            setCaption('');
            setErrorMessage(null);
            setIsUploading(false);
        }
    }, [isOpen]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setErrorMessage(null);
        const selected = e.target.files?.[0];
        if (!selected) return;

        // Image type validation
        const validTypes = ['image/jpeg', 'image/png'];
        if (!validTypes.includes(selected.type)) {
            setErrorMessage('Only JPEG and PNG images are allowed.');
            return;
        }

        // 5MB file size limit
        if (selected.size > 5 * 1024 * 1024) {
            setErrorMessage('Image size must be 5MB or smaller.');
            return;
        }

        setFile(selected);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(selected));
    };

    const handleRemoveSelectedFile = () => {
        setFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setErrorMessage('Please select a photo of your work.');
            return;
        }

        setIsUploading(true);
        setErrorMessage(null);

        try {
            const formData = new FormData();
            formData.append('photo', file);
            if (serviceId) {
                formData.append('serviceId', serviceId);
            }
            if (caption.trim()) {
                formData.append('caption', caption.trim());
            }

            const createdItem = await barberService.addPortfolioWork(formData);
            onSuccess(createdItem);
            onClose();
        } catch (err: any) {
            console.error('Failed to add portfolio work:', err);
            setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to upload portfolio work. Please try again.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (!isUploading) onClose();
            }}
            title="Add to Portfolio"
            size="md"
            footer={
                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 w-full">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={onClose}
                        disabled={isUploading}
                        className="w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        onClick={handleSubmit}
                        disabled={!file || isUploading}
                        className="w-full sm:w-auto min-w-[140px]"
                    >
                        {isUploading ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                                Uploading...
                            </span>
                        ) : (
                            'Add to Portfolio'
                        )}
                    </Button>
                </div>
            }
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {errorMessage && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 text-xs flex items-center gap-2 animate-fade-in">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Photo Upload Box */}
                <div>
                    <label className="block text-[11px] uppercase tracking-wider text-ivory-dim font-bold mb-1.5">
                        Photo <span className="text-gold">*</span>
                    </label>

                    {previewUrl ? (
                        <div className="relative rounded-sm overflow-hidden border border-gold/40 bg-charcoal aspect-square max-w-[240px] mx-auto group shadow-md">
                            <img
                                src={previewUrl}
                                alt="Portfolio Preview"
                                className="w-full h-full object-cover"
                            />
                            {!isUploading && (
                                <button
                                    type="button"
                                    onClick={handleRemoveSelectedFile}
                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 hover:bg-black text-ivory hover:text-red-400 transition-colors cursor-pointer"
                                    title="Remove photo"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                            <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur-xs text-[10px] text-ivory/80 px-2 py-1 rounded-xs truncate text-center">
                                {file?.name}
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-white/20 hover:border-gold/60 active:border-gold rounded-sm p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-charcoal/50 hover:bg-charcoal transition-all text-center group"
                        >
                            <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center text-gold group-hover:scale-110 transition-transform">
                                <Upload className="w-5 h-5" />
                            </div>
                            <div>
                                <span className="text-sm font-semibold text-ivory block group-hover:text-gold transition-colors">
                                    Click or tap to upload photo
                                </span>
                                <span className="text-[11px] text-ivory-dim/60 block mt-0.5">
                                    JPEG or PNG up to 5MB
                                </span>
                            </div>
                        </div>
                    )}

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png"
                        onChange={handleFileChange}
                        className="hidden"
                        disabled={isUploading}
                    />
                </div>

                {/* Service / Style Association */}
                <div>
                    <label className="block text-[11px] uppercase tracking-wider text-ivory-dim font-bold mb-1.5">
                        Service / Style <span className="text-ivory-dim/50 text-[10px] font-normal lowercase">(optional)</span>
                    </label>
                    <select
                        value={serviceId}
                        onChange={(e) => setServiceId(e.target.value)}
                        disabled={isUploading || isLoadingServices}
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

                {/* Caption / Description */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                            Caption <span className="text-ivory-dim/50 text-[10px] font-normal lowercase">(optional)</span>
                        </label>
                        <span className="text-[10px] text-ivory-dim/50 font-mono">
                            {caption.length}/300
                        </span>
                    </div>
                    <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value.slice(0, 300))}
                        disabled={isUploading}
                        rows={2}
                        placeholder="e.g. Skin fade with textured scissor crop on top"
                        className="w-full bg-charcoal border border-white/10 focus:border-gold/70 text-ivory text-sm rounded-sm p-3 outline-hidden transition-colors resize-none placeholder:text-white/20"
                    />
                </div>
            </form>
        </Modal>
    );
};
