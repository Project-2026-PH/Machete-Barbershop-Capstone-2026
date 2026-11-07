import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import logger from '../general/logger';

/**
 * Creates and configures a Nodemailer transporter.
 * Returns null if credentials are missing.
 */
export const createTransporter = (): Transporter | null => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (user && pass) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
    logger.info('Email service transporter initialized successfully.');
    return transporter;
  }

  logger.warn('Email credentials missing (EMAIL_USER/EMAIL_PASS). Emails will not be sent.');
  return null;
};

