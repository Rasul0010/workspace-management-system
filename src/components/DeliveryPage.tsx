import { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, Users, ChevronDown, ChevronUp, Calendar, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { supabase, type Proforma, type ProformaItem } from '../lib/supabase';
import { calcProfit, monthKey, monthLabel, type ProformaWithItems } from '../lib/profit';

interface ExtraProfit {
  id: string;
  month: string;
  description: string;
  amount: number;
  currency: string;
  created_at: string;
}

interface MonthlyTotals {
  revenue: number;
  cost: number;
  profit: number;
  extraProfit: number;
  count: number;
  proformas: ProformaWithItems[];
}

function fmt(n: number, currency = '') {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ' ' + currency : '');
}

function monthShort(key: string) {
  return key.split('-').reverse().join('.');
}

function buildMonthlyTotals(proformas: ProformaWithItems[]): Record<string, MonthlyTotals> {
  const map: Record<string, MonthlyTotals> = {};
  for (const p of proformas) {
    const key = monthKey(p.confirmed_at ?? p.created_at);
    if (!map[key]) map[key] = { revenue: 0, cost: 0, profit: 0, extraProfit: 0, count: 0, proformas: [] };
    const { revenue, cost, profit } = calcProfit(p);
    map[key].revenue += revenue;
    map[key].cost += cost;
    map[key].profit += profit;
    map[key].count++;
    map[key].proformas.push(p);
  }
  return map;
}

function buildClientData(proformas: ProformaWithItems[]) {
  const map: Record<string, { revenue: number; cost: number; profit: number; count: number; proformas: ProformaWithItems[] }> = {};
  for (const p of proformas) {
    const key = p.client_code || 'Без кода';
    if (!map[key]) map[key] = { revenue: 0, cost: 0, profit: 0, count: 0, proformas: [] };
    const { revenue, cost, profit } = calcProfit(p);
    map[key].revenue += revenue;
    map[key].cost += cost;
    map[key].profit += profit;
    map[key].count++;
    map[key].proformas.push(p);
  }
  return Object.entries(map).sort(([, a], [, b]) => b.profit - a.profit);
}

export default function DeliveryPage({ owner }: { owner: string }) {
  const [proformas, setProformas] = useState<ProformaWithItems[]>([]);
  const [astProformas, setAstProformas] = useState<ProformaWithItems[]>([]);
  const [extraProfits, setExtraProfits] = useState<ExtraProfit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showExtraForm, setShowExtraForm] = useState(false);
  const [extraDesc, setExtraDesc] = useState('');
  const [extraAmt, setExtraAmt] = useState('');
  const [savingExtra, setSavingExtra] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [proformaRes, extraRes, astRes] = await Promise.all([
      supabase.from('proformas').select('*').eq('confirmed', true).eq('paid', true).eq('trashed', false).eq('owner', owner).order('confirmed_at', { ascending: false }),
      supabase.from('extra_profits').select('*').eq('owner', owner).order('created_at', { ascending: false }),
      supabase.from('proformas').select('*').eq('confirmed', true).eq('paid', true).eq('trashed', false).eq('owner', 'assistant').order('confirmed_at', { ascending: false }),
    ]);

    const pData = proformaRes.data as Proforma[] | null;
    if (!pData) { setLoading(false); return; }

    const ids = pData.map(p => p.id);
    let itemsByProforma: Record<string, ProformaItem[]> = {};
    if (ids.length > 0) {
      const { data: iData } = await supabase.from('proforma_items').select('*').eq('owner', owner).in('proforma_id', ids);
      if (iData) {
        for (const item of iData as ProformaItem[]) {
          if (!itemsByProforma[item.proforma_id]) itemsByProforma[item.proforma_id] = [];
          itemsByProforma[item.proforma_id].push(item);
        }
      }
    }

    const result = pData.map(p => ({ ...p, items: itemsByProforma[p.id] ?? [] }));
    setProformas(result);
    setExtraProfits((extraRes.data as ExtraProfit[]) ?? []);

    const astData = (astRes.data as Proforma[]) ?? [];
    if (astData.length > 0) {
      const astIds = astData.map(p => p.id);
      const { data: astItems } = await supabase.from('proforma_items').select('*').eq('owner', 'assistant').in('proforma_id', astIds);
      const astItemsMap: Record<string, ProformaItem[]> = {};
      for (const item of (astItems as ProformaItem[]) ?? []) {
        if (!astItemsMap[item.proforma_id]) astItemsMap[item.proforma_id] = [];
        astItemsMap[item.proforma_id].push(item);
      }
      setAstProformas(astData.map(p => ({ ...p, items: astItemsMap[p.id] ?? [] })));
    } else {
      setAstProformas([]);
    }

    const now = monthKey(new Date().toISOString());
    const months = [...new Set(result.map(p => monthKey(p.confirmed_at ?? p.created_at)))].sort((a, b) => b.localeCompare(a));
    setSelectedMonth(months.includes(now) ? now : (months[0] ?? null));
    setLoading(false);
  }

  async function saveExtraProfit() {
    if (!selectedMonth || !extraDesc.trim() || !extraAmt) return;
    const amt = parseFloat(extraAmt.replace(',', '.'));
    if (isNaN(amt)) return;
    setSavingExtra(true);
    const currency = proformas[0]?.currency ?? 'AED';
    const { data, error } = await supabase.from('extra_profits').insert({
      month: selectedMonth,
      description: extraDesc.trim(),
      amount: amt,
      currency,
      owner,
    }).select().single();
    if (!error && data) {
      setExtraProfits(prev => [data as ExtraProfit, ...prev]);
    }
    setExtraDesc('');
    setExtraAmt('');
    setShowExtraForm(false);
    setSavingExtra(false);
  }

  async function deleteExtraProfit(id: string) {
    await supabase.from('extra_profits').delete().eq('id', id);
    setExtraProfits(prev => prev.filter(e => e.id !== id));
  }

  // ── Admin (mine) computed ──
  const allMonths = useMemo(() => {
    const keys = new Set<string>();
    for (const p of proformas) keys.add(monthKey(p.confirmed_at ?? p.created_at));
    for (const p of astProformas) keys.add(monthKey(p.confirmed_at ?? p.created_at));
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [proformas, astProformas]);

  const astMonthlyTotals = useMemo(() => buildMonthlyTotals(astProformas), [astProformas]);

  const monthlyTotals = useMemo(() => {
    const map = buildMonthlyTotals(proformas);
    for (const e of extraProfits) {
      if (map[e.month]) map[e.month].extraProfit += e.amount;
    }
    for (const key of Object.keys(astMonthlyTotals)) {
      if (map[key]) {
        map[key].extraProfit += astMonthlyTotals[key].profit;
      }
    }
    return map;
  }, [proformas, extraProfits, astMonthlyTotals]);

  const selectedExtras = useMemo(() =>
    selectedMonth ? extraProfits.filter(e => e.month === selectedMonth) : [],
    [extraProfits, selectedMonth]
  );

  const selected = selectedMonth ? (monthlyTotals[selectedMonth] ?? null) : null;
  const currency = proformas[0]?.currency ?? 'AED';
  const selectedAstProformas = useMemo(() =>
    selectedMonth ? astProformas.filter(p => monthKey(p.confirmed_at ?? p.created_at) === selectedMonth) : [],
    [astProformas, selectedMonth]
  );
  const selectedAstProfit = selectedAstProformas.reduce((s, p) => s + calcProfit(p).profit, 0);
  const maxProfit = Math.max(...allMonths.map(k => Math.abs((monthlyTotals[k]?.profit ?? 0) + (monthlyTotals[k]?.extraProfit ?? 0))), 1);

  const clientData = useMemo(() => {
    if (!selected) return [];
    return buildClientData(selected.proformas);
  }, [selected]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
    </div>
  );

  if (proformas.length === 0) return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <p className="text-sm text-zinc-400">Нет подтверждённых счетов</p>
    </div>
  );

  const totalProfit = selected ? selected.profit + selected.extraProfit : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-100">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <h1 className="text-base font-bold text-zinc-900">Бухгалтерия</h1>
          {proformas.length > 0 && (
            <span className="text-xs font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">{proformas.length}</span>
          )}
        </div>

        {/* Month scroll picker */}
        <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          {allMonths.map(key => {
            const d = monthlyTotals[key];
            const isSelected = selectedMonth === key;
            const total = (d?.profit ?? 0) + (d?.extraProfit ?? 0);
            return (
              <button key={key} onClick={() => { setSelectedMonth(key); setExpandedClient(null); setShowExtraForm(false); }}
                className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition-all ${
                  isSelected ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-300 text-zinc-600 hover:border-zinc-500'
                }`}
                style={{ minWidth: 68 }}
              >
                <span className={`text-[11px] font-bold tabular-nums ${isSelected ? 'text-white' : 'text-zinc-700'}`}>
                  {monthShort(key)}
                </span>
                <span className={`text-[9px] font-semibold mt-0.5 tabular-nums ${
                  isSelected ? (total >= 0 ? 'text-emerald-300' : 'text-red-300') :
                  (total >= 0 ? 'text-emerald-500' : 'text-red-400')
                }`}>
                  {total >= 0 ? '+' : ''}{(total / 1000).toFixed(1)}k
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {selected && selectedMonth && (
          <>
            {/* ── My (admin) sections ── */}
            <div className="mx-3 mt-3 bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-200 bg-zinc-50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-900 tabular-nums">{monthLabel(selectedMonth)}</span>
                  <span className="text-[10px] text-zinc-500 bg-zinc-200 px-2 py-0.5 rounded-full font-bold">{selected.count} счетов</span>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-zinc-200">
                <KpiBox label="Оборот" value={fmt(selected.revenue)} currency={currency} color="blue" icon={<DollarSign size={12} />} />
                <KpiBox label="Закупка" value={fmt(selected.cost)} currency={currency} color="red" icon={<ShoppingCart size={12} />} />
                <KpiBox label="Прибыль" value={fmt(totalProfit)} currency={currency}
                  sub={selected.revenue > 0 ? `${(totalProfit / selected.revenue * 100).toFixed(1)}%` : undefined}
                  color={totalProfit >= 0 ? 'green' : 'red'} icon={<TrendingUp size={12} />} />
              </div>
            </div>

            {/* Extra Profit Section */}
            <div className="mt-3 mx-3 rounded-xl bg-white border border-zinc-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-400"><TrendingUp size={13} /></span>
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Дополнительная прибыль</span>
                  {selected.extraProfit > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full tabular-nums">
                      +{fmt(selected.extraProfit)} {currency}
                    </span>
                  )}
                </div>
                <button onClick={() => setShowExtraForm(v => !v)}
                  className="w-6 h-6 rounded-lg bg-zinc-900 text-white flex items-center justify-center hover:bg-zinc-700 transition-colors flex-shrink-0">
                  {showExtraForm ? <X size={12} /> : <Plus size={12} />}
                </button>
              </div>

              {showExtraForm && (
                <div className="px-4 py-3 border-b border-zinc-200 bg-emerald-50/40 space-y-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Сумма происхождения</label>
                    <input
                      type="text"
                      value={extraDesc}
                      onChange={e => setExtraDesc(e.target.value)}
                      placeholder="Например: Продажа оборудования"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">Сумма ({currency})</label>
                    <input
                      type="number"
                      value={extraAmt}
                      onChange={e => setExtraAmt(e.target.value)}
                      placeholder="0.00"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-zinc-200 bg-white outline-none focus:border-zinc-500 transition-colors"
                    />
                  </div>
                  <button
                    onClick={saveExtraProfit}
                    disabled={savingExtra || !extraDesc.trim() || !extraAmt}
                    className="w-full bg-zinc-900 text-white text-xs font-bold py-2 rounded-lg hover:bg-zinc-800 disabled:opacity-40 transition-all"
                  >
                    {savingExtra ? 'Сохранение...' : 'Добавить'}
                  </button>
                </div>
              )}

              {selectedExtras.length === 0 && selectedAstProformas.length === 0 && !showExtraForm ? (
                <div className="px-4 py-3 text-center text-[11px] text-zinc-400">Нет записей</div>
              ) : (
                <div>
                  {selectedAstProformas.map(p => {
                    const { profit } = calcProfit(p);
                    return (
                      <div key={`ast-${p.id}`} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 last:border-0 bg-blue-50/30">
                        <div className="flex items-center gap-2 min-w-0 mr-3">
                          <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded flex-shrink-0">АСТ</span>
                          <span className="text-xs text-zinc-600 font-medium truncate">От ассистента · {p.number}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-600 tabular-nums flex-shrink-0">
                          {profit >= 0 ? '+' : ''}{fmt(profit)} {p.currency}
                        </span>
                      </div>
                    );
                  })}
                  {selectedExtras.map(e => (
                    <div key={e.id} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 last:border-0">
                      <span className="text-xs text-zinc-600 font-medium truncate mr-3">{e.description}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-bold text-emerald-600 tabular-nums">+{fmt(e.amount)} {e.currency}</span>
                        <button onClick={() => deleteExtraProfit(e.id)}
                          className="w-5 h-5 flex items-center justify-center rounded text-zinc-300 hover:text-red-500 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Per-client breakdown */}
            {clientData.length > 0 && (
              <Section title="По клиентам" icon={<Users size={13} />}>
                {clientData.map(([name, d]) => (
                  <div key={name} className="border-b border-zinc-200 last:border-0">
                    <button
                      onClick={() => setExpandedClient(expandedClient === name ? null : name)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0">
                        {expandedClient === name ? <ChevronUp size={12} className="text-zinc-400 flex-shrink-0" /> : <ChevronDown size={12} className="text-zinc-400 flex-shrink-0" />}
                        <span className="text-xs font-semibold text-zinc-700 truncate">{name}</span>
                        <span className="text-[10px] text-zinc-500 bg-zinc-200 px-1.5 py-0.5 rounded-full flex-shrink-0 font-bold">{d.count}</span>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <div className={`text-xs font-bold tabular-nums ${d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {d.profit >= 0 ? '+' : ''}{fmt(d.profit)} {currency}
                        </div>
                        <div className="text-[10px] text-zinc-400 tabular-nums">{fmt(d.revenue)} {currency}</div>
                      </div>
                    </button>
                    {expandedClient === name && (
                      <div className="bg-zinc-50 border-t border-zinc-200 px-4 py-3 space-y-2">
                        <BRow label="Оборот" value={fmt(d.revenue)} currency={currency} color="text-blue-600" />
                        <BRow label="Закупка" value={fmt(d.cost)} currency={currency} color="text-red-500" />
                        <div className="border-t border-zinc-300 pt-2">
                          <BRow label="Прибыль" value={fmt(d.profit)} currency={currency}
                            color={d.profit >= 0 ? 'text-emerald-600' : 'text-red-500'} bold
                            sub={d.revenue > 0 ? `${(d.profit / d.revenue * 100).toFixed(1)}%` : undefined} />
                        </div>
                        <div className="border-t border-dashed border-zinc-300 pt-2 space-y-1.5">
                          {d.proformas.map(p => {
                            const { profit } = calcProfit(p);
                            return (
                              <div key={p.id} className="flex justify-between items-center">
                                <span className="text-[10px] text-zinc-500 font-calibri font-medium">{p.number}</span>
                                <span className={`text-[10px] font-bold tabular-nums ${profit >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                                  {profit >= 0 ? '+' : ''}{fmt(profit)} {p.currency}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {/* All months comparison */}
            <Section title="Сравнение месяцев" icon={<Calendar size={13} />}>
              {allMonths.map((key, idx) => {
                const d = monthlyTotals[key];
                const total = (d?.profit ?? 0) + (d?.extraProfit ?? 0);
                const isThis = key === selectedMonth;
                const barW = Math.abs(total) / maxProfit * 100;
                const prevKey = allMonths[idx + 1];
                const prev = prevKey ? monthlyTotals[prevKey] : null;
                const prevTotal = prev ? prev.profit + prev.extraProfit : null;
                const delta = prevTotal !== null ? total - prevTotal : null;
                return (
                  <button key={key} onClick={() => { setSelectedMonth(key); setExpandedClient(null); setShowExtraForm(false); scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' }); }}
                    className={`w-full px-4 py-3 transition-colors border-b border-zinc-200 last:border-0 ${isThis ? 'bg-zinc-50' : 'hover:bg-zinc-50/60'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isThis && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 flex-shrink-0" />}
                        <span className={`text-xs tabular-nums ${isThis ? 'font-bold text-zinc-900' : 'font-semibold text-zinc-600'}`}>{monthLabel(key)}</span>
                        <span className="text-[10px] text-zinc-400">{d.count} сч.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {delta !== null && (
                          <span className={`text-[9px] font-semibold flex items-center gap-0.5 ${delta >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>
                            {delta >= 0 ? <ChevronRight size={9} className="rotate-[-90deg]" /> : <ChevronRight size={9} className="rotate-90" />}
                            {fmt(Math.abs(delta))}
                          </span>
                        )}
                        <span className={`text-xs font-bold tabular-nums ${total >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {total >= 0 ? '+' : ''}{fmt(total)} {currency}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${total >= 0 ? 'bg-emerald-500' : 'bg-red-400'}`}
                        style={{ width: `${barW}%` }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-zinc-400 mt-1.5">
                      <span>Оборот: {fmt(d.revenue)}</span>
                      <span>Зак.: {fmt(d.cost)}</span>
                    </div>
                  </button>
                );
              })}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function KpiBox({ label, value, currency, sub, color, icon }: {
  label: string; value: string; currency: string; sub?: string;
  color: 'blue' | 'red' | 'green'; icon: React.ReactNode;
}) {
  const ic = { blue: 'text-blue-500', red: 'text-red-400', green: 'text-emerald-500' }[color];
  const vc = { blue: 'text-zinc-800', red: 'text-red-600', green: 'text-emerald-600' }[color];
  return (
    <div className="px-3 py-3">
      <div className={`mb-1.5 ${ic}`}>{icon}</div>
      <div className="text-[9px] text-zinc-400 font-bold uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-[10px] font-bold tabular-nums leading-tight ${vc}`}>{value}</div>
      <div className="text-[9px] text-zinc-400">{currency}{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3 mx-3 rounded-xl bg-white border border-zinc-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-200 flex items-center gap-2 bg-zinc-50">
        <span className="text-zinc-400">{icon}</span>
        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{title}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function BRow({ label, value, currency, color, bold, sub }: {
  label: string; value: string; currency: string; color: string; bold?: boolean; sub?: string;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-[11px] ${bold ? 'font-bold text-zinc-700' : 'text-zinc-500'}`}>{label}</span>
      <span className={`text-[11px] tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>
        {value} {currency}
        {sub && <span className="ml-1 text-[9px] opacity-60">({sub})</span>}
      </span>
    </div>
  );
}
