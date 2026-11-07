import React, { useEffect, useState, useRef } from 'react';
import { Scissors } from 'lucide-react';
import { Button } from './Button';

interface LoadingScreenProps {
  onComplete: () => void;
  isLoaded: boolean;
  autoExit?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  onComplete,
  isLoaded,
  autoExit = true
}) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);
  const progressRef = useRef(0);

  useEffect(() => {
    if (isLoaded) {
      setShowTimeout(false);
      return;
    }
    const timer = setTimeout(() => {
      setShowTimeout(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    let animationFrameId: number;

    const animate = () => {
      if (isLoaded) {
        // If page is loaded, accelerate to 100%
        progressRef.current += (100 - progressRef.current) * 0.1;

        // Snap to 100 if very close
        if (progressRef.current > 99.5) {
          progressRef.current = 100;
          setProgress(100);

          // Start exit sequence
          if (autoExit) {
            setTimeout(() => {
              setIsExiting(true);
              setTimeout(onComplete, 500);
            }, 50);
          } else {
            setTimeout(onComplete, 50);
          }
          return; // Stop animation loop
        }
      } else {
        // If not loaded yet, slowly increment but don't reach 100%
        // Asymptotically approach 90%
        progressRef.current += (90 - progressRef.current) * 0.01;
      }

      setProgress(progressRef.current);
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrameId);
  }, [isLoaded, onComplete, autoExit]);

  return (
    <div
      className={`fixed inset-0 z-[100] bg-charcoal flex flex-col items-center justify-center transition-transform duration-500 ease-in-out ${isExiting ? '-translate-y-full' : 'translate-y-0'}`}
    >
      {/* Logo Container */}
      <div className={`mb-12 relative transition-all duration-500 ${isExiting ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}`}>
        <picture>
          <source srcSet="/demoshop_logo.webp" type="image/webp" />
          <img
            src="/demoshop_logo.png"
            alt="DemoShop Logo"
            width={256}
            height={256}
            decoding="async"
            className="h-24 w-auto opacity-80 animate-pulse"
          />
        </picture>
      </div>

      {/* Progress Bar Container */}
      <div className="relative w-64 h-[2px] bg-white/10 overflow-visible">

        {/* Filled Progress Line (Hair Strand) */}
        <div
          className="absolute top-0 left-0 h-full bg-gold"
          style={{ width: `${progress}%` }}
        ></div>

        {/* Scissors Icon following the progress */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
          style={{ left: `${progress}%` }}
        >
          <Scissors
            className="w-8 h-8 text-gold fill-charcoal transform -rotate-90 origin-center animate-[snip_0.3s_ease-in-out_infinite]"
            strokeWidth={1.5}
          />

          {/* Falling Hair Particles */}
          {progress > 0 && progress < 100 && (
            <div className="absolute top-full left-1/2 w-1 h-1 bg-gold/50 rounded-full animate-[fade-in_0.5s_ease-out_reverse] translate-y-2"></div>
          )}
        </div>
      </div>

      {/* Percentage Text */}
      <div className="mt-4 font-serif text-gold text-sm tracking-widest">
        {Math.round(progress)}%
      </div>

      {/* Timeout Alert Message & Retry Button */}
      {showTimeout && (
        <div className="mt-8 flex flex-col items-center gap-4 animate-fade-in max-w-xs text-center px-4">
          <p className="text-xs text-ivory-dim leading-relaxed">
            Taking longer than usual. Check your internet connection or reload the application.
          </p>
          <Button
            variant="outline"
            className="text-[10px] py-2 px-6 border-gold/30 text-gold hover:border-gold hover:bg-gold/10"
            onClick={() => window.location.reload()}
          >
            Reload App
          </Button>
        </div>
      )}
    </div>
  );
};
