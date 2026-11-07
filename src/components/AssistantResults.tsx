import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, DollarSign, ShoppingCart, Users, Calendar, ChevronRight, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { supabase, type Proforma, type ProformaItem } from '../lib/supabase';

interface ProformaWithItems extends Proforma {
  items: ProformaItem[];
}

function fmt(n: number, currency = '') {
  return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (currency ? ' ' + currency : '');
}

function monthKey(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthShort(key: string) {
  return key.split('-').reverse().join('.');
}

function monthLabel(key: string) {
  return key.split('-').reverse().join('.');
}

function calcProfit(p: ProformaWithItems) {
  const revenue = p.total_amount;
  const globalTax = p.purchase_tax_global ?? false;
  const cost = p.items.reduce((s, i) => {
    const base = i.quantity * (i.purchase_price ?? 0);
    const hasTax = globalTax || i.purchase_tax_enabled;
    return s + base * (hasTax ? 1.05 : 1);
  }, 0) + (p.extra_delivery_cost ?? 0);
  return { revenue, cost, profit: revenue - cost };
}

interface MonthlyTotals {
  revenue: number;
  cost: number;
  profit: number;
  count: number;
  proformas: ProformaWithItems[];
}

function buildMonthlyTotals(proformas: ProformaWithItems[]): Record<string, MonthlyTotals> {
  const map: Record<string, MonthlyTotals> = {};
  for (const p of proformas) {
    const key = monthKey(p.confirmed_at ?? p.created_at);
    if (!map[key]) map[key] = { revenue: 0, cost: 0, profit: 0, count: 0, proformas: [] };
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

export default function AssistantResults() {
  const [proformas, setProformas] = useState<ProformaWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [expandedClient, setExpandedClient] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const { data: pData } = await supabase
      .from('proformas')
      .select('*')
      .eq('owner', 'assistant')
      .order('created_at', { ascending: false });
    const rows = (pData as Proforma[]) ?? [];
    if (rows.length === 0) { setProformas([]); setLoading(false); return; }
    const ids = rows.map(p => p.id);
    const { data: iData } = await supabase
      .from('proforma_items')
      .select('*')
      .eq('owner', 'assistant')
      .in('proforma_id', ids);
    const itemsByPf: Record<string, ProformaItem[]> = {};
    for (const item of (iData as ProformaItem[]) ?? []) {
      if (!itemsByPf[item.proforma_id]) itemsByPf[item.proforma_id] = [];
      itemsByPf[item.proforma_id].push(item);
    }
    const result = rows.map(p => ({ ...p, items: itemsByPf[p.id] ?? [] }));
    setProformas(result);
    const now = monthKey(new Date().toISOString());
    const months = [...new Set(result.map(p => monthKey(p.confirmed_at ?? p.created_at)))].sort((a, b) => b.localeCompare(a));
    setSelectedMonth(months.includes(now) ? now : (months[0] ?? null));
    setLoading(false);
  }

  const allProformas = useMemo(() => proformas.filter(p => !p.trashed && !p.archived), [proformas]);
  const confirmedProformas = useMemo(() => allProformas.filter(p => p.confirmed), [allProformas]);

  const allMonths = useMemo(() => {
    const keys = [...new Set(confirmedProformas.map(p => monthKey(p.confirmed_at ?? p.created_at)))];
    return keys.sort((a, b) => b.localeCompare(a));
  }, [confirmedProformas]);

  const monthlyTotals = useMemo(() => buildMonthlyTotals(confirmedProformas), [confirmedProformas]);

  const currency = confirmedProformas[0]?.currency ?? 'AED';
  const maxProfit = Math.max(...allMonths.map(k => Math.abs(monthlyTotals[k]?.profit ?? 0)), 1);

  const selected = selectedMonth ? (monthlyTotals[selectedMonth] ?? null) : null;
  const totalProfit = selected ? selected.profit : 0;

  const clientData = useMemo(() => {
    if (!selected) return [];
    return buildClientData(selected.proformas);
  }, [selected]);

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-600 rounded-full animate-spin" />
    </div>
  );

  if (allProformas.length === 0) return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <p className="text-sm text-zinc-400">Нет данных ассистента</p>
    </div>
  );

  const activeCount = allProformas.length;
  const confirmedCount = confirmedProformas.length;
  const unconfirmedCount = activeCount - confirmedCount;
  const paidCount = confirmedProformas.filter(p => p.paid).length;
  const deliveredCount = confirmedProformas.filter(p => p.delivered).length;
  const totalRevenue = confirmedProformas.reduce((s, p) => s + p.total_amount, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-100">
      {/* Header with stats */}
      <div className="bg-white border-b border-zinc-200 px-4 pt-4 pb-3 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-zinc-900">Результаты ассистента</h1>
            <span className="text-xs font-bold text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">{activeCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowAll(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${showAll ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'}`}>
              Все счета
            </button>
            <button onClick={() => fetchData()} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-6 pt-3 border-t border-zinc-100">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Смет всего</span>
            <span className="text-lg font-black text-zinc-900 tabular-nums">{activeCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Подтверждено</span>
            <span className="text-lg font-black text-emerald-600 tabular-nums">{confirmedCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Не подтверждено</span>
            <span className="text-lg font-black text-amber-600 tabular-nums">{unconfirmedCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Оплачено</span>
            <span className="text-lg font-black text-zinc-900 tabular-nums">{paidCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Доставлено</span>
            <span className="text-lg font-black text-zinc-900 tabular-nums">{deliveredCount}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Сумма подтверждённых</span>
            <span className="text-lg font-black text-zinc-900 tabular-nums">{fmt(totalRevenue)}</span>
          </div>
        </div>
      </div>

      {/* Month picker for confirmed */}
      {!showAll && confirmedProformas.length > 0 && (
        <div className="bg-white border-b border-zinc-200 px-4 py-2 flex-shrink-0">
          <div ref={scrollRef} className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {allMonths.map(key => {
              const d = monthlyTotals[key];
              const isSelected = selectedMonth === key;
              const total = d?.profit ?? 0;
              return (
                <button key={key} onClick={() => { setSelectedMonth(key); setExpandedClient(null); }}
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
      )}

      <div className="flex-1 overflow-y-auto pb-4">
        {showAll ? (
          /* All proformas table */
          <div className="mx-3 mt-3 rounded-xl bg-white border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 700 }}>
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">№</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Клиент</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">КК</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Сумма</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Валюта</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Статус</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {allProformas.map(p => (
                    <tr key={p.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-2.5 text-xs font-bold text-zinc-800">{p.number}</td>
                      <td className="px-4 py-2.5 text-xs font-medium text-zinc-700">{p.client || <span className="text-zinc-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500">{p.client_code || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold tabular-nums text-zinc-700">{fmt(p.total_amount)}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-zinc-500">{p.currency}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {p.confirmed && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">Подтв.</span>}
                          {!p.confirmed && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">Ожидает</span>}
                          {p.paid && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">Оплач.</span>}
                          {p.delivered && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">Достав.</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center text-[11px] text-zinc-400">
                        {new Date(p.created_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : selected && selectedMonth ? (
          <>
            {/* KPI cards */}
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
                                <span className="text-[10px] text-zinc-500 font-medium">{p.number}</span>
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

            {/* Month comparison */}
            <Section title="Сравнение месяцев" icon={<Calendar size={13} />}>
              {allMonths.map((key, idx) => {
                const d = monthlyTotals[key];
                const total = d?.profit ?? 0;
                const isThis = key === selectedMonth;
                const barW = Math.abs(total) / maxProfit * 100;
                const prevKey = allMonths[idx + 1];
                const prev = prevKey ? monthlyTotals[prevKey] : null;
                const prevTotal = prev ? prev.profit : null;
                const delta = prevTotal !== null ? total - prevTotal : null;
                return (
                  <button key={key} onClick={() => { setSelectedMonth(key); setExpandedClient(null); scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' }); }}
                    className={`w-full px-4 py-3 transition-colors border-b border-zinc-100 last:border-0 ${isThis ? 'bg-zinc-100/60' : 'hover:bg-zinc-50'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {isThis && <span className="w-1.5 h-1.5 rounded-full bg-zinc-900 flex-shrink-0" />}
                        <span className={`text-xs tabular-nums ${isThis ? 'font-bold text-zinc-800' : 'font-semibold text-zinc-700'}`}>{monthLabel(key)}</span>
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
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
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
        ) : (
          <div className="mx-3 mt-3 bg-white rounded-xl border border-zinc-200 px-4 py-8 text-center">
            <span className="text-xs text-zinc-400">Нет подтверждённых счетов</span>
          </div>
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
