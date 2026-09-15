// Ce que l'application sait du jour, ramassé en un seul objet.
//
// Le moteur de décision ne connaît ni le snapshot, ni la Coros, ni le plan : il
// reçoit ce contexte, et rien d'autre. C'est ce qui permet de rejouer une
// journée entière en test avec un objet littéral, et c'est aussi ce qui est
// figé dans l'historique — une recommandation reste vérifiable parce qu'on a
// gardé les chiffres qui l'ont produite.

import { computeFreshness, isoDate, parseDate } from './model.js';
import { BODY_AREAS } from './checkin-model.js';

const DAY = 86400000;

/** L'inverse du pont `area → targets` : une cible PPG vers sa zone du corps. */
const TARGET_TO_AREA = BODY_AREAS.reduce((map, area) => {
  for (const target of area.targets) if (!map[target]) map[target] = area.id;
  return map;
}, {});

/** Ce que la course sollicite, quoi qu'il arrive. */
const RUN_AREAS = ['quadriceps', 'calves', 'hamstrings', 'glutes'];

/**
 * Les zones du corps qu'une séance va solliciter.
 *
 * Pour une PPG, c'est la somme des cibles de ses exercices — l'information est
 * dans la bibliothèque, on ne la devine pas. Pour une sortie, c'est les jambes :
 * inutile d'être plus fin, aucune séance de course n'épargne les mollets.
 */
export function sessionTargetAreas(session) {
  if (!session) return [];
  const fromExercises = (session.ppgExercises || [])
    .map((exercise) => TARGET_TO_AREA[exercise?.target])
    .filter(Boolean);
  if (session.type === 'TRAIL') return [...new Set([...RUN_AREAS, ...fromExercises])];
  return [...new Set(fromExercises)];
}

const numberOr = (value, fallback = null) => (Number.isFinite(value) ? value : fallback);

/** La FC de repos du jour, et la référence des jours précédents. */
function restingHeartRate(entries, date) {
  const list = (entries || [])
    .filter((item) => item?.date && Number.isFinite(item.bpm))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return { value: null, baseline: null };

  const today = list.find((item) => item.date <= date) || null;
  // La moyenne des sept jours précédents, aujourd'hui exclu : comparer un
  // chiffre à une moyenne qui le contient l'écrase.
  const previous = list.filter((item) => item.date < (today?.date ?? date)).slice(0, 7);
  const baseline = previous.length
    ? Math.round((previous.reduce((sum, item) => sum + item.bpm, 0) / previous.length) * 10) / 10
    : null;
  return { value: today?.bpm ?? null, baseline };
}

/** Charge encaissée sur les trois jours qui précèdent la date. */
function recentLoad(sessions, date) {
  const end = parseDate(date).getTime();
  return (sessions || [])
    .filter((session) => {
      if (!(session.load > 0) || session.planned) return false;
      const t = parseDate(session.date).getTime();
      return t < end && t >= end - 3 * DAY;
    })
    .reduce((sum, session) => sum + session.load, 0);
}

/**
 * La charge « normale » de trois jours, mesurée sur les quatre semaines qui
 * précèdent. Sans elle, un total de 180 ne veut rien dire.
 */
function recentLoadBaseline(sessions, date) {
  const end = parseDate(date).getTime();
  const total = (sessions || [])
    .filter((session) => {
      if (!(session.load > 0) || session.planned) return false;
      const t = parseDate(session.date).getTime();
      return t < end && t >= end - 28 * DAY;
    })
    .reduce((sum, session) => sum + session.load, 0);
  return total > 0 ? Math.round((total / 28) * 3) : null;
}

/** Dans combien de jours la prochaine séance qui répond à `match` ? */
function daysUntil(sessions, date, match) {
  const from = parseDate(date).getTime();
  const next = (sessions || [])
    .filter((session) => parseDate(session.date).getTime() > from && match(session))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return next ? Math.round((parseDate(next.date).getTime() - from) / DAY) : null;
}

const isLongRun = (session) => Boolean(session.isLongRun)
  || /sortie longue/i.test(session.title || '');

/**
 * @param {object} o
 * @param {object} o.snapshot   le snapshot affiché par l'app
 * @param {string} o.date       la journée concernée, YYYY-MM-DD
 * @param {object} [o.session]  la séance du jour, si l'appelant la connaît déjà
 */
export function buildCheckinContext({ snapshot, date = isoDate(new Date()), session = null }) {
  const sessions = snapshot?.sessions || [];
  const planned = session
    ?? sessions.find((item) => item.date === date && !item.done && item.type !== 'REPOS')
    ?? sessions.find((item) => item.date === date && !item.done)
    ?? null;

  const hr = restingHeartRate(snapshot?.restingHr, date);
  const ratio = numberOr(snapshot?.load?.[0]?.ratio);
  const hasSessions = sessions.some((item) => item.load > 0 && !item.planned);
  const hasCorosData = Boolean(snapshot?.load?.length || snapshot?.restingHr?.length || hasSessions);

  const durationMinutes = planned?.durationSec
    ? Math.round(planned.durationSec / 60)
    : null;

  return {
    date,
    plannedSessionId: planned?.id ?? null,
    plannedTitle: planned?.title ?? null,
    plannedType: planned?.type ?? null,
    plannedIntensity: planned?.intensity ?? null,
    plannedDurationMinutes: durationMinutes,
    plannedTargets: sessionTargetAreas(planned),
    plannedHasPlyo: Boolean((planned?.ppgExercises || []).some((e) => e.cat === 'PLIOMÉTRIE')),
    plannedIsClub: Boolean(planned?.isClub),
    plannedIsLongRun: planned ? isLongRun(planned) : false,
    sessionStatus: planned?.status ?? null,
    sessionLocked: Boolean(planned?.locked || planned?.done
      || ['VALIDÉE', 'RÉALISÉE'].includes(planned?.status)),

    freshness: hasCorosData ? computeFreshness(sessions, parseDate(date)) : null,
    ratio,
    recentLoad: recentLoad(sessions, date),
    recentLoadBaseline: recentLoadBaseline(sessions, date),
    restingHeartRate: hr.value,
    restingHeartRateBaseline: hr.baseline,

    clubInDays: daysUntil(sessions, date, (item) => Boolean(item.isClub)),
    longRunInDays: daysUntil(sessions, date, isLongRun),

    phase: planned?.phase ?? null,
    phaseLabel: planned?.phaseLabel ?? null,
    goalName: planned?.goalName ?? null,

    hasCorosData,
  };
}
