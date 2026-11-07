import { useEffect } from 'react';
import { supabase } from '@/config/supabaseClient';
import { createHasuraFallbackGroup } from '@/utils/hasura-realtime-group';

export interface UseInventoryRealtimeOptions {
  channelName: string;
  tables?: string[];
  windowEvents?: string[];
  onReload: () => void | Promise<void>;
  debounceMs?: number;
  /** Also reload when the tab becomes visible again (missed realtime events). */
  refetchOnFocus?: boolean;
}

export const useInventoryRealtime = ({
  channelName,
  tables = [],
  windowEvents = [],
  onReload,
  debounceMs = 250,
  refetchOnFocus = false,
}: UseInventoryRealtimeOptions): void => {
  useEffect(() => {
    let timer: number | null = null;

    const debouncedReload = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void onReload();
      }, debounceMs);
    };

    const realtimeGroup = createHasuraFallbackGroup({
      onFallbackActivate: debouncedReload,
      onBothUnavailable: () => onReload(),
      degradedIntervalMs: 60_000,
    });

    for (const table of tables) {
      realtimeGroup.subscribe(
        `subscription WatchInventory_${table} {
           ${table}(limit: 1) {
             __typename
           }
         }`,
        {},
        () => debouncedReload(),
        undefined,
        {
          subscribeFallback: (onStatus) => {
            const channel = supabase
              .channel(`${channelName}-${table}-supabase-fallback`)
              .on('postgres_changes', { event: '*', schema: 'public', table }, debouncedReload)
              .subscribe(onStatus);
            return () => { void supabase.removeChannel(channel); };
          },
        },
      );
    }

    for (const eventName of windowEvents) {
      window.addEventListener(eventName, debouncedReload);
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') debouncedReload();
    };
    if (refetchOnFocus) document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (refetchOnFocus) document.removeEventListener('visibilitychange', handleVisibility);
      if (timer) window.clearTimeout(timer);
      for (const eventName of windowEvents) {
        window.removeEventListener(eventName, debouncedReload);
      }
      realtimeGroup.cleanup();
    };
  }, [channelName, debounceMs, onReload, refetchOnFocus, JSON.stringify(tables), JSON.stringify(windowEvents)]);
};
