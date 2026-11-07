import { AppError } from '../utils/error/AppError';
import { invoiceProfileRepository, type InvoiceProfileTaxType } from '../repositories/invoice-profile.repository';
import type { BranchInvoiceProfile } from '@demoshop/shared-types';

const normalizeText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') throw new AppError(`${field} is required.`, 400);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) throw new AppError(`${field} must be between 1 and ${maxLength} characters.`, 400);
  return normalized;
};

export class InvoiceProfileService {
  async get(branchId: number): Promise<BranchInvoiceProfile | null> {
    return invoiceProfileRepository.findByBranchId(branchId);
  }

  async update(branchId: number, data: any, updatedBy: string | null): Promise<BranchInvoiceProfile> {
    if (!Number.isSafeInteger(branchId) || branchId < 1) throw new AppError('A valid branch is required.', 400);
    const tradeName = normalizeText(data?.tradeName, 'Trade name', 120);
    const registeredName = normalizeText(data?.registeredName, 'Registered name', 200);
    const registeredAddress = normalizeText(data?.registeredAddress, 'Registered address', 255);
    const taxType = data?.taxType as InvoiceProfileTaxType;
    if (taxType !== 'VAT' && taxType !== 'NON_VAT') throw new AppError('Tax type must be VAT or NON-VAT.', 400);

    const tin = typeof data?.tin === 'string' ? data.tin.replace(/\D/g, '') : '';
    if (!/^\d{9}$/.test(tin)) throw new AppError('TIN must contain exactly 9 digits, excluding the branch code.', 400);
    const branchCode = typeof data?.branchCode === 'string' ? data.branchCode.replace(/\D/g, '') : '';
    if (!/^\d{5}$/.test(branchCode)) throw new AppError('Branch code must contain exactly 5 digits.', 400);
    if (typeof data?.confirmedFromForm2303 !== 'boolean') {
      throw new AppError('Confirm whether these values match the current BIR Form 2303.', 400);
    }

    return invoiceProfileRepository.upsert({
      branchId, tradeName, registeredName, registeredAddress, taxType, tin, branchCode,
      confirmedFromForm2303: data.confirmedFromForm2303,
    }, updatedBy);
  }
}

export const invoiceProfileService = new InvoiceProfileService();
