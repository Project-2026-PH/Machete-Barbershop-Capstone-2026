// demoshop-frontend\src\features\auth\Login.tsx
import React from 'react';
import { Button } from '@/components/ui/Button';
import { Link } from 'react-router';
import { Eye, EyeOff } from 'lucide-react';
import { useLogin } from '../../hooks/useLogin';
import { useShopSettings } from '@/hooks/useShopSettings';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export const Login: React.FC = () => {
  const {
    email,
    setEmail,
    password,
    setPassword,
    error,
    success,
    loading,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,
    lastLoginMethod,
    authReady,
    user,
    handleSubmit,
    handleGoogleLogin,
  } = useLogin();

  const { settings } = useShopSettings();
  const heroImageUrl = settings?.website?.heroImageUrl?.trim();

  // Keep the login form hidden while a persisted session is being restored.
  // This prevents a brief login-page flash before the dashboard redirect.
  if (!authReady || user) {
    return <LoadingScreen isLoaded={false} onComplete={() => {}} />;
  }

  const GoogleIcon = () => (
    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center relative overflow-hidden px-4">
      {/* Background Texture */}
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
          <h2 className="text-3xl font-serif font-bold text-ivory mb-2">Welcome Back</h2>
          <p className="text-ivory-dim text-sm font-light">Sign in to manage your appointments</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Status Message container with min-height to prevent form layout shifting */}
          <div className="min-h-[52px] mb-6 flex items-center justify-center">
            {error ? (
              <div className="w-full bg-red-500/10 border border-red-500 text-red-500 text-sm p-3 rounded text-center animate-fade-in">
                {error}
              </div>
            ) : success ? (
              <div className="w-full bg-green-500/10 border border-green-500 text-green-500 text-sm p-3 rounded text-center animate-fade-in">
                {success}
              </div>
            ) : null}
          </div>
          <div>
            <label htmlFor="email" className="block text-xs uppercase tracking-widest text-gold mb-2 font-bold">Email Address</label>
            <input
              type="email"
              id="email"
              name="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20"
              placeholder="portfolio@example.invalid"
              autoComplete="username"
              required
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label htmlFor="password" className="block text-xs uppercase tracking-widest text-gold font-bold">Password</label>
              <Link to="/forgot-password" className="text-xs text-ivory-dim hover:text-gold transition-colors">Forgot Password?</Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="password-input-no-native-reveal w-full bg-charcoal border border-white/10 px-4 py-3 text-ivory focus:border-gold focus:outline-none transition-colors placeholder-white/20 pr-10"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-ivory-dim hover:text-gold"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
              >
                {showPassword ? <Eye size={20} /> : <EyeOff size={20} />}
              </button>
            </div>
          </div>

          <div className="flex items-center">
            <input
              id="remember-me"
              name="remember-me"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 text-gold accent-gold focus:ring-gold border-gray-300 rounded bg-charcoal cursor-pointer"
            />
            <label htmlFor="remember-me" className="ml-2 block text-sm text-ivory-dim">
              Remember me
            </label>
          </div>

          <Button type="submit" variant="primary" className="w-full justify-center" disabled={loading}>
            {loading ? (
              <span className="flex items-center gap-2">
                Signing In
                <span className="flex gap-1.5 items-center justify-center">
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></span>
                </span>
              </span>
            ) : (
              'Sign In'
            )}
          </Button>

          {/* Divider */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-charcoal-light px-2 text-ivory-dim">Or</span>
            </div>
          </div>

          <div className="relative">
            <Button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="peer w-full flex items-center justify-center gap-3 bg-transparent border border-white/30 text-ivory font-bold py-2 px-4 rounded hover:bg-white/5 hover:border-gold hover:text-gold transition-all duration-300 disabled:opacity-60 disabled:cursor-wait"
              style={{ minHeight: '44px' }}
            >
              <GoogleIcon />
              <span>{loading ? 'Preparing Google sign-in…' : 'Sign in with Google'}</span>
            </Button>
            {lastLoginMethod === 'google' && (
              <span className="absolute -top-2 right-4 bg-[#D4AF37] text-charcoal text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider shadow-md pointer-events-none transition-all duration-300 peer-hover:scale-105 peer-hover:bg-gold">
                Last used
              </span>
            )}
          </div>
        </form>

        <div className="mt-8 text-center">
          <p className="text-ivory-dim text-sm">
            Don't have an account?{' '}
            <Link to="/register" className="text-gold hover:text-white transition-colors font-bold">
              Sign Up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
