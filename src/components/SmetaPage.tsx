import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Plus, FileText, ChevronRight, Trash2, Search, Trash, RotateCcw, Copy,
  ChevronUp, ChevronDown, AlertTriangle, Layers, Calendar,
  Wallet, FileStack, ArrowLeft, type LucideIcon,
} from 'lucide-react';
import { supabase, type Proforma, type ProformaItem } from '../lib/supabase';
import ProformaForm from './ProformaForm';

type View = 'list' | 'form' | 'trash';

interface Props {
  onConfirmed: () => void;
  owner: string;
}

const currencySymbol: Record<string, string> = { USD: '$', EUR: '€', RUB: '₽', UZS: "so'm" };

export default function SmetaPage({ onConfirmed, owner }: Props) {
  const [view, setView] = useState<View>('list');
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [trashedProformas, setTrashedProformas] = useState<Proforma[]>([]);
  const [editing, setEditing] = useState<Proforma | undefined>();
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearTrashConfirm, setClearTrashConfirm] = useState(false);
  const [clearingTrash, setClearingTrash] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (view === 'list') void fetchProformas();
  }, [view]);

  useEffect(() => {
    if (view !== 'list') return;
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view]);

  async function fetchProformas() {
    setLoading(true);
    const { data } = await supabase
      .from('proformas')
      .select('*')
      .eq('confirmed', false)
      .eq('owner', owner)
      .is('merged_into', null)
      .order('sort_order')
      .order('created_at', { ascending: false });
    if (data) {
      const all = data as Proforma[];
      setProformas(all.filter(p => !p.trashed));
      setTrashedProformas(all.filter(p => p.trashed));
    }
    setLoading(false);
  }

  async function trashProforma(id: string) {
    await supabase.from('proformas').update({ trashed: true }).eq('id', id);
    const p = proformas.find(x => x.id === id);
    setProformas(prev => prev.filter(x => x.id !== id));
    if (p) setTrashedProformas(prev => [{ ...p, trashed: true }, ...prev]);
    setDeletingId(null);
  }

  async function restoreProforma(id: string) {
    await supabase.from('proformas').update({ trashed: false }).eq('id', id);
    const p = trashedProformas.find(x => x.id === id);
    setTrashedProformas(prev => prev.filter(x => x.id !== id));
    if (p) setProformas(prev => [{ ...p, trashed: false }, ...prev]);
  }

  async function permanentDeleteProforma(id: string) {
    await supabase.from('proforma_items').delete().eq('proforma_id', id);
    await supabase.from('proformas').delete().eq('id', id);
    setTrashedProformas(prev => prev.filter(x => x.id !== id));
  }

  async function clearAllTrash() {
    setClearingTrash(true);
    for (const p of trashedProformas) {
      await supabase.from('proforma_items').delete().eq('proforma_id', p.id);
      await supabase.from('proformas').delete().eq('id', p.id);
    }
    setTrashedProformas([]);
    setClearingTrash(false);
    setClearTrashConfirm(false);
  }

  function openCreate() {
    setEditing(undefined);
    setView('form');
  }

  async function moveProforma(p: Proforma, dir: 'up' | 'down') {
    const list = proformas;
    const idx = list.findIndex(x => x.id === p.id);
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= list.length) return;
    const newList = [...list];
    [newList[idx], newList[targetIdx]] = [newList[targetIdx], newList[idx]];
    setProformas(newList);
    for (let i = 0; i < newList.length; i++) {
      await supabase.from('proformas').update({ sort_order: i }).eq('id', newList[i].id);
    }
  }

  function openEdit(p: Proforma) {
    setEditing(p);
    setView('form');
  }

  async function duplicateProforma(p: Proforma, e: React.MouseEvent) {
    e.stopPropagation();
    const baseNumber = p.number.replace(/\/\d+$/, '');
    const { data: existing } = await supabase
      .from('proformas').select('number').like('number', `${baseNumber}/%`);
    let maxN = 1;
    for (const x of (existing ?? [])) {
      const match = (x as { number: string }).number.match(/\/(\d+)$/);
      if (match) maxN = Math.max(maxN, parseInt(match[1]));
    }
    const newNumber = `${baseNumber}/${maxN + 1}`;
    const { data: newP } = await supabase.from('proformas').insert([{
      number: newNumber,
      client: p.client,
      client_code: p.client_code,
      currency: p.currency,
      discount_percent: p.discount_percent,
      discount_mode: p.discount_mode,
      discount_fixed: p.discount_fixed,
      tax_percent: p.tax_percent,
      purchase_tax_global: p.purchase_tax_global,
      total_amount: p.total_amount,
      notes: p.notes,
      confirmed: false,
      extra_delivery_cost: p.extra_delivery_cost,
      extra_delivery_label: p.extra_delivery_label,
      delivery_location: p.delivery_location,
      paid: false, delivered: false, archived: false, trashed: false,
      owner,
    }]).select().maybeSingle();
    if (newP) {
      const { data: srcItems } = await supabase.from('proforma_items').select('*').eq('proforma_id', p.id).order('sort_order');
      if (srcItems && srcItems.length > 0) {
        const newItems = (srcItems as ProformaItem[]).map(({ id: _id, proforma_id: _pid, created_at: _ca, ...rest }) => ({
          ...rest,
          proforma_id: (newP as Proforma).id,
        }));
        await supabase.from('proforma_items').insert(newItems);
      }
      setProformas(prev => [newP as Proforma, ...prev]);
      setEditing(newP as Proforma);
      setView('form');
    }
  }

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtDate = (p: Proforma) =>
    new Date(p.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const fmtRelative = (p: Proforma) => {
    const diff = Date.now() - new Date(p.created_at).getTime();
    const days = Math.floor(diff / 86_400_000);
    if (days === 0) return 'сегодня';
    if (days === 1) return 'вчера';
    if (days < 7) return `${days} дн назад`;
    return fmtDate(p);
  };

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return proformas;
    return proformas.filter(p =>
      p.number.toLowerCase().includes(q) ||
      (p.client_code ?? '').toLowerCase().includes(q)
    );
  }, [proformas, searchQ]);

  const totalValue = useMemo(() => proformas.reduce((sum, p) => sum + (p.total_amount ?? 0), 0), [proformas]);


  const stats = [
    { label: 'Всего смет', value: String(proformas.length), icon: FileStack, accent: 'text-zinc-900', bg: 'bg-zinc-100', ring: 'ring-zinc-200' },
    { label: 'Общая сумма', value: fmt(totalValue), icon: Wallet, accent: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  ];

  return (
    <>
      <div className="flex h-full flex-col bg-zinc-50 font-pro">
        {/* Header */}
        <header className="shrink-0 border-b border-zinc-200/70 bg-white/70 px-6 pt-6 pb-4 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            {view === 'trash' ? (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setView('list')}
                  className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 transition-colors hover:text-zinc-900"
                >
                  <ArrowLeft size={16} />
                  Смета
                </button>
                <div className="h-5 w-px bg-zinc-200" />
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100">
                  <Trash size={17} className="text-zinc-500" />
                </div>
                <h1 className="text-xl font-extrabold tracking-tight text-zinc-900">Корзина</h1>
                {trashedProformas.length > 0 && (
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-500">
                    {trashedProformas.length}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-600 shadow-sm">
                  <Layers size={19} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-zinc-900">Смета</h1>
                  <p className="text-[11px] font-medium text-zinc-400">Проформы и расчёты</p>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              {view === 'trash' && trashedProformas.length > 0 && (
                <button
                  onClick={() => setClearTrashConfirm(true)}
                  disabled={clearingTrash}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-600 transition-all hover:bg-red-100 disabled:opacity-50"
                >
                  {clearingTrash
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-red-300 border-t-red-500" />
                    : <AlertTriangle size={13} />}
                  Очистить всё
                </button>
              )}
              {view !== 'trash' && (
                <>
                  <button
                    onClick={() => setView('trash')}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  >
                    <Trash size={15} />
                    {trashedProformas.length > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-500">
                        {trashedProformas.length}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={openCreate}
                    className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-95"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    Создать
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Stats strip — only on list view */}
          {view !== 'trash' && proformas.length > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {stats.map(s => {
                const Icon = s.icon;
                return (
                  <div
                    key={s.label}
                    className={`flex items-center gap-3 rounded-2xl bg-white px-3.5 py-3 ring-1 ${s.ring} transition-all hover:shadow-sm`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${s.bg}`}>
                      <Icon size={16} className={s.accent} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold uppercase tracking-widest text-zinc-400">{s.label}</p>
                      <p className="truncate text-sm font-extrabold tabular-nums text-zinc-900">{s.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </header>

        {/* Search */}
        {view !== 'trash' && (
          <div className="shrink-0 px-6 py-3">
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                ref={searchRef}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Поиск по номеру или коду клиента…"
                className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-9 text-sm text-zinc-800 placeholder-zinc-400 transition-all focus:border-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
              {searchQ && (
                <button
                  onClick={() => setSearchQ('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          {view === 'trash' ? (
            trashedProformas.length === 0 ? (
              <EmptyState icon={Trash} title="Корзина пуста" hint="Удалённые сметы появятся здесь" />
            ) : (
              <div className="space-y-2.5">
                {trashedProformas.map(p => (
                  <div
                    key={p.id}
                    className="group rounded-2xl border border-zinc-200 bg-white px-5 py-4 transition-all hover:border-zinc-300 hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2.5">
                          {p.client_code && (
                            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 font-pro text-base font-extrabold tracking-widest text-zinc-700">
                              {p.client_code}
                            </span>
                          )}
                          <span className="font-pro text-xs font-semibold tracking-wide text-zinc-500">{p.number}</span>
                          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-bold tracking-widest text-zinc-500">
                            {p.currency}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => restoreProforma(p.id)}
                          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
                        >
                          <RotateCcw size={12} />Восстановить
                        </button>
                        <button
                          onClick={() => { if (confirm(`Удалить «${p.number}» навсегда? Это действие необратимо.`)) permanentDeleteProforma(p.id); }}
                          className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-500 transition-all hover:bg-red-50"
                        >
                          <Trash2 size={12} />Навсегда
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" />
            </div>
          ) : proformas.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Нет смет"
              hint="Создайте первую проформу, чтобы начать"
              action={
                <button
                  onClick={openCreate}
                  className="flex items-center gap-1.5 rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 transition-all hover:bg-zinc-200"
                >
                  <Plus size={14} />Создать смету
                </button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState icon={Search} title="Ничего не найдено" hint="Попробуйте изменить запрос" />
          ) : (
            <div className="space-y-1.5">
              {filtered.map(p => {
                const originalIdx = proformas.findIndex(x => x.id === p.id);
                const sym = currencySymbol[p.currency] ?? p.currency;
                return (
                  <button
                    key={p.id}
                    onClick={() => openEdit(p)}
                    style={{ animation: `fadeIn 0.3s ease ${Math.min(originalIdx * 25, 300)}ms both` }}
                    className="group relative w-full overflow-hidden rounded-xl border border-zinc-200 bg-white px-4 py-2 text-left transition-all hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-200/60"
                  >
                    {/* Accent bar */}
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-gradient-to-b from-zinc-800 to-zinc-500 transition-colors group-hover:from-zinc-700 group-hover:to-zinc-400" />

                    <div className="flex items-center justify-between gap-4 pl-1.5">
                      <div className="min-w-0 flex-1">
                        {/* Number + currency */}
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-zinc-100 text-[10px] font-bold tabular-nums text-zinc-500">
                            {originalIdx + 1}
                          </span>
                          {p.client_code && (
                            <span className="font-pro text-sm font-extrabold tracking-widest text-zinc-900">{p.client_code}</span>
                          )}
                          <span className="font-pro text-xs font-semibold tracking-wide text-zinc-500">{p.number}</span>
                          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-zinc-500">
                            {p.currency}
                          </span>
                          {p.merged_from && p.merged_from.length > 0 && (
                            <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-violet-600 ring-1 ring-violet-200">
                              объединено
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-400">
                            <Calendar size={10} />
                            {fmtRelative(p)}
                          </span>
                          {(p.deposit_amount ?? 0) > 0 && (
                            <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                              Депозит {fmt(p.deposit_amount)} {sym}
                            </span>
                          )}
                          {p.discount_percent > 0 && (
                            <span className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                              −{p.discount_percent}%
                            </span>
                          )}
                          {p.tax_percent > 0 && (
                            <span className="rounded-md border border-amber-100 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                              НДС {p.tax_percent}%
                            </span>
                          )}
                          {p.delivery_location && (
                            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">
                              {p.delivery_location}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: amount + actions */}
                      <div className="flex shrink-0 items-center gap-2">
                        {p.total_amount > 0 && (
                          <div className="text-right">
                            <div className="font-pro text-sm font-bold tabular-nums text-zinc-900">
                              {fmt(p.total_amount)}
                              <span className="ml-1 text-[10px] font-semibold text-zinc-400">{sym}</span>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <div className="flex flex-col opacity-0 transition-all group-hover:opacity-100">
                            <button
                              onClick={e => { e.stopPropagation(); void moveProforma(p, 'up'); }}
                              className="rounded p-0.5 text-zinc-300 transition-all hover:bg-zinc-100 hover:text-zinc-700"
                              title="Вверх"
                            >
                              <ChevronUp size={12} />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); void moveProforma(p, 'down'); }}
                              className="rounded p-0.5 text-zinc-300 transition-all hover:bg-zinc-100 hover:text-zinc-700"
                              title="Вниз"
                            >
                              <ChevronDown size={12} />
                            </button>
                          </div>
                          <button
                            onClick={e => duplicateProforma(p, e)}
                            className="rounded-lg p-1 text-zinc-300 opacity-0 transition-all hover:bg-blue-50 hover:text-blue-500 group-hover:opacity-100"
                            title="Дублировать"
                          >
                            <Copy size={13} />
                          </button>
                          {!p.confirmed && (
                            <button
                              onClick={e => { e.stopPropagation(); setDeletingId(p.id); }}
                              className="rounded-lg p-1 text-zinc-300 opacity-0 transition-all hover:bg-red-50 hover:text-red-400 group-hover:opacity-100"
                              title="В корзину"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                          <ChevronRight size={14} className="shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-600" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {view === 'form' && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <ProformaForm
            proforma={editing}
            onBack={() => setView('list')}
            onSaved={() => setView('list')}
            onConfirmed={() => { setView('list'); onConfirmed(); }}
            owner={owner}
          />
        </div>,
        document.body,
      )}

      {clearTrashConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" style={{ animation: 'fadeIn 0.2s ease both' }}>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900">Очистить корзину?</h3>
                <p className="mt-0.5 text-xs text-zinc-500">Все {trashedProformas.length} смет будут удалены навсегда.</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setClearTrashConfirm(false)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Отмена
              </button>
              <button
                onClick={() => void clearAllTrash()}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-95"
              >
                Удалить всё
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {deletingId && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl" style={{ animation: 'fadeIn 0.2s ease both' }}>
            <h3 className="mb-1 text-sm font-bold text-zinc-900">Переместить в корзину?</h3>
            <p className="mb-4 text-xs text-zinc-500">
              «{proformas.find(p => p.id === deletingId)?.number}» будет перемещена в корзину. Удалить навсегда можно из раздела Корзина.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Отмена
              </button>
              <button
                onClick={() => void trashProforma(deletingId)}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white transition-all hover:bg-red-600 active:scale-95"
              >
                В корзину
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-48 flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
        <Icon size={28} className="text-zinc-300" />
      </div>
      <p className="text-sm font-semibold text-zinc-500">{title}</p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
