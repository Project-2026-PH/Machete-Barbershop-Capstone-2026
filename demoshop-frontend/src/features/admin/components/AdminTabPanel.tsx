import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';

interface AdminTabPanelProps {
    panelKey: string;
    className?: string;
    children: React.ReactNode;
}

export const AdminTabPanel: React.FC<AdminTabPanelProps> = ({
    panelKey,
    className = '',
    children,
}) => {
    const reduceMotion = useReducedMotion();

    return (
        <motion.div
            key={panelKey}
            className={className}
            initial={reduceMotion ? false : { opacity: 0, y: 4, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
        >
            {children}
        </motion.div>
    );
};

export default AdminTabPanel;
