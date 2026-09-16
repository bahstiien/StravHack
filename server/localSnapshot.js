// Construction de l'instantané à partir des relevés figés dans data/.
//
// Partagé par `npm run build:snapshot` (la ligne de commande) et par
// `POST /api/sync` (le bouton dans l'app) : une seule implémentation, donc
// aucun risque que le bouton et le script produisent deux résultats différents.
//
// Coros est la source de vérité : noms de séance, charge d'entraînement, tours
// réels, ratio aigu/chronique, FC de repos, évaluation de forme. Strava ne sert
// qu'aux flux FC/altitude par échantillon, que le MCP Coros n'expose pas.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT } from './config.js';

export const RAW_COROS = resolve(ROOT, 'data/coros-raw.json');
export const RAW_STRAVA = resolve(ROOT, 'data/strava-raw.json');
export const SNAPSHOT_PATH = resolve(ROOT, 'public/coros-snapshot.json');

const fmtDur = (s) => (s >= 3600
  ? `${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
  : `${Math.round(s / 60)}′`);
const fmtPace = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km` : '—');
const fmtLap = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}″`);
const fr = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

/**
 * Charge d'entraînement calculée par la montre.
 *
 * Vient directement de `getActivityDetail` côté MCP Coros. Auparavant on la
 * lisait dans la description que le sync écrit dans Strava (« 151 charge
 * d'entraînement — de COROS ») : même chiffre, mais dépendant d'un champ texte
 * et d'un second connecteur. Le repli sur Strava reste pour une activité qui
 * n'aurait pas été détaillée.
 */
function corosLoad(strava, activity) {
  if (Number.isFinite(activity?.trainingLoad)) return activity.trainingLoad;
  const a = strava.activities.find((x) => x.id === activity?.stravaId);
  const m = /(\d+)\s*charge d['’]entra/i.exec(a?.description || '');
  if (m) return Number(m[1]);
  return a?.relative_effort ?? 0;
}

function streamsFor(strava, stravaId) {
  return strava.streams?.[stravaId] || null;
}

function resample(values, points = 72) {
  const clean = (values || []).filter((v) => Number.isFinite(v));
  if (clean.length < 2) return [];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  return Array.from({ length: points }, (_, i) => {
    const idx = (i / (points - 1)) * (clean.length - 1);
    const lo = Math.floor(idx);
    const t = idx - lo;
    const v = clean[lo] * (1 - t) + clean[Math.min(clean.length - 1, lo + 1)] * t;
    return Math.max(0.02, Math.min(1, (v - min) / span));
  });
}

function drift(hr) {
  const clean = (hr || []).filter((v) => Number.isFinite(v) && v > 90);
  if (clean.length < 20) return null;
  const mid = Math.floor(clean.length / 2);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const first = avg(clean.slice(0, mid));
  if (!first) return null;
  return Math.round(((avg(clean.slice(mid)) - first) / first) * 1000) / 10;
}

/** Zones réelles du profil × flux FC. */
function zoneSplit(hr, bounds, seconds) {
  const clean = (hr || []).filter((v) => Number.isFinite(v) && v > 60);
  if (!clean.length) return [];
  const counts = [0, 0, 0, 0, 0];
  for (const v of clean) {
    let z = bounds.findIndex((b) => v <= (b.max ?? Infinity));
    counts[z < 0 ? 4 : Math.min(4, z)] += 1;
  }
  return counts.map((c, i) => {
    const sec = Math.round((c / clean.length) * seconds);
    return {
      z: `Z${i + 1}`,
      pct: Math.round((c / clean.length) * 100),
      time: sec >= 3600
        ? `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
        : `${Math.floor(sec / 60)}′${String(sec % 60).padStart(2, '0')}`,
    };
  });
}

/**
 * Sépare travail et récupération sur le plus grand écart d'allure.
 *
 * La médiane ne suffit pas : sur 10 reps + échauffement + récups + retour au
 * calme, elle tombe au milieu du groupe lent et ramasse le retour au calme avec
 * les répétitions. Les allures d'une séance à intervalles forment deux paquets
 * nettement séparés — on coupe donc au plus grand trou entre deux allures
 * consécutives, ce qui trouve la frontière quelle que soit la séance.
 */
function splitOnGap(usable) {
  const paces = usable.map((l) => l.paceSecPerKm).sort((a, b) => a - b);
  let gap = 0;
  let cut = paces[0];
  for (let i = 0; i < paces.length - 1; i++) {
    const g = paces[i + 1] - paces[i];
    if (g > gap) { gap = g; cut = paces[i]; }
  }
  // Deux paquets trop proches : ce n'est pas une séance à intervalles.
  // 25″/km sépare une pyramide 1-2-3 km (dont les blocs n'ont ni la même
  // longueur ni la même allure) d'un footing régulier, sans retenir ce dernier.
  if (gap < 25) return null;

  const reps = usable.filter((l) => l.paceSecPerKm <= cut);
  const recoveries = usable.filter((l) => l.paceSecPerKm > cut);
  // Moins de trois blocs rapides : une fin de footing enlevée, pas une séance.
  if (reps.length < 3) return null;
  return { reps, recoveries };
}

/**
 * Tours Coros -> table d'intervalles. Seuls les blocs de travail sont listés.
 */
function intervalRows(laps) {
  const usable = (laps || []).filter((l) => l.paceSecPerKm > 0 && l.timeSec >= 45);
  if (usable.length < 4) return [];
  const split = splitOnGap(usable);
  if (!split) return [];

  const reps = split.reps;
  const ref = reps[0]?.paceSecPerKm;
  return reps.map((l, i) => {
    const d = Math.round(l.paceSecPerKm - ref);
    return {
      name: `Rep ${i + 1}`,
      dur: fmtLap(l.timeSec),
      pace: fmtPace(l.paceSecPerKm),
      hr: l.avgHr ? String(l.avgHr) : '—',
      delta: i === 0 || d === 0 ? '—' : `${d > 0 ? '+' : '−'}${Math.abs(d)}″`,
    };
  });
}

/**
 * @returns {{snapshot: object, coros: object, strava: object}}
 * @throws si l'un des deux relevés manque — sans eux il n'y a rien à assembler.
 */
export function buildLocalSnapshot() {
  for (const [label, path] of [['coros', RAW_COROS], ['strava', RAW_STRAVA]]) {
    if (!existsSync(path)) {
      throw new Error(`relevé ${label} introuvable (${path})`);
    }
  }
  const coros = JSON.parse(readFileSync(RAW_COROS, 'utf8'));
  const strava = JSON.parse(readFileSync(RAW_STRAVA, 'utf8'));

  const bounds = strava.zones.heart_rate_zones;
  const isRun = (a) => a.distanceM > 0;
  const typeOf = (a) => (a.sportType === 402 || a.sportType === 400 ? 'PPG' : 'TRAIL');

  const activities = coros.activities.filter(isRun).map((a) => {
    const st = streamsFor(strava, a.stravaId);
    const laps = coros.laps[a.labelId] || [];
    const rows = intervalRows(laps);
    const d = drift(st?.heart_rate);
    const hrStream = (st?.heart_rate || []).filter((v) => v > 60);
    const hrAvg = a.avgHr || (hrStream.length
      ? Math.round(hrStream.reduce((x, y) => x + y, 0) / hrStream.length) : 0);
    const hrMax = laps.length ? Math.max(...laps.map((l) => l.maxHr || 0)) : (hrStream.length ? Math.max(...hrStream) : 0);

    const metrics = [
      { k: 'DURÉE', v: fmtDur(a.durationSec) },
      { k: 'DISTANCE', v: `${(a.distanceM / 1000).toFixed(1).replace('.', ',')} km` },
      { k: 'CHARGE', v: String(corosLoad(strava, a)) },
      { k: 'ALLURE', v: fmtPace(a.paceSecPerKm) },
      { k: 'FC MOY', v: hrAvg ? String(hrAvg) : '—' },
      { k: 'DÉRIVE', v: d == null ? '—' : `${d > 0 ? '+' : ''}${String(d).replace('.', ',')} %` },
    ];

    return {
      id: a.labelId,
      corosId: a.labelId,
      date: a.date,
      title: a.name,
      location: '',
      device: 'COROS APEX 2 PRO',
      kind: rows.length >= 3 ? 'intervalles' : 'continue',
      durationSec: a.durationSec,
      distanceM: a.distanceM,
      elevationGainM: a.elevationGainM ?? strava.activities.find((s) => s.id === a.stravaId)?.elevation_gain ?? 0,
      hrAvg,
      hrMax,
      paceSecPerKm: a.paceSecPerKm,
      driftPct: d,
      intervals: rows,
      zones: zoneSplit(st?.heart_rate, bounds, a.durationSec),
      streams: { hr: resample(st?.heart_rate), altitude: resample(st?.altitude) },
      metrics,
      verdict: '', // écrit à l'exécution par src/data/commentary.js
    };
  }).sort((x, y) => y.date.localeCompare(x.date));

  const byDate = new Map();
  for (const a of coros.activities) {
    const load = corosLoad(strava, a);
    const type = typeOf(a);
    byDate.set(a.date, {
      id: `s-${a.labelId}`,
      corosId: a.labelId,
      date: a.date,
      type,
      title: a.name,
      meta: [
        fmtDur(a.durationSec),
        a.distanceM ? `${(a.distanceM / 1000).toFixed(1).replace('.', ',')} km` : null,
        a.paceSecPerKm ? fmtPace(a.paceSecPerKm) : null,
      ].filter(Boolean).join(' · '),
      done: true,
      load,
      dplus: a.elevationGainM ?? strava.activities.find((s) => s.id === a.stravaId)?.elevation_gain ?? undefined,
      durationSec: a.durationSec,
      distanceM: a.distanceM,
      durationLabel: fmtDur(a.durationSec),
      zone: type === 'PPG' ? 'FORCE' : undefined,
      activityId: a.distanceM > 0 ? a.labelId : undefined,
      steps: [],
    });
  }

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const today = iso(new Date());
  const dates = [...byDate.keys()].sort();

  for (let d = parse(dates[0]); iso(d) <= today; d.setDate(d.getDate() + 1)) {
    const key = iso(d);
    if (!byDate.has(key)) {
      byDate.set(key, {
        id: `s-${key}`, date: key, type: 'REPOS', title: 'Repos',
        meta: 'Rien d’enregistré.', done: key < today, load: 0, zone: '—', steps: [],
      });
    }
  }

  const snapshot = {
    athlete: {
      name: 'Bastien',
      device: 'COROS APEX 2 PRO',
      // FC de repos réelle, moyenne des 14 derniers relevés Coros.
      hrRest: Math.round(coros.restingHr.slice(0, 14).reduce((a, h) => a + h.bpm, 0)
        / Math.min(14, coros.restingHr.length)),
      hrMax: bounds.at(-1).min,
      weight: strava.athlete.weight,
      zones: bounds.map((b) => b.max).filter(Boolean).concat(bounds.at(-1).min).slice(0, 5),
      vo2max: coros.fitness.vo2max,
      thresholdPaceSecPerKm: coros.fitness.thresholdPaceSecPerKm,
      predictions: coros.fitness.predictions,
    },
    sessions: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    activities,
    exercises: [],
    // Le commentaire est calculé dans l'app à partir de ces trois séries.
    load: coros.load,
    restingHr: coros.restingHr,
    laps: coros.laps,
    fitness: coros.fitness,
    recovery: coros.recovery,
    meta: {
      source: 'coros-snapshot',
      fetchedAt: coros.fetchedAt,
      via: 'MCP COROS (charge, dénivelé, tours, effets d’entraînement, forme) + Strava (flux FC/altitude)',
      activityCount: activities.length,
    },
  };

  return { snapshot, coros, strava };
}

/** Écrit l'instantané et renvoie de quoi rendre compte de l'opération. */
export function writeLocalSnapshot() {
  const { snapshot, coros } = buildLocalSnapshot();
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
  return {
    snapshot,
    path: SNAPSHOT_PATH,
    activityCount: snapshot.activities.length,
    sessionCount: snapshot.sessions.length,
    // La date du relevé, pas celle de la reconstruction : c'est elle qui dit si
    // les données sont fraîches.
    relevéAt: coros.fetchedAt,
    lastActivity: snapshot.activities[0]?.date?.slice(0, 10) ?? null,
  };
}
