import { createClient } from '@supabase/supabase-js';

let browserClient = null;

export function createBrowserSupabaseClient({
  url = import.meta.env?.VITE_SUPABASE_URL,
  publishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env?.VITE_SUPABASE_ANON_KEY,
  clientFactory = createClient,
} = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('Configuration Supabase invalide : VITE_SUPABASE_URL est absente.');
  }
  if (!publishableKey || typeof publishableKey !== 'string') {
    throw new Error('Configuration Supabase invalide : la clé publique est absente.');
  }
  if (typeof clientFactory !== 'function') {
    throw new TypeError('Le constructeur du client Supabase doit être une fonction.');
  }

  return clientFactory(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

export function getBrowserSupabaseClient(options) {
  if (!browserClient) browserClient = createBrowserSupabaseClient(options);
  return browserClient;
}

