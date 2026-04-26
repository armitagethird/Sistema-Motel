// Lógica pura de cobrança — sem dependências de UI/DB.
// Testável em isolamento. Timestamps sempre em UTC; conversão pra
// fuso local (America/Fortaleza, UTC-3, sem DST) só interna ao módulo.

import { StayType } from '../types';

export const HOUR_MS = 3_600_000;
export const TWO_HOURS_MS = 2 * HOUR_MS;
export const EXTRA_HOUR_VALUE = 15; // R$ por hora adicional iniciada
export const FORTALEZA_OFFSET_MIN = -180; // UTC-3
export const PERNOITE_END_HOUR = 6; // 06:00 horário local
export const PERNOITE_ALERT_MS = 30 * 60_000;

// Janela de troca de quarto sem cobrança após o check-in.
// Visível: 15min. Limite real (cortesia silenciosa): 17min.
export const SWAP_GRACE_MS = 15 * 60_000;
export const SWAP_HARD_LIMIT_MS = 17 * 60_000;

/**
 * Calcula o `expected_checkout_at` (em UTC) a partir do timestamp de
 * abertura e da modalidade.
 *
 * - estadia_2h: opened_at + 2h
 * - pernoite:   próximo 06:00 horário Fortaleza após opened_at
 *               (se entrou 22h dia X, sai 06h dia X+1;
 *                se entrou 02h dia X, sai 06h dia X)
 */
export function calcExpectedCheckout(openedAt: Date, type: StayType): Date {
  if (type === 'estadia_2h') {
    return new Date(openedAt.getTime() + TWO_HOURS_MS);
  }
  const localMs = openedAt.getTime() + FORTALEZA_OFFSET_MIN * 60_000;
  const local = new Date(localMs);
  const next = new Date(local);
  next.setUTCHours(PERNOITE_END_HOUR, 0, 0, 0);
  if (next.getTime() <= local.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return new Date(next.getTime() - FORTALEZA_OFFSET_MIN * 60_000);
}

/**
 * Próxima meia-noite local após `openedAt`, ou `null` se `openedAt`
 * já estiver dentro do período do pernoite (00:00–06:00 local).
 */
export function calcMidnightAfter(openedAt: Date): Date | null {
  const localMs = openedAt.getTime() + FORTALEZA_OFFSET_MIN * 60_000;
  const local = new Date(localMs);
  if (local.getUTCHours() < PERNOITE_END_HOUR) return null;
  const next = new Date(local);
  next.setUTCHours(24, 0, 0, 0);
  return new Date(next.getTime() - FORTALEZA_OFFSET_MIN * 60_000);
}

/**
 * Quantas horas pré-meia-noite são cobradas no pernoite.
 *
 * Hora iniciada já conta. Se `openedAt` já está em 00:00–06:00 local,
 * retorna 0. Calculado uma vez no check-in — valor fixo.
 */
export function calcPrePernoiteHours(openedAt: Date): number {
  const midnight = calcMidnightAfter(openedAt);
  if (!midnight) return 0;
  const diff = midnight.getTime() - openedAt.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / HOUR_MS);
}

/**
 * Quantas horas adicionais foram iniciadas após o período base.
 *
 * Regra única para ambas as modalidades — SEM tolerância: `now > expected`
 * por 1ms já conta como 1 hora. Aplica-se tanto à estadia 2h após as 2h
 * base, quanto ao pernoite após as 06:00 (fim do período fixo).
 *
 * Para o adicional pré-meia-noite do pernoite (entrada antes de 00:00),
 * use `calcPrePernoiteHours` — é cobrado em paralelo, não substitui este.
 */
export function calcExtraHours(
  expectedCheckoutAt: Date,
  now: Date
): number {
  const diff = now.getTime() - expectedCheckoutAt.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / HOUR_MS);
}

export function calcHourValue(hours: number): number {
  return hours * EXTRA_HOUR_VALUE;
}

export interface SwapWindow {
  msElapsed: number;
  msUntilGrace: number; // 0 quando passou 15min
  msUntilHard: number;  // 0 quando passou 17min
  canSwap: boolean;     // elapsed < 17min
  inGrace: boolean;     // elapsed >= 15min && elapsed < 17min
}

/**
 * Janela de troca de quarto sem cobrança a partir do check-in.
 * Conta sempre do `openedAt` original — trocas não resetam.
 */
export function calcSwapWindow(openedAt: Date, now: Date): SwapWindow {
  const msElapsed = now.getTime() - openedAt.getTime();
  return {
    msElapsed,
    msUntilGrace: Math.max(0, SWAP_GRACE_MS - msElapsed),
    msUntilHard:  Math.max(0, SWAP_HARD_LIMIT_MS - msElapsed),
    canSwap: msElapsed < SWAP_HARD_LIMIT_MS,
    inGrace: msElapsed >= SWAP_GRACE_MS && msElapsed < SWAP_HARD_LIMIT_MS,
  };
}

/** Total final cobrado: base + consumo + adicional 2h + pré-pernoite. */
export function calcGrandTotal(args: {
  basePrice: number;
  ordersTotal: number;
  extraValue: number;
  prePernoiteValue: number;
}): number {
  return args.basePrice + args.ordersTotal + args.extraValue + args.prePernoiteValue;
}

/**
 * ms até o próximo tick de cobrança (próxima hora iniciada).
 *
 * - Antes do `expected`: ms até atingir o `expected` (positivo).
 * - Após o `expected`: ms até a próxima hora cheia.
 *
 * Vale para ambas as modalidades — pernoite passa a ter cobrança por
 * hora após 06:00 igual à estadia.
 */
export function msUntilNextHour(
  expectedCheckoutAt: Date,
  now: Date
): number {
  const diff = now.getTime() - expectedCheckoutAt.getTime();
  if (diff <= 0) return -diff;
  const inCurrentHour = diff % HOUR_MS;
  return inCurrentHour === 0 ? HOUR_MS : HOUR_MS - inCurrentHour;
}

export type PernoiteState = 'n/a' | 'pre' | 'active' | 'overtime';

export interface CobrancaSnapshot {
  basePrice: number;
  ordersTotal: number;
  extraHours: number;
  extraValue: number;
  prePernoiteHours: number;
  prePernoiteValue: number;
  grandTotal: number;
  msSinceOpened: number;
  msUntilExpected: number; // negativo se já passou
  msUntilNextHour: number;
  msUntilMidnight: number; // negativo se já passou; 0 se não-aplicável
  pernoiteState: PernoiteState;
  isOvertime: boolean;
  pernoiteCloseAlert: boolean; // pernoite + faltam ≤30min para 06:00
}

/** Snapshot completo pra dashboard/checkout. */
export function snapshotCobranca(args: {
  openedAt: Date;
  expectedCheckoutAt: Date;
  type: StayType;
  basePrice: number;
  ordersTotal: number;
  now: Date;
  /** Sobrescreve cálculo automático — usar valor armazenado no DB. */
  prePernoiteHours?: number;
}): CobrancaSnapshot {
  const { openedAt, expectedCheckoutAt, type, basePrice, ordersTotal, now } = args;

  const extraHours = calcExtraHours(expectedCheckoutAt, now);
  const extraValue = calcHourValue(extraHours);

  const prePernoiteHours =
    type === 'pernoite'
      ? args.prePernoiteHours ?? calcPrePernoiteHours(openedAt)
      : 0;
  const prePernoiteValue = calcHourValue(prePernoiteHours);

  const msUntilExpected = expectedCheckoutAt.getTime() - now.getTime();
  const isOvertime = msUntilExpected < 0;

  let pernoiteState: PernoiteState = 'n/a';
  let msUntilMidnight = 0;
  if (type === 'pernoite') {
    const midnight = calcMidnightAfter(openedAt);
    if (isOvertime) {
      pernoiteState = 'overtime';
    } else if (midnight && now.getTime() < midnight.getTime()) {
      pernoiteState = 'pre';
      msUntilMidnight = midnight.getTime() - now.getTime();
    } else {
      pernoiteState = 'active';
    }
  }

  const pernoiteCloseAlert =
    type === 'pernoite' &&
    msUntilExpected > 0 &&
    msUntilExpected <= PERNOITE_ALERT_MS;

  return {
    basePrice,
    ordersTotal,
    extraHours,
    extraValue,
    prePernoiteHours,
    prePernoiteValue,
    grandTotal: calcGrandTotal({ basePrice, ordersTotal, extraValue, prePernoiteValue }),
    msSinceOpened: now.getTime() - openedAt.getTime(),
    msUntilExpected,
    msUntilNextHour: msUntilNextHour(expectedCheckoutAt, now),
    msUntilMidnight,
    pernoiteState,
    isOvertime,
    pernoiteCloseAlert,
  };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${m}min`;
}

export function formatBRL(v: number): string {
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

/**
 * Hora local Fortaleza (UTC-3) — usado pra restringir as opções de
 * modalidade no checkin (estadia/pernoite por horário).
 */
export function fortalezaHour(now: Date): number {
  const localMs = now.getTime() + FORTALEZA_OFFSET_MIN * 60_000;
  return new Date(localMs).getUTCHours();
}

/**
 * Quais modalidades podem ser oferecidas para o cliente nesse momento:
 * - Antes 22:00 e após 06:00: só estadia
 * - 22:00–23:59: ambas
 * - 00:00–05:59: só pernoite
 */
export function modalidadesDisponiveis(now: Date): StayType[] {
  const h = fortalezaHour(now);
  if (h >= 22) return ['estadia_2h', 'pernoite'];
  if (h < PERNOITE_END_HOUR) return ['pernoite'];
  return ['estadia_2h'];
}
