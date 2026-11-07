import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@/components/feedback/ToastContext';
import { errorMessage } from '@/features/inventory-manager/shared/utils/formatting';
import { useInventoryRealtime } from '@/features/inventory-manager/shared/hooks/useInventoryRealtime';
import type { BottleLifecycle, InventoryManagerBarber } from '@/features/inventory-manager/features/bottle-lifecycle/lifecycle.types';
import { listInventoryBarbers } from '@/features/inventory-manager/features/bottle-lifecycle/lifecycle.service';
import { loadBottleConsumptionHistory } from '../consumption.service';
import type { ConsumptionStats, GroupedBottleHistory } from '../consumption.types';

export const useBottleConsumption = () => {
  const { addToast } = useToast();
  const [records, setRecords] = useState<BottleLifecycle[]>([]);
  const [barbers, setBarbers] = useState<InventoryManagerBarber[]>([]);
  const [selectedBarberIds, setSelectedBarberIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [consumptionResponse, barberResponse] = await Promise.all([
        loadBottleConsumptionHistory(),
        listInventoryBarbers(),
      ]);
      setRecords(Array.isArray(consumptionResponse.data) ? consumptionResponse.data : []);
      setBarbers(Array.isArray(barberResponse.data) ? barberResponse.data : []);
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Consumption history could not be loaded',
        message: errorMessage(error, 'Please try again.'),
      });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useInventoryRealtime({
    channelName: 'inventory-manager-bottle-consumption-sync',
    tables: ['bottle_lifecycle_logs'],
    windowEvents: ['demoshop:bottle-lifecycle-changed'],
    onReload: load,
  });

  const filteredRecords = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return records.filter(
      (r) =>
        (selectedBarberIds.length === 0 || selectedBarberIds.includes(String(r.barberId))) &&
        (!query ||
          r.itemName?.toLowerCase().includes(query) ||
          r.barberName?.toLowerCase().includes(query) ||
          r.notes?.toLowerCase().includes(query)),
    );
  }, [records, searchQuery, selectedBarberIds]);

  const groupedHistory = useMemo(() => {
    const map = new Map<string, GroupedBottleHistory>();

    filteredRecords.forEach((record) => {
      const key = `${record.itemName}-${record.barberName}`;
      const current: GroupedBottleHistory = map.get(key) || {
        itemName: record.itemName,
        barberName: record.barberName,
        totalQuantity: 0,
        totalCustomers: 0,
        lastReturnedAt: record.returnedAt || record.issuedAt,
        returnsCount: 0,
        records: [] as BottleLifecycle[],
      };

      if (record.returnedAt && new Date(record.returnedAt) > new Date(current.lastReturnedAt)) {
        current.lastReturnedAt = record.returnedAt;
      }

      current.returnsCount += 1;
      current.records.push(record);

      current.totalQuantity += record.quantity;
      if (record.customersServed && record.customersServed > 0) current.totalCustomers += record.customersServed;
      map.set(key, current);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastReturnedAt).getTime() - new Date(a.lastReturnedAt).getTime(),
    );
  }, [filteredRecords]);

  const stats = useMemo<ConsumptionStats>(() => {
    const totalCustomers = records.reduce((sum, r) => sum + (r.customersServed || 0), 0);
    const uniqueBarbers = new Set(records.map((r) => r.barberId)).size;
    return {
      totalReturns: records.length,
      totalCustomers,
      uniqueBarbers,
    };
  }, [records]);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroup((current) => (current === key ? null : key));
  }, []);

  return {
    records,
    barbers,
    selectedBarberIds,
    setSelectedBarberIds,
    searchQuery,
    setSearchQuery,
    expandedGroup,
    toggleGroup,
    loading,
    filteredRecords,
    groupedHistory,
    stats,
    load,
  };
};
