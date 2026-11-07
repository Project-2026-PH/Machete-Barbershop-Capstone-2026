export interface DeltaPatch {
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: unknown;
}

export interface DeltaSyncResponse<T = Record<string, unknown>> {
  syncType: 'FULL' | 'DELTA' | 'NO_CHANGE';
  version: number;
  data?: T;
  diffs?: DeltaPatch[];
}

/**
 * Decodes array buffer (Protobuf wire format) or JSON string back into object.
 */
export function decodeProtobufPayload<T = unknown>(buffer: ArrayBuffer | string): T {
  if (typeof buffer === 'string') {
    return JSON.parse(buffer) as T;
  }

  const bytes = new Uint8Array(buffer);
  if (bytes.length < 2 || bytes[0] !== 0x0a) {
    const textDecoder = new TextDecoder('utf-8');
    return JSON.parse(textDecoder.decode(bytes)) as T;
  }

  // Decode length-delimited string payload
  let offset = 1;
  let length = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    length |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  const payloadBytes = bytes.subarray(offset, offset + length);
  const textDecoder = new TextDecoder('utf-8');
  return JSON.parse(textDecoder.decode(payloadBytes)) as T;
}

/**
 * Applies RFC 6902-style delta diff patches to baseline local state.
 */
export function applyDeltaPatches<T extends Record<string, unknown>>(
  baseline: T,
  patches: DeltaPatch[]
): T {
  const updated = { ...baseline } as Record<string, unknown>;

  for (const patch of patches) {
    const key = patch.path.replace(/^\//, '');
    if (patch.op === 'remove') {
      delete updated[key];
    } else {
      updated[key] = patch.value;
    }
  }

  return updated as T;
}
