import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, Plus, ChevronRight, X, Pencil, Trash2,
  Phone, Hash, User, Receipt, CreditCard, Truck, BookOpen,
  ArrowLeft, ArrowDown, ArrowUp, Check, Search, Globe, FileSpreadsheet, FileText, Package, Eye,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase, type Client, type Proforma, type ProformaItem } from '../lib/supabase';
import { downloadBlob } from '../lib/download';

interface ClientTransaction {
  id: string;
  client_id: string;
  proforma_id?: string | null;
  date: string;
  amount: number;
  details: string;
  created_at: string;
}

interface LedgerDisplayRow {
  key: string;
  date: string;
  netAmount: number;
  balance: number;
  details: string;
  proforma_id: string | null;
  txIds: string[];
  singleTx?: ClientTransaction;
}

type View = 'list' | 'detail' | 'form' | 'ledger' | 'articles' | 'invoice';

// Country list with flag emojis (code → {name, flag})
const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: 'TJ', name: 'Таджикистан', flag: '🇹🇯' },
  { code: 'UZ', name: 'Узбекистан', flag: '🇺🇿' },
  { code: 'KZ', name: 'Казахстан', flag: '🇰🇿' },
  { code: 'KG', name: 'Кыргызстан', flag: '🇰🇬' },
  { code: 'TM', name: 'Туркменистан', flag: '🇹🇲' },
  { code: 'RU', name: 'Россия', flag: '🇷🇺' },
  { code: 'AE', name: 'ОАЭ', flag: '🇦🇪' },
  { code: 'CN', name: 'Китай', flag: '🇨🇳' },
  { code: 'TR', name: 'Турция', flag: '🇹🇷' },
  { code: 'AF', name: 'Афганистан', flag: '🇦🇫' },
  { code: 'IR', name: 'Иран', flag: '🇮🇷' },
  { code: 'PK', name: 'Пакистан', flag: '🇵🇰' },
  { code: 'IN', name: 'Индия', flag: '🇮🇳' },
  { code: 'DE', name: 'Германия', flag: '🇩🇪' },
  { code: 'US', name: 'США', flag: '🇺🇸' },
  { code: 'GB', name: 'Великобритания', flag: '🇬🇧' },
  { code: 'FR', name: 'Франция', flag: '🇫🇷' },
  { code: 'IT', name: 'Италия', flag: '🇮🇹' },
  { code: 'JP', name: 'Япония', flag: '🇯🇵' },
  { code: 'KR', name: 'Южная Корея', flag: '🇰🇷' },
  { code: 'SA', name: 'Саудовская Аравия', flag: '🇸🇦' },
  { code: 'BY', name: 'Беларусь', flag: '🇧🇾' },
  { code: 'UA', name: 'Украина', flag: '🇺🇦' },
  { code: 'OTHER', name: 'Другое', flag: '🌍' },
];

export function countryFlag(code: string) {
  return COUNTRIES.find(c => c.code === code)?.flag ?? '';
}
export function countryName(code: string) {
  return COUNTRIES.find(c => c.code === code)?.name ?? code;
}

const emptyClient = (): Omit<Client, 'id' | 'created_at'> => ({ name: '', code: '', phones: '', country: '' });
const emptyTx = (): Omit<ClientTransaction, 'id' | 'client_id' | 'created_at'> => ({
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  details: '',
});

export default function ClientsPage({ owner }: { owner: string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientBalances, setClientBalances] = useState<Record<string, number>>({});
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Client | null>(null);
  const [form, setForm] = useState(emptyClient());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [invoices, setInvoices] = useState<Proforma[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [countryFilter, setCountryFilter] = useState('');

  // Ledger state
  const [transactions, setTransactions] = useState<ClientTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [txForm, setTxForm] = useState(emptyTx());
  const [txFormMode, setTxFormMode] = useState<'add' | 'edit' | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [txAmountType, setTxAmountType] = useState<'+' | '-'>('+');
  const [deletingTxId, setDeletingTxId] = useState<string | null>(null);

  // Articles state
  interface ArticleRow { article: string; brand: string; description: string; uom: string; totalQty: number; }
  const [articleRows, setArticleRows] = useState<ArticleRow[]>([]);
  const [articleSearch, setArticleSearch] = useState('');
  const [loadingArticles, setLoadingArticles] = useState(false);

  const [invoiceItems, setInvoiceItems] = useState<ProformaItem[]>([]);
  const [loadingInvoiceItems, setLoadingInvoiceItems] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<Proforma | null>(null);
  const [showCost, setShowCost] = useState(false);

  async function openInvoiceDetail(p: Proforma) {
    setViewingInvoice(p);
    setShowCost(false);
    setView('invoice');
    setLoadingInvoiceItems(true);
    const { data } = await supabase.from('proforma_items').select('*').eq('proforma_id', p.id).eq('owner', owner).order('sort_order');
    if (data) setInvoiceItems(data as ProformaItem[]);
    setLoadingInvoiceItems(false);
  }

  function exportInvoiceExcel(inv: Proforma, items: ProformaItem[]) {
    try {
      const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const COLS = 9;
      const thin = { style: 'thin', color: { rgb: 'D1D5DB' } };
      const med  = { style: 'medium', color: { rgb: '374151' } };
      const allThin = { top: thin, bottom: thin, left: thin, right: thin };
      const allMed  = { top: med,  bottom: med,  left: med,  right: med  };
      const baseFont = { name: 'Arial', sz: 10 };
      const boldFont = { ...baseFont, bold: true };
      const articleFont = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '111827' } };
      const cell = (v: string | number, s: object): XLSX.CellObject => ({ v, t: typeof v === 'number' ? 'n' : 's', s });
      const hdrCell = (v: string) => cell(v, { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, fill: { fgColor: { rgb: 'F3F4F6' } }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: allThin });
      const labelCell = (v: string) => cell(v, { font: { ...boldFont, sz: 9, color: { rgb: '9CA3AF' } }, alignment: { horizontal: 'right', vertical: 'center' }, fill: { fgColor: { rgb: 'F9FAFB' } }, border: allThin });
      const totalCell = (v: number) => cell(v, { font: { ...boldFont, sz: 11, color: { rgb: '111827' } }, alignment: { horizontal: 'right', vertical: 'center' }, fill: { fgColor: { rgb: 'F3F4F6' } }, border: allMed, numFmt: '#,##0.00' } as object);

      const aoa: (XLSX.CellObject | null)[][] = [];
      const merges: XLSX.Range[] = [];
      const rowH: { hpt: number }[] = [];
      let r = 0;

      aoa.push([
        cell('INVOICE', { font: { name: 'Arial', bold: true, sz: 16, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
        null, null, null, null, null,
        cell(`№ ${inv.number}`, { font: { name: 'Arial', bold: true, sz: 13, color: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
        null, null,
      ]);
      merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
      merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
      rowH[r] = { hpt: 28 }; r++;

      aoa.push([
        cell(`Дата: ${date}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
        null, null, null, null, null,
        cell(`Валюта: ${inv.currency}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
        null, null,
      ]);
      merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
      merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
      rowH[r] = { hpt: 16 }; r++;

      aoa.push([
        cell(`КК: ${inv.client_code || '—'}`, { font: { ...boldFont, sz: 11 }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F9FAFB' } }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } }),
        null, null, null, null, null, null, null, null,
      ]);
      merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
      rowH[r] = { hpt: 20 }; r++;

      const deliveryInfo = [
        inv.delivery_date ? `Delivery date: ${inv.delivery_date}` : '',
        inv.delivery_location ? `Delivery location: ${inv.delivery_location}` : '',
        inv.delivery_type ? `Type of delivery: ${inv.delivery_type}` : '',
        inv.delivery_qty ? `QTY: ${inv.delivery_qty}` : '',
      ].filter(Boolean);
      if (deliveryInfo.length) {
        aoa.push([ cell(deliveryInfo.join('  ·  '), { font: { ...baseFont, bold: true, color: { rgb: '15803D' } }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F0FDF4' } } }), null, null, null, null, null, null, null, null ]);
        aoa.push([ cell('ДЕТАЛИ ЗАКАЗА', { font: { ...boldFont, sz: 8, color: { rgb: '15803D' } }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F0FDF4' } } }), null, null, null, null, null, null, null, null ]);
        merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
        rowH[r] = { hpt: 16 }; r++;
      }

      aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;

      aoa.push(['№','BRAND','COO','PART NUMBER','DESCRIPTION','QTY','UOM','PRICE','TOTAL'].map(h => hdrCell(h)));
      rowH[r] = { hpt: 22 }; r++;

      items.forEach((item, idx) => {
        const rowFill = idx % 2 !== 0 ? { fill: { fgColor: { rgb: 'F3F4F6' } } } : {};
        const dc = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, { font: baseFont, alignment: { horizontal: align, vertical: 'center', wrapText: true }, border: allThin, ...rowFill });
        const bd = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, { font: boldFont, alignment: { horizontal: align, vertical: 'center' }, border: allThin, ...rowFill });
        const ac = (v: string) => cell(v, { font: articleFont, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin, ...rowFill });
        aoa.push([
          dc(idx + 1, 'center'),
          bd(item.brand || '', 'center'),
          dc(item.origin || '', 'center'),
          ac(item.article || ''),
          dc(item.description || ''),
          dc(item.quantity, 'center'),
          dc(item.uom || '', 'center'),
          dc(item.unit_price, 'right'),
          dc(+(item.quantity * item.unit_price).toFixed(2), 'right'),
        ]);
        rowH[r] = { hpt: 18 }; r++;
      });

      aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;

      const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
      const discountAmt = inv.discount_mode === 'fixed' ? (inv.discount_fixed ?? 0) : subtotal * ((inv.discount_percent ?? 0) / 100);
      const taxAmt = (subtotal - discountAmt) * ((inv.tax_percent ?? 0) / 100);
      const total = subtotal - discountAmt + taxAmt;

      const qtyRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      qtyRow[4] = cell('Total QTY:', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
      qtyRow[5] = cell(items.reduce((s, i) => s + i.quantity, 0), { font: { ...boldFont, sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin });
      aoa.push(qtyRow); rowH[r] = { hpt: 16 }; r++;

      const sumRow = (label: string, value: number, highlight = false) => {
        const row: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
        row[7] = highlight ? labelCell(label) : cell(label, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
        row[8] = highlight ? totalCell(value) : cell(value, { font: boldFont, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, numFmt: '#,##0.00' } as object);
        return row;
      };

      aoa.push(sumRow('Subtotal:', +subtotal.toFixed(2))); rowH[r] = { hpt: 16 }; r++;
      if (discountAmt > 0) {
        const discLabel = inv.discount_mode === 'fixed' ? 'Discount:' : `Discount ${inv.discount_percent}%:`;
        aoa.push(sumRow(discLabel, +(-discountAmt).toFixed(2))); rowH[r] = { hpt: 16 }; r++;
      }
      if (taxAmt > 0) { aoa.push(sumRow(`VAT ${inv.tax_percent}%:`, +taxAmt.toFixed(2))); rowH[r] = { hpt: 16 }; r++; }
      aoa.push(sumRow('TOTAL:', +total.toFixed(2), true)); rowH[r] = { hpt: 22 }; r++;

      if ((inv.deposit_amount ?? 0) > 0) {
        const depRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
        depRow[7] = cell('Deposit:', { font: { ...baseFont, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
        depRow[8] = cell(+(-(inv.deposit_amount ?? 0)).toFixed(2), { font: { ...boldFont, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, numFmt: '#,##0.00' } as object);
        aoa.push(depRow); rowH[r] = { hpt: 18 }; r++;
        const balRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
        balRow[7] = cell('Balance Due:', { font: { ...boldFont, sz: 9, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, fill: { fgColor: { rgb: 'EFF6FF' } }, border: allMed });
        balRow[8] = cell(+Math.max(0, total - (inv.deposit_amount ?? 0)).toFixed(2), { font: { ...boldFont, sz: 11, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, fill: { fgColor: { rgb: 'EFF6FF' } }, border: allMed, numFmt: '#,##0.00' } as object);
        aoa.push(balRow); rowH[r] = { hpt: 22 }; r++;
      }

      if (inv.paid || inv.delivered) {
        aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 8 }; r++;
        const sStyle = (color: string, bg: string) => ({
          font: { name: 'Arial', bold: true, sz: 14, color: { rgb: color } },
          fill: { fgColor: { rgb: bg } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: { top: { style: 'medium', color: { rgb: color } }, bottom: { style: 'medium', color: { rgb: color } }, left: { style: 'medium', color: { rgb: color } }, right: { style: 'medium', color: { rgb: color } } },
        });
        const stampRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
        let col = 0;
        if (inv.paid) { stampRow[col] = cell('  PAID  ', sStyle('1A6B3A', 'DCFCE7')); merges.push({ s: { r, c: col }, e: { r, c: col + 1 } }); col += 3; }
        if (inv.delivered) { stampRow[col] = cell('  DELIVERED  ', sStyle('1E3A8A', 'DBEAFE')); merges.push({ s: { r, c: col }, e: { r, c: col + 2 } }); }
        aoa.push(stampRow); rowH[r] = { hpt: 28 }; r++;
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
      ws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 9 }, { wch: 17 }, { wch: 34 }, { wch: 7 }, { wch: 7 }, { wch: 13 }, { wch: 14 }];
      ws['!rows'] = rowH;
      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, inv.number);
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${inv.number}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function exportInvoicePdf(inv: Proforma, items: ProformaItem[]) {
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('invoice-pdf-render')?.remove();
    const container = document.createElement('div');
    container.id = 'invoice-pdf-render';

    const deliveryLines = [
      inv.delivery_date ? `<span style="color:#15803d;"><strong>Delivery date:</strong> ${inv.delivery_date}</span>` : '',
      inv.delivery_location ? `<span style="color:#15803d;"><strong>Delivery location:</strong> ${inv.delivery_location}</span>` : '',
      inv.delivery_type ? `<span style="color:#15803d;"><strong>Type of delivery:</strong> ${inv.delivery_type}</span>` : '',
      inv.delivery_qty ? `<span style="color:#15803d;"><strong>QTY:</strong> ${inv.delivery_qty}</span>` : '',
    ].filter(Boolean).join('');

    const stampHtml = (label: string, sub: string, color: string, bg: string, stampDate?: string) => {
      const sd = stampDate
        ? new Date(stampDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : date;
      return `
      <div style="display:inline-flex;flex-direction:column;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;">
        <div style="border:2px solid ${color};border-radius:4px;padding:12px 28px;background:${bg};min-width:160px;text-align:center;position:relative;box-shadow:0 0 0 1px ${color}22;">
          <div style="position:absolute;inset:4px;border:1px solid ${color}55;border-radius:2px;pointer-events:none;"></div>
          <div style="width:100%;height:1px;background:${color}40;margin-bottom:8px;"></div>
          <div style="font-size:22px;font-weight:900;letter-spacing:0.22em;color:${color};line-height:1;text-transform:uppercase;">${label}</div>
          <div style="font-size:9px;font-weight:700;letter-spacing:0.28em;color:${color}99;margin-top:5px;text-transform:uppercase;">${sub}</div>
          <div style="font-size:8px;letter-spacing:0.1em;color:${color}80;margin-top:6px;">${sd}</div>
          <div style="width:100%;height:1px;background:${color}40;margin-top:8px;"></div>
        </div>
      </div>`;
    };

    const stamps = [
      inv.paid ? stampHtml('PAID', 'ОПЛАЧЕНО', '#15803d', '#f0fdf4', inv.paid_at ?? undefined) : '',
      inv.delivered ? stampHtml('DELIVERED', 'ДОСТАВЛЕНО', '#1d4ed8', '#eff6ff', inv.delivered_at ?? undefined) : '',
    ].filter(Boolean).join('');

    const rows = items.map((item, idx) => `
      <tr style="background:${idx % 2 !== 0 ? '#f3f4f6' : '#ffffff'};">
        <td class="ctr">${idx + 1}</td><td class="ctr">${item.brand}</td><td class="ctr">${item.origin}</td>
        <td class="ctr mono">${item.article}</td><td class="desc">${item.description}</td>
        <td class="ctr">${item.quantity}</td><td class="ctr">${item.uom}</td>
        <td class="ctr">${fmt(item.unit_price)}</td><td class="ctr bold">${fmt(item.quantity * item.unit_price)}</td>
      </tr>`).join('');

    container.innerHTML = `
      <div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;font-size:8px;color:#111;padding:30px;width:900px;background:#fff;box-sizing:border-box;">
        <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #111;">
          <div style="font-size:36px;font-weight:900;letter-spacing:0.18em;color:#111;line-height:1;font-family:'Calibri',sans-serif;">INVOICE</div>
          <div style="font-size:12px;font-weight:700;color:#555;margin-top:3px;font-family:'Calibri',sans-serif;">${inv.number}</div>
          <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:9px;">
            <div><span style="color:#888;font-weight:500;">КК: </span><span style="font-weight:700;">${inv.client_code || '—'}</span></div>
            <div><span style="color:#888;font-weight:500;">Date: </span><span style="font-weight:700;">${date}</span></div>
          </div>
        </div>
        ${deliveryLines ? `<div style="margin-bottom:16px;padding:8px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:4px;display:flex;flex-wrap:wrap;gap:14px;font-size:8px;"><span style="font-weight:800;color:#15803d;letter-spacing:0.1em;text-transform:uppercase;">ДЕТАЛИ ЗАКАЗА</span>${deliveryLines}</div>` : ''}
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1.5px solid #111;background:#f3f4f6;">
            <th style="width:22px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">№</th>
            <th style="width:58px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Brand</th>
            <th style="width:42px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">COO</th>
            <th style="width:96px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Part Number</th>
            <th style="text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Description</th>
            <th style="width:34px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">QTY</th>
            <th style="width:34px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">UOM</th>
            <th style="width:58px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Price</th>
            <th style="width:62px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;">Total</th>
          </tr></thead>
          <tbody>${rows
            .replace(/class="ctr mono"/g, 'style="text-align:center;font-family:\'Calibri\',sans-serif;font-size:9px;font-weight:700;color:#111827;padding:5px 3px;vertical-align:middle;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;white-space:nowrap;letter-spacing:0.02em;"')
            .replace(/class="ctr bold"/g, 'style="text-align:center;font-weight:700;font-variant-numeric:tabular-nums;padding:5px 3px;vertical-align:middle;border-bottom:1px solid #ebebeb;"')
            .replace(/class="ctr"/g, 'style="text-align:center;font-variant-numeric:tabular-nums;padding:5px 3px;vertical-align:middle;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;white-space:nowrap;"')
            .replace(/class="desc"/g, 'style="text-align:center;padding:5px 3px;vertical-align:middle;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;word-break:break-word;font-size:8px;line-height:1.3;"')}</tbody>
        </table>
        <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div style="font-size:9px;color:#888;padding-top:6px;">
            <span style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total QTY:</span>
            <span style="font-weight:800;color:#111;margin-left:6px;">${items.reduce((s, i) => s + i.quantity, 0)}</span>
          </div>
          <table style="min-width:240px;border-top:1px solid #ddd;">
            <tr><td style="color:#666;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">Subtotal</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;">${fmt(items.reduce((s, i) => s + i.quantity * i.unit_price, 0))} ${inv.currency}</td></tr>
            <tr><td style="font-size:12px;font-weight:800;border-top:2px solid #111;padding-top:8px;padding-bottom:3px;color:#666;padding-right:32px;">Amount</td><td style="font-size:12px;font-weight:800;border-top:2px solid #111;padding-top:8px;padding-bottom:3px;text-align:right;font-variant-numeric:tabular-nums;">${fmt((() => { const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0); const d = inv.discount_mode === 'fixed' ? (inv.discount_fixed ?? 0) : sub * ((inv.discount_percent ?? 0) / 100); const t = (sub - d) * ((inv.tax_percent ?? 0) / 100); return sub - d + t; })())} ${inv.currency}</td></tr>
            ${(inv.deposit_amount ?? 0) > 0 ? `<tr><td style="color:#2563eb;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">Deposit</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;color:#2563eb;">− ${fmt(inv.deposit_amount ?? 0)} ${inv.currency}</td></tr><tr><td style="font-size:12px;font-weight:800;border-top:1.5px dashed #2563eb;padding-top:5px;padding-bottom:2px;color:#2563eb;padding-right:32px;">Balance Due</td><td style="font-size:12px;font-weight:800;border-top:1.5px dashed #2563eb;padding-top:5px;padding-bottom:2px;text-align:right;font-variant-numeric:tabular-nums;color:#2563eb;">${fmt(Math.max(0, (() => { const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0); const d = inv.discount_mode === 'fixed' ? (inv.discount_fixed ?? 0) : sub * ((inv.discount_percent ?? 0) / 100); const t = (sub - d) * ((inv.tax_percent ?? 0) / 100); return sub - d + t; })() - (inv.deposit_amount ?? 0)))} ${inv.currency}</td></tr>` : ''}
          </table>
        </div>
        ${stamps ? `<div id="invoice-stamps" style="margin-top:30px;padding-top:18px;border-top:1px dashed #ccc;display:flex;justify-content:center;align-items:center;gap:24px;">${stamps}</div>` : ''}
      </div>`;

    // Detach the stamps div from the invoice container so it never appears in the main canvas
    const mainEl = container.firstElementChild as HTMLElement;
    const inlineStamps = mainEl.querySelector<HTMLElement>('#invoice-stamps');
    if (inlineStamps) inlineStamps.remove();

    // Build a clean standalone stamps container
    let stampContainer: HTMLDivElement | null = null;
    if (stamps) {
      stampContainer = document.createElement('div');
      stampContainer.innerHTML = `<div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;width:560px;padding:20px 30px;background:#fff;box-sizing:border-box;display:flex;justify-content:center;align-items:center;gap:24px;">${stamps}</div>`;
      Object.assign(stampContainer.style, { position: 'fixed', left: '-9999px', top: '0', background: '#fff', zIndex: '-1' });
      document.body.appendChild(stampContainer);
    }

    Object.assign(container.style, { position: 'fixed', left: '-9999px', top: '0', width: '900px', background: '#fff', zIndex: '-1' });
    document.body.appendChild(container);
    try {
      const mainCanvas = await html2canvas(mainEl, { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const mainImgData = mainCanvas.toDataURL('image/png');
      const mainH = (mainCanvas.height * pageW) / mainCanvas.width;

      // Place main content, tracking how much of the last page is used
      let yOffset = 0;
      while (yOffset < mainH) {
        pdf.addImage(mainImgData, 'PNG', 0, -yOffset, pageW, mainH);
        yOffset += pageH;
        if (yOffset < mainH) pdf.addPage();
      }
      const usedOnLastPage = mainH - (yOffset - pageH);

      // Render stamps independently and compose into PDF — no page-cut risk
      if (stampContainer) {
        const stampEl = stampContainer.firstElementChild as HTMLElement;
        const stampCanvas = await html2canvas(stampEl, { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false });
        const stampImgData = stampCanvas.toDataURL('image/png');
        const stampW = (stampCanvas.width * pageW) / (900 * 2); // keep same scale as main
        const stampH = (stampCanvas.height * stampW) / stampCanvas.width;
        const stampX = (pageW - stampW) / 2;
        const stampY = usedOnLastPage + 14;

        if (stampY + stampH > pageH - 10) {
          pdf.addPage();
          pdf.addImage(stampImgData, 'PNG', stampX, (pageH - stampH) / 2, stampW, stampH);
        } else {
          pdf.addImage(stampImgData, 'PNG', stampX, stampY, stampW, stampH);
        }
      }

      const pdfBlob = pdf.output('blob');
      downloadBlob(pdfBlob, `${inv.number}.pdf`);
    } catch (err) { console.error('PDF export failed:', err); alert('Ошибка экспорта PDF: ' + (err instanceof Error ? err.message : String(err))); }
    finally { container.remove(); stampContainer?.remove(); }
  }

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    const { data } = await supabase.from('clients').select('*').eq('owner', owner).order('name').limit(1000);
    if (data) setClients(data as Client[]);
    setLoading(false);
    // Load all balances
    const { data: txData } = await supabase.from('client_transactions').select('client_id, amount').eq('owner', owner);
    if (txData) {
      const map: Record<string, number> = {};
      for (const tx of txData as { client_id: string; amount: number }[]) {
        map[tx.client_id] = (map[tx.client_id] ?? 0) + tx.amount;
      }
      setClientBalances(map);
    }
  }

  async function openDetail(c: Client) {
    setSelected(c);
    setView('detail');
    setLoadingInvoices(true);
    const { data } = await supabase
      .from('proformas').select('*')
      .eq('owner', owner)
      .eq('client_code', c.code)
      .eq('confirmed', true)
      .eq('trashed', false)
      .order('confirmed_at', { ascending: false });
    if (data) setInvoices(data as Proforma[]);
    setLoadingInvoices(false);
  }

  async function openLedger(c: Client) {
    setSelected(c);
    setView('ledger');
    setTxFormMode(null);
    setLoadingTx(true);
    const { data } = await supabase
      .from('client_transactions').select('*').eq('client_id', c.id).eq('owner', owner)
      .order('date', { ascending: true }).order('created_at', { ascending: true });
    if (data) setTransactions(data as ClientTransaction[]);
    setLoadingTx(false);
  }

  async function openArticles(c: Client) {
    setSelected(c);
    setArticleSearch('');
    setView('articles');
    setLoadingArticles(true);
    const { data: invData } = await supabase
      .from('proformas').select('id')
      .eq('owner', owner).eq('client_code', c.code).eq('confirmed', true).eq('trashed', false);
    if (!invData || invData.length === 0) { setArticleRows([]); setLoadingArticles(false); return; }
    const ids = (invData as { id: string }[]).map(p => p.id);
    const { data: itemData } = await supabase.from('proforma_items').select('*').eq('owner', owner).in('proforma_id', ids);
    if (!itemData) { setArticleRows([]); setLoadingArticles(false); return; }
    const map: Record<string, { article: string; brand: string; description: string; uom: string; totalQty: number }> = {};
    for (const item of itemData as ProformaItem[]) {
      const key = `${item.article}||${item.brand}`;
      if (!map[key]) map[key] = { article: item.article, brand: item.brand, description: item.description, uom: item.uom, totalQty: 0 };
      map[key].totalQty += item.quantity;
    }
    setArticleRows(Object.values(map).sort((a, b) => a.article.localeCompare(b.article)));
    setLoadingArticles(false);
  }

  function openCreate() { setSelected(null); setForm(emptyClient()); setError(''); setView('form'); }

  function openEdit(c: Client) {
    setSelected(c);
    setForm({ name: c.name, code: c.code, phones: c.phones, country: c.country ?? '' });
    setError('');
    setView('form');
  }

  async function save() {
    if (!form.name.trim()) { setError('Введите имя клиента'); return; }
    if (!form.code.trim()) { setError('Введите КК (код клиента)'); return; }
    setSaving(true); setError('');
    if (selected) {
      const { error: e } = await supabase.from('clients').update({ ...form }).eq('id', selected.id);
      if (e) { setError('Ошибка сохранения'); setSaving(false); return; }
    } else {
      const { error: e } = await supabase.from('clients').insert([{ ...form, owner }]);
      if (e) { setError(e.code === '23505' ? 'Такой код клиента уже существует' : 'Ошибка сохранения'); setSaving(false); return; }
    }
    await fetchClients(); setSaving(false); setView('list');
  }

  async function deleteClient(id: string) {
    await supabase.from('clients').delete().eq('id', id);
    setClients(prev => prev.filter(c => c.id !== id));
    setDeleteConfirm(null);
    if (view === 'detail') setView('list');
  }

  function openAddTx() {
    setTxForm({ date: new Date().toISOString().slice(0, 10), amount: 0, details: '' });
    setTxAmountType('+'); setEditingTxId(null); setTxFormMode('add');
  }

  function openEditTx(tx: ClientTransaction) {
    setTxForm({ date: tx.date, amount: Math.abs(tx.amount), details: tx.details });
    setTxAmountType(tx.amount >= 0 ? '+' : '-'); setEditingTxId(tx.id); setTxFormMode('edit');
  }

  async function saveTx() {
    if (!selected) return;
    const finalAmount = txAmountType === '+' ? Math.abs(txForm.amount) : -Math.abs(txForm.amount);
    const payload = { client_id: selected.id, date: txForm.date, amount: finalAmount, details: txForm.details, owner };
    if (txFormMode === 'edit' && editingTxId) {
      const { data } = await supabase.from('client_transactions').update(payload).eq('id', editingTxId).select().maybeSingle();
      if (data) setTransactions(prev => prev.map(t => t.id === editingTxId ? data as ClientTransaction : t));
    } else {
      const { data } = await supabase.from('client_transactions').insert([payload]).select().maybeSingle();
      if (data) setTransactions(prev => [...prev, data as ClientTransaction].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at)));
    }
    setTxFormMode(null); setEditingTxId(null);
  }

  async function deleteTx(id: string) {
    await supabase.from('client_transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
    setDeletingTxId(null);
  }

  async function exportArticleList(client: Client) {
    try {
    // Fetch all confirmed invoices for this client
    const { data: invData } = await supabase
      .from('proformas').select('id, number, confirmed_at, currency')
      .eq('owner', owner).eq('client_code', client.code).eq('confirmed', true).eq('trashed', false);
    if (!invData || invData.length === 0) { alert('Нет счетов для этого клиента'); return; }
    const ids = (invData as { id: string }[]).map(p => p.id);
    const { data: itemData } = await supabase
      .from('proforma_items').select('*').eq('owner', owner).in('proforma_id', ids);
    if (!itemData || itemData.length === 0) { alert('Нет товаров в счетах'); return; }

    // Aggregate by article+brand
    const map: Record<string, { article: string; brand: string; description: string; uom: string; totalQty: number; invoices: Set<string> }> = {};
    for (const item of itemData as ProformaItem[]) {
      const key = `${item.article}||${item.brand}`;
      if (!map[key]) map[key] = { article: item.article, brand: item.brand, description: item.description, uom: item.uom, totalQty: 0, invoices: new Set() };
      map[key].totalQty += item.quantity;
      map[key].invoices.add(item.proforma_id);
    }
    const rows = Object.values(map).sort((a, b) => a.article.localeCompare(b.article));

    const thin = { style: 'thin', color: { rgb: 'D1D5DB' } } as const;
    const allThin = { top: thin, bottom: thin, left: thin, right: thin };
    const baseFont = { name: 'Arial', sz: 10 };
    const boldFont = { ...baseFont, bold: true };
    const cell = (v: string | number, s: object): XLSX.CellObject => ({ v, t: typeof v === 'number' ? 'n' : 's', s });

    const aoa: (XLSX.CellObject | null)[][] = [];
    const merges: XLSX.Range[] = [];
    let r = 0;

    // Title
    aoa.push([
      cell(`Список артикулов — ${client.code}`, { font: { ...boldFont, sz: 14, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 4 } }); r++;
    aoa.push([
      cell(`${client.code} · ${invData.length} счетов`, { font: { ...boldFont, sz: 11, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 4 } }); r++;
    aoa.push(Array(5).fill(null)); r++;

    // Headers
    aoa.push(['PART NUMBER', 'BRAND', 'DESCRIPTION', 'UOM', 'TOTAL QTY'].map(h => cell(h, {
      font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } },
      fill: { fgColor: { rgb: 'F3F4F6' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: allThin,
    }))); r++;

    // Data
    for (const row of rows) {
      aoa.push([
        cell(row.article, { font: boldFont, alignment: { horizontal: 'left', vertical: 'center' }, border: allThin }),
        cell(row.brand, { font: baseFont, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin }),
        cell(row.description, { font: baseFont, alignment: { horizontal: 'left', vertical: 'center', wrapText: true }, border: allThin }),
        cell(row.uom, { font: baseFont, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin }),
        cell(row.totalQty, { font: { ...boldFont, sz: 11 }, alignment: { horizontal: 'center', vertical: 'center' }, border: allThin }),
      ]); r++;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 36 }, { wch: 8 }, { wch: 12 }];
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, client.code);
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `articles_${client.code}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  const fmt = (n: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const fmtDateShort = (s: string) => { const d = new Date(s + 'T00:00:00'); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`; };

  async function exportLedgerExcel(client: Client) {
    try {
      const boldFont = { name: 'Arial', bold: true, sz: 10, color: { rgb: '111827' } };
      const normalFont = { name: 'Arial', sz: 10, color: { rgb: '111827' } };
      const grayFont = { name: 'Arial', sz: 9, color: { rgb: '6B7280' } };
      const allThin = { top: { style: 'thin', color: { rgb: 'E5E7EB' } }, bottom: { style: 'thin', color: { rgb: 'E5E7EB' } }, left: { style: 'thin', color: { rgb: 'E5E7EB' } }, right: { style: 'thin', color: { rgb: 'E5E7EB' } } };
      const cell = (v: unknown, s: XLSX.CellObject['s']) => ({ v, s } as XLSX.CellObject);

      const aoa: (XLSX.CellObject | null)[][] = [];
      const merges: XLSX.Range[] = [];
      let r = 0;

      // Title
      aoa.push([cell('БУХГАЛТЕРИЯ КЛИЕНТА', { font: { ...boldFont, sz: 14 }, alignment: { horizontal: 'center' } }), null, null, null]); merges.push({ s: { r, c: 0 }, e: { r, c: 3 } }); r++;
      aoa.push([null]); r++;
      aoa.push([cell(client.name, { font: { ...boldFont, sz: 11 }, alignment: { horizontal: 'center' } }), null, null, null]); merges.push({ s: { r, c: 0 }, e: { r, c: 3 } }); r++;
      aoa.push([cell(`Код: ${client.code}`, { font: grayFont, alignment: { horizontal: 'center' } }), null, null, null]); merges.push({ s: { r, c: 0 }, e: { r, c: 3 } }); r++;
      if (client.country) { aoa.push([cell(client.country, { font: grayFont, alignment: { horizontal: 'center' } }), null, null, null]); merges.push({ s: { r, c: 0 }, e: { r, c: 3 } }); r++; }
      if (client.phones) { aoa.push([cell(client.phones, { font: grayFont, alignment: { horizontal: 'center' } }), null, null, null]); merges.push({ s: { r, c: 0 }, e: { r, c: 3 } }); r++; }
      aoa.push([null]); r++;

      // Table headers
      aoa.push([
        cell('Дата', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, fill: { fgColor: { rgb: 'F3F4F6' } }, alignment: { horizontal: 'center' }, border: allThin }),
        cell('Описание', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, fill: { fgColor: { rgb: 'F3F4F6' } }, alignment: { horizontal: 'center' }, border: allThin }),
        cell('Сумма', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, fill: { fgColor: { rgb: 'F3F4F6' } }, alignment: { horizontal: 'center' }, border: allThin }),
        cell('Баланс', { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, fill: { fgColor: { rgb: 'F3F4F6' } }, alignment: { horizontal: 'center' }, border: allThin }),
      ]); r++;

      // Rows (chronological order — reverse of ledgerRows which is reversed)
      const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
      let balance = 0;
      for (const tx of sorted) {
        balance += tx.amount;
        aoa.push([
          cell(fmtDateShort(tx.date), { font: normalFont, alignment: { horizontal: 'center' }, border: allThin }),
          cell(tx.details || '—', { font: normalFont, alignment: { horizontal: 'left' }, border: allThin }),
          cell(fmt(tx.amount), { font: { ...normalFont, color: { rgb: tx.amount >= 0 ? '059669' : 'DC2626' } }, alignment: { horizontal: 'right' }, border: allThin }),
          cell(fmt(balance), { font: boldFont, alignment: { horizontal: 'right' }, border: allThin }),
        ]); r++;
      }

      aoa.push([null]); r++;
      aoa.push([
        cell('ИТОГО:', { font: { ...boldFont, sz: 11 }, alignment: { horizontal: 'right' } }),
        null, null,
        cell(fmt(balance), { font: { ...boldFont, sz: 11, color: { rgb: '059669' } }, alignment: { horizontal: 'right' } }),
      ]); merges.push({ s: { r, c: 0 }, e: { r, c: 2 } });

      const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
      ws['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 16 }, { wch: 16 }];
      ws['!merges'] = merges;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Бухгалтерия');
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
      downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `accounting_${client.code}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function exportLedgerPDF(client: Client) {
    try {
      const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
      let balance = 0;
      const rows = sorted.map(tx => { balance += tx.amount; return { tx, balance }; });

      const html = `
        <div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;font-size:9px;color:#111;padding:30px;width:900px;background:#fff;box-sizing:border-box;">
          <div style="text-align:center;margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid #111;">
            <div style="font-size:20px;font-weight:900;letter-spacing:0.1em;color:#111;">БУХГАЛТЕРИЯ КЛИЕНТА</div>
            <div style="font-size:13px;font-weight:700;color:#555;margin-top:4px;">${client.name}</div>
            <div style="display:flex;justify-content:center;gap:20px;margin-top:6px;font-size:9px;color:#888;">
              <span>Код: <b>${client.code}</b></span>
              ${client.country ? `<span>${client.country}</span>` : ''}
              ${client.phones ? `<span>${client.phones}</span>` : ''}
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr>
                <th style="width:70px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 4px 8px;color:#333;border-bottom:2px solid #111;">Дата</th>
                <th style="text-align:left;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 4px 8px;color:#333;border-bottom:2px solid #111;">Описание</th>
                <th style="width:100px;text-align:right;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 4px 8px;color:#333;border-bottom:2px solid #111;">Сумма</th>
                <th style="width:100px;text-align:right;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 4px 8px;color:#333;border-bottom:2px solid #111;">Баланс</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:#999;font-size:10px;">Нет записей</td></tr>' : ''}
              ${rows.map(({ tx, balance: bal }) => `
                <tr>
                  <td style="text-align:center;padding:5px 4px;border-bottom:1px solid #ebebeb;font-size:9px;">${fmtDateShort(tx.date)}</td>
                  <td style="padding:5px 4px;border-bottom:1px solid #ebebeb;font-size:9px;">${tx.details || '—'}</td>
                  <td style="text-align:right;padding:5px 4px;border-bottom:1px solid #ebebeb;font-size:9px;font-weight:700;color:${tx.amount >= 0 ? '#059669' : '#DC2626'};">${tx.amount >= 0 ? '+' : ''}${fmt(tx.amount)}</td>
                  <td style="text-align:right;padding:5px 4px;border-bottom:1px solid #ebebeb;font-size:9px;font-weight:700;">${fmt(bal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top:16px;padding-top:10px;border-top:2px solid #111;display:flex;justify-content:flex-end;">
            <span style="font-size:12px;font-weight:800;color:#111;">ИТОГО: ${fmt(balance)}</span>
          </div>
        </div>
      `;

      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.innerHTML = html;
      document.body.appendChild(container);

      const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, backgroundColor: '#ffffff' });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 10;
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - 20);
      while (heightLeft > 0) {
        position = heightLeft - imgHeight + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth, imgHeight);
        heightLeft -= (pdfHeight - 20);
      }
      pdf.save(`accounting_${client.code}.pdf`);
    } catch (err) { console.error('PDF export failed:', err); alert('Ошибка экспорта PDF: ' + (err instanceof Error ? err.message : String(err))); }
  }

  const ledgerRows = (() => {
    const groups: LedgerDisplayRow[] = [];
    for (const tx of transactions) {
      groups.push({ key: tx.id, date: tx.date, netAmount: tx.amount, balance: 0, details: tx.details, proforma_id: tx.proforma_id ?? null, txIds: [tx.id], singleTx: tx });
    }
    let balance = 0;
    for (const g of groups) { balance += g.netAmount; g.balance = balance; }
    return groups.reverse();
  })();
  const finalBalance = ledgerRows.length > 0 ? ledgerRows[0].balance : 0;

  // Country stats
  const countryCounts = clients.reduce<Record<string, number>>((acc, c) => {
    const key = c.country || 'OTHER';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const countryEntries = Object.entries(countryCounts).sort(([, a], [, b]) => b - a);

  // Balance totals
  const totalPositive = clients.reduce((s, c) => { const b = clientBalances[c.id] ?? 0; return s + (b > 0 ? b : 0); }, 0);
  const totalDebt = clients.reduce((s, c) => { const b = clientBalances[c.id] ?? 0; return s + (b < 0 ? b : 0); }, 0);

  // Filtered clients
  const filteredClients = clients.filter(c => {
    const matchSearch = !searchQ.trim() || c.name.toLowerCase().includes(searchQ.toLowerCase()) || c.code.toLowerCase().includes(searchQ.toLowerCase());
    const matchCountry = !countryFilter || (c.country || 'OTHER') === countryFilter;
    return matchSearch && matchCountry;
  });

  // ── List ──────────────────────────────────────────────────────────────
  if (view === 'list') return (
    <div className="flex flex-col h-full bg-slate-50 font-pro">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 sm:px-8 pt-6 pb-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d1f3c] text-white shadow-sm">
              <Users size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Клиенты</h2>
                <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-500">{clients.length}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                <span><strong className="text-slate-700">{filteredClients.length}</strong> показано</span>
                {totalPositive > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Баланс <strong className="text-emerald-600">+{fmt(totalPositive)}</strong></span>}
                {totalDebt < 0 && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-400" />Долг <strong className="text-rose-600">{fmt(totalDebt)}</strong></span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-start">
            <button onClick={openCreate}
              className="flex items-center gap-1.5 rounded-xl bg-[#0d1f3c] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#18375f] active:scale-[0.98]">
              <Plus size={14} />Добавить клиента
            </button>
          </div>
        </div>

        {/* Search + country filter */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-xl">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Поиск по имени или коду клиента..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#0d1f3c] focus:bg-white focus:ring-4 focus:ring-blue-50" />
            {searchQ && <button onClick={() => setSearchQ('')} aria-label="Очистить поиск" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-800">Очистить</button>}
          </div>
          {countryEntries.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
              <button onClick={() => setCountryFilter('')}
                className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${!countryFilter ? 'bg-[#0d1f3c] text-white border-[#0d1f3c]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                Все {clients.length}
              </button>
              {countryEntries.map(([code, count]) => (
                <button key={code} onClick={() => setCountryFilter(countryFilter === code ? '' : code)}
                  className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-all ${countryFilter === code ? 'bg-[#0d1f3c] text-white border-[#0d1f3c]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
                  <span className="text-sm leading-none">{countryFlag(code)}</span>
                  <span className="tabular-nums">{count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        {loading ? (
          <div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#0d1f3c]" /></div>
        ) : clients.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-300 shadow-sm"><Users size={23} /></div>
            <p className="text-sm font-bold text-slate-700">Нет клиентов</p>
            <p className="mt-1 text-xs text-slate-400">Нажмите «Добавить клиента», чтобы создать первого</p>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">По вашему запросу ничего не найдено</div>
        ) : (
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-2 hidden grid-cols-[120px_minmax(0,1fr)_180px_24px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-sm sm:grid">
              <span>Код</span><span>Имя и контакты</span><span className="text-right">Баланс</span><span />
            </div>
            <div className="space-y-1.5">
              {filteredClients.map(c => {
                const balance = clientBalances[c.id] ?? 0;
                return (
                  <div key={c.id} className="group relative rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                    <button onClick={() => openDetail(c)} className="grid w-full grid-cols-1 items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[120px_minmax(0,1fr)_180px_24px] sm:gap-4 sm:px-5">
                      <div className="flex items-center gap-2 sm:block">
                        <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-[#0d1f3c] px-2 font-pro text-[11px] font-black tracking-widest text-white uppercase">{c.code || '—'}</span>
                        <span className="text-xs text-slate-400 sm:hidden">Код</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-pro text-sm font-extrabold text-slate-900 truncate">{c.name || 'Без названия'}</span>
                          {c.country && <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600"><span className="text-xs leading-none">{countryFlag(c.country)}</span>{countryName(c.country)}</span>}
                        </div>
                        {c.phones && <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400 truncate"><Phone size={9} className="shrink-0" />{c.phones}</div>}
                      </div>
                      <div className="flex items-center justify-between sm:block sm:text-right">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Баланс</span>
                        <span className={`font-pro text-sm font-black tabular-nums ${balance > 0 ? 'text-emerald-600' : balance < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                          {balance > 0 ? '+' : ''}{balance !== 0 ? fmt(balance) : '—'}
                        </span>
                      </div>
                      <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-colors group-hover:text-[#0d1f3c] sm:static sm:translate-y-0" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Form ──────────────────────────────────────────────────────────────
  if (view === 'form') return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col font-pro max-w-md mx-auto">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white flex-shrink-0">
        <button onClick={() => setView(selected ? 'detail' : 'list')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <X size={16} />Отмена
        </button>
        <span className="text-sm font-bold text-slate-900">{selected ? 'Редактировать клиента' : 'Новый клиент'}</span>
        <button onClick={save} disabled={saving}
          className="text-xs font-bold bg-[#0d1f3c] text-white px-4 py-2 rounded-lg hover:bg-[#18375f] active:opacity-75 transition-all disabled:opacity-50">
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
        {error && <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">{error}</div>}
        <Field icon={<User size={11} />} label="Клиент">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Название или имя клиента" className={`${inputCls} text-sm`} />
        </Field>
        <Field icon={<Hash size={11} />} label="КК (Код клиента)">
          <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="Напр. KK-001" className={`${inputCls} font-mono font-bold text-sm`} />
        </Field>
        <Field icon={<Phone size={11} />} label="Номера телефонов">
          <textarea value={form.phones} onChange={e => setForm(f => ({ ...f, phones: e.target.value }))}
            placeholder="+992 900 000 000&#10;+7 999 000 0000" rows={2}
            className={`${inputCls} resize-none text-sm`} />
        </Field>
        <Field icon={<Globe size={11} />} label="Страна">
          <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} className={`${inputCls} text-sm`}>
            <option value="">— Выберите страну —</option>
            {COUNTRIES.map(c => (
              <option key={c.code} value={c.code}>{c.flag} {c.name}</option>
            ))}
          </select>
        </Field>
      </div>
    </div>,
    document.body
  ) as React.ReactElement;

  // ── Ledger ─────────────────────────────────────────────────────────────
  if (view === 'ledger' && selected) return createPortal(
    <div className="fixed inset-0 z-50 bg-zinc-100 flex flex-col max-w-md mx-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-white flex-shrink-0 shadow-sm">
        <button onClick={() => { setView('detail'); setTxFormMode(null); }}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
          <ArrowLeft size={14} />Назад
        </button>
        <div className="text-center">
          <div className="flex items-center gap-1.5 justify-center">
            {selected.country && <span className="text-base">{countryFlag(selected.country)}</span>}
            <span className="text-xs font-black text-zinc-900 font-mono tracking-widest">{selected.code}</span>
          </div>
          {selected.name && <div className="text-[10px] text-zinc-400">{selected.name}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => exportLedgerExcel(selected)}
            className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-all">
            <FileSpreadsheet size={11} />Excel
          </button>
          <button onClick={() => exportLedgerPDF(selected)}
            className="flex items-center gap-1 text-[11px] font-bold text-red-500 bg-red-50 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-100 transition-all">
            <FileText size={11} />PDF
          </button>
          <button onClick={openAddTx}
            className="flex items-center gap-1 text-[11px] font-bold bg-zinc-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 transition-all">
            <Plus size={11} />Запись
          </button>
        </div>
      </div>

      <div className="bg-white border-b border-zinc-200 px-4 py-2.5 flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Баланс</span>
        <span className={`text-base font-black tabular-nums ${finalBalance >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {finalBalance >= 0 ? '+' : ''}{fmt(finalBalance)} AED
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loadingTx ? (
          <div className="flex items-center justify-center h-24">
            <div className="w-4 h-4 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white mx-3 mt-3 rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
            <div className="grid grid-cols-[64px_1fr_84px] border-b border-zinc-100 bg-zinc-50">
              <div className="px-2.5 py-2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Дата</div>
              <div className="px-2 py-2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Детали</div>
              <div className="px-2.5 py-2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider text-right">Баланс</div>
            </div>

            {ledgerRows.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-zinc-400">
                Нет записей. Нажмите «Запись» чтобы добавить.
              </div>
            )}

            {ledgerRows.map((row, idx) => (
              <div key={row.key}
                className={`grid grid-cols-[64px_1fr_84px] border-b border-zinc-50 last:border-b-0 group ${idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/40'}`}>
                <div className="px-2.5 py-2.5 flex flex-col justify-center">
                  <span className="text-[10px] font-semibold text-zinc-600 tabular-nums">{fmtDateShort(row.date)}</span>
                  <span className={`text-[10px] font-bold tabular-nums mt-0.5 ${row.netAmount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {row.netAmount >= 0 ? '+' : ''}{fmt(row.netAmount)}
                  </span>
                </div>
                <div className="px-2 py-2.5 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] leading-tight text-zinc-900 break-words">{row.details || '—'}</span>
                  {row.proforma_id && (
                    <span className="text-[8px] font-bold text-blue-500 bg-blue-50 border border-blue-100 rounded px-1 py-0.5 w-fit mt-0.5">Счёт</span>
                  )}
                </div>
                <div className="px-2.5 py-2.5 flex flex-col items-end justify-center gap-1">
                  <span className="text-[10px] font-bold tabular-nums text-zinc-800">= {fmt(row.balance)}</span>
                  <div className="flex gap-1 transition-opacity">
                    {row.singleTx && !row.proforma_id && (
                      <button onClick={() => openEditTx(row.singleTx!)} className="p-0.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"><Pencil size={9} /></button>
                    )}
                    {!row.proforma_id && (
                      <button
                        onClick={() => setDeletingTxId(row.txIds[0])}
                        className="p-0.5 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={9} /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="h-4" />
      </div>

      {txFormMode && (
        <div className="fixed inset-0 z-60 bg-black/40 flex items-end" onClick={() => setTxFormMode(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-4 py-4 space-y-3 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900">{txFormMode === 'add' ? 'Новая запись' : 'Изменить запись'}</span>
              <button onClick={() => setTxFormMode(null)} className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400"><X size={14} /></button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setTxAmountType('+')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all ${txAmountType === '+' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>
                <ArrowDown size={12} />Получено
              </button>
              <button onClick={() => setTxAmountType('-')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all ${txAmountType === '-' ? 'bg-red-500 border-red-500 text-white' : 'bg-white border-zinc-200 text-zinc-500'}`}>
                <ArrowUp size={12} />Выплачено
              </button>
            </div>
            <div>
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Дата</label>
              <input type="date" lang="ru" value={txForm.date} onChange={e => setTxForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Сумма (AED)</label>
              <input type="number" min="0" step="0.01" value={txForm.amount === 0 ? '' : txForm.amount}
                onChange={e => setTxForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00" className={`${inputCls} font-semibold tabular-nums`} />
            </div>
            <div>
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Детали</label>
              <input type="text" value={txForm.details} onChange={e => setTxForm(f => ({ ...f, details: e.target.value }))}
                placeholder="Описание транзакции" className={inputCls} />
            </div>
            <button onClick={saveTx}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 active:opacity-75 transition-all flex items-center justify-center gap-2">
              <Check size={13} />Сохранить
            </button>
          </div>
        </div>
      )}

      {deletingTxId && (
        <div className="fixed inset-0 z-60 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-bold text-zinc-900 mb-1">Удалить запись?</h3>
            <p className="text-xs text-zinc-500 mb-4">Действие нельзя отменить.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeletingTxId(null)} className="flex-1 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">Отмена</button>
              <button onClick={() => deleteTx(deletingTxId)} className="flex-1 py-2 rounded-xl bg-red-500 text-xs font-semibold text-white hover:bg-red-600">Удалить</button>
            </div>
          </div>
        </div>
      )}

    </div>,
    document.body
  ) as React.ReactElement;

  // ── Detail ────────────────────────────────────────────────────────────

  // ── Articles ──────────────────────────────────────────────────────────
  if (view === 'articles' && selected) {
    const filteredArticles = articleSearch.trim()
      ? articleRows.filter(r =>
          r.article.toLowerCase().includes(articleSearch.toLowerCase()) ||
          r.brand.toLowerCase().includes(articleSearch.toLowerCase()) ||
          r.description.toLowerCase().includes(articleSearch.toLowerCase())
        )
      : articleRows;
    const totalArticlesQty = filteredArticles.reduce((s, r) => s + r.totalQty, 0);

    return createPortal(
      <div className="fixed inset-0 z-50 bg-zinc-100 flex flex-col max-w-md mx-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-white flex-shrink-0 shadow-sm">
          <button onClick={() => setView('detail')}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
            <ArrowLeft size={14} />Назад
          </button>
          <div className="text-center">
            <div className="flex items-center gap-1.5 justify-center">
              <Package size={13} className="text-zinc-500" />
              <span className="text-xs font-black text-zinc-900 font-mono tracking-widest">{selected.code}</span>
            </div>
            <div className="text-[10px] text-zinc-400">Список артикулов</div>
          </div>
          <button onClick={() => exportArticleList(selected)}
            className="flex items-center gap-1 text-[11px] font-bold text-zinc-700 bg-zinc-100 border border-zinc-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 active:opacity-75 transition-all">
            <FileSpreadsheet size={11} />Excel
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2 bg-white border-b border-zinc-200 flex-shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              value={articleSearch}
              onChange={e => setArticleSearch(e.target.value)}
              placeholder="Поиск по артикулу, бренду, описанию..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs text-zinc-800 placeholder-zinc-300 focus:outline-none focus:ring-2 focus:ring-zinc-800 bg-white"
              autoFocus
            />
          </div>
        </div>

        {/* Summary */}
        {articleRows.length > 0 && (
          <div className="px-4 py-2 bg-white border-b border-zinc-200 flex items-center justify-between flex-shrink-0">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
              {filteredArticles.length} позиц.
            </span>
            <span className="text-[10px] font-bold text-zinc-500 tabular-nums">
              Итого: <span className="text-zinc-900">{totalArticlesQty.toLocaleString('ru-RU')}</span> шт.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loadingArticles ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-5 h-5 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin" />
            </div>
          ) : articleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Package size={22} className="text-zinc-300 mb-2" />
              <p className="text-xs text-zinc-400">Нет закупленных артикулов</p>
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="flex items-center justify-center h-24">
              <p className="text-xs text-zinc-400">Ничего не найдено</p>
            </div>
          ) : (
            <div className="bg-white mx-3 mt-3 mb-3 rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_60px_56px_48px] border-b border-zinc-100 bg-zinc-50">
                <div className="px-3 py-2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Артикул / Бренд</div>
                <div className="px-2 py-2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider">UOM</div>
                <div className="px-2 py-2 text-[9px] font-bold text-zinc-400 uppercase tracking-wider text-right">Кол-во</div>
                <div className="w-4" />
              </div>
              {filteredArticles.map((row, idx) => (
                <div key={`${row.article}||${row.brand}`}
                  className={`grid grid-cols-[1fr_60px_56px_48px] items-center py-2.5 ${idx < filteredArticles.length - 1 ? 'border-b border-zinc-100' : ''}`}>
                  <div className="px-3 min-w-0">
                    <div className="text-xs font-bold text-zinc-900 font-mono truncate">{row.article || '—'}</div>
                    {row.brand && <div className="text-[10px] text-zinc-400 truncate mt-0.5">{row.brand}</div>}
                    {row.description && <div className="text-[10px] text-zinc-400 truncate leading-tight">{row.description}</div>}
                  </div>
                  <div className="px-2 text-xs text-zinc-500">{row.uom}</div>
                  <div className="px-2 text-right">
                    <span className="text-sm font-black text-zinc-900 tabular-nums">{row.totalQty.toLocaleString('ru-RU')}</span>
                  </div>
                  <div />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>,
      document.body
    ) as React.ReactElement;
  }
  if (view === 'invoice' && viewingInvoice) {
    const inv = viewingInvoice;
    const subtotal = invoiceItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const discountAmt = inv.discount_mode === 'fixed' ? (inv.discount_fixed ?? 0) : subtotal * ((inv.discount_percent ?? 0) / 100);
    const taxAmt = (subtotal - discountAmt) * ((inv.tax_percent ?? 0) / 100);
    const total = subtotal - discountAmt + taxAmt;
    const totalQty = invoiceItems.reduce((s, i) => s + i.quantity, 0);
    const purchaseSubtotal = invoiceItems.reduce((s, i) => s + i.quantity * (i.purchase_price ?? 0), 0);
    const extraDelivery = inv.extra_delivery_cost ?? 0;
    const purchaseTotal = purchaseSubtotal + extraDelivery;
    const profit = total - purchaseTotal;
    const hasCost = invoiceItems.some(i => i.purchase_price != null && i.purchase_price > 0);

    // Group suppliers
    const supplierData: Record<string, { total: number; count: number; paid: boolean }> = {};
    for (const item of invoiceItems) {
      if (item.supplier && item.purchase_price) {
        const cost = item.quantity * item.purchase_price;
        if (!supplierData[item.supplier]) supplierData[item.supplier] = { total: 0, count: 0, paid: false };
        supplierData[item.supplier].total += cost;
        supplierData[item.supplier].count += 1;
        if (item.supplier_paid) supplierData[item.supplier].paid = true;
      }
    }

    return createPortal(
      <div className="fixed inset-0 z-50 bg-zinc-100 flex flex-col">
        <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 bg-white flex-shrink-0 shadow-sm">
          <button onClick={() => setView('detail')}
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors">
            <ArrowLeft size={16} />Назад
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-zinc-900 font-calibri">{inv.number}</div>
            <div className="text-[10px] text-zinc-400">{inv.currency} · {fmtDate(inv.confirmed_at ?? inv.created_at)}</div>
          </div>
          <div className="flex items-center gap-2">
            {hasCost && (
              <button onClick={() => setShowCost(v => !v)}
                className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all ${showCost ? 'text-red-700 bg-red-50 border-red-200' : 'text-zinc-500 bg-zinc-100 border-zinc-200 hover:border-zinc-300'}`}>
                <Eye size={11} />SHOW
              </button>
            )}
            <button onClick={() => exportInvoiceExcel(inv, invoiceItems)} title="Excel"
              className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full hover:bg-emerald-100 transition-all">
              <FileSpreadsheet size={11} />Excel
            </button>
            <button onClick={() => exportInvoicePdf(inv, invoiceItems)} title="PDF"
              className="flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full hover:bg-rose-100 transition-all">
              <FileText size={11} />PDF
            </button>

          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-8 space-y-5">
            {/* Invoice header */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 px-8 py-6 flex items-center justify-between">
              <div>
                <div className="text-5xl lg:text-6xl font-black tracking-[0.2em] leading-none text-zinc-900 select-none font-calibri">INVOICE</div>
                <div className="text-sm font-bold text-zinc-400 font-calibri mt-1">{inv.number}</div>
              </div>
              <div className="text-right">
                {inv.client_code && <div className="text-lg font-extrabold text-zinc-900 font-calibri tracking-widest">{inv.client_code}</div>}
                {inv.client && <div className="text-base font-semibold text-zinc-500 mt-1">{inv.client}</div>}
                <div className="text-xs text-zinc-400 mt-1">{fmtDate(inv.confirmed_at ?? inv.created_at)}</div>
              </div>
            </div>

            {/* Items table */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs" style={{ minWidth: (hasCost && showCost) ? 1080 : 760 }}>
                  <thead>
                    <tr className="border-b-2 border-zinc-200 bg-zinc-50">
                      <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-10">#</th>
                      <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-36">Part Number</th>
                      <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-32">Brand / COO</th>
                      <th className="text-left px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Description</th>
                      <th className="text-center px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-16">QTY</th>
                      <th className="text-center px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-16">UOM</th>
                      <th className="text-right px-2 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-28">Price</th>
                      <th className="text-right px-3 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 w-28">Total</th>
                      {(hasCost && showCost) && <>
                        <th className="text-right w-24 text-[10px] font-bold uppercase tracking-wider text-red-500 py-2 border-l border-red-100 pl-3">Cost</th>
                        <th className="text-right w-24 text-[10px] font-bold uppercase tracking-wider text-red-500 py-2">Total cost</th>
                        <th className="text-left text-[10px] font-bold uppercase tracking-wider text-red-500 py-2 w-28 border-l border-red-100 pl-3">Supplier</th>
                        <th className="text-right w-28 text-[10px] font-bold uppercase tracking-wider text-emerald-600 py-2 border-l border-emerald-100 pl-3">Profit</th>
                      </>}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingInvoiceItems ? (
                      <tr><td colSpan={(hasCost && showCost) ? 12 : 8} className="py-10 text-center"><div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-700 rounded-full animate-spin mx-auto" /></td></tr>
                    ) : invoiceItems.length === 0 ? (
                      <tr><td colSpan={(hasCost && showCost) ? 12 : 8} className="py-8 text-center text-sm text-zinc-400">Нет позиций</td></tr>
                    ) : invoiceItems.map((item, idx) => {
                      const sellTotal = item.quantity * item.unit_price;
                      const costTotal = item.quantity * (item.purchase_price ?? 0);
                      const itemProfit = sellTotal - costTotal;
                      return (
                        <tr key={item.id ?? idx} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                          <td className="px-3 py-3 text-xs text-zinc-400 tabular-nums">{idx + 1}</td>
                          <td className="px-3 py-3 text-xs font-bold text-zinc-800" style={{ fontFamily: "'Calibri', sans-serif", letterSpacing: '0.02em' }}>{item.article || '—'}</td>
                          <td className="px-3 py-3 text-xs text-zinc-500">{[item.brand, item.origin].filter(Boolean).join(' · ') || '—'}</td>
                          <td className="px-3 py-3 text-sm text-zinc-600">{item.description || '—'}</td>
                          <td className="px-2 py-3 text-center text-sm tabular-nums text-zinc-700">{item.quantity}</td>
                          <td className="px-2 py-3 text-center text-sm text-zinc-500">{item.uom || '—'}</td>
                          <td className="px-2 py-3 text-right text-sm tabular-nums text-zinc-700">{fmt(item.unit_price)}</td>
                          <td className="px-3 py-3 text-right text-sm tabular-nums font-bold text-zinc-900">{fmt(sellTotal)}</td>
                          {(hasCost && showCost) && <>
                            <td className="px-2 py-2 text-right text-xs tabular-nums text-red-600 border-l border-red-100 pl-3">{fmt(item.purchase_price ?? 0)}</td>
                            <td className="px-2 py-2 text-right text-xs tabular-nums text-red-600">{fmt(costTotal)}</td>
                            <td className="px-2 py-2 border-l border-red-100 pl-3 bg-red-50/60">
                              {item.supplier ? (
                                <span className="inline-block text-xs text-red-600 bg-red-100/60 border border-red-100 rounded-lg py-1 px-2">{item.supplier}</span>
                              ) : <span className="text-zinc-300">—</span>}
                            </td>
                            <td className={`px-2 py-2 text-right text-xs tabular-nums font-bold border-l border-emerald-100 pl-3 ${itemProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{fmt(itemProfit)}</td>
                          </>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="flex justify-between items-start px-8 py-5 gap-4">
                <div className="text-xs text-zinc-400 space-y-1">
                  <div>Total QTY: <span className="font-bold text-zinc-700 font-calibri">{totalQty}</span></div>
                  {(hasCost && showCost) && purchaseSubtotal > 0 && (
                    <div>Purchase QTY: <span className="font-bold text-red-600 font-calibri">{totalQty}</span></div>
                  )}
                </div>
                <div className="min-w-[280px] space-y-2 border-t border-zinc-100 pt-4">
                  <div className="flex justify-between text-sm text-zinc-500">
                    <span>Subtotal</span>
                    <span className="tabular-nums font-medium font-calibri">{fmt(subtotal)} {inv.currency}</span>
                  </div>
                  {discountAmt > 0 && (
                    <div className="flex justify-between text-sm text-zinc-500">
                      <span>{inv.discount_mode === 'fixed' ? 'Скидка' : `Скидка ${inv.discount_percent}%`}</span>
                      <span className="tabular-nums text-red-500 font-medium font-calibri">− {fmt(discountAmt)} {inv.currency}</span>
                    </div>
                  )}
                  {taxAmt > 0 && (
                    <div className="flex justify-between text-sm text-zinc-500">
                      <span>VAT {inv.tax_percent}%</span>
                      <span className="tabular-nums font-medium font-calibri">+ {fmt(taxAmt)} {inv.currency}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-zinc-900 border-t-2 border-zinc-900 pt-3">
                    <span>Amount</span>
                    <span className="tabular-nums font-calibri">{fmt(total)} {inv.currency}</span>
                  </div>
                  {(hasCost && showCost) && purchaseSubtotal > 0 && (
                    <>
                      <div className={`flex justify-between text-sm font-bold border-t border-zinc-100 pt-2 ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        <span>Прибыль</span>
                        <span className="tabular-nums font-calibri">
                          {fmt(profit)} {inv.currency}
                          {total > 0 && <span className="ml-1 text-xs opacity-70">({(profit / total * 100).toFixed(1)}%)</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm text-red-500 border-t border-zinc-100 pt-2">
                        <span>Purchase subtotal</span>
                        <span className="tabular-nums font-medium font-calibri">{fmt(purchaseSubtotal)} {inv.currency}</span>
                      </div>
                      {extraDelivery > 0 && (
                        <div className="flex justify-between text-sm text-red-500">
                          <span>Доп. доставка</span>
                          <span className="tabular-nums font-medium font-calibri">+ {fmt(extraDelivery)} {inv.currency}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm font-bold text-red-600">
                        <span>Purchase total</span>
                        <span className="tabular-nums font-calibri">{fmt(purchaseTotal)} {inv.currency}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Supplier payments */}
            {(hasCost && showCost) && Object.keys(supplierData).length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-zinc-100 px-8 py-5">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">Оплата поставщикам</p>
                <div className="space-y-2">
                  {Object.entries(supplierData).map(([name, data]) => (
                    <div key={name} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-zinc-50 border border-zinc-200">
                      <div className={`w-5 h-5 flex items-center justify-center rounded border-2 flex-shrink-0 ${data.paid ? 'bg-emerald-500 border-emerald-500' : 'bg-white border-zinc-300'}`}>
                        {data.paid && <Check size={12} className="text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm font-medium ${data.paid ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>{name}</span>
                        <span className="text-[10px] text-zinc-400 ml-2">{data.count} поз.</span>
                      </div>
                      <span className={`text-sm font-bold tabular-nums font-calibri ${data.paid ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>
                        {fmt(data.total)} {inv.currency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Delivery info */}
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 px-8 py-5">
              <div className="grid grid-cols-1 gap-0 md:grid-cols-3">
                {[
                  ['Delivery location', inv.delivery_location],
                  ['Type of delivery', inv.delivery_type],
                  ['QTY', inv.delivery_qty],
                ].map(([label, value], index) => value ? (
                  <div key={label} className={`px-4 py-1 first:pl-0 last:pr-0 ${index > 0 ? 'md:border-l md:border-emerald-100' : ''}`}>
                    <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest mb-2">{label}</div>
                    <div className="text-sm text-emerald-700">{value}</div>
                  </div>
                ) : null)}
              </div>
            </div>

            {(inv.paid || inv.delivered) && (
              <div className="flex items-center justify-center gap-6 py-5">
                {inv.paid && (
                  <div className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-300 bg-emerald-50 px-5 py-2 text-xs font-black tracking-[0.16em] text-emerald-700">
                    <CreditCard size={14} />PAID
                  </div>
                )}
                {inv.delivered && (
                  <div className="inline-flex items-center gap-2 rounded-full border-2 border-blue-300 bg-blue-50 px-5 py-2 text-xs font-black tracking-[0.12em] text-blue-700">
                    <Truck size={14} />DELIVERED
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>,
      document.body
    ) as React.ReactElement;
  }

  if (!selected) return null;

  const totalSpend = invoices.reduce((s, p) => s + (p.total_amount ?? 0), 0);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-slate-50 font-pro flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white flex-shrink-0">
        <button onClick={() => setView('list')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <X size={16} />Закрыть
        </button>
        <span className="font-pro text-sm font-bold text-slate-900 tracking-wide">{selected.code}</span>
        <div className="flex items-center gap-1.5">
          <button onClick={() => openEdit(selected)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg hover:bg-slate-200 active:opacity-75 transition-all">
            <Pencil size={12} />Изменить
          </button>
          <button onClick={() => setDeleteConfirm(selected.id)} className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 space-y-3 max-w-2xl w-full mx-auto">
        {/* Profile card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-5 flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d1f3c] flex-shrink-0 shadow-sm">
              <span className="font-pro text-[11px] font-black tracking-widest text-white uppercase">{selected.code}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {selected.country && <span className="text-lg leading-none">{countryFlag(selected.country)}</span>}
                <h3 className="font-pro text-base font-extrabold text-slate-900 tracking-widest">{selected.code}</h3>
              </div>
              {selected.name && <p className="text-sm text-slate-600 mt-0.5">{selected.name}</p>}
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                {selected.country && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"><span>{countryFlag(selected.country)}</span>{countryName(selected.country)}</span>}
              </div>
              {selected.phones && (
                <div className="mt-2 text-sm text-slate-500 flex items-start gap-1.5">
                  <Phone size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <span className="whitespace-pre-line">{selected.phones}</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pb-5 flex gap-2">
            <button onClick={() => openLedger(selected)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-all">
              <BookOpen size={14} />Бухгалтерия
            </button>
            <button onClick={() => openArticles(selected)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all">
              <Package size={14} />Артикулы
            </button>
          </div>

          {totalSpend > 0 && (
            <div className="px-5 pb-5 border-t border-slate-100 pt-3">
              <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Общая сумма счетов</span>
                <span className="font-pro text-sm font-black text-slate-900 tabular-nums">{fmt(totalSpend)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Invoices */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Receipt size={14} className="text-slate-400" />Счета
            </span>
            {invoices.length > 0 && <span className="text-[10px] text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full font-bold">{invoices.length}</span>}
          </div>

          {loadingInvoices ? (
            <div className="flex items-center justify-center h-16"><div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#0d1f3c]" /></div>
          ) : invoices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-6 text-center">
              <Receipt size={22} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">Нет счетов для этого клиента</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {invoices.map(p => (
                <button key={p.id} onClick={() => openInvoiceDetail(p)}
                  className="w-full text-left bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 hover:shadow-md hover:border-slate-300 transition-all group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="font-pro text-sm font-extrabold text-slate-900">{p.number}</span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-md">{p.currency}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mb-1.5">{fmtDate(p.confirmed_at ?? p.created_at)}</div>
                      <div className="flex gap-1 flex-wrap">
                        {p.paid && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full"><CreditCard size={9} />ОПЛАЧЕНО</span>}
                        {p.delivered && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full"><Truck size={9} />ДОСТАВЛЕНО</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {p.total_amount > 0 && (
                        <span className="font-pro text-sm font-black text-slate-900 tabular-nums">
                          {fmt(p.total_amount)}<span className="ml-1 text-[10px] font-semibold text-slate-400">{p.currency}</span>
                        </span>
                      )}
                      <ChevronRight size={15} className="text-slate-300 group-hover:text-[#0d1f3c] transition-colors" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Удалить клиента?</h3>
                <p className="text-xs text-slate-500 mt-0.5">«{selected.name}» будет удалён.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Отмена</button>
              <button onClick={() => deleteClient(deleteConfirm)} className="flex-1 py-2.5 rounded-xl bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600 transition-colors">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  ) as React.ReactElement;
}

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-[#0d1f3c] focus:bg-white transition-all bg-slate-50';

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
        {icon}{label}
      </label>
      {children}
    </div>
  );
}
