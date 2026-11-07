import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { KeyRound, Lock, Eye, EyeOff, Loader2, Check, AlertTriangle, Mail, ArrowRight, RefreshCw } from 'lucide-react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';
import { api } from '@/config/api';

export interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  changePasswordEndpoint?: string;
  requestCodeEndpoint?: string;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  changePasswordEndpoint = '/api/auth/change-password',
  requestCodeEndpoint = '/api/auth/change-password/request-code',
}) => {
  const { user, logout } = useAuth() as any;
  const { addToast } = useToast();
  const navigate = useNavigate();

  const userRole = String(user?.role || '').toLowerCase();
  const isCustomer = !userRole || userRole === 'customer';

  // Step 1: Password inputs, Step 2: Confirmation code input (for customer OTP flow)
  const [step, setStep] = useState<1 | 2>(1);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // 8-character OTP digits state & refs
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(8).fill(''));
  const otpRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const handleOtpBoxChange = (index: number, val: string) => {
    const cleaned = val.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase();
    const updated = [...otpDigits];
    updated[index] = cleaned;
    setOtpDigits(updated);
    setConfirmationCode(updated.join(''));

    if (cleaned && index < 7) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpBoxKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpBoxPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase().split('');
    if (pasted.length === 0) return;

    const updated = Array(8).fill('');
    pasted.forEach((char, idx) => {
      if (idx < 8) updated[idx] = char;
    });
    setOtpDigits(updated);
    setConfirmationCode(updated.join(''));

    const nextIndex = Math.min(pasted.length, 7);
    otpRefs.current[nextIndex]?.focus();
  };

  // Password Strength State (matching Register UI requirements)
  const [passwordScore, setPasswordScore] = useState(0);
  const [passwordFeedback, setPasswordFeedback] = useState<string[]>([]);
  const [requirements, setRequirements] = useState({
    length: false,
    context: false,
    different: false,
    match: false,
  });

  const evaluatePassword = async (pass: string, currPass: string, confPass: string) => {
    const userInputs = [
      user?.username,
      user?.first_name,
      user?.last_name,
      user?.email?.split('@')[0],
      'password',
    ].filter(Boolean) as string[];

    try {
      const zxcvbnModule = await import('zxcvbn');
      const zxcvbn = (zxcvbnModule.default || zxcvbnModule) as any;
      const result = zxcvbn(pass, userInputs);
      setPasswordScore(result.score);
      setPasswordFeedback(result.feedback?.suggestions || []);
    } catch (err) {
      console.error('Failed to load zxcvbn dynamically:', err);
    }

    const lengthValid = pass.length >= 12 && pass.length <= 128;
    const lowerPass = pass.toLowerCase();
    const contextWords = userInputs.map((w) => String(w).toLowerCase()).filter((w) => w.length >= 3);
    const contextValid = !contextWords.some((word) => lowerPass.includes(word));
    const differentValid = !currPass || pass !== currPass;
    const matchValid = !confPass || pass === confPass;

    setRequirements({
      length: lengthValid,
      context: contextValid,
      different: differentValid,
      match: matchValid,
    });
  };

  useEffect(() => {
    if (newPassword) {
      evaluatePassword(newPassword, currentPassword, confirmPassword);
    } else {
      setPasswordScore(0);
      setPasswordFeedback([]);
      setRequirements({
        length: false,
        context: false,
        different: false,
        match: false,
      });
    }
  }, [newPassword, currentPassword, confirmPassword, user]);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Reset form when modal closes/opens
  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setConfirmationCode('');
      setOtpDigits(Array(8).fill(''));
      setIsLoading(false);
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setPasswordScore(0);
      setPasswordFeedback([]);
      setResendCooldown(0);
      setRequirements({
        length: false,
        context: false,
        different: false,
        match: false,
      });
    }
  }, [isOpen]);

  const getStrengthColor = (score: number) => {
    if (score === 0) return 'bg-red-600';
    if (score === 1) return 'bg-red-400';
    if (score === 2) return 'bg-yellow-500';
    if (score === 3) return 'bg-blue-400';
    if (score === 4) return 'bg-green-500';
    return 'bg-gray-700';
  };

  const getStrengthLabel = (score: number) => {
    if (score === 0) return 'Very Weak';
    if (score === 1) return 'Weak';
    if (score === 2) return 'Fair';
    if (score === 3) return 'Strong';
    if (score === 4) return 'Very Strong';
    return '';
  };

  const handleRequestCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!currentPassword) {
      addToast({ type: 'error', message: 'Current password is required.' });
      return;
    }
    if (!requirements.length) {
      addToast({ type: 'error', message: 'New password must be between 12 and 128 characters long.' });
      return;
    }
    if (!requirements.context) {
      addToast({ type: 'error', message: 'New password cannot contain your name, username, or email.' });
      return;
    }
    if (currentPassword === newPassword) {
      addToast({ type: 'error', message: 'New password cannot be the same as your current password.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast({ type: 'error', message: 'New password and confirmation password do not match.' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post(requestCodeEndpoint, { currentPassword });
      addToast({
        type: 'info',
        title: 'Verification Code Sent',
        message: res.data?.message || 'We have sent an 8-character verification code to your email.',
      });
      setStep(2);
      setResendCooldown(60);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Request Failed',
        message: error.response?.data?.error || error.message || 'Failed to send confirmation code.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isCustomer && !confirmationCode.trim()) {
      addToast({ type: 'error', message: 'Please enter the 8-character confirmation code from your email.' });
      return;
    }

    setIsLoading(true);
    try {
      const payload: Record<string, string> = {
        currentPassword,
        newPassword,
      };
      if (isCustomer) {
        payload.confirmationCode = confirmationCode.trim().toLowerCase();
      }

      const response = await api.post(changePasswordEndpoint, payload);

      addToast({
        type: 'success',
        title: 'Password Changed',
        message: response.data?.message || 'Your password has been changed successfully. Please log in with your new password.',
      });

      onClose();
      await logout();
      navigate('/login');
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Change Password Failed',
        message: error.response?.data?.error || error.message || 'Failed to update password.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (isCustomer) {
      if (step === 1) {
        handleRequestCode(e);
      } else {
        handleFinalPasswordChange(e);
      }
    } else {
      handleFinalPasswordChange(e);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 1 ? "Change Password" : "Verify Confirmation Code"}
      size="md"
    >
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {step === 1 ? (
          <div className="space-y-4">
            {/* Current Password */}
            <div>
              <label className="block text-xs font-semibold text-ivory mb-1.5 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-gold" /> Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-charcoal border border-white/10 rounded-sm px-3.5 py-2.5 text-sm text-ivory placeholder-white/20 focus:outline-none focus:border-gold pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory cursor-pointer"
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-xs font-semibold text-ivory mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-gold" /> New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Create a new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-charcoal border border-white/10 rounded-sm px-3.5 py-2.5 text-sm text-ivory placeholder-white/20 focus:outline-none focus:border-gold pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory cursor-pointer"
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Requirements & Strength meter matching Register.tsx */}
              <div
                className={`transition-all duration-500 ease-in-out overflow-hidden ${
                  newPassword ? 'max-h-96 opacity-100 mt-2.5' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="space-y-2 bg-white/[0.02] border border-white/5 rounded-sm p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${getStrengthColor(passwordScore)}`}
                        style={{ width: `${(passwordScore + 1) * 20}%` }}
                      ></div>
                    </div>
                    <span className="text-[10px] text-ivory-dim font-medium uppercase tracking-wider">
                      {getStrengthLabel(passwordScore)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-1 pt-1">
                    <div
                      className={`flex items-center text-xs ${
                        requirements.length ? 'text-green-400' : 'text-ivory-dim'
                      } transition-colors duration-300`}
                    >
                      {requirements.length ? (
                        <Check size={12} className="mr-1.5 text-green-400 shrink-0" />
                      ) : (
                        <div className="w-3 h-3 border border-white/20 rounded-full mr-1.5 shrink-0"></div>
                      )}
                      Min 12 characters (Max 128)
                    </div>

                    <div
                      className={`flex items-center text-xs ${
                        requirements.context ? 'text-green-400' : 'text-ivory-dim'
                      } transition-colors duration-300`}
                    >
                      {requirements.context ? (
                        <Check size={12} className="mr-1.5 text-green-400 shrink-0" />
                      ) : (
                        <div className="w-3 h-3 border border-white/20 rounded-full mr-1.5 shrink-0"></div>
                      )}
                      No name, username, or email
                    </div>

                    {currentPassword && (
                      <div
                        className={`flex items-center text-xs ${
                          requirements.different ? 'text-green-400' : 'text-ivory-dim'
                        } transition-colors duration-300`}
                      >
                        {requirements.different ? (
                          <Check size={12} className="mr-1.5 text-green-400 shrink-0" />
                        ) : (
                          <div className="w-3 h-3 border border-white/20 rounded-full mr-1.5 shrink-0"></div>
                        )}
                        Different from current password
                      </div>
                    )}

                    {confirmPassword && (
                      <div
                        className={`flex items-center text-xs ${
                          requirements.match ? 'text-green-400' : 'text-ivory-dim'
                        } transition-colors duration-300`}
                      >
                        {requirements.match ? (
                          <Check size={12} className="mr-1.5 text-green-400 shrink-0" />
                        ) : (
                          <div className="w-3 h-3 border border-white/20 rounded-full mr-1.5 shrink-0"></div>
                        )}
                        Passwords match
                      </div>
                    )}
                  </div>

                  {passwordFeedback.length > 0 && (
                    <p className="text-xs text-yellow-500/80 italic mt-1 bg-yellow-500/5 p-2 rounded border border-yellow-500/10 animate-fade-in">
                      Tip: {passwordFeedback[0]}
                    </p>
                  )}

                  <p className="text-[10px] text-ivory-dim/50 mt-1 flex items-center">
                    <AlertTriangle size={10} className="mr-1 text-gold/70 shrink-0" />
                    Checked against breached databases and NIST SP 800-63B guidelines.
                  </p>
                </div>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label className="block text-xs font-semibold text-ivory mb-1.5 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-gold" /> Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-charcoal border border-white/10 rounded-sm px-3.5 py-2.5 text-sm text-ivory placeholder-white/20 focus:outline-none focus:border-gold pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory cursor-pointer"
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Step 2: Confirmation Code Verification */
          <div className="space-y-5">
            <div className="p-4 bg-gold/5 border border-gold/20 rounded-sm text-xs text-ivory-dim space-y-2">
              <div className="flex items-center gap-2 text-gold font-semibold">
                <Mail className="w-4 h-4" /> Email Verification Required
              </div>
              <p>
                We sent an 8-character confirmation code to <span className="text-ivory font-mono">{user?.email}</span>. Please enter it below to confirm your password update.
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
                {otpDigits.map((char, index) => (
                  <input
                    key={index}
                    ref={(el) => { otpRefs.current[index] = el; }}
                    type="text"
                    maxLength={1}
                    value={char}
                    onChange={(e) => handleOtpBoxChange(index, e.target.value)}
                    onKeyDown={(e) => handleOtpBoxKeyDown(index, e)}
                    onPaste={handleOtpBoxPaste}
                    className="w-full h-12 sm:h-13 text-center text-lg sm:text-xl font-mono font-bold uppercase bg-charcoal border border-white/15 text-gold focus:border-gold focus:ring-1 focus:ring-gold focus:outline-none transition-all rounded-sm shadow-inner"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-ivory-dim pt-1">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-ivory-dim hover:text-gold transition-colors underline"
              >
                &larr; Back to edit password
              </button>

              <button
                type="button"
                onClick={() => handleRequestCode()}
                disabled={isLoading || resendCooldown > 0}
                className="flex items-center gap-1 text-gold hover:text-gold-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="text-xs px-4 py-2"
          >
            Cancel
          </Button>

          {isCustomer && step === 1 ? (
            <Button
              type="submit"
              disabled={isLoading || !requirements.length || !requirements.context || Boolean(confirmPassword && !requirements.match)}
              className="text-xs px-6 py-2 bg-gold hover:bg-gold-dim text-charcoal font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Sending Code...
                </span>
              ) : (
                <>
                  <span>Next</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isLoading || (step === 1 && (!requirements.length || !requirements.context || Boolean(confirmPassword && !requirements.match))) || (step === 2 && confirmationCode.trim().length < 6)}
              className="text-xs px-6 py-2 bg-gold hover:bg-gold-dim text-charcoal font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Updating...
                </span>
              ) : (
                'Update Password'
              )}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
};

export default ChangePasswordModal;

