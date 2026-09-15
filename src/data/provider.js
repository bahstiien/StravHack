// Where the app gets its data.
//
// The UI imports `loadSnapshot()` and nothing else.
//
// In dev and in any deployment that runs the bridge, `/api/snapshot` is the
// single source: it answers 200 even when Coros is not configured, saying so in
// `meta`, and it already falls back to an on-disk instantané itself. So the
// normal path makes exactly one request and never logs a console error.
//
// The static-hosting path (a `vite build` served without the bridge) is the
// only case that needs a second try, and it is the only case that can produce
// a console 404 — unavoidable, since the browser logs failed requests whatever
// we catch.

import { fixtureSnapshot } from './fixtures.js';

const TIMEOUT_MS = 8000;

async function getJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Merge a source's payload over the fixture baseline.
 *
 * Coros knows about recorded activities and the athlete; it does not know about
 * the PPG library, and it only knows about planned sessions if a plan was
 * pushed to the watch. A partial snapshot is the normal case, so anything the
 * source omits keeps its fixture value.
 */
function merge(base, incoming) {
  if (!incoming || typeof incoming !== 'object') return base;
  // Tout ce que la source envoie est conservé — `laps`, `load`, `restingHr` et
  // `fitness` alimentent le commentaire de séance, et une liste blanche de
  // champs les avait silencieusement jetés : le commentaire retombait sur
  // « séance continue » pour une séance à 10 répétitions.
  return {
    ...incoming,
    athlete: { ...base.athlete, ...(incoming.athlete || {}) },
    sessions: incoming.sessions?.length ? incoming.sessions : base.sessions,
    activities: incoming.activities?.length ? incoming.activities : base.activities,
    exercises: incoming.exercises?.length ? incoming.exercises : base.exercises,
    meta: { ...base.meta, ...(incoming.meta || {}) },
  };
}

/** @returns {Promise<import('./model.js').Snapshot>} */
export async function loadSnapshot() {
  const base = fixtureSnapshot();

  try {
    const data = await getJSON('/api/snapshot');

    // The bridge is up but has nothing to serve — a normal state, not an error.
    if (data?.meta?.source === 'none' || !data?.activities?.length) {
      return {
        ...base,
        meta: {
          source: 'fixtures',
          fetchedAt: new Date().toISOString(),
          reason: data?.meta?.reason,
        },
      };
    }

    return merge(base, data);
  } catch {
    // No bridge: a static build. Try an instantané sitting next to the app.
    try {
      const file = await getJSON('/coros-snapshot.json');
      return merge(base, { ...file, meta: { ...file.meta, source: 'coros-snapshot' } });
    } catch {
      return {
        ...base,
        meta: {
          source: 'fixtures',
          fetchedAt: new Date().toISOString(),
          reason: 'Aucun pont Coros et aucun instantané — données de démo.',
        },
      };
    }
  }
}

/** Push a planned session to the watch. Always resolves; never throws. */
export async function pushToWatch(session) {
  try {
    const res = await fetch('/api/push-workout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: session.id }),
    });
    const body = await res.json().catch(() => ({}));
    if (body.ok) return { ok: true, message: body.message || 'Séance envoyée sur la montre.' };
    return { ok: false, message: body.error || `Envoi impossible (HTTP ${res.status}).` };
  } catch (err) {
    return { ok: false, message: `Envoi impossible — ${err.message}` };
  }
}
