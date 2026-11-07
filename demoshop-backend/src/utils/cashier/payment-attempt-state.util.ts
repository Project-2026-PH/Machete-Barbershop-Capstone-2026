import { AppError } from '../error/AppError';

export type PaymentAttemptStatus =
  | 'pending_verification'
  | 'automated_review_passed'
  | 'flagged'
  | 'rejected'
  | 'manually_confirmed';

const transitions: Record<PaymentAttemptStatus, PaymentAttemptStatus[]> = {
  pending_verification: ['automated_review_passed', 'flagged', 'rejected', 'manually_confirmed'],
  automated_review_passed: ['flagged', 'rejected', 'manually_confirmed'],
  flagged: ['rejected', 'manually_confirmed'],
  rejected: [],
  manually_confirmed: [],
};

export const assertPaymentAttemptTransition = (
  from: PaymentAttemptStatus,
  to: PaymentAttemptStatus,
): void => {
  if (!transitions[from]?.includes(to)) {
    throw new AppError(`Payment attempt cannot transition from '${from}' to '${to}'.`, 409);
  }
};

export const isOpenPaymentAttempt = (status: PaymentAttemptStatus): boolean =>
  ['pending_verification', 'automated_review_passed', 'flagged'].includes(status);
