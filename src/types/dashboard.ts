export type SuiteStatus = 'free' | 'occupied' | 'cleaning' | 'maintenance';
export type SuiteType   = 'simples' | 'luxo' | 'super_luxo';
export type StayType    = 'estadia_2h' | 'pernoite';

export interface SuiteLive {
  id: string;
  numero: number;
  tipo: SuiteType;
  status: SuiteStatus;
  precos: { '2h': number; pernoite: number };
  equipamentos: string[];
  stayId?: string;
  modalidade?: StayType;
  openedAt?: string;
  expectedCheckoutAt?: string;
  paymentMethod?: string;
  funcionarioNome?: string;
  minutosOcupada?: number;
  minutosNoStatusAtual: number;
}

export interface ReceitaHoje {
  paymentMethod: string;
  quantidade: number;
  total: number;
}

export interface TurnoAtivo {
  id: string;
  startedAt: string;
  funcionario: string;
  role: string;
  staysNoTurno: number;
  caixaParcial: number;
}

export interface AlertaPendente {
  tipo: 'divergencia_caixa' | 'void_realizado' | 'estoque_critico';
  referenciaId: string;
  descricao: string;
  geradoEm: string;
  severidade: 'critica' | 'alta' | 'media';
}

export interface DashboardSnapshot {
  suites: SuiteLive[];
  receitaHoje: ReceitaHoje[];
  receitaTotal: number;
  turnosAtivos: TurnoAtivo[];
  alertasPendentes: AlertaPendente[];
  suitesOcupadas: number;
  suitesLivres: number;
  suitesLimpeza: number;
  suitesManutencao: number;
}
