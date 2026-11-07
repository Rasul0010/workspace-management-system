import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  ArrowDown,
  Check,
  GripVertical,
  Inbox,
  MessageSquare,
  MoreVertical,
  Palette,
  Plus,
  RefreshCw,
  Trash2,
  X,
  KanbanSquare,
  FileText,
} from 'lucide-react';
import { supabase, type OrderRequest, type RequestStatus } from '../lib/supabase';

interface Props {
  owner: string;
}

type StatusConfig = {
  id: RequestStatus;
  label: string;
  fullLabel: string;
  text: string;
  dot: string;
  bar: string;
  bg: string;
  border: string;
  ring: string;
};

const statuses: StatusConfig[] = [
  { id: 'offered', label: 'OFFERED', fullLabel: 'Предложено', text: 'text-blue-600', dot: 'bg-blue-500', bar: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200', ring: 'ring-blue-300' },
  { id: 'recieved', label: 'RECEIVED', fullLabel: 'Получено', text: 'text-amber-600', dot: 'bg-amber-500', bar: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', ring: 'ring-amber-300' },
  { id: 'responsed', label: 'RESPONSED', fullLabel: 'Ответ дан', text: 'text-violet-600', dot: 'bg-violet-500', bar: 'bg-violet-500', bg: 'bg-violet-50', border: 'border-violet-200', ring: 'ring-violet-300' },
  { id: 'confirmed', label: 'CONFIRMED', fullLabel: 'Подтверждено', text: 'text-emerald-600', dot: 'bg-emerald-500', bar: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', ring: 'ring-emerald-300' },
];

const checkFields: { key: 'check_paid' | 'check_suppliers_paid' | 'check_delivered' | 'check_archived'; label: string; icon: string }[] = [
  { key: 'check_paid', label: 'Оплачено', icon: '$' },
  { key: 'check_suppliers_paid', label: 'Поставщики', icon: 'P' },
  { key: 'check_delivered', label: 'Доставлено', icon: 'D' },
  { key: 'check_archived', label: 'Корзина', icon: 'A' },
];

const colorOptions = [
  { color: '#f4b942', name: 'Янтарный' },
  { color: '#5b8def', name: 'Синий' },
  { color: '#ef6b73', name: 'Красный' },
  { color: '#61b891', name: 'Зелёный' },
  { color: '#9b7bea', name: 'Фиолетовый' },
  { color: '#8c98a5', name: 'Серый' },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}

function statusConfig(id: RequestStatus): StatusConfig {
  return statuses.find(s => s.id === id) ?? statuses[0];
}

export default function RequestsPage({ owner }: Props) {
  const [requests, setRequests] = useState<OrderRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<RequestStatus>('recieved');
  const [viewMode, setViewMode] = useState<'all' | 'gsn'>('all');
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isGsn = viewMode === 'gsn';

  async function loadRequests(): Promise<void> {
    setLoading(true);
    const { data } = await supabase
      .from('requests')
      .select('*')
      .eq('owner', owner)
      .eq('archived', showArchived)
      .eq('is_gsn', isGsn)
      .order('sort_order')
      .order('created_at', { ascending: false })
      .limit(1000);
    setRequests((data ?? []) as OrderRequest[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadRequests();
  }, [owner, showArchived, isGsn]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuId(null);
      }
    }
    if (menuId) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuId]);

  async function updateRequest(id: string, values: Partial<OrderRequest>): Promise<void> {
    const { error } = await supabase.from('requests').update(values).eq('id', id).eq('owner', owner);
    if (!error) {
      setRequests(current => current.map(request => request.id === id ? { ...request, ...values } : request));
    }
  }

  async function moveRequest(id: string, status: RequestStatus): Promise<void> {
    await updateRequest(id, { status });
    setDraggedId(null);
    setDragOverId(null);
    setDragOverCol(null);
  }

  async function reorderWithinColumn(draggedId: string, targetId: string): Promise<void> {
    const dragged = requests.find(r => r.id === draggedId);
    const target = requests.find(r => r.id === targetId);
    if (!dragged || !target || dragged.status !== target.status || draggedId === targetId) return;

    const colRequests = requests.filter(r => r.status === dragged.status).sort((a, b) => a.sort_order - b.sort_order);
    const draggedIdx = colRequests.findIndex(r => r.id === draggedId);
    const targetIdx = colRequests.findIndex(r => r.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    const newOrder = [...colRequests];
    const [moved] = newOrder.splice(draggedIdx, 1);
    newOrder.splice(targetIdx, 0, moved);

    const updates = newOrder.map((r, i) => ({ id: r.id, sort_order: i }));
    const changed = updates.filter(u => {
      const orig = colRequests.find(r => r.id === u.id);
      return orig && orig.sort_order !== u.sort_order;
    });

    await Promise.all(changed.map(u =>
      supabase.from('requests').update({ sort_order: u.sort_order }).eq('id', u.id).eq('owner', owner)
    ));

    setRequests(current => current.map(r => {
      const u = updates.find(x => x.id === r.id);
      return u ? { ...r, sort_order: u.sort_order } : r;
    }));
    setDraggedId(null);
    setDragOverId(null);
    setDragOverCol(null);
  }

  async function toggleArchive(request: OrderRequest): Promise<void> {
    await supabase.from('requests').update({ archived: !request.archived }).eq('id', request.id).eq('owner', owner);
    setRequests(current => current.filter(item => item.id !== request.id));
    setMenuId(null);
  }

  async function deleteRequest(request: OrderRequest): Promise<void> {
    await supabase.from('requests').delete().eq('id', request.id).eq('owner', owner);
    setRequests(current => current.filter(item => item.id !== request.id));
    setMenuId(null);
  }

  async function deleteAllArchived(): Promise<void> {
    const ids = requests.map(r => r.id);
    if (!ids.length) return;
    await supabase.from('requests').delete().in('id', ids).eq('owner', owner);
    setRequests([]);
  }

  async function toggleManualCheck(request: OrderRequest, key: 'check_paid' | 'check_suppliers_paid' | 'check_delivered' | 'check_archived'): Promise<void> {
    await updateRequest(request.id, { [key]: !request[key] });
  }

  async function moveRequestUpOrDown(request: OrderRequest, dir: 'up' | 'down', colRequests: OrderRequest[]): Promise<void> {
    const idx = colRequests.findIndex(r => r.id === request.id);
    if (idx === -1) return;
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= colRequests.length) return;
    const target = colRequests[targetIdx];
    const reqSort = request.sort_order;
    const targetSort = target.sort_order;
    await Promise.all([
      supabase.from('requests').update({ sort_order: targetSort }).eq('id', request.id).eq('owner', owner),
      supabase.from('requests').update({ sort_order: reqSort }).eq('id', target.id).eq('owner', owner),
    ]);
    setRequests(current => current.map(r => {
      if (r.id === request.id) return { ...r, sort_order: targetSort };
      if (r.id === target.id) return { ...r, sort_order: reqSort };
      return r;
    }));
  }

  async function createRequest(): Promise<void> {
    const title = newTitle.trim();
    if (!title || saving) return;
    setSaving(true);
    const { data, error } = await supabase.from('requests').insert({
      owner,
      title,
      comment: newComment.trim(),
      status: createStatus,
      sort_order: 0,
      archived: false,
      is_gsn: isGsn,
      proforma_id: null,
      check_paid: false,
      check_suppliers_paid: false,
      check_delivered: false,
      check_archived: false,
      color: '#f4b942',
    }).select('*').single();
    if (!error && data) {
      setRequests(current => [data as OrderRequest, ...current]);
      setNewTitle('');
      setNewComment('');
      setShowCreate(false);
    }
    setSaving(false);
  }

  const visibleRequests = useMemo(() => requests.filter(r => r.is_gsn === isGsn), [requests, isGsn]);

  const counts = useMemo(() => statuses.reduce<Record<RequestStatus, number>>((result, status) => {
    result[status.id] = visibleRequests.filter(request => request.status === status.id).length;
    return result;
  }, { offered: 0, recieved: 0, responsed: 0, confirmed: 0 }), [visibleRequests]);

  const totalCount = visibleRequests.length;

  function handleColumnDrop(statusId: RequestStatus): void {
    if (!draggedId) return;
    const dragged = requests.find(r => r.id === draggedId);
    if (dragged && dragged.status === statusId && dragOverId && dragOverId !== draggedId) {
      void reorderWithinColumn(draggedId, dragOverId);
    } else {
      void moveRequest(draggedId, statusId);
    }
  }

  const inputCls = 'w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm bg-white outline-none transition-all focus:border-zinc-800 focus:ring-2 focus:ring-zinc-800/10 placeholder:text-zinc-300';

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-50">
      {/* Header bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white/80 px-5 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-600 shadow-sm">
            <KanbanSquare size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-900 leading-tight">Запросы</h1>
            <p className="text-[10px] text-zinc-400 leading-tight">Канбан-доска</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden sm:inline text-[10px] font-medium text-zinc-400 mr-1">{new Date().toLocaleDateString('ru-RU')}</span>
          <button onClick={() => void loadRequests()} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700" title="Обновить">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      {/* View mode tabs */}
      <div className="flex shrink-0 items-center justify-between px-5 py-3 border-b border-zinc-100">
        <div className="flex items-center gap-1 bg-zinc-100/80 rounded-xl p-1">
          <button
            onClick={() => { setViewMode('all'); setShowArchived(false); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              viewMode === 'all' && !showArchived ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <KanbanSquare size={13} />
            <span>Все</span>
            {viewMode === 'all' && !showArchived && <span className="text-[9px] font-black text-zinc-400">{totalCount}</span>}
          </button>
          <button
            onClick={() => { setViewMode('gsn'); setShowArchived(false); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              viewMode === 'gsn' && !showArchived ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <FileText size={13} />
            <span>GSN</span>
          </button>
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              showArchived ? 'bg-white text-red-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            <Trash2 size={13} />
            <span>Корзина</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {showArchived && requests.length > 0 && (
            <button onClick={() => void deleteAllArchived()} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-50">
              <Trash2 size={13} />
              <span>Очистить</span>
            </button>
          )}
          {!showArchived && (
            <button
              onClick={() => { setCreateStatus('recieved'); setShowCreate(true); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-95"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Новый запрос</span>
            </button>
          )}
        </div>
      </div>

      {/* Main board area */}
      <main className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-3">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-800" />
          </div>
        ) : showArchived ? (
          /* Archive view */
          <div className="mx-auto h-full max-w-2xl space-y-2 overflow-y-auto pr-1">
            {requests.map(request => {
              const cfg = statusConfig(request.status);
              return (
                <article
                  key={request.id}
                  className="group relative rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all hover:shadow-md"
                  style={{ borderLeftColor: request.color || '#e4e4e7', borderLeftWidth: 3 }}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="shrink-0 text-base font-extrabold leading-tight text-zinc-800">{request.title}</h3>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
                        <span className="shrink-0 text-[10px] font-medium text-zinc-400">{formatDate(request.created_at)}</span>
                        <div className="ml-auto flex items-center gap-1">
                          {checkFields.map(field => (
                            <button
                              key={field.key}
                              onClick={() => void toggleManualCheck(request, field.key)}
                              title={field.label}
                              className={`flex h-5 w-5 items-center justify-center rounded-md border text-[9px] font-black transition-all ${
                                request[field.key]
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-zinc-200 bg-white text-transparent hover:border-zinc-400'
                              }`}
                            >
                              <Check size={10} strokeWidth={3} />
                            </button>
                          ))}
                          <div className="relative" ref={menuId === request.id ? menuRef : null}>
                            <button
                              onClick={() => setMenuId(menuId === request.id ? null : request.id)}
                              title="Меню"
                              className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                            >
                              <MoreVertical size={14} />
                            </button>
                            {menuId === request.id && (
                              <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-zinc-200 bg-white py-1.5 shadow-xl">
                                <button onClick={() => { setEditId(request.id); setMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                                  <MessageSquare size={13} />Комментарий
                                </button>
                                <button onClick={() => { setColorPickerId(request.id); setMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                                  <Palette size={13} />Цвет
                                </button>
                                <div className="my-1 h-px bg-zinc-100" />
                                <button onClick={() => void toggleArchive(request)} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                                  <ArchiveRestore size={13} />Восстановить
                                </button>
                                <button onClick={() => void deleteRequest(request)} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50">
                                  <Trash2 size={13} />Удалить навсегда
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {editId === request.id ? (
                        <div className="mt-2">
                          <textarea
                            autoFocus
                            defaultValue={request.comment ?? ''}
                            onBlur={event => { void updateRequest(request.id, { comment: event.target.value }); setEditId(null); }}
                            rows={2}
                            placeholder="Комментарий..."
                            className="w-full resize-none rounded-lg border border-zinc-200 px-2.5 py-2 text-xs outline-none focus:border-zinc-800"
                          />
                        </div>
                      ) : colorPickerId === request.id ? (
                        <div className="mt-2 flex items-center gap-2">
                          {colorOptions.map(c => (
                            <button
                              key={c.color}
                              onClick={() => { void updateRequest(request.id, { color: c.color }); setColorPickerId(null); }}
                              title={c.name}
                              className={`h-5 w-5 rounded-full border-2 shadow-sm transition-transform hover:scale-125 ${request.color === c.color ? 'border-zinc-800' : 'border-white ring-1 ring-zinc-200'}`}
                              style={{ backgroundColor: c.color }}
                            />
                          ))}
                          <button onClick={() => setColorPickerId(null)} className="ml-auto text-[10px] font-bold text-zinc-500 hover:text-zinc-800">Готово</button>
                        </div>
                      ) : (
                        request.comment && <p className="mt-1 line-clamp-1 text-[11px] leading-tight text-zinc-500">{request.comment}</p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
            {!requests.length && (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200">
                <Trash2 size={28} className="text-zinc-300 mb-2" />
                <p className="text-xs font-semibold text-zinc-400">Корзина пуста</p>
              </div>
            )}
          </div>
        ) : viewMode === 'gsn' ? (
          /* GSN view - 2 columns */
          <div className="grid h-full min-w-[480px] grid-cols-2 gap-3">
            {statuses.filter(s => s.id === 'confirmed' || s.id === 'responsed').map(status => {
              const columnRequests = visibleRequests
                .filter(request => request.status === status.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              return (
                <KanbanColumn
                  key={status.id}
                  status={status}
                  requests={columnRequests}
                  allRequests={requests}
                  draggedId={draggedId}
                  dragOverId={dragOverId}
                  dragOverCol={dragOverCol}
                  menuId={menuId}
                  menuRef={menuRef}
                  editId={editId}
                  colorPickerId={colorPickerId}
                  onDragStart={setDraggedId}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); setDragOverCol(null); }}
                  onDragOverCard={(id) => { setDragOverId(id); setDragOverCol(status.id); }}
                  onDragOverCol={() => setDragOverCol(status.id)}
                  onDropCol={() => handleColumnDrop(status.id)}
                  onSetMenuId={setMenuId}
                  onSetEditId={setEditId}
                  onSetColorPickerId={setColorPickerId}
                  onUpdateRequest={updateRequest}
                  onToggleCheck={toggleManualCheck}
                  onMoveUp={(req) => void moveRequestUpOrDown(req, 'up', columnRequests)}
                  onMoveDown={(req) => void moveRequestUpOrDown(req, 'down', columnRequests)}
                  onToggleArchive={toggleArchive}
                  onDeleteRequest={deleteRequest}
                  onAddNew={() => { setCreateStatus(status.id); setShowCreate(true); }}
                  colorOptions={colorOptions}
                />
              );
            })}
          </div>
        ) : (
          /* All view - 4 columns */
          <div className="grid h-full min-w-[880px] grid-cols-4 gap-3">
            {statuses.map(status => {
              const columnRequests = visibleRequests
                .filter(request => request.status === status.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              return (
                <KanbanColumn
                  key={status.id}
                  status={status}
                  requests={columnRequests}
                  allRequests={requests}
                  draggedId={draggedId}
                  dragOverId={dragOverId}
                  dragOverCol={dragOverCol}
                  menuId={menuId}
                  menuRef={menuRef}
                  editId={editId}
                  colorPickerId={colorPickerId}
                  onDragStart={setDraggedId}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); setDragOverCol(null); }}
                  onDragOverCard={(id) => { setDragOverId(id); setDragOverCol(status.id); }}
                  onDragOverCol={() => setDragOverCol(status.id)}
                  onDropCol={() => handleColumnDrop(status.id)}
                  onSetMenuId={setMenuId}
                  onSetEditId={setEditId}
                  onSetColorPickerId={setColorPickerId}
                  onUpdateRequest={updateRequest}
                  onToggleCheck={toggleManualCheck}
                  onMoveUp={(req) => void moveRequestUpOrDown(req, 'up', columnRequests)}
                  onMoveDown={(req) => void moveRequestUpOrDown(req, 'down', columnRequests)}
                  onToggleArchive={toggleArchive}
                  onDeleteRequest={deleteRequest}
                  onAddNew={() => { setCreateStatus(status.id); setShowCreate(true); }}
                  colorOptions={colorOptions}
                />
              );
            })}
          </div>
        )}
      </main>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-zinc-900">Новый запрос</h2>
                <p className="text-[11px] text-zinc-400 mt-0.5">Создать карточку в колонке</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="mb-4">
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Статус</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {statuses.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setCreateStatus(s.id)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all ${
                        createStatus === s.id
                          ? `${s.bg} ${s.text} ring-1 ${s.ring}`
                          : 'border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Название</label>
                <input
                  autoFocus
                  value={newTitle}
                  onChange={event => setNewTitle(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') void createRequest(); }}
                  placeholder="Например, TJ-176"
                  className={inputCls}
                />
              </div>
              <div className="mb-5">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Комментарий</label>
                <textarea
                  value={newComment}
                  onChange={event => setNewComment(event.target.value)}
                  rows={3}
                  placeholder="Дополнительная информация..."
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)} className="rounded-xl border border-zinc-200 px-4 py-2.5 text-xs font-bold text-zinc-600 transition-colors hover:bg-zinc-50">
                  Отмена
                </button>
                <button
                  onClick={() => void createRequest()}
                  disabled={!newTitle.trim() || saving}
                  className="rounded-xl bg-zinc-900 px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-zinc-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Kanban Column ---------- */

interface KanbanColumnProps {
  status: StatusConfig;
  requests: OrderRequest[];
  allRequests: OrderRequest[];
  draggedId: string | null;
  dragOverId: string | null;
  dragOverCol: string | null;
  menuId: string | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  editId: string | null;
  colorPickerId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOverCard: (id: string) => void;
  onDragOverCol: () => void;
  onDropCol: () => void;
  onSetMenuId: (id: string | null) => void;
  onSetEditId: (id: string | null) => void;
  onSetColorPickerId: (id: string | null) => void;
  onUpdateRequest: (id: string, values: Partial<OrderRequest>) => void;
  onToggleCheck: (request: OrderRequest, key: 'check_paid' | 'check_suppliers_paid' | 'check_delivered' | 'check_archived') => void;
  onMoveUp: (request: OrderRequest) => void;
  onMoveDown: (request: OrderRequest) => void;
  onToggleArchive: (request: OrderRequest) => void;
  onDeleteRequest: (request: OrderRequest) => void;
  onAddNew: () => void;
  colorOptions: { color: string; name: string }[];
}

function KanbanColumn({
  status, requests, draggedId, dragOverId, dragOverCol,
  menuId, menuRef, editId, colorPickerId,
  onDragStart, onDragEnd, onDragOverCard, onDragOverCol, onDropCol,
  onSetMenuId, onSetEditId, onSetColorPickerId,
  onUpdateRequest, onToggleCheck, onMoveUp, onMoveDown,
  onToggleArchive, onDeleteRequest, onAddNew, colorOptions,
}: KanbanColumnProps) {
  const isActiveCol = dragOverCol === status.id;
  return (
    <section
      onDragOver={event => { event.preventDefault(); onDragOverCol(); }}
      onDrop={() => onDropCol()}
      className={`flex min-h-0 flex-col rounded-2xl border transition-all ${
        isActiveCol ? `${status.bg} ${status.border} ring-2 ${status.ring}` : 'border-zinc-200 bg-zinc-100/60'
      }`}
    >
      {/* Column header */}
      <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          <span className={`text-[10px] font-black tracking-[0.14em] ${status.text}`}>{status.label}</span>
          <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[9px] font-bold text-zinc-500 shadow-sm">{requests.length}</span>
        </div>
        <button
          onClick={onAddNew}
          title={`Добавить в ${status.label}`}
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-zinc-400 shadow-sm transition-all hover:bg-zinc-900 hover:text-white active:scale-90"
        >
          <Plus size={12} strokeWidth={2.5} />
        </button>
      </div>

      {/* Cards */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {requests.map((request, idx) => {
          const cfg = statusConfig(request.status);
          return (
            <article
              key={request.id}
              draggable
              onDragStart={() => onDragStart(request.id)}
              onDragEnd={onDragEnd}
              onDragOver={event => { event.preventDefault(); event.stopPropagation(); onDragOverCard(request.id); }}
              className={`group relative cursor-grab rounded-xl border bg-white p-2.5 shadow-sm transition-all hover:shadow-md active:cursor-grabbing ${
                draggedId === request.id ? 'opacity-40' : ''
              } ${
                dragOverId === request.id && draggedId && draggedId !== request.id
                  ? `ring-2 ${cfg.ring} ring-offset-1`
                  : 'border-zinc-200'
              }`}
              style={{ borderLeftColor: request.color || '#e4e4e7', borderLeftWidth: 3 }}
            >
              <div className="flex items-start gap-1.5">
                <GripVertical size={12} className="mt-0.5 shrink-0 text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="shrink-0 text-base font-extrabold leading-tight text-zinc-800">{request.title}</h3>
                    <span className="shrink-0 text-[9px] font-medium text-zinc-400">{formatDate(request.created_at)}</span>
                    <div className="ml-auto flex items-center gap-0.5">
                      {checkFields.map(field => (
                        <button
                          key={field.key}
                          onClick={() => void onToggleCheck(request, field.key)}
                          title={field.label}
                          className={`flex h-5 w-5 items-center justify-center rounded-md border text-[9px] font-black transition-all ${
                            request[field.key]
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-zinc-200 bg-white text-transparent hover:border-zinc-400'
                          }`}
                        >
                          <Check size={10} strokeWidth={3} />
                        </button>
                      ))}
                      <div className="relative" ref={menuId === request.id ? menuRef : null}>
                        <button
                          onClick={() => onSetMenuId(menuId === request.id ? null : request.id)}
                          title="Меню"
                          className="rounded-lg p-1.5 text-zinc-300 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
                        >
                          <MoreVertical size={13} />
                        </button>
                        {menuId === request.id && (
                          <div className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-zinc-200 bg-white py-1.5 shadow-xl">
                            <button onClick={() => { onSetEditId(request.id); onSetMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                              <MessageSquare size={13} />Комментарий
                            </button>
                            <button onClick={() => { onSetColorPickerId(request.id); onSetMenuId(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                              <Palette size={13} />Цвет
                            </button>
                            <div className="my-1 h-px bg-zinc-100" />
                            <button onClick={() => { void onMoveUp(request); onSetMenuId(null); }} disabled={idx === 0} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30">
                              <ArrowUp size={13} />Вверх
                            </button>
                            <button onClick={() => { void onMoveDown(request); onSetMenuId(null); }} disabled={idx === requests.length - 1} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-30">
                              <ArrowDown size={13} />Вниз
                            </button>
                            <div className="my-1 h-px bg-zinc-100" />
                            <button onClick={() => void onToggleArchive(request)} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50">
                              <Archive size={13} />В корзину
                            </button>
                            <button onClick={() => void onDeleteRequest(request)} className="flex w-full items-center gap-2 px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50">
                              <Trash2 size={13} />Удалить
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {editId === request.id ? (
                    <div className="mt-2">
                      <textarea
                        autoFocus
                        defaultValue={request.comment ?? ''}
                        onBlur={event => { void onUpdateRequest(request.id, { comment: event.target.value }); onSetEditId(null); }}
                        rows={2}
                        placeholder="Комментарий..."
                        className="w-full resize-none rounded-lg border border-zinc-200 px-2.5 py-2 text-[11px] outline-none focus:border-zinc-800"
                      />
                    </div>
                  ) : colorPickerId === request.id ? (
                    <div className="mt-2 flex items-center gap-2">
                      {colorOptions.map(c => (
                        <button
                          key={c.color}
                          onClick={() => { void onUpdateRequest(request.id, { color: c.color }); onSetColorPickerId(null); }}
                          title={c.name}
                          className={`h-5 w-5 rounded-full border-2 shadow-sm transition-transform hover:scale-125 ${request.color === c.color ? 'border-zinc-800' : 'border-white ring-1 ring-zinc-200'}`}
                          style={{ backgroundColor: c.color }}
                        />
                      ))}
                      <button onClick={() => onSetColorPickerId(null)} className="ml-auto text-[10px] font-bold text-zinc-500 hover:text-zinc-800">Готово</button>
                    </div>
                  ) : (
                    request.comment && <p className="mt-1 line-clamp-1 text-[11px] leading-tight text-zinc-500">{request.comment}</p>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {!requests.length && (
          <div className="flex min-h-[120px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300/60">
            <Inbox size={20} className="text-zinc-300 mb-1" />
            <p className="text-[10px] font-medium text-zinc-400">Перетащите сюда</p>
          </div>
        )}
      </div>
    </section>
  );
}
