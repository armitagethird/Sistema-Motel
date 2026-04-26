import { SuiteStatus } from '../types';

export const STATUS_TRANSITIONS: Record<SuiteStatus, SuiteStatus[]> = {
  free:        ['occupied', 'maintenance'],
  occupied:    ['cleaning'],
  cleaning:    ['free'],
  maintenance: ['free'],
};

export function transicaoValida(atual: SuiteStatus, novo: SuiteStatus): boolean {
  return STATUS_TRANSITIONS[atual]?.includes(novo) ?? false;
}
