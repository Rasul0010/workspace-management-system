import { useState, useEffect, useRef } from 'react';
import { Package, FileText, Receipt, BookOpen, Settings, Users, ArrowLeft, Monitor, Smartphone, LogOut, Lock, X, Calculator, RefreshCw, Eye, Inbox } from 'lucide-react';
import ProductsPage from './ProductsPage';
import { getAccountantPassword, getDeliveryPassword } from './LoginPage';
import RequestsPage from './RequestsPage';
import SmetaPage from './SmetaPage';
import InvoicePage from './InvoicePage';
import DeliveryPage from './DeliveryPage';
import AccountantPage from './AccountantPage';
import SettingsPage from './SettingsPage';
import ClientsPage from './ClientsPage';
import { supabase } from '../lib/supabase';
import type { DeviceMode } from '../App';
import type { Role } from './LoginPage';

type Tab = 'accountant' | 'clients' | 'products' | 'smeta' | 'invoice' | 'delivery' | 'requests';

const PROTECTED_TABS: Tab[] = ['accountant', 'delivery'];

interface Props {
  onLogout: () => void;
  deviceMode: DeviceMode;
  onChangeDevice: (m: DeviceMode) => void;
  role: Role;
}

function buildTabs(role: Role): { id: Tab; label: string; icon: (size: number) => React.ReactNode }[] {
  if (role === 'assistant') {
    return [
      { id: 'smeta',      label: 'Смета',         icon: (s) => <FileText size={s} /> },
      { id: 'invoice',    label: 'Счёт',          icon: (s) => <Receipt size={s} /> },
      { id: 'requests',   label: 'Запросы',       icon: (s) => <Inbox size={s} /> },
      { id: 'clients',    label: 'Клиенты',      icon: (s) => <Users size={s} /> },
      { id: 'products',   label: 'Товары',        icon: (s) => <Package size={s} /> },
    ];
  }
  return [
    { id: 'accountant', label: 'Бухгалтер',   icon: (s) => <Calculator size={s} /> },
    { id: 'requests',   label: 'Запросы',     icon: (s) => <Inbox size={s} /> },
    { id: 'smeta',      label: 'Смета',       icon: (s) => <FileText size={s} /> },
    { id: 'invoice',    label: 'Счёт',        icon: (s) => <Receipt size={s} /> },
    { id: 'clients',    label: 'Клиенты',     icon: (s) => <Users size={s} /> },
    { id: 'products',   label: 'Товары',      icon: (s) => <Package size={s} /> },
    { id: 'delivery',   label: 'Бухгалтерия', icon: (s) => <BookOpen size={s} /> },
  ];
}

interface Stats {
  products: number;
  clients: number;
  activeSmeters: number;
}



export default function Dashboard({ onLogout, deviceMode, onChangeDevice, role }: Props) {
  const [tab, setTab] = useState<Tab>('requests');
  const [history, setHistory] = useState<Tab[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState<Stats>({ products: 0, clients: 0, activeSmeters: 0 });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const passwordRef = useRef<HTMLInputElement>(null);

  const tabs = buildTabs(role);
  const owner = role;

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('clients').select('*', { count: 'exact', head: true }).eq('owner', owner),
      supabase.from('proformas').select('*', { count: 'exact', head: true }).eq('confirmed', false).eq('archived', false).eq('owner', owner),
    ]).then(([p, c, s]) => {
      setStats({
        products: p.count ?? 0,
        clients: c.count ?? 0,
        activeSmeters: s.count ?? 0,
      });
    });
  }, [owner, refreshKey]);

  function navigate(next: Tab) {
    if (next === tab) return;
    if (PROTECTED_TABS.includes(next) && role === 'admin') {
      setPendingTab(next);
      setPasswordInput('');
      setPasswordError(false);
      setShowPasswordModal(true);
      setTimeout(() => passwordRef.current?.focus(), 50);
      return;
    }
    setHistory(h => [...h, tab]);
    setTab(next);
    setShowSettings(false);
  }

  function refreshPage() {
    setRefreshKey(k => k + 1);
  }

  function submitPassword() {
    const expected = pendingTab === 'accountant' ? getAccountantPassword() : getDeliveryPassword();
    if (passwordInput === expected) {
      setShowPasswordModal(false);
      if (pendingTab) {
        setHistory(h => [...h, tab]);
        setTab(pendingTab);
        setShowSettings(false);
        setPendingTab(null);
      }
    } else {
      setPasswordError(true);
      setPasswordInput('');
      setTimeout(() => passwordRef.current?.focus(), 50);
    }
  }

  function closePasswordModal() {
    setShowPasswordModal(false);
    setPasswordInput('');
    setPasswordError(false);
    setPendingTab(null);
  }

  function goBack() {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setTab(prev);
  }

  function renderPage() {
    switch (tab) {
      case 'accountant': return <AccountantPage key={`acc-${refreshKey}`} onBack={goBack} owner={owner} />;
      case 'clients':    return <ClientsPage key={`cli-${refreshKey}`} owner={owner} />;
      case 'products':   return <ProductsPage key={`prod-${refreshKey}`} owner={owner} />;
      case 'smeta':      return <SmetaPage key={`smeta-${refreshKey}`} onConfirmed={() => navigate('invoice')} owner={owner} />;
      case 'invoice':    return <InvoicePage key={`inv-${refreshKey}`} owner={owner} role={role} />;
      case 'requests':   return <RequestsPage key={`req-${refreshKey}`} owner={owner} />;
      case 'delivery':   return <DeliveryPage key={`del-${refreshKey}`} owner={owner} />;
    }
  }

  if (deviceMode === 'desktop') {
    return <>
      <DesktopLayout
        role={role} tab={tab} history={history} showSettings={showSettings} stats={stats}
        navigate={navigate} goBack={goBack} renderPage={renderPage} refreshPage={refreshPage}
        onLogout={onLogout} onChangeDevice={onChangeDevice}
        setShowSettings={setShowSettings}
        tabs={tabs}
      />
      {showPasswordModal && <PasswordModal
        value={passwordInput} error={passwordError} inputRef={passwordRef}
        onChange={v => { setPasswordInput(v); setPasswordError(false); }}
        onSubmit={submitPassword} onClose={closePasswordModal}
        title={pendingTab === 'accountant' ? 'Бухгалтер' : 'Бухгалтерия'}
      />}
    </>;
  }

  return <>
    <MobileLayout
      role={role} tab={tab} history={history} showSettings={showSettings} stats={stats}
      navigate={navigate} goBack={goBack} renderPage={renderPage} refreshPage={refreshPage}
      onLogout={onLogout} onChangeDevice={onChangeDevice}
      setShowSettings={setShowSettings}
      tabs={tabs}
    />
    {showPasswordModal && <PasswordModal
      value={passwordInput} error={passwordError} inputRef={passwordRef}
      onChange={v => { setPasswordInput(v); setPasswordError(false); }}
      onSubmit={submitPassword} onClose={closePasswordModal}
      title={pendingTab === 'accountant' ? 'Бухгалтер' : 'Бухгалтерия'}
    />}
  </>;
}

// ─── Shared types ───────────────────────────────────────────────────────────

interface LayoutProps {
  role: Role;
  tab: Tab;
  history: Tab[];
  showSettings: boolean;
  stats: Stats;
  navigate: (t: Tab) => void;
  goBack: () => void;
  renderPage: () => React.ReactNode;
  refreshPage: () => void;
  onLogout: () => void;
  onChangeDevice: (m: DeviceMode) => void;
  setShowSettings: (v: boolean) => void;
  tabs: { id: Tab; label: string; icon: (size: number) => React.ReactNode }[];
}

// ─── Desktop Layout ──────────────────────────────────────────────────────────

function DesktopLayout({ role, tab, showSettings, stats, navigate, renderPage, refreshPage, onLogout, onChangeDevice, setShowSettings, tabs }: LayoutProps) {
  const activeTab = tabs.find(t => t.id === tab);

  return (
    <div className="min-h-screen bg-zinc-100 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-zinc-200 flex flex-col flex-shrink-0 h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-zinc-100">
          <img src="/WhatsApp_Image_2026-10-25_at_21.22.15 copy 2.jpeg" alt="RT" className="h-12 w-24 object-contain object-left mix-blend-multiply contrast-125" />
          <div className="text-[10px] text-zinc-400 tracking-wider mt-0.5">
            {role === 'assistant' ? 'Ассистент' : 'Система управления'}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {tabs.map(t => {
            const active = t.id === tab && !showSettings;
            return (
              <button key={t.id} onClick={() => { navigate(t.id); setShowSettings(false); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <span className="flex-shrink-0">{t.icon(16)}</span>
                <span className="text-sm font-semibold tracking-wide">{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-3 border-t border-zinc-100 space-y-0.5">
          <button onClick={() => setShowSettings(!showSettings)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
              showSettings ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
            }`}>
            <Settings size={16} />
            <span className="text-sm font-semibold">Настройки</span>
          </button>
          <button onClick={() => onChangeDevice('phone')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors">
            <Smartphone size={16} />
            <span className="text-sm font-semibold">Телефон</span>
          </button>
          <button onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors">
            <LogOut size={16} />
            <span className="text-sm font-semibold">Выйти</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Top bar */}
        <header className="bg-white border-b border-zinc-200 px-8 py-3 flex items-center justify-between flex-shrink-0">
          <h1 className="text-base font-bold text-zinc-900">
            {showSettings ? 'Настройки' : activeTab?.label}
          </h1>
          <div className="flex items-center gap-4">
            {!showSettings && (
              <button onClick={refreshPage} title="Обновить страницу"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">
                <RefreshCw size={15} />
              </button>
            )}
            <span className="text-xs text-zinc-400">
              {new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
            </span>
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 overflow-auto">
          {showSettings
            ? <SettingsPage onLogout={onLogout} onChangeDevice={onChangeDevice} role={role} />
            : <DesktopPageWrapper>{renderPage()}</DesktopPageWrapper>
          }
        </main>
      </div>
    </div>
  );
}

function DesktopPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full">
      {children}
    </div>
  );
}

// ─── Mobile Layout ───────────────────────────────────────────────────────────

function MobileLayout({ role, tab, history, showSettings, stats, navigate, goBack, renderPage, refreshPage, onLogout, onChangeDevice, setShowSettings, tabs }: LayoutProps) {
  if (showSettings) {
    return (
      <div className="min-h-screen bg-zinc-100 flex flex-col max-w-md mx-auto">
        <header className="flex items-center justify-between px-4 pt-4 pb-3 bg-white border-b border-zinc-200">
          <button onClick={() => setShowSettings(false)}
            className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <span className="text-sm font-bold text-zinc-900">Настройки</span>
          <div className="w-8" />
        </header>
        <div className="flex-1 overflow-hidden">
          <SettingsPage onLogout={onLogout} onChangeDevice={onChangeDevice} role={role} />
        </div>
      </div>
    );
  }

  const fullWidth = tab === 'clients';

  return (
    <div className={`min-h-screen bg-zinc-100 flex flex-col ${fullWidth ? '' : 'max-w-md mx-auto'}`}>
      {/* Top header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2.5 bg-white border-b border-zinc-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          {history.length > 0 ? (
            <button onClick={goBack}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors">
              <ArrowLeft size={16} className="text-zinc-500" />
            </button>
          ) : null}
          {/* Mini stats */}
          <div className="flex items-center gap-2">
            <MiniStat icon={<Package size={10} />} value={stats.products} />
            <MiniStat icon={<Users size={10} />} value={stats.clients} />
            <MiniStat icon={<FileText size={10} />} value={stats.activeSmeters} color="emerald" />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refreshPage} title="Обновить"
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors">
            <RefreshCw size={14} className="text-zinc-400" />
          </button>
          <button onClick={() => onChangeDevice('desktop')}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors" title="Версия для компьютера">
            <Monitor size={14} className="text-zinc-400" />
          </button>
          <button onClick={() => setShowSettings(true)}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 transition-colors">
            <Settings size={15} className="text-zinc-500" />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-hidden flex flex-col bg-zinc-100">
        {renderPage()}
      </main>

      {/* Bottom tab bar */}
      <nav className="bg-white border-t border-zinc-200 flex-shrink-0">
        <div className="flex">
          {tabs.map(t => {
            const active = t.id === tab;
            return (
              <button key={t.id} onClick={() => navigate(t.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  active ? 'text-zinc-900' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                {t.icon(18)}
                <span className={`text-[9px] tracking-wide ${active ? 'font-bold' : 'font-medium'}`}>{t.label}</span>
                {active && <span className="w-4 h-0.5 bg-zinc-900 rounded-full mt-0.5" />}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function MiniStat({ icon, value, color = 'zinc' }: { icon: React.ReactNode; value: number; color?: string }) {
  const bg = color === 'emerald' ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-600';
  return (
    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${bg}`}>
      {icon}
      <span className="text-[10px] font-bold tabular-nums">{value}</span>
    </div>
  );
}

// ─── Password Modal ──────────────────────────────────────────────────────────

interface PasswordModalProps {
  value: string;
  error: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  title: string;
}

function PasswordModal({ value, error, inputRef, onChange, onSubmit, onClose, title }: PasswordModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors">
          <X size={16} />
        </button>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
            <Lock size={22} className="text-zinc-600" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            <p className="text-xs text-gray-400 mt-0.5">Введите пароль для доступа</p>
          </div>
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
            placeholder="••••••"
            className={`w-full text-center text-xl font-bold tracking-[0.4em] px-4 py-3 rounded-xl border-2 outline-none transition-all ${
              error
                ? 'border-red-400 bg-red-50 text-red-600 placeholder-red-300'
                : 'border-gray-200 focus:border-zinc-800 bg-white text-gray-900 placeholder-gray-300'
            }`}
          />
          {error && <p className="text-xs text-red-500 font-medium -mt-2">Неверный пароль</p>}
          <button
            onClick={onSubmit}
            className="w-full bg-zinc-900 text-white text-sm font-bold py-2.5 rounded-xl hover:bg-zinc-800 active:opacity-75 transition-all"
          >
            Войти
          </button>
        </div>
      </div>
    </div>
  );
}
