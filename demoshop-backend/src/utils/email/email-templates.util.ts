/**
 * Email Template & Logic Utility
 * Contains functions to generate HTML content and common logic for application emails.
 */

/**
 * Generates a 6-digit random verification code.
 */
export const generateVerificationCode = (): number => {
  return Math.floor(100000 + Math.random() * 900000);
};

export interface StockReportEmailReport {
  summary?: {
    submittedShiftCount?: number;
    missingShiftCount?: number;
    fallbackCashierSubmissionCount?: number;
    totalLoggedUsage?: number;
  };
  items?: Array<{
    itemName?: string;
    unit?: string;
    currentStock?: number | null;
    openingQuantity?: number | null;
    closingQuantity?: number | null;
    receiptQuantity?: number | null;
    loggedUsage?: number | null;
  }>;
}

export interface PurchaseOrderEmailPayload {
  poNumber: string;
  status: 'pending' | 'received';
  lineCount: number;
  notes?: string | null;
  lines?: Array<{
    itemName?: string | null;
    unit?: string | null;
    quantityRequested?: number | null;
    unitCost?: number | string | null;
  }>;
  dashboardUrl?: string | null;
}

export const getPurchaseOrderEmailHtml = (data: PurchaseOrderEmailPayload): string => {
  const isReceived = data.status === 'received';
  const accent = isReceived ? '#34D399' : '#D4AF37';
  const statusLabel = isReceived ? 'RECEIVED' : 'PENDING APPROVAL';
  const statusText = isReceived
    ? 'This stock request has been received and fulfilled.'
    : 'A new stock request is waiting for Owner/Admin review.';
  const rows = (data.lines || []).map((line) => `<tr>
    <td style="padding:12px 10px;border-bottom:1px solid #353535;color:#FFFFF0;font-weight:600;">${escapeHtml(line.itemName || 'Inventory item')}</td>
    <td style="padding:12px 10px;border-bottom:1px solid #353535;color:#C5C5B5;">${escapeHtml(line.unit || '—')}</td>
    <td style="padding:12px 10px;border-bottom:1px solid #353535;color:#FFFFF0;text-align:right;">${escapeHtml(line.quantityRequested ?? '—')}</td>
    <td style="padding:12px 10px;border-bottom:1px solid #353535;color:#C5C5B5;text-align:right;">${line.unitCost == null ? '—' : `₱${Number(line.unitCost).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</td>
  </tr>`).join('');
  const reviewLink = data.dashboardUrl ? `<a href="${escapeHtml(data.dashboardUrl)}" style="display:inline-block;background:${accent};color:#121212;padding:13px 22px;border-radius:5px;font-weight:800;text-decoration:none;">Review Stock Request</a>` : '';
  return `<!doctype html><html><body style="margin:0;background:#101010;font-family:Inter,Arial,sans-serif;color:#FFFFF0;">
    <div style="padding:28px 12px;background:#101010;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:650px;margin:0 auto;background:#1C1C1C;border:1px solid #3A3424;border-radius:10px;overflow:hidden;">
      <tr><td style="padding:26px 28px;background:linear-gradient(135deg,#292417,#171717);border-bottom:1px solid #4A3D20;"><div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#D4AF37;">DemoShop Barbershop</div><div style="margin-top:6px;color:#C5C5B5;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">Inventory Operations</div></td></tr>
      <tr><td style="padding:28px;"><div style="display:inline-block;padding:7px 11px;border:1px solid ${accent};border-radius:999px;color:${accent};font-size:11px;font-weight:800;letter-spacing:1px;">${statusLabel}</div><h1 style="margin:18px 0 8px;font-family:Georgia,serif;font-size:28px;color:#FFFFF0;">Stock request ${escapeHtml(data.poNumber)}</h1><p style="margin:0;color:#C5C5B5;line-height:1.6;">${statusText}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#151515;border:1px solid #333;border-radius:7px;"><tr><td style="padding:16px 18px;width:50%;"><div style="color:#888878;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Line items</div><div style="margin-top:5px;font-size:20px;font-weight:700;color:#FFFFF0;">${data.lineCount}</div></td><td style="padding:16px 18px;border-left:1px solid #333;"><div style="color:#888878;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Status</div><div style="margin-top:5px;font-size:20px;font-weight:700;color:${accent};">${statusLabel}</div></td></tr></table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;"><thead><tr style="background:#292929;color:#C5C5B5;text-align:left;"><th style="padding:11px 10px;">Item</th><th style="padding:11px 10px;">Unit</th><th style="padding:11px 10px;text-align:right;">Quantity</th><th style="padding:11px 10px;text-align:right;">Unit cost</th></tr></thead><tbody>${rows || '<tr><td colspan="4" style="padding:16px 10px;color:#C5C5B5;">No line-item details available.</td></tr>'}</tbody></table>
        ${data.notes ? `<div style="margin-top:22px;padding:14px 16px;background:#211F16;border-left:3px solid ${accent};color:#C5C5B5;line-height:1.5;"><strong style="color:#FFFFF0;">Notes</strong><br>${escapeHtml(data.notes)}</div>` : ''}
        ${reviewLink ? `<div style="margin-top:28px;text-align:center;">${reviewLink}</div>` : ''}
      </td></tr><tr><td style="padding:18px 28px;border-top:1px solid #333;color:#888878;font-size:11px;text-align:center;">This is an automated inventory notification from DemoShop Barbershop.</td></tr>
    </table></div></body></html>`;
};

export const getStockReportEmailHtml = (report: StockReportEmailReport, reportDate: string): string => {
  const summary = report.summary || {};
  const rows = (report.items || []).map((item) => `<tr><td>${escapeHtml(item.itemName)}</td><td>${escapeHtml(item.unit)}</td><td>${item.openingQuantity ?? 'N/A'}</td><td>${item.closingQuantity ?? 'N/A'}</td><td>${item.currentStock ?? '—'}</td><td>${item.receiptQuantity ?? '—'}</td><td>${item.loggedUsage ?? '—'}</td></tr>`).join('');
  return `<!doctype html><html><body><h1>DemoShop daily stock report — ${escapeHtml(reportDate)}</h1><p>Morning and evening counts submitted: ${summary.submittedShiftCount ?? 0} of 2. Missing required counts: ${summary.missingShiftCount ?? 0}.</p><p>Total recorded usage: ${escapeHtml(summary.totalLoggedUsage)}</p><table border="1" cellpadding="6" cellspacing="0"><thead><tr><th>Item</th><th>Unit</th><th>Morning count</th><th>Evening count</th><th>Current on hand</th><th>Receipts</th><th>Logged usage</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No tracked inventory items.</td></tr>'}</tbody></table></body></html>`;
};

/**
 * Generates HTML for verification emails on account registration.
 */
export const getVerificationEmailHtml = (firstName: string, code: string | number): string => {
  const name = firstName && firstName.trim() ? firstName.trim() : 'Valued Customer';
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #121212; padding: 30px 10px; margin: 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 420px; margin: 0 auto; background-color: #1C1C1C; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.6);">
        <!-- Header with Logo -->
        <tr>
          <td style="padding: 32px 24px 16px 24px; text-align: center; background: linear-gradient(180deg, #242424 0%, #1C1C1C 100%);">
            <img src="cid:demoshoplogo" alt="DemoShop's Barbershop" width="90" style="display: block; width: 90px; max-width: 90px; height: auto; margin: 0 auto 14px auto;" />
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #D4AF37; font-size: 22px; margin: 0; letter-spacing: 0.5px; font-weight: 700;">
              Welcome to the Club!
            </h2>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding: 8px 24px 28px 24px; text-align: center;">
            <p style="font-size: 14px; font-weight: 600; color: #FFFFF0; margin: 0 0 14px 0;">
              Hello ${name},
            </p>

            <p style="font-size: 13px; line-height: 1.6; color: #C5C5B5; margin: 0 0 22px 0;">
              Thank you for registering with DemoShop Barbershop. Use the verification code below to verify your email and activate your account.
            </p>

            <!-- Prominent Code Box -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 20px auto;">
              <tr>
                <td style="background-color: #151515; border: 1px solid #D4AF37; border-radius: 6px; padding: 12px 24px; text-align: center;">
                  <span style="font-family: 'Courier New', Courier, monospace; color: #D4AF37; font-size: 28px; font-weight: 700; letter-spacing: 6px; display: block;">
                    ${code}
                  </span>
                </td>
              </tr>
            </table>

            <p style="font-size: 12px; color: #9E9E8E; margin: 0 0 20px 0;">
              This code will expire in <strong style="color: #FFFFF0;">15 minutes</strong>.
            </p>

            <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 0 0 16px 0;"></div>

            <p style="font-size: 11px; color: #666666; margin: 0; line-height: 1.5;">
              If you didn&apos;t create an account with us, please ignore this email.
            </p>
          </td>
        </tr>
      </table>
      <!-- Unique token prevents Gmail from collapsing threads -->
      <div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        [${uniqueToken}]
      </div>
    </div>
  `;
};

/**
 * Generates HTML for forgot password/reset emails.
 */
export const getForgotPasswordEmailHtml = (firstName: string | null | undefined, code: string | number): string => {
  const name = firstName && firstName.trim() ? firstName.trim() : 'Valued Customer';
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #121212; padding: 30px 10px; margin: 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 420px; margin: 0 auto; background-color: #1C1C1C; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.6);">
        <!-- Header with Logo -->
        <tr>
          <td style="padding: 32px 24px 16px 24px; text-align: center; background: linear-gradient(180deg, #242424 0%, #1C1C1C 100%);">
            <img src="cid:demoshoplogo" alt="DemoShop's Barbershop" width="90" style="display: block; width: 90px; max-width: 90px; height: auto; margin: 0 auto 14px auto;" />
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #D4AF37; font-size: 22px; margin: 0; letter-spacing: 0.5px; font-weight: 700;">
              Password Reset Request
            </h2>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding: 8px 24px 28px 24px; text-align: center;">
            <p style="font-size: 14px; font-weight: 600; color: #FFFFF0; margin: 0 0 14px 0;">
              Hello ${name},
            </p>

            <p style="font-size: 13px; line-height: 1.6; color: #C5C5B5; margin: 0 0 22px 0;">
              We received a request to reset your password. Use the verification code below to proceed with resetting your password.
            </p>

            <!-- Prominent Code Box -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 20px auto;">
              <tr>
                <td style="background-color: #151515; border: 1px solid #D4AF37; border-radius: 6px; padding: 12px 24px; text-align: center;">
                  <span style="font-family: 'Courier New', Courier, monospace; color: #D4AF37; font-size: 28px; font-weight: 700; letter-spacing: 6px; display: block;">
                    ${code}
                  </span>
                </td>
              </tr>
            </table>

            <p style="font-size: 12px; color: #9E9E8E; margin: 0 0 20px 0;">
              This code will expire in <strong style="color: #FFFFF0;">10 minutes</strong>.
            </p>

            <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 0 0 16px 0;"></div>

            <p style="font-size: 11px; color: #666666; margin: 0; line-height: 1.5;">
              If you didn&apos;t request a password reset, please ignore this email.
            </p>
          </td>
        </tr>
      </table>
      <!-- Unique token prevents Gmail from collapsing threads -->
      <div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        [${uniqueToken}]
      </div>
    </div>
  `;
};

/**
 * Generates HTML for change password verification emails (dark-themed luxury portrait layout matching app design).
 */
export const getChangePasswordEmailHtml = (firstName: string | null | undefined, code: string | number): string => {
  const name = firstName && firstName.trim() ? firstName.trim() : 'Valued Customer';
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #121212; padding: 30px 10px; margin: 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 420px; margin: 0 auto; background-color: #1C1C1C; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.6);">
        <!-- Header with Logo -->
        <tr>
          <td style="padding: 32px 24px 16px 24px; text-align: center; background: linear-gradient(180deg, #242424 0%, #1C1C1C 100%);">
            <img src="cid:demoshoplogo" alt="DemoShop's Barbershop" width="90" style="display: block; width: 90px; max-width: 90px; height: auto; margin: 0 auto 14px auto;" />
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #D4AF37; font-size: 22px; margin: 0; letter-spacing: 0.5px; font-weight: 700;">
              Password Reset Request
            </h2>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding: 8px 24px 28px 24px; text-align: center;">
            <p style="font-size: 14px; font-weight: 600; color: #FFFFF0; margin: 0 0 14px 0;">
              Hello ${name},
            </p>

            <p style="font-size: 13px; line-height: 1.6; color: #C5C5B5; margin: 0 0 22px 0;">
              If you requested a password change for your account, use the confirmation code below to complete the process. If you didn't make this request, ignore this email.
            </p>

            <!-- Prominent Code Box -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 20px auto;">
              <tr>
                <td style="background-color: #151515; border: 1px solid #D4AF37; border-radius: 6px; padding: 12px 24px; text-align: center;">
                  <span style="font-family: 'Courier New', Courier, monospace; color: #D4AF37; font-size: 28px; font-weight: 700; letter-spacing: 6px; display: block;">
                    ${code}
                  </span>
                </td>
              </tr>
            </table>

            <p style="font-size: 12px; color: #9E9E8E; margin: 0 0 20px 0;">
              This code will expire in <strong style="color: #FFFFF0;">15 minutes</strong>.
            </p>

            <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 0 0 16px 0;"></div>

            <p style="font-size: 11px; color: #666666; margin: 0; line-height: 1.5;">
              If you didn&apos;t make this request, please ignore this email.
            </p>
          </td>
        </tr>
      </table>
      <!-- Unique token prevents Gmail from collapsing threads -->
      <div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        [${uniqueToken}]
      </div>
    </div>
  `;
};

/**
 * Generates HTML for email change verification (dark-themed luxury portrait layout matching app design).
 */
export const getEmailChangeEmailHtml = (firstName: string | null | undefined, code: string | number): string => {
  const name = firstName && firstName.trim() ? firstName.trim() : 'Valued Customer';
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #121212; padding: 30px 10px; margin: 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 420px; margin: 0 auto; background-color: #1C1C1C; border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; overflow: hidden; box-shadow: 0 12px 36px rgba(0,0,0,0.6);">
        <!-- Header with Logo -->
        <tr>
          <td style="padding: 32px 24px 16px 24px; text-align: center; background: linear-gradient(180deg, #242424 0%, #1C1C1C 100%);">
            <img src="cid:demoshoplogo" alt="DemoShop's Barbershop" width="90" style="display: block; width: 90px; max-width: 90px; height: auto; margin: 0 auto 14px auto;" />
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #D4AF37; font-size: 22px; margin: 0; letter-spacing: 0.5px; font-weight: 700;">
              Verify Email Address
            </h2>
          </td>
        </tr>

        <!-- Body Content -->
        <tr>
          <td style="padding: 8px 24px 28px 24px; text-align: center;">
            <p style="font-size: 14px; font-weight: 600; color: #FFFFF0; margin: 0 0 14px 0;">
              Hello ${name},
            </p>

            <p style="font-size: 13px; line-height: 1.6; color: #C5C5B5; margin: 0 0 22px 0;">
              You requested to update the email address linked to your DemoShop Barbershop account. Use the verification code below to confirm this email change.
            </p>

            <!-- Prominent Code Box -->
            <table align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 20px auto;">
              <tr>
                <td style="background-color: #151515; border: 1px solid #D4AF37; border-radius: 6px; padding: 12px 24px; text-align: center;">
                  <span style="font-family: 'Courier New', Courier, monospace; color: #D4AF37; font-size: 28px; font-weight: 700; letter-spacing: 6px; display: block;">
                    ${code}
                  </span>
                </td>
              </tr>
            </table>

            <p style="font-size: 12px; color: #9E9E8E; margin: 0 0 20px 0;">
              This code will expire in <strong style="color: #FFFFF0;">15 minutes</strong>.
            </p>

            <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 0 0 16px 0;"></div>

            <p style="font-size: 11px; color: #666666; margin: 0; line-height: 1.5;">
              If you didn&apos;t request this email change, please ignore this email or contact support.
            </p>
          </td>
        </tr>
      </table>
      <!-- Unique token prevents Gmail from collapsing threads -->
      <div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        [${uniqueToken}]
      </div>
    </div>
  `;
};


export interface ReservationDecisionEmailPayload {
  decision: 'CONFIRMED' | 'DECLINED' | 'CANCELLED' | 'RECEIVED';
  customerName: string;
  preferredDate: string;
  preferredTime: string;
  barberName: string;
  branchName?: string;
  branchAddress?: string;
  services: Array<{ title: string; price: number | string }>;
  totalAmount: number;
  guestCount?: number;
  reservationFee?: number;
  depositPaid?: number;
  remainingBalance: number;
  cashierName: string;
  actionTimestamp: Date | string;
  declineReason?: string | null;
}

export interface ScheduleDelayEmailPayload {
  customerName: string;
  barberName: string;
  originalStartAt: string;
  estimatedStartAt: string;
  delayMinutes: number;
  branchName?: string;
  portalUrl?: string;
}

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const formatMoney = (val: number | string): string => {
  const num = typeof val === 'number' ? val : parseFloat(String(val)) || 0;
  return `₱${num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatActionTimestamp = (ts: Date | string): string => {
  try {
    const d = new Date(ts);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return String(ts);
  }
};

export const getScheduleDelayEmailHtml = (data: ScheduleDelayEmailPayload): string => {
  const name = data.customerName?.trim() || 'Valued Customer';
  const branchName = data.branchName?.trim() || "DemoShop's Barbers";
  const portalUrl = data.portalUrl?.trim()
    ? `${data.portalUrl.trim().replace(/\/$/, '')}/dashboard/overview`
    : null;
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  return `
    <div style="font-family: Inter, Arial, sans-serif; background:#121212; padding:32px 12px; color:#FFFFF0;">
      <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background:#1C1C1C; border:1px solid rgba(212,175,55,.35); border-radius:8px; overflow:hidden;">
        <tr><td style="padding:28px 24px; text-align:center; border-bottom:1px solid rgba(255,255,255,.08);">
          <h1 style="margin:0; color:#D4AF37; font-size:20px;">Appointment Delay Advisory</h1>
        </td></tr>
        <tr><td style="padding:24px;">
          <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
          <p style="color:#C5C5B5; line-height:1.6;">Your barber is running behind because a previous service took longer than expected. We are keeping your reservation active.</p>
          <table width="100%" cellpadding="8" cellspacing="0" style="background:#161616; border:1px solid rgba(255,255,255,.08); margin:20px 0;">
            <tr><td style="color:#9E9E8E;">Original appointment</td><td style="text-align:right;">${escapeHtml(data.originalStartAt)}</td></tr>
            <tr><td style="color:#9E9E8E;">Estimated start</td><td style="text-align:right; color:#D4AF37; font-weight:700;">${escapeHtml(data.estimatedStartAt)}</td></tr>
            <tr><td style="color:#9E9E8E;">Estimated delay</td><td style="text-align:right; color:#F59E0B; font-weight:700;">~${data.delayMinutes} minutes</td></tr>
            <tr><td style="color:#9E9E8E;">Barber / branch</td><td style="text-align:right;">${escapeHtml(data.barberName)} / ${escapeHtml(branchName)}</td></tr>
          </table>
          <div style="background:#211f16; border:1px solid rgba(212,175,55,.35); border-radius:6px; padding:14px 16px; margin-top:18px;">
            <p style="color:#FFFFF0; line-height:1.6; margin:0 0 8px 0; font-weight:700;">Choose an option in your DemoShop customer dashboard:</p>
            <p style="color:#C5C5B5; line-height:1.6; margin:0;">Keep appointment with ${escapeHtml(data.barberName)} and accept the estimated start, or reschedule to the next calendar day using an available time with the same barber. Occupied times cannot be selected.</p>
            ${portalUrl ? `<a href="${escapeHtml(portalUrl)}" style="display:inline-block; margin-top:14px; padding:11px 16px; border-radius:5px; background:#D4AF37; color:#121212; font-weight:700; text-decoration:none; font-size:13px;">Open Customer Dashboard</a>` : ''}
          </div>
          <p style="color:#888878; line-height:1.6; font-size:12px; margin-bottom:0;">Your original reservation time has not been silently changed. If you do not choose, the reservation remains active at the estimated time shown above.</p>
        </td></tr>
        <tr><td style="padding:20px 24px; text-align:center; color:#888878; font-size:11px; border-top:1px solid rgba(255,255,255,.08);">DemoShop's Barbers · ${escapeHtml(branchName)}</td></tr>
      </table>
      <div style="display:none">[${uniqueToken}]</div>
    </div>
  `;
};

/**
 * Generates a responsive, dark-themed HTML email template matching DemoShop Barbershop aesthetic
 * for Cashier reservation decisions (Confirmed / Declined), Customer Cancellation, and Booking Received.
 */
export const getReservationDecisionEmailHtml = (data: ReservationDecisionEmailPayload): string => {
  const isConfirmed = data.decision === 'CONFIRMED';
  const isReceived = data.decision === 'RECEIVED';
  const isCancelled = data.decision === 'CANCELLED';
  const name = data.customerName?.trim() || 'Valued Customer';
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  let statusColor = '#EF4444';
  let statusBg = 'rgba(239, 68, 68, 0.15)';
  let statusBorder = 'rgba(239, 68, 68, 0.4)';
  let statusBadgeText = 'DECLINED';
  let statusHeadline = 'Reservation Declined';
  let greetingSubtext = 'your reservation request was processed by our front desk.';

  if (isConfirmed) {
    statusColor = '#10B981';
    statusBg = 'rgba(16, 185, 129, 0.15)';
    statusBorder = 'rgba(16, 185, 129, 0.4)';
    statusBadgeText = 'CONFIRMED';
    statusHeadline = 'Reservation Confirmed';
    greetingSubtext = 'your reservation has been confirmed and scheduled with our barber.';
  } else if (isReceived) {
    statusColor = '#D4AF37';
    statusBg = 'rgba(212, 175, 55, 0.15)';
    statusBorder = 'rgba(212, 175, 55, 0.4)';
    statusBadgeText = 'BOOKING RECEIVED';
    statusHeadline = 'Booking Received — Under Review';
    greetingSubtext = 'we have received your booking request and deposit proof. Our team is reviewing the appointment.';
  } else if (isCancelled) {
    statusColor = '#F59E0B';
    statusBg = 'rgba(245, 158, 11, 0.15)';
    statusBorder = 'rgba(245, 158, 11, 0.4)';
    statusBadgeText = 'BOOKING CANCELLED';
    statusHeadline = 'Booking Cancelled';
    greetingSubtext = 'your appointment booking has been successfully cancelled as requested.';
  }

  const branchName = data.branchName || "DemoShop's Barbers";
  const branchAddress = data.branchAddress || 'Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan City';
  const actionTimeStr = formatActionTimestamp(data.actionTimestamp);

  const serviceRowsHtml = (data.services && data.services.length > 0)
    ? data.services.map(s => `
      <tr>
        <td style="padding: 6px 0; color: #E5E5D8; font-size: 13px; text-align: left;">
          ${escapeHtml(s.title)}
        </td>
        <td style="padding: 6px 0; color: #D4AF37; font-size: 13px; text-align: right; font-weight: 600;">
          ${formatMoney(s.price)}
        </td>
      </tr>
    `).join('')
    : `
      <tr>
        <td style="padding: 6px 0; color: #E5E5D8; font-size: 13px; text-align: left;">Grooming Service</td>
        <td style="padding: 6px 0; color: #D4AF37; font-size: 13px; text-align: right; font-weight: 600;">${formatMoney(data.totalAmount)}</td>
      </tr>
    `;

  const reasonTitle = isCancelled ? 'Cancellation Reason' : 'Reason for Decline';
  const declineReasonHtml = (!isConfirmed && !isReceived && data.declineReason)
    ? `
      <div style="background-color: #221414; border: 1px solid ${statusBorder}; border-radius: 6px; padding: 14px 16px; margin: 18px 0; text-align: left;">
        <span style="display: block; font-size: 11px; font-weight: 700; color: ${statusColor}; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;">
          ${reasonTitle}:
        </span>
        <p style="font-size: 13px; color: #FFFFF0; margin: 0; line-height: 1.4;">
          ${escapeHtml(data.declineReason)}
        </p>
      </div>
    `
    : '';

  return `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #121212; padding: 32px 12px; margin: 0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #1C1C1C; border: 1px solid rgba(212, 175, 55, 0.35); border-radius: 8px; overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.65);">
        
        <!-- Header with Brand Logo -->
        <tr>
          <td style="padding: 30px 24px 20px 24px; text-align: center; background: linear-gradient(180deg, #252525 0%, #1C1C1C 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
            <img src="cid:demoshoplogo" alt="DemoShop's Barbers" width="90" style="display: block; width: 90px; max-width: 90px; height: auto; margin: 0 auto 12px auto;" />
            <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #D4AF37; font-size: 20px; margin: 0; letter-spacing: 1px; font-weight: 700; text-transform: uppercase;">
              DemoShop's Barbers
            </h1>
          </td>
        </tr>

        <!-- Status Banner -->
        <tr>
          <td style="padding: 20px 24px 12px 24px; text-align: center;">
            <div style="display: inline-block; background-color: ${statusBg}; border: 1px solid ${statusBorder}; border-radius: 20px; padding: 5px 18px; margin-bottom: 12px;">
              <span style="font-size: 11px; font-weight: 800; color: ${statusColor}; letter-spacing: 1px; text-transform: uppercase;">
                ${statusBadgeText}
              </span>
            </div>
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #FFFFF0; font-size: 20px; margin: 0 0 8px 0; font-weight: 700;">
              ${statusHeadline}
            </h2>
            <p style="font-size: 13px; color: #C5C5B5; line-height: 1.5; margin: 0;">
              Hello <strong style="color: #FFFFF0;">${escapeHtml(name)}</strong>, ${greetingSubtext}
            </p>
            ${declineReasonHtml}
          </td>
        </tr>

        <!-- Reservation Breakdown Section -->
        <tr>
          <td style="padding: 12px 24px 20px 24px;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #161616; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 16px;">
              <tr>
                <td colspan="2" style="padding-bottom: 10px; border-bottom: 1px solid rgba(212, 175, 55, 0.2); font-size: 11px; font-weight: 700; color: #D4AF37; text-transform: uppercase; letter-spacing: 0.8px;">
                  Reservation Details
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0 4px 0; color: #9E9E8E; font-size: 12px; width: 40%;">Scheduled Date:</td>
                <td style="padding: 8px 0 4px 0; color: #FFFFF0; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(data.preferredDate)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Time Slot:</td>
                <td style="padding: 4px 0; color: #FFFFF0; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(data.preferredTime)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Assigned Barber:</td>
                <td style="padding: 4px 0; color: #D4AF37; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(data.barberName)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Branch / Location:</td>
                <td style="padding: 4px 0; color: #FFFFF0; font-size: 12px; text-align: right;">${escapeHtml(branchName)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Processed By:</td>
                <td style="padding: 4px 0; color: #C5C5B5; font-size: 12px; text-align: right;">${escapeHtml(data.cashierName)} (Front Desk)</td>
              </tr>
              <tr>
                <td style="padding: 4px 0 0 0; color: #9E9E8E; font-size: 12px;">Action Timestamp:</td>
                <td style="padding: 4px 0 0 0; color: #C5C5B5; font-size: 12px; text-align: right;">${escapeHtml(actionTimeStr)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Services & Payment Summary -->
        <tr>
          <td style="padding: 0 24px 24px 24px;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #161616; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 16px;">
              <tr>
                <td colspan="2" style="padding-bottom: 10px; border-bottom: 1px solid rgba(212, 175, 55, 0.2); font-size: 11px; font-weight: 700; color: #D4AF37; text-transform: uppercase; letter-spacing: 0.8px;">
                  Payment Summary
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top: 6px;">
                  <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    ${serviceRowsHtml}
                  </table>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding: 8px 0 0 0;">
                  <div style="height: 1px; background: rgba(255, 255, 255, 0.08); margin: 6px 0;"></div>
                </td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">
                  ${data.guestCount && data.guestCount > 1
                    ? `Reservation Fee Paid (${data.guestCount} Guests):`
                    : 'Reservation Fee Paid:'}
                </td>
                <td style="padding: 4px 0; color: #10B981; font-size: 13px; font-weight: 600; text-align: right;">
                  ${formatMoney(data.reservationFee ?? (data.depositPaid !== undefined && data.depositPaid > 0 ? data.depositPaid : (data.guestCount && data.guestCount > 1 ? data.guestCount * 50 : 50)))} <span style="background-color: #10B981; color: #090909; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; margin-left: 6px; vertical-align: middle; display: inline-block;">PAID</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Total:</td>
                <td style="padding: 4px 0; color: #FFFFF0; font-size: 13px; font-weight: 600; text-align: right;">${formatMoney(data.totalAmount)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0 0 0; color: #D4AF37; font-size: 14px; font-weight: 700;">Remaining Balance Due at Shop:</td>
                <td style="padding: 8px 0 0 0; color: #D4AF37; font-size: 16px; font-weight: 700; text-align: right;">${formatMoney(data.remainingBalance)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Operational Note / Reminders -->
        <tr>
          <td style="padding: 0 24px 20px 24px;">
            <div style="background: rgba(212, 175, 55, 0.05); border: 1px dashed rgba(212, 175, 55, 0.3); border-radius: 6px; padding: 12px 16px;">
              <p style="font-size: 11px; color: #C5C5B5; line-height: 1.5; margin: 0;">
                <strong style="color: #D4AF37;">Shop Policy Reminder:</strong> Please arrive 5–10 minutes before your scheduled slot. If you need to cancel or reschedule, kindly notify the front desk at least 1 hour in advance.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 20px 24px 28px 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); background-color: #171717;">
            <p style="font-size: 11px; color: #888878; margin: 0 0 6px 0;">
              ${escapeHtml(branchAddress)}
            </p>
            <p style="font-size: 11px; color: #888878; margin: 0 0 12px 0;">
              Hotline: <strong style="color: #C5C5B5;">855-0123</strong> &bull; Support: <a href="mailto:portfolio@example.invalid" style="color: #D4AF37; text-decoration: none;">portfolio@example.invalid</a>
            </p>
            <p style="font-size: 10px; color: #555548; margin: 0;">
              &copy; ${new Date().getFullYear()} DemoShop's Barbers. All rights reserved.
            </p>
          </td>
        </tr>

      </table>

      <!-- Unique token prevents Gmail from collapsing email threads -->
      <div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        [${uniqueToken}]
      </div>
    </div>
  `;
};

export interface BarberBookingEmailPayload {
  barberName: string;
  customerName: string;
  preferredDate: string;
  preferredTime: string;
  branchName?: string;
  branchAddress?: string | null;
  services: Array<{ serviceId?: number; title: string; price?: number }>;
  guestCount?: number;
}

/**
 * Generates an email template notifying a barber of a newly confirmed booking assigned to them.
 * Strictly adheres to customer privacy by excluding sensitive contact/payment details.
 */
export const getBarberBookingNotificationHtml = (data: BarberBookingEmailPayload): string => {
  const branchName = data.branchName || "DemoShop's Barbers";
  const branchAddress = data.branchAddress || 'SampleBranch EDSA-Shaw, Mandaluyong City, Philippines';
  const uniqueToken = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const serviceItemsHtml = (data.services || [])
    .map(
      (s) => `
        <tr>
          <td style="padding: 6px 0; color: #FFFFF0; font-size: 13px; font-weight: 500;">
            &bull; ${escapeHtml(s.title)}
          </td>
        </tr>
      `
    )
    .join('');

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0F0F0F; color: #FFFFF0; padding: 24px 12px; margin: 0; min-height: 100%;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; margin: 0 auto; background-color: #1A1A1A; border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 8px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
        
        <!-- Header with Brand Logo -->
        <tr>
          <td style="padding: 28px 24px 18px 24px; text-align: center; background: linear-gradient(180deg, #252525 0%, #1C1C1C 100%); border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
            <img src="cid:demoshoplogo" alt="DemoShop's Barbers" width="90" style="display: block; width: 90px; max-width: 90px; height: auto; margin: 0 auto 12px auto;" />
            <h1 style="font-family: 'Playfair Display', Georgia, serif; color: #D4AF37; font-size: 20px; margin: 0; letter-spacing: 1px; font-weight: 700; text-transform: uppercase;">
              DemoShop's Barbers
            </h1>
          </td>
        </tr>

        <!-- Status Banner -->
        <tr>
          <td style="padding: 20px 24px 12px 24px; text-align: center;">
            <div style="display: inline-block; background-color: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 20px; padding: 5px 18px; margin-bottom: 12px;">
              <span style="font-size: 11px; font-weight: 800; color: #34D399; letter-spacing: 1px; text-transform: uppercase;">
                CONFIRMED BOOKING
              </span>
            </div>
            <h2 style="font-family: 'Playfair Display', Georgia, serif; color: #FFFFF0; font-size: 20px; margin: 0 0 8px 0; font-weight: 700;">
              New Customer Appointment
            </h2>
            <p style="font-size: 13px; color: #C5C5B5; line-height: 1.5; margin: 0;">
              Hello <strong style="color: #FFFFF0;">${escapeHtml(data.barberName)}</strong>, a customer has booked an appointment with you.
            </p>
          </td>
        </tr>

        <!-- Appointment Details Section -->
        <tr>
          <td style="padding: 12px 24px 16px 24px;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #161616; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 16px;">
              <tr>
                <td colspan="2" style="padding-bottom: 10px; border-bottom: 1px solid rgba(212, 175, 55, 0.2); font-size: 11px; font-weight: 700; color: #D4AF37; text-transform: uppercase; letter-spacing: 0.8px;">
                  Appointment Details
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 0 4px 0; color: #9E9E8E; font-size: 12px; width: 40%;">Customer Name:</td>
                <td style="padding: 8px 0 4px 0; color: #FFFFF0; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(data.customerName)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Scheduled Date:</td>
                <td style="padding: 4px 0; color: #D4AF37; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(data.preferredDate)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Time Slot:</td>
                <td style="padding: 4px 0; color: #34D399; font-size: 13px; font-weight: 600; text-align: right;">${escapeHtml(data.preferredTime)}</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Branch / Location:</td>
                <td style="padding: 4px 0; color: #FFFFF0; font-size: 12px; text-align: right;">${escapeHtml(branchName)}</td>
              </tr>
              ${data.guestCount && data.guestCount > 1 ? `
              <tr>
                <td style="padding: 4px 0; color: #9E9E8E; font-size: 12px;">Party Size:</td>
                <td style="padding: 4px 0; color: #FFFFF0; font-size: 12px; text-align: right;">${data.guestCount} Guests</td>
              </tr>
              ` : ''}
            </table>
          </td>
        </tr>

        <!-- Services Section -->
        <tr>
          <td style="padding: 0 24px 20px 24px;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #161616; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; padding: 16px;">
              <tr>
                <td style="padding-bottom: 8px; border-bottom: 1px solid rgba(212, 175, 55, 0.2); font-size: 11px; font-weight: 700; color: #D4AF37; text-transform: uppercase; letter-spacing: 0.8px;">
                  Requested Services
                </td>
              </tr>
              <tr>
                <td style="padding-top: 6px;">
                  <table width="100%" border="0" cellpadding="0" cellspacing="0">
                    ${serviceItemsHtml || '<tr><td style="color:#FFFFF0;font-size:13px;">Standard Haircut</td></tr>'}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Operational Note / Reminders -->
        <tr>
          <td style="padding: 0 24px 20px 24px;">
            <div style="background: rgba(212, 175, 55, 0.05); border: 1px dashed rgba(212, 175, 55, 0.3); border-radius: 6px; padding: 12px 16px;">
              <p style="font-size: 11px; color: #C5C5B5; line-height: 1.5; margin: 0;">
                <strong style="color: #D4AF37;">Preparation Reminder:</strong> Please ensure your station, tools, and consumables are prepared at least 5–10 minutes prior to this scheduled appointment.
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding: 20px 24px 28px 24px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.08); background-color: #171717;">
            <p style="font-size: 11px; color: #888878; margin: 0 0 6px 0;">
              ${escapeHtml(branchAddress)}
            </p>
            <p style="font-size: 11px; color: #888878; margin: 0 0 12px 0;">
              Hotline: <strong style="color: #C5C5B5;">855-0123</strong> &bull; Support: <a href="mailto:portfolio@example.invalid" style="color: #D4AF37; text-decoration: none;">portfolio@example.invalid</a>
            </p>
            <p style="font-size: 10px; color: #555548; margin: 0;">
              &copy; ${new Date().getFullYear()} DemoShop's Barbers. All rights reserved.
            </p>
          </td>
        </tr>

      </table>

      <!-- Unique token prevents Gmail from collapsing email threads -->
      <div style="display:none;font-size:1px;color:#121212;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
        [${uniqueToken}]
      </div>
    </div>
  `;
};

export default {
  generateVerificationCode,
  getVerificationEmailHtml,
  getForgotPasswordEmailHtml,
  getChangePasswordEmailHtml,
  getReservationDecisionEmailHtml,
  getBarberBookingNotificationHtml,
};
