import React from 'react';
import { Modal } from '@/components/feedback/Modal';
import { Button } from '@/components/ui/Button';

export interface LogoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void | Promise<void>;
    isLoading?: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    loadingLabel?: string;
    sidebarOffset?: boolean;
}

export const LogoutModal: React.FC<LogoutModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    isLoading = false,
    title = 'Confirm Logout',
    message = 'Are you sure you want to log out of the DemoShop system?',
    confirmLabel = 'Logout',
    loadingLabel = 'Logging out...',
    sidebarOffset = false,
}) => {
    return (
        <Modal
            isOpen={isOpen}
            onClose={() => {
                if (!isLoading) onClose();
            }}
            title={title}
            size="sm"
            sidebarOffset={sidebarOffset}
            footer={
                <>
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isLoading}
                        className={isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        className="bg-gold hover:bg-gold-600 border-gold text-charcoal font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => void onConfirm()}
                        disabled={isLoading}
                    >
                        {isLoading ? loadingLabel : confirmLabel}
                    </Button>
                </>
            }
        >
            <p className="text-ivory text-sm">{message}</p>
        </Modal>
    );
};

export default LogoutModal;
