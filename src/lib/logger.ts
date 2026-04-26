import { invoke } from '@tauri-apps/api/core';
import { supabase } from './supabase';
import { useAppStore } from './store';
import type { LogActionType } from '../types';

const SUPABASE_EVENTS: LogActionType[] = [
  'app_start',
  'login',
  'logout',
  'shift_open',
  'shift_close',
  'checkin',
  'checkout',
  'void_attempt',
  'void_success',
  'void_denied',
  'room_order_add',
  'room_order_remove',
  'suite_status_update',
  'room_swap',
  'offline_enter',
  'offline_exit',
  'inventory_restock',
  'inventory_correction',
  'update_check',
  'update_install',
];

export async function logAction(
  action: LogActionType,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const { profile, currentShift, connStatus } = useAppStore.getState();

  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    action,
    conn: connStatus,
    ...(profile && {
      user_id: profile.id,
      user_name: profile.name,
      role: profile.role,
    }),
    ...(currentShift && { shift_id: currentShift.id }),
    ...extra,
  };

  // Escrita local — fire-and-forget, nunca bloqueia a UI
  if ('__TAURI_INTERNALS__' in window) {
    invoke('write_local_log', { entry }).catch((e) =>
      console.error('[logger] write_local_log falhou:', e)
    );
  } else {
    console.log('[LOG local — Tauri não disponível]', JSON.stringify(entry));
  }

  // Eventos de aplicação que o trigger do Supabase não cobre
  if (SUPABASE_EVENTS.includes(action)) {
    Promise.resolve(
      supabase.from('audit_log').insert({
        user_id: profile?.id ?? null,
        table_name: 'app',
        operation: action,
        new_data: entry,
      })
    )
      .then(({ error }) => {
        if (error) console.error('[logger] audit_log insert falhou:', error.message);
      })
      .catch((err) => {
        console.error('[logger] audit_log erro de rede:', err);
      });
  }
}
