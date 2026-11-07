import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useLocation } from 'react-router';

export const ScrollToTop: React.FC = () => {
  const { pathname, hash } = useLocation();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setShowBackToTop(window.scrollY > 320);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, [pathname]);

  useEffect(() => {
    if (hash) {
      const targetId = hash.startsWith('#') ? hash.substring(1) : hash;
      const element = document.getElementById(targetId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      } else {
        // Fallback for lazy-loaded components that might not be mounted immediately
        const timer = setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }, 150);
        return () => clearTimeout(timer);
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return showBackToTop ? (
    <button
      type="button"
      aria-label="Back to top"
      title="Back to top"
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}
      className="fixed right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-charcoal text-gold shadow-lg transition-colors hover:bg-gold hover:text-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold lg:hidden print:hidden"
      style={{ bottom: 'calc(6.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <ArrowUp className="h-4 w-4" aria-hidden="true" />
    </button>
  ) : null;
};
