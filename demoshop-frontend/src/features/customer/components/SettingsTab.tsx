import React, { useState, useEffect } from 'react';
import { Bell, Mail, Shield, KeyRound, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { api } from '@/config/api';
import { useAuth } from '@/components/auth/AuthContext';
import { useToast } from '@/components/feedback/ToastContext';
import { supabase } from '@/config/supabaseClient';

interface SettingsTabProps {
  setActiveTab: (tab: string) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = () => {
  const { clearAuth } = useAuth();
  const { addToast } = useToast();

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isGoogle, setIsGoogle] = useState<boolean>(false);
  const [hasPassword, setHasPassword] = useState<boolean>(true);
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState<boolean>(true);
  const [isUpdatingPreferences, setIsUpdatingPreferences] = useState<boolean>(false);

  // Account deletion states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState<string>('');
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/api/customers/profile');
      if (response.data) {
        setIsGoogle(Boolean(response.data.is_google));
        setHasPassword(Boolean(response.data.has_password));
        if (typeof response.data.email_notifications_enabled === 'boolean') {
          setEmailNotificationsEnabled(response.data.email_notifications_enabled);
        }
      }
    } catch (err) {
      console.warn('Failed to load profile for password status in settings:', err);
    }
  };

  const handleToggleEmailNotifications = async (enabled: boolean) => {
    // Optimistic UI update
    setEmailNotificationsEnabled(enabled);
    setIsUpdatingPreferences(true);

    try {
      await api.patch('/api/customer/preferences', { email_notifications_enabled: enabled });
      addToast({
        type: 'success',
        title: 'Preferences Saved',
        message: `Email notifications ${enabled ? 'enabled' : 'disabled'}.`,
        duration: 4000,
      });
    } catch (err) {
      // Fallback try PUT if PATCH fails
      try {
        await api.put('/api/customer/preferences', { email_notifications_enabled: enabled });
        addToast({
          type: 'success',
          title: 'Preferences Saved',
          message: `Email notifications ${enabled ? 'enabled' : 'disabled'}.`,
          duration: 4000,
        });
      } catch (putErr) {
        console.error('Failed to update email notification preferences:', putErr);
        setEmailNotificationsEnabled(!enabled);
        addToast({
          type: 'error',
          title: 'Update Failed',
          message: 'Unable to save notification preferences. Please try again.',
          duration: 5000,
        });
      }
    } finally {
      setIsUpdatingPreferences(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmationText !== 'DELETE' || isDeletingAccount) return;

    setIsDeletingAccount(true);
    try {
      await api.delete('/api/customer/account');

      try {
        await supabase.auth.signOut();
      } catch {
        // Continue with local cleanup even if remote auth logout fails
      }

      localStorage.clear();
      sessionStorage.clear();
      clearAuth();

      addToast({
        type: 'info',
        title: 'Account Deleted',
        message: 'Your account has been deleted. Thank you for choosing DemoShop Barbershop.',
        duration: 6000,
      });

      window.location.replace('/');
    } catch (err: any) {
      console.error('Failed to delete account:', err);
      addToast({
        type: 'error',
        title: 'Account Deletion Failed',
        message:
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Unable to complete account deletion. Please try again.',
        duration: 6000,
      });
      setIsDeletingAccount(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <div className="space-y-6 sm:space-y-8 animate-fade-in w-full pb-6 sm:pb-8">
      {/* Notifications */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-3 sm:gap-4 px-1">
          <div className="p-2 sm:p-3 bg-gold/10 rounded-full border border-gold/20">
            <Bell className="w-5 h-5 sm:w-6 sm:h-6 text-gold" />
          </div>
          <h3 className="text-lg sm:text-2xl font-serif font-bold text-ivory">Notifications</h3>
        </div>

        <div className="bg-charcoal-light/50 backdrop-blur-sm border border-white/5 p-4 sm:p-8 rounded-xl shadow-lg">
          <div className="flex items-center justify-between gap-4 p-4 sm:p-6 bg-white/5 rounded-lg border border-white/5">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <Mail className="w-4 h-4 sm:w-5 sm:h-5 text-ivory-dim shrink-0" />
              <div>
                <p className="text-sm sm:text-sm font-bold text-ivory">Email Notifications</p>
                <p className="text-xs sm:text-xs text-ivory-dim font-light leading-snug">
                  Receive real-time email updates when your reservation is confirmed, declined, or updated by the cashier.
                </p>
              </div>
            </div>
            <label
              className={`relative inline-flex items-center ${
                isUpdatingPreferences ? 'opacity-60 cursor-wait' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only peer"
                checked={emailNotificationsEnabled}
                disabled={isUpdatingPreferences}
                onChange={(e) => handleToggleEmailNotifications(e.target.checked)}
              />
              <div className="w-10 h-5 sm:w-11 sm:h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 sm:after:h-5 sm:after:w-5 after:transition-all peer-checked:bg-gold"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Security */}
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center gap-3 sm:gap-4 px-1">
          <div className="p-2 sm:p-3 bg-gold/10 rounded-full border border-gold/20">
            <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-gold" />
          </div>
          <h3 className="text-lg sm:text-2xl font-serif font-bold text-ivory">Security</h3>
        </div>

        <div className="bg-white/[0.03] border border-white/10 p-4 sm:p-8 rounded-xl">
          {/* Google Accounts: Show Google Account info. Manual Email Accounts: Show Change Password */}
          {isGoogle ? (
            <div className="flex justify-between items-center gap-3">
              <div>
                <p className="text-sm font-bold text-ivory">Authentication</p>
                <p className="text-xs text-ivory-dim font-light">
                  Signed in via Google. Password management is handled by your Google account.
                </p>
              </div>
              <span className="text-xs py-1.5 px-3 rounded bg-white/5 border border-white/10 text-gold font-medium">
                Google Account
              </span>
            </div>
          ) : hasPassword ? (
            <div className="flex flex-col gap-3 sm:gap-4">
              <div>
                <p className="flex items-center gap-1.5 text-sm sm:text-sm font-bold text-ivory">
                  <KeyRound className="w-3.5 h-3.5 text-gold" />
                  Password
                </p>
                <p className="text-xs sm:text-xs text-ivory-dim font-light leading-snug">
                  Manage your password with two-step email verification.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setIsPasswordModalOpen(true)}
                className="w-full sm:w-auto text-xs sm:text-xs py-2.5 px-3 sm:px-5 min-w-[100px] sm:min-w-[140px] whitespace-nowrap !tracking-widest hover:!tracking-widest hover:scale-[0.98] border-white/10 text-center hover:border-gold hover:text-gold transition-all"
              >
                Change Password
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-3 sm:space-y-4">
        <h3 className="px-1 text-lg sm:text-xl font-serif font-bold text-red-400">Danger Zone</h3>
        <div className="bg-red-500/5 border border-red-500/20 p-4 sm:p-8 rounded-xl">
          <p className="text-xs sm:text-sm text-ivory-dim mb-5 sm:mb-6 max-w-lg leading-relaxed">
            Once you delete your account, all your data including reservation history will be permanently erased. This action cannot be undone.
          </p>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmationText('');
              setIsDeleteModalOpen(true);
            }}
            className="text-red-400 border border-red-400/30 hover:bg-red-500/10 hover:border-red-400/60 px-5 sm:px-6 py-2.5 sm:py-3 rounded text-xs sm:text-sm font-bold uppercase tracking-widest transition-colors cursor-pointer"
          >
            Delete Account
          </button>
        </div>
      </div>

      {/* Two-Step Account Deletion Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeletingAccount) {
            setIsDeleteModalOpen(false);
            setDeleteConfirmationText('');
          }
        }}
        title="Delete Account"
        size="sm"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setDeleteConfirmationText('');
              }}
              disabled={isDeletingAccount}
              className="text-xs py-2 px-4 border-white/10 text-ivory-dim hover:text-ivory"
            >
              Cancel
            </Button>
            <button
              type="button"
              onClick={handleConfirmDeleteAccount}
              disabled={deleteConfirmationText !== 'DELETE' || isDeletingAccount}
              className="text-xs py-2 px-5 font-bold uppercase tracking-wider rounded bg-red-600 hover:bg-red-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {isDeletingAccount ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Deleting Account...
                </span>
              ) : (
                'Permanently Delete Account'
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 p-3.5 rounded bg-red-500/10 border border-red-500/20 text-red-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <strong className="font-semibold block mb-1 text-red-200">Warning: This action is permanent!</strong>
              Your profile information will be anonymized, your login credentials revoked, active sessions cleared, and access permanently revoked.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-ivory-dim">
              To confirm, type <span className="font-mono text-red-400 font-bold">DELETE</span> in the field below:
            </label>
            <input
              type="text"
              value={deleteConfirmationText}
              onChange={(e) => setDeleteConfirmationText(e.target.value)}
              disabled={isDeletingAccount}
              placeholder="Type DELETE to confirm"
              className="w-full px-3 py-2.5 rounded bg-black/40 border border-white/15 text-ivory text-sm focus:outline-none focus:border-red-500/60 focus:ring-1 focus:ring-red-500/40 font-mono"
            />
          </div>
        </div>
      </Modal>

      {/* Change Password Modal (Only for manual accounts) */}
      {!isGoogle && (
        <ChangePasswordModal
          isOpen={isPasswordModalOpen}
          onClose={() => setIsPasswordModalOpen(false)}
        />
      )}
    </div>
  );
};
