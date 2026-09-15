// L'adaptation d'une séance à la journée qu'on a réellement.
//
// Rien ici ne modifie quoi que ce soit : on construit une *proposition*. Elle
// dit ce qu'elle retire, ce qu'elle garde et ce qu'elle ajoute, et elle emballe
// le tout dans un jeu de modifications au format que `modifySession` sait déjà
// valider. C'est l'utilisateur qui transforme la proposition en décision, et
// c'est le planning existant qui l'applique — ce fichier n'écrit nulle part.
//
// L'ordre dans lequel on rogne n'est pas indifférent. On enlève d'abord ce qui
// est contre-indiqué (douleur, pliométrie, zone courbaturée), ensuite ce qui
// est accessoire (mobilité de fermeture, gainage), et jamais la mise en route :
// une séance sans échauffement n'est pas une séance raccourcie, c'est une
// séance dangereuse.

import { areaTargets, areaLabel, areaSpoken } from './checkin-model.js';
import { STATUS } from './checkin-engine.js';

/** Minutes approximatives par exercice — même barème que la composition PPG. */
const MINUTES = { FORCE: 6, EXCENTRIQUE: 6, PLIOMÉTRIE: 5, GAINAGE: 4, MOBILITÉ: 3 };

/** Ce qu'on retire en dernier : le plus utile d'abord. */
const PRIORITY = { MOBILITÉ: 0, FORCE: 1, GAINAGE: 2, EXCENTRIQUE: 3, PLIOMÉTRIE: 4 };

const minutesOf = (exercise) => MINUTES[exercise.cat] ?? 4;
const normalize = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

/**
 * Les exercices de repli.
 *
 * Ils servent deux fois : quand l'adaptation a tout emporté et qu'il faut bien
 * proposer quelque chose, et quand elle a retiré du travail sur une zone —
 * mobiliser un mollet courbaturé est justement ce qu'il faut faire, alors que
 * le charger ne l'est pas.
 */
const FALLBACK = [
  {
    id: 'checkin-mobilite-chevilles',
    cat: 'MOBILITÉ',
    target: 'calves',
    name: 'Mobilité des chevilles au mur',
    sets: '2 × 12 / côté',
    tempo: 'lent',
    needs: ['poids-du-corps'],
  },
  {
    id: 'checkin-mobilite-hanches',
    cat: 'MOBILITÉ',
    target: 'glutes',
    name: 'Mobilité des hanches au sol',
    sets: '2 × 10 / côté',
    tempo: 'lent',
    needs: ['poids-du-corps'],
  },
  {
    id: 'checkin-respiration',
    cat: 'MOBILITÉ',
    target: 'spine',
    name: 'Respiration diaphragmatique',
    sets: '3′ allongé',
    tempo: 'lent',
    needs: ['poids-du-corps'],
  },
];

/**
 * Cet exercice est-il compatible avec ce que la journée déclare ?
 *
 * La distinction qui compte : une zone *douloureuse* n'est touchée par rien,
 * une zone *courbaturée* n'est pas chargée mais peut être mobilisée. Confondre
 * les deux ferait retirer la mobilité des chevilles le jour où elle est le plus
 * utile.
 */
function incompatible(exercise, { painTargets = [], soreTargets = [], forbidden = [], removePlyo = false }) {
  if (removePlyo && exercise.cat === 'PLIOMÉTRIE') return 'pliométrie';
  if (painTargets.includes(exercise.target)) return 'zone douloureuse';
  if (soreTargets.includes(exercise.target) && exercise.cat !== 'MOBILITÉ') return 'zone courbaturée';
  const name = normalize(exercise.name);
  if (forbidden.some((term) => term.length >= 3 && name.includes(term))) return 'mouvement douloureux';
  return null;
}

/** Le premier repli utilisable, de préférence sur une zone concernée. */
function complementFor(limits, alreadyThere) {
  const usable = FALLBACK
    .filter((exercise) => !incompatible(exercise, limits))
    .filter((exercise) => !alreadyThere.some((e) => e.id === exercise.id || e.name === exercise.name));
  const zones = [...limits.soreTargets, ...limits.painTargets];
  return usable.find((exercise) => zones.includes(exercise.target)) ?? usable[0] ?? null;
}

/**
 * Compose la séance adaptée à partir de celle qui était prévue.
 *
 * @returns {{exercises:Array, removed:string[], added:string[], notes:string[]}}
 */
function reworkExercises(session, { limits, targetMinutes, plannedMinutes }) {
  const original = session.ppgExercises || [];
  const removed = [];
  const notes = [];
  let contraindicated = false;

  let kept = original.filter((exercise) => {
    const why = incompatible(exercise, limits);
    if (!why) return true;
    contraindicated = true;
    removed.push(exercise.name);
    if (why === 'pliométrie' && !notes.includes('Pliométrie retirée : les appuis ne sont pas disponibles aujourd’hui.')) {
      notes.push('Pliométrie retirée : les appuis ne sont pas disponibles aujourd’hui.');
    }
    return false;
  });

  // Rognage par le temps.
  //
  // Le barème par exercice est une approximation — six exercices « à 6 minutes »
  // ne font pas nécessairement les 60 minutes annoncées par la séance. Comparer
  // le budget réel à cette somme approximative ne retirerait rien d'une séance
  // sous-estimée. On rogne donc *en proportion* : passer de 60 à 40 minutes
  // enlève un tiers du contenu, quelle que soit l'unité dans laquelle il est
  // compté. On garde toujours au moins une mise en route et un exercice de
  // travail : en dessous, ce n'est plus une séance.
  if (targetMinutes) {
    const estimated = original.reduce((sum, e) => sum + minutesOf(e), 0);
    const scale = plannedMinutes > 0 && estimated > 0 ? estimated / plannedMinutes : 1;
    const budget = targetMinutes * scale;
    let total = kept.reduce((sum, e) => sum + minutesOf(e), 0);
    while (total > budget && kept.length > 2) {
      // Le moins prioritaire, et à priorité égale le dernier de la liste : on
      // rogne par la fin, comme la composition d'origine.
      let index = 0;
      let worst = -1;
      kept.forEach((exercise, i) => {
        const rank = PRIORITY[exercise.cat] ?? 2;
        if (rank >= worst) { worst = rank; index = i; }
      });
      // La toute première mobilité est l'échauffement : elle ne part pas.
      if (index === kept.findIndex((e) => e.cat === 'MOBILITÉ') && kept.filter((e) => e.cat === 'MOBILITÉ').length === 1) {
        const other = kept.findIndex((e, i) => i !== index);
        if (other < 0) break;
        index = other;
      }
      const [gone] = kept.splice(index, 1);
      removed.push(gone.name);
      total -= minutesOf(gone);
    }
  }

  const added = [];

  // Ce qui a été retiré pour une contre-indication laisse un trou : on le
  // comble par de la mobilité sur la zone concernée. C'est le seul ajout qui
  // reste vrai quel que soit le motif — on ne remplace jamais un exercice de
  // force par un autre exercice de force le jour où le corps dit non.
  if (contraindicated) {
    const complement = complementFor(limits, kept);
    if (complement) {
      kept = [...kept, complement];
      added.push(complement.name);
    }
  }

  // Il ne reste rien de faisable : on ne renvoie pas une séance vide.
  while (kept.length < 2) {
    const complement = complementFor(limits, kept);
    if (!complement) break;
    kept = [...kept, complement];
    added.push(complement.name);
  }
  if (added.length && !kept.some((e) => original.some((o) => o.id === e.id))) {
    notes.push('Le travail retiré est remplacé par de la mobilité.');
  }

  // Une séance sans mise en route n'est pas une séance raccourcie.
  if (!kept.some((e) => e.cat === 'MOBILITÉ')) {
    const opener = complementFor(limits, kept);
    if (opener) {
      kept = [opener, ...kept];
      added.push(opener.name);
    }
  }

  return { exercises: kept, removed, added, notes };
}

const stepsFrom = (exercises) => exercises.map((exercise, index) => ({
  i: String(index + 1).padStart(2, '0'),
  label: exercise.name,
  detail: [exercise.sets, exercise.tempo ? `tempo ${exercise.tempo}` : null].filter(Boolean).join(' · '),
  exerciseId: exercise.id,
}));

const fmt = (minutes) => {
  // Une séance d'une heure se dit « 60 min » : c'est la durée telle qu'elle est
  // annoncée partout ailleurs dans l'app. L'heure ne devient une unité utile
  // qu'au-delà.
  if (minutes <= 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${String(rest).padStart(2, '0')}` : `${minutes / 60} h`;
};

/** « 60 min · PPG jambes et pliométrie » */
const labelFor = (minutes, description) => `${fmt(minutes)} · ${description}`;

/** Ce que la séance prévue fait, en trois mots. */
function describe(session) {
  if (session.type !== 'PPG') return session.title;
  const roles = [...new Set((session.ppgExercises || []).map((e) => e.cat.toLowerCase()))];
  return roles.length ? roles.join(', ') : session.title;
}

/**
 * La proposition d'adaptation, ou `null` s'il n'y a rien à proposer.
 *
 * @param {object} session         la séance planifiée
 * @param {object} o
 * @param {object} o.answers       réponses normalisées du jour
 * @param {object} o.recommendation sortie du moteur
 * @param {object} o.context       contexte du jour
 */
export function adaptSession(session, { answers, recommendation, context = {} }) {
  if (!session || !recommendation) return null;
  // Le réel ne se réécrit pas.
  if (session.done || session.status === 'RÉALISÉE' || session.activityId) return null;
  if ([STATUS.KEEP, STATUS.NO_SESSION].includes(recommendation.status)) return null;

  const locked = Boolean(session.locked || ['VALIDÉE'].includes(session.status) || context.sessionLocked);
  const blockedReason = locked
    ? 'Cette séance a été validée : elle reste verrouillée tant que tu n’as pas repris la main dessus.'
    : null;

  const { effects } = recommendation;
  const plannedMinutes = context.plannedDurationMinutes
    ?? (session.durationSec ? Math.round(session.durationSec / 60) : null);

  // Un avis professionnel n'est pas une adaptation. On montre la séance telle
  // qu'elle est prévue, et on s'arrête là : proposer une version « allégée » de
  // ce qu'on vient de déconseiller serait se contredire dans le même écran.
  if (recommendation.status === STATUS.MEDICAL) {
    return {
      mode: 'medical',
      status: recommendation.status,
      applicable: false,
      blockedReason: 'Tant que la douleur n’a pas été évaluée, l’application ne propose aucune version modifiée de la séance.',
      before: {
        durationMin: plannedMinutes,
        label: plannedMinutes ? labelFor(plannedMinutes, describe(session)) : session.title,
        exercises: session.ppgExercises || [],
      },
      after: null,
      removed: [], kept: [], added: [],
      notes: ['Prends l’avis d’un professionnel de santé avant de reprendre.'],
      changes: null,
    };
  }

  // Un déplacement ne touche pas au contenu : il n'y a rien à réécrire, juste
  // une date à choisir — et c'est le dialogue du planning qui la choisit.
  if (recommendation.status === STATUS.MOVE) {
    return {
      mode: 'move',
      status: recommendation.status,
      applicable: !locked,
      blockedReason,
      before: {
        durationMin: plannedMinutes,
        label: plannedMinutes ? labelFor(plannedMinutes, describe(session)) : session.title,
        exercises: session.ppgExercises || [],
      },
      after: null,
      removed: [], kept: [], added: [],
      notes: ['La séance est conservée telle quelle et proposée à une autre date.'],
      changes: null,
    };
  }

  const painAreas = answers?.pain?.present && answers.pain.area ? [answers.pain.area] : [];
  const limits = {
    painTargets: areaTargets(painAreas),
    soreTargets: areaTargets(effects.avoidAreas.filter((area) => !painAreas.includes(area))),
    forbidden: effects.forbiddenMovements.map(normalize).filter((t) => t.length >= 3),
    removePlyo: effects.removePlyo,
  };
  const targetMinutes = effects.shorten && effects.targetMinutes
    ? Math.min(effects.targetMinutes, plannedMinutes ?? effects.targetMinutes)
    : null;

  // Récupération : le contenu prévu ne tient plus, quel qu'il soit.
  if (recommendation.status === STATUS.RECOVER) {
    const minutes = Math.min(30, targetMinutes || 30);
    const exercises = FALLBACK.filter((e) => !incompatible(e, { ...limits, removePlyo: true }));
    return {
      mode: 'recover',
      status: recommendation.status,
      applicable: !locked,
      blockedReason,
      before: {
        durationMin: plannedMinutes,
        label: plannedMinutes ? labelFor(plannedMinutes, describe(session)) : session.title,
        exercises: session.ppgExercises || [],
      },
      after: {
        durationMin: minutes,
        label: labelFor(minutes, 'récupération et mobilité'),
        exercises,
      },
      removed: (session.ppgExercises || []).map((e) => e.name),
      kept: [],
      added: exercises.map((e) => e.name),
      notes: ['La séance prévue est remplacée par de la mobilité : la récupération est la séance du jour.'],
      changes: {
        type: 'REPOS',
        durationMin: minutes,
        intensity: 'rest',
        zone: 'MOBILITÉ',
        title: 'Récupération et mobilité',
        ppgExercises: exercises,
        steps: stepsFrom(exercises),
        brief: 'Mobilité et respiration. Les signaux du jour ne permettent pas la séance prévue.',
        coach: 'Ce n’est pas une séance perdue : c’est celle qui rend les suivantes possibles.',
        comment: 'Adaptée depuis le questionnaire quotidien.',
      },
    };
  }

  // Une séance de course : on joue sur la durée et sur l'intensité, pas sur une
  // liste d'exercices qu'elle n'a pas.
  if (session.type !== 'PPG' || !(session.ppgExercises || []).length) {
    const notes = [];
    const easier = ['quality', 'steady'].includes(session.intensity)
      && (effects.substitute || effects.rest || effects.protectLegs
        || recommendation.status === STATUS.ADAPT);
    const minutes = targetMinutes ?? plannedMinutes;
    if (easier) notes.push('Intensité ramenée à de l’endurance facile : le travail dur demande des jambes disponibles.');
    if (targetMinutes) notes.push(`Durée ramenée à ${targetMinutes} minutes.`);
    if (effects.avoidAreas.length) {
      notes.push(`À surveiller : ${effects.avoidAreas.map((id) => areaSpoken(id) || areaLabel(id)).filter(Boolean).join(', ')}.`);
    }

    const description = easier ? 'endurance facile, allure de conversation' : describe(session);
    return {
      mode: 'run',
      status: recommendation.status,
      applicable: !locked,
      blockedReason,
      before: {
        durationMin: plannedMinutes,
        label: plannedMinutes ? labelFor(plannedMinutes, session.title) : session.title,
        exercises: [],
      },
      after: {
        durationMin: minutes,
        label: minutes ? labelFor(minutes, description) : description,
        exercises: [],
      },
      removed: easier ? ['Travail au seuil ou en intervalles'] : [],
      kept: ['Sortie', 'Échauffement progressif'],
      added: easier ? ['Allure facile du début à la fin'] : [],
      notes,
      changes: {
        ...(minutes ? { durationMin: minutes } : {}),
        ...(easier
          ? {
            intensity: 'easy',
            zone: 'Z2',
            title: minutes ? `Endurance facile ${fmt(minutes)}` : 'Endurance facile',
            brief: 'Allure de conversation du début à la fin. La séance de qualité est reportée.',
          }
          : {}),
        comment: 'Adaptée depuis le questionnaire quotidien.',
      },
    };
  }

  // Une séance de PPG : on recompose la liste.
  const reworked = reworkExercises(session, { limits, targetMinutes, plannedMinutes });
  const keptNames = reworked.exercises
    .filter((exercise) => (session.ppgExercises || []).some((e) => e.id === exercise.id))
    .map((exercise) => exercise.name);
  const minutes = targetMinutes
    ?? Math.max(10, reworked.exercises.reduce((sum, e) => sum + minutesOf(e), 0));

  const notes = [...reworked.notes];
  if (targetMinutes) notes.push(`Durée ramenée à ${targetMinutes} minutes.`);
  if (effects.avoidAreas.length) {
    notes.push(`Zones épargnées : ${effects.avoidAreas.map((id) => areaLabel(id)).join(', ')}.`);
  }
  if (!reworked.removed.length && !reworked.added.length && !targetMinutes) return null;

  return {
    mode: 'ppg',
    status: recommendation.status,
    applicable: !locked,
    blockedReason,
    before: {
      durationMin: plannedMinutes,
      label: plannedMinutes ? labelFor(plannedMinutes, describe(session)) : session.title,
      exercises: session.ppgExercises || [],
    },
    after: {
      durationMin: minutes,
      label: labelFor(minutes, [...new Set(reworked.exercises.map((e) => e.cat.toLowerCase()))].join(', ')),
      exercises: reworked.exercises,
    },
    removed: reworked.removed,
    kept: keptNames,
    added: reworked.added,
    notes,
    changes: {
      durationMin: minutes,
      ppgExercises: reworked.exercises,
      steps: stepsFrom(reworked.exercises),
      title: `${session.title} — adaptée`,
      brief: `${reworked.exercises.length} exercices, ${minutes} minutes, composés depuis le point du jour.`,
      comment: 'Adaptée depuis le questionnaire quotidien.',
    },
  };
}

/* ── Alimentation du générateur PPG / WOD ───────────────────────────────── */

/** Les durées que le générateur de WOD accepte. */
const WOD_DURATIONS = [20, 30, 40, 50, 60];

const clampDuration = (minutes) => {
  if (!Number.isFinite(minutes) || minutes <= 0) return 40;
  const usable = WOD_DURATIONS.filter((d) => d <= minutes);
  return usable.length ? usable.at(-1) : WOD_DURATIONS[0];
};

/**
 * Traduit le point du jour en paramètres de génération.
 *
 * Le générateur ne connaît pas le questionnaire : il connaît une durée, un
 * matériel et trois champs de contrainte en texte libre, qu'il sait déjà lire
 * pour en tirer des zones à épargner. On lui parle donc sa langue plutôt que de
 * lui en apprendre une nouvelle.
 */
export function wodParamsFromCheckin(base = {}, answers) {
  if (!answers) return { ...base };

  const equipment = Array.isArray(answers.availableEquipment) && answers.availableEquipment.length
    ? [...new Set(['poids-du-corps', ...answers.availableEquipment])]
    : [...new Set(['poids-du-corps', ...(base.equipment || [])])];

  const sore = answers.soreness.level && answers.soreness.level !== 'none'
    ? answers.soreness.areas.map(areaLabel)
    : [];
  const pain = answers.pain.present
    ? [
      answers.pain.area ? areaLabel(answers.pain.area) : 'zone non précisée',
      answers.pain.kind || null,
      answers.pain.intensity ? `intensité ${answers.pain.intensity}/10` : null,
    ].filter(Boolean).join(' — ')
    : '';

  const avoid = [
    ...(answers.pain.triggers || []),
    // Une zone franchement courbaturée s'épargne comme une zone douloureuse :
    // le générateur lit les deux champs de la même façon.
    ...(['moderate', 'heavy'].includes(answers.soreness.level) ? sore : []),
  ].filter(Boolean).join(', ');

  // Fatigué ou sans envie, on ne propose pas de la puissance : on propose ce
  // qui se fait quand même. Jamais rien qui rendrait les paramètres invalides.
  const tired = answers.fatigue >= 4 || answers.motivation <= 2 || answers.pain.present;
  const goal = tired
    ? (answers.fatigue === 5 || answers.pain.present ? 'mobilite' : 'endurance')
    : (base.goal || 'conditionnement');

  return {
    durationMin: clampDuration(answers.availableMinutes),
    equipment,
    type: base.type || 'mixte',
    level: base.level || 'intermediaire',
    goal,
    constraints: {
      pain,
      injuries: String(base.constraints?.injuries ?? ''),
      avoid,
    },
    seed: Number.isFinite(base.seed) ? base.seed : 1,
  };
}
