// Tests d'intégration du lecteur de séance, et parcours utilisateur complet.
//
// L'écran est rendu en chaîne de caractères avec react-dom/server : pas de
// clics, mais chaque état du lecteur peut être rendu directement en lui passant
// l'état d'exécution qui lui correspond — préparation, entraînement, pause,
// bilan. C'est justement ce que permet un moteur séparé de l'interface.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import { generateWod } from '../src/data/wod.js';
import { fromWodSession } from '../src/data/workout-plan.js';
import {
  createRun, tick, pause, validateRound, addRecovery, substitute, finish, abandon,
  view, buildResult,
} from '../src/data/workout-engine.js';
import {
  saveRun, loadRun, clearRun, saveResult, loadHistory, memoryStorage,
} from '../src/data/workout-store.js';
import { substitutesFor } from '../src/data/workout-plan.js';
import { signalForPhase } from '../src/lib/signals.js';

const racine = resolve(import.meta.dirname, '..');
const CACHE = join(racine, '.cache');

async function compile(entry) {
  mkdirSync(CACHE, { recursive: true });
  const dir = mkdtempSync(join(CACHE, 'ui-'));
  const outfile = join(dir, 'bundle.mjs');
  await build({
    entryPoints: [join(racine, entry)],
    bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
    external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

const { default: GuidedSession } = await compile('src/screens/GuidedSession.jsx');

const texte = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const seance = (over = {}) => {
  const res = generateWod({
    durationMin: 40, type: 'crossfit', level: 'intermediaire', goal: 'conditionnement',
    equipment: ['poids-du-corps', 'halteres', 'kettlebell', 'corde-a-sauter'],
    constraints: { pain: '', injuries: '', avoid: '' }, seed: 5, ...over,
  });
  assert.equal(res.ok, true);
  return fromWodSession(res.session);
};

/** Rend le lecteur dans l'état demandé. */
const ecran = (definition, resumeState = null) => renderToStaticMarkup(
  createElement(GuidedSession, { definition, resumeState, onClose: () => {} }),
);

/** Un état d'exécution ancré sur l'heure réelle, pour que la vue ait du sens. */
function enCours(definition, secondesEcoulees) {
  const depart = Date.now() - (secondesEcoulees + 10) * 1000;
  return tick(definition, createRun(definition, depart), Date.now());
}

// ── Écran de préparation ────────────────────────────────────────────────────

test('l’écran de préparation montre tout ce qu’il faut savoir avant de partir', () => {
  const def = seance();
  const t = texte(ecran(def));

  assert.ok(t.includes(def.title), 'le nom de la séance');
  assert.ok(t.includes(def.typeLabel), 'le type de séance');
  assert.ok(t.includes(`${Math.round(def.plannedDurationSeconds / 60)} min`), 'la durée totale');
  assert.ok(t.includes(`RPE ${def.targetRpe.min}–${def.targetRpe.max}`), 'l’intensité cible');
  assert.ok(t.includes('MATÉRIEL NÉCESSAIRE'), 'le matériel');
  assert.ok(t.includes('LES BLOCS'), 'les blocs');
  for (const b of def.blocks) assert.ok(t.includes(b.name), `bloc manquant : ${b.name}`);
  assert.ok(t.includes('SÉCURITÉ'), 'les consignes de sécurité');
  assert.ok(t.includes('COMMENCER'), 'le bouton principal');
  assert.ok(t.includes('10 secondes'), 'l’annonce du décompte');
});

test('le son se coupe, et rien ne promet un fonctionnement écran verrouillé', () => {
  const markup = ecran(seance());
  assert.ok(markup.includes('role="switch"'), 'l’option « sons » doit être un interrupteur');
  const t = texte(markup);
  assert.ok(t.includes('Signaux sonores'));
  assert.ok(/veille|premier plan/i.test(t), 'la limite doit être dite, pas cachée');
  assert.ok(!/arrière-plan garanti|même écran verrouillé/i.test(t));
});

// ── Écran d'entraînement ────────────────────────────────────────────────────

test('l’écran d’entraînement met en avant le chronomètre et l’exercice', () => {
  const def = seance();
  const markup = ecran(def, enCours(def, 400));
  const t = texte(markup);

  assert.ok(/\d\d:\d\d/.test(t), 'le chronomètre');
  assert.ok(markup.includes('role="timer"'), 'le chronomètre doit être annoncé comme tel');
  // Le chronomètre est le plus gros élément de la page.
  const tailles = [...markup.matchAll(/800 (\d+)px/g)].map((m) => Number(m[1]));
  assert.equal(Math.max(...tailles), 76, 'le chronomètre doit rester le plus gros élément');

  assert.ok(t.includes('SÉANCE'), 'la progression dans la séance');
  assert.ok(t.includes('RPE CIBLE'), 'l’intensité cible');
  assert.ok(/Prochain|PROCHAIN/.test(t), 'l’exercice suivant');
});

test('les commandes sont exactement celles prévues — et aucune ne suggère d’en faire moins', () => {
  const def = seance();
  const t = texte(ecran(def, enCours(def, 400)));

  for (const attendue of [
    'PAUSE', 'PRÉCÉDENT', 'SUIVANT', '+ 30 S RÉCUP', '+ 60 S RÉCUP',
    'REMPLACER', 'TERMINER LE BLOC', 'SIGNALER UNE DOULEUR',
  ]) {
    assert.ok(t.includes(attendue), `commande manquante : ${attendue}`);
  }

  // L'application ne propose jamais spontanément d'en faire moins.
  for (const interdite of [
    'réduire l’intensité', 'réduire l’intensite', 'baisser la charge',
    'moins de répétitions', 'alléger', 'diminuer la difficulté',
  ]) {
    assert.ok(!t.toLowerCase().includes(interdite), `bouton interdit : ${interdite}`);
  }
});

test('les commandes sont de vrais boutons, atteignables au clavier', () => {
  const def = seance();
  const markup = ecran(def, enCours(def, 400));
  const boutons = markup.match(/<button/g)?.length ?? 0;
  assert.ok(boutons >= 9, `${boutons} boutons seulement`);
  // Rien de cliquable qui ne soit pas un bouton.
  assert.ok(!/<div[^>]*onclick/i.test(markup));
  assert.ok(markup.includes('aria-label'), 'les icônes doivent porter un libellé');
});

test('le décompte de départ occupe l’écran avant le premier exercice', () => {
  const def = seance();
  const run = createRun(def, Date.now());
  const t = texte(ecran(def, run));
  assert.ok(t.includes('DÉPART DANS'));
  assert.ok(t.includes('Mets-toi en place'));
  assert.ok(/00:(09|10)/.test(t), `décompte absent : ${t.slice(0, 200)}`);
});

test('la pause affiche ce qui est conservé, et les deux façons de reprendre', () => {
  const def = seance();
  const t = texte(ecran(def, pause(enCours(def, 400), Date.now())));

  assert.ok(t.includes('SÉANCE EN PAUSE'));
  assert.ok(t.includes('REPRENDRE MAINTENANT'));
  assert.ok(t.includes('REPRENDRE AVEC UN DÉCOMPTE DE 10 S'));
  assert.ok(t.includes('TERMINER LA SÉANCE'));
  assert.ok(/temps écoulé/.test(t) && /remplacements/.test(t));
});

// ── Bilan ───────────────────────────────────────────────────────────────────

test('le bilan compare le prévu au réalisé et demande les ressentis', () => {
  const def = seance();
  let run = enCours(def, 400);
  run = validateRound(def, run, Date.now());
  run = addRecovery(def, run, Date.now(), 60);
  run = abandon(def, run, Date.now());

  const t = texte(ecran(def, run));
  assert.ok(t.includes('SÉANCE ARRÊTÉE'));
  assert.ok(t.includes('PRÉVU') && t.includes('RÉALISÉ'));
  assert.ok(t.includes('WOD terminés'.toUpperCase()));
  assert.ok(t.includes('RÉCUPÉRATION AJOUTÉE'));
  assert.ok(t.includes('BLOCS NON ABORDÉS'));

  for (const question of ['RPE GÉNÉRAL', 'DIFFICULTÉ CARDIO', 'DIFFICULTÉ MUSCULAIRE', 'QUALITÉ TECHNIQUE', 'COMMENTAIRE']) {
    assert.ok(t.includes(question), `question manquante : ${question}`);
  }
  assert.ok(t.includes('ENREGISTRER LE BILAN'), 'l’enregistrement existe réellement');
});

test('une séance terminée normalement le dit', () => {
  const def = seance();
  const run = finish(def, enCours(def, 2350), Date.now());
  assert.ok(texte(ecran(def, run)).includes('SÉANCE TERMINÉE'));
});

test('une définition incohérente ne lance pas de chronomètre', () => {
  const def = seance();
  const cassee = { ...def, blocks: def.blocks.map((b, i) => (i ? b : { ...b, durationSeconds: 999 })) };
  const t = texte(ecran(cassee));
  assert.ok(t.includes('SÉANCE INVALIDE'));
  assert.ok(!t.includes('COMMENCER'));
});

// ── Langue ──────────────────────────────────────────────────────────────────

test('tout le lecteur est en français', () => {
  const def = seance();
  for (const markup of [ecran(def), ecran(def, enCours(def, 400)), ecran(def, abandon(def, enCours(def, 400), Date.now()))]) {
    const t = texte(markup);
    for (const anglais of ['Start', 'Pause the', 'Next exercise', 'Round', 'Rest', 'Finish', 'Summary', 'Save']) {
      assert.ok(!t.includes(anglais), `mot anglais : ${anglais}`);
    }
  }
});

// ── Signaux ─────────────────────────────────────────────────────────────────

test('chaque type de phase a son signal, et le décompte n’en a pas', () => {
  assert.equal(signalForPhase({ kind: 'travail' }), 'depart');
  assert.equal(signalForPhase({ kind: 'recuperation' }), 'recuperation');
  assert.equal(signalForPhase({ kind: 'liste' }), 'depart');
  assert.equal(signalForPhase({ kind: 'decompte' }), null);
  assert.equal(signalForPhase({ kind: 'travail' }, { isLast: true }), 'finSeance');
  assert.equal(signalForPhase(null), null);
});

// ── Parcours utilisateur principal ──────────────────────────────────────────

test('parcours : générer, démarrer, dérouler, être interrompu, reprendre, finir', () => {
  const storage = memoryStorage();
  const T = 1_700_000_000_000;
  const s = (n) => T + n * 1000;

  // 1. Une séance générée devient une séance lançable.
  const def = seance({ durationMin: 40 });
  assert.equal(def.plannedDurationSeconds, 2400);

  // 2. « Démarrer la séance » : décompte de 10 s.
  let run = createRun(def, s(0));
  assert.equal(run.status, 'countdown');
  assert.equal(view(def, run, s(3)).displaySeconds, 7);

  // 3. Le premier bloc démarre seul.
  run = tick(def, run, s(10));
  assert.equal(view(def, run, s(10)).status, 'running');
  assert.equal(view(def, run, s(10)).blockIndex, 0);

  // 4. On déroule jusque dans le premier WOD et on valide des tours.
  run = tick(def, run, s(10 + 500));
  const dansLeWod = view(def, run, s(10 + 500));
  assert.equal(dansLeWod.block.kind, 'wod');
  run = validateRound(def, run, s(10 + 520));
  run = validateRound(def, run, s(10 + 560));
  assert.equal(view(def, run, s(10 + 560)).validatedRounds, 2);

  // 5. Un exercice fait mal : on le remplace pour cette séance.
  const station = view(def, run, s(10 + 560)).station ?? def.blocks[1].stations[0];
  const candidat = substitutesFor({
    station, equipment: def.equipmentIds, zones: [], level: def.level,
  })[0];
  if (candidat) {
    run = substitute(def, run, { blockId: view(def, run, s(10 + 560)).block.id, stationId: station.id, to: candidat });
    assert.equal(run.substitutions.length, 1);
  }

  // 6. On ajoute de la récupération.
  run = addRecovery(def, run, s(10 + 600), 60);
  assert.equal(view(def, run, s(10 + 600)).addedRecoverySeconds, 60);

  // 7. Le téléphone se ferme : l'état est sur le disque.
  run = pause(run, s(10 + 620));
  assert.equal(saveRun({ definition: def, state: run, now: s(10 + 620) }, storage).ok, true);

  // 8. Retour dans l'application : la reprise est proposée, et elle est fidèle.
  const relu = loadRun(storage, s(10 + 4000));
  assert.ok(relu, 'la séance interrompue devrait être proposée');
  assert.deepEqual(relu.state, run);
  assert.equal(view(relu.definition, relu.state, s(10 + 4000)).sessionElapsedSeconds, 620);

  // 9. On reprend et on va au bout — le temps ajouté est dans la durée réelle.
  let reprise = { ...relu.state, status: 'running', suspendedAt: null };
  reprise = tick(def, reprise, s(10 + 620 + 2400));
  assert.equal(reprise.status, 'finished');

  // 10. Le bilan est enregistré dans l'historique local.
  const bilan = buildResult(def, reprise, { rpe: 8, cardio: 7, muscular: 8, technique: 6, comment: 'ok' });
  assert.equal(bilan.plannedDurationSeconds, 2400);
  assert.equal(bilan.actualDurationSeconds, 2460, 'les 60 s ajoutées doivent compter');
  assert.equal(bilan.rpe, 8);
  assert.ok(bilan.blocks.some((b) => b.rounds === 2));

  assert.equal(saveResult(bilan, storage).ok, true);
  assert.equal(loadHistory(storage)[0].id, bilan.id);

  // 11. La séance en cours est oubliée : on ne propose plus de la reprendre.
  clearRun(storage);
  assert.equal(loadRun(storage, s(10 + 5000)), null);
});
