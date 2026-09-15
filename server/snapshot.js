// Build one Snapshot from the Coros MCP server.
//
// Every capability is optional. A server that only exposes activities still
// produces a usable snapshot — the parts it cannot serve are reported in
// `meta.degraded` and the app falls back to fixtures for them.

import {
  normalizeActivity, normalizePlannedSession, buildMetrics, buildVerdict, sessionType,
} from './coros/normalize.js';

const DAY = 86400000;

/**
 * @param {import('./coros/client.js').CorosClient} coros
 * @param {{lookbackDays?:number, maxDetailed?:number}} opts
 */
export async function buildSnapshot(coros, opts = {}) {
  const lookbackDays = opts.lookbackDays ?? 42;
  const maxDetailed = opts.maxDetailed ?? 8;
  const notes = [];

  const since = new Date(Date.now() - lookbackDays * DAY);
  const until = new Date(Date.now() + 21 * DAY);

  const athlete = await safe(notes, 'athlete', () => coros.call('athlete'));
  const zones = await safe(notes, 'zones', () => coros.call('zones'));

  const rawActivities = await safe(notes, 'activities', () => coros.call('activities', {
    start_date: iso(since),
    end_date: iso(until),
    startDate: iso(since),
    endDate: iso(until),
    limit: 60,
  }));

  const list = asArray(rawActivities, ['activities', 'items', 'data', 'results']);

  // Detail + streams are per-activity round trips, so only fetch them for the
  // handful the analysis screen can actually show.
  const recent = list
    .slice()
    .sort((a, b) => String(b.startTime ?? b.date ?? '').localeCompare(String(a.startTime ?? a.date ?? '')))
    .slice(0, maxDetailed);

  const device = pickDevice(athlete);
  const activities = [];
  for (const raw of recent) {
    const id = raw.labelId ?? raw.activityId ?? raw.id;
    const detail = id ? await safe(notes, `activityDetail:${id}`, () =>
      coros.call('activityDetail', { activity_id: String(id), activityId: String(id), id: String(id) })) : null;
    const streams = id ? await safe(notes, `streams:${id}`, () =>
      coros.call('streams', { activity_id: String(id), activityId: String(id), id: String(id) })) : null;

    const a = normalizeActivity(raw, {
      detail: unwrapOne(detail),
      streams: unwrapStreams(streams),
      device,
    });
    a.metrics = buildMetrics(a);
    a.verdict = buildVerdict(a);
    activities.push(a);
  }

  const rawPlan = await safe(notes, 'plan', () => coros.call('plan', {
    start_date: iso(since), end_date: iso(until),
    startDate: iso(since), endDate: iso(until),
  }));

  const athleteModel = normalizeAthlete(athlete, zones, device);
  const sessions = buildSessions(asArray(rawPlan, ['workouts', 'plan', 'items', 'data']), activities, athleteModel);

  const missing = coros.describe().missing;
  if (missing.length) notes.push(`capacités absentes du serveur : ${missing.join(', ')}`);

  return {
    athlete: athleteModel,
    sessions,
    activities,
    // Coros has no notion of a PPG exercise library — that stays local.
    exercises: [],
    meta: {
      source: 'coros-mcp',
      fetchedAt: new Date().toISOString(),
      activityCount: activities.length,
      sessionCount: sessions.length,
      degraded: notes.length ? notes.join(' · ') : undefined,
    },
  };
}

/**
 * The week view wants one row per day: a planned workout where the plan has
 * one, the recorded activity where it does not, and an explicit rest day for
 * the gaps — the design draws REPOS rows, so silence has to become a row.
 */
function buildSessions(planned, activities, athlete) {
  const byDate = new Map();

  for (const p of planned) {
    const s = normalizePlannedSession(p);
    s.load = loadFor(s, athlete);
    byDate.set(s.date, s);
  }

  for (const a of activities) {
    const date = a.date.slice(0, 10);
    const existing = byDate.get(date);
    if (existing) {
      existing.done = true;
      existing.activityId = a.id;
      existing.load = loadFor({ ...existing, ...a, type: existing.type }, athlete);
      continue;
    }
    byDate.set(date, {
      id: `s-${date}`,
      date,
      type: sessionType(a.kind === 'autre' ? '' : 'run'),
      title: a.title,
      meta: a.metrics.slice(0, 3).map((m) => m.v).join(' · '),
      done: true,
      load: loadFor({ ...a, type: 'TRAIL' }, athlete),
      dplus: a.elevationGainM || undefined,
      activityId: a.id,
      durationSec: a.durationSec,
      steps: [],
    });
  }

  // Fill the calendar's gaps with rest days.
  const dates = [...byDate.keys()].sort();
  if (dates.length) {
    const last = dates[dates.length - 1];
    for (let d = parseLocal(dates[0]); iso(d) <= last; d.setDate(d.getDate() + 1)) {
      const key = iso(d);
      if (!byDate.has(key)) {
        byDate.set(key, {
          id: `s-${key}`, date: key, type: 'REPOS', title: 'Repos',
          // A rest day only counts as "done" once the day is actually over —
          // today's rest day is still ahead of you.
          meta: 'Rien de prévu.', done: key < iso(new Date()),
          load: 0, zone: '—', steps: [],
        });
      }
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Banister TRIMP plus a vertical term — mirrors src/data/model.js. */
function loadFor(s, athlete) {
  if (s.type === 'REPOS') return 0;
  const minutes = (s.durationSec || 0) / 60;
  if (!minutes) return 0;
  if (s.type === 'PPG' || !s.hrAvg) return Math.round(minutes * 0.8);

  const reserve = Math.max(1, athlete.hrMax - athlete.hrRest);
  const ratio = Math.min(1, Math.max(0, (s.hrAvg - athlete.hrRest) / reserve));
  const trimp = minutes * ratio * 0.64 * Math.exp(1.92 * ratio);
  const vertical = (s.elevationGainM || s.dplus || 0) / 100 * 1.6;
  return Math.round(trimp + vertical);
}

function normalizeAthlete(raw, zonesRaw, device) {
  const a = unwrapOne(raw) || {};
  const z = unwrapOne(zonesRaw) || {};
  const hrMax = Math.round(numOr(a.maxHeartRate ?? a.hrMax ?? z.maxHeartRate, 188));
  const hrRest = Math.round(numOr(a.restHeartRate ?? a.hrRest ?? z.restHeartRate, 48));

  const bounds = Array.isArray(z.heartRate) ? z.heartRate
    : Array.isArray(z.zones) ? z.zones
      : Array.isArray(z) ? z : null;

  return {
    name: String(a.firstName ?? a.first_name ?? a.name ?? 'Athlète'),
    device: device || 'COROS',
    hrRest,
    hrMax,
    zones: bounds
      ? bounds.slice(0, 5).map((b) => Math.round(numOr(b?.max ?? b?.upper ?? b, 0))).filter(Boolean)
      : [Math.round(hrMax * 0.68), Math.round(hrMax * 0.77), Math.round(hrMax * 0.85), Math.round(hrMax * 0.92), hrMax],
  };
}

function pickDevice(athlete) {
  const a = unwrapOne(athlete) || {};
  return String(a.deviceName ?? a.device ?? a.deviceModel ?? '') || 'COROS';
}

async function safe(notes, label, fn) {
  try {
    return await fn();
  } catch (err) {
    notes.push(`${label} : ${err.message}`);
    return null;
  }
}

function asArray(v, keys) {
  const u = unwrapOne(v);
  if (Array.isArray(u)) return u;
  for (const k of keys) if (Array.isArray(u?.[k])) return u[k];
  return [];
}

function unwrapOne(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'data' in v && Object.keys(v).length === 1) {
    return v.data;
  }
  return v;
}

function unwrapStreams(v) {
  const u = unwrapOne(v);
  return u?.streams ?? u?.samples ?? u?.records ?? u;
}

function parseLocal(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function numOr(v, fallback) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Local wall date — matches toIso() in normalize.js, see the note there. */
function iso(d) {
  const x = new Date(d);
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}
