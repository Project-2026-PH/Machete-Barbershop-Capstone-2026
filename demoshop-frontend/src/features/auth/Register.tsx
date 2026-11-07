// demoshop-frontend\src\features\auth\Register.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Eye, EyeOff, Check, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router';
import { useRegister } from '@/hooks/useRegister';
import { useShopSettings } from '@/hooks/useShopSettings';

export const Register: React.FC = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    formData,
    error,
    isLoading,
    passwordScore,
    passwordFeedback,
    requirements,
    handleChange,
    handleRegister,
    getStrengthColor,
    getStrengthLabel,
  } = useRegister();

  const { settings } = useShopSettings();
  const heroImageUrl = settings?.website?.heroImageUrl?.trim();

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
      <div
        className="relative z-10 w-full max-w-md bg-charcoal-light/80 backdrop-blur-md border border-white/10 p-8 md:p-12 shadow-2xl animate-fade-in">
        <div className="text-center mb-10">
          <div className="flex justify-center mb-6">
            <img src="/demoshop_logo.png" alt="Logo" className="h-16 w-auto opacity-90" />
          </div>
          <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Join the Club</h2>
          <p className="text-ivory-dim text-sm font-light">Create an account to book your first cut</p>
        </div>
        {error && (
          <div className="bg-red-500/10 border border-red-500 text-red-500 text-sm p-3 rounded mb-6 text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">First Name</label>
              <input
                name="firstName"
                onChange={handleChange}
                required
                type="text"
                className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Last Name</label>
              <input
                name="lastName"
                onChange={handleChange}
                required
                type="text"
                className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Email Address</label>
            <input
              id="email"
              name="email"
              onChange={handleChange}
              required
              type="email"
              className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20"
              placeholder="portfolio@example.invalid"
              autoComplete="username"
            />
          </div>

          <div className="relative">
            <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Password</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                onChange={handleChange}
                required
                type={showPassword ? "text" : "password"}
                className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20 pr-10"
                placeholder="Create a password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-gold transition-colors"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>

            <div
              className={`transition-all duration-500 ease-in-out overflow-hidden ${formData.password ? 'max-h-96 opacity-100 mt-3' : 'max-h-0 opacity-0'
                }`}
            >
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${getStrengthColor(passwordScore)}`}
                      style={{ width: `${(passwordScore + 1) * 20}%` }}
                    ></div>
                  </div>
                  <span className="text-xs text-ivory-dim font-medium uppercase">{getStrengthLabel(passwordScore)}</span>
                </div>

                <div className="grid grid-cols-1 gap-1">
                  <div className={`flex items-center text-xs ${requirements.length ? 'text-green-400' : 'text-ivory-dim'} transition-colors duration-300`}>
                    {requirements.length ? <Check size={12} className="mr-1.5" /> : <div className="w-3 h-3 border border-white/20 rounded-full mr-1.5"></div>}
                    Min 12 characters (Max 128)
                  </div>
                  <div className={`flex items-center text-xs ${requirements.context ? 'text-green-400' : 'text-ivory-dim'} transition-colors duration-300`}>
                    {requirements.context ? <Check size={12} className="mr-1.5" /> : <div className="w-3 h-3 border border-white/20 rounded-full mr-1.5"></div>}
                    No name or email
                  </div>
                </div>

                {passwordFeedback.length > 0 && (
                  <p className="text-xs text-yellow-500/80 italic mt-1 bg-yellow-500/5 p-2 rounded border border-yellow-500/10 animate-fade-in">
                    Tip: {passwordFeedback[0]}
                  </p>
                )}

                <p className="text-[10px] text-ivory-dim/50 mt-2 flex items-center">
                  <AlertTriangle size={10} className="mr-1" />
                  Checked against breached databases on signup.
                </p>
              </div>
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Confirm Password</label>
            <div className="relative">
              <input
                id="confirmPassword"
                name="confirmPassword"
                onChange={handleChange}
                required
                type={showConfirmPassword ? "text" : "password"}
                className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20 pr-10"
                placeholder="Confirm your password"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-gold transition-colors"
                aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </div>

          <Button variant="primary" className="w-full justify-center" disabled={isLoading} type="submit">
            {isLoading ? "Creating Account..." : "Register"}
          </Button>

        </form>

        <div className="mt-8 text-center">
          <p className="text-ivory-dim text-sm">
            Already a member?{' '}
            <Link to="/login" className="text-gold hover:text-white transition-colors font-bold">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
