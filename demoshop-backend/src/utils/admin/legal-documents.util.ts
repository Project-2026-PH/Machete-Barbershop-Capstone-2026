/**
 * System-generated detailed legal documents starter templates and migration utilities.
 * Tailored to DemoShop's actual system architecture and operational behavior.
 */

export interface SystemLegalDocument {
  id: string;
  documentKey: 'termsOfService' | 'privacyPolicy';
  slug: string;
  title: string;
  content: string;
  contentMarkdown: string;
  status: 'active' | 'draft';
  enabled: boolean;
  lastUpdated: string;
  lastUpdatedAt: string;
}

export interface SystemLegalDocs {
  termsOfService: SystemLegalDocument;
  privacyPolicy: SystemLegalDocument;
}

/**
 * Returns formatted current date in Asia/Manila timezone (e.g. "September 25, 2026").
 */
export function getManilaFormattedDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(date);
}

/**
 * Detects whether existing document content is an unedited legacy development placeholder.
 * Used to safely migrate development database records without overwriting custom shop edits.
 */
export function isUntouchedLegacyPlaceholder(
  key: 'termsOfService' | 'privacyPolicy',
  content?: string | null
): boolean {
  if (!content || !content.trim()) return true;
  const trimmed = content.trim();

  if (key === 'termsOfService') {
    // If it already has the 20-section detailed starter content, it's not a legacy placeholder
    if (trimmed.includes('## 20. Contact Information')) return false;

    // Detect old 4-section short placeholder or un-numbered 11-section placeholder
    return (
      trimmed.includes('non-refundable reservation deposit (standard ₱50)') ||
      trimmed.includes('Realistic terms...') ||
      (trimmed.length < 3500 && trimmed.includes('Acceptance of Terms'))
    );
  } else {
    // If it already has the 11-section detailed starter content with 1.1-1.8 subsections
    if (trimmed.includes('### 1.1 Account Information')) return false;

    // Detect old short placeholder
    return (
      trimmed.includes('Client-Side OCR Processing') ||
      trimmed.includes('Realistic terms...') ||
      (trimmed.length < 3500 && trimmed.includes('Information We Collect'))
    );
  }
}

/**
 * Constructs detailed starter legal templates dynamically referencing the shop's
 * current business name, contact email, and branch location.
 */
export function buildDefaultLegal(
  shopName?: string,
  contactEmail?: string,
  address?: string
): SystemLegalDocs {
  const effectiveShopName = shopName || "DemoShop's Barbers";
  const effectiveEmail = contactEmail || 'portfolio@example.invalid';
  const effectiveAddress =
    address || 'Ground floor, SampleBranch, Brgy. Kaypian, City of San Jose del Monte, Bulacan';
  const formattedDate = getManilaFormattedDate();
  const isoNow = new Date().toISOString();

  const termsMarkdown = `# Terms of Service

Welcome to ${effectiveShopName}. These Terms of Service ("Terms") govern your access to and use of our web booking application, customer portal, in-shop queue coordination system, and grooming services provided at our physical barbershop locations.

Please read these Terms carefully before scheduling an appointment or utilizing our in-shop services. By accessing our platform, booking an appointment, or receiving services at our shop, you agree to be bound by these Terms. If you do not agree, please do not use our digital platform or services.

## 1. Acceptance of Terms
By creating an account, scheduling a grooming reservation, joining our walk-in queue, or entering ${effectiveShopName}, you confirm that you have read, understood, and agreed to be legally bound by these Terms and our Privacy Policy. These Terms apply to all visitors, registered customers, walk-in guests, and staff members.

## 2. Use of the DemoShop's Platform
${effectiveShopName} grants you a limited, non-exclusive, non-transferable, and revocable license to access our online booking platform strictly for personal, non-commercial purposes, including:
- Viewing our service catalog, descriptions, and current pricing.
- Reviewing barber availability and scheduling appointment reservations.
- Monitoring your position in our real-time walk-in queue.
- Reviewing your personal service history and digital receipts.

You agree not to disrupt, reverse engineer, scrape, probe, or introduce malicious code into our platform or counter terminals.

## 3. Customer Accounts
To schedule advance appointments and view service records, you may register for a customer account. When registering:
- You must provide accurate, current, and complete personal information.
- You are solely responsible for safeguarding your account credentials, including your password.
- You must immediately notify shop administration if you detect any unauthorized access or breach of security.
- Accounts are personal and may not be shared, transferred, or sold to third parties.

## 4. Account Information and Responsibilities
You agree to maintain accurate contact information in your account profile, particularly your mobile telephone number and email address. ${effectiveShopName} relies on these contact points to deliver booking confirmations, queue notifications, and schedule adjustments. We are not liable for missed appointments or unreceived advisories resulting from inaccurate contact details provided by the customer.

## 5. Services and Pricing
Our current service catalog—including haircuts, beard trims, razor styling, wash treatments, and grooming packages—is published on our platform and in-shop menu boards.
- **Currency:** All rates are quoted in Philippine Pesos (₱).
- **Price Integrity:** Confirmed online reservations lock in the service price applicable at the time of booking.
- **Price Adjustments:** We reserve the right to revise service prices and menu offerings at any time. Updated pricing applies immediately to all newly scheduled reservations and walk-in services.
- **Additional Services:** Any supplementary services or grooming add-ons requested by the customer in the chair will be added to the final counter ticket and charged accordingly.

## 6. Appointments and Reservations
Our online booking system allows registered customers to schedule appointments in advance:
- **Advance Booking Window:** Reservations may be booked up to 30 days in advance subject to barber station availability.
- **Arrival Expectations:** Customers must arrive at the shop at least 10 minutes prior to their scheduled start time to allow for check-in.
- **Reservation Fee Policy:** A non-refundable reservation fee of ₱50.00 is required per head/guest. For group bookings, the total reservation deposit corresponds directly to the number of reserved seats (e.g., 2 guests = ₱100.00, 3 guests = ₱150.00). All reservation fees are strictly non-refundable.
- **Grace Period & Late Arrivals:** If you arrive more than 15 minutes past your reserved start time, your reserved chair may be reassigned or converted to walk-in status to prevent cascading schedule delays for subsequent customers.
- **Shop Discretion:** The shop reserves the right to decline or reschedule reservations due to equipment maintenance, staff emergency, or force majeure events.

## 7. Walk-In Customers and Queue Management
We welcome walk-in customers during regular business hours:
- **Queue Assignment:** Walk-ins are registered at the cashier counter and assigned a daily queue reference sequence based on arrival order.
- **Estimated Wait Times:** Wait times displayed on in-shop screens or via mobile queue links are automated estimates calculated from average service durations. Actual wait times may vary depending on the complexity of haircuts and styling treatments in progress.
- **Physical Presence:** Walk-in customers must remain on premises or return promptly when their queue sequence is called. Unanswered calls after a reasonable courtesy period may result in forfeiture of queue priority.

## 8. Barber Availability and Assignment
While customers may request a specific barber during online booking, chair assignment remains subject to daily operational circumstances:
- **Shift Rosters:** Barbers operate under scheduled shifts. Unexpected illness, emergency leaves, or approved shift modifications may occasionally impact barber availability.
- **Alternative Barber:** If your selected barber becomes unavailable, our front desk will offer you the choice to be serviced by another qualified barber at your scheduled time or reschedule your appointment without penalty.
- **First Available Option:** Customers selecting "Any Available Barber" will be routed to the next open chair qualified to perform the requested service.

## 9. Cancellations and Rescheduling
We understand that unexpected schedule changes happen:
- **Cancellation & Rescheduling Window:** Appointment cancellations and rescheduling/rebooking are strictly permitted only if made more than 24 hours prior to the scheduled appointment time. Cancellations or changes made within 24 hours will forfeit the ₱50 reservation deposit.
- **Customer Cancellation:** You may cancel or reschedule your reservation through your customer portal or by notifying the shop prior to your appointment time.
- **Early Notice Courtesy:** Rescheduling more than 24 hours in advance allows the reserved chair time to be made available to other clients and preserves your reservation deposit.
- **Shop Rescheduling:** In the rare event of sudden power outages, facility disruptions, or emergency closures, shop management will contact affected customers promptly to offer priority rescheduling.

## 10. Payments
Payment for all grooming services and retail products is due upon service completion or as part of the booking checkout workflow:
- **Tender Options:** We accept payment methods currently made available by the shop, which may include cash at the counter register and shop-configured electronic payment methods.
- **Dynamic Configuration:** Accepted payment channels are configured and maintained dynamically by Shop Administration. Customers should refer to the payment options presented during checkout or displayed at the counter.
- **Full Settlement:** Services must be settled in full prior to departure from the premises.

## 11. QR and Digital Payments
When utilizing electronic wallet or QR payments:
- **Merchant QR Accuracy:** Customers must scan only the official shop merchant QR code displayed on the checkout screen or counter terminal.
- **Customer Verification:** The customer is responsible for ensuring the transferred amount matches the authoritative service charge before confirming payment in their digital wallet.
- **Reference Number Requirement:** To validate payment, the customer must provide the authentic transaction reference number generated by their payment provider and, upon request, present the digital receipt screen to the cashier.
- **Fraud Prevention:** Submitting fabricated, invalid, or recycled payment reference numbers constitutes fraudulent conduct and will result in immediate reservation cancellation and potential denial of future service.

## 12. Cash and Point-of-Sale Transactions
For customers paying with physical cash:
- Payments are processed exclusively at the front desk cashier register.
- Cashiers verify banknotes and issue physical or electronic receipts.
- Customers are encouraged to inspect change before leaving the register counter.

## 13. Customer Responsibilities
To maintain a clean, orderly, and respectful environment for all clients, customers agree to:
- **Conduct:** Treat barbers, staff, and fellow patrons with courtesy and respect. Verbal abuse, harassment, discrimination, intoxication, or disorderly conduct will result in immediate refusal of service and ejection from the premises.
- **Health & Safety:** Inform your barber prior to service regarding any skin conditions, open scalp wounds, lice, infectious symptoms, or allergies to grooming products or antiseptics. Barbers reserve the right to decline service if open lesions or communicable scalp conditions present a health hazard.
- **Personal Belongings:** Customers are responsible for their personal possessions. ${effectiveShopName} is not liable for lost, stolen, or damaged personal property on shop premises.

## 14. Appointment and Service Availability
${effectiveShopName} operates under standard branch business hours established by management. We endeavor to maintain full operating capacity, but service availability may be constrained by:
- In-shop chair capacity and active barber shift schedules.
- Mandatory sanitization, station cleaning, and equipment maintenance intervals between clients.
- Unscheduled municipal utility interruptions, including power, water, or internet outages.

## 15. Service History and Records
Our platform automatically records your service history, completed styles, dates, and transactions. These records are maintained to assist barbers in reproducing your preferred cut and tracking loyalty rewards. You may review your historical haircut records within your account dashboard.

## 16. Acceptable Use
You agree not to misuse our digital platforms or services. Prohibited actions include:
- Making fictitious, automated, or abusive reservations with no intention of attending.
- Submitting false customer names, fake telephone numbers, or unauthorized payment reference codes.
- Attempting to bypass security controls, tamper with queue algorithms, or access administrative endpoints.
- Harassing staff members or abusing platform communication channels.

Violations of acceptable use may result in account suspension, blacklisting of phone numbers, and revocation of booking privileges.

## 17. System Availability
While we strive to provide reliable and uninterrupted access to our digital booking application and queue status systems, we do not warrant that our digital services will operate without interruption, delays, or errors at all times. From time to time, scheduled maintenance, server updates, or telecommunications disruptions may affect system access. In such events, physical walk-in queue operations at the shop remain operational.

## 18. Changes to Services or Features
${effectiveShopName} reserves the right to modify, enhance, or discontinue any feature, service category, or operational workflow at any time without prior notice. Such changes will not affect grooming services for confirmed reservations already in progress.

## 19. Changes to These Terms
We reserve the right to revise these Terms of Service as our business operations, digital tools, and legal obligations evolve. All amendments take effect immediately upon publication on our platform. The updated revision date will be displayed in the document metadata. Continued use of our booking platform or services following publication constitutes acceptance of the amended Terms.

## 20. Contact Information
If you have questions, comments, or inquiries regarding these Terms of Service or your grooming appointments, please contact our management team:
- **Business Name:** ${effectiveShopName}
- **Location:** ${effectiveAddress}
- **Email:** ${effectiveEmail}
- **Counter Support:** Speak directly with our front desk cashier or shop manager during regular business hours.`;

  const privacyMarkdown = `# Privacy Policy

${effectiveShopName} ("we", "our", or "us") provides grooming services, appointment reservations, and queue coordination through our digital web portal and in-shop counter operations. This Privacy Policy explains our data practices, detailing the specific personal information we collect, how it is processed and secured, and your rights regarding your information when using our services.

## 1. Information We Collect
We collect only the personal information required to facilitate grooming reservations, in-shop queue coordination, payment verification, and customer service records.

### 1.1 Account Information
When you create a customer account on our platform, we collect:
- Full legal name and preferred username.
- Email address used for authentication and account notifications.
- Cryptographically salted password hash (we never store plain-text passwords).
- Account creation timestamp, verification status, and profile avatar image URL if uploaded.

### 1.2 Contact Information
To communicate essential service updates, we collect:
- Mobile telephone number (Philippine standard format) used for reservation reminders and SMS notices.
- Email address used for verification one-time passwords (OTPs), schedule modification notices, and digital receipt delivery.

### 1.3 Booking and Reservation Information
When you schedule an appointment through our online calendar, we record:
- Selected appointment date and preferred arrival time slot.
- Chosen branch location and designated barber (or selection for any available barber).
- Specific grooming services requested from our service menu.
- Reservation workflow status (e.g., waiting, confirmed, completed, or cancelled).
- Arrival check-in timestamps and service commencement records.

### 1.4 Queue and Walk-In Information
For in-shop walk-in customers and real-time chair flow, we record:
- Customer or guest identifier name provided at the front desk cashier counter.
- Daily queue sequence number and generated guest reference code.
- Cryptographic SHA-256 hash of walk-in digital queue tokens for mobile status lookups.
- Position in queue, service timer start and completion timestamps, and assigned barber station.

### 1.5 Service History
To provide continuity of grooming care and track loyalty benefits, our system maintains:
- Historical log of completed haircuts, beard trims, and grooming treatments.
- Dates and times of prior visits and the specific barber who performed each service.
- Authoritative service pricing recorded at the time of each visit.
- Accumulated customer loyalty points and visit counters.

### 1.6 Payment Information
For transaction recording and register balance reconciliation, we record:
- Chosen payment method (Cash at counter register, or shop-configured electronic options such as GCash, Maya, or QR Ph).
- Authorized total transaction amount.
- Customer-provided digital transaction reference numbers for electronic wallet transfers.
- Uploaded digital screenshot images submitted as proof of payment.
- Cryptographic SHA-256 hash of submitted receipt images to prevent duplicate submission.
- Front-desk cashier verification decisions and audit timestamps.

**Card Payment Clarification:** ${effectiveShopName} does NOT collect, capture, process, or store credit card numbers, debit card numbers, expiration dates, CVV security codes, cardholder PINs, or online banking passwords.

### 1.7 Feedback and Reviews
When you voluntarily review your haircut experience, we collect:
- Star rating evaluation (1 to 5 stars).
- Optional written comments or feedback regarding service quality.
- Association with the specific completed queue entry and servicing barber.

### 1.8 Technical and Administrative Information
To preserve system integrity and ensure security compliance, we record:
- Internet Protocol (IP) addresses and browser user-agent details during authentication.
- Cryptographic session tokens and session activity expiration timestamps.
- System audit log entries recording administrative adjustments, permission updates, and data modifications.
- Aggregated operational health metrics to monitor server response times and queue performance.

## 2. How We Use Your Information
Your personal data is used solely for legitimate operational and service delivery purposes:
- **Account Management:** Authenticating registered users, safeguarding access credentials, and managing customer profiles.
- **Reservations & Scheduling:** Reserving chair time slots, preventing double-booking, and coordinating barber availability.
- **Queue Operations:** Managing fair, real-time queue sequences for walk-in clients and scheduled appointments.
- **Barber & Service Assignment:** Routing service requests to qualified barbers based on daily shift rosters.
- **Payment Recording & Verification:** Verifying electronic transaction reference numbers against merchant accounts, balancing daily register floats, and preventing fraudulent submissions.
- **Customer History:** Allowing returning customers and barbers to review past service styles and preferences.
- **Operational Notifications:** Delivering automated booking confirmations, cancellation alerts, schedule delay advisories, and transactional e-receipts.
- **Customer Support:** Investigating and resolving booking discrepancies, schedule conflicts, or billing inquiries.
- **System Administration & Security:** Detecting unauthorized system access, maintaining immutable audit trails, and safeguarding application stability.

## 3. How Information Is Stored and Processed
We process information through modern, secure cloud infrastructure:
- **Primary Relational Database:** All structured customer accounts, bookings, queue states, and financial transactions are stored in PostgreSQL databases managed through Supabase with role-based access restrictions.
- **Secure File Storage:** Customer profile avatars and payment proof screenshots are held in access-restricted cloud storage buckets.
- **Distributed Cache & Locking:** We utilize Redis for distributed locks during high-volume booking operations and API rate-limiting to prevent automated denial-of-service abuse.
- **In-Shop Offline Fallback:** If internet connectivity to our primary cloud database is momentarily disrupted, an encrypted local SQLite operational cache at the branch counter preserves walk-in queue continuity until synchronization is restored.
- **Client-Side Optical Pre-Scanning:** When you upload an electronic wallet receipt image, a client-side OCR utility running locally in your browser assists in extracting the reference number before transmitting the data to our servers.

## 4. Service Providers
We collaborate exclusively with established infrastructure providers necessary for our core operations:
- **Supabase Inc.:** Cloud database hosting, user authentication infrastructure, and media storage.
- **Redis Infrastructure:** High-performance caching, distributed synchronization, and rate-limiting.
- **Transactional Communication Gateways:** SMS and email delivery partners used exclusively to deliver transactional notifications and verification codes.

We do NOT sell, rent, monetize, or trade customer personal data with external data brokers or advertising networks.

## 5. Payment Information and QR Verification Workflow
Our shop utilizes an offline-assisted digital payment verification model rather than an automated direct-debit gateway:
- **Configured Merchant QR:** The shop provides official merchant QR codes (e.g., GCash, Maya, or QR Ph) configured in Shop Administration.
- **Customer Payment Action:** The customer scans the displayed merchant QR code using their independent banking or electronic wallet application and authorizes the transfer directly.
- **Reference Number Submission:** The customer inputs the transaction reference number issued by their e-wallet and optionally submits a screenshot receipt.
- **Cashier Verification:** A shop cashier cross-checks the reference number against the shop's incoming merchant notifications or payment register.
- **Immutable Transaction Record:** Upon manual verification by the cashier, the payment attempt is marked as confirmed, closing the queue entry and generating an immutable digital receipt record.

## 6. Data Retention
We retain personal information only for as long as necessary to fulfill the operational purposes described in this policy:
- **Active Accounts & Booking Records:** Retained throughout the lifetime of your active customer account to provide continuous booking history and loyalty tracking.
- **Accounting & Financial Records:** Transaction logs, cashier register balances, payment reference records, and e-receipts are retained in accordance with Philippine commercial bookkeeping and tax statutory obligations.
- **Account Deactivation (Soft Deletion):** When an account is deactivated or requested for deletion, the record is flagged with a deletion timestamp (\`deleted_at\`), revoking login capabilities while preserving historical transactional ledgers required for business auditing.
- **Verification Images:** Uploaded payment screenshots are retained only as long as needed for transaction auditing, after which they are subject to routine storage archival policies.

## 7. Data Security
We implement appropriate administrative, physical, and technical safeguards to protect your personal information:
- Encrypted data transmission using Transport Layer Security (TLS/HTTPS).
- Cryptographic one-way hashing for user passwords.
- Strict role-based access controls (RBAC) limiting administrative privileges to authorized personnel.
- Database access controls ensuring staff view only the data necessary to execute their responsibilities.

*Security Posture:* While we enforce rigorous safeguards in line with industry standards, no method of transmission over the Internet or electronic storage system can be guaranteed to be absolutely impervious to security threats.

## 8. User Choices and Account Controls
You retain direct control over your personal information:
- **Profile Updates:** You can update your name, contact telephone number, and avatar directly within your Customer Dashboard settings.
- **Password Management:** You may update your account credentials at any time by requesting a password change one-time pin (OTP) delivered to your registered email address.
- **Inquiries and Corrections:** You may visit our branch cashier counter or contact shop management via email to request review or correction of recorded contact details.

## 9. Children's Privacy
Our digital booking platform is intended for use by individuals who have reached the age of majority or minors who have obtained the permission of a parent or legal guardian. Parents or guardians may book haircuts and grooming services on behalf of their children. We do not knowingly collect personal registration credentials directly from unattended minors under 13 years of age.

## 10. Changes to This Privacy Policy
We may update this Privacy Policy periodically to reflect enhancements to our booking features, changes in our payment options, or modifications to statutory regulations. When changes are made, the updated document will be published on our web portal with the revision date displayed in the document header.

## 11. Contact Information
If you have questions, feedback, or concerns regarding this Privacy Policy or our data protection practices, please contact us:
- **Business Name:** ${effectiveShopName}
- **Location:** ${effectiveAddress}
- **Email:** ${effectiveEmail}
- **In Person:** Visit our front desk cashier during regular shop operating hours.`;

  return {
    termsOfService: {
      id: 'termsOfService',
      documentKey: 'termsOfService',
      slug: 'terms-of-service',
      title: 'Terms of Service',
      content: termsMarkdown,
      contentMarkdown: termsMarkdown,
      status: 'active' as const,
      enabled: true,
      lastUpdated: formattedDate,
      lastUpdatedAt: isoNow,
    },
    privacyPolicy: {
      id: 'privacyPolicy',
      documentKey: 'privacyPolicy',
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      content: privacyMarkdown,
      contentMarkdown: privacyMarkdown,
      status: 'active' as const,
      enabled: true,
      lastUpdated: formattedDate,
      lastUpdatedAt: isoNow,
    },
  };
}
