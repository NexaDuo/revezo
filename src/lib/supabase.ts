import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-project') &&
  !supabaseAnonKey.includes('your-anon-key')
);

// Fallback seguro caso as chaves ainda não tenham sido inseridas no .env
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE: a volta do Google traz só um `?code=` de uso único (trocado e
        // removido da URL pelo supabase-js), em vez de `#access_token=...`
        // que o Clarity poderia gravar junto com a URL da página.
        flowType: 'pkce',
      },
    })
  : createClient('https://placeholder-revezo.supabase.co', 'placeholder-anon-key', {
      auth: { persistSession: false },
    });
