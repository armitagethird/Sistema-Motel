import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../lib/store';
import { logAction } from '../lib/logger';

interface PinModalProps {
  onSuccess: (approvedById: string, approvedByName: string) => void;
  onCancel: () => void;
  reason?: string;
}

export function PinModal({ onSuccess, onCancel, reason }: PinModalProps) {
  const profile = useAppStore((s) => s.profile);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (pin.length === 6 && !loading) {
      handleSubmit();
    }
  }, [pin]);

  async function handleSubmit() {
    if (pin.length !== 6) return;
    setLoading(true);
    setError('');

    const { data, error: fnError } = await supabase.rpc('validate_manager_pin', {
      pin_input: pin,
      requester_id: profile?.id ?? null,
    });

    if (fnError || !data || !data.user_id) {
      const isRateLimited = data?.error === 'rate_limited';

      if (!isRateLimited) {
        await supabase.from('audit_log').insert({
          user_id: profile?.id ?? null,
          table_name: 'auth',
          operation: 'FAILED_PIN_ATTEMPT',
          new_data: { timestamp: new Date().toISOString() },
        });
        logAction('void_denied');
      }

      setError(
        isRateLimited
          ? 'Muitas tentativas incorretas. Aguarde 15 minutos.'
          : 'PIN inválido. Tentativa registrada.'
      );
      setPin('');
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    onSuccess(data.user_id, data.name);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (loading) return;
    if (e.key === 'Backspace') {
      setPin((p) => p.slice(0, -1));
    } else if (/^\d$/.test(e.key) && pin.length < 6) {
      setPin((p) => p + e.key);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 w-[360px] shadow-2xl">
        <h2 className="text-2xl font-bold text-center mb-2">PIN do Gerente</h2>
        {reason && (
          <p className="text-gray-500 text-center text-sm mb-4">{reason}</p>
        )}

        <p className="text-gray-400 text-center text-xs mb-4">Digite o PIN pelo teclado</p>

        {/* Hidden input that captures keyboard input */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={pin}
          onKeyDown={handleKeyDown}
          onChange={() => {}}
          disabled={loading}
          className="sr-only"
          aria-label="PIN do gerente"
        />

        <div
          className="flex justify-center gap-3 mb-6 cursor-default"
          onClick={() => inputRef.current?.focus()}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-full border-2 transition-all ${
                pin[i] ? 'bg-gray-800 border-gray-800' : 'border-gray-300'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="text-red-600 text-center text-sm mb-4">{error}</p>
        )}

        {loading && (
          <p className="text-gray-400 text-center text-sm mb-4">Verificando...</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold hover:bg-gray-50 disabled:opacity-40"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
