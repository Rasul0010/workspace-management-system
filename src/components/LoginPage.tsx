import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type Role = 'admin' | 'assistant';

const CREDS_KEY = 'workspace_creds';
const ASSISTANT_CREDS_KEY = 'workspace_assistant_creds';

export function getCredentials(): { login: string; password: string } {
  try {
    const stored = JSON.parse(localStorage.getItem(CREDS_KEY) ?? '{}');
    return {
      login: stored.login ?? 'Admin',
      password: stored.password ?? 'Workspace@2026',
    };
  } catch {
    return { login: 'Admin', password: 'Workspace@2026' };
  }
}

export function saveCredentials(login: string, password: string) {
  localStorage.setItem(CREDS_KEY, JSON.stringify({ login, password }));
}

export function getAssistantCredentials(): { login: string; password: string } {
  try {
    const stored = JSON.parse(localStorage.getItem(ASSISTANT_CREDS_KEY) ?? '{}');
    return {
      login: stored.login ?? 'Assistant',
      password: stored.password ?? 'Assistant@2026',
    };
  } catch {
    return { login: 'Assistant', password: 'Assistant@2026' };
  }
}

export function saveAssistantCredentials(login: string, password: string) {
  localStorage.setItem(ASSISTANT_CREDS_KEY, JSON.stringify({ login, password }));
}

const ACCOUNTANT_PW_KEY = 'workspace_accountant_pw';
const DELIVERY_PW_KEY = 'workspace_delivery_pw';

export function getAccountantPassword(): string {
  return localStorage.getItem(ACCOUNTANT_PW_KEY) ?? '215130';
}

export function saveAccountantPassword(password: string) {
  localStorage.setItem(ACCOUNTANT_PW_KEY, password);
}

export function getDeliveryPassword(): string {
  return localStorage.getItem(DELIVERY_PW_KEY) ?? '215130';
}

export function saveDeliveryPassword(password: string) {
  localStorage.setItem(DELIVERY_PW_KEY, password);
}

interface Props {
  onLogin: (role: Role) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      const creds = getCredentials();
      const assistantCreds = getAssistantCredentials();
      if (login === creds.login && password === creds.password) {
        onLogin('admin');
      } else if (login === assistantCreds.login && password === assistantCreds.password) {
        onLogin('assistant');
      } else {
        setError('Неверный логин или пароль');
      }
      setLoading(false);
    }, 300);
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/WhatsApp_Image_2026-10-25_at_21.22.15.jpeg" alt="RT" className="mx-auto h-40 w-80 object-contain mix-blend-multiply contrast-125" />
          <p
            className="text-xl text-zinc-700 select-none mt-3"
            style={{
              fontFamily: "'Amiri', 'Scheherazade New', 'Noto Naskh Arabic', 'Arial', serif",
              direction: 'rtl',
              lineHeight: 1.8,
              WebkitFontSmoothing: 'antialiased',
            }}
          >
            بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِيمِ
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                Логин
              </label>
              <input
                type="text"
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="Введите логин"
                className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:border-transparent transition-all placeholder-zinc-300"
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Введите пароль"
                  className="w-full px-3 py-2.5 pr-10 rounded-xl border border-zinc-200 text-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:border-transparent transition-all placeholder-zinc-300"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-zinc-600 transition-colors">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-500 text-xs text-center bg-red-50 py-2 px-3 rounded-lg border border-red-100">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 active:opacity-75 transition-all disabled:opacity-60 tracking-wide"
            >
              {loading ? 'Входим...' : 'Войти'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
