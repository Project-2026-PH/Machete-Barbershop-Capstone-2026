import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router';

const HIGHLIGHT_CLASSES = ['bg-yellow-500/20', 'ring-1', 'ring-gold/60', 'transition-colors'];
const HIGHLIGHT_MS = 2000;

/**
 * Reads `?highlightId=` from the URL and, once `ready` is true, scrolls the first
 * visible element tagged with `data-search-id="<highlightId>"` into view and pulses it.
 * Each highlightId is only applied once so realtime refetches don't re-trigger it.
 */
export const useSearchHighlight = (ready: boolean, onMatch?: (highlightId: string) => void) => {
    const [searchParams] = useSearchParams();
    const rawHighlightId = searchParams.get('highlightId');
    const itemId = searchParams.get('itemId');
    const bookingId = searchParams.get('bookingId');
    const transactionId = searchParams.get('transactionId');

    const effectiveHighlightId =
        rawHighlightId ||
        (itemId ? `inventory-${itemId}` : null) ||
        (bookingId ? `appointment-${bookingId}` : null) ||
        (transactionId ? `transaction-${transactionId}` : null);

    const appliedRef = useRef<string | null>(null);
    const onMatchRef = useRef(onMatch);
    useEffect(() => {
        onMatchRef.current = onMatch;
    }, [onMatch]);

    useEffect(() => {
        if (!effectiveHighlightId || !ready || appliedRef.current === effectiveHighlightId) return;

        const findTimer = setTimeout(() => {
            const terms = new Set<string>();
            if (rawHighlightId) {
                terms.add(rawHighlightId);
                const stripped = rawHighlightId.replace(/^(inventory|appointment|booking|transaction|staff|po|service)-/, '');
                if (stripped) terms.add(stripped);
            }
            if (itemId) { terms.add(itemId); terms.add(`inventory-${itemId}`); }
            if (bookingId) { terms.add(bookingId); terms.add(`appointment-${bookingId}`); terms.add(`booking-${bookingId}`); }
            if (transactionId) { terms.add(transactionId); terms.add(`transaction-${transactionId}`); }
            if (effectiveHighlightId) terms.add(effectiveHighlightId);

            const selector = Array.from(terms)
                .flatMap((term) => {
                    const escaped = CSS.escape(term);
                    return [`[data-search-id~="${escaped}"]`, `[data-search-id="${escaped}"]`];
                })
                .join(', ');

            const candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
            // Pick the copy actually rendered for this viewport (mobile cards vs desktop table).
            const target = candidates.find((el) => el.offsetParent !== null) ?? candidates[0];
            if (!target) return;

            appliedRef.current = effectiveHighlightId;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add(...HIGHLIGHT_CLASSES);
            // Intentionally not cancelled on re-render so the glow always fades out.
            setTimeout(() => target.classList.remove(...HIGHLIGHT_CLASSES), HIGHLIGHT_MS);
            onMatchRef.current?.(effectiveHighlightId);
        }, 150);

        return () => clearTimeout(findTimer);
    }, [effectiveHighlightId, rawHighlightId, itemId, bookingId, transactionId, ready]);

    return effectiveHighlightId;
};

export default useSearchHighlight;
