import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Package, X, ChevronRight, Tag, Hash, Globe, Layers, DollarSign, Trash2, Copy, RotateCcw, Filter, Check } from 'lucide-react';
import { supabase, type Product, type NewProduct } from '../lib/supabase';

const EMPTY_FORM: NewProduct = {
  brand: '',
  article: '',
  description: '',
  origin: '',
  uom: 'PCS',
  price: 0,
  price_aed: 0,
  price_usd: 0,
  price_tjs: 0,
};

export default function ProductsPage({ owner, hideDelete }: { owner: string; hideDelete?: boolean }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<NewProduct>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [justCreatedForm, setJustCreatedForm] = useState<NewProduct | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const saveProductRef = useRef<() => void>(() => {});

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => { saveProductRef.current = saveProduct; });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === 'Escape') {
        if (deleteTarget) { setDeleteTarget(null); return; }
        if (showForm) { closeForm(); }
      }
      if (e.key === 'Enter' && showForm && !(e.target as HTMLElement).matches('textarea, select, button')) {
        e.preventDefault();
        saveProductRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showForm, deleteTarget]);

  async function fetchProducts() {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20000);
    if (!error && data) setProducts(data as Product[]);
    setLoading(false);
  }

  async function saveProduct() {
    setSaving(true);
    setFormError('');

    if (selected) {
      const { error } = await supabase
        .from('products')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', selected.id);
      if (error) { setFormError('Ошибка сохранения'); setSaving(false); return; }
      await fetchProducts();
      closeForm();
    } else {
      const { data: inserted, error } = await supabase.from('products').insert([{ ...form }]).select().maybeSingle();
      if (error) { setFormError('Ошибка сохранения'); setSaving(false); return; }
      const savedForm = { ...form };
      await fetchProducts();
      setSearch('');
      closeForm();
      if (inserted) {
        setJustCreatedId((inserted as Product).id);
        setJustCreatedForm(savedForm);
      }
    }

    setSaving(false);
  }

  async function deleteProduct(id: string) {
    await supabase.from('products').delete().eq('id', id);
    await fetchProducts();
    setDeleteTarget(null);
    if (selected?.id === id) closeForm();
    if (justCreatedId === id) {
      setJustCreatedId(null);
      setJustCreatedForm(null);
    }
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setSelected(null);
    setFormError('');
    setJustCreatedId(null);
    setJustCreatedForm(null);
    setShowForm(true);
  }

  function createAgain() {
    if (!justCreatedForm) return;
    setForm({ ...justCreatedForm, article: '' });
    setSelected(null);
    setFormError('');
    setJustCreatedId(null);
    setJustCreatedForm(null);
    setShowForm(true);
  }

  function duplicateProduct(p: Product, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({
      brand: p.brand,
      article: p.article + '-COPY',
      description: p.description,
      origin: p.origin,
      uom: p.uom,
      price: p.price,
      price_aed: p.price_aed,
      price_usd: p.price_usd,
      price_tjs: p.price_tjs,
    });
    setSelected(null);
    setFormError('');
    setJustCreatedId(null);
    setJustCreatedForm(null);
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setForm({
      brand: p.brand,
      article: p.article,
      description: p.description,
      origin: p.origin,
      uom: p.uom,
      price: p.price,
      price_aed: p.price_aed ?? 0,
      price_usd: p.price_usd ?? 0,
      price_tjs: p.price_tjs ?? 0,
    });
    setSelected(p);
    setFormError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setSelected(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  const brands = useMemo(
    () => Array.from(new Set(products.map(p => p.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const brandCounts = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach(p => { if (p.brand) m[p.brand] = (m[p.brand] ?? 0) + 1; });
    return m;
  }, [products]);

  const filteredBrands = useMemo(() => {
    const q = brandSearch.toLowerCase();
    return brands.filter(b => b.toLowerCase().includes(q));
  }, [brands, brandSearch]);

  const groupedBrands = useMemo(() => {
    const groups: Record<string, string[]> = {};
    filteredBrands.forEach(b => {
      const letter = b[0]?.toUpperCase() ?? '#';
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push(b);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredBrands]);

  const filtered = products.filter(p => {
    if (brandFilter.length > 0 && !brandFilter.includes(p.brand)) return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return p.article.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full bg-slate-50 font-pro">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-slate-200 px-5 sm:px-8 pt-6 pb-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d1f3c] text-white shadow-sm">
              <Package size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">Товары</h2>
                <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold tabular-nums text-slate-500">{products.length}</span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
                <span><strong className="text-slate-700">{filtered.length}</strong> показано</span>
                {brands.length > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" /><strong className="text-slate-700">{brands.length}</strong> брендов</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end lg:self-start">
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-xl bg-[#0d1f3c] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#18375f] active:scale-[0.98]"
            >
              <Plus size={14} />Создать товар
            </button>
          </div>
        </div>

        {/* Search + brand filter */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 max-w-xl">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Поиск по артикулу, бренду, описанию..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-10 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#0d1f3c] focus:bg-white focus:ring-4 focus:ring-blue-50"
            />
            {search && <button onClick={() => setSearch('')} aria-label="Очистить поиск" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-800">Очистить</button>}
          </div>

          {brands.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { setBrandSearch(''); setShowBrandPicker(true); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                  brandFilter.length > 0
                    ? 'bg-[#0d1f3c] text-white border-[#0d1f3c]'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}
              >
                <Filter size={13} />
                {brandFilter.length === 0 ? 'Все бренды' : brandFilter.length === 1 ? brandFilter[0] : `${brandFilter.length} бренда`}
                {brandFilter.length > 0 && (
                  <span
                    onClick={(e) => { e.stopPropagation(); setBrandFilter([]); }}
                    className="ml-0.5 -mr-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <X size={10} />
                  </span>
                )}
                {!brandFilter.length && (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">{brands.length}</span>
                )}
              </button>
              {brandFilter.length === 1 && (
                <span className="text-xs text-slate-400">{brandCounts[brandFilter[0]] ?? 0} товаров</span>
              )}
              {brandFilter.length > 1 && (
                <span className="text-xs text-slate-400">{brandFilter.reduce((s, b) => s + (brandCounts[b] ?? 0), 0)} товаров</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-8">
        {loading ? (
          <div className="flex items-center justify-center h-40"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#0d1f3c]" /></div>
        ) : filtered.length === 0 ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-300 shadow-sm"><Package size={23} /></div>
            <p className="text-sm font-bold text-slate-700">{search || brandFilter.length > 0 ? 'Ничего не найдено' : 'Пока нет товаров'}</p>
            {!search && brandFilter.length === 0 && (
              <button onClick={openCreate} className="mt-3 text-sm font-semibold text-[#0d1f3c] underline underline-offset-2 hover:text-[#18375f]">
                Создать первый товар
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-[1240px]">
            <div className="mb-2 hidden grid-cols-[minmax(0,1fr)_140px_220px_24px] items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-sm sm:grid">
              <span>Артикул и описание</span><span>Бренд / COO</span><span className="text-right">Цены</span><span />
            </div>
            <div className="space-y-1.5">
              {filtered.map(p => {
                const isNew = justCreatedId === p.id;
                return (
                  <div key={p.id} className={`group relative rounded-xl border shadow-sm transition-shadow hover:shadow-md ${isNew ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <button
                      onClick={() => openEdit(p)}
                      className={`grid w-full grid-cols-1 items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 sm:grid-cols-[minmax(0,1fr)_140px_220px_24px] sm:gap-4 sm:px-5 ${isNew ? 'pb-12' : 'pr-20'}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-pro text-sm font-extrabold text-slate-900">{p.article || '—'}</span>
                          {isNew && (
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-full tracking-wide">
                              СОЗДАН
                            </span>
                          )}
                        </div>
                        {p.description && (
                          <p className="text-xs text-slate-500 truncate">{p.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap sm:block">
                        {p.brand && <span className="text-xs font-bold text-slate-700 truncate">{p.brand}</span>}
                        {p.origin && <span className="text-[10px] text-slate-400 sm:block">{p.origin}</span>}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap justify-start sm:justify-end">
                        {p.price_aed > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700">
                            {Number(p.price_aed).toLocaleString('en-AE')} <span className="text-[9px] text-slate-400">AED</span>
                          </span>
                        )}
                        {p.price_usd > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700">
                            {Number(p.price_usd).toLocaleString('en-US')} <span className="text-[9px] text-slate-400">USD</span>
                          </span>
                        )}
                        {p.price_tjs > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-slate-700">
                            {Number(p.price_tjs).toLocaleString('ru-TJ')} <span className="text-[9px] text-slate-400">TJS</span>
                          </span>
                        )}
                      </div>

                      {!isNew && (
                        <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 transition-colors group-hover:text-[#0d1f3c] sm:static sm:translate-y-0" />
                      )}
                    </button>

                    {/* "Create again" button — shown only on just-created card */}
                    {isNew && (
                      <button
                        onClick={e => { e.stopPropagation(); createAgain(); }}
                        className="absolute bottom-2.5 left-4 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-white hover:bg-emerald-100 border border-emerald-300 px-2.5 py-1 rounded-lg transition-all shadow-sm"
                      >
                        <RotateCcw size={11} />
                        Создать ещё раз
                      </button>
                    )}

                    {/* Hover actions — hidden for just-created card */}
                    {!isNew && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => duplicateProduct(p, e)}
                          className="p-1.5 rounded-lg text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                          title="Дублировать"
                        >
                          <Copy size={14} />
                        </button>
                        {!hideDelete && (
                          <button
                            onClick={e => { e.stopPropagation(); setDeleteTarget(p); }}
                            className="p-1.5 rounded-lg text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                            title="Удалить"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Brand Picker Modal */}
      {showBrandPicker && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setShowBrandPicker(false)}>
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-slate-600" />
                <h3 className="text-sm font-bold text-slate-900">Выбрать бренд</h3>
              </div>
              <button onClick={() => setShowBrandPicker(false)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200">
              <div className="relative">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={brandSearch}
                  onChange={e => setBrandSearch(e.target.value)}
                  placeholder="Поиск бренда..."
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#0d1f3c] focus:bg-white focus:ring-4 focus:ring-blue-50"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {brandFilter.length > 0 && (
                <button
                  onClick={() => setBrandFilter([])}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 sticky top-0 bg-white z-10"
                >
                  <span className="text-sm font-semibold text-rose-500 flex items-center gap-1.5">
                    <X size={14} /> Снять выделение
                  </span>
                  <span className="text-xs text-slate-400 font-medium">{brandFilter.length} выбрано</span>
                </button>
              )}

              {groupedBrands.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">Бренд не найден</div>
              ) : (
                groupedBrands.map(([letter, groupBrands]) => (
                  <div key={letter}>
                    <div className="px-5 py-1.5 text-[10px] font-bold text-slate-300 uppercase tracking-widest bg-slate-50 sticky top-0">{letter}</div>
                    {groupBrands.map(b => {
                      const checked = brandFilter.includes(b);
                      return (
                        <button
                          key={b}
                          onClick={() => setBrandFilter(prev => prev.includes(b) ? prev.filter(x => x !== b) : [...prev, b])}
                          className={`w-full flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors ${checked ? 'bg-slate-50' : ''}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${checked ? 'bg-[#0d1f3c] border-[#0d1f3c]' : 'border-slate-300'}`}>
                              {checked && <Check size={11} className="text-white" />}
                            </span>
                            <span className={`text-sm truncate ${checked ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{b}</span>
                          </div>
                          <span className="text-xs text-slate-400 font-medium flex-shrink-0 ml-2">{brandCounts[b] ?? 0}</span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Slide-up Form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-sm" onClick={closeForm}>
          <div
            className="bg-white rounded-t-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-200 sticky top-0 bg-white z-10">
              <h3 className="text-base font-bold text-slate-900">
                {selected ? 'Редактировать товар' : 'Новый товар'}
              </h3>
              <button onClick={closeForm} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
                <X size={20} className="text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <Field icon={<Hash size={14} />} label="Part Number">
                <input
                  type="text"
                  value={form.article}
                  onChange={e => setForm(f => ({ ...f, article: e.target.value }))}
                  placeholder="SKU-001"
                  className={inputCls}
                />
                {!selected && form.article.trim() && products.some(p => p.article.toLowerCase() === form.article.trim().toLowerCase()) && (
                  <p className="mt-1.5 text-[11px] text-amber-600 flex items-center gap-1">
                    <span className="font-bold">!</span> Такой артикул уже есть — будет создан дубликат
                  </p>
                )}
              </Field>

              <Field icon={<Tag size={14} />} label="Brand">
                <input
                  type="text"
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="Например, Samsung"
                  className={inputCls}
                />
              </Field>

              <Field icon={<Layers size={14} />} label="Description">
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Краткое описание товара"
                  rows={3}
                  className={inputCls + ' resize-none'}
                />
              </Field>

              <Field icon={<Globe size={14} />} label="COO">
                <input
                  type="text"
                  value={form.origin}
                  onChange={e => setForm(f => ({ ...f, origin: e.target.value }))}
                  placeholder="Китай, Россия..."
                  className={inputCls}
                />
              </Field>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  UOM
                </label>
                <div className="flex gap-3">
                  {(['PCS', 'CTN', 'SET'] as const).map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, uom: u }))}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                        form.uom === u
                          ? 'bg-[#0d1f3c] text-white border-[#0d1f3c]'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  <DollarSign size={14} className="text-slate-400" />
                  Цены
                </label>
                <div className="space-y-2">
                  {(
                    [
                      { key: 'price_aed', label: 'AED', placeholder: '0.00' },
                      { key: 'price_usd', label: 'USD', placeholder: '0.00' },
                      { key: 'price_tjs', label: 'TJS', placeholder: '0.00' },
                    ] as const
                  ).map(({ key, label, placeholder }) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="w-12 text-xs font-bold text-slate-500 text-right flex-shrink-0">{label}</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={(form as Record<string, unknown>)[key] === 0 ? '' : (form as Record<string, unknown>)[key] as number}
                        onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
                        placeholder={placeholder}
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-rose-600 text-xs bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">{formError}</p>
              )}

              <div className="flex gap-3 pt-1 pb-2">
                <button
                  onClick={saveProduct}
                  disabled={saving}
                  className="flex-1 py-3 bg-[#0d1f3c] text-white text-sm font-bold rounded-xl hover:bg-[#18375f] active:opacity-75 transition-all disabled:opacity-60"
                >
                  {saving ? 'Сохранение...' : selected ? 'Сохранить' : 'Создать товар'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={18} className="text-rose-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Удалить товар?</h3>
                <p className="text-xs text-slate-500 mt-0.5">«{deleteTarget.article}» будет удалён без возможности восстановления.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Отмена
              </button>
              <button onClick={() => deleteProduct(deleteTarget.id)}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-sm font-semibold text-white hover:bg-rose-600 transition-colors">
                Удалить
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-50 focus:border-[#0d1f3c] focus:bg-white transition-all';

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
        <span className="text-slate-400">{icon}</span>
        {label}
      </label>
      {children}
    </div>
  );
}
