import React from 'react';
import { Outlet } from 'react-router';

export const AdminLayout = () => {
    return (
        <div className="admin-layout">
            {/* Placeholder for future admin sidebar/nav */}
            <Outlet />
        </div>
    );
};
