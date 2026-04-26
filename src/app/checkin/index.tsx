import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../lib/store';
import { supabase } from '../../lib/supabase';
import { enqueueOperation } from '../../lib/offline';
import { SuiteMap } from '../../components/SuiteMap';
import { StatusBar } from '../../components/StatusBar';
import { logAction } from '../../lib/logger';
import {
  calcExpectedCheckout,
  calcMidnightAfter,
  calcPrePernoiteHours,
  calcHourValue,
  formatBRL,
  formatDuration,
  modalidadesDisponiveis,
} from '../../lib/cobranca';
import { Suite, StayType, STAY_TYPE_LABEL, SUITE_TYPE_LABEL } from '../../types';

interface CheckinProps {
  onBack: () => void;
}

type Step = 'select_suite' | 'select_type' | 'done';

const STAY_TYPE_META: Record<StayType, { label: string; sub: string }> = {
  estadia_2h: { label: STAY_TYPE_LABEL.estadia_2h, sub: '2h base · +R$15 a cada hora extra' },
  pernoite:   { label: STAY_TYPE_LABEL.pernoite,   sub: 'até 06:00 da manhã' },
};

export function Checkin({ onBack }: CheckinProps) {
  const suites            = useAppStore((s) => s.suites);
  const profile           = useAppStore((s) => s.profile);
  const connStatus        = useAppStore((s) => s.connStatus);
  const updateSuiteStatus = useAppStore((s) => s.updateSuiteStatus);

  const [step,          setStep]          = useState<Step>('select_suite');
  const [selectedSuite, setSelectedSuite] = useState<Suite | null>(null);
  const [stayType,      setStayType]      = useState<StayType | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [now,           setNow]           = useState<Date>(() => new Date());

  // Atualiza relógio a cada 30s — destrava modalidades quando cruzar 22:00, 00:00 etc.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const allowed = useMemo(() => modalidadesDisponiveis(now), [now]);

  // Limpa stayType selecionado se a janela de horário invalidou
  useEffect(() => {
    if (stayType && !allowed.includes(stayType)) setStayType(null);
  }, [allowed, stayType]);

  const price = selectedSuite && stayType
    ? selectedSuite.prices[stayType === 'estadia_2h' ? '2h' : 'pernoite']
    : 0;

  // Estimativa pré-pernoite — só quando pernoite selecionado e antes da meia-noite
  const preEstimate = useMemo(() => {
    if (stayType !== 'pernoite') return null;
    const hours = calcPrePernoiteHours(now);
    if (hours === 0) return null;
    const midnight = calcMidnightAfter(now);
    const msUntilMidnight = midnight ? midnight.getTime() - now.getTime() : 0;
    return { hours, value: calcHourValue(hours), msUntilMidnight };
  }, [stayType, now]);

  async function handleConfirm() {
    if (!selectedSuite || !stayType || !profile) return;
    setLoading(true);
    setError('');

    const openedAt = new Date();
    const expectedCheckoutAt = calcExpectedCheckout(openedAt, stayType);
    const prePernoiteHours = stayType === 'pernoite' ? calcPrePernoiteHours(openedAt) : 0;
    const prePernoiteValue = calcHourValue(prePernoiteHours);

    const stayPayload = {
      id:                    crypto.randomUUID(),
      suite_id:              selectedSuite.id,
      opened_by:             profile.id,
      type:                  stayType,
      price,
      payment_method:        null,
      payment_status:        'pending',
      offline_created:       connStatus === 'offline',
      opened_at:             openedAt.toISOString(),
      expected_checkout_at:  expectedCheckoutAt.toISOString(),
      extra_hours:           0,
      extra_value:           0,
      pre_pernoite_value:    prePernoiteValue,
    };

    try {
      if (connStatus === 'offline') {
        enqueueOperation({ type: 'checkin', payload: stayPayload });
      } else {
        const { error: insertError } = await supabase.from('stays').insert(stayPayload);
        if (insertError) throw insertError;
        await supabase.from('suites').update({ status: 'occupied' }).eq('id', selectedSuite.id);
      }
      updateSuiteStatus(selectedSuite.id, 'occupied');
      logAction('checkin', {
        suite_number: selectedSuite.number,
        suite_id: selectedSuite.id,
        stay_type: stayType,
        price,
        expected_checkout_at: expectedCheckoutAt.toISOString(),
        pre_pernoite_hours: prePernoiteHours,
        pre_pernoite_value: prePernoiteValue,
        offline: connStatus === 'offline',
      });
      setStep('done');
    } catch {
      setError('Erro ao registrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="h-screen bg-gray-900 flex flex-col items-center justify-center gap-6 overflow-y-auto">
        <div className="text-8xl">✅</div>
        <h2 className="text-4xl font-black text-green-400">Entrada Registrada!</h2>
        <p className="text-2xl text-green-400">
          Suíte {selectedSuite?.number} — {stayType && STAY_TYPE_LABEL[stayType]}
        </p>
        <p className="text-3xl font-bold text-green-300">{formatBRL(price)}</p>
        <p className="text-gray-400 text-sm">Pagamento será feito na saída</p>
        {connStatus === 'offline' && (
          <p className="text-yellow-300 bg-yellow-900/40 px-4 py-2 rounded-xl text-sm">
            Registrado offline — sincroniza ao retornar conexão
          </p>
        )}
        <button
          onClick={onBack}
          className="mt-4 bg-green-600 text-white font-bold text-xl px-12 py-4 rounded-2xl hover:bg-green-700"
        >
          Voltar ao Início
        </button>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0 border-b border-gray-700">
        <button onClick={onBack} className="text-3xl hover:text-gray-300 leading-none">←</button>
        <h1 className="text-3xl font-black">Entrada</h1>
      </header>

      {step === 'select_suite' && (
        <div className="flex-1 min-h-0 overflow-y-auto pb-14">
          <p className="text-xl text-gray-400 px-8 pt-6 pb-2 font-medium">
            Toque na suíte disponível:
          </p>
          <SuiteMap
            suites={suites}
            selectable
            onSelect={(s) => { setSelectedSuite(s); setStep('select_type'); }}
          />
        </div>
      )}

      {step === 'select_type' && selectedSuite && (
        <div className="flex-1 min-h-0 overflow-y-auto p-8 max-w-xl mx-auto w-full pb-14">
          <p className="text-xl text-gray-400 mb-2">
            <strong className="text-white">Suíte {selectedSuite.number}</strong>
            {' '}— {SUITE_TYPE_LABEL[selectedSuite.type]}
          </p>
          {selectedSuite.equipment.length > 0 && (
            <p className="text-sm text-gray-500 mb-4">
              {selectedSuite.equipment.join(' · ')}
            </p>
          )}
          <p className="text-base text-gray-400 mb-6">Escolha a modalidade:</p>

          <div className="grid grid-cols-1 gap-4 mb-4">
            {allowed.map((value) => {
              const meta = STAY_TYPE_META[value];
              const v = selectedSuite.prices[value === 'estadia_2h' ? '2h' : 'pernoite'];
              return (
                <button
                  key={value}
                  onClick={() => setStayType(value)}
                  className={`rounded-2xl p-6 flex justify-between items-center border-2 transition-all shadow ${
                    stayType === value
                      ? 'border-blue-500 bg-blue-900/50'
                      : 'border-gray-700 bg-gray-800 hover:border-blue-400'
                  }`}
                >
                  <div className="text-left">
                    <p className="text-2xl font-black text-gray-100">{meta.label}</p>
                    <p className="text-sm text-gray-400 mt-1">{meta.sub}</p>
                  </div>
                  <span className="text-3xl font-bold text-blue-400">{formatBRL(v)}</span>
                </button>
              );
            })}
          </div>

          {/* Estimativa em tempo real — pré-pernoite */}
          {preEstimate && (
            <div className="bg-orange-900/30 border-2 border-orange-700 rounded-2xl p-5 mb-4 text-orange-100">
              <p className="text-sm font-bold uppercase tracking-widest text-orange-300 mb-2">
                Aviso · Pernoite antes da meia-noite
              </p>
              <p className="text-sm mb-1">
                Entrada às {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {' · '}
                Tempo até 00:00: {formatDuration(preEstimate.msUntilMidnight)}
              </p>
              <div className="flex justify-between text-base mt-2">
                <span>Adicional pré-meia-noite ({preEstimate.hours}h)</span>
                <span className="font-bold">{formatBRL(preEstimate.value)}</span>
              </div>
              <div className="flex justify-between text-base">
                <span>Pernoite</span>
                <span className="font-bold">{formatBRL(price)}</span>
              </div>
              <div className="flex justify-between text-lg pt-2 mt-2 border-t border-orange-700">
                <span className="font-bold">Total estimado (sem consumo)</span>
                <span className="font-black">{formatBRL(price + preEstimate.value)}</span>
              </div>
            </div>
          )}

          {error && <p className="text-red-600 text-center mb-4">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={!stayType || loading}
            className="w-full py-5 bg-green-600 text-white font-black text-2xl rounded-2xl hover:bg-green-700 disabled:opacity-40 transition-all"
          >
            {loading ? 'Registrando...' : 'Confirmar Entrada'}
          </button>

          <button
            onClick={() => setStep('select_suite')}
            className="block mt-4 text-gray-400 underline text-sm mx-auto"
          >
            ← Trocar suíte
          </button>
        </div>
      )}

      <StatusBar />
    </div>
  );
}
