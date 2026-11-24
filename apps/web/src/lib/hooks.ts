import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface Customer {
  id: string;
  name: string;
  gstin: string;
  stateCode: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
  openingBalance: number;
  notes: string;
  isActive: boolean;
  outstanding?: number;
  invoiceCount?: number;
}
export interface Item {
  id: string;
  name: string;
  description: string;
  hsn: string;
  unit: string;
  rate: number;
  gstRate: number;
  isActive: boolean;
}

export const useCustomers = (all = false) => useQuery({ queryKey: ['customers', all], queryFn: () => api.get<Customer[]>(`/api/customers?active=${all ? 'all' : 'active'}`) });
export const useItems = (all = false) => useQuery({ queryKey: ['items', all], queryFn: () => api.get<Item[]>(`/api/items?active=${all ? 'all' : 'active'}`) });
export const useCompany = () => useQuery({ queryKey: ['company'], queryFn: () => api.get<Record<string, any>>('/api/settings/company') });
export const useInvoiceSettings = () => useQuery({ queryKey: ['invoice-settings'], queryFn: () => api.get<any>('/api/settings/invoice') });
