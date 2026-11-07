import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import Portal from '@/components/common/Portal';

interface HaircutPhotoViewerModalProps {
    photoData: { 
        name: string; 
        photoUrl: string; 
        serviceTitle?: string | null; 
        caption?: string | null; 
        title?: string | null;
    } | null;
    onClose: () => void;
}

export const HaircutPhotoViewerModal: React.FC<HaircutPhotoViewerModalProps> = ({
    photoData,
    onClose
}) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        if (photoData) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [photoData, onClose]);

    if (!photoData) return null;

    const displayTag = photoData.serviceTitle ? 'Portfolio Work' : 'Visual Reference';
    const displayTitle = photoData.title || (photoData.serviceTitle 
        ? `${photoData.serviceTitle} • ${photoData.name}` 
        : `${photoData.name}'s Last Haircut`);

    return (
        <Portal>
            <div
                className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in transform-gpu will-change-transform"
                onClick={onClose}
            >
                <div
                    className="relative max-w-3xl w-full flex flex-col items-center gap-3 sm:gap-4 transform-gpu will-change-transform max-h-[92vh]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between w-full border-b border-white/10 pb-2.5 sm:pb-3 gap-2">
                        <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-gold block">{displayTag}</span>
                            <h4 className="text-base sm:text-lg font-serif font-bold text-ivory truncate">{displayTitle}</h4>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-1.5 sm:p-2 text-ivory-dim hover:text-gold hover:bg-white/10 rounded-sm transition-colors cursor-pointer shrink-0"
                            title="Close"
                        >
                            <X className="w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                    </div>
                    <div className="w-full flex items-center justify-center overflow-hidden">
                        <img
                            src={photoData.photoUrl}
                            alt={displayTitle}
                            className="w-auto max-w-full h-auto max-h-[65vh] sm:max-h-[70vh] object-contain rounded-sm border border-gold/40 shadow-2xl"
                        />
                    </div>
                    {photoData.caption && (
                        <div className="w-full text-center px-4 py-2.5 bg-charcoal-light/90 border border-white/10 rounded-sm">
                            <p className="text-xs sm:text-sm text-ivory/90 italic">
                                "{photoData.caption}"
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </Portal>
    );
};
