import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { supabase } from '../../lib/supabase';
import { StatusBar } from '../../components/StatusBar';
import { useAppStore } from '../../lib/store';
import {
  checkForUpdate,
  downloadAndInstall,
  getCurrentVersion,
} from '../../lib/updater';

interface AuditoriaProps {
  onBack: () => void;
}

interface LocalLogEntry {
  ts: string;
  action: string;
  conn?: string;
  user_name?: string;
  role?: string;
  shift_id?: string;
  [key: string]: unknown;
}

interface AuditEntry {
  id: string;
  user_id?: string;
  table_name: string;
  operation: string;
  old_data?: Record<string, unknown>;
  new_data?: Record<string, unknown>;
  created_at: string;
}

interface AuthLogEntry {
  entry_id: string;
  created_at: string;
  ip_address?: string;
  action?: string;
  actor_id?: string;
  actor_email?: string;
}

interface Profile {
  id: string;
  name: string;
}

type Tab = 'local' | 'supabase' | 'auth' | 'update';

const AUTH_ACTION_COLOR: Record<string, string> = {
  login:                        'text-green-400',
  logout:                       'text-gray-400',
  token_refreshed:              'text-blue-400',
  user_signedup:                'text-purple-400',
  user_deleted:                 'text-red-400',
  user_updated_password:        'text-yellow-400',
  password_recovery_requested:  'text-orange-400',
  mfa_code_login:               'text-cyan-400',
  factor_in_progress:           'text-cyan-300',
};

export function Auditoria({ onBack }: AuditoriaProps) {
  const [tab,           setTab]           = useState<Tab>('local');
  const [selectedDate,  setSelectedDate]  = useState(new Date().toISOString().slice(0, 10));
  const [localLogs,     setLocalLogs]     = useState<LocalLogEntry[]>([]);
  const [localLoading,  setLocalLoading]  = useState(false);
  const [actionFilter,  setActionFilter]  = useState('');
  const [auditRows,     setAuditRows]     = useState<AuditEntry[]>([]);
  const [auditLoading,  setAuditLoading]  = useState(false);
  const [profiles,      setProfiles]      = useState<Profile[]>([]);
  const [filterUser,    setFilterUser]    = useState('');
  const [filterTable,   setFilterTable]   = useState('');
  const [expandedRow,   setExpandedRow]   = useState<string | null>(null);
  const [authLogs,      setAuthLogs]      = useState<AuthLogEntry[]>([]);
  const [authLoading,   setAuthLoading]   = useState(false);
  const [authFilter,    setAuthFilter]    = useState('');
  const [authError,     setAuthError]     = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [installing, setInstalling] = useState(false);
  const updateStatus = useAppStore((s) => s.updateStatus);
  const isTauri = '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    if (tab === 'local') loadLocalLogs();
    if (tab === 'supabase') loadAuditLogs();
    if (tab === 'auth') loadAuthLogs();
  }, [tab, selectedDate]);

  useEffect(() => {
    supabase.from('profiles').select('id, name').then(({ data }) => {
      if (data) setProfiles(data as Profile[]);
    });
    getCurrentVersion().then(setCurrentVersion);
  }, []);

  async function handleInstall() {
    setInstalling(true);
    try {
      await downloadAndInstall();
    } catch (e) {
      console.error('[update] install failed:', e);
      setInstalling(false);
    }
  }

  async function loadLocalLogs() {
    setLocalLoading(true);
    try {
      if (isTauri) {
        const lines = await invoke<string[]>('read_local_logs', { date: selectedDate });
        const parsed = lines
          .map((l) => { try { return JSON.parse(l) as LocalLogEntry; } catch { return null; } })
          .filter((e): e is LocalLogEntry => e !== null)
          .reverse();
        setLocalLogs(parsed);
      } else {
        setLocalLogs([]);
      }
    } catch (e) {
      console.error('read_local_logs:', e);
      setLocalLogs([]);
    }
    setLocalLoading(false);
  }

  async function loadAuthLogs() {
    setAuthLoading(true);
    setAuthError('');
    const { data, error } = await supabase.rpc('get_auth_audit_logs', { lim: 200 });
    if (error) {
      console.error('[auth logs] RPC error:', error.code, error.message, error.details);
      setAuthError(`${error.code}: ${error.message}`);
    }
    if (!error && data) setAuthLogs(data as AuthLogEntry[]);
    setAuthLoading(false);
  }

  async function loadAuditLogs() {
    setAuditLoading(true);
    const { data } = await supabase
      .from('audit_log')
      .select('id, user_id, table_name, operation, old_data, new_data, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (data) setAuditRows(data as AuditEntry[]);
    setAuditLoading(false);
  }

  const allActions = Array.from(new Set(localLogs.map((e) => e.action))).sort();

  const filteredLocal = actionFilter
    ? localLogs.filter((e) => e.action === actionFilter)
    : localLogs;

  const filteredAudit = auditRows.filter((r) => {
    if (filterUser && r.user_id !== filterUser) return false;
    if (filterTable && r.table_name !== filterTable) return false;
    return true;
  });

  const allTables = Array.from(new Set(auditRows.map((r) => r.table_name))).sort();

  function profileName(userId?: string) {
    if (!userId) return '—';
    return profiles.find((p) => p.id === userId)?.name ?? userId.slice(0, 8);
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <header className="bg-gray-900 text-white px-8 py-5 flex items-center gap-4 shrink-0">
        <button onClick={onBack} className="text-3xl hover:text-gray-300 leading-none">←</button>
        <h1 className="text-3xl font-black">Auditoria</h1>
        <span className="ml-auto text-xs text-gray-500 uppercase tracking-widest">Owner</span>
      </header>

      {/* Abas */}
      <div className="flex shrink-0 bg-gray-900 border-b border-gray-800">
        {(['local', 'supabase', 'auth', 'update'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-8 py-3 text-sm font-bold uppercase tracking-wide transition-colors ${
              tab === t
                ? 'text-white border-b-2 border-yellow-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t === 'local' ? 'Logs Locais'
              : t === 'supabase' ? 'Audit Supabase'
              : t === 'auth' ? 'Auth Eventos'
              : 'Atualização'}
            {t === 'update' && updateStatus.state === 'available' && (
              <span className="ml-2 text-yellow-400">⚡</span>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-14 p-5">
        {tab === 'local' && (
          <>
            {/* Filtros */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 text-sm"
              />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 text-sm"
              >
                <option value="">Todas as actions</option>
                {allActions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              {!isTauri && (
                <span className="text-yellow-500 text-xs self-center">
                  Logs locais disponíveis apenas no app Tauri
                </span>
              )}
            </div>

            {localLoading ? (
              <div className="text-gray-500 text-center py-12">Carregando...</div>
            ) : filteredLocal.length === 0 ? (
              <div className="text-gray-600 text-center py-12">Nenhum log encontrado</div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredLocal.map((entry, i) => (
                  <div key={i} className="bg-gray-800 rounded-xl px-4 py-3 flex flex-col gap-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-gray-400 text-xs font-mono">
                        {new Date(entry.ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                      <span className="text-yellow-400 text-xs font-bold uppercase">{entry.action}</span>
                      {entry.user_name && (
                        <span className="text-gray-300 text-xs">{entry.user_name}</span>
                      )}
                      {entry.conn === 'offline' && (
                        <span className="text-red-400 text-xs">offline</span>
                      )}
                    </div>
                    <div className="text-gray-500 text-xs font-mono truncate">
                      {Object.entries(entry)
                        .filter(([k]) => !['ts', 'action', 'conn', 'user_id', 'user_name', 'role', 'shift_id'].includes(k))
                        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
                        .join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'auth' && (
          <>
            <div className="flex gap-3 mb-4 flex-wrap items-center">
              <select
                value={authFilter}
                onChange={(e) => setAuthFilter(e.target.value)}
                className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 text-sm"
              >
                <option value="">Todos os eventos</option>
                {Array.from(new Set(authLogs.map((e) => e.action).filter(Boolean))).sort().map((a) => (
                  <option key={a} value={a!}>{a}</option>
                ))}
              </select>
              <button
                onClick={loadAuthLogs}
                className="bg-gray-700 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-gray-600"
              >
                Atualizar
              </button>
              <span className="text-gray-600 text-xs ml-auto">
                últimos 200 eventos · via auth.audit_log_entries
              </span>
            </div>

            {authLoading ? (
              <div className="text-gray-500 text-center py-12">Carregando...</div>
            ) : authError ? (
              <div className="bg-red-900/40 border border-red-700 rounded-xl px-4 py-6 text-center">
                <p className="text-red-400 font-bold mb-1">Erro ao carregar Auth Eventos</p>
                <p className="text-red-300 text-xs font-mono">{authError}</p>
              </div>
            ) : authLogs.length === 0 ? (
              <div className="text-gray-600 text-center py-12">Nenhum evento encontrado</div>
            ) : (
              <div className="flex flex-col gap-1">
                {(authFilter ? authLogs.filter((e) => e.action === authFilter) : authLogs).map((entry) => (
                  <div key={entry.entry_id} className="bg-gray-800 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
                    <span className="text-gray-400 text-xs font-mono shrink-0">
                      {new Date(entry.created_at).toLocaleString('pt-BR')}
                    </span>
                    <span className={`text-xs font-bold uppercase shrink-0 ${AUTH_ACTION_COLOR[entry.action ?? ''] ?? 'text-white'}`}>
                      {entry.action ?? '—'}
                    </span>
                    <span className="text-gray-300 text-xs truncate flex-1">
                      {entry.actor_email ?? entry.actor_id?.slice(0, 8) ?? '—'}
                    </span>
                    {entry.ip_address && (
                      <span className="text-gray-600 text-xs font-mono shrink-0">{entry.ip_address}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === 'update' && (
          <div className="max-w-2xl mx-auto flex flex-col gap-4">
            {!isTauri && (
              <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl px-4 py-4">
                <p className="text-yellow-300 text-sm">
                  Atualização só disponível no app instalado (não no <code className="bg-black/30 px-1 rounded">npm run dev</code>).
                </p>
              </div>
            )}

            <div className="bg-gray-800 rounded-2xl p-6">
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-gray-400 text-sm">Versão instalada</span>
                <span className="text-white text-2xl font-mono font-bold">{currentVersion || '...'}</span>
              </div>
              {(updateStatus.state === 'up_to_date' ||
                updateStatus.state === 'available' ||
                updateStatus.state === 'error') && (
                <div className="flex items-baseline justify-between text-xs text-gray-500">
                  <span>Última checagem</span>
                  <span>{new Date(updateStatus.checkedAt).toLocaleTimeString('pt-BR')}</span>
                </div>
              )}
            </div>

            {updateStatus.state === 'idle' && (
              <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-400">
                Clique em "Verificar agora" pra checar atualizações.
              </div>
            )}
            {updateStatus.state === 'checking' && (
              <div className="bg-blue-900/40 border border-blue-700 rounded-2xl p-6 text-center text-blue-300">
                Verificando...
              </div>
            )}
            {updateStatus.state === 'up_to_date' && (
              <div className="bg-green-900/40 border border-green-700 rounded-2xl p-6 text-center">
                <p className="text-green-300 text-lg font-bold">✓ Sistema atualizado</p>
              </div>
            )}
            {updateStatus.state === 'available' && (
              <div className="bg-yellow-900/40 border border-yellow-600 rounded-2xl p-6">
                <p className="text-yellow-200 text-lg font-bold mb-1">
                  ⚡ Atualização disponível: {updateStatus.version}
                </p>
                {updateStatus.notes && (
                  <pre className="text-yellow-100 text-sm font-mono whitespace-pre-wrap mt-3 bg-black/20 rounded-lg p-3 max-h-48 overflow-auto">
                    {updateStatus.notes}
                  </pre>
                )}
              </div>
            )}
            {updateStatus.state === 'downloading' && (
              <div className="bg-blue-900/40 border border-blue-700 rounded-2xl p-6">
                <p className="text-blue-200 text-lg font-bold mb-3">
                  Baixando {updateStatus.version}...
                </p>
                <div className="bg-black/30 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full transition-all"
                    style={{
                      width: updateStatus.total > 0
                        ? `${Math.round((updateStatus.downloaded / updateStatus.total) * 100)}%`
                        : '5%',
                    }}
                  />
                </div>
                <p className="text-xs text-blue-300 mt-2 text-center">
                  {updateStatus.total > 0
                    ? `${(updateStatus.downloaded / 1024 / 1024).toFixed(1)} MB de ${(updateStatus.total / 1024 / 1024).toFixed(1)} MB`
                    : 'iniciando...'}
                </p>
              </div>
            )}
            {updateStatus.state === 'installing' && (
              <div className="bg-purple-900/40 border border-purple-700 rounded-2xl p-6 text-center">
                <p className="text-purple-200 text-lg font-bold">
                  Instalando {updateStatus.version}... O app vai reiniciar.
                </p>
              </div>
            )}
            {updateStatus.state === 'error' && (
              <div className="bg-red-900/40 border border-red-700 rounded-2xl p-6">
                <p className="text-red-300 text-lg font-bold mb-2">Erro ao verificar/atualizar</p>
                <p className="text-red-200 text-xs font-mono">{updateStatus.error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={checkForUpdate}
                disabled={
                  updateStatus.state === 'checking' ||
                  updateStatus.state === 'downloading' ||
                  updateStatus.state === 'installing' ||
                  installing
                }
                className="flex-1 py-3 rounded-xl bg-gray-700 text-white font-bold hover:bg-gray-600 disabled:opacity-40"
              >
                Verificar agora
              </button>
              {updateStatus.state === 'available' && (
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="flex-1 py-3 rounded-xl bg-yellow-500 text-gray-900 font-black hover:bg-yellow-400 disabled:opacity-40"
                >
                  {installing ? 'Instalando...' : 'Instalar e reiniciar agora'}
                </button>
              )}
            </div>

            <p className="text-xs text-gray-600 text-center mt-2">
              Atualizações assinadas digitalmente. Apenas builds do dono são aceitas.
            </p>
          </div>
        )}

        {tab === 'supabase' && (
          <>
            {/* Filtros */}
            <div className="flex gap-3 mb-4 flex-wrap">
              <select
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
                className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 text-sm"
              >
                <option value="">Todos os usuários</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <select
                value={filterTable}
                onChange={(e) => setFilterTable(e.target.value)}
                className="bg-gray-800 text-white border border-gray-700 rounded-xl px-4 py-2 text-sm"
              >
                <option value="">Todas as tabelas</option>
                {allTables.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button
                onClick={loadAuditLogs}
                className="bg-gray-700 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-gray-600"
              >
                Atualizar
              </button>
            </div>

            {auditLoading ? (
              <div className="text-gray-500 text-center py-12">Carregando...</div>
            ) : filteredAudit.length === 0 ? (
              <div className="text-gray-600 text-center py-12">Nenhum registro encontrado</div>
            ) : (
              <div className="flex flex-col gap-1">
                {filteredAudit.map((row) => (
                  <div key={row.id} className="bg-gray-800 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedRow(expandedRow === row.id ? null : row.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-gray-750"
                    >
                      <span className="text-gray-400 text-xs font-mono shrink-0">
                        {new Date(row.created_at).toLocaleString('pt-BR')}
                      </span>
                      <span className="text-gray-300 text-xs">{profileName(row.user_id)}</span>
                      <span className="text-yellow-400 text-xs font-bold uppercase">{row.operation}</span>
                      <span className="text-gray-500 text-xs">{row.table_name}</span>
                      <span className="ml-auto text-gray-600 text-xs">
                        {expandedRow === row.id ? '▲' : '▼'}
                      </span>
                    </button>

                    {expandedRow === row.id && (
                      <div className="px-4 pb-4 flex flex-col gap-2 border-t border-gray-700 pt-3">
                        {row.old_data && (
                          <div>
                            <p className="text-gray-500 text-xs uppercase mb-1">Antes</p>
                            <pre className="text-gray-300 text-xs font-mono bg-gray-900 rounded-lg p-3 overflow-auto max-h-32">
                              {JSON.stringify(row.old_data, null, 2)}
                            </pre>
                          </div>
                        )}
                        {row.new_data && (
                          <div>
                            <p className="text-gray-500 text-xs uppercase mb-1">Depois</p>
                            <pre className="text-green-300 text-xs font-mono bg-gray-900 rounded-lg p-3 overflow-auto max-h-32">
                              {JSON.stringify(row.new_data, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <StatusBar />
    </div>
  );
}
