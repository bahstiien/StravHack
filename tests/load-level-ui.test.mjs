import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const root = resolve(import.meta.dirname, '..');
const cache = join(root, '.cache');
mkdirSync(cache, { recursive: true });
const dir = mkdtempSync(join(cache, 'load-level-ui-'));
const outfile = join(dir, 'bundle.mjs');
const sourcefile = join(root, 'src/screens/SettingsScreen.jsx');
await build({
  absWorkingDir: root,
  stdin: { contents: readFileSync(sourcefile, 'utf8'), resolveDir: dirname(sourcefile), sourcefile, loader: 'jsx' },
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
  external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
});
const { default: SettingsScreen } = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
rmSync(dir, { recursive: true, force: true });

test('les réglages affichent un slider accessible gradué de 1 à 8', () => {
  const html = renderToStaticMarkup(createElement(SettingsScreen, {
    goals: [], onGoalsChange() {}, equipment: ['poids-du-corps'], onEquipmentChange() {},
    library: { equipment: [], exercises: [] }, longRunPace: 330,
    weeklyAvailability: {}, datedConstraints: [], loadLevel: 7, onLoadLevelChange() {},
  }));
  assert.match(html, /type="range"/);
  assert.match(html, /min="1"/);
  assert.match(html, /max="8"/);
  assert.match(html, /7 sur 8 — Bloc montagne/);
  assert.match(html, /FOOTINGS/);
  assert.match(html, /BLOC MONTAGNE/);
});

test('les réglages secondaires sont regroupés dans cinq sections repliées', () => {
  const html = renderToStaticMarkup(createElement(SettingsScreen, {
    goals: [{ id: 'g', name: 'Ultra', date: '2026-11-28', priority: 'A', distanceKm: 80, elevationGainM: 5000 }],
    onGoalsChange() {}, equipment: ['poids-du-corps', 'halteres'], onEquipmentChange() {},
    library: { equipment: [], exercises: [] }, longRunPace: 330,
    weeklyAvailability: {}, datedConstraints: [], loadLevel: 4, onLoadLevelChange() {}, checkinCount: 3,
  }));
  assert.equal((html.match(/<details/g) || []).length, 5);
  assert.equal((html.match(/<details open/g) || []).length, 0);
  for (const label of ['Objectifs', 'Disponibilités', 'Matériel PPG', 'Rappels', 'Données personnelles']) assert.match(html, new RegExp(label));
  assert.match(html, /1 course configurée/);
  assert.match(html, /3 points quotidiens enregistrés/);
});
