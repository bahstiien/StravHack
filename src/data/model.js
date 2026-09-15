// Domain model — the shape every provider must return.
//
// This is the contract between the UI (which never knows where data came from)
// and a provider (fixtures, a Coros snapshot on disk, or the live MCP bridge).
// Anything Coros-specific is normalised away before it reaches here.

/**
 * @typedef {'TRAIL'|'PPG'|'REPOS'} SessionType
 *
 * @typedef {Object} Session          A planned or completed day.
 * @property {string}  id
 * @property {string}  date           ISO date, YYYY-MM-DD.
 * @property {SessionType} type
 * @property {string}  title
 * @property {string}  meta           One-line summary shown under the title.
 * @property {boolean} done
 * @property {number}  load           Training load in UC (see computeLoad).
 * @property {number}  [dplus]        Elevation gain, metres.
 * @property {string}  [zone]         Target zone label (Z1..Z5, FORCE, TRONC…).
 * @property {string}  [brief]
 * @property {string}  [coach]
 * @property {{i:string,label:string,detail:string}[]} [steps]
 * @property {string}  [activityId]   Links to the Activity that fulfilled it.
 *
 * @typedef {Object} Activity        A recorded activity, normally from Coros.
 * @property {string}  id
 * @property {string}  date          ISO datetime.
 * @property {string}  title
 * @property {string}  location
 * @property {string}  device        e.g. "COROS APEX 2 PRO".
 * @property {'vma'|'seuil'|'long'|'autre'} kind
 * @property {number}  durationSec
 * @property {number}  distanceM
 * @property {number}  elevationGainM
 * @property {number}  hrAvg
 * @property {number}  hrMax
 * @property {number}  [paceSecPerKm]
 * @property {number}  [driftPct]    Cardiac drift, % (decoupling over the effort).
 * @property {Interval[]} intervals
 * @property {ZoneSlice[]} zones
 * @property {Streams} streams
 * @property {number}  [rpe]
 * @property {string}  [verdict]
 *
 * @typedef {Object} Interval
 * @property {string} name
 * @property {string} dur
 * @property {string} pace
 * @property {string} hr
 * @property {string} delta          Signed, already formatted ("+11″", "—").
 *
 * @typedef {Object} ZoneSlice
 * @property {string} z              "Z1".."Z5"
 * @property {number} pct
 * @property {string} time
 *
 * @typedef {Object} Streams         Normalised 0..1 series for the chart.
 * @property {number[]} hr
 * @property {number[]} altitude
 *
 * @typedef {Object} Exercise
 * @property {string} id
 * @property {string} cat
 * @property {string} name
 * @property {string} zone
 * @property {string} sets
 * @property {string} tempo
 * @property {string} why
 * @property {string[]} cues
 *
 * @typedef {Object} Snapshot        Everything the app renders.
 * @property {{name:string, device:string, hrMax:number, zones:number[]}} athlete
 * @property {Session[]}  sessions
 * @property {Activity[]} activities
 * @property {Exercise[]} exercises
 * @property {{source:string, fetchedAt:string, degraded?:string}} meta
 */

export const SESSION_TYPES = /** @type {const} */ (['TRAIL', 'PPG', 'REPOS']);

/**
 * Training load in "UC" — the unit the design puts on every row and bar.
 *
 * Banister TRIMP weighted for vertical: trail sessions pay for climbing, which
 * a flat HR-only TRIMP under-counts badly on a trail plan. PPG has no HR stream
 * worth trusting, so it is scored from duration and a session-type coefficient.
 *
 * @param {{durationSec:number, hrAvg?:number, elevationGainM?:number, type:SessionType}} a
 * @param {{hrRest:number, hrMax:number}} athlete
 */
export function computeLoad(a, athlete) {
  if (a.type === 'REPOS') return 0;
  const minutes = a.durationSec / 60;
  if (a.type === 'PPG' || !a.hrAvg) return Math.round(minutes * 0.8);

  const { hrRest, hrMax } = athlete;
  const reserve = Math.max(1, hrMax - hrRest);
  const ratio = Math.min(1, Math.max(0, (a.hrAvg - hrRest) / reserve));
  // Banister's exponential weighting, male coefficients.
  const trimp = minutes * ratio * 0.64 * Math.exp(1.92 * ratio);
  const vertical = (a.elevationGainM || 0) / 100 * 1.6;
  return Math.round(trimp + vertical);
}

/**
 * Freshness = acute load (7d) minus chronic load (28d daily average × 7).
 * Negative means you are carrying fatigue, positive means you are fresh.
 * @param {Session[]} sessions
 * @param {Date} on
 */
export function computeFreshness(sessions, on = new Date()) {
  const day = 86400000;
  const at = on.getTime();
  const sum = (days) => sessions
    .filter((s) => {
      const t = parseDate(s.date).getTime();
      return t <= at && t > at - days * day;
    })
    .reduce((acc, s) => acc + (s.load || 0), 0);
  const acute = sum(7);
  const chronic = sum(28) / 4;
  return Math.round(acute - chronic);
}

/** @param {number} sec */
export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}′`;
}

/** @param {number} sec */
export function fmtClock(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/** @param {number} secPerKm */
export function fmtPace(secPerKm) {
  if (!secPerKm || !isFinite(secPerKm)) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

/** French-formatted number: 1400 -> "1 400". */
export function fmtNum(n) {
  return Math.round(n).toLocaleString('fr-FR').replace(/\u202f/g, ' ');
}

/**
 * Parse a date the calendar way, not the UTC way.
 *
 * `new Date('2026-09-14')` is UTC midnight, so in Paris it reads back as the
 * 14th but in New York as the 13th — and `toISOString().slice(0,10)` on a local
 * Date has the mirror bug. A training calendar is a wall calendar: a date has
 * no timezone. So date-only strings are parsed as local midnight, and dates are
 * formatted from local fields.
 *
 * @param {string|Date} v
 */
export function parseDate(v) {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(v);
}

/** Local YYYY-MM-DD — the key every session is stored under. */
export function isoDate(v) {
  const d = parseDate(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const JOURS = ['DIM', 'LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM'];
const JOURS_LONG = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function dayShort(iso) { return JOURS[parseDate(iso).getDay()]; }
export function dayNum(iso) { return String(parseDate(iso).getDate()).padStart(2, '0'); }
export function dateLong(iso) {
  const d = parseDate(iso);
  return `${JOURS_LONG[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()].toUpperCase()}`;
}
export function dateSentence(iso) {
  const d = parseDate(iso);
  return `${JOURS_LONG[d.getDay()].toLowerCase()} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}
