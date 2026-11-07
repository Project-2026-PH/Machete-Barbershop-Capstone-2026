import { createPrivateKey, sign as signData } from 'node:crypto';
import { config } from '../config/env';

const normalizeMultilineEnv = (value: string): string => value.replace(/\\n/g, '\n');

const getCertificate = (): string | null => config.qzTray.certificate || null;

export const qzTrayService = {
  getCertificate,
  sign: (toSign: string): string => {
    if (!config.qzTray.privateKey) {
      throw new Error('QZ Tray private signing key is not configured.');
    }

    const privateKey = createPrivateKey(normalizeMultilineEnv(config.qzTray.privateKey));
    return signData('RSA-SHA512', Buffer.from(toSign, 'utf8'), privateKey).toString('base64');
  },
};
