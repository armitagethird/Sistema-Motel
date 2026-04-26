import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../lib/store';
import { enqueueOperation } from '../../lib/offline';
import { logAction } from '../../lib/logger';
import { PermissionGate } from '../../components/PermissionGate';
import { PinModal } from '../../components/PinModal';
import { StatusBar } from '../../components/StatusBar';
import { InventoryItem, INVENTORY_CATEGORY_LABEL, InventoryCategory } from '../../types';

interface EstoqueProps {
  onBack: () => void;
}

interface Movement {
  id: string;
  inventory_id: string;
  quantity: number;
  reason?: string;
  created_at: string;
  status: 'active' | 'cancelled';
}

export function Estoque({ onBack }: EstoqueProps) {
  const profile    = useAppStore((s) => s.profile);
  const connStatus = useAppStore((s) => s.connStatus);

  const [items,   setItems]   = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState<string | null>(null);

  const [restocking, setRestocking] = useState<Record<string, string>>({});

  const [movements,     setMovements]     = useState<Movement[]>([]);
  const [showMovements, setShowMovements] = useState(false);

  // cancelFlow: null = nada aberto; 'reason' = tela de motivo; 'pin' = PinModal
  const [cancelTarget, setCancelTarget] = useState<Movement | null>(null);
  const [cancelFlow,   setCancelFlow]   = useState<'reason' | 'pin' | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .order('category')
      .order('name');
    if (data) setItems(data as InventoryItem[]);
    setLoading(false);
  }

  async function loadMovements() {
    const { data } = await supabase
      .from('inventory_movements')
      .select('id, inventory_id, quantity, reason, created_at, status')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setMovements(data as Movement[]);
  }

  function openCancelFlow(mv: Movement) {
    setCancelTarget(mv);
    setCancelReason('');
    setCancelFlow('reason');
  }

  function closeCancelFlow() {
    setCancelTarget(null);
    setCancelFlow(null);
    setCancelReason('');
  }

  async function applyMovement(item: InventoryItem, delta: number, reason: string) {
    if (!profile) return;
    setSaving(item.id);

    const movement = {
      inventory_id: item.id,
      user_id: profile.id,
      quantity: delta,
      reason,
      offline_created: connStatus === 'offline',
    };

    if (connStatus === 'offline') {
      enqueueOperation({ type: 'inventory_movement', payload: movement });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, quantity: i.quantity + delta } : i))
      );
    } else {
      const newQty = item.quantity + delta;
      const { error } = await supabase.from('inventory_movements').insert(movement);
      if (!error) {
        await supabase.from('inventory').update({ quantity: newQty }).eq('id', item.id);
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, quantity: newQty } : i))
        );
      }
    }

    setSaving(null);
  }

  async function confirmRestock(item: InventoryItem) {
    const raw = restocking[item.id] ?? '';
    const qty = parseInt(raw, 10);
    if (!qty || qty <= 0) return;

    await applyMovement(item, qty, `Reposição: +${qty}`);
    logAction('inventory_restock', { item_id: item.id, item_name: item.name, quantity: qty });
    setRestocking((prev) => { const next = { ...prev }; delete next[item.id]; return next; });
  }

  async function handleCancelConfirmed(approvedById: string, approvedByName: string) {
    if (!cancelTarget) return;

    const { error } = await supabase
      .from('inventory_movements')
      .update({
        status:        'cancelled',
        cancelled_by:  approvedById,
        cancelled_at:  new Date().toISOString(),
        cancel_reason: cancelReason || 'Corrigido pelo gerente',
      })
      .eq('id', cancelTarget.id);

    if (!error) {
      const item = items.find((i) => i.id === cancelTarget.inventory_id);
      if (item) {
        // inverte o movimento: se foi -1 (baixa), adiciona 1 de volta
        const restoredQty = item.quantity - cancelTarget.quantity;
        await supabase
          .from('inventory')
          .update({ quantity: restoredQty })
          .eq('id', cancelTarget.inventory_id);

        setItems((prev) =>
          prev.map((i) =>
            i.id === cancelTarget.inventory_id ? { ...i, quantity: restoredQty } : i
          )
        );
      }

      logAction('inventory_correction', {
        movement_id:  cancelTarget.id,
        inventory_id: cancelTarget.inventory_id,
        quantity:     cancelTarget.quantity,
        reason:       cancelReason || 'Corrigido pelo gerente',
        approved_by:  approvedByName,
      });

      setMovements((prev) => prev.filter((m) => m.id !== cancelTarget.id));
    }

    closeCancelFlow();
  }

  const categories = Array.from(new Set(items.map((i) => i.category)));

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0 border-b border-gray-700">
        <button onClick={onBack} className="text-3xl hover:text-gray-300 leading-none">←</button>
        <h1 className="text-3xl font-black">🍺 Produtos</h1>

        {profile && (
          <PermissionGate permission="remover_movimentacao" role={profile.role}>
            <button
              onClick={() => {
                const next = !showMovements;
                setShowMovements(next);
                if (next) loadMovements();
              }}
              className="ml-auto text-sm bg-yellow-500 text-gray-900 font-bold px-4 py-2 rounded-xl hover:bg-yellow-400"
            >
              {showMovements ? 'Ver Itens' : 'Corrigir Movimentação'}
            </button>
          </PermissionGate>
        )}
      </header>

      <div className="flex-1 min-h-0 p-6 overflow-y-auto pb-14">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-gray-400 text-xl">
            Carregando...
          </div>
        ) : showMovements ? (
          /* ── Painel de correção de movimentações ── */
          <div className="flex flex-col gap-2">
            <p className="text-gray-500 text-sm mb-2">
              Movimentações ativas — cancele para corrigir um lançamento errado
            </p>
            {movements.length === 0 ? (
              <p className="text-gray-400 text-center py-12">Nenhuma movimentação ativa</p>
            ) : (
              movements.map((mv) => {
                const item = items.find((i) => i.id === mv.inventory_id);
                return (
                  <div key={mv.id} className="bg-gray-800 rounded-xl px-5 py-4 shadow-sm flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-100">{item?.name ?? '—'}</p>
                      <p className="text-sm text-gray-400">
                        {mv.quantity > 0 ? `+${mv.quantity}` : mv.quantity} · {mv.reason ?? '—'} ·{' '}
                        {new Date(mv.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <button
                      onClick={() => openCancelFlow(mv)}
                      className="bg-red-100 text-red-700 font-bold px-4 py-2 rounded-xl hover:bg-red-200 text-sm shrink-0"
                    >
                      Cancelar
                    </button>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* ── Lista de itens ── */
          categories.map((cat) => (
            <div key={cat} className="mb-6">
              <h2 className="text-lg font-black text-gray-400 uppercase tracking-widest mb-3 px-1">
                {INVENTORY_CATEGORY_LABEL[cat as InventoryCategory] ?? cat}
              </h2>
              <div className="flex flex-col gap-2">
                {items
                  .filter((i) => i.category === cat)
                  .map((item) => {
                    const isLow     = item.quantity <= item.min_quantity;
                    const isRestock = item.id in restocking;
                    const isSaving  = saving === item.id;

                    return (
                      <div
                        key={item.id}
                        className={`bg-gray-800 rounded-xl px-5 py-4 shadow-sm flex flex-col gap-3 ${
                          isLow ? 'border-l-4 border-red-400' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-lg font-bold text-gray-100">{item.name}</p>
                            <p className="text-sm text-gray-400">
                              R$ {item.unit_price.toFixed(2).replace('.', ',')} · mín {item.min_quantity}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`text-2xl font-black ${isLow ? 'text-red-400' : 'text-gray-100'}`}>
                              {item.quantity}
                            </span>

                            <button
                              onClick={() => applyMovement(item, -1, 'Baixa manual recepção')}
                              disabled={item.quantity <= 0 || isSaving || isRestock}
                              className="bg-red-500 text-white font-bold px-4 py-2 rounded-xl hover:bg-red-600 disabled:opacity-40 text-lg min-w-[56px]"
                            >
                              {isSaving && !isRestock ? '...' : '−1'}
                            </button>

                            <button
                              onClick={() =>
                                setRestocking((prev) =>
                                  item.id in prev
                                    ? (() => { const n = { ...prev }; delete n[item.id]; return n; })()
                                    : { ...prev, [item.id]: '' }
                                )
                              }
                              className={`font-bold px-4 py-2 rounded-xl text-lg min-w-[72px] transition-all ${
                                isRestock
                                  ? 'bg-green-600 text-white hover:bg-green-700'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              Repor
                            </button>
                          </div>
                        </div>

                        {isRestock && (
                          <div className="flex items-center gap-3 pt-1 border-t border-gray-700">
                            <span className="text-gray-300 font-medium">Quantidade a repor:</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              placeholder="0"
                              value={restocking[item.id]}
                              onChange={(e) =>
                                setRestocking((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              className="w-24 border-2 border-gray-600 rounded-xl px-3 py-2 text-xl font-bold text-center focus:border-green-500 outline-none bg-gray-700 text-white"
                              autoFocus
                            />
                            <button
                              onClick={() => confirmRestock(item)}
                              disabled={!restocking[item.id] || isSaving}
                              className="bg-green-600 text-white font-bold px-5 py-2 rounded-xl hover:bg-green-700 disabled:opacity-40"
                            >
                              {isSaving ? '...' : 'Confirmar'}
                            </button>
                            <button
                              onClick={() =>
                                setRestocking((prev) => {
                                  const n = { ...prev }; delete n[item.id]; return n;
                                })
                              }
                              className="text-gray-400 hover:text-gray-600 font-bold px-3 py-2"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: motivo do cancelamento */}
      {cancelFlow === 'reason' && cancelTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-40 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <h3 className="text-xl font-black text-gray-100">Motivo da Correção</h3>
            <p className="text-gray-400 text-sm">
              Informe por que esta movimentação está sendo cancelada.
            </p>
            <input
              type="text"
              placeholder="Ex: Recepcionista adicionou a mais por engano"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="border-2 border-gray-600 rounded-xl px-4 py-3 text-base focus:border-yellow-500 outline-none bg-gray-700 text-white placeholder-gray-500"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={closeCancelFlow}
                className="flex-1 py-3 border-2 border-gray-600 rounded-xl text-gray-300 font-bold hover:bg-gray-700"
              >
                Voltar
              </button>
              <button
                onClick={() => setCancelFlow('pin')}
                disabled={!cancelReason.trim()}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-40"
              >
                Prosseguir com PIN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PinModal para confirmar cancelamento */}
      {cancelFlow === 'pin' && cancelTarget && (
        <PinModal
          reason={`Cancelar movimentação — ${cancelReason}`}
          onSuccess={handleCancelConfirmed}
          onCancel={() => setCancelFlow('reason')}
        />
      )}

      <StatusBar />
    </div>
  );
}
