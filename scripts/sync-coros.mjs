#!/usr/bin/env node
// Fetch everything from Coros once and write it to public/coros-snapshot.json.
//
// This is the offline path: with a snapshot on disk the app shows real data
// with `npm run dev` alone, no bridge process running. Useful for a demo, for
// working on a train, and for inspecting exactly what Coros returned.
//
//   npm run sync:coros
//   npm run sync:coros -- --days 90 --out public/coros-snapshot.json

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { CorosClient } from '../server/coros/client.js';
import { buildSnapshot } from '../server/snapshot.js';
import { loadConfig, isConfigured, ROOT } from '../server/config.js';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const out = resolve(ROOT, arg('out', 'public/coros-snapshot.json'));
const days = Number(arg('days', ''));

const config = loadConfig();
if (!isConfigured(config)) {
  console.error('Coros MCP non configuré.');
  console.error('Renseigne "url" (ou "command") dans coros.config.json, ou exporte COROS_MCP_URL.');
  process.exit(1);
}

const coros = new CorosClient(config);

try {
  await coros.connect();
  const d = coros.describe();
  console.log(`Connecté à ${d.target} (${d.transport}) — ${d.toolCount} outils.`);
  for (const [cap, tool] of Object.entries(d.resolved)) {
    console.log(`  ${tool ? '✓' : '✗'} ${cap.padEnd(15)} ${tool || '(aucun outil correspondant)'}`);
  }

  const snapshot = await buildSnapshot(coros, {
    lookbackDays: Number.isFinite(days) && days > 0 ? days : config.lookbackDays,
  });
  snapshot.meta.source = 'coros-snapshot';

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log(`\n${snapshot.activities.length} activités, ${snapshot.sessions.length} séances → ${out}`);
  if (snapshot.meta.degraded) console.log(`Partiel : ${snapshot.meta.degraded}`);
} catch (err) {
  console.error(`Échec : ${err.message}`);
  process.exitCode = 1;
} finally {
  await coros.close();
}
