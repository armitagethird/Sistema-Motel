import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../lib/store';
import { logAction } from '../../lib/logger';
import { StatusBar } from '../../components/StatusBar';

interface TurnoProps {
  onBack: () => void;
}

export function Turno({ onBack }: TurnoProps) {
  const profile = useAppStore((s) => s.profile);
  const currentShift = useAppStore((s) => s.currentShift);
  const setCurrentShift = useAppStore((s) => s.setCurrentShift);

  const [expectedCash, setExpectedCash] = useState<number | null>(null);
  const [reportedCash, setReportedCash] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState<{
    total: number;
    card: number;
    cash: number;
    pix: number;
    stays: number;
    orders: number;
  } | null>(null);

  useEffect(() => {
    loadShiftSummary();
  }, []);

  async function loadShiftSummary() {
    if (!currentShift) return;

    const { data: staysData } = await supabase
      .from('stays')
      .select('id, price, extra_value, payment_method, payment_status')
      .gte('opened_at', currentShift.started_at)
      .eq('payment_status', 'confirmed');

    if (!staysData) return;

    const sumByMethod = (m: string) =>
      staysData
        .filter((s) => s.payment_method === m)
        .reduce((a, b) => a + Number(b.price) + Number(b.extra_value ?? 0), 0);

    const cash = sumByMethod('cash');
    const card = sumByMethod('card');
    const pix  = sumByMethod('pix');

    let orders = 0;
    const stayIds = staysData.map((s) => s.id);
    if (stayIds.length > 0) {
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('quantity, inventory_id')
        .in('stay_id', stayIds)
        .lt('quantity', 0);

      if (movements && movements.length > 0) {
        const invIds = [...new Set(movements.map((m) => m.inventory_id))];
        const { data: invData } = await supabase
          .from('inventory')
          .select('id, unit_price')
          .in('id', invIds);
        const invMap = Object.fromEntries((invData ?? []).map((i) => [i.id, i]));
        orders = movements.reduce(
          (sum, m) => sum + Math.abs(m.quantity) * (invMap[m.inventory_id]?.unit_price ?? 0),
          0
        );
      }
    }

    setSummary({ total: cash + card + pix + orders, card, cash, pix, stays: staysData.length, orders });
    setExpectedCash(cash);
  }

  async function handleCloseShift() {
    if (!profile || !currentShift) return;
    const reported = parseFloat(reportedCash.replace(',', '.'));
    if (isNaN(reported)) return;

    setLoading(true);

    await supabase.from('shifts').update({
      ended_at: new Date().toISOString(),
      expected_cash: expectedCash,
      reported_cash: reported,
    }).eq('id', currentShift.id);

    logAction('shift_close', {
      expected_cash: expectedCash,
      reported_cash: reported,
      difference: reported - (expectedCash ?? 0),
      stays: summary?.stays,
      total_card: summary?.card,
      total_pix: summary?.pix,
      total_cash: summary?.cash,
    });
    setCurrentShift(null);
    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div className="h-screen bg-gray-900 flex flex-col items-center justify-center gap-6">
        <div className="text-8xl">📋</div>
        <h2 className="text-4xl font-black text-white">Turno Fechado!</h2>
        <p className="text-gray-400">Relatório registrado com sucesso.</p>
        <button
          onClick={onBack}
          className="mt-4 bg-gray-800 text-white font-bold text-xl px-12 py-4 rounded-2xl hover:bg-gray-900"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0 border-b border-gray-700">
        <button onClick={onBack} className="text-3xl hover:text-gray-300 leading-none">
          ←
        </button>
        <h1 className="text-3xl font-black">Fechar Turno</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-8 max-w-lg mx-auto w-full pb-14">
        {summary && (
          <div className="bg-gray-800 rounded-2xl p-6 shadow mb-6">
            <h2 className="text-xl font-black text-gray-200 mb-4">Resumo do Turno</h2>
            <div className="flex flex-col gap-3 text-lg">
              <div className="flex justify-between">
                <span className="text-gray-400">Estadias</span>
                <span className="font-bold text-gray-100">{summary.stays}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">💳 Cartão</span>
                <span className="font-bold text-gray-100">
                  R$ {summary.card.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">📱 PIX</span>
                <span className="font-bold text-gray-100">
                  R$ {summary.pix.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">💵 Dinheiro (esperado)</span>
                <span className="font-bold text-green-400">
                  R$ {(expectedCash ?? 0).toFixed(2).replace('.', ',')}
                </span>
              </div>
              {summary.orders > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-400">🍺 Pedidos de quarto</span>
                  <span className="font-bold text-gray-100">
                    R$ {summary.orders.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-700 pt-3 mt-1">
                <span className="font-black text-white">Total</span>
                <span className="font-black text-2xl text-white">
                  R$ {summary.total.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="bg-gray-800 rounded-2xl p-6 shadow mb-6">
          <label className="block text-gray-200 font-bold text-lg mb-3">
            Dinheiro em caixa (contagem física):
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-gray-400">R$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              value={reportedCash}
              onChange={(e) => setReportedCash(e.target.value)}
              className="flex-1 border-2 border-gray-600 rounded-xl px-4 py-4 text-2xl font-bold focus:border-blue-500 outline-none bg-gray-700 text-white placeholder-gray-500"
            />
          </div>
          {reportedCash && expectedCash !== null && (
            <p
              className={`mt-3 text-lg font-bold ${
                parseFloat(reportedCash.replace(',', '.')) - expectedCash >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              Diferença: R${' '}
              {(parseFloat(reportedCash.replace(',', '.')) - (expectedCash ?? 0))
                .toFixed(2)
                .replace('.', ',')}
            </p>
          )}
        </div>

        <button
          onClick={handleCloseShift}
          disabled={loading || !reportedCash}
          className="w-full py-5 bg-gray-800 text-white font-black text-xl rounded-2xl hover:bg-gray-900 disabled:opacity-40 transition-all"
        >
          {loading ? 'Fechando...' : 'Fechar Turno'}
        </button>
      </div>

      <StatusBar />
    </div>
  );
}
