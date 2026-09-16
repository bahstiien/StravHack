import { authenticatedFetch } from './api-client.js';

/** Déclenche la synchronisation et transforme toute réponse HTTP invalide en diagnostic affichable. */
export async function requestCorosSync(fetcher = authenticatedFetch) {
  const response = await fetcher('/api/sync', { method: 'POST' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      mode: 'error',
      error: body.error || `Synchronisation indisponible (HTTP ${response.status}).`,
    };
  }
  return body;
}

export function shouldReloadAfterSync(result) {
  return Boolean(result?.ok || (result?.mode === 'rebuild' && result?.activityCount > 0));
}
