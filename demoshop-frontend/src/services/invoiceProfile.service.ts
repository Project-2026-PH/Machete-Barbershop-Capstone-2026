import { api } from '@/config/api';
import type { BranchInvoiceProfile } from '@demoshop/shared-types';

export type InvoiceProfileTaxType = BranchInvoiceProfile['taxType'];

export type InvoiceProfileForm = Omit<BranchInvoiceProfile, 'branchId' | 'updatedAt'>;

export const getInvoiceProfile = async (): Promise<BranchInvoiceProfile | null> =>
  (await api.get<BranchInvoiceProfile | null>('/api/admin/invoice-profile')).data;

export const updateInvoiceProfile = async (profile: InvoiceProfileForm): Promise<BranchInvoiceProfile> =>
  (await api.put<BranchInvoiceProfile>('/api/admin/invoice-profile', profile)).data;
