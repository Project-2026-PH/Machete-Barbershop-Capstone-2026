import { api } from '@/config/api';
import { cachedCashierRequest } from './shared-request-cache';

export interface ServiceCatalogRecord {
  service_id: string | number;
  title: string;
  price: string | number;
  category?: string;
  sub_category?: string;
  duration_minutes?: string | number;
}

export interface PublicBarberRecord {
  barber_id?: string | number;
  id?: string | number;
  name?: string;
  first_name?: string;
  last_name?: string;
  eta_minutes?: string | number;
  etaMinutes?: string | number;
}

export interface RetailCatalogRecord {
  id?: string | number;
  productId?: string | number;
  name: string;
  category?: string;
  ownership?: string;
  unit?: string;
  costPrice?: number;
  retailPrice?: number | null;
  currentStock?: number;
}

export const fetchServiceCatalog = () => cachedCashierRequest(
  'catalog:services',
  () => api.get<ServiceCatalogRecord[]>('/api/services'),
  5 * 60_000,
);

export const fetchRetailCatalog = (scope = 'current') => cachedCashierRequest(
  `catalog:retail:${scope}`,
  () => api.get<RetailCatalogRecord[]>('/api/inventory/retail/catalog'),
  30_000,
);

export const fetchPublicBarbers = (branchId?: number) => cachedCashierRequest(
  `barbers:${branchId ?? 'all'}`,
  () => api.get<PublicBarberRecord[]>(branchId ? `/api/queue/public/barbers?branchId=${branchId}` : '/api/queue/public/barbers'),
  30_000,
);
