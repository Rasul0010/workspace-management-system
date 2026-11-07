import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface Client {
  id: string;
  name: string;
  code: string;
  phones: string;
  country: string;
  created_at: string;
}

export interface Product {
  id: string;
  brand: string;
  article: string;
  description: string;
  origin: string;
  uom: 'PCS' | 'CTN' | 'SET';
  price: number;
  price_aed: number;
  price_usd: number;
  price_tjs: number;
  owner: string;
  created_at: string;
  updated_at: string;
}

export type NewProduct = Omit<Product, 'id' | 'created_at' | 'updated_at'>;

export type Currency = 'AED' | 'USD' | 'TJS';

export interface Proforma {
  id: string;
  number: string;
  client: string;
  client_code: string;
  currency: Currency;
  discount_percent: number;
  discount_mode: 'percent' | 'fixed';
  discount_fixed: number;
  tax_percent: number;
  purchase_tax_global: boolean;
  total_amount: number;
  notes: string;
  confirmed: boolean;
  confirmed_at: string | null;
  delivery_date: string;
  delivery_location: string;
  delivery_type: string;
  delivery_qty: string;
  deliverer: string;
  profit_hidden: boolean;
  paid: boolean;
  delivered: boolean;
  archived: boolean;
  trashed: boolean;
  extra_delivery_cost: number;
  extra_delivery_label: string | null;
  extra_cost_on_invoice: boolean;
  extra_expenses: number;
  deposit_amount: number;
  sort_order: number;
  paid_at: string | null;
  delivered_at: string | null;
  merged_from: string[] | null;
  merged_into: string | null;
  owner: string;
  created_at: string;
  updated_at: string;
  items?: ProformaItem[];
}

export interface ProformaItem {
  id: string;
  proforma_id: string;
  product_id: string | null;
  article: string;
  brand: string;
  description: string;
  origin: string;
  uom: string;
  quantity: number;
  unit_price: number;
  sort_order: number;
  purchase_price: number;
  supplier: string;
  supplier_payment: number;
  purchase_tax: number;
  purchase_tax_enabled: boolean;
  supplier_paid: boolean;
  supplier_discount_percent: number;
  supplier_discount_fixed: number;
  supplier_discount_mode: 'percent' | 'fixed';
  created_at: string;
}

export type DraftItem = Omit<ProformaItem, 'id' | 'proforma_id' | 'created_at'> & {
  _key: string;
};

export type RequestStatus = 'offered' | 'recieved' | 'responsed' | 'confirmed';

export interface OrderRequest {
  id: string;
  title: string;
  status: RequestStatus;
  sort_order: number;
  owner: string;
  archived: boolean;
  proforma_id: string | null;
  check_paid: boolean;
  check_suppliers_paid: boolean;
  check_delivered: boolean;
  check_archived: boolean;
  comment: string;
  color: string;
  is_gsn: boolean;
  created_at: string;
  updated_at: string;
}

export function productPriceByCurrency(p: Product, currency: Currency): number {
  if (currency === 'AED') return p.price_aed;
  if (currency === 'USD') return p.price_usd;
  return p.price_tjs;
}
