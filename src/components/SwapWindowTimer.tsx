import { useEffect, useState } from 'react';
import { calcSwapWindow } from '../lib/cobranca';

function formatMMSS(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function SwapWindowTimer({ openedAt }: { openedAt: string }) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const swap = calcSwapWindow(new Date(openedAt), now);
  if (!swap.canSwap) return null;

  if (swap.inGrace) {
    return (
      <div className="mt-3 px-3 py-2 rounded-lg bg-red-900/40 border border-red-500/50 text-red-200 text-xs font-semibold">
        ⚠ Cortesia: {formatMMSS(swap.msUntilHard)} para trocar de quarto
      </div>
    );
  }

  return (
    <div className="mt-3 px-3 py-2 rounded-lg bg-orange-900/40 border border-orange-500/50 text-orange-200 text-xs font-semibold">
      Janela de troca livre: {formatMMSS(swap.msUntilGrace)} restantes
    </div>
  );
}
