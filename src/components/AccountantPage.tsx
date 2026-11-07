import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { Plus, Trash2, Check, X, Pin, ChevronUp, ChevronDown, Lock, Unlock, GripVertical, FileSpreadsheet, Palette, Combine, ChevronRight, Calculator, Wallet, TrendingDown, ArrowDownLeft } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { supabase } from '../lib/supabase';
import { downloadBlob } from '../lib/download';
import { monthKey } from '../lib/profit';

interface MergedChild {
  sum_amount: number;
  description: string;
  should_be_amount: number;
  must_give_amount: number;
  notes: string;
}

interface AccountantEntry {
  id: string;
  month: string;
  sum_amount: number;
  description: string;
  restore_amount: number;
  should_be_amount: number;
  must_give_amount: number;
  notes: string;
  position: number;
  is_pinned: boolean;
  row_color: string | null;
  created_at: string;
  merged_title?: string | null;
  merged_children?: MergedChild[] | null;
}

interface EditState {
  id: string | null;
  sum_amount: string;
  description: string;
  restore_amount: string;
  should_be_amount: string;
  must_give_amount: string;
  notes: string;
  row_color: string;
}

const COLOR_OPTIONS = [
  { key: '', label: 'Нет', bg: 'bg-white', border: 'border-slate-300' },
  { key: 'blue', label: 'Синий', bg: 'bg-blue-400', border: 'border-blue-500' },
  { key: 'cyan', label: 'Бирюзовый', bg: 'bg-cyan-400', border: 'border-cyan-500' },
  { key: 'emerald', label: 'Изумруд', bg: 'bg-emerald-400', border: 'border-emerald-500' },
  { key: 'amber', label: 'Жёлтый', bg: 'bg-amber-400', border: 'border-amber-500' },
  { key: 'orange', label: 'Оранжевый', bg: 'bg-orange-400', border: 'border-orange-500' },
  { key: 'red', label: 'Красный', bg: 'bg-rose-400', border: 'border-rose-500' },
  { key: 'pink', label: 'Розовый', bg: 'bg-pink-400', border: 'border-pink-500' },
  { key: 'violet', label: 'Фиолетовый', bg: 'bg-violet-400', border: 'border-violet-500' },
  { key: 'gray', label: 'Серый (не в общем)', bg: 'bg-slate-300', border: 'border-slate-500' },
];

function rowBg(color: string | null) {
  switch (color) {
    case 'blue': return 'bg-blue-50 border-l-4 border-l-blue-400 border-b border-slate-100';
    case 'cyan': return 'bg-cyan-50 border-l-4 border-l-cyan-400 border-b border-slate-100';
    case 'emerald': return 'bg-emerald-50 border-l-4 border-l-emerald-400 border-b border-slate-100';
    case 'amber': return 'bg-amber-50 border-l-4 border-l-amber-400 border-b border-slate-100';
    case 'orange': return 'bg-orange-50 border-l-4 border-l-orange-400 border-b border-slate-100';
    case 'red': return 'bg-rose-50 border-l-4 border-l-rose-400 border-b border-slate-100';
    case 'pink': return 'bg-pink-50 border-l-4 border-l-pink-400 border-b border-slate-100';
    case 'violet': return 'bg-violet-50 border-l-4 border-l-violet-400 border-b border-slate-100';
    case 'gray': return 'bg-slate-100 border-l-4 border-l-slate-400 border-b border-slate-100';
    default: return 'border-b border-slate-100 hover:bg-slate-50/70';
  }
}

function textColor(color: string | null, fallback: string) {
  return fallback;
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtSigned(n: number) {
  return `${n > 0 ? '+' : ''}${fmt(n)}`;
}

function monthLabel(key: string) {
  return key.split('-').reverse().join('.');
}

function parseNum(s: string): number {
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

const DEFAULT_WIDTHS: Record<string, number> = {
  sum: 130, desc: 220, restore: 110, should: 120, mustGive: 120, notes: 180,
};

const inputCls = 'w-full text-xs px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:bg-white focus:ring-4 focus:ring-blue-50 transition-all placeholder:text-slate-400';

export default function AccountantPage({ onBack, owner }: { onBack?: () => void; owner: string }) {
  const [entries, setEntries] = useState<AccountantEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_WIDTHS);
  const descRef = useRef<HTMLInputElement>(null);
  const [dragIdx, setDragIdx] = useState<string | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<string | null>(null);
  const [fabOpen, setFabOpen] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [showColorPickerFor, setShowColorPickerFor] = useState<string | null>(null);
  const snapshotRef = useRef<AccountantEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeDialog, setMergeDialog] = useState<{ name: string } | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [addChildFor, setAddChildFor] = useState<string | null>(null);
  const [addChildState, setAddChildState] = useState({ sum_amount: '', description: '', should_be_amount: '', must_give_amount: '', notes: '' });
  const [editChildFor, setEditChildFor] = useState<{ parentId: string; childIndex: number } | null>(null);
  const [editChildState, setEditChildState] = useState({ sum_amount: '', description: '', should_be_amount: '', must_give_amount: '', notes: '' });
  useEffect(() => { fetchAll(); }, []);

  useEffect(() => {
    if (!editMode) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [editMode]);

  async function fetchAll() {
    setLoading(true);
    const { data } = await supabase.from('accountant_entries').select('*').eq('owner', owner).order('position').order('created_at');
    const rows = (data as AccountantEntry[]) ?? [];
    setEntries(rows);

    const now = monthKey(new Date().toISOString());
    const months = [...new Set(rows.map(e => e.month))].sort((a, b) => b.localeCompare(a));
    const current = months.includes(now) ? now : (months[0] ?? now);
    setSelectedMonth(current);
    setLoading(false);
  }

  const monthEntries = useMemo(() => {
    const rows = entries
      .filter(e => e.month === selectedMonth)
      .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    const pinned = rows.filter(r => r.is_pinned);
    const rest = rows.filter(r => !r.is_pinned);
    return [...pinned, ...rest];
  }, [entries, selectedMonth]);

  function persistPositions(ordered: AccountantEntry[]) {
    const posMap = Object.fromEntries(ordered.map((e, i) => [e.id, i]));
    setEntries(prev => prev.map(e => posMap[e.id] !== undefined ? { ...e, position: posMap[e.id] } : e));
    if (!editMode) Promise.all(ordered.map((e, i) => supabase.from('accountant_entries').update({ position: i }).eq('id', e.id)));
  }

  const totals = useMemo(() => {
    const counted = monthEntries.filter(e => e.row_color !== 'gray');
    const sumTotal = counted.reduce((s, e) => s + e.sum_amount, 0);
    const shouldBeTotal = counted.reduce((s, e) => s + e.should_be_amount, 0);
    const mustGiveTotal = counted.reduce((s, e) => s + (e.must_give_amount ?? 0), 0);
    const restoreTotal = sumTotal - shouldBeTotal;
    return { sumTotal, restoreTotal, shouldBeTotal, mustGiveTotal };
  }, [monthEntries]);

  const monthCount = useMemo(() => {
    const counted = monthEntries.filter(e => e.row_color !== 'gray');
    return counted.length;
  }, [monthEntries]);

  function startAdd() {
    setEditState({ id: null, sum_amount: '', description: '', restore_amount: '', should_be_amount: '', must_give_amount: '', notes: '', row_color: '' });
    setTimeout(() => descRef.current?.focus(), 50);
  }

  function startEdit(e: AccountantEntry) {
    setEditState({
      id: e.id,
      sum_amount: e.sum_amount === 0 ? '' : String(e.sum_amount),
      description: e.description,
      restore_amount: '',
      should_be_amount: e.should_be_amount === 0 ? '' : String(e.should_be_amount),
      must_give_amount: (e.must_give_amount ?? 0) === 0 ? '' : String(e.must_give_amount),
      notes: e.notes,
      row_color: e.row_color ?? '',
    });
  }

  async function saveEdit() {
    if (!editState || !selectedMonth) return;

    const sumAmt = parseNum(editState.sum_amount);
    const shouldBeAmt = parseNum(editState.should_be_amount);
    const mustGiveAmt = parseNum(editState.must_give_amount);
    const payload = {
      month: selectedMonth,
      sum_amount: sumAmt,
      description: editState.description.trim(),
      restore_amount: sumAmt - shouldBeAmt,
      should_be_amount: shouldBeAmt,
      must_give_amount: mustGiveAmt,
      notes: editState.notes.trim(),
      row_color: editState.row_color || null,
      position: editState.id ? (entries.find(e => e.id === editState.id)?.position ?? 0) : monthEntries.length,
      is_pinned: editState.id
        ? (entries.find(e => e.id === editState.id)?.is_pinned ?? false)
        : false,
    };
    if (editState.id) {
      if (editMode) {
        setEntries(prev => prev.map(e => e.id === editState.id ? { ...e, ...payload } : e));
      } else {
        const { data } = await supabase.from('accountant_entries').update(payload).eq('id', editState.id).select().single();
        if (data) setEntries(prev => prev.map(e => e.id === editState.id ? (data as AccountantEntry) : e));
      }
    } else {
      const newId = crypto.randomUUID();
      const newEntry: AccountantEntry = { id: newId, created_at: new Date().toISOString(), ...payload };
      if (editMode) {
        setEntries(prev => [...prev, newEntry]);
      } else {
        const { data } = await supabase.from('accountant_entries').insert({ ...payload, owner }).select().single();
        if (data) setEntries(prev => [...prev, data as AccountantEntry]);
      }
    }
    setEditState(null);
  }

  async function togglePin(entry: AccountantEntry) {
    const newVal = !entry.is_pinned;
    if (newVal) {
      const pinnedCount = entries.filter(e => e.month === entry.month && e.is_pinned).length;
      if (pinnedCount >= 10) return;
    }
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, is_pinned: newVal } : e));
    if (!editMode) await supabase.from('accountant_entries').update({ is_pinned: newVal }).eq('id', entry.id);
  }

  async function deleteEntry(id: string) {
    setDeleting(id);
    setEntries(prev => prev.filter(e => e.id !== id));
    if (!editMode) await supabase.from('accountant_entries').delete().eq('id', id);
    setDeleting(null);
  }

  function moveEntry(entry: AccountantEntry, dir: 'up' | 'down') {
    const idx = monthEntries.findIndex(e => e.id === entry.id);
    if (idx === -1) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= monthEntries.length) return;
    const reordered = [...monthEntries];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    persistPositions(reordered);
  }

  function dragReorder(fromId: string, toId: string) {
    const fromIdx = monthEntries.findIndex(e => e.id === fromId);
    const toIdx = monthEntries.findIndex(e => e.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const reordered = [...monthEntries];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    persistPositions(reordered);
  }

  function enterEditMode() {
    snapshotRef.current = entries.map(e => ({ ...e }));
    setEditMode(true);
    setEditState(null);
    setMergeSelection(new Set());
  }

  function cancelEditMode() {
    setEntries(snapshotRef.current.map(e => ({ ...e })));
    snapshotRef.current = [];
    setEditMode(false);
    setEditState(null);
    setMergeSelection(new Set());
  }

  async function saveAllAndExit() {
    setSaving(true);
    const snapshotIds = new Set(snapshotRef.current.map(e => e.id));
    const currentIds = new Set(entries.map(e => e.id));

    const toDelete = [...snapshotIds].filter(id => !currentIds.has(id));
    const toUpsert = entries.filter(e => snapshotIds.has(e.id));
    const toInsert = entries.filter(e => !snapshotIds.has(e.id));

    await Promise.all([
      ...toDelete.map(id => supabase.from('accountant_entries').delete().eq('id', id)),
      ...toUpsert.map(e => supabase.from('accountant_entries').update({
        month: e.month, sum_amount: e.sum_amount, description: e.description,
        restore_amount: e.restore_amount, should_be_amount: e.should_be_amount,
        must_give_amount: e.must_give_amount, notes: e.notes, row_color: e.row_color,
        position: e.position, is_pinned: e.is_pinned,
        merged_title: e.merged_title ?? null, merged_children: e.merged_children ?? null,
      }).eq('id', e.id)),
      ...toInsert.map(e => supabase.from('accountant_entries').insert({
        id: e.id, month: e.month, sum_amount: e.sum_amount, description: e.description,
        restore_amount: e.restore_amount, should_be_amount: e.should_be_amount,
        must_give_amount: e.must_give_amount, notes: e.notes, row_color: e.row_color,
        position: e.position, is_pinned: e.is_pinned, owner,
        merged_title: e.merged_title ?? null, merged_children: e.merged_children ?? null,
      })),
    ]);

    snapshotRef.current = [];
    setEditMode(false);
    setEditState(null);
    setSaving(false);
    fetchAll();
  }

  async function changeRowColor(id: string, color: string) {
    const colorVal = color || null;
    setEntries(prev => prev.map(e => e.id === id ? { ...e, row_color: colorVal } : e));
    if (!editMode) await supabase.from('accountant_entries').update({ row_color: colorVal }).eq('id', id);
    setShowColorPickerFor(null);
  }

  function toggleMergeSelect(id: string) {
    setMergeSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openMergeDialog() {
    if (mergeSelection.size < 2) return;
    setMergeDialog({ name: '' });
  }

  async function confirmMerge() {
    if (!mergeDialog || mergeSelection.size < 2 || !selectedMonth) return;
    const toMerge = monthEntries.filter(e => mergeSelection.has(e.id));
    if (toMerge.length < 2) return;
    const keepId = toMerge[0].id;
    const children: MergedChild[] = toMerge.map(e => ({
      sum_amount: e.sum_amount,
      description: e.description,
      should_be_amount: e.should_be_amount,
      must_give_amount: e.must_give_amount ?? 0,
      notes: e.notes,
    }));
    const merged: AccountantEntry = {
      ...toMerge[0],
      sum_amount: toMerge.reduce((s, e) => s + e.sum_amount, 0),
      should_be_amount: toMerge.reduce((s, e) => s + e.should_be_amount, 0),
      must_give_amount: toMerge.reduce((s, e) => s + (e.must_give_amount ?? 0), 0),
      restore_amount: toMerge.reduce((s, e) => s + e.sum_amount, 0) - toMerge.reduce((s, e) => s + e.should_be_amount, 0),
      description: mergeDialog.name.trim() || toMerge.map(e => e.description).filter(Boolean).join(' + '),
      notes: '',
      merged_title: mergeDialog.name.trim() || null,
      merged_children: children,
    };
    const removeIds = toMerge.slice(1).map(e => e.id);
    setEntries(prev => {
      const filtered = prev.filter(e => !removeIds.includes(e.id));
      return filtered.map(e => e.id === keepId ? merged : e);
    });
    if (editMode) {
      // changes will be saved on "Сохранить"
    } else {
      await supabase.from('accountant_entries').update({
        sum_amount: merged.sum_amount, should_be_amount: merged.should_be_amount,
        must_give_amount: merged.must_give_amount, restore_amount: merged.restore_amount,
        description: merged.description, notes: merged.notes,
        merged_title: merged.merged_title, merged_children: merged.merged_children,
      }).eq('id', keepId);
      await Promise.all(removeIds.map(id => supabase.from('accountant_entries').delete().eq('id', id)));
    }
    setMergeSelection(new Set());
    setMergeDialog(null);
  }

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openAddChild(entryId: string) {
    setAddChildFor(entryId);
    setAddChildState({ sum_amount: '', description: '', should_be_amount: '', must_give_amount: '', notes: '' });
  }

  function openEditChild(parentId: string, childIndex: number) {
    const parent = entries.find(e => e.id === parentId);
    if (!parent || !parent.merged_children) return;
    const child = parent.merged_children[childIndex];
    if (!child) return;
    setEditChildFor({ parentId, childIndex });
    setEditChildState({
      sum_amount: String(child.sum_amount),
      description: child.description,
      should_be_amount: String(child.should_be_amount),
      must_give_amount: String(child.must_give_amount),
      notes: child.notes,
    });
  }

  async function confirmEditChild() {
    if (!editChildFor) return;
    const parent = entries.find(e => e.id === editChildFor.parentId);
    if (!parent || !parent.merged_children) return;
    const updatedChildren = parent.merged_children.map((c, i) =>
      i === editChildFor.childIndex
        ? {
            sum_amount: parseNum(editChildState.sum_amount),
            description: editChildState.description.trim(),
            should_be_amount: parseNum(editChildState.should_be_amount),
            must_give_amount: parseNum(editChildState.must_give_amount),
            notes: editChildState.notes.trim(),
          }
        : c
    );
    const updated: AccountantEntry = {
      ...parent,
      merged_children: updatedChildren,
      sum_amount: updatedChildren.reduce((s, c) => s + c.sum_amount, 0),
      should_be_amount: updatedChildren.reduce((s, c) => s + c.should_be_amount, 0),
      must_give_amount: updatedChildren.reduce((s, c) => s + c.must_give_amount, 0),
      restore_amount: updatedChildren.reduce((s, c) => s + c.sum_amount, 0) - updatedChildren.reduce((s, c) => s + c.should_be_amount, 0),
    };
    setEntries(prev => prev.map(e => e.id === parent.id ? updated : e));
    if (!editMode) {
      await supabase.from('accountant_entries').update({
        sum_amount: updated.sum_amount, should_be_amount: updated.should_be_amount,
        must_give_amount: updated.must_give_amount, restore_amount: updated.restore_amount,
        merged_children: updated.merged_children,
      }).eq('id', parent.id);
    }
    setEditChildFor(null);
  }

  async function deleteChild(parentId: string, childIndex: number) {
    const parent = entries.find(e => e.id === parentId);
    if (!parent || !parent.merged_children) return;
    const updatedChildren = parent.merged_children.filter((_, i) => i !== childIndex);
    const updated: AccountantEntry = {
      ...parent,
      merged_children: updatedChildren.length > 0 ? updatedChildren : null,
      sum_amount: updatedChildren.reduce((s, c) => s + c.sum_amount, 0),
      should_be_amount: updatedChildren.reduce((s, c) => s + c.should_be_amount, 0),
      must_give_amount: updatedChildren.reduce((s, c) => s + c.must_give_amount, 0),
      restore_amount: updatedChildren.reduce((s, c) => s + c.sum_amount, 0) - updatedChildren.reduce((s, c) => s + c.should_be_amount, 0),
    };
    setEntries(prev => prev.map(e => e.id === parent.id ? updated : e));
    if (!editMode) {
      await supabase.from('accountant_entries').update({
        sum_amount: updated.sum_amount, should_be_amount: updated.should_be_amount,
        must_give_amount: updated.must_give_amount, restore_amount: updated.restore_amount,
        merged_children: updated.merged_children,
      }).eq('id', parent.id);
    }
  }

  async function confirmAddChild() {
    if (!addChildFor) return;
    const parent = entries.find(e => e.id === addChildFor);
    if (!parent || !parent.merged_children) return;
    const newChild: MergedChild = {
      sum_amount: parseNum(addChildState.sum_amount),
      description: addChildState.description.trim(),
      should_be_amount: parseNum(addChildState.should_be_amount),
      must_give_amount: parseNum(addChildState.must_give_amount),
      notes: addChildState.notes.trim(),
    };
    const updatedChildren = [...parent.merged_children, newChild];
    const updated: AccountantEntry = {
      ...parent,
      merged_children: updatedChildren,
      sum_amount: updatedChildren.reduce((s, c) => s + c.sum_amount, 0),
      should_be_amount: updatedChildren.reduce((s, c) => s + c.should_be_amount, 0),
      must_give_amount: updatedChildren.reduce((s, c) => s + c.must_give_amount, 0),
      restore_amount: updatedChildren.reduce((s, c) => s + c.sum_amount, 0) - updatedChildren.reduce((s, c) => s + c.should_be_amount, 0),
    };
    setEntries(prev => prev.map(e => e.id === parent.id ? updated : e));
    if (!editMode) {
      await supabase.from('accountant_entries').update({
        sum_amount: updated.sum_amount, should_be_amount: updated.should_be_amount,
        must_give_amount: updated.must_give_amount, restore_amount: updated.restore_amount,
        merged_children: updated.merged_children,
      }).eq('id', parent.id);
    }
    setExpandedRows(prev => new Set(prev).add(parent.id));
    setAddChildFor(null);
  }

  const EXCEL_COLORS: Record<string, string> = {
    blue: 'BFDBFE', cyan: 'A5F3FC', emerald: 'A7F3D0',
    amber: 'FDE68A', orange: 'FED7AA', red: 'FECACA', pink: 'FBCFE8',
    violet: 'DDD6FE', gray: 'D4D4D8',
  };

  function exportExcel() {
    if (monthEntries.length === 0) return;
    const headerStyle: XLSX.CellObject['s'] = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { patternType: 'solid', fgColor: { rgb: '1F2937' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: { top: { style: 'thin', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } }, left: { style: 'thin', color: { rgb: 'D1D5DB' } }, right: { style: 'thin', color: { rgb: 'D1D5DB' } } },
    };
    const cell = (v: string | number, s?: XLSX.CellObject['s']): XLSX.CellObject => ({ v, t: typeof v === 'number' ? 'n' : 's', s: s ?? {} });
    const numStyle: XLSX.CellObject['s'] = { font: { sz: 11 }, alignment: { horizontal: 'center', vertical: 'center' }, border: { top: { style: 'thin', color: { rgb: 'F3F4F6' } }, bottom: { style: 'thin', color: { rgb: 'F3F4F6' } }, left: { style: 'thin', color: { rgb: 'F3F4F6' } }, right: { style: 'thin', color: { rgb: 'F3F4F6' } } } };
    const txtStyle: XLSX.CellObject['s'] = { font: { sz: 11 }, alignment: { horizontal: 'center', vertical: 'center' }, border: { top: { style: 'thin', color: { rgb: 'F3F4F6' } }, bottom: { style: 'thin', color: { rgb: 'F3F4F6' } }, left: { style: 'thin', color: { rgb: 'F3F4F6' } }, right: { style: 'thin', color: { rgb: 'F3F4F6' } } } };
    const totalStyle: XLSX.CellObject['s'] = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { patternType: 'solid', fgColor: { rgb: 'F3F4F6' } }, border: { top: { style: 'medium', color: { rgb: 'D1D5DB' } }, bottom: { style: 'thin', color: { rgb: 'D1D5DB' } } } };

    const aoa: (XLSX.CellObject | null)[][] = [];
    aoa.push([
      cell('Сумма в наличии', headerStyle), cell('Детали', headerStyle), cell('Восстановить', headerStyle),
      cell('Должно быть', headerStyle), cell('Должны дать', headerStyle), cell('Доп. информация', headerStyle),
    ]);
    for (const e of monthEntries) {
      const restore = e.sum_amount - e.should_be_amount;
      const rowColor = e.row_color && EXCEL_COLORS[e.row_color] ? EXCEL_COLORS[e.row_color] : null;
      const rs: XLSX.CellObject['s'] = rowColor ? { ...txtStyle, fill: { patternType: 'solid', fgColor: { rgb: rowColor } } } : txtStyle;
      const rns: XLSX.CellObject['s'] = rowColor ? { ...numStyle, fill: { patternType: 'solid', fgColor: { rgb: rowColor } } } : numStyle;
      aoa.push([
        cell(e.sum_amount, rns), cell(e.description, rs), cell(restore, rns),
        cell(e.should_be_amount, rns), cell(e.must_give_amount ?? 0, rns), cell(e.notes, rs),
      ]);
      if (e.merged_children && e.merged_children.length > 0) {
        const childStyle: XLSX.CellObject['s'] = { ...txtStyle, font: { sz: 10, color: { rgb: '71717A' } } };
        const childNumStyle: XLSX.CellObject['s'] = { ...numStyle, font: { sz: 10, color: { rgb: '71717A' } } };
        for (const c of e.merged_children) {
          const cRestore = c.sum_amount - c.should_be_amount;
          aoa.push([
            cell(c.sum_amount, childNumStyle), cell(`↳ ${c.description}`, childStyle), cell(cRestore, childNumStyle),
            cell(c.should_be_amount, childNumStyle), cell(c.must_give_amount, childNumStyle), cell(c.notes, childStyle),
          ]);
        }
      }
    }
    const counted = monthEntries.filter(e => e.row_color !== 'gray');
    const sumTotal = counted.reduce((s, e) => s + e.sum_amount, 0);
    const shouldBeTotal = counted.reduce((s, e) => s + e.should_be_amount, 0);
    const restoreTotal = sumTotal - shouldBeTotal;
    const mustGiveTotal = counted.reduce((s, e) => s + (e.must_give_amount ?? 0), 0);
    aoa.push([
      cell(sumTotal, totalStyle), cell('', totalStyle), cell(restoreTotal, totalStyle),
      cell(shouldBeTotal, totalStyle), cell(mustGiveTotal, totalStyle), cell('', totalStyle),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, monthLabel(selectedMonth ?? 'Отчёт'));
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Бухгалтер_${selectedMonth ?? 'export'}.xlsx`);
  }

  const startResize = useCallback((col: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = colWidths[col];
    function onMove(me: MouseEvent) {
      setColWidths(prev => ({ ...prev, [col]: Math.max(60, startW + me.clientX - startX) }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [colWidths]);

  function ColHeader({ col, label, className = '' }: { col: string; label: string; className?: string }) {
    return (
      <th
        className={`relative text-left px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider select-none ${className}`}
        style={{ width: colWidths[col], minWidth: colWidths[col] }}
      >
        {label}
        <div
          onMouseDown={ev => startResize(col, ev)}
          className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group"
        >
          <div className="w-0.5 h-4 bg-slate-200 rounded group-hover:bg-slate-400 transition-colors" />
        </div>
      </th>
    );
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-[#0d1f3c]" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 font-pro">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar */}
        <div className="shrink-0 bg-white border-b border-slate-200 px-5 sm:px-8 pt-5 pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d1f3c] text-white shadow-sm flex-shrink-0">
                <Calculator size={18} />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-xl font-black tracking-tight text-slate-900">Бухгалтерия</h2>
                  {editMode && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wide">Редактирование</span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">{monthCount} записей за месяц</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={enterEditMode}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  editMode ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}>
                <Unlock size={13} />
                <span>Изменить</span>
              </button>
              {editMode && (
                <button onClick={saveAllAndExit} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all disabled:opacity-50 shadow-sm">
                  <Lock size={13} />
                  <span>{saving ? 'Сохранение...' : 'Сохранить'}</span>
                </button>
              )}
              {editMode && (
                <button onClick={cancelEditMode} disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-600 hover:bg-slate-100 ring-1 ring-slate-200 transition-all disabled:opacity-50">
                  <X size={13} />
                  <span>Отменить</span>
                </button>
              )}
              {editMode && mergeSelection.size >= 2 && (
                <button onClick={openMergeDialog}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-all shadow-sm">
                  <Combine size={13} />
                  <span>Объединить ({mergeSelection.size})</span>
                </button>
              )}
              <button onClick={exportExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all">
                <FileSpreadsheet size={13} />
                <span className="hidden sm:inline">Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stat cards */}
        {selectedMonth && (
          <div className="px-5 sm:px-8 pt-4 shrink-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-[#0d1f3c] flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Wallet size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Сумма в наличии</p>
                  <p className="text-lg font-black text-slate-900 tabular-nums leading-tight">{fmt(totals.sumTotal)}</p>
                </div>
              </div>
              <div className={`bg-white rounded-xl border p-4 flex items-center gap-3 shadow-sm ${totals.restoreTotal < 0 ? 'border-rose-200' : 'border-slate-200'}`}>
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${totals.restoreTotal < 0 ? 'bg-rose-500' : 'bg-emerald-500'}`}>
                  <TrendingDown size={18} className="text-white" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Восстановить</p>
                  <p className={`text-lg font-black tabular-nums leading-tight ${totals.restoreTotal < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{fmtSigned(totals.restoreTotal)}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Check size={18} className="text-slate-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Должно быть</p>
                  <p className="text-lg font-black text-slate-700 tabular-nums leading-tight">{fmt(totals.shouldBeTotal)}</p>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <ArrowDownLeft size={18} className="text-blue-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-tight">Должны дать</p>
                  <p className="text-lg font-black text-slate-700 tabular-nums leading-tight">{fmt(totals.mustGiveTotal)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {selectedMonth && (
            <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full" style={{ minWidth: 600, tableLayout: 'fixed' }}>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="w-10 px-1 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3">{editMode ? '☐' : '№'}</th>
                      <ColHeader col="sum" label="Сумма в наличии" />
                      <ColHeader col="desc" label="Детали" />
                      <ColHeader col="restore" label="Восстановить" />
                      <ColHeader col="should" label="Должно быть" />
                      <ColHeader col="mustGive" label="Должны дать" />
                      <ColHeader col="notes" label="Доп. информация" />
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {monthEntries.map((entry, idx) => {
                      const isPinned = entry.is_pinned;
                      const isEditing = editState?.id === entry.id;
                      const isExpanded = expandedRows.has(entry.id);
                      return (
                        <Fragment key={entry.id}>
                        <tr
                          tabIndex={0}
                          onKeyDown={e => {
                            if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                              e.preventDefault();
                              moveEntry(entry, e.key === 'ArrowUp' ? 'up' : 'down');
                            }
                          }}
                          onDragOver={e => { e.preventDefault(); setDragOverIdx(entry.id); }}
                          onDrop={() => { if (dragIdx && dragIdx !== entry.id) dragReorder(dragIdx, entry.id); setDragIdx(null); setDragOverIdx(null); }}
                          className={`group transition-all focus:outline-none focus:ring-2 focus:ring-inset focus:ring-slate-400 ${
                            isEditing ? 'bg-amber-50/80 ring-1 ring-amber-200' : rowBg(entry.row_color)
                          } ${mergeSelection.has(entry.id) ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''} ${dragOverIdx === entry.id && dragIdx !== entry.id ? 'bg-blue-50 ring-2 ring-blue-300' : ''} ${dragIdx === entry.id ? 'opacity-40' : ''}`}>
                          {isEditing ? (
                            <>
                              <td className="px-1 py-2 text-center text-[10px] font-semibold text-slate-400 tabular-nums">{idx + 1}</td>
                              <td className="px-2 py-2">
                                <input type="number" value={editState.sum_amount}
                                  onChange={e => setEditState(s => s && ({ ...s, sum_amount: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                                  className={inputCls}
                                  placeholder="0" />
                              </td>
                              <td className="px-2 py-2">
                                <input ref={descRef} type="text" value={editState.description}
                                  onChange={e => setEditState(s => s && ({ ...s, description: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                                  className={inputCls}
                                  placeholder="Описание" />
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs font-bold text-blue-500 tabular-nums">
                                  {fmtSigned(parseNum(editState.sum_amount) - parseNum(editState.should_be_amount))}
                                </span>
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" value={editState.should_be_amount}
                                  onChange={e => setEditState(s => s && ({ ...s, should_be_amount: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                                  className={inputCls}
                                  placeholder="0" />
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" value={editState.must_give_amount}
                                  onChange={e => setEditState(s => s && ({ ...s, must_give_amount: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                                  className={inputCls}
                                  placeholder="0" />
                              </td>
                              <td className="px-2 py-2">
                                <input type="text" value={editState.notes}
                                  onChange={e => setEditState(s => s && ({ ...s, notes: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                                  className={inputCls}
                                  placeholder="Примечание" />
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1">
                                  <button onClick={saveEdit}
                                    className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#0d1f3c] text-white hover:bg-[#18375f] transition-colors">
                                    <Check size={11} />
                                  </button>
                                  <button onClick={() => setEditState(null)}
                                    className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                                    <X size={11} />
                                  </button>
                                  <div className="flex items-center gap-0.5">
                                    {COLOR_OPTIONS.map(c => (
                                      <button
                                        key={c.key}
                                        title={c.label}
                                        onClick={() => setEditState(s => s && ({ ...s, row_color: c.key }))}
                                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${c.bg} ${editState.row_color === c.key ? 'border-[#0d1f3c] scale-110 shadow-sm' : c.border}`}
                                      >
                                        {editState.row_color === c.key && <Check size={9} className="text-white drop-shadow" strokeWidth={4} />}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-1 py-3" onClick={e => e.stopPropagation()}>
                                <div className="flex items-center gap-1">
                                  {editMode && (
                                    <input type="checkbox" checked={mergeSelection.has(entry.id)}
                                      onChange={() => toggleMergeSelect(entry.id)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-700 cursor-pointer" />
                                  )}
                                  <div
                                    draggable
                                    onDragStart={() => setDragIdx(entry.id)}
                                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                                    className="cursor-grab active:cursor-grabbing rounded flex items-center justify-center w-6 h-6 transition-all hover:bg-slate-200"
                                    title="Перетащите для перемещения (или Alt+↑/↓)"
                                  >
                                    <span className="text-[10px] font-semibold text-slate-400 tabular-nums group-hover:opacity-0 transition-opacity">{idx + 1}</span>
                                    <GripVertical size={14} className="absolute text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3" onClick={() => editMode && startEdit(entry)} style={{ cursor: editMode ? 'pointer' : 'default' }}>
                                <span className={`text-xs font-bold tabular-nums ${textColor(entry.row_color, 'text-slate-900')}`}>
                                  {entry.sum_amount === 0 ? <span className={isPinned ? 'text-emerald-300' : 'text-slate-300'}>—</span> : fmt(entry.sum_amount)}
                                </span>
                              </td>
                              <td className="px-3 py-3" onClick={() => editMode && startEdit(entry)} style={{ cursor: editMode ? 'pointer' : 'default' }}>
                                <span className={`text-xs font-medium ${textColor(entry.row_color, 'text-slate-700')}`}>
                                  {entry.merged_children && entry.merged_children.length > 0 ? (
                                    <span className="flex items-center gap-1.5">
                                      <button onClick={(e) => { e.stopPropagation(); toggleExpand(entry.id); }}
                                        className="flex items-center justify-center w-5 h-5 rounded hover:bg-slate-200 transition-colors flex-shrink-0">
                                        <ChevronRight size={13} className={`text-slate-500 transition-transform ${expandedRows.has(entry.id) ? 'rotate-90' : ''}`} />
                                      </button>
                                      <span className="font-bold text-slate-900">{entry.merged_title || entry.description || <span className="text-slate-300">—</span>}</span>
                                      <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{entry.merged_children.length}</span>
                                    </span>
                                  ) : (
                                    entry.description || <span className="text-slate-300">—</span>
                                  )}
                                </span>
                              </td>
                              <td className="px-3 py-3" onClick={() => editMode && startEdit(entry)} style={{ cursor: editMode ? 'pointer' : 'default' }}>
                                {(() => {
                                  const diff = entry.sum_amount - entry.should_be_amount;
                                  return diff !== 0
                                    ? <span className="text-xs font-bold tabular-nums text-rose-500">{fmtSigned(diff)}</span>
                                    : <span className="text-slate-300">—</span>;
                                })()}
                              </td>
                              <td className="px-3 py-3" onClick={() => editMode && startEdit(entry)} style={{ cursor: editMode ? 'pointer' : 'default' }}>
                                <span className={`text-xs font-semibold tabular-nums ${textColor(entry.row_color, 'text-slate-700')}`}>
                                  {entry.should_be_amount === 0 ? <span className="text-slate-300">—</span> : fmt(entry.should_be_amount)}
                                </span>
                              </td>
                              <td className="px-3 py-3" onClick={() => editMode && startEdit(entry)} style={{ cursor: editMode ? 'pointer' : 'default' }}>
                                <span className={`text-xs font-semibold tabular-nums ${textColor(entry.row_color, 'text-slate-700')}`}>
                                  {(entry.must_give_amount ?? 0) === 0 ? <span className="text-slate-300">—</span> : fmt(entry.must_give_amount)}
                                </span>
                              </td>
                              <td className="px-3 py-3" onClick={() => editMode && startEdit(entry)} style={{ cursor: editMode ? 'pointer' : 'default' }}>
                                <span className="text-[11px] text-slate-400">{entry.notes || <span className="text-slate-200">—</span>}</span>
                              </td>
                              <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                                {editMode ? (
                                  <div className="relative flex items-center gap-0.5 h-5">
                                    <button onClick={() => moveEntry(entry, 'up')}
                                      title="Вверх"
                                      className="p-0.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 active:scale-90 transition-all">
                                      <ChevronUp size={13} />
                                    </button>
                                    <button onClick={() => moveEntry(entry, 'down')}
                                      title="Вниз"
                                      className="p-0.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-200 active:scale-90 transition-all">
                                      <ChevronDown size={13} />
                                    </button>
                                    <button onClick={() => togglePin(entry)}
                                      title={isPinned ? 'Открепить' : 'Закрепить вверху'}
                                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                        isPinned ? 'text-emerald-500 hover:text-emerald-700' : 'text-slate-200 hover:text-slate-500'
                                      }`}>
                                      <Pin size={10} />
                                    </button>
                                    <button onClick={() => setShowColorPickerFor(showColorPickerFor === entry.id ? null : entry.id)}
                                      title="Цвет строки"
                                      className={`w-5 h-5 flex items-center justify-center rounded transition-all ${
                                        entry.row_color ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-200 hover:text-slate-500 hover:bg-slate-100'
                                      }`}>
                                      <Palette size={12} />
                                    </button>
                                    <button onClick={() => deleteEntry(entry.id)} disabled={deleting === entry.id}
                                      className="w-5 h-5 flex items-center justify-center rounded text-slate-200 hover:text-rose-400 transition-colors">
                                      <Trash2 size={10} />
                                    </button>
                                    {showColorPickerFor === entry.id && (
                                      <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 flex flex-wrap gap-1.5 w-52">
                                        {COLOR_OPTIONS.map(c => (
                                          <button key={c.key}
                                            title={c.label}
                                            onClick={() => changeRowColor(entry.id, c.key)}
                                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${c.bg} ${entry.row_color === c.key ? 'border-[#0d1f3c] scale-110 shadow-sm' : c.border}`}>
                                            {entry.row_color === c.key && <Check size={12} className="text-white drop-shadow" strokeWidth={4} />}
                                          </button>
                                        ))}
                                        <button onClick={() => setShowColorPickerFor(null)}
                                          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                                          <X size={12} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="relative flex items-center justify-end gap-0.5">
                                    <button onClick={() => moveEntry(entry, 'up')}
                                      title="Вверх"
                                      className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-all">
                                      <ChevronUp size={13} />
                                    </button>
                                    <button onClick={() => moveEntry(entry, 'down')}
                                      title="Вниз"
                                      className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-700 hover:bg-slate-100 transition-all">
                                      <ChevronDown size={13} />
                                    </button>
                                    <button onClick={() => togglePin(entry)}
                                      title={isPinned ? 'Открепить' : 'Закрепить'}
                                      className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                                        isPinned ? 'text-emerald-500 hover:text-emerald-700' : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
                                      }`}>
                                      <Pin size={11} />
                                    </button>
                                    <button onClick={() => setShowColorPickerFor(showColorPickerFor === entry.id ? null : entry.id)}
                                      title="Цвет строки"
                                      className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-all">
                                      <Palette size={12} />
                                    </button>
                                    {showColorPickerFor === entry.id && (
                                      <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-xl shadow-lg p-2.5 flex flex-wrap gap-1.5 w-52">
                                        {COLOR_OPTIONS.map(c => (
                                          <button key={c.key}
                                            title={c.label}
                                            onClick={() => changeRowColor(entry.id, c.key)}
                                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${c.bg} ${entry.row_color === c.key ? 'border-[#0d1f3c] scale-110 shadow-sm' : c.border}`}>
                                            {entry.row_color === c.key && <Check size={12} className="text-white drop-shadow" strokeWidth={4} />}
                                          </button>
                                        ))}
                                        <button onClick={() => setShowColorPickerFor(null)}
                                          className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all">
                                          <X size={12} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                        </tr>
                        {entry.merged_children && entry.merged_children.length > 0 && expandedRows.has(entry.id) && (
                          <>
                          {entry.merged_children.map((child, ci) => (
                            <tr key={`${entry.id}-child-${ci}`} className="bg-slate-50/50 border-b border-slate-100 group/child">
                              <td className="px-1 py-2.5 text-center text-[9px] font-medium text-slate-300 tabular-nums">↳</td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] font-semibold tabular-nums text-slate-600">{child.sum_amount === 0 ? <span className="text-slate-300">—</span> : fmt(child.sum_amount)}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] text-slate-600">{child.description || <span className="text-slate-300">—</span>}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                {(() => {
                                  const diff = child.sum_amount - child.should_be_amount;
                                  return diff !== 0
                                    ? <span className="text-[11px] font-bold tabular-nums text-rose-400">{fmtSigned(diff)}</span>
                                    : <span className="text-slate-300">—</span>;
                                })()}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] font-semibold tabular-nums text-slate-500">{child.should_be_amount === 0 ? <span className="text-slate-300">—</span> : fmt(child.should_be_amount)}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[11px] font-semibold tabular-nums text-slate-500">{child.must_give_amount === 0 ? <span className="text-slate-300">—</span> : fmt(child.must_give_amount)}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[10px] text-slate-400">{child.notes || <span className="text-slate-200">—</span>}</span>
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover/child:opacity-100 transition-opacity">
                                  <button onClick={() => openEditChild(entry.id, ci)}
                                    title="Изменить"
                                    className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all">
                                    <Unlock size={10} />
                                  </button>
                                  <button onClick={() => deleteChild(entry.id, ci)}
                                    title="Удалить"
                                    className="w-5 h-5 flex items-center justify-center rounded text-slate-300 hover:text-rose-400 transition-all">
                                    <Trash2 size={9} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          <tr key={`${entry.id}-add-child`} className="bg-slate-50/30 border-b border-slate-100">
                            <td colSpan={8} className="px-3 py-2">
                              <button onClick={() => openAddChild(entry.id)}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600 hover:text-slate-900 transition-colors">
                                <Plus size={11} />
                                <span>Добавить линию</span>
                              </button>
                            </td>
                          </tr>
                          </>
                        )}
                        </Fragment>
                      );
                    })}

                    {/* New row form */}
                    {editState?.id === null && (
                      <tr className="border-b border-slate-100 bg-emerald-50/30">
                        <td className="px-1 py-2 text-center text-[10px] font-semibold text-slate-400 tabular-nums">{monthEntries.length + 1}</td>
                        <td className="px-2 py-2">
                          <input type="number" value={editState.sum_amount}
                            onChange={e => setEditState(s => s && ({ ...s, sum_amount: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                            className={inputCls}
                            placeholder="0" />
                        </td>
                        <td className="px-2 py-2">
                          <input ref={descRef} type="text" value={editState.description}
                            onChange={e => setEditState(s => s && ({ ...s, description: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                            className={inputCls}
                            placeholder="Описание" />
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-xs font-bold text-blue-500 tabular-nums">
                            {fmtSigned(parseNum(editState.sum_amount) - parseNum(editState.should_be_amount))}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" value={editState.should_be_amount}
                            onChange={e => setEditState(s => s && ({ ...s, should_be_amount: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                            className={inputCls}
                            placeholder="0" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" value={editState.must_give_amount}
                            onChange={e => setEditState(s => s && ({ ...s, must_give_amount: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                            className={inputCls}
                            placeholder="0" />
                        </td>
                        <td className="px-2 py-2">
                          <input type="text" value={editState.notes}
                            onChange={e => setEditState(s => s && ({ ...s, notes: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); }}
                            className={inputCls}
                            placeholder="Примечание" />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            <button onClick={saveEdit}
                              className="w-6 h-6 flex items-center justify-center rounded-lg bg-[#0d1f3c] text-white hover:bg-[#18375f] transition-colors">
                              <Check size={11} />
                            </button>
                            <button onClick={() => setEditState(null)}
                              className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                              <X size={11} />
                            </button>
                            <div className="flex items-center gap-0.5">
                              {COLOR_OPTIONS.map(c => (
                                <button
                                  key={c.key}
                                  title={c.label}
                                  onClick={() => setEditState(s => s && ({ ...s, row_color: c.key }))}
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${c.bg} ${editState.row_color === c.key ? 'border-[#0d1f3c] scale-110 shadow-sm' : c.border}`}
                                >
                                  {editState.row_color === c.key && <Check size={9} className="text-white drop-shadow" strokeWidth={4} />}
                                </button>
                              ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {/* Totals row */}
                    {monthEntries.length > 0 && (
                      <tr className="bg-slate-50 border-t-2 border-slate-300">
                        <td className="px-1 py-3.5" />
                        <td className="px-3 py-3.5">
                          <span className="text-base font-black text-slate-800 tabular-nums">{fmt(totals.sumTotal)}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{monthCount} записей</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className={`text-base font-black tabular-nums ${totals.restoreTotal < 0 ? 'text-rose-500' : 'text-emerald-600'}`}>{fmtSigned(totals.restoreTotal)}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-base font-black text-slate-800 tabular-nums">{fmt(totals.shouldBeTotal)}</span>
                        </td>
                        <td className="px-3 py-3.5">
                          <span className="text-base font-black text-slate-800 tabular-nums">{fmt(totals.mustGiveTotal)}</span>
                        </td>
                        <td className="px-3 py-3.5" colSpan={2} />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {monthEntries.length === 0 && editState === null && (
                <div className="px-4 py-16 text-center">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                    <Calculator size={24} className="text-slate-300" />
                  </div>
                  <p className="text-sm font-semibold text-slate-400">Нет записей</p>
                  <p className="text-xs text-slate-300 mt-1">Нажмите + чтобы добавить первую запись</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FAB */}
        {selectedMonth && !editState && (
          <div className="absolute bottom-20 right-4 z-10 flex flex-col items-end gap-2">
            <button onClick={() => setFabOpen(v => !v)}
              className="w-7 h-7 bg-white border border-slate-200 text-slate-400 rounded-full shadow-sm flex items-center justify-center hover:text-slate-700 hover:border-slate-300 transition-all"
              title={fabOpen ? 'Скрыть кнопку' : 'Показать кнопку'}>
              {fabOpen ? <X size={14} /> : <Plus size={14} />}
            </button>
            {fabOpen && (
              <button onClick={startAdd}
                className="w-12 h-12 bg-[#0d1f3c] text-white rounded-2xl shadow-lg flex items-center justify-center hover:bg-[#18375f] active:scale-95 transition-all">
                <Plus size={20} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit child dialog */}
      {editChildFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditChildFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 mb-1">Изменить линию</h3>
            <p className="text-xs text-slate-400 mb-5">Редактирование под-линии в объединённой строке</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Сумма в наличии</label>
                <input type="number" value={editChildState.sum_amount}
                  onChange={e => setEditChildState(s => ({ ...s, sum_amount: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Должно быть</label>
                <input type="number" value={editChildState.should_be_amount}
                  onChange={e => setEditChildState(s => ({ ...s, should_be_amount: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Детали</label>
                <input type="text" value={editChildState.description}
                  onChange={e => setEditChildState(s => ({ ...s, description: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Описание" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Должны дать</label>
                <input type="number" value={editChildState.must_give_amount}
                  onChange={e => setEditChildState(s => ({ ...s, must_give_amount: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Доп. информация</label>
                <input type="text" value={editChildState.notes}
                  onChange={e => setEditChildState(s => ({ ...s, notes: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Примечание" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setEditChildFor(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                Отмена
              </button>
              <button onClick={confirmEditChild}
                className="px-4 py-2 rounded-xl bg-[#0d1f3c] hover:bg-[#18375f] text-white text-xs font-bold transition-colors shadow-sm">
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add child dialog */}
      {addChildFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setAddChildFor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 mb-1">Добавить линию</h3>
            <p className="text-xs text-slate-400 mb-5">Новая под-линия в объединённой строке</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Сумма в наличии</label>
                <input type="number" value={addChildState.sum_amount}
                  onChange={e => setAddChildState(s => ({ ...s, sum_amount: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Должно быть</label>
                <input type="number" value={addChildState.should_be_amount}
                  onChange={e => setAddChildState(s => ({ ...s, should_be_amount: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Детали</label>
                <input type="text" value={addChildState.description}
                  onChange={e => setAddChildState(s => ({ ...s, description: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Описание" />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Должны дать</label>
                <input type="number" value={addChildState.must_give_amount}
                  onChange={e => setAddChildState(s => ({ ...s, must_give_amount: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="0" />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Доп. информация</label>
                <input type="text" value={addChildState.notes}
                  onChange={e => setAddChildState(s => ({ ...s, notes: e.target.value }))}
                  className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all"
                  placeholder="Примечание" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setAddChildFor(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                Отмена
              </button>
              <button onClick={confirmAddChild}
                className="px-4 py-2 rounded-xl bg-[#0d1f3c] hover:bg-[#18375f] text-white text-xs font-bold transition-colors shadow-sm">
                Добавить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Merge dialog */}
      {mergeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onClick={() => setMergeDialog(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-96 max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-slate-900 mb-1">Объединить строки</h3>
            <p className="text-xs text-slate-400 mb-5">Введите название для объединённой строки</p>
            <input
              type="text"
              value={mergeDialog.name}
              autoFocus
              onChange={e => setMergeDialog(s => s ? { ...s, name: e.target.value } : s)}
              onKeyDown={e => { if (e.key === 'Enter') confirmMerge(); if (e.key === 'Escape') setMergeDialog(null); }}
              className="w-full text-sm px-3 py-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0d1f3c] focus:ring-4 focus:ring-blue-50 transition-all mb-5"
              placeholder="Введите название..."
            />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setMergeDialog(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors">
                Отмена
              </button>
              <button onClick={confirmMerge}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors shadow-sm">
                Объединить
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
