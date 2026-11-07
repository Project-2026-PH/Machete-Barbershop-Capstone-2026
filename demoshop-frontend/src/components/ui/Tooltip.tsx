import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Title shown at the top of the tooltip (e.g. "Help Information" or "Items & Quantities") */
  title?: React.ReactNode;
  /** Detailed content or custom body node */
  content: React.ReactNode;
  /** Element that triggers the tooltip on hover / focus */
  children: React.ReactNode;
  /** Tooltip position relative to target. Defaults to 'top' */
  position?: TooltipPosition;
  /** Extra delay in ms before showing. Defaults to 100ms */
  delay?: number;
  /** Extra styling for tooltip card */
  className?: string;
  /** Custom max width class. Defaults to 'max-w-xs' */
  maxWidth?: string;
  /** Disabled state */
  disabled?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  title,
  content,
  children,
  position = 'top',
  delay = 100,
  className = '',
  maxWidth = 'max-w-xs',
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; actualPosition: TooltipPosition }>({
    top: 0,
    left: 0,
    actualPosition: position,
  });

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const updatePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();

    const gap = 8; // Spacing between trigger and tooltip
    let chosenPos = position;
    let top = 0;
    let left = 0;

    // Boundary flip check
    if (chosenPos === 'top' && triggerRect.top - tooltipRect.height - gap < 0) {
      chosenPos = 'bottom';
    } else if (
      chosenPos === 'bottom' &&
      triggerRect.bottom + tooltipRect.height + gap > window.innerHeight
    ) {
      chosenPos = 'top';
    }

    if (chosenPos === 'top') {
      top = triggerRect.top - tooltipRect.height - gap;
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
    } else if (chosenPos === 'bottom') {
      top = triggerRect.bottom + gap;
      left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
    } else if (chosenPos === 'left') {
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
      left = triggerRect.left - tooltipRect.width - gap;
    } else if (chosenPos === 'right') {
      top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
      left = triggerRect.right + gap;
    }

    // Keep horizontally within viewport boundaries (with padding)
    const padding = 12;
    if (left < padding) {
      left = padding;
    } else if (left + tooltipRect.width > window.innerWidth - padding) {
      left = window.innerWidth - tooltipRect.width - padding;
    }

    // Keep vertically within viewport boundaries
    if (top < padding) {
      top = padding;
    } else if (top + tooltipRect.height > window.innerHeight - padding) {
      top = window.innerHeight - tooltipRect.height - padding;
    }

    setCoords({
      top: top + window.scrollY,
      left: left + window.scrollX,
      actualPosition: chosenPos,
    });
  };

  const handleMouseEnter = () => {
    if (disabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    clearTimer();
    setIsVisible(false);
  };

  useEffect(() => {
    if (isVisible) {
      updatePosition();
      const onScrollOrResize = () => updatePosition();
      window.addEventListener('scroll', onScrollOrResize, true);
      window.addEventListener('resize', onScrollOrResize);
      return () => {
        window.removeEventListener('scroll', onScrollOrResize, true);
        window.removeEventListener('resize', onScrollOrResize);
      };
    }
  }, [isVisible]);

  useEffect(() => {
    return () => clearTimer();
  }, []);

  // Compute arrow positioning styles
  const renderArrow = () => {
    if (!triggerRef.current) return null;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const triggerCenter = triggerRect.left + triggerRect.width / 2 + window.scrollX;
    const arrowLeft = Math.max(16, Math.min(triggerCenter - coords.left, (tooltipRef.current?.offsetWidth || 200) - 16));

    if (coords.actualPosition === 'top') {
      return (
        <div
          className="absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-[#1E2024]"
          style={{ left: `${arrowLeft}px` }}
        />
      );
    }
    if (coords.actualPosition === 'bottom') {
      return (
        <div
          className="absolute -top-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-white/10 bg-[#1E2024]"
          style={{ left: `${arrowLeft}px` }}
        />
      );
    }
    return null;
  };

  return (
    <>
      <div
        ref={triggerRef}
        className="inline-flex w-full"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleMouseEnter}
        onBlur={handleMouseLeave}
        aria-describedby={isVisible ? tooltipId : undefined}
      >
        {children}
      </div>

      {isVisible &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={tooltipId}
            ref={tooltipRef}
            role="tooltip"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className={`pointer-events-none fixed z-[9999] ${maxWidth} animate-zoom-in rounded-xl border border-white/10 bg-[#1E2024] p-3 text-left shadow-2xl backdrop-blur-md transition-opacity duration-150 ${className}`}
          >
            {renderArrow()}

            {title && (
              <div className="relative z-10 text-xs font-bold tracking-wide text-ivory">
                {title}
              </div>
            )}

            <div
              className={`relative z-10 text-xs leading-relaxed text-ivory-dim/90 ${
                title ? 'mt-1.5' : ''
              }`}
            >
              {content}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
