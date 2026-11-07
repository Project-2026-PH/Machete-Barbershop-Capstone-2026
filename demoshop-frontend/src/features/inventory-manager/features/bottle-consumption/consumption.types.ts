import type { BottleLifecycle } from '../bottle-lifecycle/lifecycle.types';

export interface GroupedBottleHistory {
  itemName: string;
  barberName: string;
  totalQuantity: number;
  totalCustomers: number;
  lastReturnedAt: string;
  returnsCount: number;
  records: BottleLifecycle[];
}

export interface ConsumptionStats {
  totalReturns: number;
  totalCustomers: number;
  uniqueBarbers: number;
}
