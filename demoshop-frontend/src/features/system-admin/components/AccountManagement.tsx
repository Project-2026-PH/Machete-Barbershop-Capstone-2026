import React, { useState, useEffect, useRef } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { SteppingPagination } from '@/components/ui/SteppingPagination';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import { useAuth } from '@/components/auth/AuthContext';
import { supabase } from '@/config/supabaseClient';
import { api } from '@/config/api';
import { validateAvatarFile, getSafeAvatarExtension } from '@/utils/avatar-validation';
import {
    Users,
    UserCheck,
    UserX,
    UserPlus,
    Search,
    Filter,
    ArrowUpDown,
    MoreVertical,
    Eye,
    EyeOff,
    Edit2,
    Lock,
    RotateCcw,
    Shield,
    ShieldAlert,
    Copy,
    CheckCircle2,
    XCircle,
    UserCog,
    Scissors,
    Coins,
    Boxes,
    Store,
    KeyRound,
    ExternalLink,
    AlertTriangle,
    Info,
    Globe,
    ArrowRight,
    ShieldCheck,
    X,
    Camera,
    Upload
} from 'lucide-react';

const getAvatarUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }
    const apiBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000';
    return `${apiBase.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;
};

// RBAC Access Matrix & Feature Impact Definition
const ROLE_PERMISSIONS: Record<string, { label: string; perms: string[]; warnings: string[] }> = {
    Customer: {
        label: 'Customer',
        perms: [
            'Book self-service appointments & join walk-in queues',
            'Inspect personal haircut history & service receipts',
            'Accumulate and redeem customer loyalty rewards points',
            'Receive personal queue notifications & booking status alerts',
        ],
        warnings: [
            'User will lose all staff consoles, register access, and administrative privileges.',
        ],
    },
    Barber: {
        label: 'Barber',
        perms: [
            'Personal assigned barber chair & live queue desk',
            'Mark haircuts complete and log custom service formulas',
            'Inspect customer feedback and satisfaction ratings',
            'Track personal daily commissions, tip tallies, and earnings',
            'Submit shift swaps, leave requests, and availability to administration',
        ],
        warnings: [
            'User will be enrolled in the operational chair queue roster.',
        ],
    },
    Cashier: {
        label: 'Cashier',
        perms: [
            'Access Point-of-Sale (POS) terminal & walk-in customer intake',
            'Process cash, GCash, Maya, and credit card payments',
            'Open, reconcile, and close daily cash register drawer shifts',
            'Dispatch waiting customers from reception to available barber chairs',
        ],
        warnings: [
            'User will be granted operational access to register drawers and checkout balances.',
        ],
    },
    'Inventory Manager': {
        label: 'Inventory Manager',
        perms: [
            'Access inventory stock catalog and product ledger',
            'Submit physical stock count audits and replenishment requests',
            'Record inventory receipts and verify supplier deliveries',
            'Inspect real-time product consumption and movement history',
        ],
        warnings: [
            'User will have direct authority to record stock receipts and audit inventory levels.',
        ],
    },
    Owner: {
        label: 'Shop Admin',
        perms: [
            'Oversee daily branch shop floor and staff attendance',
            'Review, approve, or decline staff shift and leave requests',
            'Configure branch services, add-ons, pricing, and operating hours',
            'Inspect branch financial summaries and operational metrics',
        ],
        warnings: [
            'Administrative role: grants supervisory authority over branch staff, queues, and schedules.',
        ],
    },
    'Shop Admin': {
        label: 'Shop Admin',
        perms: [
            'Oversee daily branch shop floor and staff attendance',
            'Review, approve, or decline staff shift and leave requests',
            'Configure branch services, add-ons, pricing, and operating hours',
            'Inspect branch financial summaries and operational metrics',
        ],
        warnings: [
            'Administrative role: grants supervisory authority over branch staff, queues, and schedules.',
        ],
    },
    'System Admin': {
        label: 'Superadmin',
        perms: [
            'Full platform sovereignty across all system modules',
            'Provision and manage all staff, customer, and admin accounts',
            'Inspect global immutable security and operational audit logs',
            'Toggle platform feature gates and global operational settings',
            'Reset credentials, suspend accounts, and enforce security policies',
        ],
        warnings: [
            'CRITICAL SOVEREIGN PRIVILEGE: System Admin has unrestricted administrative authority across the entire platform.',
        ],
    },
};

const getOperationalWarning = (currentRole: string, targetRole: string): string => {
    const cur = (currentRole || '').toLowerCase();
    const tgt = (targetRole || '').toLowerCase();

    if ((cur.includes('system admin') || cur.includes('owner')) && !tgt.includes('system admin') && !tgt.includes('owner')) {
        return 'CRITICAL DEMOTION NOTICE: This user will immediately forfeit all System Administrator sovereignty, global audit trail inspection, feature gate toggles, and user management authority.';
    }
    if (tgt.includes('system admin') || tgt.includes('owner')) {
        return 'SOVEREIGN ELEVATION NOTICE: Granting System Admin confers unrestricted authority across the entire DemoShop platform, including user provisioning, security audit logs, and credential overrides.';
    }
    if (cur.includes('barber') && tgt.includes('cashier')) {
        return 'CHAIR UNASSIGNMENT & REGISTER BINDING: User will be detached from barber chair assignments and live haircut queues, and will gain access to Point-of-Sale cash register drawers.';
    }
    if (cur.includes('barber')) {
        return 'CHAIR UNASSIGNMENT: User will be detached from barber chair assignments and live haircut queues. Historical completed haircuts and commission records remain linked.';
    }
    if (cur.includes('cashier')) {
        return 'REGISTER ACCESS REVOCATION: User will lose access to the Point-of-Sale terminal. Ensure all open cash drawer shifts for this user are balanced and reconciled.';
    }
    if (cur.includes('inventory manager')) {
        return 'STOCK AUTHORITY REVOCATION: User will lose permissions to record inventory restocks or modify stock quantities. Pending count review requests will remain in queue.';
    }
    return 'Changing this user role will immediately alter their navigation, operational permissions, and data access upon their next action.';
};

const getAccountSourceInfo = (account: any) => {
    if (!account) return { type: 'unknown', label: 'Unknown Source', isGoogle: false, detail: '' };
    if (account.google_id || account.account_source === 'google') {
        return {
            type: 'google',
            label: 'Google Authentication',
            detail: 'Google OAuth SSO',
            isGoogle: true,
        };
    }
    if (account.creator_username || account.creator_email || account.creator_role) {
        const adminRole = account.creator_role || 'System Admin';
        const adminName = account.creator_username || account.creator_email;
        return {
            type: 'admin',
            label: adminRole,
            detail: `Created by ${adminName}`,
            isGoogle: false,
            adminName,
            adminRole,
        };
    }
    if (account.account_source === 'system' || account.role === 'System Admin' || account.role === 'Owner') {
        return {
            type: 'system',
            label: 'System Provisioned',
            detail: 'Platform Core Account',
            isGoogle: false,
        };
    }
    if ((account.role || '').toLowerCase() === 'customer') {
        return {
            type: 'self',
            label: 'Direct Registration',
            detail: 'Self-Registered Customer',
            isGoogle: false,
        };
    }
    return {
        type: 'admin',
        label: 'Administrator Created',
        detail: 'Provisioned by Admin',
        isGoogle: false,
    };
};

interface AccountManagementProps {
    initialCategory?: string;
    onCategoryChange?: (category: string) => void;
    initialRole?: string;
    onRoleChange?: (role: string) => void;
    initialStatus?: string;
    onStatusChange?: (status: string) => void;
    initialVerification?: string;
    onVerificationChange?: (verification: string) => void;
    initialSearch?: string;
    onSearchChange?: (search: string) => void;
    onViewAuditLogs?: (userEmail: string) => void;
    isProvisionModalOpenExternally?: boolean;
    onCloseProvisionModalExternally?: () => void;
}

export const AccountManagement: React.FC<AccountManagementProps> = ({
    initialCategory = 'all',
    onCategoryChange,
    initialRole = 'all',
    onRoleChange,
    initialStatus = 'all',
    onStatusChange,
    initialVerification = 'all',
    onVerificationChange,
    initialSearch = '',
    onSearchChange,
    onViewAuditLogs,
    isProvisionModalOpenExternally = false,
    onCloseProvisionModalExternally,
}) => {
    const { user: currentUser } = useAuth();
    const { addToast } = useToast();

    // Active Category Tab: 'all' | 'customers' | 'staff' | 'admins'
    const [activeCategory, setActiveCategory] = useState<string>(initialCategory || 'all');
    const [accounts, setAccounts] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Active System Admin count for sole-admin guard
    const [activeSystemAdminCount, setActiveSystemAdminCount] = useState<number>(1);

    // Filter and Sort states
    const [searchQuery, setSearchQuery] = useState(initialSearch || '');
    const [debouncedSearch, setDebouncedSearch] = useState(initialSearch || '');
    const [selectedRole, setSelectedRole] = useState(() => {
        if (!initialRole || initialRole === 'all') return 'all';
        if (initialRole.toLowerCase() === 'shop admin' || initialRole.toLowerCase() === 'shopadmin') return 'Owner';
        return initialRole;
    });
    const [accountStatusFilter, setAccountStatusFilter] = useState(initialStatus || 'all'); // 'all', 'active', 'suspended'
    const [verificationFilter, setVerificationFilter] = useState(initialVerification || 'all'); // 'all', 'verified', 'unverified', 'attention_required'
    const [sortBy, setSortBy] = useState('created_at_desc');

    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
    const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);

    // Modals
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
    const [isSuspendModalOpen, setIsSuspendModalOpen] = useState(false);
    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [isProvisionModalOpen, setIsProvisionModalOpen] = useState(false);

    // Selected Target Account
    const [targetAccount, setTargetAccount] = useState<any | null>(null);

    // Provision Form State
    const [provisionType, setProvisionType] = useState<'staff' | 'admin'>('staff');
    const [provisionForm, setProvisionForm] = useState({
        name: '',
        username: '',
        email: '',
        password: '',
        role: 'Barber',
        branchId: 1,
        specialty: 'Master Barber',
        profilePicture: null as File | null,
    });
    const [provisionPreviewUrl, setProvisionPreviewUrl] = useState<string | null>(null);
    const [isSubmittingProvision, setIsSubmittingProvision] = useState(false);

    // Edit Form State
    const [editForm, setEditForm] = useState({
        username: '',
        email: '',
        role: '',
        branchId: 1,
        profilePicture: null as File | null,
    });
    const [editPreviewUrl, setEditPreviewUrl] = useState<string | null>(null);
    const [editAvatarError, setEditAvatarError] = useState(false);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

    // Password Reset State
    const [newPassword, setNewPassword] = useState('');
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [isSubmittingReset, setIsSubmittingReset] = useState(false);

    // Role Change Confirmation Safety State
    const [isRoleChangeConfirmOpen, setIsRoleChangeConfirmOpen] = useState(false);
    const [roleConfirmText, setRoleConfirmText] = useState('');
    const [pendingEditPayload, setPendingEditPayload] = useState<any>(null);

    // Edit Modal Password Management
    const [editChangePassword, setEditChangePassword] = useState(false);
    const [editNewPassword, setEditNewPassword] = useState('');
    const [editShowNewPassword, setEditShowNewPassword] = useState(false);

    // Computed Diff for Edit Modal
    const editChangedFields = React.useMemo(() => {
        if (!targetAccount) return [];
        const changes: string[] = [];
        const origUsername = targetAccount.username || '';
        const newUsername = editForm.username.trim();
        if (newUsername !== origUsername) changes.push('Username');

        const origEmail = (targetAccount.email || '').toLowerCase().trim();
        const newEmail = editForm.email.toLowerCase().trim();
        if (newEmail !== origEmail) changes.push('Email');

        const origRole = targetAccount.role || '';
        const newRole = editForm.role || '';
        if (newRole !== origRole) changes.push('Role');

        if (editForm.profilePicture) changes.push('Profile Photo');
        if (editChangePassword && editNewPassword.length >= 8) changes.push('Password');

        return changes;
    }, [targetAccount, editForm, editChangePassword, editNewPassword]);

    const isEditFormDirty = editChangedFields.length > 0;

    // Action menu popover tracking
    const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
    const actionMenuRef = useRef<HTMLDivElement>(null);

    // Synchronize external provision modal prop if provided
    useEffect(() => {
        if (isProvisionModalOpenExternally) {
            handleOpenProvisionModal();
        }
    }, [isProvisionModalOpenExternally]);

    // Close action menu on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
                setOpenActionMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Debounce search query
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchQuery);
            setPage(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchQuery]);

    // Synchronize external search prop if changed via navigation or URL query
    useEffect(() => {
        if (typeof initialSearch === 'string' && initialSearch !== searchQuery) {
            setSearchQuery(initialSearch);
            setDebouncedSearch(initialSearch);
            setPage(1);
        }
    }, [initialSearch]);

    // Fetch dashboard stats to inspect sole System Admin count
    const fetchSystemStats = async () => {
        try {
            const res = await api.get('/api/system-admin/dashboard-stats');
            const u = res.data?.users;
            if (u && typeof u.active_system_admins_count === 'number') {
                setActiveSystemAdminCount(u.active_system_admins_count);
            }
        } catch (err) {
            console.error('[AccountManagement] Failed to fetch system stats:', err);
        }
    };

    useEffect(() => {
        fetchSystemStats();
    }, []);

    const activeFetchAbortRef = useRef<AbortController | null>(null);

    // Main fetch accounts query with cancellation protection against race conditions
    const fetchAccounts = async () => {
        if (activeFetchAbortRef.current) {
            activeFetchAbortRef.current.abort();
        }
        const controller = new AbortController();
        activeFetchAbortRef.current = controller;

        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: '10',
                filter: verificationFilter,
                roleFilter: selectedRole,
                statusFilter: accountStatusFilter,
                categoryFilter: activeCategory,
                sortBy: sortBy,
            });

            if (debouncedSearch.trim()) {
                params.append('search', debouncedSearch.trim());
            }

            const res = await api.get(`/api/system-admin/users?${params.toString()}`, {
                signal: controller.signal,
            });

            if (controller.signal.aborted) return;

            const data = res.data;
            setAccounts(data.users || []);
            setTotalPages(data.pagination?.pages || 1);
            setTotalCount(data.pagination?.total || 0);
        } catch (err: any) {
            if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) {
                return;
            }
            console.error('[AccountManagement] Failed to fetch accounts:', err);
            addToast({ type: 'error', message: 'Failed to retrieve account records.' });
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        fetchAccounts();
        return () => {
            if (activeFetchAbortRef.current) {
                activeFetchAbortRef.current.abort();
            }
        };
    }, [page, activeCategory, selectedRole, accountStatusFilter, verificationFilter, sortBy, debouncedSearch]);

    // Synchronize filters when props change externally (e.g. from Sidebar dropdown or Overview KPI cards)
    useEffect(() => {
        if (initialCategory !== undefined && initialCategory !== activeCategory) {
            setActiveCategory(initialCategory);
            setPage(1);
        }
    }, [initialCategory]);

    useEffect(() => {
        if (initialRole !== undefined) {
            const normalized = (initialRole.toLowerCase() === 'shop admin' || initialRole.toLowerCase() === 'shopadmin') ? 'Owner' : initialRole;
            if (normalized !== selectedRole) {
                setSelectedRole(normalized);
                setPage(1);
            }
        }
    }, [initialRole, selectedRole]);

    useEffect(() => {
        if (initialStatus !== undefined && initialStatus !== accountStatusFilter) {
            setAccountStatusFilter(initialStatus);
            setPage(1);
        }
    }, [initialStatus]);

    useEffect(() => {
        if (initialVerification !== undefined && initialVerification !== verificationFilter) {
            setVerificationFilter(initialVerification);
            setPage(1);
        }
    }, [initialVerification]);

    // Reset role filter when tab category changes
    const handleCategoryChange = (category: string) => {
        setActiveCategory(category);
        setSelectedRole('all');
        setPage(1);
        onCategoryChange?.(category);
        onRoleChange?.('all');
    };

    // Cryptographically secure password generator utility
    const generateSecurePassword = (length = 16) => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
        if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
            const array = new Uint32Array(length);
            window.crypto.getRandomValues(array);
            let res = '';
            for (let i = 0; i < length; i++) {
                res += charset[array[i] % charset.length];
            }
            return res;
        }
        let retVal = "";
        for (let i = 0, n = charset.length; i < length; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
        return retVal;
    };

    const copyToClipboard = (text: string, label = 'Password') => {
        navigator.clipboard.writeText(text);
        addToast({
            type: 'success',
            title: 'Copied',
            message: `${label} copied to clipboard.`,
            duration: 2500,
        });
    };

    // Filter reset state check and handler
    const hasActiveFilters = 
        Boolean(searchQuery.trim()) || 
        selectedRole !== 'all' || 
        accountStatusFilter !== 'all' || 
        verificationFilter !== 'all' || 
        activeCategory !== 'all';

    const handleResetFilters = () => {
        setSearchQuery('');
        setDebouncedSearch('');
        setSelectedRole('all');
        setAccountStatusFilter('all');
        setVerificationFilter('all');
        setActiveCategory('all');
        setPage(1);
        onSearchChange?.('');
        onCategoryChange?.('all');
        onRoleChange?.('all');
        onStatusChange?.('all');
        onVerificationChange?.('all');
    };

    // Account Source badge renderer (DemoShop Charcoal & Gold Standard)
    const renderAccountSourceBadge = (account: any) => {
        const source = getAccountSourceInfo(account);
        if (source.isGoogle) {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/10 text-gold border border-gold/20 shadow-[0_0_6px_rgba(212,175,55,0.1)]" title="Created via Google OAuth SSO">
                    <Globe className="w-2.5 h-2.5 text-gold" /> Google SSO
                </span>
            );
        }
        if (source.type === 'admin') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/15 text-gold border border-gold/30 shadow-[0_0_8px_rgba(212,175,55,0.15)]" title={source.detail}>
                    <ShieldCheck className="w-2.5 h-2.5 text-gold" /> {source.adminRole || 'System Admin'}
                </span>
            );
        }
        if (source.type === 'system') {
            return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/15 text-gold border border-gold/30 shadow-[0_0_8px_rgba(212,175,55,0.15)]" title="Platform Core Account">
                    <KeyRound className="w-2.5 h-2.5 text-gold" /> System Provisioned
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-ivory-dim border border-white/10" title={source.detail}>
                <Users className="w-2.5 h-2.5 text-ivory-dim" /> Direct Signup
            </span>
        );
    };

    // RBAC and Safety guards
    const currentUserId = String(currentUser?.user_id || (currentUser as any)?.id || '');
    const isSelfAccount = (account: any) => String(account.user_id) === currentUserId;

    const isSystemAdminRole = (role: string) => {
        const r = (role || '').toLowerCase();
        return r.includes('system admin') || r.includes('systemadmin') || r.includes('owner');
    };

    const isSoleSystemAdmin = (account: any) => {
        return isSystemAdminRole(account.role) && activeSystemAdminCount <= 1;
    };

    // --- PROVISIONING ---
    const handleOpenProvisionModal = () => {
        const generated = generateSecurePassword();
        setProvisionForm({
            name: '',
            username: '',
            email: '',
            password: generated,
            role: provisionType === 'staff' ? 'Barber' : 'System Admin',
            branchId: 1,
            specialty: 'Master Barber',
            profilePicture: null,
        });
        setProvisionPreviewUrl(null);
        setIsProvisionModalOpen(true);
    };

    const uploadAvatar = async (file: File, targetUserId?: string | number) => {
        const validationError = validateAvatarFile(file);
        if (validationError) throw new Error(validationError);

        const formData = new FormData();
        formData.append('avatar', file);
        if (targetUserId) {
            formData.append('userId', String(targetUserId));
        }

        const res = await api.post('/api/system-admin/users/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });

        const publicUrl = res.data?.publicUrl || res.data?.profilePicture;
        if (!publicUrl) throw new Error('No public avatar URL returned from server.');
        return publicUrl;
    };

    const handleSubmitProvision = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmittingProvision(true);

        try {
            let avatarUrl = null;
            if (provisionForm.profilePicture) {
                avatarUrl = await uploadAvatar(provisionForm.profilePicture);
            }

            if (provisionType === 'staff') {
                await api.post('/api/system-admin/staff', {
                    name: provisionForm.name || provisionForm.username,
                    email: provisionForm.email,
                    password: provisionForm.password,
                    role: provisionForm.role,
                    username: provisionForm.username || provisionForm.name,
                    branchId: provisionForm.branchId,
                    specialty: provisionForm.specialty,
                    profilePicture: avatarUrl,
                });
                addToast({ type: 'success', title: 'Staff Provisioned', message: `${provisionForm.name || provisionForm.email} added successfully.` });
            } else {
                await api.post('/api/system-admin/admins', {
                    email: provisionForm.email,
                    password: provisionForm.password,
                    role: provisionForm.role,
                    username: provisionForm.username || undefined,
                    profilePicture: avatarUrl,
                });
                addToast({ type: 'success', title: 'Administrator Provisioned', message: `${provisionForm.email} created as ${provisionForm.role}.` });
            }

            setIsProvisionModalOpen(false);
            if (onCloseProvisionModalExternally) onCloseProvisionModalExternally();
            fetchAccounts();
            fetchSystemStats();
        } catch (err: any) {
            console.error('[AccountManagement] Provision failed:', err);
            addToast({
                type: 'error',
                title: 'Provisioning Failed',
                message: err.response?.data?.error || err.message || 'Unable to create account.',
            });
        } finally {
            setIsSubmittingProvision(false);
        }
    };

    // --- SUSPENSION / RESTORATION ---
    const handleConfirmSuspend = async () => {
        if (!targetAccount) return;
        try {
            await api.put(`/api/system-admin/users/${targetAccount.user_id}/suspend`);
            addToast({
                type: 'success',
                title: 'Account Suspended',
                message: `${targetAccount.username || targetAccount.email} has been deactivated. Historical records remain intact.`,
            });
            setIsSuspendModalOpen(false);
            setTargetAccount(null);
            fetchAccounts();
            fetchSystemStats();
        } catch (err: any) {
            addToast({
                type: 'error',
                title: 'Suspension Failed',
                message: err.response?.data?.error || err.message || 'Unable to suspend account.',
            });
        }
    };

    const handleConfirmRestore = async () => {
        if (!targetAccount) return;
        try {
            await api.put(`/api/system-admin/users/${targetAccount.user_id}/restore`);
            addToast({
                type: 'success',
                title: 'Account Reactivated',
                message: `${targetAccount.username || targetAccount.email} has been restored to active status.`,
            });
            setIsRestoreModalOpen(false);
            setTargetAccount(null);
            fetchAccounts();
            fetchSystemStats();
        } catch (err: any) {
            addToast({
                type: 'error',
                title: 'Restoration Failed',
                message: err.response?.data?.error || err.message || 'Unable to reactivate account.',
            });
        }
    };

    // --- CREDENTIAL RESET ---
    const handleOpenResetModal = (account: any) => {
        setTargetAccount(account);
        setNewPassword(generateSecurePassword());
        setShowNewPassword(false);
        setIsResetPasswordModalOpen(true);
        setOpenActionMenuId(null);
    };

    const handleConfirmResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetAccount) return;
        setIsSubmittingReset(true);

        try {
            await api.post(`/api/system-admin/users/${targetAccount.user_id}/reset-password`, {
                newPassword: newPassword,
            });
            addToast({
                type: 'success',
                title: 'Password Updated',
                message: `Credentials updated for ${targetAccount.email}. Remember to share the temporary password with the user.`,
            });
            setIsResetPasswordModalOpen(false);
            setTargetAccount(null);
        } catch (err: any) {
            addToast({
                type: 'error',
                title: 'Reset Failed',
                message: err.response?.data?.error || err.message || 'Failed to update credentials.',
            });
        } finally {
            setIsSubmittingReset(false);
        }
    };

    // --- EDIT PROFILE ---
    const handleOpenEditModal = (account: any) => {
        setTargetAccount(account);
        const initialFormRole = (account.role || '').toLowerCase() === 'shop admin' ? 'Owner' : (account.role || '');
        setEditForm({
            username: account.username || '',
            email: account.email || '',
            role: initialFormRole,
            branchId: account.branch_id || 1,
            profilePicture: null,
        });
        setEditPreviewUrl(account.profile_picture || null);
        setEditAvatarError(false);
        setEditChangePassword(false);
        setEditNewPassword('');
        setEditShowNewPassword(false);
        setIsEditModalOpen(true);
        setOpenActionMenuId(null);
    };

    const executeSaveEdit = async (payload: any) => {
        setIsSubmittingEdit(true);
        try {
            const res = await api.put(`/api/system-admin/users/${targetAccount.user_id}`, payload);

            // If password change requested as well
            if (editChangePassword && editNewPassword) {
                await api.post(`/api/system-admin/users/${targetAccount.user_id}/reset-password`, {
                    newPassword: editNewPassword,
                });
            }

            addToast({
                type: 'success',
                title: 'Account Updated',
                message: editChangePassword 
                    ? 'Account profile and credentials updated successfully.'
                    : 'Account profile details updated successfully.',
            });

            const updated = res.data?.user || res.data?.data;
            if (updated) {
                setAccounts((prev) =>
                    prev.map((acc) =>
                        acc.user_id === targetAccount.user_id
                            ? { ...acc, ...updated }
                            : acc
                    )
                );
            } else {
                setAccounts((prev) =>
                    prev.map((acc) =>
                        acc.user_id === targetAccount.user_id
                            ? {
                                  ...acc,
                                  username: payload.username !== undefined ? payload.username : acc.username,
                                  email: payload.email !== undefined ? payload.email : acc.email,
                                  role: payload.role !== undefined ? payload.role : acc.role,
                                  profile_picture: payload.profilePicture !== undefined ? payload.profilePicture : acc.profile_picture,
                              }
                            : acc
                    )
                );
            }

            setIsEditModalOpen(false);
            setIsRoleChangeConfirmOpen(false);
            setPendingEditPayload(null);
            setEditChangePassword(false);
            setEditNewPassword('');
            setTargetAccount(null);
            fetchAccounts();
            fetchSystemStats();
        } catch (err: any) {
            console.error('[AccountManagement] Update failed:', err);
            addToast({
                type: 'error',
                title: 'Update Failed',
                message: err.response?.data?.error || err.message || 'Failed to update account.',
            });
        } finally {
            setIsSubmittingEdit(false);
        }
    };

    const handleConfirmEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetAccount) return;

        if (!isEditFormDirty) {
            addToast({
                type: 'info',
                title: 'No Changes',
                message: 'No changes to save.',
            });
            return;
        }

        if (editChangePassword && editNewPassword.length < 8) {
            addToast({
                type: 'error',
                title: 'Invalid Password',
                message: 'New password must be at least 8 characters long.',
            });
            return;
        }

        let avatarUrl = undefined;
        if (editForm.profilePicture) {
            try {
                avatarUrl = await uploadAvatar(editForm.profilePicture, targetAccount.user_id);
            } catch (err: any) {
                const message =
                    err.response?.data?.error ||
                    err.response?.data?.message ||
                    err.message ||
                    'Failed to upload profile picture.';
                addToast({
                    type: 'error',
                    title: 'Avatar Upload Failed',
                    message,
                });
                return;
            }
        }

        const payload: any = {};
        const origUsername = targetAccount.username || '';
        if (editForm.username.trim() !== origUsername) {
            payload.username = editForm.username.trim() || undefined;
        }
        const origEmail = (targetAccount.email || '').toLowerCase().trim();
        if (editForm.email.toLowerCase().trim() !== origEmail) {
            payload.email = editForm.email.trim();
        }
        const origRole = targetAccount.role || '';
        if (editForm.role && editForm.role !== origRole) {
            payload.role = editForm.role;
        }
        if (editForm.branchId && editForm.branchId !== targetAccount.branch_id) {
            payload.branchId = editForm.branchId;
        }
        if (avatarUrl) {
            payload.profilePicture = avatarUrl;
        }

        // Role change safety interception: ONLY if role actually changed
        if (payload.role && payload.role !== origRole) {
            setPendingEditPayload(payload);
            setRoleConfirmText('');
            setIsRoleChangeConfirmOpen(true);
            return;
        }

        await executeSaveEdit(payload);
    };

    // Role badge renderer (DemoShop Charcoal & Gold Standard)
    const renderRoleBadge = (role: string) => {
        const r = (role || '').toLowerCase();
        if (r.includes('system admin') || r.includes('systemadmin')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gold/15 text-gold border border-gold/30 shadow-[0_0_8px_rgba(212,175,55,0.15)]">
                    <KeyRound className="w-2.5 h-2.5 text-gold" /> Superadmin
                </span>
            );
        }
        if (r.includes('owner') || r.includes('shop admin') || r.includes('shopadmin')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gold/10 text-gold-dim border border-gold/20">
                    <Store className="w-2.5 h-2.5" /> Shop Admin
                </span>
            );
        }
        if (r.includes('barber')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-ivory border border-white/10">
                    <Scissors className="w-2.5 h-2.5 text-ivory-dim" /> Barber
                </span>
            );
        }
        if (r.includes('cashier')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <Coins className="w-2.5 h-2.5" /> Cashier
                </span>
            );
        }
        if (r.includes('inventory')) {
            return (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Boxes className="w-2.5 h-2.5" /> Inv. Manager
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-ivory-dim border border-white/10">
                <Users className="w-2.5 h-2.5" /> Customer
            </span>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Top Header & Provisioning Action */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 bg-charcoal-light border border-white/5 p-5 rounded-sm card-gold-accent">
                <div>
                    <h3 className="text-xl font-serif font-bold text-ivory flex items-center gap-2">
                        <Users className="w-5 h-5 text-gold" /> Account Lifecycle Management
                    </h3>
                    <p className="text-ivory-dim text-xs mt-0.5">
                        Manage customers, operational staff, and administrators with strict RBAC enforcement.
                    </p>
                </div>

                <div className="flex items-center gap-2.5">
                    <Button
                        onClick={handleOpenProvisionModal}
                        className="flex items-center gap-2 bg-gold hover:bg-gold-light text-charcoal font-bold text-xs px-4 py-2 shadow-md shadow-gold/20 cursor-pointer"
                    >
                        <UserPlus className="w-4 h-4" />
                        Provision New Account
                    </Button>
                </div>
            </div>

            {/* Navigation Tabs: [ All ] [ Customers ] [ Staff ] [ Administrators ] */}
            <div className="flex border-b border-white/10 overflow-x-auto gap-1">
                {[
                    { id: 'all', label: 'All', icon: Users },
                    { id: 'customers', label: 'Customers', icon: UserCheck },
                    { id: 'staff', label: 'Staff', icon: Scissors },
                    { id: 'admins', label: 'Administrators', icon: Shield },
                ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeCategory === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleCategoryChange(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 cursor-pointer whitespace-nowrap ${
                                isActive
                                    ? 'text-gold border-gold bg-gold/10 shadow-[0_2px_8px_rgba(212,175,55,0.12)]'
                                    : 'text-ivory-dim hover:text-ivory border-transparent hover:bg-white/[0.03]'
                            }`}
                        >
                            <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-gold' : 'text-ivory-dim'}`} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Controls Bar: Search, Role Scope, Account Status, Verification, Sort */}
            <div className="bg-charcoal-light border border-white/5 p-3.5 rounded-sm card-gold-accent flex flex-wrap items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative flex-1 min-w-[220px]">
                    <Search className="w-4 h-4 text-ivory-dim absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            onSearchChange?.(e.target.value);
                        }}
                        placeholder="Search by username, email, or user ID..."
                        className="w-full bg-charcoal border border-white/10 rounded-sm py-1.5 pl-9 pr-3 text-xs text-ivory placeholder-ivory-dim/60 focus:border-gold focus:ring-1 focus:ring-gold/30 focus:outline-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                onSearchChange?.('');
                            }}
                            aria-label="Clear search input"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory text-xs cursor-pointer p-0.5"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Role Filter (Scoped to active category) */}
                    <div className="relative">
                        <select
                            value={selectedRole}
                            onChange={(e) => { 
                                setSelectedRole(e.target.value); 
                                setPage(1); 
                                onRoleChange?.(e.target.value);
                            }}
                            aria-label="Filter accounts by specific role"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="all">All Roles in View</option>
                            {activeCategory === 'all' && (
                                <>
                                    <option value="Customer">Customer</option>
                                    <option value="Barber">Barber</option>
                                    <option value="Cashier">Cashier</option>
                                    <option value="Inventory Manager">Inventory Manager</option>
                                    <option value="Owner">Shop Admin</option>
                                    <option value="System Admin">Superadmin</option>
                                </>
                            )}
                            {activeCategory === 'customers' && (
                                <option value="Customer">Customer</option>
                            )}
                            {activeCategory === 'staff' && (
                                <>
                                    <option value="Barber">Barber</option>
                                    <option value="Cashier">Cashier</option>
                                    <option value="Inventory Manager">Inventory Manager</option>
                                </>
                            )}
                            {activeCategory === 'admins' && (
                                <>
                                    <option value="Owner">Shop Admin</option>
                                    <option value="System Admin">Superadmin</option>
                                </>
                            )}
                        </select>
                    </div>

                    {/* Account Status Filter (Active / Suspended) */}
                    <div className="relative">
                        <select
                            value={accountStatusFilter}
                            onChange={(e) => { 
                                setAccountStatusFilter(e.target.value); 
                                setPage(1); 
                                onStatusChange?.(e.target.value);
                            }}
                            aria-label="Filter accounts by lifecycle status"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="all">Lifecycle: All</option>
                            <option value="active">Active Only</option>
                            <option value="suspended">Suspended Only</option>
                        </select>
                    </div>

                    {/* Verification Status Filter */}
                    <div className="relative">
                        <select
                            value={verificationFilter}
                            onChange={(e) => { 
                                setVerificationFilter(e.target.value); 
                                setPage(1); 
                                onVerificationChange?.(e.target.value);
                            }}
                            aria-label="Filter accounts by email verification status"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="all">Verification: All</option>
                            <option value="verified">Verified</option>
                            <option value="unverified">Unverified</option>
                            <option value="attention_required">Requiring Attention</option>
                        </select>
                    </div>

                    {/* Sort Order */}
                    <div className="relative">
                        <select
                            value={sortBy}
                            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
                            aria-label="Sort accounts"
                            className="bg-charcoal border border-white/10 text-ivory text-xs rounded-sm py-1.5 px-2.5 focus:border-gold focus:ring-1 focus:ring-gold/30 outline-none cursor-pointer"
                        >
                            <option value="created_at_desc">Newest First</option>
                            <option value="created_at_asc">Oldest First</option>
                            <option value="username_asc">Username (A-Z)</option>
                            <option value="username_desc">Username (Z-A)</option>
                            <option value="email_asc">Email (A-Z)</option>
                            <option value="email_desc">Email (Z-A)</option>
                        </select>
                    </div>

                    {/* Reset Filters Action Button */}
                    {hasActiveFilters && (
                        <button
                            type="button"
                            onClick={handleResetFilters}
                            title="Reset all search queries and filter constraints"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm bg-white/5 hover:bg-gold/15 border border-white/10 hover:border-gold/30 text-ivory hover:text-gold text-xs font-medium transition-all cursor-pointer shadow-sm"
                        >
                            <RotateCcw className="w-3 h-3 text-gold" />
                            Reset Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Attention Required Banner */}
            {verificationFilter === 'attention_required' && (
                <div className="bg-amber-500/15 border border-amber-500/40 rounded-sm p-3.5 text-xs text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md shadow-amber-950/30 animate-fade-in">
                    <div className="flex items-center gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                            <span className="font-bold text-ivory">Filter Active: Accounts Requiring Attention</span>
                            <p className="text-[11px] text-amber-200/80 mt-0.5">
                                Showing accounts with unverified email registrations or active administrative suspensions.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            setVerificationFilter('all');
                            setPage(1);
                            onVerificationChange?.('all');
                        }}
                        className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded text-amber-200 font-semibold text-xs transition-colors shrink-0 cursor-pointer"
                    >
                        Clear Attention Filter
                    </button>
                </div>
            )}

            {/* Accounts Table / Cards */}
            <div className="bg-charcoal-light border border-white/5 rounded-sm overflow-hidden card-gold-accent">
                {/* Desktop View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-white/[0.03] text-ivory-dim uppercase tracking-widest text-[10px] border-b border-white/5">
                            <tr>
                                <th className="px-5 py-3 font-semibold">Account Identity</th>
                                <th className="px-4 py-3 font-semibold">System Role</th>
                                <th className="px-4 py-3 font-semibold">Account Source</th>
                                <th className="px-4 py-3 font-semibold">Status & Health</th>
                                <th className="px-4 py-3 font-semibold">Created Date</th>
                                <th className="px-5 py-3 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                [1, 2, 3, 4, 5].map((i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td className="px-5 py-3.5"><div className="h-4 w-40 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-20 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-24 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-24 bg-white/10 rounded" /></td>
                                        <td className="px-4 py-3.5"><div className="h-4 w-20 bg-white/10 rounded" /></td>
                                        <td className="px-5 py-3.5 text-right"><div className="h-4 w-8 bg-white/10 rounded ml-auto" /></td>
                                    </tr>
                                ))
                            ) : accounts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-ivory-dim">
                                        <div className="max-w-xs mx-auto space-y-2">
                                            <p className="text-sm font-semibold text-ivory">No accounts found</p>
                                            <p className="text-xs text-ivory-dim/70">
                                                Try modifying your search query or relaxing your filter constraints.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                accounts.map((account) => {
                                    const isSuspended = Boolean(account.is_suspended || account.deleted_at);
                                    const isSelf = isSelfAccount(account);
                                    const isLastAdmin = isSoleSystemAdmin(account);

                                    return (
                                        <tr
                                            key={account.user_id}
                                            className={`hover:bg-gold/[0.04] transition-colors group ${
                                                isSuspended ? 'bg-red-500/[0.04]' : ''
                                            }`}
                                        >
                                            {/* Identity: Avatar + Username + Email */}
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    {(() => {
                                                        const avatarSrc = getAvatarUrl(account.profile_picture);
                                                        return (
                                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 overflow-hidden ${
                                                                isSuspended
                                                                    ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                                                    : 'bg-gold/10 border-gold/30 text-gold'
                                                            }`}>
                                                                {avatarSrc ? (
                                                                    <>
                                                                        <img
                                                                            src={avatarSrc}
                                                                            alt={account.username || account.email}
                                                                            className="w-full h-full object-cover"
                                                                            onError={(e) => {
                                                                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                                const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                                                                if (fallback) fallback.style.display = 'flex';
                                                                            }}
                                                                        />
                                                                        <span style={{ display: 'none' }} className="w-full h-full items-center justify-center">
                                                                            {(account.username || account.email || '?').charAt(0).toUpperCase()}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    (account.username || account.email || '?').charAt(0).toUpperCase()
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                    <div className="min-w-0">
                                                        <div className="font-semibold text-ivory truncate flex items-center gap-1.5">
                                                            <span className="group-hover:text-gold transition-colors">{account.username || <span className="text-ivory-dim/60 italic">No Username</span>}</span>
                                                            {isSelf && (
                                                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-gold/15 text-gold border border-gold/30 font-bold">
                                                                    YOU
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] font-mono text-ivory-dim truncate">
                                                            {account.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Role */}
                                            <td className="px-4 py-3.5">
                                                {renderRoleBadge(account.role)}
                                            </td>

                                            {/* Creation Source */}
                                            <td className="px-4 py-3.5">
                                                {renderAccountSourceBadge(account)}
                                            </td>

                                            {/* Status & Health */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-col gap-1 items-start">
                                                    {isSuspended ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                                                            <XCircle className="w-2.5 h-2.5" /> Suspended
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                            <CheckCircle2 className="w-2.5 h-2.5" /> Active
                                                        </span>
                                                    )}
                                                    {!account.is_verified ? (
                                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Email address pending verification">
                                                            <AlertTriangle className="w-2.5 h-2.5" /> Attention Required
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gold/10 text-gold border border-gold/20 shadow-[0_0_6px_rgba(212,175,55,0.1)]">
                                                            <CheckCircle2 className="w-2.5 h-2.5 text-gold" /> Verified
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Created */}
                                            <td className="px-4 py-3.5 text-ivory-dim font-mono text-[11px]">
                                                {new Date(account.created_at).toLocaleDateString()}
                                            </td>

                                            {/* Actions */}
                                            <td className="px-5 py-3.5 text-right relative">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Quick View Button */}
                                                    <button
                                                        onClick={() => { setTargetAccount(account); setIsViewModalOpen(true); }}
                                                        title="View Details"
                                                        className="p-1.5 rounded bg-white/5 hover:bg-gold/15 text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* Quick Edit Button */}
                                                    <button
                                                        onClick={() => handleOpenEditModal(account)}
                                                        title="Edit Profile"
                                                        className="p-1.5 rounded bg-white/5 hover:bg-gold/15 text-ivory-dim hover:text-gold transition-colors cursor-pointer"
                                                    >
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* Context-Aware State Action (Suspend vs Restore) */}
                                                    {isSuspended ? (
                                                        <button
                                                            onClick={() => { setTargetAccount(account); setIsRestoreModalOpen(true); }}
                                                            title="Reactivate Account"
                                                            className="p-1.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors cursor-pointer"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            disabled={isSelf || isLastAdmin}
                                                            onClick={() => { setTargetAccount(account); setIsSuspendModalOpen(true); }}
                                                            title={
                                                                isSelf
                                                                    ? "Cannot suspend your own logged-in account"
                                                                    : isLastAdmin
                                                                    ? "Cannot suspend the final remaining Superadmin"
                                                                    : "Suspend Account"
                                                            }
                                                            className={`p-1.5 rounded transition-colors ${
                                                                isSelf || isLastAdmin
                                                                    ? 'opacity-30 cursor-not-allowed text-ivory-dim bg-white/5'
                                                                    : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 cursor-pointer'
                                                            }`}
                                                        >
                                                            <UserX className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}

                                                    {/* Credential Reset (Staff & Admins) */}
                                                    <button
                                                        onClick={() => handleOpenResetModal(account)}
                                                        title="Reset Credentials"
                                                        className="p-1.5 rounded bg-white/5 hover:bg-amber-500/15 text-ivory-dim hover:text-amber-400 transition-colors cursor-pointer"
                                                    >
                                                        <Lock className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile View (Cards) */}
                <div className="md:hidden divide-y divide-white/5">
                    {loading ? (
                        [1, 2, 3, 4, 5].map(i => (
                            <div key={i} className="p-4 space-y-3 animate-pulse">
                                <div className="h-4 w-1/2 bg-white/10 rounded" />
                                <div className="h-3 w-3/4 bg-white/5 rounded" />
                            </div>
                        ))
                    ) : accounts.length === 0 ? (
                        <div className="p-6 text-center text-ivory-dim text-xs">
                            No accounts found matching your filter criteria.
                        </div>
                    ) : (
                        accounts.map(account => {
                            const isSuspended = Boolean(account.is_suspended || account.deleted_at);
                            const isSelf = isSelfAccount(account);
                            const isLastAdmin = isSoleSystemAdmin(account);

                            return (
                                <div key={account.user_id} className="p-4 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2.5">
                                            {(() => {
                                                const avatarSrc = getAvatarUrl(account.profile_picture);
                                                return (
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs border shrink-0 overflow-hidden ${isSuspended ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-gold/10 border-gold/30 text-gold'}`}>
                                                        {avatarSrc ? (
                                                            <>
                                                                <img
                                                                    src={avatarSrc}
                                                                    alt={account.username || account.email}
                                                                    className="w-full h-full object-cover"
                                                                    onError={(e) => {
                                                                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                        const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                                                        if (fallback) fallback.style.display = 'flex';
                                                                    }}
                                                                />
                                                                <span style={{ display: 'none' }} className="w-full h-full items-center justify-center">
                                                                    {(account.username || account.email || '?').charAt(0).toUpperCase()}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            (account.username || account.email || '?').charAt(0).toUpperCase()
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                            <div>
                                                <div className="font-semibold text-ivory text-xs flex items-center gap-1.5">
                                                    <span>{account.username || 'No Username'}</span>
                                                    {isSelf && <span className="text-[9px] px-1 rounded bg-gold/20 text-gold font-bold">YOU</span>}
                                                </div>
                                                <div className="text-[11px] font-mono text-ivory-dim">{account.email}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {isSuspended ? (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/30">Suspended</span>
                                            ) : (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">Active</span>
                                            )}
                                            {!account.is_verified ? (
                                                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                                    <AlertTriangle className="w-2.5 h-2.5" /> Attention
                                                </span>
                                            ) : (
                                                <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-gold/10 text-gold border border-gold/20 flex items-center gap-1 shadow-[0_0_6px_rgba(212,175,55,0.1)]">
                                                    <CheckCircle2 className="w-2.5 h-2.5 text-gold" /> Verified
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            {renderRoleBadge(account.role)}
                                            {renderAccountSourceBadge(account)}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => { setTargetAccount(account); setIsViewModalOpen(true); }}
                                                className="px-2 py-1 bg-white/5 rounded text-[11px] text-ivory hover:text-gold cursor-pointer"
                                            >
                                                Details
                                            </button>
                                            <button
                                                onClick={() => handleOpenEditModal(account)}
                                                className="px-2 py-1 bg-white/5 rounded text-[11px] text-ivory hover:text-gold cursor-pointer"
                                            >
                                                Edit
                                            </button>
                                            {isSuspended ? (
                                                <button
                                                    onClick={() => { setTargetAccount(account); setIsRestoreModalOpen(true); }}
                                                    className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-[11px] cursor-pointer"
                                                >
                                                    Restore
                                                </button>
                                            ) : (
                                                <button
                                                    disabled={isSelf || isLastAdmin}
                                                    onClick={() => { setTargetAccount(account); setIsSuspendModalOpen(true); }}
                                                    className="px-2 py-1 bg-red-500/10 text-red-400 disabled:opacity-30 rounded text-[11px] cursor-pointer"
                                                >
                                                    Suspend
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Stepping Pagination */}
            <SteppingPagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
            />

            {/* --- MODAL 1: VIEW ACCOUNT PROFILE DETAILS --- */}
            {isViewModalOpen && targetAccount && (
                <Modal
                    isOpen={isViewModalOpen}
                    onClose={() => { setIsViewModalOpen(false); setTargetAccount(null); }}
                    title="Account Profile Details"
                >
                    <div className="space-y-4 text-xs">
                        <div className="flex items-center gap-4 p-4 rounded-sm bg-charcoal border border-white/5">
                            <div className="w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg border border-gold/30 bg-gold/10 text-gold overflow-hidden shrink-0">
                                {(() => {
                                    const viewAvatar = getAvatarUrl(targetAccount.profile_picture);
                                    return viewAvatar ? (
                                        <>
                                            <img
                                                src={viewAvatar}
                                                alt={targetAccount.username || targetAccount.email}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                    const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                                                    if (fallback) fallback.style.display = 'flex';
                                                }}
                                            />
                                            <span style={{ display: 'none' }} className="w-full h-full items-center justify-center">
                                                {(targetAccount.username || targetAccount.email || '?').charAt(0).toUpperCase()}
                                            </span>
                                        </>
                                    ) : (
                                        (targetAccount.username || targetAccount.email || '?').charAt(0).toUpperCase()
                                    );
                                })()}
                            </div>
                            <div className="min-w-0">
                                <h4 className="text-base font-bold text-ivory truncate">{targetAccount.username || 'Not Provided'}</h4>
                                <p className="font-mono text-gold text-xs truncate">{targetAccount.email}</p>
                                <div className="mt-1 flex items-center gap-2">
                                    {renderRoleBadge(targetAccount.role)}
                                    {targetAccount.is_suspended || targetAccount.deleted_at ? (
                                        <span className="text-[10px] font-bold text-red-400">Suspended</span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-emerald-400">Active</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Attention Notice if suspended or unverified */}
                        {(Boolean(targetAccount.is_suspended || targetAccount.deleted_at) || !targetAccount.is_verified) && (
                            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                                <div>
                                    <span className="font-bold">Attention Required:</span>
                                    <ul className="list-disc list-inside mt-0.5 text-[11px] space-y-0.5 text-amber-200/90">
                                        {Boolean(targetAccount.is_suspended || targetAccount.deleted_at) && (
                                            <li>Account is deactivated / suspended.</li>
                                        )}
                                        {!targetAccount.is_verified && (
                                            <li>Email address has not yet been verified.</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 bg-white/[0.02] p-3.5 rounded-sm border border-white/5">
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider mb-1">User UUID</span>
                                <span className="font-mono text-gold font-bold text-[11px] break-all">{targetAccount.user_id}</span>
                            </div>
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider mb-1">Verification Status</span>
                                {targetAccount.is_verified ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gold/15 text-gold border border-gold/30 shadow-[0_0_8px_rgba(212,175,55,0.15)]">
                                        <CheckCircle2 className="w-2.5 h-2.5 text-gold" /> Verified Account
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                        <AlertTriangle className="w-2.5 h-2.5 text-amber-300" /> Pending Verification
                                    </span>
                                )}
                            </div>
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider mb-1">Created Timestamp</span>
                                <span className="font-mono text-ivory text-xs">{new Date(targetAccount.created_at).toLocaleString()}</span>
                            </div>
                            <div>
                                <span className="text-ivory-dim block text-[10px] uppercase tracking-wider mb-1">Account Source / Creator</span>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                    {renderAccountSourceBadge(targetAccount)}
                                </div>
                                {getAccountSourceInfo(targetAccount).detail && (
                                    <span className="text-[10px] text-ivory-dim/70 block mt-0.5">
                                        {getAccountSourceInfo(targetAccount).detail}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    if (onViewAuditLogs) onViewAuditLogs(targetAccount.email);
                                    setIsViewModalOpen(false);
                                }}
                                className="text-xs flex items-center gap-1.5 border-gold/30 hover:border-gold hover:bg-gold/10 text-gold transition-colors"
                            >
                                <Shield className="w-3.5 h-3.5 text-gold" />
                                Inspect Account Audit Trail
                            </Button>

                            <Button
                                variant="primary"
                                onClick={() => setIsViewModalOpen(false)}
                                className="text-xs bg-gold hover:bg-gold-light text-charcoal font-bold shadow-md shadow-gold/20"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* --- MODAL 2: EDIT ACCOUNT PROFILE --- */}
            {isEditModalOpen && targetAccount && (
                <Modal
                    isOpen={isEditModalOpen}
                    onClose={() => { setIsEditModalOpen(false); setTargetAccount(null); }}
                    title={`Edit Account — #${targetAccount.user_id?.substring(0, 8)}`}
                >
                    <form onSubmit={handleConfirmEdit} className="space-y-4 text-xs">
                        {/* 1. Account Profile Header Card (Discord / DemoShop Charcoal & Gold) */}
                        <div className="p-4 rounded bg-charcoal border border-white/10 relative overflow-hidden shadow-inner">
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold/30 via-gold to-gold/30" />
                            <div className="flex items-start gap-4">
                                {/* Avatar with Fallback and Upload Overlay */}
                                <div className="relative group shrink-0">
                                    <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-xl border-2 border-gold/40 bg-charcoal-light text-gold overflow-hidden shadow-md">
                                        {editPreviewUrl && !editAvatarError ? (
                                            <img
                                                src={getAvatarUrl(editPreviewUrl) || editPreviewUrl}
                                                alt={targetAccount.username || targetAccount.email}
                                                className="w-full h-full object-cover"
                                                onError={() => setEditAvatarError(true)}
                                            />
                                        ) : (
                                            <span>{(editForm.username || editForm.email || targetAccount.username || targetAccount.email || '?').charAt(0).toUpperCase()}</span>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => editFileInputRef.current?.click()}
                                        className="absolute inset-0 rounded-full bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[9px] font-semibold transition-opacity cursor-pointer"
                                        title="Upload new avatar"
                                    >
                                        <Camera className="w-4 h-4 mb-0.5 text-gold" />
                                        <span>Change</span>
                                    </button>
                                </div>

                                <input
                                    type="file"
                                    ref={editFileInputRef}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const err = validateAvatarFile(file);
                                            if (err) {
                                                addToast({ type: 'error', title: 'Invalid Image', message: err });
                                                return;
                                            }
                                            setEditForm(prev => ({ ...prev, profilePicture: file }));
                                            setEditPreviewUrl(URL.createObjectURL(file));
                                            setEditAvatarError(false);
                                        }
                                    }}
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    className="hidden"
                                />

                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h4 className="text-sm font-bold text-ivory truncate">
                                            {targetAccount.username || 'No Username Set'}
                                        </h4>
                                        {renderRoleBadge(targetAccount.role)}
                                        {isSelfAccount(targetAccount) && (
                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30 font-bold">
                                                YOU
                                            </span>
                                        )}
                                    </div>
                                    <p className="font-mono text-gold text-xs truncate mt-0.5">
                                        {targetAccount.email}
                                    </p>

                                    <div className="mt-2 flex items-center gap-2">
                                        {(!editPreviewUrl || editAvatarError) ? (
                                            <span className="text-[10px] text-ivory-dim/60 flex items-center gap-1">
                                                <UserX className="w-3 h-3 text-ivory-dim/40" /> No profile photo configured
                                            </span>
                                        ) : editForm.profilePicture ? (
                                            <span className="text-[10px] text-gold flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-gold" /> New photo staged
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-emerald-400/80 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Active avatar
                                            </span>
                                        )}

                                        <button
                                            type="button"
                                            onClick={() => editFileInputRef.current?.click()}
                                            className="text-[10px] text-gold hover:underline flex items-center gap-0.5 cursor-pointer ml-auto font-medium"
                                        >
                                            <Upload className="w-2.5 h-2.5" /> Upload Photo
                                        </button>
                                        {editForm.profilePicture && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditForm(prev => ({ ...prev, profilePicture: null }));
                                                    setEditPreviewUrl(targetAccount.profile_picture || null);
                                                    setEditAvatarError(false);
                                                    if (editFileInputRef.current) editFileInputRef.current.value = '';
                                                }}
                                                className="text-[10px] text-red-400 hover:underline flex items-center gap-0.5 cursor-pointer font-medium"
                                            >
                                                <X className="w-2.5 h-2.5" /> Revert
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Self-Edit Informational Callout */}
                        {isSelfAccount(targetAccount) && (
                            <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                                <span>You are editing your own active account. Your system role cannot be modified.</span>
                            </div>
                        )}

                        {/* 2. Profile Information */}
                        <div className="space-y-3 p-3.5 rounded bg-white/[0.02] border border-white/5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
                                <UserCog className="w-3.5 h-3.5" /> Profile Information
                            </div>

                            <div>
                                <label className="block text-ivory-dim mb-1 font-medium text-[11px]">Username / Display Name</label>
                                <input
                                    type="text"
                                    value={editForm.username}
                                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                                    placeholder="e.g. John Doe"
                                    className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-ivory-dim mb-1 font-medium text-[11px]">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    value={editForm.email}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                    className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none"
                                />
                            </div>
                        </div>

                        {/* 3. Access & Role */}
                        <div className="space-y-2 p-3.5 rounded bg-white/[0.02] border border-white/5">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-gold flex items-center gap-1.5">
                                <Shield className="w-3.5 h-3.5" /> Access & Governance
                            </div>
                            <div>
                                <label className="block text-ivory-dim mb-1 font-medium text-[11px]">System Role</label>
                                <select
                                    disabled={isSelfAccount(targetAccount)}
                                    value={editForm.role}
                                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                    className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    <option value="Customer">Customer</option>
                                    <option value="Barber">Barber</option>
                                    <option value="Cashier">Cashier</option>
                                    <option value="Inventory Manager">Inventory Manager</option>
                                    <option value="Owner">Shop Admin</option>
                                    <option value="System Admin">Superadmin</option>
                                </select>
                                {((editForm.role || '').toLowerCase() === 'shop admin' ? 'Owner' : editForm.role) !== ((targetAccount.role || '').toLowerCase() === 'shop admin' ? 'Owner' : targetAccount.role) && !isSelfAccount(targetAccount) && (
                                    <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 shrink-0" /> Role transition will require secondary confirmation upon saving.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* 4. Security & Credentials */}
                        <div className="p-3.5 rounded bg-white/[0.02] border border-white/5 space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="text-gold font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                                    <Lock className="w-3.5 h-3.5" /> Security & Credentials
                                </label>
                                {!(targetAccount.google_id || targetAccount.account_source === 'google') && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nextVal = !editChangePassword;
                                            setEditChangePassword(nextVal);
                                            if (nextVal && !editNewPassword) {
                                                setEditNewPassword(generateSecurePassword(16));
                                            }
                                        }}
                                        className="text-[11px] text-gold hover:underline cursor-pointer font-semibold"
                                    >
                                        {editChangePassword ? 'Cancel Password Change' : 'Change / Reset Password'}
                                    </button>
                                )}
                            </div>

                            {(targetAccount.google_id || targetAccount.account_source === 'google') ? (
                                <div className="p-2.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px] flex items-center gap-2">
                                    <Globe className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                                    <span>This account authenticates via Google OAuth SSO. Passwords cannot be set directly.</span>
                                </div>
                            ) : editChangePassword ? (
                                <div className="p-3 rounded bg-charcoal border border-white/10 space-y-2.5 animate-fade-in">
                                    <div className="flex justify-between items-center text-[11px]">
                                        <span className="text-ivory-dim">New Temporary Password:</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setEditNewPassword(generateSecurePassword(16))}
                                                className="text-gold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                                            >
                                                <RotateCcw className="w-3 h-3" /> Generate Strong
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => copyToClipboard(editNewPassword, 'Password')}
                                                className="text-gold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                                            >
                                                <Copy className="w-3 h-3" /> Copy
                                            </button>
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <input
                                            type={editShowNewPassword ? 'text' : 'password'}
                                            value={editNewPassword}
                                            onChange={(e) => setEditNewPassword(e.target.value)}
                                            placeholder="Minimum 8 characters..."
                                            minLength={8}
                                            className="w-full bg-charcoal-light border border-white/10 rounded p-2 pr-10 text-ivory text-xs font-mono focus:border-gold outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditShowNewPassword(!editShowNewPassword)}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim hover:text-ivory cursor-pointer"
                                            title={editShowNewPassword ? 'Hide password' : 'Show password'}
                                        >
                                            {editShowNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-ivory-dim">
                                        Updating credentials invalidates the user's current session. Make sure to copy the password.
                                    </p>
                                </div>
                            ) : (
                                <p className="text-[11px] text-ivory-dim/70 italic">
                                    Password unchanged. Click "Change / Reset Password" to issue new credentials.
                                </p>
                            )}
                        </div>

                        {/* 5. Summary of Unsaved Changes */}
                        {isEditFormDirty && (
                            <div className="p-2.5 rounded bg-gold/10 border border-gold/20 flex items-center justify-between text-xs text-gold animate-fade-in">
                                <span className="flex items-center gap-1.5 font-medium">
                                    <Info className="w-3.5 h-3.5 shrink-0" />
                                    <span>Modified: <strong>{editChangedFields.join(', ')}</strong></span>
                                </span>
                                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-gold/20 border border-gold/30">
                                    Unsaved
                                </span>
                            </div>
                        )}

                        {/* 6. Modal Actions */}
                        <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsEditModalOpen(false)}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={isSubmittingEdit || !isEditFormDirty}
                                className="text-xs bg-gold hover:bg-gold-light text-charcoal font-bold disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-gold/20"
                            >
                                {isSubmittingEdit ? 'Saving Changes...' : isEditFormDirty ? 'Save Changes' : 'No Changes to Save'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* --- MODAL 2.5: HIGH-IMPACT ROLE CHANGE CONFIRMATION --- */}
            {isRoleChangeConfirmOpen && targetAccount && pendingEditPayload && (
                <Modal
                    isOpen={isRoleChangeConfirmOpen}
                    onClose={() => {
                        setIsRoleChangeConfirmOpen(false);
                        setPendingEditPayload(null);
                    }}
                    title="High-Impact Role Change Confirmation"
                >
                    <div className="space-y-4 text-xs">
                        {/* Target Summary */}
                        <div className="p-3 bg-charcoal border border-white/10 rounded-sm">
                            <div className="text-[10px] uppercase tracking-wider text-ivory-dim">Target Account</div>
                            <div className="text-sm font-bold text-ivory">{targetAccount.username || targetAccount.email}</div>
                            <div className="text-[11px] font-mono text-gold mt-0.5">{targetAccount.email}</div>
                        </div>

                        {/* Transition Visual */}
                        <div className="flex items-center justify-center gap-3 p-3 bg-white/[0.02] border border-white/10 rounded-sm">
                            <div className="text-center">
                                <span className="text-[10px] text-ivory-dim uppercase tracking-wider block mb-1">Current Role</span>
                                {renderRoleBadge(targetAccount.role)}
                            </div>
                            <ArrowRight className="w-5 h-5 text-gold mx-2 shrink-0 animate-pulse" />
                            <div className="text-center">
                                <span className="text-[10px] text-gold uppercase tracking-wider block mb-1">New Target Role</span>
                                {renderRoleBadge(pendingEditPayload.role)}
                            </div>
                        </div>

                        {/* Operational Impact Warning */}
                        <div className="p-3.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-1.5">
                            <div className="flex items-center gap-2 font-bold text-amber-400">
                                <AlertTriangle className="w-4 h-4 shrink-0" />
                                <span>Operational Impact & Risk Assessment</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                                {getOperationalWarning(targetAccount.role, pendingEditPayload.role)}
                            </p>
                        </div>

                        {/* RBAC Capabilities Matrix */}
                        {(() => {
                            const curPerms = ROLE_PERMISSIONS[targetAccount.role]?.perms || [];
                            const newPerms = ROLE_PERMISSIONS[pendingEditPayload.role]?.perms || [];
                            const gained = newPerms.filter(p => !curPerms.includes(p));
                            const lost = curPerms.filter(p => !newPerms.includes(p));

                            return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="p-3 rounded bg-emerald-500/[0.06] border border-emerald-500/20">
                                        <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5 mb-2">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Capabilities Gained ({gained.length})
                                        </span>
                                        {gained.length === 0 ? (
                                            <p className="text-[10px] text-ivory-dim/60 italic">No additional capabilities gained.</p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {gained.map((g, idx) => (
                                                    <li key={idx} className="text-[10px] text-emerald-200/90 flex items-start gap-1.5">
                                                        <span className="text-emerald-400 mt-0.5">•</span>
                                                        <span>{g}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    <div className="p-3 rounded bg-red-500/[0.06] border border-red-500/20">
                                        <span className="text-[11px] font-bold text-red-400 flex items-center gap-1.5 mb-2">
                                            <XCircle className="w-3.5 h-3.5" /> Capabilities Revoked ({lost.length})
                                        </span>
                                        {lost.length === 0 ? (
                                            <p className="text-[10px] text-ivory-dim/60 italic">No capabilities revoked.</p>
                                        ) : (
                                            <ul className="space-y-1">
                                                {lost.map((l, idx) => (
                                                    <li key={idx} className="text-[10px] text-red-200/90 flex items-start gap-1.5">
                                                        <span className="text-red-400 mt-0.5">•</span>
                                                        <span>{l}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Confirmation Prompt */}
                        <div className="pt-2 space-y-2 border-t border-white/5">
                            <label className="block text-ivory text-xs font-semibold">
                                Type <span className="text-gold font-mono uppercase font-bold tracking-wider">{pendingEditPayload.role.toUpperCase()}</span> to confirm this role change:
                            </label>
                            <input
                                type="text"
                                value={roleConfirmText}
                                onChange={(e) => setRoleConfirmText(e.target.value)}
                                placeholder={`Type ${pendingEditPayload.role.toUpperCase()}`}
                                className="w-full bg-charcoal border border-white/15 rounded p-2 text-ivory text-xs font-mono focus:border-gold outline-none"
                                autoFocus
                            />
                            <p className="text-[10px] text-ivory-dim">
                                An in-system security notification will be dispatched to this user upon confirmation.
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setIsRoleChangeConfirmOpen(false);
                                    setPendingEditPayload(null);
                                }}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                disabled={
                                    isSubmittingEdit ||
                                    roleConfirmText.trim().toUpperCase() !== pendingEditPayload.role.toUpperCase()
                                }
                                onClick={() => executeSaveEdit(pendingEditPayload)}
                                className="text-xs bg-gold hover:bg-gold-light text-charcoal font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {isSubmittingEdit ? 'Applying Role Change...' : 'Confirm Role Transition'}
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* --- MODAL 3: RESET CREDENTIALS --- */}
            {isResetPasswordModalOpen && targetAccount && (
                <Modal
                    isOpen={isResetPasswordModalOpen}
                    onClose={() => { setIsResetPasswordModalOpen(false); setTargetAccount(null); }}
                    title="Reset Account Credentials"
                >
                    <form onSubmit={handleConfirmResetPassword} className="space-y-4 text-xs">
                        <p className="text-ivory-dim text-xs">
                            Generate or assign a new password for <strong className="text-ivory">{targetAccount.email}</strong>.
                            All existing active sessions for this account will be invalidated.
                        </p>

                        <div className="space-y-1">
                            <label className="block text-ivory-dim font-medium">New Password</label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    required
                                    minLength={8}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full bg-charcoal border border-white/10 rounded p-2 pr-20 text-ivory text-xs font-mono focus:border-gold outline-none"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setShowNewPassword(!showNewPassword)}
                                        className="text-ivory-dim hover:text-ivory"
                                        title={showNewPassword ? 'Hide' : 'Show'}
                                    >
                                        {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => copyToClipboard(newPassword, 'Password')}
                                        className="text-ivory-dim hover:text-gold"
                                        title="Copy to clipboard"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <button
                                type="button"
                                onClick={() => setNewPassword(generateSecurePassword())}
                                className="text-gold text-xs hover:underline flex items-center gap-1 cursor-pointer"
                            >
                                <RotateCcw className="w-3 h-3" /> Generate New
                            </button>

                            <div className="flex gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setIsResetPasswordModalOpen(false)}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    disabled={isSubmittingReset || newPassword.length < 8}
                                    className="text-xs"
                                >
                                    {isSubmittingReset ? 'Updating...' : 'Set Credentials'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </Modal>
            )}

            {/* --- MODAL 4: SUSPEND CONFIRMATION (SAFEGUARDED) --- */}
            {isSuspendModalOpen && targetAccount && (
                <Modal
                    isOpen={isSuspendModalOpen}
                    onClose={() => { setIsSuspendModalOpen(false); setTargetAccount(null); }}
                    title="Confirm Account Suspension"
                >
                    <div className="space-y-4 text-xs">
                        <div className="p-3.5 rounded bg-red-500/10 border border-red-500/30 text-red-300 space-y-2">
                            <div className="flex items-center gap-2 font-bold text-red-400">
                                <AlertTriangle className="w-4 h-4" />
                                <span>Administrative Safety Notice</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                                You are about to suspend <strong>{targetAccount.username || targetAccount.email}</strong> ({targetAccount.role}).
                                This account will be prevented from authenticating and all active sessions will be terminated immediately.
                            </p>
                            <p className="text-[11px] text-ivory-dim">
                                <strong>Historical Data Integrity:</strong> This action will <em>NOT</em> delete historical transactions,
                                queue tickets, appointments, or inventory audit records associated with this user.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsSuspendModalOpen(false)}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmSuspend}
                                className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold"
                            >
                                Confirm Suspension
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* --- MODAL 5: RESTORE CONFIRMATION --- */}
            {isRestoreModalOpen && targetAccount && (
                <Modal
                    isOpen={isRestoreModalOpen}
                    onClose={() => { setIsRestoreModalOpen(false); setTargetAccount(null); }}
                    title="Reactivate Suspended Account"
                >
                    <div className="space-y-4 text-xs">
                        <div className="p-3.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
                            <div className="flex items-center gap-2 font-bold text-emerald-400">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Account Reactivation</span>
                            </div>
                            <p className="text-[11px] leading-relaxed">
                                You are restoring <strong>{targetAccount.username || targetAccount.email}</strong> back to active status.
                                The user will be permitted to log in and access system functions according to their assigned role.
                            </p>
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsRestoreModalOpen(false)}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmRestore}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                                Restore Account
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* --- MODAL 6: PROVISION ACCOUNT MODAL --- */}
            {isProvisionModalOpen && (
                <Modal
                    isOpen={isProvisionModalOpen}
                    onClose={() => {
                        setIsProvisionModalOpen(false);
                        if (onCloseProvisionModalExternally) onCloseProvisionModalExternally();
                    }}
                    title="Provision System Account"
                >
                    <form onSubmit={handleSubmitProvision} className="space-y-4 text-xs">
                        {/* Account Classification Toggle */}
                        <div className="grid grid-cols-2 gap-2 p-1 bg-charcoal border border-white/10 rounded-sm">
                            <button
                                type="button"
                                onClick={() => {
                                    setProvisionType('staff');
                                    setProvisionForm(prev => ({ ...prev, role: 'Barber' }));
                                }}
                                className={`py-1.5 rounded-sm font-semibold transition-all cursor-pointer ${
                                    provisionType === 'staff'
                                        ? 'bg-gold text-charcoal shadow'
                                        : 'text-ivory-dim hover:text-ivory'
                                }`}
                            >
                                Staff Member
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setProvisionType('admin');
                                    setProvisionForm(prev => ({ ...prev, role: 'Owner' }));
                                }}
                                className={`py-1.5 rounded-sm font-semibold transition-all cursor-pointer ${
                                    provisionType === 'admin'
                                        ? 'bg-gold text-charcoal shadow'
                                        : 'text-ivory-dim hover:text-ivory'
                                }`}
                            >
                                Administrator
                            </button>
                        </div>

                        {/* Name / Display Name */}
                        <div>
                            <label className="block text-ivory-dim mb-1 font-medium">
                                {provisionType === 'staff' ? 'Staff Full Name' : 'Username / Handle'}
                            </label>
                            <input
                                type="text"
                                required
                                value={provisionForm.name}
                                onChange={(e) => setProvisionForm({ ...provisionForm, name: e.target.value, username: e.target.value })}
                                placeholder={provisionType === 'staff' ? 'e.g. John Doe' : 'e.g. admin_john'}
                                className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none"
                            />
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-ivory-dim mb-1 font-medium">Email Address</label>
                            <input
                                type="email"
                                required
                                value={provisionForm.email}
                                onChange={(e) => setProvisionForm({ ...provisionForm, email: e.target.value })}
                                placeholder="portfolio@example.invalid"
                                className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none"
                            />
                        </div>

                        {/* Role Selection */}
                        <div>
                            <label className="block text-ivory-dim mb-1 font-medium">Assigned Role</label>
                            <select
                                value={provisionForm.role}
                                onChange={(e) => setProvisionForm({ ...provisionForm, role: e.target.value })}
                                className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none cursor-pointer"
                            >
                                {provisionType === 'staff' ? (
                                    <>
                                        <option value="Barber">Barber (Stylist / Service Provider)</option>
                                        <option value="Cashier">Cashier (POS & Reception)</option>
                                        <option value="Inventory Manager">Inventory Manager (Stock & Restock)</option>
                                    </>
                                ) : (
                                    <>
                                        <option value="Owner">Shop Admin (Branch Operations)</option>
                                        <option value="System Admin">Superadmin (Root / System Overseer)</option>
                                    </>
                                )}
                            </select>
                        </div>

                        {/* Specialty (if Barber) */}
                        {provisionType === 'staff' && provisionForm.role === 'Barber' && (
                            <div>
                                <label className="block text-ivory-dim mb-1 font-medium">Specialty</label>
                                <input
                                    type="text"
                                    value={provisionForm.specialty}
                                    onChange={(e) => setProvisionForm({ ...provisionForm, specialty: e.target.value })}
                                    placeholder="e.g. Fade Specialist, Beard Sculpting"
                                    className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs focus:border-gold outline-none"
                                />
                            </div>
                        )}

                        {/* Password Generator */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-ivory-dim font-medium">Initial Password</label>
                                <button
                                    type="button"
                                    onClick={() => copyToClipboard(provisionForm.password, 'Password')}
                                    className="text-gold hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
                                >
                                    <Copy className="w-3 h-3" /> Copy
                                </button>
                            </div>
                            <div className="relative">
                                <input
                                    type="text"
                                    required
                                    minLength={8}
                                    value={provisionForm.password}
                                    onChange={(e) => setProvisionForm({ ...provisionForm, password: e.target.value })}
                                    className="w-full bg-charcoal border border-white/10 rounded p-2 text-ivory text-xs font-mono focus:border-gold outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setIsProvisionModalOpen(false);
                                    if (onCloseProvisionModalExternally) onCloseProvisionModalExternally();
                                }}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                variant="primary"
                                disabled={isSubmittingProvision}
                                className="text-xs"
                            >
                                {isSubmittingProvision ? 'Provisioning...' : 'Provision Account'}
                            </Button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
};

export default AccountManagement;
