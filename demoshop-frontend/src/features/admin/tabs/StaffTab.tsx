import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import {
    Plus, Scissors, MoreVertical, Briefcase, Calendar, Star, CheckCircle, RefreshCw, ShieldAlert, AlertCircle, Loader2, KeyRound, UserCog, UserX, UserCheck, Clock, ShieldCheck, Mail, Users, LayoutGrid, List, MapPin
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import Portal from '@/components/common/Portal';
import { supabase } from '@/config/supabaseClient';
import { barberService } from '@/features/barber/services/barber.service';
import type { StaffDirectoryMember } from '@demoshop/shared-types';
import { ManagementSubHeaderNav } from '@/features/admin/components/Management/ManagementSubHeaderNav';
import { useSearchHighlight } from '@/features/admin/hooks/useSearchHighlight';

interface StaffTabProps {
    onNavigateShifts?: () => void;
    onNavigateSubTab?: (subTab: string) => void;
}

export const StaffTab: React.FC<StaffTabProps> = ({ onNavigateShifts, onNavigateSubTab }) => {
    const [searchParams] = useSearchParams();
    const [staffList, setStaffList] = useState<StaffDirectoryMember[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [activeDropdown, setActiveDropdown] = useState<string | number | null>(null);
    const [roleFilter, setRoleFilter] = useState<'all' | 'barber' | 'cashier'>('all');
    const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Status Override Modal State
    const [statusModalMember, setStatusModalMember] = useState<StaffDirectoryMember | null>(null);
    const [selectedStatus, setSelectedStatus] = useState<string>('On Duty');
    const [statusReason, setStatusReason] = useState<string>('');
    const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

    // Add Staff Modal State
    const [isAddStaffModalOpen, setIsAddStaffModalOpen] = useState(false);
    const [newStaffName, setNewStaffName] = useState('');
    const [newStaffEmail, setNewStaffEmail] = useState('');
    const [newStaffPassword, setNewStaffPassword] = useState('');
    const [newStaffRole, setNewStaffRole] = useState<'Barber' | 'Cashier' | 'Inventory Manager'>('Barber');
    const [newStaffSpecialty, setNewStaffSpecialty] = useState('');
    const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);
    const [addStaffError, setAddStaffError] = useState<string | null>(null);

    // Edit Account Settings Modal State
    const [editStaffMember, setEditStaffMember] = useState<StaffDirectoryMember | null>(null);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editRole, setEditRole] = useState<'Barber' | 'Cashier' | 'Inventory Manager'>('Barber');
    const [editSpecialty, setEditSpecialty] = useState('');
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
    const [editStaffError, setEditStaffError] = useState<string | null>(null);

    // Reset Password Modal State
    const [resetPasswordMember, setResetPasswordMember] = useState<StaffDirectoryMember | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
    const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);

    // Shift Schedule Modal State
    const [scheduleModalMember, setScheduleModalMember] = useState<StaffDirectoryMember | null>(null);

    // Trigger glow highlight and scroll-into-view when staff list loads
    useSearchHighlight(!isLoading && staffList.length > 0);

    // Sync role filter from URL params if present
    useEffect(() => {
        const r = searchParams.get('role');
        const highlightId = searchParams.get('highlightId');
        if (r && ['all', 'barber', 'cashier'].includes(r)) {
            setRoleFilter(r as 'all' | 'barber' | 'cashier');
        } else if (highlightId) {
            // When navigating from global search, ensure conflicting role filter doesn't hide staff
            setRoleFilter('all');
        }
    }, [searchParams]);

    const showToast = (msg: string) => {
        setToastMessage(msg);
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchStaff = useCallback(async (silent = false) => {
        if (!silent) {
            setIsLoading(true);
            setErrorMessage(null);
        }
        try {
            const data = await barberService.getStaffMembers();
            if (Array.isArray(data) && data.length > 0) {
                setStaffList(data);
            } else {
                setStaffList([]);
            }
            setErrorMessage(null);
        } catch (err: any) {
            console.error('Failed to load staff list:', err);
            if (!silent) {
                const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to load staff directory. Please try again.';
                setErrorMessage(msg);
            }
        } finally {
            if (!silent) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchStaff();

        let timer: ReturnType<typeof setTimeout> | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const debouncedRefresh = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                void fetchStaff(true);
            }, 300);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        };
        const handleWindowFocus = () => debouncedRefresh();

        const localEvents = [
            'demoshop:staff-changed',
            'demoshop:queue-updated',
            'storage',
        ];
        localEvents.forEach((evt) => window.addEventListener(evt, debouncedRefresh));
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);

        const channel = supabase
            .channel('admin-staff-directory-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'barbers' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, debouncedRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries' }, debouncedRefresh)
            .subscribe();

        // Background polling heartbeat (every 10s when active) to guarantee live data without manual refresh
        pollInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                debouncedRefresh();
            }
        }, 10000);

        return () => {
            if (timer) clearTimeout(timer);
            if (pollInterval) clearInterval(pollInterval);
            localEvents.forEach((evt) => window.removeEventListener(evt, debouncedRefresh));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
            void supabase.removeChannel(channel).catch(() => {});
        };
    }, [fetchStaff]);

    useEffect(() => {
        if (!activeDropdown) return;
        const handleOutsideClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-dropdown-container="true"]')) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, [activeDropdown]);

    const toggleDropdown = (id: string | number) => {
        setActiveDropdown(activeDropdown === id ? null : id);
    };

    const barbersCount = staffList.filter(s => s.role.toLowerCase().includes('barber')).length;
    const cashiersCount = staffList.filter(s => s.role.toLowerCase() === 'cashier').length;

    const filteredStaff = staffList.filter(member => {
        const r = member.role.toLowerCase();
        const matchesRole = roleFilter === 'all'
            || (roleFilter === 'barber' && r.includes('barber'))
            || (roleFilter === 'cashier' && r === 'cashier');

        return matchesRole;
    });

    // --- 1. STATUS OVERRIDE ---
    const handleOpenStatusModal = (member: StaffDirectoryMember) => {
        setStatusModalMember(member);
        const rawStatus = (member.status || '').toString();
        setSelectedStatus(rawStatus === 'Available' || rawStatus === 'available' ? 'On Duty' : rawStatus || 'On Duty');
        setStatusReason('');
        setActiveDropdown(null);
    };

    const handleSaveStatusOverride = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!statusModalMember) return;

        setIsUpdatingStatus(true);
        try {
            const targetId = statusModalMember.barber_id || statusModalMember.id;
            await barberService.updateAdministrativeStatus(
                targetId,
                selectedStatus,
                statusReason.trim() || undefined
            );
            showToast(`Updated ${statusModalMember.name}'s administrative status to ${selectedStatus}`);
            setStatusModalMember(null);
            fetchStaff(true);
        } catch (err: any) {
            console.error('Failed to update status:', err);
            showToast(err?.response?.data?.error || err?.message || 'Failed to update administrative status');
        } finally {
            setIsUpdatingStatus(false);
        }
    };

    // --- 2. ADD STAFF ---
    const handleOpenAddStaffModal = () => {
        setNewStaffName('');
        setNewStaffEmail('');
        setNewStaffPassword('');
        setNewStaffRole('Barber');
        setNewStaffSpecialty('');
        setAddStaffError(null);
        setIsAddStaffModalOpen(true);
    };

    const handleCreateStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddStaffError(null);

        const trimmedName = newStaffName.trim();
        const trimmedEmail = newStaffEmail.trim();

        if (!trimmedName) {
            setAddStaffError('Full Name is required.');
            return;
        }
        if (!trimmedEmail) {
            setAddStaffError('Email is required.');
            return;
        }
        if (!newStaffPassword || newStaffPassword.length < 8) {
            setAddStaffError('Password must be at least 8 characters long.');
            return;
        }

        setIsSubmittingStaff(true);
        try {
            await barberService.createStaff({
                name: trimmedName,
                email: trimmedEmail,
                password: newStaffPassword,
                role: newStaffRole,
                specialty: newStaffRole === 'Barber' ? (newStaffSpecialty.trim() || 'Classic Cuts') : undefined,
            });

            showToast(`Successfully added staff member "${trimmedName}" (${newStaffRole})`);
            setIsAddStaffModalOpen(false);
            window.dispatchEvent(new CustomEvent('demoshop:staff-changed'));
            await fetchStaff();
        } catch (err: any) {
            console.error('Failed to create staff member:', err);
            const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to create staff member. Please check input values and try again.';
            setAddStaffError(msg);
        } finally {
            setIsSubmittingStaff(false);
        }
    };

    // --- 3. EDIT STAFF ACCOUNT ---
    const handleOpenEditModal = (member: StaffDirectoryMember) => {
        setEditStaffMember(member);
        setEditName(member.name || '');
        setEditEmail(member.email || '');
        const roleNormalized = member.role.toLowerCase().includes('inventory') ? 'Inventory Manager' : member.role.toLowerCase() === 'cashier' ? 'Cashier' : 'Barber';
        setEditRole(roleNormalized);
        setEditSpecialty(member.specialty || '');
        setEditStaffError(null);
        setActiveDropdown(null);
    };

    const handleSaveEditStaff = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editStaffMember?.user_id) return;
        setEditStaffError(null);

        const trimmedName = editName.trim();
        const trimmedEmail = editEmail.trim();

        if (!trimmedName) {
            setEditStaffError('Full Name cannot be blank.');
            return;
        }
        if (!trimmedEmail) {
            setEditStaffError('Email cannot be blank.');
            return;
        }

        setIsSubmittingEdit(true);
        try {
            await barberService.updateStaff(editStaffMember.user_id, {
                name: trimmedName,
                email: trimmedEmail,
                role: editRole,
                specialty: editRole === 'Barber' ? editSpecialty.trim() : undefined,
            });

            showToast(`Updated account settings for ${trimmedName}`);
            setEditStaffMember(null);
            window.dispatchEvent(new CustomEvent('demoshop:staff-changed'));
            await fetchStaff();
        } catch (err: any) {
            console.error('Failed to update staff member:', err);
            const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to update staff settings.';
            setEditStaffError(msg);
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    // --- 4. RESET PASSWORD ---
    const handleOpenResetPasswordModal = (member: StaffDirectoryMember) => {
        setResetPasswordMember(member);
        setNewPassword('');
        setConfirmPassword('');
        setResetPasswordError(null);
        setActiveDropdown(null);
    };

    const handleSaveResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetPasswordMember?.user_id) return;
        setResetPasswordError(null);

        if (!newPassword || newPassword.length < 8) {
            setResetPasswordError('Password must be at least 8 characters long.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setResetPasswordError('Passwords do not match.');
            return;
        }

        setIsSubmittingPassword(true);
        try {
            await barberService.resetStaffPassword(resetPasswordMember.user_id, newPassword);
            showToast(`Password successfully reset for ${resetPasswordMember.name}`);
            setResetPasswordMember(null);
        } catch (err: any) {
            console.error('Failed to reset staff password:', err);
            const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to reset password.';
            setResetPasswordError(msg);
        } finally {
            setIsSubmittingPassword(false);
        }
    };

    // --- 5. SUSPEND / RESTORE STAFF ---
    const handleToggleSuspend = async (member: StaffDirectoryMember) => {
        if (!member.user_id) return;
        setActiveDropdown(null);

        const isCurrentlySuspended = !!member.is_suspended;
        const confirmText = isCurrentlySuspended
            ? `Are you sure you want to reactivate ${member.name}'s account?`
            : `Are you sure you want to suspend ${member.name}'s account? They will lose access to system actions.`;

        if (!window.confirm(confirmText)) return;

        try {
            if (isCurrentlySuspended) {
                await barberService.restoreStaff(member.user_id);
                showToast(`Account restored for ${member.name}`);
            } else {
                await barberService.suspendStaff(member.user_id);
                showToast(`Account suspended for ${member.name}`);
            }
            window.dispatchEvent(new CustomEvent('demoshop:staff-changed'));
            await fetchStaff();
        } catch (err: any) {
            console.error('Failed to change suspension state:', err);
            showToast(err?.response?.data?.error || err?.message || 'Failed to update account status');
        }
    };

    // --- 6. SCHEDULE MANAGEMENT ---
    const handleOpenScheduleModal = (member: StaffDirectoryMember) => {
        setScheduleModalMember(member);
        setActiveDropdown(null);
    };


    // --- HELPER: RENDER STATUS BADGE ---
    const renderStaffStatusBadge = (member: StaffDirectoryMember) => {
        const isSuspended = !!member.is_suspended;
        const rawStatus = (member.status || '').toString();
        const displayStatus = isSuspended
            ? 'Suspended'
            : rawStatus === 'Available' || rawStatus === 'available'
                ? 'On Duty'
                : rawStatus || 'Off Duty';

        const badgeClass = isSuspended
            ? 'text-red-400 bg-red-500/20 border-red-500/30'
            : displayStatus === 'On Duty'
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : displayStatus === 'Off Duty'
                    ? 'text-neutral-400 bg-neutral-800 border-neutral-700'
                    : displayStatus === 'On Break'
                        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                        : displayStatus === 'Absent'
                            ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                            : 'text-neutral-400 bg-neutral-800 border-neutral-700';

        return (
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm border inline-block whitespace-nowrap ${badgeClass}`}>
                {displayStatus}
            </span>
        );
    };

    // --- HELPER: RENDER ACTIONS DROPDOWN ---
    const renderActionsDropdown = (member: StaffDirectoryMember, cardKey: string) => {
        const isBarber = member.role.toLowerCase().includes('barber');
        const isSuspended = !!member.is_suspended;
        const isOpen = activeDropdown === cardKey;

        return (
            <div className="relative inline-block text-left" data-dropdown-container="true">
                <button
                    type="button"
                    onClick={() => toggleDropdown(cardKey)}
                    className="min-h-[36px] min-w-[36px] p-2 border border-white/10 hover:border-gold/30 rounded-sm text-ivory-dim hover:text-gold transition-colors cursor-pointer flex items-center justify-center"
                    title="Staff actions"
                    aria-haspopup="true"
                    aria-expanded={isOpen}
                >
                    <MoreVertical className="w-4 h-4" />
                </button>
                {isOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-52 bg-charcoal-light border border-white/10 rounded-sm shadow-2xl z-40 overflow-hidden divide-y divide-white/5">
                        {isBarber && (
                            <button
                                type="button"
                                onClick={() => handleOpenStatusModal(member)}
                                className="min-h-[40px] w-full text-left px-4 py-2.5 text-xs text-ivory hover:text-gold hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2.5"
                            >
                                <ShieldAlert className="w-4 h-4 text-gold" />
                                <span>Override Status</span>
                            </button>
                        )}
                        {isBarber && (
                            <button
                                type="button"
                                onClick={() => handleOpenScheduleModal(member)}
                                className="min-h-[40px] w-full text-left px-4 py-2.5 text-xs text-ivory hover:text-gold hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2.5"
                            >
                                <Clock className="w-4 h-4 text-blue-400" />
                                <span>Shift Schedule</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => handleOpenEditModal(member)}
                            className="min-h-[40px] w-full text-left px-4 py-2.5 text-xs text-ivory hover:text-gold hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2.5"
                        >
                            <UserCog className="w-4 h-4 text-gold" />
                            <span>Account Settings</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenResetPasswordModal(member)}
                            className="min-h-[40px] w-full text-left px-4 py-2.5 text-xs text-ivory hover:text-gold hover:bg-white/5 transition-all cursor-pointer flex items-center gap-2.5"
                        >
                            <KeyRound className="w-4 h-4 text-yellow-400" />
                            <span>Reset Password</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleToggleSuspend(member)}
                            className={`min-h-[40px] w-full text-left px-4 py-2.5 text-xs transition-all cursor-pointer flex items-center gap-2.5 ${
                                isSuspended
                                    ? 'text-green-400 hover:bg-green-500/10'
                                    : 'text-red-400 hover:bg-red-500/10'
                            }`}
                        >
                            {isSuspended ? (
                                <>
                                    <UserCheck className="w-4 h-4 text-green-400" />
                                    <span>Reactivate Staff</span>
                                </>
                            ) : (
                                <>
                                    <UserX className="w-4 h-4 text-red-400" />
                                    <span>Suspend Account</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="h-full min-h-0 flex flex-col gap-3 overflow-y-auto pb-28 sm:pb-32 lg:pb-6 touch-pan-y [-webkit-overflow-scrolling:touch] custom-scrollbar">
            {/* --- TOAST ALERT --- */}
            {toastMessage && (
                <Portal>
                    <div className="fixed bottom-6 right-6 z-50 bg-gold text-charcoal font-bold px-5 py-3 rounded-sm shadow-2xl flex items-center gap-3 animate-bounce">
                        <CheckCircle className="w-5 h-5 text-charcoal" />
                        <span>{toastMessage}</span>
                    </div>
                </Portal>
            )}

            {/* --- HEADER (Consistent with Reports & Audits) --- */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Owner/Admin • Staff Directory</p>
                    <h2 className="mt-1 text-2xl font-serif font-bold text-ivory">Staff Management</h2>
                    <p className="text-ivory-dim text-xs mt-1">
                        Manage shop staff accounts, live operational availability, shift schedules, and security credentials.
                    </p>
                </div>
                {/* Desktop Add Staff Button (>= sm) */}
                <div className="hidden sm:flex items-center gap-2.5">
                    <Button
                        type="button"
                        variant="primary"
                        onClick={handleOpenAddStaffModal}
                        className="min-h-[44px] bg-gold text-charcoal font-bold flex items-center justify-center gap-1.5 py-2 px-4 rounded-sm shadow-md hover:bg-gold/90 transition-all cursor-pointer text-xs"
                    >
                        <Plus className="w-4 h-4 text-charcoal" />
                        <span>Add Staff</span>
                    </Button>
                </div>
            </div>

            {/* --- SUB-NAVIGATION PILL BAR (Directly underneath page description) --- */}
            <div className="shrink-0 lg:hidden">
                <ManagementSubHeaderNav
                    activeSub="staff"
                    onSelect={onNavigateSubTab}
                />
            </div>

            {/* --- MOBILE ADD STAFF BUTTON (< sm): Positioned below sub-nav tabs and above stat counters --- */}
            <div className="sm:hidden shrink-0">
                <Button
                    type="button"
                    variant="primary"
                    onClick={handleOpenAddStaffModal}
                    className="w-full min-h-[44px] bg-gold text-charcoal font-bold flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-sm shadow-md hover:bg-gold/90 transition-all cursor-pointer text-xs"
                >
                    <Plus className="w-4 h-4 text-charcoal" />
                    <span>Add Staff</span>
                </Button>
            </div>

            {/* --- 3 COMPACT KPI METRIC CARDS (Matches Reports & Audits mobile style) --- */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
                {/* Total Staff Card */}
                <button
                    type="button"
                    onClick={() => setRoleFilter('all')}
                    className={`bg-charcoal-light border p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0 text-left transition-all cursor-pointer ${
                        roleFilter === 'all' ? 'border-gold/50 bg-gold/10' : 'border-white/5 hover:border-white/20'
                    }`}
                >
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Total Staff
                        </p>
                        {isLoading && staffList.length === 0 ? (
                            <div className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16 bg-white/10 rounded animate-pulse" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-gold mt-0.5 sm:mt-1 truncate">
                                {staffList.length}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-gold/10 rounded-full border border-gold/20 shrink-0">
                        <Users className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gold" />
                    </div>
                </button>

                {/* Barbers Card */}
                <button
                    type="button"
                    onClick={() => setRoleFilter('barber')}
                    className={`bg-charcoal-light border p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0 text-left transition-all cursor-pointer ${
                        roleFilter === 'barber' ? 'border-violet-400/50 bg-violet-400/10' : 'border-white/5 hover:border-white/20'
                    }`}
                >
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Barbers
                        </p>
                        {isLoading && staffList.length === 0 ? (
                            <div className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16 bg-white/10 rounded animate-pulse" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-violet-300 mt-0.5 sm:mt-1 truncate">
                                {barbersCount}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-violet-400/10 rounded-full border border-violet-400/20 shrink-0">
                        <Scissors className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-violet-300" />
                    </div>
                </button>

                {/* Cashiers Card */}
                <button
                    type="button"
                    onClick={() => setRoleFilter('cashier')}
                    className={`bg-charcoal-light border p-2 sm:p-3 rounded-sm card-gold-accent flex items-center justify-between min-w-0 text-left transition-all cursor-pointer ${
                        roleFilter === 'cashier' ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/5 hover:border-white/20'
                    }`}
                >
                    <div className="min-w-0">
                        <p className="text-[8px] sm:text-[10px] text-ivory-dim uppercase tracking-wider font-bold truncate">
                            Cashiers
                        </p>
                        {isLoading && staffList.length === 0 ? (
                            <div className="mt-0.5 sm:mt-1 h-5 sm:h-8 w-8 sm:w-16 bg-white/10 rounded animate-pulse" />
                        ) : (
                            <h4 className="text-sm sm:text-2xl font-serif font-bold text-emerald-400 mt-0.5 sm:mt-1 truncate">
                                {cashiersCount}
                            </h4>
                        )}
                    </div>
                    <div className="p-1.5 sm:p-3 bg-emerald-500/10 rounded-full border border-emerald-500/20 shrink-0">
                        <Briefcase className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-emerald-400" />
                    </div>
                </button>
            </div>

            {/* --- ROLE FILTER & VIEW MODE TOOLBAR --- */}
            <div className="shrink-0 bg-charcoal-light border border-white/5 rounded-sm p-2 sm:p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-serif font-bold text-ivory truncate">Directory Roster</span>
                    <span className="text-[10px] font-mono text-ivory-dim uppercase tracking-wider shrink-0">
                        • {filteredStaff.length} {filteredStaff.length === 1 ? 'member' : 'members'}
                    </span>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                    {/* View Switcher: Table vs Cards */}
                    <div role="group" aria-label="Staff directory layout" className="flex bg-charcoal border border-white/10 rounded-sm p-0.5">
                        {(['table', 'cards'] as const).map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                aria-pressed={viewMode === mode}
                                onClick={() => setViewMode(mode)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xs text-xs font-semibold cursor-pointer transition-colors ${
                                    viewMode === mode ? 'bg-gold text-charcoal shadow-sm' : 'text-ivory-dim hover:text-gold'
                                }`}
                                title={mode === 'table' ? 'Table View' : 'Cards View'}
                            >
                                {mode === 'table' ? <List className="w-3.5 h-3.5" /> : <LayoutGrid className="w-3.5 h-3.5" />}
                                <span className="hidden md:inline">{mode === 'table' ? 'Table' : 'Cards'}</span>
                            </button>
                        ))}
                    </div>

                    {/* Mobile Role Dropdown (< sm) */}
                    <div className="sm:hidden">
                        <select
                            aria-label="Filter staff by role"
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value as 'all' | 'barber' | 'cashier')}
                            className="min-h-[34px] bg-charcoal border border-white/10 px-2 py-1 text-xs text-ivory focus:border-gold focus:outline-none rounded-sm"
                        >
                            <option value="all">All ({staffList.length})</option>
                            <option value="barber">Barbers ({barbersCount})</option>
                            <option value="cashier">Cashiers ({cashiersCount})</option>
                        </select>
                    </div>

                    {/* Desktop Role Pills (>= sm) */}
                    <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono text-ivory-dim uppercase tracking-wider mr-1">Role:</span>
                        <button
                            type="button"
                            onClick={() => setRoleFilter('all')}
                            className={`min-h-[34px] px-3 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                roleFilter === 'all'
                                    ? 'bg-gold text-charcoal font-black shadow-sm border border-gold'
                                    : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-ivory border border-white/5'
                            }`}
                        >
                            All ({staffList.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setRoleFilter('barber')}
                            className={`min-h-[34px] px-3 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                roleFilter === 'barber'
                                    ? 'bg-gold text-charcoal font-black shadow-sm border border-gold'
                                    : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-ivory border border-white/5'
                            }`}
                        >
                            Barbers ({barbersCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setRoleFilter('cashier')}
                            className={`min-h-[34px] px-3 py-1 rounded-sm text-xs font-semibold transition-all cursor-pointer ${
                                roleFilter === 'cashier'
                                    ? 'bg-gold text-charcoal font-black shadow-sm border border-gold'
                                    : 'bg-white/5 hover:bg-white/10 text-ivory-dim hover:text-ivory border border-white/5'
                            }`}
                        >
                            Cashiers ({cashiersCount})
                        </button>
                    </div>
                </div>
            </div>

            <div className="w-full shrink-0 lg:shrink lg:flex-1 lg:min-h-0 flex flex-col overflow-visible space-y-4">
            {/* --- ERROR STATE --- */}
            {errorMessage && staffList.length === 0 && (
                <div className="p-8 bg-red-500/10 border border-red-500/20 rounded-sm text-center space-y-4 card-gold-accent">
                    <ShieldAlert className="w-10 h-10 text-red-400 mx-auto" />
                    <div className="space-y-1">
                        <h4 className="text-sm font-bold text-ivory">Unable to Load Staff Directory</h4>
                        <p className="text-xs text-red-300/90">{errorMessage}</p>
                    </div>
                    <Button
                        variant="outline"
                        onClick={() => void fetchStaff()}
                        className="min-h-[44px] border-red-500/30 text-red-300 hover:bg-red-500/20 text-xs inline-flex items-center gap-1.5 py-1.5 px-3"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                    </Button>
                </div>
            )}

            {/* --- LOADING SKELETON --- */}
            {isLoading && staffList.length === 0 && !errorMessage && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="bg-charcoal-light border border-white/5 rounded-sm p-4 animate-pulse space-y-3">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-full bg-white/5"></div>
                                <div className="space-y-2 flex-1">
                                    <div className="h-4 bg-white/10 rounded w-1/2"></div>
                                    <div className="h-3 bg-white/5 rounded w-1/4"></div>
                                </div>
                            </div>
                            <div className="h-6 bg-white/5 rounded w-3/4"></div>
                            <div className="h-4 bg-white/5 rounded w-full"></div>
                        </div>
                    ))}
                </div>
            )}

            {/* --- STAFF DIRECTORY: TABLE OR CARDS VIEW --- */}
            {!isLoading && !errorMessage && filteredStaff.length > 0 && (
                viewMode === 'table' ? (
                    /* Structured Tabular Columns: Staff Member | Role | Status | Contact / Branch | Shift Info | Actions */
                    <div className="bg-charcoal-light border border-white/10 rounded-sm shadow-md overflow-hidden">
                        <div className="overflow-x-auto admin-table-scroll">
                            <div className="min-w-[850px]">
                                {/* Table Column Headers */}
                                <div className="grid grid-cols-[minmax(220px,2fr)_minmax(140px,1.2fr)_minmax(110px,1fr)_minmax(160px,1.3fr)_minmax(170px,1.4fr)_minmax(80px,0.6fr)] text-[11px] font-bold uppercase tracking-wider text-ivory-dim py-3 px-4 bg-charcoal border-b border-white/10 select-none shadow-xs">
                                    <div>STAFF MEMBER</div>
                                    <div>ROLE</div>
                                    <div>STATUS</div>
                                    <div>CONTACT / BRANCH</div>
                                    <div>SHIFT INFO</div>
                                    <div className="text-right">ACTIONS</div>
                                </div>

                                <div className="divide-y divide-white/5">
                                    {filteredStaff.map((member) => {
                                        const cardKey = member.user_id || `staff-${member.id || member.barber_id}`;
                                        const isBarber = member.role.toLowerCase().includes('barber');
                                        const isSuspended = !!member.is_suspended;

                                        return (
                                            <div
                                                key={cardKey}
                                                data-search-id={`staff-${member.user_id} staff-${member.barber_id || ''} staff-${member.id || ''} ${member.user_id} ${member.barber_id || ''} ${member.id || ''}`.trim()}
                                                className={`grid grid-cols-[minmax(220px,2fr)_minmax(140px,1.2fr)_minmax(110px,1fr)_minmax(160px,1.3fr)_minmax(170px,1.4fr)_minmax(80px,0.6fr)] items-center py-3.5 px-4 hover:bg-zinc-800/60 transition-colors duration-150 group relative ${
                                                    activeDropdown === cardKey ? 'z-30 bg-zinc-800/40' : 'z-10'
                                                } ${isSuspended ? 'bg-red-500/[0.02] opacity-80' : ''}`}
                                            >
                                                {/* 1. STAFF MEMBER */}
                                                <div className="flex items-center gap-3 min-w-0 pr-2">
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border shrink-0 transition-colors overflow-hidden relative ${
                                                        isSuspended
                                                            ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                                            : 'bg-gold/10 text-gold border-gold/30 group-hover:border-gold'
                                                    }`}>
                                                        <span className="select-none">{member.name.charAt(0).toUpperCase()}</span>
                                                        {(member.profile_picture || member.avatar_url) && (
                                                            <img
                                                                src={(member.profile_picture || member.avatar_url)!}
                                                                alt={member.name}
                                                                width={40}
                                                                height={40}
                                                                loading="lazy"
                                                                decoding="async"
                                                                className="absolute inset-0 w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <h4 className="text-sm font-serif font-bold text-ivory truncate">{member.name}</h4>
                                                            {isSuspended && (
                                                                <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[8px] font-bold uppercase rounded-sm border border-red-500/30">
                                                                    Suspended
                                                                </span>
                                                            )}
                                                        </div>
                                                        {member.email && (
                                                            <p className="text-ivory-dim text-[11px] truncate mt-0.5">{member.email}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* 2. ROLE */}
                                                <div className="pr-2">
                                                    <span className="text-gold text-xs uppercase tracking-wider font-bold block">{member.role}</span>
                                                    {member.specialty && (
                                                        <span className="text-[11px] text-ivory-dim/80 truncate block">{member.specialty}</span>
                                                    )}
                                                    {isBarber && (
                                                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-gold font-bold">
                                                            <Star className="w-2.5 h-2.5 fill-gold text-gold" />
                                                            <span>{member.rating || '5.0'}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 3. STATUS */}
                                                <div>
                                                    {renderStaffStatusBadge(member)}
                                                </div>

                                                {/* 4. CONTACT / BRANCH */}
                                                <div className="text-xs text-ivory-dim min-w-0 pr-2">
                                                    <div className="truncate flex items-center gap-1">
                                                        <MapPin className="w-3 h-3 text-gold/70 shrink-0" />
                                                        <span className="text-ivory font-medium truncate">{member.branch || 'SampleBranch Branch'}</span>
                                                    </div>
                                                    {member.username && (
                                                        <span className="text-[11px] text-ivory-dim/60 block font-mono truncate ml-4">@{member.username}</span>
                                                    )}
                                                </div>

                                                {/* 5. SHIFT INFO */}
                                                <div className="pr-2">
                                                    {isBarber ? (
                                                        <div className="space-y-0.5">
                                                            {member.shift_is_off ? (
                                                                <span className="text-amber-400 text-xs font-mono font-medium block">Off Today</span>
                                                            ) : member.shift_start_time && member.shift_end_time ? (
                                                                <span className="text-ivory text-xs font-mono block">
                                                                    {member.shift_start_time} - {member.shift_end_time}
                                                                </span>
                                                            ) : (
                                                                <span className="text-ivory-dim/60 text-xs block">Standard Shift</span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenScheduleModal(member)}
                                                                className="text-[10px] text-gold hover:underline cursor-pointer flex items-center gap-1"
                                                            >
                                                                <Clock className="w-3 h-3 text-gold shrink-0" />
                                                                <span>{member.total_services_completed ?? 0} cuts • View Shift</span>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-ivory-dim">Regular Schedule</span>
                                                    )}
                                                </div>

                                                {/* 6. ACTIONS */}
                                                <div className="text-right">
                                                    {renderActionsDropdown(member, cardKey)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Existing Cards View */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredStaff.map((member) => {
                            const cardKey = member.user_id || `staff-${member.id || member.barber_id}`;
                            const isBarber = member.role.toLowerCase().includes('barber');
                            const isSuspended = !!member.is_suspended;

                            return (
                                <div
                                    key={cardKey}
                                    data-search-id={`staff-${member.user_id} staff-${member.barber_id || ''} staff-${member.id || ''} ${member.user_id} ${member.barber_id || ''} ${member.id || ''}`.trim()}
                                    className={`bg-charcoal-light border rounded-sm p-3.5 sm:p-4 transition-all duration-200 ease-in-out group flex flex-col gap-3 relative card-gold-accent ${
                                        activeDropdown === cardKey ? 'z-30' : 'z-10'
                                    } ${
                                        isSuspended ? 'border-red-500/30 opacity-75' : 'border-white/5 hover:border-gold/30'
                                    }`}
                                >
                                    {/* Top Row: Avatar, Name & Role, Actions Button */}
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                            <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-bold text-lg sm:text-xl border shrink-0 transition-colors overflow-hidden relative ${
                                                isSuspended
                                                    ? 'bg-red-500/10 text-red-400 border-red-500/30'
                                                    : 'bg-gold/10 text-gold border-gold/30 group-hover:border-gold'
                                            }`}>
                                                <span className="select-none">{member.name.charAt(0).toUpperCase()}</span>
                                                {(member.profile_picture || member.avatar_url) && (
                                                    <img
                                                        src={(member.profile_picture || member.avatar_url)!}
                                                        alt={member.name}
                                                        width={56}
                                                        height={56}
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                        onError={(e) => {
                                                            (e.currentTarget as HTMLElement).style.display = 'none';
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="text-base sm:text-lg font-serif font-bold text-ivory truncate">{member.name}</h4>
                                                    {isSuspended && (
                                                        <span className="px-1.5 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold uppercase rounded-sm border border-red-500/30">
                                                            Suspended
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gold text-xs uppercase tracking-widest font-bold mt-0.5">{member.role}</p>
                                                {member.email && (
                                                    <p className="text-ivory-dim text-[11px] truncate mt-0.5 flex items-center gap-1">
                                                        <Mail className="w-3 h-3 text-ivory-dim/70 shrink-0" />
                                                        <span className="truncate">{member.email}</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions Dropdown */}
                                        {renderActionsDropdown(member, cardKey)}
                                    </div>

                                    {/* Middle Row: Inline Badges */}
                                    <div className="flex flex-wrap gap-2">
                                        {member.specialty && (
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/5 text-xs text-ivory-dim">
                                                <Scissors className="w-3 h-3 text-gold/70" />
                                                <span>{member.specialty}</span>
                                            </div>
                                        )}
                                        {isBarber && (
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/10 border border-gold/20 text-xs text-gold font-bold">
                                                <Star className="w-3 h-3 fill-gold text-gold" />
                                                <span>{member.rating || '5.0'}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Divider */}
                                    <div className="h-[1px] bg-white/5 w-full"></div>

                                    {/* Bottom Row: Status & Total Services Done */}
                                    <div className="flex flex-wrap justify-between items-center gap-3 text-xs">
                                        {renderStaffStatusBadge(member)}

                                        {isBarber && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenScheduleModal(member)}
                                                className="min-h-[36px] flex items-center gap-1.5 text-[10px] text-ivory-dim hover:text-gold uppercase tracking-widest transition-colors cursor-pointer"
                                                title="Total completed services • View schedule"
                                            >
                                                <Scissors className="w-3.5 h-3.5 text-gold" />
                                                <span>{member.total_services_completed ?? 0} services done</span>
                                            </button>
                                        )}
                                        {!isBarber && (
                                            <span className="text-[10px] text-ivory-dim uppercase tracking-widest flex items-center gap-1.5">
                                                <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                                                <span>Staff Member</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            )}

            {/* --- EMPTY STATE --- */}
            {!isLoading && !errorMessage && filteredStaff.length === 0 && (
                <div className="text-center py-20 bg-charcoal-light border border-dashed border-white/10 rounded-sm card-gold-accent flex flex-col items-center">
                    <Briefcase className="w-12 h-12 text-white/10 mb-4" />
                    <p className="text-ivory-dim italic text-sm mb-4">No staff members found matching your filter criteria.</p>
                    <Button
                        variant="primary"
                        onClick={handleOpenAddStaffModal}
                        className="bg-gold text-charcoal font-bold inline-flex items-center gap-1.5 py-2 px-4 rounded-sm shadow-md cursor-pointer"
                    >
                        <Plus className="w-4 h-4" />
                        <span>Add New Staff Member</span>
                    </Button>
                </div>
            )}
            </div>

            {/* --- MODAL 1: ADD STAFF --- */}
            <Modal sidebarOffset
                isOpen={isAddStaffModalOpen}
                onClose={() => !isSubmittingStaff && setIsAddStaffModalOpen(false)}
                title="Add New Staff Member"
                size="md"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setIsAddStaffModalOpen(false)}
                            disabled={isSubmittingStaff}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleCreateStaff}
                            disabled={isSubmittingStaff}
                            className="bg-gold text-charcoal font-bold flex items-center gap-1.5"
                        >
                            {isSubmittingStaff ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                                    <span>Creating Account...</span>
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 text-charcoal" />
                                    <span>Create Staff Member</span>
                                </>
                            )}
                        </Button>
                    </div>
                }
            >
                <form onSubmit={handleCreateStaff} className="space-y-4">
                    {addStaffError && (
                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-sm text-xs text-red-300 flex items-start gap-2">
                            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span>{addStaffError}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                                Full Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={newStaffName}
                                onChange={(e) => setNewStaffName(e.target.value)}
                                placeholder="e.g. Master Miguel"
                                className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                                Role *
                            </label>
                            <select
                                value={newStaffRole}
                                onChange={(e) => setNewStaffRole(e.target.value as 'Barber' | 'Cashier')}
                                className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                            >
                                <option value="Barber">Barber</option>
                                <option value="Cashier">Cashier</option>
                                <option value="Inventory Manager">Inventory Manager</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            required
                            value={newStaffEmail}
                            onChange={(e) => setNewStaffEmail(e.target.value)}
                            placeholder="e.g. portfolio@example.invalid"
                            className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                            Password * (min 8 characters)
                        </label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={newStaffPassword}
                            onChange={(e) => setNewStaffPassword(e.target.value)}
                            placeholder="e.g. DemoShop@2026"
                            className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        />
                    </div>

                    {newStaffRole === 'Barber' && (
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                                Specialty / Focus
                            </label>
                            <input
                                type="text"
                                value={newStaffSpecialty}
                                onChange={(e) => setNewStaffSpecialty(e.target.value)}
                                placeholder="e.g. Classic Cuts, Beard Sculpting"
                                className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                            />
                        </div>
                    )}
                </form>
            </Modal>

            {/* --- MODAL 2: EDIT ACCOUNT SETTINGS --- */}
            <Modal sidebarOffset
                isOpen={!!editStaffMember}
                onClose={() => !isSubmittingEdit && setEditStaffMember(null)}
                title={`Account Settings: ${editStaffMember?.name}`}
                size="md"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setEditStaffMember(null)}
                            disabled={isSubmittingEdit}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveEditStaff}
                            disabled={isSubmittingEdit}
                            className="bg-gold text-charcoal font-bold flex items-center gap-1.5"
                        >
                            {isSubmittingEdit ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <span>Save Changes</span>
                            )}
                        </Button>
                    </div>
                }
            >
                <form onSubmit={handleSaveEditStaff} className="space-y-4">
                    {editStaffError && (
                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-sm text-xs text-red-300 flex items-start gap-2">
                            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span>{editStaffError}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                                Full Name *
                            </label>
                            <input
                                type="text"
                                required
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                                Role *
                            </label>
                            <select
                                value={editRole}
                                onChange={(e) => setEditRole(e.target.value as 'Barber' | 'Cashier')}
                                className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                            >
                                <option value="Barber">Barber</option>
                                <option value="Cashier">Cashier</option>
                                <option value="Inventory Manager">Inventory Manager</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                            Email Address *
                        </label>
                        <input
                            type="email"
                            required
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        />
                    </div>

                    {editRole === 'Barber' && (
                        <div>
                            <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                                Specialty / Focus
                            </label>
                            <input
                                type="text"
                                value={editSpecialty}
                                onChange={(e) => setEditSpecialty(e.target.value)}
                                placeholder="e.g. Classic Cuts, Fade Specialist"
                                className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                            />
                        </div>
                    )}
                </form>
            </Modal>

            {/* --- MODAL 3: RESET PASSWORD --- */}
            <Modal sidebarOffset
                isOpen={!!resetPasswordMember}
                onClose={() => !isSubmittingPassword && setResetPasswordMember(null)}
                title={`Reset Password: ${resetPasswordMember?.name}`}
                size="md"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setResetPasswordMember(null)}
                            disabled={isSubmittingPassword}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveResetPassword}
                            disabled={isSubmittingPassword}
                            className="bg-gold text-charcoal font-bold flex items-center gap-1.5"
                        >
                            {isSubmittingPassword ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-charcoal" />
                                    <span>Resetting...</span>
                                </>
                            ) : (
                                <span>Update Password</span>
                            )}
                        </Button>
                    </div>
                }
            >
                <form onSubmit={handleSaveResetPassword} className="space-y-4">
                    {resetPasswordError && (
                        <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-sm text-xs text-red-300 flex items-start gap-2">
                            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <span>{resetPasswordError}</span>
                        </div>
                    )}

                    <div className="bg-white/5 border border-white/10 p-3 rounded-sm text-xs text-ivory-dim flex items-start gap-2.5">
                        <KeyRound className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                        <div>
                            Set a new secure password for <strong className="text-ivory">{resetPasswordMember?.name}</strong>. Their active sessions will be revoked and they must log in with this new credential.
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                            New Password * (min 8 characters)
                        </label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">
                            Confirm Password *
                        </label>
                        <input
                            type="password"
                            required
                            minLength={8}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            className="w-full bg-charcoal border border-white/10 px-3.5 py-2 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        />
                    </div>
                </form>
            </Modal>

            {/* --- MODAL 4: SHIFT SCHEDULE & OPERATIONAL WORKLOAD --- */}
            <Modal sidebarOffset
                isOpen={!!scheduleModalMember}
                onClose={() => setScheduleModalMember(null)}
                title={`Shift Schedule & Workload: ${scheduleModalMember?.name}`}
                size="md"
                footer={
                    <div className="flex justify-between items-center w-full">
                        {onNavigateShifts ? (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setScheduleModalMember(null);
                                    onNavigateShifts();
                                }}
                                className="text-xs text-gold border-gold/30 hover:bg-gold/10"
                            >
                                Open Staff Shift Management
                            </Button>
                        ) : <div />}
                        <Button
                            variant="primary"
                            onClick={() => setScheduleModalMember(null)}
                            className="bg-gold text-charcoal font-bold"
                        >
                            Done
                        </Button>
                    </div>
                }
            >
                {scheduleModalMember && (
                    <div className="space-y-4">
                        {/* Summary Pill Card */}
                        <div className="p-4 bg-white/5 border border-white/10 rounded-sm space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-ivory-dim">Operational Status:</span>
                                {(() => {
                                    const rawModalStatus = (scheduleModalMember.status || '').toString();
                                    const displayModalStatus = scheduleModalMember.is_suspended
                                        ? 'Suspended'
                                        : rawModalStatus === 'Available' || rawModalStatus === 'available'
                                            ? 'On Duty'
                                            : rawModalStatus || 'Off Duty';
                                    const modalBadgeClass = scheduleModalMember.is_suspended
                                        ? 'text-red-400 bg-red-500/20 border-red-500/30'
                                        : displayModalStatus === 'On Duty'
                                            ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                            : displayModalStatus === 'Off Duty'
                                                ? 'text-neutral-400 bg-neutral-800 border-neutral-700'
                                                : displayModalStatus === 'On Break'
                                                    ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20'
                                                    : displayModalStatus === 'Absent'
                                                        ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                                                        : 'text-neutral-400 bg-neutral-800 border-neutral-700';
                                    return (
                                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm border ${modalBadgeClass}`}>
                                            {displayModalStatus}
                                        </span>
                                    );
                                })()}
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-ivory-dim">Total Services Done:</span>
                                <span className="text-sm font-bold text-ivory font-mono">
                                    {scheduleModalMember.total_services_completed || 0} completed
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-ivory-dim">Branch Assignment:</span>
                                <span className="text-xs font-bold text-gold">
                                    {scheduleModalMember.branch || 'SampleBranch Branch'}
                                </span>
                            </div>
                        </div>

                        {/* Shift Roster Days */}
                        <div>
                            <h5 className="text-[11px] font-bold text-gold uppercase tracking-wider mb-2">Weekly Roster Standard</h5>
                            <div className="grid grid-cols-7 gap-1.5 text-center">
                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => {
                                    const isDayOff = idx === 6; // Sunday off as sample
                                    return (
                                        <div
                                            key={day}
                                            className={`p-2 rounded-sm border text-[11px] flex flex-col items-center gap-1 ${
                                                isDayOff
                                                    ? 'bg-white/5 border-white/5 text-ivory-dim/50'
                                                    : 'bg-gold/10 border-gold/30 text-ivory font-bold'
                                            }`}
                                        >
                                            <span className="text-[9px] uppercase tracking-wider text-ivory-dim">{day}</span>
                                            <span className="text-[10px]">{isDayOff ? 'OFF' : '9-6'}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="p-3 bg-white/5 border border-white/10 rounded-sm text-xs text-ivory-dim flex items-start gap-2.5">
                            <Clock className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                            <div>
                                To request a schedule swap, leave of absence, or emergency shift modification for this barber, visit <strong className="text-ivory">Staff Shift Management</strong>.
                            </div>
                        </div>
                    </div>
                )}
            </Modal>

            {/* --- MODAL 5: ADMINISTRATIVE STATUS OVERRIDE --- */}
            <Modal sidebarOffset
                isOpen={!!statusModalMember}
                onClose={() => setStatusModalMember(null)}
                title={`Administrative Status: ${statusModalMember?.name}`}
                size="md"
                footer={
                    <div className="flex justify-end gap-3 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setStatusModalMember(null)}
                            disabled={isUpdatingStatus}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveStatusOverride}
                            disabled={isUpdatingStatus}
                            className="bg-gold text-charcoal font-bold"
                        >
                            {isUpdatingStatus ? 'Saving...' : 'Apply Override'}
                        </Button>
                    </div>
                }
            >
                <form onSubmit={handleSaveStatusOverride} className="space-y-4">
                    <div className="bg-white/5 border border-white/10 p-3 rounded-sm text-xs text-ivory-dim flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                        <div>
                            <strong className="text-ivory">Shift & Status Logic:</strong> Shift status automatically syncs between <span className="text-emerald-400 font-bold">On Duty</span> and <span className="text-neutral-400 font-bold">Off Duty</span> based on configured schedules. Setting <span className="text-yellow-400 font-bold">On Break</span>, <span className="text-orange-400 font-bold">Absent</span>, or <span className="text-red-400 font-bold">Suspended</span> locks the staff member out of active queue assignment.
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">Administrative Status *</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="w-full bg-charcoal border border-white/10 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        >
                            <option value="On Duty">On Duty (Shift Scheduled Active)</option>
                            <option value="Off Duty">Off Duty (Off Shift / Day Off)</option>
                            <option value="On Break">On Break (Temporary Break)</option>
                            <option value="Absent">Absent (Shift Absence / Leave)</option>
                            <option value="Suspended">Suspended (Administrative Lock)</option>
                            <option value="Offline">Offline</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] uppercase tracking-widest text-gold mb-1 font-bold">Override Reason (Audited)</label>
                        <input
                            type="text"
                            value={statusReason}
                            onChange={(e) => setStatusReason(e.target.value)}
                            placeholder="e.g. Approved emergency leave / Front desk re-assignment"
                            className="w-full bg-charcoal border border-white/10 px-4 py-2.5 text-ivory text-sm focus:border-gold focus:outline-none rounded-sm"
                        />
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default StaffTab;
