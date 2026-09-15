// Le moteur de décision du questionnaire quotidien.
//
// Déterministe, sans IA, sans réseau, sans horloge : les mêmes réponses et le
// même contexte donnent toujours la même recommandation. C'est la condition
// pour qu'elle soit testable règle par règle, et pour qu'on puisse la relire
// six mois plus tard en sachant ce qui l'a produite.
//
// Le mécanisme tient en trois idées :
//
//   1. Chaque règle est une fonction pure qui regarde une chose et une seule.
//      Elle renvoie un *minimum* de gravité, un poids, une raison lisible et
//      des effets concrets — ou rien du tout.
//   2. La gravité finale est le maximum des minimums. Une règle ne peut donc
//      jamais adoucir une autre : une motivation à 5 n'efface pas une douleur.
//   3. Les poids s'additionnent en parallèle. Plusieurs signaux moyens finissent
//      par peser plus qu'un signal isolé, ce qu'aucun maximum ne saurait dire.
//
// Ce que le moteur ne fait pas, volontairement : diagnostiquer. Il constate une
// douleur, il n'en nomme jamais la cause, et le score n'est pas une mesure
// médicale.

import {
  areaSpoken, areaLabel, sorenessLabel, momentLabel, FATIGUE_LABELS, SLEEP_LABELS,
  MOTIVATION_LABELS,
} from './checkin-model.js';

export const STATUS = Object.freeze({
  KEEP: 'KEEP',
  NO_SESSION: 'NO_SESSION',
  SHORTEN: 'SHORTEN',
  ADAPT: 'ADAPT',
  MOVE: 'MOVE',
  RECOVER: 'RECOVER',
  MEDICAL: 'MEDICAL',
});

export const STATUS_LABELS = Object.freeze({
  [STATUS.KEEP]: 'SÉANCE MAINTENUE',
  [STATUS.NO_SESSION]: 'AUCUNE SÉANCE PRÉVUE',
  [STATUS.SHORTEN]: 'SÉANCE À RACCOURCIR',
  [STATUS.ADAPT]: 'SÉANCE À ADAPTER',
  [STATUS.MOVE]: 'SÉANCE À DÉPLACER',
  [STATUS.RECOVER]: 'RÉCUPÉRATION CONSEILLÉE',
  [STATUS.MEDICAL]: 'AVIS PROFESSIONNEL CONSEILLÉ',
});

/** L'échelle de gravité. `NO_SESSION` est au même niveau que « maintenue ». */
const SEVERITY = Object.freeze({
  [STATUS.KEEP]: 0,
  [STATUS.NO_SESSION]: 0,
  [STATUS.SHORTEN]: 1,
  [STATUS.ADAPT]: 2,
  [STATUS.MOVE]: 3,
  [STATUS.RECOVER]: 4,
  [STATUS.MEDICAL]: 5,
});

export const compareStatus = (a, b) => (SEVERITY[a] ?? 0) - (SEVERITY[b] ?? 0);

export const RULE_CODES = Object.freeze({
  TIME_UNAVAILABLE: 'time-unavailable',
  TIME_SHORT: 'time-short',
  TIME_VERY_SHORT: 'time-very-short',
  TIME_ENOUGH: 'time-enough',
  FATIGUE_HIGH: 'fatigue-high',
  SLEEP_POOR: 'sleep-poor',
  SLEEP_SHORT: 'sleep-short',
  FATIGUE_SLEEP: 'fatigue-and-sleep',
  SORENESS: 'soreness',
  SORENESS_TARGETED: 'soreness-targeted',
  PAIN: 'pain',
  PAIN_SEVERE: 'pain-severe',
  MOTIVATION_LOW: 'motivation-low',
  STRESS_HIGH: 'stress-high',
  LEGS_HEAVY: 'legs-heavy',
  FRESHNESS_LOW: 'freshness-low',
  RATIO_HIGH: 'ratio-high',
  RESTING_HR_HIGH: 'resting-hr-high',
  RECENT_LOAD_HIGH: 'recent-load-high',
  NEXT_DAY_KEY_SESSION: 'next-day-key-session',
  TAPER_PHASE: 'taper-phase',
  CUMULATIVE: 'cumulative-signals',
  ALL_CLEAR: 'all-clear',
});

/** Au-delà de ces totaux, l'accumulation parle plus fort que chaque signal. */
export const SCORE_THRESHOLDS = Object.freeze({ shorten: 2.5, adapt: 3, recover: 5 });

/** Sous ce ratio du temps prévu, raccourcir n'a plus de sens : on déplace. */
const TIME_MOVE_RATIO = 0.4;

const minutes = (value) => (Number.isFinite(value) ? value : null);

/* ── Les règles ──────────────────────────────────────────────────────────
 *
 * Signature commune : (answers, context) => null | {
 *   code, status?, weight?, reason, effects?
 * }
 * `status` est un plancher de gravité, `weight` une contribution au cumul.
 * Une règle qui n'a rien à dire renvoie `null`.
 */

const timeUnavailable = (a) => (a.availableMinutes === 0
  ? {
    code: RULE_CODES.TIME_UNAVAILABLE,
    status: STATUS.MOVE,
    weight: 0,
    reason: 'Tu as indiqué être indisponible aujourd’hui.',
    effects: { move: true },
  }
  : null);

function timeShort(a, c) {
  const planned = minutes(c.plannedDurationMinutes);
  const available = minutes(a.availableMinutes);
  if (!planned || !available || available >= planned) return null;

  const veryShort = available < planned * TIME_MOVE_RATIO;
  return {
    code: veryShort ? RULE_CODES.TIME_VERY_SHORT : RULE_CODES.TIME_SHORT,
    status: veryShort ? STATUS.MOVE : STATUS.SHORTEN,
    weight: 0,
    reason: veryShort
      ? `Tu disposes de ${available} minutes au lieu des ${planned} prévues : trop peu pour garder l’essentiel de la séance.`
      : `Tu disposes de ${available} minutes au lieu des ${planned} prévues.`,
    effects: { shorten: true, targetMinutes: available, move: veryShort },
  };
}

function timeEnough(a, c) {
  const planned = minutes(c.plannedDurationMinutes);
  const available = minutes(a.availableMinutes);
  if (!planned || !available || available < planned) return null;
  return {
    code: RULE_CODES.TIME_ENOUGH,
    weight: 0,
    reason: `Tu as ${available} minutes devant toi, la séance en demande ${planned}.`,
  };
}

const fatigueHigh = (a) => (a.fatigue >= 4
  ? {
    code: RULE_CODES.FATIGUE_HIGH,
    weight: a.fatigue === 5 ? 2 : 1,
    reason: `Fatigue générale déclarée ${FATIGUE_LABELS[a.fatigue]}.`,
  }
  : null);

const sleepPoor = (a) => (a.sleepQuality <= 2
  ? {
    code: RULE_CODES.SLEEP_POOR,
    weight: a.sleepQuality === 1 ? 2 : 1,
    reason: `Qualité de sommeil ${SLEEP_LABELS[a.sleepQuality]}.`,
  }
  : null);

const sleepShort = (a) => (Number.isFinite(a.sleepMinutes) && a.sleepMinutes > 0 && a.sleepMinutes < 360
  ? {
    code: RULE_CODES.SLEEP_SHORT,
    weight: 0.5,
    reason: `Nuit courte : ${Math.floor(a.sleepMinutes / 60)} h ${String(a.sleepMinutes % 60).padStart(2, '0')}.`,
  }
  : null);

/**
 * Fatigue et mauvais sommeil ensemble.
 *
 * La règle existe séparément parce que la combinaison dit autre chose que la
 * somme : mal dormir en étant frais se rattrape dans la journée, mal dormir en
 * étant déjà fatigué ne se rattrape pas à l'entraînement. Elle ne repèse rien —
 * les deux signaux comptent déjà —, elle relève le plancher.
 */
const fatigueAndSleep = (a) => (a.fatigue >= 4 && a.sleepQuality <= 2
  ? {
    code: RULE_CODES.FATIGUE_SLEEP,
    status: STATUS.ADAPT,
    weight: 0,
    reason: 'Fatigue élevée et mauvaise nuit se cumulent : deux signaux de récupération dégradée le même jour.',
  }
  : null);

function soreness(a) {
  const { level, areas } = a.soreness;
  if (!level || level === 'none') return null;
  const weights = { light: 0.5, moderate: 1, heavy: 2 };
  const where = areas.length
    ? ` ${areas.map(areaSpoken).filter(Boolean).join(', ') || areas.map(areaLabel).join(', ')}`
    : '';
  return {
    code: RULE_CODES.SORENESS,
    status: level === 'heavy' ? STATUS.SHORTEN : STATUS.KEEP,
    weight: weights[level] ?? 0,
    reason: `Courbatures ${sorenessLabel(level)}${where}.`,
    effects: {
      avoidAreas: areas,
      removePlyo: level === 'moderate' || level === 'heavy',
    },
  };
}

/**
 * Des courbatures importantes sur ce que la séance va justement solliciter.
 *
 * C'est la seule configuration où les courbatures changent le contenu : ailleurs
 * elles sont un signal de charge, ici elles sont une contre-indication locale.
 */
function sorenessTargeted(a, c) {
  const { level, areas } = a.soreness;
  if (level !== 'heavy' && level !== 'moderate') return null;
  const targeted = areas.filter((area) => (c.plannedTargets || []).includes(area));
  if (!targeted.length || level !== 'heavy') return null;
  return {
    code: RULE_CODES.SORENESS_TARGETED,
    status: STATUS.ADAPT,
    weight: 0,
    reason: `La séance sollicite ${targeted.map(areaSpoken).join(', ')}, justement courbaturés.`,
    effects: { avoidAreas: targeted, substitute: true, removePlyo: true },
  };
}

function pain(a) {
  if (!a.pain.present) return null;
  const where = a.pain.area ? areaSpoken(a.pain.area) || areaLabel(a.pain.area) : '';
  const when = a.pain.moments.length
    ? `, ${a.pain.moments.map(momentLabel).join(' et ')}`
    : '';
  const intensity = a.pain.intensity ? ` (${a.pain.intensity}/10)` : '';
  return {
    code: RULE_CODES.PAIN,
    status: STATUS.ADAPT,
    weight: 1.5,
    reason: `Douleur inhabituelle signalée ${where}${intensity}${when}.`,
    effects: {
      avoidAreas: a.pain.area ? [a.pain.area] : [],
      forbiddenMovements: a.pain.triggers,
      substitute: true,
      removePlyo: true,
    },
  };
}

/**
 * Les signaux qui demandent un avis, sans jamais dire lequel.
 *
 * Trois motifs, chacun reconnu de longue date comme sortant du cadre d'une
 * courbature : une intensité forte, une douleur présente au repos, une gêne qui
 * limite la vie de tous les jours. On ne nomme pas ce que c'est — ce n'est pas
 * le rôle de l'application, et se tromper coûterait plus cher que se taire.
 */
function painSevere(a) {
  if (!a.pain.present) return null;
  const strong = (a.pain.intensity ?? 0) >= 7;
  const atRest = a.pain.moments.includes('rest');
  const { limiting } = a.pain;
  if (!strong && !atRest && !limiting) return null;

  const why = [
    strong ? `une intensité de ${a.pain.intensity}/10` : null,
    atRest ? 'une douleur présente au repos' : null,
    limiting ? 'une gêne dans les gestes du quotidien' : null,
  ].filter(Boolean);

  return {
    code: RULE_CODES.PAIN_SEVERE,
    status: STATUS.MEDICAL,
    weight: 0,
    reason: `Tu signales ${why.join(', ')} : ne poursuis pas sans l’avis d’un professionnel de santé.`,
    effects: { medical: true, rest: true },
  };
}

const motivationLow = (a) => (a.motivation <= 2
  ? {
    code: RULE_CODES.MOTIVATION_LOW,
    // Un plancher à « raccourcir », jamais à « repos » : l'envie est un signal
    // secondaire, et une séance courte faite vaut mieux qu'une séance parfaite
    // repoussée.
    status: STATUS.SHORTEN,
    weight: 0.5,
    reason: `Motivation ${MOTIVATION_LABELS[a.motivation]} : une séance courte et simple passera mieux qu’une séance ambitieuse.`,
    effects: { simplify: true },
  }
  : null);

const stressHigh = (a) => (a.stress >= 5
  ? { code: RULE_CODES.STRESS_HIGH, weight: 1, reason: 'Niveau de stress déclaré très élevé.' }
  : null);

const legsHeavy = (a) => (a.legs != null && a.legs <= 2
  ? { code: RULE_CODES.LEGS_HEAVY, weight: 1, reason: 'Sensation de jambes lourdes.' }
  : null);

const freshnessLow = (a, c) => (Number.isFinite(c.freshness) && c.freshness <= -25
  ? {
    code: RULE_CODES.FRESHNESS_LOW,
    status: c.freshness <= -40 ? STATUS.SHORTEN : STATUS.KEEP,
    weight: c.freshness <= -40 ? 2 : 1,
    reason: `Fraîcheur à ${c.freshness} : la charge des sept derniers jours dépasse ce que tu encaisses d’habitude.`,
  }
  : null);

const ratioHigh = (a, c) => (Number.isFinite(c.ratio) && c.ratio >= 1.3
  ? {
    code: RULE_CODES.RATIO_HIGH,
    weight: 1,
    reason: `Ratio aigu/chronique à ${c.ratio.toFixed(2)} : la montée de charge est rapide.`,
  }
  : null);

function restingHrHigh(a, c) {
  const { restingHeartRate: hr, restingHeartRateBaseline: base } = c;
  if (!Number.isFinite(hr) || !Number.isFinite(base)) return null;
  const delta = hr - base;
  if (delta < 5) return null;
  return {
    code: RULE_CODES.RESTING_HR_HIGH,
    status: delta >= 8 ? STATUS.SHORTEN : STATUS.KEEP,
    weight: delta >= 8 ? 2 : 1,
    reason: `FC de repos à ${hr} contre ${Math.round(base)} en moyenne récente (+${Math.round(delta)}).`,
  };
}

function recentLoadHigh(a, c) {
  const { recentLoad: load, recentLoadBaseline: base } = c;
  if (!Number.isFinite(load) || !Number.isFinite(base) || base <= 0) return null;
  if (load < base * 1.5) return null;
  return {
    code: RULE_CODES.RECENT_LOAD_HIGH,
    weight: 1,
    reason: `${load} de charge sur trois jours, contre ${base} habituellement.`,
  };
}

/**
 * La séance qui compte est demain.
 *
 * Le club et la sortie longue sont les deux rendez-vous qu'on ne déplace pas.
 * Fatigué ou courbaturé la veille, ce qu'on enlève, c'est aujourd'hui.
 */
function nextDayKeySession(a, c) {
  const tomorrow = c.clubInDays === 1 ? 'la séance club' : c.longRunInDays === 1 ? 'la sortie longue' : null;
  if (!tomorrow) return null;
  const tired = a.fatigue >= 4 || ['moderate', 'heavy'].includes(a.soreness.level);
  if (!tired) return null;
  return {
    code: RULE_CODES.NEXT_DAY_KEY_SESSION,
    status: STATUS.ADAPT,
    weight: 0.5,
    reason: `${tomorrow.charAt(0).toUpperCase()}${tomorrow.slice(1)} est demain : mieux vaut arriver avec des jambes disponibles.`,
    effects: { removePlyo: true, protectLegs: true },
  };
}

function taperPhase(a, c) {
  if (!['affûtage', 'pré-affûtage', 'course'].includes(c.phase)) return null;
  const negative = a.fatigue >= 4 || a.soreness.level === 'heavy' || a.pain.present;
  if (!negative) return null;
  return {
    code: RULE_CODES.TAPER_PHASE,
    weight: 0.5,
    reason: `${c.phaseLabel || 'Affûtage'} : arriver frais compte plus que gagner une séance.`,
  };
}

/** L'ordre est celui de la lecture, pas celui de la décision. */
const RULES = [
  timeUnavailable, timeShort, timeEnough,
  fatigueHigh, sleepPoor, sleepShort, fatigueAndSleep,
  soreness, sorenessTargeted,
  pain, painSevere,
  motivationLow, stressHigh, legsHeavy,
  freshnessLow, ratioHigh, restingHrHigh, recentLoadHigh,
  nextDayKeySession, taperPhase,
];

/** Les règles exposées une par une, pour les éprouver isolément. */
export const RULE_LIST = Object.freeze(RULES.map((rule) => ({ name: rule.name, evaluate: rule })));

const EMPTY_EFFECTS = Object.freeze({
  shorten: false,
  targetMinutes: null,
  substitute: false,
  removePlyo: false,
  simplify: false,
  protectLegs: false,
  move: false,
  rest: false,
  medical: false,
  avoidAreas: [],
  forbiddenMovements: [],
});

function mergeEffects(base, extra = {}) {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(extra).filter(([key]) => !['avoidAreas', 'forbiddenMovements', 'targetMinutes'].includes(key))),
    avoidAreas: [...new Set([...base.avoidAreas, ...(extra.avoidAreas || [])])],
    forbiddenMovements: [...new Set([...base.forbiddenMovements, ...(extra.forbiddenMovements || [])])],
    targetMinutes: extra.targetMinutes ?? base.targetMinutes,
  };
}

/** L'action concrète que porte la recommandation. */
function actionFor(status, effects) {
  if (status === STATUS.MEDICAL) return 'seek-advice';
  if (status === STATUS.RECOVER) return 'recover';
  if (status === STATUS.MOVE) return 'move';
  if (status === STATUS.NO_SESSION) return 'none';
  if (status === STATUS.ADAPT) {
    if (effects.shorten && effects.substitute) return 'shorten-and-substitute';
    return effects.shorten ? 'shorten' : 'substitute';
  }
  if (status === STATUS.SHORTEN) return 'shorten';
  return 'keep';
}

/**
 * Évalue une journée.
 *
 * @param {object} answers  réponses normalisées
 * @param {object} context  contexte du jour (voir checkin-context.js)
 * @returns {{
 *   status:string, statusLabel:string, score:number,
 *   reasons:{code:string,text:string}[], effects:object,
 *   proposedAction:string, usedCoros:boolean, dataNote:string
 * }}
 */
export function evaluateCheckin(answers, context = {}) {
  const a = answers;
  const c = context;

  const fired = [];
  for (const rule of RULES) {
    const result = rule(a, c);
    if (result) fired.push(result);
  }

  const score = Math.round(fired.reduce((sum, r) => sum + (r.weight || 0), 0) * 100) / 100;

  let status = STATUS.KEEP;
  let effects = EMPTY_EFFECTS;
  for (const rule of fired) {
    if (rule.status && compareStatus(rule.status, status) > 0) status = rule.status;
    if (rule.effects) effects = mergeEffects(effects, rule.effects);
  }

  const reasons = fired.map((rule) => ({ code: rule.code, text: rule.reason }));

  // L'accumulation, une fois que chaque signal a parlé pour lui-même.
  const cumulative = score >= SCORE_THRESHOLDS.recover ? STATUS.RECOVER
    : score >= SCORE_THRESHOLDS.adapt ? STATUS.ADAPT
      : score >= SCORE_THRESHOLDS.shorten ? STATUS.SHORTEN
        : null;
  if (cumulative && compareStatus(cumulative, status) > 0) {
    status = cumulative;
    reasons.push({
      code: RULE_CODES.CUMULATIVE,
      text: 'Plusieurs indicateurs défavorables le même jour : pris ensemble, ils pèsent plus que chacun séparément.',
    });
  }
  if (status === STATUS.RECOVER) effects = mergeEffects(effects, { rest: true });

  // Sans séance, « maintenue » ou « à raccourcir » ne veulent rien dire. Seules
  // les recommandations qui portent sur le corps survivent.
  if (!c.plannedSessionId && compareStatus(status, STATUS.RECOVER) < 0) {
    status = STATUS.NO_SESSION;
    reasons.push({
      code: 'no-session',
      text: 'Aucune séance n’est prévue aujourd’hui : rien à adapter, ces réponses alimentent le suivi.',
    });
  }

  if (!reasons.length) {
    reasons.push({
      code: RULE_CODES.ALL_CLEAR,
      text: 'Aucun signal défavorable : temps suffisant, récupération correcte, pas de douleur.',
    });
  }

  const usedCoros = Boolean(c.hasCorosData);
  return {
    status,
    statusLabel: STATUS_LABELS[status],
    score,
    reasons,
    effects,
    proposedAction: actionFor(status, effects),
    usedCoros,
    dataNote: usedCoros
      ? 'Recommandation calculée sur tes réponses et les données Coros du jour.'
      : 'Aucune donnée Coros disponible : la recommandation repose uniquement sur tes réponses déclaratives et l’historique local.',
  };
}
