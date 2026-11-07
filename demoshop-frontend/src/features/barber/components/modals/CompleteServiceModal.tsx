import React, { useState } from 'react';
import { Scissors, Camera, Sparkles, CheckCircle, AlertCircle, X, Upload, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { barberService } from '../../services/barber.service';

interface CompleteServiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    queueId: number;
    customerName: string;
    serviceName: string;
    initialBaseStyle?: string;
    initialLength?: string;
    initialAccent?: string;
    onSuccess: (customerName: string) => void;
}

const BASE_STYLES = [
    'High Fade',
    'Mid Fade',
    'Low Fade',
    'Skin Fade',
    'Taper Fade',
    'Classic Scissor Cut',
    'Buzz Cut',
    'Pompadour',
    'Undercut',
    'Crop Fade',
    'Caesar Cut',
    'Side Part Classic'
];

const GUARD_LENGTHS = [
    'Skin Close (#0)',
    '#0.5 (1.5mm)',
    '#1 (3mm)',
    '#1.5 (4.5mm)',
    '#2 (6mm)',
    '#3 (10mm)',
    '#4 (13mm)',
    'Scissor Over Comb',
    'Medium Length (Tapered)',
    'Finger Length on Top'
];

const ACCENT_FINISHES = [
    'Textured Crop',
    'Clean Line-Up / Edge',
    'Slicked Back (Pomade)',
    'Side Part with Hard Line',
    'Fringe / Forward Flow',
    'Curly Top Texture',
    'Matte Clay Natural Finish',
    'High Shine Classic Finish'
];

export const CompleteServiceModal: React.FC<CompleteServiceModalProps> = ({
    isOpen,
    onClose,
    queueId,
    customerName,
    serviceName,
    initialBaseStyle = 'Mid Fade',
    initialLength = '#1 (3mm)',
    initialAccent = 'Textured Crop',
    onSuccess,
}) => {
    const [baseStyle, setBaseStyle] = useState(initialBaseStyle);
    const [guardLength, setGuardLength] = useState(initialLength);
    const [accentFinish, setAccentFinish] = useState(initialAccent);
    const [technicalNotes, setTechnicalNotes] = useState('');
    const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            if (!['image/jpeg', 'image/png'].includes(file.type)) {
                setErrorMessage('Only JPEG and PNG images are allowed.');
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                setErrorMessage('Image size must be under 5 MB.');
                return;
            }
            setErrorMessage(null);
            setSelectedPhoto(file);
            const previewUrl = URL.createObjectURL(file);
            setPhotoPreview(previewUrl);
        }
    };

    const removePhoto = () => {
        setSelectedPhoto(null);
        if (photoPreview) {
            URL.revokeObjectURL(photoPreview);
            setPhotoPreview(null);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);
        setIsSubmitting(true);

        try {
            let uploadedPhotoUrl: string | undefined = undefined;

            // 1. Upload photo if selected
            if (selectedPhoto) {
                try {
                    const uploadRes = await barberService.uploadHaircutPhoto(selectedPhoto, queueId);
                    uploadedPhotoUrl = uploadRes.haircut_photo_url;
                } catch (uploadErr: any) {
                    console.warn('[CompleteServiceModal] Photo upload failed, continuing with specs:', uploadErr);
                    // Non-fatal: if photo storage fails or bucket is offline, proceed with service completion
                }
            }

            // 2. Complete active service with technical specifications
            await barberService.completeService(queueId, {
                base_style: baseStyle,
                haircut_length: guardLength,
                accent_style: accentFinish,
                specs_notes: technicalNotes.trim() || `${baseStyle} with ${guardLength} and ${accentFinish}`,
                haircut_photo_url: uploadedPhotoUrl
            });

            onSuccess(customerName);
            onClose();
        } catch (err: any) {
            console.error('[CompleteServiceModal] Completion error:', err);
            const msg = err.response?.data?.error || err.message || 'Failed to complete haircut service.';
            setErrorMessage(msg);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Complete Service & Log Haircut Specs"
            size="lg"
        >
            <form onSubmit={handleSubmit} className="space-y-5">
                {errorMessage && (
                    <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-sm text-xs text-red-400 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Customer & Service Banner */}
                <div className="bg-charcoal p-3.5 sm:p-4 rounded-sm border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gold/30 to-gold/5 border border-gold/40 flex items-center justify-center font-serif text-gold font-bold text-base shadow-sm shrink-0">
                            {customerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-gold block">Client Record</span>
                            <h4 className="text-sm font-bold text-ivory truncate">{customerName}</h4>
                        </div>
                    </div>
                    <div className="text-left sm:text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-ivory-dim block">Service</span>
                        <span className="text-xs font-serif font-bold text-gold">{serviceName}</span>
                    </div>
                </div>

                {/* Technical Haircut Specs Grid */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                        <Scissors className="w-4 h-4 text-gold" />
                        <h5 className="text-xs uppercase tracking-wider font-bold text-ivory">
                            Post-Cut Technical Specifications
                        </h5>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {/* Base Style */}
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gold font-bold block mb-1">
                                Base Style
                            </label>
                            <select
                                value={baseStyle}
                                onChange={e => setBaseStyle(e.target.value)}
                                className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 text-xs text-ivory focus:border-gold focus:outline-none"
                                required
                            >
                                {BASE_STYLES.map(style => (
                                    <option key={style} value={style}>{style}</option>
                                ))}
                            </select>
                        </div>

                        {/* Length / Guard */}
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gold font-bold block mb-1">
                                Length / Guard
                            </label>
                            <select
                                value={guardLength}
                                onChange={e => setGuardLength(e.target.value)}
                                className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 text-xs text-ivory focus:border-gold focus:outline-none"
                                required
                            >
                                {GUARD_LENGTHS.map(len => (
                                    <option key={len} value={len}>{len}</option>
                                ))}
                            </select>
                        </div>

                        {/* Accent / Finish */}
                        <div>
                            <label className="text-[10px] uppercase tracking-widest text-gold font-bold block mb-1">
                                Accent / Finish
                            </label>
                            <select
                                value={accentFinish}
                                onChange={e => setAccentFinish(e.target.value)}
                                className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 text-xs text-ivory focus:border-gold focus:outline-none"
                                required
                            >
                                {ACCENT_FINISHES.map(acc => (
                                    <option key={acc} value={acc}>{acc}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Technical Notes Textarea */}
                    <div>
                        <label className="text-[10px] uppercase tracking-widest text-ivory-dim font-bold block mb-1">
                            Barber Technical Notes (Optional)
                        </label>
                        <textarea
                            rows={2}
                            placeholder="e.g. Sensitive skin on lower neck, blend clipper guard #1 to #2 on crown, styling with matte clay..."
                            value={technicalNotes}
                            onChange={e => setTechnicalNotes(e.target.value)}
                            className="w-full bg-charcoal border border-white/10 rounded-sm p-2.5 text-xs text-ivory placeholder-white/20 focus:border-gold focus:outline-none resize-none shadow-inner"
                        />
                    </div>
                </div>

                {/* Post-Cut Photo Capture & Upload */}
                <div className="space-y-3 pt-1 border-t border-white/10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Camera className="w-4 h-4 text-gold" />
                            <h5 className="text-xs uppercase tracking-wider font-bold text-ivory">
                                Completed Cut Photo Capture (Optional)
                            </h5>
                        </div>
                        {photoPreview && (
                            <button
                                type="button"
                                onClick={removePhoto}
                                className="text-[10px] text-red-400 hover:text-red-300 font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                            >
                                <X className="w-3 h-3" /> Remove Photo
                            </button>
                        )}
                    </div>

                    {photoPreview ? (
                        <div className="relative group overflow-hidden border border-gold/40 rounded-sm bg-charcoal aspect-video max-h-48 shadow-lg flex items-center justify-center">
                            <img
                                src={photoPreview}
                                alt="Cut Preview"
                                className="w-full h-full object-contain"
                            />
                            <div className="absolute bottom-2 left-2 text-[10px] font-bold text-gold bg-charcoal/90 px-2 py-0.5 rounded-xs border border-gold/30">
                                Completed Cut Snapshot
                            </div>
                        </div>
                    ) : (
                        <label className="border border-dashed border-white/20 hover:border-gold/50 rounded-sm p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                            <Upload className="w-6 h-6 text-gold/70" />
                            <div className="text-center">
                                <span className="text-xs font-bold text-ivory block">Upload or Snap Finished Cut</span>
                                <span className="text-[10px] text-ivory-dim block mt-0.5">PNG or JPG up to 5MB</span>
                            </div>
                            <input
                                type="file"
                                accept="image/jpeg,image/png"
                                onChange={handlePhotoChange}
                                className="hidden"
                            />
                        </label>
                    )}
                </div>

                {/* Footer Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 pt-3 border-t border-white/10">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="text-xs w-full sm:w-auto"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={isSubmitting}
                        className="bg-gold hover:bg-gold-600 text-charcoal font-bold text-xs flex items-center justify-center gap-2 w-full sm:w-auto"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Saving Specs & Completing...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                <span>Finish Service & Save Specs</span>
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};
