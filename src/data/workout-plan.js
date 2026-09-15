// De la séance affichée à la séance chronométrable.
//
// Trois choses différentes vivent dans ce mode guidé, et les mélanger est la
// façon la plus sûre de ne plus rien pouvoir corriger :
//
//   la DÉFINITION   ce qui était prévu — des blocs, des durées, des stations.
//                   Immuable pendant toute la séance. C'est ce fichier.
//   l'ÉTAT          où on en est — voir workout-engine.js.
//   le RÉSULTAT     ce qui a réellement été fait — produit à la fin.
//
// Une séance affichée dit « 14 min · AMRAP · 4 mouvements ». Ça se lit, mais ça
// ne se chronomètre pas : il manque le découpage en phases. C'est ce que fait
// `expandPhases`, et c'est la seule chose qui décide de ce que le chronomètre
// affiche à un instant donné.
//
// Règle qui tient tout le fichier : la somme des phases d'un bloc vaut la durée
// du bloc, et la somme des blocs vaut la durée de la séance. Toujours. Un
// format qui ne sait pas tomber juste est ramené à un bloc d'une seule phase
// plutôt que de faire dériver la séance.

import { MOVEMENTS, MOVEMENT_BY_ID, GROUP_LABELS, equipmentLabel } from './wod-movements.js';

/** Le décompte avant le premier exercice. */
export const COUNTDOWN_SECONDS = 10;

/** Les formats que le moteur sait dérouler. */
export const FORMATS = {
  amrap: { label: 'AMRAP', mode: 'countdown', scoreKind: 'tours' },
  emom: { label: 'EMOM', mode: 'countdown', scoreKind: 'cycles' },
  intervalles: { label: 'Intervalles', mode: 'countdown', scoreKind: 'series' },
  'for-time': { label: 'For Time', mode: 'countup', scoreKind: 'temps' },
  chipper: { label: 'Chipper', mode: 'countup', scoreKind: 'temps' },
  'hyrox-sim': { label: 'Simulation HYROX', mode: 'countup', scoreKind: 'temps' },
  'hyrox-compromis': { label: 'Compromised running', mode: 'countup', scoreKind: 'temps' },
  circuit: { label: 'Circuit', mode: 'countdown', scoreKind: null },
  liste: { label: 'Liste', mode: 'countdown', scoreKind: null },
  libre: { label: 'Libre', mode: 'countdown', scoreKind: null },
};

/** Le travail et la récupération d'un intervalle, tels que le WOD les prescrit. */
const INTERVAL_WORK = 40;
const INTERVAL_REST = 20;

/** Minutes indicatives par rôle d'exercice PPG — mêmes valeurs que data/ppg.js. */
const PPG_WEIGHTS = { FORCE: 6, EXCENTRIQUE: 6, 'PLIOMÉTRIE': 5, GAINAGE: 4, 'MOBILITÉ': 3 };

/**
 * @typedef  {Object} Station
 * @property {string}   id
 * @property {string}   movementId
 * @property {string}   name
 * @property {string}   volume
 * @property {string}   charge
 * @property {string[]} groups      libellés lisibles
 * @property {string[]} [groupIds]  identifiants, pour chercher un remplaçant
 * @property {string}   [libraryId] exercice illustré de la bibliothèque PPG
 * @property {number}   [seconds]   durée allouée — format « circuit » uniquement
 */

/**
 * Une séance générée par le générateur de WOD devient une définition.
 *
 * Rien n'est recalculé ici : les durées, les volumes et les consignes viennent
 * telles quelles de la séance affichée. Si les deux divergeaient, c'est que
 * quelqu'un aurait décidé deux fois de la même chose.
 */
export function fromWodSession(session) {
  return {
    id: `wod-${session.name}-${session.seed}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    source: 'wod',
    title: session.name,
    type: session.typeId,
    typeLabel: session.typeLabel,
    goalLabel: session.goalLabel,
    levelLabel: session.levelLabel,
    plannedDurationSeconds: session.durationMin * 60,
    targetRpe: { min: session.rpe.min, max: session.rpe.max },
    rpeLabel: session.rpe.label,
    equipment: session.equipment.map((e) => e.label),
    // Les identifiants, eux, servent à chercher un remplaçant en cours de
    // séance : un libellé ne se compare pas au champ `needs` d'un mouvement.
    equipmentIds: session.equipmentIds,
    constraintZones: session.constraints?.zones ?? [],
    level: session.levelId ?? 'intermediaire',
    durationCheck: session.durationCheck,
    safety: session.safety,
    blocks: session.blocks.map((b) => ({
      id: b.id,
      name: b.title,
      kind: b.kind,
      format: formatOf(b),
      durationSeconds: b.minutes * 60,
      rounds: b.kind === 'wod' && formatOf(b) === 'intervalles' ? b.minutes : null,
      workSeconds: formatOf(b) === 'intervalles' ? INTERVAL_WORK : null,
      restSeconds: formatOf(b) === 'intervalles' ? INTERVAL_REST : null,
      rpe: { min: b.rpe.min, max: b.rpe.max },
      prescription: b.prescription,
      score: b.score ?? null,
      safety: b.safety ?? [],
      stations: (b.movements || []).map((m, i) => ({
        id: `${b.id}-${i}`,
        movementId: m.id,
        name: m.name,
        volume: m.volume,
        charge: m.charge,
        groups: m.groups,
        groupIds: MOVEMENT_BY_ID.get(m.id)?.groups ?? [],
        libraryId: m.libraryId ?? null,
        easier: m.easier,
        harder: m.harder,
        note: m.note ?? '',
      })),
    })),
  };
}

function formatOf(block) {
  if (block.kind === 'wod') return FORMATS[block.formatId] ? block.formatId : 'for-time';
  if (block.kind === 'recuperation') return 'libre';
  return 'liste';
}

/**
 * Une séance de PPG composée par data/ppg.js devient une définition.
 *
 * La PPG n'a pas de format : c'est une liste d'exercices dans un ordre qui
 * compte. On la déroule donc en circuit, un exercice après l'autre, et on
 * répartit les minutes de la séance au prorata du coût de chaque rôle — le
 * reste de la division tombe sur le dernier exercice pour que la somme soit
 * exacte plutôt que « à peu près ».
 */
export function fromPpgSession(session) {
  const exercises = session.ppgExercises || [];
  // Le plan porte la durée dans `fixedDurationSec` — c'est elle qui s'affiche
  // sur la carte de la semaine, donc c'est elle qui doit s'afficher ici. La
  // recalculer donnerait deux durées différentes pour la même séance.
  const totalSeconds = Math.round(
    session.fixedDurationSec ?? session.durationSec ?? (session.minutes ?? 30) * 60,
  );

  const weights = exercises.map((e) => PPG_WEIGHTS[e.cat] ?? 4);
  const sum = weights.reduce((a, w) => a + w, 0) || 1;

  let allotted = 0;
  const stations = exercises.map((e, i) => {
    const last = i === exercises.length - 1;
    const seconds = last
      ? totalSeconds - allotted
      : Math.max(30, Math.round((totalSeconds * weights[i]) / sum));
    allotted += seconds;
    return {
      id: `ppg-${e.id}`,
      movementId: e.id,
      name: e.name,
      volume: e.sets || '—',
      charge: '—',
      groups: [e.cat],
      groupIds: [],
      libraryId: e.id,
      easier: '',
      harder: '',
      note: e.tempo ? `Tempo ${e.tempo}` : '',
      seconds,
    };
  });

  return {
    id: `ppg-${session.id || session.date || 'seance'}`,
    source: 'ppg',
    title: session.title || 'Renforcement',
    type: 'ppg',
    typeLabel: 'PPG',
    goalLabel: null,
    levelLabel: null,
    plannedDurationSeconds: totalSeconds,
    targetRpe: { min: 6, max: 7 },
    rpeLabel: 'RPE 6–7 / 10 — soutenu, tu parles par bouts de phrase',
    equipment: [...new Set(exercises.flatMap((e) => e.needs || []))].map(equipmentLabel),
    equipmentIds: [...new Set(exercises.flatMap((e) => e.needs || []))],
    constraintZones: [],
    level: 'intermediaire',
    durationCheck: null,
    safety: ['La qualité d’exécution passe avant le nombre de répétitions.'],
    blocks: [{
      id: 'ppg-circuit',
      name: session.title || 'Renforcement',
      kind: 'wod',
      format: 'circuit',
      durationSeconds: totalSeconds,
      rounds: null, workSeconds: null, restSeconds: null,
      rpe: { min: 6, max: 7 },
      prescription: 'Un exercice après l’autre, dans l’ordre. Le temps alloué '
        + 'comprend les séries et les repos.',
      score: 'Séries réellement réalisées',
      safety: [],
      stations,
    }],
  };
}

/**
 * Découpe une définition en phases chronométrables.
 *
 * Le décompte de départ n'en fait pas partie : il ne consomme pas de temps de
 * séance, c'est un état du moteur, pas un morceau du programme.
 */
export function expandPhases(definition) {
  const phases = [];

  (definition?.blocks || []).forEach((block, blockIndex) => {
    const nb = block.stations?.length || 0;
    const push = (p) => phases.push({
      id: `${block.id}-p${phases.length}`,
      blockId: block.id,
      blockIndex,
      stationIndex: null,
      round: null,
      roundsTotal: null,
      ...p,
    });

    if (block.format === 'emom') {
      const minutes = Math.max(1, Math.round(block.durationSeconds / 60));
      for (let i = 0; i < minutes; i += 1) {
        push({
          kind: 'travail',
          mode: 'countdown',
          seconds: block.durationSeconds / minutes,
          stationIndex: nb ? i % nb : null,
          round: i + 1,
          roundsTotal: minutes,
          label: `Minute ${i + 1} / ${minutes}`,
        });
      }
      return;
    }

    if (block.format === 'intervalles') {
      const rounds = block.rounds || Math.max(1, Math.round(block.durationSeconds / 60));
      const work = block.workSeconds || INTERVAL_WORK;
      const rest = block.restSeconds || INTERVAL_REST;
      for (let r = 0; r < rounds; r += 1) {
        push({
          kind: 'travail', mode: 'countdown', seconds: work,
          stationIndex: nb ? r % nb : null,
          round: r + 1, roundsTotal: rounds,
          label: `Série ${r + 1} / ${rounds} — travail`,
        });
        push({
          kind: 'recuperation', mode: 'countdown', seconds: rest,
          stationIndex: nb ? r % nb : null,
          round: r + 1, roundsTotal: rounds,
          label: `Série ${r + 1} / ${rounds} — récupération`,
        });
      }
      return;
    }

    if (block.format === 'circuit') {
      block.stations.forEach((st, i) => {
        push({
          kind: 'travail', mode: 'countdown', seconds: st.seconds,
          stationIndex: i,
          round: i + 1, roundsTotal: nb,
          label: `Exercice ${i + 1} / ${nb}`,
        });
      });
      return;
    }

    // AMRAP, For Time, chipper, HYROX, échauffement, récupération, retour au
    // calme : un seul morceau de temps. Ce qui change, c'est le sens du
    // chronomètre et ce que l'écran propose de valider.
    push({
      kind: block.kind === 'recuperation' ? 'recuperation'
        : block.kind === 'wod' ? 'travail' : 'liste',
      mode: FORMATS[block.format]?.mode ?? 'countdown',
      seconds: block.durationSeconds,
      stationIndex: null,
      round: 1,
      roundsTotal: null,
      label: block.name,
    });
  });

  return phases;
}

/**
 * Relit une définition avant de la lancer.
 *
 * Une séance qui ne tombe pas juste n'est pas démarrée : mieux vaut un message
 * que vingt minutes de chronomètre faux.
 *
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateDefinition(definition) {
  const errors = [];
  if (!definition || typeof definition !== 'object') {
    return { ok: false, errors: ['Séance absente ou illisible.'] };
  }
  if (!definition.title) errors.push('Séance sans titre.');
  if (!Array.isArray(definition.blocks) || definition.blocks.length === 0) {
    return { ok: false, errors: ['Séance sans aucun bloc.'] };
  }

  definition.blocks.forEach((b, i) => {
    const où = `bloc ${i + 1}`;
    if (!b.id) errors.push(`${où} : identifiant manquant.`);
    if (!b.name) errors.push(`${où} : nom manquant.`);
    if (!FORMATS[b.format]) errors.push(`${où} : format inconnu (${b.format}).`);
    if (!(b.durationSeconds > 0)) errors.push(`${où} : durée nulle ou absente.`);
    if (!Array.isArray(b.stations)) errors.push(`${où} : liste d’exercices absente.`);
    for (const st of b.stations || []) {
      if (!st.id || !st.name) errors.push(`${où} : exercice sans identifiant ou sans nom.`);
      if (!st.volume) errors.push(`${où} : ${st.name} sans volume.`);
    }
  });

  const sommeBlocs = definition.blocks.reduce((a, b) => a + (b.durationSeconds || 0), 0);
  if (sommeBlocs !== definition.plannedDurationSeconds) {
    errors.push(
      `Durée annoncée (${Math.round(definition.plannedDurationSeconds / 60)} min) différente `
      + `de la somme des blocs (${Math.round(sommeBlocs / 60)} min).`,
    );
  }

  const phases = expandPhases(definition);
  const sommePhases = phases.reduce((a, p) => a + (p.seconds || 0), 0);
  if (Math.round(sommePhases) !== Math.round(sommeBlocs)) {
    errors.push('Le découpage en phases ne couvre pas la durée des blocs.');
  }
  if (phases.some((p) => !(p.seconds > 0))) errors.push('Une phase a une durée nulle.');

  return { ok: errors.length === 0, errors };
}

/**
 * Les remplaçants possibles d'un exercice.
 *
 * Un remplacement n'a d'intérêt que s'il garde le stimulus : même chaîne
 * musculaire, matériel réellement disponible, zones douloureuses épargnées,
 * technicité compatible avec le niveau. Le reste — la durée de l'intervalle,
 * le format du WOD — ne bouge pas, donc la structure temporelle non plus.
 */
export function substitutesFor({ station, equipment, zones = [], level = 'intermediaire', limit = 5 }) {
  const source = MOVEMENT_BY_ID.get(station?.movementId);
  const cibles = new Set(source?.groups ?? station?.groupIds ?? []);
  if (!cibles.size) return [];

  const have = new Set(equipment || []);
  const banned = new Set(zones);
  const noImpact = banned.has('genou') || banned.has('cheville');
  const maxSkill = { debutant: 1, intermediaire: 2, avance: 3 }[level] ?? 2;

  return MOVEMENTS
    .filter((m) => m.id !== station?.movementId)
    .filter((m) => m.roles.includes('wod'))
    .filter((m) => m.groups.some((g) => cibles.has(g)))
    .filter((m) => m.needs.every((n) => have.has(n)))
    .filter((m) => m.skill <= maxSkill)
    .filter((m) => !m.zones.some((z) => banned.has(z)))
    .filter((m) => !(noImpact && m.impact === 'haut'))
    // Le plus proche d'abord : celui qui partage le plus de chaînes.
    .sort((a, b) => {
      const proximite = (m) => m.groups.filter((g) => cibles.has(g)).length;
      return proximite(b) - proximite(a) || a.name.localeCompare(b.name, 'fr');
    })
    .slice(0, limit)
    .map((m) => ({
      movementId: m.id,
      name: m.name,
      groups: m.groups,
      groupLabels: m.groups.map((g) => GROUP_LABELS[g] ?? g),
      zones: m.zones,
      skill: m.skill,
      needs: m.needs,
      libraryId: m.libraryId ?? null,
      easier: m.easier,
      harder: m.harder,
    }));
}
