import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import {
  getVerificationEmailHtml,
  getForgotPasswordEmailHtml,
  getChangePasswordEmailHtml,
  getEmailChangeEmailHtml,
  getReservationDecisionEmailHtml,
  getScheduleDelayEmailHtml,
  getStockReportEmailHtml,
  getPurchaseOrderEmailHtml,
  getBarberBookingNotificationHtml,
  StockReportEmailReport,
  PurchaseOrderEmailPayload,
  ReservationDecisionEmailPayload,
  ScheduleDelayEmailPayload,
  BarberBookingEmailPayload,
} from './email-templates.util';

const logoFilePath = [
  path.resolve(__dirname, '../receipt/demoshop_logo.png'),
  path.resolve(__dirname, 'demoshop_logo.png'),
  path.resolve(process.cwd(), 'src/utils/receipt/demoshop_logo.png'),
  path.resolve(process.cwd(), 'demoshop-backend/src/utils/receipt/demoshop_logo.png'),
  path.resolve(process.cwd(), 'demoshop-frontend/public/demoshop_logo.png'),
].find(candidate => fs.existsSync(candidate));

const getLogoAttachment = (): SendMailOptions['attachments'] => {
  return logoFilePath
    ? [{ filename: 'demoshop_logo.png', path: logoFilePath, cid: 'demoshoplogo' }]
    : [];
};

/**
 * Assembles the standard Nodemailer email options for a verification email.
 */
export const formatVerificationOptions = (
  toEmail: string,
  firstName: string,
  code: string | number
): SendMailOptions => {
  return {
    from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Welcome to DemoShop! Verify your account',
    html: getVerificationEmailHtml(firstName, code),
    attachments: getLogoAttachment(),
  };
};

/**
 * Assembles standard Nodemailer email options for password reset.
 */
export const formatForgotPasswordOptions = (
  toEmail: string,
  firstName: string | null | undefined,
  code: string | number
): SendMailOptions => {
  return {
    from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'DemoShop Barbershop! Reset your password',
    html: getForgotPasswordEmailHtml(firstName, code),
    attachments: getLogoAttachment(),
  };
};

/**
 * Assembles standard Nodemailer email options for change password verification code.
 */
export const formatChangePasswordOptions = (
  toEmail: string,
  firstName: string | null | undefined,
  code: string | number
): SendMailOptions => {
  return {
    from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Password reset request',
    html: getChangePasswordEmailHtml(firstName, code),
    attachments: getLogoAttachment(),
  };
};

/**
 * Assembles standard Nodemailer email options for email change verification code.
 */
export const formatChangeEmailOptions = (
  toEmail: string,
  firstName: string | null | undefined,
  code: string | number
): SendMailOptions => {
  return {
    from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: 'Verify your new email address',
    html: getEmailChangeEmailHtml(firstName, code),
    attachments: getLogoAttachment(),
  };
};

export const formatReceiptOptions = (
  toEmail: string,
  receiptNumber: string,
  html: string,
): SendMailOptions => ({
  from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
  to: toEmail,
  subject: `Your DemoShop receipt ${receiptNumber}`,
  html,
});

export const formatScheduleDelayOptions = (
  toEmail: string,
  payload: ScheduleDelayEmailPayload,
): SendMailOptions => ({
  from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
  to: toEmail,
  subject: `Action needed: appointment schedule adjusted by ~${payload.delayMinutes} minutes`,
  html: getScheduleDelayEmailHtml(payload),
  attachments: getLogoAttachment(),
});

export const formatStockReportOptions = (
  toEmail: string,
  ccEmail: string | null,
  reportDate: string,
  report: StockReportEmailReport,
): SendMailOptions => ({
  from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
  to: toEmail,
  ...(ccEmail ? { cc: ccEmail } : {}),
  subject: `DemoShop daily stock report — ${reportDate}`,
  html: getStockReportEmailHtml(report, reportDate),
});

export const formatPurchaseOrderEmailOptions = (
  toEmail: string,
  payload: PurchaseOrderEmailPayload,
): SendMailOptions => ({
  from: `"DemoShop Barbershop" <${process.env.EMAIL_USER}>`,
  to: toEmail,
  subject: payload.status === 'received'
    ? `Stock request received - ${payload.poNumber}`
    : `Stock request awaiting review - ${payload.poNumber}`,
  html: getPurchaseOrderEmailHtml(payload),
  attachments: getLogoAttachment(),
});

/**
 * Assembles standard Nodemailer email options for Cashier reservation decision (Confirmed / Declined).
 */
export const formatReservationDecisionOptions = (
  toEmail: string,
  payload: ReservationDecisionEmailPayload
): SendMailOptions => {
  let subject = `Reservation Update - DemoShop's Barbers (${payload.preferredDate})`;
  if (payload.decision === 'CONFIRMED') {
    subject = `Reservation Confirmed - DemoShop's Barbers (${payload.preferredDate})`;
  } else if (payload.decision === 'RECEIVED') {
    subject = `Booking Received & Under Review - DemoShop's Barbers (${payload.preferredDate})`;
  } else if (payload.decision === 'CANCELLED') {
    subject = `Booking Cancellation Confirmation - DemoShop's Barbers (${payload.preferredDate})`;
  }

  return {
    from: `"DemoShop's Barbers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html: getReservationDecisionEmailHtml(payload),
    attachments: getLogoAttachment(),
  };
};

/**
 * Assembles standard Nodemailer email options for Barber new booking notification.
 */
export const formatBarberBookingOptions = (
  toEmail: string,
  payload: BarberBookingEmailPayload
): SendMailOptions => {
  const subject = `New Booking Confirmed - ${payload.preferredDate} at ${payload.preferredTime}`;
  return {
    from: `"DemoShop's Barbers" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject,
    html: getBarberBookingNotificationHtml(payload),
    attachments: getLogoAttachment(),
  };
};




