import React, { useState, useEffect, useRef, KeyboardEvent, ClipboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Eye, EyeOff, CheckCircle, AlertTriangle, Check, X } from 'lucide-react';
import { api } from '@/config/api';
import { useShopSettings } from '@/hooks/useShopSettings';

type Step = 'REQUEST' | 'VERIFY' | 'RESET' | 'DONE';

export const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();

  // Wizard flow step state - strictly in memory
  const [step, setStep] = useState<Step>('REQUEST');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { settings } = useShopSettings();
  const heroImageUrl = settings?.website?.heroImageUrl?.trim();

  // Verification & cooldown states
  const [cooldown, setCooldown] = useState(0);
  const [resendsCount, setResendsCount] = useState(1); // Track resends (max 3 sends, first request is 1)

  // Password requirements real-time checks
  const [passwordScore, setPasswordScore] = useState(0);
  const [requirements, setRequirements] = useState({
    length: false,
    context: false,
  });

  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Count down resend cooldown timer
  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  // Evaluate password strength using zxcvbn dynamically
  useEffect(() => {
    const evaluatePassword = async () => {
      const emailLocalPart = email ? email.split('@')[0] : '';
      const userInputs = [emailLocalPart, 'password'].filter(Boolean);

      try {
        const zxcvbnModule = await import('zxcvbn');
        const zxcvbn = (zxcvbnModule.default || zxcvbnModule) as any;
        const result = zxcvbn(password, userInputs);
        setPasswordScore(result.score);
      } catch (err) {
        console.error('Failed to load zxcvbn dynamically:', err);
      }

      const lengthValid = password.length >= 12 && password.length <= 128;
      const lowerPass = password.toLowerCase();
      const contextWords = userInputs.map(w => w.toLowerCase()).filter(w => w.length >= 3);
      const contextValid = !contextWords.some(word => lowerPass.includes(word));

      setRequirements({
        length: lengthValid,
        context: contextValid,
      });
    };

    if (step === 'RESET') {
      evaluatePassword();
    }
  }, [password, email, step]);

  // Auto-focus first digit of OTP
  useEffect(() => {
    if (step === 'VERIFY') {
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    }
  }, [step]);

  // Stage 1: Request Password Reset
  const handleRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/auth/forgot-password/request', { email });
      setSuccess(response.data?.message || 'If that email exists, a code has been sent.');
      setCooldown(60);
      setStep('VERIFY');
    } catch (err: any) {
      setError(err.response?.data?.error || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP
  const handleResend = async () => {
    if (cooldown > 0 || !email) return;
    if (resendsCount >= 3) {
      setError('Maximum resend attempts exceeded. Please try again later.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/auth/forgot-password/request', { email });
      setSuccess(response.data?.message || 'Verification code resent.');
      setCooldown(60);
      setResendsCount(prev => prev + 1);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Input event handlers
  const handleOtpChange = (index: number, value: string) => {
    if (value && isNaN(Number(value))) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only take the last character
    setOtp(newOtp);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6).split('');
    if (pastedData.length === 0) return;

    const newOtp = [...otp];
    pastedData.forEach((value, index) => {
      if (index < 6 && !isNaN(Number(value))) {
        newOtp[index] = value;
      }
    });
    setOtp(newOtp);

    const nextIndex = Math.min(pastedData.length, 5);
    otpRefs.current[nextIndex]?.focus();
  };

  // Stage 2: Verify OTP
  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const verificationCode = otp.join('');
    if (verificationCode.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      const response = await api.post('/api/auth/forgot-password/verify', { email, code: verificationCode });
      if (!response.data?.resetToken) {
        throw new Error('The reset session could not be created. Please request a new code.');
      }
      setResetToken(response.data.resetToken);
      setStep('RESET');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Stage 3: Reset Password
  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requirements.length || !requirements.context) {
      setError('Password does not meet validation criteria.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setIsLoading(true);

    try {
      await api.post('/api/auth/forgot-password/reset', { email, password, resetToken });
      setStep('DONE');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  // Strength colors and labels helper
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

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center relative overflow-hidden px-4 py-20">
      {/* Background Texture Overlay */}
      <div className="absolute inset-0 bg-texture opacity-50"></div>
      {/* Ambient Gradient Fallback */}
      <div
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 35%, rgba(212, 175, 55, 0.08) 0%, rgba(26, 26, 26, 0.95) 70%, #121212 100%)',
        }}
      />
      {/* Dynamic Background Image Overlay */}
      {heroImageUrl && (
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-charcoal/90 z-10"></div>
          <img
            src={heroImageUrl}
            alt="Background"
            className="w-full h-full object-cover opacity-20 grayscale"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      <div className="relative z-10 w-full max-w-md bg-charcoal-light/80 backdrop-blur-md border border-white/10 p-8 md:p-12 shadow-2xl animate-fade-in">
        
        {/* Header Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/demoshop_logo.png" alt="Logo" className="h-16 w-auto opacity-90" />
          </div>

          {step === 'REQUEST' && (
            <>
              <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Reset Password</h2>
              <p className="text-ivory-dim text-sm font-light">Enter your email and we'll send you an OTP code.</p>
            </>
          )}

          {step === 'VERIFY' && (
            <>
              <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Enter OTP Code</h2>
              <p className="text-ivory-dim text-sm font-light">
                Please enter the 6-digit code sent to <span className="text-gold break-all">{email}</span>.
              </p>
            </>
          )}

          {step === 'RESET' && (
            <>
              <h2 className="text-3xl font-serif font-bold text-ivory mb-2">New Password</h2>
              <p className="text-ivory-dim text-sm font-light">Create a strong password for your account.</p>
            </>
          )}

          {step === 'DONE' && (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Password Reset!</h2>
              <p className="text-ivory-dim text-sm font-light">Your password has been successfully updated.</p>
            </>
          )}
        </div>

        {/* Error Alert Block */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 text-sm p-3 rounded mb-6 flex items-start gap-2 animate-fade-in">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Wizard Form Stages */}
        {step === 'REQUEST' && (
          <form onSubmit={handleRequestSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Email Address</label>
              <input
                type="email"
                id="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="portfolio@example.invalid"
                className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20"
              />
            </div>
            <Button type="submit" variant="primary" className="w-full justify-center" disabled={isLoading}>
              {isLoading ? 'Sending...' : 'Request Verification Code'}
            </Button>
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-xs text-ivory-dim hover:text-gold transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        {step === 'VERIFY' && (
          <form onSubmit={handleVerifySubmit} className="space-y-6">
            <div className="flex justify-center gap-2">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { otpRefs.current[index] = el; }}
                  type="text"
                  maxLength={1}
                  required
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  onPaste={handleOtpPaste}
                  className="w-12 h-14 text-center text-2xl font-bold bg-charcoal border border-white/10 text-gold focus:border-gold focus:ring-1 focus:ring-gold focus:outline-none transition-all rounded"
                />
              ))}
            </div>

            <Button type="submit" variant="primary" className="w-full justify-center" disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify OTP Code'}
            </Button>

            <div className="flex flex-col items-center space-y-4">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || resendsCount >= 3 || isLoading}
                className="text-ivory-dim text-sm hover:text-gold transition-colors disabled:opacity-50 disabled:hover:text-ivory-dim mt-2"
              >
                {cooldown > 0 
                  ? `Resend code in ${cooldown}s` 
                  : resendsCount >= 3 
                    ? 'Resends limit reached' 
                    : 'Didn\'t receive code? Resend'}
              </button>
              <button
                type="button"
                onClick={() => setStep('REQUEST')}
                className="text-xs text-ivory-dim opacity-60 hover:opacity-100 transition-opacity"
              >
                Change Email Address
              </button>
            </div>
          </form>
        )}

        {step === 'RESET' && (
          <form onSubmit={handleResetSubmit} className="space-y-6">
            <div>
              <label htmlFor="password" className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(prev => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-ivory-dim hover:text-gold"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Password Strength Meter */}
            {password && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex justify-between text-xs text-ivory-dim">
                  <span>Strength:</span>
                  <span className="font-bold text-gold">{getStrengthLabel(passwordScore)}</span>
                </div>
                <div className="h-1.5 w-full bg-charcoal rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${getStrengthColor(passwordScore)}`}
                    style={{ width: `${(passwordScore + 1) * 20}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Checklist requirements */}
            <div className="space-y-2 bg-charcoal/40 p-3 border border-white/5 rounded text-sm text-ivory-dim">
              <div className="flex items-center gap-2">
                {requirements.length ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span>12 - 128 characters long</span>
              </div>
              <div className="flex items-center gap-2">
                {requirements.context ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : (
                  <X className="w-4 h-4 text-red-500" />
                )}
                <span>Doesn't contain your email or common words</span>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Confirm New Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(prev => !prev)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-ivory-dim hover:text-gold"
                >
                  {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full justify-center"
              disabled={isLoading || !requirements.length || !requirements.context || password !== confirmPassword}
            >
              {isLoading ? 'Updating Password...' : 'Reset Password'}
            </Button>
          </form>
        )}

        {step === 'DONE' && (
          <div className="space-y-6">
            <Button
              onClick={() => navigate('/login')}
              variant="primary"
              className="w-full justify-center"
            >
              Back to Sign In
            </Button>
          </div>
        )}

      </div>
    </div>
  );
};
