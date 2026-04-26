import { useState } from 'react';
import { Stay, Suite, SUITE_TYPE_LABEL } from '../types';
import { formatBRL } from '../lib/cobranca';

interface Props {
  currentStay: Stay;
  currentSuite: Suite;
  freeSuites: Suite[];
  onConfirm: (newSuite: Suite) => Promise<void>;
  onClose: () => void;
}

export function SwapRoomModal({
  currentStay,
  currentSuite,
  freeSuites,
  onConfirm,
  onClose,
}: Props) {
  const [picked, setPicked] = useState<Suite | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const priceKey: keyof Suite['prices'] =
    currentStay.type === 'estadia_2h' ? '2h' : 'pernoite';
  const currentPrice = currentSuite.prices[priceKey];

  async function handleConfirm() {
    if (!picked) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(picked);
    } catch (e) {
      setError((e as Error).message ?? 'Falha ao trocar de quarto');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-[640px] max-w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Trocar Suíte {currentSuite.number}</h2>
            <button
              onClick={onClose}
              disabled={submitting}
              className="text-gray-500 hover:text-gray-800 text-3xl leading-none disabled:opacity-40"
            >
              ×
            </button>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Sem cobrança adicional. Suíte atual: {SUITE_TYPE_LABEL[currentSuite.type]} ·{' '}
            {formatBRL(currentPrice)}
          </p>
        </div>

        {!picked ? (
          <div className="flex-1 overflow-y-auto p-6">
            {freeSuites.length === 0 ? (
              <p className="text-gray-500 text-center py-8">
                Nenhuma suíte livre disponível no momento.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {freeSuites.map((s) => {
                  const newPrice = s.prices[priceKey];
                  const diff = newPrice - currentPrice;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setPicked(s)}
                      className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 text-left transition"
                    >
                      <span className="text-2xl font-black w-12 text-center">
                        {s.number}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{SUITE_TYPE_LABEL[s.type]}</p>
                        {s.equipment.length > 0 && (
                          <p className="text-xs text-gray-500 truncate">
                            {s.equipment.join(' · ')}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">{formatBRL(newPrice)}</p>
                        {diff !== 0 && (
                          <p
                            className={`text-xs font-semibold ${
                              diff > 0 ? 'text-orange-600' : 'text-green-600'
                            }`}
                          >
                            {diff > 0 ? '+' : ''}
                            {formatBRL(diff)}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="bg-gray-50 rounded-xl p-5">
              <p className="text-sm text-gray-500">Trocar de</p>
              <p className="text-lg font-bold">
                Suíte {currentSuite.number} · {SUITE_TYPE_LABEL[currentSuite.type]} ·{' '}
                {formatBRL(currentPrice)}
              </p>
              <p className="text-sm text-gray-500 mt-3">Para</p>
              <p className="text-lg font-bold">
                Suíte {picked.number} · {SUITE_TYPE_LABEL[picked.type]} ·{' '}
                {formatBRL(picked.prices[priceKey])}
              </p>

              {picked.prices[priceKey] !== currentPrice && (
                <p
                  className={`mt-3 text-sm font-semibold ${
                    picked.prices[priceKey] > currentPrice
                      ? 'text-orange-700'
                      : 'text-green-700'
                  }`}
                >
                  Diferença:{' '}
                  {picked.prices[priceKey] > currentPrice ? '+' : ''}
                  {formatBRL(picked.prices[priceKey] - currentPrice)} (passa a valer no
                  checkout)
                </p>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Sem cobrança adicional pelo tempo já decorrido. A suíte atual irá para
                limpeza.
              </p>
            </div>
            {error && (
              <p className="text-red-600 text-sm mt-3 text-center">{error}</p>
            )}
          </div>
        )}

        <div className="flex gap-3 p-6 border-t">
          {picked ? (
            <>
              <button
                onClick={() => {
                  setPicked(null);
                  setError('');
                }}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl border-2 border-gray-300 font-bold hover:bg-gray-50 disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 disabled:opacity-40"
              >
                {submitting ? 'Trocando...' : 'Confirmar troca'}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border-2 border-gray-300 font-bold hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
