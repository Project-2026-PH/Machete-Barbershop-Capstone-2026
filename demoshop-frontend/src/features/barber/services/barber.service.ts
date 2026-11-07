import { api } from '@/config/api';
import type { 
    StaffDirectoryMember, 
    BarberPortfolioData, 
    BarberSpecialty, 
    BarberPortfolioItem, 
    BarberPortfolioFeedback 
} from '@demoshop/shared-types';

export type { BarberPortfolioData, BarberSpecialty, BarberPortfolioItem, BarberPortfolioFeedback };

export interface CustomerVisitRecord {
    visit_id: number;
    date: string;
    time: string;
    barber_name: string;
    service_name: string;
    status: string;
    completed_photo?: string | null;
    ref_photo?: string | null;
    styleTag: {
        base: string;
        length: string;
        accent: string;
    };
    specsNotes: string;
    addOnPreferences: string[];
}

export interface CustomerHistoryRecord {
    customer_id?: number | null;
    guest_profile_id?: number | null;
    name: string;
    mobile: string;
    guestRef: string;
    email?: string | null;
    lastVisit: string;
    last_created?: string | null;
    service_name?: string | null;
    serviceName?: string | null;
    styleTag: {
        base: string;
        length: string;
        accent: string;
    };
    specsNotes: string;
    addOnPreferences: string[];
    refPhoto: string;
    completedPhoto: string;
    visits?: CustomerVisitRecord[];
}

export interface CustomerHistoryPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface CustomerHistoryResponse {
    data: CustomerHistoryRecord[];
    pagination: CustomerHistoryPagination;
}

export interface BarberReview {
    id: string;
    customerName: string;
    rating: number;
    comment: string | null;
    date: string;
}

export interface BarberPerformanceData {
    servedCount: number;
    targetCount: number;
    rating: number | null;
    totalReviews: number;
    totalSales: number;
    reviews: BarberReview[];
}

export interface BarberEarningsReceipt {
    queueEntryId: number;
    receiptId: string;
    serviceTime: string;
    formattedTime: string;
    formattedDate: string;
    customerName: string;
    guestRef: string;
    serviceName: string;
    ticketAmount: number;
    paymentMethod: string;
    commissionRate: number;
    commissionRateLabel: string;
    barberCut: number;
}

export interface BarberEarningsResponse {
    period: 'today' | 'week' | 'month';
    totalServices: number;
    totalGrossSales: number;
    commissionRate: number;
    tierLabel: string;
    quotaThreshold: number;
    isQuotaReached: boolean;
    remainingToNextTier: number;
    netCommissionPayout: number;
    receipts: BarberEarningsReceipt[];
}

export interface BarberAvailabilityData {
    status: 'Available' | 'Serving' | 'On Break';
    barberId: number | null;
    name: string;
}

export interface BarberPublishedShift {
    id: number;
    userId: string;
    staffName?: string;
    role: 'Barber' | 'Cashier';
    shiftDate: string;
    startTime: string | null;
    endTime: string | null;
    isOff: boolean;
    source?: string;
}

export interface BarberShiftRequestData {
    id: number;
    barber_id?: number;
    request_type: 'swap' | 'time_off';
    shift_date: string;
    target_barber_name?: string | null;
    target_date?: string | null;
    reason: string;
    status: 'pending' | 'approved' | 'declined';
    cooldown_until?: string | null;
    admin_notes?: string | null;
    created_at: string;
}

export interface HaircutSpecsPayload {
    base_style?: string;
    haircut_length?: string;
    accent_style?: string;
    specs_notes?: string;
    haircut_photo_url?: string;
}

// In-Memory client caching for Customer History directory
const historyCache = new Map<string, { data: CustomerHistoryResponse; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes cache TTL

export const barberService = {
    /**
     * Searches customer history with in-memory caching and pagination (limit 6)
     */
    async searchCustomerHistory(
        query: string = '',
        page: number = 1,
        limit: number = 12,
        forceRefresh: boolean = false
    ): Promise<CustomerHistoryResponse> {
        const cacheKey = `${query.trim().toLowerCase()}_p${page}_l${limit}`;

        if (!forceRefresh && historyCache.has(cacheKey)) {
            const cached = historyCache.get(cacheKey)!;
            if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
                return cached.data;
            }
        }

        const response = await api.get<any>('/api/barber/customer-history', {
            params: { search: query.trim(), page, limit }
        });

        const rawData = response.data;
        let formattedResult: CustomerHistoryResponse;

        if (rawData && Array.isArray(rawData.data)) {
            formattedResult = {
                data: rawData.data,
                pagination: {
                    total: rawData.total ?? rawData.data.length,
                    page: rawData.page ?? page,
                    limit: rawData.limit ?? limit,
                    totalPages: rawData.totalPages ?? (Math.ceil((rawData.total || rawData.data.length) / limit) || 1)
                }
            };
        } else if (Array.isArray(rawData)) {
            // Fallback for flat array responses
            const total = rawData.length;
            const offset = (page - 1) * limit;
            const slice = rawData.slice(offset, offset + limit);
            formattedResult = {
                data: slice,
                pagination: {
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit) || 1
                }
            };
        } else {
            formattedResult = {
                data: [],
                pagination: { total: 0, page: 1, limit, totalPages: 1 }
            };
        }

        historyCache.set(cacheKey, { data: formattedResult, timestamp: Date.now() });
        return formattedResult;
    },

    /**
     * Invalidates the customer history client cache
     */
    invalidateCustomerHistoryCache(): void {
        historyCache.clear();
    },

    /**
     * Retrieves itemized earnings breakdown and commission tier details for a selected period
     */
    async getEarnings(period: 'today' | 'week' | 'month' = 'today'): Promise<BarberEarningsResponse> {
        const response = await api.get<BarberEarningsResponse>('/api/barber/earnings', {
            params: { period }
        });
        return response.data;
    },

    /**
     * Uploads post-cut haircut photo to storage
     */
    async uploadHaircutPhoto(file: File, queueId?: number): Promise<{ haircut_photo_url: string }> {
        const formData = new FormData();
        formData.append('haircut_photo', file);
        if (queueId) {
            formData.append('queueId', String(queueId));
        }

        const response = await api.post<{ haircut_photo_url: string }>('/api/barber/upload-photo', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
        return response.data;
    },

    /**
     * Completes an active queue service with technical haircut specs and photo
     */
    async completeService(queueId: number, specs?: HaircutSpecsPayload): Promise<any> {
        const response = await api.post(`/api/queue/${queueId}/complete`, specs || {});
        this.invalidateCustomerHistoryCache();
        return response.data;
    },

    /**
     * Retrieves logged-in barber's performance metrics and reviews
     */
    async getPerformance(): Promise<BarberPerformanceData> {
        const response = await api.get<BarberPerformanceData>('/api/barber/performance');
        return response.data;
    },

    /**
     * Retrieves logged-in barber's operational availability status
     */
    async getAvailability(barberId?: number | null): Promise<BarberAvailabilityData> {
        const response = await api.get<BarberAvailabilityData>('/api/barber/availability', {
            params: barberId ? { barberId } : undefined
        });
        return response.data;
    },

    /**
     * Updates barber's operational availability status
     */
    async updateAvailability(status: 'Available' | 'Serving' | 'On Break', barberId?: number | null): Promise<BarberAvailabilityData> {
        const response = await api.patch<BarberAvailabilityData>('/api/barber/availability', { status, barberId });
        return response.data;
    },

    /**
     * Submits a shift swap or time off request
     */
    async submitShiftRequest(data: {
        requestType: 'swap' | 'time_off';
        shiftDate: string;
        targetBarberName?: string;
        targetDate?: string;
        reason: string;
    }): Promise<BarberShiftRequestData> {
        const response = await api.post<BarberShiftRequestData>('/api/barber/shift-request', data);
        return response.data;
    },

    /**
     * Retrieves current active shift request for the barber
     */
    async getActiveShiftRequest(): Promise<BarberShiftRequestData | null> {
        const response = await api.get<BarberShiftRequestData | null>('/api/barber/shift-request/active');
        return response.data;
    },

    async getMySchedule(from: string, to: string): Promise<BarberPublishedShift[]> {
        const response = await api.get<BarberPublishedShift[]>('/api/barber/my-schedule', {
            params: { from, to },
        });
        return Array.isArray(response.data) ? response.data : [];
    },

    /**
     * Acknowledges a declined shift request
     */
    async acknowledgeShiftRequest(requestId: number): Promise<{ success: boolean }> {
        const response = await api.post<{ success: boolean }>(`/api/barber/shift-request/${requestId}/acknowledge`);
        return response.data;
    },

    /**
     * Retrieves all shift requests for shop admin / cashier view
     */
    async getAllShiftRequests(branchId?: number): Promise<BarberShiftRequestData[]> {
        const response = await api.get<BarberShiftRequestData[]>('/api/barber/shift-requests', {
            params: branchId ? { branchId } : undefined,
        });
        return response.data;
    },

    /**
     * Reviews (approves or declines) a shift request with optional admin notes
     */
    async reviewShiftRequest(requestId: number, action: 'approve' | 'decline', adminNotes?: string): Promise<BarberShiftRequestData> {
        const response = await api.patch<BarberShiftRequestData>(`/api/barber/shift-requests/${requestId}/review`, {
            action,
            adminNotes,
        });
        return response.data;
    },

    /**
     * Clears all shift requests (for resetting test environment)
     */
    async clearAllShiftRequests(): Promise<{ success: boolean; deleted: number }> {
        const response = await api.delete<{ success: boolean; deleted: number }>('/api/barber/shift-requests');
        return response.data;
    },

    /**
     * Retrieves all staff members (Barbers & Cashiers) for admin staff management
     */
    async getStaffMembers(branchId?: number): Promise<StaffDirectoryMember[]> {
        const response = await api.get<StaffDirectoryMember[]>('/api/barber/staff', {
            params: branchId ? { branchId } : undefined,
        });
        return response.data;
    },

    /**
     * Creates a new staff member.
     */
    async createStaff(data: {
        name: string;
        email: string;
        password: string;
        role: 'Barber' | 'Cashier' | 'Inventory Manager';
        specialty?: string;
        branchId?: number;
    }): Promise<any> {
        const response = await api.post('/api/admin/staff', data);
        return response.data;
    },

    /**
     * Updates an existing staff member.
     */
    async updateStaff(userId: string, data: {
        name?: string;
        email?: string;
        role?: 'Barber' | 'Cashier' | 'Inventory Manager';
        specialty?: string;
        branchId?: number;
    }): Promise<any> {
        const response = await api.put(`/api/admin/staff/${userId}`, data);
        return response.data;
    },

    /**
     * Resets a staff member's password
     */
    async resetStaffPassword(userId: string, newPassword: string): Promise<any> {
        const response = await api.post(`/api/admin/staff/${userId}/reset-password`, {
            newPassword,
        });
        return response.data;
    },

    /**
     * Suspends a staff member account
     */
    async suspendStaff(userId: string): Promise<any> {
        const response = await api.put(`/api/admin/staff/${userId}/suspend`);
        return response.data;
    },

    /**
     * Restores a suspended staff member account
     */
    async restoreStaff(userId: string): Promise<any> {
        const response = await api.put(`/api/admin/staff/${userId}/restore`);
        return response.data;
    },

    /**
     * Updates cashier optional inventory management access
     */
    async updateCashierInventoryAccess(userId: string, canAccess: boolean): Promise<any> {
        const response = await api.put(`/api/admin/staff/${userId}/inventory-access`, {
            canAccess,
        });
        return response.data;
    },

    /**
     * Updates barber administrative status override (Cashier, Admin, ShopAdmin, System Admin, Owner)
     */
    async updateAdministrativeStatus(barberId: number, status: string, reason?: string): Promise<any> {
        const response = await api.patch(`/api/barber/${barberId}/admin-status`, {
            status,
            reason,
        });
        return response.data;
    },

    /**
     * Retrieves portfolio data for currently authenticated barber
     */
    async getPortfolio(): Promise<BarberPortfolioData> {
        const response = await api.get('/api/barber/portfolio');
        return response.data;
    },

    /**
     * Retrieves public-safe portfolio data for a specific barber
     */
    async getPublicPortfolio(barberId: number): Promise<BarberPortfolioData> {
        const response = await api.get(`/api/barber/${barberId}/portfolio/public`);
        return response.data;
    },

    /**
     * Updates the barber's professional bio
     */
    async updateBio(bio: string): Promise<{ bio: string }> {
        const response = await api.patch('/api/barber/portfolio/bio', { bio });
        return response.data;
    },

    /**
     * Synchronizes barber specialties from real DemoShop service IDs
     */
    async updateSpecialties(serviceIds: number[]): Promise<BarberSpecialty[]> {
        const response = await api.put('/api/barber/portfolio/specialties', { serviceIds });
        return response.data;
    },

    /**
     * Uploads a new portfolio photo with optional service association and caption
     */
    async addPortfolioWork(formData: FormData): Promise<BarberPortfolioItem> {
        const response = await api.post('/api/barber/portfolio/work', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        return response.data;
    },

    /**
     * Updates service association or caption for an existing portfolio item
     */
    async updatePortfolioWork(itemId: number, data: { serviceId?: number | null; caption?: string }): Promise<BarberPortfolioItem> {
        const response = await api.patch(`/api/barber/portfolio/work/${itemId}`, data);
        return response.data;
    },

    /**
     * Removes an item from the barber's portfolio with storage cleanup
     */
    async deletePortfolioWork(itemId: number): Promise<{ success: boolean; message: string }> {
        const response = await api.delete(`/api/barber/portfolio/work/${itemId}`);
        return response.data;
    },

    /**
     * Fetches real DemoShop services catalog for specialties & service associations
     */
    async getAllServices(): Promise<Array<{ service_id: number; title: string; category: string; price: number; duration_minutes?: number }>> {
        const response = await api.get('/api/services');
        return response.data;
    }
};
