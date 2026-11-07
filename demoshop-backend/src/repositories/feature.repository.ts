import db from '../db';
import logger from '../utils/general/logger';
import type { SystemFeature, FeatureStatus, FeatureStatusSummary } from '@demoshop/shared-types';

const INITIAL_FEATURES: Array<Omit<SystemFeature, 'updated_at' | 'updated_by'>> = [
  // 1. Core Platform (Locked / Always Enabled)
  {
    id: 'auth',
    name: 'Authentication & Identity Gate',
    description: 'Superuser and staff login sessions, token refresh interceptors, and user credentials verification.',
    category: 'Core Platform',
    status: 'ENABLED',
    is_core: true,
    is_critical: false,
    affected_roles: ['System Admin', 'Owner', 'Shop Admin', 'Cashier', 'Barber', 'Inventory Manager', 'Customer'],
    dependencies: [],
    maintenance_message: null,
  },
  {
    id: 'sys_controls',
    name: 'System Controls Control Plane',
    description: 'Administrative feature gate control plane, emergency recovery toggles, and system availability switches.',
    category: 'Core Platform',
    status: 'ENABLED',
    is_core: true,
    is_critical: false,
    affected_roles: ['System Admin'],
    dependencies: ['auth'],
    maintenance_message: null,
  },
  {
    id: 'sys_admin',
    name: 'System Admin Platform',
    description: 'Superuser administrative overview, administrator provisioning, user directory, and platform analytics.',
    category: 'Core Platform',
    status: 'ENABLED',
    is_core: true,
    is_critical: false,
    affected_roles: ['System Admin'],
    dependencies: ['auth', 'sys_controls'],
    maintenance_message: null,
  },
  {
    id: 'audit_logging',
    name: 'Security Audit Trail',
    description: 'Immutable security audit logging, access trail, and compliance export logs.',
    category: 'Core Platform',
    status: 'ENABLED',
    is_core: true,
    is_critical: false,
    affected_roles: ['System Admin', 'Owner'],
    dependencies: ['auth'],
    maintenance_message: null,
  },

  // 2. Customer Experience
  {
    id: 'customer_booking',
    name: 'Online Appointment Booking',
    description: 'Customer online reservations, service selection, barber calendar slots, and reservation payments.',
    category: 'Customer Experience',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Customer'],
    dependencies: [],
    maintenance_message: 'Online appointment booking is currently undergoing scheduled maintenance. Please visit as a walk-in or check back soon.',
  },
  {
    id: 'customer_queue',
    name: 'Virtual Queue Card & Tracking',
    description: 'Live queue position tracker, dynamic wait timer countdown, and customer ticket cards.',
    category: 'Customer Experience',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Customer'],
    dependencies: [],
    maintenance_message: 'Virtual queue tracking is currently undergoing maintenance.',
  },
  {
    id: 'customer_history',
    name: 'Visit History & Digital Receipts',
    description: 'Past haircut visit logs, digital receipts, and barber review feedback submissions.',
    category: 'Customer Experience',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Customer'],
    dependencies: [],
    maintenance_message: 'Visit history and receipts are temporarily unavailable during maintenance.',
  },
  {
    id: 'public_shop',
    name: 'Retail Product Catalog & Shop',
    description: 'Public pomade and styling product showroom and pricing showcase.',
    category: 'Customer Experience',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Customer'],
    dependencies: ['inventory_management'],
    maintenance_message: 'The product catalog is temporarily unavailable during maintenance.',
  },

  // 3. Point of Sale (Cashier)
  {
    id: 'cashier_pos',
    name: 'Point of Sale (POS) & Checkout',
    description: 'Front-desk counter register, ticket checkout, Cash/GCash payment processing, and shift drawer tallies.',
    category: 'Point of Sale',
    status: 'ENABLED',
    is_core: false,
    is_critical: true,
    affected_roles: ['Cashier', 'Shop Admin', 'Owner'],
    dependencies: [],
    maintenance_message: 'POS terminal checkout is temporarily paused for maintenance.',
  },

  // 4. Barber Station
  {
    id: 'barber_workspace',
    name: 'Barber Chair Station & Queue Caller',
    description: 'Station cutting status (Available/Busy/Break), audible queue chime summon, haircut completion, and shift requests.',
    category: 'Barber Station',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Barber'],
    dependencies: [],
    maintenance_message: 'Barber chair workspace is temporarily under maintenance.',
  },

  // 5. Inventory Control
  {
    id: 'inventory_management',
    name: 'Inventory & Stock Control',
    description: 'Stock movements, warehouse stock levels, stock audits, bottled consumables, and supplier orders.',
    category: 'Inventory',
    status: 'ENABLED',
    is_core: false,
    is_critical: true,
    affected_roles: ['Inventory Manager', 'Shop Admin', 'Owner'],
    dependencies: [],
    maintenance_message: 'Inventory management is temporarily offline for scheduled stock audit.',
  },

  // 6. Shop Operations
  {
    id: 'shop_admin_roster',
    name: 'Staff Roster & Shift Scheduling',
    description: 'Monthly barber work schedules, shift assignment calendars, and coverage approvals.',
    category: 'Shop Operations',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Shop Admin', 'Owner'],
    dependencies: [],
    maintenance_message: 'Staff scheduling is temporarily offline for scheduled roster maintenance.',
  },
  {
    id: 'shop_admin_reports',
    name: 'Sales & Barber Commission Reports',
    description: 'Financial reporting, daily gross sales reconciliation, and barber commission summaries.',
    category: 'Shop Operations',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Shop Admin', 'Owner'],
    dependencies: [],
    maintenance_message: 'Financial reporting is temporarily offline for calculation maintenance.',
  },
  {
    id: 'shop_admin_settings',
    name: 'Shop & Branch Settings',
    description: 'Branch operating hours, chairs setup, tax/cancellation policies, and shop metadata.',
    category: 'Shop Operations',
    status: 'ENABLED',
    is_core: false,
    is_critical: false,
    affected_roles: ['Shop Admin', 'Owner', 'System Admin'],
    dependencies: [],
    maintenance_message: 'Shop settings are temporarily locked during maintenance.',
  },
];

export class FeatureRepository {
  private isInitialized = false;

  /**
   * Ensures the system_features table exists and baseline features are seeded.
   */
  async ensureTableAndDefaults(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await db.query(`
        CREATE TABLE IF NOT EXISTS public.system_features (
            id VARCHAR(64) PRIMARY KEY,
            name VARCHAR(128) NOT NULL,
            description TEXT NOT NULL,
            category VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'ENABLED' CHECK (status IN ('ENABLED', 'DISABLED', 'MAINTENANCE')),
            is_core BOOLEAN NOT NULL DEFAULT FALSE,
            is_critical BOOLEAN NOT NULL DEFAULT FALSE,
            affected_roles TEXT[] NOT NULL DEFAULT '{}',
            dependencies TEXT[] NOT NULL DEFAULT '{}',
            maintenance_message TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL
        );
      `);

      for (const feat of INITIAL_FEATURES) {
        await db.query(
          `INSERT INTO public.system_features (
             id, name, description, category, status, is_core, is_critical, affected_roles, dependencies, maintenance_message
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING`,
          [
            feat.id,
            feat.name,
            feat.description,
            feat.category,
            feat.status,
            feat.is_core,
            feat.is_critical,
            feat.affected_roles,
            feat.dependencies,
            feat.maintenance_message,
          ]
        );
      }

      this.isInitialized = true;
    } catch (err) {
      logger.error('[FeatureRepository] Failed to ensure table and defaults', { error: err });
    }
  }

  /**
   * Retrieves all system features.
   */
  async findAll(): Promise<SystemFeature[]> {
    await this.ensureTableAndDefaults();

    const result = await db.query(`
      SELECT 
        id,
        name,
        description,
        category,
        status,
        is_core,
        is_critical,
        affected_roles,
        dependencies,
        maintenance_message,
        updated_at,
        updated_by
      FROM public.system_features
      ORDER BY 
        CASE 
          WHEN category = 'Core Platform' THEN 1
          WHEN category = 'Customer Experience' THEN 2
          WHEN category = 'Point of Sale' THEN 3
          WHEN category = 'Barber Station' THEN 4
          WHEN category = 'Inventory' THEN 5
          ELSE 6
        END,
        name ASC
    `);

    return result.rows.map((row) => ({
      ...row,
      affected_roles: Array.isArray(row.affected_roles) ? row.affected_roles : [],
      dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    }));
  }

  /**
   * Retrieves a single system feature by ID.
   */
  async findById(id: string): Promise<SystemFeature | null> {
    await this.ensureTableAndDefaults();

    const result = await db.query(
      `SELECT * FROM public.system_features WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      affected_roles: Array.isArray(row.affected_roles) ? row.affected_roles : [],
      dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    };
  }

  /**
   * Updates feature status and maintenance message.
   */
  async updateStatus(
    id: string,
    status: FeatureStatus,
    maintenanceMessage?: string | null,
    updatedBy?: string | null
  ): Promise<SystemFeature | null> {
    await this.ensureTableAndDefaults();

    const result = await db.query(
      `UPDATE public.system_features
       SET status = $2,
           maintenance_message = COALESCE($3, maintenance_message),
           updated_by = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, status, maintenanceMessage, updatedBy || null]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      affected_roles: Array.isArray(row.affected_roles) ? row.affected_roles : [],
      dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    };
  }

  /**
   * Updates feature authorized/affected roles.
   */
  async updateRoles(
    id: string,
    roles: string[],
    updatedBy?: string | null
  ): Promise<SystemFeature | null> {
    await this.ensureTableAndDefaults();

    const result = await db.query(
      `UPDATE public.system_features
       SET affected_roles = $2,
           updated_by = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, roles, updatedBy || null]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      ...row,
      affected_roles: Array.isArray(row.affected_roles) ? row.affected_roles : [],
      dependencies: Array.isArray(row.dependencies) ? row.dependencies : [],
    };
  }

  /**
   * Returns a lightweight map of feature statuses for client consumption.
   */
  async getStatusesSummary(): Promise<FeatureStatusSummary> {
    await this.ensureTableAndDefaults();

    const result = await db.query(
      `SELECT id, status, maintenance_message, affected_roles FROM public.system_features`
    );

    const summary: FeatureStatusSummary = {};
    for (const row of result.rows) {
      summary[row.id] = {
        status: row.status as FeatureStatus,
        maintenance_message: row.maintenance_message,
        affected_roles: Array.isArray(row.affected_roles) ? row.affected_roles : [],
      };
    }

    return summary;
  }
}

export const featureRepository = new FeatureRepository();
