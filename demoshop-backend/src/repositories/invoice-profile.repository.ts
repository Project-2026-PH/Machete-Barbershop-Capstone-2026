import db from '../db';
import { demoshopInvoiceProfile } from '../utils/receipt/demoshop-invoice-profile.util';
import type { BranchInvoiceProfile } from '@demoshop/shared-types';
import type { PoolClient } from 'pg';

export type InvoiceProfileTaxType = 'VAT' | 'NON_VAT';

export type { BranchInvoiceProfile } from '@demoshop/shared-types';

const mapRow = (row: any): BranchInvoiceProfile => ({
  branchId: Number(row.branch_id),
  tradeName: row.trade_name,
  registeredName: row.registered_name,
  registeredAddress: row.registered_address,
  taxType: row.tax_type as InvoiceProfileTaxType,
  tin: row.tin,
  branchCode: row.branch_code,
  confirmedFromForm2303: row.confirmed_from_form_2303 === true,
  updatedAt: row.updated_at,
});

const mapSnapshot = (row: any): BranchInvoiceProfile => {
  const profile: BranchInvoiceProfile = {
    branchId: Number(row.branch_id),
    tradeName: row.trade_name,
    registeredName: row.registered_name,
    registeredAddress: row.registered_address,
    taxType: row.tax_type as InvoiceProfileTaxType,
    tin: row.tin,
    branchCode: row.branch_code,
    confirmedFromForm2303: row.confirmed_from_form_2303 === true,
    updatedAt: row.profile_updated_at,
  };
  return profile;
};

export class InvoiceProfileRepository {
  async findByBranchId(branchId: number, client?: PoolClient): Promise<BranchInvoiceProfile | null> {
    const query = `SELECT branch_id, trade_name, registered_name, registered_address, tax_type,
                          tin, branch_code, confirmed_from_form_2303, updated_at
                   FROM branch_invoice_profiles WHERE branch_id = $1`;
    const result = client
      ? await client.query(query, [branchId])
      : await db.query(query, [branchId]);
    return result.rows[0] ? mapRow(result.rows[0]) : demoshopInvoiceProfile(branchId);
  }

  async saveReceiptSnapshot(client: PoolClient, receiptDocumentId: number, profile: BranchInvoiceProfile): Promise<void> {
    await client.query(
      `INSERT INTO receipt_invoice_profile_snapshots (
         receipt_document_id, branch_id, trade_name, registered_name, registered_address,
         tax_type, tin, branch_code, confirmed_from_form_2303, profile_updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (receipt_document_id) DO NOTHING`,
      [receiptDocumentId, profile.branchId, profile.tradeName, profile.registeredName, profile.registeredAddress,
        profile.taxType, profile.tin, profile.branchCode, profile.confirmedFromForm2303, profile.updatedAt],
    );
  }

  async findReceiptSnapshot(receiptDocumentId: number): Promise<BranchInvoiceProfile | null> {
    const result = await db.query(
      `SELECT receipt_document_id, branch_id, trade_name, registered_name, registered_address,
              tax_type, tin, branch_code, confirmed_from_form_2303, profile_updated_at
       FROM receipt_invoice_profile_snapshots WHERE receipt_document_id = $1`,
      [receiptDocumentId],
    );
    return result.rows[0] ? mapSnapshot(result.rows[0]) : null;
  }

  async upsert(profile: Omit<BranchInvoiceProfile, 'updatedAt'>, updatedBy: string | null): Promise<BranchInvoiceProfile> {
    const result = await db.query(
      `INSERT INTO branch_invoice_profiles (
         branch_id, trade_name, registered_name, registered_address, tax_type,
         tin, branch_code, confirmed_from_form_2303, updated_by, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (branch_id) DO UPDATE SET
         trade_name = EXCLUDED.trade_name,
         registered_name = EXCLUDED.registered_name,
         registered_address = EXCLUDED.registered_address,
         tax_type = EXCLUDED.tax_type,
         tin = EXCLUDED.tin,
         branch_code = EXCLUDED.branch_code,
         confirmed_from_form_2303 = EXCLUDED.confirmed_from_form_2303,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING branch_id, trade_name, registered_name, registered_address, tax_type,
                 tin, branch_code, confirmed_from_form_2303, updated_at`,
      [profile.branchId, profile.tradeName, profile.registeredName, profile.registeredAddress,
        profile.taxType, profile.tin, profile.branchCode, profile.confirmedFromForm2303, updatedBy],
    );
    return mapRow(result.rows[0]);
  }
}

export const invoiceProfileRepository = new InvoiceProfileRepository();
