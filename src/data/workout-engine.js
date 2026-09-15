// Le moteur de la séance guidée.
//
// Un chronomètre d'entraînement ne se construit pas en enlevant une seconde
// toutes les secondes. L'onglet passe en arrière-plan, le téléphone se
// verrouille, le rendu ralentit — et au bout de quarante minutes la séance a
// une minute de retard sur la montre de celui qui la fait. Ici, rien n'est
// décrémenté : l'état retient une heure de départ, et tout le reste — le temps
// écoulé, la phase en cours, le temps restant — est *calculé* à partir de
// l'horloge à chaque lecture. Un onglet gelé pendant dix minutes rattrape donc
// exactement dix minutes au premier `tick`, sans rien perdre ni inventer.
//
// Le moteur est pur : aucune minuterie, aucun DOM, aucun stockage. Il prend une
// définition, un état et une heure, et rend un nouvel état. C'est ce qui permet
// de faire passer une heure en une ligne dans les tests, et c'est aussi ce qui
// permet de reprendre une séance interrompue : un état relu depuis le disque
// vaut exactement un état gardé en mémoire.
//
// Ce que l'état NE contient pas, volontairement : le temps restant, le bloc en
// cours, la phase courante. Tout cela se recalcule, et une donnée dérivée
// stockée est une donnée qui finira par contredire celle dont elle dérive.

import { expandPhases, COUNTDOWN_SECONDS, FORMATS } from './workout-plan.js';

export { COUNTDOWN_SECONDS };

const clamp0 = (n) => (n > 0 ? n : 0);

/**
 * @typedef  {Object} RunState
 * @property {string}  definitionId
 * @property {'countdown'|'running'|'paused'|'finished'|'abandoned'} status
 * @property {number|null} startedAt          heure de départ réelle (ms epoch)
 * @property {number|null} countdownEndsAt    fin du décompte en cours
 * @property {number|null} suspendedAt        début de la suspension en cours
 * @property {number}  pauseTotalMs           temps suspendu déjà comptabilisé
 * @property {number}  phaseIndex
 * @property {number}  phaseStartElapsedMs    temps de séance au début de la phase
 * @property {number}  maxPhaseIndex          la plus loin atteinte
 * @property {Object}  extraMs                phaseIndex → récupération ajoutée
 * @property {Object}  rounds                 blockId → tours validés
 * @property {Object}  partialReps            blockId → répétitions du tour entamé
 * @property {Array}   substitutions
 * @property {Array}   pains
 * @property {number|null} endedElapsedMs     durée réelle figée à la fin
 * @property {number|null} endedAt
 */

/** Démarre une séance : décompte d'abord, le chronomètre ne tourne pas encore. */
export function createRun(definition, now) {
  return {
    definitionId: definition.id,
    status: 'countdown',
    startedAt: null,
    countdownEndsAt: now + COUNTDOWN_SECONDS * 1000,
    suspendedAt: null,
    pauseTotalMs: 0,
    phaseIndex: 0,
    phaseStartElapsedMs: 0,
    maxPhaseIndex: 0,
    extraMs: {},
    rounds: {},
    partialReps: {},
    substitutions: [],
    pains: [],
    endedElapsedMs: null,
    endedAt: null,
  };
}

/** Le temps de séance écoulé, en millisecondes. */
function elapsedMs(state, now) {
  if (state.endedElapsedMs != null) return state.endedElapsedMs;
  if (!state.startedAt) return 0;
  const suspendu = state.suspendedAt ? now - state.suspendedAt : 0;
  return clamp0(now - state.startedAt - state.pauseTotalMs - suspendu);
}

/** Le temps de séance écoulé, en secondes pleines. */
export function elapsedSeconds(state, now) {
  return Math.floor(elapsedMs(state, now) / 1000);
}

const phaseDurationMs = (phases, state, index) => (phases[index]?.seconds ?? 0) * 1000
  + (state.extraMs[index] || 0);

const isOver = (state) => state.status === 'finished' || state.status === 'abandoned';

/**
 * Fait avancer la séance jusqu'à l'heure donnée.
 *
 * C'est la seule fonction qui déplace la séance dans le temps, et elle est
 * idempotente : l'appeler dix fois à la même heure donne le même état. Elle
 * enchaîne autant de phases qu'il le faut, ce qui fait qu'un onglet resté en
 * arrière-plan pendant trois minutes d'EMOM se retrouve à la bonne minute et
 * pas trois minutes en arrière.
 */
export function tick(definition, state, now) {
  if (isOver(state)) return state;

  let next = state;

  if (next.status === 'countdown') {
    if (now < next.countdownEndsAt) return next;
    const fin = next.countdownEndsAt;
    next = next.startedAt
      // Reprise après pause : le décompte fait partie de la suspension.
      ? {
        ...next,
        status: 'running',
        countdownEndsAt: null,
        suspendedAt: null,
        pauseTotalMs: next.pauseTotalMs + (fin - next.suspendedAt),
      }
      : { ...next, status: 'running', countdownEndsAt: null, startedAt: fin };
  }

  if (next.status !== 'running') return next;

  const phases = expandPhases(definition);
  // Garde-fou : une phase de durée nulle ne doit pas boucler indéfiniment.
  for (let garde = 0; garde <= phases.length + 1; garde += 1) {
    const duree = phaseDurationMs(phases, next, next.phaseIndex);
    if (elapsedMs(next, now) - next.phaseStartElapsedMs < duree) break;

    if (next.phaseIndex >= phases.length - 1) {
      return {
        ...next,
        status: 'finished',
        endedElapsedMs: next.phaseStartElapsedMs + duree,
        endedAt: now,
      };
    }
    next = {
      ...next,
      phaseIndex: next.phaseIndex + 1,
      phaseStartElapsedMs: next.phaseStartElapsedMs + duree,
      maxPhaseIndex: Math.max(next.maxPhaseIndex, next.phaseIndex + 1),
    };
  }

  return next;
}

/** Met la séance en pause. Le temps déjà écoulé est conservé tel quel. */
export function pause(state, now) {
  if (isOver(state) || state.status === 'paused') return { ...state };
  return { ...state, status: 'paused', suspendedAt: state.suspendedAt ?? now };
}

/**
 * Reprend une séance en pause.
 *
 * Avec `withCountdown`, on repasse par dix secondes — reprendre un intervalle
 * pile au moment où on appuie sur le bouton n'a de sens pour personne.
 */
export function resume(state, now, { withCountdown = false } = {}) {
  if (isOver(state) || state.status === 'running') return { ...state };

  if (withCountdown) {
    return { ...state, status: 'countdown', countdownEndsAt: now + COUNTDOWN_SECONDS * 1000 };
  }
  return {
    ...state,
    status: 'running',
    countdownEndsAt: null,
    suspendedAt: null,
    pauseTotalMs: state.pauseTotalMs + (state.suspendedAt ? now - state.suspendedAt : 0),
  };
}

/** Place la séance sur une phase donnée, à l'instant présent. */
function goTo(definition, state, now, index) {
  const phases = expandPhases(definition);
  const cible = Math.min(Math.max(0, index), phases.length - 1);
  if (isOver(state)) return { ...state };
  return {
    ...state,
    phaseIndex: cible,
    phaseStartElapsedMs: elapsedMs(state, now),
    maxPhaseIndex: Math.max(state.maxPhaseIndex, cible),
  };
}

/** Passe à la phase suivante sans attendre la fin de celle en cours. */
export function nextPhase(definition, state, now) {
  return goTo(definition, state, now, state.phaseIndex + 1);
}

/** Revient à la phase précédente. */
export function previousPhase(definition, state, now) {
  return goTo(definition, state, now, state.phaseIndex - 1);
}

/** Saute à la fin du bloc en cours — pas à la fin de la séance. */
export function finishBlock(definition, state, now) {
  const phases = expandPhases(definition);
  const bloc = phases[state.phaseIndex]?.blockId;
  const suivante = phases.findIndex((p, i) => i > state.phaseIndex && p.blockId !== bloc);
  if (suivante < 0) return finish(definition, state, now);
  return goTo(definition, state, now, suivante);
}

const currentBlockId = (definition, state) => expandPhases(definition)[state.phaseIndex]?.blockId;

/** Valide un tour du bloc en cours. */
export function validateRound(definition, state, now) {
  const avance = tick(definition, state, now);
  const bloc = currentBlockId(definition, avance);
  if (!bloc) return { ...avance };
  return { ...avance, rounds: { ...avance.rounds, [bloc]: (avance.rounds[bloc] || 0) + 1 } };
}

/**
 * Saisit les répétitions du tour entamé — elles ne valent pas un tour de plus.
 *
 * `blockId` est optionnel parce que ces répétitions se saisissent souvent une
 * fois le bloc fini, sur l'écran de transition : le bloc courant est alors la
 * récupération, pas l'AMRAP qu'on est en train de renseigner.
 */
export function recordPartial(definition, state, now, reps, blockId = null) {
  const avance = tick(definition, state, now);
  const bloc = blockId ?? currentBlockId(definition, avance);
  if (!bloc) return { ...avance };
  return { ...avance, partialReps: { ...avance.partialReps, [bloc]: Math.max(0, Math.round(reps) || 0) } };
}

/**
 * Ajoute de la récupération à la phase en cours.
 *
 * Elle allonge la phase, donc la séance : la durée réelle du bilan la contient,
 * et c'est bien l'intention — une séance de 40 minutes avec 2 minutes ajoutées
 * a duré 42 minutes, pas 40.
 */
export function addRecovery(definition, state, now, seconds) {
  const avance = tick(definition, state, now);
  if (isOver(avance)) return { ...avance };
  const i = avance.phaseIndex;
  return { ...avance, extraMs: { ...avance.extraMs, [i]: (avance.extraMs[i] || 0) + seconds * 1000 } };
}

/**
 * Remplace un exercice pour cette séance seulement.
 *
 * La définition n'est pas touchée : le remplacement est un fait d'exécution,
 * pas une correction du programme. C'est ce qui permet au bilan de dire « box
 * jumps → step-ups » au lieu de faire comme si les box jumps n'avaient jamais
 * été prévus.
 */
export function substitute(definition, state, { blockId, stationId, to }) {
  const bloc = definition.blocks.find((b) => b.id === blockId);
  const station = bloc?.stations.find((st) => st.id === stationId);
  if (!station || !to) return { ...state };

  const autres = state.substitutions.filter((sub) => sub.stationId !== stationId);
  return {
    ...state,
    substitutions: [...autres, {
      blockId,
      blockName: bloc.name,
      stationId,
      fromId: station.movementId,
      fromName: station.name,
      toId: to.movementId,
      toName: to.name,
      toLibraryId: to.libraryId ?? null,
      toEasier: to.easier ?? '',
      toHarder: to.harder ?? '',
    }],
  };
}

/**
 * Enregistre une douleur signalée.
 *
 * On note la zone, l'intensité ressentie et le mouvement en cours — rien
 * d'autre. Aucune interprétation : ce n'est pas un diagnostic, c'est une ligne
 * dans le bilan.
 */
export function reportPain(definition, state, now, { zone, intensity }) {
  const w = view(definition, state, now);
  return {
    ...state,
    pains: [...state.pains, {
      zone: zone ?? null,
      intensity: Number(intensity) || null,
      movementId: w.station?.movementId ?? null,
      movementName: w.station?.name ?? null,
      blockId: w.block?.id ?? null,
      atSeconds: elapsedSeconds(state, now),
    }],
  };
}

/** Termine la séance normalement. */
export function finish(definition, state, now) {
  if (isOver(state)) return { ...state };
  return { ...state, status: 'finished', endedElapsedMs: elapsedMs(state, now), endedAt: now };
}

/** Arrête la séance en cours de route. */
export function abandon(definition, state, now) {
  if (isOver(state)) return { ...state };
  return { ...state, status: 'abandoned', endedElapsedMs: elapsedMs(state, now), endedAt: now };
}

/**
 * Tout ce que l'écran d'entraînement a besoin de savoir, à cet instant.
 *
 * Fonction de lecture : elle ne modifie rien et peut être appelée dix fois par
 * seconde sans conséquence.
 */
export function view(definition, state, now) {
  const phases = expandPhases(definition);
  const index = Math.min(state.phaseIndex, phases.length - 1);
  const phase = phases[index];
  const block = definition.blocks[phase?.blockIndex] ?? definition.blocks[0];
  const sessionElapsed = elapsedSeconds(state, now);

  const enDecompte = state.status === 'countdown';
  const resteDecompte = enDecompte
    ? Math.max(0, Math.ceil((state.countdownEndsAt - now) / 1000))
    : 0;

  const dureeMs = phaseDurationMs(phases, state, index);
  const phaseElapsedMs = clamp0(elapsedMs(state, now) - state.phaseStartElapsedMs);
  const phaseElapsed = Math.floor(phaseElapsedMs / 1000);
  const phaseRemaining = Math.max(0, Math.ceil((dureeMs - phaseElapsedMs) / 1000));

  const station = resolveStation(definition, state, block, phase?.stationIndex);
  const next = nextStationOf(definition, state, phases, index);

  return {
    status: state.status,

    block,
    blockIndex: phase?.blockIndex ?? 0,
    blocksTotal: definition.blocks.length,

    phase: enDecompte
      ? { id: 'decompte', kind: 'decompte', mode: 'countdown', seconds: COUNTDOWN_SECONDS, label: 'Préparez-vous' }
      : phase,
    phaseIndex: index,
    phasesTotal: phases.length,
    isLastPhase: index >= phases.length - 1,

    station,
    nextStation: next,
    stations: stationsOf(definition, state, block),

    round: phase?.round ?? null,
    roundsTotal: phase?.roundsTotal ?? null,
    validatedRounds: state.rounds[block?.id] || 0,
    partialReps: state.partialReps[block?.id] ?? null,

    formatLabel: FORMATS[block?.format]?.label ?? null,
    phaseDurationSeconds: Math.round(dureeMs / 1000),
    phaseElapsedSeconds: phaseElapsed,
    phaseRemainingSeconds: phaseRemaining,
    // Le gros chiffre de l'écran : ce qui reste quand la phase a une fin
    // annoncée, ce qui s'est écoulé quand c'est un chrono qui monte.
    displaySeconds: enDecompte ? resteDecompte
      : phase?.mode === 'countup' ? phaseElapsed : phaseRemaining,

    sessionElapsedSeconds: sessionElapsed,
    sessionPlannedSeconds: definition.plannedDurationSeconds,
    progress: definition.plannedDurationSeconds
      ? Math.min(1, sessionElapsed / definition.plannedDurationSeconds)
      : 0,

    targetRpe: block?.rpe ?? definition.targetRpe,
    addedRecoverySeconds: addedRecoveryOf(state),
  };
}

function substitutionFor(state, stationId) {
  return state.substitutions.find((sub) => sub.stationId === stationId) ?? null;
}

function applySubstitution(state, station) {
  if (!station) return null;
  const sub = substitutionFor(state, station.id);
  if (!sub) return { ...station, substituted: false };
  return {
    ...station,
    movementId: sub.toId,
    name: sub.toName,
    libraryId: sub.toLibraryId,
    easier: sub.toEasier,
    harder: sub.toHarder,
    // Le volume et la charge ne bougent pas : c'est le geste qu'on remplace,
    // pas la dose — sinon la structure du WOD ne veut plus rien dire.
    substituted: true,
    substitutedFrom: sub.fromName,
  };
}

function resolveStation(definition, state, block, stationIndex) {
  if (stationIndex == null || !block?.stations?.length) return null;
  return applySubstitution(state, block.stations[stationIndex]);
}

function stationsOf(definition, state, block) {
  return (block?.stations || []).map((st) => applySubstitution(state, st));
}

function nextStationOf(definition, state, phases, index) {
  for (let i = index + 1; i < phases.length; i += 1) {
    const p = phases[i];
    if (p.stationIndex == null) continue;
    const bloc = definition.blocks[p.blockIndex];
    return applySubstitution(state, bloc?.stations?.[p.stationIndex]);
  }
  // Aucune phase à venir ne met un exercice en avant — c'est le cas d'un AMRAP,
  // où c'est la liste entière qui tourne. On annonce alors le premier exercice
  // du prochain bloc qui en a un : sauter la récupération pour aller chercher
  // le WOD suivant est exactement ce qu'on veut lire sur l'écran.
  const courant = phases[index]?.blockIndex ?? 0;
  for (let b = courant + 1; b < definition.blocks.length; b += 1) {
    const bloc = definition.blocks[b];
    if (bloc?.stations?.length) return applySubstitution(state, bloc.stations[0]);
  }
  return null;
}

const addedRecoveryOf = (state) => Math.round(
  Object.values(state.extraMs).reduce((a, ms) => a + ms, 0) / 1000,
);

/**
 * Le bilan de la séance.
 *
 * Il dit ce qui a été fait, pas ce qui était prévu : un bloc jamais atteint est
 * marqué comme tel plutôt que rempli d'un résultat vraisemblable.
 */
export function buildResult(definition, state, answers = {}) {
  const phases = expandPhases(definition);
  const atteint = state.status === 'finished' ? phases.length - 1 : state.maxPhaseIndex;

  const blocks = definition.blocks.map((b) => {
    const premiere = phases.findIndex((p) => p.blockId === b.id);
    const reached = premiere >= 0 && premiere <= atteint;
    const derniere = phases.findLastIndex((p) => p.blockId === b.id);
    const rounds = state.rounds[b.id] || 0;
    const partialReps = state.partialReps[b.id] ?? null;

    return {
      id: b.id,
      name: b.name,
      kind: b.kind,
      format: b.format,
      reached,
      completed: reached && derniere <= atteint,
      plannedSeconds: b.durationSeconds,
      rounds,
      partialReps,
      score: reached ? scoreOf(b, rounds, partialReps) : null,
    };
  });

  return {
    id: `res-${definition.id}-${state.endedAt ?? 0}`,
    definitionId: definition.id,
    title: definition.title,
    type: definition.type,
    typeLabel: definition.typeLabel,
    status: state.status,
    plannedDurationSeconds: definition.plannedDurationSeconds,
    actualDurationSeconds: state.endedElapsedMs != null
      ? Math.round(state.endedElapsedMs / 1000)
      : elapsedSeconds(state, Date.now()),
    addedRecoverySeconds: addedRecoveryOf(state),
    targetRpe: definition.targetRpe,
    equipment: definition.equipment,
    blocks,
    completedWods: blocks.filter((b) => b.kind === 'wod' && b.completed).length,
    skippedBlocks: blocks.filter((b) => !b.reached).map((b) => b.id),
    substitutions: state.substitutions,
    pains: state.pains,
    rpe: answers.rpe ?? null,
    cardio: answers.cardio ?? null,
    muscular: answers.muscular ?? null,
    technique: answers.technique ?? null,
    comment: answers.comment ?? '',
    finishedAt: new Date(state.endedAt ?? Date.now()).toISOString(),
  };
}

function scoreOf(block, rounds, partialReps) {
  const kind = FORMATS[block.format]?.scoreKind;
  if (!kind) return null;
  if (kind === 'tours') {
    if (!rounds && !partialReps) return 'non renseigné';
    const t = `${rounds} tour${rounds > 1 ? 's' : ''}`;
    return partialReps ? `${t} + ${partialReps} répétitions` : t;
  }
  if (kind === 'cycles') return `${rounds} cycle${rounds > 1 ? 's' : ''} terminé${rounds > 1 ? 's' : ''}`;
  if (kind === 'series') return `${rounds} série${rounds > 1 ? 's' : ''} validée${rounds > 1 ? 's' : ''}`;
  if (kind === 'temps') {
    if (!rounds) return 'non renseigné';
    return `${rounds} tour${rounds > 1 ? 's' : ''} validé${rounds > 1 ? 's' : ''}`;
  }
  return null;
}
