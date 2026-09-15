// Le générateur de séances WOD — CrossFit et HYROX.
//
// Tout est ici, et rien d'ici ne connaît React : c'est un module de données qui
// prend des paramètres et rend une séance, ce qui le rend testable sans DOM
// (voir tests/wod.test.mjs).
//
// Deux principes tiennent le fichier :
//
//   La durée est une promesse. Une séance de 40 minutes fait 40 minutes,
//   échauffement et retour au calme compris. On ne compose donc pas des blocs
//   qu'on additionne ensuite en espérant tomber juste : on part d'une structure
//   dont la somme est connue, et on la remplit. La somme ne peut pas dériver.
//
//   Le matériel et les contraintes filtrent avant tout le reste. Un mouvement
//   qui suppose une barre n'entre jamais dans le tirage quand la barre n'est pas
//   cochée, et un genou douloureux retire les mouvements qui le chargent avant
//   qu'on ait commencé à choisir. Ce qui ne peut pas être proposé n'est pas
//   proposé — il n'y a pas de rattrapage à l'affichage.
//
// La génération est déterministe : à graine égale, séance égale. C'est ce qui
// rend « Régénérer » prévisible (la graine change, la séance change) et les
// tests possibles.

import {
  MOVEMENTS, MOVEMENT_BY_ID, WOD_EQUIPMENT, GROUP_LABELS, ZONE_KEYWORDS, BODY_ZONES,
  equipmentLabel,
} from './wod-movements.js';

export { WOD_EQUIPMENT, BODY_ZONES, GROUP_LABELS };

// ── Le vocabulaire des paramètres ───────────────────────────────────────────

export const DURATIONS = [20, 30, 40, 50, 60];

export const SESSION_TYPES = [
  { id: 'crossfit', label: 'CrossFit' },
  { id: 'hyrox', label: 'HYROX' },
  { id: 'mixte', label: 'Mixte' },
  { id: 'aleatoire', label: 'Aléatoire' },
];

export const LEVELS = [
  { id: 'debutant', label: 'Débutant' },
  { id: 'intermediaire', label: 'Intermédiaire' },
  { id: 'avance', label: 'Avancé' },
];

export const GOALS = [
  { id: 'conditionnement', label: 'Conditionnement général' },
  { id: 'force', label: 'Force' },
  { id: 'endurance', label: 'Endurance' },
  { id: 'puissance', label: 'Puissance' },
  { id: 'mobilite', label: 'Mobilité' },
  { id: 'perte-de-masse-grasse', label: 'Perte de masse grasse' },
];

const LEVEL_INDEX = { debutant: 0, intermediaire: 1, avance: 2 };
const label = (list, id) => list.find((x) => x.id === id)?.label ?? id;

// ── Les structures de durée ─────────────────────────────────────────────────
//
// Une variante par forme de séance possible, de la moins exigeante à la plus
// exigeante. Les minutes sont écrites à la main et leur somme est vérifiée au
// chargement du module : une structure qui ne tombe pas juste fait échouer
// l'import, pas la séance de quelqu'un.

const STRUCTURES = {
  20: [
    { wods: 1, segments: [['echauffement', 5], ['wod', 12], ['retour-au-calme', 3]] },
  ],
  30: [
    { wods: 2, segments: [['echauffement', 6], ['wod', 9], ['recuperation', 2], ['wod', 9], ['retour-au-calme', 4]] },
    { wods: 1, segments: [['echauffement', 6], ['wod', 20], ['retour-au-calme', 4]] },
  ],
  40: [
    { wods: 2, segments: [['echauffement', 6], ['wod', 14], ['recuperation', 3], ['wod', 14], ['retour-au-calme', 3]] },
  ],
  50: [
    { wods: 3, segments: [['echauffement', 7], ['wod', 11], ['recuperation', 3], ['wod', 11], ['recuperation', 3], ['wod', 11], ['retour-au-calme', 4]] },
    { wods: 2, segments: [['echauffement', 8], ['wod', 17], ['recuperation', 4], ['wod', 17], ['retour-au-calme', 4]] },
  ],
  60: [
    { wods: 3, segments: [['echauffement', 8], ['wod', 13], ['recuperation', 4], ['wod', 13], ['recuperation', 4], ['wod', 13], ['retour-au-calme', 5]] },
    { wods: 2, segments: [['echauffement', 9], ['wod', 20], ['recuperation', 5], ['wod', 20], ['retour-au-calme', 6]] },
  ],
};

for (const [minutes, variantes] of Object.entries(STRUCTURES)) {
  for (const v of variantes) {
    const sum = v.segments.reduce((a, [, m]) => a + m, 0);
    if (sum !== Number(minutes)) {
      throw new Error(`Structure ${minutes} min incohérente : ${sum} min`);
    }
    if (v.segments.filter(([k]) => k === 'wod').length !== v.wods) {
      throw new Error(`Structure ${minutes} min : nombre de WOD annoncé faux`);
    }
  }
}

// ── Les formats ─────────────────────────────────────────────────────────────

const FORMATS = {
  amrap: {
    label: 'AMRAP',
    score: 'Nombre de tours complétés, plus les répétitions du tour entamé',
  },
  emom: {
    label: 'EMOM',
    score: 'Minutes bouclées dans le temps imparti, et la première où tu décroches',
  },
  'for-time': {
    label: 'For Time',
    score: 'Temps total, et temps de chaque tour',
  },
  chipper: {
    label: 'Chipper',
    score: 'Temps total pour venir à bout de la liste',
  },
  intervalles: {
    label: 'Intervalles',
    score: 'Répétitions cumulées sur l’ensemble des séries',
  },
  'hyrox-sim': {
    label: 'Simulation HYROX',
    score: 'Temps total et temps par station',
  },
  'hyrox-compromis': {
    label: 'Compromised running',
    score: 'Temps total et temps du dernier bloc de course',
  },
};

/** Formats plausibles pour un objectif, par discipline. */
const FORMATS_BY_GOAL = {
  crossfit: {
    conditionnement: ['amrap', 'for-time', 'chipper'],
    force: ['emom', 'for-time'],
    endurance: ['amrap', 'chipper'],
    puissance: ['intervalles', 'emom'],
    mobilite: ['intervalles', 'amrap'],
    'perte-de-masse-grasse': ['amrap', 'intervalles'],
  },
  hyrox: {
    conditionnement: ['hyrox-sim', 'hyrox-compromis'],
    force: ['hyrox-sim', 'for-time'],
    endurance: ['hyrox-compromis', 'hyrox-sim'],
    puissance: ['intervalles', 'hyrox-compromis'],
    mobilite: ['intervalles', 'hyrox-sim'],
    'perte-de-masse-grasse': ['hyrox-compromis', 'intervalles'],
  },
};

/** RPE visé par objectif, avant correction de niveau. */
const RPE_BY_GOAL = {
  conditionnement: [7, 8],
  force: [7, 8],
  endurance: [6, 7],
  puissance: [8, 9],
  mobilite: [4, 5],
  'perte-de-masse-grasse': [7, 8],
};

const RPE_WORDS = [
  [0, 'très facile, conversation normale'],
  [4, 'facile, tu parles par phrases'],
  [6, 'soutenu, tu parles par bouts de phrase'],
  [8, 'dur, quelques mots à la fois'],
  [9, 'très dur, plus un mot'],
];

const NAMES = [
  'ENCLUME', 'GRANIT', 'ARDOISE', 'MISTRAL', 'BASALTE', 'CHARBON', 'SILEX',
  'BOURRASQUE', 'CRÉMAILLÈRE', 'MARTEAU', 'ÉTINCELLE', 'CARRIÈRE', 'TOURMENTE',
  'FORGE', 'PALISSADE', 'CAILLASSE', 'ALIZÉ', 'GRÉSIL', 'TRAVERSE', 'MEULE',
];

// ── Hasard reproductible ────────────────────────────────────────────────────

/**
 * Un générateur pseudo-aléatoire à graine (mulberry32).
 *
 * Math.random() donnerait une séance différente à chaque rendu de React, donc
 * une séance qui change en la regardant. Ici la graine est un paramètre : la
 * même graine rend exactement la même séance, et « Régénérer » n'est rien
 * d'autre qu'un incrément de graine.
 */
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (next, list) => list[Math.floor(next() * list.length) % list.length];

function shuffle(next, list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Contraintes ─────────────────────────────────────────────────────────────

const normalize = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[’']/g, ' ');

const hasWord = (haystack, word) => new RegExp(`(^|[^a-z0-9])${word}($|[^a-z0-9])`).test(haystack);

/**
 * Les zones à épargner, lues dans le texte libre des contraintes.
 *
 * On ne cherche pas à comprendre la phrase, seulement à y reconnaître des mots
 * qui désignent une partie du corps — et la recherche se fait sur des mots
 * entiers, sinon « semaines » contiendrait « main » et on retirerait tous les
 * mouvements qui chargent le poignet pour rien.
 */
export function parseConstraintZones(constraints) {
  const texte = normalize([constraints?.pain, constraints?.injuries, constraints?.avoid].join(' . '));
  const zones = [];
  for (const [zone, mots] of Object.entries(ZONE_KEYWORDS)) {
    if (mots.some((m) => hasWord(texte, normalize(m)))) zones.push(zone);
  }
  return zones;
}

/** Les mouvements nommés explicitement dans « à éviter ». */
function parseAvoidTerms(constraints) {
  return normalize(constraints?.avoid)
    .split(/[,;\n/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function constraintNotes(constraints) {
  const out = [];
  if (constraints?.pain?.trim()) out.push(`Douleurs signalées : ${constraints.pain.trim()}`);
  if (constraints?.injuries?.trim()) out.push(`Blessures signalées : ${constraints.injuries.trim()}`);
  if (constraints?.avoid?.trim()) out.push(`À éviter : ${constraints.avoid.trim()}`);
  return out;
}

// ── Validation des paramètres ───────────────────────────────────────────────

/** Paramètres par défaut — reprend le matériel déjà coché dans l'app. */
export function defaultWodParams(savedEquipment) {
  const known = new Set([
    ...WOD_EQUIPMENT.map((e) => e.id),
    ...MOVEMENTS.flatMap((m) => m.needs),
  ]);
  const fromApp = (Array.isArray(savedEquipment) ? savedEquipment : []).filter((id) => known.has(id));
  return {
    durationMin: 40,
    equipment: [...new Set(['poids-du-corps', ...fromApp])],
    type: 'mixte',
    level: 'intermediaire',
    goal: 'conditionnement',
    constraints: { pain: '', injuries: '', avoid: '' },
    seed: 1,
  };
}

/**
 * Valide les paramètres saisis.
 *
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string,string>}}
 */
export function validateWodParams(params) {
  const errors = {};
  if (!params || typeof params !== 'object') {
    return { ok: false, errors: { form: 'Aucun paramètre à valider.' } };
  }

  if (!DURATIONS.includes(params.durationMin)) {
    errors.durationMin = `Choisis une durée : ${DURATIONS.join(', ')} minutes.`;
  }
  if (!SESSION_TYPES.some((t) => t.id === params.type)) {
    errors.type = 'Choisis un type de séance.';
  }
  if (!LEVELS.some((l) => l.id === params.level)) {
    errors.level = 'Choisis un niveau.';
  }
  if (!GOALS.some((g) => g.id === params.goal)) {
    errors.goal = 'Choisis un objectif.';
  }
  if (!Array.isArray(params.equipment) || params.equipment.length === 0) {
    errors.equipment = 'Coche au moins « Poids du corps / aucun matériel ».';
  }

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    value: {
      durationMin: params.durationMin,
      // Le poids du corps est toujours disponible : on ne s'entraîne pas sans
      // son propre corps, et l'oublier viderait la moitié du catalogue.
      equipment: [...new Set(['poids-du-corps', ...params.equipment])],
      type: params.type,
      level: params.level,
      goal: params.goal,
      constraints: {
        pain: String(params.constraints?.pain ?? ''),
        injuries: String(params.constraints?.injuries ?? ''),
        avoid: String(params.constraints?.avoid ?? ''),
      },
      seed: Number.isFinite(params.seed) ? params.seed : 1,
    },
  };
}

// ── Volume ──────────────────────────────────────────────────────────────────

const UNITS = {
  reps: (v) => `${v} rép.`,
  distance: (v) => `${v} m`,
  calories: (v) => `${v} cal`,
  temps: (v) => `${v}″`,
};

/** La dose de référence d'un mouvement pour un niveau. */
export function doseFor(movement, level) {
  const value = movement.dose[LEVEL_INDEX[level] ?? 1];
  return { value, unit: movement.mode, label: UNITS[movement.mode](value) };
}

const round5 = (v) => (v >= 20 ? Math.round(v / 5) * 5 : Math.max(1, Math.round(v)));

/**
 * Le volume affiché, une fois le format pris en compte.
 *
 * Vingt kettlebell swings ne veulent pas dire la même chose dans un AMRAP de
 * 14 minutes (par tour) et dans un chipper (une seule fois). Le format décide
 * donc du multiplicateur, et le libellé dit toujours de quoi il parle.
 */
function volumeFor(movement, level, formatId) {
  const { value, label: base } = doseFor(movement, level);
  const fmt = (v) => UNITS[movement.mode](round5(v));

  if (formatId === 'chipper') return `${fmt(value * 2)} — une seule fois`;
  if (formatId === 'emom') return `${fmt(value * 0.7)} dans la minute`;
  if (formatId === 'intervalles') {
    return movement.mode === 'temps'
      ? '40″ d’effort continu'
      : `${fmt(value * 0.5)} en 40″ (repère)`;
  }
  if (formatId === 'hyrox-sim' || formatId === 'hyrox-compromis') {
    return `${fmt(value * 1.2)} par station`;
  }
  return `${base} par tour`;
}

// ── Sélection des mouvements ────────────────────────────────────────────────

/**
 * Les mouvements réellement proposables.
 *
 * Filtre dur, dans cet ordre : le rôle demandé, le matériel (tout ce que le
 * mouvement suppose doit être coché), la technicité (on ne met pas un thruster
 * chargé dans une séance de débutant), les zones à épargner, puis les noms
 * explicitement écartés.
 */
export function availableMovements({ role, equipment, level, zones, avoid }) {
  const have = new Set(equipment);
  const maxSkill = (LEVEL_INDEX[level] ?? 1) + 1;
  const banned = new Set(zones);
  // Un genou ou une cheville douloureuse ne supporte pas l'impact, même sur un
  // mouvement qui ne la « vise » pas : c'est la réception qui fait mal.
  const noImpact = banned.has('genou') || banned.has('cheville');

  return MOVEMENTS.filter((m) => {
    if (!m.roles.includes(role)) return false;
    if (!m.needs.every((n) => have.has(n))) return false;
    if (m.skill > maxSkill) return false;
    if (m.zones.some((z) => banned.has(z))) return false;
    if (noImpact && m.impact === 'haut') return false;
    const name = normalize(m.name);
    if (avoid.some((term) => name.includes(term))) return false;
    return true;
  });
}

/** La chaîne dominante d'un jeu de mouvements, le thème l'emportant à égalité. */
function dominantGroup(movements, theme) {
  const counts = new Map();
  for (const m of movements) {
    for (const g of m.groups) counts.set(g, (counts.get(g) || 0) + 1);
  }
  let best = theme;
  let bestCount = counts.get(theme) || 0;
  for (const [g, n] of counts) {
    if (n > bestCount) { best = g; bestCount = n; }
  }
  return best;
}

/**
 * Choisit les mouvements d'un bloc autour d'un thème.
 *
 * Deux ou trois mouvements portent le thème, le reste complète sur d'autres
 * chaînes — et aucune de ces autres chaînes n'a le droit d'égaler le thème,
 * sinon le bloc n'a plus de dominante et deux blocs de suite finissent par se
 * ressembler.
 */
function pickMovements({ pool, theme, target, next, previousGroups, used, lead }) {
  const themeTake = target >= 5 ? 3 : 2;
  const picked = [];
  const counts = new Map();

  const add = (m) => {
    picked.push(m);
    for (const g of m.groups) counts.set(g, (counts.get(g) || 0) + 1);
  };

  // Un mouvement déjà vu dans la séance passe après les autres : le retrouver
  // à l'échauffement, dans le WOD et au retour au calme donne l'impression
  // d'un catalogue vide même quand il ne l'est pas.
  const frais = (list) => shuffle(next, list).sort((a, b) => (used.has(a.id) ? 1 : 0) - (used.has(b.id) ? 1 : 0));

  if (lead) add(lead);

  for (const m of frais(pool.filter((x) => x.groups.includes(theme) && !picked.includes(x)))) {
    if (picked.filter((x) => x.groups.includes(theme)).length >= themeTake) break;
    add(m);
  }

  const themeCount = counts.get(theme) || 0;
  const rest = frais(pool.filter((m) => !picked.includes(m)))
    // Un mouvement qui rejoue la chaîne du bloc précédent passe en dernier.
    .sort((a, b) => {
      const overlap = (m) => m.groups.filter((g) => previousGroups.has(g)).length;
      return overlap(a) - overlap(b);
    });

  // Une autre chaîne peut égaler le thème — à égalité c'est le thème qui
  // compte — mais jamais le dépasser, sinon le bloc n'a plus de dominante et
  // deux blocs de suite finissent par se ressembler.
  for (const m of rest) {
    if (picked.length >= target) break;
    if (m.groups.some((g) => g !== theme && (counts.get(g) || 0) + 1 > themeCount)) continue;
    add(m);
  }

  // Un bloc à un seul mouvement n'est pas un WOD : on relâche la contrainte de
  // dominante plutôt que de rendre une séance amputée.
  for (const m of rest) {
    if (picked.length >= 2) break;
    if (!picked.includes(m)) add(m);
  }

  return picked;
}

// ── Structure et formats ────────────────────────────────────────────────────

function pickStructure(durationMin, level, seed) {
  const variants = STRUCTURES[durationMin];
  if (variants.length === 1) return variants[0];
  if (level === 'debutant') return variants[0];
  if (level === 'avance') return variants[variants.length - 1];
  return variants[seed % variants.length];
}

/** Le nombre de WOD d'une séance, avant de la générer. */
export function wodCountFor(durationMin, level, seed) {
  const variants = STRUCTURES[durationMin];
  if (!variants) return 0;
  return pickStructure(durationMin, level, Number.isFinite(seed) ? seed : 1).wods;
}

function familyFor(type, index, next) {
  if (type === 'crossfit') return 'crossfit';
  if (type === 'hyrox') return 'hyrox';
  if (type === 'mixte') return index % 2 === 0 ? 'crossfit' : 'hyrox';
  return next() < 0.5 ? 'crossfit' : 'hyrox';
}

/**
 * Le format du bloc.
 *
 * Deux AMRAP à la suite ne sont pas une séance variée : le format du bloc
 * précédent sort du tirage tant qu'il reste autre chose à proposer.
 */
function formatFor({ family, goal, next, previousFormat }) {
  const tous = FORMATS_BY_GOAL[family][goal];
  const autres = tous.filter((f) => f !== previousFormat);
  return pick(next, autres.length ? autres : tous);
}

function targetCountFor(formatId, minutes) {
  if (formatId === 'chipper') return 5;
  if (formatId === 'hyrox-sim') return 4;
  if (formatId === 'emom') return 4;
  return minutes >= 14 ? 4 : 3;
}

function prescriptionFor(formatId, minutes, movements) {
  const count = movements.length;
  switch (formatId) {
    case 'amrap':
      return `AMRAP ${minutes} min — autant de tours que possible, dans l’ordre, sans repos imposé.`;
    case 'emom':
      return `EMOM ${minutes} min — une minute par mouvement, en rotation sur ${count}. `
        + `Le temps restant dans la minute est ton repos : ${Math.floor(minutes / count)} tours au total.`;
    case 'for-time': {
      const tours = Math.max(3, Math.round(minutes / 3.5));
      return `${tours} tours pour le temps — plafond ${minutes} min, on arrête au chrono même sans avoir fini.`;
    }
    case 'chipper':
      return `Chipper — la liste une seule fois, dans l’ordre, en fractionnant comme tu veux. Plafond ${minutes} min.`;
    case 'intervalles':
      return `${minutes} × (40″ d’effort / 20″ de repos) — un mouvement par série, en tournant sur ${count}.`;
    case 'hyrox-sim': {
      const tours = Math.max(2, Math.floor(minutes / 6));
      return `${tours} tours de ${count} stations enchaînées sans pause entre les stations. Plafond ${minutes} min.`;
    }
    case 'hyrox-compromis': {
      const tours = Math.max(3, Math.floor(minutes / 4));
      // Le bloc de course est le premier mouvement, et il est nommé : annoncer
      // « bloc de course » sans dire lequel ne se court pas.
      const stations = count - 1;
      return `${tours} × (${movements[0].name.toLowerCase()} + `
        + `${stations > 1 ? `les ${stations} stations qui suivent` : 'la station qui suit'}) — `
        + `la station se fait jambes déjà chargées. Plafond ${minutes} min.`;
    }
    default:
      return `${minutes} min de travail continu.`;
  }
}

// ── RPE ─────────────────────────────────────────────────────────────────────

const clampRpe = (v) => Math.min(10, Math.max(1, v));

function rpeFor(goal, level) {
  const [min, max] = RPE_BY_GOAL[goal];
  const shift = (LEVEL_INDEX[level] ?? 1) - 1;
  return describeRpe(clampRpe(min + shift), clampRpe(max + shift));
}

function describeRpe(min, max) {
  const word = [...RPE_WORDS].reverse().find(([seuil]) => max >= seuil)[1];
  return { min, max, label: `RPE ${min}–${max} / 10 — ${word}` };
}

// ── Génération ──────────────────────────────────────────────────────────────

const KIND_LABELS = {
  echauffement: 'Échauffement',
  wod: 'WOD',
  recuperation: 'Récupération',
  'retour-au-calme': 'Retour au calme',
};

/**
 * Génère une séance.
 *
 * @returns {{ok: true, session: object}
 *          |{ok: false, error: string, code: string, errors?: Record<string,string>}}
 */
export function generateWod(params) {
  const checked = validateWodParams(params);
  if (!checked.ok) {
    return {
      ok: false,
      code: 'params',
      error: 'Certains paramètres sont incomplets ou invalides.',
      errors: checked.errors,
    };
  }

  const p = checked.value;
  const next = rng(p.seed * 2654435761);
  const zones = parseConstraintZones(p.constraints);
  const avoid = parseAvoidTerms(p.constraints);
  const filtre = { equipment: p.equipment, level: p.level, zones, avoid };

  // Un mouvement purement de mobilité n'a rien à faire dans un WOD à RPE 8 :
  // il n'y entre que quand la mobilité est l'objectif de la séance.
  const poolWod = availableMovements({ role: 'wod', ...filtre })
    .filter((m) => p.goal === 'mobilite' || m.groups.some((g) => g !== 'mobilite'));
  const poolWarm = availableMovements({ role: 'echauffement', ...filtre });
  const poolCool = availableMovements({ role: 'retour-au-calme', ...filtre });

  if (poolWod.length < 2 || poolWarm.length < 2 || poolCool.length < 2) {
    return {
      ok: false,
      code: 'pool-vide',
      error: 'Avec ce matériel et ces contraintes, il ne reste pas assez de '
        + 'mouvements pour bâtir une séance sûre. Décoche une contrainte, ou '
        + 'ajoute du matériel.',
    };
  }

  const structure = pickStructure(p.durationMin, p.level, p.seed);
  const sessionRpe = rpeFor(p.goal, p.level);

  // L'ordre des thèmes est tiré une fois pour la séance : c'est lui qui garantit
  // que deux blocs consécutifs ne travaillent pas la même chaîne.
  const themes = shuffle(next, [...new Set(poolWod.flatMap((m) => m.groups))]);

  const blocks = [];
  const used = new Set();
  let wodIndex = 0;
  let previousTheme = null;
  let previousFormat = null;
  let previousGroups = new Set();

  for (const [kind, minutes] of structure.segments) {
    if (kind === 'wod') {
      wodIndex += 1;
      const theme = themes.find((t) => t !== previousTheme) ?? themes[0];
      // Le thème consommé repart en fin de liste : sur trois WOD, on ne
      // retombe pas immédiatement sur le premier.
      themes.splice(themes.indexOf(theme), 1);
      themes.push(theme);

      const family = familyFor(p.type, wodIndex - 1, next);

      // Un WOD CrossFit ne se court pas sur des stations HYROX, et l'inverse est
      // vrai aussi — mais on ne rétrécit la sélection que si elle reste viable.
      const prefer = poolWod.filter((m) => m.discipline === family || m.discipline === 'both');
      const pool = prefer.length >= 3 ? prefer : poolWod;

      // Le compromised running enchaîne un bloc de course et une station : sans
      // mouvement cardio sous la main, on ne promet pas une course qu'on serait
      // incapable de prescrire, on retombe sur la simulation de stations.
      const coureurs = pool.filter((m) => m.groups.includes('cardio'));
      let formatId = formatFor({ family, goal: p.goal, next, previousFormat });
      if (formatId === 'hyrox-compromis' && !coureurs.length) formatId = 'hyrox-sim';

      const lead = formatId === 'hyrox-compromis'
        ? (coureurs.find((m) => m.id === 'course') ?? coureurs.find((m) => m.id === 'navettes') ?? coureurs[0])
        : null;

      const target = targetCountFor(formatId, minutes);
      const movements = pickMovements({ pool, theme, target, next, previousGroups, used, lead });
      const dominant = dominantGroup(movements, theme);

      blocks.push({
        id: `wod-${wodIndex}`,
        kind,
        minutes,
        title: `WOD ${wodIndex} · ${FORMATS[formatId].label}`,
        family,
        formatId,
        formatLabel: FORMATS[formatId].label,
        prescription: prescriptionFor(formatId, minutes, movements),
        score: FORMATS[formatId].score,
        rpe: sessionRpe,
        dominantGroup: dominant,
        dominantLabel: GROUP_LABELS[dominant] ?? dominant,
        rest: restAdviceFor(formatId, p.level),
        movements: movements.map((m) => describeMovement(m, p.level, formatId)),
        safety: safetyFor(movements, formatId, p.level),
      });

      previousTheme = theme;
      previousFormat = formatId;
      previousGroups = new Set(movements.flatMap((m) => m.groups));
      for (const m of movements) used.add(m.id);
      continue;
    }

    if (kind === 'recuperation') {
      blocks.push({
        id: `recup-${blocks.length}`,
        kind,
        minutes,
        title: 'Récupération',
        prescription: `${minutes} min de marche ou de vélo très facile, respiration nasale. `
          + 'Ce n’est pas du temps perdu : c’est ce qui permet au bloc suivant d’être couru à la bonne intensité.',
        rpe: describeRpe(2, 3),
        movements: [],
        safety: ['Bois. Si le cœur ne redescend pas, allonge cette récupération sur le temps du bloc suivant.'],
      });
      continue;
    }

    const pool = kind === 'echauffement' ? poolWarm : poolCool;
    const count = Math.min(minutes >= 7 ? 4 : 3, pool.length);
    const movements = shuffle(next, pool)
      // Ce qui a déjà servi passe en dernier : le retour au calme ne rejoue pas
      // le WOD quand il reste autre chose à proposer.
      .sort((a, b) => (used.has(a.id) ? 1 : 0) - (used.has(b.id) ? 1 : 0))
      .slice(0, count);
    for (const m of movements) used.add(m.id);

    blocks.push({
      id: kind,
      kind,
      minutes,
      title: KIND_LABELS[kind],
      prescription: kind === 'echauffement'
        ? `${minutes} min — 2 tours de la liste, sans chercher l’intensité. `
          + 'Le dernier tour se fait à l’allure du premier WOD.'
        : `${minutes} min — un passage lent sur la liste, respiration longue.`,
      rpe: kind === 'echauffement' ? describeRpe(3, 4) : describeRpe(2, 3),
      movements: movements.map((m) => describeMovement(m, p.level, kind)),
      safety: kind === 'echauffement'
        ? ['Un échauffement écourté se paie sur le premier WOD : c’est là que les tendons lâchent.']
        : ['Ne saute pas cette partie : c’est elle qui décide de l’état des jambes demain.'],
    });
  }

  const equipmentIds = [...new Set(
    blocks.flatMap((b) => b.movements).flatMap((m) => MOVEMENT_BY_ID.get(m.id).needs),
  )].sort();

  const session = {
    name: `${pick(next, NAMES)}`,
    typeId: p.type,
    typeLabel: label(SESSION_TYPES, p.type),
    levelId: p.level,
    levelLabel: label(LEVELS, p.level),
    goalId: p.goal,
    goalLabel: label(GOALS, p.goal),
    durationMin: p.durationMin,
    totalMin: blocks.reduce((a, b) => a + b.minutes, 0),
    rpe: sessionRpe,
    equipmentIds,
    equipment: equipmentIds.map((id) => ({ id, label: equipmentLabel(id) })),
    constraints: { zones, notes: constraintNotes(p.constraints) },
    blocks,
    durationCheck: durationCheckOf(blocks, p.durationMin),
    timeline: timelineOf(blocks),
    safety: sessionSafety(p, zones),
    seed: p.seed,
  };

  // Ceinture et bretelles : ce que rend le générateur est relu avant de sortir,
  // pour qu'un bug de composition ne devienne jamais une séance affichée.
  const verdict = validateWodSession(session, p.durationMin);
  if (!verdict.ok) {
    return {
      ok: false,
      code: 'sortie-invalide',
      error: `La séance produite n’est pas cohérente (${verdict.errors[0]}). Réessaie.`,
    };
  }

  return { ok: true, session };
}

function describeMovement(m, level, formatId) {
  const charge = m.charge?.[LEVEL_INDEX[level] ?? 1];
  return {
    id: m.id,
    name: m.name,
    volume: volumeFor(m, level, formatId),
    charge: charge ?? '—',
    easier: m.easier,
    harder: m.harder,
    groups: m.groups.map((g) => GROUP_LABELS[g] ?? g),
    note: m.note ?? '',
    // L'exercice de la bibliothèque PPG qui illustre le même geste, quand il y
    // en a un. Le visuel lui-même n'est pas recopié ici : l'écran va le chercher
    // dans la bibliothèque chargée, et s'en passe quand elle ne l'est pas.
    libraryId: m.libraryId ?? null,
  };
}

function restAdviceFor(formatId, level) {
  if (formatId === 'emom') return 'Le repos est ce qui reste de la minute — vise 15 à 20 s.';
  if (formatId === 'intervalles') return '20 s entre les séries, debout, sans t’asseoir.';
  if (formatId === 'amrap') return 'Pas de repos imposé : fractionne les séries avant d’être obligé de t’arrêter.';
  if (level === 'debutant') return 'Repos libre dès que l’exécution se dégrade — la technique passe avant le chrono.';
  return 'Repos libre, mais chronométré : note-le, il fait partie du résultat.';
}

function safetyFor(movements, formatId, level) {
  const out = [];
  if (level === 'debutant') {
    out.push('Première séance sur ce format : commence une intensité en dessous de ce que tu penses pouvoir tenir.');
  }
  if (formatId === 'chipper' || formatId === 'for-time') {
    out.push('Le chrono pousse à mal faire : fractionne les séries avant l’échec, jamais après.');
  }
  if (formatId === 'hyrox-sim' || formatId === 'hyrox-compromis') {
    out.push('Les transitions comptent : marche entre les stations plutôt que de partir en courant mal placé.');
  }
  for (const m of movements) {
    if (m.note) out.push(`${m.name} — ${m.note}`);
  }
  if (!out.length) {
    out.push('Arrête la série dès que la technique se dégrade : une répétition sale ne compte pas.');
  }
  return out;
}

function sessionSafety(p, zones) {
  const out = [
    'Le volume et les charges sont des repères, pas une prescription médicale : ajuste-les à ce que tu sens.',
  ];
  if (zones.length) {
    const noms = zones.map((z) => BODY_ZONES.find((b) => b.id === z)?.label ?? z);
    out.push(`Zones épargnées dans cette séance : ${noms.join(', ').toLowerCase()}. `
      + 'Une douleur qui apparaît malgré ça met fin à la séance.');
  }
  if (p.level === 'debutant') {
    out.push('En débutant, la première séance sert à trouver le bon réglage : note ce que tu as fait, tu ajusteras la prochaine.');
  }
  return out;
}

/** « 6 min d'échauffement + 14 min WOD 1 + … = 40 min ». */
function durationCheckOf(blocks, total) {
  let wod = 0;
  const parts = blocks.map((b) => {
    if (b.kind === 'wod') { wod += 1; return `${b.minutes} min WOD ${wod}`; }
    if (b.kind === 'echauffement') return `${b.minutes} min d’échauffement`;
    if (b.kind === 'recuperation') return `${b.minutes} min de récupération`;
    return `${b.minutes} min de retour au calme`;
  });
  return `${parts.join(' + ')} = ${total} min`;
}

function timelineOf(blocks) {
  let start = 0;
  return blocks.map((b) => {
    const from = start;
    start += b.minutes;
    return { from, to: start, minutes: b.minutes, title: b.title, kind: b.kind };
  });
}

// ── Validation de la sortie ─────────────────────────────────────────────────

const KINDS = new Set(['echauffement', 'wod', 'recuperation', 'retour-au-calme']);

/**
 * Relit une séance avant de l'afficher.
 *
 * Même utilité qu'un schéma : une séance qui ne passe pas ici n'est pas affichée
 * à moitié, elle n'est pas affichée du tout. C'est aussi le point d'entrée par
 * lequel une réponse venue d'ailleurs (une IA, un jour) devrait passer.
 *
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateWodSession(session, expectedMin) {
  const errors = [];
  const fail = (m) => errors.push(m);

  if (!session || typeof session !== 'object') {
    return { ok: false, errors: ['Séance absente ou illisible.'] };
  }
  if (!Array.isArray(session.blocks) || session.blocks.length === 0) {
    return { ok: false, errors: ['Séance sans aucun bloc.'] };
  }

  const total = session.blocks.reduce((a, b) => a + (Number(b.minutes) || 0), 0);
  if (Number.isFinite(expectedMin) && total !== expectedMin) {
    fail(`Durée totale : ${total} min pour ${expectedMin} min demandées.`);
  }
  if (session.totalMin !== undefined && session.totalMin !== total) {
    fail(`Durée annoncée (${session.totalMin} min) différente de la somme des blocs (${total} min).`);
  }

  if (typeof session.durationCheck === 'string') {
    const [left, right] = session.durationCheck.split('=');
    const parts = (left ?? '').split('+').map((s) => Number(s.trim().match(/^\d+/)?.[0]));
    if (parts.some((n) => !Number.isFinite(n)) || parts.reduce((a, b) => a + b, 0) !== total) {
      fail('La vérification de durée affichée ne correspond pas aux blocs.');
    }
    if (Number(String(right).replace(/[^\d]/g, '')) !== total) {
      fail('Le total affiché dans la vérification de durée est faux.');
    }
  } else {
    fail('Vérification de durée manquante.');
  }

  if (session.blocks[0].kind !== 'echauffement') fail('La séance ne commence pas par un échauffement.');
  if (session.blocks.at(-1).kind !== 'retour-au-calme') fail('La séance ne finit pas par un retour au calme.');
  if (!session.blocks.some((b) => b.kind === 'wod')) fail('Séance sans aucun WOD.');

  session.blocks.forEach((b, i) => {
    const où = `bloc ${i + 1}`;
    if (!KINDS.has(b.kind)) fail(`${où} : type inconnu (${b.kind}).`);
    if (!(Number(b.minutes) > 0)) fail(`${où} : durée nulle ou absente.`);
    if (!b.title) fail(`${où} : titre manquant.`);
    if (!b.rpe || b.rpe.min < 1 || b.rpe.max > 10 || b.rpe.min > b.rpe.max) {
      fail(`${où} : intensité cible incohérente.`);
    }
    if (b.kind === 'wod') {
      if (!b.formatId || !FORMATS[b.formatId]) fail(`${où} : format de WOD inconnu.`);
      if (!b.score) fail(`${où} : rien à noter à la fin du WOD.`);
      if (!Array.isArray(b.movements) || b.movements.length < 2) fail(`${où} : moins de deux mouvements.`);
      if (!Array.isArray(b.safety) || !b.safety.length) fail(`${où} : aucune consigne de sécurité.`);
    }
    const ids = (b.movements || []).map((m) => m.id);
    if (new Set(ids).size !== ids.length) fail(`${où} : un mouvement est répété.`);
    for (const m of b.movements || []) {
      if (!MOVEMENT_BY_ID.has(m.id)) fail(`${où} : mouvement inconnu (${m.id}).`);
      if (!m.volume) fail(`${où} : ${m.name} sans volume.`);
      if (!m.easier || !m.harder) fail(`${où} : ${m.name} sans variante.`);
    }
  });

  if (Array.isArray(session.equipmentIds)) {
    const utilise = new Set(
      session.blocks.flatMap((b) => b.movements || [])
        .flatMap((m) => MOVEMENT_BY_ID.get(m.id)?.needs ?? []),
    );
    for (const id of utilise) {
      if (!session.equipmentIds.includes(id)) fail(`Matériel utilisé mais non annoncé : ${id}.`);
    }
  }

  return { ok: errors.length === 0, errors };
}
