import { EffectiveConnectionType } from '../hooks/useNetworkStatus';

export interface TelemetryEvent {
  event: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

class TelemetryManager {
  private queue: TelemetryEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  public logEvent(event: string, data?: Record<string, unknown>, effectiveType: EffectiveConnectionType = '4g', saveData = false): void {
    this.queue.push({ event, timestamp: Date.now(), data });

    const isLowBandwidth = effectiveType === '2g' || effectiveType === 'slow-2g' || saveData;
    const flushDelayMs = isLowBandwidth ? 60000 : effectiveType === '3g' ? 30000 : 5000;

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), flushDelayMs);
    }
  }

  private flush(): void {
    if (this.queue.length === 0) return;
    const eventsToFlush = [...this.queue];
    this.queue = [];
    this.flushTimer = null;
    const payload = JSON.stringify(eventsToFlush);

    // Prefer sendBeacon so diagnostics do not block navigation. Fall back to a
    // keepalive request when Beacon is unavailable (for example in some tests).
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: 'application/json' });
      const sent = navigator.sendBeacon('/api/telemetry/batch', blob);
      if (sent) return;
    }

    if (typeof fetch === 'function') {
      void fetch('/api/telemetry/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        keepalive: true,
        body: payload,
      }).catch(() => {
        // Telemetry must never create a user-visible failure or retry storm.
      });
    }
  }
}

export const telemetryManager = new TelemetryManager();
