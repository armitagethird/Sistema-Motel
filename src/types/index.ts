export type UserRole = 'receptionist' | 'manager' | 'owner';

export interface Profile {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export type SuiteType = 'simples' | 'luxo' | 'super_luxo';
export type SuiteStatus = 'free' | 'occupied' | 'cleaning' | 'maintenance';
export type StayType = 'estadia_2h' | 'pernoite';
export type PaymentMethod = 'card' | 'cash' | 'pix';
export type PaymentStatus = 'pending' | 'confirmed' | 'void';
export type InventoryCategory =
  | 'alimentacao'
  | 'bombons'
  | 'bebidas'
  | 'diversos'
  | 'patrimonio';

export interface SuitePrices {
  '2h': number;
  pernoite: number;
}

export interface Suite {
  id: string;
  number: number;
  type: SuiteType;
  status: SuiteStatus;
  prices: SuitePrices;
  equipment: string[];
  updated_at?: string;
}

export interface InventoryMovement {
  id: string;
  inventory_id: string;
  stay_id?: string;
  user_id: string;
  quantity: number;
  reason?: string;
  offline_created: boolean;
  created_at: string;
  status: 'active' | 'cancelled';
  cancelled_by?: string;
  cancelled_at?: string;
  cancel_reason?: string;
}

export interface Stay {
  id: string;
  suite_id: string;
  opened_by: string;
  closed_by?: string;
  type: StayType;
  price: number;
  payment_method: PaymentMethod | null;
  payment_status: PaymentStatus;
  stone_order_id?: string;
  void_approved_by?: string;
  void_reason?: string;
  offline_created: boolean;
  opened_at: string;
  closed_at?: string;
  expected_checkout_at?: string;
  extra_hours: number;
  extra_value: number;
  pre_pernoite_value: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  quantity: number;
  min_quantity: number;
  unit_price: number;
}

export interface Shift {
  id: string;
  user_id: string;
  started_at: string;
  ended_at?: string;
  expected_cash?: number;
  reported_cash?: number;
  difference?: number;
  signature?: string;
}

export interface OfflineOperation {
  id: string;
  type: 'checkin' | 'checkout' | 'inventory_movement';
  payload: Record<string, unknown>;
  created_at: string;
  synced: boolean;
}

export type ConnStatus = 'online' | 'offline' | 'syncing';
export type Screen = 'login' | 'home' | 'checkin' | 'checkout' | 'estoque' | 'turno' | 'quartos' | 'auditoria';

export type LogActionType =
  | 'app_start'
  | 'login'
  | 'logout'
  | 'shift_open'
  | 'shift_close'
  | 'checkin'
  | 'checkout'
  | 'payment_confirmed'
  | 'void_attempt'
  | 'void_success'
  | 'void_denied'
  | 'room_order_add'
  | 'room_order_remove'
  | 'inventory_restock'
  | 'inventory_correction'
  | 'suite_status_update'
  | 'room_swap'
  | 'overtime_alert'
  | 'pernoite_close_alert'
  | 'offline_enter'
  | 'offline_exit'
  | 'sync_flush'
  | 'update_check'
  | 'update_install';

export interface OrderItem {
  id: string;
  quantity: number;
  created_at: string;
  inventory_id: string;
  inventory: { name: string; unit_price: number };
}

export const SUITE_TYPE_LABEL: Record<SuiteType, string> = {
  simples:    'Simples',
  luxo:       'Luxo',
  super_luxo: 'Super Luxo',
};

export const STAY_TYPE_LABEL: Record<StayType, string> = {
  estadia_2h: 'Estadia 2h',
  pernoite:   'Pernoite',
};

export const INVENTORY_CATEGORY_LABEL: Record<InventoryCategory, string> = {
  alimentacao: 'Alimentação',
  bombons:     'Bombons',
  bebidas:     'Bebidas',
  diversos:    'Diversos',
  patrimonio:  'Patrimônio',
};
