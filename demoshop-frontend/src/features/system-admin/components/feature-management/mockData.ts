import { RoleType, RoleInfo, RoleModule } from './types';

export const ALL_ROLES: RoleType[] = [
  'System Admin',
  'Owner',
  'Shop Admin',
  'Cashier',
  'Barber',
  'Customer',
];

export const ROLES_METADATA: RoleInfo[] = [
  {
    role: 'System Admin',
    title: 'System Admin',
    categoryTag: 'Platform Administration',
    description: 'Superuser platform controls, security audit logs, user directory, and admin provisioning.',
    iconName: 'Shield',
  },
  {
    role: 'Owner',
    title: 'Shop Owner',
    categoryTag: 'Shop Ownership',
    description: 'High-level business revenue, barber commissions, services catalog, and sales analytics.',
    iconName: 'Building2',
  },
  {
    role: 'Shop Admin',
    title: 'Shop Admin',
    categoryTag: 'Shop Operations',
    description: 'Daily barbershop operations, station chair setup, barber shifts, and inventory restock.',
    iconName: 'Store',
  },
  {
    role: 'Cashier',
    title: 'Cashier',
    categoryTag: 'Point of Sale',
    description: 'Front-desk register, walk-in customer queueing, payment processing, and cash drawer tallies.',
    iconName: 'CreditCard',
  },
  {
    role: 'Barber',
    title: 'Barber Workspace',
    categoryTag: 'Styling & Chair',
    description: 'Cutting chair station, live client caller, haircut completion, and personal commission tips.',
    iconName: 'Scissors',
  },
  {
    role: 'Customer',
    title: 'Customer Portal',
    categoryTag: 'Client Experience',
    description: 'Online haircut booking, real-time virtual queue card, past visit history, and receipts.',
    iconName: 'Users',
  },
];

export const INITIAL_ROLE_CONFIGS: Record<RoleType, RoleModule[]> = {
  // ── 1. SYSTEM ADMIN ───────────────────────────────────────────────────────
  'System Admin': [
    {
      id: 'sys_overview',
      name: 'System Overview',
      description: 'Platform traffic analytics, response latency, and user account counters.',
      enabled: true,
      isCritical: false,
      isRequired: true,
      iconName: 'LayoutDashboard',
      subFeatures: [
        { id: 'so-1', name: 'Live Traffic Chart', description: 'Monitor incoming requests and response performance.', enabled: true },
        { id: 'so-2', name: 'User Statistics Counters', description: 'Summary counters for verified vs unverified registered accounts.', enabled: true },
        { id: 'so-3', name: 'API & Server Health Check', description: 'Real-time database connection and server latency indicator.', enabled: true },
      ],
    },
    {
      id: 'sys_users',
      name: 'Accounts',
      description: 'Account directory, credential verification, and user role assignments.',
      enabled: true,
      isCritical: false,
      isRequired: true,
      iconName: 'Users',
      subFeatures: [
        { id: 'su-1', name: 'Browse Account Directory', description: 'Search, filter, and inspect registered member accounts.', enabled: true },
        { id: 'su-2', name: 'Email & Identity Verification', description: 'Verify credentials and trigger email confirmation links.', enabled: true },
        { id: 'su-3', name: 'Export User Roster', description: 'Download CSV spreadsheet of all registered accounts.', enabled: true },
      ],
    },
    {
      id: 'sys_audit',
      name: 'Audit Logs',
      description: 'Security audit trail, logins, privilege modifications, and administrative actions.',
      enabled: true,
      isCritical: false,
      isRequired: true,
      iconName: 'Shield',
      subFeatures: [
        { id: 'sa-1', name: 'Live Audit Trail Stream', description: 'Real-time queryable feed of all platform security events.', enabled: true },
        { id: 'sa-2', name: 'Role & Action Filters', description: 'Filter events by user role, operation status, and IP address.', enabled: true },
        { id: 'sa-3', name: 'Export Audit Archives', description: 'Download immutable audit logs for compliance audits.', enabled: true },
      ],
    },
    {
      id: 'sys_admins',
      name: 'Account Provisioning & Security',
      description: 'Provisioning new system administrators, privilege elevation, and password resets.',
      enabled: true,
      isCritical: false,
      isRequired: true,
      iconName: 'UserCog',
      subFeatures: [
        {
          id: 'sm-1',
          name: 'Create Administrator',
          description: 'Provision new admin credentials with elevated permissions.',
          enabled: true,
          dependency: { moduleId: 'sys_users', moduleName: 'Accounts', reason: 'Requires active user directory access' }
        },
        { id: 'sm-2', name: 'Suspend / Restore Admin', description: 'Immediately deactivate or restore admin account access.', enabled: true },
        { id: 'sm-3', name: 'Admin Password Reset', description: 'Issue secure temporary password reset links.', enabled: true },
      ],
    },
    {
      id: 'sys_controls',
      name: 'System Controls',
      description: 'Platform feature toggles, module maintenance gates, and administrative recovery controls.',
      enabled: true,
      isCritical: false,
      isRequired: true,
      iconName: 'Sliders',
      subFeatures: [
        { id: 'sc-1', name: 'Module Maintenance & Availability', description: 'Configure live vs maintenance modes for platform modules.', enabled: true },
        { id: 'sc-2', name: 'Core Safety Enforcements', description: 'Protect essential administrative and security gateways.', enabled: true },
      ],
    },
  ],

  // ── 2. OWNER ─────────────────────────────────────────────────────────────
  'Owner': [
    {
      id: 'owner_overview',
      name: 'Shop Overview & Revenue',
      description: 'Gross shop sales, foot traffic counts, and on-duty barber attendance.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Store',
      subFeatures: [
        { id: 'oo-1', name: 'Gross Revenue KPIs', description: 'Track daily, weekly, and monthly sales totals.', enabled: true },
        { id: 'oo-2', name: 'Shop Foot Traffic Counter', description: 'Active customer volume and completed haircut counts.', enabled: true },
        { id: 'oo-3', name: 'Active Staff Attendance', description: 'Roster of barbers checked in and on duty today.', enabled: true },
      ],
    },
    {
      id: 'owner_staff',
      name: 'Staff Management',
      description: 'Barber roster, station chair assignments, and commission percentage rates.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Scissors',
      subFeatures: [
        { id: 'os-1', name: 'Barber Team Roster', description: 'Review and manage all employed barbers.', enabled: true },
        { id: 'os-2', name: 'Chair & Station Assignments', description: 'Designate workstations and cutting chairs.', enabled: true },
        { id: 'os-3', name: 'Commission Rates Setup', description: 'Configure percentage or flat payout splits per barber.', enabled: true },
      ],
    },
    {
      id: 'owner_services',
      name: 'Services & Pricing Catalog',
      description: 'Haircut packages, beard grooming, service pricing, and duration allocations.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'ListOrdered',
      subFeatures: [
        { id: 'ose-1', name: 'Haircut & Grooming Menu', description: 'Update service offerings, cuts, and beard packages.', enabled: true },
        { id: 'ose-2', name: 'Service Price Adjustments', description: 'Configure standard and promotional pricing.', enabled: true },
        { id: 'ose-3', name: 'Cut Duration Estimates', description: 'Set estimated chair time per haircut package.', enabled: true },
      ],
    },
    {
      id: 'owner_reports',
      name: 'Reports & Financial Analytics',
      description: 'Sales reconciliation, barber productivity breakdown, and accounting exports.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'BarChart3',
      subFeatures: [
        { id: 'or-1', name: 'Daily Sales Reconciliation', description: 'Detailed breakdown by Cash, GCash, Maya, and Card.', enabled: true },
        { id: 'or-2', name: 'Barber Earnings & Tips', description: 'Commission summaries and gratuities per staff member.', enabled: true },
        { id: 'or-3', name: 'Export Financial Sheets', description: 'Download accounting spreadsheets for taxes.', enabled: true },
      ],
    },
    {
      id: 'owner_inventory',
      name: 'Inventory & Stock Counts',
      description: 'Pomade inventory on display, supplier orders, and restock authorizations.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Package',
      subFeatures: [
        { id: 'oi-1', name: 'Pomade & Retail Stock', description: 'Monitor retail product inventory on shop shelves.', enabled: true },
        { id: 'oi-2', name: 'Restock Request Approvals', description: 'Authorize stock replenishments and supplier orders.', enabled: true },
      ],
    },
    {
      id: 'owner_audit',
      name: 'Shop Audit Logs',
      description: 'Inspect cashier shift logs, ticket voids, and manager adjustments.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Shield',
      subFeatures: [
        { id: 'oau-1', name: 'Shop Activity Stream', description: 'Review security events and ticket edits.', enabled: true },
      ],
    },
  ],

  // ── 3. SHOP ADMIN ────────────────────────────────────────────────────────
  'Shop Admin': [
    {
      id: 'sa_overview',
      name: 'Shop Overview & Live Queue',
      description: 'Daily revenue tally, waiting customer monitor, and active chair statuses.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Store',
      subFeatures: [
        { id: 'sao-1', name: 'Daily Revenue Monitor', description: "View today's gross sales and transactions.", enabled: true },
        { id: 'sao-2', name: 'Live Shop Queue Monitor', description: 'Real-time count of waiting walk-in customers.', enabled: true },
        { id: 'sao-3', name: 'Barber Chair Status', description: 'See which chairs are active, available, or on break.', enabled: true },
      ],
    },
    {
      id: 'sa_staff',
      name: 'Staff Management',
      description: 'Barber roster, station assignments, and shift attendance tracking.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Scissors',
      subFeatures: [
        { id: 'sas-1', name: 'Barber Roster', description: 'Manage barber team profiles and contacts.', enabled: true },
        { id: 'sas-2', name: 'Chair Assignments', description: 'Assign barbers to cutting chairs for the day.', enabled: true },
      ],
    },
    {
      id: 'sa_services',
      name: 'Services Catalog',
      description: 'Haircuts, beard trims, grooming packages, and cutting duration estimates.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'ListOrdered',
      subFeatures: [
        { id: 'sase-1', name: 'Service Menu & Pricing', description: 'Maintain available haircuts and grooming options.', enabled: true },
        { id: 'sase-2', name: 'Duration Allocations', description: 'Adjust appointment duration estimates.', enabled: true },
      ],
    },
    {
      id: 'sa_shifts',
      name: 'Shift Requests & Schedules',
      description: 'Review barber shift schedules, leave requests, and coverage approvals.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Calendar',
      subFeatures: [
        { id: 'sash-1', name: 'Shift Request Approvals', description: 'Approve or decline barber time-off and coverage requests.', enabled: true },
        { id: 'sash-2', name: 'Weekly Schedule Roster', description: 'Manage working days and hours for the team.', enabled: true },
      ],
    },
    {
      id: 'sa_inventory',
      name: 'Inventory & Stock Counts',
      description: 'Log physical pomade counts, submit restock orders, and track supplies.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Package',
      subFeatures: [
        { id: 'sai-1', name: 'Stock Count Verification', description: 'Log physical counts of pomades and styling wax.', enabled: true },
        { id: 'sai-2', name: 'Submit Restock Requests', description: 'File inventory replenishment orders when stock runs low.', enabled: true },
        { id: 'sai-3', name: 'Shop Consumables Usage', description: 'Track razor blades, neck strips, and sanitizers used.', enabled: true },
      ],
    },
    {
      id: 'sa_reports',
      name: 'Daily Reports & Sales',
      description: 'End-of-day sales summary, completed cuts tally, and payment method audit.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'BarChart3',
      subFeatures: [
        { id: 'sar-1', name: 'Closing Day Sales Report', description: 'End-of-day summary of haircuts and retail sales.', enabled: true },
        { id: 'sar-2', name: 'Barber Cuts Summary', description: 'Number of customers served per barber.', enabled: true },
      ],
    },
  ],

  // ── 4. CASHIER ───────────────────────────────────────────────────────────
  'Cashier': [
    {
      id: 'cashier_pos',
      name: 'Point of Sale (POS)',
      description: 'Checkout counter, service ticketing, cash drawer management, and receipts.',
      enabled: true,
      isCritical: true, // Critical module: confirmation required before disabling
      isRequired: false,
      iconName: 'CreditCard',
      subFeatures: [
        { id: 'cpos-1', name: 'Ticket Checkout', description: 'Ring up haircut tickets and retail pomade sales.', enabled: true },
        { id: 'cpos-2', name: 'Payment Processing', description: 'Accept Cash and GCash QR code payments at counter.', enabled: true },
        { id: 'cpos-3', name: 'Drawer Reconciliation', description: 'Opening float count and end-of-shift cash tally.', enabled: true },
      ],
    },
    {
      id: 'cashier_payment_methods',
      name: 'Payment Methods & Gateway Options',
      description: 'Accepted payment tender channels at checkout: Cash, GCash, Maya, and Card options.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'CreditCard',
      subFeatures: [
        { id: 'cpm-1', name: 'Cash Payment Tender', description: 'Over-the-counter physical cash and change calculation.', enabled: true, isRequired: true },
        { id: 'cpm-2', name: 'GCash', description: 'GCash merchant QR scan and reference verification.', enabled: true },
        { id: 'cpm-3', name: 'Maya / PayMaya QR (Additional Method)', description: 'Auxiliary digital wallet payment method via Maya QR code.', enabled: false },
        { id: 'cpm-4', name: 'Credit / Debit Card (Additional Method)', description: 'Auxiliary card payment terminal for Visa, Mastercard, and BancNet.', enabled: false },
      ],
    },
    {
      id: 'cashier_queue',
      name: 'Walk-in Queue Management',
      description: 'Check in walk-in clients, issue queue tickets, and dispatch clients to chairs.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'ListOrdered',
      subFeatures: [
        { id: 'cq-1', name: 'Walk-in Customer Check-in', description: 'Add walk-in customer name, requested barber, and service.', enabled: true },
        { id: 'cq-2', name: 'Queue Dispatcher', description: 'Call next ticket in line and assign client to an available chair.', enabled: true },
        { id: 'cq-3', name: 'Bypass Time Restrictions (Testing Mode)', description: 'Bypass scheduled arrival and haircut duration time gates on queue action buttons.', enabled: false },
      ],
    },
    {
      id: 'cashier_inventory',
      name: 'Inventory Stock Lookup',
      description: 'Quick product price and stock availability lookup for retail customers.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Package',
      subFeatures: [
        { id: 'ci-1', name: 'Product Price & Stock Lookup', description: 'Quickly check pomade availability and retail price.', enabled: true },
      ],
    },
  ],

  // ── 5. BARBER ────────────────────────────────────────────────────────────
  'Barber': [
    {
      id: 'barber_workspace',
      name: 'Chair Workspace & Queue',
      description: 'Station status (Available/Busy/Break), live client caller, and haircut completion.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Scissors',
      subFeatures: [
        { id: 'bw-1', name: 'Station Status Switch', description: 'Toggle between Available, Cutting Hair, and On Break.', enabled: true },
        { id: 'bw-2', name: 'Call Next Client', description: 'Ring the queue chime and summon the next waiting customer.', enabled: true },
        { id: 'bw-3', name: 'Complete Haircut Service', description: 'Mark service as done and send ticket to Cashier for checkout.', enabled: true },
      ],
    },
    {
      id: 'barber_history',
      name: 'Haircut History & Tips',
      description: 'Personal daily earnings log, completed cuts roster, tips received, and shift submissions.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'BarChart3',
      subFeatures: [
        { id: 'bh-1', name: 'Daily Commission & Tips Log', description: 'Track your personal earnings and gratuity breakdown.', enabled: true },
        { id: 'bh-2', name: 'Client Haircut History', description: 'Review previous guard lengths and haircut styles cut.', enabled: true },
        { id: 'bh-3', name: 'Submit Shift Request', description: 'Request a day-off or schedule adjustment directly from chair.', enabled: true },
      ],
    },
  ],

  // ── 6. CUSTOMER ──────────────────────────────────────────────────────────
  'Customer': [
    {
      id: 'customer_booking',
      name: 'Online Appointment Booking',
      description: 'Customer appointment reservations, barber choice, and date/time selection.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Calendar',
      subFeatures: [
        { id: 'cb-1', name: 'Select Barber & Service', description: 'Browse haircut packages and choose preferred barber.', enabled: true },
        { id: 'cb-2', name: 'Interactive Slot Calendar', description: 'Choose available date and time slots.', enabled: true },
        { id: 'cb-3', name: 'Reschedule / Cancel Booking', description: 'Manage upcoming reservation before appointment time.', enabled: true },
      ],
    },
    {
      id: 'customer_queue',
      name: 'Virtual Queue Card',
      description: 'Live virtual queue ticket, real-time position tracker, and estimated waiting time.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'Smartphone',
      subFeatures: [
        { id: 'cuq-1', name: 'Live Queue Position', description: 'See your real-time place in line from your phone.', enabled: true },
        { id: 'cuq-2', name: 'Estimated Wait Timer', description: 'Dynamic countdown based on barber speed.', enabled: true },
      ],
    },
    {
      id: 'customer_history',
      name: 'Visit History & Receipts',
      description: 'Past haircut visit history, payment receipts, and barber ratings/feedback.',
      enabled: true,
      isCritical: false,
      isRequired: false,
      iconName: 'CreditCard',
      subFeatures: [
        { id: 'ch-1', name: 'Past Haircut Visits', description: 'See dates, barbers, and photos from past visits.', enabled: true },
        { id: 'ch-2', name: 'Payment Receipts & Invoices', description: 'Download digital receipts for services and pomades.', enabled: true },
        { id: 'ch-3', name: 'Rate & Review Barber', description: 'Leave 5-star rating and feedback for your haircut.', enabled: true },
      ],
    },
  ],
};
