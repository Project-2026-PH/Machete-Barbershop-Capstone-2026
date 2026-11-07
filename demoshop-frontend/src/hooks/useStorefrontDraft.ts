import { useState, useEffect, useCallback } from 'react';
import type { ShopSettings } from '@demoshop/shared-types';
import { getAdminShopSettings, updateAdminShopSettings } from '@/services/shopSettings.service';
import { useToast } from '@/components/feedback/ToastContext';

export interface UseStorefrontDraftOptions {
  initialSettings?: ShopSettings | null;
  onPublishSettings?: () => Promise<void>;
  isDirty?: boolean;
  dirtyDomains?: string[];
}

export function useStorefrontDraft(options?: UseStorefrontDraftOptions) {
  const { addToast } = useToast();

  const [draftConfig, setDraftConfig] = useState<ShopSettings | null>(
    options?.initialSettings || null
  );
  const [localIsDirty, setLocalIsDirty] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Sync with initialSettings prop if passed and updated
  useEffect(() => {
    if (options?.initialSettings) {
      setDraftConfig(options.initialSettings);
    }
  }, [options?.initialSettings]);

  // Fetch admin settings if no initialSettings were provided
  const fetchSettings = useCallback(async () => {
    try {
      const data = await getAdminShopSettings();
      setDraftConfig(data);
    } catch (err) {
      console.warn('[useStorefrontDraft] Could not fetch shop settings:', err);
    }
  }, []);

  useEffect(() => {
    if (!options?.initialSettings) {
      void fetchSettings();
    }

    const handleUpdate = () => void fetchSettings();
    window.addEventListener('demoshop:shop-settings-updated', handleUpdate);
    return () => {
      window.removeEventListener('demoshop:shop-settings-updated', handleUpdate);
    };
  }, [options?.initialSettings, fetchSettings]);

  const isDirty = options?.isDirty !== undefined ? options.isDirty : localIsDirty;

  const resetDraft = useCallback(() => {
    setLocalIsDirty(false);
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }, []);

  const publishChanges = useCallback(async () => {
    setIsPublishing(true);
    try {
      if (options?.onPublishSettings) {
        await options.onPublishSettings();
      } else if (draftConfig) {
        await updateAdminShopSettings(draftConfig);
      }
      setLocalIsDirty(false);
      addToast({
        type: 'success',
        title: 'Storefront Published',
        message: 'All storefront configurations, service cards, and hours are now live for customers.',
      });
      window.dispatchEvent(new CustomEvent('demoshop:shop-settings-updated'));
    } catch (err: any) {
      console.error('[useStorefrontDraft] Publish failed:', err);
      addToast({
        type: 'error',
        title: 'Publish Failed',
        message: err?.response?.data?.message || err?.message || 'Failed to publish storefront changes.',
      });
      throw err;
    } finally {
      setIsPublishing(false);
    }
  }, [options?.onPublishSettings, draftConfig, addToast]);

  return {
    draftConfig,
    setDraftConfig,
    isDirty,
    setIsDirty: setLocalIsDirty,
    isPublishing,
    resetDraft,
    publishChanges,
  };
}
