export const DEFAULT_CASH_COUNT = 10_000;

/**
 * Formats daily revenue, cash sales, and customer count into a standard summary structure.
 */
export const formatSummaryResponse = (
  totalRevenue: number,
  totalCustomers: number,
  cashSales: number,
  customDefaultCashCount?: number,
) => {
  const defaultCash = typeof customDefaultCashCount === 'number' ? customDefaultCashCount : DEFAULT_CASH_COUNT;
  return {
    total_revenue: totalRevenue,
    total_customers: totalCustomers,
    cash_sales: cashSales,
    default_cash_count: defaultCash,
    expected_cash: defaultCash + cashSales,
  };
};

/**
 * Transforms raw barber data into a standardized breakdown for the dashboard.
 * Aggregates service counts and formats status/name strings.
 */
export const formatBarberBreakdown = (rows: any[]) => {
  return rows.map((row: any) => {
    // Aggregate services by count
    const serviceCounts: Record<string, number> = {};
    if (Array.isArray(row.services)) {
      row.services.forEach((service: any) => {
        if (service?.service_name) {
          serviceCounts[service.service_name] = (serviceCounts[service.service_name] || 0) + 1;
        }
      });
    }

    const servicesPerformed = Object.entries(serviceCounts).map(
      ([name, count]) => `${count}x ${name}`
    );

    const customers = Array.isArray(row.customers)
      ? row.customers.filter((customer: any) => customer?.id != null)
      : [];

    let currentStatus = row.barber_status || 'available';
    if (row.is_serving) currentStatus = 'serving';

    return {
      id: row.barber_id,
      name: row.name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed Barber',
      status: currentStatus,
      customer_count: Number.parseInt(row.customer_count, 10) || 0,
      services_performed: servicesPerformed,
      customers,
    };
  });
};
