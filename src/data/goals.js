// Les objectifs, et ce qu'ils font au plan.
//
// Un objectif n'est pas une décoration : il change la forme des semaines. Une
// course dans trois mois demande du volume ; la même à quinze jours demande
// qu'on en enlève. C'est ici qu'on décide laquelle des deux on est en train de
// préparer, et le plan lit cette décision sans jamais la reprendre.

const KEY = 'denivele.goals.v1';
const EQUIP_KEY = 'denivele.equipment.v1';

/**
 * Le matériel disponible, coché dans Réglages.
 *
 * Le poids du corps est toujours là et n'est pas décochable — sans lui il ne
 * resterait rien à proposer. Un stockage vide veut dire « je n'ai encore rien
 * dit », pas « je n'ai rien » : on renvoie alors un jeu par défaut raisonnable
 * plutôt qu'une bibliothèque réduite à trois exercices.
 */
export const DEFAULT_EQUIPMENT = ['poids-du-corps', 'banc-step', 'halteres', 'elastique'];

export function loadEquipment() {
  try {
    const raw = localStorage.getItem(EQUIP_KEY);
    if (!raw) return DEFAULT_EQUIPMENT;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_EQUIPMENT;
    return [...new Set(['poids-du-corps', ...parsed])];
  } catch {
    return DEFAULT_EQUIPMENT;
  }
}

export function saveEquipment(list) {
  try {
    localStorage.setItem(EQUIP_KEY, JSON.stringify([...new Set(['poids-du-corps', ...list])]));
    return true;
  } catch {
    return false;
  }
}

/** Un exercice est faisable si TOUT ce qu'il suppose est disponible. */
export function canDo(exercise, equipment) {
  return (exercise.needs || []).every((n) => equipment.includes(n));
}

/**
 * @typedef {Object} Goal
 * @property {string} id
 * @property {string} name
 * @property {string} date            YYYY-MM-DD
 * @property {number} distanceKm
 * @property {number} elevationGainM
 * @property {'A'|'B'|'C'} priority   A = on construit tout autour, C = on la court sans s'arrêter de s'entraîner
 * @property {string} characteristics texte libre — terrain, nuit, altitude, barrières horaires
 */

const DAY = 86400000;

const parse = (ymd) => {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function loadGoals() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Navigation privée, stockage bloqué, JSON corrompu : pas d'objectif, et
    // le plan retombe sur la progression de charge pure.
    return [];
  }
}

export function saveGoals(goals) {
  try {
    localStorage.setItem(KEY, JSON.stringify(goals));
    return true;
  } catch {
    return false;
  }
}

export function emptyGoal() {
  return {
    id: `g-${Date.now().toString(36)}`,
    name: '',
    date: '',
    distanceKm: '',
    elevationGainM: '',
    priority: 'A',
    characteristics: '',
  };
}

/** Objectifs à venir, le plus proche d'abord. */
export function upcomingGoals(goals, today = new Date()) {
  const key = todayIso(today);
  return (goals || [])
    .filter((g) => g.date && g.date >= key && g.distanceKm)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function todayIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Kilomètre-effort : la distance plate qui coûterait le même prix.
 *
 * 100 m de dénivelé ≈ 1 km de plat. C'est la règle de terrain la plus répandue
 * en trail, et elle est suffisante pour dimensionner une sortie longue — une
 * modélisation plus fine (Naismith, coefficients par pente) demanderait le
 * profil de la course, qu'on n'a pas.
 */
export function effortKm(goal) {
  return Number(goal.distanceKm || 0) + Number(goal.elevationGainM || 0) / 100;
}

/**
 * Durée estimée de la course.
 *
 * Basée sur l'allure de sortie longue de l'athlète appliquée au km-effort, avec
 * une majoration qui grandit avec la distance : personne ne court 80 km à
 * l'allure de sa sortie longue de 2 h.
 */
export function estimatedDurationMin(goal, longRunPaceSecPerKm = 336) {
  const km = effortKm(goal);
  if (!km) return 0;
  const fatigue = km <= 25 ? 1 : km <= 50 ? 1.12 : km <= 80 ? 1.25 : 1.4;
  return Math.round((km * longRunPaceSecPerKm * fatigue) / 60);
}

/**
 * Phase de préparation pour une semaine donnée.
 *
 * Les seuils sont ceux d'une préparation trail classique. L'affûtage baisse le
 * volume sans toucher à l'intensité : c'est ce qui fait arriver frais sans
 * arriver rouillé.
 */
export function phaseFor(goal, weekStart, longRunPaceSecPerKm) {
  if (!goal?.date) return null;
  const weeksOut = Math.ceil((parse(goal.date).getTime() - weekStart.getTime()) / (7 * DAY));

  const base = {
    goal, weeksOut,
    durationMin: estimatedDurationMin(goal, longRunPaceSecPerKm),
    effort: effortKm(goal),
  };

  if (weeksOut < 0) return { ...base, phase: 'passé', loadFactor: 1, label: 'Objectif passé' };
  if (weeksOut === 0) return { ...base, phase: 'course', loadFactor: 0.35, label: 'Semaine de course' };
  if (weeksOut === 1) return { ...base, phase: 'affûtage', loadFactor: 0.55, label: 'Affûtage' };
  if (weeksOut === 2) return { ...base, phase: 'pré-affûtage', loadFactor: 0.8, label: 'Début d’affûtage' };
  if (weeksOut <= 5) return { ...base, phase: 'spécifique', loadFactor: 1.1, label: 'Bloc spécifique' };
  if (weeksOut <= 12) return { ...base, phase: 'développement', loadFactor: 1, label: 'Développement' };
  return { ...base, phase: 'base', loadFactor: 0.95, label: 'Base' };
}

/**
 * Durée plafond de la sortie longue, en minutes, pour cette phase.
 *
 * On ne court jamais la distance de course à l'entraînement au-delà du marathon :
 * le coût de récupération dépasse le gain. La fraction baisse donc quand la
 * course s'allonge.
 */
export function longRunCeilingMin(p) {
  if (!p || !p.durationMin) return 180;
  const km = p.effort;
  const fraction = km <= 25 ? 0.85 : km <= 50 ? 0.55 : km <= 80 ? 0.4 : 0.32;
  const ceiling = Math.round(p.durationMin * fraction);

  if (p.phase === 'course') return 40;
  if (p.phase === 'affûtage') return Math.min(ceiling, 75);
  if (p.phase === 'pré-affûtage') return Math.min(ceiling, 110);
  return Math.min(ceiling, 240);
}

/** D+ à viser sur la semaine, pour que le terrain de la course soit préparé. */
export function weeklyElevationTarget(p) {
  if (!p || !p.goal?.elevationGainM) return null;
  const goalD = Number(p.goal.elevationGainM);
  const share = p.phase === 'spécifique' ? 0.75
    : p.phase === 'développement' ? 0.55
      : p.phase === 'pré-affûtage' ? 0.45
        : p.phase === 'affûtage' ? 0.25
          : p.phase === 'course' ? 0.1
            : 0.35;
  return Math.round(goalD * share);
}

/** La ligne d'en-tête : « CCC · J−48 · bloc spécifique ». */
export function goalHeadline(p) {
  if (!p) return null;
  const days = Math.round((parse(p.goal.date).getTime() - Date.now()) / DAY);
  if (days < 0) return `${p.goal.name} — passé`;
  if (days === 0) return `${p.goal.name} — aujourd’hui`;
  return `${p.goal.name || 'Objectif'} · J−${days} · ${p.label.toLowerCase()}`;
}
