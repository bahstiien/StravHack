#!/usr/bin/env node
// data/strava-raw.json  ->  public/coros-snapshot.json
//
// Why this exists: the Coros activities are on the watch, sync to Strava, and
// the Strava connector is OAuth'd into Claude — not into this project. So the
// Node bridge cannot fetch them; Claude fetched them once into
// data/strava-raw.json and this turns that relevé into the app's model.
//
// When a Coros MCP server is connected, `npm run sync:coros` replaces this
// entirely and writes the same file. Nothing in src/ has to change either way.
//
//   npm run sync:strava

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT } from '../server/config.js';

const RAW = resolve(ROOT, 'data/strava-raw.json');
const OUT = resolve(ROOT, 'public/coros-snapshot.json');

const raw = JSON.parse(readFileSync(RAW, 'utf8'));

/**
 * Coros computes its own training load and the sync writes it into the Strava
 * description: "151 charge d'entraînement\n-- de COROS". That is the number the
 * watch shows you, so it beats anything we could re-derive — use it when it is
 * there, fall back to Strava's relative_effort, and only then to a TRIMP.
 */
function corosLoad(activity) {
  const m = /(\d+)\s*charge d['’]entra/i.exec(activity.description || '');
  if (m) return { load: Number(m[1]), source: 'coros' };
  if (activity.relative_effort) return { load: activity.relative_effort, source: 'strava' };

  const minutes = (activity.moving_time || 0) / 60;
  return { load: Math.round(minutes * 0.8), source: 'estimé' };
}

/** Strava sport_type -> the three types the calendar draws. */
function sessionType(sport) {
  const s = String(sport || '').toLowerCase();
  if (/weight|workout|strength|crossfit|yoga|pilates/.test(s)) return 'PPG';
  return 'TRAIL';
}

function activityKind(a) {
  const n = (a.name || '').toLowerCase();
  if (/\d+\s*[*x×]\s*\d|vma|fractionn|côte|interval|rentrée des classes/.test(n)) return 'vma';
  if (/seuil|threshold|tempo/.test(n)) return 'seuil';
  if ((a.moving_time || 0) >= 5400) return 'long';
  return 'autre';
}

const localDate = (iso) => String(iso).slice(0, 10);

function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}′`;
}

function fmtClockPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '—';
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`;
}

function fmtLap(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m ? `${m}:${String(s).padStart(2, '0')}` : `${s}″`;
}

const fr = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/** Normalise a series to 0..1 over its own min/max, resampled to 72 points. */
function resample(values, points = 72) {
  const clean = (values || []).filter((v) => Number.isFinite(v));
  if (clean.length < 2) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const out = [];
  for (let i = 0; i < points; i++) {
    const idx = (i / (points - 1)) * (clean.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(clean.length - 1, lo + 1);
    const t = idx - lo;
    const v = clean[lo] * (1 - t) + clean[hi] * t;
    out.push(Math.max(0.02, Math.min(1, (v - min) / span)));
  }
  return out;
}

/** Cardiac drift between the two halves of the effort. */
function drift(hr) {
  const clean = (hr || []).filter((v) => Number.isFinite(v) && v > 90);
  if (clean.length < 20) return null;
  const mid = Math.floor(clean.length / 2);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const first = avg(clean.slice(0, mid));
  if (!first) return null;
  return Math.round(((avg(clean.slice(mid)) - first) / first) * 1000) / 10;
}

/**
 * Laps -> the interval table.
 *
 * Only the work reps are shown. A Coros session alternates rep / recovery, and
 * listing the joggged recoveries between them buries the thing you actually
 * read the table for: whether the reps held their pace.
 */
function intervals(laps) {
  if (!laps?.length) return [];

  const work = laps.filter((l) => {
    const dur = l.moving_time || l.elapsed_time || 0;
    const speed = dur ? (l.distance || 0) / dur : 0;
    // Warm-up / cool-down are long; recoveries are slow.
    return dur > 30 && dur < 900 && speed > 3.2;
  });
  const rows = (work.length >= 2 ? work : laps).map((l, i) => {
    const dur = l.moving_time || l.elapsed_time || 0;
    const pace = l.distance > 0 && dur > 0 ? dur / (l.distance / 1000) : null;
    return {
      name: l.name || `Bloc ${i + 1}`,
      dur: fmtLap(dur),
      pace: fmtClockPace(pace),
      hr: l.avg_hr ? String(Math.round(l.avg_hr)) : '—',
      _pace: pace,
    };
  });

  const ref = rows.find((r) => r._pace)?._pace;
  return rows.map((r, i) => {
    const { _pace, ...rest } = r;
    if (i === 0 || !ref || !_pace) return { ...rest, delta: '—' };
    const d = Math.round(_pace - ref);
    return { ...rest, delta: d === 0 ? '—' : `${d > 0 ? '+' : '−'}${Math.abs(d)}″` };
  });
}

/** Time in each zone, from the HR stream against the athlete's own zones. */
function zoneSplit(hrStream, bounds, movingTime) {
  const clean = (hrStream || []).filter((v) => Number.isFinite(v) && v > 60);
  if (!clean.length || !bounds?.length) return [];

  const counts = [0, 0, 0, 0, 0];
  for (const v of clean) {
    let z = bounds.findIndex((b) => v <= (b.max ?? Infinity));
    if (z < 0) z = 4;
    counts[Math.min(4, z)] += 1;
  }
  return counts.map((c, i) => {
    const sec = Math.round((c / clean.length) * movingTime);
    return {
      z: `Z${i + 1}`,
      pct: Math.round((c / clean.length) * 100),
      time: sec >= 3600
        ? `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
        : `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, '0')}`,
    };
  });
}

function metrics(a, kind, driftPct, hr) {
  const km = a.distance / 1000;
  const pace = a.distance > 0 ? a.moving_time / km : null;
  const cells = [
    { k: 'DURÉE', v: fmtDur(a.moving_time) },
    { k: 'DISTANCE', v: km ? `${km.toFixed(1).replace('.', ',')} km` : '—' },
    { k: 'D+', v: a.elevation_gain ? `${fr(a.elevation_gain)} m` : '—' },
  ];
  if (kind === 'vma' && hr.max) {
    cells.push({ k: 'FC MOY', v: hr.avg ? String(hr.avg) : '—' });
    cells.push({ k: 'FC MAX', v: String(hr.max) });
  } else {
    cells.push({ k: 'ALLURE', v: fmtClockPace(pace) });
    cells.push({ k: 'FC MOY', v: hr.avg ? String(hr.avg) : '—' });
  }
  cells.push({
    k: 'DÉRIVE',
    v: driftPct == null ? '—' : `${driftPct > 0 ? '+' : ''}${String(driftPct).replace('.', ',')} %`,
  });
  return cells;
}

function verdict(a, kind, driftPct, rows, load) {
  const paces = rows.map((r) => {
    const m = /(\d+):(\d{2})/.exec(r.pace);
    return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  }).filter(Number.isFinite);

  if ((kind === 'vma' || kind === 'seuil') && paces.length >= 3) {
    const third = Math.max(1, Math.floor(paces.length / 3));
    const avg = (x) => x.reduce((p, q) => p + q, 0) / x.length;
    const start = avg(paces.slice(0, third));
    const fade = Math.round(((avg(paces.slice(-third)) - start) / start) * 1000) / 10;
    if (fade >= 5) {
      return `Les dernières répétitions lâchent de ${String(fade).replace('.', ',')} %. Tu as tenu, mais la fin manque de jus.`;
    }
    if (fade >= 2) {
      return `Dernier tiers à ${String(fade).replace('.', ',')} % plus lent que le premier. Parti un peu vite, mais ça tient.`;
    }
    if (fade <= -2) {
      return `Négative split sur les répétitions : ${String(Math.abs(fade)).replace('.', ',')} % plus rapide à la fin. C'est comme ça qu'on court une séance de qualité.`;
    }
    return 'Répétitions régulières du début à la fin. Séance exécutée comme écrite.';
  }
  if (driftPct != null && driftPct >= 6) {
    return `Dérive à +${String(driftPct).replace('.', ',')} % : tu as fini plus cher que tu n'as commencé. Départ trop rapide.`;
  }
  if (driftPct != null && driftPct <= 3 && a.moving_time >= 3600) {
    return `Propre. Une dérive à +${String(driftPct).replace('.', ',')} % sur ${fmtDur(a.moving_time)}, c'est de l'aérobie bien tenue.`;
  }
  return `Séance encaissée : ${load} de charge. Rien à corriger.`;
}

// ── Build ────────────────────────────────────────────────────────────────────

const bounds = raw.zones?.heart_rate_zones || [];

// Strava exposes zone boundaries but never a resting HR, and its zone source
// here is MaxHeartRate — so Z5's lower bound is the max used to build them.
// hrRest is an assumption; set it from the watch if you know the real figure.
const hrMax = bounds.at(-1)?.min ?? 188;
const hrRest = 48; // ASSUMPTION — not measured, not available from Strava.

/**
 * Average / max HR.
 *
 * Only one activity was fetched with its full performance payload, but three
 * have an HR stream — and the stream is the same measurement. Derive from it
 * when the detail is missing rather than printing an em dash next to a chart
 * drawn from the very numbers we are claiming not to have.
 */
function heartRate(detail, streams) {
  if (detail?.average_heartrate) {
    return {
      avg: Math.round(detail.average_heartrate),
      max: Math.round(detail.max_heartrate || 0),
      derived: false,
    };
  }
  const hr = (streams?.heart_rate || []).filter((v) => Number.isFinite(v) && v > 60);
  if (!hr.length) return { avg: 0, max: 0, derived: false };
  return {
    avg: Math.round(hr.reduce((a, b) => a + b, 0) / hr.length),
    max: Math.max(...hr),
    derived: true,
  };
}

const activities = raw.activities
  .filter((a) => a.distance > 0)
  .map((a) => {
    const streams = raw.streams[a.id];
    const detail = raw.details[a.id];
    const hr = heartRate(detail, streams);
    const kind = activityKind(a);
    const d = drift(streams?.heart_rate);
    const rows = intervals(detail?.laps);
    const { load } = corosLoad(a);

    return {
      id: a.id,
      date: a.start_local,
      title: a.name,
      location: (a.location_summary || '').split(',')[0],
      device: 'COROS APEX 2 PRO',
      kind,
      durationSec: a.moving_time,
      distanceM: a.distance,
      elevationGainM: a.elevation_gain,
      hrAvg: hr.avg,
      hrMax: hr.max,
      paceSecPerKm: a.distance > 0 ? Math.round(a.moving_time / (a.distance / 1000)) : null,
      driftPct: d,
      intervals: rows,
      zones: zoneSplit(streams?.heart_rate, bounds, a.moving_time),
      streams: {
        hr: resample(streams?.heart_rate),
        altitude: resample(streams?.altitude),
      },
      metrics: metrics(a, kind, d, hr),
      verdict: verdict(a, kind, d, rows, load),
    };
  })
  // The analysis screen draws one tab per activity; the ones with streams are
  // the ones worth opening, so they lead.
  .sort((x, y) => (y.streams.hr.length - x.streams.hr.length) || y.date.localeCompare(x.date));

const sessions = [];
const byDate = new Map();

for (const a of raw.activities) {
  const date = localDate(a.start_local);
  const { load, source } = corosLoad(a);
  const type = sessionType(a.sport_type);
  const km = a.distance / 1000;

  byDate.set(date, {
    id: `s-${a.id}`,
    date,
    type,
    title: a.name,
    meta: [
      fmtDur(a.moving_time),
      km >= 0.1 ? `${km.toFixed(1).replace('.', ',')} km` : null,
      a.elevation_gain ? `${fr(a.elevation_gain)} D+` : null,
    ].filter(Boolean).join(' · '),
    done: true,
    load,
    loadSource: source,
    dplus: a.elevation_gain || undefined,
    durationSec: a.moving_time,
    durationLabel: fmtDur(a.moving_time),
    zone: type === 'PPG' ? 'FORCE' : undefined,
    activityId: a.distance > 0 ? a.id : undefined,
    coach: source === 'coros'
      ? `${load} de charge d'entraînement, mesurée par la montre.`
      : `${load} de charge (estimée — la montre n'a rien transmis).`,
    steps: [],
  });
}

// Fill the gaps so the week view has a row for every day.
const dates = [...byDate.keys()].sort();
const DAY = 86400000;
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Extend to today so the current week is not simply missing.
const last = iso(new Date());
for (let d = parse(dates[0]); iso(d) <= last; d.setDate(d.getDate() + 1)) {
  const key = iso(d);
  if (!byDate.has(key)) {
    byDate.set(key, {
      id: `s-${key}`, date: key, type: 'REPOS', title: 'Repos',
      meta: 'Rien d’enregistré.', done: key < last, load: 0, zone: '—', steps: [],
    });
  }
}
sessions.push(...[...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)));

const snapshot = {
  athlete: {
    name: raw.athlete.first_name,
    device: 'COROS APEX 2 PRO',
    hrRest,
    hrMax,
    weight: raw.athlete.weight,
    zones: bounds.map((b) => b.max).filter(Boolean).concat(hrMax).slice(0, 5),
  },
  sessions,
  activities,
  exercises: [], // la bibliothèque PPG reste locale
  meta: {
    source: 'coros-snapshot',
    fetchedAt: raw.fetchedAt,
    via: 'Strava (activités enregistrées par la COROS APEX 2 Pro)',
    activityCount: activities.length,
    sessionCount: sessions.length,
    degraded: 'Charges d’entraînement calculées par la Coros. Tours et zones seulement sur les séances dont la montre a transmis le détail.',
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(snapshot, null, 2), 'utf8');

const withStreams = activities.filter((a) => a.streams.hr.length).length;
console.log(`${activities.length} activités (${withStreams} avec flux), ${sessions.length} jours → ${OUT}`);
for (const a of activities.slice(0, 5)) {
  console.log(`  ${a.date.slice(0, 10)}  ${a.kind.padEnd(6)} ${a.title}`);
}
