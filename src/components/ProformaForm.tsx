import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, Search, X, Check, FileSpreadsheet, FileText as FilePdf, CheckCircle2, CreditCard, Truck, ChevronUp, ChevronDown, GripVertical, CloudOff, Package } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadBlob } from '../lib/download';
import {
  supabase,
  type Proforma,
  type ProformaItem,
  type Product,
  type Currency,
  type DraftItem,
  type Client,
  productPriceByCurrency,
} from '../lib/supabase';

const CURRENCIES: Currency[] = ['AED', 'USD', 'TJS'];
const TAX_RATE = 5;
let keyCounter = 0;
const nextKey = () => `item-${++keyCounter}`;

interface Props {
  proforma?: Proforma;
  onBack: () => void;
  onSaved: () => void;
  onConfirmed?: () => void;
  owner: string;
}

const emptyMeta = () => ({
  number: '',
  client: '',
  client_code: '',
  currency: 'AED' as Currency,
  discount_percent: 0,
  tax_percent: 0,
  notes: '',
  extra_delivery_cost: 0,
  extra_delivery_label: '',
  extra_cost_on_invoice: true,
  extra_expenses: 0,
  deposit_amount: 0,
  delivery_location: '' as string,
  profit_hidden: false,
});

type ColId = 'article' | 'brand' | 'desc' | 'coo' | 'uom' | 'qty' | 'price' | 'total';

export default function ProformaForm({ proforma, onBack, onSaved, onConfirmed, owner }: Props) {
  const [meta, setMeta] = useState(proforma ? {
    number: proforma.number,
    client: proforma.client,
    client_code: proforma.client_code ?? '',
    currency: proforma.currency,
    discount_percent: proforma.discount_percent,
    tax_percent: proforma.tax_percent,
    notes: proforma.notes,
    extra_delivery_cost: proforma.extra_delivery_cost ?? 0,
    extra_delivery_label: proforma.extra_delivery_label ?? '',
    extra_cost_on_invoice: proforma.extra_cost_on_invoice ?? true,
    extra_expenses: proforma.extra_expenses ?? 0,
    deposit_amount: proforma.deposit_amount ?? 0,
    delivery_location: proforma.delivery_location ?? '',
    profit_hidden: proforma.profit_hidden ?? false,
  } : emptyMeta());

  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>(() => proforma?.discount_mode ?? 'percent');
  const [discountFixed, setDiscountFixed] = useState(proforma?.discount_fixed ?? 0);
  const [taxEnabled, setTaxEnabled] = useState(() => proforma ? proforma.tax_percent > 0 : false);
  const [confirmed, setConfirmed] = useState(() => proforma?.confirmed ?? false);
  const [confirming, setConfirming] = useState(false);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientQuery, setClientQuery] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [duplicateWarn, setDuplicateWarn] = useState<Product | null>(null);

  const DEFAULT_COL_ORDER: ColId[] = ['article', 'brand', 'desc', 'coo', 'uom', 'qty', 'price', 'total'];
  const [colOrder, setColOrder] = useState<ColId[]>(() => {
    try {
      const saved = localStorage.getItem('smeta_col_order');
      if (saved) return JSON.parse(saved) as ColId[];
    } catch {}
    return DEFAULT_COL_ORDER;
  });
  const isAssistant = owner === 'assistant';
  const [showCost, setShowCost] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');
  const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);
  const [lastPriceInfo, setLastPriceInfo] = useState<{ article: string; price: number; proformaNumber: string; date: string } | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveRunRef = useRef<(() => Promise<void>) | null>(null);
  const leaveEditorRef = useRef<() => Promise<void>>(async () => {});
  const autoSaveInFlightRef = useRef<Promise<void> | null>(null);
  const insertedIdsRef = useRef<Map<string, string>>(new Map());
  const [rowDragIdx, setRowDragIdx] = useState<number | null>(null);
  const [rowOverIdx, setRowOverIdx] = useState<number | null>(null);
  const [colDragIdx, setColDragIdx] = useState<number | null>(null);
  const [colOverIdx, setColOverIdx] = useState<number | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const isNew = !proforma;

  useEffect(() => {
    loadProducts();
    loadClients();
    if (proforma) loadItems(proforma.id);
    else generateNumber();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setShowSearch(s => !s);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setLastPriceInfo(null);
        const item = focusedItemKey ? items.find(i => i._key === focusedItemKey) : null;
        if (item?.article && meta.client_code) lookupLastPrice(item.article, meta.client_code);
        return;
      }
      if (e.key === 'Escape') {
        if (lastPriceInfo) { setLastPriceInfo(null); return; }
        if (showSearch) { setShowSearch(false); return; }
        if (showClientPicker) { setShowClientPicker(false); return; }
        void leaveEditorRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSearch, showClientPicker, focusedItemKey, items, meta.client_code, lastPriceInfo]);

  async function loadProducts() {
    const { data } = await supabase.from('products').select('*').order('article').limit(20000);
    if (data) setProducts(data as Product[]);
  }

  async function loadClients() {
    const { data } = await supabase.from('clients').select('*').eq('owner', owner).order('name').limit(1000);
    if (data) setClients(data as Client[]);
  }

  async function loadItems(id: string) {
    const { data } = await supabase.from('proforma_items').select('*').eq('proforma_id', id).eq('owner', owner).order('sort_order');
    if (data) setItems((data as ProformaItem[]).map(i => ({
      ...i,
      _key: nextKey(),
      purchase_price: i.purchase_price ?? 0,
      supplier: i.supplier ?? '',
      supplier_payment: i.supplier_payment ?? 0,
      purchase_tax_enabled: i.purchase_tax_enabled ?? false,
      supplier_paid: i.supplier_paid ?? false,
      supplier_discount_percent: i.supplier_discount_percent ?? 0,
      supplier_discount_fixed: i.supplier_discount_fixed ?? 0,
      supplier_discount_mode: (i.supplier_discount_mode as 'percent' | 'fixed') ?? 'percent',
    })));
  }

  async function lookupLastPrice(article: string, clientCode: string) {
    const { data: proformaRows } = await supabase
      .from('proformas')
      .select('id, number, confirmed_at')
      .eq('owner', owner)
      .eq('client_code', clientCode)
      .eq('confirmed', true)
      .order('confirmed_at', { ascending: false })
      .limit(50);
    if (!proformaRows || proformaRows.length === 0) return;
    const ids = (proformaRows as { id: string; number: string; confirmed_at: string }[]).map(p => p.id);
    const { data: itemRows } = await supabase
      .from('proforma_items')
      .select('unit_price, proforma_id')
      .in('proforma_id', ids)
      .ilike('article', article)
      .order('proforma_id')
      .limit(50);
    if (!itemRows || itemRows.length === 0) return;
    const typed = itemRows as { unit_price: number; proforma_id: string }[];
    for (const p of proformaRows as { id: string; number: string; confirmed_at: string }[]) {
      const found = typed.find(i => i.proforma_id === p.id);
      if (found) {
        setLastPriceInfo({
          article,
          price: found.unit_price,
          proformaNumber: p.number,
          date: new Date(p.confirmed_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        });
        return;
      }
    }
  }

  function exportSupplierExcel(supplierName: string) {
    try {
    const supplierItems = items.filter(i => (i.supplier ?? '').trim() === supplierName);
    const hasTax = supplierItems.some(i => i.purchase_tax_enabled);

    const thin = { style: 'thin', color: { rgb: 'D1D5DB' } };
    const allThin = { top: thin, bottom: thin, left: thin, right: thin };
    const thickBottom = { top: thin, bottom: { style: 'medium', color: { rgb: '9CA3AF' } }, left: thin, right: thin };
    const baseFont = { name: 'Arial', sz: 10 };
    const boldFont = { ...baseFont, bold: true };

    const cell = (v: string | number, s: object): XLSX.CellObject => ({ v, t: typeof v === 'number' ? 'n' : 's', s });
    const hdr = (v: string) => cell(v, { font: { ...boldFont, sz: 9, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '374151' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: allThin });
    const dc = (v: string | number, align: 'left'|'center'|'right' = 'left', extra: object = {}) =>
      cell(v, { font: baseFont, alignment: { horizontal: align, vertical: 'center', wrapText: true }, border: allThin, ...extra });
    const articleFont = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '111827' } };
    const ac = (v: string) => cell(v, { font: articleFont, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin });

    const NUM = '#,##0.00';
    const aoa: (XLSX.CellObject | null)[][] = [];
    const rowH: { hpt: number }[] = [];
    let r = 0;

    // 8 columns: #, Part Number, Brand, COO, Description, Qty, Unit Price, Amount
    const COLS = 8;

    // Title block
    aoa.push([cell(`Supplier: ${supplierName}`, { font: { name: 'Arial', bold: true, sz: 14 }, alignment: { horizontal: 'left', vertical: 'center' } }), ...Array(COLS - 1).fill(null)]);
    rowH[r++] = { hpt: 26 };
    aoa.push([cell(`Proforma No. ${meta.number}`, { font: { name: 'Arial', sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }), ...Array(COLS - 1).fill(null)]);
    rowH[r++] = { hpt: 16 };
    const totalQty = supplierItems.reduce((s, i) => s + i.quantity, 0);
    aoa.push([cell(`Total Orders: ${supplierItems.length}`, { font: { name: 'Arial', sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }), ...Array(COLS - 1).fill(null)]);
    rowH[r++] = { hpt: 16 };
    aoa.push([cell(`Total Purchase Qty: ${totalQty}`, { font: { name: 'Arial', sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }), ...Array(COLS - 1).fill(null)]);
    rowH[r++] = { hpt: 16 };
    aoa.push(Array(COLS).fill(null)); rowH[r++] = { hpt: 8 };

    aoa.push(['#', 'Part Number', 'Brand', 'COO', 'Description', 'Qty', 'Unit Price', 'Amount'].map(hdr));
    rowH[r++] = { hpt: 22 };

    let subtotal = 0;
    supplierItems.forEach((item, idx) => {
      const price = item.purchase_price;
      const rawSum = item.quantity * price;
      const sDiscMode = item.supplier_discount_mode ?? 'percent';
      const discSum = sDiscMode === 'percent'
        ? rawSum * (1 - (item.supplier_discount_percent ?? 0) / 100)
        : Math.max(0, rawSum - (idx === 0 ? (item.supplier_discount_fixed ?? 0) : 0));
      subtotal += discSum;
      aoa.push([
        dc(idx + 1, 'center'),
        ac(item.article || ''),
        dc(item.brand || '', 'center'),
        dc(item.origin || '', 'center'),
        dc(item.description || ''),
        dc(item.quantity, 'center'),
        dc(price, 'right', { numFmt: NUM }),
        dc(discSum, 'right', { numFmt: NUM }),
      ]);
      rowH[r++] = { hpt: 18 };
    });

    // Spacer
    aoa.push(Array(COLS).fill(null)); rowH[r++] = { hpt: 8 };

    const labelStyle = (color: string) => ({
      font: { ...boldFont, color: { rgb: color } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: thickBottom,
    });
    const valueStyle = (color: string, bg?: string) => ({
      font: { ...boldFont, sz: 11, color: { rgb: color } },
      alignment: { horizontal: 'right', vertical: 'center' },
      numFmt: NUM,
      border: thickBottom,
      ...(bg ? { fill: { fgColor: { rgb: bg } } } : {}),
    });

    // Total Qty row: shows total quantity in the Qty column (5) with a label in column 6
    const qtyRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
    qtyRow[5] = cell(totalQty, { font: { ...boldFont, sz: 11, color: { rgb: '111827' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thickBottom });
    qtyRow[6] = cell('Total Qty:', labelStyle('374151'));
    aoa.push(qtyRow); rowH[r++] = { hpt: 20 };

    if (hasTax) {
      const taxableSum = supplierItems.reduce((s, i, idx) => {
        if (!i.purchase_tax_enabled) return s;
        const raw = i.quantity * i.purchase_price;
        const sDiscMode = i.supplier_discount_mode ?? 'percent';
        const disc = sDiscMode === 'percent'
          ? raw * (1 - (i.supplier_discount_percent ?? 0) / 100)
          : Math.max(0, raw - (idx === 0 ? (i.supplier_discount_fixed ?? 0) : 0));
        return s + disc;
      }, 0);
      const taxAmt = taxableSum * (TAX_RATE / 100);
      const totalWithTax = subtotal + taxAmt + (meta.extra_expenses ?? 0);

      const r1: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r1[6] = cell('Subtotal:', labelStyle('374151'));
      r1[7] = cell(subtotal, { ...valueStyle('111827'), numFmt: NUM } as object);
      aoa.push(r1); rowH[r++] = { hpt: 20 };

      const r2: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r2[6] = cell(`VAT ${TAX_RATE}%:`, labelStyle('DC2626'));
      r2[7] = cell(taxAmt, { ...valueStyle('DC2626', 'FEF2F2'), numFmt: NUM } as object);
      aoa.push(r2); rowH[r++] = { hpt: 20 };

      if ((meta.extra_expenses ?? 0) > 0) {
        const re: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
        re[6] = cell('Delivery:', labelStyle('374151'));
        re[7] = cell(meta.extra_expenses, { ...valueStyle('111827'), numFmt: NUM } as object);
        aoa.push(re); rowH[r++] = { hpt: 20 };
      }

      const r3: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r3[6] = cell('Total incl. VAT:', { font: { ...boldFont, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'DC2626' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
      r3[7] = cell(totalWithTax, { font: { ...boldFont, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'DC2626' } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM, border: allThin } as object);
      aoa.push(r3); rowH[r++] = { hpt: 24 };
    } else {
      const rt: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      rt[6] = cell('Total:', { font: { ...boldFont, sz: 11, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
      rt[7] = cell(subtotal, { font: { ...boldFont, sz: 12, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM, border: allThin } as object);
      aoa.push(rt); rowH[r++] = { hpt: 24 };
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 36 }, { wch: 8 }, { wch: 14 }, { wch: 16 }];
    ws['!rows'] = rowH;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, supplierName.slice(0, 31));
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${meta.number}_${supplierName}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function generateNumber() {
    // Fallback if no client selected — use old PRO- format
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const { data } = await supabase.from('proformas').select('number').eq('trashed', false).like('number', `PRO-${year}${month}-%`);
    const prefix = `PRO-${year}${month}-`;
    let maxN = 0;
    for (const p of (data ?? [])) {
      const n = p as { number: string };
      if (n.number.startsWith(prefix)) {
        const num = parseInt(n.number.slice(prefix.length));
        if (!isNaN(num) && num > maxN) maxN = num;
      }
    }
    setMeta(m => ({ ...m, number: `${prefix}${String(maxN + 1).padStart(3, '0')}` }));
  }

  async function generateNumberFromClient(clientCode: string) {
    const { data: client } = await supabase.from('clients').select('phones').eq('code', clientCode).maybeSingle();
    if (!client) return;
    const digits = ((client as { phones: string }).phones || '').replace(/\D/g, '');
    if (digits.length < 2) return;
    const prefix = digits.slice(-2);

    const { data: existing } = await supabase
      .from('proformas')
      .select('number')
      .eq('trashed', false)
      .like('number', `${prefix}%`);

    let maxN = 0;
    for (const p of (existing ?? [])) {
      const num = (p as { number: string }).number;
      if (/^\d{4}$/.test(num) && num.startsWith(prefix)) {
        maxN = Math.max(maxN, parseInt(num.slice(2)));
      }
    }

    const next = `${prefix}${String(maxN + 1).padStart(2, '0')}`;
    setMeta(m => ({ ...m, number: next }));
  }

  // Debounced auto-save for existing proformas
  useEffect(() => {
    if (!proforma?.id || items.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const runAutoSave = async () => {
      autoSaveTimerRef.current = null;
      setAutoSaveStatus('saving');
      try {
        const effectiveDiscountPct = discountMode === 'percent' ? meta.discount_percent : 0;
        const effectiveDiscountFixed = discountMode === 'fixed' ? discountFixed : 0;
        const effectiveTaxPct = taxEnabled ? TAX_RATE : 0;
        const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const discAmt = discountMode === 'percent' ? sub * effectiveDiscountPct / 100 : effectiveDiscountFixed;
        const afterDisc = sub - discAmt;
        const taxAmt = afterDisc * effectiveTaxPct / 100;
        const total = afterDisc + taxAmt + (meta.extra_expenses ?? 0);

        await supabase.from('proformas').update({
          number: meta.number,
          client: meta.client,
          client_code: meta.client_code,
          currency: meta.currency,
          discount_percent: effectiveDiscountPct,
          discount_mode: discountMode,
          discount_fixed: effectiveDiscountFixed,
          tax_percent: effectiveTaxPct,
          purchase_tax_global: items.every(i => i.purchase_tax_enabled),
          notes: meta.notes,
          extra_delivery_cost: meta.extra_delivery_cost,
          extra_delivery_label: meta.extra_delivery_label || null,
          extra_cost_on_invoice: true,
          extra_expenses: meta.extra_expenses,
          deposit_amount: meta.deposit_amount,
          delivery_location: meta.delivery_location,
          profit_hidden: meta.profit_hidden,
          total_amount: total,
          updated_at: new Date().toISOString(),
        }).eq('id', proforma.id);

        for (let idx = 0; idx < items.length; idx++) {
          const item = items[idx];
          const itemPayload = {
            article: item.article,
            brand: item.brand,
            description: item.description,
            origin: item.origin,
            uom: item.uom,
            quantity: item.quantity,
            unit_price: item.unit_price,
            sort_order: idx,
            purchase_price: item.purchase_price,
            supplier: item.supplier,
            supplier_payment: item.supplier_payment,
            purchase_tax_enabled: item.purchase_tax_enabled,
            supplier_paid: item.supplier_paid,
            product_id: item.product_id,
          };
          const existingId = itemId(item);
          if (existingId) {
            await supabase.from('proforma_items').update(itemPayload).eq('id', existingId);
          } else {
            const { data } = await supabase.from('proforma_items').insert([{ ...itemPayload, proforma_id: proforma.id, owner }]).select().maybeSingle();
            if (data) {
              const newItem = data as ProformaItem;
              insertedIdsRef.current.set(item._key, newItem.id);
              setItems(prev => prev.map(it => it._key === item._key ? { ...it, id: newItem.id } : it));
            }
          }
        }
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch {
        setAutoSaveStatus('error');
      }
    };
    autoSaveRunRef.current = runAutoSave;
    autoSaveTimerRef.current = setTimeout(() => { autoSaveInFlightRef.current = runAutoSave(); }, 4000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, items, discountMode, discountFixed, taxEnabled]);

  async function leaveEditor() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      autoSaveInFlightRef.current = autoSaveRunRef.current?.() ?? null;
    }
    if (autoSaveInFlightRef.current) await autoSaveInFlightRef.current;
    onBack();
  }

  async function settleAutoSave() {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    if (autoSaveInFlightRef.current) await autoSaveInFlightRef.current;
  }

  function itemId(item: DraftItem): string | undefined {
    return (item as DraftItem & { id?: string }).id || insertedIdsRef.current.get(item._key);
  }
  leaveEditorRef.current = leaveEditor;

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const discountAmt = discountMode === 'percent'
    ? subtotal * meta.discount_percent / 100
    : (discountFixed ?? 0);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (taxEnabled ? TAX_RATE : 0) / 100;
  const extraExpenses = meta.extra_expenses ?? 0;
  const extraDelivery = meta.extra_delivery_cost ?? 0;
  const total = afterDiscount + taxAmt + extraExpenses;

  const purchaseSubtotal = items.reduce((s, i) => s + i.quantity * i.purchase_price, 0);
  const purchaseTotal = items.reduce((s, i, idx) => {
    const base = i.quantity * i.purchase_price;
    const discMode = i.supplier_discount_mode ?? 'percent';
    const hasPreviousSupplierItem = items.slice(0, idx).some(previous => (previous.supplier ?? '').trim() === (i.supplier ?? '').trim());
    const discBase = discMode === 'percent'
      ? base * (1 - (i.supplier_discount_percent ?? 0) / 100)
      : Math.max(0, base - (hasPreviousSupplierItem ? 0 : (i.supplier_discount_fixed ?? 0)));
    return s + discBase * (i.purchase_tax_enabled ? 1.05 : 1);
  }, 0) + extraDelivery;
  const profitBeforeExtraDelivery = total - (purchaseTotal - extraDelivery);
  const profit = profitBeforeExtraDelivery - extraDelivery;

  const supplierData = items.reduce((acc, i, idx) => {
    const name = (i.supplier ?? '').trim();
    if (!name) return acc;
    const base = i.quantity * i.purchase_price;
    const discMode = i.supplier_discount_mode ?? 'percent';
    const hasPreviousSupplierItem = items.slice(0, idx).some(previous => (previous.supplier ?? '').trim() === name);
    const discBase = discMode === 'percent'
      ? base * (1 - (i.supplier_discount_percent ?? 0) / 100)
      : Math.max(0, base - (hasPreviousSupplierItem ? 0 : (i.supplier_discount_fixed ?? 0)));
    const cost = discBase * (i.purchase_tax_enabled ? 1.05 : 1);
    if (!acc[name]) acc[name] = { total: 0, paid: true, payment: 0, taxAll: true, taxSome: false, count: 0, discMode: 'percent', discPct: 0, discFixed: 0 };
    acc[name].total += cost;
    acc[name].paid = acc[name].paid && (i.supplier_paid ?? false);
    acc[name].payment += i.supplier_payment ?? 0;
    acc[name].taxAll = acc[name].taxAll && (i.purchase_tax_enabled ?? false);
    acc[name].taxSome = acc[name].taxSome || (i.purchase_tax_enabled ?? false);
    acc[name].count += 1;
    // Track discount mode/values for this supplier (first item sets, uniform assumed)
    if (acc[name].count === 1) {
      acc[name].discMode = discMode;
      acc[name].discPct = i.supplier_discount_percent ?? 0;
      acc[name].discFixed = i.supplier_discount_fixed ?? 0;
    }
    return acc;
  }, {} as Record<string, { total: number; paid: boolean; payment: number; taxAll: boolean; taxSome: boolean; count: number; discMode: 'percent' | 'fixed'; discPct: number; discFixed: number }>);

  const supplierTotals = Object.fromEntries(Object.entries(supplierData).map(([k, v]) => [k, v.total]));

  function toggleSupplierPaid(name: string) {
    const allPaid = supplierData[name]?.paid ?? false;
    setItems(prev => prev.map(i =>
      (i.supplier ?? '').trim() === name ? { ...i, supplier_paid: !allPaid } : i
    ));
  }

  function toggleSupplierTax(name: string) {
    const allTax = supplierData[name]?.taxAll ?? false;
    setItems(prev => prev.map(i =>
      (i.supplier ?? '').trim() === name ? { ...i, purchase_tax_enabled: !allTax } : i
    ));
  }

  function addProduct(p: Product, allowDuplicate = false) {
    const existingIdx = items.findIndex(i => i.article.trim().toLowerCase() === p.article.trim().toLowerCase());
    if (existingIdx >= 0 && !allowDuplicate) {
      setDuplicateWarn(p);
      return;
    }
    const price = productPriceByCurrency(p, meta.currency);
    setItems(prev => [...prev, {
      _key: nextKey(),
      id: '',
      proforma_id: proforma?.id ?? '',
      product_id: p.id,
      brand: p.brand,
      article: p.article,
      description: p.description,
      origin: p.origin,
      uom: p.uom,
      quantity: 1,
      unit_price: price,
      sort_order: prev.length,
      purchase_price: 0,
      supplier: '',
      supplier_payment: 0,
      purchase_tax: 0,
      purchase_tax_enabled: false,
      supplier_paid: false,
      supplier_discount_percent: 0,
      supplier_discount_fixed: 0,
      supplier_discount_mode: 'percent',
    }]);
    setShowSearch(false);
    setQuery('');
  }

  function addBlank() {
    setItems(prev => [...prev, {
      _key: nextKey(),
      id: '',
      proforma_id: proforma?.id ?? '',
      product_id: null,
      brand: '',
      article: '',
      description: '',
      origin: '',
      uom: 'PCS',
      quantity: 1,
      unit_price: 0,
      sort_order: prev.length,
      purchase_price: 0,
      supplier: '',
      supplier_payment: 0,
      purchase_tax: 0,
      purchase_tax_enabled: false,
      supplier_paid: false,
      supplier_discount_percent: 0,
      supplier_discount_fixed: 0,
      supplier_discount_mode: 'percent',
    }]);
    setShowSearch(false);
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    if (patch.article !== undefined) {
      const existingIdx = items.findIndex(i => i._key !== key && i.article.trim().toLowerCase() === patch.article!.trim().toLowerCase());
      if (existingIdx >= 0) {
        const matched = products.find(p => p.article.toLowerCase() === patch.article!.toLowerCase());
        if (matched) setDuplicateWarn(matched);
      }
    }
    setItems(prev => prev.map(item => {
      if (item._key !== key) return item;
      const updated = { ...item, ...patch };
      if (patch.article !== undefined) {
        const matched = products.find(p => p.article.toLowerCase() === patch.article!.toLowerCase());
        if (matched) {
          updated.brand = matched.brand;
          updated.description = matched.description;
          updated.origin = matched.origin;
          updated.uom = matched.uom;
          updated.unit_price = productPriceByCurrency(matched, meta.currency);
        }
      }
      return updated;
    }));
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(item => item._key !== key));
  }

  function handleCurrencyChange(c: Currency) {
    setMeta(m => ({ ...m, currency: c }));
    setItems(prev =>
      prev.map(item => {
        const p = products.find(p => p.id === item.product_id);
        if (!p) return item;
        return { ...item, unit_price: productPriceByCurrency(p, c) };
      })
    );
  }

  async function save() {
    if (!meta.number.trim()) {
      setError('Заполните номер сметы');
      return;
    }
    setSaving(true);
    setError('');
    await settleAutoSave();
    // Check for duplicate number
    const { data: duplicates, error: duplicateError } = await supabase
      .from('proformas').select('id').eq('number', meta.number.trim()).eq('trashed', false).limit(1);
    if (duplicateError) {
      setError('Не удалось проверить номер сметы. Попробуйте ещё раз.');
      setSaving(false);
      return;
    }
    const existingNum = (duplicates ?? [])[0] as { id: string } | undefined;
    if (existingNum && (!proforma || existingNum.id !== proforma.id)) {
      setError(`Смета с номером «${meta.number.trim()}» уже существует`);
      setSaving(false);
      return;
    }
    const effectiveDiscountPct = discountMode === 'percent' ? meta.discount_percent : 0;
    const effectiveDiscountFixed = discountMode === 'fixed' ? discountFixed : 0;
    const effectiveTaxPct = taxEnabled ? TAX_RATE : 0;
    const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const discAmt = discountMode === 'percent' ? sub * effectiveDiscountPct / 100 : effectiveDiscountFixed;
    const afterDisc = sub - discAmt;
    const taxAmtCalc = afterDisc * effectiveTaxPct / 100;
    const totalCalc = afterDisc + taxAmtCalc + (meta.extra_expenses ?? 0);

    const proformaPayload = {
      number: meta.number,
      client: meta.client,
      client_code: meta.client_code,
      currency: meta.currency,
      discount_percent: effectiveDiscountPct,
      discount_mode: discountMode,
      discount_fixed: effectiveDiscountFixed,
      tax_percent: effectiveTaxPct,
      purchase_tax_global: items.every(i => i.purchase_tax_enabled),
      notes: meta.notes,
      extra_delivery_cost: meta.extra_delivery_cost,
      extra_delivery_label: meta.extra_delivery_label || null,
      extra_cost_on_invoice: true,
      extra_expenses: meta.extra_expenses,
      deposit_amount: meta.deposit_amount,
      delivery_location: meta.delivery_location,
      profit_hidden: meta.profit_hidden,
      total_amount: totalCalc,
    };

    let proformaId = proforma?.id;
    if (proforma) {
      await supabase.from('proformas').update({
        ...proformaPayload,
        updated_at: new Date().toISOString(),
      }).eq('id', proforma.id);
    } else {
      const { data, error: insertError } = await supabase.from('proformas').insert([{
        ...proformaPayload,
        confirmed: false,
        paid: false,
        delivered: false,
        archived: false,
        trashed: false,
        owner,
      }]).select().maybeSingle();
      if (insertError || !data) {
        setError('Ошибка создания сметы');
        setSaving(false);
        return;
      }
      proformaId = (data as Proforma).id;

      const requestTitle = meta.client_code || meta.number;
      await supabase.from('requests').insert([{
        title: requestTitle,
        comment: meta.client_code ? meta.number : '',
        status: 'recieved',
        sort_order: 0,
        owner,
        proforma_id: proformaId,
        archived: false,
        check_paid: false,
        check_suppliers_paid: false,
        check_delivered: false,
        check_archived: false,
        color: '#f4b942',
      }]);
    }

    if (proformaId) {
      const existingIds = items.map(itemId).filter((id): id is string => !!id);
      if (proforma) {
        const { data: existingItems } = await supabase.from('proforma_items').select('id').eq('proforma_id', proformaId);
        const toDelete = ((existingItems ?? []) as { id: string }[])
          .filter(ei => !existingIds.includes(ei.id))
          .map(ei => ei.id);
        if (toDelete.length > 0) {
          await supabase.from('proforma_items').delete().in('id', toDelete);
        }
      }

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const itemPayload = {
          article: item.article,
          brand: item.brand,
          description: item.description,
          origin: item.origin,
          uom: item.uom,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: idx,
          purchase_price: item.purchase_price,
          supplier: item.supplier,
          supplier_payment: item.supplier_payment,
          purchase_tax_enabled: item.purchase_tax_enabled,
          supplier_paid: item.supplier_paid,
          supplier_discount_percent: item.supplier_discount_percent ?? 0,
          supplier_discount_fixed: item.supplier_discount_fixed ?? 0,
          supplier_discount_mode: item.supplier_discount_mode ?? 'percent',
          product_id: item.product_id,
        };
        const existingId = itemId(item);
        if (existingId) {
          await supabase.from('proforma_items').update(itemPayload).eq('id', existingId);
        } else {
          await supabase.from('proforma_items').insert([{ ...itemPayload, proforma_id: proformaId, owner }]);
        }
      }
    }

    setSaving(false);
    onSaved();
  }

  async function confirmProforma() {
    if (!proforma?.id) { await save(); return; }
    setConfirming(true);
    await settleAutoSave();
    const effectiveDiscountPct = discountMode === 'percent' ? meta.discount_percent : 0;
    const effectiveDiscountFixed = discountMode === 'fixed' ? discountFixed : 0;
    const effectiveTaxPct = taxEnabled ? TAX_RATE : 0;
    const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const discAmt = discountMode === 'percent' ? sub * effectiveDiscountPct / 100 : effectiveDiscountFixed;
    const afterDisc = sub - discAmt;
    const taxAmtCalc = afterDisc * effectiveTaxPct / 100;
    const totalCalc = afterDisc + taxAmtCalc + (meta.extra_expenses ?? 0);

    const { error: confirmError } = await supabase.from('proformas').update({
      number: meta.number,
      client: meta.client,
      client_code: meta.client_code,
      currency: meta.currency,
      discount_percent: effectiveDiscountPct,
      discount_mode: discountMode,
      discount_fixed: effectiveDiscountFixed,
      tax_percent: effectiveTaxPct,
      purchase_tax_global: items.every(i => i.purchase_tax_enabled),
      notes: meta.notes,
      extra_delivery_cost: meta.extra_delivery_cost,
      extra_delivery_label: meta.extra_delivery_label || null,
      extra_cost_on_invoice: true,
      extra_expenses: meta.extra_expenses,
      deposit_amount: meta.deposit_amount,
      delivery_location: meta.delivery_location,
      profit_hidden: meta.profit_hidden,
      total_amount: totalCalc,
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', proforma.id);
    if (confirmError) {
      setError('Не удалось подтвердить смету. Попробуйте ещё раз.');
      setConfirming(false);
      return;
    }

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const itemPayload = {
        article: item.article, brand: item.brand, description: item.description,
        origin: item.origin, uom: item.uom, quantity: item.quantity,
        unit_price: item.unit_price, sort_order: idx,
        purchase_price: item.purchase_price, supplier: item.supplier,
        supplier_payment: item.supplier_payment, purchase_tax_enabled: item.purchase_tax_enabled,
        supplier_paid: item.supplier_paid,
        supplier_discount_percent: item.supplier_discount_percent ?? 0,
        supplier_discount_fixed: item.supplier_discount_fixed ?? 0,
        supplier_discount_mode: item.supplier_discount_mode ?? 'percent',
        product_id: item.product_id,
      };
      const existingId = itemId(item);
      if (existingId) {
        await supabase.from('proforma_items').update(itemPayload).eq('id', existingId);
      } else {
        await supabase.from('proforma_items').insert([{ ...itemPayload, proforma_id: proforma.id, owner }]);
      }
    }

    setConfirmed(true);
    setConfirming(false);

    // Create accounting entry in client's ledger
    if (meta.client_code) {
      const { data: clientData } = await supabase
        .from('clients').select('id').eq('code', meta.client_code).maybeSingle();
      if (clientData) {
        await supabase.from('client_transactions').upsert([{
          client_id: (clientData as { id: string }).id,
          proforma_id: proforma.id,
          date: new Date().toISOString().slice(0, 10),
          amount: totalCalc,
          details: `Счёт ${meta.number}`,
          owner,
        }], { onConflict: 'proforma_id' });
      }
    }

    // Move the linked request card to CONFIRMED
    await supabase.from('requests')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('proforma_id', proforma.id)
      .eq('archived', false);

    onConfirmed?.();
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function exportExcel() {
    try {
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const COLS = 9;
    const thin = { style: 'thin', color: { rgb: 'D1D5DB' } };
    const med  = { style: 'medium', color: { rgb: '374151' } };
    const allThin = { top: thin, bottom: thin, left: thin, right: thin };
    const allMed  = { top: med, bottom: med, left: med, right: med };
    const baseFont = { name: 'Arial', sz: 10 };
    const boldFont = { ...baseFont, bold: true };
    const articleFont = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1F2937' } };
    const cell = (v: string | number, s: object): XLSX.CellObject => ({ v, t: typeof v === 'number' ? 'n' : 's', s });
    const hdrCell = (v: string) => cell(v, {
      font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } },
      fill: { fgColor: { rgb: 'F3F4F6' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allThin,
    });
    const dataCell = (v: string | number, align: 'left' | 'center' | 'right' = 'left') => cell(v, {
      font: baseFont,
      alignment: { horizontal: align, vertical: 'center', wrapText: true },
      border: allThin,
    });
    const boldData = (v: string | number, align: 'left' | 'center' | 'right' = 'left') => cell(v, {
      font: boldFont,
      alignment: { horizontal: align, vertical: 'center' },
      border: allThin,
    });
    const labelCell = (v: string) => cell(v, {
      font: { ...boldFont, sz: 9, color: { rgb: '9CA3AF' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      fill: { fgColor: { rgb: 'F9FAFB' } },
      border: allThin,
    });
    const totalCell = (v: number) => cell(v, {
      font: { ...boldFont, sz: 11, color: { rgb: '111827' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      fill: { fgColor: { rgb: 'F3F4F6' } },
      border: allMed,
      numFmt: '#,##0.00',
    } as object);

    const aoa: (XLSX.CellObject | null)[][] = [];
    const merges: XLSX.Range[] = [];
    const rowH: { hpt: number }[] = [];
    let r = 0;

    aoa.push([
      cell('PROFORMA', { font: { name: 'Arial', bold: true, sz: 16, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null, null,
      cell(`№ ${meta.number}`, { font: { name: 'Arial', bold: true, sz: 13, color: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 28 }; r++;

    aoa.push([
      cell(`Дата: ${date}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null, null,
      cell(`Валюта: ${meta.currency}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 16 }; r++;

    if (meta.client_code) {
      aoa.push([cell(`КК: ${meta.client_code}${meta.delivery_location ? `  ·  ${meta.delivery_location}` : ''}`, { font: { ...boldFont, sz: 11 }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F9FAFB' } } }), null, null, null, null, null, null, null, null]);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowH[r] = { hpt: 20 }; r++;
    }

    if (meta.delivery_location && !meta.client_code) {
      aoa.push([cell(`${meta.delivery_location}`, { font: { ...baseFont, sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F9FAFB' } } }), null, null, null, null, null, null, null, null]);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowH[r] = { hpt: 16 }; r++;
    }

    aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;
    aoa.push(['№', 'BRAND', 'COO', 'PART NUMBER', 'DESCRIPTION', 'QTY', 'UOM', 'PRICE', 'TOTAL'].map(h => hdrCell(h)));
    rowH[r] = { hpt: 22 }; r++;

    items.forEach((item, idx) => {
      const rowFill = idx % 2 !== 0 ? { fill: { fgColor: { rgb: 'F3F4F6' } } } : {};
      const dc = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, { font: baseFont, alignment: { horizontal: align, vertical: 'center', wrapText: true }, border: allThin, ...rowFill });
      const bd = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, { font: boldFont, alignment: { horizontal: align, vertical: 'center' }, border: allThin, ...rowFill });
      const ac2 = (v: string) => cell(v, { font: { ...articleFont, color: { rgb: '1F2937' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin, ...rowFill });
      aoa.push([
        dc(idx + 1, 'center'),
        bd(item.brand || '', 'center'),
        dc(item.origin || '', 'center'),
        ac2(item.article || ''),
        dc(item.description || ''),
        dc(item.quantity, 'center'),
        dc(item.uom || '', 'center'),
        dc(item.unit_price, 'right'),
        dc(+(item.quantity * item.unit_price).toFixed(2), 'right'),
      ]);
      rowH[r] = { hpt: 18 }; r++;
    });

    aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;

    const qtyRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
    qtyRow[4] = cell('Total QTY:', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
    qtyRow[5] = cell(totalQty, { font: { ...boldFont, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin });
    aoa.push(qtyRow); rowH[r] = { hpt: 16 }; r++;

    const sumRow = (label: string, value: number, highlight = false) => {
      const row: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      row[7] = highlight ? labelCell(label) : cell(label, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
      row[8] = highlight ? totalCell(value) : cell(value, { font: boldFont, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, numFmt: '#,##0.00' } as object);
      return row;
    };

    aoa.push(sumRow('Subtotal:', +subtotal.toFixed(2))); rowH[r] = { hpt: 16 }; r++;
    if (discountAmt > 0) {
      const discLabel = discountMode === 'fixed' ? 'Discount:' : `Discount ${meta.discount_percent}%:`;
      aoa.push(sumRow(discLabel, +(-discountAmt).toFixed(2))); rowH[r] = { hpt: 16 }; r++;
    }
    if (taxAmt > 0) { aoa.push(sumRow(`VAT ${TAX_RATE}%:`, +taxAmt.toFixed(2))); rowH[r] = { hpt: 16 }; r++; }
    if (extraDelivery > 0) { aoa.push(sumRow(`${meta.extra_delivery_label || 'Доп. расходы'}:`, +(-extraDelivery).toFixed(2))); rowH[r] = { hpt: 16 }; r++; }
    if (extraExpenses > 0) { aoa.push(sumRow('Delivery:', +extraExpenses.toFixed(2))); rowH[r] = { hpt: 16 }; r++; }
    aoa.push(sumRow('TOTAL:', +total.toFixed(2), true)); rowH[r] = { hpt: 22 }; r++;
    if (meta.deposit_amount > 0) {
      const depositRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      depositRow[7] = cell('Deposit:', { font: { ...baseFont, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
      depositRow[8] = cell(+(-meta.deposit_amount).toFixed(2), { font: { ...boldFont, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, numFmt: '#,##0.00' } as object);
      aoa.push(depositRow); rowH[r] = { hpt: 16 }; r++;
      const balRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      balRow[7] = labelCell('Balance Due:');
      balRow[8] = totalCell(+Math.max(0, total - meta.deposit_amount).toFixed(2));
      aoa.push(balRow); rowH[r] = { hpt: 22 }; r++;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 9 }, { wch: 17 }, { wch: 31 }, { wch: 7 }, { wch: 7 }, { wch: 13 }, { wch: 14 }];
    ws['!rows'] = rowH;
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, meta.number || 'Proforma');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${meta.number || 'proforma'}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function exportPdf() {
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('proforma-pdf-render')?.remove();
    const container = document.createElement('div');
    container.id = 'proforma-pdf-render';

    const rows = items.map((item, idx) => `
      <tr style="height:34px;background:${idx % 2 !== 0 ? '#f3f4f6' : '#ffffff'};">
        <td class="ctr"><span style="display:block;width:100%;line-height:normal;">${idx + 1}</span></td><td class="brand"><span style="display:block;width:100%;line-height:normal;">${item.brand}</span></td><td class="ctr"><span style="display:block;width:100%;line-height:normal;">${item.origin}</span></td>
        <td class="ctr mono"><span style="display:block;width:100%;line-height:normal;">${item.article}</span></td><td class="desc"><span style="display:block;width:100%;line-height:normal;">${item.description}</span></td>
        <td class="ctr"><span style="display:block;width:100%;line-height:normal;">${item.quantity}</span></td><td class="ctr"><span style="display:block;width:100%;line-height:normal;">${item.uom}</span></td>
        <td class="ctr"><span style="display:block;width:100%;line-height:normal;">${fmt(item.unit_price)}</span></td><td class="ctr bold"><span style="display:block;width:100%;line-height:normal;">${fmt(item.quantity * item.unit_price)}</span></td>
      </tr>`).join('');

    container.innerHTML = `
      <div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;font-size:9px;color:#111;padding:16px;width:680px;background:#fff;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;padding:14px 20px 12px;background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(15,23,42,.07);">
          <div>
            <div style="font-size:26px;font-weight:900;letter-spacing:.18em;color:#0d1f3c;line-height:1;font-family:'Calibri',sans-serif;">PROFORMA</div>
            <div style="font-size:12px;color:#718096;margin-top:5px;">${meta.number}</div>
          </div>
          <div style="text-align:right;font-size:12px;line-height:1.55;color:#718096;">
            <div style="font-size:20px;font-weight:900;color:#111827;letter-spacing:.04em;">${meta.client_code || '—'}</div>
            <div style="font-size:12px;font-weight:700;color:#4b5563;">${meta.client || '—'}</div>
            <div>${date}</div>
            ${meta.delivery_location ? `<div style="margin-top:3px;font-size:10px;color:#6b7280;">${meta.delivery_location}</div>` : ''}
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
          <colgroup>
            <col style="width:18px;"><col style="width:62px;"><col style="width:34px;"><col style="width:90px;">
            <col style="width:116px;"><col style="width:28px;"><col style="width:28px;"><col style="width:50px;"><col style="width:54px;">
          </colgroup>
          <thead><tr style="border-bottom:1.5px solid #111;background:#f3f4f6;">
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">№</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">Brand</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">COO</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">Part Number</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">Description</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">QTY</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">UOM</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;border-right:1px solid #e0e0e0;">Price</th>
            <th style="text-align:center;vertical-align:middle;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 2px 3px;color:#333;">Total</th>
          </tr></thead>
          <tbody>${rows
            .replace(/class="ctr mono"/g, 'style="text-align:center;font-family:\'Calibri\',sans-serif;font-size:9px;font-weight:700;color:#111827;height:34px;padding:0 2px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;white-space:nowrap;letter-spacing:0.02em;display:table-cell;"')
            .replace(/class="brand"/g, 'style="text-align:center;font-size:8px;height:34px;padding:0 2px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:table-cell;"')
            .replace(/class="ctr bold"/g, 'style="text-align:center;font-weight:700;font-variant-numeric:tabular-nums;height:34px;padding:0 2px;vertical-align:middle;line-height:normal;border-bottom:0.5px solid #dfe3e8;"')
            .replace(/class="ctr"/g, 'style="text-align:center;font-variant-numeric:tabular-nums;height:34px;padding:0 2px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;white-space:nowrap;display:table-cell;"')
            .replace(/class="desc"/g, 'style="text-align:center;height:34px;padding:0 3px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;word-break:break-word;font-size:8px;display:table-cell;"')}</tbody>
        </table>
        <div style="margin-top:8px;display:flex;justify-content:space-between;align-items:flex-end;gap:8px;">
          <div style="font-size:11px;color:#777;padding-bottom:4px;">
            <span style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total QTY:</span>
            <span style="font-weight:800;color:#111;margin-left:4px;">${totalQty}</span>
          </div>
          <table style="min-width:210px;border-top:1px solid #ddd;">
            <tr><td style="color:#666;padding-right:20px;font-weight:500;padding-top:3px;padding-bottom:3px;font-size:10px;">Subtotal</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:10px;">${fmt(subtotal)} ${meta.currency}</td></tr>
            ${discountAmt > 0 ? `<tr><td style="color:#666;padding-right:20px;font-weight:500;padding-top:3px;padding-bottom:3px;font-size:10px;">${discountMode === 'fixed' ? 'Discount' : `Discount ${meta.discount_percent}%`}</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:10px;">− ${fmt(discountAmt)} ${meta.currency}</td></tr>` : ''}
            ${taxAmt > 0 ? `<tr><td style="color:#666;padding-right:20px;font-weight:500;padding-top:3px;padding-bottom:3px;font-size:10px;">VAT ${TAX_RATE}%</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:10px;">+ ${fmt(taxAmt)} ${meta.currency}</td></tr>` : ''}
            ${extraDelivery > 0 ? `<tr><td style="color:#dc2626;padding-right:20px;font-weight:500;padding-top:3px;padding-bottom:3px;font-size:10px;">${meta.extra_delivery_label || 'Доп. расходы'}</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:10px;">− ${fmt(extraDelivery)} ${meta.currency}</td></tr>` : ''}
            ${extraExpenses > 0 ? `<tr><td style="color:#666;padding-right:20px;font-weight:500;padding-top:3px;padding-bottom:3px;font-size:10px;">Delivery</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:10px;">+ ${fmt(extraExpenses)} ${meta.currency}</td></tr>` : ''}
            <tr><td style="font-size:13px;font-weight:800;border-top:2px solid #111;padding-top:6px;padding-bottom:2px;color:#666;padding-right:20px;">Amount</td><td style="font-size:13px;font-weight:800;border-top:2px solid #111;padding-top:6px;padding-bottom:2px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(total)} ${meta.currency}</td></tr>
            ${meta.deposit_amount > 0 ? `<tr><td style="color:#2563eb;padding-right:20px;font-weight:500;padding-top:3px;padding-bottom:3px;font-size:10px;">Deposit</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:10px;color:#2563eb;">− ${fmt(meta.deposit_amount)} ${meta.currency}</td></tr><tr><td style="font-size:12px;font-weight:800;border-top:1.5px dashed #2563eb;padding-top:5px;padding-bottom:2px;color:#2563eb;padding-right:20px;">Balance Due</td><td style="font-size:12px;font-weight:800;border-top:1.5px dashed #2563eb;padding-top:5px;padding-bottom:2px;text-align:right;font-variant-numeric:tabular-nums;color:#2563eb;">${fmt(Math.max(0, total - meta.deposit_amount))} ${meta.currency}</td></tr>` : ''}
          </table>
        </div>

      </div>`;

    Object.assign(container.style, { position: 'fixed', left: '-9999px', top: '0', width: '680px', background: '#f5f5f5', zIndex: '-1' });
    document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 4, useCORS: true, backgroundColor: '#fff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let yOffset = 0; let remaining = imgH;
      while (remaining > 0) { pdf.addImage(imgData, 'PNG', 0, -yOffset, pageW, imgH); remaining -= pageH; yOffset += pageH; if (remaining > 0) pdf.addPage(); }
      const pdfBlob = pdf.output('blob');
      downloadBlob(pdfBlob, `${meta.number || 'proforma'}.pdf`);
    } catch (err) { console.error('PDF export failed:', err); alert('Ошибка экспорта PDF: ' + (err instanceof Error ? err.message : String(err))); }
    finally { container.remove(); }
  }

  function exportPackingExcel() {
    try {
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const COLS = 9;
    const thin = { style: 'thin', color: { rgb: 'D1D5DB' } };
    const med  = { style: 'medium', color: { rgb: '374151' } };
    const allThin = { top: thin, bottom: thin, left: thin, right: thin };
    const allMed  = { top: med, bottom: med, left: med, right: med };
    const baseFont = { name: 'Arial', sz: 10 };
    const boldFont = { ...baseFont, bold: true };
    const articleFont = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '1F2937' } };
    const NUM = '#,##0.00';
    const cell = (v: string | number, s: object): XLSX.CellObject => ({ v, t: typeof v === 'number' ? 'n' : 's', s });
    const hdrCell = (v: string) => cell(v, {
      font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } },
      fill: { fgColor: { rgb: 'F3F4F6' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allThin,
    });
    const totalCell = (v: number) => cell(v, {
      font: { ...boldFont, sz: 11, color: { rgb: '111827' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      fill: { fgColor: { rgb: 'F3F4F6' } },
      border: allMed, numFmt: NUM,
    } as object);
    const sumRow = (label: string, value: number, isTotal = false) => {
      const row: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      row[6] = cell(label, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, ...(isTotal ? { fill: { fgColor: { rgb: 'F3F4F6' } } } : {}) });
      row[7] = isTotal ? totalCell(value) : cell(value, { font: boldFont, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, numFmt: NUM } as object);
      return row;
    };

    const aoa: (XLSX.CellObject | null)[][] = [];
    const merges: XLSX.Range[] = [];
    const rowH: { hpt: number }[] = [];
    let r = 0;

    aoa.push([
      cell('PACKING LIST', { font: { name: 'Arial', bold: true, sz: 16, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null,
      cell(`№ ${meta.number}`, { font: { name: 'Arial', bold: true, sz: 13, color: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 28 }; r++;

    aoa.push([
      cell(`Дата: ${date}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null,
      cell(meta.client_code || '—', { font: { ...boldFont, sz: 12, color: { rgb: '111827' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 16 }; r++;

    if (meta.client) {
      aoa.push([
        cell(meta.client, { font: { ...boldFont, sz: 11, color: { rgb: '374151' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
        ...Array(COLS - 1).fill(null),
      ]);
      merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
      rowH[r] = { hpt: 16 }; r++;
    }

    if (meta.delivery_location) {
      aoa.push([
        cell(meta.delivery_location, { font: { ...baseFont, sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
        ...Array(COLS - 1).fill(null),
      ]);
      merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
      rowH[r] = { hpt: 16 }; r++;
    }

    aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;

    aoa.push(['№', 'BRAND', 'COO', 'PART NUMBER', 'DESCRIPTION', 'QTY', 'UOM', 'PRICE', 'TOTAL'].map(h => hdrCell(h)));
    rowH[r] = { hpt: 22 }; r++;

    items.forEach((item, idx) => {
      const rowFill = idx % 2 !== 0 ? { fill: { fgColor: { rgb: 'F3F4F6' } } } : {};
      const dc = (v: string | number, align: 'left'|'center'|'right' = 'left', extra: object = {}) => cell(v, { font: baseFont, alignment: { horizontal: align, vertical: 'center', wrapText: true }, border: allThin, ...rowFill, ...extra });
      const bd = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, { font: boldFont, alignment: { horizontal: align, vertical: 'center' }, border: allThin, ...rowFill });
      const ac2 = (v: string) => cell(v, { font: { ...articleFont, color: { rgb: '1F2937' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin, ...rowFill });
      const sellTotal = item.quantity * item.unit_price;
      aoa.push([
        dc(idx + 1, 'center'),
        bd(item.brand || '', 'center'),
        dc(item.origin || '', 'center'),
        ac2(item.article || ''),
        dc(item.description || ''),
        dc(item.quantity, 'center'),
        dc(item.uom || '', 'center'),
        dc(item.unit_price, 'right', { numFmt: NUM }),
        dc(+sellTotal.toFixed(2), 'right', { numFmt: NUM }),
      ]);
      rowH[r] = { hpt: 20 }; r++;
    });

    aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;

    const qtyRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
    qtyRow[4] = cell('Total QTY:', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allMed });
    qtyRow[5] = cell(totalQty, { font: { ...boldFont, sz: 11, color: { rgb: '111827' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: allMed });
    aoa.push(qtyRow); rowH[r] = { hpt: 22 }; r++;

    aoa.push(sumRow('Subtotal:', +subtotal.toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    if (discountAmt > 0) {
      const discLabel = discountMode === 'fixed' ? 'Discount:' : `Discount ${meta.discount_percent}%:`;
      aoa.push(sumRow(discLabel, +(-discountAmt).toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }
    if (taxAmt > 0) {
      aoa.push(sumRow(`VAT ${taxEnabled ? TAX_RATE : 0}%:`, +taxAmt.toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }
    if (extraExpenses > 0) {
      aoa.push(sumRow('Доставка:', +extraExpenses.toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }
    aoa.push(sumRow('TOTAL:', +total.toFixed(2), true)); rowH[r] = { hpt: 24 }; r++;

    if ((meta.deposit_amount ?? 0) > 0) {
      aoa.push(sumRow('Депозит:', +(meta.deposit_amount ?? 0).toFixed(2))); rowH[r] = { hpt: 18 }; r++;
      aoa.push(sumRow('Остаток:', +Math.max(0, total - (meta.deposit_amount ?? 0)).toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 9 }, { wch: 17 }, { wch: 31 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 14 }];
    ws['!rows'] = rowH;
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PL');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `PL_${meta.client_code || 'CLIENT'}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function exportPackingPdf() {
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('pl-pdf-render')?.remove();
    const container = document.createElement('div');
    container.id = 'pl-pdf-render';

    const rows = items.map((item, idx) => `
      <tr style="height:34px;background:${idx % 2 !== 0 ? '#f3f4f6' : '#ffffff'};">
        <td class="ctr"><span style="display:block;width:100%;line-height:normal;">${idx + 1}</span></td><td class="brand"><span style="display:block;width:100%;line-height:normal;">${item.brand || ''}</span></td><td class="ctr"><span style="display:block;width:100%;line-height:normal;">${item.origin || ''}</span></td>
        <td class="ctr mono"><span style="display:block;width:100%;line-height:normal;">${item.article || ''}</span></td><td class="desc"><span style="display:block;width:100%;line-height:normal;">${item.description || ''}</span></td>
        <td class="ctr"><span style="display:block;width:100%;line-height:normal;">${item.quantity}</span></td><td class="ctr"><span style="display:block;width:100%;line-height:normal;">${item.uom || ''}</span></td>
      </tr>`).join('');

    container.innerHTML = `
      <div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;font-size:8px;color:#111;padding:20px;width:900px;background:#fff;box-sizing:border-box;">
        <div style="text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #111;">
          <div style="font-size:36px;font-weight:900;letter-spacing:0.18em;color:#111;line-height:1;font-family:'Calibri',sans-serif;">PACKING LIST</div>
          <div style="font-size:12px;font-weight:700;color:#555;margin-top:3px;font-family:'Calibri',sans-serif;">${meta.number}</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px;font-size:9px;">
            <div><div style="color:#111;font-size:16px;font-weight:900;letter-spacing:.04em;">${meta.client_code || '—'}</div>${meta.delivery_location ? `<div style="margin-top:3px;font-size:10px;color:#6b7280;">${meta.delivery_location}</div>` : ''}</div>
            <div><span style="color:#888;font-weight:500;">Date: </span><span style="font-weight:700;">${date}</span></div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1.5px solid #111;background:#f3f4f6;">
            <th style="width:22px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;border-right:1px solid #e0e0e0;">№</th>
            <th style="width:70px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;border-right:1px solid #e0e0e0;">Brand</th>
            <th style="width:42px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;border-right:1px solid #e0e0e0;">COO</th>
            <th style="width:96px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;border-right:1px solid #e0e0e0;">Part Number</th>
            <th style="text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;border-right:1px solid #e0e0e0;">Description</th>
            <th style="width:34px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;border-right:1px solid #e0e0e0;">QTY</th>
            <th style="width:34px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:2px 3px 3px;color:#333;">UOM</th>
          </tr></thead>
          <tbody>${rows
            .replace(/class="ctr mono"/g, 'style="text-align:center;font-family:\'Calibri\',sans-serif;font-size:9px;font-weight:700;color:#111827;height:34px;padding:0 3px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;white-space:nowrap;letter-spacing:0.02em;display:table-cell;"')
            .replace(/class="brand"/g, 'style="text-align:center;font-size:8px;height:34px;padding:0 3px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:table-cell;"')
            .replace(/class="ctr"/g, 'style="text-align:center;font-variant-numeric:tabular-nums;height:34px;padding:0 3px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;white-space:nowrap;display:table-cell;"')
            .replace(/class="desc"/g, 'style="text-align:center;height:34px;padding:0 3px;vertical-align:middle;line-height:normal;border-right:0.5px solid #dfe3e8;border-bottom:0.5px solid #dfe3e8;word-break:break-word;font-size:8px;display:table-cell;"')}</tbody>
        </table>
        <div style="margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end;">
          <div style="font-size:9px;color:#888;">
            <span style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total QTY:</span>
            <span style="font-weight:800;color:#111;margin-left:6px;">${totalQty}</span>
          </div>
          ${meta.deposit_amount > 0 ? `<table style="min-width:220px;border-top:1px solid #ddd;margin-top:8px;">
            <tr><td style="font-size:12px;font-weight:800;color:#666;padding-right:20px;padding-top:4px;">Amount</td><td style="font-size:12px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;padding-top:4px;">${fmt(total)} ${meta.currency}</td></tr>
            <tr><td style="color:#2563eb;font-size:9px;font-weight:500;padding-right:20px;padding-top:3px;padding-bottom:3px;">Deposit</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;color:#2563eb;">− ${fmt(meta.deposit_amount)} ${meta.currency}</td></tr>
            <tr><td style="font-size:11px;font-weight:800;border-top:1.5px dashed #2563eb;color:#2563eb;padding-right:20px;padding-top:4px;padding-bottom:2px;">Balance Due</td><td style="font-size:11px;font-weight:800;border-top:1.5px dashed #2563eb;text-align:right;font-variant-numeric:tabular-nums;color:#2563eb;padding-top:4px;padding-bottom:2px;">${fmt(Math.max(0, total - meta.deposit_amount))} ${meta.currency}</td></tr>
          </table>` : ''}
        </div>
      </div>`;

    Object.assign(container.style, { position: 'fixed', left: '-9999px', top: '0', width: '900px', background: '#fff', zIndex: '-1' });
    document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 4, useCORS: true, backgroundColor: '#fff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let yOffset = 0; let remaining = imgH;
      while (remaining > 0) { pdf.addImage(imgData, 'PNG', 0, -yOffset, pageW, imgH); remaining -= pageH; yOffset += pageH; if (remaining > 0) pdf.addPage(); }
      const pdfBlob = pdf.output('blob');
      downloadBlob(pdfBlob, `PL_${meta.client_code || 'CLIENT'}.pdf`);
    } catch (err) { console.error('PDF export failed:', err); alert('Ошибка экспорта PDF: ' + (err instanceof Error ? err.message : String(err))); }
    finally { container.remove(); }
  }

  const filteredProducts = query.trim()
    ? products.filter(p =>
        p.article.toLowerCase().includes(query.toLowerCase()) ||
        p.brand.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase())
      )
    : products.slice(0, 50);

  const filteredClients = clientQuery.trim()
    ? clients.filter(c =>
        c.name.toLowerCase().includes(clientQuery.toLowerCase()) ||
        c.code.toLowerCase().includes(clientQuery.toLowerCase())
      )
    : clients.slice(0, 30);

  const colMeta: Record<ColId, { label: string; align: 'left' | 'center' | 'right'; width: number }> = {
    article:  { label: 'Part Number',  align: 'left',   width: 160 },
    brand:    { label: 'Brand',        align: 'left',   width: 140 },
    desc:     { label: 'Описание',     align: 'left',   width: 280 },
    coo:      { label: 'COO',          align: 'left',   width: 70  },
    uom:      { label: 'UOM',          align: 'center', width: 72  },
    qty:      { label: 'QTY',          align: 'center', width: 90  },
    price:    { label: 'Цена',         align: 'right',  width: 120 },
    total:    { label: 'Итого',        align: 'right',  width: 120 },
  };

  function handleColDragStart(idx: number) { setColDragIdx(idx); }
  function handleColDragOver(idx: number) { if (colDragIdx !== null && colDragIdx !== idx) setColOverIdx(idx); }
  function handleColDrop() {
    if (colDragIdx !== null && colOverIdx !== null && colDragIdx !== colOverIdx) {
      const newOrder = [...colOrder];
      const [moved] = newOrder.splice(colDragIdx, 1);
      newOrder.splice(colOverIdx, 0, moved);
      setColOrder(newOrder);
      localStorage.setItem('smeta_col_order', JSON.stringify(newOrder));
    }
    setColDragIdx(null);
    setColOverIdx(null);
  }

  function handleRowDragStart(idx: number) { setRowDragIdx(idx); }
  function handleRowDragOver(idx: number) { if (rowDragIdx !== null && rowDragIdx !== idx) setRowOverIdx(idx); }
  function handleRowDrop() {
    if (rowDragIdx !== null && rowOverIdx !== null && rowDragIdx !== rowOverIdx) {
      const newItems = [...items];
      const [moved] = newItems.splice(rowDragIdx, 1);
      newItems.splice(rowOverIdx, 0, moved);
      setItems(newItems);
    }
    setRowDragIdx(null);
    setRowOverIdx(null);
  }

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all bg-white';

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <button onClick={() => void leaveEditor()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={16} />Назад
        </button>
        <div className="flex items-center gap-2">
          {autoSaveStatus === 'saving' && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              Сохранение...
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="text-xs text-emerald-500 flex items-center gap-1">
              <Check size={11} strokeWidth={3} />
              Автосохранено
            </span>
          )}
          {autoSaveStatus === 'error' && (
            <span className="text-xs text-red-400 flex items-center gap-1">
              <CloudOff size={11} />
              Ошибка сохранения
            </span>
          )}
          <button onClick={exportExcel} title="Excel"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition-colors">
            <FileSpreadsheet size={16} />
          </button>
          <button onClick={exportPdf} title="PDF"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors">
            <FilePdf size={16} />
          </button>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
          <button onClick={exportPackingExcel} title="Packing List — Excel"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-emerald-600 transition-colors">
            <Package size={16} />
          </button>
          <button onClick={exportPackingPdf} title="Packing List — PDF"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors">
            <Package size={16} className="text-red-400" />
          </button>
          {!isNew && !confirmed && (
            <button onClick={confirmProforma} disabled={confirming}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-emerald-500 border border-emerald-500 px-3 py-1.5 rounded-lg hover:bg-emerald-600 active:opacity-75 transition-all disabled:opacity-50">
              <CheckCircle2 size={13} />{confirming ? 'Подтверждение...' : 'Подтвердить'}
            </button>
          )}
          {confirmed && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <CheckCircle2 size={13} />Подтверждено
            </span>
          )}
          <button onClick={save} disabled={saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-gray-900 px-4 py-1.5 rounded-lg hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-50">
            {saving ? 'Сохранение...' : isNew ? 'Создать' : 'Сохранить'}
          </button>

        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-5 py-5 space-y-4">
          {error && <div className="text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-xl">{error}</div>}

          {/* Meta form */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Номер сметы</label>
                <input value={meta.number} onChange={e => setMeta(m => ({ ...m, number: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save(); } }}
                  className={inputCls} placeholder="PRO-001" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Код клиента</label>
                <div className="relative">
                  <input value={meta.client_code} onChange={e => setMeta(m => ({ ...m, client_code: e.target.value }))}
                    onBlur={() => {
                      if (isNew && meta.client_code) {
                        const matched = clients.find(c => c.code.toLowerCase() === meta.client_code.toLowerCase());
                        if (matched) generateNumberFromClient(matched.code);
                      }
                    }}
                    onFocus={() => setShowClientPicker(true)}
                    className={inputCls} placeholder="КК-001" />
                  {meta.client_code && (
                    <button type="button" onClick={() => setMeta(m => ({ ...m, client_code: '', client: '' }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Валюта</label>
                <div className="flex gap-2">
                  {CURRENCIES.map(c => (
                    <button key={c} type="button" onClick={() => handleCurrencyChange(c)}
                      className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                        meta.currency === c ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                      }`}>{c}</button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* Items table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900">Позиции</span>
                {items.length > 0 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{items.length}</span>}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setShowCost(v => !v)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showCost ? 'bg-red-50 border-red-200 text-red-500' : 'bg-gray-100 border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                    {showCost ? 'Hide' : 'Cost'}
                  </button>
                <button onClick={() => setShowSearch(true)}
                  className="flex items-center gap-1.5 text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-xl hover:bg-gray-800 transition-all active:opacity-75">
                  <Plus size={13} />Добавить
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: showCost ? 1200 : 600 }}>
                <thead>
                  <tr className="border-b-2 border-gray-200 bg-gray-100">
                    <th className="w-8 px-3 py-3" />
                    <th className="w-12 px-2 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-gray-500">№</th>
                    {colOrder.map((col, idx) => (
                      <th key={col}
                        draggable
                        onDragStart={() => handleColDragStart(idx)}
                        onDragOver={e => { e.preventDefault(); handleColDragOver(idx); }}
                        onDrop={handleColDrop}
                        onDragEnd={() => { setColDragIdx(null); setColOverIdx(null); }}
                        className={`px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 cursor-grab select-none ${
                          colMeta[col].align === 'right' ? 'text-right' : colMeta[col].align === 'center' ? 'text-center' : 'text-left'
                        } ${colDragIdx === idx ? 'opacity-50' : ''} ${colOverIdx === idx ? 'bg-blue-50' : ''}`}
                        style={{ width: colMeta[col].width, minWidth: colMeta[col].width }}>
                        <span className="flex items-center gap-1">
                          <GripVertical size={10} className="text-gray-400 flex-shrink-0" />
                          {colMeta[col].label}
                        </span>
                      </th>
                    ))}
                    {showCost && (
                      <>
                        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-red-500 text-right border-l border-red-100" style={{ width: 140, minWidth: 140 }}>Cost</th>
                        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-red-500 text-right" style={{ width: 140, minWidth: 140 }}>Total cost</th>
                        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-red-500 text-left" style={{ width: 120, minWidth: 120 }}>Supplier</th>
                        <th className="px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600 text-right border-l border-emerald-100" style={{ width: 120, minWidth: 120 }}>Profit</th>
                      </>
                    )}
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const sellTotal = item.quantity * item.unit_price;
                    const costRaw = item.quantity * item.purchase_price;
                    const sDiscMode = item.supplier_discount_mode ?? 'percent';
                    const hasPreviousSupplierItem = items.slice(0, idx).some(previous => (previous.supplier ?? '').trim() === (item.supplier ?? '').trim());
                    const costBase = sDiscMode === 'percent'
                      ? costRaw * (1 - (item.supplier_discount_percent ?? 0) / 100)
                      : Math.max(0, costRaw - (hasPreviousSupplierItem ? 0 : (item.supplier_discount_fixed ?? 0)));
                    const costTotal = costBase * (item.purchase_tax_enabled ? 1.05 : 1);
                    const itemProfit = sellTotal - costTotal;
                    const isRowDragging = rowDragIdx === idx;
                    const isRowOver = rowOverIdx === idx && rowDragIdx !== idx;
                    return (
                      <tr key={item._key}
                        className={`border-b border-gray-100 last:border-0 transition-colors ${
                          isRowDragging ? 'opacity-40' : isRowOver ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
                        }`}>
                        <td className="px-2 py-2 align-middle">
                          <div
                            draggable
                            onDragStart={() => handleRowDragStart(idx)}
                            onDragOver={e => { e.preventDefault(); handleRowDragOver(idx); }}
                            onDrop={handleRowDrop}
                            onDragEnd={() => { setRowDragIdx(null); setRowOverIdx(null); }}
                            className="cursor-grab text-gray-300 hover:text-gray-500 flex items-center justify-center">
                            <GripVertical size={14} />
                          </div>
                        </td>
                        <td className="w-12 px-2 py-2 align-middle text-center text-xs font-bold text-gray-500 tabular-nums">{idx + 1}</td>
                        {colOrder.map(col => {
                          switch (col) {
                            case 'article': return (
                              <td key="article" className="px-3 py-2 align-middle">
                                <input type="text" value={item.article}
                                  onChange={e => updateItem(item._key, { article: e.target.value })}
                                  onFocus={() => setFocusedItemKey(item._key)}
                                  className="w-full font-bold text-gray-800 text-xs bg-gray-100 border border-gray-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                  style={{ fontFamily: "'Calibri', sans-serif", letterSpacing: '0.02em' }}
                                  placeholder="SKU" />
                              </td>
                            );
                            case 'brand': return (
                              <td key="brand" className="px-3 py-2 align-middle">
                                <input type="text" value={item.brand}
                                  onChange={e => updateItem(item._key, { brand: e.target.value })}
                                  className="w-full text-xs text-gray-700 bg-gray-100 border border-gray-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                  placeholder="Brand" />
                              </td>
                            );
                            case 'desc': return (
                              <td key="desc" className="px-3 py-2 align-middle">
                                <input type="text" value={item.description}
                                  onChange={e => updateItem(item._key, { description: e.target.value })}
                                  className="w-full text-xs text-gray-600 bg-gray-100 border border-gray-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                  placeholder="Описание" />
                              </td>
                            );
                            case 'coo': return (
                              <td key="coo" className="px-3 py-2 align-middle">
                                <input type="text" value={item.origin}
                                  onChange={e => updateItem(item._key, { origin: e.target.value })}
                                  className="w-full text-xs text-gray-500 bg-gray-100 border border-gray-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-400"
                                  placeholder="CN" />
                              </td>
                            );
                            case 'uom': return (
                              <td key="uom" className="px-3 py-2 align-middle">
                                <select value={item.uom} onChange={e => updateItem(item._key, { uom: e.target.value })}
                                  className="w-full text-xs text-center text-gray-700 bg-gray-100 border border-gray-100 rounded-md py-1 px-1 focus:outline-none focus:ring-1 focus:ring-gray-400">
                                  <option>PCS</option><option>CTN</option><option>SET</option>
                                </select>
                              </td>
                            );
                            case 'qty': return (
                              <td key="qty" className="px-3 py-3 align-middle">
                                <input type="number" min="0" step="1"
                                  value={item.quantity === 0 ? '' : item.quantity}
                                  onFocus={e => e.target.select()}
                                  onChange={e => updateItem(item._key, { quantity: parseFloat(e.target.value) || 0 })}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                  className="w-full font-bold text-gray-800 text-xs text-center bg-gray-100 border border-gray-100 rounded-md py-1 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                              </td>
                            );
                            case 'price': return (
                              <td key="price" className="px-3 py-3 align-middle">
                                <input type="number" min="0" step="0.01"
                                  value={item.unit_price === 0 ? '' : item.unit_price}
                                  onFocus={e => e.target.select()}
                                  onChange={e => updateItem(item._key, { unit_price: parseFloat(e.target.value) || 0 })}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                  className="w-full font-semibold text-gray-800 text-xs text-right bg-gray-100 border border-gray-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-gray-400" />
                              </td>
                            );
                            case 'total': return (
                              <td key="total" className="px-3 py-3 align-middle text-right">
                                <span className="font-bold text-gray-900 text-xs tabular-nums">{fmt(sellTotal)}</span>
                              </td>
                            );
                            default: return null;
                          }
                        })}
                        {showCost && (
                          <>
                            <td className="px-3 py-3 align-middle bg-red-50/60 border-l border-red-100">
                              <input type="number" min="0" step="0.01"
                                value={item.purchase_price === 0 ? '' : item.purchase_price}
                                onChange={e => updateItem(item._key, { purchase_price: parseFloat(e.target.value) || 0 })}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                                placeholder="0.00"
                                className="w-full font-semibold text-red-700 text-xs text-right bg-red-100/80 border border-red-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-red-300 placeholder-red-200" />
                            </td>
                            <td className="px-2 py-3 align-middle bg-red-50/60 text-right">
                              <span className="tabular-nums text-xs font-medium text-red-600">{fmt(costTotal)}</span>
                            </td>
                            <td className="px-3 py-3 align-middle bg-red-50/60">
                              <input type="text" value={item.supplier}
                                onChange={e => updateItem(item._key, { supplier: e.target.value })}
                                placeholder="Поставщик"
                                className="w-full text-xs text-red-600 bg-red-100/60 border border-red-100 rounded-md py-1 px-2 focus:outline-none focus:ring-1 focus:ring-red-300 placeholder-red-200" />
                            </td>
                            <td className={`px-2 py-2 align-middle text-right tabular-nums text-xs font-bold border-l border-emerald-100 ${itemProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(itemProfit)}</td>
                          </>
                        )}
                        <td className="px-2 py-2 align-middle">
                          <button onClick={() => removeItem(item._key)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={colOrder.length + (showCost ? 7 : 3)} className="px-6 py-10 text-center text-sm text-gray-400">
                        Нет позиций. Нажмите «Добавить» или Ctrl+N / ⌘N.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            {items.length > 0 && (
              <div className="px-6 py-5 border-t border-gray-100 flex items-start justify-between gap-4 flex-wrap">
                <div className="text-xs text-gray-400 space-y-1">
                  <div>Total QTY: <span className="font-bold text-gray-700 font-pro">{totalQty}</span></div>
                  {showCost && purchaseSubtotal > 0 && (
                    <div>Purchase QTY: <span className="font-bold text-red-600 font-pro">{totalQty}</span></div>
                  )}
                </div>
                <div className="min-w-[260px] space-y-2 border-t border-gray-100 pt-3">
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-medium font-pro">{fmt(subtotal)} {meta.currency}</span>
                  </div>
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>{discountMode === 'fixed' ? 'Discount' : `Discount ${meta.discount_percent}%`}</span>
                      <span className="tabular-nums text-red-500 font-medium font-pro">− {fmt(discountAmt)} {meta.currency}</span>
                    </div>
                  )}
                  {taxAmt > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>VAT {TAX_RATE}%</span>
                      <span className="tabular-nums font-medium font-pro">+ {fmt(taxAmt)} {meta.currency}</span>
                    </div>
                  )}
                  {extraDelivery > 0 && (
                    <div className="flex justify-between text-sm text-red-500">
                      <span>{meta.extra_delivery_label || 'Доп. расходы'}</span>
                      <span className="tabular-nums font-medium font-pro">− {fmt(extraDelivery)} {meta.currency}</span>
                    </div>
                  )}
                  {extraExpenses > 0 && (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span>Доставка</span>
                      <span className="tabular-nums font-medium font-pro">+ {fmt(extraExpenses)} {meta.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-gray-900 border-t-2 border-gray-900 pt-3">
                    <span>Amount</span>
                    <span className="tabular-nums font-pro">{fmt(total)} {meta.currency}</span>
                  </div>
                  {meta.deposit_amount > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-amber-600">
                        <span>Депозит</span>
                        <span className="tabular-nums font-medium font-pro">− {fmt(meta.deposit_amount)} {meta.currency}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-gray-900">
                        <span>Остаток</span>
                        <span className="tabular-nums font-pro">{fmt(Math.max(0, total - meta.deposit_amount))} {meta.currency}</span>
                      </div>
                    </>
                  )}
                  {showCost && purchaseSubtotal > 0 && (
                    <>
                      <div className={`flex justify-between text-sm font-bold border-t border-gray-100 pt-2 ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        <span>Прибыль</span>
                        <span className="tabular-nums font-pro">
                          {fmt(profit)} {meta.currency}
                          {total > 0 && <span className="ml-1 text-xs opacity-70">({(profit / total * 100).toFixed(1)}%)</span>}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Supplier totals */}
            {showCost && Object.keys(supplierData).length > 0 && (
              <div className="px-6 pb-5 border-t border-red-50">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 mt-3">Поставщики</p>
                <div className="space-y-1.5">
                  {Object.entries(supplierData).map(([name, data]) => (
                    <div key={name} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-red-50/60 border border-red-100">
                      <button
                        type="button"
                        onClick={() => toggleSupplierPaid(name)}
                        className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${data.paid ? 'bg-red-400 border-red-400' : 'bg-white border-red-300 hover:border-red-400'}`}>
                        {data.paid && <Check size={11} className="text-white" strokeWidth={3} />}
                      </button>
                      <span className="font-medium text-sm flex-1 text-red-600 truncate">{name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex rounded-lg border border-red-200 overflow-hidden flex-shrink-0">
                          <button type="button" onClick={() => setItems(prev => prev.map(i => (i.supplier ?? '').trim() === name ? { ...i, supplier_discount_mode: 'percent' } : i))}
                            className={`px-1.5 py-1 text-[10px] font-bold transition-all ${data.discMode === 'percent' ? 'bg-red-500 text-white' : 'bg-white text-red-400 hover:bg-red-50'}`}>%</button>
                          <button type="button" onClick={() => setItems(prev => prev.map(i => (i.supplier ?? '').trim() === name ? { ...i, supplier_discount_mode: 'fixed' } : i))}
                            className={`px-1.5 py-1 text-[10px] font-bold transition-all ${data.discMode === 'fixed' ? 'bg-red-500 text-white' : 'bg-white text-red-400 hover:bg-red-50'}`}>фикс</button>
                        </div>
                        {data.discMode === 'percent' ? (
                          <input type="number" min="0" max="100" step="0.1"
                            value={data.discPct === 0 ? '' : data.discPct}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; setItems(prev => prev.map(i => (i.supplier ?? '').trim() === name ? { ...i, supplier_discount_percent: v } : i)); }}
                            placeholder="0" className="w-12 px-1 py-1 text-[11px] text-center rounded-lg border border-red-200 focus:outline-none focus:ring-1 focus:ring-red-400 tabular-nums" />
                        ) : (
                          <input type="number" min="0" step="0.01"
                            value={data.discFixed === 0 ? '' : data.discFixed}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; setItems(prev => prev.map(i => (i.supplier ?? '').trim() === name ? { ...i, supplier_discount_fixed: v } : i)); }}
                            placeholder="0" className="w-16 px-1 py-1 text-[11px] text-center rounded-lg border border-red-200 focus:outline-none focus:ring-1 focus:ring-red-400 tabular-nums" />
                        )}
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                        {data.count}шт
                      </span>
                      {data.payment > 0 && (
                        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                          опл.<span className="font-semibold text-gray-600">{fmt(data.payment)}</span>
                        </span>
                      )}
                      <span className={`tabular-nums text-sm font-bold font-pro text-red-600 flex-shrink-0 ${data.paid ? 'line-through decoration-red-400' : ''}`}>{fmt(data.total)} {meta.currency}</span>
                      <button
                        type="button"
                        onClick={() => toggleSupplierTax(name)}
                        title="НДС поставщика"
                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border transition-all leading-none ${
                          data.taxAll
                            ? 'bg-red-500 text-white border-red-500'
                            : data.taxSome
                              ? 'bg-red-100 text-red-500 border-red-300'
                              : 'bg-white text-red-300 border-red-200 hover:border-red-400 hover:text-red-500'
                        }`}>
                        НДС {TAX_RATE}%
                      </button>
                      <button
                        type="button"
                        onClick={() => exportSupplierExcel(name)}
                        title="Экспорт в Excel"
                        className="flex-shrink-0 p-1 rounded-lg text-red-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <FileSpreadsheet size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Purchase tax toggle */}
            <div className="px-6 pb-5 flex items-center gap-3">
              <button type="button" onClick={() => {
                const allOn = items.every(i => i.purchase_tax_enabled);
                setItems(prev => prev.map(i => ({ ...i, purchase_tax_enabled: !allOn })));
              }}
                className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                  items.length > 0 && items.every(i => i.purchase_tax_enabled)
                    ? 'bg-red-500 text-white border-red-500'
                    : items.some(i => i.purchase_tax_enabled)
                      ? 'bg-red-100 text-red-600 border-red-300'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                }`}>
                <CreditCard size={12} />
                {items.length > 0 && items.every(i => i.purchase_tax_enabled)
                  ? `Снять НДС ${TAX_RATE}% со всех`
                  : `НДС ${TAX_RATE}% для всех`}
              </button>
            </div>

            {/* Bottom options: discount, tax, extra delivery */}
            <div className="px-6 pb-6 border-t border-gray-100 pt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Скидка</label>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-xl border border-gray-200 overflow-hidden flex-shrink-0">
                    <button type="button" onClick={() => setDiscountMode('percent')}
                      className={`px-3 py-2 text-xs font-semibold transition-all ${discountMode === 'percent' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>%</button>
                    <button type="button" onClick={() => setDiscountMode('fixed')}
                      className={`px-3 py-2 text-xs font-semibold transition-all ${discountMode === 'fixed' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>фикс</button>
                  </div>
                  {discountMode === 'percent' ? (
                    <input type="number" min="0" max="100" step="0.1"
                      value={meta.discount_percent === 0 ? '' : meta.discount_percent}
                      onChange={e => setMeta(m => ({ ...m, discount_percent: parseFloat(e.target.value) || 0 }))}
                      placeholder="0" className={inputCls} />
                  ) : (
                    <input type="number" min="0" step="0.01"
                      value={discountFixed === 0 ? '' : discountFixed}
                      onChange={e => setDiscountFixed(parseFloat(e.target.value) || 0)}
                      placeholder="0.00" className={inputCls} />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Налог {TAX_RATE}%</label>
                <button type="button" onClick={() => setTaxEnabled(v => !v)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    taxEnabled ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}>{taxEnabled ? `Включён (${TAX_RATE}%)` : 'Выключен'}</button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Доп. расходы</label>
                <input type="number" min="0" step="0.01"
                  value={meta.extra_delivery_cost === 0 ? '' : meta.extra_delivery_cost}
                  onChange={e => setMeta(m => ({ ...m, extra_delivery_cost: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Депозит клиента</label>
                <input type="number" min="0" step="0.01"
                  value={meta.deposit_amount === 0 ? '' : meta.deposit_amount}
                  onChange={e => setMeta(m => ({ ...m, deposit_amount: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Доставка</label>
                <input type="number" min="0" step="0.01"
                  value={meta.extra_expenses === 0 ? '' : meta.extra_expenses}
                  onChange={e => setMeta(m => ({ ...m, extra_expenses: parseFloat(e.target.value) || 0 }))}
                  placeholder="0.00" className={inputCls} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Местоположение</label>
                <select
                  value={meta.delivery_location}
                  onChange={e => setMeta(m => ({ ...m, delivery_location: e.target.value }))}
                  className={inputCls}>
                  <option value="">— Не выбрано —</option>
                  <option value="Dubai-Mainland">Dubai-Mainland</option>
                  <option value="Jebel-Ali / Freezone">Jebel-Ali / Freezone</option>
                </select>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* Shift+L last price popup */}
      {lastPriceInfo && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-4 flex items-center gap-4 min-w-[280px]">
          <div className="flex-1">
            <p className="text-xs text-gray-400 mb-0.5">Последняя цена продажи</p>
            <p className="text-xs font-bold text-gray-300 font-calibri">{lastPriceInfo.article}</p>
            <p className="text-xl font-black tabular-nums mt-1">{fmt(lastPriceInfo.price)} <span className="text-sm font-semibold text-gray-400">{meta.currency}</span></p>
            <p className="text-xs text-gray-500 mt-0.5">{lastPriceInfo.proformaNumber} · {lastPriceInfo.date}</p>
          </div>
          <button onClick={() => setLastPriceInfo(null)} className="text-gray-500 hover:text-gray-300 transition-colors p-1"><X size={16} /></button>
        </div>
      )}

      {/* Duplicate article warning modal */}
      {duplicateWarn && (
        <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDuplicateWarn(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-gray-900">Артикул уже добавлен</h3>
            <p className="mt-2 text-sm text-gray-500">
              Артикул «{duplicateWarn.article}» уже есть в списке. Добавить его ещё раз?
            </p>
            <div className="flex gap-2 mt-6">
              <button type="button" onClick={() => setDuplicateWarn(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Отмена
              </button>
              <button type="button" onClick={() => {
                const product = duplicateWarn;
                setDuplicateWarn(null);
                addProduct(product, true);
              }}
                className="flex-1 py-2.5 rounded-xl bg-gray-900 text-sm font-semibold text-white hover:bg-gray-800 active:scale-95 transition-all">
                Всё равно добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {showSearch && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowSearch(false)}>
          <div className="ml-auto w-full max-w-sm bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="flex-1 relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input ref={el => { (searchRef as React.MutableRefObject<HTMLInputElement | null>).current = el; el?.focus(); }}
                  type="text" value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Артикул, бренд, описание..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300" />
              </div>
              <button onClick={() => setShowSearch(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
              <button onClick={addBlank}
                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-2 text-sm text-gray-500 border border-dashed border-gray-200 mb-2">
                <Plus size={14} />Пустая строка
              </button>
              {filteredProducts.map(p => (
                <button key={p.id} onClick={() => addProduct(p)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-bold text-gray-900 font-calibri">{p.article}</span>
                    {p.brand && <span className="text-xs text-gray-400">{p.brand}</span>}
                  </div>
                  {p.description && <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    {p.price_aed > 0 && <span className="text-xs font-semibold text-gray-600">{p.price_aed} AED</span>}
                    {p.price_usd > 0 && <span className="text-xs font-semibold text-gray-600">{p.price_usd} USD</span>}
                    {p.price_tjs > 0 && <span className="text-xs font-semibold text-gray-600">{p.price_tjs} TJS</span>}
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && query && (
                <div className="text-center py-10 text-sm text-gray-400">Ничего не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Client picker */}
      {showClientPicker && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end" onClick={() => setShowClientPicker(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto max-h-[60vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" value={clientQuery} onChange={e => setClientQuery(e.target.value)}
                  placeholder="Поиск клиента..."
                  autoFocus
                  className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none" />
              </div>
              <button onClick={() => setShowClientPicker(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5">
              {filteredClients.map(c => (
                <button key={c.id} onClick={() => {
                  setMeta(m => ({ ...m, client_code: c.code, client: c.name }));
                  setShowClientPicker(false);
                  setClientQuery('');
                  if (isNew) generateNumberFromClient(c.code);
                }}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 font-calibri tracking-widest">{c.code}</span>
                    <span className="text-xs text-gray-400">{c.name}</span>
                  </div>
                  {c.country && <p className="text-xs text-gray-400 mt-0.5 ml-0.5">{c.country}</p>}
                </button>
              ))}
              {filteredClients.length === 0 && <div className="text-center py-8 text-sm text-gray-400">Клиенты не найдены</div>}
            </div>
          </div>
        </div>
      )}

      {/* Confirm status bar */}
      {confirmed && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 py-2 bg-emerald-50 border-t border-emerald-200 text-xs font-semibold text-emerald-600">
          <CheckCircle2 size={13} />Смета подтверждена и перемещена в раздел «Счёт»
          <button onClick={() => void leaveEditor()} className="ml-2 underline underline-offset-2 hover:text-emerald-800">← Вернуться</button>
        </div>
      )}
    </div>
  );
}
