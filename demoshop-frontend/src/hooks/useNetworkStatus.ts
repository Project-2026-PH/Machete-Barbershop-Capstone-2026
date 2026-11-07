import { useState, useEffect } from 'react';

export type EffectiveConnectionType = '4g' | '3g' | '2g' | 'slow-2g';

export interface NetworkInformation {
  effectiveType?: EffectiveConnectionType;
  saveData?: boolean;
  downlink?: number;
  rtt?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

export interface NetworkStatus {
  effectiveType: EffectiveConnectionType;
  saveData: boolean;
  isLowBandwidth: boolean;
  pollingIntervalMs: number;
}

function getNetworkInfo(): NetworkInformation | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  return nav.connection || nav.mozConnection || nav.webkitConnection;
}

/**
 * Hook providing network connection quality & adaptive polling parameters.
 * Operates completely under-the-hood to optimize data usage without interrupting UX.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(() => {
    const info = getNetworkInfo();
    const effectiveType = info?.effectiveType || '4g';
    const saveData = Boolean(info?.saveData);
    const isLowBandwidth = effectiveType === '2g' || effectiveType === 'slow-2g' || saveData;
    
    let pollingIntervalMs = 5000;
    if (effectiveType === '3g') {
      pollingIntervalMs = 20000;
    } else if (isLowBandwidth) {
      pollingIntervalMs = 60000;
    }

    return { effectiveType, saveData, isLowBandwidth, pollingIntervalMs };
  });

  useEffect(() => {
    const info = getNetworkInfo();
    if (!info || !info.addEventListener) return;

    const updateStatus = () => {
      const effectiveType = info.effectiveType || '4g';
      const saveData = Boolean(info.saveData);
      const isLowBandwidth = effectiveType === '2g' || effectiveType === 'slow-2g' || saveData;

      let pollingIntervalMs = 5000;
      if (effectiveType === '3g') {
        pollingIntervalMs = 20000;
      } else if (isLowBandwidth) {
        pollingIntervalMs = 60000;
      }

      setStatus({ effectiveType, saveData, isLowBandwidth, pollingIntervalMs });
    };

    info.addEventListener('change', updateStatus);
    return () => {
      if (info.removeEventListener) {
        info.removeEventListener('change', updateStatus);
      }
    };
  }, []);

  return status;
}
