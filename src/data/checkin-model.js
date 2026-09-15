// Le questionnaire quotidien : ce qu'on demande, et ce qu'on en garde.
//
// Une réponse est une donnée, pas une phrase. « Courbatures légères aux
// mollets » est ce qui s'affiche ; ce qui est stocké est `{level:'light',
// areas:['calves']}`. Les libellés vivent ici à côté des identifiants pour que
// la traduction ne soit jamais la valeur métier — un jour où l'on écrira
// « légères » autrement, l'historique restera lisible.
//
// Tout est pur : `normalizeAnswers` et `validateAnswers` ne modifient jamais ce
// qu'on leur passe, et `createEntry` / `reviseEntry` / `decideEntry` renvoient
// des objets neufs. C'est ce qui permet au moteur de décision, à l'interface et
// au stockage de partager la même structure sans se marcher dessus.

export const CHECKIN_VERSION = 1;

/**
 * Les durées proposées.
 *
 * `minutes: 0` est l'indisponibilité — pas « zéro minute de séance », mais
 * « pas aujourd'hui ». Le moteur la traite à part : elle propose un
 * déplacement, jamais une séance de zéro minute.
 */
export const TIME_OPTIONS = Object.freeze([
  { id: 'unavailable', minutes: 0, label: 'Indisponible aujourd’hui', short: 'indisponible' },
  { id: 'm20', minutes: 20, label: '20 min', short: '20 min' },
  { id: 'm30', minutes: 30, label: '30 min', short: '30 min' },
  { id: 'm40', minutes: 40, label: '40 min', short: '40 min' },
  { id: 'm50', minutes: 50, label: '50 min', short: '50 min' },
  { id: 'm60', minutes: 60, label: '60 min', short: '60 min' },
  { id: 'm90', minutes: 90, label: '1 h 30', short: '1 h 30' },
  { id: 'm120', minutes: 120, label: '2 h', short: '2 h' },
  { id: 'm180', minutes: 180, label: '3 h ou plus', short: '3 h ou plus' },
]);

export const MAX_AVAILABLE_MINUTES = 600;
export const MAX_SLEEP_MINUTES = 1080;
export const MAX_COMMENT_LENGTH = 500;

export const FATIGUE_LABELS = Object.freeze({
  1: 'très frais', 2: 'plutôt frais', 3: 'moyen', 4: 'fatigué', 5: 'très fatigué',
});

/**
 * La même fatigue, dite autrement.
 *
 * Le questionnaire demande « comment es-tu ? » et répond « très frais » ; la
 * synthèse écrit « Fatigue : moyenne ». Deux registres pour une seule échelle,
 * parce qu'un libellé qui s'accorde avec la question ne s'accorde plus avec le
 * nom qui le précède.
 */
export const FATIGUE_SUMMARY_LABELS = Object.freeze({
  1: 'très faible', 2: 'faible', 3: 'moyenne', 4: 'élevée', 5: 'très élevée',
});

export const SLEEP_LABELS = Object.freeze({
  1: 'très mauvaise', 2: 'mauvaise', 3: 'correcte', 4: 'bonne', 5: 'excellente',
});

export const MOTIVATION_LABELS = Object.freeze({
  1: 'aucune envie', 2: 'faible', 3: 'normale', 4: 'bonne', 5: 'très motivé',
});

export const STRESS_LABELS = Object.freeze({
  1: 'très calme', 2: 'calme', 3: 'moyen', 4: 'tendu', 5: 'très tendu',
});

export const LEGS_LABELS = Object.freeze({
  1: 'lourdes', 2: 'un peu lourdes', 3: 'normales', 4: 'bonnes', 5: 'excellentes',
});

export const SORENESS_LEVELS = Object.freeze([
  { id: 'none', label: 'Aucune', short: 'aucune' },
  { id: 'light', label: 'Légères', short: 'légères' },
  { id: 'moderate', label: 'Modérées', short: 'modérées' },
  { id: 'heavy', label: 'Importantes', short: 'importantes' },
]);

/**
 * Les zones du corps.
 *
 * `targets` fait le pont avec la bibliothèque PPG, dont chaque exercice porte
 * un `target` (quads, calves, spine…). C'est ce pont qui permet de dire
 * « tes mollets sont courbaturés, donc pas de mollets excentriques » sans que
 * le moteur ait à connaître la bibliothèque.
 */
export const BODY_AREAS = Object.freeze([
  { id: 'quadriceps', label: 'Quadriceps', spoken: 'aux quadriceps', targets: ['quads'] },
  { id: 'hamstrings', label: 'Ischio-jambiers', spoken: 'aux ischio-jambiers', targets: ['hamstrings'] },
  { id: 'calves', label: 'Mollets', spoken: 'aux mollets', targets: ['calves'] },
  { id: 'glutes', label: 'Fessiers', spoken: 'aux fessiers', targets: ['glutes'] },
  { id: 'ankles-feet', label: 'Chevilles ou pieds', spoken: 'aux chevilles', targets: ['calves'] },
  { id: 'knees', label: 'Genoux', spoken: 'aux genoux', targets: ['quads'] },
  { id: 'hips', label: 'Hanches', spoken: 'aux hanches', targets: ['glutes', 'abductors'] },
  { id: 'back', label: 'Dos', spoken: 'au dos', targets: ['spine'] },
  { id: 'shoulders', label: 'Épaules', spoken: 'aux épaules', targets: [] },
  { id: 'arms', label: 'Bras', spoken: 'aux bras', targets: [] },
  { id: 'other', label: 'Autre', spoken: '', targets: [] },
]);

export const PAIN_MOMENTS = Object.freeze([
  { id: 'rest', label: 'Au repos', spoken: 'au repos' },
  { id: 'movement', label: 'Pendant un mouvement', spoken: 'pendant un mouvement' },
  { id: 'running', label: 'En courant', spoken: 'en courant' },
]);

export const DESIRES = Object.freeze([
  { id: 'run', label: 'Courir' },
  { id: 'ppg', label: 'Faire de la PPG' },
  { id: 'recover', label: 'Récupérer' },
]);

const AREA_IDS = new Set(BODY_AREAS.map((a) => a.id));
const LEVEL_IDS = new Set(SORENESS_LEVELS.map((l) => l.id));
const MOMENT_IDS = new Set(PAIN_MOMENTS.map((m) => m.id));
const DESIRE_IDS = new Set(DESIRES.map((d) => d.id));

export const areaLabel = (id) => BODY_AREAS.find((a) => a.id === id)?.label ?? id;
export const areaSpoken = (id) => BODY_AREAS.find((a) => a.id === id)?.spoken ?? areaLabel(id);
export const sorenessLabel = (id) => SORENESS_LEVELS.find((l) => l.id === id)?.short ?? id;
export const momentLabel = (id) => PAIN_MOMENTS.find((m) => m.id === id)?.spoken ?? id;

/** Les cibles de bibliothèque PPG couvertes par une liste de zones. */
export function areaTargets(areas = []) {
  return [...new Set(areas.flatMap((id) => BODY_AREAS.find((a) => a.id === id)?.targets || []))];
}

/** Un questionnaire vierge — la forme complète, avec des trous explicites. */
export function emptyAnswers() {
  return {
    availableMinutes: null,
    fatigue: null,
    sleepQuality: null,
    sleepMinutes: null,
    soreness: { level: null, areas: [] },
    motivation: null,
    pain: {
      present: false, area: null, intensity: null, kind: '',
      moments: [], triggers: [], limiting: false,
    },
    stress: null,
    legs: null,
    desire: null,
    availableEquipment: null,
    outdoor: null,
    comment: '',
  };
}

const isInt = (v) => Number.isInteger(v);
const scale = (v) => (isInt(v) && v >= 1 && v <= 5 ? v : null);
const strList = (v) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);

/**
 * Remet des réponses en forme sans jamais rien inventer.
 *
 * Deux règles font le gros du travail et évitent des incohérences que le moteur
 * aurait dû traiter partout : sans courbature il n'y a pas de zone, et sans
 * douleur il n'y a pas de détail de douleur. Une case cochée puis décochée ne
 * laisse donc pas de trace qui ferait basculer une recommandation.
 */
export function normalizeAnswers(raw) {
  const a = raw && typeof raw === 'object' ? raw : {};
  const empty = emptyAnswers();

  const level = LEVEL_IDS.has(a.soreness?.level) ? a.soreness.level : null;
  const areas = level && level !== 'none'
    ? [...new Set(strList(a.soreness?.areas).filter((id) => AREA_IDS.has(id)))]
    : [];

  const painPresent = a.pain?.present === true;
  const pain = painPresent
    ? {
      present: true,
      area: AREA_IDS.has(a.pain?.area) ? a.pain.area : null,
      intensity: isInt(a.pain?.intensity) && a.pain.intensity >= 1 && a.pain.intensity <= 10
        ? a.pain.intensity : null,
      kind: String(a.pain?.kind ?? '').slice(0, MAX_COMMENT_LENGTH),
      moments: [...new Set(strList(a.pain?.moments).filter((id) => MOMENT_IDS.has(id)))],
      triggers: [...new Set(strList(a.pain?.triggers))],
      limiting: a.pain?.limiting === true,
    }
    : empty.pain;

  const minutes = a.availableMinutes;

  return {
    availableMinutes: isInt(minutes) && minutes >= 0 && minutes <= MAX_AVAILABLE_MINUTES
      ? minutes : (minutes == null || minutes === '' ? null : minutes),
    fatigue: scale(a.fatigue) ?? (a.fatigue == null ? null : a.fatigue),
    sleepQuality: scale(a.sleepQuality) ?? (a.sleepQuality == null ? null : a.sleepQuality),
    sleepMinutes: a.sleepMinutes == null || a.sleepMinutes === '' ? null : a.sleepMinutes,
    soreness: { level, areas },
    motivation: scale(a.motivation) ?? (a.motivation == null ? null : a.motivation),
    pain,
    stress: a.stress == null || a.stress === '' ? null : a.stress,
    legs: a.legs == null || a.legs === '' ? null : a.legs,
    desire: DESIRE_IDS.has(a.desire) ? a.desire : (a.desire == null || a.desire === '' ? null : a.desire),
    availableEquipment: Array.isArray(a.availableEquipment)
      ? [...new Set(strList(a.availableEquipment))]
      : (a.availableEquipment == null ? null : a.availableEquipment),
    outdoor: typeof a.outdoor === 'boolean' ? a.outdoor : null,
    comment: String(a.comment ?? ''),
  };
}

/**
 * Valide les réponses.
 *
 * Les messages sont ceux qui s'affichent : ils disent quoi faire, pas ce qui
 * est faux.
 *
 * @returns {{ok:true, value:object} | {ok:false, errors:Record<string,string>, value:object}}
 */
export function validateAnswers(raw) {
  const value = normalizeAnswers(raw);
  const errors = {};

  const minutes = value.availableMinutes;
  if (minutes == null) errors.availableMinutes = 'Indique le temps dont tu disposes aujourd’hui.';
  else if (!isInt(minutes) || minutes < 0 || minutes > MAX_AVAILABLE_MINUTES) {
    errors.availableMinutes = `Une durée en minutes, entre 0 et ${MAX_AVAILABLE_MINUTES}.`;
  }

  const scales = [
    ['fatigue', 'Note ta fatigue de 1 à 5.'],
    ['sleepQuality', 'Note la qualité de ta nuit de 1 à 5.'],
    ['motivation', 'Note ta motivation de 1 à 5.'],
  ];
  for (const [field, message] of scales) {
    if (value[field] == null || scale(value[field]) == null) errors[field] = message;
  }

  if (value.sleepMinutes != null) {
    const s = value.sleepMinutes;
    if (!isInt(s) || s < 0 || s > MAX_SLEEP_MINUTES) {
      errors.sleepMinutes = 'Une durée de sommeil en minutes, jusqu’à 18 heures.';
    }
  }

  if (!value.soreness.level) errors['soreness.level'] = 'Indique ton niveau de courbatures.';
  const rawAreas = strList(raw?.soreness?.areas);
  if (value.soreness.level && value.soreness.level !== 'none'
    && rawAreas.some((id) => !AREA_IDS.has(id))) {
    errors['soreness.areas'] = 'Choisis des zones dans la liste.';
  }

  if (value.pain.present) {
    if (!value.pain.area) errors['pain.area'] = 'Indique la zone concernée.';
    if (value.pain.intensity == null) errors['pain.intensity'] = 'Note l’intensité de 1 à 10.';
    const rawMoments = strList(raw?.pain?.moments);
    if (rawMoments.some((id) => !MOMENT_IDS.has(id))) {
      errors['pain.moments'] = 'Choisis quand la douleur apparaît.';
    }
  }

  for (const [field, message] of [['stress', 'Le stress se note de 1 à 5.'], ['legs', 'Les jambes se notent de 1 à 5.']]) {
    if (value[field] != null && scale(value[field]) == null) errors[field] = message;
  }
  if (value.desire != null && !DESIRE_IDS.has(value.desire)) {
    errors.desire = 'Choisis une envie dans la liste.';
  }
  if (value.availableEquipment != null && !Array.isArray(value.availableEquipment)) {
    errors.availableEquipment = 'Le matériel est une liste.';
  }
  if (value.comment.length > MAX_COMMENT_LENGTH) {
    errors.comment = `Le commentaire tient en ${MAX_COMMENT_LENGTH} caractères.`;
  }

  return Object.keys(errors).length ? { ok: false, errors, value } : { ok: true, value };
}

/** Les six questions obligatoires sont-elles répondues ? */
export function isComplete(answers) {
  return validateAnswers(answers).ok;
}

const NOW = () => new Date().toISOString();

/**
 * Une entrée d'historique.
 *
 * Elle embarque le contexte qui a servi à décider — pas seulement la
 * recommandation. Une fraîcheur recalculée demain ne doit pas réécrire ce qui a
 * été conseillé ce matin : sans le contexte figé, la trace serait invérifiable.
 */
export function createEntry({ date, answers, context, recommendation, now = NOW() }) {
  return {
    version: CHECKIN_VERSION,
    date,
    createdAt: now,
    updatedAt: now,
    answers: structuredClone(normalizeAnswers(answers)),
    context: structuredClone(context ?? {}),
    recommendation: structuredClone(recommendation ?? null),
    userDecision: null,
    completedSessionId: null,
    revisions: [],
  };
}

/**
 * Modifier ses réponses.
 *
 * La recommandation précédente descend dans `revisions` telle quelle, avec le
 * contexte qui l'avait produite. On ne la corrige pas, on l'archive.
 */
export function reviseEntry(entry, { answers, context, recommendation, now = NOW() }) {
  return {
    ...structuredClone(entry),
    updatedAt: now,
    answers: structuredClone(normalizeAnswers(answers)),
    context: structuredClone(context ?? {}),
    recommendation: structuredClone(recommendation ?? null),
    revisions: [
      ...(entry.revisions || []).map((r) => structuredClone(r)),
      {
        updatedAt: entry.updatedAt,
        answers: structuredClone(entry.answers),
        context: structuredClone(entry.context),
        recommendation: structuredClone(entry.recommendation),
      },
    ],
  };
}

/** Ce que l'utilisateur a décidé, horodaté, sans toucher au reste. */
export function decideEntry(entry, decision, now = NOW()) {
  return {
    ...structuredClone(entry),
    userDecision: { ...structuredClone(decision), at: now },
  };
}

/** La séance finalement réalisée, quand elle devient connue. */
export function attachCompletedSession(entry, sessionId) {
  return { ...structuredClone(entry), completedSessionId: sessionId ?? null };
}
