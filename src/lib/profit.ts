import type { Proforma, ProformaItem } from './supabase';

export interface ProformaWithItems extends Proforma {
  items: ProformaItem[];
}

export function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string) {
  return key.split('-').reverse().join('.');
}

export function calcProfit(p: ProformaWithItems) {
  const revenue = p.total_amount;
  const globalTax = p.purchase_tax_global ?? false;
  const cost = p.items.reduce((s, i, idx) => {
    const base = i.quantity * (i.purchase_price ?? 0);
    const discMode = i.supplier_discount_mode ?? 'percent';
    const hasPrev = p.items.slice(0, idx).some(prev => (prev.supplier ?? '').trim() === (i.supplier ?? '').trim());
    const discBase = discMode === 'percent'
      ? base * (1 - (i.supplier_discount_percent ?? 0) / 100)
      : Math.max(0, base - (hasPrev ? 0 : (i.supplier_discount_fixed ?? 0)));
    const hasTax = globalTax || i.purchase_tax_enabled;
    return s + discBase * (hasTax ? 1.05 : 1);
  }, 0) + (p.extra_delivery_cost ?? 0);
  return { revenue, cost, profit: revenue - cost };
}
