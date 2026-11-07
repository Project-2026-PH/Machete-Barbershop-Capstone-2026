import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Sliders,
  Search,
  RefreshCw,
  Eye,
  FileText,
  Store,
  X,
  UserCheck,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/feedback/Modal';
import { useToast } from '@/components/feedback/ToastContext';
import { useFeatures } from '@/context/FeatureContext';
import { api } from '@/config/api';
import type { SystemFeature, FeatureStatus } from '@demoshop/shared-types';
import {
  SYSTEM_ROLES,
  getRoleAccessState,
  type SystemRole,
} from '../utils/feature-compatibility';

import { FeatureCard } from './feature-management/FeatureCard';
import { FeatureConfigureDrawer } from './feature-management/FeatureConfigureDrawer';
import { FeatureConfirmModal } from './feature-management/FeatureConfirmModal';
import {
  FEATURE_AREAS,
  type ProductArea,
  getFeatureProductArea,
  getRoleDisplayName,
} from './feature-management/feature-constants';

import { RoleSelector } from './roles-access/RoleSelector';
import { RoleHeader } from './roles-access/RoleHeader';
import { RoleAccessSummary } from './roles-access/RoleAccessSummary';
import { FeatureAccessRow } from './roles-access/FeatureAccessRow';
import { AdvancedTestingControls } from './roles-access/AdvancedTestingControls';
import {
  type AccessFilterType,
  getEffectiveRoleAccessState,
} from './roles-access/roles-constants';

import { ContentManagement } from './content-management/ContentManagement';

export type SystemControlsTab = 'features' | 'access' | 'content';

interface SystemControlsProps {
  initialTab?: SystemControlsTab;
  onTabChange?: (tab: SystemControlsTab) => void;
}

export interface RoleCapabilityDetails {
  role: string;
  displayName: string;
  roleKey: string;
  isCore?: boolean;
  badge: string;
  description: string;
  authLevel: string;
  accountCount: number;
  accessibleRoutes: string[];
}

export const SYSTEM_ROLES_CATALOG: Record<string, RoleCapabilityDetails> = {
  'System Admin': {
    role: 'System Admin',
    displayName: 'Superadmin',
    roleKey: 'system_admin',
    isCore: true,
    badge: 'Platform Superuser',
    description: 'Full superuser privileges, system feature control, account provisioning, and security audit trail.',
    authLevel: 'Superadmin Administrative Scope + Full System & Security Access',
    accountCount: 0,
    accessibleRoutes: ['/system-admin/*', '/admin/*', '/docs'],
  },
  'Owner': {
    role: 'Owner',
    displayName: 'Owner',
    roleKey: 'owner',
    badge: 'Business Proprietor',
    description: 'Proprietor account with full visibility over financial commissions, branch performance, and executive audits.',
    authLevel: 'Executive Business Scope',
    accountCount: 0,
    accessibleRoutes: ['/admin/*', '/system-admin?tab=audit'],
  },
  'Shop Admin': {
    role: 'Shop Admin',
    displayName: 'Shop Admin',
    roleKey: 'shop_admin',
    badge: 'Branch Administration',
    description: 'Branch administrator account for staff management, monthly barber rosters, shift approvals, and financial reporting.',
    authLevel: 'Branch Operations Scope',
    accountCount: 0,
    accessibleRoutes: ['/admin/*'],
  },
  'Cashier': {
    role: 'Cashier',
    displayName: 'Cashier',
    roleKey: 'cashier',
    badge: 'Front-Desk Operations',
    description: 'Counter cashier account for Point of Sale checkout, walk-in ticketing, reservation review, and register reconciliation.',
    authLevel: 'Branch Scoped Access',
    accountCount: 0,
    accessibleRoutes: ['/cashier/*'],
  },
  'Inventory Manager': {
    role: 'Inventory Manager',
    displayName: 'Inventory Manager',
    roleKey: 'inventory_manager',
    badge: 'Warehouse & Stock',
    description: 'Stock manager account for inventory replenishment, consumable bottle tracking, supplier orders, and vendor records.',
    authLevel: 'Stock Mutation Permissions',
    accountCount: 0,
    accessibleRoutes: ['/inventory-manager/*'],
  },
  'Barber': {
    role: 'Barber',
    displayName: 'Barber',
    roleKey: 'barber',
    badge: 'Station Staff',
    description: 'Barber workspace account for chair station status, live branch queue calling, cut logs, and shift requests.',
    authLevel: 'Staff Station Token + Chair Availability',
    accountCount: 0,
    accessibleRoutes: ['/barber'],
  },
  'Customer': {
    role: 'Customer',
    displayName: 'Customer',
    roleKey: 'customer',
    badge: 'Standard User',
    description: 'Consumer client account with online appointment booking, live virtual queue tracker, haircut logs, and reviews.',
    authLevel: 'Customer Account Level',
    accountCount: 0,
    accessibleRoutes: ['/booking', '/dashboard/*', '/shop', '/guest-overview'],
  },
};

export const getRoleKey = (role: string): string => {
  if (role === 'System Admin') return 'system_admin';
  return SYSTEM_ROLES_CATALOG[role]?.roleKey || role.toLowerCase().replace(/\s+/g, '_');
};

export { getRoleDisplayName };

export const SystemControls: React.FC<SystemControlsProps> = ({
  initialTab = 'features',
  onTabChange,
}) => {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { refreshFeatures: refreshGlobalFeatures } = useFeatures();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<SystemControlsTab>(initialTab);

  const handleSelectTab = (tab: SystemControlsTab) => {
    setDrawerFeature(null);
    setIsDrawerOpen(false);
    setConfirmModalData(null);
    setActiveTab(tab);
    if (onTabChange) onTabChange(tab);
  };

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setDrawerFeature(null);
      setIsDrawerOpen(false);
      setConfirmModalData(null);
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // ──────────────────────────────────────────────────────────────────────────
  // SHARED FEATURES & DATABASE COUNTS DATA
  // ──────────────────────────────────────────────────────────────────────────
  const [features, setFeatures] = useState<SystemFeature[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Tab 1 (Features) Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ACTIVE' | 'MAINTENANCE' | 'DISABLED'>('all');
  const [areaFilter, setAreaFilter] = useState<'all' | ProductArea>('all');

  // Drawer & Safety Modal State
  const [drawerFeature, setDrawerFeature] = useState<SystemFeature | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [confirmModalData, setConfirmModalData] = useState<{
    feature: SystemFeature;
    targetStatus: FeatureStatus;
    maintenanceMessage: string;
    pendingRoles: Record<string, boolean>;
  } | null>(null);
  const [isSavingDrawer, setIsSavingDrawer] = useState<boolean>(false);
  const [isCheckingAuditLogs, setIsCheckingAuditLogs] = useState<boolean>(false);

  const hasLoadedRef = useRef<boolean>(false);

  const fetchFeatures = useCallback(async (force = false) => {
    if (!hasLoadedRef.current || force) {
      setIsLoading(true);
    }
    try {
      const res = await api.get('/api/system-admin/features');
      if (res.data?.features) {
        setFeatures(res.data.features);
        hasLoadedRef.current = true;
      }
    } catch (err: any) {
      console.error('[SystemControls] Failed to fetch system features:', err);
      addToast({
        type: 'error',
        title: 'Failed to Load Features',
        message: err.response?.data?.error || 'Could not connect to feature controls API.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  // Live Account Counts state from database
  const [roleAccountCounts, setRoleAccountCounts] = useState<Record<string, number>>({});
  const [isLoadingAccountCounts, setIsLoadingAccountCounts] = useState<boolean>(true);

  const fetchRoleAccountCounts = useCallback(async () => {
    setIsLoadingAccountCounts(true);
    try {
      const res = await api.get('/api/system-admin/dashboard-stats');
      const u = res.data?.users;
      if (u) {
        if (u.role_counts) {
          setRoleAccountCounts(u.role_counts);
        } else {
          setRoleAccountCounts({
            'System Admin': u.system_admins ?? 0,
            'Owner': u.owners ?? 0,
            'Shop Admin': u.shop_admins ?? 0,
            'Cashier': u.cashiers ?? 0,
            'Inventory Manager': u.inventory_managers ?? 0,
            'Barber': u.barbers ?? 0,
            'Customer': u.customers ?? 0,
          });
        }
      }
    } catch (err) {
      console.error('[SystemControls] Failed to fetch live role account counts from database:', err);
    } finally {
      setIsLoadingAccountCounts(false);
    }
  }, []);

  const getLiveAccountCount = useCallback(
    (roleName: string): number => {
      if (roleAccountCounts[roleName] !== undefined) {
        return roleAccountCounts[roleName];
      }
      return 0;
    },
    [roleAccountCounts]
  );

  // Testing Overrides State
  const [bypassTimeRestrictions, setBypassTimeRestrictions] = useState<boolean>(false);
  const [isUpdatingBypass, setIsUpdatingBypass] = useState<boolean>(false);
  const [bypassConfirmAction, setBypassConfirmAction] = useState<'grant' | 'revoke' | null>(null);

  const [bypassReceiptOcr, setBypassReceiptOcr] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_bypass_screenshot') === 'true';
    }
    return false;
  });
  const [isUpdatingReceiptBypass, setIsUpdatingReceiptBypass] = useState<boolean>(false);
  const [receiptBypassConfirmAction, setReceiptBypassConfirmAction] = useState<'grant' | 'revoke' | null>(null);

  const fetchShopSettings = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/settings');
      if (res.data?.bypassTimeRestrictions !== undefined) {
        setBypassTimeRestrictions(Boolean(res.data.bypassTimeRestrictions));
      }
      if (res.data?.bypassReceiptOcr !== undefined) {
        setBypassReceiptOcr(Boolean(res.data.bypassReceiptOcr));
        try {
          localStorage.setItem('admin_bypass_screenshot', String(res.data.bypassReceiptOcr));
        } catch {}
      }
    } catch (err) {
      console.error('[SystemControls] Failed to load shop settings for bypass status:', err);
    }
  }, []);

  const handleConfirmBypassChange = async () => {
    if (!bypassConfirmAction) return;
    const makeAllowed = bypassConfirmAction === 'grant';
    setIsUpdatingBypass(true);
    try {
      const res = await api.patch('/api/admin/settings', {
        bypassTimeRestrictions: makeAllowed,
      });
      const updatedValue = Boolean(res.data?.bypassTimeRestrictions ?? makeAllowed);
      setBypassTimeRestrictions(updatedValue);
      setBypassConfirmAction(null);

      window.dispatchEvent(
        new CustomEvent('demoshop:feature-flags-updated', {
          detail: { bypassTimeRestrictions: updatedValue },
        })
      );
      try {
        localStorage.setItem(
          'demoshop_feature_management_configs',
          JSON.stringify({ bypassTimeRestrictions: updatedValue })
        );
      } catch {}
      window.dispatchEvent(new Event('storage'));

      try {
        const bc = new BroadcastChannel('demoshop_system_controls_channel');
        bc.postMessage({
          type: 'bypass-time-restrictions-updated',
          bypassTimeRestrictions: updatedValue,
        });
        bc.close();
      } catch {}

      addToast({
        type: 'success',
        title: updatedValue ? 'Testing Mode Active' : 'Strict Time Gates Active',
        message: updatedValue
          ? 'Queue action time restrictions are now bypassed for testing.'
          : 'Strict appointment schedule time gates are now enforced.',
      });
    } catch (err: any) {
      console.error('[SystemControls] Failed to update bypass settings:', err);
      addToast({
        type: 'error',
        title: 'Settings Update Failed',
        message: err.response?.data?.error || 'Could not update testing mode settings.',
      });
    } finally {
      setIsUpdatingBypass(false);
    }
  };

  const handleConfirmReceiptBypassChange = async () => {
    if (!receiptBypassConfirmAction) return;
    const makeAllowed = receiptBypassConfirmAction === 'grant';
    setIsUpdatingReceiptBypass(true);
    try {
      const res = await api.patch('/api/admin/settings', {
        bypassReceiptOcr: makeAllowed,
      });
      const updatedValue = Boolean(res.data?.bypassReceiptOcr ?? makeAllowed);
      setBypassReceiptOcr(updatedValue);
      setReceiptBypassConfirmAction(null);

      try {
        localStorage.setItem('admin_bypass_screenshot', String(updatedValue));
      } catch {}

      window.dispatchEvent(
        new CustomEvent('demoshop:shop-settings-updated', {
          detail: { bypassReceiptOcr: updatedValue },
        })
      );
      window.dispatchEvent(new Event('storage'));

      try {
        const bc = new BroadcastChannel('demoshop_system_controls_channel');
        bc.postMessage({
          type: 'bypass-receipt-ocr-updated',
          bypassReceiptOcr: updatedValue,
        });
        bc.close();
      } catch {}

      addToast({
        type: 'success',
        title: updatedValue ? 'Testing Mode Active' : 'Strict Receipt OCR Active',
        message: updatedValue
          ? 'Customer receipt screenshot OCR verification is now bypassed for testing.'
          : 'Strict customer receipt screenshot OCR verification is now enforced.',
      });
    } catch (err: any) {
      console.error('[SystemControls] Failed to update receipt bypass settings:', err);
      addToast({
        type: 'error',
        title: 'Settings Update Failed',
        message: err.response?.data?.error || 'Could not update testing mode settings.',
      });
    } finally {
      setIsUpdatingReceiptBypass(false);
    }
  };

  useEffect(() => {
    fetchFeatures();
    fetchRoleAccountCounts();
    fetchShopSettings();
  }, [fetchFeatures, fetchRoleAccountCounts, fetchShopSettings]);

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 1 (FEATURES) COMPUTED & HANDLERS
  // ──────────────────────────────────────────────────────────────────────────
  const activeCount = useMemo(() => features.filter((f) => f.status === 'ENABLED').length, [features]);
  const maintenanceCount = useMemo(() => features.filter((f) => f.status === 'MAINTENANCE').length, [features]);
  const disabledCount = useMemo(() => features.filter((f) => f.status === 'DISABLED').length, [features]);

  const filteredFeatures = useMemo(() => {
    return features.filter((f) => {
      if (statusFilter === 'ACTIVE' && f.status !== 'ENABLED') return false;
      if (statusFilter === 'MAINTENANCE' && f.status !== 'MAINTENANCE') return false;
      if (statusFilter === 'DISABLED' && f.status !== 'DISABLED') return false;

      if (areaFilter !== 'all') {
        const featArea = getFeatureProductArea(f);
        if (featArea !== areaFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = f.name.toLowerCase().includes(q);
        const matchDesc = f.description.toLowerCase().includes(q);
        const matchId = f.id.toLowerCase().includes(q);
        const matchRoles = f.affected_roles.some((r) => r.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchId && !matchRoles) return false;
      }

      return true;
    });
  }, [features, statusFilter, areaFilter, searchQuery]);

  const featuresByArea = useMemo(() => {
    const map: Record<ProductArea, SystemFeature[]> = {
      Customer: [],
      Operations: [],
      Staff: [],
      System: [],
    };

    filteredFeatures.forEach((f) => {
      const area = getFeatureProductArea(f);
      map[area].push(f);
    });

    return map;
  }, [filteredFeatures]);

  const handleSaveFromDrawer = async (
    targetStatus: FeatureStatus,
    maintenanceMsg: string,
    pendingRoles: Record<string, boolean>
  ) => {
    if (!drawerFeature) return;

    const isHighImpact =
      targetStatus === 'DISABLED' ||
      (targetStatus === 'MAINTENANCE' && drawerFeature.is_critical);

    const statusChanged = targetStatus !== drawerFeature.status;

    if (statusChanged && isHighImpact) {
      setConfirmModalData({
        feature: drawerFeature,
        targetStatus,
        maintenanceMessage: maintenanceMsg,
        pendingRoles,
      });
      return;
    }

    await executeFeatureSave(drawerFeature, targetStatus, maintenanceMsg, pendingRoles);
  };

  const executeFeatureSave = async (
    feat: SystemFeature,
    targetStatus: FeatureStatus,
    maintenanceMsg: string,
    pendingRoles: Record<string, boolean>
  ) => {
    setIsSavingDrawer(true);
    try {
      let updatedFeature = feat;
      const statusChanged = targetStatus !== feat.status;
      const maintenanceMsgChanged =
        targetStatus === 'MAINTENANCE' &&
        maintenanceMsg.trim() !== (feat.maintenance_message || '').trim();

      if (!feat.is_core && (statusChanged || maintenanceMsgChanged)) {
        const payload: { status: FeatureStatus; maintenanceMessage?: string } = {
          status: targetStatus,
        };
        if (targetStatus === 'MAINTENANCE') {
          payload.maintenanceMessage = maintenanceMsg.trim();
        }
        const res = await api.patch(`/api/system-admin/features/${feat.id}`, payload);
        if (res.data?.feature) {
          updatedFeature = res.data.feature;
        }
      }

      const roleKeys = Object.keys(pendingRoles);
      if (roleKeys.length > 0) {
        const newRoles = SYSTEM_ROLES.filter((role) => {
          if (pendingRoles[role] !== undefined) {
            return pendingRoles[role];
          }
          return updatedFeature.affected_roles.includes(role);
        });

        const resRoles = await api.patch(`/api/system-admin/features/${feat.id}/roles`, {
          roles: newRoles,
        });
        if (resRoles.data?.feature) {
          updatedFeature = resRoles.data.feature;
        }
      }

      setFeatures((prev) => prev.map((f) => (f.id === updatedFeature.id ? updatedFeature : f)));
      setDrawerFeature(null);
      setIsDrawerOpen(false);
      setConfirmModalData(null);

      addToast({
        type: 'success',
        title: 'Feature Settings Saved',
        message: `${updatedFeature.name} settings updated. Recorded in Audit Logs.`,
      });

      refreshGlobalFeatures();
    } catch (err: any) {
      console.error('[SystemControls] Failed to update feature:', err);
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.error || 'Failed to update feature settings.',
      });
    } finally {
      setIsSavingDrawer(false);
    }
  };

  const handleConfirmSafetyModal = async () => {
    if (!confirmModalData) return;
    await executeFeatureSave(
      confirmModalData.feature,
      confirmModalData.targetStatus,
      confirmModalData.maintenanceMessage,
      confirmModalData.pendingRoles
    );
  };

  const handleViewAuditHistory = async (feature: SystemFeature) => {
    if (!feature) return;
    setIsCheckingAuditLogs(true);
    try {
      const res = await api.get('/api/system-admin/audit-logs', {
        params: {
          filter: feature.id,
          limit: 1,
        },
      });
      const total = res.data?.pagination?.total ?? (res.data?.logs?.length || 0);
      if (total === 0) {
        addToast({
          type: 'info',
          title: 'No Audit History',
          message: `No recorded audit activity exists for ${feature.name} yet.`,
        });
        return;
      }
      setIsDrawerOpen(false);
      setDrawerFeature(null);
      navigate(`/system-admin/dashboard?tab=audit&filter=${encodeURIComponent(feature.id)}`);
    } catch (err: any) {
      console.error('[SystemControls] Failed to check audit history for feature:', err);
      setIsDrawerOpen(false);
      setDrawerFeature(null);
      navigate(`/system-admin/dashboard?tab=audit&filter=${encodeURIComponent(feature.id)}`);
    } finally {
      setIsCheckingAuditLogs(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // TAB 2 (ROLES & ACCESS) STATE & HANDLERS
  // ──────────────────────────────────────────────────────────────────────────
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>('System Admin');
  const [roleSearchQuery, setRoleSearchQuery] = useState<string>('');
  const [roleAccessFilter, setRoleAccessFilter] = useState<AccessFilterType>('all');
  const [roleAreaFilter, setRoleAreaFilter] = useState<'all' | ProductArea>('all');
  const [isMutatingRole, setIsMutatingRole] = useState<boolean>(false);

  // Selected Role Details
  const selectedRoleDetails = SYSTEM_ROLES_CATALOG[selectedRoleKey] || SYSTEM_ROLES_CATALOG['System Admin'];

  // Role Access Statistics
  const roleAccessCounts = useMemo(() => {
    let available = 0;
    let restricted = 0;
    let unavailable = 0;
    let systemManaged = 0;

    features.forEach((f) => {
      const comp = getRoleAccessState(f.id, selectedRoleKey as SystemRole, f.affected_roles);
      const state = getEffectiveRoleAccessState(f, selectedRoleKey as SystemRole, comp.state === 'LOCKED');

      if (state === 'system_managed') systemManaged++;
      else if (state === 'unavailable') unavailable++;
      else if (state === 'available') available++;
      else if (state === 'restricted') restricted++;
    });

    return {
      available,
      restricted,
      unavailable,
      systemManaged,
      total: features.length,
    };
  }, [features, selectedRoleKey]);

  // Features Filtered for Selected Role
  const filteredRoleFeatures = useMemo(() => {
    return features.filter((f) => {
      const comp = getRoleAccessState(f.id, selectedRoleKey as SystemRole, f.affected_roles);
      const state = getEffectiveRoleAccessState(f, selectedRoleKey as SystemRole, comp.state === 'LOCKED');

      // Access Filter
      if (roleAccessFilter !== 'all' && state !== roleAccessFilter) return false;

      // Area Filter
      if (roleAreaFilter !== 'all') {
        const area = getFeatureProductArea(f);
        if (area !== roleAreaFilter) return false;
      }

      // Search Query
      if (roleSearchQuery.trim()) {
        const q = roleSearchQuery.toLowerCase();
        const matchName = f.name.toLowerCase().includes(q);
        const matchDesc = f.description.toLowerCase().includes(q);
        const matchId = f.id.toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchId) return false;
      }

      return true;
    });
  }, [features, selectedRoleKey, roleAccessFilter, roleAreaFilter, roleSearchQuery]);

  // Grouped filtered role features by Area
  const roleFeaturesByArea = useMemo(() => {
    const map: Record<ProductArea, SystemFeature[]> = {
      Customer: [],
      Operations: [],
      Staff: [],
      System: [],
    };

    filteredRoleFeatures.forEach((f) => {
      const area = getFeatureProductArea(f);
      map[area].push(f);
    });

    return map;
  }, [filteredRoleFeatures]);

  // Role Access Mutation Dialog State
  const [roleAccessDialog, setRoleAccessDialog] = useState<{
    feature: SystemFeature;
    role: string;
    action: 'grant' | 'revoke';
  } | null>(null);

  const handleConfirmRoleMutation = async () => {
    if (!roleAccessDialog) return;
    const { feature, role, action } = roleAccessDialog;
    setIsMutatingRole(true);

    try {
      const updatedRoles =
        action === 'grant'
          ? Array.from(new Set([...feature.affected_roles, role]))
          : feature.affected_roles.filter((r) => r !== role);

      const res = await api.patch(`/api/system-admin/features/${feature.id}/roles`, {
        roles: updatedRoles,
      });

      if (res.data?.feature) {
        const updated = res.data.feature;
        setFeatures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
        setRoleAccessDialog(null);
        addToast({
          type: 'success',
          title: action === 'grant' ? 'Access Available' : 'Access Restricted',
          message: `${getRoleDisplayName(role)} access ${action === 'grant' ? 'granted to' : 'restricted on'} ${feature.name}.`,
        });
        refreshGlobalFeatures();
      }
    } catch (err: any) {
      console.error('Failed to update role access:', err);
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: err.response?.data?.error || 'Failed to update feature role permissions.',
      });
    } finally {
      setIsMutatingRole(false);
    }
  };

  // Preview Modals State
  const [isNewRoleModalOpen, setIsNewRoleModalOpen] = useState<boolean>(false);
  const [newRoleName, setNewRoleName] = useState<string>('');
  const [newRoleKey, setNewRoleKey] = useState<string>('');
  const [newRoleKeyEdited, setNewRoleKeyEdited] = useState<boolean>(false);
  const [newRoleDescription, setNewRoleDescription] = useState<string>('');
  const [newRoleSelectedFeatures, setNewRoleSelectedFeatures] = useState<string[]>([]);
  const [isRemoveRoleModalOpen, setIsRemoveRoleModalOpen] = useState<boolean>(false);

  const handleRoleNameChange = (name: string) => {
    setNewRoleName(name);
    if (!newRoleKeyEdited) {
      const generated = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setNewRoleKey(generated);
    }
  };

  const handleToggleNewRoleFeature = (featureId: string) => {
    setNewRoleSelectedFeatures((prev) =>
      prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]
    );
  };

  const handleCreateRolePreview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) {
      addToast({
        type: 'error',
        title: 'Validation Error',
        message: 'Role Name is required.',
      });
      return;
    }
    setIsNewRoleModalOpen(false);
    addToast({
      type: 'info',
      title: 'Role Preview Created',
      message: 'Preview only — no production changes were made. Dynamic role provisioning is planned for a future release.',
    });
    setNewRoleName('');
    setNewRoleKey('');
    setNewRoleKeyEdited(false);
    setNewRoleDescription('');
    setNewRoleSelectedFeatures([]);
  };

  const handleRemoveRolePreview = () => {
    setIsRemoveRoleModalOpen(false);
    addToast({
      type: 'info',
      title: 'Role Removal Preview',
      message: 'Preview only — no production changes were made. System roles cannot be deleted in current static RBAC.',
    });
  };

  // Navigation to Account Management filtered to role
  const handleNavigateToAccounts = () => {
    navigate(`/system-admin/dashboard?tab=accounts&role=${encodeURIComponent(selectedRoleDetails.roleKey)}`);
  };

  return (
    <div className="space-y-6 text-ivory pb-20 relative">
      {/* ── 1. GLOBAL SYSTEM CONTROLS PAGE HEADER ──────────────────────── */}
      <div className="border-b border-white/5 pb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-serif font-bold tracking-wide text-ivory">
              System Controls
            </h1>
            <p className="text-xs text-ivory-dim/70 mt-1">
              Manage how DemoShop's features, access, and public content behave.
            </p>
          </div>

          {/* Section Selector / Sub-tabs */}
          <div className="flex items-center gap-1 bg-charcoal-light p-1 border border-white/10 rounded-sm">
            <button
              type="button"
              onClick={() => handleSelectTab('features')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-[2px] text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'features'
                  ? 'bg-gold text-charcoal font-bold shadow-xs'
                  : 'text-ivory-dim hover:text-ivory hover:bg-white/[0.04]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Features</span>
              <span
                className={`px-1.5 py-0.2 rounded-[2px] text-[8px] font-mono tracking-wider uppercase font-bold ${
                  activeTab === 'features'
                    ? 'bg-charcoal/20 text-charcoal'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                Live
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('access')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-[2px] text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'access'
                  ? 'bg-gold text-charcoal font-bold shadow-xs'
                  : 'text-ivory-dim hover:text-ivory hover:bg-white/[0.04]'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Roles & Access</span>
              <span
                className={`px-1.5 py-0.2 rounded-[2px] text-[8px] font-mono tracking-wider uppercase font-bold ${
                  activeTab === 'access'
                    ? 'bg-charcoal/20 text-charcoal'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                Live
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectTab('content')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-[2px] text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'content'
                  ? 'bg-gold text-charcoal font-bold shadow-xs'
                  : 'text-ivory-dim hover:text-ivory hover:bg-white/[0.04]'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Content Management</span>
              <span
                className={`px-1.5 py-0.2 rounded-[2px] text-[8px] font-mono tracking-wider uppercase font-bold ${
                  activeTab === 'content'
                    ? 'bg-charcoal/20 text-charcoal'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                Live
              </span>
            </button>
          </div>
        </div>

        {/* Active Section Headline */}
        <div className="mt-4">
          <h2 className="text-base font-serif font-bold text-ivory">
            {activeTab === 'features' && 'Features'}
            {activeTab === 'access' && 'Roles & Access'}
            {activeTab === 'content' && 'Content Management'}
          </h2>
          <p className="text-xs text-ivory-dim/70 mt-0.5">
            {activeTab === 'features' && "Control which parts of DemoShop's are available."}
            {activeTab === 'access' && "Manage what each role can access."}
            {activeTab === 'content' && "Manage DemoShop's public website content and presentation."}
          </p>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 1: FEATURES (CONTROL CENTER)                                   */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'features' && (
        <div className="space-y-6 animate-fade-in">
          {/* Small Feature Overview Summary */}
          <div className="flex flex-wrap items-center justify-between gap-4 py-3 px-4 bg-charcoal-light/70 border border-white/5 rounded-sm">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-semibold text-ivory">{activeCount} Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="font-semibold text-ivory">{maintenanceCount} Maintenance</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                <span className="font-semibold text-ivory">{disabledCount} Disabled</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => fetchFeatures(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 text-xs text-ivory-dim hover:text-gold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-gold' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Simple Search & Filter Toolbar */}
          <div className="p-3 bg-charcoal-light border border-white/5 rounded-sm flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim/40 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search features..."
                className="w-full bg-charcoal border border-white/10 rounded-sm pl-9 pr-8 py-1.5 text-xs text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim/60 hover:text-ivory cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-charcoal border border-white/10 rounded-sm px-2.5 py-1.5 text-xs text-ivory focus:outline-none focus:border-gold cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="DISABLED">Disabled</option>
              </select>

              <select
                value={areaFilter}
                onChange={(e) => setAreaFilter(e.target.value as any)}
                className="bg-charcoal border border-white/10 rounded-sm px-2.5 py-1.5 text-xs text-ivory focus:outline-none focus:border-gold cursor-pointer"
              >
                <option value="all">All Areas</option>
                <option value="Customer">Customer</option>
                <option value="Operations">Operations</option>
                <option value="Staff">Staff</option>
                <option value="System">System</option>
              </select>

              {(searchQuery || statusFilter !== 'all' || areaFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setAreaFilter('all');
                  }}
                  className="text-xs text-gold hover:underline font-mono px-2 py-1 cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Loading Skeleton */}
          {isLoading && features.length === 0 ? (
            <div className="py-16 text-center text-ivory-dim/60 animate-pulse space-y-2">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin text-gold" />
              <div className="text-xs font-mono">Loading feature controls...</div>
            </div>
          ) : filteredFeatures.length === 0 ? (
            <div className="py-12 px-4 text-center bg-charcoal-light/40 border border-white/5 rounded-sm space-y-2">
              <Sliders className="w-8 h-8 mx-auto text-ivory-dim/30" />
              <h4 className="text-sm font-semibold text-ivory">No features match your filter</h4>
              <p className="text-xs text-ivory-dim/60">Try searching with different terms or resetting filters.</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setAreaFilter('all');
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-[2px] bg-gold/15 border border-gold/30 text-gold text-xs font-mono hover:bg-gold/25 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" /> Reset Filters
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {FEATURE_AREAS.map((area) => {
                const areaFeatures = featuresByArea[area.id];
                if (areaFeatures.length === 0) return null;

                return (
                  <div key={area.id} className="space-y-3">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-gold font-mono flex items-center gap-2">
                          <span>{area.title}</span>
                          <span className="text-[10px] font-normal text-ivory-dim/50 font-mono">
                            ({areaFeatures.length})
                          </span>
                        </h3>
                        <p className="text-[11px] text-ivory-dim/60 mt-0.5">{area.description}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {areaFeatures.map((f) => (
                        <FeatureCard
                          key={f.id}
                          feature={f}
                          onConfigure={(feat) => {
                            setDrawerFeature(feat);
                            setIsDrawerOpen(true);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Configure Feature Drawer */}
          <FeatureConfigureDrawer
            feature={drawerFeature}
            isOpen={isDrawerOpen}
            onClose={() => {
              setIsDrawerOpen(false);
              setDrawerFeature(null);
            }}
            onSave={handleSaveFromDrawer}
            isSaving={isSavingDrawer}
            onViewAuditHistory={handleViewAuditHistory}
            isCheckingAuditLogs={isCheckingAuditLogs}
          />

          {/* Safe Confirmation Modal */}
          {confirmModalData && (
            <FeatureConfirmModal
              isOpen={true}
              feature={confirmModalData.feature}
              targetStatus={confirmModalData.targetStatus}
              onCancel={() => setConfirmModalData(null)}
              onConfirm={handleConfirmSafetyModal}
              isSaving={isSavingDrawer}
            />
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 2: ROLES & ACCESS (ROLE ACCESS MANAGER)                         */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'access' && (
        <div className="space-y-5 animate-fade-in">
          {/* Split-Panel: Left Role Selector + Right Access Workspace */}
          <div className="flex flex-col lg:flex-row items-start gap-6">
            {/* Left Panel: Role Selector */}
            <RoleSelector
              roles={Object.keys(SYSTEM_ROLES_CATALOG)}
              selectedRole={selectedRoleKey}
              onSelectRole={(role) => {
                setSelectedRoleKey(role);
                setRoleAccessFilter('all');
                setRoleAreaFilter('all');
                setRoleSearchQuery('');
              }}
              getAccountCount={getLiveAccountCount}
              onOpenNewRoleModal={() => setIsNewRoleModalOpen(true)}
            />

            {/* Right Panel: Selected Role Access Workspace */}
            <div className="flex-1 w-full bg-charcoal-light border border-white/5 rounded-sm p-5 space-y-6">
              {/* Selected Role Header */}
              <RoleHeader
                roleDetails={selectedRoleDetails}
                accountCount={getLiveAccountCount(selectedRoleKey)}
                onNavigateToAccounts={handleNavigateToAccounts}
                onOpenRemoveRoleModal={() => setIsRemoveRoleModalOpen(true)}
              />

              {/* Access Summary & Priority Note */}
              <RoleAccessSummary
                counts={roleAccessCounts}
                activeFilter={roleAccessFilter}
                onFilterChange={setRoleAccessFilter}
              />

              {/* Search & Area Filter Bar */}
              <div className="p-3 bg-charcoal border border-white/5 rounded-sm flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ivory-dim/40 pointer-events-none" />
                  <input
                    type="text"
                    value={roleSearchQuery}
                    onChange={(e) => setRoleSearchQuery(e.target.value)}
                    placeholder={`Search features for ${selectedRoleDetails.displayName}...`}
                    className="w-full bg-charcoal-light border border-white/10 rounded-sm pl-9 pr-8 py-1.5 text-xs text-ivory placeholder-ivory-dim/40 focus:outline-none focus:border-gold transition-colors"
                  />
                  {roleSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setRoleSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ivory-dim/60 hover:text-ivory cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={roleAreaFilter}
                    onChange={(e) => setRoleAreaFilter(e.target.value as any)}
                    className="bg-charcoal-light border border-white/10 rounded-sm px-2.5 py-1.5 text-xs text-ivory focus:outline-none focus:border-gold cursor-pointer"
                  >
                    <option value="all">All Areas</option>
                    <option value="Customer">Customer</option>
                    <option value="Operations">Operations</option>
                    <option value="Staff">Staff</option>
                    <option value="System">System</option>
                  </select>

                  {(roleSearchQuery || roleAccessFilter !== 'all' || roleAreaFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setRoleSearchQuery('');
                        setRoleAccessFilter('all');
                        setRoleAreaFilter('all');
                      }}
                      className="text-xs text-gold hover:underline font-mono px-1 cursor-pointer shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Feature Access Groups (Grouped by Same Product Areas) */}
              {filteredRoleFeatures.length === 0 ? (
                <div className="py-12 px-4 text-center bg-charcoal/40 border border-white/5 rounded-sm space-y-2">
                  <Sliders className="w-8 h-8 mx-auto text-ivory-dim/30" />
                  <h4 className="text-sm font-semibold text-ivory">No features match your current filter</h4>
                  <p className="text-xs text-ivory-dim/60">Try clearing filters or changing search terms.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRoleSearchQuery('');
                      setRoleAccessFilter('all');
                      setRoleAreaFilter('all');
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-[2px] bg-gold/15 border border-gold/30 text-gold text-xs font-mono hover:bg-gold/25 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" /> Reset Filters
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {FEATURE_AREAS.map((area) => {
                    const areaFeatures = roleFeaturesByArea[area.id];
                    if (areaFeatures.length === 0) return null;

                    return (
                      <div key={area.id} className="space-y-2.5">
                        <div className="flex items-center justify-between border-b border-white/5 pb-1.5 px-0.5">
                          <h3 className="text-xs font-bold uppercase tracking-wider text-gold font-mono flex items-center gap-2">
                            <span>{area.title}</span>
                            <span className="text-[10px] font-normal text-ivory-dim/50 font-mono">
                              ({areaFeatures.length})
                            </span>
                          </h3>
                        </div>

                        <div className="space-y-2">
                          {areaFeatures.map((f) => (
                            <FeatureAccessRow
                              key={f.id}
                              feature={f}
                              role={selectedRoleKey as SystemRole}
                              effectiveRoles={f.affected_roles}
                              onToggleAccess={(feat, makeAllowed) => {
                                setRoleAccessDialog({
                                  feature: feat,
                                  role: selectedRoleKey,
                                  action: makeAllowed ? 'grant' : 'revoke',
                                });
                              }}
                              onViewFeature={(feat) => {
                                handleSelectTab('features');
                                setDrawerFeature(feat);
                                setIsDrawerOpen(true);
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Collapsed Advanced Testing Controls */}
              <AdvancedTestingControls
                selectedRoleKey={selectedRoleKey}
                bypassTimeRestrictions={bypassTimeRestrictions}
                onOpenBypassTimeModal={(action) => setBypassConfirmAction(action)}
                isUpdatingBypass={isUpdatingBypass}
                bypassReceiptOcr={bypassReceiptOcr}
                onOpenBypassReceiptModal={(action) => setReceiptBypassConfirmAction(action)}
                isUpdatingReceiptBypass={isUpdatingReceiptBypass}
              />
            </div>
          </div>

          {/* Role Access Mutation Confirmation Modal */}
          {roleAccessDialog && (
            <Modal
              isOpen={true}
              onClose={() => {
                if (!isMutatingRole) setRoleAccessDialog(null);
              }}
              title={
                roleAccessDialog.action === 'grant'
                  ? 'GRANT FEATURE ACCESS'
                  : 'RESTRICT FEATURE ACCESS'
              }
              size="sm"
            >
              <div className="space-y-4 text-xs text-ivory">
                <div className="p-3 bg-charcoal border border-white/10 rounded-sm flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gold block">
                      Target Feature
                    </span>
                    <h4 className="font-serif font-bold text-sm text-ivory mt-0.5">
                      {roleAccessDialog.feature.name}
                    </h4>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-ivory-dim/50 block">
                      Role Access
                    </span>
                    <div className="font-bold text-xs mt-0.5">
                      {roleAccessDialog.action === 'grant' ? (
                        <span className="text-emerald-400 font-mono">Restricted → Allowed</span>
                      ) : (
                        <span className="text-rose-400 font-mono">Allowed → Restricted</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-white/[0.03] border border-white/10 rounded-sm space-y-1 text-[11px] text-ivory-dim/80">
                  <div className="font-bold text-ivory font-mono uppercase tracking-wider text-[10px]">
                    Operational Impact
                  </div>
                  <p className="text-ivory-dim/70 leading-relaxed">
                    This change takes effect immediately for all{' '}
                    <strong>{getRoleDisplayName(roleAccessDialog.role)}</strong> accounts. Existing historical data will NOT be deleted.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => setRoleAccessDialog(null)}
                    disabled={isMutatingRole}
                    className="text-xs px-3 py-1.5"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirmRoleMutation}
                    disabled={isMutatingRole}
                    className={`text-xs px-4 py-1.5 font-bold cursor-pointer ${
                      roleAccessDialog.action === 'revoke'
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-gold hover:bg-gold-light text-charcoal'
                    }`}
                  >
                    {isMutatingRole
                      ? 'Applying...'
                      : roleAccessDialog.action === 'grant'
                      ? 'Confirm Access'
                      : 'Confirm Restriction'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Bypass Appointment Time Restrictions Confirmation Modal */}
          {bypassConfirmAction && (
            <Modal
              isOpen={true}
              onClose={() => {
                if (!isUpdatingBypass) setBypassConfirmAction(null);
              }}
              title={
                bypassConfirmAction === 'grant'
                  ? 'ENABLE TIME RESTRICTION BYPASS'
                  : 'RESTORE STRICT TIME GATES'
              }
              size="sm"
            >
              <div className="space-y-4 text-xs text-ivory">
                <div className="p-3 bg-charcoal border border-white/10 rounded-sm">
                  <h4 className="font-serif font-bold text-sm text-ivory">
                    Bypass Appointment Time Restrictions
                  </h4>
                  <p className="text-xs text-ivory-dim/75 mt-1">
                    {bypassConfirmAction === 'grant'
                      ? 'Cashiers can perform Check In and No Show actions anytime without waiting for scheduled arrival times.'
                      : 'Cashiers must wait for scheduled arrival times to perform Check In or No Show.'}
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => setBypassConfirmAction(null)}
                    disabled={isUpdatingBypass}
                    className="text-xs px-3 py-1.5"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirmBypassChange}
                    disabled={isUpdatingBypass}
                    className={`text-xs px-4 py-1.5 font-bold ${
                      bypassConfirmAction === 'revoke'
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-gold hover:bg-gold-light text-charcoal'
                    }`}
                  >
                    {isUpdatingBypass ? 'Updating...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* Bypass Payment Screenshot OCR Confirmation Modal */}
          {receiptBypassConfirmAction && (
            <Modal
              isOpen={true}
              onClose={() => {
                if (!isUpdatingReceiptBypass) setReceiptBypassConfirmAction(null);
              }}
              title={
                receiptBypassConfirmAction === 'grant'
                  ? 'ENABLE RECEIPT OCR BYPASS'
                  : 'RESTORE STRICT RECEIPT OCR'
              }
              size="sm"
            >
              <div className="space-y-4 text-xs text-ivory">
                <div className="p-3 bg-charcoal border border-white/10 rounded-sm">
                  <h4 className="font-serif font-bold text-sm text-ivory">
                    Bypass Payment Screenshot OCR
                  </h4>
                  <p className="text-xs text-ivory-dim/75 mt-1">
                    {receiptBypassConfirmAction === 'grant'
                      ? 'Allows uploading any picture during customer booking checkout without OCR verification.'
                      : 'Strict OCR verification for payment receipts will be enforced.'}
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => setReceiptBypassConfirmAction(null)}
                    disabled={isUpdatingReceiptBypass}
                    className="text-xs px-3 py-1.5"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleConfirmReceiptBypassChange}
                    disabled={isUpdatingReceiptBypass}
                    className={`text-xs px-4 py-1.5 font-bold ${
                      receiptBypassConfirmAction === 'revoke'
                        ? 'bg-rose-500 hover:bg-rose-600 text-white'
                        : 'bg-gold hover:bg-gold-light text-charcoal'
                    }`}
                  >
                    {isUpdatingReceiptBypass ? 'Updating...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </Modal>
          )}

          {/* New Role (Preview Only) Modal */}
          {isNewRoleModalOpen && (
            <Modal
              isOpen={true}
              onClose={() => setIsNewRoleModalOpen(false)}
              title="CREATE ROLE [PREVIEW]"
              size="md"
            >
              <form onSubmit={handleCreateRolePreview} className="space-y-4 text-xs text-ivory">
                <div>
                  <label className="block text-xs font-semibold text-ivory-dim mb-1">
                    Role Display Name <span className="text-gold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newRoleName}
                    onChange={(e) => handleRoleNameChange(e.target.value)}
                    placeholder="e.g. Senior Barber, Assistant Manager"
                    className="w-full bg-charcoal border border-white/10 rounded-sm p-2 text-xs text-ivory focus:outline-none focus:border-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ivory-dim mb-1">
                    Role Key (Machine Identifier)
                  </label>
                  <input
                    type="text"
                    value={newRoleKey}
                    onChange={(e) => {
                      setNewRoleKeyEdited(true);
                      setNewRoleKey(e.target.value);
                    }}
                    placeholder="e.g. senior_barber"
                    className="w-full bg-charcoal border border-white/10 rounded-sm p-2 text-xs text-gold font-mono focus:outline-none focus:border-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ivory-dim mb-1">
                    Description
                  </label>
                  <textarea
                    rows={2}
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    placeholder="Describe role responsibilities..."
                    className="w-full bg-charcoal border border-white/10 rounded-sm p-2 text-xs text-ivory focus:outline-none focus:border-gold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ivory-dim mb-1">
                    Select Accessible Features
                  </label>
                  <div className="max-h-40 overflow-y-auto space-y-1 p-2 bg-charcoal rounded border border-white/5 custom-scrollbar">
                    {features.map((feat) => {
                      const isChecked = newRoleSelectedFeatures.includes(feat.id);
                      return (
                        <label
                          key={feat.id}
                          className="flex items-center gap-2 p-1.5 rounded hover:bg-white/5 cursor-pointer text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleNewRoleFeature(feat.id)}
                            className="accent-gold rounded"
                          />
                          <span className="text-ivory">{feat.name}</span>
                          <span className="text-[10px] text-ivory-dim/50 font-mono ml-auto">
                            {feat.category}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => setIsNewRoleModalOpen(false)}
                    className="text-xs px-3 py-1.5"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="text-xs px-4 py-1.5 bg-gold hover:bg-gold-light text-charcoal font-bold"
                  >
                    Create Role — Preview
                  </Button>
                </div>
              </form>
            </Modal>
          )}

          {/* Remove Role (Preview Only) Modal */}
          {isRemoveRoleModalOpen && (
            <Modal
              isOpen={true}
              onClose={() => setIsRemoveRoleModalOpen(false)}
              title="REMOVE ROLE?"
              size="md"
            >
              <div className="space-y-4 text-xs text-ivory">
                <div className="p-3 bg-charcoal border border-white/10 rounded-sm flex items-center justify-between gap-3">
                  <div>
                    <h4 className="font-serif font-bold text-sm text-ivory">
                      {selectedRoleDetails.displayName}
                    </h4>
                    <span className="text-[10px] text-ivory-dim/60 font-mono">
                      [ {selectedRoleDetails.roleKey} ] • {selectedRoleDetails.badge}
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded-[2px] bg-amber-500/20 text-amber-300 font-mono text-[9px] uppercase font-bold border border-amber-500/40">
                    Preview
                  </span>
                </div>

                <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-200 text-[11px]">
                  <strong>System Role Notice:</strong> System roles are defined by the current application architecture and cannot currently be deleted.
                </div>

                <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => setIsRemoveRoleModalOpen(false)}
                    className="text-xs px-3 py-1.5"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleRemoveRolePreview}
                    className="text-xs px-4 py-1.5 bg-rose-500 hover:bg-rose-600 text-white font-bold"
                  >
                    Remove Role — Preview
                  </Button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* VIEW 3: CONTENT MANAGEMENT (AUTHORITATIVE SYSTEM CONTROLS CMS)      */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {activeTab === 'content' && (
        <div className="space-y-6 animate-fade-in">
          <ContentManagement />
        </div>
      )}
    </div>
  );
};

export default SystemControls;
