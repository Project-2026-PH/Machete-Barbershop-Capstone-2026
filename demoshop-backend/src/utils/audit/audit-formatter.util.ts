/**
 * Formats audit logs and pagination metadata into a standard response structure.
 */
export const formatAuditLogsResponse = (
  logs: any[],
  total: number,
  page: number,
  limit: number
) => {
  const totalPages = Math.ceil(total / limit);

  return {
    logs,
    pagination: {
      total,
      page,
      pages: totalPages,
      limit,
    },
  };
};
