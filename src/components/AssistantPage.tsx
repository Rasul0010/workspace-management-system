import { useState } from 'react';
import { BarChart3, FileText, Receipt, Package } from 'lucide-react';
import AssistantResults from './AssistantResults';
import SmetaPage from './SmetaPage';
import InvoicePage from './InvoicePage';
import ProductsPage from './ProductsPage';

type SubTab = 'results' | 'smeta' | 'invoice' | 'products';

const ASSISTANT_OWNER = 'assistant';

export default function AssistantPage() {
  const [subTab, setSubTab] = useState<SubTab>('results');

  const tabs: { id: SubTab; label: string; icon: (s: number) => React.ReactNode }[] = [
    { id: 'results',  label: 'Результаты', icon: (s) => <BarChart3 size={s} /> },
    { id: 'smeta',    label: 'Смета',      icon: (s) => <FileText size={s} /> },
    { id: 'invoice',  label: 'Счёт',       icon: (s) => <Receipt size={s} /> },
    { id: 'products', label: 'Товары',     icon: (s) => <Package size={s} /> },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-100">
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-200 bg-white px-4 py-2.5">
        {tabs.map(t => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors ${
                active
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
              }`}
            >
              {t.icon(14)}
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {subTab === 'results'  && <AssistantResults />}
        {subTab === 'smeta'    && <SmetaPage onConfirmed={() => setSubTab('invoice')} owner={ASSISTANT_OWNER} />}
        {subTab === 'invoice'  && <InvoicePage owner={ASSISTANT_OWNER} role="admin" />}
        {subTab === 'products' && <ProductsPage owner={ASSISTANT_OWNER} hideDelete />}
      </div>
    </div>
  );
}
