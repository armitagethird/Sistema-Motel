import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { PinModal } from '../../components/PinModal';
import { StatusBar } from '../../components/StatusBar';
import { tauriCommands } from '../../lib/tauri';
import { logAction } from '../../lib/logger';
import {
  calcExpectedCheckout,
  formatBRL,
  formatDuration,
  snapshotCobranca,
} from '../../lib/cobranca';
import {
  Suite,
  Stay,
  StayType,
  PaymentMethod,
  OrderItem,
  STAY_TYPE_LABEL,
  SUITE_TYPE_LABEL,
} from '../../types';

interface CheckoutProps {
  onBack: () => void;
}

type Step = 'select_suite' | 'confirm' | 'done';

const STAY_TYPES: { value: StayType; label: string }[] = [
  { value: 'estadia_2h', label: STAY_TYPE_LABEL.estadia_2h },
  { value: 'pernoite',   label: STAY_TYPE_LABEL.pernoite   },
];

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'card',  label: 'Cartão (Stone)', icon: '💳' },
  { value: 'cash',  label: 'Dinheiro',       icon: '💵' },
  { value: 'pix',   label: 'PIX',            icon: '📱' },
];

function priceFor(suite: Suite, type: StayType): number {
  return suite.prices[type === 'estadia_2h' ? '2h' : 'pernoite'];
}

export function Checkout({ onBack }: CheckoutProps) {
  const suites            = useAppStore((s) => s.suites);
  const profile           = useAppStore((s) => s.profile);
  const connStatus        = useAppStore((s) => s.connStatus);
  const updateSuiteStatus = useAppStore((s) => s.updateSuiteStatus);

  const [step,          setStep]          = useState<Step>('select_suite');
  const [selectedSuite, setSelectedSuite] = useState<Suite | null>(null);
  const [activeStay,    setActiveStay]    = useState<Stay | null>(null);
  const [stayType,      setStayType]      = useState<StayType>('estadia_2h');
  const [orderItems,    setOrderItems]    = useState<OrderItem[]>([]);
  const [orderTotal,    setOrderTotal]    = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [showVoidPin,   setShowVoidPin]   = useState(false);
  const [wasVoided,     setWasVoided]     = useState(false);
  const [now,           setNow]           = useState<Date>(() => new Date());

  // Mantém o "now" atualizado a cada 30s — adicional pode mudar enquanto a tela está aberta
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const occupiedSuites = suites.filter((s) => s.status === 'occupied');

  const stayPrice = selectedSuite ? priceFor(selectedSuite, stayType) : 0;

  // Snapshot recalcula expected_checkout pra modalidade selecionada (pode ter sido trocada)
  const snapshot = useMemo(() => {
    if (!activeStay || !selectedSuite) return null;
    const openedAt = new Date(activeStay.opened_at);
    const expected = calcExpectedCheckout(openedAt, stayType);
    return snapshotCobranca({
      openedAt,
      expectedCheckoutAt: expected,
      type: stayType,
      basePrice: stayPrice,
      ordersTotal: orderTotal,
      now,
    });
  }, [activeStay, selectedSuite, stayType, stayPrice, orderTotal, now]);

  const grandTotal = snapshot?.grandTotal ?? stayPrice + orderTotal;

  async function selectSuite(suite: Suite) {
    setLoading(true);
    setError('');

    const { data: stay, error: stayErr } = await supabase
      .from('stays')
      .select('*')
      .eq('suite_id', suite.id)
      .is('closed_at', null)
      .order('opened_at', { ascending: false })
      .limit(1)
      .single();

    if (stayErr || !stay) {
      setError('Nenhuma estadia ativa encontrada.');
      setLoading(false);
      return;
    }

    const { data: movements } = await supabase
      .from('inventory_movements')
      .select('id, quantity, created_at, inventory_id')
      .eq('stay_id', stay.id)
      .eq('status', 'active')
      .lt('quantity', 0)
      .order('created_at');

    let items: OrderItem[] = [];
    if (movements && movements.length > 0) {
      const { data: invData } = await supabase
        .from('inventory')
        .select('id, name, unit_price')
        .in('id', movements.map((m) => m.inventory_id));

      const invMap = Object.fromEntries((invData ?? []).map((i) => [i.id, i]));
      items = movements.map((m) => ({
        id:           m.id,
        quantity:     m.quantity,
        created_at:   m.created_at,
        inventory_id: m.inventory_id,
        inventory:    invMap[m.inventory_id] ?? { name: '?', unit_price: 0 },
      }));
    }

    const roomTotal = items.reduce(
      (sum, m) => sum + Math.abs(m.quantity) * m.inventory.unit_price, 0
    );

    setSelectedSuite(suite);
    setActiveStay(stay as Stay);
    setStayType(stay.type as StayType);
    setOrderItems(items);
    setOrderTotal(roomTotal);
    setPaymentMethod('cash');
    setNow(new Date());
    setStep('confirm');
    setLoading(false);
  }

  async function handleCheckout() {
    if (!selectedSuite || !activeStay || !profile || !snapshot) return;
    setLoading(true);
    setError('');

    try {
      let stoneOrderId: string | undefined;
      if (paymentMethod === 'card') {
        stoneOrderId = await tauriCommands.stoneCreateOrder(
          grandTotal * 100,
          `Suite ${selectedSuite.number} - ${STAY_TYPE_LABEL[stayType]}`
        );
      }

      // Recalcula expected_checkout caso a modalidade tenha sido trocada no checkout
      const openedAt = new Date(activeStay.opened_at);
      const expected = calcExpectedCheckout(openedAt, stayType);

      await supabase.from('stays').update({
        closed_by:            profile.id,
        type:                 stayType,
        price:                stayPrice,
        payment_method:       paymentMethod,
        payment_status:       'confirmed',
        stone_order_id:       stoneOrderId,
        closed_at:            new Date().toISOString(),
        expected_checkout_at: expected.toISOString(),
        extra_hours:          snapshot.extraHours,
        extra_value:          snapshot.extraValue,
        pre_pernoite_value:   snapshot.prePernoiteValue,
      }).eq('id', activeStay.id);

      await supabase.from('suites').update({ status: 'cleaning' }).eq('id', selectedSuite.id);
      updateSuiteStatus(selectedSuite.id, 'cleaning');
      logAction('checkout', {
        suite_number:        selectedSuite.number,
        suite_id:            selectedSuite.id,
        stay_type:           stayType,
        stay_price:          stayPrice,
        order_total:         orderTotal,
        extra_hours:         snapshot.extraHours,
        extra_value:         snapshot.extraValue,
        pre_pernoite_hours:  snapshot.prePernoiteHours,
        pre_pernoite_value:  snapshot.prePernoiteValue,
        grand_total:         grandTotal,
        payment_method:      paymentMethod,
        duration_ms:         snapshot.msSinceOpened,
        stone_order_id:      stoneOrderId ?? null,
      });
      setStep('done');
    } catch {
      setError('Erro ao finalizar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVoid(approvedById: string, approvedByName: string) {
    if (!selectedSuite || !activeStay) return;
    setShowVoidPin(false);
    setLoading(true);

    try {
      if (activeStay.stone_order_id) {
        await tauriCommands.stoneCancelOrder(activeStay.stone_order_id);
      }
      await supabase.from('stays').update({
        closed_by:        profile?.id,
        payment_status:   'void',
        void_approved_by: approvedById,
        void_reason:      'Cancelamento solicitado pela recepção',
        closed_at:        new Date().toISOString(),
      }).eq('id', activeStay.id);

      await supabase.from('suites').update({ status: 'free' }).eq('id', selectedSuite.id);
      updateSuiteStatus(selectedSuite.id, 'free');

      logAction('void_success', {
        suite_number: selectedSuite.number,
        suite_id: selectedSuite.id,
        approved_by_id: approvedById,
        approved_by_name: approvedByName,
      });

      tauriCommands.authNotifyVoid(
        approvedByName, selectedSuite.number, 'Cancelamento solicitado'
      ).catch((e) => console.warn('[void] authNotifyVoid falhou (não-crítico):', e));

      setWasVoided(true);
      setStep('done');
    } catch {
      setError('Erro ao cancelar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  // ── Tela de sucesso ──────────────────────────────────────────────────
  if (step === 'done') {
    if (wasVoided) {
      return (
        <div className="h-screen bg-gray-900 flex flex-col items-center justify-center gap-6 overflow-y-auto">
          <div className="text-8xl">🚫</div>
          <h2 className="text-4xl font-black text-red-400">Estadia Cancelada</h2>
          <p className="text-2xl text-red-400">Suíte {selectedSuite?.number}</p>
          <p className="text-gray-400">Suíte liberada — sem cobrança</p>
          <button
            onClick={onBack}
            className="mt-4 bg-red-600 text-white font-bold text-xl px-12 py-4 rounded-2xl hover:bg-red-700"
          >
            Voltar ao Início
          </button>
        </div>
      );
    }

    return (
      <div className="h-screen bg-gray-900 flex flex-col items-center justify-center gap-6 overflow-y-auto">
        <div className="text-8xl">🔑</div>
        <h2 className="text-4xl font-black text-blue-400">Saída Realizada!</h2>
        <p className="text-2xl text-blue-400">Suíte {selectedSuite?.number}</p>
        <p className="text-3xl font-bold text-white">{formatBRL(grandTotal)}</p>
        <p className="text-gray-400">Suíte encaminhada para limpeza</p>
        <button
          onClick={onBack}
          className="mt-4 bg-blue-600 text-white font-bold text-xl px-12 py-4 rounded-2xl hover:bg-blue-700"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  // ── Selecionar suíte ─────────────────────────────────────────────────
  if (step === 'select_suite') {
    return (
      <div className="h-screen bg-gray-900 flex flex-col">
        <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0 border-b border-gray-700">
          <button onClick={onBack} className="text-3xl hover:text-gray-300 leading-none">←</button>
          <h1 className="text-3xl font-black">Saída</h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-14">
          <p className="text-xl text-gray-400 mb-4 font-medium">Toque na suíte para fechar:</p>
          {loading ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-xl">
              Carregando...
            </div>
          ) : occupiedSuites.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-400 text-xl">
              Nenhuma suíte ocupada
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-4">
              {occupiedSuites.map((suite) => (
                <button
                  key={suite.id}
                  onClick={() => selectSuite(suite)}
                  className="bg-red-100 border-2 border-red-400 rounded-xl p-4 flex flex-col items-center gap-1 hover:bg-red-200 hover:shadow-md cursor-pointer transition-all"
                >
                  <span className="text-3xl font-black text-red-800">{suite.number}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-red-600">
                    {SUITE_TYPE_LABEL[suite.type]}
                  </span>
                  <span className="text-sm font-medium text-red-700">Ocupado</span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-red-600 text-center mt-6">{error}</p>}
        </div>

        <StatusBar />
      </div>
    );
  }

  // ── Confirmar checkout ────────────────────────────────────────────────
  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0 border-b border-gray-700">
        <button onClick={() => setStep('select_suite')} className="text-3xl hover:text-gray-300 leading-none">←</button>
        <h1 className="text-3xl font-black">Saída — Suíte {selectedSuite?.number}</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 pb-14 max-w-xl mx-auto w-full flex flex-col gap-5">

        {/* Resumo da entrada */}
        <div className="bg-gray-800 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">Estadia</p>
          <div className="flex justify-between text-gray-300 mb-1">
            <span>Entrada</span>
            <span className="font-semibold">
              {activeStay && new Date(activeStay.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <div className="flex justify-between text-gray-300 mb-1">
            <span>Tempo decorrido</span>
            <span className="font-semibold">
              {snapshot ? formatDuration(snapshot.msSinceOpened) : '—'}
            </span>
          </div>
          {snapshot && (
            <div className="flex justify-between text-gray-300">
              <span>{snapshot.isOvertime ? 'Excedeu o período em' : 'Tempo restante'}</span>
              <span className={`font-semibold ${snapshot.isOvertime ? 'text-orange-400' : ''}`}>
                {formatDuration(Math.abs(snapshot.msUntilExpected))}
              </span>
            </div>
          )}
        </div>

        {/* Modalidade */}
        <div className="bg-gray-800 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
            Modalidade
            {stayType !== activeStay?.type && (
              <span className="ml-2 text-orange-400 normal-case font-semibold">
                (alterado de {activeStay && STAY_TYPE_LABEL[activeStay.type]})
              </span>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {STAY_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setStayType(t.value)}
                className={`rounded-xl py-3 px-4 flex justify-between items-center border-2 transition-all ${
                  stayType === t.value
                    ? 'border-blue-500 bg-blue-900/50 text-blue-300'
                    : 'border-gray-700 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="font-bold">{t.label}</span>
                <span className="font-black">
                  {selectedSuite && formatBRL(priceFor(selectedSuite, t.value))}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Pedidos do quarto */}
        {orderItems.length > 0 && (
          <div className="bg-gray-800 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
              Pedidos do quarto
            </p>
            <div className="flex flex-col divide-y divide-gray-700">
              {orderItems.map((item) => (
                <div key={item.id} className="flex justify-between items-center py-2.5">
                  <div>
                    <p className="font-semibold text-gray-100">{item.inventory.name}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(item.created_at).toLocaleTimeString('pt-BR', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                      {' · '}×{Math.abs(item.quantity)}
                    </p>
                  </div>
                  <span className="font-bold text-gray-100">
                    {formatBRL(Math.abs(item.quantity) * item.inventory.unit_price)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between pt-3 mt-1 border-t border-gray-700">
              <span className="font-semibold text-gray-300">Subtotal pedidos</span>
              <span className="font-bold text-gray-100">{formatBRL(orderTotal)}</span>
            </div>
          </div>
        )}

        {/* Breakdown total */}
        <div className="bg-gray-700 rounded-2xl p-5 flex flex-col gap-2">
          <div className="flex justify-between text-gray-200 text-sm">
            <span>Diária ({STAY_TYPE_LABEL[stayType]})</span>
            <span className="font-semibold">{formatBRL(stayPrice)}</span>
          </div>
          {orderTotal > 0 && (
            <div className="flex justify-between text-gray-200 text-sm">
              <span>Pedidos</span>
              <span className="font-semibold">{formatBRL(orderTotal)}</span>
            </div>
          )}
          {snapshot && snapshot.prePernoiteHours > 0 && (
            <div className="flex justify-between text-orange-300 text-sm">
              <span>
                Pré-pernoite · {snapshot.prePernoiteHours}h antes 00:00
              </span>
              <span className="font-semibold">{formatBRL(snapshot.prePernoiteValue)}</span>
            </div>
          )}
          {snapshot && snapshot.extraHours > 0 && (
            <div className="flex justify-between text-orange-300 text-sm">
              <span>
                Adicional · {snapshot.extraHours}h após base
              </span>
              <span className="font-semibold">{formatBRL(snapshot.extraValue)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-gray-600">
            <span className="text-white text-xl font-bold">Total</span>
            <span className="text-white text-3xl font-black">{formatBRL(grandTotal)}</span>
          </div>
        </div>

        {/* Forma de pagamento */}
        <div className="bg-gray-800 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3">
            Forma de pagamento
          </p>
          <div className="flex flex-col gap-2">
            {(connStatus === 'offline'
              ? PAYMENT_METHODS.filter((m) => m.value === 'cash')
              : PAYMENT_METHODS
            ).map((m) => (
              <button
                key={m.value}
                onClick={() => setPaymentMethod(m.value)}
                className={`py-4 px-5 rounded-xl border-2 flex items-center gap-3 text-xl font-bold transition-all ${
                  paymentMethod === m.value
                    ? 'border-blue-500 bg-blue-900/50 text-blue-300'
                    : 'border-gray-700 text-gray-200 hover:border-gray-600'
                }`}
              >
                <span>{m.icon}</span> {m.label}
              </button>
            ))}
            {connStatus === 'offline' && (
              <p className="text-red-500 text-sm text-center mt-1">
                Sem conexão — apenas dinheiro disponível
              </p>
            )}
          </div>
        </div>

        {error && <p className="text-red-600 text-center font-medium">{error}</p>}

        {/* Botões de ação */}
        <button
          onClick={handleCheckout}
          disabled={loading}
          className="w-full py-5 bg-blue-600 text-white font-black text-2xl rounded-2xl hover:bg-blue-700 disabled:opacity-40 transition-all"
        >
          {loading ? 'Processando...' : 'Confirmar Pagamento'}
        </button>

        <button
          onClick={() => {
            logAction('void_attempt', {
              suite_number: selectedSuite?.number,
              suite_id: selectedSuite?.id,
            });
            setShowVoidPin(true);
          }}
          className="w-full py-3 border-2 border-red-300 text-red-600 font-bold rounded-2xl hover:bg-red-50"
        >
          Cancelar estadia
        </button>
      </div>

      {showVoidPin && (
        <PinModal
          reason={`Cancelar estadia — Suíte ${selectedSuite?.number}`}
          onSuccess={handleVoid}
          onCancel={() => setShowVoidPin(false)}
        />
      )}

      <StatusBar />
    </div>
  );
}
