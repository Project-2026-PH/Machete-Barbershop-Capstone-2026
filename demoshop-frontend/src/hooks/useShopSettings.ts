import { createContext, useContext, useState, useEffect } from 'react';
import { shopSettingsService } from '@/services/shopSettings.service';
import type { ShopSettings } from '@demoshop/shared-types';

export const ShopSettingsOverrideContext = createContext<ShopSettings | null>(null);

export const useShopSettings = () => {
  const override = useContext(ShopSettingsOverrideContext);
  const [settings, setSettings] = useState<ShopSettings | null>(() => override || shopSettingsService.getCachedSettings());
  const [loading, setLoading] = useState(() => !override && !shopSettingsService.getCachedSettings());

  useEffect(() => {
    if (override) {
      setSettings(override);
      setLoading(false);
      return;
    }

    let isMounted = true;
    shopSettingsService.getPublicSettings().then((data) => {
      if (isMounted) {
        setSettings(data);
        setLoading(false);
      }
    });

    const handleSettingsUpdated = () => {
      shopSettingsService.getPublicSettings(true).then((data) => {
        if (isMounted) setSettings(data);
      });
    };

    window.addEventListener('demoshop:shop-settings-updated', handleSettingsUpdated);
    return () => {
      isMounted = false;
      window.removeEventListener('demoshop:shop-settings-updated', handleSettingsUpdated);
    };
  }, [override]);

  if (override) {
    return { settings: override, loading: false };
  }

  return { settings, loading };
};
