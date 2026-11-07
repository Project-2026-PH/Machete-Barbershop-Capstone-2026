import React from 'react';
import { AuditLogsTable } from './AuditLogsTable';

export interface AccountSecurityActivityTableProps {
    startDate?: string;
    endDate?: string;
    dateFilterLabel?: string;
}

/**
 * Backward-compatible wrapper delegating to the unified AuditLogsTable with auth module pre-selected.
 */
export const AccountSecurityActivityTable: React.FC<AccountSecurityActivityTableProps> = (props) => {
    return <AuditLogsTable initialModule="auth" {...props} />;
};

export default AccountSecurityActivityTable;
