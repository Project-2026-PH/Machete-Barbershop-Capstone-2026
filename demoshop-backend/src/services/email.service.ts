import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import logger from '../utils/general/logger';
import { createTransporter } from '../utils/email/email-config.util';
import { recordEmailDelivery } from '../utils/metrics/email-metrics.util';
import { generateVerificationCode } from '../utils/email/email-templates.util';
import {
  formatVerificationOptions,
  formatForgotPasswordOptions,
  formatChangePasswordOptions,
  formatChangeEmailOptions,
  formatReceiptOptions,
  formatStockReportOptions,
  formatReservationDecisionOptions,
  formatScheduleDelayOptions,
  formatPurchaseOrderEmailOptions,
  formatBarberBookingOptions,
} from '../utils/email/email-formatter.util';
import {
  ReservationDecisionEmailPayload,
  ScheduleDelayEmailPayload,
  PurchaseOrderEmailPayload,
  StockReportEmailReport,
  BarberBookingEmailPayload,
} from '../utils/email/email-templates.util';

export interface EmailDeliveryResult {
  sent: boolean;
  messageId: string | null;
  errorMessage?: string;
}

/**
 * Service for managing email communications.
 * Follows the Coordinator Pattern: orchestrates technical infrastructure, 
 * business logic, and formatting utilities to handle communications.
 */
export class EmailService {
  private transporter: Transporter | null;

  constructor() {
    this.transporter = createTransporter();
  }

  /**
   * Internal helper to send emails with standardized logging and error handling.
   */
  private async sendMailWithResult(options: SendMailOptions): Promise<EmailDeliveryResult> {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      return { sent: true, messageId: 'test-mock-id' };
    }

    if (!this.transporter) {
      logger.warn('Email service not configured. Skipping transmission.');
      recordEmailDelivery(false);
      return { sent: false, messageId: null, errorMessage: 'Email service is not configured on the backend.' };
    }

    try {
      const info = await this.transporter.sendMail(options);
      recordEmailDelivery(true);
      if (process.env.NODE_ENV !== 'test') {
        logger.info(`Email sent successfully: ${info.messageId}`);
      }
      return { sent: true, messageId: info.messageId || null };
    } catch (error) {
      recordEmailDelivery(false);
      logger.error('Failed to send email:', error);
      return {
        sent: false,
        messageId: null,
        errorMessage: error instanceof Error ? error.message : 'Email delivery failed.',
      };
    }
  }

  private async sendMail(options: SendMailOptions): Promise<boolean> {
    return (await this.sendMailWithResult(options)).sent;
  }

  /**
   * Diagnostic test email transmission with delivery result.
   */
  async sendDiagnosticEmail(options: SendMailOptions): Promise<EmailDeliveryResult> {
    return this.sendMailWithResult(options);
  }

  /**
   * Sends a verification email to a new user.
   * Orchestrates code generation, options formatting, and transmission.
   */
  async sendVerificationEmail(
    toEmail: string,
    firstName: string,
    verificationCode?: string | number
  ): Promise<string | number | null> {
    // Logic: Generate or use existing code
    const code = verificationCode || generateVerificationCode();

    // Formatting: Assemble options
    const options = formatVerificationOptions(toEmail, firstName, code);

    // Execution: Send the mail
    const success = await this.sendMail(options);

    return success ? code : null;
  }

  /**
   * Sends a forgot password verification OTP email to a user.
   */
  async sendForgotPasswordEmail(
    toEmail: string,
    firstName: string | null | undefined,
    code: string | number
  ): Promise<boolean> {
    const options = formatForgotPasswordOptions(toEmail, firstName, code);
    return await this.sendMail(options);
  }

  /**
   * Sends a change password confirmation OTP email to an authenticated user.
   */
  async sendChangePasswordEmail(
    toEmail: string,
    firstName: string | null | undefined,
    code: string | number
  ): Promise<boolean> {
    const options = formatChangePasswordOptions(toEmail, firstName, code);
    return await this.sendMail(options);
  }

  /**
   * Sends an email change confirmation OTP email to the requested new email address.
   */
  async sendChangeEmailVerification(
    toEmail: string,
    firstName: string | null | undefined,
    code: string | number
  ): Promise<boolean> {
    const options = formatChangeEmailOptions(toEmail, firstName, code);
    return await this.sendMail(options);
  }

  async sendReceiptEmail(toEmail: string, receiptNumber: string, html: string): Promise<boolean> {
    return this.sendMail(formatReceiptOptions(toEmail, receiptNumber, html));
  }

  async sendStockReportEmail(
    toEmail: string,
    ccEmail: string | null,
    reportDate: string,
    report: StockReportEmailReport,
  ): Promise<EmailDeliveryResult> {
    return this.sendMailWithResult(formatStockReportOptions(toEmail, ccEmail, reportDate, report));
  }

  /**
   * Sends a transactional email when a reservation is confirmed or declined by a cashier.
   */
  async sendReservationDecisionEmail(
    toEmail: string,
    payload: ReservationDecisionEmailPayload
  ): Promise<boolean> {
    const options = formatReservationDecisionOptions(toEmail, payload);
    return await this.sendMail(options);
  }

  async sendScheduleDelayEmail(
    toEmail: string,
    payload: ScheduleDelayEmailPayload,
  ): Promise<boolean> {
    return this.sendMail(formatScheduleDelayOptions(toEmail, payload));
  }

  async sendPurchaseOrderEmail(toEmail: string, payload: PurchaseOrderEmailPayload): Promise<boolean> {
    return this.sendMail(formatPurchaseOrderEmailOptions(toEmail, payload));
  }

  /**
   * Sends an email notification to a barber when a customer books an appointment with them.
   */
  async sendBarberBookingNotification(
    toEmail: string,
    payload: BarberBookingEmailPayload
  ): Promise<EmailDeliveryResult> {
    return this.sendMailWithResult(formatBarberBookingOptions(toEmail, payload));
  }
}

// Export singleton instance
export const emailService = new EmailService();

// Named exports for backward compatibility and specific utility usage
export const sendVerificationEmail = emailService.sendVerificationEmail.bind(emailService);
export const sendForgotPasswordEmail = emailService.sendForgotPasswordEmail.bind(emailService);
export const sendChangePasswordEmail = emailService.sendChangePasswordEmail.bind(emailService);
export const sendChangeEmailVerification = emailService.sendChangeEmailVerification.bind(emailService);
export const sendReservationDecisionEmail = emailService.sendReservationDecisionEmail.bind(emailService);
export const sendScheduleDelayEmail = emailService.sendScheduleDelayEmail.bind(emailService);
export const sendPurchaseOrderEmail = emailService.sendPurchaseOrderEmail.bind(emailService);
export const sendBarberBookingNotification = emailService.sendBarberBookingNotification.bind(emailService);

export default emailService;


