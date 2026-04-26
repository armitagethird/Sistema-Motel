import { useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../lib/store';
import { AppHeader } from '../../components/AppHeader';
import { BigButton } from '../../components/BigButton';
import { StatusBar } from '../../components/StatusBar';
import { PermissionGate } from '../../components/PermissionGate';
import { Suite, Screen } from '../../types';

interface HomeProps {
  onNavigate: (screen: Screen) => void;
  onLogout: () => void;
}

export function Home({ onNavigate, onLogout }: HomeProps) {
  const profile = useAppStore((s) => s.profile);
  const suites = useAppStore((s) => s.suites);
  const setSuites = useAppStore((s) => s.setSuites);
  const setConnStatus = useAppStore((s) => s.setConnStatus);

  useEffect(() => {
    loadSuites();

    const channel = supabase
      .channel('suites-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suites' }, () => {
        loadSuites();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadSuites() {
    try {
      const { data, error } = await supabase
        .from('suites')
        .select('*')
        .order('number');
      if (error) throw error;
      setSuites(data as Suite[]);
      setConnStatus('online');
    } catch {
      setConnStatus('offline');
    }
  }

  const occupied = suites.filter((s) => s.status === 'occupied').length;
  const free = suites.filter((s) => s.status === 'free').length;

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      <AppHeader
        userName={profile?.name ?? ''}
        occupiedCount={occupied}
        freeCount={free}
        onLogout={handleLogout}
      />

      <div className="flex-1 min-h-0 p-6 pb-14 flex flex-col gap-4">
        {/* Botão Quartos — altura fixa, não expande */}
        <div className="shrink-0 h-20">
          <BigButton
            label={`Quartos — ${occupied} ocupados · ${free} livres`}
            onClick={() => onNavigate('quartos')}
            color="blue"
            icon="🛏️"
          />
        </div>

        {/* Grade 2×2 — ocupa o restante do espaço */}
        <div className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-4">
          <BigButton
            label="Entrada"
            onClick={() => onNavigate('checkin')}
            color="green"
            icon="🏨"
          />
          <BigButton
            label="Saída"
            onClick={() => onNavigate('checkout')}
            color="red"
            icon="🔑"
          />
          <BigButton
            label="Produtos"
            onClick={() => onNavigate('estoque')}
            color="yellow"
            icon="🍺"
          />
          <BigButton
            label="Fechar Turno"
            onClick={() => onNavigate('turno')}
            color="gray"
            icon="📋"
          />
        </div>

        {/* Botão Auditoria — apenas owner */}
        {profile && (
          <PermissionGate permission="ver_audit_raw" role={profile.role}>
            <div className="shrink-0 h-16">
              <BigButton
                label="Auditoria"
                onClick={() => onNavigate('auditoria')}
                color="gray"
                icon="🔍"
              />
            </div>
          </PermissionGate>
        )}
      </div>

      <StatusBar />
    </div>
  );
}
