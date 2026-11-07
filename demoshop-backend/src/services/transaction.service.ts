import { transactionRepository, type TransactionHistoryCursor } from '../repositories/transaction.repository';
import type {
  TransactionFilterDTO,
  TransactionHistoryItem,
  TransactionHistoryResponse,
  TransactionItemLine,
} from '@demoshop/shared-types';
import logger from '../utils/general/logger';
import { AppError } from '../utils/error/AppError';
import { getAdminClient } from '../config/supabase';
import { validateReceiptStoragePath } from './payment-attempt.service';

const decodeTransactionCursor = (value?: string): TransactionHistoryCursor | undefined => {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<TransactionHistoryCursor>;
    const transactionId = parsed.transactionId;
    if (
      parsed.direction !== 'next' ||
      typeof parsed.createdAt !== 'string' ||
      Number.isNaN(Date.parse(parsed.createdAt)) ||
      typeof transactionId !== 'number' ||
      !Number.isInteger(transactionId) ||
      transactionId <= 0
    ) {
      throw new Error('invalid cursor');
    }
    return {
      createdAt: new Date(parsed.createdAt).toISOString(),
      transactionId: transactionId as number,
      direction: 'next',
    };
  } catch {
    throw new AppError('Invalid transaction cursor.', 400);
  }
};

export class TransactionService {
  async getReceiptUrl(transactionId: number, user?: any): Promise<{ url: string; expiresInSeconds: number }> {
    if (!Number.isInteger(transactionId) || transactionId <= 0) {
      throw new AppError('Receipt evidence is unavailable.', 404);
    }
    const branchId = user?.role === 'System Admin' || user?.branch_id == null
      ? undefined
      : Number(user.branch_id);
    if (branchId !== undefined && (!Number.isInteger(branchId) || branchId <= 0)) {
      throw new AppError('Receipt evidence is unavailable.', 404);
    }
    const receipt = await transactionRepository.findReceiptPathForTransaction(transactionId, branchId);
    if (!receipt) throw new AppError('Receipt evidence is unavailable.', 404);

    // Legacy online booking submissions persist the proof as an image data URL
    // on the queue entry instead of a private Storage object path.
    if (receipt.proofImageUrl) {
      if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(receipt.proofImageUrl)) {
        throw new AppError('Receipt evidence is unavailable.', 404);
      }
      return { url: receipt.proofImageUrl, expiresInSeconds: 0 };
    }
    if (!receipt.path) throw new AppError('Receipt evidence is unavailable.', 404);

    const paymentAttemptPathIsValid = validateReceiptStoragePath(receipt.path, receipt.branchId);
    const reservationPrefix = `branches/${receipt.branchId}/reservation-fees/${transactionId}/`;
    const reservationPathIsValid = receipt.path.startsWith(reservationPrefix)
      && /^[a-f0-9]{64}\.(?:jpg|png)$/i.test(receipt.path.slice(reservationPrefix.length));
    if (!paymentAttemptPathIsValid && !reservationPathIsValid) {
      throw new AppError('Receipt evidence is unavailable.', 404);
    }

    const signed = await getAdminClient().storage.from('receipts').createSignedUrl(receipt.path, 60);
    if (signed.error || !signed.data?.signedUrl) {
      throw new AppError('Receipt review link could not be created.', 502);
    }
    return { url: signed.data.signedUrl, expiresInSeconds: 60 };
  }

  /**
   * Retrieves transaction history with multi-faceted filtering, formatted line items,
   * commission splits, and aggregated KPI metrics.
   */
  async getTransactionHistory(
    filters: TransactionFilterDTO,
    user?: any,
  ): Promise<TransactionHistoryResponse> {
    try {
      // Branch scoping: Non-system admins can only view their assigned branch
      let branchId = filters.branchId != null ? Number(filters.branchId) : undefined;
      if (user && user.role !== 'System Admin' && user.branch_id != null) {
        branchId = Number(user.branch_id);
      }

      const page = Math.max(1, Number(filters.page) || 1);
      const limit = Math.max(1, Math.min(100, Number(filters.limit) || 25));
      const sortBy = filters.sortBy || 'date_desc';
      const cursor = decodeTransactionCursor(filters.cursor);
      if (cursor && sortBy !== 'date_desc' && sortBy !== 'date_asc') {
        throw new AppError('Cursor pagination is available only for date sorting.', 400);
      }

      const repoResult = await transactionRepository.getTransactionHistory({
        branchId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        search: filters.search,
        channel: filters.channel,
        paymentMethod: filters.paymentMethod,
        barberId: filters.barberId,
        status: filters.status,
        category: filters.category,
        minAmount: filters.minAmount,
        maxAmount: filters.maxAmount,
        page,
        limit,
        cursor,
        sortBy,
      });

      const formattedTransactions: TransactionHistoryItem[] = repoResult.transactions.map((row: any) => {
        const totalAmount = Number(Number(row.total_amount || 0).toFixed(2));
        const serviceLines: TransactionItemLine[] = (Array.isArray(row.service_lines) ? row.service_lines : []).map(
          (s: any, idx: number) => ({
            id: s.id || `srv-${row.id}-${idx}`,
            type: 'service' as const,
            name: s.name || 'Barber Service',
            category: s.category || 'Haircuts & Styling',
            quantity: Number(s.quantity || 1),
            unitPrice: Number(Number(s.unitPrice || 0).toFixed(2)),
            totalPrice: Number(Number(s.totalPrice || 0).toFixed(2)),
            discount: Number(s.discount || 0),
            customSpecification: s.customSpecification ? String(s.customSpecification) : null,
          })
        );

        const retailLines: TransactionItemLine[] = (Array.isArray(row.retail_lines) ? row.retail_lines : []).map(
          (r: any, idx: number) => ({
            id: r.id || `ret-${row.id}-${idx}`,
            type: 'product' as const,
            name: r.name || 'Retail Product',
            category: r.category || 'Customer Retail',
            quantity: Number(r.quantity || 1),
            unitPrice: Number(Number(r.unitPrice || 0).toFixed(2)),
            totalPrice: Number(Number(r.totalPrice || 0).toFixed(2)),
            discount: Number(r.discount || 0),
          })
        );

        let lineItems = [...serviceLines, ...retailLines];
        if (lineItems.length === 0) {
          lineItems = [
            {
              id: `def-${row.id}`,
              type: row.transaction_type === 'retail' ? 'product' : 'service',
              name: row.transaction_type === 'retail' ? 'Retail Purchase' : 'Barbershop Service',
              category: row.transaction_type === 'retail' ? 'Customer Retail' : 'Services',
              quantity: 1,
              unitPrice: totalAmount,
              totalPrice: totalAmount,
              discount: 0,
            },
          ];
        }

        const itemCount = lineItems.reduce((acc, item) => acc + item.quantity, 0);

        let itemsSummary = lineItems[0].name;
        if (lineItems.length === 2) {
          itemsSummary = `${lineItems[0].name} + ${lineItems[1].name}`;
        } else if (lineItems.length > 2) {
          itemsSummary = `${lineItems[0].name} (+${lineItems.length - 1} items)`;
        }

        // Commission allocation: 40% standard base for assigned barber on service revenue
        const serviceSubtotal = serviceLines.reduce((acc, item) => acc + item.totalPrice, 0);
        const hasBarber = row.barber_id != null && row.barber_name && row.barber_name !== 'Unassigned';
        const barberCommission = hasBarber ? Number((serviceSubtotal * 0.40).toFixed(2)) : 0;
        const shopNetSplit = Number((totalAmount - barberCommission).toFixed(2));

        const channel: TransactionHistoryItem['channel'] = ['walk-in', 'online', 'retail'].includes(row.channel) ? row.channel : 'unknown';
        const channelBadge =
          channel === 'online'
            ? 'Online Booking'
            : channel === 'retail'
            ? 'Retail Only'
            : channel === 'walk-in'
              ? row.is_manual_reservation ? 'Walk-in Reservation' : 'Walk-In'
              : 'Unknown origin';

        const dateStr = (row.date || '2026-09-24').replace(/-/g, '');
        const referenceNumber =
          row.receipt_number ||
          (row.gcash_ref_no ? `TXN-${row.gcash_ref_no}` : `TXN-${dateStr}-${String(row.id).padStart(4, '0')}`);

        return {
          id: Number(row.id),
          referenceNumber,
          invoiceId: row.receipt_number || `INV-${String(row.id).padStart(5, '0')}`,
          createdAt: row.created_at,
          formattedDate: row.formatted_date || row.date,
          formattedTime: row.formatted_time || '12:00 PM',
          channel,
          channelBadge,
          status: 'completed' as const,
          customer: {
            id: row.customer_id || null,
            name: row.customer_name || 'Walk-in Guest',
            phone: row.customer_phone || null,
            email: row.customer_email || null,
            isGuest: !row.customer_id,
          },
          barber: hasBarber
            ? {
                id: Number(row.barber_id),
                name: row.barber_name,
                avatarUrl: row.barber_avatar || null,
              }
            : null,
          cashier: row.cashier_user_id
            ? {
                id: row.cashier_user_id,
                name: row.cashier_name || 'Cashier',
              }
            : null,
          itemsSummary,
          itemCount,
          lineItems,
          paymentMethod: row.payment_method || 'Cash',
          paymentMethodDisplay: row.payment_method || 'Cash',
          totalAmount,
          cashReceivedAmount: row.cash_received_amount == null ? null : Number(Number(row.cash_received_amount).toFixed(2)),
          cashChangeAmount: row.cash_change_amount == null ? null : Number(Number(row.cash_change_amount).toFixed(2)),
          subtotal: totalAmount,
          tax: 0,
          tip: 0,
          discounts: 0,
          paymentReference: row.gcash_ref_no || null,
          receiptAvailable: row.receipt_available === true,
          queueEntryId: row.queue_entry_id || null,
          appointmentCreatedAt: row.appointment_created_at || null,
          serviceCompletedAt: row.service_completed_at || null,
          barberCommission,
          shopNetSplit,
        };
      });

      const total = repoResult.total;
      const totalPages = Math.ceil(total / limit) || 1;

      return {
        transactions: formattedTransactions,
        metrics: repoResult.metrics,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          nextCursor: repoResult.nextCursor ?? null,
          paginationMode: cursor || repoResult.nextCursor ? 'cursor' : 'offset',
        },
      };
    } catch (error) {
      logger.error('[TransactionService] getTransactionHistory failed', { error, filters });
      throw error;
    }
  }
}

export const transactionService = new TransactionService();
