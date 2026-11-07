import React, { useState, useRef, useEffect } from 'react';
import { Camera, Loader2, Shield, User, Mail, KeyRound, CheckCircle2, BadgeCheck, Pencil, X, Check, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { validateAvatarFile } from '@/utils/avatar-validation';
import { ChangePasswordModal } from '@/components/common/ChangePasswordModal';
import { ImageCropModal } from '@/components/feedback/ImageCropModal';
import { api } from '@/config/api';

// Mirrors the backend rule in authService.updateProfile.
const NAME_MIN = 2;
const NAME_MAX = 50;

// Keyed by lower-cased role so 'ShopAdmin', 'shopadmin' etc. all match.
const ROLE_LABELS: Record<string, string> = {
  cashier: 'Front Desk Cashier',
  'inventory manager': 'Inventory Manager',
  owner: 'Owner / Shop Admin',
  shopadmin: 'Shop Admin',
  admin: 'Shop Admin',
};

export interface ProfileTabProps {
  /** Rendered inside AccountSettingsModal: no page width cap or bottom padding. */
  isModal?: boolean;
  className?: string;
}

const ReadOnlyField: React.FC<{ label: string; icon: React.ElementType; value: React.ReactNode; hint?: string }> = ({
  label,
  icon: Icon,
  value,
  hint,
}) => (
  <div className="space-y-1.5">
    <span className="block text-[11px] font-bold uppercase tracking-wider text-ivory-dim">{label}</span>
    <div className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-charcoal px-3.5 text-sm text-ivory">
      <Icon className="h-4 w-4 shrink-0 text-gold/70" />
      <span className="min-w-0 truncate">{value}</span>
    </div>
    {hint && <p className="text-[11px] text-ivory-dim/70">{hint}</p>}
  </div>
);

export const ProfileTab: React.FC<ProfileTabProps> = ({ isModal = false, className = '' }) => {
  const { user, refetchMe, role } = useAuth() as any;
  const { addToast } = useToast();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

  const savedName = user?.username || '';
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(savedName);
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (!isEditingName) setNameDraft(savedName);
  }, [savedName, isEditingName]);

  const trimmedName = nameDraft.trim();
  const nameError =
    trimmedName.length < NAME_MIN
      ? `Name must be at least ${NAME_MIN} characters.`
      : trimmedName.length > NAME_MAX
        ? `Name must be ${NAME_MAX} characters or fewer.`
        : null;
  const canSaveName = isEditingName && !nameError && trimmedName !== savedName && !isSavingName;

  const handleSaveName = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!canSaveName) return;
    setIsSavingName(true);
    try {
      await api.put('/api/auth/profile', { name: trimmedName });
      await refetchMe();
      setIsEditingName(false);
      addToast({ type: 'success', title: 'Account updated', message: 'Your display name was saved.', duration: 4000 });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Name not saved',
        message: err?.response?.data?.error || err?.response?.data?.message || 'Please try again.',
        duration: 4000,
      });
    } finally {
      setIsSavingName(false);
    }
  };

  const cancelNameEdit = () => {
    setNameDraft(savedName);
    setIsEditingName(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      addToast({ type: 'error', title: 'Invalid Avatar', message: validationError, duration: 4000 });
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

  const handleCropComplete = async (croppedBlob: Blob, localPreviewUrl: string) => {
    setIsCropOpen(false);
    setIsUploading(true);
    setPreviewUrl(localPreviewUrl);

    try {
      const formData = new FormData();
      formData.append('avatar', croppedBlob, 'avatar.jpg');

      const { data } = await api.post('/api/auth/profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const uploadedUrl = data.profilePicture || data.profile_picture;
      setPreviewUrl(uploadedUrl);
      await refetchMe();

      addToast({ type: 'success', title: 'Success', message: 'Profile picture updated successfully.', duration: 4000 });
    } catch (err: any) {
      console.error('[Staff ProfileTab] Upload error:', err);
      const serverError = err.response?.data;
      const message =
        serverError?.code === 'AVATAR_TOO_LARGE' || err.response?.status === 413
          ? 'Avatar must be 5 MB or smaller.'
          : serverError?.error || err.message || 'Failed to upload profile picture. Please try again.';
      addToast({ type: 'error', title: 'Upload Failed', message, duration: 4000 });
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const rawPic = user?.profile_picture || (user as any)?.profilePicture;
  const displayImage =
    previewUrl ||
    (rawPic && !rawPic.includes('${')
      ? rawPic.startsWith('http')
        ? rawPic
        : `${import.meta.env.VITE_API_URL || ''}/uploads/profiles/${rawPic}`
      : null);

  const displayName = savedName || (user as any)?.first_name || user?.email?.split('@')[0] || 'Staff Member';
  const rawRole = role || user?.role || '';
  const roleDisplay = ROLE_LABELS[String(rawRole).toLowerCase()] || rawRole || 'Staff Member';

  return (
    <div className={`mx-auto w-full space-y-6 animate-fade-in ${isModal ? '' : 'max-w-4xl pb-12'} ${className}`}>
      {/* Identity hero */}
      <section className="relative overflow-hidden rounded-xl border border-white/10 bg-charcoal-light">
        <div className="relative h-24 overflow-hidden bg-gradient-to-r from-gold/25 via-gold/10 to-transparent sm:h-28">
          <div className="absolute inset-0 bg-texture opacity-30 pointer-events-none" />
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-[70px] pointer-events-none" />
        </div>

        <div className="relative px-5 pb-6 sm:px-8">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
            <div className="relative -mt-12 shrink-0 sm:-mt-14">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-4 border-charcoal-light bg-gradient-to-br from-gold/30 to-gold/5 font-serif text-3xl font-bold text-gold shadow-2xl ring-1 ring-gold/40 sm:h-28 sm:w-28">
                {displayImage ? (
                  <img src={displayImage} alt="Profile" width={112} height={112} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
                {isUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
                    <Loader2 className="h-7 w-7 animate-spin text-white" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                aria-label="Change profile picture"
                className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full border border-gold/50 bg-charcoal text-gold shadow-lg transition hover:bg-gold hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Camera className="h-4 w-4" />
              </button>
            </div>

            <div className="w-full min-w-0 flex-1 pb-1">
              <h2 className="[overflow-wrap:anywhere] font-serif text-2xl font-bold text-ivory sm:truncate sm:text-3xl">{displayName}</h2>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-bold uppercase tracking-[0.15em] text-gold">
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {roleDisplay}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-semibold text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Active
                </span>
              </div>
              {user?.email && <p className="mt-2 truncate text-sm text-ivory-dim">{user.email}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* Account details */}
      <section className="rounded-xl border border-white/10 bg-charcoal-light p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-full border border-gold/20 bg-gold/10 p-2.5">
            <User className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-ivory">Account Details</h3>
            <p className="mt-0.5 text-xs text-ivory-dim">Update how your name appears across the system.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <form onSubmit={handleSaveName} className="space-y-1.5 md:col-span-2">
            <label htmlFor="staff-display-name" className="block text-[11px] font-bold uppercase tracking-wider text-ivory-dim">
              Display Name
            </label>
            {isEditingName ? (
              <>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="staff-display-name"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') cancelNameEdit(); }}
                    maxLength={NAME_MAX + 10}
                    autoFocus
                    disabled={isSavingName}
                    aria-invalid={Boolean(nameError)}
                    aria-describedby="staff-display-name-hint"
                    className="min-h-11 w-full flex-1 rounded-lg border border-white/10 bg-charcoal px-3.5 text-sm text-ivory outline-none transition-colors placeholder:text-ivory-dim/50 focus:border-gold/60 disabled:opacity-60"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={!canSaveName}
                      className="!px-4 !py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSavingName ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      {isSavingName ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={cancelNameEdit}
                      disabled={isSavingName}
                      className="!px-3 !py-2 text-xs text-ivory-dim hover:text-ivory"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </div>
                <p id="staff-display-name-hint" className={`text-[11px] ${nameError && trimmedName ? 'text-red-300' : 'text-ivory-dim/70'}`}>
                  {nameError && trimmedName ? nameError : `${NAME_MIN}–${NAME_MAX} characters.`}
                </p>
              </>
            ) : (
              <div className="flex min-h-11 items-center gap-3 rounded-lg border border-white/10 bg-charcoal pl-3.5 pr-1.5 text-sm text-ivory">
                <User className="h-4 w-4 shrink-0 text-gold/70" />
                <span className="min-w-0 flex-1 truncate">{savedName || 'Not set'}</span>
                <button
                  type="button"
                  onClick={() => setIsEditingName(true)}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-xs font-semibold text-gold transition hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              </div>
            )}
          </form>

          <ReadOnlyField
            label="Email Address"
            icon={Mail}
            value={user?.email || 'Not available'}
            hint="Used to sign in. Ask an Admin to change it."
          />
          <ReadOnlyField label="Role" icon={Shield} value={roleDisplay} hint="Assigned by an Admin." />
        </div>
      </section>

      {/* Security */}
      <section className="rounded-xl border border-white/10 bg-charcoal-light p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <div className="rounded-full border border-gold/20 bg-gold/10 p-2.5">
            <Shield className="h-5 w-5 text-gold" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-bold text-ivory">Security</h3>
            <p className="mt-0.5 text-xs text-ivory-dim">Keep your sign-in credentials up to date.</p>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-4 rounded-lg border border-white/10 bg-charcoal p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-gold" />
            <div>
              <p className="text-sm font-bold text-ivory">Password</p>
              <p className="mt-0.5 max-w-md text-xs text-ivory-dim">
                Confirm your current password, then choose a new one.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setIsPasswordModalOpen(true)}
            className="self-start whitespace-nowrap !px-5 !py-2.5 text-xs sm:self-auto"
          >
            Change Password
          </Button>
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs text-ivory-dim">
          <LogOut className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/80" />
          Changing your password signs you out of every device. Sign in again with your new password.
        </p>
      </section>

      <ChangePasswordModal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} />

      <ImageCropModal
        isOpen={isCropOpen}
        imageSrc={cropImageSrc}
        onCropComplete={handleCropComplete}
        onClose={() => {
          setIsCropOpen(false);
          setCropImageSrc(null);
        }}
      />
    </div>
  );
};

export default ProfileTab;
