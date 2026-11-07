export type BottleStatus = 'issued' | 'returned';

export const bottleLifecycleTransitions: Record<BottleStatus, BottleStatus[]> = {
  issued: ['returned'],
  returned: [],
};

export const canReturnBottle = (status: BottleStatus): boolean => status === 'issued';
