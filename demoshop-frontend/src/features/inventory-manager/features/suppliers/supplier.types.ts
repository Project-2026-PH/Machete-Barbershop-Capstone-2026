export interface InventoryManagerSupplier {
  id: string;
  name: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  notes: string;
  isActive: boolean;
  itemsSupplied: number;
}
