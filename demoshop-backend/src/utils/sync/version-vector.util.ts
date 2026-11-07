import { Request, Response } from 'express';
import { sendOptimizedResponse } from '../serialization/binary-serializer.util';

export interface VersionVectorState<T = Record<string, unknown>> {
  version: number;
  data: T;
  updatedAt?: string;
}

export interface DeltaSyncResponse<T = Record<string, unknown>> {
  syncType: 'FULL' | 'DELTA' | 'NO_CHANGE';
  version: number;
  data?: Partial<T>;
  diffs?: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: unknown }>;
}

/**
 * Computes simple object diff patches between baseline and current state.
 */
export function computeStateDiff<T extends Record<string, unknown>>(
  baseline: Partial<T>,
  current: T
): Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: unknown }> {
  const diffs: Array<{ op: 'replace' | 'add' | 'remove'; path: string; value?: unknown }> = [];

  for (const key of Object.keys(current)) {
    if (!(key in baseline)) {
      diffs.push({ op: 'add', path: `/${key}`, value: current[key] });
    } else if (JSON.stringify(baseline[key]) !== JSON.stringify(current[key])) {
      diffs.push({ op: 'replace', path: `/${key}`, value: current[key] });
    }
  }

  for (const key of Object.keys(baseline)) {
    if (!(key in current)) {
      diffs.push({ op: 'remove', path: `/${key}` });
    }
  }

  return diffs;
}

/**
 * Handles delta-syncing using Version-Vector checks (`X-State-Version` header or `version` query param).
 */
export function sendVersionVectorSync<T extends Record<string, unknown>>(
  req: Request,
  res: Response,
  currentState: VersionVectorState<T>,
  baselineState?: Partial<T>
): void {
  const clientVersionHeader = req.headers['x-state-version'] || req.query.version;
  const clientVersion = clientVersionHeader ? parseInt(String(clientVersionHeader), 10) : NaN;

  res.setHeader('X-State-Version', currentState.version.toString());

  if (!isNaN(clientVersion)) {
    if (clientVersion === currentState.version) {
      // 304 / NO_CHANGE
      sendOptimizedResponse(req, res, {
        syncType: 'NO_CHANGE',
        version: currentState.version
      } as DeltaSyncResponse<T>, 200);
      return;
    }

    if (clientVersion < currentState.version && baselineState) {
      // Compute delta diffs
      const diffs = computeStateDiff(baselineState, currentState.data);
      sendOptimizedResponse(req, res, {
        syncType: 'DELTA',
        version: currentState.version,
        diffs
      } as DeltaSyncResponse<T>, 200);
      return;
    }
  }

  // Full state hydration
  sendOptimizedResponse(req, res, {
    syncType: 'FULL',
    version: currentState.version,
    data: currentState.data
  } as DeltaSyncResponse<T>, 200);
}
