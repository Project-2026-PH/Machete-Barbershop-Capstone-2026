import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Camera, Loader2, User, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { ImageCropModal } from '@/components/feedback/ImageCropModal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/feedback/ToastContext';
import { validateAvatarFile } from '@/utils/avatar-validation';
import { api } from '@/config/api';

interface BarberProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const BarberProfileModal: React.FC<BarberProfileModalProps> = ({
    isOpen,
    onClose,
}) => {
    const { user: currentUser, refetchMe, logout } = useAuth() as any;
    const { addToast } = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isSaving, setIsSaving] = useState(false);
    const [activeSection, setActiveSection] = useState<'profile' | 'password'>('profile');
    const savingRef = useRef(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [isCropOpen, setIsCropOpen] = useState(false);

    // Staged draft state (never persists until Save Changes is clicked)
    const [draftAvatarBlob, setDraftAvatarBlob] = useState<Blob | null>(null);
    const [draftPreviewUrl, setDraftPreviewUrl] = useState<string | null>(null);
    const draftPreviewUrlRef = useRef<string | null>(null);
    const prevIsOpenRef = useRef(false);

    // Compute initial names from currentUser
    const initialNames = useMemo(() => {
        const rawName = (
            currentUser?.username ||
            currentUser?.full_name ||
            currentUser?.name ||
            (currentUser as any)?.user_metadata?.full_name ||
            ''
        ).trim();
        const parts = rawName.split(' ');
        return {
            first: parts[0] || '',
            last: parts.slice(1).join(' ') || '',
        };
    }, [currentUser?.username, currentUser?.full_name, currentUser?.name, (currentUser as any)?.user_metadata?.full_name]);

    const [firstName, setFirstName] = useState(initialNames.first);
    const [lastName, setLastName] = useState(initialNames.last);

    const resetPasswords = useCallback(() => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setVisiblePasswords({});
    }, []);

    // Clean up temporary blob preview URLs safely
    const cleanupDraftPreview = useCallback(() => {
        if (draftPreviewUrlRef.current && draftPreviewUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(draftPreviewUrlRef.current);
        }
        draftPreviewUrlRef.current = null;
        setDraftPreviewUrl(null);
        setDraftAvatarBlob(null);
    }, []);

    // Synchronize form ONLY when modal transitions from closed to open
    useEffect(() => {
        if (isOpen && !prevIsOpenRef.current) {
            setActiveSection('profile');
            setFirstName(initialNames.first);
            setLastName(initialNames.last);
            cleanupDraftPreview();
            resetPasswords();
        }
        if (!isOpen) resetPasswords();
        prevIsOpenRef.current = isOpen;
    }, [isOpen, initialNames.first, initialNames.last, cleanupDraftPreview, resetPasswords]);

    // Cleanup blob on unmount
    useEffect(() => {
        return () => {
            if (draftPreviewUrlRef.current && draftPreviewUrlRef.current.startsWith('blob:')) {
                URL.revokeObjectURL(draftPreviewUrlRef.current);
            }
        };
    }, []);

    // Discard draft on close
    const handleClose = () => {
        if (savingRef.current) return;
        cleanupDraftPreview();
        setFirstName(initialNames.first);
        setLastName(initialNames.last);
        resetPasswords();
        onClose();
    };

    // Calculate dirty state
    const isNameDirty = useMemo(() => {
        return firstName.trim() !== initialNames.first.trim() || lastName.trim() !== initialNames.last.trim();
    }, [firstName, lastName, initialNames]);

    const isAvatarDirty = draftAvatarBlob !== null;
    // Current password and confirmation alone do not represent a password change.
    const isPasswordDirty = newPassword.length > 0;
    const isPasswordValid = Boolean(currentPassword)
        && newPassword.length >= 12
        && newPassword.length <= 128
        && newPassword !== currentPassword
        && newPassword === confirmPassword;
    const canSave = activeSection === 'password'
        ? isPasswordDirty && isPasswordValid
        : isNameDirty || isAvatarDirty;
    const passwordError = !isPasswordDirty ? ''
        : newPassword === currentPassword ? 'New password must be different from your current password.'
        : newPassword.length < 12 || newPassword.length > 128 ? 'Use between 12 and 128 characters.'
        : confirmPassword && newPassword !== confirmPassword ? 'Passwords do not match.'
        : '';

    const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const validationError = validateAvatarFile(file);
        if (validationError) {
            addToast({
                type: 'error',
                title: 'Invalid Avatar',
                message: validationError,
                duration: 4000,
            });
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            setCropImageSrc(reader.result as string);
            setIsCropOpen(true);
        };
        reader.readAsDataURL(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // When crop is finished: update LOCAL DRAFT ONLY. Do NOT persist to backend until Save Changes.
    const handleCropComplete = (croppedBlob: Blob, localPreviewUrl: string) => {
        setIsCropOpen(false);
        setCropImageSrc(null);
        // Revoke previously staged blob URL if one exists
        if (draftPreviewUrlRef.current && draftPreviewUrlRef.current.startsWith('blob:')) {
            URL.revokeObjectURL(draftPreviewUrlRef.current);
        }
        draftPreviewUrlRef.current = localPreviewUrl;
        setDraftAvatarBlob(croppedBlob);
        setDraftPreviewUrl(localPreviewUrl);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave || savingRef.current) return;

        savingRef.current = true;
        setIsSaving(true);
        try {
            // 1. Upload avatar if changed
            if (activeSection === 'profile' && draftAvatarBlob) {
                const formData = new FormData();
                formData.append('avatar', draftAvatarBlob, 'avatar.jpg');

                await api.post('/api/auth/profile-picture', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
            }

            // 2. Update profile name if changed
            if (activeSection === 'profile' && isNameDirty) {
                const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();
                await api.put('/api/auth/profile', {
                    name: fullName,
                    username: fullName,
                });
            }

            if (activeSection === 'password') {
                await api.post('/api/auth/change-password', {
                    currentPassword,
                    newPassword,
                });

                resetPasswords();
                cleanupDraftPreview();
                addToast({
                    type: 'success',
                    title: 'Password Changed',
                    message: 'Your password has been updated. Please log in with your new password.',
                    duration: 4000,
                });
                onClose();
                await logout();
                return;
            }

            await refetchMe();

            addToast({
                type: 'success',
                title: 'Profile Updated',
                message: 'Your Barber profile details have been saved successfully.',
                duration: 4000,
            });

            cleanupDraftPreview();
            onClose();
        } catch (err: any) {
            const serverError = err.response?.data;
            const message =
                serverError?.code === 'AVATAR_TOO_LARGE' || err.response?.status === 413
                    ? 'Avatar must be 5 MB or smaller.'
                    : serverError?.message || serverError?.error || err.message || 'Failed to save profile changes.';

            addToast({
                type: 'error',
                title: 'Update Failed',
                message,
                duration: 4000,
            });
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    };

    const rawPic =
        currentUser?.profile_picture ||
        (currentUser as any)?.profilePicture ||
        (currentUser as any)?.avatar_url ||
        (currentUser as any)?.user_metadata?.avatar_url ||
        (currentUser as any)?.picture;
    const persistedAvatarUrl =
        rawPic && !rawPic.includes('${')
            ? rawPic.startsWith('http')
                ? rawPic
                : `${import.meta.env.VITE_API_URL || ''}/uploads/profiles/${rawPic}`
            : null;

    const displayImage = draftPreviewUrl || persistedAvatarUrl;
    const displayName = `${firstName} ${lastName}`.trim() || currentUser?.username || currentUser?.email?.split('@')[0] || 'Barber';

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Barber Profile"
            size="md"
            bodyClassName="!p-4 sm:!p-5"
            footer={
                <div className="w-full flex flex-wrap items-center justify-end gap-2 sm:gap-3">
                    <p className="mr-auto text-[11px] text-ivory-dim/70">
                        Saves changes in this tab.
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={handleClose}
                        disabled={isSaving}
                        className="!px-3 !py-2 text-xs text-ivory-dim hover:text-ivory"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form="barber-profile-form"
                        variant="primary"
                        className="!px-4 !py-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                        disabled={!canSave || isSaving}
                    >
                        {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Changes'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4">
                {/* Avatar & Barber Identity Header */}
                <div className="flex items-center gap-4">
                    <div className="relative group shrink-0">
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={handleAvatarSelect}
                            disabled={isSaving || activeSection !== 'profile'}
                            className="hidden"
                        />
                        <div className={`w-16 h-16 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 border-2 flex items-center justify-center text-gold font-serif font-bold text-2xl shadow-2xl overflow-hidden transition-all duration-300 ${isAvatarDirty ? 'border-gold ring-2 ring-gold/30' : 'border-gold/30 group-hover:border-gold'}`}>
                            {displayImage ? (
                                <img src={displayImage} alt="Profile" className="w-full h-full object-cover" />
                            ) : (
                                displayName.charAt(0).toUpperCase()
                            )}
                        </div>
                        {activeSection === 'profile' && !isSaving && <div
                            className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    fileInputRef.current?.click();
                                }
                            }}
                            aria-label="Upload profile picture"
                        >
                            <Camera className="w-6 h-6 text-white" />
                        </div>}
                    </div>
                    <div className="min-w-0">
                        <h4 className="text-base font-serif font-bold text-ivory tracking-wide">{displayName}</h4>
                        <span className="inline-block mt-0.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-gold/15 text-gold border border-gold/30">
                            Barber
                        </span>
                        {activeSection === 'profile' && <p className="text-[11px] text-ivory-dim/70 mt-1">
                            {isAvatarDirty ? 'Unsaved photo change' : 'Select your photo to update it.'}
                        </p>}
                    </div>
                </div>

                <nav aria-label="Profile settings" className="grid grid-cols-2 gap-1 p-1 bg-white/[0.03] border border-white/10 rounded-sm">
                    {([
                        { id: 'profile', label: 'Profile', icon: User },
                        { id: 'password', label: 'Password', icon: Lock },
                    ] as const).map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveSection(id)}
                            disabled={isSaving}
                            aria-pressed={activeSection === id}
                            aria-controls={`barber-${id}-panel`}
                            className={`flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-gold ${activeSection === id ? 'bg-gold/15 text-gold' : 'text-ivory-dim hover:bg-white/5 hover:text-ivory'}`}
                        >
                            <Icon className="w-3.5 h-3.5" /> {label}
                        </button>
                    ))}
                </nav>

                {/* Form fields */}
                <form id="barber-profile-form" onSubmit={handleSaveProfile}>
                    {activeSection === 'profile' ? <fieldset id="barber-profile-panel" disabled={isSaving} className="space-y-4">
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-bold tracking-widest text-gold uppercase">
                                Profile Information
                            </span>
                        </div>
                        <p className="text-[11px] text-ivory-dim/70 mb-3">
                            Keep your profile information accurate and up to date.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="space-y-1">
                                <label htmlFor="modalFirstName" className="text-xs font-medium text-ivory-dim">
                                    First Name
                                </label>
                                <div className="relative group">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim transition-colors group-focus-within:text-gold" />
                                    <input
                                        type="text"
                                        id="modalFirstName"
                                        value={firstName}
                                        onChange={(e) => setFirstName(e.target.value)}
                                        placeholder="First Name"
                                        required
                                        className="w-full bg-white/[0.04] border border-white/10 rounded-sm px-3.5 py-2.5 pl-10 text-ivory placeholder:text-ivory-dim/40 focus:outline-none focus:border-gold/50 focus:bg-white/[0.06] transition-all text-sm"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label htmlFor="modalLastName" className="text-xs font-medium text-ivory-dim">
                                    Last Name
                                </label>
                                <div className="relative group">
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim transition-colors group-focus-within:text-gold" />
                                    <input
                                        type="text"
                                        id="modalLastName"
                                        value={lastName}
                                        onChange={(e) => setLastName(e.target.value)}
                                        placeholder="Last Name"
                                        className="w-full bg-white/[0.04] border border-white/10 rounded-sm px-3.5 py-2.5 pl-10 text-ivory placeholder:text-ivory-dim/40 focus:outline-none focus:border-gold/50 focus:bg-white/[0.06] transition-all text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex items-center justify-between">
                            <label htmlFor="modalEmail" className="text-xs font-medium text-ivory-dim">
                                Email Address
                            </label>
                        </div>
                        <div className="relative group">
                            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim/50" />
                            <input
                                type="email"
                                id="modalEmail"
                                value={currentUser?.email || ''}
                                disabled
                                className="w-full bg-white/[0.02] border border-white/5 rounded-sm px-3.5 py-2.5 pl-10 text-ivory/50 cursor-not-allowed select-none text-sm"
                            />
                        </div>
                        <p className="text-[10px] text-ivory-dim/60 mt-0.5">
                            Your account email cannot be changed here.
                        </p>
                    </div>
                    </fieldset> :

                    <fieldset id="barber-password-panel" disabled={isSaving} className="space-y-3">
                        <legend className="text-[10px] font-mono font-bold tracking-widest text-gold uppercase px-1">
                            Change Password
                        </legend>
                        <p id="barber-password-help" className="text-[11px] text-ivory-dim/70">
                            Use 12–128 characters without your name, username, or email. You’ll sign in again after saving.
                        </p>
                        {[
                            { id: 'barberCurrentPassword', label: 'Current Password', value: currentPassword, onChange: setCurrentPassword, autoComplete: 'current-password' },
                            { id: 'barberNewPassword', label: 'New Password', value: newPassword, onChange: setNewPassword, autoComplete: 'new-password' },
                            { id: 'barberConfirmPassword', label: 'Confirm Password', value: confirmPassword, onChange: setConfirmPassword, autoComplete: 'new-password' },
                        ].map((field) => (
                            <div key={field.id} className="space-y-1">
                                <label htmlFor={field.id} className="text-xs font-medium text-ivory-dim">
                                    {field.label}
                                </label>
                                <div className="relative group">
                                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim group-focus-within:text-gold" />
                                    <input
                                        id={field.id}
                                        name={field.id}
                                        type={visiblePasswords[field.id] ? 'text' : 'password'}
                                        value={field.value}
                                        onChange={(e) => field.onChange(e.target.value)}
                                        autoComplete={field.autoComplete}
                                        required={isPasswordDirty}
                                        aria-describedby="barber-password-help barber-password-feedback"
                                        className="w-full bg-white/[0.04] border border-white/10 rounded-sm px-10 py-2.5 text-ivory placeholder:text-ivory-dim/40 focus:outline-none focus:border-gold/50 focus:bg-white/[0.06] transition-all text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setVisiblePasswords(prev => ({ ...prev, [field.id]: !prev[field.id] }))}
                                        aria-label={`${visiblePasswords[field.id] ? 'Hide' : 'Show'} ${field.label.toLowerCase()}`}
                                        aria-pressed={Boolean(visiblePasswords[field.id])}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-gold"
                                    >
                                        {visiblePasswords[field.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        ))}
                        <p
                            id="barber-password-feedback"
                            aria-live="polite"
                            className={`min-h-4 text-[11px] ${passwordError ? 'text-red-400' : 'text-amber-300'}`}
                        >
                            {passwordError || (isPasswordDirty ? 'Unsaved password change' : '')}
                        </p>
                    </fieldset>}
                </form>
            </div>

            <ImageCropModal
                isOpen={isCropOpen}
                imageSrc={cropImageSrc}
                onCropComplete={handleCropComplete}
                onClose={() => {
                    setIsCropOpen(false);
                    setCropImageSrc(null);
                }}
            />
        </Modal>
    );
};
