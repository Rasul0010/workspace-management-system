import { useState } from 'react';
import { Settings, LogOut, Key, User, ChevronRight, X, Check, Eye, EyeOff, Monitor, Smartphone, Calculator, BookOpen } from 'lucide-react';
import { getCredentials, saveCredentials, getAssistantCredentials, saveAssistantCredentials, getAccountantPassword, saveAccountantPassword, getDeliveryPassword, saveDeliveryPassword } from './LoginPage';
import type { DeviceMode } from '../App';

interface Props {
  onLogout: () => void;
  onChangeDevice?: (m: DeviceMode) => void;
  role?: 'admin' | 'assistant';
}

export default function SettingsPage({ onLogout, onChangeDevice, role = 'admin' }: Props) {
  const [modal, setModal] = useState<'login' | 'password' | 'assistant' | 'accountant' | 'delivery' | null>(null);
  const [newLogin, setNewLogin] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const creds = getCredentials();

  function openLoginModal() {
    setNewLogin(creds.login);
    setCurrentPassword('');
    setShowPw(false);
    setError('');
    setSuccess('');
    setModal('login');
  }

  function openPasswordModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setError('');
    setSuccess('');
    setModal('password');
  }

  function openAssistantModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setError('');
    setSuccess('');
    setModal('assistant');
  }

  function openAccountantModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setError('');
    setSuccess('');
    setModal('accountant');
  }

  function openDeliveryModal() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
    setError('');
    setSuccess('');
    setModal('delivery');
  }

  function saveAssistantPassword() {
    if (role === 'admin') {
      const adminCreds = getCredentials();
      if (!currentPassword) { setError('Введите ваш пароль администратора'); return; }
      if (currentPassword !== adminCreds.password) { setError('Неверный пароль администратора'); return; }
    } else {
      const oldPw = getAssistantCredentials().password;
      if (!currentPassword) { setError('Введите текущий пароль'); return; }
      if (currentPassword !== oldPw) { setError('Неверный текущий пароль'); return; }
    }
    if (newPassword.length < 6) { setError('Пароль минимум 6 символов'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
    saveAssistantCredentials(getAssistantCredentials().login, newPassword);
    setSuccess('Пароль ассистента успешно изменён');
    setError('');
    setTimeout(() => { setModal(null); setSuccess(''); }, 1200);
  }

  function saveSectionPassword(section: 'accountant' | 'delivery') {
    const oldPw = section === 'accountant' ? getAccountantPassword() : getDeliveryPassword();
    if (!currentPassword) { setError('Введите текущий пароль'); return; }
    if (currentPassword !== oldPw) { setError('Неверный текущий пароль'); return; }
    if (newPassword.length < 4) { setError('Пароль минимум 4 символа'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
    if (section === 'accountant') {
      saveAccountantPassword(newPassword);
    } else {
      saveDeliveryPassword(newPassword);
    }
    setSuccess('Пароль успешно изменён');
    setError('');
    setTimeout(() => { setModal(null); setSuccess(''); }, 1200);
  }

  function saveLogin() {
    const c = getCredentials();
    if (!currentPassword) { setError('Введите текущий пароль'); return; }
    if (currentPassword !== c.password) { setError('Неверный текущий пароль'); return; }
    if (!newLogin.trim()) { setError('Логин не может быть пустым'); return; }
    saveCredentials(newLogin.trim(), c.password);
    setSuccess('Логин успешно изменён');
    setError('');
    setTimeout(() => { setModal(null); setSuccess(''); }, 1200);
  }

  function savePassword() {
    const c = getCredentials();
    if (!currentPassword) { setError('Введите текущий пароль'); return; }
    if (currentPassword !== c.password) { setError('Неверный текущий пароль'); return; }
    if (newPassword.length < 6) { setError('Новый пароль минимум 6 символов'); return; }
    if (newPassword !== confirmPassword) { setError('Пароли не совпадают'); return; }
    saveCredentials(c.login, newPassword);
    setSuccess('Пароль успешно изменён');
    setError('');
    setTimeout(() => { setModal(null); setSuccess(''); }, 1200);
  }

  const menuItems = [
    { icon: <User size={16} />, label: 'Изменить логин', sub: creds.login, onClick: openLoginModal },
    { icon: <Key size={16} />, label: 'Изменить пароль входа', sub: '••••••••', onClick: openPasswordModal },
    { icon: <Key size={16} />, label: role === 'assistant' ? 'Изменить пароль Ассистента' : 'Пароль аккаунта Ассистента', sub: '••••••••', onClick: openAssistantModal },
    { icon: <Calculator size={16} />, label: 'Пароль раздела Бухгалтер', sub: '••••', onClick: openAccountantModal },
    { icon: <BookOpen size={16} />, label: 'Пароль раздела Бухгалтерия', sub: '••••', onClick: openDeliveryModal },
    ...(onChangeDevice ? [
      { icon: <Monitor size={16} />, label: 'Версия для компьютера', sub: 'Переключить вид', onClick: () => onChangeDevice('desktop') },
      { icon: <Smartphone size={16} />, label: 'Версия для телефона', sub: 'Переключить вид', onClick: () => onChangeDevice('phone') },
    ] : []),
  ];

  const inputCls = 'w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-zinc-800 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-800 focus:border-transparent transition-all placeholder-zinc-300 bg-white';

  function handleSave() {
    if (modal === 'login') saveLogin();
    else if (modal === 'password') savePassword();
    else if (modal === 'assistant') saveAssistantPassword();
    else if (modal === 'accountant') saveSectionPassword('accountant');
    else if (modal === 'delivery') saveSectionPassword('delivery');
  }

  return (
    <div className="flex flex-col h-full bg-zinc-100">
      <div className="px-4 pt-5 pb-4 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center">
            <Settings size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Настройки</h2>
            <p className="text-[10px] text-zinc-400">Управление аккаунтом</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {menuItems.map((item, i) => (
          <button key={i} onClick={item.onClick}
            className="w-full flex items-center gap-3 bg-white border border-zinc-200 rounded-xl px-3 py-3 hover:border-zinc-300 transition-all group">
            <span className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-500 flex-shrink-0">{item.icon}</span>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-semibold text-zinc-800">{item.label}</p>
              <p className="text-[10px] text-zinc-400 truncate">{item.sub}</p>
            </div>
            <ChevronRight size={14} className="text-zinc-300 group-hover:text-zinc-500 transition-colors flex-shrink-0" />
          </button>
        ))}
      </div>

      <div className="px-4 pb-6">
        <button onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-200 text-red-500 text-xs font-bold hover:bg-red-50 active:opacity-75 transition-all">
          <LogOut size={14} />Выйти из аккаунта
        </button>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[200] bg-black/50 flex items-end" onClick={() => setModal(null)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-5 py-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-900">
                {modal === 'login' ? 'Изменить логин' : modal === 'password' ? 'Изменить пароль' : modal === 'assistant' ? 'Изменить пароль Ассистента' : modal === 'accountant' ? 'Пароль раздела Бухгалтер' : 'Пароль раздела Бухгалтерия'}
              </span>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400"><X size={16} /></button>
            </div>

            {error && <div className="text-xs text-red-500 bg-red-50 border border-red-100 px-3 py-2 rounded-lg">{error}</div>}
            {success && <div className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-lg flex items-center gap-2"><Check size={12} />{success}</div>}

            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">
                {modal === 'assistant' && role === 'admin' ? 'Ваш пароль администратора' : 'Текущий пароль'}
              </label>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="Введите текущий пароль" className={`${inputCls} pr-10`} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {modal === 'login' ? (
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Новый логин</label>
                <input type="text" value={newLogin} onChange={e => setNewLogin(e.target.value)}
                  placeholder="Введите новый логин" className={inputCls} />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Новый пароль</label>
                  <div className="relative">
                    <input type={showNewPw ? 'text' : 'password'} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder={modal === 'accountant' || modal === 'delivery' ? 'Минимум 4 символа' : 'Минимум 6 символов'} className={`${inputCls} pr-10`} />
                    <button type="button" onClick={() => setShowNewPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      {showNewPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">Повторить пароль</label>
                  <div className="relative">
                    <input type={showConfirmPw ? 'text' : 'password'} value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSave()}
                      placeholder="Повторите новый пароль" className={`${inputCls} pr-10`} />
                    <button type="button" onClick={() => setShowConfirmPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                      {showConfirmPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <button onClick={handleSave}
              className="w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold hover:bg-zinc-800 active:opacity-75 transition-all">
              Сохранить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
