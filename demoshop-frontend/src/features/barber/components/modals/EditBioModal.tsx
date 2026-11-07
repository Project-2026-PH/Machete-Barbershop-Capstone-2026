import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { barberService } from '../../services/barber.service';

interface EditBioModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentBio: string;
    onSuccess: (updatedBio: string) => void;
}

export const EditBioModal: React.FC<EditBioModalProps> = ({
    isOpen,
    onClose,
    currentBio,
    onSuccess,
}) => {
    const [bio, setBio] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen) return;
        setBio(currentBio || '');
        setErrorMessage(null);
    }, [isOpen, currentBio]);

    const handleSave = async () => {
        setIsSaving(true);
        setErrorMessage(null);
        try {
            const result = await barberService.updateBio(bio.trim());
            onSuccess(result.bio || '');
            onClose();
        } catch (err: any) {
            console.error('Failed to update bio:', err);
            setErrorMessage(err?.response?.data?.message || err?.message || 'Failed to update bio.');
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
            title="Edit Profile Bio"
            size="md"
            footer={
                <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 w-full">
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
                            'Save Bio'
                        )}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                <p className="text-xs text-ivory-dim leading-relaxed">
                    Write a short summary about your background, style specialties, and haircut philosophy to present to customers during booking.
                </p>

                {errorMessage && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-sm text-red-400 text-xs flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] uppercase tracking-wider text-ivory-dim font-bold">
                            About / Bio
                        </label>
                        <span className="text-[10px] text-ivory-dim/50 font-mono">
                            {bio.length}/500
                        </span>
                    </div>
                    <textarea
                        value={bio}
                        onChange={(e) => setBio(e.target.value.slice(0, 500))}
                        disabled={isSaving}
                        rows={4}
                        placeholder="Clean cuts, fades and modern styles with attention to detail and personalized grooming advice..."
                        className="w-full bg-charcoal border border-white/10 focus:border-gold/70 text-ivory text-sm rounded-sm p-3 outline-hidden transition-colors resize-none placeholder:text-white/20 leading-relaxed"
                    />
                </div>
            </div>
        </Modal>
    );
};
