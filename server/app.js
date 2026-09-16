// The API itself, independent of how it is served.
//
// Mounted two ways: on the Vite dev server (see vite.config.js) so `npm run
// dev` alone gives you the Coros bridge with no second process and no proxy,
// and on a standalone http server (server/index.js) for production.
//
// Design rule: /api/snapshot always answers 200. "Coros is not configured" is
// a normal state of this app, not a failure — answering 503 for it means the
// browser console fills with red on a perfectly healthy default setup.

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { CorosClient } from './coros/client.js';
import { buildSnapshot } from './snapshot.js';
import { writeLocalSnapshot, SNAPSHOT_PATH } from './localSnapshot.js';
import { loadConfig, isConfigured, ROOT } from './config.js';
import { apiAuthSettings, authorizeApiRequest } from './auth.js';

const CACHE_MS = Number(process.env.SNAPSHOT_TTL_MS || 5 * 60 * 1000);
const SNAPSHOT_FILE = resolve(ROOT, 'public/coros-snapshot.json');

export function validWorkoutPayload(value, sessionId) {
  return Boolean(value && typeof value === 'object'
    && typeof value.id === 'string' && value.id === sessionId
    && typeof value.title === 'string' && value.title.trim() && value.title.length <= 120
    && /^\d{4}-\d{2}-\d{2}$/.test(String(value.date || ''))
    && ['TRAIL', 'PPG'].includes(value.type)
    && Array.isArray(value.steps) && value.steps.length <= 100
    && value.steps.every((step) => step && typeof step === 'object' && !Array.isArray(step)));
}

export function createApi({ serverless = process.env.VERCEL === '1' } = {}) {
  const config = loadConfig();
  const coros = new CorosClient(config);
  const configured = isConfigured(config);
  const authSettings = apiAuthSettings();
  let cache = null;

  async function snapshot({ force = false } = {}) {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;

    if (configured) {
      try {
        const data = await buildSnapshot(coros, { lookbackDays: config.lookbackDays });
        cache = { at: Date.now(), data };
        return data;
      } catch (err) {
        // A live failure should not hide an instantané that is sitting there.
        const fallback = readSnapshotFile();
        if (fallback) {
          fallback.meta = {
            ...fallback.meta,
            source: 'coros-snapshot',
            degraded: `Coros injoignable (${err.message}) — instantané du disque.`,
          };
          return fallback;
        }
        return notAvailable(`Coros injoignable : ${err.message}`);
      }
    }

    const file = readSnapshotFile();
    if (file) {
      file.meta = { ...file.meta, source: 'coros-snapshot' };
      return file;
    }

    return notAvailable(
      'Coros MCP non configuré. Renseigne "url" (ou "command") dans coros.config.json, '
      + 'ou exporte COROS_MCP_URL, puis relance. Voir README.md § Connecter Coros.',
    );
  }

  /**
   * Handle an API request.
   * @returns {Promise<boolean>} true when this request was ours.
   */
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;

    try {
      if (req.method === 'OPTIONS') return json(res, 204, {});

      const auth = await authorizeApiRequest(req);
      if (!auth.ok) return json(res, auth.status, { error: auth.error });

      if (url.pathname === '/api/health') {
        if (!configured) {
          return json(res, 200, {
            configured: false,
            auth: { required: authSettings.required },
            hint: 'coros.config.json — voir README.md § Connecter Coros.',
          });
        }
        try {
          await coros.connect();
          return json(res, 200, { configured: true, auth: { required: authSettings.required }, ...coros.describe() });
        } catch (err) {
          return json(res, 200, {
            configured: true,
            auth: { required: authSettings.required },
            connected: false,
            error: 'Connexion Coros impossible.',
          });
        }
      }

      if (url.pathname === '/api/snapshot') {
        return json(res, 200, await snapshot({ force: url.searchParams.get('refresh') === '1' }));
      }

      if (url.pathname === '/api/refresh' && req.method === 'POST') {
        cache = null;
        return json(res, 200, { ok: true });
      }

      /*
       * Le bouton SYNCHRONISER.
       *
       * Deux modes, et il dit toujours lequel :
       *
       *   live     un serveur MCP Coros est configuré et joignable — on va
       *            chercher les données, on réécrit l'instantané.
       *   rebuild  il n'y en a pas — on réassemble l'instantané à partir des
       *            relevés figés dans data/. C'est utile (un relevé mis à jour
       *            à la main est pris en compte) mais ce n'est PAS une synchro,
       *            et la réponse le dit pour qu'on ne croie pas l'être.
       */
      if (url.pathname === '/api/sync' && req.method === 'POST') {
        cache = null;
        const startedAt = Date.now();

        if (configured) {
          try {
            await coros.connect();
            const data = await buildSnapshot(coros, { lookbackDays: config.lookbackDays });
            const persisted = persistSnapshot(data, serverless);
            cache = { at: Date.now(), data };

            const d = coros.describe();
            return json(res, 200, {
              ok: true,
              mode: 'live',
              message: `${data.activities.length} activités récupérées depuis Coros.`,
              activityCount: data.activities.length,
              sessionCount: data.sessions.length,
              tools: d.toolCount,
              missing: d.missing,
              degraded: data.meta?.degraded ?? null,
              persistedSnapshot: persisted.ok,
              warning: persisted.ok ? null : persisted.message,
              snapshot: data,
              durationMs: Date.now() - startedAt,
            });
          } catch (err) {
            // Coros configuré mais injoignable : on ne laisse pas l'app sans
            // rien, on reconstruit — en disant que la synchro a échoué.
            console.error('Coros synchronization failed', err);
            const rebuilt = serverless ? { activityCount: 0, sessionCount: 0 } : safeRebuild();
            return json(res, 200, {
              ok: false,
              mode: 'rebuild',
              error: 'Coros est temporairement injoignable.',
              ...rebuilt,
              durationMs: Date.now() - startedAt,
            });
          }
        }

        const rebuilt = serverless ? { activityCount: 0, sessionCount: 0 } : safeRebuild();
        return json(res, 200, {
          ok: Boolean(rebuilt.activityCount),
          mode: 'rebuild',
          reason: 'Aucun serveur MCP Coros configuré : l’instantané a été '
            + 'réassemblé depuis les relevés locaux, aucune donnée nouvelle n’a '
            + 'été téléchargée.',
          ...rebuilt,
          durationMs: Date.now() - startedAt,
        });
      }

      if (url.pathname === '/api/push-workout' && req.method === 'POST') {
        const { sessionId, session: submittedSession } = await readBody(req);
        if (!sessionId) return json(res, 400, { error: 'sessionId manquant' });
        if (!configured) {
          return json(res, 200, {
            ok: false,
            error: 'Coros MCP non configuré — impossible d’envoyer une séance.',
          });
        }

        const snap = await snapshot();
        const session = validWorkoutPayload(submittedSession, sessionId)
          ? submittedSession
          : snap.sessions?.find((s) => s.id === sessionId);
        if (!session) return json(res, 200, { ok: false, error: 'Séance introuvable' });

        const result = await coros.call('pushWorkout', {
          name: session.title,
          date: session.date,
          sport: session.type === 'PPG' ? 'strength' : 'trail_run',
          steps: session.steps,
        });
        if (result === null) {
          return json(res, 200, {
            ok: false,
            error: 'Ce serveur Coros n’expose pas d’outil d’envoi de séance.',
          });
        }
        return json(res, 200, {
          ok: true,
          message: `« ${session.title} » envoyée sur la montre.`,
          result,
        });
      }

      return json(res, 404, { error: 'Not found' });
    } catch (err) {
      console.error('Coros API request failed', err);
      return json(res, err?.code === 'PAYLOAD_TOO_LARGE' ? 413 : 500, {
        error: err?.code === 'PAYLOAD_TOO_LARGE'
          ? 'Charge utile trop volumineuse.'
          : 'Service Coros temporairement indisponible.',
      });
    }
  }

  return { handle, coros, config, configured, close: () => coros.close() };
}

function safeRebuild() {
  try {
    const r = writeLocalSnapshot();
    return {
      message: `${r.activityCount} activités réassemblées depuis les relevés locaux.`,
      activityCount: r.activityCount,
      sessionCount: r.sessionCount,
      relevéAt: r.relevéAt,
      lastActivity: r.lastActivity,
    };
  } catch (err) {
    return { message: `Reconstruction impossible : ${err.message}`, activityCount: 0 };
  }
}

function readSnapshotFile() {
  if (!existsSync(SNAPSHOT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/** A well-formed snapshot that simply carries no data — the app uses fixtures. */
function notAvailable(reason) {
  return {
    athlete: null,
    sessions: [],
    activities: [],
    exercises: [],
    meta: { source: 'none', fetchedAt: new Date().toISOString(), reason },
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
  return true;
}

async function readBody(req) {
  if (req.body !== undefined) {
    if (req.body == null) return {};
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
    if (Buffer.isBuffer(req.body)) {
      try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; }
    }
  }

  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 65536) {
      const error = new Error('Payload too large');
      error.code = 'PAYLOAD_TOO_LARGE';
      throw error;
    }
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

function persistSnapshot(data, serverless) {
  if (serverless) {
    return { ok: false, message: 'Instantané renvoyé au compte sans écriture sur le filesystem Vercel.' };
  }
  try {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, message: null };
  } catch (err) {
    return {
      ok: false,
      message: `Instantané non écrit sur le filesystem (${err.message}) — données live servies depuis Coros.`,
    };
  }
}
