import type { AppointmentRecord } from '@demoshop/shared-types';

export type GroupedAppointmentRecord = AppointmentRecord & {
  is_group?: boolean;
  group_appointments?: AppointmentRecord[];
  group_total_price?: number;
  group_total_deposit?: number;
};

/**
 * The API stores one appointment per guest so each barber slot remains
 * independently schedulable. The admin directory presents those linked rows
 * as one reservation while retaining the individual guest records for detail
 * views.
 */
export function groupAppointmentRecords(records: AppointmentRecord[]): GroupedAppointmentRecord[] {
  const grouped = new Map<string, AppointmentRecord[]>();
  const groupIndexes = new Map<string, number>();
  const result: Array<{ index: number; appointment: GroupedAppointmentRecord }> = [];

  for (const [index, record] of records.entries()) {
    const groupId = record.group_booking_id ? String(record.group_booking_id) : null;
    if (!groupId) {
      result.push({ index, appointment: record });
      continue;
    }

    if (!groupIndexes.has(groupId)) groupIndexes.set(groupId, index);
    const entries = grouped.get(groupId);
    if (entries) entries.push(record);
    else grouped.set(groupId, [record]);
  }

  for (const entries of grouped.values()) {
    if (entries.length === 1) {
      result.push({ index: groupIndexes.get(String(entries[0].group_booking_id)) || 0, appointment: entries[0] });
      continue;
    }

    const primary = entries[0];
    const services = Array.from(new Set(
      entries.map((entry) => entry.service_title || 'Service').filter(Boolean)
    ));
    const barbers = Array.from(new Set(
      entries.map((entry) => entry.barber_name || 'Unassigned Barber').filter(Boolean)
    ));
    const totalPrice = entries.reduce((sum, entry) => sum + Number(entry.service_price || 0), 0);
    // Each appointment row in a group points at the same customer payment
    // receipt, and the API already returns the group-level deposit amount on
    // each row. Keep that amount once instead of multiplying it by guest count.
    const totalDeposit = Number(primary.deposit_amount ?? 50);

    result.push({
      index: groupIndexes.get(String(primary.group_booking_id)) || 0,
      appointment: {
        ...primary,
        is_group: true,
        group_appointments: entries,
        service_title: `${entries.length} guests · ${services.join(', ')}`,
        barber_name: barbers.join(', '),
        service_price: totalPrice,
        deposit_amount: totalDeposit,
        group_total_price: totalPrice,
        group_total_deposit: totalDeposit,
      },
    });
  }

  return result.sort((left, right) => left.index - right.index).map(({ appointment }) => appointment);
}
