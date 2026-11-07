import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/config/api';
import { useAuth } from '@/components/auth/AuthContext';
import { FEATURE_ROLE_RULES, type SystemRole } from '@/features/system-admin/utils/feature-compatibility';
import type { FeatureStatus, FeatureStatusSummary } from '@demoshop/shared-types';

interface FeatureContextType {
  featureStatuses: FeatureStatusSummary;
  loading: boolean;
  error: string | null;
  refreshFeatures: () => Promise<void>;
  isFeatureEnabled: (featureId: string) => boolean;
  isFeatureMaintenance: (featureId: string) => boolean;
  getFeatureState: (featureId: string) => FeatureStatus;
  getMaintenanceMessage: (featureId: string) => string | null;
  hasAccess: (featureId: string) => boolean;
  hasRoleFeatureAccess: (featureId: string, role?: string | null) => boolean;
}

const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

interface FeatureProviderProps {
  children: ReactNode;
}

let featureStatusRequest: Promise<FeatureStatusSummary | null> | null = null;

const normalizeSystemRole = (r: string): string => {
  if (r === 'SystemAdmin') return 'System Admin';
  if (r === 'Admin' || r === 'ShopAdmin') return 'Shop Admin';
  return r;
};

export const FeatureProvider: React.FC<FeatureProviderProps> = ({ children }) => {
  const [featureStatuses, setFeatureStatuses] = useState<FeatureStatusSummary>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { role } = useAuth();

  const refreshFeatures = useCallback(async () => {
    if (!featureStatusRequest) {
      featureStatusRequest = api.get('/api/features/status').then((response) => {
        if (response.data && typeof response.data === 'object') return response.data as FeatureStatusSummary;
        return null;
      });
    }

    try {
      const statuses = await featureStatusRequest;
      if (statuses) {
        setFeatureStatuses(statuses);
        setError(null);
      }
    } catch (err: any) {
      console.warn('[FeatureContext] Failed to load feature statuses, failing open:', err?.message || err);
      // Fail open: don't block users if status check fails
      setError('Failed to fetch feature availability');
    } finally {
      featureStatusRequest = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshFeatures();
  }, [refreshFeatures]);

  // Keep feature controls reasonably fresh without polling in background tabs.
  useEffect(() => {
    const handleFocus = () => {
      refreshFeatures();
    };
    window.addEventListener('focus', handleFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refreshFeatures();
      }
    }, 60000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [refreshFeatures]);

  const getFeatureState = useCallback(
    (featureId: string): FeatureStatus => {
      const entry = featureStatuses[featureId];
      return entry?.status || 'ENABLED';
    },
    [featureStatuses]
  );

  const isFeatureEnabled = useCallback(
    (featureId: string): boolean => {
      return getFeatureState(featureId) === 'ENABLED';
    },
    [getFeatureState]
  );

  const isFeatureMaintenance = useCallback(
    (featureId: string): boolean => {
      return getFeatureState(featureId) === 'MAINTENANCE';
    },
    [getFeatureState]
  );

  const getMaintenanceMessage = useCallback(
    (featureId: string): string | null => {
      const entry = featureStatuses[featureId];
      return entry?.maintenance_message || null;
    },
    [featureStatuses]
  );

  const hasRoleFeatureAccess = useCallback(
    (featureId: string, targetRole?: string | null): boolean => {
      // 1. Layer 1: Global Feature Availability (DISABLED / MAINTENANCE blocks all access)
      const state = getFeatureState(featureId);
      if (state !== 'ENABLED') {
        return false;
      }

      // Public consumer-facing features (Online Booking, Retail Shop) are accessible to all visitors
      // when globally ENABLED (guests/unauthenticated users, customers, and previewing staff/admins).
      const PUBLIC_FEATURES = ['customer_booking', 'public_shop'];
      if (PUBLIC_FEATURES.includes(featureId)) {
        return true;
      }

      const activeRole = targetRole !== undefined ? targetRole : role;
      if (!activeRole) return false;

      const normalized = normalizeSystemRole(activeRole);

      // System Admin superusers have platform-wide administrative access
      if (normalized === 'System Admin') {
        return true;
      }

      // 2. Layer 2: Technical Compatibility Rules
      const rule = FEATURE_ROLE_RULES[featureId]?.[normalized as SystemRole];
      if (rule?.isUnavailable) {
        return false;
      }

      // 3. Layer 3: Protected Core Features (e.g. auth for all staff, sys_admin for System Admin)
      if (rule?.isLocked) {
        return true;
      }

      // 4. Layer 4: Role Feature Access from Database
      const entry = featureStatuses[featureId];
      const affectedRoles = entry?.affected_roles;
      if (Array.isArray(affectedRoles)) {
        return affectedRoles.some((r) => {
          if (r === normalized) return true;
          if (r === 'Shop Admin' && (activeRole === 'Admin' || activeRole === 'ShopAdmin')) return true;
          if (r === 'System Admin' && activeRole === 'SystemAdmin') return true;
          return false;
        });
      }

      return false;
    },
    [featureStatuses, getFeatureState, role]
  );

  const hasAccess = useCallback(
    (featureId: string): boolean => {
      return hasRoleFeatureAccess(featureId, role);
    },
    [hasRoleFeatureAccess, role]
  );

  const value = {
    featureStatuses,
    loading,
    error,
    refreshFeatures,
    isFeatureEnabled,
    isFeatureMaintenance,
    getFeatureState,
    getMaintenanceMessage,
    hasAccess,
    hasRoleFeatureAccess,
  };

  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
};

export const useFeatures = (): FeatureContextType => {
  const context = useContext(FeatureContext);
  if (!context) {
    throw new Error('useFeatures must be used within a FeatureProvider');
  }
  return context;
};
