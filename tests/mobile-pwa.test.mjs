import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('l application occupe directement le viewport sans simuler un appareil iOS', () => {
  const app = read('src/App.jsx');
  const css = read('src/app.css');

  assert.doesNotMatch(app, /import\s*\{[^}]*\bIOSDevice\b[^}]*\}/);
  assert.doesNotMatch(app, /<\/?IOSDevice\b/);

  const layout = `${app}\n${css}`;
  assert.match(
    layout,
    /(?:minHeight\s*:\s*['"]100dvh['"]|min-height\s*:\s*100dvh)/,
    'la racine de l app doit suivre la hauteur dynamique du viewport mobile',
  );
  assert.doesNotMatch(
    app,
    /alignItems\s*:\s*['"]center['"][\s\S]{0,100}justifyContent\s*:\s*['"]center['"]|justifyContent\s*:\s*['"]center['"][\s\S]{0,100}alignItems\s*:\s*['"]center['"]/,
    'la racine ne doit plus centrer un faux téléphone dans la page',
  );
});

test('le document déclare une expérience web installable en plein écran', () => {
  const html = read('index.html');

  assert.match(html, /<meta\s+name=["']viewport["']\s+content=["'][^"']*width=device-width[^"']*viewport-fit=cover[^"']*["']/i);
  assert.match(html, /<meta\s+name=["']theme-color["']\s+content=["']#[0-9a-f]{6}["']/i);
  assert.match(html, /<meta\s+name=["']mobile-web-app-capable["']\s+content=["']yes["']/i);
  assert.match(html, /<meta\s+name=["']apple-mobile-web-app-capable["']\s+content=["']yes["']/i);
  assert.match(html, /<link\s+rel=["']manifest["']\s+href=["']\/manifest\.webmanifest["']/i);
});

test('le manifeste PWA démarre en mode standalone avec les couleurs de l app', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));

  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.ok(manifest.icons.some((icon) => icon.src === '/app-icon.svg' && icon.sizes === 'any'));
  assert.match(manifest.name, /\S/);
  assert.match(manifest.short_name, /\S/);
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
});
