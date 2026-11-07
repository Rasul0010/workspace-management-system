import { useState, useEffect } from 'react';
import LoginPage, { type Role } from './components/LoginPage';
import Dashboard from './components/Dashboard';
import { Monitor, Smartphone } from 'lucide-react';

function WelcomeToast({ onClose }: { onClose: () => void }) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), 13500);
    const closeTimer = setTimeout(onClose, 15000);
    return () => { clearTimeout(fadeTimer); clearTimeout(closeTimer); };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-[1500ms]"
      style={{ opacity: fadingOut ? 0 : 1 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-teal-50" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(16,185,129,0.08),transparent_70%)]" />

      <div className="relative z-10 text-center px-8 animate-[fadeIn_0.6s_ease-out]">
        <div className="mx-auto mb-8 w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2z" />
            <path d="M12 6v6l4 2" />
          </svg>
        </div>

        <p
          className="text-3xl sm:text-4xl md:text-5xl text-zinc-900 font-medium mb-6"
          style={{ fontFamily: "'Amiri','Scheherazade New','Noto Naskh Arabic',serif", direction: 'rtl', lineHeight: 2.4 }}
        >
          اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا
        </p>

        <div className="flex justify-center">
          <div className="h-1 w-48 rounded-full bg-emerald-100 overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 animate-[shrinkBar_15s_linear]" />
          </div>
        </div>
      </div>
    </div>
  );
}

const DEVICE_KEY = 'workspace_device';
export type DeviceMode = 'phone' | 'desktop';

function DeviceSelector({ onSelect }: { onSelect: (m: DeviceMode) => void }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="mb-10 text-center">
        <img src="/WhatsApp_Image_2026-10-25_at_21.22.15.jpeg" alt="RT" className="mx-auto h-72 w-[30rem] max-w-full object-contain mix-blend-multiply contrast-125" />
        <p className="mt-1 text-xs font-black tracking-[0.28em] text-slate-800">СИСТЕМА УПРАВЛЕНИЯ</p>
        <p
          className="text-2xl text-zinc-700 select-none mt-3"
          style={{ fontFamily: "'Amiri','Scheherazade New','Noto Naskh Arabic',serif", direction: 'rtl', lineHeight: 2 }}
        >
          بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ
        </p>
        <p className="mt-1 text-sm text-zinc-400 tracking-wider">Выберите устройство</p>
      </div>

      <div className="flex gap-5 w-full max-w-md">
        <button
          onClick={() => onSelect('phone')}
          className="flex-1 flex flex-col items-center gap-4 bg-white border-2 border-zinc-200 rounded-2xl px-6 py-8 hover:border-zinc-900 hover:shadow-lg transition-all group"
        >
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 group-hover:bg-zinc-900 flex items-center justify-center transition-all">
            <Smartphone size={28} className="text-zinc-500 group-hover:text-white transition-colors" />
          </div>
          <div className="text-center">
            <div className="text-base font-black text-zinc-900">Телефон</div>
            <div className="text-xs text-zinc-400 mt-1">Компактный вид</div>
            <div className="text-[10px] text-zinc-300 mt-1">360 – 430 px</div>
          </div>
        </button>

        <button
          onClick={() => onSelect('desktop')}
          className="flex-1 flex flex-col items-center gap-4 bg-white border-2 border-zinc-200 rounded-2xl px-6 py-8 hover:border-zinc-900 hover:shadow-lg transition-all group"
        >
          <div className="w-16 h-16 rounded-2xl bg-zinc-100 group-hover:bg-zinc-900 flex items-center justify-center transition-all">
            <Monitor size={28} className="text-zinc-500 group-hover:text-white transition-colors" />
          </div>
          <div className="text-center">
            <div className="text-base font-black text-zinc-900">Компьютер</div>
            <div className="text-xs text-zinc-400 mt-1">Полный экран</div>
            <div className="text-[10px] text-zinc-300 mt-1">1280 – 1920 px</div>
          </div>
        </button>
      </div>

      <p className="mt-8 text-[11px] text-zinc-300">Можно изменить в Настройках</p>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>('admin');
  const [showWelcome, setShowWelcome] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceMode | null>(() => {
    const stored = localStorage.getItem(DEVICE_KEY);
    return stored === 'phone' || stored === 'desktop' ? stored : null;
  });
  function selectDevice(m: DeviceMode) {
    localStorage.setItem(DEVICE_KEY, m);
    setDeviceMode(m);
  }

  function handleLogin(r: Role) {
    setRole(r);
    setLoggedIn(true);
    setShowWelcome(true);
  }

  function handleLogout() {
    setLoggedIn(false);
    setRole('admin');
    setShowWelcome(false);
  }

  if (deviceMode === null) {
    return <DeviceSelector onSelect={selectDevice} />;
  }

  if (!loggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <>
      {showWelcome && <WelcomeToast onClose={() => setShowWelcome(false)} />}
      <Dashboard
        onLogout={handleLogout}
        deviceMode={deviceMode}
        onChangeDevice={selectDevice}
        role={role}
      />
    </>
  );
}
