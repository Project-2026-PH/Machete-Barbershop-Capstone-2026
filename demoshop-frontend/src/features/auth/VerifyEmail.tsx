// demoshop-frontend\src\features\auth\VerifyEmail.tsx
import React from 'react';
import { Button } from '@/components/ui/Button';
import { CheckCircle } from 'lucide-react';
import { useVerifyEmail } from '@/hooks/useVerifyEmail';
import { useShopSettings } from '@/hooks/useShopSettings';

export const VerifyEmail: React.FC = () => {
  const {
    code,
    error,
    isLoading,
    showSuccessModal,
    cooldown,
    email,
    inputRefs,
    handleChange,
    handleKeyDown,
    handlePaste,
    handleSubmit,
    handleResend,
    navigate,
  } = useVerifyEmail();

  const { settings } = useShopSettings();
  const heroImageUrl = settings?.website?.heroImageUrl?.trim();

  if (!email) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center text-ivory">
        <div className="text-center">
          <h2 className="text-2xl font-serif text-gold mb-4">Access Denied</h2>
          <p className="mb-6">No email address provided for verification.</p>
          <Button onClick={() => navigate('/register')}>Go to Register</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center relative overflow-hidden px-4 py-20">
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
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <img src="/demoshop_logo.png" alt="Logo" className="h-16 w-auto opacity-90" />
          </div>
          <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Verify Account</h2>
          <p className="text-ivory-dim text-sm font-light">Enter the 6-digit code sent to <span className="text-gold">{email}</span></p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 text-sm p-3 rounded mb-6 text-center">
            {error}
          </div>
        )}

        {showSuccessModal ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-8 animate-fade-in">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h3 className="text-2xl font-serif font-bold text-ivory">Email Verified!</h3>
            <p className="text-ivory-dim text-center">Your account is ready. Redirecting you to your dashboard...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex justify-center gap-2">
              {code.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  className="w-12 h-14 text-center text-2xl font-bold bg-charcoal border border-white/10 text-gold focus:border-gold focus:outline-none transition-colors rounded"
                />
              ))}
            </div>

            <Button variant="primary" className="w-full justify-center" disabled={isLoading} type="submit">
              {isLoading ? "Verifying..." : "Verify Email"}
            </Button>

            <div className="flex flex-col items-center space-y-4 mt-6">
              <button
                type="button"
                onClick={handleResend}
                disabled={cooldown > 0 || isLoading}
                className="text-ivory-dim text-sm hover:text-gold transition-colors disabled:opacity-50 disabled:hover:text-ivory-dim mt-4"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : "Didn't receive the code? Resend"}
              </button>

              <button
                type="button"
                onClick={() => navigate('/register')}
                className="text-ivory-dim text-xs opacity-60 hover:opacity-100 transition-opacity"
              >
                Back to Registration
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
