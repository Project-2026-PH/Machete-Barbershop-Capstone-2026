// demoshop-frontend\src\components\auth\SystemAdminControls.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { Shield, LayoutDashboard, Store, Users, Scissors } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';

interface NavItem {
    label: string;
    path: string;
    icon: React.ReactNode;
}

// Global configuration for System Admin navigation switches
const NAV_ITEMS: NavItem[] = [
    { label: 'System Admin', path: '/system-admin/dashboard', icon: <Shield className="w-4 h-4" /> },
    { label: 'Shop Admin', path: '/admin', icon: <LayoutDashboard className="w-4 h-4" /> },
    { label: 'Cashier View', path: '/cashier', icon: <Store className="w-4 h-4" /> },
    { label: 'Barber View', path: '/barber', icon: <Scissors className="w-4 h-4" /> },
    { label: 'Customer View', path: '/dashboard', icon: <Users className="w-4 h-4" /> },
];

/**
 * Determines if the configured path represents the current active module view.
 */
const isCurrentView = (path: string, currentPath: string): boolean => {
    if (path === '/system-admin/dashboard') {
        return currentPath.startsWith('/system-admin');
    }
    return currentPath === path;
};

/**
 * SystemAdminControls - A shared component for System Admins to switch between modules.
 * Visible ONLY to users with the 'System Admin' role.
 */
export const SystemAdminControls: React.FC = () => {
    const { isSystemAdmin } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    if (!isSystemAdmin) return null;

    // Filter out the current view using the routing matching logic
    const filteredNavItems = NAV_ITEMS.filter(item => !isCurrentView(item.path, location.pathname));

    const handleNavigate = (path: string) => {
        navigate(path);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`p-2 rounded-full transition-all duration-300 ${
                    isOpen ? 'bg-gold/20 text-gold shadow-[0_0_15px_rgba(212,175,55,0.3)]' : 'text-ivory-dim hover:bg-white/5 hover:text-gold'
                }`}
                title="System Admin Controls"
            >
                <Shield className="w-6 h-6" />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-4 w-56 bg-charcoal-light border border-white/10 rounded-sm shadow-2xl animate-fade-in z-50 overflow-hidden transform-gpu will-change-transform">
                    <div className="p-3 border-b border-white/5 bg-white/[0.02]">
                        <span className="block text-sm font-bold text-ivory">System Admin</span>
                        <span className="block text-[10px] uppercase tracking-widest text-gold font-medium">Switch Module</span>
                    </div>
                    <div className="py-1">
                        {filteredNavItems.map((item) => (
                            <button
                                key={item.path}
                                onClick={() => handleNavigate(item.path)}
                                className="w-full text-left px-4 py-3 text-sm text-ivory hover:text-gold hover:bg-white/5 transition-colors flex items-center gap-3 cursor-pointer group"
                            >
                                <span className="group-hover:scale-110 transition-transform">
                                    {item.icon}
                                </span>
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
