// Coros payloads -> the app's domain model.
//
// Field names differ between Coros API versions and between MCP servers
// wrapping them, so every read goes through `pick()` with a list of candidate
// keys rather than a single hard-coded name. Units are normalised here too:
// the app works in seconds and metres, whatever the source sent.

const SEC = 1;

/** First present, non-null value among the candidate keys. */
function pick(obj, keys, fallback = undefined) {
  if (!obj) return fallback;
  for (const k of keys) {
    const v = k.split('.').reduce((o, part) => (o == null ? o : o[part]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return fallback;
}

function num(v, fallback = 0) {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Coros reports durations in seconds, some wrappers in milliseconds.
 *
 * Guessing per value is wrong — a 45 000 of *milliseconds* (a 45″ rep) and a
 * 45 000 of *seconds* (a 12 h ultra) are both plausible in isolation. The unit
 * is consistent within one payload, so callers infer it once from the parent
 * activity (`inferMsMode`) and pass it down to every lap.
 */
function toSeconds(v, msMode = null) {
  const n = num(v, 0);
  if (!n) return 0;
  if (msMode === true) return Math.round(n / 1000);
  if (msMode === false) return Math.round(n * SEC);
  // No context: anything over 24 h expressed as seconds must be milliseconds.
  return n > 86400 ? Math.round(n / 1000) : Math.round(n * SEC);
}

/**
 * Decide, from an activity's own total duration, whether this payload counts
 * in milliseconds. Returns null when the value is too small to tell, in which
 * case the per-value heuristic above stands.
 */
function inferMsMode(totalRaw) {
  const n = num(totalRaw, 0);
  if (!n) return null;
  return n > 86400 ? true : n > 60 ? false : null;
}

/** Distance may arrive in m or km. */
function toMetres(v) {
  const n = num(v, 0);
  if (!n) return 0;
  return n < 1000 && n > 0 && !Number.isInteger(n) ? Math.round(n * 1000) : Math.round(n);
}

/** Coros sport codes / labels -> the three types the calendar draws. */
export function sessionType(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (/strength|gym|muscul|ppg|core|renfo|weight/.test(s)) return 'PPG';
  if (/rest|repos|off|recovery_day/.test(s)) return 'REPOS';
  return 'TRAIL';
}

/** Classify an activity so the analysis screen can shape its chart. */
export function activityKind(a) {
  const title = String(pick(a, ['name', 'title', 'workoutName'], '')).toLowerCase();
  const durSec = toSeconds(pick(a, ['totalTime', 'duration', 'movingTime', 'elapsed_time'], 0));
  if (/vma|interval|fractionn|côte|cote|hill|rep/.test(title)) return 'vma';
  if (/seuil|threshold|tempo/.test(title)) return 'seuil';
  if (durSec >= 5400 || /longue|long run|sortie longue/.test(title)) return 'long';
  return 'autre';
}

/** @returns {import('../../src/data/model.js').Activity} */
export function normalizeActivity(raw, { streams, detail, device } = {}) {
  const a = { ...(raw || {}), ...(detail || {}) };

  const rawDuration = pick(a, ['totalTime', 'duration', 'movingTime', 'elapsed_time', 'workoutTime'], 0);
  const msMode = inferMsMode(rawDuration);
  const durationSec = toSeconds(rawDuration, msMode);
  const distanceM = toMetres(pick(a, ['distance', 'totalDistance', 'distanceInMeters'], 0));
  const elevationGainM = Math.round(num(pick(a, ['totalAscent', 'elevationGain', 'ascent', 'total_elevation_gain'], 0)));
  const hrAvg = Math.round(num(pick(a, ['avgHeartRate', 'averageHeartRate', 'avg_hr', 'heartRate.avg'], 0)));
  const hrMax = Math.round(num(pick(a, ['maxHeartRate', 'maximumHeartRate', 'max_hr', 'heartRate.max'], 0)));

  const paceSecPerKm = distanceM > 0 && durationSec > 0
    ? Math.round(durationSec / (distanceM / 1000))
    : null;

  const startedAt = pick(a, ['startTime', 'start_date_local', 'startDate', 'date', 'beginTime']);

  return {
    id: String(pick(a, ['labelId', 'activityId', 'id', 'uuid'], cryptoId())),
    date: toIso(startedAt),
    title: String(pick(a, ['name', 'title', 'workoutName'], 'Séance')),
    location: String(pick(a, ['location', 'locationName', 'city', 'startLocation'], '')),
    device: device || String(pick(a, ['deviceName', 'device', 'deviceModel'], 'COROS')),
    kind: activityKind(a),
    durationSec,
    distanceM,
    elevationGainM,
    hrAvg,
    hrMax,
    paceSecPerKm,
    driftPct: computeDrift(streams),
    intervals: normalizeIntervals(pick(a, ['laps', 'intervals', 'splits', 'segments'], []) || [], msMode),
    zones: normalizeZones(pick(a, ['zones', 'hrZones', 'heartRateZones', 'zoneDistribution'], []) || [], durationSec, msMode),
    streams: normalizeStreams(streams),
    metrics: [], // filled by buildMetrics below
    verdict: '',
  };
}

function cryptoId() {
  return 'a-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Normalise a Coros timestamp to a *local wall-clock* ISO string.
 *
 * Deliberately not `toISOString()`: that converts to UTC, and a 00:30 session
 * in Paris would then be filed under the previous day. Training dates are wall
 * dates — a 06:42 run belongs to the morning it happened in.
 */
function toIso(v) {
  if (!v) return localIso(new Date());
  if (typeof v === 'number') {
    // Coros uses both epoch seconds and a YYYYMMDD integer.
    if (v > 19000000 && v < 29999999) {
      const s = String(v);
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`;
    }
    return localIso(new Date(v < 1e11 ? v * 1000 : v));
  }
  const d = new Date(v);
  return isNaN(d) ? localIso(new Date()) : localIso(d);
}

function localIso(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    + `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '—';
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}/km`;
}

/** Laps -> the interval table, with the pace delta against the first lap. */
export function normalizeIntervals(laps, msMode = null) {
  const rows = (Array.isArray(laps) ? laps : []).map((l, i) => {
    const dur = toSeconds(pick(l, ['totalTime', 'duration', 'elapsed_time', 'movingTime'], 0), msMode);
    const dist = toMetres(pick(l, ['distance', 'totalDistance'], 0));
    const pace = dist > 0 && dur > 0 ? Math.round(dur / (dist / 1000)) : null;
    return {
      name: String(pick(l, ['name', 'label'], `Bloc ${i + 1}`)),
      dur: fmtDur(dur),
      pace: fmtPace(pace),
      hr: String(Math.round(num(pick(l, ['avgHeartRate', 'averageHeartRate', 'avg_hr'], 0))) || '—'),
      _pace: pace,
    };
  });

  const ref = rows.find((r) => r._pace)?._pace;
  return rows.map((r, i) => {
    if (i === 0 || !ref || !r._pace) return { ...r, delta: '—', _pace: undefined };
    const d = Math.round(r._pace - ref);
    // A positive delta means slower — that is the bad direction, and the UI
    // colours it with the accent.
    const sign = d > 0 ? '+' : d < 0 ? '−' : '';
    return { ...r, delta: d === 0 ? '—' : `${sign}${Math.abs(d)}″`, _pace: undefined };
  });
}

/** Zone distribution -> five slices with a percentage and a formatted time. */
export function normalizeZones(zones, totalSec, msMode = null) {
  const list = Array.isArray(zones) ? zones : [];
  if (!list.length) return [];

  const secs = list.slice(0, 5).map((z) =>
    toSeconds(pick(z, ['time', 'duration', 'seconds', 'totalTime'], 0), msMode));
  const total = secs.reduce((a, b) => a + b, 0) || totalSec || 1;

  return secs.map((sec, i) => ({
    z: `Z${i + 1}`,
    pct: Math.round((sec / total) * 100),
    time: sec >= 3600 ? `${Math.floor(sec / 3600)}h${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}`
      : `${Math.floor(sec / 60)}′${String(Math.floor(sec % 60)).padStart(2, '0')}`,
  }));
}

/**
 * Raw sample arrays -> two 0..1 series of 72 points.
 *
 * The chart is 360px wide; sending thousands of samples to the browser to draw
 * a 360px path is waste, so downsample here and normalise to the series' own
 * min/max, which is what the design's fixed-height SVG expects.
 */
export function normalizeStreams(streams, points = 72) {
  const hrRaw = extractSeries(streams, ['heartRate', 'hr', 'heart_rate', 'bpm']);
  const altRaw = extractSeries(streams, ['altitude', 'elevation', 'alt', 'elev']);
  return {
    hr: resample(hrRaw, points),
    altitude: resample(altRaw, points),
  };
}

function extractSeries(streams, keys) {
  if (!streams) return [];
  // Shape A: { heartRate: [...] }  Shape B: { heartRate: { data: [...] } }
  for (const k of keys) {
    const v = streams[k];
    if (Array.isArray(v)) return v.map((x) => num(x, NaN));
    if (Array.isArray(v?.data)) return v.data.map((x) => num(x, NaN));
  }
  // Shape C: [{ heartRate: 142, altitude: 900 }, ...]
  if (Array.isArray(streams)) {
    for (const k of keys) {
      if (streams.some((s) => s && s[k] != null)) {
        return streams.map((s) => num(s?.[k], NaN));
      }
    }
  }
  return [];
}

function resample(values, points) {
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

/**
 * Cardiac drift: how much the HR/effort relationship decouples between the
 * first and second half of the effort. The design shows it as "DÉRIVE +2,1 %".
 * Computed from the HR stream when one is available; null otherwise.
 */
export function computeDrift(streams) {
  const hr = extractSeries(streams, ['heartRate', 'hr', 'heart_rate', 'bpm'])
    .filter((v) => Number.isFinite(v) && v > 60);
  if (hr.length < 20) return null;

  const mid = Math.floor(hr.length / 2);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const first = avg(hr.slice(0, mid));
  const second = avg(hr.slice(mid));
  if (!first) return null;
  return Math.round(((second - first) / first) * 1000) / 10;
}

/** The six-cell metric grid at the top of the analysis screen. */
export function buildMetrics(a) {
  const km = a.distanceM / 1000;
  const cells = [
    { k: 'DURÉE', v: a.durationSec >= 3600
      ? `${Math.floor(a.durationSec / 3600)}h${String(Math.floor((a.durationSec % 3600) / 60)).padStart(2, '0')}`
      : `${Math.round(a.durationSec / 60)}′` },
    { k: 'DISTANCE', v: km ? `${km.toFixed(1).replace('.', ',')} km` : '—' },
    { k: 'D+', v: a.elevationGainM ? `${a.elevationGainM.toLocaleString('fr-FR').replace(/ /g, ' ')} m` : '—' },
  ];
  // VMA sessions care about HR max; steadier sessions care about pace.
  if (a.kind === 'vma') {
    cells.push({ k: 'FC MOY', v: a.hrAvg ? String(a.hrAvg) : '—' });
    cells.push({ k: 'FC MAX', v: a.hrMax ? String(a.hrMax) : '—' });
  } else {
    cells.push({ k: 'ALLURE', v: fmtPace(a.paceSecPerKm) });
    cells.push({ k: 'FC MOY', v: a.hrAvg ? String(a.hrAvg) : '—' });
  }
  cells.push({
    k: 'DÉRIVE',
    v: a.driftPct == null ? '—'
      : `${a.driftPct > 0 ? '+' : ''}${String(a.driftPct).replace('.', ',')} %`,
  });
  return cells;
}

/**
 * The red VERDICT banner. Written from the numbers, not from a model — the
 * design's voice is short, direct and specific, and a rule per failure mode
 * keeps it honest rather than generically encouraging.
 */
export function buildVerdict(a) {
  const drift = a.driftPct;
  // Fade compares like with like. On a long run the "intervals" are terrain
  // splits — a fast descent is not a rep holding up — so only rep-based
  // sessions get a fade verdict.
  const fade = (a.kind === 'vma' || a.kind === 'seuil') ? intervalFade(a.intervals) : null;

  if (fade && fade.pct >= 5) {
    return `Les dernières répétitions lâchent de ${String(fade.pct).replace('.', ',')} %. Tu as tenu, mais la fin manque de jus.`;
  }
  if (drift != null && drift >= 4) {
    return `Dérive à +${String(drift).replace('.', ',')} % : parti trop vite. L'allure se construit par le bas.`;
  }
  if (fade && fade.pct >= 3) {
    return `Dernier bloc payé cash : ${String(fade.pct).replace('.', ',')} % plus lent que le premier. Parti trop vite.`;
  }
  if (drift != null && drift <= 2 && a.kind === 'long') {
    return `Propre. Une dérive à +${String(drift).replace('.', ',')} % sur cette durée, c'est exactement la commande.`;
  }
  if (fade && fade.pct <= 2) {
    return 'Répétitions régulières du début à la fin. Séance exécutée comme écrite.';
  }
  return 'Séance dans la cible. Rien à corriger.';
}

/** How much the last third of the intervals slowed vs the first third. */
function intervalFade(intervals) {
  const paces = (intervals || [])
    .map((i) => parsePace(i.pace))
    .filter((p) => Number.isFinite(p));
  if (paces.length < 3) return null;

  const third = Math.max(1, Math.floor(paces.length / 3));
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const start = avg(paces.slice(0, third));
  const end = avg(paces.slice(-third));
  if (!start) return null;
  return { pct: Math.round(((end - start) / start) * 1000) / 10 };
}

function parsePace(str) {
  const m = String(str || '').match(/(\d+):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** @returns {import('../../src/data/model.js').Session} */
export function normalizePlannedSession(raw) {
  const type = sessionType(pick(raw, ['sportType', 'sport', 'type', 'category'], ''));
  const durationSec = toSeconds(pick(raw, ['duration', 'plannedDuration', 'totalTime'], 0));
  const dplus = Math.round(num(pick(raw, ['plannedAscent', 'totalAscent', 'elevationGain'], 0)));

  return {
    id: String(pick(raw, ['id', 'workoutId', 'planId'], cryptoId())),
    date: toIso(pick(raw, ['date', 'scheduledDate', 'startTime', 'day'])).slice(0, 10),
    type,
    title: String(pick(raw, ['name', 'title', 'workoutName'], 'Séance')),
    meta: [
      durationSec ? (durationSec >= 3600
        ? `${Math.floor(durationSec / 3600)}h${String(Math.floor((durationSec % 3600) / 60)).padStart(2, '0')}`
        : `${Math.round(durationSec / 60)}′`) : null,
      dplus ? `${dplus} D+` : null,
    ].filter(Boolean).join(' · ') || '—',
    done: Boolean(pick(raw, ['completed', 'isCompleted', 'done'], false)),
    load: 0, // recomputed against the athlete's zones in snapshot.js
    dplus: dplus || undefined,
    zone: String(pick(raw, ['targetZone', 'zone', 'intensity'], '')) || undefined,
    durationSec,
    steps: normalizeSteps(pick(raw, ['steps', 'structure', 'segments'], []) || []),
  };
}

function normalizeSteps(steps) {
  return (Array.isArray(steps) ? steps : []).map((s, i) => ({
    i: String(i + 1).padStart(2, '0'),
    label: String(pick(s, ['name', 'label', 'type'], `Étape ${i + 1}`)),
    detail: String(pick(s, ['description', 'detail', 'target', 'note'], '')),
  }));
}

export const _internals = { pick, num, toSeconds, toMetres, toIso, resample, extractSeries, inferMsMode };
