import type { BranchInvoiceProfile } from '@demoshop/shared-types';

/** Server-side fallback populated from the shop's BIR-accredited receipt. */
export const demoshopInvoiceProfile = (branchId: number): BranchInvoiceProfile => ({
  branchId,
  tradeName: 'DEMOSHOP’S R18 BARBER SHOP',
  registeredName: 'RYAN B. ELFA – Prop.',
  registeredAddress: 'Ground Floor, SampleBranch Sta. 3A-GF-GL-00041,\nKaypian, CSJDM, 3023\nCity of San Jose Del Monte, Bulacan, Philippines',
  taxType: 'NON_VAT',
  tin: '300503954',
  branchCode: '00000',
  confirmedFromForm2303: false,
  updatedAt: '1970-01-01T00:00:00.000Z',
});
