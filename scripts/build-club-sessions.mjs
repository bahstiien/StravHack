#!/usr/bin/env node

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../server/config.js';
import { parseClubSessionsMarkdown } from './lib/club-sessions.mjs';

const source = resolve(ROOT, 'CLUB_SESSIONS.md');
const dataOutput = resolve(ROOT, 'data/club-sessions.json');
const publicOutput = resolve(ROOT, 'public/club-sessions.json');
const parsed = parseClubSessionsMarkdown(readFileSync(source, 'utf8'));
const catalog = {
  _note: 'Généré automatiquement depuis CLUB_SESSIONS.md. Ne pas modifier ce JSON à la main.',
  _format: "sets contient n répétitions avec work/rec en secondes.",
  ...parsed,
};

writeFileSync(dataOutput, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
copyFileSync(dataOutput, publicOutput);
console.log(`${catalog.sessions.length} séance(s) club → ${publicOutput}`);

