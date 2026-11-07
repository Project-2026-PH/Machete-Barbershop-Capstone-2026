export interface CalendarService {
  id: string | number;
  title: string;
  description: string;
  price: string | number;
  duration?: string;
  category?: string;
}

export interface CalendarServiceCategory {
  category: string;
  services: CalendarService[];
}

/**
 * Groups flat service database rows into categories.
 */
export const groupServicesByCategory = (services: any[]): CalendarServiceCategory[] => {
  if (!Array.isArray(services)) return [];

  const grouped = services.reduce((acc: Record<string, CalendarService[]>, service: any) => {
    const cat = service.category || "OTHER";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push({
      ...service,
      id: service.service_id || service.id
    });
    return acc;
  }, {});

  return Object.keys(grouped).map(key => ({
    category: key,
    services: grouped[key]
  }));
};

/**
 * Parses date representation (e.g. 'Oct 26') and returns its components.
 */
export const parseShortDate = (dateStr: string, monthNames: string[]): { monthIndex: number; day: number } | null => {
  if (!dateStr) return null;

  if (dateStr === 'Today') {
    const today = new Date();
    return { monthIndex: today.getMonth(), day: today.getDate() };
  }

  const parts = dateStr.split(' ');
  if (parts.length === 2) {
    const mIdx = monthNames.findIndex(m => m.toLowerCase().startsWith(parts[0].toLowerCase()));
    const day = parseInt(parts[1], 10);
    if (mIdx !== -1 && !isNaN(day)) {
      return { monthIndex: mIdx, day };
    }
  }
  return null;
};

/**
 * Performant utility to check if a day is in the past compared to today's midnight.
 */
export const isPastDate = (day: number, currentDate: Date, todayMidnight: Date): boolean => {
  const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
  return dateObj < todayMidnight;
};

/**
 * Performant utility to check if a day is beyond the maximum allowed booking date.
 */
export const isBeyondMaxDate = (day: number, currentDate: Date, maxDate: Date): boolean => {
  const dateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
  return dateObj > maxDate;
};

/**
 * Formats a given date and day into standard string representation.
 */
export const formatDateString = (monthName: string, day: number): string => {
  return `${monthName} ${day}`;
};
