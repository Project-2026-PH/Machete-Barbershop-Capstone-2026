interface CustomerNameEntry {
  is_walk_in?: boolean;
  customer_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  group_booking_id?: string | null;
  group_guest_number?: number | string | null;
  guest_name?: string | null;
}

export const formatCustomerName = (entry: CustomerNameEntry): string => {
  const name = `${entry.first_name ?? ''} ${entry.last_name ?? ''}`.trim();
  return name || entry.customer_name?.trim() || (entry.is_walk_in ? 'Walk-in Customer' : 'Customer');
};

export const formatQueueCustomerName = (entry: CustomerNameEntry): string => {
  const ownerName = formatCustomerName(entry);
  if (!entry.group_booking_id) return ownerName;

  const guestNumber = Number(entry.group_guest_number)
    || Number(entry.guest_name?.match(/\bguest\s*(\d+)\b/i)?.[1]);
  const guestLabel = Number.isSafeInteger(guestNumber) && guestNumber > 0
    ? `Guest ${guestNumber}` : entry.guest_name?.replace(/\s*\(you\)/i, '').trim() || 'Guest';
  return `${ownerName} (${guestLabel})`;
};
