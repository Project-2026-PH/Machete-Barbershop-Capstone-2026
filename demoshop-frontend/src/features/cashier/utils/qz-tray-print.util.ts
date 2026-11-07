import type { ReceiptResponse } from '@demoshop/shared-types';
import { api } from '@/config/api';
import { formatReceiptForEscPos } from './escpos-receipt.util';

const QZ_PRINTER_NAME = 'POS58 Printer';

type QzConfig = unknown;
type QzTrayApi = {
  security: {
    setCertificatePromise: (promise: (resolve: (certificate: string) => void) => void) => void;
    setSignatureAlgorithm: (algorithm: 'SHA1' | 'SHA512') => void;
    setSignaturePromise: (promise: (_toSign: string) => (
      resolve: (signature: string) => void,
      reject: (error: unknown) => void,
    ) => void) => void;
  };
  websocket: {
    isActive: () => boolean;
    connect: (options?: {
      host?: string | string[];
      port?: { secure?: number[]; insecure?: number[] };
      usingSecure?: boolean;
    }) => Promise<void>;
  };
  printers: {
    find: (query: string) => Promise<string | string[]>;
  };
  configs: {
    create: (printer: string, options?: Record<string, unknown>) => QzConfig;
  };
  print: (config: QzConfig, data: Array<Record<string, unknown> | string>) => Promise<unknown>;
};

const configureQzSecurity = async (qz: QzTrayApi): Promise<void> => {
  const { data } = await api.get<{ certificate: string }>('/api/qz-tray/certificate');
  if (!data.certificate) throw new Error('QZ Tray certificate is unavailable.');

  qz.security.setCertificatePromise((resolve) => resolve(data.certificate));
  qz.security.setSignatureAlgorithm('SHA512');
  qz.security.setSignaturePromise((toSign) => async (resolve, reject) => {
    try {
      const response = await api.post<{ signature: string }>('/api/qz-tray/sign', { toSign });
      if (!response.data.signature) {
        reject(new Error('QZ Tray signature is empty.'));
        return;
      }
      resolve(response.data.signature);
    } catch (error) {
      reject(error);
    }
  });
};

const encodeEscPosBase64 = (data: string): string => {
  // The formatter produces a byte-preserving binary string. Base64 prevents
  // QZ Tray/browser UTF-8 conversion from corrupting ESC/POS bitmap bytes.
  return btoa(data);
};

export const printReceiptWithQzTray = async (receipt: ReceiptResponse): Promise<boolean> => {
  const rawReceipt = await formatReceiptForEscPos(receipt);
  if (typeof window === 'undefined' || !rawReceipt) return false;

  try {
    const module = await import('qz-tray');
    const qz = (module.default || module) as QzTrayApi;
    await configureQzSecurity(qz);

    if (!qz.websocket.isActive()) {
      await qz.websocket.connect({
        host: 'localhost',
        port: {
          insecure: [8182],
        },
        usingSecure: false,
      });
    }

    const printerResult = await qz.printers.find(QZ_PRINTER_NAME);
    const printers = Array.isArray(printerResult) ? printerResult : [printerResult];
    if (!printers.includes(QZ_PRINTER_NAME)) {
      console.warn('[QzTray] Requested printer was not found.', {
        requested: QZ_PRINTER_NAME,
        available: printers,
      });
      return false;
    }

    const config = qz.configs.create(QZ_PRINTER_NAME, { copies: 1 });
    await qz.print(config, [
      {
        type: 'raw',
        format: 'command',
        flavor: 'base64',
        data: encodeEscPosBase64(rawReceipt),
      },
    ]);

    return true;
  } catch (error) {
    console.info('[QzTray] Direct receipt printing unavailable; using browser print.', error instanceof Error ? error.message : error);
    return false;
  }
};
