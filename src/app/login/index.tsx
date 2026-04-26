import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../lib/store';
import { logAction } from '../../lib/logger';
import { Profile } from '../../types';

interface LoginProps {
  onLogin: () => void;
}

export function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const setProfile = useAppStore((s) => s.setProfile);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    setError('');

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError('E-mail ou senha inválidos');
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      setError('Perfil não encontrado. Contate o gerente.');
      setLoading(false);
      return;
    }

    if (!profile.active) {
      setError('Usuário inativo. Contate o gerente.');
      setLoading(false);
      return;
    }

    setProfile(profile as Profile);
    logAction('login');
    onLogin();
  }

  return (
    <div className="h-screen bg-gray-900 flex items-center justify-center overflow-y-auto">
      <div className="bg-white rounded-2xl p-10 w-[420px] shadow-2xl">
        <div className="flex justify-center mb-4">
          <img
            src="/logo.jpg"
            alt="Paraíso Motel"
            className="h-32 object-contain"
          />
        </div>
        <p className="text-gray-400 text-center text-lg mb-8">Recepção</p>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && passwordRef.current?.focus()}
            className="border-2 border-gray-200 rounded-xl px-4 py-4 text-xl focus:border-blue-500 outline-none transition-colors"
          />
          <input
            ref={passwordRef}
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="border-2 border-gray-200 rounded-xl px-4 py-4 text-xl focus:border-blue-500 outline-none transition-colors"
          />

          {error && (
            <p className="text-red-600 text-center font-medium">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading || !email || !password}
            className="bg-blue-600 text-white font-bold text-xl py-4 rounded-xl hover:bg-blue-700 active:bg-blue-800 disabled:opacity-40 transition-all mt-2"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
