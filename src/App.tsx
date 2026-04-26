import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { useAppStore } from './lib/store';
import { startConnectivityWatcher } from './lib/offline';
import { logAction } from './lib/logger';
import { checkForUpdate } from './lib/updater';
import { Login } from './app/login';
import { Home } from './app/home';
import { Checkin } from './app/checkin';
import { Checkout } from './app/checkout';
import { Estoque } from './app/estoque';
import { Turno } from './app/turno';
import { Quartos } from './app/quartos';
import { Auditoria } from './app/auditoria';
import { Screen } from './types';

export default function App() {
  const [screen, setScreen] = useState<Screen>('login');
  const setProfile      = useAppStore((s) => s.setProfile);
  const setCurrentShift = useAppStore((s) => s.setCurrentShift);

  useEffect(() => {
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setProfile(null);
          setScreen('login');
        }
      }
    );

    logAction('app_start');
    const connectivityTimer = startConnectivityWatcher();

    return () => {
      authListener.subscription.unsubscribe();
      clearInterval(connectivityTimer);
    };
  }, []);

  async function handleLogin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existingShift } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .limit(1)
      .single();

    if (existingShift) {
      setCurrentShift(existingShift);
    } else {
      const { data: shift } = await supabase
        .from('shifts')
        .insert({ user_id: user.id })
        .select()
        .single();
      if (shift) {
        setCurrentShift(shift);
        logAction('shift_open', { shift_id: shift.id });
      }
    }
    setScreen('home');

    const profile = useAppStore.getState().profile;
    if (profile?.role === 'owner') {
      checkForUpdate().catch((e) => console.warn('[updater] check failed:', e));
    }
  }

  function handleLogout() {
    logAction('logout');
    setCurrentShift(null);
    setScreen('login');
  }

  return (
    <>
      {screen === 'login'     && <Login onLogin={handleLogin} />}
      {screen === 'home'      && <Home onNavigate={setScreen} onLogout={handleLogout} />}
      {screen === 'checkin'   && <Checkin onBack={() => setScreen('home')} />}
      {screen === 'checkout'  && <Checkout onBack={() => setScreen('home')} />}
      {screen === 'estoque'   && <Estoque onBack={() => setScreen('home')} />}
      {screen === 'turno'     && <Turno onBack={() => setScreen('home')} />}
      {screen === 'quartos'   && <Quartos onBack={() => setScreen('home')} />}
      {screen === 'auditoria' && <Auditoria onBack={() => setScreen('home')} />}
    </>
  );
}
