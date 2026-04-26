import { invoke } from '@tauri-apps/api/core';
import type { Suite } from '../types';

export const tauriCommands = {
  dbGetSuites: () => invoke<Suite[]>('db_get_suites'),
  dbSyncSuites: (suites: Suite[]) => invoke<void>('db_sync_suites', { suites }),
  dbEnqueueOperation: (op: Record<string, unknown>) =>
    invoke<void>('db_enqueue_operation', { op }),
  dbGetPendingOperations: () =>
    invoke<Record<string, unknown>[]>('db_get_pending_operations'),
  dbMarkSynced: (id: string) => invoke<void>('db_mark_synced', { id }),
  stoneCreateOrder: (amount: number, description: string) =>
    invoke<string>('stone_create_order', { amount, description }),
  stoneCancelOrder: (orderId: string) =>
    invoke<void>('stone_cancel_order', { orderId }),
  authLogout: () => invoke<void>('auth_logout'),
  authNotifyVoid: (approverName: string, suiteNumber: number, reason: string) =>
    invoke<void>('auth_notify_void', { approverName, suiteNumber, reason }),
  authNotifyOvertime: (
    suiteNumber: number,
    extraHours: number,
    extraValue: number,
    minutesOverdue: number,
  ) =>
    invoke<void>('auth_notify_overtime', {
      suiteNumber,
      extraHours,
      extraValue,
      minutesOverdue,
    }),
  authNotifyPernoiteClose: (suiteNumber: number, minutesLeft: number) =>
    invoke<void>('auth_notify_pernoite_close', { suiteNumber, minutesLeft }),
  syncAll: () => invoke<void>('sync_all'),
};
