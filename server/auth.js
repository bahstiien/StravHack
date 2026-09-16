import { createClient } from '@supabase/supabase-js';

let cachedClient = null;
let cachedKey = '';

export function apiAuthSettings(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY
    || env.VITE_SUPABASE_PUBLISHABLE_KEY
    || env.SUPABASE_ANON_KEY
    || env.VITE_SUPABASE_ANON_KEY
    || '';
  const explicit = env.COROS_API_AUTH_REQUIRED;
  const required = explicit == null
    ? Boolean(env.VERCEL)
    : !['0', 'false', 'no', 'off'].includes(String(explicit).toLowerCase());

  return {
    required,
    configured: Boolean(url && publishableKey),
    url,
    publishableKey,
  };
}

export async function authorizeApiRequest(req, options = {}) {
  const settings = apiAuthSettings(options.env);
  if (!settings.required) return { ok: true, required: false, user: null };

  if (!settings.configured) {
    return {
      ok: false,
      status: 503,
      error: 'Configuration Supabase manquante pour protéger le pont Coros.',
    };
  }

  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Connexion requise.' };

  const client = authClient(settings, options.clientFactory || createClient);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user?.id) return { ok: false, status: 401, error: 'Session invalide.' };
  const allowedUserId = options.env?.COROS_ALLOWED_USER_ID ?? process.env.COROS_ALLOWED_USER_ID;
  if (allowedUserId && data.user.id !== allowedUserId) {
    return { ok: false, status: 403, error: 'Accès Coros non autorisé.' };
  }

  return { ok: true, required: true, user: data.user };
}

function bearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function authClient(settings, clientFactory) {
  const key = `${settings.url}\n${settings.publishableKey}`;
  if (cachedClient && cachedKey === key) return cachedClient;
  cachedKey = key;
  cachedClient = clientFactory(settings.url, settings.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}
