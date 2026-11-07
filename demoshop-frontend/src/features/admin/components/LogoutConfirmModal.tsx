import React from 'react';
import { LogoutModal, type LogoutModalProps } from '@/components/common/LogoutModal';

export type LogoutConfirmModalProps = LogoutModalProps;

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = (props) => {
    return <LogoutModal {...props} />;
};

export default LogoutConfirmModal;
