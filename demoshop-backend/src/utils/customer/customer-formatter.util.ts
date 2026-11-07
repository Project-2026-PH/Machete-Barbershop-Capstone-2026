/**
 * Standardizes the "System User" fallback data for users without a customer record.
 */
export const getSystemUserFallback = (email: string) => {
  return {
    first_name: 'System',
    last_name: 'User',
    email: email || 'unknown',
    phone_number: 'N/A',
    name: 'System User',
    membership: 'Member',
    email_notifications_enabled: true,
  };
};

/**
 * Formats the customer profile response, concatenating names.
 */
export const formatCustomerProfile = (
  customer: any,
  membershipInfo: { membership: string }
) => {
  return {
    ...customer,
    name: `${customer.first_name} ${customer.last_name}`,
    membership: membershipInfo.membership,
  };
};
