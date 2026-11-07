import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Receipt, ChevronRight, X, FileSpreadsheet, FileText as FilePdf,
  Pencil, Truck, CreditCard, Archive, ArchiveRestore, Search,
  Camera, Download, Trash2, ImageOff, Plus as PlusIcon, RotateCcw, Trash,
  Copy, ChevronUp, ChevronDown, Check, AlertTriangle, Package, Save, Video, Play,
  Layers, ChevronLeft,
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { downloadBlob } from '../lib/download';
import { supabase, type Proforma, type ProformaItem, type Client } from '../lib/supabase';
import ProformaForm from './ProformaForm';

interface InvoicePhoto {
  id: string;
  proforma_id: string;
  storage_path: string;
  filename: string;
  created_at: string;
}

interface InvoiceVideo {
  id: string;
  proforma_id: string;
  storage_path: string;
  filename: string;
  created_at: string;
}

type View = 'list' | 'archive' | 'detail' | 'edit' | 'trash';

interface MergeSmeta extends Proforma {
  _itemCount: number;
  _total: number;
}

const TAX_RATE = 5;
const currencySymbol: Record<string, string> = { USD: '$', AED: 'د.إ', EUR: '€', GBP: '£' };
export default function InvoicePage({ owner, role }: { owner: string; role: 'admin' | 'assistant' }) {
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [archived, setArchived] = useState<Proforma[]>([]);
  const [trashed, setTrashed] = useState<Proforma[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('list');
  const [selected, setSelected] = useState<Proforma | null>(null);
  const [items, setItems] = useState<ProformaItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [showCost, setShowCost] = useState(false);
  const [hideProfit, setHideProfit] = useState(false);
  const [hoveredColumn, setHoveredColumn] = useState<string | null>(null);
  const canShowCost = role === 'admin' && showCost;
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [returnConfirm, setReturnConfirm] = useState(false);
  const [returnChoice, setReturnChoice] = useState(false);
  const [delivery, setDelivery] = useState({ date: '', location: '', type: '', qty: '', deliverer: '' });
  const [savingDelivery, setSavingDelivery] = useState(false);
  const [photos, setPhotos] = useState<InvoicePhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<InvoicePhoto | null>(null);
  const [videos, setVideos] = useState<InvoiceVideo[]>([]);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [lightboxVideo, setLightboxVideo] = useState<InvoiceVideo | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [duplicating, setDuplicating] = useState(false);
  const [paidDate, setPaidDate] = useState('');
  const [deliveredDate, setDeliveredDate] = useState('');
  const [editingPaidDate, setEditingPaidDate] = useState(false);
  const [editingDeliveredDate, setEditingDeliveredDate] = useState(false);
  const [depositAmount, setDepositAmount] = useState(0);
  const [savingDeposit, setSavingDeposit] = useState(false);
  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('percent');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountFixed, setDiscountFixed] = useState(0);
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [extraDeliveryCost, setExtraDeliveryCost] = useState(0);
  const [extraDeliveryLabel, setExtraDeliveryLabel] = useState('');
  const [extraExpensesVal, setExtraExpensesVal] = useState(0);
  const [notesVal, setNotesVal] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [editingNumber, setEditingNumber] = useState(false);
  const [numberVal, setNumberVal] = useState('');
  const [savingNumber, setSavingNumber] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveDeliveryRef = useRef<() => void>(() => {});

  const [showMerge, setShowMerge] = useState(false);
  const [mergeClients, setMergeClients] = useState<Client[]>([]);
  const [mergeSelectedClient, setMergeSelectedClient] = useState<Client | null>(null);
  const [mergeSmetas, setMergeSmetas] = useState<MergeSmeta[]>([]);
  const [mergeSelectedIds, setMergeSelectedIds] = useState<Set<string>>(new Set());
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeCreating, setMergeCreating] = useState(false);
  const [mergeClientSearch, setMergeClientSearch] = useState('');

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => { saveDeliveryRef.current = saveDelivery; });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        if (view === 'list' || view === 'archive') {
          searchRef.current?.focus();
          searchRef.current?.select();
        }
        return;
      }
      if (e.key === 'Escape') {
        if (lightboxPhoto) { setLightboxPhoto(null); return; }
    if (lightboxVideo) { setLightboxVideo(null); return; }
        if (view === 'detail' || view === 'edit') setView(selected?.archived ? 'archive' : 'list');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, lightboxPhoto, lightboxVideo, selected]);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase
      .from('proformas').select('*').eq('confirmed', true)
      .eq('owner', owner)
      .order('sort_order')
      .order('confirmed_at', { ascending: false });
    if (data) {
      const all = data as Proforma[];
      setProformas(all.filter(p => !p.archived && !p.trashed));
      setArchived(all.filter(p => p.archived && !p.trashed));
      setTrashed(all.filter(p => p.trashed));
    }
    setLoading(false);
  }

  async function openMergeModal() {
    setShowMerge(true);
    setMergeSelectedClient(null);
    setMergeSelectedIds(new Set());
    setMergeSmetas([]);
    setMergeClientSearch('');
    setMergeLoading(true);
    const { data } = await supabase.from('clients').select('*').eq('owner', owner).order('name').limit(1000);
    if (data) setMergeClients(data as Client[]);
    setMergeLoading(false);
  }

  async function selectMergeClient(client: Client) {
    setMergeSelectedClient(client);
    setMergeSelectedIds(new Set());
    setMergeLoading(true);
    const { data: smetas } = await supabase
      .from('proformas').select('*')
      .eq('confirmed', false)
      .eq('trashed', false)
      .eq('owner', owner)
      .eq('client_code', client.code)
      .order('created_at', { ascending: false });
    if (smetas) {
      const enriched = await Promise.all((smetas as Proforma[]).map(async p => {
        const { data: itemsData } = await supabase
          .from('proforma_items').select('quantity, unit_price')
          .eq('proforma_id', p.id).eq('owner', owner);
        const itemCount = (itemsData ?? []).length;
        const total = (itemsData ?? []).reduce((s, i) => s + (i as { quantity: number; unit_price: number }).quantity * (i as { quantity: number; unit_price: number }).unit_price, 0);
        return { ...p, _itemCount: itemCount, _total: total } as MergeSmeta;
      }));
      setMergeSmetas(enriched);
    } else {
      setMergeSmetas([]);
    }
    setMergeLoading(false);
  }

  function toggleMergeSmeta(id: string) {
    setMergeSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createMergedInvoice() {
    if (!mergeSelectedClient || mergeSelectedIds.size === 0) return;
    setMergeCreating(true);

    const selectedSmetas = mergeSmetas.filter(s => mergeSelectedIds.has(s.id));
    const firstCurrency = selectedSmetas[0]?.currency ?? 'AED';

    let allItems: ProformaItem[] = [];
    for (const s of selectedSmetas) {
      const { data: itemsData } = await supabase
        .from('proforma_items').select('*')
        .eq('proforma_id', s.id).eq('owner', owner)
        .order('sort_order');
      if (itemsData) allItems = allItems.concat(itemsData as ProformaItem[]);
    }

    const sub = allItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);

    // Build number from selected smeta numbers: first full + /suffix for each subsequent
    const smetaNums = selectedSmetas.map(s => s.number ?? '');
    let newNumber: string;
    if (smetaNums.length === 0) {
      newNumber = 'INV';
    } else if (smetaNums.length === 1) {
      newNumber = smetaNums[0];
    } else {
      const first = smetaNums[0];
      const suffixes = smetaNums.slice(1).map(n => {
        let i = 0;
        while (i < first.length && i < n.length && first[i] === n[i]) i++;
        return n.slice(i) || n;
      });
      newNumber = first + '/' + suffixes.join('/');
    }

    const { data: newProforma } = await supabase.from('proformas').insert([{
      number: newNumber,
      client: mergeSelectedClient.name,
      client_code: mergeSelectedClient.code,
      currency: firstCurrency,
      discount_percent: 0,
      discount_mode: 'percent',
      discount_fixed: 0,
      tax_percent: 0,
      purchase_tax_global: false,
      total_amount: sub,
      notes: '',
      confirmed: true,
      confirmed_at: new Date().toISOString(),
      extra_delivery_cost: 0,
      extra_delivery_label: null,
      extra_cost_on_invoice: true,
      extra_expenses: 0,
      deposit_amount: 0,
      paid: false,
      delivered: false,
      archived: false,
      trashed: false,
      merged_from: selectedSmetas.map(s => s.id),
      owner,
    }]).select().maybeSingle();

    if (newProforma) {
      const newId = (newProforma as Proforma).id;
      if (allItems.length > 0) {
        const newItems = allItems.map((item, idx) => ({
          article: item.article,
          brand: item.brand,
          description: item.description,
          origin: item.origin,
          uom: item.uom,
          quantity: item.quantity,
          unit_price: item.unit_price,
          sort_order: idx,
          purchase_price: item.purchase_price ?? 0,
          supplier: item.supplier ?? '',
          supplier_payment: item.supplier_payment ?? 0,
          purchase_tax_enabled: item.purchase_tax_enabled ?? false,
          supplier_paid: item.supplier_paid ?? false,
          supplier_discount_percent: item.supplier_discount_percent ?? 0,
          supplier_discount_fixed: item.supplier_discount_fixed ?? 0,
          supplier_discount_mode: item.supplier_discount_mode ?? 'percent',
          product_id: item.product_id,
          proforma_id: newId,
          owner,
        }));
        await supabase.from('proforma_items').insert(newItems);
      }

      if (mergeSelectedClient.code) {
        const { data: clientData } = await supabase
          .from('clients').select('id').eq('code', mergeSelectedClient.code).maybeSingle();
        if (clientData) {
          await supabase.from('client_transactions').upsert([{
            client_id: (clientData as { id: string }).id,
            proforma_id: newId,
            date: new Date().toISOString().slice(0, 10),
            amount: sub,
            details: `Счёт ${newNumber}`,
            owner,
          }], { onConflict: 'proforma_id' });
        }
      }

      await supabase.from('requests')
        .update({ status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('proforma_id', newId).eq('archived', false);

      // Mark source smetas as merged (hide from Smeta section, keep for potential restore)
      for (const s of selectedSmetas) {
        await supabase.from('proformas').update({ merged_into: newId }).eq('id', s.id);
      }
    }

    setMergeCreating(false);
    setShowMerge(false);
    await fetchAll();
    if (newProforma) openDetail(newProforma as Proforma);
  }

  async function returnToDetail(id: string) {
    await fetchAll();
    const { data } = await supabase.from('proformas').select('*').eq('id', id).maybeSingle();
    setView('detail');
    if (data) await openDetail(data as Proforma);
  }

  async function openDetail(p: Proforma) {
    setSelected(p);
    setDelivery({
      date: p.delivery_date ?? '',
      location: p.delivery_location ?? '',
      type: p.delivery_type ?? '',
      qty: p.delivery_qty ?? '',
      deliverer: p.deliverer ?? '',
    });
    setPaidDate(p.paid_at ? new Date(p.paid_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setDeliveredDate(p.delivered_at ? new Date(p.delivered_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditingPaidDate(false);
    setEditingDeliveredDate(false);
    setEditingNumber(false);
    setNumberVal(p.number);
    setDepositAmount(p.deposit_amount ?? 0);
    setDiscountMode(p.discount_mode ?? 'percent');
    setDiscountPercent(p.discount_percent ?? 0);
    setDiscountFixed(p.discount_fixed ?? 0);
    setTaxEnabled((p.tax_percent ?? 0) > 0);
    setExtraDeliveryCost(p.extra_delivery_cost ?? 0);
    setExtraDeliveryLabel(p.extra_delivery_label ?? '');
    setExtraExpensesVal(p.extra_expenses ?? 0);
    setNotesVal(p.notes ?? '');
    setHideProfit(p.profit_hidden ?? false);
    setView('detail');
    setLoadingItems(true);
    const { data } = await supabase.from('proforma_items').select('*').eq('proforma_id', p.id).eq('owner', owner).order('sort_order');
    if (data) setItems(data as ProformaItem[]);
    setLoadingItems(false);
    const { data: photoData } = await supabase.from('invoice_photos').select('*').eq('proforma_id', p.id).eq('owner', owner).order('created_at');
    if (photoData) setPhotos(photoData as InvoicePhoto[]);
    else setPhotos([]);
    const { data: videoData } = await supabase.from('invoice_videos').select('*').eq('proforma_id', p.id).eq('owner', owner).order('created_at');
    if (videoData) setVideos(videoData as InvoiceVideo[]);
    else setVideos([]);
  }

  function getPhotoUrl(path: string) {
    const { data } = supabase.storage.from('invoice-photos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadPhotos(files: FileList) {
    if (!selected || photos.length >= 10) return;
    setUploadingPhoto(true);
    const remaining = 10 - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    for (const file of toUpload) {
      const path = `${selected.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('invoice-photos').upload(path, file);
      if (!error) {
        const { data } = await supabase.from('invoice_photos').insert([{
          proforma_id: selected.id, storage_path: path, filename: file.name, owner,
        }]).select().maybeSingle();
        if (data) setPhotos(prev => [...prev, data as InvoicePhoto]);
      }
    }
    setUploadingPhoto(false);
  }

  async function deletePhoto(photo: InvoicePhoto) {
    await supabase.storage.from('invoice-photos').remove([photo.storage_path]);
    await supabase.from('invoice_photos').delete().eq('id', photo.id);
    setPhotos(prev => prev.filter(p => p.id !== photo.id));
    if (lightboxPhoto?.id === photo.id) setLightboxPhoto(null);
  }

  function getVideoUrl(path: string) {
    const { data } = supabase.storage.from('invoice-videos').getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadVideos(files: FileList) {
    if (!selected || videos.length >= 5) return;
    setUploadingVideo(true);
    const remaining = 5 - videos.length;
    const toUpload = Array.from(files).slice(0, remaining);
    for (const file of toUpload) {
      const path = `${selected.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error } = await supabase.storage.from('invoice-videos').upload(path, file);
      if (!error) {
        const { data } = await supabase.from('invoice_videos').insert([{
          proforma_id: selected.id, storage_path: path, filename: file.name, owner,
        }]).select().maybeSingle();
        if (data) setVideos(prev => [...prev, data as InvoiceVideo]);
      }
    }
    setUploadingVideo(false);
  }

  async function deleteVideo(video: InvoiceVideo) {
    await supabase.storage.from('invoice-videos').remove([video.storage_path]);
    await supabase.from('invoice_videos').delete().eq('id', video.id);
    setVideos(prev => prev.filter(v => v.id !== video.id));
    if (lightboxVideo?.id === video.id) setLightboxVideo(null);
  }

  // Deletes all accounting entries for an invoice.
  // Handles both old entries (proforma_id=null, matched by details text) and new ones.
  async function deleteAccountingEntries(proformaId: string, invoiceNumber: string, clientCode: string | null | undefined) {
    // Delete entries linked by proforma_id (new entries)
    await supabase.from('client_transactions').delete().eq('proforma_id', proformaId);
    // Also delete old entries that have proforma_id=null but match by client+details
    if (clientCode) {
      const { data: cd } = await supabase.from('clients').select('id').eq('code', clientCode).maybeSingle();
      if (cd) {
        await supabase.from('client_transactions').delete()
          .eq('client_id', (cd as { id: string }).id)
          .ilike('details', `%счёту ${invoiceNumber}`);
      }
    }
  }

  async function syncRequestCheck(check: 'check_paid' | 'check_delivered' | 'check_suppliers_paid' | 'check_archived', value: boolean, proformaId: string): Promise<void> {
    await supabase.from('requests').update({ [check]: value, updated_at: new Date().toISOString() }).eq('proforma_id', proformaId).eq('owner', owner).eq('archived', false);
  }

  async function toggleStatus(field: 'paid' | 'delivered') {
    if (!selected) return;
    const newVal = !selected[field];
    const today = new Date().toISOString().slice(0, 10);
    const dateField = field === 'paid' ? 'paid_at' : 'delivered_at';
    const dateVal = newVal ? new Date(today + 'T00:00:00').toISOString() : null;
    await supabase.from('proformas').update({ [field]: newVal, [dateField]: dateVal }).eq('id', selected.id);
    const updated = { ...selected, [field]: newVal, [dateField]: dateVal };
    setSelected(updated);
    setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
    setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
    if (field === 'paid' && newVal) setPaidDate(today);
    if (field === 'delivered' && newVal) setDeliveredDate(today);
    await syncRequestCheck(field === 'paid' ? 'check_paid' : 'check_delivered', newVal, selected.id);

    // Sync accounting: update the invoice transaction when paid status changes
    if (field === 'paid' && selected.client_code) {
      const { data: clientData } = await supabase
        .from('clients').select('id').eq('code', selected.client_code).maybeSingle();
      if (clientData) {
        const clientId = (clientData as { id: string }).id;
        if (newVal) {
          // Mark as paid: update the existing transaction (created at confirmation)
          await supabase.from('client_transactions')
            .update({ details: `Счёт ${selected.number} (оплачен)` })
            .eq('proforma_id', selected.id);
        } else {
          // Unpaid: revert details
          await supabase.from('client_transactions')
            .update({ details: `Счёт ${selected.number}` })
            .eq('proforma_id', selected.id);
        }
      }
    }
  }

  async function handleStatusToggle(field: 'paid' | 'delivered') {
    if (!selected) return;
    const activating = !selected[field];
    await toggleStatus(field);
    if (field === 'paid') setEditingPaidDate(activating);
    else setEditingDeliveredDate(activating);
  }

  async function toggleArchive() {
    if (!selected) return;
    const newVal = !selected.archived;
    await supabase.from('proformas').update({ archived: newVal }).eq('id', selected.id);
    await syncRequestCheck('check_archived', newVal, selected.id);
    const updated = { ...selected, archived: newVal };
    setSelected(updated);
    if (newVal) {
      setProformas(prev => prev.filter(p => p.id !== selected.id));
      setArchived(prev => [updated, ...prev]);
    } else {
      setArchived(prev => prev.filter(p => p.id !== selected.id));
      setProformas(prev => [updated, ...prev]);
    }
    setView(newVal ? 'archive' : 'list');
  }

  async function returnToSmeta() {
    if (!selected) return;
    // If this was a merged invoice, show choice dialog
    if (selected.merged_from && selected.merged_from.length > 1) {
      setReturnConfirm(false);
      setReturnChoice(true);
      return;
    }
    await doReturnToSmeta();
  }

  async function doReturnToSmeta() {
    if (!selected) return;
    await supabase.from('proformas')
      .update({ confirmed: false, confirmed_at: null, paid: false, delivered: false })
      .eq('id', selected.id);
    await supabase.from('requests')
      .update({ status: 'recieved', updated_at: new Date().toISOString() })
      .eq('proforma_id', selected.id)
      .eq('archived', false);
    setProformas(prev => prev.filter(p => p.id !== selected.id));
    setArchived(prev => prev.filter(p => p.id !== selected.id));
    setReturnConfirm(false);
    setReturnChoice(false);
    setSelected(null);
    setView('list');
  }

  // Return merged invoice as a single smeta (keep as one, just unconfirm)
  async function returnAsOneSmeta() {
    await doReturnToSmeta();
    await fetchAll();
  }

  // Return merged invoice back into multiple separate smetas
  async function returnAsMultipleSmetas() {
    if (!selected || !selected.merged_from) { await doReturnToSmeta(); return; }

    // Unconfirm the merged invoice and delete it
    await supabase.from('client_transactions').delete().eq('proforma_id', selected.id);
    await supabase.from('proforma_items').delete().eq('proforma_id', selected.id);
    await supabase.from('requests')
      .update({ status: 'recieved', updated_at: new Date().toISOString() })
      .eq('proforma_id', selected.id)
      .eq('archived', false);
    await supabase.from('proformas').delete().eq('id', selected.id);

    // Restore original smetas: unconfirm them and clear merged_into
    for (const srcId of selected.merged_from) {
      await supabase.from('proformas')
        .update({ merged_into: null, confirmed: false, confirmed_at: null, paid: false, delivered: false })
        .eq('id', srcId);
      // Restore their request status
      await supabase.from('requests')
        .update({ status: 'recieved', updated_at: new Date().toISOString() })
        .eq('proforma_id', srcId)
        .eq('archived', false);
    }

    setProformas(prev => prev.filter(p => p.id !== selected.id));
    setArchived(prev => prev.filter(p => p.id !== selected.id));
    setReturnConfirm(false);
    setReturnChoice(false);
    setSelected(null);
    setView('list');
    await fetchAll();
  }

  async function trashInvoice(id: string) {
    // Remove accounting entry when trashing (both old and new style entries)
    const proforma = [...proformas, ...archived].find(x => x.id === id);
    if (proforma) {
      await deleteAccountingEntries(id, proforma.number, proforma.client_code);
    } else {
      await supabase.from('client_transactions').delete().eq('proforma_id', id);
    }
    await supabase.from('proformas').update({ trashed: true }).eq('id', id);
    const p = [...proformas, ...archived].find(x => x.id === id);
    setProformas(prev => prev.filter(x => x.id !== id));
    setArchived(prev => prev.filter(x => x.id !== id));
    if (p) setTrashed(prev => [{ ...p, trashed: true }, ...prev]);
    setDeleteConfirm(false);
    setView('list');
  }

  async function restoreFromTrash(id: string) {
    await supabase.from('proformas').update({ trashed: false }).eq('id', id);
    const p = trashed.find(x => x.id === id);
    setTrashed(prev => prev.filter(x => x.id !== id));
    if (p) {
      const restored = { ...p, trashed: false };
      if (restored.archived) setArchived(prev => [restored, ...prev]);
      else setProformas(prev => [restored, ...prev]);
    }
  }

  async function permanentDeleteInvoice(id: string) {
    const proforma = trashed.find(x => x.id === id);
    if (proforma) {
      await deleteAccountingEntries(id, proforma.number, proforma.client_code);
    } else {
      await supabase.from('client_transactions').delete().eq('proforma_id', id);
    }
    const { data: photoRows } = await supabase.from('invoice_photos').select('storage_path').eq('proforma_id', id).eq('owner', owner);
    if (photoRows && photoRows.length > 0) {
      await supabase.storage.from('invoice-photos').remove(photoRows.map(r => r.storage_path));
    }
    await supabase.from('invoice_photos').delete().eq('proforma_id', id);
    const { data: videoRows } = await supabase.from('invoice_videos').select('storage_path').eq('proforma_id', id).eq('owner', owner);
    if (videoRows && videoRows.length > 0) {
      await supabase.storage.from('invoice-videos').remove(videoRows.map(r => r.storage_path));
    }
    await supabase.from('invoice_videos').delete().eq('proforma_id', id);
    await supabase.from('proforma_items').delete().eq('proforma_id', id);
    await supabase.from('proformas').delete().eq('id', id);
    setTrashed(prev => prev.filter(x => x.id !== id));
    if (selected?.id === id) { setSelected(null); setView('trash'); }
  }

  const [clearTrashConfirm, setClearTrashConfirm] = useState(false);
  const [clearingTrash, setClearingTrash] = useState(false);

  async function clearAllTrash() {
    setClearingTrash(true);
    for (const p of trashed) {
      await deleteAccountingEntries(p.id, p.number, p.client_code);
      const { data: photoRows } = await supabase.from('invoice_photos').select('storage_path').eq('proforma_id', p.id).eq('owner', owner);
      if (photoRows && photoRows.length > 0) {
        await supabase.storage.from('invoice-photos').remove(photoRows.map(r => r.storage_path));
      }
      await supabase.from('invoice_photos').delete().eq('proforma_id', p.id);
      const { data: videoRows } = await supabase.from('invoice_videos').select('storage_path').eq('proforma_id', p.id).eq('owner', owner);
      if (videoRows && videoRows.length > 0) {
        await supabase.storage.from('invoice-videos').remove(videoRows.map(r => r.storage_path));
      }
      await supabase.from('invoice_videos').delete().eq('proforma_id', p.id);
      await supabase.from('proforma_items').delete().eq('proforma_id', p.id);
      await supabase.from('proformas').delete().eq('id', p.id);
    }
    setTrashed([]);
    setClearingTrash(false);
    setClearTrashConfirm(false);
  }

  async function duplicateInvoice() {
    if (!selected || duplicating) return;
    setDuplicating(true);
    // Strip any /N suffix to get the base number, then find next available /N
    const baseNumber = selected.number.replace(/\/\d+$/, '');
    const { data: existing } = await supabase
      .from('proformas').select('number').like('number', `${baseNumber}/%`);
    let maxN = 1;
    for (const p of (existing ?? [])) {
      const match = (p as { number: string }).number.match(/\/(\d+)$/);
      if (match) maxN = Math.max(maxN, parseInt(match[1]));
    }
    const newNumber = `${baseNumber}/${maxN + 1}`;
    const { data: newProforma } = await supabase.from('proformas').insert([{
      number: newNumber,
      client: selected.client,
      client_code: selected.client_code,
      currency: selected.currency,
      discount_percent: selected.discount_percent,
      discount_mode: selected.discount_mode,
      discount_fixed: selected.discount_fixed,
      tax_percent: selected.tax_percent,
      purchase_tax_global: selected.purchase_tax_global,
      total_amount: selected.total_amount,
      notes: selected.notes,
      confirmed: selected.confirmed,
      confirmed_at: selected.confirmed ? new Date().toISOString() : null,
      extra_delivery_cost: selected.extra_delivery_cost,
      extra_delivery_label: selected.extra_delivery_label,
      extra_cost_on_invoice: selected.extra_cost_on_invoice ?? true,
      deposit_amount: selected.deposit_amount,
      paid: false,
      delivered: false,
      archived: false,
      trashed: false,
      owner,
    }]).select().maybeSingle();
    if (newProforma) {
      // Copy items
      const { data: srcItems } = await supabase.from('proforma_items').select('*').eq('proforma_id', selected.id).eq('owner', owner).order('sort_order');
      if (srcItems && srcItems.length > 0) {
        const newItems = (srcItems as ProformaItem[]).map(({ id: _id, proforma_id: _pid, created_at: _ca, ...rest }) => ({
          ...rest,
          proforma_id: (newProforma as Proforma).id,
          owner,
        }));
        await supabase.from('proforma_items').insert(newItems);
      }
      await fetchAll();
      openDetail(newProforma as Proforma);
    }
    setDuplicating(false);
  }

  async function saveDeposit() {
    if (!selected) return;
    setSavingDeposit(true);
    await supabase.from('proformas').update({ deposit_amount: depositAmount }).eq('id', selected.id);
    const updated = { ...selected, deposit_amount: depositAmount };
    setSelected(updated);
    setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
    setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
    setSavingDeposit(false);
  }

  async function saveDelivery() {
    if (!selected) return;
    setSavingDelivery(true);
    await supabase.from('proformas').update({
      delivery_date: delivery.date,
      delivery_location: delivery.location,
      delivery_type: delivery.type,
      delivery_qty: delivery.qty,
      deliverer: delivery.deliverer,
    }).eq('id', selected.id);
    const updated = {
      ...selected,
      delivery_date: delivery.date,
      delivery_location: delivery.location,
      delivery_type: delivery.type,
      delivery_qty: delivery.qty,
      deliverer: delivery.deliverer,
    };
    setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
    setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
    setSelected(updated);
    setSavingDelivery(false);
  }

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  async function moveInvoice(p: Proforma, dir: 'up' | 'down', inArchive: boolean) {
    const list = inArchive ? archived : proformas;
    const idx = list.findIndex(x => x.id === p.id);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const newList = [...list];
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
    if (inArchive) setArchived(newList); else setProformas(newList);
    for (let i = 0; i < newList.length; i++) {
      await supabase.from('proformas').update({ sort_order: i }).eq('id', newList[i].id);
    }
  }

  async function saveDateStamp(field: 'paid_at' | 'delivered_at', dateStr: string) {
    if (!selected) return;
    const val = dateStr ? new Date(dateStr + 'T00:00:00').toISOString() : null;
    await supabase.from('proformas').update({ [field]: val }).eq('id', selected.id);
    const updated = { ...selected, [field]: val };
    setSelected(updated);
    setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
    setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const discountAmt = discountMode === 'fixed' ? discountFixed : subtotal * discountPercent / 100;
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * (taxEnabled ? TAX_RATE : 0) / 100;
  const extraExpenses = extraExpensesVal;
  const extraDelivery = extraDeliveryCost;
  const total = afterDiscount + taxAmt + extraExpenses;
  const purchaseSubtotal = items.reduce((s, i) => s + i.quantity * (i.purchase_price ?? 0), 0);
  const purchaseTotal = items.reduce((s, i, idx) => {
    const base = i.quantity * (i.purchase_price ?? 0);
    const discMode = i.supplier_discount_mode ?? 'percent';
    const hasPrev = items.slice(0, idx).some(p => (p.supplier ?? '').trim() === (i.supplier ?? '').trim());
    const discBase = discMode === 'percent'
      ? base * (1 - (i.supplier_discount_percent ?? 0) / 100)
      : Math.max(0, base - (hasPrev ? 0 : (i.supplier_discount_fixed ?? 0)));
    return s + discBase * (i.purchase_tax_enabled ? 1.05 : 1);
  }, 0) + extraDelivery;
  const profitBeforeExtraDelivery = total - (purchaseTotal - extraDelivery);
  const profit = profitBeforeExtraDelivery - extraDelivery;

  const supplierData = items.reduce((acc, i, idx) => {
    const name = (i.supplier ?? '').trim();
    if (!name) return acc;
    const base = i.quantity * (i.purchase_price ?? 0);
    const discMode = i.supplier_discount_mode ?? 'percent';
    const hasPrev = items.slice(0, idx).some(p => (p.supplier ?? '').trim() === name);
    const discBase = discMode === 'percent'
      ? base * (1 - (i.supplier_discount_percent ?? 0) / 100)
      : Math.max(0, base - (hasPrev ? 0 : (i.supplier_discount_fixed ?? 0)));
    const cost = discBase * (i.purchase_tax_enabled ? 1.05 : 1);
    if (!acc[name]) acc[name] = { total: 0, paid: true, payment: 0, count: 0, taxAll: true, taxSome: false, discMode: 'percent', discPct: 0, discFixed: 0 };
    acc[name].total += cost;
    acc[name].paid = acc[name].paid && (i.supplier_paid ?? false);
    acc[name].payment += i.supplier_payment ?? 0;
    acc[name].count += 1;
    acc[name].taxAll = acc[name].taxAll && (i.purchase_tax_enabled ?? false);
    acc[name].taxSome = acc[name].taxSome || (i.purchase_tax_enabled ?? false);
    if (acc[name].count === 1) {
      acc[name].discMode = discMode;
      acc[name].discPct = i.supplier_discount_percent ?? 0;
      acc[name].discFixed = i.supplier_discount_fixed ?? 0;
    }
    return acc;
  }, {} as Record<string, { total: number; paid: boolean; payment: number; count: number; taxAll: boolean; taxSome: boolean; discMode: 'percent' | 'fixed'; discPct: number; discFixed: number }>);

  async function toggleSupplierPaid(name: string) {
    const allPaid = supplierData[name]?.paid ?? false;
    const affected = items.filter(i => (i.supplier ?? '').trim() === name);
    const newVal = !allPaid;
    setItems(prev => prev.map(i => (i.supplier ?? '').trim() === name ? { ...i, supplier_paid: newVal } : i));
    await Promise.all(affected.map(i => supabase.from('proforma_items').update({ supplier_paid: newVal }).eq('id', i.id)));
    const nextItems = items.map(i => (i.supplier ?? '').trim() === name ? { ...i, supplier_paid: newVal } : i);
    const hasSuppliers = nextItems.some(i => (i.supplier ?? '').trim());
    const allSuppliersPaid = hasSuppliers && nextItems.filter(i => (i.supplier ?? '').trim()).every(i => i.supplier_paid ?? false);
    if (selected) await syncRequestCheck('check_suppliers_paid', allSuppliersPaid, selected.id);
  }

  async function toggleSupplierTax(name: string) {
    const allTax = supplierData[name]?.taxAll ?? false;
    const affected = items.filter(i => (i.supplier ?? '').trim() === name);
    const newVal = !allTax;
    setItems(prev => prev.map(i => (i.supplier ?? '').trim() === name ? { ...i, purchase_tax_enabled: newVal } : i));
    await Promise.all(affected.map(i => supabase.from('proforma_items').update({ purchase_tax_enabled: newVal }).eq('id', i.id)));
  }

  async function updateSupplierDiscount(name: string, mode: 'percent' | 'fixed', value: number) {
    const affected = items.filter(i => (i.supplier ?? '').trim() === name);
    setItems(prev => prev.map(i =>
      (i.supplier ?? '').trim() === name
        ? { ...i, supplier_discount_mode: mode, supplier_discount_percent: mode === 'percent' ? value : 0, supplier_discount_fixed: mode === 'fixed' ? value : 0 }
        : i
    ));
    await Promise.all(affected.map(i =>
      supabase.from('proforma_items').update({
        supplier_discount_mode: mode,
        supplier_discount_percent: mode === 'percent' ? value : 0,
        supplier_discount_fixed: mode === 'fixed' ? value : 0,
      }).eq('id', i.id)
    ));
  }

  async function togglePurchaseTaxAll() {
    const allOn = items.length > 0 && items.every(i => i.purchase_tax_enabled);
    const newVal = !allOn;
    setItems(prev => prev.map(i => ({ ...i, purchase_tax_enabled: newVal })));
    await Promise.all(items.map(i => supabase.from('proforma_items').update({ purchase_tax_enabled: newVal }).eq('id', i.id)));
  }

  async function saveNumber() {
    if (!selected) return;
    const trimmed = numberVal.trim();
    if (!trimmed) return;
    setSavingNumber(true);
    await supabase.from('proformas').update({
      number: trimmed,
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);

    const updated = { ...selected, number: trimmed };
    setSelected(updated);
    setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
    setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
    setEditingNumber(false);
    setSavingNumber(false);
  }

  async function saveSettings() {
    if (!selected) return;
    setSavingSettings(true);
    const effectiveDiscountPct = discountMode === 'percent' ? discountPercent : 0;
    const effectiveDiscountFixed = discountMode === 'fixed' ? discountFixed : 0;
    const effectiveTaxPct = taxEnabled ? TAX_RATE : 0;
    const sub = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const discAmt = discountMode === 'percent' ? sub * effectiveDiscountPct / 100 : effectiveDiscountFixed;
    const afterDisc = sub - discAmt;
    const taxAmtCalc = afterDisc * effectiveTaxPct / 100;
    const totalCalc = afterDisc + taxAmtCalc + extraExpensesVal;

    await supabase.from('proformas').update({
      discount_percent: effectiveDiscountPct,
      discount_mode: discountMode,
      discount_fixed: effectiveDiscountFixed,
      tax_percent: effectiveTaxPct,
      extra_delivery_cost: extraDeliveryCost,
      extra_delivery_label: extraDeliveryLabel || null,
      extra_cost_on_invoice: true,
      extra_expenses: extraExpensesVal,
      notes: notesVal,
      profit_hidden: hideProfit,
      total_amount: totalCalc,
      updated_at: new Date().toISOString(),
    }).eq('id', selected.id);

    const updated: Proforma = {
      ...selected,
      discount_percent: effectiveDiscountPct,
      discount_mode: discountMode,
      discount_fixed: effectiveDiscountFixed,
      tax_percent: effectiveTaxPct,
      extra_delivery_cost: extraDeliveryCost,
      extra_delivery_label: extraDeliveryLabel || null,
      extra_cost_on_invoice: true,
      extra_expenses: extraExpensesVal,
      notes: notesVal,
      profit_hidden: hideProfit,
      total_amount: totalCalc,
    };
    setSelected(updated);
    setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
    setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
    setSavingSettings(false);
  }

  function exportExcel() {
    if (!selected) return;
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

    const hdrCell = (v: string) => cell(v, {
      font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } },
      fill: { fgColor: { rgb: 'F3F4F6' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: allThin,
    });
    const dataCell = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, {
      font: baseFont,
      alignment: { horizontal: align, vertical: 'center', wrapText: true },
      border: allThin,
    });
    const boldData = (v: string | number, align: 'left'|'center'|'right' = 'left') => cell(v, {
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
      cell('INVOICE', { font: { name: 'Arial', bold: true, sz: 16, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null, null,
      cell(`№ ${selected.number}`, { font: { name: 'Arial', bold: true, sz: 13, color: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 28 }; r++;

    aoa.push([
      cell(`Дата: ${date}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null, null,
      cell(`Валюта: ${selected.currency}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 16 }; r++;

    aoa.push([
      cell(`КК: ${selected.client_code || '—'}${selected.delivery_location ? `  ·  ${selected.delivery_location}` : ''}`, { font: { ...boldFont, sz: 11 }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F9FAFB' } }, border: { bottom: { style: 'thin', color: { rgb: 'E5E7EB' } } } }),
      null, null, null, null, null, null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 20 }; r++;

    const deliveryInfo = [
      delivery.date ? `Delivery date: ${new Date(delivery.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : '',
      delivery.location ? `Delivery location: ${delivery.location}` : '',
      delivery.type ? `Type of delivery: ${delivery.type}` : '',
      delivery.qty ? `QTY: ${delivery.qty}` : '',
    ].filter(Boolean);
    if (deliveryInfo.length) {
      aoa.push([ cell(deliveryInfo.join('  ·  '), { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' }, fill: { fgColor: { rgb: 'F9FAFB' } } }), null, null, null, null, null, null, null, null ]);
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
      const discLabel = selected.discount_mode === 'fixed' ? 'Discount:' : `Discount ${selected.discount_percent}%:`;
      aoa.push(sumRow(discLabel, +(-discountAmt).toFixed(2))); rowH[r] = { hpt: 16 }; r++;
    }
    if (taxAmt > 0) { aoa.push(sumRow(`VAT ${selected.tax_percent}%:`, +taxAmt.toFixed(2))); rowH[r] = { hpt: 16 }; r++; }
    if (extraExpenses > 0) { aoa.push(sumRow('Delivery:', +extraExpenses.toFixed(2))); rowH[r] = { hpt: 16 }; r++; }
    aoa.push(sumRow('TOTAL:', +total.toFixed(2), true)); rowH[r] = { hpt: 22 }; r++;

    if ((selected.deposit_amount ?? 0) > 0) {
      const depRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      depRow[7] = cell('Deposit:', { font: { ...baseFont, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin });
      depRow[8] = cell(+(-(selected.deposit_amount ?? 0)).toFixed(2), { font: { ...boldFont, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allThin, numFmt: '#,##0.00' } as object);
      aoa.push(depRow); rowH[r] = { hpt: 18 }; r++;
      const balRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      balRow[7] = cell('Balance Due:', { font: { ...boldFont, sz: 11, color: { rgb: '2563EB' } }, alignment: { horizontal: 'right', vertical: 'center' }, border: allMed, fill: { fgColor: { rgb: 'EFF6FF' } } });
      balRow[8] = totalCell(+Math.max(0, total - (selected.deposit_amount ?? 0)).toFixed(2));
      (balRow[8] as XLSX.CellObject).s = { ...(balRow[8] as XLSX.CellObject).s, font: { ...boldFont, sz: 11, color: { rgb: '2563EB' } }, fill: { fgColor: { rgb: 'EFF6FF' } } };
      aoa.push(balRow); rowH[r] = { hpt: 22 }; r++;
    }

    if (selected.paid || selected.delivered) {
      aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 8 }; r++;
      const sStyle = (color: string, bg: string) => ({
        font: { name: 'Arial', bold: true, sz: 14, color: { rgb: color } },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: 'center', vertical: 'center' },
        border: { top: { style: 'medium', color: { rgb: color } }, bottom: { style: 'medium', color: { rgb: color } }, left: { style: 'medium', color: { rgb: color } }, right: { style: 'medium', color: { rgb: color } } },
      });
      const stampRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      let col = 0;
      if (selected.paid) { stampRow[col] = cell('  PAID  ', sStyle('1A6B3A', 'DCFCE7')); merges.push({ s: { r, c: col }, e: { r, c: col + 1 } }); col += 3; }
      if (selected.delivered) { stampRow[col] = cell('  DELIVERED  ', sStyle('1E3A8A', 'DBEAFE')); merges.push({ s: { r, c: col }, e: { r, c: col + 2 } }); }
      aoa.push(stampRow); rowH[r] = { hpt: 28 }; r++;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 9 }, { wch: 17 }, { wch: 34 }, { wch: 7 }, { wch: 7 }, { wch: 13 }, { wch: 14 }];
    ws['!rows'] = rowH;
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selected.number);
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${selected.number}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function exportPdf() {
    if (!selected) return;
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('invoice-pdf-render')?.remove();
    const container = document.createElement('div');
    container.id = 'invoice-pdf-render';

    const deliveryLines = [
      delivery.date ? `<span style="color:#15803d;"><strong>Delivery date:</strong> ${new Date(delivery.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>` : '',
      delivery.location ? `<span style="color:#15803d;"><strong>Delivery location:</strong> ${delivery.location}</span>` : '',
      delivery.type ? `<span style="color:#15803d;"><strong>Type of delivery:</strong> ${delivery.type}</span>` : '',
      delivery.qty ? `<span style="color:#15803d;"><strong>QTY:</strong> ${delivery.qty}</span>` : '',
    ].filter(Boolean).join('');

    const stampHtml = (label: string, sub: string, color: string, bg: string, stampDate?: string, shape: 'circle' | 'rect' = 'circle') => {
      const sd = stampDate
        ? new Date(stampDate + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : date;
      const uid = `pdf-${label}`;
      if (shape === 'rect') {
        return `
        <div style="display:inline-flex;flex-direction:column;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;">
          <svg width="170" height="120" viewBox="0 0 200 140">
            <rect x="6" y="6" width="188" height="128" rx="8" fill="${bg}" opacity="0.45" />
            <rect x="6" y="6" width="188" height="128" rx="8" fill="none" stroke="${color}" stroke-width="3.5" />
            <rect x="14" y="14" width="172" height="112" rx="5" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.55" />
            <text x="100" y="52" fill="${color}" font-size="20" font-weight="900" text-anchor="middle" letter-spacing="2" font-family="Helvetica Neue,Arial,sans-serif">${label}</text>
            <text x="100" y="72" fill="${color}" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="3" font-family="Helvetica Neue,Arial,sans-serif">${sub}</text>
            <line x1="50" y1="84" x2="150" y2="84" stroke="${color}" stroke-width="0.8" opacity="0.4" />
            <text x="100" y="108" fill="${color}" font-size="17" font-weight="700" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif">${sd}</text>
            <text x="100" y="126" fill="${color}" font-size="10" text-anchor="middle" opacity="0.6">✦ ✦ ✦</text>
          </svg>
        </div>`;
      }
      return `
      <div style="display:inline-flex;flex-direction:column;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;">
        <svg width="155" height="155" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="95" fill="${bg}" opacity="0.45" />
          <circle cx="100" cy="100" r="95" fill="none" stroke="${color}" stroke-width="3.5" />
          <circle cx="100" cy="100" r="85" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.55" />
          <text x="100" y="70" fill="${color}" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="4" font-family="Helvetica Neue,Arial,sans-serif">${label}</text>
          <line x1="55" y1="85" x2="145" y2="85" stroke="${color}" stroke-width="0.8" opacity="0.4" />
          <text x="100" y="110" fill="${color}" font-size="11" font-weight="700" text-anchor="middle" letter-spacing="3" font-family="Helvetica Neue,Arial,sans-serif">${sub}</text>
          <text x="100" y="140" fill="${color}" font-size="17" font-weight="700" text-anchor="middle" font-family="Helvetica Neue,Arial,sans-serif">${sd}</text>
          <text x="100" y="168" fill="${color}" font-size="11" text-anchor="middle" opacity="0.6">✦ ✦ ✦</text>
          <circle cx="20" cy="100" r="2.5" fill="${color}" opacity="0.6" />
          <circle cx="180" cy="100" r="2.5" fill="${color}" opacity="0.6" />
        </svg>
      </div>`;
    };

    const stamps = [
      selected.paid ? stampHtml('PAID', 'ОПЛАЧЕНО', '#15803d', '#f0fdf4', paidDate, 'circle') : '',
      selected.delivered ? stampHtml('DELIVERED', 'ДОСТАВЛЕНО', '#1d4ed8', '#eff6ff', deliveredDate, 'rect') : '',
    ].filter(Boolean).join('');

    const rows = items.map((item, idx) => `
      <tr style="height:32px;background:${idx % 2 !== 0 ? '#f3f4f6' : '#ffffff'};">
        <td class="ctr">${idx + 1}</td><td class="ctr">${item.brand}</td><td class="ctr">${item.origin}</td>
        <td class="ctr mono">${item.article}</td><td class="desc">${item.description}</td>
        <td class="ctr">${item.quantity}</td><td class="ctr">${item.uom}</td>
        <td class="ctr">${fmt(item.unit_price)}</td><td class="ctr bold">${fmt(item.quantity * item.unit_price)}</td>
      </tr>`).join('');

    container.innerHTML = `
      <div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;font-size:8px;color:#111;padding:30px;width:900px;background:#fff;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding:22px 28px 20px;background:#fff;border-radius:16px;box-shadow:0 1px 5px rgba(15,23,42,.08);">
          <div>
            <div style="font-size:48px;font-weight:900;letter-spacing:.18em;color:#0d1f3c;line-height:1;font-family:'Calibri',sans-serif;">INVOICE</div>
            <div style="font-size:13px;color:#718096;margin-top:8px;">${selected.number}</div>
          </div>
          <div style="text-align:right;font-size:12px;line-height:1.55;color:#718096;">
            <div style="font-size:20px;font-weight:900;color:#111827;letter-spacing:.04em;">${selected.client_code || '—'}</div>
            <div style="font-size:11px;font-weight:600;color:#4b5563;">${selected.client || '—'}</div>
            ${selected.delivery_location ? `<div style="font-size:10px;color:#6b7280;margin-top:1px;">${selected.delivery_location}</div>` : ''}
            <div>${date}</div>
          </div>
        </div>
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
            .replace(/class="ctr mono"/g, 'style="text-align:center;font-family:\'Calibri\',sans-serif;font-size:9px;font-weight:700;color:#111827;padding:5px 3px;vertical-align:middle;height:32px;line-height:1.2;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;white-space:nowrap;letter-spacing:0.02em;"')
            .replace(/class="ctr bold"/g, 'style="text-align:center;font-weight:700;font-variant-numeric:tabular-nums;padding:5px 3px;vertical-align:middle;height:32px;line-height:1.2;border-bottom:1px solid #ebebeb;"')
            .replace(/class="ctr"/g, 'style="text-align:center;font-variant-numeric:tabular-nums;padding:5px 3px;vertical-align:middle;height:32px;line-height:1.2;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;white-space:nowrap;"')
            .replace(/class="desc"/g, 'style="text-align:center;padding:5px 3px;vertical-align:middle;height:32px;line-height:1.2;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;word-break:break-word;font-size:8px;"')}</tbody>
        </table>
        <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div style="font-size:9px;color:#888;padding-top:6px;">
            <span style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total QTY:</span>
            <span style="font-weight:800;color:#111;margin-left:6px;">${items.reduce((s, i) => s + i.quantity, 0)}</span>
          </div>
          <table style="min-width:240px;border-top:1px solid #ddd;">
            <tr><td style="color:#666;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">Subtotal</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;">${fmt(subtotal)} ${selected.currency}</td></tr>
            ${discountAmt > 0 ? `<tr><td style="color:#666;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">${selected.discount_mode === 'fixed' ? 'Discount' : `Discount ${selected.discount_percent}%`}</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;">− ${fmt(discountAmt)} ${selected.currency}</td></tr>` : ''}
            ${taxAmt > 0 ? `<tr><td style="color:#666;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">VAT ${selected.tax_percent}%</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;">+ ${fmt(taxAmt)} ${selected.currency}</td></tr>` : ''}
            ${extraExpenses > 0 ? `<tr><td style="color:#666;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">Delivery</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;">+ ${fmt(extraExpenses)} ${selected.currency}</td></tr>` : ''}
            <tr><td style="font-size:12px;font-weight:800;border-top:2px solid #111;padding-top:8px;padding-bottom:3px;color:#666;padding-right:32px;">Amount</td><td style="font-size:12px;font-weight:800;border-top:2px solid #111;padding-top:8px;padding-bottom:3px;text-align:right;font-variant-numeric:tabular-nums;">${fmt(total)} ${selected.currency}</td></tr>
            ${(selected.deposit_amount ?? 0) > 0 ? `<tr><td style="color:#2563eb;padding-right:32px;font-weight:500;padding-top:4px;padding-bottom:4px;font-size:9px;">Deposit</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;color:#2563eb;">− ${fmt(selected.deposit_amount ?? 0)} ${selected.currency}</td></tr><tr><td style="font-size:12px;font-weight:800;border-top:1.5px dashed #111;padding-top:5px;padding-bottom:2px;color:#111;padding-right:32px;">Balance Due</td><td style="font-size:12px;font-weight:800;border-top:1.5px dashed #111;padding-top:5px;padding-bottom:2px;text-align:right;font-variant-numeric:tabular-nums;color:#111;">${fmt(Math.max(0, total - (selected.deposit_amount ?? 0)))} ${selected.currency}</td></tr>` : ''}
          </table>
        </div>
        <div style="margin-top:14px;padding:16px 28px 18px;background:#fff;border:1px solid #b7f0dc;border-radius:16px;color:#008f72;">
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:10px;margin-top:4px;">
            <div><div style="font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">LOCATION</div><div style="color:#111827;font-size:11px;">${selected.delivery_location || '—'}</div></div>
            <div><div style="font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">TYPE OF DELIVERY</div><div style="color:#111827;font-size:11px;">${selected.delivery_type || '—'}</div></div>
            <div><div style="font-size:8px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px;">QTY</div><div style="color:#111827;font-size:11px;">${selected.delivery_qty || '—'}</div></div>
          </div>
        </div>
        ${stamps ? `<div style="margin-top:30px;padding-top:18px;border-top:1px dashed #ccc;display:flex;justify-content:center;align-items:center;gap:24px;">${stamps}</div>` : ''}
      </div>`;

    Object.assign(container.style, { position: 'fixed', left: '-9999px', top: '0', width: '900px', background: '#fff', zIndex: '-1' });
    document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let yOffset = 0; let remaining = imgH;
      while (remaining > 0) { pdf.addImage(imgData, 'PNG', 0, -yOffset, pageW, imgH); remaining -= pageH; yOffset += pageH; if (remaining > 0) pdf.addPage(); }
      const pdfBlob = pdf.output('blob');
      downloadBlob(pdfBlob, `${selected.number}.pdf`);
    } catch (err) { console.error('PDF export failed:', err); alert('Ошибка экспорта PDF: ' + (err instanceof Error ? err.message : String(err))); }
    finally { container.remove(); }
  }

  function exportPackingExcel() {
    if (!selected) return;
    try {
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const COLS = 9;
    const thin = { style: 'thin', color: { rgb: 'D1D5DB' } };
    const med  = { style: 'medium', color: { rgb: '374151' } };
    const allThin = { top: thin, bottom: thin, left: thin, right: thin };
    const allMed  = { top: med, bottom: med, left: med, right: med };
    const baseFont = { name: 'Arial', sz: 10 };
    const boldFont = { ...baseFont, bold: true };
    const articleFont = { name: 'Calibri', sz: 10, bold: true, color: { rgb: '111827' } };
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
      cell(`№ ${selected.number}`, { font: { name: 'Arial', bold: true, sz: 13, color: { rgb: '374151' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 28 }; r++;

    aoa.push([
      cell(`Дата: ${date}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
      null, null, null, null,
      cell(`КК: ${selected.client_code || '—'}`, { font: { ...baseFont, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' } }),
      null, null, null,
    ]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 5 } });
    merges.push({ s: { r, c: 6 }, e: { r, c: 8 } });
    rowH[r] = { hpt: 16 }; r++;

    if (selected.client) {
      aoa.push([
        cell(selected.client, { font: { ...boldFont, sz: 11, color: { rgb: '374151' } }, alignment: { horizontal: 'left', vertical: 'center' } }),
        ...Array(COLS - 1).fill(null),
      ]);
      merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
      rowH[r] = { hpt: 16 }; r++;
    }

    aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 6 }; r++;

    const plLabelFill = { fgColor: { rgb: 'ECFDF5' } };
    const plValueFill = { fgColor: { rgb: 'F0FDF4' } };
    const plBorder = { style: 'thin', color: { rgb: 'A7F3D0' } };
    const plAllBorder = { top: plBorder, bottom: plBorder, left: plBorder, right: plBorder };
    aoa.push([cell('ДЕТАЛИ ЗАКАЗА / ORDER DETAILS', { font: { ...boldFont, sz: 10, color: { rgb: '047857' } }, alignment: { horizontal: 'left', vertical: 'center' }, fill: plLabelFill, border: { bottom: { style: 'medium', color: { rgb: '6EE7B7' } } } }), ...Array(COLS - 1).fill(null)]);
    merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
    rowH[r] = { hpt: 22 }; r++;

    const details: [string, string][] = [
      ['Дата доставки / Delivery Date', selected.delivery_date ? new Date(selected.delivery_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'],
      ['Location', selected.delivery_location || '—'],
      ['Тип доставки / Delivery Type', selected.delivery_type || '—'],
      ['Количество / Quantity', selected.delivery_qty || '—'],
      ['Экспедитор / Deliverer', selected.deliverer || '—'],
    ];

    details.forEach(([label, value]) => {
      const row: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      row[0] = cell(label, { font: { ...boldFont, sz: 9, color: { rgb: '6B7280' } }, alignment: { horizontal: 'right', vertical: 'center' }, fill: plLabelFill, border: plAllBorder });
      row[1] = cell(value, { font: { ...baseFont, sz: 10, color: { rgb: '111827' } }, alignment: { horizontal: 'left', vertical: 'center' }, fill: plValueFill, border: plAllBorder });
      merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
      aoa.push(row); rowH[r] = { hpt: 18 }; r++;
    });

    aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 8 }; r++;

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
      const discLabel = selected.discount_mode === 'fixed' ? 'Discount:' : `Discount ${selected.discount_percent}%:`;
      aoa.push(sumRow(discLabel, +(-discountAmt).toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }
    if (taxAmt > 0) {
      aoa.push(sumRow(`VAT ${selected.tax_percent}%:`, +taxAmt.toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }
    if (extraExpenses > 0) {
      aoa.push(sumRow('Доставка:', +extraExpenses.toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }
    aoa.push(sumRow('TOTAL:', +total.toFixed(2), true)); rowH[r] = { hpt: 24 }; r++;

    if ((selected.deposit_amount ?? 0) > 0) {
      aoa.push(sumRow('Депозит:', +(selected.deposit_amount ?? 0).toFixed(2))); rowH[r] = { hpt: 18 }; r++;
      aoa.push(sumRow('Остаток:', +Math.max(0, total - (selected.deposit_amount ?? 0)).toFixed(2))); rowH[r] = { hpt: 18 }; r++;
    }

    if (selected.paid || selected.delivered) {
      aoa.push(Array(COLS).fill(null)); rowH[r] = { hpt: 8 }; r++;
      const stampText = [selected.paid ? 'PAID' : '', selected.delivered ? 'DELIVERED' : ''].filter(Boolean).join('   ·   ');
      const stampRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      stampRow[3] = cell(`  ${stampText}  `, {
        font: { name: 'Arial', bold: true, sz: 14, color: { rgb: selected.paid ? '15803D' : '1D4ED8' } },
        alignment: { horizontal: 'center', vertical: 'center' },
        fill: { fgColor: { rgb: selected.paid ? 'F0FDF4' : 'EFF6FF' } },
        border: { top: { style: 'medium', color: { rgb: selected.paid ? '15803D' : '1D4ED8' } }, bottom: { style: 'medium', color: { rgb: selected.paid ? '15803D' : '1D4ED8' } }, left: { style: 'medium', color: { rgb: selected.paid ? '15803D' : '1D4ED8' } }, right: { style: 'medium', color: { rgb: selected.paid ? '15803D' : '1D4ED8' } } },
      } as object);
      merges.push({ s: { r, c: 3 }, e: { r, c: 6 } });
      aoa.push(stampRow); rowH[r] = { hpt: 30 }; r++;
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 5 }, { wch: 13 }, { wch: 9 }, { wch: 17 }, { wch: 34 }, { wch: 8 }, { wch: 8 }, { wch: 13 }, { wch: 14 }];
    ws['!rows'] = rowH;
    ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PL');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `PL_${selected.client_code || 'CLIENT'}.xlsx`);
    } catch (err) { console.error('Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  async function exportPackingPdf() {
    if (!selected) return;
    const date = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    document.getElementById('pl-pdf-render')?.remove();
    const container = document.createElement('div');
    container.id = 'pl-pdf-render';

    const rows = items.map((item, idx) => `
      <tr style="height:32px;background:${idx % 2 !== 0 ? '#f3f4f6' : '#ffffff'};">
        <td class="ctr">${idx + 1}</td><td class="ctr">${item.brand || ''}</td><td class="ctr">${item.origin || ''}</td>
        <td class="ctr mono">${item.article || ''}</td><td class="desc">${item.description || ''}</td>
        <td class="ctr">${item.quantity}</td><td class="ctr">${item.uom || ''}</td>
      </tr>`).join('');

    const deliveryDate = selected.delivery_date ? new Date(selected.delivery_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const detailsRow = (label: string, value: string) => `
      <tr>
        <td style="color:#6b7280;font-weight:600;font-size:9px;padding:4px 8px 4px 0;white-space:nowrap;">${label}</td>
        <td style="color:#111827;font-weight:600;font-size:9px;padding:4px 0;">${value || '—'}</td>
      </tr>`;

    container.innerHTML = `
      <div style="font-family:'Arial','Helvetica Neue',Helvetica,sans-serif;font-size:8px;color:#111;padding:30px;width:900px;background:#fff;box-sizing:border-box;">
        <div style="text-align:center;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid #111;">
          <div style="font-size:36px;font-weight:900;letter-spacing:0.18em;color:#111;line-height:1;font-family:'Calibri',sans-serif;">PACKING LIST</div>
          <div style="font-size:12px;font-weight:700;color:#555;margin-top:3px;font-family:'Calibri',sans-serif;">${selected.number}</div>
          <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:9px;">
            <div><span style="color:#888;font-weight:500;">КК: </span><span style="font-weight:700;">${selected.client_code || '—'}</span></div>
            <div><span style="color:#888;font-weight:500;">Date: </span><span style="font-weight:700;">${date}</span></div>
          </div>
        </div>

        <div style="margin-bottom:16px;padding:12px 14px;background:#f0fdf4;border:1px solid #a7f3d0;border-radius:6px;">
          <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#047857;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #6ee7b7;">Детали заказа / Order Details</div>
          <table style="width:100%;border-collapse:collapse;">
            ${detailsRow('Дата доставки / Delivery Date', deliveryDate)}
            ${detailsRow('Location', selected.delivery_location ?? '')}
            ${detailsRow('Тип доставки / Delivery Type', selected.delivery_type ?? '')}
            ${detailsRow('Количество / Quantity', selected.delivery_qty ?? '')}
          </table>
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="border-bottom:1.5px solid #111;background:#f3f4f6;">
            <th style="width:22px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">№</th>
            <th style="width:58px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Brand</th>
            <th style="width:42px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">COO</th>
            <th style="width:96px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Part Number</th>
            <th style="text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">Description</th>
            <th style="width:34px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;border-right:1px solid #e0e0e0;">QTY</th>
            <th style="width:34px;text-align:center;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:6px 3px 8px;color:#333;">UOM</th>
          </tr></thead>
          <tbody>${rows
            .replace(/class="ctr mono"/g, 'style="text-align:center;font-family:\'Calibri\',sans-serif;font-size:9px;font-weight:700;color:#111827;padding:5px 3px;vertical-align:middle;height:32px;line-height:1.2;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;white-space:nowrap;letter-spacing:0.02em;"')
            .replace(/class="ctr"/g, 'style="text-align:center;font-variant-numeric:tabular-nums;padding:5px 3px;vertical-align:middle;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;white-space:nowrap;"')
            .replace(/class="desc"/g, 'style="text-align:center;padding:5px 3px;vertical-align:middle;border-right:1px solid #ebebeb;border-bottom:1px solid #ebebeb;word-break:break-word;font-size:8px;line-height:1.3;"')}</tbody>
        </table>
        <div style="margin-top:18px;display:flex;justify-content:space-between;align-items:flex-end;">
          <div style="font-size:9px;color:#888;">
            <span style="font-weight:700;text-transform:uppercase;letter-spacing:.05em;">Total QTY:</span>
            <span style="font-weight:800;color:#111;margin-left:6px;">${totalQty}</span>
          </div>
          ${(selected.deposit_amount ?? 0) > 0 ? `<table style="min-width:220px;border-top:1px solid #ddd;margin-top:8px;">
            <tr><td style="font-size:12px;font-weight:800;color:#666;padding-right:20px;padding-top:4px;">Amount</td><td style="font-size:12px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;padding-top:4px;">${fmt(total)} ${selected.currency}</td></tr>
            <tr><td style="color:#2563eb;font-size:9px;font-weight:500;padding-right:20px;padding-top:3px;padding-bottom:3px;">Deposit</td><td style="text-align:right;font-variant-numeric:tabular-nums;font-weight:600;font-size:9px;color:#2563eb;">− ${fmt(selected.deposit_amount ?? 0)} ${selected.currency}</td></tr>
            <tr><td style="font-size:11px;font-weight:800;border-top:1.5px dashed #2563eb;color:#2563eb;padding-right:20px;padding-top:4px;padding-bottom:2px;">Balance Due</td><td style="font-size:11px;font-weight:800;border-top:1.5px dashed #2563eb;text-align:right;font-variant-numeric:tabular-nums;color:#2563eb;padding-top:4px;padding-bottom:2px;">${fmt(Math.max(0, total - (selected.deposit_amount ?? 0)))} ${selected.currency}</td></tr>
          </table>` : ''}
        </div>
      </div>`;

    Object.assign(container.style, { position: 'fixed', left: '-9999px', top: '0', width: '900px', background: '#fff', zIndex: '-1' });
    document.body.appendChild(container);
    try {
      const canvas = await html2canvas(container.firstElementChild as HTMLElement, { scale: 2, useCORS: true, backgroundColor: '#fff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pageW) / canvas.width;
      let yOffset = 0; let remaining = imgH;
      while (remaining > 0) { pdf.addImage(imgData, 'PNG', 0, -yOffset, pageW, imgH); remaining -= pageH; yOffset += pageH; if (remaining > 0) pdf.addPage(); }
      const pdfBlob = pdf.output('blob');
      downloadBlob(pdfBlob, `PL_${selected.client_code || 'CLIENT'}.pdf`);
    } catch (err) { console.error('PDF export failed:', err); alert('Ошибка экспорта PDF: ' + (err instanceof Error ? err.message : String(err))); }
    finally { container.remove(); }
  }

  function exportSupplierExcel(supplierName: string) {
    if (!selected) return;
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
    const COLS = 8;

    aoa.push([cell(`Supplier: ${supplierName}`, { font: { name: 'Arial', bold: true, sz: 14 }, alignment: { horizontal: 'left', vertical: 'center' } }), ...Array(COLS - 1).fill(null)]);
    rowH[r++] = { hpt: 26 };
    aoa.push([cell(`Invoice No. ${selected.number}`, { font: { name: 'Arial', sz: 10, color: { rgb: '6B7280' } }, alignment: { horizontal: 'left', vertical: 'center' } }), ...Array(COLS - 1).fill(null)]);
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
      const price = item.purchase_price ?? 0;
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

    aoa.push(Array(COLS).fill(null)); rowH[r++] = { hpt: 8 };

    const labelStyle = (color: string) => ({ font: { ...boldFont, color: { rgb: color } }, alignment: { horizontal: 'right', vertical: 'center' }, border: thickBottom });
    const valueStyle = (color: string, bg?: string) => ({ font: { ...boldFont, sz: 11, color: { rgb: color } }, alignment: { horizontal: 'right', vertical: 'center' }, numFmt: NUM, border: thickBottom, ...(bg ? { fill: { fgColor: { rgb: bg } } } : {}) });

    const qtyRow: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
    qtyRow[5] = cell(totalQty, { font: { ...boldFont, sz: 11, color: { rgb: '111827' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: thickBottom });
    qtyRow[6] = cell('Total Qty:', labelStyle('374151'));
    aoa.push(qtyRow); rowH[r++] = { hpt: 20 };

    if (hasTax) {
      const taxableSum = supplierItems.reduce((s, i, idx) => {
        if (!i.purchase_tax_enabled) return s;
        const raw = i.quantity * (i.purchase_price ?? 0);
        const sDiscMode = i.supplier_discount_mode ?? 'percent';
        const disc = sDiscMode === 'percent'
          ? raw * (1 - (i.supplier_discount_percent ?? 0) / 100)
          : Math.max(0, raw - (idx === 0 ? (i.supplier_discount_fixed ?? 0) : 0));
        return s + disc;
      }, 0);
      const taxAmt = taxableSum * (TAX_RATE / 100);
      const totalWithTax = subtotal + taxAmt;

      const r1: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r1[6] = cell('Subtotal:', labelStyle('374151'));
      r1[7] = cell(subtotal, { ...valueStyle('111827'), numFmt: NUM } as object);
      aoa.push(r1); rowH[r++] = { hpt: 20 };

      const r2: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r2[6] = cell(`VAT ${TAX_RATE}%:`, labelStyle('DC2626'));
      r2[7] = cell(taxAmt, { ...valueStyle('DC2626', 'FEF2F2'), numFmt: NUM } as object);
      aoa.push(r2); rowH[r++] = { hpt: 20 };

      const r3: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r3[6] = cell('TOTAL:', labelStyle('111827'));
      r3[7] = cell(totalWithTax, { ...valueStyle('111827', 'F3F4F6'), numFmt: NUM } as object);
      aoa.push(r3); rowH[r++] = { hpt: 22 };
    } else {
      const r1: (XLSX.CellObject | null)[] = Array(COLS).fill(null);
      r1[6] = cell('TOTAL:', labelStyle('111827'));
      r1[7] = cell(subtotal, { ...valueStyle('111827', 'F3F4F6'), numFmt: NUM } as object);
      aoa.push(r1); rowH[r++] = { hpt: 22 };
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa as XLSX.CellObject[][]);
    ws['!cols'] = [{ wch: 5 }, { wch: 17 }, { wch: 13 }, { wch: 9 }, { wch: 34 }, { wch: 7 }, { wch: 13 }, { wch: 14 }];
    ws['!rows'] = rowH;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, supplierName.slice(0, 31));
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    downloadBlob(new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${selected.number}_${supplierName}.xlsx`);
    } catch (err) { console.error('Supplier Excel export failed:', err); alert('Ошибка экспорта Excel: ' + (err instanceof Error ? err.message : String(err))); }
  }

  // ── Shared list renderer ──────────────────────────────────────────────
  function InvoiceList({ list, title, isArchive }: { list: Proforma[]; title: string; isArchive?: boolean }) {
    const filtered = searchQ.trim()
      ? list.filter(p => p.number.toLowerCase().includes(searchQ.toLowerCase()) || (p.client_code ?? '').toLowerCase().includes(searchQ.toLowerCase()))
      : list;
    const unpaidCount = filtered.filter(p => !p.paid).length;
    const undeliveredCount = filtered.filter(p => !p.delivered).length;
    return (
      <div className="flex flex-col h-full bg-slate-50 font-pro">
        <div className="shrink-0 bg-white border-b border-slate-200 px-5 sm:px-8 pt-6 pb-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              {isArchive && (
                <button onClick={() => setView('list')} aria-label="Вернуться к счетам"
                  className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-slate-400 hover:text-slate-800 transition-colors">
                  <ChevronLeft size={15} />
                </button>
              )}
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d1f3c] text-white shadow-sm">
                    {isArchive ? <Archive size={18} /> : <Receipt size={18} />}
                  </div>
                  <div>
                    <h2 className="mt-0.5 text-2xl font-black tracking-tight text-slate-900">{title}</h2>
                  </div>
                  <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-500">{list.length}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span><strong className="text-slate-700">{filtered.length}</strong> показано</span>
                  {!isArchive && <span><strong className="text-slate-700">{unpaidCount}</strong> ожидают оплаты</span>}
                  {!isArchive && <span><strong className="text-slate-700">{undeliveredCount}</strong> ожидают доставки</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end lg:self-start">
              {!isArchive && (
                <>
                  <button onClick={() => setView('archive')} title="Архив"
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-900 transition-all">
                    <Archive size={14} />Архив {archived.length > 0 && <span className="text-slate-400">{archived.length}</span>}
                  </button>
                  <button onClick={() => setView('trash')} title="Корзина"
                    className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-400 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-all">
                    <Trash size={14} />{trashed.length > 0 && trashed.length}
                  </button>
                  <button onClick={openMergeModal}
                    className="flex items-center gap-1.5 rounded-xl bg-[#0d1f3c] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#18375f] active:scale-[0.98] transition-all">
                    <PlusIcon size={14} />Создать счёт
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="relative mt-5 max-w-2xl">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input ref={searchRef} value={searchQ} onChange={e => setSearchQ(e.target.value)}
              placeholder="Поиск по номеру или коду клиента..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#0d1f3c] focus:bg-white focus:ring-4 focus:ring-blue-50" />
            {searchQ && <button onClick={() => setSearchQ('')} aria-label="Очистить поиск" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-800">Очистить</button>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-8">
          {loading ? (
            <div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#0d1f3c]" /></div>
          ) : list.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-300 shadow-sm">{isArchive ? <Archive size={23} /> : <Receipt size={23} />}</div>
              <p className="text-sm font-bold text-slate-700">{isArchive ? 'Архив пуст' : 'Нет счетов'}</p>
              {!isArchive && <p className="mt-1 text-xs text-slate-400">Подтвердите смету в разделе «Смета», чтобы она появилась здесь</p>}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">По вашему запросу ничего не найдено</div>
          ) : (
            <div className="mx-auto max-w-[1240px]">
              <div className="mb-2 hidden grid-cols-[150px_minmax(0,1fr)_170px_24px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-sm sm:grid">
                <span>Клиент</span><span>Счёт и статус</span><span className="text-right">Сумма</span><span />
              </div>
              <div className="space-y-1.5">
                {filtered.map(p => {
                  const pSubtotal = p.total_amount;
                  const sym = currencySymbol[p.currency] ?? p.currency;
                  return (
                    <div key={p.id} className="group relative rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
                      <button onClick={() => openDetail(p)} className="grid w-full grid-cols-1 items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[150px_minmax(0,1fr)_170px_24px] sm:gap-3 sm:px-5">
                        <div className="flex items-center gap-2 sm:block">
                          <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-100 px-2 font-pro text-[11px] font-black tracking-widest text-slate-800 uppercase">{p.client_code || '—'}</span>
                          <span className="text-xs text-slate-400 sm:hidden">Клиент</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-pro text-sm font-extrabold text-slate-900">{p.number}</span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-slate-500">{p.currency}</span>
                            {p.paid && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">ОПЛАЧЕНО</span>}
                            {p.delivered && <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700">ДОСТАВЛЕНО</span>}
                            {(p.deposit_amount ?? 0) > 0 && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold text-amber-700">ДЕПОЗИТ</span>}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{p.confirmed_at ? fmtDate(p.confirmed_at) : fmtDate(p.created_at)}</div>
                        </div>
                        <div className="flex items-center justify-between sm:block sm:text-right">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 sm:hidden">Сумма</span>
                          <span className="font-pro text-sm font-black tabular-nums text-slate-900">{pSubtotal > 0 ? fmt(pSubtotal) : '—'} <span className="text-[10px] font-bold text-slate-400">{sym}</span></span>
                        </div>
                        <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-colors group-hover:text-[#0d1f3c] sm:static sm:translate-y-0" />
                      </button>
                      <div className="absolute left-1 top-1/2 z-10 flex -translate-y-1/2 flex-col rounded-lg border border-slate-200 bg-white shadow-sm opacity-70 transition-opacity group-hover:opacity-100">
                        <button onClick={e => { e.stopPropagation(); moveInvoice(p, 'up', !!isArchive); }} title="Переместить выше" aria-label="Переместить выше" className="rounded-t-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0d1f3c]"><ChevronUp size={13} /></button>
                        <button onClick={e => { e.stopPropagation(); moveInvoice(p, 'down', !!isArchive); }} title="Переместить ниже" aria-label="Переместить ниже" className="rounded-b-lg border-t border-slate-100 p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#0d1f3c]"><ChevronDown size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showMerge) return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            {!mergeSelectedClient ? (
              <h3 className="text-sm font-bold text-gray-900">Создать счёт из смет</h3>
            ) : (
              <button onClick={() => { setMergeSelectedClient(null); setMergeSmetas([]); setMergeSelectedIds(new Set()); }}
                className="flex items-center gap-1 text-sm font-bold text-gray-900">
                <ChevronLeft size={16} />{mergeSelectedClient.name}
              </button>
            )}
          </div>
          <button onClick={() => setShowMerge(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mergeLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
            </div>
          ) : !mergeSelectedClient ? (
            mergeClients.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">Нет клиентов</p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    value={mergeClientSearch}
                    onChange={e => setMergeClientSearch(e.target.value)}
                    placeholder="Поиск клиента..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all bg-white"
                  />
                </div>
                <div className="space-y-2">
                  {mergeClients
                    .filter(c => {
                      const q = mergeClientSearch.toLowerCase().trim();
                      if (!q) return true;
                      return (c.code ?? '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
                    })
                    .map(c => (
                    <button key={c.id} onClick={() => selectMergeClient(c)}
                      className="w-full flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all text-left">
                      <div>
                        {c.code && <p className="text-base font-black tracking-widest uppercase text-gray-900 font-pro leading-tight">{c.code}</p>}
                        <p className="text-xs text-gray-400 mt-0.5">{c.name}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-300" />
                    </button>
                  ))}
                </div>
              </>
            )
          ) : mergeSmetas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <Layers size={24} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-400">У этого клиента нет неподтверждённых смет</p>
            </div>
          ) : (
            <div className="space-y-2">
              {mergeSmetas.map(s => {
                const checked = mergeSelectedIds.has(s.id);
                return (
                  <button key={s.id} onClick={() => toggleMergeSmeta(s.id)}
                    className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 border transition-all text-left ${checked ? 'border-gray-900 bg-gray-50' : 'border-gray-100 hover:border-gray-300'}`}>
                    <div className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${checked ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300'}`}>
                      {checked && <Check size={12} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold tracking-widest uppercase text-gray-400">PROFORMA</span>
                        <span className="text-sm font-extrabold text-gray-900 font-pro bg-gray-100 px-2 py-0.5 rounded-md">{s.number}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <span>{s._itemCount} поз.</span>
                        <span className="font-semibold text-gray-600 tabular-nums">{fmt(s._total)} {s.currency}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {mergeSelectedClient && mergeSmetas.length > 0 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="text-xs text-gray-500">
              Выбрано: <span className="font-bold text-gray-900">{mergeSelectedIds.size}</span> из {mergeSmetas.length}
            </div>
            <button onClick={createMergedInvoice} disabled={mergeSelectedIds.size === 0 || mergeCreating}
              className="flex items-center gap-1.5 text-sm font-semibold bg-gray-900 text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-40">
              {mergeCreating ? <span className="w-4 h-4 border-2 border-gray-400 border-t-white rounded-full animate-spin" /> : <Check size={15} />}
              {mergeCreating ? 'Создание...' : 'Создать счёт'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  if (view === 'list') return <InvoiceList list={proformas} title="Счёт" />;
  if (view === 'archive') return <InvoiceList list={archived} title="Архив" isArchive />;

  if (view === 'trash') return (
    <div className="flex flex-col h-full font-pro">
      <div className="px-5 pt-6 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">← Счёт</button>
            <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">Корзина</h2>
            {trashed.length > 0 && <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2.5 py-1 rounded-full font-semibold">{trashed.length}</span>}
          </div>
          {trashed.length > 0 && (
            <button
              onClick={() => setClearTrashConfirm(true)}
              disabled={clearingTrash}
              className="flex items-center gap-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-all disabled:opacity-50">
              {clearingTrash ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" /> : <AlertTriangle size={13} />}
              Очистить всё
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
        {trashed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Trash size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">Корзина пуста</p>
          </div>
        ) : trashed.map(p => (
          <div key={p.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-gray-400">INVOICE</span>
                  <span className="text-base font-extrabold font-pro text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">{p.number}</span>
                </div>
                {p.client_code && <p className="text-xs font-bold text-gray-600 font-pro tracking-widest">{p.client_code}</p>}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => restoreFromTrash(p.id)}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-500 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-all">
                  <RotateCcw size={11} />Восстановить
                </button>
                <button onClick={() => { if (confirm(`Удалить «${p.number}» навсегда?`)) permanentDeleteInvoice(p.id); }}
                  className="flex items-center gap-1 text-xs font-semibold text-red-500 border border-red-200 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-all">
                  <Trash2 size={11} />Навсегда
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {clearTrashConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Очистить корзину?</h3>
                <p className="text-xs text-gray-500 mt-0.5">Все {trashed.length} счетов будут удалены навсегда.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setClearTrashConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Отмена
              </button>
              <button onClick={clearAllTrash}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-semibold text-white hover:bg-red-600 transition-colors">
                Удалить всё
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );

  // ── Edit ──────────────────────────────────────────────────────────────
  if (view === 'edit' && selected) {
    return createPortal(
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <ProformaForm
          proforma={selected}
          owner={owner}
          onBack={() => void returnToDetail(selected.id)}
          onSaved={() => void returnToDetail(selected.id)}
        />
      </div>,
      document.body
    ) as React.ReactElement;
  }

  // ── Detail ────────────────────────────────────────────────────────────
  const canArchive = !!selected;

  return createPortal(
    <div className="fixed inset-0 z-[50] bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-gray-100 flex-shrink-0 bg-white">
        <button onClick={() => setView(selected?.archived ? 'archive' : 'list')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <X size={16} />Закрыть
        </button>
        <span className="text-base font-bold text-gray-900 tracking-wide font-pro">
          INVOICE <span className="font-pro font-extrabold text-lg text-[#0d1f3c]">{selected?.number}</span>
        </span>
        <div className="flex items-center gap-1.5">
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
          <button onClick={duplicateInvoice} disabled={duplicating} title="Дублировать"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-40">
            {duplicating ? <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin inline-block" /> : <Copy size={16} />}
          </button>
          <button onClick={() => setView('edit')}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-200 active:opacity-75 transition-all">
            <Pencil size={12} />Изменить
          </button>
          <button onClick={() => setDeleteConfirm(true)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 py-8 space-y-5">

          {/* Invoice card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

            <div className="px-8 lg:px-12 py-8 lg:py-10 border-b border-gray-100 flex items-start justify-between gap-8">
              <div>
                <div className="text-5xl lg:text-6xl font-black tracking-[0.2em] leading-none text-gray-900 mb-4 select-none font-pro">INVOICE</div>
                {editingNumber ? (
                  <div className="flex items-center gap-2">
                    <input autoFocus type="text" value={numberVal}
                      onChange={e => setNumberVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveNumber(); if (e.key === 'Escape') setEditingNumber(false); }}
                      className="text-lg font-bold font-pro tracking-wide text-gray-900 border-b-2 border-gray-300 focus:border-gray-900 outline-none bg-transparent px-1 py-0.5" />
                    <button onClick={saveNumber} disabled={savingNumber}
                      className="flex items-center gap-1 text-xs font-semibold bg-gray-900 text-white px-2.5 py-1.5 rounded-lg hover:bg-gray-800 transition-all disabled:opacity-50">
                      {savingNumber ? <span className="w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" /> : <Check size={12} />}
                      OK
                    </button>
                    <button onClick={() => { setEditingNumber(false); setNumberVal(selected.number); }}
                      className="text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setEditingNumber(true)}
                    className="group flex items-center gap-1.5">
                    <span className="text-lg font-bold text-gray-400 font-pro tracking-wide">{selected?.number}</span>
                    <Pencil size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                  </button>
                )}
              </div>
              <div className="text-right pt-1">
                <div className="text-lg font-extrabold text-gray-900 leading-tight">{selected?.client_code || '—'}</div>
                <div className="text-base font-semibold text-gray-500 mt-1">{selected?.client || '—'}</div>
                <div className="text-sm text-gray-400 mt-2">{selected?.confirmed_at ? fmtDate(selected.confirmed_at) : '—'}</div>
              </div>
            </div>

            {/* Status toggles */}
            <div className="px-8 py-4 border-b border-gray-100 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => void handleStatusToggle('paid')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all active:opacity-75 ${selected?.paid ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-emerald-300 hover:text-emerald-600'}`}>
                    <CreditCard size={15} />Оплачено
                  </button>
                  {selected?.paid && (editingPaidDate ? <input autoFocus type="date" lang="ru" value={paidDate}
                    onChange={e => { setPaidDate(e.target.value); void saveDateStamp('paid_at', e.target.value); }}
                    className="px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" /> : <button type="button" onClick={() => setEditingPaidDate(true)} className="text-xs font-medium text-emerald-600 hover:text-emerald-800">Изменить дату</button>)}
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => void handleStatusToggle('delivered')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all active:opacity-75 ${selected?.delivered ? 'bg-blue-500 border-blue-500 text-white shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-900'}`}>
                    <Truck size={15} />Доставлено
                  </button>
                  {selected?.delivered && (editingDeliveredDate ? <input autoFocus type="date" lang="ru" value={deliveredDate}
                    onChange={e => { setDeliveredDate(e.target.value); void saveDateStamp('delivered_at', e.target.value); }}
                    className="px-3 py-2 rounded-xl border border-blue-200 bg-blue-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400" /> : <button type="button" onClick={() => setEditingDeliveredDate(true)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Изменить дату</button>)}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {canArchive && (
                  <button onClick={toggleArchive}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all active:opacity-75 ${selected?.archived ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300 hover:text-amber-600'}`}>
                    {selected?.archived ? <><ArchiveRestore size={15} />Из архива</> : <><Archive size={15} />В архив</>}
                  </button>
                )}
                {!selected?.archived && (
                  <button onClick={() => setReturnConfirm(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 bg-white hover:border-blue-300 hover:text-blue-900 transition-all active:opacity-75">
                    <RotateCcw size={15} />Вернуть в Смету
                  </button>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="px-8 py-6">
              {loadingItems ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  <div className="flex justify-end mb-3">
                    {role === 'admin' && (
                    <button onClick={() => setShowCost(v => !v)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${showCost ? 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100' : 'bg-gray-100 border-gray-200 text-gray-400 hover:text-gray-600'}`}>
                      {showCost ? 'Hide' : 'Show'}
                    </button>
                    )}
                    {role === 'admin' && showCost && (
                      <button onClick={() => {
                        const newVal = !hideProfit;
                        setHideProfit(newVal);
                        if (selected) {
                          supabase.from('proformas').update({ profit_hidden: newVal, updated_at: new Date().toISOString() }).eq('id', selected.id).then(({ error }) => {
                            if (error) console.error('Failed to save profit_hidden:', error.message);
                          });
                          const updated = { ...selected, profit_hidden: newVal };
                          setSelected(updated);
                          setProformas(prev => prev.map(p => p.id === selected.id ? updated : p));
                          setArchived(prev => prev.map(p => p.id === selected.id ? updated : p));
                        }
                      }}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${hideProfit ? 'bg-gray-100 border-gray-200 text-gray-400 hover:text-gray-600' : 'bg-emerald-50 border-emerald-200 text-emerald-600'}`}>
                        {hideProfit ? 'Show profit' : 'Hide profit'}
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ minWidth: canShowCost ? 1080 : 760 }}>
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-100">
                          {[
                            ['number', '#'], ['article', 'Part Number'], ['brand', 'Brand / COO'], ['description', 'Description'],
                            ['qty', 'QTY'], ['uom', 'UOM'], ['price', 'Price'], ['total', 'Total'],
                          ].map(([key, label]) => (
                            <th key={key} onMouseEnter={() => setHoveredColumn(key)} onMouseLeave={() => setHoveredColumn(null)}
                              className={`text-[10px] font-bold uppercase tracking-wider text-gray-500 px-2 py-2 transition-colors ${hoveredColumn === key ? 'bg-gray-200' : ''} ${key === 'number' ? 'text-left w-10' : key === 'article' ? 'text-left w-36' : key === 'brand' ? 'text-left w-32' : key === 'description' ? 'text-left' : ['qty', 'uom'].includes(key) ? 'text-center w-16' : 'text-right w-28'}`}>{label}</th>
                          ))}
                          {canShowCost && <>
                            {['cost', 'costTotal', 'supplier', ...(hideProfit ? [] : ['profit'])].map(key => (
                              <th key={key} onMouseEnter={() => setHoveredColumn(key)} onMouseLeave={() => setHoveredColumn(null)}
                                className={`text-[10px] font-bold uppercase tracking-wider py-2 px-2 transition-colors ${hoveredColumn === key ? 'bg-gray-200' : ''} ${key === 'cost' ? 'text-right text-red-500 w-28 border-l border-red-100' : key === 'costTotal' ? 'text-right text-red-500 w-28' : key === 'supplier' ? 'text-left text-red-500 w-32' : 'text-right text-emerald-600 w-28 border-l border-emerald-100'}`}>{key === 'cost' ? 'Cost' : key === 'costTotal' ? 'Total cost' : key === 'supplier' ? 'Supplier' : 'Profit'}</th>
                            ))}
                          </>}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const sellTotal = item.quantity * item.unit_price;
                          const costTotal = item.quantity * (item.purchase_price ?? 0);
                          const itemProfit = sellTotal - costTotal;
                          const cellClass = (key: string, extra = '') => `${extra} transition-colors ${hoveredColumn === key ? 'bg-gray-100' : ''}`;
                          return (
                            <tr key={item.id} className="border-b border-gray-100 last:border-0 bg-white transition-colors hover:bg-gray-50">
                              <td onMouseEnter={() => setHoveredColumn('number')} className={cellClass('number', 'py-3 px-3 text-xs text-gray-400 tabular-nums')}>{idx + 1}</td>
                              <td onMouseEnter={() => setHoveredColumn('article')} className={cellClass('article', 'py-3 px-3 text-xs font-bold text-gray-800')} style={{ fontFamily: "'Calibri', sans-serif", letterSpacing: '0.02em' }}>{item.article}</td>
                              <td onMouseEnter={() => setHoveredColumn('brand')} className={cellClass('brand', 'py-3 px-3 text-xs text-gray-500')}>{[item.brand, item.origin].filter(Boolean).join(' · ') || '—'}</td>
                              <td onMouseEnter={() => setHoveredColumn('description')} className={cellClass('description', 'py-3 px-3 text-sm text-gray-600')}>{item.description}</td>
                              <td onMouseEnter={() => setHoveredColumn('qty')} className={cellClass('qty', 'py-3 px-3 text-center text-sm tabular-nums text-gray-700')}>{item.quantity}</td>
                              <td onMouseEnter={() => setHoveredColumn('uom')} className={cellClass('uom', 'py-3 px-3 text-center text-sm text-gray-500')}>{item.uom}</td>
                              <td onMouseEnter={() => setHoveredColumn('price')} className={cellClass('price', 'py-3 px-3 text-right text-sm tabular-nums text-gray-600')}>{fmt(item.unit_price)}</td>
                              <td onMouseEnter={() => setHoveredColumn('total')} className={cellClass('total', 'py-3 px-3 text-right text-sm tabular-nums font-bold text-gray-900')}>{fmt(sellTotal)}</td>
                              {canShowCost && <>
                                <td onMouseEnter={() => setHoveredColumn('cost')} className={cellClass('cost', 'py-3 px-3 text-right text-sm tabular-nums text-red-600 bg-red-50/60 border-l border-red-100')}>{fmt(item.purchase_price ?? 0)}</td>
                                <td onMouseEnter={() => setHoveredColumn('costTotal')} className={cellClass('costTotal', 'py-3 px-3 text-right text-sm tabular-nums text-red-600 bg-red-50/60')}>{fmt(costTotal)}</td>
                                <td onMouseEnter={() => setHoveredColumn('supplier')} className={cellClass('supplier', 'py-3 px-3 text-left border-l border-red-100 bg-red-50/60')}>{item.supplier || '—'}</td>
                                {!hideProfit && (
                                  <td onMouseEnter={() => setHoveredColumn('profit')} className={cellClass('profit', `py-3 px-3 text-right text-sm tabular-nums font-bold border-l border-emerald-100 ${itemProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`)}>{fmt(itemProfit)}</td>
                                )}
                              </>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div className="flex justify-between items-start mt-6 gap-4">
                    <div className="text-sm text-gray-400 pt-4">
                      <div>Total QTY: <span className="font-bold text-gray-700 font-pro">{totalQty}</span></div>
                    </div>
                    <div className="min-w-[260px] space-y-2 border-t border-gray-100 pt-4">
                      <div className="flex justify-between text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span className="tabular-nums font-medium font-pro">{fmt(subtotal)} {selected?.currency}</span>
                      </div>
                      {discountAmt > 0 && (
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>{selected?.discount_mode === 'fixed' ? 'Discount' : `Discount ${selected?.discount_percent}%`}</span>
                          <span className="tabular-nums text-red-500 font-medium font-pro">− {fmt(discountAmt)} {selected?.currency}</span>
                        </div>
                      )}
                      {taxAmt > 0 && (
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>VAT {selected?.tax_percent}%</span>
                          <span className="tabular-nums font-medium font-pro">+ {fmt(taxAmt)} {selected?.currency}</span>
                        </div>
                      )}
                      {extraExpenses > 0 && (
                        <div className="flex justify-between text-sm text-gray-500">
                          <span>Доставка</span>
                          <span className="tabular-nums font-medium font-pro">+ {fmt(extraExpenses)} {selected?.currency}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-200 pt-3">
                        <span>Amount</span>
                        <span className="tabular-nums font-pro">{fmt(total)} {selected?.currency}</span>
                      </div>
                      {(selected?.deposit_amount ?? 0) > 0 && (
                        <>
                          <div className="flex justify-between text-sm text-amber-600">
                            <span>Депозит</span>
                            <span className="tabular-nums font-medium font-pro">− {fmt(selected?.deposit_amount ?? 0)} {selected?.currency}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold text-gray-900">
                            <span>Остаток</span>
                            <span className="tabular-nums font-pro">{fmt(Math.max(0, total - (selected?.deposit_amount ?? 0)))} {selected?.currency}</span>
                          </div>
                        </>
                      )}
                      {role === 'admin' && purchaseSubtotal > 0 && !hideProfit && (
                        <>
                          <div className={`flex justify-between text-sm font-bold ${extraDelivery > 0 ? 'pt-1' : 'border-t border-gray-100 pt-2'} ${profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            <span>Прибыль</span>
                            <span className="tabular-nums font-pro">
                              {fmt(profit)} {selected?.currency}
                              {total > 0 && <span className="ml-1 text-xs opacity-70">({(profit / total * 100).toFixed(1)}%)</span>}
                            </span>
                          </div>
                        </>
                      )}
                      {canShowCost && purchaseSubtotal > 0 && (
                        <>
                          <div className="flex justify-between text-sm text-red-500 border-t border-gray-100 pt-2">
                            <span>Purchase subtotal</span>
                            <span className="tabular-nums font-medium font-pro">{fmt(purchaseSubtotal)} {selected?.currency}</span>
                          </div>
                          {extraDelivery > 0 && (
                            <div className="flex justify-between text-sm text-red-500">
                              <span>{selected?.extra_delivery_label || 'Доп. расходы'}</span>
                              <span className="tabular-nums font-medium font-pro">+ {fmt(extraDelivery)} {selected?.currency}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm font-bold text-red-600">
                            <span>Purchase total</span>
                            <span className="tabular-nums font-pro">{fmt(purchaseTotal)} {selected?.currency}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Supplier payments */}
            {canShowCost && Object.keys(supplierData).length > 0 && (
              <div className="px-8 py-5 border-t border-gray-100">
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2 mt-1">Поставщики</p>
                <div className="space-y-1.5">
                  {Object.entries(supplierData).map(([name, data]) => (
                    <div key={name} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-red-50/60 border border-red-100">
                      <button type="button" onClick={() => toggleSupplierPaid(name)}
                        title={data.paid ? 'Оплачено — нажать чтобы отменить' : 'Не оплачено — нажать чтобы оплатить'}
                        className={`flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${data.paid ? 'bg-red-400 border-red-400' : 'bg-white border-red-300 hover:border-red-400'}`}>
                        {data.paid && <Check size={11} className="text-white" strokeWidth={3} />}
                      </button>
                      <span className="font-medium text-sm flex-1 text-red-600 truncate">{name}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <div className="flex rounded-lg border border-red-200 overflow-hidden flex-shrink-0">
                          <button type="button" onClick={() => updateSupplierDiscount(name, 'percent', data.discPct)}
                            className={`px-1.5 py-1 text-[10px] font-bold transition-all ${data.discMode === 'percent' ? 'bg-red-500 text-white' : 'bg-white text-red-400 hover:bg-red-50'}`}>%</button>
                          <button type="button" onClick={() => updateSupplierDiscount(name, 'fixed', data.discFixed)}
                            className={`px-1.5 py-1 text-[10px] font-bold transition-all ${data.discMode === 'fixed' ? 'bg-red-500 text-white' : 'bg-white text-red-400 hover:bg-red-50'}`}>фикс</button>
                        </div>
                        {data.discMode === 'percent' ? (
                          <input type="number" min="0" max="100" step="0.1"
                            value={data.discPct === 0 ? '' : data.discPct}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; updateSupplierDiscount(name, 'percent', v); }}
                            placeholder="0" className="w-12 px-1 py-1 text-[11px] text-center rounded-lg border border-red-200 focus:outline-none focus:ring-1 focus:ring-red-400 tabular-nums" />
                        ) : (
                          <input type="number" min="0" step="0.01"
                            value={data.discFixed === 0 ? '' : data.discFixed}
                            onChange={e => { const v = parseFloat(e.target.value) || 0; updateSupplierDiscount(name, 'fixed', v); }}
                            placeholder="0" className="w-16 px-1 py-1 text-[11px] text-center rounded-lg border border-red-200 focus:outline-none focus:ring-1 focus:ring-red-400 tabular-nums" />
                        )}
                      </div>
                      <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{data.count}шт</span>
                      <span className={`tabular-nums text-sm font-bold font-pro text-red-600 flex-shrink-0 ${data.paid ? 'line-through decoration-red-400' : ''}`}>{fmt(data.total)} {selected?.currency}</span>
                      <button type="button" onClick={() => toggleSupplierTax(name)}
                        title="НДС поставщика"
                        className={`flex-shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg border transition-all leading-none ${
                          data.taxAll ? 'bg-red-500 text-white border-red-500' : data.taxSome ? 'bg-red-100 text-red-500 border-red-300' : 'bg-white text-red-300 border-red-200 hover:border-red-400 hover:text-red-500'}`}>
                        НДС {TAX_RATE}%
                      </button>
                      <button type="button" onClick={() => exportSupplierExcel(name)}
                        title="Экспорт в Excel"
                        className="flex-shrink-0 p-1 rounded-lg text-red-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                        <FileSpreadsheet size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {canShowCost && items.length > 0 && (
              <div className="px-8 pb-5 flex items-center gap-3">
                <button type="button" onClick={togglePurchaseTaxAll}
                  className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                    items.every(i => i.purchase_tax_enabled) ? 'bg-red-500 text-white border-red-500' : items.some(i => i.purchase_tax_enabled) ? 'bg-red-100 text-red-600 border-red-300' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                  <CreditCard size={12} />
                  {items.every(i => i.purchase_tax_enabled) ? `Снять НДС ${TAX_RATE}% со всех` : `НДС ${TAX_RATE}% для всех`}
                </button>
              </div>
            )}
            {(selected?.paid || selected?.delivered) && (
              <div className="px-8 py-8 border-t border-gray-100 flex items-center justify-center gap-6 flex-wrap bg-white">
                {selected?.paid && <Stamp color="#15803d" bg="#f0fdf4" label="PAID" sub="ОПЛАЧЕНО" date={paidDate} shape="circle" />}
                {selected?.delivered && <Stamp color="#1d4ed8" bg="#eff6ff" label="DELIVERED" sub="ДОСТАВЛЕНО" date={deliveredDate} shape="rect" />}
              </div>
            )}
          </div>

          {/* Settings: discount, tax, extra expenses */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 tracking-wide">Настройки счёта</h3>
              <button onClick={saveSettings} disabled={savingSettings}
                className="flex items-center gap-1.5 text-xs font-semibold bg-gray-900 text-white px-4 py-1.5 rounded-xl hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-50">
                {savingSettings ? <span className="w-3 h-3 border-2 border-gray-400 border-t-white rounded-full animate-spin" /> : <Save size={12} />}
                {savingSettings ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
            <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      value={discountPercent === 0 ? '' : discountPercent}
                      onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
                      placeholder="0" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all bg-white" />
                  ) : (
                    <input type="number" min="0" step="0.01"
                      value={discountFixed === 0 ? '' : discountFixed}
                      onChange={e => setDiscountFixed(parseFloat(e.target.value) || 0)}
                      placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all bg-white" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Налог {TAX_RATE}%</label>
                <button type="button" onClick={() => setTaxEnabled(v => !v)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold border transition-all ${taxEnabled ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>{taxEnabled ? `Включён (${TAX_RATE}%)` : 'Выключен'}</button>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Доп. расходы</label>
                <input type="number" min="0" step="0.01"
                  value={extraDeliveryCost === 0 ? '' : extraDeliveryCost}
                  onChange={e => setExtraDeliveryCost(parseFloat(e.target.value) || 0)}
                  placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all bg-white" />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Доставка</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step="0.01"
                    value={extraExpensesVal === 0 ? '' : extraExpensesVal}
                    onChange={e => setExtraExpensesVal(parseFloat(e.target.value) || 0)}
                    placeholder="0.00" className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-transparent transition-all bg-white" />

                </div>
              </div>

            </div>
          </div>

          {/* Deposit */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 tracking-wide">Депозит клиента</h3>
              {depositAmount > 0 && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full tracking-wide">
                  Остаток: {fmt(Math.max(0, total - depositAmount))} {selected?.currency}
                </span>
              )}
            </div>
            <div className="px-8 py-6 flex items-end gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Сумма депозита</label>
                <input type="number" min="0" step="0.01"
                  value={depositAmount === 0 ? '' : depositAmount}
                  onChange={e => setDepositAmount(parseFloat(e.target.value) || 0)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveDeposit(); } }}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition-all bg-white tabular-nums" />
              </div>
              <button onClick={saveDeposit} disabled={savingDeposit}
                className="text-sm font-semibold bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-50 whitespace-nowrap">
                {savingDeposit ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Order details */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 tracking-wide">Доставка</h3>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Order details</span>
            </div>
            <div className="px-8 py-6 grid grid-cols-1 md:grid-cols-3 gap-0 border-b border-gray-100">
              {([
                { key: 'location', label: 'Delivery location', placeholder: 'Город, адрес...' },
                { key: 'type', label: 'Type of delivery', placeholder: 'Air / Sea / Road...' },
                { key: 'qty', label: 'QTY', placeholder: '0' },
              ] as { key: keyof typeof delivery; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                <div key={key} className="px-4 first:pl-0 last:pr-0 md:border-r md:last:border-r-0 border-gray-100">
                  <label className="block text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-2">{label}</label>
                  <input value={delivery[key]} onChange={e => setDelivery(d => ({ ...d, [key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveDeliveryRef.current(); } }}
                    placeholder={placeholder}
                    className="w-full px-0 py-1 border-0 border-b border-gray-200 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-500 transition-all bg-transparent" />
                </div>
              ))}
            </div>
            <div className="px-8 pb-5">
              <button onClick={saveDelivery} disabled={savingDelivery}
                className="text-sm font-semibold bg-gray-900 text-white px-5 py-2 rounded-xl hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-50">
                {savingDelivery ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Camera size={16} className="text-gray-400" />
                <h3 className="text-sm font-bold text-gray-900">Фотографии</h3>
                {photos.length > 0 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{photos.length}/10</span>}
              </div>
              {photos.length < 10 && (
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-xl hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-50">
                  {uploadingPhoto ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <PlusIcon size={12} />}
                  Добавить
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => { if (e.target.files) { uploadPhotos(e.target.files); e.target.value = ''; } }} />
            </div>
            <div className="px-8 py-6"
              onDragOver={e => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false); }}
              onDrop={e => {
                e.preventDefault(); setIsDraggingOver(false);
                const files = e.dataTransfer.files;
                if (files && files.length > 0) uploadPhotos(files);
              }}>
              {isDraggingOver && (
                <div className="border-2 border-dashed border-blue-400 bg-blue-50 rounded-xl py-10 flex flex-col items-center gap-2 text-blue-500 mb-3">
                  <Camera size={24} /><span className="text-sm font-semibold">Отпустите для загрузки</span>
                </div>
              )}
              {photos.length === 0 ? (
                <button onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-all">
                  <ImageOff size={24} /><span className="text-sm font-medium">Нажмите или перетащите фото сюда</span>
                  <span className="text-xs">До 10 фотографий</span>
                </button>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {photos.map(photo => (
                    <div key={photo.id} className="relative group aspect-square rounded-xl overflow-hidden bg-gray-100 cursor-pointer"
                      onClick={() => setLightboxPhoto(photo)}>
                      <img src={getPhotoUrl(photo.storage_path)} alt={photo.filename}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <button onClick={e => { e.stopPropagation(); deletePhoto(photo); }}
                          className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {photos.length < 10 && (
                    <button onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-all">
                      <PlusIcon size={20} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Videos */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-8 py-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video size={16} className="text-gray-400" />
                <h3 className="text-sm font-bold text-gray-900">Видео</h3>
                {videos.length > 0 && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{videos.length}/5</span>}
              </div>
              {videos.length < 5 && (
                <button onClick={() => videoInputRef.current?.click()} disabled={uploadingVideo}
                  className="flex items-center gap-1.5 text-xs font-semibold bg-gray-900 text-white px-3 py-1.5 rounded-xl hover:bg-gray-800 active:opacity-75 transition-all disabled:opacity-50">
                  {uploadingVideo ? <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <PlusIcon size={12} />}
                  Добавить
                </button>
              )}
              <input ref={videoInputRef} type="file" accept="video/*" multiple className="hidden"
                onChange={e => { if (e.target.files) { uploadVideos(e.target.files); e.target.value = ''; } }} />
            </div>
            <div className="px-8 py-6">
              {videos.length === 0 ? (
                <button onClick={() => videoInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-all">
                  <Video size={24} /><span className="text-sm font-medium">Нажмите чтобы загрузить видео</span>
                  <span className="text-xs">До 5 видео</span>
                </button>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {videos.map(video => (
                    <div key={video.id} className="relative group aspect-video rounded-xl overflow-hidden bg-gray-900 cursor-pointer"
                      onClick={() => setLightboxVideo(video)}>
                      <video src={getVideoUrl(video.storage_path)} className="w-full h-full object-cover" muted />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-white/80 flex items-center justify-center">
                          <Play size={18} className="text-gray-800 ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <button onClick={e => { e.stopPropagation(); deleteVideo(video); }}
                          className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {videos.length < 5 && (
                    <button onClick={() => videoInputRef.current?.click()}
                      className="aspect-video rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-all">
                      <PlusIcon size={20} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={() => setLightboxPhoto(null)}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-medium truncate max-w-[70%]">{lightboxPhoto.filename}</span>
            <div className="flex items-center gap-2">
              <a href={getPhotoUrl(lightboxPhoto.storage_path)} download={lightboxPhoto.filename} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors">
                <Download size={13} />Скачать
              </a>
              <button onClick={() => setLightboxPhoto(null)} className="p-1.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <img src={getPhotoUrl(lightboxPhoto.storage_path)} alt={lightboxPhoto.filename}
              className="max-w-full max-h-full object-contain rounded-lg" />
          </div>
          <div className="flex gap-2 justify-center px-4 py-3 flex-shrink-0 overflow-x-auto" onClick={e => e.stopPropagation()}>
            {photos.map(p => (
              <button key={p.id} onClick={() => setLightboxPhoto(p)}
                className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${lightboxPhoto.id === p.id ? 'border-white' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                <img src={getPhotoUrl(p.storage_path)} alt={p.filename} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Lightbox */}
      {lightboxVideo && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col" onClick={() => setLightboxVideo(null)}>
          <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-medium truncate max-w-[70%]">{lightboxVideo.filename}</span>
            <div className="flex items-center gap-2">
              <a href={getVideoUrl(lightboxVideo.storage_path)} download={lightboxVideo.filename} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold bg-white text-gray-900 px-3 py-1.5 rounded-xl hover:bg-gray-100 transition-colors">
                <Download size={13} />Скачать
              </a>
              <button onClick={() => setLightboxVideo(null)} className="p-1.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
            <video src={getVideoUrl(lightboxVideo.storage_path)} controls autoPlay className="max-w-full max-h-full rounded-lg" />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && selected && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-end justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-bold text-gray-900 mb-1">Переместить в корзину?</h3>
            <p className="text-xs text-gray-500 mb-4">«{selected.number}» будет перемещён в корзину. Запись в бухгалтерии клиента будет удалена.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Отмена
              </button>
              <button onClick={() => trashInvoice(selected.id)}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-sm font-semibold text-white hover:bg-red-600 transition-colors">
                В корзину
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return to Smeta confirmation */}
      {returnConfirm && selected && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <RotateCcw size={22} className="text-blue-500" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">Вернуть в Смету?</h3>
            <p className="text-xs text-gray-500 mb-5">Счёт «{selected.number}» будет снят с подтверждения. Штампы PAID и DELIVERED будут сброшены.</p>
            <div className="flex gap-2">
              <button onClick={() => setReturnConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Отмена
              </button>
              <button onClick={returnToSmeta}
                className="flex-1 py-2.5 rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 transition-colors">
                Вернуть
              </button>
            </div>
          </div>
        </div>
      )}

      {returnChoice && selected && (
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
              <RotateCcw size={22} className="text-blue-500" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 mb-1">Вернуть в Смету</h3>
            <p className="text-xs text-gray-500 mb-5">Счёт «{selected.number}» создан из {selected.merged_from?.length} смет. Как вернуть?</p>
            <div className="space-y-2">
              <button onClick={returnAsOneSmeta}
                className="w-full py-2.5 rounded-xl bg-blue-500 text-sm font-semibold text-white hover:bg-blue-600 transition-colors">
                Вернуть как одну смету
              </button>
              <button onClick={returnAsMultipleSmetas}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                Вернуть как {selected.merged_from?.length} отдельные сметы
              </button>
              <button onClick={() => setReturnChoice(false)}
                className="w-full py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  ) as React.ReactElement;
}

function Stamp({ color, bg, label, sub, date: dateProp, shape = 'circle' }: { color: string; bg: string; label: string; sub: string; date?: string; shape?: 'circle' | 'rect' }) {
  const date = dateProp
    ? new Date(dateProp + 'T00:00:00').toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const uid = `stamp-${label}`;
  if (shape === 'rect') {
    return (
      <div className="select-none" style={{ transform: 'rotate(-5deg)', opacity: 0.93 }}>
        <svg width="200" height="140" viewBox="0 0 200 140">
          <rect x="6" y="6" width="188" height="128" rx="8" fill={bg} opacity="0.45" />
          <rect x="6" y="6" width="188" height="128" rx="8" fill="none" stroke={color} strokeWidth="3.5" />
          <rect x="14" y="14" width="172" height="112" rx="5" fill="none" stroke={color} strokeWidth="1.2" opacity="0.55" />
          <text x="100" y="52" fill={color} fontSize="20" fontWeight="900" textAnchor="middle" letterSpacing="2" fontFamily="'Helvetica Neue', Arial, sans-serif">{label}</text>
          <text x="100" y="72" fill={color} fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="3" fontFamily="'Helvetica Neue', Arial, sans-serif">{sub}</text>
          <line x1="50" y1="84" x2="150" y2="84" stroke={color} strokeWidth="0.8" opacity="0.4" />
          <text x="100" y="108" fill={color} fontSize="17" fontWeight="700" textAnchor="middle" fontFamily="'Helvetica Neue', Arial, sans-serif">{date}</text>
          <text x="100" y="126" fill={color} fontSize="10" textAnchor="middle" opacity="0.6">✦ ✦ ✦</text>
        </svg>
      </div>
    );
  }
  return (
    <div className="select-none" style={{ transform: 'rotate(-5deg)', opacity: 0.93 }}>
      <svg width="175" height="175" viewBox="0 0 200 200">
        <defs>
          <path id={uid} d="M 32 108 A 68 68 0 0 1 168 108" fill="none" />
        </defs>
        <circle cx="100" cy="100" r="95" fill={bg} opacity="0.45" />
        <circle cx="100" cy="100" r="95" fill="none" stroke={color} strokeWidth="3.5" />
        <circle cx="100" cy="100" r="85" fill="none" stroke={color} strokeWidth="1.2" opacity="0.55" />
        <text x="100" y="70" fill={color} fontSize="28" fontWeight="900" textAnchor="middle" letterSpacing="4" fontFamily="'Helvetica Neue', Arial, sans-serif">{label}</text>
        <line x1="55" y1="85" x2="145" y2="85" stroke={color} strokeWidth="0.8" opacity="0.4" />
        <text x="100" y="110" fill={color} fontSize="11" fontWeight="700" textAnchor="middle" letterSpacing="3" fontFamily="'Helvetica Neue', Arial, sans-serif">{sub}</text>
        <text x="100" y="140" fill={color} fontSize="17" fontWeight="700" textAnchor="middle" fontFamily="'Helvetica Neue', Arial, sans-serif">{date}</text>
        <text x="100" y="168" fill={color} fontSize="11" textAnchor="middle" opacity="0.6">✦ ✦ ✦</text>
        <circle cx="20" cy="100" r="2.5" fill={color} opacity="0.6" />
        <circle cx="180" cy="100" r="2.5" fill={color} opacity="0.6" />
      </svg>
    </div>
  );
}

