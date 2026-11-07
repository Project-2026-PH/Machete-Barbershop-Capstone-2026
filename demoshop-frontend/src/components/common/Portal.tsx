import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface PortalProps {
    children: ReactNode;
    container?: Element | null;
}

export const Portal = ({ children, container }: PortalProps) => {
    if (typeof document === 'undefined') return null;

    return createPortal(children, container || document.body);
};

export default Portal;
