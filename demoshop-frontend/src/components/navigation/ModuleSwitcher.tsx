import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { User, Check, LogOut } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthContext';
import { useAvailableModules, type SystemModule } from './useAvailableModules';

export interface ModuleSwitcherProps {
    currentModuleId?: 'system-admin' | 'admin' | 'cashier' | 'inventory-manager' | 'barber' | 'customer';
    onOpenProfile?: () => void;
    profilePath?: string;
    profileLabel?: string;
    onLogout?: () => void;
    className?: string;
    displayName?: string;
    forceProfileMenu?: boolean;
    hideModuleOptions?: boolean;
    logoutLabel?: string;
}

export const ModuleSwitcher: React.FC<ModuleSwitcherProps> = ({
    currentModuleId,
    onOpenProfile,
    profilePath,
    profileLabel = 'Profile',
    onLogout,
    className = '',
    displayName: customDisplayName,
    forceProfileMenu = false,
    hideModuleOptions = false,
    logoutLabel = 'Sign Out',
}) => {
    const { user, role } = useAuth();
    const { availableModules, hasMultipleModules } = useAvailableModules();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const location = useLocation();

    // Close on outside click
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

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Determine profile picture safely
    const profilePic =
        user?.profile_picture ||
        (user as any)?.profilePicture ||
        (user as any)?.avatar_url ||
        (user as any)?.user_metadata?.avatar_url ||
        (user as any)?.picture;

    const displayName =
        customDisplayName ||
        (user as any)?.first_name ||
        (user as any)?.firstName ||
        user?.username ||
        user?.email?.split('@')[0] ||
        'Customer';

    const displayRole = role || user?.role || 'Staff';
    const displayInitial = (displayName || 'M').charAt(0).toUpperCase();

    // If single module account with direct profile action, clicking avatar directly opens profile
    const handleAvatarClick = () => {
        if (!forceProfileMenu && !hasMultipleModules && onOpenProfile && !profilePath) {
            onOpenProfile();
            return;
        }
        setIsOpen((prev) => !prev);
    };

    const handleModuleSelect = (mod: SystemModule) => {
        setIsOpen(false);
        if (location.pathname !== mod.path) {
            navigate(mod.path);
        }
    };

    const handleProfileAction = () => {
        setIsOpen(false);
        if (onOpenProfile) {
            onOpenProfile();
        } else if (profilePath) {
            navigate(profilePath);
        }
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {/* Avatar Trigger Button */}
            <button
                type="button"
                onClick={handleAvatarClick}
                title={forceProfileMenu ? 'Open profile menu' : hasMultipleModules ? 'Switch System Module or View Profile' : 'View Profile'}
                aria-label={forceProfileMenu ? 'Open profile menu' : hasMultipleModules ? 'Switch system module' : 'View profile'}
                aria-expanded={isOpen}
                aria-haspopup="true"
                className="flex items-center gap-2.5 text-left group cursor-pointer focus:outline-none p-1 rounded-sm hover:bg-white/5 transition-colors"
            >
                <div className="text-right hidden md:block select-none">
                    <span className="block text-sm font-bold text-ivory truncate max-w-[140px]">
                        {displayName}
                    </span>
                    <span className="block text-[10px] text-gold uppercase tracking-widest font-bold truncate max-w-[140px]">
                        {displayRole}
                    </span>
                </div>

                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gold/20 to-gold/5 flex items-center justify-center text-gold font-serif font-bold text-sm shadow-inner overflow-hidden border border-gold/30 shrink-0">
                    {profilePic && typeof profilePic === 'string' && !profilePic.includes('${') ? (
                        <img
                            src={
                                profilePic.startsWith('http') || profilePic.startsWith('blob:')
                                    ? profilePic
                                    : `${import.meta.env.VITE_API_URL || ''}/uploads/profiles/${profilePic}`
                            }
                            alt={displayName}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        displayInitial
                    )}
                </div>
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    className="absolute right-0 top-full mt-2 min-w-[15rem] max-w-xs w-max bg-charcoal-light border border-white/10 rounded-sm shadow-2xl animate-fade-in z-50 overflow-hidden transform-gpu will-change-transform select-none"
                    role="menu"
                    aria-orientation="vertical"
                >
                    {/* User Identity Header */}
                    <div className="p-3.5 border-b border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gold/15 border border-gold/30 flex items-center justify-center text-gold font-serif font-bold text-xs shrink-0 overflow-hidden">
                                {profilePic && typeof profilePic === 'string' && !profilePic.includes('${') ? (
                                    <img
                                        src={
                                            profilePic.startsWith('http') || profilePic.startsWith('blob:')
                                                ? profilePic
                                                : `${import.meta.env.VITE_API_URL || ''}/uploads/profiles/${profilePic}`
                                        }
                                        alt={displayName}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    displayInitial
                                )}
                            </div>
                            <div className="min-w-0 flex-1">
                                <span className="block text-xs font-bold text-ivory truncate">{displayName}</span>
                                {user?.email && (
                                    <span className="block text-[10.5px] text-ivory-dim/70 truncate">{user.email}</span>
                                )}
                                <span className="inline-block text-[9.5px] uppercase tracking-wider text-gold font-bold mt-0.5">
                                    {displayRole}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Switch Module Section */}
                    {hasMultipleModules && !hideModuleOptions && (
                        <div className="py-1 border-b border-white/5">
                            <div className="px-3.5 py-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-gold/80 flex items-center justify-between">
                                <span>Switch Module</span>
                                <span className="text-[9px] text-ivory-dim/40 font-normal">
                                    {availableModules.length} available
                                </span>
                            </div>

                            <div className="space-y-0.5 px-1 pb-1">
                                {availableModules.map((mod) => {
                                    const Icon = mod.icon;
                                    const isCurrent = currentModuleId === mod.id || location.pathname.startsWith(mod.path);

                                    return (
                                        <button
                                            key={mod.id}
                                            type="button"
                                            onClick={() => handleModuleSelect(mod)}
                                            role="menuitem"
                                            className={`w-full text-left px-3 py-2 rounded text-xs transition-all flex items-center justify-between gap-2.5 cursor-pointer ${
                                                isCurrent
                                                    ? 'bg-gold/15 text-gold font-bold border border-gold/30'
                                                    : 'text-ivory hover:text-gold hover:bg-white/5 border border-transparent'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`p-1 rounded shrink-0 ${isCurrent ? 'bg-gold text-charcoal' : 'text-gold'}`}>
                                                    <Icon className="w-3.5 h-3.5" />
                                                </div>
                                                <span className="truncate tracking-wide">{mod.label}</span>
                                            </div>

                                            {isCurrent && (
                                                <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider text-gold shrink-0">
                                                    <Check className="w-3 h-3" />
                                                    Current
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Profile / Account Action */}
                    {(onOpenProfile || profilePath) && (
                        <div className="p-1">
                            <button
                                type="button"
                                onClick={handleProfileAction}
                                role="menuitem"
                                className="w-full text-left px-3 py-2 rounded text-xs text-ivory hover:text-gold hover:bg-white/5 transition-colors flex items-center gap-2.5 cursor-pointer"
                            >
                                <User className="w-3.5 h-3.5 text-ivory-dim" />
                                <span>{profileLabel}</span>
                            </button>
                        </div>
                    )}

                    {/* Logout Action */}
                    {onLogout && (
                        <div className="p-1 border-t border-white/5">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    onLogout();
                                }}
                                role="menuitem"
                                className="w-full text-left px-3 py-2 rounded text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-2.5 cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>{logoutLabel}</span>
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ModuleSwitcher;
