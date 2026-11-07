/**
 * Returns default membership tier for customer profile.
 */
export const calculateMembershipLevel = (_loyaltyPoints?: number): { membership: string } => {
  return { membership: 'Member' };
};
