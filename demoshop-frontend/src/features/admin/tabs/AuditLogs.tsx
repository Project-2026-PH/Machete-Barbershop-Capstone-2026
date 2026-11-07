import React from 'react';
import { AuditLogsTable, type AuditModuleCategory } from '@/features/admin/components/AuditLogs/AuditLogsTable';

export interface AuditLogsProps {
    initialModule?: AuditModuleCategory;
}

export const AuditLogs: React.FC<AuditLogsProps> = ({ initialModule = 'all' }) => {
    return <AuditLogsTable initialModule={initialModule} />;
};

export default AuditLogs;
