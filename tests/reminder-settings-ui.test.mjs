import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = resolve(import.meta.dirname, '..');

async function compile(entry) {
  const cache = join(root, '.cache');
  mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(join(cache, 'reminder-settings-ui-'));
  const outfile = join(dir, 'bundle.mjs');
  const sourcefile = join(root, entry);
  await build({
    absWorkingDir: root,
    stdin: {
      contents: readFileSync(sourcefile, 'utf8'), resolveDir: dirname(sourcefile),
      sourcefile, loader: 'jsx',
    },
    bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', outfile,
    external: ['react', 'react-dom', 'react/jsx-runtime'], logLevel: 'silent',
  });
  const module = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
  rmSync(dir, { recursive: true, force: true });
  return module;
}

const { default: ReminderSettings, updateReminderPreferences } = await compile('src/components/ReminderSettings.jsx');

const preferences = {
  enabled: true,
  preferredTime: '07:30',
  beforeSessionMinutes: 60,
  dailyCheckin: true,
  planningAlerts: true,
  recoveryAlerts: false,
  goalReminders: true,
  quietDays: ['dim'],
};

const render = (props = {}) => renderToStaticMarkup(createElement(ReminderSettings, {
  preferences, onChange() {}, saving: false, error: '', ...props,
}));

test('la mise à jour des préférences reste immuable', () => {
  const next = updateReminderPreferences(preferences, 'planningAlerts', false);
  assert.notEqual(next, preferences);
  assert.equal(next.planningAlerts, false);
  assert.equal(preferences.planningAlerts, true);

  const days = updateReminderPreferences(preferences, 'quietDays', ['sam', 'dim']);
  assert.notEqual(days.quietDays, preferences.quietDays);
  assert.deepEqual(days.quietDays, ['sam', 'dim']);
});

test('les réglages présentent tous les rappels en français avec des contrôles accessibles', () => {
  const markup = render();
  for (const label of [
    'Activer les rappels', 'Heure préférée', 'Rappel avant la séance',
    'Questionnaire quotidien', 'Alertes de planning', 'Alertes de récupération',
    'Rappels liés aux objectifs', 'Jours silencieux',
  ]) assert.ok(markup.includes(label), `${label} absent`);
  assert.match(markup, /type="time"/);
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /aria-label="Dimanche, jour silencieux"/);
});

test('la désactivation générale rend les réglages secondaires indisponibles', () => {
  const markup = render({ preferences: { ...preferences, enabled: false } });
  assert.match(markup, /aria-disabled="true"/);
  assert.match(markup, /disabled=""/);
});

test('les états de synchronisation et erreur sont annoncés', () => {
  assert.match(render({ saving: true }), /role="status"[^>]*>Enregistrement/);
  assert.match(render({ error: 'Connexion impossible' }), /role="alert"[^>]*>Connexion impossible/);
});
