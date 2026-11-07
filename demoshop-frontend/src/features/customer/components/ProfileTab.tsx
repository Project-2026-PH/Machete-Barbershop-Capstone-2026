import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { User, Mail, Camera, Loader2, ChevronRight, AlertTriangle, KeyRound, RefreshCw, LogOut } from 'lucide-react';
import { api } from '@/config/api';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';
import { validateAvatarFile } from '@/utils/avatar-validation';
import { ImageCropModal } from '@/components/feedback/ImageCropModal';
import { Modal } from '@/components/feedback/Modal';

import { CustomerReliabilityBadge } from '@/features/admin/components/Management/CustomerReliabilityBadge';
import { customerCache, makeCacheKey } from '@/features/customer/services/customer-cache';
import type { CustomerBookingStats } from '@demoshop/shared-types';

interface ProfileTabProps {
  userData: any;
  handleSaveProfile: (e: any) => Promise<any> | void;
  onLogout?: () => void;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ userData, handleSaveProfile, onLogout }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [isCropOpen, setIsCropOpen] = useState(false);
  const { addToast } = useToast();
  const { refetchMe } = useAuth();

  // Form field states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  // Customer Reliability Stats
  const [reliabilityStats, setReliabilityStats] = useState<CustomerBookingStats | null>(null);

  // Confirmation modal states for saving general profile
  const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Email modal and OTP states
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [newEmailInput, setNewEmailInput] = useState('');
  const [emailModalStep, setEmailModalStep] = useState<1 | 2>(1);
  const [isRequestingEmailCode, setIsRequestingEmailCode] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);
  const [emailOtpDigits, setEmailOtpDigits] = useState<string[]>(Array(8).fill(''));
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);
  const emailOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Email OTP Cooldown countdown
  useEffect(() => {
    if (emailOtpCooldown <= 0) return;
    const timer = setInterval(() => {
      setEmailOtpCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailOtpCooldown]);

  useEffect(() => {
    if (userData) {
      setFirstName(userData.first_name || '');
      setLastName(userData.last_name || '');
      setNewEmailInput(userData.email || '');

      const customerId = userData.user_id || userData.id || userData.customer_id;
      if (customerId) {
        const controller = new AbortController();
        const key = makeCacheKey('default', 'customer-booking-stats', customerId);
        customerCache.fetch<CustomerBookingStats>(
          key,
          'default',
          async (signal) => {
            const res = await api.get<CustomerBookingStats>(`/api/customers/${customerId}/booking-stats`, { signal });
            return res.data;
          },
          { signal: controller.signal },
        )
          .then((stats) => {
            if (stats) setReliabilityStats(stats);
          })
          .catch((err) => {
            if (err?.name !== 'AbortError' && err?.code !== 'ERR_CANCELED') {
              console.warn('[ProfileTab] Could not load booking stats:', err?.message);
            }
          });

        return () => controller.abort();
      }
    }
  }, [userData]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateAvatarFile(file);
    if (validationError) {
      addToast({
        type: 'error',
        title: 'Invalid Avatar',
        message: validationError,
        duration: 4000
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

  const handleCropComplete = async (croppedBlob: Blob, localPreviewUrl: string) => {
    setIsCropOpen(false);
    setIsUploading(true);
    setPreviewUrl(localPreviewUrl);

    try {
      const formData = new FormData();
      formData.append('avatar', croppedBlob, 'avatar.jpg');

      const { data } = await api.post('/api/customers/profile-picture', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPreviewUrl(data.profilePicture);
      await refetchMe();

      addToast({
        type: 'success',
        title: 'Success!',
        message: 'Profile picture updated successfully.',
        duration: 4000
      });
    } catch (err: any) {
      console.error('[ProfileTab] Upload error:', err);
      const serverError = err.response?.data;
      const message = serverError?.code === 'AVATAR_TOO_LARGE' || err.response?.status === 413
        ? 'Avatar must be 5 MB or smaller.'
        : serverError?.error || err.message || 'Failed to upload profile picture. Please try again.';
      addToast({
        type: 'error',
        title: 'Upload Failed',
        message,
        duration: 4000
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: 'First name cannot be empty.',
        duration: 4000
      });
      return;
    }
    setIsConfirmSaveOpen(true);
  };

  const handleExecuteSaveProfile = async () => {
    setIsSaving(true);
    try {
      await handleSaveProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: userData?.email || '',
      });

      addToast({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile details have been saved successfully.',
        duration: 4000
      });
      setIsConfirmSaveOpen(false);
    } catch (err: any) {
      console.error('[ProfileTab] Error saving profile:', err);
      const serverError = err.response?.data;
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: serverError?.error || err.message || 'Unable to update profile. Please try again.',
        duration: 4000
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEmailModal = () => {
    setNewEmailInput(userData?.email || '');
    setEmailModalStep(1);
    setEmailOtpDigits(Array(8).fill(''));
    setIsEmailModalOpen(true);
  };

  const handleCloseEmailModal = () => {
    if (!isRequestingEmailCode && !isVerifyingEmailOtp) {
      setIsEmailModalOpen(false);
      setEmailModalStep(1);
      setEmailOtpDigits(Array(8).fill(''));
    }
  };

  const handleRequestEmailCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = newEmailInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      addToast({
        type: 'error',
        title: 'Invalid Email',
        message: 'Please enter a valid email address.',
        duration: 4000
      });
      return;
    }
    if (cleanEmail === (userData?.email || '').toLowerCase()) {
      addToast({
        type: 'info',
        title: 'No Changes',
        message: 'The email address is identical to your current one.',
        duration: 3000
      });
      return;
    }

    setIsRequestingEmailCode(true);
    try {
      const res = await api.post('/api/customers/change-email/request-code', {
        newEmail: cleanEmail,
      });

      addToast({
        type: 'success',
        title: 'Verification Code Sent',
        message: res.data?.message || `A verification code was sent to ${cleanEmail}`,
        duration: 5000,
      });

      setEmailOtpCooldown(res.data?.cooldown || 60);
      setEmailOtpDigits(Array(8).fill(''));
      setEmailModalStep(2);
      setTimeout(() => emailOtpRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      console.error('[ProfileTab] Error requesting email change code:', err);
      const serverError = err.response?.data;
      addToast({
        type: 'error',
        title: 'Request Failed',
        message: serverError?.error || err.message || 'Unable to send verification code. Please try again.',
        duration: 4000,
      });
    } finally {
      setIsRequestingEmailCode(false);
    }
  };

  const handleEmailOtpBoxChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase();
    const updated = [...emailOtpDigits];
    updated[index] = cleaned;
    setEmailOtpDigits(updated);

    if (cleaned && index < 7) {
      emailOtpRefs.current[index + 1]?.focus();
    }
  };

  const handleEmailOtpBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !emailOtpDigits[index] && index > 0) {
      emailOtpRefs.current[index - 1]?.focus();
    }
  };

  const handleEmailOtpBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase().split('');
    if (pasted.length === 0) return;

    const updated = Array(8).fill('');
    pasted.forEach((char, idx) => {
      if (idx < 8) updated[idx] = char;
    });
    setEmailOtpDigits(updated);

    const nextIndex = Math.min(pasted.length, 7);
    emailOtpRefs.current[nextIndex]?.focus();
  };

  const handleVerifyEmailChange = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanEmail = newEmailInput.trim().toLowerCase();
    const code = emailOtpDigits.join('').trim();
    if (code.length < 8) {
      addToast({
        type: 'error',
        title: 'Incomplete Code',
        message: 'Please enter all 8 characters of your verification code.',
        duration: 4000,
      });
      return;
    }

    setIsVerifyingEmailOtp(true);
    try {
      const res = await api.post('/api/customers/change-email/verify', {
        newEmail: cleanEmail,
        confirmationCode: code,
      });

      addToast({
        type: 'success',
        title: 'Email Updated',
        message: res.data?.message || 'Your email address has been updated successfully.',
        duration: 4000,
      });

      if (refetchMe) {
        await refetchMe();
      }

      setIsEmailModalOpen(false);
      setEmailModalStep(1);
      setEmailOtpDigits(Array(8).fill(''));
    } catch (err: any) {
      console.error('[ProfileTab] Error verifying email change:', err);
      const serverError = err.response?.data;
      addToast({
        type: 'error',
        title: 'Verification Failed',
        message: serverError?.error || err.message || 'Invalid verification code. Please try again.',
        duration: 4000,
      });
    } finally {
      setIsVerifyingEmailOtp(false);
    }
  };

  const displayImage = previewUrl || (
    (userData?.profile_picture || userData?.profilePicture) && !(userData.profile_picture || userData.profilePicture).includes('${')
      ? ((userData.profile_picture || userData.profilePicture).startsWith('http')
          ? (userData.profile_picture || userData.profilePicture)
          : `${import.meta.env.VITE_API_URL || ''}/uploads/profiles/${userData.profile_picture || userData.profilePicture}`)
      : null
  );

  return (
    <div className="space-y-8 animate-fade-in w-full max-w-4xl mx-auto">

      {/* Main Profile Card */}
      <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 rounded-2xl shadow-xl relative overflow-hidden">
        
        {/* Top Header Banner with DemoShop Branding */}
        <div className="relative h-52 sm:h-60 w-full bg-gradient-to-b from-gold/15 via-gold/5 to-transparent overflow-hidden border-b border-white/10 flex flex-col items-center justify-start pt-7 sm:pt-9 select-none">
          {/* Subtle Ambient Lighting & Vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold/15 via-transparent to-transparent pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-charcoal-light/95 pointer-events-none" />
          <div className="absolute -top-16 left-1/2 -translate-x-1/2 w-[32rem] h-40 bg-gold/15 blur-3xl pointer-events-none rounded-full" />

          {/* Foreground Brand Header - Enlarged */}
          <div className="relative z-10 flex items-center justify-center gap-4 sm:gap-5">
            <img
              src="/demoshop_logo.png"
              alt="DemoShop Logo"
              className="h-16 sm:h-20 w-auto object-contain drop-shadow-[0_4px_16px_rgba(212,175,55,0.35)]"
            />
            <div className="flex flex-col text-left">
              <span className="font-serif font-black tracking-[0.25em] text-ivory text-2xl sm:text-3xl drop-shadow-md leading-tight">
                DEMOSHOP<span className="text-gold font-serif">'S</span>
              </span>
              <span className="text-xs sm:text-sm uppercase tracking-[0.35em] text-gold font-bold font-sans opacity-95 mt-0.5">
                Barbershop
              </span>
            </div>
          </div>
        </div>

        <div className="px-6 sm:px-12 pb-12">
          {/* Avatar and Info Header */}
          <div className="flex flex-col items-center mb-10 relative z-10 -mt-16 sm:-mt-20">
            <div className="relative group cursor-pointer ring-4 ring-charcoal/90 rounded-full shadow-2xl">
              <input
                type="file"
                ref={fileInputRef}
                accept="image/jpeg,image/png"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 border-2 border-gold/40 flex items-center justify-center text-gold font-serif font-bold text-4xl shadow-2xl overflow-hidden transition-all duration-500 group-hover:border-gold">
                {displayImage ? (
                  <img
                    src={displayImage}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  userData ? (userData.first_name || userData.username || userData.email || '?').charAt(0).toUpperCase() : <Skeleton variant="circle" className="w-full h-full border-none" />
                )}
              </div>
              <div
                className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-sm cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              >
                {isUploading ? (
                  <Loader2 className="w-8 h-8 text-white animate-spin" />
                ) : (
                  <Camera className="w-8 h-8 text-white" />
                )}
              </div>
            </div>

            <h2 className="text-3xl font-serif font-bold text-ivory mt-5 text-center">
              {userData ? `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || userData.email || 'Customer' : <Skeleton variant="text" className="w-48 h-8" />}
            </h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
              {userData ? (
                <>
                  <span className="text-gold text-xs uppercase tracking-[0.2em] font-bold">
                    {userData.membership_tier || 'MEMBER'}
                  </span>
                  {reliabilityStats && (
                    <CustomerReliabilityBadge stats={reliabilityStats} />
                  )}
                </>
              ) : (
                <Skeleton variant="text" className="w-24 h-4" />
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveSubmit} className="space-y-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label htmlFor="firstName" className="block text-xs uppercase tracking-[0.1em] text-ivory-dim font-bold">First Name</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim group-focus-within:text-gold transition-colors" />
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5 pl-12 text-ivory focus:border-gold focus:bg-white/[0.05] focus:outline-none transition-all placeholder-white/20"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="block text-xs uppercase tracking-[0.1em] text-ivory-dim font-bold">Last Name</label>
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim group-focus-within:text-gold transition-colors" />
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3.5 pl-12 text-ivory focus:border-gold focus:bg-white/[0.05] focus:outline-none transition-all placeholder-white/20"
                  />
                </div>
              </div>
            </div>

            {/* Email Field UI matching Reference Design */}
            <div className="space-y-2">
              <label className="block text-xs uppercase tracking-[0.1em] text-ivory-dim font-bold">Email Address</label>
              <div
                role="button"
                tabIndex={0}
                onClick={handleOpenEmailModal}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenEmailModal(); }}
                className="w-full bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-gold/30 rounded-2xl p-4 sm:p-5 flex items-center justify-between cursor-pointer transition-all duration-300 group shadow-sm"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-ivory-dim group-hover:text-gold group-hover:border-gold/30 transition-all shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-ivory-dim/60">EMAIL</div>
                    <div className="text-sm sm:text-base font-medium text-ivory truncate mt-0.5">
                      {userData?.email || 'No email provided'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gold/80 font-medium opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">Change</span>
                  <ChevronRight className="w-5 h-5 text-ivory-dim/40 group-hover:text-gold group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="hidden lg:inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-300 hover:border-red-500/50 transition-all duration-200 text-xs font-semibold uppercase tracking-wider cursor-pointer shadow-sm"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>
              )}
              <Button type="submit" variant="primary" className="min-w-[150px] sm:ml-auto">Save Changes</Button>
            </div>
          </form>
        </div>
      </div>

      {/* Account Session / Logout Section on Desktop Web View */}
      {onLogout && (
        <div className="hidden lg:flex items-center justify-between p-5 mt-6 rounded-2xl bg-charcoal-light/60 border border-white/10 backdrop-blur-md shadow-lg">
          <div className="space-y-0.5 text-left">
            <h3 className="text-sm font-semibold text-ivory">Account Session</h3>
            <p className="text-xs text-ivory-dim">Sign out of your active session on this device.</p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/5 hover:bg-red-500/15 text-red-400 hover:text-red-300 hover:border-red-500/50 transition-all duration-200 text-xs font-semibold uppercase tracking-wider cursor-pointer shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Log Out</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal for Profile Name Update */}
      <Modal
        isOpen={isConfirmSaveOpen}
        onClose={() => { if (!isSaving) setIsConfirmSaveOpen(false); }}
        title="Confirm Profile Changes"
        size="sm"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfirmSaveOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleExecuteSaveProfile}
              disabled={isSaving}
            >
              {isSaving ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </span>
              ) : (
                'Yes, Save Changes'
              )}
            </Button>
          </div>
        }
      >
        <div className="py-2 text-ivory">
          <p className="text-ivory-dim text-sm">
            Are you sure you want to update your profile details?
          </p>
        </div>
      </Modal>

      {/* Change Email Modal */}
      <Modal
        isOpen={isEmailModalOpen}
        onClose={handleCloseEmailModal}
        title={emailModalStep === 1 ? 'Change Email Address' : 'Verify New Email'}
        size="md"
        footer={
          emailModalStep === 1 ? (
            <div className="flex justify-end gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseEmailModal}
                disabled={isRequestingEmailCode}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => handleRequestEmailCode()}
                disabled={isRequestingEmailCode}
              >
                {isRequestingEmailCode ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Sending Code...
                  </span>
                ) : (
                  'Send Verification Code'
                )}
              </Button>
            </div>
          ) : (
            <div className="flex justify-end gap-3 w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEmailModalStep(1)}
                disabled={isVerifyingEmailOtp}
              >
                Back
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => handleVerifyEmailChange()}
                disabled={isVerifyingEmailOtp || emailOtpDigits.join('').length < 8}
              >
                {isVerifyingEmailOtp ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Verifying...
                  </span>
                ) : (
                  'Verify & Change'
                )}
              </Button>
            </div>
          )
        }
      >
        {emailModalStep === 1 ? (
          <form onSubmit={handleRequestEmailCode} className="space-y-4 py-2">
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-ivory-dim">
              Current Email: <span className="text-ivory font-medium ml-1">{userData?.email || 'None'}</span>
            </div>

            <div className="space-y-2">
              <label htmlFor="newEmail" className="block text-xs uppercase tracking-wider text-ivory-dim font-bold">
                New Email Address
              </label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ivory-dim group-focus-within:text-gold transition-colors" />
                <input
                  type="email"
                  id="newEmail"
                  value={newEmailInput}
                  onChange={(e) => setNewEmailInput(e.target.value)}
                  placeholder="Enter new email address"
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 pl-12 text-ivory focus:border-gold focus:bg-white/[0.05] focus:outline-none transition-all placeholder-white/20 text-sm"
                  autoFocus
                />
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-5 py-2">
            <div className="p-4 bg-gold/5 border border-gold/20 rounded-xl text-xs text-ivory-dim space-y-2">
              <div className="flex items-center gap-2 text-gold font-semibold">
                <Mail className="w-4 h-4" /> Email Verification Required
              </div>
              <p>
                We sent an 8-character confirmation code to <span className="text-ivory font-semibold break-all">{newEmailInput.trim().toLowerCase()}</span>. Please enter it below to confirm your new email address.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ivory mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-gold" /> Confirmation Code
                </span>
                <span className="text-[10px] font-mono text-ivory-dim">8-Character Alphanumeric</span>
              </label>

              {/* 8 Individual Character Boxes */}
              <div className="grid grid-cols-8 gap-1.5 sm:gap-2">
                {emailOtpDigits.map((char, index) => (
                  <input
                    key={index}
                    ref={(el) => { emailOtpRefs.current[index] = el; }}
                    type="text"
                    maxLength={1}
                    value={char}
                    onChange={(e) => handleEmailOtpBoxChange(index, e.target.value)}
                    onKeyDown={(e) => handleEmailOtpBoxKeyDown(index, e)}
                    onPaste={handleEmailOtpBoxPaste}
                    className="w-full h-11 sm:h-12 text-center text-base sm:text-lg font-mono font-bold uppercase bg-charcoal border border-white/15 text-gold focus:border-gold focus:ring-1 focus:ring-gold focus:outline-none transition-all rounded-lg shadow-inner"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-ivory-dim pt-1">
              <button
                type="button"
                onClick={() => setEmailModalStep(1)}
                className="text-ivory-dim hover:text-gold transition-colors underline cursor-pointer"
              >
                &larr; Back to edit email
              </button>

              <button
                type="button"
                onClick={() => handleRequestEmailCode()}
                disabled={isRequestingEmailCode || emailOtpCooldown > 0}
                className="flex items-center gap-1 text-gold hover:text-gold-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRequestingEmailCode ? 'animate-spin' : ''}`} />
                <span>
                  {emailOtpCooldown > 0
                    ? `Resend code (${emailOtpCooldown}s)`
                    : 'Resend code'}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>

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

