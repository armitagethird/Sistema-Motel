import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Configuração ausente: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas em .env antes do build.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
