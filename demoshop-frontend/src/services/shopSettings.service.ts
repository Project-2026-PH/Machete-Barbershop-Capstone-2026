import { api } from '@/config/api';
import type { ShopSettings } from '@demoshop/shared-types';

let cachedPublicSettings: ShopSettings | null = null;
let lastPublicFetchTime = 0;
let publicSettingsRequest: Promise<ShopSettings> | null = null;
const CACHE_TTL_MS = 15000; // 15 seconds

export const shopSettingsService = {
  getCachedSettings(): ShopSettings | null {
    if (cachedPublicSettings && Date.now() - lastPublicFetchTime < CACHE_TTL_MS) {
      return cachedPublicSettings;
    }
    return null;
  },

  /**
   * Fetches public storefront settings (used by landing page, booking, POS).
   */
  async getPublicSettings(forceRefresh = false): Promise<ShopSettings> {
    const now = Date.now();
    if (!forceRefresh && cachedPublicSettings && now - lastPublicFetchTime < CACHE_TTL_MS) {
      return cachedPublicSettings;
    }

    if (publicSettingsRequest) return publicSettingsRequest;

    publicSettingsRequest = (async () => {
      try {
        const res = await api.get('/api/shop/settings');
        if (res.data) {
          cachedPublicSettings = res.data;
          lastPublicFetchTime = Date.now();
          return res.data;
        }
      } catch (err) {
        console.warn('[shopSettingsService] Failed to load public settings:', err);
        if (cachedPublicSettings) return cachedPublicSettings;
      }

      // Fallback default
      return {
      shopName: "DemoShop's Barbers",
      contactEmail: "portfolio@example.invalid",
      physicalAddress: "Ground floor, SampleBranch, Brgy. Kaypian, SJDM, Bulacan",
      businessHours: [
        { day: 'Monday', openTime: '09:00', closeTime: '20:00', isOpen: true },
        { day: 'Tuesday', openTime: '09:00', closeTime: '20:00', isOpen: true },
        { day: 'Wednesday', openTime: '09:00', closeTime: '20:00', isOpen: true },
        { day: 'Thursday', openTime: '09:00', closeTime: '20:00', isOpen: true },
        { day: 'Friday', openTime: '09:00', closeTime: '20:00', isOpen: true },
        { day: 'Saturday', openTime: '09:00', closeTime: '20:00', isOpen: true },
        { day: 'Sunday', openTime: '09:00', closeTime: '20:00', isOpen: false },
      ],
      website: {
        heroHeadline: 'DEMOSHOP BARBERSHOP',
        heroSubtext: 'Classic grooming and modern barbering at SampleBranch, San Jose del Monte, Bulacan. Book your next cut with DemoShop.',
        heroImageUrl: undefined,
        heroCtaPrimary: 'Book Appointment',
        heroCtaSecondary: 'View Services',
        termsLastUpdated: 'Feb 2026',
        privacyLastUpdated: 'Feb 2026',
      },
      };
    })();

    try {
      return await publicSettingsRequest;
    } finally {
      publicSettingsRequest = null;
    }
  },

  /**
   * Fetches admin configuration for Shop Admin settings workspace.
   */
  async getAdminSettings(): Promise<ShopSettings> {
    const res = await api.get('/api/admin/settings');
    return res.data;
  },

  /**
   * Updates shop configuration.
   */
  async updateAdminSettings(payload: Partial<ShopSettings>): Promise<ShopSettings> {
    const res = await api.put('/api/admin/settings', payload);
    cachedPublicSettings = res.data;
    lastPublicFetchTime = Date.now();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('demoshop:shop-settings-updated', { detail: res.data }));
    }
    return res.data;
  },

  /**
   * Uploads an image asset (QR code, hero banner, gallery picture, about photo).
   */
  async uploadMedia(file: File, category = 'general'): Promise<{ publicUrl: string; fileName: string }> {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('category', category);

    const res = await api.post('/api/admin/settings/upload-media', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  },

  /**
   * Invalidate local client cache.
   */
  invalidateCache() {
    cachedPublicSettings = null;
    lastPublicFetchTime = 0;
  },
};

export const getAdminShopSettings = () => shopSettingsService.getAdminSettings();
export const updateAdminShopSettings = (payload: Partial<ShopSettings>) => shopSettingsService.updateAdminSettings(payload);
export const uploadShopMedia = async (file: File, category = 'general'): Promise<string> => {
  const res = await shopSettingsService.uploadMedia(file, category);
  return res.publicUrl;
};
