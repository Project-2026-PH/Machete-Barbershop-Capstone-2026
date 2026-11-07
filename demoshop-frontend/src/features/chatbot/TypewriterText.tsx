import { useEffect, useState } from 'react';

type TypewriterTextProps = {
  text: string;
  completionKey: string;
  speedMs?: number;
  onProgress?: () => void;
  onComplete?: (completionKey: string) => void;
};

export const TypewriterText = ({ text, completionKey, speedMs = 16, onProgress, onComplete }: TypewriterTextProps) => {
  const [visibleCharacters, setVisibleCharacters] = useState(0);

  useEffect(() => {
    setVisibleCharacters(0);
    if (!text) {
      onComplete?.(completionKey);
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisibleCharacters(text.length);
      onComplete?.(completionKey);
      return;
    }

    let count = 0;
    const timer = window.setInterval(() => {
      count = Math.min(count + 1, text.length);
      setVisibleCharacters(count);
      onProgress?.();
      if (count >= text.length) {
        window.clearInterval(timer);
        onComplete?.(completionKey);
      }
    }, Math.max(8, speedMs));

    return () => window.clearInterval(timer);
  }, [text, completionKey, speedMs, onProgress, onComplete]);

  const isComplete = visibleCharacters >= text.length;

  return <span role="text" aria-label={text}>
    <span aria-hidden="true">
      {text.slice(0, visibleCharacters)}
      {!isComplete && <span className="ml-px inline-block h-[1em] translate-y-0.5 border-r border-current align-baseline animate-pulse" />}
    </span>
  </span>;
};
