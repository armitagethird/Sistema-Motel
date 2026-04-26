import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../lib/store';
import { logAction } from '../../lib/logger';
import { transicaoValida } from '../../lib/suiteStatus';
import { enqueueOperation } from '../../lib/offline';
import { PermissionGate } from '../../components/PermissionGate';
import { PinModal } from '../../components/PinModal';
import { StatusBar } from '../../components/StatusBar';
import { SwapWindowTimer } from '../../components/SwapWindowTimer';
import { SwapRoomModal } from '../../components/SwapRoomModal';
import { tauriCommands } from '../../lib/tauri';
import {
  calcExpectedCheckout,
  calcSwapWindow,
  formatBRL,
  formatDuration,
  snapshotCobranca,
} from '../../lib/cobranca';
import {
  Suite,
  Stay,
  InventoryItem,
  OrderItem,
  SUITE_TYPE_LABEL,
  STAY_TYPE_LABEL,
} from '../../types';

interface QuartosProps {
  onBack: () => void;
}

const statusConfig = {
  free:        { label: 'Livre',      bg: 'bg-green-100  border-green-400',  text: 'text-green-800'  },
  occupied:    { label: 'Ocupado',    bg: 'bg-red-100    border-red-400',    text: 'text-red-800'    },
  cleaning:    { label: 'Limpeza',    bg: 'bg-yellow-100 border-yellow-400', text: 'text-yellow-800' },
  maintenance: { label: 'Manutenção', bg: 'bg-gray-200   border-gray-400',   text: 'text-gray-700'   },
};

const TAURI_RUNNING = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function CleaningTimer({ updatedAt }: { updatedAt?: string }) {
  const [mins, setMins] = useState(0);

  useEffect(() => {
    if (!updatedAt) return;
    const calc = () =>
      setMins(Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000));
    calc();
    const t = setInterval(calc, 60_000);
    return () => clearInterval(t);
  }, [updatedAt]);

  if (!updatedAt) return null;
  return (
    <span className={`text-xs font-semibold mt-0.5 ${mins > 30 ? 'text-red-600' : 'text-yellow-700'}`}>
      {mins > 30 ? `⚠ ${mins} min` : `${mins} min`}
    </span>
  );
}

interface OccupiedBadgeProps {
  stay: Stay;
  ordersTotal: number;
  now: Date;
}

function OccupiedBadge({ stay, ordersTotal, now }: OccupiedBadgeProps) {
  const expected = stay.expected_checkout_at
    ? new Date(stay.expected_checkout_at)
    : calcExpectedCheckout(new Date(stay.opened_at), stay.type);

  const snap = snapshotCobranca({
    openedAt: new Date(stay.opened_at),
    expectedCheckoutAt: expected,
    type: stay.type,
    basePrice: stay.price,
    ordersTotal,
    now,
  });

  return (
    <div className="text-[11px] mt-1 flex flex-col gap-0.5 leading-tight w-full">
      <span className="font-semibold">{formatDuration(snap.msSinceOpened)}</span>
      <span className="font-bold text-gray-700">{formatBRL(snap.grandTotal)}</span>

      {/* Estadia 2h */}
      {stay.type === 'estadia_2h' && snap.isOvertime && (
        <span className="text-orange-700 font-bold">
          ⚠ +{snap.extraHours}h × R$15
        </span>
      )}
      {stay.type === 'estadia_2h' && !snap.isOvertime && (
        <span className="text-gray-600">
          base −{formatDuration(snap.msUntilExpected)}
        </span>
      )}

      {/* Pernoite — pré-meia-noite */}
      {snap.pernoiteState === 'pre' && (
        <span className="text-orange-700 font-bold">
          🌙 pré · {snap.prePernoiteHours}h · −{formatDuration(snap.msUntilMidnight)} p/ 00:00
        </span>
      )}
      {/* Pernoite — ativo após meia-noite */}
      {snap.pernoiteState === 'active' && !snap.pernoiteCloseAlert && (
        <span className="text-blue-600 font-semibold">
          🌙 ativo · 06:00 −{formatDuration(snap.msUntilExpected)}
        </span>
      )}
      {snap.pernoiteCloseAlert && (
        <span className="text-orange-700 font-bold">
          ⚠ pernoite −{formatDuration(snap.msUntilExpected)}
        </span>
      )}
      {snap.pernoiteState === 'overtime' && (
        <span className="text-red-700 font-bold">
          ⚠ passou 06:00 · +{snap.extraHours}h × R$15
        </span>
      )}
    </div>
  );
}

export function Quartos({ onBack }: QuartosProps) {
  const suites              = useAppStore((s) => s.suites);
  const profile             = useAppStore((s) => s.profile);
  const connStatus          = useAppStore((s) => s.connStatus);
  const updateSuiteStatus   = useAppStore((s) => s.updateSuiteStatus);

  const now = useNow(30_000);

  const [activeStays,   setActiveStays]   = useState<Map<string, Stay>>(new Map());
  const [ordersBySuite, setOrdersBySuite] = useState<Map<string, number>>(new Map());

  const [selected,     setSelected]     = useState<Suite | null>(null);
  const [orders,       setOrders]       = useState<OrderItem[]>([]);
  const [inventory,    setInventory]    = useState<InventoryItem[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [showAdd,      setShowAdd]      = useState(false);
  const [pickedItem,   setPickedItem]   = useState<InventoryItem | null>(null);
  const [qty,          setQty]          = useState(1);
  const [adding,         setAdding]         = useState(false);
  const [removingOrder,  setRemovingOrder]  = useState<OrderItem | null>(null);
  const [removeToast,    setRemoveToast]    = useState('');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [swapModalOpen,  setSwapModalOpen]  = useState(false);
  const [swapToast,      setSwapToast]      = useState('');

  // Realtime: suite status + stays + movements → recarrega lista
  useEffect(() => {
    loadActiveStays();
    const channel = supabase
      .channel('quartos-rt')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'suites' }, (payload) => {
        const state = useAppStore.getState();
        state.setSuites(
          state.suites.map((s) =>
            s.id === payload.new.id ? { ...s, ...(payload.new as Suite) } : s
          )
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stays' }, () => {
        loadActiveStays();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, () => {
        loadActiveStays();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function loadActiveStays() {
    const { data: staysData } = await supabase
      .from('stays')
      .select('*')
      .is('closed_at', null);

    const stays = (staysData ?? []) as Stay[];
    const stayMap = new Map<string, Stay>();
    for (const s of stays) stayMap.set(s.suite_id, s);
    setActiveStays(stayMap);

    if (stays.length === 0) {
      setOrdersBySuite(new Map());
      return;
    }

    const stayIds = stays.map((s) => s.id);
    const { data: movements } = await supabase
      .from('inventory_movements')
      .select('stay_id, quantity, inventory_id')
      .in('stay_id', stayIds)
      .eq('status', 'active')
      .lt('quantity', 0);

    const invIds = [...new Set((movements ?? []).map((m) => m.inventory_id))];
    const { data: invs } = invIds.length
      ? await supabase.from('inventory').select('id, unit_price').in('id', invIds)
      : { data: [] };

    const priceMap = Object.fromEntries((invs ?? []).map((i) => [i.id, i.unit_price as number]));
    const totalsByStay = new Map<string, number>();
    for (const m of movements ?? []) {
      const u = priceMap[m.inventory_id] ?? 0;
      totalsByStay.set(m.stay_id, (totalsByStay.get(m.stay_id) ?? 0) + Math.abs(m.quantity) * u);
    }

    const totalsBySuite = new Map<string, number>();
    for (const s of stays) {
      totalsBySuite.set(s.suite_id, totalsByStay.get(s.id) ?? 0);
    }
    setOrdersBySuite(totalsBySuite);
  }

  // ── Overtime alerts (WhatsApp) ────────────────────────────────────
  // lastNotifiedHours: mapa stayId → última hora extra notificada. Cada
  // nova hora iniciada após o `expected` dispara um alerta — vale para
  // estadia 2h (após tempo base) e pernoite (após 06:00).
  // pernoiteCloseNotified: set de stayIds pra deduplicar o alerta de
  // "30min p/ 06:00" (só pernoite).
  const lastNotifiedHours = useRef<Map<string, number>>(new Map());
  const pernoiteCloseNotified = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!TAURI_RUNNING) return;
    for (const stay of activeStays.values()) {
      const expected = stay.expected_checkout_at
        ? new Date(stay.expected_checkout_at)
        : calcExpectedCheckout(new Date(stay.opened_at), stay.type);
      const snap = snapshotCobranca({
        openedAt: new Date(stay.opened_at),
        expectedCheckoutAt: expected,
        type: stay.type,
        basePrice: stay.price,
        ordersTotal: ordersBySuite.get(stay.suite_id) ?? 0,
        now,
      });
      const suiteNumber =
        suites.find((s) => s.id === stay.suite_id)?.number ?? 0;

      // Alerta a cada nova hora adicional iniciada — vale para estadia 2h
      // após o tempo base e para pernoite após 06:00 (mesma cobrança R$15/h).
      const last = lastNotifiedHours.current.get(stay.id) ?? 0;
      if (snap.extraHours > last) {
        lastNotifiedHours.current.set(stay.id, snap.extraHours);
        const minutesOverdue = Math.floor(-snap.msUntilExpected / 60_000);
        tauriCommands
          .authNotifyOvertime(suiteNumber, snap.extraHours, snap.extraValue, minutesOverdue)
          .catch((e) => console.warn('[overtime] authNotifyOvertime falhou:', e));
        logAction('overtime_alert', {
          stay_id: stay.id,
          suite_number: suiteNumber,
          stay_type: stay.type,
          extra_hours: snap.extraHours,
          extra_value: snap.extraValue,
          minutes_overdue: minutesOverdue,
        });
      }

      // Pernoite: alerta único quando entra na janela de 30min antes 06:00
      if (stay.type === 'pernoite' && snap.pernoiteCloseAlert &&
          !pernoiteCloseNotified.current.has(stay.id)) {
        pernoiteCloseNotified.current.add(stay.id);
        const minutesLeft = Math.floor(snap.msUntilExpected / 60_000);
        tauriCommands
          .authNotifyPernoiteClose(suiteNumber, minutesLeft)
          .catch((e) => console.warn('[pernoite] authNotifyPernoiteClose falhou:', e));
        logAction('pernoite_close_alert', {
          stay_id: stay.id,
          suite_number: suiteNumber,
          minutes_left: minutesLeft,
        });
      }
    }
  }, [activeStays, ordersBySuite, now, suites]);

  async function handleMarcarLivre(suite: Suite) {
    if (!profile) return;
    if (!transicaoValida(suite.status, 'free')) return;
    setUpdatingStatus(suite.id);

    if (connStatus === 'offline') {
      enqueueOperation({ type: 'suite_status_update', payload: { suite_id: suite.id, status: 'free' } });
      updateSuiteStatus(suite.id, 'free');
    } else {
      const { error } = await supabase
        .from('suites')
        .update({ status: 'free' })
        .eq('id', suite.id);

      if (!error) {
        updateSuiteStatus(suite.id, 'free');
      }
    }

    logAction('suite_status_update', {
      suite_id: suite.id,
      suite_number: suite.number,
      from: suite.status,
      to: 'free',
    });

    setUpdatingStatus(null);
  }

  async function handleColocarManutencao(suite: Suite) {
    if (!profile) return;
    if (!transicaoValida(suite.status, 'maintenance')) return;
    setUpdatingStatus(suite.id);

    const { error } = await supabase
      .from('suites')
      .update({ status: 'maintenance' })
      .eq('id', suite.id);

    if (!error) {
      updateSuiteStatus(suite.id, 'maintenance');
      logAction('suite_status_update', {
        suite_id: suite.id,
        suite_number: suite.number,
        from: suite.status,
        to: 'maintenance',
      });
    }

    setUpdatingStatus(null);
  }

  async function openPanel(suite: Suite) {
    if (suite.status !== 'occupied') return;
    setSelected(suite);
    setOrders([]);
    setShowAdd(false);
    setPickedItem(null);
    setQty(1);
    setPanelLoading(true);

    const stay = activeStays.get(suite.id) ?? null;

    const { data: invData } = await supabase
      .from('inventory')
      .select('*')
      .gt('quantity', 0)
      .neq('category', 'patrimonio')
      .order('category')
      .order('name');

    setInventory((invData as InventoryItem[]) ?? []);

    if (stay) await loadOrders(stay.id);
    setPanelLoading(false);
  }

  async function loadOrders(stayId: string) {
    const { data: movements } = await supabase
      .from('inventory_movements')
      .select('id, quantity, created_at, inventory_id')
      .eq('stay_id', stayId)
      .eq('status', 'active')
      .lt('quantity', 0)
      .order('created_at');

    if (!movements || movements.length === 0) { setOrders([]); return; }

    const { data: invItems } = await supabase
      .from('inventory')
      .select('id, name, unit_price')
      .in('id', movements.map((m) => m.inventory_id));

    const invMap = Object.fromEntries((invItems ?? []).map((i) => [i.id, i]));

    setOrders(
      movements.map((m) => ({
        id:           m.id,
        quantity:     m.quantity,
        created_at:   m.created_at,
        inventory_id: m.inventory_id,
        inventory:    invMap[m.inventory_id] ?? { name: '?', unit_price: 0 },
      }))
    );
  }

  const activeStayForSelected = selected ? activeStays.get(selected.id) ?? null : null;

  async function handleSwap(newSuite: Suite) {
    if (!profile || !activeStayForSelected || !selected) {
      throw new Error('Estado inválido');
    }
    const opened = new Date(activeStayForSelected.opened_at);
    const swap = calcSwapWindow(opened, new Date());
    if (!swap.canSwap) {
      throw new Error('Janela de troca expirou (limite de 17 minutos).');
    }
    const storeSuite = useAppStore.getState().suites.find((s) => s.id === newSuite.id);
    if (!storeSuite || storeSuite.status !== 'free') {
      throw new Error('Suíte selecionada não está mais livre.');
    }

    const priceKey = activeStayForSelected.type === 'estadia_2h' ? '2h' : 'pernoite';
    const newPrice = newSuite.prices[priceKey];
    const oldSuiteId = selected.id;
    const oldSuiteNumber = selected.number;
    const oldPrice = activeStayForSelected.price;

    if (connStatus === 'offline') {
      enqueueOperation({
        type: 'room_swap',
        payload: {
          stay_id: activeStayForSelected.id,
          old_suite_id: oldSuiteId,
          new_suite_id: newSuite.id,
          new_price: newPrice,
        },
      });
    } else {
      const stayUpd = await supabase
        .from('stays')
        .update({ suite_id: newSuite.id, price: newPrice })
        .eq('id', activeStayForSelected.id);
      if (stayUpd.error) throw new Error(stayUpd.error.message);

      const newOcc = await supabase
        .from('suites')
        .update({ status: 'occupied', updated_at: new Date().toISOString() })
        .eq('id', newSuite.id);
      if (newOcc.error) {
        await loadActiveStays();
        throw new Error('Falha ao ocupar nova suíte: ' + newOcc.error.message);
      }

      const oldClean = await supabase
        .from('suites')
        .update({ status: 'cleaning', updated_at: new Date().toISOString() })
        .eq('id', oldSuiteId);
      if (oldClean.error) {
        await loadActiveStays();
        throw new Error('Falha ao marcar suíte antiga em limpeza: ' + oldClean.error.message);
      }
    }

    updateSuiteStatus(oldSuiteId, 'cleaning');
    updateSuiteStatus(newSuite.id, 'occupied');

    logAction('room_swap', {
      stay_id: activeStayForSelected.id,
      old_suite_id: oldSuiteId,
      old_suite_number: oldSuiteNumber,
      old_price: oldPrice,
      new_suite_id: newSuite.id,
      new_suite_number: newSuite.number,
      new_price: newPrice,
      stay_type: activeStayForSelected.type,
      ms_elapsed: swap.msElapsed,
      in_grace: swap.inGrace,
    });

    await loadActiveStays();
    setSelected({ ...newSuite, status: 'occupied' });
    setSwapModalOpen(false);
    setSwapToast(`Trocado para Suíte ${newSuite.number}.`);
    setTimeout(() => setSwapToast(''), 3000);
  }

  async function confirmAddItem() {
    if (!pickedItem || !activeStayForSelected || !profile || !selected) return;
    setAdding(true);

    const { error } = await supabase.from('inventory_movements').insert({
      inventory_id: pickedItem.id,
      stay_id:      activeStayForSelected.id,
      user_id:      profile.id,
      quantity:     -qty,
      reason:       `Pedido suíte ${selected.number}`,
    });

    if (!error) {
      await supabase
        .from('inventory')
        .update({ quantity: pickedItem.quantity - qty })
        .eq('id', pickedItem.id);

      setInventory((prev) =>
        prev.map((i) =>
          i.id === pickedItem.id ? { ...i, quantity: i.quantity - qty } : i
        ).filter((i) => i.quantity > 0)
      );

      logAction('room_order_add', {
        item_id: pickedItem.id,
        item_name: pickedItem.name,
        quantity: qty,
        suite_number: selected.number,
        suite_id: selected.id,
        stay_id: activeStayForSelected.id,
      });

      await loadOrders(activeStayForSelected.id);
      setShowAdd(false);
      setPickedItem(null);
      setQty(1);
    }

    setAdding(false);
  }

  async function handleRemoveOrder(approvedById: string, approvedByName: string) {
    const order = removingOrder;
    setRemovingOrder(null);
    if (!order || !activeStayForSelected || !selected) return;

    const { error } = await supabase.from('inventory_movements').update({
      status:        'cancelled',
      cancelled_by:  approvedById,
      cancelled_at:  new Date().toISOString(),
      cancel_reason: 'Remoção de pedido incorreto',
    }).eq('id', order.id);

    if (error) {
      setRemoveToast('Erro ao remover pedido.');
      setTimeout(() => setRemoveToast(''), 3000);
      return;
    }

    const { data: inv } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('id', order.inventory_id)
      .single();

    if (inv) {
      await supabase
        .from('inventory')
        .update({ quantity: inv.quantity + Math.abs(order.quantity) })
        .eq('id', order.inventory_id);
    }

    logAction('room_order_remove', {
      item_id:           order.inventory_id,
      item_name:         order.inventory.name,
      quantity:          Math.abs(order.quantity),
      suite_number:      selected.number,
      suite_id:          selected.id,
      stay_id:           activeStayForSelected.id,
      approved_by_id:    approvedById,
      approved_by_name:  approvedByName,
    });

    await loadOrders(activeStayForSelected.id);
    setRemoveToast(`"${order.inventory.name}" removido do pedido.`);
    setTimeout(() => setRemoveToast(''), 3000);
  }

  const orderTotal = orders.reduce((s, o) => s + Math.abs(o.quantity) * o.inventory.unit_price, 0);

  const panelSnap = useMemo(() => {
    if (!activeStayForSelected) return null;
    const expected = activeStayForSelected.expected_checkout_at
      ? new Date(activeStayForSelected.expected_checkout_at)
      : calcExpectedCheckout(new Date(activeStayForSelected.opened_at), activeStayForSelected.type);
    return snapshotCobranca({
      openedAt: new Date(activeStayForSelected.opened_at),
      expectedCheckoutAt: expected,
      type: activeStayForSelected.type,
      basePrice: activeStayForSelected.price,
      ordersTotal: orderTotal,
      now,
    });
  }, [activeStayForSelected, orderTotal, now]);

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0 border-b border-gray-700">
        <button onClick={onBack} className="text-3xl hover:text-gray-300 leading-none">←</button>
        <h1 className="text-3xl font-black">Quartos</h1>
        <span className="ml-auto text-sm text-gray-400">tempo real · toque no ocupado para ver pedidos</span>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Mapa de suítes ── */}
        <div className={`${selected ? 'w-1/2' : 'w-full'} overflow-y-auto p-5 pb-14 transition-all`}>
          <div className="grid grid-cols-4 gap-3">
            {suites.map((suite) => {
              const cfg = statusConfig[suite.status];
              const isUpdating = updatingStatus === suite.id;
              const stay = activeStays.get(suite.id);
              const ordersTotalSuite = ordersBySuite.get(suite.id) ?? 0;

              return (
                <div
                  key={suite.id}
                  className={`
                    border-2 rounded-xl p-4 flex flex-col items-center gap-1 shadow-sm
                    transition-shadow
                    ${cfg.bg} ${cfg.text}
                    ${selected?.id === suite.id ? 'ring-2 ring-blue-500 ring-offset-2 shadow-md' : ''}
                  `}
                >
                  <button
                    onClick={() => openPanel(suite)}
                    disabled={suite.status !== 'occupied'}
                    className={`flex flex-col items-center gap-1 w-full transition-opacity
                      ${suite.status === 'occupied'
                        ? 'cursor-pointer hover:opacity-70 active:opacity-50'
                        : 'cursor-default'}
                    `}
                  >
                    <span className="text-3xl font-black">{suite.number}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide">
                      {SUITE_TYPE_LABEL[suite.type]}
                    </span>
                    <span className="text-sm mt-1 font-medium">{cfg.label}</span>
                    {suite.status === 'cleaning' && (
                      <CleaningTimer updatedAt={suite.updated_at} />
                    )}
                    {suite.status === 'occupied' && stay && (
                      <OccupiedBadge stay={stay} ordersTotal={ordersTotalSuite} now={now} />
                    )}
                  </button>

                  {suite.status === 'cleaning' && profile && (
                    <PermissionGate permission="marcar_suite_livre" role={profile.role}>
                      <button
                        onClick={() => handleMarcarLivre(suite)}
                        disabled={isUpdating}
                        className="mt-1 w-full text-xs bg-green-600 text-white font-bold py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-40"
                      >
                        {isUpdating ? '...' : '✓ Marcar Livre'}
                      </button>
                    </PermissionGate>
                  )}

                  {suite.status === 'maintenance' && profile && (
                    <PermissionGate permission="liberar_manutencao" role={profile.role}>
                      <button
                        onClick={() => handleMarcarLivre(suite)}
                        disabled={isUpdating}
                        className="mt-1 w-full text-xs bg-blue-600 text-white font-bold py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-40"
                      >
                        {isUpdating ? '...' : '✓ Liberar'}
                      </button>
                    </PermissionGate>
                  )}

                  {suite.status === 'free' && profile && (
                    <PermissionGate permission="colocar_em_manutencao" role={profile.role}>
                      <button
                        onClick={() => handleColocarManutencao(suite)}
                        disabled={isUpdating}
                        className="mt-1 w-full text-xs bg-gray-500 text-white font-bold py-1.5 rounded-lg hover:bg-gray-600 disabled:opacity-40"
                      >
                        {isUpdating ? '...' : 'Manutenção'}
                      </button>
                    </PermissionGate>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="flex gap-5 mt-5 px-1 flex-wrap">
            {(Object.entries(statusConfig) as [string, typeof statusConfig.free][]).map(([status, cfg]) => (
              <div key={status} className="flex items-center gap-2 text-sm">
                <div className={`w-4 h-4 rounded border-2 ${cfg.bg}`} />
                <span className="text-gray-400 font-medium">{cfg.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Painel lateral ── */}
        {selected && (
          <div className="w-1/2 border-l border-gray-700 bg-gray-800 overflow-y-auto pb-14">
            {panelLoading ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-xl">
                Carregando...
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-2xl font-black text-gray-100">
                        Suíte {selected.number}
                        <span className="ml-2 text-base font-normal text-gray-400">
                          {SUITE_TYPE_LABEL[selected.type]}
                        </span>
                      </h2>
                      {selected.equipment.length > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {selected.equipment.join(' · ')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="text-gray-400 hover:text-gray-200 text-3xl leading-none font-light"
                    >
                      ×
                    </button>
                  </div>

                  {activeStayForSelected && panelSnap && (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-300">
                      <span>Entrada</span>
                      <span className="font-semibold text-right">
                        {new Date(activeStayForSelected.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span>Modalidade</span>
                      <span className="font-semibold text-right">
                        {STAY_TYPE_LABEL[activeStayForSelected.type]}
                      </span>
                      <span>Tempo decorrido</span>
                      <span className="font-semibold text-right">
                        {formatDuration(panelSnap.msSinceOpened)}
                      </span>

                      {/* Estadia */}
                      {activeStayForSelected.type === 'estadia_2h' && (
                        <>
                          <span>{panelSnap.isOvertime ? 'Excedeu em' : 'Restante'}</span>
                          <span className={`font-semibold text-right ${panelSnap.isOvertime ? 'text-orange-400' : ''}`}>
                            {formatDuration(Math.abs(panelSnap.msUntilExpected))}
                          </span>
                          {panelSnap.isOvertime && (
                            <>
                              <span>Próxima hora em</span>
                              <span className="font-semibold text-right">
                                {formatDuration(panelSnap.msUntilNextHour)}
                              </span>
                            </>
                          )}
                        </>
                      )}

                      {/* Pernoite */}
                      {activeStayForSelected.type === 'pernoite' && panelSnap.pernoiteState === 'pre' && (
                        <>
                          <span>Estado</span>
                          <span className="font-semibold text-right text-orange-400">Pré-pernoite</span>
                          <span>−00:00 em</span>
                          <span className="font-semibold text-right">
                            {formatDuration(panelSnap.msUntilMidnight)}
                          </span>
                        </>
                      )}
                      {activeStayForSelected.type === 'pernoite' && panelSnap.pernoiteState === 'active' && (
                        <>
                          <span>Estado</span>
                          <span className="font-semibold text-right text-blue-400">Pernoite ativo</span>
                          <span>Checkout 06:00 em</span>
                          <span className={`font-semibold text-right ${panelSnap.pernoiteCloseAlert ? 'text-orange-400' : ''}`}>
                            {formatDuration(panelSnap.msUntilExpected)}
                          </span>
                        </>
                      )}
                      {activeStayForSelected.type === 'pernoite' && panelSnap.pernoiteState === 'overtime' && (
                        <>
                          <span>Estado</span>
                          <span className="font-semibold text-right text-red-400">Passou 06:00</span>
                          <span>Atraso</span>
                          <span className="font-semibold text-right text-red-400">
                            {formatDuration(Math.abs(panelSnap.msUntilExpected))}
                          </span>
                          <span>Próxima hora em</span>
                          <span className="font-semibold text-right">
                            {formatDuration(panelSnap.msUntilNextHour)}
                          </span>
                        </>
                      )}

                      <span>Diária</span>
                      <span className="font-semibold text-right">
                        {formatBRL(activeStayForSelected.price)}
                      </span>
                      {panelSnap.prePernoiteHours > 0 && (
                        <>
                          <span>Pré-pernoite</span>
                          <span className="font-semibold text-right text-orange-400">
                            {panelSnap.prePernoiteHours}h · {formatBRL(panelSnap.prePernoiteValue)}
                          </span>
                        </>
                      )}
                      {panelSnap.extraHours > 0 && (
                        <>
                          <span>Adicional</span>
                          <span className="font-semibold text-right text-orange-400">
                            {panelSnap.extraHours}h · {formatBRL(panelSnap.extraValue)}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {activeStayForSelected && profile && (() => {
                    const swap = calcSwapWindow(new Date(activeStayForSelected.opened_at), now);
                    return (
                      <>
                        <SwapWindowTimer openedAt={activeStayForSelected.opened_at} />
                        {swap.canSwap && (
                          <PermissionGate permission="trocar_quarto" role={profile.role}>
                            <button
                              onClick={() => setSwapModalOpen(true)}
                              className="mt-3 w-full py-2.5 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 text-sm"
                            >
                              Trocar de Quarto
                            </button>
                          </PermissionGate>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Pedidos */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-black text-gray-200">Pedidos do Quarto</h3>
                    <button
                      onClick={() => { setShowAdd(true); setPickedItem(null); setQty(1); }}
                      className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl hover:bg-blue-700 text-sm"
                    >
                      + Adicionar
                    </button>
                  </div>

                  {orders.length === 0 ? (
                    <p className="text-gray-400 text-center py-8">Nenhum pedido ainda</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {orders.map((o) => (
                        <div key={o.id} className="flex items-center gap-2 py-2.5 border-b border-gray-700">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-100 truncate">{o.inventory.name}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              {' · '}×{Math.abs(o.quantity)}
                            </p>
                          </div>
                          <p className="font-bold text-gray-100 shrink-0">
                            {formatBRL(Math.abs(o.quantity) * o.inventory.unit_price)}
                          </p>
                          {profile && (
                            <PermissionGate permission="remover_movimentacao" role={profile.role}>
                              <button
                                onClick={() => setRemovingOrder(o)}
                                className="text-red-300 hover:text-red-600 transition-colors text-lg leading-none shrink-0 px-1"
                                title="Remover pedido"
                              >
                                ×
                              </button>
                            </PermissionGate>
                          )}
                        </div>
                      ))}

                      <div className="flex justify-between pt-3 text-gray-300 font-semibold">
                        <span>Pedidos</span>
                        <span>{formatBRL(orderTotal)}</span>
                      </div>
                      {panelSnap && panelSnap.prePernoiteHours > 0 && (
                        <div className="flex justify-between text-orange-300 font-semibold">
                          <span>Pré-pernoite</span>
                          <span>{formatBRL(panelSnap.prePernoiteValue)}</span>
                        </div>
                      )}
                      {panelSnap && panelSnap.extraHours > 0 && (
                        <div className="flex justify-between text-orange-300 font-semibold">
                          <span>Adicional</span>
                          <span>{formatBRL(panelSnap.extraValue)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-1 text-xl font-black text-blue-400 border-t border-gray-700 mt-1">
                        <span>Total geral</span>
                        <span>{formatBRL(panelSnap?.grandTotal ?? orderTotal)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {showAdd && (
                  <div className="border-t border-gray-700 bg-gray-900/50 p-5 flex flex-col gap-3">
                    <h4 className="font-bold text-gray-200">Selecione o item:</h4>

                    <div className="flex flex-col gap-1.5 max-h-44 overflow-auto">
                      {inventory.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => { setPickedItem(item); setQty(1); }}
                          className={`flex justify-between items-center px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                            pickedItem?.id === item.id
                              ? 'border-blue-500 bg-blue-900/50'
                              : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                          }`}
                        >
                          <span className="font-semibold text-gray-100">{item.name}</span>
                          <span className="text-gray-400 text-sm ml-3 shrink-0">
                            {formatBRL(item.unit_price)} · {item.quantity} un
                          </span>
                        </button>
                      ))}
                    </div>

                    {pickedItem && (
                      <div className="flex items-center gap-4 justify-center py-1">
                        <button
                          onClick={() => setQty((q) => Math.max(1, q - 1))}
                          className="w-11 h-11 rounded-full border-2 border-gray-600 text-2xl font-bold text-white hover:bg-gray-700"
                        >−</button>
                        <span className="text-3xl font-black w-10 text-center text-white">{qty}</span>
                        <button
                          onClick={() => setQty((q) => Math.min(pickedItem.quantity, q + 1))}
                          className="w-11 h-11 rounded-full border-2 border-gray-600 text-2xl font-bold text-white hover:bg-gray-700"
                        >+</button>
                        <span className="text-gray-400 text-sm ml-2">
                          = {formatBRL(pickedItem.unit_price * qty)}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => { setShowAdd(false); setPickedItem(null); }}
                        className="flex-1 py-3 border-2 border-gray-600 rounded-xl text-gray-300 font-bold hover:bg-gray-700"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={confirmAddItem}
                        disabled={!pickedItem || adding}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-40"
                      >
                        {adding ? '...' : 'Confirmar'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {removingOrder && (
        <PinModal
          reason={`Remover: ${removingOrder.inventory.name} ×${Math.abs(removingOrder.quantity)} — Suíte ${selected?.number}`}
          onSuccess={handleRemoveOrder}
          onCancel={() => setRemovingOrder(null)}
        />
      )}

      {swapModalOpen && selected && activeStayForSelected && (
        <SwapRoomModal
          currentStay={activeStayForSelected}
          currentSuite={selected}
          freeSuites={suites.filter((s) => s.status === 'free' && s.id !== selected.id)}
          onConfirm={handleSwap}
          onClose={() => setSwapModalOpen(false)}
        />
      )}

      {removeToast && (
        <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-lg font-bold text-sm ${
          removeToast.startsWith('Erro') ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
        }`}>
          {removeToast}
        </div>
      )}

      {swapToast && (
        <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-2xl shadow-lg font-bold text-sm bg-blue-600 text-white">
          {swapToast}
        </div>
      )}

      <StatusBar />
    </div>
  );
}
