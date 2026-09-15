// Tests d'intégration : l'écran, pas seulement la logique.
//
// Il n'y a pas de DOM dans ce projet et on n'en installe pas un pour l'occasion.
// esbuild est déjà là (Vite en dépend), react-dom aussi : on compile le JSX, on
// rend l'écran en chaîne de caractères, et on vérifie ce qui doit y être. Ça ne
// remplace pas un clic — le parcours cliqué est vérifié dans le navigateur — mais
// ça attrape ce qui casse pour de vrai : un champ disparu, un intitulé anglais,
// un bouton qui promet une fonctionnalité inexistante.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import {
  DURATIONS, SESSION_TYPES, LEVELS, GOALS, WOD_EQUIPMENT,
  defaultWodParams, validateWodParams, generateWod, validateWodSession,
} from '../src/data/wod.js';

const racine = resolve(import.meta.dirname, '..');
const library = JSON.parse(
  await import('node:fs/promises').then((fs) => fs.readFile(join(racine, 'public/ppg-library.json'), 'utf8')),
);

// Le bundle doit rester DANS le projet : posé dans le dossier temporaire du
// système, il ne retrouverait pas `react` — la résolution ESM remonte depuis le
// fichier, pas depuis le répertoire de travail. `.cache/` est déjà ignoré par git.
const CACHE = join(racine, '.cache');

/** Compile un écran et ses dépendances en un module importable. */
async function compile(entry) {
  mkdirSync(CACHE, { recursive: true });
  const dir = mkdtempSync(join(CACHE, 'ui-'));
  const outfile = join(dir, 'bundle.mjs');
  await build({
    entryPoints: [join(racine, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    outfile,
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

const { default: WodGenerator } = await compile('src/screens/WodGenerator.jsx');
const { default: PpgScreen } = await compile('src/screens/PpgScreen.jsx');

const html = (el) => renderToStaticMarkup(el);
const texte = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

const generateur = (props = {}) => html(createElement(WodGenerator, {
  equipment: ['poids-du-corps', 'halteres', 'banc-step'],
  library,
  ...props,
}));

// ── Le formulaire ───────────────────────────────────────────────────────────

test('le formulaire propose les cinq durées et rien d’autre', () => {
  const t = texte(generateur());
  for (const d of DURATIONS) assert.ok(t.includes(`${d} MIN`), `${d} min manquant`);
  for (const d of [15, 25, 45, 90]) assert.ok(!t.includes(`${d} MIN`), `${d} min ne devrait pas être proposé`);
});

test('le formulaire propose tous les types, niveaux et objectifs', () => {
  const t = texte(generateur());
  for (const o of [...SESSION_TYPES, ...LEVELS, ...GOALS]) {
    assert.ok(t.includes(o.label.toUpperCase()), `${o.label} manquant`);
  }
});

test('la liste de matériel reprend celle de l’app et y ajoute celle du WOD', () => {
  const t = texte(generateur());
  assert.ok(t.includes('Poids du corps / aucun matériel'));
  // Le matériel déjà déclaré dans la bibliothèque PPG.
  for (const item of library.equipment) {
    if (item.id === 'poids-du-corps') continue;
    assert.ok(t.includes(item.label), `matériel de l’app manquant : ${item.label}`);
  }
  // Ce que le CrossFit et le HYROX ajoutent.
  for (const item of WOD_EQUIPMENT) {
    assert.ok(t.includes(item.label), `matériel WOD manquant : ${item.label}`);
  }
});

test('sans bibliothèque chargée, le formulaire tient quand même debout', () => {
  const t = texte(generateur({ library: null, equipment: undefined }));
  assert.ok(t.includes('Poids du corps / aucun matériel'));
  assert.ok(t.includes('GÉNÉRER MA SÉANCE'));
});

test('les trois champs de contraintes sont là, et facultatifs', () => {
  const markup = generateur();
  const t = texte(markup);
  assert.ok(t.includes('CONTRAINTES (FACULTATIF)'));
  assert.ok(t.includes('DOULEURS'));
  assert.ok(t.includes('BLESSURES'));
  assert.ok(t.includes('MOUVEMENTS OU ZONES À ÉVITER'));
  assert.ok(!markup.includes('required'), 'aucune contrainte ne doit être obligatoire');
});

test('le bouton principal porte le libellé attendu et l’état d’attente est prévu', () => {
  const markup = generateur();
  assert.ok(texte(markup).includes('GÉNÉRER MA SÉANCE'));
  assert.ok(markup.includes('type="submit"'));
  assert.ok(markup.includes('role="status"'), 'l’état de chargement doit être annoncé');
});

test('l’écran est navigable au clavier et annoncé aux lecteurs d’écran', () => {
  const markup = generateur();
  assert.ok(markup.includes('role="radiogroup"'));
  assert.ok(markup.includes('role="radio"'));
  assert.ok(markup.includes('role="checkbox"'));
  assert.ok(markup.includes('aria-checked'));
  // Tout ce qui se clique est un vrai bouton : focusable sans rien ajouter.
  const cliquables = markup.match(/role="(radio|checkbox)"/g)?.length ?? 0;
  const boutons = markup.match(/<button/g)?.length ?? 0;
  assert.ok(boutons >= cliquables, 'un contrôle cliquable qui n’est pas un <button> n’est pas atteignable au clavier');
});

test('toute l’interface est en français', () => {
  const t = texte(generateur());
  for (const anglais of ['Generate', 'Duration', 'Equipment', 'Level', 'Goal', 'Submit', 'Loading']) {
    assert.ok(!t.includes(anglais), `mot anglais dans l’interface : ${anglais}`);
  }
  assert.ok(t.includes('DURÉE TOTALE'));
  assert.ok(t.includes('MATÉRIEL DISPONIBLE'));
});

test('aucune action qui n’existe pas n’est proposée', () => {
  // L'app n'a ni enregistrement de séance ni chronomètre : promettre l'un des
  // deux serait un bouton mort.
  const t = texte(generateur()).toLowerCase();
  for (const faux of ['enregistrer la séance', 'démarrer la séance', 'lancer le chrono']) {
    assert.ok(!t.includes(faux), `bouton sans fonction : ${faux}`);
  }
});

// ── L'onglet PPG ────────────────────────────────────────────────────────────

const ppg = () => html(createElement(PpgScreen, {
  snapshot: { exercises: [] },
  library,
  equipment: ['poids-du-corps', 'halteres', 'banc-step'],
  onOpenExercise: () => {},
}));

test('l’onglet PPG offre les deux modes et ouvre sur la bibliothèque', () => {
  const markup = ppg();
  const t = texte(markup);
  assert.ok(t.includes('BIBLIOTHÈQUE'));
  assert.ok(t.includes('GÉNÉRATEUR'));
  assert.ok(markup.includes('role="tablist"'));
  assert.ok(markup.includes('aria-selected="true"'));
  // Mode par défaut : la bibliothèque existante, intacte.
  assert.ok(t.includes('Renforcement'), 'le titre de la bibliothèque doit rester');
  // Le champ de recherche vit dans un attribut, pas dans le texte rendu.
  assert.ok(markup.includes('aria-label="Chercher un exercice"'), 'la recherche de la bibliothèque doit rester');
  assert.ok(!t.includes('GÉNÉRER MA SÉANCE'), 'le générateur ne doit pas s’ouvrir par défaut');
});

test('la bibliothèque existante affiche toujours ses exercices et ses filtres', () => {
  const t = texte(ppg());
  for (const f of ['FORCE', 'EXCENTRIQUE', 'GAINAGE', 'PLIOMÉTRIE', 'MOBILITÉ']) {
    assert.ok(t.includes(f), `filtre disparu : ${f}`);
  }
  assert.ok(/\d+ EXERCICES?/.test(t), 'le compteur d’exercices doit rester');
});

// ── Le parcours principal ───────────────────────────────────────────────────
//
// La même suite d'appels que l'écran, dans le même ordre : ouvrir l'onglet,
// régler les paramètres, générer, régénérer, revenir au formulaire.

test('parcours : régler, générer, régénérer', () => {
  // 1. L'écran s'ouvre sur le matériel déjà coché dans Réglages.
  let params = defaultWodParams(['poids-du-corps', 'halteres', 'banc-step']);
  assert.ok(params.equipment.includes('halteres'));

  // 2. On règle la séance.
  params = { ...params, durationMin: 50, type: 'hyrox', level: 'avance', goal: 'endurance' };
  params = { ...params, equipment: [...params.equipment, 'rameur', 'sled', 'espace-course'] };

  // 3. « Générer ma séance ».
  const check = validateWodParams(params);
  assert.equal(check.ok, true);
  const premier = generateWod(params);
  assert.equal(premier.ok, true);
  assert.equal(premier.session.durationMin, 50);
  assert.equal(premier.session.totalMin, 50);
  assert.equal(validateWodSession(premier.session, 50).ok, true);
  assert.ok(premier.session.durationCheck.endsWith('= 50 min'));

  // 4. « Régénérer » : mêmes paramètres, autre séance.
  const second = generateWod({ ...params, seed: params.seed + 1 });
  assert.equal(second.ok, true);
  assert.equal(second.session.totalMin, 50);
  assert.notDeepEqual(
    second.session.blocks.flatMap((b) => b.movements.map((m) => m.id)),
    premier.session.blocks.flatMap((b) => b.movements.map((m) => m.id)),
  );

  // 5. « Modifier les paramètres » puis passage en sans matériel.
  const sansMateriel = generateWod({ ...params, equipment: ['poids-du-corps'], seed: 3 });
  assert.equal(sansMateriel.ok, true);
  assert.deepEqual(sansMateriel.session.equipmentIds, ['poids-du-corps']);
});

test('parcours : un paramètre invalide arrête la génération avant qu’elle commence', () => {
  const params = { ...defaultWodParams(), durationMin: 35 };
  const check = validateWodParams(params);
  assert.equal(check.ok, false);
  assert.ok(check.errors.durationMin.includes('20, 30, 40, 50, 60'));

  // Et si on force le passage, le générateur refuse aussi.
  const res = generateWod(params);
  assert.equal(res.ok, false);
  assert.ok(res.errors.durationMin);
});

test('parcours : des contraintes trop larges donnent un message, pas un écran vide', () => {
  const res = generateWod({
    ...defaultWodParams(),
    equipment: ['poids-du-corps'],
    constraints: { pain: 'genou, cheville, hanche, épaule, poignet, coude, dos, nuque', injuries: '', avoid: '' },
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, 'pool-vide');
  assert.ok(/matériel|contrainte/i.test(res.error));
});
