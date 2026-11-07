/** Testing mode allows a checked-in waiting guest to skip the chair step. */
export const canCompleteCashierService = (status: string, bypassTimeRestrictions: boolean): boolean =>
  status === 'serving' || (bypassTimeRestrictions && status === 'waiting');
