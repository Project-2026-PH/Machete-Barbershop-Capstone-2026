import React from 'react';
import { Modal } from '@/components/feedback/Modal';
import { ProfileTab } from '@/features/cashier/tabs/ProfileTab';

interface AccountSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AccountSettingsModal: React.FC<AccountSettingsModalProps> = ({
    isOpen,
    onClose,
}) => {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Account Settings"
            size="xl"
            bodyClassName="max-h-[80vh] overflow-y-auto custom-scrollbar"
        >
            <ProfileTab isModal={true} />
        </Modal>
    );
};

export default AccountSettingsModal;
