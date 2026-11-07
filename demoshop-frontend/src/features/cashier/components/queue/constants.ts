import { QUEUE_STATUS } from './types';

export const BARBER_COLORS = ['#c9a84c', '#4c9ac9', '#4caf82', '#c94c7a', '#9b6ae0'];

export const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  [QUEUE_STATUS.WAITING]: { label: 'Waiting', dot: '#555' },
  [QUEUE_STATUS.SERVING]: { label: 'Serving', dot: '#c9a84c' },
  [QUEUE_STATUS.DONE]: { label: 'Done', dot: '#4caf82' },
  [QUEUE_STATUS.NOSHOW]: { label: 'No Show', dot: '#e05555' },
};

export const formatMinutes = (minutes: number): string =>
  minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
