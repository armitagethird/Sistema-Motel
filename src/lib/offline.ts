import { supabase } from './supabase';
import { useAppStore } from './store';
import { logAction } from './logger';

interface PendingOp {
  type: 'checkin' | 'checkout' | 'inventory_movement' | 'suite_status_update' | 'room_swap';
  payload: Record<string, unknown>;
}

const QUEUE_KEY = 'paraiso_offline_queue';

function loadQueue(): PendingOp[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue: PendingOp[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export function enqueueOperation(op: PendingOp) {
  const queue = loadQueue();
  queue.push(op);
  saveQueue(queue);
}

export async function syncPendingOperations(): Promise<void> {
  const queue = loadQueue();
  if (queue.length === 0) return;

  const setConnStatus = useAppStore.getState().setConnStatus;
  setConnStatus('syncing');

  const remaining: PendingOp[] = [];

  for (const op of queue) {
    try {
      if (op.type === 'checkin') {
        const { error } = await supabase.from('stays').insert(op.payload);
        if (error) throw error;
        await supabase
          .from('suites')
          .update({ status: 'occupied' })
          .eq('id', op.payload.suite_id);
      } else if (op.type === 'checkout') {
        const { error } = await supabase
          .from('stays')
          .update(op.payload)
          .eq('id', op.payload.id);
        if (error) throw error;
      } else if (op.type === 'inventory_movement') {
        const { error } = await supabase.from('inventory_movements').insert(op.payload);
        if (error) throw error;
      } else if (op.type === 'suite_status_update') {
        const { error } = await supabase
          .from('suites')
          .update({ status: op.payload.status })
          .eq('id', op.payload.suite_id);
        if (error) throw error;
      } else if (op.type === 'room_swap') {
        const stayUpd = await supabase
          .from('stays')
          .update({ suite_id: op.payload.new_suite_id, price: op.payload.new_price })
          .eq('id', op.payload.stay_id);
        if (stayUpd.error) throw stayUpd.error;
        const newOcc = await supabase
          .from('suites')
          .update({ status: 'occupied', updated_at: new Date().toISOString() })
          .eq('id', op.payload.new_suite_id);
        if (newOcc.error) throw newOcc.error;
        const oldClean = await supabase
          .from('suites')
          .update({ status: 'cleaning', updated_at: new Date().toISOString() })
          .eq('id', op.payload.old_suite_id);
        if (oldClean.error) throw oldClean.error;
      }
    } catch {
      remaining.push(...queue.slice(queue.indexOf(op)));
      break;
    }
  }

  saveQueue(remaining);
  setConnStatus(remaining.length > 0 ? 'offline' : 'online');
}

export function startConnectivityWatcher() {
  const check = async () => {
    const { connStatus, setConnStatus } = useAppStore.getState();
    try {
      const { error } = await supabase.from('suites').select('id').limit(1);
      if (error) throw error;
      const queue = loadQueue();
      if (queue.length > 0) {
        await syncPendingOperations();
      } else {
        if (connStatus === 'offline') logAction('offline_exit');
        setConnStatus('online');
      }
    } catch {
      if (connStatus !== 'offline') logAction('offline_enter');
      setConnStatus('offline');
    }
  };

  check();
  return setInterval(check, 30_000);
}
