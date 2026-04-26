import { UserRole } from '../types';

export const PERMISSIONS = {
  marcar_suite_livre:       ['receptionist', 'manager', 'owner'],
  colocar_em_manutencao:    ['manager', 'owner'],
  liberar_manutencao:       ['manager', 'owner'],
  trocar_quarto:            ['receptionist', 'manager', 'owner'],

  adicionar_item:           ['receptionist', 'manager', 'owner'],
  repor_estoque:            ['receptionist', 'manager', 'owner'],
  remover_movimentacao:     ['manager', 'owner'],

  abrir_checkin:            ['receptionist', 'manager', 'owner'],
  fechar_checkout:          ['receptionist', 'manager', 'owner'],
  void_pagamento:           ['manager', 'owner'],

  abrir_turno:              ['receptionist', 'manager', 'owner'],
  fechar_turno:             ['receptionist', 'manager', 'owner'],
  ver_todos_turnos:         ['manager', 'owner'],

  ver_log_turno_proprio:    ['receptionist', 'manager', 'owner'],
  ver_log_completo:         ['manager', 'owner'],
  ver_audit_raw:            ['owner'],

  gerenciar_usuarios:       ['owner'],
  alterar_roles:            ['owner'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function temPermissao(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly string[]).includes(role);
}
