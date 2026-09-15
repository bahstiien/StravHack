// Les tests du moteur de séance guidée.
//
// Le moteur est pur : il prend une définition, un état et une heure, et rend un
// nouvel état. Aucun `setInterval`, aucun DOM — donc on peut faire passer une
// heure en une ligne et vérifier exactement où en est la séance.
//
// Ce qui est vérifié ici est ce qui ruine une séance sans prévenir : un
// chronomètre qui dérive, une minute d'EMOM qui saute, une pause qui perd le
// temps déjà écoulé, une reprise qui repart de zéro.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fromWodSession, fromPpgSession, expandPhases, validateDefinition, substitutesFor,
} from '../src/data/workout-plan.js';

import {
  COUNTDOWN_SECONDS,
  createRun, tick, pause, resume, nextPhase, previousPhase,
  validateRound, recordPartial, addRecovery, substitute, reportPain, finishBlock,
  finish, abandon, view, buildResult, elapsedSeconds,
} from '../src/data/workout-engine.js';

import { generateWod } from '../src/data/wod.js';

const T0 = 1_700_000_000_000; // une heure de départ arbitraire mais stable
const s = (n) => n * 1000;

/** Une définition écrite à la main : on veut des durées exactes et connues. */
function definition(over = {}) {
  return {
    id: 'def-test',
    title: 'Séance de test',
    type: 'CrossFit',
    typeLabel: 'CrossFit',
    plannedDurationSeconds: 60 * (2 + 4 + 1 + 3),
    targetRpe: { min: 7, max: 8 },
    equipment: ['poids-du-corps'],
    safety: ['Consigne générale.'],
    blocks: [
      {
        id: 'b-warm', name: 'Échauffement', kind: 'echauffement', format: 'liste',
        durationSeconds: 120, rpe: { min: 3, max: 4 }, safety: [],
        stations: [
          { id: 'st-1', movementId: 'air-squat', name: 'Air squat', volume: '20 rép.', charge: '—', groups: ['Jambes'] },
          { id: 'st-2', movementId: 'pompes', name: 'Pompes', volume: '15 rép.', charge: '—', groups: ['Poussée'] },
        ],
      },
      {
        id: 'b-emom', name: 'WOD 1', kind: 'wod', format: 'emom',
        durationSeconds: 240, rpe: { min: 7, max: 8 }, score: 'Minutes bouclées', safety: [],
        stations: [
          { id: 'st-3', movementId: 'burpees', name: 'Burpees', volume: '12 rép.', charge: '—', groups: ['Cardio'] },
          { id: 'st-4', movementId: 'air-squat', name: 'Air squat', volume: '20 rép.', charge: '—', groups: ['Jambes'] },
        ],
      },
      {
        id: 'b-recup', name: 'Récupération', kind: 'recuperation', format: 'libre',
        durationSeconds: 60, rpe: { min: 2, max: 3 }, stations: [], safety: [],
      },
      {
        id: 'b-amrap', name: 'WOD 2', kind: 'wod', format: 'amrap',
        durationSeconds: 180, rpe: { min: 7, max: 8 }, score: 'Tours + répétitions', safety: [],
        stations: [
          { id: 'st-5', movementId: 'pompes', name: 'Pompes', volume: '15 rép.', charge: '—', groups: ['Poussée'] },
          { id: 'st-6', movementId: 'planche', name: 'Gainage ventral', volume: '45″', charge: '—', groups: ['Gainage'] },
        ],
      },
    ],
    ...over,
  };
}

const intervalles = () => definition({
  plannedDurationSeconds: 480,
  blocks: [{
    id: 'b-int', name: 'WOD 1', kind: 'wod', format: 'intervalles',
    durationSeconds: 480, rounds: 8, workSeconds: 40, restSeconds: 20,
    rpe: { min: 8, max: 9 }, score: 'Répétitions cumulées', safety: [],
    stations: [
      { id: 'i-1', movementId: 'burpees', name: 'Burpees', volume: '8 rép.', charge: '—', groups: ['Cardio'] },
      { id: 'i-2', movementId: 'air-squat', name: 'Air squat', volume: '20 rép.', charge: '—', groups: ['Jambes'] },
    ],
  }],
});

/** Avance jusqu'à `atSeconds` après le début, en une seule fois. */
const at = (def, state, seconds) => tick(def, state, T0 + s(seconds));
const v = (def, state, seconds) => view(def, state, T0 + s(seconds));

// ── La définition ───────────────────────────────────────────────────────────

test('une séance générée devient une définition chronométrable valide', () => {
  for (const durationMin of [20, 30, 40, 50, 60]) {
    for (const type of ['crossfit', 'hyrox', 'mixte', 'aleatoire']) {
      const res = generateWod({
        durationMin, type, level: 'intermediaire', goal: 'conditionnement',
        equipment: ['poids-du-corps', 'halteres', 'kettlebell', 'corde-a-sauter', 'espace-course', 'box'],
        constraints: { pain: '', injuries: '', avoid: '' }, seed: 4,
      });
      assert.equal(res.ok, true);

      const def = fromWodSession(res.session);
      const verdict = validateDefinition(def);
      assert.equal(verdict.ok, true, verdict.errors.join(' · '));

      // La définition ne réinvente pas la durée : elle reprend celle de la séance.
      assert.equal(def.plannedDurationSeconds, durationMin * 60);

      // Et les phases couvrent exactement cette durée.
      const phases = expandPhases(def);
      const total = phases
        .filter((p) => p.kind !== 'decompte')
        .reduce((a, p) => a + p.seconds, 0);
      assert.equal(total, durationMin * 60, `${durationMin} min / ${type}`);
    }
  }
});

test('une séance de PPG devient elle aussi une définition valide', () => {
  const ppg = {
    id: 'ppg-1', title: 'PPG force + gainage', type: 'PPG', durationLabel: '30′',
    minutes: 30,
    ppgExercises: [
      { id: 'a', name: 'Fente bulgare', cat: 'FORCE', sets: '4 × 8 / jambe', tempo: '3–1–1', needs: ['halteres'] },
      { id: 'b', name: 'Dead bug', cat: 'GAINAGE', sets: '3 × 10', tempo: '2–0–2', needs: ['poids-du-corps'] },
      { id: 'c', name: 'Étirement ischios', cat: 'MOBILITÉ', sets: '2 × 40″', tempo: 'lent', needs: ['poids-du-corps'] },
    ],
  };
  const def = fromPpgSession(ppg);
  assert.equal(validateDefinition(def).ok, true);
  assert.equal(def.plannedDurationSeconds, 30 * 60);
  assert.equal(
    expandPhases(def).filter((p) => p.kind !== 'decompte').reduce((a, p) => a + p.seconds, 0),
    30 * 60,
  );
  assert.ok(def.blocks.flatMap((b) => b.stations).some((st) => st.name === 'Dead bug'));
});

test('une séance de PPG du plan garde SA durée et nomme son matériel', () => {
  // La forme réellement produite par data/plan.js : la durée est dans
  // `fixedDurationSec`, pas dans `minutes`.
  const duPlan = {
    id: 'p-2026-09-18', title: 'PPG force + pliométrie', type: 'PPG',
    durationLabel: '34′', fixedDurationSec: 34 * 60,
    ppgExercises: [
      { id: 'a', name: 'Fente avant', cat: 'FORCE', sets: '3 × 12 / jambe', tempo: '2-0-1', needs: ['poids-du-corps'] },
      { id: 'b', name: 'Soulevé de terre roumain', cat: 'EXCENTRIQUE', sets: '4 × 8', tempo: '4-0-1', needs: ['halteres'] },
      { id: 'c', name: 'Pont fessier au sol', cat: 'GAINAGE', sets: '3 × 15', tempo: '2-2-2', needs: ['poids-du-corps'] },
    ],
  };

  const def = fromPpgSession(duPlan);
  assert.equal(validateDefinition(def).ok, true);
  assert.equal(def.plannedDurationSeconds, 34 * 60, 'la durée affichée ailleurs dans l’app doit être reprise');
  assert.equal(
    expandPhases(def).reduce((a, p) => a + p.seconds, 0),
    34 * 60,
  );

  // Le matériel est nommé, pas montré sous forme d'identifiant technique.
  assert.ok(def.equipment.includes('Haltères'), def.equipment.join(', '));
  assert.ok(def.equipment.includes('Poids du corps / aucun matériel'));
  assert.ok(!def.equipment.some((e) => e.includes('-')), `identifiant brut affiché : ${def.equipment.join(', ')}`);
  assert.deepEqual(def.equipmentIds.sort(), ['halteres', 'poids-du-corps']);

  // Un exercice après l'autre, dans l'ordre du programme.
  const phases = expandPhases(def);
  assert.equal(phases.length, 3);
  assert.deepEqual(phases.map((p) => p.stationIndex), [0, 1, 2]);
});

test('une définition incohérente est refusée, pas exécutée', () => {
  assert.equal(validateDefinition(null).ok, false);
  assert.equal(validateDefinition({ blocks: [] }).ok, false);
  const cassee = definition();
  cassee.blocks[0].durationSeconds = 0;
  assert.equal(validateDefinition(cassee).ok, false);
});

test('les phases d’un EMOM font une minute chacune, celles d’un intervalle alternent', () => {
  const emom = expandPhases(definition()).filter((p) => p.blockId === 'b-emom');
  assert.equal(emom.length, 4);
  assert.ok(emom.every((p) => p.seconds === 60 && p.kind === 'travail'));
  assert.deepEqual(emom.map((p) => p.stationIndex), [0, 1, 0, 1]);
  assert.deepEqual(emom.map((p) => p.round), [1, 2, 3, 4]);

  const inter = expandPhases(intervalles()).filter((p) => p.blockId === 'b-int');
  assert.equal(inter.length, 16);
  assert.deepEqual(inter.slice(0, 4).map((p) => p.kind), ['travail', 'recuperation', 'travail', 'recuperation']);
  assert.deepEqual(inter.slice(0, 4).map((p) => p.seconds), [40, 20, 40, 20]);
  assert.equal(inter.filter((p) => p.kind === 'travail').length, 8);
});

// ── Décompte et démarrage ───────────────────────────────────────────────────

test('la séance commence par un décompte de dix secondes', () => {
  const def = definition();
  const run = createRun(def, T0);
  assert.equal(run.status, 'countdown');

  const debut = v(def, run, 0);
  assert.equal(debut.phase.kind, 'decompte');
  assert.equal(debut.displaySeconds, COUNTDOWN_SECONDS);
  assert.equal(COUNTDOWN_SECONDS, 10);

  // Pendant le décompte, la séance n'a pas commencé : le temps de séance est nul.
  assert.equal(v(def, run, 4).sessionElapsedSeconds, 0);
  assert.equal(v(def, run, 4).displaySeconds, 6);

  // À la fin du décompte, le premier bloc démarre tout seul.
  const apres = at(def, run, 10);
  const w = v(def, apres, 10);
  assert.equal(w.status, 'running');
  assert.equal(w.block.id, 'b-warm');
  assert.equal(w.phase.kind, 'liste');
  assert.equal(w.sessionElapsedSeconds, 0);
});

test('le décompte ne compte pas dans la durée de la séance', () => {
  const def = definition();
  let run = createRun(def, T0);
  run = at(def, run, 130); // 10 s de décompte + 120 s d'échauffement
  const w = v(def, run, 130);
  assert.equal(w.sessionElapsedSeconds, 120);
  assert.equal(w.block.id, 'b-emom');
});

// ── Progression ─────────────────────────────────────────────────────────────

test('l’EMOM change de minute tout seul et affiche l’exercice suivant', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10); // échauffement en cours

  run = at(def, run, 10 + 120 + 30); // 30 s dans la première minute
  let w = v(def, run, 10 + 120 + 30);
  assert.equal(w.block.id, 'b-emom');
  assert.equal(w.round, 1);
  assert.equal(w.roundsTotal, 4);
  assert.equal(w.station.name, 'Burpees');
  assert.equal(w.nextStation.name, 'Air squat');
  assert.equal(w.displaySeconds, 30, 'l’EMOM affiche le temps restant dans la minute');

  run = at(def, run, 10 + 120 + 65); // la minute suivante a commencé
  w = v(def, run, 10 + 120 + 65);
  assert.equal(w.round, 2);
  assert.equal(w.station.name, 'Air squat');
  assert.equal(w.displaySeconds, 55);

  run = at(def, run, 10 + 120 + 185); // quatrième minute
  w = v(def, run, 10 + 120 + 185);
  assert.equal(w.round, 4);
  assert.equal(w.station.name, 'Air squat');
});

test('les intervalles alternent travail et récupération sans intervention', () => {
  const def = intervalles();
  let run = at(def, createRun(def, T0), 10);

  const etat = (sec) => {
    run = at(def, run, 10 + sec);
    return v(def, run, 10 + sec);
  };

  let w = etat(5);
  assert.equal(w.phase.kind, 'travail');
  assert.equal(w.round, 1);
  assert.equal(w.displaySeconds, 35);

  w = etat(45);
  assert.equal(w.phase.kind, 'recuperation');
  assert.equal(w.round, 1);
  assert.equal(w.displaySeconds, 15);

  w = etat(65);
  assert.equal(w.phase.kind, 'travail');
  assert.equal(w.round, 2);
  assert.equal(w.station.name, 'Air squat', 'l’exercice tourne à chaque série');

  w = etat(7 * 60 + 30);
  assert.equal(w.round, 8);
});

test('l’AMRAP descend jusqu’à zéro et compte les tours validés', () => {
  const def = definition();
  const debut = 10 + 120 + 240 + 60;
  let run = at(def, createRun(def, T0), debut + 1);

  let w = v(def, run, T0 && debut + 1);
  w = v(def, run, debut + 1);
  assert.equal(w.block.id, 'b-amrap');
  assert.equal(w.phase.mode, 'countdown');
  assert.equal(w.displaySeconds, 179);

  run = validateRound(def, run, T0 + s(debut + 30));
  run = validateRound(def, run, T0 + s(debut + 60));
  run = validateRound(def, run, T0 + s(debut + 95));
  assert.equal(v(def, run, debut + 95).validatedRounds, 3);

  // Les répétitions du tour entamé se saisissent à la fin, et ne valent pas
  // un tour de plus.
  run = recordPartial(def, run, T0 + s(debut + 170), 18);
  const res = buildResult(def, run, {});
  const bloc = res.blocks.find((b) => b.id === 'b-amrap');
  assert.equal(bloc.rounds, 3);
  assert.equal(bloc.partialReps, 18);
  assert.equal(bloc.score, '3 tours + 18 répétitions');
});

test('la séance se termine toute seule à la dernière phase', () => {
  const def = definition();
  const run = at(def, createRun(def, T0), 10 + 600 + 5);
  assert.equal(run.status, 'finished');
  assert.equal(v(def, run, 10 + 600 + 5).sessionElapsedSeconds, 600);
});

// ── Pas de dérive ───────────────────────────────────────────────────────────

test('aucune dérive : un saut d’un quart d’heure tombe exactement au bon endroit', () => {
  const def = definition();
  const enUnSaut = at(def, createRun(def, T0), 10 + 320);

  // La même chose en trois cents petits pas.
  let pasAPas = createRun(def, T0);
  for (let i = 0; i <= 330; i += 1) pasAPas = at(def, pasAPas, i);

  assert.equal(pasAPas.phaseIndex, enUnSaut.phaseIndex);
  assert.equal(
    v(def, pasAPas, 10 + 320).sessionElapsedSeconds,
    v(def, enUnSaut, 10 + 320).sessionElapsedSeconds,
  );
  assert.equal(v(def, enUnSaut, 10 + 320).sessionElapsedSeconds, 320);
});

test('le temps écoulé vient de l’horloge, pas d’un compteur décrémenté', () => {
  const def = definition();
  const run = at(def, createRun(def, T0), 10);
  // Deux lectures à des heures différentes sur le MÊME état.
  assert.equal(elapsedSeconds(run, T0 + s(10 + 42)), 42);
  assert.equal(elapsedSeconds(run, T0 + s(10 + 43)), 43);
  // Relire ne fait pas avancer l'état.
  assert.equal(elapsedSeconds(run, T0 + s(10 + 42)), 42);
});

// ── Pause et reprise ────────────────────────────────────────────────────────

test('la pause fige le temps écoulé et la reprise repart d’où on en était', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 60); // 60 s dans l'échauffement

  run = pause(run, T0 + s(10 + 60));
  assert.equal(run.status, 'paused');
  assert.equal(v(def, run, 10 + 60).sessionElapsedSeconds, 60);

  // Cinq minutes de pause ne font pas avancer la séance d'une seconde.
  assert.equal(v(def, run, 10 + 360).sessionElapsedSeconds, 60);
  assert.equal(v(def, run, 10 + 360).displaySeconds, v(def, run, 10 + 60).displaySeconds);
  assert.equal(at(def, run, 10 + 360).phaseIndex, run.phaseIndex, 'une pause n’enchaîne pas les phases');

  run = resume(run, T0 + s(10 + 360));
  assert.equal(run.status, 'running');
  assert.equal(v(def, run, 10 + 360).sessionElapsedSeconds, 60);
  assert.equal(v(def, run, 10 + 380).sessionElapsedSeconds, 80);
});

test('la reprise peut se faire avec un nouveau décompte de dix secondes', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 60);
  run = pause(run, T0 + s(10 + 60));
  run = resume(run, T0 + s(10 + 200), { withCountdown: true });

  assert.equal(run.status, 'countdown');
  assert.equal(v(def, run, 10 + 200).displaySeconds, COUNTDOWN_SECONDS);
  // Le décompte ne mange pas le temps de séance déjà accompli.
  assert.equal(v(def, run, 10 + 200).sessionElapsedSeconds, 60);

  run = at(def, run, 10 + 210);
  assert.equal(run.status, 'running');
  assert.equal(v(def, run, 10 + 210).sessionElapsedSeconds, 60);
  assert.equal(v(def, run, 10 + 230).sessionElapsedSeconds, 80);
});

test('l’état conservé pendant la pause contient tout ce qu’il faut pour reprendre', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130);
  run = validateRound(def, run, T0 + s(10 + 140));
  run = addRecovery(def, run, T0 + s(10 + 150), 30);
  run = pause(run, T0 + s(10 + 160));

  for (const champ of ['status', 'phaseIndex', 'phaseStartElapsedMs', 'pauseTotalMs', 'rounds', 'extraMs']) {
    assert.ok(champ in run, `champ manquant dans l’état : ${champ}`);
  }
  // Rien de dérivé n'est stocké : ni le temps restant, ni le bloc courant.
  for (const derive of ['remainingSeconds', 'currentBlock', 'elapsedSeconds']) {
    assert.ok(!(derive in run), `donnée dérivée stockée dans l’état : ${derive}`);
  }
});

// ── Navigation manuelle ─────────────────────────────────────────────────────

test('« exercice suivant » et « exercice précédent » déplacent la séance', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130); // première minute de l'EMOM
  assert.equal(v(def, run, 10 + 130).round, 1);

  run = nextPhase(def, run, T0 + s(10 + 130));
  assert.equal(v(def, run, 10 + 130).round, 2);
  assert.equal(v(def, run, 10 + 130).displaySeconds, 60, 'la phase suivante repart de sa durée pleine');

  run = previousPhase(def, run, T0 + s(10 + 135));
  assert.equal(v(def, run, 10 + 135).round, 1);

  // On ne recule pas avant le début ni n'avance après la fin.
  let debut = at(def, createRun(def, T0), 10);
  debut = previousPhase(def, debut, T0 + s(10));
  assert.equal(v(def, debut, 10).blockIndex, 0);
});

test('« terminer le bloc » saute à la fin du bloc, pas de la séance', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130);
  run = finishBlock(def, run, T0 + s(10 + 130));
  const w = v(def, run, 10 + 130);
  assert.equal(w.block.id, 'b-recup');
  assert.equal(w.status, 'running');
});

// ── Récupération ajoutée ────────────────────────────────────────────────────

test('ajouter 30 ou 60 secondes allonge la phase et la durée réelle', () => {
  const def = intervalles();
  let run = at(def, createRun(def, T0), 10 + 45); // en récupération, 15 s restantes
  assert.equal(v(def, run, 10 + 45).displaySeconds, 15);

  run = addRecovery(def, run, T0 + s(10 + 45), 30);
  assert.equal(v(def, run, 10 + 45).displaySeconds, 45);

  run = addRecovery(def, run, T0 + s(10 + 46), 60);
  assert.equal(v(def, run, 10 + 46).displaySeconds, 104);

  // La phase suivante commence 90 s plus tard qu'au programme.
  run = at(def, run, 10 + 155);
  assert.equal(v(def, run, 10 + 155).round, 2);

  const res = buildResult(def, run, {});
  assert.equal(res.addedRecoverySeconds, 90);
});

test('la récupération ajoutée compte dans la durée réelle du bilan', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 60);
  run = addRecovery(def, run, T0 + s(10 + 60), 60);
  run = at(def, run, 10 + 700);
  const res = buildResult(def, run, {});
  assert.equal(res.plannedDurationSeconds, 600);
  assert.equal(res.actualDurationSeconds, 660);
  assert.equal(res.addedRecoverySeconds, 60);
});

// ── Remplacement d'un exercice ──────────────────────────────────────────────

test('les remplacements proposés respectent matériel, contraintes et muscle visé', () => {
  const def = definition();
  const station = def.blocks[1].stations[0]; // Burpees

  const sansMateriel = substitutesFor({
    station, equipment: ['poids-du-corps'], zones: [], level: 'intermediaire',
  });
  assert.ok(sansMateriel.length > 0);
  for (const c of sansMateriel) {
    assert.notEqual(c.movementId, station.movementId, 'un exercice ne se remplace pas par lui-même');
    assert.ok(c.groups.length > 0);
  }

  // Avec des haltères en plus, il y a au moins autant de possibilités.
  const avecMateriel = substitutesFor({
    station, equipment: ['poids-du-corps', 'halteres', 'kettlebell'], zones: [], level: 'intermediaire',
  });
  assert.ok(avecMateriel.length >= sansMateriel.length);

  // Un genou douloureux exclut les remplacements qui le chargent.
  const menage = substitutesFor({
    station, equipment: ['poids-du-corps', 'halteres'], zones: ['genou'], level: 'intermediaire',
  });
  for (const c of menage) assert.ok(!c.zones.includes('genou'), `${c.name} charge le genou`);

  // Un débutant ne se voit pas proposer un mouvement technique.
  const debutant = substitutesFor({
    station, equipment: ['poids-du-corps', 'barre'], zones: [], level: 'debutant',
  });
  for (const c of debutant) assert.ok(c.skill === 1, `${c.name} est trop technique`);
});

test('remplacer un exercice ne change que la séance en cours', () => {
  const def = definition();
  const avant = JSON.stringify(def);
  let run = at(def, createRun(def, T0), 10 + 130);

  const candidat = substitutesFor({
    station: def.blocks[1].stations[0], equipment: ['poids-du-corps'], zones: [], level: 'intermediaire',
  })[0];

  run = substitute(def, run, { blockId: 'b-emom', stationId: 'st-3', to: candidat });

  const w = v(def, run, 10 + 130);
  assert.equal(w.station.name, candidat.name);
  assert.equal(w.station.substituted, true);
  assert.equal(JSON.stringify(def), avant, 'la définition ne doit pas être mutée');

  const res = buildResult(def, run, {});
  assert.equal(res.substitutions.length, 1);
  assert.equal(res.substitutions[0].fromName, 'Burpees');
  assert.equal(res.substitutions[0].toName, candidat.name);
});

// ── Douleur ─────────────────────────────────────────────────────────────────

test('signaler une douleur met en pause et se retrouve dans le bilan', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130);
  run = pause(run, T0 + s(10 + 130));
  run = reportPain(def, run, T0 + s(10 + 130), { zone: 'genou', intensity: 6 });

  assert.equal(run.status, 'paused');
  assert.equal(run.pains.length, 1);
  assert.equal(run.pains[0].zone, 'genou');
  assert.equal(run.pains[0].movementId, 'burpees', 'le mouvement en cours est retenu');

  const res = buildResult(def, run, {});
  assert.equal(res.pains.length, 1);
  // Aucun diagnostic : on enregistre ce qui a été dit, rien de plus.
  assert.ok(!JSON.stringify(res.pains).toLowerCase().includes('tendinite'));
});

// ── Fin et bilan ────────────────────────────────────────────────────────────

test('le bilan reprend le prévu, le réalisé et le résultat de chaque WOD', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130);
  run = validateRound(def, run, T0 + s(10 + 140));
  run = validateRound(def, run, T0 + s(10 + 200));
  run = at(def, run, 10 + 700);

  const res = buildResult(def, run, {
    rpe: 8, cardio: 7, muscular: 8, technique: 6, comment: 'jambes lourdes',
  });

  assert.equal(res.title, 'Séance de test');
  assert.equal(res.plannedDurationSeconds, 600);
  assert.equal(res.actualDurationSeconds, 600);
  assert.equal(res.status, 'finished');
  assert.equal(res.rpe, 8);
  assert.equal(res.comment, 'jambes lourdes');

  const emom = res.blocks.find((b) => b.id === 'b-emom');
  assert.equal(emom.format, 'emom');
  assert.equal(emom.rounds, 2);
  assert.equal(emom.score, '2 cycles terminés');

  assert.equal(res.blocks.length, def.blocks.length);
  assert.ok(res.completedWods >= 0);
  assert.ok(Array.isArray(res.skippedBlocks));
  assert.ok(res.finishedAt);
});

test('terminer volontairement une séance la marque comme abandonnée, pas comme finie', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130);
  run = abandon(def, run, T0 + s(10 + 130));
  assert.equal(run.status, 'abandoned');

  const res = buildResult(def, run, { rpe: 5 });
  assert.equal(res.status, 'abandoned');
  assert.equal(res.actualDurationSeconds, 130);
  // Les blocs jamais atteints sont comptés comme sautés, sans faux résultat.
  assert.ok(res.skippedBlocks.includes('b-amrap'));
  assert.equal(res.blocks.find((b) => b.id === 'b-amrap').reached, false);
});

test('terminer la séance manuellement au dernier bloc la marque comme finie', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 550);
  run = finish(def, run, T0 + s(10 + 550));
  assert.equal(run.status, 'finished');
  assert.equal(buildResult(def, run, {}).status, 'finished');
});

test('un état terminé n’avance plus, quoi qu’il arrive', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 700);
  assert.equal(run.status, 'finished');
  const gele = run;
  run = at(def, run, 10 + 5000);
  assert.equal(run.phaseIndex, gele.phaseIndex);
  assert.equal(v(def, run, 10 + 5000).sessionElapsedSeconds, 600);
  assert.equal(nextPhase(def, run, T0 + s(10 + 5000)).phaseIndex, gele.phaseIndex);
});

// ── Immuabilité ─────────────────────────────────────────────────────────────

test('aucune transition ne mute l’état reçu', () => {
  const def = definition();
  const run = at(def, createRun(def, T0), 10 + 130);
  const empreinte = JSON.stringify(run);

  const operations = [
    () => tick(def, run, T0 + s(400)),
    () => pause(run, T0 + s(200)),
    () => nextPhase(def, run, T0 + s(200)),
    () => previousPhase(def, run, T0 + s(200)),
    () => validateRound(def, run, T0 + s(200)),
    () => addRecovery(def, run, T0 + s(200), 30),
    () => finishBlock(def, run, T0 + s(200)),
    () => substitute(def, run, { blockId: 'b-emom', stationId: 'st-3', to: { movementId: 'pompes', name: 'Pompes', groups: [], zones: [], skill: 1 } }),
    () => reportPain(def, run, T0 + s(200), { zone: 'genou', intensity: 4 }),
    () => finish(def, run, T0 + s(200)),
    () => abandon(def, run, T0 + s(200)),
  ];
  for (const op of operations) {
    const suivant = op();
    assert.equal(JSON.stringify(run), empreinte, 'l’état d’entrée a été modifié');
    assert.notEqual(suivant, run, 'une transition doit rendre un nouvel objet');
  }

  const defEmpreinte = JSON.stringify(def);
  for (const op of operations) op();
  assert.equal(JSON.stringify(def), defEmpreinte, 'la définition a été modifiée');
});

test('l’état survit à un aller-retour par JSON — c’est ce que fait la sauvegarde', () => {
  const def = definition();
  let run = at(def, createRun(def, T0), 10 + 130);
  run = validateRound(def, run, T0 + s(10 + 140));
  run = addRecovery(def, run, T0 + s(10 + 150), 30);

  const restaure = JSON.parse(JSON.stringify(run));
  assert.deepEqual(restaure, run);
  assert.deepEqual(
    v(def, restaure, 10 + 160),
    v(def, run, 10 + 160),
  );
});

// ── Progression affichée ────────────────────────────────────────────────────

test('la vue porte tout ce que l’écran d’entraînement doit montrer', () => {
  const def = definition();
  const run = at(def, createRun(def, T0), 10 + 130);
  const w = v(def, run, 10 + 130);

  for (const champ of [
    'status', 'block', 'blockIndex', 'blocksTotal', 'phase', 'station', 'nextStation',
    'round', 'roundsTotal', 'displaySeconds', 'sessionElapsedSeconds',
    'sessionPlannedSeconds', 'progress', 'targetRpe', 'validatedRounds',
  ]) {
    assert.ok(champ in w, `champ manquant dans la vue : ${champ}`);
  }
  assert.ok(w.progress >= 0 && w.progress <= 1);
  assert.equal(w.sessionPlannedSeconds, 600);
  assert.equal(w.targetRpe.min, 7);
  assert.equal(w.blocksTotal, 4);
});
