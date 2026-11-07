export interface BottleLifecycle {
  id: string;
  inventoryStockId: string;
  itemName: string;
  unit: string;
  quantity: number;
  barberId: number;
  barberName: string;
  issuedAtCustomerCount: number;
  returnedAtCustomerCount: number | null;
  customersServed: number | null;
  returnCondition: 'empty' | 'partially_used' | null;
  status: 'issued' | 'returned';
  issuedAt: string;
  returnedAt: string | null;
  notes: string;
  handout?: InventoryHandout;
}

export interface InventoryHandout {
  id: string;
  inventoryStockId: string;
  itemName: string;
  unit: string;
  quantity: number;
  barberId: number;
  barberName: string;
  handedOutByName: string | null;
  handedOutAt: string;
  notes: string;
}

export interface InventoryManagerBarber {
  id: number;
  name: string;
  status: string;
}
