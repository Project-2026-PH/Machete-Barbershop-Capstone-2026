// demoshop-frontend\src\components\auth\ProtectedRoute.tsx
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { useAuth } from '@/components/auth/AuthContext';

interface ProtectedRouteProps {
    children: ReactNode;
    allowedRoles?: string[];
}

const ROLE_REDIRECTS: Record<string, string> = {
    'System Admin': '/system-admin',
    'SystemAdmin': '/system-admin',
    'Admin': '/admin',
    'ShopAdmin': '/admin',
    'Owner': '/admin',
    'Cashier': '/cashier',
    'Inventory Manager': '/inventory-manager',
    'Barber': '/barber',
    'Customer': '/dashboard'
};

const DEFAULT_REDIRECT = '/dashboard';

/**
 * ProtectedRoute - Gates access to routes based on authentication and roles.
 * Uses AuthContext as the source of truth to avoid redundant network calls
 * and eliminate the 'loading' flash after login/register.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles = [] }) => {
    const { user, role, authReady, refetchMe } = useAuth();
    const location = useLocation();
    const authCheckStarted = useRef(false);
    const [authCheckComplete, setAuthCheckComplete] = useState(Boolean(user));

    useEffect(() => {
        if (!authReady || user || authCheckStarted.current) return;
        authCheckStarted.current = true;
        void refetchMe()
            .catch(() => {
                // A missing/expired session is handled by the normal redirect below.
            })
            .finally(() => setAuthCheckComplete(true));
    }, [authReady, refetchMe, user]);

    // If AuthContext is still initializing, or a public-page-deferred probe is
    // now required for this protected route, keep the route gated.
    if (!authReady || (!user && !authCheckComplete)) {
        return <LoadingScreen isLoaded={false} onComplete={() => {}} />;
    }

    // If AuthContext is ready but no user is found, redirect to login
    if (!user) {
        // Redirect to login, saving the attempted location so we can return after login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Role-based access control (RBAC)
    // If the user role is not in the allowed list, redirect them to a safe default
    const currentUserRole = role; // Source of truth is the AuthContext/Backend

    if (allowedRoles.length > 0) {
        const hasDirectRole = Boolean(currentUserRole && allowedRoles.includes(currentUserRole));
        const hasCashierInventoryAccess = currentUserRole === 'Cashier' && Boolean(user?.can_access_inventory) && allowedRoles.includes('Inventory Manager');

        if (!hasDirectRole && !hasCashierInventoryAccess) {
            console.warn(`Unauthorized access attempt by ${currentUserRole || 'unassigned role'} to ${location.pathname}`);

            // Missing or unassigned role results in strict lockdown (redirect to login)
            const redirectPath = currentUserRole ? (ROLE_REDIRECTS[currentUserRole] || DEFAULT_REDIRECT) : '/login';
            return <Navigate to={redirectPath} replace />;
        }
    }

    // Authorized: Render the protected component
    return <>{children}</>;
};
