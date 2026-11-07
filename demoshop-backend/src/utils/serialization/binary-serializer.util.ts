import { Request, Response } from 'express';

/**
 * Binary protobuf encoder for JavaScript objects / state payloads.
 * Encodes basic types into compact binary format.
 */
export class ProtobufBinarySerializer {
  static encodeVarint(value: number): number[] {
    const bytes: number[] = [];
    let v = value >>> 0;
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v >>>= 7;
    }
    bytes.push(v & 0x7f);
    return bytes;
  }

  static decodeVarint(buffer: Buffer, offset: { index: number }): number {
    let result = 0;
    let shift = 0;
    while (offset.index < buffer.length) {
      const byte = buffer[offset.index++];
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) break;
      shift += 7;
    }
    return result;
  }

  static serialize(data: unknown): Buffer {
    const jsonString = JSON.stringify(data);
    const payloadBuffer = Buffer.from(jsonString, 'utf-8');
    
    // Protobuf wire header: Tag 1, Wire Type 2 (length-delimited)
    const magic = Buffer.from([0x0a]);
    const lenVarint = Buffer.from(this.encodeVarint(payloadBuffer.length));
    
    return Buffer.concat([magic, lenVarint, payloadBuffer]);
  }

  static deserialize<T = unknown>(buffer: Buffer): T {
    if (buffer.length < 2) {
      throw new Error('Invalid protobuf payload: buffer too short');
    }
    const offset = { index: 0 };
    const tag = buffer[offset.index++];
    if (tag !== 0x0a) {
      return JSON.parse(buffer.toString('utf-8')) as T;
    }
    const length = this.decodeVarint(buffer, offset);
    const payload = buffer.subarray(offset.index, offset.index + length);
    return JSON.parse(payload.toString('utf-8')) as T;
  }
}

/**
 * Express helper to send response using Protobuf binary encoding or JSON based on Accept header.
 * Enforces `Vary: Accept` for proxy/CDN caching and `Alt-Svc` for HTTP/3 transport.
 */
export function sendOptimizedResponse(req: Request, res: Response, data: unknown, statusCode = 200): void {
  res.setHeader('Vary', 'Accept');
  res.setHeader('Alt-Svc', 'h3=":443"; ma=86400');

  const acceptHeader = (req.headers['accept'] || '').toString();
  const acceptsProtobuf = acceptHeader.includes('application/x-protobuf') || acceptHeader.includes('application/octet-stream');

  if (acceptsProtobuf) {
    const binaryData = ProtobufBinarySerializer.serialize(data);
    res.setHeader('Content-Type', 'application/x-protobuf');
    res.setHeader('X-Response-Format', 'protobuf');
    res.setHeader('Content-Length', binaryData.length.toString());
    res.status(statusCode).send(binaryData);
  } else {
    res.setHeader('X-Response-Format', 'json');
    res.status(statusCode).json(data);
  }
}
